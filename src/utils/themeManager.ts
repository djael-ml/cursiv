import githubCss from '../../themes/github.css?raw';
import nightCss from '../../themes/night.css?raw';
import newsprintCss from '../../themes/newsprint.css?raw';
import pixyllCss from '../../themes/pixyll.css?raw';
import whiteyCss from '../../themes/whitey.css?raw';
import gothicCss from '../../themes/gothic.css?raw';
import { BuiltInThemeId } from '../types/editor';

export interface ThemeMeta {
  id: BuiltInThemeId | string;
  name: string;
  description: string;
  isDark: boolean;
  css: string;
}

export const BUILTIN_THEMES: Record<BuiltInThemeId, ThemeMeta> = {
  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Esthétique claire et structurée',
    isDark: false,
    css: githubCss,
  },
  night: {
    id: 'night',
    name: 'Night',
    description: 'Mode sombre profond pour la rédaction nocturne',
    isDark: true,
    css: nightCss,
  },
  newsprint: {
    id: 'newsprint',
    name: 'Newsprint',
    description: 'Papier éditorial chaleureux avec police serif Crimson Pro',
    isDark: false,
    css: newsprintCss,
  },
  pixyll: {
    id: 'pixyll',
    name: 'Pixyll',
    description: 'Espaces généreux et équilibre Merriweather + Inter',
    isDark: false,
    css: pixyllCss,
  },
  whitey: {
    id: 'whitey',
    name: 'Whitey',
    description: 'Feuille studio blanc crème minimaliste',
    isDark: false,
    css: whiteyCss,
  },
  gothic: {
    id: 'gothic',
    name: 'Gothic',
    description: 'Typographie sans-serif moderniste suisse',
    isDark: false,
    css: gothicCss,
  },
};

export const DISCREET_ACCENT_PRESETS: Array<{ id: string; label: string; color: string }> = [
  { id: '', label: 'Thème par défaut', color: '' },
  { id: '#334155', label: 'Ardoise (Discret)', color: '#334155' },
  { id: '#2563eb', label: 'Bleu Acier', color: '#2563eb' },
  { id: '#4f46e5', label: 'Indigo Subtil', color: '#4f46e5' },
  { id: '#0d9488', label: 'Sarcelle', color: '#0d9488' },
  { id: '#16a34a', label: 'Sauge', color: '#16a34a' },
  { id: '#d97706', label: 'Ambre Doux', color: '#d97706' },
  { id: '#e11d48', label: 'Carmin', color: '#e11d48' },
  { id: '#7c3aed', label: 'Améthyste', color: '#7c3aed' },
];

const THEME_STYLE_ELEMENT_ID = 'cursiv-dynamic-theme-style';

export function applyThemeCss(
  themeId: string,
  customThemesCss: Record<string, string> = {},
  accentColor = '',
  caretSmoothSpeed: 'fast' | 'normal' | 'fluid' = 'normal'
): void {
  let styleEl = document.getElementById(THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = THEME_STYLE_ELEMENT_ID;
    document.head.appendChild(styleEl);
  }

  const builtIn = BUILTIN_THEMES[themeId as BuiltInThemeId];
  const baseCss = customThemesCss[themeId] || (builtIn ? builtIn.css : BUILTIN_THEMES.github.css);

  const speedMs =
    caretSmoothSpeed === 'fast' ? '42ms' : caretSmoothSpeed === 'fluid' ? '95ms' : '68ms';

  const overrideCss = `
:root {
  --caret-speed: ${speedMs};
  ${
    accentColor
      ? `--primary-color: ${accentColor} !important;\n  --caret-color: ${accentColor} !important;`
      : `--caret-color: var(--primary-color);`
  }
}
`;

  styleEl.textContent = `${baseCss}\n${overrideCss}`;
}

export function getActiveSequenceTheme(): 'simple' | 'hand' {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--sequence-theme')
    .trim()
    .toLowerCase();
  return val === 'hand' ? 'hand' : 'simple';
}
