"""Sacred beast sprites: four common species, plus the golden and armoured beasts.

All beasts are drawn facing LEFT because they fly toward the launched technique;
the renderer never flips them. Silhouette is the whole job here -- at gameplay
radii of 6-14px the player sees an outline and a flap rhythm, not plumage. So
each species is separated by proportion first (span, body mass, tail, neck) and
only then by tone.

Three depth planes carry the read: far wing dark, body light, near wing mid.
Wings are built as airfoil strips whose chord is measured perpendicular to the
wing axis, so a raised wing stays thin instead of fattening into the body.

Flap cycle is 6 frames: wings fully up at frame 0, fully down at frame 3.
"""

from __future__ import annotations

import math

from palette import (
    BEAK,
    BEAK_DK,
    BIRD_DK,
    BIRD_HI,
    BIRD_LT,
    BIRD_MD,
    BIRD_SH,
    GOLD_DK,
    GOLD_HI,
    GOLD_LT,
    GOLD_MD,
    GOLD_SH,
    OUTLINE,
    STEEL_DK,
    STEEL_HI,
    STEEL_LT,
    STEEL_MD,
    STEEL_SH,
    WHITE,
    alpha,
)
from pixel import Canvas, Sheet, star

FW, FH = 32, 24
FLAP = 6


class Species:
    """Proportions of one beast. Tuned so the four silhouettes never collide."""

    def __init__(
        self,
        name,
        body_len,
        body_ht,
        neck,
        neck_rise,
        head_r,
        beak_len,
        beak_droop,
        tail,  # 'wedge' | 'fork' | 'stub' | 'trail'
        tail_len,
        reach,
        sweep,
        chord_root,
        chord_mid,
        chord_tip,
        bend,
        legs=0,
        ox=0.0,
    ):
        self.name = name
        self.body_len = body_len
        self.body_ht = body_ht
        self.neck = neck
        self.neck_rise = neck_rise
        self.head_r = head_r
        self.beak_len = beak_len
        self.beak_droop = beak_droop
        self.tail = tail
        self.tail_len = tail_len
        self.reach = reach
        self.sweep = sweep
        self.chord_root = chord_root
        self.chord_mid = chord_mid
        self.chord_tip = chord_tip
        self.bend = bend
        self.legs = legs
        # Horizontal nudge inside the cell: long-nosed species would otherwise
        # push their beak off the left edge of the frame.
        self.ox = ox


SPECIES = [
    # Long-winged soarer. Enormous thin span, slim fuselage, small wedge tail.
    # Silhouette cue: a thin cross that is taller than it is deep.
    Species(
        "soarer",
        body_len=13,
        body_ht=3.0,
        neck=1,
        neck_rise=0,
        head_r=2.0,
        beak_len=4,
        beak_droop=0,
        tail="wedge",
        tail_len=5,
        reach=10.5,
        sweep=2.5,
        chord_root=3.0,
        chord_mid=2.3,
        chord_tip=0.7,
        bend=0.8,
    ),
    # Stubby flitter. Near-spherical mass, big head, short paddle wings.
    # Silhouette cue: a compact ball, wings never leave the body's bounding box
    # by much -- it should read as "small and fast" at a glance.
    Species(
        "flitter",
        body_len=9,
        body_ht=6.5,
        neck=0,
        neck_rise=1.5,
        head_r=3.0,
        beak_len=2,
        beak_droop=0,
        tail="stub",
        tail_len=4,
        reach=7.2,
        sweep=5.5,
        chord_root=3.8,
        chord_mid=3.2,
        chord_tip=1.6,
        bend=1.6,
    ),
    # Forked-tail darter. Scimitar wings swept hard back, deep swallow fork.
    # Silhouette cue: everything points backward; the tail split is the tell.
    Species(
        "darter",
        body_len=11,
        body_ht=3.0,
        neck=0,
        neck_rise=0,
        head_r=2.2,
        beak_len=2,
        beak_droop=0,
        tail="fork",
        tail_len=9,
        reach=9.0,
        sweep=7.5,
        chord_root=2.6,
        chord_mid=1.9,
        chord_tip=0.6,
        bend=2.4,
    ),
    # Broad crane. Neck extended well ahead, broad slow wings, trailing legs.
    # Silhouette cue: the longest horizontal of the four, spear-shaped.
    Species(
        "crane",
        body_len=10,
        body_ht=4.0,
        neck=7,
        neck_rise=-1.5,
        head_r=1.8,
        beak_len=4,
        beak_droop=0.5,
        tail="trail",
        tail_len=3,
        reach=8.5,
        sweep=1.5,
        chord_root=4.2,
        chord_mid=3.6,
        chord_tip=1.0,
        bend=0.4,
        legs=6,
        ox=2.5,
    ),
]


