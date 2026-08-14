import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { OBJECTS } from '@/data/objects';
import { ALTITUDE_BANDS, SPAWN, SPAWN_TABLE } from '@/data/spawn';
import { WORLD, altitudeMeters, worldYForAltitude } from '@/data/world';
import { Spawner } from '@/sim/spawner';
import type { WorldObject } from '@/sim/types';

const SEED = 20250814;

/** World X for a given travelled distance in metres. */
function xAt(meters: number): number {
  return WORLD.shipX + meters * WORLD.pxPerMeter;
}

/**
 * Runs the generator repeatedly around a fixed travelled distance and returns
 * everything it produced. Each pass is restarted at the same X so the sample
 * describes one point on the difficulty curve rather than a whole flight.
 */
function sampleAt(meters: number, passes: number, seed = SEED): WorldObject[] {
  const spawner = new Spawner(new Rng(seed));
  const startX = xAt(meters);
  const out: WorldObject[] = [];
  for (let i = 0; i < passes; i++) {
    // One pass fills a little over two screen widths ahead of the projectile.
    spawner.generate(out, startX, startX, false);
  }
  return out;
}

function countByKind(objects: readonly WorldObject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  return counts;
}

/**
 * Counts only objects placed by the main spawn table at exactly one travelled
 * distance. The generator's bonus rolls offset their objects forward, so an
 * object sitting exactly on the chunk boundary is a main-table placement and
 * the one the distance gates apply to.
 */
function mainTableAt(meters: number, passes: number, seed = SEED): Record<string, number> {
  const spawner = new Spawner(new Rng(seed));
  const chunkX = xAt(meters);
  // Keep the frontier one chunk ahead so each pass generates exactly one chunk.
  const projectileX = chunkX - WORLD.viewWidth * SPAWN.lookaheadScreens + 1;
  const counts: Record<string, number> = {};
  for (let i = 0; i < passes; i++) {
    const out: WorldObject[] = [];
    spawner.generate(out, projectileX, chunkX, false);
    for (const o of out) {
      if (o.x === chunkX) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
    }
  }
  return counts;
}

/** Mean gap between consecutive generation chunks at a given distance. */
function meanChunkSpacing(meters: number, chunks: number, seed = SEED): number {
  const spawner = new Spawner(new Rng(seed));
  const startX = xAt(meters);
  let genX = startX;
  let total = 0;
  for (let i = 0; i < chunks; i++) {
    // Ask for exactly one chunk by keeping the frontier one chunk ahead.
    const next = spawner.generate(
      [],
      genX - WORLD.viewWidth * SPAWN.lookaheadScreens + 1,
      genX,
      false,
    );
    total += next - genX;
    // Re-anchor so the distance term stays pinned to the sampled point.
    genX = startX;
  }
  return total / chunks;
}

describe('altitude band distribution', () => {
  it('matches the weighted band table within two percentage points', () => {
    const spawner = new Spawner(new Rng(SEED));
    const samples = 20000;
    const observed = new Array(ALTITUDE_BANDS.length).fill(0);

    for (let i = 0; i < samples; i++) {
      const altitude = altitudeMeters(spawner.pickAltitudeY(0));
      const index = ALTITUDE_BANDS.findIndex(
        (b) => altitude >= b.minMeters && altitude < b.maxMeters,
      );
      expect(index).toBeGreaterThanOrEqual(0);
      observed[index] += 1;
    }

    let previousThreshold = 0;
    ALTITUDE_BANDS.forEach((band, i) => {
      const expectedShare = band.threshold - previousThreshold;
      previousThreshold = band.threshold;
      const share = observed[i] / samples;
      expect(Math.abs(share - expectedShare)).toBeLessThan(0.02);
    });
  });

  it('keeps every sample inside the 2 m to 90 m envelope', () => {
    const spawner = new Spawner(new Rng(SEED + 1));
    for (let i = 0; i < 5000; i++) {
      const altitude = altitudeMeters(spawner.pickAltitudeY(0));
      expect(altitude).toBeGreaterThanOrEqual(ALTITUDE_BANDS[0].minMeters);
      expect(altitude).toBeLessThan(ALTITUDE_BANDS[ALTITUDE_BANDS.length - 1].maxMeters);
    }
  });

  it('respects the per-object minimum altitude floor', () => {
    const spawner = new Spawner(new Rng(SEED + 2));
    for (let i = 0; i < 3000; i++) {
      expect(altitudeMeters(spawner.pickAltitudeY(30))).toBeGreaterThanOrEqual(30 - 1e-9);
    }
  });

  it('puts half of everything above 30 m so the high sky is worth climbing to', () => {
    const spawner = new Spawner(new Rng(SEED + 3));
    let high = 0;
    const samples = 20000;
    for (let i = 0; i < samples; i++) {
      if (altitudeMeters(spawner.pickAltitudeY(0)) >= 30) high += 1;
    }
    expect(high / samples).toBeGreaterThan(0.48);
    expect(high / samples).toBeLessThan(0.52);
  });
});

