export type BuiltInThemeId = 'github' | 'night' | 'newsprint' | 'pixyll' | 'whitey' | 'gothic';

export type EquationNumberingMode = 'off' | 'ams' | 'all';

export type CloudUploadProvider = 'none' | 'local-assets' | 's3' | 'imgur' | 'github' | 'custom-webhook';

export interface CursivPreferences {
  theme: BuiltInThemeId | string;
  customThemesCss: Record<string, string>;
  accentColor: string;
  caretMotionBlur: boolean;
  caretSmoothSpeed: 'fast' | 'normal' | 'fluid';
  smartTypography: boolean;
  pageZoom: number;
  maxPageWidth: number;
  sidebarWidth: number;
  showFloatingToolbar: boolean;
  focusMode: boolean;
  focusModeBlur: boolean;
  typewriterMode: boolean;
  sourceCodeMode: boolean;
  autoNumberHeadings: boolean;
  equationNumbering: EquationNumberingMode;
  inlineMathPandocRules: boolean;
  codeBlockLineNumbers: boolean;
  codeBlockWordWrap: boolean;
  autoPairBrackets: boolean;
  autoPairMarkdown: boolean;
  readingSpeedWpm: number;
  imageRootFolder: string;
  imageBehavior: CloudUploadProvider;
  customWebhookUrl: string;
  imgurClientId: string;
  githubUploadRepo: string;
  githubUploadToken: string;
  pandocPath: string;
  githubUpdateRepo: string;
  showHiddenFiles: boolean;
  showNonMarkdownFiles: boolean;
}

export type TableAlignment = 'left' | 'center' | 'right';

export type CalloutKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

export interface ListItemNode {
  id: string;
  indent: number;
  text: string;
  checked?: boolean;
}

export type MarkdownBlock =
  | {
      id: string;
      type: 'yaml';
      raw: string;
    }
  | {
      id: string;
      type: 'heading';
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string;
      slug: string;
    }
  | {
      id: string;
      type: 'paragraph';
      text: string;
    }
  | {
      id: string;
      type: 'code';
      language: string;
      code: string;
    }
  | {
      id: string;
      type: 'math';
      latex: string;
    }
  | {
      id: string;
      type: 'table';
      headers: string[];
      alignments: TableAlignment[];
      rows: string[][];
      columnWidths?: number[];
    }
  | {
      id: string;
      type: 'list';
      listType: 'bullet' | 'ordered' | 'task';
      items: ListItemNode[];
    }
  | {
      id: string;
      type: 'blockquote';
      text: string;
    }
  | {
      id: string;
      type: 'callout';
      calloutType: CalloutKind;
      title: string;
      content: string;
    }
  | {
      id: string;
      type: 'image';
      alt: string;
      src: string;
      title?: string;
      zoom?: number;
    }
  | {
      id: string;
      type: 'toc';
    }
  | {
      id: string;
      type: 'hr';
    }
  | {
      id: string;
      type: 'footnote-def';
      label: string;
      content: string;
    };

export interface FileEntryNode {
  name: string;
  path: string;
  is_dir: boolean;
  modified_ms: number;
  size: number;
  excerpt?: string;
  children?: FileEntryNode[];
}

export interface OutlineHeading {
  id: string;
  blockId: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  slug: string;
}

export interface LastExportConfig {
  format: 'pdf' | 'html' | 'html-plain' | 'png' | 'docx' | 'odt' | 'latex' | 'epub' | 'mediawiki' | 'rtf' | 'rst';
  targetPath?: string;
  timestamp: number;
}
