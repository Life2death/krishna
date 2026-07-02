# Krishna — Architecture v2 (conversation-first mobile + proactive cloud worker)

> **For the implementing agent.** Supersedes the *tier definitions* in
> `LOCAL_FIRST_ARCHITECTURE_PLAN.md` (the local-first principles there remain law) and narrows
> `LOCAL_FIRST_PHASE_3_MOBILE_PLAN.md` (mobile UI scope changes; its sync/key/keystore work is
> reused as-is). Confirmed with the owner 2026-07-02 via Q&A.

## What the owner confirmed (2026-07-02)
1. **Mobile = conversation only.** One voice-first talk screen (tap-to-talk → Krishna answers
   aloud), transcript visible, **no tabs** — no memory browser, no dashboard, no history page.
   Memories still flow underneath via Turso sync.
2. **Mobile v1 bar:** voice talk + shared memory. Device control, Gmail/MCP, and
   phone→laptop commands are v1.1+ increments, not v1 blockers.
3. **Sync scope:** memories **and** conversations (full parity, the existing Phase-2 engine).
4. **Voice UX:** tap mic → speak → hands-free spoken reply → tap again. Android on-device
   STT + TTS. No wake word, no continuous VAD in v1.
5. **Bigger-rethink drivers:** (a) Krishna must be fully alive when the laptop is off;
   (b) proactive Krishna — reminders & follow-ups, task/goal tracking — is missing and matters.
6. **Always-on home:** a **small cloud worker** (Fly.io/VPS/free tier) — NOT resurrecting the
   full Node brain, NOT a 24/7 laptop.
7. **Phone→laptop:** command relay **via cloud queue** (mobile enqueues, desktop executes when
   running, result comes back). Aspirational ordering: after v1.
8. **Ping channel:** native **Android push notifications** to the Krishna app.

## The four-box architecture

```
┌────────────────────┐         ┌───────────────────────────────┐
│  DESKTOP (Tier 1)  │  sync   │        CLOUD (Tier 2)         │
│  full Krishna      │◄───────►│  Turso: encrypted memories +  │
│  local-first,      │         │  conversations + reminders +  │
│  unchanged         │  cmds   │  tasks + command queue        │
│  + command executor│◄───────►│  ─────────────────────────    │
└────────────────────┘         │  NEW: Krishna Worker (tiny,   │
                               │  always-on): scheduler + push │
┌────────────────────┐  sync   │  sender + queue janitor       │
│  MOBILE (Tier 3)   │◄───────►│                               │
│  voice terminal:   │  push   │                               │
│  one talk screen   │◄────────│  (FCM)                        │
└────────────────────┘         └───────────────────────────────┘

Chat NEVER touches the worker: both apps → api.anthropic.com directly (BYOK).
Worker down ⇒ chat, memory, sync all still work; only proactive pings + relay pause.
```

### Tier 1 — Desktop (unchanged + one addition)
Everything in `LOCAL_FIRST_ARCHITECTURE_PLAN.md` stands: chat → Anthropic direct, local SQLite
source of truth, client-side voice-ID, background Turso sync, Gmail/MCP relocation per Phase 4.
**One addition (later phase):** a background **command-queue poller** — while the desktop runs,
it polls the cloud `commands` table for laptop-targeted actions enqueued from mobile, executes
them through the existing client-side executor/confirm-gate, and writes results back.

### Tier 2 — Cloud (upgraded: passive store → store + tiny worker)
- **Turso (existing):** encrypted memories + conversations via the Phase-2 delta-sync engine.
  Add tables: `reminders`, `tasks` (commitments/goals), `commands` (relay queue), `devices`
  (FCM tokens). Same LWW + tombstone rules.
- **NEW — Krishna Worker.** A deliberately dumb, tiny always-on service (Node or Rust,
  Fly.io free tier / any VPS). Responsibilities, in order of delivery:
  1. **Scheduler:** every minute, scan `reminders`/`tasks` for due items → send push.
  2. **Push sender:** FCM HTTP v1 → the Krishna Android app.
  3. **Queue janitor:** notify mobile when a `commands` row gets a result; expire stale rows.
  - **v1 worker has NO Anthropic key and NO intelligence.** Reminders/tasks are created by
    Krishna *on the devices* (chat action blocks → rows in the local DB → synced up). The worker
    only fires schedules. A later "smart worker" (periodic LLM passes for follow-up phrasing,
    email watching) can be added, but is explicitly out of scope now.
  - **Never in the runtime path.** No chat routing, no sync brokering (devices sync straight to
    Turso as today). This preserves Principles 1–4 verbatim.

