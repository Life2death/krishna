# OpenWakeWord Model Training

This directory contains the tooling and configuration for training a synthetic "Hey Krishna" wake-word model for Android (TFLite/LiteRT export).

## Prerequisites

- Python 3.10+
- pip
- 4 GB RAM (8 GB recommended for training)

## Setup

```powershell
# Create a virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

## Training Workflow

### 1. Generate synthetic training data

```powershell
python generate_synthetic_data.py
```

This creates positive examples (variants of "Hey Krishna") and negative examples (confuser phrases, noise, music) under `./data/training/`.

### 2. Train the model

```powershell
python train_model.py
```

The training script uses OpenWakeWord's architecture with mel-filterbank features and a small convolutional classifier. Output:

- `export/model.tflite` — TFLite model for Android
- `export/manifest.json` — Versioned manifest with SHA-256 hashes

### 3. Verify the exported model

```powershell
python verify_export.py
```

This runs a quick inference test on the exported TFLite model and prints the SHA-256 hash.

## Model Architecture

- Input: 16 kHz mono PCM, 1280-sample frames (80ms)
- Features: 128-bin mel-filterbank energies
- Classifier: 2-layer convolutional network with 2 outputs
  - Output[0]: non-wake-word score
  - Output[1]: wake-word score
- Threshold: 0.5 (configurable at runtime)

## Manifest Format

The `manifest.json` contains:

```json
{
  "modelVersion": "oww-v1.0.0",
  "sha256": "<hex hash>",
  "sampleRate": 16000,
  "frameLength": 1280,
  "inputFeatures": 128,
  "outputLabels": ["non_wake_word", "hey_krishna"],
  "trainingDate": "2026-07-13",
  "trainerVersion": "openwakeword-0.1.0"
}
```

## Deploying to Android

Copy `export/model.tflite` and `export/manifest.json` to:

```
src-tauri/gen/android/app/src/main/assets/wake-word/openwakeword/
```

See `docs/openwakeword-android.md` for runtime integration details.

## Privacy

- All training runs locally. No data is uploaded.
- Synthetic data is generated from text templates and augmentation, not real recordings.
- Real-user training clips (for the counter/gate workflow) are stored only in app-private storage.
