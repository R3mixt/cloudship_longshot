/**
 * Small deterministic RNG (mulberry32). The simulation takes an RNG instance
 * rather than calling Math.random so balance runs and bug reports can be
 * reproduced exactly from a seed.
 */
export class Rng {
  private state: number;

  constructor(seed: number = (Math.random() * 0xffffffff) >>> 0) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** True with the given probability. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}

/**
 * Position-stable integer hash. Used for ground decoration so scenery does not
 * shimmer or re-roll as the camera moves.
 */
export function hash(n: number): number {
  n = Math.imul(n ^ 61, 2654435761);
  n ^= n >>> 13;
  n = Math.imul(n, 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
