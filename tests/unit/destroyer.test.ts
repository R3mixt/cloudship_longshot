import { describe, expect, it } from 'vitest';
import { ABILITY, CHARACTERS, CHARACTER_ORDER, type CharacterId } from '@/data/characters';
import { PHYSICS } from '@/data/physics';
import { Simulation } from '@/sim/simulation';
import type { SimEvent } from '@/sim/types';
import { SaveManager, emptyRecord } from '@/core/save';
import { countEvents, eventKinds, memoryStorage } from './helpers';

const E = ABILITY.eithan;

/** An Eithan run launched at full power, ready to be stepped. */
function launchEithan(seed = 99): Simulation {
  const sim = new Simulation({ character: 'eithan', seed });
  sim.setCharging(true);
  sim.state.meter = 1;
  sim.launch();
  return sim;
}

function stepFor(sim: Simulation, seconds: number, dt = 1 / 60): SimEvent[] {
  const events: SimEvent[] = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    const live = sim.step(dt);
    events.push(...sim.state.events);
    if (!live) break;
  }
  return events;
}

describe('the Destroyer sequence', () => {
  it('does not trigger before the delay', () => {
    const sim = launchEithan();
    const dt = 1 / 240;
    const steps = Math.floor(E.triggerDelay / dt);
    const events = stepFor(sim, steps * dt, dt);
    expect(sim.state.flightTime).toBeLessThanOrEqual(E.triggerDelay);
    expect(sim.state.destroyer).toBe(false);
    expect(sim.state.groundGone).toBe(false);
    expect(eventKinds(events)).not.toContain('destroyerStart');
  });

  it('triggers as soon as the delay elapses', () => {
    const sim = launchEithan();
    const dt = 1 / 240;
    let elapsed = 0;
    let triggeredAt: number | null = null;
    for (let i = 0; i < 2000 && triggeredAt === null; i++) {
      sim.step(dt);
      elapsed += dt;
      if (sim.state.destroyer) triggeredAt = elapsed;
    }
    expect(triggeredAt).not.toBeNull();
    expect(Math.abs((triggeredAt as number) - E.triggerDelay)).toBeLessThanOrEqual(dt);
  });

  it('announces itself with the exact wording', () => {
    const sim = launchEithan();
    const events = stepFor(sim, E.triggerDelay + 0.1);
    const start = events.find((e) => e.kind === 'destroyerStart');
    expect(start).toBeDefined();
    expect(start?.text).toEqual(['THE DESTROYER HAS COME']);
  });

  it('blasts the ground away and zeroes the charge pool', () => {
    const sim = launchEithan();
    expect(sim.state.charges).toBe(PHYSICS.charges);
    stepFor(sim, E.triggerDelay + 0.1);
    expect(sim.state.destroyer).toBe(true);
    expect(sim.state.groundGone).toBe(true);
    expect(sim.state.charges).toBe(0);
  });

  it('never lets Eithan cast an ability', () => {
    const sim = launchEithan();
    sim.useAbility();
    expect(sim.state.charges).toBe(PHYSICS.charges);
    expect(sim.state.stats.abilitiesUsed).toBe(0);
    expect(eventKinds(sim.state.events)).not.toContain('ability');
    expect(eventKinds(sim.state.events)).not.toContain('abilityFail');

    stepFor(sim, E.triggerDelay + 0.5);
    sim.useAbility();
    expect(sim.state.charges).toBe(0);
    expect(sim.state.stats.abilitiesUsed).toBe(0);
    expect(eventKinds(sim.state.events)).not.toContain('abilityFail');
  });

  it('detonates the field at the authored rate', () => {
    const sim = launchEithan();
    stepFor(sim, E.triggerDelay + 0.05);
    expect(sim.state.destroyer).toBe(true);

    const window = 2.0;
    const events = stepFor(sim, window);
    const booms = countEvents(events, 'destroyerBoom');
    const expected = window / E.boomInterval;
    // A tick with an empty field still consumes its slot, so the observed rate
    // sits just under the nominal ten per second.
    expect(booms).toBeGreaterThan(expected * 0.75);
    expect(booms).toBeLessThanOrEqual(expected + 2);
    expect(1 / E.boomInterval).toBe(10);
  });

  it('keeps detonating for the whole sequence because birds keep spawning', () => {
    const sim = launchEithan();
    const events = stepFor(sim, E.triggerDelay + E.duration + 1);
    const booms = countEvents(events, 'destroyerBoom');
    const expected = E.duration / E.boomInterval;
    expect(booms).toBeGreaterThan(expected * 0.75);
  });

  it('scores every beast it erases', () => {
    const sim = launchEithan();
    const events = stepFor(sim, E.triggerDelay + E.duration + 1);
    const beastBooms = events.filter(
      (e) =>
        e.kind === 'destroyerBoom' &&
        (e.variant === 'bird' || e.variant === 'rare' || e.variant === 'armor'),
    ).length;
    expect(beastBooms).toBeGreaterThan(0);
    expect(sim.state.stats.beasts).toBeGreaterThanOrEqual(beastBooms);
    expect(sim.state.stats.score).toBeGreaterThanOrEqual(beastBooms * E.boomScore);
  });

  it('ends the run after the sequence duration', () => {
    const sim = launchEithan();
    stepFor(sim, E.triggerDelay + E.duration + 2);
    expect(sim.isFinished).toBe(true);
    // The sequence clock starts on the frame the transformation fires, so the
    // total lands within a frame or two of delay + duration.
    expect(
      Math.abs(sim.state.stats.flightTime - (E.triggerDelay + E.duration)),
    ).toBeLessThan(0.1);
  });

  it('ends by dissipating, never by dying', () => {
    const sim = launchEithan();
    stepFor(sim, E.triggerDelay + E.duration + 2);
    expect(sim.state.stats.deathCause).toBeNull();
  });

  it('accumulates absurd distance', () => {
    const sim = launchEithan();
    stepFor(sim, E.triggerDelay + 1);
    const early = sim.state.stats.distance;
    stepFor(sim, 4);
    expect(sim.state.stats.distance).toBeGreaterThan(early);
    stepFor(sim, E.duration);
    expect(sim.isFinished).toBe(true);
    expect(sim.state.stats.distance).toBeGreaterThan(4000);
    expect(Number.isFinite(sim.state.stats.distance)).toBe(true);
  });

  it('accelerates hard but respects its absolute speed ceiling', () => {
    const sim = launchEithan();
    stepFor(sim, E.triggerDelay + E.duration + 1);
    expect(sim.state.stats.topSpeed).toBeGreaterThan(3000);
    expect(sim.state.stats.topSpeed).toBeLessThanOrEqual(E.maxSpeed);
  });

  it('levels the scythe out as it goes', () => {
    const sim = launchEithan();
    stepFor(sim, E.triggerDelay + 0.05);
    const early = Math.abs(sim.state.vy);
    stepFor(sim, 2);
    expect(Math.abs(sim.state.vy)).toBeLessThan(early);
  });

  it('is reproducible from a seed', () => {
    const summary = (seed: number) => {
      const sim = launchEithan(seed);
      const events = stepFor(sim, E.triggerDelay + E.duration + 1);
      return {
        booms: countEvents(events, 'destroyerBoom'),
        distance: sim.state.stats.distance,
        score: sim.state.stats.score,
      };
    };
    expect(summary(4321)).toEqual(summary(4321));
  });
});

