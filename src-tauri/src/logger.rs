use chrono::Local;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());
const MAX_LOG_SIZE_BYTES: u64 = 5 * 1024 * 1024; // 5 MB rolling threshold

/// Returns `%TEMP%\cursiv` (or platform equivalent) and ensures the directory exists.
pub fn get_cursiv_temp_dir() -> PathBuf {
    let dir = env::temp_dir().join("cursiv");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn write_log(level: &str, source: &str, message: &str) {
    let _guard = LOG_WRITE_LOCK.lock().ok();
    let dir = get_cursiv_temp_dir();
    let now = Local::now();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f");
    let date_tag = now.format("%Y-%m-%d");

    let clean_msg = message.replace('\r', "");
    let formatted = format!(
        "[{}] [{:<5}] [{}] {}\n",
        timestamp,
        level.to_uppercase(),
        source,
        clean_msg
    );

    // 1. Main rolling log file: %TEMP%\cursiv\cursiv.log
    let main_log_path = dir.join("cursiv.log");
    if let Ok(meta) = fs::metadata(&main_log_path) {
        if meta.len() > MAX_LOG_SIZE_BYTES {
            let backup_path = dir.join("cursiv.old.log");
            let _ = fs::rename(&main_log_path, backup_path);
        }
    }
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&main_log_path)
    {
        let _ = file.write_all(formatted.as_bytes());
    }

    // 2. Daily session log file: %TEMP%\cursiv\cursiv-YYYY-MM-DD.log
    let daily_log_path = dir.join(format!("cursiv-{}.log", date_tag));
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&daily_log_path)
    {
        let _ = file.write_all(formatted.as_bytes());
    }

    // 3. Dedicated error/crash log file: %TEMP%\cursiv\cursiv-errors.log
    let upper_level = level.to_uppercase();
    if upper_level == "ERROR" || upper_level == "CRASH" || upper_level == "PANIC" {
        let err_log_path = dir.join("cursiv-errors.log");
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&err_log_path)
        {
            let _ = file.write_all(formatted.as_bytes());
        }
    }
}

pub fn init_logger_and_panic_hook() {
    let dir = get_cursiv_temp_dir();
    write_log(
        "INFO",
        " rust::startup",
        &format!(
            "=== Démarrage de Cursiv v{} ({}/{}) | Logs: {} ===",
            env!("CARGO_PKG_VERSION"),
            env::consts::OS,
            env::consts::ARCH,
            dir.to_string_lossy()
        ),
    );

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown-location".to_string());

        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };

        write_log(
            "PANIC",
            "rust::panic_hook",
            &format!("PANIC at {}: {}", location, payload),
        );
        default_hook(panic_info);
    }));
}

#[tauri::command]
pub fn write_app_log(level: String, source: String, message: String) -> Result<(), String> {
    write_log(&level, &source, &message);
    Ok(())
}

#[tauri::command]
pub fn get_log_directory_path() -> Result<String, String> {
    let dir = get_cursiv_temp_dir();
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_recent_logs(max_lines: Option<usize>) -> Result<String, String> {
    let dir = get_cursiv_temp_dir();
    let main_log_path = dir.join("cursiv.log");
    if !main_log_path.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(&main_log_path)
        .map_err(|e| format!("Failed reading log file: {}", e))?;
    let limit = max_lines.unwrap_or(200);
    let all_lines: Vec<&str> = content.lines().collect();
    let start = all_lines.len().saturating_sub(limit);
    Ok(all_lines[start..].join("\n"))
}

#[tauri::command]
pub fn open_log_directory() -> Result<String, String> {
    let dir = get_cursiv_temp_dir();
    let dir_str = dir.to_string_lossy().to_string();
    write_log(
        "INFO",
        "rust::logger",
        &format!("Ouverture du dossier des logs : {}", dir_str),
    );

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer on '{}': {}", dir_str, e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open Finder on '{}': {}", dir_str, e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open file manager on '{}': {}", dir_str, e))?;
    }

    Ok(dir_str)
}
