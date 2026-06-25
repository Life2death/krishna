# Status / Health dashboard — implementation spec

**Audience:** the coding agent. **Author:** Claude (review-not-fix: Claude plans & reviews, agent implements).
**Date:** 2026-06-25. **Owner:** Vikram.

## Goal
Add a **System Health** section to the existing **Status** page so Vikram can see, at a glance, whether each
part of Krishna is working — especially **whether Turso data-sync is happening** — plus other live checks.
Each check shows a clear state (OK / Warning / Error) with a one-line detail and a timestamp.

## Current state (verified facts)
- The Status page already exists: [src/pages/status/index.tsx](src/pages/status/index.tsx) — title "Status",
  renders **command insights** via the `useCommandInsights` hook, using `PageLayout`, `Badge`, `Empty`,
  `Button` from `@/components`, `lucide-react` icons, `moment` for times. **Keep that section; ADD health
  below it** (e.g. a "System Health" block above or below command insights).
- The app talks to the brain only in **remote mode** (`readBrainConfig()` →
  [remote-client.ts](src/lib/remote/remote-client.ts); `remoteGet`/`remotePost` helpers exist). Health data
  comes FROM the brain, so the health section is a remote fetch.
- Brain endpoints today: `GET /health` (basic `{ok,ts,clients}`, [index.ts:78](apps/brain/src/index.ts)),
  `GET /rag/status` (`{ready, embeddings}`, [rag.ts:54](apps/brain/src/routes/rag.ts)),
  `GET /mcp/tools` (tool list). No consolidated status endpoint yet.
- Sync: enabled via `KRISHNA_SYNC_URL`/`TOKEN`/`INTERVAL`; driver branches in
  [libsql-driver.ts](apps/brain/src/db/libsql-driver.ts). The libSQL client does NOT expose last-sync state
  today — the brain must track it (see Part A.3).

---

## Part A — Brain: a consolidated `GET /status` endpoint
Add `apps/brain/src/routes/status.ts` (registered in index.ts) returning a single JSON snapshot the app can
render. Auth-protected like other routes. Shape (illustrative):

```jsonc
{
  "brain":   { "ok": true, "version": "1.0.0", "uptimeSec": 1234, "startedAt": 178..., "clients": 0 },
  "db":      { "ok": true, "path": "./krishna-brain.db" },
  "sync": {
    "enabled": true,                       // KRISHNA_SYNC_URL present
    "host": "krishna-life2death.aws-ap-south-1.turso.io",  // host only, NEVER the token
    "intervalSec": 60,
    "lastSyncAt": 178...,                   // ms; null if never
    "lastSyncOk": true,
    "lastError": null,                      // string message if last sync failed
    "reachable": true                       // optional live ping to Turso (see A.3)
  },
  "gmail":   { "configured": true, "tools": 4, "tokenPresent": true, "expiryDate": 178..., "expired": false },
  "rag":     { "enabled": true, "ready": true, "embeddings": 0, "modelLoaded": true },
  "ai":      { "provider": "anthropic", "keyConfigured": true, "model": "claude-sonnet-4-6" },
  "mcp":     { "servers": 0, "tools": 4 },  // built-in gmail counts as tools
  "data":    { "memories": 0, "conversations": 0, "reminders": 0, "learnedActions": 0, "skills": 0 }
}
```
Rules:
- **Never** include secrets (no token, no API key, no master key). Sync `host` only, derived from the URL.
- Each section is independently try/caught so one failure doesn't 500 the whole endpoint — failing sections
  report `ok:false` + a short reason instead.

### A.3 — Sync tracking (new brain code, the important bit)
The libSQL client auto-syncs on `intervalSec`, but nothing records success/failure. Add a tiny sync-status
module:
- Expose `sync()` from the driver (wrap `client.sync()`); on success set `lastSyncAt = Date.now()`,
  `lastSyncOk = true`, `lastError = null`; on throw set `lastSyncOk = false`, `lastError = msg`.
