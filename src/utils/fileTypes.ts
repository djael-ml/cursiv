export type FileEditorCategory =
  | 'markdown'
  | 'plaintext'
  | 'code'
  | 'csv'
  | 'json'
  | 'html'
  | 'svg'
  | 'image';

export interface FileTypeDescriptor {
  ext: string;
  label: string;
  badge: string;
  category: FileEditorCategory;
  cmLanguage: string;
  supportsRichPreview: boolean;
}

export interface NewFilePreset {
  ext: string;
  label: string;
  defaultStem: string;
  badge: string;
}

export const NEW_FILE_PRESETS: NewFilePreset[] = [
  { ext: '.md', label: 'Note Markdown (.md)', defaultStem: 'Nouveau document', badge: 'MD' },
  { ext: '.txt', label: 'Fichier Texte Brut (.txt)', defaultStem: 'Nouveau texte', badge: 'TXT' },
  { ext: '.json', label: 'Données JSON (.json)', defaultStem: 'config', badge: 'JSON' },
  { ext: '.csv', label: 'Tableau CSV (.csv)', defaultStem: 'donnees', badge: 'CSV' },
  { ext: '.py', label: 'Script Python (.py)', defaultStem: 'script', badge: 'PY' },
  { ext: '.ts', label: 'TypeScript (.ts)', defaultStem: 'module', badge: 'TS' },
  { ext: '.js', label: 'JavaScript (.js)', defaultStem: 'script', badge: 'JS' },
  { ext: '.html', label: 'Page Web HTML (.html)', defaultStem: 'index', badge: 'HTML' },
  { ext: '.css', label: 'Feuille de Style CSS (.css)', defaultStem: 'styles', badge: 'CSS' },
  { ext: '.sql', label: 'Requête SQL (.sql)', defaultStem: 'requete', badge: 'SQL' },
  { ext: '.yaml', label: 'Configuration YAML (.yaml)', defaultStem: 'config', badge: 'YAML' },
  { ext: '.xml', label: 'Document XML (.xml)', defaultStem: 'document', badge: 'XML' },
  { ext: '.rs', label: 'Source Rust (.rs)', defaultStem: 'main', badge: 'RS' },
  { ext: '.cpp', label: 'Source C++ (.cpp)', defaultStem: 'main', badge: 'C++' },
  { ext: '.ps1', label: 'Script PowerShell (.ps1)', defaultStem: 'script', badge: 'PS1' },
  { ext: '.sh', label: 'Script Shell Bash (.sh)', defaultStem: 'script', badge: 'SH' },
  { ext: '.tex', label: 'Document LaTeX (.tex)', defaultStem: 'article', badge: 'TEX' },
  { ext: '.log', label: 'Journal Log (.log)', defaultStem: 'journal', badge: 'LOG' },
  { ext: '.ini', label: 'Fichier INI / Config (.ini)', defaultStem: 'settings', badge: 'INI' },
];

