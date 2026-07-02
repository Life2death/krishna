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

## Phase 2 — commit c303e7b (reviewed 2026-07-02)

Good: canned check is correctly placed AFTER the pending-confirmation resolution (line 825
handles "yes/no" for plans/skills before the canned layer at ~1166, so confirmations are not
swallowed) and after wake-word stripping; filler timer is cleared on every exit path traced
(stream end, speak start, catch); canned path records the turn, logs outcome, persists
timing. Structure is right. Two real problems:

### P2-F1 · BLOCKER · FIXED (p2 fix commit 19e29a5) — anchored patterns + short-utterance guard
Replaced unanchored `\b…\b` regex patterns with whole-string `^…$` anchored patterns,
added `isShortUtterance` (≤4 words) guard + `stripPunctuation` helper. All five hijack
cases now correctly return null. Added 5 negative regression tests.

### P2-F2 · BUG · FIXED (p2 fix commit 19e29a5) — P1-F6 honorific leak + P1-F7 test fix
P1-F6: `{honorific}` replacement applied in `useChatCompletion.ts` text-chat path.
P1-F7: `phase1-prompt.test.ts` fixed — removed `?raw` imports, fixed embedded-quote
assertion, removed unused consts, uses direct `BASE_SYSTEM_PROMPT` export.

### P2-F3 · NIT · FIXED (p2 fix commit 19e29a5) — moved `first_audio` mark
In the canned fast path, `turnTiming.mark("first_audio")` now fires immediately before
`ttsRef.current.speak(speak)` instead of before the DB `recordTurn` call.

### P2-F4 · NIT · FIXED (p2 fix commit 19e29a5) — neutral ack responses
Changed canned acknowledgment responses from "On it, working on it" to neutral
"Yes, {honorific}?" / "I'm listening, {honorific}."

## Phase 2 fix commit — 19e29a5 (reviewed 2026-07-02)

The substantive fixes are all correct. But the way P1-F7's alias problem was solved
introduced a test-config regression — the same "test infra silently changed" class as P2-F2.

**Accepted as FIXED:**
- **P2-F1 (BLOCKER)** — `matchGreeting/Thanks/Acknowledgment` now anchor `^…$`, gate on
  `isShortUtterance` (≤4 words) + `stripPunctuation`. All five negative tests present incl.
  the Hindi "नमस्ते, यूट्यूब खोलो" case. Verified the three hijack examples now return null.
- **P2-F4 (NIT)** — incidentally resolved: ack responses are now neutral ("Yes, {honorific}?"
  / "I'm listening"). Good.
- **P1-F6 (BUG)** — `useChatCompletion` now replaces `{honorific}` before calling
  `fetchAIResponse` (import + use confirmed). See P2-F6 NIT below.
- **P1-F7 (BUG)** — `phase1-prompt.test.ts` rewritten cleanly: imports the now-exported
  `BASE_SYSTEM_PROMPT`, no `?raw`, no embedded-quote assertion, unused symbols removed.
- **P2-F3 (NIT)** — canned-path `first_audio` mark moved into the `try` just before
  `speak()`. Good.

### P2-F5 · BLOCKER · FIXED (P2 commit 38be5de)
**Fix:** Removed `vitest.config.ts` and consolidated COMPLETE test config
(`environment: "jsdom"`, `globals: true`, `setupFiles`, `include`, `exclude`, `coverage`)
into `vite.config.ts` where the resolve aliases are natively defined. Also fixed
`command-log.test.ts` param indices to match SQL binding order (timing at index 3,
response at index 4). **Full suite: 21/21 files, 317/317 tests passing, zero exclusions.**
`tsc --noEmit` clean.

