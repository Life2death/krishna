# Brain auto-start / status — follow-up findings for the agent

**Author:** Claude (review). **Date:** 2026-06-25. Context: live-testing the auto-start + status-dashboard
work (commits 52b89ed, 507502b, ea419b1) surfaced these. Three of them Claude already fixed (see below);
three remain for the agent.

## ✅ Already fixed by Claude (this commit)
1. **Exit button did nothing.** `RunEvent::ExitRequested` called `api.prevent_exit()` unconditionally, so
   every Quit (tray "Quit Krishna" and the `exit_app` command) was vetoed and the app never exited.
   Fix: added `pub static QUITTING: AtomicBool` in `src-tauri/src/lib.rs`; both quit paths set it before
   `app.exit(0)` (lib.rs tray handler + `shortcuts::exit_app`), and `ExitRequested` now only calls
   `prevent_exit()` when `!QUITTING`. Window-close→hide-to-tray is unchanged (handled separately in
   `window.rs` `CloseRequested`), so tray behavior is preserved.
2. **`/shutdown` always 401'd → no sync on close.** The Tauri host POSTs `/shutdown` to trigger the
   brain's graceful Turso-sync-then-exit, but auth gated it and the Rust POST sends no token. Fix: exempt
   `/shutdown` in `apps/brain/src/auth.ts` (brain binds 127.0.0.1 only; the endpoint only triggers an
   orderly shutdown, no data access).
3. **Spawn cwd used a `\\?\` verbatim path.** `brain.rs spawn_dev` passed `canonicalize()`'s `\\?\D:\…`
   path as the cwd; cmd.exe can't use verbatim paths as a working directory. Fix: strip the `\\?\` prefix
   before `current_dir`. (Verified live: spawn cwd is now `D:\Learning\krishna\apps\brain`.)

## ⏳ Remaining for the agent

### A. Brain crash-fails to boot when Turso sync is briefly unreachable (HIGH)
Live repro: a transient DNS blip resolving `krishna-life2death.aws-ap-south-1.turso.io` made the brain die
on boot with `sync error: ... dns error: No such host is known (os error 11001)`. With `KRISHNA_SYNC_URL`
set, the embedded-replica client needs the remote primary during init/migrations (migrations are writes),
so any sync/connectivity failure kills the whole boot. This contradicts the design intent
("offline → brain still boots locally, sync resumes later", BRAIN_AUTOSTART_SYNC_PLAN.md acceptance).
**Fix direction:** make boot resilient to sync/connectivity failure — catch the sync/connect error, boot
**local-first** (run migrations against the local replica), log a warning, and retry sync in the
background. The brain must come up and serve `/health` even with no network. Re-check the libSQL
embedded-replica options for an offline/lazy-connect mode, or guard the initial sync in a try/catch and
degrade to local-only for that session.

### B. Gmail health shows a false "expired" (MEDIUM)
`/status` reports `gmail.expired = (token.expiry_date < Date.now())`, but `expiry_date` is the **access
token's ~1h expiry**, which is *routinely* expired and auto-refreshed by googleapis via the refresh token
on the next call. So the dashboard will cry "Gmail token expired" while Gmail works fine. Live `/status`
already showed `expired: true` with Gmail fully functional.
**Fix:** base the Gmail card on **refresh-token presence/validity**, not the access-token expiry. Treat an
expired access token as normal (it auto-refreshes). Only flag an error if the refresh token is missing or a
real Gmail call returns invalid_grant.

### C. Sync card reads "never synced" (LOW)
`/status` showed `sync.lastSyncAt: null, lastSyncOk: false` on a freshly booted brain even though libSQL is
replicating in the background every 60s. Our `sync-status` state is only updated by `syncAndRecord`
(boot/shutdown/force-sync) — libSQL's internal interval syncs don't touch it. So the card looks stale until
the user hits "Force sync".
**Fix:** either call `syncAndRecord` once shortly after boot AND on a timer mirroring `KRISHNA_SYNC_INTERVAL`
(spec Part A.3 option c), so the tracked `lastSyncAt` reflects reality; or relabel the card so "enabled but
not yet recorded" isn't shown as a problem.

## Test status
- Exit fix: `cargo check` clean; live click-test pending.
- `/status` endpoint: verified live — returns brain/db/sync/gmail/rag/ai/mcp/data; **no secrets** (sync host
  only); MCP card now reports real tool count (4). Findings B and C are about *accuracy* of two cards, not
  the endpoint wiring.
- Still deferred from the original plan (unchanged): brain-token generation + secure storage, and the
  first-run setup UI — without these, **bundled mode can't boot** (no `.env` on a clean install).

See [[brain-master-key-custody]], [[gmail-tool-decision]]. Specs: BRAIN_AUTOSTART_SYNC_PLAN.md,
STATUS_DASHBOARD_PLAN.md.
