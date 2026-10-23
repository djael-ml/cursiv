import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CaseSensitive, ChevronRight, Replace, X } from 'lucide-react';

/**
 * Cursiv Find & Replace bar (Ctrl+F / Ctrl+H) — conçu par Djaël Mola.
 * Highlights matches in the rendered page through the CSS Custom Highlight API
 * (no DOM mutation, so React rendering is never disturbed).
 */

export interface FindMatch {
  range: Range;
  blockId: string;
  indexInBlock: number;
}

interface FindReplaceBarProps {
  isOpen: boolean;
  replaceMode: boolean;
  focusSignal: number;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  contentVersion: unknown;
  onToggleReplaceMode: () => void;
  onReplaceOne: (match: FindMatch, query: string, replacement: string, caseSensitive: boolean) => void;
  onReplaceAll: (query: string, replacement: string, caseSensitive: boolean) => number;
  onClose: () => void;
}

type HighlightRegistry = {
  set: (name: string, value: unknown) => void;
  delete: (name: string) => void;
};

function getHighlightRegistry(): HighlightRegistry | null {
  const cssAny = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  if (!cssAny?.highlights || typeof (globalThis as Record<string, unknown>).Highlight !== 'function') {
    return null;
  }
  return cssAny.highlights;
}

function makeHighlight(ranges: Range[]): unknown {
  const HighlightCtor = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
  return new HighlightCtor(...ranges);
}

export function clearFindHighlights() {
  const reg = getHighlightRegistry();
  reg?.delete('cursiv-find');
  reg?.delete('cursiv-find-current');
}

const EXCLUDED_SELECTOR = '.katex-mathml, .md-token-marker, .no-export, .invisible, textarea, input, script, style';

