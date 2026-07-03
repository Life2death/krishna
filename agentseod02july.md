# Session: Phase 4 cleanup + Phase 6 — 2026-07-02

## Branches
- `feature/m1-5-voice` (worktree: `D:\Learning\krishna-m15`)
- Main checkout at `D:\Learning\krishna`

## Commits

### `b34e4f4` — fix(m1.5-p4): P4-F7 — cancel filler instead of awaiting it
**REJECTED** by owner (superseded by P4-F9). Hard-cancelling a mid-utterance filler
reintroduces the P2-F7 "one mo—" garble.

### `5b9f47d` — fix(m1.5-p4): P4-F9 — raise filler threshold to 1500ms + await (not stop)
**Final fix for the P4-F7 regression.** Two changes:
1. Filler timer 700ms → 1500ms — fast turns (<1.5s TTFT) now complete before filler fires
2. Reverted `stop()` back to `await fillerPromiseRef.current` — no garble
3. Fixed wrong cache-causality comment from b34e4f4

**Tests added:** `src/__tests__/phase4-filler.test.ts` (2 tests):
- No filler fires on fast (<1.5s) turn (fake timers)
- Answer speech awaits pending filler on slow turn (promise)

### `9b5cf12` — feat(m1.5-p6): max_tokens cap + voiceModel override + honorific UI
**Phase 6 — three components, 14 files changed, +225 lines.**

#### 1. max_tokens cap for voice turns
- `maxOutputTokens` optional param on `fetchAIResponse`
- Finds `max_tokens` / `max_completion_tokens` / `maxOutputTokens` key in bodyObj and overrides it
- `voiceMaxTokens` setting (default 200) in `ResponseSettings`
- Voice path (`krishna.context.tsx`) passes it; chat path (param omitted) untouched

#### 2. Voice model override
- `modelOverride` optional param on `fetchAIResponse`
- Overrides `allVariables.MODEL` for that request only when set
- `voiceModel` setting (default `""` = provider default)
- No two-model routing — owner A/Bs by changing the setting

#### 3. P1-F8 honorific settings UI
- `HonorificInput.tsx` — text input on Settings page next to ResponseLength/LanguageSelector
- `updateHonorific()` storage helper
- Saves to localStorage, runtime reads via core getter

#### Settings infrastructure changes
- `ResponseSettings` interface: added `voiceMaxTokens: number`, `voiceModel: string`
- Defaults: `DEFAULT_VOICE_MAX_TOKENS = 200`, `DEFAULT_VOICE_MODEL = ""`
- Both storage layers (app `response-settings.storage.ts` + core `startup.ts` getter) updated
- Test setup (`setup.ts`) updated

**Tests added:** `src/__tests__/ai-response.function.test.ts` (4 new, now 18 total):
- Claude-style `max_tokens` override (200)
- Groq-style `max_completion_tokens` override (150)
- No-key template skips with console.warn
- Chat path (param omitted) — body untouched (still 1024)

## Files changed (session total: 17 files)

| File | Change |
|---|---|
| `src/contexts/krishna.context.tsx` | Filler 700→1500ms, await (not stop), pass voiceMaxTokens/modelOverride |
| `src/lib/functions/ai-response.function.ts` | Add maxOutputTokens + modelOverride params + overrides |
| `packages/core/functions/ai-response.function.ts` | Same | 
| `src/lib/repo-bound.ts` | Add maxOutputTokens + modelOverride to wrapper interface |
| `src/lib/repo-selector.ts` | Add to ChatRepo interface + localRepo impl |
| `src/lib/startup.ts` | voiceMaxTokens/voiceModel defaults in core getter |
| `src/lib/storage/response-settings.storage.ts` | New fields + update* helpers |
| `packages/core/settings.ts` | Add voiceMaxTokens + voiceModel to interface |
| `packages/core/response-settings.constants.ts` | Add DEFAULT_VOICE_MAX_TOKENS + DEFAULT_VOICE_MODEL |
| `src/__tests__/setup.ts` | Update settings mock |
| `src/__tests__/phase4-filler.test.ts` | NEW — 2 tests |
| `src/__tests__/ai-response.function.test.ts` | 4 new tests (now 18) |
| `src/pages/responses/components/HonorificInput.tsx` | NEW — honorific text field |
| `src/pages/responses/components/index.ts` | Add export |
| `src/pages/settings/index.tsx` | Add HonorificInput |

## Test stats (end of session)
- **23 test files** (from 22 start)
- **339 tests** (from 333 start, +6 total: 2 filler + 4 ai-response)
- **All green, tsc clean, zero exclusions**

## Decisions made
1. **P4-F8 closed** — accept no Anthropic cache (prefix ~1700 tokens vs 2048 minimum).
   Cache infra kept as-is (auto-engages for OpenAI-style providers).
2. **P4-F9 design** — raise threshold to 1500ms instead of hard-cancelling.
3. **Phase 6 model override** — no two-model routing; single setting for voice model.
4. **Honorific UI** — simple text input next to existing controls in Settings page.

## Next steps
1. Owner runs `npm run tauri dev` in worktree
2. 3-4 voice turns, observe LatencyPanel
3. Expect TTS column to drop from 15-45s to <10s (max_tokens=200)
4. Report table back for Phase 6 verification