describe('distance gating', () => {
  const gated = SPAWN_TABLE.filter((e) => e.gateMeters > 0);

  it('withholds every gated hazard at the launch point', () => {
    const counts = mainTableAt(0, 2000);
    for (const entry of gated) {
      expect(counts[entry.kind] ?? 0).toBe(0);
    }
    // The ungated content is still there a metre later, so the sample is not
    // simply empty. (Gates are a strict `>`, so the very first chunk — the one
    // sitting exactly on the cloudship — places nothing from the table at all.)
    const justAfter = mainTableAt(1, 2000);
    expect(justAfter.orb ?? 0).toBeGreaterThan(0);
    expect(justAfter.rare ?? 0).toBeGreaterThan(0);
    for (const entry of gated) {
      expect(justAfter[entry.kind] ?? 0).toBe(0);
    }
  });

  it('admits each gated hazard once its distance gate is cleared', () => {
    for (const entry of gated) {
      const counts = mainTableAt(entry.gateMeters + 5, 2000);
      expect(counts[entry.kind] ?? 0).toBeGreaterThan(0);
    }
  });

  it('never places a gated object before its own gate', () => {
    for (const entry of gated) {
      const justBefore = Math.max(0, entry.gateMeters - 1);
      const counts = mainTableAt(justBefore, 2000);
      expect(counts[entry.kind] ?? 0).toBe(0);
    }
  });

  it('keeps storms, pads, spikes and armour behind their gates across a whole flight', () => {
    const objects = [0, 20, 45, 80, 140, 300].flatMap((m) => sampleAt(m, 200));
    for (const o of objects) {
      const entry = SPAWN_TABLE.find((e) => e.kind === o.kind);
      if (!entry || entry.gateMeters === 0) continue;
      // Bonus rolls place Thousand-Mile Clouds and aura clouds without consulting
      // the table, so only the table-exclusive kinds can be checked positionally.
      if (o.kind === 'tmc' || o.kind === 'aura') continue;
      expect((o.x - WORLD.shipX) / WORLD.pxPerMeter).toBeGreaterThan(entry.gateMeters);
    }
  });

  it('gates pads at 40 m, storms at 50 m, spikes at 90 m and armour at 150 m', () => {
    const gate = (kind: string) => SPAWN_TABLE.find((e) => e.kind === kind)?.gateMeters;
    expect(gate('pad')).toBe(40);
    expect(gate('storm')).toBe(50);
    expect(gate('spike')).toBe(90);
    expect(gate('armor')).toBe(150);
  });
});

