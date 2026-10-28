pub mod github_updater;
pub mod logger;
pub mod pandoc_bridge;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use logger::{init_logger_and_panic_hook, write_log};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct WatcherState {
    pub workspace_watcher: Mutex<Option<RecommendedWatcher>>,
    pub theme_watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntryNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified_ms: u64,
    pub size: u64,
    pub excerpt: Option<String>,
    pub children: Option<Vec<FileEntryNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsWatchEvent {
    pub kind: String,
    pub paths: Vec<String>,
}

/// Validates that a user-provided path does not contain parent directory traversal (`..`)
/// and resolves cleanly.
pub fn validate_safe_path(raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Empty file path is not allowed.".to_string());
    }
    let path = Path::new(trimmed);
    for comp in path.components() {
        if matches!(comp, Component::ParentDir) {
            return Err(format!(
                "Path traversal ('..') is forbidden for security reasons: {}",
                raw_path
            ));
        }
    }
    Ok(path.to_path_buf())
}

fn decode_bytes_to_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).to_string();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) && bytes.len() >= 2 {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) && bytes.len() >= 2 {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s);
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    }
}

fn is_supported_text_or_code_ext(ext: &str) -> bool {
    matches!(
        ext,
        "md" | "markdown"
            | "mdown"
            | "mkd"
            | "mdx"
            | "txt"
            | "text"
            | "log"
            | "note"
            | "rst"
            | "adoc"
            | "asciidoc"
            | "org"
            | "tex"
            | "bib"
            | "csv"
            | "tsv"
            | "json"
            | "jsonc"
            | "jsonl"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "cfg"
            | "conf"
            | "env"
            | "properties"
            | "xml"
            | "plist"
            | "svg"
            | "html"
            | "htm"
            | "xhtml"
            | "css"
            | "scss"
            | "sass"
            | "less"
            | "js"
            | "mjs"
            | "cjs"
            | "jsx"
            | "ts"
            | "mts"
            | "cts"
            | "tsx"
            | "py"
            | "pyw"
            | "pyi"
            | "rs"
            | "go"
            | "c"
            | "h"
            | "cpp"
            | "hpp"
            | "cc"
            | "cxx"
            | "cs"
            | "java"
            | "kt"
            | "kts"
            | "swift"
            | "php"
            | "rb"
            | "lua"
            | "pl"
            | "r"
            | "sql"
            | "sh"
            | "bash"
            | "zsh"
            | "fish"
            | "ps1"
            | "bat"
            | "cmd"
            | "dockerfile"
            | "makefile"
            | "cmake"
            | "gradle"
            | "vue"
            | "svelte"
            | "astro"
            | "graphql"
            | "gql"
            | "proto"
            | "prisma"
            | "tf"
            | "hcl"
            | "nix"
            | "zig"
            | "dart"
            | "ex"
            | "exs"
            | "erl"
            | "hs"
            | "clj"
            | "scala"
    )
}

fn is_supported_image_ext(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "avif"
    )
}

fn read_text_excerpt(path: &Path, size: u64) -> Option<String> {
    if size > 512 * 1024 {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let content = decode_bytes_to_text(&bytes);
    let mut lines = Vec::new();
    let mut in_yaml = false;
    for (idx, line) in content.lines().enumerate() {
        if idx == 0 && line.trim() == "---" {
            in_yaml = true;
            continue;
        }
        if in_yaml {
            if line.trim() == "---" || line.trim() == "..." {
                in_yaml = false;
            }
            continue;
        }
        let trimmed = line.trim().trim_start_matches('#').trim();
        if !trimmed.is_empty() {
            lines.push(trimmed.to_string());
        }
        if lines.len() >= 2 {
            break;
        }
    }
    Some(lines.join(" · ").chars().take(160).collect())
}

fn scan_dir_recursive(
    dir: &Path,
    include_hidden: bool,
    include_non_markdown: bool,
    depth: usize,
) -> Vec<FileEntryNode> {
    if depth > 8 {
        return Vec::new();
    }
    let mut nodes = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return nodes;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if !include_hidden && name.starts_with('.') {
            continue;
        }
        if name == "node_modules" || name == "target" || name == ".git" || name == "dist" {
            continue;
        }

        let Ok(meta) = entry.metadata() else {
            continue;
        };

        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        if meta.is_dir() {
            let children =
                scan_dir_recursive(&path, include_hidden, include_non_markdown, depth + 1);
            nodes.push(FileEntryNode {
                name,
                path: path.to_string_lossy().replace('\\', "/"),
                is_dir: true,
                modified_ms,
                size: 0,
                excerpt: None,
                children: Some(children),
            });
        } else {
            let lower = name.to_lowercase();
            let ext = Path::new(&lower)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let is_md = matches!(ext, "md" | "markdown" | "mdown" | "mkd" | "mdx");
            let is_text_or_code = is_supported_text_or_code_ext(ext)
                || matches!(
                    lower.as_str(),
                    "dockerfile"
                        | "makefile"
                        | "license"
                        | "readme"
                        | "changelog"
                        | ".gitignore"
                        | ".env"
                        | ".editorconfig"
                );
            let is_image = is_supported_image_ext(ext);

            if !include_non_markdown && !is_md && !is_text_or_code && !is_image {
                continue;
            }

            let excerpt = if is_text_or_code {
                read_text_excerpt(&path, meta.len())
            } else {
                None
            };
            nodes.push(FileEntryNode {
                name,
                path: path.to_string_lossy().replace('\\', "/"),
                is_dir: false,
                modified_ms,
                size: meta.len(),
                excerpt,
                children: None,
            });
        }
    }

    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    nodes
}

