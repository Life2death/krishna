# M1.5 — Natural conversation & voice latency (phased, gated)

> **For the implementing agent.** Companion to `M1_MOBILE_IMPLEMENTATION_PLAN.md` — applies to
> both desktop and the M1 talk screen. Owner's goals (2026-07-02): "good morning" → Krishna
> greets back **in the same language**, addressing him ("good morning, sir"); commands get an
> immediate spoken acknowledgment with an honest timeline; the exchange must feel like a
> **normal, speedy conversation**, especially on mobile.

## ⚠️ WORKING PROTOCOL — read before writing any code

This plan runs as a **pipeline**: you implement phase by phase; a separate reviewer (Claude)
reviews each finished phase **while you build the next one**. The gates below are mandatory.

For each phase P0…P6, in order:

1. **Fix first.** Check `M1_5_REVIEW_FINDINGS.md` in the repo root (the reviewer writes it; it
   may not exist yet). If it lists findings for an earlier phase marked `BLOCKER` or `BUG`,
   fix those FIRST and include the fixes in this phase's work. `NIT`/`LATER` items may wait.
2. **Implement the phase** — only this phase's scope. Do not pull work forward from later
   phases even if it's tempting.
3. **Verify:** `tsc`, `vitest run`, `cargo check` (desktop + Android target when the phase
   touches shared/mobile code) all green, plus the phase's own acceptance checks below.
4. **Commit** everything for the phase as one or more commits; the FINAL commit message must
   start with `feat(m1.5-p<N>):` so the reviewer can diff the phase by prefix. Do not push
   unless the owner asks.
5. **Report and STOP.** Post to the owner: what changed (files), test results, measured
   latency numbers if instrumentation exists, any deviations from this doc. Then ask
   explicitly: **"Phase <N> complete — confirm to start Phase <N+1>?"** and WAIT. Do not start
   the next phase without the owner's confirmation. (While you wait / while you build N+1,
   the reviewer reviews phase N and updates `M1_5_REVIEW_FINDINGS.md`.)

General rules: work in the agreed worktree; match existing code style; new logic gets unit
tests in the same phase, not "later".

## The core finding (why Krishna feels slow today)
`src/contexts/krishna.context.tsx:1477-1507`: the client accumulates the ENTIRE streamed LLM
response (`fullResponse += chunk`), then parses actions, then starts TTS. Nothing is spoken
until the last token has arrived. Voice-pipeline practice (Pipecat/LiveKit-style) is the
inverse: **start speaking at the first sentence boundary of the stream**, target <1s from
end-of-user-speech to first audio, and use acknowledgments to make the remainder feel faster.

## What already exists — reuse, don't rebuild
| Asset | Where | State |
|---|---|---|
| Persona system (`persona:` prompts + selector) | `src/lib/seed-personas.ts`, `system_prompts` table (synced), `krishna.context.tsx:1472` | Works; no etiquette/language rules yet |
| Streaming from Anthropic | `fetchAIResponse` (`ai-response.function.ts:225-279`) yields chunks | Works — but consumer waits for all of it |
| Barge-in (user speech stops Krishna) | `KrishnaVAD.tsx:51-54`, `stopSpeaking` | Works (desktop); M1 adds tap-to-stop |
| Mobile STT with interim results | `useMobileSpeech.ts` (`interimResults: true`) | Works (pending M1-T1 device check) |
| Response length/language settings in prompt | `buildEnhancedSystemPrompt` (`ai-response.function.ts:14-40`) | Works |

## Gaps this plan closes
1. Speak-after-full-response (above) — the dominant latency cost.
2. No persona etiquette (no "sir", no language mirroring, no acknowledge/timeline behavior).
3. No instant-ack layer — even "good morning" round-trips to the LLM.
4. Prompt caching broken by design — `timeContext` (current date/time, `:1470`) and memories
   are interpolated into the system prompt every request, so the prefix never caches.
5. No language matching in replies or TTS voices.

---

## Phase 0 — Latency instrumentation (baseline before improving)
Log per-turn timings: end-of-speech → STT text → request sent → first token → first audio →
last audio. Store in the existing audit/command log; surface in dev-space. Capture a baseline
run (5 turns, desktop + mobile if available) and paste the numbers in the phase report.
**Acceptance:** timings appear per turn; baseline recorded in the report.

## Phase 1 — Persona etiquette pack (prompt-only)
Extend `BASE_SYSTEM_PROMPT` (`krishna.context.tsx:90`) / default seed personas with a "spoken
conversation" section:
- Address the owner with an honorific (setting; default "sir").
- **Reply in the language the user spoke** — Hindi greeting → Hindi reply.
- Spoken style: 1–3 short sentences, no markdown/lists/raw URLs in spoken text.
- **Acknowledge-then-act:** when a request needs actions/steps, first say a one-line ack with
  an honest timeline ("On it, sir — this needs a couple of steps, give me a minute"), then
  emit the action/plan block. If something will be slow, say so.
