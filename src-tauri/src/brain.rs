use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::thread;
use tauri::Manager;

const HEALTH_URL: &str = "http://127.0.0.1:8787/health";
const MAX_BOOT_WAIT_SECS: u64 = 30;
const POLL_INTERVAL_MS: u64 = 500;

pub struct BrainProcess {
    child: Arc<Mutex<Option<Child>>>,
}

impl BrainProcess {
    pub fn new() -> Self {
        BrainProcess {
            child: Arc::new(Mutex::new(None)),
        }
    }

    /// Check if a brain is already running by hitting the health endpoint.
    pub fn is_already_running() -> bool {
        reqwest::blocking::get(HEALTH_URL)
            .ok()
            .and_then(|r| r.status().is_success().then_some(()))
            .is_some()
    }

    /// Spawn the brain in dev mode (assumes npm + tsx available at the repo root).
    pub fn spawn_dev(&self, _app_handle: &tauri::AppHandle) -> Result<(), String> {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let brain_dir = manifest_dir.join("..").join("apps").join("brain");
        let brain_dir = brain_dir.canonicalize()
            .map_err(|e| format!("Brain directory not found: {}", e))?;

        if !brain_dir.join("package.json").exists() {
            return Err(format!("Brain package.json not found at {}", brain_dir.display()));
        }

        // On Windows, npm/npx are .cmd files; on Unix they're symlinks.
        // Use the npm script command (cross-platform) via the shell.
        let child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/c", "npx", "tsx", "src/index.ts"])
                .current_dir(&brain_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        } else {
            Command::new("npx")
                .args(["tsx", "src/index.ts"])
                .current_dir(&brain_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        }
        .map_err(|e| format!("Failed to spawn brain: {}", e))?;

        *self.child.lock().map_err(|e| e.to_string())? = Some(child);
        println!("[brain] Spawned in dev mode (cwd={})", brain_dir.display());
        Ok(())
    }

    /// Spawn the brain from bundled resources (production mode).
    /// Expects `resources/brain/node` (portable Node runtime) and
    /// `resources/brain/brain.js` (bundled brain entry point).
    pub fn spawn_bundled(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let resource_dir = app_handle
            .path()
            .resolve("brain", tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve brain resource dir: {}", e))?;

        let node_exe = if cfg!(target_os = "windows") {
            resource_dir.join("node").join("node.exe")
        } else {
            resource_dir.join("node").join("bin").join("node")
        };
        let brain_js = resource_dir.join("brain.js");

        if !node_exe.exists() {
            return Err(format!(
                "Portable Node runtime not found at {}. Reinstall Krishna.",
                node_exe.display()
            ));
        }
        if !brain_js.exists() {
            return Err(format!(
                "Bundled brain not found at {}. Reinstall Krishna.",
                brain_js.display()
            ));
        }

        let child = Command::new(&node_exe)
            .arg(&brain_js)
            .current_dir(&resource_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn bundled brain: {}", e))?;

        *self.child.lock().map_err(|e| e.to_string())? = Some(child);
        println!("[brain] Spawned in bundled mode (node={})", node_exe.display());
        Ok(())
    }

    /// Poll the brain's /health endpoint until it responds ok or we time out.
    pub fn wait_for_ready(&self) -> Result<(), String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(MAX_BOOT_WAIT_SECS);
        while std::time::Instant::now() < deadline {
            if Self::is_already_running() {
                println!("[brain] Health check passed");
                return Ok(());
            }
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }
        // Capture stderr from the child process for diagnostics
        let stderr = self
            .child
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut()?.stderr.take())
            .and_then(|mut s| {
                let mut buf = String::new();
                s.read_to_string(&mut buf).ok()?;
                Some(buf)
            })
            .unwrap_or_default();
        Err(format!(
            "Brain failed to start within {}s. Stderr:\n{}",
            MAX_BOOT_WAIT_SECS,
            if stderr.is_empty() {
                "(no stderr captured)".to_string()
            } else {
                stderr
            }
        ))
    }

    /// Kill the child process (SIGTERM on Unix, TerminateProcess on Windows).
    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
                println!("[brain] Process terminated");
            }
        }
    }
}
