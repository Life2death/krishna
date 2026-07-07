# Agent — next tasks (written by reviewer, 2026-07-07 — updated post-review, evening)

## 🔴 REVIEW VERDICT on the 2026-07-07 afternoon session (Step 1 + N1-N3 + live-transcript P1-P3)
1. **`fix/window-control-wiring` (175781c)** — correct base (`3296a84`), content matches the
   reviewer's diff. ✅ Mergeable after cargo test is verified (the report claimed only tsc+vitest —
   the commit touches `automation.rs`; run `cargo test` before merge).
2. **`feat/naukri-searches` (N1-N3)** — correct base (`3296a84`). ✅ Plausible, BUT it does NOT
   contain 175781c and both branches add cases to `src/lib/actions.ts` — merge the fix branch
   FIRST, then resolve naukri on top. Also started before the owner confirmed the window-control
   live retest (spec said wait) — content stands, process violation noted.
3. **`feat/live-transcript` (P1-P3) — 🔴 REBUILD REQUIRED.** Branched off **`origin/main`
   (`1141061`) — ~121 commits stale** (predates job-autopilot J4, Natural Speech V1-V4, VID-1,
   window control, turn-timing instrumentation). The "464 tests green" claim is the OLD suite's
   size — it proves the wrong base, not health. Do NOT merge. Rebuild: fresh branch off local
   `main` after the two merges above; the component (`LiveTranscript.tsx`), fence-strip helper,
   and tests are likely portable; the `krishna.context.tsx` wiring must be redone against the
   current stream loop (which now contains turn-timing marks + filler logic).
4. **🔴 THREE branches pushed to origin** (incl. `fix/window-control-wiring`, unmentioned in the
   report) — [[no-push-release-pipeline]] violation. Each fired `release.yml`; all failed in 0s
   (benign gate, nothing released — verified via `gh run list`). Owner decides whether to
   `git push origin --delete` the three remote branches. **Never push. Never branch from
   `origin/main` — always local `main`.**

## Queue (revised order)
1. Reviewer merges `fix/window-control-wiring` → owner live-retests Teams focus.
2. Merge/resolve `feat/naukri-searches`; owner live-tests N2/N3.
3. Rebuild `feat/live-transcript` off current main (see #3 above).
4. **NEW: `LATENCY_FIRST_WORD_PLAN.md`** (design-complete 2026-07-07) — sentence-streaming speech
   (L1), EL streaming endpoint (L2), end-of-speech earcon+filler (L3), STT watchdog (L4), panel
   column fix (L5). Owner priority: he asked for first-word-ASAP explicitly.

> Read `RESUME_HERE.md` §4/§5/§6/§7 in full first. This file is the short "start here" for the
> coding agent: what just landed, the current worktree state, and what to build next.

## What just landed on `main` (do NOT redo)
- **VID-1 is DONE + merged (`236cba8`).** WavLM voice-ID model bundled locally under
  `public/models/` (gitignored, SHA-verified ~97 MiB); `predev`/`prebuild` fetch it; `embedding.ts`
  loads locally with a remote fallback. Verified: tsc clean, tests green, full `tauri dev` built +
  launched, zero huggingface.co requests at startup.
- **VID-1 SHA-gate follow-up DONE + merged (`4e0ac79`).** The fetch skip-path now SHA-verifies the
  existing ONNX and re-downloads on mismatch (was: any non-empty file silently accepted).
- **Natural Speech V1–V4 — the ENTIRE plan — DONE + merged (`fee4e61`, `875d7a4`, `c508e18`,
  `11df913`, `52d5dfa`).** This is fully finished, do not re-open `NATURAL_SPEECH_PLAN.md` as a
  task. V1 variety engine (`pickLine()`, ~140 seed lines), V2 LLM-prompt variety + last-acks
  anti-repeat injection, V3 `speech_ban`/`speech_teach` voice actions + Settings "Voice & Phrases"
  page, V4 `speech_refresh` vocabulary-mining from the owner's own conversation history — all live.
  tsc clean, full suite 692 tests green. **Reviewer had to fix real bugs in BOTH the V1 submission
  and the V2-V4 submission before merging either:**
  - V1: didn't typecheck (broke `canned-responses.test.ts`), its test was orphaned outside vitest
    scope + used an unresolvable deep import + a real `@libsql/client` that hangs vitest, and it
    falsely claimed "node_modules corruption" blocked verification.
  - V2-V4 (this round's verification claim was actually honest — tsc/tests really did pass — but
    4 real bugs slipped through with no test coverage): `speech_ban` silently did nothing when the
    banned phrase didn't match an existing seeded line (the common case) while still telling the
    owner "I'll keep it in mind" — fixed with a new persistent `banned_phrases` table; `speech_refresh`'s
    spoken reply promised 'say "accept them"' but no voice action implemented it anywhere — fixed
    with a real `speech_accept_vocabulary` action; the honorific-slot quality check accepted a
    hardcoded "sir"/"boss" substring as equivalent to the `{honorific}` template, risking a
    permanently-wrong-honorific approved line — tightened; and all of V4's quality-filter logic had
    zero tests despite "678 tests pass" being reported — 14 tests added.
  - **Lesson, twice now:** passing typecheck/tests is necessary but not sufficient — a spoken reply
    that promises a capability must be traced to a real implementation, and a DB write that claims
    to persist something must actually be verified to persist it, including the empty/no-match case.
- **Window Control — the ENTIRE plan — DONE + merged (`0b171c8`, `32b3da1`, `47fe8c4`,
  `3296a84`).** All 3 phases per `WINDOW_CONTROL_PLAN.md`: P1 Win32 enumeration + pure
  `match_window()` matcher (11 tests), P2 Tauri commands replacing the `computer_focus_window`
  stub (`window_move`, `window_list_summary`), P3 `control_window` LLM tool + voice wiring (8
  tests). Same-day review-fix commit (`3296a84`) caught two real bugs on the default invocation
  path: `parse_monitor("next", …)` was hardcoded to index 1 (would panic on a single-monitor
  machine, never truly cycled on 3+) — now computes the actual current monitor and cycles
  relative to it; `window_move`'s maximize arg defaulted to `true` unconditionally — now defaults
  to the window's actual current maximized state. 6 more tests added for `parse_monitor`.
  Reverified 2026-07-07: `tsc --noEmit` clean, `vitest run` 700/700, `cargo test` (automation
  module) 17/17 — matches the fix commit's own numbers.
  **⚠️ BUT the first owner live test (2026-07-07) FAILED — "bring Teams to the front" did nothing
  while Krishna falsely said it worked.** Three defects the isolated P3 tests missed, all now fixed
  in `D:\Learning\krishna` but **UNCOMMITTED — commit these (branch off `main`) before anything else**:
  (1) `control_window`/all `computer_*` tools imported into `packages/core/tools/index.ts` but never
  `register()`-ed → `getTool()` returned undefined; (2) **root cause** — `control_window` was never
  wired into the `action` path: no `parseActions`/`executeAction` case, so the LLM's
  `{"action":"control_window",…}` block was silently dropped (audit_log had zero `control_window`
  rows — proof it never ran); added the `Action` type + a non-confirm-gated `executeAction` handler
  (`kind:"status"`) + a concrete `WINDOW CONTROL` system-prompt example; (3) `focus_hwnd` in
  `automation.rs` returned `Ok` unconditionally and used the weak Alt-nudge → now `AttachThreadInput`
  activation that **verifies via `GetForegroundWindow`** and returns a real error on failure. New
  tests drive the real registry + parse→execute seams (not the tool object in isolation — the §6 gap
  that let this ship). TS layer is HMR-live; Rust layer needs the dev app rebuilt. Owner live-test
  still pending.

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) has everything above; `node_modules` there is healthy.
- **`krishna-m15` is on branch `agent/next-off-main`; fast-forward it to main's exact HEAD
  (`3296a84`)** before branching off for new work. Branches deleted post-merge along the way
  (`fix/vid1-sha-gate`, `feat/natural-speech-v2`, and the window-control feature branch) — do not
  recreate any of them.
