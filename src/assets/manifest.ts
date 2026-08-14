/**
 * Typed manifest for every generated sprite sheet.
 *
 * The PNGs themselves are produced by `npm run art` (tools/art/*.py) and are
 * committed as shipped assets. Every geometry figure below is asserted against
 * the actual file at build time by tools/art/verify.py, so this file and the
 * art cannot silently drift apart.
 *
 * PATHS
 * -----
 * `url` values are RELATIVE and carry no leading slash, e.g.
 * `assets/sprites/birds.png`. GitHub Pages serves the project from a sub-path,
 * so a leading slash would resolve against the domain root and 404. The loader
 * must prepend the site base; use `assetUrl()` below, which reads Vite's
 * `import.meta.env.BASE_URL`.
 *
 * FRAME INDEXING
 * --------------
 * Phaser numbers spritesheet frames left-to-right then top-to-bottom, so
 * `frameIndex = row * columns + column`. Every multi-row sheet here uses one
 * row per logical variant (character, species, aura type), which makes a row
 * offset the only thing a caller needs to know.
 */

export interface SheetDef {
  /** Texture key the sheet is registered under. */
  key: string;
  /** Path relative to the site base. Never starts with '/'. */
  url: string;
  frameWidth: number;
  frameHeight: number;
  /** Frames per row. */
  columns: number;
  /** Rows; one per logical variant. */
  rows: number;
  /** Total frames, i.e. columns * rows. */
  frames: number;
  /** What a row means, when the sheet has more than one. */
  rowMeaning?: string;
}

export interface ImageDef {
  key: string;
  url: string;
  width: number;
  height: number;
  /** True when the image is designed to repeat horizontally without a seam. */
  tileableX?: boolean;
}

