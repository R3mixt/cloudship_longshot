import Phaser from 'phaser';
import { debug } from '@/core/debug';
import { save } from '@/core/save';
import { CHARACTERS, type CharacterId } from '@/data/characters';
import { WORLD } from '@/data/world';
import { GameScene, type GameSceneData } from '@/scenes/gameScene';
import { PRELOAD_SCENE, PreloadScene } from '@/scenes/preloadScene';
import type { Simulation } from '@/sim/simulation';
import type { AppApi, RunSummary, ScreenId, SoundFn, UiHandle } from './types';

/**
 * Owns the Phaser instance, the interface layer and the navigation between
 * them. Everything that crosses between the canvas and the DOM goes through
 * here, so neither side needs to know the other exists.
 */
export class AppController implements AppApi {
  readonly save = save;

  private game: Phaser.Game;
  private ui: UiHandle | null = null;
  private scene: GameScene | null = null;
  private character: CharacterId;
  private lastResults: RunSummary | null = null;
  private history: ScreenId[] = [];
  readonly playSound: SoundFn;
  private onIntensity: ((value: number) => void) | null = null;
  private intensityTimer = 0;

  constructor(parent: string, playSound: SoundFn) {
    this.playSound = playSound;
    this.character = save.get().lastCharacter;
    if (CHARACTERS[this.character].secret && !this.isEithanUnlocked()) this.character = 'lindon';
    if (debug.forceUnlock) save.setDevUnlock(true);

    const sceneData: GameSceneData = {
      character: this.character,
      playSound,
      onRunComplete: (sim) => this.handleRunComplete(sim),
      onPauseRequested: () => this.togglePause(),
      onReady: (scene) => {
        this.scene = scene;
        this.show('menu');
      },
    };

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: WORLD.viewWidth,
      height: WORLD.viewHeight,
      backgroundColor: '#070b1c',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      // Zoom is driven by the scale manager; FIT keeps the 16:9 logical frame
      // intact on every aspect ratio rather than cropping the world.
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: WORLD.viewWidth,
        height: WORLD.viewHeight,
      },
      input: { activePointers: 2 },
      fps: { target: 60, min: 30 },
      disableContextMenu: true,
      scene: [PreloadScene, GameScene],
    });

    this.game.registry.set('gameSceneData', sceneData);
    this.game.scene.start(PRELOAD_SCENE);
  }

  attachUi(ui: UiHandle): void {
    this.ui = ui;
  }

  /** Lets the host feed altitude/speed intensity to the music layering. */
  onMusicIntensity(fn: (value: number) => void): void {
    this.onIntensity = fn;
    this.game.events.on(Phaser.Core.Events.POST_STEP, (_t: number, delta: number) => {
      if (!this.onIntensity || !this.scene) return;
      this.intensityTimer += delta;
      // Sampled at ~6 Hz: the music layers cross-fade over seconds, so there is
      // nothing to gain from feeding them every frame.
      if (this.intensityTimer < 160) return;
      this.intensityTimer = 0;
      this.onIntensity(this.scene.altitudeIntensity);
    });
  }

  // ---------------------------------------------------------------- AppApi

  getCharacter(): CharacterId {
    return this.character;
  }

  setCharacter(id: CharacterId): void {
    if (CHARACTERS[id].secret && !this.isEithanUnlocked()) return;
    this.character = id;
    save.setLastCharacter(id);
    this.scene?.enterMenuMode(id);
  }

  isEithanUnlocked(): boolean {
    return save.isEithanUnlocked();
  }

  startRun(): void {
    if (!this.scene) return;
    this.lastResults = null;
    this.history.length = 0;
    this.ui?.show('none');
    this.scene.beginPlay(this.character);
  }

  retry(): void {
    this.startRun();
  }

  quitToMenu(): void {
    this.scene?.setPaused(false);
    this.scene?.enterMenuMode(this.character);
    this.history.length = 0;
    this.show('menu');
  }

  resumeRun(): void {
    this.scene?.setPaused(false);
    this.ui?.show('none');
  }

  show(screen: ScreenId): void {
    const current = this.ui?.current() ?? 'none';
    if (current !== 'none' && current !== screen) this.history.push(current);
    this.ui?.show(screen);
  }

  back(): void {
    const previous = this.history.pop();
    if (previous && previous !== 'pause') {
      this.ui?.show(previous);
      return;
    }
    if (this.ui?.current() === 'pause') {
      this.resumeRun();
      return;
    }
    this.ui?.show('menu');
  }

  getLastResults(): RunSummary | null {
    return this.lastResults;
  }

  applySettings(): void {
    const settings = save.settings;
    this.game.registry.set('settings', settings);
    this.game.events.emit('settings-changed', settings);
  }

  grantDevUnlock(): void {
    save.setDevUnlock(true);
    this.ui?.refresh();
  }

  // ---------------------------------------------------------------- internals

  private togglePause(): void {
    if (!this.scene) return;
    const open = this.ui?.current() === 'pause';
    this.scene.setPaused(!open);
    this.show(open ? 'none' : 'pause');
  }

  private handleRunComplete(sim: Simulation): void {
    const character = sim.state.character;
    const definition = CHARACTERS[character];
    const stats = sim.state.stats;

    let newDistanceRecord = false;
    let newScoreRecord = false;

    // Eithan runs are spectacle, not competition — they never touch records.
    if (!definition.noRecords) {
      const result = save.commitRun(character, {
        distance: stats.distance,
        score: stats.score,
        beasts: stats.beasts,
        peakAltitude: stats.peakAltitude,
        topSpeed: stats.topSpeed,
      });
      newDistanceRecord = result.newDistanceRecord;
      newScoreRecord = result.newScoreRecord;
    }

    this.lastResults = {
      character,
      stats: { ...stats, hits: { ...stats.hits } },
      newDistanceRecord,
      newScoreRecord,
      unranked: !!definition.noRecords,
    };

    if (newDistanceRecord) this.playSound('record.new');
    this.history.length = 0;
    this.ui?.show('results');
    this.ui?.refresh();
  }

  destroy(): void {
    this.ui?.destroy();
    this.game.destroy(true);
  }
}
