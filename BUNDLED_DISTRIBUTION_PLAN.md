# Bundled distribution — make the installed exe work on a clean machine

**Audience:** the coding agent. **Author:** Claude (review-not-fix: Claude plans & reviews, agent codes).
**Date:** 2026-06-25. **Owner:** Vikram (multiple personal devices).

## Goal
A Krishna installer (.exe/.msi) that, on a **clean machine with no repo and no Node**, installs, launches,
auto-starts its own brain, and works fully (chat, Gmail, Turso sync, status) — driven by a first-run setup
that collects the user's secrets. Today the build produces an installer that only works on the dev machine
(it falls back to `spawn_dev`, which needs the repo + Node).

## Current state (verified)
- Auto-start, graceful exit, CORS, `/chat`, `/status`, Gmail, Turso sync all **work in dev** (commits up to
  7d731ba). Exit/CORS/provider bugs already fixed this session — those are prerequisites and are DONE.
- `tauri.conf.json` bundles `resources/brain` → `brain`, but `resources/brain/brain.js` is a **0-byte
  placeholder** and `resources/brain/node/` is **empty**.
- `apps/brain/build.ts` (esbuild) produces ONLY `apps/brain/dist/brain.js` and marks the native modules
  (`@libsql/client`, `@napi-rs/keyring`, `@xenova/transformers`) as **external** — they are NOT included.
  It does not copy anything into `src-tauri/resources/brain/`. `build:bundle` = `tsx build.ts`.
- `src-tauri/src/brain.rs` `spawn_bundled` runs `node brain.js` with `current_dir = resource_dir` but
  **passes no env vars** — so the brain reads no secrets.
- `apps/brain/src/config.ts`: `KRISHNA_BRAIN_TOKEN` is **required()** (brain throws on boot without it);
  `KRISHNA_DB_PATH` defaults to `./krishna-brain.db` (relative to cwd = the read-only install dir).
- Deferred items from BRAIN_AUTOSTART_SYNC_PLAN.md (brain-token generation + first-run UI) are still open —
  this spec is where they get finished.

## The gaps (what to build), in priority order

### Track 1 — Actually bundle the brain runtime (not placeholders)

