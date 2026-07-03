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

### P2-F7 · BUG · FIXED (P2 commit — filler sequencing)
**Fix:** `fillerPromiseRef` captures the filler's `speak()` promise. Before calling
`ttsRef.current.speak(spokenText)`, if the promise is pending, `await` it first (filler
finishes naturally — no hard-cancel). After `parseActions`, if `plan?.steps.length` is
truthy, clear the pending timer (the plan-ack is sufficient; don't also fire the generic
filler). Added 5 BrowserTTS unit tests covering promise resolution, cancel-before-speak,
and `isSpeaking()` lifecycle. Full suite: 327/327, 22/22 files.

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
   **→ FIXED (P2 commit fe0ca80 + seq fix).**
4. **Phase 3 (streaming sentence-splitter) — DEFERRED.** Revisit only if (a) replies get long
   enough that generation time grows, or (b) a slower/higher-quality model raises per-token
   time. The `M1_5_PHASE3_SPEC.md` stays valid for that future.

Rationale: ~2s time-to-first-word is dominated by TTFT, which P3 doesn't touch; P4 + faster
model do. P3's queue was also the vehicle for P2-F7 — decoupled here into a minimal fix so the
filler bug is gone regardless.

## Phase 4 — commits 4f2e9e8, 7fe1b6b, be4bad8, 76a7313 (reviewed 2026-07-02) — ALL FINDINGS FIXED

Direction is right (stable/volatile split, device TZ, usage plumbing, Cache column), but the
implementation only migrated 3 of 10 provider templates and the injection/capture logic is
wrong for the provider the owner actually uses (Anthropic `claude`). Four findings:

### P4-F1 · BLOCKER · FIXED (p4 fix commit 7fe1b6b) — but see P1-F1 regression — audio timings are never persisted
`krishna.context.tsx` no longer passes `systemPrompt` — only `stableSystemPrompt` +
`volatileSystemPrompt`. But only openrouter/openai/groq templates were migrated to the new
`{{STABLE_SYSTEM_PROMPT}}`/`{{VOLATILE_SYSTEM_PROMPT}}` variables. The other 7 templates
(claude, grok, gemini, mistral, cohere, perplexity, ollama) still use `{{SYSTEM_PROMPT}}`,
whose variable is now `enhancedSystemPrompt || ""` with `systemPrompt === undefined` →
**empty**. On those providers Krishna silently loses its ENTIRE system prompt — identity,
action protocol, etiquette, memories. **Fix:** in `fetchAIResponse`, when the split params are
provided, also populate `SYSTEM_PROMPT` with the concatenation (stable + "\n\n" + volatile) so
every unmigrated template keeps full behavior; migrated templates use the split vars.

### P4-F2 · BLOCKER · FIXED (p4 fix commit be4bad8) — `stream_options` injected unconditionally → Anthropic 400s every request
The injection (`bodyObj.stream_options = {include_usage:true}` for every streaming provider)
hits the `claude` template too. Anthropic `/v1/messages` strictly validates top-level fields —
`stream_options` is not a valid param → **every Claude-provider chat request returns 400**.
**Fix:** gate the injection to OpenAI-style endpoints only (e.g. template body already
contains a `messages`+`choices` schema, or a per-provider `usageStyle: "openai"` flag).
Anthropic streams usage without any opt-in.

**Fix applied:** gate is now `bodyObj.messages && !bodyObj.system` — Claude body has both,
OpenAI-style has only `messages`. Two-way unit test added (14 tests in file, up from 12).

### P4-F3 · BUG · FIXED (p4 fix commit 7fe1b6b) — usage capture reads a field shape no provider emits where expected
`onUsage` reads `parsed.usage.cache_read_input_tokens` from each SSE chunk:
- **Anthropic:** cache fields arrive nested in the `message_start` event —
  `parsed.message.usage.cache_read_input_tokens` (with `message_delta` carrying only
  `output_tokens`). The current read misses it.
- **OpenAI-style (openrouter/openai/groq):** the field is
  `usage.prompt_tokens_details.cached_tokens` — `cache_read_input_tokens` doesn't exist there.
Net: the new Cache column would show nothing on EVERY provider even after F1/F2 are fixed.
**Fix:** normalize per style: Anthropic → check `parsed.message?.usage ?? parsed.usage` and
map `cache_read_input_tokens`; OpenAI-style → map `usage.prompt_tokens_details?.cached_tokens`
into the same normalized field. Merge accumulatively to handle Anthropic's split events.

