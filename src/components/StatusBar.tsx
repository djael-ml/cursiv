import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Code2, Eye, Sparkles, ZoomIn } from 'lucide-react';

interface StatusBarProps {
  markdownText: string;
  readingSpeedWpm: number;
  pageZoom?: number;
  focusMode: boolean;
  typewriterMode: boolean;
  sourceCodeMode: boolean;
  onResetPageZoom?: () => void;
  onToggleFocusMode: () => void;
  onToggleTypewriterMode: () => void;
  onToggleSourceCodeMode: () => void;
}

function computeStats(text: string, wpm: number) {
  const cleaned = text.trim();
  if (!cleaned) {
    return { words: 0, chars: 0, charsNoSpaces: 0, lines: 0, minutes: 0 };
  }
  // Support Latin words + CJK ideographs
  const cjkMatches = cleaned.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || [];
  const latinWords = cleaned
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const words = latinWords.length + cjkMatches.length;
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s+/g, '').length;
  const lines = text.split('\n').length;
  const minutes = Math.max(1, Math.ceil(words / Math.max(50, wpm)));

  return { words, chars, charsNoSpaces, lines, minutes };
}

export const StatusBar: React.FC<StatusBarProps> = ({
  markdownText,
  readingSpeedWpm,
  pageZoom = 100,
  focusMode,
  typewriterMode,
  sourceCodeMode,
  onResetPageZoom,
  onToggleFocusMode,
  onToggleTypewriterMode,
  onToggleSourceCodeMode,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      setSelectedText(sel ? sel.toString() : '');
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const docStats = useMemo(
    () => computeStats(markdownText, readingSpeedWpm),
    [markdownText, readingSpeedWpm]
  );

  const selStats = useMemo(
    () => (selectedText.trim() ? computeStats(selectedText, readingSpeedWpm) : null),
    [selectedText, readingSpeedWpm]
  );

  const activeStats = selStats || docStats;

  return (
    <div className="no-print no-export fixed bottom-3 right-5 z-30 flex items-center gap-2 select-none">
      {/* Page Zoom Indicator (Ctrl + Molette) */}
      {pageZoom !== 100 && (
        <button
          type="button"
          onClick={onResetPageZoom}
          className="cursiv-glass-toolbar px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1 shadow-xs cursor-pointer hover:opacity-100 opacity-85 transition-opacity"
          style={{ color: 'var(--primary-color)' }}
          title="Cliquer pour réinitialiser l'échelle de la page à 100% (Ctrl + Molette)"
        >
          <ZoomIn className="w-3 h-3" />
          <span>{pageZoom}%</span>
        </button>
      )}

      {/* Mode Quick Indicators */}
      {focusMode && (
        <button
          type="button"
          onClick={onToggleFocusMode}
          className="cursiv-glass-toolbar px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1 shadow-xs cursor-pointer"
          style={{ color: 'var(--primary-color)' }}
          title="Désactiver Focus Mode (F8)"
        >
          <Eye className="w-3 h-3" />
          <span>Focus (F8)</span>
        </button>
      )}

      {typewriterMode && (
        <button
          type="button"
          onClick={onToggleTypewriterMode}
          className="cursiv-glass-toolbar px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1 shadow-xs cursor-pointer"
          style={{ color: 'var(--primary-color)' }}
          title="Désactiver Typewriter Mode (F9)"
        >
          <Sparkles className="w-3 h-3" />
          <span>Typewriter (F9)</span>
        </button>
      )}

      <button
        type="button"
        onClick={onToggleSourceCodeMode}
        className="cursiv-glass-toolbar p-1.5 rounded-full text-xs opacity-65 hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
        style={{ color: sourceCodeMode ? 'var(--primary-color)' : 'var(--meta-content-color)' }}
        title="Basculer Mode Code Source (Ctrl+/)"
      >
        <Code2 className="w-3.5 h-3.5" />
      </button>

      {/* Word Count & Reading Time Pill */}
      <div
        className="relative"
        onMouseEnter={() => setShowPopup(true)}
        onMouseLeave={() => setShowPopup(false)}
      >
        <button
          type="button"
          onClick={() => setShowPopup((v) => !v)}
          className="cursiv-glass-toolbar px-3 py-1 rounded-full text-xs opacity-75 hover:opacity-100 transition-opacity shadow-xs cursor-pointer flex items-center gap-2"
          style={{ color: 'var(--meta-content-color)' }}
        >
          <span>
            {selStats ? `${selStats.words} / ${docStats.words} mots` : `${docStats.words} mots`}
          </span>
          <span className="opacity-50">·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {activeStats.minutes} min
          </span>
        </button>

        {showPopup && (
          <div
            className="cursiv-popup-anim absolute bottom-full right-0 mb-2 w-60 p-3.5 rounded-xl shadow-xl border text-xs space-y-2"
            style={{
              backgroundColor: 'var(--bg-color)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-color)',
            }}
          >
            <div
              className="font-semibold pb-1.5 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <span>{selStats ? 'Statistiques de la sélection' : 'Statistiques du document'}</span>
              <span className="text-[10px] font-mono opacity-65">{readingSpeedWpm} mpm</span>
            </div>

            <div className="flex justify-between">
              <span style={{ color: 'var(--meta-content-color)' }}>Temps de lecture</span>
              <span className="font-mono font-medium">~{activeStats.minutes} min</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--meta-content-color)' }}>Mots</span>
              <span className="font-mono font-medium">{activeStats.words}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--meta-content-color)' }}>Caractères</span>
              <span className="font-mono font-medium">{activeStats.chars}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--meta-content-color)' }}>Sans espaces</span>
              <span className="font-mono font-medium">{activeStats.charsNoSpaces}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--meta-content-color)' }}>Lignes</span>
              <span className="font-mono font-medium">{activeStats.lines}</span>
            </div>
            <div
              className="pt-1 border-t text-[10px] opacity-60 text-right"
              style={{ borderColor: 'var(--border-color)' }}
            >
              Cursiv. par Djaël Mola
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
