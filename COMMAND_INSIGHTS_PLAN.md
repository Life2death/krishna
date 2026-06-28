# Plan — Command Insights: capture answered + failed commands and surface them in the dashboard

> **For the implementing agent.** Today Krishna saves successful Q&A turns but **silently drops
> failures** — STT errors, missing-provider bailouts, plan/skill failures, and declined actions all
> vanish into `console.error`. This feature records the **outcome of every interaction** (answered /
> failed / declined) with a machine-readable failure reason, then surfaces the failures in the
> dashboard so the user can see patterns and derive fixes/learnings.

## Why now (grounded in current code)

- `recordTurn(userText, assistantText)` (`src/contexts/krishna.context.tsx:364`) persists turns to the
  `conversations`/`messages` tables — but stores **no success/failure status**. Worse, on plan/skill
  failure it writes the error string **as the assistant reply** (`:1180-1181`), so a failure looks
  identical to a real answer.
- Failures that never reach `recordTurn`:
  - **STT transcription failure** — `KrishnaVAD.onSpeechEnd` catch → `console.error` only.
  - **No AI provider / provider not found** — `processCommand` `setLastError(...)` + early return (`:1097`, `:1106`). Shown once in the dashboard's transient `lastError` banner, never persisted.
  - **Wake word not detected** — early return (`:1080`).
  - **AI fetch error / declined confirmations** — various early returns, unlogged.
- The `audit_log` table tracks **actions** (open_target, mcp_*, computer_*), not command **outcomes**.
- The dashboard (`src/pages/dashboard/index.tsx`) lists conversations by date + a transient error
  banner. No aggregation, no failure view.

## What we're building

1. A new `command_log` table + core DB action.
2. One instrumentation helper called at every terminal point in `processCommand` / `KrishnaVAD`.
3. A dashboard **Insights** section: outcome stats + grouped failures + actionable hints.

---

## Step 1 — New table `command_log`

**Client migration** — add `src-tauri/src/db/migrations/command-log.sql`:
```sql
CREATE TABLE IF NOT EXISTS command_log (
  id TEXT PRIMARY KEY,
  transcript TEXT NOT NULL,          -- what the user said/typed (REDACTED before insert)
  outcome TEXT NOT NULL,             -- 'answered' | 'failed' | 'declined' | 'ignored'
  failure_reason TEXT,               -- see codes below; NULL when answered
  detail TEXT,                       -- error/context detail (REDACTED), nullable
  response TEXT,                     -- assistant reply if any (REDACTED, truncated), nullable
  source TEXT NOT NULL DEFAULT 'voice', -- 'voice' | 'text' | 'mobile'
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_command_log_outcome ON command_log(outcome);
CREATE INDEX IF NOT EXISTS idx_command_log_created ON command_log(created_at);
```

Register it in `src-tauri/src/db/main.rs` as **version 12** (next free number — 11 is the last):
```rust
Migration {
    version: 12,
    description: "create_command_log_table",
    sql: include_str!("migrations/command-log.sql"),
    kind: MigrationKind::Up,
},
```

> The brain mirrors client migrations in `apps/brain/src/db/migrations.ts`. **v1 is client-only**
> (voice/text on desktop). Add the same `command-log.sql` to the brain's migration list ONLY if you
> also instrument the Telegram/remote path (see Step 4, optional). Otherwise leave the brain alone.

**Failure reason codes** (keep this exact set — the dashboard maps them to hints):
`stt_failed`, `no_stt_provider`, `no_ai_provider`, `ai_error`, `plan_failed`, `tool_failed`,
`wake_word_missed`, `user_declined`, `unknown`.

---

## Step 2 — Core DB action `packages/core/database/command-log.action.ts`

Mirror the shape of `audit.action.ts`. **Redact** free-text through `redactText` before insert (the
transcript may contain secrets — the project already redacts for audit/telegram).

```ts
import { getDatabase } from "./driver";
import { redactText } from "../redact";

export type CommandOutcome = "answered" | "failed" | "declined" | "ignored";
export type FailureReason =
  | "stt_failed" | "no_stt_provider" | "no_ai_provider" | "ai_error"
  | "plan_failed" | "tool_failed" | "wake_word_missed" | "user_declined" | "unknown";

export interface CommandLogEntry {
  id: string;
  transcript: string;
  outcome: CommandOutcome;
  failureReason?: FailureReason | null;
  detail?: string | null;
  response?: string | null;
  source?: "voice" | "text" | "mobile";
  createdAt: number;
}

const redact = (s?: string | null) => (s ? redactText(s).text : null);

export async function logCommand(e: CommandLogEntry): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO command_log (id, transcript, outcome, failure_reason, detail, response, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.id,
      redact(e.transcript) ?? "",
      e.outcome,
      e.failureReason ?? null,
      redact(e.detail),
      e.response ? redact(e.response)!.slice(0, 500) : null,
      e.source ?? "voice",
      e.createdAt,
    ]
  );
}

export interface CommandStats {
  total: number;
  answered: number;
  failed: number;
  declined: number;
  byReason: { reason: FailureReason; count: number }[];
}

export async function getCommandStats(): Promise<CommandStats> { /* SELECT COUNT(*) GROUP BY outcome, and GROUP BY failure_reason WHERE outcome='failed' */ }

export async function getRecentCommands(opts?: { outcome?: CommandOutcome; limit?: number }): Promise<CommandLogEntry[]> { /* SELECT * ... ORDER BY created_at DESC LIMIT ? */ }

export async function deleteAllCommandLog(): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM command_log");
}
```
Export these from `packages/core/database/index.ts` (and re-export through `@/lib/database` if that's
how the client imports DB actions — check how `createAuditEntry` is imported in `krishna.context.tsx`
and follow the same path). Add a `@krishna/core/database` deep-path alias to `vite.config.ts` only if a
**new** import path is introduced — reuse the existing `@krishna/core/database` alias if present.

