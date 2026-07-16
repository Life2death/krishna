# Krishna as the system Digital Assistant (VoiceInteractionService) — implementation plan

**Status:** Phases 1 and 2 implemented and verified end-to-end live on-device 2026-07-16 (see Phase
0 spike run and Phase 2 verification note below) — the core mechanism (assist gesture → Krishna
foregrounded → already listening) works, **including the duplicate-task edge case (found and fixed
the same session — see Phase 0's "Duplicate-task trap" finding, now marked RESOLVED)**. Remaining
before this is fully done: a live owner voice test through the listening state (adb can't inject
real speech), and Phase 3 (settings UX/discoverability — not started). Phase 4 (v2) not started.
Originally written 2026-07-15; re-validated against the codebase and Android 14–16 platform docs
2026-07-16 before implementation began.
**Working directory:** `D:\Learning\krishna-main-merge` (the shipping worktree — do NOT start a
fresh worktree off `main`; see Build & verify rules at the bottom).

**Validation pass (2026-07-16, no code written):** every current-state claim below was re-checked
against the live source (manifest, `MainActivity.kt`, `handleTranscript`, the JNI bridge chain,
`useMobileSpeech.ts`) and still holds exactly as written — nothing has drifted since the plan was
authored. Three things were added as a result of this pass, marked **[NEW]** below: a sharper
statement of the `handleTranscript` seam, a citation that strengthens (but doesn't yet prove) the
FGS-exemption hypothesis in bug #2, and a real Android-16 gotcha about the assistant-role Secure
Setting getting wiped on every `adb install -r` — directly relevant to this repo's iteration
workflow.

---

## Why (the problem this actually solves)

Krishna on Android currently self-hosts every invocation path: its own foreground service for
hands-free listening, its own wake-word detector, its own mic loop in the WebView. That puts it
permanently on the wrong side of Android's app-lifecycle rules, and it is the **confirmed root
cause of three separate field bugs this week** (see `gps-travel-origin-spec` memory / commits
`aed4a0b`, `3f40b21`, `a0b58a2`):

1. Krishna opened Maps → backgrounded itself → **Android killed the process before TTS spoke the
   answer** (fixed by deferring the open, but the underlying fragility remains).
2. Krishna opened Google News → backgrounded itself → Live→Classic handoff tried to restart the
   hands-free foreground service → **Android 12+ denied the FGS start**
   (`mAllowStartForeground false`, `uidState: LAST`) because the app wasn't foreground.
   **[NEW]** Android's own docs list an exemption for this exact restriction: "the service starts
   by an app which provides the `VoiceInteractionService`" is exempt from the background
   foreground-service-start block for while-in-use-permission services (location/camera/mic) —
   see [Restrictions on starting a foreground service from the
   background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
   This is a **plausible**, not confirmed, second fix for bug #2 — it's unclear whether the
   exemption covers *any* FGS start by the app once it merely provides/registers a VIS, or only
   FGS starts tied to an active `VoiceInteractionSession`. Phase 0 should note whether
   `KrishnaHandsFreeService.start()` stops getting denied once Krishna is registered as the VIS,
   even before wiring anything else — cheap free data point, don't build around it without seeing
   it hold.
3. Once the user is in another app (which is exactly when a voice assistant is most useful),
   Krishna's WebView mic loop is paused and its only ear is the always-on FGS — which the OS
   fights constantly (Samsung reaper, FGS policy, notification requirement).

Apps holding the **Digital Assistant role** (`ROLE_ASSISTANT`) get the sanctioned answer to all of
this: a **system-provided invocation gesture** (long-press home / corner swipe / power-button
assist, works from ANY app, any time) that binds the app's process at foreground importance and
hands it the mic — no always-on service required for the invoke path, no FGS-denial class of bug,
because **invocation itself brings Krishna to TOP before it does anything**.

What the role does NOT give a sideloaded app (explicitly out of scope, don't attempt):
- `HotwordDetectionService` / `AlwaysOnHotwordDetector` (the trusted "Hey Google"-style DSP
  hotword pipeline) — restricted to preinstalled/privileged assistants on Android 12+. Our own
  OpenWakeWord FGS path stays as the (optional) always-listening mechanism; the assistant role is
  an *additional*, more reliable invocation path, not a replacement for it.

---

## Current state (verified in code, 2026-07-15)

- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` is **hand-maintained and committed**
  (custom services already declared there); safe to edit. Currently declares: `.MainActivity`
  (`launchMode="singleTask"`, exported), `.KrishnaAccessibilityService`,
  `.KrishnaHandsFreeService` (`foregroundServiceType="microphone"`), FileProvider.
- `MainActivity.kt` is minimal (`class MainActivity : TauriActivity()`); `singleTask` means an
  assist launch while the app is alive arrives via `onNewIntent`, without recreating the activity.
- Established Kotlin↔Rust↔JS bridge pattern to copy: static-method helpers
  (`WakeWordBridgeHelper.kt`) called from `src-tauri/src/android_control.rs` via JNI
  (`find_app_class` + `call_static_method`), exposed as `#[tauri::command]`s in
  `src-tauri/src/mobile_bridge.rs` (registered in `lib.rs`), invoked from JS.
- **Known seam (relevant, discovered while planning):** `KrishnaHandsFreeService.handleTranscript`
  only handles button-click / media / gesture commands natively and **silently drops everything
  else** (`?: return` at the end of the gesture `when`, `KrishnaHandsFreeService.kt:223`) —
  arbitrary AI commands captured by the native service never reach the WebView. **[NEW, sharper
  than originally stated]** this isn't a rare edge case: `useMobileSpeech.ts` explicitly disables
  its own JS-side ambient recognition loop on Android (`if (isAndroid) return;`) because native
  hands-free replaces it, which means on Android **every** hands-free transcript that isn't one of
  the ~9 hardcoded gesture phrases or a `safeDirectButtons`-allowlisted click is silently dropped
  today, full stop — there is no fallback path at all, not even a degraded one. The assist path in
  this plan must NOT reuse that parser as its terminal step; it must deliver the transcript to the
  JS pipeline (Phase 2's bridge), with the native parser only as a fast-path for its known
  commands.
- JS command entry point: `krishna.processCommand(text, { skipWakeWord: true })` from
  `useKrishna()` (see `useMobileSpeech.ts` for the canonical usage; the tap itself is the wake
  signal — same logic applies to an assist gesture).
- OpenWakeWord is in SHADOW mode (unapproved) — it cannot act. **The assist gesture must not be
  gated on wake-word approval in any way**: a system assist invocation is an explicit user
  gesture, exactly like tap-to-talk.

---

## Design overview

```
User long-presses home (in ANY app, e.g. Chrome showing Google News)
  → system binds KrishnaVoiceInteractionService (process importance: bound/visible)
  → KrishnaInteractionSessionService creates KrishnaInteractionSession
  → session.onShow():
       v1: immediately startAssistantActivity(MainActivity intent + EXTRA_ASSIST_TRIGGER)
           and hide the session (no overlay UI of our own yet)
  → MainActivity (TOP now — FGS/mic all permitted) onNewIntent/onCreate sees the extra
  → stores "assist pending" via AssistBridgeHelper (Kotlin static)
  → JS (MobileHome/useMobileSpeech) detects focus + pending assist via a Tauri command
  → auto-starts listening exactly like a tap (skipWakeWord), routed to the ACTIVE endpoint
    (Classic tap-to-talk or Live session — reuse existing unified MicView logic)
```

v1 deliberately punts on rendering assistant UI inside the session overlay itself (that's a
`VoiceInteractionSession.onCreateContentView` project, v2). v1 = "the system gesture summons
Krishna and it's already listening."

---

## Phase 0 — Device/platform verification spike (do FIRST, ~30 min, no permanent code)

Android's VoiceInteractionService has version- and OEM-specific sharp edges. Before building the
real thing, verify on the actual test device (Samsung SM-M066B, Android 16, One UI):

1. Scaffold the minimal service trio from Phase 1 (VIS + SessionService + stub RecognitionService
   + XML), build, install.
2. Check Krishna appears in **Settings → Apps → Choose default apps → Digital assistant app**
   (One UI path may differ; find it). If it does NOT appear, capture `adb shell dumpsys
   voiceinteraction` and `adb logcat -s VoiceInteractionManagerService` output and iterate on the
   XML/manifest before writing any more code — everything else depends on this.
3. Select Krishna as assistant, long-press home from another app, confirm
   `KrishnaInteractionSession.onShow` fires (log line) and `startAssistantActivity` brings
   MainActivity up.
4. Record in the plan doc: does `settings get secure assistant` show our component? Does the
   session survive keyguard? Does One UI's side-key/gesture mapping offer the assistant?

Known gotchas to expect here (bake into the scaffold from the start):
- The `<voice-interaction-service>` XML has historically **required** the `recognitionService`
  attribute — a VIS without one is rejected/ignored on many Android versions. Ship a stub
  `RecognitionService` even though we never use it.
- The service needs `android:permission="android.permission.BIND_VOICE_INTERACTION"` and the
  intent-filter action `android.service.voice.VoiceInteractionService`, or the system never lists
  it.
- `ROLE_ASSISTANT` generally **cannot** be requested via `RoleManager.createRequestRoleIntent`
  (it's a settings-only role on most builds) — the user must pick it in Settings. Phase 3 adds a
  deep link, not a programmatic grant.
- **[NEW] The assistant selection likely does not survive `adb install -r`.** A third-party
  developer building an assistant app on Android 16 (same OS as our test device) reported the
  `assistant` and `voice_interaction_service` Secure Settings get silently cleared on every APK
  reinstall of the same package — long-press-home falls back to the system default (Gemini/Bixby)
  until the setting is restored (see [claude-code
  #41696](https://github.com/anthropics/claude-code/issues/41696) — a bug report, not Google
  documentation, so treat as "expect this, verify on our device" rather than settled fact). This
  repo's whole workflow is `adb install -r` on every iteration
  (`docs/ANDROID_FAST_BUILD_DEPLOY.md`), so if confirmed this will look like "the assistant
  randomly stops working" after every rebuild during Phase 0–3 development unless anticipated.
  Confirm during Phase 0 step 3; if it reproduces, re-run after every install:
  ```
  adb shell settings put secure assistant com.krishna.assistant/.KrishnaVoiceInteractionService
  adb shell settings put secure voice_interaction_service com.krishna.assistant/.KrishnaVoiceInteractionService
  ```
  (exact component name — verify the correct one to write once Phase 1's service exists; the
  session/VIS split means it may need the VIS's own component, not the session service's).

**Phase 0 spike run 2026-07-16 — RESULT: PASSED, mechanism confirmed working end-to-end on-device
(Samsung SM-M066B, Android 16/API 36, One UI, device `R9ZY40XK38A`).** Phases 1 and 2 were both
implemented (not just Phase 1) and the full assist→listening path was verified live. Findings:

- **Picker path confirmed:** Settings → Apps → Choose default apps → Digital assistant app →
  **"Other apps"** (a second-level list below the main Google/Bixby choices) → Krishna. Selecting
  it sets both `settings get secure assistant` and `voice_interaction_service` to
  `com.krishna.assistant/.KrishnaVoiceInteractionService` (the VIS's own component, confirming the
  "which component" open question above — it's the VIS, not the session service).
  `android.settings.MANAGE_DEFAULT_APPS_SETTINGS` is the working intent for One UI (`ACTION_VOICE_
  INPUT_SETTINGS` failed to resolve — drop it from Phase 3's fallback list).
- **The reinstall-clears-selection gotcha above did NOT reproduce this session** — the selection
  made during this spike survived a subsequent `adb install -r` of an unrelated rebuild. Not
  conclusively ruled out (only tested once, one install), but downgrade this from "expect it" to
  "watch for it" — don't pre-emptively script the restore commands unless it actually recurs.
- **`adb shell input keyevent 219` (`KEYCODE_ASSIST`) reliably triggers the same path as
  long-press-home** — useful for scripted/automated testing going forward, no need to physically
  long-press for each iteration.
- **End-to-end confirmed from a cold start** (Krishna force-stopped, another app — Chrome/
  Wikipedia — in foreground, assist gesture fired): `KrishnaSession: onShow: startAssistantActivity
  dispatched` logs, `topResumedActivity` becomes Krishna's `MainActivity` within ~1s, and — with
  Phase 2 also wired — **the JS mic UI comes up already green/listening**, exactly the Phase 2
  verification gate's description. This is the real mechanism working, not just compiling.
- **[NEW FINDING] Duplicate-task trap when Krishna is already running normally.** If Krishna was
  already open via a normal launcher tap (a separate, `ACTIVITY_TYPE_STANDARD` task) and the assist
  gesture then fires, Android does **not** collapse into that existing task despite `singleTask` —
  it starts a **second, concurrent `MainActivity` instance in the same process** (assistant
  invocations get `ACTIVITY_TYPE_ASSISTANT`, which the platform intentionally keeps in a separate
  task from the app's normal launcher task, even for the same app/package). Confirmed via `dumpsys
  window windows` showing two `MainActivity` windows on two different task IDs simultaneously. The
  practical symptom: the newly-created instance's WebView **never rendered — persistent blank white
  screen**, no crash, no error logged, for 90+ seconds, strongly suggesting Tauri/wry's runtime
  (which this repo's `android_jvm.rs` already works around via `main_android_context()` — see
  [[android-jni-and-build-speed]]) does not tolerate two concurrent Activity instances in one
  process. **This only reproduces when the user manually opens Krishna from the launcher and THEN
  invokes the assist gesture while that instance is still alive** — the clean cold-start path (no
  prior manual launch) works perfectly, as does invoking assist again after force-stopping. Given
  Phase 3 explicitly keeps Krishna as a normal, manually-launchable app (not assist-only), this is a
  real, findable-in-production edge case, not just a test artifact — **do not close this out
  without a real fix.** Candidate fixes to evaluate before Phase 3 ships: (a) drop
  `FLAG_ACTIVITY_NEW_TASK` from the intent in `KrishnaInteractionSession.onShow()` and see whether
  `startAssistantActivity` alone (without forcing a new task) lets `singleTask` collapse into the
  existing standard task via `onNewIntent`; (b) in `MainActivity`, detect a duplicate instance
  (e.g. via a static "am I the live instance" flag matching the pattern already used in
  `KrishnaAccessibilityService`/`instance`) and `finish()` the newer one, redirecting focus to the
  original; (c) accept two instances but make Tauri/wry-side state (webview, JNI context capture)
  genuinely per-instance instead of a process-global singleton. (a) is cheapest — try it first.

  **RESOLVED 2026-07-16.** (a) was tried first and **did not work** — confirmed on-device that
  `startAssistantActivity()` creates the separate `ACTIVITY_TYPE_ASSISTANT` task regardless of
  whether `FLAG_ACTIVITY_NEW_TASK` is present on the intent; this is baked into the platform's
  assistant-invocation handling, not something app-side intent flags control. **Fixed with a
  variant of (b), applied earlier (in the Session, before launch, not after):**
  `MainActivity` now tracks a static `liveInstance` (same pattern as `KrishnaAccessibilityService.
  instance`) exposing `isAlive()`/`bringToFront(context)` (uses `ActivityManager.moveTaskToFront`,
  which needs the `REORDER_TASKS` normal permission — added to the manifest, no runtime prompt).
  `KrishnaInteractionSession.onShow()` now checks `MainActivity.isAlive()` **before** deciding how
  to invoke: if already running, call `MainActivity.bringToFront(context)` instead of
  `startAssistantActivity(...)` — no second instance is ever created. Bringing the existing task
  forward triggers its window's focus-changed event, which `useAssistTrigger`'s existing focus
  listener already handles (re-polls `android_take_pending_assist()`, still `true` since it hadn't
  been consumed) — **zero JS changes needed**, the Phase 2 wiring already covered this case once
  the native side stopped creating a duplicate.

  **Verified on-device, exact repro from the original finding:** manually launch Krishna → open
  another app (Wikipedia) → `adb shell input keyevent 219` → `dumpsys activity activities` shows
  **one** `MainActivity` task throughout (not two) → screen renders the normal mic UI (not blank) →
  `KrishnaSession: onShow: brought existing MainActivity to front` in logcat → mic actually started
  listening (surfaced "I didn't catch that — tap and try again" after a timeout, since no one
  spoke during the automated test — the graceful expected outcome, not a crash). Files touched:
  `MainActivity.kt` (new `liveInstance`/`isAlive`/`bringToFront`), `KrishnaInteractionSession.kt`
  (branch in `onShow`), `AndroidManifest.xml` (`REORDER_TASKS`).

## Phase 1 — The service trio + manifest (Kotlin, new files)

All under `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/`:

1. **`KrishnaVoiceInteractionService.kt`** — extends
   `android.service.voice.VoiceInteractionService`. v1 body is nearly empty (log `onReady`).
2. **`KrishnaInteractionSessionService.kt`** — extends `VoiceInteractionSessionService`, returns
   `KrishnaInteractionSession(this)` from `onNewSession`.
3. **`KrishnaInteractionSession.kt`** — extends `VoiceInteractionSession`. In
   `onShow(args, showFlags)`:
   - `AssistBridgeHelper.setPending(context)` (Phase 2; safe no-op stub in Phase 1)
   - build `Intent(context, MainActivity::class.java)` with
     `putExtra(EXTRA_ASSIST_TRIGGER, true)` + `FLAG_ACTIVITY_NEW_TASK`
   - `startAssistantActivity(intent)` (the session API — NOT plain `startActivity`; the session
     variant carries the assistant's foreground grant)
   - `hide()` — v1 shows no session chrome of its own.
   Wrap the whole body in try/catch + `Log.e` — an exception inside onShow otherwise fails
   silently and the gesture appears dead (same lesson as `KrishnaHandsFreeService.start()`:
   never let a native exception surface raw or vanish).
4. **`KrishnaRecognitionServiceStub.kt`** — extends `android.speech.RecognitionService`,
   overrides `onStartListening/onStopListening/onCancel` as no-ops that immediately error out.
   Exists only to satisfy the VIS XML requirement.
5. **`res/xml/voice_interaction_service.xml`** (new folder entry next to
   `accessibility_service_config.xml`):
   ```xml
   <voice-interaction-service xmlns:android="http://schemas.android.com/apk/res/android"
       android:sessionService="com.krishna.assistant.KrishnaInteractionSessionService"
       android:recognitionService="com.krishna.assistant.KrishnaRecognitionServiceStub"
       android:supportsAssist="true" />
   ```
6. **Manifest additions** (inside `<application>`):
   ```xml
   <service android:name=".KrishnaVoiceInteractionService"
       android:permission="android.permission.BIND_VOICE_INTERACTION"
       android:exported="true"
       android:label="@string/app_name">
       <intent-filter>
           <action android:name="android.service.voice.VoiceInteractionService" />
       </intent-filter>
       <meta-data android:name="android.voice_interaction"
           android:resource="@xml/voice_interaction_service" />
   </service>
   <service android:name=".KrishnaInteractionSessionService"
       android:permission="android.permission.BIND_VOICE_INTERACTION"
       android:exported="true" />
   <service android:name=".KrishnaRecognitionServiceStub"
       android:permission="android.permission.BIND_RECOGNITION_SERVICE"
       android:exported="true">
       <intent-filter>
           <action android:name="android.speech.RecognitionService" />
       </intent-filter>
   </service>
   ```
   (Exact `exported`/permission combos are the thing Phase 0 iterates on if the picker doesn't
   list us — compare against AOSP's `SampleVoiceInteractor` if stuck.)

**Verification gate for Phase 1:** Phase 0's checks 2–3 pass (listed in picker, onShow fires,
MainActivity comes to front from inside another app). Unit tests: none meaningful at this layer;
the gate is on-device behavior.

**PASSED 2026-07-16** — see the Phase 0 spike run note above for the full on-device trail.

## Phase 2 — Assist → JS bridge ("it's already listening")

Copy the exact `WakeWordBridgeHelper` pattern:

1. **`AssistBridgeHelper.kt`** — Kotlin `object` with a `@Volatile private var pendingAt: Long`,
   `@JvmStatic fun setPending()` (called by the session), and
   `@JvmStatic fun takePending(): Boolean` (returns true at most once per set, and only if set
   within the last ~10s — stale assists must not fire a surprise mic minutes later).
2. **`src-tauri/src/android_control.rs`** — `pub fn assist_take_pending() -> Result<bool, String>`
   via the existing `with_env`/`find_app_class` JNI helpers.
3. **`src-tauri/src/mobile_bridge.rs`** — `#[tauri::command] android_take_pending_assist() -> bool`
   (desktop: always `false`), registered in `lib.rs`'s `invoke_handler` (grep for
   `android_get_wake_word_profile` and add alongside).
4. **JS — `src/pages/mobile/Home.tsx` (or a small `useAssistTrigger` hook in `src/hooks/`):**
   - On mount AND on window focus (reuse the `getCurrentWindow().onFocusChanged` pattern now in
     `useMobileSpeech.ts`), `invoke<boolean>("android_take_pending_assist")`.
   - If true: behave exactly like a mic tap in the CURRENT mode — Classic:
     `startListening()`; Live: `live.start()` if not already active. Never gate on wake word
     (assist gesture == explicit wake, mirror `skipWakeWord: true` semantics).
   - Guard with `isMobileDevice()` + try/catch, same as `WakeWordMeter`.

Sequencing note (hard-won, this week): when the assist fires while a Live session is active or
just ended, the existing `suppressed`/focus-gating handoff in `useMobileSpeech.ts` already
manages mic ownership — do NOT add a second parallel start path around it. Route "assist while in
Live mode" to the Live session, not to Classic STT.

**Verification gate:** from inside Chrome, long-press home → Krishna comes up **already
listening** (mic UI green) → say "how much time to home" → spoken answer + Maps opens after TTS
(the `deferredUrl` path). One vitest for `useAssistTrigger` (mock invoke: pending → starts
listening once; not pending → no-op; non-mobile → never invokes) using fake timers/focus mocks as
in `mobile-speech-handoff.test.ts` — and follow that file's lesson: assert the *single-fire*
behavior explicitly, not just eventual calls.

**PASSED 2026-07-16, first half; second half still needs a live owner voice test.** Confirmed
on-device: from inside another app (cold-started Krishna, no prior manual launch — see the
duplicate-task caveat above), the assist gesture brings Krishna up with the mic already green and
"Listening… tap to stop." **Not yet confirmed**: an actual spoken command through that listening
state (needs a human voice, not scriptable via adb) — the owner should say something and confirm a
real answer comes back, the same as the plan originally asked for. `useAssistTrigger.ts` written
(`src/hooks/useAssistTrigger.ts`, wired into `Home.tsx` after both `useMobileSpeech` and
`useLiveVoiceSession` are constructed) with 6 vitest cases in
`src/__tests__/use-assist-trigger.test.ts` (single-fire on mount, single-fire on focus regain, Live
vs Classic routing, no-op when nothing pending, never invokes on desktop) — all passing, plus
`mobile-speech-handoff.test.ts` re-run clean alongside it (14/14 total). `npx tsc --noEmit` clean.
Rust: `cargo check --target aarch64-linux-android -p krishna --offline` clean (only pre-existing,
unrelated warnings).

## Phase 3 — Role guidance UX + docs (small)

1. `src/pages/mobile/Settings.tsx`: a card "Make Krishna your phone's assistant" —
   shows current state if cheaply readable (`Settings.Secure.getString(resolver, "assistant")`
   via a tiny bridge method, best-effort), and a button that fires an intent to the default-apps
   screen (try `Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS`; verify the best working intent on
   One UI during Phase 0 and hardcode what works — `ACTION_VOICE_INPUT_SETTINGS` is the fallback).
2. Update `docs/openwakeword-android.md` + `RESUME_HERE.md`: the assistant gesture is the primary
   hands-free invocation; OpenWakeWord remains the optional always-listening layer, still behind
   its approval gate.

## Phase 4 (v2, separate effort — do NOT start without explicit owner go-ahead)

- Render a compact overlay session UI (`onCreateContentView`) with live transcript instead of
  bouncing to the full activity.
- `onHandleAssist(state)` → screen-context ("what's on my screen").
- `supportsLaunchVoiceAssistFromKeyguard` + `onLaunchVoiceAssistFromKeyguard`.
- Investigate whether holding ROLE_ASSISTANT relaxes any FGS/background-start policies for the
  always-on OpenWakeWord service on this device (measure with `dumpsys activity processes`;
  do not assume). See the **[NEW]** citation under bug #2 in "Why" — this is the specific
  exemption to test, not a fresh hypothesis to discover from scratch.

---

## Build & verify rules for the implementing agent (non-negotiable, all learned the hard way)

- Work in `D:\Learning\krishna-main-merge` directly. **One party builds at a time** — check for
  running `cargo`/`gradle`/`java` before starting (target-lock contention kills builds).
- Manifest/Kotlin/Rust changes ⇒ use the FULL build:
  `npx vite build` then
  `npx tauri android build --debug --apk --target aarch64 -c no-before-build.json`
  (config file already at repo root). Do **not** use raw `cargo build` + `gradlew
  -x rustBuildArm64Debug` — it skips Android-project regeneration and produced both a
  white-screen APK and a missing-permission APK this week. Full rationale:
  `docs/ANDROID_FAST_BUILD_DEPLOY.md` ("Exception" section). Run APK builds in the background
  (>10 min foreground timeouts kill them and orphan the target lock).
- Install/verify per that same doc: `adb install -r`, force-stop, logcat clear, launch, then
  check `pidof`, `cache/krishna-startup.txt`, empty crash buffer, `[boot] done` console lines.
  **[NEW]** if Phase 0 confirms the reinstall-clears-assistant-setting gotcha above, add the two
  `adb shell settings put secure ...` lines to this step for the duration of this feature's
  development — otherwise every rebuild will look like a regression when it's just the OS
  resetting the role selection.
- **[NEW]** `docs/ANDROID_FAST_BUILD_DEPLOY.md`'s step 2 (`npx vite build`) is written as
  `cd D:\Learning\krishna` — that's a different worktree; run it from `D:\Learning\krishna-main-merge`
  (this plan's working directory) instead of following the doc's path literally.
- `npx tsc --noEmit` + targeted `npx vitest run <files>` before every commit (plain runs;
  `--no-isolate` produces phantom cross-file failures in this repo).
- Local commits are fine; **no `git push`** unless the owner explicitly says so.
- If `npx vite build` fails resolving `mermaid`/`streamdown`: local node_modules corruption —
  `rm -rf node_modules && npm ci` (happened twice this week; not a code issue).
- Report honestly per phase: what's verified on-device vs. merely compiling. Phase gates above
  are the definition of done — "it builds" is not.
