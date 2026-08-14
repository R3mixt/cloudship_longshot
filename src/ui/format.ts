/**
 * Number presentation.
 *
 * The simulation reports distance and altitude in metres and speed in world
 * pixels per second; `WORLD.pxPerMeter` is the only conversion, so it is applied
 * here rather than being repeated in every screen.
 */

import { WORLD } from '@/data/world';

/** 12345 -> "12,345". Explicit grouping keeps the format identical everywhere. */
export function group(value: number): string {
  const rounded = Math.round(value);
  const negative = rounded < 0;
  const digits = String(Math.abs(rounded));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return negative ? `-${out}` : out;
}

/** Metres, grouped, with the unit. */
export function meters(value: number): string {
  return `${group(value)} m`;
}

/** Long distances read better in kilometres once they pass a full kilometre. */
export function distance(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} km`;
  return meters(value);
}

/** Kilometre figure without the unit, for progress captions. */
export function kilometers(value: number, decimals = 1): string {
  return (value / 1000).toFixed(decimals);
}

/** World pixels per second -> metres per second. */
export function speed(pixelsPerSecond: number): string {
  return `${group(pixelsPerSecond / WORLD.pxPerMeter)} m/s`;
}

export function percent(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}