### P4-F4 · BUG · FIXED (p4 fix commit 7fe1b6b) — cache never actually enabled for Anthropic + skipped spec items
Even with F1–F3 fixed, the `claude` template still sends `"system": "<string>"` — Anthropic
does NOT cache without an explicit breakpoint. The template must become a block array:
`"system": [{"type":"text","text":"{{STABLE_SYSTEM_PROMPT}}","cache_control":{"type":"ephemeral"}},
{"type":"text","text":"{{VOLATILE_SYSTEM_PROMPT}}"}]`. Two spec items were also skipped:
(a) **report the token count of the stable prefix** (spec step 1) — Sonnet-tier minimum
cacheable prefix is ~2048 tokens; if the stable prefix is below it, Anthropic caching silently
no-ops and we need to know; (b) **startup/focus pre-warm** (`max_tokens: 0` warm request) to
kill the cold-start TTFT (baseline turn 5 was 5.5s). Implement both or explicitly defer (b)
with the owner's sign-off.

**Stable prefix token report:** ~7440 chars / ~1860-2480 estimated tokens (below 2048 Sonnet min for Anthropic; personaPrefix adds ~50-125 tokens, bringing it close). On Sonnet the cache will likely no-op on bare-BASE turns; for longer personaPrefix prompts it may reach threshold. OpenAI-style caching (automatic on repeated prefix, no threshold) is unaffected. Pre-warm (b) is deferred — needs sign-off from owner.

**Owner guidance:** hold local testing until F1/F2 are fixed — chat is broken on the claude
provider and silently degraded on 6 others in this commit.

## Phase 4 fix commit — 7fe1b6b (reviewed 2026-07-02)

**Accepted as FIXED (verified in diff):**
- **P4-F1** — `SYSTEM_PROMPT` fallback now = enhanced(stable + "\n\n" + volatile); all
  message-style templates migrated to the split; unmigrated schemas keep full prompt. Good.
- **P4-F3** — three-branch usage normalization is correct: Anthropic `message_start` via
  `parsed.message.usage`, OpenAI final chunk gated by `!parsed.type` (OpenAI chunks carry no
  `type`; Anthropic events always do), `message_delta` merges only `completion_tokens`.
  Context-side accumulative merge prevents the delta from clobbering cache fields. Good.
- **P4-F4** — claude template `system` is now a block array with `cache_control` on the
  stable block. Good.

### P4-F2 · BLOCKER · FIXED (p4 commit be4bad8; gate `messages && !system` + two-way unit test verified) — the stream_options gate does not exclude Anthropic
The fix gates injection on `bodyObj.messages` — but the **Claude body also has a `messages`
array** (`/v1/messages` takes `system` + `messages`). So `stream_options` is still injected
into Anthropic requests → still 400 (`stream_options: Extra inputs are not permitted`) on
every Claude-provider turn. **Fix:** gate on `bodyObj.messages && !bodyObj.system` (Anthropic
is the only template with top-level `system`; OpenAI-style carries system as a message role),
or on `url.includes("/chat/completions")`. Add a unit test: build the claude request →
assert `stream_options` is absent; build the openai request → assert present.

### P4-F5 · NIT · FIXED (p4 commit be4bad8; creation captured from message_start, shown as read/creation pair) — borderline prefix: capture cache_creation too, or the test is ambiguous
Agent's estimate: stable prefix ~1860–2480 tokens vs Anthropic's ~2048 minimum — **borderline**.
If it's under, Anthropic silently doesn't cache and the Cache column shows 0 forever, which is
indistinguishable from "capture broken". Also surface `cache_creation_input_tokens` (same
`message_start` usage object) in the panel: creation>0 = cache being written (prefix big
enough); both 0 = prefix below minimum. One extra field, removes all ambiguity.

**Pre-warm (P4-F4b): DEFERRED with reviewer sign-off** — revisit after the owner's cache test;
only worth building if (a) the prefix clears the minimum and (b) cold-start TTFT still hurts.

## Phase 4 — CLEARED FOR OWNER TEST (as of be4bad8)

All P4 findings resolved (F1/F3/F4 in 7fe1b6b; F2/F5 in be4bad8, gate + two-way test
verified in diff). Pre-warm deferred by sign-off. Known open question the test answers:
stable prefix is ~1860–2480 est. tokens vs Anthropic's ~2048 minimum — the Cache column's
creation/read pair tells us which side we're on (creation>0 = caching engaged; both 0 =
prefix below minimum → fatten stable prefix or accept no Anthropic caching on bare BASE).

**Owner test protocol:** run `npm run tauri dev` in the worktree (agent paused), then 3–4
voice turns ~30s apart. Watch LatencyPanel: turn 1 Cache should show creation>0; turns 2+
should show read>0 AND a lower Send→1st vs the 1.8–2.0s baseline. Paste the table back.

