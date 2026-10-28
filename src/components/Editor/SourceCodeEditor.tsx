import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap } from '@codemirror/search';
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  CheckCircle2,
  Code2,
  Eye,
  FileCode2,
  Plus,
  Sparkles,
  Table as TableIcon,
  Trash2,
  WrapText,
} from 'lucide-react';
import { resolveLanguageExtension } from './CodeFenceBlock';
import { describeFilePath } from '../../utils/fileTypes';

interface SourceCodeEditorProps {
  filePath?: string;
  markdownText: string;
  initialCursorOffset: number;
  initialScrollRatio: number;
  isStandaloneFile?: boolean;
  onChange: (newText: string, cursorOffset: number, scrollRatio: number) => void;
  onExitSourceMode?: () => void;
}

export const SourceCodeEditor: React.FC<SourceCodeEditorProps> = ({
  filePath = 'document.md',
  markdownText,
  initialCursorOffset,
  initialScrollRatio,
  isStandaloneFile = false,
  onChange,
  onExitSourceMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const lineNumCompartment = useRef(new Compartment());

  const onChangeRef = useRef(onChange);
  const onExitRef = useRef(onExitSourceMode);
  onChangeRef.current = onChange;
  onExitRef.current = onExitSourceMode;

  const fileDescriptor = useMemo(() => describeFilePath(filePath), [filePath]);

  const [wordWrap, setWordWrap] = useState(true);
  const [showLineNums, setShowLineNums] = useState(true);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [viewMode, setViewMode] = useState<'code' | 'preview' | 'split'>(() =>
    fileDescriptor.category === 'csv' || fileDescriptor.category === 'svg' ? 'split' : 'code'
  );

  useEffect(() => {
    if (fileDescriptor.category === 'csv' || fileDescriptor.category === 'svg') {
      setViewMode('split');
    } else {
      setViewMode('code');
    }
  }, [filePath, fileDescriptor.category]);

  useEffect(() => {
    if (!containerRef.current) return;

    const clampedCursor = Math.min(Math.max(0, initialCursorOffset), markdownText.length);

    const state = EditorState.create({
      doc: markdownText,
      selection: { anchor: clampedCursor },
      extensions: [
        history(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        search({ top: true }),
        lineNumCompartment.current.of(showLineNums ? lineNumbers() : []),
        wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []),
        langCompartment.current.of(resolveLanguageExtension(fileDescriptor.cmLanguage)),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          {
            key: 'Tab',
            run: (view) => {
              const sel = view.state.selection.main;
              if (sel.empty) {
                view.dispatch({
                  changes: { from: sel.from, to: sel.to, insert: '\t' },
                  selection: { anchor: sel.from + 1 },
                });
                return true;
              }
              return false;
            },
          },
          {
            key: 'Enter',
            run: (view) => {
              const sel = view.state.selection.main;
              if (!sel.empty) return false;
              const line = view.state.doc.lineAt(sel.head);
              const indentMatch = line.text.match(/^([\t ]+)/);
              const leading = indentMatch ? indentMatch[1] : '';
              if (leading.length > 0 && line.text.trim() === '') {
                // Pressing Enter on an empty indented line exits the Tab indentation to column 0
                view.dispatch({
                  changes: { from: line.from, to: line.to, insert: '' },
                  selection: { anchor: line.from },
                });
                return true;
              }
              if (leading.length > 0) {
                const insertStr = `\n${leading}`;
                view.dispatch({
                  changes: { from: sel.from, to: sel.to, insert: insertStr },
                  selection: { anchor: sel.from + insertStr.length },
                });
                return true;
              }
              return false;
            },
          },
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          {
            key: 'Mod-/',
            run: () => {
              onExitRef.current?.();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) {
            const docStr = update.state.doc.toString();
            const head = update.state.selection.main.head;
            const lineObj = update.state.doc.lineAt(head);
            setCursorLine(lineObj.number);
            setCursorCol(head - lineObj.from + 1);

            if (update.docChanged) {
              const scroller = update.view.scrollDOM;
              const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
              const ratio = scroller.scrollTop / maxScroll;
              onChangeRef.current(docStr, head, ratio);
            }
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: 'transparent',
            color: 'var(--text-color)',
            fontFamily:
              fileDescriptor.category === 'plaintext'
                ? 'var(--font-body)'
                : 'var(--font-mono)',
            fontSize: fileDescriptor.category === 'plaintext' ? '1.02rem' : '0.93rem',
          },
          '.cm-scroller': {
            padding: '1.75rem 0 5rem 0',
            lineHeight: '1.72',
            tabSize: '4',
          },
          '.cm-content': {
            maxWidth: fileDescriptor.category === 'plaintext' ? '840px' : '1040px',
            margin: '0 auto',
            padding: '0 2rem',
            caretColor: 'var(--primary-color)',
          },
          '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--primary-color) 6%, transparent)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'transparent',
            color: 'var(--primary-color)',
            fontWeight: '600',
          },
          '.cm-selectionBackground, ::selection': {
            backgroundColor:
              'color-mix(in srgb, var(--primary-color) 26%, transparent) !important',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: 'none',
            color: 'var(--md-char-color)',
            paddingRight: '0.75rem',
            userSelect: 'none',
          },
          '.cm-panels': {
            backgroundColor: 'var(--sidebar-bg-color)',
            color: 'var(--text-color)',
            borderBottom: '1px solid var(--border-color)',
          },
          '.cm-search': {
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
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
  }, [filePath]);

  // Keep CodeMirror document in sync when external Undo/Redo or file reload changes markdownText
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== markdownText) {
      const prevHead = view.state.selection.main.head;
      const nextHead = Math.min(markdownText.length, prevHead);
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: markdownText },
        selection: { anchor: nextHead },
      });
    }
  }, [markdownText]);

  // Reconfigure compartments dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        langCompartment.current.reconfigure(
          resolveLanguageExtension(fileDescriptor.cmLanguage)
        ),
        wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        lineNumCompartment.current.reconfigure(showLineNums ? lineNumbers() : []),
      ],
    });
  }, [fileDescriptor.cmLanguage, wordWrap, showLineNums]);

  // JSON validation & formatting helper
  const jsonStatus = useMemo(() => {
    if (fileDescriptor.category !== 'json') return null;
    if (!markdownText.trim()) return { valid: true, error: null };
    try {
      JSON.parse(markdownText);
      return { valid: true, error: null };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : 'JSON invalide' };
    }
  }, [fileDescriptor.category, markdownText]);

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(markdownText);
      const formatted = JSON.stringify(parsed, null, 2) + '\n';
      onChange(formatted, 0, 0);
    } catch {
      // ignore if invalid JSON
    }
  };

  // CSV / TSV interactive table parser
  const csvDelimiter = fileDescriptor.ext === 'tsv' ? '\t' : ',';
  const csvMatrix = useMemo(() => {
    if (fileDescriptor.category !== 'csv') return [];
    const lines = markdownText.replace(/\r\n/g, '\n').split('\n');
    const nonEmpty = lines.filter((l, idx) => l.length > 0 || idx < lines.length - 1);
    if (nonEmpty.length === 0) return [['Colonne 1', 'Colonne 2']];
    return nonEmpty.map((line) => line.split(csvDelimiter));
  }, [fileDescriptor.category, markdownText, csvDelimiter]);

  const updateCsvCell = (rIdx: number, cIdx: number, val: string) => {
    const copy = csvMatrix.map((row) => [...row]);
    if (!copy[rIdx]) return;
    copy[rIdx][cIdx] = val;
    const serialized = copy.map((row) => row.join(csvDelimiter)).join('\n') + '\n';
    onChange(serialized, 0, 0);
  };

  const addCsvRow = () => {
    const cols = csvMatrix[0]?.length || 2;
    const copy = [...csvMatrix, Array.from({ length: cols }, () => '')];
    onChange(copy.map((r) => r.join(csvDelimiter)).join('\n') + '\n', 0, 0);
  };

  const addCsvCol = () => {
    const copy = csvMatrix.map((row, idx) => [
      ...row,
      idx === 0 ? `Colonne ${row.length + 1}` : '',
    ]);
    onChange(copy.map((r) => r.join(csvDelimiter)).join('\n') + '\n', 0, 0);
  };

  const deleteCsvRow = (rIdx: number) => {
    if (csvMatrix.length <= 1) return;
    const copy = csvMatrix.filter((_, idx) => idx !== rIdx);
    onChange(copy.map((r) => r.join(csvDelimiter)).join('\n') + '\n', 0, 0);
  };

  const hasRichPreview =
    fileDescriptor.category === 'csv' ||
    fileDescriptor.category === 'html' ||
    fileDescriptor.category === 'svg';

  const lineCount = useMemo(
    () => (markdownText ? markdownText.split('\n').length : 1),
    [markdownText]
  );

  return (
    <div className="h-full w-full flex flex-col">
      {/* Top Editor Header Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-5 py-1.5 text-xs border-b select-none"
        style={{
          backgroundColor: 'var(--code-bg-color)',
          borderColor: 'var(--border-color)',
          color: 'var(--meta-content-color)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-semibold text-[11px]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary-color) 15%, transparent)',
              color: 'var(--primary-color)',
            }}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            {fileDescriptor.badge}
          </span>
          <span className="font-medium" style={{ color: 'var(--text-color)' }}>
            {fileDescriptor.label}
          </span>
          <span className="opacity-50">·</span>
          <span className="font-mono text-[11px]">
            Ln {cursorLine}, Col {cursorCol} ({lineCount} lignes)
          </span>

          {jsonStatus && (
            <>
              <span className="opacity-50">·</span>
              {jsonStatus.valid ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> JSON valide
                </span>
              ) : (
                <span className="text-red-500 font-mono truncate max-w-xs" title={jsonStatus.error || ''}>
                  {jsonStatus.error}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {fileDescriptor.category === 'json' && (
            <button
              type="button"
              onClick={handleFormatJson}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-color)' }}
              title="Formater et indenter le JSON"
            >
              <Sparkles className="w-3 h-3" />
              Formater JSON
            </button>
          )}

          {hasRichPreview && (
            <div
              className="inline-flex items-center rounded border p-0.5"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <button
                type="button"
                onClick={() => setViewMode('code')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  viewMode === 'code' ? 'font-semibold bg-black/10 dark:bg-white/15' : 'opacity-70'
                }`}
                style={{ color: 'var(--text-color)' }}
              >
                <Code2 className="w-3 h-3 inline mr-1" />
                Code
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  viewMode === 'split' ? 'font-semibold bg-black/10 dark:bg-white/15' : 'opacity-70'
                }`}
                style={{ color: 'var(--text-color)' }}
              >
                {fileDescriptor.category === 'csv' ? (
                  <TableIcon className="w-3 h-3 inline mr-1" />
                ) : (
                  <Eye className="w-3 h-3 inline mr-1" />
                )}
                Mixte
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  viewMode === 'preview'
                    ? 'font-semibold bg-black/10 dark:bg-white/15'
                    : 'opacity-70'
                }`}
                style={{ color: 'var(--text-color)' }}
              >
                <Eye className="w-3 h-3 inline mr-1" />
                {fileDescriptor.category === 'csv' ? 'Tableau' : 'Aperçu'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowLineNums((v) => !v)}
            className={`px-2 py-0.5 rounded border cursor-pointer font-mono text-[11px] ${
              showLineNums ? 'opacity-100' : 'opacity-55'
            }`}
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-color)' }}
            title="Afficher / Masquer les numéros de ligne"
          >
            # Lignes
          </button>

          <button
            type="button"
            onClick={() => setWordWrap((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer text-[11px] ${
              wordWrap ? 'opacity-100' : 'opacity-55'
            }`}
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-color)' }}
            title="Activer / Désactiver le retour à la ligne automatique"
          >
            <WrapText className="w-3 h-3" />
            Wrap
          </button>

          {onExitSourceMode && (!isStandaloneFile || fileDescriptor.supportsRichPreview) && (
            <button
              type="button"
              onClick={onExitSourceMode}
              className="px-2.5 py-0.5 rounded border hover:opacity-85 cursor-pointer font-medium"
              style={{
                borderColor: 'var(--primary-color)',
                color: 'var(--primary-color)',
              }}
            >
              {isStandaloneFile ? 'Vue Riche WYSIWYM (Ctrl+/)' : 'Quitter le Code Source (Ctrl+/)'}
            </button>
          )}
        </div>
      </div>

      {/* Main Editor & Optional Live Split Preview */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {viewMode !== 'preview' && (
          <div
            ref={containerRef}
            className={`h-full overflow-auto select-text ${
              viewMode === 'split' && hasRichPreview ? 'w-1/2 border-r' : 'w-full'
            }`}
            style={{ borderColor: 'var(--border-color)' }}
          />
        )}

        {viewMode !== 'code' && hasRichPreview && (
          <div
            className={`h-full overflow-auto p-6 ${
              viewMode === 'split' ? 'w-1/2' : 'w-full max-w-5xl mx-auto'
            }`}
          >
            {fileDescriptor.category === 'csv' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                    Éditeur de Tableau {fileDescriptor.badge} Interactif
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addCsvRow}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Ligne
                    </button>
                    <button
                      type="button"
                      onClick={addCsvCol}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Colonne
                    </button>
                  </div>
                </div>
                <div
                  className="overflow-x-auto rounded-lg border"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {csvMatrix.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="border-b"
                          style={{
                            borderColor: 'var(--border-color)',
                            backgroundColor:
                              rIdx === 0
                                ? 'var(--code-bg-color)'
                                : rIdx % 2 === 1
                                ? 'transparent'
                                : 'var(--table-alt-bg)',
                          }}
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="border-r p-0"
                              style={{ borderColor: 'var(--border-color)' }}
                            >
                              <input
                                type="text"
                                value={cell}
                                onChange={(e) => updateCsvCell(rIdx, cIdx, e.target.value)}
                                className={`w-full px-2.5 py-1.5 bg-transparent outline-none focus:bg-blue-500/10 ${
                                  rIdx === 0 ? 'font-semibold' : ''
                                }`}
                              />
                            </td>
                          ))}
                          <td className="w-8 text-center">
                            {csvMatrix.length > 1 && (
                              <button
                                type="button"
                                onClick={() => deleteCsvRow(rIdx)}
                                className="p-1 opacity-40 hover:opacity-100 hover:text-red-500 cursor-pointer"
                                title="Supprimer la ligne"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {fileDescriptor.category === 'html' && (
              <div className="h-full flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-70">
                  Aperçu HTML en direct (Sandbox)
                </div>
                <iframe
                  title="HTML Preview"
                  sandbox="allow-scripts"
                  srcDoc={markdownText}
                  className="w-full flex-1 rounded-xl border bg-white"
                  style={{ borderColor: 'var(--border-color)' }}
                />
              </div>
            )}

            {fileDescriptor.category === 'svg' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-70">
                  Aperçu Vectoriel SVG
                </div>
                <div
                  className="p-6 rounded-xl border flex items-center justify-center min-h-[260px]"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: 'var(--code-bg-color)',
                  }}
                  dangerouslySetInnerHTML={{ __html: markdownText }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
