import Phaser from 'phaser';
import { CHARACTERS } from '@/data/characters';
import { AURA_COLORS } from '@/data/objects';
import { TEX } from './keys';
import { AURA_ROWS, CHARACTER_ROWS, SHEETS, type SheetSpec } from './sheets';

/**
 * Draws stand-in artwork for any spritesheet that failed to load.
 *
 * These are shaped like the real sprites — same dimensions, same frame layout,
 * same silhouettes — so the game is fully playable and correctly tuned whether
 * or not the finished art is present. A missing file degrades the look, never
 * the behaviour.
 */
export function generatePlaceholders(scene: Phaser.Scene, missing: Set<string>): void {
  for (const spec of SHEETS) {
    if (!missing.has(spec.key)) continue;
    const canvas = scene.textures.createCanvas(
      spec.key,
      spec.frameWidth * spec.columns,
      spec.frameHeight * spec.rows,
    );
    if (!canvas) continue;
    const ctx = canvas.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx, spec);
    canvas.refresh();
    // Re-cut the canvas into frames so it behaves exactly like a loaded sheet.
    const texture = scene.textures.get(spec.key);
    texture.add('__base', 0, 0, 0, canvas.width, canvas.height);
    let index = 0;
    for (let row = 0; row < spec.rows; row++) {
      for (let col = 0; col < spec.columns; col++) {
        texture.add(
          index++,
          0,
          col * spec.frameWidth,
          row * spec.frameHeight,
          spec.frameWidth,
          spec.frameHeight,
        );
      }
    }
  }

  if (!scene.textures.exists(TEX.pixel)) {
    const px = scene.textures.createCanvas(TEX.pixel, 1, 1);
    if (px) {
      const ctx = px.getContext();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      px.refresh();
    }
  }
}

type Ctx = CanvasRenderingContext2D;

function draw(ctx: Ctx, spec: SheetSpec): void {
  const { frameWidth: w, frameHeight: h, columns, rows } = spec;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      ctx.save();
      ctx.translate(col * w, row * h);
      drawFrame(ctx, spec.key, w, h, col, row, columns);
      ctx.restore();
    }
  }
}

function drawFrame(
  ctx: Ctx,
  key: string,
  w: number,
  h: number,
  col: number,
  row: number,
  columns: number,
): void {
  const phase = (col / columns) * Math.PI * 2;
  switch (key) {
    case TEX.birds:
      bird(ctx, w, h, phase, '#d8d0c2', '#a8a092', row);
      return;
    case TEX.birdGolden:
      glow(ctx, w, h, '#fff2c0', 0.35);
      bird(ctx, w, h, phase, '#ffd876', '#e0b040', 0);
      return;
    case TEX.birdArmored:
      bird(ctx, w, h, phase, '#7a7a92', '#5a5a72', 1);
      rect(ctx, w * 0.34, h * 0.42, w * 0.3, h * 0.1, '#9a9ab4');
      rect(ctx, w * 0.4, h * 0.32, w * 0.18, h * 0.08, '#9a9ab4');
      return;
    case TEX.characters:
      character(ctx, w, h, col, row);
      return;
    case TEX.projectiles: {
      const id = CHARACTER_ROWS[row] ?? 'lindon';
      const pal = CHARACTERS[id].palette;
      projectile(ctx, w, h, phase, pal.projectile, pal.glow);
      return;
    }
    case TEX.projectilesSurge:
      projectile(ctx, w, h, phase, '#2a1005', '#ff7733');
      rect(ctx, w * 0.25, h * 0.36, w * 0.5, 2, '#ff4422');
      rect(ctx, w * 0.25, h * 0.58, w * 0.5, 2, '#ff4422');
      return;
    case TEX.feathers:
      feather(ctx, w, h, col, ['#e8dcc8', '#ffd876', '#9a9ab4', '#ffffff'][row] ?? '#e8dcc8');
      return;
    case TEX.pad:
      pad(ctx, w, h, phase);
      return;
    case TEX.tmc:
      tmc(ctx, w, h, phase);
      return;
    case TEX.aura:
      aura(ctx, w, h, phase, AURA_ROWS[row] ?? 'charge');
      return;
    case TEX.storm:
      storm(ctx, w, h, col);
      return;
    case TEX.spike:
      spike(ctx, w, h, col);
      return;
    case TEX.orb:
      orb(ctx, w, h, phase);
      return;
    case TEX.cloudship:
      cloudship(ctx, w, h, col);
      return;
    case TEX.groundTiles:
      groundTile(ctx, w, h, col);
      return;
    case TEX.clouds:
      cloud(ctx, w, h, col);
      return;
    case TEX.mountains:
      mountains(ctx, w, h);
      return;
    default:
      return;
  }
}

