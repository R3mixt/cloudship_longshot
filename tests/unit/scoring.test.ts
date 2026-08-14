import { describe, expect, it } from 'vitest';
import {
  SCORING,
  beastPoints,
  distanceMultiplier,
  formatDistance,
  formatSpeed,
} from '@/data/scoring';
import { WORLD } from '@/data/world';

describe('distanceMultiplier', () => {
  it('starts at 1 at the launch point', () => {
    expect(distanceMultiplier(0)).toBe(1);
  });

  it('adds one multiple per divisor of distance', () => {
    expect(distanceMultiplier(SCORING.distanceDivisor)).toBe(2);
    expect(distanceMultiplier(SCORING.distanceDivisor * 5)).toBe(6);
  });

  it('rises linearly and without a ceiling', () => {
    const a = distanceMultiplier(1000);
    const b = distanceMultiplier(2000);
    const c = distanceMultiplier(3000);
    expect(b - a).toBeCloseTo(c - b, 10);
    expect(distanceMultiplier(1_000_000)).toBeGreaterThan(1000);
  });
});

describe('beastPoints', () => {
  it('pays the base value at the launch point', () => {
    expect(beastPoints(400, 0)).toBe(400);
    expect(beastPoints(66, 0)).toBe(66);
  });

  it('scales the base value by the distance multiplier', () => {
    expect(beastPoints(100, SCORING.distanceDivisor)).toBe(200);
    expect(beastPoints(400, 600)).toBe(1200);
  });

  it('rounds to the nearest whole point, halves upward', () => {
    // 1 * 1.5 = 1.5 exactly.
    expect(beastPoints(1, SCORING.distanceDivisor / 2)).toBe(2);
    // 1 * 1.4 = 1.4.
    expect(beastPoints(1, SCORING.distanceDivisor * 0.4)).toBe(1);
    expect(Number.isInteger(beastPoints(37, 411))).toBe(true);
  });

  it('never returns a fraction', () => {
    for (let d = 0; d < 2000; d += 37) {
      expect(Number.isInteger(beastPoints(66, d))).toBe(true);
    }
  });
});

describe('formatDistance', () => {
  it('shows whole metres below one kilometre', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(1)).toBe('1 m');
    expect(formatDistance(432.4)).toBe('432 m');
    expect(formatDistance(999)).toBe('999 m');
    expect(formatDistance(999.49)).toBe('999 m');
  });

  it('switches to kilometres at and above one thousand metres', () => {
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(999.5)).toBe('1.00 km');
    expect(formatDistance(1500)).toBe('1.50 km');
    expect(formatDistance(12500)).toBe('12.50 km');
  });

  it('keeps two decimal places in kilometres', () => {
    expect(formatDistance(1234)).toBe('1.23 km');
    expect(formatDistance(100000)).toBe('100.00 km');
  });

  it('rounds before choosing the unit', () => {
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(1000.4)).toBe('1.00 km');
  });
});

describe('formatSpeed', () => {
  it('converts world pixels per second to metres per second', () => {
    expect(formatSpeed(0, WORLD.pxPerMeter)).toBe('0 m/s');
    expect(formatSpeed(WORLD.pxPerMeter * 100, WORLD.pxPerMeter)).toBe('100 m/s');
    expect(formatSpeed(900, 9)).toBe('100 m/s');
  });

  it('rounds to whole metres per second', () => {
    expect(formatSpeed(904, 9)).toBe('100 m/s');
    expect(formatSpeed(950, 9)).toBe('106 m/s');
  });
});
