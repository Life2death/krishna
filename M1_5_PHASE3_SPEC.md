# M1.5 Phase 3 — streaming sentence-by-sentence TTS — implementation spec

> Authoritative spec for Phase 3 (reviewer-authored). Read alongside `M1_5_VOICE_PERSONA_
> LATENCY_PLAN.md` (Phase 3 section) and any OPEN findings in `M1_5_REVIEW_FINDINGS.md`.
> Scope decided with the owner: **conservative** — stream only the spoken (non-fence) text;
> leave action/plan detection, confirmation, and execution exactly as they are today.

## Goal
Speak the first sentence of the reply as soon as it streams in, instead of waiting for the
whole response. Target: first audio at the first sentence boundary, not at `last_token`.

## Prereqs (must be done first, this phase)
Fix OPEN findings before building: **P1-F6, P1-F7, P2-F1, P2-F2** (see findings file). Full
`vitest run` green, **zero exclusions**. Owner captures the 5-turn baseline on the pre-Phase-3
build and pastes it in the report.

## What must NOT change
- `parseActions` semantics for extracting `actions`/`plan` from the COMPLETE response.
- The plan/skill confirmation flow, `executePlan`, the sensitive-action gate, audit logging.
- Conversation history storage (still stores the final full text).
- The canned fast-path (Phase 2) — it returns before the LLM path; untouched.

## Architecture — three pieces

### 1. Streaming fence-aware text splitter (the hard part)
A small stateful class, e.g. `src/lib/stream-speak.ts` → `SpokenTextStreamer`, fed one LLM
chunk at a time. It owns a rolling buffer and a fence state machine, and emits **complete
spoken sentences that lie OUTSIDE any fence**.

State machine over the concatenated stream:
- `OUTSIDE` — normal prose. Accumulate into a sentence buffer.
- `MAYBE_FENCE` — we've seen a partial ```` ``` ```` (1–3 backticks, or backticks + partial
  word like `` ```pla ``) at the buffer tail and can't yet tell if it's a fence opener.
  **Do not speak** the trailing ambiguous chars until resolved by the next chunk.
- `INSIDE_FENCE` — after a complete `` ```action `` / `` ```json `` / `` ```plan `` +
  newline. Swallow everything, speak nothing, until the closing `` ``` ``.

Rules:
- A fence opener is `` ``` `` immediately followed by `action`/`json`/`plan` (then `\n`).
  Backticks followed by anything else (or inline single/double backticks) are ordinary text.
- **Never emit a sentence that contains, or is immediately followed by, an unresolved fence
  marker.** When the tail looks like it could be starting a fence, hold it until the next
  chunk disambiguates (handles `` ``` `` split across chunk boundaries — the #1 bug risk).
- Sentence boundary = `. ! ? ।` followed by whitespace/end, AND the sentence is ≥ a min
  length (e.g. 12 chars) so "Mr." / "3.5" / "e.g." don't cut early. Prefer erring long.
- On stream end: flush any remaining OUTSIDE buffer as a final sentence (if non-empty and
  not inside a fence).
- Pure function core → unit-testable without React/TTS.

### 2. Sequential TTS queue
`speakQueued(sentence)` appends to a FIFO that plays one utterance at a time (await current
before starting next), so sentences don't overlap. First `first_audio` mark fires when the
first queued sentence actually starts. Reuses the existing `ttsRef.current.speak`.
- ElevenLabs and browser/native TTS both drive off this queue (per-sentence synth).
- Expose `clearQueue()` that stops current utterance + drops pending (for barge-in/abort).

### 3. Wire into the consumer loop
In `krishna.context.tsx` (main path) and the M1 talk-screen path — **shared code, one
implementation**. Inside the `for await (chunk of fetchAIResponse(...))` loop:
1. `fullResponse += chunk` (keep — final parse still needs it).
2. Feed `chunk` to the streamer; for each sentence it emits → `speakQueued(sentence)`.
3. On first sentence actually spoken → mark `first_audio` and **cancel the filler timer**
   (P2 filler is now cancelled by first-sentence, not by full-response).
After the loop (unchanged): `parseActions(fullResponse)` → drive plan/action/confirmation
exactly as today.

## Avoiding double-speech (important)
Today the code speaks `spokenText` (post-parse) after the loop. With streaming, the prose is
**already being spoken** during the loop. So after the loop:
- **Do NOT** re-speak `parseActions(fullResponse).spokenText` — it was already streamed.
  Await the TTS queue to drain instead, then proceed to plan handling.
- The plan's `say` field (spoken by the confirmation flow) is a **separate** utterance and
  still spoken as today — that's the confirmation prompt, not the streamed prose. But watch
  the acknowledge-then-act case: if the model puts the ack as leading prose (per P1) it
  streams; if it ALSO duplicates it in `say`, you'll hear it twice. Acceptable for v1, but
  note it; if it's bad in practice, dedupe (skip `say` when it equals already-spoken prose).

## Barge-in / abort
Extend the existing `stopSpeaking` / abort path (`KrishnaVAD.tsx:51`, AbortController) to:
- Abort the fetch (existing), AND `clearQueue()` (stop current + drop pending sentences),
  AND reset the streamer. No orphan sentence may play after barge-in. This is a P3 acceptance
  test.

## Test matrix (unit, in this phase)
Streamer:
- prose only, one sentence; prose, multiple sentences (correct split points).
- prose then `` ```plan `` fence → speaks prose, swallows plan.
- fence then prose (rare) → swallows fence, speaks trailing prose.
- **`` ``` `` marker split across two chunks** → no partial marker spoken.
- fence word split across chunks (`` ```pl `` | `an\n...`) → not spoken as prose.
- abbreviations/decimals ("e.g.", "3.5", "Mr. X") → not cut mid-sentence.
- Devanagari sentence ending in `।` → correct boundary.
- stream ends mid-sentence (no terminal punctuation) → flushed once.
- stream ends inside a fence → no fence content leaked to TTS.
Queue: sequential ordering; clearQueue stops current + drops pending.
Integration (mock fetch + mock TTS): first_audio marked at first sentence; filler cancelled;
final parseActions still yields the plan; no double-speak of streamed prose.

## Acceptance (Phase 3)
1. Normal question: first spoken word begins while later tokens still stream; no mid-answer
   gap; transcript matches spoken text.
2. Command with a plan: leading ack sentence is spoken early; plan confirmation flow unchanged.
3. Barge-in mid-sentence → audio stops instantly, queue cleared, nothing plays afterward.
4. Phase-0 LatencyPanel shows first-audio (Send→1st + 1st→Audio, or a new mark) materially
   lower than the baseline; paste before/after numbers.
5. Desktop VAD path and M1 talk screen share the same streamer/queue; all suites green
   (`tsc`, `vitest run` zero exclusions, `cargo check`).

## Out of scope (Phase 3)
Changing action/plan JSON handling; ElevenLabs websocket streaming API; two-model routing;
language-specific TTS voice selection (that's Phase 5).
