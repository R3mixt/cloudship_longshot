"""Packed UI sheet: 9-slice panel, buttons, charge pips, HUD icons, slider.

The layout below is the single source of truth for the sub-rect coordinates in
src/assets/manifest.ts (UI_FRAMES). Anything added here must be added there.

Icons are 8x8 and are built from silhouettes, not from little pictures: at 8px
a padlock drawn as a padlock is mud, whereas a shackle arc over a solid body
still reads as one. Each icon keeps a 1px transparent margin on at least two
sides so it can sit flush against text without touching it.
"""

from __future__ import annotations

from palette import (
    OUTLINE,
    UI_BORDER,
    UI_BORDER_LT,
    UI_GOLD,
    UI_GOLD_DK,
    UI_MUTED,
    UI_PANEL,
    UI_PANEL_DK,
    UI_PANEL_LT,
    UI_TEXT,
    WHITE,
    alpha,
    mix,
)
from pixel import Canvas, save_canvas, star

SHEET_W, SHEET_H = 128, 64

# name -> (x, y, w, h). Mirrored verbatim by UI_FRAMES in the manifest.
UI_FRAMES = {
    "panel_tl": (0, 0, 8, 8),
    "panel_t": (8, 0, 8, 8),
    "panel_tr": (16, 0, 8, 8),
    "panel_l": (0, 8, 8, 8),
    "panel_c": (8, 8, 8, 8),
    "panel_r": (16, 8, 8, 8),
    "panel_bl": (0, 16, 8, 8),
    "panel_b": (8, 16, 8, 8),
    "panel_br": (16, 16, 8, 8),
    "pip_full": (24, 0, 8, 8),
    "pip_empty": (32, 0, 8, 8),
    "icon_lock": (40, 0, 8, 8),
    "icon_star": (48, 0, 8, 8),
    "icon_distance": (24, 8, 8, 8),
    "icon_score": (32, 8, 8, 8),
    "icon_speed": (40, 8, 8, 8),
    "icon_altitude": (48, 8, 8, 8),
    "slider_knob": (24, 16, 8, 8),
    "slider_track": (32, 16, 32, 8),
    "button_normal": (64, 0, 48, 16),
    "button_hover": (64, 16, 48, 16),
    "button_pressed": (64, 32, 48, 16),
}


def panel_tile(c: Canvas, x, y, left, top, right, bottom) -> None:
    """One cell of the 9-slice. Flags say which sides carry the frame edge."""
    c.rect(x, y, 8, 8, UI_PANEL)
    # Interior gradient: a touch lighter toward the upper left.
    c.rect(x, y, 8, 4, mix(UI_PANEL, UI_PANEL_LT, 0.35))
    c.rect(x, y + 6, 8, 2, UI_PANEL_DK)
    if top:
        c.hline(x, x + 7, y, OUTLINE)
        c.hline(x, x + 7, y + 1, UI_BORDER)
        c.hline(x, x + 7, y + 2, UI_BORDER_LT)
    if bottom:
        c.hline(x, x + 7, y + 7, OUTLINE)
        c.hline(x, x + 7, y + 6, UI_BORDER)
    if left:
        c.vline(x, y, y + 7, OUTLINE)
        c.vline(x + 1, y, y + 7, UI_BORDER)
        c.vline(x + 2, y, y + 7, UI_BORDER_LT)
    if right:
        c.vline(x + 7, y, y + 7, OUTLINE)
        c.vline(x + 6, y, y + 7, UI_BORDER)
    # Corner studs: they stop the 9-slice corners reading as a mitre error.
    if top and left:
        c.px(x + 2, y + 2, UI_GOLD)
    if top and right:
        c.px(x + 5, y + 2, UI_GOLD)
    if bottom and left:
        c.px(x + 2, y + 5, UI_GOLD_DK)
    if bottom and right:
        c.px(x + 5, y + 5, UI_GOLD_DK)


def draw_panel(c: Canvas) -> None:
    for row in range(3):
        for col in range(3):
            panel_tile(
                c,
                col * 8,
                row * 8,
                left=(col == 0),
                top=(row == 0),
                right=(col == 2),
                bottom=(row == 2),
            )


