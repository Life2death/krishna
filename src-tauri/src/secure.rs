use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_machine_uid::MachineUidExt;

fn derive_encryption_key(machine_id: &str, app_seed: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"naukri-lelo-encryption-v1");
    hasher.update(machine_id.as_bytes());
    hasher.update(app_seed.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

fn get_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    Ok(app_data_dir.join("secure_storage.enc"))
}

fn decrypt_data(ciphertext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if ciphertext.len() < 12 {
        return Err("Ciphertext too short".to_string());
    }
    let (nonce_bytes, ct) = ciphertext.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init failed: {}", e))?;
    cipher
        .decrypt(nonce, ct)
        .map_err(|_| "Decryption failed (invalid key or corrupted data)".to_string())
}

fn get_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let machine_id = app
        .machine_uid()
        .get_machine_uid()
        .ok()
        .and_then(|uid| uid.id)
        .unwrap_or_default();
    if machine_id.is_empty() {
        return Err("Machine identifier unavailable".to_string());
    }
    let app_version: String = app.package_info().version.to_string();
    Ok(derive_encryption_key(&machine_id, &app_version))
}

pub fn read_encrypted_json(app: &AppHandle) -> Result<serde_json::Value, String> {
    let path = get_storage_path(app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read(&path).map_err(|e| format!("Failed to read storage: {}", e))?;
    let key = get_key(app)?;
    let decrypted = decrypt_data(&data, &key)?;
    serde_json::from_slice(&decrypted)
        .map_err(|e| format!("Failed to parse storage JSON: {}", e))
}

pub fn get_stored_value(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    let data = read_encrypted_json(app)?;
    match data.get(key) {
        Some(serde_json::Value::String(val)) => Ok(Some(val.clone())),
        _ => Ok(None),
    }
}

pub fn encrypt_data(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init failed: {}", e))?;
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "Encryption failed".to_string())?;
    let mut result = Vec::with_capacity(12 + ct.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ct);
    Ok(result)
}

pub fn set_stored_value(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let path = get_storage_path(app)?;
    let mut data = read_encrypted_json(app)?;
    data[key] = serde_json::json!(value);
    let plaintext = serde_json::to_vec(&data)
        .map_err(|e| format!("Failed to serialize storage: {}", e))?;
    let encryption_key = get_key(app)?;
    let encrypted = encrypt_data(&plaintext, &encryption_key)?;
    fs::write(&path, encrypted)
        .map_err(|e| format!("Failed to write storage: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn secure_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    get_stored_value(&app, &key)
}

#[tauri::command]
pub fn secure_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    set_stored_value(&app, &key, &value)
}

