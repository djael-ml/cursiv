import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Code,
  FileOutput,
  Palette,
  Sigma,
  Sparkles,
  X,
} from 'lucide-react';
import {
  BuiltInThemeId,
  CloudUploadProvider,
  CursivPreferences,
  EquationNumberingMode,
  WaterTintPreset,
} from '../types/editor';
import { BUILTIN_THEMES, DISCREET_ACCENT_PRESETS } from '../utils/themeManager';
import { detectPandocBinary, PandocStatus } from '../utils/tauriBridge';

interface PreferencesModalProps {
  isOpen: boolean;
  preferences: CursivPreferences;
  onUpdatePreferences: (patch: Partial<CursivPreferences>) => void;
  onClose: () => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  preferences,
  onUpdatePreferences,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    'appearance' | 'editor' | 'math' | 'images' | 'themes' | 'export'
  >('appearance');
  const [pandocStatus, setPandocStatus] = useState<PandocStatus | null>(null);
  const [editingCssThemeId, setEditingCssThemeId] = useState<string>(preferences.theme);

  useEffect(() => {
    if (isOpen) {
      detectPandocBinary(preferences.pandocPath).then(setPandocStatus);
      setEditingCssThemeId(preferences.theme);
    }
  }, [isOpen, preferences.pandocPath, preferences.theme]);

  if (!isOpen) return null;

  const currentThemeCss =
    preferences.customThemesCss[editingCssThemeId] ??
    BUILTIN_THEMES[editingCssThemeId as BuiltInThemeId]?.css ??
    BUILTIN_THEMES.github.css;

