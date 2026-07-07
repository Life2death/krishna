# Live Transcript Panel — plan (design-complete, 2026-07-07)

> A real-time view of the current exchange: what the owner just said and Krishna's reply
> **streaming in token-by-token**, plus live status (listening / thinking / speaking). The owner
> asked for "a real-time window of what I'm speaking and what it's replying — like the dashboard
> log, but live." Written by reviewer (Claude) for the coding agent; read `RESUME_HERE.md` §6
> (how-we-work) first.

---

## 1. Why — the gap this fills

The owner expected the second-from-last bar icon (▦ Dashboard → `open_dashboard`) to be a live
view, but it opens the **logged, historical** conversation browser (`src/pages/dashboard/`). The
closest live thing today is the 💬 `KrishnaChat` popover (`src/components/KrishnaChat.tsx`), but it
is **turn-based**: it shows completed `conversationHistory` turns plus a `pendingCommand` + a static
"thinking…" spinner. It does **not** show the reply arriving token-by-token, and it's a popover, not
an always-visible panel.

**The real missing capability:** the AI reply is *already streamed* — `krishna.context.tsx:1866-1891`
does `for await (const chunk of fetchAIResponse(...)) { fullResponse += chunk }` — but the deltas are
**only accumulated**, never surfaced. The UI shows nothing until the full reply is parsed and spoken.
Exposing that stream is the core of this feature and is low-risk (one accumulator → one state).

---

## 2. Current state — the real seams (grounded, don't re-derive)

- **Reply streaming (the hook):** `src/contexts/krishna.context.tsx:1851` `let fullResponse = ""`,
  loop at `:1866`, `fullResponse += chunk` at `:1890`. The `KrishnaProvider` already owns the live
  state: `status`, `lastSpoken`, `pendingCommand`, `conversationHistory`, `lastError`
  (`:412-417`). This is where a `streamingReply` state gets fed.
- **Transcript (STT):** `src/components/KrishnaVAD.tsx:56` `onSpeechEnd` → `fetchSTT(...)` returns a
  **whole-utterance** string after the VAD detects end-of-speech, then calls
  `krishna.processCommand(transcription)`. **There is no interim/partial STT** — the words only
  exist once the utterance is complete. `vad.userSpeaking` (a boolean) and the emitted
  `vad-user-speaking` event are the only "talking right now" signals available.
- **Status model:** `AssistantStatus` = `idle | listening | thinking | speaking | confirming`
  (see `src/types/assistant.ts`). Already drives the Chakra orb.
- **Separate-window pattern:** `PresenceOverlay` (`src/components/PresenceOverlay.tsx`) is a distinct
  Tauri window (`label: "presence"`, defined in `tauri.conf.json:32`, mounted in `main.tsx:14`) fed
  purely by `emit`/`listen` events (`presence-state`). **Critical:** that window renders a
  provider-less React root — it has **no** `useKrishna()` access. Any separate window must be fed
  entirely over Tauri events.
- **Inline-panel pattern:** bar popovers (`BrainSelector`, `Updater`, `KrishnaChat`) grow the
  always-on-top bar window via `useWindowResize().resizeWindow(open)`. An inline panel reuses this.

---

## 3. The one owner decision (D1) — inline panel vs separate window

| | **Inline panel (RECOMMENDED for v1)** | Separate always-on window |
|---|---|---|
| Data access | reads `useKrishna()` directly — zero IPC | must `emit` status + transcript + **every token** and `listen` in a provider-less window |
| Effort | ~1 component + 1 context field + 1 bar toggle | new window label + route in `main.tsx` + Rust `open_transcript` command + full event bridge |
| UX | drops down from the bar (grows the bar window) | free-floating, doesn't bloat the bar; matches "window" mental model |
| Risk | low | medium (per-token IPC chatter, cross-window lifecycle) |

**Recommendation:** ship the **inline panel** as v1 (fastest path to the actual value — seeing the
reply stream + the transcript live). If the owner specifically wants a detached, movable window,
that's **Phase 4** below, built on the same `streamingReply` state via an event bridge. Do **not**
build both event paths speculatively.

Also decide **D2 — always-on vs toggle:** recommend a **toggle** (new bar icon, off by default) so
the bar isn't permanently tall. Persist the toggle like other bar prefs.

---

## 4. Design — phases (build + commit one at a time, per §6)

### Phase 1 — surface the streaming reply in the context (the core, no UI yet)
- In `krishna.context.tsx`, add state `const [streamingReply, setStreamingReply] = useState("")`.
- In the stream loop (`:1884-1891`): on first chunk `setStreamingReply("")`; each chunk
  `setStreamingReply(prev => prev + chunk)`. **Throttle** UI updates (e.g. `requestAnimationFrame`
  or a 50-80ms coalesce) so a fast token stream doesn't thrash React — accumulate into a ref, flush
  on a timer. Clear it (`setStreamingReply("")`) when the turn finalizes (after `parseActions`) and
  on abort/`plan-abort`.
- Expose `streamingReply` in the context value (the `useKrishna()` return object).
- **Note the spoken-vs-raw distinction:** `fullResponse` includes ` ```action ` / ` ```plan ` blocks
  that get stripped by `parseActions` before speaking. The panel should show the **spoken** text as
  it forms, not raw JSON blocks. Simplest correct approach: strip fenced ` ``` ...` ` blocks from
  `streamingReply` at render time (reuse the same fence regexes `parseActions` uses), so a
  half-streamed action block doesn't flash JSON at the owner.
