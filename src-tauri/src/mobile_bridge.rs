//! Cross-platform bridge for mobile features.
//! On Android, delegates to `keystore` module (JNI → KeyStore).
//! On desktop, returns sensible defaults / no-ops so the frontend doesn't need
//! platform checks for every command.

use serde::{Deserialize, Serialize};

// ── Master-key / KeyStore ──────────────────────────────────────────────

#[tauri::command]
pub fn has_sealed_key() -> bool {
    #[cfg(target_os = "android")]
    {
        crate::keystore::has_keystore_key()
    }
    #[cfg(not(target_os = "android"))]
    {
        false
    }
}

#[tauri::command]
pub fn seal_master_key(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if crate::keystore::has_keystore_key() {
            return Ok(());
        }
        crate::keystore::generate_keystore_key()?;
        let master_key = option_env!("KRISHNA_MASTER_KEY")
            .ok_or_else(|| "KRISHNA_MASTER_KEY not set at build time".to_string())?;
        crate::secure::set_stored_value(&app, "KRISHNA_MASTER_KEY", master_key)?;
        Ok(())
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

/// Returns the build-time-baked Anthropic API key on mobile (so the phone needs
/// no key entry), or None on desktop (where the user enters their own key).
#[tauri::command]
pub fn get_baked_anthropic_key() -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        option_env!("ANTHROPIC_API_KEY").map(|s| s.to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        None
    }
}

/// Returns the build-time-baked OpenAI Realtime API key on mobile (so Live Voice
/// works without key entry on the phone), or None on desktop.
#[tauri::command]
pub fn get_baked_realtime_key() -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        option_env!("OPENAI_REALTIME_API_KEY").map(|s| s.to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        None
    }
}

/// Returns the build-time-baked Gemini Live API key on mobile, or None on
/// desktop (where the user configures it in Settings).
#[tauri::command]
pub fn get_baked_gemini_key() -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        option_env!("GEMINI_REALTIME_API_KEY").map(|s| s.to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        None
    }
}

/// Returns the build-time-baked Google Maps API key on mobile (travel-time
/// queries), or None on desktop (key lives in the user's secure store there).
#[tauri::command]
pub fn get_baked_maps_key() -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        option_env!("GOOGLE_MAPS_API_KEY").map(|s| s.to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        None
    }
}

// ── Native TTS (Android) ───────────────────────────────────────────────
// The Android WebView has no `window.speechSynthesis` and Piper can't run on
// Android, so speech is routed through the platform TextToSpeech engine.
// No-ops on desktop, where the frontend uses browser/Piper/ElevenLabs TTS.

#[tauri::command]
pub fn tts_speak_android(text: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        crate::tts_android::speak(&text)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = text;
        Ok(())
    }
}

#[tauri::command]
pub fn tts_stop_android() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        crate::tts_android::stop()
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(())
    }
}

// ── Android device control (app launcher / volume / media / torch) ─────
// JNI-backed on Android (see android_control.rs); descriptive errors on
// desktop, where these capabilities are covered by the desktop tool set.

