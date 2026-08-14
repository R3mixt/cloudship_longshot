/**
 * The shared widget kit.
 *
 * Every screen is assembled from these so the interface has one button, one
 * slider and one stat row rather than eight near-identical variants. Widgets
 * that carry changing data return a handle with a setter, which lets a screen
 * update in place instead of rebuilding and throwing away keyboard focus.
 */

import { clear, el, pixelIcon, type ElOptions } from './dom';

/* ------------------------------------------------------------------ */
/* Panel shell                                                         */
/* ------------------------------------------------------------------ */

export interface PanelOptions {
  /** Used for the aria-labelledby wiring; must be unique per screen. */
  id: string;
  title: string;
  subtitle?: string;
  size?: 'normal' | 'wide';
  /** Adds the corner back control. */
  onBack?: () => void;
  backLabel?: string;
}

export interface PanelHandle {
  /** Full-viewport layer. Pointer events are enabled only while it is open. */
  layer: HTMLDivElement;
  /** The dialog element — also the focus-trap boundary. */
  dialog: HTMLDivElement;
  /** Scrolling content region; screens append here. */
  body: HTMLDivElement;
  heading: HTMLHeadingElement;
  setTitle(text: string): void;
  setSubtitle(text: string): void;
}

export function panel(options: PanelOptions): PanelHandle {
  const titleId = `ui-title-${options.id}`;
  const heading = el('h1', { className: 'ui-panel__title', text: options.title, attrs: { id: titleId } });
  const subtitle = el('p', {
    className: 'ui-panel__subtitle',
    text: options.subtitle ?? '',
  });
  if (!options.subtitle) subtitle.hidden = true;

  const header = el('header', {
    className: 'ui-panel__header',
    children: [
      options.onBack
        ? iconButton({
            icon: backArrow(),
            ariaLabel: options.backLabel ?? 'Back',
            onActivate: options.onBack,
            className: 'ui-iconbtn--corner',
          })
        : null,
      heading,
      subtitle,
    ],
  });

  const body = el('div', { className: 'ui-panel__body' });

  const dialog = el('div', {
    className: `ui-panel ui-panel--${options.size ?? 'normal'}`,
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
    },
    children: [header, body],
  });

  const layer = el('div', {
    className: 'ui-layer',
    attrs: { 'data-screen': options.id },
    children: [dialog],
  });

  return {
    layer,
    dialog,
    body,
    heading,
    setTitle(text) {
      heading.textContent = text;
    },
    setSubtitle(text) {
      subtitle.textContent = text;
      subtitle.hidden = text.length === 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonOptions {
  label: string;
  onActivate: () => void;
  variant?: ButtonVariant;
  /** Second line, smaller — used for the character and best on LAUNCH. */
  sub?: string;
  ariaLabel?: string;
  className?: string;
  icon?: SVGElement;
}

export function button(options: ButtonOptions): HTMLButtonElement {
  const label = el('span', { className: 'ui-btn__label', text: options.label });
  const sub = el('span', { className: 'ui-btn__sub', text: options.sub ?? '' });
  if (options.sub === undefined) sub.hidden = true;

  const node = el('button', {
    className: [
      'ui-btn',
      `ui-btn--${options.variant ?? 'secondary'}`,
      options.className ?? '',
    ]
      .filter(Boolean)
      .join(' '),
    attrs: { type: 'button' },
    children: [options.icon ?? null, label, sub],
  });
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  node.addEventListener('click', options.onActivate);
  return node;
}

/** Updates the secondary line of a button built with `sub`. */
export function setButtonSub(node: HTMLButtonElement, text: string): void {
  const sub = node.querySelector<HTMLElement>('.ui-btn__sub');
  if (!sub) return;
  sub.textContent = text;
  sub.hidden = text.length === 0;
}

export interface IconButtonOptions {
  icon: SVGElement;
  ariaLabel: string;
  onActivate: () => void;
  className?: string;
}

export function iconButton(options: IconButtonOptions): HTMLButtonElement {
  const node = el('button', {
    className: ['ui-iconbtn', options.className ?? ''].filter(Boolean).join(' '),
    attrs: { type: 'button', 'aria-label': options.ariaLabel },
    children: [options.icon],
  });
  node.addEventListener('click', options.onActivate);
  return node;
}

const BACK_ARROW = [
  '.........',
  '...A.....',
  '..AA.....',
  '.AAAAAAA.',
  'AAAAAAAAA',
  '.AAAAAAA.',
  '..AA.....',
  '...A.....',
  '.........',
];

function backArrow(): SVGElement {
  return pixelIcon(BACK_ARROW, { A: 'currentColor' }, { size: 18 });
}

/* ------------------------------------------------------------------ */
/* Data widgets                                                        */
/* ------------------------------------------------------------------ */

export interface StatRowHandle {
  root: HTMLDivElement;
  setValue(text: string): void;
}

export function statRow(
  label: string,
  value: string,
  options: { accent?: boolean; hero?: boolean } = {},
): StatRowHandle {
  const valueNode = el('b', { className: 'ui-stat__value', text: value });
  const root = el('div', {
    className: ['ui-stat', options.accent ? 'ui-stat--accent' : '', options.hero ? 'ui-stat--hero' : '']
      .filter(Boolean)
      .join(' '),
    children: [el('span', { className: 'ui-stat__label', text: label }), valueNode],
  });
  return {
    root,
    setValue(text) {
      valueNode.textContent = text;
    },
  };
}

export interface ProgressHandle {
  root: HTMLDivElement;
  set(value: number, note?: string): void;
}

export interface ProgressOptions {
  label: string;
  value: number;
  note?: string;
  /** Accent colour for the fill; defaults to the gold token. */
  accent?: string;
  /** Announced as the accessible name of the progress bar. */
  ariaLabel?: string;
}

export function progressBar(options: ProgressOptions): ProgressHandle {
  const fill = el('div', { className: 'ui-progress__fill' });
  if (options.accent) fill.style.setProperty('--fill', options.accent);

  const track = el('div', {
    className: 'ui-progress__track',
    attrs: {
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': options.ariaLabel ?? options.label,
    },
    children: [fill],
  });

  const note = el('span', { className: 'ui-progress__note', text: options.note ?? '' });
  const root = el('div', {
    className: 'ui-progress',
    children: [
      el('div', {
        className: 'ui-progress__head',
        children: [el('span', { className: 'ui-progress__label', text: options.label }), note],
      }),
      track,
    ],
  });

  const apply = (value: number, noteText?: string): void => {
    const clamped = Math.max(0, Math.min(1, value));
    fill.style.width = `${(clamped * 100).toFixed(1)}%`;
    track.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
    root.classList.toggle('is-complete', clamped >= 1);
    if (noteText !== undefined) note.textContent = noteText;
  };
  apply(options.value, options.note);

  return { root, set: apply };
}

export interface SliderHandle {
  root: HTMLDivElement;
  input: HTMLInputElement;
  set(value: number): void;
}

export interface SliderOptions {
  label: string;
  /** 0…1. */
  value: number;
  onInput(value: number): void;
  /** Fired when the player lets go — the moment to play a confirmation tick. */
  onRelease(value: number): void;
}

export function slider(options: SliderOptions): SliderHandle {
  const id = `ui-slider-${Math.random().toString(36).slice(2, 9)}`;
  const readout = el('span', { className: 'ui-slider__value' });

  const input = el('input', {
    className: 'ui-slider__input',
    attrs: {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      id,
      value: String(Math.round(options.value * 100)),
    },
  });

  const label = el('label', {
    className: 'ui-slider__label',
    attrs: { for: id },
    text: options.label,
  });

  const paint = (percentValue: number): void => {
    readout.textContent = `${percentValue}%`;
    input.setAttribute('aria-valuetext', `${percentValue} percent`);
    input.style.setProperty('--filled', `${percentValue}%`);
  };
  paint(Math.round(options.value * 100));

  input.addEventListener('input', () => {
    const value = Number(input.value);
    paint(value);
    options.onInput(value / 100);
  });
  // `change` covers both gestures: pointer release after a drag, and the commit
  // that follows a keyboard adjustment. Listening to pointerup as well would
  // double-fire the confirmation tick.
  input.addEventListener('change', () => options.onRelease(Number(input.value) / 100));

  const root = el('div', {
    className: 'ui-slider',
    children: [
      el('div', { className: 'ui-slider__head', children: [label, readout] }),
      input,
    ],
  });

  return {
    root,
    input,
    set(value) {
      const percentValue = Math.round(value * 100);
      input.value = String(percentValue);
      paint(percentValue);
    },
  };
}

export interface ToggleHandle {
  root: HTMLButtonElement;
  set(value: boolean): void;
}

export interface ToggleOptions {
  label: string;
  hint?: string;
  value: boolean;
  onChange(value: boolean): void;
}

export function toggle(options: ToggleOptions): ToggleHandle {
  const state = el('span', { className: 'ui-toggle__state' });
  const text = el('span', {
    className: 'ui-toggle__text',
    children: [
      el('span', { className: 'ui-toggle__label', text: options.label }),
      options.hint ? el('span', { className: 'ui-toggle__hint', text: options.hint }) : null,
    ],
  });

  const root = el('button', {
    className: 'ui-toggle',
    attrs: { type: 'button' },
    children: [text, state],
  });

  let current = options.value;
  const paint = (): void => {
    root.setAttribute('aria-pressed', current ? 'true' : 'false');
    state.textContent = current ? 'ON' : 'OFF';
    root.classList.toggle('is-on', current);
  };
  paint();

  root.addEventListener('click', () => {
    current = !current;
    paint();
    options.onChange(current);
  });

  return {
    root,
    set(value) {
      current = value;
      paint();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function section(title: string, children: Array<Node | null>, options: ElOptions = {}): HTMLElement {
  return el('section', {
    ...options,
    className: ['ui-section', options.className ?? ''].filter(Boolean).join(' '),
    children: [el('h2', { className: 'ui-section__title', text: title }), ...children],
  });
}

export function row(children: Array<Node | null>, className = ''): HTMLDivElement {
  return el('div', { className: ['ui-row', className].filter(Boolean).join(' '), children });
}

export function note(text: string, className = ''): HTMLParagraphElement {
  return el('p', { className: ['ui-note', className].filter(Boolean).join(' '), text });
}

/** Replaces a container's contents with freshly built nodes. */
export function replace(container: Element, children: Array<Node | null>): void {
  clear(container);
  for (const child of children) if (child) container.appendChild(child);
}