def draw_button(c: Canvas, x, y, state: str) -> None:
    w, h = 48, 16
    if state == "normal":
        fill, fill_lo, border, edge, text_ink = mix(UI_PANEL_LT, UI_BORDER, 0.45), UI_PANEL_LT, UI_BORDER_LT, UI_BORDER, UI_TEXT
        dy = 0
    elif state == "hover":
        fill, fill_lo, border, edge, text_ink = mix(UI_PANEL_LT, UI_BORDER_LT, 0.7), mix(UI_PANEL_LT, UI_BORDER, 0.4), UI_GOLD, UI_GOLD_DK, WHITE
        dy = 0
    else:  # pressed: sinks a pixel and loses its top highlight
        fill, fill_lo, border, edge, text_ink = UI_PANEL, UI_PANEL_DK, UI_BORDER, UI_PANEL_DK, UI_MUTED
        dy = 1

    c.rect(x + 1, y + 1 + dy, w - 2, h - 2 - dy, fill_lo)
    c.rect(x + 2, y + 2 + dy, w - 4, (h - 8) - dy, fill)
    # Chamfered frame: corners knocked off so the pill is not a hard rectangle.
    c.hline(x + 2, x + w - 3, y + dy, OUTLINE)
    c.hline(x + 2, x + w - 3, y + h - 1, OUTLINE)
    c.vline(x, y + 2 + dy, y + h - 3, OUTLINE)
    c.vline(x + w - 1, y + 2 + dy, y + h - 3, OUTLINE)
    for cx_, cy_ in ((x + 1, y + 1 + dy), (x + w - 2, y + 1 + dy), (x + 1, y + h - 2), (x + w - 2, y + h - 2)):
        c.px(cx_, cy_, OUTLINE)
    c.hline(x + 2, x + w - 3, y + 1 + dy, border)
    c.hline(x + 2, x + w - 3, y + h - 2, edge)
    c.vline(x + 1, y + 2 + dy, y + h - 3, border)
    c.vline(x + w - 2, y + 2 + dy, y + h - 3, edge)
    if state != "pressed":
        c.hline(x + 3, x + w - 4, y + 2, mix(fill, WHITE, 0.25))
    # Label rule: the baseline the text layer draws over. Not a glyph.
    c.hline(x + 12, x + w - 13, y + 8 + dy, alpha(text_ink, 0.55))


def draw_pip(c: Canvas, x, y, filled: bool) -> None:
    """Charge pip. Filled and empty differ in shape as well as brightness so a
    depleted bar is readable in a screenshot, not just in motion."""
    pts = [(x + 4, y + 1), (x + 7, y + 4), (x + 4, y + 7), (x + 1, y + 4)]
    if filled:
        c.poly(pts, UI_GOLD)
        c.poly([(x + 4, y + 2), (x + 6, y + 4), (x + 4, y + 6), (x + 2, y + 4)], mix(UI_GOLD, WHITE, 0.5))
        c.px(x + 3, y + 3, WHITE)
        c.px(x + 4, y + 6, UI_GOLD_DK)
    else:
        c.poly(pts, UI_BORDER)
        c.poly([(x + 4, y + 2), (x + 6, y + 4), (x + 4, y + 6), (x + 2, y + 4)], UI_PANEL_DK)


def draw_lock(c: Canvas, x, y) -> None:
    # Shackle arc, then a solid body. The arc is the whole read at 8px.
    c.hline(x + 3, x + 5, y, UI_MUTED)
    c.px(x + 2, y + 1, UI_MUTED)
    c.px(x + 6, y + 1, UI_MUTED)
    c.px(x + 2, y + 2, UI_MUTED)
    c.px(x + 6, y + 2, UI_MUTED)
    c.rect(x + 1, y + 3, 7, 5, UI_MUTED)
    c.hline(x + 1, x + 7, y + 3, mix(UI_MUTED, WHITE, 0.4))
    c.hline(x + 1, x + 7, y + 7, OUTLINE)
    c.px(x + 4, y + 5, OUTLINE)
    c.px(x + 4, y + 6, OUTLINE)


def draw_star(c: Canvas, x, y) -> None:
    star(c, x + 4, y + 4, 4.0, UI_GOLD, points=5, inner=0.42)
    star(c, x + 4, y + 4, 2.4, mix(UI_GOLD, WHITE, 0.55), points=5, inner=0.42)
    c.px(x + 3, y + 3, WHITE)


def draw_icon_distance(c: Canvas, x, y) -> None:
    # Double-headed measure. End stops plus inward barbs read as a bowtie, so
    # the heads point outward off a bare shaft instead.
    c.hline(x + 1, x + 6, y + 3, UI_TEXT)
    c.px(x + 2, y + 2, UI_TEXT)
    c.px(x + 2, y + 4, UI_TEXT)
    c.px(x + 5, y + 2, UI_TEXT)
    c.px(x + 5, y + 4, UI_TEXT)
    c.px(x + 1, y + 3, WHITE)
    c.px(x + 6, y + 3, WHITE)
    # Ground rule underneath: distance travelled, not distance in the abstract.
    c.hline(x + 1, x + 6, y + 6, UI_MUTED)


