"""Backdrop and set dressing: the cloudship, ground tiles, cloud strata, ranges.

Parallax depth is carried by value, not by blur: the further back a layer sits,
the closer its tones move to the sky's own blue and the narrower its internal
contrast gets. Nothing in the far layers is ever allowed a highlight brighter
than the nearest layer's midtone, which is what keeps a mountain from jumping
forward past a cloud.
"""

from __future__ import annotations

import math

from palette import (
    CLOUD_DK,
    CLOUD_HI,
    CLOUD_LT,
    CLOUD_MD,
    CLOUD_SH,
    DIRT_DK,
    DIRT_LT,
    DIRT_MD,
    EIT_GOLD,
    GRASS_DK,
    GRASS_HI,
    GRASS_LT,
    GRASS_MD,
    MER_LT,
    MOUNTAIN_FAR,
    MOUNTAIN_LT,
    MOUNTAIN_MID,
    MOUNTAIN_SNOW,
    OUTLINE,
    ROCK_DK,
    ROCK_LT,
    ROCK_MD,
    ROCK_SH,
    TMC_LT,
    TMC_MD,
    TMC_SH,
    UI_GOLD,
    WHITE,
    WOOD_DK,
    WOOD_HI,
    WOOD_LT,
    WOOD_MD,
    WOOD_SH,
    YER_RED,
    alpha,
    mix,
)
from pixel import Canvas, Sheet, save_canvas, stipple_ellipse

# --- cloudship ------------------------------------------------------------

SHIP_W, SHIP_H, SHIP_FRAMES = 192, 96, 4
DECK_Y = 44  # top of the deck planking, in frame space


def plank_hull(c: Canvas) -> None:
    """Hull in three-quarter rear view: stern to the left, prow to the right."""
    left, right = 18, 176
    top, bottom = DECK_Y, DECK_Y + 26

    # Sheer line: the deck edge curves up toward both ends.
    def sheer(x):
        t = (x - left) / (right - left)
        return top + 4 - math.sin(t * math.pi) * 4

    # Hull body, built as vertical spans so both curves stay exact. The keel is
    # deepest amidships; a flat-bottomed box read as a barge, not a ship.
    for x in range(left, right):
        t = (x - left) / (right - left)
        ytop = sheer(x)
        depth = bottom - 8 + 9 * math.sin(t * math.pi) ** 0.7
        c.vline(x, ytop, depth, WOOD_SH)
        c.vline(x, ytop, ytop + 2, WOOD_MD)
        c.vline(x, depth - 3, depth, WOOD_DK)

    # Wale: a lit rubbing strake two thirds down the hull.
    for x in range(left, right):
        t = (x - left) / (right - left)
        y = sheer(x) + 10 + math.sin(t * math.pi) * 2
        c.px(x, y, WOOD_LT)
        c.px(x, y + 1, WOOD_DK)

    # Plank seams, offset per course so they do not line up into a grid.
    for k, dy in enumerate((5, 8, 14, 18)):
        for x in range(left + (k * 3) % 5, right, 1):
            y = sheer(x) + dy
            if (x + k * 7) % 11 < 8:
                c.px(x, y, WOOD_DK)

    # Prow: a curved cutwater rising into a point. A straight-sided wedge read
    # as an arrow glyph pasted onto the hull.
    for k in range(15):
        t = k / 14
        x = right - 2 + t * 13
        half = (1 - t) ** 0.55 * 11
        ymid = top + 9 - t * 3
        c.vline(x, ymid - half, ymid + half, WOOD_MD)
        c.px(x, ymid - half, WOOD_HI)
        c.px(x, ymid + half, WOOD_DK)
    # Stern: a squared-off transom with a lit upper edge.
    c.poly([(left + 2, top - 6), (left + 2, top + 20), (left - 12, top + 16), (left - 10, top - 2)], WOOD_SH)
    c.line(left - 10, top - 2, left + 2, top - 6, WOOD_LT)
    c.vline(left - 12, top - 1, top + 16, WOOD_DK)
    # Stern cabin: breaks the long flat sheer and gives the deck a landmark.
    c.rect(24, top - 17, 26, 12, WOOD_SH)
    c.hline(24, 49, top - 17, WOOD_LT)
    c.vline(24, top - 16, top - 6, WOOD_MD)
    c.rect(50, top - 19, 4, 14, WOOD_DK)
    for wx in (30, 40):
        c.rect(wx, top - 13, 5, 4, mix(WOOD_DK, OUTLINE, 0.5))
        c.hline(wx, wx + 4, top - 13, WOOD_HI)
        c.rect(wx + 1, top - 12, 3, 2, alpha(UI_GOLD, 0.85))

    # Deck planking seen edge-on: a lit strip along the whole sheer.
    for x in range(left - 8, right + 2):
        y = sheer(min(max(x, left), right - 1))
        c.px(x, y - 1, WOOD_HI)
        c.px(x, y, WOOD_LT)


