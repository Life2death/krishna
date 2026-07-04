# Phase 4 — Gmail + MCP client-side (retire the brain) — build plan

> **For the coding agent.** This executes Phase 4 of `LOCAL_FIRST_ARCHITECTURE_PLAN.md`
> (§Gmail & MCP, lines 61–97 — read that section first; its 2026-06-28 verification of
> what's client-side vs brain-bound still holds, re-verified 2026-07-03). **Start AFTER
> `fix/travel-t4` is approved** — Phase 4a builds directly on its P1 contract.
> Fresh branch off `main`: `feat/local-p4-gmail` (then `feat/local-p4-mcp`). Worktree
> `krishna-m15`; do NOT `git checkout main` itself (held by the reviewer worktree).
> Protocol: one sub-phase per commit `feat(local-p4x)`, tsc + vitest green, findings ledger
> `PHASE4_REVIEW_FINDINGS.md` (reviewer creates it at first review), STOP per sub-phase.

## Reviewer's 2026-07-03 deltas vs the original §Gmail & MCP text
1. **The travel tool is the template.** `packages/core/tools/get-travel-time.ts` +
   `MapsSettings.tsx` + `KNOWN_SAFE` registration is the exact pattern Phase 4a repeats:
   client tool → `tauriFetch`/`fetch` → key/token from `secureStorage` → **spoken formatting
   done in the tool, not by the LLM** → registered in `packages/core/tools/index.ts`.
2. **Depends on `fix/travel-t4` P1:** Gmail search/read results are `kind: "answer"`
   `ExecuteActionResult`s — without the speech-filter fix they'd be silently dropped
   (T4-F4). Do not start 4a before that fix is merged to `main`.
3. **Grounded success claims (T4-F1 lesson):** `gmail_send_email` may only report "sent"
   after the Gmail API returned 200 with a message id. Never let the model narrate success.
4. **OAuth reuse confirmed:** the brain's OAuth client is **installed-app type**
   (`apps/brain/src/gmail/client.ts:15-33` — client_id + client_secret + loopback
   redirect_uris from a keys JSON). The SAME credentials work for a desktop loopback flow
   in Tauri. Scopes stay exactly `gmail.readonly` + `gmail.send`. The owner re-authorizes
   once in-app; the brain's stored token file is NOT migrated (different store, cleaner).
5. **English-only, brevity-first voice output** (owner rules from the travel/M1.5 work).
6. **Build-vs-buy decision to make at 4a kickoff (added 2026-07-04):** Google now publishes
   official MCP servers — github.com/google/mcp — including an open-source **Workspace MCP
   server** (Gmail + Calendar + Docs/Sheets, Apache-2.0, Google-maintained). Alternative
   path: reorder 4b (client-side MCP hub) FIRST, then plug Google's Workspace server in and
   get Gmail + Calendar without hand-porting the 4 tools. Trade-offs vs the 4a hand-port:
   (+) maintained by Google, broader scope (Calendar helps M2 reminders), less code to own;
   (−) runs as a separate resident local process (owner's 2-core laptop), tool schemas
   inflate the prompt (fights M1.5 latency work), raw JSON outputs need LLM summarization
   for speech (weak on Haiku) instead of the travel-tool pattern's deterministic in-code
   spoken formatting, and OAuth setup work is the same either way. Default remains the
   hand-port (tighter voice integration, zero extra processes); revisit with the owner
   before writing 4a code. The Maps MCP server is NOT interesting — travel tool already
   built and speech-tuned.

## Phase 4a — Gmail client-side (owner priority: "Gmail search, local")

**Goal:** the 4 tools — `gmail_search_messages`, `gmail_read_message`, `gmail_list_labels`,
`gmail_send_email` — run entirely in the app (no brain), against the Gmail REST API.

Steps:
1. **OAuth (Tauri loopback):**
   - Settings → new "Gmail" section (copy `MapsSettings.tsx` structure): paste
     `client_id` + `client_secret` (owner supplies from the existing keys JSON) →
     `secureStorage.set("GMAIL_CLIENT_ID"/"GMAIL_CLIENT_SECRET")`, plus a "Connect Gmail"
     button and a connected/not-connected status line.
   - "Connect" flow: build the auth URL (scopes above, `access_type=offline`,
     `prompt=consent`, PKCE), open system browser, capture the code on a loopback
     listener — evaluate `tauri-plugin-oauth` first; hand-rolled tiny Rust listener only
     if the plugin doesn't fit. Exchange for tokens; store the token set as ONE JSON blob
     `secureStorage.set("GMAIL_OAUTH_TOKENS", ...)` (same encrypted store as the Maps key).
   - Refresh handling in the client wrapper: on 401 → refresh via refresh_token → retry
     once → persist rotated tokens. Refresh failure ⇒ status flips to "reconnect needed";
     tools degrade gracefully (Principle 4): "Gmail isn't connected, {honorific} — check
     Settings."
2. **The 4 tools** in `packages/core/tools/gmail.ts`, registered like the travel tool.
   Direct REST via the existing fetch path (no `googleapis` dependency in the app):
   - `users.messages.list` (+ `q=` Gmail query) for search; `users.messages.get`
     (`format=metadata` headers first, `format=full` for read) ; `users.labels.list`;
     `users.messages.send` (RFC 2822 base64url body — port the brain's builder from
     `apps/brain/src/gmail/tools.ts`).
   - Mirror the brain's tool arg/return shapes (read `tools.ts` before writing) so prompt
     examples stay consistent.
3. **Safety classification:** the three READ tools go into `KNOWN_SAFE`
   (`packages/core/action-policy.ts`). `gmail_send_email` does **NOT** — it stays
   `sensitive`, and gets a real confirmation: follow the computer-tools pattern
   (executor comment: "Computer tools handle their own confirmation via
   `getConfirmAction()`") so send works in BOTH single-action and plan paths. The spoken
   confirm must include recipient + subject: "Send this to X with subject Y,
   {honorific}?" This closes the known missing-send-confirm gap
   (`MCP_CONFIRMATION_HANDOFF.md`).
4. **Spoken formatting (in-tool, like travel):** search → count + top sender/subject line
   ("You have 3 from HDFC this week — newest is 'Statement ready', {honorific}"); read →
   sender, subject, then a ≤2-sentence body gist; NEVER read raw URLs, full addresses, or
   whole bodies aloud. Full detail goes in `data` for the UI, not TTS.
5. **Prompt wiring:** GMAIL section in `BASE_SYSTEM_PROMPT` with 2–3 action examples
   ("do I have any mail from X?" → gmail_search_messages) mirroring the travel section.
6. **Tests** (mocked fetch): each tool happy path; 401→refresh→retry; refresh-dead
   degradation line; send blocked without confirmation + send only reports success on 200
   + id; spoken-format brevity; context-level test that a search result is SPOKEN
   (kind:"answer" — the T4-F4 regression class).

## Phase 4b — MCP hub client-side (outline; detailed spec after 4a review)
- Port `McpHub` connect/list/call into the app: stdio servers via the Tauri **shell**
  plugin (local/offline), URL servers via HTTP. Keep `buildMcpBridgeTools()`'s client-side
  `classifyAction` confirm gate; change `run()` from POST `/mcp/execute` to a local call.
- Drop the remote-only guard in `useMcpTools.ts:35-39` so tools load in local mode.
- Config UI for MCP server list (command/URL) — mirror existing Settings patterns.

## Phase 4c — Retire the brain from the laptop
- Remove brain spawn/dependency for Gmail+MCP paths; brain survives only if something
  else still needs it (RAG decision is separate — LOCAL_FIRST plan §open decisions).
- Delete/park `apps/brain/src/gmail/*` usage; keep code until owner confirms mobile/cloud
  won't reuse it.

## Owner prerequisites (before 4a can be live-tested)
1. Locate the Google OAuth keys JSON the brain used (client_id + client_secret,
   "installed" type) and paste both values into the new Gmail Settings section.
2. One-time "Connect Gmail" re-authorization in the app.

## Acceptance (owner, live — after 4a)
1. Brain NOT running. "Do I have any emails from <sender>?" → spoken count + newest
   subject, within normal turn latency.
2. "Read the latest one" → spoken sender/subject/gist (no raw URLs, no monologue).
3. "Reply to it saying I'll call tomorrow" / "send an email to X" → Krishna asks to
   confirm (recipient + subject spoken); yes → sent; DB/log shows sent id; no → nothing
   sent. Krishna never says "sent" on a failed API call.
4. Disconnect network → Gmail queries degrade with the offline/not-connected line; core
   chat unaffected.
5. All suites green; read tools never prompt for confirmation.
