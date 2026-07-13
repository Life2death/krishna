"""
Generate synthetic training data for "Hey Krishna" wake-word detection.

Creates positive examples (wake-word phrases) and negative examples
(confuser phrases, noise, music snippets) for model training.

All processing runs locally; no data is uploaded.
"""

import argparse
import os
import random
import wave

import numpy as np
from scipy import signal

SAMPLE_RATE = 16000
DURATION_SEC = 1.5  # per clip
FRAME_LENGTH = 1280

POSITIVE_PHRASES = [
    "hey krishna",
    "hey krishnaa",
    "hey krishna",
    "hey krish-na",
    "hey krishna",
    "hey krishna",
    "krishna",
    "krishnaa",
    "krisna",
    "hey krishna",
]

CONFUSER_PHRASES = [
    "okay google",
    "hey siri",
    "alexa",
    "hey google",
    "hello bixby",
    "okay computer",
    "listen up",
    "hello assistant",
    "wake up",
    "hey cortana",
]

NOISE_TYPES = ["silence", "white", "pink", "brown"]


def generate_pink_noise(duration_samples: int) -> np.ndarray:
    white = np.random.randn(duration_samples)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    pink = signal.lfilter(b, a, white)
    return pink / np.max(np.abs(pink))


def generate_tone_sequence(
    duration_samples: int, frequencies: list[float]
) -> np.ndarray:
    t = np.arange(duration_samples) / SAMPLE_RATE
    result = np.zeros(duration_samples, dtype=np.float32)
    seg_len = duration_samples // len(frequencies)
    for i, freq in enumerate(frequencies):
        start = i * seg_len
        end = min(start + seg_len, duration_samples)
        result[start:end] += 0.3 * np.sin(2 * np.pi * freq * t[start:end])
    return result / np.max(np.abs(result))


def generate_speech_like(duration_samples: int) -> np.ndarray:
    """Generate speech-simulating amplitude-modulated noise."""
    t = np.arange(duration_samples) / SAMPLE_RATE
    carrier = np.random.randn(duration_samples)
    mod_freq = random.uniform(3, 8)
    envelope = 0.5 * (1 + np.sin(2 * np.pi * mod_freq * t))
    return carrier * envelope / np.max(np.abs(carrier * envelope))


def create_synthetic_clip(
    phrase: str, sample_rate: int, duration: float
) -> np.ndarray:
    """Create a synthetic speech-like clip with approximate phoneme timing."""
    samples = int(sample_rate * duration)
    word_count = max(1, len(phrase.split()))
    word_duration = samples // word_count
    clip = np.zeros(samples, dtype=np.float32)

    for i, word in enumerate(phrase.split()):
        start = i * word_duration
        end = min(start + word_duration, samples)
        seg_len = end - start
        if seg_len <= 0:
            continue
        envelope = np.ones(seg_len, dtype=np.float32)
        attack = int(seg_len * 0.1)
        release = int(seg_len * 0.15)
        if attack > 0:
            envelope[:attack] = np.linspace(0, 1, attack)
        if release > 0:
            envelope[-release:] = np.linspace(1, 0, release)
        formant1 = random.uniform(400, 800)
        formant2 = random.uniform(1000, 2500)
        t = np.arange(seg_len) / sample_rate
        tone = (
            0.4 * np.sin(2 * np.pi * formant1 * t)
            + 0.2 * np.sin(2 * np.pi * formant2 * t)
            + 0.1 * np.random.randn(seg_len)
        )
        clip[start:end] = tone * envelope

    clip = clip / np.max(np.abs(clip)) * 0.7
    return clip.astype(np.float32)


def main():
    parser = argparse.ArgumentParser(
        description="Generate synthetic training data for Hey Krishna wake word"
    )
    parser.add_argument(
        "--output-dir",
        default="./data/training",
        help="Output directory for training clips",
    )
    parser.add_argument(
        "--positive-count",
        type=int,
        default=500,
        help="Number of positive clips to generate",
    )
    parser.add_argument(
        "--negative-count",
        type=int,
        default=1000,
        help="Number of negative clips to generate",
    )
    args = parser.parse_args()

    pos_dir = os.path.join(args.output_dir, "positive")
    neg_dir = os.path.join(args.output_dir, "negative")
    confuser_dir = os.path.join(args.output_dir, "confuser")
    noise_dir = os.path.join(args.output_dir, "noise")

    for d in [pos_dir, neg_dir, confuser_dir, noise_dir]:
        os.makedirs(d, exist_ok=True)

    print(f"Generating {args.positive_count} positive clips...")
    for i in range(args.positive_count):
        phrase = random.choice(POSITIVE_PHRASES)
        clip = create_synthetic_clip(phrase, SAMPLE_RATE, DURATION_SEC)
        path = os.path.join(pos_dir, f"positive_{i:04d}.wav")
        _save_wav(path, clip, SAMPLE_RATE)

    print(f"Generating {args.negative_count} negative clips...")
    confuser_count = args.negative_count // 2
    noise_count = args.negative_count - confuser_count

    for i in range(confuser_count):
        phrase = random.choice(CONFUSER_PHRASES)
        clip = create_synthetic_clip(phrase, SAMPLE_RATE, DURATION_SEC)
        path = os.path.join(confuser_dir, f"confuser_{i:04d}.wav")
        _save_wav(path, clip, SAMPLE_RATE)

    for i in range(noise_count):
        noise_type = random.choice(NOISE_TYPES)
        samples = int(SAMPLE_RATE * DURATION_SEC)
        if noise_type == "silence":
            clip = np.zeros(samples, dtype=np.float32)
        elif noise_type == "white":
            clip = np.random.randn(samples).astype(np.float32) * 0.3
        elif noise_type == "pink":
            clip = generate_pink_noise(samples).astype(np.float32) * 0.3
        elif noise_type == "brown":
            clip = np.cumsum(np.random.randn(samples)).astype(np.float32)
            clip = clip / np.max(np.abs(clip)) * 0.3
        else:
            clip = np.random.randn(samples).astype(np.float32) * 0.3
        path = os.path.join(noise_dir, f"{noise_type}_{i:04d}.wav")
        _save_wav(path, clip, SAMPLE_RATE)

    print(f"Done: {args.positive_count} positive, {args.negative_count} negative")
    print(f"Output: {os.path.abspath(args.output_dir)}")


def _save_wav(path: str, data: np.ndarray, sample_rate: int):
    data_int16 = (data * 32767).astype(np.int16)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(data_int16.tobytes())


if __name__ == "__main__":
    main()
