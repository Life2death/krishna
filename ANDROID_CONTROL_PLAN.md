# Android Device Control — Implementation Plan

**Goal:** On the Android Krishna app, let the owner control the phone by voice — launch any
installed app ("open Spotify"), and toggle/open system settings ("turn on the flashlight",
"open Bluetooth", "disable location").

**Decisions locked (2026-06-26):**
- Krishna is a **personal, sideloaded app — never on the Play Store.** Therefore Play policy
  restrictions (QUERY_ALL_PACKAGES declaration, Accessibility-service review) **do not apply** and
  we can use the most capable approach.
- Implementation = a **custom Tauri v2 Android plugin in Kotlin** (none exists today;
  `MainActivity.kt` is bare). Frontend calls it via `invoke(...)`, same pattern as the existing 25
  commands in [src-tauri/src/lib.rs:141](src-tauri/src/lib.rs).
- Voice commands map to actions through the existing action system
  ([src/lib/actions.ts](src/lib/actions.ts)) — new action types dispatch to the plugin on Android,
  no-op on desktop.

> Workflow note: Claude reviews & plans; the coding agent implements. The Android platform reality
> below is verified against current Android 13–15 docs — **do not "fix" the can't-toggle items by
> calling deprecated APIs; they return `false`/throw on modern Android.**

---

## Git workflow — READ FIRST (agent must follow)

This work runs **in parallel** with the voice-ID feature, which is being validated separately. To
avoid colliding with anyone's build, do all Android work in a **dedicated second worktree** — never
in the other two checkouts.

1. **Where you work:** your own worktree on a new branch off `main`:
   ```bash
   git worktree add -b feature/android-control ../krishna-agent2 main
   ```
   Do **all** edits in `D:\Learning\krishna-agent2`.
   - ❌ **Do NOT touch `D:\Learning\krishna`** — that's the user's stable/test checkout (on `main`).
   - ❌ **Do NOT touch `D:\Learning\krishna-agent`** — that worktree holds the voice-ID branch
     (`feature/voice-android`) currently being validated. Leave it alone.
2. **First-time setup in the worktree:** worktrees don't share `node_modules` or the Rust `target/`,
   so run `npm install` at the worktree root first.
   - ⚠️ **Known gotcha (we hit it):** the worktree `npm install` can leave **truncated native
     binaries**, failing at runtime with *"Cannot find native binding"* / *"not a valid Win32
     application"* (seen with `@tauri-apps/cli-win32-x64-msvc` and `@rolldown/binding-win32-x64-msvc`).
     Fix by copying the good binary of the **same version** from `D:\Learning\krishna\node_modules\…`
     over the broken one in `D:\Learning\krishna-agent2\node_modules\…`. Verify with
     `node -e "require('@tauri-apps/cli')"`.
3. **Build order (per §3 below):** start with **Phase 1** — scaffold the `device-control` Kotlin
   plugin and prove the bridge with `setTorch` (flashlight toggles by `invoke`) before anything else.
   Then `launchApp`/`listApps` + `openSetting`, then DND, then (Phase 3) the Accessibility Service.
4. **Testing target: a PHYSICAL Android device** (confirmed) — emulators fake/lack the hardware these
   features need. Deploy via `npm run tauri android dev` (USB debugging on) or sideload the APK.
5. **Commit hygiene:** commit after each build-passing step; `npm run typecheck` + a successful
   Android build must pass. Don't leave half-written files. Open a PR per phase; Claude reviews, the
   user merges `feature/android-control` → `main`. Do not merge to `main` yourself.
6. **Keep current:** if `main` advances (e.g. voice-ID merges), `git fetch && git merge origin/main`
   into your branch so you don't drift.

> If you're about to edit a file in `D:\Learning\krishna` or `D:\Learning\krishna-agent`, stop —
> you're in the wrong directory. All Android work happens in `D:\Learning\krishna-agent2`.

---

## 0. What's actually possible (verified capability matrix)

