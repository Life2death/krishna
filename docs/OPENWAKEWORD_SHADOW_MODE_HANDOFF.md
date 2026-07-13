# OpenWakeWord Shadow-Mode Handover

## Objective

Replace the experimental Sherpa wake-word gate on Android with a local OpenWakeWord-based `Hey Krishna` detector. Keep the existing command execution path unchanged:

`local wake gate -> one SpeechRecognizer command turn -> existing safe command parser/accessibility actions`

The detector must not request Android audio focus while it is idle. This is required so YouTube Music can keep playing until Krishna has actually been awakened.

## Current Findings

- The current implementation is in `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/KrishnaHandsFreeService.kt` and `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/SherpaWakeWordDetector.kt`.
- The Sherpa JNI integration, model loading, and decoder work against the vendor WAV self-test, but live `Hey Krishna` attempts do not match.
- Android diagnostics show Krishna currently records from `AUDIO_DEVICE_IN_BUILTIN_MIC`, not the connected Bluetooth headset microphone.
- Bluetooth headset capture requires SCO/HFP routing. Do not enable it by default because it can change music routing or reduce Bluetooth playback quality.
- Classic Android voice, desktop voice, Realtime voice, accessibility controls, and the fast-command lane must remain intact.

## Non-Negotiable Guardrails

1. Do not request `AudioManager` audio focus from the idle wake detector.
2. Do not call cloud STT, OpenAI, or any network service while detecting the wake phrase.
3. Do not auto-enable the new detector when training data reaches a counter. Require a quality gate and an explicit user approval.
4. Do not collect or retain raw voice audio without an explicit local opt-in.
5. Do not stage, reset, revert, or commit unrelated working-tree changes. The repository is already dirty and contains unrelated Android, YouTube Music, test, screenshot, and temporary-file changes.
6. Do not commit generated models, APKs, recordings, screenshots, `tmp/`, API keys, or other secrets unless the maintainer explicitly approves the exact files.
7. Do not merge to `main`. Push a dedicated feature branch and open a pull request for review.

## Required Deliverable

Implement this in a feature branch named `codex/openwakeword-shadow-mode` with focused commits and a pull request. The PR must include:

- OpenWakeWord-compatible Android inference in shadow mode.
- A local training-data counter and opt-in workflow.
- A reproducible local model-training/export procedure.
- Settings UI for progress, consent, diagnostics, reset, and final approval.
- Unit tests for framing, score smoothing, state transitions, counters, and activation gates.
- Android build/test results and a manual music-continuity test checklist.
- Updated documentation and third-party attribution.

## Architecture

### 1. Model Training and Export

Use OpenWakeWord training tooling to create a synthetic base model for `Hey Krishna` and pronunciation variants. Prefer a TFLite/LiteRT-compatible export for Android. Keep the training environment separate from the Android app.

Create a training directory, configuration, and documented command flow. It must:

- Generate synthetic positive examples for variants such as `Hey Krishna`, `Hey Krish-na`, and natural Indian-English pronunciations.
- Include confuser phrases and negative speech/noise/music examples.
- Export a versioned model manifest with SHA-256 hashes and expected input format.
- Run locally only; do not upload voice clips to a hosted trainer.
- Document required Python, model, and hardware dependencies. Use WSL or Docker only if native Windows training is not reproducible.

The synthetic model is the initial candidate. The later counter calibrates and evaluates it for the actual user and device; it does not promise to train a high-quality model from arbitrary conversations.

### 2. Android Runtime

Create an `OpenWakeWordDetector` under `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/`.

- Read 16 kHz mono PCM with `AudioRecord` on a worker thread.
- Run feature extraction, embedding, and classifier inference using LiteRT/TFLite or an equivalent fully local runtime.
- Process the model's required frame size without allocations in the hot loop.
- Smooth scores across consecutive frames, enforce a cooldown, and emit one wake event per detection.
- Record diagnostic metadata only: detector state, model version, max score, threshold, frame count, and error reason. Do not log raw transcript or raw audio.
- On an accepted match, stop the wake detector before starting the existing `SpeechRecognizer` command turn. Restart the detector after command completion or error.
- Keep microphone source selection explicit. Default to built-in mic. A headset-mic option must be opt-in and clearly describe the SCO/HFP music tradeoff.

Do not retain the Sherpa detector and OpenWakeWord detector as competing production paths. Keep Sherpa only behind a development-only diagnostic switch during migration, then remove it before final release approval.

### 3. Shadow Mode and Training Counter

Add a persistent local wake-word profile. It needs at least:

| Field | Purpose |
| --- | --- |
| `enabled` | Enables/disables OpenWakeWord shadow mode. |
| `modelVersion` | Identifies the candidate model and hashes. |
| `consentGrantedAt` | Required before any raw training clip is saved. |
| `positiveCount` | Count of confirmed `Hey Krishna` clips. |
| `negativeCount` | Count of confirmed non-wake clips. |
| `environmentCount` | Tracks distinct sessions/days/device routes. |
| `startedAt` | Enforces the minimum observation period. |
| `evaluationStatus` | `collecting`, `ready_for_evaluation`, `passed`, or `failed`. |
| `activationApprovedAt` | Set only after an explicit user approval. |
| `lastError` | Safe diagnostic text; never audio/transcript content. |

