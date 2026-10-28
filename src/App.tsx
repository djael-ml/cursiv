import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  CursivPreferences,
  FileEntryNode,
  LastExportConfig,
  MarkdownBlock,
  OutlineHeading,
} from './types/editor';
import {
  extractOutlineHeadings,
  nextBlockId,
  parseMarkdownToBlocks,
  serializeBlocksToMarkdown,
  slugifyHeading,
} from './utils/markdownParser';
import { applyThemeCss, BUILTIN_THEMES } from './utils/themeManager';
import {
  checkGitHubUpdates,
  createFileOrDir,
  DEFAULT_WELCOME_MARKDOWN,
  deleteFilePath,
  duplicateFilePath,
  isTauriEnvironment,
  listWorkspaceFiles,
  openLogDirectory,
  readBinaryDataUrl,
  readTextFile,
  renameFilePath,
  runPandocImport,
  subscribeDirectoryWatch,
  UpdateCheckResult,
  writeAppLog,
  writeTextFile,
} from './utils/tauriBridge';
import {
  describeFilePath,
  getStarterContentForPath,
  isImageFilePath,
  isMarkdownFilePath,
} from './utils/fileTypes';
import {
  executeDocumentExport,
  getLastExportConfig,
} from './utils/exportEngine';
import { Titlebar } from './components/Titlebar';
import { Sidebar, SidebarTab } from './components/Sidebar';
import { WysiwymEditor } from './components/Editor/WysiwymEditor';
import { SourceCodeEditor } from './components/Editor/SourceCodeEditor';
import { StatusBar } from './components/StatusBar';
import { PreferencesModal } from './components/PreferencesModal';
import { UpdateToast } from './components/UpdateToast';
import { FindMatch, FindReplaceBar } from './components/FindReplaceBar';
import { PaletteCommand, QuickSwitcher } from './components/QuickSwitcher';
import { replaceAllInBlocks, replaceOccurrenceInBlocks } from './utils/findReplace';

const HISTORY_LIMIT = 250;
const HISTORY_COALESCE_MS = 600;

const PREFERENCES_STORAGE_KEY = 'cursiv_preferences_v1_17';
const LEGACY_PREFERENCES_STORAGE_KEY = 'cursiv_preferences_v1_14';
const SESSION_STORAGE_KEY = 'cursiv_session_state_v1';

const DEFAULT_PREFERENCES: CursivPreferences = {
  theme: 'github',
  customThemesCss: {},
  accentColor: '',
  caretMotionBlur: true,
  caretSmoothSpeed: 'normal',
  smartTypography: true,
  pageZoom: 100,
  maxPageWidth: 820,
  sidebarWidth: 0,
  showFloatingToolbar: false,
  focusMode: false,
  focusModeBlur: true,
  typewriterMode: false,
  sourceCodeMode: false,
  autoNumberHeadings: false,
  equationNumbering: 'ams',
  inlineMathPandocRules: true,
  codeBlockLineNumbers: true,
  codeBlockWordWrap: true,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  readingSpeedWpm: 225,
  imageRootFolder: '',
  imageBehavior: 'local-assets',
  customWebhookUrl: '',
  imgurClientId: '',
  githubUploadRepo: '',
  githubUploadToken: '',
  pandocPath: '',
  githubUpdateRepo: 'djael-ml/cursiv',
  showHiddenFiles: false,
  showNonMarkdownFiles: true,
  waterOpacity: 72,
  waterBlurPx: 18,
  waterRefraction: 35,
  waterTint: 'lagoon',
};

function loadInitialPreferences(): CursivPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    }
    const legacy = localStorage.getItem(LEGACY_PREFERENCES_STORAGE_KEY);
    if (legacy) {
      const migrated = {
        ...DEFAULT_PREFERENCES,
        ...JSON.parse(legacy),
        showNonMarkdownFiles: true,
      };
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFERENCES;
}

interface PersistedSessionState {
  workspaceRoot: string;
  currentFilePath: string;
  rawText: string;
  activeBlockId: string | null;
  cursorOffset: number;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  scrollTop: number;
  timestamp: number;
}

function loadSavedSession(): PersistedSessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionState;
    if (parsed && typeof parsed.currentFilePath === 'string') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

