import { describe, expect, it } from 'vitest';
import { ABILITY, CHARACTERS } from '@/data/characters';
import { OBJECTS, type ObjectKind } from '@/data/objects';
import { PHYSICS, applyDrag } from '@/data/physics';
import { beastPoints } from '@/data/scoring';
import { WORLD } from '@/data/world';
import { Simulation } from '@/sim/simulation';
import type { SimEvent, WorldObject } from '@/sim/types';
import {
  CONTACT_Y,
  FINE_DT,
  countEvents,
  eventKinds,
  firstEvent,
  flightSim,
  groundSim,
  plant,
  plantUnderfoot,
  stepCollect,
  timeUntil,
} from './helpers';

/** The ability states the matrix is defined over. */
type AbilityState = 'none' | 'consume' | 'seeker' | 'glide' | 'shield' | 'lowgrav';

const GROUND_KINDS: ObjectKind[] = ['pad', 'spike'];

/** Radii and extents large enough that a single fine step resolves the contact. */
const PLANT_SHAPE: Partial<Record<ObjectKind, Partial<WorldObject>>> = {
  bird: { r: 9 },
  rare: { r: 11 },
  armor: { r: 13 },
  orb: { r: 6 },
  aura: { r: 12, variant: 'charge' },
  tmc: { r: 10 },
  storm: { rx: 40, ry: 20 },
};

interface ContactOptions {
  vx?: number;
  vy?: number;
  /** Overrides for the planted object. */
  object?: Partial<WorldObject>;
  /** Forces an ability's driving speed after the cast, to isolate speed rules. */
  abilitySpeed?: number;
}

interface ContactResult {
  sim: Simulation;
  object: WorldObject;
  events: SimEvent[];
  kinds: string[];
}

function characterFor(ability: AbilityState): 'lindon' | 'yerin' | 'mercy' | 'ziel' {
  if (ability === 'consume') return 'lindon';
  if (ability === 'seeker') return 'yerin';
  if (ability === 'glide') return 'mercy';
  return 'ziel';
}

/**
 * Builds a one-object world, puts the requested ability state on the
 * projectile, and steps until the contact resolves. This is the engine behind
 * the whole interaction matrix.
 */
