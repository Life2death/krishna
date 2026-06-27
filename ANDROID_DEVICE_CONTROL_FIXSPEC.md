# Android Device Control — Phase 1 FIX SPEC (for the coding agent)

Status: the Phase-1 device-control draft (in `D:\Learning\krishna-agent2`, **uncommitted**) is **not
functional**. The TypeScript wiring and the per-command Android logic are fine, but the native
plumbing is wrong and **it was never built for Android** (only `tsc` ran, which doesn't compile Kotlin
or Rust). Fix the items below in order, then prove on the device, then commit.

> Verified against the Tauri v2 mobile-plugin API. Do not trust the previous summary's claim that
> "Android delegates to the Kotlin bridge" — it does not (see Fix 1). Also: the brain is **Node/Fastify**,
> not Python — any "system prompt" step happens there, not in a Python service.

---

## Fix 1 — Connect the Rust↔Kotlin bridge (FATAL; nothing works without this)
`device_control.rs` registers Rust `#[tauri::command]` stubs and **never calls
`register_android_plugin`**, so the Kotlin plugin is never loaded and every `invoke` hits a dead Rust
stub (torch silently no-ops; the rest return errors). Replace the whole file with this — **no Rust
command handlers at all**; the Kotlin `@Command`s are the handlers:

```rust
// src-tauri/src/device_control.rs
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Android package that hosts the Kotlin DeviceControlPlugin.
#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.krishna.assistant";

/// Registers the device-control plugin. On Android it binds the Kotlin
/// `DeviceControlPlugin`; the frontend invokes `plugin:device-control|<cmd>`
/// which routes directly to the Kotlin `@Command` methods.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("device-control")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin(PLUGIN_IDENTIFIER, "DeviceControlPlugin")?;
            }
            Ok(())
        })
        .build()
}
```

Keep the `lib.rs` wiring as-is — it's already correct:
```rust
#[cfg(mobile)]
mod device_control;
// ...
#[cfg(mobile)]
{ builder = builder.plugin(device_control::init()); }
```
The frontend already guards with `isAndroid()` before invoking, so desktop never calls it — no
desktop stub needed.

---

## Fix 2 — Kotlin must use the real Tauri v2 API (won't compile otherwise)
`DeviceControlPlugin.kt` uses an API shape that isn't Tauri v2. Three required changes:

1. **Superclass:** `class DeviceControlPlugin(private val activity: Activity) : Plugin(activity)`
   (it currently does `: Plugin` with no constructor call).
2. **Remove** `override val name = "device-control"` — Tauri v2's `Plugin` has no such property; the
   name comes from `Builder::new("device-control")` + `register_android_plugin` (Fix 1).
3. **Arguments:** replace every `invoke.getBoolean/getString/getInt(...)` with `@InvokeArg` classes +
   `invoke.parseArgs(...)`.

Add the import: `import app.tauri.annotation.InvokeArg`. Define one args class per command that takes
input (required field → `lateinit var` / non-null with default; optional → default value):

```kotlin
@InvokeArg internal class SetTorchArgs { var on: Boolean = false }
@InvokeArg internal class LaunchAppArgs { lateinit var packageName: String }
@InvokeArg internal class OpenSettingArgs { lateinit var name: String; var packageName: String? = null }
@InvokeArg internal class SetVolumeArgs { var stream: String = "music"; var level: Int = 0 }
@InvokeArg internal class SetDndArgs { var filter: String = "all" }
// setTorch/listApps/requestBluetoothEnable: listApps + requestBluetoothEnable take no args.
```

Command bodies use `parseArgs` — e.g.:
```kotlin
@Command
fun setTorch(invoke: Invoke) {
    val args = invoke.parseArgs(SetTorchArgs::class.java)
    try {
        val cm = activity.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val camId = cm.cameraIdList.firstOrNull { id ->
            cm.getCameraCharacteristics(id)
              .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        } ?: return invoke.reject("No camera with flash")   // Fix 5: don't assume [0]
        cm.setTorchMode(camId, args.on)
        invoke.resolve(JSObject().apply { put("ok", true) })
    } catch (e: Exception) { invoke.reject(e.message ?: "Failed to set torch") }
}

@Command
fun launchApp(invoke: Invoke) {
    val args = invoke.parseArgs(LaunchAppArgs::class.java)
    val intent = activity.packageManager.getLaunchIntentForPackage(args.packageName)
        ?: return invoke.reject("No launch intent for ${args.packageName}")
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    activity.startActivity(intent)
    invoke.resolve(JSObject().apply { put("ok", true) })
}
```
Keep the existing Android logic in the other commands (`queryIntentActivities`, the `Settings.ACTION_*`
map, `AudioManager`, the DND `isNotificationPolicyAccessGranted` gate) — it's correct; only swap the
arg-reading to `parseArgs` and the superclass/name per above. Remove the unused accessibility imports
(`AccessibilityEvent`, `AccessibilityNodeInfo`) and `Manifest`/`ContextCompat` if still unused.

---

## Fix 3 — Build it for Android and PROVE setTorch FIRST (the actual gate)
`tsc` does not compile Kotlin or Rust — none of the above was caught because the Android build never
ran. On the **physical phone** (USB debugging):
```
cd D:\Learning\krishna-agent2   # (or wherever this lands after Fix 6)
npm install
npm run tauri android dev
```
⚠️ **Do NOT run `tauri android init`** — it regenerates `gen/android/` and will delete
`DeviceControlPlugin.kt`. The `gen/android` project is committed; edit in place.
Then, in order: prove **`setTorch`** (flashlight physically toggles by voice/`invoke`) **before**
touching anything else. Only once the bridge is proven, verify `listApps` / `launchApp` /
`openSetting`, then DND/volume. Report the actual on-device result of each, not a `tsc` pass.

---

## Fix 4 — Reconcile onto current `main` (voice-ID is now merged there)
This WIP is based on the pre-voice `main` and edits the same files voice-ID changed
(`src/lib/actions.ts`, `packages/core/action-policy.ts`, `src/types/assistant.ts`,
`packages/core/types/assistant.ts`). Per the build-on-`main` workflow:
1. `git fetch origin && git merge origin/main` (or rebase) into your working branch — **expect
   conflicts** in those four files.
2. Resolve so **both** feature sets survive: voice-ID's `resolveActionForConfirm` gate (3 exec paths)
   **and** the 7 new device-control action types. Device actions classified `sensitive` must route
   through the same unverified-speaker confirmation path voice-ID added.
3. Commit per build-passing step (typecheck + Android build green). Do not leave it uncommitted again.

---

## Fix 5 — Smaller items
- `cameraIdList[0]` → pick a camera whose `FLASH_INFO_AVAILABLE == true` (shown in Fix 2).
- Drop `BIND_ACCESSIBILITY_SERVICE` from the manifest **until** an AccessibilityService actually
  exists — right now there's a permission and unused imports but no service. (Toggling
  Bluetooth/Wi-Fi/location for real is a later phase that needs that service; Phase 1 only `openSetting`s
  the page.)

---

## Validation gate (before this is considered done)
- [ ] Android build compiles (Kotlin + Rust) — `npm run tauri android dev` succeeds.
- [ ] `setTorch` physically toggles the flashlight on the device.
- [ ] `listApps` returns real apps; `launchApp` opens one; `openSetting("bluetooth")` opens the page.
- [ ] Desktop build still compiles and the actions no-op with the "only on Android" message.
- [ ] Reconciled onto `main` with voice-ID intact; committed.

Report each checkbox with the real result. "tsc passes" alone does **not** satisfy this gate.
