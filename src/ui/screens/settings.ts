/**
 * Settings.
 *
 * Values persist as they move rather than on a save button — the mixer is the
 * preview. Releasing a volume slider plays one short confirmation tick so the
 * player hears the level they just chose without having to start a run.
 */

import type { Settings } from '@/core/save';
import { el } from '../dom';
import { button, panel, section, slider, toggle, type SliderHandle, type ToggleHandle } from '../widgets';
import type { Screen, UiContext } from './types';

type VolumeKey = 'masterVolume' | 'musicVolume' | 'sfxVolume';
type FlagKey = 'screenShake' | 'reducedEffects' | 'reducedFlash' | 'showSpeedLines';

const VOLUMES: Array<{ key: VolumeKey; label: string }> = [
  { key: 'masterVolume', label: 'Master volume' },
  { key: 'musicVolume', label: 'Music' },
  { key: 'sfxVolume', label: 'Sound effects' },
];

const FLAGS: Array<{ key: FlagKey; label: string; hint: string }> = [
  { key: 'screenShake', label: 'Screen shake', hint: 'Camera kick on impacts' },
  { key: 'reducedEffects', label: 'Reduced effects', hint: 'Fewer particles and less motion' },
  { key: 'reducedFlash', label: 'Reduced flash', hint: 'Softens bright full-screen flashes' },
  { key: 'showSpeedLines', label: 'Speed lines', hint: 'Streaks at high velocity' },
];

export function createSettingsScreen(ctx: UiContext): Screen {
  const back = (): void => {
    ctx.api.playSound('ui.back');
    ctx.api.back();
  };

  const shell = panel({
    id: 'settings',
    title: 'SETTINGS',
    subtitle: 'Saved as you change them',
    onBack: back,
  });

  const write = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    ctx.api.save.setSetting(key, value);
    ctx.api.applySettings();
  };

  const sliders = new Map<VolumeKey, SliderHandle>();
  for (const entry of VOLUMES) {
    sliders.set(
      entry.key,
      slider({
        label: entry.label,
        value: ctx.api.save.settings[entry.key],
        onInput: (value) => write(entry.key, value),
        onRelease: () => ctx.api.playSound('ui.select'),
      }),
    );
  }

  const toggles = new Map<FlagKey, ToggleHandle>();
  for (const entry of FLAGS) {
    toggles.set(
      entry.key,
      toggle({
        label: entry.label,
        hint: entry.hint,
        value: ctx.api.save.settings[entry.key],
        onChange: (value) => {
          ctx.api.playSound('ui.click');
          write(entry.key, value);
        },
      }),
    );
  }

  const done = button({ label: 'DONE', variant: 'primary', onActivate: back });

  shell.body.appendChild(
    el('div', {
      className: 'ui-settings',
      children: [
        section(
          'AUDIO',
          [...sliders.values()].map((handle) => handle.root),
        ),
        section(
          'DISPLAY',
          [...toggles.values()].map((handle) => handle.root),
        ),
        el('div', { className: 'ui-actions', children: [done] }),
      ],
    }),
  );

  return {
    id: 'settings',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh: () => {
      const settings = ctx.api.save.settings;
      for (const [key, handle] of sliders) handle.set(settings[key]);
      for (const [key, handle] of toggles) handle.set(settings[key]);
    },
    focusPrimary: () => done.focus(),
  };
}