def draw_icon_score(c: Canvas, x, y) -> None:
    # Faceted gem: flat table, angled crown, pointed pavilion.
    c.poly([(x + 2, y + 2), (x + 6, y + 2), (x + 7, y + 4), (x + 4, y + 7), (x + 1, y + 4)], UI_GOLD)
    c.hline(x + 2, x + 6, y + 2, mix(UI_GOLD, WHITE, 0.6))
    c.line(x + 1, y + 4, x + 4, y + 7, UI_GOLD_DK)
    c.line(x + 7, y + 4, x + 4, y + 7, UI_GOLD_DK)
    c.px(x + 3, y + 3, WHITE)


def draw_icon_speed(c: Canvas, x, y) -> None:
    # Double chevron. Two beats read as "faster" where one reads as "next".
    for k in range(2):
        bx = x + 1 + k * 3
        for t in (0, 1):
            c.line(bx + t, y + 1, bx + 2 + t, y + 4, UI_TEXT)
            c.line(bx + 2 + t, y + 4, bx + t, y + 7, UI_TEXT)
        c.px(bx + 2, y + 4, WHITE)
        c.px(bx + 3, y + 4, WHITE)


def draw_icon_altitude(c: Canvas, x, y) -> None:
    # Up arrow standing on a ground rule. A wide head over a 1px stem read as
    # a lamp, so the head is narrowed and the shaft thickened to match.
    c.hline(x + 1, x + 6, y + 7, UI_MUTED)
    c.rect(x + 3, y + 2, 2, 5, UI_TEXT)
    c.poly([(x + 4, y), (x + 6, y + 3), (x + 1, y + 3)], UI_TEXT)
    c.px(x + 3, y + 1, WHITE)
    c.px(x + 3, y + 3, WHITE)


def draw_slider(c: Canvas) -> None:
    kx, ky, _, _ = UI_FRAMES["slider_knob"]
    tx, ty, tw, _ = UI_FRAMES["slider_track"]
    # Track: a sunken channel with a lit lower lip.
    c.rect(tx + 1, ty + 3, tw - 2, 3, UI_PANEL_DK)
    c.hline(tx + 1, tx + tw - 2, ty + 3, OUTLINE)
    c.hline(tx + 1, tx + tw - 2, ty + 5, UI_BORDER)
    c.px(tx, ty + 4, OUTLINE)
    c.px(tx + tw - 1, ty + 4, OUTLINE)
    # Filled portion up to the midpoint, so the art shows what a value means.
    c.rect(tx + 2, ty + 4, tw // 2 - 2, 1, UI_GOLD)

    # Knob: round, lit from the upper left, with a hard rim.
    c.circle(kx + 4, ky + 4, 3.2, UI_BORDER_LT)
    c.circle(kx + 3.4, ky + 3.4, 2.0, mix(UI_BORDER_LT, WHITE, 0.55))
    c.circle(kx + 4, ky + 4, 3.2, UI_BORDER_LT)
    c.ellipse(kx + 3.3, ky + 3.2, 1.6, 1.4, mix(UI_BORDER_LT, WHITE, 0.6))
    c.ellipse(kx + 5, ky + 5, 1.6, 1.4, UI_BORDER)
    c.px(kx + 3, ky + 3, WHITE)


def build() -> None:
    print("ui")
    c = Canvas(SHEET_W, SHEET_H)
    draw_panel(c)

    x, y, _, _ = UI_FRAMES["pip_full"]
    draw_pip(c, x, y, True)
    x, y, _, _ = UI_FRAMES["pip_empty"]
    draw_pip(c, x, y, False)
    x, y, _, _ = UI_FRAMES["icon_lock"]
    draw_lock(c, x, y)
    x, y, _, _ = UI_FRAMES["icon_star"]
    draw_star(c, x, y)
    x, y, _, _ = UI_FRAMES["icon_distance"]
    draw_icon_distance(c, x, y)
    x, y, _, _ = UI_FRAMES["icon_score"]
    draw_icon_score(c, x, y)
    x, y, _, _ = UI_FRAMES["icon_speed"]
    draw_icon_speed(c, x, y)
    x, y, _, _ = UI_FRAMES["icon_altitude"]
    draw_icon_altitude(c, x, y)

    draw_slider(c)

    for state in ("normal", "hover", "pressed"):
        bx, by, _, _ = UI_FRAMES[f"button_{state}"]
        draw_button(c, bx, by, state)

    save_canvas(c, "ui.png")


if __name__ == "__main__":
    build()
