/**
 * Game feel tuning: camera, shake, particles, popups, hit-stop.
 * Intensities here are multiplied by the player's effect settings at read time.
 */
export const FEEL = {
  camera: {
    /** Fraction of the screen width the projectile sits at. */
    anchorX: 0.3,
    /** Fraction of the screen height the projectile sits at. */
    anchorY: 0.45,
    /** Exponential smoothing rate. Higher = snappier. */
    followRate: 14,
    /** Lookahead ramps in with speed, capped so the projectile never leaves frame. */
    lookaheadPerSpeed: 0.055,
    lookaheadMax: 52,
    lookaheadRate: 3.5,
    /** Camera never drops so far that the ground band eats the frame. */
    groundMargin: 34,
    /** Gentle zoom-out at extreme speed improves reaction time. */
    zoomSpeedStart: 900,
    zoomSpeedFull: 2600,
    zoomMin: 0.86,
  },

  shake: {
    /** Decay per second. */
    decay: 22,
    /** Hard ceiling so a chain of hits cannot make the screen unreadable. */
    max: 12,
  },

  hitstop: {
    /** Time scale applied while hit-stop is active. */
    timeScale: 0.1,
    max: 0.2,
  },

  trail: {
    normalLength: 18,
    surgeLength: 22,
    destroyerLength: 30,
    fadePerFrame: 0.04,
  },

  popup: {
    lifetime: 1.3,
    riseDistance: 16,
    lineSpacing: 9,
  },

  particles: {
    /** Hard cap; the pool is preallocated to this size. */
    max: 900,
    gravity: 80,
    featherGravity: 25,
    featherMaxFall: 28,
    featherDrag: 1.8,
    featherWobble: 2,
  },

  speedLines: {
    /** Speed at which wind streaks begin to appear. */
    startSpeed: 250,
    /** Speed at which they reach full opacity. */
    fullSpeed: 850,
    maxAlpha: 0.5,
    count: 14,
  },

  launch: {
    shake: 5,
    flash: 0.12,
    sparks: 14,
  },
} as const;

/** Sky gradient: [altitude in metres, r, g, b]. Interpolated linearly between stops. */
export const SKY_GRADIENT: Array<[number, number, number, number]> = [
  [0, 107, 140, 196],
  [80, 77, 111, 178],
  [200, 58, 88, 156],
  [400, 44, 69, 133],
  [700, 34, 54, 111],
  [1100, 27, 42, 94],
  [1600, 17, 26, 60],
  [2400, 9, 13, 34],
  [4000, 4, 6, 18],
];

/** Altitude in metres above which stars become visible. */
export const STARFIELD_ALTITUDE = 1000;

/** Parallax cloud strata: altitude in metres, scroll factor, tint. */
export const CLOUD_LAYERS = [
  { altitude: 150 / 9, parallax: 0.35, color: 0x7591c6, alpha: 1 },
  { altitude: 300 / 9, parallax: 0.5, color: 0x5d7ab5, alpha: 1 },
  { altitude: 520 / 9, parallax: 0.6, color: 0x4a628f, alpha: 1 },
] as const;

export const MOUNTAINS = { parallax: 0.12, spacing: 90, minHeight: 45, heightSpread: 40 } as const;