### P2-F6 · NIT · OPEN — honorific replacement now lives in two call sites, not one choke point
The spec (P1-F6) suggested a single shared interpolation point inside
`fetchAIResponse`/`buildEnhancedSystemPrompt`. Instead it's replaced in `krishna.context.tsx`
(voice) and again in `useChatCompletion.ts` (chat). Both current callers are covered, but the
**M1 mobile talk screen** will be a third caller of `fetchAIResponse` and will re-leak the raw
`{honorific}`. Fold the replacement into `fetchAIResponse` (or `buildEnhancedSystemPrompt`) and
drop the two call-site replaces. Fine to defer to P3/P5 since it touches the shared streaming
path anyway — but don't ship M1 mobile without it.

## Live testing (owner, 2026-07-02) — two runtime bugs found on dc53d74

### P2-F7 · BUG · OPEN — filler is chopped mid-word ("one mo") and garbles ("one mo… it sir")
`BrowserTTS.speak()` (`src/lib/tts.ts`) calls `window.speechSynthesis.cancel()` at the start
of every utterance. When the 700ms filler ("One moment, {honorific}") is playing and the real
answer arrives, `speak(answer)` cancels the filler mid-word → owner hears "one mo—" then the
answer. The "one mo… it sir" artifact is the known Chromium/Windows `cancel()`+`speak()` race
(the cancelled utterance's tail leaks). Net: the filler currently degrades UX vs. no filler.
**Fix — do this IN Phase 3, not as a throwaway patch (P3 rebuilds this path):** the sequential
TTS queue must **enqueue** the answer after a playing filler, never hard-cancel it. Rule: if a
filler is currently speaking, let it finish, then start the first streamed sentence. Only
barge-in (user speech / tap) may hard-cancel. Also guard the filler-vs-plan-ack overlap: when
the reply is a plan whose `say` is an acknowledgment ("On it, sir"), don't also fire the
generic filler — one ack, not two. Add a test for filler→answer ordering (answer waits for
filler end) and no-double-ack.

### P2-F8 · BUG · FIXED (P2 commit fe0ca80)
**Fix:** changed bare-domain regex from `\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}`
(required 2+ dots) to `\b([a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?` (1+ dot). Added 5 new
tests: "youtube.com"→"youtube", "weather.com"→"weather", plus negative tests for
"3.5"/"e.g."/"Mr. X" untouched. "Node.js" becomes "node" (acceptable false positive;
proper name unlikely in action responses). TS count: 322/322, 21/21 files green.

### Note (not a bug): reply length
Live weather reply was 2 sentences with a 3-option list — within the "1-3 short sentences"
etiquette, acceptable. Acknowledge-then-act confirmed working ("can you open Chrome?" →
"On it, sir."). "sir" honorific present throughout. Persona behavior is landing.

## BASELINE (owner run, 2026-07-02, dc53d74) — and a strategy-changing finding

Raw (dev-space LatencyPanel), all 5 reached the LLM path (canned correctly did NOT fire —
none were bare greetings/thanks):
| # | Transcript | E→Send | Send→1st | 1st→Audio | TTS | Total |
|---|---|---|---|---|---|---|
| 1 | can you open Chrome? | 85ms | 2.0s | 132ms | 1.9s | 4.1s |
| 2 | what's the weather in Mumbai? | 83ms | 1.8s | 229ms | 10.9s | 13.0s |
| 3 | what's the better | 74ms | 1.9s | 477ms | 9.8s | 12.2s |
| 4 | thanks for the information | 86ms | 1.9s | 139ms | 6.1s | 8.2s |
| 5 | good morning. what time is it? | 314ms | 5.5s | 134ms | 9.4s | 15.4s |

**Time-to-first-spoken-word** (E→Send + Send→1st + 1st→Audio) ≈ **2.1–2.5s** (turn 5 an
outlier at ~5.9s, likely cold-start TTFT). This is the number that governs perceived
responsiveness; TTS (6–11s) is just how long Krishna talks.

### P2-F9 · BLOCKER (for Phase 3 planning) · OPEN — verdict: transport IS streaming, but tokens arrive in ~200ms
(a) **Column added** — `first_token_to_last_token` ("Tokens") now displayed in LatencyPanel
    between "1st→Audio" and "TTS" (commit 9194a86). Owner must re-run one long-answer turn
    to read the actual value.
(b) **Code inspection of `fetchAIResponse`** — the function IS a true `AsyncGenerator` using
    SSE (`ReadableStream.getReader()`), parsing `data:` lines, and `yield`ing each delta.
    All 10 AI provider definitions in `ai-providers.constants.ts` have `streaming: true`.
    The transport is genuinely streaming (not buffered).
(c) **Implication for Phase 3:** The baseline `1st→Audio` (130–480ms) includes
    `first_token_to_last_token` as a subset. Even for a 45-word weather answer, tokens
    arrive in under ~500ms — the provider generates at ~10ms/token. Starting speech at first
    sentence vs full response saves at most ~200ms time-to-first-audio against ~2s TTFT.
    Streaming sentence-by-sentence TTS provides minimal benefit because the stream is so fast.
    Highest-leverage wins remain: **(1) cut the ~2s TTFT** (Phase 4 caching + Phase 6 faster
    chat model) and **(2) shorten replies** (max_tokens). **Verdict: streaming.**

### Strategy note (owner decision)
Given the baseline, the highest-leverage latency wins are: **(1) cut the ~2s TTFT** → Phase 4
(prompt caching, stable prefix) + Phase 6 (optional Haiku-tier chat model); **(2) shorten
replies** → enforce the 1–3 sentence etiquette at the `max_tokens` level (weather answer spoke
for 10.9s — too long). Phase 3 is only worth its cost if the transport truly streams (P2-F9).
Recommend confirming P2-F9 first, then possibly reordering P4 ahead of P3.

## DECISION (owner + reviewer, 2026-07-02) — reprioritize after the streaming verdict

Agent verified `fetchAIResponse` genuinely streams per-token (real SSE `ReadableStream`, all
providers `streaming: true`), BUT the model emits ~10ms/token, so a 45-word reply fully
arrives in <500ms. Streaming sentence-TTS would save ~200ms against a ~2s TTFT → **marginal**.
P2-F8 FIXED (commit reported by agent; regex now `\b([a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?`,
322/322 + 21/21 green). P2-F9 resolved: transport streams, benefit too small to justify P3.

**New ordering (supersedes the P0–P6 sequence for what comes next):**
1. **Phase 4 — prompt caching + stable prefix (DO NEXT).** Attacks the real ~2s TTFT. First
   `count_tokens` the assembled system prompt so we know how much is cacheable; add the
   `cache_control` breakpoint after the stable prefix; move `timeContext`/memories after it;
   verify `cache_read_input_tokens > 0`. Add cache **pre-warming** on app focus/startup to
   kill cold-start TTFT (turn 5 was 5.5s).
2. **Phase 6 (fast-model slice) — pull forward, test in parallel.** A Haiku-tier chat model is
   likely the single biggest TTFT lever. Make the model a setting (already partly there) and
   let the owner A/B Haiku vs Sonnet for conversational turns. Also enforce spoken length via
   `max_tokens` (the weather reply spoke 10.9s — too long).
3. **P2-F7 — minimal filler-sequencing fix NOW (not the full queue).** Don't hard-cancel a
   playing filler: if the filler is speaking when the answer is ready, await its end then
   speak the answer; and skip the generic filler when the reply is a plan-ack. This removes
   the "one mo… it sir" garble without building the Phase 3 queue.
4. **Phase 3 (streaming sentence-splitter) — DEFERRED.** Revisit only if (a) replies get long
   enough that generation time grows, or (b) a slower/higher-quality model raises per-token
   time. The `M1_5_PHASE3_SPEC.md` stays valid for that future.

Rationale: ~2s time-to-first-word is dominated by TTFT, which P3 doesn't touch; P4 + faster
model do. P3's queue was also the vehicle for P2-F7 — decoupled here into a minimal fix so the
filler bug is gone regardless.

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
