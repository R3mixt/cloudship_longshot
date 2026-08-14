"""Master palette for Cloudship Longshot.

Every generator imports from here so the whole sheet set stays in one colour
family. Hues are anchored to the gameplay colours declared in
src/data/characters.ts and src/data/objects.ts -- those values are contractual
(the runtime tints particles and UI with them), so the sprite ramps are built
*around* them rather than the other way round.

Naming: <FAMILY>_<ROLE> where role is one of
    DK  deep shadow / occlusion
    SH  shadow
    MD  base / midtone
    LT  lit face (light comes from the upper-left)
    HI  specular highlight, used sparingly

Every ramp keeps a consistent value spacing so two sprites drawn from different
families still read as belonging to the same picture.
"""

from __future__ import annotations


def hexc(s: str, a: int = 255) -> tuple[int, int, int, int]:
    """'#rrggbb' -> RGBA tuple."""
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def mix(c1, c2, t: float):
    """Linear blend in straight RGB. Used to build in-between ramp steps."""
    return (
        int(round(c1[0] + (c2[0] - c1[0]) * t)),
        int(round(c1[1] + (c2[1] - c1[1]) * t)),
        int(round(c1[2] + (c2[2] - c1[2]) * t)),
        int(round(c1[3] + (c2[3] - c1[3]) * t)),
    )


def alpha(c, a: float):
    """Same colour at a new alpha (0..1)."""
    return (c[0], c[1], c[2], max(0, min(255, int(round(a * 255)))))


CLEAR = (0, 0, 0, 0)

# --- Structural neutrals -------------------------------------------------
# One outline colour for everything. A single rim hue is what makes a mixed
# sprite set look like it came from one hand.
OUTLINE = hexc("#0b0a14")
OUTLINE_SOFT = hexc("#1b1a2c")  # interior separation lines, never the silhouette
INK = hexc("#050409")

WHITE = hexc("#ffffff")
BLACK = hexc("#000000")

# --- UI ------------------------------------------------------------------
UI_BG = hexc("#070b1c")
UI_PANEL = hexc("#141b3a")
UI_PANEL_LT = hexc("#202a54")
UI_PANEL_DK = hexc("#0d1229")
UI_BORDER = hexc("#3b4a7a")
UI_BORDER_LT = hexc("#5f74ad")
UI_TEXT = hexc("#dfe6ff")
UI_GOLD = hexc("#ffd876")
UI_GOLD_DK = hexc("#b8913a")
UI_MUTED = hexc("#8fa0d0")
UI_DANGER = hexc("#ff7d7d")

# --- Lindon: Blackflame (black core, red-orange fire) --------------------
LIN_DK = hexc("#080808")
LIN_MD = hexc("#151515")  # contractual body colour
LIN_SH = hexc("#2a1005")  # contractual accent
LIN_LT = hexc("#ff4422")  # contractual trail
LIN_HI = hexc("#ff7733")  # contractual glow
LIN_WHT = hexc("#ffd9a8")  # hottest core of the flame
LIN_ARM_DK = hexc("#8f95ad")  # Blackflame's white marble arm, shaded
LIN_ARM_MD = hexc("#c3c8dc")
LIN_ARM_LT = hexc("#eef0fb")

# --- Yerin: silver sword madra, red accents ------------------------------
YER_DK = hexc("#6f6f8e")
YER_SH = hexc("#a0a0c4")
YER_MD = hexc("#c8c8ee")  # contractual trail
YER_LT = hexc("#e8e8f2")  # contractual body
YER_HI = hexc("#ffffff")  # contractual glow
YER_RED = hexc("#c0304a")  # contractual accent
YER_RED_DK = hexc("#7a1c2e")
YER_RED_LT = hexc("#e85a72")

# --- Mercy: shadow and violet --------------------------------------------
MER_DK = hexc("#331060")
MER_SH = hexc("#4a1d80")  # contractual accent
MER_MD = hexc("#8a3fff")  # contractual trail
MER_LT = hexc("#c98aff")  # contractual body
MER_HI = hexc("#e0bdff")  # contractual glow

# --- Ziel: emerald forge madra -------------------------------------------
ZIE_DK = hexc("#0a3a22")  # contractual accent
ZIE_SH = hexc("#2f9e5b")  # contractual trail
ZIE_MD = hexc("#57e08c")  # contractual body
ZIE_LT = hexc("#a4ffcb")  # contractual glow
ZIE_HI = hexc("#e2fff0")

# --- Eithan / Ozriel: void black, silver, gold ---------------------------
EIT_DK = hexc("#0a0a10")
EIT_MD = hexc("#14141c")  # contractual body
EIT_SH = hexc("#4a4a63")
EIT_LT = hexc("#8888aa")  # contractual trail
EIT_HI = hexc("#ccccee")  # contractual glow
EIT_GOLD = hexc("#e8d44a")  # contractual accent
EIT_GOLD_DK = hexc("#9a8b1e")
EIT_GOLD_LT = hexc("#fff3a8")