def railing(c: Canvas) -> None:
    left, right = 14, 178

    def sheer(x):
        t = (x - 18) / (176 - 18)
        return DECK_Y + 4 - math.sin(max(0.0, min(1.0, t)) * math.pi) * 4

    for x in range(left, right, 11):
        y = sheer(x)
        c.vline(x, y - 9, y - 1, WOOD_MD)
        c.px(x, y - 9, WOOD_HI)
        c.px(x + 1, y - 8, WOOD_DK)
    # Top rail follows the sheer.
    for x in range(left, right):
        y = sheer(x)
        c.px(x, y - 10, WOOD_LT)
        c.px(x, y - 9, WOOD_MD)
        c.px(x, y - 8, WOOD_DK)


def banners(c: Canvas, i: int) -> None:
    """Three hanging banners in the sect colours, rippling on a 4-frame loop."""
    cols = ((70, YER_RED), (104, EIT_GOLD), (138, MER_LT))
    for bx, col in cols:
        top = DECK_Y - 30
        # Pole and yard.
        c.vline(bx, top - 4, DECK_Y - 6, WOOD_MD)
        c.px(bx, top - 4, WOOD_HI)
        c.hline(bx, bx + 15, top, WOOD_DK)
        # Pennant: a straight-edged banner with a swallowtail, rippling on a
        # long wavelength. Short wavelengths curled it into a comma shape.
        for row in range(16):
            t = row / 15
            wave = math.sin(t * 2.2 + i * 1.5) * 1.6
            y = top + 1 + row
            # Swallowtail notch in the last four rows.
            w = 14 if row < 12 else 14 - (row - 11) * 3
            if row >= 12 and row < 15:
                c.hline(bx + 1 + wave, bx + w + wave, y, col)
                c.hline(bx + 1 + wave + (14 - w) + 6, bx + 14 + wave, y, col)
            else:
                c.hline(bx + 1 + wave, bx + 14 + wave, y, col)
            c.px(bx + 1 + wave, y, mix(col, WHITE, 0.4))
            c.px(bx + 14 + wave, y, mix(col, OUTLINE, 0.45))
            if row % 5 == 2:
                c.hline(bx + 3 + wave, bx + 11 + wave, y, mix(col, WHITE, 0.3))
            if row % 5 == 4:
                c.hline(bx + 3 + wave, bx + 12 + wave, y, mix(col, OUTLINE, 0.3))


def propulsion(c: Canvas, i: int) -> None:
    """Madra cloud boiling under the keel. It is the only moving part of the
    ship, so it carries all four frames of the loop on its own."""
    base = DECK_Y + 26
    for k in range(9):
        px_ = 16 + k * 20
        ph = i * 1.6 + k * 0.9
        ry = 5 + math.sin(ph) * 1.6
        cyy = base + 3 + math.cos(ph * 0.7) * 1.2
        c.ellipse(px_, cyy, 13, ry, alpha(TMC_MD, 0.55))
        c.ellipse(px_ - 2, cyy - 1, 8, ry * 0.6, alpha(TMC_LT, 0.6))
        stipple_ellipse(c, px_, cyy + 4, 15, ry * 1.5, alpha(TMC_SH, 0.5), level=6, phase=i + k)
    # Trailing wisps shed backwards off the stern.
    for k in range(5):
        ln = 8 + (k * 3 + i * 2) % 14
        yy = base + 2 + k * 3
        c.line(10, yy, 10 - ln, yy + k - 2, alpha(TMC_MD, 0.45))


