# M1 — Conversation-only mobile v1 (Android) — implementation plan

> **For the implementing agent.** This is milestone M1 of `ARCHITECTURE_V2_PLAN.md`. Work in a
> git worktree; commit checkpoints; **do not push** unless asked. Run each task through the
> build-loop discipline: implement → `/review` → test → fix → check the box. Nothing ships on
> "it compiles."

## Goal
One voice-first talk screen on Android: tap mic → speak → Krishna answers **aloud** with your
synced memories in context → live transcript visible. **No tabs, no memory browser, no
dashboard.** Offline-of-cloud: only the Anthropic call needs internet. Everything else
(desktop behavior, sync engine, setup flow) stays as-is.

## What already exists — reuse, don't rebuild
| Asset | Where | State |
|---|---|---|
| Push-to-talk button (webkitSpeechRecognition) | `src/components/MobileVoiceButton.tsx`, `src/hooks/useMobileSpeech.ts` | Exists; **unverified in the Tauri Android WebView** |
| Chat → Anthropic direct (tauriFetch, streaming) | `src/lib/functions/ai-response.function.ts:43`, `src/hooks/useChatCompletion.ts:130` | Works |
| Conversation persistence (local SQLite) | `packages/core/database/chat-history.action.ts:351` | Works |
| Sync engine + Android Rust transport | `packages/core/sync/*`, `rust-transport.ts`, started in `src/lib/startup.ts:29-41` | Works (60s interval + focus sync) |
| Master-key seal via Android Keystore | `src/lib/secure-storage.ts:20-36`, `src-tauri/src/keystore.rs`, `KeyStoreHelper.kt` | Works |
| Mobile setup (baked key + master password) | `src/pages/setup/index.tsx:71-81`, `src-tauri/src/mobile_bridge.rs:46` | Works |
| TTS: BrowserTTS (`speechSynthesis`) + ElevenLabsTTS | `src/lib/tts.ts:16-45`, `:58-120` | Browser TTS **unverified on Android WebView** |
| Action/plan parsing + executor + confirm gate | `src/lib/actions.ts:11-61`, `packages/core/executor.ts:21-104` | Works |

## Known gaps this plan must close
1. **Memories are NOT injected into the chat prompt today.** `buildEnhancedSystemPrompt`
   (`ai-response.function.ts:14-40`) only adds response settings + markdown rules; only
   conversation history reaches the model. "Converse with memory" requires new injection (T4).
2. **Web Speech APIs may be absent in the Android System WebView.** `SpeechRecognition` is a
   Chrome feature, not a WebView guarantee; `speechSynthesis` on Android WebView was already
   patched once (see `android-mobile-build-working` fixes). T1 verifies on-device **before**
   any UI work; T2 is the native fallback.
3. **`getPlatform()` doesn't know Android** (`src/lib/platform.ts:4-18` returns
   macos/windows/linux only); mobile detection today is UA-sniffing in
   `MobileVoiceButton.tsx:17`.

## Tasks (ordered; each is a commit checkpoint)

- [ ] **T0 — Real platform detection.** Extend `src/lib/platform.ts` with `"android" | "ios"`
  using `@tauri-apps/plugin-os` `platform()` (already a Tauri v2 dependency pattern; add the
  plugin + capability if missing). Export `isMobilePlatform()`. Replace the UA sniff in
  `MobileVoiceButton.tsx:17` and any other UA checks with it. Desktop behavior must not change.

- [ ] **T1 — On-device voice spike (decides T2).** On the Android build, empirically test and
  record results in this file: (a) does `webkitSpeechRecognition` exist and return transcripts
  in the Tauri WebView? (b) does `speechSynthesis` actually produce audio (not just exist)?
  Test via a temporary debug surface or logcat. **Outcome A (both work):** skip T2, note it
  here. **Outcome B (either fails):** implement T2 for the failing side(s). Do not guess —
  this fork determines the biggest chunk of M1 work.

- [ ] **T2 — Native Android voice bridge (only for what T1 failed).** Follow the existing
  Keystore JNI pattern (`src-tauri/src/keystore.rs` ↔ `KeyStoreHelper.kt`):
  - **STT:** `SpeechRecognizerHelper.kt` wrapping `android.speech.SpeechRecognizer`
    (on-device, `EXTRA_PREFER_OFFLINE` true where supported). Tauri commands:
    `stt_start_listening` / `stt_stop` + a Tauri event `stt-result { transcript, isFinal }`.
    `RECORD_AUDIO` runtime permission request included.
  - **TTS:** `TextToSpeechHelper.kt` wrapping `android.speech.tts.TextToSpeech`. Commands:
    `tts_speak(text)` / `tts_stop` / `tts_is_speaking` + completion event `tts-done`.
  - Register commands in `src-tauri/src/lib.rs` behind `#[cfg(target_os = "android")]`; add
    ACL permissions to `src-tauri/capabilities/mobile.json` (remember the ACL lesson from
    `ANDROID_ACL_PERMISSIONS_FIX.md` — inline-plugin permissions must be declared).
  - Frontend: adapt `useMobileSpeech.ts` and `src/lib/tts.ts` to route through these commands
    on Android (keep the web implementations for desktop; selection via `isMobilePlatform()`).
    ElevenLabsTTS remains an optional online upgrade, untouched.

