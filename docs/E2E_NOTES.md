# End-to-End Notes — Cloudship Longshot

Browser coverage for the shipped build: does the real thing boot, render, accept
input, persist and stay silent. Game rules belong to the unit suite; this suite
owns integration.

## Running it

```
npx playwright install chromium firefox   # once per machine
npx playwright test                       # all projects
npx playwright test --project=chromium    # one project
npx playwright test smoke                 # one file
```

`playwright.config.ts` starts the server itself: it runs `npm run build` and
serves `dist/` with `vite preview` on port 4173. E2E therefore always exercises
the production bundle — the same minification, chunking and asset paths that go
to GitHub Pages — never the dev server.

Locally, `reuseExistingServer` is on, so if you already have
`npm run preview -- --port 4173` running the suite attaches to it. That is the
fast loop, but remember it will not pick up source changes until you rebuild.
Under `CI=1` the flag flips off and the suite always builds fresh, retries twice
and runs two workers.

Projects: `chromium`, `firefox`, and `mobile` (a Pixel 5 device profile —
touch, `isMobile`, 393x851). Every test runs on all three unless it is
genuinely platform-specific.

## What is covered

`tests/e2e/fixtures.ts` holds the shared pieces: the console-error collector,
`bootGame`, `finishRun`, and the small typed view of `window.__cloudship`.

### `smoke.spec.ts`

| Test | Asserts |
| --- | --- |
| boots to a playable menu with a clean console | splash removed, canvas present with a non-zero box, menu dialog and PLAY visible, zero console errors |
| plays a full loop | PLAY → mouse charge and release → fly → results with the flown distance → LAUNCH AGAIN returns to a live aim phase that still accepts input |
| is playable with the keyboard alone | Tab reaches PLAY, Enter starts the run, Space charges and releases into the fly phase — no pointer used at all |

### `persistence.spec.ts`

| Test | Asserts |
| --- | --- |
| keeps a record across a reload | run completes, `cloudship-longshot.save` exists and parses at version 3 with the run's distance, reload, RECORDS shows the same figure |
| keeps settings across a reload | master volume and screen shake change, survive a reload, and untouched settings are unharmed |
| remembers the selected character | selecting Mercy survives a reload, in the interface and in the save |
| boots with a corrupt save (x4) | `{`, `null`, `[]` and valid-JSON-of-the-wrong-shape each still boot to a menu that starts a run, silently |

### `navigation.spec.ts`

| Test | Asserts |
| --- | --- |
| opens every screen and returns | characters, how to play, records, settings, credits — each shows its own title and Escape returns to the menu |
| pause stops the simulation | Escape raises PAUSED, the projectile's `x` is identical a second later, RESUME advances it again |
| keeps the fifth character hidden | the locked card reads `???`/SEALED, refuses activation, and the string "Eithan" appears nowhere in the rendered text or the markup; after `grantDevUnlock()` the card reveals and becomes selectable |
| quits a paused run back to the menu | QUIT returns the world to its idle aim state rather than leaving a frozen flight behind the panel |

### `responsive.spec.ts`

| Test | Asserts |
| --- | --- |
| fits the viewport (x4: 320x568, 414x896, 1280x800, 2560x1440) | canvas has a non-zero box entirely inside the viewport, the menu panel is fully on screen, and the document never scrolls sideways |
| survives a resize mid-run | the run stays in the fly phase and keeps advancing, no console errors, no horizontal overflow |
| charges and launches from a touch hold | press-and-hold on the canvas charges, release launches — mobile project only |

### The console-error assertion

`tests/e2e/fixtures.ts` exports a `test` object extended with an **automatic**
fixture that collects `console.error` output and uncaught page errors and fails
the test if either list is non-empty. It applies to every test that imports
`test` from `./fixtures`, which is all of them. Nothing else in this suite
catches as many real regressions, so keep importing `test` from the fixtures
module rather than from `@playwright/test`.

One message is filtered, in `KNOWN_SOURCE_ISSUES`. See "Known issues" below.

## What is deliberately left to the unit suite

Everything the simulation can answer without a browser, which is most of the
game:

- flight physics, drag, the soft speed cap, launch curve, bounce and settle;
- the ability x object interaction matrix and charge accounting;
- scoring, distance multipliers and number formatting;
- spawn placement, altitude bands, difficulty ramp and seeded determinism;
- save migration from every historical shape, and the unlock arithmetic;
- the Eithan sequence and the records policy around it.

E2E asserts that a run *ends with a distance greater than zero*, never what that
distance should be. Duplicating balance assertions here would buy nothing and
would turn every tuning change into a browser-suite failure.

Also deliberately out of scope: pixel-level rendering (no screenshot baselines —
the art is still moving, and a 320x180 canvas upscaled by an arbitrary factor
makes those tests noisy), audio output, and the full ability roster in-browser.

## Conventions

