"""
Generate Focus Assistant icons.

Run:  python scripts/generate-icons.py

Produces src-tauri/icons/*.png + icon.ico from a simple geometric design:
a blue gradient circle with a thin white focus-reticle and a centered "F".

Requires Pillow:  pip install Pillow
"""
from __future__ import annotations

import math
import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as e:  # pragma: no cover
    raise SystemExit("Pillow is required.  pip install Pillow") from e

ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "src-tauri" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

PRIMARY = (49, 130, 245)        # blue-500 ish
PRIMARY_DARK = (24, 75, 168)    # darker blue for gradient bottom
WHITE = (255, 255, 255)


def radial_gradient(size: int, inner: tuple[int, int, int], outer: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (size, size), outer)
    cx = cy = size / 2
    max_r = math.hypot(cx, cy)
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            r = math.hypot(x - cx, y - cy) / max_r
            r = min(max(r, 0.0), 1.0)
            pixels[x, y] = (
                int(inner[0] + (outer[0] - inner[0]) * r),
                int(inner[1] + (outer[1] - inner[1]) * r),
                int(inner[2] + (outer[2] - inner[2]) * r),
            )
    return img


def make_base(size: int) -> Image.Image:
    """Draw a 1024x1024-equivalent design then downscale as needed."""
    canvas = 1024
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))

    # Soft circular gradient background (blue → darker blue)
    grad = radial_gradient(canvas, PRIMARY, PRIMARY_DARK).convert("RGBA")
    mask = Image.new("L", (canvas, canvas), 0)
    d = ImageDraw.Draw(mask)
    pad = 28
    d.ellipse([pad, pad, canvas - pad, canvas - pad], fill=255)
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)

    # Outer focus ring
    ring = 18
    margin = 110
    draw.ellipse(
        [margin, margin, canvas - margin, canvas - margin],
        outline=(255, 255, 255, 220),
        width=ring,
    )

    # Inner small ring
    inner_margin = 280
    draw.ellipse(
        [inner_margin, inner_margin, canvas - inner_margin, canvas - inner_margin],
        outline=(255, 255, 255, 200),
        width=10,
    )

    # Cross-hairs (4 short ticks at N/E/S/W)
    cx = cy = canvas / 2
    tick_len = 80
    tick_w = 14
    tick_color = (255, 255, 255, 230)
    # north
    draw.line([(cx, 60), (cx, 60 + tick_len)], fill=tick_color, width=tick_w)
    # south
    draw.line([(cx, canvas - 60), (cx, canvas - 60 - tick_len)], fill=tick_color, width=tick_w)
    # west
    draw.line([(60, cy), (60 + tick_len, cy)], fill=tick_color, width=tick_w)
    # east
    draw.line([(canvas - 60, cy), (canvas - 60 - tick_len, cy)], fill=tick_color, width=tick_w)

    # Small centered dot
    dot_r = 38
    draw.ellipse(
        [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
        fill=(255, 255, 255, 255),
    )

    if size != canvas:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def save_png(img: Image.Image, name: str) -> None:
    path = ICONS_DIR / name
    img.save(path, "PNG")
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    base_1024 = make_base(1024)

    save_png(base_1024, "icon.png")
    save_png(make_base(32), "32x32.png")
    save_png(make_base(128), "128x128.png")
    save_png(make_base(256), "128x128@2x.png")
    save_png(make_base(512), "512x512.png")

    # Windows .ico (multi-resolution)
    ico_path = ICONS_DIR / "icon.ico"
    base_1024.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"wrote {ico_path.relative_to(ROOT)}")

    # macOS .icns — only generated when iconutil/png2icns isn't available we
    # fall back to a renamed PNG. Tauri's builder accepts this on Windows-only
    # builds; macOS builds will need iconutil on a Mac.
    try:
        import struct

        icns_path = ICONS_DIR / "icon.icns"
        # Minimal ICNS with a single 512x512 image — sufficient for cross-compile.
        # Pillow ≥9 can write ICNS directly.
        base_1024.resize((512, 512), Image.LANCZOS).save(icns_path, format="ICNS")
        print(f"wrote {icns_path.relative_to(ROOT)}")
    except Exception as e:
        print(f"icon.icns skipped: {e}")


if __name__ == "__main__":
    main()
