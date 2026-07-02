# M4 — Phone→laptop command relay — implementation plan

> **For the implementing agent.** Milestone M4 of `ARCHITECTURE_V2_PLAN.md`. Prereqs: M1–M3
> (uses the sync layer, the talk screen, and the worker's push channel). Worktree +
> checkpoints; no push unless asked. Build-loop discipline per task.

## Goal
From the phone: "Krishna, open the tax spreadsheet on my laptop" → the command queues in the
cloud → the **desktop app** (when running) picks it up, runs it through the existing executor
and confirmation gate, writes the result → the phone gets told. Laptop off ⇒ command waits,
with an honest spoken "I'll do it when your laptop is back."

## Security stance (non-negotiable)
- Commands execute **only** through the existing client-side executor
  (`packages/core/executor.ts:21-104`) with its permission gating — remote origin does NOT
  bypass the sensitive-action confirm (`classifyAction`); a sensitive queued command waits
  for desktop-side confirmation (spoken/click) like any local one.
- Command payloads and results are **encrypted with the master key** before they touch
  Turso (unlike reminders, commands can contain file paths/URLs — treat as sensitive).
- TTL: queued commands expire (default 24h) rather than executing surprisingly late.

## Tasks

- [ ] **T1 — Schema.** Migration: `commands(id TEXT PK, source_device TEXT NOT NULL,
  target_device TEXT NOT NULL, payload TEXT NOT NULL /*encrypted action/plan JSON*/,
  status TEXT NOT NULL DEFAULT 'queued' (queued|running|done|error|expired),
  result TEXT /*encrypted*/, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL)`. Add to `SYNC_TABLES` + tombstones + Turso side. Device ids
  come from the existing `devices` table (M3-T1).

- [ ] **T2 — Enqueue from mobile.** New action type `laptop_do` in the block vocabulary
  (`src/lib/actions.ts` + system prompt): payload = the same step/plan shape the executor
  already consumes. On mobile, executing `laptop_do` = encrypt + insert into `commands` +
  `syncNow()` + spoken ack ("Queued for your laptop"). The mobile no-tools policy (M1-T5)
  gets exactly this one allowed action.

- [ ] **T3 — Desktop consumer.** In the desktop startup path (`src/lib/startup.ts`), after
  each sync cycle: select `commands` where `target_device = me AND status='queued' AND
  expires_at > now` → set `running` → decrypt → `executePlan()` (confirm gate intact) →
  write `done`/`error` + encrypted result → `syncNow()`. Expire overdue rows to `expired`.
  Idempotency: claim via conditional UPDATE on `status='queued'` (same pattern as M3-T2).

- [ ] **T4 — Result back to the phone.** Worker (M3) watches `commands` transitions to
  `done|error` and sends a data push `{type:'command', id}` to the source device; the phone
  reads the synced row and speaks/notifies the outcome. No worker ⇒ result still arrives on
  next sync/app-open (graceful).

- [ ] **T5 — Latency + honesty.** Desktop sync interval is 60s (`startup.ts:34`) — that's the
  relay's worst-case pickup. Acceptable for v1; note in code. On enqueue, if the target
  device's `devices.last_seen` is stale (> 10 min), Krishna says the laptop looks offline
  and the command will wait. Optional (only if trivial): worker pushes a `{type:'command'}`
  wake to desktop too — otherwise document 60s as the floor.

- [ ] **T6 — Tests + verification.** Unit: claim idempotency, TTL expiry, encrypt/decrypt
  round-trip of payload/result. Integration (two local DB instances + test Turso): enqueue →
  execute → result visible on source. Security test: a sensitive `laptop_do` (e.g. shell)
  does NOT run without desktop confirmation. `tsc`/`vitest`/`cargo check` green.

## Acceptance
1. Phone: "open youtube on my laptop" → laptop (app running) opens it within ~60s → phone
   speaks "done" (with worker) or reports on next open (without).
2. Laptop asleep: command queues, Krishna says so; on laptop wake it executes once; expired
   commands (>24h) do not execute and the phone is told.
3. Sensitive command waits at the desktop confirm gate; declining marks `error("declined")`
   and the phone hears it.
4. Payload/result are ciphertext in Turso (verify by inspecting the remote rows).
5. Kill the worker: relay still works end-to-end minus the instant result push.

## Out of scope
Laptop→phone commands (device-control track covers phone-side actions); streaming/long-running
command output; multi-laptop targeting UI (single `target_device` default = the one desktop);
LAN/P2P direct path (revisit only if 60s latency hurts in practice).