- [ ] **T3 — The talk screen.** New `src/pages/mobile/Talk.tsx`:
  - Layout: transcript column (user + Krishna turns, streaming text for the in-flight reply),
    a large tap-to-talk mic button (reuse/absorb `MobileVoiceButton` logic), a
    listening/thinking/speaking state indicator, and a tap-anywhere-to-stop while Krishna is
    speaking (calls the same abort path as `src/pages/app/index.tsx:42-50`).
  - Flow: tap → listen → final transcript → `useChatCompletion.submit()` → stream reply →
    strip action/plan blocks via the existing `parseActions` spokenText → TTS speak → idle.
  - Routing: in `src/routes/index.tsx`, when `isMobilePlatform()`, route `/` to `Talk`
    (desktop keeps `App`). **Do not render `MobileNav`** — remove/bypass it on the talk
    screen; `/mobile/memories`, `/dashboard`, `/settings` stay reachable on desktop only.
  - Persist turns as a normal conversation (existing `saveConversation` path) so it syncs to
    the laptop (full-parity decision). Respect safe-area insets (existing
    `safe-area-bottom` convention in `global.css`).

- [ ] **T4 — Memory context injection (benefits desktop too).** In
  `ai-response.function.ts`, extend `buildEnhancedSystemPrompt` to include a "What you know
  about the owner" section built from the local `memories` table via the existing repo layer:
  most-recent + pinned first, hard cap ~2,000 chars, decrypted locally. RAG stays disabled
  (`KRISHNA_RAG_DISABLED=true`); this is a simple recency window, not embeddings. Graceful:
  zero memories ⇒ section omitted. Add a unit test for the cap and the empty case.

- [ ] **T5 — Mobile tool policy.** On Android, register **no tools** in the registry
  (`packages/core/tools/index.ts:36-64` base set is desktop-oriented; computer tools are
  already gated). The model may still emit action blocks — `parseActions` strips them from
  spoken text; log-and-drop execution on mobile v1. Keep `remember`/memory actions working
  (they write the local DB → sync). Guard with `isMobilePlatform()` in `src/lib/startup.ts`.

- [ ] **T6 — Minimal settings sheet.** A small sheet/modal opened from an unobtrusive gear on
  the talk screen (not a tab): sync status (last-sync time from `sync-state`), TTS voice
  on/off + ElevenLabs toggle if configured, app version, and a "re-run setup" escape hatch.
  Nothing else migrates from desktop Settings.

- [ ] **T7 — Cleanups surfaced by the scout.** Fix the hardcoded IST time formatting in
  `KrishnaChat.tsx:64-68` to device-local time. Confirm CSP allows `cdn.jsdelivr.net` only
  where desktop VAD needs it (mobile must not load the VAD/ONNX path at all — verify
  `KrishnaVAD` is not mounted on Android).

- [ ] **T8 — Verification pass.** `tsc`, `vitest run`, `cargo check` (desktop **and**
  `--target aarch64-linux-android`) all green. Then the on-device acceptance script below,
  executed on the real phone, results recorded here.

## Acceptance (on-device, all must pass)
1. Fresh install → setup asks only for master password → key seals into Keystore → initial
   pull hydrates local cache.
2. Tap mic, ask "what do you know about me?" → Krishna answers **aloud** referencing a memory
   created on the **laptop**. Transcript shows both turns.
3. Tell Krishna something new ("remember that…") on the phone → after a sync cycle it's
   visible on the desktop; the phone conversation itself appears in desktop history.
4. Airplane mode: tap-to-talk still transcribes (on-device STT), Krishna fails gracefully on
   the Anthropic call with a spoken "I'm offline" style message; nothing hangs; sync resumes
   on reconnect.
5. Tap while Krishna is speaking → speech stops immediately (barge-in equivalent).
6. No tabs anywhere; no `MobileNav`; no dashboard/memories routes reachable on the phone.
7. Desktop build is behaviorally unchanged (spot-check chat, VAD voice, settings).

## Out of scope for M1 (do not build)
Reminders/tasks (M2), cloud worker + push (M3), command relay (M4), device-control plugin,
Gmail/MCP on mobile, voice-ID on mobile, wake word / continuous listening, conversation
browsing UI on the phone.
