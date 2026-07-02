# M3 — Cloud worker + Android push — implementation plan

> **For the implementing agent.** Milestone M3 of `ARCHITECTURE_V2_PLAN.md`. Prereq: M2.
> Worktree + checkpoints; no push unless asked. Build-loop discipline per task.

## Goal
A tiny always-on cloud service makes proactive Krishna work **even when both apps are
closed**: due reminders/task nudges reach the phone as native push notifications. Hard
constraints (Principles from `LOCAL_FIRST_ARCHITECTURE_PLAN.md` still law):
- **Never in the chat/sync path.** Devices keep syncing straight to Turso. Worker down ⇒
  only pushes pause.
- **v1 worker is dumb:** no Anthropic key, no LLM, no tool execution. It reads schedule
  columns and sends pushes. That's all.

## Architecture
```
Turso (existing)  ←—poll every 60s—  Krishna Worker (Fly.io, ~200 lines Node)
                                        │  due reminder / task nudge
                                        ▼
                                     FCM HTTP v1  →  Android app (data-only message)
                                                       → app reads row locally → posts
                                                         the real notification text
```

## Decisions locked in `ARCHITECTURE_V2_PLAN.md`
- Fresh minimal Node service — **not** a redeploy of `apps/brain`.
- **FCM** (device has Play services). Fallback if FCM proves unworkable: ntfy.sh topic +
  foreground service — do not build both up front.
- **Data-only push**: payload carries row ids only, never content. The app wakes, reads the
  synced local row (pulling if needed), and posts the notification itself. Note: today
  `reminders.text` is plaintext in Turso anyway (see M2 out-of-scope) — data-only keeps us
  clean regardless of how that decision lands.

## Tasks

- [ ] **T1 — Device registration.** Android: add Firebase Messaging via the existing Kotlin
  helper pattern (`google-services.json` stays uncommitted — build secret like the baked
  key). On boot, obtain the FCM token and upsert it into the existing `devices` table
  (`src-tauri/src/db/migrations/devices.sql`) — add columns `push_token TEXT`,
  `push_platform TEXT` via migration, and add `devices` to `SYNC_TABLES`
  (`packages/core/sync/types.ts`) so the worker can read tokens from Turso. Reuse
  `getPlatform()` from M1-T0 for `platform`.

- [ ] **T2 — Fired-state contract for the worker.** Worker must not race the devices (M2-T6
  wrote device-side dedup via `fired_at`). Contract: a reminder is worker-eligible when
  `due_at <= now AND fired_at IS NULL AND status='active' AND enabled=1`, and the worker
  claims it by setting `fired_at` + `notified_by='worker'` in one conditional UPDATE
  (`… WHERE fired_at IS NULL`) so device and worker can't both claim. Add the
  `notified_by TEXT` column in a migration. Document: a device that fired offline wins on
  sync (LWW); worst case one duplicate ping.

- [ ] **T3 — The worker itself.** New top-level `worker/` (own package.json, TypeScript,
  no imports from the app):
  - Config via env: `TURSO_URL`, `TURSO_TOKEN`, `FCM_SERVICE_ACCOUNT_JSON`, `POLL_MS=60000`.
  - Loop: claim eligible reminders (T2 query) → for each, send FCM data message
    `{type:'reminder', id}` to every active device token → advance recurrence the same way
    the app does (daily/weekly, clear `fired_at`) or mark done.
  - Task nudges v1: rows in `tasks` with `due_at <= now AND status='open' AND
    (last_checkin_at IS NULL OR last_checkin_at < now-24h)` → data push `{type:'task', id}`
    + set `last_checkin_at`.
  - `GET /healthz`; structured logs; exponential backoff on Turso/FCM errors; **no other
    endpoints** (nothing inbound but health checks).
  - Unit tests with a mocked Turso client for: claim atomicity, recurrence advance, backoff.

- [ ] **T4 — Receive side (Android).** `FirebaseMessagingService` subclass in the Kotlin
  layer: on data message → if app process alive, emit a Tauri event (talk screen may speak
  it); always → read the row from the local DB (trigger `syncNow()` first with a short
  timeout if the id is unknown) → post the local notification with the decrypted/local text.
  Token refresh → re-upsert into `devices`.

- [ ] **T5 — Deploy + ops.** `worker/fly.toml` (single shared-cpu-1x machine, autostop OFF —
  it must be always-on), secrets via `fly secrets set`. README section in `worker/` with
  deploy/rollback commands. **Do NOT wire the worker into the repo's release pipeline** —
  deploy is manual (`fly deploy` from `worker/`), consistent with the no-auto-release rule.

- [ ] **T6 — Kill-tests + verification.** With the worker **stopped**: chat, sync, device-side
  firing (M2) all unaffected. With the worker running and **both apps closed**: a due
  reminder still lands on the phone. `tsc`/`vitest`/`cargo check` green + worker tests green.

## Acceptance
1. Reminder created on the laptop; laptop shut, phone app closed → push arrives on the phone
   at due time; notification shows the correct text; exactly one notification.
2. Task with a due date, untouched 24h → phone gets a nudge; answering "done" in the talk
   screen closes it (visible on desktop after sync).
3. Worker machine stopped for a day → zero impact on chat/sync/local firing; on restart it
   does NOT replay stale already-fired reminders (claim contract holds).
4. FCM token rotation (reinstall app) → pushes still arrive (devices row updated).
5. No plaintext reminder/task content in FCM payloads (verify via logcat) and no new inbound
   surface on the worker beyond `/healthz`.

## Out of scope
Email watching, daily briefings, LLM-composed nudges (smart worker = later); iOS push;
command relay (M4 — but note the worker's push channel will be reused there).
