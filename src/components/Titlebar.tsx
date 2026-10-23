import React, { useState } from 'react';
import {
  Download,
  Minus,
  PanelLeft,
  Settings,
  Square,
  X,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { BuiltInThemeId, CursivPreferences, LastExportConfig } from '../types/editor';
import { BUILTIN_THEMES } from '../utils/themeManager';
import { isTauriEnvironment } from '../utils/tauriBridge';

interface TitlebarProps {
  currentFileName: string;
  isDirty: boolean;
  sidebarOpen: boolean;
  preferences: CursivPreferences;
  lastExportConfig: LastExportConfig | null;
  onToggleSidebar: () => void;
  onNewFile: () => void;
  onSaveFile: () => void;
  onImportPandocFile: () => void;
  onExportDocument: (format: LastExportConfig['format']) => void;
  onExportWithPrevious: (overwrite: boolean) => void;
  onUpdatePreferences: (patch: Partial<CursivPreferences>) => void;
  onOpenPreferencesModal: () => void;
  onCheckForUpdates: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  currentFileName,
  isDirty,
  sidebarOpen,
  preferences,
  lastExportConfig,
  onToggleSidebar,
  onNewFile,
  onSaveFile,
  onImportPandocFile,
  onExportDocument,
  onExportWithPrevious,
  onUpdatePreferences,
  onOpenPreferencesModal,
  onCheckForUpdates,
}) => {
  const [openMenu, setOpenMenu] = useState<'file' | 'view' | 'themes' | 'help' | null>(null);

  const handleMinimize = async () => {
    if (isTauriEnvironment()) {
      await getCurrentWindow().minimize();
    }
  };

  const handleMaximize = async () => {
    if (isTauriEnvironment()) {
      await getCurrentWindow().toggleMaximize();
    }
  };

  const handleClose = async () => {
    if (isTauriEnvironment()) {
      await getCurrentWindow().close();
    }
  };

  return (
    <header
      data-tauri-drag-region
      style={{
        backgroundColor: 'var(--bg-color)',
        color: 'var(--text-color)',
      }}
      className="no-print no-export h-9 px-3 flex items-center justify-between text-xs select-none relative z-40 transition-colors"
      onMouseLeave={() => setOpenMenu(null)}
    >
      {/* Left section: Sidebar Toggle + Brand Logo "Cursiv." + Subtle Menus */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${
            sidebarOpen ? 'opacity-100' : 'opacity-60 hover:opacity-100'
          }`}
          title="Afficher / Masquer la Sidebar (Ctrl+Shift+L)"
        >
          <PanelLeft className="w-3.5 h-3.5" />
        </button>

        <span
          className="cursiv-brand-logo text-base px-1.5 select-none"
          style={{ color: 'var(--text-color)' }}
        >
          Cursiv<span style={{ color: 'var(--primary-color)' }}>.</span>
        </span>

        {/* Menu: Fichier */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
            className="px-2 py-1 rounded opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            Fichier
          </button>
          {openMenu === 'file' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-64 rounded-lg shadow-xl border py-1.5 z-50"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onNewFile();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Nouveau document</span>
                <span className="opacity-50 font-mono">Ctrl+N</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveFile();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Enregistrer</span>
                <span className="opacity-50 font-mono">Ctrl+S</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onImportPandocFile();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                Importer via Pandoc (.docx, .tex, .odt)...
              </button>

              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-55 font-semibold">
                Export Natif (Sans dépendance)
              </div>
              <button
                type="button"
                onClick={() => {
                  onExportDocument('pdf');
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer"
              >
                <span>PDF (Signets automatiques)</span>
                <Download className="w-3 h-3 opacity-60" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportDocument('html');
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                HTML (Avec styles CSS embarqués)
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportDocument('html-plain');
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                HTML (Sans feuilles de style)
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportDocument('png');
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                Image Haute Résolution (.png)
              </button>

              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-55 font-semibold">
                Pont Universel Pandoc
              </div>
              {(
                [
                  ['docx', 'Word (.docx)'],
                  ['odt', 'OpenOffice (.odt)'],
                  ['latex', 'LaTeX (.tex)'],
                  ['epub', 'EPUB (.epub)'],
                  ['mediawiki', 'MediaWiki (.wiki)'],
                  ['rtf', 'Rich Text Format (.rtf)'],
                  ['rst', 'reStructuredText (.rst)'],
                ] as const
              ).map(([fmt, label]) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    onExportDocument(fmt);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  {label}
                </button>
              ))}

              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <button
                type="button"
                disabled={!lastExportConfig}
                onClick={() => {
                  onExportWithPrevious(false);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 cursor-pointer"
              >
                Export with Previous {lastExportConfig ? `(${lastExportConfig.format.toUpperCase()})` : ''}
              </button>
              <button
                type="button"
                disabled={!lastExportConfig}
                onClick={() => {
                  onExportWithPrevious(true);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 cursor-pointer"
              >
                Export and Overwrite with Previous
              </button>

              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <button
                type="button"
                onClick={() => {
                  onOpenPreferencesModal();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Préférences & Thèmes CSS...</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu: Affichage */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
            className="px-2 py-1 rounded opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            Affichage
          </button>
          {openMenu === 'view' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-64 rounded-lg shadow-xl border py-1.5 z-50"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onUpdatePreferences({
                    showFloatingToolbar: !preferences.showFloatingToolbar,
                  });
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Barre d'outils flottante (1.14)</span>
                <span>{preferences.showFloatingToolbar ? '✓' : ''}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdatePreferences({ focusMode: !preferences.focusMode });
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Focus Mode</span>
                <span className="font-mono opacity-60">
                  {preferences.focusMode ? '✓ ' : ''}F8
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdatePreferences({ typewriterMode: !preferences.typewriterMode });
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Typewriter Mode</span>
                <span className="font-mono opacity-60">
                  {preferences.typewriterMode ? '✓ ' : ''}F9
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdatePreferences({ sourceCodeMode: !preferences.sourceCodeMode });
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Mode Code Source</span>
                <span className="font-mono opacity-60">
                  {preferences.sourceCodeMode ? '✓ ' : ''}Ctrl+/
                </span>
              </button>
              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <button
                type="button"
                onClick={() => {
                  onUpdatePreferences({
                    autoNumberHeadings: !preferences.autoNumberHeadings,
                  });
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Auto-numérotation des titres</span>
                <span>{preferences.autoNumberHeadings ? '✓' : ''}</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu: Thèmes */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'themes' ? null : 'themes')}
            className="px-2 py-1 rounded opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            Thèmes
          </button>
          {openMenu === 'themes' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-56 rounded-lg shadow-xl border py-1.5 z-50"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              {(Object.keys(BUILTIN_THEMES) as BuiltInThemeId[]).map((tId) => {
                const meta = BUILTIN_THEMES[tId];
                const active = preferences.theme === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => {
                      onUpdatePreferences({ theme: tId });
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer"
                  >
                    <span>{meta.name}</span>
                    {active && <span style={{ color: 'var(--primary-color)' }}>✓</span>}
                  </button>
                );
              })}
              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <button
                type="button"
                onClick={() => {
                  onOpenPreferencesModal();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 text-xs opacity-75 cursor-pointer"
              >
                Ouvrir le dossier themes/ (Hot-Reload)...
              </button>
            </div>
          )}
        </div>

        {/* Menu: Aide */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
            className="px-2 py-1 rounded opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            Aide
          </button>
          {openMenu === 'help' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-60 rounded-lg shadow-xl border py-1.5 z-50"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onCheckForUpdates();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                Vérifier les mises à jour GitHub...
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenPreferencesModal();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                Configuration Pandoc & Cloud...
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Center: Ultra-Minimalist Document Title */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 font-medium opacity-80 truncate max-w-md pointer-events-none"
      >
        <span className="cursiv-brand-logo text-sm opacity-90">
          Cursiv<span style={{ color: 'var(--primary-color)' }}>.</span>
        </span>
        <span className="opacity-35">—</span>
        <span className="truncate">{currentFileName}</span>
        {isDirty && (
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: 'var(--primary-color)' }}
            title="Modifications non enregistrées"
          />
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenPreferencesModal}
          className="p-1.5 rounded opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          title="Préférences"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMinimize}
          className="p-1.5 rounded opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          title="Réduire"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="p-1.5 rounded opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          title="Agrandir"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 rounded opacity-60 hover:opacity-100 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
          title="Fermer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
