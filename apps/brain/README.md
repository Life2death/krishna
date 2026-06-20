# Krishna Brain

Headless Node service — the single source of truth for the Krishna ecosystem.
It owns the database (memory, skills, learned-actions, reminders, chat history),
encrypts sensitive fields at rest, and serves CRUD + streaming chat to thin
Krishna clients (laptop / Android / iPhone) over an authenticated API.

Reuses `@krishna/core` verbatim — the same `*.action.ts` data layer the Tauri
app runs, wired to a **libSQL** driver instead of Tauri's `plugin-sql`.

## Quick start

```bash
# from repo root
npm install

cd apps/brain
cp .env.example .env
# generate a bearer token:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste it into KRISHNA_BRAIN_TOKEN in .env, and (optionally) ANTHROPIC_API_KEY

npm run dev    # or: npm start
```

Health check: `curl http://127.0.0.1:8787/health`

## Configuration (`.env`)

| Var | Purpose |
|---|---|
| `KRISHNA_BRAIN_PORT` | Listen port (default 8787) |
| `KRISHNA_BRAIN_TOKEN` | **Required.** Bearer token every client must send |
| `KRISHNA_DB_PATH` | Local libSQL/SQLite file (default `./krishna-brain.db`) |
| `KRISHNA_SYNC_URL` / `KRISHNA_SYNC_TOKEN` | Optional Turso cloud sync (embedded replica) |
| `KRISHNA_MASTER_KEY` | Optional. Leave blank to use the OS keyring (recommended); else 32-byte hex/base64 |
| `ANTHROPIC_API_KEY` | Needed for `/chat`; held server-side, never sent to clients |
| `KRISHNA_CLAUDE_MODEL` | Chat model (default `claude-sonnet-4-6`) |

## Security model

- **Field encryption at rest (AES-256-GCM).** Sensitive columns — `memories.value`
  and chat `messages.content` — are encrypted in the brain before insert and
  decrypted on read. The DB only ever stores `enc:v1:…` ciphertext for them, so a
  cloud DB (Turso) is zero-knowledge for those fields. Ids/keys/timestamps stay
  plaintext so they remain queryable.
- **Key custody.** The 256-bit master key lives in the OS keyring (Windows
  Credential Vault / macOS Keychain / libsecret), generated on first run. It is
  never written to disk in plaintext. `KRISHNA_MASTER_KEY` is a headless/CI fallback.
- **Auth.** Every HTTP request needs `Authorization: Bearer <token>`; the WebSocket
  carries `?token=`. Only `/health` is public.

## API

- `GET /health`
- `GET|POST|DELETE /memories`, `/memories/:id`
- `GET|POST|DELETE /skills`, `/skills/:id`, `POST /skills/:id/use`
- `GET|POST|DELETE /learned-actions`, `/learned-actions/:id`
- `GET|POST|PUT|DELETE /reminders`, `/reminders/:id`, `GET /reminders/due`
- `GET|POST|PUT|DELETE /system-prompts`, `/system-prompts/:id`
- `GET|POST|DELETE /conversations`, `/conversations/:id`, `/conversations/recent`, `POST /conversations/:id/messages`
- `POST /chat` → Server-Sent Events stream (`data: {"delta": "..."}` … `data: [DONE]`)
- `GET /ws?token=…` → WebSocket push: `{domain, op, row}` on every mutation

## Reaching the brain from your phone (Tailscale)

The brain binds `0.0.0.0`. To reach it from Android/iPhone without exposing a port:

1. Install [Tailscale](https://tailscale.com/) on the laptop and both phones; sign in to the same tailnet.
2. Find the laptop's tailnet IP: `tailscale ip -4` (e.g. `100.x.y.z`).
3. Point the mobile client at `http://100.x.y.z:8787` with the same bearer token.

(Cloudflare Tunnel works too if you prefer a hostname.)

## Tests

```bash
npm test   # field-crypto + memories encryption-boundary + auth
```

## Migrations

On boot the brain applies the **same** `src-tauri/src/db/migrations/*.sql` files
the Tauri app uses, in the same order — skipping the legacy `interview-profiles`
migrations (vestigial from the Naukri Lelo lineage; the brain never touches that
table). All are `CREATE TABLE IF NOT EXISTS`, so boot is idempotent.