def ship_frame(i: int) -> Canvas:
    c = Canvas(SHIP_W, SHIP_H)
    bob = round(math.sin(2 * math.pi * i / SHIP_FRAMES) * 1.5)
    hull = Canvas(SHIP_W, SHIP_H)
    plank_hull(hull)
    railing(hull)
    banners(hull, i)
    hull.outline(OUTLINE)
    c.blit(hull.translated(0, bob))
    propulsion(c, i)
    return c


def build_ship() -> None:
    sheet = Sheet(SHIP_W, SHIP_H, SHIP_FRAMES, 1)
    for i in range(SHIP_FRAMES):
        sheet.set(i, 0, ship_frame(i))
    sheet.save("cloudship.png")


# --- ground tiles ---------------------------------------------------------

TILE = 16
TILE_COLS, TILE_ROWS = 12, 1

# Tile roles, in sheet order. Surface tiles carry a grass cap on the top rows;
# body tiles are opaque all the way through; overlay tiles are mostly
# transparent and are scattered on top with a position-stable hash.
TILE_NAMES = [
    # 0-4: surface tiles, grass cap over dirt, opaque top to bottom.
    "grass_a", "grass_b", "grass_c", "grass_worn", "grass_edge",
    # 5-7: body tiles, opaque, tiled below the surface row.
    "dirt_a", "dirt_stone", "dirt_root",
    # 8-11: overlays, mostly transparent, scattered on top of a surface tile.
    "rock_cluster", "tuft_a", "tuft_b", "flowers",
]


def _noise(x, y, seed=0):
    """Cheap deterministic hash so a tile's texture never shifts between runs."""
    h = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def grass_cap(c: Canvas, seed: int, cap_h=5) -> None:
    """Grass over dirt with a ragged, non-repeating boundary."""
    for x in range(TILE):
        h = cap_h + int(_noise(x, 0, seed) * 2.5) - 1
        c.vline(x, 0, h, GRASS_MD)
        if _noise(x, 2, seed) > 0.7:
            c.vline(x, 1, h - 1, GRASS_DK)
        c.px(x, 0, GRASS_LT)
        if _noise(x, 1, seed) > 0.6:
            c.px(x, 0, GRASS_HI)
        c.px(x, h, GRASS_DK)
        c.vline(x, h + 1, TILE - 1, DIRT_MD)
        # Dirt speckle keeps a 16px slab from reading as flat colour.
        for y in range(h + 2, TILE):
            n = _noise(x, y, seed)
            if n > 0.93:
                c.px(x, y, DIRT_LT)
            elif n < 0.07:
                c.px(x, y, DIRT_DK)


def dirt_body(c: Canvas, seed: int) -> None:
    c.rect(0, 0, TILE, TILE, DIRT_MD)
    for x in range(TILE):
        for y in range(TILE):
            n = _noise(x, y, seed)
            if n > 0.93:
                c.px(x, y, DIRT_LT)
            elif n < 0.07:
                c.px(x, y, DIRT_DK)


