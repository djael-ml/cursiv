import { toPng } from 'html-to-image';
import { CursivPreferences, LastExportConfig, MarkdownBlock } from '../types/editor';
import { extractOutlineHeadings, parseYamlFrontMatterSettings, serializeBlocksToMarkdown } from './markdownParser';
import { BUILTIN_THEMES } from './themeManager';
import { isTauriEnvironment, runPandocExport, writeTextFile } from './tauriBridge';

const LAST_EXPORT_STORAGE_KEY = 'cursiv_last_export_config';

export function getLastExportConfig(): LastExportConfig | null {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLastExportConfig(cfg: LastExportConfig): void {
  try {
    localStorage.setItem(LAST_EXPORT_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

function triggerBrowserDownload(filename: string, content: string | Blob, mimeType = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates standalone HTML from the current WYSIWYM sheet DOM, including
 * optional embedded CSS theme variables and hierarchical PDF/HTML bookmarks.
 */
export function buildExportHtmlDocument(params: {
  title: string;
  sheetElement: HTMLElement | null;
  blocks: MarkdownBlock[];
  preferences: CursivPreferences;
  embedStyles: boolean;
}): string {
  const { title, sheetElement, blocks, preferences, embedStyles } = params;
  const yamlOverrides = parseYamlFrontMatterSettings(blocks);
  const finalTitle = yamlOverrides.title || title || 'Document Cursiv';
  const outline = extractOutlineHeadings(blocks);

  const themeId = yamlOverrides.theme || preferences.theme;
  const themeCss =
    preferences.customThemesCss[themeId] ||
    BUILTIN_THEMES[themeId as keyof typeof BUILTIN_THEMES]?.css ||
    BUILTIN_THEMES.github.css;

  const clone = sheetElement ? (sheetElement.cloneNode(true) as HTMLElement) : null;
  if (clone) {
    clone.querySelectorAll('.no-export, .md-token-marker').forEach((el) => el.remove());
  }

  const bodyHtml = clone ? clone.innerHTML : '<p>Empty document</p>';

  const bookmarksNav =
    outline.length > 0
      ? `<nav aria-label="Document Bookmarks" style="display:none;" data-pdf-bookmarks="true">
          <ul>
            ${outline
              .map(
                (h) =>
                  `<li data-level="${h.level}"><a href="#${h.slug}">${h.text.replace(/</g, '&lt;')}</a></li>`
              )
              .join('\n')}
          </ul>
        </nav>`
      : '';

  const styleBlock = embedStyles
    ? `<style>
        ${themeCss}
        body {
          background-color: var(--bg-color, #ffffff);
          color: var(--text-color, #24292f);
          font-family: var(--font-body, sans-serif);
          line-height: 1.75;
          max-width: 820px;
          margin: 2.5rem auto;
          padding: 0 2rem;
        }
        pre, code {
          font-family: var(--font-mono, monospace);
          background-color: var(--code-bg-color, #f6f8fa);
          border-radius: 6px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.25rem 0;
        }
        th, td {
          border: 1px solid var(--border-color, #d0d7de);
          padding: 0.55rem 0.85rem;
        }
        blockquote {
          border-left: 4px solid var(--blockquote-border, #d0d7de);
          padding-left: 1rem;
          color: var(--blockquote-text, #57606a);
        }
        img {
          max-width: 100%;
          height: auto;
        }
      </style>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${finalTitle}</title>
  ${ embedStyles ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />' : '' }
  ${styleBlock}
</head>
<body>
  ${bookmarksNav}
  <main class="cursiv-exported-document">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

export async function executeDocumentExport(params: {
  format: LastExportConfig['format'];
  docTitle: string;
  blocks: MarkdownBlock[];
  sheetElement: HTMLElement | null;
  preferences: CursivPreferences;
  targetPathOverride?: string;
}): Promise<string> {
  const { format, docTitle, blocks, sheetElement, preferences, targetPathOverride } = params;
  const yamlOverrides = parseYamlFrontMatterSettings(blocks);
  const effectiveFormat = format || (yamlOverrides.export_format as LastExportConfig['format']) || 'pdf';
  const cleanStem = (yamlOverrides.title || docTitle || 'Document').replace(/\.(md|markdown)$/i, '');

  saveLastExportConfig({
    format: effectiveFormat,
    targetPath: targetPathOverride,
    timestamp: Date.now(),
  });

  if (effectiveFormat === 'pdf') {
    window.print();
    return `${cleanStem}.pdf (Impression PDF native avec signets)`;
  }

  if (effectiveFormat === 'html' || effectiveFormat === 'html-plain') {
    const html = buildExportHtmlDocument({
      title: cleanStem,
      sheetElement,
      blocks,
      preferences,
      embedStyles: effectiveFormat === 'html',
    });
    const outName = `${cleanStem}.html`;
    if (isTauriEnvironment() && targetPathOverride) {
      await writeTextFile(targetPathOverride, html);
      return targetPathOverride;
    }
    triggerBrowserDownload(outName, html, 'text/html;charset=utf-8');
    return outName;
  }

  if (effectiveFormat === 'png') {
    if (!sheetElement) throw new Error('Editor sheet element not found for PNG export.');
    const bgColor =
      getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#ffffff';
    const dataUrl = await toPng(sheetElement, {
      backgroundColor: bgColor,
      pixelRatio: 2,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('no-export')),
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${cleanStem}.png`;
    a.click();
    return `${cleanStem}.png`;
  }

  // Pandoc formats: docx, odt, latex, epub, mediawiki, rtf, rst
  const markdownContent = serializeBlocksToMarkdown(blocks);
  const extMap: Record<string, { ext: string; pandocTo: string }> = {
    docx: { ext: 'docx', pandocTo: 'docx' },
    odt: { ext: 'odt', pandocTo: 'odt' },
    latex: { ext: 'tex', pandocTo: 'latex' },
    epub: { ext: 'epub', pandocTo: 'epub' },
    mediawiki: { ext: 'wiki', pandocTo: 'mediawiki' },
    rtf: { ext: 'rtf', pandocTo: 'rtf' },
    rst: { ext: 'rst', pandocTo: 'rst' },
  };

  const targetMeta = extMap[effectiveFormat] || { ext: effectiveFormat, pandocTo: effectiveFormat };
  const outputPath = targetPathOverride || `${cleanStem}.${targetMeta.ext}`;

  const extraArgs: string[] = [];
  if (yamlOverrides.pandoc_args) {
    extraArgs.push(...yamlOverrides.pandoc_args.split(/\s+/).filter(Boolean));
  }

  if (isTauriEnvironment()) {
    return runPandocExport({
      markdownContent,
      outputPath,
      format: targetMeta.pandocTo,
      customPandocPath: preferences.pandocPath,
      extraArgs,
    });
  } else {
    // Graceful fallback in browser mode: download converted source bundle
    triggerBrowserDownload(`${cleanStem}.${targetMeta.ext}.md`, markdownContent);
    return `${cleanStem}.${targetMeta.ext} (Source préparée pour Pandoc)`;
  }
}
