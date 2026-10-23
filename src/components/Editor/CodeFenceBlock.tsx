import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { Check, Copy, Code2, Eye, AlertTriangle } from 'lucide-react';
import {
  renderFlowchartSvg,
  renderMermaidSvg,
  renderSequenceSvg,
} from '../../utils/diagramEngine';
import { getActiveSequenceTheme } from '../../utils/themeManager';

export const SUPPORTED_CODE_LANGUAGES = [
  'rust',
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'html',
  'css',
  'json',
  'markdown',
  'sql',
  'cpp',
  'c',
  'java',
  'php',
  'xml',
  'yaml',
  'bash',
  'shell',
  'powershell',
  'go',
  'swift',
  'kotlin',
  'ruby',
  'dart',
  'lua',
  'r',
  'julia',
  'haskell',
  'elixir',
  'erlang',
  'clojure',
  'scala',
  'zig',
  'nim',
  'ocaml',
  'fsharp',
  'csharp',
  'vb',
  'objectivec',
  'perl',
  'groovy',
  'solidity',
  'toml',
  'ini',
  'dockerfile',
  'makefile',
  'cmake',
  'graphql',
  'protobuf',
  'prisma',
  'terraform',
  'hcl',
  'nginx',
  'apache',
  'latex',
  'tex',
  'bibtex',
  'glsl',
  'wgsl',
  'hlsl',
  'cuda',
  'verilog',
  'vhdl',
  'assembly',
  'nasm',
  'mips',
  'riscv',
  'wasm',
  'wat',
  'fortran',
  'cobol',
  'pascal',
  'ada',
  'lisp',
  'scheme',
  'racket',
  'prolog',
  'smalltalk',
  'crystal',
  'v',
  'd',
  'nix',
  'dhall',
  'cue',
  'jsonnet',
  'rego',
  'sparql',
  'cypher',
  'plsql',
  'tsql',
  'scss',
  'sass',
  'less',
  'stylus',
  'vue',
  'svelte',
  'astro',
  'handlebars',
  'liquid',
  'twig',
  'ejs',
  'pug',
  'haml',
  'diff',
  'patch',
  'csv',
  'tsv',
  'plaintext',
  'mermaid',
  'flow',
  'sequence',
];

function resolveLanguageExtension(lang: string) {
  const l = lang.toLowerCase().trim();
  if (l === 'js' || l === 'javascript') return javascript();
  if (l === 'ts' || l === 'typescript') return javascript({ typescript: true });
  if (l === 'jsx') return javascript({ jsx: true });
  if (l === 'tsx') return javascript({ jsx: true, typescript: true });
  if (l === 'py' || l === 'python') return python();
  if (l === 'rs' || l === 'rust') return rust();
  if (l === 'html' || l === 'vue' || l === 'svelte') return html();
  if (l === 'css' || l === 'scss' || l === 'less') return css();
  if (l === 'json' || l === 'jsonc') return json();
  if (l === 'md' || l === 'markdown') return markdown();
  if (l === 'sql' || l === 'plsql') return sql();
  if (l === 'c' || l === 'cpp' || l === 'c++' || l === 'csharp' || l === 'java') return cpp();
  if (l === 'java' || l === 'kotlin' || l === 'scala') return java();
  if (l === 'php') return php();
  if (l === 'xml' || l === 'svg') return xml();
  if (l === 'yaml' || l === 'yml' || l === 'toml') return yaml();
  return [];
}

interface CodeFenceBlockProps {
  id: string;
  language: string;
  code: string;
  showLineNumbers: boolean;
  wordWrap: boolean;
  isActive: boolean;
  onFocusBlock: () => void;
  onChange: (newCode: string, newLanguage: string) => void;
}

