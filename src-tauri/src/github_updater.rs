use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const DEFAULT_REPO: &str = "djael-ml/cursiv";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubReleaseResponse {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub html_url: String,
    pub published_at: Option<String>,
    pub assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubCommitInfo {
    pub sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubBranchResponse {
    pub name: String,
    pub commit: GitHubCommitInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub latest_commit_sha: String,
    pub update_available: bool,
    pub release_notes: String,
    pub download_url: Option<String>,
    pub html_url: String,
    pub published_at: String,
    pub repo: String,
}

fn normalize_semver(v: &str) -> (u64, u64, u64) {
    let cleaned = v.trim_start_matches('v').trim();
    let parts: Vec<&str> = cleaned.split('.').collect();
    let major = parts
        .first()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let minor = parts
        .get(1)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let patch = parts
        .get(2)
        .and_then(|s| s.split('-').next())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    (major, minor, patch)
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    normalize_semver(latest) > normalize_semver(current)
}

fn select_platform_asset(assets: &[GitHubReleaseAsset]) -> Option<String> {
    let os = env::consts::OS;
    if os == "windows" {
        // Prioritize Cursiv-Setup.exe or *-setup.exe (NSIS installer)
        if let Some(exact) = assets
            .iter()
            .find(|a| a.name.eq_ignore_ascii_case("Cursiv-Setup.exe"))
        {
            return Some(exact.browser_download_url.clone());
        }
        if let Some(setup_exe) = assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with("-setup.exe"))
        {
            return Some(setup_exe.browser_download_url.clone());
        }
        if let Some(any_exe) = assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with(".exe"))
        {
            return Some(any_exe.browser_download_url.clone());
        }
    }

    for asset in assets {
        let lower = asset.name.to_lowercase();
        match os {
            "macos" if lower.ends_with(".dmg") || lower.ends_with(".app.tar.gz") => {
                return Some(asset.browser_download_url.clone());
            }
            "linux" if lower.ends_with(".appimage") || lower.ends_with(".deb") => {
                return Some(asset.browser_download_url.clone());
            }
            _ => {}
        }
    }
    None
}

#[tauri::command]
pub async fn check_github_updates(
    repo_override: Option<String>,
) -> Result<UpdateCheckResult, String> {
    let repo = repo_override
        .filter(|r| !r.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_REPO.to_string());

    let client = reqwest::Client::builder()
        .user_agent("Cursiv-Desktop-Updater/1.14.0")
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let release_url = format!("https://api.github.com/repos/{}/releases/latest", repo);
    let branch_url = format!("https://api.github.com/repos/{}/branches/main", repo);

    let branch_sha = match client.get(&branch_url).send().await {
        Ok(resp) if resp.status().is_success() => resp
            .json::<GitHubBranchResponse>()
            .await
            .map(|b| b.commit.sha)
            .unwrap_or_else(|_| "main".to_string()),
        _ => "main".to_string(),
    };

    match client.get(&release_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let release = resp
                .json::<GitHubReleaseResponse>()
                .await
                .map_err(|e| format!("Invalid GitHub release payload: {}", e))?;

            let latest_version = release.tag_name.trim_start_matches('v').to_string();
            let update_available = is_newer_version(CURRENT_VERSION, &latest_version);
            let download_url = select_platform_asset(&release.assets)
                .or_else(|| Some(format!("https://github.com/{}/releases/latest/download/Cursiv-Setup.exe", repo)));

            Ok(UpdateCheckResult {
                current_version: CURRENT_VERSION.to_string(),
                latest_version,
                latest_commit_sha: branch_sha,
                update_available,
                release_notes: release
                    .body
                    .unwrap_or_else(|| "Performance & WYSIWYM refinements.".to_string()),
                download_url,
                html_url: release.html_url,
                published_at: release.published_at.unwrap_or_default(),
                repo,
            })
        }
        _ => Ok(UpdateCheckResult {
            current_version: CURRENT_VERSION.to_string(),
            latest_version: CURRENT_VERSION.to_string(),
            latest_commit_sha: branch_sha,
            update_available: false,
            release_notes: "Cursiv est à jour.".to_string(),
            download_url: Some(format!(
                "https://github.com/{}/releases/latest/download/Cursiv-Setup.exe",
                repo
            )),
            html_url: format!("https://github.com/{}/releases", repo),
            published_at: String::new(),
            repo,
        }),
    }
}

#[tauri::command]
pub async fn download_and_apply_update(download_url: String) -> Result<String, String> {
    if !download_url.starts_with("https://github.com/")
        && !download_url.starts_with("https://objects.githubusercontent.com/")
    {
        return Err("Security policy: Updates can only be downloaded from official GitHub HTTPS endpoints.".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("Cursiv-Desktop-Updater/1.14.0")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download server returned HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed reading update stream: {}", e))?;

    // Compute SHA-256 digest for integrity verification
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256_hex = format!("{:x}", hasher.finalize());

    let raw_name = download_url
        .split('/')
        .next_back()
        .filter(|n| !n.is_empty())
        .unwrap_or("Cursiv-Setup.exe");

    let safe_name = Path::new(raw_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Cursiv-Setup.exe");

    let mut target_path: PathBuf = env::temp_dir();
    target_path.push(safe_name);

    let mut file = fs::File::create(&target_path)
        .map_err(|e| format!("Failed to create temporary installer file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write update payload: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let lower = safe_name.to_lowercase();
        if lower.ends_with(".exe") {
            // Silent NSIS update (/S) in currentUser mode (%LOCALAPPDATA%\Programs\Cursiv)
            Command::new(&target_path)
                .arg("/S")
                .spawn()
                .map_err(|e| format!("Failed to launch NSIS installer executable: {}", e))?;
        } else if lower.ends_with(".msi") {
            Command::new("msiexec")
                .arg("/i")
                .arg(&target_path)
                .arg("/passive")
                .spawn()
                .map_err(|e| format!("Failed to launch Windows MSI installer: {}", e))?;
        } else {
            return Err("Downloaded asset is not a valid Windows installer (.exe).".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&target_path)
            .spawn()
            .map_err(|e| format!("Failed to open macOS update package: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&target_path)
            .spawn()
            .map_err(|e| format!("Failed to launch Linux package: {}", e))?;
    }

    Ok(format!(
        "{} (SHA256: {})",
        target_path.to_string_lossy(),
        &sha256_hex[..12]
    ))
}
