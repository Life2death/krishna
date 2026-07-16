//! Android device-control JNI bridges: app launcher, volume/media keys, torch.
//! Same JVM/classloader plumbing as `tts_android` (see `android_jvm`).

#![cfg(target_os = "android")]

use crate::android_jvm::{application_context, find_app_class, with_env};
use jni::objects::{JClass, JObject, JString, JValue};

const LAUNCHER_CLASS: &str = "com.krishna.assistant.AppLauncherHelper";
const MEDIA_CLASS: &str = "com.krishna.assistant.MediaControlHelper";
const HANDS_FREE_CLASS: &str = "com.krishna.assistant.KrishnaHandsFreeService";
const WAKE_WORD_BRIDGE: &str = "com.krishna.assistant.WakeWordBridgeHelper";
const ASSIST_BRIDGE_CLASS: &str = "com.krishna.assistant.AssistBridgeHelper";

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

/// Open a canonical YouTube Music URL, preferring the installed Android app.
pub fn open_youtube_music(url: &str) -> Result<String, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let jurl = env
            .new_string(url)
            .map_err(|e| format!("[launcher] music URL string: {}", e))?;
        let jurl_obj: JObject = jurl.into();
        let class = JClass::from(find_app_class(env, LAUNCHER_CLASS)?);
        let result = env
            .call_static_method(
                class,
                "openYouTubeMusic",
                "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&context), JValue::Object(&jurl_obj)],
            )
            .map_err(|e| format!("[launcher] openYouTubeMusic failed: {}", e))?
            .l()
            .map_err(|e| format!("[launcher] openYouTubeMusic not a string: {}", e))?;
        let destination: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[launcher] openYouTubeMusic string conversion: {}", e))?
            .into();
        match destination.as_str() {
            "YOUTUBE_MUSIC" | "WEB_FALLBACK" => Ok(destination),
            "NO_HANDLER" => Err("No application can open YouTube Music".to_string()),
            other => Err(format!("Unknown YouTube Music launch result: {}", other)),
        }
    })
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

// ── Accessibility gestures (Phase C) ──────────────────────────────────

const A11Y_CLASS: &str = "com.krishna.assistant.KrishnaAccessibilityService";

/// Is the accessibility service enabled (user opt-in in system settings)?
pub fn a11y_is_enabled() -> Result<bool, String> {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, A11Y_CLASS)?);
        env.call_static_method(class, "isEnabled", "()Z", &[])
            .map_err(|e| format!("[a11y] isEnabled failed: {}", e))?
            .z()
            .map_err(|e| format!("[a11y] isEnabled not a bool: {}", e))
    })
}

/// kind: "tap" | "swipe_up/down/left/right" | "zoom_in/out" | "back" | "home"
///       | "recents" | "notifications"
pub fn a11y_gesture(kind: &str) -> Result<bool, String> {
    with_env(|env| {
        let jkind = env
            .new_string(kind)
            .map_err(|e| format!("[a11y] new_string: {}", e))?;
        let jkind_obj: JObject = jkind.into();
        let class = JClass::from(find_app_class(env, A11Y_CLASS)?);
        env.call_static_method(
            class,
            "gesture",
            "(Ljava/lang/String;)Z",
            &[JValue::Object(&jkind_obj)],
        )
        .map_err(|e| format!("[a11y] gesture failed: {}", e))?
        .z()
        .map_err(|e| format!("[a11y] gesture not a bool: {}", e))
    })
}

/// Click one uniquely matched visible button by its text, content description,
/// or final resource-id segment. The Android service returns a stable result
/// code so the caller can report an actionable failure.
pub fn a11y_click_button(label: &str) -> Result<String, String> {
    with_env(|env| {
        let jlabel = env
            .new_string(label)
            .map_err(|e| format!("[a11y] new label string: {}", e))?;
        let jlabel_obj: JObject = jlabel.into();
        let class = JClass::from(find_app_class(env, A11Y_CLASS)?);
        let result = env
            .call_static_method(
                class,
                "clickButton",
                "(Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&jlabel_obj)],
            )
            .map_err(|e| format!("[a11y] clickButton failed: {}", e))?
            .l()
            .map_err(|e| format!("[a11y] clickButton not a string: {}", e))?;
        let value: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[a11y] clickButton string conversion: {}", e))?
            .into();
        Ok(value)
    })
}

/// Open the system Accessibility settings screen (for the one-time enable).
pub fn a11y_open_settings() -> Result<(), String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, A11Y_CLASS)?);
        env.call_static_method(
            class,
            "openSettings",
            "(Landroid/content/Context;)V",
            &[JValue::Object(&context)],
        )
        .map_err(|e| format!("[a11y] openSettings failed: {}", e))?;
        Ok(())
    })
}

