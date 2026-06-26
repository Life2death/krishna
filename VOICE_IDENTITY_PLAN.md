# Voice Identity (Speaker Verification) — Implementation Plan

**Goal:** Krishna identifies its owner by voice and **only obeys the owner**, even when other
people are speaking in the room. Decision model = **speaker verification (1:1)**: enroll one
primary voice → for every utterance, score it against the stored voiceprint → accept only if
cosine-similarity ≥ threshold.

**Decisions locked (2026-06-26):**
- Engine: **`Xenova/wavlm-base-plus-sv`** via `@xenova/transformers`, run **in the Node brain**
  (the brain already loads this library for RAG — no new runtime dependency).
- Platforms: **Desktop + Android together.**
- Enforcement: **Soft / warn mode** — an unverified speaker is *not* silently dropped; the command
  is flagged "unverified" and routed through the existing confirmation gate before any action runs.
- Storage: voiceprint stored in the brain DB, **AES-256-GCM encrypted with `KRISHNA_MASTER_KEY`**
  (same scheme as memories + the Gmail token), syncable via the existing Turso replica.

> Workflow note: Claude reviews & plans; the coding agent implements. Validate each phase before
> moving on. Phase 0 (the Android concurrent-mic spike) gates the Android work — do it first.

---

## Git workflow — READ FIRST (agent must follow)

This feature is large and runs alongside the user testing locally. To avoid breaking the user's
build with mid-edit files, **do all work in an isolated git worktree, not the user's main checkout.**

1. **Where you work:** a dedicated worktree on a feature branch, created off the stable checkpoint:
   ```bash
   git worktree add -b feature/voice-android ../krishna-agent main
   ```
   Do **all** edits in `../krishna-agent`. **Never edit the user's primary checkout**
   (`D:\Learning\krishna`) — they are testing there on `main` and your in-progress edits must not
   touch it.
2. **First-time setup in the worktree:** worktrees do NOT share `node_modules` or the Rust `target/`.
   Run `npm install` (root — it covers workspaces) before building. The first Tauri/Rust build will
   be slow; that's expected.
3. **Commit hygiene — critical:** commit after **each coherent, build-passing change**. Never leave
   the tree with half-written files or a broken build between commits. Each commit message should
   describe one logical step (mirror the existing history style, e.g. "Step N: <what>").
   End commit messages with the project's standard `Co-Authored-By` trailer if one is in use.
