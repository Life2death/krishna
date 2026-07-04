# Pending items — 2026-07-03 — cold-start handoff for the coding agent

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

## Two gotchas that already bit us once each — do not repeat

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

---

## Pending items, in priority order

### 1. Finish `fix/travel-t4` — P3, P4, P5 (IN PROGRESS — resume here first)

**Plan:** `TRAVEL_T4_FIX_PLAN.md` · **Findings:** `TRAVEL_TIME_REVIEW_FINDINGS.md` · **Branch:**
`fix/travel-t4` already exists in `krishna-m15` at commit `299d0b7` (based on `main`, not yet
merged back at time of writing) — continue on it, don't create a new branch.

**State:** P1 (speech-filter fix) and P2 (phantom-save grounding) are done, reviewed, and
merged into `main`. Findings T4-F4 and T4-F1 are `FIXED`. Two items remain **OPEN**:
- **P3 — T4-F3:** raw network errors ("Network error during API request: Unknown error") are
  currently spoken/stored verbatim. Plan section "Phase 3" has exact steps — map errors to
  human sentences before they reach TTS/history; technical detail goes to `command_log` only.
- **P4 — T4-F2:** a hard crash (`exit 0xcfffffff`) happened once during a network-failed turn.
  **Repro first, do not blind-fix** — the plan's "Phase 4" section explains the protocol
  (capture terminal output, audit Rust `unwrap()`/`expect()`/`panic!` in network paths, report
  candidates before touching code).
- **P5:** small folds (dedupe the `"home"` default, formatter pass) — only after P3/P4 are
  green.

Commit prefix: `fix(travel-t4-pN)`.

---

### 2. Owner live-test T4 (not your task — flag it, don't block on it)
Vikram needs to re-run the T4 acceptance script (save home/work address → confirm it's really
in the DB → ask "how long to work?" → hear a spoken answer) once P3 is done. This is his task,
not yours — just don't be surprised if he reports something new mid-way through your other work.

---

### 3. Phase 4a — Gmail client-side — **DONE**, built + verified

**Built 2026-07-04** by the coding agent. Implementation spans 10 files across 3 layers:

**New files:**
- `packages/core/tools/gmail.ts` — 4 tool impls (search/read/list-labels/send), direct Gmail REST API, token refresh on 401, `confirmOrAbort` for send, in-code spoken formatting
- `src/lib/gmail-oauth.ts` — frontend OAuth helpers wrapping Tauri commands
- `src-tauri/src/gmail_oauth.rs` — Rust TCP listener for PKCE loopback, token exchange & refresh
- `src/pages/settings/components/GmailSettings.tsx` — Settings UI (client_id/secret inputs, Connect/Disconnect, status)

**Modified files:**
- `src-tauri/src/lib.rs` — registered module + 4 Tauri commands
- `packages/core/tools/index.ts` — registered all tools
- `packages/core/action-policy.ts` — read tools in `KNOWN_SAFE`
- `src/lib/actions.ts` — parse, execute, confirm (gmail_send)
- `src/contexts/krishna.context.tsx` — GMAIL section in `BASE_SYSTEM_PROMPT`
- `src/pages/settings/components/index.ts` + `settings/index.tsx` — component wiring
- `vite.config.ts` — path alias

**Verification:** `tsc --noEmit` clean, `vitest run` — 25 files, 421 tests all passing.

**Owner prerequisite:** Vikram still needs to paste the brain's Google OAuth client_id/secret into Settings → Gmail, then click "Connect Gmail" for one-time authorization.

---

### 4. Network resilience — turn queue + offline handling

**Plan:** `NETWORK_RESILIENCE_PLAN.md`. **Branch:** fresh off `main`, e.g. `feat/network-p1`.

Four phases: P1 turn queue (exactly one turn in flight, FIFO, barge-in preserved — this is the
"serialize responses" ask), P2 error taxonomy (never speak/store raw errors — same spirit as
item 1's P3, but this is the general-purpose version), P3 offline detection + one-time spoken
announcement + banner, P4 single pre-stream retry. Read the "Explicitly rejected techniques"
section too — don't reinvent an outbox/websocket/circuit-breaker design, that was already
considered and rejected.

Commit prefix: `feat(net-pN)`. New findings file: `NETWORK_REVIEW_FINDINGS.md` (reviewer
creates it at first review).

---

### 5. Voice ID — Phase 3 + 4 (held since Phase 2, lower priority)

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

### 6. Phase 4b/4c — MCP hub port + brain retirement
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
