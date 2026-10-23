import { MarkdownBlock } from '../types/editor';
import { slugifyHeading } from './markdownParser';

/**
 * Find & Replace engine operating on the Markdown block model (Cursiv — Djaël Mola).
 * Occurrences are counted in a stable field order per block so that the N-th match
 * highlighted in the rendered page maps to the N-th match in the block source.
 */

interface ReplaceState {
  seen: number;
  target: number | null; // null = replace all
  replaced: number;
}

function replaceInString(
  input: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
  state: ReplaceState
): string {
  if (!query || !input) return input;
  const hay = caseSensitive ? input : input.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let out = '';
  let cursor = 0;
  let idx = hay.indexOf(needle, cursor);
  while (idx !== -1) {
    const shouldReplace = state.target === null || state.seen === state.target;
    out += input.slice(cursor, idx) + (shouldReplace ? replacement : input.slice(idx, idx + query.length));
    if (shouldReplace) state.replaced++;
    state.seen++;
    cursor = idx + query.length;
    idx = hay.indexOf(needle, cursor);
  }
  return out + input.slice(cursor);
}

function mapBlockStrings(block: MarkdownBlock, fn: (s: string) => string): MarkdownBlock {
  switch (block.type) {
    case 'heading': {
      const text = fn(block.text);
      return { ...block, text, slug: slugifyHeading(text) };
    }
    case 'paragraph':
    case 'blockquote':
      return { ...block, text: fn(block.text) };
    case 'code':
      return { ...block, code: fn(block.code) };
    case 'math':
      return { ...block, latex: fn(block.latex) };
    case 'yaml':
      return { ...block, raw: fn(block.raw) };
    case 'table':
      return {
        ...block,
        headers: block.headers.map(fn),
        rows: block.rows.map((row) => row.map(fn)),
      };
    case 'list':
      return { ...block, items: block.items.map((it) => ({ ...it, text: fn(it.text) })) };
    case 'callout':
      return { ...block, title: fn(block.title), content: fn(block.content) };
    case 'image':
      return { ...block, alt: fn(block.alt) };
    case 'footnote-def':
      return { ...block, content: fn(block.content) };
    default:
      return block;
  }
}

/** Replaces the `indexInBlock`-th occurrence inside the given block. */
export function replaceOccurrenceInBlocks(
  blocks: MarkdownBlock[],
  blockId: string,
  indexInBlock: number,
  query: string,
  replacement: string,
  caseSensitive: boolean
): { blocks: MarkdownBlock[]; replaced: number } {
  let replaced = 0;
  const next = blocks.map((b) => {
    if (b.id !== blockId) return b;
    const state: ReplaceState = { seen: 0, target: indexInBlock, replaced: 0 };
    const updated = mapBlockStrings(b, (s) => replaceInString(s, query, replacement, caseSensitive, state));
    replaced = state.replaced;
    return state.replaced > 0 ? updated : b;
  });
  return { blocks: replaced > 0 ? next : blocks, replaced };
}

/** Replaces every occurrence across the whole document. */
export function replaceAllInBlocks(
  blocks: MarkdownBlock[],
  query: string,
  replacement: string,
  caseSensitive: boolean
): { blocks: MarkdownBlock[]; replaced: number } {
  let total = 0;
  const next = blocks.map((b) => {
    const state: ReplaceState = { seen: 0, target: null, replaced: 0 };
    const updated = mapBlockStrings(b, (s) => replaceInString(s, query, replacement, caseSensitive, state));
    total += state.replaced;
    return state.replaced > 0 ? updated : b;
  });
  return { blocks: total > 0 ? next : blocks, replaced: total };
}
