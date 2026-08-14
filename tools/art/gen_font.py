"""The interface font.

A 5x7 bitmap face laid out on a 6x8 grid, so the spare column and row become
the natural letter spacing and line gap. Phaser slices this with RetroFont and
advances exactly 6px per character.

WHY THIS EXISTS
---------------
The game renders into a 320x180 framebuffer. Text drawn there with a system
font is rasterised into a handful of real pixels -- a 6px `monospace` glyph is
about four pixels of actual letterform plus anti-aliasing -- and the scale
manager then magnifies that smear by 4-7x with nearest-neighbour filtering.
The result is unreadable regardless of the resolution the text object asks for,
because Phaser divides display size by resolution and the glyph still has to
fit the same six framebuffer pixels. The only fix at this resolution is a face
whose pixels are placed by hand, which is what this is.

Glyphs are pure white so the game can tint them per use; contrast against a
bright sky comes from a shadow pass drawn by the caller, not baked in here
(a baked shadow would take the tint too).

METRICS
-------
    rows 0-4   cap band: uppercase, digits, ascenders (b d f h k l t)
    rows 1-4   x-height band: the remaining lowercase
    rows 5-6   descenders (g j p q y) and the comma tail

Cells run in ASCII order from 32 (space) through 126 (~), then the two
non-ASCII characters the interface actually uses: MIDDLE DOT and HORIZONTAL
ELLIPSIS. src/assets/manifest.ts carries the same order as FONT_CHARS and the
two must not drift apart.
"""

from __future__ import annotations

from palette import WHITE
from pixel import Sheet

CELL_W, CELL_H = 6, 8
GLYPH_W, GLYPH_H = 5, 7
COLS, ROWS = 16, 7

BLANK = "....."