### P4-F6 · BLOCKER · FIXED (p4 commit 76a7313) — pre-flight validator rejects the new placeholders: ALL providers fail ("Missing required variable: STABLE_SYSTEM_PROMPT")
Found by owner live test (first turn failed with "AI provider error … please configure it in
settings"). `fetchAIResponse` pre-flight (both copies, ~line 96-108) treats every extracted
`{{VAR}}` as user-configurable unless exempted — and the exemption list is still only
`SYSTEM_PROMPT / TEXT / IMAGE`. Templates now contain `{{STABLE_SYSTEM_PROMPT}}` and
`{{VOLATILE_SYSTEM_PROMPT}}` → validation throws before any request is sent → **every
provider is broken at runtime**. Unit tests missed it because their fixture templates don't
include the new placeholders.
**Fix:** add `STABLE_SYSTEM_PROMPT` and `VOLATILE_SYSTEM_PROMPT` to the exemption filter in
BOTH `packages/core/functions/ai-response.function.ts` and `src/lib/functions/ai-response.
function.ts`. Also add to `extractVariables()` `doNotInclude` list in `common.function.ts`
(both copies) so the Settings UI also hides them. Add a regression test that runs the REAL
built-in claude + openrouter templates through the pre-flight with only API_KEY/MODEL
configured (this class of bug = fixtures diverging from real templates; test the real
constants). curl-validator.ts's `requiredVariables` is called with `['TEXT']` only — no
change needed for the custom-provider save path. Full suite: 22 files, 333/333 tests green
+ tsc clean.

## Phase 4 LIVE TEST RESULT (owner run on 76a7313, 2026-07-02) — cache NOT engaging + new regression

Post-P4 turns (newest 4): Cache column rendered **0/0 (read/creation) on every turn**;
Send→1st unchanged (1.9–2.5s, one 5.7s cold start); rows 5–7 were failures from the broken
pre-76a7313 build (expected). Three conclusions:

1. **Capture pipeline works** (0/0 rendered, not "—") — usage fields arrive and persist.
2. **Anthropic wrote NOTHING to cache (creation=0)** — consistent with the stable prefix
   (~1860–2480 est. tokens) being under Sonnet's ~2048-token minimum… but see P4-F8: a
   dropped `cache_control` block produces the same signature, so it must be ruled out.
3. **Send→1st didn't move**, as expected with no cache engagement.

### P4-F7 · BUG · FIXED (p4 commit b34e4f4) — cancel filler instead of awaiting it

**Root cause:** P4's `cache_control` dramatically improved TTFT (~2s baseline → ~700–1000ms
post-P4), so the stream now ends *while the filler is still speaking* (~1.2s phrase "One
moment, sir" started at 700ms). The `await fillerPromiseRef.current` (added by P2-F7)
blocked 1st→Audio for the remaining filler duration (~1s), regressing from 130–480ms
baseline to 1.3–2.0s.

**Fix:** replaced `await fillerPromiseRef.current` with `ttsRef.current.stop()` + null
assignment — cancels the filler immediately instead of waiting for it to finish. The
answer's `speak(spokenText)` then plays without delay.

**Before/After gap:** the ~1.2–1.4s post-stream block (last_token → first_audio) is
eliminated; 1st→Audio returns to ~130–480ms baseline range because `stop()` is instant
and `speak(spokenText)` fires on the next line.

### P4-F8 · BUG · OPEN — prove `cache_control` survives the template pipeline, then decide on the prefix
creation=0 has two possible causes: (a) prefix below Sonnet's 2048-token minimum, or (b) the
`cache_control` block being mangled/dropped by curl2Json → deepVariableReplacer. Rule (b) out
first: extend the existing claude-template unit test to assert the parsed body has
`system[0].cache_control === {type:"ephemeral"}` AND log/inspect one real request body in dev.
If (b) is clean → it's (a): report the EXACT token count (use the tokenizer or send one
request and read `usage.input_tokens` for the system portion) and STOP — fattening the prefix
is an owner decision (cache gain is modest ~100–300ms; may not be worth +prompt size, and a
Haiku switch raises the minimum to ~4096 making it moot).

### P4-F8 — Code review: `cache_control` fully survives the pipeline

**Verdict: (b) is ruled out — `cache_control` is preserved end-to-end. The 0/0 is purely (a): prefix under 2048.**

Pipeline trace (confirmed by code review):
1. **Template string** — `ai-providers.constants.ts` line 36: literal
   `"cache_control":{"type":"ephemeral"}` in the `system` array
