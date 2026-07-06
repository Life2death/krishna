# Agent — next tasks (written by reviewer, 2026-07-06)

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

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) has everything above; `node_modules` there is healthy.
- **`krishna-m15` is on branch `agent/next-off-main`, fast-forwarded to main's exact HEAD
  (`52d5dfa`)** after each merge. Two branches have been deleted post-merge along the way
  (`fix/vid1-sha-gate`, `feat/natural-speech-v2`) — do not recreate either.
- **Branch fresh off `main` per track** (`git checkout -b <name> main`). One track per branch.
- **`tsc --noEmit` + `vitest run` both WORK in every worktree** — node_modules is not corrupted.
  Run them before claiming done. If a dep is added, commit `package.json` + `package-lock.json`
  together and coordinate before anyone else installs (§6).

## Pending work — priority order (details in `RESUME_HERE.md` §4)

### 1. 🟢 Window control (move/focus windows across monitors by voice)
`WINDOW_CONTROL_PLAN.md`. Win32 via the `windows` crate; extends `src-tauri/src/automation.rs`,
replaces the `computer_focus_window` stub. Gated on the existing Computer Control toggle.
Windows-only v1. Three phases (enumerate+match → commands → voice tool). Adds a Rust dep — commit
`Cargo.toml`+`Cargo.lock` together.

### 2. 🟢 Naukri saved searches + Chrome profiles
`NAUKRI_SEARCH_PROFILES_PLAN.md`. N1 (saved-search store) → N2 (Settings UI + Chrome-profile
picker) → N3 (launch + voice tool) are all unblocked. **N4** (profile-aware assisted apply =
J4b-Naukri) is **blocked on the D4 owner decision** in that plan (one shared ApplicationProfile +
per-search resume override — recommended — vs three per-role profiles). Do N1–N3; do not start N4
until the owner answers D4.

### 3. 🟡 Smaller queued items (see `RESUME_HERE.md` §4 / findings docs)
- **JC-1** — `job_apply_submit` fires the "applied" status POST unconditionally; gate it on
  `verification.success` (`JOB_AUTOPILOT_REVIEW_FINDINGS.md`). Fix this BEFORE porting to Naukri so
  the bug isn't copied into N4.
- **J3-A test** — unit test for the resume file-picker wiring (mock `@tauri-apps/plugin-dialog`).

## Owner action still open (not agent work)
Live mic-test of VID-1: speak to Krishna once, confirm the model loads fast with no re-download
after a `Ctrl+R`, and capture one `[voice-id] verify: score=… threshold=… match=…` console line —
that both closes VID-1 and gives the number needed to fix **VID-2** (meter stuck at 5 samples).
