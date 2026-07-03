# Voice ID — Status-page training meter (build spec)

> **For the coding agent.** Owner-approved design. Build on branch
> `feature/local-first-p1` (where the Voice ID stack lives), in your own worktree.
> Follow the usual protocol: one phase per commit `feat(voiceid-status-pN)` /
> `fix(voiceid-status-pN)`, `tsc` clean + tests green each phase, then **STOP and
> report** for review before the next phase. Do NOT push (releases fire on tags;
> owner pushes manually).

## 1. Goal

Add a **Voice ID training card** to the Status page that shows a **confidence
meter** filling as the on-device voiceprint gallery matures, and gate a single
**Enable Voice ID** switch behind that meter reaching **100%** (owner's explicit
choice: strict 100% gate — nothing acts until full).

Today, Voice ID enrollment + enable live only in
`src/pages/settings/components/VoiceIdSettings.tsx`. This spec surfaces the
training progress on the Status dashboard and makes enablement gate on readiness.

## 2. Ground truth (existing code — read before building)

- **Status page:** `src/pages/status/index.tsx` — sections are `Insights` then
  `System Health` (grid of status cards). New card goes here.
- **Voice status source:** `src/lib/voice-client.ts`
  - `getVoiceStatus(): Promise<VoiceStatus>` returns
    `{ enrolled, sampleCount, mature, adaptiveThreshold, thresholdConfidence }`
    (see `VoiceStatus` interface ~line 26).
  - `thresholdConfidence` = `computeAdaptiveThreshold()` → **`min(1, n/24)`**
    where `n` = number of intra-gallery self-scores (≈ `sampleCount − 1`).
    ⇒ **meter hits 100% at ~24 samples.**
  - `mature` = `evaluateMaturity(count, conf)` = `count >= 12 && conf >= 0.5`.
  - `adaptiveThreshold` = `max(staticThreshold, selfMean − 2·selfStd)` — a proxy
    for how tight the owner's voice cluster is (lower spread = tighter).
  - Gallery cap = **30** (`GALLERY_CAP` in `voiceprint-samples.action.ts`).
  - `enrollVoice(pcm, sampleRate)` adds one sample and recomputes state.
  - `considerAddSample(...)` passively adds a sample when a verified turn scores
    `>= 0.88` — **but only runs when the verify path is active** (i.e. Voice ID
    enabled). See §5 open decision.
- **Enable flag:** `isVoiceIdEnabled()` / `readBrainConfig().voiceIdEnabled`
  (persisted via `saveBrainConfig`) in `src/lib/brain-config.ts`.
- **Enrollment recording pipeline** (reuse — do not reinvent): in
  `VoiceIdSettings.tsx` `startRecording`/`handleEnroll`: `getUserMedia` →
  `MediaRecorder` → decode → `OfflineAudioContext` resample to **16 kHz mono** →
  `enrollVoice(pcm16k, 16000)`. The 16 kHz resample is load-bearing (matches the
  VAD verify path; skipping it aliased audio and dropped self-score to ~0.44).
- **State tables:** `voiceprint_state` (sample_count, mature, adaptive_threshold,
  threshold_confidence) and `voiceprint_samples` (encrypted 512-dim embeddings).

## 3. UX states (single source of truth = `thresholdConfidence` + `enabled`)

Derive a `VoiceIdCardState` from `getVoiceStatus()` + `isVoiceIdEnabled()`:

| State | Condition | Card shows |
|---|---|---|
| `empty` | `sampleCount === 0` | Prompt to record; meter at 0; Enable hidden |
| `training` | `0 < confidence < 1` | Meter (amber) `N of 24`, `Add voice sample` btn, Enable **locked** with lock hint |
| `ready` | `confidence >= 1 && !enabled` | Meter full (green), **Enable switch unlocked** |
| `active` | `confidence >= 1 && enabled` | Meter full, badge "Active", verification running; gallery keeps topping to 30 |

- `percent = Math.round(thresholdConfidence * 100)` (round — no float artifacts).
- Meter denominator shown to the user is **24** ("N of 24"), not 30. 30 is the
  post-enable gallery cap; surface it only as a secondary stat if desired.
