import katex from 'katex';

/**
 * Built-in Physics, AMSmath, and mhchem (\ce{...}) pre-processor for KaTeX.
 * Supports custom \def and \newcommand definitions across the document as well as
 * \label{...}, \ref{...}, \tag{...}, and equation auto-numbering.
 */

export interface MathEnvironmentContext {
  macros: Record<string, string>;
  labels: Record<string, number>;
  equationNumbers: Record<string, number>;
}

const DEFAULT_PHYSICS_MACROS: Record<string, string> = {
  '\\dd': '\\,\\mathrm{d}',
  '\\dv': '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
  '\\pdv': '\\frac{\\partial #1}{\\partial #2}',
  '\\bra': '\\langle #1 |',
  '\\ket': '| #1 \\rangle',
  '\\braket': '\\langle #1 | #2 \\rangle',
  '\\ketbra': '| #1 \\rangle\\langle #2 |',
  '\\expval': '\\langle #1 \\rangle',
  '\\norm': '\\left\\| #1 \\right\\|',
  '\\abs': '\\left| #1 \\right|',
  '\\vb': '\\mathbf{#1}',
  '\\va': '\\vec{\\mathbf{#1}}',
  '\\vu': '\\hat{\\mathbf{#1}}',
  '\\grad': '\\nabla',
  '\\div': '\\nabla\\cdot',
  '\\curl': '\\nabla\\times',
  '\\laplacian': '\\nabla^2',
  '\\Re': '\\operatorname{Re}',
  '\\Im': '\\operatorname{Im}',
  '\\Tr': '\\operatorname{Tr}',
  '\\rank': '\\operatorname{rank}',
  '\\erf': '\\operatorname{erf}',
};

/**
 * Converts mhchem `\ce{...}` expressions into standard LaTeX math notation
 * so chemical equations like `\ce{CH4 + 2O2 -> CO2 + 2H2O}` or `\ce{SO4^2-}` render natively.
 */
export function expandMhchemFormula(formula: string): string {
  return formula.replace(/\\ce\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_match, inner: string) => {
    let s = inner.trim();

    // Reaction arrows
    s = s.replace(/<-->|<=>/g, ' \\rightleftharpoons ');
    s = s.replace(/<->/g, ' \\leftrightarrow ');
    s = s.replace(/->/g, ' \\longrightarrow ');
    s = s.replace(/<-/g, ' \\longleftarrow ');

    // States of matter
    s = s.replace(/\(s\)/g, '_{\\text{(s)}}');
    s = s.replace(/\(l\)/g, '_{\\text{(l)}}');
    s = s.replace(/\(g\)/g, '_{\\text{(g)}}');
    s = s.replace(/\(aq\)/g, '_{\\text{(aq)}}');

    // Ion charges such as ^2-, ^3+, ^+, ^-
    s = s.replace(/\^(\d+[+-])/g, '^{$1}');
    s = s.replace(/\s+([+-])(?=\s|$)/g, ' + ');

    // Chemical element subscripts (e.g., H2O -> \mathrm{H}_{2}\mathrm{O}, CH4 -> \mathrm{C}\mathrm{H}_{4})
    s = s.replace(/([A-Z][a-z]?)(\d+)/g, '\\mathrm{$1}_{$2}');
    s = s.replace(/\b([A-Z][a-z]?)\b/g, '\\mathrm{$1}');

    return `{\\mathrm{${s}}}`;
  });
}

/**
 * Extracts global `\def\foo{...}` and `\newcommand{\foo}[n]{...}` from all math blocks
 * and builds the cross-reference table for `\label{id}` and equation numbers.
 */
export function buildMathEnvironment(
  mathBlocks: Array<{ id: string; latex: string }>,
  numberingMode: 'off' | 'ams' | 'all'
): MathEnvironmentContext {
  const macros: Record<string, string> = { ...DEFAULT_PHYSICS_MACROS };
  const labels: Record<string, number> = {};
  const equationNumbers: Record<string, number> = {};

  let counter = 1;

  for (const block of mathBlocks) {
    const raw = block.latex;

    // Extract \newcommand{\cmd}{replacement} or \newcommand{\cmd}[args]{replacement}
    const newCmdRegex = /\\newcommand\{\\([a-zA-Z]+)\}(?:\[\d+\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = newCmdRegex.exec(raw)) !== null) {
      macros[`\\${match[1]}`] = match[2];
    }

    // Extract \def\cmd{replacement}
    const defRegex = /\\def\\([a-zA-Z]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    while ((match = defRegex.exec(raw)) !== null) {
      macros[`\\${match[1]}`] = match[2];
    }

    // Determine whether this equation gets a number
    const hasTag = /\\tag\{([^}]+)\}/.test(raw);
    const hasNoNumber = /\\nonumber|\\notag/.test(raw);
    const isAmsNumbered = /\\begin\{(equation|align|gather|multline)\}/.test(raw) || /\\label\{/.test(raw);

    let shouldNumber = false;
    if (!hasTag && !hasNoNumber) {
      if (numberingMode === 'all') {
        shouldNumber = true;
      } else if (numberingMode === 'ams' && isAmsNumbered) {
        shouldNumber = true;
      }
    }

    if (shouldNumber) {
      equationNumbers[block.id] = counter;
      const labelMatch = raw.match(/\\label\{([^}]+)\}/);
      if (labelMatch) {
        labels[labelMatch[1].trim()] = counter;
      }
      counter++;
    } else {
      const labelMatch = raw.match(/\\label\{([^}]+)\}/);
      if (labelMatch) {
        labels[labelMatch[1].trim()] = counter;
      }
    }
  }

  return { macros, labels, equationNumbers };
}

export function renderLatexToHtml(
  latex: string,
  displayMode: boolean,
  env: MathEnvironmentContext,
  blockId?: string
): { html: string; error?: string } {
  try {
    let processed = expandMhchemFormula(latex);

    // Strip standalone \newcommand and \def lines so KaTeX doesn't output blank spacing
    processed = processed
      .replace(/\\newcommand\{\\[a-zA-Z]+\}(?:\[\d+\])?\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
      .replace(/\\def\\[a-zA-Z]+\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

    // Resolve \ref{label} and \eqref{label}
    processed = processed.replace(/\\eqref\{([^}]+)\}/g, (_m, lbl: string) => {
      const num = env.labels[lbl.trim()];
      return num !== undefined ? `\\text{(${num})}` : `\\text{(??)}`;
    });
    processed = processed.replace(/\\ref\{([^}]+)\}/g, (_m, lbl: string) => {
      const num = env.labels[lbl.trim()];
      return num !== undefined ? `\\text{${num}}` : `\\text{??}`;
    });

    // Remove \label{...} after recording it
    processed = processed.replace(/\\label\{[^}]+\}/g, '');

    // Inject automatic tag if equation numbering is active for this block
    if (
      displayMode &&
      blockId &&
      env.equationNumbers[blockId] !== undefined &&
      !/\\tag\{/.test(processed)
    ) {
      processed = `${processed} \\tag{${env.equationNumbers[blockId]}}`;
    }

    const html = katex.renderToString(processed.trim() || '\\,', {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: false,
      macros: { ...env.macros },
    });

    return { html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      html: '',
      error: message.replace(/^KaTeX parse error:\s*/i, ''),
    };
  }
}
