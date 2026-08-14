"""Playable sacred artists standing on the cloudship deck.

24x28 per frame, five rows, eight columns:
    idle-0  idle-1  charge-0  charge-1  launch  react-0  react-1  signature

The figure is roughly four and a half heads tall -- squatter than realistic
proportion, because below about 30px a realistic head stops carrying identity
and the sprite becomes a coloured stick. Identity is spent, in order, on:
hair silhouette, held prop, robe colour. Faces are two pixels and are not
where the recognition happens, so hair is always cut above the eye line
rather than being allowed to swallow it.

Vertical layout (frame-space rows):
    1-4    hair mass
    3-10   skull
    11     neck
    11-18  torso
    19-25  legs
    25-26  boots
    27     contact shadow

The camera is a straight side-on view of the deck; every character faces right,
toward the launch direction.
"""

from __future__ import annotations

import math

from palette import (
    CLOTH_DK,
    CLOTH_LT,
    CLOTH_MD,
    EIT_DK,
    EIT_GOLD,
    EIT_GOLD_DK,
    EIT_GOLD_LT,
    EIT_HI,
    EIT_LT,
    EIT_MD,
    EIT_SH,
    HAIR_BLACK_DK,
    HAIR_BLACK_LT,
    HAIR_BLACK_MD,
    LIN_ARM_DK,
    LIN_ARM_LT,
    LIN_ARM_MD,
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
    ROCK_HI,
    ROCK_LT,
    ROCK_MD,
    SKIN_DK,
    SKIN_LT,
    SKIN_MD,
    SKIN_SH,
    WHITE,
    WOOD_LT,
    WOOD_MD,
    YER_DK,
    YER_HI,
    YER_LT,
    YER_MD,
    YER_RED,
    YER_RED_DK,
    YER_RED_LT,
    YER_SH,
    ZIE_DK,
    ZIE_LT,
    ZIE_MD,
    ZIE_SH,
    alpha,
)
from pixel import Canvas, Sheet, star

FW, FH = 24, 28
COLS = 8

CX = 11
HEAD_Y = 6
NECK_Y = 10
TORSO_Y = 11
TORSO_H = 8
HIP_Y = 19
FOOT_Y = 25


class Style:
    def __init__(self, key, robe, trim, hair, trouser, boot, glow=WHITE):
        self.robe = robe  # (dk, md, lt)
        self.trim = trim  # sash / piping accent
        self.hair = hair  # (dk, md, lt)
        self.trouser = trouser  # (dk, md)
        self.boot = boot
        self.glow = glow
        self.key = key


SKIN = (SKIN_DK, SKIN_SH, SKIN_MD, SKIN_LT)

# Hand positions in frame space. Both hands stay outside the torso silhouette
# in every pose -- an arm drawn inside the body outline gets no rim from the
# outline pass and simply vanishes into the robe.
POSES = {
    "idle0": dict(bob=0, lean=0, crouch=0, hl=(5, 18), hr=(18, 18), legs="stand"),
    "idle1": dict(bob=-1, lean=0, crouch=0, hl=(4, 17), hr=(18, 17), legs="stand"),
    "charge0": dict(bob=0, lean=-1, crouch=1, hl=(6, 17), hr=(18, 15), legs="wide"),
    "charge1": dict(bob=1, lean=-2, crouch=2, hl=(7, 16), hr=(19, 13), legs="wide"),
    "launch": dict(bob=-1, lean=3, crouch=0, hl=(7, 16), hr=(21, 10), legs="lunge"),
    "react0": dict(bob=-2, lean=0, crouch=0, hl=(4, 9), hr=(18, 8), legs="stand"),
    "react1": dict(bob=0, lean=1, crouch=0, hl=(3, 14), hr=(20, 13), legs="wide"),
}


def _elbow(sx, sy, hx, hy, out):
    mx, my = (sx + hx) * 0.5, (sy + hy) * 0.5
    dx, dy = hx - sx, hy - sy
    ln = math.hypot(dx, dy) or 1.0
    return mx - dy / ln * out, my + dx / ln * out