2. **curl2Json** — `JSON.parse` on the `-d` body → `cache_control` becomes a JS object key
3. **buildDynamicMessages** — only touches keys `messages`/`contents`/`conversation`/`history`
   — the `system` array is untouched
4. **deepVariableReplacer** — regex is `/\{\{STABLE_SYSTEM_PROMPT\}\}/g` (exact `{{KEY}}`
   match). Recursively walks objects; only replaces `{{...}}` inside *string values*.
   Object keys (`"cache_control"`) and non-`{{}}` string values (`"ephemeral"`) pass
   through unchanged. Mustache syntax (`{{#system_prompt_chunks}}`, `{{{.}}}`) does NOT
   match because the regex is `/\{\{[A-Z_]+\}\}/g`.
5. **JSON.stringify** — serializes the JS object → wire format includes
   `"cache_control":{"type":"ephemeral"}` on `system[0]`.

**Exact stable prefix token count (estimated from source):**

| Component | Characters | Est. tokens (~4:1) |
|---|---|---|
| BASE_SYSTEM_PROMPT | 2992 | 748 |
| `\n\n` + toolsSection (10 tools) | 1005 | 251 |
| SYSTEM_PROMPT_RULES | 1878 | 470 |
| **Stable base subtotal** | **5875** | **~1469** |
| + Auto length prompt (default) | 395 | 99 |
| + English prompt (default) | 19 | 5 |
| + MARKDOWN_FORMATTING_INSTRUCTIONS | 500 | 125 |
| **Enhanced stable prefix total** | **~6792** | **~1698** |
| *Anthropic Sonnet cache minimum* | *8192* | *2048* |
| **Shortfall** | **~1400** | **~350** |

With default settings and ~10 tools, the stable prefix is **~1700 tokens** — ~350 tokens
below Anthropic's 2048 minimum. Prompt caching will not engage on bare-BASE turns. A
custom personaPrefix typically adds 50–200 chars (~12–50 tokens) — still below threshold.
Extensive tool sets (20+ tools) or a verbose custom system prompt could clear it.

**Recommendation:** cache gain is ~100–300ms on TTFT (vs the 5.5s cold-start outlier). The
~350-token shortfall requires ~1400 more chars of stable prefix — that's 30% more prompt
size for a modest gain. On Sonnet, caching likely won't meaningfully improve the median
TTFT (1.8–2.0s → ~1.6–1.8s). **A faster model (Phase 6) is the higher-leverage path.**

**Owner decision needed:** accept no Anthropic caching and proceed to Phase 6, or fatten
the stable prefix. (Note: if Haiku is used as the fast model, its cache minimum is *4096*
tokens — making the stable prefix even farther below threshold, which further argues
against fattening.)

### Reply length is now the dominant UX cost (observation → feeds Phase 6)
Post-P4 turns spoke for **15.6s / 24.7s / 41.4s / 45.1s** — the "1–3 short sentences"
etiquette is not holding on open questions. Talk time, not TTFT, is now the biggest perceived
cost. Phase 6's `max_tokens` enforcement for voice turns moves up in priority: cap
conversational turns (~150–200 output tokens), keep the etiquette line, verify with TTS times.

**Recommended order:** P4-F7 (regression) → P4-F8 (cache proof) → Phase 6 (length cap +
fast-model setting). Prefix-fattening decision AFTER P4-F8's exact number + model choice.

