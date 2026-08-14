/**
 * Debug mode, enabled with ?debug=1. Every flag defaults off in a normal build.
 */
export interface DebugFlags {
  enabled: boolean;
  hitboxes: boolean;
  fps: boolean;
  slowMotion: boolean;
  infiniteCharges: boolean;
  forceUnlock: boolean;
  /** Overrides the Eithan unlock threshold, in km. */
  unlockKm: number | null;
  /** Fixed RNG seed for reproducible runs. */
  seed: number | null;
  /** Forces every spawn chunk to place this object kind. */
  forceSpawn: string | null;
}

function read(): DebugFlags {
  const off: DebugFlags = {
    enabled: false,
    hitboxes: false,
    fps: false,
    slowMotion: false,
    infiniteCharges: false,
    forceUnlock: false,
    unlockKm: null,
    seed: null,
    forceSpawn: null,
  };
  if (typeof globalThis.location === 'undefined') return off;
  const params = new URLSearchParams(globalThis.location.search);
  if (params.get('debug') !== '1') return off;
  const numParam = (k: string): number | null => {
    const v = params.get(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    enabled: true,
    hitboxes: params.get('hitboxes') === '1',
    fps: params.get('fps') !== '0',
    slowMotion: params.get('slow') === '1',
    infiniteCharges: params.get('charges') === 'inf',
    forceUnlock: params.get('unlock') === '1',
    unlockKm: numParam('unlockkm'),
    seed: numParam('seed'),
    forceSpawn: params.get('spawn'),
  };
}

export const debug: DebugFlags = read();