#[tauri::command]
pub fn android_launch_app(name: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        crate::android_control::launch_by_name(&name)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = name;
        Err("android_launch_app is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn android_volume(action: String, value: Option<i32>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        match crate::android_control::volume(&action, value.unwrap_or(0)) {
            Ok(true) => Ok(()),
            Ok(false) => Err(format!("Unknown volume action: {}", action)),
            Err(e) => Err(e),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (action, value);
        Err("android_volume is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn android_media(action: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        match crate::android_control::media_key(&action) {
            Ok(true) => Ok(()),
            Ok(false) => Err(format!("Unknown media action: {}", action)),
            Err(e) => Err(e),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = action;
        Err("android_media is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn android_torch(on: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        match crate::android_control::set_torch(on) {
            Ok(true) => Ok(()),
            Ok(false) => Err("No back camera with a flash unit found".to_string()),
            Err(e) => Err(e),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = on;
        Err("android_torch is only available on Android".to_string())
    }
}

/// Screen gesture via the accessibility service. Returns a distinctive error
/// when the service isn't enabled so the frontend can walk the user through
/// the one-time system-settings opt-in.
#[tauri::command]
pub fn android_gesture(kind: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        match crate::android_control::a11y_is_enabled() {
            Ok(true) => {}
            Ok(false) => return Err("A11Y_NOT_ENABLED".to_string()),
            Err(e) => return Err(e),
        }
        match crate::android_control::a11y_gesture(&kind) {
            Ok(true) => Ok(()),
            Ok(false) => Err(format!("Unknown or undispatchable gesture: {}", kind)),
            Err(e) => Err(e),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = kind;
        Err("android_gesture is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn android_open_a11y_settings() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        crate::android_control::a11y_open_settings()
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("android_open_a11y_settings is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn android_hands_free_start() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        match crate::android_control::hands_free_start() {
            Ok(true) => Ok(()),
            Ok(false) => Err("Android hands-free service did not start".to_string()),
            Err(e) => Err(e),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("android_hands_free_start is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn android_hands_free_stop() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        match crate::android_control::hands_free_stop() {
            Ok(true) => Ok(()),
            Ok(false) => Err("Android hands-free service did not stop".to_string()),
            Err(e) => Err(e),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("android_hands_free_stop is only available on Android".to_string())
    }
}

// ── Sync transport fallback (Turso HTTP pipeline via reqwest) ──────────
// Provides a Rust-backed transport used when `@libsql/client` can't run
// (e.g. restrictive Android WebView). The TypeScript side auto-detects and
// falls back to these commands.

#[derive(Debug, Serialize)]
struct TursoRequest {
    requests: Vec<TursoRequestItem>,
}

#[derive(Debug, Serialize)]
struct TursoRequestItem {
    #[serde(rename = "type")]
    stmt_type: String,
    stmt: TursoStmt,
}

#[derive(Debug, Serialize)]
struct TursoStmt {
    sql: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    args: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct TursoResponse {
    results: Vec<TursoResult>,
}

#[derive(Debug, Deserialize)]
struct TursoResult {
    #[serde(rename = "type")]
    result_type: String,
    response: Option<TursoResponseDetail>,
}

#[derive(Debug, Deserialize)]
struct TursoResponseDetail {
    #[serde(rename = "type")]
    detail_type: String,
    result: Option<TursoExecuteResult>,
}

#[derive(Debug, Deserialize)]
struct TursoExecuteResult {
    #[serde(default)]
    cols: Vec<TursoColumn>,
    #[serde(default)]
    rows: Vec<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct TursoColumn {
    name: String,
}

#[tauri::command]
pub async fn sync_exec(
    url: String,
    token: String,
    sql: String,
    args: Option<Vec<serde_json::Value>>,
) -> Result<Vec<Vec<serde_json::Value>>, String> {
    let payload = TursoRequest {
        requests: vec![TursoRequestItem {
            stmt_type: "execute".to_string(),
            stmt: TursoStmt {
                sql,
                args: args.map(|a| {
                    a.into_iter()
                        .map(|v| if v.is_null() { serde_json::Value::Null } else { v })
                        .collect()
                }),
            },
        }],
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v2/pipeline", url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let body: TursoResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Turso response: {}", e))?;

    let result = body.results.into_iter().next().ok_or("Empty results")?;
    if result.result_type != "ok" {
        return Err(format!("Turso error: {:?}", result.response));
    }
    let detail = result.response.ok_or("No response detail")?;
    if detail.detail_type != "execute" {
        return Err(format!("Unexpected response type: {}", detail.detail_type));
    }
    Ok(detail.result.map(|r| r.rows).unwrap_or_default())
}

#[tauri::command]
pub async fn sync_exec_multiple(
    url: String,
    token: String,
    sql_list: Vec<String>,
) -> Result<(), String> {
    let payload = TursoRequest {
        requests: sql_list
            .into_iter()
            .map(|sql| TursoRequestItem {
                stmt_type: "execute".to_string(),
                stmt: TursoStmt { sql, args: None },
            })
            .collect(),
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v2/pipeline", url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let body: TursoResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Turso response: {}", e))?;

    for result in &body.results {
        if result.result_type != "ok" {
            let detail = result.response.as_ref();
            return Err(format!("Turso error: {:?}", detail));
        }
    }
    Ok(())
}
