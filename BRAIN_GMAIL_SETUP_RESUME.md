# Brain + Gmail MCP setup — resume here

Goal: let Krishna access Gmail via an MCP server hosted by the **brain** (`apps/brain`). MCP tools
only load when the desktop app is in **remote brain mode**.

## ✅ Phase 1 — DONE: brain runs locally
- Start the brain with **`npm start`** from `apps/brain` (= `tsx src/index.ts`).
  **Do NOT use `npm run dev`** — `tsx watch` hangs on Node v26 (no log, never listens). Plain `tsx` works.
- Listens on `http://localhost:8787`. Health check (needs the token):
  `curl -H "Authorization: Bearer <KRISHNA_BRAIN_TOKEN>" http://localhost:8787/health` → `{"ok":true}`.
- `apps/brain/.env` is **gitignored** (holds secrets — never commit it). Currently set:
  `KRISHNA_BRAIN_TOKEN` (boot token), `KRISHNA_MASTER_KEY` (64-hex, set to bypass the OS keyring),
  `KRISHNA_RAG_DISABLED=true` (faster boot), `ANTHROPIC_API_KEY` (set — remote mode routes the
  desktop's AI through the brain's `/chat`, so this is required).
- NOTE: the brain was started as a background process this session — after a reboot, re-run
  `npm start` in `apps/brain`.

## ⏳ Phase 2 — TODO: Gmail MCP + Google OAuth (user does the Google parts)
Using `@gongrzhe/server-gmail-autoauth-mcp` (third-party Gmail MCP with built-in OAuth — it will
hold an OAuth token to the inbox; authorize knowingly).
1. **Google Cloud** (console.cloud.google.com): create/pick a project → enable **Gmail API** →
   **OAuth consent screen** = External, add your Gmail as a **test user** → **Credentials → OAuth
   client ID → Desktop app → download JSON**.
2. Put the JSON at `C:\Users\vikra\.gmail-mcp\gcp-oauth.keys.json` (create the folder).
3. Run `npx @gongrzhe/server-gmail-autoauth-mcp auth` → browser OAuth → saves
   `~\.gmail-mcp\credentials.json` ("Authentication successful").
4. Add the server to `apps/brain/.env` (one line):
   `KRISHNA_MCP_SERVERS=[{"name":"gmail","transport":"stdio","command":"npx","args":["-y","@gongrzhe/server-gmail-autoauth-mcp"]}]`
5. Restart the brain (`npm start`) → expect log `[mcp] Connected to 1 MCP server(s), N tools total`.

## ⏳ Phase 3 — TODO: connect the desktop app
- App Settings → **Brain Connection** → Mode **Remote**, URL `http://localhost:8787`, paste the
  `KRISHNA_BRAIN_TOKEN` → **Save → Test Connection**.
- The app then fetches MCP tools (`useMcpTools.ts`, remote mode only). Test:
  *"Hey Krishna, read my latest emails"* → routes to the Gmail MCP tool → asks a confirmation
  (`mcp_tool` flow) → reads the inbox.

## Caveat to weigh
Remote mode sends ALL desktop AI through the brain's `/chat` (Claude). If the brain has no
`ANTHROPIC_API_KEY` or is down, chat breaks. To go back to local AI, switch Brain Connection back
to **Local**.