function contact(ability: AbilityState, kind: ObjectKind, options: ContactOptions = {}): ContactResult {
  const onGround = GROUND_KINDS.includes(kind);
  const make = onGround ? groundSim : flightSim;
  const sim = make({
    character: characterFor(ability),
    x: 2000,
    y: onGround ? WORLD.groundY - 2 : 200,
    vx: options.vx ?? 500,
    vy: options.vy ?? 0,
  });

  switch (ability) {
    case 'consume':
    case 'seeker':
    case 'glide':
      sim.useAbility();
      break;
    case 'shield':
      sim.state.shieldTime = OBJECTS.aura.shieldDuration;
      break;
    case 'lowgrav':
      sim.state.lowGravTime = OBJECTS.aura.lowGravDuration;
      break;
    default:
      break;
  }

  if (options.abilitySpeed !== undefined) {
    if (sim.state.surge) sim.state.surge.speed = options.abilitySpeed;
    if (sim.state.seek) sim.state.seek.speed = options.abilitySpeed;
  }

  const object = onGround
    ? plantUnderfoot(sim, kind as 'pad' | 'spike')
    : plant(sim, kind, { ...PLANT_SHAPE[kind], ...options.object });
  if (!onGround && options.object) Object.assign(object, options.object);

  const events = stepCollect(sim, FINE_DT, 1);
  return { sim, object, events, kinds: eventKinds(events) };
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

interface MatrixCase {
  ability: AbilityState;
  kind: ObjectKind;
  /** Event that must be emitted on contact. */
  expect: string;
  /** Events that must NOT be emitted. */
  forbid?: string[];
  /** Whether the run survives the contact. */
  survives: boolean;
  options?: ContactOptions;
}

const ABILITY_STATES: AbilityState[] = ['none', 'consume', 'seeker', 'glide', 'shield', 'lowgrav'];

/** Every ability state treats these the same way: pure pickups. */
const NEUTRAL: Array<[ObjectKind, string]> = [
  ['bird', 'bird'],
  ['rare', 'rare'],
  ['orb', 'orb'],
  ['aura', 'aura'],
  ['tmc', 'tmc'],
];

const MATRIX: MatrixCase[] = [
  ...ABILITY_STATES.flatMap((ability) =>
    NEUTRAL.map(([kind, event]) => ({ ability, kind, expect: event, survives: true })),
  ),

  // Storms: drag unless the technique is burning, shielded or hunting.
  { ability: 'none', kind: 'storm', expect: 'stormEnter', survives: true },
  { ability: 'glide', kind: 'storm', expect: 'stormEnter', survives: true },
  { ability: 'lowgrav', kind: 'storm', expect: 'stormEnter', survives: true },
  { ability: 'consume', kind: 'storm', expect: 'stormDestroy', forbid: ['stormEnter'], survives: true },
  { ability: 'shield', kind: 'storm', expect: 'stormDestroy', forbid: ['stormEnter'], survives: true },
  { ability: 'seeker', kind: 'storm', expect: 'stormCut', forbid: ['stormEnter', 'stormDestroy'], survives: true },

  // Armour above the shatter speed.
  ...ABILITY_STATES.map((ability) => ({
    ability,
    kind: 'armor' as ObjectKind,
    expect: 'armorShatter',
    forbid: ['armorDeflect'],
    survives: true,
    options: { vx: 500 },
  })),

  // Armour below the shatter speed: only an ability gets through.
  { ability: 'none', kind: 'armor', expect: 'armorDeflect', survives: true, options: { vx: 200 } },
  { ability: 'glide', kind: 'armor', expect: 'armorDeflect', survives: true, options: { vx: 200 } },
  { ability: 'lowgrav', kind: 'armor', expect: 'armorDeflect', survives: true, options: { vx: 200 } },
  {
    ability: 'consume',
    kind: 'armor',
    expect: 'armorShatter',
    forbid: ['armorDeflect'],
    survives: true,
    options: { vx: 200, abilitySpeed: 200 },
  },
  {
    ability: 'seeker',
    kind: 'armor',
    expect: 'armorShatter',
    forbid: ['armorDeflect'],
    survives: true,
    options: { vx: 200, abilitySpeed: 200 },
  },
  { ability: 'shield', kind: 'armor', expect: 'armorShatter', forbid: ['armorDeflect'], survives: true, options: { vx: 200 } },

  // Ground formation pads trampoline everyone.
  ...ABILITY_STATES.map((ability) => ({
    ability,
    kind: 'pad' as ObjectKind,
    expect: 'pad',
    survives: true,
    options: { vy: 200 },
  })),

  // Rock spires: lethal unless burning, hunting or shielded.
  { ability: 'none', kind: 'spike', expect: 'spikeDeath', survives: false, options: { vy: 200 } },
  { ability: 'glide', kind: 'spike', expect: 'spikeDeath', survives: false, options: { vy: 200 } },
  { ability: 'lowgrav', kind: 'spike', expect: 'spikeDeath', survives: false, options: { vy: 200 } },
  { ability: 'consume', kind: 'spike', expect: 'spikeDestroy', forbid: ['spikeDeath'], survives: true },
  { ability: 'seeker', kind: 'spike', expect: 'spikeDestroy', forbid: ['spikeDeath'], survives: true },
  { ability: 'shield', kind: 'spike', expect: 'spikeDestroy', forbid: ['spikeDeath'], survives: true, options: { vy: 200 } },
];

describe('the ability x object interaction matrix', () => {
  it.each(MATRIX)(
    '$ability against a $kind emits $expect',
    ({ ability, kind, expect: expected, forbid, survives, options }) => {
      const result = contact(ability, kind, options);
      expect(result.kinds).toContain(expected);
      for (const banned of forbid ?? []) expect(result.kinds).not.toContain(banned);
      expect(result.sim.state.phase === 'fly').toBe(survives);
    },
  );

  it('covers every ability state against every object kind', () => {
    const kinds: ObjectKind[] = [
      'bird',
      'rare',
      'armor',
      'orb',
      'aura',
      'tmc',
      'storm',
      'pad',
      'spike',
    ];
    for (const ability of ABILITY_STATES) {
      for (const kind of kinds) {
        const covered = MATRIX.some((c) => c.ability === ability && c.kind === kind);
        expect(covered, `${ability} x ${kind} is untested`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Lindon — CONSUME
// ---------------------------------------------------------------------------

describe('Lindon — CONSUME', () => {
  it('locks the heading the technique had at the moment of the cast', () => {
    const sim = flightSim({ character: 'lindon', vx: 300, vy: -400 });
    sim.useAbility();
    const speed = Math.hypot(300, -400);
    expect(sim.state.surge?.dirX).toBeCloseTo(300 / speed, 10);
    expect(sim.state.surge?.dirY).toBeCloseTo(-400 / speed, 10);

    const heading = Math.atan2(sim.state.vy, sim.state.vx);
    stepCollect(sim, 1 / 60, 60);
    expect(Math.atan2(sim.state.vy, sim.state.vx)).toBeCloseTo(heading, 6);
  });

  it('accelerates at the authored rate for the whole burn', () => {
    const sim = flightSim({ character: 'lindon', vx: 500, vy: 0 });
    sim.useAbility();
    const start = sim.state.surge?.speed ?? 0;
    expect(start).toBe(500);
    const dt = 1 / 60;
    stepCollect(sim, dt, 60);
    expect(sim.state.surge?.speed).toBeCloseTo(start + ABILITY.lindon.accel * (60 * dt), 4);
    expect(ABILITY.lindon.accel).toBeGreaterThan(0);
  });

  it('raises a stalled technique to the authored floor speed', () => {
    const sim = flightSim({ character: 'lindon', vx: 350, vy: 0 });
    sim.useAbility();
    expect(sim.state.surge?.speed).toBe(350);

    const slow = flightSim({ character: 'lindon', vx: 100, vy: 0 });
    slow.useAbility();
    expect(slow.state.surge?.speed).toBe(ABILITY.lindon.minSpeed);
  });

  it('picks a forward-and-up heading when the technique is nearly stationary', () => {
    const sim = flightSim({ character: 'lindon', vx: 10, vy: 5 });
    sim.useAbility();
    expect(sim.state.surge?.dirX).toBe(ABILITY.lindon.stallDirX);
    expect(sim.state.surge?.dirY).toBe(ABILITY.lindon.stallDirY);
    expect(sim.state.surge?.speed).toBe(Math.max(ABILITY.lindon.stallSpeed, ABILITY.lindon.minSpeed));
  });

  it('turns gravity and drag off for the duration', () => {
    const sim = flightSim({ character: 'lindon', vx: 600, vy: 0 });
    sim.useAbility();
    const dt = 1 / 60;
    stepCollect(sim, dt, 1);
    // Pure burn: velocity is exactly heading * speed, with no gravity term in vy
    // and no drag loss in vx.
    expect(sim.state.vy).toBe(0);
    expect(sim.state.vx).toBeCloseTo(600 + ABILITY.lindon.accel * dt, 6);
    expect(sim.state.vx).toBeGreaterThan(applyDrag(600, dt));
  });

  it('doubles the collision radius', () => {
    expect(PHYSICS.hitPadSurge).toBe(PHYSICS.hitPadNormal * 2);

    const gap = OBJECTS.bird.minRadius + PHYSICS.hitPadNormal + 2.5;
    const plain = flightSim({ character: 'lindon', vx: 0, vy: 0 });
    plant(plain, 'bird', { r: OBJECTS.bird.minRadius, y: plain.state.y + gap });
    expect(eventKinds(stepCollect(plain, FINE_DT, 1))).not.toContain('bird');

    const burning = flightSim({ character: 'lindon', vx: 0, vy: 0 });
    burning.useAbility();
    plant(burning, 'bird', { r: OBJECTS.bird.minRadius, y: burning.state.y + gap });
    expect(eventKinds(stepCollect(burning, FINE_DT, 1))).toContain('bird');
  });

  it('incinerates a rock spire for points instead of dying on it', () => {
    const result = contact('consume', 'spike');
    const event = firstEvent(result.events, 'spikeDestroy');
    expect(event?.points).toBe(OBJECTS.spike.destroyPoints);
    expect(event?.variant).toBe('burn');
    expect(result.sim.state.phase).toBe('fly');
    expect(result.sim.state.surge).not.toBeNull();
    expect(result.sim.state.stats.deathCause).toBeNull();
  });

  it('burns a storm away for points', () => {
    const result = contact('consume', 'storm');
    const event = firstEvent(result.events, 'stormDestroy');
    expect(event?.points).toBe(OBJECTS.storm.destroyPoints);
    expect(event?.variant).toBe('burn');
    expect(result.object.alive).toBe(false);
  });

  it('shatters armour regardless of speed', () => {
    const result = contact('consume', 'armor', { vx: 200, abilitySpeed: 200 });
    expect(result.sim.speed).toBeLessThan(OBJECTS.armor.shatterSpeed);
    const event = firstEvent(result.events, 'armorShatter');
    expect(event?.points).toBe(OBJECTS.armor.shatterPoints);
    expect(event?.variant).toBe('burn');
  });

  it('skips off the ground without ending the burn', () => {
    const sim = groundSim({ character: 'lindon', vx: 500, vy: 120 });
    sim.useAbility();
    const events = stepCollect(sim, FINE_DT, 1);
    const bounce = firstEvent(events, 'bounce');
    expect(bounce?.variant).toBe('skip');
    expect(sim.state.surge).not.toBeNull();
    expect(sim.state.surge!.dirY).toBeLessThan(0);
    expect(sim.state.y).toBeCloseTo(CONTACT_Y, 10);
  });

  it('deflects off a ground pad without ending the burn', () => {
    const result = contact('consume', 'pad', { vy: 200 });
    expect(result.kinds).toContain('pad');
    expect(result.sim.state.surge).not.toBeNull();
    expect(result.sim.state.surge!.dirY).toBeLessThan(0);
  });

  it('feeds a bird boost into the burn speed rather than the velocity', () => {
    const sim = flightSim({ character: 'lindon', vx: 500, vy: 0 });
    sim.useAbility();
    const before = sim.state.surge!.speed;
    plant(sim, 'bird', { r: OBJECTS.bird.referenceRadius });
    stepCollect(sim, FINE_DT, 1);

    const speedAtImpact = before + ABILITY.lindon.accel * FINE_DT;
    const boost =
      (OBJECTS.bird.boostBase + Math.min(speedAtImpact, OBJECTS.bird.boostSpeedCap) * OBJECTS.bird.boostSpeedScale) *
      (OBJECTS.bird.sizeFloor + OBJECTS.bird.sizeSpan);
    expect(sim.state.surge!.speed).toBeCloseTo(
      speedAtImpact + boost * ABILITY.lindon.boostAbsorb,
      6,
    );
    // The velocity itself was never touched directly; it is still heading x speed.
    expect(sim.state.vx).toBeCloseTo(speedAtImpact, 6);
  });

  it('feeds a Thousand-Mile Cloud into the burn speed as a fixed bonus', () => {
    const sim = flightSim({ character: 'lindon', vx: 500, vy: 0 });
    sim.useAbility();
    const before = sim.state.surge!.speed;
    plant(sim, 'tmc', { r: 10 });
    stepCollect(sim, FINE_DT, 1);
    expect(sim.state.surge!.speed).toBeCloseTo(
      before + ABILITY.lindon.accel * FINE_DT + ABILITY.lindon.tmcBonus,
      6,
    );
  });

  it('feeds a golden beast into the burn speed as a fixed bonus', () => {
    const sim = flightSim({ character: 'lindon', vx: 500, vy: 0 });
    sim.useAbility();
    const before = sim.state.surge!.speed;
    plant(sim, 'rare', { r: 11 });
    stepCollect(sim, FINE_DT, 1);
    expect(sim.state.surge!.speed).toBeCloseTo(
      before + ABILITY.lindon.accel * FINE_DT + ABILITY.lindon.rareBonus,
      6,
    );
  });

  it('ends after exactly its authored duration', () => {
    const sim = flightSim({ character: 'lindon', vx: 500, vy: 0, y: 50 });
    sim.useAbility();
    const dt = 1 / 240;
    const elapsed = timeUntil(sim, (s) => s.state.surge === null, dt, 4000);
    expect(elapsed).not.toBeNull();
    expect(Math.abs((elapsed as number) - ABILITY.lindon.duration)).toBeLessThanOrEqual(dt);
  });

  it('hands the technique back to gravity when the burn ends', () => {
    const sim = flightSim({ character: 'lindon', vx: 500, vy: 0, y: 50 });
    sim.useAbility();
    stepCollect(sim, 1 / 240, 800);
    expect(sim.state.surge).toBeNull();
    const before = sim.state.vy;
    sim.step(1 / 60);
    expect(sim.state.vy).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// Yerin — SWORD SEEKER
// ---------------------------------------------------------------------------

describe('Yerin — SWORD SEEKER', () => {
  it('is castable with nothing on screen and levels out flat and fast', () => {
    const sim = flightSim({ character: 'yerin', vx: 100, vy: 500 });
    sim.useAbility();
    expect(sim.state.seek).not.toBeNull();
    expect(sim.state.vy).toBe(0);
    expect(sim.state.vx).toBe(ABILITY.yerin.minSpeed);
    // The spec floor for the dart; the balance pass may raise it but never lower it.
    expect(ABILITY.yerin.minSpeed).toBeGreaterThanOrEqual(650);

    stepCollect(sim, 1 / 60, 30);
    expect(sim.state.vy).toBe(0);
    expect(sim.state.vx).toBe(ABILITY.yerin.minSpeed);
  });

  it('keeps a faster technique at its own speed', () => {
    const sim = flightSim({ character: 'yerin', vx: 900, vy: 0 });
    sim.useAbility();
    expect(sim.state.vx).toBeCloseTo(900, 10);
  });

  it('never targets an object behind the projectile', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    const behind = plant(sim, 'bird', { x: sim.state.x - 120, r: 12 });
    const ahead = plant(sim, 'bird', { x: sim.state.x + 200, r: 12 });

    const events = stepCollect(sim, 1 / 60, 1);
    const lock = firstEvent(events, 'seekerLock');
    expect(lock).toBeDefined();
    expect(lock!.x).toBeCloseTo(ahead.x, 6);
    expect(sim.state.seek?.lockedId).toBe(ahead.id);
    expect(sim.state.seek?.lockedId).not.toBe(behind.id);
  });

  it('prefers the nearest eligible beast ahead', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    const far = plant(sim, 'bird', { x: sim.state.x + 300, r: 10 });
    const near = plant(sim, 'bird', { x: sim.state.x + 90, r: 10 });
    stepCollect(sim, 1 / 60, 1);
    expect(sim.state.seek?.lockedId).toBe(near.id);
    expect(sim.state.seek?.lockedId).not.toBe(far.id);
  });

  it('ignores prey outside the lock range', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    plant(sim, 'bird', { x: sim.state.x + ABILITY.yerin.lockRange + 200, r: 10 });
    const events = stepCollect(sim, 1 / 60, 1);
    expect(eventKinds(events)).not.toContain('seekerLock');
    expect(sim.state.seek?.lockedId).toBeNull();
  });

  it('drops the lock when the prey dies', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    const prey = plant(sim, 'bird', { x: sim.state.x + 300, r: 10 });
    stepCollect(sim, 1 / 60, 1);
    expect(sim.state.seek?.lockedId).toBe(prey.id);

    prey.alive = false;
    stepCollect(sim, 1 / 60, 1);
    expect(sim.state.seek?.lockedId).toBeNull();
    expect(sim.state.vy).toBe(0);
  });

  it('drops the lock when the prey slips behind', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    const prey = plant(sim, 'bird', { x: sim.state.x + 300, r: 10 });
    stepCollect(sim, 1 / 60, 1);
    expect(sim.state.seek?.lockedId).toBe(prey.id);

    prey.x = sim.state.x - 200;
    stepCollect(sim, 1 / 60, 1);
    expect(sim.state.seek?.lockedId).toBeNull();
  });

  it('drives in for a centre strike on the locked prey', () => {
    const sim = flightSim({ character: 'yerin', x: 2000, y: 200, vx: 400, vy: 0 });
    sim.useAbility();
    plant(sim, 'bird', { x: sim.state.x + 260, y: sim.state.y - 140, r: 10 });
    const events = stepCollect(sim, 1 / 60, 120);
    expect(eventKinds(events)).toContain('seekerLock');
    expect(eventKinds(events)).toContain('bird');
  });

  it.each([
    ['a bird', 'bird' as ObjectKind, 'bird'],
    ['a golden beast', 'rare' as ObjectKind, 'rare'],
    ['an armoured beast', 'armor' as ObjectKind, 'armorShatter'],
  ])('%s strike ends the hunt — one prey per cast', (_label, kind, event) => {
    const result = contact('seeker', kind);
    expect(result.kinds).toContain(event);
    expect(result.sim.state.seek).toBeNull();
  });

  it('leaves a second beast untouched after the one prey is taken', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    const first = plant(sim, 'bird', { x: sim.state.x + 60, r: 10 });
    const second = plant(sim, 'bird', { x: sim.state.x + 400, y: sim.state.y - 300, r: 10 });
    stepCollect(sim, 1 / 60, 20);
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(true);
    expect(sim.state.seek).toBeNull();
  });

  it('carries the accumulated hunt speed into the projectile on the strike', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0 });
    sim.useAbility();
    const huntSpeed = sim.state.seek!.speed;
    plant(sim, 'bird', { r: OBJECTS.bird.referenceRadius });
    stepCollect(sim, FINE_DT, 1);

    expect(sim.state.seek).toBeNull();
    // The strike folds the prey's boost into the hunt and then hands the whole
    // speed back to the projectile, so a hit is never a net loss.
    expect(sim.state.vx).toBeGreaterThan(huntSpeed);
    expect(sim.state.vy).toBeLessThanOrEqual(-ABILITY.yerin.strikeExitLift);
  });

  it('shatters armour regardless of speed while hunting', () => {
    const result = contact('seeker', 'armor', { vx: 200, abilitySpeed: 200 });
    expect(result.sim.state.stats.topSpeed).toBeLessThan(OBJECTS.armor.shatterSpeed);
    const event = firstEvent(result.events, 'armorShatter');
    expect(event?.variant).toBe('cut');
    expect(event?.points).toBe(OBJECTS.armor.shatterPoints);
  });

  it('cuts through a storm with zero drag applied', () => {
    const sim = flightSim({ character: 'yerin', vx: 800, vy: 0 });
    sim.useAbility();
    const speed = sim.state.vx;
    plant(sim, 'storm', { rx: 46, ry: 24 });
    const events = stepCollect(sim, 1 / 60, 3);
    expect(eventKinds(events)).toContain('stormCut');
    expect(eventKinds(events)).not.toContain('stormEnter');
    expect(sim.state.vx).toBe(speed);
    expect(sim.state.vy).toBe(0);
  });

  it('announces a cut storm only once', () => {
    const sim = flightSim({ character: 'yerin', vx: 200, vy: 0 });
    sim.useAbility();
    plant(sim, 'storm', { rx: 46, ry: 24 });
    const events = stepCollect(sim, 1 / 240, 20);
    expect(countEvents(events, 'stormCut')).toBe(1);
  });

  it('slices a ground spire for points instead of dying on it', () => {
    const result = contact('seeker', 'spike');
    const event = firstEvent(result.events, 'spikeDestroy');
    expect(event?.points).toBe(OBJECTS.spike.destroyPoints);
    expect(event?.variant).toBe('cut');
    expect(result.sim.state.phase).toBe('fly');
  });

  it('expires after its authored duration', () => {
    const sim = flightSim({ character: 'yerin', vx: 400, vy: 0, y: 50 });
    sim.useAbility();
    const dt = 1 / 240;
    const elapsed = timeUntil(sim, (s) => s.state.seek === null, dt, 4000);
    expect(elapsed).not.toBeNull();
    expect(Math.abs((elapsed as number) - ABILITY.yerin.duration)).toBeLessThanOrEqual(dt);
  });
});

// ---------------------------------------------------------------------------
// Mercy — SHADOW STRINGS
// ---------------------------------------------------------------------------

describe('Mercy — SHADOW STRINGS', () => {
  it('arrests a fall', () => {
    const sim = flightSim({ character: 'mercy', vx: 300, vy: 600 });
    sim.useAbility();
    expect(sim.state.vy).toBeCloseTo(600 * ABILITY.mercy.fallArrest, 10);
    expect(sim.state.vy).toBeLessThan(600);
  });

  it('never adds downward speed to a rising shot', () => {
    for (const vy of [-600, -200, -1]) {
      const sim = flightSim({ character: 'mercy', vx: 300, vy });
      sim.useAbility();
      expect(sim.state.vy).toBe(vy);
    }
  });

  it('leaves a level shot level', () => {
    const sim = flightSim({ character: 'mercy', vx: 300, vy: 0 });
    sim.useAbility();
    expect(sim.state.vy).toBe(0);
  });

  it('applies gravity at 0.14 while gliding', () => {
    const sim = flightSim({ character: 'mercy', vx: 300, vy: 0 });
    sim.useAbility();
    const dt = 1 / 60;
    sim.step(dt);
    expect(sim.state.vy).toBeCloseTo(PHYSICS.gravity * ABILITY.mercy.gravityMultiplier * dt, 10);
    expect(ABILITY.mercy.gravityMultiplier).toBe(0.14);
  });

  it('pulls forward through reduced drag', () => {
    const sim = flightSim({ character: 'mercy', vx: 300, vy: 0 });
    sim.useAbility();
    const dt = 1 / 60;
    sim.step(dt);
    const expected = applyDrag(300 + ABILITY.mercy.forwardPull * dt, dt, ABILITY.mercy.dragMultiplier);
    expect(sim.state.vx).toBeCloseTo(expected, 10);
    expect(ABILITY.mercy.forwardPull).toBeGreaterThan(0);
    expect(ABILITY.mercy.dragMultiplier).toBeLessThan(1);
  });

  it('keeps a glide aloft far longer than an unassisted fall', () => {
    const glide = flightSim({ character: 'mercy', vx: 300, vy: 0, y: 100 });
    glide.useAbility();
    stepCollect(glide, 1 / 60, 150);

    const plain = flightSim({ character: 'mercy', vx: 300, vy: 0, y: 100 });
    stepCollect(plain, 1 / 60, 150);

    expect(glide.state.y).toBeLessThan(plain.state.y);
    expect(glide.state.x).toBeGreaterThan(plain.state.x);
  });

  it('expires after its authored duration', () => {
    const sim = flightSim({ character: 'mercy', vx: 300, vy: 0, y: 50 });
    sim.useAbility();
    const dt = 1 / 240;
    const elapsed = timeUntil(sim, (s) => s.state.glideTime <= 0, dt, 4000);
    expect(elapsed).not.toBeNull();
    expect(Math.abs((elapsed as number) - ABILITY.mercy.duration)).toBeLessThanOrEqual(dt);
  });

  it('does not make the technique immune to anything', () => {
    const spike = contact('glide', 'spike', { vy: 200 });
    expect(spike.kinds).toContain('spikeDeath');
    const storm = contact('glide', 'storm');
    expect(storm.kinds).toContain('stormEnter');
  });
});

// ---------------------------------------------------------------------------
// Ziel — CONJURE FORMATION
// ---------------------------------------------------------------------------

describe('Ziel — CONJURE FORMATION', () => {
  it('slams the technique upward in proportion to the incoming fall speed', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 500 });
    sim.useAbility();
    expect(sim.state.vy).toBeCloseTo(-500 * ABILITY.ziel.bounceMultiplier, 10);
  });

  it('enforces its launch floor for a slow or rising technique', () => {
    const belowFloor = ABILITY.ziel.bounceFloor / ABILITY.ziel.bounceMultiplier;
    for (const vy of [0, belowFloor * 0.5, -belowFloor * 0.9]) {
      const sim = flightSim({ character: 'ziel', vx: 400, vy });
      sim.useAbility();
      expect(sim.state.vy).toBe(-ABILITY.ziel.bounceFloor);
    }
  });

  it('adds its authored forward kick', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 300 });
    sim.useAbility();
    expect(sim.state.vx).toBeCloseTo(400 + ABILITY.ziel.forwardKick, 10);
    expect(ABILITY.ziel.forwardKick).toBeGreaterThan(0);
  });

  it('scales the forward kick for a very fast technique', () => {
    const sim = flightSim({ character: 'ziel', vx: 2000, vy: 300 });
    sim.useAbility();
    expect(sim.state.vx).toBeCloseTo(2000 * ABILITY.ziel.forwardMultiplier, 10);
  });

  it('is strictly stronger than a ground pad at every incoming speed', () => {
    for (const vy of [0, 100, 200, 400, 800, 1600]) {
      const conjured = -Math.max(vy * ABILITY.ziel.bounceMultiplier, ABILITY.ziel.bounceFloor);
      const ground = -Math.max(vy * OBJECTS.pad.bounceMultiplier, OBJECTS.pad.bounceFloor);
      expect(conjured).toBeLessThan(ground);
    }
    expect(ABILITY.ziel.bounceMultiplier).toBeGreaterThan(OBJECTS.pad.bounceMultiplier);
    expect(ABILITY.ziel.bounceFloor).toBeGreaterThan(OBJECTS.pad.bounceFloor);
    expect(ABILITY.ziel.forwardKick).toBeGreaterThan(OBJECTS.pad.forwardKick);
  });

  it('out-launches a real ground pad taking the same fall', () => {
    const vy = 260;
    const conjure = flightSim({ character: 'ziel', vx: 400, vy });
    conjure.useAbility();

    const padSim = groundSim({ character: 'ziel', vx: 400, vy });
    plantUnderfoot(padSim, 'pad', { w: OBJECTS.pad.maxWidth });
    const events = stepCollect(padSim, FINE_DT, 1);
    expect(eventKinds(events)).toContain('pad');

    expect(conjure.state.vy).toBeLessThan(padSim.state.vy);
    expect(conjure.state.vx).toBeGreaterThan(padSim.state.vx);
  });

  it('is castable instantly at launch', () => {
    const sim = new Simulation({ character: 'ziel', seed: 5 });
    sim.setCharging(true);
    sim.state.meter = 0.8;
    sim.launch();
    expect(sim.state.phase).toBe('fly');
    sim.useAbility();
    expect(sim.state.vy).toBeLessThanOrEqual(-ABILITY.ziel.bounceFloor);
    expect(sim.state.charges).toBe(PHYSICS.charges - 1);
  });

  it('is castable at any altitude, including on the ground line', () => {
    for (const y of [-4000, 0, 200, WORLD.groundY - 5]) {
      const sim = flightSim({ character: 'ziel', vx: 400, vy: 300, y });
      sim.useAbility();
      expect(sim.state.vy).toBeLessThan(0);
      expect(sim.state.charges).toBe(PHYSICS.charges - 1);
    }
  });

  it('is instant — it leaves no lingering ability state', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 300 });
    sim.useAbility();
    expect(sim.state.surge).toBeNull();
    expect(sim.state.seek).toBeNull();
    expect(sim.state.glideTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// No ability active
// ---------------------------------------------------------------------------

describe('with no ability active', () => {
  /** Velocity the projectile carries into the contact, after gravity and drag. */
  function atImpact(vx0: number, vy0: number, dt = FINE_DT) {
    const vy = vy0 + PHYSICS.gravity * dt;
    const vx = applyDrag(vx0, dt);
    return { vx, vy, speed: Math.hypot(vx, vy) };
  }

  function birdBoost(speed: number, radius: number): number {
    const b = OBJECTS.bird;
    return (
      (b.boostBase + Math.min(speed, b.boostSpeedCap) * b.boostSpeedScale) *
      (b.sizeFloor + (radius / b.referenceRadius) * b.sizeSpan)
    );
  }

  it('applies the bird boost formula exactly', () => {
    const vx0 = 300;
    const radius = OBJECTS.bird.referenceRadius;
    const sim = flightSim({ character: 'ziel', vx: vx0, vy: 0 });
    plant(sim, 'bird', { r: radius });
    stepCollect(sim, FINE_DT, 1);

    const impact = atImpact(vx0, 0);
    const boost = birdBoost(impact.speed, radius);
    expect(sim.state.vx).toBeCloseTo(impact.vx + boost, 6);
  });

  it('kicks the trajectory upward on a bird strike', () => {
    const vx0 = 300;
    for (const vy0 of [400, 50]) {
      const sim = flightSim({ character: 'ziel', vx: vx0, vy: vy0 });
      plant(sim, 'bird', { r: 9 });
      stepCollect(sim, FINE_DT, 1);
      const impact = atImpact(vx0, vy0);
      expect(sim.state.vy).toBeCloseTo(
        Math.min(impact.vy, impact.vy * OBJECTS.bird.vyRetain - OBJECTS.bird.vyKick),
        6,
      );
      // Always steered upward relative to the incoming fall.
      expect(sim.state.vy).toBeLessThan(impact.vy);
    }
    // A gentle descent is turned into a climb outright.
    const gentle = flightSim({ character: 'ziel', vx: vx0, vy: 50 });
    plant(gentle, 'bird', { r: 9 });
    stepCollect(gentle, FINE_DT, 1);
    expect(gentle.state.vy).toBeLessThan(0);
  });

  it('caps the boost speed term at 700 px/s', () => {
    const measure = (vx0: number) => {
      const sim = flightSim({ character: 'ziel', vx: vx0, vy: 0 });
      plant(sim, 'bird', { r: OBJECTS.bird.referenceRadius });
      stepCollect(sim, FINE_DT, 1);
      return sim.state.vx - atImpact(vx0, 0).vx;
    };
    const fast = measure(1000);
    const absurd = measure(3000);
    expect(fast).toBeCloseTo(absurd, 9);
    expect(OBJECTS.bird.boostSpeedCap).toBe(700);

    // Below the cap the boost still scales with speed.
    expect(measure(200)).toBeLessThan(fast);
  });

  it('scales the boost with bird size', () => {
    const measure = (radius: number) => {
      const sim = flightSim({ character: 'ziel', vx: 400, vy: 0 });
      plant(sim, 'bird', { r: radius });
      stepCollect(sim, FINE_DT, 1);
      return sim.state.vx - atImpact(400, 0).vx;
    };
    expect(measure(OBJECTS.bird.maxRadius)).toBeGreaterThan(measure(OBJECTS.bird.minRadius));
  });

  it('awards distance-scaled points for a bird', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 0, x: 2000 });
    const radius = 12;
    plant(sim, 'bird', { r: radius });
    const events = stepCollect(sim, FINE_DT, 1);
    const event = firstEvent(events, 'bird');
    expect(event?.points).toBe(
      beastPoints(
        OBJECTS.bird.pointsBase + radius * OBJECTS.bird.pointsPerRadius,
        sim.state.stats.distance,
      ),
    );
    expect(sim.state.stats.beasts).toBe(1);
  });

  it('gives a golden beast a fixed surge', () => {
    const vx0 = 300;
    const sim = flightSim({ character: 'ziel', vx: vx0, vy: 400 });
    plant(sim, 'rare', { r: 11 });
    stepCollect(sim, FINE_DT, 1);
    expect(sim.state.vx).toBeCloseTo(atImpact(vx0, 400).vx + OBJECTS.rare.vxBoost, 6);
    expect(sim.state.vy).toBe(OBJECTS.rare.vySet);
    expect(OBJECTS.rare.vxBoost).toBe(380);
    expect(OBJECTS.rare.vySet).toBe(-150);
  });

  it('gives the same golden beast surge no matter how fast the technique was', () => {
    const surge = (vx0: number) => {
      const sim = flightSim({ character: 'ziel', vx: vx0, vy: 0 });
      plant(sim, 'rare', { r: 11 });
      stepCollect(sim, FINE_DT, 1);
      return sim.state.vx - atImpact(vx0, 0).vx;
    };
    expect(surge(200)).toBeCloseTo(surge(2000), 6);
  });

  it('boosts and scores an aura orb', () => {
    const vx0 = 400;
    const radius = 7;
    const sim = flightSim({ character: 'ziel', vx: vx0, vy: 0 });
    plant(sim, 'orb', { r: radius });
    const events = stepCollect(sim, FINE_DT, 1);
    expect(sim.state.vx).toBeCloseTo(
      atImpact(vx0, 0).vx + OBJECTS.orb.boostBase + radius * OBJECTS.orb.boostPerRadius,
      6,
    );
    expect(firstEvent(events, 'orb')?.points).toBe(OBJECTS.orb.points);
    expect(OBJECTS.orb.points).toBe(25);
  });

  it('slings the technique forward and up off a Thousand-Mile Cloud', () => {
    const vx0 = 400;
    const radius = 10;
    const sim = flightSim({ character: 'ziel', vx: vx0, vy: 500 });
    plant(sim, 'tmc', { r: radius });
    const events = stepCollect(sim, FINE_DT, 1);
    expect(sim.state.vx).toBeCloseTo(
      atImpact(vx0, 500).vx + OBJECTS.tmc.boostBase + radius * OBJECTS.tmc.boostPerRadius,
      6,
    );
    expect(sim.state.vy).toBe(-OBJECTS.tmc.vyKick);
    expect(firstEvent(events, 'tmc')?.points).toBe(OBJECTS.tmc.points);
    const boost = OBJECTS.tmc.boostBase + radius * OBJECTS.tmc.boostPerRadius;
    expect(boost).toBeGreaterThanOrEqual(280);
    expect(boost).toBeLessThanOrEqual(360);
  });

  it('drags hard inside a storm', () => {
    const vx0 = 800;
    const vy0 = 200;
    const dt = 1 / 60;
    const sim = flightSim({ character: 'ziel', vx: vx0, vy: vy0 });
    plant(sim, 'storm', { rx: 46, ry: 24 });
    const events = stepCollect(sim, dt, 1);
    const impact = atImpact(vx0, vy0, dt);
    expect(sim.state.vx).toBeCloseTo(impact.vx * (1 - OBJECTS.storm.dragX * dt), 6);
    expect(sim.state.vy).toBeCloseTo(impact.vy * (1 - OBJECTS.storm.dragY * dt), 6);
    expect(eventKinds(events)).toContain('stormEnter');
    expect(OBJECTS.storm.dragX).toBe(2.6);
  });

  it('warns about a storm only once while inside it', () => {
    const sim = flightSim({ character: 'ziel', vx: 100, vy: 0 });
    plant(sim, 'storm', { rx: 46, ry: 24 });
    const events = stepCollect(sim, 1 / 240, 30);
    expect(countEvents(events, 'stormEnter')).toBe(1);
  });

  it('shatters armour above 430 px/s', () => {
    const sim = flightSim({ character: 'ziel', vx: 500, vy: 0 });
    plant(sim, 'armor', { r: 13 });
    const events = stepCollect(sim, FINE_DT, 1);
    expect(firstEvent(events, 'armorShatter')?.points).toBe(OBJECTS.armor.shatterPoints);
    expect(firstEvent(events, 'armorShatter')?.variant).toBe('speed');
    expect(sim.state.stats.beasts).toBe(1);
    expect(OBJECTS.armor.shatterSpeed).toBe(430);
  });

  it('is deflected hard by armour below 430 px/s', () => {
    const vx0 = 200;
    const vy0 = 100;
    const sim = flightSim({ character: 'ziel', vx: vx0, vy: vy0 });
    plant(sim, 'armor', { r: 13 });
    const events = stepCollect(sim, FINE_DT, 1);
    const impact = atImpact(vx0, vy0);
    expect(eventKinds(events)).toContain('armorDeflect');
    expect(sim.state.vx).toBeCloseTo(impact.vx * OBJECTS.armor.deflectVx, 6);
    expect(sim.state.vy).toBeCloseTo(impact.vy * OBJECTS.armor.deflectVy, 6);
    expect(sim.state.stats.beasts).toBe(0);
  });

  it('trampolines off a ground formation pad', () => {
    const vx0 = 400;
    const vy0 = 300;
    const sim = groundSim({ character: 'ziel', vx: vx0, vy: vy0 });
    plantUnderfoot(sim, 'pad');
    const events = stepCollect(sim, FINE_DT, 1);
    const impact = atImpact(vx0, vy0);
    expect(sim.state.vy).toBeCloseTo(
      -Math.max(Math.abs(impact.vy) * OBJECTS.pad.bounceMultiplier, OBJECTS.pad.bounceFloor),
      6,
    );
    expect(sim.state.vx).toBeCloseTo(
      Math.max(impact.vx * OBJECTS.pad.forwardMultiplier, impact.vx + OBJECTS.pad.forwardKick),
      6,
    );
    expect(firstEvent(events, 'pad')?.points).toBe(OBJECTS.pad.points);
  });

  it('applies the pad floor to a gentle landing', () => {
    const sim = groundSim({ character: 'ziel', vx: 400, vy: 10 });
    plantUnderfoot(sim, 'pad');
    stepCollect(sim, FINE_DT, 1);
    expect(sim.state.vy).toBeCloseTo(-OBJECTS.pad.bounceFloor, 6);
  });

  it('dies on a rock spire', () => {
    const sim = groundSim({ character: 'ziel', vx: 400, vy: 200 });
    plantUnderfoot(sim, 'spike');
    const events = stepCollect(sim, FINE_DT, 1);
    const death = firstEvent(events, 'spikeDeath');
    expect(death?.text).toEqual(['IMPALED']);
    expect(sim.state.stats.deathCause).toBe('IMPALED');
    expect(sim.state.phase).toBe('done');
  });

  it('resolves a spire before a pad on the same frame', () => {
    const sim = groundSim({ character: 'ziel', vx: 400, vy: 200 });
    plantUnderfoot(sim, 'spike');
    plantUnderfoot(sim, 'pad');
    const kinds = eventKinds(stepCollect(sim, FINE_DT, 1));
    expect(kinds).toContain('spikeDeath');
    expect(kinds).not.toContain('pad');
  });
});

