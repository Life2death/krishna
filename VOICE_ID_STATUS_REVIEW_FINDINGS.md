# Voice ID Status Review Findings

## P1 Findings

### P1-F1 (FIXED) — Reset Enrollment error display broken
- **commit:** ff69d55 (m1-5-voice), 5122c4a (local-first-p1)
- Reset error disappeared when enrollment was reset from Settings.
- **Fix:** Added local `resetError` state; `error = enrollError || resetError` so both the enroll-time and reset-time error display work.

### P1-N1 (FIXED) — Dead `audioChunksRef` in `useVoiceEnroll.ts`
- **commit:** ff69d55 (m1-5-voice), 5122c4a (local-first-p1)
- `const audioChunksRef = useRef<Blob[]>([]);` was never read after creation.
- **Fix:** Removed the dead ref.

### P1-N2 (FIXED) — One-frame "training" flash on Status page mount
- P2 fix: `VoiceIdCard` gates on `loading` before trusting `state`, so on mount the loading branch renders a muted placeholder instead of reading `state` (= "training") during the first frame before `status` arrives.
- No change needed in `useVoiceStatus` hook itself.

## P2 Findings — commit dfb5be2 (feature/m1-5-voice), reviewed 2026-07-03

Overall clean: correct loading gate (confirms P1-N2 above), correct "N of 24" denominator per
spec, correct hard-locked switch in the `training` state, placed directly above System Health
as specified. One non-blocking finding.

### P2-N1 (OPEN) — `VoiceIdCard` and `VoiceIdSettings` each hold an independent local `enabled`
Both components seed `useState(readBrainConfig().voiceIdEnabled ?? false)` on mount and toggle
it locally; neither subscribes to the other's writes. If both are ever mounted without a full
remount between them, one can display a stale toggle. Likely harmless today (page routing
probably remounts fresh), but fold into **P3** — which already touches this exact toggle logic
for the `canEnable` guard. Suggest: `useVoiceStatus` also exposes a live `enabled` (+ setter) so
both consumers read/write one shared source instead of two local copies.

## Process note — branch mixup (not a code bug)

The P1/P2 commits landed on **both** `feature/m1-5-voice` (`20c8d1d`/`ff69d55`/`dfb5be2`, via the
`krishna-m15` worktree — correct) **and** `feature/local-first-p1` (`4a02ef7`/`5122c4a`/`928d200`,
committed directly from the main checkout `D:\Learning\krishna` — should not have app-code commits).
Content is identical on both; nothing lost. Left `feature/local-first-p1`'s history as-is (no
rebase) rather than rewrite shared history unilaterally. Going forward: agent work must stay in
`krishna-m15` on `feature/m1-5-voice` only.

---

## P3-FOLLOWUP (owner request 2026-07-05): relax the enable gate — too strict at 100%

Owner hit the P3 strict gate live: can't enable Voice ID until the meter is 100% (~24 samples).
**Owner decision: enable once there are ~3 enrolled samples** (not 100%). Change:
- `useVoiceStatus.ts`: `canEnable` from `confidence >= 1` → `(status?.sampleCount ?? 0) >= 3`.
  Keep `percent`/`state` for display; the meter stays informational, it just no longer BLOCKS
  enabling. `setEnabled`'s gate already reads `canEnable`, so only the definition changes.
- Update the "reach 100% to enable" copy in VoiceIdCard/VoiceIdSettings → "record 3 samples to enable".
- Update the strict-gate test in `voiceid-hooks.test.ts` (was confidence-based → sampleCount>=3).
**BLOCKED behind the enrollment fix** — at 0 samples the gate is moot; enrollment must work first
(see the enrollment-failure debug below / GMAIL is unrelated). Bundle this with the enrollment fix
for the agent.

## ENROLLMENT FAILURE (live, 2026-07-05) — under debug
"Record First Sample" → "Enrollment failed" (generic fallback in `useVoiceEnroll`). Real cause not
yet captured. Prime suspect: WavLM model download/init (`@xenova/transformers`,
`Xenova/wavlm-base-plus-sv` from Hugging Face) in `src/lib/voice-id/embedding.ts`. Need the
Settings→VoiceID model-status line or the in-app console error to root-cause. Also a diagnostics
gap: the Status card shows only "Enrollment failed" — should surface the real error (item-1/EV-1
discipline).
