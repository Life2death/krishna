use base64::Engine;
use rand::Rng;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GmailTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    pub token_type: Option<String>,
    pub expiry_date: Option<i64>,
}

#[derive(Serialize)]
pub struct OAuthStartResult {
    pub auth_url: String,
    pub code_verifier: String,
    pub port: u16,
}

#[derive(Serialize, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<i64>,
    refresh_token: Option<String>,
    scope: Option<String>,
    token_type: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ErrorResponse {
    error: String,
    error_description: Option<String>,
}

pub struct OAuthState {
    pub listener: Arc<Mutex<Option<TcpListener>>>,
}

impl OAuthState {
    pub fn new() -> Self {
        Self {
            listener: Arc::new(Mutex::new(None)),
        }
    }
}

fn generate_code_verifier() -> String {
    let bytes: Vec<u8> = (0..64).map(|_| rand::thread_rng().gen::<u8>()).collect();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

fn generate_code_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

fn generate_state() -> String {
    let bytes: Vec<u8> = (0..32).map(|_| rand::thread_rng().gen::<u8>()).collect();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

pub fn oauth_redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{}", port)
}

fn urlencode(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("%20"),
            _ => result.push_str(&format!("%{:02X}", byte)),
        }
    }
    result
}

fn urldecode(s: &str) -> String {
    let mut result = Vec::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hi = chars.next().and_then(|c| c.to_digit(16)).unwrap_or(0);
            let lo = chars.next().and_then(|c| c.to_digit(16)).unwrap_or(0);
            result.push((hi as u8 * 16 + lo as u8) as char);
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result.into_iter().collect()
}

#[tauri::command]
pub async fn start_gmail_oauth(
    state: tauri::State<'_, OAuthState>,
    client_id: String,
    _client_secret: String,
) -> Result<OAuthStartResult, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start local server: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get port: {}", e))?
        .port();

    let mut guard = state.listener.lock().await;
    *guard = Some(listener);

    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state_token = generate_state();
    let redirect_uri = oauth_redirect_uri(port);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={}&\
         redirect_uri={}&\
         response_type=code&\
         scope={}&\
         access_type=offline&\
         prompt=consent&\
         code_challenge={}&\
         code_challenge_method=S256&\
         state={}",
        urlencode(&client_id),
        urlencode(&redirect_uri),
        urlencode("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"),
        urlencode(&code_challenge),
        urlencode(&state_token),
    );

    Ok(OAuthStartResult {
        auth_url,
        code_verifier,
        port,
    })
}

#[tauri::command]
pub async fn complete_gmail_oauth(
    state: tauri::State<'_, OAuthState>,
    client_id: String,
    client_secret: String,
    code_verifier: String,
) -> Result<GmailTokens, String> {
    let listener = {
        let mut guard = state.listener.lock().await;
        guard.take().ok_or_else(|| "No OAuth listener started".to_string())?
    };

    let listener_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get listener port: {}", e))?
        .port();

    let (mut socket, _addr) = listener
        .accept()
        .await
        .map_err(|e| format!("Failed to accept connection: {}", e))?;

    let mut buf = [0u8; 8192];
    let n = socket
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read request: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);
    let code = extract_query_param(&request, "code")
        .ok_or_else(|| {
            let error = extract_query_param(&request, "error")
                .unwrap_or_else(|| "unknown".to_string());
            format!("OAuth authorization denied or failed: {}", error)
        })?;

    let redirect_uri = oauth_redirect_uri(listener_port);

    let code_received_html = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><body><p>Authorization code received — return to Krishna to finish connecting.</p></body></html>";
    socket
        .write_all(code_received_html.as_bytes())
        .await
        .map_err(|e| format!("Failed to send response: {}", e))?;
    socket.flush().await.ok();

    let tokens = exchange_code(
        &client_id,
        &client_secret,
        &code,
        &redirect_uri,
        &code_verifier,
    )
    .await?;

    Ok(tokens)
}

#[tauri::command]
pub async fn cancel_gmail_oauth(state: tauri::State<'_, OAuthState>) -> Result<(), String> {
    let mut guard = state.listener.lock().await;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn refresh_gmail_token(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<GmailTokens, String> {
    let client = Client::new();
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .unwrap_or_else(|_| "no body".to_string());

    if !status.is_success() {
        return Err(format!("Token refresh failed ({}): {}", status, text));
    }

    let token_resp: TokenResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse token response: {} — body: {}", e, text))?;

    let expires_in = token_resp.expires_in.unwrap_or(3600);
    let expiry_date = chrono::Utc::now().timestamp() + expires_in;

    Ok(GmailTokens {
        access_token: token_resp.access_token,
        refresh_token: Some(refresh_token),
        scope: token_resp.scope,
        token_type: token_resp.token_type,
        expiry_date: Some(expiry_date * 1000),
    })
}

async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<GmailTokens, String> {
    let client = Client::new();
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", code_verifier),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .unwrap_or_else(|_| "no body".to_string());

    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<ErrorResponse>(&text) {
            return Err(format!(
                "Token exchange failed ({}): {} — {}",
                status,
                err.error,
                err.error_description.unwrap_or_default()
            ));
        }
        return Err(format!("Token exchange failed ({}): {}", status, text));
    }

    let token_resp: TokenResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse token response: {} — body: {}", e, text))?;

    let expires_in = token_resp.expires_in.unwrap_or(3600);
    let expiry_date = chrono::Utc::now().timestamp() + expires_in;

    Ok(GmailTokens {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token,
        scope: token_resp.scope,
        token_type: token_resp.token_type,
        expiry_date: Some(expiry_date * 1000),
    })
}

fn extract_query_param(request: &str, param: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let uri = first_line.split_whitespace().nth(1)?;
    let query = if let Some(pos) = uri.find('?') {
        &uri[pos + 1..]
    } else {
        return None;
    };

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if parts.next()? == param {
            let value = parts.next()?;
            return Some(urldecode(value));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oauth_redirect_uri_uses_listener_port() {
        let port: u16 = 54321;
        let uri = oauth_redirect_uri(port);
        assert_eq!(uri, "http://127.0.0.1:54321");
    }
}
