use std::process::Command;
use tauri::Manager;

#[tauri::command]
pub fn open_target(target: String) -> Result<String, String> {
    let lower = target.to_lowercase();

    // If it looks like a URL, open via the default browser
    if lower.starts_with("http://") || lower.starts_with("https://") {
        open_url(&target)
    } else if lower.starts_with("www.") {
        open_url(&format!("https://{}", target))
    } else {
        open_app(&target)
    }
}

fn open_url(url: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(format!("Opened URL: {}", url))
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(format!("Opened URL: {}", url))
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(format!("Opened URL: {}", url))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Unsupported platform".to_string())
    }
}

fn open_app(app: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Check if it's a direct executable name or a file path
        if app.contains('\\') || app.contains('/') || app.ends_with(".exe") {
            Command::new("cmd")
                .args(["/C", "start", "", app])
                .spawn()
                .map_err(|e| format!("Failed to open: {}", e))?;
        } else {
            Command::new("cmd")
                .args(["/C", "start", "", &app])
                .spawn()
                .map_err(|e| format!("Failed to open app '{}': {}", app, e))?;
        }
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
