//! Native Android Text-To-Speech via JNI.
//!
//! Bridges to `com.krishna.assistant.TtsHelper` (Kotlin), which drives the
//! platform `android.speech.tts.TextToSpeech` engine. Used because the Android
//! WebView exposes no `window.speechSynthesis` and the desktop Piper engine
//! can't run on Android (it spawns an x86 subprocess).
//!
//! JVM access comes from the shared `android_jvm` module (JNI_OnLoad-backed).

#![cfg(target_os = "android")]

use crate::android_jvm::{application_context, find_app_class, with_env};
use jni::objects::{JClass, JObject, JValue};

const KOTLIN_CLASS: &str = "com.krishna.assistant.TtsHelper";

/// Speak `text` through the native Android TTS engine.
pub fn speak(text: &str) -> Result<(), String> {
    with_env(|env| {
        let context = application_context(env)?;

        let jtext = env
            .new_string(text)
            .map_err(|e| format!("[tts] new_string failed: {}", e))?;
        let jtext_obj: JObject = jtext.into();

        let class = JClass::from(find_app_class(env, KOTLIN_CLASS)?);
        env.call_static_method(
            class,
            "speak",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[JValue::Object(&context), JValue::Object(&jtext_obj)],
        )
        .map_err(|e| format!("[tts] speak call failed: {}", e))?;
        Ok(())
    })
}

/// Stop any in-progress speech and clear the queue.
pub fn stop() -> Result<(), String> {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, KOTLIN_CLASS)?);
        env.call_static_method(class, "stop", "()V", &[])
            .map_err(|e| format!("[tts] stop call failed: {}", e))?;
        Ok(())
    })
}
