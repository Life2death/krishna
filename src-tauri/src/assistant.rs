use std::process::Command;
use tauri_plugin_opener::OpenerExt;

fn is_safe_app_name(s: &str) -> bool {
    s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

#[tauri::command]
pub fn open_target(app_handle: tauri::AppHandle, target: String) -> Result<String, String> {
    let lower = target.to_lowercase();

    if lower.starts_with("http://") || lower.starts_with("https://") {
        open_url_safe(&app_handle, &target)
    } else if lower.starts_with("www.") {
        open_url_safe(&app_handle, &format!("https://{}", target))
    } else if lower.contains('\\') || lower.contains('/') || lower.ends_with(".exe") {
        open_path_safe(&app_handle, &target)
    } else if is_safe_app_name(&target) {
        open_app_safe(&target)
    } else {
        Err(format!("Invalid target: {}", target))
    }
}

fn open_url_safe(app_handle: &tauri::AppHandle, url: &str) -> Result<String, String> {
    app_handle
        .opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(format!("Opened URL: {}", url))
}

fn open_path_safe(app_handle: &tauri::AppHandle, path: &str) -> Result<String, String> {
    app_handle
        .opener()
        .open_path(path, None::<&str>)
        .map_err(|e| format!("Failed to open path: {}", e))?;
    Ok(format!("Opened path: {}", path))
}

#[tauri::command]
pub fn run_shell_command(command: String) -> Result<String, String> {
    if command.len() > 500 {
        return Err("Command too long (max 500 chars)".to_string());
    }

    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(["/C", &command])
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(["-c", &command])
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let result = if stdout.trim().is_empty() {
            "Command completed successfully.".to_string()
        } else {
            stdout.trim().to_string()
        };
        Ok(result)
    } else {
        let detail = if stderr.trim().is_empty() { stdout.trim().to_string() } else { stderr.trim().to_string() };
        Err(format!("Command failed (exit {:?}): {}", output.status.code(), detail))
    }
}

fn open_app_safe(app: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", app])
            .spawn()
            .map_err(|e| format!("Failed to open app '{}': {}", app, e))?;
        Ok(format!("Opened: {}", app))
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg(app)
            .spawn()
            .map_err(|e| format!("Failed to open app '{}': {}", app, e))?;
        Ok(format!("Opened: {}", app))
    }
    #[cfg(target_os = "linux")]
    {
        Command::new(app)
            .spawn()
            .map_err(|e| format!("Failed to open app '{}': {}", app, e))?;
        Ok(format!("Opened: {}", app))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Unsupported platform".to_string())
    }
}
