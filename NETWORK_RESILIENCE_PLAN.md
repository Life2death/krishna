# Network resilience — serialized turns + offline awareness (design)

> Owner request 2026-07-03 ("app gets crazy on network issues"). Reviewer-authored design;
> build AFTER the travel T4 fixes land. Findings context: T4-F2 (crash during a
> network-failed turn) and T4-F3 (raw "Network error during API request: Unknown error"
> spoken verbatim). Agent protocol as usual: phases `feat(net-pN)`, findings in
> `TRAVEL_TIME_REVIEW_FINDINGS.md`-style ledger (new file `NETWORK_REVIEW_FINDINGS.md`),
> STOP per phase. Worktree `krishna-m15`, branch per consolidation decision.

## The problem, precisely
Today a turn is: STT → LLM stream (tauriFetch) → parse → TTS/actions, with an AbortController
but no queue, no retry, no offline concept. On a flaky network: streams die mid-token, the
raw error string becomes the "reply" (stored in history AND spoken), a second attempt can
overlap the first (two turns in flight → interleaved TTS/state = "gets crazy"), and one
Rust-side failure path apparently panics the process (T4-F2).

## Design — four small mechanisms, in priority order

### P1 — Turn queue (the owner's "serialization", and the biggest win)
One FIFO queue in `krishna.context`; **exactly one turn in flight, ever.**
- `processCommand` becomes `enqueueTurn`: if idle → run now; if busy → push to queue
  (cap 2; beyond that speak "One at a time please, {honorific}").
- A turn finishes (success, error, or abort) → dequeue next.
- Barge-in rule unchanged: an explicit user interrupt aborts the in-flight turn (existing
  abortRef), THEN enqueues the new one — abort is a controlled transition, not overlap.
- Replies inherently serialize because only one turn can be speaking.
This alone removes the interleaving chaos; it's ~50 lines in the context.

### P2 — Error taxonomy + spoken mapping (kills T4-F3)
Classify every turn failure into: `offline` | `timeout` | `provider_error` | `aborted`.
- NEVER store or speak a raw error string. Map: offline → "I can't reach the internet right
  now, {honorific}." · timeout → "The network is too slow right now, {honorific} — try
  again in a moment." · provider_error → "The AI service had a problem, {honorific}."
- Store the technical detail in `command_log.detail` (failure reason machinery already
  exists: `ai_error` etc.) for the Status page — not in the conversation.

### P3 — Offline detection + one-time announcement (the "inform the user" ask)
- **Passive:** classify fetch failures (P2) — 2 consecutive `offline`/`timeout` turns flips
  app state to `degraded`.
- **Active:** `navigator.onLine` + its `online`/`offline` events as the cheap signal (works
  in the webview); on `offline` event → immediately set state, speak ONCE "I've lost the
  network, {honorific} — I can still do local things", show a persistent small banner/dot
  (overlay + main window). On `online` → probe once (1 HEAD request to the configured
  provider endpoint), announce "Back online, {honorific}."
- While `degraded`: skip the LLM call entirely for new turns and answer from the canned
  layer when it matches (P2 canned replies already work offline); otherwise say the offline
  line — fast, no 30s hang.

### P4 — Retry with backoff (transient blips only)
- Retry ONLY idempotent, not-yet-streaming failures: if the fetch fails before the first
  token → retry once after 1.5s (same AbortSignal chain). If tokens already streamed →
  don't retry (double-speak risk); fail the turn via P2.
- No infinite retries, no background re-sends of chat turns (this is a voice assistant —
  a stale reply spoken 2 minutes later is worse than asking again).

## Explicitly rejected techniques (and why)
- **Full outbox/queue-and-resend of chat turns** (message-app pattern): wrong fit for
  voice — replaying old spoken questions later confuses more than it helps. Reminders/sync
  already have their own durable stores.
- **WebSocket/keepalive channel:** no server of ours to hold it open; providers are plain
  HTTPS.
- **Circuit breaker with long open windows:** overkill; P3's degraded flag + single probe
  is the same idea sized for one user.

## Crash (T4-F2) is NOT covered here
The 0xcfffffff Rust panic is a separate bug — resilience layers above it don't excuse it.
It needs a repro with terminal capture first; fix in Rust (likely an unwrap/expect on a
failed request or channel in a network path).

## Acceptance (owner, live — airplane-mode friendly)
1. Toggle Wi-Fi off mid-conversation → ONE spoken offline notice + banner; app stays alive.
2. Ask anything while offline → instant offline line (or canned reply), no 30s hang, no raw
   error text ever spoken or stored in the conversation.
3. Rapid-fire 3 questions → answered strictly one at a time, no interleaved speech.
4. Wi-Fi back on → single "back online" notice; next turn works.
5. No raw "Network error during API request" string anywhere in conversations after this.
