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

use jni::objects::{JByteArray, JClass, JObject, JValue};
use jni::JNIEnv;
use std::sync::OnceLock;

static JVM: OnceLock<jni::JavaVM> = OnceLock::new();

/// No-op. Previously this eagerly grabbed the JVM during Tauri `setup`, but
/// `ndk_context::android_context()` panics ("android context was not
/// initialized") when called that early. The JVM is now acquired lazily in
/// `get_vm()` on first KeyStore use — by then JS is driving commands and the
/// native activity (and ndk-context) are fully initialized.
pub fn init() {}

fn get_vm() -> Result<&'static jni::JavaVM, String> {
    if let Some(vm) = JVM.get() {
        return Ok(vm);
    }
    // Acquire lazily and panic-safely: android_context() panics if the native
    // activity hasn't initialized ndk-context yet. catch_unwind turns that into
    // a recoverable error instead of aborting the process.
    let vm_ptr = std::panic::catch_unwind(|| ndk_context::android_context().vm())
        .map_err(|_| "[keystore] Android context not initialized yet".to_string())?;
    if vm_ptr.is_null() {
        return Err("[keystore] JVM pointer is null".to_string());
    }
    let vm = unsafe { jni::JavaVM::from_raw(vm_ptr as *mut jni::sys::JavaVM) }
        .map_err(|e| format!("[keystore] JavaVM::from_raw failed: {}", e))?;
    let _ = JVM.set(vm);
    JVM.get()
        .ok_or_else(|| "[keystore] JVM set failed".to_string())
}

fn with_env<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut JNIEnv) -> Result<R, String>,
{
    let vm = get_vm()?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("JNI attach failed: {}", e))?;
    f(&mut env)
}

const KOTLIN_CLASS: &str = "com/krishna/assistant/KeyStoreHelper";

/// Return `true` if the KeyStore KEK already exists (first-run already done).
pub fn has_keystore_key() -> bool {
    with_env(|env| {
        let class = env.find_class(KOTLIN_CLASS).map_err(|e| format!("{}", e))?;
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
        let class = env.find_class(KOTLIN_CLASS).map_err(|e| format!("{}", e))?;
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
        let class = env.find_class(KOTLIN_CLASS).map_err(|e| format!("{}", e))?;
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
        let class = env.find_class(KOTLIN_CLASS).map_err(|e| format!("{}", e))?;
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