**Acceptance:** live chat shows honorific + ack behavior; existing persona selector still
works; snapshot test of the assembled prompt.

## Phase 2 — Instant local acknowledgment layer (zero-LLM fast path)
- Multilingual intent table (English/Hindi/Marathi to start): greetings, thanks, yes/no
  fillers → speak a canned randomized reply immediately in the matched language, **no LLM
  call**; record the turn locally.
- Filler timer for real requests: if no first audio within 700ms of sending, speak one short
  filler ("One moment, sir"). Never twice in a row; never after the reply already started.
**Acceptance:** "good morning" answered <500ms offline (airplane mode); filler fires on slow
turns only; unit tests for the table + timer logic.

## Phase 3 — Streaming sentence-by-sentence TTS (the big one)
Refactor the consumer loop (`krishna.context.tsx:1477` + the M1 talk-screen path — shared
code, one implementation):
- Streaming parser: hold back text inside ```action/```plan fences (extend `parseActions`
  with an incremental mode); the rest accumulates in a sentence buffer.
- On sentence boundary (`. ! ? ।` + min length) → enqueue into a sequential TTS queue; first
  audio starts after the first sentence, not the last token.
- Barge-in/abort clears the queue AND the in-flight fetch (existing AbortController).
- Transcript still renders the live stream; history stores the final full text (unchanged).
- ElevenLabs path synthesizes per sentence too.
**Acceptance:** first spoken word while the rest is still streaming; no gap or double-speak;
barge-in mid-sentence leaves no orphan audio; unit tests for the sentence chunker and the
streaming fence parser; Phase-0 metrics show first-audio improvement vs baseline.

## Phase 4 — Prompt caching + stable prefix
Restructure the request in `ai-response.function.ts` / `krishna.context.tsx:1475`:
- Order: persona + base + tools + rules (byte-identical every call) → `cache_control:
  {type: "ephemeral"}` breakpoint → volatile tail (memories snapshot, time context) →
  messages. `system` becomes an array of text blocks to carry `cache_control` (Anthropic
  path; other providers ignore it).
- Move `timeContext` out of the cached prefix and switch it to the device timezone (drop the
  hardcoded IST at `:1470`).
- Log `usage.cache_read_input_tokens` in dev-space. Note: below the model's minimum cacheable
  prefix (~1–4K tokens) caching silently no-ops — acceptable, log it anyway.
**Acceptance:** second consecutive request shows `cache_read_input_tokens > 0` (or a logged
"prefix below minimum"); time context reflects device timezone.

## Phase 5 — Language matching end-to-end
- STT recognition language configurable (settings; Android bridge param from M1-T2 if native).
- TTS voice per sentence: script heuristic (Devanagari → hi-IN/mr-IN per setting, else
  default); browser TTS picks from `getVoices()` by lang tag; native TTS uses `setLanguage`.
- Canned-ack table (Phase 2) keys the input language — reuse, no detection model.
**Acceptance:** Hindi in → Hindi reply spoken with a Hindi voice; English unaffected.

## Phase 6 — Request tuning + final acceptance sweep
- Enforce spoken-length at the request level (`max_tokens` for conversational turns), not
  just in the prompt.
- Model becomes a setting (today hardcoded `claude-sonnet-4-6` at `setup/index.tsx:128`);
  add a "fast conversation model" option (e.g. Haiku tier) — default unchanged; switching is
  the owner's decision. Two-model routing (fast chat / strong actions): flag as later, don't
  build.
- Run the full acceptance list below on device and paste results.
**Acceptance (whole plan):**
1. "Good morning" → spoken reply <500ms, no network.
2. Hindi greeting → Hindi reply, honorific included.
3. Normal question → first spoken word ≤ ~1.5s; smooth speech while streaming.
4. Command → spoken ack + timeline BEFORE the plan confirmation flow (flow unchanged).
5. Barge-in mid-sentence → instant stop, queue cleared.
6. `cache_read_input_tokens > 0` on consecutive turns.
7. Desktop VAD flow shares the same streaming-TTS path; all suites green.

## Latency budget (mobile, tap-to-talk, end state)
| Stage | Target |
|---|---|
| End of speech → transcript (on-device STT) | ≤ 300ms |
| Transcript → request sent | ≤ 50ms |
| Request → first token (cached prefix) | ≤ 600ms |
| First token → first sentence → first audio | ≤ 400ms |
| **End of speech → first spoken word (LLM path)** | **≤ ~1.3s** |
| Greeting fast path (no LLM) | ≤ 400ms |

## Out of scope
Wake word / always-on listening; two-model routing; speech-to-speech models; ElevenLabs
websocket streaming; voice-ID on mobile.
