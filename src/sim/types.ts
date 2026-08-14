import type { CharacterId } from '@/data/characters';
import type { AuraVariant, ObjectKind } from '@/data/objects';

export interface WorldObject {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  alive: boolean;
  /** Radius for round objects (bird, rare, armor, orb, aura, tmc). */
  r: number;
  /** Half-extents for storms. */
  rx: number;
  ry: number;
  /** Footprint for ground objects (pad, spike). */
  w: number;
  h: number;
  /** Horizontal drift for beasts. */
  vx: number;
  /** Animation phase offset so identical objects do not pulse in lockstep. */
  phase: number;
  /** Aura variant, when kind === 'aura'. */
  variant?: AuraVariant;
  /** Storm bookkeeping: has the drag warning fired / has the seeker cut it. */
  warned?: boolean;
  cut?: boolean;
  /** Bird species index, chosen at spawn for art variety. */
  species?: number;
}

export type EventKind =
  | 'launch'
  | 'perfect'
  | 'bird'
  | 'rare'
  | 'armorShatter'
  | 'armorDeflect'
  | 'orb'
  | 'aura'
  | 'tmc'
  | 'stormEnter'
  | 'stormDestroy'
  | 'stormCut'
  | 'pad'
  | 'spikeDeath'
  | 'spikeDestroy'
  | 'bounce'
  | 'settle'
  | 'ability'
  | 'abilityFail'
  | 'seekerLock'
  | 'destroyerStart'
  | 'destroyerBoom'
  | 'newRecord';

/**
 * Simulation events. The renderer and audio engine consume these; the sim itself
 * never touches Phaser, the DOM or the Web Audio API. This is what makes the
 * balance harness able to run thousands of flights headlessly.
 */
export interface SimEvent {
  kind: EventKind;
  x: number;
  y: number;
  /** Generic magnitude — boost size, radius, points, whatever the event implies. */
  magnitude: number;
  /** Points awarded, when applicable. */
  points?: number;
  /** Popup lines to display. */
  text?: string[];
  /** Aura variant / character id / death cause, depending on kind. */
  variant?: string;
}

export type RunPhase = 'aim' | 'fly' | 'done';

export interface SurgeState {
  timeLeft: number;
  dirX: number;
  dirY: number;
  speed: number;
}

export interface SeekState {
  timeLeft: number;
  lockedId: number | null;
  speed: number;
}

export interface RunStats {
  distance: number;
  score: number;
  beasts: number;
  topSpeed: number;
  peakAltitude: number;
  /** Cause of death, or null if the technique simply dissipated. */
  deathCause: string | null;
  /** Wall-clock seconds of flight. */
  flightTime: number;
  /** Per-object-kind hit tally, for balance telemetry. */
  hits: Record<string, number>;
  abilitiesUsed: number;
}

export interface SimState {
  character: CharacterId;
  phase: RunPhase;

  /** Aim phase. */
  angle: number;
  meter: number;
  meterDirection: 1 | -1;
  charging: boolean;

  /** Projectile. */
  x: number;
  y: number;
  vx: number;
  vy: number;

  /** Ability resources and states. */
  charges: number;
  surge: SurgeState | null;
  seek: SeekState | null;
  glideTime: number;
  shieldTime: number;
  lowGravTime: number;

  /** Eithan. */
  isEithan: boolean;
  destroyer: boolean;
  destroyerTime: number;
  groundGone: boolean;
  boomTimer: number;

  /** World. */
  objects: WorldObject[];
  generatedToX: number;
  flightTime: number;
  settleTime: number;

  stats: RunStats;
  /** Events produced during the most recent step. Cleared at the start of each step. */
  events: SimEvent[];
}

export interface SimOptions {
  character: CharacterId;
  /** Deterministic seed. Omit for a random run. */
  seed?: number;
}
