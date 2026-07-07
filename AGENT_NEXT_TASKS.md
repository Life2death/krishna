# Agent — next tasks (written by reviewer, 2026-07-07 night — L1 latency merged)

## ✅ Three branches now MERGED to `main` (window-control-wiring, naukri N1-N3, latency L1)
1. **`fix/window-control-wiring`** merged as `22c6168`.
2. **`feat/naukri-searches` (N1-N3)** merged as `669c6ce`. One review round (a rebase conflict left
   the `Action` type union malformed — caught by `tsc`, NOT `vitest`). Non-blocking follow-ups
   filed for `chrome_profiles.rs` (see below) — pick up opportunistically.
3. **`feat/first-word-latency` (L1 only)** merged as `5097b66`. Sentence-streaming speech —
   Krishna speaks sentence-by-sentence as the reply streams instead of waiting for the full
   generation. One review round: a cross-chunk sentence-boundary bug (period at the exact end of a
   stream chunk mis-split decimal/time values — "...at 3." | "5pm sharp.") was found, reproduced,
   and fixed before merge (`dfc2b3b`). **Known, accepted gap:** no test drives the real
   `krishna.context.tsx` wiring directly (verified correct by manual review only; no test harness
   exists for that file in this codebase — pre-existing gap, not new). `tsc`/`vitest` (773/773)
   independently reverified by the reviewer, twice.
4. **Never push, ever, any branch. Never branch from `origin/main` — always local `main`.** Three
   branches were pushed in error earlier this session (`release.yml` fired, failed 0s each time,
   nothing released, but still a violation). Zero-exception rule from here on.
5. **Resolved incident:** `D:\Learning\krishna`'s `.git\config` briefly had `core.bare = true`
   (blocked all git commands in both worktrees — they share the parent's `core.*` config). Fixed
   via `git config core.bare false`. If "must be run in a work tree" shows up from an obviously-
   fine command, check `git config --get core.bare` before assuming something else broke.

## Queue — next up
1. **L2-L5 of `LATENCY_FIRST_WORD_PLAN.md`** (owner hasn't said whether to continue immediately or
   pivot to the transcript panel first — ask, or default to finishing the latency track since it's
   mid-flight): L2 ElevenLabs streaming endpoint, L3 end-of-speech earcon + earlier filler, L4 STT
   watchdog+retry, L5 latency-panel column-label fix. Branch fresh off current local `main` (L1 is
   already in it).
2. **`feat/live-transcript` rebuild — now unblocked** (L1 merged). Fresh branch off local `main`.
   Re-read `LIVE_TRANSCRIPT_PANEL_PLAN.md`'s Phase 1 — it has an L1-exists branch that supersedes
   the from-scratch version: reuse `src/lib/sentence-stream.ts`'s exported
   `stripActionFences`/`isInsideFence` instead of writing a second fence parser.

> Read `RESUME_HERE.md` §4/§5/§6/§7 in full first. This file is the short "start here" for the
> coding agent: what just landed, the current worktree state, and what to build next.

## Everything else already on `main` (do NOT redo — full history in `RESUME_HERE.md` §3/§3a/§5)
- VID-1 (bundled WavLM model + SHA-gate) — done, merged.
- Natural Speech V1–V4 (variety engine, prompt variety, ban/teach actions, vocabulary refresh) —
  done, merged.
- Window Control + Naukri N1-N3 + first-word-latency L1 — see the "✅ Three branches" section above.

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) is at `5097b66`; `node_modules` healthy.
- **`krishna-m15`** should be fast-forwarded to main's current HEAD before branching off for new
  work — simplest: `git checkout -b <name> main` directly names main's current tip regardless of
  what branch `krishna-m15` was last left on.
- **Branch fresh off LOCAL `main` per track** (`git checkout -b <name> main`). One track per
  branch. **Never `origin/main`.**
- `tsc --noEmit` + `vitest run` + (`cargo test` when Rust changes) all green before every commit —
  run all of them, not just the fast ones. `tsc` catches things `vitest` doesn't (naukri N3 hit
  this exact gap).
- **Test the real seam, not just the new module in isolation.** L1's `SentenceStream`/`SpeechQueue`
  unit tests were excellent, but initially nothing exercised the two working *together*, and
  nothing exercises the real `krishna.context.tsx` wiring at all (deferred as a known gap this
  round — see item 3 above). When in doubt, add one test that drives the actual composed/live path.

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
- Live-test first-word latency (merged `5097b66`): ask a question with a long answer and listen for
  whether the first word arrives noticeably faster — speech should start before generation finishes.
