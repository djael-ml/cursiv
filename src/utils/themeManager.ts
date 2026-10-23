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
    description: 'Clean, crisp technical documentation aesthetic',
    isDark: false,
    css: githubCss,
  },
  night: {
    id: 'night',
    name: 'Night',
    description: 'Deep dark mode for focused nocturnal writing',
    isDark: true,
    css: nightCss,
  },
  newsprint: {
    id: 'newsprint',
    name: 'Newsprint',
    description: 'Warm literary editorial paper with Crimson Pro serif',
    isDark: false,
    css: newsprintCss,
  },
  pixyll: {
    id: 'pixyll',
    name: 'Pixyll',
    description: 'Generous whitespace and refined Merriweather + Inter balance',
    isDark: false,
    css: pixyllCss,
  },
  whitey: {
    id: 'whitey',
    name: 'Whitey',
    description: 'Pure minimalist cream-white studio sheet',
    isDark: false,
    css: whiteyCss,
  },
  gothic: {
    id: 'gothic',
    name: 'Gothic',
    description: 'Ultra-clean Swiss modernist sans-serif typography',
    isDark: false,
    css: gothicCss,
  },
};

const THEME_STYLE_ELEMENT_ID = 'cursiv-dynamic-theme-style';

export function applyThemeCss(
  themeId: string,
  customThemesCss: Record<string, string> = {}
): void {
  let styleEl = document.getElementById(THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = THEME_STYLE_ELEMENT_ID;
    document.head.appendChild(styleEl);
  }

  const builtIn = BUILTIN_THEMES[themeId as BuiltInThemeId];
  const cssContent = customThemesCss[themeId] || (builtIn ? builtIn.css : BUILTIN_THEMES.github.css);
  styleEl.textContent = cssContent;
}

export function getActiveSequenceTheme(): 'simple' | 'hand' {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--sequence-theme')
    .trim()
    .toLowerCase();
  return val === 'hand' ? 'hand' : 'simple';
}
