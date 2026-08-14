import { Rng } from '@/core/rng';
import { OBJECTS, type AuraVariant } from '@/data/objects';
import { ALTITUDE_BANDS, SPAWN, SPAWN_TABLE } from '@/data/spawn';
import { WORLD, worldYForAltitude } from '@/data/world';
import type { WorldObject } from './types';

let nextId = 1;

function makeObject(partial: Partial<WorldObject> & { kind: WorldObject['kind'] }): WorldObject {
  return {
    id: nextId++,
    x: 0,
    y: 0,
    alive: true,
    r: 0,
    rx: 0,
    ry: 0,
    w: 0,
    h: 0,
    vx: 0,
    phase: 0,
    ...partial,
  };
}

/**
 * Streams world content in ahead of the projectile.
 *
 * Generation is chunked rather than continuous so that spacing can tighten with
 * distance without the density becoming a function of the player's speed — a
 * fast run and a slow run through the same stretch of world meet the same
 * number of objects.
 */
export class Spawner {
  constructor(private rng: Rng) {}

  /** Picks an altitude from the weighted bands, clamped to a minimum. */
  pickAltitudeY(minMeters: number): number {
    const roll = this.rng.next();
    let band = ALTITUDE_BANDS[ALTITUDE_BANDS.length - 1];
    for (const b of ALTITUDE_BANDS) {
      if (roll < b.threshold) {
        band = b;
        break;
      }
    }
    const meters = this.rng.range(band.minMeters, band.maxMeters);
    return worldYForAltitude(Math.max(minMeters, meters));
  }

  private auraVariant(): AuraVariant {
    const roll = this.rng.next();
    if (roll < OBJECTS.aura.chargeChance) return 'charge';
    if (roll < OBJECTS.aura.shieldChance) return 'shield';
    return 'lowgrav';
  }

  spawnFlock(out: WorldObject[], x: number, centerY: number): void {
    const b = OBJECTS.bird;
    const count = this.rng.chance(b.singleChance)
      ? 1
      : b.flockMin + this.rng.int(b.flockMax - b.flockMin + 1);
    // One shared drift so a flock moves as a unit; small per-bird jitter keeps it organic.
    const flockDrift = this.rng.range(b.driftMin, b.driftMax);
    const floorY = WORLD.groundY - b.minGroundClearance;
    for (let i = 0; i < count; i++) {
      out.push(
        makeObject({
          kind: 'bird',
          x: x + this.rng.range(-b.spreadX, b.spreadX),
          y: Math.min(floorY, centerY + this.rng.range(-b.spreadY, b.spreadY)),
          r: this.rng.range(b.minRadius, b.maxRadius),
          vx: flockDrift + this.rng.range(-b.driftJitter, b.driftJitter),
          phase: this.rng.range(0, Math.PI * 2),
          species: this.rng.int(4),
        }),
      );
    }
  }

