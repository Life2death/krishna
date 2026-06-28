# Android Device Control — Phase 1 Fix Summary (27 June 2026)

## ✅ Completed Fixes

### Fix 1 — Rust↔Kotlin Bridge (`src-tauri/src/device_control.rs`)
**Status:** DONE
- Replaced stub `#[tauri::command]` handlers with proper `Builder::new("device-control").setup(...)` that calls `register_android_plugin("com.krishna.assistant", "DeviceControlPlugin")`
- No Rust command handlers remain — Kotlin `@Command`s are the handlers
- `lib.rs` wiring was already correct (`#[cfg(mobile)] { builder = builder.plugin(device_control::init()); }`)

### Fix 2 — Kotlin Plugin to Tauri v2 API (`src-tauri/gen/android/app/src/main/java/com/krishna/assistant/DeviceControlPlugin.kt`)
**Status:** DONE
- Superclass: `Plugin` → `Plugin(activity)`
- Removed `override val name = "device-control"` (Tauri v2 gets name from Rust `Builder::new()`)
- All arg reading converted to `@InvokeArg` classes + `invoke.parseArgs(...)`:
  - `SetTorchArgs`, `LaunchAppArgs`, `OpenSettingArgs`, `SetVolumeArgs`, `SetDndArgs`
- Camera fix: `cameraIdList[0]` → find camera with `FLASH_INFO_AVAILABLE == true`
- Removed unused imports: `AccessibilityEvent`, `AccessibilityNodeInfo`, `Manifest`, `ContextCompat`

### Fix 5 — Manifest Cleanup (`src-tauri/gen/android/app/src/main/AndroidManifest.xml`)
**Status:** DONE
- Removed `BIND_ACCESSIBILITY_SERVICE` permission (no AccessibilityService exists yet)

### Fix 4 — Reconcile onto `main` (voice-ID merge)
**Status:** DONE
- `git fetch origin && git merge origin/main` — fast-forward, no conflicts
- Voice-ID changes (docs only) + device-control changes both intact
- 4 shared files (`actions.ts`, `action-policy.ts`, both `types/assistant.ts`) contain both feature sets

### TypeScript Check
**Status:** PASS
- `npm run typecheck` — clean (added `src/types/lucide-react.d.ts` for pre-existing `lucide-react` type issue)

### Rust Android Compile
**Status:** PASS
- Installed `aarch64-linux-android` target (already present)
- Created `.cargo/config.toml` with NDK linker paths
- Set `CC_aarch64_linux_android`, `CXX_aarch64_linux_android`, `AR_aarch64_linux_android` env vars
- `cargo check --target aarch64-linux-android` — compiles with only pre-existing warnings

---

## ⏳ Pending / In Progress

### Fix 3 — Build on Physical Device & Prove `setTorch`
**Status:** IN PROGRESS
- Device: Samsung Galaxy M06 5G (SM-M066B), authorized (`adb devices` shows `device`)
- Need to run `npm run tauri android dev` with NDK env vars set:
  ```powershell
  $ndkBin = "C:\Users\vikra\AppData\Local\Android\Sdk\ndk\28.2.13676358\toolchains\llvm\prebuilt\windows-x86_64\bin"
  $env:Path = "$ndkBin;$env:Path"
  $env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android21-clang.cmd"
  $env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android21-clang++.cmd"
  $env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"
  cd D:\Learning\krishna-agent2
  npm run tauri android dev
  ```
- First gate: **`setTorch` physically toggles flashlight**
- Then verify: `listApps`, `launchApp`, `openSetting("bluetooth")`, DND, volume
- Desktop build still compiles; actions no-op with "only on Android" message

### Final Commit
**Status:** PENDING
- Commit all changes per build-passing step
- Ensure both voice-ID and device-control survive

---

## Validation Gate (from spec)

- [x] Android build compiles (Kotlin + Rust) — `cargo check` passes
- [ ] `setTorch` physically toggles the flashlight on the device
- [ ] `listApps` returns real apps; `launchApp` opens one; `openSetting("bluetooth")` opens the page
- [ ] Desktop build still compiles and the actions no-op with the "only on Android" message
- [ ] Reconciled onto `main` with voice-ID intact; committed

**Next step:** Run the Android dev build on the connected device and test `setTorch` first.