import Phaser from 'phaser';
import { CHARACTERS } from '@/data/characters';
import { LAUNCH, PHYSICS } from '@/data/physics';
import { formatDistance } from '@/data/scoring';
import { WORLD, altitudeMeters } from '@/data/world';
import type { SimState } from '@/sim/types';

interface EffectLine {
  label: string;
  color: string;
}

/**
 * In-flight heads-up display, drawn at the logical 320x180 resolution so it sits
 * pixel-aligned with the world.
 *
 * Text objects are created once and mutated: rebuilding them per frame is the
 * single easiest way to stall a Phaser scene.
 */
export class Hud {
  private distance: Phaser.GameObjects.Text;
  private score: Phaser.GameObjects.Text;
  private speed: Phaser.GameObjects.Text;
  private altitude: Phaser.GameObjects.Text;
  private best: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private effects: Phaser.GameObjects.Text[] = [];
  private pips: Phaser.GameObjects.Graphics;
  private meter: Phaser.GameObjects.Graphics;
  private meterLabel: Phaser.GameObjects.Text;
  private all: Phaser.GameObjects.GameObject[] = [];
  private visible = true;

  constructor(scene: Phaser.Scene, depth: number) {
    const mono = (size: number, color: string, bold = false) => ({
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
      stroke: '#0a0f24',
      // A one-pixel rim is enough to hold small text against a bright sky; a
      // heavier stroke swallows the glyphs at this size.
      strokeThickness: bold ? 2 : 1,
    });
    const make = (
      x: number,
      y: number,
      style: Phaser.Types.GameObjects.Text.TextStyle,
      originX = 0,
    ) => {
      const t = scene.add
        .text(x, y, '', style)
        .setDepth(depth)
        .setScrollFactor(0)
        .setOrigin(originX, 0)
        .setResolution(1);
      this.all.push(t);
      return t;
    };

    this.distance = make(WORLD.viewWidth / 2, 5, mono(11, '#ffffff', true), 0.5);
    this.score = make(4, 5, mono(7, '#dfe6ff'));
    this.speed = make(4, 14, mono(7, '#dfe6ff'));
    this.altitude = make(4, 23, mono(7, '#dfe6ff'));
    this.best = make(WORLD.viewWidth - 4, 15, mono(6, '#8fa0d0'), 1);
    this.hint = make(WORLD.viewWidth - 4, 24, mono(6, '#8fa0d0'), 1);
    this.banner = make(WORLD.viewWidth / 2, 30, mono(9, '#ccccee', true), 0.5);
    this.meterLabel = make(WORLD.viewWidth / 2, WORLD.viewHeight - 27, mono(6, '#dfe6ff'), 0.5);

    for (let i = 0; i < 5; i++) {
      this.effects.push(make(4, 34 + i * 9, mono(6, '#ffffff')));
    }

    this.pips = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.meter = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this.all.push(this.pips, this.meter);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const o of this.all) {
      (o as Phaser.GameObjects.Text).setVisible(visible);
    }
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
    if (state.surge) lines.push({ label: `BLACKFLAME ${state.surge.timeLeft.toFixed(1)}s`, color: '#ff7733' });
    if (state.glideTime > 0) lines.push({ label: `STRINGS ${state.glideTime.toFixed(1)}s`, color: '#c98aff' });
    if (state.seek) {
      lines.push({
        label: state.seek.lockedId !== null ? 'LOCKED' : 'HUNTING…',
        color: '#ffffff',
      });
    }
    if (state.shieldTime > 0) lines.push({ label: `SHIELD ${state.shieldTime.toFixed(1)}s`, color: '#ffd876' });
    if (state.lowGravTime > 0) lines.push({ label: `LIGHT ${state.lowGravTime.toFixed(1)}s`, color: '#7de8ff' });

    for (let i = 0; i < this.effects.length; i++) {
      const line = lines[i];
      if (line) {
        this.effects[i].setText(line.label).setColor(line.color).setVisible(true);
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
    this.meter.fillStyle(
      perfect ? 0xffd876 : Phaser.Display.Color.HexStringToColor(glow).color,
      1,
    );
    this.meter.fillRect(x, y, Math.round(width * state.meter), 6);
    // The gold mark is the whole skill expression of the launch; it stays fully
    // opaque even under the fill so it is never ambiguous.
    this.meter.fillStyle(0xffd876, 1);
    this.meter.fillRect(x + Math.round(width * LAUNCH.perfectThreshold), y - 2, 1, 10);

    this.meterLabel.setVisible(true);
    this.meterLabel.setText(
      showAimHint && !state.charging ? 'HOLD TO CHARGE · DRAG TO AIM' : 'POWER',
    );
    this.meterLabel.setColor(showAimHint && !state.charging ? '#ffd876' : '#dfe6ff');
  }

  destroy(): void {
    for (const o of this.all) o.destroy();
    this.effects.length = 0;
    this.all.length = 0;
  }
}
