# Pending items — 2026-07-03 (updated 2026-07-04) — cold-start handoff for the coding agent

> **Read this whole file before touching anything.** You are a fresh agent with no memory of
> prior sessions. This file exists so you, the reviewer (Claude), and the owner (Vikram) stay
> in sync without re-explaining context every time. Work items in the order listed. STOP after
> each numbered item's phase and report — do not chain multiple items into one commit.

## What this project is

**Krishna** — a Tauri (Rust + React/TypeScript) desktop voice assistant. Repo root:
`D:\Learning\krishna`. It talks to Anthropic's API directly (local-first — no required
backend), has a local SQLite DB for memories/conversations, on-device voice-ID (WavLM), and a
growing set of client-side tools (travel time, more coming) the LLM invokes via
` ```action ` / ` ```plan ` JSON blocks that the client parses and executes — **not** native
tool-calling.

## Who does what (read this or you will do the wrong thing)

- **Vikram (owner):** decisions, live testing on his laptop, API keys, priorities.
- **You (coding agent):** write ALL app code. You work in **`D:\Learning\krishna-m15`**
  (a separate git worktree of this same repo) — **never** in `D:\Learning\krishna` itself,
  that's the reviewer's checkout.
- **Claude (reviewer, in `D:\Learning\krishna`):** plans, reviews every commit you make (via
  `git show <sha>` from the main checkout — never runs commands inside your worktree while
  you're active), writes findings to a `*_REVIEW_FINDINGS.md` file per track, commits docs to
  `main` from the main checkout.

## Branch model (IMPORTANT — changed 2026-07-03)

**`main` is now the single consolidated hub.** Everything (M1.5 voice work, voice-ID, travel
tool, all docs/findings) was merged into `main` on 2026-07-03. Two old branches
(`feature/m1-5-voice`, `feature/local-first-p1`) are **archived — do not build on them.**

For any NEW piece of work: **branch fresh off `main`**, inside `D:\Learning\krishna-m15`:
```
cd D:\Learning\krishna-m15
git checkout -b <track-name> main
```
**Gotcha:** do NOT run `git checkout main` itself in that worktree — `main` is checked out in
the reviewer's `D:\Learning\krishna` and git will refuse. Branching off it directly (as above)
works fine.

When a track's work is reviewed and approved, the reviewer merges your branch into `main` from
the main checkout. You never merge or push.

## Commit + review protocol

- One phase per commit. Commit message prefix matches the track (see each item below for its
  exact prefix convention).
- After every phase: `npx tsc --noEmit` clean + full `npx vitest run` green, **then commit,
  then STOP and report** (files touched, test counts, anything ambiguous). Do not start the
  next phase without the reviewer's go-ahead.
- **No `git push`, ever**, unless explicitly told otherwise.
- Each track has its own findings file (e.g. `TRAVEL_TIME_REVIEW_FINDINGS.md`). Before
  starting a phase, read that file and fix any `OPEN` `BLOCKER`/`BUG` first; mark items
  `FIXED (commit <sha>)` when you land the fix.
- If a plan document exists for your item (linked below), read it in full before coding — do
  not guess at scope.

## Three gotchas that already bit us — do not repeat

1. **Secret storage has two unrelated stores.** The app's real secret store is
   `secure_get`/`secure_set` Tauri commands → an AES-256-GCM blob in the app-data dir
   (`src-tauri/src/secure.rs`). Windows Credential Manager (used by the reviewer's PowerShell
   scripts for out-of-band key testing) is a **different, unrelated store** — the app cannot
   read it. If you're wiring up a new API key, use `secureStorage` (`src/lib/secure-storage.ts`)
   / `getSecret`/`setSecretGetter` (`packages/core/secrets.ts`), matching the pattern in
   `src/pages/settings/components/MapsSettings.tsx` or `Integrations.tsx`.
2. **Don't infer "should this be spoken" from string prefixes.** `ExecuteActionResult` (in
   `src/lib/actions.ts`) has an explicit `kind?: "answer" | "status"` field for this — set it
   correctly on every new action, don't reintroduce prefix-sniffing.
