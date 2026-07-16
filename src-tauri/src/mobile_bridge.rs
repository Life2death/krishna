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

/// Returns the build-time-baked Turso sync URL on mobile, or None on desktop
/// (where the user configures sync in their own secure store). Seeded into the
/// mobile secure store at startup so the phone joins the sync hub instead of
/// running "Local only mode".
#[tauri::command]
pub fn get_baked_sync_url() -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        option_env!("KRISHNA_SYNC_URL").map(|s| s.to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        None
    }
}

/// Returns the build-time-baked Turso sync auth token on mobile, or None on
/// desktop. Paired with get_baked_sync_url.
#[tauri::command]
pub fn get_baked_sync_token() -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        option_env!("KRISHNA_SYNC_TOKEN").map(|s| s.to_string())
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

/// Open a YouTube Music URL, preferring the installed YouTube Music Android app.
#[tauri::command]
pub fn android_open_youtube_music(url: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let url = url.trim();
        if !url.starts_with("https://music.youtube.com/") {
            return Err("Only canonical YouTube Music URLs are allowed".to_string());
        }
        crate::android_control::open_youtube_music(url)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = url;
        Err("android_open_youtube_music is only available on Android".to_string())
    }
}

/// Click a uniquely matched visible Android accessibility node by label.
#[tauri::command]
pub fn android_click_button(label: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let label = label.trim();
        if label.is_empty() || label.len() > 80 {
            return Err("Button label must contain 1 to 80 characters".to_string());
        }
        match crate::android_control::a11y_is_enabled() {
            Ok(true) => {}
            Ok(false) => return Err("A11Y_NOT_ENABLED".to_string()),
            Err(e) => return Err(e),
        }
        let result = crate::android_control::a11y_click_button(label)?;
        match result.as_str() {
            "CLICKED" => Ok(()),
            "NOT_FOUND" => Err(format!("No visible button named '{}' was found", label)),
            "AMBIGUOUS" => Err(format!("More than one visible button named '{}' was found", label)),
            "NO_ACTIVE_WINDOW" => Err("No active app window is available".to_string()),
            "SERVICE_UNAVAILABLE" => Err("Krishna Accessibility is not connected".to_string()),
            "INVALID_LABEL" => Err("The button label is invalid".to_string()),
            "CLICK_FAILED" => Err(format!("Android could not click '{}'", label)),
            other => Err(format!("Unknown Accessibility click result: {}", other)),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = label;
        Err("android_click_button is only available on Android".to_string())
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

// ── Wake-word profile (native SharedPreferences) ──────────────────────
// These commands let the React frontend read/write the WakeWordProfile
// stored in Android SharedPreferences through WakeWordBridgeHelper.
// On desktop they return empty defaults; wake-word is mobile-only.

#[tauri::command]
pub fn android_get_wake_word_profile() -> String {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_get_profile().unwrap_or_default()
    }
    #[cfg(not(target_os = "android"))]
    {
        "{}".to_string()
    }
}

#[tauri::command]
pub fn android_update_wake_word_field(field: String, value: String) -> bool {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_update_field(field, value).unwrap_or(false)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (field, value);
        false
    }
}

#[tauri::command]
pub fn android_reset_wake_word_profile() -> bool {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_reset().unwrap_or(false)
    }
    #[cfg(not(target_os = "android"))]
    {
        false
    }
}

#[tauri::command]
pub fn android_get_wake_word_detector_state() -> String {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_get_detector_state().unwrap_or_default()
    }
    #[cfg(not(target_os = "android"))]
    {
        "{}".to_string()
    }
}

#[tauri::command]
pub fn android_run_wake_word_evaluation() -> String {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_run_evaluation().unwrap_or_else(|e| {
            format!("{{\"success\":false,\"error\":\"{}\"}}", e)
        })
    }
    #[cfg(not(target_os = "android"))]
    {
        "{\"success\":false,\"error\":\"Only available on Android\"}".to_string()
    }
}

#[tauri::command]
pub fn android_capture_clip(label: String) -> String {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_capture_clip(label).unwrap_or_else(|e| {
            format!("{{\"success\":false,\"error\":\"{}\"}}", e)
        })
    }
    #[cfg(not(target_os = "android"))]
    {
        "{\"success\":false,\"error\":\"Only available on Android\"}".to_string()
    }
}

#[tauri::command]
pub fn android_training_summary() -> String {
    #[cfg(target_os = "android")]
    {
        crate::android_control::wake_word_training_summary().unwrap_or_default()
    }
    #[cfg(not(target_os = "android"))]
    {
        "{}".to_string()
    }
}

// ── System assist gesture (VoiceInteractionService) ─────────────────
// A long-press-home/assist gesture bounces MainActivity to the foreground
// and marks a pending assist via AssistBridgeHelper. JS polls this on mount
// and on window focus and, if true, starts listening exactly like a mic tap.

