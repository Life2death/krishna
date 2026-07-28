# RESUME HERE — Krishna handoff (updated 2026-07-16)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.
>
> **Rule for every agent/LLM working any task in this repo:** before marking a task/stage done,
> update this file's §0 (or add a dated entry) with what changed, what's verified, and what's
> still open. This file is meant to be the ONE place any agent can read to get full current
> context — do not let it go stale again (it drifted 1 day behind actual work as of 2026-07-13,
> which is how this rule got added).

---

## 0. LATEST — Dictation: fully working end-to-end, root cause was Enigo/SendInput text corruption, fixed via clipboard+paste (2026-07-28, later still)

**Picking up from the section directly below in the same session.** Short version: the feature
now works. The on-screen button and hotkey both reliably type dictated speech into whatever app
has focus, confirmed with several live tests including one with capitals/punctuation/digits that
came through byte-for-byte correct.

**What actually happened, in order (so the next agent doesn't re-discover any of this):**

1. Section 0a below's key-repeat fix was confirmed working (one trigger per press) and the
   `OverconstrainedError` mic-device-id bug was found and fixed with a fallback-to-default-mic —
   both already covered below. That got recording/STT working, but a **third, separate bug**
   surfaced once real dictated sentences started actually reaching the typing step.

2. **Owner asked for an on-screen toggle button** (next to the Brain selector on Krishna's main
   overlay) as an alternative to the hotkey. Added in `src/pages/app/index.tsx`: a button right
   after `<BrainSelector />`, red-filled while recording, spinner while transcribing, disabled-dot
   indicator when the Dictation toggle is off. Uses lucide-react's `KeyboardIcon` (owner explicitly
   asked for a typewriter icon; lucide-react has no literal typewriter glyph, `Keyboard` was picked
   as the closest fit — "this types into the focused app"). Wired to the *same* toggle function the
   hotkey uses — `useDictation.ts` now returns `triggerDictation` (was previously only used
   internally by the hotkey's event listener); `useApp.ts`'s `useDictation()` call is returned from
   the hook as `dictation` so `pages/app/index.tsx` (which already calls `useApp()`) can reach the
   *same mounted instance* rather than mounting a second listener. **Confirmed working live** —
   several of the successful paste tests below (item 3) were triggered via this button, not just
   the hotkey.

3. **Enigo's `text()` call was corrupting typed output on Windows**, confirmed via multiple live
   tests. `type_text_via_enigo` (now in `src-tauri/src/automation.rs`) called `enigo.text(text)`
   once for the whole string. Enigo 0.2.1's Windows backend
   (`~/.cargo/registry/.../enigo-0.2.1/src/win/win_impl.rs:232-273`) builds ONE `SendInput` array
   for the entire string (two `KEYEVENTF_UNICODE` events per char) and fires it in a single
   syscall — a live test typing "Can I write something?" produced `Can ` followed by 18 literal
   `?` characters in Notepad (exactly the length of "I write something?"); another test produced
   `Dad`→`ddd` and `you`→`?ou`. `SendInput` itself reported success in every case — the corruption
   happens downstream, in how the receiving app's message queue drains a large burst of synthetic
   unicode key events with no pacing.
   - **First attempt (insufficient):** paced `type_text_via_enigo` to call `enigo.text()` once per
     character with an 8ms sleep between. This measurably reduced the corruption (delayed onset
     from ~character 5 to ~character 49 in one test) but did NOT eliminate it — a subsequent test
     still corrupted mid-string (`Mic Testing 1` → repeated `2`s). Tuning the delay further was
     judged not worth chasing — this is a non-deterministic timing race, not a fixed threshold.
   - **Actual fix:** `dictation_type_text` now uses a **new clipboard-write + single Ctrl+V paste**
     path (`type_text_via_paste` + the `windows_clipboard` module, both in `automation.rs`,
     `#[cfg(target_os = "windows")]` — other platforms still use the old paced `type_text_via_enigo`
     since the bug was only observed/fixed for Windows). Saves the user's existing clipboard text,
     writes the dictated text as `CF_UNICODETEXT`, sends Ctrl+V via Enigo (a single small keystroke
     combo, immune to the large-burst corruption), then restores the original clipboard content.
     Uses the `windows` crate directly (already a dependency for WASAPI/window-control code) —
     added `Win32_System_DataExchange` + `Win32_System_Memory` features to `Cargo.toml`, no new
     crate. **`computer_type` (the general Computer Control typing command) was deliberately left
     on the old `type_text_via_enigo` path** — same latent bug likely applies there too, but that
     wasn't in scope this session and wasn't confirmed broken; flagging it as a known follow-up.
   - **Confirmed live, repeatedly**, including the exact controlled test that matters (click into
     Notepad first so it visibly has focus, THEN press the hotkey without touching anything else):
     `"Hello, hi there, good morning, good afternoon, good evening."` (60 chars, punctuation) came
     through **byte-for-byte correct**. Several earlier tests in this session that looked like new
     failures ("Notepad is blank") turned out to be a **test-methodology artifact, not a bug** — the
     owner was reading/typing in this chat between tests, so their actual OS focus was on the chat
     app, not Notepad, and dictation correctly typed into (or was swallowed by) whatever really had
     focus. Once the owner explicitly clicked into Notepad first and left it alone, it worked
     cleanly every time.

4. **A build-race crash happened mid-session, unrelated to the above logic**: running `cargo check`
   manually while `npm run tauri dev`'s own file-watcher was concurrently rebuilding after a Rust
   edit corrupted the shared `target/` build cache, producing a binary that crashed instantly on
   launch with `STATUS_STACK_BUFFER_OVERRUN` (0xC0000409). This was **not a bug in the new code** —
   confirmed by killing all cargo/krishna processes and doing a clean `npm run tauri dev` restart,
   which then ran fine. **Lesson, generalizing the existing node_modules "one-party" rule (§6) to
   Rust builds too: never run a manual `cargo check`/`cargo build` while `tauri dev` is live and has
   its own pending rebuild for the same files** — let its own watcher rebuild, read its terminal
   output for errors, and only run manual cargo commands when the dev server is stopped or you're
   certain no Rust files changed since its last successful build.

5. **Debug logging added to `useDictation.ts` uses `console.warn`, not `console.log`** — confirmed
   the terminal stream for `npm run tauri dev` only forwards `console.warn`/`console.error` from the
   webview, never plain `console.log` (0 occurrences of the latter across the entire session's
   terminal output vs. thousands of the former). Keep using `warn`/`error` for anything you need to
   see in the terminal; `log` is invisible there (still visible in the app's own DevTools console,
   which nobody had open this session).

**Verification after all of the above:** `cargo check --workspace` clean (same 3 pre-existing
unrelated warnings), `npx tsc --noEmit` clean (same 1 pre-existing unrelated `@xenova/transformers`
error), `npx vitest run` 979/979 green — re-checked after every code change this session, not just
once at the end.

**Not yet committed.** Everything in this section plus the section below is still sitting
uncommitted in the working tree (see `git status`). The owner asked mid-session about pushing to
GitHub to get a new installer built; that got paused to keep debugging instead — see the owner's
own message log if picking this back up, but the short version is: `release.yml` only builds on a
pushed `v*` tag, not on any branch push, and the current branch (`codex/upgrade-stage1`) already has
unrelated Stage-1 self-improvement-system commits on it (already public on `origin`, so no new
exposure risk there) — those should stay untouched; only the dictation-related files should go into
this feature's commit(s). Still needs: commit (excluding the pre-existing, unrelated stray
`package.json`/`package-lock.json`/`apps/brain/package.json` dependency downgrades that predate this
session), then owner confirmation before pushing/tagging.

---

## 0a. PRIOR — Global-hotkey OS-wide dictation feature added (2026-07-28)

**New feature: press a global hotkey from anywhere in the OS, speak, and the transcribed text
types into whatever app currently has OS focus** (browser address bar, Word, Slack, VSCode, etc.)
— without Krishna's own window stealing focus. Reuses Krishna's existing cloud STT providers
(OpenAI/Groq Whisper, ElevenLabs, Deepgram, Azure, Google STT, IBM Watson); no local/offline
Whisper added (explicitly out of scope, left for a future follow-up).

**What changed:**
- `src-tauri/src/shortcuts.rs`: new `"dictation"` shortcut action, parallel to the existing
  `"audio_recording"` one, but its handler (`handle_dictation_shortcut`) emits a distinct
  `start-dictation-recording` event and deliberately does **not** show/focus Krishna's window
  (unlike `handle_audio_shortcut`) — the whole point is leaving the external app focused.
