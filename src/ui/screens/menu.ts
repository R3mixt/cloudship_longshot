/**
 * Main menu.
 *
 * The brief is launch-in-two-interactions, so PLAY starts a run with whichever
 * character is already selected — the character list is an option, not a
 * turnstile. The current character and their best sit on the PLAY button so the
 * choice is visible without opening anything.
 */

import { CHARACTERS } from '@/data/characters';
import { LEGAL } from '@/data/legal';
import type { ScreenId } from '@/app/types';
import { pulse } from '../anim';
import { el } from '../dom';
import { starGlyph, verbGlyph } from '../glyphs';
import { bestLine, characterName } from '../labels';
import { applyAccent } from '../theme';
import { button, panel, replace, setButtonSub } from '../widgets';
import type { Screen, UiContext } from './types';

/** Taps on the title that reveal the tester unlock, and the window they must land in. */
const UNLOCK_TAPS = 5;
const UNLOCK_TAP_WINDOW_MS = 2000;

export function createMenuScreen(ctx: UiContext): Screen {
  const shell = panel({
    id: 'menu',
    title: LEGAL.gameTitle.toUpperCase(),
    subtitle: LEGAL.tagline,
  });

  shell.heading.classList.add('ui-menu__title');
  shell.heading.appendChild(
    el('span', {
      className: 'ui-menu__spark',
      attrs: { 'aria-hidden': 'true' },
      children: [starGlyph(12), starGlyph(16), starGlyph(12)],
    }),
  );

  const portrait = el('div', { className: 'ui-menu__portrait', attrs: { 'aria-hidden': 'true' } });

  const play = button({
    label: 'PLAY',
    variant: 'primary',
    sub: '',
    className: 'ui-btn--hero',
    onActivate: () => {
      ctx.api.playSound('ui.click');
      ctx.api.startRun();
    },
  });

  const secondary = (label: string, screen: ScreenId): HTMLButtonElement =>
    button({
      label,
      onActivate: () => {
        ctx.api.playSound('ui.click');
        ctx.api.show(screen);
      },
    });

  const nav = el('div', {
    className: 'ui-menu__nav',
    attrs: { 'data-nav-cols': '2' },
    children: [
      el('div', {
        className: 'ui-menu__nav-wide',
        children: [secondary('CHARACTERS', 'characterSelect')],
      }),
      secondary('HOW TO PLAY', 'howToPlay'),
      secondary('RECORDS', 'records'),
      secondary('SETTINGS', 'settings'),
      secondary('CREDITS', 'credits'),
    ],
  });

  shell.body.appendChild(
    el('div', {
      className: 'ui-menu',
      children: [el('div', { className: 'ui-menu__hero', children: [portrait, play] }), nav],
    }),
  );

  /* Hidden tester unlock: five taps on the title. Unlabelled by design. */
  let taps = 0;
  let lastTap = 0;
  shell.heading.addEventListener('click', () => {
    const now = performance.now();
    taps = now - lastTap > UNLOCK_TAP_WINDOW_MS ? 1 : taps + 1;
    lastTap = now;
    if (taps < UNLOCK_TAPS) return;
    taps = 0;
    if (ctx.api.isEithanUnlocked()) return;
    ctx.api.grantDevUnlock();
    pulse(shell.heading, 'is-sparking');
    ctx.refresh();
  });

  const refresh = (): void => {
    const id = ctx.api.getCharacter();
    const revealed = ctx.api.isEithanUnlocked();
    const accent = applyAccent(shell.dialog, id);
    const record = ctx.api.save.record(id);
    setButtonSub(play, `${characterName(id, revealed).toUpperCase()} · ${bestLine(record)}`);
    replace(portrait, [verbGlyph(CHARACTERS[id].verb, accent, 30)]);
  };

  return {
    id: 'menu',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh,
    focusPrimary: () => play.focus(),
  };
}