// ---------------------------------------------------------------------------
// Aura clouds
// ---------------------------------------------------------------------------

describe('vital aura clouds', () => {
  function pickUp(variant: 'charge' | 'shield' | 'lowgrav', charges: number = PHYSICS.charges) {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 0 });
    sim.state.charges = charges;
    const scoreBefore = sim.state.stats.score;
    plant(sim, 'aura', { r: 12, variant });
    const events = stepCollect(sim, FINE_DT, 1);
    return { sim, events, scoreBefore };
  }

  it('refunds an ability charge from a green cloud', () => {
    const { sim } = pickUp('charge', 1);
    expect(sim.state.charges).toBe(2);
  });

  it('converts a green cloud to points at full charges instead of wasting it', () => {
    const { sim, scoreBefore, events } = pickUp('charge', PHYSICS.charges);
    expect(sim.state.charges).toBe(PHYSICS.charges);
    const gained = sim.state.stats.score - scoreBefore;
    expect(gained).toBe(OBJECTS.aura.fullChargePoints + OBJECTS.aura.points);
    expect(gained).toBeGreaterThan(0);
    expect(firstEvent(events, 'aura')?.text).toContain('MADRA FULL');
  });

  it('never overfills the charge pool', () => {
    const { sim } = pickUp('charge', PHYSICS.charges);
    expect(sim.state.charges).toBeLessThanOrEqual(PHYSICS.charges);
  });

  it('grants 2.5 s of immunity from a gold cloud', () => {
    const { sim } = pickUp('shield');
    expect(sim.state.shieldTime).toBe(OBJECTS.aura.shieldDuration);
    expect(OBJECTS.aura.shieldDuration).toBe(2.5);
  });

  it('grants 3 s of reduced gravity from a cyan cloud', () => {
    const { sim } = pickUp('lowgrav');
    expect(sim.state.lowGravTime).toBe(OBJECTS.aura.lowGravDuration);
    expect(OBJECTS.aura.lowGravDuration).toBe(3.0);
  });

  it('scores every variant', () => {
    for (const variant of ['charge', 'shield', 'lowgrav'] as const) {
      const { sim, scoreBefore } = pickUp(variant, 1);
      expect(sim.state.stats.score).toBeGreaterThan(scoreBefore);
    }
  });

  it('applies 35% gravity while LIGHT AS AIR is active', () => {
    const sim = flightSim({ character: 'ziel', vx: 300, vy: 0 });
    sim.state.lowGravTime = OBJECTS.aura.lowGravDuration;
    const dt = 1 / 60;
    sim.step(dt);
    expect(sim.state.vy).toBeCloseTo(PHYSICS.gravity * OBJECTS.aura.lowGravMultiplier * dt, 10);
  });

  it('keeps Mercy s stronger glide gravity when both are active', () => {
    const sim = flightSim({ character: 'mercy', vx: 300, vy: 0 });
    sim.useAbility();
    sim.state.lowGravTime = OBJECTS.aura.lowGravDuration;
    const dt = 1 / 60;
    sim.step(dt);
    expect(sim.state.vy).toBeCloseTo(PHYSICS.gravity * ABILITY.mercy.gravityMultiplier * dt, 10);
  });

  it('expires low gravity after its duration', () => {
    const sim = flightSim({ character: 'ziel', vx: 300, vy: 0, y: 50 });
    sim.state.lowGravTime = OBJECTS.aura.lowGravDuration;
    const dt = 1 / 240;
    const elapsed = timeUntil(sim, (s) => s.state.lowGravTime <= 0, dt, 4000);
    expect(Math.abs((elapsed as number) - OBJECTS.aura.lowGravDuration)).toBeLessThanOrEqual(dt);
  });
});

