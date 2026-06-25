# Brain auto-start + Turso cloud-sync — implementation spec

**Audience:** the coding agent. **Author:** Claude (review-not-fix workflow — Claude plans & reviews, agent implements).
**Date:** 2026-06-25. **Owner:** Vikram (vikram.panmand@gmail.com), single user, multiple personal devices.

## Goal
1. **Auto-start:** launching the Krishna desktop app (the exe) starts the brain automatically; closing the
   app stops it. No manual `npm start`. Must work on each of Vikram's devices.
2. **Cloud sync (data only):** each device runs its **own local brain**, but their databases are kept in
   sync through **Turso** (libSQL embedded replica). Memories/RAG/chat-history converge across devices.
   No cloud-hosted brain in this scope — compute stays local per device.

Non-goals (explicitly out of scope): cloud-hosted brain / compute fallback, shipping to third-party
users, Supabase (rejected — Turso sync is already built in and is the same DB engine).

---

## Current state (verified facts, with citations)
- Brain is a Node app run via `tsx src/index.ts` (`apps/brain`, `npm start`). Node v26 on the dev box.
  **`npm run dev` (tsx watch) hangs on Node 26 — use plain `tsx`.**
- **The app does NOT spawn the brain today.** They are separate processes. No `externalBin`/sidecar in
  [tauri.conf.json](src-tauri/tauri.conf.json) (only `beforeDevCommand`/`beforeBuildCommand`).
- Tauri backend already spawns external processes elsewhere (`Command::new` in `capture.rs`, `tts.rs`,
  `resolver.rs`) and has a setup hook at [lib.rs:179](src-tauri/src/lib.rs) `.setup(|app| { … })` — the
  place to launch the brain.
- App brain config lives in **localStorage** via `readBrainConfig`/`saveBrainConfig`
  ([remote-client.ts](src/lib/remote/remote-client.ts)). Desktop default `brainMode` = `"local"`,
  `brainUrl` = `http://localhost:8787`, `brainToken` = `""`.
- MCP/Gmail tools load **only when `brainMode === "remote"`** ([useMcpTools.ts:35](src/hooks/useMcpTools.ts)).
- **Turso sync is already implemented** in [libsql-driver.ts:10](apps/brain/src/db/libsql-driver.ts): if
  `KRISHNA_SYNC_URL` is set, the local DB file becomes an embedded replica syncing to Turso, controlled by
  `KRISHNA_SYNC_URL` / `KRISHNA_SYNC_TOKEN` / `KRISHNA_SYNC_INTERVAL` (default 60s) — see
  [config.ts:21](apps/brain/src/config.ts). **These env vars are currently empty (sync OFF).**
- Field encryption: rows encrypted AES-256-GCM with `KRISHNA_MASTER_KEY` (env) or OS-keyring key
  ([keyring.ts](apps/brain/src/crypto/keyring.ts)). `secure.rs` exists for OS secret storage on the app side.
- Brain graceful shutdown handler exists ([index.ts](apps/brain/src/index.ts) `shutdown()`), but it does
  **not** force a final DB sync.

---

## ⚠️ The constraint that governs everything: ONE shared master key
Synced rows are stored **encrypted**. A device can only read another device's rows if it holds the **same
`KRISHNA_MASTER_KEY`**. Mismatched keys → `Unsupported state or unable to authenticate data` (the exact
failure hit on 2026-06-25 when the env key ≠ keyring key).

Therefore, for multi-device sync:
- **All devices MUST use the identical `KRISHNA_MASTER_KEY`.** The per-device OS-keyring approach is
  INVALID once sync is on.
- First device generates the key; every other device is given the SAME key during first-run setup.
- The key is shared out-of-band (user pastes it); it is NEVER committed and NEVER stored in Turso.
- Turso only ever holds ciphertext — inbox/memory contents stay private in the cloud. Good.

---

## DECIDED (2026-06-25): bundle the brain inside the app installer
Vikram chose **bundle the brain into the installer** — a plain install must run the brain with no repo or
Node present on the device. The "assume repo + Node" option is rejected.

**Delivery approach (required):** the brain has **native deps** (`@libsql/client`, `@napi-rs/keyring`, and
`@xenova/transformers`/onnxruntime for RAG), so a single-binary compile (pkg/SEA) is fragile and is NOT the
approach. Instead:
- esbuild-bundle the brain to a single JS entry, and ship a **portable Node runtime + the bundled brain +
  its native node_modules** as **Tauri resources** (`bundle.resources` in tauri.conf.json).
