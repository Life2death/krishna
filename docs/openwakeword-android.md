# OpenWakeWord Android Integration

OpenWakeWord provides on-device "Hey Krishna" wake-word detection using TFLite/LiteRT. It replaces the experimental Sherpa-ONNX gate as the primary wake-word detector.

## Architecture

```
AudioRecord (16 kHz mono PCM)
  │
  ▼
Feature extraction (mel-filterbank, 128 bins)
  │
  ▼
TFLite model inference (convolutional classifier)
  │
  ▼
Score smoothing (5-frame moving average)
  │
  ▼
Threshold check → cooldown gate → wake event
  │
  ▼
Stop detector → start SpeechRecognizer (one turn)
  │
  ▼
Command handled → restart detector
```

## File layout

```
src-tauri/gen/android/app/src/main/
├── assets/
│   └── wake-word/
│       └── openwakeword/
│           ├── model.tflite          # Trained model
│           └── manifest.json         # Version + SHA-256
├── java/com/krishna/assistant/
│   ├── OpenWakeWordDetector.kt       # Core inference engine
│   ├── WakeWordProfileStore.kt       # Persistent counters/state
│   ├── WakeWordTrainingStore.kt      # Training clip management
│   └── KrishnaHandsFreeService.kt    # Orchestration with fallback
```

## Model deployment

1. Train locally: `cd training/openwakeword && python train_model.py`
2. Copy `export/model.tflite` to `src-tauri/gen/android/app/src/main/assets/wake-word/openwakeword/model.tflite`
3. Copy `export/manifest.json` to `src-tauri/gen/android/app/src/main/assets/wake-word/openwakeword/manifest.json`

## Detector lifecycle

| State | Description |
|---|---|
| `idle` | Resources released |
| `starting` | Loading model and initializing AudioRecord |
| `listening` | Actively processing audio frames |
| `detected` | Wake word matched; about to fire callback |
| `stopped` | User or system stopped detection |
| `releasing` | Releasing audio and model resources |

## Shadow mode flow

1. User enables shadow mode in Settings
2. User grants training consent
3. User records positive (`Hey Krishna`) and negative (non-wake) clips
4. Readiness gate unlocks at 100+ positive, 200+ negative, 3+ environments, 48+ hours
5. Local evaluation runs (simulated recall + false-wake check)
6. User clicks "Approve and enable OpenWakeWord"
7. `KrishnaHandsFreeService` uses `OpenWakeWordDetector` for wake gating

## Audio source selection

- **Built-in mic (default)**: `MediaRecorder.AudioSource.MIC` — no impact on music playback
- **Bluetooth SCO**: `MediaRecorder.AudioSource.VOICE_COMMUNICATION` — may reduce music quality

No audio focus is requested while the detector is idle. `AudioRecord` captures without affecting media playback.

## Diagnostic metadata only

The detector logs:
- Detector state transitions
- Model version (from manifest)
- Max score per detection
- Threshold
- Frame count
- Error reason (safe text only)

Raw audio and transcript content are never logged.

## Third-party attribution

OpenWakeWord uses TensorFlow Lite (LiteRT) under the Apache 2.0 license.
See `docs/ATTRIBUTION.md` for full license text.
