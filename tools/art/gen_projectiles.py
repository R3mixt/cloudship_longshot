"""Techniques in flight, plus aura orbs and feather debris.

Projectiles travel to the RIGHT, so every technique points that way and the
trailing energy sits on the left. Each row is a 4-frame loop: the animation is
a pulse or a spin, never a translation -- the projectile's own velocity already
supplies all the motion the eye needs, and a moving pivot would fight it.

Frames are 16x16 while the collision radius is 3px. The extra room is glow and
trail, deliberately larger than the hitbox: a technique that looks exactly as
big as it hits feels weak.
"""

from __future__ import annotations

import math

from palette import (
    EIT_HI,
    EIT_LT,
    EIT_MD,
    EIT_SH,
    FEATHER_BONE,
    FEATHER_GOLD,
    FEATHER_STEEL,
    FEATHER_WHITE,
    LIN_DK,
    LIN_HI,
    LIN_LT,
    LIN_MD,
    LIN_SH,
    LIN_WHT,
    MER_DK,
    MER_HI,
    MER_LT,
    MER_MD,
    MER_SH,
    OUTLINE,
    TMC_HI,
    TMC_LT,
    TMC_MD,
    WHITE,
    YER_DK,
    YER_HI,
    YER_LT,
    YER_MD,
    YER_SH,
    ZIE_DK,
    ZIE_HI,
    ZIE_LT,
    ZIE_MD,
    ZIE_SH,
    alpha,
    mix,
)
from pixel import Canvas, Sheet, star

FW = 16
FRAMES = 4


def _pulse(i: int) -> float:
    """0..1 breathing curve over the loop."""
    return 0.5 + 0.5 * math.sin(2 * math.pi * i / FRAMES)


def blackflame(i: int, size=FW) -> Canvas:
    """Black core, red corona, orange tongues streaming backwards."""
    c = Canvas(size, size)
    s = size / 16.0
    cx, cy = size * 0.5, size * 0.5
    p = _pulse(i)

    # Trailing tongues first so the core sits on top of them.
    for k in range(3):
        ln = (4 + k * 1.6 + p * 2) * s
        yy = cy - 2.2 * s + k * 2.2 * s
        c.line(cx - 2 * s, yy, cx - 2 * s - ln, yy + (k - 1) * 1.2 * s, LIN_LT)
        c.px(cx - 2 * s - ln, yy + (k - 1) * 1.2 * s, LIN_HI)

    c.circle(cx, cy, (5.0 + p * 0.7) * s, alpha(LIN_LT, 0.35))
    c.circle(cx, cy, (4.0 + p * 0.5) * s, LIN_HI)
    c.circle(cx, cy, (3.2 + p * 0.4) * s, LIN_LT)
    c.circle(cx, cy, 2.4 * s, LIN_SH)
    c.circle(cx, cy, 1.7 * s, LIN_MD)
    c.circle(cx, cy, 0.9 * s, LIN_DK)
    # Hot spot offset up-left with the global light direction.
    c.px(cx - 1 * s, cy - 1 * s, LIN_WHT)
    # Licks off the leading edge.
    for k in (-1, 1):
        c.px(cx + 4 * s, cy + k * 2 * s, LIN_HI)
        c.px(cx + 5 * s, cy + k * 1 * s, LIN_LT)
    c.outline(OUTLINE)
    return c


def sword_edge(i: int) -> Canvas:
    """A bladed sliver: mostly negative space, all edge."""
    c = Canvas(FW, FW)
    cx, cy = 8.0, 8.0
    p = _pulse(i)
    lean = (i - 1.5) * 0.55  # the sliver rocks rather than spins

    # Wake: two thin ghosts of the blade trailing behind.
    for k in (1, 2):
        c.line(cx - 3 - k * 2, cy + lean * 0.6 - 1, cx - 1 - k * 2, cy + lean * 0.6 + 1, alpha(YER_MD, 0.4))

    # A blade, not a body: 14px long and 4px deep at the widest. The first
    # version was 6px deep and read as a fish.
    tipx = cx + 7
    c.poly(
        [(cx - 6, cy + lean), (cx - 1, cy - 2 + lean), (tipx, cy + lean), (cx - 1, cy + 2 + lean)],
        YER_SH,
    )
    c.line(cx - 6, cy + lean, cx - 1, cy - 2 + lean, YER_MD)
    c.line(cx - 1, cy - 2 + lean, tipx, cy + lean, YER_HI)
    c.line(cx - 6, cy + lean, cx - 1, cy + 2 + lean, YER_DK)
    c.line(cx - 1, cy + 2 + lean, tipx, cy + lean, YER_DK)
    c.hline(cx - 4, tipx - 1, cy + lean, YER_LT)
    c.px(tipx, cy + lean, WHITE)
    # Cross-flash on the pulse peak.
    if p > 0.7:
        star(c, cx + 3, cy - 2 + lean, 2.2, WHITE)
    c.outline(OUTLINE)
    return c


