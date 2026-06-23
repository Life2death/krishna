# Krishna — Resume Handoff (2026-06-22)

Point Claude Code at this file to resume. Everything below reflects the state at end of session.

## Where things stand

Two pieces of work happened today. **Piece 1 is shipped. Piece 2 is committed but NOT yet
live-verified or released.**

### Piece 1 — VAD mic fix (SHIPPED as v2.0.9) ✅
The production mic showed a red exclamation; root cause (confirmed live via console):
ONNX loads its WASM runtime by dynamically `import()`-ing `ort-wasm-*.mjs`. Pointing
`onnxWASMBasePath` at a local path routed that import through Vite's dev transform (500s on
`?import`); in prod the CDN import was blocked because `cdn.jsdelivr.net` was in `connect-src`
but not `script-src`.
- Fix: `onnxWASMBasePath` → CDN; added `cdn.jsdelivr.net` to prod CSP `script-src`;
  `numThreads=1` via vad's `ortConfig` hook; removed ~77MB dead local WASM.
- Verified green in dev (amber chakra + OS mic-in-use indicator). Released v2.0.9, CI built
  `Krishna_2.0.9_x64-setup.exe`. `devtools` Cargo feature stays on for prod right-click Inspect.

### Piece 2 — Stop/barge-in + failure capture (COMMITTED, NOT released) ⚠️
The user could not interrupt Krishna mid-speech, and failed commands weren't being recorded.
Both diagnosed and fixed across 4 files. **Status: typecheck + 209 tests pass; kill-switch
log-verified; the live "Failed counter increments" test was IN PROGRESS when the session was
paused** (a failing command `open zxqwvbnmnonexistentapp12345` was submitted via the bar but the
Dashboard Insights panel had not yet been re-read to confirm Failed went 0→1).

## Files changed in Piece 2 (uncommitted → committed in this handoff)

1. **src/components/KrishnaVAD.tsx**
   - `onSpeechStart`: if `isKrishnaSpeaking()`, `emit("plan-abort")` → voice barge-in (talk over
     Krishna to stop him). Reuses the wired `plan-abort` handler.
   - `onSpeechEnd`: log `failed`/`stt_failed` when STT returns empty (was silently dropped).

2. **src/pages/app/index.tsx**
   - Visible **Stop button** (SquareIcon, red) shown when `krishna.status` is `speaking`/`thinking`,
     calls `krishna.stopSpeaking()`.

3. **src-tauri/src/shortcuts.rs**
   - Kill-switch rebound `Ctrl+Shift+Escape` → `Ctrl+Shift+X` (Escape collides with Task Manager,
     never registered). New `const CANCEL_PLAN_KEY`.
   - **Critical fix:** `update_shortcuts_impl` called `unregister_all_shortcuts` then re-registered
     only frontend-config shortcuts, wiping the Rust-only `cancel_plan`. Added re-registration of
     `CANCEL_PLAN_KEY` after the sync. Log now shows: Registered → Unregistered → **Re-registered**
     (last event = Re-registered = survives). Verified in dev log.

4. **src/contexts/krishna.context.tsx** — failure-capture gaps (all now call `logOutcome`):
   - C1: failed tool action (`spokenResponse` starts with "Failed") was logged as `answered` →
     now `failed`/`tool_failed`. (the main bug — failures counted as successes)
   - C2: confirmed-action catch blocks (job-extract, reminder) spoke the error but never logged →
     now `logOutcome(..., "failed", "tool_failed", msg)`.
   - C3: action with no `spokenResponse` → now logged `failed`/`tool_failed`.
   - C4: silent skill catches — added `console.error/warn`; fixed a `return` that killed the
     intended LLM fallthrough on a bad skill template (`skillHandled` flag + `break`).

## How the stop paths now work (3 layers)
- Voice barge-in: main mic `onSpeechStart` → `plan-abort` → stops TTS + aborts AI stream.
- Keyboard: global `Ctrl+Shift+X` → Rust `handle_cancel_plan` → emits `plan-abort`.
- UI: red Stop button in the bar while speaking/thinking → `stopSpeaking()`.

## NEXT STEPS to resume (in order)
1. **Finish the live verification** that was interrupted:
   - `npm run tauri dev`, open Dashboard → note Insights "Failed" count.
   - Submit a failing command (e.g. `open somethingnonexistent123`) via the bar; reopen Dashboard;
     confirm **Failed** incremented (proves C1). Also test: while Krishna speaks, (a) press
     Ctrl+Shift+X, (b) click the Stop button, (c) talk over him — each should stop him.
2. If all good: bump to **v2.1.0** (package.json + src-tauri/tauri.conf.json + src-tauri/Cargo.toml),
   commit, `git tag v2.1.0`, `git push origin main --tags` → CI builds installers.
3. Known caveat to watch: voice barge-in has echo-loop risk on open speakers (Krishna's own TTS
   could self-interrupt). If it misfires, tune VAD thresholds or gate barge-in behind a setting.

## Useful context
- Repo: github.com/Life2death/krishna · local: `D:\Learning\krishna` · branch: `main`
- Build gotchas (don't re-investigate): `.sql` must be LF; migrations are append-only; use
  `windows-registry` crate; do NOT `npm audit fix --force` (breaks VAD/vite). VAD via
  `@ricky0123/vad-react` (vad-web 0.0.30 under the hood, ort 1.26 from CDN).
- Verify commands: `npm run typecheck`, `npm test` (209 tests), `npm run tauri dev`.