  private spawnKind(out: WorldObject[], kind: string, x: number, minAltitude: number): void {
    const R = this.rng;
    switch (kind) {
      case 'bird':
        this.spawnFlock(out, x, this.pickAltitudeY(minAltitude));
        return;
      case 'orb':
        out.push(
          makeObject({
            kind: 'orb',
            x,
            y: this.pickAltitudeY(minAltitude),
            r: R.range(OBJECTS.orb.minRadius, OBJECTS.orb.maxRadius),
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      case 'storm': {
        const s = OBJECTS.storm;
        out.push(
          makeObject({
            kind: 'storm',
            x,
            // Storms never sit low enough to be unavoidable on a flat trajectory.
            y: Math.min(worldYForAltitude(s.minAltitude), this.pickAltitudeY(minAltitude)),
            rx: R.range(s.minRadiusX, s.maxRadiusX),
            ry: R.range(s.minRadiusY, s.maxRadiusY),
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      }
      case 'pad':
        out.push(
          makeObject({
            kind: 'pad',
            x,
            y: WORLD.groundY,
            w: R.range(OBJECTS.pad.minWidth, OBJECTS.pad.maxWidth),
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      case 'spike':
        out.push(
          makeObject({
            kind: 'spike',
            x,
            y: WORLD.groundY,
            w: R.range(OBJECTS.spike.minWidth, OBJECTS.spike.maxWidth),
            h: R.range(OBJECTS.spike.minHeight, OBJECTS.spike.maxHeight),
            species: R.int(4),
          }),
        );
        return;
      case 'tmc':
        out.push(
          makeObject({
            kind: 'tmc',
            x,
            y: this.pickAltitudeY(minAltitude),
            r: R.range(OBJECTS.tmc.minRadius, OBJECTS.tmc.maxRadius),
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      case 'aura':
        out.push(
          makeObject({
            kind: 'aura',
            variant: this.auraVariant(),
            x,
            y: this.pickAltitudeY(minAltitude),
            r: R.range(OBJECTS.aura.minRadius, OBJECTS.aura.maxRadius),
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      case 'armor':
        out.push(
          makeObject({
            kind: 'armor',
            x,
            y: this.pickAltitudeY(minAltitude),
            r: R.range(OBJECTS.armor.minRadius, OBJECTS.armor.maxRadius),
            vx: OBJECTS.armor.drift,
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      case 'rare':
        out.push(
          makeObject({
            kind: 'rare',
            x,
            y: this.pickAltitudeY(minAltitude),
            r: R.range(OBJECTS.rare.minRadius, OBJECTS.rare.maxRadius),
            vx: R.range(OBJECTS.rare.driftMin, OBJECTS.rare.driftMax),
            phase: R.range(0, Math.PI * 2),
          }),
        );
        return;
      default:
        return;
    }
  }

  /**
   * Fills the world ahead of `projectileX`, returning the new generation
   * frontier. Objects are appended to `out` in place.
   */
  generate(out: WorldObject[], projectileX: number, generatedToX: number, destroyer: boolean): number {
    const R = this.rng;
    const frontier = projectileX + WORLD.viewWidth * SPAWN.lookaheadScreens;
    let genX = generatedToX;
    let guard = 0;

    while (genX < frontier && guard++ < 400) {
      const distanceM = (genX - WORLD.shipX) / WORLD.pxPerMeter;
      const roll = R.next();

      // Hazard density creeps up with distance so kilometre runs demand skill.
      // Expressed as a fractional widening of each hazard's slice of the table.
      const ramp =
        distanceM <= SPAWN.hazardRampStartMeters
          ? 0
          : Math.min(
              SPAWN.hazardRampMax,
              (distanceM - SPAWN.hazardRampStartMeters) * SPAWN.hazardRampPerMeter,
            );

      if (destroyer && roll < SPAWN.destroyerBirdThreshold) {
        this.spawnFlock(out, genX, this.pickAltitudeY(2));
      } else {
        // Walk the cumulative table. An entry whose gate has not opened yet
        // falls through to the next candidate rather than consuming the roll —
        // otherwise the early world is full of holes where the ungated hazards
        // would have been.
        let cumulative = 0;
        let previous = 0;
        for (const entry of SPAWN_TABLE) {
          const width = entry.threshold - previous;
          previous = entry.threshold;
          // Hazard windows widen with distance. Widening in place would push each
          // hazard into the window of the entry behind it and delete that reward
          // outright, so the whole table is rebuilt from widened slices instead.
          cumulative += isHazard(entry.kind) ? width * (1 + ramp) : width;
          if (roll >= cumulative) continue;
          if (distanceM > entry.gateMeters) {
            this.spawnKind(out, entry.kind, genX, entry.minAltitude);
            break;
          }
        }
      }

      // Bonus rolls keep the upper sky dense enough to reward climbing.
      if (R.chance(SPAWN.bonusFlockChance)) {
        this.spawnFlock(
          out,
          genX + R.range(SPAWN.bonusFlockOffsetMin, SPAWN.bonusFlockOffsetMax),
          worldYForAltitude(R.range(SPAWN.bonusFlockMinAlt, SPAWN.bonusFlockMaxAlt)),
        );
      }
      if (R.chance(SPAWN.bonusHighChance)) {
        const hy = worldYForAltitude(R.range(SPAWN.bonusHighMinAlt, SPAWN.bonusHighMaxAlt));
        const hx = genX + R.range(SPAWN.bonusHighOffsetMin, SPAWN.bonusHighOffsetMax);
        if (R.chance(SPAWN.bonusHighTmcChance)) {
          out.push(
            makeObject({
              kind: 'tmc',
              x: hx,
              y: hy,
              r: R.range(OBJECTS.tmc.minRadius, OBJECTS.tmc.maxRadius),
              phase: R.range(0, Math.PI * 2),
            }),
          );
        } else {
          out.push(
            makeObject({
              kind: 'aura',
              variant: this.auraVariant(),
              x: hx,
              y: hy,
              r: R.range(OBJECTS.aura.minRadius, OBJECTS.aura.maxRadius),
              phase: R.range(0, Math.PI * 2),
            }),
          );
        }
      }

      genX +=
        SPAWN.spacingBase +
        R.next() * SPAWN.spacingSpread -
        Math.min(SPAWN.spacingTightenMax, distanceM * SPAWN.spacingTightenRate);
    }

    return genX;
  }
}

function isHazard(kind: string): boolean {
  return kind === 'storm' || kind === 'spike' || kind === 'armor';
}

/** Resets object id allocation. Used by tests to keep ids stable across runs. */
export function resetObjectIds(): void {
  nextId = 1;
}