describe('AURA SHIELD immunity', () => {
  it('bounces a rock spire harmlessly instead of dying', () => {
    const result = contact('shield', 'spike', { vy: 200 });
    const event = firstEvent(result.events, 'spikeDestroy');
    expect(event?.variant).toBe('shield');
    expect(event?.points).toBe(OBJECTS.spike.destroyPoints);
    expect(result.sim.state.phase).toBe('fly');
    expect(result.sim.state.vy).toBeLessThan(0);
  });

  it('destroys a storm on contact', () => {
    const result = contact('shield', 'storm');
    expect(firstEvent(result.events, 'stormDestroy')?.variant).toBe('shield');
    expect(result.object.alive).toBe(false);
  });

  it('shatters armour at any speed', () => {
    const result = contact('shield', 'armor', { vx: 120 });
    expect(result.sim.state.stats.topSpeed).toBeLessThan(OBJECTS.armor.shatterSpeed);
    expect(firstEvent(result.events, 'armorShatter')?.variant).toBe('shield');
  });

  it('expires after 2.5 seconds and stops protecting', () => {
    const sim = flightSim({ character: 'ziel', vx: 200, vy: 0, y: -6000 });
    sim.state.shieldTime = OBJECTS.aura.shieldDuration;
    const dt = 1 / 240;
    const elapsed = timeUntil(sim, (s) => s.state.shieldTime <= 0, dt, 4000);
    expect(elapsed).not.toBeNull();
    expect(Math.abs((elapsed as number) - OBJECTS.aura.shieldDuration)).toBeLessThanOrEqual(dt);

    const lethal = groundSim({ character: 'ziel', vx: 400, vy: 200 });
    lethal.state.shieldTime = 0;
    plantUnderfoot(lethal, 'spike');
    expect(eventKinds(stepCollect(lethal, FINE_DT, 1))).toContain('spikeDeath');
  });
});

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

