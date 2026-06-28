# 26 June — Android Device Control: Phase 1 (Plugin + Frontend Bridge)

## What was done

### Files created
- **`src-tauri/gen/android/app/src/main/java/com/krishna/assistant/DeviceControlPlugin.kt`** — Kotlin Tauri v2 plugin with 7 commands:
  - `setTorch(on: Boolean)` — toggle camera flashlight via `CameraManager.setTorchMode`
  - `listApps()` — query launchable activities via `PackageManager.queryIntentActivities`
  - `launchApp(packageName: String)` — launch via `getLaunchIntentForPackage`
  - `openSetting(name: String, packageName?: String)` — open system settings panels (wifi, bluetooth, location, nfc, sound, display, battery, accessibility, app_details)
  - `setVolume(stream?: String, level: Int)` — set ring/alarm/notification/music volume
  - `setDnd(filter: String)` — set Do Not Disturb interruption filter (requires notification policy access)
  - `requestBluetoothEnable()` — request Bluetooth enable via system intent

- **`src-tauri/src/device_control.rs`** — Rust plugin wrapper registering 7 commands; on Android delegates to Kotlin bridge, on desktop returns "only available on Android"

### Files modified
- **`src-tauri/src/lib.rs`** — added `#[cfg(mobile)] mod device_control;` and `.plugin(device_control::init())`
- **`src-tauri/gen/android/app/src/main/AndroidManifest.xml`** — added `FLASHLIGHT`, `QUERY_ALL_PACKAGES`, `ACCESS_NOTIFICATION_POLICY`, `BLUETOOTH`/`BLUETOOTH_ADMIN`/`BLUETOOTH_CONNECT`, `BIND_ACCESSIBILITY_SERVICE`
- **`src/types/assistant.ts`** — extended `Action` union with 7 new device-control types
- **`packages/core/types/assistant.ts`** — same union extension (core workspace mirror)
- **`src/lib/actions.ts`** — extended `parseActions()` to recognize all 7 new action blocks; added `executeAction()` dispatch with `isAndroid()` platform guard
- **`packages/core/action-policy.ts`** — classified `list_apps` as `safe`, all others default to `sensitive`
- **`src/lib/platform.ts`** — added `isAndroid()` helper (user-agent check)

### Verified
- `tsc --noEmit`: zero new type errors (only pre-existing missing-node_modules errors)

## Architecture
- Frontend → `parseActions()` extracts action blocks from AI reply
- `executeAction()` checks `isAndroid()`, then `invoke("plugin:device-control|<command>", args)`
- Tauri v2 mobile bridge routes to Kotlin `@Command` methods on Android
- Desktop path returns spoken "not available on this device"
- Rust stubs provide fallback: desktop → error, Android → handled by Kotlin

## Next steps
1. `npm install` in this worktree
2. `npm run tauri android dev` on a physical device
3. Test `setTorch` first, then `listApps`/`launchApp`/`openSetting`
4. Phase 3: DND + volume + bluetooth enable (already wired, needs testing)
5. Update system prompt in Python brain so AI knows about Android device-control actions
6. (Future) Accessibility Service for app context/gestures
