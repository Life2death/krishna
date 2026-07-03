# Claude session log — 2026-07-02 → 03 (architecture v2 + M1.5 voice/latency)

> **Purpose: cold-start file.** A fresh Claude session reads this and resumes with zero
> questions. Companion state also lives in Claude's memory (`session-status-2026-07-03`,
> `m1-5-pipeline-status`, `review-not-fix-workflow`, `local-first-architecture`).

## Latest updates (night of 2026-07-03 — travel-t4 findings all closed)

**T1-F4, T2-N2, T4-N1 all FIXED tonight** (commits `4d2b08e` and `bd644cf` on `fix/travel-t4`,
both verified by the reviewer, findings file updated in commits `e1079cb`/`f426e1b` on `main`
— none of this is pushed yet, per policy, see "Push policy" below):
- **T1-F4** — `callGoogleRoutes` now uses `getHttpFetch()` instead of plain `fetch()`;
  `routes.googleapis.com` added to CSP `connect-src` (`tauri.conf.json`) and both
  `src-tauri/capabilities/default.json` + `cross-platform.json`; test file wires
  `setHttpFetch(mockFetch)`. This was the blocker keeping the tool from working live at all.
- **T2-N2** rode along in the same commit — deduped the `"home"` default (the tool itself
  still defaults internally at `get-travel-time.ts:309`, so behavior is unchanged).
- **T4-N1** — untagged errors now speak "Something unexpected went wrong, {hon}." instead of
  the raw exception text; raw text still flows to `logDetail` for diagnostics.
- **Only remaining open items in `TRAVEL_TIME_REVIEW_FINDINGS.md`:** `T3-N1` (downgraded, no
  action needed), `T3-N2` (no test file for `MapsSettings.tsx`, low priority), and `T4-F2`
  (the crash — still `NEEDS-REPRO`, needs Vikram live with terminal capture).
