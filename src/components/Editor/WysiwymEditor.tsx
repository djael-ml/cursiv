import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckSquare,
  Flame,
  GripVertical,
  Info,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Square,
} from 'lucide-react';
import {
  CalloutKind,
  CursivPreferences,
  MarkdownBlock,
  OutlineHeading,
} from '../../types/editor';
import { buildMathEnvironment } from '../../utils/mathEngine';
import {
  extractOutlineHeadings,
  nextBlockId,
  parseMarkdownToBlocks,
  serializeBlocksToMarkdown,
  slugifyHeading,
} from '../../utils/markdownParser';
import { EmojiEntry, searchEmojis } from '../../utils/emojiDictionary';
import { copyImageToLocalAssets } from '../../utils/tauriBridge';
import { LiveInlineTokens } from './LiveInlineTokens';
import { InlinePageInput } from './InlinePageInput';
import { ContextMenu, ContextMenuState } from './ContextMenu';
import {
  filterSlashCommands,
  SlashCommandItem,
  SlashCommandMenu,
} from './SlashCommandMenu';
import { CodeFenceBlock } from './CodeFenceBlock';
import { InteractiveTableBlock } from './InteractiveTableBlock';
import { MathBlock } from './MathBlock';
import { ImageBlock } from './ImageBlock';
import { FloatingToolbar } from './FloatingToolbar';

interface WysiwymEditorProps {
  blocks: MarkdownBlock[];
  activeBlockId: string | null;
  preferences: CursivPreferences;
  currentFilePath: string;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onChangeBlocks: (nextBlocks: MarkdownBlock[]) => void;
  onSelectBlock: (blockId: string | null, cursorOffset?: number) => void;
  onActiveHeadingSlugChange?: (slug: string) => void;
}

const CALLOUT_STYLES: Record<
  CalloutKind,
  { color: string; bg: string; icon: React.ReactNode; label: string }
> = {
  NOTE: {
    color: '#0969da',
    bg: 'rgba(9, 105, 218, 0.08)',
    icon: <Info className="w-4 h-4 text-[#0969da]" />,
    label: 'Note',
  },
  TIP: {
    color: '#1a7f37',
    bg: 'rgba(26, 127, 55, 0.08)',
    icon: <Lightbulb className="w-4 h-4 text-[#1a7f37]" />,
    label: 'Tip',
  },
  IMPORTANT: {
    color: '#8250df',
    bg: 'rgba(130, 80, 223, 0.08)',
    icon: <Flame className="w-4 h-4 text-[#8250df]" />,
    label: 'Important',
  },
  WARNING: {
    color: '#9a6700',
    bg: 'rgba(154, 103, 0, 0.10)',
    icon: <AlertTriangle className="w-4 h-4 text-[#9a6700]" />,
    label: 'Warning',
  },
  CAUTION: {
    color: '#cf222e',
    bg: 'rgba(207, 34, 46, 0.09)',
    icon: <AlertOctagon className="w-4 h-4 text-[#cf222e]" />,
    label: 'Caution',
  },
};

const AUTO_PAIR_BRACKETS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
};

const AUTO_PAIR_MARKDOWN: Record<string, string> = {
  '*': '*',
  _: '_',
  '~': '~',
  '`': '`',
  $: '$',
  '^': '^',
};

