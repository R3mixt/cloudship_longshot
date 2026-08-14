"""Post-build check on the generated sprite sheets.

EXPECTED mirrors the geometry declared in src/assets/manifest.ts. A mismatch
here means the game would slice frames at the wrong offsets at runtime, which
shows up as sprites bleeding into each other rather than as a clean error --
so it is caught at build time instead.

Also flags fully empty frames, which is the usual symptom of a drawing routine
whose coordinates drifted outside its cell.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

from pixel import SPRITE_DIR

# name -> (frame_w, frame_h, columns, rows)
EXPECTED = {
    "characters.png": (24, 28, 8, 5),
    "projectiles.png": (16, 16, 4, 5),
    "projectiles_surge.png": (24, 24, 4, 1),
    "birds.png": (32, 24, 6, 4),
    "bird_golden.png": (40, 32, 6, 1),
    "bird_armored.png": (36, 28, 6, 1),
    "feathers.png": (8, 8, 6, 4),
    "pad.png": (48, 24, 8, 1),
    "tmc.png": (32, 24, 6, 1),
    "aura.png": (32, 24, 6, 3),
    "storm.png": (64, 40, 8, 1),
    "spike.png": (64, 40, 4, 1),
    "orb.png": (16, 16, 6, 1),
    "cloudship.png": (192, 96, 4, 1),
    "ground_tiles.png": (16, 16, 12, 1),
    "clouds.png": (64, 24, 6, 1),
    "mountains.png": (256, 96, 1, 1),
    "ui.png": (128, 64, 1, 1),
    "font.png": (6, 8, 16, 7),
}

# Sheets whose blank cells are meaningful rather than a drawing bug. The font
# has a space glyph by definition, and its 97 characters leave the tail of the
# 16x7 grid unused; both are empty on purpose.
ALLOW_EMPTY_FRAMES = {"font.png"}


def check() -> int:
    problems: list[str] = []
    for name, (fw, fh, cols, rows) in sorted(EXPECTED.items()):
        path = os.path.join(SPRITE_DIR, name)
        if not os.path.exists(path):
            problems.append(f"{name}: missing")
            continue
        with Image.open(path) as im:
            if im.mode != "RGBA":
                problems.append(f"{name}: mode is {im.mode}, expected RGBA")
            want = (fw * cols, fh * rows)
            if im.size != want:
                problems.append(f"{name}: {im.size[0]}x{im.size[1]}, expected {want[0]}x{want[1]}")
                continue
            arr = np.asarray(im.convert("RGBA"))

        if name not in ALLOW_EMPTY_FRAMES:
            for r in range(rows):
                for cidx in range(cols):
                    cell = arr[r * fh : (r + 1) * fh, cidx * fw : (cidx + 1) * fw, 3]
                    if not cell.any():
                        problems.append(f"{name}: frame ({cidx},{r}) is empty")

        print(f"  ok  {name:24s} {want[0]:>4}x{want[1]:<4} {fw}x{fh} x {cols}x{rows}")

    if problems:
        print("\nArt verification failed:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"\n{len(EXPECTED)} sheets verified.")
    return 0


if __name__ == "__main__":
    sys.exit(check())