#[tauri::command]
pub fn android_take_pending_assist() -> bool {
    #[cfg(target_os = "android")]
    {
        crate::android_control::assist_take_pending().unwrap_or(false)
    }
    #[cfg(not(target_os = "android"))]
    {
        false
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
    // Turso column descriptors ({name, decltype}); kept as raw JSON since the
    // TS layer reconstructs column names from its own DDL and never reads these.
    #[serde(default)]
    cols: Vec<serde_json::Value>,
    // Each cell is a Hrana typed value: {"type":"text"|"integer"|"float"|"null","value":…}.
    #[serde(default)]
    rows: Vec<Vec<serde_json::Value>>,
}

/// Build the Turso HTTP pipeline endpoint from a stored sync URL.
///
/// Sync URLs are stored with the `libsql://` scheme (what the JS
/// `@libsql/client` expects), but `reqwest` only speaks HTTP and rejects an
/// unknown scheme with "builder error for url". The libsql HTTP pipeline is
/// served over TLS at the same host, so rewrite `libsql://`/`wss://` → `https://`
/// (and `ws://` → `http://`) before appending the pipeline path.
fn turso_pipeline_url(url: &str) -> String {
    let base = url.trim_end_matches('/');
    let https = if let Some(rest) = base.strip_prefix("libsql://") {
        format!("https://{}", rest)
    } else if let Some(rest) = base.strip_prefix("wss://") {
        format!("https://{}", rest)
    } else if let Some(rest) = base.strip_prefix("ws://") {
        format!("http://{}", rest)
    } else {
        base.to_string()
    };
    format!("{}/v2/pipeline", https)
}

/// Format a reqwest error with its full source chain, plus the coarse reqwest
/// category flags. reqwest's top-level Display is often just "error sending
/// request for url (…)" and hides the real cause (DNS vs connect vs TLS) in the
/// `source()` chain — surface all of it so mobile sync failures are diagnosable.
fn fmt_reqwest_err(e: &reqwest::Error) -> String {
    let mut parts = vec![format!("{}", e)];
    let mut src = std::error::Error::source(e);
    while let Some(s) = src {
        parts.push(format!("caused by: {}", s));
        src = s.source();
    }
    let flags = format!(
        "[connect={} timeout={} request={} body={} builder={}]",
        e.is_connect(),
        e.is_timeout(),
        e.is_request(),
        e.is_body(),
        e.is_builder(),
    );
    format!("{} {}", parts.join(" | "), flags)
}

/// Shared reqwest client for the Turso sync transport. An explicit connect
/// timeout turns silent Android connection stalls into fast, logged errors.
fn turso_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", fmt_reqwest_err(&e)))
}

/// Encode a JS-supplied scalar into a Hrana typed value. The Turso HTTP pipeline
/// requires statement args as `{"type":…,"value":…}` objects — sending raw JSON
/// scalars makes Turso reject the request, which surfaces as an unparseable
/// (results-less) error body. Integers must be sent as strings per the Hrana spec.
fn to_hrana_arg(v: &serde_json::Value) -> serde_json::Value {
    use serde_json::json;
    match v {
        serde_json::Value::Null => json!({ "type": "null" }),
        serde_json::Value::Bool(b) => json!({ "type": "integer", "value": if *b { "1" } else { "0" } }),
        serde_json::Value::Number(n) => {
            if n.is_i64() || n.is_u64() {
                json!({ "type": "integer", "value": n.to_string() })
            } else {
                json!({ "type": "float", "value": n.as_f64().unwrap_or(0.0) })
            }
        }
        serde_json::Value::String(s) => json!({ "type": "text", "value": s }),
        // Arrays/objects have no SQLite-native scalar type — store as JSON text.
        other => json!({ "type": "text", "value": other.to_string() }),
    }
}

/// Decode one Hrana typed value cell back into a plain JSON scalar for the TS
/// layer (which expects raw values, not `{"type":…,"value":…}` wrappers).
fn from_hrana_cell(cell: &serde_json::Value) -> serde_json::Value {
    let kind = cell.get("type").and_then(|x| x.as_str()).unwrap_or("null");
    match kind {
        "integer" => cell
            .get("value")
            .and_then(|x| x.as_str())
            .and_then(|s| s.parse::<i64>().ok())
            .map(serde_json::Value::from)
            .unwrap_or(serde_json::Value::Null),
        "float" | "text" => cell.get("value").cloned().unwrap_or(serde_json::Value::Null),
        _ => serde_json::Value::Null,
    }
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
                args: args.map(|a| a.iter().map(to_hrana_arg).collect()),
            },
        }],
    };

    let client = turso_client()?;
    let resp = client
        .post(turso_pipeline_url(&url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", fmt_reqwest_err(&e)))?;

    // Read the body as text first so a shape mismatch (e.g. a Turso error object
    // with no `results` field) surfaces the actual body instead of an opaque
    // "error decoding response body".
    let body_text = resp
        .text()
        .await
        .map_err(|e| format!("HTTP request failed reading body: {}", fmt_reqwest_err(&e)))?;
    let body: TursoResponse = serde_json::from_str(&body_text).map_err(|e| {
        format!(
            "Failed to parse Turso response: {} | body: {}",
            e,
            body_text.chars().take(400).collect::<String>()
        )
    })?;

    let result = body.results.into_iter().next().ok_or("Empty results")?;
    if result.result_type != "ok" {
        return Err(format!("Turso error: {:?}", result.response));
    }
    let detail = result.response.ok_or("No response detail")?;
    if detail.detail_type != "execute" {
        return Err(format!("Unexpected response type: {}", detail.detail_type));
    }
    // Decode each Hrana typed cell back to a plain scalar for the TS layer.
    Ok(detail
        .result
        .map(|r| {
            r.rows
                .into_iter()
                .map(|row| row.iter().map(from_hrana_cell).collect())
                .collect()
        })
        .unwrap_or_default())
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

    let client = turso_client()?;
    let resp = client
        .post(turso_pipeline_url(&url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", fmt_reqwest_err(&e)))?;

    let body_text = resp
        .text()
        .await
        .map_err(|e| format!("HTTP request failed reading body: {}", fmt_reqwest_err(&e)))?;
    let body: TursoResponse = serde_json::from_str(&body_text).map_err(|e| {
        format!(
            "Failed to parse Turso response: {} | body: {}",
            e,
            body_text.chars().take(400).collect::<String>()
        )
    })?;

    for result in &body.results {
        if result.result_type != "ok" {
            let detail = result.response.as_ref();
            return Err(format!("Turso error: {:?}", detail));
        }
    }
    Ok(())
}