def stamp(c: Canvas, draw_fn) -> None:
    """Draw a part on its own layer, rim it, then composite.

    The whole-sprite outline pass only paints transparent pixels, so anything
    laid on top of the torso -- arms, swords, bows -- would otherwise have no
    edge at all and dissolve into the robe. Rimming each part in isolation is
    what keeps limbs legible against dark clothing.
    """
    layer = Canvas(c.w, c.h)
    draw_fn(layer)
    layer.outline(OUTLINE)
    c.blit(layer)


def limb(c: Canvas, sx, sy, hx, hy, out, sleeve, sleeve_lt, skin_c, cuff=None):
    """Two-segment arm with a 2x2 hand, rimmed against the body."""
    ex, ey = _elbow(sx, sy, hx, hy, out)

    def draw(l: Canvas):
        l.line(sx, sy, ex, ey, sleeve, width=2)
        l.line(ex, ey, hx, hy, sleeve, width=2)
        l.line(sx, sy - 1, ex, ey - 1, sleeve_lt)
        if cuff is not None:
            l.px(ex, ey, cuff)
        l.rect(hx - 1, hy - 1, 2, 2, skin_c)
        l.px(hx - 1, hy - 1, SKIN_LT)

    stamp(c, draw)


def legs(c: Canvas, cx, y0, mode, st: Style):
    """Three stances. The shape of the gap between the legs is what sells the
    pose at this size, so each mode changes the gap, not just the angle."""
    tdk, tmd = st.trouser
    boot = st.boot
    if mode == "stand":
        for lx in (cx - 4, cx + 1):
            c.rect(lx, y0, 3, 6, tmd)
            c.vline(lx, y0, y0 + 5, tdk)
            c.vline(lx + 2, y0, y0 + 5, tdk)
            c.rect(lx - 1, y0 + 5, 5, 2, boot)
    elif mode == "wide":
        for s, lx in ((-1, cx - 6), (1, cx + 2)):
            c.poly([(lx + 1, y0), (lx + 4, y0), (lx + 3 + s, y0 + 6), (lx + s, y0 + 6)], tmd)
            c.line(lx + 1 + (0 if s < 0 else 3), y0, lx + (s if s < 0 else 3 + s), y0 + 6, tdk)
            c.rect(lx + s - 1, y0 + 5, 5, 2, boot)
    else:  # lunge: back leg driven out behind, front knee forward
        c.poly([(cx - 8, y0 + 6), (cx - 3, y0), (cx, y0), (cx - 4, y0 + 7)], tmd)
        c.line(cx - 8, y0 + 6, cx - 3, y0, tdk)
        c.rect(cx - 10, y0 + 5, 5, 2, boot)
        c.poly([(cx, y0), (cx + 4, y0 + 1), (cx + 4, y0 + 6), (cx, y0 + 6)], tmd)
        c.line(cx + 4, y0 + 1, cx + 4, y0 + 6, tdk)
        c.rect(cx + 1, y0 + 6, 6, 2, boot)


def torso(c: Canvas, cx, y0, st: Style, lean):
    """Trapezoid shell: broad shoulders, nipped waist, flared hem."""
    dk, md, lt = st.robe
    sl, sr = cx - 4 + lean, cx + 5 + lean
    wl, wr = cx - 3, cx + 4
    c.poly([(sl, y0), (sr, y0), (wr, y0 + 6), (wl, y0 + 6)], md)
    c.poly([(sl, y0), (sl + 3, y0), (wl + 2, y0 + 6), (wl, y0 + 6)], lt)
    c.poly([(sr - 2, y0), (sr, y0), (wr, y0 + 6), (wr - 2, y0 + 6)], dk)
    # Hem flare: two pixels of overhang give the silhouette a waistline.
    c.poly([(wl - 1, y0 + 6), (wr + 1, y0 + 6), (wr, y0 + 8), (wl, y0 + 8)], md)
    # Belt kept short and inset. Run full width it became the brightest,
    # widest element in the sprite and read as a pole through the body.
    c.hline(wl + 1, wr - 1, y0 + 6, st.trim)
    c.px(wl + 1, y0 + 6, dk)
    c.hline(wl - 1, wr + 1, y0 + 7, dk)
    c.hline(wl, wr, y0 + 8, dk)
    c.hline(sl + 1, sr - 1, y0, lt)  # collar


