# Krishna — Session resume (2026-06-25)

Self-contained handoff so this work can resume cold — fresh session, corrupt memory, or a different
machine. Read top-to-bottom; the "Resume checklist" and "NEXT ACTION" are the fast paths.

---

## 0. Quick context
- **Project:** `D:\Learning\krishna` — Tauri (Rust + React/TS) voice assistant. Branch: `main`.
- **The "brain":** `apps/brain` — a Node/Fastify server (run via `tsx`, NOT compiled) that provides Gmail,
  RAG, memory, Turso cloud sync, and an AI `/chat` proxy. The desktop app talks to it in **Remote mode**.
- **Workflow:** Claude (me) **reviews & plans / sometimes fixes**; a **separate coding agent** writes most
  of Krishna's code. I review the agent's commits and write specs for it.
- **Node version:** v26 on the dev box. `tsx watch` (`npm run dev`) **hangs** on Node 26 — always use plain
  `npm start` (= `tsx src/index.ts`) for the brain.

## 1. Resume checklist (boot the brain locally)
```
cd D:/Learning/krishna/apps/brain
npm start            # NOT "npm run dev" (hangs on Node 26)
# Listens on http://127.0.0.1:8787  (binds 127.0.0.1 only)
# Health (public, no auth): curl http://localhost:8787/health  -> {"ok":true}
```
- Secrets live in **`apps/brain/.env`** (gitignored). To resume on another machine, **copy that `.env`
  across** — it holds `KRISHNA_BRAIN_TOKEN`, `KRISHNA_MASTER_KEY`, `ANTHROPIC_API_KEY`,
  `KRISHNA_CLAUDE_MODEL`, `KRISHNA_RAG_DISABLED`, `KRISHNA_SYNC_URL`, `KRISHNA_SYNC_TOKEN`,
  `KRISHNA_SYNC_INTERVAL`, `KRISHNA_GMAIL_TOKEN_PATH`, `KRISHNA_GMAIL_OAUTH_KEYS_PATH`.
- **Desktop app → Remote mode:** Settings → Brain Connection → Remote, URL `http://localhost:8787`, paste
  `KRISHNA_BRAIN_TOKEN` → Test Connection. (Token value is in `apps/brain/.env`, not repeated here.)
- The full Tauri app (dev): `npm run tauri dev` from repo root. It auto-spawns the brain on startup
  (health-checks first; falls back to dev spawn). Release build: `npm run tauri build`.

## 2. What this session accomplished — all LIVE & verified
| Capability | State |
|---|---|
| **Gmail (read + send)** in the brain via built-in McpHub provider | LIVE. 4 tools: `gmail_search_messages`, `gmail_read_message`, `gmail_list_labels`, `gmail_send_email`. Scopes `gmail.readonly` + `gmail.send`. `send` is **sensitive → confirmation-gated** (mcp-bridge + server-side `/mcp/execute`). Token encrypted at `apps/brain/.gmail-token.enc`. |
| **RAG** (local embeddings, `Xenova/all-MiniLM-L6-v2`) | Enabled; model cached under `node_modules/@xenova/transformers/.cache`. |
| **Turso cloud sync** (libSQL embedded replica) | LIVE + verified round-trip (write/delete propagate, stored encrypted). DB `krishna-life2death.aws-ap-south-1.turso.io`. |
| **Brain auto-start with the app** | Spawns + health-checks + owns the brain; kills it on exit. |
| **Exit button** | FIXED + verified (app + brain + port all clean on quit). |
| **Graceful sync-on-close** | App POSTs `/shutdown` → brain runs final Turso sync → exits → tree-kill, no orphan. |
| **System Health dashboard** (Status page) | LIVE in Remote mode. `/status` returns brain/db/sync/gmail/rag/ai/mcp/data. No secrets leaked. |
| **AI `/chat` in Remote mode** | FIXED (was 100% broken) + verified streaming. |
| **CORS** | FIXED — webview can now reach the brain (was the real "connection failed" cause). |

