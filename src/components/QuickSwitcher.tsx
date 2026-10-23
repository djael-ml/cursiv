import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CornerDownLeft, FileText, Search } from 'lucide-react';
import { FileEntryNode } from '../types/editor';

/**
 * Cursiv Quick Switcher (Ctrl+E) & Command Palette (Ctrl+Shift+P) — conçu par Djaël Mola.
 * Typing `>` switches from file search to command search.
 */

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

interface QuickSwitcherProps {
  isOpen: boolean;
  initialQuery: string;
  files: FileEntryNode[];
  workspaceRoot: string;
  currentFilePath: string;
  commands: PaletteCommand[];
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

interface ScoredItem<T> {
  item: T;
  score: number;
  positions: number[];
}

/** Subsequence fuzzy matcher with bonuses for consecutive chars and word starts. */
function fuzzyScore(text: string, query: string): { score: number; positions: number[] } | null {
  if (!query) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    positions.push(found);
    score += 1;
    if (found === prev + 1) score += 3;
    if (found === 0 || /[\s/_\-.]/.test(t[found - 1])) score += 4;
    prev = found;
    ti = found + 1;
  }
  // Prefer shorter texts and direct substring hits
  if (t.includes(q)) score += 6;
  score -= text.length * 0.02;
  return { score, positions };
}

function flattenFiles(nodes: FileEntryNode[], out: FileEntryNode[] = []): FileEntryNode[] {
  for (const n of nodes) {
    if (n.is_dir) {
      if (n.children) flattenFiles(n.children, out);
    } else {
      out.push(n);
    }
  }
  return out;
}

function Highlighted({ text, positions }: { text: string; positions: number[] }) {
  if (positions.length === 0) return <>{text}</>;
  const set = new Set(positions);
  return (
    <>
      {text.split('').map((ch, i) =>
        set.has(i) ? (
          <span key={i} style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            {ch}
          </span>
        ) : (
          <React.Fragment key={i}>{ch}</React.Fragment>
        )
      )}
    </>
  );
}

export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  isOpen,
  initialQuery,
  files,
  workspaceRoot,
  currentFilePath,
  commands,
  onOpenFile,
  onClose,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, initialQuery]);

  const commandMode = query.startsWith('>');
  const term = commandMode ? query.slice(1).trim() : query.trim();

  const flatFiles = useMemo(() => flattenFiles(files), [files]);

  const fileResults = useMemo((): ScoredItem<FileEntryNode>[] => {
    if (commandMode) return [];
    const root = workspaceRoot.replace(/\/$/, '');
    const scored: ScoredItem<FileEntryNode>[] = [];
    for (const f of flatFiles) {
      const res = fuzzyScore(f.name, term);
      if (res) {
        // Small boost for recently modified files when the query is empty
        const recency = term ? 0 : f.modified_ms / 1e13;
        scored.push({ item: f, score: res.score + recency, positions: res.positions });
      } else if (term) {
        const rel = f.path.startsWith(root) ? f.path.slice(root.length + 1) : f.path;
        const pathRes = fuzzyScore(rel, term);
        if (pathRes) scored.push({ item: f, score: pathRes.score - 5, positions: [] });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [commandMode, flatFiles, term, workspaceRoot]);

  const commandResults = useMemo((): ScoredItem<PaletteCommand>[] => {
    if (!commandMode) return [];
    const scored: ScoredItem<PaletteCommand>[] = [];
    for (const c of commands) {
      const res = fuzzyScore(c.label, term);
      if (res) scored.push({ item: c, score: res.score, positions: res.positions });
    }
    return term ? scored.sort((a, b) => b.score - a.score) : scored;
  }, [commandMode, commands, term]);

  const total = commandMode ? commandResults.length : fileResults.length;

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, total - 1)));
  }, [total]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const activate = (idx: number) => {
    if (commandMode) {
      const cmd = commandResults[idx]?.item;
      if (!cmd) return;
      onClose();
      // Let the palette unmount before running (focus-sensitive commands)
      requestAnimationFrame(() => cmd.run());
    } else {
      const file = fileResults[idx]?.item;
      if (!file) return;
      onClose();
      onOpenFile(file.path);
    }
  };

  const root = workspaceRoot.replace(/\/$/, '');

  return (
    <div
      className="no-print no-export fixed inset-0 z-[160] flex items-start justify-center pt-[12vh] bg-black/20"
      onMouseDown={onClose}
    >
      <div
        className="cursiv-popup-anim w-full max-w-lg mx-4 rounded-xl border shadow-2xl overflow-hidden text-sm"
        style={{
          backgroundColor: 'var(--bg-color)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-color)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          {commandMode ? (
            <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />
          ) : (
            <Search className="w-4 h-4 opacity-50 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => (total === 0 ? 0 : (s + 1) % total));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => (total === 0 ? 0 : (s - 1 + total) % total));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                activate(selected);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={commandMode ? 'Rechercher une commande…' : 'Ouvrir un fichier…  (tapez > pour les commandes)'}
            spellCheck={false}
            className="flex-1 bg-transparent outline-none"
          />
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {total === 0 && (
            <div className="px-4 py-6 text-center text-xs opacity-50">
              {commandMode ? 'Aucune commande' : 'Aucun fichier'}
            </div>
          )}

          {!commandMode &&
            fileResults.map(({ item, positions }, idx) => {
              const rel = item.path.startsWith(root) ? item.path.slice(root.length + 1) : item.path;
              const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
              const isCurrent = item.path === currentFilePath;
              return (
                <button
                  key={item.path}
                  type="button"
                  data-idx={idx}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => activate(idx)}
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer"
                  style={{ backgroundColor: idx === selected ? 'var(--code-bg-color)' : 'transparent' }}
                >
                  <FileText className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  <span className="truncate">
                    <Highlighted text={item.name} positions={positions} />
                  </span>
                  {folder && <span className="truncate text-[11px] opacity-45">{folder}</span>}
                  {isCurrent && <span className="ml-auto text-[10px] opacity-45 shrink-0">ouvert</span>}
                  {idx === selected && !isCurrent && (
                    <CornerDownLeft className="ml-auto w-3 h-3 opacity-40 shrink-0" />
                  )}
                </button>
              );
            })}

          {commandMode &&
            commandResults.map(({ item, positions }, idx) => (
              <button
                key={item.id}
                type="button"
                data-idx={idx}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => activate(idx)}
                className="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left cursor-pointer"
                style={{ backgroundColor: idx === selected ? 'var(--code-bg-color)' : 'transparent' }}
              >
                <span className="truncate">
                  <Highlighted text={item.label} positions={positions} />
                </span>
                {item.shortcut && (
                  <span className="text-[10px] font-mono opacity-45 shrink-0">{item.shortcut}</span>
                )}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};