def head(c: Canvas, cx, cy, st: Style):
    sdk, ssh, smd, slt = SKIN
    c.ellipse(cx, cy, 3.2, 3.6, smd)
    c.ellipse(cx - 0.8, cy - 1.0, 2.2, 2.4, slt)
    c.ellipse(cx + 1.8, cy + 1.4, 1.8, 1.7, ssh)
    c.hline(cx - 2, cx + 2, cy + 3, sdk)  # jaw shadow, stops the head fusing
    c.rect(cx - 1, cy + 4, 3, 1, ssh)  # neck
    c.px(cx - 2, cy + 0.5, ssh)  # ear


def face(c: Canvas, cx, cy) -> None:
    """Drawn after hair so a fringe can never eat the eyes."""
    c.px(cx, cy, OUTLINE)
    c.px(cx + 2, cy, OUTLINE)
    c.px(cx + 1, cy + 2, SKIN_DK)  # mouth line


# --- hair ------------------------------------------------------------------
# Every cap is anchored at cy - 2.6 so no fringe reaches the eye row at cy.
# The back mass is where the species-level silhouette difference lives.


def _cap(c, cx, cy, md, lt, rx=3.6, ry=2.4):
    c.ellipse(cx, cy - 2.6, rx, ry, md)
    c.hline(cx - rx + 1, cx + rx - 2, cy - 4.6, lt)


def hair_lindon(c, cx, cy, st, t):
    dk, md, lt = st.hair
    _cap(c, cx, cy, md, lt)
    c.rect(cx - 4, cy - 4, 3, 4, md)  # back of the skull
    c.ellipse(cx - 5, cy - 1 + t, 1.6, 1.8, md)  # tied knot
    c.px(cx - 5, cy - 2 + t, lt)
    c.px(cx - 6, cy + t, dk)


def hair_yerin(c, cx, cy, st, t):
    dk, md, lt = st.hair
    _cap(c, cx, cy, md, lt)
    c.rect(cx - 4, cy - 4, 3, 4, md)
    # Long tail down the back; a single warm tie is the only non-silver pixel.
    for i in range(10):
        px_ = cx - 5 - i * 0.14 + math.sin(i * 0.5 + t) * 0.9
        py = cy - 1 + i
        c.px(px_, py, lt if i % 3 == 0 else md)
        c.px(px_ - 1, py, dk)
    c.rect(cx - 6, cy - 2, 2, 2, YER_RED)
    c.px(cx - 6, cy - 2, YER_RED_LT)


def hair_mercy(c, cx, cy, st, t):
    dk, md, lt = st.hair
    _cap(c, cx, cy, md, lt, rx=3.8, ry=2.6)
    c.rect(cx - 5, cy - 4, 4, 7, md)  # heavy bob to the jaw
    c.vline(cx - 5, cy - 3, cy + 2, dk)
    c.px(cx - 2, cy - 4.6, MER_LT)  # violet sheen
    c.px(cx + 1, cy - 4.6, MER_LT)
    # One loop tied at the nape: distinct outline down to a 12px read.
    c.ellipse(cx - 5, cy + 4 + t * 0.5, 2.0, 1.6, md)
    c.px(cx - 6, cy + 3 + t * 0.5, lt)


def hair_ziel(c, cx, cy, st, t):
    dk, md, lt = st.hair
    _cap(c, cx, cy, md, lt, rx=3.4, ry=2.2)
    c.rect(cx - 4, cy - 4, 3, 3, md)
    # Broken horns, deliberately asymmetric: one snapped mid-length, the other
    # sheared to a nub. Symmetry here read as cat ears.
    c.poly([(cx - 1, cy - 3), (cx - 5, cy - 9), (cx - 2, cy - 5)], ROCK_LT)
    c.line(cx - 1, cy - 3, cx - 5, cy - 9, ROCK_MD)
    c.hline(cx - 5, cx - 3, cy - 9, ROCK_HI)  # the snapped face catches light
    c.poly([(cx + 2, cy - 3), (cx + 3, cy - 6), (cx + 4, cy - 4)], ROCK_LT)
    c.px(cx + 3, cy - 6, ROCK_HI)