- `src-tauri/src/automation.rs`: new `DictationState` (separate `Mutex<bool>` flag) +
  `set_dictation_enabled` + `dictation_type_text` commands. `dictation_type_text` is gated on
  `DictationState`, **not** the existing broad `ComputerControlState` — typing spoken words is a
  much narrower trust surface than full mouse/keyboard automation, so it got its own dedicated
  permission rather than piggybacking on (or requiring) Computer Control. Both `computer_type` and
  `dictation_type_text` now share one `type_text_via_enigo` helper to avoid duplicating the Enigo
  init/type call.
- `src-tauri/src/lib.rs`: registers `DictationState` (`Mutex::new(false)` default, same pattern as
  `ComputerControlState`) and the two new commands in the invoke handler, all `#[cfg(desktop)]`
  (dictation is desktop-only, same as the rest of `automation.rs`).
- `src/hooks/useDictation.ts` (new): headless hook — listens for `start-dictation-recording`,
  records via `MediaRecorder` (mirrors `AudioRecorder.tsx`'s recording lifecycle), transcribes via
  the existing `fetchSTTWithRetryDefault` headless STT helper (same one `KrishnaVAD.tsx` uses), then
  calls `invoke("dictation_type_text", { text })` — never routes through Krishna's
  chat/`processCommand` path. Toggle behavior: first hotkey press starts recording, second press
  stops + transcribes + types. Mounted app-wide via `src/hooks/useApp.ts` (the hook used by the
  main window's root `App` component, `src/pages/app/index.tsx`) — NOT mounted on the mobile home
  screen, since dictation is desktop-only.
- `src/config/shortcuts.ts`: new `"dictation"` default binding (`Ctrl/Cmd+Shift+J`), auto-picked up
  by the existing `ShortcutManager` UI (Settings → Shortcuts) for enabling/rebinding the hotkey.
- Dedicated permission toggle (separate from Computer Control): `CustomizableState.dictation.enabled`
  (`src/lib/storage/customizable.storage.ts`, `updateDictationEnabled`), `toggleDictationEnabled` in
  `src/contexts/app.context.tsx` (invokes `set_dictation_enabled` on change, mirrors
  `toggleComputerControlEnabled`), new `src/pages/settings/components/DictationToggle.tsx` rendered
  in `src/pages/settings/index.tsx` right after `ComputerControlToggle`.

**Build validation (owner's Windows machine, done after initial implementation):**
`npx tsc --noEmit` clean (one pre-existing, unrelated error in `src/lib/voice-id/embedding.ts` —
missing `@xenova/transformers` type declarations, not touched by this feature). `npx vitest run`
979/979 passing. `cargo check --workspace` compiled clean (3 pre-existing warnings in
`mobile_bridge.rs`/`chrome_profiles.rs`, unrelated). So the initial implementation compiled fine —
the bug described below was a **runtime logic bug**, not a build failure.

**Bug found during first real end-to-end test, root-caused and fixed (still needs re-test):**
Owner tested the hotkey and it "listened" (mic activated) but never typed anything into ANY app,
including plain Notepad — ruling out anything Claude-Desktop-specific or Windows UIPI/permission
related. Terminal log during a single, normal-length key hold showed:
```
Shortcut triggered: dictation
Shortcut triggered: dictation
... (14 times from one physical press)
```
Root cause: Windows re-fires the global-hotkey `Pressed` event repeatedly for as long as the keys
are physically held (key-repeat) — `tauri_plugin_global_shortcut` has no way to distinguish a
repeat tick from the initial press. Dictation is toggle-based (press = start, press again = stop),
so a single normal key-hold was flipping start/stop/start/stop over a dozen times before the user
finished speaking, meaning no real recording window was ever captured.

**Fix applied** (in `src-tauri/src/shortcuts.rs` and `src-tauri/src/lib.rs`, NOT yet re-verified
end-to-end by the owner):
- `RegisteredShortcuts` gained a `keys_down: Mutex<HashSet<String>>` field — tracks which
  non-`move_window_*` action ids are currently "held" per the OS.
- The `with_handler` closure in `lib.rs` (~line 396) now only actually calls
  `handle_shortcut_action` on the *first* `Pressed` for an action id since the last `Released`;
  subsequent `Pressed` events for the same still-registered key are treated as repeat ticks and
  ignored. `Released` removes the action id from `keys_down`.
- `unregister_all_shortcuts` (in `shortcuts.rs`) clears `keys_down` entirely as a safety net, so a
  hypothetical missed `Released` event can't permanently wedge an action after a shortcuts reload.
- This also incidentally affects `audio_recording`/`screenshot`/`system_audio`/`cancel_plan` (same
  toggle-style repeat-vulnerability existed for all of them before this fix, just less visibly).

**Indicators added** (since dictation never shows/focuses Krishna's window, there was no way to
tell if it's currently on/off — owner asked for this specifically), also **not yet re-tested**:
- `src/hooks/useDictation.ts`: Web Audio API tone cues — rising beep (880Hz) on recording start,
  falling beep (523Hz) on stop/transcribe-start, low buzz (180Hz) on any failure (no STT provider
  configured, empty transcription, or a thrown error).
- New Tauri command `set_dictation_tray_status` (`src-tauri/src/shortcuts.rs`, registered in
  `lib.rs`) updates the existing `"main-tray"` system tray icon's tooltip to
  "Dictating..."/"Transcribing..."/idle default, via `app.tray_by_id("main-tray")` (same pattern as
  the existing `set_app_icon_visibility`). Hover the tray icon any time to check current state.

**Current state — HONEST STATUS, read this before assuming anything above works:** None of the
key-repeat fix or the indicators have been re-validated by the owner yet — no fresh
`cargo check`/`tsc`/`vitest` run since these edits, and no fresh end-to-end test. The owner asked to
hand this off to a different coding agent (Claude Code) at this point instead of continuing the
back-and-forth here, specifically because it was still "not working" as of the last real test
(which predates the key-repeat fix). **Do not assume the key-repeat fix resolved it** — verify by
getting a fresh terminal log first (should show exactly one `Shortcut triggered: dictation` line
per physical press now, not a burst) before looking for a new/different root cause.

**Remaining / next agent's action items:**
1. Run `cargo check --workspace` (from `src-tauri/`), `npx tsc --noEmit`, `npx vitest run` fresh —
   confirm the key-repeat fix compiles clean (it's new code since the last verified build above).
2. Rebuild (`npm run tauri dev`), enable Dictation toggle (Settings, separate from Computer
   Control), confirm hotkey binding (default `Ctrl+Shift+J`) and an STT provider are set.
3. Fresh end-to-end test in Notepad first (simplest target): single quick tap (not held) → expect
   rising beep + tray tooltip → "Dictating..." → speak → quick tap again → expect falling beep +
   tray tooltip → "Transcribing..." → text should appear in Notepad, tray reverts to idle.
4. If it STILL doesn't type anything even with exactly one "Shortcut triggered: dictation" log line
   per press: check whether `dictation_type_text` is actually being invoked (add temporary logging
   if needed) and whether it returns an error — likely candidates: STT call failing/returning empty
   (check network/API key for the configured provider), or `enigo.text()` silently not working for
   this Windows setup (rare, but check Windows version / any accessibility software that might
   interfere with `SendInput`).
5. No local/offline Whisper was added — still cloud-STT-only, as scoped; that's an intentional
   future follow-up, not a bug.

---

## 0a. PRIOR — UPG-0 architecture contract delivered, awaiting owner review (2026-07-17)

**UPG-0 (self-improvement upgrade system, Stage 0) is code-complete** — pure design artifact, no
runtime code, exactly as scoped. Deliverables: `docs/upgrades/ARCHITECTURE.md` (state machine,
status-ownership rule, the real 4-places sync-table gotcha with corrected file paths, named GitHub
secrets, concrete cost limits, kill-switch spec), `schemas/upgrade-proposal.v1.json` (versioned,
validates the normalized proposal/review response shape), root `AGENTS.md` (build/validate
commands, hard constraints, repo gotchas for any coding agent), `CLAUDE.md` (thin pointer to
`AGENTS.md` + this file). Not yet committed — see below for why.

**⚠️ OWNER ACTION REQUIRED before Stage 1 starts (this is UPG-0's own exit gate, not optional):**
per `Automation_with_LLM.md`'s Required Approvals, the owner must read `docs/upgrades/
ARCHITECTURE.md` and `schemas/upgrade-proposal.v1.json` and confirm the approval gates, the cost
numbers ($50/month cap, 200k tokens/run, 1 automatic + 5 manual runs per rolling 24h — all picked
as concrete first-pass numbers, not derived from real usage data yet), and the kill-switch
mechanics (`UPGRADES_PAUSED` repo variable + a client-side settings toggle) actually match intent.
**Do not start `UPG-1a` (Stage 1 code) until that confirmation happens.**

One correction worth flagging: earlier planning notes described the 4th sync-table location as the
"Rust-backed Android transport schema" — on closer inspection (`packages/core/sync/rust-
transport.ts`) it's actually a TypeScript file with its own `TABLE_DDL` duplicate, sent to a
schema-agnostic Rust executor (`sync_exec_multiple` in `mobile_bridge.rs`) — the real Rust side
holds no table/column knowledge. `ARCHITECTURE.md` documents the corrected picture.

---

## 0b. PRIOR — Krishna as system Digital Assistant, Phases 1–3 built + verified live (2026-07-16)

**Krishna can now be set as the phone's Digital assistant app**, same mechanism as Gemini/Bixby
(`VoiceInteractionService`, `ROLE_ASSISTANT`). This directly targets the "backgrounded-by-own-
action" bug class documented in `gps-travel-origin-spec` memory — the assist gesture brings Krishna
to foreground *before* it does anything, so there's no FGS-denial race to lose. Full spec, on-device
findings, and build/verify trail: `VOICE_INTERACTION_ASSISTANT_PLAN.md` (repo root). Committed
`84b47ed` on `main` in this worktree — **not yet pushed**.

**Verified end-to-end live on-device** (Samsung SM-M066B, Android 16, `R9ZY40XK38A`):
1. **Phase 1 — service trio + manifest.** `KrishnaVoiceInteractionService`, `KrishnaInteractionSessionService`,
   `KrishnaInteractionSession`, a stub `KrishnaRecognitionServiceStub` + `res/xml/voice_interaction_
   service.xml` + manifest entries. Krishna appears and is selectable in Settings → Apps → Choose
   default apps → Digital assistant app → Other apps.
2. **Phase 2 — assist → JS bridge.** `AssistBridgeHelper.kt` (Kotlin) → `android_control.rs`/
   `mobile_bridge.rs` (JNI/Tauri command) → `useAssistTrigger` hook wired into `Home.tsx`. Invoking
   assist (long-press home, or `adb shell input keyevent 219` for scripted testing) from inside
   another app brings Krishna to foreground **already listening**, exactly like a mic tap — no wake
   word required.
3. **Phase 3 — Settings UX.** `AssistantRoleCard` (`src/pages/mobile/components/
   AssistantRoleCard.tsx`) on the mobile Settings page: shows whether Krishna is currently the
   selected assistant (best-effort, `android_is_assistant`) and a button
   (`android_open_assistant_settings`) that opens the system's default-apps picker directly
   (`Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS` — confirmed the working intent on this One UI
   build; `ACTION_VOICE_INPUT_SETTINGS` failed to resolve, deliberately not used).

**A real bug was found and fixed during verification, not just planned around:** if Krishna was
already open normally (launcher tap) and the assist gesture then fired, Android started a SECOND
concurrent `MainActivity` instance in the same process (assistant invocations always get a distinct
`ACTIVITY_TYPE_ASSISTANT` task, regardless of intent flags — confirmed, not app-controllable). The
new instance's WebView never rendered (persistent blank screen, no crash) because Tauri/wry doesn't
tolerate two concurrent Activity instances in one process. Fixed: `MainActivity` tracks its live
instance; `KrishnaInteractionSession` checks `MainActivity.isAlive()` before launching and calls
`ActivityManager.moveTaskToFront()` on the existing instance instead of relaunching when one is
already alive. Verified against the exact original repro.

**Still open:** a real spoken-command test through the already-listening state (needs an actual
human voice — not scriptable via `adb`). OpenWakeWord (item 0b below) is unaffected — the assistant
gesture is now the *primary* hands-free invocation path, OpenWakeWord remains the optional
always-listening layer, unchanged, still behind its own shadow-mode approval gate. See
`docs/openwakeword-android.md` for the updated relationship note.

---

## 0c. PRIOR — v2.1.6 released; mobile travel/sync/CSP fixes on main (2026-07-13, later)

**Desktop release `v2.1.6` cut and built (draft).** Tag pushed, GitHub Actions `release.yml`
succeeded, both installers (`Krishna_2.1.6_x64-setup.exe`, `.msi`) attached to a **draft** release
(not public until manually published). Version bumped in package.json / Cargo.toml / tauri.conf.json
/ Cargo.lock + CHANGELOG entry (`aabdeb5`). CHANGELOG summarizes what landed since v2.1.5 (mobile
voice, Gemini Live, OpenWakeWord shadow mode, sync schema fix).

**Three mobile fixes landed on `main` this session, all triggered by one owner-reported phone bug**
("how much time to work" opened a blank Google Map):
1. **Travel-time blank-map fix (`a504b5e`, pushed).** `get_travel_time`/`suggest_departure_time`
   defaulted origin to "home" and the LLM filled "work"; `resolvePlace()` passes unknown place
   words through literally, so with no saved address Google got the bare word "home"/"work" →
   blank/unroutable map. Now returns an actionable error ("say 'remember my work address is …'")
   instead of a dead-end map. tsc + 934 tests green.
2. **CSP `ipc.localhost` fix (`9c20b29`, committed, NOT yet pushed).** The WebView's fetch()-based
   Tauri IPC channel hit `http://ipc.localhost`, which CSP `connect-src` didn't allow → blocked →
   fell back to slow postMessage IPC, ~3s latency on the first AI response each launch. Added the
   host to csp + devCsp.
3. **Turso mobile sync baking (`8e32b76`, committed, NOT yet pushed).** ROOT CAUSE of why the phone
   never had the addresses: the phone logged `[sync] Sync not configured — Local only mode` because
   `KRISHNA_SYNC_URL`/`KRISHNA_SYNC_TOKEN` were never baked into the mobile build (only Anthropic/
   Maps/Live keys were), so it never joined the Turso hub and never pulled the laptop's `memories`
   (which IS a synced table). Wired baking + `get_baked_sync_url`/`get_baked_sync_token` commands +
   a mobile secure-store seed before `startSync()`, mirroring the existing baked-key pattern.
   Desktop unaffected (mobile-target-gated). Android offline rust gate clean.

**⚠️ OWNER ACTION REQUIRED to finish the Turso fix (see §2 item 6):** the two sync-credential
*values* are not on this machine — there is no real `apps/brain/.env` (only `.env.example`), and
nothing in the working tree has a populated `KRISHNA_SYNC_URL`. The code is done and compile-clean,
but the phone can't actually sync until the owner puts the real Turso URL+token in
`src-tauri/.env`, then a rebuilt APK is installed. Retrieve via `turso db show <name> --url` +
`turso db tokens create <name>`.

Commits `9c20b29` + `8e32b76` are committed locally on `main` in the `krishna-main-merge` worktree
but **NOT pushed** (holding until owner-confirmed, since push triggers CI and these want on-device
verification first). The travel fix `a504b5e` IS pushed. Android build/deploy recipe unchanged:
`docs/ANDROID_FAST_BUILD_DEPLOY.md`.

---

## 0d. EARLIER — OpenWakeWord Android build fixed + verified live; "Upgrades" system planned (2026-07-13)

**OpenWakeWord shadow-mode feature (branch `codex/openwakeword-shadow-mode`, PR #6, pushed `21cee94`):**
- Root-caused the "hour-long build, no APK" problem: **cargo blocks on the crates.io network index
  with no timeout** (sits at ~0.5% CPU, no rustc children — indistinguishable from "still
  building"), and separately `tauri android build`'s `beforeBuildCommand` (`npm run build`) runs a
  `prebuild` hook (`fetch:voiceid`) that hits the Hugging Face API with no timeout even when the
  model already exists. Both are silent, unbounded network stalls, not compile errors.
- Fix: build fully offline. Full step-by-step recipe (prereqs, exact commands, install/verify,
  gotchas) is now documented in **`docs/ANDROID_FAST_BUILD_DEPLOY.md`** — this is the canonical
  doc for every future Android build/deploy, on this track or any other; follow it instead of
  re-deriving the steps, and update it (not just your own task notes) if you hit something new.
  Short version: `cargo check --target aarch64-linux-android --offline` (Rust gate, ~5 min warm) →
  `npx vite build` directly (skips the `prebuild` fetch) → gradle direct (`gradlew
  :app:assembleUniversalDebug -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 --offline`
  with `CARGO_NET_OFFLINE=true`; NOT `tauri android build`, which reruns `beforeBuildCommand`).
  Background trail also in [[android-jni-and-build-speed]].
- **Built, installed, and launched on-device (`R9ZY40XK38A`)** — startup marker confirms clean
  boot, no crash marker, no native crash in logcat, screenshot confirms the tap-to-talk home
  screen renders. APK is arm64-only (sherpa `.so` libs are arm64-only anyway) — 158 MB.
- Shadow mode only logs scores; it never acts on the wake word yet. To watch it live:
  `adb -s R9ZY40XK38A logcat -s OWWDetector:V KrishnaHandsFree:V` and say "Hey Krishna" — look for
  `SHADOW score=… (would-detect=…)` lines. In-app: Settings → Wake Word → "Model & diagnostics"
  shows model version, threshold (0.5), last score, detector state, last error.
- **Still open before this can go live** (see `docs/OPENWAKEWORD_SHADOW_MODE_HANDOFF.md` for the
  full spec): the readiness gate (100 positive / 200 negative / 3 environments / 48h elapsed) has
  not been collected on-device yet; local evaluation (recall ≥0.80, false-wake ≤0.10) has not been
  run; owner has not tapped "Approve and enable"; the 30-min YouTube-Music-continuity manual check
  (detector must not steal audio focus while idle) has not been done.
- Working-tree cleanup done same session: 4 git worktrees (`krishna`, `krishna-agent`,
  `krishna-agent2`, `krishna-main-merge`) were all dirty; cleaned and pushed. Debug screenshots
  deleted (not committed — public repo). `training/openwakeword/data/` (68 MB of generated audio
  clips) and `tmp/` added to `.gitignore` — **never commit those**, per the handoff doc's privacy
  rule. `feature/voice-android` and `feature/android-control` were local-only branches, now
  published to GitHub for the first time (`54009c0`, `03b007c`) — no PRs opened yet, just pushed.

**New plan approved: `Automation_with_LLM.md` — Krishna self-improvement request system.**
Lets Krishna capture "improve yourself so that…" requests, get proposals from Codex/Claude Code via
a GitHub Actions coordinator, show them on Android+desktop, and implement only after two explicit
approval gates (never auto-merge/release). Reviewed and amended (Turso secret names, a concrete
kill switch, a status-ownership invariant so Android/desktop never race the coordinator on
`upgrade_tasks.status`, a schema-parity test for the repo's known "4-places-to-register-a-sync-
table" drift trap, untrusted-provider-output handling, narrow-scope PAT for manual dispatch,
concrete cost/rate limits). Broken into 11 sequenced, independently-testable tasks — **see task
tracker `UPG-0` through `UPG-6`** (each has an explicit build step + a manual USER TEST).
**`UPG-0` is now DONE (2026-07-17)** — see §0; next is the owner review that gates Stage 1.

---

## 0e. PRIOR — Android mobile voice fully working (2026-07-12), pushed `905041f`

Mobile went from "asks for a key it should never need, then silent/broken" to a working
tap-to-talk voice assistant with device control, in one session. All code pushed to
`origin/main` (`905041f`). Full technical trail: [[android-jni-and-build-speed]],
[[mobile-setup-baked-key]].

**Fixed, verified live on-device (phone `R9ZY40XK38A`, Samsung Galaxy A06):**
1. **Setup no longer asks for the Anthropic key on mobile** — the mechanism already existed
   (`get_baked_anthropic_key`), it just needed a **local** build (CI never had the secret baked).
2. **New minimal mobile home screen** (`src/pages/mobile/Home.tsx`) — one big tap-to-talk
   button, routed via `isMobileDevice()`; desktop overlay/dashboard untouched.
3. **Native Android TTS** — the WebView has NO `window.speechSynthesis` and Piper can't run on
   Android (spawns a Windows exe), so mobile had zero speech. Built `TtsHelper.kt`
   (`android.speech.tts.TextToSpeech`) + `tts_android.rs` JNI bridge. **She now speaks.**
4. **Root-caused a long-standing silent JNI bug**: neither tauri, tao, nor wry initializes
   `ndk-context`, so `keystore.rs`'s JNI (hardware-backed key sealing) had **never worked** —
   every call silently failed and fell back to a device-bound key. Fixed via
   `android_jvm.rs` using tao's public `main_android_context()`. Along the way, found and fixed
   a startup SIGABRT: a failed JNI call left a Java exception **pending** on the thread, which
   aborted the process on wry's next JNI call (webview creation). `with_env()` now clears
   pending exceptions after every call.
5. **AI provider seed** — mobile's baked Anthropic key existed but was never connected to the
   provider system the classic pipeline actually reads (`provider_<id>_api_key` +
   `curl_selected_ai_provider`), so every mobile AI call failed with "Missing required variable:
   api_key". Fixed in `src/lib/startup.ts` — seeds Claude as the selected provider on mobile.
6. **Mobile STT transcript bug** — Android's `webkitSpeechRecognition` emits CUMULATIVE final
   results; the old code appended each one, gluing every partial into the transcript sent to
   Claude ("hey Krishnahey Krishna good morning..." repeated ~20x). Fixed in
   `useMobileSpeech.ts`; also now surfaces "I didn't catch that" instead of silent failure.

**Phase A/B device control — built, gates green, NOT yet live-tested (blocked on owner adding
`GOOGLE_MAPS_API_KEY` + rebuild, see §2):**
- **Phase A — open apps by name**: `AppLauncherHelper.kt` lists installed launchable apps;
  `android_control.rs` fuzzy-matches a spoken name (exact → prefix → substring → package) and
  wires into the existing `open_target` Android path. "Open WhatsApp" needs zero new LLM
  plumbing — it's the same `open` action, just resolves differently on Android.
- **Phase B — media/volume/torch**: `MediaControlHelper.kt` (volume up/down/mute/set%, media
  transport keys play/pause/next/prev/stop, torch on/off) + a new `phone_control` Action wired
  through parser → executor → a PHONE CONTROL prompt section (per the window-control lesson:
  wire every seam or the LLM never emits the action). Torch via JNI sidesteps the exact Tauri
  plugin ACL wall that killed the earlier parked `feature/android-control` branch.
- **Google Maps travel-time on mobile**: plumbing done (build.rs bakes `GOOGLE_MAPS_API_KEY`,
  `get_baked_maps_key` command, startup seed, `routes.googleapis.com` added to the mobile
  capability allowlist which was desktop-only) — just needs the key value, see §2.

**Build-speed fixes (was costing ~4 hours of owner wall-clock time this session):**
- **Windows Defender was throttling `rustc` to ~20% CPU efficiency** scanning every object file.
  Owner added exclusions (project dir, `~/.cargo`, `rustc.exe`, `cargo.exe`) — huge win, keep them.
- `[profile.dev] debug=0, strip="debuginfo"` in `src-tauri/Cargo.toml` — halved APK size
  (682MB→341MB), cut compile+scan time further.
- **Established the right iteration ladder** (was using `tauri android build`, the slow release
  packager, for every tiny change): L0 frontend-only → desktop browser/`npm run dev`. L1 Rust
  gate → `cargo check --target aarch64-linux-android -p krishna` (~1 min with exclusions). L2
  device iteration → **`tauri android dev`** (native compiled once, frontend HMR to the phone in
  ~2s). L3 `tauri android build --debug` only for final verification — never for iterating.

**Session-status memories written:** [[android-jni-and-build-speed]] (the JNI mechanism + every
gotcha), [[mobile-setup-baked-key]] (baked-key flow + minimal home screen).

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN** — `tsc --noEmit` clean, `vitest run` 802/802 (43 files), all independently
reverified 2026-07-08. The **entire job-autopilot track (items 1–4)**, travel insights (item 9),
recruiter radar (item 13), Natural Speech V1–V4 (item 11), and Naukri saved searches N1–N3 (merged
`669c6ce`, awaiting owner live-test) are all code-complete and merged. **Window Control (item 14,
merged `22c6168`) is now owner-confirmed working live** (2026-07-08) — the wiring fix holds up in
real use, no further action needed there. **First-word latency is now FULLY DONE, L1–L5,
all merged**: L1 sentence-streaming (`5097b66`), L2 ElevenLabs streaming endpoint (`508a5ec`), L3–L5
earcon/STT-watchdog/panel-fix (`8e8d8c6`). **The live-transcript panel is also DONE + merged**
(`e16b0c7`) — real-time panel showing the utterance + Krishna's reply streaming in, built on L1's
infra per the plan. A final post-merge review pass caught and fixed two more issues (`3339561`): a
test-mock type gap in `live-transcript.test.tsx` that should have always failed `tsc`, and a genuine
`stripActionFences` double-space bug that the *original* L1 tests had actually baked in as
"expected" (asserting the buggy output, not the intended one) — both fixed, both re-verified.
**Neither of the panel/latency owner-facing features has been live-tested yet** — see §2.

**⚠️ Incident tonight (fully resolved, no data lost):** mid-review, `D:\Learning\krishna`'s working
tree suddenly showed ~139 tracked files deleted from disk (including `packages/core/tools/index.ts`)
plus a degraded `node_modules` (devDependencies missing, matching a corruption signature seen
earlier in `krishna-m15`) — most likely the agent's tooling operating in this checkout instead of
its own worktree during an unrelated cleanup task. Nothing was staged/committed, so `git restore .`
recovered all 139 files instantly; `node_modules` was rebuilt via `rm -rf node_modules && npm ci`
(same fix as the earlier `krishna-m15` incident). **If you ever see a wave of "D " deletions in
`git status` here with no corresponding commits, this is recoverable — don't panic, check
`git reflog` (HEAD not moving means nothing was actually lost) and `git restore .`.**

---

## 2. OWNER ACTION ITEMS — what's still on you

6. **Add Turso sync creds to `src-tauri\.env` so the phone can sync (2026-07-13, blocking the
   mobile-sync fix).** The code to bake+seed `KRISHNA_SYNC_URL`/`KRISHNA_SYNC_TOKEN` into the mobile
   build is done and compile-clean (commits `8e32b76` + `9c20b29` on `main`, not yet pushed), but
   the actual values are NOT on this machine (no real `apps/brain/.env`; nothing populated in the
   tree). Retrieve them and paste into `src-tauri\.env`:
   `turso db list` → `turso db show <name> --url` (→ KRISHNA_SYNC_URL, a `libsql://…` URL) →
   `turso db tokens create <name>` (→ KRISHNA_SYNC_TOKEN). Then say go — a rebuilt APK will make the
   phone leave "Local only mode" and pull the laptop's memories (incl. home/work addresses). Until
   then the phone stays local-only and travel-time needs the address told to it directly on the
   phone ("remember my work address is …"). ⚠️ Note: this bakes a hub-wide Turso token into the APK
   (same trade-off as the existing baked keys; fine for your own sideloaded device).
0. **Add two keys to `src-tauri\.env`, then say so to trigger a rebuild** (2026-07-12, in
   progress): `GOOGLE_MAPS_API_KEY=...` (Google Cloud Console → enable Routes API + Directions
   API → Credentials → Create API key) unblocks mobile travel-time. `OPENAI_REALTIME_API_KEY=...`
   (platform.openai.com → API keys) unblocks Live Voice/wake-word on the phone — optional, classic
   tap-to-talk already works without it. Once added, the rebuild will pick up Phase A/B device
   control too (open-app-by-name, volume/media/torch) — none of that has been live-tested on the
   phone yet, only compile-gated (`cargo check` + `tsc` both clean).
1. **~~Live-verify Window Control~~ — DONE, confirmed working (2026-07-08).** See §3a.
2. **Live-verify the full J4 assisted-apply flow** against real LinkedIn: say "apply to the next
   job" → confirm it opens the job + clicks Easy Apply → confirm fields fill from your Application
   Profile → confirm the "shall I send it, sir?" prompt appears → say yes → confirm it submits (or
   reports ambiguous honestly). This is the thing unit tests can't prove.
3. **Debug Chrome for J4** must be running with all 3 flags before each session (it does NOT
   survive a machine restart):
   `chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-krishna" --remote-allow-origins=*`
   Verify: `http://localhost:9222/json/version` returns JSON with a `webSocketDebuggerUrl`. Stay
   logged into LinkedIn in that Chrome instance (no passwords stored in the app, by design).
4. **Try the new Resume Path Browse button** (Settings → Application Profile) — confirm the native
   picker opens and a missing/renamed file shows the inline warning (J3-A).
5. **Voice ID meter stuck at 5 samples** — still unresolved, see §5 VID-2. Needs one console
   capture to finish diagnosing; not urgent, does not block J4.

---

## 3. DONE + MERGED (2026-07-04 → 07-06) — everything currently on `main`

### Job Autopilot (item 10) — FULLY COMPLETE, LinkedIn Easy Apply
| Phase | What | Commit |
|---|---|---|
| J1 | Job Pipeline URL alias (voice-open) | `3500695` |
| J2 | `get_job_queue` tool — queue read, total+top-3-by-fit spoken, KNOWN_SAFE, live-verified vs real API | `c2bbe5f` |
| J3 | ApplicationProfile store (12 fields) — Settings UI, keyed memory row → SQLCipher | `e910938` |
| J3-A | Native resume-PDF file picker (`@tauri-apps/plugin-dialog`) + `file_exists` inline warning | `14e7438` → merged; lockfiles `f27b16c`, `6148d76` |
| J4-a | In-app CDP client (WebView `WebSocket` + `getHttpFetch`); `job_apply` opens next queued job, clicks **Easy Apply** (external plain Apply reported, not clicked) | `2ea06b5` |
| J4-b | Field-fill engine — enumerate → map to J3 profile by label pattern → fill via CDP → spoken summary; profile read from the memory DB store | `b579f43` |
| J4-c | `job_apply_submit` — sensitive/confirm-gated (G-5 verbatim-confirm), submit-button detect + submission verify, honest ambiguous path, applied-status POST | `ed1fd08` |

Full history incl. fixed review findings (JA-1/JA-2, JB-1, JC-1): `JOB_AUTOPILOT_REVIEW_FINDINGS.md`.
**Not yet built:** J4b-Naukri (LinkedIn-only for now, per plan), J5 batch semi-auto (parked).

### Window Control (item 14) — built, FAILED first live test, wiring fixed + MERGED (`22c6168`), **owner-confirmed working live 2026-07-08 — DONE**
| Phase | What | Commit |
|---|---|---|
| P1 | Win32 window/monitor enumeration + pure `match_window()` matcher (exact > substring > process-alias > exe-stem fallback); 11 unit tests | `0b171c8` |
| P2 | Tauri commands replace the `computer_focus_window` stub: focus (restore+Alt-nudge+foreground), `window_move` (restore-if-maximized → move → re-maximize → focus), `window_list_summary`; all gated on Computer Control toggle | `32b3da1` |
| P3 | `control_window` LLM tool (`action: focus\|move`, `target`, `monitor?`) + system prompt rule #11; 8 new tests | `47fe8c4` |
| Fix | `parse_monitor("next", …)` hardcoded to index 1 (panic on single monitor, never cycled on 3+) → now computes the window's actual current monitor and cycles; `window_move` maximize default was unconditional `true` → now the window's actual state. 6 new tests | `3296a84` |

**⚠️ FIRST LIVE TEST FAILED (2026-07-07) — three defects the unit tests missed, all fixed the same day (committed `175781c` on `fix/window-control-wiring`, merged to `main` as `22c6168`):**
1. **`control_window` was never registered in the tool map** — imported into `packages/core/tools/index.ts` but no `register()` call, so `getTool()` returned undefined. Fixed: added the 6 `register(...)` calls for all `computer_*`/`control_window` tools.
2. **`control_window` was never wired into the `action` dispatch path** (the real root cause). Phase 3 only added a plan-executor `Tool` + a vague prompt rule; `parseActions()` and `executeAction()` had no `control_window` case, so the LLM's `{"action":"control_window",…}` block was silently dropped and Krishna spoke a **fabricated** "Teams should be front and centre now" with no tool behind it (audit_log had zero `control_window` rows across every attempt — proof it never ran). Fixed: added the `Action` type, a `parseActions` case, a non-confirm-gated `executeAction` handler (`kind:"status"`, speaks the tool's real output/error), and a concrete `WINDOW CONTROL` prompt example. New tests in `actions.test.ts` + `window-control.test.ts` drive the real parse→execute and registry seams.
3. **`focus_hwnd` reported success unconditionally + used the weak Alt-nudge.** It ignored `SetForegroundWindow`'s return (always `Ok`) and relied on a bare Alt keypress, which a background app can't use to reliably lift the foreground lock. Fixed: `AttachThreadInput`-based activation (attach to the foreground+target threads, `BringWindowToTop` + `SetForegroundWindow`, detach) with `IsIconic` restore, and it now **verifies against `GetForegroundWindow`** and returns a real error if the window didn't actually come forward.

**Lesson (again):** the P3 tests called `controlWindowTool.run()` directly, bypassing both the registry (`getTool`) and the action pipeline (`parseActions`→`executeAction`) — exactly the "test the real integration seam, not the object in isolation" gap in §6. A tool that isn't reachable from the LLM's actual output format is not "done" no matter how green its isolated tests are.

**Status after fix:** `tsc` clean, `vitest run` green (new tests added), `cargo test` automation module green. TS layer is HMR-live in the running dev app; Rust layer needs the running app rebuilt to take effect. **Still owner-live-pending** (see §2 item 1) and **uncommitted** — the coding agent should commit both layers (branch off `main`).

### Gmail + Recruiter Radar (items 12–13) — FULLY COMPLETE, live-verified
| What | Commit |
|---|---|
| G-13 OAuth redirect_uri fix (token exchange was always failing) | `0d847f1` |
| G-15 — `gmail.googleapis.com` + job-hunter host missing from Tauri http allowlist/CSP (silent transport block) | `e525b60` |
| G-16/G-17 — spoken-output hygiene: sender name not raw email, drop raw msg-id, em-dash→comma, ISO date→natural | `40df3e7` |
| Recruiter Radar R1–R3 + RR-1/RR-3/RR-4 (state, windowing, JSON-fence robustness, flaky-test fix) | `f6f9719`, `63b9afb`, `0f2f342` |
| RR-2 — `category:primary` 0-results now a valid empty answer (no inbox sweep/prefix); fallback only on real error | `8de2db4` |

Full history: `GMAIL_REVIEW_FINDINGS.md`, `GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md`.

### Travel Insights (item 9) — FULLY COMPLETE, live-verified
| Phase | What | Commit |
|---|---|---|
| P1 | `sampleDepartures()` — sequential, cap 8, per-sample failure capture | `8dda179` |
| P2 | `suggest_departure_time` tool + `travel_best` action — **live-verified** ("leaving now is 42 min, wait to 3:33pm drops to 35") | `a6e5d89` |
| P3 | `route_watches` migration + arm/cancel, single-active-watch | `e6589b7` |
| P4 | Poller: trigger on duration ≤ threshold (fixed from inverted), 15-min interval gate (fixed from 30s-every-tick), expiry speaks close-out (fixed from silent) | `f7332a5` + `aced906` |

Full history: `TRAVEL_INSIGHTS_REVIEW_FINDINGS.md`.

### Voice ID (item 7) — enrollment + passive-fill working; one open issue remains (§5)
| What | Commit |
|---|---|
| Option-A passive background-fill (verify always runs; fill even when Voice ID disabled) | `c38ecd1` |
| 3 live bugs fixed: ONNX single-thread required (Tauri has no `SharedArrayBuffer`), `addSample` missing `created_at` (NOT NULL crash), real-error surfacing | `04905c4`, `fa83f69` |
| Enable gate relaxed 100%→≥3 samples (owner decision) — **owner enrolled to 5 samples and enabled it live** | `540213c` |
| Passive-fill bootstrap gate fix (add-gate was stricter than match threshold, deadlocking growth) | `59e8d6d` |

**VID-1 is DONE** (bundled model + SHA-gate, see §5). Still open: **VID-2** (meter stuck at 5,
needs one live data point) — non-blocking for everything else.

**Earlier (pre-2026-07-05):** item 1 (travel error visibility, `4b9c997`), item 2 (no-narrated-
actions, `3b85777`), item 10-H1 (job-hunter bearer-token auth, deployed + live-verified).

### Natural Speech (item 11) — FULLY COMPLETE, V1–V4 all merged
| Phase | What | Commit |
|---|---|---|
| V1 | Variety engine: `pickLine()` anti-repeat + TOD boost + mr→hi→en fallback + {honorific} slots, ~140 seed lines × 12 categories × en/hi/mr; wired into `canned-responses.ts` (async) + 9 spoken literals in `krishna.context.tsx` | `fee4e61` |
| V2 | LLM-side prompt variety: 5 style examples + "never reuse your previous acknowledgment" instruction in `BASE_SYSTEM_PROMPT` + `seed-personas.ts`; last-3-acks from `speech_log` injected into context as a concrete anti-repeat signal | `875d7a4` |
| V3 | `speech_ban` / `speech_teach` voice actions; Settings "Voice & Phrases" page (toggle/delete/view) | `c508e18` |
| V4 | `speech_refresh` — LLM mines the owner's own conversation history into proposed new lines (`enabled:false`, source `llm`) with quality filters (banned/dup/honorific-slot/length) | `11df913` |
| Fix | Reviewer fixes: `speech_ban` now persists the raw phrase in a new `banned_phrases` table even when it doesn't match a seeded/taught line (was silently a no-op in the common case); real `speech_accept_vocabulary` voice action added (the spoken "say 'accept them'" promise was previously a dead end — nothing implemented it); honorific-slot validation tightened (was accepting hardcoded "sir"/"boss" instead of the `{honorific}` template, risking a permanently-wrong-honorific approved line); 14 new tests covering V4's previously-untested quality filters and the ban/accept fixes | `52d5dfa` |

This is the "learn from me + varied greeting words" feature the owner asked about (2026-07-06) —
fully built end to end. Full history/spec: `NATURAL_SPEECH_PLAN.md`.

---

## 4. PENDING QUEUE — priority order

### 🔴 START TODAY
0. **UPG-0 (Automation_with_LLM.md self-improvement system, Stage 0) — DONE 2026-07-17, awaiting
   owner review.** Delivered: `docs/upgrades/ARCHITECTURE.md`, `schemas/upgrade-proposal.v1.json`,
   root `AGENTS.md`, `CLAUDE.md` (see §0). Pure design artifact, no runtime code. **Blocking gate
   before UPG-1a:** owner reads the two docs and confirms approval gates / cost numbers /
   kill-switch match intent. See task tracker UPG-0..UPG-6 for the full 11-stage sequenced plan
   (each stage has its own build step + manual USER TEST before the next stage starts).
0b. **OpenWakeWord shadow mode (branch `codex/openwakeword-shadow-mode`, PR #6)** — code is built
   and verified booting live on-device; what's left is DATA COLLECTION + EVALUATION, not code:
   record ≥100 positive / ≥200 negative training clips across ≥3 environments over ≥48h (Settings →
   Wake Word → Record buttons), run local evaluation, and if it passes (recall≥0.80,
   falseWake≤0.10) tap "Approve and enable". Also do the 30-min YouTube-Music-continuity manual
   check before considering this done. See §0 above and `docs/OPENWAKEWORD_SHADOW_MODE_HANDOFF.md`.

### 🟢 Unblocked, ready to pick
1. **Naukri saved searches + Chrome profiles — N1–N3 DONE + merged (`669c6ce`, 2026-07-07
   evening).** `saved_searches` table (migration v21) + CRUD + hostname-validated URL guard,
   Settings UI + Chrome-profile picker (`list_chrome_profiles`), `open_saved_search` voice action
   (exact→fuzzy→disambiguate) + `open_in_chrome_profile`. `tsc` clean, `vitest` 731/731, `cargo
   test` compiles clean — independently reverified before merge. One review round: a rebase
   conflict left the `Action` type union malformed (orphaned `open_saved_search` member) — caught
   by `tsc`, NOT by `vitest` (esbuild strips types without checking them — always run both).
   **Non-blocking follow-ups filed** (see `chrome_profiles.rs`): hardcoded `chrome.exe` path should
   read `%LOCALAPPDATA%`; `open_in_chrome_profile`'s URL check is a weak prefix match (N1's
   store-side `hostname` parse is the real gate, so low risk); macOS/Linux
   `get_default_user_data_dir` has a latent `Option<Option<>>` mismatch (dead code on Windows).
   **N4** (profile-aware J4b-Naukri assisted apply) still blocked on the D4 owner decision — not
   started. **Not yet owner-live-tested.**
2. **J3-A test** (small) — the Browse-button/file-picker wiring has no unit test yet. Mock
   `@tauri-apps/plugin-dialog`'s `open()`, assert it writes `resumePath`.
3. **JC-1** (medium, `JOB_AUTOPILOT_REVIEW_FINDINGS.md`) — the "applied" status POST in
   `job_apply_submit` fires unconditionally; should gate on `verification.success` so an ambiguous
   submit doesn't falsely remove the job from the not-applied queue. Fix before porting to Naukri
   (N4) so the bug isn't copied in.
4. **J4b-Naukri** — now spec'd as phase N4 of `NAUKRI_SEARCH_PROFILES_PLAN.md` (2026-07-06),
   profile-aware; still sequenced after LinkedIn proves out, and blocked on the D4 owner
   decision in that plan (one shared ApplicationProfile + per-search resume override vs
   per-role profiles).
5. **First-word latency — FULLY DONE, L1-L5, all merged.** `main` at `8e8d8c6` (L1-L5) then
   `e16b0c7`/`3339561` (live-transcript + post-merge fixes) — see `LATENCY_FIRST_WORD_PLAN.md` for
   the original spec. Summary: L1 sentence-streaming speech (`SentenceStream`+`SpeechQueue`, speaks
   sentence-by-sentence instead of waiting for the full reply) → L2 ElevenLabs MSE streaming
   endpoint (starts playback on the first audio chunk) → L3 80ms earcon at end-of-speech + dynamic
   filler-watchdog timing → L4 8s STT abort+retry → L5 latency-panel column fix. **Real bugs found
   and fixed across the review rounds** (not just style nits): a `play()`-rejection hang risk in
   L2's ElevenLabs refactor (silently swallowed rejections could permanently freeze
   `SpeechQueue`/`setKrishnaSpeaking`), a dead `mediaSource.addEventListener("sourceerror", ...)`
   listener for a non-existent MediaSource event, a genuine TypeScript closure-narrowing limitation
   that took an isolated repro to root-cause, an L4 branch that was originally cut as a *sibling* of
   L3 rather than stacked on top of it (caught via `git merge-base --is-ancestor` before any code
   review — would have silently dropped L3 from `main` if merged as-is), and two test-reimplementation
   gaps (L3's filler-timing tests re-derived the formula inline instead of testing the real code;
   L4's retry tests never advanced fake timers to prove the 8s abort itself fires) — both closed by
   extracting `computeFillerRemaining()` as an exported pure function and adding a real abort-timeout
   test. **Known, accepted gap:** no test drives the real `krishna.context.tsx` wiring directly for
   any of L1-L3 (verified by manual review only — no test harness exists for that file in this
   codebase). `tsc` clean, `vitest` 802/802 (43 files) on merged `main` — independently reverified
   by the reviewer at every stage, not taken from the agent's self-reports (which twice this session
   claimed "tsc clean" that didn't hold up on independent re-check).
6. **Live transcript panel — DONE + merged** (`e16b0c7`). Real-time inline popover (bar toggle,
   off by default, matches `KrishnaChat`'s pattern) showing the current utterance + Krishna's reply
   streaming in as it's generated (fed from L1's sentence-emission point, so it shows exactly what's
   spoken — no raw tokens, no JSON fences), falling back to `lastSpoken` once idle. Merged cleanly on
   top of the L1-L5 latency merge (both touch `krishna.context.tsx`'s stream loop; auto-merge
   succeeded, hand-verified both sets of changes coexist correctly). **Post-merge review pass found
   and fixed two more issues** (`3339561`): a test-mock type gap that should have always failed
   `tsc` (fixed via `as ReturnType<typeof useKrishna>`, since the internal `KrishnaContextType`
   isn't exported), and a genuine `stripActionFences` double-space bug where the *original* L1 tests
   had actually asserted the buggy output as correct — both fixed, `main` re-verified 802/802.
   **Neither this nor item 5 has been owner-live-tested yet.**
7. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1–P3 ready to code.
8. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.

_(Item 11 · Natural Speech V1–V4 is now FULLY DONE + merged to main `52d5dfa` — see §3.)_

_(VID-1 model-bundle is now DONE + merged to main `236cba8` — see §5.)_

_(Item 14 · Window Control is now FULLY DONE + merged to main `3296a84` — see §3a. Not yet
owner-live-tested, see §2 item 1.)_

### 🎨 Design-first (owner+reviewer specs exist; agent codes only after go-ahead)
- Settings menu reorg (see #4 above).
- Orb (presence indicator) — small orb + state animations; spec only.
- Android roadmap — consolidate parked Android tracks into one phased plan.

### ⚪ Parked (don't start unless asked)
M1.5 broad-question brevity, P6-F4 TTS-too-fast repro, Ola second-opinion tool, publish draft
releases.

---

## 5. OPEN ISSUES (non-blocking, tracked)

**VID-1 · DONE + merged to main (`236cba8`, 2026-07-06).** Was: WavLM model re-downloaded from
Hugging Face on every app load; a `Ctrl+R` mid-download lost progress so `verifyVoice` stalled.
Fix (per `VOICE_ID_MODEL_BUNDLE_PLAN.md`): model now bundled locally under `public/models/`
(gitignored, SHA-verified ~97 MiB, fetched build-time by `scripts/fetch-voiceid-model.ts`;
`predev`/`prebuild` run it automatically); `embedding.ts` sets `allowLocalModels=true` with a
remote fallback. **Verified by reviewer:** tsc clean, 658/658 tests green, full `tauri dev` built +
launched, Vite serves `/models/` as real bytes, **zero huggingface.co requests at startup**.
**One owner step left to fully close it (and unblock VID-2):** speak to Krishna once, confirm the
model loads fast with no re-download even after a `Ctrl+R`, and capture one
`[voice-id] verify: score=… threshold=… match=…` console line. (The fetch script's SHA-gate-skip
follow-up is DONE — merged `4e0ac79`, see §3 Voice ID table — no code follow-up remains here.)

**VID-2 · Voice ID meter stuck at 5 samples.** DB shows `count=5, mature=0, adaptive_threshold=
0.85, confidence=17%`. The bootstrap add-gate fix (`59e8d6d`) IS active (mature=0 → gate=0.85), so
that's not the blocker. Leading theory: natural conversational speech scores **below 0.85** against
only 5 deliberate enrollment samples → `match=false` in KrishnaVAD → `considerAddSample` never
called. **Blocked on VID-1** — need one clean (post-model-load, no-reload) console capture of
`[voice-id] verify: score=… threshold=… match=…` to confirm before fixing. Do not guess-fix a
biometric gate without that number.

**Sync "SqlDriver not set."** Background sync fails `SqlDriver not set - call setDriver() before
first DB access` even though `initializeCore` calls `setDriver` before `startSync`. Likely a
module-duplication issue (`@krishna/core/sync` resolving a different driver-module instance than
the app's `setDriver` call — vite-alias vs node_modules dual instance). Only breaks sync; main
app/voice/DB work fine. Low priority — fix when sync becomes a priority.

**RR-2 pre-flight probe result (for context, already resolved):** live-confirmed `category:primary`
IS honored on the account — that's why RR-2's fix (fallback only on real error) was the correct
one. See `GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md` for the full trail.

---

## 6. HOW WE WORK (don't relearn this the hard way)

- **🔴 `core.bare` corruption incident (new, 2026-07-07 evening):** mid-review of the naukri merge,
  `D:\Learning\krishna`'s `.git\config` was found with `core.bare = true` (plus a self-referential
  `remote "main-checkout"` pointing at its own path) — every git command failed with "this
  operation must be run in a work tree", in BOTH the main checkout and `krishna-m15` (worktrees
  share the parent's `core.*` config). Nobody ran this deliberately; likely a race between two
  processes touching shared worktree metadata concurrently (same family of issue as the
  [[one-party-npm-install-rule]] node_modules incident, this time hitting `.git` plumbing instead).
  **Fix:** `git config core.bare false` in `D:\Learning\krishna` (the actual `.git`, shared by all
  worktrees — fixing it there fixes every worktree at once). **If you ever see "must be run in a
  work tree" from a command that should obviously work, check `git config --get core.bare` before
  assuming something else is broken.**

- **Roles:** Owner decides priorities, live-tests, holds keys/setup (Chrome debug flags, LinkedIn
  login). Agent writes ALL app code in the `D:\Learning\krishna-m15` worktree. Reviewer (Claude)
  plans/reviews/merges + writes docs from `D:\Learning\krishna` (main checkout).
  See [[review-not-fix-workflow]].
- **Branch model:** `main` is the single hub. Branch fresh off `main` per track
  (`git checkout -b <name> main` in `krishna-m15`); never `git checkout main` in that worktree.
  ONE branch per track — never stack two tracks on one branch (bit us once: recruiter R1 landed on
  the gmail-fix branch and had to be relocated).
- **Commit protocol:** ONE phase per commit → `npx tsc --noEmit` clean + full `npx vitest run`
  green → commit (**actually run `git commit`** — "done" that isn't committed doesn't count, this
  has happened) → STOP and report. Reviewer merges after approval.
- **🔴 node_modules / npm install rule (new, 2026-07-05 incident):** exactly ONE party touches
  `node_modules` at a time. A concurrent agent `npm install` + reviewer build corrupted the bin
  shims (`tauri` CLI became unresolvable) and took real time to diagnose and repair (`rm -rf
  node_modules && npm ci`, then reinstall + relink both `package-lock.json` and `Cargo.lock`).
  **When a phase adds a dependency:** agent installs it, commits `package.json` AND
  `package-lock.json` (and `Cargo.toml`/`Cargo.lock` for Rust deps) together, confirms done — ONLY
  THEN does the reviewer install/build. Never run installs/builds in parallel across the two
  checkouts.
- **NEVER `git push`** (feature branch OR main) without explicit owner ask — can trip the auto-release
  pipeline. Already violated once by the owner-authored fix (`fix/gmail-latest-email`), and three
  more times by the coding agent pushing feature branches on 2026-07-07. See
  [[no-push-release-pipeline]]. **Owner EXPLICITLY asked to push `main` on 2026-07-08** (ahead of a
  machine restart, wanted GitHub as a safe backup) — `origin/main` is now at `18d5a23`, matching
  local. `release.yml` fired and failed in 0s (same benign gate as every prior push — verified via
  `gh release list`, no new release published). **This does NOT change the standing rule** — it was
  one explicit, one-time exception for that specific moment; keep defaulting to local-only unless
  asked again.
- **Three gotchas:** (1) secrets go in `secureStorage`/`getSecret`, NOT Windows Credential Manager
  (a separate store the app can't read) — see [[secure-store-key-gotcha]]; personal data (e.g. the
  Application Profile) goes in the SQLCipher memory store, not localStorage (bit us once — J4-b's
  first pass read `localStorage` and found nothing). (2) Set `ExecuteActionResult.kind`
  ("answer"|"status") explicitly — don't prefix-sniff. (3) `command_log="answered"` ≠ data
  persisted — verify the actual table, not the spoken/logged outcome.
- **DB migrations must be LF-normalized** (CRLF breaks the tauri-plugin-sql checksum — T4-F5).
- **Test the real integration seam, not a reimplementation.** Recurring failure pattern this
  session (G-11, J2-B, TI-1, JA-1, JB-1): a test that hand-copies or reimplements logic instead of
  calling the real function passes even when the real function is broken (wrong CDP-response
  unwrap depth, wrong storage backend, inverted condition). When a tool crosses a real boundary
  (DB, CDP, HTTP), at least one test must drive the real function with a realistically-shaped mock
  of that boundary.
- **New external host → allowlist + CSP in the SAME commit** (T1-F4, G-15, J2-C all hit this).
  Unit tests mock `getHttpFetch` so a missing allowlist entry is invisible until a live run.

---

## 7. NEXT AGENT INSTRUCTION (paste this to resume) — updated 2026-07-16

> Read `RESUME_HERE.md` §0 in full first (today's entry: Krishna as system Digital Assistant,
> Phases 1–3 built + verified live, committed `84b47ed`, not pushed — see `VOICE_INTERACTION_
> ASSISTANT_PLAN.md`). Remaining there: a real owner voice test through the assist-triggered
> listening state (needs an actual human voice, not scriptable). Then `Automation_with_LLM.md` (the
> full self-improvement-system spec) before writing anything else. `main` is green (`ci.yml` passes
> on push). `codex/openwakeword-shadow-mode` (PR #6) is code-complete and verified live on-device —
> do not write more code there; what's left is data collection, not code (see §4 item 0b).
> `feature/voice-android` and `feature/android-control` are pushed but unmerged/unreviewed — do
> not build on top of them without checking their actual diffs first, they may be stale.
>
> **Before marking any task done, update this file's §0** with what changed and what's still
> open — that is the whole point of this file being a "single source of truth."

### Do this now: owner-review UPG-0, THEN start `UPG-1a` (not before)
`UPG-0` is **DONE** (delivered 2026-07-17, see §0) — `docs/upgrades/ARCHITECTURE.md`,
`schemas/upgrade-proposal.v1.json`, root `AGENTS.md`, `CLAUDE.md`. What's left is not an agent
task, it's the **owner USER TEST that gates Stage 1**: read `docs/upgrades/ARCHITECTURE.md` +
`schemas/upgrade-proposal.v1.json` and confirm the approval gates, the cost numbers ($50/month cap,
200k tokens/run, 1 auto + 5 manual runs per rolling 24h), and the kill-switch (`UPGRADES_PAUSED`
repo variable + settings toggle) match intent.

Once the owner confirms, Stage 1 (`UPG-1a` → `1b`/`1c`/`1d`) begins: local SQLite tables (migrations
23–25, per the 4-places sync-table checklist in `ARCHITECTURE.md`), core types + validation + DB
actions, the shared upgrade feature UI, desktop `/settings/upgrades` + Android
`/mobile/settings/upgrades` routes, and voice/text task capture — all local-only, no provider or
GitHub calls yet. **Do not start `UPG-1a` until the owner has done the review above** — each stage
in this plan is a hard gate, not a suggestion (see `Automation_with_LLM.md` §"Required Approvals").

### Separately, whenever there's a spare cycle: OpenWakeWord data collection (§4 item 0b)
This is NOT a coding task — it's the owner recording training clips via Settings → Wake Word on
the phone, then running the evaluation button once the readiness gate is met. An agent's role
here, if asked, is limited to fixing any bug the owner hits during that process — not building
new detector code.

### The lesson driving every check below (from tonight, twice)
1. **A tool "passing its own unit tests" is not the same as "reachable from the live app."**
   Window Control's Phase 3 shipped with green `tsc`/`vitest`/`cargo test` but was completely
   unreachable — the tests called the tool object directly, never the registry (`getTool()`) or
   the action dispatch (`parseActions`/`executeAction`) the live app actually uses. Before
   reporting any phase done: does at least one test drive the real seam, not a reimplementation?
2. **`vitest` passing does not mean `tsc` passes.** The naukri rebase left the `Action` type union
   syntactically broken (an orphaned member after a stray semicolon) — `vitest` (esbuild, strips
   types) reported 731/731 green on code that didn't typecheck. Both checks, every commit, no
   exceptions — and if you see a `.git` "must be run in a work tree" error from an obviously-fine
   command, check `git config --get core.bare` before assuming something else broke (see §4 item 5
   in `AGENT_NEXT_TASKS.md` — this hit both worktrees tonight from a race between concurrent git
   operations, now fixed).

### Process, non-negotiable (from prior rounds of review — do not repeat these)
1. ONE phase per commit, `tsc --noEmit` + `vitest run` (and `cargo test` if the phase touches Rust)
   all green, STOP and report after each — don't bundle phases.
2. **Actually run the checks before reporting done.** Don't claim a tool/environment failure
   without first reproducing it.
3. **Every spoken reply must describe something that actually works.** Trace claimed success to
   the real implementation and the real integration seam (see above) — don't assume a call
   succeeded just because it didn't throw, and don't assume a tool is reachable just because its
   isolated unit test passes.
4. New external host (if any) → allowlist + CSP in the **same commit** (§6 — hit 3 times already:
   T1-F4, G-15, J2-C).
5. If a phase adds a dependency, commit `package.json`/`Cargo.toml` + lockfile together and
   coordinate before anyone else installs/builds (§6 node_modules rule).
