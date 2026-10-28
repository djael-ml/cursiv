import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Minus,
  PanelLeft,
  RotateCcw,
  Settings,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { BuiltInThemeId, CursivPreferences, LastExportConfig } from '../types/editor';
import { BUILTIN_THEMES } from '../utils/themeManager';
import { isTauriEnvironment, openLogDirectory } from '../utils/tauriBridge';

interface TitlebarProps {
  currentFileName: string;
  isDirty: boolean;
  sidebarOpen: boolean;
  preferences: CursivPreferences;
  lastExportConfig: LastExportConfig | null;
  onToggleSidebar: () => void;
  onNewFile: (ext?: string) => void;
  onSaveFile: () => void;
  onImportPandocFile: () => void;
  onExportDocument: (format: LastExportConfig['format']) => void;
  onExportWithPrevious: (overwrite: boolean) => void;
  onUpdatePreferences: (patch: Partial<CursivPreferences>) => void;
  onOpenPreferencesModal: () => void;
  onCheckForUpdates: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFind?: () => void;
  onReplace?: () => void;
  onQuickSwitcher?: () => void;
  onCommandPalette?: () => void;
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
  onUndo,
  onRedo,
  onFind,
  onReplace,
  onQuickSwitcher,
  onCommandPalette,
}) => {
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'view' | 'themes' | 'help' | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [openMenu]);

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

  const currentZoom = preferences.pageZoom || 100;

  return (
    <header
      data-tauri-drag-region
      style={{
        backgroundColor: 'var(--bg-color)',
        color: 'var(--text-color)',
        borderColor: 'color-mix(in srgb, var(--border-color) 45%, transparent)',
      }}
      className="no-print no-export h-9 px-3 border-b flex items-center justify-between text-xs select-none relative z-[70] transition-colors shrink-0"
    >
      {/* Left section: Sidebar Toggle + Brand Logo "Cursiv." + Top Menus */}
      <div ref={menuContainerRef} className="flex items-center gap-1 relative z-[80]">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${
            sidebarOpen ? 'opacity-100' : 'opacity-60 hover:opacity-100'
          }`}
          title="Afficher / Masquer le volet de navigation (Ctrl+Shift+L)"
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
            onMouseEnter={() => {
              if (openMenu && openMenu !== 'file') setOpenMenu('file');
            }}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              openMenu === 'file'
                ? 'opacity-100 bg-black/6 dark:bg-white/10'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            Fichier
          </button>
          {openMenu === 'file' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-64 rounded-xl shadow-2xl border py-1.5 z-[120]"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onNewFile('.md');
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Nouveau document (.md)</span>
                <span className="opacity-50 font-mono">Ctrl+N</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNewFile('.txt');
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Nouveau fichier texte (.txt)</span>
                <span className="opacity-50 font-mono">.txt</span>
              </button>
              <div className="px-3 py-1 flex items-center gap-1 flex-wrap">
                {['.json', '.csv', '.py', '.ts', '.html', '.sql'].map((ext) => (
                  <button
                    key={ext}
                    type="button"
                    onClick={() => {
                      onNewFile(ext);
                      setOpenMenu(null);
                    }}
                    className="px-1.5 py-0.5 rounded border text-[10px] font-mono hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    +{ext}
                  </button>
                ))}
              </div>
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
                Exporter avec le format précédent{' '}
                {lastExportConfig ? `(${lastExportConfig.format.toUpperCase()})` : ''}
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
                Exporter et écraser le fichier précédent
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
                <span>Préférences & Personnalisation...</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu: Édition */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}
            onMouseEnter={() => {
              if (openMenu && openMenu !== 'edit') setOpenMenu('edit');
            }}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              openMenu === 'edit'
                ? 'opacity-100 bg-black/6 dark:bg-white/10'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            Édition
          </button>
          {openMenu === 'edit' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-64 rounded-xl shadow-2xl border py-1.5 z-[120]"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onUndo?.();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Annuler</span>
                <span className="opacity-50 font-mono">Ctrl+Z</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onRedo?.();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Rétablir</span>
                <span className="opacity-50 font-mono">Ctrl+Y</span>
              </button>

              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />

              <button
                type="button"
                onClick={() => {
                  onFind?.();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Rechercher</span>
                <span className="opacity-50 font-mono">Ctrl+F</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onReplace?.();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Rechercher et remplacer</span>
                <span className="opacity-50 font-mono">Ctrl+H</span>
              </button>

              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />

              <button
                type="button"
                onClick={() => {
                  onQuickSwitcher?.();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Ouvrir un fichier...</span>
                <span className="opacity-50 font-mono">Ctrl+E</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onCommandPalette?.();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between cursor-pointer"
              >
                <span>Palette de commandes</span>
                <span className="opacity-50 font-mono">Ctrl+Maj+P</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu: Affichage */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
            onMouseEnter={() => {
              if (openMenu && openMenu !== 'view') setOpenMenu('view');
            }}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              openMenu === 'view'
                ? 'opacity-100 bg-black/6 dark:bg-white/10'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            Affichage
          </button>
          {openMenu === 'view' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-68 rounded-xl shadow-2xl border py-1.5 z-[120]"
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
                <span>Barre d&apos;outils flottante</span>
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
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-55 font-semibold flex justify-between">
                <span>Échelle de la page (Ctrl + Molette)</span>
                <span className="font-mono">{currentZoom}%</span>
              </div>
              <div className="px-3 py-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({
                      pageZoom: Math.max(50, currentZoom - 10),
                    })
                  }
                  className="flex-1 py-1 px-2 rounded border hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1 cursor-pointer"
                  style={{ borderColor: 'var(--border-color)' }}
                  title="Réduire l'échelle de la page"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span>-10%</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePreferences({ pageZoom: 100 })}
                  className="py-1 px-2.5 rounded border hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1 font-mono cursor-pointer"
                  style={{ borderColor: 'var(--border-color)' }}
                  title="Réinitialiser à 100%"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>100%</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({
                      pageZoom: Math.min(200, currentZoom + 10),
                    })
                  }
                  className="flex-1 py-1 px-2 rounded border hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1 cursor-pointer"
                  style={{ borderColor: 'var(--border-color)' }}
                  title="Agrandir l'échelle de la page"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>+10%</span>
                </button>
              </div>

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
            onMouseEnter={() => {
              if (openMenu && openMenu !== 'themes') setOpenMenu('themes');
            }}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              openMenu === 'themes'
                ? 'opacity-100 bg-black/6 dark:bg-white/10'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            Thèmes
          </button>
          {openMenu === 'themes' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-56 rounded-xl shadow-2xl border py-1.5 z-[120]"
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
                Personnaliser le CSS & Couleur d&apos;accent...
              </button>
            </div>
          )}
        </div>

        {/* Menu: Aide */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
            onMouseEnter={() => {
              if (openMenu && openMenu !== 'help') setOpenMenu('help');
            }}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              openMenu === 'help'
                ? 'opacity-100 bg-black/6 dark:bg-white/10'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            Aide
          </button>
          {openMenu === 'help' && (
            <div
              className="cursiv-popup-anim absolute left-0 top-full mt-1 w-64 rounded-xl shadow-2xl border py-1.5 z-[120]"
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
                Configuration Pandoc & Préférences...
              </button>
              <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
              <div className="px-3 py-1.5 text-[11px] opacity-75 leading-relaxed">
                <div className="font-semibold">Cursiv. v1.18.0</div>
                <div>Conçu et développé par <span className="font-semibold">Djaël Mola</span></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Mathematically Centered Document Title ("Cursiv. — Nom du fichier en cours") */}
      <div
        data-tauri-drag-region
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-2 font-medium opacity-85 truncate max-w-[42vw] pointer-events-none"
      >
        <span className="cursiv-brand-logo text-sm opacity-95 shrink-0">
          Cursiv<span style={{ color: 'var(--primary-color)' }}>.</span>
        </span>
        <span className="opacity-35 shrink-0">—</span>
        <span className="truncate">{currentFileName}</span>
        {isDirty && (
          <span
            className="w-2 h-2 rounded-full inline-block shrink-0"
            style={{ backgroundColor: 'var(--primary-color)' }}
            title="Modifications non enregistrées"
          />
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-1 relative z-[80]">
        <button
          type="button"
          onClick={onOpenPreferencesModal}
          className="p-1.5 rounded opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          title="Préférences (Ctrl+,)"
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
