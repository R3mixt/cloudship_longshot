import { describe, expect, it } from 'vitest';
import { Rng, hash } from '@/core/rng';

const SEED = 1337;

function draw(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.next());
}

describe('Rng determinism', () => {
  it('reproduces the same stream from the same seed', () => {
    expect(draw(new Rng(SEED), 500)).toEqual(draw(new Rng(SEED), 500));
  });

  it('produces a different stream from a different seed', () => {
    expect(draw(new Rng(SEED), 200)).not.toEqual(draw(new Rng(SEED + 1), 200));
  });

  it('treats the seed as an unsigned 32-bit value', () => {
    expect(draw(new Rng(0), 20)).toEqual(draw(new Rng(0), 20));
    expect(draw(new Rng(0xffffffff), 20)).toEqual(draw(new Rng(-1), 20));
  });

  it('does not repeat itself over a long stream', () => {
    const values = draw(new Rng(SEED), 20000);
    expect(new Set(values).size).toBeGreaterThan(19900);
  });
});

describe('Rng.next', () => {
  it('stays inside [0, 1)', () => {
    const rng = new Rng(SEED);
    for (let i = 0; i < 100000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform over a large sample', () => {
    const rng = new Rng(SEED);
    const buckets = new Array(10).fill(0);
    const samples = 200000;
    for (let i = 0; i < samples; i++) buckets[Math.floor(rng.next() * 10)] += 1;
    for (const count of buckets) {
      expect(Math.abs(count / samples - 0.1)).toBeLessThan(0.005);
    }
  });

  it('has a mean near one half', () => {
    const rng = new Rng(SEED);
    let total = 0;
    const samples = 200000;
    for (let i = 0; i < samples; i++) total += rng.next();
    expect(Math.abs(total / samples - 0.5)).toBeLessThan(0.005);
  });
});

describe('Rng.range', () => {
  it('stays inside the requested half-open interval', () => {
    const rng = new Rng(SEED);
    for (let i = 0; i < 50000; i++) {
      const v = rng.range(-38, -14);
      expect(v).toBeGreaterThanOrEqual(-38);
      expect(v).toBeLessThan(-14);
    }
  });

  it('spans very nearly the whole interval over a large sample', () => {
    const rng = new Rng(SEED);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 50000; i++) {
      const v = rng.range(6, 14);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(6.01);
    expect(max).toBeGreaterThan(13.99);
  });

  it('returns the lower bound for an empty interval', () => {
    const rng = new Rng(SEED);
    expect(rng.range(7, 7)).toBe(7);
  });
});

describe('Rng.int', () => {
  it('returns integers inside [0, n)', () => {
    const rng = new Rng(SEED);
    for (let i = 0; i < 50000; i++) {
      const v = rng.int(4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
    }
  });

  it('hits every value in a small range about equally often', () => {
    const rng = new Rng(SEED);
    const buckets = [0, 0, 0, 0];
    const samples = 100000;
    for (let i = 0; i < samples; i++) buckets[rng.int(4)] += 1;
    for (const count of buckets) {
      expect(Math.abs(count / samples - 0.25)).toBeLessThan(0.01);
    }
  });

  it('always returns zero for a single-element range', () => {
    const rng = new Rng(SEED);
    for (let i = 0; i < 100; i++) expect(rng.int(1)).toBe(0);
  });
});

describe('Rng.chance', () => {
  it('is always false at probability 0 and always true at 1', () => {
    const rng = new Rng(SEED);
    for (let i = 0; i < 1000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('fires at approximately the requested rate', () => {
    for (const p of [0.1, 0.28, 0.45, 0.775]) {
      const rng = new Rng(SEED);
      let hits = 0;
      const samples = 200000;
      for (let i = 0; i < samples; i++) if (rng.chance(p)) hits += 1;
      expect(Math.abs(hits / samples - p)).toBeLessThan(0.005);
    }
  });
});

describe('Rng.pick', () => {
  it('only ever returns members of the list', () => {
    const rng = new Rng(SEED);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 5000; i++) expect(items).toContain(rng.pick(items));
  });

  it('reaches every member of the list', () => {
    const rng = new Rng(SEED);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rng.pick(items));
    expect(seen.size).toBe(items.length);
  });
});

describe('hash', () => {
  it('is stable for the same input', () => {
    expect(hash(12345)).toBe(hash(12345));
    expect(hash(-7)).toBe(hash(-7));
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const n of [0, 1, -1, 99999, -99999, 2 ** 30]) {
      const h = hash(n);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it('decorrelates neighbouring inputs', () => {
    const values = Array.from({ length: 5000 }, (_, i) => hash(i));
    expect(new Set(values).size).toBeGreaterThan(4990);
    const lowBits = values.map((v) => v % 8);
    for (let b = 0; b < 8; b++) {
      const share = lowBits.filter((v) => v === b).length / lowBits.length;
      expect(Math.abs(share - 0.125)).toBeLessThan(0.02);
    }
  });
});
