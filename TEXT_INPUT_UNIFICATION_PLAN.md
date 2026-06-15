# Plan: Unify Text Input with Krishna + Fix Conversation Persistence

Agent handoff. Two related items. **Item 1** makes the overlay "Ask me anything" box talk to
Krishna's real command pipeline (so typing = speaking). **Item 2** fixes a persistence gap where
many turn types (open-a-URL, confirmed actions, plans, skills) are never saved to the chat store.

**Ground rules:**
- `npx tsc --noEmit` must stay clean; `npm run test` must pass.
- Don't break voice input — both voice and text must route to the same `processCommand`.
- Keep `run_shell_command` and all sensitive actions confirmation-gated (unchanged).

---

## Background — current wiring (verified)

- The overlay box is `Completion` → `useCompletion()` → `Input.tsx`
  ([src/pages/app/components/completion/index.tsx](src/pages/app/components/completion/index.tsx)).
  `useCompletion` is the **old Naukri-Lelo chat-completion pipeline** with its OWN
  `conversationHistory` / `currentConversationId`. It NEVER calls Krishna's `processCommand`.
- Krishna's brain — `processCommand` ([src/contexts/krishna.context.tsx](src/contexts/krishna.context.tsx)) —
  handles wake word, memory ("remember that…"), reminders, skills, tools, `open_target`,
  `run_shell_command`. **Only voice reaches it** (wired in
  [src/pages/app/index.tsx:15](src/pages/app/index.tsx) as `onKrishnaCommand: krishna.processCommand`).
- Net effect: typing "remember this is a jobs url: …" in the box gets a hallucinated chat reply
  and saves **nothing** to Krishna's memory. Two different brains.

---

## Item 1 — Route the text box through `processCommand` (typing = talking)

**Target:** Submitting text in the overlay box runs it through Krishna's command pipeline, exactly
like a spoken utterance — so memory, skills, tools, open/download, and shell commands all work by
typing. This is essential for inputs that are awkward to dictate (URLs, file paths, long commands).

1. **Add an input-source option to `processCommand`.** Change the signature to
   `processCommand(transcription: string, opts?: { skipWakeWord?: boolean })`.
   - When `opts.skipWakeWord` is true, **bypass the wake-word gate** (lines ~730-740 in
     krishna.context.tsx). Typing is an explicit invocation — requiring "hey krishna" in text is wrong.
   - Update the `KrishnaContextType` signature and the existing voice call site (voice passes no opts,
     so the wake-word gate still applies to voice).
2. **Wire the text box submit to Krishna.** In the overlay input flow
   ([Input.tsx](src/pages/app/components/completion/Input.tsx) / its `handleKeyPress`), on Enter call
   `krishna.processCommand(input, { skipWakeWord: true })` instead of the `useCompletion` submit.
   - Clear the input after submit; show progress via Krishna's existing state
     (`krishna.status === "thinking"` → spinner; `krishna.lastError` → error).
   - The reply is spoken (TTS) and shown in `KrishnaChat` + the Dashboard (already wired). The typed
     turn is persisted by Item 2.
3. **Decide the fate of the old Q&A panel (keep it simple):**
   - Simplest acceptable approach: the box's Enter routes to `processCommand`. The `useCompletion`
     response panel (Markdown reply, `keepEngaged` conversation mode) is no longer the primary path.
   - **Preserve the Screenshot + Files attach features if low-effort** — they give vision Q&A
     ("what's on my screen") which Krishna also does via the voice "look" command. If wiring them into
     `processCommand` is non-trivial, leave them as a secondary affordance and note it; do NOT block
     Item 1 on them.
   - If you fully retire `useCompletion` from the overlay, confirm nothing else imports it
     (grep `useCompletion`) before deleting — `useChatCompletion`/dashboard chat are separate.
4. **Concurrency note:** voice and text now both call `processCommand`, which uses module refs
   (`pendingConfirmationRef`, `abortRef`). Don't worry about hardening against simultaneous
   voice+text for this pass, but if a command is already in flight (`krishna.status !== "idle"`),
   ignore/disable new text submits to avoid clobbering a pending confirmation.

**Verify:** Type "remember this is a jobs url: https://…long-url…" → Krishna saves the memory (check
Settings › Memories). Then type "open my jobs url" (or say it) → it resolves and opens. Type
"open youtube" → opens. Voice still works and still honors the wake word.

---

## Item 2 — Fix the conversation-persistence gap (store ALL turn types)

**Problem:** SQLite persistence (`createConversation` + `appendMessages`) currently lives ONLY inside
the `if (spokenText)` branch of the main LLM-response path in `processCommand`
([krishna.context.tsx](src/contexts/krishna.context.tsx) ~lines 988-1021). So a turn is saved only
when the model returns spoken prose. These paths save **nothing**:
- **Open-a-URL / open-app actions** — when the model returns an action block with little/no
  `spokenText`, or the "Opening X" line comes from `executeAction.spokenResponse` (not persisted).
- **Confirmation-gated opens** — the yes/no handler at the top of `processCommand` opens the target
  but never records the turn.
- **Plan execution, skill replay, memory saves, reminder saves** — all speak a result but don't persist.

This is why your "open url" conversations weren't stored after 2-3 tries.

**Target — one place that records every completed turn:**
1. **Extract a `recordTurn(userText, assistantText)` helper** inside `KrishnaProvider` that does what
   the `if (spokenText)` block does today: update in-memory `conversationHistory`, manage
   `activeConversationRef` (create-or-reuse with the 15-min idle threshold), and `appendMessages` the
   user+assistant pair to SQLite. Make it null/empty-safe (skip if both texts empty).
2. **Call `recordTurn` at every terminal point** in `processCommand`, replacing the inline block:
   - Main LLM path: `recordTurn(userText, spokenText)` (even if there's also an action).
   - Action path: after "Opening X" / "Failed…", `recordTurn(userText, result.spokenResponse)`.
   - Confirmation yes path (open): `recordTurn(originalCommand, "Opening " + displayName)`.
   - Plan success/fail, skill success/fail, memory save, reminder save: record the spoken result.
   - Use the original user utterance (`pendingUserTextRef.current`) as `userText`.
3. **Avoid double-recording:** if a single turn both speaks prose AND runs an action, record it once
   (prefer the spoken prose; append a short "(opened X)" suffix if useful). Don't call `recordTurn`
   twice for the same turn.

**Verify:** Say/type "open youtube" → after it opens, the Dashboard shows a conversation with the
user line and an "Opening YouTube" assistant line. Same for a confirmed open ("open notepad" → "yes")
and a memory save.

---

## Files to touch

| Item | Files |
|---|---|
| 1 | `src/contexts/krishna.context.tsx` (processCommand signature + wake-word bypass), `src/pages/app/components/completion/Input.tsx` (+ maybe `index.tsx`/`useCompletion` wiring) |
| 2 | `src/contexts/krishna.context.tsx` (extract `recordTurn`, call at all terminal points) |

## Final verification
1. `npx tsc --noEmit` clean; `npm run test` passes.
2. `npm run tauri dev`:
   - Type a "remember … : <url>" → memory saved (Settings › Memories).
   - Type "open youtube" and say "open youtube" → both open AND both appear as conversations in the Dashboard.
   - Confirmed opens, plans, and skills also show up in the Dashboard history.
   - Voice still honors the wake word; typed input does not.