## 3. Commits this session (newest first, all on `main`)
```
26fdd01 Step 5: wire bundle-brain into beforeBuildCommand
37f8121 Step 2+3+4: bundle-brain.ts — native module resolution, portable Node, esbuild
de08d22 Step 1: brain.rs env plumbing — load secrets from secure storage, pass to spawned process
7d731ba fix: add CORS to brain so the desktop webview can connect          (Claude)
3606d15 fix: brain /chat — lowercase provider variable keys                (Claude)
3ad3b54 Remove redundant dynamic import in shutdown handler
b959fe9 Fix brain boot resilience, Gmail expired check, periodic sync timer
391c553 fix: exit button + graceful brain shutdown + spawn cwd             (Claude)
ea419b1 Fix brain kill/stdio/status issues
507502b Add System Health dashboard (useSystemHealth + UI + status routes)
52b89ed feat: brain auto-start (Track 1) + Turso sync on shutdown (Track 2)
2b4f0bc..44be5d8  built-in Gmail provider + fixes
```
Uncommitted at session end: `apps/brain/scripts/bundle-brain.ts` (agent reworking it),
`apps/brain/scripts/fetch-node.ts` (new), plan docs.

## 4. ⚠️ CRITICAL RULES — do not break these
1. **ONE shared `KRISHNA_MASTER_KEY` across all devices.** Memories + Gmail token are AES-256-GCM encrypted
   with it. A different key on another device → synced rows download but **won't decrypt** (we hit this exact
   error early in the session). For multi-device: copy the SAME `KRISHNA_MASTER_KEY` (+ same SYNC_URL/TOKEN)
   to every device. Turso only ever stores ciphertext.
2. **Brain binds 127.0.0.1 only.** `/health`, `/ws`, `/shutdown` are auth-exempt; everything else needs the
   bearer token. CORS allows `*` (safe: localhost-only + token auth, no cookies).
3. **`/chat` provider variables must be lowercase** (`api_key`, `model`) — `extractVariables` lowercases the
   `{{API_KEY}}` placeholders. Uppercase = "Missing required variable: api_key".
4. **Don't put `KRISHNA_MASTER_KEY` / Turso token in committed files.** They live only in `apps/brain/.env`.

## 5. Specs / handoff docs (in repo root)
- `BRAIN_AUTOSTART_SYNC_PLAN.md` — auto-start brain + Turso sync (DONE).
- `STATUS_DASHBOARD_PLAN.md` — System Health dashboard (DONE).
- `BRAIN_FOLLOWUP_FINDINGS.md` — findings A/B/C (all fixed: boot resilience, Gmail expired, sync timer).
- `BUNDLED_DISTRIBUTION_PLAN.md` — **make the installer work on clean machines (IN PROGRESS).** Has a
  prominent **⚠️ CRITICAL CORRECTION** block at the top of Track 1 — read it.
- `BRAIN_GMAIL_SETUP_RESUME.md` — original Gmail setup (now superseded by the in-house tool, partly stale).

## 6. Where things stand on the bundled distribution (the active work)
Goal: an installer that works on a **clean machine with no repo/Node**. Tracks 1 (env plumbing) and the
fetch-node piece are done; the native-module bundling is **NOT actually working yet**.

- ✅ `spawn_dev`/`spawn_bundled` now pass secrets to the brain via env from Tauri secure storage
  (`brain.rs` `load_env`/`apply_env`/`BRAIN_ENV_KEYS`). No `.env` needed at runtime once secure storage is
  populated.
- ✅ `fetch-node.ts` downloads portable Node (v22.23.1) to `src-tauri/resources/brain/node/` (SHA-verified).
- ❌ **`bundle-brain.ts` native-module closure is BROKEN.** It uses a selective `include`/`copyFiles` list
  that misses transitive deps. Verified the bundle is missing `@libsql/hrana-client` (Turso sync), `libsql`
  (native DB), `js-base64`, `promise-limit`. The agent's "validation passed" was a **FALSE POSITIVE** — the
  test ran inside the repo, so Node resolved the missing modules from `D:\Learning\krishna\node_modules`
  (parent-dir walk). On a clean machine the brain would crash on boot.
