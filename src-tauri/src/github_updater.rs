use crate::logger::{get_cursiv_temp_dir, write_log};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
        .user_agent("Cursiv-Desktop-Updater/1.18.2")
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
                    .unwrap_or_else(|| "Mise à jour Cursiv disponible.".to_string()),
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

    write_log(
        "INFO",
        "rust::updater",
        &format!("Démarrage du téléchargement de la mise à jour depuis {}", download_url),
    );

    let client = reqwest::Client::builder()
        .user_agent("Cursiv-Desktop-Updater/1.18.2")
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

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256_hex = format!("{:x}", hasher.finalize());

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let raw_name = download_url
        .split('/')
        .next_back()
        .filter(|n| !n.is_empty())
        .unwrap_or("Cursiv-Setup.exe");

    let is_msi = raw_name.to_lowercase().ends_with(".msi");
    let ext = if is_msi { "msi" } else { "exe" };

    let unique_filename = format!("Cursiv-Setup-{}.{}", timestamp, ext);
    let temp_dir: PathBuf = get_cursiv_temp_dir();
    let target_path: PathBuf = temp_dir.join(&unique_filename);

    write_log(
        "INFO",
        "rust::updater",
        &format!(
            "Téléchargement terminé ({} octets, SHA256={}). Écriture vers {}",
            bytes.len(),
            &sha256_hex[..12],
            target_path.to_string_lossy()
        ),
    );

    fs::write(&target_path, &bytes)
        .map_err(|e| format!("Failed to write update payload: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        if !is_msi {
            let current_pid = std::process::id();
            let current_exe = env::current_exe()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let log_file_path = temp_dir.join("cursiv.log");
            let runner_ps1_path = temp_dir.join(format!("cursiv-update-runner-{}.ps1", timestamp));

            let ps_escape = |s: &str| s.replace('\'', "''");
            let ps_script = format!(
                r#"$ErrorActionPreference = 'SilentlyContinue'
$logFile = '{log_file}'
$installerPath = '{installer}'
$oldPid = {pid}
$savedExePath = '{saved_exe}'

function Write-UpdaterLog([string]$msg) {{
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')
    Add-Content -Path $logFile -Value "[$ts] [INFO] [updater-runner] $msg" -Encoding UTF8
}}

Write-UpdaterLog "Démarrage du runner de mise à jour et relance automatique (PID=$oldPid)"

for ($i = 0; $i -lt 30; $i++) {{
    $p = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if (-not $p) {{ break }}
    Start-Sleep -Milliseconds 150
}}

$stillAlive = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
if ($stillAlive) {{
    Write-UpdaterLog "Arrêt forcé de l'instance précédente (PID=$oldPid)"
    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 350
}}

Write-UpdaterLog "Exécution silencieuse de l'installeur NSIS : $installerPath /S"
$nsisProc = Start-Process -FilePath $installerPath -ArgumentList '/S' -PassThru -WindowStyle Hidden
if ($nsisProc) {{
    $nsisProc.WaitForExit()
    Write-UpdaterLog "Installation NSIS terminée (Code=$($nsisProc.ExitCode))"
}} else {{
    Write-UpdaterLog "Fallback cmd /c pour l'installeur NSIS"
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"`"$installerPath`" /S`"" -Wait -WindowStyle Hidden
}}

Start-Sleep -Milliseconds 600

$candidates = @(
    $savedExePath,
    "$env:LOCALAPPDATA\Programs\Cursiv\Cursiv.exe",
    "$env:LOCALAPPDATA\Programs\Cursiv\cursiv.exe",
    "$env:LOCALAPPDATA\Programs\cursiv\Cursiv.exe",
    "$env:LOCALAPPDATA\Cursiv\Cursiv.exe",
    "$env:LOCALAPPDATA\cursiv\Cursiv.exe",
    "$env:ProgramFiles\Cursiv\Cursiv.exe"
)

$exeToLaunch = $null
foreach ($cand in $candidates) {{
    if (-not [string]::IsNullOrWhiteSpace($cand) -and (Test-Path -LiteralPath $cand)) {{
        $exeToLaunch = $cand
        break
    }}
}}

if (-not $exeToLaunch) {{
    $found = Get-ChildItem -Path "$env:LOCALAPPDATA" -Filter 'Cursiv.exe' -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {{ $exeToLaunch = $found.FullName }}
}}

$alreadyRunning = Get-Process -Name 'Cursiv', 'cursiv' -ErrorAction SilentlyContinue
if (-not $alreadyRunning -and $exeToLaunch) {{
    $workDir = Split-Path -Parent $exeToLaunch
    Write-UpdaterLog "Relance automatique de Cursiv : $exeToLaunch"
    Start-Process -FilePath $exeToLaunch -WorkingDirectory $workDir -WindowStyle Normal
}} elseif ($alreadyRunning) {{
    Write-UpdaterLog "Cursiv est déjà en cours d'exécution après la mise à jour."
}} else {{
    Write-UpdaterLog "ERREUR : Impossible de localiser Cursiv.exe pour la relance automatique."
}}

Start-Sleep -Seconds 2
Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
"#,
                log_file = ps_escape(&log_file_path.to_string_lossy()),
                installer = ps_escape(&target_path.to_string_lossy()),
                pid = current_pid,
                saved_exe = ps_escape(&current_exe),
            );

            let mut ps_bytes = vec![0xEF, 0xBB, 0xBF];
            ps_bytes.extend_from_slice(ps_script.as_bytes());
            fs::write(&runner_ps1_path, &ps_bytes)
                .map_err(|e| format!("Failed to write updater runner script: {}", e))?;

            let spawn_res = Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-WindowStyle",
                    "Hidden",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    &runner_ps1_path.to_string_lossy(),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();

            if let Err(ps_err) = spawn_res {
                write_log(
                    "WARN",
                    "rust::updater",
                    &format!("PowerShell runner indisponible ({}), fallback cmd.exe", ps_err),
                );
                let fallback_exe = if !current_exe.is_empty() {
                    current_exe.clone()
                } else {
                    r#"%LOCALAPPDATA%\Programs\Cursiv\Cursiv.exe"#.to_string()
                };
                let cmd_line = format!(
                    r#"timeout /t 1 /nobreak >nul & start "" /wait "{}" /S & start "" "{}""#,
                    target_path.to_string_lossy(),
                    fallback_exe
                );
                Command::new("cmd")
                    .args(["/C", &cmd_line])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .map_err(|e| format!("Failed to launch update fallback runner: {}", e))?;
            } else {
                write_log(
                    "INFO",
                    "rust::updater",
                    &format!(
                        "Runner de mise à jour lancé ({}) — fermeture de Cursiv (PID={}) pour installation et relance automatique",
                        runner_ps1_path.to_string_lossy(),
                        current_pid
                    ),
                );
            }

            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(500));
                std::process::exit(0);
            });
        } else {
            Command::new("msiexec")
                .arg("/i")
                .arg(&target_path)
                .arg("/passive")
                .spawn()
                .map_err(|e| format!("Failed to launch Windows MSI installer: {}", e))?;
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
