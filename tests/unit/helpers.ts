import type { CharacterId } from '@/data/characters';
import type { ObjectKind } from '@/data/objects';
import { PHYSICS } from '@/data/physics';
import { WORLD } from '@/data/world';
import { Simulation } from '@/sim/simulation';
import type { SimEvent, WorldObject } from '@/sim/types';

/** World Y the projectile rests at while touching the ground. */
export const CONTACT_Y = WORLD.groundY - PHYSICS.groundContactOffset;

/**
 * Generation frontier pushed far enough ahead that `Simulation.generate()` is a
 * no-op, so an interaction test sees exactly the objects it planted.
 */
const NO_GENERATION = 1e9;

/** Small step used by the interaction matrix so a single frame resolves one contact. */
export const FINE_DT = 0.001;

export interface FlightOptions {
  character?: CharacterId;
  seed?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

/**
 * A simulation parked in the fly phase over an empty, frozen field.
 * Everything the interaction matrix needs: known position, known velocity, and
 * no world content except what the test plants.
 */
export function flightSim(options: FlightOptions = {}): Simulation {
  const sim = new Simulation({ character: options.character ?? 'lindon', seed: options.seed ?? 1 });
  const s = sim.state;
  s.phase = 'fly';
  s.objects = [];
  s.generatedToX = NO_GENERATION;
  s.x = options.x ?? 2000;
  s.y = options.y ?? 200;
  s.vx = options.vx ?? 400;
  s.vy = options.vy ?? 0;
  s.flightTime = 0;
  s.settleTime = 0;
  return sim;
}

/** Same, but resting on the ground line so the next step resolves a ground contact. */
export function groundSim(options: FlightOptions = {}): Simulation {
  return flightSim({ ...options, y: options.y ?? WORLD.groundY - 2 });
}

let plantedId = 100_000;

/** Places a single object into the frozen field and returns it. */
export function plant(
  sim: Simulation,
  kind: ObjectKind,
  overrides: Partial<WorldObject> = {},
): WorldObject {
  const o: WorldObject = {
    id: plantedId++,
    kind,
    x: sim.state.x,
    y: sim.state.y,
    alive: true,
    r: 0,
    rx: 0,
    ry: 0,
    w: 0,
    h: 0,
    vx: 0,
    phase: 0,
    ...overrides,
  };
  sim.state.objects.push(o);
  return o;
}

/** Plants a ground object straddling the projectile's current X. */
export function plantUnderfoot(
  sim: Simulation,
  kind: 'pad' | 'spike',
  overrides: Partial<WorldObject> = {},
): WorldObject {
  return plant(sim, kind, {
    x: sim.state.x - 10,
    y: WORLD.groundY,
    w: 60,
    h: 20,
    ...overrides,
  });
}

/** Advances the simulation, accumulating every event emitted along the way. */
export function stepCollect(sim: Simulation, dt: number, steps: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    const live = sim.step(dt);
    out.push(...sim.state.events);
    if (!live) break;
  }
  return out;
}

/** Advances until one of `kinds` is emitted. Returns every event seen. */
export function stepUntilEvent(
  sim: Simulation,
  kinds: readonly string[],
  dt = 1 / 60,
  maxSteps = 4000,
): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const live = sim.step(dt);
    out.push(...sim.state.events);
    if (sim.state.events.some((e) => kinds.includes(e.kind))) return out;
    if (!live) return out;
  }
  return out;
}

/**
 * Seconds of simulated time until `predicate` first holds, or null if it never
 * does. Used to pin ability durations without depending on float accumulation.
 */
export function timeUntil(
  sim: Simulation,
  predicate: (sim: Simulation) => boolean,
  dt = 1 / 60,
  maxSteps = 4000,
): number | null {
  for (let i = 1; i <= maxSteps; i++) {
    sim.step(dt);
    if (predicate(sim)) return i * dt;
  }
  return null;
}

export function eventKinds(events: readonly SimEvent[]): string[] {
  return events.map((e) => e.kind);
}

export function firstEvent(events: readonly SimEvent[], kind: string): SimEvent | undefined {
  return events.find((e) => e.kind === kind);
}

export function countEvents(events: readonly SimEvent[], kind: string): number {
  return events.filter((e) => e.kind === kind).length;
}

/** An in-memory Storage stand-in for save tests that must not touch a real one. */
export function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

/** Lets the SaveManager's coalesced (microtask) write land before assertions. */
export async function flushWrites(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
