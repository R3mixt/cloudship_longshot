import Phaser from 'phaser';
import { CHARACTERS } from '@/data/characters';
import { LAUNCH, PHYSICS } from '@/data/physics';
import { formatDistance } from '@/data/scoring';
import { WORLD, altitudeMeters } from '@/data/world';
import type { SimState } from '@/sim/types';
import { PixelText } from './pixelText';

interface EffectLine {
  label: string;
  color: number;
}

const INK = 0xdfe6ff;
const DIM = 0x8fa0d0;
const GOLD = 0xffd876;

/**
 * In-flight heads-up display, drawn at the logical 320x180 resolution so it sits
 * pixel-aligned with the world.
 *
 * Text is the bitmap face rather than a system font: at this resolution a 6px
 * label rasterised from `monospace` is a few pixels of anti-aliasing, and the
 * scale manager then magnifies that with nearest-neighbour filtering. See
 * PixelText.
 *
 * Objects are created once and mutated: rebuilding them per frame is the single
 * easiest way to stall a Phaser scene.
 */
export class Hud {
  private distance: PixelText;
  private score: PixelText;
  private speed: PixelText;
  private altitude: PixelText;
  private best: PixelText;
  private hint: PixelText;
  private banner: PixelText;
  private effects: PixelText[] = [];
  private pips: Phaser.GameObjects.Graphics;
  private meter: Phaser.GameObjects.Graphics;
  private meterLabel: PixelText;
  private texts: PixelText[] = [];
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private visible = true;

  constructor(scene: Phaser.Scene, depth: number) {
    const make = (x: number, y: number, tint: number, originX = 0, scale = 1): PixelText => {
      const t = new PixelText(scene, x, y, { depth, tint, originX, scale });
      this.texts.push(t);
      return t;
    };

    // The distance readout is the one number the run is about, so it is the one
    // thing drawn at double scale.
    this.distance = make(WORLD.viewWidth / 2, 4, 0xffffff, 0.5, 2);
    this.score = make(4, 5, INK);
    this.speed = make(4, 14, INK);
    this.altitude = make(4, 23, INK);
    this.best = make(WORLD.viewWidth - 4, 21, DIM, 1);
    this.hint = make(WORLD.viewWidth - 4, 30, DIM, 1);
    this.banner = make(WORLD.viewWidth / 2, 34, 0xccccee, 0.5);
    this.meterLabel = make(WORLD.viewWidth / 2, WORLD.viewHeight - 27, INK, 0.5);

    for (let i = 0; i < 5; i++) {
      // Clear of the destroyer banner above; the face is wider per character
      // than the system font it replaces, so the columns need the separation.
      this.effects.push(make(4, 44 + i * 9, 0xffffff));
    }

    this.pips = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.meter = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.graphics.push(this.pips, this.meter);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const t of this.texts) t.setVisible(visible);
    for (const g of this.graphics) g.setVisible(visible);
  }

  update(state: SimState, recordDistance: number, showAimHint: boolean): void {
    if (!this.visible) return;
    const character = CHARACTERS[state.character];
    const glow = character.palette.glow;

    this.distance.setText(formatDistance(state.stats.distance));
    this.score.setText(`SCORE ${state.stats.score.toLocaleString()}`);
    this.speed.setText(`${Math.round(Math.hypot(state.vx, state.vy) / WORLD.pxPerMeter)} m/s`);
    this.altitude.setText(`ALT ${Math.max(0, Math.round(altitudeMeters(state.y)))}m`);

    this.best.setText(recordDistance > 0 ? `BEST ${formatDistance(recordDistance)}` : '');

    this.hint.setText(
      state.phase === 'fly' && state.charges > 0 && !state.isEithan
        ? `TAP = ${character.ability}`
        : '',
    );

    this.drawPips(state, glow);
    this.drawEffects(state);
    this.drawMeter(state, glow, showAimHint);

    this.banner.setVisible(state.destroyer);
    if (state.destroyer) {
      const flash = state.destroyerTime < 3 || Math.floor(state.destroyerTime * 3) % 2 === 0;
      this.banner.setText(flash ? 'THE DESTROYER HAS COME' : '');
    }
  }

  private drawPips(state: SimState, glow: string): void {
    this.pips.clear();
    if (state.isEithan) return;
    const max = PHYSICS.charges;
    const filled = Phaser.Display.Color.HexStringToColor(glow).color;
    for (let i = 0; i < max; i++) {
      this.pips.fillStyle(i < state.charges ? filled : 0x333c5c, 1);
      this.pips.fillRect(WORLD.viewWidth - 10 - i * 8, 5, 6, 6);
    }
  }

  private drawEffects(state: SimState): void {
    const lines: EffectLine[] = [];
    if (state.surge)
      lines.push({ label: `BLACKFLAME ${state.surge.timeLeft.toFixed(1)}s`, color: 0xff7733 });
    if (state.glideTime > 0)
      lines.push({ label: `STRINGS ${state.glideTime.toFixed(1)}s`, color: 0xc98aff });
    if (state.seek) {
      lines.push({
        label: state.seek.lockedId !== null ? 'LOCKED' : 'HUNTING…',
        color: 0xffffff,
      });
    }
    if (state.shieldTime > 0)
      lines.push({ label: `SHIELD ${state.shieldTime.toFixed(1)}s`, color: GOLD });
    if (state.lowGravTime > 0)
      lines.push({ label: `LIGHT ${state.lowGravTime.toFixed(1)}s`, color: 0x7de8ff });

    for (let i = 0; i < this.effects.length; i++) {
      const line = lines[i];
      if (line) {
        this.effects[i].setText(line.label).setTint(line.color).setVisible(true);
      } else {
        this.effects[i].setVisible(false);
      }
    }
  }

  private drawMeter(state: SimState, glow: string, showAimHint: boolean): void {
    this.meter.clear();
    if (state.phase !== 'aim') {
      this.meterLabel.setVisible(false);
      return;
    }

    const width = 60;
    const x = WORLD.viewWidth / 2 - width / 2;
    const y = WORLD.viewHeight - 16;

    this.meter.fillStyle(0x101830, 1);
    this.meter.fillRect(x - 1, y - 1, width + 2, 8);
    const perfect = state.meter >= LAUNCH.perfectThreshold;
    this.meter.fillStyle(perfect ? GOLD : Phaser.Display.Color.HexStringToColor(glow).color, 1);
    this.meter.fillRect(x, y, Math.round(width * state.meter), 6);
    // The gold mark is the whole skill expression of the launch; it stays fully
    // opaque even under the fill so it is never ambiguous.
    this.meter.fillStyle(GOLD, 1);
    this.meter.fillRect(x + Math.round(width * LAUNCH.perfectThreshold), y - 2, 1, 10);

    this.meterLabel.setVisible(true);
    this.meterLabel.setText(
      showAimHint && !state.charging ? 'HOLD TO CHARGE · DRAG TO AIM' : 'POWER',
    );
    this.meterLabel.setTint(showAimHint && !state.charging ? GOLD : INK);
  }

  destroy(): void {
    for (const t of this.texts) t.destroy();
    for (const g of this.graphics) g.destroy();
    this.effects.length = 0;
    this.texts.length = 0;
    this.graphics.length = 0;
  }
}
