"""Contact-sheet previewer.

Upscales a generated sheet with nearest-neighbour and draws frame guides so the
result can be judged at a size where individual pixels are visible. Output is
scratch only -- tools/art/preview/ is gitignored and never shipped.

Usage:  python preview.py birds.png 32 24 [scale]
        python preview.py --all
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

from pixel import SPRITE_DIR

PREVIEW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "preview")

# Frame geometry per sheet, mirroring the manifest. Only used for guide lines.
GRIDS = {
    "characters.png": (24, 28),
    "projectiles.png": (16, 16),
    "projectiles_surge.png": (24, 24),
    "birds.png": (32, 24),
    "bird_golden.png": (40, 32),
    "bird_armored.png": (36, 28),
    "feathers.png": (8, 8),
    "pad.png": (48, 24),
    "tmc.png": (32, 24),
    "aura.png": (32, 24),
    "storm.png": (64, 40),
    "spike.png": (64, 40),
    "orb.png": (16, 16),
    "cloudship.png": (192, 96),
    "ground_tiles.png": (16, 16),
    "clouds.png": (64, 24),
    "mountains.png": (256, 96),
    "ui.png": (8, 8),
}

CHECKER_A = (46, 46, 58)
CHECKER_B = (34, 34, 44)
GUIDE = (255, 0, 128, 90)


def make(name: str, fw: int, fh: int, scale: int = 6) -> str:
    src = Image.open(os.path.join(SPRITE_DIR, name)).convert("RGBA")
    w, h = src.size
    big = src.resize((w * scale, h * scale), Image.NEAREST)

    # Checkerboard so transparent regions and dark rims stay distinguishable.
    bg = Image.new("RGBA", big.size, CHECKER_B)
    d = ImageDraw.Draw(bg)
    cell = scale * 4
    for y in range(0, big.size[1], cell):
        for x in range(0, big.size[0], cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=CHECKER_A)
    bg.alpha_composite(big)

    guides = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(guides)
    for x in range(0, w + 1, fw):
        gd.line([(x * scale, 0), (x * scale, bg.size[1])], fill=GUIDE, width=1)
    for y in range(0, h + 1, fh):
        gd.line([(0, y * scale), (bg.size[0], y * scale)], fill=GUIDE, width=1)
    bg.alpha_composite(guides)

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out = os.path.join(PREVIEW_DIR, name)
    bg.convert("RGB").save(out)
    return out


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] == "--all":
        scale = int(args[1]) if len(args) > 1 else 6
        for name, (fw, fh) in GRIDS.items():
            p = os.path.join(SPRITE_DIR, name)
            if os.path.exists(p):
                print(make(name, fw, fh, scale))
        return
    name = args[0]
    fw, fh = (int(args[1]), int(args[2])) if len(args) > 2 else GRIDS[name]
    scale = int(args[3]) if len(args) > 3 else 6
    print(make(name, fw, fh, scale))


if __name__ == "__main__":
    main()
