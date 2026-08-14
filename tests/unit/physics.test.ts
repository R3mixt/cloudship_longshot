import { describe, expect, it } from 'vitest';
import { LAUNCH, PHYSICS, applyDrag, launchSpeed, terminalSpeedFor } from '@/data/physics';
import { WORLD } from '@/data/world';
import { CONTACT_Y, flightSim, stepCollect } from './helpers';

/** Speed at which the linear and quadratic drag terms contribute equally. */
const CROSSOVER = PHYSICS.dragLinear / PHYSICS.dragQuadratic;

function linearTerm(v: number, multiplier = 1): number {
  return PHYSICS.dragLinear * multiplier * v;
}
function quadraticTerm(v: number, multiplier = 1): number {
  return PHYSICS.dragQuadratic * multiplier * v * Math.abs(v);
}

describe('applyDrag', () => {
  it('is a no-op at dt = 0', () => {
    for (const v of [-900, -1, 0, 1, 350, 4200]) {
      expect(applyDrag(v, 0)).toBe(v);
    }
  });

  it('leaves a stationary technique stationary', () => {
    expect(applyDrag(0, 1 / 60)).toBe(0);
  });

  it('lets the linear term dominate below the crossover speed', () => {
    const v = CROSSOVER / 4;
    expect(linearTerm(v)).toBeGreaterThan(quadraticTerm(v) * 3.9);
    // The whole loss at a coasting speed is still a small fraction of the speed.
    const lost = v - applyDrag(v, 1 / 60);
    expect(lost).toBeGreaterThan(0);
    expect(lost / v).toBeLessThan(0.001);
  });

  it('lets the quadratic term dominate above the crossover speed', () => {
    const v = CROSSOVER * 8;
    expect(quadraticTerm(v)).toBeGreaterThan(linearTerm(v) * 7.9);
  });

  it('crosses over where the two coefficients balance', () => {
    expect(linearTerm(CROSSOVER)).toBeCloseTo(quadraticTerm(CROSSOVER), 9);
  });

  it('always decelerates and never reverses the sign of the velocity', () => {
    const dt = 0.05; // the simulation's maximum step
    for (const v of [-9000, -3000, -700, -140, -12, -0.5, 0.5, 12, 140, 700, 3000, 9000]) {
      const after = applyDrag(v, dt);
      expect(Math.abs(after)).toBeLessThan(Math.abs(v));
      expect(Math.sign(after)).toBe(Math.sign(v));
    }
  });

  it('decelerates a backwards-moving technique forwards, not further backwards', () => {
    expect(applyDrag(-500, 0.1)).toBeGreaterThan(-500);
    expect(applyDrag(-500, 0.1)).toBeLessThan(0);
  });

  it('scales both terms by the multiplier', () => {
    const v = 800;
    const dt = 1 / 60;
    const full = v - applyDrag(v, dt, 1);
    const half = v - applyDrag(v, dt, 0.5);
    expect(half).toBeCloseTo(full * 0.5, 10);
    // Mercy's glide multiplier is exactly a 45% drag world.
    const glide = v - applyDrag(v, dt, 0.45);
    expect(glide).toBeCloseTo(full * 0.45, 10);
  });

  it('matches the published formula exactly', () => {
    const v = 613;
    const dt = 1 / 60;
    const expected = v - (0.045 * v + 0.00032 * v * Math.abs(v)) * dt;
    expect(applyDrag(v, dt)).toBeCloseTo(expected, 10);
  });
});

