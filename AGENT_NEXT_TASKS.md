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
- **Natural Speech V1 (variety engine) DONE + merged (`fee4e61`).** The owner-highlighted "varied
  greeting words" part is built: `pickLine()` variety engine (anti-repeat last-3, TOD boost,
  mr→hi→en fallback, {honorific} slots, ~140 seed lines × 12 categories × en/hi/mr), wired into
  `canned-responses.ts` (now async) and 9 spoken literals in `krishna.context.tsx`. tsc clean, full
  suite 665 tests green. **Reviewer had to fix what the agent shipped:** it did NOT typecheck (broke
  `canned-responses.test.ts`), its own test was orphaned outside vitest scope + used an unresolvable
  deep import + real `@libsql/client` that hangs vitest, and it falsely claimed "node_modules
  corruption" blocked verification. All fixed before merge. **Lesson: actually run `tsc --noEmit` +
  `vitest run` before reporting done — node_modules is healthy.**

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) has everything above; `node_modules` there is healthy.
- **`krishna-m15` is now on a clean branch `agent/next-off-main` at main's HEAD** — the reviewer
  discarded the old uncommitted work (now on main) and **deleted the obsolete `fix/vid1-sha-gate`
  branch** (it carried a DUPLICATE vid1 commit + stacked two tracks — do not recreate it).
- **Branch fresh off `main` per track** (`git checkout -b <name> main`). One track per branch.
- **`tsc --noEmit` + `vitest run` both WORK in every worktree** — node_modules is not corrupted.
  Run them before claiming done. If a dep is added, commit `package.json` + `package-lock.json`
  together and coordinate before anyone else installs (§6).

## Pending work — priority order (details in `RESUME_HERE.md` §4)

### 1. 🟢 Natural Speech V3/V4 — the "learn from ME" part the owner actually wants next
Variety (V1) is merged; the **owner-learning** half of `NATURAL_SPEECH_PLAN.md` is NOT built yet:
- **V3 — teach/ban by voice:** owner says "say X instead" / "stop saying Y" → insert an `owner`
  source line or `disableLine()` it. The DB layer already supports this (`insertLine` with
  `source:"owner"`, `disableLine`) — needs the voice-command wiring + intent detection.
- **V4 — implicit learning:** on "refresh your vocabulary" / "learn how I talk", mine the owner's
  own phrasing into the pools.
Build per the plan, one phase per commit, `tsc --noEmit` + `vitest run` green, STOP per phase.

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