def tile(index: int) -> Canvas:
    c = Canvas(TILE, TILE)
    name = TILE_NAMES[index]

    if name.startswith("grass_") and name != "grass_edge":
        grass_cap(c, index, cap_h={"grass_a": 5, "grass_b": 4, "grass_c": 6, "grass_worn": 3}[name])
        if name == "grass_c":
            for k in range(3):
                bx = 2 + k * 5
                c.vline(bx, -2, 2, GRASS_LT)
                c.px(bx, 0, GRASS_HI)
        if name == "grass_worn":
            for k in range(4):
                c.px(2 + k * 4, 2 + (k % 2), DIRT_LT)
    elif name == "grass_edge":
        # Slope: grass thins to nothing across the tile for run-out ends.
        for x in range(TILE):
            h = int(5 - x * 0.32)
            if h >= 0:
                c.vline(x, 0, h, GRASS_MD)
                c.px(x, 0, GRASS_LT)
                c.px(x, h, GRASS_DK)
            c.vline(x, max(0, h + 1), TILE - 1, DIRT_MD)
            for y in range(max(1, h + 2), TILE):
                n = _noise(x, y, 91)
                if n > 0.88:
                    c.px(x, y, DIRT_LT)
                elif n < 0.12:
                    c.px(x, y, DIRT_DK)
    elif name.startswith("dirt_"):
        dirt_body(c, index)
        if name == "dirt_stone":
            # Buried stone: lit crown, dark bed, so it sits *in* the soil.
            c.ellipse(6, 9, 4.5, 3.0, ROCK_SH)
            c.ellipse(5, 8, 3.0, 1.8, ROCK_MD)
            c.hline(3, 7, 6, ROCK_LT)
            c.hline(3, 9, 12, DIRT_DK)
            c.ellipse(12, 4, 2.4, 1.6, ROCK_SH)
            c.px(11, 3, ROCK_LT)
        elif name == "dirt_root":
            root = mix(DIRT_DK, OUTLINE, 0.5)
            c.line(1, 3, 8, 7, root)
            c.line(8, 7, 15, 6, root)
            c.line(5, 7, 6, 12, root)
            c.line(1, 2, 8, 6, DIRT_LT)
    elif name == "rock_cluster":
        for cxr, cyr, rr in ((5, 11, 4.5), (11, 9, 3.6), (8, 6, 2.8)):
            c.ellipse(cxr, cyr, rr, rr * 0.8, ROCK_SH)
            c.ellipse(cxr - 1, cyr - 1, rr * 0.6, rr * 0.45, ROCK_MD)
            c.hline(cxr - rr * 0.6, cxr + rr * 0.2, cyr - rr * 0.7, ROCK_LT)
            c.hline(cxr - rr * 0.6, cxr + rr * 0.7, cyr + rr * 0.75, ROCK_DK)
        c.outline(OUTLINE)
    elif name.startswith("tuft_"):
        blades = ((3, 6, -1), (6, 9, 0), (9, 7, 1), (12, 5, 1)) if name == "tuft_a" else ((2, 5, 1), (7, 11, 0), (11, 8, -1), (14, 4, -1))
        for bx, bh, curve in blades:
            for k in range(bh):
                c.px(bx + curve * (k / bh) * 2, 15 - k, GRASS_MD if k < bh - 2 else GRASS_LT)
            c.px(bx + curve * 2, 15 - bh, GRASS_HI)
        c.outline(OUTLINE)
    else:  # flowers -- both hues on one overlay so a scatter shows variety
        for bx, bh, petal in ((4, 7, UI_GOLD), (9, 10, MER_LT), (13, 5, UI_GOLD)):
            c.vline(bx, 15 - bh, 15, GRASS_MD)
            c.px(bx, 15 - bh, GRASS_LT)
            c.rect(bx - 1, 14 - bh, 3, 2, petal)
            c.px(bx - 1, 14 - bh, mix(petal, WHITE, 0.5))
            c.px(bx + 1, 15 - bh, mix(petal, OUTLINE, 0.4))
        c.outline(OUTLINE)
    return c