3. **`command_log.outcome = "answered"` does NOT mean the underlying data actually persisted.**
   Twice now the chat/dashboard showed a cheerful "Saved, sir" while the `memories` table had
   zero rows — because the MODEL said it saved something without emitting the action block, or
   narrated a future step it never executed. When debugging "it says X but X didn't happen,"
   always check the actual table (`sqlite3` against `%APPDATA%/com.krishna.assistant/krishna.db`)
   — never trust the spoken/logged outcome alone.

---

## Pending items, in priority order

### 1. Travel tool swallows the real Google API error (NEW — top priority)

**Found 2026-07-04** debugging a live failure with the owner. `packages/core/tools/
get-travel-time.ts` has empty `catch {}` blocks around the Google Routes call and the URL-open
fallback — when the call fails, the ACTUAL reason (e.g. "No routes found", a 4xx body, a
malformed address) is discarded before it ever reaches `command_log` or `speech_log`. The user
just hears "the live traffic lookup didn't go through this time" with zero diagnostic trail.
This is exactly why today's real failure (empty `memories` table → literal "work" sent as an
address → Google returned no route) took manual live API reproduction to diagnose instead of a
five-second DB/log query.

**Fix:** stop swallowing the error. At minimum, pass the caught error's message into the tool's
return `data` (or a dedicated field) so the caller can `logOutcome(..., "tool_failed", <real
reason>, ...)` instead of nothing. Consider also emitting a `speech_log` entry with
`source:"error"` carrying the real reason (redacted if needed) even though the SPOKEN line
stays the friendly fallback sentence — the dashboard should show the truth even when the voice
doesn't. Add tests: a Google 4xx and a "no routes found" case must each produce a distinguishable
logged reason, not silence.

Branch fresh off `main`, e.g. `fix/travel-error-visibility`. Commit prefix: `fix(travel-errvis-N)`.

---

### 2. Model narrates actions it never executes (NEW — top priority)

**Found 2026-07-04**, live, alongside item 1. Observed exact sequence: model said *"Saving that
now, sir. Now let me check the travel time for you"* — the save didn't happen (T4-F6-class
issue, separately mitigated) AND the travel-time check never ran (no `travel_time` action was
ever emitted or logged). This is the SAME lying-about-actions pattern `detectPhantomSave`
(`src/lib/actions.ts`) catches for memory saves specifically — but the model does this for
OTHER future actions too ("let me check X", "I'll do Y next"), and nothing catches those.

**Fix:** generalize the grounding. Either (a) extend the prompt's existing "never say
saved/remembered without the action block" rule (`BASE_SYSTEM_PROMPT`, REMEMBER section) to a
broader rule — never narrate a NEXT action in the same turn; each turn does ONE thing, then
waits for the next user input — or (b) add a second detector alongside `detectPhantomSave` that
flags future-tense action narration ("let me", "now I'll", "I'm going to check") with no
corresponding action/plan block in the same reply, and have the context either strip that
clause or ground it the same way T4-F1 grounds "saved" claims. Prefer (a) first (prompt fix is
cheaper and this is a weak-model instruction-following problem) — only add code-side detection
if the prompt fix doesn't hold up live.

Branch fresh off `main`, e.g. `fix/no-narrated-actions`. Commit prefix: `fix(narrate-N)`.

---

### 3. `fix/travel-t4` — DONE, merged into `main`

All of P1–P5 plus the later T4-F6/T4-F7 work (confirm-timeout truth, speech_log observability)
landed and merged (`main` tip includes all of it as of 2026-07-04). **T4-F2 (the `0xcfffffff`
crash) is the only item still open in that file — status `NEEDS-REPRO`**, not scheduled work
until it recurs with a terminal capture. Nothing to resume here.

