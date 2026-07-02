# Krishna — Natural conversation & voice latency plan ("M1.5")

> **For the implementing agent.** Companion to `M1_MOBILE_IMPLEMENTATION_PLAN.md` — applies to
> both desktop and the M1 talk screen; do it with/right after M1. Owner's goals (2026-07-02):
> "good morning" → Krishna greets back **in the same language**, addressing him ("good morning,
> sir"); commands get an immediate spoken acknowledgment with an honest timeline ("this will
> take a moment"); and the whole exchange must feel like a **normal, speedy conversation**,
> especially on mobile. Worktree + checkpoints; no push unless asked.

## The core finding (why Krishna feels slow today)
`src/contexts/krishna.context.tsx:1477-1507`: the client accumulates the ENTIRE streamed LLM
response (`fullResponse += chunk`), then parses actions, then starts TTS. Nothing is spoken
until the last token has arrived — a greeting pays the full round-trip; a long answer pays
round-trip + full generation before the first word of audio. Industry latency guidance
(Pipecat/LiveKit-style pipelines) is the inverse: **start speaking at the first sentence
boundary of the stream** and target <1s from end-of-user-speech to first audio; strategic
acknowledgments make remaining latency *feel* half as long.

## What already exists — reuse
| Asset | Where | State |
|---|---|---|
| Persona system (`persona:` prompts + selector) | `src/lib/seed-personas.ts`, `system_prompts` table (synced), `krishna.context.tsx:1472` | Works; no etiquette/language rules yet |
| Streaming from Anthropic | `fetchAIResponse` (`ai-response.function.ts:225-279`) yields chunks | Works — but consumer waits for all of it |
| Barge-in (user speech stops Krishna) | `KrishnaVAD.tsx:51-54`, `stopSpeaking` | Works (desktop); M1 adds tap-to-stop |
| Mobile STT with interim results | `useMobileSpeech.ts` (`interimResults: true`) | Works (pending M1-T1 device check) |
| Response length/language settings in prompt | `buildEnhancedSystemPrompt` (`ai-response.function.ts:14-40`) | Works |

## Gaps
1. **Speak-after-full-response** (above) — the dominant latency cost.
2. **No persona etiquette**: nothing tells Krishna to say "sir", mirror the user's language,
   acknowledge commands, or state timelines.
3. **No instant-ack layer**: even "good morning" round-trips to the LLM before any sound.
4. **Prompt caching is broken by design**: `timeContext` (current date/time, `:1470`) is
   interpolated INTO the system prompt every request, and memories are injected into it too —
   the prefix changes every call, so nothing caches and every request pays full input latency.
5. **No language matching**: replies/TTS are effectively English-only regardless of what
   language the user spoke.

## Tasks

- [ ] **T1 — Persona etiquette pack (prompt-only, cheapest win).** Extend `BASE_SYSTEM_PROMPT`
  (`krishna.context.tsx:90`) / the default seed personas with a "spoken conversation" section:
  - Address the owner as "sir" (make the honorific a setting; default "sir").
  - **Reply in the language the user spoke** — if greeted in Hindi/Marathi, greet back in it.
  - Spoken style: short sentences, no markdown/lists/URLs in spoken text, contractions fine.
  - **Acknowledge-then-act**: when a request needs actions/steps, FIRST say a one-line ack with
    an honest timeline ("On it, sir — this needs a couple of steps, give me a minute"), then
    emit the action/plan block. When something will be slow (sync, install, long plan), say so.
  - Keep answers to 1–3 spoken sentences unless asked for detail (respect the existing
    response-length setting).

- [ ] **T2 — Instant local acknowledgment layer (zero-LLM fast path).** A small intent table in
  the client (multilingual: English + Hindi + Marathi to start): greetings ("good morning/
  namaste/शुभ प्रभात"), thanks, yes/no fillers. On match → speak a canned, randomized reply
  immediately ("Good morning, sir. Ready when you are.") in the matched language, **without
  calling the LLM at all** — record the turn locally. For non-matched commands: start a 700ms
  timer when the request is sent; if no first sentence has arrived, speak a short filler
  ("One moment, sir") — research shows fillers make 1000ms feel like ~500ms. Never filler twice
  in a row; never filler if the reply already started.

- [ ] **T3 — Streaming sentence-by-sentence TTS (the big one).** Refactor the consumer loop
  (`krishna.context.tsx:1477` and the M1 talk screen path) to process chunks incrementally:
  - Incremental parser: hold back text inside ```action/```plan fences (extend `parseActions`
    with a streaming mode); everything else accumulates into a sentence buffer.
  - On sentence boundary (`. ! ? ।` + length threshold) → enqueue the sentence into a **TTS
    queue** that plays sequentially while further tokens stream in. First audio starts after
    the first sentence, not the last token.
  - Barge-in/abort clears both the queue and the in-flight fetch (existing AbortController).
  - Transcript UI still renders the live stream as today. Recurrence: conversation history
    stores the final full text (unchanged).
  - ElevenLabs path: synthesize per-sentence (its latency profile benefits the same way);
    browser/native TTS path: `speak()` per sentence is already the natural unit.

- [ ] **T4 — Prompt caching + stable prefix (server-side latency + cost).** Restructure the
  request built in `ai-response.function.ts`/`krishna.context.tsx:1475`:
  - Order: persona + base prompt + tools section + rules (STABLE, byte-identical every call)
    → `cache_control: {type: "ephemeral"}` breakpoint on that last stable block → THEN the
    volatile tail (memories snapshot, time context) → conversation messages.
  - Move `timeContext` out of the cached prefix (append after the breakpoint, or into the
    latest user turn) and fix it to the **device timezone** (drop hardcoded IST, `:1470`).
  - `system` must be sent as an array of text blocks to carry `cache_control` — adjust the
    provider curl-template mapping accordingly (Anthropic native path first; other providers
    just ignore it).
  - Verify with `usage.cache_read_input_tokens > 0` on the second request; log it in dev-space.
    Note the minimum cacheable prefix (~1–4K tokens depending on model) — if the stable prefix
    is below it, caching silently no-ops; that's acceptable.

- [ ] **T5 — Language matching end-to-end.** Prompt rule (T1) handles the reply language;
  the client handles audio:
  - STT: make the recognition language configurable (settings sheet), with the option of
    multi-locale on Android (`SpeechRecognizer` language / M1-T2 bridge param).
  - TTS voice: detect the reply's script/language per sentence (cheap heuristic: Devanagari
    range → hi-IN/mr-IN per setting; else the configured default) and select the matching
    voice/`setLanguage` before speaking. Browser TTS: pick from `getVoices()` by lang tag.
  - The canned ack table (T2) is keyed by detected input language — no detection model needed;
    the match itself tells us the language.

- [ ] **T6 — Voice-turn request tuning.** For conversational turns: cap `max_tokens`
  appropriately for 1–3 spoken sentences (the length setting already exists — enforce it at
  the request level too, not just in the prompt) and keep the model **user-configurable** in
  settings instead of hardcoded at setup (`setup/index.tsx:128` pins `claude-sonnet-4-6`).
  Surface a "fast conversation model" option in settings — a smaller/faster tier (e.g. Haiku
  4.5) for chat turns is the biggest remaining TTFT lever, but it trades capability; default
  stays as-is and switching is the owner's call. Actions/plans can stay on the stronger model
  (two-model routing is a later refinement — flag, don't build now).

- [ ] **T7 — Latency instrumentation.** Log per-turn timings: end-of-speech → STT text; →
  request sent; → first token; → first audio; → last audio. Store in the existing audit/command
  log; show in dev-space. Acceptance below is measured with these numbers.

## Latency budget (mobile, tap-to-talk, after this plan)
| Stage | Target |
|---|---|
| End of speech → transcript (on-device STT) | ≤ 300ms |
| Transcript → request sent (local ack/filler decision) | ≤ 50ms |
| Request → first token (cached prefix, short prompt) | ≤ 600ms |
| First token → first sentence → first audio | ≤ 400ms |
| **End of speech → first spoken word (LLM path)** | **≤ ~1.3s** |
| Greeting fast path (no LLM) | ≤ 400ms |

## Acceptance
1. "Good morning" (English) → Krishna speaks "Good morning, sir…" in <500ms, no network call.
2. "शुभ प्रभात" / Hindi greeting → reply spoken in Hindi, addressing "sir" equivalent.
3. A normal question → first spoken word within ~1.5s; speech continues smoothly while the
   rest streams (no long gap mid-answer); transcript matches what was spoken.
4. "Open X and do Y" → Krishna speaks an acknowledgment with a timeline BEFORE the plan runs;
   plan confirmation flow unchanged.
5. Tap/barge-in mid-sentence → audio stops instantly, queue cleared, no orphan speech later.
6. Second consecutive question logs `cache_read_input_tokens > 0`.
7. Desktop VAD flow gets the same streaming TTS (shared code path), behavior otherwise
   unchanged; `tsc` + `vitest` + `cargo check` green; new unit tests for the sentence
   chunker + streaming action-fence parser + ack table.

## Out of scope
Wake word / always-on listening; two-model routing; speech-to-speech models; ElevenLabs
websocket streaming API (upgrade later if sentence-level ElevenLabs is still too slow);
voice-ID on mobile.
