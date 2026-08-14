import { Rng } from '@/core/rng';
import { ABILITY, CHARACTERS, type CharacterId } from '@/data/characters';
import { AURA_LABELS, OBJECTS } from '@/data/objects';
import { applyDrag, LAUNCH, PHYSICS, launchSpeed } from '@/data/physics';
import { beastPoints } from '@/data/scoring';
import { SPAWN } from '@/data/spawn';
import { SHIP_Y, WORLD, altitudeMeters, distanceMeters } from '@/data/world';
import { Spawner } from './spawner';
import type { EventKind, SimEvent, SimOptions, SimState, WorldObject } from './types';

/** Maximum simulated step. Long frames are clamped rather than sub-stepped;
 *  at 20 fps the flight model is still stable and the alternative (spiralling
 *  sub-steps on a struggling device) is worse. */
export const MAX_STEP = 0.05;

function emptyStats() {
  return {
    distance: 0,
    score: 0,
    beasts: 0,
    topSpeed: 0,
    peakAltitude: 0,
    deathCause: null as string | null,
    flightTime: 0,
    hits: {} as Record<string, number>,
    abilitiesUsed: 0,
  };
}

/**
 * The whole game, with no rendering, audio, DOM or engine dependency.
 *
 * Keeping the simulation pure buys three things: the balance harness can run
 * thousands of flights headlessly, every rule in the ability x object matrix is
 * unit-testable, and a seeded run reproduces exactly for bug reports.
 */
export class Simulation {
  readonly state: SimState;
  readonly rng: Rng;
  private spawner: Spawner;
  /** Set by the host so debug mode can grant unlimited ability casts. */
  infiniteCharges = false;

  constructor(options: SimOptions) {
    this.rng = new Rng(options.seed);
    this.spawner = new Spawner(this.rng);
    const isEithan = options.character === 'eithan';
    this.state = {
      character: options.character,
      phase: 'aim',
      angle: LAUNCH.defaultAngle,
      meter: 0,
      meterDirection: 1,
      charging: false,
      x: WORLD.shipX,
      y: SHIP_Y + WORLD.projectileRestOffsetY,
      vx: 0,
      vy: 0,
      charges: PHYSICS.charges,
      surge: null,
      seek: null,
      glideTime: 0,
      shieldTime: 0,
      lowGravTime: 0,
      isEithan,
      destroyer: false,
      destroyerTime: 0,
      groundGone: false,
      boomTimer: 0,
      objects: [],
      generatedToX: WORLD.shipX + 184,
      flightTime: 0,
      settleTime: 0,
      stats: emptyStats(),
      events: [],
    };
    this.generate();
  }

  // ---------------------------------------------------------------- events

  private emit(kind: EventKind, x: number, y: number, extra: Partial<SimEvent> = {}): void {
    this.state.events.push({ kind, x, y, magnitude: 0, ...extra });
  }

  private tally(kind: string): void {
    const hits = this.state.stats.hits;
    hits[kind] = (hits[kind] ?? 0) + 1;
  }

  private award(points: number): number {
    this.state.stats.score += points;
    return points;
  }

  // ---------------------------------------------------------------- aim phase

  setCharging(on: boolean): void {
    if (this.state.phase !== 'aim') return;
    this.state.charging = on;
  }

  /** Adjusts aim by a vertical drag delta in logical pixels. */
  aimByDrag(deltaPixels: number): void {
    if (this.state.phase !== 'aim') return;
    this.state.angle = clamp(
      LAUNCH.defaultAngle - deltaPixels * LAUNCH.aimSensitivity,
      LAUNCH.minAngle,
      LAUNCH.maxAngle,
    );
  }

  /** Nudges aim by a fixed step. Used by keyboard control. */
  aimBy(radians: number): void {
    if (this.state.phase !== 'aim') return;
    this.state.angle = clamp(this.state.angle + radians, LAUNCH.minAngle, LAUNCH.maxAngle);
  }

