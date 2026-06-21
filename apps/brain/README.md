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

## Telegram bot

When `TELEGRAM_BOT_TOKEN` is set in `.env`, the brain starts a Telegram bot
that polls for messages. Each Telegram chat gets its own Krishna conversation
(prefix `telegram_<chatId>`), with all content encrypted at rest.

**Commands:**
- `/remember <key> is <value>` — save a memory
- `/memories` — list saved memories
- `/forget <key>` — delete a memory
- `/new` — start a fresh conversation
- `/chat <message>` — explicit chat
- Any text message — implicit chat via Krishna

Bot setup: talk to [@BotFather](https://t.me/BotFather) on Telegram, create a
new bot, paste the token into `TELEGRAM_BOT_TOKEN`.

## Reaching the brain from your phone (Tailscale)

The brain binds `0.0.0.0`. To reach it from Android/iPhone without exposing a port:

1. Install [Tailscale](https://tailscale.com/) on the laptop and both phones; sign in to the same tailnet.
2. Find the laptop's tailnet IP: `tailscale ip -4` (e.g. `100.x.y.z`).
3. Point the mobile client at `http://100.x.y.z:8787` with the same bearer token.

(Cloudflare Tunnel works too if you prefer a hostname.)

## Docker (deploy to any VPS)

```bash
# Build & run locally
docker compose up -d --build

# Or use the VPS deployment profile:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The Docker image runs as a non-root `krishna` user. Mount a volume at `/data/`
for persistent SQLite storage. Configure Turso sync for cloud durability.

### Production deployment (VPS)

1. Provision a VM (minimum: 1 vCPU, 1 GB RAM, 10 GB disk).
2. Install Docker + Docker Compose on the VM.
3. Clone this repo on the VM (or use your CI to deploy the image).
4. Create `apps/brain/.env` with production values:
   ```bash
   KRISHNA_BRAIN_TOKEN=<strong-random-token>
   KRISHNA_MASTER_KEY=<32-byte-hex>
   ANTHROPIC_API_KEY=<your-claude-key>
   KRISHNA_SYNC_URL=libsql://<your-db>.turso.io
   KRISHNA_SYNC_TOKEN=<turso-token>
   ```
5. Start: `docker compose up -d`
6. Verify: `curl http://<vps-ip>:8787/health`

Tailscale is optional for VPS (the service is headless and behind Docker), but
highly recommended as an additional auth layer.

### Daemon mode (PM2, no Docker)

```bash
npm install            # installs pm2
npm run start:pm2      # starts via ecosystem.config.cjs
npm run stop:pm2       # stops
```

PM2 keeps the brain alive across crashes and logs to `~/.pm2/logs/`.

## Tests

```bash
npm test   # field-crypto + memories encryption-boundary + auth
```

## Migrations

On boot the brain applies the **same** `src-tauri/src/db/migrations/*.sql` files
the Tauri app uses, in the same order — skipping the legacy `interview-profiles`
migrations (vestigial from the Naukri Lelo lineage; the brain never touches that
table). All are `CREATE TABLE IF NOT EXISTS`, so boot is idempotent.
