# Phase 5 — Remaining Pillars: Hand-off Brief (Perception, Trust, Proactivity)

The memory pillar (conversational + personal) is done and merged. This brief covers the rest of
`PHASE_5_memory_context.md`. **Build in this order, commit each sub-phase separately, and do not
start the next until the previous is verified.** Read the design doc for rationale; this brief is
the actionable contract.

## Hard rules (apply to every sub-phase — learned from Phase 3/4/5 reviews)
1. **Wire it into the live flow.** Every new module/hook/command must be *called* from
   `src/contexts/krishna.context.tsx` (or the executor), not just exported. Dead-but-exported
   code has shipped 3× already — don't.
2. **Extract core logic into pure, testable functions** (e.g. `src/lib/<x>.ts`), import them into
   the context, and **add tests** — test count must rise per sub-phase. Don't bury logic as
   private functions in the context (that's why memory/skills went untested initially).
3. **New migration = next free version (v10, v11…), never reuse/renumber. `.sql` MUST be LF**
   (`.gitattributes`). Migration columns ↔ TS DTO ↔ INSERT/SELECT must match field-for-field.
4. **`invoke` arg keys + return types must match the Rust signature exactly.**
5. **Persist/act only after confirmation** for anything the user must approve; sensitive actions
   are gated (see 5.3).
6. **Done = a real `npm run tauri dev` run demonstrates it on Windows**, plus `tsc --noEmit`
   clean (ignore the pre-existing `AutoSpeechVad` error) and `npm run test` green with new tests.

---

## 5.3a — Perception ("look at my screen")  [do FIRST — smallest, reuses existing capture]

**Goal:** "Hey Krishna, what's on my screen / what's this error / summarize this" → Krishna
captures the screen, describes it aloud.

- The capture plumbing already exists: Rust `capture_to_base64` (used by interview mode) and
  `fetchAIResponse` accepts `imagesBase64`. Reuse both — no new Rust.
- New `src/lib/perception.ts`: `isLookCommand(command: string): boolean` (pure; matches
  "what's on (my) screen", "what is this", "read the screen", "summarize this", "what app…").
  Add `src/__tests__/perception.test.ts`.
- In `krishna.context.tsx` `processCommand`, after wake-word + provider check and BEFORE the
  normal LLM turn: if `isLookCommand(command)` → `const img = await invoke<string>("capture_to_base64")`
  → `fetchAIResponse({ …, userMessage: command, imagesBase64: [img] })` with a vision prompt
  ("Describe what's on the user's screen and answer their question.") → speak the reply.
- **Verify (`tauri dev`):** open a webpage with an error, "Hey Krishna, what's this error?" →
  Krishna describes it.

**Commit:** `Phase 5.3a: Perception — look-at-screen intent over existing capture`

---

## 5.3b — Trust layer (audit log + permission tiers + undo)  [do SECOND — gates everything below]

**Goal:** every action is logged and inspectable; sensitive actions need explicit confirm; the
last reversible action can be undone.

**Migration v10 — `audit_log.sql` (LF):**
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,   -- "open" | "skill" | "memory_write" | "reminder" | "look"
  summary TEXT NOT NULL,
  result TEXT NOT NULL,        -- "ok" | "failed" | "cancelled"
  reversible INTEGER NOT NULL DEFAULT 0,
  undo_payload TEXT,           -- JSON: how to reverse (e.g. {"kind":"memory","id":"…"})
  created_at INTEGER NOT NULL
);
```
- Data layer `src/lib/database/audit.action.ts` + `useAudit` hook (CRUD + `getLastReversible`).
- **Central logging:** append an audit row at the single choke points where actions complete —
  `executeAction` / `executePlan` results, `createMemory`, reminder firing. Memory writes and
  reminder creation are `reversible: 1` with an `undo_payload`; "open"/"look" are not.
- **Permission tiers:** new `src/config/action-policy.ts` →
  `classifyAction(action): "safe" | "sensitive"` (pure + tested). Safe = open app/url/file,
  look. Sensitive = anything that deletes/moves files, runs a shell command, or sends a message
  (forward-looking for future tools/skills). In the executor, **before running a `sensitive`
  step, force a confirm turn** (reuse the existing 15s confirmation flow).
- **"Undo that":** `src/lib/perception.ts`-style pure `isUndoCommand(command)`; on match, read
  `getLastReversible()` and reverse via `undo_payload` (memory → `deleteMemory(id)`; reminder →
  cancel). For non-reversible last actions, Krishna says so. Add tests for `classifyAction`,
  `isUndoCommand`, and the undo dispatch.
- **Settings:** audit-log list (recent actions + result) with a clear-all, in `KrishnaSettings.tsx`.
- **Verify:** "remember that my city is Pune" → "undo that" → memory removed, audit shows the
  trail; a sensitive action prompts a confirm.

**Commit:** `Phase 5.3b: Trust — audit log (v10), permission tiers, undo`

---

## 5.3c — Proactivity (reminders + routines)  [do LAST — most new infra; logs to audit]

**Goal:** "remind me in 10 minutes to stretch" / "every morning open my dashboards" → Krishna
speaks reminders when due and can run a saved skill on a schedule.

**Migration v11 — `reminders.sql` (LF):**
```sql
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  recurrence TEXT,             -- null | "daily" | "weekly"
  skill_id INTEGER,           -- optional: a routine that runs a Phase-4 skill
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
```
- Data layer `src/lib/database/reminders.action.ts` + `useReminders` hook.
- Pure `parseReminderCommand(command)` in `src/lib/reminders.ts` →
  `{ text, dueAt, recurrence? } | null` (handle "in N minutes/hours", "at HH:MM", "tomorrow",
  "every morning/day"). **Tested** — this parser is the headline logic, cover it well.
- **Scheduler:** a `setInterval` (~30s) in `KrishnaProvider` that queries due+enabled reminders →
  speaks the text via `ttsRef` (respect the speaking mutex / barge-in) → if `recurrence`, reschedule
  `due_at`; else disable. If `skill_id` is set, run that skill's plan via the executor (routine).
  Log each firing to the audit log.
- "remind me…" intent → `parseReminderCommand` → confirm → `createReminder` (persist after yes).
- **Settings:** reminders list with cancel/toggle.
- **Verify:** "Hey Krishna, remind me in 1 minute to stretch" → ~1 min later Krishna says it;
  a recurring one re-fires; a routine with a skill runs the plan.

**Commit:** `Phase 5.3c: Proactivity — reminders (v11) + routines + scheduler`

---

## Final acceptance (all three)
- Migrations v10, v11 present, LF, registered in `db/main.rs` (after v9), schema↔DTO aligned.
- `npm run test` green with **new tests** for perception, action-policy, undo, reminder-parsing
  (test count must increase notably).
- `tsc --noEmit` clean (except the known VAD error).
- A real `tauri dev` pass demonstrating: look-at-screen, undo a memory, a sensitive-action
  confirm, and a reminder firing.
- No dead/unwired modules — every new hook/lib is called from the live flow.