  private updateCharge(dt: number): void {
    const s = this.state;
    if (!s.charging) return;
    s.meter += s.meterDirection * LAUNCH.meterSpeed * dt;
    if (s.meter >= 1) {
      s.meter = 1;
      s.meterDirection = -1;
    } else if (s.meter <= 0) {
      s.meter = 0;
      s.meterDirection = 1;
    }
  }

  launch(): void {
    const s = this.state;
    if (s.phase !== 'aim') return;
    s.charging = false;
    s.phase = 'fly';
    s.flightTime = 0;

    const speed = launchSpeed(s.meter);
    s.vx = Math.cos(s.angle) * speed;
    s.vy = Math.sin(s.angle) * speed;

    const perfect = s.meter >= LAUNCH.perfectThreshold;
    if (perfect) {
      s.vx *= LAUNCH.perfectMultiplier;
      s.vy *= LAUNCH.perfectMultiplier;
    }

    this.emit('launch', s.x, s.y, { magnitude: speed, variant: s.character });
    if (perfect) this.emit('perfect', s.x, s.y, { text: ['PERFECT LAUNCH'] });
  }

  // ---------------------------------------------------------------- abilities

  useAbility(): void {
    const s = this.state;
    if (s.phase !== 'fly' || s.isEithan) return;
    if (s.charges <= 0) {
      this.emit('abilityFail', s.x, s.y);
      return;
    }
    if (!this.infiniteCharges) s.charges -= 1;
    s.stats.abilitiesUsed += 1;

    switch (s.character) {
      case 'lindon':
        this.castConsume();
        break;
      case 'yerin':
        this.castSeeker();
        break;
      case 'mercy':
        this.castStrings();
        break;
      case 'ziel':
        this.castFormation();
        break;
      default:
        break;
    }
  }

  private castConsume(): void {
    const s = this.state;
    const a = ABILITY.lindon;
    let speed = Math.hypot(s.vx, s.vy);
    let dirX: number;
    let dirY: number;
    if (speed < 40) {
      // Nearly stalled: pick a sensible forward-and-up heading rather than
      // burning along a direction the player cannot see.
      dirX = a.stallDirX;
      dirY = a.stallDirY;
      speed = a.stallSpeed;
    } else {
      dirX = s.vx / speed;
      dirY = s.vy / speed;
    }
    s.surge = { timeLeft: a.duration, dirX, dirY, speed: Math.max(speed, a.minSpeed) };
    this.emit('ability', s.x, s.y, { variant: 'lindon', text: ['CONSUME!'] });
  }

  private castSeeker(): void {
    const s = this.state;
    const a = ABILITY.yerin;
    s.seek = { timeLeft: a.duration, lockedId: null, speed: Math.max(Math.hypot(s.vx, s.vy), a.minSpeed) };
    s.vx = s.seek.speed;
    s.vy = 0;
    this.emit('ability', s.x, s.y, { variant: 'yerin', text: ['SWORD SEEKER'] });
  }

  private castStrings(): void {
    const s = this.state;
    const a = ABILITY.mercy;
    s.glideTime = a.duration;
    // Arrests a fall without ever adding downward speed to a rising shot.
    s.vy = Math.min(s.vy, s.vy * a.fallArrest);
    this.emit('ability', s.x, s.y, { variant: 'mercy', text: ['SHADOW STRINGS'] });
  }

  private castFormation(): void {
    const s = this.state;
    const a = ABILITY.ziel;
    s.vy = -Math.max(Math.abs(s.vy) * a.bounceMultiplier, a.bounceFloor);
    s.vx = Math.max(s.vx * a.forwardMultiplier, s.vx + a.forwardKick);
    this.emit('ability', s.x, s.y + 10, { variant: 'ziel', text: ['CONJURED FORMATION!'] });
  }

  // ---------------------------------------------------------------- main step

