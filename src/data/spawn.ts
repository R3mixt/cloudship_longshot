import type { ObjectKind } from './objects';

/**
 * Weighted altitude bands, in metres above the ground.
 * The distribution is deliberately top-heavy: 50% of everything sits above 30 m
 * so that formation pads, Ziel launches and Mercy glides all have targets worth
 * climbing for. A flat distribution made the high sky empty and boring.
 */
export interface AltitudeBand {
  /** Cumulative probability threshold. */
  threshold: number;
  minMeters: number;
  maxMeters: number;
}

export const ALTITUDE_BANDS: AltitudeBand[] = [
  { threshold: 0.15, minMeters: 2, maxMeters: 9 },
  { threshold: 0.5, minMeters: 9, maxMeters: 30 },
  { threshold: 0.8, minMeters: 30, maxMeters: 55 },
  { threshold: 1.0, minMeters: 55, maxMeters: 90 },
];

/**
 * Per-chunk spawn roll. Entries are checked in order against a single [0,1) roll
 * and the first entry whose `threshold` exceeds the roll wins, so the values are
 * cumulative. `gateMeters` withholds a hazard until the player has travelled far
 * enough to have met the mechanic that counters it.
 */
export interface SpawnEntry {
  kind: ObjectKind;
  threshold: number;
  gateMeters: number;
  /** Minimum altitude in metres for this object's placement. */
  minAltitude: number;
}

export const SPAWN_TABLE: SpawnEntry[] = [
  { kind: 'bird', threshold: 0.3, gateMeters: 0, minAltitude: 2 },
  { kind: 'orb', threshold: 0.36, gateMeters: 0, minAltitude: 2 },
  { kind: 'storm', threshold: 0.43, gateMeters: 50, minAltitude: 9 },
  { kind: 'pad', threshold: 0.5, gateMeters: 40, minAltitude: 0 },
  { kind: 'spike', threshold: 0.58, gateMeters: 90, minAltitude: 0 },
  { kind: 'tmc', threshold: 0.64, gateMeters: 70, minAltitude: 5 },
  { kind: 'aura', threshold: 0.7, gateMeters: 30, minAltitude: 3 },
  { kind: 'armor', threshold: 0.75, gateMeters: 150, minAltitude: 3 },
  { kind: 'rare', threshold: 0.775, gateMeters: 0, minAltitude: 4 },
];

export const SPAWN = {
  /** Generate chunks until this many screen-widths ahead of the projectile. */
  lookaheadScreens: 2.4,
  /** Cull objects this far behind the projectile. */
  cullBehind: 250,

  /** Chunk spacing: base + random(spread) - min(tightenMax, distance * tightenRate). */
  spacingBase: 85,
  spacingSpread: 95,
  spacingTightenRate: 0.045,
  spacingTightenMax: 45,

  /** Bonus roll: an extra high-altitude flock. Keeps the upper sky worth visiting. */
  bonusFlockChance: 0.28,
  bonusFlockMinAlt: 45,
  bonusFlockMaxAlt: 95,
  bonusFlockOffsetMin: 20,
  bonusFlockOffsetMax: 60,

  /** Bonus roll: an extra Thousand-Mile Cloud or aura cloud up high. */
  bonusHighChance: 0.1,
  bonusHighMinAlt: 40,
  bonusHighMaxAlt: 90,
  bonusHighOffsetMin: 10,
  bonusHighOffsetMax: 70,
  /** Split between TMC and aura for the bonus high roll. */
  bonusHighTmcChance: 0.5,

  /** Destroyer sequence: birds spawn far more aggressively so there is always something to erase. */
  destroyerBirdThreshold: 0.6,

  /**
   * Difficulty escalation. Hazard rolls are widened with distance so that
   * kilometre-scale runs demand real skill, capped so it never becomes a wall.
   */
  hazardRampStartMeters: 400,
  hazardRampPerMeter: 0.00004,
  hazardRampMax: 0.08,
} as const;