// ------------------------------------------------------------------ helpers

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function glow(ctx: Ctx, w: number, h: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  rect(ctx, w * 0.1, h * 0.25, w * 0.8, h * 0.5, color);
  ctx.globalAlpha = 1;
}

function bird(ctx: Ctx, w: number, h: number, phase: number, body: string, wing: string, species: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const s = Math.min(w, h) * 0.34;
  const flap = Math.sin(phase) * s * 0.5;
  // Species differ mainly in wing span and tail, which is what separates the
  // silhouettes at speed.
  const span = [1.0, 0.75, 1.15, 0.9][species % 4];
  const tail = [0.3, 0.2, 0.45, 0.35][species % 4];

  rect(ctx, cx - s * 0.6, cy - s * 0.22, s * 1.2, s * 0.45, body);
  rect(ctx, cx - s * 0.95, cy - s * 0.18, s * 0.35, s * 0.35, body);
  rect(ctx, cx - s * 1.1, cy - s * 0.05, s * 0.18, s * 0.12, '#e0a040');
  rect(ctx, cx - s * 0.3, cy - s * 0.3 - flap, s * 0.75 * span, s * 0.2, wing);
  rect(ctx, cx - s * 0.3, cy + s * 0.12 + flap, s * 0.75 * span, s * 0.2, wing);
  rect(ctx, cx + s * 0.5, cy - s * 0.15, s * tail, s * 0.3, wing);
  rect(ctx, cx - s * 0.85, cy - s * 0.12, 1, 1, '#1a1a22');
}

function character(ctx: Ctx, w: number, h: number, col: number, row: number): void {
  const id = CHARACTER_ROWS[row] ?? 'lindon';
  const pal = CHARACTERS[id].palette;
  const bob = col >= 2 && col <= 3 ? 1 : 0;
  const cx = w / 2;
  const base = h - 2 - bob;

  rect(ctx, cx - 4, base - 8, 3, 8, '#3a3f4d');
  rect(ctx, cx + 1, base - 8, 3, 8, '#3a3f4d');
  rect(ctx, cx - 5, base - 18, 10, 10, '#3a3f4d');
  rect(ctx, cx - 5, base - 13, 10, 2, pal.glow);
  rect(ctx, cx - 4, base - 24, 8, 6, '#e8c39a');
  rect(ctx, cx - 4, base - 25, 8, 2, id === 'eithan' ? '#e8d44a' : '#2a2018');
  if (id === 'lindon') rect(ctx, cx + 4, base - 17, 2, 7, '#e8e8f0');
  if (col === 4) glow(ctx, w, h, pal.glow, 0.4);
}

function projectile(ctx: Ctx, w: number, h: number, phase: number, body: string, glowColor: string): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.19 + Math.sin(phase) * 0.6;
  ctx.globalAlpha = 0.5;
  rect(ctx, cx - r - 2, cy - r - 2, (r + 2) * 2, (r + 2) * 2, glowColor);
  ctx.globalAlpha = 1;
  rect(ctx, cx - r, cy - r, r * 2, r * 2, body);
  rect(ctx, cx - 1, cy - 1, 2, 2, '#ffffff');
}

