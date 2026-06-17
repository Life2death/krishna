use base64::Engine;
use rand::Rng;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::Manager;

/// Max characters sent to Piper per call. Defensive cap — a runaway prompt
/// shouldn't be able to hang the synthesis process for minutes.
const MAX_TEXT_LEN: usize = 5000;

/// Synthesizes speech locally via the bundled Piper TTS engine (fully offline,
/// no API key, no network call). Returns base64-encoded WAV audio bytes.
///
/// Piper writes to a real temp file rather than stdout: when writing a WAV to
/// stdout (a non-seekable pipe), Piper can't seek back to patch the RIFF/data
/// chunk sizes once the final length is known, leaving them with stale/wrong
/// values. Browsers tolerate this poorly (manifests as garbled/scratchy
/// playback) — a seekable file lets Piper finalize the header correctly.
#[tauri::command]
pub fn synthesize_speech_piper(text: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Empty text".to_string());
    }
    let text: String = trimmed.chars().take(MAX_TEXT_LEN).collect();

    // In production the resource is bundled; in dev builds BaseDirectory::Resource
    // resolves to the binary dir (target/debug/) which won't have piper — fall back
    // to the source-tree location so `tauri dev` works without needing to bundle.
    let resource_dir = {
        let prod_path = app_handle
            .path()
            .resolve("piper", tauri::path::BaseDirectory::Resource)
            .ok();
        let dev_fallback = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("piper");
        match prod_path {
            Some(p) if p.join("piper.exe").exists() => p,
            _ => dev_fallback,
        }
    };

    let piper_exe = resource_dir.join("piper.exe");
    let model_path = resource_dir.join("en_US-ryan-medium.onnx");
    let espeak_data = resource_dir.join("espeak-ng-data");

    if !piper_exe.exists() {
        return Err("Piper voice engine not found (missing bundled resources). Reinstall Krishna.".to_string());
    }

    let unique: u64 = rand::thread_rng().gen();
    let out_path = std::env::temp_dir().join(format!("krishna-piper-{}.wav", unique));

    let mut child = Command::new(&piper_exe)
        .arg("--model")
        .arg(&model_path)
        .arg("--espeak_data")
        .arg(&espeak_data)
        .arg("--output_file")
        .arg(&out_path)
        .arg("--quiet")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch Piper: {}", e))?;

    {
        // Take ownership and write, then let `stdin` drop at the end of this
        // block — that closes the pipe (EOF), which Piper is blocked reading
        // until it sees. Without an explicit close, the pipe stays open for
        // the lifetime of `child` and Piper hangs forever waiting for more
        // input, deadlocking the `wait()` below.
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open Piper stdin".to_string())?;
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("Failed to write text to Piper: {}", e))?;
    }

    // Safety net: never let a hung/misbehaving Piper process block the UI
    // indefinitely. Poll for exit instead of a blocking wait().
    let timeout = std::time::Duration::from_secs(20);
    let start = std::time::Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("Piper process failed: {}", e))?
        {
            break status;
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = std::fs::remove_file(&out_path);
            return Err("Piper synthesis timed out".to_string());
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    };

    if !status.success() {
        let _ = std::fs::remove_file(&out_path);
        return Err("Piper synthesis failed".to_string());
    }

    let bytes = std::fs::read(&out_path).map_err(|e| format!("Failed to read Piper output: {}", e))?;
    let _ = std::fs::remove_file(&out_path);

    if bytes.is_empty() {
        return Err("Piper produced no audio".to_string());
    }

    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}