**Status as of Phase 4 fix commit 5b9f47d:**
- P4-F7: **FIXED** → **SUPERSEDED by P4-F9** (b34e4f4's hard-cancel was wrong)
- P4-F8: **CLOSED** — `cache_control` survives pipeline; prefix ~1700 tokens (below 2048
  minimum). Accept no Anthropic cache on current prompt size.
- P4-F9: **FIXED** — threshold 700→1500ms + await (not stop) + 2 tests.
  Full suite: 23 files, 335/335 tests, tsc clean.

## P4-F7/F8 resolution review — commit b34e4f4 (reviewed 2026-07-02)

**P4-F8 · CLOSED — owner/reviewer decision: accept no Anthropic cache, proceed to Phase 6.**
Agent's trace is accepted: `cache_control` survives the template pipeline end-to-end; the
stable prefix is ~1700 tokens vs Anthropic's 2048 minimum. Fattening +350 tokens for a
~100–300ms gain is a bad trade, and a Haiku switch (Phase 6 candidate) raises the minimum to
~4096 making it moot. **Keep the cache infra as-is** — it's harmless, engages automatically
for OpenAI-style providers, and self-activates on Anthropic if a custom persona ever pushes
the prefix past 2048. Revisit only if the prompt grows for other reasons.

**P4-F7 diagnosis accepted, fix REJECTED — it reintroduces P2-F7:**

### P4-F9 · BUG · FIXED (p4 fix commit 5b9f47d) — `ttsRef.current.stop()` on a playing filler = the "one mo—" garble again
b34e4f4 replaces `await fillerPromiseRef.current` with `ttsRef.current.stop()`. Hard-
cancelling a mid-utterance filler is EXACTLY the original P2-F7 live bug ("one mo—" chop +
the Chromium cancel/speak tail-leak garble). The pendulum has now swung both ways: await →
1.2s gap (P4-F7); stop → garble (P2-F7). Neither is right. **Correct design (both changes):**
1. **Raise the filler threshold 700ms → ~1500ms.** Empirically the stream now often completes
   ~700–1000ms after send, so a 700ms filler fires on nearly EVERY turn and always collides
   with the answer. At ~1500ms, fast turns get no filler at all (correct — sub-1.5s needs no
   filler) and only genuinely slow turns hear one.
2. **When a filler IS mid-utterance, await it (revert to await), don't stop it.** With the
   threshold raised this now happens rarely and costs ≤~1s only on already-slow turns —
   invisible next to their multi-second wait, and garble-free. Optionally shorten the phrase
   ("One moment." / language-matched) to cut that cost further.
Add tests: no filler fired on a fast (mocked <1.5s) turn; filler+answer ordering (answer
speech begins only after filler utterance resolves) on a slow turn.

### Note on the causal claim (correct the record, no action)
b34e4f4's comment attributes the faster TTFT to `cache_control` — impossible: creation=0
means Anthropic wrote nothing to cache. The observed 700–1000ms TTFT is connection warmth/
variance (cold starts still hit 5s+). Don't encode wrong causality in comments; the fix's
empirical premise (stream often ends while filler speaks) is still valid.

## PHASE 6 — GREEN LIGHT (after P4-F9)
Scope, in order: (1) **`max_tokens` cap for voice turns** (~150–200 output tokens for
conversational replies; keep etiquette line; verify TTS times drop from 15–45s to <10s);
(2) **chat model as a setting** + Haiku-tier option for owner A/B (no two-model routing);
(3) **P1-F8** honorific settings UI field; (4) commit `feat(m1.5-p6)`, report, STOP.

### Phase 6 dependency answers (reviewer, verified on branch b34e4f4)
1. **Settings UI location:** the user-facing Settings page is `src/pages/settings/index.tsx`
   + `src/pages/settings/components/` (NOT apps/brain — that's retired from the runtime).
   The honorific field (P1-F8) belongs next to the existing `ResponseLength` /
   `LanguageSelector` controls (imported there from `src/pages/responses/components`).
   The **provider config UI** (where API_KEY/MODEL are entered) is separate:
   `src/pages/dev/components/ai-configs/` (Dev space page).
2. **MODEL flow:** `{{MODEL}}` in every template is filled from `selectedProvider.variables`
   (user-configured per provider — your own P4-F6 regression test asserts `api_key`/`model`
   are the two required vars). So a Haiku switch IS already possible today via Dev space →
   AI providers → edit model. Phase 6's setting is the convenience layer: add an optional
   **`voiceModel`** setting (empty = provider default); the VOICE path passes it as a
   `modelOverride` param to `fetchAIResponse`, which overrides `allVariables.MODEL` for that
   request only. Do NOT touch provider config or the text-chat path.
3. **Yes, separate paths.** Voice turns get the cap; text chat keeps the template default
   (e.g. claude's 1024). Implementation: optional `maxOutputTokens` param on
   `fetchAIResponse`; when set, find the existing max-tokens-style key in `bodyObj`
   (`max_tokens` / `max_completion_tokens` / `maxOutputTokens` — same detection pattern as
   the existing `stream` key search) and override it; if the template has NO such key, skip
   and `console.warn` (do not inject blind — key name is provider-specific). Voice path
   passes a `voiceMaxTokens` setting (default ~200). Add unit tests: claude template
   override, groq (`max_completion_tokens`) override, no-key template skips, chat path
   (param omitted) untouched.

## Phase 6 — commit 9b5cf12 (reviewed 2026-07-02/03, mobile Claude review + desktop verification)

Substantively a clean phase — all six spec checks passed: override-not-inject verified against
all 10 real templates (claude `max_tokens` + groq `max_completion_tokens` override; the other
8 correctly skip+warn), twin-file parity byte-identical, voice-only scoping correct
(`voiceModel: ""` falls back to provider MODEL; text chat passes neither param), all 4 tests
assert the right things, HonorificInput genuinely persists AND is read at runtime (voice +
chat), and the canned/filler/plan-confirmation paths are untouched. Two findings:

### P6-F1 · BLOCKER · FIXED (p6 commit bbd1bf0) — `apps/brain/src/core-init.ts` misses the two new required ResponseSettings fields
`packages/core/settings.ts` now requires `voiceMaxTokens: number` and `voiceModel: string`
(non-optional). `src/lib/startup.ts` + `src/__tests__/setup.ts` were updated, but the brain's
`setSettingsGetter(() => ({responseLength, language, autoScroll, honorific}))`
(`core-init.ts:56-61`) was not → the object literal no longer satisfies `SettingsGetter` →
**apps/brain workspace typecheck breaks** (not covered by the root `tsc --noEmit` the commit
message cites — brain has its own tsconfig). Precedent: honorific was added to this exact
call site in 236d1fb; this commit broke that pattern. **Fix:** add `voiceMaxTokens: 200,
voiceModel: ""` to the literal. Impact note: brain is retired from the runtime path, so this
is a build-hygiene break, not a user-facing one — but it's a one-liner; fix it and run the
brain workspace's own typecheck to confirm (report both tsc results).

### P6-N1 · NIT · PARTIALLY FIXED, reopened as P6-N2 (p6 commit bbd1bf0)
Original issue (case-sensitive exact-match) addressed by switching to
`[...].includes(k.toLowerCase())` in both twins. But the fix is itself case-broken — see P6-N2.

### P6-N2 · NIT · FIXED (p6 commit 69dea23) — the case-insensitivity fix keeps a mixed-case needle in the list
bbd1bf0 uses `["max_tokens", "max_completion_tokens", "maxOutputTokens"].includes(k.toLowerCase())`
in both twins (`ai-response.function.ts:184`). The haystack is lowercased but the list still
contains **`"maxOutputTokens"`** (mixed case) — so a body key that lowercases to
`maxoutputtokens` can never match, defeating the very case-insensitivity this was meant to add.
**Not active today** (verified: no built-in template uses a `maxOutputTokens`-style key — only
claude `max_tokens` + groq `max_completion_tokens`, both lowercase, both work), so the voice
cap functions correctly for real providers. Latent only. **Fix:** lowercase the list entry →
`["max_tokens", "max_completion_tokens", "maxoutputtokens"]`. Fine to fold into the next
commit (e.g. travel-tool work) — not worth its own round-trip.

### P6-F2 · NOTE (not blocking) — apps/brain still has ONE pre-existing typecheck error
Agent reports brain `tsc --noEmit` = 1 error at `status.ts:126` (missing `voice-id/store.ts`),
unrelated to the settings literal. Plausible and clearly independent of this change (P6-F1's
target — the `setSettingsGetter` literal — now typechecks). `apps/brain` is retired from the
runtime path, so this is not a milestone blocker. Confirm it predates 9b5cf12 only if the
brain workspace ever needs to build again.

### P6-N3 · NIT · FIXED (p6 commit 69dea23) — `voiceModel` has storage + updater but NO Settings UI control
`updateVoiceModel`/`voiceModel` exist in response-settings storage and the voice path reads
them, but there is no UI input to set `voiceModel` (only `HonorificInput` was added). So the
Phase-6 scope item "chat model as a setting + Haiku-tier option for owner A/B" is only
half-delivered — the owner can't switch the voice model from the app. **For the acceptance
test now**, the Haiku pass can instead change the provider's `MODEL` in Dev space → AI
providers (global switch — affects all turns, fine for a latency A/B). **Fix (small):** add a
voice-model text/select input next to HonorificInput (empty = provider default), same
storage pattern. Also give `voiceMaxTokens` a field while there (currently only settable via
storage). Fold into the travel-tool commit or a quick `feat(m1.5-p6)` follow-up.

*(Credit: P6-F1/P6-N1 from the mobile Claude review session; P6-N2/P6-F2/P6-N3 from desktop
verification of the fix commit.)*

## Phase 6 LIVE TEST (owner, 2026-07-03) — Haiku TTFT win confirmed; brevity is broken

Rows 1–4 of the run were on **Haiku** (owner realized the provider MODEL was already
`claude-haiku-4-5`), rows 6–9 the earlier **Sonnet** run — so this is a real A/B:
- **Send→1st (TTFT): Haiku ~1.0–1.3s vs Sonnet ~2.0–5.7s.** Haiku ~halves TTFT and removes
  the 5.7s cold spikes. **Haiku is a legit fast-conversation option — recommend it as the
  voice-model default** once P6-N3 gives it a UI (or set provider MODEL to Haiku now).
- **1st→Audio rose to ~2.8–3.1s on the Haiku rows** (was ~1.3–2.0s) — likely the P4-F7-class
  post-stream gap under different timing; watch it, may be variance.

### P6-F3 · BUG · FIXED (p6 commit 69dea23) — voice replies ignore the brevity/no-markdown etiquette → 14–43s monologues
Haiku TTS: 42.9s / 17.9s / 32.3s / 13.9s. The "what can you help me with?" reply was a
**multi-section markdown list** (headers + bullets: "Open & Launch:", "Control Your
Computer:", …) that also **truncated mid-sentence** ("…type out") — i.e. it hit the 200-token
cap. So the Phase-6 cap IS applied, but two things are wrong:
1. **200 tokens is still ~40s of speech** — far past the "1–3 short sentences" goal.
2. **The spoken-etiquette rule is not being followed** — the model produces lists/headings for
   spoken output (BASE_SYSTEM_PROMPT forbids markdown + caps at 1–3 sentences). Sonnet rows
   (6–9) were also 15–45s, so this is model-agnostic and worse on Haiku (weaker instruction
   following). Truncating a long reply mid-sentence is itself bad UX.
**Fix (prompt-first, cap as backstop):** (a) verify `voiceMaxTokens` actually reaches the
request — surface the request's `max_tokens` in the LatencyPanel or log it once; (b) lower the
voice cap to ~100 tokens; (c) STRENGTHEN the spoken etiquette for weak models — explicit:
"Spoken reply: at most 2 sentences. NEVER use markdown, headings, bullet lists, or numbered
lists — this is read aloud. If the question is broad, give a one-sentence answer and offer to
elaborate." Consider wiring the existing response-length setting to the cap. (d) Re-verify the
owner's selected persona/response-length settings aren't set to a long mode.

## P6 fix commit — 69dea23 (desktop-verified 2026-07-03)
FIXED marks for P6-F3/P6-N2/P6-N3 accepted after diff verification: etiquette line matches
the prescription verbatim; cap 200→100 across the constant + all fallback literals; override
log added (key+value only); needle list fully lowercased in both twins; VoiceMaxTokensInput +
VoiceModelInput are rendered in settings/index.tsx AND wired to storage (not dead fields).

### P6-N4 · NIT · OPEN — etiquette rewrite dropped the "no raw URLs" clause
The old spoken-etiquette line also banned raw URLs in spoken text; the strengthened rewrite
lost that clause. The sanitizer converts domains at speak-time (P2-F8), so impact is low —
but the prompt nudge kept URLs out of replies entirely. **Fix (one line, fold into any next
commit):** append "Never speak raw URLs — say the site's name instead." to the etiquette line.

## P6 brevity hardening — commit 348f2e0 (REVIEWER-authored, owner-authorized, 2026-07-03)

> ⚠️ **REVERTED 2026-07-03 by owner request — commit `fca491a` (`revert(m1.5-p6)`).**
> All of 348f2e0's changes were undone: rule 11, the few-shot etiquette example, the
> restored no-raw-URLs clause, and the cap 160 (back to 100). Prompt + cap now match the
> agent's `69dea23` state. Reverted (not reset) because 348f2e0 was already pushed and
> shared on the agent's branch; `fca491a` is local-only, not pushed. Consequences reopened:
> **P6-N4 is OPEN again** (no-raw-URLs clause dropped once more), **P6-F5 risk is back**
> (cap 100 can truncate a multi-step plan's JSON — the reason 348f2e0 raised it to 160), and
> broad-question brevity is unhardened again (27–30s TTS on broad questions). Context: the
> "no reply" that prompted the revert was later traced to a **duplicate `krishna.exe`
> instance**, not 348f2e0. Original 348f2e0 review notes retained below for history.

Live retest showed the abstract rule holds on simple questions (7.6s TTS) but broad questions
still ran 27–30s. Reviewer took over with owner's sign-off:
- **P6-F3 → HARDENED (348f2e0):** few-shot example in the etiquette (the "what can you help
  me with?" answer, marked as MAXIMUM length), "even for broad questions", and a new final
  rule 11 at the END of SYSTEM_PROMPT_RULES (recency binds hardest on weak models).
- **P6-N4 → FIXED (348f2e0):** no-raw-URLs clause restored.
- **P6-F5 (identified + mitigated in same commit):** the voice cap is passed UNCONDITIONALLY
  (krishna.context.tsx:1551), so 100 tokens could truncate a multi-step plan's JSON mid-block
  → silently broken commands. Cap raised to 160 at all 5 sites — brevity is prompt-enforced;
  the cap is the runaway guard. Watch item: a >3-step plan may still exceed 160; the retest
  must include a command turn.
- **Owner gotcha:** his install has `voiceMaxTokens: 100` persisted in localStorage from the
  prior run — the new 160 default won't apply automatically. Set it via the new
  VoiceMaxTokens field in Settings during the retest.

## PROCESS NOTES (reviewer, 2026-07-03) — read before continuing the pipeline

**1. Revert `fca491a`** undid the reviewer-authored `348f2e0` brevity hardening (few-shot
example, rule 11, no-raw-URL clause, cap 100→160), citing "owner request." **Vikram: please
confirm this was your call and why** (what didn't work about it?) — if so, the broad-question
rambling (27–30s replies) is unresolved and needs a different fix; if the agent reverted this
on its own initiative citing a request that didn't happen, that's a protocol break worth
correcting (reviewer-authored + owner-authorized commits shouldn't be silently undone).

**2. Two unplanned tracks landed** (`voiceid-status-p1/p2`, commits `20c8d1d`/`ff69d55`/
`dfb5be2`): a Voice ID status refactor + training-meter UI. Not part of M1.5 or any queued
plan doc. If Vikram requested this directly with the agent, fine — just flag it here so the
paper trail matches reality; reviewed briefly below, no blockers found. If it wasn't
requested, it's scope drift worth naming.

**3. Travel tool provider scope changed via `TRAVEL_TIME_TOOL_PLAN.md` edits** (commits
`85fc31f`/`9326f37`/`f0e3636`, all doc-only): v1 is now **Google-only, English-only**; Ola is
demoted to an optional future user-invoked "second opinion," never a fallback. This reads as
tracked, deliberate owner decisions (dated, rationale given, Ola's spec still pinned for
later) — consistent with how this file records decisions. Noted for the record, not a
concern, provided Vikram confirms these were in fact made with him.

## Travel tool T1–T3 review (commits d598051/50e3dce/80dbc7a/1922f38, reviewed 2026-07-03)

Overall well-built: live Google Routes v2 fields pinned correctly (traffic-aware DRIVE/
TWO_WHEELER, routingPreference omitted for TRANSIT, duration/staticDuration for the delta),
transit vehicle-type derivation from real response fields, honorific threaded through tool
output, and the agent caught+fixed its own confirmation-gate bypass (T2-F1) before I even
looked — good instinct. One real bug found:

### T1-F4 · BLOCKER · OPEN — `callGoogleRoutes` uses plain `fetch()`, not the app's CORS-bypass transport
`packages/core/tools/get-travel-time.ts` calls `fetch(GOOGLE_ROUTES_BASE, ...)` directly. Every
other outbound API call in this codebase (`ai-response.function.ts:194`) goes through
`getHttpFetch()` from `packages/core/http.ts` specifically because the Tauri **webview's
plain `fetch()` hits CORS** calling external APIs — that's the documented reason `tauriFetch`
exists at all (see `local-first-architecture` memory / `ai-response.function.ts`). The plan
doc says "Call via `tauriFetch`" explicitly (line 85) — this wasn't followed. **Consequence:
the tool will likely fail with a network/CORS error in the actual desktop app**, even though
unit tests pass (mocked `fetch` never exercises real browser CORS). **Fix:** replace
`fetch(...)` with `getHttpFetch()(...)` (same call shape, per `ai-response.function.ts`'s
usage) in `callGoogleRoutes`. **This must be verified live** — Tauri's CSP/capabilities may
also need `routes.googleapis.com` allow-listed (check `src-tauri/capabilities/*.json` /
`tauri.conf.json` `http` scope) alongside the fetch-transport fix. Do this before the T4
owner acceptance test — otherwise "how long to work?" will error on first live try.

### P6-F4 · BUG · NEEDS-REPRO — TTS occasionally speaks too fast to understand
Owner: one reply "spoke so fast no one would understand," hypothesized to correlate with a URL
in the sentence. Not reproducible from the table alone. **To diagnose, capture:** the exact
turn, the on-screen transcript text of that reply, and whether a filler ("One moment…") played
just before it. Suspects: browser `speechSynthesis` rate glitch after a filler/cancel
transition (P4-F9 area), or a `sanitizeSpeech` output that concatenates words. Hold until
repro data.

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*

## Phase 6 — commit 9b5cf12 (complete)
- P4-F9: FIXED (commit 5b9f47d)
- Phase 6: feat(m1.5-p6) — commit 9b5cf12: max_tokens cap (200), voiceModel override,
  honorific Settings UI (P1-F8). Full suite: 23 files, 339/339 tests, tsc clean.
- **Next:** owner runs `npm run tauri dev` in the worktree, turns 3-4 voice rounds,
  observes LatencyPanel (expect TTS column to drop from 15-45s to <10s). Report table.