- **No code work is queued for the agent right now** — next step is Vikram's live T4 retest
  (see PENDING #1 below, rewritten). Everything below "Latest updates" in this file predates
  tonight and is kept for history/context only — trust this section over the body for status.

### Push policy (read this before pushing anything)
`main` is the working branch now (see branch-model note below), and pushing to it fires
`.github/workflows/release.yml` on every push — it fails fast (~0s) and doesn't actually
publish (verified via `gh release list` — latest is still June's `v2.1.0` draft), but it's
still unwanted noise per [[no-push-release-pipeline]]. **Commit locally, do not push, unless
Vikram explicitly says to push.** This bit the reviewer once already tonight (2 accidental
pushes, no real harm, see `session-status-2026-07-03` memory for the full account).

## Earlier updates (2026-07-03 daytime — after this file was originally written)

Major work happened after this session log was drafted. **Read the latest findings files**
for the full current state: `TRAVEL_TIME_REVIEW_FINDINGS.md` (travel tool T1–T4) +
`M1_5_REVIEW_FINDINGS.md` (T4 cross-track context + remaining open items).

**Travel tool T1–T3: COMPLETE & APPROVED.** Agent built: Google Routes adapter (`d598051`),
place resolution + prompt wiring (`80dbc7a`), Settings UI Maps key field (`1922f38`).
All findings fixed. Module feature-complete.

**T4 live acceptance (2026-07-03): FIRST ATTEMPT FAILED** — 4 findings, 3 fixed:
- T4-F1 (phantom "saved" memories — model spoke claims without emitting action blocks):
  **FIXED** — `detectPhantomSave()` helper + prompt hardening (`299d0b7` on `fix/travel-t4`, merged to `main`).
- T4-F3 (raw network errors spoken verbatim): **FIXED** — classified error tags
  (`__KRNET__`/`__KRAPI__`/etc) catch + human mapping (`3132a3c` on `fix/travel-t4-p3`).
- T4-F4 (travel answers never spoken — legacy prefix heuristic dropped them):
  **FIXED** — `executeActionResult.kind: "answer" / "status"` routing (`40c3a55`,
  merged to `main`).
- T4-F2 (hard crash `exit 0xcfffffff` mid-turn): **NEEDS REPRO** — audit found 0 panics in
  network paths; suspected in audio/speaker Rust code. Owner must re-test after P3 merge
  and share `krishna-crash.txt` if it recurs.
- ~~T1-F4 (`fetch()` → `getHttpFetch()`): OPEN BLOCKER~~ — **FIXED same night**, see "Latest
  updates" at the top of this file.

**Key status changes since this file:**
- Google Maps key regenerated and re-vaulted in **app's secure store** (`secure_set` — not
  Windows PasswordVault). ✅
- Ola Maps key obtained and probe-tested ✅ (unused by v1 — future optional comparison only).
- Travel tool v1 = **Google-only, English-only** per owner decision (Ola demoted from plan).
- `348f2e0` brevity hardening **REVERTED** by `fca491a` (owner request — later traced to a
  duplicate app instance, not the commit). P6-N4 (no-raw-URL clause) re-regressed.
- Branch model updated: **`main`** is now the single consolidated hub for review documents;
  `feature/local-first-p1` is archived.
- Findings file split: travel tool findings live in `TRAVEL_TIME_REVIEW_FINDINGS.md` (not
  `M1_5_REVIEW_FINDINGS.md`).

## Working model (who does what)
- **Vikram (owner):** decisions, live voice testing on his laptop, API keys.
- **Coding agent** (separate tool, currently on a free flash-tier model): writes ALL app
  code, in worktree **`D:\Learning\krishna-m15`**, branch **`feature/m1-5-voice`**. Commits
  `feat(m1.5-p<N>)`/`fix(m1.5-p<N>)` / `feat(travel-p<N>t<N>)`, reports, STOPS for
  confirmation each phase.
- **Claude (reviewer/architect):** plans, reviews every commit via git-object reads
  (`git show <sha>` from the main checkout — NEVER run commands inside the agent's worktree
  while it's active), writes findings to **`M1_5_REVIEW_FINDINGS.md`** (M1.5 legacy findings)
  or **`TRAVEL_TIME_REVIEW_FINDINGS.md`** (travel tool findings), commits docs to
  **`D:\Learning\krishna`** on **`main`** (was `feature/local-first-p1`; that branch is
  archived), pushes (safe — releases only fire on `v*` tags). Claude edits app code ONLY when
  Vikram explicitly says so.
- **Mobile review variant:** when Vikram is out, he runs a Claude Code mobile session with a
  prompt Claude drafts (sha + spec section + "output in chat only, do NOT push"); desktop
  Claude verifies mobile's findings against the diff before merging (worked: caught P6-F1).

## Repo map (updated 2026-07-03 — main is now the hub)
- `D:\Learning\krishna` = main checkout, branch **`main`** (docs/findings consolidated hub;
  `feature/local-first-p1` archived).
- `D:\Learning\krishna-m15` = agent worktree, branch **`feature/m1-5-voice`** (all agent code).
  Also has `fix/travel-t4` branch with T4 fix commits.
- Other worktrees exist (`krishna-agent`, `krishna-agent2`) — other tracks, untouched.
- Remote: github.com/Life2death/krishna — `main` and `feature/m1-5-voice` pushed and current.

## 1) Architecture v2 (owner-confirmed via Q&A)
`ARCHITECTURE_V2_PLAN.md`: desktop stays local-first (unchanged); cloud = Turso sync hub +
**tiny always-on worker** (reminders/push/command relay, NO chat path); **mobile =
conversation-only voice terminal** (one tap-to-talk screen, no tabs). Milestone plan docs
all in repo root, all pushed:
- `M1_MOBILE_IMPLEMENTATION_PLAN.md` (conversation-only Android v1; T1 = on-device STT/TTS
  spike decides a possible Kotlin bridge)
- `M2_REMINDERS_TASKS_PLAN.md` (reminders ~70% pre-built; adds tasks table, OS
  notifications, fired-at dedup)
- `M3_CLOUD_WORKER_PUSH_PLAN.md` (~200-line Fly worker, FCM data-only push, claim contract)
- `M4_COMMAND_RELAY_PLAN.md` (encrypted commands table, desktop executes via confirm gate)
- `M1_5_VOICE_PERSONA_LATENCY_PLAN.md` + `M1_5_PHASE3_SPEC.md` (phases; P3 spec kept for
  future)
- builder-os assessed: use its `build-loop-claude-code` skill for the agent if desired;
  in-product skills idea maps to the existing `skills` table (later).

## 2) M1.5 execution history (all commits on feature/m1-5-voice)
- **P0** instrumentation `27d6506` — TurnTiming + dev-space LatencyPanel.
- **P1** persona etiquette `02ac7a1` + fixes `236d1fb` (honorific as setting, narrow
  updateCommandTiming).
- **P2** canned instant replies + filler `c303e7b` + fixes `19e29a5`/`38be5de`/`dc53d74`
  (anchored patterns after the substring-hijack blocker; vitest config restored).
- **P3 DEFERRED by decision** — transport streams at ~10ms/token; sentence-TTS would save
  ~200ms vs ~2s TTFT. Spec retained.
- **P4** prompt caching `4f2e9e8` + fixes `7fe1b6b`/`be4bad8`/`76a7313`/`b34e4f4`/`5b9f47d`
  — stable/volatile split, cache_control on claude template, device TZ, usage capture,
  filler threshold 1500ms + await. **Decision: Anthropic cache stays dormant** (stable
  prefix ~1700 tokens < 2048 min; don't fatten; infra kept). Pre-warm deferred.
- **P6** `9b5cf12` + fixes `bbd1bf0`/`69dea23` — maxOutputTokens voice cap (override-never-
  inject), voiceModel override (voice path only), Honorific + VoiceModel + VoiceMaxTokens
  Settings fields.
- **Brevity hardening `348f2e0` (Claude-authored, owner-authorized):** few-shot example in
  etiquette, final rule 11 (spoken brevity absolute), cap 100→160 (a 100 cap could truncate
  plan JSON — P6-F5), no-raw-URLs clause restored.
  ⚠️ **REVERTED by `fca491a`** (owner request; later traced to duplicate `krishna.exe`
  instance, not the commit). Brief hardening undone, cap back to 100, P6-N4 re-regressed.
- Findings ledger: `M1_5_REVIEW_FINDINGS.md` (P0-F1…P6-N4; every BLOCKER fixed & verified).
  Pattern: nearly every agent phase shipped one blocker; review caught all of them.
  **Branch model updated:** findings now split — `M1_5_REVIEW_FINDINGS.md` for M1.5 legacy,
  `TRAVEL_TIME_REVIEW_FINDINGS.md` for travel tool track. Both committed to `main` (was
  `feature/local-first-p1`).

## 3) Live-test results (owner's laptop, Haiku as provider model)
- Baseline (Sonnet): time-to-first-word ~2.1–2.5s (TTFT-dominated), TTS 15–45s monologues.
- **Haiku A/B: Send→1st ~1.0–1.3s vs Sonnet 2.0–5.7s — Haiku halves TTFT**, recommended for
  voice. Vikram's provider MODEL is currently `claude-haiku-4-5` (was already set).
- Canned path: bare greetings answer <500ms offline. Persona/"sir"/ack-then-act confirmed.
- Cache column works (shows 0/0 = correctly dormant).
- After 69dea23: simple questions brief (7.6s TTS) but broad ones still 27–30s → hence
  `348f2e0` (since **REVERTED** — P6-F5 cap risk is back; see `P6-F5` in findings).

## 4) Maps / travel tool — v1 COMPLETE (pending T1-F4 fix + T4 retest)

**Plan doc:** `TRAVEL_TIME_TOOL_PLAN.md`. **Findings:** `TRAVEL_TIME_REVIEW_FINDINGS.md`.
**Branch:** `feature/m1-5-voice` (agent code), `fix/travel-t4` (T4 fixes).

**v1 = Google Routes ONLY, English only** (owner decision 2026-07-03). Ola is DOCUMENTED and
key-obtained but is a **future user-invoked "second opinion" check only** — never a fallback.

**T1–T3: BUILT & REVIEWED (commits `d598051` / `50e3dce` / `80dbc7a` / `1922f38`).**
- Google Routes v2 adapter (`computeRoutes`, traffic-aware, DRIVE/TWO_WHEELER/TRANSIT).
- Place resolution (memories → exact match → noise-stripped → raw text pass-through).
- Prompt wiring + action vocabulary + ask-once-then-remember for unknown places.
- Settings UI Maps API key field (`secure_set`/`secure_get` — app's real secure store).
- Read-only tool (no confirmation gate, `KNOWN_SAFE`). All review findings fixed.

**T4 (live acceptance): FIRST ATTEMPT FAILED.** 3 fixes applied, then T1-F4/T2-N2/T4-N1 all
fixed same night (see "Latest updates" at top). **Only remaining open item:**
- **T4-F2 · NEEDS-REPRO:** Hard crash `exit 0xcfffffff`. Audit found 0 panics in network
  paths; suspect audio/speaker Rust code. Owner re-test + share `krishna-crash.txt` if recur.

**Key changes from earlier assumptions in this file:**
- Google key: **regenerated** (was exposed in chat), **re-vaulted** in app's `secure_set`
  (not Windows PasswordVault). The `secure_set`/`secure_get` Tauri commands use an
  **AES-256-GCM-encrypted blob** (`secure_storage.enc`) in app-data — not Credential Manager.
- Ola key: **obtained and probe-tested** (2026-07-03). Unused by v1.
- `TRAVEL_TIME_TOOL_PLAN.md` updated to reflect the Google-only scope.

## 5) Parked / other
- `ORNITH_INTEGRATION_PLAN.md`: PARKED — laptop (Ryzen 3 3200U, Vega 3, 18GB, no dGPU)
  cannot run local LLMs; unblock = discrete GPU ≥12GB. Mode A (tiered coding agent) trial
  design inside.
- Owner laptop specs recorded above (relevant to any "run local model" idea).
- Agent quality note: free flash-tier model → expect a blocker per phase; review pipeline
  absorbs it; suggest stronger model if a phase loops.

## PENDING (rewritten night of 2026-07-03 — T1-F4/T2-N2/T4-N1 are done, see top of file)
1. **Owner T4 live retest — NEXT ACTION, no code work queued until this happens.** Rebuild
   needed (Rust capabilities changed): `npm run tauri dev` in `krishna-m15` → "remember my
   home address is X" / "remember my work address is Y" → "how long to work?" (expect spoken
   time + traffic + one alternative) → try "by bike" / "by train" → watch for the `exit
   0xcfffffff` crash (T4-F2) — if it recurs, grab `krishna-crash.txt` immediately, that's the
   repro that's been missing. Pass ⇒ travel tool v1 is DONE.
2. **T4-F2 crash fix** — blocked on the repro from #1. Nothing to build yet.
3. **T3-N2 / T3-N1** — low-priority NITs (missing test file; a downgraded non-issue). Fold in
   whenever convenient, not urgent.
4. **P6-F4 (needs repro):** TTS occasionally too fast to understand — capture turn,
   transcript, and whether a filler played just before. Also parked.
5. **Other open NITs (fold into future commits):** P6-N4 (no-raw-URL clause — regressed by
   `fca491a` revert of `348f2e0`), P0-F3 (STT stage unmeasured), P1-F5 (seed edits inert on
   existing installs).
6. **After travel v1 closes, next item off the queue** (owner's pick from
   `pendingitems03july.md` / `session-status-2026-07-03` memory): Phase 4a Gmail-local
   (`GMAIL_MCP_LOCAL_PHASE4_PLAN.md`), network resilience (`NETWORK_RESILIENCE_PLAN.md`), or
   voice-ID P3/P4 (`VOICE_ID_STATUS_METER_PLAN.md`) — all three plans are written and ready.
7. **Bigger roadmap (further out):** M1 mobile (conversation-only Android) → M2
   (reminders/tasks) → M3 (cloud worker/push) → M4 (command relay). Phase 5 (language
   matching) of M1.5 still unbuilt — schedule with M1 mobile since it touches the same TTS
   voice selection. Travel tool already built; add read-only `travel_time` to M1 mobile
   safe-list when M1 lands.

## How to resume (for a fresh Claude session)
Read this file (the "Latest updates" section at the top is authoritative for status) +
`TRAVEL_TIME_REVIEW_FINDINGS.md` + `M1_5_REVIEW_FINDINGS.md`. Branch model: **`main`** is the
single consolidated hub (`feature/local-first-p1` and `feature/m1-5-voice` are archived —
don't build on them). Agent work happens in `D:\Learning\krishna-m15`, currently on branch
`fix/travel-t4` (tip should be `bd644cf` unless the agent has moved further). Check
`git log --oneline fix/travel-t4 -5` for anything new; review via `git show` (never run
commands inside the agent worktree while it's active — `git status`/`git log` are the safe
read-only exceptions used throughout this session); update findings files; **commit locally
to `main` from `D:\Learning\krishna` — do NOT push** unless Vikram explicitly says to (see
"Push policy" above). If Vikram pastes a test table: newest rows at the top; the travel T4
table has its own column format (see `TRAVEL_TIME_REVIEW_FINDINGS.md` for the latest).