- **Strict gate:** `canEnable = thresholdConfidence >= 1`. Below 100% the Enable
  control is disabled/locked with copy "Unlocks when training reaches 100%".
- Reference mockups: two owner-approved renders exist (strict-gate locked state
  is the canonical one — amber meter, `Add voice sample`, locked Enable row).

## 4. Phases

**P1 — Shared hooks (refactor, no visual change).**
- Add `useVoiceStatus()` hook: wraps `getVoiceStatus()` with a `refresh()` and
  lightweight polling/refetch (mirror the `fetchStatus` pattern already in
  `VoiceIdSettings.tsx`). Expose derived `percent`, `state`, `canEnable`.
- Extract the record→enroll pipeline from `VoiceIdSettings.tsx` into a reusable
  `useVoiceEnroll()` hook (returns `{ recording, enrolling, error, start, stop }`).
  Refactor `VoiceIdSettings` to consume it (behavior unchanged).
- Unit tests: state derivation (`empty/training/ready/active`), `percent`
  rounding, `canEnable` boundary at exactly 100%.
- Commit `feat(voiceid-status-p1)`, STOP.

**P2 — Status Voice ID card.**
- New component `src/pages/status/components/VoiceIdCard.tsx`, rendered in
  `status/index.tsx` as its own section **above System Health**.
- Meter, `N of 24` + adaptive-threshold + cluster stats, `Add voice sample`
  button (via `useVoiceEnroll`), and the strict-gated Enable switch.
- Match existing Status card styling (border, `rounded-lg`, lucide icons,
  Badge). Dark-mode safe. Sentence case, no ALL CAPS.
- Commit `feat(voiceid-status-p2)`, STOP.

**P3 — Unify the gate + fill mechanism.**
- Apply the **same `canEnable >= 100%` guard to the existing Settings toggle**
  (`VoiceIdSettings.handleToggle`) so enablement can't be bypassed there.
- Implement the §5 fill decision (owner picks A or B before this phase).
- Commit `feat(voiceid-status-p3)`, STOP.

**P4 — Polish.**
- Empty/active copy, reset-enrollment parity (reuse existing `resetEnrollment`),
  loading + error states, model-download progress reuse (`subscribeToModelLoad`).
- Commit `feat(voiceid-status-p4)`, STOP.

## 5. Fill mechanism — DECIDED: Option A (background observing fill)

Under a strict gate, passive learning (`considerAddSample`) does **not** run while
Voice ID is disabled, so without this, the only way to 100% would be ~24 manual
`Add voice sample` taps. **Owner chose Option A:**

- **A — background "observing" fill.** While Voice ID is disabled, silently run
  the verify+embed path on the owner's turns and auto-add high-confidence samples
  (reuse `considerAddSample`'s ≥0.88 rule) to fill the meter — but take **no
  action** (never confirm, never block) until enabled at 100%. This preserves the
  strict gate ("nothing acts until full") while the meter fills from normal use.

Implementation notes for P3:
- Bootstrap: the observing pass needs a threshold to score against, so the first
  2–3 samples must come from a manual seed. Card copy in the `empty` state should
  ask the owner to record a couple of short phrases to start; after that the meter
  fills passively.
- Gate the observing pass on `sampleCount > 0` (seeded) AND `!enabled` AND
  `confidence < 1`. Once `active`, the normal enabled verify path takes over.
- The observing pass must be strictly side-effect-free beyond adding samples: no
  confirm prompt, no block, no UI interruption, no logging that reads as an action.

## 6. Constraints / out of scope

- No push. `tsc` clean + existing test suite green every phase.
- Voice ID stays 100% on-device (WavLM SV, AES-GCM at rest) — unchanged.
- **Out of scope (future):** a true false-accept calibration ("have someone else
  say a phrase") to measure real speaker *separation* rather than only intra-voice
  consistency. Note it in code comments; don't build it now.

## 7. Notes for the reviewer (Claude)

- The `thresholdConfidence` semantics ("internal consistency, not impostor
  separation") should be reflected honestly in card copy — avoid implying "100%
  accuracy". Owner is aware.
- Watch for a bypass: any code path that flips `voiceIdEnabled` true must honor
  `canEnable`. Grep `voiceIdEnabled` after P3.