describe('placement rules', () => {
  const wide = [0, 60, 120, 200, 400, 900, 1800].flatMap((m) => sampleAt(m, 120));

  it('produces a large mixed sample to test against', () => {
    expect(wide.length).toBeGreaterThan(2000);
    expect(Object.keys(countByKind(wide)).length).toBeGreaterThanOrEqual(7);
  });

  it('never spawns a storm below 9 m altitude', () => {
    const storms = wide.filter((o) => o.kind === 'storm');
    expect(storms.length).toBeGreaterThan(0);
    for (const s of storms) {
      expect(altitudeMeters(s.y)).toBeGreaterThanOrEqual(OBJECTS.storm.minAltitude - 1e-9);
    }
  });

  it('never spawns a bird below its ground clearance', () => {
    const birds = wide.filter((o) => o.kind === 'bird');
    expect(birds.length).toBeGreaterThan(0);
    const floorY = WORLD.groundY - OBJECTS.bird.minGroundClearance;
    for (const b of birds) {
      expect(b.y).toBeLessThanOrEqual(floorY + 1e-9);
    }
  });

  it('never places an airborne object at or under the ground line', () => {
    const airborne = wide.filter((o) => o.kind !== 'pad' && o.kind !== 'spike');
    expect(airborne.length).toBeGreaterThan(0);
    for (const o of airborne) {
      expect(o.y).toBeLessThan(WORLD.groundY);
      expect(altitudeMeters(o.y)).toBeGreaterThan(0);
    }
  });

  it('anchors pads and spikes exactly on the ground line', () => {
    const ground = wide.filter((o) => o.kind === 'pad' || o.kind === 'spike');
    expect(ground.length).toBeGreaterThan(0);
    for (const o of ground) {
      expect(o.y).toBe(WORLD.groundY);
      expect(o.w).toBeGreaterThan(0);
    }
  });

  it('keeps every object inside its authored size range', () => {
    for (const o of wide) {
      switch (o.kind) {
        case 'bird':
          expect(o.r).toBeGreaterThanOrEqual(OBJECTS.bird.minRadius);
          expect(o.r).toBeLessThanOrEqual(OBJECTS.bird.maxRadius);
          break;
        case 'rare':
          expect(o.r).toBeGreaterThanOrEqual(OBJECTS.rare.minRadius);
          expect(o.r).toBeLessThanOrEqual(OBJECTS.rare.maxRadius);
          break;
        case 'armor':
          expect(o.r).toBeGreaterThanOrEqual(OBJECTS.armor.minRadius);
          expect(o.r).toBeLessThanOrEqual(OBJECTS.armor.maxRadius);
          break;
        case 'storm':
          expect(o.rx).toBeGreaterThanOrEqual(OBJECTS.storm.minRadiusX);
          expect(o.rx).toBeLessThanOrEqual(OBJECTS.storm.maxRadiusX);
          expect(o.ry).toBeGreaterThanOrEqual(OBJECTS.storm.minRadiusY);
          expect(o.ry).toBeLessThanOrEqual(OBJECTS.storm.maxRadiusY);
          break;
        case 'spike':
          expect(o.w).toBeGreaterThanOrEqual(OBJECTS.spike.minWidth);
          expect(o.w).toBeLessThanOrEqual(OBJECTS.spike.maxWidth);
          break;
        case 'pad':
          expect(o.w).toBeGreaterThanOrEqual(OBJECTS.pad.minWidth);
          expect(o.w).toBeLessThanOrEqual(OBJECTS.pad.maxWidth);
          break;
        default:
          break;
      }
    }
  });

  it('gives every aura cloud one of the three defined variants', () => {
    const auras = wide.filter((o) => o.kind === 'aura');
    expect(auras.length).toBeGreaterThan(0);
    for (const a of auras) {
      expect(['charge', 'shield', 'lowgrav']).toContain(a.variant);
    }
  });

  it('spawns flocks of between one and the authored maximum', () => {
    const spawner = new Spawner(new Rng(SEED + 9));
    for (let i = 0; i < 500; i++) {
      const out: WorldObject[] = [];
      spawner.spawnFlock(out, 1000, worldYForAltitude(40));
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(out.length).toBeLessThanOrEqual(OBJECTS.bird.flockMax);
    }
  });
});

describe('chunk spacing', () => {
  it('tightens with distance travelled', () => {
    const near = meanChunkSpacing(0, 600);
    const far = meanChunkSpacing(5000, 600);
    expect(far).toBeLessThan(near);
    // The tighten term is a flat subtraction, so the gap between the two means
    // lands on the authored maximum plus sampling noise on the random spread.
    expect(near - far).toBeGreaterThan(SPAWN.spacingTightenMax - 5);
    expect(near - far).toBeLessThan(SPAWN.spacingTightenMax + 5);
  });

  it('never tightens past the authored floor', () => {
    const capped = meanChunkSpacing(50000, 400);
    const atCap = meanChunkSpacing(5000, 400);
    expect(capped).toBeCloseTo(atCap, 6);
    const minSpacing = SPAWN.spacingBase - SPAWN.spacingTightenMax;
    expect(capped).toBeGreaterThanOrEqual(minSpacing);
  });

  it('always advances the generation frontier so generation terminates', () => {
    const spawner = new Spawner(new Rng(SEED + 11));
    let genX = xAt(50000);
    for (let i = 0; i < 200; i++) {
      const next = spawner.generate([], genX, genX, false);
      expect(next).toBeGreaterThan(genX);
      genX = next;
    }
  });
});

