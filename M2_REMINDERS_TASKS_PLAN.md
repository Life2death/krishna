# M2 — Reminders & tasks end-to-end — implementation plan

> **For the implementing agent.** Milestone M2 of `ARCHITECTURE_V2_PLAN.md`. Prereq: M1
> (`M1_MOBILE_IMPLEMENTATION_PLAN.md`) merged. Worktree + checkpoints; no push unless asked.
> Build-loop discipline per task: implement → `/review` → test → fix → check the box.

## Goal
Krishna can take "remind me…" and "I need to / track this task…" on **either device**, the
rows sync, and due items **fire as real OS notifications** on whichever device is awake —
including with the app closed on Android. Task/goal check-ins ("did you finish X?") become
part of conversation context. No cloud worker yet (that's M3); cross-device push for a
device that hasn't synced arrives in M3.

## What already exists — reuse, don't rebuild
| Asset | Where | State |
|---|---|---|
| `reminders` table (synced) | `src-tauri/src/db/migrations/reminders.sql` + in `SYNC_TABLES` (`packages/core/sync/types.ts:1-5`) | Works; plaintext `text`, `due_at`, `recurrence`, `enabled` |
| Voice parsing ("remind me in/at/every…") | `packages/core/reminders.ts:7-93` (+ tests `src/__tests__/reminders.test.ts`) | Works, English regex, 7 patterns |
| LLM action path with confirmation | `src/contexts/krishna.context.tsx:659,1013` (pending `reminderData` confirm flow) | Works |
| In-app scheduler (30s poll → TTS + recurrence + audit) | `src/contexts/krishna.context.tsx:577-620` | Works, **foreground-only, speaks only** |
| CRUD repo + hook + settings UI | `packages/core/database/reminders.action.ts`, `src/hooks/useReminders.ts`, `KrishnaSettings.tsx:358` | Works |

## Gaps M2 closes
1. **No `tasks` (commitments/goals) concept at all** — only one-shot/recurring reminders.
2. **Firing = TTS while app is foreground.** Nothing if the app is closed/backgrounded;
   no OS notification; on the M1 talk screen there's no firing surface at all yet.
3. **Cross-device double-fire:** both devices poll the same synced rows; within the ~60s sync
   lag both could fire the same reminder. No fired-state tracking.

## Tasks

- [ ] **T1 — Schema v2.** New migration:
  - `reminders`: add `fired_at INTEGER`, `status TEXT NOT NULL DEFAULT 'active'`
    (`active|done|cancelled`) — keep `enabled` working for back-compat.
  - New `tasks` table: `id TEXT PK, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL
    DEFAULT 'open' (open|done|dropped), due_at INTEGER NULL, last_checkin_at INTEGER,
    source_conversation_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL`.
  - Add `tasks` to `SYNC_TABLES` (`packages/core/sync/types.ts`) + tombstone support; mirror
    the schema on the Turso side the same way existing synced tables are provisioned.
  - Follow `normalize-updated-at.sql` conventions (epoch-ms INTEGER — see commit `a62a4c5`).

- [ ] **T2 — Task capture in conversation.** Extend the action-block vocabulary
  (`src/lib/actions.ts` + the system prompt that teaches block syntax): `add_task`,
  `complete_task`, `list_tasks`. Krishna creates a task when the owner commits to something
  ("I need to renew my passport"); confirmation-gated like reminders. Repo layer:
  `packages/core/database/tasks.action.ts` modeled on `reminders.action.ts`, exposed via
  `getRepo().tasks`.

- [ ] **T3 — Tasks in conversation context.** In the M1 memory-injection section
  (`ai-response.function.ts`, added in M1-T4), append an "Open commitments" block: open
  tasks (+ overdue ones flagged), capped ~1,000 chars. This is what makes Krishna naturally
  say "you still haven't renewed your passport" — v1 check-ins are context-driven, not a
  separate scheduler.

- [ ] **T4 — OS notifications on fire.** Add `@tauri-apps/plugin-notification` (+ capability
  entries incl. `src-tauri/capabilities/mobile.json`). In the scheduler
  (`krishna.context.tsx:577`), fire = OS notification **and** TTS when the app is in
  foreground; notification alone otherwise. Ask notification permission on first reminder
  creation, not at boot.

- [ ] **T5 — Fire with the app closed (Android).** On every reminder create/update/sync-pull,
  (re)schedule the nearest N due reminders as **scheduled local notifications** (the
  notification plugin supports scheduled delivery on mobile; if it proves unreliable on this
  device, fall back to an `AlarmManager` helper via the existing JNI pattern). On fire or
  cancel, clear the scheduled entry. Desktop keeps the polling scheduler.

- [ ] **T6 — Double-fire protection.** Before firing, set `fired_at = now` + `syncNow()`
  best-effort; skip any reminder whose `fired_at` is already set (LWW makes the earlier
  writer win). Accept the residual race within one sync interval — single user, worst case
  is one duplicate ping; document it. Recompute recurrence off `fired_at` (clear `fired_at`
  when advancing `due_at`) so daily/weekly reminders keep working.

- [ ] **T7 — Talk-screen surfaces (mobile).** Due reminder while the talk screen is open →
  Krishna speaks it (reuse desktop behavior). "What are my reminders/tasks?" works via the
  new `list_tasks` / existing reminder repo. No new UI pages — conversation only.

- [ ] **T8 — Tests + verification.** Unit: task actions parse/execute, fired-at dedup,
  recurrence-after-fire, context-cap. Integration: create-on-desktop → fires-on-mobile
  (after sync) and vice versa. `tsc` + `vitest` + `cargo check` (both targets) green.

## Acceptance
1. "Remind me at 7 to call mom" on the **phone** → reminder appears in desktop settings after
   a sync cycle; at 7 the notification fires on the device(s) that are awake — once.
2. Say "I need to submit the tax form this week" → Krishna confirms → task exists; days later
   on the **laptop**, asking "what's pending?" surfaces it; "done" closes it everywhere.
3. Phone: app fully closed, reminder due → local notification appears on time.
4. Recurring "every morning" reminder fires daily, doesn't duplicate, advances correctly.
5. Airplane mode: creating reminders/tasks works; firing works (local rows); sync catches up.

## Out of scope
Cloud worker, FCM push, firing on a device that never synced the row (M3); command relay
(M4); natural-language task-nudging schedules beyond context-driven check-ins; encrypting
reminder/task text (today's `reminders.text` is plaintext — revisit alongside M3 §privacy).
