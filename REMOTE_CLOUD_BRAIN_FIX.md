# Fix-spec — Remote architecture: deploy the brain as a public cloud service so the phone (and any client) can reach it

> **For the implementing agent.** Goal: make `brainMode: "remote"` work from a phone over the internet by deploying `apps/brain` to a public host (Railway) and pointing the app's `brainUrl` at it. The brain is already container-ready (Dockerfile, prod compose, Turso sync, non-root user, healthcheck). This is *enable + harden + deploy + configure the client* — not a rewrite. Verify each diff against the current files (line numbers drift).

## Architecture recap (so the changes make sense)
- Client picks `local` vs `remote` repo at runtime (`src/lib/repo-selector.ts`); default is **desktop→local, mobile→remote** (`src/lib/remote/remote-client.ts:31`).
- `remote` repo (`src/lib/remote/remote-chat.ts`, `remote-client.ts`) calls `{brainUrl}/chat` and other REST routes with `Authorization: Bearer <brainToken>` using **plain `fetch`** (browser network stack — subject to webview CSP, *not* the Tauri http allowlist).
- The brain (`apps/brain`) is a Fastify server: holds the Anthropic key server-side (`config.anthropicApiKey`), bearer-auth on all routes except `/health`,`/ws`,`/shutdown`, streams `/chat` as SSE.

## Root cause it can't work remotely today
`apps/brain/src/index.ts:166` → `await app.listen({ port: config.port, host: "127.0.0.1" })`. Loopback-only bind ⇒ no external client (phone, LAN, or internet) can ever connect. The whole security model (`apps/brain/src/auth.ts:5-11`, CORS `*` in `index.ts`) is built on this loopback assumption, so opening the bind **requires the hardening below**.

---

## Part 1 — Brain code edits

### 1a. Configurable bind host (the load-bearing change)
`apps/brain/src/config.ts` — add to the `config` object (near `port`):
```ts
host: optional("KRISHNA_BRAIN_HOST", "127.0.0.1"),
```
`apps/brain/src/index.ts:166`:
```ts
// before
await app.listen({ port: config.port, host: "127.0.0.1" });
// after
await app.listen({ port: config.port, host: config.host });
```
Default stays `127.0.0.1` (desktop unchanged & safe); cloud sets `KRISHNA_BRAIN_HOST=0.0.0.0`.

### 1b. Close the public `/shutdown` kill-switch
Today `/shutdown` is unauthenticated (`auth.ts:18` exempts it) so the Tauri host can POST it for a graceful sync-and-exit. On a public bind, anyone could kill the brain. **Only register the HTTP `/shutdown` route when bound to loopback** — on cloud, the platform's `SIGTERM` already triggers the same graceful `shutdown()` (the `process.on("SIGTERM", shutdown)` handler already exists). In `index.ts`, wrap the route:
```ts
if (config.host === "127.0.0.1" || config.host === "localhost") {
  app.post("/shutdown", async () => { /* unchanged body */ });
}
```
(Leaving the `auth.ts` exemption as-is is then fine — in cloud the route doesn't exist; on desktop it's loopback-only.)

### 1c. (Optional) Honor `$PORT`
Only needed if you let Railway pick the port. Two choices — pick ONE:
- **Simplest (no code change):** keep the brain on 8787 and set Railway's *target port* to 8787. The Dockerfile `EXPOSE 8787` + healthcheck (`curl localhost:8787/health`) stay valid.
- **Honor `$PORT`:** `config.ts` → `port: Number(process.env.PORT || optional("KRISHNA_BRAIN_PORT", "8787"))`, **and** update the Dockerfile healthcheck to use `$PORT` (else the hardcoded `:8787` healthcheck fails). Prefer the simplest option unless Railway forces a dynamic port.

---

