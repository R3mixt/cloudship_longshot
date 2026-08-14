/**
 * Credits and attribution.
 *
 * The three legal strings are rendered exactly as authored in the data module —
 * never reworded, reordered or abbreviated here. This screen is a view onto
 * that file.
 */

import { CREDITS, LEGAL } from '@/data/legal';
import { el } from '../dom';
import { button, panel } from '../widgets';
import type { Screen, UiContext } from './types';

export function createCreditsScreen(ctx: UiContext): Screen {
  const back = (): void => {
    ctx.api.playSound('ui.back');
    ctx.api.back();
  };

  const shell = panel({
    id: 'credits',
    title: 'CREDITS',
    subtitle: LEGAL.gameTitle,
    onBack: back,
  });

  const done = button({ label: 'BACK', variant: 'primary', onActivate: back });

  shell.body.appendChild(
    el('div', {
      className: 'ui-credits',
      children: [
        el('dl', {
          className: 'ui-credits__list',
          children: CREDITS.flatMap((entry) => [
            el('dt', { className: 'ui-credits__role', text: entry.role }),
            el('dd', { className: 'ui-credits__name', text: entry.name }),
          ]),
        }),
        el('p', { className: 'ui-legal ui-legal--attribution', text: LEGAL.attribution }),
        el('p', { className: 'ui-legal', text: LEGAL.monetization }),
        el('p', { className: 'ui-legal', text: LEGAL.storage }),
        el('div', { className: 'ui-actions', children: [done] }),
      ],
    }),
  );

  return {
    id: 'credits',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh: () => {},
    focusPrimary: () => done.focus(),
  };
}
