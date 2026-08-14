"""World objects: launch pads, Thousand-Mile Clouds, aura motes, storms, spires.

Ground-anchored sprites (pad, spike) put their contact line on the LAST row of
the frame so the renderer can place them by ground Y without per-sprite
offsets. Airborne sprites (tmc, aura, storm) are centred in their frame.

The three aura variants are the one place where colour is explicitly not
allowed to carry meaning: a player with a red-green deficiency, or one glancing
at the HUD for 150ms, has to tell them apart by interior shape alone. Charge is
a hard plus, shield is a heater-shield outline, low-gravity is three stacked
chevrons pointing up. Hue only reinforces what the shape already said.
"""

from __future__ import annotations

import math

from palette import (
    LIGHTNING,
    LIGHTNING_HI,
    OUTLINE,
    ROCK_DK,
    ROCK_HI,
    ROCK_LT,
    ROCK_MD,
    ROCK_SH,
    STORM_DK,
    STORM_HI,
    STORM_LT,
    STORM_MD,
    STORM_SH,
    TMC_DK,
    TMC_HI,
    TMC_LT,
    TMC_MD,
    TMC_SH,
    WHITE,
    ZIE_DK,
    ZIE_HI,
    ZIE_LT,
    ZIE_MD,
    ZIE_SH,
    alpha,
    hexc,
    mix,
)
from pixel import Canvas, Sheet, star, stipple_ellipse

# --- launch pad -----------------------------------------------------------

PAD_W, PAD_H, PAD_FRAMES = 48, 24, 8

# Eight glyph shapes cycled around the ring. Each is a 3x3 bitmask, drawn small
# enough that it reads as "script" rather than as a legible symbol.
GLYPHS = [0b111010010, 0b010111010, 0b101010101, 0b110011110, 0b011110011, 0b111101111, 0b010101010, 0b100111001]