# Every entry is drawn top-down. Five rows is the common case -- the cap band --
# and _rows() pads those out to the full seven.
GLYPHS: dict[str, list[str]] = {
    " ": [BLANK] * 5,
    "!": ["..#..", "..#..", "..#..", ".....", "..#.."],
    '"': [".#.#.", ".#.#.", ".....", ".....", "....."],
    "#": [".#.#.", "#####", ".#.#.", "#####", ".#.#."],
    "$": ["..#..", ".####", "##.#.", ".####", "..#.."],
    "%": ["##..#", "##.#.", "..#..", ".#.##", "#..##"],
    "&": [".##..", "##...", ".##.#", "#..#.", ".##.#"],
    "'": ["..#..", "..#..", ".....", ".....", "....."],
    "(": ["...#.", "..#..", "..#..", "..#..", "...#."],
    ")": [".#...", "..#..", "..#..", "..#..", ".#..."],
    "*": [".....", "#.#.#", ".###.", "#.#.#", "....."],
    "+": [".....", "..#..", ".###.", "..#..", "....."],
    ",": [".....", ".....", ".....", "..#..", "..#..", ".#...", "....."],
    "-": [".....", ".....", ".###.", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", "..#.."],
    "/": ["....#", "...#.", "..#..", ".#...", "#...."],
    "0": [".###.", "#..##", "#.#.#", "##..#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "..##.", ".#...", "#####"],
    "3": ["####.", "....#", ".###.", "....#", "####."],
    "4": ["#..#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "####."],
    "6": [".###.", "#....", "####.", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", "..#.."],
    "8": [".###.", "#...#", ".###.", "#...#", ".###."],
    "9": [".###.", "#...#", ".####", "....#", ".###."],
    ":": [".....", "..#..", ".....", "..#..", "....."],
    ";": [".....", "..#..", ".....", "..#..", "..#..", ".#...", "....."],
    "<": ["...#.", "..#..", ".#...", "..#..", "...#."],
    "=": [".....", ".###.", ".....", ".###.", "....."],
    ">": [".#...", "..#..", "...#.", "..#..", ".#..."],
    "?": [".###.", "#...#", "..##.", ".....", "..#.."],
    "@": [".###.", "#...#", "#.###", "#....", ".###."],
    "A": [".###.", "#...#", "#####", "#...#", "#...#"],
    "B": ["####.", "#...#", "####.", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "###..", "#....", "#####"],
    "F": ["#####", "#....", "###..", "#....", "#...."],
    "G": [".###.", "#....", "#..##", "#...#", ".###."],
    "H": ["#...#", "#...#", "#####", "#...#", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "#####"],
    "J": ["..###", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "###..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "####.", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "####.", "#..#.", "#...#"],
    "S": [".####", "#....", ".###.", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
    "Y": ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
    "Z": ["#####", "...#.", "..#..", ".#...", "#####"],
    "[": ["..##.", "..#..", "..#..", "..#..", "..##."],
    "\\": ["#....", ".#...", "..#..", "...#.", "....#"],
    "]": [".##..", "..#..", "..#..", "..#..", ".##.."],
    "^": ["..#..", ".#.#.", ".....", ".....", "....."],
    "_": [".....", ".....", ".....", ".....", "#####"],
    "`": [".#...", "..#..", ".....", ".....", "....."],
    # Lowercase. The x-height band is rows 1-4; ascenders reach row 0 and
    # descenders run into rows 5-6.
    "a": [".....", ".###.", "#..#.", "#..#.", ".##.#"],
    "b": ["#....", "####.", "#...#", "#...#", "####."],
    "c": [".....", ".###.", "#....", "#....", ".###."],
    "d": ["....#", ".####", "#...#", "#...#", ".####"],
    "e": [".....", ".###.", "#####", "#....", ".###."],
    "f": ["..##.", ".#...", "###..", ".#...", ".#..."],
    "g": [".....", ".####", "#...#", ".####", "....#", ".###.", "....."],
    "h": ["#....", "####.", "#...#", "#...#", "#...#"],
    "i": ["..#..", ".....", ".##..", "..#..", ".###."],
    "j": ["...#.", ".....", "..##.", "...#.", "...#.", "##...", "....."],
    "k": ["#....", "#..#.", "###..", "#..#.", "#...#"],
    "l": [".##..", "..#..", "..#..", "..#..", ".###."],
    "m": [".....", "#####", "#.#.#", "#.#.#", "#.#.#"],
    "n": [".....", "####.", "#...#", "#...#", "#...#"],
    "o": [".....", ".###.", "#...#", "#...#", ".###."],
    "p": [".....", "####.", "#...#", "####.", "#....", "#....", "....."],
    "q": [".....", ".####", "#...#", ".####", "....#", "....#", "....."],
    "r": [".....", "#.##.", "##...", "#....", "#...."],
    "s": [".....", ".###.", "##...", "...##", ".###."],
    "t": [".#...", "###..", ".#...", ".#...", "..##."],
    "u": [".....", "#...#", "#...#", "#...#", ".####"],
    "v": [".....", "#...#", "#...#", ".#.#.", "..#.."],
    "w": [".....", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
    "x": [".....", "#...#", ".#.#.", ".#.#.", "#...#"],
    "y": [".....", "#...#", "#...#", ".####", "....#", ".###.", "....."],
    "z": [".....", "#####", "..##.", ".##..", "#####"],
    "{": ["...##", "..#..", ".##..", "..#..", "...##"],
    "|": ["..#..", "..#..", "..#..", "..#..", "..#.."],
    "}": ["##...", "..#..", "..##.", "..#..", "##..."],
    "~": [".....", ".##.#", "#..#.", ".....", "....."],
    # Non-ASCII tail. Keep in step with FONT_CHARS in the manifest.
    "·": [".....", ".....", "..#..", ".....", "....."],
    "…": [".....", ".....", ".....", ".....", "#.#.#"],
}

# ASCII 32..126 followed by the two extras, which is exactly the order the
# frames are written in below.
CHARS = "".join(chr(c) for c in range(32, 127)) + "·…"


def _rows(char: str) -> list[str]:
    """The glyph as seven 5-wide rows, padding the cap-band shorthand."""
    rows = GLYPHS[char]
    if len(rows) < GLYPH_H:
        rows = list(rows) + [BLANK] * (GLYPH_H - len(rows))
    assert len(rows) == GLYPH_H, f"{char!r}: {len(rows)} rows"
    for r in rows:
        assert len(r) == GLYPH_W, f"{char!r}: row {r!r} is not {GLYPH_W} wide"
    return rows


def build() -> None:
    missing = [c for c in CHARS if c not in GLYPHS]
    assert not missing, f"no glyph for: {missing!r}"
    assert len(CHARS) <= COLS * ROWS, f"{len(CHARS)} glyphs will not fit {COLS}x{ROWS}"

    sheet = Sheet(CELL_W, CELL_H, COLS, ROWS)
    for index, char in enumerate(CHARS):
        cell = sheet.frame()
        for y, row in enumerate(_rows(char)):
            for x, pixel in enumerate(row):
                if pixel == "#":
                    cell.px(x, y, WHITE)
        sheet.set(index % COLS, index // COLS, cell)

    sheet.save("font.png")


if __name__ == "__main__":
    print("font")
    build()