export const WysiwymEditor: React.FC<WysiwymEditorProps> = ({
  blocks,
  activeBlockId,
  preferences,
  currentFilePath,
  sheetRef,
  scrollContainerRef,
  onChangeBlocks,
  onSelectBlock,
  onActiveHeadingSlugChange,
}) => {
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [lassoBox, setLassoBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [emojiPopup, setEmojiPopup] = useState<{
    blockId: string;
    query: string;
    colonIndex: number;
    results: EmojiEntry[];
    selectedIndex: number;
  } | null>(null);
  const [slashPopup, setSlashPopup] = useState<{
    blockId: string;
    query: string;
    slashIndex: number;
    results: SlashCommandItem[];
    selectedIndex: number;
  } | null>(null);

  const blockDomRefs = useRef<Record<string, HTMLElement | null>>({});
  const markdownTransformTimerRef = useRef<number | null>(null);
  const blocksRef = useRef<MarkdownBlock[]>(blocks);
  const onChangeBlocksRef = useRef(onChangeBlocks);
  const onSelectBlockRef = useRef(onSelectBlock);
  blocksRef.current = blocks;
  onChangeBlocksRef.current = onChangeBlocks;
  onSelectBlockRef.current = onSelectBlock;

  useEffect(() => {
    return () => {
      if (markdownTransformTimerRef.current) {
        window.clearTimeout(markdownTransformTimerRef.current);
      }
    };
  }, []);

  // Notion-style Multi-Block Lasso Selection Keyboard Actions (Delete, Copy, Cut, Escape)
  useEffect(() => {
    if (selectedBlockIds.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBlockIds([]);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'textarea' || activeTag === 'input') return;
        e.preventDefault();
        const remaining = blocks.filter((b) => !selectedBlockIds.includes(b.id));
        const finalBlocks: MarkdownBlock[] =
          remaining.length > 0
            ? remaining
            : [{ id: nextBlockId('p'), type: 'paragraph', text: '' }];
        onChangeBlocks(finalBlocks);
        setSelectedBlockIds([]);
        onSelectBlock(finalBlocks[0].id, 0);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'textarea' || activeTag === 'input') return;
        e.preventDefault();
        const chosen = blocks.filter((b) => selectedBlockIds.includes(b.id));
        navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'textarea' || activeTag === 'input') return;
        e.preventDefault();
        const chosen = blocks.filter((b) => selectedBlockIds.includes(b.id));
        navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
        const remaining = blocks.filter((b) => !selectedBlockIds.includes(b.id));
        const finalBlocks: MarkdownBlock[] =
          remaining.length > 0
            ? remaining
            : [{ id: nextBlockId('p'), type: 'paragraph', text: '' }];
        onChangeBlocks(finalBlocks);
        setSelectedBlockIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockIds, blocks, onChangeBlocks, onSelectBlock]);

  // Build global math environment (macros \newcommand, \def, \label, equation numbers)
  const mathEnv = useMemo(() => {
    const mathBlocks = blocks
      .filter((b): b is Extract<MarkdownBlock, { type: 'math' }> => b.type === 'math')
      .map((b) => ({ id: b.id, latex: b.latex }));
    return buildMathEnvironment(mathBlocks, preferences.equationNumbering);
  }, [blocks, preferences.equationNumbering]);

  // Build footnote lookup dictionary
  const footnotesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of blocks) {
      if (b.type === 'footnote-def') {
        map[b.label] = b.content;
      }
    }
    return map;
  }, [blocks]);

  const outlineHeadings: OutlineHeading[] = useMemo(
    () => extractOutlineHeadings(blocks),
    [blocks]
  );

  // Typewriter Mode (F9): Keep active block vertically centered in viewport during typing
  useEffect(() => {
    if (!preferences.typewriterMode || !activeBlockId) return;
    const container = scrollContainerRef.current;
    const activeEl = blockDomRefs.current[activeBlockId];
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const blockRect = activeEl.getBoundingClientRect();
    const blockCenter = blockRect.top - containerRect.top + container.scrollTop + blockRect.height / 2;
    const targetScrollTop = blockCenter - container.clientHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth',
    });
  }, [activeBlockId, cursorOffset, preferences.typewriterMode, scrollContainerRef]);

  // Track active heading on scroll for Outline synchronization
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onActiveHeadingSlugChange) return;

    const handleScroll = () => {
      let currentSlug = '';
      for (const h of outlineHeadings) {
        const el = blockDomRefs.current[h.blockId];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) {
            currentSlug = h.slug;
          }
        }
      }
      if (currentSlug) {
        onActiveHeadingSlugChange(currentSlug);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [outlineHeadings, onActiveHeadingSlugChange, scrollContainerRef]);

  const updateSingleBlock = (blockId: string, updater: (b: MarkdownBlock) => MarkdownBlock) => {
    onChangeBlocks(blocks.map((b) => (b.id === blockId ? updater(b) : b)));
  };

  const replaceBlockWithMultiple = (blockId: string, newBlocks: MarkdownBlock[]) => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const copy = [...blocks];
    copy.splice(idx, 1, ...newBlocks);
    onChangeBlocks(copy);
    if (newBlocks[0]) {
      onSelectBlock(newBlocks[0].id, 0);
    }
  };

  const executeSlashCommand = (
    blockId: string,
    item: SlashCommandItem,
    currentText: string,
    slashIndex: number,
    queryLen: number
  ) => {
    const cleanedText = (
      currentText.slice(0, slashIndex) + currentText.slice(slashIndex + 1 + queryLen)
    ).trim();

    setSlashPopup(null);

    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;

    const copy = [...blocks];

    switch (item.id) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4': {
        const lvl = Number(item.id.slice(1)) as 1 | 2 | 3 | 4;
        copy[idx] = {
          id: blockId,
          type: 'heading',
          level: lvl,
          text: cleanedText,
          slug: slugifyHeading(cleanedText || 'titre'),
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId, cleanedText.length);
        return;
      }
      case 'paragraph': {
        copy[idx] = {
          id: blockId,
          type: 'paragraph',
          text: cleanedText,
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId, cleanedText.length);
        return;
      }
      case 'bullet-list':
      case 'ordered-list':
      case 'task-list': {
        const listType =
          item.id === 'task-list' ? 'task' : item.id === 'ordered-list' ? 'ordered' : 'bullet';
        copy[idx] = {
          id: blockId,
          type: 'list',
          listType,
          items: [
            { id: nextBlockId('li'), indent: 0, text: cleanedText, checked: false },
          ],
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId, cleanedText.length);
        return;
      }
      case 'blockquote': {
        copy[idx] = {
          id: blockId,
          type: 'blockquote',
          text: cleanedText || 'Citation...',
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'callout-note':
      case 'callout-warning': {
        const kind = item.id === 'callout-warning' ? 'WARNING' : 'NOTE';
        copy[idx] = {
          id: blockId,
          type: 'callout',
          calloutType: kind,
          title: kind === 'WARNING' ? 'Avertissement' : 'Note',
          content: cleanedText,
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'code': {
        copy[idx] = {
          id: blockId,
          type: 'code',
          language: 'rust',
          code: cleanedText || 'fn main() {\n    println!("Cursiv");\n}',
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'mermaid': {
        copy[idx] = {
          id: blockId,
          type: 'code',
          language: 'mermaid',
          code: 'flowchart LR\n    A["Idée"] --> B["Document Cursiv"]',
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'math': {
        copy[idx] = {
          id: blockId,
          type: 'math',
          latex: cleanedText || '\\mathcal{H}\\ket{\\psi} = E\\ket{\\psi}',
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'table': {
        copy[idx] = {
          id: blockId,
          type: 'table',
          headers: ['Colonne 1', 'Colonne 2', 'Colonne 3'],
          alignments: ['left', 'left', 'left'],
          rows: [
            ['', '', ''],
            ['', '', ''],
          ],
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'toc': {
        copy[idx] = { id: blockId, type: 'toc' };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
      case 'hr': {
        const nextP = nextBlockId('p');
        copy.splice(
          idx,
          1,
          { id: blockId, type: 'hr' },
          { id: nextP, type: 'paragraph', text: cleanedText }
        );
        onChangeBlocks(copy);
        onSelectBlock(nextP, 0);
        return;
      }
      case 'image': {
        copy[idx] = {
          id: blockId,
          type: 'image',
          alt: 'Illustration Cursiv',
          src: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1000&q=80',
          zoom: 80,
        };
        onChangeBlocks(copy);
        onSelectBlock(blockId);
        return;
      }
    }
  };

  // Handle smart Auto-Pair, Slash Commands & Emoji autocomplete on text inputs/textareas
  const handleSmartKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    block: MarkdownBlock,
    currentText: string,
    applyNewText: (nextText: string, nextCursor: number) => void
  ) => {
    const target = e.currentTarget;
    const selStart = target.selectionStart ?? 0;
    const selEnd = target.selectionEnd ?? 0;

    // Slash Command Menu (`/title`, `/h1`, `/table`, etc.) keyboard navigation
    if (slashPopup && slashPopup.blockId === block.id && slashPopup.results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashPopup({
          ...slashPopup,
          selectedIndex: (slashPopup.selectedIndex + 1) % slashPopup.results.length,
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashPopup({
          ...slashPopup,
          selectedIndex:
            (slashPopup.selectedIndex - 1 + slashPopup.results.length) %
            slashPopup.results.length,
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = slashPopup.results[slashPopup.selectedIndex];
        if (chosen) {
          executeSlashCommand(
            block.id,
            chosen,
            currentText,
            slashPopup.slashIndex,
            slashPopup.query.length
          );
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashPopup(null);
        return;
      }
    }

    // Emoji popup keyboard navigation
    if (emojiPopup && emojiPopup.blockId === block.id) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEmojiPopup({
          ...emojiPopup,
          selectedIndex: (emojiPopup.selectedIndex + 1) % emojiPopup.results.length,
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEmojiPopup({
          ...emojiPopup,
          selectedIndex:
            (emojiPopup.selectedIndex - 1 + emojiPopup.results.length) %
            emojiPopup.results.length,
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = emojiPopup.results[emojiPopup.selectedIndex];
        if (chosen) {
          const before = currentText.slice(0, emojiPopup.colonIndex);
          const after = currentText.slice(selEnd);
          const inserted = `:${chosen.shortcode}: `;
          applyNewText(before + inserted + after, before.length + inserted.length);
          setEmojiPopup(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        setEmojiPopup(null);
        return;
      }
    }

    // Auto-Pair Brackets & Markdown symbols
    const isBracket = preferences.autoPairBrackets && e.key in AUTO_PAIR_BRACKETS;
    const isMdPair = preferences.autoPairMarkdown && e.key in AUTO_PAIR_MARKDOWN;

    // Do not auto-pair apostrophe when typing French words like l'éditeur, d'un, c'est
    const prevChar = selStart > 0 ? currentText[selStart - 1] : '';
    const isFrenchApostrophe =
      e.key === "'" && selStart === selEnd && /[a-zA-ZÀ-ÿ0-9]/.test(prevChar);

    if ((isBracket || isMdPair) && !isFrenchApostrophe && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const closeChar = isBracket ? AUTO_PAIR_BRACKETS[e.key] : AUTO_PAIR_MARKDOWN[e.key];
      e.preventDefault();
      const selectedSlice = currentText.slice(selStart, selEnd);
      const nextText =
        currentText.slice(0, selStart) +
        e.key +
        selectedSlice +
        closeChar +
        currentText.slice(selEnd);

      const nextPos = selStart !== selEnd ? selEnd + 2 : selStart + 1;
      applyNewText(nextText, nextPos);
      requestAnimationFrame(() => {
        target.setSelectionRange(
          selStart + 1,
          selStart !== selEnd ? selEnd + 1 : selStart + 1
        );
      });
      return;
    }

    // Windows inline formatting shortcuts: Ctrl+B (Bold), Ctrl+I (Italic), Ctrl+K (Link)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const keyLower = e.key.toLowerCase();
      if (keyLower === 'b' || keyLower === 'i' || keyLower === 'k') {
        e.preventDefault();
        const selectedSlice = currentText.slice(selStart, selEnd);
        let wrapped = '';
        let cursorDelta = 0;
        if (keyLower === 'b') {
          wrapped = `**${selectedSlice || 'texte'}**`;
          cursorDelta = selectedSlice ? wrapped.length : 2;
        } else if (keyLower === 'i') {
          wrapped = `*${selectedSlice || 'texte'}*`;
          cursorDelta = selectedSlice ? wrapped.length : 1;
        } else {
          wrapped = `[${selectedSlice || 'lien'}](https://)`;
          cursorDelta = wrapped.length - 1;
        }
        const nextText = currentText.slice(0, selStart) + wrapped + currentText.slice(selEnd);
        applyNewText(nextText, selStart + cursorDelta);
        return;
      }
    }

    // Smooth Title -> Content navigation: pressing Enter, Tab, or ArrowDown in a Heading
    // immediately focuses the next block or creates a new paragraph below so the user never gets stuck.
    if (
      block.type === 'heading' &&
      (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') &&
      !e.shiftKey
    ) {
      e.preventDefault();
      const idx = blocks.findIndex((b) => b.id === block.id);
      const nextBlock = blocks[idx + 1];
      if (nextBlock && e.key !== 'Enter') {
        onSelectBlock(nextBlock.id, 0);
        setCursorOffset(0);
      } else if (nextBlock && nextBlock.type === 'paragraph' && nextBlock.text === '') {
        onSelectBlock(nextBlock.id, 0);
        setCursorOffset(0);
      } else {
        const newParaId = nextBlockId('p');
        const copy = [...blocks];
        copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: '' });
        onChangeBlocks(copy);
        onSelectBlock(newParaId, 0);
        setCursorOffset(0);
      }
      return;
    }

    // Inter-block ArrowUp / ArrowDown navigation
    if (e.key === 'ArrowUp' && selStart === 0) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx > 0) {
        e.preventDefault();
        const prev = blocks[idx - 1];
        onSelectBlock(prev.id, 9999);
        return;
      }
    }
    if (e.key === 'ArrowDown' && selEnd === currentText.length) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx >= 0 && idx < blocks.length - 1) {
        e.preventDefault();
        const next = blocks[idx + 1];
        onSelectBlock(next.id, 0);
        setCursorOffset(0);
        return;
      }
    }

    // Live block triggers on Enter (e.g., typing `$$` + Enter, `[TOC]` + Enter, ` ```lang ` + Enter, `| a | b |` + Enter)
    if (e.key === 'Enter' && !e.shiftKey && block.type === 'paragraph') {
      const trimmed = currentText.trim();

      if (trimmed === '$$') {
        e.preventDefault();
        replaceBlockWithMultiple(block.id, [
          { id: nextBlockId('math'), type: 'math', latex: '\\int_{a}^{b} f(x)\\,\\dd x' },
        ]);
        return;
      }

      if (/^\[toc\]$/i.test(trimmed)) {
        e.preventDefault();
        replaceBlockWithMultiple(block.id, [{ id: nextBlockId('toc'), type: 'toc' }]);
        return;
      }

      if (/^(---|\*\*\*|___)$/.test(trimmed)) {
        e.preventDefault();
        const nextPId = nextBlockId('p');
        replaceBlockWithMultiple(block.id, [
          { id: nextBlockId('hr'), type: 'hr' },
          { id: nextPId, type: 'paragraph', text: '' },
        ]);
        return;
      }

      const fenceTrigger = trimmed.match(/^```([a-zA-Z0-9_-]*)$/);
      if (fenceTrigger) {
        e.preventDefault();
        replaceBlockWithMultiple(block.id, [
          {
            id: nextBlockId('code'),
            type: 'code',
            language: fenceTrigger[1] || 'rust',
            code: '',
          },
        ]);
        return;
      }

      const headingTrigger = currentText.match(/^(#{1,6})\s+(.*)$/);
      if (headingTrigger) {
        e.preventDefault();
        const level = headingTrigger[1].length as 1 | 2 | 3 | 4 | 5 | 6;
        const hText = headingTrigger[2];
        replaceBlockWithMultiple(block.id, [
          {
            id: nextBlockId('h'),
            type: 'heading',
            level,
            text: hText,
            slug: slugifyHeading(hText),
          },
          { id: nextBlockId('p'), type: 'paragraph', text: '' },
        ]);
        return;
      }

      // Direct table creation via `| Col 1 | Col 2 |` + Enter
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3) {
        e.preventDefault();
        const cols = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim() || 'Colonne');
        replaceBlockWithMultiple(block.id, [
          {
            id: nextBlockId('tbl'),
            type: 'table',
            headers: cols,
            alignments: cols.map(() => 'left'),
            rows: [cols.map(() => '')],
          },
        ]);
        return;
      }

      // Split paragraph into two on Enter at the end of line
      if (selStart === currentText.length) {
        e.preventDefault();
        const newParaId = nextBlockId('p');
        const idx = blocks.findIndex((b) => b.id === block.id);
        const copy = [...blocks];
        copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: '' });
        onChangeBlocks(copy);
        onSelectBlock(newParaId, 0);
        return;
      }
    }

    // Merge or delete empty paragraph on Backspace
    if (e.key === 'Backspace' && currentText === '' && blocks.length > 1) {
      e.preventDefault();
      const idx = blocks.findIndex((b) => b.id === block.id);
      const prevBlock = blocks[idx - 1];
      const nextBlocks = blocks.filter((b) => b.id !== block.id);
      onChangeBlocks(nextBlocks);
      if (prevBlock) {
        onSelectBlock(prevBlock.id, 9999);
      }
    }
  };

  // Detect `:emoji` shortcode, `/command` Slash Menu, and debounced `#` / `##` / `###` Markdown prefixes
  const checkEmojiTrigger = (blockId: string, textValue: string, caret: number) => {
    const beforeCaret = textValue.slice(0, caret);

    // 1. Slash command detection (`/title`, `/h1`, `/table`, etc. at start of line or after space)
    const slashMatch = beforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9_-]{0,20})$/);
    if (slashMatch) {
      const q = slashMatch[1];
      const results = filterSlashCommands(q);
      if (results.length > 0) {
        const slashIdx = caret - q.length - 1;
        setSlashPopup({
          blockId,
          query: q,
          slashIndex: slashIdx,
          results,
          selectedIndex: 0,
        });
      } else {
        setSlashPopup(null);
      }
    } else {
      setSlashPopup(null);
    }

    // 2. Emoji shortcode detection (`:rocket:`)
    const emojiMatch = beforeCaret.match(/:([a-zA-Z0-9_+-]{1,24})$/);
    if (emojiMatch) {
      const results = searchEmojis(emojiMatch[1]);
      if (results.length > 0) {
        setEmojiPopup({
          blockId,
          query: emojiMatch[1],
          colonIndex: caret - emojiMatch[0].length,
          results,
          selectedIndex: 0,
        });
        return;
      }
    }
    setEmojiPopup(null);

    // 3. Debounced Markdown prefix auto-application (waits 420ms after typing `#`, `##`, `###`, `- `, `1. `, `[] `, `> `, `---`)
    if (markdownTransformTimerRef.current) {
      window.clearTimeout(markdownTransformTimerRef.current);
      markdownTransformTimerRef.current = null;
    }

    const headingMatch = textValue.match(/^(#{1,6})(?:\s+(.*))?$/);
    const taskMatch =
      textValue.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/) || textValue.match(/^\[\]\s+(.*)$/);
    const bulletMatch = textValue.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = textValue.match(/^\d+\.\s+(.+)$/);
    const quoteMatch = textValue.match(/^>\s+(.+)$/);
    const hrMatch = /^(---|\*\*\*|___)$/.test(textValue.trim());
    const mathMatch = textValue.trim() === '$$';
    const tocMatch = /^\[toc\]$/i.test(textValue.trim());

    if (
      headingMatch ||
      taskMatch ||
      bulletMatch ||
      orderedMatch ||
      quoteMatch ||
      hrMatch ||
      mathMatch ||
      tocMatch
    ) {
      markdownTransformTimerRef.current = window.setTimeout(() => {
        const currentBlocks = blocksRef.current;
        const idx = currentBlocks.findIndex((b) => b.id === blockId);
        if (idx === -1) return;
        const targetBlock = currentBlocks[idx];
        if (targetBlock.type !== 'paragraph' && targetBlock.type !== 'heading') return;

        const copy = [...currentBlocks];

        if (headingMatch) {
          const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
          const restText = headingMatch[2] ?? '';
          copy[idx] = {
            id: blockId,
            type: 'heading',
            level,
            text: restText,
            slug: slugifyHeading(restText || 'titre'),
          };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId, restText.length);
          setCursorOffset(restText.length);
        } else if (taskMatch) {
          const isChecked = taskMatch.length === 3 ? taskMatch[1].toLowerCase() === 'x' : false;
          const itemText = taskMatch.length === 3 ? taskMatch[2] : taskMatch[1];
          copy[idx] = {
            id: blockId,
            type: 'list',
            listType: 'task',
            items: [{ id: nextBlockId('li'), indent: 0, text: itemText, checked: isChecked }],
          };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId, itemText.length);
        } else if (bulletMatch) {
          const itemText = bulletMatch[1];
          copy[idx] = {
            id: blockId,
            type: 'list',
            listType: 'bullet',
            items: [{ id: nextBlockId('li'), indent: 0, text: itemText, checked: false }],
          };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId, itemText.length);
        } else if (orderedMatch) {
          const itemText = orderedMatch[1];
          copy[idx] = {
            id: blockId,
            type: 'list',
            listType: 'ordered',
            items: [{ id: nextBlockId('li'), indent: 0, text: itemText, checked: false }],
          };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId, itemText.length);
        } else if (quoteMatch) {
          copy[idx] = {
            id: blockId,
            type: 'blockquote',
            text: quoteMatch[1],
          };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId, quoteMatch[1].length);
        } else if (hrMatch) {
          const nextP = nextBlockId('p');
          copy.splice(
            idx,
            1,
            { id: blockId, type: 'hr' },
            { id: nextP, type: 'paragraph', text: '' }
          );
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(nextP, 0);
        } else if (mathMatch) {
          copy[idx] = {
            id: blockId,
            type: 'math',
            latex: '\\int_{a}^{b} f(x)\\,\\dd x',
          };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId);
        } else if (tocMatch) {
          copy[idx] = { id: blockId, type: 'toc' };
          onChangeBlocksRef.current(copy);
          onSelectBlockRef.current(blockId);
        }
      }, 420);
    }
  };

  // Drag & Drop or Clipboard Paste of Images
  const handleImageFileInsertion = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || '');
      let finalSrc = base64Data;
      if (preferences.imageBehavior === 'local-assets') {
        try {
          finalSrc = await copyImageToLocalAssets(currentFilePath, file.name, base64Data);
        } catch {
          finalSrc = base64Data;
        }
      }
      const imgBlock: MarkdownBlock = {
        id: nextBlockId('img'),
        type: 'image',
        alt: file.name.replace(/\.[^.]+$/, ''),
        src: finalSrc,
        zoom: 100,
      };
      const targetIdx = activeBlockId
        ? blocks.findIndex((b) => b.id === activeBlockId) + 1
        : blocks.length;
      const next = [...blocks];
      next.splice(targetIdx, 0, imgBlock);
      onChangeBlocks(next);
      onSelectBlock(imgBlock.id);
    };
    reader.readAsDataURL(file);
  };

  const handleWrapInlineToolbar = (prefix: string, suffix = prefix) => {
    if (!activeBlockId) return;
    updateSingleBlock(activeBlockId, (b) => {
      if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'blockquote') {
        return { ...b, text: `${b.text}${prefix}texte${suffix}` };
      }
      return b;
    });
  };

  const handleInsertBlockToolbar = (
    kind:
      | 'h1'
      | 'h2'
      | 'h3'
      | 'table'
      | 'code'
      | 'math'
      | 'callout'
      | 'image'
      | 'bullet-list'
      | 'ordered-list'
      | 'task-list',
    meta?: { rows?: number; cols?: number }
  ) => {
    let created: MarkdownBlock;
    switch (kind) {
      case 'h1':
      case 'h2':
      case 'h3': {
        const lvl = Number(kind.slice(1)) as 1 | 2 | 3;
        created = {
          id: nextBlockId('h'),
          type: 'heading',
          level: lvl,
          text: 'Nouveau Titre',
          slug: 'nouveau-titre',
        };
        break;
      }
      case 'table': {
        const rCount = meta?.rows || 3;
        const cCount = meta?.cols || 3;
        const headers = Array.from({ length: cCount }, (_, i) => `Colonne ${i + 1}`);
        created = {
          id: nextBlockId('tbl'),
          type: 'table',
          headers,
          alignments: headers.map(() => 'left'),
          rows: Array.from({ length: rCount - 1 }, () => headers.map(() => '')),
        };
        break;
      }
      case 'code':
        created = {
          id: nextBlockId('code'),
          type: 'code',
          language: 'rust',
          code: 'fn main() {\n    println!("Cursiv 1.14");\n}',
        };
        break;
      case 'math':
        created = {
          id: nextBlockId('math'),
          type: 'math',
          latex: '\\mathcal{H}\\ket{\\psi} = E\\ket{\\psi}',
        };
        break;
      case 'callout':
        created = {
          id: nextBlockId('callout'),
          type: 'callout',
          calloutType: 'NOTE',
          title: 'Information Importante',
          content: 'Saisissez le contenu de votre alerte GitHub ici.',
        };
        break;
      case 'image':
        created = {
          id: nextBlockId('img'),
          type: 'image',
          alt: 'Illustration Cursiv',
          src: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1000&q=80',
          zoom: 80,
        };
        break;
      case 'bullet-list':
      case 'ordered-list':
      case 'task-list': {
        const listType =
          kind === 'task-list' ? 'task' : kind === 'ordered-list' ? 'ordered' : 'bullet';
        created = {
          id: nextBlockId('list'),
          type: 'list',
          listType,
          items: [
            { id: nextBlockId('li'), indent: 0, text: 'Premier élément', checked: false },
            { id: nextBlockId('li'), indent: 0, text: 'Deuxième élément', checked: false },
          ],
        };
        break;
      }
    }

    const insertAt = activeBlockId
      ? blocks.findIndex((b) => b.id === activeBlockId) + 1
      : blocks.length;
    const next = [...blocks];
    next.splice(insertAt, 0, created);
    onChangeBlocks(next);
    onSelectBlock(created.id);
  };

  const navigateAnchorOrUrl = (slugOrUrl: string) => {
    if (slugOrUrl.startsWith('#')) {
      const slug = slugOrUrl.slice(1).toLowerCase();
      const targetHeading = outlineHeadings.find((h) => h.slug === slug);
      if (targetHeading) {
        const el = blockDomRefs.current[targetHeading.blockId];
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        onSelectBlock(targetHeading.blockId);
      }
      return;
    }
    window.open(slugOrUrl, '_blank', 'noopener,noreferrer');
  };

  // Notion-style Marquee / Lasso Selection when dragging from the page margins or across blocks
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Allow normal text selection if clicking directly inside an input/textarea or button
    if (
      target.closest('textarea') ||
      target.closest('input') ||
      target.closest('button') ||
      target.closest('.cm-editor')
    ) {
      if (selectedBlockIds.length > 0) {
        setSelectedBlockIds([]);
      }
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    let isDraggingLasso = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = Math.abs(moveEvent.clientX - startX);
      const dy = Math.abs(moveEvent.clientY - startY);
      if (!isDraggingLasso && (dx > 6 || dy > 6)) {
        isDraggingLasso = true;
        onSelectBlock(null);
        window.getSelection()?.removeAllRanges();
      }
      if (!isDraggingLasso) return;

      const curX = moveEvent.clientX;
      const curY = moveEvent.clientY;
      setLassoBox({ startX, startY, currentX: curX, currentY: curY });

      const left = Math.min(startX, curX);
      const right = Math.max(startX, curX);
      const top = Math.min(startY, curY);
      const bottom = Math.max(startY, curY);

      const hitIds: string[] = [];
      for (const b of blocks) {
        const el = blockDomRefs.current[b.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const intersects = r.left <= right && r.right >= left && r.top <= bottom && r.bottom >= top;
        if (intersects) {
          hitIds.push(b.id);
        }
      }
      setSelectedBlockIds(hitIds);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setLassoBox(null);
      if (!isDraggingLasso) {
        setSelectedBlockIds([]);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Context Menu Helpers
  const getTargetBlockIds = (): string[] => {
    if (selectedBlockIds.length > 0) return selectedBlockIds;
    if (contextMenu?.targetBlockId) return [contextMenu.targetBlockId];
    if (activeBlockId) return [activeBlockId];
    return blocks[0] ? [blocks[0].id] : [];
  };

  const handleConvertBlockType = (
    targetType:
      | 'paragraph'
      | 'h1'
      | 'h2'
      | 'h3'
      | 'bullet-list'
      | 'ordered-list'
      | 'task-list'
      | 'blockquote'
      | 'code'
      | 'callout'
  ) => {
    const targetIds = new Set(getTargetBlockIds());
    if (targetIds.size === 0) return;

    const next = blocks.map((b): MarkdownBlock => {
      if (!targetIds.has(b.id)) return b;
      const rawText =
        b.type === 'paragraph' || b.type === 'heading' || b.type === 'blockquote'
          ? b.text
          : b.type === 'callout'
          ? b.content
          : b.type === 'code'
          ? b.code
          : b.type === 'list'
          ? b.items.map((it) => it.text).join(' ')
          : '';

      switch (targetType) {
        case 'paragraph':
          return { id: b.id, type: 'paragraph', text: rawText };
        case 'h1':
        case 'h2':
        case 'h3': {
          const lvl = Number(targetType.slice(1)) as 1 | 2 | 3;
          return {
            id: b.id,
            type: 'heading',
            level: lvl,
            text: rawText || 'Titre',
            slug: slugifyHeading(rawText || 'Titre'),
          };
        }
        case 'bullet-list':
        case 'ordered-list':
        case 'task-list': {
          const listType =
            targetType === 'task-list'
              ? 'task'
              : targetType === 'ordered-list'
              ? 'ordered'
              : 'bullet';
          return {
            id: b.id,
            type: 'list',
            listType,
            items: [
              { id: nextBlockId('li'), indent: 0, text: rawText || 'Élément', checked: false },
            ],
          };
        }
        case 'blockquote':
          return { id: b.id, type: 'blockquote', text: rawText || 'Citation' };
        case 'code':
          return { id: b.id, type: 'code', language: 'rust', code: rawText };
        case 'callout':
          return {
            id: b.id,
            type: 'callout',
            calloutType: 'NOTE',
            title: 'Note',
            content: rawText,
          };
      }
    });

    onChangeBlocks(next);
  };

  const handleDuplicateSelectedBlocks = () => {
    const targetIds = getTargetBlockIds();
    if (targetIds.length === 0) return;
    const lastId = targetIds[targetIds.length - 1];
    const insertIdx = blocks.findIndex((b) => b.id === lastId) + 1;
    const clones = blocks
      .filter((b) => targetIds.includes(b.id))
      .map((b) => ({ ...b, id: nextBlockId(b.type) }));
    const next = [...blocks];
    next.splice(insertIdx, 0, ...clones);
    onChangeBlocks(next);
  };

  const handleDeleteSelectedBlocks = () => {
    const targetIds = new Set(getTargetBlockIds());
    if (targetIds.size === 0) return;
    const remaining = blocks.filter((b) => !targetIds.has(b.id));
    const finalBlocks: MarkdownBlock[] =
      remaining.length > 0
        ? remaining
        : [{ id: nextBlockId('p'), type: 'paragraph', text: '' }];
    onChangeBlocks(finalBlocks);
    setSelectedBlockIds([]);
    onSelectBlock(finalBlocks[0].id, 0);
  };

  return (
    <div
      className="relative min-h-full w-full select-none"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
        const bId = blockEl?.dataset.blockId || activeBlockId;
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          targetBlockId: bId || null,
          selectedBlockCount: selectedBlockIds.length > 0 ? selectedBlockIds.length : 1,
        });
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) {
          e.preventDefault();
          handleImageFileInsertion(imageFile);
        }
      }}
      onPaste={(e) => {
        const items = Array.from(e.clipboardData.items);
        const imgItem = items.find((item) => item.type.startsWith('image/'));
        if (imgItem) {
          const file = imgItem.getAsFile();
          if (file) {
            e.preventDefault();
            handleImageFileInsertion(file);
          }
        }
      }}
      onMouseUp={() => {
        const sel = window.getSelection();
        setHasTextSelection(Boolean(sel && sel.toString().trim().length > 0));
      }}
    >
      {/* Cursiv Glassmorphism Floating Toolbar */}
      <FloatingToolbar
        visible={preferences.showFloatingToolbar || hasTextSelection || selectedBlockIds.length > 0}
        onWrapInline={handleWrapInlineToolbar}
        onInsertBlock={handleInsertBlockToolbar}
      />

      {/* Notion-style Marquee / Lasso Selection Rectangle */}
      {lassoBox && (
        <div
          className="no-print no-export cursiv-lasso-rect fixed z-50"
          style={{
            left: `${Math.min(lassoBox.startX, lassoBox.currentX)}px`,
            top: `${Math.min(lassoBox.startY, lassoBox.currentY)}px`,
            width: `${Math.abs(lassoBox.currentX - lassoBox.startX)}px`,
            height: `${Math.abs(lassoBox.currentY - lassoBox.startY)}px`,
          }}
        />
      )}

      {/* Custom Cursiv Right-Click Context Menu */}
      <ContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onFormatInline={(prefix, suffix) => handleWrapInlineToolbar(prefix, suffix)}
        onConvertBlock={handleConvertBlockType}
        onInsertBlockBelow={(kind) => {
          if (kind === 'paragraph') {
            const targetId = contextMenu?.targetBlockId || activeBlockId;
            const idx = targetId ? blocks.findIndex((b) => b.id === targetId) + 1 : blocks.length;
            const newId = nextBlockId('p');
            const copy = [...blocks];
            copy.splice(idx, 0, { id: newId, type: 'paragraph', text: '' });
            onChangeBlocks(copy);
            onSelectBlock(newId, 0);
          } else if (kind === 'hr') {
            const targetId = contextMenu?.targetBlockId || activeBlockId;
            const idx = targetId ? blocks.findIndex((b) => b.id === targetId) + 1 : blocks.length;
            const copy = [...blocks];
            copy.splice(idx, 0, { id: nextBlockId('hr'), type: 'hr' });
            onChangeBlocks(copy);
          } else {
            handleInsertBlockToolbar(kind);
          }
        }}
        onCopySelection={() => {
          const ids = getTargetBlockIds();
          const chosen = blocks.filter((b) => ids.includes(b.id));
          navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
        }}
        onCutSelection={() => {
          const ids = getTargetBlockIds();
          const chosen = blocks.filter((b) => ids.includes(b.id));
          navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
          handleDeleteSelectedBlocks();
        }}
        onPasteClipboard={async () => {
          try {
            const clip = await navigator.clipboard.readText();
            if (!clip) return;
            const parsed = parseMarkdownToBlocks(clip);
            const targetId = contextMenu?.targetBlockId || activeBlockId;
            const idx = targetId ? blocks.findIndex((b) => b.id === targetId) + 1 : blocks.length;
            const copy = [...blocks];
            copy.splice(idx, 0, ...parsed);
            onChangeBlocks(copy);
          } catch {
            // ignore clipboard permission errors
          }
        }}
        onDuplicateBlocks={handleDuplicateSelectedBlocks}
        onDeleteBlocks={handleDeleteSelectedBlocks}
      />

      {/* Centered Distraction-Free Document Sheet */}
      <div
        ref={sheetRef}
        onClick={(e) => {
          // Clicking in the empty bottom margin of the document sheet focuses or creates a trailing paragraph
          if (e.target === e.currentTarget && selectedBlockIds.length === 0) {
            const last = blocks[blocks.length - 1];
            if (last && last.type === 'paragraph') {
              onSelectBlock(last.id, last.text.length);
              setCursorOffset(last.text.length);
            } else {
              const newParaId = nextBlockId('p');
              onChangeBlocks([...blocks, { id: newParaId, type: 'paragraph', text: '' }]);
              onSelectBlock(newParaId, 0);
              setCursorOffset(0);
            }
          }
        }}
        className={`cursiv-editor-sheet mx-auto max-w-[820px] px-5 sm:px-10 md:px-14 pt-8 sm:pt-12 pb-40 select-text ${
          preferences.focusMode ? 'cursiv-focus-mode' : ''
        } ${preferences.focusModeBlur ? 'cursiv-focus-blur' : ''} ${
          preferences.autoNumberHeadings ? 'auto-number-headings' : ''
        }`}
      >
        {blocks.map((block) => {
          const isActive = activeBlockId === block.id;
          const isLassoSelected = selectedBlockIds.includes(block.id);

          return (
            <div
              key={block.id}
              data-block-id={block.id}
              ref={(el) => {
                blockDomRefs.current[block.id] = el;
              }}
              className={`cursiv-block group/block relative ${
                isActive ? 'cursiv-block-active' : ''
              } ${isLassoSelected ? 'cursiv-block-selected' : ''}`}
            >
              {/* Notion-style Left Margin Block Handle (Click to select block, Right-click for menu) */}
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBlock(null);
                  setSelectedBlockIds((prev) =>
                    e.shiftKey
                      ? prev.includes(block.id)
                        ? prev.filter((id) => id !== block.id)
                        : [...prev, block.id]
                      : [block.id]
                  );
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedBlockIds([block.id]);
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetBlockId: block.id,
                    selectedBlockCount: 1,
                  });
                }}
                title="Cliquer pour sélectionner le bloc · Clic droit pour les options"
                className="no-print no-export opacity-0 group-hover/block:opacity-45 hover:!opacity-100 absolute -left-7 top-1.5 p-0.5 rounded hover:bg-black/6 dark:hover:bg-white/10 transition-opacity cursor-grab active:cursor-grabbing hidden sm:flex items-center justify-center"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
              {/* Slash Command Menu (`/title`, `/h1`, `/table`, `/code`, `/math`, etc.) */}
              {slashPopup && slashPopup.blockId === block.id && (
                <SlashCommandMenu
                  query={slashPopup.query}
                  results={slashPopup.results}
                  selectedIndex={slashPopup.selectedIndex}
                  onSelect={(item) => {
                    const currentText =
                      block.type === 'paragraph' || block.type === 'heading' ? block.text : '';
                    executeSlashCommand(
                      block.id,
                      item,
                      currentText,
                      slashPopup.slashIndex,
                      slashPopup.query.length
                    );
                  }}
                />
              )}

              {/* Emoji Autocomplete Popup (`:emoji_name:`) */}
              {emojiPopup && emojiPopup.blockId === block.id && (
                <div
                  className="no-export cursiv-popup-anim absolute left-4 -top-2 -translate-y-full z-40 w-64 rounded-lg shadow-xl border py-1.5"
                  style={{
                    backgroundColor: 'var(--bg-color)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div
                    className="px-3 py-1 text-[11px] font-mono border-b"
                    style={{
                      borderColor: 'var(--border-color)',
                      color: 'var(--meta-content-color)',
                    }}
                  >
                    Emojis :{emojiPopup.query}:
                  </div>
                  {emojiPopup.results.map((entry, idx) => (
                    <button
                      key={entry.shortcode}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (block.type === 'paragraph' || block.type === 'heading') {
                          const replaced =
                            block.text.slice(0, emojiPopup.colonIndex) +
                            `:${entry.shortcode}: ` +
                            block.text.slice(
                              emojiPopup.colonIndex + emojiPopup.query.length + 1
                            );
                          updateSingleBlock(block.id, (b) =>
                            b.type === 'paragraph' || b.type === 'heading'
                              ? { ...b, text: replaced }
                              : b
                          );
                        }
                        setEmojiPopup(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs flex items-center justify-between cursor-pointer"
                      style={{
                        backgroundColor:
                          idx === emojiPopup.selectedIndex
                            ? 'var(--code-bg-color)'
                            : 'transparent',
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base">{entry.emoji}</span>
                        <span className="font-mono">:{entry.shortcode}:</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* 1. YAML Front Matter */}
              {block.type === 'yaml' && (
                <div
                  className="my-4 p-3 rounded-lg border font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--code-bg-color)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--meta-content-color)',
                  }}
                  onClick={() => onSelectBlock(block.id)}
                >
                  <div className="flex items-center justify-between mb-1 opacity-70">
                    <span>--- YAML Front Matter</span>
                    <span> métadonnées & surcharge export ---</span>
                  </div>
                  {isActive ? (
                    <textarea
                      autoFocus
                      value={block.raw}
                      onChange={(e) =>
                        updateSingleBlock(block.id, () => ({ ...block, raw: e.target.value }))
                      }
                      rows={Math.max(2, block.raw.split('\n').length)}
                      className="w-full bg-transparent outline-none resize-y font-mono text-xs"
                      style={{ color: 'var(--text-color)' }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap m-0">{block.raw}</pre>
                  )}
                </div>
              )}

              {/* 2. Headings H1..H6 with Live Token Reveal (`#`) */}
              {block.type === 'heading' &&
                (() => {
                  const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                  const sizeClasses: Record<number, string> = {
                    1: 'text-3xl font-bold mt-8 mb-4 pb-2 border-b',
                    2: 'text-2xl font-semibold mt-7 mb-3 pb-1.5 border-b',
                    3: 'text-xl font-semibold mt-6 mb-2.5',
                    4: 'text-lg font-semibold mt-5 mb-2',
                    5: 'text-base font-semibold mt-4 mb-1.5',
                    6: 'text-sm font-semibold uppercase tracking-wide mt-4 mb-1.5 opacity-80',
                  };

                  return (
                    <Tag
                      id={block.slug}
                      style={{
                        fontFamily: 'var(--font-heading)',
                        borderColor:
                          block.level <= 2 ? 'var(--border-color)' : 'transparent',
                      }}
                      className={`${sizeClasses[block.level]} flex items-baseline gap-1.5 cursor-text`}
                      onClick={() => onSelectBlock(block.id, block.text.length)}
                    >
                      <span
                        className={`md-token-marker ${
                          isActive ? 'md-token-marker-visible' : 'md-token-marker-hidden'
                        }`}
                      >
                        {'#'.repeat(block.level)}
                      </span>
                      {isActive ? (
                        <InlinePageInput
                          value={block.text}
                          multiline={false}
                          autoFocus
                          placeholder="Titre du document..."
                          onCursorChange={(caret) => setCursorOffset(caret)}
                          onChange={(val, caret) => {
                            setCursorOffset(caret);
                            checkEmojiTrigger(block.id, val, caret);
                            updateSingleBlock(block.id, () => ({
                              ...block,
                              text: val,
                              slug: slugifyHeading(val),
                            }));
                          }}
                          onKeyDown={(e) =>
                            handleSmartKeyDown(e, block, block.text, (nextText, nextPos) => {
                              updateSingleBlock(block.id, () => ({
                                ...block,
                                text: nextText,
                                slug: slugifyHeading(nextText),
                              }));
                              setCursorOffset(nextPos);
                            })
                          }
                          className="flex-1"
                        />
                      ) : (
                        <span className="heading-content">
                          <LiveInlineTokens
                            text={block.text}
                            isBlockActive={false}
                            cursorOffset={null}
                            mathEnv={mathEnv}
                            footnotesMap={footnotesMap}
                            pandocMathRules={preferences.inlineMathPandocRules}
                            onNavigateAnchor={navigateAnchorOrUrl}
                          />
                        </span>
                      )}
                    </Tag>
                  );
                })()}

              {/* 3. Dynamic [TOC] Table of Contents */}
              {block.type === 'toc' && (
                <div
                  className="my-5 p-4 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--code-bg-color)',
                    borderColor: isActive ? 'var(--primary-color)' : 'var(--border-color)',
                  }}
                  onClick={() => onSelectBlock(block.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                      Table des Matières
                    </span>
                    <span
                      className={`md-token-marker ${
                        isActive ? 'md-token-marker-visible' : 'md-token-marker-hidden'
                      }`}
                    >
                      [TOC]
                    </span>
                  </div>
                  {outlineHeadings.length === 0 ? (
                    <div className="text-xs italic opacity-65">
                      Ajoutez des titres (# H1, ## H2...) pour générer automatiquement le sommaire.
                    </div>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {outlineHeadings.map((h) => (
                        <li
                          key={h.id}
                          style={{ paddingLeft: `${(h.level - 1) * 1.1}rem` }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateAnchorOrUrl(`#${h.slug}`);
                            }}
                            style={{ color: 'var(--primary-color)' }}
                            className="hover:underline text-left cursor-pointer"
                          >
                            {h.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* 4. Paragraph — Direct-on-Page Typing with Word Gliding Caret (Zero Box, Zero Duplicate) */}
              {block.type === 'paragraph' && (
                <div
                  className="my-3.5 leading-[1.78] text-[1.03rem] cursor-text"
                  onClick={() => {
                    if (!isActive) {
                      onSelectBlock(block.id, block.text.length);
                    }
                  }}
                >
                  {isActive ? (
                    <InlinePageInput
                      value={block.text}
                      multiline={true}
                      autoFocus
                      placeholder="Rédigez ou tapez / pour les commandes (/title, /table, /code...)"
                      onCursorChange={(caret) => setCursorOffset(caret)}
                      onChange={(val, caret) => {
                        setCursorOffset(caret);
                        checkEmojiTrigger(block.id, val, caret);

                        // If user pasted multi-block markdown, parse it seamlessly
                        if (val.includes('\n\n') || /^```/m.test(val)) {
                          const parsed = parseMarkdownToBlocks(val);
                          if (parsed.length > 1) {
                            replaceBlockWithMultiple(block.id, parsed);
                            return;
                          }
                        }

                        updateSingleBlock(block.id, () => ({ ...block, text: val }));
                      }}
                      onKeyDown={(e) =>
                        handleSmartKeyDown(e, block, block.text, (nextText, nextPos) => {
                          updateSingleBlock(block.id, () => ({ ...block, text: nextText }));
                          setCursorOffset(nextPos);
                        })
                      }
                    />
                  ) : (
                    <p className="m-0 whitespace-pre-wrap break-words min-h-[1.6rem]">
                      <LiveInlineTokens
                        text={block.text}
                        isBlockActive={false}
                        cursorOffset={null}
                        mathEnv={mathEnv}
                        footnotesMap={footnotesMap}
                        pandocMathRules={preferences.inlineMathPandocRules}
                        onNavigateAnchor={navigateAnchorOrUrl}
                      />
                    </p>
                  )}
                </div>
              )}

              {/* 5. Lists: Ordered, Unordered, GFM Interactive Task Lists (`- [ ]` / `- [x]`) */}
              {block.type === 'list' && (
                <div className="my-4" onClick={() => onSelectBlock(block.id)}>
                  {isActive && (
                    <div
                      className="no-export cursiv-popup-anim inline-flex items-center gap-1 px-2 py-1 mb-1.5 rounded-md border text-xs"
                      style={{
                        backgroundColor: 'var(--code-bg-color)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--meta-content-color)',
                      }}
                    >
                      <span className="mr-1">Convertir liste :</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateSingleBlock(block.id, () => ({ ...block, listType: 'bullet' }))
                        }
                        className={`p-1 rounded cursor-pointer ${
                          block.listType === 'bullet' ? 'text-blue-500 bg-blue-500/10' : ''
                        }`}
                        title="Liste à puces"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSingleBlock(block.id, () => ({ ...block, listType: 'ordered' }))
                        }
                        className={`p-1 rounded cursor-pointer ${
                          block.listType === 'ordered' ? 'text-blue-500 bg-blue-500/10' : ''
                        }`}
                        title="Liste numérotée"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSingleBlock(block.id, () => ({ ...block, listType: 'task' }))
                        }
                        className={`p-1 rounded cursor-pointer ${
                          block.listType === 'task' ? 'text-blue-500 bg-blue-500/10' : ''
                        }`}
                        title="Task List GFM (- [ ])"
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <ul className="space-y-1.5">
                    {block.items.map((item, itemIdx) => (
                      <li
                        key={item.id}
                        style={{ paddingLeft: `${item.indent * 1.5}rem` }}
                        className="flex items-start gap-2.5 leading-relaxed"
                      >
                        {block.listType === 'task' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextItems = block.items.map((it, i) =>
                                i === itemIdx ? { ...it, checked: !it.checked } : it
                              );
                              updateSingleBlock(block.id, () => ({ ...block, items: nextItems }));
                            }}
                            className="mt-1 cursor-pointer shrink-0 transition-transform active:scale-90"
                            style={{ color: item.checked ? 'var(--primary-color)' : 'var(--md-char-color)' }}
                          >
                            {item.checked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        ) : block.listType === 'ordered' ? (
                          <span
                            className="font-mono text-sm mt-0.5 shrink-0 select-none"
                            style={{ color: 'var(--meta-content-color)' }}
                          >
                            {itemIdx + 1}.
                          </span>
                        ) : (
                          <span
                            className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: 'var(--meta-content-color)' }}
                          />
                        )}

                        {isActive ? (
                          <input
                            type="text"
                            value={item.text}
                            onChange={(e) => {
                              const nextItems = block.items.map((it, i) =>
                                i === itemIdx ? { ...it, text: e.target.value } : it
                              );
                              updateSingleBlock(block.id, () => ({ ...block, items: nextItems }));
                            }}
                            onKeyDown={(e) => {
                              // Tab & Shift+Tab natural indentation
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                const delta = e.shiftKey ? -1 : 1;
                                const nextItems = block.items.map((it, i) =>
                                  i === itemIdx
                                    ? { ...it, indent: Math.max(0, Math.min(6, it.indent + delta)) }
                                    : it
                                );
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  items: nextItems,
                                }));
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const nextItems = [...block.items];
                                nextItems.splice(itemIdx + 1, 0, {
                                  id: nextBlockId('li'),
                                  indent: item.indent,
                                  text: '',
                                  checked: false,
                                });
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  items: nextItems,
                                }));
                              } else if (
                                e.key === 'Backspace' &&
                                item.text === '' &&
                                block.items.length > 1
                              ) {
                                e.preventDefault();
                                const nextItems = block.items.filter((_, i) => i !== itemIdx);
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  items: nextItems,
                                }));
                              }
                            }}
                            className={`w-full bg-transparent outline-none ${
                              item.checked ? 'line-through opacity-60' : ''
                            }`}
                          />
                        ) : (
                          <div className={item.checked ? 'line-through opacity-60' : ''}>
                            <LiveInlineTokens
                              text={item.text}
                              isBlockActive={false}
                              cursorOffset={null}
                              mathEnv={mathEnv}
                              footnotesMap={footnotesMap}
                              pandocMathRules={preferences.inlineMathPandocRules}
                              onNavigateAnchor={navigateAnchorOrUrl}
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 6. GitHub Alerts / Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) */}
              {block.type === 'callout' &&
                (() => {
                  const cfg = CALLOUT_STYLES[block.calloutType] || CALLOUT_STYLES.NOTE;
                  const kinds: CalloutKind[] = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];

                  return (
                    <div
                      className="my-4 p-4 rounded-r-lg border-l-4 transition-colors"
                      style={{
                        borderLeftColor: cfg.color,
                        backgroundColor: cfg.bg,
                      }}
                      onClick={() => onSelectBlock(block.id)}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: cfg.color }}>
                          {cfg.icon}
                          {isActive ? (
                            <input
                              type="text"
                              value={block.title}
                              onChange={(e) =>
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  title: e.target.value,
                                }))
                              }
                              className="bg-transparent outline-none font-semibold"
                            />
                          ) : (
                            <span>{block.title || cfg.label}</span>
                          )}
                        </div>

                        {isActive && (
                          <div className="no-export flex items-center gap-1">
                            {kinds.map((k) => (
                              <button
                                key={k}
                                type="button"
                                onClick={() =>
                                  updateSingleBlock(block.id, () => ({
                                    ...block,
                                    calloutType: k,
                                  }))
                                }
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                                  block.calloutType === k
                                    ? 'font-bold underline'
                                    : 'opacity-60 hover:opacity-100'
                                }`}
                              >
                                [!{k}]
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {isActive ? (
                        <textarea
                          value={block.content}
                          onChange={(e) =>
                            updateSingleBlock(block.id, () => ({
                              ...block,
                              content: e.target.value,
                            }))
                          }
                          rows={Math.max(1, block.content.split('\n').length)}
                          className="w-full bg-transparent outline-none text-sm resize-y"
                        />
                      ) : (
                        <div className="text-sm leading-relaxed">
                          <LiveInlineTokens
                            text={block.content}
                            isBlockActive={false}
                            cursorOffset={null}
                            mathEnv={mathEnv}
                            footnotesMap={footnotesMap}
                            pandocMathRules={preferences.inlineMathPandocRules}
                            onNavigateAnchor={navigateAnchorOrUrl}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* 7. Standard Blockquote */}
              {block.type === 'blockquote' && (
                <blockquote
                  className="my-4 pl-4 border-l-4 italic"
                  style={{
                    borderLeftColor: 'var(--blockquote-border)',
                    color: 'var(--blockquote-text)',
                  }}
                  onClick={() => onSelectBlock(block.id)}
                >
                  {isActive ? (
                    <textarea
                      autoFocus
                      value={block.text}
                      onChange={(e) =>
                        updateSingleBlock(block.id, () => ({ ...block, text: e.target.value }))
                      }
                      rows={Math.max(1, block.text.split('\n').length)}
                      className="w-full bg-transparent outline-none resize-y"
                    />
                  ) : (
                    <LiveInlineTokens
                      text={block.text}
                      isBlockActive={false}
                      cursorOffset={null}
                      mathEnv={mathEnv}
                      footnotesMap={footnotesMap}
                      pandocMathRules={preferences.inlineMathPandocRules}
                      onNavigateAnchor={navigateAnchorOrUrl}
                    />
                  )}
                </blockquote>
              )}

              {/* 8. Interactive Markdown Extra Table */}
              {block.type === 'table' && (
                <InteractiveTableBlock
                  headers={block.headers}
                  alignments={block.alignments}
                  rows={block.rows}
                  columnWidths={block.columnWidths}
                  isActive={isActive}
                  mathEnv={mathEnv}
                  footnotesMap={footnotesMap}
                  pandocMathRules={preferences.inlineMathPandocRules}
                  onFocusBlock={() => onSelectBlock(block.id)}
                  onChange={(nextTbl) =>
                    updateSingleBlock(block.id, () => ({
                      ...block,
                      ...nextTbl,
                    }))
                  }
                />
              )}

              {/* 9. Code Fences (CodeMirror 6 + Mermaid / Flowchart / Sequence SVG) */}
              {block.type === 'code' && (
                <CodeFenceBlock
                  id={block.id}
                  language={block.language}
                  code={block.code}
                  showLineNumbers={preferences.codeBlockLineNumbers}
                  wordWrap={preferences.codeBlockWordWrap}
                  isActive={isActive}
                  onFocusBlock={() => onSelectBlock(block.id)}
                  onChange={(newCode, newLanguage) =>
                    updateSingleBlock(block.id, () => ({
                      ...block,
                      code: newCode,
                      language: newLanguage,
                    }))
                  }
                />
              )}

              {/* 10. Math Block (KaTeX + mhchem + AMS + Physics) */}
              {block.type === 'math' && (
                <MathBlock
                  id={block.id}
                  latex={block.latex}
                  mathEnv={mathEnv}
                  isActive={isActive}
                  onFocusBlock={() => onSelectBlock(block.id)}
                  onChange={(newLatex) =>
                    updateSingleBlock(block.id, () => ({
                      ...block,
                      latex: newLatex,
                    }))
                  }
                />
              )}

              {/* 11. Image Block */}
              {block.type === 'image' && (
                <ImageBlock
                  alt={block.alt}
                  src={block.src}
                  title={block.title}
                  zoom={block.zoom}
                  isActive={isActive}
                  preferences={preferences}
                  onFocusBlock={() => onSelectBlock(block.id)}
                  onChange={(nextImg) =>
                    updateSingleBlock(block.id, () => ({
                      ...block,
                      ...nextImg,
                    }))
                  }
                />
              )}

              {/* 12. Horizontal Rule */}
              {block.type === 'hr' && (
                <div className="my-6 py-2 cursor-pointer" onClick={() => onSelectBlock(block.id)}>
                  <hr style={{ borderColor: 'var(--border-color)' }} />
                </div>
              )}

              {/* 13. Footnote Definition `[^1]: ...` */}
              {block.type === 'footnote-def' && (
                <div
                  className="my-2 pl-3 border-l-2 text-xs flex items-baseline gap-2"
                  style={{
                    borderLeftColor: 'var(--border-color)',
                    color: 'var(--meta-content-color)',
                  }}
                  onClick={() => onSelectBlock(block.id)}
                >
                  <span className="font-mono font-semibold" style={{ color: 'var(--primary-color)' }}>
                    [^{block.label}]:
                  </span>
                  {isActive ? (
                    <input
                      type="text"
                      autoFocus
                      value={block.content}
                      onChange={(e) =>
                        updateSingleBlock(block.id, () => ({
                          ...block,
                          content: e.target.value,
                        }))
                      }
                      className="flex-1 bg-transparent outline-none"
                    />
                  ) : (
                    <span>{block.content}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
