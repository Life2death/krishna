# Agent Handoff — Fix chat-persistence bugs (duplicate React keys + FK constraint failure)

> **For the implementing agent.** Two related bugs surfaced during live `npm run tauri dev` testing.
> Both stem from the **same root cause: `Date.now()` is being used as an identity value** (React keys
> and SQLite primary keys). One is a cosmetic warning; the other (`FOREIGN KEY constraint failed`)
> means **conversation turns are silently not being saved** — real data loss. Neither is caused by the
> recent orb/presence UI work; they are pre-existing.

## Symptoms observed

```
[console.error] Encountered two children with the same key, `1782032765780`. Keys should be unique…
[console.error] Failed to persist turn to SQLite: error returned from database: (code: 787) FOREIGN KEY constraint failed
```

`1782032765780` is a 13-digit millisecond timestamp — i.e. a `Date.now()` value being used as a key.

---

## Root causes (all in `src/contexts/krishna.context.tsx`)

### A. Duplicate React keys — `id: String(Date.now())` used as identity

1. **Rehydration loop (PRIMARY source — fires at boot)** — `src/contexts/krishna.context.tsx:489`:
   ```ts
   currentTurn = { id: String(Date.now()), userText: msg.content, assistantText: "", timestamp: msg.timestamp };
   ```
   This runs inside a `for (const msg of recent.messages)` loop. Many iterations complete within the
   same millisecond, so multiple turns get the **same id**. Both render sites key off `turn.id`
   (`src/components/KrishnaChat.tsx:200` and `src/pages/app/components/completion/Input.tsx:133`),
   so the duplicate id → duplicate React key warning.

2. **Live turn creation (secondary source)** — `src/contexts/krishna.context.tsx:368`:
   ```ts
   const turn: ConversationTurn = { id: String(now), userText, assistantText, timestamp: now };
   ```
   Two turns created in the same millisecond collide the same way.

### B. `FOREIGN KEY constraint failed` (code 787) — turns not saved

`src/contexts/krishna.context.tsx:364-393` (`recordTurn`):
```ts
const now = Date.now();
…
if (!activeConversationRef.current || idle > IDLE_THRESHOLD) {
  const conv = await createConversation({ id: String(now), … });   // line 378 — timestamp as PRIMARY KEY
  activeConversationRef.current = conv.id;
}
await appendMessages(activeConversationRef.current, [ …user…, …assistant… ]);   // line 386
```

Two independent failure paths, both rooted in the timestamp id:
- **PK collision:** `createConversation({ id: String(now) })` uses the timestamp as the
  `conversations` primary key. If `String(now)` already exists (two conversations created in the same
  ms, or a re-run), the INSERT throws a PRIMARY KEY violation.
- **Dangling FK:** `appendMessages(conversationId, …)` (in
  `packages/core/database/chat-history.action.ts:408`) inserts into `messages` referencing
  `conversation_id` **without first checking the parent row exists**. If `activeConversationRef.current`
  points at a conversation id whose row was never committed (e.g. a prior `createConversation` threw and
  was swallowed by the `catch`, leaving the ref stale, or the rehydration ref points at a row that was
  cleared), the `messages` insert violates the FK → code 787 → the whole turn is dropped.

---

## Fixes (do all four)

### Fix 1 — Conversation id → UUID
`src/contexts/krishna.context.tsx:378`:
```ts
const conv = await createConversation({
  id: crypto.randomUUID(),          // was: String(now)
  title: generateConversationTitle(userText),
  createdAt: now,
  updatedAt: now,
  messages: [],
});
```
(`crypto.randomUUID()` is already used elsewhere in the codebase — e.g.
`packages/core/database/chat-history.action.ts:428` and the audit code — so it's available in this
runtime. No import needed.)

### Fix 2 — Live turn id → UUID
`src/contexts/krishna.context.tsx:367-372`:
```ts
const turn: ConversationTurn = {
  id: crypto.randomUUID(),          // was: String(now)
  userText,
  assistantText,
  timestamp: now,
};
```

### Fix 3 — Rehydrated turn id → UUID (the boot-time dup-key source)
`src/contexts/krishna.context.tsx:489`:
```ts
currentTurn = { id: crypto.randomUUID(), userText: msg.content, assistantText: "", timestamp: msg.timestamp };
```

> After Fixes 1–3, both render sites (`KrishnaChat.tsx:200`, `Input.tsx:133`) get unique keys for free
> — do **not** change those files; the key comes from `turn.id`.

### Fix 4 — Make `appendMessages` fail safely instead of throwing a raw FK error
`packages/core/database/chat-history.action.ts`, in `appendMessages` (~line 408), before the insert
loop, verify the parent conversation exists and fail with a clear message:
```ts
const db = await getDatabase();

const parent = await db.select<{ id: string }[]>(
  "SELECT id FROM conversations WHERE id = ? LIMIT 1",
  [conversationId]
);
if (parent.length === 0) {
  throw new Error(`appendMessages: conversation "${conversationId}" does not exist — cannot append messages`);
}
```
This converts the opaque `FOREIGN KEY constraint failed (787)` into a clear, debuggable error and
prevents a partial write. (With Fix 1 the dangling-ref case should no longer occur, but this is
defense in depth — keep it.)

### Fix 4b (optional but recommended) — recover a stale ref in `recordTurn`
To make `recordTurn` self-healing if `activeConversationRef.current` ever points at a missing row,
wrap the append so a failure recreates the conversation once:
```ts
try {
  await appendMessages(activeConversationRef.current, [...]);
} catch (appendErr) {
  // Stale/missing conversation — recreate and retry once.
  const conv = await createConversation({
    id: crypto.randomUUID(),
    title: generateConversationTitle(userText),
    createdAt: now, updatedAt: now, messages: [],
  });
  activeConversationRef.current = conv.id;
  await appendMessages(activeConversationRef.current, [...]);
}
```
(Keep the existing outer `try/catch` that logs "Failed to persist turn to SQLite" as the final
backstop.)

---

## Do NOT change

- The two render sites — they correctly use `key={turn.id}`; the source-level UUID fix handles them.
- `message.id` in `appendMessages` — it already uses `crypto.randomUUID()` (line 428), which is correct.
- The `timestamp: now` / `now + 1` values on messages — those are legitimate timestamps, not identity;
  leave them. (Only the **id/key** fields are the problem.)
- The encryption salt / keychain keys (see `REBRAND_CLEANUP_HANDOFF.md` DO-NOT-TOUCH list).

---

## Verify

1. **Boot with existing history:** launch `npm run tauri dev` with prior conversations in the DB →
   **no** "two children with the same key" warning at startup (this was the rehydration loop, Fix 3).
2. **Rapid exchange:** do several quick back-to-back voice/text turns → **no** "Failed to persist turn
   to SQLite" and **no** FK-787 in the console.
3. **Persistence works:** open the Dashboard → the new turns appear; restart the app → they rehydrate.
4. `npm run typecheck` + `npm test` (client) green; `cd apps/brain && npm test` unaffected.
5. `npm run build` (client production) green.

---

## Why this matters

Bug B is **silent data loss** — every turn that hits the FK error is discarded, so the user's
conversation history has gaps they never see (the error is only in the dev console). Fixing the
timestamp-as-id root cause closes both the cosmetic warning and the data loss in one change.