- Call this wrapped `sync()` (a) once shortly after boot, (b) on the brain `shutdown()` handler (the "push
  on close" safety — also in BRAIN_AUTOSTART_SYNC_PLAN.md), and optionally (c) on a timer mirroring the
  interval so `/status` has fresh truth even though libSQL's internal interval sync is opaque.
- `reachable` (optional): a cheap `SELECT 1` against the remote (or rely on `lastSyncOk`). Keep it bounded
  (short timeout) so `/status` stays fast.
- If `KRISHNA_SYNC_URL` is unset → `sync.enabled = false`, and the app renders sync as "Local only (not
  synced)" — a neutral state, not an error.

---

## Part B — App: "System Health" section on the Status page
- New hook `useSystemHealth` (sibling of `useCommandInsights`): on mount + every ~15s (and a manual
  Refresh button), if `brainMode === "remote"`, `remoteGet("/status")`; store result + `lastCheckedAt` +
  request error. If `brainMode === "local"`, show a single neutral card: "Connect to the brain (Remote
  mode) to see system health" with a link to Settings → Brain Connection.
- Render a grid of **health cards**, one per check (below). Each card: icon + label + **state badge** +
  one-line detail + relative timestamp (`moment(...).fromNow()`), reusing the existing `Badge` and the
  `STATUS_BADGE` color convention already in the file (green/amber/red).
- Top-of-section **overall pill**: green if all OK, amber if any warning, red if any error or brain
  unreachable.
- Reuse `PageLayout`, existing components; match the command-insights styling. No new design system.

### The health checks (build these)
| Check | OK when | Warning when | Error when |
|---|---|---|---|
| **Brain** | `/status` responds | — | request fails / times out (brain down) |
| **Cloud sync (Turso)** | enabled & `lastSyncOk` & recent | enabled but `lastSyncAt` stale (> 3× interval) or not synced yet | enabled & `lastError` set / unreachable |
| **— (sync disabled)** | — | show neutral "Local only" (not an error) | — |
| **Gmail** | configured & token present & not expired | configured but token expiring soon (e.g. < 24h) | configured but token expired/missing → suggest `gmail:auth` |
| **RAG** | enabled & ready & modelLoaded | enabled but not ready yet (indexing) | enabled & init failed |
| **AI provider** | `keyConfigured` true | — | key missing → chat won't work |
| **MCP tools** | servers/built-in tools > 0 | 0 tools | — |
| **Data** (counts) | always OK (informational: memories/conversations/…) | — | — |

Each card's detail line should be human, e.g.:
- Sync OK → "Synced 12s ago · krishna-life2death…turso.io · every 60s"
- Sync stale → "Last sync 6m ago — checking connection"
- Gmail expired → "Token expired — re-run gmail:auth on this device"
- Sync disabled → "Local only — not syncing to cloud"

### Nice-to-have buttons (optional, if cheap)
- **Refresh** (re-fetch `/status`) — include.
- **Force sync now** → `POST /status/sync` (calls the wrapped `sync()`), then re-fetch. Good for "is sync
  working?" reassurance. Include if low effort.

---

## Acceptance criteria
- In Remote mode, the Status page shows a System Health section with live cards; pulling the brain down
  flips the Brain card (and overall pill) to red within one refresh cycle.
- With sync ON and healthy, the Cloud-sync card shows OK + "synced Ns ago" + the Turso host (never the
  token). Stopping network / breaking the token flips it to error with the message.
- With `KRISHNA_SYNC_URL` unset, the sync card shows the neutral "Local only" state, not an error.
- Gmail card reflects real token state (present/expired); RAG card reflects ready/embeddings; AI card
  reflects key presence.
- No secret (token/API key/master key) ever appears in `/status` output or the UI.
- Local mode shows the neutral "connect to brain" card instead of erroring.

## Out of scope / notes
- No historical charts/graphs — point-in-time snapshot + relative timestamps only.
- Don't remove or restyle the existing command-insights section; this is additive.
- Keep `/status` cheap (bounded timeouts) — it's polled every ~15s.

## References
- [[project-krishna-overview]], [[brain-master-key-custody]] (sync is live + shared-key rule),
  [[gmail-tool-decision]] (Gmail live). Related spec: BRAIN_AUTOSTART_SYNC_PLAN.md (auto-start + the
  shutdown-sync hook this dashboard surfaces).
