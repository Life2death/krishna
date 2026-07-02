# M1.5 review findings

> Written by the reviewer (Claude). Agent: before starting each phase, fix any OPEN
> `BLOCKER`/`BUG` items below and mark them `FIXED (p<N> commit <sha>)` in this file.
> `NIT`/`LATER` items may wait for a convenient phase. This file lives in the MAIN checkout
> (`D:\Learning\krishna`) on `feature/local-first-p1` — read it from there (or fetch the
> branch); your worktree branch won't contain reviewer updates automatically.

## Phase 0 — commit 27d6506 (reviewed 2026-07-02)

Overall: solid structure — clean `TurnTiming` utility, sensible marks, tests present,
dev-space panel guards malformed `detail` correctly. Three real issues, two of them about
the data actually persisted.

### P0-F1 · BLOCKER · FIXED (p1 commit 02ac7a1) — but see P1-F1 regression — audio timings are never persisted
`src/contexts/krishna.context.tsx` success path: `turnTiming.toJSON()` is captured and passed
to `logOutcome(...)` **before** `first_audio`/`last_audio` are marked (the marks happen around
the `ttsRef.current.speak()` call that follows). The stored JSON therefore never contains
`first_audio`, `last_audio`, `first_token_to_first_audio`, `first_audio_to_last_audio`, or
`total`. The error path has the same ordering. Consequence: the LatencyPanel's "1st→Audio",
"TTS", and "Total" columns show "—" for every turn — and end-of-speech→first-audio is the
single number this milestone exists to improve; P3 acceptance can't be measured without it.
**Fix:** after the speak `try/finally` completes (both paths), write the final timing once —
e.g. a second `updateCommandOutcome({id, detail: turnTiming.toJSON()})` (keep the early
`logOutcome` for prompt dashboard visibility), or move the single log after speech if that's
acceptable for the live view.

### P0-F2 · BUG · FIXED (p1 commit 02ac7a1) — but see P1-F1 regression — error path repurposes `detail`, losing failure text
Before: `logOutcome(command, "failed", "ai_error", msg)` stored the error message in
`command_log.detail`. Now `detail` carries timing JSON and `msg` moved to the `response`
column. Anything that reads `detail` for failure diagnostics (command-log views/insights)
loses the error text, and the field now means two different things depending on the row.
**Fix (pick one, cleanest first):** (a) add a nullable `timing` TEXT column to `command_log`
via a migration and store timing there, restoring `detail`'s old semantics everywhere; or
(b) store a JSON envelope in `detail` (`{"error": msg?, "timing": {...}}`) and update the
panel + any detail readers to unwrap it. Don't leave the meaning row-dependent.

### P0-F3 · NIT · OPEN — "end_of_speech" is actually "command received"
The first mark is taken at the top of `processCommand`, i.e. after VAD end + STT already
happened, so the STT stage (budget target ≤300ms) is invisible and "E→Send" will read ~0ms.
Fine for the relative baseline; when convenient (P3 or P5), pass the real speech-end
timestamp from `KrishnaVAD.onSpeechEnd` / `useMobileSpeech` into `processCommand` (optional
param) and mark STT completion separately.

### P0-F4 · NIT · FIXED (p1 commit 02ac7a1) — small cleanups
- `TurnTiming.freeze()` is now called after final persist in both success + error paths.
- `_firstChunk` renamed to `firstChunk`.
- LatencyPanel fetch limit bumped to 50.

### P0-F5 · LATER · OPEN — baseline numbers still owed
Phase 0 acceptance requires a recorded baseline run (5 turns). Owner interaction needed —
must be captured and pasted into a phase report **before P3 starts** (after F1 is fixed,
else the baseline will be missing the audio columns).

## Phase 1 — commit 02ac7a1 (reviewed 2026-07-02)

Overall: migration + timing column are clean (`ALTER TABLE ... ADD COLUMN timing TEXT`, v17
registered correctly, CRUD threading is consistent, panel reads `timing`). The etiquette
prompt text is good. But the P0-F1 fix introduced a data-clobbering regression, and two plan
items were skipped.

### P1-F1 · BLOCKER · FIXED (p1 commit 236d1fb) — final timing write NULLs the columns written moments earlier
`updateCommandOutcome` executes `UPDATE command_log SET outcome=?, failure_reason=?,
detail=?, timing=?, response=? WHERE id=?` — **all columns, unconditionally**. The new
post-TTS calls pass only `{id, outcome, timing}`, so on EVERY turn the second write nulls
what the first write stored:
- Success path: `response` (the spoken reply text) is wiped from the row.
- Error path: `failure_reason` ("ai_error") and `detail` (the error message) are wiped —
  which re-introduces exactly what P0-F2 was supposed to fix.