  /** Advances the simulation. Returns true while the run is still live. */
  step(dt: number): boolean {
    const s = this.state;
    s.events.length = 0;
    const step = Math.min(MAX_STEP, dt);

    if (s.phase === 'aim') {
      this.updateCharge(step);
      return true;
    }
    if (s.phase !== 'fly') return false;

    s.flightTime += step;
    s.stats.flightTime = s.flightTime;

    if (s.isEithan) {
      if (!s.destroyer && s.flightTime > ABILITY.eithan.triggerDelay) this.beginDestroyer();
      if (s.destroyer) return this.stepDestroyer(step);
    }

    this.stepTimers(step);
    this.stepAbilityStates(step);
    this.stepMotion(step);

    // Ground contact resolves before air objects so a spike death is never
    // preempted by a pickup on the same frame.
    if (!this.resolveGround(step)) return false;
    this.resolveObjects(step);

    this.generate();
    return true;
  }

  private stepTimers(dt: number): void {
    const s = this.state;
    if (s.shieldTime > 0) s.shieldTime -= dt;
    if (s.lowGravTime > 0) s.lowGravTime -= dt;
    if (s.glideTime > 0) s.glideTime -= dt;
  }

  private stepAbilityStates(dt: number): void {
    const s = this.state;

    if (s.surge) {
      const a = ABILITY.lindon;
      s.surge.timeLeft -= dt;
      s.surge.speed += a.accel * dt;
      s.vx = s.surge.dirX * s.surge.speed;
      s.vy = s.surge.dirY * s.surge.speed;
      if (s.surge.timeLeft <= 0) s.surge = null;
    }

    if (s.seek) {
      const a = ABILITY.yerin;
      const sk = s.seek;
      sk.timeLeft -= dt;

      const locked = sk.lockedId !== null ? this.findById(sk.lockedId) : null;
      // Drop a lock the moment the prey dies or slips behind — the hunt only
      // ever drives forward.
      if (!locked || !locked.alive || locked.x < s.x - a.dropBehindX) sk.lockedId = null;

      if (sk.lockedId === null) {
        const target = this.findSeekTarget();
        if (target) {
          sk.lockedId = target.id;
          this.emit('seekerLock', target.x, target.y);
        }
      }

      const prey = sk.lockedId !== null ? this.findById(sk.lockedId) : null;
      if (prey) {
        const angle = Math.atan2(prey.y - s.y, prey.x - s.x);
        s.vx = Math.cos(angle) * sk.speed;
        s.vy = Math.sin(angle) * sk.speed;
      } else {
        s.vx = sk.speed;
        s.vy = 0;
      }
      if (sk.timeLeft <= 0) s.seek = null;
    }
  }

  private findById(id: number): WorldObject | null {
    for (const o of this.state.objects) if (o.id === id) return o;
    return null;
  }

