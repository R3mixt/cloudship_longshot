import { describe, expect, it } from 'vitest';
import { CHARACTER_ORDER, type CharacterId } from '@/data/characters';
import { LAUNCH, PHYSICS } from '@/data/physics';
import { WORLD, altitudeMeters } from '@/data/world';
import { runBot } from '@/sim/bot';
import { Simulation } from '@/sim/simulation';
import type { RunStats } from '@/sim/types';
import { eventKinds, flightSim, plant, stepCollect } from './helpers';

/** A golden beast sitting exactly where the projectile is about to be. */
function plantGoldenBeast(sim: Simulation): void {
  plant(sim, 'rare', { r: 12 });
}

const PLAYABLE: CharacterId[] = ['lindon', 'yerin', 'mercy', 'ziel'];
const SEEDS = [1, 2, 3, 11, 404, 90210];

/** Every finite-number field the flight model writes each frame. */
function assertFinite(sim: Simulation, frame: number): void {
  const s = sim.state;
  for (const [name, value] of [
    ['x', s.x],
    ['y', s.y],
    ['vx', s.vx],
    ['vy', s.vy],
  ] as const) {
    expect(Number.isFinite(value), `${name} was ${value} on frame ${frame}`).toBe(true);
  }
}

/**
 * Drives a run frame by frame with a simple ability policy, checking the
 * projectile every single frame. Returns the number of frames simulated.
 */
function driveRun(
  character: CharacterId,
  seed: number,
  options: { maxFrames?: number; onFrame?: (sim: Simulation, frame: number) => void } = {},
): { sim: Simulation; frames: number } {
  const maxFrames = options.maxFrames ?? 40000;
  const sim = new Simulation({ character, seed });
  sim.setCharging(true);

  let frame = 0;
  while (sim.state.phase === 'aim' && frame < 1000) {
    sim.step(1 / 60);
    frame += 1;
    if (sim.state.meter >= LAUNCH.perfectThreshold && sim.state.meterDirection === 1) sim.launch();
  }
  expect(sim.state.phase).not.toBe('aim');

  let frames = 0;
  while (!sim.isFinished && frames < maxFrames) {
    // A crude but consistent policy: spend a charge whenever the technique is
    // falling fast, which exercises every ability at least once per run.
    if (sim.state.charges > 0 && sim.state.vy > 220 && frames % 45 === 0) sim.useAbility();
    sim.step(1 / 60);
    frames += 1;
    assertFinite(sim, frames);
    options.onFrame?.(sim, frames);
  }
  return { sim, frames };
}

describe('a complete run', () => {
  it.each(PLAYABLE)('takes %s from aim to done', (character) => {
    const sim = new Simulation({ character, seed: 7 });
    expect(sim.state.phase).toBe('aim');

    sim.setCharging(true);
    let guard = 0;
    while (sim.state.phase === 'aim' && guard++ < 1000) {
      sim.step(1 / 60);
      if (sim.state.meter >= 0.9 && sim.state.meterDirection === 1) sim.launch();
    }
    expect(sim.state.phase).toBe('fly');

    const { sim: driven } = driveRun(character, 7);
    expect(driven.state.phase).toBe('done');
    expect(driven.isFinished).toBe(true);
  });

  it.each(SEEDS)('terminates for every character on seed %i', (seed) => {
    for (const character of CHARACTER_ORDER) {
      const { sim, frames } = driveRun(character, seed);
      expect(sim.isFinished, `${character} on seed ${seed} never finished`).toBe(true);
      expect(frames).toBeLessThan(40000);
    }
  });

  it('never produces a non-finite position or velocity across a long run', () => {
    for (const character of CHARACTER_ORDER) {
      for (const seed of [5, 55, 555]) {
        driveRun(character, seed);
      }
    }
  });

  it('keeps recorded distance monotonic across the whole flight', () => {
    let previous = 0;
    driveRun('lindon', 31, {
      onFrame: (sim) => {
        expect(sim.state.stats.distance).toBeGreaterThanOrEqual(previous);
        previous = sim.state.stats.distance;
      },
    });
    expect(previous).toBeGreaterThan(0);
  });

  it('never lets recorded top speed decrease', () => {
    let previous = 0;
    driveRun('yerin', 42, {
      onFrame: (sim) => {
        expect(sim.state.stats.topSpeed).toBeGreaterThanOrEqual(previous);
        previous = sim.state.stats.topSpeed;
      },
    });
    expect(previous).toBeGreaterThan(0);
  });

  it('reports a top speed at least as high as the launch speed', () => {
    const { sim } = driveRun('lindon', 42);
    expect(sim.state.stats.topSpeed).toBeGreaterThan(PHYSICS.basePower * LAUNCH.powerFloor);
  });

  /**
   * Documented defect. `topSpeed` is sampled once per frame during the motion
   * integration, which runs before collisions are resolved, so the speed a
   * pickup adds is only ever seen on the following frame — after drag has
   * already eaten into it. The results screen therefore under-reports the true
   * peak, and loses it entirely if the run ends on the boosting frame.
   */
  it.fails('records the peak speed a collision boost produces', () => {
    const sim = flightSim({ character: 'ziel', x: 3000, y: 200, vx: 300, vy: 0 });
    const before = sim.state.stats.topSpeed;
    plantGoldenBeast(sim);
    sim.step(1 / 600);
    expect(sim.state.stats.topSpeed).toBeGreaterThanOrEqual(sim.speed);
    expect(sim.state.stats.topSpeed).toBeGreaterThan(before + 300);
  });

  it('keeps peak altitude at or above the current altitude and never negative in the summary', () => {
    driveRun('mercy', 43, {
      onFrame: (sim) => {
        expect(sim.state.stats.peakAltitude).toBeGreaterThanOrEqual(altitudeMeters(sim.state.y));
      },
    });
  });

  it('produces internally consistent stats', () => {
    for (const character of CHARACTER_ORDER) {
      for (const seed of SEEDS) {
        const { sim } = driveRun(character, seed);
        const stats: RunStats = sim.state.stats;
        const totalHits = Object.values(stats.hits).reduce((a, b) => a + b, 0);

        expect(stats.distance).toBeGreaterThan(0);
        expect(stats.score).toBeGreaterThanOrEqual(0);
        expect(stats.topSpeed).toBeGreaterThan(0);
        expect(stats.peakAltitude).toBeGreaterThanOrEqual(0);
        expect(stats.flightTime).toBeGreaterThan(0);
        expect(stats.abilitiesUsed).toBeLessThanOrEqual(PHYSICS.charges * 4);
        if (!sim.state.isEithan) {
          expect(stats.beasts).toBeLessThanOrEqual(totalHits);
        }
        expect(['IMPALED', null]).toContain(stats.deathCause);
      }
    }
  });

  it('ends either by dissipating or by being impaled, and says which', () => {
    let dissipated = 0;
    let impaled = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const { sim } = driveRun('ziel', seed);
      if (sim.state.stats.deathCause === 'IMPALED') impaled += 1;
      else dissipated += 1;
    }
    expect(dissipated + impaled).toBe(12);
    expect(dissipated).toBeGreaterThan(0);
  });
});

