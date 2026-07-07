# First-Word Latency — fix plan (design-complete, 2026-07-07)

> Owner's ask: "I want Krishna to speak the 1st word ASAP." Measured reality (dev latency panel,
> 2026-07-07): total end-of-speech → first audio routinely 10-35s. Written by reviewer (Claude)
> for the coding agent. Read `RESUME_HERE.md` §6 first. **Branch off LOCAL `main`
> (`git checkout -b feat/first-word-latency main`) — NEVER `origin/main` (it is stale relative to
> local `main`; this exact mistake already burned one build this week) and NEVER `git push`.**
>
> **Sequencing note (owner decision, 2026-07-07 evening): this ships BEFORE the live-transcript
> panel**, reversing the original queue order. Practical effect: L1 below is now the FIRST thing
> to touch the streaming loop in `krishna.context.tsx`, so it builds its own fence-aware sentence
> splitter from scratch (self-contained — do not wait on or reference a live-transcript helper
> that doesn't exist yet). When `feat/live-transcript` is rebuilt afterward, IT should reuse L1's
> sentence/fence utilities (see the updated note in `LIVE_TRANSCRIPT_PANEL_PLAN.md`) rather than
> duplicating fence-parsing a second time. This also removes the risk flagged earlier of two
> features editing the same stream loop on parallel branches — now it's strictly sequential.

---

## 1. Root cause — three full-completion waits stacked in series (all line-verified)

Nothing reaches the speaker until ALL THREE of these finish, one after another:

| # | Wait | Where | Evidence |
|---|------|-------|----------|
| W1 | **Full LLM generation** | `src/contexts/krishna.context.tsx:1866-1891` — `for await (chunk) { fullResponse += chunk }`, then `parseActions(fullResponse)`, and only then `speakLogged(spokenText)`. The stream is real but unused for speech. | Latency panel "1st→Audio" (first_token→first_audio) hit 23.3s on one turn — that's rest-of-generation + W2. |
| W2 | **Full TTS synthesis + download** | `src/lib/tts.ts:72-139` — ElevenLabs uses the NON-streaming endpoint (`/v1/text-to-speech/{id}`) and `await res.blob()`: the whole MP3 must be synthesized AND downloaded before `audio.play()` (line 131). Piper (`tts.ts:186-229`) synthesizes the complete WAV in Rust before decode+play. Browser TTS starts fast once called. | Long replies pay their entire synthesis before word one. |
| W3 | **Silent STT window** | Filler-line timer arms only AFTER STT returns (`krishna.context.tsx:1854`, 1.5s after `request_sent`). During Groq STT stalls the user hears NOTHING from end-of-speech onward. | "E→Send" column: 6.0-8.4s on 6/10 recent turns (Groq network flakiness, confirmed `api.groq.com` timeouts in dev log); 141-675ms when healthy. |

Secondary (already partly addressed elsewhere): prompt-cache TTFT savings only land when a cache
READ occurs (watch for non-zero left number in the Cache column); one 28.6s TTFT outlier was
provider-side.

---

## 2. Design — phases in priority order (ONE phase per commit, per §6)

### L1 — Sentence-streaming speech (the big win; do this first)
Speak the first complete sentence as soon as it exists in the stream, while generation continues.

- **New pure module `src/lib/sentence-stream.ts`** (this is now the FIRST fence/sentence parser in
  the codebase — build it self-contained; `feat/live-transcript` will import from it later, not
  the other way around):
  - An incremental splitter: feed it raw stream chunks, it emits complete speakable sentences.
  - **Fence-aware:** must suspend emission inside ``` ```action ``` / ``` ```json ``` / ``` ```plan ```
    blocks (fences can open in one chunk and close in a later one — handle the split-across-chunks
    case).
  - Sentence boundary = `.` `!` `?` `।` followed by whitespace/end — but do NOT split on
    abbreviations/decimals ("3.5pm", "Mr. Sharma", "e.g."). Keep the heuristic small and tested,
    not clever.
  - Export the fence-detection piece as its own named function (e.g. `stripActionFences`/
    `isInsideFence`) alongside the sentence splitter, even though only the splitter is needed here
    — the live-transcript rebuild needs exactly that fence-stripping primitive for its streamed
    display and should import it from this module instead of re-implementing it.
- **New `SpeechQueue` (in `tts.ts` or a sibling):** serializes chunk playback through the existing
  `TTSProvider.speak()` (each call is one utterance; the queue plays sentences back-to-back).
  - `stop()` clears the queue AND stops current playback — **wire to the existing barge-in /
    `plan-abort` path** so interrupting Krishna kills queued sentences too (test this specifically).
  - `speakLogged` semantics: log the full spoken text once per turn (single `speech_log` row as
    today), not one row per sentence.
- **Wire into the stream loop** (`krishna.context.tsx`): feed each chunk to the splitter; enqueue
  emitted sentences immediately. On loop end, flush any trailing partial sentence. The
  full-response path (`parseActions` → actions/plan execution → `decideActionResponse`) stays
  EXACTLY as today — L1 only changes WHEN prose audio starts, not what executes.
  - Mark `turnTiming.mark("first_audio")` at the first queued chunk's playback start so the
    latency panel keeps measuring the real thing.
  - Cancel the filler timer when the first real sentence starts playing (extend the existing
    `fillerSpokenRef` logic).
  - **Known edge (accept + document, don't block):** `detectPhantomSave` runs on the full text
    after streaming — if it fires, the first sentence has already been spoken and the correction
    is spoken after. Same for `decideActionResponse` suppression: streamed prose is the plain
    `spokenText` path only; action/plan-result speech is unchanged.
- **Tests (real seams, per §6):** incremental splitter driven with realistic chunk sequences
  (fence split across chunks, abbreviation non-splits, Hindi/Marathi sentence ends); queue
  serialization + stop-clears-queue; barge-in mid-queue; drive the real context wiring with a
  mocked TTS provider, not a reimplementation.

### L2 — ElevenLabs streaming endpoint
- Switch `ElevenLabsTTS.speak` to `POST /v1/text-to-speech/{voice_id}/stream` with
  `optimize_streaming_latency: 3`, play via MediaSource (append chunks as they arrive), falling
  back to the current blob path if MSE is unavailable in the WebView. Same host — no CSP change.
- With L1's short sentences this is a smaller win than it looks, but it removes the last
  full-synthesis wait on the FIRST sentence too.

### L3 — Instant acknowledgment at end-of-speech (kills the W3 silence)
- Play a short local earcon (bundled asset, <100ms, quiet) immediately in `KrishnaVAD.onSpeechEnd`
  (`src/components/KrishnaVAD.tsx:56`) — "I heard you" — before STT even starts.
- Move the spoken-filler watchdog earlier: if (STT + TTFT) exceeds ~2.5s from end-of-speech and
  nothing has played yet, speak a `filler_wait` line (existing `pickLine` machinery). Ensure
  exactly-once: earcon always, spoken filler only on slow turns, both cancelled by first real audio.
- Do NOT play the earcon when the utterance gets discarded (Krishna speaking / mutex path).

### L4 — STT watchdog + single retry
- Wrap the Groq `fetchSTT` call with an ~8s abort + one immediate retry (check what fetchSTT
  already does first — `packages/core/functions/stt.function.ts` — don't double-retry).
- Log a tagged `[stt] retry` line so flakiness stays measurable. Full streaming-STT is explicitly
  out of scope (see the LIVE_STT_STREAMING note in `LIVE_TRANSCRIPT_PANEL_PLAN.md`).

### L5 — Dev panel honesty (tiny, ride-along commit allowed with L4)
- `src/pages/dev/components/latency-panel.tsx:86` — the column headed "Tokens" actually renders
  `first_token_to_last_token` (generation time). Rename the header to "Gen", and add a real
  "Tokens" column from `usage.prompt_tokens`/`completion_tokens` (already persisted).

---

## 3. Acceptance (owner, live — using the latency panel + ears)
1. Ask a question with a long answer: first audible word starts while the panel's Gen column is
   still ticking (i.e., speech begins BEFORE generation completes). Target: first word < 3.5s p50
   from end-of-speech on healthy network.
2. Every utterance gets the earcon within ~0.5s of you stopping speaking — including turns where
   Groq STT stalls 6-8s.
3. Barge-in mid-long-answer: Krishna stops within a beat, no queued sentences leak out after.
4. A turn that emits an action block (e.g. "bring Teams to the front") never speaks JSON, and the
   action still executes exactly as before.
5. No double-speak: filler/earcon never overlaps the first real sentence.

## 4. Process (non-negotiable)
- Branch `feat/first-word-latency` off **local `main`** (window-control-wiring `22c6168` and
  naukri N1-N3 `669c6ce` are both already merged — main is current, base off it directly).
  ONE phase per commit; `tsc --noEmit` + `vitest run` green each; STOP and report.
- **NEVER `git push`** — three branches were pushed in error on 2026-07-07; do not repeat it.
- At least one test per phase must drive the seam the live app actually uses (the context wiring /
  the registered provider), not the new module in isolation — the window-control lesson.
- This branch must merge to `main` BEFORE `feat/live-transcript` is rebuilt (see the sequencing
  note at the top of this file and `LIVE_TRANSCRIPT_PANEL_PLAN.md`'s updated Phase 1).