> ## ⚠️ CRITICAL CORRECTION (2026-06-25, after reviewing scripts/bundle-brain.ts)
> The current `scripts/bundle-brain.ts` selective-`include` approach is **broken** and will fail the
> runtime validation (`@libsql/client` → MODULE_NOT_FOUND). Verified against the installed packages:
>
> 1. **Incomplete dependency closure.** `@libsql/client` depends on `@libsql/core`, **`@libsql/hrana-client`
>    (required for Turso sync)**, `js-base64`, **`libsql`**, `promise-limit`. The script copies only
>    `@libsql/client` + `@libsql/core` + the platform `.node`. The rest are missing → the brain dies on the
>    first DB call.
> 2. **Wrong entry directory.** `brain.js` is ESM, so Node resolves `@libsql/client` via `exports.import.node`
>    = `./lib-esm/node.js`. The script copies only `lib-cjs/**` — `lib-esm/` is never copied. Same for
>    `@libsql/core`.
> 3. **transformers entry/deps wrong.** `@xenova/transformers` `main` is `./src/transformers.js` (not
>    `dist/`), deps are `onnxruntime-web`/`sharp`/`@huggingface/jinja` (none copied); and `onnxruntime-common`
>    is hoisted to root, so the nested-path special-case skips it.
>
> **FIX — replace the hand-picked `include`/`copyFiles` logic with a real production install:**
> write a temp `package.json` listing the three native deps at their installed versions, then
> `npm install --omit=dev --no-package-lock --prefix <staging>` and move its `node_modules` into
> `src-tauri/resources/brain/node_modules/`. npm computes the full, correct closure AND the right platform
> optional deps and ESM entry dirs automatically. Then prune non-target onnxruntime binaries. (Keep
> `fetch-node.ts` — that part is fine.)
>
> **FOR v1 OF THE BUNDLE: set `KRISHNA_RAG_DISABLED=true` in the bundled brain's env** (transformers +
> onnxruntime + native `sharp` is a huge, fragile payload). Ship DB + Gmail + sync + chat first; add RAG to
> the bundle as a follow-up. This removes issue #3 from the critical path and shrinks the installer.
>
> **VALIDATION GATE (do before the first-run UI):** the test MUST run from a directory **OUTSIDE the repo
> tree** — copy `resources/brain/` to e.g. `C:\Temp\braintest\` and run `node\node.exe brain.js` from there.
> Running it in-place gives a FALSE PASS: Node walks parent dirs and resolves any missing bundle deps from
> the repo's root `node_modules` (verified 2026-06-25 — `@libsql/hrana-client`, `libsql`, `js-base64` all
> resolved from `D:\Learning\krishna\node_modules`, not the bundle). The real test: copy out, RAG disabled,
> hit `/health` AND do a real DB write (`POST /memories`) so the libsql/hrana closure is actually exercised.
> Only after that passes is the runtime de-risked.

Extend `apps/brain/build.ts` (or a new `scripts/bundle-brain.ts`) so `build:bundle` produces a complete,
self-contained `src-tauri/resources/brain/`:
1. esbuild `dist/brain.js` (exists) → copy to `src-tauri/resources/brain/brain.js`.
2. Copy the **external native modules** and their `.node` binaries into
   `src-tauri/resources/brain/node_modules/` so `brain.js`'s `require()` resolves them at runtime:
   `@libsql/client` (+ `libsql` platform binary), `@napi-rs/keyring` (platform `.node`),
   `@xenova/transformers` (+ `onnxruntime-node` native libs). Verify the platform-specific optional deps
   for the **build target** are the ones copied.
3. Ship a **portable Node runtime** into `src-tauri/resources/brain/node/` (`node.exe` on Windows;
   `bin/node` on macOS/Linux). Pin a Node version (≥ the `target` in build.ts). Document where it's fetched
   from / how it's vendored (a `scripts/fetch-node.ts` or a checked-in vendored binary per platform).
4. Wire `tauri.conf.json` `beforeBuildCommand` to run `build:bundle` (then `tsc && vite build`) so every
   release build refreshes these artifacts. Add `resources/brain/**` (the real files) — but keep the
   bundled artifacts **gitignored** (they're build outputs), generated at build time.
5. **Cross-platform note:** the native binaries + Node runtime are per-OS/arch. The installer for each
   target must bundle that target's binaries. If only Windows is needed now, scope to win-x64 and say so.

### Track 2 — Secrets & first-run setup (the critical blocker)
On a clean install there is **no `.env`**. Build a first-run flow + secure storage:
1. **First-run setup screen** (desktop) collecting and persisting:
   - `ANTHROPIC_API_KEY`
   - `KRISHNA_MASTER_KEY` — **generate on the first device; show it once to copy; on other devices the user
     pastes the SAME key** (hard requirement — synced encrypted rows won't decrypt otherwise; see
     [[brain-master-key-custody]]).
   - `KRISHNA_SYNC_URL` + `KRISHNA_SYNC_TOKEN` (Turso) — optional but recommended for multi-device.
   - Gmail OAuth client JSON (reuse existing flow); run `gmail:auth` once per device (token is local).
2. **Brain token:** the app **generates** a random `KRISHNA_BRAIN_TOKEN` on first run, stores it in OS
   secure storage (`src-tauri/src/secure.rs`), passes it to the spawned brain via env, AND uses it for the
   app's own calls (replacing the manual paste). Auto-write the app's brain config
   (`brainMode: "remote"`, `brainUrl: "http://localhost:8787"`, this token) so the user never hand-configures.
3. **Pass secrets to the spawned brain:** both `spawn_dev` and `spawn_bundled` must set `Command::env(...)`
   for every `KRISHNA_*` / `ANTHROPIC_API_KEY` value, sourced from secure storage / the per-user config —
   instead of relying on `apps/brain/.env`. (The brain already reads `process.env`; it just needs them set.)
4. Store non-secret config (sync URL, paths, model) in a per-user config file; secrets in OS secure storage.

### Track 3 — Per-user writable data dir
The install dir is read-only (Program Files). Point the brain's writable files at a per-user location
(Tauri `app_data_dir`, e.g. `%APPDATA%/Krishna` on Windows):
- `KRISHNA_DB_PATH` → `<app_data_dir>/krishna-brain.db` (passed via env from the app).
- Gmail token file (`KRISHNA_GMAIL_TOKEN_PATH`) → `<app_data_dir>/.gmail-token.enc`.
- `@xenova/transformers` model cache → a writable cache dir under `<app_data_dir>` (set its cache env/option);
  note the ~25MB model downloads on first RAG use (needs internet once) — or pre-bundle the model, or keep
  RAG optional so first boot doesn't block.

### Track 4 — Robustness already-specced, confirm carried in
- Brain must boot even if Turso/secrets are partially missing (offline-boot resilience — fixed in b959fe9;
  verify it still holds in bundled mode).
- `spawn_bundled` already errors clearly if `node.exe`/`brain.js` are missing — keep that.

### Track 5 — Signing & distribution (for installing on other machines without warnings)
- Code-sign the exe/msi (desktop v2.0.0 was signed — reuse that cert/flow) so SmartScreen/Gatekeeper don't
  block installs on Vikram's other devices. Document the signing step in the release flow.

## Acceptance criteria
- On a **clean Windows VM** (no repo, no Node): install the .exe → launch → first-run setup → brain
  auto-starts from the bundled Node + brain.js → `/health` ok → chat works, Gmail works after `gmail:auth`,
  status dashboard populates. **Zero manual `npm`/token steps.**
- Quit → brain syncs to Turso and dies, no orphan (already verified in dev — confirm in bundled).
- Second device: install + paste the SAME master key + same Turso URL/token → memories written on device A
  appear on device B and decrypt.
- Wrong/absent master key on device B → clear "master key mismatch" message, not silent corruption.
- `build:bundle` is idempotent and run by `beforeBuildCommand`; `resources/brain/` build outputs are
  gitignored.

## Risks / watch-items
- **Native-module bundling is the top risk** — `@libsql/client`, `@napi-rs/keyring`, `onnxruntime-node`
  ship platform `.node` binaries that esbuild marks external; copying the correct target's binaries +
  portable Node and proving `require()` resolves them is the hard part. **Prototype "bundled node + brain.js
  reaches /health on a machine with no global Node" before building the first-run UI.**
- Installer size grows (portable Node ~50MB + onnxruntime). Acceptable; note it.
- Per-target builds: each OS/arch needs its own native payload.

## References
Specs: BRAIN_AUTOSTART_SYNC_PLAN.md (auto-start + sync), STATUS_DASHBOARD_PLAN.md, BRAIN_FOLLOWUP_FINDINGS.md.
Memories: [[brain-master-key-custody]] (shared-key rule), [[gmail-tool-decision]] (Gmail live),
[[project-krishna-overview]]. Done this session (prerequisites): exit fix, CORS, /chat var keys, A/B/C.
