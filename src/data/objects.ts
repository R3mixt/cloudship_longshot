export type ObjectKind =
  | 'bird'
  | 'rare'
  | 'armor'
  | 'orb'
  | 'aura'
  | 'tmc'
  | 'storm'
  | 'pad'
  | 'spike';

export type AuraVariant = 'charge' | 'shield' | 'lowgrav';

/**
 * Per-object tuning. Everything the collision resolver reads lives here so the
 * balance pass never has to touch gameplay code.
 */
export const OBJECTS = {
  bird: {
    minRadius: 6,
    maxRadius: 14,
    /** Radius that maps to a size factor of 1.0. */
    referenceRadius: 9,
    /** boost = (base + min(speed, speedCap) * speedScale) * (sizeFloor + sizeF * sizeSpan) */
    boostBase: 110,
    boostSpeedScale: 0.15,
    /** Caps the speed term so boost chains cannot run away. */
    boostSpeedCap: 700,
    sizeFloor: 0.75,
    sizeSpan: 0.5,
    /** Upward kick applied on a hit: vy = min(vy, vy * retain - kick). */
    vyRetain: 0.3,
    vyKick: 70,
    /** points = (base + radius * perRadius) * distance multiplier */
    pointsBase: 30,
    pointsPerRadius: 4,
    featherBase: 12,
    featherPerRadius: 1.6,
    hitstop: 0.07,
    shakeBase: 4,
    shakePerRadius: 0.25,
    /** Flock composition. */
    singleChance: 0.45,
    flockMin: 2,
    flockMax: 4,
    spreadX: 34,
    spreadY: 26,
    driftMin: -38,
    driftMax: -14,
    driftJitter: 5,
    /** Birds never render below this altitude, in px above the ground. */
    minGroundClearance: 14,
  },
  rare: {
    minRadius: 9,
    maxRadius: 13,
    /** Fixed surge — the golden beast is a guaranteed jackpot, not a scaling one. */
    vxBoost: 380,
    vySet: -150,
    points: 400,
    feathers: 30,
    hitstop: 0.11,
    shake: 7,
    flash: 0.1,
    driftMin: -52,
    driftMax: -30,
  },
  armor: {
    minRadius: 10,
    maxRadius: 16,
    /** Projectile speed required to shatter plating. */
    shatterSpeed: 430,
    shatterPoints: 200,
    shatterFeatherBase: 8,
    shatterFeatherPerRadius: 0.8,
    /** Deflection when too slow. */
    deflectVx: 0.35,
    deflectVy: 0.55,
    hitstop: 0.07,
    shake: 5,
    drift: -10,
  },
  orb: {
    minRadius: 4,
    maxRadius: 8,
    boostBase: 40,
    boostPerRadius: 3,
    points: 25,
  },
  aura: {
    minRadius: 9,
    maxRadius: 14,
    /** Score granted regardless of variant. */
    points: 30,
    /** Score instead of a charge when already at full charges. */
    fullChargePoints: 50,
    shieldDuration: 2.5,
    lowGravDuration: 3.0,
    /** Gravity multiplier while LIGHT AS AIR is active. */
    lowGravMultiplier: 0.35,
    hitstop: 0.04,
    /** Variant roll thresholds. */
    chargeChance: 0.4,
    shieldChance: 0.7,
  },
  tmc: {
    minRadius: 8,
    maxRadius: 13,
    boostBase: 280,
    boostPerRadius: 6,
    /** Upward component: vy = min(vy, -kick). */
    vyKick: 70,
    points: 60,
    hitstop: 0.04,
    shake: 5,
    flash: 0.08,
  },
  storm: {
    minRadiusX: 28,
    maxRadiusX: 46,
    minRadiusY: 14,
    maxRadiusY: 24,
    /** Horizontal / vertical drag per second while inside. */
    dragX: 2.6,
    dragY: 1.2,
    /** Score for destroying a storm while immune. */
    destroyPoints: 100,
    hitstop: 0.05,
    shake: 4,
    /** Storms never spawn below this altitude, metres. */
    minAltitude: 9,
  },
  pad: {
    minWidth: 32,
    maxWidth: 44,
    /** Trampoline: vy = -max(|vy| * multiplier, floor). */
    bounceMultiplier: 1.5,
    bounceFloor: 300,
    forwardMultiplier: 1.05,
    forwardKick: 40,
    points: 75,
    shake: 6,
    flash: 0.06,
    /** Horizontal collision tolerance. */
    tolerance: 5,
  },
  spike: {
    minWidth: 26,
    maxWidth: 58,
    minHeight: 12,
    maxHeight: 26,
    /** Score for destroying a spire while immune. */
    destroyPoints: 100,
    tolerance: 4,
    deathShake: 8,
    deathHitstop: 0.12,
    deathFlash: 0.15,
  },
} as const;

/** Colours for the three vital aura variants. Iconography carries the meaning; hue reinforces it. */
export const AURA_COLORS: Record<AuraVariant, string> = {
  charge: '#7dffb0',
  shield: '#ffd876',
  lowgrav: '#7de8ff',
};

export const AURA_LABELS: Record<AuraVariant, string> = {
  charge: 'MADRA RESTORED',
  shield: 'AURA SHIELD',
  lowgrav: 'LIGHT AS AIR',
};

/** Feather colours per beast type. */
export const FEATHER_COLORS = {
  bird: '#e8dcc8',
  rare: '#ffd876',
  armor: '#9a9ab4',
} as const;