- The 2.1.0 installer built this session (`src-tauri/target/release/bundle/{nsis,msi}/Krishna_2.1.0_*`) runs
  on THIS machine (dev fallback) but is **not** clean-machine-ready.
- Still deferred: first-run setup UI (collect ANTHROPIC_API_KEY / master key / Turso / Gmail → secure
  storage), code-signing.

## 7. 👉 NEXT ACTION — exact instruction for the coding agent
> The bundle validation was a false positive (it passed only because it ran inside the repo; Node resolved
> missing deps from the repo root `node_modules`). The bundle still misses `@libsql/hrana-client`, `libsql`,
> `js-base64`, `promise-limit`. Do, in order:
> 1. **Replace the selective copy in `bundle-brain.ts` with a real install:** temp `package.json` listing the
>    native deps → `npm install --omit=dev --no-package-lock` into a staging dir → move its `node_modules`
>    into `src-tauri/resources/brain/node_modules/`; prune non-target onnxruntime binaries. Keep
>    `fetch-node.ts`. (Selective globs can't track transitive deps — proven twice.)
> 2. **Set `KRISHNA_RAG_DISABLED=true` in the bundled brain env for v1** (drop transformers/onnxruntime/sharp
>    off the boot path).
> 3. **Re-validate OUTSIDE the repo:** copy `resources/brain/` to `C:\Temp\braintest\`, run
>    `node\node.exe brain.js` there; must reach `/health` AND a `POST /memories` succeed AND `POST
>    /status/sync` work. In-place = false pass.
> Do NOT start the first-run UI until that out-of-repo test passes.

After that passes: build first-run setup UI → rebuild installer → test on a clean Windows VM → code-sign.

## 8. Key file map
- Brain entry: `apps/brain/src/index.ts` · config: `apps/brain/src/config.ts` · auth/CORS: `auth.ts` +
  index.ts onRequest hook · provider: `apps/brain/src/provider.ts` · Gmail: `apps/brain/src/gmail/*` ·
  sync driver: `apps/brain/src/db/libsql-driver.ts` · sync status: `apps/brain/src/db/sync-status.ts` ·
  status route: `apps/brain/src/routes/status.ts` · bundling: `apps/brain/scripts/{bundle-brain,fetch-node}.ts`.
- Tauri brain spawn/lifecycle: `src-tauri/src/brain.rs` · app exit/tray/setup: `src-tauri/src/lib.rs`
  (`QUITTING` flag) · window hide-to-tray: `src-tauri/src/window.rs` · `exit_app`: `src-tauri/src/shortcuts.rs`
  · secure storage: `src-tauri/src/secure.rs` · bundle config: `src-tauri/tauri.conf.json`.
- App ↔ brain client: `src/lib/remote/remote-client.ts` · health hook: `src/hooks/useSystemHealth.ts` ·
  Status page: `src/pages/status/index.tsx` · Brain Connection settings: `src/pages/settings/components/BrainConnection.tsx`.
- Action classification (sensitive vs safe): `packages/core/action-policy.ts` · AI response/variable
  validation: `packages/core/functions/ai-response.function.ts` + `common.function.ts`.

## 9. To resume on another machine
1. Clone the repo + `npm install` (root and it covers workspaces).
2. Copy `apps/brain/.env` from this machine (has all secrets incl. the shared `KRISHNA_MASTER_KEY`).
3. Copy `apps/brain/.gmail-token.enc` OR re-run `npm run gmail:auth` (per-device Gmail token; same inbox).
4. `cd apps/brain && npm start` → verify `/health`. Then run the app and set Remote mode.
5. Because the master key + Turso config match, memories sync across devices automatically.
