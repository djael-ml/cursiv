import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  ListTree,
  Newspaper,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FileEntryNode, OutlineHeading } from '../types/editor';

export type SidebarTab = 'files' | 'articles' | 'outline';

interface SidebarProps {
  isOpen: boolean;
  activeTab: SidebarTab;
  files: FileEntryNode[];
  currentFilePath: string;
  autoRenameFilePath: string | null;
  outline: OutlineHeading[];
  activeHeadingSlug: string;
  showHiddenFiles: boolean;
  showNonMarkdownFiles: boolean;
  customWidth?: number;
  onCustomWidthChange?: (width: number) => void;
  onTabChange: (tab: SidebarTab) => void;
  onSelectFile: (path: string) => void;
  onCreateFile: () => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onClearAutoRename: () => void;
  onDuplicateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onJumpToHeading: (heading: OutlineHeading) => void;
  onToggleHiddenFiles: () => void;
  onToggleNonMarkdownFiles: () => void;
  onOpenFolderDialog: () => void;
  onCloseMobileSidebar?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  activeTab,
  files,
  currentFilePath,
  autoRenameFilePath,
  outline,
  activeHeadingSlug,
  showHiddenFiles,
  showNonMarkdownFiles,
  customWidth = 0,
  onCustomWidthChange,
  onTabChange,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onClearAutoRename,
  onDuplicateFile,
  onDeleteFile,
  onJumpToHeading,
  onToggleHiddenFiles,
  onToggleNonMarkdownFiles,
  onOpenFolderDialog,
  onCloseMobileSidebar,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'modified' | 'name'>('modified');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const [autoWidthPx, setAutoWidthPx] = useState<number>(() =>
    Math.round(Math.min(340, Math.max(276, window.innerWidth * 0.21)))
  );
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [sidebarContextMenu, setSidebarContextMenu] = useState<{
    x: number;
    y: number;
    targetPath: string | null;
    targetName: string | null;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Automatically resize sidebar proportionally to screen width when window resizes
  useEffect(() => {
    const updateResponsiveWidth = () => {
      const computed = Math.round(Math.min(350, Math.max(276, window.innerWidth * 0.21)));
      setAutoWidthPx(computed);
    };
    window.addEventListener('resize', updateResponsiveWidth);
    return () => window.removeEventListener('resize', updateResponsiveWidth);
  }, []);

  const effectiveWidth = customWidth >= 240 ? customWidth : autoWidthPx;

  useEffect(() => {
    if (!sidebarContextMenu) return;
    const close = () => setSidebarContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [sidebarContextMenu]);

  // Automatically enter rename mode when a new document is created (double-click or Ctrl+N)
  useEffect(() => {
    if (autoRenameFilePath) {
      const baseName =
        autoRenameFilePath.split('/').pop()?.replace(/\.md$/i, '') || 'Nouveau document';
      setRenamingPath(autoRenameFilePath);
      setRenameInput(baseName);
      onClearAutoRename();
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [autoRenameFilePath, onClearAutoRename]);

  // Flatten file tree for Articles Panel & keyboard navigation
  const flatFiles = useMemo(() => {
    const list: FileEntryNode[] = [];
    const walk = (nodes: FileEntryNode[]) => {
      for (const n of nodes) {
        if (n.is_dir && n.children) {
          walk(n.children);
        } else if (!n.is_dir) {
          list.push(n);
        }
      }
    };
    walk(files);
    return list;
  }, [files]);

  const sortedArticles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = flatFiles.filter(
      (f) =>
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.excerpt && f.excerpt.toLowerCase().includes(q))
    );
    return [...filtered].sort((a, b) =>
      sortBy === 'modified'
        ? b.modified_ms - a.modified_ms
        : a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }, [flatFiles, searchQuery, sortBy]);

  const filteredOutline = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return outline;
    return outline.filter((h) => h.text.toLowerCase().includes(q));
  }, [outline, searchQuery]);

  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    if (renamingPath) return;
    if (flatFiles.length === 0) return;
    const currentIndex = flatFiles.findIndex((f) => f.path === currentFilePath);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = flatFiles[(currentIndex + 1) % flatFiles.length];
      if (next) onSelectFile(next.path);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = flatFiles[(currentIndex - 1 + flatFiles.length) % flatFiles.length];
      if (prev) onSelectFile(prev.path);
    } else if (e.key === 'F2' && currentFilePath) {
      e.preventDefault();
      const currentName =
        currentFilePath.split('/').pop()?.replace(/\.md$/i, '') || 'Document';
      setRenamingPath(currentFilePath);
      setRenameInput(currentName);
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    } else if (e.key === 'Delete' && currentFilePath && flatFiles.length > 1) {
      e.preventDefault();
      onDeleteFile(currentFilePath);
    }
  };

  const commitRename = (oldPath: string) => {
    const trimmed = renameInput.trim();
    if (trimmed) {
      onRenameFile(oldPath, trimmed);
    }
    setRenamingPath(null);
  };

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const onMove = (moveEvent: MouseEvent) => {
      const nextW = Math.max(255, Math.min(480, moveEvent.clientX));
      onCustomWidthChange?.(nextW);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderTreeNode = (node: FileEntryNode, depth = 0): React.ReactNode => {
    const q = searchQuery.toLowerCase().trim();
    if (q && !node.is_dir && !node.name.toLowerCase().includes(q)) {
      return null;
    }

    if (node.is_dir) {
      const isCollapsed = collapsedDirs[node.path] ?? false;
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() =>
              setCollapsedDirs((prev) => ({ ...prev, [node.path]: !isCollapsed }))
            }
            style={{ paddingLeft: `${0.65 + depth * 0.85}rem` }}
            className="w-full flex items-center gap-1.5 py-1.5 pr-2 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 rounded cursor-pointer"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 opacity-65" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 opacity-65" />
            )}
            <Folder className="w-3.5 h-3.5 opacity-75" />
            <span className="truncate">{node.name}</span>
          </button>
          {!isCollapsed &&
            node.children?.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    const isSelected = node.path === currentFilePath;
    const isRenaming = renamingPath === node.path;

    return (
      <div
        key={node.path}
        data-file-item="true"
        style={{
          paddingLeft: `${0.75 + depth * 0.85}rem`,
          backgroundColor: isSelected
            ? 'color-mix(in srgb, var(--primary-color) 14%, transparent)'
            : 'transparent',
          color: isSelected ? 'var(--primary-color)' : 'var(--sidebar-text-color)',
        }}
        className="group flex items-center justify-between py-1.5 pr-2 rounded-md text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
        onClick={() => onSelectFile(node.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectFile(node.path);
          setSidebarContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetPath: node.path,
            targetName: node.name,
          });
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenamingPath(node.path);
          setRenameInput(node.name.replace(/\.md$/i, ''));
          requestAnimationFrame(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
          });
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-3.5 h-3.5 shrink-0 opacity-75" />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              autoFocus
              value={renameInput}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameInput(e.target.value)}
              onBlur={() => commitRename(node.path)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename(node.path);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenamingPath(null);
                }
              }}
              aria-label="Renommer le fichier"
              className="w-full px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 border outline-none text-xs font-medium"
              style={{
                borderColor: 'var(--primary-color)',
                color: 'var(--text-color)',
              }}
            />
          ) : (
            <span className="truncate font-medium" title="Double-cliquez pour renommer (F2)">
              {node.name}
            </span>
          )}
        </div>

        {/* File CRUD Quick Actions */}
        {!isRenaming && (
          <div
            className="hidden group-hover:flex items-center gap-1 ml-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setRenamingPath(node.path);
                setRenameInput(node.name.replace(/\.md$/i, ''));
                requestAnimationFrame(() => {
                  renameInputRef.current?.focus();
                  renameInputRef.current?.select();
                });
              }}
              className="p-0.5 rounded hover:bg-black/10 cursor-pointer"
              title="Renommer (F2)"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicateFile(node.path)}
              className="p-0.5 rounded hover:bg-black/10 cursor-pointer"
              title="Dupliquer (Ctrl+D)"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteFile(node.path)}
              className="p-0.5 rounded text-red-500 hover:bg-red-500/10 cursor-pointer"
              title="Supprimer (Suppr)"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="no-print no-export fixed inset-0 bg-black/25 backdrop-blur-[1px] z-20 md:hidden"
          onClick={onCloseMobileSidebar}
        />
      )}

      <aside
        aria-label="Barre latérale d'organisation"
        style={{
          width: isOpen ? `${effectiveWidth}px` : '0px',
          opacity: isOpen ? 1 : 0,
          backgroundColor: 'var(--sidebar-bg-color)',
          color: 'var(--sidebar-text-color)',
          borderColor: 'var(--border-color)',
        }}
        className={`no-print no-export ${
          isResizing ? '' : 'cursiv-sidebar-transition'
        } h-full border-r overflow-hidden flex flex-col shrink-0 select-none z-30 fixed md:relative top-9 md:top-0 bottom-0 left-0 ${
          isOpen ? 'shadow-2xl md:shadow-none' : 'pointer-events-none md:pointer-events-auto'
        }`}
        onKeyDown={handleTreeKeyDown}
        tabIndex={0}
      >
        <div className="w-full min-w-[268px] h-full flex flex-col">
          {/* Top Tab Switcher: File Tree | Articles | Outline + Action Icons (Never Clipped) */}
          <div
            className="flex items-center justify-between gap-1 px-2.5 py-2 border-b text-xs shrink-0"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center gap-0.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onTabChange('files')}
                className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'files'
                    ? 'font-semibold bg-black/5 dark:bg-white/5'
                    : 'opacity-65 hover:opacity-100'
                }`}
                style={{
                  color: activeTab === 'files' ? 'var(--primary-color)' : 'inherit',
                }}
                title="Arborescence de fichiers"
              >
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span>Fichiers</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('articles')}
                className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'articles'
                    ? 'font-semibold bg-black/5 dark:bg-white/5'
                    : 'opacity-65 hover:opacity-100'
                }`}
                style={{
                  color: activeTab === 'articles' ? 'var(--primary-color)' : 'inherit',
                }}
                title="Liste des notes"
              >
                <Newspaper className="w-3.5 h-3.5 shrink-0" />
                <span>Articles</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('outline')}
                className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'outline'
                    ? 'font-semibold bg-black/5 dark:bg-white/5'
                    : 'opacity-65 hover:opacity-100'
                }`}
                style={{
                  color: activeTab === 'outline' ? 'var(--primary-color)' : 'inherit',
                }}
                title="Plan hiérarchique du document"
              >
                <ListTree className="w-3.5 h-3.5 shrink-0" />
                <span>Plan</span>
              </button>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onCreateFile}
                className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Nouveau document Markdown (Ctrl+N ou double-clic)"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenFolderDialog}
                className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Ouvrir un dossier local (Ctrl+O)"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
              {onCloseMobileSidebar && (
                <button
                  type="button"
                  onClick={onCloseMobileSidebar}
                  className="p-1.5 rounded hover:bg-black/10 md:hidden cursor-pointer"
                  title="Fermer le panneau"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search / Filter Input */}
          <div className="px-2.5 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
            <div
              className="flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs"
              style={{
                backgroundColor: 'var(--bg-color)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Search className="w-3.5 h-3.5 opacity-55 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Rechercher ou filtrer"
                placeholder={
                  activeTab === 'outline'
                    ? 'Filtrer dans le plan...'
                    : 'Rechercher un fichier...'
                }
                className="w-full bg-transparent outline-none text-xs"
              />
            </div>
          </div>

          {/* Panel Body — Double-click or Right-click empty area to create/manage documents */}
          <div
            className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 flex flex-col"
            onContextMenu={(e) => {
              e.preventDefault();
              setSidebarContextMenu({
                x: e.clientX,
                y: e.clientY,
                targetPath: null,
                targetName: null,
              });
            }}
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (
                activeTab !== 'outline' &&
                !target.closest('[data-file-item="true"]') &&
                !target.closest('button') &&
                !target.closest('input') &&
                !target.closest('label')
              ) {
                e.preventDefault();
                onCreateFile();
              }
            }}
          >
            {activeTab === 'files' && (
              <>
                <div className="space-y-0.5">
                  {files.map((node) => renderTreeNode(node, 0))}
                </div>

                {/* Clean empty area for double-click creation */}
                <div
                  className="flex-1 min-h-[120px]"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onCreateFile();
                  }}
                />
              </>
            )}

            {activeTab === 'articles' && (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-2 pb-2 text-[11px] opacity-70">
                  <span>{sortedArticles.length} notes</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((s) => (s === 'modified' ? 'name' : 'modified'))
                    }
                    className="underline cursor-pointer"
                  >
                    Tri : {sortBy === 'modified' ? 'Date' : 'Titre'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {sortedArticles.map((art) => {
                    const isSelected = art.path === currentFilePath;
                    const dateStr = new Date(art.modified_ms).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={art.path}
                        data-file-item="true"
                        onClick={() => onSelectFile(art.path)}
                        style={{
                          backgroundColor: isSelected
                            ? 'color-mix(in srgb, var(--primary-color) 12%, transparent)'
                            : 'var(--bg-color)',
                          borderColor: isSelected
                            ? 'var(--primary-color)'
                            : 'var(--border-color)',
                        }}
                        className="p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-xs truncate">
                            {art.name.replace(/\.md$/i, '')}
                          </span>
                          <span
                            className="text-[10px] shrink-0"
                            style={{ color: 'var(--meta-content-color)' }}
                          >
                            {dateStr}
                          </span>
                        </div>
                        <p
                          className="text-[11px] line-clamp-2 m-0 leading-snug"
                          style={{ color: 'var(--meta-content-color)' }}
                        >
                          {art.excerpt || 'Aucun extrait'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'outline' && (
              <div className="space-y-0.5">
                {filteredOutline.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs opacity-60">
                    Aucun titre H1–H6 trouvé dans ce document.
                  </div>
                ) : (
                  filteredOutline.map((h) => {
                    const isCurrent = h.slug === activeHeadingSlug;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => onJumpToHeading(h)}
                        style={{
                          paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem`,
                          color: isCurrent ? 'var(--primary-color)' : 'inherit',
                          backgroundColor: isCurrent
                            ? 'color-mix(in srgb, var(--primary-color) 12%, transparent)'
                            : 'transparent',
                        }}
                        className={`w-full text-left py-1.5 pr-2 rounded text-xs truncate transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer ${
                          isCurrent ? 'font-semibold' : ''
                        }`}
                      >
                        {h.text}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Bottom Filter Toggles */}
          {activeTab === 'files' && (
            <div
              className="px-3 py-2 border-t text-[11px] space-y-1 opacity-75 shrink-0"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHiddenFiles}
                  onChange={onToggleHiddenFiles}
                />
                <span className="truncate">Afficher les fichiers cachés (.*)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNonMarkdownFiles}
                  onChange={onToggleNonMarkdownFiles}
                />
                <span className="truncate">Afficher les fichiers non-Markdown</span>
              </label>
            </div>
          )}
        </div>

        {/* Drag-Resize Handle on Right Edge (Double-click to reset to auto screen width) */}
        <div
          onMouseDown={handleStartResize}
          onDoubleClick={() => onCustomWidthChange?.(0)}
          title="Glisser pour redimensionner · Double-clic pour taille automatique"
          className="hidden md:block absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        />

        {/* Custom Right-Click Context Menu for Sidebar */}
        {sidebarContextMenu && (
          <div
            style={{
              left: `${Math.min(sidebarContextMenu.x, window.innerWidth - 220)}px`,
              top: `${Math.min(sidebarContextMenu.y, window.innerHeight - 230)}px`,
              backgroundColor: 'color-mix(in srgb, var(--bg-color) 96%, transparent)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-color)',
            }}
            className="no-print no-export cursiv-popup-anim fixed z-[100] w-52 rounded-xl border shadow-2xl backdrop-blur-md py-1.5 text-xs select-none"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => {
                setSidebarContextMenu(null);
                onCreateFile();
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FilePlus className="w-3.5 h-3.5 opacity-70" />
                <span>Nouveau document</span>
              </span>
              <span className="opacity-45 font-mono text-[10px]">Ctrl+N</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSidebarContextMenu(null);
                onOpenFolderDialog();
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 opacity-70" />
                <span>Ouvrir un dossier...</span>
              </span>
              <span className="opacity-45 font-mono text-[10px]">Ctrl+O</span>
            </button>

            {sidebarContextMenu.targetPath && (
              <>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
                <button
                  type="button"
                  onClick={() => {
                    const p = sidebarContextMenu.targetPath!;
                    const n = sidebarContextMenu.targetName || '';
                    setSidebarContextMenu(null);
                    setRenamingPath(p);
                    setRenameInput(n.replace(/\.md$/i, ''));
                    requestAnimationFrame(() => {
                      renameInputRef.current?.focus();
                      renameInputRef.current?.select();
                    });
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Edit3 className="w-3.5 h-3.5 opacity-70" />
                    <span>Renommer</span>
                  </span>
                  <span className="opacity-45 font-mono text-[10px]">F2</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = sidebarContextMenu.targetPath!;
                    setSidebarContextMenu(null);
                    onDuplicateFile(p);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Copy className="w-3.5 h-3.5 opacity-70" />
                    <span>Dupliquer</span>
                  </span>
                  <span className="opacity-45 font-mono text-[10px]">Ctrl+D</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = sidebarContextMenu.targetPath!;
                    setSidebarContextMenu(null);
                    onDeleteFile(p);
                  }}
                  className="w-full px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer</span>
                  </span>
                  <span className="opacity-60 font-mono text-[10px]">Suppr</span>
                </button>
              </>
            )}

            <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
            <button
              type="button"
              onClick={() => {
                onToggleHiddenFiles();
                setSidebarContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer text-[11px] opacity-80"
            >
              <span>Fichiers cachés (.*)</span>
              <span>{showHiddenFiles ? '✓' : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleNonMarkdownFiles();
                setSidebarContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left hover:bg-black/6 dark:hover:bg-white/8 flex items-center justify-between cursor-pointer text-[11px] opacity-80"
            >
              <span>Fichiers non-Markdown</span>
              <span>{showNonMarkdownFiles ? '✓' : ''}</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
