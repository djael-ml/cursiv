import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Flame,
  GripVertical,
  Info,
  Lightbulb,
  ArrowDown,
  ArrowUp,
  CheckCheck,
  Copy,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Scissors,
  Square,
  Trash2,
  X,
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
import { InlinePageInput, PendingMousePoint, SelectionRangeSpec } from './InlinePageInput';
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
  externalCaretOffset?: number | null;
  externalCaretVersion?: number;
  onChangeBlocks: (nextBlocks: MarkdownBlock[]) => void;
  onSelectBlock: (blockId: string | null, cursorOffset?: number) => void;
  onCursorOffsetChange?: (offset: number | null) => void;
  onActiveHeadingSlugChange?: (slug: string) => void;
  onOpenFile?: (pathOrName: string) => void;
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
  externalCaretOffset = null,
  externalCaretVersion = 0,
  onChangeBlocks,
  onSelectBlock,
  onCursorOffsetChange,
  onActiveHeadingSlugChange,
  onOpenFile,
}) => {
  const [cursorOffset, setCursorOffsetState] = useState<number | null>(externalCaretOffset);
  const [caretVersion, setCaretVersion] = useState<number>(0);
  const [initialBlockSelection, setInitialBlockSelection] = useState<{
    blockId: string;
    spec: SelectionRangeSpec;
  } | null>(null);
  const [pendingMousePoint, setPendingMousePoint] = useState<{
    blockId: string;
    point: PendingMousePoint;
  } | null>(null);
  const mouseDownInsideBlockRef = useRef<boolean>(false);
  const mouseDownCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseDownScrollRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const justFinishedLassoRef = useRef<boolean>(false);
  const activeLassoCleanupRef = useRef<(() => void) | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [activeListItemId, setActiveListItemId] = useState<string | null>(null);
  const [activeCalloutField, setActiveCalloutField] = useState<'title' | 'content'>('content');
  const [collapsedHeadings, setCollapsedHeadings] = useState<Set<string>>(new Set());
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('after');
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

  const setCursorOffset = (next: number | null, bumpVersion = false) => {
    setCursorOffsetState(next);
    onCursorOffsetChange?.(next);
    if (bumpVersion) {
      setCaretVersion((v) => v + 1);
    }
  };

  useEffect(() => {
    if (externalCaretVersion > 0 && externalCaretOffset !== null) {
      setCursorOffsetState(externalCaretOffset);
      setInitialBlockSelection(null);
      setCaretVersion((v) => v + 1);
    }
  }, [externalCaretVersion, externalCaretOffset]);

  // Activate an inactive block at the exact clicked character OR preserve a mouse drag selection (left->right or right->left)
  const activateBlockFromMouse = (
    e: React.MouseEvent<HTMLElement>,
    blockId: string,
    _rawText?: string
  ) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, [data-interactive-token="true"]')) {
      mouseDownInsideBlockRef.current = true;
      mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    mouseDownInsideBlockRef.current = true;
    mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
    mouseDownScrollRef.current = {
      left: scrollContainerRef.current?.scrollLeft ?? 0,
      top: scrollContainerRef.current?.scrollTop ?? 0,
    };
    setSelectedBlockIds([]);
    setInitialBlockSelection(null);
    setPendingMousePoint({
      blockId,
      point: {
        clientX: e.clientX,
        clientY: e.clientY,
        seq: Date.now() + Math.random(),
      },
    });
    onSelectBlock(blockId);
  };

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

  // Move one or multiple blocks up (-1) or down (+1)
  const handleMoveBlocks = (targetIds: string[], direction: -1 | 1) => {
    if (targetIds.length === 0) return;
    const idSet = new Set(targetIds);
    const copy = [...blocks];
    if (direction === -1) {
      for (let i = 1; i < copy.length; i++) {
        if (idSet.has(copy[i].id) && !idSet.has(copy[i - 1].id)) {
          const tmp = copy[i - 1];
          copy[i - 1] = copy[i];
          copy[i] = tmp;
        }
      }
    } else {
      for (let i = copy.length - 2; i >= 0; i--) {
        if (idSet.has(copy[i].id) && !idSet.has(copy[i + 1].id)) {
          const tmp = copy[i + 1];
          copy[i + 1] = copy[i];
          copy[i] = tmp;
        }
      }
    }
    onChangeBlocks(copy);
  };

  // Global Ctrl+A (Select All Document), Alt+ArrowUp / Alt+ArrowDown (move block), and Ctrl+D (duplicate block)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      // Fast, effective Ctrl+A across the whole document
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
        const activeEl = document.activeElement as HTMLElement | null;
        // Let inputs outside the editor sheet (e.g. sidebar search, modals) or CodeMirror blocks handle their own Ctrl+A first
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
          !activeEl.closest('.cursiv-editor-sheet')
        ) {
          return;
        }
        if (activeEl && activeEl.closest('.cm-editor')) {
          return;
        }

        const currentBlocks = blocksRef.current;
        if (currentBlocks.length === 0) return;

        // If the document has only 1 editable text block, select 100% of its text inside InlinePageInput
        if (
          currentBlocks.length === 1 &&
          (currentBlocks[0].type === 'paragraph' ||
            currentBlocks[0].type === 'heading' ||
            currentBlocks[0].type === 'blockquote')
        ) {
          const single = currentBlocks[0];
          if (activeEl && activeEl.tagName === 'TEXTAREA' && activeEl.closest('.cursiv-editor-sheet')) {
            const ta = activeEl as HTMLTextAreaElement;
            if ((ta.selectionStart ?? 0) === 0 && (ta.selectionEnd ?? 0) === ta.value.length && ta.value.length > 0) {
              // Second Ctrl+A selects the block card itself
              e.preventDefault();
              ta.blur();
              onSelectBlockRef.current(null);
              setSelectedBlockIds([single.id]);
              return;
            }
            // Let native textarea select 0..length and sync
            return;
          }
          e.preventDefault();
          setSelectedBlockIds([]);
          setInitialBlockSelection({
            blockId: single.id,
            spec: { start: 0, end: single.text.length, direction: 'forward' },
          });
          setCaretVersion((v) => v + 1);
          onSelectBlockRef.current(single.id, single.text.length);
          return;
        }

        // Multi-block document:
        // Pressing Ctrl+A immediately selects ALL blocks in the document!
        e.preventDefault();
        e.stopPropagation();
        if (activeEl instanceof HTMLElement) {
          activeEl.blur();
        }
        onSelectBlockRef.current(null);
        setSelectedBlockIds(currentBlocks.map((b) => b.id));
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const activeBlock = blocksRef.current.find((b) => b.id === activeBlockId);
        if (activeBlock && (activeBlock.type === 'list' || activeBlock.type === 'table')) {
          return;
        }
        const targets =
          selectedBlockIds.length > 0
            ? selectedBlockIds
            : activeBlockId
            ? [activeBlockId]
            : [];
        if (targets.length > 0) {
          e.preventDefault();
          handleMoveBlocks(targets, e.key === 'ArrowUp' ? -1 : 1);
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
        const targets =
          selectedBlockIds.length > 0
            ? selectedBlockIds
            : activeBlockId
            ? [activeBlockId]
            : [];
        if (targets.length > 0) {
          e.preventDefault();
          handleDuplicateSelectedBlocks();
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', onGlobalKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockId, selectedBlockIds, blocks]);

  // Multi-Block Selection Keyboard Actions (Delete, Backspace, Copy, Cut, Paste, Type-to-replace, Escape)
  useEffect(() => {
    if (selectedBlockIds.length === 0) return;
    const handleKeyDown = async (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'textarea' || activeTag === 'input') return;

      if (e.key === 'Escape') {
        setSelectedBlockIds([]);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        const firstIdx = blocks.findIndex((b) => selectedBlockIds.includes(b.id));
        const remaining = blocks.filter((b) => !selectedBlockIds.includes(b.id));
        const newParaId = nextBlockId('p');
        if (remaining.length === 0) {
          const finalBlocks: MarkdownBlock[] = [{ id: newParaId, type: 'paragraph', text: '' }];
          onChangeBlocks(finalBlocks);
          setSelectedBlockIds([]);
          setCursorOffset(0, true);
          onSelectBlock(newParaId, 0);
        } else {
          onChangeBlocks(remaining);
          setSelectedBlockIds([]);
          const targetIdx = Math.min(Math.max(0, firstIdx), remaining.length - 1);
          setCursorOffset(0, true);
          onSelectBlock(remaining[targetIdx].id, 0);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const chosen = blocks.filter((b) => selectedBlockIds.includes(b.id));
        navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        const chosen = blocks.filter((b) => selectedBlockIds.includes(b.id));
        navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
        const remaining = blocks.filter((b) => !selectedBlockIds.includes(b.id));
        const newParaId = nextBlockId('p');
        const finalBlocks: MarkdownBlock[] =
          remaining.length > 0
            ? remaining
            : [{ id: newParaId, type: 'paragraph', text: '' }];
        onChangeBlocks(finalBlocks);
        setSelectedBlockIds([]);
        setCursorOffset(0, true);
        onSelectBlock(finalBlocks[0].id, 0);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        try {
          const clip = await navigator.clipboard.readText();
          if (!clip) return;
          const parsed = parseMarkdownToBlocks(clip);
          const firstIdx = Math.max(
            0,
            blocks.findIndex((b) => selectedBlockIds.includes(b.id))
          );
          const remaining = blocks.filter((b) => !selectedBlockIds.includes(b.id));
          remaining.splice(firstIdx, 0, ...parsed);
          onChangeBlocks(remaining);
          setSelectedBlockIds([]);
          if (parsed[0]) {
            onSelectBlock(parsed[0].id, 0);
          }
        } catch {
          // ignore clipboard permission errors
        }
        return;
      }

      // Typing a printable character while blocks are selected replaces the selection with a new paragraph
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const firstIdx = Math.max(
          0,
          blocks.findIndex((b) => selectedBlockIds.includes(b.id))
        );
        const remaining = blocks.filter((b) => !selectedBlockIds.includes(b.id));
        const newParaId = nextBlockId('p');
        remaining.splice(firstIdx, 0, { id: newParaId, type: 'paragraph', text: e.key });
        onChangeBlocks(remaining);
        setSelectedBlockIds([]);
        setCursorOffset(1, true);
        onSelectBlock(newParaId, 1);
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

  // Handle smart Auto-Pair, Tab character insertion, Slash Commands & Emoji autocomplete
  const handleSmartKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    block: MarkdownBlock,
    currentText: string,
    applyNewText: (nextText: string, nextCursor: number) => void,
    setProgrammaticSelection?: (
      start: number,
      end: number,
      direction?: 'forward' | 'backward' | 'none'
    ) => void
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
          const nextPos = before.length + inserted.length;
          setProgrammaticSelection?.(nextPos, nextPos, 'none');
          applyNewText(before + inserted + after, nextPos);
          setEmojiPopup(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        setEmojiPopup(null);
        return;
      }
    }

    // Line & indentation geometry around current selection
    const lineStart = currentText.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
    const nextNl = currentText.indexOf('\n', selEnd);
    const lineEnd = nextNl === -1 ? currentText.length : nextNl;
    const currentFullLine = currentText.slice(lineStart, lineEnd);
    const lineBeforeCursor = currentText.slice(lineStart, selStart);
    const indentMatch = currentFullLine.match(/^([\t ]+)/);
    const leadingIndent = indentMatch ? indentMatch[1] : '';
    const indentBeforeCursorMatch = lineBeforeCursor.match(/^([\t ]+)/);
    const effectiveIndent = indentBeforeCursorMatch ? indentBeforeCursorMatch[1] : leadingIndent;
    const isLineOnlyWhitespace = currentFullLine.trim() === '';

    // Tab key inserts a real Tab character `\t` (or indents multi-line selection), Shift+Tab outdents
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const selectedSlice = currentText.slice(selStart, selEnd);
      if (selStart !== selEnd && selectedSlice.includes('\n')) {
        const blockStart = currentText.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
        const endNl = currentText.indexOf('\n', selEnd);
        const blockEnd = endNl === -1 ? currentText.length : endNl;
        const rawLines = currentText.slice(blockStart, blockEnd).split('\n');
        const transformedLines = rawLines.map((l) =>
          !e.shiftKey ? `\t${l}` : l.replace(/^(\t| {1,4})/, '')
        );
        const joined = transformedLines.join('\n');
        const nextText = currentText.slice(0, blockStart) + joined + currentText.slice(blockEnd);
        const nextStart = blockStart;
        const nextEnd = blockStart + joined.length;
        setProgrammaticSelection?.(nextStart, nextEnd, 'forward');
        applyNewText(nextText, nextEnd);
        return;
      }

      if (!e.shiftKey) {
        const nextText = currentText.slice(0, selStart) + '\t' + currentText.slice(selEnd);
        const nextPos = selStart + 1;
        setProgrammaticSelection?.(nextPos, nextPos, 'none');
        applyNewText(nextText, nextPos);
      } else {
        if (selStart === selEnd && selStart > 0 && currentText[selStart - 1] === '\t') {
          const nextText = currentText.slice(0, selStart - 1) + currentText.slice(selEnd);
          const nextPos = selStart - 1;
          setProgrammaticSelection?.(nextPos, nextPos, 'none');
          applyNewText(nextText, nextPos);
        } else if (currentText[lineStart] === '\t') {
          const nextText =
            currentText.slice(0, lineStart) + currentText.slice(lineStart + 1);
          const nextStart = Math.max(lineStart, selStart - 1);
          const nextEnd = Math.max(nextStart, selEnd - 1);
          setProgrammaticSelection?.(nextStart, nextEnd, selStart === selEnd ? 'none' : 'forward');
          applyNewText(nextText, nextEnd);
        } else {
          const spaceMatch = currentText.slice(lineStart).match(/^( {1,4})/);
          if (spaceMatch) {
            const rmLen = spaceMatch[1].length;
            const nextText =
              currentText.slice(0, lineStart) + currentText.slice(lineStart + rmLen);
            const nextStart = Math.max(lineStart, selStart - rmLen);
            const nextEnd = Math.max(nextStart, selEnd - rmLen);
            setProgrammaticSelection?.(nextStart, nextEnd, selStart === selEnd ? 'none' : 'forward');
            applyNewText(nextText, nextEnd);
          }
        }
      }
      return;
    }

    // Skip over closing bracket if typing `)`, `]`, `}` right before an existing one
    if (
      preferences.autoPairBrackets &&
      selStart === selEnd &&
      (e.key === ')' || e.key === ']' || e.key === '}') &&
      currentText[selStart] === e.key &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      const nextPos = selStart + 1;
      setProgrammaticSelection?.(nextPos, nextPos, 'none');
      setCursorOffset(nextPos);
      return;
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

      const nextSelStart = selStart + 1;
      const nextSelEnd = selStart !== selEnd ? selEnd + 1 : selStart + 1;
      setProgrammaticSelection?.(nextSelStart, nextSelEnd, 'forward');
      applyNewText(nextText, nextSelEnd);
      return;
    }

    // Windows inline formatting shortcuts: Ctrl+B (Bold), Ctrl+I (Italic), Ctrl+K (Link)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const keyLower = e.key.toLowerCase();
      if (keyLower === 'b' || keyLower === 'i' || keyLower === 'k') {
        e.preventDefault();
        const selectedSlice = currentText.slice(selStart, selEnd);
        let wrapped = '';
        let innerStart = selStart;
        let innerEnd = selEnd;
        if (keyLower === 'b') {
          const content = selectedSlice || 'texte';
          wrapped = `**${content}**`;
          innerStart = selStart + 2;
          innerEnd = innerStart + content.length;
        } else if (keyLower === 'i') {
          const content = selectedSlice || 'texte';
          wrapped = `*${content}*`;
          innerStart = selStart + 1;
          innerEnd = innerStart + content.length;
        } else {
          const content = selectedSlice || 'lien';
          wrapped = `[${content}](https://)`;
          innerStart = selStart + content.length + 3;
          innerEnd = innerStart + 8;
        }
        const nextText = currentText.slice(0, selStart) + wrapped + currentText.slice(selEnd);
        setProgrammaticSelection?.(innerStart, innerEnd, 'forward');
        applyNewText(nextText, innerEnd);
        return;
      }
    }

    // Cancel any pending debounced Markdown transform when pressing Enter / Shift+Enter / Ctrl+Enter
    if (e.key === 'Enter' && markdownTransformTimerRef.current) {
      window.clearTimeout(markdownTransformTimerRef.current);
      markdownTransformTimerRef.current = null;
    }

    // Ctrl+Enter (or Cmd+Enter) in Paragraph / Heading / Callout / Blockquote immediately creates a new Paragraph block below
    if (
      e.key === 'Enter' &&
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (block.type === 'paragraph' ||
        block.type === 'heading' ||
        block.type === 'callout' ||
        block.type === 'blockquote')
    ) {
      e.preventDefault();
      const idx = blocks.findIndex((b) => b.id === block.id);
      const newParaId = nextBlockId('p');
      const copy = [...blocks];
      if (block.type === 'paragraph' || block.type === 'heading') {
        const beforeCursor = currentText.slice(0, selStart);
        const afterCursor = currentText.slice(selEnd);
        copy[idx] =
          block.type === 'heading'
            ? { ...block, text: beforeCursor, slug: slugifyHeading(beforeCursor || 'titre') }
            : { id: block.id, type: 'paragraph', text: beforeCursor };
        copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: afterCursor });
      } else {
        copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: '' });
      }
      onChangeBlocks(copy);
      setCursorOffset(0, true);
      onSelectBlock(newParaId, 0);
      return;
    }

    // Smooth Title -> Content navigation: pressing Enter or Shift+Enter in a Heading creates/focuses a paragraph below (or above if at offset 0)
    if (
      block.type === 'heading' &&
      e.key === 'Enter' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (selStart === 0 && selEnd === 0 && currentText.trim().length > 0) {
        const newParaId = nextBlockId('p');
        const copy = [...blocks];
        copy.splice(idx, 0, { id: newParaId, type: 'paragraph', text: '' });
        onChangeBlocks(copy);
        setCursorOffset(0, true);
        onSelectBlock(newParaId, 0);
        return;
      }
      const nextBlock = blocks[idx + 1];
      if (
        nextBlock &&
        nextBlock.type === 'paragraph' &&
        nextBlock.text === '' &&
        selEnd === currentText.length
      ) {
        setCursorOffset(0, true);
        onSelectBlock(nextBlock.id, 0);
      } else {
        const beforeCursor = currentText.slice(0, selStart);
        const afterCursor = currentText.slice(selEnd);
        const newParaId = nextBlockId('p');
        const copy = [...blocks];
        copy[idx] = {
          ...block,
          text: beforeCursor,
          slug: slugifyHeading(beforeCursor || 'titre'),
        };
        copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: afterCursor });
        onChangeBlocks(copy);
        setCursorOffset(0, true);
        onSelectBlock(newParaId, 0);
      }
      return;
    }

    // Shift+Enter (Maj+Entrée) in Paragraph / Callout / Blockquote / YAML:
    // Inserts a soft line break preserving current line's Tab indentation (or steps back 1 tab level if on an empty tabbed line)
    if (
      e.key === 'Enter' &&
      e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (block.type === 'paragraph' ||
        block.type === 'callout' ||
        block.type === 'blockquote' ||
        block.type === 'yaml')
    ) {
      e.preventDefault();
      if (isLineOnlyWhitespace && leadingIndent.length > 0) {
        // Step back one tab level (or clear if single tab) on the current empty tabbed line
        const reducedIndent = leadingIndent.replace(/(\t| {1,4})$/, '');
        const nextText =
          currentText.slice(0, lineStart) + reducedIndent + currentText.slice(lineEnd);
        const nextPos = lineStart + reducedIndent.length;
        setProgrammaticSelection?.(nextPos, nextPos, 'none');
        applyNewText(nextText, nextPos);
        return;
      }
      const insertion = `\n${effectiveIndent}`;
      const nextText =
        currentText.slice(0, selStart) + insertion + currentText.slice(selEnd);
      const nextPos = selStart + insertion.length;
      setProgrammaticSelection?.(nextPos, nextPos, 'none');
      applyNewText(nextText, nextPos);
      return;
    }

    // Enter (without Shift) in Callout / Blockquote:
    // Keeps Tab indentation on new lines; exits Tab on second Enter; exits Callout/Blockquote on empty unindented trailing line
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (block.type === 'callout' || block.type === 'blockquote')
    ) {
      e.preventDefault();
      if (isLineOnlyWhitespace && leadingIndent.length > 0) {
        // Exit Tab indentation on the current empty line
        const nextText = currentText.slice(0, lineStart) + currentText.slice(lineEnd);
        setProgrammaticSelection?.(lineStart, lineStart, 'none');
        applyNewText(nextText, lineStart);
        return;
      }
      if (isLineOnlyWhitespace && leadingIndent === '' && lineEnd === currentText.length) {
        // Exit Callout / Blockquote into a new Paragraph block below
        const cleaned = currentText.slice(0, Math.max(0, lineStart - 1));
        const newParaId = nextBlockId('p');
        const idx = blocks.findIndex((b) => b.id === block.id);
        const copy = [...blocks];
        if (!cleaned && block.type === 'blockquote') {
          copy[idx] = { id: newParaId, type: 'paragraph', text: '' };
        } else {
          copy[idx] =
            block.type === 'callout'
              ? { ...block, content: cleaned }
              : { ...block, text: cleaned };
          copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: '' });
        }
        onChangeBlocks(copy);
        setCursorOffset(0, true);
        onSelectBlock(newParaId, 0);
        return;
      }
      const insertion = `\n${effectiveIndent}`;
      const nextText =
        currentText.slice(0, selStart) + insertion + currentText.slice(selEnd);
      const nextPos = selStart + insertion.length;
      setProgrammaticSelection?.(nextPos, nextPos, 'none');
      applyNewText(nextText, nextPos);
      return;
    }

    // Inter-block ArrowUp / ArrowDown navigation (ONLY when no Shift/Ctrl/Alt modifier is held and no text is selected)
    if (
      e.key === 'ArrowUp' &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      selStart === 0 &&
      selEnd === 0
    ) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx > 0) {
        e.preventDefault();
        const prev = blocks[idx - 1];
        setCursorOffset(999999, true);
        onSelectBlock(prev.id, 999999);
        return;
      }
    }
    if (
      e.key === 'ArrowDown' &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      selStart === currentText.length &&
      selEnd === currentText.length
    ) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx >= 0 && idx < blocks.length - 1) {
        e.preventDefault();
        const next = blocks[idx + 1];
        setCursorOffset(0, true);
        onSelectBlock(next.id, 0);
        return;
      }
    }

    // Smart Enter in a Paragraph:
    // 1. Triggers Markdown blocks (`$`, `[TOC]`, `---`, ```lang, `# Heading`, `| Table |`, Lists)
    // 2. When in a Tab (`leadingIndent.length > 0`) with text: stays in the Tab on the new line (`\n` + `effectiveIndent`)
    // 3. When on an empty Tabbed line (`isLineOnlyWhitespace && leadingIndent.length > 0`): exits the Tab to column 0!
    // 4. When on an empty unindented line (`isLineOnlyWhitespace && leadingIndent === ''`): splits into a new Paragraph block!
    // 5. When on a normal line with text: inserts `\n` (compact line break; press Enter a second time for a new Paragraph block)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && block.type === 'paragraph') {
      const trimmed = currentText.trim();

      if (trimmed === '$') {
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

      // Direct list creation on Enter if single-line paragraph starts with `- `, `1. `, or `- [ ] `
      if (!currentText.includes('\n')) {
        const taskTrig =
          currentText.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/) ||
          currentText.match(/^\[\]\s+(.*)$/);
        if (taskTrig) {
          e.preventDefault();
          const checked = taskTrig.length === 3 ? taskTrig[1].toLowerCase() === 'x' : false;
          const firstText = (taskTrig.length === 3 ? taskTrig[2] : taskTrig[1]) || '';
          const firstId = nextBlockId('li');
          const secondId = nextBlockId('li');
          const listId = nextBlockId('list');
          replaceBlockWithMultiple(block.id, [
            {
              id: listId,
              type: 'list',
              listType: 'task',
              items: [
                { id: firstId, indent: 0, checked, text: firstText },
                ...(firstText.trim()
                  ? [{ id: secondId, indent: 0, checked: false, text: '' }]
                  : []),
              ],
            },
          ]);
          setActiveListItemId(firstText.trim() ? secondId : firstId);
          setCursorOffset(0, true);
          return;
        }

        const bulletTrig = currentText.match(/^[-*+]\s+(.+)$/);
        if (bulletTrig) {
          e.preventDefault();
          const firstId = nextBlockId('li');
          const secondId = nextBlockId('li');
          const listId = nextBlockId('list');
          replaceBlockWithMultiple(block.id, [
            {
              id: listId,
              type: 'list',
              listType: 'bullet',
              items: [
                { id: firstId, indent: 0, text: bulletTrig[1] },
                { id: secondId, indent: 0, text: '' },
              ],
            },
          ]);
          setActiveListItemId(secondId);
          setCursorOffset(0, true);
          return;
        }

        const orderedTrig = currentText.match(/^\d+\.\s+(.+)$/);
        if (orderedTrig) {
          e.preventDefault();
          const firstId = nextBlockId('li');
          const secondId = nextBlockId('li');
          const listId = nextBlockId('list');
          replaceBlockWithMultiple(block.id, [
            {
              id: listId,
              type: 'list',
              listType: 'ordered',
              items: [
                { id: firstId, indent: 0, text: orderedTrig[1] },
                { id: secondId, indent: 0, text: '' },
              ],
            },
          ]);
          setActiveListItemId(secondId);
          setCursorOffset(0, true);
          return;
        }
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

      e.preventDefault();

      // Case 1: Cursor is on an empty line that has Tab/space indentation -> Exit the Tab to column 0!
      if (isLineOnlyWhitespace && leadingIndent.length > 0) {
        const nextText = currentText.slice(0, lineStart) + currentText.slice(lineEnd);
        setProgrammaticSelection?.(lineStart, lineStart, 'none');
        applyNewText(nextText, lineStart);
        return;
      }

      // Case 2: Cursor is at the very start of a non-empty unindented paragraph -> Insert empty paragraph above
      if (selStart === 0 && selEnd === 0 && currentText.trim().length > 0 && leadingIndent === '') {
        const newParaId = nextBlockId('p');
        const idx = blocks.findIndex((b) => b.id === block.id);
        const copy = [...blocks];
        copy.splice(idx, 0, { id: newParaId, type: 'paragraph', text: '' });
        onChangeBlocks(copy);
        setCursorOffset(0, true);
        onSelectBlock(block.id, 0);
        return;
      }

      // Case 3: Cursor is on an empty unindented line -> Split into a new Paragraph block below!
      if (isLineOnlyWhitespace && leadingIndent === '') {
        const beforeEmptyLine =
          lineStart > 0 ? currentText.slice(0, lineStart - 1) : '';
        const afterEmptyLine =
          lineEnd < currentText.length ? currentText.slice(lineEnd + 1) : '';
        const newParaId = nextBlockId('p');
        const idx = blocks.findIndex((b) => b.id === block.id);
        const copy = [...blocks];
        copy[idx] = { id: block.id, type: 'paragraph', text: beforeEmptyLine };
        copy.splice(idx + 1, 0, { id: newParaId, type: 'paragraph', text: afterEmptyLine });
        onChangeBlocks(copy);
        setCursorOffset(0, true);
        onSelectBlock(newParaId, 0);
        return;
      }

      // Case 4: Current line has text -> Insert line break `\n` and preserve `effectiveIndent` (stays in Tab if tabbed!)
      const insertion = `\n${effectiveIndent}`;
      const nextText =
        currentText.slice(0, selStart) + insertion + currentText.slice(selEnd);
      const nextPos = selStart + insertion.length;
      setProgrammaticSelection?.(nextPos, nextPos, 'none');
      applyNewText(nextText, nextPos);
      return;
    }

    // Backspace at the very beginning of a Heading progressively demotes it (H3 -> H2 -> H1 -> Paragraph)
    if (e.key === 'Backspace' && selStart === 0 && selEnd === 0 && block.type === 'heading') {
      e.preventDefault();
      if (block.level > 1) {
        const nextLevel = (block.level - 1) as 1 | 2 | 3 | 4 | 5 | 6;
        updateSingleBlock(block.id, () => ({
          ...block,
          level: nextLevel,
        }));
        setCursorOffset(0, true);
        onSelectBlock(block.id, 0);
        return;
      }
      updateSingleBlock(block.id, () => ({
        id: block.id,
        type: 'paragraph',
        text: currentText,
      }));
      setCursorOffset(0, true);
      onSelectBlock(block.id, 0);
      return;
    }

    // Merge with previous block or delete empty paragraph on Backspace at position 0
    if (e.key === 'Backspace' && selStart === 0 && selEnd === 0 && blocks.length > 1) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx > 0) {
        const prevBlock = blocks[idx - 1];
        if (prevBlock.type === 'paragraph' || prevBlock.type === 'heading') {
          e.preventDefault();
          const joinOffset = prevBlock.text.length;
          const mergedText = prevBlock.text + currentText;
          const copy = [...blocks];
          copy[idx - 1] =
            prevBlock.type === 'heading'
              ? {
                  ...prevBlock,
                  text: mergedText,
                  slug: slugifyHeading(mergedText || 'titre'),
                }
              : {
                  ...prevBlock,
                  text: mergedText,
                };
          copy.splice(idx, 1);
          onChangeBlocks(copy);
          setCursorOffset(joinOffset, true);
          onSelectBlock(prevBlock.id, joinOffset);
          return;
        }
        if (currentText === '') {
          e.preventDefault();
          const nextBlocks = blocks.filter((b) => b.id !== block.id);
          onChangeBlocks(nextBlocks);
          onSelectBlock(prevBlock.id, 9999);
          return;
        }
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
      // Instant transformation if user typed the trailing space trigger, debounced (350ms) otherwise
      const hasSpaceTrigger = /^(#{1,6}|[-*+]|>\s*|\d+\.)\s/.test(textValue);
      const delay = hasSpaceTrigger ? 0 : 350;

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
      }, delay);
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
    if (/^https?:\/\//i.test(slugOrUrl)) {
      window.open(slugOrUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // WikiLink internal note navigation (e.g. [[Architecture]] or [[Note.md]])
    if (onOpenFile) {
      onOpenFile(slugOrUrl);
      return;
    }
    window.open(slugOrUrl, '_blank', 'noopener,noreferrer');
  };

  // Notion-style Marquee / Lasso Selection when dragging exclusively from the outer gutters / margins
  // Starts a document-anchored sliding selection rectangle (lasso) with automatic viewport-edge scrolling
  const startSlidingLassoSelection = (
    startClientX: number,
    startClientY: number,
    startScrollLeft: number,
    startScrollTop: number,
    initialCurrentX?: number,
    initialCurrentY?: number,
    forceImmediate = false
  ) => {
    activeLassoCleanupRef.current?.();

    const scrollEl = scrollContainerRef.current;
    const startDocX = startClientX + startScrollLeft;
    const startDocY = startClientY + startScrollTop;

    let isDraggingLasso = forceImmediate;
    let latestHitIds: string[] = [];
    let lastClientX = initialCurrentX ?? startClientX;
    let lastClientY = initialCurrentY ?? startClientY;
    let autoScrollRaf: number | null = null;

    const recomputeLasso = () => {
      const curScrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
      const curScrollTop = scrollEl ? scrollEl.scrollTop : 0;

      // Anchor point slides in lockstep with the document scroll position!
      const anchorClientX = startDocX - curScrollLeft;
      const anchorClientY = startDocY - curScrollTop;

      const dist = Math.hypot(lastClientX - anchorClientX, lastClientY - anchorClientY);
      if (!isDraggingLasso && dist > 4) {
        isDraggingLasso = true;
        onSelectBlockRef.current(null);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.getSelection()?.removeAllRanges();
      }

      if (!isDraggingLasso) return;

      // Full logical selection rectangle in current viewport space (including scrolled-past regions)
      const left = Math.min(anchorClientX, lastClientX);
      const right = Math.max(anchorClientX, lastClientX);
      const top = Math.min(anchorClientY, lastClientY);
      const bottom = Math.max(anchorClientY, lastClientY);

      // Clamp visual rectangle to the visible scroll container viewport so it slides cleanly
      const bounds = scrollEl?.getBoundingClientRect();
      const minVisX = bounds ? bounds.left : 0;
      const maxVisX = bounds ? bounds.right : window.innerWidth;
      const minVisY = bounds ? bounds.top : 0;
      const maxVisY = bounds ? bounds.bottom : window.innerHeight;

      const visStartX = Math.max(minVisX, Math.min(maxVisX, anchorClientX));
      const visStartY = Math.max(minVisY, Math.min(maxVisY, anchorClientY));
      const visCurX = Math.max(minVisX, Math.min(maxVisX, lastClientX));
      const visCurY = Math.max(minVisY, Math.min(maxVisY, lastClientY));

      setLassoBox({
        startX: visStartX,
        startY: visStartY,
        currentX: visCurX,
        currentY: visCurY,
      });

      const hitIds: string[] = [];
      for (const b of blocksRef.current) {
        const el = blockDomRefs.current[b.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const intersects = r.left <= right && r.right >= left && r.top <= bottom && r.bottom >= top;
        if (intersects) {
          hitIds.push(b.id);
        }
      }
      latestHitIds = hitIds;
      setSelectedBlockIds(hitIds);
    };

    if (forceImmediate) {
      onSelectBlockRef.current(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
      recomputeLasso();
    }

    const EDGE_ZONE = 95;
    const MAX_SCROLL_SPEED = 24;

    const tickAutoScroll = () => {
      if (isDraggingLasso && scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        let dy = 0;

        if (lastClientY > rect.bottom - EDGE_ZONE) {
          const ratio = Math.min(
            1,
            Math.max(0, (lastClientY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE)
          );
          dy = Math.ceil(2 + ratio * ratio * MAX_SCROLL_SPEED);
        } else if (lastClientY < rect.top + EDGE_ZONE) {
          const ratio = Math.min(
            1,
            Math.max(0, (rect.top + EDGE_ZONE - lastClientY) / EDGE_ZONE)
          );
          dy = -Math.ceil(2 + ratio * ratio * MAX_SCROLL_SPEED);
        }

        if (dy !== 0) {
          const prevTop = scrollEl.scrollTop;
          scrollEl.scrollTop += dy;
          if (scrollEl.scrollTop !== prevTop) {
            recomputeLasso();
          }
        }
      }
      autoScrollRaf = window.requestAnimationFrame(tickAutoScroll);
    };
    autoScrollRaf = window.requestAnimationFrame(tickAutoScroll);

    const onMouseMove = (moveEvent: MouseEvent) => {
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      recomputeLasso();
    };

    const onScroll = () => {
      if (isDraggingLasso) {
        recomputeLasso();
      }
    };

    const cleanup = () => {
      if (autoScrollRaf !== null) {
        window.cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scrollEl?.removeEventListener('scroll', onScroll);
      activeLassoCleanupRef.current = null;
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      cleanup();
      setLassoBox(null);

      if (!isDraggingLasso) {
        return;
      }

      justFinishedLassoRef.current = true;
      window.setTimeout(() => {
        justFinishedLassoRef.current = false;
      }, 140);

      const curScrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
      const curScrollTop = scrollEl ? scrollEl.scrollTop : 0;
      const finalAnchorX = startDocX - curScrollLeft;
      const finalAnchorY = startDocY - curScrollTop;
      const finalX = upEvent.clientX;
      const finalY = upEvent.clientY;

      // If the selection rectangle intersected a single editable paragraph or heading block,
      // select the exact text covered by the rectangle inside that block!
      if (latestHitIds.length === 1) {
        const singleId = latestHitIds[0];
        const singleBlock = blocksRef.current.find((b) => b.id === singleId);
        if (
          singleBlock &&
          (singleBlock.type === 'paragraph' || singleBlock.type === 'heading')
        ) {
          setSelectedBlockIds([]);
          setInitialBlockSelection(null);
          setPendingMousePoint({
            blockId: singleId,
            point: {
              clientX: finalAnchorX,
              clientY: finalAnchorY,
              endX: finalX,
              endY: finalY,
              seq: Date.now() + Math.random(),
            },
          });
          onSelectBlockRef.current(singleId);
          return;
        }
      }

      // Otherwise keep all intersected blocks selected (for multi-block Copy, Cut, Delete, or Context Menu)
      setSelectedBlockIds(latestHitIds);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    scrollEl?.addEventListener('scroll', onScroll, { passive: true });
    activeLassoCleanupRef.current = cleanup;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
    mouseDownScrollRef.current = {
      left: scrollContainerRef.current?.scrollLeft ?? 0,
      top: scrollContainerRef.current?.scrollTop ?? 0,
    };

    // If clicking directly inside a block or interactive element, allow inline text selection
    if (
      target.closest('.cursiv-block') ||
      target.closest('textarea') ||
      target.closest('input') ||
      target.closest('button') ||
      target.closest('.cm-editor')
    ) {
      mouseDownInsideBlockRef.current = true;
      if (selectedBlockIds.length > 0) {
        setSelectedBlockIds([]);
      }
      return;
    }

    mouseDownInsideBlockRef.current = false;
    startSlidingLassoSelection(
      e.clientX,
      e.clientY,
      mouseDownScrollRef.current.left,
      mouseDownScrollRef.current.top
    );
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
      className="relative min-h-full w-full select-text"
      onMouseDown={handleCanvasMouseDown}
      onClick={(e) => {
        const movedDist = Math.hypot(
          e.clientX - mouseDownCoordsRef.current.x,
          e.clientY - mouseDownCoordsRef.current.y
        );
        if (justFinishedLassoRef.current || mouseDownInsideBlockRef.current || movedDist > 6) {
          mouseDownInsideBlockRef.current = false;
          return;
        }
        const target = e.target as HTMLElement;
        if (!target.closest('.cursiv-block') && !target.closest('button')) {
          onSelectBlock(null);
          setSelectedBlockIds([]);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      }}
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
    >
      {/* Cursiv Glassmorphism Floating Toolbar */}
      <FloatingToolbar
        visible={preferences.showFloatingToolbar || selectedBlockIds.length > 1}
        onWrapInline={handleWrapInlineToolbar}
        onInsertBlock={handleInsertBlockToolbar}
      />

      {/* Floating Multi-Block Selection Action Bar (appears when selecting blocks with rectangle or handle) */}
      {selectedBlockIds.length > 0 && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="no-print no-export cursiv-popup-anim cursiv-glass-toolbar fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-2xl border text-xs"
          style={{
            borderColor: 'var(--border-color)',
            color: 'var(--text-color)',
          }}
        >
          <span
            className="font-semibold px-2 py-0.5 rounded-md mr-1"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary-color) 16%, transparent)',
              color: 'var(--primary-color)',
            }}
          >
            {selectedBlockIds.length} bloc{selectedBlockIds.length > 1 ? 's' : ''} sélectionné{selectedBlockIds.length > 1 ? 's' : ''}
          </span>

          <button
            type="button"
            onClick={() => handleMoveBlocks(selectedBlockIds, -1)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Monter la sélection (Alt+↑)"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleMoveBlocks(selectedBlockIds, 1)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Descendre la sélection (Alt+↓)"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px mx-0.5" style={{ backgroundColor: 'var(--border-color)' }} />

          <select
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                handleConvertBlockType(val as Parameters<typeof handleConvertBlockType>[0]);
                e.target.value = '';
              }
            }}
            className="px-1.5 py-0.5 rounded border text-xs bg-transparent cursor-pointer"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-color)' }}
            title="Convertir les blocs sélectionnés en..."
          >
            <option value="" disabled>
              Convertir en...
            </option>
            <option value="paragraph">Paragraphe</option>
            <option value="h1">Titre H1</option>
            <option value="h2">Titre H2</option>
            <option value="h3">Titre H3</option>
            <option value="bullet-list">Liste à puces</option>
            <option value="ordered-list">Liste numérotée</option>
            <option value="task-list">Liste de tâches</option>
            <option value="blockquote">Citation</option>
            <option value="callout">Alerte Callout</option>
            <option value="code">Bloc de code</option>
          </select>

          <div className="h-3.5 w-px mx-0.5" style={{ backgroundColor: 'var(--border-color)' }} />

          <button
            type="button"
            onClick={() => {
              const chosen = blocks.filter((b) => selectedBlockIds.includes(b.id));
              navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
            }}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Copier le Markdown (Ctrl+C)"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copier</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const chosen = blocks.filter((b) => selectedBlockIds.includes(b.id));
              navigator.clipboard?.writeText(serializeBlocksToMarkdown(chosen));
              handleDeleteSelectedBlocks();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Couper (Ctrl+X)"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Couper</span>
          </button>
          <button
            type="button"
            onClick={handleDuplicateSelectedBlocks}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Dupliquer (Ctrl+D)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Dupliquer</span>
          </button>
          <button
            type="button"
            onClick={handleDeleteSelectedBlocks}
            className="flex items-center gap-1 px-2 py-1 rounded text-red-500 hover:bg-red-500/10 cursor-pointer"
            title="Supprimer (Suppr / Backspace)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Supprimer</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedBlockIds([])}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer opacity-70 hover:opacity-100"
            title="Désélectionner (Échap)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
        style={{
          maxWidth: `${preferences.maxPageWidth || 820}px`,
          zoom: (preferences.pageZoom || 100) / 100,
        }}
        onClick={(e) => {
          const movedDist = Math.hypot(
            e.clientX - mouseDownCoordsRef.current.x,
            e.clientY - mouseDownCoordsRef.current.y
          );
          if (mouseDownInsideBlockRef.current || movedDist > 6) {
            mouseDownInsideBlockRef.current = false;
            return;
          }
          if (e.target === e.currentTarget && selectedBlockIds.length === 0) {
            const last = blocks[blocks.length - 1];
            const lastEl = last ? blockDomRefs.current[last.id] : null;
            const clickedBelowLastBlock =
              !lastEl || e.clientY > lastEl.getBoundingClientRect().bottom + 14;
            if (clickedBelowLastBlock) {
              if (last && last.type === 'paragraph') {
                onSelectBlock(last.id, last.text.length);
                setCursorOffset(last.text.length, true);
              } else {
                const newParaId = nextBlockId('p');
                onChangeBlocks([...blocks, { id: newParaId, type: 'paragraph', text: '' }]);
                onSelectBlock(newParaId, 0);
                setCursorOffset(0, true);
              }
            } else {
              onSelectBlock(null);
              setSelectedBlockIds([]);
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }
          }
        }}
        className={`cursiv-editor-sheet mx-auto px-5 sm:px-10 md:px-14 pt-8 sm:pt-12 pb-44 select-text ${
          preferences.focusMode ? 'cursiv-focus-mode' : ''
        } ${preferences.focusModeBlur ? 'cursiv-focus-blur' : ''} ${
          preferences.autoNumberHeadings ? 'auto-number-headings' : ''
        }`}
      >
        {(() => {
          // Compute blocks hidden under collapsed parent headings (H1..H6)
          const hiddenBlockIds = new Set<string>();
          if (collapsedHeadings.size > 0) {
            let activeCollapseLevel: number | null = null;
            for (const b of blocks) {
              if (b.type === 'heading') {
                if (activeCollapseLevel !== null && b.level <= activeCollapseLevel) {
                  activeCollapseLevel = null;
                }
                if (collapsedHeadings.has(b.id)) {
                  activeCollapseLevel = b.level;
                } else if (activeCollapseLevel !== null) {
                  hiddenBlockIds.add(b.id);
                }
              } else if (activeCollapseLevel !== null) {
                hiddenBlockIds.add(b.id);
              }
            }
          }

          return blocks.map((block) => {
            if (hiddenBlockIds.has(block.id)) return null;

            const isActive = activeBlockId === block.id;
            const isLassoSelected = selectedBlockIds.includes(block.id);
            const isDragTarget = dragOverBlockId === block.id && draggedBlockId !== block.id;
            const dragIndicatorClass = isDragTarget
              ? dragOverPosition === 'before'
                ? 'border-t-2 border-[var(--primary-color)]'
                : 'border-b-2 border-[var(--primary-color)]'
              : '';

            return (
              <div
                key={block.id}
                data-block-id={block.id}
                ref={(el) => {
                  blockDomRefs.current[block.id] = el;
                }}
                onDragOver={(e) => {
                  if (!draggedBlockId || draggedBlockId === block.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const rect = e.currentTarget.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  const pos = e.clientY < midY ? 'before' : 'after';
                  if (dragOverBlockId !== block.id || dragOverPosition !== pos) {
                    setDragOverBlockId(block.id);
                    setDragOverPosition(pos);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) {
                    setDragOverBlockId((cur) => (cur === block.id ? null : cur));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData('text/plain') || draggedBlockId;
                  if (!sourceId || sourceId === block.id) {
                    setDraggedBlockId(null);
                    setDragOverBlockId(null);
                    return;
                  }
                  const fromIdx = blocks.findIndex((b) => b.id === sourceId);
                  let toIdx = blocks.findIndex((b) => b.id === block.id);
                  if (fromIdx === -1 || toIdx === -1) return;

                  if (dragOverPosition === 'after') {
                    toIdx = toIdx + 1;
                  }
                  const copy = [...blocks];
                  const [moved] = copy.splice(fromIdx, 1);
                  const targetPos = fromIdx < toIdx ? toIdx - 1 : toIdx;
                  copy.splice(targetPos, 0, moved);

                  onChangeBlocks(copy);
                  setDraggedBlockId(null);
                  setDragOverBlockId(null);
                }}
                className={`cursiv-block group/block relative transition-all duration-75 ${dragIndicatorClass} ${
                  isActive ? 'cursiv-block-active' : ''
                } ${isLassoSelected ? 'cursiv-block-selected' : ''}`}
              >
                {/* Notion-style Left Margin Block Handle (Draggable to reorder, Click to select, Right-click for menu) */}
                <button
                  type="button"
                  tabIndex={-1}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', block.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggedBlockId(block.id);
                  }}
                  onDragEnd={() => {
                    setDraggedBlockId(null);
                    setDragOverBlockId(null);
                  }}
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
                  title="Glisser pour réorganiser · Cliquer pour sélectionner · Clic droit pour les options"
                  className="no-print no-export opacity-0 group-hover/block:opacity-45 hover:!opacity-100 absolute -left-7 top-1.5 p-0.5 rounded hover:bg-black/6 dark:hover:bg-white/10 transition-opacity cursor-grab active:cursor-grabbing hidden sm:flex items-center justify-center"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>

                {/* Right Hover Quick-Action Pill for instant element manipulation */}
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="no-print no-export opacity-0 group-hover/block:opacity-85 hover:!opacity-100 absolute -top-3 right-1 z-30 hidden sm:flex items-center gap-0.5 px-1 py-0.5 rounded-md border shadow-sm transition-opacity text-[11px]"
                  style={{
                    backgroundColor: 'var(--bg-color)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--meta-content-color)',
                  }}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveBlocks([block.id], -1);
                    }}
                    className="p-0.5 rounded hover:bg-black/8 dark:hover:bg-white/10 cursor-pointer"
                    title="Monter ce bloc (Alt+↑)"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveBlocks([block.id], 1);
                    }}
                    className="p-0.5 rounded hover:bg-black/8 dark:hover:bg-white/10 cursor-pointer"
                    title="Descendre ce bloc (Alt+↓)"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      const idx = blocks.findIndex((b) => b.id === block.id);
                      if (idx !== -1) {
                        const copy = [...blocks];
                        const cloned = { ...block, id: nextBlockId(block.type) };
                        copy.splice(idx + 1, 0, cloned);
                        onChangeBlocks(copy);
                        onSelectBlock(cloned.id, 0);
                      }
                    }}
                    className="p-0.5 rounded hover:bg-black/8 dark:hover:bg-white/10 cursor-pointer"
                    title="Dupliquer ce bloc (Ctrl+D)"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      const idx = blocks.findIndex((b) => b.id === block.id);
                      const newId = nextBlockId('p');
                      const copy = [...blocks];
                      copy.splice(idx + 1, 0, { id: newId, type: 'paragraph', text: '' });
                      onChangeBlocks(copy);
                      setCursorOffset(0, true);
                      onSelectBlock(newId, 0);
                    }}
                    className="p-0.5 rounded hover:bg-black/8 dark:hover:bg-white/10 cursor-pointer"
                    title="Insérer un paragraphe en dessous"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      const remaining = blocks.filter((b) => b.id !== block.id);
                      const finalBlocks: MarkdownBlock[] =
                        remaining.length > 0
                          ? remaining
                          : [{ id: nextBlockId('p'), type: 'paragraph', text: '' }];
                      onChangeBlocks(finalBlocks);
                      onSelectBlock(finalBlocks[0].id, 0);
                    }}
                    className="p-0.5 rounded text-red-500 hover:bg-red-500/10 cursor-pointer"
                    title="Supprimer ce bloc"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockIds([block.id]);
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        targetBlockId: block.id,
                        selectedBlockCount: 1,
                      });
                    }}
                    className="p-0.5 rounded hover:bg-black/8 dark:hover:bg-white/10 cursor-pointer"
                    title="Plus d'options & Convertir..."
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </div>
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
                  className="my-4 p-3 rounded-lg border font-mono text-xs cursor-text"
                  style={{
                    backgroundColor: 'var(--code-bg-color)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--meta-content-color)',
                  }}
                  onMouseDown={(e) => activateBlockFromMouse(e, block.id, block.raw)}
                >
                  <div className="flex items-center justify-between mb-1 opacity-70 select-none">
                    <span>--- YAML Front Matter</span>
                    <span> métadonnées & surcharge export ---</span>
                  </div>
                  {isActive ? (
                    <InlinePageInput
                      value={block.raw}
                      multiline={true}
                      autoFocus
                      initialCaretOffset={cursorOffset}
                      pendingMouseDownPoint={
                        pendingMousePoint?.blockId === block.id
                          ? pendingMousePoint.point
                          : null
                      }
                      externalCaretVersion={caretVersion}
                      motionBlur={preferences.caretMotionBlur}
                      smartTypography={false}
                      placeholder="title: Document\nauthor: Djaël Mola"
                      style={{ color: 'var(--text-color)' }}
                      onCursorChange={(caret) => setCursorOffset(caret)}
                      onChange={(val, caret) => {
                        setCursorOffset(caret);
                        updateSingleBlock(block.id, () => ({ ...block, raw: val }));
                      }}
                      onKeyDown={(e, setProgrammaticSelection) =>
                        handleSmartKeyDown(
                          e,
                          block,
                          block.raw,
                          (nextText, nextPos) => {
                            updateSingleBlock(block.id, () => ({ ...block, raw: nextText }));
                            setCursorOffset(nextPos);
                          },
                          setProgrammaticSelection
                        )
                      }
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap m-0" style={{ tabSize: 4, color: 'var(--text-color)' }}>
                      {block.raw}
                    </pre>
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

                  const isFolded = collapsedHeadings.has(block.id);

                  return (
                    <Tag
                      id={block.slug}
                      style={{
                        fontFamily: 'var(--font-heading)',
                        borderColor:
                          block.level <= 2 ? 'var(--border-color)' : 'transparent',
                      }}
                      className={`${sizeClasses[block.level]} flex items-baseline gap-1.5 cursor-text group/heading relative`}
                      onMouseDown={(e) => activateBlockFromMouse(e, block.id, block.text)}
                    >
                      <button
                        type="button"
                        contentEditable={false}
                        tabIndex={-1}
                        title={isFolded ? 'Déplier la section' : 'Replier la section'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedHeadings((prev) => {
                            const next = new Set(prev);
                            if (next.has(block.id)) {
                              next.delete(block.id);
                            } else {
                              next.add(block.id);
                            }
                            return next;
                          });
                        }}
                        className={`inline-flex items-center justify-center p-0.5 rounded transition-opacity cursor-pointer text-[var(--text-color)] select-none mr-0.5 ${
                          isFolded
                            ? 'opacity-100 text-[var(--primary-color)]'
                            : 'opacity-0 group-hover/heading:opacity-60 hover:!opacity-100'
                        }`}
                      >
                        {isFolded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
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
                          initialCaretOffset={cursorOffset}
                          initialSelection={
                            initialBlockSelection?.blockId === block.id
                              ? initialBlockSelection.spec
                              : null
                          }
                          pendingMouseDownPoint={
                            pendingMousePoint?.blockId === block.id
                              ? pendingMousePoint.point
                              : null
                          }
                          externalCaretVersion={caretVersion}
                          motionBlur={preferences.caretMotionBlur}
                          smartTypography={preferences.smartTypography}
                          placeholder="Titre du document..."
                          onCrossBlockDrag={(startX, startY, curX, curY) => {
                            if (blocksRef.current.length <= 1) return false;
                            startSlidingLassoSelection(
                              startX,
                              startY,
                              mouseDownScrollRef.current.left,
                              mouseDownScrollRef.current.top,
                              curX,
                              curY,
                              true
                            );
                            return true;
                          }}
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
                          onKeyDown={(e, setProgrammaticSelection) =>
                            handleSmartKeyDown(
                              e,
                              block,
                              block.text,
                              (nextText, nextPos) => {
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  text: nextText,
                                  slug: slugifyHeading(nextText),
                                }));
                                setCursorOffset(nextPos);
                              },
                              setProgrammaticSelection
                            )
                          }
                          className="flex-1"
                        />
                      ) : (
                        <span className="heading-content flex items-baseline gap-2">
                          <LiveInlineTokens
                            text={block.text}
                            isBlockActive={false}
                            cursorOffset={null}
                            mathEnv={mathEnv}
                            footnotesMap={footnotesMap}
                            pandocMathRules={preferences.inlineMathPandocRules}
                            onNavigateAnchor={navigateAnchorOrUrl}
                          />
                          {isFolded && (
                            <span
                              contentEditable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCollapsedHeadings((prev) => {
                                  const next = new Set(prev);
                                  next.delete(block.id);
                                  return next;
                                });
                              }}
                              className="text-xs font-normal px-2 py-0.5 rounded-full bg-[var(--hover-bg-color)] border border-[var(--border-color)] text-[var(--primary-color)] cursor-pointer select-none"
                            >
                              ··· section repliée
                            </span>
                          )}
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
                  onMouseDown={(e) => activateBlockFromMouse(e, block.id, block.text)}
                >
                  {isActive ? (
                    <InlinePageInput
                      value={block.text}
                      multiline={true}
                      autoFocus
                      initialCaretOffset={cursorOffset}
                      initialSelection={
                        initialBlockSelection?.blockId === block.id
                          ? initialBlockSelection.spec
                          : null
                      }
                      pendingMouseDownPoint={
                        pendingMousePoint?.blockId === block.id
                          ? pendingMousePoint.point
                          : null
                      }
                      externalCaretVersion={caretVersion}
                      motionBlur={preferences.caretMotionBlur}
                      smartTypography={preferences.smartTypography}
                      placeholder="Rédigez ou tapez / pour les commandes (/title, /table, /code...)"
                      onCrossBlockDrag={(startX, startY, curX, curY) => {
                        if (blocksRef.current.length <= 1) return false;
                        startSlidingLassoSelection(
                          startX,
                          startY,
                          mouseDownScrollRef.current.left,
                          mouseDownScrollRef.current.top,
                          curX,
                          curY,
                          true
                        );
                        return true;
                      }}
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
                      onKeyDown={(e, setProgrammaticSelection) =>
                        handleSmartKeyDown(
                          e,
                          block,
                          block.text,
                          (nextText, nextPos) => {
                            updateSingleBlock(block.id, () => ({ ...block, text: nextText }));
                            setCursorOffset(nextPos);
                          },
                          setProgrammaticSelection
                        )
                      }
                    />
                  ) : (
                    <p className="m-0 whitespace-pre-wrap break-words min-h-[1.6rem]" style={{ tabSize: 4 }}>
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

              {/* 5. Lists: Ordered, Unordered, GFM Interactive Task Lists (`- [ ]` / `- [x]`) with Smooth Gliding Caret */}
              {block.type === 'list' &&
                (() => {
                  const totalTasks = block.items.length;
                  const completedTasks =
                    block.listType === 'task'
                      ? block.items.filter((it) => it.checked).length
                      : 0;
                  const taskPercent =
                    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                  // Compute hierarchical numbering (1. -> a. -> i.) per indentation level
                  const orderedCounters = [0, 0, 0, 0, 0, 0, 0];
                  const toRoman = (n: number): string => {
                    const romans: Array<[number, string]> = [
                      [10, 'x'],
                      [9, 'ix'],
                      [5, 'v'],
                      [4, 'iv'],
                      [1, 'i'],
                    ];
                    let rem = Math.max(1, n);
                    let out = '';
                    for (const [val, sym] of romans) {
                      while (rem >= val) {
                        out += sym;
                        rem -= val;
                      }
                    }
                    return out;
                  };

                  const effectiveActiveItemId =
                    activeListItemId && block.items.some((it) => it.id === activeListItemId)
                      ? activeListItemId
                      : block.items[0]?.id ?? null;

                  return (
                    <div className="my-4">
                      {/* List Toolbar + Task Progress Indicator */}
                      {(isActive || block.listType === 'task') && (
                        <div
                          className="no-print no-export cursiv-popup-anim flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 mb-2 rounded-lg border text-xs"
                          style={{
                            backgroundColor: 'var(--code-bg-color)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--meta-content-color)',
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="mr-1 font-medium">Liste :</span>
                            <button
                              type="button"
                              onClick={() =>
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  listType: 'bullet',
                                }))
                              }
                              className={`p-1 rounded cursor-pointer ${
                                block.listType === 'bullet'
                                  ? 'text-[var(--primary-color)] bg-blue-500/10'
                                  : 'hover:bg-black/8'
                              }`}
                              title="Liste à puces hiérarchique"
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  listType: 'ordered',
                                }))
                              }
                              className={`p-1 rounded cursor-pointer ${
                                block.listType === 'ordered'
                                  ? 'text-[var(--primary-color)] bg-blue-500/10'
                                  : 'hover:bg-black/8'
                              }`}
                              title="Liste numérotée (1. / a. / i.)"
                            >
                              <ListOrdered className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  listType: 'task',
                                }))
                              }
                              className={`p-1 rounded cursor-pointer ${
                                block.listType === 'task'
                                  ? 'text-[var(--primary-color)] bg-blue-500/10'
                                  : 'hover:bg-black/8'
                              }`}
                              title="Liste de tâches interactive (- [ ])"
                            >
                              <ListChecks className="w-3.5 h-3.5" />
                            </button>

                            <div
                              className="h-3.5 w-px mx-1"
                              style={{ backgroundColor: 'var(--border-color)' }}
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const newId = nextBlockId('li');
                                const lastIndent =
                                  block.items[block.items.length - 1]?.indent ?? 0;
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  items: [
                                    ...block.items,
                                    { id: newId, indent: lastIndent, text: '', checked: false },
                                  ],
                                }));
                                setActiveListItemId(newId);
                                setCursorOffset(0, true);
                                onSelectBlock(block.id, 0);
                              }}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-black/8 cursor-pointer"
                              title="Ajouter un élément (Entrée)"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Élément</span>
                            </button>

                            {block.listType === 'task' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allChecked = block.items.every((it) => it.checked);
                                    updateSingleBlock(block.id, () => ({
                                      ...block,
                                      items: block.items.map((it) => ({
                                        ...it,
                                        checked: !allChecked,
                                      })),
                                    }));
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-black/8 cursor-pointer"
                                  title="Tout cocher / Tout décocher"
                                >
                                  <CheckCheck className="w-3.5 h-3.5" />
                                  <span>
                                    {block.items.every((it) => it.checked)
                                      ? 'Tout décocher'
                                      : 'Tout cocher'}
                                  </span>
                                </button>
                              </>
                            )}
                          </div>

                          {block.listType === 'task' && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px]">
                                {completedTasks}/{totalTasks} ({taskPercent}%)
                              </span>
                              <div
                                className="w-20 h-1.5 rounded-full overflow-hidden"
                                style={{ backgroundColor: 'var(--border-color)' }}
                              >
                                <div
                                  className="h-full transition-all duration-200 rounded-full"
                                  style={{
                                    width: `${taskPercent}%`,
                                    backgroundColor: 'var(--primary-color)',
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <ul className="space-y-1.5">
                        {block.items.map((item, itemIdx) => {
                          const lvl = Math.max(0, Math.min(6, item.indent));
                          orderedCounters[lvl] += 1;
                          for (let k = lvl + 1; k < orderedCounters.length; k++) {
                            orderedCounters[k] = 0;
                          }
                          const countVal = orderedCounters[lvl];
                          const orderedLabel =
                            lvl % 3 === 0
                              ? `${countVal}.`
                              : lvl % 3 === 1
                              ? `${String.fromCharCode(96 + ((countVal - 1) % 26) + 1)}.`
                              : `${toRoman(countVal)}.`;
                          const bulletChar = lvl === 0 ? '•' : lvl === 1 ? '◦' : '▪';

                          const isItemActive = isActive && effectiveActiveItemId === item.id;
                          const itemPointKey = `${block.id}:${item.id}`;

                          return (
                            <li
                              key={item.id}
                              style={{ paddingLeft: `${item.indent * 1.5}rem` }}
                              className="flex items-baseline gap-2.5 leading-relaxed cursor-text group/listitem"
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                const target = e.target as HTMLElement;
                                if (target.closest('button, a, input, textarea')) {
                                  mouseDownInsideBlockRef.current = true;
                                  mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
                                  return;
                                }
                                e.preventDefault();
                                mouseDownInsideBlockRef.current = true;
                                mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
                                setSelectedBlockIds([]);
                                setActiveListItemId(item.id);
                                setPendingMousePoint({
                                  blockId: itemPointKey,
                                  point: {
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                    seq: Date.now() + Math.random(),
                                  },
                                });
                                onSelectBlock(block.id);
                              }}
                            >
                              {block.listType === 'task' ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextItems = block.items.map((it, i) =>
                                      i === itemIdx ? { ...it, checked: !it.checked } : it
                                    );
                                    updateSingleBlock(block.id, () => ({
                                      ...block,
                                      items: nextItems,
                                    }));
                                  }}
                                  className="translate-y-0.5 cursor-pointer shrink-0 transition-transform active:scale-90"
                                  style={{
                                    color: item.checked
                                      ? 'var(--primary-color)'
                                      : 'var(--md-char-color)',
                                  }}
                                  title="Cocher / Décocher (Ctrl+Entrée)"
                                >
                                  {item.checked ? (
                                    <CheckSquare className="w-4 h-4" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </button>
                              ) : block.listType === 'ordered' ? (
                                <span
                                  className="font-mono text-sm shrink-0 select-none min-w-[1.4rem] text-right"
                                  style={{ color: 'var(--meta-content-color)' }}
                                >
                                  {orderedLabel}
                                </span>
                              ) : (
                                <span
                                  className="text-base leading-none shrink-0 select-none w-3.5 text-center"
                                  style={{ color: 'var(--meta-content-color)' }}
                                >
                                  {bulletChar}
                                </span>
                              )}

                              {isItemActive ? (
                                <InlinePageInput
                                  value={item.text}
                                  multiline={true}
                                  autoFocus
                                  initialCaretOffset={cursorOffset}
                                  pendingMouseDownPoint={
                                    pendingMousePoint?.blockId === itemPointKey
                                      ? pendingMousePoint.point
                                      : null
                                  }
                                  externalCaretVersion={caretVersion}
                                  motionBlur={preferences.caretMotionBlur}
                                  smartTypography={preferences.smartTypography}
                                  placeholder="Élément de liste (Tab pour indenter, Entrée sur vide pour sortir)..."
                                  className={`flex-1 ${
                                    item.checked ? 'line-through opacity-60' : ''
                                  }`}
                                  onCursorChange={(caret) => setCursorOffset(caret)}
                                  onChange={(val, caret) => {
                                    setCursorOffset(caret);
                                    const nextItems = block.items.map((it, i) =>
                                      i === itemIdx ? { ...it, text: val } : it
                                    );
                                    updateSingleBlock(block.id, () => ({
                                      ...block,
                                      items: nextItems,
                                    }));
                                  }}
                                  onKeyDown={(e, setProgrammaticSelection) => {
                                    const el = e.currentTarget;
                                    const selStart = el.selectionStart ?? 0;
                                    const selEnd = el.selectionEnd ?? 0;

                                    // Ctrl+Enter toggles task checkbox
                                    if (
                                      (e.ctrlKey || e.metaKey) &&
                                      e.key === 'Enter' &&
                                      block.listType === 'task'
                                    ) {
                                      e.preventDefault();
                                      const nextItems = block.items.map((it, i) =>
                                        i === itemIdx ? { ...it, checked: !it.checked } : it
                                      );
                                      updateSingleBlock(block.id, () => ({
                                        ...block,
                                        items: nextItems,
                                      }));
                                      return;
                                    }

                                    // Tab / Shift+Tab indents or un-indents list item
                                    if (e.key === 'Tab') {
                                      e.preventDefault();
                                      const delta = e.shiftKey ? -1 : 1;
                                      const nextItems = block.items.map((it, i) =>
                                        i === itemIdx
                                          ? {
                                              ...it,
                                              indent: Math.max(0, Math.min(6, it.indent + delta)),
                                            }
                                          : it
                                      );
                                      updateSingleBlock(block.id, () => ({
                                        ...block,
                                        items: nextItems,
                                      }));
                                      return;
                                    }

                                    // Alt+ArrowUp / Alt+ArrowDown reorders list item
                                    if (
                                      e.altKey &&
                                      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
                                    ) {
                                      e.preventDefault();
                                      const targetIdx =
                                        e.key === 'ArrowUp' ? itemIdx - 1 : itemIdx + 1;
                                      if (targetIdx >= 0 && targetIdx < block.items.length) {
                                        const nextItems = [...block.items];
                                        const [moved] = nextItems.splice(itemIdx, 1);
                                        nextItems.splice(targetIdx, 0, moved);
                                        updateSingleBlock(block.id, () => ({
                                          ...block,
                                          items: nextItems,
                                        }));
                                      }
                                      return;
                                    }

                                    // ArrowUp / ArrowDown navigates between list items or adjacent blocks
                                    if (
                                      e.key === 'ArrowUp' &&
                                      !e.shiftKey &&
                                      !e.ctrlKey &&
                                      !e.metaKey &&
                                      !e.altKey &&
                                      selStart === selEnd
                                    ) {
                                      e.preventDefault();
                                      if (itemIdx > 0) {
                                        const prevItem = block.items[itemIdx - 1];
                                        setActiveListItemId(prevItem.id);
                                        setCursorOffset(
                                          Math.min(selStart, prevItem.text.length),
                                          true
                                        );
                                      } else {
                                        const bIdx = blocks.findIndex((b) => b.id === block.id);
                                        if (bIdx > 0) {
                                          setCursorOffset(999999, true);
                                          onSelectBlock(blocks[bIdx - 1].id, 999999);
                                        }
                                      }
                                      return;
                                    }

                                    if (
                                      e.key === 'ArrowDown' &&
                                      !e.shiftKey &&
                                      !e.ctrlKey &&
                                      !e.metaKey &&
                                      !e.altKey &&
                                      selStart === selEnd
                                    ) {
                                      e.preventDefault();
                                      if (itemIdx < block.items.length - 1) {
                                        const nextItem = block.items[itemIdx + 1];
                                        setActiveListItemId(nextItem.id);
                                        setCursorOffset(
                                          Math.min(selStart, nextItem.text.length),
                                          true
                                        );
                                      } else {
                                        const bIdx = blocks.findIndex((b) => b.id === block.id);
                                        if (bIdx >= 0 && bIdx < blocks.length - 1) {
                                          setCursorOffset(0, true);
                                          onSelectBlock(blocks[bIdx + 1].id, 0);
                                        }
                                      }
                                      return;
                                    }

                                    // Shift+Enter (Maj+Entrée) inside a list item inserts a soft line break preserving inner Tab indentation
                                    if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
                                      e.preventDefault();
                                      const liLineStart = item.text.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
                                      const liNextNl = item.text.indexOf('\n', selEnd);
                                      const liLineEnd = liNextNl === -1 ? item.text.length : liNextNl;
                                      const liFullLine = item.text.slice(liLineStart, liLineEnd);
                                      const liIndent = (liFullLine.match(/^([\t ]+)/) || ['', ''])[1];
                                      if (liFullLine.trim() === '' && liIndent.length > 0) {
                                        const nextVal = item.text.slice(0, liLineStart) + item.text.slice(liLineEnd);
                                        setProgrammaticSelection?.(liLineStart, liLineStart, 'none');
                                        const nextItems = block.items.map((it, i) =>
                                          i === itemIdx ? { ...it, text: nextVal } : it
                                        );
                                        updateSingleBlock(block.id, () => ({ ...block, items: nextItems }));
                                        setCursorOffset(liLineStart);
                                        return;
                                      }
                                      const ins = `\n${liIndent}`;
                                      const nextVal = item.text.slice(0, selStart) + ins + item.text.slice(selEnd);
                                      const nextPos = selStart + ins.length;
                                      setProgrammaticSelection?.(nextPos, nextPos, 'none');
                                      const nextItems = block.items.map((it, i) =>
                                        i === itemIdx ? { ...it, text: nextVal } : it
                                      );
                                      updateSingleBlock(block.id, () => ({ ...block, items: nextItems }));
                                      setCursorOffset(nextPos);
                                      return;
                                    }

                                    // Enter splits list item, un-indents on empty indented item, or exits list when empty at indent 0
                                    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                                      e.preventDefault();
                                      if (item.text.trim() === '') {
                                        if (item.indent > 0) {
                                          const nextItems = block.items.map((it, i) =>
                                            i === itemIdx
                                              ? { ...it, indent: Math.max(0, it.indent - 1) }
                                              : it
                                          );
                                          updateSingleBlock(block.id, () => ({
                                            ...block,
                                            items: nextItems,
                                          }));
                                          return;
                                        }
                                        const remainingItems = block.items.filter(
                                          (_, i) => i !== itemIdx
                                        );
                                        const newParaId = nextBlockId('p');
                                        const bIdx = blocks.findIndex((b) => b.id === block.id);
                                        const copy = [...blocks];
                                        if (remainingItems.length === 0) {
                                          copy[bIdx] = {
                                            id: newParaId,
                                            type: 'paragraph',
                                            text: '',
                                          };
                                        } else {
                                          copy[bIdx] = { ...block, items: remainingItems };
                                          copy.splice(bIdx + 1, 0, {
                                            id: newParaId,
                                            type: 'paragraph',
                                            text: '',
                                          });
                                        }
                                        onChangeBlocks(copy);
                                        setCursorOffset(0, true);
                                        onSelectBlock(newParaId, 0);
                                        return;
                                      }

                                      const before = item.text.slice(0, selStart).replace(/\n[\t ]*$/, '');
                                      const after = item.text.slice(selEnd);
                                      const newItemId = nextBlockId('li');
                                      const nextItems = [...block.items];
                                      nextItems[itemIdx] = { ...item, text: before };
                                      nextItems.splice(itemIdx + 1, 0, {
                                        id: newItemId,
                                        indent: item.indent,
                                        text: after,
                                        checked: false,
                                      });
                                      updateSingleBlock(block.id, () => ({
                                        ...block,
                                        items: nextItems,
                                      }));
                                      setActiveListItemId(newItemId);
                                      setCursorOffset(0, true);
                                      return;
                                    }

                                    // Backspace at offset 0 un-indents, merges with previous item, or converts to paragraph
                                    if (
                                      e.key === 'Backspace' &&
                                      selStart === 0 &&
                                      selEnd === 0
                                    ) {
                                      e.preventDefault();
                                      if (item.indent > 0) {
                                        const nextItems = block.items.map((it, i) =>
                                          i === itemIdx
                                            ? { ...it, indent: Math.max(0, it.indent - 1) }
                                            : it
                                        );
                                        updateSingleBlock(block.id, () => ({
                                          ...block,
                                          items: nextItems,
                                        }));
                                        return;
                                      }
                                      if (itemIdx > 0) {
                                        const prevItem = block.items[itemIdx - 1];
                                        const mergePos = prevItem.text.length;
                                        const nextItems = block.items
                                          .map((it, i) =>
                                            i === itemIdx - 1
                                              ? { ...it, text: prevItem.text + item.text }
                                              : it
                                          )
                                          .filter((_, i) => i !== itemIdx);
                                        updateSingleBlock(block.id, () => ({
                                          ...block,
                                          items: nextItems,
                                        }));
                                        setActiveListItemId(prevItem.id);
                                        setCursorOffset(mergePos, true);
                                        return;
                                      }
                                      // First item at indent 0 -> convert to paragraph above remaining list
                                      const bIdx = blocks.findIndex((b) => b.id === block.id);
                                      const newParaId = nextBlockId('p');
                                      const copy = [...blocks];
                                      if (block.items.length === 1) {
                                        copy[bIdx] = {
                                          id: newParaId,
                                          type: 'paragraph',
                                          text: item.text,
                                        };
                                      } else {
                                        copy[bIdx] = {
                                          ...block,
                                          items: block.items.slice(1),
                                        };
                                        copy.splice(bIdx, 0, {
                                          id: newParaId,
                                          type: 'paragraph',
                                          text: item.text,
                                        });
                                      }
                                      onChangeBlocks(copy);
                                      setCursorOffset(0, true);
                                      onSelectBlock(newParaId, 0);
                                      return;
                                    }

                                    // Delegate inline formatting shortcuts (Ctrl+B, Ctrl+I, Ctrl+K, Auto-Pair)
                                    handleSmartKeyDown(
                                      e,
                                      block,
                                      item.text,
                                      (nextText, nextPos) => {
                                        const nextItems = block.items.map((it, i) =>
                                          i === itemIdx ? { ...it, text: nextText } : it
                                        );
                                        updateSingleBlock(block.id, () => ({
                                          ...block,
                                          items: nextItems,
                                        }));
                                        setCursorOffset(nextPos);
                                      },
                                      setProgrammaticSelection
                                    );
                                  }}
                                />
                              ) : (
                                <div
                                  style={{ tabSize: 4 }}
                                  className={`flex-1 min-h-[1.5rem] whitespace-pre-wrap break-words ${
                                    item.checked ? 'line-through opacity-60' : ''
                                  }`}
                                >
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
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}

              {/* 6. GitHub Alerts / Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) with Smooth Gliding Caret */}
              {block.type === 'callout' &&
                (() => {
                  const cfg = CALLOUT_STYLES[block.calloutType] || CALLOUT_STYLES.NOTE;
                  const kinds: CalloutKind[] = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
                  const titlePointKey = `${block.id}:title`;
                  const contentPointKey = `${block.id}:content`;

                  return (
                    <div
                      className="my-4 p-4 rounded-r-lg border-l-4 transition-colors"
                      style={{
                        borderLeftColor: cfg.color,
                        backgroundColor: cfg.bg,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div
                          className="flex flex-1 items-center gap-2 font-semibold text-sm cursor-text"
                          style={{ color: cfg.color }}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            const target = e.target as HTMLElement;
                            if (target.closest('button, a, textarea, input')) return;
                            e.preventDefault();
                            mouseDownInsideBlockRef.current = true;
                            mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
                            setSelectedBlockIds([]);
                            setActiveCalloutField('title');
                            setPendingMousePoint({
                              blockId: titlePointKey,
                              point: {
                                clientX: e.clientX,
                                clientY: e.clientY,
                                seq: Date.now() + Math.random(),
                              },
                            });
                            onSelectBlock(block.id);
                          }}
                        >
                          {cfg.icon}
                          {isActive && activeCalloutField === 'title' ? (
                            <InlinePageInput
                              value={block.title}
                              multiline={false}
                              autoFocus
                              initialCaretOffset={cursorOffset}
                              pendingMouseDownPoint={
                                pendingMousePoint?.blockId === titlePointKey
                                  ? pendingMousePoint.point
                                  : null
                              }
                              externalCaretVersion={caretVersion}
                              motionBlur={preferences.caretMotionBlur}
                              smartTypography={preferences.smartTypography}
                              placeholder={cfg.label}
                              className="flex-1 font-semibold"
                              onCursorChange={(caret) => setCursorOffset(caret)}
                              onChange={(val, caret) => {
                                setCursorOffset(caret);
                                updateSingleBlock(block.id, () => ({
                                  ...block,
                                  title: val,
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setActiveCalloutField('content');
                                  setCursorOffset(0, true);
                                }
                              }}
                            />
                          ) : (
                            <span>{block.title || cfg.label}</span>
                          )}
                        </div>

                        {isActive && (
                          <div className="no-print no-export flex items-center gap-1">
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

                      <div
                        className="text-sm leading-relaxed cursor-text whitespace-pre-wrap break-words"
                        style={{ tabSize: 4 }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, textarea, input')) return;
                          e.preventDefault();
                          mouseDownInsideBlockRef.current = true;
                          mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
                          setSelectedBlockIds([]);
                          setActiveCalloutField('content');
                          setPendingMousePoint({
                            blockId: contentPointKey,
                            point: {
                              clientX: e.clientX,
                              clientY: e.clientY,
                              seq: Date.now() + Math.random(),
                            },
                          });
                          onSelectBlock(block.id);
                        }}
                      >
                        {isActive && activeCalloutField === 'content' ? (
                          <InlinePageInput
                            value={block.content}
                            multiline={true}
                            autoFocus
                            initialCaretOffset={cursorOffset}
                            pendingMouseDownPoint={
                              pendingMousePoint?.blockId === contentPointKey
                                ? pendingMousePoint.point
                                : null
                            }
                            externalCaretVersion={caretVersion}
                            motionBlur={preferences.caretMotionBlur}
                            smartTypography={preferences.smartTypography}
                            placeholder="Contenu de l'alerte..."
                            onCursorChange={(caret) => setCursorOffset(caret)}
                            onChange={(val, caret) => {
                              setCursorOffset(caret);
                              updateSingleBlock(block.id, () => ({
                                ...block,
                                content: val,
                              }));
                            }}
                            onKeyDown={(e, setProgrammaticSelection) => {
                              const selStart = e.currentTarget.selectionStart ?? 0;
                              const selEnd = e.currentTarget.selectionEnd ?? 0;
                              if (
                                e.key === 'ArrowUp' &&
                                !e.shiftKey &&
                                selStart === 0 &&
                                selEnd === 0
                              ) {
                                e.preventDefault();
                                setActiveCalloutField('title');
                                setCursorOffset(block.title.length, true);
                                return;
                              }
                              handleSmartKeyDown(
                                e,
                                block,
                                block.content,
                                (nextText, nextPos) => {
                                  updateSingleBlock(block.id, () => ({
                                    ...block,
                                    content: nextText,
                                  }));
                                  setCursorOffset(nextPos);
                                },
                                setProgrammaticSelection
                              );
                            }}
                          />
                        ) : (
                          <LiveInlineTokens
                            text={block.content}
                            isBlockActive={false}
                            cursorOffset={null}
                            mathEnv={mathEnv}
                            footnotesMap={footnotesMap}
                            pandocMathRules={preferences.inlineMathPandocRules}
                            onNavigateAnchor={navigateAnchorOrUrl}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* 7. Standard Blockquote with Smooth Gliding Caret */}
              {block.type === 'blockquote' && (
                <blockquote
                  className="my-4 pl-4 border-l-4 italic cursor-text"
                  style={{
                    borderLeftColor: 'var(--blockquote-border)',
                    color: 'var(--blockquote-text)',
                  }}
                  onMouseDown={(e) => activateBlockFromMouse(e, block.id, block.text)}
                >
                  {isActive ? (
                    <InlinePageInput
                      value={block.text}
                      multiline={true}
                      autoFocus
                      initialCaretOffset={cursorOffset}
                      pendingMouseDownPoint={
                        pendingMousePoint?.blockId === block.id
                          ? pendingMousePoint.point
                          : null
                      }
                      externalCaretVersion={caretVersion}
                      motionBlur={preferences.caretMotionBlur}
                      smartTypography={preferences.smartTypography}
                      placeholder="Citation (Entrée sur ligne vide pour sortir)..."
                      onCursorChange={(caret) => setCursorOffset(caret)}
                      onChange={(val, caret) => {
                        setCursorOffset(caret);
                        updateSingleBlock(block.id, () => ({ ...block, text: val }));
                      }}
                      onKeyDown={(e, setProgrammaticSelection) => {
                        const selStart = e.currentTarget.selectionStart ?? 0;
                        const selEnd = e.currentTarget.selectionEnd ?? 0;
                        if (
                          e.key === 'Enter' &&
                          !e.shiftKey &&
                          (block.text.trim() === '' ||
                            (selStart === block.text.length && block.text.endsWith('\n')))
                        ) {
                          e.preventDefault();
                          const cleaned = block.text.replace(/\n+$/, '');
                          const newParaId = nextBlockId('p');
                          const idx = blocks.findIndex((b) => b.id === block.id);
                          const copy = [...blocks];
                          if (!cleaned) {
                            copy[idx] = { id: newParaId, type: 'paragraph', text: '' };
                          } else {
                            copy[idx] = { ...block, text: cleaned };
                            copy.splice(idx + 1, 0, {
                              id: newParaId,
                              type: 'paragraph',
                              text: '',
                            });
                          }
                          onChangeBlocks(copy);
                          setCursorOffset(0, true);
                          onSelectBlock(newParaId, 0);
                          return;
                        }
                        handleSmartKeyDown(
                          e,
                          block,
                          block.text,
                          (nextText, nextPos) => {
                            updateSingleBlock(block.id, () => ({ ...block, text: nextText }));
                            setCursorOffset(nextPos);
                          },
                          setProgrammaticSelection
                        );
                      }}
                    />
                  ) : (
                    <div className="min-h-[1.5rem] whitespace-pre-wrap break-words" style={{ tabSize: 4 }}>
                      <LiveInlineTokens
                        text={block.text}
                        isBlockActive={false}
                        cursorOffset={null}
                        mathEnv={mathEnv}
                        footnotesMap={footnotesMap}
                        pandocMathRules={preferences.inlineMathPandocRules}
                        onNavigateAnchor={navigateAnchorOrUrl}
                      />
                    </div>
                  )}
                </blockquote>
              )}

              {/* 8. Interactive Markdown Extra Table with Smooth Gliding Caret in Every Cell */}
              {block.type === 'table' && (
                <InteractiveTableBlock
                  headers={block.headers}
                  alignments={block.alignments}
                  rows={block.rows}
                  columnWidths={block.columnWidths}
                  isActive={isActive}
                  motionBlur={preferences.caretMotionBlur}
                  smartTypography={preferences.smartTypography}
                  mathEnv={mathEnv}
                  footnotesMap={footnotesMap}
                  pandocMathRules={preferences.inlineMathPandocRules}
                  onFocusBlock={() => onSelectBlock(block.id)}
                  onExitTable={(dir) => {
                    const idx = blocks.findIndex((b) => b.id === block.id);
                    if (dir === 'up' && idx > 0) {
                      setCursorOffset(999999, true);
                      onSelectBlock(blocks[idx - 1].id, 999999);
                    } else if (dir === 'down' && idx >= 0 && idx < blocks.length - 1) {
                      setCursorOffset(0, true);
                      onSelectBlock(blocks[idx + 1].id, 0);
                    }
                  }}
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

              {/* 13. Footnote Definition `[^1]: ...` with Smooth Gliding Caret */}
              {block.type === 'footnote-def' && (
                <div
                  className="my-2 pl-3 border-l-2 text-xs flex items-baseline gap-2 cursor-text"
                  style={{
                    borderLeftColor: 'var(--border-color)',
                    color: 'var(--meta-content-color)',
                  }}
                  onMouseDown={(e) => activateBlockFromMouse(e, block.id, block.content)}
                >
                  <span className="font-mono font-semibold shrink-0" style={{ color: 'var(--primary-color)' }}>
                    [^{block.label}]:
                  </span>
                  {isActive ? (
                    <InlinePageInput
                      value={block.content}
                      multiline={false}
                      autoFocus
                      initialCaretOffset={cursorOffset}
                      pendingMouseDownPoint={
                        pendingMousePoint?.blockId === block.id
                          ? pendingMousePoint.point
                          : null
                      }
                      externalCaretVersion={caretVersion}
                      motionBlur={preferences.caretMotionBlur}
                      smartTypography={preferences.smartTypography}
                      placeholder="Définition de la note de bas de page..."
                      className="flex-1"
                      onCursorChange={(caret) => setCursorOffset(caret)}
                      onChange={(val, caret) => {
                        setCursorOffset(caret);
                        updateSingleBlock(block.id, () => ({
                          ...block,
                          content: val,
                        }));
                      }}
                    />
                  ) : (
                    <span>{block.content}</span>
                  )}
                </div>
              )}
            </div>
          );
        });
      })()}
      </div>
    </div>
  );
};