export const CodeFenceBlock: React.FC<CodeFenceBlockProps> = ({
  id,
  language,
  code,
  showLineNumbers,
  wordWrap,
  isActive,
  onFocusBlock,
  onChange,
}) => {
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const lineNumCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());

  // Always keep latest callbacks and language in refs to prevent stale closures in CodeMirror 6 listener
  const onChangeRef = useRef(onChange);
  const onFocusBlockRef = useRef(onFocusBlock);
  const languageRef = useRef(language);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onFocusBlockRef.current = onFocusBlock;
  }, [onFocusBlock]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const [copied, setCopied] = useState(false);
  const [langQuery, setLangQuery] = useState(language);
  const [showLangPopup, setShowLangPopup] = useState(false);

  const normalizedLang = language.toLowerCase().trim();
  const isDiagram =
    normalizedLang === 'mermaid' || normalizedLang === 'flow' || normalizedLang === 'sequence';

  const [showDiagramSource, setShowDiagramSource] = useState(false);
  const [diagramSvg, setDiagramSvg] = useState<string>('');
  const [diagramError, setDiagramError] = useState<string | null>(null);

  useEffect(() => {
    setLangQuery(language);
  }, [language]);

  // Render live SVG diagrams (Mermaid, Flowchart.js, Sequence)
  useEffect(() => {
    if (!isDiagram) return;
    let cancelled = false;

    async function renderDiagram() {
      if (normalizedLang === 'mermaid') {
        const res = await renderMermaidSvg(code, id);
        if (!cancelled) {
          setDiagramSvg(res.svg);
          setDiagramError(res.error || null);
        }
      } else if (normalizedLang === 'flow') {
        const res = renderFlowchartSvg(code);
        if (!cancelled) {
          setDiagramSvg(res.svg);
          setDiagramError(res.error || null);
        }
      } else if (normalizedLang === 'sequence') {
        const seqTheme = getActiveSequenceTheme();
        const res = renderSequenceSvg(code, seqTheme);
        if (!cancelled) {
          setDiagramSvg(res.svg);
          setDiagramError(res.error || null);
        }
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, normalizedLang, isDiagram, id]);

  // Mount CodeMirror 6 instance
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.focusChanged && update.view.hasFocus) {
        onFocusBlockRef.current();
      }
      if (update.docChanged) {
        const value = update.state.doc.toString();
        onChangeRef.current(value, languageRef.current);
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langCompartment.current.of(resolveLanguageExtension(language)),
        lineNumCompartment.current.of(showLineNumbers ? lineNumbers() : []),
        wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []),
        updateListener,
        EditorView.theme({
          '&': {
            backgroundColor: 'transparent',
            fontSize: '0.88rem',
            fontFamily: 'var(--font-mono)',
          },
          '.cm-content': {
            padding: '0.65rem 0',
            caretColor: 'var(--primary-color)',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid var(--border-color)',
            color: 'var(--md-char-color)',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external code modifications into CodeMirror
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentText = view.state.doc.toString();
    if (currentText !== code) {
      view.dispatch({
        changes: { from: 0, to: currentText.length, insert: code },
      });
    }
  }, [code]);

  // Reconfigure compartments dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        langCompartment.current.reconfigure(resolveLanguageExtension(language)),
        lineNumCompartment.current.reconfigure(showLineNumbers ? lineNumbers() : []),
        wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      ],
    });
  }, [language, showLineNumbers, wordWrap]);

  const filteredLanguages = SUPPORTED_CODE_LANGUAGES.filter((l) =>
    l.toLowerCase().includes(langQuery.toLowerCase().trim())
  ).slice(0, 8);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="group relative my-4 rounded-lg border transition-colors"
      style={{
        backgroundColor: 'var(--code-bg-color)',
        borderColor: isActive ? 'var(--primary-color)' : 'var(--border-color)',
      }}
      onClick={onFocusBlock}
    >
      {/* Top hover bar: Language selector + Copy + Diagram toggle */}
      <div className="no-export flex items-center justify-between px-3 py-1.5 border-b text-xs"
           style={{ borderColor: 'var(--border-color)', color: 'var(--meta-content-color)' }}>
        <div className="relative flex items-center gap-1.5">
          <span className="font-mono opacity-60">```{language}</span>
          <input
            type="text"
            value={langQuery}
            onFocus={() => setShowLangPopup(true)}
            onBlur={() => setTimeout(() => setShowLangPopup(false), 160)}
            onChange={(e) => {
              setLangQuery(e.target.value);
              setShowLangPopup(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const chosen = filteredLanguages[0] || langQuery.trim() || 'plaintext';
                onChange(code, chosen);
                setShowLangPopup(false);
              }
            }}
            placeholder="langage..."
            aria-label="Sélectionner le langage du bloc de code"
            className="px-1.5 py-0.5 rounded bg-transparent border border-transparent focus:border-current outline-none font-mono text-xs w-28"
          />

          {showLangPopup && filteredLanguages.length > 0 && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-44 rounded-md shadow-lg py-1 z-30 border"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              {filteredLanguages.map((langItem) => (
                <button
                  key={langItem}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setLangQuery(langItem);
                    onChange(code, langItem);
                    setShowLangPopup(false);
                  }}
                  className="w-full text-left px-3 py-1 text-xs font-mono hover:opacity-80 flex items-center justify-between"
                  style={{
                    color: langItem === language ? 'var(--primary-color)' : 'var(--text-color)',
                  }}
                >
                  <span>{langItem}</span>
                  {langItem === language && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
          {isDiagram && (
            <button
              type="button"
              onClick={() => setShowDiagramSource((v) => !v)}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Basculer entre le code du diagramme et l'aperçu SVG"
            >
              {showDiagramSource ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
              <span>{showDiagramSource ? 'Aperçu SVG' : 'Éditer Source'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Copier le code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500">Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* CodeMirror 6 container (always mounted, hidden when viewing only diagram SVG) */}
      <div
        ref={editorContainerRef}
        className={`px-3 ${isDiagram && !showDiagramSource && !isActive ? 'hidden' : 'block'}`}
      />

      {/* Live SVG Diagram Preview + Error Hint */}
      {isDiagram && (
        <div
          className="p-4 border-t transition-colors"
          style={{
            backgroundColor: 'var(--bg-color)',
            borderColor: 'var(--border-color)',
          }}
          onDoubleClick={() => setShowDiagramSource(true)}
        >
          {diagramError ? (
            <div className="flex items-start gap-2.5 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-mono">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">
                  Erreur de syntaxe dans le diagramme ({normalizedLang.toUpperCase()})
                </div>
                <div className="opacity-90 whitespace-pre-wrap">{diagramError}</div>
              </div>
            </div>
          ) : (
            <div
              className="overflow-x-auto flex justify-center py-2"
              dangerouslySetInnerHTML={{ __html: diagramSvg }}
            />
          )}
        </div>
      )}
    </div>
  );
};
