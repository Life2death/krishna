//! Android KeyStore integration via JNI.
//!
//! On first launch the build-time-injected KRISHNA_MASTER_KEY is sealed into
//! the Android hardware KeyStore (StrongBox when available) as a
//! non-exportable AES-256-GCM key-encryption-key (KEK). All subsequent
//! `secure_get`/`secure_set` operations on Android use this KEK instead of the
//! derived-key approach used on desktop.
//!
//! This module is a no-op on non-Android targets.

#![cfg(target_os = "android")]

use crate::android_jvm::{find_app_class, with_env};
use jni::objects::JClass;
use jni::objects::{JByteArray, JObject, JValue};

/// No-op, kept for call-site compatibility. JVM acquisition now happens in
/// `android_jvm` via tao main_android_context() — neither tauri, tao, nor wry initializes
/// `ndk-context`, so the previous lazy `ndk_context::android_context()` path
/// NEVER succeeded (every keystore call silently failed and secure storage
/// always fell back to the device-bound key).
pub fn init() {}

const KOTLIN_CLASS: &str = "com.krishna.assistant.KeyStoreHelper";

/// Return `true` if the KeyStore KEK already exists (first-run already done).
pub fn has_keystore_key() -> bool {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, KOTLIN_CLASS)?);
        let result = env
            .call_static_method(class, "hasKey", "()Z", &[])
            .map_err(|e| format!("{}", e))?;
        Ok(result.z().unwrap_or(false))
    })
    .unwrap_or(false)
}

/// Generate and store a non-exportable AES-256-GCM key in Android KeyStore.
pub fn generate_keystore_key() -> Result<(), String> {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, KOTLIN_CLASS)?);
        let result = env
            .call_static_method(class, "generateKey", "()Z", &[])
            .map_err(|e| format!("{}", e))?;
        if result.z().unwrap_or(false) {
            Ok(())
        } else {
            Err("KeyStore.generateKey returned false".to_string())
        }
    })
}

/// Encrypt `plaintext` using the KeyStore KEK.
/// Returns `[12-byte IV || ciphertext + GCM tag]`.
pub fn encrypt_with_keystore(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, KOTLIN_CLASS)?);
        let input = env
            .byte_array_from_slice(plaintext)
            .map_err(|e| format!("{}", e))?;
        let input_obj: JObject = input.into();

        let result = env
            .call_static_method(
                class,
                "encrypt",
                "([B)[B",
                &[JValue::Object(&input_obj)],
            )
            .map_err(|e| format!("{}", e))?;

        let obj = result.l().map_err(|e| format!("{}", e))?;
        let byte_arr = JByteArray::from(obj);
        let arr = env
            .convert_byte_array(&byte_arr)
            .map_err(|e| format!("{}", e))?;
        Ok(arr)
    })
}

/// Decrypt `data` (`[12-byte IV || ciphertext + GCM tag]`) using the KeyStore KEK.
pub fn decrypt_with_keystore(data: &[u8]) -> Result<Vec<u8>, String> {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, KOTLIN_CLASS)?);
        let input = env
            .byte_array_from_slice(data)
            .map_err(|e| format!("{}", e))?;
        let input_obj: JObject = input.into();

        let result = env
            .call_static_method(
                class,
                "decrypt",
                "([B)[B",
                &[JValue::Object(&input_obj)],
            )
            .map_err(|e| format!("{}", e))?;

        let obj = result.l().map_err(|e| format!("{}", e))?;
        let byte_arr = JByteArray::from(obj);
        let arr = env
            .convert_byte_array(&byte_arr)
            .map_err(|e| format!("{}", e))?;
        Ok(arr)
    })
}


