use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Deserialize)]
struct LocalState {
    profile: Option<ProfileState>,
}

#[derive(Deserialize)]
struct ProfileState {
    info_cache: Option<HashMap<String, ProfileInfo>>,
}

#[derive(Deserialize)]
struct ProfileInfo {
    name: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ChromeProfile {
    pub dir: String,
    pub name: String,
    pub instance: String,
}

fn get_default_user_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var("LOCALAPPDATA")
            .ok()
            .map(|d| PathBuf::from(d).join(r"Google\Chrome\User Data"));
    }
    #[cfg(target_os = "macos")]
    {
        return dirs_home_dir().map(|h| h.join("Library/Application Support/Google/Chrome"));
    }
    #[cfg(target_os = "linux")]
    {
        return dirs_home_dir().map(|h| h.join(".config/google-chrome"));
    }
    // Chrome-profile discovery is desktop-only; other targets (e.g. Android) have none.
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

fn read_profiles_from(user_data_dir: &PathBuf, instance_label: &str) -> Vec<ChromeProfile> {
    let local_state_path = user_data_dir.join("Local State");
    let content = match std::fs::read_to_string(&local_state_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let state: LocalState = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let cache = match state.profile.and_then(|p| p.info_cache) {
        Some(c) => c,
        None => return vec![],
    };
    let mut profiles: Vec<ChromeProfile> = cache
        .into_iter()
        .filter_map(|(dir, info)| {
            info.name.map(|name| ChromeProfile {
                dir,
                name,
                instance: instance_label.to_string(),
            })
        })
        .collect();
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    profiles
}

fn dirs_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

#[tauri::command]
pub fn list_chrome_profiles() -> Vec<ChromeProfile> {
    let mut profiles = Vec::new();
    let debug_data_dir = PathBuf::from(r"C:\chrome-krishna");
    if let Some(default_dir) = get_default_user_data_dir() {
        profiles.extend(read_profiles_from(&default_dir, "Default Chrome"));
    }
    profiles.extend(read_profiles_from(&debug_data_dir, "Debug Chrome"));
    profiles
}

fn find_chrome() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Users\vikra\AppData\Local\Google\Chrome\Application\chrome.exe",
    ];
    for path in &candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

#[tauri::command]
pub fn open_in_chrome_profile(url: String, profile_dir: String, debug: bool) -> Result<String, String> {
    let lower_host = url.to_lowercase();
    let allowed = lower_host.starts_with("https://naukri.com")
        || lower_host.starts_with("https://www.naukri.com")
        || lower_host.starts_with("https://linkedin.com")
        || lower_host.starts_with("https://www.linkedin.com");
    if !allowed {
        return Err("URL must be on naukri.com or linkedin.com".to_string());
    }

    let chrome = find_chrome().ok_or_else(|| "Chrome not found on this system".to_string())?;

    let mut cmd = std::process::Command::new(&chrome);
    if !profile_dir.is_empty() {
        cmd.arg(format!("--profile-directory={}", profile_dir));
    }
    if debug {
        cmd.arg("--remote-debugging-port=9222");
        cmd.arg(r"--user-data-dir=C:\chrome-krishna");
        cmd.arg("--remote-allow-origins=*");
    }
    cmd.arg(&url);

    cmd.spawn().map_err(|e| format!("Failed to launch Chrome: {}", e))?;

    Ok(format!("Opened {}", url))
}
