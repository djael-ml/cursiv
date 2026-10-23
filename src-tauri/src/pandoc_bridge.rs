use crate::validate_safe_path;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PandocStatus {
    pub available: bool,
    pub version: Option<String>,
    pub binary_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PandocExportRequest {
    pub markdown_content: String,
    pub output_path: String,
    pub format: String,
    pub custom_pandoc_path: Option<String>,
    pub extra_args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PandocImportRequest {
    pub input_path: String,
    pub custom_pandoc_path: Option<String>,
}

const ALLOWED_EXPORT_FORMATS: &[&str] = &[
    "docx",
    "odt",
    "latex",
    "epub",
    "mediawiki",
    "rtf",
    "rst",
    "html",
];

const ALLOWED_EXTRA_FLAGS: &[&str] = &[
    "--toc",
    "--standalone",
    "--number-sections",
    "--mathjax",
    "--katex",
];

/// Validates that the Pandoc binary is either the system `pandoc` or an explicit `pandoc` executable.
fn resolve_safe_pandoc_binary(custom: Option<String>) -> Result<String, String> {
    let Some(raw) = custom.filter(|s| !s.trim().is_empty()) else {
        return Ok("pandoc".to_string());
    };
    let path = validate_safe_path(&raw)?;
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if file_name != "pandoc" && file_name != "pandoc.exe" {
        return Err(
            "Security error: custom Pandoc path must point to 'pandoc' or 'pandoc.exe'."
                .to_string(),
        );
    }
    Ok(raw)
}

#[tauri::command]
pub fn detect_pandoc(custom_path: Option<String>) -> PandocStatus {
    let Ok(bin) = resolve_safe_pandoc_binary(custom_path) else {
        return PandocStatus {
            available: false,
            version: None,
            binary_path: "pandoc".to_string(),
        };
    };
    match Command::new(&bin).arg("--version").output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let first_line = stdout.lines().next().unwrap_or("pandoc").to_string();
            PandocStatus {
                available: true,
                version: Some(first_line),
                binary_path: bin,
            }
        }
        _ => PandocStatus {
            available: false,
            version: None,
            binary_path: bin,
        },
    }
}

#[tauri::command]
pub fn pandoc_export(req: PandocExportRequest) -> Result<String, String> {
    let bin = resolve_safe_pandoc_binary(req.custom_pandoc_path)?;
    let safe_out = validate_safe_path(&req.output_path)?;

    if !ALLOWED_EXPORT_FORMATS.contains(&req.format.as_str()) {
        return Err(format!("Unsupported Pandoc target format: {}", req.format));
    }

    let mut temp_input = std::env::temp_dir();
    temp_input.push("cursiv_export_source.md");
    std::fs::write(&temp_input, &req.markdown_content)
        .map_err(|e| format!("Failed writing temporary markdown source: {}", e))?;

    let mut cmd = Command::new(&bin);
    cmd.arg(&temp_input)
        .arg("-f")
        .arg("markdown+tex_math_dollars+pipe_tables+strikeout+task_lists+footnotes+yaml_metadata_block")
        .arg("-t")
        .arg(&req.format)
        .arg("-s")
        .arg("-o")
        .arg(&safe_out);

    if let Some(parent) = safe_out.parent() {
        if parent.as_os_str().len() > 0 {
            cmd.arg(format!("--resource-path={}", parent.to_string_lossy()));
        }
    }

    for arg in &req.extra_args {
        if ALLOWED_EXTRA_FLAGS.contains(&arg.as_str()) {
            cmd.arg(arg);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute Pandoc ('{}'): {}", bin, e))?;

    if output.status.success() {
        Ok(safe_out.to_string_lossy().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Pandoc export failed: {}", stderr))
    }
}

#[tauri::command]
pub fn pandoc_import(req: PandocImportRequest) -> Result<String, String> {
    let bin = resolve_safe_pandoc_binary(req.custom_pandoc_path)?;
    let safe_in = validate_safe_path(&req.input_path)?;
    if !Path::new(&safe_in).exists() {
        return Err(format!("Input file does not exist: {}", req.input_path));
    }

    let output = Command::new(&bin)
        .arg(&safe_in)
        .arg("-t")
        .arg("gfm+tex_math_dollars+footnotes")
        .arg("--wrap=none")
        .output()
        .map_err(|e| format!("Failed to execute Pandoc ('{}'): {}", bin, e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Pandoc import failed: {}", stderr))
    }
}