function feather(ctx: Ctx, w: number, h: number, shape: number, color: string): void {
  const cy = h / 2;
  const len = 3 + (shape % 3);
  rect(ctx, w / 2 - len / 2, cy - 1, len, 2, color);
  rect(ctx, w / 2 - len / 2, cy - 2, Math.max(1, len - 2), 1, '#ffffff');
}

function pad(ctx: Ctx, w: number, h: number, phase: number): void {
  const pulse = 0.7 + Math.sin(phase) * 0.3;
  ctx.globalAlpha = 0.3 * pulse;
  rect(ctx, 2, h - 20, w - 4, 14, '#57e08c');
  ctx.globalAlpha = 1;
  rect(ctx, 2, h - 6, w - 4, 4, '#57e08c');
  rect(ctx, 5, h - 8, w - 10, 2, '#a4ffcb');
  ctx.globalAlpha = pulse;
  rect(ctx, w / 2 - 1, h - 14, 2, 5, '#a4ffcb');
  rect(ctx, w * 0.28, h - 12, 2, 3, '#a4ffcb');
  rect(ctx, w * 0.7, h - 12, 2, 3, '#a4ffcb');
  ctx.globalAlpha = 1;
}

function tmc(ctx: Ctx, w: number, h: number, phase: number): void {
  const bob = Math.sin(phase) * 1.5;
  const cx = w / 2;
  const cy = h / 2 + bob;
  ctx.globalAlpha = 0.92;
  rect(ctx, cx - 11, cy - 4, 22, 8, '#9fd8ff');
  rect(ctx, cx - 7, cy - 8, 14, 5, '#c6e8ff');
  rect(ctx, cx - 15, cy - 1, 6, 5, '#9fd8ff');
  ctx.globalAlpha = 0.5;
  rect(ctx, cx - 11, cy + 4, 22, 2, '#dff4ff');
  ctx.globalAlpha = 1;
}

function aura(ctx: Ctx, w: number, h: number, phase: number, variant: string): void {
  const color = AURA_COLORS[variant as keyof typeof AURA_COLORS] ?? '#7dffb0';
  const cx = w / 2;
  const cy = h / 2;
  const pulse = 0.55 + Math.sin(phase) * 0.25;
  ctx.globalAlpha = pulse * 0.5;
  rect(ctx, cx - 13, cy - 8, 26, 16, color);
  ctx.globalAlpha = pulse;
  rect(ctx, cx - 9, cy - 5, 18, 10, color);
  rect(ctx, cx - 5, cy - 9, 10, 6, color);
  ctx.globalAlpha = 1;

  // Iconography carries the meaning so the three read apart without colour.
  const ink = '#0a1a14';
  if (variant === 'charge') {
    rect(ctx, cx - 1, cy - 4, 2, 8, ink);
    rect(ctx, cx - 4, cy - 1, 8, 2, ink);
  } else if (variant === 'shield') {
    rect(ctx, cx - 3, cy - 4, 6, 5, ink);
    rect(ctx, cx - 2, cy + 1, 4, 2, ink);
    rect(ctx, cx - 1, cy + 3, 2, 1, ink);
  } else {
    rect(ctx, cx - 3, cy + 2, 6, 1, ink);
    rect(ctx, cx - 3, cy - 1, 6, 1, ink);
    rect(ctx, cx - 3, cy - 4, 6, 1, ink);
    rect(ctx, cx - 1, cy - 5, 2, 1, ink);
  }
}

function storm(ctx: Ctx, w: number, h: number, frame: number): void {
  const cx = w / 2;
  const cy = h / 2;
  ctx.globalAlpha = 0.88;
  rect(ctx, cx - 30, cy - 8, 60, 16, '#3a3f52');
  rect(ctx, cx - 21, cy - 15, 42, 10, '#454b62');
  rect(ctx, cx - 15, cy + 6, 30, 6, '#30354a');
  rect(ctx, cx - 27, cy - 3, 12, 8, '#454b62');
  ctx.globalAlpha = 1;
  if (frame % 3 === 0) {
    rect(ctx, cx - 2 + ((frame * 5) % 12) - 6, cy + 9, 2, 7, '#ffe9a0');
  }
}