def shadow_arrow(i: int) -> Canvas:
    """Violet arrowhead pulled along by shadow strings."""
    c = Canvas(FW, FW)
    cx, cy = 8.0, 8.0
    p = _pulse(i)

    # Strings: two slack lines whipping behind the head.
    for k in (-1, 1):
        for s in range(7):
            c.px(cx - 2 - s, cy + k * (1 + math.sin(s * 0.8 + i * 1.2) * 1.6), alpha(MER_SH, 0.75))

    # Barbed head over a thin shaft. A wide head plus a full halo turned the
    # whole thing into a violet blob at gameplay size.
    c.poly([(cx + 6, cy), (cx, cy - 3), (cx + 1, cy), (cx, cy + 3)], MER_MD)
    c.line(cx, cy - 3, cx + 6, cy, MER_LT)
    c.line(cx, cy + 3, cx + 6, cy, MER_DK)
    c.hline(cx - 6, cx + 3, cy, MER_LT)
    c.hline(cx - 6, cx, cy - 1, MER_HI)
    c.px(cx + 6, cy, WHITE)
    # Fletching of shadow.
    c.px(cx - 5, cy - 2, MER_SH)
    c.px(cx - 6, cy - 1, MER_DK)
    c.px(cx - 5, cy + 2, MER_SH)
    c.px(cx - 6, cy + 1, MER_DK)
    c.circle(cx + 3, cy, 2.6 + p * 0.8, alpha(MER_MD, 0.3))
    c.outline(OUTLINE)
    return c


def rune_hammer(i: int) -> Canvas:
    """Emerald hammer head tumbling end over end, rune face lit."""
    c = Canvas(FW, FW)
    cx, cy = 8.0, 8.0
    a = math.radians(i * 90 - 30)
    ca, sa = math.cos(a), math.sin(a)

    def rot(dx, dy):
        return cx + dx * ca - dy * sa, cy + dx * sa + dy * ca

    # Haft.
    c.line(*rot(-5, 0), *rot(1, 0), ZIE_DK)
    c.line(*rot(-5, -1), *rot(1, -1), (0x5D, 0x52, 0x38, 255))
    # Head as a rotated quad.
    quad = [rot(1, -3.5), rot(5, -3.5), rot(5, 3.5), rot(1, 3.5)]
    c.poly(quad, ZIE_SH)
    c.line(*quad[0], *quad[1], ZIE_MD)
    c.line(*quad[1], *quad[2], ZIE_DK)
    c.line(*quad[3], *quad[0], ZIE_LT)
    # Rune slash on the striking face.
    c.line(*rot(2.5, -2), *rot(4, 1.5), ZIE_HI)
    c.px(*rot(3, 0), ZIE_HI)
    # Emerald motes shed from the spin.
    for k in range(3):
        aa = a + k * 2.1
        c.px(cx + math.cos(aa) * 7, cy + math.sin(aa) * 7, alpha(ZIE_LT, 0.7))
    c.outline(OUTLINE)
    return c


def scythe_streak(i: int) -> Canvas:
    """Ozriel: a black crescent with a silver edge and a void wake."""
    c = Canvas(FW, FW)
    cx, cy = 8.0, 8.0
    p = _pulse(i)

    for s in range(8):
        c.px(cx - 3 - s, cy - 1 + math.sin(s * 0.6 + i) * 0.9, alpha(EIT_LT, 0.5 - s * 0.05))
        c.px(cx - 3 - s, cy + 1 + math.sin(s * 0.6 + i) * 0.9, alpha(EIT_SH, 0.5 - s * 0.05))

    # Crescent over 150 degrees. At 240 it closed into a ring and stopped
    # reading as a blade entirely.
    rock = (i - 1.5) * 6  # the crescent rolls slightly rather than spinning
    rad = 6.0 + p * 0.9
    for k in range(17):
        t = k / 16
        ang = math.radians(-75 + rock + t * 150)
        bx = cx - 2 + math.cos(ang) * rad
        by = cy + math.sin(ang) * rad
        # Blade thins toward both horns, thickest at the belly.
        thick = 1 + int(round(math.sin(t * math.pi) * 2))
        c.px(bx, by, EIT_HI)
        for d in range(1, thick + 1):
            c.px(bx - d, by, EIT_LT if d == 1 else EIT_MD)
    c.px(cx + 4, cy, WHITE)
    if p > 0.6:
        star(c, cx + 3, cy - 4, 2.0, EIT_HI)
    c.outline(OUTLINE)
    return c