describe('ability charges', () => {
  it('starts every run with three', () => {
    expect(PHYSICS.charges).toBe(3);
    const sim = flightSim({ character: 'ziel' });
    expect(sim.state.charges).toBe(3);
  });

  it('decrements on every successful cast', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 200 });
    for (let i = 1; i <= PHYSICS.charges; i++) {
      sim.useAbility();
      expect(sim.state.charges).toBe(PHYSICS.charges - i);
      expect(sim.state.stats.abilitiesUsed).toBe(i);
    }
  });

  it('emits abilityFail and changes nothing once empty', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 200 });
    sim.state.charges = 0;
    const vy = sim.state.vy;
    sim.useAbility();
    expect(eventKinds(sim.state.events)).toContain('abilityFail');
    expect(sim.state.charges).toBe(0);
    expect(sim.state.stats.abilitiesUsed).toBe(0);
    expect(sim.state.vy).toBe(vy);
  });

  it('cannot be cast outside the fly phase', () => {
    const sim = flightSim({ character: 'ziel' });
    sim.state.phase = 'aim';
    sim.useAbility();
    expect(sim.state.charges).toBe(PHYSICS.charges);
    sim.state.phase = 'done';
    sim.useAbility();
    expect(sim.state.charges).toBe(PHYSICS.charges);
  });

  it('is refunded by a green aura cloud', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 200 });
    sim.useAbility();
    sim.useAbility();
    expect(sim.state.charges).toBe(1);
    plant(sim, 'aura', { r: 12, variant: 'charge' });
    stepCollect(sim, FINE_DT, 1);
    expect(sim.state.charges).toBe(2);
  });

  it('holds charges steady in debug unlimited mode', () => {
    const sim = flightSim({ character: 'ziel', vx: 400, vy: 200 });
    sim.infiniteCharges = true;
    for (let i = 0; i < 10; i++) sim.useAbility();
    expect(sim.state.charges).toBe(PHYSICS.charges);
    expect(sim.state.stats.abilitiesUsed).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Spec anchors
// ---------------------------------------------------------------------------

/**
 * Values the design pins rather than tunes. Ability timings and boost sizes are
 * deliberately absent: those belong to the balance pass and are asserted against
 * the data files by the behavioural tests above.
 */
describe('spec anchors', () => {
  it('keeps the projectile radius doubling during Consume', () => {
    expect(PHYSICS.hitPadSurge).toBe(PHYSICS.hitPadNormal * 2);
  });

  it('keeps three ability charges per run', () => {
    expect(PHYSICS.charges).toBe(3);
  });

  it('keeps the bird boost speed term capped at 700 px/s', () => {
    expect(OBJECTS.bird.boostSpeedCap).toBe(700);
  });

  it('keeps the armour shatter threshold at 430 px/s', () => {
    expect(OBJECTS.armor.shatterSpeed).toBe(430);
  });

  it('keeps the ground pad trampoline at 1.5x with a 300 floor', () => {
    expect(OBJECTS.pad.bounceMultiplier).toBe(1.5);
    expect(OBJECTS.pad.bounceFloor).toBe(300);
  });

  it('keeps a conjured formation visibly stronger than a ground pad', () => {
    expect(ABILITY.ziel.bounceMultiplier).toBeGreaterThan(OBJECTS.pad.bounceMultiplier);
    expect(ABILITY.ziel.bounceFloor).toBeGreaterThan(OBJECTS.pad.bounceFloor);
    expect(ABILITY.ziel.forwardKick).toBeGreaterThan(OBJECTS.pad.forwardKick);
  });

  it('keeps the golden beast surge fixed at +380 / -150', () => {
    expect(OBJECTS.rare.vxBoost).toBe(380);
    expect(OBJECTS.rare.vySet).toBe(-150);
  });

  it('keeps storm drag at 2.6 per second', () => {
    expect(OBJECTS.storm.dragX).toBe(2.6);
  });

  it('keeps a green cloud from ever being a dead pickup', () => {
    expect(OBJECTS.aura.fullChargePoints).toBeGreaterThan(0);
  });

  it('keeps the four ability verbs distinct', () => {
    const verbs = ['lindon', 'yerin', 'mercy', 'ziel'].map(
      (id) => CHARACTERS[id as 'lindon'].verb,
    );
    expect(new Set(verbs).size).toBe(4);
    expect(verbs).toEqual(['rocket', 'hunt', 'float', 'jump']);
  });
});
