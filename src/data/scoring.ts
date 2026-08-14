/**
 * Scoring. Beast points scale with distance so a long run's late kills matter
 * more than its first ones — this is what makes score a second, riskier
 * objective alongside raw distance instead of a duplicate of it.
 */
export const SCORING = {
  /** multiplier = 1 + distanceMeters / distanceDivisor */
  distanceDivisor: 300,
} as const;

export function distanceMultiplier(distanceMeters: number): number {
  return 1 + distanceMeters / SCORING.distanceDivisor;
}

export function beastPoints(base: number, distanceMeters: number): number {
  return Math.round(base * distanceMultiplier(distanceMeters));
}

/** Formats a distance in metres for display. */
export function formatDistance(meters: number): string {
  const m = Math.round(meters);
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
}

/** Formats a speed in px/s as metres per second. */
export function formatSpeed(pxPerSecond: number, pxPerMeter: number): string {
  return `${Math.round(pxPerSecond / pxPerMeter)} m/s`;
}
