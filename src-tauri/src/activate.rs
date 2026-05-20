use crate::secure;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

const STORAGE_KEY_LICENSE_KEY: &str = "naukri_lelo_license_key";
const STORAGE_KEY_INSTANCE_ID: &str = "naukri_lelo_instance_id";
const STORAGE_KEY_SELECTED_MODEL: &str = "selected_model";

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageItem {
    key: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageResult {
    license_key: Option<String>,
    instance_id: Option<String>,
    selected_model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivationResponse {
    activated: bool,
    error: Option<String>,
    license_key: Option<String>,
    instance: Option<InstanceInfo>,
    is_dev_license: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateResponse {
    is_active: bool,
    last_validated_at: Option<String>,
    is_dev_license: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstanceInfo {
    id: String,
    name: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckoutResponse {
    success: Option<bool>,
    checkout_url: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn secure_storage_save(app: AppHandle, items: Vec<StorageItem>) -> Result<(), String> {
    for item in items {
        secure::set_stored_value(&app, &item.key, &item.value)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn secure_storage_get(app: AppHandle) -> Result<StorageResult, String> {
    let license_key = match secure::get_stored_value(&app, STORAGE_KEY_LICENSE_KEY) {
        Ok(Some(v)) => Some(v),
        _ => Some("FREE_LICENSE".to_string()),
    };
    let instance_id = match secure::get_stored_value(&app, STORAGE_KEY_INSTANCE_ID) {
        Ok(Some(v)) => Some(v),
        _ => Some("FREE_INSTANCE".to_string()),
    };
    let selected_model = secure::get_stored_value(&app, STORAGE_KEY_SELECTED_MODEL).ok().flatten();

    Ok(StorageResult {
        license_key,
        instance_id,
        selected_model,
    })
}

#[tauri::command]
pub async fn secure_storage_remove(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    for key in keys {
        secure::remove_stored_value(&app, &key)?;
    }
    Ok(())
}

// Auto-pass activation - app is free
#[tauri::command]
pub async fn activate_license_api(
    _app: AppHandle,
    _license_key: String,
) -> Result<ActivationResponse, String> {
    Ok(ActivationResponse {
        activated: true,
        error: None,
        license_key: Some("FREE_LICENSE".to_string()),
        instance: Some(InstanceInfo {
            id: "FREE_INSTANCE".to_string(),
            name: "Free User".to_string(),
            created_at: chrono::Local::now().to_rfc3339(),
        }),
        is_dev_license: false,
    })
}

// No-op deactivation - app is free
#[tauri::command]
pub async fn deactivate_license_api(_app: AppHandle) -> Result<ActivationResponse, String> {
    Ok(ActivationResponse {
        activated: false,
        error: None,
        license_key: None,
        instance: None,
        is_dev_license: false,
    })
}

// Auto-pass validation - app is always valid
#[tauri::command]
pub async fn validate_license_api(_app: AppHandle) -> Result<ValidateResponse, String> {
    Ok(ValidateResponse {
        is_active: true,
        last_validated_at: Some(chrono::Local::now().to_rfc3339()),
        is_dev_license: false,
    })
}

#[tauri::command]
pub fn mask_license_key_cmd(license_key: String) -> String {
    if license_key.len() <= 8 {
        return "*".repeat(license_key.len());
    }

    let first_four = &license_key[..4];
    let last_four = &license_key[license_key.len() - 4..];
    let middle_stars = "*".repeat(license_key.len() - 8);

    format!("{}{}{}", first_four, middle_stars, last_four)
}

// Checkout disabled - app is free
#[tauri::command]
pub async fn get_checkout_url() -> Result<CheckoutResponse, String> {
    Ok(CheckoutResponse {
        success: Some(false),
        checkout_url: None,
        error: Some("Naukri Lelo is free to use. No purchase required.".to_string()),
    })
}
