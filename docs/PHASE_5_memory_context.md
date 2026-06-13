# Krishna — Phase 5: Memory, Context & Trust (design + plan)

## Context

Phases 1–4 made Krishna **act**: talk, open things, learn new targets, run multi-step task
plans. Nothing yet makes Krishna **know** — not you, not the conversation, not the screen.
Concretely, `src/contexts/krishna.context.tsx` passes `history: []` to `fetchAIResponse` on
every turn, so Krishna is amnesiac between sentences: you can't say "open it again", "no, the
other one", or "remind me to do that later". That missing pillar is what separates a voice
command-runner from an assistant.

Phase 5 adds the **knowing** layer, in priority order:
1. **Memory & Context** (headline) — conversational + personal long-term memory.
2. **Perception** — let Krishna see the screen on demand (the capture plumbing already exists).
3. **Proactivity & scheduling** — reminders and routines; reactive → ambient.
4. **Trust layer** (cross-cutting) — audit log, undo, disambiguation, permission tiers. As
   Krishna gains memory + proactivity + integrations, the blast radius grows; this keeps it safe.

**Builds on:** Phase 3's confirmation flow and learned-store, Phase 4's skills registry and
tool/executor model. Same data infrastructure (`tauri-plugin-sql`, SQLite).

> **Discipline (carried from the Phase 3/4 reviews — non-negotiable):**
> - Each new table = a **NEW migration version** (do not reuse/renumber; Phase 3 = v7, Phase 4
>   added more — use the next free numbers). Migration `.sql` files **MUST be LF** (`.gitattributes`).
> - **One source of truth** for each table: migration columns ↔ TS DTO ↔ INSERT/SELECT must
>   match field-for-field (Phase 3 broke on `phrase` vs `display_name`).
> - Every `invoke("cmd", args)` arg key + return type must match the Rust signature exactly.
> - **Tests assert the real contract** (real Rust struct shapes; in-memory sqlite for migrations).
> - **Persist only after confirmation** for anything the user must approve.
> - **Verification gate:** done = demonstrated in a real `npm run tauri dev` run on Windows.

---

## 1. Memory & Context (headline)

### 1a. Conversational memory (short-term) — cheap, immediate
- Keep a rolling buffer of the last **N turns** (default 6–8) per active session in the context
  (a `useRef<ChatMessage[]>`), and pass it as `history` to `fetchAIResponse` instead of `[]`.
- Reset on a long idle gap or explicit "new conversation". Optionally persist the current
  session to the existing `conversations`/`messages` tables so it survives a restart.
- **Payoff:** follow-ups and pronouns work ("open it again", "close that one", "the second one").

### 1b. Personal long-term memory — makes Krishna *yours*
- New `memories` table (durable facts): "my work folder is `D:\…`", "I prefer Edge", "standup
  is 9:30". **Explicit + confirmed only** for the MVP — Krishna writes a memory when you say
  "remember that …" and reads it back to confirm. (Implicit LLM-extracted memory is deferred —
  it's the same "LLM proposes, user confirms" rule; don't auto-write silently.)
- **Retrieval:** memories are few, so load them all and inject a compact block into the system
  prompt each turn (RAG-lite; upgrade to keyword/recency filtering only if the list grows).
  This makes Phase 3 resolution and Phase 4 skills personalized (e.g. default browser = Edge).

```sql
-- migration vN (next free number after Phase 4)
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT,                       -- optional short label, e.g. "work_folder"
  value TEXT NOT NULL,            -- the fact, as spoken/normalized
  source TEXT NOT NULL,           -- "explicit" | "extracted"
  confirmed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
```

**Files:** new `src-tauri/src/db/migrations/memories.sql` (+ register vN in `db/main.rs`),
`src/types/memory.ts`, `src/lib/database/memories.action.ts`, `src/hooks/useMemories.ts`.
Wire injection + "remember that …" intent into `krishna.context.tsx`.

## 2. Perception — Krishna sees the screen (high value, low new infra)

The screenshot plumbing already exists (`capture_to_base64`, `start_screen_capture` in Rust;
used by interview mode), and providers accept `imagesBase64`. Add a **`look` intent**:
- Triggers: "what's on my screen", "what's this error", "summarize this", "what app is focused".
- Flow: `invoke("capture_to_base64")` → pass as `imagesBase64` to `fetchAIResponse` with a
  vision-friendly prompt → speak the answer. No new capture code; just routing.
- Extend the action/intent layer (`src/lib/actions.ts` / the Phase 4 tool registry) with a
  `look` tool so a task plan can also *see* mid-plan ("read the code on screen, then …").

**Files:** add `look` to the intent/tool layer; small prompt additions. Reuses existing
`capture_to_base64` and the `imagesBase64` path in `fetchAIResponse`.

## 3. Proactivity & scheduling — reactive → ambient

