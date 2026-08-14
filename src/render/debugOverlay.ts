import Phaser from 'phaser';
import { PHYSICS } from '@/data/physics';
import { WORLD, altitudeMeters } from '@/data/world';
import type { SimState } from '@/sim/types';
import { PixelText } from './pixelText';

/**
 * Diagnostics drawn behind `?debug=1`. Nothing here is constructed unless the
 * flag is set, so a release build pays only for the flag check.
 */
export class DebugOverlay {
  private shapes: Phaser.GameObjects.Graphics;
  private readout: PixelText;
  private frameTimes: number[] = [];
  private showHitboxes: boolean;
  private showStats: boolean;

  constructor(scene: Phaser.Scene, depth: number, showHitboxes: boolean, showStats: boolean) {
    this.showHitboxes = showHitboxes;
    this.showStats = showStats;
    this.shapes = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.readout = new PixelText(scene, WORLD.viewWidth - 3, 0, {
      depth,
      tint: 0x7dffb0,
      originX: 1,
    });
  }

  update(state: SimState, camX: number, camY: number, delta: number, particles: number): void {
    if (this.showStats) this.drawStats(state, delta, particles);
    if (this.showHitboxes) this.drawHitboxes(state, camX, camY);
  }

  private drawStats(state: SimState, delta: number, particles: number): void {
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const mean = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    // The worst frame in the last second matters more than the average: a
    // steady 60 with one 40 ms spike is what a player actually feels.
    const worst = Math.max(...this.frameTimes);

    this.readout.setText(
      [
        `${(1000 / mean).toFixed(0)} fps  worst ${worst.toFixed(1)}ms`,
        `obj ${state.objects.filter((o) => o.alive).length}  part ${particles}`,
        `v ${Math.hypot(state.vx, state.vy).toFixed(0)}  alt ${altitudeMeters(state.y).toFixed(0)}`,
        `x ${state.x.toFixed(0)}  gen ${state.generatedToX.toFixed(0)}`,
      ].join('\n'),
    );
    // Kept pinned to the bottom-right: the block grows upward from there, and
    // PixelText measures from its top edge.
    this.readout.setPosition(WORLD.viewWidth - 3, WORLD.viewHeight - 3 - this.readout.height);
  }

  private drawHitboxes(state: SimState, camX: number, camY: number): void {
    const g = this.shapes;
    g.clear();

    const groundY = WORLD.groundY - camY;
    const radius = state.surge ? PHYSICS.hitPadSurge : PHYSICS.hitPadNormal;
    g.lineStyle(1, 0x00ff88, 0.9);
    g.strokeCircle(state.x - camX, state.y - camY, radius);

    for (const o of state.objects) {
      if (!o.alive) continue;
      const x = o.x - camX;
      const y = o.y - camY;
      if (x < -80 || x > WORLD.viewWidth + 80) continue;

      switch (o.kind) {
        case 'storm':
          // Storms are the only axis-aligned box in the game.
          g.lineStyle(1, 0x8888ff, 0.9);
          g.strokeRect(x - o.rx, y - o.ry, o.rx * 2, o.ry * 2);
          break;
        case 'pad':
          g.lineStyle(1, 0x57e08c, 0.9);
          g.strokeRect(x, groundY - 6, o.w, 6);
          break;
        case 'spike':
          g.lineStyle(1, 0xff5555, 0.9);
          g.strokeRect(x, groundY - o.h, o.w, o.h);
          break;
        default:
          g.lineStyle(1, 0xffd876, 0.9);
          g.strokeCircle(x, y, o.r);
          break;
      }
    }

    // The seeker's lock radius, which is otherwise invisible and easy to mistune.
    if (state.seek) {
      g.lineStyle(1, 0xffffff, 0.25);
      g.strokeCircle(state.x - camX, state.y - camY, 490);
    }
  }

  destroy(): void {
    this.shapes.destroy();
    this.readout.destroy();
  }
}
