import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { FileEntryNode } from '../types/editor';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  latest_commit_sha: string;
  update_available: boolean;
  release_notes: string;
  download_url: string | null;
  html_url: string;
  published_at: string;
  repo: string;
  native_updater_available?: boolean;
}

let cachedNativeUpdate: Update | null = null;

export interface PandocStatus {
  available: boolean;
  version: string | null;
  binary_path: string;
}

const VIRTUAL_STORAGE_KEY = 'cursiv_virtual_fs_v1';

export const DEFAULT_WELCOME_MARKDOWN = `---
title: Bienvenue sur Cursiv
author: Djaël Mola
export_format: pdf
---

# Bienvenue sur Cursiv 🪶

**Cursiv** est un éditeur et lecteur Markdown **WYSIWYM** (*What You See Is What You Mean*) ultra-minimaliste, conçu avec **Tauri v2 (Rust)**, **React 19** et **CodeMirror 6**. Placez votre curseur sur n'importe quel élément formaté comme **ce texte en gras**, *cette emphase italique*, ==ce passage surligné==, ~H2O~ ou ^E=mc2^ pour révéler ses tokens Markdown sans aucun saut de mise en page (*Zero Layout Shift*).

[TOC]

## 1. Alertes & Callouts GitHub

> [!TIP] Révélation Contextuelle & Mode Code Source
> Cliquez dans n'importe quel paragraphe ou utilisez \`Ctrl+/\` pour basculer instantanément entre le rendu WYSIWYM et le code source Markdown brut en conservant votre position exacte.

> [!IMPORTANT] Mathématiques, Physique & Chimie (KaTeX + mhchem)
> Cursiv intègre nativement **KaTeX**, le package **Physics**, **AMSmath**, les macros \`\\newcommand\` et la chimie **mhchem** comme $\\ce{CH4 + 2O2 -> CO2 + 2H2O}$ ou $\\ce{SO4^2-}$.

## 2. Blocs d'Équations & Références Croisées

$$
\\newcommand{\\Expect}[1]{\\mathbb{E}\\left[ #1 \\right]}
\\mathcal{L}_{\\text{Cursiv}}(\\theta) = \\int_{\\Omega} \\bra{\\psi(\\mathbf{r})} \\hat{H} \\ket{\\psi(\\mathbf{r})} \\dd^3\\mathbf{r} + \\Expect{\\nabla \\cdot \\mathbf{F}} \\label{eq:hamiltonian}
$$

Comme démontré dans l'équation $\\eqref{eq:hamiltonian}$, les références croisées \`\\label{...}\` et \`\\eqref{...}\` sont résolues en temps réel.

## 3. Tableaux Interactifs (Markdown Extra)

| Fonctionnalité | Raccourci | Expérience Cursiv |
| :--- | :---: | ---: |
| **Insérer un tableau** | \`Ctrl+T\` | 100% Natif |
| **Focus Mode** | \`F8\` | Estompage fluide |
| **Typewriter Mode** | \`F9\` | Verrouillage vertical |
| **Mode Code Source** | \`Ctrl+/\` | CodeMirror 6 synchronisé |

## 4. Listes de Tâches Interactives (GFM)

- [x] Architecture Core Desktop **Tauri v2 (Rust)** (< 60 Mo RAM)
- [x] Moteur **WYSIWYM** avec *Live Token Reveal* (\`120ms cubic-bezier\`)
- [x] Diagrammes vectoriels live (**Mermaid**, **Flowchart.js**, **Sequence**)
- [ ] Essayer les 6 thèmes CSS inclus (*GitHub, Night, Newsprint, Pixyll, Whitey, Gothic*)

## 5. Blocs de Code (CodeMirror 6)

\`\`\`rust
// Module natif Rust dans src-tauri/src/github_updater.rs
pub async fn check_github_updates(repo: Option<String>) -> Result<UpdateCheckResult, String> {
    println!("Vérification instantanée de la dernière release GitHub...");
    Ok(UpdateCheckResult::default())
}
\`\`\`

## 6. Diagrammes Textuels Live (SVG)

\`\`\`mermaid
flowchart LR
    A["Saisie Markdown"] --> B["AST & Live Token Reveal"]
    B --> C["Rendu WYSIWYM 120 FPS"]
    B --> D["Export PDF / Pandoc"]
\`\`\`

\`\`\`sequence
Title: Flux d'Auto-Update GitHub
Cursiv App->GitHub API: GET /repos/djael-ml/cursiv/releases/latest
Note right of GitHub API: Vérifie SemVer & SHA main
GitHub API-->Cursiv App: JSON Release + Asset binaire
Cursiv App->>Utilisateur: Notification non-intrusive
\`\`\`

\`\`\`flow
st=>start: Ouverture Document
op=>operation: Analyse WYSIWYM & KaTeX
cond=>condition: Export requis ?
e=>end: Sauvegarde Instantanée
st->op->cond
cond(yes)->e
cond(no)->op
\`\`\`

## 7. Notes de Bas de Page & Images

Vous pouvez insérer des notes de bas de page interactives avec aperçu au survol[^1] ainsi que redimensionner visuellement vos images.

[^1]: Voici le contenu détaillé de la note de bas de page n°1 dans **Cursiv**.
`;