  /** Nearest valid beast strictly ahead of the projectile, within lock range. */
  private findSeekTarget(): WorldObject | null {
    const s = this.state;
    const a = ABILITY.yerin;
    let best: WorldObject | null = null;
    let bestDist = Infinity;
    for (const o of s.objects) {
      if (!o.alive) continue;
      if (o.kind !== 'bird' && o.kind !== 'rare' && o.kind !== 'armor') continue;
      if (o.x <= s.x + a.minLeadX) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < bestDist && d < a.lockRange) {
        bestDist = d;
        best = o;
      }
    }
    return best;
  }

  private stepMotion(dt: number): void {
    const s = this.state;
    const gliding = s.glideTime > 0;

    // Consume and Sword Seeker both drive velocity directly; gravity and drag
    // are off for the duration, which is what makes them read as *techniques*
    // rather than as nudges.
    if (!s.surge && !s.seek) {
      let gravityMultiplier = gliding ? ABILITY.mercy.gravityMultiplier : 1;
      if (s.lowGravTime > 0) {
        gravityMultiplier = Math.min(gravityMultiplier, OBJECTS.aura.lowGravMultiplier);
      }
      s.vy += PHYSICS.gravity * gravityMultiplier * dt;
      if (gliding) {
        s.vx += ABILITY.mercy.forwardPull * dt;
        s.vx = applyDrag(s.vx, dt, ABILITY.mercy.dragMultiplier);
      } else {
        s.vx = applyDrag(s.vx, dt, 1);
      }
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;

    const speed = Math.hypot(s.vx, s.vy);
    s.stats.topSpeed = Math.max(s.stats.topSpeed, speed);
    s.stats.distance = Math.max(s.stats.distance, distanceMeters(s.x));
    s.stats.peakAltitude = Math.max(s.stats.peakAltitude, altitudeMeters(s.y));
  }

  // ---------------------------------------------------------------- ground

  /** True if the run continues. */
  private resolveGround(dt: number): boolean {
    const s = this.state;
    const contactY = WORLD.groundY - PHYSICS.groundContactOffset;
    if (s.y <= contactY || s.vy < 0) {
      s.settleTime = 0;
      return true;
    }

    const surge = !!s.surge;
    const shield = s.shieldTime > 0;
    const seeking = !!s.seek;
    const immune = surge || shield || seeking;

    const spike = s.objects.find(
      (o) =>
        o.alive &&
        o.kind === 'spike' &&
        s.x > o.x - OBJECTS.spike.tolerance &&
        s.x < o.x + o.w + OBJECTS.spike.tolerance,
    );
    const pad = s.objects.find(
      (o) =>
        o.alive &&
        o.kind === 'pad' &&
        s.x > o.x - OBJECTS.pad.tolerance &&
        s.x < o.x + o.w + OBJECTS.pad.tolerance,
    );

    if (spike && !immune) {
      this.die('IMPALED', spike.x + spike.w / 2, WORLD.groundY - 8);
      return false;
    }

    if (spike && immune) {
      spike.alive = false;
      const pts = this.award(OBJECTS.spike.destroyPoints);
      s.y = contactY;
      this.deflectUp(surge, 0.3);
      this.tally('spikeDestroy');
      this.emit('spikeDestroy', spike.x + spike.w / 2, WORLD.groundY - 8, {
        points: pts,
        magnitude: spike.w,
        variant: surge ? 'burn' : seeking ? 'cut' : 'shield',
        text: [surge ? 'INCINERATED' : seeking ? 'CUT THROUGH' : 'SHIELDED', `+${pts}`],
      });
      return true;
    }

    if (pad) {
      pad.alive = false;
      s.y = contactY;
      if (surge) {
        this.deflectUp(true, 0.4);
      } else {
        const p = OBJECTS.pad;
        s.vy = -Math.max(Math.abs(s.vy) * p.bounceMultiplier, p.bounceFloor);
        s.vx = Math.max(s.vx * p.forwardMultiplier, s.vx + p.forwardKick);
      }
      const pts = this.award(OBJECTS.pad.points);
      this.tally('pad');
      this.emit('pad', pad.x + pad.w / 2, WORLD.groundY, {
        points: pts,
        magnitude: pad.w,
        text: ['FORMATION LAUNCH!', `+${pts}`],
      });
      return true;
    }

    if (surge) {
      // Consume skips off the ground like a flat stone without ending the burn.
      s.y = contactY;
      this.deflectUp(true, 0.3);
      this.emit('bounce', s.x, WORLD.groundY, { magnitude: 0, variant: 'skip' });
      return true;
    }

    if (Math.abs(s.vy) > PHYSICS.bounceMinVy || s.vx > PHYSICS.bounceMinVx) {
      const impact = Math.abs(s.vy);
      s.y = contactY;
      s.vy = -impact * PHYSICS.restitution;
      s.vx *= PHYSICS.bounceKeep;
      this.tally('bounce');
      this.emit('bounce', s.x, WORLD.groundY, { magnitude: impact, text: ['BOUNCE'] });
      return true;
    }

    // Rolling to a stop.
    s.y = contactY;
    s.vy = 0;
    s.vx *= Math.max(0, 1 - PHYSICS.settleFriction * dt);
    s.settleTime += dt;
    if (Math.abs(s.vx) < PHYSICS.settleMinVx || s.settleTime > PHYSICS.settleTime) {
      this.emit('settle', s.x, WORLD.groundY);
      this.end(null);
      return false;
    }
    return true;
  }

  /** Redirects a burn or a bounce upward, preserving speed. */
  private deflectUp(surge: boolean, minUp: number): void {
    const s = this.state;
    if (surge && s.surge) {
      s.surge.dirY = -(Math.abs(s.surge.dirY) || minUp);
      const len = Math.hypot(s.surge.dirX, s.surge.dirY) || 1;
      s.surge.dirX /= len;
      s.surge.dirY /= len;
    } else {
      s.vy = -Math.abs(s.vy) * PHYSICS.restitution;
    }
  }

  // ---------------------------------------------------------------- objects

  private resolveObjects(dt: number): void {
    const s = this.state;
    const surge = !!s.surge;
    const shield = s.shieldTime > 0;
    const seeking = !!s.seek;
    const hitPad = surge ? PHYSICS.hitPadSurge : PHYSICS.hitPadNormal;
    const speed = Math.hypot(s.vx, s.vy);
    const birdFloor = WORLD.groundY - OBJECTS.bird.minGroundClearance + 4;

    for (const o of s.objects) {
      if (!o.alive) continue;

      if (o.kind === 'bird' || o.kind === 'rare' || o.kind === 'armor') {
        o.phase += dt * 8;
        o.x += o.vx * dt;
        o.y += Math.sin(o.phase * 0.6) * 10 * dt;
        if (o.y > birdFloor) o.y = birdFloor;
      }

      if (o.kind === 'storm') {
        this.resolveStorm(o, dt, surge, shield, seeking);
        continue;
      }
      if (o.kind === 'pad' || o.kind === 'spike') continue;

      const distance = Math.hypot(s.x - o.x, s.y - o.y);
      if (distance >= o.r + hitPad) continue;

      switch (o.kind) {
        case 'bird':
          this.hitBird(o, speed);
          break;
        case 'rare':
          this.hitRare(o);
          break;
        case 'armor':
          this.hitArmor(o, speed, surge, shield, seeking);
          break;
        case 'aura':
          this.grantAura(o);
          break;
        case 'orb':
          this.hitOrb(o, surge, seeking);
          break;
        case 'tmc':
          this.hitTmc(o);
          break;
        default:
          break;
      }
    }
  }

  private resolveStorm(
    o: WorldObject,
    dt: number,
    surge: boolean,
    shield: boolean,
    seeking: boolean,
  ): void {
    const s = this.state;
    if (Math.abs(s.x - o.x) >= o.rx + 4 || Math.abs(s.y - o.y) >= o.ry + 4) return;

    if (seeking) {
      // The seeker's edge parts the storm — no drag at all while hunting.
      if (!o.cut) {
        o.cut = true;
        this.tally('stormCut');
        this.emit('stormCut', o.x, o.y - o.ry - 8, { text: ['CUT THROUGH'] });
      }
      return;
    }

    if (surge || shield) {
      o.alive = false;
      const pts = this.award(OBJECTS.storm.destroyPoints);
      this.tally('stormDestroy');
      this.emit('stormDestroy', o.x, o.y, {
        points: pts,
        magnitude: o.rx,
        variant: surge ? 'burn' : 'shield',
        text: [surge ? 'BURNED AWAY!' : 'SHIELDED!', `+${pts}`],
      });
      return;
    }

    s.vx *= Math.max(0, 1 - OBJECTS.storm.dragX * dt);
    s.vy *= Math.max(0, 1 - OBJECTS.storm.dragY * dt);
    if (!o.warned) {
      o.warned = true;
      this.tally('storm');
      this.emit('stormEnter', o.x, o.y - o.ry - 8, { magnitude: o.rx, text: ['STORM DRAG'] });
    }
  }

  private hitBird(o: WorldObject, speed: number): void {
    const s = this.state;
    const b = OBJECTS.bird;
    o.alive = false;
    s.stats.beasts += 1;
    this.tally('bird');

    const sizeFactor = o.r / b.referenceRadius;
    // The speed term is capped so that a lucky flock chain accelerates the run
    // without letting boosts feed back into ever-larger boosts.
    const boost =
      (b.boostBase + Math.min(speed, b.boostSpeedCap) * b.boostSpeedScale) *
      (b.sizeFloor + sizeFactor * b.sizeSpan);

    this.applyBoost(boost, () => {
      s.vx += boost;
      s.vy = Math.min(s.vy, s.vy * b.vyRetain - b.vyKick);
    });

    const pts = this.award(beastPoints(b.pointsBase + o.r * b.pointsPerRadius, s.stats.distance));
    const seekerStrike = !!s.seek;
    this.emit('bird', o.x, o.y, {
      points: pts,
      magnitude: o.r,
      variant: String(o.species ?? 0),
      text: [seekerStrike ? 'SEEKER STRIKE!' : 'SURGE!', `+${pts}`],
    });
    // One prey per cast: the strike ends the hunt.
    if (s.seek) s.seek = null;
  }

  private hitRare(o: WorldObject): void {
    const s = this.state;
    o.alive = false;
    s.stats.beasts += 1;
    this.tally('rare');

    if (s.surge) s.surge.speed += ABILITY.lindon.rareBonus;
    else if (s.seek) s.seek.speed += ABILITY.yerin.rareBonus;
    else {
      s.vx += OBJECTS.rare.vxBoost;
      s.vy = OBJECTS.rare.vySet;
    }

    const pts = this.award(beastPoints(OBJECTS.rare.points, s.stats.distance));
    this.emit('rare', o.x, o.y, { points: pts, magnitude: o.r, text: ['GOLDEN BEAST!', `+${pts}`] });
    if (s.seek) s.seek = null;
  }

  private hitArmor(
    o: WorldObject,
    speed: number,
    surge: boolean,
    shield: boolean,
    seeking: boolean,
  ): void {
    const s = this.state;
    const a = OBJECTS.armor;
    o.alive = false;

    if (speed > a.shatterSpeed || surge || shield || seeking) {
      s.stats.beasts += 1;
      this.tally('armorShatter');
      const pts = this.award(a.shatterPoints);
      this.emit('armorShatter', o.x, o.y, {
        points: pts,
        magnitude: o.r,
        variant: surge ? 'burn' : shield ? 'shield' : seeking ? 'cut' : 'speed',
        text: [surge ? 'INCINERATED' : shield ? 'SHIELDED!' : 'SHATTERED', `+${pts}`],
      });
      // Armour counts as the seeker's one prey.
      if (s.seek) s.seek = null;
      return;
    }

    s.vx *= a.deflectVx;
    s.vy *= a.deflectVy;
    this.tally('armorDeflect');
    this.emit('armorDeflect', o.x, o.y, { magnitude: o.r, text: ['TOO SLOW — DEFLECTED'] });
  }

  private hitOrb(o: WorldObject, surge: boolean, seeking: boolean): void {
    const s = this.state;
    o.alive = false;
    if (!surge && !seeking) s.vx += OBJECTS.orb.boostBase + o.r * OBJECTS.orb.boostPerRadius;
    const pts = this.award(OBJECTS.orb.points);
    this.tally('orb');
    this.emit('orb', o.x, o.y, { points: pts, magnitude: o.r, text: [`+${pts}`] });
  }

  private hitTmc(o: WorldObject): void {
    const s = this.state;
    const t = OBJECTS.tmc;
    o.alive = false;
    // The rocket sling is a fixed bonus for the abilities rather than a scaled
    // one, so a TMC is worth the same to a burning Lindon at any speed.
    if (s.surge) s.surge.speed += ABILITY.lindon.tmcBonus;
    else if (s.seek) s.seek.speed += ABILITY.yerin.tmcBonus;
    else {
      s.vx += t.boostBase + o.r * t.boostPerRadius;
      s.vy = Math.min(s.vy, -t.vyKick);
    }

    const pts = this.award(t.points);
    this.tally('tmc');
    this.emit('tmc', o.x, o.y, {
      points: pts,
      magnitude: o.r,
      text: ['THOUSAND-MILE CLOUD!', `+${pts}`],
    });
  }

  /**
   * Routes a pickup boost into whichever ability is driving the projectile.
   * While an ability owns the velocity, feeding the boost into its speed keeps
   * the burn/hunt accelerating instead of being silently discarded.
   */
  private applyBoost(boost: number, applyToVelocity: () => void): void {
    const s = this.state;
    if (s.surge) s.surge.speed += boost * ABILITY.lindon.boostAbsorb;
    else if (s.seek) s.seek.speed += boost * ABILITY.yerin.boostAbsorb;
    else applyToVelocity();
  }

  private grantAura(o: WorldObject): void {
    const s = this.state;
    const a = OBJECTS.aura;
    o.alive = false;
    const variant = o.variant ?? 'charge';
    let text: string[];

    if (variant === 'charge') {
      if (s.charges < PHYSICS.charges) {
        s.charges += 1;
        text = [`${AURA_LABELS.charge} +1`];
      } else {
        // Never a dead pickup: a full-charge green cloud pays out in score.
        this.award(a.fullChargePoints);
        text = ['MADRA FULL', `+${a.fullChargePoints}`];
      }
    } else if (variant === 'shield') {
      s.shieldTime = a.shieldDuration;
      text = [`${AURA_LABELS.shield}!`];
    } else {
      s.lowGravTime = a.lowGravDuration;
      text = [`${AURA_LABELS.lowgrav}!`];
    }

    this.award(a.points);
    this.tally(`aura.${variant}`);
    this.emit('aura', o.x, o.y, { magnitude: o.r, variant, text });
  }

  // ---------------------------------------------------------------- destroyer

  private beginDestroyer(): void {
    const s = this.state;
    s.destroyer = true;
    s.destroyerTime = 0;
    s.groundGone = true;
    s.charges = 0;
    s.boomTimer = 0;
    this.emit('destroyerStart', s.x, s.y, { text: ['THE DESTROYER HAS COME'] });
  }

  private stepDestroyer(dt: number): boolean {
    const s = this.state;
    const e = ABILITY.eithan;
    s.destroyerTime += dt;

    s.vy *= Math.max(0, 1 - e.verticalDamp * dt);
    s.vx = Math.min(s.vx + e.accel * dt, e.maxSpeed);
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    s.stats.distance = Math.max(s.stats.distance, distanceMeters(s.x));
    s.stats.topSpeed = Math.max(s.stats.topSpeed, s.vx);
    s.stats.peakAltitude = Math.max(s.stats.peakAltitude, altitudeMeters(s.y));

    s.boomTimer -= dt;
    if (s.boomTimer <= 0) {
      s.boomTimer = e.boomInterval;
      const alive = s.objects.filter((o) => o.alive);
      if (alive.length) {
        const victim = alive[this.rng.int(alive.length)];
        victim.alive = false;
        if (victim.kind === 'bird' || victim.kind === 'rare' || victim.kind === 'armor') {
          s.stats.beasts += 1;
          this.award(e.boomScore);
        }
        this.emit('destroyerBoom', victim.x, victim.y, {
          magnitude: victim.r || victim.rx || victim.w,
          variant: victim.kind,
        });
      }
    }

    this.generate();
    if (s.destroyerTime > e.duration) {
      this.end(null);
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- lifecycle

  private die(cause: string, x: number, y: number): void {
    this.state.stats.deathCause = cause;
    this.tally(`death.${cause}`);
    this.emit('spikeDeath', x, y, { text: [cause], variant: cause });
    this.end(cause);
  }

  private end(_cause: string | null): void {
    this.state.phase = 'done';
  }

  private generate(): void {
    const s = this.state;
    s.generatedToX = this.spawner.generate(s.objects, s.x, s.generatedToX, s.destroyer);
    const cullX = s.x - SPAWN.cullBehind;
    if (s.objects.length > 40) {
      s.objects = s.objects.filter((o) => o.x > cullX);
    }
  }

  // ---------------------------------------------------------------- queries

  get speed(): number {
    return Math.hypot(this.state.vx, this.state.vy);
  }

  get altitude(): number {
    return Math.max(0, altitudeMeters(this.state.y));
  }

  get isFinished(): boolean {
    return this.state.phase === 'done';
  }

  get characterDef() {
    return CHARACTERS[this.state.character as CharacterId];
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
