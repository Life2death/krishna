//! Android device-control JNI bridges: app launcher, volume/media keys, torch.
//! Same JVM/classloader plumbing as `tts_android` (see `android_jvm`).

#![cfg(target_os = "android")]

use crate::android_jvm::{application_context, find_app_class, with_env};
use jni::objects::{JClass, JObject, JValue};

const LAUNCHER_CLASS: &str = "com.krishna.assistant.AppLauncherHelper";
const MEDIA_CLASS: &str = "com.krishna.assistant.MediaControlHelper";

#[derive(serde::Deserialize)]
struct AppEntry {
    label: String,
    package: String,
}

/// List launchable apps as (label, package) pairs.
fn list_apps() -> Result<Vec<AppEntry>, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, LAUNCHER_CLASS)?);
        let result = env
            .call_static_method(
                class,
                "listApps",
                "(Landroid/content/Context;)Ljava/lang/String;",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("[launcher] listApps failed: {}", e))?
            .l()
            .map_err(|e| format!("[launcher] listApps not an object: {}", e))?;
        let json: String = env
            .get_string(&result.into())
            .map_err(|e| format!("[launcher] listApps string conv: {}", e))?
            .into();
        serde_json::from_str(&json).map_err(|e| format!("[launcher] bad JSON: {}", e))
    })
}

fn launch_package(package: &str) -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let jpkg = env
            .new_string(package)
            .map_err(|e| format!("[launcher] new_string: {}", e))?;
        let jpkg_obj: JObject = jpkg.into();
        let class = JClass::from(find_app_class(env, LAUNCHER_CLASS)?);
        env.call_static_method(
            class,
            "launchApp",
            "(Landroid/content/Context;Ljava/lang/String;)Z",
            &[JValue::Object(&context), JValue::Object(&jpkg_obj)],
        )
        .map_err(|e| format!("[launcher] launchApp failed: {}", e))?
        .z()
        .map_err(|e| format!("[launcher] launchApp not a bool: {}", e))
    })
}

/// Fuzzy-launch an app by spoken name: exact label > label prefix > label
/// substring > package substring. Returns the launched app's label.
pub fn launch_by_name(query: &str) -> Result<String, String> {
    let apps = list_apps()?;
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Err("Empty app name".to_string());
    }

    let pick = apps
        .iter()
        .find(|a| a.label.to_lowercase() == q)
        .or_else(|| apps.iter().find(|a| a.label.to_lowercase().starts_with(&q)))
        .or_else(|| apps.iter().find(|a| a.label.to_lowercase().contains(&q)))
        .or_else(|| apps.iter().find(|a| a.package.to_lowercase().contains(&q)));

    match pick {
        Some(app) => {
            if launch_package(&app.package)? {
                Ok(app.label.clone())
            } else {
                Err(format!("'{}' has no launchable activity", app.label))
            }
        }
        None => Err(format!("No installed app matches '{}'", query)),
    }
}

/// action: "up" | "down" | "mute" | "unmute" | "set" (value = percent for "set")
pub fn volume(action: &str, value: i32) -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let jaction = env
            .new_string(action)
            .map_err(|e| format!("[media] new_string: {}", e))?;
        let jaction_obj: JObject = jaction.into();
        let class = JClass::from(find_app_class(env, MEDIA_CLASS)?);
        env.call_static_method(
            class,
            "volume",
            "(Landroid/content/Context;Ljava/lang/String;I)Z",
            &[
                JValue::Object(&context),
                JValue::Object(&jaction_obj),
                JValue::Int(value),
            ],
        )
        .map_err(|e| format!("[media] volume failed: {}", e))?
        .z()
        .map_err(|e| format!("[media] volume not a bool: {}", e))
    })
}

/// action: "play_pause" | "play" | "pause" | "next" | "previous" | "stop"
pub fn media_key(action: &str) -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let jaction = env
            .new_string(action)
            .map_err(|e| format!("[media] new_string: {}", e))?;
        let jaction_obj: JObject = jaction.into();
        let class = JClass::from(find_app_class(env, MEDIA_CLASS)?);
        env.call_static_method(
            class,
            "mediaKey",
            "(Landroid/content/Context;Ljava/lang/String;)Z",
            &[JValue::Object(&context), JValue::Object(&jaction_obj)],
        )
        .map_err(|e| format!("[media] mediaKey failed: {}", e))?
        .z()
        .map_err(|e| format!("[media] mediaKey not a bool: {}", e))
    })
}

pub fn set_torch(on: bool) -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, MEDIA_CLASS)?);
        env.call_static_method(
            class,
            "setTorch",
            "(Landroid/content/Context;Z)Z",
            &[JValue::Object(&context), JValue::Bool(on as u8)],
        )
        .map_err(|e| format!("[media] setTorch failed: {}", e))?
        .z()
        .map_err(|e| format!("[media] setTorch not a bool: {}", e))
    })
}
