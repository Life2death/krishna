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

## CURRENT WORKING ORDER (updated 2026-07-04 — agent: work top to bottom, one phase at a time)

- ✅ **Item 1** — travel error visibility — EV-1 FIXED (`4b9c997`), reviewed+verified, **merged to main**.
- ✅ **Item 2** — no narrated-but-unexecuted actions — NA-1 FIXED (`3b85777`), reviewed+verified, **merged to main**.
- ✅ **Item 10-H1** — job-hunter bearer token — H1-1/H1-2/H1-3 FIXED (`96ac399` on `feat/krishna-api-token`
  in `D:\Learning\job-hunter`), reviewed+verified (pytest 14/14). **Code done — awaiting OWNER DEPLOY**
  (see owner action below); not merged by the reviewer since it's a separate repo the owner pushes.

- 🔴 **NEW — Item 12 (live-blocking, top priority): Gmail "latest email" (no filter) fails** —
  owner hit this live 2026-07-04, first real Gmail session, immediately (OAuth/connection are
  fine). Asking "what's my latest email?" makes the model call `gmail_search` with an empty
  `query`, and the tool hard-errors on that even though Gmail's own API doesn't require `q`.
  Fix is two small parts: tool accepts empty query as "no filter, most recent N", plus one new
  prompt example. Full repro + fix in `GMAIL_REVIEW_FINDINGS.md` (finding **G-12**). Branch
  `fix/gmail-latest-email` off `main`. Commit prefix: `fix(gmail-g12)`.

**→ NEXT for the agent: Item 12 (G-12) first — small, live-blocking, already-merged-code bug.**
Then **Item 10-J1 + J3** — pipeline URL alias (J1) + application profile store (J3),
both in the Krishna repo, both unblocked. Branch `feat/job-autopilot` off `main`. See `JOB_AUTOPILOT_PLAN.md`.

**→ OWNER action (parallel, unblocks item 10-J2):** merge `feat/krishna-api-token` into job-hunter's
`main`, generate a token (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), set
`KRISHNA_API_TOKEN` + `KRISHNA_API_USER_EMAIL=vikram.panmand@gmail.com` in the Render dashboard, push
(Render auto-deploys). Until this is live, the agent must NOT start J2.

Remaining order after J1+J3:
1. **Item 9 P1–P4** — travel insights (now unblocked; item 1 landed).
2. **Item 10-J2** — queue read tool (needs H1 DEPLOYED by owner).
3. **Item 10-J4** — assisted apply, LinkedIn Easy Apply first; then J4b Naukri.
4. **Item 11 V1–V4** — natural speech (V2 after item 2 — already merged, so V2 is clear to go).
5. **Item 6** — network resilience; then item 7 (fix Gmail G-11 first), then item 8.

Owner can reshuffle at any time; if he does, the reviewer updates this block.

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

**Status (2026-07-04): commit `d52b4a7` reviewed — HALF DONE, do NOT merge yet.** The tool now
captures the real error into `data.errorDetail` and propagates it to
`ExecuteActionResult.errorDetail`, with tests — but **nothing consumes it** (`EV-1`, BLOCKER):
`decideActionResponse`/`logOutcome` never read the field, and on the fallback path the tool
returns `success:true`, so `command_log` still logs "answered" with no reason and no
`speech_log` error entry is written. The diagnostic trail this item exists to create still
doesn't reach the dashboard — same swallow-one-layer-up shape as Gmail G-2. Fix EV-1 (wire the
sink + a handler/log-layer test), then it's done. Full detail: `TRAVEL_ERRVIS_REVIEW_FINDINGS.md`.

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

**Status (2026-07-04): commit `65fd417` reviewed — good fix for the symptom, ONE issue to fix
before merge.** New `ONE ACTION PER TURN (CRITICAL)` prompt block is well-placed and clear, BUT
its two blanket lines ("do exactly ONE thing per reply" + "ask which one first / do NOT chain
them yourself") **contradict the existing multi-step `plan` feature** (lines 160–186: "play this
song on YouTube" → `youtube_search → open_target`) **and the ACKNOWLEDGE-THEN-ACT rule** (line
192: "this needs a couple of steps") — and this is a weak model, so an internal contradiction is
risky (`NA-1`). Fix: scope the rule to NARRATION (never describe an action with no block that
runs it in the same reply; a `plan` block IS the sanctioned multi-step path), keep the concrete
bad examples, drop the "exactly one thing / don't chain" phrasing. Live retest must confirm both:
double-narration gone AND "play <song> on YouTube" still emits a working plan.
Full detail: `TRAVEL_ERRVIS_REVIEW_FINDINGS.md`.

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

### 5. Phase 4a — Gmail client-side — **DONE, reviewed, fixed, merged into `main`**

**Built 2026-07-04** by the coding agent as commit `8040301`, spanning 10 files across 3 layers:

**New files:**
- `packages/core/tools/gmail.ts` — 4 tool impls (search/read/list-labels/send), direct Gmail REST API, token refresh on 401, `confirmOrAbort` for send, in-code spoken formatting
- `src/lib/gmail-oauth.ts` — frontend OAuth helpers wrapping Tauri commands
- `src-tauri/src/gmail_oauth.rs` — Rust TCP listener for PKCE loopback, token exchange & refresh
- `src/pages/settings/components/GmailSettings.tsx` — Settings UI (client_id/secret inputs, Connect/Disconnect, status)