def draw_glyph(c: Canvas, x, y, mask, col):
    for k in range(9):
        if mask & (1 << (8 - k)):
            c.px(x + k % 3, y + k // 3, col)


def pad_frame(i: int) -> Canvas:
    c = Canvas(PAD_W, PAD_H)
    cx = PAD_W * 0.5
    # Ring centre. The plan-view ellipse extends 5px below this, so the front
    # of the ring lands exactly on the last row of the frame.
    base_y = PAD_H - 6
    t = i / PAD_FRAMES
    pulse = 0.5 + 0.5 * math.sin(2 * math.pi * t)

    # Light column: a stippled shaft so it fades out rather than banding.
    col_w = 12 + pulse * 3
    for yy in range(0, base_y):
        f = 1.0 - yy / base_y
        w = col_w * (0.45 + f * 0.55)
        level = int(2 + f * 7)
        c.dither(cx - w / 2, yy, w, 1, alpha(ZIE_MD, 0.55), level=level, phase=i)
    c.dither(cx - 4, 0, 8, base_y, alpha(ZIE_LT, 0.5), level=int(3 + pulse * 3), phase=i + 1)

    # Ring: an ellipse in plan view, so the formation lies on the ground rather
    # than standing up like a wall.
    rx, ry = 20.0, 5.0
    for k in range(72):
        a = 2 * math.pi * k / 72
        c.px(cx + math.cos(a) * rx, base_y + math.sin(a) * ry, ZIE_SH)
        c.px(cx + math.cos(a) * (rx - 1.0), base_y + math.sin(a) * (ry - 0.7), ZIE_MD)
        c.px(cx + math.cos(a) * (rx - 2.0), base_y + math.sin(a) * (ry - 1.4), ZIE_DK)
    for k in range(40):
        a = 2 * math.pi * k / 40 + t * 0.8
        c.px(cx + math.cos(a) * (rx - 4), base_y + math.sin(a) * (ry - 2), ZIE_MD)

    # Glyphs orbit the ring; two are lit at a time so the ring feels alive.
    for k in range(6):
        a = 2 * math.pi * (k / 6) + t * 2 * math.pi / 6
        gx = cx + math.cos(a) * (rx - 7) - 1
        gy = base_y + math.sin(a) * (ry - 1.5) - 1
        lit = (k + i) % 3 == 0
        draw_glyph(c, gx, gy, GLYPHS[(k + i) % len(GLYPHS)], ZIE_LT if lit else ZIE_SH)

    # Core disc and its highlight.
    c.ellipse(cx, base_y, 7, 2.2, ZIE_MD)
    c.ellipse(cx - 1, base_y - 0.4, 4.5, 1.3, ZIE_LT)
    c.hline(cx - 3, cx + 2, base_y - 1, ZIE_HI)

    # Rising motes, phase-staggered so the pad reads as continuously feeding.
    for k in range(4):
        my = base_y - ((i * 2 + k * 5) % 20)
        c.px(cx - 8 + k * 5, my, alpha(ZIE_LT, 0.85))
        if k % 2 == 0:
            c.px(cx - 8 + k * 5, my - 1, alpha(ZIE_HI, 0.6))
    return c


def build_pad() -> None:
    sheet = Sheet(PAD_W, PAD_H, PAD_FRAMES, 1)
    for i in range(PAD_FRAMES):
        sheet.set(i, 0, pad_frame(i))
    sheet.save("pad.png")


# --- Thousand-Mile Cloud --------------------------------------------------

TMC_W, TMC_H, TMC_FRAMES = 32, 24, 6


def tmc_frame(i: int) -> Canvas:
    """Compact and forward-raked. A round puffy cloud would read as scenery;
    this one has to read as a vehicle that is already moving."""
    c = Canvas(TMC_W, TMC_H)
    cx, cy = 15.0, 12.0
    bob = math.sin(2 * math.pi * i / TMC_FRAMES) * 1.0

    # Motion wisps streaming off the back.
    for k in range(3):
        ln = 6 + k * 2 + (i % 3)
        yy = cy - 2 + k * 2.4 + bob
        c.line(cx - 8, yy, cx - 8 - ln, yy + (k - 1) * 0.8, alpha(TMC_SH, 0.65))
        c.px(cx - 8 - ln, yy + (k - 1) * 0.8, alpha(TMC_MD, 0.5))

    # Body: three overlapping lobes raked forward, not a symmetrical puff.
    c.ellipse(cx, cy + bob, 8.5, 3.6, TMC_MD)
    c.ellipse(cx + 3, cy - 1.6 + bob, 5.0, 2.8, TMC_MD)
    c.ellipse(cx - 4, cy + 0.8 + bob, 4.6, 2.6, TMC_MD)
    # Lit crown up-left, shadowed underside.
    c.ellipse(cx - 1, cy - 2.4 + bob, 6.0, 2.0, TMC_LT)
    c.ellipse(cx + 2, cy - 2.8 + bob, 3.2, 1.4, TMC_HI)
    c.ellipse(cx + 1, cy + 2.6 + bob, 6.4, 1.6, TMC_SH)
    c.hline(cx - 6, cx + 6, cy + 4 + bob, TMC_DK)
    # Underlight: the madra that holds it up.
    c.dither(cx - 7, cy + 5 + bob, 14, 2, alpha(TMC_LT, 0.7), level=6, phase=i)
    c.outline(OUTLINE)
    # Sparkle rides the crown, one frame in three.
    if i % 3 == 0:
        star(c, cx + 4, cy - 5 + bob, 2.0, WHITE)
    return c


def build_tmc() -> None:
    sheet = Sheet(TMC_W, TMC_H, TMC_FRAMES, 1)
    for i in range(TMC_FRAMES):
        sheet.set(i, 0, tmc_frame(i))
    sheet.save("tmc.png")


# --- aura motes -----------------------------------------------------------

AURA_W, AURA_H, AURA_FRAMES = 32, 24, 6
AURA_TONES = {
    # (dark, mid, light) per variant, matching AURA_COLORS in src/data/objects.ts.
    "charge": (hexc("#1c6b46"), hexc("#3fbd7c"), hexc("#7dffb0")),
    "shield": (hexc("#8a6a1c"), hexc("#d8ab3e"), hexc("#ffd876")),
    "lowgrav": (hexc("#1c6a80"), hexc("#3fb3cc"), hexc("#7de8ff")),
}


def icon_charge(c, cx, cy, ink, lit):
    """Hard plus, dark-rimmed. Charge is the common drop and has to survive
    being read at the edge of vision, so it gets the blockiest icon."""
    c.rect(cx - 2, cy - 5, 5, 11, ink)
    c.rect(cx - 5, cy - 2, 11, 5, ink)
    c.rect(cx - 1, cy - 4, 3, 9, lit)
    c.rect(cx - 4, cy - 1, 9, 3, lit)


def icon_shield(c, cx, cy, ink, lit):
    """Heater shield: flat shoulders, straight flanks, a point at the bottom.

    Kept as a solid plate with a rim. An earlier hollow version read as a
    funnel, because at this size an outline-only shape loses its shoulders.
    """
    body = [(cx - 5, cy - 6), (cx + 5, cy - 6), (cx + 5, cy - 1), (cx, cy + 6), (cx - 5, cy - 1)]
    c.poly(body, ink)
    inner = [(cx - 3, cy - 4), (cx + 3, cy - 4), (cx + 3, cy - 1), (cx, cy + 3), (cx - 3, cy - 1)]
    c.poly(inner, lit)
    # Boss down the centre line: reads as a shield face, not a plain pentagon.
    c.vline(cx, cy - 3, cy + 2, ink)


def icon_lowgrav(c, cx, cy, ink, lit):
    """Three stacked chevrons pointing up.

    Narrow and well separated: full-width chevrons blurred into ripples and
    stopped reading as arrows.
    """
    for k in range(3):
        yy = cy + 5 - k * 4
        c.poly([(cx, yy - 4), (cx + 4, yy), (cx + 2, yy), (cx, yy - 1.6), (cx - 2, yy), (cx - 4, yy)], ink)
        c.poly(
            [(cx, yy - 3), (cx + 2.4, yy - 1), (cx + 1.4, yy - 1), (cx, yy - 2.2), (cx - 1.4, yy - 1), (cx - 2.4, yy - 1)],
            lit,
        )


ICONS = {"charge": icon_charge, "shield": icon_shield, "lowgrav": icon_lowgrav}
AURA_ORDER = ["charge", "shield", "lowgrav"]


def aura_frame(variant: str, i: int) -> Canvas:
    dk, md, lt = AURA_TONES[variant]
    c = Canvas(AURA_W, AURA_H)
    cx, cy = 16.0, 12.0
    ph = 2 * math.pi * i / AURA_FRAMES
    pulse = 0.5 + 0.5 * math.sin(ph)

    # Soft body with no hard rim -- the icon inside is what the eye locks on
    # to. The halo stipple is clipped to an ellipse; run over a bare rectangle
    # it turned every mote into a checkered square.
    stipple_ellipse(c, cx, cy, 11.0 + pulse, 8.4 + pulse * 0.8, alpha(md, 0.5), level=7, phase=i)
    c.ellipse(cx, cy, 8.0 + pulse * 0.5, 6.0 + pulse * 0.4, alpha(dk, 0.5))
    c.ellipse(cx, cy, 6.6, 5.0, alpha(md, 0.6))
    c.ellipse(cx - 1.5, cy - 1.5, 4.0, 2.8, alpha(lt, 0.45))

    ICONS[variant](c, cx, cy, mix(dk, OUTLINE, 0.55), lt)

    # Orbiting mote: a second motion cue for players who cannot see the hue.
    a = ph + math.pi * 0.3
    c.px(cx + math.cos(a) * 11, cy + math.sin(a) * 8, lt)
    c.px(cx + math.cos(a + 2.1) * 11, cy + math.sin(a + 2.1) * 8, alpha(lt, 0.6))
    return c


def build_aura() -> None:
    sheet = Sheet(AURA_W, AURA_H, AURA_FRAMES, len(AURA_ORDER))
    for r, variant in enumerate(AURA_ORDER):
        for i in range(AURA_FRAMES):
            sheet.set(i, r, aura_frame(variant, i))
    sheet.save("aura.png")


# --- storm ----------------------------------------------------------------

STORM_W, STORM_H, STORM_FRAMES = 64, 40, 8


def storm_frame(i: int) -> Canvas:
    """A drag hazard, so it reads heavy and opaque -- the opposite of the TMC's
    light, lifted look, even though both are clouds."""
    c = Canvas(STORM_W, STORM_H)
    cx, cy = 32.0, 20.0
    drift = math.sin(2 * math.pi * i / STORM_FRAMES)

    # Anvil mass: several lobes so the outline is lumpy rather than oval.
    # Deliberately uneven: equal lobes produce a smooth oval that reads as a
    # decorative cloud rather than a hazard.
    lobes = [
        (cx - 16, cy - 1, 12, 6),
        (cx + 13, cy - 3, 11, 6),
        (cx - 2, cy - 6, 16, 8),
        (cx + 6, cy - 8, 9, 5),
        (cx - 10, cy - 7, 8, 4),
        (cx - 6, cy + 4, 14, 6),
        (cx + 9, cy + 5, 12, 5),
        (cx - 19, cy + 3, 7, 4),
    ]
    for lx, ly, lrx, lry in lobes:
        c.ellipse(lx + drift * 0.6, ly, lrx, lry, STORM_MD)
    # Lit crown, then a heavy shadowed base.
    for lx, ly, lrx, lry in lobes[:5]:
        c.ellipse(lx + drift * 0.6, ly - 2, lrx * 0.72, lry * 0.5, STORM_LT)
    c.ellipse(cx - 2, cy - 8, 10, 3, STORM_HI)
    c.ellipse(cx, cy + 7, 22, 5, STORM_SH)
    c.ellipse(cx + 2, cy + 9, 16, 3, STORM_DK)
    c.dither(cx - 24, cy + 8, 48, 6, STORM_DK, level=8, phase=i)

    c.outline(OUTLINE)

    # Internal flicker: a bolt on some frames, an interior glow on others.
    # Every frame lighting up removes the menace of the wait between strikes.
    if i % 4 == 1:
        bx, by = cx - 6 + drift * 5, cy - 4
        pts = [(bx, by), (bx + 3, by + 5), (bx - 1, by + 6), (bx + 4, by + 13)]
        for k in range(len(pts) - 1):
            c.line(*pts[k], *pts[k + 1], LIGHTNING)
        c.px(*pts[1], LIGHTNING_HI)
        # Clipped to the cloud's own pixels. Stippling the lobes' bounding
        # boxes instead painted yellow rectangles out into clear sky.
        c.dither_mask(alpha(LIGHTNING, 0.30), level=4, region=(0, 0, STORM_W, int(cy + 8)), phase=i)
    elif i % 4 == 2:
        # Afterglow one frame later: the discharge fading, not a second strike.
        c.dither_mask(alpha(LIGHTNING, 0.18), level=2, region=(0, 0, STORM_W, int(cy + 4)), phase=i)
    elif i == 6:
        bx = cx + 10 + drift * 3
        c.line(bx, cy - 2, bx - 3, cy + 5, LIGHTNING)
        c.line(bx - 3, cy + 5, bx + 1, cy + 11, LIGHTNING_HI)

    # Rain hatching under the base, sliding across the loop.
    for k in range(9):
        rx = cx - 20 + k * 5 + (i * 2) % 5
        c.line(rx, cy + 10, rx - 2, cy + 15, alpha(STORM_HI, 0.55))
    return c


def build_storm() -> None:
    sheet = Sheet(STORM_W, STORM_H, STORM_FRAMES, 1)
    for i in range(STORM_FRAMES):
        sheet.set(i, 0, storm_frame(i))
    sheet.save("storm.png")


# --- rock spires ----------------------------------------------------------

SPIKE_W, SPIKE_H, SPIKE_VARIANTS = 64, 40, 4

# Per-variant spire clusters: (x offset, height, half-width, lean).
SPIRE_SETS = [
    [(-21, 26, 9, -2), (-7, 34, 10, 0), (7, 21, 7, 2), (20, 29, 8, -2)],
    [(-24, 19, 7, 1), (-11, 31, 9, -3), (2, 37, 11, 0), (16, 23, 8, 3), (26, 15, 6, -1)],
    [(-17, 33, 11, 3), (0, 24, 7, -2), (13, 35, 10, -3), (25, 20, 7, 2)],
    [(-23, 29, 10, -3), (-6, 20, 7, 3), (8, 33, 9, 1), (21, 25, 9, -2), (29, 14, 6, 0)],
]


def spire(c: Canvas, bx, base_y, h, hw, lean):
    """One spire: a hard lit left face, a dark right face, a bright apex.

    The split runs from the apex to the base rather than following the outline,
    which is what makes a triangle read as faceted stone instead of a flat
    coloured wedge.
    """
    apex = (bx + lean, base_y - h)
    left = (bx - hw, base_y)
    right = (bx + hw, base_y)
    c.poly([apex, right, left], ROCK_SH)
    c.poly([apex, (bx + lean * 0.2, base_y), left], ROCK_MD)
    c.poly([apex, right, (bx + lean * 0.2 + hw * 0.55, base_y)], ROCK_DK)
    # Lit edge along the upper-left face.
    c.line(apex[0], apex[1], left[0], left[1], ROCK_LT)
    # The point itself is the danger read: three pixels of near-white.
    c.px(apex[0], apex[1], ROCK_HI)
    c.px(apex[0], apex[1] + 1, ROCK_HI)
    c.px(apex[0] - 1, apex[1] + 2, ROCK_LT)
    # Fracture line partway down, offset from the facet split.
    c.line(apex[0] - 1, apex[1] + h * 0.35, bx - hw * 0.5, base_y - 1, ROCK_DK)


def spike_variant(v: int) -> Canvas:
    c = Canvas(SPIKE_W, SPIKE_H)
    cx = SPIKE_W * 0.5
    base_y = SPIKE_H - 1  # contact row
    spires = SPIRE_SETS[v]
    # Back rank first, drawn cooler and shorter for depth.
    for dx, h, hw, lean in spires:
        if (dx + v) % 2:
            c.poly(
                [(cx + dx + lean + 3, base_y - h * 0.78), (cx + dx + hw + 3, base_y), (cx + dx - hw + 3, base_y)],
                ROCK_DK,
            )
    for dx, h, hw, lean in spires:
        spire(c, cx + dx, base_y, h, hw, lean)
    # Rubble along the contact line ties the cluster to the ground.
    for k in range(11):
        rx = 3 + k * 5.5 + (v * 2 % 5)
        c.rect(rx, base_y - 1, 3, 2, ROCK_SH)
        c.px(rx, base_y - 1, ROCK_MD)
    c.outline(OUTLINE)
    return c


def build_spike() -> None:
    sheet = Sheet(SPIKE_W, SPIKE_H, SPIKE_VARIANTS, 1)
    for v in range(SPIKE_VARIANTS):
        sheet.set(v, 0, spike_variant(v))
    sheet.save("spike.png")


def build() -> None:
    print("objects")
    build_pad()
    build_tmc()
    build_aura()
    build_storm()
    build_spike()


if __name__ == "__main__":
    build()