function collectMatches(root: HTMLElement, query: string, caseSensitive: boolean): FindMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: FindMatch[] = [];
  const blockEls = root.querySelectorAll<HTMLElement>('[data-block-id]');

  blockEls.forEach((blockEl) => {
    const blockId = blockEl.dataset.blockId;
    if (!blockId) return;

    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest(EXCLUDED_SELECTOR)) return NodeFilter.FILTER_REJECT;
        // Skip text belonging to a nested block (defensive)
        if (parent.closest('[data-block-id]') !== blockEl) return NodeFilter.FILTER_REJECT;
        return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const segments: { node: Text; start: number }[] = [];
    let full = '';
    let current = walker.nextNode() as Text | null;
    while (current) {
      segments.push({ node: current, start: full.length });
      full += current.nodeValue || '';
      current = walker.nextNode() as Text | null;
    }
    if (!full) return;

    const hay = caseSensitive ? full : full.toLowerCase();
    const locate = (offset: number, preferEnd: boolean) => {
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        const len = seg.node.nodeValue?.length || 0;
        if (preferEnd ? offset > seg.start && offset <= seg.start + len : offset >= seg.start && offset < seg.start + len) {
          return { node: seg.node, offset: offset - seg.start };
        }
      }
      return null;
    };

    let indexInBlock = 0;
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      const startPos = locate(idx, false);
      const endPos = locate(idx + query.length, true);
      if (startPos && endPos) {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        matches.push({ range, blockId, indexInBlock });
      }
      indexInBlock++;
      idx = hay.indexOf(needle, idx + Math.max(1, query.length));
    }
  });

  return matches;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  isOpen,
  replaceMode,
  focusSignal,
  sheetRef,
  contentVersion,
  onToggleReplaceMode,
  onReplaceOne,
  onReplaceAll,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const highlightSupported = getHighlightRegistry() !== null;

  // Focus & prefill with current selection when opened / re-triggered
  useLayoutEffect(() => {
    if (!isOpen) return;
    const selected = window.getSelection()?.toString().trim();
    if (selected && selected.length < 120 && !selected.includes('\n')) {
      setQuery(selected);
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen, focusSignal]);

  const recompute = useCallback(() => {
    const root = sheetRef.current;
    if (!isOpen || !root) {
      setMatches([]);
      return;
    }
    const found = collectMatches(root, query, caseSensitive);
    setMatches(found);
    setCurrentIndex((prev) => (found.length === 0 ? 0 : Math.min(prev, found.length - 1)));
  }, [isOpen, query, caseSensitive, sheetRef]);

  // Recompute after React has rendered the latest content (diagrams/KaTeX included)
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(recompute, 60);
    return () => window.clearTimeout(timer);
  }, [recompute, contentVersion, isOpen]);

  // Paint highlights
  useEffect(() => {
    const reg = getHighlightRegistry();
    if (!reg) return;
    if (!isOpen || matches.length === 0) {
      clearFindHighlights();
      return;
    }
    reg.set('cursiv-find', makeHighlight(matches.map((m) => m.range)));
    const current = matches[currentIndex];
    if (current) {
      reg.set('cursiv-find-current', makeHighlight([current.range]));
    }
  }, [matches, currentIndex, isOpen]);

  // Scroll current match into view
  useEffect(() => {
    const current = matches[currentIndex];
    if (!isOpen || !current) return;
    const el = current.range.startContainer.parentElement;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentIndex, matches, isOpen]);

  useEffect(() => {
    if (!isOpen) clearFindHighlights();
    return () => clearFindHighlights();
  }, [isOpen]);

  if (!isOpen) return null;

  const goTo = (delta: number) => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev + delta + matches.length) % matches.length);
  };

  const handleReplaceOne = () => {
    const current = matches[currentIndex];
    if (!current || !query) return;
    onReplaceOne(current, query, replacement, caseSensitive);
    setFeedback(null);
  };

  const handleReplaceAll = () => {
    if (!query) return;
    const count = onReplaceAll(query, replacement, caseSensitive);
    setFeedback(count > 0 ? `${count} remplacement${count > 1 ? 's' : ''}` : 'Aucune occurrence');
    window.setTimeout(() => setFeedback(null), 2200);
  };

  const counterLabel =
    !query ? '' : matches.length === 0 ? 'Aucun résultat' : `${currentIndex + 1} sur ${matches.length}`;

  const iconBtn =
    'p-1 rounded hover:bg-black/8 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default';

  return (
    <div
      className="no-print no-export cursiv-popup-anim cursiv-glass-toolbar fixed top-12 right-5 z-[90] w-[22rem] rounded-xl border shadow-xl p-2 text-xs space-y-1.5"
      style={{ borderColor: 'var(--border-color)', color: 'var(--text-color)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleReplaceMode}
          className={iconBtn}
          title="Afficher le remplacement (Ctrl+H)"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${replaceMode ? 'rotate-90' : ''}`} />
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              goTo(e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Rechercher dans le document"
          spellCheck={false}
          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-transparent border outline-none focus:border-[var(--primary-color)]"
          style={{ borderColor: 'var(--border-color)' }}
        />
        <span className="w-[4.6rem] text-right text-[10px] tabular-nums opacity-60 shrink-0">{counterLabel}</span>
        <button
          type="button"
          onClick={() => setCaseSensitive((v) => !v)}
          className={`${iconBtn} ${caseSensitive ? 'bg-black/10 dark:bg-white/15' : ''}`}
          title="Respecter la casse"
        >
          <CaseSensitive className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => goTo(-1)} disabled={matches.length === 0} className={iconBtn} title="Précédent (Maj+Entrée)">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => goTo(1)} disabled={matches.length === 0} className={iconBtn} title="Suivant (Entrée)">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onClose} className={iconBtn} title="Fermer (Échap)">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {replaceMode && (
        <div className="flex items-center gap-1 pl-6">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) handleReplaceAll();
                else handleReplaceOne();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Remplacer par"
            spellCheck={false}
            className="flex-1 min-w-0 px-2 py-1 rounded-md bg-transparent border outline-none focus:border-[var(--primary-color)]"
            style={{ borderColor: 'var(--border-color)' }}
          />
          <button
            type="button"
            onClick={handleReplaceOne}
            disabled={matches.length === 0}
            className={`${iconBtn} px-1.5 flex items-center gap-1`}
            title="Remplacer (Entrée)"
          >
            <Replace className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={!query}
            className={`${iconBtn} px-1.5 text-[10px] font-medium`}
            title="Tout remplacer (Ctrl+Entrée)"
          >
            Tout
          </button>
        </div>
      )}

      {(feedback || !highlightSupported) && (
        <div className="pl-6 text-[10px] opacity-60">
          {feedback || 'Surlignage indisponible sur ce moteur (navigation uniquement).'}
        </div>
      )}
    </div>
  );
};