export interface AnimDef {
  key: string;
  /** Texture key of the sheet the frames come from. */
  sheet: string;
  frames: number[];
  frameRate: number;
  /** -1 loops forever, 0 plays once. */
  repeat: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPRITES = 'assets/sprites/';

/** Prefix a manifest url with the site base. Safe to call more than once only
 *  on relative paths, which is all this manifest contains. */
export function assetUrl(url: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

function sheet(
  key: string,
  file: string,
  frameWidth: number,
  frameHeight: number,
  columns: number,
  rows: number,
  rowMeaning?: string,
): SheetDef {
  return {
    key,
    url: SPRITES + file,
    frameWidth,
    frameHeight,
    columns,
    rows,
    frames: columns * rows,
    ...(rowMeaning ? { rowMeaning } : {}),
  };
}

// --- rows ------------------------------------------------------------------

/** Row order of characters.png and projectiles.png. Matches CHARACTER_ORDER. */
export const CHARACTER_ROWS = ['lindon', 'yerin', 'mercy', 'ziel', 'eithan'] as const;
export type CharacterRow = (typeof CHARACTER_ROWS)[number];

/** Row order of aura.png. Matches AuraVariant in src/data/objects.ts. */
export const AURA_ROWS = ['charge', 'shield', 'lowgrav'] as const;
export type AuraRow = (typeof AURA_ROWS)[number];

/** Row order of feathers.png. Matches FEATHER_COLORS plus a white variant. */
export const FEATHER_ROWS = ['bone', 'gold', 'steel', 'white'] as const;

/** Common beast species. Silhouettes are deliberately distinct at 6-14px. */
export const BIRD_SPECIES = ['soarer', 'flitter', 'darter', 'crane'] as const;
export const BIRD_SPECIES_COUNT = BIRD_SPECIES.length;

/**
 * Column order of characters.png. Column 7 is the character's signature pose:
 * Lindon's Blackflame flare, Yerin's drawn sword, Mercy's drawn bow, Ziel's
 * raised hammer, Eithan transformed into Ozriel with the scythe.
 */
export const CHARACTER_POSES = [
  'idle0',
  'idle1',
  'charge0',
  'charge1',
  'launch',
  'react0',
  'react1',
  'signature',
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

/**
 * Frame order of ground_tiles.png.
 *  0-4  surface: grass cap over dirt, opaque top to bottom
 *  5-7  body: opaque fill for rows below the surface
 *  8-11 overlay: mostly transparent, scattered on top of a surface tile
 * The renderer picks these with a position-stable hash so scatter does not
 * shimmer as the camera moves.
 */
export const GROUND_TILES = [
  'grass_a',
  'grass_b',
  'grass_c',
  'grass_worn',
  'grass_edge',
  'dirt_a',
  'dirt_stone',
  'dirt_root',
  'rock_cluster',
  'tuft_a',
  'tuft_b',
  'flowers',
] as const;

/** Index ranges into GROUND_TILES, by role. */
export const GROUND_TILE_ROLES = {
  surface: [0, 1, 2, 3, 4],
  body: [5, 6, 7],
  overlay: [8, 9, 10, 11],
} as const;

// --- sheets ----------------------------------------------------------------

export const SPRITESHEETS: SheetDef[] = [
  sheet('characters', 'characters.png', 24, 28, 8, 5, 'character, in CHARACTER_ROWS order'),
  sheet('projectiles', 'projectiles.png', 16, 16, 4, 5, 'character, in CHARACTER_ROWS order'),
  sheet('projectiles_surge', 'projectiles_surge.png', 24, 24, 4, 1),
  sheet('birds', 'birds.png', 32, 24, 6, 4, 'species, in BIRD_SPECIES order'),
  sheet('bird_golden', 'bird_golden.png', 40, 32, 6, 1),
  sheet('bird_armored', 'bird_armored.png', 36, 28, 6, 1),
  sheet('feathers', 'feathers.png', 8, 8, 6, 4, 'tint, in FEATHER_ROWS order'),
  sheet('pad', 'pad.png', 48, 24, 8, 1),
  sheet('tmc', 'tmc.png', 32, 24, 6, 1),
  sheet('aura', 'aura.png', 32, 24, 6, 3, 'variant, in AURA_ROWS order'),
  sheet('storm', 'storm.png', 64, 40, 8, 1),
  sheet('spike', 'spike.png', 64, 40, 4, 1, 'four static cluster variants, not an animation'),
  sheet('orb', 'orb.png', 16, 16, 6, 1),
  sheet('cloudship', 'cloudship.png', 192, 96, 4, 1),
  sheet('ground_tiles', 'ground_tiles.png', 16, 16, 12, 1, 'see GROUND_TILES'),
  sheet('clouds', 'clouds.png', 64, 24, 6, 1, 'six shapes, not an animation'),
];

export const IMAGES: ImageDef[] = [
  { key: 'mountains', url: SPRITES + 'mountains.png', width: 256, height: 96, tileableX: true },
  { key: 'ui', url: SPRITES + 'ui.png', width: 128, height: 64 },
];

// --- anchors ---------------------------------------------------------------

/**
 * Sprites whose art is aligned to a world feature rather than to their own
 * centre. Ground-anchored sheets put their contact line on the LAST row of the
 * frame, so drawing them with origin (0.5, 1) at the ground Y is correct.
 */
export const GROUND_ANCHORED = ['pad', 'spike'] as const;

/** Frame row of cloudship.png that the deck surface sits on; the character
 *  sprite's feet belong here. */
export const CLOUDSHIP_DECK_Y = 44;

// --- animations ------------------------------------------------------------

/**
 * Frame rates are chosen against the object's implied mass, not for uniformity:
 * the stubby flitter and the plated beast share a 6-frame cycle but read as
 * completely different creatures largely because one beats at 14fps and the
 * other at 7.
 */
export const FRAME_RATES = {
  characterIdle: 3,
  characterCharge: 8,
  characterReact: 6,
  birdFly: 10,
  goldenFly: 12,
  armorFly: 7,
  projectile: 12,
  projectileSurge: 16,
  pad: 10,
  tmc: 6,
  aura: 8,
  storm: 8,
  orb: 8,
  cloudship: 4,
} as const;

function rowFrames(columns: number, row: number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(row * columns + i);
  return out;
}

function buildAnims(): AnimDef[] {
  const out: AnimDef[] = [];

  CHARACTER_ROWS.forEach((name, row) => {
    out.push({
      key: `char_idle_${name}`,
      sheet: 'characters',
      frames: rowFrames(8, row, 0, 1),
      frameRate: FRAME_RATES.characterIdle,
      repeat: -1,
    });
    out.push({
      key: `char_charge_${name}`,
      sheet: 'characters',
      frames: rowFrames(8, row, 2, 3),
      frameRate: FRAME_RATES.characterCharge,
      repeat: -1,
    });
    out.push({
      key: `char_launch_${name}`,
      sheet: 'characters',
      frames: rowFrames(8, row, 4, 4),
      frameRate: FRAME_RATES.characterCharge,
      repeat: 0,
    });
    out.push({
      key: `char_react_${name}`,
      sheet: 'characters',
      frames: rowFrames(8, row, 5, 6),
      frameRate: FRAME_RATES.characterReact,
      repeat: 0,
    });
    out.push({
      key: `char_signature_${name}`,
      sheet: 'characters',
      frames: rowFrames(8, row, 7, 7),
      frameRate: FRAME_RATES.characterReact,
      repeat: 0,
    });
    out.push({
      key: `proj_${name}`,
      sheet: 'projectiles',
      frames: rowFrames(4, row, 0, 3),
      frameRate: FRAME_RATES.projectile,
      repeat: -1,
    });
  });

  BIRD_SPECIES.forEach((_, row) => {
    out.push({
      key: `bird_fly_${row}`,
      sheet: 'birds',
      frames: rowFrames(6, row, 0, 5),
      frameRate: FRAME_RATES.birdFly,
      repeat: -1,
    });
  });

  AURA_ROWS.forEach((variant, row) => {
    out.push({
      key: `aura_${variant}`,
      sheet: 'aura',
      frames: rowFrames(6, row, 0, 5),
      frameRate: FRAME_RATES.aura,
      repeat: -1,
    });
  });

  out.push(
    { key: 'proj_surge', sheet: 'projectiles_surge', frames: [0, 1, 2, 3], frameRate: FRAME_RATES.projectileSurge, repeat: -1 },
    { key: 'golden_fly', sheet: 'bird_golden', frames: [0, 1, 2, 3, 4, 5], frameRate: FRAME_RATES.goldenFly, repeat: -1 },
    { key: 'armor_fly', sheet: 'bird_armored', frames: [0, 1, 2, 3, 4, 5], frameRate: FRAME_RATES.armorFly, repeat: -1 },
    { key: 'pad_idle', sheet: 'pad', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: FRAME_RATES.pad, repeat: -1 },
    { key: 'tmc_idle', sheet: 'tmc', frames: [0, 1, 2, 3, 4, 5], frameRate: FRAME_RATES.tmc, repeat: -1 },
    { key: 'storm_idle', sheet: 'storm', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: FRAME_RATES.storm, repeat: -1 },
    { key: 'orb_idle', sheet: 'orb', frames: [0, 1, 2, 3, 4, 5], frameRate: FRAME_RATES.orb, repeat: -1 },
    { key: 'cloudship_idle', sheet: 'cloudship', frames: [0, 1, 2, 3], frameRate: FRAME_RATES.cloudship, repeat: -1 },
  );

  return out;
}

export const ANIMS: AnimDef[] = buildAnims();

// --- ui sub-rects ----------------------------------------------------------

/**
 * Sub-rects inside ui.png. Mirrors UI_FRAMES in tools/art/gen_ui.py exactly.
 *
 * The nine `panel_*` tiles form a 9-slice: corners are fixed, `panel_t` /
 * `panel_b` stretch horizontally, `panel_l` / `panel_r` stretch vertically and
 * `panel_c` stretches both ways. Every tile is 8x8, so a panel's minimum size
 * is 24x24 and its border inset is 8px on each side.
 */
export const UI_FRAMES: Record<string, Rect> = {
  panel_tl: { x: 0, y: 0, w: 8, h: 8 },
  panel_t: { x: 8, y: 0, w: 8, h: 8 },
  panel_tr: { x: 16, y: 0, w: 8, h: 8 },
  panel_l: { x: 0, y: 8, w: 8, h: 8 },
  panel_c: { x: 8, y: 8, w: 8, h: 8 },
  panel_r: { x: 16, y: 8, w: 8, h: 8 },
  panel_bl: { x: 0, y: 16, w: 8, h: 8 },
  panel_b: { x: 8, y: 16, w: 8, h: 8 },
  panel_br: { x: 16, y: 16, w: 8, h: 8 },

  pip_full: { x: 24, y: 0, w: 8, h: 8 },
  pip_empty: { x: 32, y: 0, w: 8, h: 8 },
  icon_lock: { x: 40, y: 0, w: 8, h: 8 },
  icon_star: { x: 48, y: 0, w: 8, h: 8 },

  icon_distance: { x: 24, y: 8, w: 8, h: 8 },
  icon_score: { x: 32, y: 8, w: 8, h: 8 },
  icon_speed: { x: 40, y: 8, w: 8, h: 8 },
  icon_altitude: { x: 48, y: 8, w: 8, h: 8 },

  slider_knob: { x: 24, y: 16, w: 8, h: 8 },
  slider_track: { x: 32, y: 16, w: 32, h: 8 },

  button_normal: { x: 64, y: 0, w: 48, h: 16 },
  button_hover: { x: 64, y: 16, w: 48, h: 16 },
  button_pressed: { x: 64, y: 32, w: 48, h: 16 },
};

/** Border inset of the 9-slice panel, in pixels, on every side. */
export const PANEL_SLICE = 8;

// --- lookups ---------------------------------------------------------------

const SHEET_BY_KEY = new Map(SPRITESHEETS.map((s) => [s.key, s]));

export function getSheet(key: string): SheetDef | undefined {
  return SHEET_BY_KEY.get(key);
}

/** Frame index of a cell, given the sheet's row-major layout. */
export function frameIndex(sheetKey: string, column: number, row = 0): number {
  const def = SHEET_BY_KEY.get(sheetKey);
  if (!def) throw new Error(`unknown sheet: ${sheetKey}`);
  return row * def.columns + column;
}

/** Frame index of a character pose, for the still frames the HUD draws. */
export function characterFrame(character: CharacterRow, pose: CharacterPose): number {
  return CHARACTER_ROWS.indexOf(character) * 8 + CHARACTER_POSES.indexOf(pose);
}