- **Tests:** unit-test the throttle/accumulate + fence-stripping as a pure helper (extract
  `stripActionFences(text)` and a reducer) — drive it with a realistic chunk sequence including a
  split ` ```action ` block, per the §6 "test the real seam" rule.

### Phase 2 — the panel component (inline, reads context)
- New `src/components/LiveTranscript.tsx` rendering, top-to-bottom:
  - **Status line** from `status` + `vad.userSpeaking` (via a small event or context): e.g. a
    pulsing "Listening…" while the owner speaks, "Transcribing…", "Krishna is thinking…",
    "Speaking…".
  - **You:** the current utterance — show `pendingCommand` as soon as it lands (no partial STT in
    v1, see §5).
  - **Krishna:** `streamingReply` rendered live with a blinking cursor while `status==="thinking"`/
    streaming; falls back to `lastSpoken` once finalized.
  - Optional: the last N finalized turns from `conversationHistory` above the live row (so it reads
    like a feed, matching the "dashboard but live" ask).
- Keep it read-only and dependency-light (no markdown — this mirrors spoken output). Reuse
  `KrishnaChat`'s formatting/labels for visual consistency.

### Phase 3 — wire it into the bar (toggle + resize)
- Add a bar toggle in `src/pages/app/index.tsx` (new icon, e.g. `CaptionsIcon`/`ActivityIcon` from
  lucide) that shows/hides `<LiveTranscript />` as an inline dropdown under the `Card`.
- Grow/shrink the bar window with the existing `useWindowResize().resizeWindow(open)` pattern.
- Persist the on/off pref the same way other bar prefs are stored. Off by default (D2).
- **Tests:** the panel renders the streaming text and switches to `lastSpoken` on finalize; the
  toggle mounts/unmounts + calls `resizeWindow`. Drive the real component with a mocked context, not
  a reimplementation.

### Phase 4 — (only if owner picks D1 = separate window) event bridge + detached window
- Add a `transcript` window label (`tauri.conf.json` + a `main.tsx` branch mounting
  `<LiveTranscript source="events" />`) and a Rust `open_transcript` command mirroring
  `window::open_dashboard` (`src-tauri/src/window.rs:68`).
- In `KrishnaProvider`, `emit` three events: `transcript-status` (on status change),
  `transcript-user` (on `pendingCommand` set), `transcript-delta` (throttled reply text — send the
  **coalesced** accumulated string, not one event per token). The window `listen`s and renders.
- Everything else (fence-stripping, formatting) is shared with the inline component.

---

## 5. Explicitly out of scope for v1 (state honestly, don't silently drop)

- **Live word-by-word STT ("watch my words appear as I talk").** The current STT path is
  whole-utterance (`fetchSTT` on a complete WAV after VAD end). True partials need a **streaming STT
  provider** (e.g. Deepgram / a websocket Whisper) and a rework of `KrishnaVAD.onSpeechEnd` into a
  streaming session. That's a separate, larger effort — call it out in the panel copy if useful
  ("transcribes when you finish speaking"), and file a follow-up (`LIVE_STT_STREAMING`) rather than
  faking partials. v1 shows the finished transcript + a "you're speaking" pulse only.
- **Editing/replaying from the panel** — it's read-only; history editing stays in the dashboard.
- **Markdown/rich rendering** — spoken output is plain; keep parity.

---

## 6. Acceptance (owner, live)
1. Toggle the panel on. Say "what time is it?" → the panel shows a "listening/transcribing" state,
   then **"You: what time is it?"**, then Krishna's reply **appears word-by-word as it streams**,
   then settles to the final spoken line. No ` ```action ` JSON ever flashes.
2. Ask something that triggers a tool (e.g. "bring Teams to the front") → the panel shows the
   spoken acknowledgment streaming, and the finalized turn, without leaking the action block.
3. Barge-in: interrupt Krishna mid-reply → the streaming text stops and clears cleanly (no frozen
   half-reply left on screen).
4. Toggle off → the bar returns to its normal compact height.

---

## 7. Files (expected touch-list)
- `src/contexts/krishna.context.tsx` — `streamingReply` state + stream-loop wiring + expose it (P1).
- `src/lib/` new pure helper (fence-strip + coalesce reducer) + its test (P1).
- `src/components/LiveTranscript.tsx` — new (P2).
- `src/components/index.ts` — export (P2).
- `src/pages/app/index.tsx` — bar toggle + inline mount + `resizeWindow` (P3).
- `src/__tests__/live-transcript.test.ts(x)` — new (P1/P3).
- _(Phase 4 only)_ `tauri.conf.json`, `src/main.tsx`, `src-tauri/src/window.rs`, `lib.rs` invoke
  registration, and the `emit`/`listen` bridge.

## 8. Process (non-negotiable, per `RESUME_HERE.md` §6/§7)
Branch fresh off `main` (`git checkout -b feat/live-transcript main` in `krishna-m15`). ONE phase
per commit; `tsc --noEmit` + `vitest run` green before each; STOP and report after each. The panel
must show something that's actually true — the streamed text is the real model output, and the
"finalized" line must match what was actually spoken (`lastSpoken`), not a guess.
