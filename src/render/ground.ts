import Phaser from 'phaser';
import { hash } from '@/core/rng';
import { WORLD } from '@/data/world';

const DECOR_SPACING = 22;

/**
 * The ground band, its decoration and the distance markers.
 *
 * Decoration is derived from a hash of the column index rather than stored, so
 * it is identical every time the camera passes over a stretch of world and
 * costs nothing to keep — the world is endless, so nothing about it can be
 * retained in memory.
 */
export class GroundRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private labelPool: Phaser.GameObjects.Text[] = [];
  private scene: Phaser.Scene;
  private depth: number;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  }

  update(camX: number, camY: number, hidden: boolean, distanceTravelled: number): void {
    this.gfx.clear();
    if (hidden) {
      this.hideLabels(0);
      return;
    }

    const groundScreenY = WORLD.groundY - camY;
    const { viewWidth: VW, viewHeight: VH } = WORLD;
    if (groundScreenY >= VH + 10) {
      this.hideLabels(0);
      return;
    }

    // Terrain tint drifts slightly with distance so a long run visibly travels
    // through changing country rather than repeating one strip forever.
    const t = Math.min(1, distanceTravelled / 6000);
    const top = lerpColor(0x6d8f52, 0x8a9b4a, t);
    const body = lerpColor(0x4d6a3a, 0x6a6a38, t);
    const deep = lerpColor(0x3d5230, 0x4c4a2a, t);

    this.gfx.fillStyle(body, 1);
    this.gfx.fillRect(0, groundScreenY, VW, VH - groundScreenY + 10);
    this.gfx.fillStyle(top, 1);
    this.gfx.fillRect(0, groundScreenY, VW, 3);
    this.gfx.fillStyle(deep, 1);
    this.gfx.fillRect(0, groundScreenY + 9, VW, VH);

    this.drawDecoration(camX, groundScreenY, top);
    this.drawTicks(camX, groundScreenY);
  }

  private drawDecoration(camX: number, gy: number, grassTop: number): void {
    const first = Math.floor(camX / DECOR_SPACING) - 1;
    const last = Math.floor((camX + WORLD.viewWidth) / DECOR_SPACING) + 1;

    for (let col = first; col <= last; col++) {
      const h = hash(col);
      const sx = col * DECOR_SPACING - camX + (h % 12);
      const kind = h % 9;

      if (kind < 2) {
        const rw = 2 + ((h >> 4) % 5);
        const rh = 2 + ((h >> 7) % 3);
        this.gfx.fillStyle(0x6a6f88, 1);
        this.gfx.fillRect(sx, gy - rh + 2, rw, rh);
        this.gfx.fillStyle(0x8a8fae, 1);
        this.gfx.fillRect(sx + 1, gy - rh + 1, rw - 1, 1);
      } else if (kind < 5) {
        this.gfx.fillStyle(grassTop, 1);
        this.gfx.fillRect(sx, gy - 2, 1, 3);
        this.gfx.fillStyle(0x7da45e, 1);
        this.gfx.fillRect(sx + 2, gy - 3, 1, 4);
        this.gfx.fillStyle(0x5d7f46, 1);
        this.gfx.fillRect(sx + 4, gy - 2, 1, 3);
      } else if (kind === 5) {
        this.gfx.fillStyle(0x5d5238, 1);
        this.gfx.fillRect(sx - 4, gy + 1, 14 + ((h >> 5) % 10), 3);
      } else if (kind === 6) {
        this.gfx.fillStyle((h >> 3) % 2 ? 0xffd876 : 0xe0a8ff, 1);
        this.gfx.fillRect(sx, gy - 3, 1, 1);
        this.gfx.fillStyle(grassTop, 1);
        this.gfx.fillRect(sx, gy - 2, 1, 2);
      }

      // Buried stones below the surface line.
      if ((h >> 9) % 7 === 0) {
        this.gfx.fillStyle(0x33452a, 1);
        this.gfx.fillRect(sx + 3, gy + 8 + ((h >> 11) % 14), 3, 2);
      }
    }
  }

  private drawTicks(camX: number, gy: number): void {
    const { pxPerMeter: M, shipX, distanceTickMeters: step } = WORLD;
    const startM = Math.floor(camX / M / step) * step;
    let used = 0;

    for (let m = startM; m < startM + WORLD.viewWidth / M + step * 2; m += step) {
      if (m < step) continue;
      const sx = m * M + shipX - camX;
      if (sx < -24 || sx > WORLD.viewWidth + 24) continue;
      this.gfx.fillStyle(0xdfe6ff, 0.9);
      this.gfx.fillRect(Math.round(sx), gy, 1, 6);
      const label = this.getLabel(used++);
      label.setText(m >= 1000 ? `${m / 1000}k` : String(m));
      label.setPosition(Math.round(sx - label.width / 2), Math.round(gy + 8));
      label.setVisible(true);
    }
    this.hideLabels(used);
  }

  private getLabel(index: number): Phaser.GameObjects.Text {
    let label = this.labelPool[index];
    if (!label) {
      label = this.scene.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '6px', color: '#dfe6ff' })
        .setDepth(this.depth + 1)
        .setScrollFactor(0)
        .setResolution(2);
      this.labelPool[index] = label;
    }
    return label;
  }

  private hideLabels(from: number): void {
    for (let i = from; i < this.labelPool.length; i++) this.labelPool[i].setVisible(false);
  }

  destroy(): void {
    this.gfx.destroy();
    for (const l of this.labelPool) l.destroy();
    for (const l of this.labels) l.destroy();
    this.labelPool.length = 0;
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0)
  );
}