4. **Validate before committing:** `npm run typecheck` (or `tsc --noEmit`) and `vite build` must pass.
   For the brain, boot it and hit the new endpoints (see each phase's validation). A green build is
   the bar for every commit — "tsc passes" alone is NOT proof a runtime feature works; actually
   exercise it.
5. **Surfacing for review:** when a phase is complete and validated, push the branch and open a PR
   (or report it for review). Claude reviews; the user merges `feature/voice-android` → `main` at
   checkpoints. Do not merge to `main` yourself.
6. **Keep the branch current:** if `main` advances, rebase/merge it into `feature/voice-android` in
   the worktree so you don't drift.

> If you ever find yourself about to edit a file in `D:\Learning\krishna` directly, stop — you're in
> the wrong directory. All work happens in the `../krishna-agent` worktree.

---

## 0. Background: how audio flows today (verified)

| Stage | Desktop | Android |
|---|---|---|
| Mic capture | `@ricky0123/vad-react` (`useMicVAD`) — [src/components/KrishnaVAD.tsx:26](src/components/KrishnaVAD.tsx) | browser **Web Speech API** — [src/hooks/useMobileSpeech.ts:15](src/hooks/useMobileSpeech.ts) |
| Raw waveform | ✅ `Float32Array` @16kHz at `onSpeechEnd(audio)` — [KrishnaVAD.tsx:55](src/components/KrishnaVAD.tsx) | ❌ **none** — Web Speech returns text only |
| → text | WAV blob → `fetchSTT()` [src/lib/functions/stt.function.ts:22](src/lib/functions/stt.function.ts) | browser, on-device |
| Command gate | `processCommand(transcription)` [src/contexts/krishna.context.tsx:808](src/contexts/krishna.context.tsx), wake-word check ~line 1123 | same `processCommand` |

**Key consequences:**
1. **Desktop already has the raw waveform** we need — it's just discarded after WAV conversion.
2. **Android has no waveform.** This is the central Android challenge (Phase 0).
3. `processCommand` currently receives **only the transcription string** — it must be extended to
   also receive the utterance audio so the gate can verify the speaker.

---

## 1. Brain: the verification service

New module **`apps/brain/src/voice-id/`**. Follow the existing patterns: embeddings like
[src/rag/embedding.ts](apps/brain/src/rag/embedding.ts), routes registered in
[src/index.ts](apps/brain/src/index.ts) like the others, field encryption via
[src/crypto/field-crypto.ts](apps/brain/src/crypto/field-crypto.ts), migrations in
[src/db/migrations.ts](apps/brain/src/db/migrations.ts).

### 1.1 Embedding (`voice-id/embedding.ts`)
- Lazy-load `Xenova/wavlm-base-plus-sv` (`AutoProcessor` + `AutoModel`) on first use — **never on
  boot** (it's ~360 MB fp32; quantize to int8 if startup memory matters). Mirror the lazy
  singleton style in `rag/embedding.ts`.
- `embed(pcm: Float32Array, sampleRate=16000): Promise<Float32Array>`:
  - resample to 16 kHz mono if needed,
  - run the model, take the `embeddings` output,
  - **L2-normalize** before returning.
- `cosineSim(a, b): number` — standard cosine on the normalized vectors.

### 1.2 Storage (`voice-id/store.ts` + migration)
- New table `voiceprints`: `id` (single row, e.g. `"primary"`), `embedding` (encrypted JSON of the
  averaged float vector), `sample_count`, `dims`, `created_at`, `updated_at`. Encrypt the embedding
  blob with `field-crypto` (same as memories). Add it to the Turso-synced set so the voiceprint
  follows the owner across devices.
- `getVoiceprint()`, `setVoiceprint(vec, sampleCount)`, `addSample(vec)` (online average:
  `new = normalize((avg*n + vec)/(n+1))`), `reset()`.

### 1.3 Routes (`voice-id/routes.ts`, registered in index.ts behind bearer auth)
- `POST /voice/enroll` — body `{ audio: base64Wav }`. Decode → PCM → `embed` → `addSample` →
  return `{ sampleCount, dims }`. (Append; call N times during enrollment.)
- `POST /voice/verify` — body `{ audio: base64Wav }`. → `embed` → `cosineSim` vs stored voiceprint
  → `{ match: boolean, score: number, threshold: number, enrolled: boolean }`. If not enrolled,
  return `enrolled:false, match:true` (fail-open so the feature is inert until enrolled).
- `GET /voice/status` — `{ enrolled, sampleCount, dims, threshold }`.
- `DELETE /voice/enroll` — `reset()`.
- Extend `GET /status` ([routes/status.ts](apps/brain/src/routes/status.ts)) with a `voiceId`
  block (`enrolled`, `sampleCount`) — **no embedding bytes leaked**.

### 1.4 Config (`config.ts`)
- `KRISHNA_VOICE_ID_ENABLED` (default `false`), `KRISHNA_VOICE_THRESHOLD` (default `0.85`).
- Document in [claude25thjune.md](claude25thjune.md) §0 env list and `.env`.

### 1.5 ⚠️ Interaction with the bundled-distribution work
The bundle plan ([BUNDLED_DISTRIBUTION_PLAN.md](BUNDLED_DISTRIBUTION_PLAN.md)) sets
`KRISHNA_RAG_DISABLED=true` to drop `@xenova/transformers` / `onnxruntime` off the boot path.
**Voice-ID re-introduces that dependency.** Resolve by: keep the model **lazy** (loads only on first
enroll/verify, not boot), and ensure the bundler ships `@xenova/transformers` + `onnxruntime-node`
+ the WavLM model cache when `KRISHNA_VOICE_ID_ENABLED=true`. Flag this to whoever finishes the
bundler so the two efforts don't collide.

---

## 2. Desktop frontend (fast path — ship this first)

### 2.1 Thread the waveform to the gate
- [KrishnaVAD.tsx:55](src/components/KrishnaVAD.tsx) `onSpeechEnd(audio)` already has the
  `Float32Array`. Reuse the **same WAV blob** that STT builds (`floatArrayToWav`) — don't re-encode.
- Extend `processCommand(transcription, opts)` → `processCommand(transcription, opts, audioWav?)`
  ([krishna.context.tsx:808](src/contexts/krishna.context.tsx)). Pass the blob through.

### 2.2 The gate (in `processCommand`, before the wake-word check ~line 1123)
- If voice-ID disabled or not enrolled → behave exactly as today.
- Else call `POST /voice/verify` **in parallel with STT** (don't add latency to the happy path).
- **Soft mode behavior:**
  - `match === true` → proceed normally.
  - `match === false` → set a `unverifiedSpeaker` flag on this command. The command still
    transcribes and the assistant still responds, **but force it through the existing confirmation
    gate** (`pendingConfirmationRef`) before *any* action executes — i.e. Krishna says something
    like *"I don't recognize your voice — confirm you want me to do this?"* and waits.
    Pure conversational replies may proceed but should be visibly tagged "unverified".
  - On verify error/timeout → fail-open (treat as verified) and log; never hard-block on a brain hiccup.
- Add a status surface: a small "verified ✓ / unverified ⚠" indicator in the presence/Status UI.

### 2.3 Enrollment UI (Settings → new "Voice ID" panel)
- Reuse [AudioRecorder.tsx](src/pages/chats/components/AudioRecorder.tsx) for capture.
- Flow: prompt the user to read **5 short varied phrases**; each recording → `POST /voice/enroll`;
  show `sampleCount`. "Done" when ≥5. Buttons: **Re-enroll** (DELETE then re-record), **Disable**.
- A **threshold slider** (0.70–0.95, default 0.85) writing `KRISHNA_VOICE_THRESHOLD` — soft mode
  makes tuning safe (no lockout). Show the live `score` from the last verify to help calibrate.
- A toggle for `KRISHNA_VOICE_ID_ENABLED`.

### 2.4 Desktop validation
- Enroll owner. Speak commands → verified, execute normally.
- Have a **different person** speak the same command → `match:false` → confirmation gate fires
  ("I don't recognize your voice…"). Owner can still confirm. ✅
- Disable toggle → behaves exactly as pre-feature.

---

## 3. Android frontend (the bigger lift)

### 3.1 ⚠️ Phase 0 SPIKE — do this BEFORE building anything else
Android STT uses the browser Web Speech API, which exposes no waveform. We need raw audio for
verify **without breaking the working STT path.** Spike the lowest-risk option first:

> **Option A (preferred): parallel `getUserMedia` + `MediaRecorder` in the webview.** Keep Web
> Speech for STT; simultaneously open a `MediaRecorder` on the mic to capture the utterance audio,
> then POST that blob to `/voice/verify`. **The risk to validate:** can Web Speech recognition and
> a `MediaRecorder` consume the mic *concurrently* on the target Android device/WebView? On some
> devices the second consumer is blocked. **Build a throwaway test screen and confirm on the real
> device before committing.**

If Option A fails the concurrency test, fall back to:

> **Option B: native capture via the Kotlin plugin.** Add an `AudioRecord`-based `captureUtterance()`
> command to the `device-control` plugin (see [ANDROID_CONTROL_PLAN.md](ANDROID_CONTROL_PLAN.md)) that
> records a short PCM buffer → base64 → JS → `/voice/verify`. More native code but no mic contention.

Record the spike outcome in this file before proceeding.

### 3.2 Wiring (once Phase 0 picks A or B)
- Capture utterance audio alongside the Web Speech transcript in
  [useMobileSpeech.ts](src/hooks/useMobileSpeech.ts); pass the blob into the same extended
  `processCommand(transcription, opts, audioWav)`.
- The **gate logic is shared** with desktop (§2.2) — only the *capture* differs. Keep the verify
  call, soft-mode behavior, and fail-open identical so there's one code path.
- Android talks to the brain over the network it already uses (Remote mode). Note added latency +
  that raw audio leaves the phone — acceptable for a personal app; document it.

### 3.3 Android validation
- Same as §2.4 but on the device: owner verified; a second speaker triggers the confirmation gate.
- Confirm STT still works exactly as before (the spike's whole point).

---

## 4. Build order & checkpoints
1. **Brain** §1 (embedding + store + routes + status). Validate with `curl` (enroll a sample WAV,
   verify same voice → high score; verify a different voice → low score).
2. **Desktop** §2 end-to-end. Validate §2.4. **Ship this — it's the working feature.**
3. **Android Phase 0 spike** §3.1. Decide A vs B.
4. **Android** §3.2 end-to-end. Validate §3.3.
5. Tune the default threshold from real verify scores; update `.env` + docs.

## 5. Out of scope (note, don't build)
- Multiple enrolled users / per-user profiles (this is 1 owner only).
- Full speaker diarization of overlapping speech — segment-level VAD gating + the confirmation
  gate is sufficient for "obey only me". Revisit only if cross-talk false-accepts show up in use.
- On-device offline Android verification (CAM++/onnxruntime-android) — only needed if the phone
  must verify with no brain reachable; deferred.

## 6. Files to create / touch
**Brain (new):** `src/voice-id/embedding.ts`, `src/voice-id/store.ts`, `src/voice-id/routes.ts`.
**Brain (edit):** `src/index.ts` (register routes), `src/db/migrations.ts` (voiceprints table),
`src/config.ts` (env), `src/routes/status.ts` (voiceId block).
**Frontend (edit):** `src/contexts/krishna.context.tsx` (extend `processCommand` + gate),
`src/components/KrishnaVAD.tsx` (pass blob), `src/hooks/useMobileSpeech.ts` (capture per Phase 0),
new Settings "Voice ID" panel under `src/pages/settings/`, a verified/unverified indicator in the
presence/Status UI, `src/lib/remote/remote-client.ts` (voice endpoints client).
**Android (maybe, Option B):** `captureUtterance` in the `device-control` Kotlin plugin.