describe('Eithan records policy', () => {
  it('marks Eithan as a character whose runs never write records', () => {
    expect(CHARACTERS.eithan.noRecords).toBe(true);
    for (const id of CHARACTER_ORDER.filter((c) => c !== 'eithan')) {
      expect(CHARACTERS[id].noRecords).toBeUndefined();
    }
  });

  it('leaves the simulation with no record-writing side effects of its own', () => {
    const sim = launchEithan();
    const events = stepFor(sim, E.triggerDelay + E.duration + 2);
    // The sim is pure: persistence is the host's job, so it must not claim a
    // record on its own.
    expect(eventKinds(events)).not.toContain('newRecord');
  });

  /**
   * The rule lives in the host, so this is the host's contract expressed as a
   * test: a caller that honours `noRecords` leaves Eithan's slate blank no
   * matter how far the run went.
   */
  it('leaves Eithan out of the save when the host honours the flag', () => {
    const save = new SaveManager(memoryStorage());
    const commitIfAllowed = (id: CharacterId, distance: number) => {
      if (CHARACTERS[id].noRecords) return;
      save.commitRun(id, { distance, score: distance * 2, beasts: 3, peakAltitude: 40, topSpeed: 900 });
    };

    commitIfAllowed('eithan', 250000);
    commitIfAllowed('lindon', 1200);

    expect(save.record('eithan')).toEqual(emptyRecord());
    expect(save.record('lindon').distance).toBe(1200);
    expect(save.get().totalRuns).toBe(1);
  });

  it('does not let an Eithan run contribute to the unlock', () => {
    const save = new SaveManager(memoryStorage());
    save.update((data) => {
      data.records.eithan = { ...emptyRecord(), distance: 500000 };
    });
    expect(save.isEithanUnlocked()).toBe(false);
  });
});