pub fn hands_free_start() -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, HANDS_FREE_CLASS)?);
        env.call_static_method(
            class,
            "start",
            "(Landroid/content/Context;)Z",
            &[JValue::Object(&context)],
        )
        .map_err(|e| format!("[hands-free] start failed: {}", e))?
        .z()
        .map_err(|e| format!("[hands-free] start not a bool: {}", e))
    })
}

pub fn hands_free_stop() -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, HANDS_FREE_CLASS)?);
        env.call_static_method(
            class,
            "stop",
            "(Landroid/content/Context;)Z",
            &[JValue::Object(&context)],
        )
        .map_err(|e| format!("[hands-free] stop failed: {}", e))?
        .z()
        .map_err(|e| format!("[hands-free] stop not a bool: {}", e))
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

pub fn wake_word_get_profile() -> Result<String, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "getProfileJson",
                "(Landroid/content/Context;)Ljava/lang/String;",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("[ww] getProfileJson failed: {}", e))?
            .l()
            .map_err(|e| format!("[ww] getProfileJson not string: {}", e))?;
        let value: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[ww] getProfileJson string conv: {}", e))?
            .into();
        Ok(value)
    })
}

pub fn wake_word_update_field(field: String, value: String) -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let jfield = env
            .new_string(&field)
            .map_err(|e| format!("[ww] new_string field: {}", e))?;
        let jvalue = env
            .new_string(&value)
            .map_err(|e| format!("[ww] new_string value: {}", e))?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "updateProfileField",
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)Z",
                &[
                    JValue::Object(&context),
                    JValue::Object(&jfield.into()),
                    JValue::Object(&jvalue.into()),
                ],
            )
            .map_err(|e| format!("[ww] updateProfileField failed: {}", e))?
            .z()
            .map_err(|e| format!("[ww] updateProfileField not bool: {}", e))?;
        Ok(result)
    })
}

pub fn wake_word_reset() -> Result<bool, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "resetProfile",
                "(Landroid/content/Context;)Z",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("[ww] resetProfile failed: {}", e))?
            .z()
            .map_err(|e| format!("[ww] resetProfile not bool: {}", e))?;
        Ok(result)
    })
}

pub fn wake_word_get_detector_state() -> Result<String, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "getDetectorState",
                "(Landroid/content/Context;)Ljava/lang/String;",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("[ww] getDetectorState failed: {}", e))?
            .l()
            .map_err(|e| format!("[ww] getDetectorState not string: {}", e))?;
        let value: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[ww] getDetectorState string conv: {}", e))?
            .into();
        Ok(value)
    })
}

pub fn wake_word_run_evaluation() -> Result<String, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "runEvaluation",
                "(Landroid/content/Context;)Ljava/lang/String;",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("[ww] runEvaluation failed: {}", e))?
            .l()
            .map_err(|e| format!("[ww] runEvaluation not string: {}", e))?;
        let value: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[ww] runEvaluation string conv: {}", e))?
            .into();
        Ok(value)
    })
}

pub fn wake_word_capture_clip(label: String) -> Result<String, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let jlabel = env
            .new_string(&label)
            .map_err(|e| format!("[ww] new_string label: {}", e))?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "captureClip",
                "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&context), JValue::Object(&jlabel.into())],
            )
            .map_err(|e| format!("[ww] captureClip failed: {}", e))?
            .l()
            .map_err(|e| format!("[ww] captureClip not string: {}", e))?;
        let value: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[ww] captureClip string conv: {}", e))?
            .into();
        Ok(value)
    })
}

pub fn wake_word_training_summary() -> Result<String, String> {
    with_env(|env| {
        let context = application_context(env)?;
        let class = JClass::from(find_app_class(env, WAKE_WORD_BRIDGE)?);
        let result = env
            .call_static_method(
                class,
                "getTrainingSummary",
                "(Landroid/content/Context;)Ljava/lang/String;",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("[ww] getTrainingSummary failed: {}", e))?
            .l()
            .map_err(|e| format!("[ww] getTrainingSummary not string: {}", e))?;
        let value: String = env
            .get_string(&JString::from(result))
            .map_err(|e| format!("[ww] getTrainingSummary string conv: {}", e))?
            .into();
        Ok(value)
    })
}

/// True at most once per system assist gesture (long-press home etc.) that
/// just brought MainActivity to the foreground — JS should start listening
/// immediately, exactly like a mic tap. See AssistBridgeHelper.kt.
pub fn assist_take_pending() -> Result<bool, String> {
    with_env(|env| {
        let class = JClass::from(find_app_class(env, ASSIST_BRIDGE_CLASS)?);
        env.call_static_method(class, "takePending", "()Z", &[])
            .map_err(|e| format!("[assist] takePending failed: {}", e))?
            .z()
            .map_err(|e| format!("[assist] takePending not a bool: {}", e))
    })
}
