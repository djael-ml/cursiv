import mermaid from 'mermaid';

let mermaidInitialized = false;

export function ensureMermaidInit() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'neutral',
    fontFamily: 'var(--font-body)',
  });
  mermaidInitialized = true;
}

export async function renderMermaidSvg(code: string, idPrefix: string): Promise<{ svg: string; error?: string }> {
  ensureMermaidInit();
  try {
    const validId = `mermaid_${idPrefix.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const { svg } = await mermaid.render(validId, code.trim());
    return { svg };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { svg: '', error: message };
  }
}

interface FlowNode {
  id: string;
  kind: 'start' | 'end' | 'operation' | 'condition' | 'inputoutput' | 'subroutine';
  label: string;
}

interface FlowEdge {
  from: string;
  to: string;
  branch?: string;
}

/**
 * Native SVG Flowchart.js (` ```flow `) parser & vector renderer.
 * Supports standard Flowchart.js syntax:
 *   st=>start: Start
 *   op=>operation: Process Data
 *   cond=>condition: Valid?
 *   e=>end: End
 *   st->op->cond
 *   cond(yes)->e
 *   cond(no)->op
 */
export function renderFlowchartSvg(code: string): { svg: string; error?: string } {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//'));

  if (lines.length === 0) {
    return { svg: '', error: 'Empty flowchart definition.' };
  }

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  for (const line of lines) {
    const defMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=>\s*(start|end|operation|condition|inputoutput|subroutine)\s*:\s*(.+)$/);
    if (defMatch) {
      const [, id, kindRaw, labelRaw] = defMatch;
      const cleanLabel = labelRaw.split('|')[0].split(':>')[0].trim();
      nodes.set(id, {
        id,
        kind: kindRaw as FlowNode['kind'],
        label: cleanLabel,
      });
      continue;
    }

    if (line.includes('->')) {
      const segments = line.split('->').map((s) => s.trim());
      for (let i = 0; i < segments.length - 1; i++) {
        const rawFrom = segments[i];
        const rawTo = segments[i + 1].replace(/\([^)]+\)$/, '').trim();
        const branchMatch = rawFrom.match(/^([a-zA-Z0-9_-]+)\(([^)]+)\)$/);
        const fromId = branchMatch ? branchMatch[1] : rawFrom.replace(/\([^)]+\)$/, '').trim();
        const branch = branchMatch ? branchMatch[2] : undefined;

        if (!nodes.has(fromId)) {
          return { svg: '', error: `Undefined flowchart node "${fromId}" in transition "${line}".` };
        }
        if (!nodes.has(rawTo)) {
          return { svg: '', error: `Undefined flowchart target node "${rawTo}" in transition "${line}".` };
        }
        edges.push({ from: fromId, to: rawTo, branch });
      }
      continue;
    }

    return { svg: '', error: `Syntax error in flowchart line: "${line}"` };
  }

  if (nodes.size === 0) {
    return { svg: '', error: 'No flowchart nodes defined (expected e.g. st=>start: Begin).' };
  }

  // Assign coordinates cleanly in vertical flow with side branches
  const nodeOrder = Array.from(nodes.values());
  const positions = new Map<string, { x: number; y: number }>();

  const centerX = 280;
  const stepY = 105;
  let currentY = 55;

  nodeOrder.forEach((node, idx) => {
    positions.set(node.id, { x: centerX, y: currentY + idx * stepY });
  });

  const width = 580;
  const height = Math.max(180, currentY + nodeOrder.length * stepY + 20);

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const edgeSvg = edges
    .map((edge) => {
      const p1 = positions.get(edge.from)!;
      const p2 = positions.get(edge.to)!;

      // Back-edge or branch to earlier node curves around the right side
      if (p2.y <= p1.y) {
        const rightX = centerX + 175;
        const path = `M ${p1.x + 85} ${p1.y} L ${rightX} ${p1.y} L ${rightX} ${p2.y} L ${p2.x + 85} ${p2.y}`;
        const labelHtml = edge.branch
          ? `<text x="${p1.x + 115}" y="${p1.y - 8}" font-size="11" fill="var(--meta-content-color)">${escapeXml(edge.branch)}</text>`
          : '';
        return `<path d="${path}" fill="none" stroke="var(--text-color)" stroke-width="1.6" marker-end="url(#flow-arrow)" />${labelHtml}`;
      }

      const startY = p1.y + 26;
      const endY = p2.y - 28;
      const midY = (startY + endY) / 2;
      const labelHtml = edge.branch
        ? `<rect x="${p1.x - 24}" y="${midY - 10}" width="48" height="18" rx="4" fill="var(--bg-color)" /><text x="${p1.x}" y="${midY + 3}" text-anchor="middle" font-size="11" fill="var(--meta-content-color)">${escapeXml(edge.branch)}</text>`
        : '';
      return `<line x1="${p1.x}" y1="${startY}" x2="${p2.x}" y2="${endY}" stroke="var(--text-color)" stroke-width="1.6" marker-end="url(#flow-arrow)" />${labelHtml}`;
    })
    .join('\n');

  const nodeSvg = nodeOrder
    .map((node) => {
      const pos = positions.get(node.id)!;
      const label = escapeXml(node.label);

      if (node.kind === 'start' || node.kind === 'end') {
        return `
          <g transform="translate(${pos.x}, ${pos.y})">
            <rect x="-75" y="-22" width="150" height="44" rx="22" fill="var(--bg-color)" stroke="var(--primary-color)" stroke-width="2" />
            <text x="0" y="5" text-anchor="middle" font-size="13" font-weight="600" fill="var(--text-color)">${label}</text>
          </g>`;
      }
      if (node.kind === 'condition') {
        return `
          <g transform="translate(${pos.x}, ${pos.y})">
            <polygon points="0,-30 92,0 0,30 -92,0" fill="var(--bg-color)" stroke="var(--primary-color)" stroke-width="1.8" />
            <text x="0" y="4" text-anchor="middle" font-size="12.5" font-weight="500" fill="var(--text-color)">${label}</text>
          </g>`;
      }
      if (node.kind === 'inputoutput') {
        return `
          <g transform="translate(${pos.x}, ${pos.y})">
            <polygon points="-75,-22 88,-22 75,22 -88,22" fill="var(--code-bg-color)" stroke="var(--text-color)" stroke-width="1.6" />
            <text x="0" y="5" text-anchor="middle" font-size="13" fill="var(--text-color)">${label}</text>
          </g>`;
      }
      if (node.kind === 'subroutine') {
        return `
          <g transform="translate(${pos.x}, ${pos.y})">
            <rect x="-85" y="-22" width="170" height="44" rx="4" fill="var(--code-bg-color)" stroke="var(--text-color)" stroke-width="1.6" />
            <line x1="-75" y1="-22" x2="-75" y2="22" stroke="var(--text-color)" stroke-width="1.4" />
            <line x1="75" y1="-22" x2="75" y2="22" stroke="var(--text-color)" stroke-width="1.4" />
            <text x="0" y="5" text-anchor="middle" font-size="13" fill="var(--text-color)">${label}</text>
          </g>`;
      }
      return `
        <g transform="translate(${pos.x}, ${pos.y})">
          <rect x="-85" y="-22" width="170" height="44" rx="6" fill="var(--code-bg-color)" stroke="var(--text-color)" stroke-width="1.6" />
          <text x="0" y="5" text-anchor="middle" font-size="13" fill="var(--text-color)">${label}</text>
        </g>`;
    })
    .join('\n');

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" style="max-width: ${width}px; margin: 0 auto; display: block; font-family: var(--font-body);">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--text-color)" />
        </marker>
      </defs>
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;

  return { svg };
}

