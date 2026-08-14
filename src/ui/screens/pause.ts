/**
 * Pause.
 *
 * Opened by the host, never by this layer. RESUME holds focus so a stray Enter
 * or Space returns to the run rather than ending it, and QUIT is visually
 * separated for the same reason.
 */

import { el } from '../dom';
import { characterName } from '../labels';
import { applyAccent } from '../theme';
import { button, panel } from '../widgets';
import type { Screen, UiContext } from './types';

export function createPauseScreen(ctx: UiContext): Screen {
  const shell = panel({ id: 'pause', title: 'PAUSED' });

  const resume = button({
    label: 'RESUME',
    variant: 'primary',
    className: 'ui-btn--hero',
    onActivate: () => {
      ctx.api.playSound('ui.click');
      ctx.api.resumeRun();
    },
  });

  shell.body.appendChild(
    el('div', {
      className: 'ui-pause',
      children: [
        resume,
        button({
          label: 'SETTINGS',
          onActivate: () => {
            ctx.api.playSound('ui.click');
            ctx.api.show('settings');
          },
        }),
        button({
          label: 'QUIT TO MENU',
          variant: 'ghost',
          className: 'ui-btn--quiet',
          onActivate: () => {
            ctx.api.playSound('ui.back');
            ctx.api.quitToMenu();
          },
        }),
      ],
    }),
  );

  return {
    id: 'pause',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh: () => {
      const id = ctx.api.getCharacter();
      applyAccent(shell.dialog, id);
      shell.setSubtitle(`${characterName(id, ctx.api.isEithanUnlocked()).toUpperCase()} in flight`);
    },
    focusPrimary: () => resume.focus(),
  };
}