ROWS = [blackflame, sword_edge, shadow_arrow, rune_hammer, scythe_streak]


def build_projectiles() -> None:
    sheet = Sheet(FW, FW, FRAMES, len(ROWS))
    for r, fn in enumerate(ROWS):
        for i in range(FRAMES):
            sheet.set(i, r, fn(i))
    sheet.save("projectiles.png")


def build_surge() -> None:
    """Lindon's Blackflame burn: the same technique at double presence."""
    sheet = Sheet(24, 24, FRAMES, 1)
    for i in range(FRAMES):
        c = blackflame(i, size=24)
        p = _pulse(i)
        # Extra outward flare only the surge form gets.
        for a in range(0, 360, 30):
            rad = math.radians(a + i * 18)
            rr = 9.5 + math.sin(rad * 2) * 1.4 + p
            c.px(12 + math.cos(rad) * rr, 12 + math.sin(rad) * rr, alpha(LIN_LT, 0.7))
        sheet.set(i, 0, c)
    sheet.save("projectiles_surge.png")


def build_orb() -> None:
    """Loose aura orb: a small pickup that must not be mistaken for a bird."""
    sheet = Sheet(16, 16, 6, 1)
    for i in range(6):
        c = Canvas(16, 16)
        cx = cy = 8.0
        p = 0.5 + 0.5 * math.sin(2 * math.pi * i / 6)
        r = 3.4 + p * 1.0
        c.circle(cx, cy, r + 1.6, alpha(TMC_MD, 0.3))
        c.circle(cx, cy, r, TMC_MD)
        c.circle(cx - 0.8, cy - 0.8, r * 0.6, TMC_LT)
        c.px(cx - 1, cy - 1, TMC_HI)
        # Four-point cross flare: reads at 4px where a plain disc does not.
        c.hline(cx - r - 2, cx + r + 2, cy, alpha(TMC_LT, 0.75))
        c.vline(cx, cy - r - 2, cy + r + 2, alpha(TMC_LT, 0.75))
        c.px(cx, cy, WHITE)
        c.outline(OUTLINE)
        sheet.set(i, 0, c)
    sheet.save("orb.png")


# --- feathers -------------------------------------------------------------
# Six shapes so a burst never looks like six copies of one sprite; four tinted
# rows matching FEATHER_COLORS in src/data/objects.ts.

FEATHER_ROWS = [FEATHER_BONE, FEATHER_GOLD, FEATHER_STEEL, FEATHER_WHITE]


def feather_shape(k: int, base) -> Canvas:
    c = Canvas(8, 8)
    dark = mix(base, OUTLINE, 0.45)
    lite = mix(base, WHITE, 0.5)
    if k == 0:  # full quill
        c.poly([(4, 0), (6, 3), (4, 7), (2, 3)], base)
        c.vline(4, 1, 6, dark)
        c.line(3, 2, 3, 5, lite)
    elif k == 1:  # curved down feather
        c.poly([(2, 1), (6, 2), (5, 6), (2, 4)], base)
        c.line(2, 1, 5, 6, dark)
        c.px(3, 2, lite)
    elif k == 2:  # short barb
        c.poly([(2, 2), (5, 1), (6, 4), (3, 5)], base)
        c.px(3, 2, lite)
        c.line(5, 1, 6, 4, dark)
    elif k == 3:  # thin sliver
        c.line(1, 6, 6, 1, base)
        c.line(1, 5, 5, 1, lite)
        c.px(6, 1, dark)
    elif k == 4:  # tuft
        c.rect(3, 2, 2, 4, base)
        c.px(2, 3, base)
        c.px(5, 4, base)
        c.px(3, 2, lite)
        c.px(4, 5, dark)
    else:  # tiny down mote
        c.rect(3, 3, 2, 2, base)
        c.px(3, 3, lite)
        c.px(4, 4, dark)
    return c


def build_feathers() -> None:
    sheet = Sheet(8, 8, 6, len(FEATHER_ROWS))
    for r, col in enumerate(FEATHER_ROWS):
        for k in range(6):
            sheet.set(k, r, feather_shape(k, col))
    sheet.save("feathers.png")


def build() -> None:
    print("projectiles")
    build_projectiles()
    build_surge()
    build_orb()
    build_feathers()


if __name__ == "__main__":
    build()