### Tier 3 — Mobile (redefined: conversation-only voice terminal)
- **UI = one screen.** Tap-to-talk button, live transcript, spoken replies. Remove the
  `MobileNav` tabs (History / Memories / Settings pages stay desktop-only). Settings on mobile
  shrinks to a minimal sheet reachable from the talk screen (key entry, sync status, volume).
- **Voice pipeline:** Android on-device `SpeechRecognizer` for STT; existing `speechSynthesis`
  path (already fixed for Android) for TTS. Tap → record → STT → send.
- **Brains:** chat → Anthropic direct with mobile's own BYOK key (Android Keystore-backed
  `secure_get/set`, existing). Memories/conversations from the **local SQLite cache**, kept in
  parity by the existing sync engine (`packages/core/sync` + the in-progress Rust transport).
- **Master key:** sealed into Android Keystore (existing `keystore.rs`/`KeyStoreHelper.kt` work).
- **Offline:** talk screen still works from local cache; only the Anthropic call needs internet
  (same rule as desktop).
- **Later increments (v1.1+):** receive push notifications; device-control plugin (separate
  track, `ANDROID_ACL_PERMISSIONS_FIX.md`); Gmail/MCP tools (inherit after desktop Phase 4);
  "do X on my laptop" via the command relay.

## Open design decisions (flag, don't guess) — with recommendations
1. **Push payload vs encryption.** All synced content is encrypted with `KRISHNA_MASTER_KEY`,
   which the worker does not hold — so the worker can't read reminder text to put in a push.
   **Recommend: data-only push** ("something is due") → app wakes, decrypts locally, posts the
   real notification text itself. Zero plaintext in cloud/FCM. Fallback if data-only delivery
   proves unreliable on the owner's device: store a short plaintext `notify_title` per reminder
   (owner accepts that single field being readable) — decide only if forced.
2. **FCM vs ntfy.** FCM needs a Firebase project + `google-services.json` and works for
   sideloaded apps when Play services exist on the device (they do, per owner's phone).
   **Recommend FCM**; ntfy/WebSocket-foreground-service is the no-Google fallback.
3. **Worker runtime.** **Recommend a fresh ~200-line Node service** (or reuse only the
   scheduler bits of `apps/brain`) — do NOT redeploy the whole brain; that reintroduces the
   thing Phase 0 removed.
4. **Command schema** (relay phase): `commands(id, target_device, action_json, status
   [queued|running|done|error], result_json, created_at, updated_at)` — encrypted like other
   rows; desktop confirm-gate still applies to sensitive actions.

## Sequencing (each independently shippable)
- **M1 — Mobile v1 (NOW):** conversation-only talk screen. Strip tabs; tap-to-talk STT;
  spoken replies; chat with synced memories/conversations in context; Keystore-sealed key;
  first-run pull. Acceptance = Phase-3 plan's tests 1–6 minus the memory-browse UI, plus:
  round-trip "speak → transcript → spoken answer" works offline-of-cloud (Anthropic only).
- **M2 — Reminders/tasks end-to-end:** `reminders`/`tasks` tables + Krishna action blocks to
  create them on either device + sync. (No worker yet — desktop/mobile can fire local
  notifications for items created on themselves; cross-device firing arrives with M3.)
- **M3 — Cloud worker + push:** deploy worker, FCM wiring, data-only push → on-device decrypt
  and notify. Kill-test: stop the worker → everything except pings keeps working.
- **M4 — Command relay:** `commands` table + desktop poller/executor + mobile "ask the laptop"
  affordance + result push.
- **M5+ (existing tracks, unchanged):** desktop Phase 4 (Gmail/MCP client-side, retire brain);
  Android device-control plugin; mobile voice-ID (still deferred).

## Workflow rules (unchanged)
Implementing agent works in a worktree; commit checkpoints; **no push** unless asked
(feature-branch push is safe; release fires only on `v*` tags). `tsc` + `vitest` +
`cargo check` (desktop **and** Android target) green per milestone.
