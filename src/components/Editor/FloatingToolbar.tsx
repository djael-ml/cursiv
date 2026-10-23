import React, { useState } from 'react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Sigma,
  Strikethrough,
  Table,
} from 'lucide-react';

interface FloatingToolbarProps {
  visible: boolean;
  onWrapInline: (prefix: string, suffix?: string) => void;
  onInsertBlock: (
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
  ) => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  visible,
  onWrapInline,
  onInsertBlock,
}) => {
  const [showTableGrid, setShowTableGrid] = useState(false);
  const [hoverGrid, setHoverGrid] = useState<{ rows: number; cols: number }>({ rows: 3, cols: 3 });

  if (!visible) return null;

  return (
    <div className="no-print no-export fixed top-12 left-1/2 -translate-x-1/2 z-30">
      <div
        className="cursiv-popup-anim cursiv-glass-toolbar flex items-center gap-0.5 px-2.5 py-1.5 rounded-full shadow-lg"
        style={{ color: 'var(--text-color)' }}
      >
        <button
          type="button"
          onClick={() => onWrapInline('**', '**')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Gras (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onWrapInline('*', '*')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Italique (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onWrapInline('~~', '~~')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Barré"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onWrapInline('==', '==')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Surligné (==texte==)"
        >
          <Highlighter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onWrapInline('`', '`')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Code inline"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onWrapInline('[', '](https://)')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Lien (Ctrl+K)"
        >
          <Link className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

        <button
          type="button"
          onClick={() => onInsertBlock('h1')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Titre H1"
        >
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('h2')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Titre H2"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('h3')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Titre H3"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

        <button
          type="button"
          onClick={() => onInsertBlock('bullet-list')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Liste à puces"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('ordered-list')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Liste numérotée"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('task-list')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Liste de tâches GFM (- [ ])"
        >
          <ListChecks className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

        {/* Table Grid Selector Popup */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTableGrid((v) => !v)}
            className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
            title="Insérer un tableau (Ctrl+T)"
          >
            <Table className="w-3.5 h-3.5" />
          </button>

          {showTableGrid && (
            <div
              className="cursiv-popup-anim absolute top-full left-1/2 -translate-x-1/2 mt-2 p-3 rounded-xl shadow-xl border z-40"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="text-xs font-medium mb-2 text-center">
                Tableau {hoverGrid.rows} × {hoverGrid.cols}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 6 }).map((_, r) =>
                  Array.from({ length: 6 }).map((__, c) => {
                    const active = r + 1 <= hoverGrid.rows && c + 1 <= hoverGrid.cols;
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        onMouseEnter={() => setHoverGrid({ rows: r + 1, cols: c + 1 })}
                        onClick={() => {
                          onInsertBlock('table', {
                            rows: hoverGrid.rows,
                            cols: hoverGrid.cols,
                          });
                          setShowTableGrid(false);
                        }}
                        className="w-4 h-4 rounded-xs border transition-colors cursor-pointer"
                        style={{
                          borderColor: active ? 'var(--primary-color)' : 'var(--border-color)',
                          backgroundColor: active
                            ? 'color-mix(in srgb, var(--primary-color) 25%, transparent)'
                            : 'transparent',
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onInsertBlock('code')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Bloc de code CodeMirror 6"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('math')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Bloc d'équation LaTeX ($$)"
        >
          <Sigma className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('callout')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="GitHub Callout / Alert (> [!NOTE])"
        >
          <MessageSquareWarning className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsertBlock('image')}
          className="p-1.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          title="Insérer une image"
        >
          <Image className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