Use **eligible labeled samples**, not raw conversation count:

- Positive: an opt-in training interaction where the user intentionally says `Hey Krishna` and confirms the capture.
- Negative: an opt-in non-wake sample, such as normal speech or music, which the user confirms should not wake Krishna.
- Ignore ordinary conversations unless they are explicitly labeled; unlabelled audio cannot safely train or evaluate a wake detector.

Initial readiness gate:

- At least 100 confirmed positive clips.
- At least 200 confirmed negative clips.
- At least 3 separate days or environments.
- At least 48 elapsed hours from first collection.

After the counter is full, run a held-out local evaluation. Require both a configured recall target and a configured false-wake target before changing status to `passed`. The app must still wait for the user to click **Approve and enable OpenWakeWord**.

### 4. Privacy and Retention

- Make audio capture opt-in, explain exactly why it is stored, and show the current storage size.
- Store recordings only in app-private storage. Encrypt them if the project already has an Android-supported encryption mechanism; otherwise document the platform storage protection and do not claim application-level encryption.
- Add a settings action to delete all clips, counters, model evaluation results, and generated local artifacts.
- Default retention: delete raw clips after successful evaluation and retain aggregate metrics only. Keep an explicit option to retain clips for retraining.
- Training and evaluation must be manually triggered or run on-device/local desktop only. Never transmit clips to GitHub, OpenAI, analytics, or a third party.

### 5. Settings and UX

Add a Wake Word section to the shared settings UI. It must work in the Android app and not break desktop settings.

Required controls:

- `OpenWakeWord shadow mode` toggle.
- Training-data consent toggle and clear privacy text.
- Positive/negative/environment progress counter.
- `Record training sample` flow with explicit label/confirmation.
- Model version, threshold, last score, and last safe diagnostic state.
- `Run local evaluation` action when the readiness gate is reached.
- `Approve and enable` action only when evaluation passed.
- `Reset/delete local wake-word data` action with confirmation.
- Optional `Use Bluetooth headset microphone` setting with SCO/HFP warning; leave disabled by default.

Do not add an always-on score dashboard to normal UI. Keep detailed scores in Dev Space and concise readiness state in Settings.

## Suggested File Boundaries

- `src-tauri/gen/android/app/build.gradle.kts`: add only required LiteRT/TFLite dependencies.
- `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/OpenWakeWordDetector.kt`: framing, inference, smoothing, cooldown, lifecycle.
- `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/KrishnaHandsFreeService.kt`: detector selection and one-turn handoff only.
- `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/WakeWordProfileStore.kt`: Android-local profile, counters, and consent state.
- `src-tauri/gen/android/app/src/main/java/com/krishna/assistant/WakeWordTrainingStore.kt`: opt-in clip metadata/storage and deletion.
- `src/lib/storage/` and `src/pages/settings/`: shared settings UI/state only where existing project conventions require it.
- `scripts/` or `training/openwakeword/`: reproducible local training/export/manifest workflow.
- `docs/`: setup, privacy, model provenance, validation, and operator instructions.
- `src-tauri/gen/android/app/src/test/`: focused Android unit tests.

Adjust names only when existing repository conventions require it. Do not change core packages unless a shared setting cannot be implemented cleanly in `src/`.

## Validation Requirements

Run and report:

```powershell
npx tsc --noEmit
npx vitest run
Set-Location src-tauri/gen/android
.\gradlew.bat :app:testUniversalDebugUnitTest
```

Build the universal debug APK using the repository's approved Tauri Android command. If direct Gradle invokes Tauri Android Studio bridge tasks, reuse the documented task exclusions only after confirming the current ARM64 Rust library is fresh.

Manual phone checks:

1. Start YouTube Music and leave the detector idle for at least 30 minutes. No repeated pause/resume cycle is allowed.
2. Confirm wake detection starts exactly one command-recognition turn.
3. Confirm failed/empty commands return to idle detection.
4. Confirm offline wake detection remains local and does not attempt a network request.
5. Confirm a reset removes training clips/counters and disables approval state.
6. Verify phone mic default and opt-in Bluetooth SCO behavior separately.

## GitHub Delivery Rules

1. Start by recording `git status --short` and `git diff --name-only`.
2. Create `codex/openwakeword-shadow-mode`; do not use `main`.
3. Stage only files created or modified for this feature. Never use `git add -A`.
4. Exclude existing screenshots, `tmp/`, APKs, generated model binaries, and unrelated modified files.
5. Make focused commits with test results in commit messages or PR description.
6. Push the branch and open a draft pull request. Do not merge it.
7. Report the branch, commit hashes, PR URL, changed-file list, tests run, APK path, known limitations, and exact manual phone test steps.

## Definition of Done

The feature is ready for review when the Android app has a local OpenWakeWord shadow detector, explicit training consent, correct local counters, quality/approval gates, reproducible model instructions, passing targeted tests, and a PR that contains no unrelated existing work.

It is ready for production activation only after the configured data/evaluation gates pass and the user explicitly approves the switch.
