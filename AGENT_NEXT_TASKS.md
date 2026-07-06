# Agent — next tasks (written by reviewer, 2026-07-06)

> Read `RESUME_HERE.md` §4/§5/§6/§7 in full first. This file is the short "start here" for the
> coding agent: what just landed, the current worktree state, and what to build next.

## What just landed on `main` (do NOT redo)
- **VID-1 is DONE + merged to `main` (`236cba8`).** WavLM voice-ID model now bundled locally
  under `public/models/` (gitignored, SHA-verified ~97 MiB), fetched build-time by
  `scripts/fetch-voiceid-model.ts`; `predev`/`prebuild` run it automatically; `embedding.ts`
  loads locally with a remote fallback. Reviewer verified: tsc clean, 658/658 tests, full
  `tauri dev` built + launched, zero huggingface.co requests at startup.

## ⚠️ Worktree state — read before you touch anything
- The reviewer built + verified VID-1 in the `krishna-m15` worktree, then **repaired a polluted
  `package.json` + `package-lock.json` + reinstalled `node_modules` there** (the agent's earlier
  `npm install` had added ~8 phantom transitive deps incl. the CI-breaking
  `lightningcss-win32-x64-msvc`, silently bumped vite/vitest, and broke the lightningcss native
  module so Vite wouldn't start). The clean version is what got merged to `main`.
- The reviewer then applied the same VID-1 change directly on the `main` checkout
  (`D:\Learning\krishna`), ran `npm install` there (healthy tree), and committed.
- **`krishna-m15` still has the old uncommitted VID-1 changes on `feat/job-autopilot`** — they are
  now redundant (superseded by `236cba8` on main). Before starting new work: reset that worktree
  (`git checkout -- . && git clean -fd -e node_modules -e public/models` in `krishna-m15`), then
  **branch fresh off `main`** for your next task (`git checkout -b <name> main`). Do NOT stack new
  work on `feat/job-autopilot`.
- **§6 node_modules rule still applies:** only one party touches node_modules/builds at a time. If
  your next phase adds a dep, commit `package.json` + `package-lock.json` together and confirm
  before anyone else installs/builds.

## Pending work — priority order (details in `RESUME_HERE.md` §4)

### 1. 🟢 Natural speech V1 — OWNER-HIGHLIGHTED, recommended next build
`NATURAL_SPEECH_PLAN.md`, branch `feat/natural-speech`. **This is the "learn from me and create
varied greeting words" feature the owner asked about on 2026-07-06** — it already has a full spec:
- A **variety engine**: anti-repeat pools for greeting/thanks/filler/wake-ack etc. (today
  `canned-responses.ts` uses tiny pools + plain `Math.random()` that can repeat the same line
  twice in a row; `src/lib/seed-personas.ts` + `canned-responses.ts` are the seams).
- **V3 — teach/ban by voice:** owner explicitly adds or forbids words/lines.
- **V4 — implicit learning:** on "refresh your vocabulary" / "learn how I talk", mine the owner's
  own phrasing into the pools.
- Multi-language (en full; hi/mr at least for greeting/thanks/filler).
Build per the plan's phased order, one phase per commit, `tsc --noEmit` + `vitest run` green, STOP
per phase and report. Owner wants this — start here unless he says otherwise.

### 2. 🟢 Window control (move/focus windows across monitors by voice)
`WINDOW_CONTROL_PLAN.md`. Win32 via the `windows` crate; extends `src-tauri/src/automation.rs`,
replaces the `computer_focus_window` stub. Gated on the existing Computer Control toggle.
Windows-only v1. Three phases (enumerate+match → commands → voice tool). Adds a Rust dep — commit
`Cargo.toml`+`Cargo.lock` together.

### 3. 🟢 Naukri saved searches + Chrome profiles
`NAUKRI_SEARCH_PROFILES_PLAN.md`. N1 (saved-search store) → N2 (Settings UI + Chrome-profile
picker) → N3 (launch + voice tool) are all unblocked. **N4** (profile-aware assisted apply =
J4b-Naukri) is **blocked on the D4 owner decision** in that plan (one shared ApplicationProfile +
per-search resume override — recommended — vs three per-role profiles). Do N1–N3; do not start N4
until the owner answers D4.

### 4. 🟡 Smaller queued items (see `RESUME_HERE.md` §4 / findings docs)
- **JC-1** — `job_apply_submit` fires the "applied" status POST unconditionally; gate it on
  `verification.success` (`JOB_AUTOPILOT_REVIEW_FINDINGS.md`). Fix this BEFORE porting to Naukri so
  the bug isn't copied into N4.
- **J3-A test** — unit test for the resume file-picker wiring (mock `@tauri-apps/plugin-dialog`).
- **VID-1 fetch-script hardening** — SHA-gate the skip-if-exists path
  (`scripts/fetch-voiceid-model.ts:141`) so an interrupted partial download can't be skipped
  unverified.

## Owner action still open (not agent work)
Live mic-test of VID-1: speak to Krishna once, confirm the model loads fast with no re-download
after a `Ctrl+R`, and capture one `[voice-id] verify: score=… threshold=… match=…` console line —
that both closes VID-1 and gives the number needed to fix **VID-2** (meter stuck at 5 samples).
