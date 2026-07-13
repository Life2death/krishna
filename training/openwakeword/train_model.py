"""
Train an OpenWakeWord-compatible "Hey Krishna" detection model and export to TFLite.

Uses mel-filterbank features and a small convolutional classifier.
Output is a TFLite model ready for Android deployment.
"""

import argparse
import json
import os
import hashlib

import numpy as np
import librosa
import tensorflow as tf
from tensorflow import keras

SAMPLE_RATE = 16000
FRAME_LENGTH = 1280  # 80ms at 16kHz
HOP_LENGTH = 1280
N_MELS = 128
MODEL_VERSION = "oww-v1.0.0"


def extract_features(wav_path: str) -> np.ndarray:
    y, sr = librosa.load(wav_path, sr=SAMPLE_RATE, mono=True)
    mel = librosa.feature.melspectrogram(
        y=y,
        sr=sr,
        n_fft=FRAME_LENGTH,
        hop_length=HOP_LENGTH,
        n_mels=N_MELS,
    )
    log_mel = librosa.power_to_db(mel, ref=np.max)
    return log_mel.T  # (frames, n_mels)


def load_dataset(data_dir: str, label: int) -> tuple[np.ndarray, np.ndarray]:
    features_list = []
    labels_list = []

    for root, dirs, files in os.walk(os.path.join(data_dir, "positive")):
        for fname in files:
            if fname.endswith(".wav"):
                path = os.path.join(root, fname)
                feats = extract_features(path)
                features_list.append(feats)
                labels_list.append(1)

    for category in ["negative", "noise", "confuser"]:
        cat_dir = os.path.join(data_dir, category)
        if not os.path.isdir(cat_dir):
            continue
        for root, dirs, files in os.walk(cat_dir):
            for fname in files:
                if fname.endswith(".wav"):
                    path = os.path.join(root, fname)
                    feats = extract_features(path)
                    features_list.append(feats)
                    labels_list.append(0 if category == "confuser" else 0)

    if not features_list:
        raise ValueError("No training data found")

    max_frames = max(f.shape[0] for f in features_list)
    padded = []
    for f in features_list:
        if f.shape[0] < max_frames:
            pad_width = max_frames - f.shape[0]
            f = np.pad(f, ((0, pad_width), (0, 0)), mode="constant")
        padded.append(f)

    return np.array(padded, dtype=np.float32), np.array(labels_list, dtype=np.int32)


def build_model(input_shape: tuple) -> keras.Model:
    inputs = keras.Input(shape=input_shape, name="mel_input")
    x = keras.layers.Conv2D(16, (3, 3), activation="relu", padding="same")(inputs)
    x = keras.layers.MaxPooling2D((2, 2))(x)
    x = keras.layers.Conv2D(32, (3, 3), activation="relu", padding="same")(x)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dense(32, activation="relu")(x)
    x = keras.layers.Dropout(0.3)(x)
    outputs = keras.layers.Dense(2, activation="softmax", name="output")(x)
    return keras.Model(inputs, outputs, name="openwakeword_hey_krishna")


def main():
    parser = argparse.ArgumentParser(
        description="Train OpenWakeWord Hey Krishna model"
    )
    parser.add_argument(
        "--data-dir",
        default="./data/training",
        help="Directory with positive/negative/noise/confuser subdirs",
    )
    parser.add_argument(
        "--export-dir",
        default="./export",
        help="Output directory for exported model",
    )
    parser.add_argument(
        "--epochs", type=int, default=50, help="Number of training epochs"
    )
    args = parser.parse_args()

    os.makedirs(args.export_dir, exist_ok=True)

    print("Loading dataset...")
    X, y = load_dataset(args.data_dir, label=1)

    # Reshape for Conv2D: (samples, frames, n_mels, 1)
    X = X[..., np.newaxis]

    n_samples = X.shape[0]
    print(f"Loaded {n_samples} samples, shape: {X.shape[1:]}")

    split = int(n_samples * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    model = build_model(input_shape=X.shape[1:])
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()

    print("Training...")
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=10, restore_best_weights=True
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=5, min_lr=1e-6
        ),
    ]
    model.fit(
        X_train,
        y_train,
        epochs=args.epochs,
        batch_size=32,
        validation_data=(X_test, y_test),
        callbacks=callbacks,
        verbose=2,
    )

    print("Converting to TFLite...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS,
        tf.lite.OpsSet.SELECT_TF_OPS,
    ]
    tflite_model = converter.convert()

    tflite_path = os.path.join(args.export_dir, "model.tflite")
    with open(tflite_path, "wb") as f:
        f.write(tflite_model)

    sha256 = hashlib.sha256(tflite_model).hexdigest()

    manifest = {
        "modelVersion": MODEL_VERSION,
        "sha256": sha256,
        "sampleRate": SAMPLE_RATE,
        "frameLength": FRAME_LENGTH,
        "inputFeatures": N_MELS,
        "outputLabels": ["non_wake_word", "hey_krishna"],
        "trainingDate": "2026-07-13",
        "trainerVersion": "openwakeword-0.1.0",
    }

    manifest_path = os.path.join(args.export_dir, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Model exported: {tflite_path}")
    print(f"Manifest: {manifest_path}")
    print(f"SHA-256: {sha256}")
    print(f"Model size: {len(tflite_model) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
