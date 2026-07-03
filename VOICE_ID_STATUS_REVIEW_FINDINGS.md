# Voice ID Status-meter review findings

> Written by the reviewer (Claude). Agent: before starting each phase, fix any OPEN
> `BLOCKER`/`BUG` items below and mark them `FIXED (p<N> commit <sha>)` in this file. `NIT`
> items may wait for a convenient phase. This file lives in the MAIN checkout
> (`D:\Learning\krishna`) on `feature/local-first-p1` — read it from there; your worktree
> branch won't contain reviewer updates automatically. Companion spec:
> `VOICE_ID_STATUS_METER_PLAN.md`.

## Phase 1 — commit 20c8d1d (reviewed 2026-07-03)

Overall: clean extraction, no scope creep, tests are well-targeted (all 9 map directly to
the state-derivation table in the spec, including the exact boundary/rounding cases the spec
called out). `tsc --noEmit` clean, 348/348 green. One real regression against the "behavior
unchanged" claim; two minor items.

### P1-F1 · BUG · OPEN — Reset Enrollment failures are now silently swallowed
`VoiceIdSettings.tsx` `handleReset`:
```ts
} catch {
  /* ignore */
}
```
Before the refactor, this branch called `setError(err.message)`, which the component's
`{error && <p className="text-xs text-red-500">{error}</p>}` block displayed. After the
refactor, the component's `error` binding is `const error = enrollError` — sourced **only**
from `useVoiceEnroll`'s error state — so a `resetEnrollment()` failure now has nowhere to
go. The user clicks "Reset Enrollment", it silently fails, the button just stops spinning,
and the (possibly still-enrolled) state gives no indication anything went wrong. This
contradicts "Refactored — consumes both hooks, behavior unchanged" in the phase report.
**Fix:** give `handleReset` its own local `resetError` state (or extend `useVoiceEnroll`'s
scope isn't right since reset isn't enrollment — a local `useState<string|null>` in
`VoiceIdSettings` is simplest) and restore `{(error || resetError) && ...}` in the render.
Small, should land before P2 since the Status card will need working error display too.

### P1-N1 · NIT · OPEN — dead ref in `useVoiceEnroll.ts`
`audioChunksRef` is declared (`useRef<Blob[]>([])`) but never read — `chunksRef` is the one
actually used in `ondataavailable`/`handleEnroll`. Leftover from the extraction. `tsc` didn't
catch it because root `noUnusedLocals: false`. Harmless; delete the unused ref whenever
convenient.

### P1-N2 · NIT · OPEN — `state` reads "training" during the initial loading tick
In `useVoiceStatus`, before the first `getVoiceStatus()` resolves, `status` is `null`. The
derivation `if (status && status.sampleCount === 0) state = "empty"` is false for a null
status, so it falls through to `confidence < 1` (confidence defaults to 0) → `state =
"training"`. This is harmless today (`VoiceIdSettings` doesn't consume `state`), but **P2's
Status card will** — a loading `empty`/`ready`/`active` user would flash a "training" badge
for one tick before the real status resolves. **Fix in P2:** gate the card's render on
`loading` first (show a skeleton/spinner state), only trust `state` once `loading` is false.
Not worth a P1 patch since nothing in P1 depends on it yet.

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