Also done this session (2026-07-04, frontend-only, HMR'd + pushed): explicit "remember …" /
"update your database" commands now save **instantly**, no confirmation prompt (owner request)
— see `saveMemoryNow()` in `krishna.context.tsx`. The confirm gate still applies to
proactive/inferred saves the model initiates on its own.

---

### 4. Owner live-test T4 in-app (not your task — flag it, don't block on it)
Reviewer already seeded the owner's real home/work addresses directly into the DB and confirmed
the Google Routes call succeeds with them (21.8 km, ~58 min with traffic, Panvel → Mahape). What
has NOT yet been confirmed is the full voice path in the running app itself — Vikram saying
"how long to work?" out loud and hearing the spoken answer. Not your task; don't be surprised if
he reports something new mid-way through items 1–2.

---

### 5. Phase 4a — Gmail client-side (queued after items 1–2 are closed)

**Plan:** `GMAIL_MCP_LOCAL_PHASE4_PLAN.md` (also read the "§Gmail & MCP" section of
`LOCAL_FIRST_ARCHITECTURE_PLAN.md` it references, and `apps/brain/src/gmail/tools.ts` — you're
porting its arg/return shapes, not redesigning them). **Branch:** `feat/local-p4-gmail` off
`main`.

Goal: move Gmail's 4 tools (search/read/list-labels/send) from the Node "brain" to fully
client-side (Tauri OAuth loopback + direct Gmail REST calls, no `googleapis` dependency in the
app). Read tools → `KNOWN_SAFE`; `gmail_send_email` stays sensitive with a real spoken
confirmation (recipient + subject). **Depends on the T4-F4 speech-filter fix already being in
`main`** (it is — merged; Gmail results are `kind:"answer"` speech, which only gets spoken
because of that fix — see item 3).

**Owner prerequisite (not yours):** Vikram needs to paste a Google OAuth client_id/secret
(from the brain's existing keys) into a new Gmail Settings section once you build it.

Commit prefix: `feat(local-p4a-N)`.

---

### 6. Network resilience — turn queue + offline handling

**Plan:** `NETWORK_RESILIENCE_PLAN.md`. **Branch:** fresh off `main`, e.g. `feat/network-p1`.

Four phases: P1 turn queue (exactly one turn in flight, FIFO, barge-in preserved — this is the
"serialize responses" ask), P2 error taxonomy (never speak/store raw errors — same spirit as
item 1's fix, but this is the general-purpose version), P3 offline detection + one-time spoken
announcement + banner, P4 single pre-stream retry. Read the "Explicitly rejected techniques"
section too — don't reinvent an outbox/websocket/circuit-breaker design, that was already
considered and rejected.

Commit prefix: `feat(net-pN)`. New findings file: `NETWORK_REVIEW_FINDINGS.md` (reviewer
creates it at first review).

---

### 7. Voice ID — Phase 3 + 4 (held since Phase 2, lower priority)

**Plan:** `VOICE_ID_STATUS_METER_PLAN.md` · **Findings:** `VOICE_ID_STATUS_REVIEW_FINDINGS.md`.
Phases 1 and 2 are done (shared hooks + the Status-page training-meter card). Phase 3 needs:
apply the same `canEnable >= 100%` strict gate to the *existing* Settings toggle (currently
only the new Status card enforces it — a real bypass exists today), fix the P2-N1 finding
(Status card and Settings page each hold an independent local `enabled` copy with no shared
source of truth — fold a shared value into `useVoiceStatus`), and implement "Option A"
background-fill (owner-chosen): while Voice ID is off, silently top up the sample gallery from
normal use (reusing the existing `≥0.88`-confidence auto-add logic) without ever taking action,
so the meter fills from daily use instead of requiring ~24 manual recordings.

Branch fresh off `main`, e.g. `feat/voiceid-p3`. Commit prefix: `feat(voiceid-status-pN)`.

---

### 8. Phase 4b/4c — MCP hub port + brain retirement
Outline only in `GMAIL_MCP_LOCAL_PHASE4_PLAN.md` — detailed spec comes after Phase 4a is
reviewed. Don't start this until told to.

---

## Parked (do not start without being asked)
- M1.5 broad-question spoken brevity — was hardened, then reverted at owner's request
  (`fca491a`); currently unhardened again (broad questions can run 27–30s TTS). Not scheduled.
- P6-F4 — TTS occasionally too fast to understand; needs a live repro before anyone can fix it.
- Android tracks (`feature/voice-android`, `feature/android-control`) — separate, incomplete,
  blocked on a Tauri v2 ACL permissions issue (`setTorch`). Not part of this queue.
- Ola Maps as a manual "second opinion" comparison tool — reference spec exists in
  `TRAVEL_TIME_TOOL_PLAN.md` but it's explicitly NOT scheduled; only build if asked.

## If you get stuck
Report back with: which item/phase you're on, exact error or ambiguity, and what you've ruled
out. Do not guess past an ambiguity in a plan doc — flag it and stop.
