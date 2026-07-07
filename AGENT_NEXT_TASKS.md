# Agent — next tasks (written by reviewer, 2026-07-07 — updated evening, both merges landed)

## ✅ Both branches from the afternoon session are MERGED to `main`
1. **`fix/window-control-wiring`** merged as `22c6168`. `cargo test` (automation module) verified
   green by the reviewer before merge — do not redo.
2. **`feat/naukri-searches` (N1-N3)** — rebased onto `e14c10d` by the agent, one review round (a
   rebase conflict left the `Action` type union malformed — caught by `tsc`, NOT `vitest`; fixed
   in `5346d4d`), then merged as `669c6ce`. `tsc`/`vitest` (731/731)/`cargo test` all independently
   reverified green by the reviewer before merge. Non-blocking follow-ups filed for
   `chrome_profiles.rs` (see `RESUME_HERE.md` §4 item 1) — not urgent, pick up opportunistically.
3. **`feat/live-transcript` (P1-P3) is still UNMERGED and NOT to be touched** — it was built on
   `origin/main` (121 commits stale) and must be rebuilt from scratch. See the queue below for
   when.
4. **Three branches were pushed to origin in error** (incl. `fix/window-control-wiring`) —
   [[no-push-release-pipeline]] violation, `release.yml` fired 3x and failed in 0s each time
   (benign, nothing released). **Never push, ever, any branch. Never branch from `origin/main` —
   always local `main`.** This is now the second time this class of mistake has happened; treat it
   as a hard rule with zero exceptions, not a judgment call.
5. **🔴 Separate incident, now resolved:** `D:\Learning\krishna`'s `.git\config` was found with
   `core.bare = true` (blocking every git command in both the main checkout and `krishna-m15` —
   worktrees share the parent's `core.*` config). Fixed by the reviewer (`git config core.bare
   false`). If you ever see "this operation must be run in a work tree" from a command that should
   obviously work, check `git config --get core.bare` first before assuming something else broke.

## Queue (revised order — owner explicitly reordered this on 2026-07-07 evening)
1. **`LATENCY_FIRST_WORD_PLAN.md` — build this NOW, first.** Owner's explicit priority: "I want
   Krishna to speak the 1st word ASAP." Branch `feat/first-word-latency` off current local `main`
   (both merges above are already in it). L1 (sentence-streaming speech) → L2 (EL streaming
   endpoint) → L3 (end-of-speech earcon + earlier filler) → L4 (STT watchdog+retry) → L5 (latency
   panel column-label fix). Read the plan's own sequencing note at the top — it explains why this
   goes before item 2 below (both touch the same `krishna.context.tsx` stream loop; doing them
   serially avoids a two-branches-one-seam conflict).
2. **Rebuild `feat/live-transcript` — only after item 1 merges.** Fresh branch off local `main`
   (post-latency-merge). Re-read `LIVE_TRANSCRIPT_PANEL_PLAN.md`'s Phase 1 at that point — it has
   an updated note explaining Phase 1 changes once L1 exists (reuse L1's sentence/fence utilities
   from `src/lib/sentence-stream.ts` instead of writing a second fence parser).

> Read `RESUME_HERE.md` §4/§5/§6/§7 in full first. This file is the short "start here" for the
> coding agent: what just landed, the current worktree state, and what to build next.

## Everything else already on `main` (do NOT redo — full history in `RESUME_HERE.md` §3/§3a/§5)
- VID-1 (bundled WavLM model + SHA-gate) — done, merged.
- Natural Speech V1–V4 (variety engine, prompt variety, ban/teach actions, vocabulary refresh) —
  done, merged.
- Window Control + Naukri N1-N3 — see the "✅ Both branches" section above.

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) is at `e14c10d`+ (both merges above); `node_modules` healthy.
- **`krishna-m15`** should be fast-forwarded to main's current HEAD before branching off for new
  work (`git fetch main-checkout && git checkout main && git merge --ff-only main-checkout/main`,
  or simplest: `git checkout -b <name> main` directly names main's current tip regardless of what
  branch `krishna-m15` was last left on).
- **Branch fresh off LOCAL `main` per track** (`git checkout -b <name> main`). One track per
  branch. **Never `origin/main`** — see item 4 above.
- `tsc --noEmit` + `vitest run` + (`cargo test` when Rust changes) all green before every commit —
  run all of them, not just the fast ones. `tsc` catches things `vitest` doesn't (see item 2 above).

## Smaller queued items (not urgent, pick up opportunistically — see `RESUME_HERE.md` §4 / findings docs)
- **JC-1** — `job_apply_submit` fires the "applied" status POST unconditionally; gate it on
  `verification.success` (`JOB_AUTOPILOT_REVIEW_FINDINGS.md`).
- **J3-A test** — unit test for the resume file-picker wiring (mock `@tauri-apps/plugin-dialog`).
- **`chrome_profiles.rs` follow-ups** — hardcoded `chrome.exe` path should use `%LOCALAPPDATA%`;
  `open_in_chrome_profile`'s URL check is a weak prefix match (low risk, N1's store-side check is
  the real gate); macOS/Linux `get_default_user_data_dir` has a latent type mismatch (dead code on
  Windows).

## Owner action still open (not agent work)
- Live mic-test of VID-1: speak to Krishna once, confirm the model loads fast with no re-download
  after a `Ctrl+R`, and capture one `[voice-id] verify: score=… threshold=… match=…` console line —
  that both closes VID-1 and gives the number needed to fix **VID-2** (meter stuck at 5 samples).
- Live-test Window Control (merged `22c6168`): "move Chrome to the other monitor", "bring File
  Explorer/Teams to the front", a query that matches nothing, Computer Control toggled off.
- Live-test Naukri N2/N3 (merged `669c6ce`): Settings → Naukri Searches UI + Chrome profile picker,
  and the `open_saved_search` voice command.
