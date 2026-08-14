"""Pixel drawing primitives.

A thin layer over a numpy RGBA buffer. Everything is integer-addressed and
source-over composited by hand: nothing here ever produces an anti-aliased or
sub-pixel result, which is the whole point -- PIL's own draw calls will happily
hand back half-covered edge pixels on ellipses and polygons.

Coordinate convention: x right, y down, origin top-left, light from upper-left.
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image

from palette import CLEAR, OUTLINE

SPRITE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "public",
    "assets",
    "sprites",
)


class Canvas:
    """An RGBA pixel buffer with painterly helpers."""

    __slots__ = ("w", "h", "buf")

    def __init__(self, w: int, h: int, fill=CLEAR):
        self.w = w
        self.h = h
        self.buf = np.zeros((h, w, 4), dtype=np.uint8)
        if fill[3]:
            self.buf[:, :] = fill

    # -- core -------------------------------------------------------------

    def px(self, x, y, c) -> None:
        """Source-over a single pixel. Out-of-bounds writes are dropped."""
        if c is None or c[3] == 0:
            return
        x = int(x)
        y = int(y)
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        if c[3] == 255:
            self.buf[y, x] = c
            return
        a = c[3] / 255.0
        dst = self.buf[y, x]
        da = dst[3] / 255.0
        oa = a + da * (1 - a)
        if oa <= 0:
            return
        for i in range(3):
            dst[i] = int(round((c[i] * a + dst[i] * da * (1 - a)) / oa))
        dst[3] = int(round(oa * 255))

    def get(self, x, y):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return CLEAR
        return tuple(int(v) for v in self.buf[y, x])

    def opaque(self, x, y) -> bool:
        return self.get(x, y)[3] > 0

    def clear(self) -> None:
        self.buf[:, :] = 0

    # -- rectangles -------------------------------------------------------

    def rect(self, x, y, w, h, c) -> None:
        """Filled rect. Fast path for fully opaque colours."""
        if c is None or c[3] == 0 or w <= 0 or h <= 0:
            return
        x0, y0 = int(x), int(y)
        x1, y1 = x0 + int(w), y0 + int(h)
        if c[3] == 255:
            x0c, y0c = max(0, x0), max(0, y0)
            x1c, y1c = min(self.w, x1), min(self.h, y1)
            if x1c > x0c and y1c > y0c:
                self.buf[y0c:y1c, x0c:x1c] = c
            return
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                self.px(xx, yy, c)

    def rect_outline(self, x, y, w, h, c) -> None:
        self.hline(x, x + w - 1, y, c)
        self.hline(x, x + w - 1, y + h - 1, c)
        self.vline(x, y, y + h - 1, c)
        self.vline(x + w - 1, y, y + h - 1, c)

    def hline(self, x0, x1, y, c) -> None:
        if x1 < x0:
            x0, x1 = x1, x0
        self.rect(x0, y, x1 - x0 + 1, 1, c)

    def vline(self, x, y0, y1, c) -> None:
        if y1 < y0:
            y0, y1 = y1, y0
        self.rect(x, y0, 1, y1 - y0 + 1, c)

    # -- lines ------------------------------------------------------------

    def line(self, x0, y0, x1, y1, c, width: int = 1) -> None:
        """Bresenham. `width` thickens symmetrically around the ideal line."""
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        steep = dx < -dy
        half = width // 2
        while True:
            if width <= 1:
                self.px(x0, y0, c)
            elif steep:
                for k in range(-half, width - half):
                    self.px(x0 + k, y0, c)
            else:
                for k in range(-half, width - half):
                    self.px(x0, y0 + k, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    # -- ellipses ---------------------------------------------------------

    def ellipse(self, cx, cy, rx, ry, c) -> None:
        """Filled ellipse, centre-and-radius form. Scanline, hard edges.

        Radii are treated as half-extents in pixel units; the 0.5 term makes a
        radius of 1 produce a 3px-wide span rather than a lopsided 2.
        """
        if rx <= 0 or ry <= 0:
            return
        y0 = int(math.floor(cy - ry))
        y1 = int(math.ceil(cy + ry))
        for yy in range(y0, y1 + 1):
            dy = (yy - cy) / ry
            if abs(dy) > 1:
                continue
            span = rx * math.sqrt(max(0.0, 1 - dy * dy))
            xa = int(math.ceil(cx - span - 0.5))
            xb = int(math.floor(cx + span + 0.5))
            self.hline(xa, xb, yy, c)

    def ellipse_outline(self, cx, cy, rx, ry, c) -> None:
        """Hollow ellipse -- fill twice and knock out the interior."""
        tmp = Canvas(self.w, self.h)
        tmp.ellipse(cx, cy, rx, ry, (255, 255, 255, 255))
        inner = Canvas(self.w, self.h)
        inner.ellipse(cx, cy, rx - 1, ry - 1, (255, 255, 255, 255))
        for yy in range(self.h):
            for xx in range(self.w):
                if tmp.buf[yy, xx, 3] and not inner.buf[yy, xx, 3]:
                    self.px(xx, yy, c)

    def circle(self, cx, cy, r, c) -> None:
        self.ellipse(cx, cy, r, r, c)

    # -- polygons ---------------------------------------------------------

    def poly(self, pts, c) -> None:
        """Even-odd scanline polygon fill with a pixel-centre sample."""
        if len(pts) < 3:
            return
        ys = [p[1] for p in pts]
        y0 = int(math.floor(min(ys)))
        y1 = int(math.ceil(max(ys)))
        n = len(pts)
        for yy in range(y0, y1 + 1):
            sy = yy + 0.5
            xs = []
            for i in range(n):
                ax, ay = pts[i]
                bx, by = pts[(i + 1) % n]
                if (ay <= sy < by) or (by <= sy < ay):
                    t = (sy - ay) / (by - ay)
                    xs.append(ax + (bx - ax) * t)
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                xa = int(math.ceil(xs[i] - 0.5))
                xb = int(math.floor(xs[i + 1] - 0.5))
                if xb >= xa:
                    self.hline(xa, xb, yy, c)

    def tri(self, p0, p1, p2, c) -> None:
        self.poly([p0, p1, p2], c)

    # -- shading ----------------------------------------------------------

    def dither(self, x, y, w, h, c, level: int = 2, phase: int = 0) -> None:
        """Ordered 4x4 Bayer stipple.

        `level` 0..16 is the number of cells lit per 4x4 tile; used to fade a
        tone into another without introducing a new palette entry (the classic
        fix for banding on large soft shapes like clouds and glows).
        """
        bayer = (
            (0, 8, 2, 10),
            (12, 4, 14, 6),
            (3, 11, 1, 9),
            (15, 7, 13, 5),
        )
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if bayer[(yy + phase) & 3][(xx + phase) & 3] < level:
                    self.px(xx, yy, c)

    def dither_mask(self, c, level: int, region=None, phase: int = 0) -> None:
        """Stipple `c` only where the canvas is already opaque."""
        bayer = (
            (0, 8, 2, 10),
            (12, 4, 14, 6),
            (3, 11, 1, 9),
            (15, 7, 13, 5),
        )
        x0, y0, x1, y1 = region or (0, 0, self.w, self.h)
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                if self.buf[yy, xx, 3] and bayer[(yy + phase) & 3][(xx + phase) & 3] < level:
                    self.px(xx, yy, c)

    # -- silhouette work --------------------------------------------------

    def outline(self, c=OUTLINE, diagonal: bool = False, inside: bool = False) -> None:
        """Trace a 1px rim around every opaque cluster.

        `inside` overwrites the sprite's own border pixels instead of growing
        the silhouette -- used when a sprite is already at its size budget.
        """
        a = self.buf[:, :, 3] > 0
        pad = np.zeros((self.h + 2, self.w + 2), dtype=bool)
        pad[1:-1, 1:-1] = a
        neigh = (
            pad[0:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, 0:-2] | pad[1:-1, 2:]
        )
        if diagonal:
            neigh = neigh | pad[0:-2, 0:-2] | pad[0:-2, 2:] | pad[2:, 0:-2] | pad[2:, 2:]
        if inside:
            hole = np.zeros((self.h + 2, self.w + 2), dtype=bool)
            hole[1:-1, 1:-1] = ~a
            edge_of_hole = (
                hole[0:-2, 1:-1] | hole[2:, 1:-1] | hole[1:-1, 0:-2] | hole[1:-1, 2:]
            )
            if diagonal:
                edge_of_hole = (
                    edge_of_hole
                    | hole[0:-2, 0:-2]
                    | hole[0:-2, 2:]
                    | hole[2:, 0:-2]
                    | hole[2:, 2:]
                )
            target = a & edge_of_hole
        else:
            target = (~a) & neigh
        self.buf[target] = c

    def shadow_pass(self, c, dx: int = 1, dy: int = 1) -> None:
        """Darken pixels whose up-left neighbour is empty: a cheap contact rim."""
        a = self.buf[:, :, 3] > 0
        shifted = np.zeros_like(a)
        ys, xs = self.h, self.w
        sy0, sy1 = max(0, dy), min(ys, ys + dy)
        sx0, sx1 = max(0, dx), min(xs, xs + dx)
        shifted[sy0:sy1, sx0:sx1] = a[sy0 - dy : sy1 - dy, sx0 - dx : sx1 - dx]
        self.buf[a & ~shifted] = c

    def replace(self, src, dst) -> None:
        m = np.all(self.buf == np.array(src, dtype=np.uint8), axis=2)
        self.buf[m] = dst

    def tint_all(self, c) -> None:
        """Recolour every opaque pixel, preserving alpha. Used for palette swaps."""
        m = self.buf[:, :, 3] > 0
        self.buf[m, 0] = c[0]
        self.buf[m, 1] = c[1]
        self.buf[m, 2] = c[2]

    def fade(self, factor: float) -> None:
        self.buf[:, :, 3] = (self.buf[:, :, 3].astype(np.float32) * factor).astype(np.uint8)

    # -- composition ------------------------------------------------------

    def blit(self, other: "Canvas", x: int = 0, y: int = 0) -> None:
        for yy in range(other.h):
            ty = y + yy
            if ty < 0 or ty >= self.h:
                continue
            for xx in range(other.w):
                a = other.buf[yy, xx, 3]
                if a:
                    self.px(x + xx, ty, tuple(int(v) for v in other.buf[yy, xx]))

    def flip_h(self) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.buf = self.buf[:, ::-1].copy()
        return out

    def flip_v(self) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.buf = self.buf[::-1, :].copy()
        return out

    def copy(self) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.buf = self.buf.copy()
        return out

    def translated(self, dx: int, dy: int) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.blit(self, dx, dy)
        return out

    def image(self) -> Image.Image:
        return Image.fromarray(self.buf, "RGBA")


class Sheet:
    """A uniform grid of frames written out as one PNG."""

    def __init__(self, fw: int, fh: int, cols: int, rows: int = 1):
        self.fw, self.fh, self.cols, self.rows = fw, fh, cols, rows
        self.canvas = Canvas(fw * cols, fh * rows)

    def set(self, col: int, row: int, frame: Canvas) -> None:
        assert frame.w == self.fw and frame.h == self.fh, (
            f"frame {frame.w}x{frame.h} does not fit cell {self.fw}x{self.fh}"
        )
        self.canvas.blit(frame, col * self.fw, row * self.fh)

    def frame(self) -> Canvas:
        return Canvas(self.fw, self.fh)

    def save(self, name: str) -> str:
        os.makedirs(SPRITE_DIR, exist_ok=True)
        path = os.path.join(SPRITE_DIR, name)
        self.canvas.image().save(path, optimize=True)
        print(f"  {name:24s} {self.canvas.w}x{self.canvas.h}  ({self.fw}x{self.fh} x {self.cols}x{self.rows})")
        return path


def save_canvas(canvas: Canvas, name: str) -> str:
    os.makedirs(SPRITE_DIR, exist_ok=True)
    path = os.path.join(SPRITE_DIR, name)
    canvas.image().save(path, optimize=True)
    print(f"  {name:24s} {canvas.w}x{canvas.h}")
    return path


# -- shape utilities used by more than one generator -----------------------


def wobble(i: int, n: int) -> float:
    """Normalised sine over a loop of n frames, -1..1. Keeps loops seamless."""
    return math.sin(2 * math.pi * i / n)


def ramp_step(ramp, t: float):
    """Sample a discrete tone ramp with 0..1. No blending -- picks a real entry."""
    idx = max(0, min(len(ramp) - 1, int(t * len(ramp))))
    return ramp[idx]


def star(canvas: Canvas, cx, cy, r, c, points: int = 4, inner: float = 0.35) -> None:
    """A crisp sparkle. Four-point by default -- reads at 3px, unlike a circle."""
    pts = []
    for i in range(points * 2):
        ang = math.pi * i / points - math.pi / 2
        rad = r if i % 2 == 0 else r * inner
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    canvas.poly(pts, c)


_BAYER = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)


def stipple_ellipse(canvas: Canvas, cx, cy, rx, ry, c, level: int = 8, phase: int = 0) -> None:
    """Bayer stipple clipped to an ellipse.

    Stippling a bounding rectangle instead is the standard way to accidentally
    turn a soft glow into a checkered square.
    """
    if rx <= 0 or ry <= 0:
        return
    for yy in range(int(math.floor(cy - ry)), int(math.ceil(cy + ry)) + 1):
        dy = (yy - cy) / ry
        if abs(dy) > 1:
            continue
        span = rx * math.sqrt(max(0.0, 1 - dy * dy))
        for xx in range(int(math.ceil(cx - span - 0.5)), int(math.floor(cx + span + 0.5)) + 1):
            if _BAYER[(yy + phase) & 3][(xx + phase) & 3] < level:
                canvas.px(xx, yy, c)


def glow_ring(canvas: Canvas, cx, cy, rx, ry, c, level: int = 6) -> None:
    """Stippled halo band just outside an ellipse. Avoids a hard alpha edge."""
    outer = Canvas(canvas.w, canvas.h)
    outer.ellipse(cx, cy, rx, ry, (255, 255, 255, 255))
    inner = Canvas(canvas.w, canvas.h)
    inner.ellipse(cx, cy, rx - 1.5, ry - 1.5, (255, 255, 255, 255))
    bayer = (
        (0, 8, 2, 10),
        (12, 4, 14, 6),
        (3, 11, 1, 9),
        (15, 7, 13, 5),
    )
    for yy in range(canvas.h):
        for xx in range(canvas.w):
            if outer.buf[yy, xx, 3] and not inner.buf[yy, xx, 3]:
                if bayer[yy & 3][xx & 3] < level:
                    canvas.px(xx, yy, c)
