import {
  CalloutKind,
  ListItemNode,
  MarkdownBlock,
  OutlineHeading,
  TableAlignment,
} from '../types/editor';

let blockIdSeed = 1;
export function nextBlockId(prefix = 'blk'): string {
  return `${prefix}_${Date.now().toString(36)}_${(blockIdSeed++).toString(36)}`;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseTableAlignments(delimiterRow: string, count: number): TableAlignment[] {
  const cells = delimiterRow
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

  const result: TableAlignment[] = [];
  for (let i = 0; i < count; i++) {
    const cell = cells[i] || '';
    if (cell.startsWith(':') && cell.endsWith(':')) {
      result.push('center');
    } else if (cell.endsWith(':')) {
      result.push('right');
    } else {
      result.push('left');
    }
  }
  return result;
}

function splitTableRow(row: string, expectedCols?: number): string[] {
  const cells = row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
  if (expectedCols !== undefined) {
    while (cells.length < expectedCols) cells.push('');
    return cells.slice(0, expectedCols);
  }
  return cells;
}

export function parseMarkdownToBlocks(markdown: string): MarkdownBlock[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  // 1. YAML Front Matter at top of document
  if (lines[0]?.trim() === '---') {
    let endYaml = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---' || lines[j].trim() === '...') {
        endYaml = j;
        break;
      }
    }
    if (endYaml !== -1) {
      blocks.push({
        id: nextBlockId('yaml'),
        type: 'yaml',
        raw: lines.slice(1, endYaml).join('\n'),
      });
      i = endYaml + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty blank lines between blocks
    if (trimmed === '') {
      i++;
      continue;
    }

    // 2. [TOC]
    if (/^\[toc\]$/i.test(trimmed)) {
      blocks.push({
        id: nextBlockId('toc'),
        type: 'toc',
      });
      i++;
      continue;
    }

    // 3. Horizontal Rule
    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push({
        id: nextBlockId('hr'),
        type: 'hr',
      });
      i++;
      continue;
    }

    // 4. Headings H1..H6
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2].trim();
      blocks.push({
        id: nextBlockId('h'),
        type: 'heading',
        level,
        text,
        slug: slugifyHeading(text),
      });
      i++;
      continue;
    }

    // 5. Code Fences ```lang
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const fenceChars = fenceMatch[1];
      const language = fenceMatch[2].trim() || 'plaintext';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fenceChars)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({
        id: nextBlockId('code'),
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 6. Math Block $$ ... $$
    if (trimmed.startsWith('$$')) {
      if (trimmed.endsWith('$$') && trimmed.length > 4) {
        blocks.push({
          id: nextBlockId('math'),
          type: 'math',
          latex: trimmed.slice(2, -2).trim(),
        });
        i++;
        continue;
      }
      const mathLines: string[] = [];
      const firstLineRemainder = trimmed.slice(2).trim();
      if (firstLineRemainder) mathLines.push(firstLineRemainder);
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const closingLine = lines[i].trim().slice(0, -2).trim();
        if (closingLine) mathLines.push(closingLine);
        i++;
      }
      blocks.push({
        id: nextBlockId('math'),
        type: 'math',
        latex: mathLines.join('\n'),
      });
      continue;
    }

    // 7. Standalone Image ![alt](src "title") or HTML <img src="..." style="zoom:50%;" />
    const mdImgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{zoom=(\d+)%\})?$/);
    if (mdImgMatch) {
      blocks.push({
        id: nextBlockId('img'),
        type: 'image',
        alt: mdImgMatch[1] || '',
        src: mdImgMatch[2],
        title: mdImgMatch[3],
        zoom: mdImgMatch[4] ? Number(mdImgMatch[4]) : 100,
      });
      i++;
      continue;
    }

    const htmlImgMatch = trimmed.match(/^<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>$/i);
    if (htmlImgMatch) {
      const altMatch = trimmed.match(/alt=["']([^"']*)["']/i);
      const zoomMatch = trimmed.match(/zoom:\s*(\d+)%/i);
      blocks.push({
        id: nextBlockId('img'),
        type: 'image',
        alt: altMatch ? altMatch[1] : '',
        src: htmlImgMatch[1],
        zoom: zoomMatch ? Number(zoomMatch[1]) : 100,
      });
      i++;
      continue;
    }

    // 8. Footnote Definition [^1]: content
    const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
    if (footnoteDefMatch) {
      blocks.push({
        id: nextBlockId('fn'),
        type: 'footnote-def',
        label: footnoteDefMatch[1],
        content: footnoteDefMatch[2],
      });
      i++;
      continue;
    }

    // 9. GitHub Alerts / Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) or Blockquotes
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const firstLine = quoteLines[0] || '';
      const calloutMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (calloutMatch) {
        const kind = calloutMatch[1].toUpperCase() as CalloutKind;
        const customTitle = calloutMatch[2].trim();
        const body = quoteLines.slice(1).join('\n').trim();
        blocks.push({
          id: nextBlockId('callout'),
          type: 'callout',
          calloutType: kind,
          title: customTitle || kind,
          content: body,
        });
      } else {
        blocks.push({
          id: nextBlockId('quote'),
          type: 'blockquote',
          text: quoteLines.join('\n'),
        });
      }
      continue;
    }

    // 10. Markdown Extra Tables
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[i + 1])
    ) {
      const headers = splitTableRow(lines[i]);
      const alignments = parseTableAlignments(lines[i + 1], headers.length);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i], headers.length));
        i++;
      }
      blocks.push({
        id: nextBlockId('tbl'),
        type: 'table',
        headers,
        alignments,
        rows: rows.length > 0 ? rows : [headers.map(() => '')],
      });
      continue;
    }

    // 11. Lists (Task List, Bullet List, Ordered List)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const items: ListItemNode[] = [];
      let detectedType: 'bullet' | 'ordered' | 'task' = /\d+\./.test(listMatch[2]) ? 'ordered' : 'bullet';

      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        const indent = Math.floor(m[1].length / 2);
        const rawItemText = m[3];
        const taskMatch = rawItemText.match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          detectedType = 'task';
          items.push({
            id: nextBlockId('li'),
            indent,
            checked: taskMatch[1].toLowerCase() === 'x',
            text: taskMatch[2],
          });
        } else {
          items.push({
            id: nextBlockId('li'),
            indent,
            text: rawItemText,
          });
        }
        i++;
      }

      blocks.push({
        id: nextBlockId('list'),
        type: 'list',
        listType: detectedType,
        items,
      });
      continue;
    }

    // 12. Paragraph (coalesce consecutive plain lines)
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s+|`{3,}|~{3,}|\$\$|>|\s*[-*+]\s+|\s*\d+\.\s+|\[toc\]$|---|\*\*\*|___|\[\^[^\]]+\]:)/i.test(
        lines[i].trim()
      ) &&
      !(
        lines[i].includes('|') &&
        i + 1 < lines.length &&
        /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push({
      id: nextBlockId('p'),
      type: 'paragraph',
      text: paraLines.join('\n'),
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      id: nextBlockId('p'),
      type: 'paragraph',
      text: '',
    });
  }

  return blocks;
}

export function serializeBlocksToMarkdown(blocks: MarkdownBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'yaml':
        parts.push(`---\n${block.raw}\n---`);
        break;

      case 'heading':
        parts.push(`${'#'.repeat(block.level)} ${block.text}`);
        break;

      case 'paragraph':
        parts.push(block.text);
        break;

      case 'code':
        parts.push(`\`\`\`${block.language || ''}\n${block.code}\n\`\`\``);
        break;

      case 'math':
        parts.push(`$$\n${block.latex}\n$$`);
        break;

      case 'toc':
        parts.push(`[TOC]`);
        break;

      case 'hr':
        parts.push(`---`);
        break;

      case 'image':
        if (block.zoom && block.zoom !== 100) {
          parts.push(
            `<img src="${block.src}" alt="${block.alt}" style="zoom:${block.zoom}%;" />`
          );
        } else if (block.title) {
          parts.push(`![${block.alt}](${block.src} "${block.title}")`);
        } else {
          parts.push(`![${block.alt}](${block.src})`);
        }
        break;

      case 'footnote-def':
        parts.push(`[^${block.label}]: ${block.content}`);
        break;

      case 'blockquote':
        parts.push(
          block.text
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        );
        break;

      case 'callout': {
        const titleSuffix =
          block.title && block.title.toUpperCase() !== block.calloutType ? ` ${block.title}` : '';
        const bodyLines = block.content
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n');
        parts.push(`> [!${block.calloutType}]${titleSuffix}\n${bodyLines}`);
        break;
      }

      case 'list': {
        const lines = block.items.map((item, idx) => {
          const pad = '  '.repeat(item.indent || 0);
          if (block.listType === 'task') {
            return `${pad}- [${item.checked ? 'x' : ' '}] ${item.text}`;
          }
          if (block.listType === 'ordered') {
            return `${pad}${idx + 1}. ${item.text}`;
          }
          return `${pad}- ${item.text}`;
        });
        parts.push(lines.join('\n'));
        break;
      }

      case 'table': {
        const headerLine = `| ${block.headers.join(' | ')} |`;
        const alignLine = `| ${block.alignments
          .map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : ':---'))
          .join(' | ')} |`;
        const rowLines = block.rows.map((r) => `| ${r.join(' | ')} |`);
        parts.push([headerLine, alignLine, ...rowLines].join('\n'));
        break;
      }
    }
  }

  return parts.join('\n\n') + '\n';
}

export function extractOutlineHeadings(blocks: MarkdownBlock[]): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      headings.push({
        id: `outline_${b.id}`,
        blockId: b.id,
        level: b.level,
        text: b.text || 'Untitled Section',
        slug: slugifyHeading(b.text || 'section'),
      });
    }
  }
  return headings;
}

export function parseYamlFrontMatterSettings(blocks: MarkdownBlock[]): Record<string, string> {
  const yamlBlock = blocks.find((b) => b.type === 'yaml');
  if (!yamlBlock || yamlBlock.type !== 'yaml') return {};

  const map: Record<string, string> = {};
  for (const line of yamlBlock.raw.split('\n')) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (m) {
      map[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return map;
}
