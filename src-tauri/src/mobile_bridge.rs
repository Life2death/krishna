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