#[tauri::command]
fn list_workspace_files(
    root_path: String,
    include_hidden: bool,
    include_non_markdown: bool,
) -> Result<Vec<FileEntryNode>, String> {
    let root = validate_safe_path(&root_path)?;
    if !root.exists() {
        return Err(format!("Directory does not exist: {}", root_path));
    }
    Ok(scan_dir_recursive(
        &root,
        include_hidden,
        include_non_markdown,
        0,
    ))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let safe_path = validate_safe_path(&path)?;
    match fs::read(&safe_path) {
        Ok(bytes) => {
            write_log("INFO", "rust::fs", &format!("read_text_file('{}') ({} octets)", path, bytes.len()));
            Ok(decode_bytes_to_text(&bytes))
        }
        Err(e) => {
            let msg = format!("Failed to read '{}': {}", path, e);
            write_log("ERROR", "rust::fs", &msg);
            Err(msg)
        }
    }
}

#[tauri::command]
fn read_binary_base64(path: String) -> Result<String, String> {
    let safe_path = validate_safe_path(&path)?;
    let bytes =
        fs::read(&safe_path).map_err(|e| format!("Failed to read binary '{}': {}", path, e))?;
    let ext = safe_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let safe_path = validate_safe_path(&path)?;
    if let Some(parent) = safe_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let len = content.len();
    match fs::write(&safe_path, content) {
        Ok(()) => {
            write_log("INFO", "rust::fs", &format!("write_text_file('{}') ({} octets)", path, len));
            Ok(())
        }
        Err(e) => {
            let msg = format!("Failed to write '{}': {}", path, e);
            write_log("ERROR", "rust::fs", &msg);
            Err(msg)
        }
    }
}

#[tauri::command]
fn create_file_or_dir(path: String, is_dir: bool) -> Result<(), String> {
    let target = validate_safe_path(&path)?;
    if target.exists() {
        return Err(format!("Target already exists: {}", path));
    }
    if is_dir {
        fs::create_dir_all(&target).map_err(|e| format!("Failed to create directory: {}", e))
    } else {
        if let Some(parent) = target.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&target, "").map_err(|e| format!("Failed to create file: {}", e))
    }
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let src = validate_safe_path(&old_path)?;
    let dst = validate_safe_path(&new_path)?;
    if dst.exists() && src != dst {
        return Err(format!(
            "A file with the name '{}' already exists.",
            new_path
        ));
    }
    fs::rename(&src, &dst).map_err(|e| format!("Failed to rename: {}", e))
}

#[tauri::command]
fn duplicate_file(path: String) -> Result<String, String> {
    let src = validate_safe_path(&path)?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("copy");
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("md");
    let parent = src.parent().unwrap_or_else(|| Path::new("."));
    let mut counter = 1;
    let mut dest = parent.join(format!("{} (Copie).{}", stem, ext));
    while dest.exists() {
        counter += 1;
        dest = parent.join(format!("{} (Copie {}).{}", stem, counter, ext));
    }
    fs::copy(&src, &dest).map_err(|e| format!("Failed to duplicate file: {}", e))?;
    Ok(dest.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = validate_safe_path(&path)?;
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("Failed to delete folder: {}", e))
    } else {
        fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
fn copy_image_to_assets(
    doc_path: String,
    image_name: String,
    base64_data: String,
) -> Result<String, String> {
    let doc = validate_safe_path(&doc_path)?;
    let doc_dir = doc.parent().unwrap_or_else(|| Path::new("."));
    let doc_stem = doc
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");

    let safe_img_name = Path::new(&image_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image.png");

    let assets_folder_name = format!("{}.assets", doc_stem);
    let assets_dir: PathBuf = doc_dir.join("assets").join(&assets_folder_name);
    fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed creating assets folder: {}", e))?;

    let cleaned_b64 = base64_data.split(',').next_back().unwrap_or(&base64_data);
    let bytes = BASE64
        .decode(cleaned_b64)
        .map_err(|e| format!("Invalid image base64 data: {}", e))?;

    let target_file = assets_dir.join(safe_img_name);
    fs::write(&target_file, bytes).map_err(|e| format!("Failed writing asset image: {}", e))?;

    Ok(format!("./assets/{}/{}", assets_folder_name, safe_img_name))
}

#[tauri::command]
fn watch_directory(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
    event_channel: String,
) -> Result<(), String> {
    let watch_path = validate_safe_path(&path)?;
    if !watch_path.exists() {
        return Err(format!("Cannot watch non-existent directory: {}", path));
    }

    let app_clone = app.clone();
    let channel_clone = event_channel.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .collect();
                let payload = FsWatchEvent {
                    kind: format!("{:?}", event.kind),
                    paths,
                };
                let _ = app_clone.emit(&channel_clone, payload);
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Watcher initialization error: {}", e))?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed watching path '{}': {}", path, e))?;

    if event_channel == "theme-changed" {
        if let Ok(mut guard) = state.theme_watcher.lock() {
            *guard = Some(watcher);
        }
    } else if let Ok(mut guard) = state.workspace_watcher.lock() {
        *guard = Some(watcher);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logger_and_panic_hook();

    tauri::Builder::default()
        .manage(WatcherState {
            workspace_watcher: Mutex::new(None),
            theme_watcher: Mutex::new(None),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            list_workspace_files,
            read_text_file,
            read_binary_base64,
            write_text_file,
            create_file_or_dir,
            rename_path,
            duplicate_file,
            delete_path,
            copy_image_to_assets,
            watch_directory,
            logger::write_app_log,
            logger::get_log_directory_path,
            logger::read_recent_logs,
            logger::open_log_directory,
            github_updater::check_github_updates,
            github_updater::download_and_apply_update,
            pandoc_bridge::detect_pandoc,
            pandoc_bridge::pandoc_export,
            pandoc_bridge::pandoc_import,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Cursiv.");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cursiv Tauri application");
}