---

## Step 3 — Instrument the terminal points

Add **one helper** near `recordTurn` in `krishna.context.tsx`:
```ts
const logOutcome = (
  transcript: string,
  outcome: CommandOutcome,
  failureReason?: FailureReason,
  detail?: string,
  response?: string,
  source: "voice" | "text" | "mobile" = "voice",
) => {
  logCommand({ id: crypto.randomUUID(), transcript, outcome, failureReason, detail, response, source, createdAt: Date.now() })
    .catch((err) => console.error("Failed to log command outcome:", err));
};
```

Call it at each exit. Use the precompaction line numbers as a guide (they shift after edits — match on
surrounding code, not the number):

| Where | Outcome to log |
|---|---|
| Success paths that already call `recordTurn` (`:1028`, `:1170`, and the main AI-answer success) | `logOutcome(userText, "answered", undefined, undefined, reply)` — alongside `recordTurn` |
| `no_ai_provider` early return (`:1097`) | `logOutcome(command, "failed", "no_ai_provider", errMsg)` |
| provider-not-found return (`:1106`) | `logOutcome(command, "failed", "ai_error", errMsg)` |
| AI fetch `catch` (the network/LLM error handler) | `logOutcome(command, "failed", "ai_error", String(err))` |
| Plan/skill `result.success === false` (`:1180`) | `logOutcome(userText, "failed", "plan_failed", result.error)` |
| Wake-word-not-detected return (`:1080`) | `logOutcome(transcription, "ignored", "wake_word_missed")` — **gate behind a setting**, this can be noisy |
| Confirmation declined ("answer === no", `:1039`) | `logOutcome(pending.input ?? "", "declined", "user_declined")` |

**STT failure** is in `KrishnaVAD.tsx` (`onSpeechEnd` catch), not the context. Two options:
- Simplest: import `logCommand` directly in `KrishnaVAD.tsx` and log `outcome:"failed", failureReason:"stt_failed"` with the empty/failed transcript in that catch block.
- Also log `no_stt_provider` where `providerConfig` is missing (`if (!providerConfig) return;`).

Keep it lightweight — these are fire-and-forget `.catch()` inserts; never block the voice flow on a
logging failure.

---

## Step 4 (optional) — Brain / remote + Telegram parity

If you want failures from remote mode and Telegram captured too: add `command-log.sql` to the brain's
migration list and call an equivalent insert in `apps/brain/src/telegram/handlers.ts` and the
resume/chat routes on error. **Defer unless asked** — desktop voice/text is the primary surface and
where the user saw the gap.

---

## Step 5 — Dashboard "Insights" surface

Extend `src/pages/dashboard/index.tsx` (or add a sibling route `/insights` + nav entry; prefer a
section on the existing dashboard for v1). Add above the conversation list:

1. **Stat cards** (use the existing `Card`/`Badge` components): Total commands · Answered % ·
   Failed · Top failure reason. Pull from `getCommandStats()`.
2. **Failures list** — grouped by `failure_reason`, newest first: each row shows the (redacted)
   transcript, the reason as a human label, detail, and timestamp (`moment`). Reuse the red-banner
   styling already in the dashboard for visual consistency.
3. **Actionable hints** — map each reason to a fix (this is the "derive learnings" part, v1):
   - `no_ai_provider` / `no_stt_provider` → CTA button "Open Settings → Brain/Speech" (navigate).
   - `stt_failed` (repeated) → hint "Check your microphone / STT provider key."
   - `plan_failed` / `tool_failed` (same transcript repeating) → surface "Krishna keeps failing on:
     '<transcript>'" so the user can rephrase or report.
   - `wake_word_missed` (frequent) → hint "Consider disabling wake word or changing it."
4. **Clear** button → `deleteAllCommandLog()` (mirror the existing "Clear all" for conversations).

A `useCommandInsights()` hook (mirror `useHistory`) that loads stats + recent failures and exposes a
`refresh()` keeps the page component clean.

> **Stretch (note as follow-up, don't build now):** a "Summarize failures" button that feeds the
> grouped failing transcripts to the AI for a plain-English diagnosis + suggested fixes. The data
> model above already supports it.

---

## Privacy & safety

- **Always redact** transcript/detail/response via `redactText` before insert (Step 2 does this).
- Truncate stored `response` (≤500 chars) — it's for triage, not full history.
- This is **local SQLite only** (client DB). Nothing is sent anywhere. Do not add network calls.
- Don't log secrets even in `detail` — pass error messages through `redactText` too.

## Verify

1. Migration runs: launch `npm run tauri dev`, confirm `command_log` table is created (no migration
   error in the Rust log).
2. **Answered path:** ask a normal question → one `command_log` row with `outcome='answered'`.
3. **Failure paths:** with no AI provider set, give a command → row with
   `outcome='failed', failure_reason='no_ai_provider'`. Force an STT error (e.g., no STT key) →
   `stt_failed` row. Decline a confirmation → `declined` row.
4. **Dashboard:** the Insights section shows correct counts, the failure list groups by reason, and
   the provider-missing hint links to Settings.
5. Transcripts containing a fake secret (e.g. "my key is sk-abc123…") are stored **redacted**.
6. `npm run typecheck` + `npm run build` green; `npm test` green.

## Out of scope
- Brain/Telegram parity (Step 4) unless requested.
- AI-summarized learnings (stretch).
- Editing/replaying past commands.
- Any change to the encryption salt / keychain keys (see `REBRAND_CLEANUP_HANDOFF.md`).
