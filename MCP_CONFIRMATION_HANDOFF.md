# Agent Handoff — Finish the MCP confirmation loop + Track-A tests

> **For the build agent:** one focused PR. Part 1 completes the P0 security fix that Track A only did
> the server half of; Part 2 adds the unit tests the Track-A DoD required. Read both parts, trace the
> live call path before editing (don't ship unwired code), then run the Verify section.

---

## Context

Track A (commit `d1eb1a5`) hardened the brain: `POST /mcp/execute` now classifies every MCP tool
server-side and **rejects sensitive tools with HTTP 403 unless the request body carries
`confirmed: true`**, then writes an audit entry. See `apps/brain/src/routes/mcp-tools.ts`.

**The problem:** the *client* never sends `confirmed`. The bridge that calls the brain —
`packages/core/tools/mcp-bridge.ts` — posts only `{ tool, args }`. So as of now **every sensitive MCP
tool is blocked end-to-end**: the brain 403s it and the user is never asked to confirm. The server
half of the gate is correct; the client half (ask the user → resend with `confirmed: true`) is
missing. This PR wires it.

Track A also skipped the unit tests its DoD called for (only the import in `src/__tests__/trust.test.ts`
was repointed). Part 2 adds them.

---

## Part 1 — Client confirmation round-trip

**Goal:** when an MCP tool is sensitive, the client asks the user to confirm (reusing the existing
confirmation UI), and only on approval re-calls `/mcp/execute` with `confirmed: true`. On a 403 with
no confirmation, surface the prompt rather than failing silently.

**Trace first (do not assume):**
- `packages/core/tools/mcp-bridge.ts` — `buildMcpBridgeTools()` builds the `mcp_*` Tool wrappers that
  POST `/mcp/execute`. This is where `confirmed` must be added to the body.
- `packages/core/action-policy.ts` — `classifyAction("mcp_"+name)` is the single source of truth for
  safe/sensitive (Track A deduped this; the old `src/config/action-policy.ts` is gone).
- The existing **confirmation flow** for sensitive native actions: grep the orchestrator
  `src/contexts/krishna.context.tsx` and `packages/core/executor.ts` for how sensitive actions are
  currently confirmed (the executor hard-rejects sensitive tools with an error today —
  `executor.ts` ~line 50). Find the UI confirmation component the app already uses (look under
  `src/pages/**` and `src/components/**` for an existing confirm/approve dialog) and reuse it.
- `src/hooks/useMcpTools.ts` — how MCP tools are registered/invoked on the client.

**Implement (shape — adapt to what the trace shows):**
1. In the MCP bridge run path, before/within the POST: if `classifyAction(\`mcp_${name}\`)` is
   `sensitive`, request user confirmation through the existing flow. If approved, POST with
   `{ tool, args, confirmed: true }`; if declined, return a clean `{ success: false, error: "declined" }`.
2. Safe tools: unchanged (no `confirmed`, execute immediately).
3. Defensive: if the brain still returns 403 (`category: "sensitive"`), treat it as "needs confirmation"
   and route into the same prompt rather than throwing — so server and client never disagree.
4. Keep the bridge framework-free (`packages/core` has no React) — if confirmation needs UI, the
   confirmation callback should be injected (same pattern as the http shim `getHttpFetch()`), not
   imported from `src/`.

**Live-wiring proof (required by the project DoD):** show the grep from the orchestrator → bridge →
`/mcp/execute` with `confirmed`, and a negative test: a sensitive tool with the confirmation callback
denying → tool is not executed and no audit "ok" row is written.

---

## Part 2 — Track-A unit tests

Add the tests the Track-A DoD required (run in `packages/core` / client Vitest):

1. **`containsSecrets` is not flaky** (`packages/core/redact.ts`): call `containsSecrets(sameSecret)`
   twice in a row and assert `true` both times (guards the `lastIndex` reset regression).
2. **`classifyAction` verb logic** (`packages/core/action-policy.ts`):
   - safe verbs → `safe`: `mcp_search_issues`, `mcp_github_get_repo`, `mcp_list_files`.
   - destructive denylist wins even with a safe-looking name → `sensitive`:
     `mcp_get_and_delete_repo` (note: `firstVerb` is `get` here, so confirm the **denylist** path with a
     name whose *first* verb is destructive, e.g. `mcp_delete_repo`, `mcp_send_email`, `mcp_exec_shell`).
   - unknown verb → `sensitive` (default-deny): `mcp_frobnicate_thing`.
   - native safe tools still safe: `open`, `web_search`.
3. **MCP gate negative test** (brain, `apps/brain/test/brain.test.ts`, supertest vs Fastify):
   - `POST /mcp/execute` with a sensitive tool and **no** `confirmed` → `403`.
   - with `confirmed: true` → executes (mock the hub) and writes an audit row.

> Note on Part 2.2: `firstVerb` only inspects the **first** segment, so `get_and_delete_repo`
> classifies as safe (`get`). If you want compound-name protection, that's a real gap — either extend
> `classifyAction` to scan *all* segments against the denylist, or document the limitation in the test.
> Flag which choice you made.

---

## Quick polish (fold in if cheap)

- Redact `args` in the MCP audit `summary` (`mcp-tools.ts`) via `redactText` — currently logs raw args
  to the local audit DB.
- Tag-guard the Play-Store upload step in `.github/workflows/android.yml`
  (`if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/') && ...`) so it can't run
  with no AAB on a PR.
- Remove the unused `tokenBytes` const in `apps/brain/src/auth.ts`.

---

## Files likely touched

- `packages/core/tools/mcp-bridge.ts` — send `confirmed`; inject confirmation callback.
- `packages/core/action-policy.ts` — (only if extending denylist to all segments) + tests.
- `src/contexts/krishna.context.tsx` / `src/hooks/useMcpTools.ts` — wire the confirmation callback to
  the existing UI.
- `packages/core/redact.ts` — audit-args redaction (polish).
- `packages/core/__tests__/*` or `src/__tests__/*` — new `containsSecrets` + `classifyAction` tests.
- `apps/brain/test/brain.test.ts` — MCP gate negative test.
- `apps/brain/src/routes/mcp-tools.ts`, `apps/brain/src/auth.ts`, `.github/workflows/android.yml` — polish.

## Verify

- `npm test` (client 192+) and `cd apps/brain && npm test` (brain) — both green, with the new cases.
- Both typechecks clean: root `npm run typecheck` + `cd apps/brain && npm run typecheck`.
- `npm run build` (client production) green.
- **End-to-end:** with a real MCP server connected (e.g. filesystem), invoke a sensitive tool from the
  client → confirmation prompt appears → approve → tool runs and is audited; decline → tool does not run.
  Invoke a safe (`list`/`get`) tool → runs with no prompt.
- **Live-wiring proof:** grep showing `confirmed` flows orchestrator → bridge → route; negative test
  proving denial blocks execution.