function getVirtualFiles(): Record<string, { content: string; modified_ms: number }> {
  try {
    const raw = localStorage.getItem(VIRTUAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  const initial: Record<string, { content: string; modified_ms: number }> = {
    '/Workspace/Bienvenue sur Cursiv.md': {
      content: DEFAULT_WELCOME_MARKDOWN,
      modified_ms: Date.now(),
    },
    '/Workspace/Notes Scientifiques & Chimie.md': {
      content: `# Notes Scientifiques : Physique Quantique & Chimie\n\n## Réactions Chimiques (mhchem)\n\nL'oxydation complète du méthane s'écrit $\\ce{CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)}$ et l'équilibre acido-basique :\n\n$$\n\\ce{H2CO3(aq) + H2O(l) <=> HCO3^-(aq) + H3O^+(aq)} \\label{eq:chem}\n$$\n\n## Équations de Maxwell\n\n$$\n\\begin{aligned}\n\\div \\vb{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\\n\\curl \\vb{B} &= \\mu_0 \\vb{J} + \\mu_0 \\varepsilon_0 \\pdv{\\vb{E}}{t}\n\\end{aligned}\n$$\n`,
      modified_ms: Date.now() - 3600_000,
    },
    '/Workspace/Architecture & Diagrammes.md': {
      content: `# Architecture & Diagrammes Vectoriels\n\n> [!NOTE] Thèmes de Diagrammes de Séquence\n> Basculez sur le thème **Newsprint** pour voir automatiquement le diagramme de séquence passer en style dessiné à la main (\`--sequence-theme: hand\`).\n\n\`\`\`sequence\nTitle: Synchronisation Temps Réel\nÉditeur WYSIWYM->Watcher Rust: Modification Fichier (.md)\nWatcher Rust-->Sidebar Outline: Mise à jour TOC & Word Count\n\`\`\`\n`,
      modified_ms: Date.now() - 7200_000,
    },
  };
  localStorage.setItem(VIRTUAL_STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveVirtualFiles(files: Record<string, { content: string; modified_ms: number }>) {
  try {
    localStorage.setItem(VIRTUAL_STORAGE_KEY, JSON.stringify(files));
  } catch {
    // ignore quota errors
  }
}

export async function listWorkspaceFiles(
  rootPath: string,
  includeHidden: boolean,
  includeNonMarkdown: boolean
): Promise<FileEntryNode[]> {
  if (isTauriEnvironment() && !rootPath.startsWith('/Workspace')) {
    return invoke<FileEntryNode[]>('list_workspace_files', {
      rootPath,
      includeHidden,
      includeNonMarkdown,
    });
  }

  const vfs = getVirtualFiles();
  return Object.entries(vfs).map(([path, data]) => {
    const name = path.split('/').pop() || path;
    const firstLines = data.content
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('---') && !l.trim().startsWith('#'))
      .slice(0, 2)
      .join(' · ')
      .slice(0, 140);
    return {
      name,
      path,
      is_dir: false,
      modified_ms: data.modified_ms,
      size: data.content.length,
      excerpt: firstLines || 'Document Markdown Cursiv',
    };
  });
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauriEnvironment() && !path.startsWith('/Workspace')) {
    return invoke<string>('read_text_file', { path });
  }
  const vfs = getVirtualFiles();
  return vfs[path]?.content ?? DEFAULT_WELCOME_MARKDOWN;
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  if (isTauriEnvironment() && !path.startsWith('/Workspace')) {
    await invoke('write_text_file', { path, content });
    return;
  }
  const vfs = getVirtualFiles();
  vfs[path] = { content, modified_ms: Date.now() };
  saveVirtualFiles(vfs);
}

export async function createFileOrDir(path: string, isDir: boolean): Promise<void> {
  const titleName = path.split('/').pop()?.replace(/\.md$/i, '') || 'Nouvelle Note';
  const starterMarkdown = `# ${titleName}\n\n`;
  if (isTauriEnvironment() && !path.startsWith('/Workspace')) {
    await invoke('create_file_or_dir', { path, isDir });
    if (!isDir) {
      await invoke('write_text_file', { path, content: starterMarkdown });
    }
    return;
  }
  if (!isDir) {
    const vfs = getVirtualFiles();
    vfs[path] = { content: starterMarkdown, modified_ms: Date.now() };
    saveVirtualFiles(vfs);
  }
}

export async function renameFilePath(oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return;
  if (isTauriEnvironment() && !oldPath.startsWith('/Workspace')) {
    await invoke('rename_path', { oldPath, newPath });
    return;
  }
  const vfs = getVirtualFiles();
  if (vfs[newPath]) {
    throw new Error(`Un fichier nommé "${newPath.split('/').pop()}" existe déjà.`);
  }
  if (vfs[oldPath]) {
    vfs[newPath] = { ...vfs[oldPath], modified_ms: Date.now() };
    delete vfs[oldPath];
    saveVirtualFiles(vfs);
  }
}

export async function duplicateFilePath(path: string): Promise<string> {
  if (isTauriEnvironment() && !path.startsWith('/Workspace')) {
    return invoke<string>('duplicate_file', { path });
  }
  const vfs = getVirtualFiles();
  const copyPath = path.replace(/(\.md)?$/i, ' (Copie).md');
  vfs[copyPath] = {
    content: vfs[path]?.content || '',
    modified_ms: Date.now(),
  };
  saveVirtualFiles(vfs);
  return copyPath;
}

export async function deleteFilePath(path: string): Promise<void> {
  if (isTauriEnvironment() && !path.startsWith('/Workspace')) {
    await invoke('delete_path', { path });
    return;
  }
  const vfs = getVirtualFiles();
  delete vfs[path];
  saveVirtualFiles(vfs);
}

export async function copyImageToLocalAssets(
  docPath: string,
  imageName: string,
  base64Data: string
): Promise<string> {
  if (isTauriEnvironment() && !docPath.startsWith('/Workspace')) {
    return invoke<string>('copy_image_to_assets', {
      docPath,
      imageName,
      base64Data,
    });
  }
  return base64Data;
}

export async function checkGitHubUpdates(repoOverride?: string): Promise<UpdateCheckResult> {
  const repo = repoOverride?.trim() || 'djael-ml/cursiv';

  if (isTauriEnvironment()) {
    // 1. Primary Engine: Tauri v2 Official Updater (@tauri-apps/plugin-updater -> latest.json)
    try {
      const update = await check();
      if (update) {
        cachedNativeUpdate = update;
        return {
          current_version: update.currentVersion || '1.14.0',
          latest_version: update.version.replace(/^v/, ''),
          latest_commit_sha: 'release-signed',
          update_available: true,
          release_notes:
            update.body ||
            'Nouvelle version signée de Cursiv disponible via Tauri Updater.',
          download_url: `https://github.com/${repo}/releases/latest/download/Cursiv-Setup.exe`,
          html_url: `https://github.com/${repo}/releases/latest`,
          published_at: update.date || new Date().toISOString(),
          repo,
          native_updater_available: true,
        };
      }
    } catch {
      // Fallback to direct GitHub Releases API check (github_updater.rs)
      cachedNativeUpdate = null;
    }

    // 2. Fallback Engine: Direct GitHub Releases .exe Inspector (github_updater.rs)
    return invoke<UpdateCheckResult>('check_github_updates', {
      repoOverride: repoOverride || null,
    });
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (resp.ok) {
      const data = await resp.json();
      const latest = (data.tag_name || '1.14.0').replace(/^v/, '');
      const assets: Array<{ name: string; browser_download_url: string }> =
        data.assets || [];
      const exeAsset =
        assets.find((a) => a.name.toLowerCase() === 'cursiv-setup.exe') ||
        assets.find((a) => a.name.toLowerCase().endsWith('-setup.exe')) ||
        assets[0];
      return {
        current_version: '1.14.0',
        latest_version: latest,
        latest_commit_sha: 'main-HEAD',
        update_available: latest !== '1.14.0',
        release_notes: data.body || 'Nouveautés Cursiv & optimisations Rust.',
        download_url:
          exeAsset?.browser_download_url ||
          `https://github.com/${repo}/releases/latest/download/Cursiv-Setup.exe`,
        html_url: data.html_url || `https://github.com/${repo}/releases`,
        published_at: data.published_at || new Date().toISOString(),
        repo,
      };
    }
  } catch {
    // Fallback when offline or repo not yet published
  }

  return {
    current_version: '1.14.0',
    latest_version: '1.14.0',
    latest_commit_sha: 'main',
    update_available: false,
    release_notes: 'Vous utilisez la dernière version stable de Cursiv 1.14.0.',
    download_url: `https://github.com/${repo}/releases/latest/download/Cursiv-Setup.exe`,
    html_url: `https://github.com/${repo}/releases`,
    published_at: new Date().toISOString(),
    repo,
  };
}

export async function downloadAndApplyUpdate(
  downloadUrl: string,
  onProgress?: (percent: number, statusText: string) => void
): Promise<string> {
  if (isTauriEnvironment()) {
    // 1. Primary Engine: @tauri-apps/plugin-updater + @tauri-apps/plugin-process
    try {
      const update = cachedNativeUpdate || (await check());
      if (update) {
        let downloadedBytes = 0;
        let totalBytes = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            totalBytes = event.data.contentLength || 0;
            onProgress?.(5, 'Téléchargement de la mise à jour signée...');
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              const pct = Math.min(98, Math.round((downloadedBytes / totalBytes) * 100));
              onProgress?.(pct, `Téléchargement en cours (${pct}%)...`);
            } else {
              onProgress?.(50, `Téléchargement (${(downloadedBytes / 1024 / 1024).toFixed(1)} Mo)...`);
            }
          } else if (event.event === 'Finished') {
            onProgress?.(100, 'Installation terminée, relance de Cursiv...');
          }
        });
        await relaunch();
        return 'Mise à jour installée via Tauri Updater';
      }
    } catch {
      // Fallback to direct NSIS .exe silent installer (/S)
    }

    // 2. Fallback Engine: Direct GitHub Release .exe Silent Installer (/S)
    onProgress?.(35, "Téléchargement direct de l'installeur Cursiv-Setup.exe...");
    const res = await invoke<string>('download_and_apply_update', { downloadUrl });
    onProgress?.(100, 'Installation silencieuse NSIS (/S) lancée !');
    return res;
  }

  window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  return downloadUrl;
}