- Spawn the brain via the bundled Node (`node brain.js`) from the Tauri `.setup()` hook, with `cwd`/env
  pointed at the per-user config dir (see First-run).
- onnxruntime (RAG) is the heaviest payload — ship RAG so it works, but make the brain **boot even if the
  RAG model/native bits are missing** (RAG already inits async + non-blocking via `.catch()` in index.ts),
  so a partial bundle never blocks startup.
- **De-risk first:** before building any UI, prototype "Tauri spawns the bundled Node + brain and reaches
  `/health`" on a clean machine. Native-dep bundling is the top risk in this whole effort.

---

## Track 1 — Auto-start the brain with the app
In the Tauri `.setup()` hook (lib.rs:179):
1. **Health-check first.** `GET http://localhost:8787/health` with the stored token. If it answers `ok`,
   a brain is already running → do NOT spawn a second (avoid `EADDRINUSE` on 8787).
2. **Spawn the brain** as a managed child process (bundled Node runtime + brain, per the decision above),
   with the brain's working dir / env pointed at the per-user config (see First-run below). Capture stdout
   for diagnostics.
3. **Wait for readiness:** poll `/health` until ok or a timeout (~30s; boot is ~15–20s incl. googleapis +
   RAG). Surface a "Starting Krishna's brain…" state in the UI; don't fire remote calls until ready.
4. **Auto-configure the app:** on first successful boot, write `brainMode: "remote"`, `brainUrl:
   "http://localhost:8787"`, and the brain token into the app config (localStorage via `saveBrainConfig`),
   so Gmail/memory/RAG light up without the user touching Settings.
5. **Lifecycle:** kill the child on app exit (window-destroyed / `on_exit`). Handle brain crash: detect exit,
   optionally auto-restart once, else show an error state. Keep the existing manual Settings → Brain
   Connection controls working as an override/escape hatch.

Token handling: generate a brain token on first run, store it in OS secure storage (`secure.rs`) AND pass it
to the spawned brain as `KRISHNA_BRAIN_TOKEN`, so app and brain share the same token without it living in a
plaintext file.

## Track 2 — Turso cloud sync (data only)
1. **Provision (manual, Vikram):** create a Turso account + one database (e.g. `krishna`), get its
   `libsql://…` URL and an auth token. **Exact steps in "Appendix: Turso provisioning" below.**
2. **Wire env:** set `KRISHNA_SYNC_URL`, `KRISHNA_SYNC_TOKEN`, `KRISHNA_SYNC_INTERVAL` (60 is fine) in each
   device's brain config/env. No driver code change needed — [libsql-driver.ts](apps/brain/src/db/libsql-driver.ts)
   already branches on `syncUrl`.
3. **Sync on shutdown (new code):** in the brain `shutdown()` handler, call `client.sync()` (expose a
   `sync()` from the driver) before closing, so the last writes reach Turso even if <60s old. This is the
   correct version of "push on close" — additive to the periodic interval, not a replacement.
4. **Optional: sync on app close** — the app's brain-kill step should let the brain finish its final sync
   (send SIGTERM, wait for graceful exit) rather than hard-killing, so step 3 actually runs.
5. **Schema/migrations:** migrations run per device on boot (`CREATE TABLE IF NOT EXISTS`). With a shared
   Turso DB this is idempotent. Verify no migration writes conflict on first multi-device boot.

