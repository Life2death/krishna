# Plan — in-house, read-only + send Gmail tool for the brain

**Decision (2026-06-25):** Do **not** use the third-party `@gongrzhe/server-gmail-autoauth-mcp`.
Build a **read-only + send** Gmail integration inside `apps/brain`. No delete, no modify.
Coding is done by the implementing agent; this file is the spec.

## Why in-house (vs the third-party MCP)
- Third-party default grants `gmail.modify` + send/delete; `npx -y` runs floating "latest" each boot
  (supply-chain risk); refresh token stored in plaintext at `~/.gmail-mcp/credentials.json`.
- In-house gives us: scope locked to `gmail.readonly` + `gmail.send` (no delete/modify), our own
  pinned code, and the refresh token **encrypted at rest** with the brain's existing AES-256-GCM
  field-crypto.

## Design principle — reuse the existing MCP pipeline
The desktop discovers tools via `GET /mcp/tools` (→ `McpHub.getAllTools()`) and runs them via
`POST /mcp/execute` (→ `McpHub.callTool()`), with `classifyAction()` gating + audit logging.
**Serve the Gmail tools through `McpHub` as "built-in" tools** so every existing layer works unchanged:
- `apps/brain/src/routes/mcp-tools.ts` — no change
- `packages/core/tools/mcp-bridge.ts`, `src/hooks/useMcpTools.ts` — no change
- desktop app — **no change at all**

## Tools to expose (read-only + send)
Verb naming matters: `classifyAction` (packages/core/action-policy.ts) treats `search/list/get/read`
as **safe** → no confirmation prompt. That's acceptable here (read-only can't mutate).
> Open choice for Vikram: if you DO want a confirm prompt before Krishna reads inbox content,
> name one tool with a non-safe verb (or add it to the policy). Default in this plan = no prompt.

1. `gmail_search_messages` — args `{ query: string, maxResults?: number=10 }`.
   Uses Gmail `users.messages.list` (q = Gmail search syntax). Returns array of
   `{ id, threadId, from, subject, date, snippet }` (fetch headers via `format=metadata`).
2. `gmail_read_message` — args `{ id: string }`.
   Uses `users.messages.get` (`format=full`). Returns `{ from, to, subject, date, body, attachments[] }`
   where `body` is the decoded text/plain part (fallback: stripped text/html) and `attachments`
   is **names + sizes only** (no download).
3. `gmail_list_labels` — no args (optional, low value; include only if cheap).
4. `gmail_send_email` — args `{ to: string, subject: string, body: string, cc?: string, bcc?: string }`.
   Constucts a plain-text RFC 2822 MIME message and sends via `users.messages.send`.
   `classifyAction` treats `send` as **sensitive** → user confirmation prompt shown before sending.

Each tool result is a `ToolResult` (`{ success, output, data? }`) — `output` should be a concise
human-readable string (the desktop shows it); put structured data in `data`.

## Access + auth
- Lib: official **`googleapis`** + `google-auth-library`. Scopes: `https://www.googleapis.com/auth/gmail.readonly` + `https://www.googleapis.com/auth/gmail.send`.
- **Google Cloud step (Vikram does this):** create/pick project → enable **Gmail API** →
  OAuth consent screen = External, add `vikram.panmand@gmail.com` as **test user** →
  Credentials → OAuth client ID → **Desktop app** → download JSON.
  Save it at a path referenced by `KRISHNA_GMAIL_OAUTH_KEYS_PATH` (e.g.
   `C:\Users\vikra\.krishna\gmail-oauth-keys.json`). **Request read-only + send scope.**
- **One-time auth bootstrap script** `npm run gmail:auth` (`apps/brain/src/gmail/auth-cli.ts`):
  loopback OAuth (temp localhost callback server) → user consents → exchange code →
  **encrypt the refresh token** with `makeFieldCrypto(loadMasterKey())` → write to token file.
  Prints "Gmail authorized (read-only)". Idempotent: re-running re-authorizes.

## Token at rest
- Store encrypted token JSON at `KRISHNA_GMAIL_TOKEN_PATH`
  (default `apps/brain/.gmail-token.enc`), value = `fieldCrypto.encrypt(JSON.stringify(tokens))`.
- Add the token file to `apps/brain/.gitignore`.
- (Alternative: a one-row DB kv — DB+crypto already wired. Enc file is simpler; either is fine.)

## Files for the implementing agent
**New**
- `apps/brain/src/gmail/token-store.ts` — load/save encrypted token via FieldCrypto.
- `apps/brain/src/gmail/client.ts` — build authorized `gmail_v1.Gmail` (OAuth2 client +
  auto-refresh; persist refreshed tokens back through token-store).
- `apps/brain/src/gmail/tools.ts` — the read-only tool descriptors (`McpToolInfo`-shaped) + executors;
  export a provider `{ tools: McpToolInfo[]; call(name, args): Promise<ToolResult> }`.
- `apps/brain/src/gmail/auth-cli.ts` — the `gmail:auth` bootstrap.

**Edit**
- `apps/brain/src/mcp/hub.ts` — add built-in provider support:
  `registerBuiltin(provider)`; `getAllTools()` appends builtin tools; `callTool()` routes to the
  builtin provider when the name matches (no idle-timeout for builtins). Keep `serverName: "gmail"`.
- `apps/brain/src/index.ts` — on boot, if a Gmail token file exists, register the Gmail provider:
  `mcpHub.registerBuiltin(gmailProvider)` and log `[gmail] read-only tools registered`.
  If no token, skip silently (with a one-line hint to run `npm run gmail:auth`).
- `apps/brain/package.json` — add `googleapis` dep; add `"gmail:auth": "tsx src/gmail/auth-cli.ts"`.
- `apps/brain/.env.example` (+ `.env`) — add `KRISHNA_GMAIL_OAUTH_KEYS_PATH`, `KRISHNA_GMAIL_TOKEN_PATH`.
- `apps/brain/.gitignore` — add `.gmail-token.enc`.

## Acceptance test
1. Vikram completes the Google Cloud step + `npm run gmail:auth` → "Gmail authorized (read-only + send)".
2. Restart brain (`npm start`) → log shows `[gmail] Read-only + send tools registered (4 tools)`.
3. `GET /mcp/tools` (with bearer token) lists `gmail_search_messages`, `gmail_read_message`,
   `gmail_list_labels`, `gmail_send_email`.
4. Desktop in **remote** mode: "Hey Krishna, read my latest emails" → calls `gmail_search_messages`
   then `gmail_read_message`, returns inbox content.
5. "Hey Krishna, send an email to vikram@example.com saying Hello from Krishna" →
   `gmail_send_email` is classified **sensitive** — user sees a confirmation prompt → on confirm,
   the email is sent and returns success.
6. Confirm the token file is encrypted (starts with `enc:v1:`) and gitignored.

## Out of scope (explicit)
Drafting, deleting, modifying, labels-write, attachment download. Not now, no plan to add.