- New `reminders` table: `text`, `due_at`, optional `recurrence` (cron-ish or "daily"/"weekly").
- A lightweight scheduler: a Rust background task (or a frontend interval in the always-on
  overlay) checks for due reminders and emits an event → Krishna **speaks** the reminder
  (reuse TTS) and surfaces it in the overlay/tray.
- **Routines** = a saved Phase-4 skill + a schedule ("every morning open my dashboards"):
  store a `skill_id` + schedule and let the scheduler trigger the executor.
- Hang the UI on the existing **tray + global-shortcut** infrastructure.

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  recurrence TEXT,                -- null | "daily" | "weekly" | cron
  skill_id TEXT,                  -- optional: a routine that runs a Phase-4 skill
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
```

**Files:** `memories`-style data layer + `src/hooks/useReminders.ts`; Rust
`src-tauri/src/scheduler.rs` (`set_reminder`, `list_reminders`, `cancel_reminder` + the tick
loop emitting a `reminder-due` event); listener in `krishna.context.tsx`.

## 4. Trust layer (cross-cutting — build alongside, not after)

As capability grows, so does blast radius. This is the CTO-grade safety track.

- **Audit log** — `audit_log` table: every action (open / skill run / memory write / reminder)
  with timestamp, summary, result, and whether it was reversible. Viewable + clearable in
  settings, like the learned-actions list.
- **"Undo that"** — reverses the *last reversible* action. Be honest about scope: undo is
  meaningful for state changes (delete a just-written memory, cancel a just-set reminder, move a
  file back) — **not** for "open app" (you can offer "close it" instead). Drive undo off the
  audit log's `reversible` + an `undo_payload`.
- **Disambiguation** — when the resolver/skill match has multiple plausible candidates, ask
  "did you mean Chrome or Chromium?" (extends Phase 3's yes/no confirmation to an N-choice
  pick; reuse the 15s timeout).
- **Permission tiers** — classify actions: **safe** (open app/url) runs freely; **sensitive**
  (delete/move files, send a message, run a shell command) **always** requires an explicit
  confirm turn, even for a learned/confirmed skill. A small policy map in
  `src/config/action-policy.ts`; enforce in the executor before any sensitive tool runs.

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,      -- "open" | "skill" | "memory_write" | "reminder" | ...
  summary TEXT NOT NULL,
  result TEXT NOT NULL,           -- "ok" | "failed" | "cancelled"
  reversible INTEGER DEFAULT 0,
  undo_payload TEXT,              -- JSON describing how to reverse, if reversible
  created_at INTEGER NOT NULL
);
```

---

## Implementation order (build the headline first)
1. **1a conversational memory** — smallest change, biggest immediate feel ( stop passing `[]` ).
2. **1b personal memory** — `memories` table + "remember that…" + system-prompt injection.
3. **2 perception** — `look` intent over existing capture.
4. **4 trust layer** — `audit_log` + permission tiers (land *with* the above, not after, so
   memory writes and sensitive actions are logged/gated from day one).
5. **3 proactivity** — reminders + routines (most new infra; do last).

## Files summary
**New:** `memories.sql`, `reminders.sql`, `audit-log.sql` migrations (next free versions, LF);
`src/types/{memory,reminder,audit}.ts`; `src/lib/database/{memories,reminders,audit}.action.ts`;
`src/hooks/{useMemories,useReminders}.ts`; `src-tauri/src/scheduler.rs`;
`src/config/action-policy.ts`.
**Modify:** `src/contexts/krishna.context.tsx` (history buffer, memory injection, remember/look
intents, reminder-due listener, undo, sensitive-action gate), `src/lib/actions.ts` /
Phase-4 tool registry (`look` tool, policy enforcement), `src-tauri/src/db/main.rs` (register
migrations), `src-tauri/src/lib.rs` (register scheduler commands),
`KrishnaSettings.tsx` (memories list, reminders list, audit log — each with a Forget/clear control).

## Verification (end-to-end, real `tauri dev`)
1. "Hey Krishna, open Chrome." … "open it again." → second works via conversational history.
2. "Hey Krishna, remember that my work folder is D:\Projects." → confirms + persists. Later:
   "open my work folder" → uses the memory.
3. "Hey Krishna, what's on my screen?" → captures + describes the active screen.
4. "Hey Krishna, remind me in 1 minute to stretch." → ~1 min later Krishna speaks the reminder.
5. A sensitive action (e.g. "delete …") forces an explicit confirm even if learned.
6. "Hey Krishna, undo that" after a memory write removes it; audit log shows the trail.
7. `npm run test` + `tsc --noEmit` green (including contract + in-memory-sqlite migration tests).

## Deferred (not Phase 5)
- Cloud/natural TTS (the `TTSProvider` interface already supports it — a swap, not a phase).
- Deep service integrations (calendar/email/Slack/Spotify) — these are Phase-4 *skills*, grown
  incrementally.
- Implicit/auto-extracted memory (only after explicit memory + audit are trusted).
- Fully-local/offline brain (whisper.cpp + Ollama + local TTS) — a privacy-first detour.