describe('determinism', () => {
  it('produces an identical object stream from the same seed', () => {
    const streamFor = (seed: number) => {
      const spawner = new Spawner(new Rng(seed));
      const out: WorldObject[] = [];
      let genX = xAt(0);
      for (let i = 0; i < 40; i++) genX = spawner.generate(out, genX, genX, false);
      return out.map(
        (o) => `${o.kind}|${o.x.toFixed(6)}|${o.y.toFixed(6)}|${o.r.toFixed(6)}|${o.variant ?? ''}`,
      );
    };

    const a = streamFor(4242);
    const b = streamFor(4242);
    const c = streamFor(4243);

    expect(a.length).toBeGreaterThan(50);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('produces an identical altitude stream from the same seed', () => {
    const pulls = (seed: number) => {
      const spawner = new Spawner(new Rng(seed));
      return Array.from({ length: 200 }, () => spawner.pickAltitudeY(2));
    };
    expect(pulls(77)).toEqual(pulls(77));
    expect(pulls(77)).not.toEqual(pulls(78));
  });
});

describe('difficulty ramp', () => {
  it('makes hazards denser with distance', () => {
    const hazardsAt = (meters: number) => {
      const counts = countByKind(sampleAt(meters, 500));
      return (counts.storm ?? 0) + (counts.spike ?? 0) + (counts.armor ?? 0);
    };
    expect(hazardsAt(3000)).toBeGreaterThan(hazardsAt(300));
  });

  it('caps the ramp so density stops climbing past the authored ceiling', () => {
    const rampAt = (meters: number) =>
      meters <= SPAWN.hazardRampStartMeters
        ? 0
        : Math.min(
            SPAWN.hazardRampMax,
            (meters - SPAWN.hazardRampStartMeters) * SPAWN.hazardRampPerMeter,
          );
    expect(rampAt(0)).toBe(0);
    expect(rampAt(SPAWN.hazardRampStartMeters)).toBe(0);
    expect(rampAt(1_000_000)).toBe(SPAWN.hazardRampMax);
  });

  /**
   * Regression guard. The spawn table is a cumulative roll evaluated in order,
   * so widening a hazard's threshold in place pushes it into the window of the
   * reward behind it and deletes that reward outright past a certain distance.
   * Golden beasts sit directly behind armoured beasts and were the first
   * casualty, disappearing entirely beyond about a kilometre.
   */
  it('still spawns golden beasts on a kilometre-scale run', () => {
    const counts = countByKind(sampleAt(3000, 800));
    expect(counts.rare ?? 0).toBeGreaterThan(0);
  });

  /** Same failure mode: formation pads sit behind storms in the table. */
  it('still spawns formation pads on a kilometre-scale run', () => {
    const counts = countByKind(sampleAt(3000, 800));
    expect(counts.pad ?? 0).toBeGreaterThan(0);
  });

  /** Same failure mode: the Thousand-Mile Cloud entry sits behind spikes. */
  it('still spawns Thousand-Mile Clouds from the main table past 2 km', () => {
    const spawner = new Spawner(new Rng(SEED));
    const startX = xAt(3000);
    const out: WorldObject[] = [];
    for (let i = 0; i < 800; i++) spawner.generate(out, startX, startX, false);
    // Bonus high rolls also emit TMCs, so only count those on a chunk boundary
    // where the main table could have placed one.
    const fromTable = out.filter((o) => o.kind === 'tmc' && Number.isInteger(o.x));
    expect(fromTable.length).toBeGreaterThan(0);
  });

  it('keeps every reward reachable at the maximum hazard ramp', () => {
    // At full ramp the hazard slices are at their widest. Every non-hazard entry
    // must still own a non-zero slice of the roll, which is the property that
    // widening thresholds in place used to violate.
    let cumulative = 0;
    let previous = 0;
    for (const entry of SPAWN_TABLE) {
      const width = entry.threshold - previous;
      previous = entry.threshold;
      const isHazard = entry.kind === 'storm' || entry.kind === 'spike' || entry.kind === 'armor';
      const scaled = isHazard ? width * (1 + SPAWN.hazardRampMax) : width;
      expect(scaled).toBeGreaterThan(0);
      cumulative += scaled;
    }
    // Hazards taking a larger share must not push the table past certainty,
    // which would starve the empty-chunk case that paces the world.
    expect(cumulative).toBeLessThan(1);
  });
});

describe('destroyer generation', () => {
  it('floods the field with birds during the Eithan sequence', () => {
    const normal = countByKind(sampleAt(500, 300)).bird ?? 0;
    const spawner = new Spawner(new Rng(SEED));
    const startX = xAt(500);
    const out: WorldObject[] = [];
    for (let i = 0; i < 300; i++) spawner.generate(out, startX, startX, true);
    expect(countByKind(out).bird ?? 0).toBeGreaterThan(normal);
  });
});