def flap_value(t: float, n: int = FLAP) -> float:
    """-1 (wings up) .. +1 (wings down).

    Cosine keeps the loop seamless, but a raw cosine parks two of six frames
    near zero -- where the wing lies along the body and the sprite momentarily
    stops reading as a bird. The 0.55 power pushes the samples toward the
    extremes so every frame has an unambiguous wing.
    """
    cv = -math.cos(2 * math.pi * t / n)
    return math.copysign(abs(cv) ** 0.55, cv) if cv else 0.0


# Fractions along the wing axis at which chord is sampled: root, elbow, wrist, tip.
_NODES = (0.0, 0.40, 0.74, 1.0)


def _airfoil(rx, ry, reach, sweep, chords, bend, f, scale):
    """Leading- and trailing-edge point lists for one wing.

    The chord is applied along the perpendicular of each segment and forced to
    point backwards (+x), which is what keeps a raised wing 2px wide instead of
    letting it balloon into the body. Four nodes give the taper enough
    resolution to end in an actual point rather than a chopped-off fin.
    """
    back = sweep * scale * (0.35 + 0.65 * abs(f))
    reach = reach * scale
    lead = []
    for t in _NODES:
        # `bend` bows the wing backwards toward the wrist, then straightens.
        bow = math.sin(t * math.pi) * bend * scale
        lead.append((rx + back * t + bow, ry + f * reach * t))

    trail = []
    for i, (px_, py_) in enumerate(lead):
        if i == 0:
            dx, dy = lead[1][0] - px_, lead[1][1] - py_
        elif i == len(lead) - 1:
            dx, dy = px_ - lead[i - 1][0], py_ - lead[i - 1][1]
        else:
            dx = lead[i + 1][0] - lead[i - 1][0]
            dy = lead[i + 1][1] - lead[i - 1][1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        if nx < 0:
            nx, ny = -nx, -ny
        ch = chords[i] * scale
        trail.append((px_ + nx * ch, py_ + ny * ch))
    return lead, trail


def wing(c: Canvas, rx, ry, sp: Species, f: float, fill, edge, lead_col=None, scale=1.0, shrink=1.0):
    chords = (
        sp.chord_root * shrink,
        sp.chord_mid * shrink,
        sp.chord_mid * 0.72 * shrink,
        sp.chord_tip * shrink,
    )
    lead, trail = _airfoil(rx, ry, sp.reach * shrink, sp.sweep, chords, sp.bend, f, scale)
    c.poly(lead + list(reversed(trail)), fill)
    # Trailing edge takes the dark tone: primaries read as a fringe at 8px tall.
    for i in range(len(trail) - 1):
        c.line(trail[i][0], trail[i][1], trail[i + 1][0], trail[i + 1][1], edge)
    c.line(trail[-1][0], trail[-1][1], lead[-1][0], lead[-1][1], edge)
    if lead_col is not None:
        for i in range(len(lead) - 1):
            c.line(lead[i][0], lead[i][1], lead[i + 1][0], lead[i + 1][1], lead_col)
    return lead[-1]


def draw_tail(c: Canvas, bx, by, sp: Species, f: float, mid, dark, scale=1.0):
    tl = sp.tail_len * scale
    tilt = f * 1.6
    if sp.tail == "fork":
        c.poly(
            [
                (bx - 1, by - 1.6),
                (bx + tl, by - 4.5 + tilt),
                (bx + tl - 0.5, by - 3.2 + tilt),
                (bx + tl * 0.42, by + tilt * 0.3),
                (bx + tl - 0.5, by + 3.4 + tilt),
                (bx + tl, by + 4.6 + tilt),
                (bx - 1, by + 1.6),
            ],
            mid,
        )
        c.line(bx + tl * 0.42, by + tilt * 0.3, bx + tl, by + 4.6 + tilt, dark)
    elif sp.tail == "wedge":
        # Splayed fan with a notched trailing edge -- a plain rectangle here
        # made the soarer look like a plank.
        c.poly(
            [
                (bx - 1, by - 1.6),
                (bx + tl - 1, by - 3.0 + tilt),
                (bx + tl, by - 1.6 + tilt),
                (bx + tl - 1.4, by + 0.4 + tilt),
                (bx + tl, by + 2.0 + tilt),
                (bx + tl - 1, by + 3.2 + tilt),
                (bx - 1, by + 1.6),
            ],
            mid,
        )
        c.line(bx + tl - 1, by - 3.0 + tilt, bx + tl - 1.4, by + 0.4 + tilt, dark)
        c.line(bx - 1, by + 1.6, bx + tl - 1, by + 3.2 + tilt, dark)
    elif sp.tail == "stub":
        c.poly(
            [(bx - 1, by - 2), (bx + tl, by - 0.5 + tilt), (bx + tl, by + 3 + tilt), (bx - 1, by + 2)],
            mid,
        )
        c.line(bx - 1, by + 2, bx + tl, by + 3 + tilt, dark)
    else:  # crane: vestigial tail, the trailing legs do the silhouette work
        c.poly([(bx - 1, by - 1.8), (bx + tl, by + 0.5 + tilt), (bx - 1, by + 1.8)], mid)


def draw_beast(sp: Species, i: float, ramp, scale=1.0, cx=None, cy=None, w=FW, h=FH,
               outline_pass: bool = True) -> Canvas:
    dk, sh, md, lt, hi = ramp
    c = Canvas(w, h)
    f = flap_value(i)
    # Far wing lags the near one by ~a tenth of a cycle; a perfectly synced pair
    # reads as a single fat wing.
    f_far = flap_value(i - 0.55)

    cx = (w * 0.5) if cx is None else cx
    cx += sp.ox * scale
    cy = (h * 0.5) if cy is None else cy
    cy -= f * 1.1  # whole beast rises on the upstroke

    bl = sp.body_len * scale
    bh = sp.body_ht * scale
    nose = cx - bl * 0.5
    rump = cx + bl * 0.5
    sx = cx - bl * 0.12  # shoulder
    sy = cy - bh * 0.30

    # --- far wing --------------------------------------------------------
    # Two full steps darker than the body: this is the only cue that separates
    # the pair into two wings once the sprite is scaled down to gameplay size.
    wing(c, sx + 1.5 * scale, sy + 1.2 * scale, sp, f_far, dk, dk, sh, scale, shrink=0.84)

    # --- tail ------------------------------------------------------------
    draw_tail(c, rump - 1, cy + bh * 0.1, sp, f, md, sh, scale)

    # --- trailing legs ---------------------------------------------------
    if sp.legs:
        ly = cy + bh * 0.45
        lx = rump - 1
        c.line(lx, ly, lx + sp.legs * scale, ly + 1.2, md)
        c.line(lx, ly + 1, lx + sp.legs * scale, ly + 2.2, dk)
        c.px(lx + sp.legs * scale, ly + 1.2, dk)

    # --- body ------------------------------------------------------------
    c.ellipse(cx, cy, bl * 0.5, bh * 0.5, md)
    # Streamlined taper into the rump so the body is not a plain oval.
    c.poly(
        [(cx, cy - bh * 0.5), (rump + 1, cy - bh * 0.16), (rump + 1, cy + bh * 0.2), (cx, cy + bh * 0.5)],
        md,
    )
    c.ellipse(cx - bl * 0.10, cy - bh * 0.30, bl * 0.42, bh * 0.30, lt)
    c.hline(cx - bl * 0.30, cx + bl * 0.08, cy - bh * 0.5 + 1, hi)
    c.ellipse(cx + bl * 0.16, cy + bh * 0.32, bl * 0.36, bh * 0.24, sh)
    c.line(cx - bl * 0.34, cy + bh * 0.5, rump - 1, cy + bh * 0.22, dk)

    # --- neck + head -----------------------------------------------------
    hx = nose - sp.neck * scale
    hy = cy + sp.neck_rise * scale - bh * 0.14
    if sp.neck:
        # Deliberately thin: a fat neck turns the crane into a featureless bar.
        c.line(nose + 1, cy - bh * 0.18, hx + 1, hy + 0.5, md, width=2)
        c.line(nose + 1, cy - bh * 0.18 - 1, hx + 1, hy - 0.5, lt)
    hr = sp.head_r * scale
    c.ellipse(hx, hy, hr, hr * 0.95, md)
    c.ellipse(hx + 0.3, hy - 0.6, hr * 0.66, hr * 0.5, lt)
    c.px(hx + hr * 0.2, hy - hr * 0.7, hi)

    # --- beak ------------------------------------------------------------
    bl_ = sp.beak_len * scale
    bd = sp.beak_droop * scale
    bx0 = hx - hr * 0.55
    c.poly([(bx0, hy - 1.1), (bx0 - bl_, hy + bd), (bx0, hy + 1.3)], BEAK)
    c.line(bx0, hy + 0.5, bx0 - bl_, hy + bd, BEAK_DK)

    eye = (int(round(hx - hr * 0.1)), int(round(hy - 0.4)))

    # --- near wing -------------------------------------------------------
    # Mid tone with a lit leading edge: reads as a wing over a lighter body
    # without competing with the body for the brightest value in the sprite.
    wing(c, sx, sy, sp, f, md, sh, lt, scale)

    # The outline pass only paints transparent pixels, so interior detail is
    # safe to lay down first. Composites that add their own limbs (streamers,
    # plates) suppress it and run a single pass over the finished figure.
    c.px(eye[0], eye[1], OUTLINE)
    c.px(eye[0], eye[1] - 1, hi)
    if outline_pass:
        c.outline(OUTLINE)
    return c


def build_common() -> None:
    sheet = Sheet(FW, FH, FLAP, len(SPECIES))
    ramp = (BIRD_DK, BIRD_SH, BIRD_MD, BIRD_LT, BIRD_HI)
    for r, sp in enumerate(SPECIES):
        for i in range(FLAP):
            sheet.set(i, r, draw_beast(sp, i, ramp))
    sheet.save("birds.png")


GOLDEN = Species(
    "golden",
    body_len=14,
    body_ht=4.0,
    neck=3,
    neck_rise=-1.0,
    head_r=2.4,
    beak_len=4,
    beak_droop=0.5,
    tail="wedge",
    tail_len=4,
    reach=11.5,
    sweep=3.0,
    chord_root=4.0,
    chord_mid=3.0,
    chord_tip=1.4,
    bend=0.8,
)


def build_golden() -> None:
    """The jackpot beast: radiant plumage, streamers, a travelling shimmer."""
    fw, fh = 40, 32
    sheet = Sheet(fw, fh, FLAP, 1)
    ramp = (GOLD_DK, GOLD_SH, GOLD_MD, GOLD_LT, GOLD_HI)
    for i in range(FLAP):
        c = Canvas(fw, fh)
        cx, cy = fw * 0.5 - 2, fh * 0.5
        f = flap_value(i)

        # Two tail streamers, drawn behind the body and tapering to a point.
        # Three read as a squiggle at this size; two read as plumage.
        tx = cx + GOLDEN.body_len * 0.5 + 2
        for k in (-1, 1):
            ph = i * 0.9 + (0 if k < 0 else 2.4)
            for s in range(11):
                t = s / 10
                # Under half a wave over the whole ribbon: any more and the tip
                # curls back on itself and reads as a detached hook.
                sy = cy + k * (1.4 + t * 2.6) + math.sin(ph + s * 0.2) * (0.5 + t * 0.8) + f * 0.7
                c.px(tx + s, sy, GOLD_LT if t < 0.55 else GOLD_MD)
                if t < 0.5:
                    c.px(tx + s, sy + 1, GOLD_SH)

        c.blit(draw_beast(GOLDEN, i, ramp, scale=1.0, cx=cx, cy=cy, w=fw, h=fh, outline_pass=False))

        # Crest: three swept plumes rooted on the crown. They must touch the
        # skull or they read as detached debris.
        hx = cx - GOLDEN.body_len * 0.5 - GOLDEN.neck
        hy = cy - 1.0 - GOLDEN.body_ht * 0.14 - f * 1.1
        for k in range(2):
            c.line(hx + k, hy - 1.8, hx + 2.5 + k * 2.0, hy - 4.6 - k * 0.8, GOLD_MD)
            c.px(hx + 2.5 + k * 2.0, hy - 4.6 - k * 0.8, GOLD_LT)

        # One rim for the whole composed figure -- streamers and crest included.
        c.outline(OUTLINE)

        # Shimmer sweep: a lit band travelling nose-to-tail across the cycle.
        # Only lifts tones that are already lit, so the sweep never flattens the
        # shading into a solid bar.
        sweep_x = int((i / FLAP) * (fw + 14)) - 7
        liftable = {GOLD_MD, GOLD_LT}
        for yy in range(fh):
            xx = sweep_x + (yy // 3)
            if c.get(xx, yy) in liftable:
                c.px(xx, yy, GOLD_HI)

        # Sparse orbiting motes rather than a full corona ring: the ring fought
        # the silhouette instead of framing it.
        for k in range(5):
            a = math.radians(k * 72 + i * 14)
            c.px(cx + math.cos(a) * 17, cy + math.sin(a) * 12, alpha(GOLD_LT, 0.65))
        star(c, cx - 12, cy - 9 + math.sin(i * 1.3) * 2, 2.0, WHITE)
        sheet.set(i, 0, c)
    sheet.save("bird_golden.png")


ARMORED = Species(
    "armored",
    body_len=13,
    body_ht=7.0,
    neck=1,
    neck_rise=0,
    head_r=2.8,
    beak_len=3,
    beak_droop=1.0,
    tail="wedge",
    tail_len=5,
    reach=9.5,
    sweep=4.0,
    chord_root=4.6,
    chord_mid=3.6,
    chord_tip=1.6,
    bend=1.0,
)


def build_armored() -> None:
    """Plated beast. Only shatters above a speed threshold, so it must LOOK
    heavy: banded plates, blunt helm, a shallow laboured beat."""
    fw, fh = 36, 28
    sheet = Sheet(fw, fh, FLAP, 1)
    ramp = (STEEL_DK, STEEL_SH, STEEL_MD, STEEL_LT, STEEL_HI)
    for i in range(FLAP):
        c = Canvas(fw, fh)
        cx, cy = fw * 0.5, fh * 0.5
        # Half-amplitude beat: sampled from the same cycle, compressed toward 0.
        c.blit(draw_beast(ARMORED, i, ramp, scale=1.0, cx=cx, cy=cy, w=fw, h=fh, outline_pass=False))
        f = flap_value(i)
        by = cy - f * 1.1

        # Plate banding: two chevrons only. Three turned the flank into stripes
        # and destroyed the mass the beast is supposed to convey.
        for k in range(2):
            bx = cx - 1.5 + k * 4.5
            c.line(bx + 1, by - 3.2, bx - 1.0, by + 2.8, STEEL_HI)
            c.line(bx, by - 3.2, bx - 2.0, by + 2.8, STEEL_DK)
            c.px(bx, by - 1.2, STEEL_HI)
        # Helm plate over the skull, brow ridge lit from upper-left.
        hx = cx - ARMORED.body_len * 0.5 - ARMORED.neck
        c.poly([(hx - 3, by - 2.4), (hx + 3, by - 3.6), (hx + 3, by - 1.0), (hx - 3, by - 0.2)], STEEL_LT)
        c.line(hx - 3, by - 2.4, hx + 3, by - 3.6, STEEL_HI)
        c.line(hx - 3, by - 0.2, hx + 3, by - 1.0, STEEL_DK)
        # Gorget ring where helm meets body.
        c.line(hx + 3, by - 3.4, hx + 3, by + 2.0, STEEL_DK)
        c.outline(OUTLINE)
        sheet.set(i, 0, c)
    sheet.save("bird_armored.png")


def build() -> None:
    print("birds")
    build_common()
    build_golden()
    build_armored()


if __name__ == "__main__":
    build()