describe('terminalSpeedFor', () => {
  it('returns the speed at which drag exactly cancels the acceleration', () => {
    for (const accel of [50, 140, 421.8, 900]) {
      const v = terminalSpeedFor(accel);
      const drag = PHYSICS.dragLinear * v + PHYSICS.dragQuadratic * v * v;
      expect(drag).toBeCloseTo(accel, 6);
    }
  });

  it('is the positive root of the drag polynomial', () => {
    expect(terminalSpeedFor(0)).toBeCloseTo(0, 10);
    expect(terminalSpeedFor(140)).toBeGreaterThan(0);
    expect(terminalSpeedFor(900)).toBeGreaterThan(terminalSpeedFor(140));
  });

  it('sits near the designed 120 m/s sustained equilibrium for a strong burn', () => {
    // Lindon's burn accelerates at 140 px/s^2 but pickups keep topping it up; the
    // quadratic cap is authored so a sustained run settles around 120 m/s.
    const designTarget = 120 * WORLD.pxPerMeter;
    const accelAtTarget =
      PHYSICS.dragLinear * designTarget + PHYSICS.dragQuadratic * designTarget * designTarget;
    expect(terminalSpeedFor(accelAtTarget)).toBeCloseTo(designTarget, 6);
  });

  it('draws an integrated projectile up to the equilibrium from below', () => {
    const accel = 421.8;
    const target = terminalSpeedFor(accel);
    let v = 50;
    const dt = 1 / 120;
    for (let i = 0; i < 20000; i++) {
      v = applyDrag(v + accel * dt, dt);
    }
    // Forward Euler settles a hair under the analytic root; within 1% is the
    // agreement the closed form is meant to describe.
    expect(Math.abs(v - target) / target).toBeLessThan(0.01);
    expect(v).toBeLessThan(target + 1);
  });

  it('decays a high-speed spike smoothly instead of snapping to a cap', () => {
    const dt = 1 / 60;
    let v = 4000;
    const samples: number[] = [v];
    for (let i = 0; i < 600; i++) {
      v = applyDrag(v, dt);
      samples.push(v);
    }
    // Strictly monotonic decay, with the per-step loss itself shrinking: a hard
    // clamp would show a single large drop followed by a flat line.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
    for (let i = 2; i < samples.length; i++) {
      const lossNow = samples[i - 1] - samples[i];
      const lossBefore = samples[i - 2] - samples[i - 1];
      expect(lossNow).toBeLessThan(lossBefore);
    }
    // No clamp anywhere: the projectile spends real time above every boost speed.
    expect(samples[60]).toBeGreaterThan(1500);
    expect(samples[samples.length - 1]).toBeGreaterThan(0);
  });

  it('never clamps a launched projectile inside the simulation either', () => {
    const sim = flightSim({ vx: 5000, vy: 0, y: 100 });
    const speeds: number[] = [];
    for (let i = 0; i < 120; i++) {
      sim.step(1 / 60);
      speeds.push(sim.state.vx);
    }
    expect(speeds[0]).toBeLessThan(5000);
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    }
    expect(speeds[speeds.length - 1]).toBeGreaterThan(1000);
  });
});

describe('launchSpeed', () => {
  it('matches basePower * (0.35 + 0.65 * meter)', () => {
    expect(launchSpeed(0)).toBeCloseTo(PHYSICS.basePower * 0.35, 10);
    expect(launchSpeed(0.5)).toBeCloseTo(PHYSICS.basePower * (0.35 + 0.65 * 0.5), 10);
    expect(launchSpeed(1)).toBeCloseTo(PHYSICS.basePower * 1.0, 10);
  });

  it('uses the documented base power of 620 px/s', () => {
    expect(PHYSICS.basePower).toBe(620);
    expect(launchSpeed(1)).toBeCloseTo(620, 10);
    expect(launchSpeed(0)).toBeCloseTo(217, 10);
  });

  it('rises monotonically with the charge meter', () => {
    let previous = -Infinity;
    for (let m = 0; m <= 1.0001; m += 0.05) {
      const speed = launchSpeed(Math.min(m, 1));
      expect(speed).toBeGreaterThan(previous);
      previous = speed;
    }
  });

  it('grants a perfect launch 12% more velocity at or above the gold threshold', () => {
    const sim = flightSim({ vx: 0, vy: 0 });
    sim.state.phase = 'aim';
    sim.state.meter = LAUNCH.perfectThreshold;
    sim.state.angle = -0.5;
    sim.launch();
    const speed = Math.hypot(sim.state.vx, sim.state.vy);
    expect(speed).toBeCloseTo(launchSpeed(LAUNCH.perfectThreshold) * LAUNCH.perfectMultiplier, 6);
    expect(LAUNCH.perfectMultiplier).toBeCloseTo(1.12, 10);
  });

  it('does not grant the perfect bonus just below the threshold', () => {
    const sim = flightSim({ vx: 0, vy: 0 });
    sim.state.phase = 'aim';
    sim.state.meter = LAUNCH.perfectThreshold - 0.001;
    sim.state.angle = -0.5;
    sim.launch();
    const speed = Math.hypot(sim.state.vx, sim.state.vy);
    expect(speed).toBeCloseTo(launchSpeed(LAUNCH.perfectThreshold - 0.001), 6);
  });
});

