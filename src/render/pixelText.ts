import Phaser from 'phaser';
import { FONT } from './sheets';

/**
 * A line of text drawn from the bitmap face.
 *
 * Replaces `scene.add.text` everywhere inside the canvas. A system font cannot
 * work at this resolution: the game draws into a 320x180 framebuffer, so a 6px
 * label is a handful of anti-aliased pixels that the scale manager then
 * magnifies with nearest-neighbour filtering. The face in assets/sprites/font.png
 * places every pixel by hand instead, and survives any integer zoom unchanged.
 *
 * Two things this wrapper owns that a bare BitmapText does not:
 *
 * **Shadow.** The old text objects used a 1px stroke to hold small labels
 * against a bright sky. A bitmap font has no stroke, and baking a rim into the
 * glyphs would take the tint along with the letterform, so contrast comes from
 * a second copy offset by one pixel and tinted dark. It is created only when
 * asked for.
 *
 * **Alignment.** The face is fixed-width, so a run's width is exactly
 * `length * cellWidth * scale`. Positioning off that is exact and needs no
 * bounds recalculation, which is what BitmapText's own origin handling would
 * otherwise cost on every setText.
 */

export const SHADOW_TINT = 0x0a0f24;

export interface PixelTextOptions {
  depth: number;
  /** Whole-number magnification only; fractional values reintroduce shimmer. */
  scale?: number;
  /** 0 left, 0.5 centred, 1 right-aligned on the anchor x. */
  originX?: number;
  tint?: number;
  /** Draw a one-pixel dark copy behind the glyphs. Default true. */
  shadow?: boolean;
  /** Default 0, i.e. pinned to the camera like the rest of the HUD. */
  scrollFactor?: number;
}

export class PixelText {
  private face: Phaser.GameObjects.BitmapText;
  private shadow: Phaser.GameObjects.BitmapText | null = null;
  private anchorX: number;
  private anchorY: number;
  private originX: number;
  private scale: number;
  private currentTint: number;
  private currentText = '';
  private longestLine = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: PixelTextOptions) {
    const {
      depth,
      scale = 1,
      originX = 0,
      tint = 0xffffff,
      shadow = true,
      scrollFactor = 0,
    } = options;

    this.anchorX = x;
    this.anchorY = y;
    this.originX = originX;
    this.scale = scale;
    this.currentTint = tint;

    if (shadow) {
      this.shadow = scene.add
        .bitmapText(x, y, FONT.key, '')
        .setDepth(depth)
        .setScrollFactor(scrollFactor)
        .setScale(scale)
        .setTint(SHADOW_TINT);
    }

    // Added after the shadow so it wins at equal depth.
    this.face = scene.add
      .bitmapText(x, y, FONT.key, '')
      .setDepth(depth)
      .setScrollFactor(scrollFactor)
      .setScale(scale)
      .setTint(tint);

    // Only affects runs containing a newline; `layout` handles the block as a
    // whole, this aligns the lines within it.
    if (originX === 0.5) {
      this.face.setCenterAlign();
      this.shadow?.setCenterAlign();
    } else if (originX === 1) {
      this.face.setRightAlign();
      this.shadow?.setRightAlign();
    }

    this.layout();
  }

  /**
   * Rendered width in world pixels. Exact — the face is fixed-width — and for
   * multi-line runs it is the longest line, matching how the renderer lays them
   * out.
   */
  get width(): number {
    return this.longestLine * FONT.cellWidth * this.scale;
  }

  get height(): number {
    const lines = this.currentText.length === 0 ? 0 : this.currentText.split('\n').length;
    return (lines === 0 ? 0 : (lines - 1) * FONT.cellHeight + FONT.glyphHeight) * this.scale;
  }

  setText(value: string): this {
    if (value === this.currentText) return this;
    this.currentText = value;
    this.longestLine = value
      .split('\n')
      .reduce((longest, line) => Math.max(longest, line.length), 0);
    this.face.setText(value);
    this.shadow?.setText(value);
    this.layout();
    return this;
  }

  setTint(value: number): this {
    if (value === this.currentTint) return this;
    this.currentTint = value;
    this.face.setTint(value);
    return this;
  }

  setPosition(x: number, y: number): this {
    this.anchorX = x;
    this.anchorY = y;
    this.layout();
    return this;
  }

  setVisible(value: boolean): this {
    this.face.setVisible(value);
    this.shadow?.setVisible(value);
    return this;
  }

  setAlpha(value: number): this {
    this.face.setAlpha(value);
    this.shadow?.setAlpha(value);
    return this;
  }

  destroy(): void {
    this.face.destroy();
    this.shadow?.destroy();
    this.shadow = null;
  }

  /** Snap to whole pixels: a glyph on a half pixel is the shimmer this avoids. */
  private layout(): void {
    const x = Math.round(this.anchorX - this.width * this.originX);
    const y = Math.round(this.anchorY);
    this.face.setPosition(x, y);
    this.shadow?.setPosition(x + this.scale, y + this.scale);
  }
}

/**
 * Registers the face with the bitmap-font cache. Must run before any PixelText
 * is constructed, and after the texture has loaded.
 */
export function registerPixelFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.has(FONT.key)) return;
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: FONT.key,
    width: FONT.cellWidth,
    height: FONT.cellHeight,
    chars: FONT.chars,
    charsPerRow: FONT.columns,
    // Phaser declares these as flat dotted keys, not nested objects.
    'offset.x': 0,
    'offset.y': 0,
    // The gutter is already inside the cell, so no extra advance is added here.
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 0,
  });
  scene.cache.bitmapFont.add(FONT.key, data);
}
