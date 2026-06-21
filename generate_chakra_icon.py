"""
Generate Krishna's app/tray icon: a gold Sudarshan Chakra medallion.
Pure Python (struct, zlib, math) — no PIL required. Outputs a 1024x1024 RGBA
PNG master; run `npx tauri icon <out>` afterwards to regenerate every platform
size (incl. Windows icon.ico used by the tray).
"""
import struct
import zlib
import math

SIZE = 1024
CX = CY = SIZE / 2.0

# Palette
CREAM = (250, 244, 226)     # medallion background
GOLD = (198, 154, 32)       # chakra strokes
GOLD_DEEP = (150, 110, 20)  # outline / studs

# Geometry (in pixels, radius from centre)
R_EDGE_BASE = 470.0   # serrated outer edge mean radius
R_EDGE_AMP = 30.0     # tooth depth
TEETH = 12
RIM_RING = 448.0      # ring just inside the teeth
OUTER_RING = 430.0
INNER_RING = 200.0
HUB = 78.0
STUD_RING = 360.0
STUDS = 12
SPOKES = 8


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def pixel(x, y):
    """Return (r, g, b, a) for pixel centre (x+0.5, y+0.5)."""
    dx = x + 0.5 - CX
    dy = y + 0.5 - CY
    r = math.hypot(dx, dy)
    theta = math.atan2(dy, dx)

    # Serrated medallion outer boundary
    r_edge = R_EDGE_BASE + R_EDGE_AMP * math.cos(TEETH * theta)
    if r > r_edge + 1.0:
        return (0, 0, 0, 0)

    # Anti-aliased outer edge alpha
    alpha = 255
    if r > r_edge - 1.0:
        alpha = int(round(max(0.0, min(1.0, (r_edge + 1.0 - r) / 2.0)) * 255))

    # Start from cream medallion
    col = CREAM

    # Thin deep-gold border tracing the teeth
    if abs(r - r_edge) < 6.0:
        col = GOLD_DEEP

    def stroke(target, half):
        return abs(r - target) < half

    # Rings
    if stroke(RIM_RING, 7.0):
        col = GOLD
    if stroke(OUTER_RING, 9.0):
        col = GOLD
    if stroke(INNER_RING, 8.0):
        col = GOLD

    # Hub
    if r < HUB:
        col = GOLD
    elif r < HUB + 5.0:
        col = GOLD_DEEP

    # Spokes (between hub and outer ring)
    if HUB - 4.0 < r < OUTER_RING:
        seg = math.pi / SPOKES * 2.0  # 45deg
        nearest = round(theta / seg) * seg
        ang = abs(theta - nearest)
        if ang * r < 9.0:
            col = GOLD

    # Stud dots
    if abs(r - STUD_RING) < 22.0:
        for k in range(STUDS):
            sa = (2.0 * math.pi / STUDS) * k
            sx = CX + STUD_RING * math.cos(sa)
            sy = CY + STUD_RING * math.sin(sa)
            if math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 15.0:
                col = GOLD_DEEP
                break

    return (col[0], col[1], col[2], alpha)


def encode_png(size, get_pixel):
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # RGBA
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        for x in range(size):
            r, g, b, a = get_pixel(x, y)
            raw += bytes((r, g, b, a))
    comp = zlib.compress(bytes(raw), 9)
    sig = b'\x89PNG\r\n\x1a\n'
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', comp) + chunk(b'IEND', b'')


if __name__ == '__main__':
    out = 'src-tauri/app-icon-master.png'
    data = encode_png(SIZE, pixel)
    with open(out, 'wb') as f:
        f.write(data)
    print(f'Wrote {out} ({len(data)} bytes, {SIZE}x{SIZE})')
