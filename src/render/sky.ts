import Phaser from 'phaser';
import { CLOUD_LAYERS, MOUNTAINS, SKY_GRADIENT, STARFIELD_ALTITUDE } from '@/data/feel';
import { WORLD, altitudeMeters, worldYForAltitude } from '@/data/world';

const BANDS = 24;

/**
 * Sky, stars, parallax cloud strata and the distant mountain band.
 *
 * The gradient is drawn as horizontal bands sampled at each band's *world*
 * altitude rather than as a screen-space gradient, so climbing through 1,200 m
 * genuinely moves the sky through it instead of scrolling a fixed image.
 */
export class SkyRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  private stars: Phaser.GameObjects.Graphics;
  private clouds: Phaser.GameObjects.Graphics;
  private mountains: Phaser.GameObjects.Graphics;
  private starSeed: Array<{ x: number; y: number; alpha: number }> = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.stars = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);
    this.mountains = scene.add.graphics().setDepth(depth + 2).setScrollFactor(0);
    this.clouds = scene.add.graphics().setDepth(depth + 3).setScrollFactor(0);

    // Stable star field: positions are fixed once and scrolled, so stars never
    // shimmer or re-roll as the camera drifts.
    for (let i = 0; i < 90; i++) {
      this.starSeed.push({
        x: (i * 137 + ((i * i * 31) % 97)) % 1200,
        y: 1200 + ((i * 211) % 3400),
        alpha: 0.35 + ((i * 7) % 6) / 12,
      });
    }
  }

  static colorAt(altitudeM: number): [number, number, number] {
    const first = SKY_GRADIENT[0];
    if (altitudeM <= first[0]) return [first[1], first[2], first[3]];
    for (let i = 1; i < SKY_GRADIENT.length; i++) {
      const b = SKY_GRADIENT[i];
      if (altitudeM < b[0]) {
        const a = SKY_GRADIENT[i - 1];
        const t = (altitudeM - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
      }
    }
    const last = SKY_GRADIENT[SKY_GRADIENT.length - 1];
    return [last[1], last[2], last[3]];
  }

  update(camX: number, camY: number, voidFactor: number, time: number): void {
    const { viewWidth: VW, viewHeight: VH } = WORLD;
    const bandHeight = VH / BANDS;

    this.gfx.clear();
    for (let i = 0; i < BANDS; i++) {
      const worldY = camY + i * bandHeight + bandHeight / 2;
      const alt = Math.max(0, altitudeMeters(worldY));
      let [r, g, b] = SkyRenderer.colorAt(alt);
      if (voidFactor > 0) {
        r = r * (1 - voidFactor) + 8 * voidFactor;
        g = g * (1 - voidFactor) + 8 * voidFactor;
        b = b * (1 - voidFactor) + 16 * voidFactor;
      }
      this.gfx.fillStyle(rgb(r, g, b), 1);
      this.gfx.fillRect(0, i * bandHeight, VW, bandHeight + 1);
    }

    this.drawStars(camX, camY, voidFactor);
    this.drawMountains(camX, camY, voidFactor);
    this.drawClouds(camX, camY, voidFactor, time);
  }

  private drawStars(camX: number, camY: number, voidFactor: number): void {
    const { viewWidth: VW, viewHeight: VH } = WORLD;
    const topAltitude = altitudeMeters(camY);
    this.stars.clear();
    if (topAltitude < STARFIELD_ALTITUDE && voidFactor < 0.5) return;

    // Fade in over the last 200 m rather than popping on at the threshold.
    const fade =
      voidFactor > 0.5
        ? 1
        : Math.min(1, (topAltitude - STARFIELD_ALTITUDE) / 200);

    for (const s of this.starSeed) {
      const sx = (((s.x - camX * 0.03) % (VW + 40)) + (VW + 40)) % (VW + 40) - 20;
      const sy = voidFactor > 0.5 ? s.y % VH : worldYForAltitude(s.y) - camY;
      if (sy < -4 || sy > VH) continue;
      this.stars.fillStyle(0xe8ecff, s.alpha * fade);
      this.stars.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  private drawMountains(camX: number, camY: number, voidFactor: number): void {
    this.mountains.clear();
    if (voidFactor > 0.6) return;
    const groundScreenY = WORLD.groundY - camY;
    if (groundScreenY < -20 || groundScreenY > WORLD.viewHeight + 90) return;

    const alpha = 1 - voidFactor;
    this.mountains.fillStyle(0x33406e, alpha);
    for (let i = 0; i < 10; i++) {
      const bx = (((i * MOUNTAINS.spacing - camX * MOUNTAINS.parallax) % 900) + 900) % 900 - 90;
      const peak = MOUNTAINS.minHeight + ((i * 37) % MOUNTAINS.heightSpread);
      this.mountains.fillTriangle(
        bx,
        groundScreenY,
        bx + 42,
        groundScreenY - peak,
        bx + 88,
        groundScreenY,
      );
    }
    // A lighter ridge behind, offset and shorter, gives the band depth.
    this.mountains.fillStyle(0x3d4b7d, alpha * 0.7);
    for (let i = 0; i < 10; i++) {
      const bx = (((i * 113 - camX * (MOUNTAINS.parallax * 0.6)) % 1130) + 1130) % 1130 - 110;
      const peak = 26 + ((i * 53) % 26);
      this.mountains.fillTriangle(
        bx,
        groundScreenY,
        bx + 34,
        groundScreenY - peak,
        bx + 70,
        groundScreenY,
      );
    }
  }

  private drawClouds(camX: number, camY: number, voidFactor: number, time: number): void {
    this.clouds.clear();
    if (voidFactor > 0.8) return;
    const alpha = 1 - voidFactor;

    for (const layer of CLOUD_LAYERS) {
      const worldY = worldYForAltitude(layer.altitude);
      const sy = worldY - camY;
      if (sy < -40 || sy > WORLD.viewHeight + 30) continue;
      const scrollX = camX * layer.parallax + time * 2 * layer.parallax;
      this.clouds.fillStyle(layer.color, layer.alpha * alpha);
      for (let i = 0; i < 10; i++) {
        const bx = (((i * 70 - scrollX) % 700) + 700) % 700 - 60;
        const by = sy + ((i * 31) % 14);
        this.clouds.fillRect(bx, by, 44, 9);
        this.clouds.fillRect(bx + 8, by - 4, 26, 5);
        this.clouds.fillRect(bx - 6, by + 4, 56, 6);
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.stars.destroy();
    this.clouds.destroy();
    this.mountains.destroy();
  }
}

function rgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}