const EXTENSION_MAP: Record<string, Omit<FileTypeDescriptor, 'ext'>> = {
  // Markdown family
  md: { label: 'Markdown', badge: 'MD', category: 'markdown', cmLanguage: 'markdown', supportsRichPreview: true },
  markdown: { label: 'Markdown', badge: 'MD', category: 'markdown', cmLanguage: 'markdown', supportsRichPreview: true },
  mdown: { label: 'Markdown', badge: 'MD', category: 'markdown', cmLanguage: 'markdown', supportsRichPreview: true },
  mkd: { label: 'Markdown', badge: 'MD', category: 'markdown', cmLanguage: 'markdown', supportsRichPreview: true },
  mdx: { label: 'MDX', badge: 'MDX', category: 'markdown', cmLanguage: 'markdown', supportsRichPreview: true },
  rmd: { label: 'R Markdown', badge: 'RMD', category: 'markdown', cmLanguage: 'markdown', supportsRichPreview: true },

  // Plain text & notes
  txt: { label: 'Texte Brut', badge: 'TXT', category: 'plaintext', cmLanguage: 'plaintext', supportsRichPreview: true },
  text: { label: 'Texte Brut', badge: 'TXT', category: 'plaintext', cmLanguage: 'plaintext', supportsRichPreview: true },
  log: { label: 'Fichier Log', badge: 'LOG', category: 'plaintext', cmLanguage: 'plaintext', supportsRichPreview: false },
  nfo: { label: 'Info Texte', badge: 'NFO', category: 'plaintext', cmLanguage: 'plaintext', supportsRichPreview: false },
  todo: { label: 'Liste TODO', badge: 'TODO', category: 'plaintext', cmLanguage: 'markdown', supportsRichPreview: true },
  me: { label: 'ReadMe', badge: 'TXT', category: 'plaintext', cmLanguage: 'plaintext', supportsRichPreview: true },
  rst: { label: 'reStructuredText', badge: 'RST', category: 'plaintext', cmLanguage: 'markdown', supportsRichPreview: false },
  adoc: { label: 'AsciiDoc', badge: 'ADOC', category: 'plaintext', cmLanguage: 'markdown', supportsRichPreview: false },
  org: { label: 'Org Mode', badge: 'ORG', category: 'plaintext', cmLanguage: 'markdown', supportsRichPreview: false },
  wiki: { label: 'MediaWiki', badge: 'WIKI', category: 'plaintext', cmLanguage: 'markdown', supportsRichPreview: false },

  // Tabular Data
  csv: { label: 'Tableau CSV', badge: 'CSV', category: 'csv', cmLanguage: 'plaintext', supportsRichPreview: true },
  tsv: { label: 'Tableau TSV', badge: 'TSV', category: 'csv', cmLanguage: 'plaintext', supportsRichPreview: true },

  // JSON & Config
  json: { label: 'JSON', badge: 'JSON', category: 'json', cmLanguage: 'json', supportsRichPreview: true },
  jsonc: { label: 'JSON avec commentaires', badge: 'JSONC', category: 'json', cmLanguage: 'json', supportsRichPreview: true },
  json5: { label: 'JSON5', badge: 'JSON5', category: 'json', cmLanguage: 'json', supportsRichPreview: true },
  yaml: { label: 'YAML', badge: 'YAML', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  yml: { label: 'YAML', badge: 'YML', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  toml: { label: 'TOML', badge: 'TOML', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  ini: { label: 'Configuration INI', badge: 'INI', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  conf: { label: 'Configuration', badge: 'CONF', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  cfg: { label: 'Configuration', badge: 'CFG', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  env: { label: 'Variables Environnement', badge: 'ENV', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  properties: { label: 'Properties', badge: 'PROP', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  editorconfig: { label: 'EditorConfig', badge: 'CONF', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  gitignore: { label: 'Git Ignore', badge: 'GIT', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },

  // Web & Markup
  html: { label: 'HTML', badge: 'HTML', category: 'html', cmLanguage: 'html', supportsRichPreview: true },
  htm: { label: 'HTML', badge: 'HTM', category: 'html', cmLanguage: 'html', supportsRichPreview: true },
  xhtml: { label: 'XHTML', badge: 'XHTML', category: 'html', cmLanguage: 'xml', supportsRichPreview: true },
  svg: { label: 'Graphique Vectoriel SVG', badge: 'SVG', category: 'svg', cmLanguage: 'xml', supportsRichPreview: true },
  xml: { label: 'XML', badge: 'XML', category: 'code', cmLanguage: 'xml', supportsRichPreview: false },
  plist: { label: 'Property List XML', badge: 'PLIST', category: 'code', cmLanguage: 'xml', supportsRichPreview: false },
  css: { label: 'CSS', badge: 'CSS', category: 'code', cmLanguage: 'css', supportsRichPreview: false },
  scss: { label: 'SCSS', badge: 'SCSS', category: 'code', cmLanguage: 'scss', supportsRichPreview: false },
  sass: { label: 'Sass', badge: 'SASS', category: 'code', cmLanguage: 'css', supportsRichPreview: false },
  less: { label: 'Less', badge: 'LESS', category: 'code', cmLanguage: 'less', supportsRichPreview: false },
  vue: { label: 'Composant Vue', badge: 'VUE', category: 'code', cmLanguage: 'html', supportsRichPreview: false },
  svelte: { label: 'Composant Svelte', badge: 'SVELTE', category: 'code', cmLanguage: 'html', supportsRichPreview: false },
  astro: { label: 'Composant Astro', badge: 'ASTRO', category: 'code', cmLanguage: 'html', supportsRichPreview: false },

  // Programming Languages
  js: { label: 'JavaScript', badge: 'JS', category: 'code', cmLanguage: 'javascript', supportsRichPreview: false },
  mjs: { label: 'JavaScript Module', badge: 'MJS', category: 'code', cmLanguage: 'javascript', supportsRichPreview: false },
  cjs: { label: 'CommonJS', badge: 'CJS', category: 'code', cmLanguage: 'javascript', supportsRichPreview: false },
  jsx: { label: 'React JSX', badge: 'JSX', category: 'code', cmLanguage: 'jsx', supportsRichPreview: false },
  ts: { label: 'TypeScript', badge: 'TS', category: 'code', cmLanguage: 'typescript', supportsRichPreview: false },
  mts: { label: 'TypeScript Module', badge: 'MTS', category: 'code', cmLanguage: 'typescript', supportsRichPreview: false },
  cts: { label: 'TypeScript CommonJS', badge: 'CTS', category: 'code', cmLanguage: 'typescript', supportsRichPreview: false },
  tsx: { label: 'React TSX', badge: 'TSX', category: 'code', cmLanguage: 'tsx', supportsRichPreview: false },
  py: { label: 'Python', badge: 'PY', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  pyw: { label: 'Python', badge: 'PY', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  rs: { label: 'Rust', badge: 'RS', category: 'code', cmLanguage: 'rust', supportsRichPreview: false },
  go: { label: 'Go', badge: 'GO', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  c: { label: 'Langage C', badge: 'C', category: 'code', cmLanguage: 'c', supportsRichPreview: false },
  h: { label: 'Header C/C++', badge: 'H', category: 'code', cmLanguage: 'c', supportsRichPreview: false },
  cpp: { label: 'C++', badge: 'C++', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  cc: { label: 'C++', badge: 'C++', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  cxx: { label: 'C++', badge: 'C++', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  hpp: { label: 'Header C++', badge: 'HPP', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  cs: { label: 'C#', badge: 'C#', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  java: { label: 'Java', badge: 'JAVA', category: 'code', cmLanguage: 'java', supportsRichPreview: false },
  kt: { label: 'Kotlin', badge: 'KT', category: 'code', cmLanguage: 'java', supportsRichPreview: false },
  kts: { label: 'Kotlin Script', badge: 'KTS', category: 'code', cmLanguage: 'java', supportsRichPreview: false },
  scala: { label: 'Scala', badge: 'SCALA', category: 'code', cmLanguage: 'java', supportsRichPreview: false },
  swift: { label: 'Swift', badge: 'SWIFT', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  php: { label: 'PHP', badge: 'PHP', category: 'code', cmLanguage: 'php', supportsRichPreview: false },
  rb: { label: 'Ruby', badge: 'RB', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  lua: { label: 'Lua', badge: 'LUA', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  r: { label: 'R', badge: 'R', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  jl: { label: 'Julia', badge: 'JL', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  sql: { label: 'SQL', badge: 'SQL', category: 'code', cmLanguage: 'sql', supportsRichPreview: false },
  sh: { label: 'Shell Bash', badge: 'SH', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  bash: { label: 'Bash', badge: 'BASH', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  zsh: { label: 'Zsh', badge: 'ZSH', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  ps1: { label: 'PowerShell', badge: 'PS1', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  psm1: { label: 'Module PowerShell', badge: 'PSM1', category: 'code', cmLanguage: 'python', supportsRichPreview: false },
  bat: { label: 'Script Batch', badge: 'BAT', category: 'code', cmLanguage: 'plaintext', supportsRichPreview: false },
  cmd: { label: 'Script CMD', badge: 'CMD', category: 'code', cmLanguage: 'plaintext', supportsRichPreview: false },
  dockerfile: { label: 'Dockerfile', badge: 'DOCKER', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  makefile: { label: 'Makefile', badge: 'MAKE', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  tex: { label: 'LaTeX', badge: 'TEX', category: 'code', cmLanguage: 'markdown', supportsRichPreview: false },
  latex: { label: 'LaTeX', badge: 'TEX', category: 'code', cmLanguage: 'markdown', supportsRichPreview: false },
  bib: { label: 'BibTeX', badge: 'BIB', category: 'code', cmLanguage: 'yaml', supportsRichPreview: false },
  diff: { label: 'Patch / Diff', badge: 'DIFF', category: 'code', cmLanguage: 'plaintext', supportsRichPreview: false },
  patch: { label: 'Patch', badge: 'PATCH', category: 'code', cmLanguage: 'plaintext', supportsRichPreview: false },
  graphql: { label: 'GraphQL', badge: 'GQL', category: 'code', cmLanguage: 'javascript', supportsRichPreview: false },
  gql: { label: 'GraphQL', badge: 'GQL', category: 'code', cmLanguage: 'javascript', supportsRichPreview: false },
  proto: { label: 'Protocol Buffers', badge: 'PROTO', category: 'code', cmLanguage: 'cpp', supportsRichPreview: false },
  dart: { label: 'Dart', badge: 'DART', category: 'code', cmLanguage: 'java', supportsRichPreview: false },
  zig: { label: 'Zig', badge: 'ZIG', category: 'code', cmLanguage: 'rust', supportsRichPreview: false },

  // Images
  png: { label: 'Image PNG', badge: 'PNG', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  jpg: { label: 'Image JPEG', badge: 'JPG', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  jpeg: { label: 'Image JPEG', badge: 'JPEG', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  gif: { label: 'Image GIF', badge: 'GIF', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  webp: { label: 'Image WebP', badge: 'WEBP', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  bmp: { label: 'Image Bitmap', badge: 'BMP', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  ico: { label: 'Icône ICO', badge: 'ICO', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
  avif: { label: 'Image AVIF', badge: 'AVIF', category: 'image', cmLanguage: 'plaintext', supportsRichPreview: true },
};

export function describeFilePath(filePath: string): FileTypeDescriptor {
  const fileName = (filePath.split(/[/\\]/).pop() || filePath).trim();
  const lowerName = fileName.toLowerCase();

  if (lowerName === 'dockerfile') {
    return { ext: 'dockerfile', ...EXTENSION_MAP.dockerfile };
  }
  if (lowerName === 'makefile') {
    return { ext: 'makefile', ...EXTENSION_MAP.makefile };
  }

  const lastDot = lowerName.lastIndexOf('.');
  const ext = lastDot !== -1 ? lowerName.slice(lastDot + 1) : '';
  const match = EXTENSION_MAP[ext];
  if (match) {
    return { ext, ...match };
  }

  return {
    ext: ext || 'txt',
    label: ext ? `Fichier .${ext.toUpperCase()}` : 'Fichier Texte',
    badge: ext ? ext.slice(0, 5).toUpperCase() : 'TXT',
    category: 'plaintext',
    cmLanguage: 'plaintext',
    supportsRichPreview: true,
  };
}

export function isMarkdownFilePath(filePath: string): boolean {
  return describeFilePath(filePath).category === 'markdown';
}

export function isImageFilePath(filePath: string): boolean {
  return describeFilePath(filePath).category === 'image';
}

export function getStarterContentForPath(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || 'Nouveau fichier';
  const desc = describeFilePath(filePath);
  const stem = fileName.replace(/\.[^.]+$/, '');

  switch (desc.ext) {
    case 'md':
    case 'markdown':
    case 'mdown':
    case 'mkd':
    case 'mdx':
      return `# ${stem}\n\n`;
    case 'json':
    case 'jsonc':
      return `{\n  "name": "${stem}",\n  "version": "1.0.0"\n}\n`;
    case 'csv':
      return `Colonne 1,Colonne 2,Colonne 3\nValeur 1,Valeur 2,Valeur 3\n`;
    case 'tsv':
      return `Colonne 1\tColonne 2\tColonne 3\nValeur 1\tValeur 2\tValeur 3\n`;
    case 'html':
    case 'htm':
      return `<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8" />\n  <title>${stem}</title>\n</head>\n<body>\n  <h1>${stem}</h1>\n</body>\n</html>\n`;
    case 'css':
    case 'scss':
      return `/* ${fileName} */\n:root {\n  --accent: #2563eb;\n}\n`;
    case 'py':
      return `#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n\ndef main():\n    print("${stem}")\n\nif __name__ == "__main__":\n    main()\n`;
    case 'rs':
      return `fn main() {\n    println!("${stem}");\n}\n`;
    case 'js':
    case 'ts':
      return `// ${fileName}\n\nexport function main() {\n  console.log("${stem}");\n}\n`;
    case 'sql':
      return `-- ${fileName}\nSELECT *\nFROM table_name\nLIMIT 50;\n`;
    case 'yaml':
    case 'yml':
      return `# ${fileName}\nname: ${stem}\nversion: 1.0\n`;
    case 'xml':
      return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <item name="${stem}" />\n</root>\n`;
    case 'sh':
    case 'bash':
      return `#!/usr/bin/env bash\nset -euo pipefail\n\necho "${stem}"\n`;
    case 'ps1':
      return `# ${fileName}\nWrite-Host "${stem}"\n`;
    case 'tex':
    case 'latex':
      return `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\title{${stem}}\n\\begin{document}\n\\maketitle\n\n\\end{document}\n`;
    default:
      return '';
  }
}
