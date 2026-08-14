# UX notes — the DOM interface layer

The gameplay canvas is 320x180 logical pixels. Text drawn there tops out around six
pixels tall, which is unreadable for menu copy and impossible to make accessible.
Menus are therefore HTML overlaid on the canvas: crisp type at any device pixel
ratio, real focus management, and screen-reader compatibility, while the world keeps
rendering underneath.

Everything the interface can do to the game goes through `AppApi`
(`src/app/types.ts`). No screen imports Phaser, the simulation, or the audio engine.

## Files

| Path | Role |
| --- | --- |
| `src/ui/index.ts` | `createUi(root, api): UiHandle` — the only entry point. Owns the overlay root, screen lifecycle, and the global key handler. |
| `src/ui/styles.css` | Every style rule. Imported by `index.ts`. |
| `src/ui/theme.ts` | Colour tokens, spacing scale, character accent lookup. |
| `src/ui/widgets.ts` | `panel` `button` `iconButton` `slider` `toggle` `statRow` `progressBar` `section` `row` `note` `replace`. |
| `src/ui/dom.ts` | `el` / `svgEl` / `pixelIcon` builders. No `innerHTML` anywhere in the layer. |
| `src/ui/glyphs.ts` | Generated pixel icons and the How-to-Play diagrams. |
| `src/ui/focus.ts` | Focus list, Tab trap, directional movement. |
| `src/ui/anim.ts` | Reduced-motion query, results count-up, animation restart. |
| `src/ui/format.ts` | Metres / kilometres / speed formatting, digit grouping. |
| `src/ui/labels.ts` | Shared wording, including the single function that decides whether the fifth character's name is shown. |
| `src/ui/screens/*.ts` | One module per screen, each returning a `Screen`. |

## Screen map

```
                 ┌──────────────────────────── menu (root) ────────────────────────────┐
                 │  PLAY ─▶ startRun()                                                 │
                 │  CHARACTERS ─▶ characterSelect                                      │
                 │  HOW TO PLAY ─▶ howToPlay                                           │
                 │  RECORDS ─▶ records                                                 │
                 │  SETTINGS ─▶ settings                                               │
                 │  CREDITS ─▶ credits                                                 │
                 └─────────────────────────────────────────────────────────────────────┘
                                     ▲ back() / Escape from every child

  characterSelect ── LAUNCH ─▶ startRun()      records ── reset ─▶ inline confirm (in-panel)
                  └─ card activate ─▶ setCharacter()   settings ── writes through on change
                  └─ re-activate selected card ─▶ startRun()

  in flight ── host opens ─▶ pause ── RESUME ─▶ resumeRun()
                                  ├─ SETTINGS ─▶ settings ── Escape ─▶ back() ─▶ pause
                                  └─ QUIT TO MENU ─▶ quitToMenu()

  run ends ── host opens ─▶ results ── LAUNCH AGAIN ─▶ retry()
                                    └─ CHANGE CHARACTER ─▶ characterSelect
```

The interface never decides navigation policy: it calls `api.show(...)` / `api.back()`
and renders whatever the host asks for. The host owns the back stack, so Settings
correctly returns to Pause when opened from Pause and to Menu when opened from Menu.

`show('none')` closes everything and hands input back to the canvas.

### Screen decisions worth recording

- **Menu.** PLAY starts a run with the already-selected character. Character select is
  an option, not a turnstile — boot to flight is two interactions. The current
  character and their best distance sit on the PLAY button, so the choice is visible
  without opening anything, and the panel takes that character's accent glow.
- **Menu title.** Five clicks inside a two-second rolling window call
  `api.grantDevUnlock()`. Unlabelled, no sound, one brief gold sparkle. It is a tester
  affordance, not a feature.
- **Character select.** Full-width rows rather than a two-across grid: each card has to
  carry a portrait, name, ability, the full trait sentence and a record line, and that
  does not fit in a 150px column at 320px wide. Activating the already-selected card
  launches — the fast path for players who know what they want.
- **The locked fifth slot** shows a bar per character with `flown / UNLOCK_KM km`
  underneath it. `UNLOCK_KM` is read from `src/data/characters.ts` and the fractions
  come from `SaveManager.unlockProgress()`, so the bars and the gate can never disagree
  about what counts — neither the threshold nor the rule is restated in the interface.
  The bars disappear the moment the slot is revealed.
- **How to Play.** Three drawn steps and a four-way legend, no paragraph. Every diagram
  is generated SVG, so the screen is correct before any sprite exists. Each legend row
  carries a colour, a distinct silhouette and a label, so it does not rely on hue
  alone. Fits one screen at 360px wide.
- **Records.** Per-character blocks plus lifetime totals. Reset is ghost-styled at the
  bottom behind a two-step in-panel confirm. `window.confirm` is never used: browser
  modals block the game loop, cannot be styled, and cannot be focus-managed.
- **Settings.** Values persist as they move — the mixer is the preview. Releasing a
  volume slider plays one `ui.select` tick so the player hears the level they chose.
- **Results.** Built around one decision. The distance is the hero number and counts up
  on entry; LAUNCH AGAIN takes focus immediately and answers Enter, Space and R.
- **Credits.** Renders `LEGAL.attribution`, `LEGAL.monetization` and `LEGAL.storage`
  verbatim from `src/data/legal.ts`. Never reworded here.

## Keyboard model