# --- Shared organics ------------------------------------------------------
SKIN_DK = hexc("#8a5638")
SKIN_SH = hexc("#c08356")
SKIN_MD = hexc("#e8ad7c")
SKIN_LT = hexc("#f7d0a4")

HAIR_BLACK_DK = hexc("#100f18")
HAIR_BLACK_MD = hexc("#242232")
HAIR_BLACK_LT = hexc("#3c3a52")

CLOTH_DK = hexc("#1d2033")
CLOTH_MD = hexc("#2f3450")
CLOTH_LT = hexc("#464d70")

# --- Wood / cloudship -----------------------------------------------------
WOOD_DK = hexc("#2c2013")
WOOD_SH = hexc("#463322")
WOOD_MD = hexc("#6b5638")
WOOD_LT = hexc("#8a7048")
WOOD_HI = hexc("#ab8e60")

# --- Sky, cloud, weather --------------------------------------------------
CLOUD_DK = hexc("#4a628f")
CLOUD_SH = hexc("#5d7ab5")
CLOUD_MD = hexc("#7591c6")
CLOUD_LT = hexc("#9fb3dd")
CLOUD_HI = hexc("#cdd9f2")

TMC_DK = hexc("#3d7fae")
TMC_SH = hexc("#6bb6e0")
TMC_MD = hexc("#9fd8ff")
TMC_LT = hexc("#c6e8ff")
TMC_HI = hexc("#eaf7ff")

STORM_DK = hexc("#23273a")
STORM_SH = hexc("#30354a")
STORM_MD = hexc("#3a3f52")
STORM_LT = hexc("#454b62")
STORM_HI = hexc("#5d6480")
LIGHTNING = hexc("#ffe9a0")
LIGHTNING_HI = hexc("#fffbe6")

MOUNTAIN_FAR = hexc("#33406e")
MOUNTAIN_MID = hexc("#3d4b7e")
MOUNTAIN_LT = hexc("#4d5d93")
MOUNTAIN_SNOW = hexc("#8b9cc8")

# --- Ground -------------------------------------------------------------
GRASS_DK = hexc("#3d5230")
GRASS_MD = hexc("#4d6a3a")
GRASS_LT = hexc("#6d8f52")
GRASS_HI = hexc("#7da45e")
DIRT_DK = hexc("#332a1c")
DIRT_MD = hexc("#4a3d28")
DIRT_LT = hexc("#5d5238")

# --- Rock / spikes / armour ----------------------------------------------
ROCK_DK = hexc("#2b2e42")
ROCK_SH = hexc("#414459")
ROCK_MD = hexc("#5a5e78")
ROCK_LT = hexc("#7c81a0")
ROCK_HI = hexc("#a8adc8")
STEEL_DK = hexc("#3a3a4e")
STEEL_SH = hexc("#5a5a72")
STEEL_MD = hexc("#7a7a92")
STEEL_LT = hexc("#9a9ab4")
STEEL_HI = hexc("#c8c8dc")

# --- Beasts ---------------------------------------------------------------
BIRD_DK = hexc("#6f6858")
BIRD_SH = hexc("#8f8878")
BIRD_MD = hexc("#a8a092")
BIRD_LT = hexc("#d8d0c2")
BIRD_HI = hexc("#f2ece0")
BEAK = hexc("#e0a040")
BEAK_DK = hexc("#a06d1e")

GOLD_DK = hexc("#8a5f10")
GOLD_SH = hexc("#c08a1c")
GOLD_MD = hexc("#e0b040")
GOLD_LT = hexc("#ffd876")
GOLD_HI = hexc("#fff4c8")

# --- Feathers -------------------------------------------------------------
FEATHER_BONE = hexc("#e8dcc8")
FEATHER_GOLD = hexc("#ffd876")
FEATHER_STEEL = hexc("#9a9ab4")
FEATHER_WHITE = hexc("#ffffff")

# Per-character ramps in one place so the projectile and character generators
# stay in lockstep without duplicating tuples.
CHAR_RAMP = {
    "lindon": (LIN_DK, LIN_SH, LIN_MD, LIN_LT, LIN_HI),
    "yerin": (YER_DK, YER_SH, YER_MD, YER_LT, YER_HI),
    "mercy": (MER_DK, MER_SH, MER_MD, MER_LT, MER_HI),
    "ziel": (ZIE_DK, ZIE_SH, ZIE_MD, ZIE_LT, ZIE_HI),
    "eithan": (EIT_DK, EIT_MD, EIT_SH, EIT_LT, EIT_HI),
}
