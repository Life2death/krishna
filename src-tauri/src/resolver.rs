use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ResolvedApp {
    pub display_name: String,
    pub target: String,
    pub resolved_via: String,
    pub confidence: f64,
}

fn normalize_name(name: &str) -> String {
    name.trim().to_lowercase()
}

/// Tries to resolve an app name to an executable path via the Windows Registry App Paths.
/// Reads HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths.
#[cfg(target_os = "windows")]
fn resolve_via_app_paths(name: &str) -> Option<ResolvedApp> {
    use windows_registry::*;

    let clean = normalize_name(name);
    let exe_name = if clean.ends_with(".exe") {
        clean.clone()
    } else {
        format!("{}.exe", clean)
    };

    let bases = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths",
    ];

    let hives: [&Key; 2] = [LOCAL_MACHINE, CURRENT_USER];

    for base in &bases {
        let key_path = format!(r"{}\{}", base, exe_name);
        for hive in &hives {
            if let Ok(key) = hive.open(&key_path) {
                if let Ok(val) = key.get_value("") {
                    if let Ok(s) = String::try_from(val) {
                        let resolved = s.trim_matches('"').to_string();
                        if Path::new(&resolved).exists() {
                            let display = Path::new(&resolved)
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or(&clean)
                                .to_string();
                            return Some(ResolvedApp {
                                display_name: display,
                                target: resolved,
                                resolved_via: "registry".into(),
                                confidence: 0.9,
                            });
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn resolve_via_app_paths(_name: &str) -> Option<ResolvedApp> {
    None
}

/// Searches Start Menu directories for .lnk files matching the app name.
/// Returns the .lnk path directly (opener plugin can launch it).
#[cfg(target_os = "windows")]
fn resolve_via_start_menu(name: &str) -> Option<ResolvedApp> {
    let clean = normalize_name(name);
    let search_dirs = get_start_menu_dirs();

    for dir in &search_dirs {
        if !Path::new(dir).exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
                    let stem = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if fuzzy_match(&clean, &stem) {
                        return Some(ResolvedApp {
                            display_name: stem,
                            target: path.to_string_lossy().into_owned(),
                            resolved_via: "startmenu".into(),
                            confidence: 0.85,
                        });
                    }
                }
                // Recurse one level deep for subfolders
                if path.is_dir() {
                    if let Ok(sub_entries) = std::fs::read_dir(&path) {
                        for sub in sub_entries.flatten() {
                            let sub_path = sub.path();
                            if sub_path.extension().and_then(|s| s.to_str()) == Some("lnk") {
                                let stem = sub_path
                                    .file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("")
                                    .to_lowercase();
                                if fuzzy_match(&clean, &stem) {
                                    return Some(ResolvedApp {
                                        display_name: stem,
                                        target: sub_path.to_string_lossy().into_owned(),
                                        resolved_via: "startmenu".into(),
                                        confidence: 0.85,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_start_menu_dirs() -> Vec<String> {
    let mut dirs = Vec::new();
    if let Ok(progdata) = std::env::var("ProgramData") {
        dirs.push(format!(
            r"{}\Microsoft\Windows\Start Menu\Programs",
            progdata
        ));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        dirs.push(format!(
            r"{}\Microsoft\Windows\Start Menu\Programs",
            appdata
        ));
    }
    dirs
}

#[cfg(not(target_os = "windows"))]
fn resolve_via_start_menu(_name: &str) -> Option<ResolvedApp> {
    None
}

fn fuzzy_match(query: &str, candidate: &str) -> bool {
    if candidate == query {
        return true;
    }
    // Check if query is a substring of candidate or vice versa
    if candidate.contains(query) || query.contains(candidate) {
        return true;
    }
    // Check word boundaries
    let query_words: Vec<&str> = query.split_whitespace().collect();
    let candidate_words: Vec<&str> = candidate.split_whitespace().collect();
    for qw in &query_words {
        for cw in &candidate_words {
            if cw.contains(qw) || qw.contains(cw) {
                return true;
            }
        }
    }
    false
}

/// Resolves via PATH using `where` command on Windows, `which` on Unix.
fn resolve_via_path(name: &str) -> Option<ResolvedApp> {
    let clean = normalize_name(name);
    let exe_name = if clean.ends_with(".exe") {
        clean.clone()
    } else {
        format!("{}.exe", clean)
    };

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("where")
            .arg(&exe_name)
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_path = stdout.lines().next()?.trim().to_string();
                if Path::new(&first_path).exists() {
                    let display = Path::new(&first_path)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&clean)
                        .to_string();
                    return Some(ResolvedApp {
                        display_name: display,
                        target: first_path,
                        resolved_via: "path".into(),
                        confidence: 0.8,
                    });
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = std::process::Command::new("which")
            .arg(&clean)
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()?
                    .trim()
                    .to_string();
                if Path::new(&path).exists() {
                    return Some(ResolvedApp {
                        display_name: clean.clone(),
                        target: path,
                        resolved_via: "path".into(),
                        confidence: 0.8,
                    });
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn resolve_app(name: String) -> Option<ResolvedApp> {
    // Try each tier in order, return best match
    if let Some(app) = resolve_via_app_paths(&name) {
        return Some(app);
    }
    if let Some(app) = resolve_via_start_menu(&name) {
        return Some(app);
    }
    if let Some(app) = resolve_via_path(&name) {
        return Some(app);
    }
    None
}

#[tauri::command]
pub fn verify_target(path: String) -> bool {
    Path::new(&path).exists()
}