def hair_eithan(c, cx, cy, st, t):
    dk, md, lt = st.hair
    _cap(c, cx, cy, md, lt, rx=3.8, ry=2.6)
    c.rect(cx - 5, cy - 4, 4, 5, md)
    c.px(cx - 1, cy - 5.4, lt)
    # Mane well past the shoulders: the flamboyance is in the length.
    for i in range(11):
        px_ = cx - 5 - i * 0.22 + math.sin(i * 0.42 + t) * 0.7
        py = cy + i - 2
        c.px(px_, py, lt if i % 3 == 0 else md)
        c.px(px_ - 1, py, dk)


STYLES = {
    "lindon": Style(
        "lindon",
        robe=(LIN_MD, (0x24, 0x24, 0x2E, 255), (0x3C, 0x3C, 0x4A, 255)),
        trim=LIN_LT,
        hair=(HAIR_BLACK_DK, HAIR_BLACK_MD, HAIR_BLACK_LT),
        trouser=((0x10, 0x10, 0x16, 255), (0x1E, 0x1E, 0x28, 255)),
        boot=(0x2A, 0x1C, 0x14, 255),
        glow=LIN_HI,
    ),
    "yerin": Style(
        "yerin",
        robe=((0x16, 0x16, 0x1E, 255), (0x26, 0x26, 0x32, 255), (0x40, 0x40, 0x52, 255)),
        trim=YER_RED,
        hair=(YER_DK, YER_MD, YER_HI),
        trouser=((0x12, 0x12, 0x1A, 255), (0x22, 0x22, 0x2E, 255)),
        boot=(0x2A, 0x14, 0x1C, 255),
        glow=YER_HI,
    ),
    "mercy": Style(
        "mercy",
        robe=(MER_DK, MER_SH, MER_MD),
        trim=MER_LT,
        hair=(HAIR_BLACK_DK, HAIR_BLACK_MD, (0x5A, 0x3A, 0x7A, 255)),
        trouser=((0x24, 0x0C, 0x44, 255), (0x3A, 0x18, 0x66, 255)),
        boot=(0x1A, 0x08, 0x30, 255),
        glow=MER_HI,
    ),
    "ziel": Style(
        "ziel",
        robe=(CLOTH_DK, CLOTH_MD, CLOTH_LT),
        trim=ZIE_SH,
        # A full step darker than Yerin's silver. At 24px the two pale heads
        # were the only pair on the sheet that could be confused.
        hair=((0x33, 0x38, 0x44, 255), (0x50, 0x57, 0x66, 255), (0x78, 0x81, 0x94, 255)),
        trouser=((0x1B, 0x20, 0x30, 255), (0x2A, 0x30, 0x46, 255)),
        boot=(0x14, 0x18, 0x26, 255),
        glow=ZIE_LT,
    ),
    "eithan": Style(
        "eithan",
        robe=(EIT_DK, (0x2C, 0x2C, 0x40, 255), (0x48, 0x48, 0x64, 255)),
        trim=EIT_GOLD,
        hair=(EIT_GOLD_DK, EIT_GOLD, EIT_GOLD_LT),
        trouser=((0x14, 0x14, 0x1C, 255), (0x24, 0x24, 0x30, 255)),
        boot=(0x14, 0x14, 0x1C, 255),
        glow=EIT_GOLD_LT,
    ),
}

HAIR_FN = {
    "lindon": hair_lindon,
    "yerin": hair_yerin,
    "mercy": hair_mercy,
    "ziel": hair_ziel,
    "eithan": hair_eithan,
}