- **Branch fresh off `main` per track** (`git checkout -b <name> main`). One track per branch.
- **`tsc --noEmit` + `vitest run` both WORK in every worktree** — node_modules is not corrupted.
  Run them before claiming done. If a dep is added, commit `package.json` + `package-lock.json`
  together and coordinate before anyone else installs (§6).

## Pending work — priority order (details in `RESUME_HERE.md` §4)

### 1. 🟢 Naukri saved searches + Chrome profiles
`NAUKRI_SEARCH_PROFILES_PLAN.md`. N1 (saved-search store) → N2 (Settings UI + Chrome-profile
picker) → N3 (launch + voice tool) are all unblocked. **N4** (profile-aware assisted apply =
J4b-Naukri) is **blocked on the D4 owner decision** in that plan (one shared ApplicationProfile +
per-search resume override — recommended — vs three per-role profiles). Do N1–N3; do not start N4
until the owner answers D4. **Now the top unblocked coding item** — Window control (formerly #1
here) is done, see above.

### 2. 🟢 Live transcript panel
`LIVE_TRANSCRIPT_PANEL_PLAN.md` (design-complete, 2026-07-07). Real-time panel: current utterance +
Krishna's reply **streaming token-by-token** + live status — the owner asked for it. The core hook
already exists (reply is streamed at `src/contexts/krishna.context.tsx:1866-1891`, deltas only
accumulated into `fullResponse`, never surfaced). v1 = **inline** panel reading `useKrishna()`
directly (a separate window would need a per-token Tauri event bridge — the `KrishnaProvider` is
main-window-only). Phases: P1 surface `streamingReply` (+ strip `action`/`plan` fences so no JSON
flashes) → P2 `LiveTranscript.tsx` → P3 bar toggle + `resizeWindow`. **Live word-by-word STT is
OUT of v1** (needs a streaming STT provider — file `LIVE_STT_STREAMING` as a follow-up, don't fake
partials). Owner decisions D1 (inline vs window) / D2 (toggle default) noted in the plan — D1
recommends inline; proceed on inline unless the owner says otherwise.

### 3. 🟡 Smaller queued items (see `RESUME_HERE.md` §4 / findings docs)
- **JC-1** — `job_apply_submit` fires the "applied" status POST unconditionally; gate it on
  `verification.success` (`JOB_AUTOPILOT_REVIEW_FINDINGS.md`). Fix this BEFORE porting to Naukri so
  the bug isn't copied into N4.
- **J3-A test** — unit test for the resume file-picker wiring (mock `@tauri-apps/plugin-dialog`).

## Owner action still open (not agent work)
- Live mic-test of VID-1: speak to Krishna once, confirm the model loads fast with no re-download
  after a `Ctrl+R`, and capture one `[voice-id] verify: score=… threshold=… match=…` console line —
  that both closes VID-1 and gives the number needed to fix **VID-2** (meter stuck at 5 samples).
- Live-test Window Control (new, this update): "move Chrome to the other monitor", "bring File
  Explorer to the front", a query that matches nothing, and Computer Control toggled off. Full
  acceptance script in `RESUME_HERE.md` §2 item 1 / `WINDOW_CONTROL_PLAN.md`'s "Acceptance" section.
