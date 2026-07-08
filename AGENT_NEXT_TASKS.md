# Agent — next tasks (written by reviewer, 2026-07-08 — latency L1-L5 + live-transcript both merged)

## ✅ Everything from tonight's latency + transcript work is MERGED to `main` (`3339561`)
1. **First-word latency L1-L5 fully merged** (`5097b66` L1, `508a5ec` L2, `8e8d8c6` L3-L5). Real
   bugs found and fixed across every phase — see `RESUME_HERE.md` §4 item 5 for the full list
   (play()-rejection hang risk, dead MediaSource event listener, a TypeScript closure-narrowing
   limitation, an L4 branch that didn't actually contain L3, two test-reimplementation gaps). Do
   not touch any of this — it's done.
2. **Live-transcript panel fully merged** (`e16b0c7`, plus post-merge fixes `3339561`). Do not
   touch — it's done. See `RESUME_HERE.md` §4 item 6.
3. **🔴 Second workflow incident tonight, fully resolved, read this carefully.** After the L2
   incident (agent working in the reviewer's checkout instead of a worktree), it happened AGAIN in
   a different form: `D:\Learning\krishna`'s working tree suddenly showed ~139 tracked files
   deleted from disk (`packages/core/tools/index.ts`, all of `apps/brain`, etc.) plus a degraded
   `node_modules`. Nothing was staged/committed, so it was fully recoverable (`git restore .` +
   `rm -rf node_modules && npm ci`) and nothing was lost — but this is now the SECOND time
   something operated on the reviewer's checkout instead of an agent worktree. **Before running
   ANY command that touches files, run `pwd` and `git worktree list` and confirm you are NOT in
   `D:\Learning\krishna`.** If you ever find yourself there, stop immediately and switch to your
   assigned worktree first.
4. **Never push, ever, any branch, without the owner explicitly asking that exact time.** Standing
   rule, no exceptions absent a fresh explicit ask.

## Queue — next up
Nothing is currently blocking. Pick one:
1. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1–P3 ready to code.
2. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.
3. Smaller queued items below.

> Read `RESUME_HERE.md` in full first. This file is the short "start here" for the coding agent:
> what just landed, the current worktree state, and what to build next.

## Everything else already on `main` (do NOT redo — full history in `RESUME_HERE.md` §3/§3a/§4/§5)
- VID-1, Natural Speech V1–V4, Window Control, Naukri N1-N3, first-word-latency L1-L5,
  live-transcript panel — all done, merged. See "✅ Everything from tonight's..." above.

## ⚠️ Worktree state — read before you touch anything
- `main` (`D:\Learning\krishna`) is at `3339561`. **Reviewer-only — never work here, ever, for any
  reason.** This has now bitten us twice.
- Confirm your actual worktree with `git worktree list` before starting anything. If your assigned
  worktree doesn't exist or is in a bad state, say so and wait for the reviewer rather than
  falling back to the main checkout.
- **Branch fresh off LOCAL `main` per track** (`git checkout -b <name> main`). One track per
  branch. **Never `origin/main`.**
- `tsc --noEmit` + `vitest run` + (`cargo test` when Rust changes) all green before every commit —
  and actually paste the real output, not just "clean". Multiple rounds this week had a
  self-reported "tsc clean" that didn't hold up on independent re-check — including one on a
  now-merged branch, caught only because the reviewer re-verified main itself after merging rather
  than trusting the pre-merge report. Always assume your own report needs independent confirmation.
- **Test the real seam, not just the new module in isolation** where practical. Two related traps
  worth remembering: a test can assert output that happens to match a *buggy* implementation
  (stripActionFences's original tests baked in a whitespace bug as "correct" — nobody caught it
  until a differently-scoped test later exposed the inconsistency), and a mock can be missing a
  type assertion that would have caught it immediately (`ReturnType<typeof someHook>` is the
  pattern to reach for when mocking a hook that returns a large, non-exported interface).

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
  `SourceBuffer` that will never play until the response body is exhausted. Harmless but wasteful.

## Owner action still open (not agent work)
- Live mic-test of VID-1: speak to Krishna once, confirm the model loads fast with no re-download
  after a `Ctrl+R`, and capture one `[voice-id] verify: score=… threshold=… match=…` console line —
  that both closes VID-1 and gives the number needed to fix **VID-2** (meter stuck at 5 samples).
- ~~Live-test Window Control~~ — **DONE, confirmed working 2026-07-08.**
- Live-test Naukri N2/N3 (merged `669c6ce`): Settings → Naukri Searches UI + Chrome profile picker,
  and the `open_saved_search` voice command.
- Live-test first-word latency L1-L5 (merged through `8e8d8c6`): ask a question with a long answer
  and listen for whether the first word arrives noticeably faster — speech should start well before
  generation finishes, with a short earcon right at end-of-speech.
- Live-test the live transcript panel (merged `e16b0c7`): toggle it on via the bar's captions icon,
  ask something, and confirm the reply streams in live without any JSON ever flashing.