| Action | Without Accessibility Service | With Accessibility Service |
|---|---|---|
| **Launch installed app** by package | ✅ `getLaunchIntentForPackage` + `startActivity` | — |
| **List all installed apps** | ✅ via `QUERY_ALL_PACKAGES` (fine — sideloaded) | — |
| **Flashlight / torch** | ✅ `CameraManager.setTorchMode` — *zero permissions* | — |
| **Volume / ringer** | ✅ `AudioManager` | — |
| **Do Not Disturb** | ✅ `NotificationManager.setInterruptionFilter` (one-time `ACCESS_NOTIFICATION_POLICY` grant) | — |
| **Open** any settings screen | ✅ `Settings.ACTION_*` / `Settings.Panel.ACTION_*` intents | — |
| **Toggle Bluetooth on/off** | ❌ removed for normal apps (API 33+) — can only fire the system "enable?" dialog or open settings | ✅ automate the Quick-Settings / settings toggle |
| **Toggle Wi-Fi on/off** | ❌ `setWifiEnabled` dead since API 29 — Settings Panel only | ✅ automate toggle |
| **Toggle Location on/off** | ❌ no public API — open `ACTION_LOCATION_SOURCE_SETTINGS` only | ✅ automate toggle |
| **Airplane mode** | ❌ system-app only | ⚠️ automate via UI (fragile) |

**Implication:** to literally satisfy "turn on Bluetooth" / "disable location" by voice (not just
"open the Bluetooth page"), we need the **Accessibility Service** (Phase 3). Since Krishna is
personal/sideloaded, that's acceptable — the owner enables it once.