  return (
    <div
      className="no-print no-export fixed inset-0 z-[150] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="cursiv-popup-anim w-full max-w-3xl h-[560px] rounded-2xl shadow-2xl border flex overflow-hidden text-sm"
        style={{
          backgroundColor: 'var(--bg-color)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Navigation Sidebar */}
        <div
          className="w-56 border-r p-4 flex flex-col justify-between shrink-0"
          style={{
            backgroundColor: 'var(--sidebar-bg-color)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="space-y-1">
            <div className="px-2 pb-3 flex items-baseline gap-2">
              <span className="cursiv-brand-logo text-xl">
                Cursiv<span style={{ color: 'var(--primary-color)' }}>.</span>
              </span>
              <span className="text-xs opacity-60 font-medium">Préférences</span>
            </div>

            {(
              [
                ['appearance', 'Curseur, Accent & Page', <Sparkles key="ap" className="w-4 h-4" />],
                ['editor', 'Édition & Focus', <Code key="ed" className="w-4 h-4" />],
                ['math', 'Math, Chimie & Code', <Sigma key="ma" className="w-4 h-4" />],
                ['images', 'Images & Cloud', <Cloud key="im" className="w-4 h-4" />],
                ['themes', 'Thèmes CSS (Hot-Reload)', <Palette key="th" className="w-4 h-4" />],
                ['export', 'Pandoc & Mise à jour', <FileOutput key="ex" className="w-4 h-4" />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                style={{
                  backgroundColor:
                    activeTab === id
                      ? 'color-mix(in srgb, var(--primary-color) 14%, transparent)'
                      : 'transparent',
                  color: activeTab === id ? 'var(--primary-color)' : 'inherit',
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="text-[11px] opacity-65 px-2 leading-relaxed">
            <div className="font-semibold">Cursiv. v1.17.0</div>
            <div>Par Djaël Mola · Licence MIT</div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col">
          <div
            className="flex items-center justify-between px-6 py-3.5 border-b"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <span className="font-semibold">
              {activeTab === 'appearance' &&
                "Couleur d'Accentuation, Flou de Mouvement & Échelle de la Page"}
              {activeTab === 'editor' && 'Édition Intuitive, Focus & Raccourcis'}
              {activeTab === 'math' && 'Mathématiques (KaTeX / mhchem / Physics) & Blocs de Code'}
              {activeTab === 'images' && 'Gestion des Images Locales & Upload Cloud'}
              {activeTab === 'themes' && 'Système de Thèmes CSS avec Hot-Reload Instantané'}
              {activeTab === 'export' && 'Pont Universel Pandoc & Auto-Update GitHub'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
            {activeTab === 'appearance' && (
              <div className="space-y-5">
                {/* Discreet Accent Color Picker */}
                <div className="space-y-2.5">
                  <div>
                    <div className="font-semibold">
                      Couleur d&apos;accentuation ultra-discrète (Curseur de texte & Sélection)
                    </div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Modifie subtilement la teinte du curseur de frappe, du lasso de sélection et des indicateurs actifs
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {DISCREET_ACCENT_PRESETS.map((preset) => {
                      const isSelected = (preferences.accentColor || '') === preset.color;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => onUpdatePreferences({ accentColor: preset.color })}
                          style={{
                            borderColor: isSelected
                              ? preset.color || 'var(--primary-color)'
                              : 'var(--border-color)',
                            backgroundColor: isSelected
                              ? 'color-mix(in srgb, var(--primary-color) 10%, transparent)'
                              : 'transparent',
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                            style={{
                              backgroundColor: preset.color || '#0969da',
                            }}
                          />
                          <span className={isSelected ? 'font-semibold' : ''}>{preset.label}</span>
                        </button>
                      );
                    })}

                    <label
                      className="flex items-center gap-2 px-2.5 py-1 rounded-lg border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ borderColor: 'var(--border-color)' }}
                      title="Choisir une teinte personnalisée"
                    >
                      <input
                        type="color"
                        value={preferences.accentColor || '#334155'}
                        onChange={(e) => onUpdatePreferences({ accentColor: e.target.value })}
                        className="w-4 h-4 border-0 p-0 bg-transparent cursor-pointer"
                      />
                      <span>Personnalisée</span>
                    </label>
                  </div>
                </div>

                <div className="border-t" style={{ borderColor: 'var(--border-color)' }} />

                {/* Caret Motion Blur & Smooth Speed */}
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">
                        Flou de mouvement du curseur (Motion Blur cinétique)
                      </div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Applique un léger flou directionnel et un halo doux lors des déplacements rapides du curseur
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.caretMotionBlur}
                      onChange={(e) =>
                        onUpdatePreferences({ caretMotionBlur: e.target.checked })
                      }
                    />
                  </label>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Fluidité de glissement du curseur</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Vitesse d&apos;interpolation du curseur entre chaque caractère frappé
                      </div>
                    </div>
                    <select
                      value={preferences.caretSmoothSpeed || 'normal'}
                      onChange={(e) =>
                        onUpdatePreferences({
                          caretSmoothSpeed: e.target.value as 'fast' | 'normal' | 'fluid',
                        })
                      }
                      className="px-2.5 py-1.5 rounded border"
                      style={{
                        borderColor: 'var(--border-color)',
                        backgroundColor: 'var(--bg-color)',
                      }}
                    >
                      <option value="fast">Nerveux & Rapide (42 ms)</option>
                      <option value="normal">Équilibré façon Word (68 ms)</option>
                      <option value="fluid">Ultra-fluide & Doux (95 ms)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t" style={{ borderColor: 'var(--border-color)' }} />

                {/* Page Zoom (Ctrl + Wheel) & Max Page Width */}
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">
                          Échelle de la page ({preferences.pageZoom || 100}%)
                        </div>
                        <div style={{ color: 'var(--meta-content-color)' }}>
                          Modifiable à tout moment avec <kbd className="font-mono">Ctrl + Molette</kbd> sans changer la taille de la fenêtre
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={50}
                          max={200}
                          step={5}
                          value={preferences.pageZoom || 100}
                          onChange={(e) =>
                            onUpdatePreferences({ pageZoom: Number(e.target.value) })
                          }
                          className="w-28 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => onUpdatePreferences({ pageZoom: 100 })}
                          className="px-2 py-0.5 rounded border font-mono text-[11px] hover:bg-black/5 cursor-pointer"
                          style={{ borderColor: 'var(--border-color)' }}
                        >
                          100%
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">
                        Largeur de la feuille de rédaction ({preferences.maxPageWidth || 820} px)
                      </div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Ajuste les marges latérales de la feuille centrale
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={660}
                        max={1200}
                        step={20}
                        value={preferences.maxPageWidth || 820}
                        onChange={(e) =>
                          onUpdatePreferences({ maxPageWidth: Number(e.target.value) })
                        }
                        className="w-28 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdatePreferences({ maxPageWidth: 820 })}
                        className="px-2 py-0.5 rounded border font-mono text-[11px] hover:bg-black/5 cursor-pointer"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        820px
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t" style={{ borderColor: 'var(--border-color)' }} />

                {/* Underwater Glass & Transparency (Aqua Theme) */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        <span>Thème Transparent &amp; Effet Cristal d&apos;Eau (Aqua)</span>
                        {preferences.theme === 'aqua' && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{
                              backgroundColor:
                                'color-mix(in srgb, var(--primary-color) 16%, transparent)',
                              color: 'var(--primary-color)',
                            }}
                          >
                            Actif
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Effet visuel subaquatique avec transparence, flou de profondeur et réfraction optique
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePreferences({
                          theme: preferences.theme === 'aqua' ? 'github' : 'aqua',
                        })
                      }
                      className="px-3 py-1.5 rounded-lg border font-medium cursor-pointer transition-colors"
                      style={{
                        borderColor:
                          preferences.theme === 'aqua'
                            ? 'var(--primary-color)'
                            : 'var(--border-color)',
                        backgroundColor:
                          preferences.theme === 'aqua'
                            ? 'color-mix(in srgb, var(--primary-color) 15%, transparent)'
                            : 'transparent',
                        color:
                          preferences.theme === 'aqua' ? 'var(--primary-color)' : 'inherit',
                      }}
                    >
                      {preferences.theme === 'aqua'
                        ? 'Désactiver le thème Aqua'
                        : 'Activer le thème Aqua'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div
                      className="p-3 rounded-xl border space-y-1.5"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <div className="flex justify-between font-medium">
                        <span>Opacité de l&apos;eau</span>
                        <span className="font-mono">{preferences.waterOpacity ?? 72}%</span>
                      </div>
                      <input
                        type="range"
                        min={25}
                        max={95}
                        step={1}
                        value={preferences.waterOpacity ?? 72}
                        onChange={(e) =>
                          onUpdatePreferences({
                            theme: 'aqua',
                            waterOpacity: Number(e.target.value),
                          })
                        }
                        className="w-full cursor-pointer"
                      />
                    </div>

                    <div
                      className="p-3 rounded-xl border space-y-1.5"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <div className="flex justify-between font-medium">
                        <span>Flou subaquatique (Blur)</span>
                        <span className="font-mono">{preferences.waterBlurPx ?? 18} px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={44}
                        step={1}
                        value={preferences.waterBlurPx ?? 18}
                        onChange={(e) =>
                          onUpdatePreferences({
                            theme: 'aqua',
                            waterBlurPx: Number(e.target.value),
                          })
                        }
                        className="w-full cursor-pointer"
                      />
                    </div>

                    <div
                      className="p-3 rounded-xl border space-y-1.5"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <div className="flex justify-between font-medium">
                        <span>Ondulation &amp; Réfraction</span>
                        <span className="font-mono">{preferences.waterRefraction ?? 35}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={preferences.waterRefraction ?? 35}
                        onChange={(e) =>
                          onUpdatePreferences({
                            theme: 'aqua',
                            waterRefraction: Number(e.target.value),
                          })
                        }
                        className="w-full cursor-pointer"
                      />
                    </div>

                    <div
                      className="p-3 rounded-xl border space-y-1.5"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <div className="flex justify-between font-medium">
                        <span>Teinte de profondeur</span>
                      </div>
                      <select
                        value={preferences.waterTint || 'lagoon'}
                        onChange={(e) =>
                          onUpdatePreferences({
                            theme: 'aqua',
                            waterTint: e.target.value as WaterTintPreset,
                          })
                        }
                        className="w-full px-2 py-1 rounded border"
                        style={{
                          borderColor: 'var(--border-color)',
                          backgroundColor: 'var(--bg-color)',
                          color: 'var(--text-color)',
                        }}
                      >
                        <option value="lagoon">Lagune Turquoise (Sombre)</option>
                        <option value="abyss">Abysse Océanique (Bleu Nuit)</option>
                        <option value="crystal">Source Cristalline (Clair)</option>
                        <option value="emerald">Émeraude Cénote (Vert d&apos;Eau)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <>
                <div className="space-y-3.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">
                        Typographie intelligente automatique (Smart Typography)
                      </div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Transforme automatiquement <code>--</code> en <code>—</code>,{' '}
                        <code>...</code> en <code>…</code>, <code>-&gt;</code> en <code>→</code> et{' '}
                        <code>&lt;-</code> en <code>←</code> pendant la frappe
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.smartTypography}
                      onChange={(e) =>
                        onUpdatePreferences({ smartTypography: e.target.checked })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">Auto Pair Parenthèses & Guillemets</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Fermeture automatique de (), [], &#123;&#125;, &quot;&quot; et &apos;&apos;
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoPairBrackets}
                      onChange={(e) =>
                        onUpdatePreferences({ autoPairBrackets: e.target.checked })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">Auto Pair Syntaxe Markdown</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Fermeture automatique de *, _, ~, `, $, == et ^
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoPairMarkdown}
                      onChange={(e) =>
                        onUpdatePreferences({ autoPairMarkdown: e.target.checked })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">Barre d&apos;outils flottante permanente</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Affiche la barre glassmorphism en haut de la feuille (sinon uniquement lors d&apos;une sélection)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.showFloatingToolbar}
                      onChange={(e) =>
                        onUpdatePreferences({ showFloatingToolbar: e.target.checked })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">Effet de flou léger en Focus Mode (F8)</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Ajoute un flou optique subtil aux paragraphes inactifs (opacité 25%)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.focusModeBlur}
                      onChange={(e) =>
                        onUpdatePreferences({ focusModeBlur: e.target.checked })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="font-semibold">Auto-numérotation des titres (H1–H6)</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Numérote hiérarchiquement les sections via CSS Counters (1.1, 1.2...)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoNumberHeadings}
                      onChange={(e) =>
                        onUpdatePreferences({ autoNumberHeadings: e.target.checked })
                      }
                    />
                  </label>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <div className="font-semibold">Vitesse de lecture (Mots / minute)</div>
                      <div style={{ color: 'var(--meta-content-color)' }}>
                        Utilisé pour calculer le temps de lecture dans la barre de statut
                      </div>
                    </div>
                    <input
                      type="number"
                      min={60}
                      max={800}
                      value={preferences.readingSpeedWpm}
                      onChange={(e) =>
                        onUpdatePreferences({
                          readingSpeedWpm: Number(e.target.value) || 220,
                        })
                      }
                      className="w-24 px-2.5 py-1 rounded border bg-transparent font-mono"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'math' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Auto-numérotation des équations LaTeX</div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Supporte \label&#123;eq1&#125;, \ref&#123;eq1&#125;, \eqref&#123;eq1&#125; et \tag&#123;1&#125;
                    </div>
                  </div>
                  <select
                    value={preferences.equationNumbering}
                    onChange={(e) =>
                      onUpdatePreferences({
                        equationNumbering: e.target.value as EquationNumberingMode,
                      })
                    }
                    className="px-2.5 py-1.5 rounded border bg-transparent"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: 'var(--bg-color)',
                    }}
                  >
                    <option value="off">Désactivée</option>
                    <option value="ams">Règle AMS (Environnements & labels)</option>
                    <option value="all">Toutes les équations ($$)</option>
                  </select>
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="font-semibold">Règles d&apos;analyse Inline Math compatibles Pandoc</div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Exige l&apos;absence d&apos;espace immédiatement après le $ ouvrant et avant le $ fermant
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.inlineMathPandocRules}
                    onChange={(e) =>
                      onUpdatePreferences({ inlineMathPandocRules: e.target.checked })
                    }
                  />
                </label>

                <div className="my-2 border-t" style={{ borderColor: 'var(--border-color)' }} />

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="font-semibold">Afficher les numéros de lignes dans les blocs de code</div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Active les gouttières numérotées dans chaque instance CodeMirror 6
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.codeBlockLineNumbers}
                    onChange={(e) =>
                      onUpdatePreferences({ codeBlockLineNumbers: e.target.checked })
                    }
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="font-semibold">Retour à la ligne automatique (Code Fences)</div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Empêche le défilement horizontal des longues lignes de code
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.codeBlockWordWrap}
                    onChange={(e) =>
                      onUpdatePreferences({ codeBlockWordWrap: e.target.checked })
                    }
                  />
                </label>
              </div>
            )}

            {activeTab === 'images' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Action lors de l&apos;insertion d&apos;une image</div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Copie locale automatique ou upload Cloud
                    </div>
                  </div>
                  <select
                    value={preferences.imageBehavior}
                    onChange={(e) =>
                      onUpdatePreferences({
                        imageBehavior: e.target.value as CloudUploadProvider,
                      })
                    }
                    className="px-2.5 py-1.5 rounded border"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: 'var(--bg-color)',
                    }}
                  >
                    <option value="local-assets">
                      Copier vers ./assets/$&#123;filename&#125;.assets/
                    </option>
                    <option value="none">Conserver le chemin d&apos;origine</option>
                    <option value="s3">Upload Amazon S3</option>
                    <option value="imgur">Upload Imgur</option>
                    <option value="github">Upload GitHub Repository</option>
                    <option value="custom-webhook">Webhook / Script Personnalisé</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold">
                    Dossier racine de blog statique (Root Folder pour chemins `/images/...`)
                  </div>
                  <input
                    type="text"
                    value={preferences.imageRootFolder}
                    onChange={(e) =>
                      onUpdatePreferences({ imageRootFolder: e.target.value })
                    }
                    placeholder="Ex: C:/Users/Projet/mon-blog-hugo/static"
                    className="w-full px-3 py-1.5 rounded border bg-transparent font-mono"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold">URL du Webhook / Script d&apos;Upload Cloud</div>
                  <input
                    type="text"
                    value={preferences.customWebhookUrl}
                    onChange={(e) =>
                      onUpdatePreferences({ customWebhookUrl: e.target.value })
                    }
                    placeholder="https://api.example.com/upload-image"
                    className="w-full px-3 py-1.5 rounded border bg-transparent font-mono"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'themes' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Thème actif & Éditeur Hot-Reload (`themes/*.css`)</div>
                    <div style={{ color: 'var(--meta-content-color)' }}>
                      Modifiez les variables CSS (`--bg-color`, `--text-color`, `--md-char-color`, `--sequence-theme`) en direct
                    </div>
                  </div>
                  <select
                    value={editingCssThemeId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setEditingCssThemeId(nextId);
                      onUpdatePreferences({ theme: nextId });
                    }}
                    className="px-2.5 py-1.5 rounded border font-medium"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: 'var(--bg-color)',
                    }}
                  >
                    {(Object.keys(BUILTIN_THEMES) as BuiltInThemeId[]).map((id) => (
                      <option key={id} value={id}>
                        {BUILTIN_THEMES[id].name}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={currentThemeCss}
                  onChange={(e) => {
                    const updatedCss = e.target.value;
                    onUpdatePreferences({
                      theme: editingCssThemeId,
                      customThemesCss: {
                        ...preferences.customThemesCss,
                        [editingCssThemeId]: updatedCss,
                      },
                    });
                  }}
                  rows={12}
                  className="w-full p-3 rounded-lg border font-mono text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--code-bg-color)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-color)',
                  }}
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const nextCustom = { ...preferences.customThemesCss };
                      delete nextCustom[editingCssThemeId];
                      onUpdatePreferences({ customThemesCss: nextCustom });
                    }}
                    className="px-3 py-1 rounded border text-xs hover:opacity-80 cursor-pointer"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    Réinitialiser le CSS par défaut du thème
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'export' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl border space-y-2" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Statut de détection Pandoc</span>
                    {pandocStatus?.available ? (
                      <span className="flex items-center gap-1 text-emerald-500 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        {pandocStatus.version}
                      </span>
                    ) : (
                      <span className="opacity-70">
                        Exécutable `pandoc` standard (ou chemin personnalisé ci-dessous)
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={preferences.pandocPath}
                    onChange={(e) =>
                      onUpdatePreferences({ pandocPath: e.target.value })
                    }
                    placeholder="Chemin vers l'exécutable pandoc (ex: C:\Program Files\Pandoc\pandoc.exe)"
                    className="w-full px-3 py-1.5 rounded border bg-transparent font-mono"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold">
                    Dépôt GitHub Officiel pour l&apos;Auto-Update (`GET /repos/&lt;OWNER&gt;/cursiv/releases/latest`)
                  </div>
                  <input
                    type="text"
                    value={preferences.githubUpdateRepo}
                    onChange={(e) =>
                      onUpdatePreferences({ githubUpdateRepo: e.target.value })
                    }
                    placeholder="djael-ml/cursiv"
                    className="w-full px-3 py-1.5 rounded border bg-transparent font-mono"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
