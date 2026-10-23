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
import { applyThemeCss } from './utils/themeManager';
import {
  checkGitHubUpdates,
  createFileOrDir,
  DEFAULT_WELCOME_MARKDOWN,
  deleteFilePath,
  duplicateFilePath,
  isTauriEnvironment,
  listWorkspaceFiles,
  readTextFile,
  renameFilePath,
  runPandocImport,
  subscribeDirectoryWatch,
  UpdateCheckResult,
  writeTextFile,
} from './utils/tauriBridge';
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
import { BUILTIN_THEMES } from './utils/themeManager';

const HISTORY_LIMIT = 200;
const HISTORY_COALESCE_MS = 800;

const PREFERENCES_STORAGE_KEY = 'cursiv_preferences_v1_14';

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
  showNonMarkdownFiles: false,
};

function loadInitialPreferences(): CursivPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFERENCES;
}

export const App: React.FC = () => {
  const [preferences, setPreferences] = useState<CursivPreferences>(loadInitialPreferences);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('/Workspace');
  const [files, setFiles] = useState<FileEntryNode[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string>(
    '/Workspace/Bienvenue sur Cursiv.md'
  );
  const [blocks, setBlocks] = useState<MarkdownBlock[]>(() =>
    parseMarkdownToBlocks(DEFAULT_WELCOME_MARKDOWN)
  );
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => window.innerWidth >= 900);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files');
  const [autoRenameFilePath, setAutoRenameFilePath] = useState<string | null>(null);
  const [activeHeadingSlug, setActiveHeadingSlug] = useState<string>('');
  const [preferencesModalOpen, setPreferencesModalOpen] = useState<boolean>(false);

  // Source Code Mode cursor & scroll synchronization state
  const [sourceCursorOffset, setSourceCursorOffset] = useState<number>(0);
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

  // Document-wide Undo / Redo history (block snapshots, typing bursts coalesced)
  const historyRef = useRef<{ past: MarkdownBlock[][]; future: MarkdownBlock[][] }>({
    past: [],
    future: [],
  });
  const prevBlocksRef = useRef<MarkdownBlock[]>(blocks);
  const skipHistoryRef = useRef<boolean>(false);
  const lastHistoryPushRef = useRef<number>(0);

  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    skipHistoryRef.current = true;
    lastHistoryPushRef.current = 0;
  }, []);

  useEffect(() => {
    const prev = prevBlocksRef.current;
    if (prev === blocks) return;
    prevBlocksRef.current = blocks;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const now = Date.now();
    const structural = prev.length !== blocks.length;
    const h = historyRef.current;
    if (structural || now - lastHistoryPushRef.current > HISTORY_COALESCE_MS) {
      h.past.push(prev);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    h.future = [];
    lastHistoryPushRef.current = now;
  }, [blocks]);

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

  // Apply dynamic CSS theme, discreet accent color & smooth caret speed
  useEffect(() => {
    applyThemeCss(
      preferences.theme,
      preferences.customThemesCss,
      preferences.accentColor,
      preferences.caretSmoothSpeed
    );
  }, [
    preferences.theme,
    preferences.customThemesCss,
    preferences.accentColor,
    preferences.caretSmoothSpeed,
  ]);

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

  // Load selected file
  const handleSelectFile = useCallback(async (path: string) => {
    try {
      const content = await readTextFile(path);
      const parsed = parseMarkdownToBlocks(content);
      resetHistory();
      setCurrentFilePath(path);
      setBlocks(parsed);
      setActiveBlockId(parsed[0]?.id || null);
      setIsDirty(false);
    } catch (err) {
      setStatusBanner(`Erreur lecture : ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [resetHistory]);

  const handleOpenWikiLinkOrFile = useCallback(
    (target: string) => {
      const cleanTarget = target.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
      const targetLower = cleanTarget.toLowerCase();
      const targetWithExt = targetLower.endsWith('.md') ? targetLower : `${targetLower}.md`;

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
        setStatusBanner(`Note introuvable : "${cleanTarget}"`);
      }
    },
    [files, handleSelectFile]
  );

  // Load saved content of initial welcome file on startup so user edits are preserved
  useEffect(() => {
    readTextFile(currentFilePath)
      .then((content) => {
        if (content && content.trim().length > 0) {
          resetHistory();
          setBlocks(parseMarkdownToBlocks(content));
        }
      })
      .catch(() => {
        // fallback to default welcome markdown
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markdownString = useMemo(() => serializeBlocksToMarkdown(blocks), [blocks]);
  const outlineHeadings = useMemo(() => extractOutlineHeadings(blocks), [blocks]);

  // Immediate save (`Ctrl+S` or manual save)
  const handleSaveCurrentFile = useCallback(async () => {
    try {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      await writeTextFile(currentFilePath, markdownString);
      setIsDirty(false);
      refreshWorkspaceFiles();
      setStatusBanner(`Enregistré : ${currentFilePath.split('/').pop()}`);
      setTimeout(() => setStatusBanner(null), 2000);
    } catch (err) {
      setStatusBanner(`Erreur sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [currentFilePath, markdownString, refreshWorkspaceFiles]);

  // Debounced autosave (600ms) when blocks change
  const scheduleAutosave = useCallback(
    (filePath: string, nextBlocks: MarkdownBlock[]) => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = window.setTimeout(async () => {
        try {
          await writeTextFile(filePath, serializeBlocksToMarkdown(nextBlocks));
          setIsDirty(false);
        } catch {
          // ignore background autosave error
        }
      }, 600);
    },
    []
  );

  // Toggle Source Code Mode (`Ctrl+/`) while preserving exact scroll & cursor offset
  const handleToggleSourceMode = useCallback(() => {
    if (!preferences.sourceCodeMode) {
      // Transitioning WYSIWYM -> Source Code Mode
      const scroller = scrollContainerRef.current;
      if (scroller) {
        const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        setSourceScrollRatio(scroller.scrollTop / maxScroll);
      }
      // Compute character offset corresponding to activeBlockId
      if (activeBlockId) {
        const idx = blocks.findIndex((b) => b.id === activeBlockId);
        if (idx > 0) {
          const priorMarkdown = serializeBlocksToMarkdown(blocks.slice(0, idx));
          setSourceCursorOffset(priorMarkdown.length);
        } else {
          setSourceCursorOffset(0);
        }
      }
      updatePreferences({ sourceCodeMode: true });
    } else {
      // Transitioning Source Code Mode -> WYSIWYM
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
    preferences.sourceCodeMode,
    activeBlockId,
    blocks,
    sourceScrollRatio,
    updatePreferences,
  ]);

  const handleCreateNewFile = useCallback(async () => {
    const existingNames = new Set(files.map((f) => f.name.toLowerCase()));
    let candidate = 'Nouveau document.md';
    let counter = 2;
    while (existingNames.has(candidate.toLowerCase())) {
      candidate = `Nouveau document ${counter}.md`;
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
  }, [files, workspaceRoot, refreshWorkspaceFiles, handleSelectFile]);

  const handleRenameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const finalName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
      const parent = oldPath.slice(0, oldPath.lastIndexOf('/'));
      const newPath = `${parent}/${finalName}`;
      if (newPath === oldPath) return;

      try {
        await renameFilePath(oldPath, newPath);
        const cleanTitle = finalName.replace(/\.md$/i, '');

        if (currentFilePath === oldPath) {
          setCurrentFilePath(newPath);
          setBlocks((prev) => {
            if (
              prev.length > 0 &&
              prev[0].type === 'heading' &&
              prev[0].level === 1 &&
              (prev[0].text.startsWith('Nouveau document') ||
                prev[0].text === oldPath.split('/').pop()?.replace(/\.md$/i, ''))
            ) {
              const updated = [...prev];
              updated[0] = {
                ...prev[0],
                text: cleanTitle,
                slug: slugifyHeading(cleanTitle),
              };
              writeTextFile(newPath, serializeBlocksToMarkdown(updated));
              return updated;
            }
            return prev;
          });
        }
        await refreshWorkspaceFiles();
      } catch (err) {
        setStatusBanner(
          `Erreur renommage : ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [currentFilePath, refreshWorkspaceFiles]
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
        title: 'Ouvrir un dossier de notes Markdown dans Cursiv',
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
        const result = await executeDocumentExport({
          format,
          docTitle: currentFileName,
          blocks,
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
    [currentFilePath, blocks, preferences]
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: MarkdownBlock[]) => {
      skipHistoryRef.current = true;
      lastHistoryPushRef.current = 0;
      setBlocks(snapshot);
      setActiveBlockId((id) => (id && snapshot.some((b) => b.id === id) ? id : null));
      setIsDirty(true);
      scheduleAutosave(currentFilePath, snapshot);
    },
    [currentFilePath, scheduleAutosave]
  );

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push(prevBlocksRef.current);
    applyHistorySnapshot(previous);
  }, [applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    const nextSnap = h.future.pop();
    if (!nextSnap) return;
    h.past.push(prevBlocksRef.current);
    applyHistorySnapshot(nextSnap);
  }, [applyHistorySnapshot]);

  const openFind = useCallback(
    (withReplace: boolean) => {
      if (preferences.sourceCodeMode) return;
      // Leave edit mode so every block is rendered (and therefore searchable / highlightable)
      setActiveBlockId(null);
      setFindOpen(true);
      if (withReplace) setFindReplaceMode(true);
      setFindFocusSignal((n) => n + 1);
    },
    [preferences.sourceCodeMode]
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
      setBlocks(res.blocks);
      setIsDirty(true);
      scheduleAutosave(currentFilePath, res.blocks);
    },
    [blocks, currentFilePath, scheduleAutosave]
  );

  const handleReplaceAll = useCallback(
    (query: string, replacement: string, caseSensitive: boolean): number => {
      const res = replaceAllInBlocks(blocks, query, replacement, caseSensitive);
      if (res.replaced > 0) {
        setBlocks(res.blocks);
        setIsDirty(true);
        scheduleAutosave(currentFilePath, res.blocks);
      }
      return res.replaced;
    },
    [blocks, currentFilePath, scheduleAutosave]
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
      if ((key === 'z' || key === 'y') && !preferences.sourceCodeMode && !inCodeMirror && !isFieldOutsideSheet) {
        e.preventDefault();
        e.stopPropagation();
        if (key === 'y' || (key === 'z' && e.shiftKey)) handleRedo();
        else handleUndo();
        return;
      }

      if (key === 'f' && !e.shiftKey && !inCodeMirror) {
        e.preventDefault();
        e.stopPropagation();
        openFind(false);
        return;
      }
      if (key === 'h' && !e.shiftKey && !inCodeMirror) {
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
  }, [handleUndo, handleRedo, openFind, preferences.sourceCodeMode]);

  // Global Windows Keyboard Shortcuts (Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+D, Ctrl+P, Ctrl+, , F2, F8, F9, Ctrl+1..6, Ctrl+0, Ctrl+T, Ctrl+/, Ctrl+Shift+L)
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
        handleCreateNewFile();
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
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && /^[0-6]$/.test(e.key)) {
        if (!activeBlockId) return;
        e.preventDefault();
        const lvl = Number(e.key);
        setBlocks((prev) => {
          const next = prev.map((b): MarkdownBlock => {
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
          scheduleAutosave(currentFilePath, next);
          return next;
        });
        setIsDirty(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
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
        setBlocks((prev) => {
          const next = [...prev, tblBlock];
          scheduleAutosave(currentFilePath, next);
          return next;
        });
        setActiveBlockId(tblBlock.id);
        setIsDirty(true);
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
    scheduleAutosave,
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
        { id: 'new', label: 'Nouveau document', shortcut: 'Ctrl+N', run: handleCreateNewFile },
        { id: 'save', label: 'Enregistrer', shortcut: 'Ctrl+S', run: handleSaveCurrentFile },
        { id: 'open-folder', label: 'Ouvrir un dossier…', shortcut: 'Ctrl+O', run: handleOpenFolderDialog },
        { id: 'duplicate', label: 'Dupliquer le document', shortcut: 'Ctrl+D', run: () => handleDuplicateFile(currentFilePath) },
        {
          id: 'rename',
          label: 'Renommer le document',
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

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-color)',
        color: 'var(--text-color)',
      }}
    >
      {/* Ultra-minimalist borderless Titlebar fused with document sheet */}
      <Titlebar
        currentFileName={currentFileName}
        isDirty={isDirty}
        sidebarOpen={sidebarOpen}
        preferences={preferences}
        lastExportConfig={lastExportConfig}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onNewFile={handleCreateNewFile}
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

      {/* Main Workspace Container: Sidebar + Zero-Split-Screen Editor */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
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
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateNewFile}
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

        {/* Main Writing Sheet (WYSIWYM or Synchronized Source Code Mode) */}
        <main
          ref={scrollContainerRef}
          className="flex-1 h-full overflow-y-auto relative"
        >
          {preferences.sourceCodeMode ? (
            <SourceCodeEditor
              markdownText={markdownString}
              initialCursorOffset={sourceCursorOffset}
              initialScrollRatio={sourceScrollRatio}
              onChange={(nextMd, cursor, ratio) => {
                setSourceCursorOffset(cursor);
                setSourceScrollRatio(ratio);
                const parsed = parseMarkdownToBlocks(nextMd);
                setBlocks(parsed);
                setIsDirty(true);
                scheduleAutosave(currentFilePath, parsed);
              }}
              onExitSourceMode={handleToggleSourceMode}
            />
          ) : (
            <WysiwymEditor
              blocks={blocks}
              activeBlockId={activeBlockId}
              preferences={preferences}
              currentFilePath={currentFilePath}
              sheetRef={sheetRef}
              scrollContainerRef={scrollContainerRef}
              onChangeBlocks={(nextBlocks) => {
                setBlocks(nextBlocks);
                setIsDirty(true);
                scheduleAutosave(currentFilePath, nextBlocks);
              }}
              onSelectBlock={(blockId) => setActiveBlockId(blockId)}
              onActiveHeadingSlugChange={setActiveHeadingSlug}
              onOpenFile={handleOpenWikiLinkOrFile}
            />
          )}
        </main>
      </div>

      {/* Bottom-right Subtle Status Bar (Word Count, Reading Time, Selection Stats, Mode Indicators) */}
      <StatusBar
        markdownText={markdownString}
        readingSpeedWpm={preferences.readingSpeedWpm}
        pageZoom={preferences.pageZoom}
        focusMode={preferences.focusMode}
        typewriterMode={preferences.typewriterMode}
        sourceCodeMode={preferences.sourceCodeMode}
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
      {!preferences.sourceCodeMode && (
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
        onOpenFile={handleSelectFile}
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