**Modified files:** `src-tauri/src/lib.rs`, `packages/core/tools/index.ts`,
`packages/core/action-policy.ts`, `src/lib/actions.ts`, `src/contexts/krishna.context.tsx`
(GMAIL section in `BASE_SYSTEM_PROMPT`), settings wiring, `vite.config.ts`.

**Owner prerequisite:** Vikram still needs to paste the brain's Google OAuth client_id/secret
into Settings → Gmail, then click "Connect Gmail" for one-time authorization.

**Review history:** first pass on `8040301` found 2 blockers (email header/CRLF injection via
unsanitized to/subject/cc/bcc; real Gmail errors discarded at the actions.ts dispatch layer — the
same swallow-the-error pattern item 1 above flags as top priority) plus 4 more bugs — **NOT
approved**. Fix pass landed as `7f39732` (`fix/gmail-review-G1-G6`) and was retested against the
real diff: **G-1, G-2, G-3, G-5, G-6 confirmed fixed.** G-4 (unverified-speaker confirm dead end)
is fixed but the retest found a new bug, **G-11: gmail_send now asks for confirmation twice** when
going through the unverified-speaker gate (not a security hole — fails closed — just an extra
"yes"). G-11 doesn't block today because Voice-ID gating isn't the active path yet, but must be
fixed before pending item 7 (Voice-ID Phase 3) ships. Merged into `main` as of this review.
Also still open, still low priority: G-8 (unused OAuth `state` param), G-9 (no cancel button for
a stuck OAuth connect), G-10 (duplicated token-refresh logic). Full detail:
`GMAIL_REVIEW_FINDINGS.md`.

**Process note for future items:** this work was built out of priority order (before items 1–2,
both marked "NEW — top priority") and the first commit landed directly on `fix/travel-t4` instead
of a fresh branch off `main`. Follow the stated order and branch model on the next item.

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

### 9. Travel insights — best-departure suggestion + route watch (NEW — owner request 2026-07-04)

**Plan:** `TRAVEL_INSIGHTS_PLAN.md` (read it in full). Two features: (A) "when should I leave
for work?" — sample Google Routes at future `departureTime`s, speak the best window; (B) "tell
me when the route home is under 40 minutes" — a one-shot route watch polled from the existing
reminder-scheduler loop, spoken alert on trigger, truthful close-out on expiry.

**Hard dependency: item 1 must land first** — both features multiply Routes API calls, and
sampling/polling on top of the current empty `catch {}` blocks would multiply the blindness.
Do item 1 → review → then P1 here.

**Branch:** `feat/travel-insights` off `main`. **Commit prefix:** `feat(trvins-pN)` (P1–P4).
Findings file: `TRAVEL_INSIGHTS_REVIEW_FINDINGS.md` (reviewer creates at first review).

---

### 10. Job autopilot — voice job pipeline + assisted apply (NEW — owner request 2026-07-04)

**Plans:** `JOB_AUTOPILOT_PLAN.md` (Krishna side) + `JOB_HUNTER_API_PLAN.md` (job-hunter
side — read both in full). Phased: **H1** bearer-token auth in the `D:\Learning\job-hunter`
repo (the JSON API already exists — `/api/jobs?status=not_applied` is the queue; only machine
auth is missing), J1 voice-open the pipeline URL, J2 queue read tool (needs H1 deployed),
J3 application profile store, J4 assisted apply via CDP-attached Chrome with a non-negotiable
confirm-gated Submit — LinkedIn Easy Apply first, then Naukri (J4b). Full unattended
auto-apply is rejected permanently.

**All three owner decisions ANSWERED 2026-07-04:** (1) agent adds the token path per
`JOB_HUNTER_API_PLAN.md` (API itself already existed); (2) CDP into the owner's real Chrome —
approved; (3) LinkedIn + Naukri first, scale later. Nothing here is blocked on the owner
until H1 lands (then he sets `KRISHNA_API_TOKEN` + `KRISHNA_API_USER_EMAIL` in Render and
deploys).

**Branch:** `feat/job-autopilot` off `main`. **Commit prefix:** `feat(jobap-jN)` (J1–J4).
Findings file: `JOB_AUTOPILOT_REVIEW_FINDINGS.md` (reviewer creates at first review).

**Suggested working order given owner interest (2026-07-04):** items 1 → 2 (small, top
priority, already specced) → 9 (P1–P4) → 10 J1+J3 (unblocked parts) → 10 J2/J4 once the owner
answers → then item 6 (network resilience) unless re-prioritized.

---

### 11. Natural speech — variety engine + owner-learned voice lines (NEW — owner request 2026-07-04)

**Plan:** `NATURAL_SPEECH_PLAN.md` (read in full — root causes are verified with file:line).
Krishna repeats "One moment, sir" (hardcoded at `krishna.context.tsx:1720`) and other fixed
lines verbatim; the prompt's single example ack gets parroted; canned pools are tiny and
repeat-blind. Fix: a `voice_lines` Style Bank (seeded → owner-taught → LLM-refreshed from the
owner's own conversation style) with an anti-repeat picker, prompt-side variety rules with
last-acks injection, voice-command teach/ban, and an approve-gated "refresh your vocabulary"
flow. No realtime per-ack LLM calls, no external phrase APIs. V1 alone kills the monotony.

**Branch:** `feat/natural-speech` off `main`. **Commit prefix:** `feat(speech-vN)` (V1–V4).
Findings file: `NATURAL_SPEECH_REVIEW_FINDINGS.md` (reviewer creates at first review).
Unblocked — no owner decisions needed; V2 pairs naturally with item 2 (both edit the same
ACKNOWLEDGE-THEN-ACT prompt region — coordinate so they don't collide).

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
