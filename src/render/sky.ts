import Phaser from 'phaser';
import { CLOUD_LAYERS, MOUNTAINS, SKY_GRADIENT, STARFIELD_ALTITUDE } from '@/data/feel';
import { WORLD, altitudeMeters, worldYForAltitude } from '@/data/world';
import { TEX } from './keys';

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
  private mountainsNear: Phaser.GameObjects.TileSprite;
  private mountainsFar: Phaser.GameObjects.TileSprite;
  private cloudPool: Phaser.GameObjects.Sprite[] = [];
  private starSeed: Array<{ x: number; y: number; alpha: number }> = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.stars = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);

    // A far ridge tinted darker and scrolling slower gives the horizon depth
    // without a second art asset.
    this.mountainsFar = scene.add
      .tileSprite(0, 0, WORLD.viewWidth, 96, TEX.mountains)
      .setOrigin(0, 1)
      .setDepth(depth + 2)
      .setScrollFactor(0)
      .setTint(0x2b3760)
      .setScale(0.72, 0.62);
    this.mountainsNear = scene.add
      .tileSprite(0, 0, WORLD.viewWidth, 96, TEX.mountains)
      .setOrigin(0, 1)
      .setDepth(depth + 3)
      .setScrollFactor(0);

    for (let i = 0; i < CLOUD_LAYERS.length * 7; i++) {
      this.cloudPool.push(
        scene.add
          .sprite(0, 0, TEX.clouds, i % 6)
          .setDepth(depth + 4)
          .setScrollFactor(0)
          .setVisible(false),
      );
    }

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
    const groundScreenY = WORLD.groundY - camY;
    const visible = voidFactor < 0.6 && groundScreenY > -20 && groundScreenY < WORLD.viewHeight + 110;
    this.mountainsNear.setVisible(visible);
    this.mountainsFar.setVisible(visible);
    if (!visible) return;

    const alpha = 1 - voidFactor;
    this.mountainsFar.setPosition(0, Math.round(groundScreenY));
    this.mountainsFar.tilePositionX = camX * MOUNTAINS.parallax * 0.55;
    this.mountainsFar.setAlpha(alpha * 0.85);

    this.mountainsNear.setPosition(0, Math.round(groundScreenY));
    this.mountainsNear.tilePositionX = camX * MOUNTAINS.parallax;
    this.mountainsNear.setAlpha(alpha);
  }

  private drawClouds(camX: number, camY: number, voidFactor: number, time: number): void {
    let used = 0;
    const perLayer = 7;

    for (let layerIndex = 0; layerIndex < CLOUD_LAYERS.length; layerIndex++) {
      const layer = CLOUD_LAYERS[layerIndex];
      const sy = worldYForAltitude(layer.altitude) - camY;
      const onScreen = voidFactor < 0.8 && sy > -40 && sy < WORLD.viewHeight + 40;
      // Strata drift slowly on their own as well as scrolling with the camera,
      // so a stationary aim phase still feels like moving air.
      const scrollX = camX * layer.parallax + time * 3 * layer.parallax;

      for (let i = 0; i < perLayer; i++) {
        const sprite = this.cloudPool[used++];
        if (!sprite) break;
        if (!onScreen) {
          sprite.setVisible(false);
          continue;
        }
        const spacing = 96;
        const span = perLayer * spacing;
        const bx = (((i * spacing - scrollX) % span) + span) % span - spacing;
        sprite.setVisible(true);
        sprite.setFrame((i + layerIndex * 2) % 6);
        sprite.setTint(layer.color);
        sprite.setAlpha(layer.alpha * (1 - voidFactor));
        sprite.setScale(1 + layerIndex * 0.25);
        sprite.setPosition(Math.round(bx), Math.round(sy + ((i * 31) % 14)));
      }
    }

    for (let i = used; i < this.cloudPool.length; i++) this.cloudPool[i].setVisible(false);
  }

  destroy(): void {
    this.gfx.destroy();
    this.stars.destroy();
    this.mountainsNear.destroy();
    this.mountainsFar.destroy();
    for (const c of this.cloudPool) c.destroy();
    this.cloudPool.length = 0;
  }
}

function rgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}