function spike(ctx: Ctx, w: number, h: number, variant: number): void {
  const base = h - 1;
  const count = 3 + (variant % 3);
  const width = w - 8;
  ctx.fillStyle = '#5a5e78';
  for (let i = 0; i < count; i++) {
    const sx = 4 + i * (width / count);
    const sw = width / count;
    const sh = 14 + ((i * 7 + variant * 5) % 16);
    ctx.beginPath();
    ctx.moveTo(sx, base);
    ctx.lineTo(sx + sw / 2, base - sh);
    ctx.lineTo(sx + sw, base);
    ctx.fill();
    rect(ctx, sx + sw / 2 - 1, base - sh + 2, 1, 5, '#a8adcc');
  }
}

function orb(ctx: Ctx, w: number, h: number, phase: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = 3 + Math.sin(phase) * 0.8;
  ctx.globalAlpha = 0.75;
  rect(ctx, cx - r, cy - r, r * 2, r * 2, '#9fd8ff');
  rect(ctx, cx - 1, cy - r - 2, 2, r * 2 + 4, '#cfeaff');
  rect(ctx, cx - r - 2, cy - 1, r * 2 + 4, 2, '#cfeaff');
  ctx.globalAlpha = 1;
}

function cloudship(ctx: Ctx, w: number, h: number, frame: number): void {
  const y = h * 0.4;
  rect(ctx, 10, y + 14, w - 20, 16, '#4a3b2a');
  rect(ctx, 10, y + 10, w - 20, 5, '#6b5638');
  rect(ctx, 20, y + 30, w - 40, 6, '#3a2e20');
  for (let i = 0; i < 12; i++) rect(ctx, 16 + i * 13, y + 4, 2, 7, '#6b5638');
  rect(ctx, 14, y + 2, w - 28, 2, '#8a7048');
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 6; i++) {
    rect(ctx, 14 + i * 26, y + 36 + Math.sin(frame * 1.6 + i) * 2, 20, 6, '#becdff');
  }
  ctx.globalAlpha = 1;
}

function groundTile(ctx: Ctx, w: number, h: number, index: number): void {
  rect(ctx, 0, 0, w, h, '#4d6a3a');
  rect(ctx, 0, 0, w, 3, '#6d8f52');
  if (index % 4 === 1) {
    rect(ctx, 3, h - 14, 4, 3, '#6a6f88');
  } else if (index % 4 === 2) {
    rect(ctx, 2, 0, 1, -3, '#7da45e');
  } else if (index % 4 === 3) {
    rect(ctx, 6, 8, 4, 2, '#3d5230');
  }
}

function cloud(ctx: Ctx, w: number, h: number, index: number): void {
  const y = h / 2;
  const width = 30 + index * 5;
  ctx.globalAlpha = 0.95;
  rect(ctx, (w - width) / 2, y - 4, width, 9, '#7591c6');
  rect(ctx, (w - width) / 2 + 8, y - 8, width * 0.6, 5, '#8ea6d4');
  rect(ctx, (w - width) / 2 - 4, y + 2, width + 8, 6, '#6b86bb');
  ctx.globalAlpha = 1;
}

function mountains(ctx: Ctx, _w: number, h: number): void {
  ctx.fillStyle = '#33406e';
  for (let i = 0; i < 6; i++) {
    const bx = i * 48 - 20;
    const peak = 45 + ((i * 37) % 40);
    ctx.beginPath();
    ctx.moveTo(bx, h);
    ctx.lineTo(bx + 24, h - peak);
    ctx.lineTo(bx + 52, h);
    ctx.fill();
  }
}
