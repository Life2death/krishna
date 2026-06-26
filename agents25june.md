# Agent Session — 25 June 2026

## Goal
- Add Gmail (read-only + send), implement Brain auto-start + Turso cloud-sync, and build a bundled distribution so the installer works on a clean machine with no repo or Node.

## Constraints & Preferences
- No third-party MCP; in-house built-in provider via McpHub.
- AES-256-GCM encrypted tokens at rest via existing FieldCrypto.
- `gmail_send_email` classified as "sensitive" (confirmation prompt).
- Brain binds to `127.0.0.1` only, not `0.0.0.0`.
- Brain auto-start uses dev mode (npx tsx) first, fallback to bundled.
- Migration SQL embedded as template strings (no file I/O) for esbuild.
- Writable paths must use Tauri `app_data_dir`, not CWD, in bundled mode.
- First-run setup runs on app launch via secure storage, no .env.

## Progress

### Done
- **Gmail provider** — token-store.ts, client.ts, tools.ts (read + send), auth-cli.ts with redirect-URI fix.
- **Gmail registered** in McpHub via `registerBuiltin()`, routed through `getAllTools()` / `callTool()`, boot conditional on token file.
- **Non-ASCII handling** — RFC 2047 subject encoding, base64 body, loadToken warns on decrypt failure.
- **Sync-status tracker** — `syncAndRecord()` records outcome; `initSyncStatus()`, `getSyncStatus()`, `updateSyncStatus()`.
- **/status endpoint** — GET with brain/db/sync/gmail/rag/ai/mcp/data sections + per-section try/catch; POST /status/sync returns real `lastSyncOk`.
- **/shutdown endpoint** — POST /shutdown runs same shutdown handler as SIGINT/SIGTERM.
- **Status Dashboard frontend** — `useSystemHealth` hook (15s poll), health cards grid, overall pill, refresh/force-sync buttons on Status page.
- **brain.rs fixes** — 3-step kill (HTTP graceful → `try_wait()` → `taskkill /T /F`), `Stdio::inherit()` (no pipe buffer freeze), `\\?\` prefix strip, `env: HashMap` parameter on both spawn methods.
- **Boot resilience** — `core-init.ts` falls back to local-only client when Turso sync unreachable; records failure in sync-status.
- **Gmail health fix** — `expired` now means `!refresh_token` (not access-token expiry). Periodic `syncAndRecord` timer in index.ts.
- **Brain env plumbing** — `load_env()` reads 18 brain config keys from secure storage; `spawn_dev`/`spawn_bundled` pass them via `cmd.env()`.
- **bundle-brain.ts** — esbuild → `dist/brain.js`, copies only runtime-essential files from `@libsql/client`, `@napi-rs/keyring`, `@xenova/transformers`, `onnxruntime-node` (win32/x64-only); prunes cross-platform binaries; total 26.3 MB (later grew to 109.3 MB after adding ESM).
- **Tauri build integration** — `beforeBuildCommand: "npm run build:bundle && npm run build"`, root `build:bundle` script delegates to workspace.
- `.gitignore` entries for `resources/brain/brain.js` and `node_modules/`.
- All commits pushed to `origin/main`.

### 25 June Session — fetch-node.ts & Validation

#### Created: `apps/brain/scripts/fetch-node.ts`
- Downloads portable Node.js (standalone `node.exe` on Windows, tar.gz/tar.xz on macOS/Linux) to `src-tauri/resources/brain/node/`
- SHA-256 verification against official `SHASUMS256.txt`
- Local caching in `~/.cache/krishna-node/v{version}/`
- Cross-device safe copy (copy+delete fallback when `renameSync` fails EXDEV across drives)
- Accepts version as CLI arg, defaults to `22.23.1`
- Added `fetch:node` script to `apps/brain/package.json`
- Chained as `npm run fetch:node && tsx scripts/bundle-brain.ts` in `build:bundle`
- Root-level `fetch:node` alias added to root `package.json`

#### Fixed bugs in fetch-node.ts
- `NOVERSION` typo → `NODE_VERSION` (5 occurrences)
- `cacheDir` variable shadowing the function name (renamed local to `cacheDirPath`)
- Removed unused `writeFileSync` import, replaced with `chmodSync`
- SHA-256 key mismatch for Windows standalone `node.exe` (SHASUMS256.txt uses `win-x64/node.exe` format, not `node-v22.23.1-win-x64.exe`)
- Cross-device `EXDEV` error on `renameSync` (cache on `C:`, repo on `D:`) — fixed with fallback `copyFileSync` + `rmSync`

#### Fixed: `bundle-brain.ts` missing ESM directories
- `@libsql/client` uses `exports` field with separate `lib-esm/` (for `import`) and `lib-cjs/` (for `require`)
- Bundle only copied `lib-cjs/`; ESM imports from `@libsql/client/lib-esm/node.js` failed at runtime
- Added `lib-esm/**/*.js` + `lib-esm/package.json` to include list for both `@libsql/client` and `@libsql/core`
- File count increased: `@libsql/client` 9→16, `@libsql/core` 6→10

#### Validated Bundled Runtime ✅
| Test | Result |
|------|--------|
| `fetch:node` — download portable Node v22.23.1 | ✅ SHA-256 verified (`f8d162c064...`) |
| `build:bundle` — esbuild + native module copy | ✅ 109.3 MB total |
| Bundle starts via `node.exe brain.js` | ✅ PID 26360 |
| `GET /health` — returns `{"ok":true}` | ✅ |
| `GET /status` — all 7 sections respond | ✅ brain, db, sync, gmail, rag, ai, mcp, data |
| `POST /status/sync` — sync status returned | ✅ `{"synced":false,"lastSyncOk":false}` |
| `POST /shutdown` — graceful shutdown | ✅ `{"ok":true}`, process exited cleanly |
| stderr warnings | ⚠️ Only `punycode` deprecation (harmless, Node v22) |

### 26 June Session — Bundle Fix, First-Run Setup & Code-Signing

#### Fixed: `src-tauri/src/brain.rs` — `--no-deprecation` flag
- Added `.env("NODE_OPTIONS", "--no-deprecation")` to `spawn_bundled` (line 178) to suppress punycode deprecation warning on Node v22.

#### Fixed: `apps/brain/scripts/bundle-brain.ts` — broken transitive deps
- **Problem:** The selective `include`/`copyFiles` approach missed 4 critical transitive dependencies: `@libsql/hrana-client`, `js-base64`, `promise-limit`, `libsql`. Validation was a **false positive** — tests ran inside the repo where parent-dir `node_modules` hid the gaps.
- **Fix:** Replaced selective-copy with a staging-dir `npm install --omit=dev --no-package-lock --ignore-scripts`. Generates a temp `package.json` with the 3 external deps pinned to installed versions (`@libsql/client@0.15.15`, `@napi-rs/keyring@1.3.0`, `@xenova/transformers@2.17.2`), runs npm install, copies `node_modules` to resources. Installed 101 packages vs ~15 before.
- Bundle size: 109.3 MB (unchanged, but all deps now correctly included).

#### Validated Bundle from OUTSIDE the Repo ✅
| Test | Result |
|------|--------|
| Bundle boots at `C:\Temp\braintest\` (outside repo) | ✅ No `MODULE_NOT_FOUND` errors |
| `GET /health` | ✅ `{"ok":true}` |
| `GET /status` | ✅ All 7 sections (brain, db, sync, gmail, rag, ai, mcp, data) |
| `POST /status/sync` | ✅ Sync status returned |
| `POST /shutdown` | ✅ `{"ok":true}`, process exited cleanly |
| Transitive deps present | ✅ `@libsql/hrana-client`, `js-base64`, `promise-limit`, `libsql`, `ws`, `node-fetch`, `detect-libc` |

#### Added: `src-tauri/src/brain.rs` — `KRISHNA_RAG_DISABLED=true` default
- Added `.env("KRISHNA_RAG_DISABLED", "true")` to `spawn_bundled` (line 179) as default for v1 bundle. Overridable via secure storage env vars applied after.

#### Added: First-run setup UI (Track 2)
- **New page:** `src/pages/setup/index.tsx` — 5-step wizard: Welcome → Anthropic API Key → Encryption Master Key (auto-generate or manual) → Turso Sync (optional) → Done.
- **New route:** `/setup` added to `src/routes/index.tsx` (standalone, no DashboardLayout).
- **First-run detection:** `src/main.tsx` — `FirstRunGate` component checks secure storage for `KRISHNA_BRAIN_TOKEN`. If absent, renders `<Setup />` instead of the main app. Uses dark theme for the setup wizard.
- On completion, saves to secure storage: `KRISHNA_BRAIN_TOKEN` (auto-generated 48-char key), `ANTHROPIC_API_KEY`, `KRISHNA_MASTER_KEY`, `KRISHNA_CLAUDE_MODEL`, `KRISHNA_RAG_DISABLED`, and optionally `KRISHNA_SYNC_URL`, `KRISHNA_SYNC_TOKEN`.
- Frontend build verified: ✅ `vite build` passes, ✅ `tsc --noEmit` passes.

#### Added: Code-signing infrastructure (Track 5)
- **New doc:** `CODE_SIGNING_PLAN.md` — 3 options covered: PFX import (simple), Azure Key Vault + relic (recommended for CI), Azure Trusted Signing (Microsoft managed). Step-by-step from cert creation to CI setup.
- **Updated `tauri.conf.json:65-70`** — added `bundle.windows` section with `certificateThumbprint: ""`, `digestAlgorithm: "sha256"`, `timestampUrl`, `tsp`. Ready to fill in thumbprint when cert is obtained.
- **Updated `.github/workflows/release.yml`** — added `Import Windows code-signing certificate` step (gated on `WINDOWS_CERTIFICATE` secret being set). Azure Key Vault login step commented out for future use.
- **New file:** `scripts/sign-windows.ps1` — local signing helper with auto-discovery of `signtool.exe` via Windows SDK.
- **New file:** `src-tauri/relic.conf` — Azure Key Vault relic config template (fill in vault/cert names).

### In Progress
- (none)

### Blocked
- Windows code-signing requires a valid Authenticode certificate (PFX). If you had one for v2.0.0, encode it to base64 and add as `WINDOWS_CERTIFICATE` GitHub secret.

## Key Decisions
- Sync status uses module-level in-memory state (no DB table), matching RAG module style.
- Gmail token decryption cached 60s TTL in `/status` to avoid keyring+argon2 on every poll.
- Dynamic imports for Gmail/crypto in status.ts keep endpoint resilient.
- Bundle script copies only `include`-listed files per native package, not entire node_modules (26.3 MB → 109.3 MB after ESM fix vs ~300 MB full).
- Portable Node fetch deferred to separate script; cached download with hash verification.

## Relevant Files
- `apps/brain/scripts/bundle-brain.ts`: Produces `resources/brain/brain.js` + `node_modules/` (109.3 MB)
- `apps/brain/scripts/fetch-node.ts`: Downloads portable Node to `resources/brain/node/` with SHA-256 verification
- `apps/brain/src/core-init.ts`: Boot-time fallback from sync to local-only; calls `updateSyncStatus()`
- `apps/brain/src/db/sync-status.ts`: Added `updateSyncStatus()` for external mutation
- `apps/brain/src/index.ts`: Periodic `syncAndRecord` timer, `/shutdown` route, shutdown clears timer
- `apps/brain/src/routes/status.ts`: Accepts `mcpHub` for real tool count; caches Gmail token; returns `lastSyncOk` from `/status/sync`
- `src-tauri/src/brain.rs`: `load_env()`, `apply_env()`, 3-step `kill()`, `Stdio::inherit()`, process tree fallback
- `src-tauri/src/lib.rs`: Calls `load_env()` and passes HashMap to both spawn functions
- `src-tauri/tauri.conf.json`: `beforeBuildCommand: "npm run build:bundle && npm run build"`
- `src/hooks/useSystemHealth.ts`: Polls `/status` every 15s
- `src/pages/status/index.tsx`: System Health section with cards, pill, refresh/sync buttons
- `src/lib/remote/index.ts`: Exports `remoteGet`, `remotePost`

## Next Steps
1. ~~**Add `--no-deprecation` to brain.rs:174**~~ ✅ Done 26 June
2. ~~**Bundle-brain.ts transitive deps fix**~~ ✅ Done 26 June
3. ~~**First-run setup UI (Track 2)**~~ ✅ Done 26 June
4. ~~**Code-signing (Track 5)**~~ ✅ Done 26 June — infrastructure in place, needs certificate to activate

## Critical Context
- `KRISHNA_BRAIN_TOKEN` is `required()` in config.ts — brain won't boot without it. Validation scripts must set a test token.
- `@xenova/transformers` + `onnxruntime-node` are included in bundle but WASM/model files excluded (downloaded on first RAG use).
- `beforeBuildCommand` runs from project root; the chain is `npm run build:bundle && npm run build`.
- On a clean machine, the brain `.env` file does NOT exist — all config comes from env vars passed by `spawn_bundled`, sourced from secure storage.
- McpHub now receives built-in providers via `registerBuiltin()` — Gmail and future in-house tools use this path, not external MCP server config.
- `bundle-brain.ts` now uses `npm install --omit=dev --no-package-lock --ignore-scripts` into a staging dir instead of selective copy. This ensures all transitive deps are included (101 packages). **Validation must always be done from OUTSIDE the repo** to avoid parent-dir `node_modules` resolution.
- `spawn_bundled` sets `NODE_OPTIONS=--no-deprecation` and `KRISHNA_RAG_DISABLED=true` by default. Secure storage env vars override these defaults.
- First-run setup wizard at `/setup` auto-detected via `FirstRunGate` in `main.tsx`. Collects Anthropic API key, master key, optional Turso sync, and auto-generates brain token.
- `node.exe` is at `resources/brain/node/node.exe` (inside `node/` subdirectory), matching brain.rs `spawn_bundled` path.
