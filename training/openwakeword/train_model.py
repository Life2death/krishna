"""
Train a direct-waveform "Hey Krishna" detection model and export to TFLite.

Architecture matches Android OpenWakeWordDetector contract:
  Input:  float32[1, 8000]  — 0.5s of 16 kHz PCM, normalised to [-1, 1]
  Output: float32[1, 1]    — wake-word probability (sigmoid)

Very lightweight model for quick CPU training.
"""

import argparse
import hashlib
import json
import os

import numpy as np
import tensorflow as tf
from tensorflow import keras

SAMPLE_RATE = 16000
CONTEXT_SAMPLES = 8000
FRAME_SAMPLES = 1280
MODEL_VERSION = "krishna-waveform-v1.0.0"
TRAINER_VERSION = "krishna-waveform-0.1.0"


def load_wav(path: str) -> np.ndarray:
    raw = tf.io.read_file(path)
    audio, sr = tf.audio.decode_wav(raw, desired_channels=1, desired_samples=-1)
    audio = tf.squeeze(audio, axis=-1).numpy().astype(np.float32)
    if sr.numpy() != SAMPLE_RATE:
        audio = np.array(tf.signal.resample(audio, int(len(audio) * SAMPLE_RATE / sr.numpy())))
    peak = np.max(np.abs(audio))
    if peak > 1e-6:
        audio /= peak
    return audio


def extract_windows(audio: np.ndarray, label: int) -> list:
    if len(audio) < CONTEXT_SAMPLES:
        padded = np.zeros(CONTEXT_SAMPLES, dtype=np.float32)
        padded[:len(audio)] = audio
        return [(padded, label)]
    stride = CONTEXT_SAMPLES // 2
    out = []
    for start in range(0, len(audio) - CONTEXT_SAMPLES + 1, stride):
        out.append((audio[start:start + CONTEXT_SAMPLES], label))
    return out


def load_dataset(data_dir: str) -> tuple:
    features, labels = [], []
    for root, _, files in os.walk(os.path.join(data_dir, "positive")):
        for fname in files:
            if not fname.endswith(".wav"):
                continue
            for w, l in extract_windows(load_wav(os.path.join(root, fname)), 1):
                features.append(w)
                labels.append(l)
    for category in ("negative", "noise", "confuser"):
        cat_dir = os.path.join(data_dir, category)
        if not os.path.isdir(cat_dir):
            continue
        for root, _, files in os.walk(cat_dir):
            for fname in files:
                if not fname.endswith(".wav"):
                    continue
                for w, l in extract_windows(load_wav(os.path.join(root, fname)), 0):
                    features.append(w)
                    labels.append(l)
    if not features:
        raise ValueError("No training data found")
    X = np.array(features, dtype=np.float32)
    y = np.array(labels, dtype=np.float32)
    idx = np.random.RandomState(42).permutation(len(X))
    return X[idx], y[idx]


def build_model() -> keras.Model:
    # Input shape must be (8000,) so TFLite export has shape [1, 8000]
    inputs = keras.Input(shape=(CONTEXT_SAMPLES,), name="waveform_input")
    x = keras.layers.Reshape((CONTEXT_SAMPLES, 1))(inputs)
    x = keras.layers.Conv1D(8, kernel_size=5, strides=4, activation="relu", padding="same")(x)
    x = keras.layers.Conv1D(16, kernel_size=5, strides=4, activation="relu", padding="same")(x)
    x = keras.layers.GlobalAveragePooling1D()(x)
    x = keras.layers.Dense(16, activation="relu")(x)
    x = keras.layers.Dropout(0.3)(x)
    outputs = keras.layers.Dense(1, activation="sigmoid", name="wake_probability")(x)
    return keras.Model(inputs, outputs, name="krishna_wake_word")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="./data/training")
    parser.add_argument("--export-dir", default="./export")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    os.makedirs(args.export_dir, exist_ok=True)

    print("Loading dataset...")
    X, y = load_dataset(args.data_dir)
    print(f"Loaded {len(X)} windows, pos={(y == 1).sum()}, neg={(y == 0).sum()}")

    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    model = build_model()
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()

    print("Training...")
    model.fit(
        X_train, y_train,
        epochs=args.epochs,
        batch_size=args.batch_size,
        validation_data=(X_test, y_test),
        callbacks=[
            keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
        ],
        verbose=2,
    )

    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    y_pred = model.predict(X_test, verbose=0).flatten()
    y_pred_bin = (y_pred > 0.5).astype(np.float32)
    fp = ((y_pred_bin == 1) & (y_test == 0)).sum()
    fn = ((y_pred_bin == 0) & (y_test == 1)).sum()
    tp = ((y_pred_bin == 1) & (y_test == 1)).sum()
    tn = ((y_pred_bin == 0) & (y_test == 0)).sum()
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    fpr = fp / max(fp + tn, 1)
    print(f"Test accuracy: {test_acc:.4f}, precision: {precision:.4f}, recall: {recall:.4f}, FPR: {fpr:.4f}")

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()

    tflite_path = os.path.join(args.export_dir, "model.tflite")
    with open(tflite_path, "wb") as f:
        f.write(tflite_model)

    sha256 = hashlib.sha256(tflite_model).hexdigest()

    # Verify TFLite
    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    print(f"TFLite input:  shape={inp['shape']}, dtype={inp['dtype']}")
    print(f"TFLite output: shape={out['shape']}, dtype={out['dtype']}")

    manifest = {
        "modelVersion": MODEL_VERSION,
        "sha256": sha256,
        "sampleRate": SAMPLE_RATE,
        "frameLength": FRAME_SAMPLES,
        "inputSamples": CONTEXT_SAMPLES,
        "inputShape": [int(d) for d in inp["shape"]],
        "inputDtype": "float32",
        "outputShape": [int(d) for d in out["shape"]],
        "outputDtype": "float32",
        "outputLabels": ["wake_probability"],
        "trainerVersion": TRAINER_VERSION,
        "trainingDate": "2026-07-13",
        "testMetrics": {
            "accuracy": float(round(test_acc, 4)),
            "precision": float(round(precision, 4)),
            "recall": float(round(recall, 4)),
            "falsePositiveRate": float(round(fpr, 4)),
        },
    }

    with open(os.path.join(args.export_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nModel exported: {tflite_path} ({len(tflite_model) / 1024:.1f} KB)")
    print(f"SHA-256: {sha256}")

    # Smoke test
    dummy = np.random.randn(1, CONTEXT_SAMPLES).astype(np.float32)
    interpreter.set_tensor(inp["index"], dummy)
    interpreter.invoke()
    print(f"Smoke inference output: {interpreter.get_tensor(out['index']).flatten()}")


if __name__ == "__main__":
    main()
