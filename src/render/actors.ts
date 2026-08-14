import Phaser from 'phaser';
import { CHARACTERS, type CharacterId } from '@/data/characters';
import { FEEL } from '@/data/feel';
import { SHIP_Y, WORLD } from '@/data/world';
import type { SimState } from '@/sim/types';
import { ANIM, TEX } from './keys';
import { PixelText } from './pixelText';
import { CHARACTER_ROWS } from './sheets';

/** Drawn size relative to the authored sprite. */
const PROJECTILE_SCALE = 0.62;
const SURGE_SCALE = 0.72;

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

/**
 * The projectile, its trail, the aim guide, the receding cloudship, the personal
 * best flag and the high-speed wind streaks.
 */
export class ActorRenderer {
  private scene: Phaser.Scene;
  private ship: Phaser.GameObjects.Sprite;
  private crew: Phaser.GameObjects.Sprite;
  private projectile: Phaser.GameObjects.Sprite;
  private trail: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Graphics;
  private flagLabel: PixelText;
  private trailPoints: TrailPoint[] = [];
  private streaks: Array<{ x: number; y: number; length: number }> = [];
  private currentCharacter: CharacterId = 'lindon';
  private surgeActive = false;

  showSpeedLines = true;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.trail = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.ship = scene.add
      .sprite(0, 0, TEX.cloudship, 0)
      .setDepth(depth - 1)
      .setScrollFactor(0);
    this.crew = scene.add.sprite(0, 0, TEX.characters, 0).setDepth(depth).setScrollFactor(0);
    this.projectile = scene.add
      .sprite(0, 0, TEX.projectiles, 0)
      .setDepth(depth + 1)
      .setScrollFactor(0);
    this.overlay = scene.add
      .graphics()
      .setDepth(depth + 2)
      .setScrollFactor(0);
    this.flagLabel = new PixelText(scene, 0, 0, {
      depth,
      tint: 0x7dffb0,
      originX: 0.5,
    });
    this.flagLabel.setText('BEST').setVisible(false);