interface SeqMessage {
  type: 'message' | 'note';
  from: string;
  to: string;
  dashed: boolean;
  openArrow: boolean;
  text: string;
  notePlacement?: 'left of' | 'right of' | 'over';
}

/**
 * Native SVG Sequence Diagram (` ```sequence `) parser & vector renderer.
 * Supports `simple` and `hand` themes via `--sequence-theme` CSS variable or explicit option.
 */
export function renderSequenceSvg(
  code: string,
  sequenceTheme: 'simple' | 'hand' = 'simple'
): { svg: string; error?: string } {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length === 0) {
    return { svg: '', error: 'Empty sequence diagram.' };
  }

  let title = '';
  const participants: string[] = [];
  const items: SeqMessage[] = [];

  const ensureParticipant = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !participants.includes(trimmed)) {
      participants.push(trimmed);
    }
  };

  for (const line of lines) {
    if (/^Title\s*:/i.test(line)) {
      title = line.replace(/^Title\s*:\s*/i, '').trim();
      continue;
    }
    if (/^participant\s+/i.test(line)) {
      const pName = line.replace(/^participant\s+/i, '').trim();
      ensureParticipant(pName);
      continue;
    }

    const noteMatch = line.match(/^Note\s+(left of|right of|over)\s+([^:]+):\s*(.+)$/i);
    if (noteMatch) {
      const placement = noteMatch[1].toLowerCase() as 'left of' | 'right of' | 'over';
      const actor = noteMatch[2].split(',')[0].trim();
      ensureParticipant(actor);
      items.push({
        type: 'note',
        from: actor,
        to: actor,
        dashed: false,
        openArrow: false,
        text: noteMatch[3].trim(),
        notePlacement: placement,
      });
      continue;
    }

    const msgMatch = line.match(/^([^-:]+?)\s*(--?>?>?)\s*([^-:]+?)\s*:\s*(.*)$/);
    if (msgMatch) {
      const [, fromRaw, arrow, toRaw, text] = msgMatch;
      const from = fromRaw.trim();
      const to = toRaw.trim();
      ensureParticipant(from);
      ensureParticipant(to);
      items.push({
        type: 'message',
        from,
        to,
        dashed: arrow.startsWith('--'),
        openArrow: arrow.endsWith('>>'),
        text: text.trim(),
      });
      continue;
    }

    return { svg: '', error: `Unrecognized sequence syntax: "${line}"` };
  }

  if (participants.length === 0) {
    return { svg: '', error: 'No participants found in sequence diagram.' };
  }

  const isHand = sequenceTheme === 'hand';
  const colSpacing = 175;
  const startX = 95;
  const topY = title ? 65 : 35;
  const rowHeight = 56;
  const totalHeight = topY + 60 + items.length * rowHeight + 65;
  const totalWidth = Math.max(380, startX * 2 + (participants.length - 1) * colSpacing);

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const actorX = (name: string) => startX + participants.indexOf(name) * colSpacing;

  const wobbleRect = (x: number, y: number, w: number, h: number, fill: string) => {
    if (!isHand) {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="var(--text-color)" stroke-width="1.6" />`;
    }
    const d = `M ${x} ${y + 1} Q ${x + w / 2} ${y - 2} ${x + w} ${y + 1} Q ${x + w + 2} ${y + h / 2} ${x + w - 1} ${y + h} Q ${x + w / 2} ${y + h + 2} ${x + 1} ${y + h - 1} Q ${x - 2} ${y + h / 2} ${x} ${y + 1}`;
    return `<path d="${d}" fill="${fill}" stroke="var(--text-color)" stroke-width="1.7" />`;
  };

  const wobbleLine = (x1: number, y1: number, x2: number, y2: number, dashed: boolean, marker?: string) => {
    const dashAttr = dashed ? `stroke-dasharray="6,4"` : '';
    const markerAttr = marker ? `marker-end="url(#${marker})"` : '';
    if (!isHand) {
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--text-color)" stroke-width="1.6" ${dashAttr} ${markerAttr} />`;
    }
    const mx = (x1 + x2) / 2 + (y1 === y2 ? 0 : 2);
    const my = (y1 + y2) / 2 + (x1 === x2 ? 0 : -2.5);
    return `<path d="M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" fill="none" stroke="var(--text-color)" stroke-width="1.7" ${dashAttr} ${markerAttr} />`;
  };

  const titleSvg = title
    ? `<text x="${totalWidth / 2}" y="28" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-color)">${escapeXml(title)}</text>`
    : '';

  const lifelinesSvg = participants
    .map((p) => {
      const cx = actorX(p);
      const topBoxY = topY;
      const bottomBoxY = totalHeight - 52;
      const lineTop = topBoxY + 38;
      const lineBottom = bottomBoxY;

      return `
        ${wobbleLine(cx, lineTop, cx, lineBottom, true)}
        ${wobbleRect(cx - 58, topBoxY, 116, 38, 'var(--code-bg-color)')}
        <text x="${cx}" y="${topBoxY + 24}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--text-color)">${escapeXml(p)}</text>
        ${wobbleRect(cx - 58, bottomBoxY, 116, 38, 'var(--code-bg-color)')}
        <text x="${cx}" y="${bottomBoxY + 24}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--text-color)">${escapeXml(p)}</text>
      `;
    })
    .join('\n');

  const messagesSvg = items
    .map((item, idx) => {
      const y = topY + 75 + idx * rowHeight;
      if (item.type === 'note') {
        const cx = actorX(item.from);
        const noteW = 135;
        const noteX =
          item.notePlacement === 'left of'
            ? cx - noteW - 16
            : item.notePlacement === 'right of'
            ? cx + 16
            : cx - noteW / 2;
        return `
          ${wobbleRect(noteX, y - 18, noteW, 34, 'var(--highlight-bg)')}
          <text x="${noteX + noteW / 2}" y="${y + 3}" text-anchor="middle" font-size="12" fill="var(--text-color)">${escapeXml(item.text)}</text>
        `;
      }

      const x1 = actorX(item.from);
      const x2 = actorX(item.to);
      const markerId = item.openArrow ? 'seq-arrow-open' : 'seq-arrow-filled';

      if (x1 === x2) {
        // Self-message loop
        const path = `M ${x1} ${y - 8} L ${x1 + 42} ${y - 8} L ${x1 + 42} ${y + 14} L ${x1 + 4} ${y + 14}`;
        return `
          <path d="${path}" fill="none" stroke="var(--text-color)" stroke-width="1.5" marker-end="url(#${markerId})" />
          <text x="${x1 + 48}" y="${y + 6}" font-size="12" fill="var(--text-color)">${escapeXml(item.text)}</text>
        `;
      }

      const midX = (x1 + x2) / 2;
      return `
        ${wobbleLine(x1, y, x2, y, item.dashed, markerId)}
        <text x="${midX}" y="${y - 8}" text-anchor="middle" font-size="12.5" fill="var(--text-color)">${escapeXml(item.text)}</text>
      `;
    })
    .join('\n');

  const fontStyle = isHand ? 'font-family: "Comic Sans MS", "Bradley Hand", cursive, var(--font-body);' : 'font-family: var(--font-body);';

  const svg = `
    <svg viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg" style="max-width: ${totalWidth}px; margin: 0 auto; display: block; ${fontStyle}">
      <defs>
        <marker id="seq-arrow-filled" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--text-color)" />
        </marker>
        <marker id="seq-arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="var(--text-color)" stroke-width="1.8" />
        </marker>
      </defs>
      ${titleSvg}
      ${lifelinesSvg}
      ${messagesSvg}
    </svg>
  `;

  return { svg };
}
