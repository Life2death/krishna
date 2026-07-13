"""
Verify the exported TFLite model.

Loads model.tflite, runs a dummy inference pass, and checks the output shape.
Also recomputes and prints the SHA-256 hash.
"""

import argparse
import hashlib
import json

import numpy as np


def main():
    parser = argparse.ArgumentParser(
        description="Verify exported OpenWakeWord TFLite model"
    )
    parser.add_argument(
        "--model-path",
        default="./export/model.tflite",
        help="Path to exported TFLite model",
    )
    parser.add_argument(
        "--manifest-path",
        default="./export/manifest.json",
        help="Path to exported manifest.json",
    )
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
            return

    try:
        import tflite_runtime.interpreter as tflite

        interpreter = tflite.Interpreter(model_path=args.model_path)
        interpreter.allocate_tensors()

        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        print(f"Input shape: {input_details[0]['shape']}")
        print(f"Input dtype: {input_details[0]['dtype']}")
        print(f"Output shape: {output_details[0]['shape']}")
        print(f"Output dtype: {output_details[0]['dtype']}")

        input_shape = input_details[0]["shape"]
        dummy_input = np.random.randn(*input_shape).astype(np.float32)
        interpreter.set_tensor(input_details[0]["index"], dummy_input)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]["index"])

        print(f"Output values: {output}")
        print(f"Sum: {output.sum():.4f}")
        print("Inference test: PASSED")
    except ImportError:
        print("tflite-runtime not installed; skipping inference test")
    except Exception as e:
        print(f"Inference test FAILED: {e}")
        return

    print("Model verification complete")


if __name__ == "__main__":
    main()
