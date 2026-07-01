# Voice-ID — Continuous Learning (gallery + gated self-adaptation)

**Status:** design approved, ready for implementation. Builds on Phase 1 (verified) and
intersects Phase 2 sync — READ "Sequencing vs Phase 2" below before starting.

## Problem
Explicit enrollment with 1–few samples produces a fragile single averaged centroid, so the
owner's own utterances often score below the 0.85 verify threshold and get false-rejected /
gated. Fix: learn the owner's voiceprint continuously from real daily use.

## Scope clarification (NOT model training)
We do NOT retrain/fine-tune WavLM (infeasible on-device, unnecessary). The fixed model stays;
we improve the **stored voiceprint representation** via continuous *speaker adaptation*
(enrollment learning). "Learn from daily conversations" = grow/curate the stored embeddings.

## Approved decisions
- **Bootstrap:** tiny explicit seed (2–3 short utterances) to anchor owner identity, then
  passive gallery growth from daily use. (Chosen over fully-passive: reliable cold-start.)
- **Enforcement:** stay DISPLAY-ONLY (non-gating) until the gallery is mature (enough diverse
  samples + calibrated threshold), THEN gate. (Chosen over manual toggle / never-gate.)
- **Conflict/soft-mode unchanged:** even when enforcing, gate = "confirm", never hard-block
  (matches existing soft-mode design).

## Design

### 1. Representation: speaker gallery (replaces single centroid)
- Store up to N (default 30) L2-normalized 512-dim embeddings for `speaker='primary'`, each
  AES-GCM encrypted (`enc:v1:`, same SHA-256 master-key derivation as Phase 1).
- **Verify score** = mean of the top-k (default k=5) cosine similarities to gallery members
  (robust to outliers; better than single-mean or max).
- Retire the current running-average-centroid logic in `enrollVoice` (its re-normalization is
  lossy); keep raw per-sample embeddings instead.

### 2. Schema
New table (preferred over overloading the single-row `voiceprints`):
```
voiceprint_samples(
  id TEXT PRIMARY KEY,           -- uuid
  speaker TEXT NOT NULL DEFAULT 'primary',
  embedding TEXT NOT NULL,       -- enc:v1: blob of the 512-dim vector
  quality REAL NOT NULL,         -- 0..1 (duration/SNR/VAD-derived)
  source TEXT NOT NULL,          -- 'seed' | 'passive'
  score_at_add REAL,             -- self-score when admitted (null for seed)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```
Keep `voiceprints` for calibration state, or add `voiceprint_state(speaker, verify_threshold,
adapt_threshold, mature INTEGER, sample_count, updated_at)`. Add migrations under
`src-tauri/src/db/migrations/` + register in `src-tauri/src/db/main.rs`.

### 3. Passive learning loop
On each VAD utterance that produces a command (wire in `KrishnaVAD.tsx` / the verify path):
1. **Quality filter** — require ≥ ~2.0s speech, adequate SNR / VAD confidence, single speaker.
   Compute a `quality` score; discard below a floor. (Short/noisy clips are what poison it.)
2. **Confidence gate** — embed, score vs current gallery. Admit ONLY if score ≥
   `adapt_threshold` (strictly above `verify_threshold`, default 0.88 vs 0.85). Ambiguous
   utterances are never admitted → prevents impostor leakage.
3. **Gallery management** — if under cap, insert. If at cap, evict the least-useful member
   (nearest-duplicate by cosine, or oldest low-quality) to preserve diversity, not recency.
4. Update `sample_count`; recompute calibration (below).

### 4. Adaptive threshold + maturity
- Track the distribution of admitted self-scores; set `verify_threshold ≈ mean − k·σ`
  (default k=1.5), clamped to a sane range (e.g., 0.75–0.92). Store per-speaker.
- `mature = true` when sample_count ≥ M (default 12) AND threshold has stabilized (variance of
  recent recalibrations below ε). Only when `mature` does enforcement turn on.

### 5. Enforcement wiring
- While `!mature`: verify still runs and shows the chakra dot, but the command gate in
  `processCommand` (`src/contexts/krishna.context.tsx`) does NOT gate.
- When `mature`: gate unverified as designed (confirm, not hard-block).

### 6. Optional: drift / forgetting
Weight recent samples and prune stale ones so the profile tracks gradual voice change without
unbounded growth. Low priority; the eviction policy in §3.3 already bounds size.

## Sequencing vs Phase 2 (IMPORTANT)
The current `voiceprints` table is a single `id='primary'` row; the gallery is many rows. To
avoid rework, do ONE of:
- **(preferred)** Land the gallery schema BEFORE wiring Phase 2 voiceprint sync, so Phase 2
  syncs `voiceprint_samples` (multi-row, keyed by uuid) from the start; OR
- Design Phase 2's voiceprint sync to be multi-row/id-keyed from the start (not hardcoded to
  'primary'), then this feature just adds rows.
Either way, Phase 2's LWW + tombstone sync applies to `voiceprint_samples` unchanged (they're
encrypted blobs). Update `LOCAL_FIRST_PHASE_2_SYNC_PLAN.md` sync scope: replace `voiceprints`
with `voiceprint_samples` (+ `voiceprint_state`).

## Tests
- Gallery verify score (top-k mean) vs single-centroid on the same inputs.
- Quality filter rejects short/noisy clips.
- Confidence gate: below `adapt_threshold` never admitted; impostor clip never enters gallery.
- Eviction preserves diversity at cap.
- Threshold calibration converges; `mature` flips only after criteria met.
- Enforcement is off pre-maturity, on post-maturity.
- Encrypted round-trip of `voiceprint_samples` rows.

## Acceptance criteria
1. Seed (2–3 utterances) bootstraps a working gallery; owner self-verifies immediately in
   display mode.
2. Normal daily use admits high-confidence owner utterances; owner false-reject rate drops
   measurably vs single-sample baseline.
3. Low-confidence / impostor utterances are never admitted to the gallery.
4. Enforcement stays off until maturity, then gates (confirm) correctly.
5. Gallery rows sync (Phase 2) as encrypted blobs; decrypt on another device.
6. `tsc` + `cargo check` + `vitest` green; new tests pass.
