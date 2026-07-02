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

### P0-F1 · BLOCKER · OPEN — audio timings are never persisted
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

### P0-F2 · BUG · OPEN — error path repurposes `detail`, losing failure text
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

### P0-F4 · NIT · OPEN — small cleanups
- `TurnTiming.freeze()` is dead code (never called) — use it (freeze after final persist,
  guards late marks) or delete it.
- `_firstChunk` underscore prefix on a used local is misleading — rename to `firstChunk`.
- LatencyPanel fetches `limit: 20` then filters — turns without timing shrink the visible
  list; harmless, but bump the fetch limit if the panel looks sparse.

### P0-F5 · LATER · OPEN — baseline numbers still owed
Phase 0 acceptance requires a recorded baseline run (5 turns). Owner interaction needed —
must be captured and pasted into a phase report **before P3 starts** (after F1 is fixed,
else the baseline will be missing the audio columns).

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