**Fix:** add a narrow `updateCommandTiming({id, timing})` that executes
`UPDATE command_log SET timing=? WHERE id=?` and use it for the post-TTS write (both paths);
leave `updateCommandOutcome` as-is. (Alternative: build the SET clause dynamically from
provided fields — bigger change, not needed.) Add a regression test: log outcome with
response/detail → write timing → assert response/detail survive.

### P1-F2 · BUG · FIXED (p1 commit 236d1fb) — honorific is hardcoded, plan requires a setting
Plan P1: "Address the owner with an honorific (**setting**; default 'sir')." Both
`BASE_SYSTEM_PROMPT` and the seed persona hardcode "sir". Make it a settings value (default
"sir") interpolated into the prompt at assembly time — same pattern as the existing
response-length/language settings in `buildEnhancedSystemPrompt` / prompt assembly.

### P1-F3 · BUG · FIXED (p1 commit 236d1fb) — required snapshot test missing
Phase 1 acceptance: "snapshot test of the assembled prompt." Test count is unchanged
(287 before, 287 after) — no test was added. Add a snapshot/assertion test covering the
assembled system prompt (persona prefix + BASE + rules) including the etiquette section and
the honorific interpolation from P1-F2.

### P1-F4 · NIT · FIXED (p1 commit 236d1fb) — post-TTS write: no rejection handling, no refresh event
The new `updateCommandOutcome(...)` calls after TTS are fire-and-forget without `.catch`
(unhandled rejection if the DB write fails) and don't `emit("command-log-updated")`, so
dashboard views lag until the panel's 5s poll. Add `.catch(console.error)` + the emit —
trivial to fold into the P1-F1 fix.

### P1-F5 · NIT · OPEN — seed-persona edit is inert on existing installs
`seedDefaultPersonas()` only inserts personas whose name doesn't already exist
(`seed-personas.ts:68-69`), so the updated `persona:default` text never reaches an
already-initialized DB (like the owner's). Behavior is still correct because
`BASE_SYSTEM_PROMPT` always carries the etiquette — but don't rely on seed edits for
existing installs; either drop the duplicated etiquette from the seed (BASE covers it) or
add a seed-version upsert. Also: only `persona:default` was updated (coder/researcher/
planner untouched) — acceptable via BASE, note it was a conscious choice.

## Phase 1 fix commit — 236d1fb (reviewed 2026-07-02)

The P1-F1 fix is exactly right (narrow `UPDATE ... SET timing=?`, `.catch`, refresh emit) and
the honorific setting is threaded completely through constants/storage/settings/core-init/
startup/test-setup. FIXED marks for P1-F1/F2/F4 accepted. Two new issues, both introduced by
this commit:

### P1-F6 · BUG · OPEN — `{honorific}` placeholder leaks unreplaced in the text-chat path
Interpolation happens only in the voice path (`krishna.context.tsx:1488` replaces on the
assembled prompt). The **text-chat path** (`src/pages/chats/components/View.tsx` →
`useChatCompletion` → `fetchAIResponse`) passes `systemPrompt` from app context with **no
replacement** — so on any install where the seeded `persona:default` (which now contains
literal `{honorific}`) is the selected prompt, the raw placeholder is sent to the model.
Existing installs are shielded only by accident (P1-F5: seeds are inert there), but every
**fresh install — including the M1 mobile build — hits this**. **Fix:** interpolate at a
single choke point both paths share — e.g. inside `fetchAIResponse`/`buildEnhancedSystemPrompt`
(`ai-response.function.ts`) or a shared `applyHonorific(prompt)` util called by both; remove
the now-redundant double replace of `personaPrefix` in krishna.context while at it.

### P1-F7 · BUG · OPEN — new test has a failing assertion; suite apparently not run
`src/__tests__/phase1-prompt.test.ts` asserts
`expect(src.default).toContain('"SPOKEN CONVERSATION ETIQUETTE:"')` — with embedded double
quotes — but the source (`krishna.context.tsx:147`) uses **single** quotes, so the raw source
cannot contain that string and the assertion should fail. The commit message doesn't claim a
test run and the phase report predates this commit. **Fix:** run `vitest run` (full suite),
change the assertion to `toContain('SPOKEN CONVERSATION ETIQUETTE:')` (no embedded quotes),
and remove the unused `SPOKEN_CONVERSATION_SECTION` const + unused `beforeEach` import. Also
verify the `?raw` imports actually resolve under vitest — if they don't, export
`BASE_SYSTEM_PROMPT` for testing instead of grepping source text (cleaner anyway).
Report the post-fix test count (was 287; must be >287 and green).

### P1-F8 · NIT · OPEN — honorific has no settings UI yet
The setting exists in storage with default "sir", but nothing in the Settings page edits it.
Add a small text field alongside the existing response-length/language controls — fine to
defer to P6 (request-tuning phase already touches settings).

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
