import { AppController } from '@/app/controller';
import type { SoundFn } from '@/app/types';
import { audio, type SfxId } from '@/audio';
import { save } from '@/core/save';
import { createUi } from '@/ui';

const parent = document.getElementById('game');
if (!parent) throw new Error('Missing #game container');

const playSound: SoundFn = (id, opts) => {
  audio.play(id as SfxId, opts);
};

const app = new AppController('game', playSound);

const ui = createUi(document.body, app);
app.attachUi(ui);

// ---------------------------------------------------------------- audio wiring

function applyVolumes(): void {
  const s = save.settings;
  audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
}

audio.init();
applyVolumes();
save.subscribe(applyVolumes);
app.onMusicIntensity((value) => audio.setMusicLayer(value));

// Browsers hold the audio context suspended until a real gesture. Unlocking on
// the first interaction of any kind means the player never notices.
const unlock = (): void => {
  audio.unlock();
  applyVolumes();
  audio.playMusic('menu');
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
  window.removeEventListener('touchstart', unlock);
};
window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });
window.addEventListener('touchstart', unlock, { once: false });

// A backgrounded tab must not keep a synth graph running.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
  else audio.resume();
});

// ---------------------------------------------------------------- diagnostics

declare global {
  interface Window {
    /** Exposed for the end-to-end tests to drive the game deterministically. */
    __cloudship?: { app: AppController };
  }
}

window.__cloudship = { app };
