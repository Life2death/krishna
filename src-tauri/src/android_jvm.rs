//! Shared JVM access for Android JNI bridges (keystore, TTS).
//!
//! Neither tauri, tao, nor wry initializes the `ndk-context` crate, so
//! `ndk_context::android_context()` always panics in this app — which meant
//! every JNI bridge built on it silently failed. And exporting our own
//! `JNI_OnLoad` from the app cdylib broke wry's webview bootstrap (SIGSEGV
//! creating the dashboard window — learned the hard way).
//!
//! The framework-blessed source is tao's own bookkeeping:
//! `tao::platform::android::prelude::main_android_context()` exposes the
//! `JavaVM` pointer and the Activity jobject that tao stores when the
//! activity is created — the exact same handles tao itself uses for JNI.

#![cfg(target_os = "android")]

use jni::objects::JObject;
use jni::JNIEnv;
use tao::platform::android::prelude::main_android_context;

fn android_context() -> Result<tao::platform::android::prelude::AndroidContext, String> {
    main_android_context()
        .ok_or_else(|| "[jvm] tao main_android_context not available yet".to_string())
}

pub fn with_env<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut JNIEnv) -> Result<R, String>,
{
    let ctx = android_context()?;
    if ctx.java_vm.is_null() {
        return Err("[jvm] JavaVM pointer is null".to_string());
    }
    let vm = unsafe { jni::JavaVM::from_raw(ctx.java_vm.cast()) }
        .map_err(|e| format!("[jvm] JavaVM::from_raw failed: {}", e))?;
    // Daemon attach, matching tao's own pattern (`AndroidContext::create_activity`)
    // — no detach-on-drop guard that could yank the JNIEnv out from under
    // framework code sharing this thread.
    let mut env = vm
        .attach_current_thread_as_daemon()
        .map_err(|e| format!("[jvm] JNI attach failed: {}", e))?;
    let result = f(&mut env);
    // CRITICAL: a failed JNI call leaves its Java exception PENDING on the
    // thread. Returning Err gracefully is not enough — the next JNI call made
    // by ANYONE on this thread (e.g. wry creating a webview) hits CheckJNI's
    // "called with pending exception" and aborts the whole process. This was
    // the startup SIGABRT/SIGSEGV in create_dashboard_window.
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
    }
    result
}

/// Load an app class (e.g. `com.krishna.assistant.TtsHelper`) via the
/// Activity's classloader. `env.find_class` CANNOT be used from native
/// threads — they get the system classloader, which doesn't see app classes
/// (throws ClassNotFoundException every time).
pub fn find_app_class<'a>(env: &mut JNIEnv<'a>, dotted_name: &str) -> Result<JObject<'a>, String> {
    let ctx = application_context(env)?;
    let loader = env
        .call_method(&ctx, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
        .map_err(|e| format!("[jvm] getClassLoader failed: {}", e))?
        .l()
        .map_err(|e| format!("[jvm] classloader not an object: {}", e))?;
    let name = env
        .new_string(dotted_name)
        .map_err(|e| format!("[jvm] new_string failed: {}", e))?;
    let name_obj: JObject = name.into();
    env.call_method(
        loader,
        "loadClass",
        "(Ljava/lang/String;)Ljava/lang/Class;",
        &[jni::objects::JValue::Object(&name_obj)],
    )
    .map_err(|e| format!("[jvm] loadClass({}) failed: {}", dotted_name, e))?
    .l()
    .map_err(|e| format!("[jvm] loaded class not an object: {}", e))
}

/// The Activity jobject tao stored at creation (an Activity IS a Context).
pub fn application_context<'a>(_env: &mut JNIEnv<'a>) -> Result<JObject<'a>, String> {
    let ctx = android_context()?;
    if ctx.context_jobject.is_null() {
        return Err("[jvm] context_jobject is null".to_string());
    }
    Ok(unsafe { JObject::from_raw(ctx.context_jobject.cast()) })
}
