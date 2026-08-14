import Phaser from 'phaser';
import { ANIM, TEX } from '@/render/keys';
import { registerPixelFont } from '@/render/pixelText';
import { generateFontFallback, generatePlaceholders } from '@/render/placeholders';
import { AURA_ROWS, CHARACTER_ROWS, FONT, FRAME_RATES, SHEETS } from '@/render/sheets';
import { GAME_SCENE, type GameSceneData } from './gameScene';

export const PRELOAD_SCENE = 'preload';

/**
 * Loads the sprite atlas and registers every animation.
 *
 * A failed sheet is replaced with generated stand-in artwork of identical
 * dimensions rather than being allowed to break the run — the game must always
 * boot, even from a partially deployed asset directory.
 */
export class PreloadScene extends Phaser.Scene {
  private missing = new Set<string>();

  constructor() {
    super(PRELOAD_SCENE);
  }

  preload(): void {
    this.load.setBaseURL(import.meta.env.BASE_URL);

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.missing.add(file.key);
    });

    for (const sheet of SHEETS) {
      this.load.spritesheet(sheet.key, sheet.file, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }

    // Plain image, not a spritesheet: RetroFont.Parse cuts the grid itself.
    this.load.image(FONT.key, FONT.file);
  }

  create(): void {
    generatePlaceholders(this, this.missing);
    if (this.missing.has(FONT.key)) generateFontFallback(this);
    // Must precede any scene that builds a PixelText.
    registerPixelFont(this);
    this.registerAnimations();

    const splash = document.getElementById('boot-splash');
    if (splash) {
      splash.classList.add('gone');
      splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    }

    const sceneData = this.registry.get('gameSceneData') as GameSceneData | undefined;
    if (sceneData) this.scene.start(GAME_SCENE, sceneData);
  }

  private registerAnimations(): void {
    const sheet = (key: string) => SHEETS.find((s) => s.key === key);

    const row = (key: string, rowIndex: number, count?: number): number[] => {
      const spec = sheet(key);
      if (!spec) return [0];
      const start = rowIndex * spec.columns;
      const length = Math.min(count ?? spec.columns, spec.columns);
      return Array.from({ length }, (_, i) => start + i);
    };

    const define = (key: string, texture: string, frames: number[], frameRate: number): void => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: texture, frame })),
        frameRate,
        repeat: -1,
      });
    };

    for (let species = 0; species < 4; species++) {
      define(ANIM.birdFly(species), TEX.birds, row(TEX.birds, species), FRAME_RATES.birdFly);
    }
    define(ANIM.goldenFly, TEX.birdGolden, row(TEX.birdGolden, 0), FRAME_RATES.goldenFly);
    define(ANIM.armorFly, TEX.birdArmored, row(TEX.birdArmored, 0), FRAME_RATES.armorFly);
    define(ANIM.padIdle, TEX.pad, row(TEX.pad, 0), FRAME_RATES.pad);
    define(ANIM.tmcIdle, TEX.tmc, row(TEX.tmc, 0), FRAME_RATES.tmc);
    define(ANIM.stormIdle, TEX.storm, row(TEX.storm, 0), FRAME_RATES.storm);
    define(ANIM.orbIdle, TEX.orb, row(TEX.orb, 0), FRAME_RATES.orb);
    define(ANIM.cloudshipIdle, TEX.cloudship, row(TEX.cloudship, 0), FRAME_RATES.cloudship);

    AURA_ROWS.forEach((variant, index) => {
      define(ANIM.auraIdle(variant), TEX.aura, row(TEX.aura, index), FRAME_RATES.aura);
    });

    CHARACTER_ROWS.forEach((id, index) => {
      define(
        ANIM.projectile(id),
        TEX.projectiles,
        row(TEX.projectiles, index),
        FRAME_RATES.projectile,
      );
      // Frames 0-1 are the idle pair; 2-3 are the charge anticipation.
      const base = index * 8;
      define(ANIM.characterIdle(id), TEX.characters, [base, base + 1], FRAME_RATES.characterIdle);
      define(
        ANIM.characterCharge(id),
        TEX.characters,
        [base + 2, base + 3],
        FRAME_RATES.characterCharge,
      );
    });

    define(
      ANIM.projectileSurge,
      TEX.projectilesSurge,
      row(TEX.projectilesSurge, 0),
      FRAME_RATES.projectileSurge,
    );
  }
}
