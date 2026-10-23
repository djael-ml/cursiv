import React, { useEffect, useRef } from 'react';
import {
  AlertCircle,
  Bold,
  CheckSquare,
  Clipboard,
  Code,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Scissors,
  Sigma,
  Table,
  Trash2,
  Type,
} from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  targetBlockId: string | null;
  selectedBlockCount: number;
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onFormatInline: (prefix: string, suffix?: string) => void;
  onConvertBlock: (
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
  ) => void;
  onInsertBlockBelow: (
    kind: 'paragraph' | 'table' | 'code' | 'math' | 'hr' | 'callout'
  ) => void;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onPasteClipboard: () => void;
  onDuplicateBlocks: () => void;
  onDeleteBlocks: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  onClose,
  onFormatInline,
  onConvertBlock,
  onInsertBlockBelow,
  onCopySelection,
  onCutSelection,
  onPasteClipboard,
  onDuplicateBlocks,
  onDeleteBlocks,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  // Keep menu inside viewport boundaries
  const menuWidth = 256;
  const menuHeight = 410;
  const clampedX = Math.min(menu.x, window.innerWidth - menuWidth - 12);
  const clampedY = Math.min(menu.y, window.innerHeight - menuHeight - 12);

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        left: `${Math.max(8, clampedX)}px`,
        top: `${Math.max(8, clampedY)}px`,
        backgroundColor: 'color-mix(in srgb, var(--bg-color) 94%, transparent)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-color)',
      }}
      className="no-print no-export cursiv-popup-anim fixed z-50 w-64 rounded-xl border shadow-2xl backdrop-blur-md py-1.5 text-xs select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. Quick Inline Formatting Bar */}
      <div
        className="px-2.5 pb-1.5 mb-1 border-b flex items-center justify-between gap-0.5"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          type="button"
          onClick={() => act(() => onFormatInline('**'))}
          className="p-1.5 rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Gras (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => act(() => onFormatInline('*'))}
          className="p-1.5 rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Italique (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => act(() => onFormatInline('=='))}
          className="p-1.5 rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Surligner (==)"
        >
          <Highlighter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => act(() => onFormatInline('`'))}
          className="p-1.5 rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Code Inline (`)"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => act(() => onFormatInline('$'))}
          className="p-1.5 rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Équation Inline ($)"
        >
          <Sigma className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => act(() => onFormatInline('[', '](https://)'))}
          className="p-1.5 rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Lien (Ctrl+K)"
        >
          <Link className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Clipboard Operations */}
      <button
        type="button"
        onClick={() => act(onCutSelection)}
        className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Scissors className="w-3.5 h-3.5 opacity-70" />
          <span>Couper</span>
        </span>
        <span className="opacity-45 font-mono text-[10px]">Ctrl+X</span>
      </button>
      <button
        type="button"
        onClick={() => act(onCopySelection)}
        className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 opacity-70" />
          <span>
            Copier en Markdown
            {menu.selectedBlockCount > 1 ? ` (${menu.selectedBlockCount} blocs)` : ''}
          </span>
        </span>
        <span className="opacity-45 font-mono text-[10px]">Ctrl+C</span>
      </button>
      <button
        type="button"
        onClick={() => act(onPasteClipboard)}
        className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Clipboard className="w-3.5 h-3.5 opacity-70" />
          <span>Coller</span>
        </span>
        <span className="opacity-45 font-mono text-[10px]">Ctrl+V</span>
      </button>

      <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />

      {/* 3. Convert Block Type */}
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-50 font-semibold">
        Transformer en
      </div>
      <div className="grid grid-cols-2 gap-0.5 px-1.5">
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('paragraph'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Type className="w-3.5 h-3.5 opacity-70" />
          <span>Texte</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('h1'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Heading1 className="w-3.5 h-3.5 opacity-70" />
          <span>Titre 1</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('h2'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Heading2 className="w-3.5 h-3.5 opacity-70" />
          <span>Titre 2</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('h3'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Heading3 className="w-3.5 h-3.5 opacity-70" />
          <span>Titre 3</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('bullet-list'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <List className="w-3.5 h-3.5 opacity-70" />
          <span>Liste puces</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('task-list'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <CheckSquare className="w-3.5 h-3.5 opacity-70" />
          <span>Tâches</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('ordered-list'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <ListOrdered className="w-3.5 h-3.5 opacity-70" />
          <span>Numérotée</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onConvertBlock('blockquote'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Quote className="w-3.5 h-3.5 opacity-70" />
          <span>Citation</span>
        </button>
      </div>

      <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />

      {/* 4. Insert Block Below */}
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-50 font-semibold">
        Insérer
      </div>
      <div className="grid grid-cols-2 gap-0.5 px-1.5">
        <button
          type="button"
          onClick={() => act(() => onInsertBlockBelow('table'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Table className="w-3.5 h-3.5 opacity-70" />
          <span>Tableau</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onInsertBlockBelow('code'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Code className="w-3.5 h-3.5 opacity-70" />
          <span>Bloc Code</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onInsertBlockBelow('math'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <Sigma className="w-3.5 h-3.5 opacity-70" />
          <span>Équation $$</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onInsertBlockBelow('callout'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer"
        >
          <AlertCircle className="w-3.5 h-3.5 opacity-70" />
          <span>Callout</span>
        </button>
        <button
          type="button"
          onClick={() => act(() => onInsertBlockBelow('hr'))}
          className="px-2 py-1 rounded text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center gap-1.5 cursor-pointer col-span-2"
        >
          <Minus className="w-3.5 h-3.5 opacity-70" />
          <span>Séparateur horizontal</span>
        </button>
      </div>

      <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />

      {/* 5. Block Actions: Duplicate & Delete */}
      <button
        type="button"
        onClick={() => act(onDuplicateBlocks)}
        className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 opacity-70" />
          <span>
            Dupliquer{menu.selectedBlockCount > 1 ? ` (${menu.selectedBlockCount} blocs)` : ''}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => act(onDeleteBlocks)}
        className="w-full px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10 flex items-center justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5" />
          <span>
            Supprimer{menu.selectedBlockCount > 1 ? ` (${menu.selectedBlockCount} blocs)` : ''}
          </span>
        </span>
        <span className="opacity-60 font-mono text-[10px]">Suppr</span>
      </button>
    </div>
  );
};