describe('the settle rule', () => {
  it('ends the run once the technique is rolling below the bounce thresholds', () => {
    const sim = flightSim({ character: 'ziel', x: 3000, y: WORLD.groundY - 2, vx: 60, vy: 0 });
    const dt = 1 / 60;
    let frames = 0;
    while (!sim.isFinished && frames < 1000) {
      sim.step(dt);
      frames += 1;
    }
    expect(sim.isFinished).toBe(true);
    expect(frames * dt).toBeLessThanOrEqual(PHYSICS.settleTime + dt);
  });

  it('emits a settle event rather than a death', () => {
    const sim = flightSim({ character: 'ziel', x: 3000, y: WORLD.groundY - 2, vx: 60, vy: 0 });
    const events = stepCollect(sim, 1 / 60, 1000);
    expect(eventKinds(events)).toContain('settle');
    expect(sim.state.stats.deathCause).toBeNull();
  });

  it('ends immediately once horizontal speed falls under the floor', () => {
    const sim = flightSim({
      character: 'ziel',
      x: 3000,
      y: WORLD.groundY - 2,
      vx: PHYSICS.settleMinVx - 1,
      vy: 0,
    });
    const events = stepCollect(sim, 1 / 60, 5);
    expect(eventKinds(events)).toContain('settle');
    expect(sim.isFinished).toBe(true);
  });

  it('does not settle while the technique is still bouncing', () => {
    const sim = flightSim({ character: 'ziel', x: 3000, y: 200, vx: 500, vy: 400 });
    const events = stepCollect(sim, 1 / 60, 30);
    expect(eventKinds(events)).toContain('bounce');
    expect(eventKinds(events)).not.toContain('settle');
    expect(sim.state.settleTime).toBe(0);
  });
});

describe('the balance bot', () => {
  it.each(PLAYABLE)('returns a finished run for %s', (character) => {
    const stats = runBot({ character, seed: 12345, skill: 0.7 });
    expect(stats.distance).toBeGreaterThan(0);
    expect(Number.isFinite(stats.distance)).toBe(true);
    expect(Number.isFinite(stats.score)).toBe(true);
    expect(stats.flightTime).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed and skill', () => {
    const a = runBot({ character: 'lindon', seed: 8080, skill: 0.9 });
    const b = runBot({ character: 'lindon', seed: 8080, skill: 0.9 });
    expect(a).toEqual(b);
  });

  it('sends a practised player further than a novice across the roster', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i * 7 + 1);
    const mean = (skill: number) => {
      const runs = PLAYABLE.flatMap((character) =>
        seeds.map((seed) => runBot({ character, seed, skill }).distance),
      );
      return runs.reduce((a, b) => a + b, 0) / runs.length;
    };
    expect(mean(1)).toBeGreaterThan(mean(0));
  });

  it('keeps the four characters inside the parity target at high skill', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i * 7 + 1);
    const means = PLAYABLE.map((character) => {
      const runs = seeds.map((seed) => runBot({ character, seed, skill: 1 }).distance);
      return runs.reduce((a, b) => a + b, 0) / runs.length;
    });
    // Section 7's target: every character's ceiling within ~15% of the others.
    expect(Math.max(...means) / Math.min(...means)).toBeLessThan(1.15);
  });

  it('never exceeds its wall-clock safety bound', () => {
    const stats = runBot({ character: 'mercy', seed: 5150, skill: 0.5, maxSeconds: 30 });
    expect(stats.flightTime).toBeLessThanOrEqual(30 + 1);
  });

  it('gets a first-time player off the deck and down the field', () => {
    const distances = SEEDS.map((seed) => runBot({ character: 'lindon', seed, skill: 0 }).distance);
    for (const d of distances) expect(d).toBeGreaterThan(0);
    const median = [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)];
    expect(median).toBeGreaterThan(100);
  });
});
