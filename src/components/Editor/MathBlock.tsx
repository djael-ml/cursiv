import React, { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { MathEnvironmentContext, renderLatexToHtml } from '../../utils/mathEngine';

interface MathBlockProps {
  id: string;
  latex: string;
  mathEnv: MathEnvironmentContext;
  isActive: boolean;
  onFocusBlock: () => void;
  onChange: (newLatex: string) => void;
}

export const MathBlock: React.FC<MathBlockProps> = ({
  id,
  latex,
  mathEnv,
  isActive,
  onFocusBlock,
  onChange,
}) => {
  const [editing, setEditing] = useState(false);
  const rendered = renderLatexToHtml(latex, true, mathEnv, id);

  const isEditorOpen = isActive && editing;

  return (
    <div
      className="my-4 rounded-lg transition-colors cursor-pointer"
      onClick={() => {
        onFocusBlock();
        setEditing(true);
      }}
    >
      {/* Live Math Preview */}
      <div className="py-3 px-4 overflow-x-auto text-center">
        {rendered.error ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Erreur LaTeX : {rendered.error}</span>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
        )}
      </div>

      {/* Live Equation Source Drawer (Validated with Ctrl+Enter or ✓ button) */}
      {isEditorOpen && (
        <div
          className="no-export cursiv-popup-anim mt-1 p-3 rounded-lg border shadow-sm"
          style={{
            backgroundColor: 'var(--code-bg-color)',
            borderColor: 'var(--primary-color)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-xs mb-1.5"
               style={{ color: 'var(--meta-content-color)' }}>
            <span className="font-mono">$$ Bloc d'équation LaTeX / mhchem (\ce) / Physics</span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-white cursor-pointer"
              style={{ backgroundColor: 'var(--primary-color)' }}
              title="Valider l'équation (Ctrl+Entrée)"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Valider</span>
            </button>
          </div>
          <textarea
            autoFocus
            value={latex}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                setEditing(false);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
            rows={Math.max(2, latex.split('\n').length)}
            className="w-full bg-transparent outline-none font-mono text-sm resize-y"
            style={{ color: 'var(--text-color)' }}
            placeholder="\int_{-\infty}^{\infty} e^{-x^2} \dd x = \sqrt{\pi}"
          />
          <div className="text-[11px] font-mono opacity-65 text-right">
            $$ · Appuyez sur Ctrl+Entrée pour valider
          </div>
        </div>
      )}
    </div>
  );
};
