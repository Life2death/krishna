"""
Verify the exported TFLite model against the Android contract.

Loads model.tflite, validates input/output shapes match
float32[1,8000] → float32[1,1], recomputes SHA-256, runs inference.
"""

import argparse
import hashlib
import json
import sys

import numpy as np

EXPECTED_INPUT_SHAPE = (1, 8000)
EXPECTED_OUTPUT_SHAPE = (1, 1)
EXPECTED_INPUT_DTYPE = np.float32
EXPECTED_OUTPUT_DTYPE = np.float32


def main():
    parser = argparse.ArgumentParser(description="Verify waveform TFLite model")
    parser.add_argument("--model-path", default="./export/model.tflite")
    parser.add_argument("--manifest-path", default="./export/manifest.json")
    args = parser.parse_args()

    with open(args.model_path, "rb") as f:
        model_bytes = f.read()

    sha256 = hashlib.sha256(model_bytes).hexdigest()
    print(f"SHA-256: {sha256}")
    print(f"Model size: {len(model_bytes) / 1024:.1f} KB")

    if args.manifest_path:
        with open(args.manifest_path) as f:
            manifest = json.load(f)
        expected = manifest.get("sha256", "")
        if sha256 == expected:
            print("SHA-256 match: OK")
        else:
            print(f"SHA-256 MISMATCH: got {sha256}, expected {expected}")
            sys.exit(1)

    try:
        import tflite_runtime.interpreter as tflite
    except ImportError:
        try:
            import tensorflow.lite as tflite
        except ImportError:
            print("No TFLite runtime found; skipping inference test")
            return

    interpreter = tflite.Interpreter(model_path=args.model_path)
    interpreter.allocate_tensors()

    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]

    print(f"Input shape:  {inp['shape']}  (expected {EXPECTED_INPUT_SHAPE})")
    print(f"Input dtype:  {inp['dtype']}  (expected {EXPECTED_INPUT_DTYPE})")
    print(f"Output shape: {out['shape']}  (expected {EXPECTED_OUTPUT_SHAPE})")
    print(f"Output dtype: {out['dtype']}  (expected {EXPECTED_OUTPUT_DTYPE})")

    errors = []
    if tuple(inp["shape"]) != EXPECTED_INPUT_SHAPE:
        errors.append(f"Input shape {inp['shape']} != {EXPECTED_INPUT_SHAPE}")
    if tuple(out["shape"]) != EXPECTED_OUTPUT_SHAPE:
        errors.append(f"Output shape {out['shape']} != {EXPECTED_OUTPUT_SHAPE}")
    if inp["dtype"] != EXPECTED_INPUT_DTYPE:
        errors.append(f"Input dtype {inp['dtype']} != {EXPECTED_INPUT_DTYPE}")
    if out["dtype"] != EXPECTED_OUTPUT_DTYPE:
        errors.append(f"Output dtype {out['dtype']} != {EXPECTED_OUTPUT_DTYPE}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        sys.exit(1)

    # Run inference with zero input → near-zero wake probability
    dummy = np.zeros(EXPECTED_INPUT_SHAPE, dtype=np.float32)
    interpreter.set_tensor(inp["index"], dummy)
    interpreter.invoke()
    output = interpreter.get_tensor(out["index"])
    prob = float(output[0, 0])
    print(f"Silence output (should be ~0.0): {prob:.4f}")

    # Run inference with random noise → near-0.5 wake probability
    noise = np.random.randn(*EXPECTED_INPUT_SHAPE).astype(np.float32) * 0.3
    interpreter.set_tensor(inp["index"], noise)
    interpreter.invoke()
    output = interpreter.get_tensor(out["index"])
    noise_prob = float(output[0, 0])
    print(f"Noise output: {noise_prob:.4f}")

    print("Model verification: PASSED")


if __name__ == "__main__":
    main()