interface HistorySnapshot {
  blocks: MarkdownBlock[];
  rawText: string;
  activeBlockId: string | null;
  cursorOffset: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class EditorErrorBoundary extends React.Component<
  { onRecover: () => void; children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { onRecover: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erreur inattendue de rendu',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    writeAppLog('CRASH', 'ui::EditorErrorBoundary', `${error?.message || 'Error'} | ${error?.stack || ''} | ${info?.componentStack || ''}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-12 rounded-2xl border shadow-lg space-y-4 text-sm">
          <div className="font-semibold text-base text-red-500">
            Récupération automatique de l&apos;éditeur
          </div>
          <p className="opacity-80 text-xs font-mono break-all">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, errorMessage: '' });
              this.props.onRecover();
            }}
            className="px-4 py-2 rounded-lg font-medium text-xs text-white cursor-pointer"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            Restaurer la session d&apos;édition
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const initialSession = useMemo(() => loadSavedSession(), []);

  const [preferences, setPreferences] = useState<CursivPreferences>(loadInitialPreferences);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(
    () => initialSession?.workspaceRoot || '/Workspace'
  );
  const [files, setFiles] = useState<FileEntryNode[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string>(
    () => initialSession?.currentFilePath || '/Workspace/Bienvenue sur Cursiv.md'
  );
  const [rawText, setRawText] = useState<string>(
    () => initialSession?.rawText ?? DEFAULT_WELCOME_MARKDOWN
  );
  const [blocks, setBlocks] = useState<MarkdownBlock[]>(() =>
    parseMarkdownToBlocks(initialSession?.rawText ?? DEFAULT_WELCOME_MARKDOWN)
  );
  const [activeBlockId, setActiveBlockId] = useState<string | null>(
    () => initialSession?.activeBlockId ?? null
  );
  const [liveCursorOffset, setLiveCursorOffset] = useState<number>(
    () => initialSession?.cursorOffset ?? 0
  );
  const [externalCaretOffset, setExternalCaretOffset] = useState<number | null>(
    () => initialSession?.cursorOffset ?? null
  );
  const [externalCaretVersion, setExternalCaretVersion] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [txtRichMode, setTxtRichMode] = useState<boolean>(false);

  // Image file viewer state
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imageZoom, setImageZoom] = useState<number>(100);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => initialSession?.sidebarOpen ?? window.innerWidth >= 900
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(
    () => initialSession?.sidebarTab || 'files'
  );
  const [autoRenameFilePath, setAutoRenameFilePath] = useState<string | null>(null);
  const [activeHeadingSlug, setActiveHeadingSlug] = useState<string>('');
  const [preferencesModalOpen, setPreferencesModalOpen] = useState<boolean>(false);

  // Source Code Mode cursor & scroll synchronization state
  const [sourceCursorOffset, setSourceCursorOffset] = useState<number>(
    () => initialSession?.cursorOffset ?? 0
  );
  const [sourceScrollRatio, setSourceScrollRatio] = useState<number>(0);

  // Export & Auto-Update notifications
  const [lastExportConfig, setLastExportConfig] = useState<LastExportConfig | null>(
    getLastExportConfig
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [manualUpdateCheck, setManualUpdateCheck] = useState<boolean>(false);

  // Find & Replace (Ctrl+F / Ctrl+H) and Quick Switcher / Command Palette (Ctrl+E / Ctrl+Shift+P)
  const [findOpen, setFindOpen] = useState<boolean>(false);
  const [findReplaceMode, setFindReplaceMode] = useState<boolean>(false);
  const [findFocusSignal, setFindFocusSignal] = useState<number>(0);
  const [switcherOpen, setSwitcherOpen] = useState<boolean>(false);
  const [switcherInitialQuery, setSwitcherInitialQuery] = useState<string>('');

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  const currentFileMeta = useMemo(() => describeFilePath(currentFilePath), [currentFilePath]);
  const isCurrentMarkdown = isMarkdownFilePath(currentFilePath);
  const isCurrentImage = isImageFilePath(currentFilePath);
  const isUsingBlockEditor =
    !isCurrentImage &&
    !preferences.sourceCodeMode &&
    (isCurrentMarkdown || (currentFileMeta.category === 'plaintext' && txtRichMode));

  // Document-wide Undo / Redo history with cursor & block restoration
  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({
    past: [],
    future: [],
  });
  const currentSnapshotRef = useRef<HistorySnapshot>({
    blocks,
    rawText,
    activeBlockId,
    cursorOffset: liveCursorOffset,
  });
  const skipHistoryRef = useRef<boolean>(false);
  const lastHistoryPushRef = useRef<number>(0);

  const resetHistory = useCallback(
    (initBlocks: MarkdownBlock[], initRaw: string, initBlockId: string | null = null) => {
      historyRef.current = { past: [], future: [] };
      currentSnapshotRef.current = {
        blocks: initBlocks,
        rawText: initRaw,
        activeBlockId: initBlockId,
        cursorOffset: 0,
      };
      skipHistoryRef.current = true;
      lastHistoryPushRef.current = Date.now();
    },
    []
  );

  // Keep currentSnapshotRef cursor updated when user moves caret without editing text
  useEffect(() => {
    currentSnapshotRef.current.activeBlockId = activeBlockId;
    currentSnapshotRef.current.cursorOffset = liveCursorOffset;
  }, [activeBlockId, liveCursorOffset]);

  // Record Undo checkpoints intelligently (on structural change, block switch, word boundary, or 600ms elapsed)
  useEffect(() => {
    const prev = currentSnapshotRef.current;
    if (prev.blocks === blocks && prev.rawText === rawText) return;

    const nextSnap: HistorySnapshot = {
      blocks,
      rawText,
      activeBlockId,
      cursorOffset: liveCursorOffset,
    };

    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      currentSnapshotRef.current = nextSnap;
      return;
    }

    const now = Date.now();
    const elapsed = now - lastHistoryPushRef.current;
    const structural =
      prev.blocks.length !== blocks.length || prev.activeBlockId !== activeBlockId;

    // Detect if the user just typed a word boundary character (space, punctuation, newline, tab)
    let wordBoundary = false;
    if (activeBlockId) {
      const prevBlock = prev.blocks.find((b) => b.id === activeBlockId);
      const currBlock = blocks.find((b) => b.id === activeBlockId);
      if (
        prevBlock &&
        currBlock &&
        'text' in prevBlock &&
        'text' in currBlock &&
        Math.abs(currBlock.text.length - prevBlock.text.length) >= 1
      ) {
        const diffLen = Math.abs(currBlock.text.length - prevBlock.text.length);
        const lastChar = currBlock.text[Math.max(0, liveCursorOffset - 1)] || '';
        if (diffLen > 2 || /[\s.,;!?()[\]{}"'\t-]/.test(lastChar)) {
          wordBoundary = elapsed > 140;
        }
      }
    }

    const h = historyRef.current;
    if (h.past.length === 0 || structural || wordBoundary || elapsed >= HISTORY_COALESCE_MS) {
      h.past.push(prev);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      lastHistoryPushRef.current = now;
    }
    h.future = [];
    currentSnapshotRef.current = nextSnap;
  }, [blocks, rawText, activeBlockId, liveCursorOffset]);

  const updatePreferences = useCallback((patch: Partial<CursivPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Apply dynamic CSS theme, discreet accent color, smooth caret speed & Aqua water effect
  useEffect(() => {
    applyThemeCss(
      preferences.theme,
      preferences.customThemesCss,
      preferences.accentColor,
      preferences.caretSmoothSpeed,
      {
        waterOpacity: preferences.waterOpacity,
        waterBlurPx: preferences.waterBlurPx,
        waterRefraction: preferences.waterRefraction,
        waterTint: preferences.waterTint,
      }
    );
  }, [
    preferences.theme,
    preferences.customThemesCss,
    preferences.accentColor,
    preferences.caretSmoothSpeed,
    preferences.waterOpacity,
    preferences.waterBlurPx,
    preferences.waterRefraction,
    preferences.waterTint,
  ]);

  // Persist session state continuously & on beforeunload so previous session is ALWAYS restored
  const saveSessionToStorage = useCallback(() => {
    try {
      const state: PersistedSessionState = {
        workspaceRoot,
        currentFilePath,
        rawText,
        activeBlockId,
        cursorOffset: liveCursorOffset,
        sidebarOpen,
        sidebarTab,
        scrollTop: scrollContainerRef.current?.scrollTop ?? 0,
        timestamp: Date.now(),
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [
    workspaceRoot,
    currentFilePath,
    rawText,
    activeBlockId,
    liveCursorOffset,
    sidebarOpen,
    sidebarTab,
  ]);

  useEffect(() => {
    saveSessionToStorage();
  }, [saveSessionToStorage]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSessionToStorage();
      writeAppLog('INFO', 'ui::session', `Fermeture / sauvegarde session sur ${currentFilePath}`);
      if (isDirty && !isImageFilePath(currentFilePath)) {
        writeTextFile(currentFilePath, rawText).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveSessionToStorage, isDirty, currentFilePath, rawText]);

  useEffect(() => {
    writeAppLog('INFO', 'ui::startup', `Session UI active: ${currentFilePath} (th?me=${preferences.theme})`);
    const onErr = (e: ErrorEvent) => writeAppLog('ERROR', 'ui::window.onerror', `${e.message} (${e.filename}:${e.lineno})`);
    const onRej = (e: PromiseRejectionEvent) => writeAppLog('ERROR', 'ui::unhandledrejection', String(e.reason));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl + Mouse Wheel Page Scale (scales only the document sheet, never the window or sidebar)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        setPreferences((prev) => {
          const current = prev.pageZoom || 100;
          const nextZoom = Math.max(50, Math.min(200, current + delta));
          const next = { ...prev, pageZoom: nextZoom };
          try {
            localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  const refreshWorkspaceFiles = useCallback(async () => {
    try {
      const list = await listWorkspaceFiles(
        workspaceRoot,
        preferences.showHiddenFiles,
        preferences.showNonMarkdownFiles
      );
      setFiles(list);
    } catch {
      // ignore
    }
  }, [workspaceRoot, preferences.showHiddenFiles, preferences.showNonMarkdownFiles]);

  useEffect(() => {
    refreshWorkspaceFiles();
  }, [refreshWorkspaceFiles]);

  // Real-time `notify` directory watcher subscription
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    subscribeDirectoryWatch(workspaceRoot, 'workspace-changed', () => {
      refreshWorkspaceFiles();
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      cleanup?.();
    };
  }, [workspaceRoot, refreshWorkspaceFiles]);

  // Startup GitHub Auto-Update check
  useEffect(() => {
    checkGitHubUpdates(preferences.githubUpdateRepo).then((res) => {
      setUpdateInfo(res);
    });
  }, [preferences.githubUpdateRepo]);

  // Load selected file (Markdown, Plaintext, Code, CSV, JSON, HTML, SVG, or Image)
  const handleSelectFile = useCallback(
    async (path: string, preserveSessionCursor = false) => {
      try {
        // Flush pending autosave for the previous file before switching
        if (autosaveTimerRef.current) {
          window.clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
          if (isDirty && !isImageFilePath(currentFilePath)) {
            await writeTextFile(currentFilePath, rawText).catch(() => {});
          }
        }

        if (isImageFilePath(path)) {
          const dataUrl = await readBinaryDataUrl(path);
          setCurrentFilePath(path);
          setImageDataUrl(dataUrl);
          setImageZoom(100);
          setImageDimensions(null);
          setIsDirty(false);
          return;
        }

        const content = await readTextFile(path);
        const isMd = isMarkdownFilePath(path);
        const parsed = isMd ? parseMarkdownToBlocks(content) : [];
        resetHistory(parsed, content, preserveSessionCursor ? activeBlockId : parsed[0]?.id || null);
        setCurrentFilePath(path);
        setRawText(content);
        if (isMd) {
          setBlocks(parsed);
          if (!preserveSessionCursor) {
            setActiveBlockId(parsed[0]?.id || null);
            setLiveCursorOffset(0);
          }
        } else {
          setBlocks([]);
          setActiveBlockId(null);
          setSourceCursorOffset(0);
          setSourceScrollRatio(0);
        }
        setIsDirty(false);
      } catch (err) {
        setStatusBanner(`Erreur lecture : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [resetHistory, isDirty, currentFilePath, rawText, activeBlockId]
  );

  // Restore previous session file & scroll position on startup
  useEffect(() => {
    const targetPath = initialSession?.currentFilePath || currentFilePath;
    if (isImageFilePath(targetPath)) {
      readBinaryDataUrl(targetPath)
        .then((url) => {
          setImageDataUrl(url);
        })
        .catch(() => {});
      return;
    }

    readTextFile(targetPath)
      .then((diskContent) => {
        // Prefer disk content if non-empty, or fallback to saved session rawText
        const effectiveText =
          diskContent && diskContent.length > 0
            ? diskContent
            : initialSession?.rawText || DEFAULT_WELCOME_MARKDOWN;
        setRawText(effectiveText);
        if (isMarkdownFilePath(targetPath)) {
          const parsed = parseMarkdownToBlocks(effectiveText);
          const restoredBlockId =
            initialSession?.activeBlockId &&
            parsed.some((b) => b.id === initialSession.activeBlockId)
              ? initialSession.activeBlockId
              : parsed[0]?.id || null;
          resetHistory(parsed, effectiveText, restoredBlockId);
          setBlocks(parsed);
          setActiveBlockId(restoredBlockId);
          if (typeof initialSession?.cursorOffset === 'number') {
            setLiveCursorOffset(initialSession.cursorOffset);
            setExternalCaretOffset(initialSession.cursorOffset);
            setExternalCaretVersion((v) => v + 1);
          }
        } else {
          resetHistory([], effectiveText, null);
        }
        if (initialSession?.scrollTop) {
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = initialSession.scrollTop;
            }
          });
        }
      })
      .catch(() => {
        // Keep session state already loaded in memory
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenWikiLinkOrFile = useCallback(
    (target: string) => {
      const cleanTarget = target.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
      const targetLower = cleanTarget.toLowerCase();
      const targetWithExt = targetLower.includes('.') ? targetLower : `${targetLower}.md`;

      const findPath = (nodes: FileEntryNode[]): string | null => {
        for (const node of nodes) {
          if (!node.is_dir) {
            const nodeName = node.name.toLowerCase();
            const nodePath = node.path.toLowerCase().replace(/\\/g, '/');
            const cleanPath = targetLower.replace(/\\/g, '/');
            if (
              nodeName === targetLower ||
              nodeName === targetWithExt ||
              nodePath === cleanPath ||
              nodePath.endsWith('/' + targetWithExt)
            ) {
              return node.path;
            }
          }
          if (node.children) {
            const found = findPath(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const match = findPath(files);
      if (match) {
        handleSelectFile(match);
      } else {
        setStatusBanner(`Fichier introuvable : "${cleanTarget}"`);
      }
    },
    [files, handleSelectFile]
  );

  const outlineHeadings = useMemo(
    () => (isUsingBlockEditor ? extractOutlineHeadings(blocks) : []),
    [isUsingBlockEditor, blocks]
  );

  // Immediate save (`Ctrl+S` or manual save)
  const handleSaveCurrentFile = useCallback(async () => {
    if (isCurrentImage) return;
    try {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const textToWrite = isUsingBlockEditor ? serializeBlocksToMarkdown(blocks) : rawText;
      await writeTextFile(currentFilePath, textToWrite);
      setRawText(textToWrite);
      setIsDirty(false);
      saveSessionToStorage();
      refreshWorkspaceFiles();
      setStatusBanner(`Enregistré : ${currentFilePath.split('/').pop()}`);
      setTimeout(() => setStatusBanner(null), 2000);
    } catch (err) {
      setStatusBanner(`Erreur sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [
    isCurrentImage,
    isUsingBlockEditor,
    blocks,
    rawText,
    currentFilePath,
    saveSessionToStorage,
    refreshWorkspaceFiles,
  ]);

  // Debounced autosave (500ms) for both Markdown blocks and raw text/code files
  const scheduleAutosaveText = useCallback((filePath: string, nextText: string) => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        await writeTextFile(filePath, nextText);
        setIsDirty(false);
      } catch {
        // ignore background autosave error
      }
    }, 500);
  }, []);

  const updateBlocksAndSync = useCallback(
    (nextBlocks: MarkdownBlock[]) => {
      const serialized = serializeBlocksToMarkdown(nextBlocks);
      setBlocks(nextBlocks);
      setRawText(serialized);
      setIsDirty(true);
      scheduleAutosaveText(currentFilePath, serialized);
    },
    [currentFilePath, scheduleAutosaveText]
  );

  // Toggle Source Code Mode (`Ctrl+/`) while preserving exact scroll & cursor offset
  const handleToggleSourceMode = useCallback(() => {
    if (!isCurrentMarkdown) {
      if (currentFileMeta.category === 'plaintext') {
        setTxtRichMode((prev) => {
          const nextRich = !prev;
          if (nextRich) {
            setBlocks(parseMarkdownToBlocks(rawText));
          } else {
            setRawText(serializeBlocksToMarkdown(blocks));
          }
          return nextRich;
        });
      }
      return;
    }

    if (!preferences.sourceCodeMode) {
      const scroller = scrollContainerRef.current;
      if (scroller) {
        const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        setSourceScrollRatio(scroller.scrollTop / maxScroll);
      }
      if (activeBlockId) {
        const idx = blocks.findIndex((b) => b.id === activeBlockId);
        if (idx > 0) {
          const priorMarkdown = serializeBlocksToMarkdown(blocks.slice(0, idx));
          setSourceCursorOffset(priorMarkdown.length + liveCursorOffset);
        } else {
          setSourceCursorOffset(liveCursorOffset);
        }
      }
      updatePreferences({ sourceCodeMode: true });
    } else {
      setBlocks(parseMarkdownToBlocks(rawText));
      updatePreferences({ sourceCodeMode: false });
      requestAnimationFrame(() => {
        const scroller = scrollContainerRef.current;
        if (scroller) {
          const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          scroller.scrollTop = sourceScrollRatio * maxScroll;
        }
      });
    }
  }, [
    isCurrentMarkdown,
    currentFileMeta.category,
    preferences.sourceCodeMode,
    activeBlockId,
    blocks,
    liveCursorOffset,
    rawText,
    sourceScrollRatio,
    updatePreferences,
  ]);

  const handleCreateNewFile = useCallback(
    async (ext = '.md') => {
      const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
      const baseStem =
        cleanExt === '.md'
          ? 'Nouveau document'
          : cleanExt === '.txt'
          ? 'Nouvelle note'
          : 'Nouveau fichier';
      const existingNames = new Set(files.map((f) => f.name.toLowerCase()));
      let candidate = `${baseStem}${cleanExt}`;
      let counter = 2;
      while (existingNames.has(candidate.toLowerCase())) {
        candidate = `${baseStem} ${counter}${cleanExt}`;
        counter++;
      }
      const newPath = `${workspaceRoot.replace(/\/$/, '')}/${candidate}`;
      try {
        await createFileOrDir(newPath, false);
        await refreshWorkspaceFiles();
        await handleSelectFile(newPath);
        setSidebarOpen(true);
        setSidebarTab('files');
        setAutoRenameFilePath(newPath);
      } catch (err) {
        setStatusBanner(`Erreur création : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [files, workspaceRoot, refreshWorkspaceFiles, handleSelectFile]
  );

  const handleRenameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const oldName = oldPath.split('/').pop() || '';
      const oldDotIdx = oldName.lastIndexOf('.');
      const oldExt = oldDotIdx > 0 ? oldName.slice(oldDotIdx) : '.md';

      // Preserve user's explicit extension if they typed one (e.g. notes.txt, script.py, .env)
      const hasExplicitExtension =
        trimmed.startsWith('.') || /\.[a-z0-9_-]{1,12}$/i.test(trimmed);
      const finalName = hasExplicitExtension ? trimmed : `${trimmed}${oldExt}`;

      const parent = oldPath.slice(0, oldPath.lastIndexOf('/'));
      const newPath = `${parent}/${finalName}`;
      if (newPath === oldPath) return;

      try {
        await renameFilePath(oldPath, newPath);
        const cleanTitle = finalName.replace(/\.[^.]+$/, '');

        if (currentFilePath === oldPath) {
          setCurrentFilePath(newPath);
          const nowMd = isMarkdownFilePath(newPath);
          const wasMd = isMarkdownFilePath(oldPath);

          if (nowMd && wasMd) {
            setBlocks((prev) => {
              if (
                prev.length > 0 &&
                prev[0].type === 'heading' &&
                prev[0].level === 1 &&
                (prev[0].text.startsWith('Nouveau document') ||
                  prev[0].text === oldName.replace(/\.[^.]+$/, ''))
              ) {
                const updated = [...prev];
                updated[0] = {
                  ...prev[0],
                  text: cleanTitle,
                  slug: slugifyHeading(cleanTitle),
                };
                const nextMd = serializeBlocksToMarkdown(updated);
                setRawText(nextMd);
                writeTextFile(newPath, nextMd);
                return updated;
              }
              return prev;
            });
          } else if (!nowMd && wasMd) {
            // Converted from .md to .txt/.py/.json/etc. -> if it only had the starter "# Nouveau document", replace with starter template for the new extension
            const trimmedRaw = rawText.trim();
            if (/^#\s+Nouveau (document|fichier|note)/i.test(trimmedRaw)) {
              const starter = getStarterContentForPath(newPath);
              setRawText(starter);
              await writeTextFile(newPath, starter);
            }
          } else if (nowMd && !wasMd) {
            setBlocks(parseMarkdownToBlocks(rawText));
          }
        }
        await refreshWorkspaceFiles();
      } catch (err) {
        setStatusBanner(
          `Erreur renommage : ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [currentFilePath, rawText, refreshWorkspaceFiles]
  );

  const handleDuplicateFile = useCallback(
    async (path: string) => {
      const duplicatedPath = await duplicateFilePath(path);
      await refreshWorkspaceFiles();
      await handleSelectFile(duplicatedPath);
    },
    [refreshWorkspaceFiles, handleSelectFile]
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      await deleteFilePath(path);
      await refreshWorkspaceFiles();
    },
    [refreshWorkspaceFiles]
  );

  const handleOpenFolderDialog = useCallback(async () => {
    if (isTauriEnvironment()) {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Ouvrir un dossier de travail dans Cursiv',
      });
      if (typeof selected === 'string' && selected) {
        setWorkspaceRoot(selected.replace(/\\/g, '/'));
      }
    } else {
      setSidebarOpen(true);
      setSidebarTab('files');
    }
  }, []);

  const handleImportPandocFile = async () => {
    if (isTauriEnvironment()) {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: 'Documents Pandoc',
            extensions: ['docx', 'odt', 'tex', 'epub', 'rst', 'wiki', 'html', 'rtf'],
          },
        ],
      });
      if (typeof selected === 'string' && selected) {
        try {
          const md = await runPandocImport(selected, preferences.pandocPath);
          const parsed = parseMarkdownToBlocks(md);
          setBlocks(parsed);
          setRawText(md);
          setIsDirty(true);
          setStatusBanner(`Import Pandoc réussi depuis ${selected.split(/[/\\]/).pop()}`);
        } catch (err) {
          setStatusBanner(
            `Erreur Import Pandoc : ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } else {
      setPreferencesModalOpen(true);
    }
  };

  const handleExportDocument = useCallback(
    async (format: LastExportConfig['format'], targetPathOverride?: string) => {
      try {
        const currentFileName = currentFilePath.split('/').pop() || 'Document.md';
        const exportBlocks = isUsingBlockEditor ? blocks : parseMarkdownToBlocks(rawText);
        const result = await executeDocumentExport({
          format,
          docTitle: currentFileName,
          blocks: exportBlocks,
          sheetElement: sheetRef.current,
          preferences,
          targetPathOverride,
        });
        setLastExportConfig(getLastExportConfig());
        setStatusBanner(`Export terminé : ${result}`);
        setTimeout(() => setStatusBanner(null), 4000);
      } catch (err) {
        setStatusBanner(`Erreur Export : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [currentFilePath, isUsingBlockEditor, blocks, rawText, preferences]
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: HistorySnapshot) => {
      skipHistoryRef.current = true;
      lastHistoryPushRef.current = Date.now();
      currentSnapshotRef.current = snapshot;
      setBlocks(snapshot.blocks);
      setRawText(snapshot.rawText);
      const targetBlockId =
        snapshot.activeBlockId && snapshot.blocks.some((b) => b.id === snapshot.activeBlockId)
          ? snapshot.activeBlockId
          : snapshot.blocks[0]?.id || null;
      setActiveBlockId(targetBlockId);
      setLiveCursorOffset(snapshot.cursorOffset);
      setExternalCaretOffset(snapshot.cursorOffset);
      setExternalCaretVersion((v) => v + 1);
      setIsDirty(true);
      scheduleAutosaveText(currentFilePath, snapshot.rawText);
    },
    [currentFilePath, scheduleAutosaveText]
  );

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push(currentSnapshotRef.current);
    applyHistorySnapshot(previous);
  }, [applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    const nextSnap = h.future.pop();
    if (!nextSnap) return;
    h.past.push(currentSnapshotRef.current);
    applyHistorySnapshot(nextSnap);
  }, [applyHistorySnapshot]);

  const openFind = useCallback(
    (withReplace: boolean) => {
      if (!isUsingBlockEditor) return;
      setActiveBlockId(null);
      setFindOpen(true);
      if (withReplace) setFindReplaceMode(true);
      setFindFocusSignal((n) => n + 1);
    },
    [isUsingBlockEditor]
  );

  const handleReplaceOne = useCallback(
    (match: FindMatch, query: string, replacement: string, caseSensitive: boolean) => {
      const res = replaceOccurrenceInBlocks(
        blocks,
        match.blockId,
        match.indexInBlock,
        query,
        replacement,
        caseSensitive
      );
      if (res.replaced === 0) return;
      updateBlocksAndSync(res.blocks);
    },
    [blocks, updateBlocksAndSync]
  );

  const handleReplaceAll = useCallback(
    (query: string, replacement: string, caseSensitive: boolean): number => {
      const res = replaceAllInBlocks(blocks, query, replacement, caseSensitive);
      if (res.replaced > 0) {
        updateBlocksAndSync(res.blocks);
      }
      return res.replaced;
    },
    [blocks, updateBlocksAndSync]
  );

  // Capture-phase shortcuts: Undo/Redo, Find/Replace, Quick Switcher & Command Palette
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const inCodeMirror = !!target?.closest?.('.cm-editor');
      const inSheet = !!target?.closest?.('.cursiv-editor-sheet');
      const isFieldOutsideSheet =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !inSheet;

      // Undo / Redo — CodeMirror blocks and side inputs keep their own native history
      if ((key === 'z' || key === 'y') && isUsingBlockEditor && !inCodeMirror && !isFieldOutsideSheet) {
        e.preventDefault();
        e.stopPropagation();
        if (key === 'y' || (key === 'z' && e.shiftKey)) handleRedo();
        else handleUndo();
        return;
      }

      if (key === 'f' && !e.shiftKey && !inCodeMirror && isUsingBlockEditor) {
        e.preventDefault();
        e.stopPropagation();
        openFind(false);
        return;
      }
      if (key === 'h' && !e.shiftKey && !inCodeMirror && isUsingBlockEditor) {
        e.preventDefault();
        e.stopPropagation();
        openFind(true);
        return;
      }
      if (key === 'e' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setSwitcherInitialQuery('');
        setSwitcherOpen(true);
        return;
      }
      if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setSwitcherInitialQuery('>');
        setSwitcherOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [handleUndo, handleRedo, openFind, isUsingBlockEditor]);

  // Global Windows Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        handleToggleSourceMode();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        updatePreferences({ focusMode: !preferences.focusMode });
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        updatePreferences({ typewriterMode: !preferences.typewriterMode });
        return;
      }
      if (e.key === 'F2') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          setSidebarOpen(true);
          setSidebarTab('files');
          setAutoRenameFilePath(currentFilePath);
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateNewFile('.md');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFolderDialog();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveCurrentFile();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateFile(currentFilePath);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handleExportDocument('pdf');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setPreferencesModalOpen((v) => !v);
        return;
      }
      if (isUsingBlockEditor && (e.ctrlKey || e.metaKey) && !e.shiftKey && /^[0-6]$/.test(e.key)) {
        if (!activeBlockId) return;
        e.preventDefault();
        const lvl = Number(e.key);
        const next = blocks.map((b): MarkdownBlock => {
          if (b.id !== activeBlockId) return b;
          const currentText =
            b.type === 'heading' || b.type === 'paragraph' || b.type === 'blockquote'
              ? b.text
              : '';
          if (lvl === 0) {
            return { id: b.id, type: 'paragraph', text: currentText };
          }
          return {
            id: b.id,
            type: 'heading',
            level: lvl as 1 | 2 | 3 | 4 | 5 | 6,
            text: currentText || 'Titre',
            slug: slugifyHeading(currentText || 'Titre'),
          };
        });
        updateBlocksAndSync(next);
        return;
      }
      if (isUsingBlockEditor && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const tblBlock: MarkdownBlock = {
          id: nextBlockId('tbl'),
          type: 'table',
          headers: ['Colonne 1', 'Colonne 2', 'Colonne 3'],
          alignments: ['left', 'center', 'right'],
          rows: [
            ['Valeur A1', 'Valeur B1', 'Valeur C1'],
            ['Valeur A2', 'Valeur B2', 'Valeur C2'],
          ],
        };
        updateBlocksAndSync([...blocks, tblBlock]);
        setActiveBlockId(tblBlock.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleToggleSourceMode,
    handleSaveCurrentFile,
    handleCreateNewFile,
    handleOpenFolderDialog,
    handleDuplicateFile,
    handleExportDocument,
    updateBlocksAndSync,
    isUsingBlockEditor,
    blocks,
    activeBlockId,
    currentFilePath,
    preferences.focusMode,
    preferences.typewriterMode,
    updatePreferences,
  ]);

  const handleExportWithPrevious = async (overwrite: boolean) => {
    if (!lastExportConfig) return;
    await handleExportDocument(
      lastExportConfig.format,
      overwrite ? lastExportConfig.targetPath : undefined
    );
  };

  const handleJumpToHeading = (heading: OutlineHeading) => {
    if (preferences.sourceCodeMode) {
      updatePreferences({ sourceCodeMode: false });
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(heading.slug);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveBlockId(heading.blockId);
      setActiveHeadingSlug(heading.slug);
    });
  };

  const currentFileName = currentFilePath.split('/').pop() || 'Sans titre.md';

  const paletteCommands: PaletteCommand[] = switcherOpen
    ? [
        { id: 'new-md', label: 'Nouveau document Markdown (.md)', shortcut: 'Ctrl+N', run: () => handleCreateNewFile('.md') },
        { id: 'new-txt', label: 'Nouveau fichier texte (.txt)', run: () => handleCreateNewFile('.txt') },
        { id: 'new-json', label: 'Nouveau fichier JSON (.json)', run: () => handleCreateNewFile('.json') },
        { id: 'new-csv', label: 'Nouvelle feuille CSV (.csv)', run: () => handleCreateNewFile('.csv') },
        { id: 'new-py', label: 'Nouveau script Python (.py)', run: () => handleCreateNewFile('.py') },
        { id: 'new-ts', label: 'Nouveau fichier TypeScript (.ts)', run: () => handleCreateNewFile('.ts') },
        { id: 'new-html', label: 'Nouvelle page HTML (.html)', run: () => handleCreateNewFile('.html') },
        { id: 'save', label: 'Enregistrer', shortcut: 'Ctrl+S', run: handleSaveCurrentFile },
        { id: 'open-folder', label: 'Ouvrir un dossier…', shortcut: 'Ctrl+O', run: handleOpenFolderDialog },
        { id: 'duplicate', label: 'Dupliquer le fichier', shortcut: 'Ctrl+D', run: () => handleDuplicateFile(currentFilePath) },
        {
          id: 'rename',
          label: 'Renommer ou changer l’extension du fichier',
          shortcut: 'F2',
          run: () => {
            setSidebarOpen(true);
            setSidebarTab('files');
            setAutoRenameFilePath(currentFilePath);
          },
        },
        { id: 'find', label: 'Rechercher dans le document', shortcut: 'Ctrl+F', run: () => openFind(false) },
        { id: 'replace', label: 'Rechercher et remplacer', shortcut: 'Ctrl+H', run: () => openFind(true) },
        { id: 'undo', label: 'Annuler', shortcut: 'Ctrl+Z', run: handleUndo },
        { id: 'redo', label: 'Rétablir', shortcut: 'Ctrl+Y', run: handleRedo },
        { id: 'exp-pdf', label: 'Exporter en PDF', shortcut: 'Ctrl+P', run: () => handleExportDocument('pdf') },
        { id: 'exp-html', label: 'Exporter en HTML (avec style)', run: () => handleExportDocument('html') },
        { id: 'exp-html-plain', label: 'Exporter en HTML (sans style)', run: () => handleExportDocument('html-plain') },
        { id: 'exp-png', label: 'Exporter en image PNG', run: () => handleExportDocument('png') },
        { id: 'exp-docx', label: 'Exporter en Word (.docx) via Pandoc', run: () => handleExportDocument('docx') },
        { id: 'exp-odt', label: 'Exporter en OpenDocument (.odt) via Pandoc', run: () => handleExportDocument('odt') },
        { id: 'exp-latex', label: 'Exporter en LaTeX (.tex) via Pandoc', run: () => handleExportDocument('latex') },
        { id: 'exp-epub', label: 'Exporter en EPUB via Pandoc', run: () => handleExportDocument('epub') },
        { id: 'import', label: 'Importer un document via Pandoc…', run: handleImportPandocFile },
        { id: 'focus', label: 'Basculer le mode Focus', shortcut: 'F8', run: () => updatePreferences({ focusMode: !preferences.focusMode }) },
        { id: 'typewriter', label: 'Basculer le mode Machine à écrire', shortcut: 'F9', run: () => updatePreferences({ typewriterMode: !preferences.typewriterMode }) },
        { id: 'source', label: 'Basculer le mode Code source', shortcut: 'Ctrl+/', run: handleToggleSourceMode },
        { id: 'sidebar', label: 'Afficher / masquer le volet de navigation', shortcut: 'Ctrl+Maj+L', run: () => setSidebarOpen((v) => !v) },
        { id: 'outline', label: 'Afficher le plan du document', run: () => { setSidebarOpen(true); setSidebarTab('outline'); } },
        { id: 'zoom-reset', label: 'Réinitialiser l’échelle de la page (100 %)', run: () => updatePreferences({ pageZoom: 100 }) },
        { id: 'prefs', label: 'Préférences', shortcut: 'Ctrl+,', run: () => setPreferencesModalOpen(true) },
        {
          id: 'updates',
          label: 'Vérifier les mises à jour',
          run: () => {
            setManualUpdateCheck(true);
            checkGitHubUpdates(preferences.githubUpdateRepo).then(setUpdateInfo);
          },
        },
        ...Object.values(BUILTIN_THEMES).map((t) => ({
          id: `theme-${t.id}`,
          label: `Thème : ${t.name}${preferences.theme === t.id ? '  (actif)' : ''}`,
          run: () => updatePreferences({ theme: t.id as CursivPreferences['theme'] }),
        })),
      ]
    : [];

  const refractionScale = Math.round(((preferences.waterRefraction ?? 35) / 100) * 18);

  return (
    <div
      className="cursiv-app-shell h-screen w-screen flex flex-col overflow-hidden relative"
      style={{
        backgroundColor: 'var(--bg-color)',
        color: 'var(--text-color)',
      }}
    >
      {/* Underwater SVG Filter & Caustics Overlay when Aqua Theme is active */}
      {preferences.theme === 'aqua' && (
        <>
          <svg className="hidden" aria-hidden="true">
            <defs>
              <filter id="cursiv-water-filter" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.012 0.018"
                  numOctaves="2"
                  seed="7"
                  result="waterNoise"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="waterNoise"
                  scale={refractionScale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </filter>
            </defs>
          </svg>
          <div className="cursiv-aqua-caustics" />
        </>
      )}

      {/* Ultra-minimalist borderless Titlebar fused with document sheet */}
      <Titlebar
        currentFileName={currentFileName}
        isDirty={isDirty}
        sidebarOpen={sidebarOpen}
        preferences={preferences}
        lastExportConfig={lastExportConfig}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onNewFile={(ext) => handleCreateNewFile(ext || '.md')}
        onSaveFile={handleSaveCurrentFile}
        onImportPandocFile={handleImportPandocFile}
        onExportDocument={(fmt) => handleExportDocument(fmt)}
        onExportWithPrevious={handleExportWithPrevious}
        onUpdatePreferences={updatePreferences}
        onOpenPreferencesModal={() => setPreferencesModalOpen(true)}
        onCheckForUpdates={() => {
          setManualUpdateCheck(true);
          checkGitHubUpdates(preferences.githubUpdateRepo).then(setUpdateInfo);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFind={() => openFind(false)}
        onReplace={() => openFind(true)}
        onQuickSwitcher={() => {
          setSwitcherInitialQuery('');
          setSwitcherOpen(true);
        }}
        onCommandPalette={() => {
          setSwitcherInitialQuery('>');
          setSwitcherOpen(true);
        }}
      />

      {/* Status Notification Pill */}
      {statusBanner && (
        <div
          className="no-print no-export cursiv-popup-anim fixed top-11 right-5 z-50 px-3.5 py-1.5 rounded-lg shadow-lg border text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--bg-color)',
            borderColor: 'var(--primary-color)',
            color: 'var(--text-color)',
          }}
        >
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="opacity-60 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Workspace Container: Sidebar + Universal Editor */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative z-10">
        <Sidebar
          isOpen={sidebarOpen}
          activeTab={sidebarTab}
          files={files}
          currentFilePath={currentFilePath}
          autoRenameFilePath={autoRenameFilePath}
          outline={outlineHeadings}
          activeHeadingSlug={activeHeadingSlug}
          showHiddenFiles={preferences.showHiddenFiles}
          showNonMarkdownFiles={preferences.showNonMarkdownFiles}
          customWidth={preferences.sidebarWidth}
          onCustomWidthChange={(width) => updatePreferences({ sidebarWidth: width })}
          onTabChange={setSidebarTab}
          onSelectFile={(p) => handleSelectFile(p)}
          onCreateFile={(ext) => handleCreateNewFile(ext || '.md')}
          onRenameFile={handleRenameFile}
          onClearAutoRename={() => setAutoRenameFilePath(null)}
          onDuplicateFile={handleDuplicateFile}
          onDeleteFile={handleDeleteFile}
          onJumpToHeading={handleJumpToHeading}
          onToggleHiddenFiles={() =>
            updatePreferences({ showHiddenFiles: !preferences.showHiddenFiles })
          }
          onToggleNonMarkdownFiles={() =>
            updatePreferences({
              showNonMarkdownFiles: !preferences.showNonMarkdownFiles,
            })
          }
          onOpenFolderDialog={handleOpenFolderDialog}
        />

        {/* Main Writing Sheet (WYSIWYM, Universal Code/Data Editor, or Image Viewer) */}
        <main
          ref={scrollContainerRef}
          className="flex-1 h-full overflow-y-auto relative"
        >
          <EditorErrorBoundary
            onRecover={() => {
              const recovered = parseMarkdownToBlocks(rawText || DEFAULT_WELCOME_MARKDOWN);
              setBlocks(recovered);
              setActiveBlockId(null);
            }}
          >
            {isCurrentImage ? (
              <div className="max-w-4xl mx-auto px-8 py-10 flex flex-col items-center gap-5">
                <div
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs"
                  style={{
                    backgroundColor: 'var(--sidebar-bg-color)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{currentFileName}</span>
                    {imageDimensions && (
                      <span className="opacity-65 font-mono">
                        {imageDimensions.w} × {imageDimensions.h} px
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setImageZoom((z) => Math.max(25, z - 25))}
                      className="px-2 py-1 rounded border hover:bg-black/5 cursor-pointer font-mono"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      -25%
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageZoom(100)}
                      className="px-2.5 py-1 rounded border hover:bg-black/5 cursor-pointer font-mono"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      {imageZoom}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageZoom((z) => Math.min(400, z + 25))}
                      className="px-2 py-1 rounded border hover:bg-black/5 cursor-pointer font-mono"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      +25%
                    </button>
                  </div>
                </div>

                <div
                  className="w-full min-h-[420px] rounded-2xl border p-6 flex items-center justify-center overflow-auto"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundImage:
                      'repeating-conic-gradient(rgba(128,128,128,0.1) 0% 25%, transparent 0% 50%)',
                    backgroundSize: '20px 20px',
                  }}
                >
                  {imageDataUrl ? (
                    <img
                      src={imageDataUrl}
                      alt={currentFileName}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                      style={{
                        width: `${imageZoom}%`,
                        maxWidth: imageZoom === 100 ? '100%' : 'none',
                      }}
                      className="rounded-lg shadow-lg transition-all duration-150"
                    />
                  ) : (
                    <span className="text-xs opacity-60">Chargement de l&apos;image...</span>
                  )}
                </div>
              </div>
            ) : !isUsingBlockEditor ? (
              <SourceCodeEditor
                markdownText={rawText}
                filePath={currentFilePath}
                initialCursorOffset={sourceCursorOffset}
                initialScrollRatio={sourceScrollRatio}
                isStandaloneFile={!isCurrentMarkdown}
                onChange={(nextText, cursor, ratio) => {
                  setSourceCursorOffset(cursor);
                  setSourceScrollRatio(ratio);
                  setRawText(nextText);
                  if (isCurrentMarkdown) {
                    setBlocks(parseMarkdownToBlocks(nextText));
                  }
                  setIsDirty(true);
                  scheduleAutosaveText(currentFilePath, nextText);
                }}
                onExitSourceMode={
                  isCurrentMarkdown || currentFileMeta.category === 'plaintext'
                    ? handleToggleSourceMode
                    : undefined
                }
              />
            ) : (
              <WysiwymEditor
                blocks={blocks}
                activeBlockId={activeBlockId}
                preferences={preferences}
                currentFilePath={currentFilePath}
                sheetRef={sheetRef}
                scrollContainerRef={scrollContainerRef}
                externalCaretOffset={externalCaretOffset}
                externalCaretVersion={externalCaretVersion}
                onChangeBlocks={updateBlocksAndSync}
                onSelectBlock={(blockId) => setActiveBlockId(blockId)}
                onActiveHeadingSlugChange={setActiveHeadingSlug}
                onOpenFile={handleOpenWikiLinkOrFile}
                onCursorOffsetChange={(off) => setLiveCursorOffset(off ?? 0)}
              />
            )}
          </EditorErrorBoundary>
        </main>
      </div>

      {/* Bottom-right Subtle Status Bar */}
      <StatusBar
        markdownText={rawText}
        readingSpeedWpm={preferences.readingSpeedWpm}
        pageZoom={preferences.pageZoom}
        focusMode={preferences.focusMode}
        typewriterMode={preferences.typewriterMode}
        sourceCodeMode={!isUsingBlockEditor}
        onResetPageZoom={() => updatePreferences({ pageZoom: 100 })}
        onToggleFocusMode={() =>
          updatePreferences({ focusMode: !preferences.focusMode })
        }
        onToggleTypewriterMode={() =>
          updatePreferences({ typewriterMode: !preferences.typewriterMode })
        }
        onToggleSourceCodeMode={handleToggleSourceMode}
      />

      {/* Find & Replace bar (Ctrl+F / Ctrl+H) */}
      {isUsingBlockEditor && (
        <FindReplaceBar
          isOpen={findOpen}
          replaceMode={findReplaceMode}
          focusSignal={findFocusSignal}
          sheetRef={sheetRef}
          contentVersion={blocks}
          onToggleReplaceMode={() => setFindReplaceMode((v) => !v)}
          onReplaceOne={handleReplaceOne}
          onReplaceAll={handleReplaceAll}
          onClose={() => {
            setFindOpen(false);
            setFindReplaceMode(false);
          }}
        />
      )}

      {/* Quick Switcher (Ctrl+E) & Command Palette (Ctrl+Shift+P) */}
      <QuickSwitcher
        isOpen={switcherOpen}
        initialQuery={switcherInitialQuery}
        files={files}
        workspaceRoot={workspaceRoot}
        currentFilePath={currentFilePath}
        commands={paletteCommands}
        onOpenFile={(p) => handleSelectFile(p)}
        onClose={() => setSwitcherOpen(false)}
      />

      {/* Preferences & Hot-Reload CSS Themes Modal */}
      <PreferencesModal
        isOpen={preferencesModalOpen}
        preferences={preferences}
        onUpdatePreferences={updatePreferences}
        onClose={() => setPreferencesModalOpen(false)}
      />

      {/* Non-intrusive GitHub Auto-Update Notification */}
      <UpdateToast
        updateInfo={updateInfo}
        manualCheckTriggered={manualUpdateCheck}
        onDismiss={() => {
          setUpdateInfo(null);
          setManualUpdateCheck(false);
        }}
      />
    </div>
  );
};

export default App;
