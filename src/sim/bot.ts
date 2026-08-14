import { Rng } from '@/core/rng';
import { ABILITY, type CharacterId } from '@/data/characters';
import { LAUNCH } from '@/data/physics';
import { altitudeMeters } from '@/data/world';
import { Simulation } from './simulation';
import type { RunStats } from './types';

export interface BotOptions {
  character: CharacterId;
  seed?: number;
  /**
   * 0 = a first-time player (sloppy meter, poor ability timing),
   * 1 = a practised player (near-perfect launches, well-timed saves).
   */
  skill?: number;
  /** Simulated frame time. */
  dt?: number;
  /** Safety bound on simulated flight seconds. */
  maxSeconds?: number;
}

/**
 * Scripted player used by the balance harness. It is deliberately simple: the
 * point is a consistent yardstick across characters and tuning passes, not an
 * optimal solver. Skill 0 and skill 1 bracket the real player population.
 */
export function runBot(options: BotOptions): RunStats {
  const skill = clamp01(options.skill ?? 0.7);
  const dt = options.dt ?? 1 / 60;
  const maxSeconds = options.maxSeconds ?? 600;
  const rng = new Rng(options.seed !== undefined ? options.seed ^ 0x9e3779b9 : undefined);

  const sim = new Simulation({ character: options.character, seed: options.seed });
  const s = sim.state;

  // Aim: the optimal launch angle sits a little above 45 degrees because drag
  // punishes the long high arc less than it punishes a flat one.
  const idealAngle = -0.72;
  const aimError = (1 - skill) * rng.range(-0.35, 0.35);
  s.angle = clamp(idealAngle + aimError, LAUNCH.minAngle, LAUNCH.maxAngle);

  // Release target: a skilled player lands in the gold zone almost every time.
  const releaseAt = clamp01(LAUNCH.perfectThreshold + 0.04 - (1 - skill) * rng.range(0, 0.45));

  sim.setCharging(true);
  let guard = 0;
  while (s.phase === 'aim' && guard++ < 10000) {
    sim.step(dt);
    if (s.meter >= releaseAt && s.meterDirection === 1) {
      sim.launch();
    }
  }

  let elapsed = 0;
  while (!sim.isFinished && elapsed < maxSeconds) {
    decideAbility(sim, skill, rng);
    sim.step(dt);
    elapsed += dt;
  }

  return s.stats;
}

/**
 * Decides whether to spend a charge this frame.
 *
 * Skill is modelled as *judgement*, not reaction speed. A practised player waits
 * for the moment that pays and a novice fires on impulse — usually too early,
 * while the technique is still climbing and the ability has nothing to save.
 * Modelling low skill as hesitation instead had it accidentally playing better,
 * because waiting is what the good line looks like.
 */
function decideAbility(sim: Simulation, skill: number, rng: Rng): void {
  const s = sim.state;
  if (s.phase !== 'fly' || s.charges <= 0 || s.isEithan) return;

  const altitude = altitudeMeters(s.y);
  const falling = s.vy > 0;

  // Impulse casts: frequent for a novice, vanishing for an expert.
  const impulse = (1 - skill) * 0.02;
  if (rng.chance(impulse)) {
    sim.useAbility();
    return;
  }
  // Even on the right moment, a novice hesitates some of the time.
  if (rng.next() > 0.55 + skill * 0.45) return;

  switch (s.character) {
    case 'lindon':
      // Burn while still high and moving well; a burn started near the ground
      // wastes most of its three seconds.
      if (!s.surge && altitude > 20 && sim.speed > 260) sim.useAbility();
      break;
    case 'yerin':
      // Best play combines both halves of the hunt: it is a fall recovery *and*
      // a guaranteed strike, so it is worth most when the technique is already
      // descending with prey in range. Firing it flat and early wastes the
      // levelling-out half of the cast.
      if (!s.seek && falling && (hasPreyAhead(sim) || altitude < 26)) sim.useAbility();
      break;
    case 'mercy':
      // Strings are a fall arrest: cast them on the way down, not on the way up.
      if (s.glideTime <= 0 && falling && s.vy > 190) sim.useAbility();
      break;
    case 'ziel':
      // The conjured pad is the spike save; it scales with incoming fall speed,
      // so waiting until the last moment is correct play.
      if (falling && altitude < 14) sim.useAbility();
      break;
    default:
      break;
  }
}

function hasPreyAhead(sim: Simulation): boolean {
  const s = sim.state;
  const range = ABILITY.yerin.lockRange;
  for (const o of s.objects) {
    if (!o.alive) continue;
    if (o.kind !== 'bird' && o.kind !== 'rare' && o.kind !== 'armor') continue;
    if (o.x <= s.x + ABILITY.yerin.minLeadX) continue;
    if (Math.hypot(o.x - s.x, o.y - s.y) < range) return true;
  }
  return false;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
