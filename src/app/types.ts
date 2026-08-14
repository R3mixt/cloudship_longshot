import type { CharacterId } from '@/data/characters';
import type { SaveManager } from '@/core/save';
import type { RunStats } from '@/sim/types';

export type ScreenId =
  | 'none'
  | 'menu'
  | 'characterSelect'
  | 'howToPlay'
  | 'records'
  | 'settings'
  | 'credits'
  | 'results'
  | 'pause';

/**
 * Sound trigger passed into the game scene. Routing audio through a callback
 * keeps exactly one module aware of the audio engine, so the renderer and the
 * simulation stay testable without stubbing Web Audio.
 */
export type SoundFn = (id: string, opts?: { volume?: number; rate?: number }) => void;

export interface RunSummary {
  character: CharacterId;
  stats: RunStats;
  newDistanceRecord: boolean;
  newScoreRecord: boolean;
  /** True when the run was an Eithan run and therefore did not write records. */
  unranked: boolean;
}

/**
 * The surface the DOM interface talks to. Everything the screens can do to the
 * game goes through here, which keeps the interface layer free of any Phaser or
 * simulation imports and makes it independently testable.
 */
export interface AppApi {
  readonly save: SaveManager;

  /** Currently selected character. */
  getCharacter(): CharacterId;
  setCharacter(id: CharacterId): void;

  /** Whether the hidden fifth slot is revealed. */
  isEithanUnlocked(): boolean;

  /** Starts a run with the current character and hands control to the canvas. */
  startRun(): void;
  /** Restarts immediately with the same character — the results screen default. */
  retry(): void;
  /** Abandons the current run and returns to the menu. */
  quitToMenu(): void;
  resumeRun(): void;

  /** Navigation. */
  show(screen: ScreenId): void;
  back(): void;

  /** The most recent finished run, for the results screen. */
  getLastResults(): RunSummary | null;

  /** Settings are written straight through to the save. */
  applySettings(): void;

  /** Hidden tester unlock, triggered by the menu title gesture. */
  grantDevUnlock(): void;

  playSound(id: string): void;
}

export interface UiHandle {
  /** Shows a screen, hiding whatever was open. 'none' hides everything. */
  show(screen: ScreenId): void;
  /** Current screen. */
  current(): ScreenId;
  /** Re-reads save state and redraws the open screen. */
  refresh(): void;
  destroy(): void;
}
