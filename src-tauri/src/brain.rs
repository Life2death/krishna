use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::thread;
use tauri::Manager;

use crate::secure;

const BRAIN_PORT: u16 = 8787;
const HEALTH_URL: &str = "http://127.0.0.1:8787/health";
const MAX_BOOT_WAIT_SECS: u64 = 30;
const GRACEFUL_WAIT_SECS: u64 = 5;
const POLL_INTERVAL_MS: u64 = 500;

/// Env vars the brain reads from process.env (see apps/brain/src/config.ts).
const BRAIN_ENV_KEYS: &[&str] = &[
    "KRISHNA_BRAIN_TOKEN",
    "KRISHNA_BRAIN_PORT",
    "KRISHNA_DB_PATH",
    "KRISHNA_SYNC_URL",
    "KRISHNA_SYNC_TOKEN",
    "KRISHNA_SYNC_INTERVAL",
    "KRISHNA_MASTER_KEY",
    "ANTHROPIC_API_KEY",
    "KRISHNA_CLAUDE_MODEL",
    "KRISHNA_STT_URL",
    "KRISHNA_STT_API_KEY",
    "KRISHNA_STT_MODEL",
    "TELEGRAM_BOT_TOKEN",
    "KRISHNA_RAG_DISABLED",
    "KRISHNA_MCP_CONFIG_PATH",
    "KRISHNA_MCP_SERVERS",
    "KRISHNA_GMAIL_OAUTH_KEYS_PATH",
    "KRISHNA_GMAIL_TOKEN_PATH",
];

pub struct BrainProcess {
    child: Arc<Mutex<Option<Child>>>,
}

impl BrainProcess {
    pub fn new() -> Self {
        BrainProcess {
            child: Arc::new(Mutex::new(None)),
        }
    }

    // ------------------------------------------------------------------
    // Secure-storage helpers
    // ------------------------------------------------------------------

    /// Load all brain env vars that exist in Tauri's encrypted secure storage.
    /// Keys that haven't been stored (first run, not yet configured) are simply
    /// omitted — the brain may boot in a degraded state, or the dev-mode .env
    /// file may supply them.
    pub fn load_env(app: &tauri::AppHandle) -> HashMap<String, String> {
        let mut env = HashMap::new();
        for key in BRAIN_ENV_KEYS {
            if let Ok(Some(val)) = secure::get_stored_value(app, key) {
                env.insert(key.to_string(), val);
            }
        }
        env
    }

    /// Check if a brain is already running by hitting the health endpoint.
    pub fn is_already_running() -> bool {
        reqwest::blocking::get(HEALTH_URL)
            .ok()
            .and_then(|r| r.status().is_success().then_some(()))
            .is_some()
    }

    // ------------------------------------------------------------------
    // Spawn helpers
    // ------------------------------------------------------------------

    /// Apply extra environment variables to a Command. Does *not* clear the
    /// existing inherited environment — only overrides/adds the entries in `env`.
    fn apply_env(cmd: &mut Command, env: &HashMap<String, String>) {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }

    /// Spawn the brain in dev mode (assumes npm + tsx available at the repo root).
    pub fn spawn_dev(
        &self,
        _app_handle: &tauri::AppHandle,
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let brain_dir = manifest_dir.join("..").join("apps").join("brain");
        let brain_dir = brain_dir
            .canonicalize()
            .map_err(|e| format!("Brain directory not found: {}", e))?;

        // canonicalize() returns a Windows verbatim path (\\?\D:\...), which
        // cmd.exe cannot use as a working directory — it silently falls back to
        // C:\Windows, so the relative `src/index.ts` is never found and the
        // brain never boots. Strip the prefix so the cwd resolves correctly.
        let brain_dir: std::path::PathBuf = {
            let s = brain_dir.to_string_lossy();
            match s.strip_prefix(r"\\?\") {
                Some(stripped) => std::path::PathBuf::from(stripped),
                None => brain_dir.clone(),
            }
        };

        if !brain_dir.join("package.json").exists() {
            return Err(format!(
                "Brain package.json not found at {}",
                brain_dir.display()
            ));
        }

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(["/c", "npx", "tsx", "src/index.ts"]);
            c
        } else {
            let mut c = Command::new("npx");
            c.args(["tsx", "src/index.ts"]);
            c
        };

        cmd.current_dir(&brain_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        Self::apply_env(&mut cmd, env);

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn brain: {}", e))?;

        *self.child.lock().map_err(|e| e.to_string())? = Some(child);
        println!("[brain] Spawned in dev mode (cwd={})", brain_dir.display());
        Ok(())
    }

    /// Spawn the brain from bundled resources (production mode).
    /// Expects `resources/brain/node` (portable Node runtime) and
    /// `resources/brain/brain.js` (bundled brain entry point).
    pub fn spawn_bundled(
        &self,
        app_handle: &tauri::AppHandle,
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
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

        let mut cmd = Command::new(&node_exe);
        cmd.arg(&brain_js)
            .current_dir(&resource_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .env("NODE_OPTIONS", "--no-deprecation")
            .env("KRISHNA_RAG_DISABLED", "true");
        // Apply secure-storage env vars on top (can override defaults)
        Self::apply_env(&mut cmd, env);

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn bundled brain: {}", e))?;

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
        Err(format!(
            "Brain failed to start within {}s (stdout/stderr inherited by Tauri — check logs above)",
            MAX_BOOT_WAIT_SECS
        ))
    }

    /// Kill the child process gracefully via HTTP, then force-kill the tree.
    ///
    /// 1. POST /shutdown to the brain so it runs its shutdown-sync handler.
    /// 2. Wait up to GRACEFUL_WAIT_SECS for the process to exit.
    /// 3. Force-kill the entire process tree (taskkill /T /F on Windows).
    pub fn kill(&self) {
        let (pid, mut child) = {
            let mut guard = match self.child.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            match guard.take() {
                Some(c) => (c.id(), c),
                None => return,
            }
        };

        // Step 1: Attempt graceful shutdown via HTTP POST /shutdown
        println!("[brain] Requesting graceful shutdown (PID {})…", pid);
        let url = format!("http://127.0.0.1:{}/shutdown", BRAIN_PORT);
        let _ = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .ok()
            .and_then(|client| client.post(&url).send().ok());

        // Step 2: Wait for the process to exit on its own (runs shutdown sync)
        let deadline = std::time::Instant::now() + Duration::from_secs(GRACEFUL_WAIT_SECS);
        while std::time::Instant::now() < deadline {
            match child.try_wait() {
                Ok(Some(_)) => {
                    println!("[brain] Process exited after graceful shutdown");
                    return;
                }
                Ok(None) => {}
                Err(_) => break,
            }
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }

        // Step 3: Force-kill the entire process tree
        println!(
            "[brain] Graceful shutdown timed out — force-killing tree (PID {})",
            pid
        );
        Self::kill_process_tree(pid);
        let _ = child.wait();
        println!("[brain] Process terminated");
    }

    #[cfg(windows)]
    fn kill_process_tree(pid: u32) {
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .output();
    }

    #[cfg(not(windows))]
    fn kill_process_tree(pid: u32) {
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .output();
        thread::sleep(Duration::from_millis(500));
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", pid)])
            .output();
    }
}
