import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';

interface SourceCodeEditorProps {
  markdownText: string;
  initialCursorOffset: number;
  initialScrollRatio: number;
  onChange: (newMarkdown: string, cursorOffset: number, scrollRatio: number) => void;
  onExitSourceMode: () => void;
}

export const SourceCodeEditor: React.FC<SourceCodeEditorProps> = ({
  markdownText,
  initialCursorOffset,
  initialScrollRatio,
  onChange,
  onExitSourceMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const clampedCursor = Math.min(Math.max(0, initialCursorOffset), markdownText.length);

    const state = EditorState.create({
      doc: markdownText,
      selection: { anchor: clampedCursor },
      extensions: [
        history(),
        lineNumbers(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-/',
            run: () => {
              onExitSourceMode();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) {
            const docStr = update.state.doc.toString();
            const cursor = update.state.selection.main.head;
            const scroller = update.view.scrollDOM;
            const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
            const ratio = scroller.scrollTop / maxScroll;
            onChange(docStr, cursor, ratio);
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: 'var(--bg-color)',
            color: 'var(--text-color)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.95rem',
          },
          '.cm-scroller': {
            padding: '2rem 0',
            lineHeight: '1.75',
          },
          '.cm-content': {
            maxWidth: '820px',
            margin: '0 auto',
            padding: '0 2rem',
            caretColor: 'var(--primary-color)',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: 'none',
            color: 'var(--md-char-color)',
            paddingRight: '0.75rem',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    requestAnimationFrame(() => {
      view.focus();
      const scroller = view.scrollDOM;
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = initialScrollRatio * maxScroll;
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <div
        className="flex items-center justify-between px-6 py-1.5 text-xs border-b"
        style={{
          backgroundColor: 'var(--code-bg-color)',
          borderColor: 'var(--border-color)',
          color: 'var(--meta-content-color)',
        }}
      >
        <span className="font-mono font-medium">
          Mode Code Source (CodeMirror 6) — Position du curseur & scroll synchronisés
        </span>
        <button
          type="button"
          onClick={onExitSourceMode}
          className="px-2.5 py-0.5 rounded border hover:opacity-85 cursor-pointer font-mono"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-color)' }}
        >
          Quitter le Code Source (Ctrl+/)
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto select-text" />
    </div>
  );
};