def base_figure(key: str, pose_name: str, phase: float = 0.0) -> Canvas:
    st = STYLES[key]
    p = POSES[pose_name]
    c = Canvas(FW, FH)
    bob, lean, crouch = p["bob"], p["lean"], p["crouch"]
    dk, md, lt = st.robe

    ty = TORSO_Y + bob + crouch
    hy = HEAD_Y + bob + crouch
    ly = HIP_Y + bob + crouch

    fx, fy = p["hl"]
    limb(c, CX - 3 + lean, ty + 2, fx, fy + bob + crouch, -3, md, lt, SKIN_SH)

    legs(c, CX, ly, p["legs"], st)
    torso(c, CX, ty, st, lean)
    head(c, CX + lean, hy, st)
    HAIR_FN[key](c, CX + lean, hy, st, phase)
    face(c, CX + lean, hy)

    nx, ny = p["hr"]
    limb(c, CX + 3 + lean, ty + 2, nx, ny + bob + crouch, 3, lt, lt, SKIN_MD, cuff=st.trim)
    return c


def finish(c: Canvas) -> Canvas:
    c.outline(OUTLINE)
    return c


# --- signature poses -------------------------------------------------------


def sig_lindon(phase=0.0) -> Canvas:
    """Blackflame flare: the marble arm forward, a black core wreathed in red."""
    c = base_figure("lindon", "charge1", phase)
    limb(c, CX + 1, TORSO_Y + 5, 15, 13, 3, LIN_ARM_MD, LIN_ARM_LT, LIN_ARM_LT, cuff=LIN_ARM_DK)
    fx, fy = 17, 12
    c.circle(fx, fy, 3.8, LIN_MD)
    c.circle(fx, fy, 2.6, LIN_SH)
    for a in range(0, 360, 22):
        r = math.radians(a)
        rr = 4.6 + math.sin(r * 3 + phase) * 1.1
        c.px(fx + math.cos(r) * rr, fy + math.sin(r) * rr, LIN_LT if (a // 22) % 2 else LIN_HI)
    c.circle(fx, fy, 1.2, LIN_HI)
    c.px(fx, fy, LIN_WHT)
    for k in range(3):
        c.line(fx - 2 + k * 2, fy - 4, fx - 1 + k * 2, fy - 8 - k, LIN_LT)
        c.px(fx - 1 + k * 2, fy - 8 - k, LIN_HI)
    return finish(c)


def sig_yerin(phase=0.0) -> Canvas:
    """Sword drawn overhead, silver Goldsign coiled over the far shoulder."""
    c = base_figure("yerin", "react1", phase)
    limb(c, CX + 3, TORSO_Y + 2, 17, 11, 3, YER_DK, YER_SH, SKIN_MD, cuff=YER_RED)
    # One pixel of edge, one of lit flat, one of shadow. Any thicker and it
    # stops reading as a sword and starts reading as a plank.
    c.line(16, 10, 20, 1, YER_DK)
    c.line(17, 10, 21, 1, YER_MD)
    c.line(18, 10, 22, 1, YER_LT)
    c.px(21, 0, YER_HI)
    c.rect(15, 10, 4, 2, YER_RED_DK)  # guard
    c.px(15, 10, YER_RED)
    # Goldsign: a silver coil arcing over the far shoulder and ending in a point.
    for i in range(9):
        a = math.radians(200 - i * 30)
        c.px(CX - 3 + math.cos(a) * 3.6, TORSO_Y + 1 + math.sin(a) * 3.0, YER_LT)
    c.px(CX + 0.6, TORSO_Y - 2, YER_HI)
    return finish(c)


def sig_mercy(phase=0.0) -> Canvas:
    """Bow drawn: shadow strings pulled back, a violet arrow nocked."""
    c = base_figure("mercy", "react1", phase)
    bx, by = 18, 14
    c.line(bx, by - 8, bx + 2, by - 3, MER_MD)
    c.line(bx, by + 8, bx + 2, by + 3, MER_MD)
    c.line(bx + 2, by - 3, bx + 3, by, MER_LT)
    c.line(bx + 2, by + 3, bx + 3, by, MER_LT)
    c.px(bx, by - 8, MER_HI)
    c.px(bx, by + 8, MER_HI)
    c.line(bx, by - 8, bx - 5, by, MER_SH)
    c.line(bx, by + 8, bx - 5, by, MER_SH)
    c.line(bx - 6, by, bx + 6, by, MER_HI)
    c.px(bx + 6, by, WHITE)
    limb(c, CX + 3, TORSO_Y + 2, bx - 6, by, 2, MER_SH, MER_MD, SKIN_MD, cuff=MER_LT)
    return finish(c)


def sig_ziel(phase=0.0) -> Canvas:
    """Hammer raised. Ziel is tired, so the swing reads as heavy, not eager."""
    c = base_figure("ziel", "react0", phase)
    hx, hy = 17, 4
    c.line(hx - 5, hy + 12, hx - 1, hy + 2, WOOD_MD, width=2)  # haft
    c.line(hx - 5, hy + 12, hx - 2, hy + 3, WOOD_LT)
    def head_block(l):
        l.poly([(hx - 3, hy - 1), (hx + 4, hy - 2), (hx + 4, hy + 3), (hx - 3, hy + 4)], ZIE_SH)
        l.line(hx - 3, hy - 1, hx + 4, hy - 2, ZIE_MD)
        l.line(hx - 3, hy, hx + 4, hy - 1, ZIE_LT)
        l.line(hx - 3, hy + 4, hx + 4, hy + 3, ZIE_DK)
        l.vline(hx + 3, hy - 2, hy + 3, ZIE_DK)
        # Rune band across the striking face.
        l.vline(hx, hy - 1, hy + 3, ZIE_LT)
        l.px(hx, hy + 1, ZIE_DK)
    stamp(c, head_block)
    for k in range(3):
        star(c, hx - 4 + k * 4, hy - 4 + math.sin(phase + k) * 1.5, 1.6, ZIE_LT)
    limb(c, CX + 3, TORSO_Y + 2, hx - 4, hy + 10, 3, CLOTH_MD, CLOTH_LT, SKIN_MD, cuff=ZIE_SH)
    return finish(c)


def sig_eithan(phase=0.0) -> Canvas:
    """Ozriel. The blond goes silver-black and the scythe comes out."""
    c = Canvas(FW, FH)
    st = Style(
        "ozriel",
        robe=(EIT_DK, EIT_MD, EIT_SH),
        trim=EIT_HI,
        hair=(EIT_DK, EIT_SH, EIT_HI),
        trouser=(EIT_DK, (0x1E, 0x1E, 0x28, 255)),
        boot=EIT_DK,
        glow=EIT_HI,
    )
    ty, hy, ly = TORSO_Y, HEAD_Y, HIP_Y
    dk, md, lt = st.robe

    # The figure is built centred, then shifted left to clear the right third
    # of the cell for the scythe. Sharing that space put the blade over the
    # head, where it read as a hood instead of a weapon.
    fig = Canvas(FW, FH)
    limb(fig, CX - 3, ty + 2, 4, 15, -3, md, lt, SKIN_SH)
    legs(fig, CX, ly, "wide", st)
    torso(fig, CX, ty, st, 0)
    head(fig, CX, hy, st)
    hair_eithan(fig, CX, hy, st, phase)
    face(fig, CX, hy)
    limb(fig, CX + 3, ty + 2, 14, 13, 3, md, lt, SKIN_MD, cuff=EIT_HI)
    fig.outline(OUTLINE)
    c.blit(fig.translated(-3, 0))

    def scythe(l: Canvas):
        l.line(18, 27, 16, 3, EIT_MD, width=2)
        l.line(19, 27, 17, 3, EIT_SH)
        # Crescent hooking forward off the haft head, thick at the heel and
        # tapering to a single lit pixel at the point.
        p0, p1, p2 = (16, 2), (23, 5), (18, 13)
        tip = None
        for i in range(21):
            t = i / 20
            u = 1 - t
            bx = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
            by = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
            l.px(bx, by, EIT_HI)
            if t < 0.8:
                l.px(bx - 1, by, EIT_LT)
            if t < 0.5:
                l.px(bx - 2, by, EIT_SH)
            tip = (bx, by)
        l.px(tip[0], tip[1], WHITE)
        l.px(16, 3, EIT_HI)

    stamp(c, scythe)

    for k in range(4):
        a = math.radians(k * 90 + phase * 40)
        c.px(CX - 3 + math.cos(a) * 8, 15 + math.sin(a) * 10, alpha(EIT_HI, 0.6))
    star(c, 3, 4, 2.0, EIT_GOLD_LT)
    return c


SIGNATURES = {
    "lindon": sig_lindon,
    "yerin": sig_yerin,
    "mercy": sig_mercy,
    "ziel": sig_ziel,
    "eithan": sig_eithan,
}

ORDER = ["lindon", "yerin", "mercy", "ziel", "eithan"]
FRAME_ORDER = ["idle0", "idle1", "charge0", "charge1", "launch", "react0", "react1"]


def decorate(c: Canvas, key: str, pose_name: str, phase: float) -> Canvas:
    """Per-character props and technique glow layered onto the base pose."""
    st = STYLES[key]
    p = POSES[pose_name]
    bob, lean, crouch = p["bob"], p["lean"], p["crouch"]
    ty = TORSO_Y + bob + crouch

    if key == "lindon":
        # The white arm is Lindon's strongest identity cue, so it is drawn in
        # every frame rather than reserved for the signature pose.
        nx, ny = p["hr"]
        limb(
            c, CX + 3 + lean, ty + 2, nx, ny + bob + crouch, 3,
            LIN_ARM_MD, LIN_ARM_LT, LIN_ARM_LT, cuff=LIN_ARM_DK,
        )
    elif key == "yerin":
        # Sheath rides behind the shoulder; drawn across the torso it read as
        # a drawn blade in every idle frame.
        def sheath(l):
            l.line(CX - 7, ty + 7, CX - 4, ty - 3, YER_DK, width=2)
            l.line(CX - 6, ty + 7, CX - 3, ty - 3, YER_SH)
            l.px(CX - 4, ty - 3, YER_RED)
        stamp(c, sheath)
    elif key == "mercy":
        def stowed_bow(l):
            l.line(CX - 7, ty - 3, CX - 8, ty + 2, MER_SH)
            l.line(CX - 8, ty + 2, CX - 7, ty + 7, MER_SH)
            l.px(CX - 7, ty - 3, MER_LT)
            l.px(CX - 7, ty + 7, MER_LT)
        stamp(c, stowed_bow)
    elif key == "ziel":
        def slung_hammer(l):
            l.line(CX - 6, ty + 6, CX - 5, ty - 1, WOOD_MD)
            l.rect(CX - 7, ty - 4, 4, 3, ZIE_SH)
            l.hline(CX - 7, CX - 4, ty - 4, ZIE_MD)
            l.px(CX - 4, ty - 2, ZIE_DK)
        stamp(c, slung_hammer)
    elif key == "eithan":
        # Gold piping down the lapel rather than a second horizontal belt.
        c.line(CX - 2, ty, CX - 1, ty + 6, EIT_GOLD)
        c.px(CX - 2, ty, EIT_GOLD_LT)
        c.px(CX + 3, ty + 1, EIT_GOLD)

    if pose_name.startswith("charge") or pose_name == "launch":
        gx, gy = p["hr"]
        gy += bob + crouch
        r = 2.0 if pose_name == "charge0" else (3.2 if pose_name == "charge1" else 2.4)
        c.circle(gx, gy, r, alpha(st.glow, 0.5))
        c.circle(gx, gy, r * 0.5, st.glow)
        c.px(gx, gy, WHITE)
        for k in range(4):
            a = math.radians(k * 90 + phase * 60)
            c.px(gx + math.cos(a) * (r + 2), gy + math.sin(a) * (r + 2), alpha(st.glow, 0.7))
    return c


def build() -> None:
    print("characters")
    sheet = Sheet(FW, FH, COLS, len(ORDER))
    for r, key in enumerate(ORDER):
        for i, pose_name in enumerate(FRAME_ORDER):
            phase = i * 0.9
            c = base_figure(key, pose_name, phase)
            decorate(c, key, pose_name, phase)
            sheet.set(i, r, finish(c))
        sheet.set(7, r, SIGNATURES[key](1.2))
    sheet.save("characters.png")


if __name__ == "__main__":
    build()
