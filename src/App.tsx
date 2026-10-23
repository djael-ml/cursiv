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

const PREFERENCES_STORAGE_KEY = 'cursiv_preferences_v1_14';

const DEFAULT_PREFERENCES: CursivPreferences = {
  theme: 'github',
  customThemesCss: {},
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

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);

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

  // Apply dynamic CSS theme & hot-reload custom CSS
  useEffect(() => {
    applyThemeCss(preferences.theme, preferences.customThemesCss);
  }, [preferences.theme, preferences.customThemesCss]);

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
      setCurrentFilePath(path);
      setBlocks(parsed);
      setActiveBlockId(parsed[0]?.id || null);
      setIsDirty(false);
    } catch (err) {
      setStatusBanner(`Erreur lecture : ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Load saved content of initial welcome file on startup so user edits are preserved
  useEffect(() => {
    readTextFile(currentFilePath)
      .then((content) => {
        if (content && content.trim().length > 0) {
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
            />
          )}
        </main>
      </div>

      {/* Bottom-right Subtle Status Bar (Word Count, Reading Time, Selection Stats, Mode Indicators) */}
      <StatusBar
        markdownText={markdownString}
        readingSpeedWpm={preferences.readingSpeedWpm}
        focusMode={preferences.focusMode}
        typewriterMode={preferences.typewriterMode}
        sourceCodeMode={preferences.sourceCodeMode}
        onToggleFocusMode={() =>
          updatePreferences({ focusMode: !preferences.focusMode })
        }
        onToggleTypewriterMode={() =>
          updatePreferences({ typewriterMode: !preferences.typewriterMode })
        }
        onToggleSourceCodeMode={handleToggleSourceMode}
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
