/**
 * World-space constants.
 *
 * The simulation runs in a fixed pixel space that happens to match the render
 * resolution 1:1. `PX_PER_METER` is the only conversion between world pixels and
 * the metres shown to the player, so distance tuning and physics tuning stay
 * independent of the camera.
 */
export const WORLD = {
  /** Internal logical resolution. Everything is authored against this. */
  viewWidth: 320,
  viewHeight: 180,

  /** World pixels per displayed metre. */
  pxPerMeter: 9,

  /** World Y of the ground plane. Positive Y is down. */
  groundY: 400,

  /**
   * Cloudship deck position — the launch origin.
   *
   * The offset is 300 world pixels, which at 9 px per metre puts the deck about
   * 33 m up on the altimeter. This is the reference prototype's geometry and the
   * launch arc is tuned around it; raising the deck to a literal 300 m would
   * multiply every descent and invalidate the whole balance pass.
   */
  shipX: 46,
  shipDeckOffsetY: -300,

  /** Vertical offset of the projectile above the deck at rest. */
  projectileRestOffsetY: -12,

  /** Distance markers on the ground, in metres. */
  distanceTickMeters: 100,
} as const;

/** World Y of the cloudship deck. */
export const SHIP_Y = WORLD.groundY + WORLD.shipDeckOffsetY;

/** Convert a world Y to altitude above ground in metres. */
export function altitudeMeters(worldY: number): number {
  return (WORLD.groundY - worldY) / WORLD.pxPerMeter;
}

/** Convert a world X to distance travelled from the launch point in metres. */
export function distanceMeters(worldX: number): number {
  return (worldX - WORLD.shipX) / WORLD.pxPerMeter;
}

/** World Y for a given altitude in metres. */
export function worldYForAltitude(meters: number): number {
  return WORLD.groundY - meters * WORLD.pxPerMeter;
}
