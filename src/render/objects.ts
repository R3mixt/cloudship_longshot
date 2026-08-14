import Phaser from 'phaser';
import { WORLD } from '@/data/world';
import type { WorldObject } from '@/sim/types';
import { ANIM, TEX } from './keys';

/**
 * Visual reference radius per object kind: the world radius at which the sprite
 * should render at 1:1. Scaling from this keeps the drawn size honest against
 * the collision radius, which matters because the player reads danger and
 * reward from apparent size.
 */
const REFERENCE = {
  bird: 9,
  rare: 10,
  armor: 11,
  tmc: 11,
  aura: 11,
  orb: 5,
} as const;

interface Slot {
  sprite: Phaser.GameObjects.Sprite;
  objectId: number;
}

/**
 * Pooled sprite renderer for world objects.
 *
 * Sprites are recycled by object id rather than recreated: an endless world
 * streams objects continuously, and allocating a Phaser GameObject per bird
 * would guarantee a stutter every few seconds.
 */
export class ObjectRenderer {
  private pool: Slot[] = [];
  private scene: Phaser.Scene;
  private depth: number;
  private reticle: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.reticle = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);
  }

  private acquire(index: number): Slot {
    let slot = this.pool[index];
    if (!slot) {
      const sprite = this.scene.add
        .sprite(0, 0, TEX.birds, 0)
        .setDepth(this.depth)
        .setScrollFactor(0)
        .setVisible(false);
      slot = { sprite, objectId: -1 };
      this.pool[index] = slot;
    }
    return slot;
  }

  update(
    objects: WorldObject[],
    camX: number,
    camY: number,
    time: number,
    lockedId: number | null,
  ): void {
    const { viewWidth: VW, viewHeight: VH } = WORLD;
    let used = 0;

    for (const o of objects) {
      if (!o.alive) continue;
      const sx = o.x - camX;
      const sy = o.y - camY;
      const margin = Math.max(o.r, o.rx, o.w) + 48;
      if (sx < -margin || sx > VW + margin || sy < -margin || sy > VH + margin) continue;

      const slot = this.acquire(used++);
      const s = slot.sprite;
      s.setVisible(true);
      s.setAlpha(1);
      s.setAngle(0);
      s.setFlipX(false);
      s.setOrigin(0.5, 0.5);
      s.clearTint();

      switch (o.kind) {
        case 'bird': {
          const species = (o.species ?? 0) % 4;
          this.playAnim(s, TEX.birds, ANIM.birdFly(species), slot, o.id);
          s.setScale(o.r / REFERENCE.bird);
          s.setPosition(Math.round(sx), Math.round(sy));
          break;
        }
        case 'rare':
          this.playAnim(s, TEX.birdGolden, ANIM.goldenFly, slot, o.id);
          s.setScale((o.r * 1.15) / REFERENCE.rare);
          s.setPosition(Math.round(sx), Math.round(sy));
          break;
        case 'armor':
          this.playAnim(s, TEX.birdArmored, ANIM.armorFly, slot, o.id);
          s.setScale(o.r / REFERENCE.armor);
          s.setPosition(Math.round(sx), Math.round(sy));
          break;
        case 'orb':
          this.playAnim(s, TEX.orb, ANIM.orbIdle, slot, o.id);
          s.setScale(o.r / REFERENCE.orb);
          s.setPosition(Math.round(sx), Math.round(sy));
          s.setAlpha(0.75 + Math.sin(time * 6 + o.phase) * 0.25);
          break;
        case 'tmc':
          this.playAnim(s, TEX.tmc, ANIM.tmcIdle, slot, o.id);
          s.setScale(o.r / REFERENCE.tmc);
          s.setPosition(Math.round(sx), Math.round(sy + Math.sin(time * 3 + o.phase) * 2));
          break;
        case 'aura': {
          const variant = o.variant ?? 'charge';
          this.playAnim(s, TEX.aura, ANIM.auraIdle(variant), slot, o.id);
          s.setScale(o.r / REFERENCE.aura);
          s.setPosition(Math.round(sx), Math.round(sy + Math.sin(time * 2.2 + o.phase) * 1.5));
          break;
        }
        case 'storm':
          this.playAnim(s, TEX.storm, ANIM.stormIdle, slot, o.id);
          // Storms are the one object whose collision volume is an ellipse, so
          // the sprite is stretched on both axes to match it exactly.
          s.setScale((o.rx * 2) / 60, (o.ry * 2) / 34);
          s.setPosition(Math.round(sx), Math.round(sy));
          break;
        case 'pad': {
          this.playAnim(s, TEX.pad, ANIM.padIdle, slot, o.id);
          s.setOrigin(0, 1);
          s.setScale(o.w / 44, 1);
          s.setPosition(Math.round(o.x - camX), Math.round(WORLD.groundY - camY + 2));
          break;
        }
        case 'spike': {
          this.stopAnim(s, slot, o.id);
          s.setTexture(TEX.spike, (o.species ?? 0) % 4);
          s.setOrigin(0, 1);
          s.setScale(o.w / 56, Math.max(0.6, o.h / 20));
          s.setPosition(Math.round(o.x - camX), Math.round(WORLD.groundY - camY + 1));
          break;
        }
        default:
          s.setVisible(false);
          break;
      }
    }

    for (let i = used; i < this.pool.length; i++) {
      this.pool[i].sprite.setVisible(false);
      this.pool[i].objectId = -1;
    }

    this.drawReticle(objects, camX, camY, time, lockedId);
  }

  private playAnim(
    sprite: Phaser.GameObjects.Sprite,
    texture: string,
    animKey: string,
    slot: Slot,
    objectId: number,
  ): void {
    if (slot.objectId !== objectId || sprite.anims.currentAnim?.key !== animKey) {
      slot.objectId = objectId;
      if (this.scene.anims.exists(animKey)) {
        sprite.play({ key: animKey, startFrame: objectId % 4 }, true);
      } else {
        sprite.setTexture(texture, 0);
      }
    }
  }

  private stopAnim(sprite: Phaser.GameObjects.Sprite, slot: Slot, objectId: number): void {
    if (sprite.anims.isPlaying) sprite.anims.stop();
    slot.objectId = objectId;
  }

  /** Blinking lock-on brackets around the seeker's current prey. */
  private drawReticle(
    objects: WorldObject[],
    camX: number,
    camY: number,
    time: number,
    lockedId: number | null,
  ): void {
    this.reticle.clear();
    if (lockedId === null) return;
    const target = objects.find((o) => o.id === lockedId && o.alive);
    if (!target) return;

    const x = Math.round(target.x - camX);
    const y = Math.round(target.y - camY);
    const r = Math.round(target.r + 4);
    this.reticle.fillStyle(0xffffff, 0.7 + Math.sin(time * 20) * 0.3);
    for (const [dx, dy, fx, fy] of [
      [-r, -r, 1, 1],
      [r, -r, -1, 1],
      [-r, r, 1, -1],
      [r, r, -1, -1],
    ]) {
      this.reticle.fillRect(x + dx, y + dy, 3 * fx, 1);
      this.reticle.fillRect(x + dx, y + dy, 1, 3 * fy);
    }
  }

  clear(): void {
    for (const slot of this.pool) {
      slot.sprite.setVisible(false);
      slot.objectId = -1;
    }
    this.reticle.clear();
  }

  destroy(): void {
    for (const slot of this.pool) slot.sprite.destroy();
    this.pool.length = 0;
    this.reticle.destroy();
  }
}
