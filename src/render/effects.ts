import Phaser from 'phaser';
import { FEEL } from '@/data/feel';
import { WORLD } from '@/data/world';
import { PixelText } from './pixelText';

export type ParticleKind = 'spark' | 'dust' | 'feather' | 'rock' | 'ember';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  kind: ParticleKind;
  phase: number;
  size: number;
}

interface Popup {
  active: boolean;
  x: number;
  y: number;
  time: number;
  text: PixelText;
}

const POPUP_GOLD = /GOLDEN|PERFECT|SURGE|FORMATION|MILE|CONSUME|SEEKER|STRINGS|SHIELD|MADRA|LIGHT/;

/**
 * Pooled particles and floating text.
 *
 * Everything is preallocated: a run can generate thousands of feathers and the
 * one thing that must never happen mid-flight is a garbage-collection pause, so
 * nothing here allocates after construction.
 */
export class EffectsRenderer {
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private nextParticle = 0;
  /** Scales particle counts; dropped by the reduced-effects setting. */
  intensity = 1;

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);

    for (let i = 0; i < FEEL.particles.max; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: 0xffffff,
        kind: 'spark',
        phase: 0,
        size: 2,
      });
    }

    for (let i = 0; i < 14; i++) {
      const text = new PixelText(scene, 0, 0, {
        depth: depth + 2,
        originX: 0.5,
      });
      text.setVisible(false);
      this.popups.push({ active: false, x: 0, y: 0, time: 0, text });
    }
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    life: number,
    kind: ParticleKind,
    size = 2,
  ): void {
    // Round-robin allocation: when the pool is saturated the oldest particles
    // are overwritten, which degrades gracefully instead of dropping the newest
    // (and most relevant) effect.
    const p = this.particles[this.nextParticle];
    this.nextParticle = (this.nextParticle + 1) % this.particles.length;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.color = color;
    p.kind = kind;
    p.phase = Math.random() * Math.PI * 2;
    p.size = size;
  }

  burst(
    x: number,
    y: number,
    count: number,
    color: number,
    kind: ParticleKind,
    speed: number,
    life: number,
  ): void {
    const n = Math.max(1, Math.round(count * this.intensity));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        color,
        life * (0.7 + Math.random() * 0.6),
        kind,
      );
    }
  }

  /** Feather burst: slow-falling, wobbling, with a few white highlight feathers. */
  feathers(x: number, y: number, count: number, color: number): void {
    const n = Math.max(2, Math.round(count * this.intensity));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 110;
      this.spawn(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s * 0.7 - 30,
        i % 4 === 0 ? 0xffffff : color,
        0.9 + Math.random() * 0.8,
        'feather',
        3,
      );
    }
    for (let i = 0; i < Math.round(8 * this.intensity); i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x, y, Math.cos(a) * 50, Math.sin(a) * 50, 0xffffff, 0.25, 'spark');
    }
  }

  popup(x: number, y: number, lines: string[]): void {
    let slot = this.popups.find((p) => !p.active);
    if (!slot) {
      // Steal the oldest so the newest event is always the one visible.
      slot = this.popups.reduce((a, b) => (a.time < b.time ? a : b));
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.time = FEEL.popup.lifetime;
    slot.text.setText(lines.join('\n'));
    slot.text.setTint(popupColor(lines[0]));
    slot.text.setVisible(true);
  }

  update(dt: number, camX: number, camY: number): void {
    const g = this.gfx;
    g.clear();
    const f = FEEL.particles;
    const { viewWidth: VW, viewHeight: VH } = WORLD;

    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'feather') {
        p.vy = Math.min(p.vy + f.featherGravity * dt, f.featherMaxFall);
        p.vx *= Math.max(0, 1 - f.featherDrag * dt);
      } else {
        p.vy += f.gravity * dt;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      const sx = p.x - camX;
      const sy = p.y - camY;
      if (sx < -12 || sx > VW + 12 || sy < -12 || sy > VH + 12) continue;

      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      if (p.kind === 'feather') {
        const wobble = Math.sin(p.phase + p.life * 10) * f.featherWobble;
        g.fillStyle(p.color, alpha);
        g.fillRect(Math.round(sx - 2 + wobble), Math.round(sy), 4, 2);
        g.fillStyle(0xffffff, alpha * 0.8);
        g.fillRect(Math.round(sx - 1 + wobble), Math.round(sy - 1), 2, 1);
      } else if (p.kind === 'rock') {
        g.fillStyle(p.color, alpha);
        g.fillRect(Math.round(sx - 1), Math.round(sy - 1), 3, 3);
      } else {
        g.fillStyle(p.color, alpha);
        g.fillRect(Math.round(sx - 1), Math.round(sy - 1), p.size, p.size);
      }
    }

    for (const p of this.popups) {
      if (!p.active) continue;
      p.time -= dt;
      if (p.time <= 0) {
        p.active = false;
        p.text.setVisible(false);
        continue;
      }
      const progress = 1 - p.time / FEEL.popup.lifetime;
      p.text.setPosition(
        Math.round(p.x - camX),
        Math.round(p.y - camY - progress * FEEL.popup.riseDistance),
      );
      p.text.setAlpha(Math.min(1, p.time * 1.6));
    }
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    for (const p of this.popups) {
      p.active = false;
      p.text.setVisible(false);
    }
    this.gfx.clear();
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.active) n++;
    return n;
  }

  destroy(): void {
    this.gfx.destroy();
    for (const p of this.popups) p.text.destroy();
  }
}

function popupColor(line: string | undefined): number {
  if (!line) return 0xffffff;
  if (line.startsWith('+')) return 0x7dffb0;
  if (line.includes('DESTROYER')) return 0xccccee;
  if (line.includes('IMPALED') || line.includes('DEFLECTED')) return 0xff7d7d;
  if (POPUP_GOLD.test(line)) return 0xffd876;
  return 0xffffff;
}