## First-run setup (new UI)
A setup screen (desktop) that collects and stores, in a **per-user config dir** (e.g. `%APPDATA%/krishna`
on Windows; platform dirs elsewhere) and/or OS secure storage:
- `ANTHROPIC_API_KEY`
- `KRISHNA_MASTER_KEY` — **generate on the first device; paste the existing key on every other device**
  (with a clear warning: must match across devices or synced data won't decrypt).
- `KRISHNA_SYNC_URL` + `KRISHNA_SYNC_TOKEN` (Turso).
- Gmail OAuth client JSON path (reuse existing flow) — and run `gmail:auth` once per device (token is a
  local file, not synced; same inbox regardless).

The spawned brain reads these instead of a repo-relative `.env`, so it works off a clean install.

---

## Security notes
- Master key: OS secure storage on each device; shown once for copying; never logged, never in Turso.
- Brain token: OS secure storage; not a plaintext file.
- Turso holds only ciphertext for encrypted fields; the auth token scopes DB access — treat as a secret.
- Keep `localhost`-only binding for the brain unless/until a cloud-hosted brain is in scope (it isn't here).

## Acceptance criteria
- Launch the exe on a clean device → brain boots, app flips to Remote, `/health` ok, Gmail tools appear,
  "find my job emails" works — with zero manual `npm start`.
- Close the app → brain exits cleanly AND a final Turso sync completes.
- Write a memory on device A → within a sync interval it appears on device B (same master key) and decrypts.
- Set a DIFFERENT master key on device B → it must FAIL loudly with a clear "master key mismatch" message,
  not silently show empty/garbled data.
- Brain already running (manual) → app does not spawn a duplicate; no port conflict.
- Offline (no Turso reachable) → brain still boots and works locally; sync resumes when back online.

## Risks / watch-items
- **Native-dep bundling** (libsql, napi keyring, onnxruntime) is the top risk — prototype the spawn of a
  bundled brain early before building the UI.
- Boot latency (~15–20s) — the "starting…" state is mandatory UX, not optional.
- Sync conflicts: libSQL embedded replicas are last-writer-wins per row; fine for single-user multi-device,
  but note it (no multi-writer merge logic).
- Don't regress the manual Brain Connection settings — they remain the override path.

## Appendix: Turso provisioning (Vikram's manual step)
Goal: end up with two values — `KRISHNA_SYNC_URL` (a `libsql://…` URL) and `KRISHNA_SYNC_TOKEN` (an auth
token). On THIS Windows box, `bash` routes to a broken WSL, so the **web dashboard is the primary path**;
the CLI is the alternative if a working shell is available.

### Path A — Web dashboard (recommended on Windows, no CLI)
1. Go to https://app.turso.tech and sign up (GitHub login is easiest).
2. **Create Database** → name it `krishna` → pick the region closest to you (Mumbai / `ap-south` if offered).
3. On the database page, copy the **URL** — it looks like `libsql://krishna-<org>.turso.io`.
   → this is `KRISHNA_SYNC_URL`.
4. **Create Token** (database actions menu / "Generate token") → copy it. → this is `KRISHNA_SYNC_TOKEN`.
   Use a full-access (read+write) token; it does not expire unless you set an expiry.

### Path B — Turso CLI (if a working shell exists; e.g. Scoop on Windows or WSL/macOS/Linux)
```
# install (macOS/Linux/WSL):  curl -sSfL https://get.tur.so/install.sh | bash
# Windows (Scoop):            scoop install turso
turso auth signup                     # or: turso auth login
turso db create krishna               # optionally: --location bom   (Mumbai)
turso db show krishna --url           # -> libsql://krishna-<org>.turso.io   (KRISHNA_SYNC_URL)
turso db tokens create krishna        # -> prints the token                  (KRISHNA_SYNC_TOKEN)
```

### Then wire it into the brain
Add to `apps/brain/.env` (gitignored) on each device — **same values, and the SAME `KRISHNA_MASTER_KEY`
on every device**:
```
KRISHNA_SYNC_URL=libsql://krishna-<org>.turso.io
KRISHNA_SYNC_TOKEN=<token>
KRISHNA_SYNC_INTERVAL=60
```
Restart the brain (`npm start`). No driver code change is needed — the existing
[libsql-driver.ts](apps/brain/src/db/libsql-driver.ts) auto-enables embedded-replica sync when `syncUrl`
is present.

### ⚠️ Seeding caveat (handle when first enabling sync)
The local `krishna-brain.db` already exists (schema + RAG embeddings; memories currently 0). When you first
point it at an EMPTY Turso DB, libSQL embedded-replica semantics treat the **remote as the source of truth**,
so pre-existing local-only rows may not auto-push. Because the meaningful data right now is ~nothing
(memories were wiped this session, RAG re-indexes from memories), the clean approach is: **let the brain
create schema fresh against the empty Turso DB.** If there IS data worth keeping later (chat history, learned
actions), seed the Turso DB from the local file first (dump/load via `turso db shell`) BEFORE relying on sync.
Verify after restart: `turso db shell krishna "SELECT name FROM sqlite_master WHERE type='table'"` (or the
dashboard data browser) shows the Krishna tables.

## References
- Memories: [[brain-master-key-custody]] (shared-key rule), [[gmail-tool-decision]] (Gmail is live),
  [[project-krishna-overview]]. Setup history: BRAIN_GMAIL_SETUP_RESUME.md.