## Part 2 — Client edit (so the webview is allowed to reach the cloud brain)
The remote path uses plain `fetch`, so the brain host must be in the webview **CSP `connect-src`**. Edit BOTH `csp` and `devCsp` in `src-tauri/tauri.conf.json:46` — add your deployed origin to the `connect-src` list (next to `https://api.anthropic.com`):
```
... https://api.anthropic.com https://YOUR-APP.up.railway.app ...
```
Use the exact Railway origin (or a custom domain). Do **not** use a bare wildcard if avoidable. Also add the same host to the Android capability being created in `ANDROID_ACL_PERMISSIONS_FIX.md` if that capability constrains network, and to the `http:` scope in `capabilities/*.json` only if any remote call routes through `tauriFetch` (the chat path does not — it's plain `fetch` — so CSP is the one that matters).

No code change needed in `remote-chat.ts`/`remote-client.ts` — they already send the bearer token and read `brainUrl` from config.

---

## Part 3 — Railway deployment
Build from `apps/brain/Dockerfile` with **build context = repo root** (it copies `packages/core` + `apps/brain`).

**Env vars (Railway service → Variables):**
| Var | Value |
|---|---|
| `KRISHNA_BRAIN_HOST` | `0.0.0.0` |
| `KRISHNA_BRAIN_TOKEN` | strong secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | your key |
| `KRISHNA_CLAUDE_MODEL` | `claude-sonnet-4-6` (valid, current) |
| `KRISHNA_MASTER_KEY` | see caveat below — decide before first boot |
| `KRISHNA_SYNC_URL` | **Turso DB URL** (`turso db show krishna --url`) — durability layer (decided) |
| `KRISHNA_SYNC_TOKEN` | `turso db tokens create krishna` |
| `KRISHNA_SYNC_INTERVAL` | `60` |
| `KRISHNA_DB_PATH` | `/tmp/krishna-brain.db` (just the local embedded-replica cache; rehydrates from Turso on boot) |
| `KRISHNA_RAG_DISABLED` | `false` (or `true` to skip the WavLM/embeddings load) |

**Persistence = Turso (decided).** With `KRISHNA_SYNC_URL`/`KRISHNA_SYNC_TOKEN` set, the local SQLite file becomes an **embedded replica** that syncs to Turso, so the **container can be stateless — no volume needed**, and redeploys/host-switches don't lose data. `KRISHNA_DB_PATH` can point at ephemeral storage (`/tmp`). **Verify the brain performs an initial sync (pull) from Turso on boot** before serving — confirm `/status` shows the expected memory count after a cold start; if the embedded replica only syncs on the `KRISHNA_SYNC_INTERVAL` timer, ensure a sync runs at startup (check `syncAndRecord`/connect path in the brain's DB init).

**Host:** Railway (`railway up`) or Fly (`flyctl deploy`, Dockerfile-native, `bom`/Mumbai region for lowest IST latency) — both deploy from local with **no git push** (protects the auto-release pipeline). Confirm the service's public target port = the brain's port (8787 unless you took the `$PORT` option). Since data is in Turso, switching hosts later requires no migration.

**Verify after deploy:**
```bash
curl -s https://YOUR-APP.up.railway.app/health           # {"ok":true,...}  (public)
curl -s -H "Authorization: Bearer <TOKEN>" https://YOUR-APP.up.railway.app/status   # authed JSON
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"userMessage":"say hi in 3 words"}' https://YOUR-APP.up.railway.app/chat      # SSE deltas
curl -s -X POST https://YOUR-APP.up.railway.app/shutdown  # MUST be 404 now (route not registered in cloud)
```

---

## Part 4 — Phone (and desktop) client config
In the app Settings (writes `krishna_brain_config` in localStorage):
- `brainMode = remote` (already the mobile default)
- `brainUrl = https://YOUR-APP.up.railway.app`
- `brainToken = <the KRISHNA_BRAIN_TOKEN>`

Rebuild/reinstall the Android app **after** the CSP edit (CSP is baked at build time). Then trigger a command and confirm a Claude reply streams in.

> Note: `remoteHealth()` checks the public `/health`, which does **not** validate the token — so a green "connected" indicator does not prove the token is right. Consider switching the connection test to an authed route (e.g. `/status`) so a bad token surfaces immediately. (Nice-to-have, not blocking.)

---

## Security hardening checklist (public exposure raises the stakes)
- [ ] Strong random `KRISHNA_BRAIN_TOKEN`; never commit it; rotate if leaked.
- [ ] `/shutdown` not reachable publicly (Part 1b) — verify the 404 above.
- [ ] Consider a rate-limit (`@fastify/rate-limit`) on `/chat` and auth failures.
- [ ] CORS is `*` but cookieless + bearer-only, so no credential leak; acceptable. Optionally tighten to the app origin.
- [ ] HTTPS is provided by Railway's edge — never point the phone at plain `http://`.
- [ ] The brain holds Anthropic key + master key + Gmail tokens + full memory DB — treat the host as sensitive.

## ⚠️ Master-key decision (do this BEFORE first cloud boot)
Encrypted rows are bound to `KRISHNA_MASTER_KEY` (see memory `brain-master-key-custody`). Pick one:
- **Fresh cloud datastore** (recommended if starting clean): generate a new `KRISHNA_MASTER_KEY`, accept that the cloud brain starts with empty memory, optionally re-seed.
- **Carry over existing data:** export the exact master key the current (desktop keyring) data was encrypted under and set it as `KRISHNA_MASTER_KEY` in Railway, plus migrate/sync the DB (Turso or copy the SQLite file into the `/data` volume). A mismatched key ⇒ unreadable rows.

## Open questions for the user
1. **Host:** Railway (familiar, CLI in use) or Fly (`bom`/Mumbai region → lower IST phone→brain latency)? Either works; Turso makes the host stateless so this is reversible.
2. **Data:** fresh cloud memory, or migrate existing encrypted rows? Either way the **same `KRISHNA_MASTER_KEY`** must be used wherever the data was encrypted (see caveat) — to carry over existing Turso/desktop data, set the cloud `KRISHNA_MASTER_KEY` to the exact key that encrypted it.

**Decided:** durability = **Turso** (embedded-replica sync; no host volume).

See memory `android-device-control-phase1-status`, `brain-master-key-custody`, `no-push-release-pipeline`, and `review-not-fix-workflow`.