    for (let i = 0; i < FEEL.speedLines.count; i++) {
      this.streaks.push({
        x: Math.random() * WORLD.viewWidth,
        y: Math.random() * WORLD.viewHeight,
        length: 6 + Math.random() * 14,
      });
    }
  }

  setCharacter(id: CharacterId): void {
    this.currentCharacter = id;
    const row = Math.max(0, CHARACTER_ROWS.indexOf(id as (typeof CHARACTER_ROWS)[number]));
    const idleAnim = ANIM.characterIdle(id);
    if (this.scene.anims.exists(idleAnim)) this.crew.play(idleAnim, true);
    else this.crew.setTexture(TEX.characters, row * 8);
    const projAnim = ANIM.projectile(id);
    if (this.scene.anims.exists(projAnim)) this.projectile.play(projAnim, true);
    else this.projectile.setTexture(TEX.projectiles, row * 4);
  }

  reset(): void {
    this.trailPoints.length = 0;
    this.trail.clear();
    this.overlay.clear();
    this.surgeActive = false;
  }

  update(state: SimState, camX: number, camY: number, time: number, dt: number): void {
    this.drawShip(state, camX, camY, time);
    this.drawTrail(state, camX, camY);
    this.drawProjectile(state, camX, camY, time);
    this.drawOverlay(state, camX, camY, time, dt);
  }

  // ------------------------------------------------------------------ ship

  private drawShip(state: SimState, camX: number, camY: number, time: number): void {
    const bob = Math.sin(time * 1.6) * 1.5;
    const x = WORLD.shipX - 66 - camX;
    const y = SHIP_Y - camY + bob;
    const offscreen = x < -220 || y < -80 || y > WORLD.viewHeight + 60;

    this.ship.setVisible(!offscreen);
    this.crew.setVisible(!offscreen);
    if (offscreen) return;

    if (this.scene.anims.exists(ANIM.cloudshipIdle) && !this.ship.anims.isPlaying) {
      this.ship.play(ANIM.cloudshipIdle, true);
    }
    this.ship.setOrigin(0, 0.5);
    this.ship.setPosition(Math.round(x), Math.round(y + 8));

    // The launching character stands at the stern rail, beside the launch point.
    this.crew.setOrigin(0.5, 1);
    this.crew.setPosition(Math.round(x + 150), Math.round(y + 12));

    if (state.phase === 'aim') {
      const chargeAnim = ANIM.characterCharge(this.currentCharacter);
      if (state.charging && this.scene.anims.exists(chargeAnim)) {
        this.crew.play(chargeAnim, true);
      }
    }
  }

  // ------------------------------------------------------------------ trail

  private drawTrail(state: SimState, camX: number, camY: number): void {
    this.trail.clear();
    if (state.phase === 'aim') return;

    const maxLength = state.destroyer
      ? FEEL.trail.destroyerLength
      : state.surge
        ? FEEL.trail.surgeLength
        : FEEL.trail.normalLength;

    if (state.phase === 'fly') {
      this.trailPoints.push({ x: state.x, y: state.y, alpha: 1 });
      while (this.trailPoints.length > maxLength) this.trailPoints.shift();
    }

    const palette = CHARACTERS[state.character].palette;
    const color = state.surge
      ? 0xff7733
      : Phaser.Display.Color.HexStringToColor(palette.trail).color;
    const width = state.destroyer ? 5 : state.surge ? 4 : 3;

    // The trail is stroked as a continuous path rather than stamped as squares
    // at each sample. At speed the samples are tens of pixels apart, and stamps
    // read as a dotted line of debris instead of a streak — most visibly during
    // the Destroyer sequence, where the projectile covers 24 px per frame.
    for (let i = 0; i < this.trailPoints.length; i++) {
      const point = this.trailPoints[i];
      point.alpha -= FEEL.trail.fadePerFrame;
      const next = this.trailPoints[i + 1];
      if (point.alpha <= 0 || !next) continue;
      // Taper toward the tail so the streak reads as motion, not as a ribbon.
      const taper = (i + 1) / this.trailPoints.length;
      this.trail.lineStyle(Math.max(1, width * taper), color, point.alpha * 0.75 * taper);
      this.trail.lineBetween(point.x - camX, point.y - camY, next.x - camX, next.y - camY);
    }
  }

  // ------------------------------------------------------------------ projectile

  private drawProjectile(state: SimState, camX: number, camY: number, time: number): void {
    const p = this.projectile;
    const x = Math.round(state.x - camX);
    const y = Math.round(state.y - camY);
    p.setPosition(x, y);
    p.setVisible(true);

    const surging = !!state.surge;
    if (surging !== this.surgeActive) {
      this.surgeActive = surging;
      if (surging && this.scene.anims.exists(ANIM.projectileSurge)) {
        p.play(ANIM.projectileSurge, true);
      } else {
        this.setCharacter(state.character);
      }
    }

    if (state.destroyer) {
      // The scythe-streak leads its own motion; angling it to velocity sells the
      // speed far better than a static sprite.
      p.setAngle((Math.atan2(state.vy, state.vx) * 180) / Math.PI);
      p.setScale(SURGE_SCALE * 1.5);
      return;
    }

    p.setAngle(0);
    // The sprites are authored larger than the collision radius so they have room
    // for a glow and detail; PROJECTILE_SCALE brings the drawn size back in line
    // with what the player is actually steering. A subtle breathing pulse keeps
    // the technique feeling alive.
    const base = surging ? SURGE_SCALE : PROJECTILE_SCALE;
    p.setScale(base * (surging ? 1 : 1 + Math.sin(time * 9) * 0.05));
  }

  // ------------------------------------------------------------------ overlay

  private drawOverlay(state: SimState, camX: number, camY: number, time: number, dt: number): void {
    const g = this.overlay;
    g.clear();

    const x = state.x - camX;
    const y = state.y - camY;

    // Aura shield ring.
    if (state.shieldTime > 0) {
      const r = 8;
      g.lineStyle(1, 0xffd876, 0.5 + Math.sin(time * 10) * 0.25);
      g.strokeRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
    }

    // Mercy's shadow strings holding the arrow.
    if (state.glideTime > 0) {
      g.lineStyle(1, 0x8a3fff, 0.5 + Math.sin(time * 8) * 0.2);
      g.lineBetween(x - 6, y - 11, x - 1, y - 2);
      g.lineBetween(x + 6, y - 11, x + 1, y - 2);
      g.lineStyle(1, 0xc98aff, 0.6);
      g.lineBetween(x, y - 13, x, y - 3);
    }

    // Light-as-air motes.
    if (state.lowGravTime > 0 && Math.floor(time * 12) % 2 === 0) {
      g.fillStyle(0x7de8ff, 0.7);
      g.fillRect(Math.round(x + Math.sin(time * 5) * 7), Math.round(y - 8), 1, 1);
    }

    if (state.phase === 'aim') this.drawAimGuide(state, x, y, g);
    if (state.phase === 'fly' && this.showSpeedLines) this.drawSpeedLines(state, g, dt);
  }

  private drawAimGuide(
    state: SimState,
    x: number,
    y: number,
    g: Phaser.GameObjects.Graphics,
  ): void {
    const palette = CHARACTERS[state.character].palette;
    const color = Phaser.Display.Color.HexStringToColor(palette.glow).color;
    const ax = Math.cos(state.angle);
    const ay = Math.sin(state.angle);
    for (let i = 6; i < 34; i += 5) {
      g.fillStyle(color, 1 - (i - 6) / 40);
      g.fillRect(Math.round(x + ax * i), Math.round(y + ay * i), 2, 2);
    }
    g.fillStyle(0xffffff, 1);
    g.fillRect(Math.round(x + ax * 36 - 1), Math.round(y + ay * 36 - 1), 3, 3);
  }

  private drawSpeedLines(state: SimState, g: Phaser.GameObjects.Graphics, dt: number): void {
    const speed = Math.hypot(state.vx, state.vy);
    const f = FEEL.speedLines;
    if (speed < f.startSpeed) return;
    const alpha = Math.min(
      f.maxAlpha,
      ((speed - f.startSpeed) / (f.fullSpeed - f.startSpeed)) * f.maxAlpha,
    );
    g.fillStyle(0xffffff, alpha);
    for (const s of this.streaks) {
      s.x -= speed * dt * 0.55;
      if (s.x < -24) {
        s.x = WORLD.viewWidth + 10;
        s.y = Math.random() * WORLD.viewHeight;
      }
      g.fillRect(Math.round(s.x), Math.round(s.y), s.length, 1);
    }
  }

  // ------------------------------------------------------------------ flag

  drawRecordFlag(recordDistance: number, camX: number, camY: number, hidden: boolean): void {
    if (!recordDistance || hidden) {
      this.flagLabel.setVisible(false);
      return;
    }
    const fx = recordDistance * WORLD.pxPerMeter + WORLD.shipX - camX;
    const gy = WORLD.groundY - camY;
    if (fx < -12 || fx > WORLD.viewWidth + 12 || gy > WORLD.viewHeight + 10) {
      this.flagLabel.setVisible(false);
      return;
    }
    this.overlay.fillStyle(0x7dffb0, 1);
    this.overlay.fillRect(Math.round(fx), Math.round(gy - 24), 1, 24);
    this.overlay.fillRect(Math.round(fx + 1), Math.round(gy - 24), 8, 5);
    // PixelText anchors from the top, where the old text object anchored from
    // its baseline, so the label height comes off the y here.
    this.flagLabel.setPosition(Math.round(fx + 4), Math.round(gy - 26) - this.flagLabel.height);
    this.flagLabel.setVisible(true);
  }

  destroy(): void {
    this.ship.destroy();
    this.crew.destroy();
    this.projectile.destroy();
    this.trail.destroy();
    this.overlay.destroy();
    this.flagLabel.destroy();
  }
}