| Key | Behaviour |
| --- | --- |
| `Tab` / `Shift+Tab` | Move through the open panel's controls. Wraps at both ends — focus cannot leave the panel. |
| `ArrowDown` / `ArrowRight` | Focus the next control. |
| `ArrowUp` / `ArrowLeft` | Focus the previous control. Inside a container marked `data-nav-cols`, up/down jump a whole row. |
| `Enter` / `Space` | Activate the focused control (native button behaviour). |
| `Escape` | `api.back()` from any screen except the menu, which is the root of the stack. |
| `R` | Results only: launch again. |
| `Enter` / `Space` with focus off any control | Results only: launch again. |

Horizontal arrows are handed to the focused control when it is a range input, so
volume sliders adjust rather than moving focus. Arrow-driven focus changes play
`ui.select`; activation plays `ui.click`; Escape and back controls play `ui.back`; the
locked slot plays `ui.locked`.

The handler is registered on `window` in the **capture** phase and returns immediately
when no screen is open. While a panel is open its keys therefore take precedence over
the gameplay bindings listening on the same window; when nothing is open the gameplay
layer sees every key untouched.

## Focus and pointer-events strategy

- `.ui-root` is `position: fixed; inset: 0; pointer-events: none`. With no screen open
  the entire overlay is transparent to the pointer and every tap, click and drag
  reaches the canvas.
- Each screen owns a `.ui-layer` that is `display: none` until opened. `.ui-layer.is-open`
  is `display: flex; pointer-events: auto`, so exactly one layer is interactive at a
  time, and it also absorbs clicks outside the panel while a menu is up.
- Opening a screen refreshes it, reveals the layer, then focuses the screen's primary
  control. Focus lands on the primary action everywhere except character select, where
  it lands on the currently selected card — that screen exists to change a value, so
  focus starts on the current value the way a native list control behaves. LAUNCH is
  one key away in either direction.
- `refresh()` can rebuild a list (records, the reset confirm) and destroy the focused
  node. After every refresh the layer checks whether focus is still inside the dialog
  and restores it to the primary control if not, so a keystroke can never fall through
  to the canvas while a menu is open.
- Screens are built once and updated in place. Widgets that carry changing data return
  a handle with a setter for exactly this reason.
- Panels are `role="dialog" aria-modal="true"` and labelled by their heading id.

## Accessibility

- Semantic elements throughout: `<button>`, `<h1>`/`<h2>`, `<label for>`,
  `<input type="range">`, `<ol>`/`<ul>`/`<dl>`. No click handlers on `<div>`s.
- Toggles are buttons carrying `aria-pressed`; character cards use `aria-pressed` for
  selection. The locked slot uses `aria-disabled` and stays focusable, so keyboard
  players can reach it and hear why it refuses instead of finding an invisible hole.
- Progress bars are `role="progressbar"` with `aria-valuenow`, and are labelled per
  character. Volume sliders carry `aria-valuetext` in percent.
- The records reset outcome and the new-personal-best banner are `role="status"`
  `aria-live="polite"` so they are announced without stealing focus.
- Icons are generated SVG marked `aria-hidden`; the only icon-only control, the corner
  back button, carries an `aria-label`.
- Focus rings are a gold outline plus a soft halo, applied through `:focus-visible` so
  pointer users are not shown rings they did not ask for. The ring sits outside the
  2px panel border and stays legible against every accent colour.
- Motion: `prefers-reduced-motion: reduce` collapses every animation and transition in
  the layer. The in-game **Reduced effects** setting additionally disables panel entry
  animation and the results count-up; **Reduced flash** disables the personal-best
  celebration and the hero-number glow.
- Contrast against the panel ground (`#0b1026` at 96% over a dimmed canvas): body text
  `#dfe6ff` ~15:1, secondary `#8fa0d0` ~7:1, the faintest text `#808fc8` ~5.3:1, gold
  headings `#ffd876` ~11:1, primary button ink `#211a05` on gold ~10:1. All pass
  WCAG AA for normal text.

## Touch

- Every control is at least 44px tall; the corner back button is 44x44.
- Nothing is hover-only: hover adds emphasis, never information or affordance.
- `touch-action: manipulation` on the root and controls removes the double-tap-zoom
  delay; the scrolling panel body uses `touch-action: pan-y` with
  `overscroll-behavior: contain` so a flick inside a menu never scrolls or bounces the
  page behind it.
- The action row is `position: sticky; bottom: 0`. On a long panel — character select,
  records — the primary action stays on screen instead of falling below the fold.

## Responsive behaviour

Type and spacing are fluid (`clamp()`), so there is no layout that only works at one
size. Panels are `width: min(--panel-w, 94vw)` with `max-height: 92vh`; the header is
fixed and the body scrolls internally, so a panel never overflows the viewport and the
title never scrolls away.

| Breakpoint | Change |
| --- | --- |
| base (from 320px) | Single-column everything. How-to-Play steps are art-left/text-right rows. Actions stack. |
| `min-width: 400px` | Paired actions (LAUNCH / BACK) sit side by side. |
| `min-width: 560px` | How-to-Play steps become three across; record stats pair into two columns. |
| `min-height` ≤ 460px | Landscape phones: hero type shrinks, vertical padding trims, panel grows to 96vh. |
| `min-width: 1400px` | Panel widens to 440px (560px for wide panels) and the type scale steps up so the interface is not lost on a large display. Deliberately capped — a menu stretched across 4K is unreadable. |

Verified in-browser at 320x568, 320x480, 360x640, 414x896, 568x320 landscape and
1198x973, plus a headless DOM pass covering every screen, the focus trap, the key map,
the locked/unlocked fifth slot, and the reset confirm.

## Sound hooks

`ui.click` on activation, `ui.back` on back and Escape, `ui.select` on selection and
arrow-driven focus movement and volume release, `ui.locked` on the sealed slot. All go
through `api.playSound`; the audio engine is never imported here.
