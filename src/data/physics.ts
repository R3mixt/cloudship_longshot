/**
 * Flight model tuning.
 *
 * Drag is deliberately split into a linear and a quadratic term. The linear term
 * lets slow techniques coast for a long time (a lobbed shot keeps creeping
 * forward), while the quadratic term acts as a *soft* speed cap: at roughly
 * 1080 px/s the quadratic loss matches the largest boosts in the game, so speed
 * spikes decay over a few seconds instead of compounding forever. There is
 * deliberately no hard clamp — chaining boosts must always feel rewarding.
 */
export const PHYSICS = {
  /** Base launch power, px/s at a full charge meter (before the meter curve). */
  basePower: 620,

  /** Linear drag coefficient, applied to horizontal velocity. */
  dragLinear: 0.045,
  /** Quadratic drag coefficient — the soft speed cap. */
  dragQuadratic: 0.00032,

  /** Downward acceleration, px/s². */
  gravity: 158,

  /** Vertical restitution on a ground bounce. */
  restitution: 0.58,
  /** Fraction of horizontal speed kept through a ground bounce. */
  bounceKeep: 0.9,

  /** Below these thresholds a ground contact stops bouncing and starts settling. */
  bounceMinVy: 50,
  bounceMinVx: 70,

  /** Ground friction while settling (per second, multiplicative). */
  settleFriction: 3.5,
  /** Seconds on the ground below the bounce threshold before the run ends. */
  settleTime: 1.5,
  /** Horizontal speed under which the run ends immediately. */
  settleMinVx: 12,

  /** Vertical offset the projectile rests at when touching the ground. */
  groundContactOffset: 4,

  /** Collision radius of the projectile, and the enlarged radius during Consume. */
  hitPadNormal: 5,
  hitPadSurge: 10,

  /** Ability charges available per run. */
  charges: 3,
} as const;

export const LAUNCH = {
  /** Charge meter oscillations, units per second (0 -> 1 -> 0). */
  meterSpeed: 1.35,
  /** Meter value at or above which a launch counts as PERFECT. */
  perfectThreshold: 0.92,
  /** Velocity multiplier granted by a perfect launch. */
  perfectMultiplier: 1.12,
  /** Launch speed = basePower * (floor + span * meter). */
  powerFloor: 0.35,
  powerSpan: 0.65,

  /** Aim angle in radians (negative is up). */
  defaultAngle: -0.58,
  minAngle: -1.35,
  maxAngle: -0.1,
  /** Radians of aim change per screen pixel of vertical drag. */
  aimSensitivity: 0.012,
} as const;

/**
 * Apply one step of horizontal drag.
 * Exposed as a pure function so the balance harness and unit tests can call it.
 */
export function applyDrag(vx: number, dt: number, multiplier = 1): number {
  const l = PHYSICS.dragLinear * multiplier;
  const q = PHYSICS.dragQuadratic * multiplier;
  return vx - (l * vx + q * vx * Math.abs(vx)) * dt;
}

/** Launch speed for a given charge meter value. */
export function launchSpeed(meter: number): number {
  return PHYSICS.basePower * (LAUNCH.powerFloor + LAUNCH.powerSpan * meter);
}

/** Equilibrium speed where drag exactly cancels a given forward acceleration. */
export function terminalSpeedFor(accel: number): number {
  // Solve q*v^2 + l*v - accel = 0 for v > 0.
  const { dragLinear: l, dragQuadratic: q } = PHYSICS;
  return (-l + Math.sqrt(l * l + 4 * q * accel)) / (2 * q);
}
