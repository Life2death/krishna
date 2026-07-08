# Agent — next tasks (written by reviewer, 2026-07-08 — L1+L2 latency merged)

## ✅ Latency L2 merged (`508a5ec`) — three review rounds, all real, all fixed
1. **`feat/first-word-latency-l2`** merged as `508a5ec`. ElevenLabs streaming endpoint (MSE) —
   speaks the first chunk as it arrives instead of waiting for full synthesis. Review found and
   fixed: (1) `audio.play().catch(() => {})` silently swallowed play() rejections — a genuine
   regression vs. the pre-L2 code, could permanently hang the whole `SpeechQueue`; (2) a
   `mediaSource.addEventListener("sourceerror", ...)` listener for an event that doesn't exist in
   the MediaSource spec (dead code, no timeout fallback); (3) fixing #1 hit a real TypeScript
   closure-narrowing limitation requiring an explicit type assertion (not just `?.()`). `tsc`/
   `vitest` (783/783) independently reverified by the reviewer after **each** round — one round's
   "tsc clean" self-report did not hold up on independent re-check. See `RESUME_HERE.md` §4 item 5
   for the full writeup.
2. **Workflow incident during L2 — fully resolved, read once, don't repeat.** Your previous
   session ran the branch cleanup + initial L2 commit directly inside `D:\Learning\krishna` (the
   reviewer's checkout) instead of a `krishna-m15` worktree — nothing was lost, but `krishna-m15`
   got deregistered as a worktree and went orphaned+locked, so follow-up work happened from a
   temporary `D:\Learning\krishna-m15-l2` (with a `node_modules` junction back to the reviewer's —
   the exact shared-resource hazard [[one-party-npm-install-rule]] warns about, harmless this time
   only because `package.json` never diverged). **Everything is now cleaned up:** `krishna-m15-l2`
   is gone (branch deleted, directory removed), and `krishna-m15` has been recreated as a proper,
   independent worktree on branch `feat/first-word-latency-l3` off current `main`. **Never operate
   in `D:\Learning\krishna` — that's reviewer-only, always.** Before starting new work, run
   `git worktree list` and confirm you're in a path that isn't the reviewer's main checkout.
3. **`krishna-m15` has no `node_modules` yet** — run a real `npm install` (or `npm ci`) there before
   starting L3. Do not junction/link it to another checkout's `node_modules`.
4. **Never push, ever, any branch, without the owner explicitly asking that exact time.** Standing
   rule, no exceptions absent a fresh explicit ask.

## Queue — next up
1. **L3-L5 of `LATENCY_FIRST_WORD_PLAN.md`**: L3 end-of-speech earcon + earlier filler, L4 STT
   watchdog+retry, L5 latency-panel column-label fix. Branch fresh off current local `main` (L1+L2
   are both in it).
2. **`feat/live-transcript` rebuild** — unblocked (L1 merged). Re-read
   `LIVE_TRANSCRIPT_PANEL_PLAN.md`'s Phase 1 first — it has an L1-exists branch that supersedes the
   from-scratch version: reuse `src/lib/sentence-stream.ts`'s exported
   `stripActionFences`/`isInsideFence` instead of writing a second fence parser.

> Read `RESUME_HERE.md` in full first. This file is the short "start here" for the coding agent:
> what just landed, the current worktree state, and what to build next.

## Everything else already on `main` (do NOT redo — full history in `RESUME_HERE.md` §3/§3a/§5)
- VID-1 (bundled WavLM model + SHA-gate), Natural Speech V1–V4, Window Control, Naukri N1-N3,
  first-word-latency L1+L2 — all done, merged. See "✅ Latency L2 merged" above for the latest.

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) is at `e7676d2`. **Reviewer-only — never work here.**
- `D:\Learning\krishna-m15` is a fresh, clean worktree on branch `feat/first-word-latency-l3`, no
  `node_modules` yet (see item 3 above) — this is where L3 work should happen.
- **Branch fresh off LOCAL `main` per track** (`git checkout -b <name> main`). One track per
  branch. **Never `origin/main`.**
- `tsc --noEmit` + `vitest run` + (`cargo test` when Rust changes) all green before every commit —
  and actually paste the real output, not just "clean" — two separate rounds this week had a
  self-reported "tsc clean" that didn't hold up on independent re-check.
- **Test the real seam, not just the new module in isolation** where practical — L2's regression
  tests correctly did this (mocked `HTMLMediaElement.prototype.play` and drove the real `speak()`
  method), which is exactly the right pattern to keep using.

## Smaller queued items (not urgent, pick up opportunistically — see `RESUME_HERE.md` §4 / findings docs)
- **JC-1** — `job_apply_submit` fires the "applied" status POST unconditionally; gate it on
  `verification.success` (`JOB_AUTOPILOT_REVIEW_FINDINGS.md`).
- **J3-A test** — unit test for the resume file-picker wiring (mock `@tauri-apps/plugin-dialog`).
- **`chrome_profiles.rs` follow-ups** — hardcoded `chrome.exe` path should use `%LOCALAPPDATA%`;
  `open_in_chrome_profile`'s URL check is a weak prefix match (low risk, N1's store-side check is
  the real gate); macOS/Linux `get_default_user_data_dir` has a latent type mismatch (dead code on
  Windows).
- **Minor L2 follow-up (non-blocking):** in `_speakStreaming`, when `play()` rejects on the first
  chunk, the read loop doesn't `break` — it keeps consuming the network stream and appending to a
  `SourceBuffer` that will never play until the response body is exhausted. Harmless (each append
  after cleanup is caught and logged as a warning) but wasteful. Worth a `break` next time you're
  in that file.

## Owner action still open (not agent work)
- Live mic-test of VID-1: speak to Krishna once, confirm the model loads fast with no re-download
  after a `Ctrl+R`, and capture one `[voice-id] verify: score=… threshold=… match=…` console line —
  that both closes VID-1 and gives the number needed to fix **VID-2** (meter stuck at 5 samples).
- Live-test Window Control (merged `22c6168`): "move Chrome to the other monitor", "bring File
  Explorer/Teams to the front", a query that matches nothing, Computer Control toggled off.
- Live-test Naukri N2/N3 (merged `669c6ce`): Settings → Naukri Searches UI + Chrome profile picker,
  and the `open_saved_search` voice command.
- Live-test first-word latency L1+L2 (merged `5097b66`, `508a5ec`): ask a question with a long
  answer and listen for whether the first word arrives noticeably faster — speech should start
  before generation finishes.
