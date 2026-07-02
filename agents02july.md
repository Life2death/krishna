# Session 02 July 2026

## Ongoing
- Implementing M1.5 voice persona and latency improvements in gated phases on `feature/m1-5-voice` worktree branch (off `feature/local-first-p1`).

## Done

### P1 review fixes — commit `236d1fb`
- **P1-F1 (BLOCKER):** Added `updateCommandTiming()` narrow write function — only touches the `timing` column so `response`/`detail` survive from the first write.
- **P1-F2 (BUG):** Added `honorific` field to `ResponseSettings` (default `"sir"`), `{honorific}` placeholder in `BASE_SYSTEM_PROMPT` and seed persona, interpolated at prompt-assembly time via `getResponseSettings()`.
- **P1-F3 (BUG):** Added snapshot test `src/__tests__/phase1-prompt.test.ts` for Phase-1 prompt changes.
- **P1-F4 (NIT):** Added `.catch` + `emit("command-log-updated")` to both TTS completion and failure paths.
- **Files touched:** `apps/brain/src/core-init.ts`, `packages/core/database/command-log.action.ts`, `packages/core/response-settings.constants.ts`, `packages/core/settings.ts`, `src/__tests__/setup.ts`, `src/contexts/krishna.context.tsx`, `src/lib/seed-personas.ts`, `src/lib/startup.ts`, `src/lib/storage/response-settings.storage.ts`, `src/__tests__/phase1-prompt.test.ts` (new).

### M1_5_REVIEW_FINDINGS.md update — commit `6f96ef2`
- Marked P1-F1 through P1-F4 as `FIXED (p1 commit 236d1fb)`.
- Synced worktree copy with main checkout.

### Phase 2 — Instant local acknowledgment layer — commit `c303e7b`
- **Multilingual intent table** (EN/HI/MR) for greetings, thanks, yes/no acknowledgments → speaks canned randomized reply in matched language, no LLM call.
  - File: `src/lib/canned-responses.ts`
  - Language detection by Devanagari script + keyword heuristics.
  - Randomized response pools per language, `{honorific}` interpolation.
  - Runs before AI provider guard → fully offline-capable.
- **Filler timer** (700ms): if no `first_audio` after `request_sent`, speaks "One moment, {honorific}" via TTS. Never fires twice per turn (`fillerSpokenRef`). Auto-cancelled by subsequent `TTS.speak()` (which hard-cancels before every utterance).
  - Integrated in `src/contexts/krishna.context.tsx`.
- **Unit tests:** `src/__tests__/canned-responses.test.ts` (15 tests — language detection, intent matching, no-match, honorific interpolation).
- **Verification:** `tsc --noEmit` clean, `vitest run` — 302/302 pass.

## State
- Branch: `feature/m1-5-voice` (3 commits ahead of `feature/local-first-p1`).
- P1-F5 (NIT — seeded persona inert on existing installs) still open; low priority.
- Phase 3 (streaming sentence-by-sentence TTS) waiting for owner confirmation.
