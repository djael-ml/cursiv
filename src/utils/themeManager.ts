import githubCss from '../../themes/github.css?raw';
import nightCss from '../../themes/night.css?raw';
import newsprintCss from '../../themes/newsprint.css?raw';
import pixyllCss from '../../themes/pixyll.css?raw';
import whiteyCss from '../../themes/whitey.css?raw';
import gothicCss from '../../themes/gothic.css?raw';
import aquaCss from '../../themes/aqua.css?raw';
import { BuiltInThemeId, WaterTintPreset } from '../types/editor';

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
  aqua: {
    id: 'aqua',
    name: "Aqua · Cristal d'Eau",
    description: 'Transparence subaquatique, flou de réfraction et reflets caustiques',
    isDark: true,
    css: aquaCss,
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
  { id: '#06b6d4', label: 'Cyan Lagune', color: '#06b6d4' },
  { id: '#16a34a', label: 'Sauge', color: '#16a34a' },
  { id: '#d97706', label: 'Ambre Doux', color: '#d97706' },
  { id: '#e11d48', label: 'Carmin', color: '#e11d48' },
  { id: '#7c3aed', label: 'Améthyste', color: '#7c3aed' },
];

export interface WaterEffectOptions {
  waterOpacity?: number;
  waterBlurPx?: number;
  waterRefraction?: number;
  waterTint?: WaterTintPreset;
}

const WATER_TINT_PALETTES: Record<
  WaterTintPreset,
  {
    rgb: string;
    sidebarRgb: string;
    text: string;
    meta: string;
    mdChar: string;
    primary: string;
    borderRgba: string;
    isLight?: boolean;
  }
> = {
  lagoon: {
    rgb: '12, 34, 54',
    sidebarRgb: '7, 22, 37',
    text: '#ecfeff',
    meta: '#99f6e4',
    mdChar: '#67e8f9',
    primary: '#22d3ee',
    borderRgba: 'rgba(103, 232, 249, 0.25)',
  },
  abyss: {
    rgb: '8, 15, 32',
    sidebarRgb: '5, 10, 23',
    text: '#e0f2fe',
    meta: '#7dd3fc',
    mdChar: '#38bdf8',
    primary: '#38bdf8',
    borderRgba: 'rgba(56, 189, 248, 0.24)',
  },
  crystal: {
    rgb: '232, 248, 255',
    sidebarRgb: '214, 240, 252',
    text: '#083344',
    meta: '#0e7490',
    mdChar: '#0284c7',
    primary: '#0284c7',
    borderRgba: 'rgba(2, 132, 199, 0.24)',
    isLight: true,
  },
  emerald: {
    rgb: '8, 38, 36',
    sidebarRgb: '5, 26, 25',
    text: '#ecfdf5',
    meta: '#6ee7b7',
    mdChar: '#34d399',
    primary: '#10b981',
    borderRgba: 'rgba(52, 211, 153, 0.25)',
  },
};

const THEME_STYLE_ELEMENT_ID = 'cursiv-dynamic-theme-style';

export function applyThemeCss(
  themeId: string,
  customThemesCss: Record<string, string> = {},
  accentColor = '',
  caretSmoothSpeed: 'fast' | 'normal' | 'fluid' = 'normal',
  waterOpts: WaterEffectOptions = {}
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

  const opacity = Math.min(96, Math.max(25, waterOpts.waterOpacity ?? 72)) / 100;
  const sidebarOpacity = Math.min(98, Math.max(20, (waterOpts.waterOpacity ?? 72) - 8)) / 100;
  const blurPx = Math.min(48, Math.max(0, waterOpts.waterBlurPx ?? 18));
  const refraction = Math.min(100, Math.max(0, waterOpts.waterRefraction ?? 35));
  const tintKey: WaterTintPreset = waterOpts.waterTint || 'lagoon';
  const palette = WATER_TINT_PALETTES[tintKey] || WATER_TINT_PALETTES.lagoon;

  const isAqua = themeId === 'aqua';
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('cursiv-theme-aqua', isAqua);
  }

  const aquaDynamicCss = isAqua
    ? `
:root {
  --water-opacity: ${opacity};
  --water-blur: ${blurPx}px;
  --water-refraction: ${refraction};
  --bg-color: rgba(${palette.rgb}, ${opacity}) !important;
  --sidebar-bg-color: rgba(${palette.sidebarRgb}, ${sidebarOpacity}) !important;
  --text-color: ${palette.text} !important;
  --sidebar-text-color: ${palette.text} !important;
  --meta-content-color: ${palette.meta} !important;
  --md-char-color: ${palette.mdChar} !important;
  --primary-color: ${accentColor || palette.primary} !important;
  --border-color: ${palette.borderRgba} !important;
  --code-bg-color: rgba(${palette.sidebarRgb}, ${Math.min(0.88, opacity + 0.08)}) !important;
  --table-alt-bg: rgba(${palette.rgb}, ${Math.max(0.25, opacity - 0.18)}) !important;
  --blockquote-border: ${accentColor || palette.primary} !important;
  --blockquote-text: ${palette.meta} !important;
}
html, body {
  background: transparent !important;
}
`
    : `
:root {
  --water-opacity: 1;
  --water-blur: 0px;
  --water-refraction: 0;
}
`;

  const overrideCss = `
:root {
  --caret-speed: ${speedMs};
  ${
    accentColor
      ? `--primary-color: ${accentColor} !important;\n  --caret-color: ${accentColor} !important;`
      : `--caret-color: var(--primary-color);`
  }
}
${aquaDynamicCss}
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