def build_tiles() -> None:
    sheet = Sheet(TILE, TILE, TILE_COLS, TILE_ROWS)
    for idx in range(TILE_COLS * TILE_ROWS):
        sheet.set(idx % TILE_COLS, idx // TILE_COLS, tile(idx))
    sheet.save("ground_tiles.png")


# --- parallax clouds ------------------------------------------------------

CLOUD_W, CLOUD_H, CLOUD_SHAPES = 64, 24, 6


def cloud_shape(k: int) -> Canvas:
    """Chunky stratus banks. Deliberately flat-bottomed: a cloud with a rounded
    underside reads as a balloon."""
    c = Canvas(CLOUD_W, CLOUD_H)
    base = 17
    lobes = [
        [(14, 5.5), (26, 8.0), (40, 6.0), (50, 4.0)],
        [(12, 4.0), (22, 6.5), (34, 5.0), (46, 6.5), (54, 3.5)],
        [(18, 7.0), (32, 5.0), (44, 7.5)],
        [(10, 3.5), (20, 5.5), (30, 4.0), (40, 6.0), (50, 4.5), (58, 3.0)],
        [(16, 6.0), (28, 4.0), (38, 6.5), (48, 5.0)],
        [(20, 8.0), (34, 6.0), (46, 4.0)],
    ][k]
    for lx, lr in lobes:
        c.ellipse(lx, base - lr * 0.5, lr * 1.7, lr, CLOUD_MD)
    c.rect(int(lobes[0][0] - lobes[0][1]), base - 1, int(lobes[-1][0] + lobes[-1][1] * 1.7) - int(lobes[0][0] - lobes[0][1]), 3, CLOUD_MD)
    for lx, lr in lobes:
        c.ellipse(lx - 1, base - lr * 1.05, lr * 1.1, lr * 0.5, CLOUD_LT)
    c.ellipse(lobes[len(lobes) // 2][0] - 2, base - lobes[len(lobes) // 2][1] * 1.2, 6, 1.6, CLOUD_HI)
    # Shadowed underside, then a stippled fade so the base is not a hard bar.
    c.hline(6, CLOUD_W - 6, base + 1, CLOUD_SH)
    c.dither(4, base + 2, CLOUD_W - 8, 2, CLOUD_DK, level=7, phase=k)
    return c


def build_clouds() -> None:
    sheet = Sheet(CLOUD_W, CLOUD_H, CLOUD_SHAPES, 1)
    for k in range(CLOUD_SHAPES):
        sheet.set(k, 0, cloud_shape(k))
    sheet.save("clouds.png")


# --- distant range --------------------------------------------------------

MTN_W, MTN_H = 256, 96


def build_mountains() -> None:
    """One tileable band. Every term of the profile has an integer period over
    the full width, so column 0 and column 256 are identical and the band can
    be repeated horizontally without a seam."""
    c = Canvas(MTN_W, MTN_H)

    def tri(u):
        """Triangle wave, 0..1 input, -1..1 output. Pure sines produced rolling
        dunes; peaks need the corner a triangle wave gives."""
        return 4 * abs(u - math.floor(u + 0.5)) - 1

    def profile(x, terms):
        y = 0.0
        for amp, n, phase, kind in terms:
            u = n * x / MTN_W + phase
            y += amp * (tri(u) if kind else math.sin(2 * math.pi * u))
        return y

    far_terms = [(13, 3, 0.11, 1), (6, 5, 0.33, 0), (3, 11, 0.19, 1)]
    mid_terms = [(17, 2, 0.27, 1), (9, 4, 0.03, 1), (4, 7, 0.41, 0)]
    near_terms = [(21, 1, 0.14, 1), (12, 3, 0.37, 1), (5, 6, 0.09, 0)]

    def ridge(base, terms, body, rim, lit, lit_depth):
        for x in range(MTN_W):
            h = profile(x, terms)
            top = base - h
            c.vline(x, top, MTN_H - 1, body)
            c.px(x, top, rim)
            # A left-facing slope is one that rises toward the right, and that
            # is the only face a light in the upper left can reach.
            slope = profile(x + 1, terms) - h
            if slope > 0.35:
                c.vline(x, top + 1, top + lit_depth, lit)

    ridge(40, far_terms, MOUNTAIN_FAR, mix(MOUNTAIN_FAR, MOUNTAIN_LT, 0.45),
          mix(MOUNTAIN_FAR, MOUNTAIN_MID, 0.6), 3)
    ridge(60, mid_terms, MOUNTAIN_MID, MOUNTAIN_LT,
          mix(MOUNTAIN_MID, MOUNTAIN_LT, 0.5), 5)
    ridge(78, near_terms, MOUNTAIN_LT, MOUNTAIN_SNOW,
          mix(MOUNTAIN_LT, MOUNTAIN_SNOW, 0.4), 6)

    # Snow only on the summits of the nearest ridge, and only a few rows deep.
    for x in range(MTN_W):
        top = 78 - profile(x, near_terms)
        if top < 58:
            c.px(x, top, MOUNTAIN_SNOW)
            c.px(x, top + 1, MOUNTAIN_SNOW)
            if top < 54:
                c.px(x, top + 2, mix(MOUNTAIN_SNOW, MOUNTAIN_LT, 0.4))
    save_canvas(c, "mountains.png")


def build() -> None:
    print("environment")
    build_ship()
    build_tiles()
    build_clouds()
    build_mountains()


if __name__ == "__main__":
    build()