Sources: Android package-visibility, `BluetoothAdapter` (deprecated enable/disable API 33),
`WifiManager.setWifiEnabled` (deprecated API 29), `CameraManager.setTorchMode`, `Settings.ACTION_*`,
Tauri v2 mobile plugin guide (https://v2.tauri.app/develop/plugins/develop-mobile/).

---

## 1. The Kotlin plugin (`device-control`)

Create a Tauri v2 Android plugin (Kotlin) registered in the Rust `Builder` and invokable from JS as
`invoke("plugin:device-control|<command>", { ... })`. Use the official `@TauriPlugin` / `@Command` /
`@InvokeArg` pattern. Long/blocking work → coroutine on `Dispatchers.IO` to avoid ANR. Every command
resolves `{ ok, ... }` or `reject("reason")`.

### 1.1 Phase 1 — no-special-permission commands (build first)
- `listApps()` → `[{ label, packageName }]`. Enumerate launcher activities
  (`queryIntentActivities(MAIN+LAUNCHER)`), read `loadLabel`. Build the name→package map here.
- `launchApp({ packageName })` → `getLaunchIntentForPackage` + `FLAG_ACTIVITY_NEW_TASK` +
  `startActivity`; `reject` if null.
- `setTorch({ on })` → `CameraManager.setTorchMode`. Flagship "it really works" feature.
- `setVolume({ stream, level })` / `setRingerMode({ mode })` → `AudioManager`.
- `openSetting({ name })` → generic dispatcher mapping logical names ("bluetooth", "wifi",
  "location", "airplane", "nfc", "sound", "battery", "app_details") to the right
  `Settings.ACTION_*` / `Settings.Panel.ACTION_*` intent. **This is the universal fallback.**

**Manifest** ([src-tauri/gen/android/app/src/main/AndroidManifest.xml](src-tauri/gen/android/app/src/main/AndroidManifest.xml)):
add `<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES"/>` and
`<uses-permission android:name="android.permission.ACCESS_NOTIFICATION_POLICY"/>`.

### 1.2 Phase 2 — DND + the "enable?" dialogs
- `setDnd({ filter })` → `NotificationManager.setInterruptionFilter`. Guard with
  `isNotificationPolicyAccessGranted()`; if missing, send the user to
  `ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS` (one-time) and return `needsPermission:true`.
- `requestBluetoothEnable()` → fire `BluetoothAdapter.ACTION_REQUEST_ENABLE` (honest "ask the user"
  path; there is no programmatic disable).

### 1.3 Phase 3 — Accessibility Service (the real toggles)
- Add an `AccessibilityService` that can navigate Quick Settings / Settings UI to flip
  **Bluetooth / Wi-Fi / Location**. Commands like `toggleSystem({ target: "bluetooth"|"wifi"|"location", on })`
  drive it (e.g. open the settings screen via intent, then `performAction`/gesture on the toggle
  node, matched by text/resource-id).
- The owner must **enable the service once** in Android Settings; provide an in-app button that
  opens `ACTION_ACCESSIBILITY_SETTINGS` and explains why.
- ⚠️ This is powerful and brittle across OEM skins — match nodes defensively (by text + className),
  and **always fall back to `openSetting()`** if a node isn't found, so the command degrades to
  "opened the Bluetooth page for you" rather than failing silently.
- Security: this service can read/act on screen content. Keep its config minimal (only the settings
  packages), document it, and gate device actions behind the **voice-ID verification** from
  [VOICE_IDENTITY_PLAN.md](VOICE_IDENTITY_PLAN.md) so only the owner's voice triggers them.

---

## 2. Frontend wiring (action system)

### 2.1 New action types ([src/types/assistant.ts](src/types), [src/lib/actions.ts](src/lib/actions.ts))
Extend the parsed `Action` union and `executeAction`:
- `{ action: "launch_app", target }` → resolve spoken name against the `listApps()` label map →
  `invoke("plugin:device-control|launchApp", { packageName })`.
- `{ action: "set_torch", on }`, `{ action: "set_volume", stream, level }`,
  `{ action: "set_dnd", filter }`.
- `{ action: "open_setting", name }` and `{ action: "toggle_system", target, on }`
  (the latter uses the Accessibility path; if unavailable, auto-degrade to `open_setting`).

### 2.2 Platform guard
- These actions are **Android-only**. On desktop, either no-op with a spoken "that's a phone-only
  action" or route to the existing desktop `open_target`. Gate by the existing platform detection.

### 2.3 Teach the AI to emit them
- Update the system prompt / tool description so the model knows it can emit `launch_app`,
  `set_torch`, `open_setting`, `toggle_system`, etc. — mirror how `open` / `remember` are taught
  today. Provide the app label list (from `listApps()`) so name resolution is accurate.

### 2.4 Action policy / confirmation
- Classify in [packages/core/action-policy.ts](packages/core/action-policy.ts): `launch_app`,
  `open_setting`, `set_torch`, `set_volume` = **safe**; `toggle_system` (Bluetooth/Wi-Fi/location
  off), `set_dnd` = **sensitive** → confirmation-gated (reuse the existing flow, like Gmail send).
- Combined with soft-mode voice-ID: an unverified speaker asking to toggle a system setting hits
  *both* gates — exactly the "only obey me" intent.

---

## 3. Build order & checkpoints
1. **Plugin scaffold** — minimal `device-control` plugin with `setTorch`; confirm `invoke` round-trip
   works on the real device (flashlight turns on by voice). This proves the whole bridge.
2. **Phase 1 commands** + manifest perms; validate `listApps`/`launchApp` ("open Spotify") and
   `openSetting` ("open Bluetooth settings").
3. **Frontend action types** §2 + AI prompt; validate end-to-end voice → action.
4. **Phase 2** DND + Bluetooth-enable dialog.
5. **Phase 3** Accessibility Service for real Bluetooth/Wi-Fi/location toggles, with graceful
   degradation to `openSetting`. Validate "disable location" actually flips it.
6. Gate sensitive device actions behind voice-ID once that lands.

## 4. Validation
- Flashlight on/off by voice (no perms). ✅
- "Open <app>" launches the right installed app via the label map. ✅
- "Open Bluetooth/Wi-Fi/location settings" deep-links correctly. ✅
- DND on/off after the one-time access grant. ✅
- (Phase 3) "Turn on Bluetooth" / "disable location" actually toggles; if a node isn't found it
  opens the settings page instead of failing. ✅
- Desktop build still compiles (plugin is `#[cfg(target_os="android")]`-gated; actions no-op).

## 5. Files to create / touch
**New Android plugin:** a `device-control` Tauri Kotlin plugin under `src-tauri/` (plugin crate +
`android/` Kotlin sources: `DeviceControlPlugin.kt`, `KrishnaAccessibilityService.kt`), registered in
[src-tauri/src/lib.rs](src-tauri/src/lib.rs) `Builder`.
**Manifest:** [AndroidManifest.xml](src-tauri/gen/android/app/src/main/AndroidManifest.xml) — add
`QUERY_ALL_PACKAGES`, `ACCESS_NOTIFICATION_POLICY`, the accessibility-service `<service>` + config XML.
**Frontend:** [src/lib/actions.ts](src/lib/actions.ts) (+ `src/types/assistant.ts`) new action types
& dispatch; system-prompt update; [packages/core/action-policy.ts](packages/core/action-policy.ts)
classification; a small "Device Control" settings panel (enable Accessibility, list apps).

## 6. Out of scope
- Device Owner / DevicePolicyManager (enterprise provisioning) — not needed once Accessibility covers
  the toggles.
- Toggling airplane mode programmatically (system-app only) — `openSetting("airplane")` only.
- iOS device control (far more restricted; revisit separately).