export async function detectPandocBinary(customPath?: string): Promise<PandocStatus> {
  if (isTauriEnvironment()) {
    return invoke<PandocStatus>('detect_pandoc', {
      customPath: customPath || null,
    });
  }
  return {
    available: false,
    version: null,
    binary_path: customPath || 'pandoc',
  };
}

export async function runPandocExport(params: {
  markdownContent: string;
  outputPath: string;
  format: string;
  customPandocPath?: string;
  extraArgs?: string[];
}): Promise<string> {
  if (isTauriEnvironment()) {
    return invoke<string>('pandoc_export', {
      req: {
        markdown_content: params.markdownContent,
        output_path: params.outputPath,
        format: params.format,
        custom_pandoc_path: params.customPandocPath || null,
        extra_args: params.extraArgs || [],
      },
    });
  }
  throw new Error('Pandoc subprocess execution requires the native Tauri desktop runtime.');
}

export async function runPandocImport(
  inputPath: string,
  customPandocPath?: string
): Promise<string> {
  if (isTauriEnvironment()) {
    return invoke<string>('pandoc_import', {
      req: {
        input_path: inputPath,
        custom_pandoc_path: customPandocPath || null,
      },
    });
  }
  throw new Error('Pandoc import requires the native Tauri desktop runtime.');
}

export async function subscribeDirectoryWatch(
  path: string,
  channel: string,
  callback: (payload: { kind: string; paths: string[] }) => void
): Promise<() => void> {
  if (!isTauriEnvironment() || path.startsWith('/Workspace')) {
    return () => {};
  }
  await invoke('watch_directory', { path, eventChannel: channel });
  const unlisten = await listen<{ kind: string; paths: string[] }>(channel, (event) => {
    callback(event.payload);
  });
  return unlisten;
}