describe('gravity integration', () => {
  it('accumulates exactly gravity * elapsed on a free-falling technique', () => {
    const sim = flightSim({ vx: 0, vy: 0, y: 100 });
    const dt = 1 / 60;
    const steps = 30;
    stepCollect(sim, dt, steps);
    expect(sim.state.vy).toBeCloseTo(PHYSICS.gravity * dt * steps, 6);
  });

  it('uses the documented 158 px/s^2', () => {
    expect(PHYSICS.gravity).toBe(158);
  });

  it('does not apply gravity while the aim phase is still running', () => {
    const sim = flightSim();
    sim.state.phase = 'aim';
    stepCollect(sim, 1 / 60, 30);
    expect(sim.state.vy).toBe(0);
  });
});

describe('ground bounce', () => {
  it('reflects vertical speed at the restitution and keeps 90% of horizontal speed', () => {
    const sim = flightSim({ x: 2000, y: 300, vx: 400, vy: 300 });
    const dt = 1 / 60;
    let before = { vx: 0, vy: 0 };
    let bounced = false;

    for (let i = 0; i < 600 && !bounced; i++) {
      before = { vx: sim.state.vx, vy: sim.state.vy };
      sim.step(dt);
      if (sim.state.events.some((e) => e.kind === 'bounce')) bounced = true;
    }

    expect(bounced).toBe(true);
    // Gravity and drag are applied before the contact resolves.
    const vyAtImpact = before.vy + PHYSICS.gravity * dt;
    const vxAtImpact = applyDrag(before.vx, dt);
    expect(sim.state.vy).toBeCloseTo(-Math.abs(vyAtImpact) * PHYSICS.restitution, 6);
    expect(sim.state.vx).toBeCloseTo(vxAtImpact * PHYSICS.bounceKeep, 6);
    expect(sim.state.y).toBeCloseTo(CONTACT_Y, 10);
  });

  it('uses the documented restitution and horizontal retention', () => {
    expect(PHYSICS.restitution).toBe(0.58);
    expect(PHYSICS.bounceKeep).toBe(0.9);
  });

  it('loses height on every successive bounce', () => {
    const sim = flightSim({ x: 2000, y: 200, vx: 500, vy: 0 });
    const peaks: number[] = [];
    for (let i = 0; i < 3000; i++) {
      sim.step(1 / 60);
      if (sim.state.events.some((e) => e.kind === 'bounce')) peaks.push(Math.abs(sim.state.vy));
      if (sim.isFinished) break;
    }
    // Only the real bounces: once vertical speed drops under the threshold the
    // projectile is scraping along the ground, not arcing.
    const real = peaks.filter((v) => v > PHYSICS.bounceMinVy * PHYSICS.restitution);
    expect(real.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < real.length; i++) {
      expect(real[i]).toBeLessThan(real[i - 1]);
    }
  });

  it('stops bouncing and starts settling below the bounce thresholds', () => {
    const sim = flightSim({ x: 2000, y: WORLD.groundY - 2, vx: 40, vy: 0 });
    const events = stepCollect(sim, 1 / 60, 600);
    expect(events.map((e) => e.kind)).not.toContain('bounce');
    expect(events.map((e) => e.kind)).toContain('settle');
  });
});