- **No `waitForTimeout` as a synchronisation primitive.** Use `expect.poll`,
  `page.waitForFunction`, or a web-first assertion. The one fixed wait in the
  suite is the pause test, which samples a genuine second of elapsed time; there
  is no other way to prove that nothing moved. `advanceFrames()` in the fixtures
  waits on the engine's frame counter when a test needs the loop to catch up.
- **Role and text selectors** over CSS classes. `getByRole('dialog')` resolves to
  exactly the open panel, because closed panels are `display: none` and so are
  absent from the accessibility tree.
- **Deterministic boot.** `bootGame` loads `?debug=1&seed=12345` by default.
- **Drive real input where practical**, and fall back to the simulation hook to
  compress a flight that would otherwise take a minute of wall clock.

## Debugging a failure

```
npx playwright test --headed                 # watch it happen
npx playwright test smoke --debug            # step through with the inspector
npx playwright test --project=chromium -g "keyboard"
npx playwright show-report                   # the HTML report from the last run
npx playwright show-trace test-results/<dir>/trace.zip
```

Traces are recorded on the first retry, and screenshots and video are kept for
failures, so a CI failure usually needs nothing more than
`npx playwright show-report` on the downloaded artefact.

When a test fails because the console collector caught something, the message is
in the failure body as `console.error: …` or `pageerror: …`; open the trace and
look at the console tab around the last action.

## Known issues

Three defects were found by this suite and are **not fixed here** — the source is
owned elsewhere. Each is listed with its exact repro.

### 1. `<svg height="auto">` logs a console error in Chromium

`src/ui/glyphs.ts:190`. The three HOW TO PLAY diagrams set `height: 'auto'` as an
SVG presentation attribute. Blink's attribute parser rejects `auto` and logs
`<svg> attribute height: Expected length, "auto".` once per diagram. Firefox
accepts it, and the diagrams render correctly in both.

Repro: load the game in Chromium, open HOW TO PLAY, look at the console — three
errors.

Because of this the console collector filters that one message via
`KNOWN_SOURCE_ISSUES` in `tests/e2e/fixtures.ts`. **Delete that entry** when the
attribute moves into the stylesheet; the pattern is narrow enough that it can
mask nothing else.

### 2. Enter on PLAY, then Space, launches at zero power

`src/scenes/gameScene.ts:239-242` — the four bindings in `bindInput` — with the
latch itself in `onActionDown` (:251) and `onActionUp` (:262). Enter and Space
are bound to the same handler pair and share one `keyboardCharging` latch, which
does not record which key opened it. `inputEnabled` flips to `true` synchronously
inside the PLAY button's click handler, while the keyup of that same keypress is
still sitting in the engine's keyboard queue. When the queue drains, that stray
keyup is treated as the release of the charge Space had just begun, and the
technique launches at meter 0 — the weakest possible shot.

Repro (about 100% in Chromium, ~75% in Firefox):

1. Load the game and press Enter with PLAY focused.
2. Press and hold Space immediately, within one engine frame.
3. The run is already in the fly phase with `meter === 0`.

Controls that isolate it: starting the run with a **mouse click** and then
holding Space charges correctly every time; so does pressing Enter, waiting a
second, and then holding Space. Only the immediate keyboard follow-up fails.

A human is unlikely to press Space inside a single 16 ms frame, so the severity
is low — but it makes the keyboard path non-deterministic, and the fix is small:
remember which key opened the charge latch, or ignore action keyups that had no
matching keydown since `beginPlay()`.

`smoke.spec.ts` works around it with `advanceFrames(page, 3)` after Enter. Delete
that call and its comment when the latch is fixed.

### 3. The canvas can latch a stale fit on a mobile viewport change

Reproducible in any Chromium context created with `isMobile: true`, including the
`mobile` project. After the viewport's aspect changes, Phaser's scale manager
updates `game.scale.parentSize` to the new parent size but leaves
`game.scale.displaySize` at the fit it computed from the previous one — and
because `parentSize` now matches the DOM, its next check finds no change and it
never corrects itself. `game.scale.refresh()` fixes it immediately.

Repro:

1. Open the game in a Pixel 5 context (393x851 portrait). The canvas is 393x221.
2. Resize to 851x393 landscape and wait. The canvas stays 393x221 instead of
   growing to 699x393.
3. Resize back to 393x851 portrait. The canvas is now **699x393 at x = -229** —
   it overhangs both edges and roughly 44 % of the world is off-screen. Input
   still works within the visible area.

Desktop Chromium and Firefox re-fit correctly within about 200 ms; adding
`hasTouch: true` alone does not reproduce it, only `isMobile: true`. It needs
confirming on real hardware — a physical orientation change is the scenario this
models, and it is a bad one if it holds. A defensive `game.scale.refresh()` on
`resize`/`orientationchange` would close it either way.

Because of this the canvas-geometry assertion in "survives a resize mid-run" is
skipped on the mobile project; the run-integrity and overflow assertions still
run everywhere.
