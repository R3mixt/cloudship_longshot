# Test Plan — Cloudship Longshot

Unit-test coverage for the engine-free gameplay simulation, the data-driven tuning
tables, and the persistence layer.

## Running the tests

```
npm test          # single run
npm run test:watch
npm run typecheck # tsc --noEmit, includes the test sources
npm run lint
```

Vitest configuration lives in `vitest.config.ts`: globals on, `node` environment,
`@/` aliased to `src/`, and everything under `tests/unit/save/**` promoted to the
`jsdom` environment. Tests are discovered from `tests/unit/**/*.test.ts`.

## Files

| File | Subject |
| --- | --- |
| `tests/unit/helpers.ts` | Shared fixtures: frozen-field simulations, object planting, event collection, timing, in-memory `Storage` |
| `tests/unit/physics.test.ts` | Drag model, soft speed cap, launch curve, gravity, ground bounce |
| `tests/unit/spawn.test.ts` | Altitude bands, distance gates, placement rules, chunk spacing, determinism, difficulty ramp |
| `tests/unit/abilities.test.ts` | The full ability x object interaction matrix plus per-ability behaviour, aura clouds and charges |
| `tests/unit/scoring.test.ts` | Distance multiplier, beast points, display formatting |
| `tests/unit/save/save.test.ts` | Save migration, corruption handling, `commitRun` aggregation, settings persistence |
| `tests/unit/save/unlock.test.ts` | Eithan gating, per-character progress, tester unlock |
| `tests/unit/rng.test.ts` | Seeded determinism, bounds, uniformity, position hash |
| `tests/unit/destroyer.test.ts` | The Eithan sequence and the records policy around it |
| `tests/unit/lifecycle.test.ts` | Full seeded runs, termination, stat consistency, numeric safety, settle rule, balance bot |

The save tests live in a `save/` directory rather than as flat files so the
`jsdom` environment glob in `vitest.config.ts` applies to them.

## What is covered

### Flight physics

- `applyDrag`: no-op at `dt = 0`; linear term dominant below the crossover speed
  (`dragLinear / dragQuadratic`), quadratic dominant above it, exact equality at
  the crossover; always decelerating; never reverses the sign of the velocity
  across the full realistic speed range at the maximum simulation step; the
  `multiplier` scales both terms proportionally; the published closed form.
- `terminalSpeedFor`: the returned speed is the exact root of
  `dragLinear * v + dragQuadratic * v^2 = accel`; an integrated projectile
  converges to it from below; a high-speed spike decays strictly monotonically
  with a strictly shrinking per-step loss, which is what distinguishes a soft cap
  from a clamp; a 5000 px/s launch inside the real simulation decays the same way
  and is still above 1000 px/s two seconds later.
- `launchSpeed`: matches `basePower * (0.35 + 0.65 * meter)` at meter 0, 0.5 and
  1; monotonic in the meter; the perfect-launch multiplier applies at and above
  the gold threshold and not below it.
- Gravity: exact Euler accumulation over 30 frames; no gravity during the aim
  phase.
- Ground bounce: vertical restitution and horizontal retention verified against
  the velocity at the moment of impact (that is, after the same frame's gravity
  and drag); successive bounce heights strictly decrease; contact resolves to the
  ground-contact offset; below the bounce thresholds the technique settles
  instead of bouncing.

### Spawning

- Altitude band shares over 20 000 seeded samples, within 2 percentage points of
  the cumulative thresholds in `ALTITUDE_BANDS`; the 2 m to 90 m envelope; the
  per-object minimum-altitude floor; the "half of everything above 30 m" design
  intent.
- Distance gating measured on main-table placements only (bonus rolls place their
  objects at an offset from the chunk boundary, so an object sitting exactly on
  the boundary is a table placement). Nothing gated appears at 0 m or one metre
  before its own gate; everything gated appears five metres after it. Positional
  check across a whole flight for the table-exclusive kinds.
- Placement invariants: storms never below `OBJECTS.storm.minAltitude`; birds
  never below their ground clearance; no airborne object at or under the ground
  line; pads and spikes anchored exactly on it; every object inside its authored
  size range; every aura cloud carries one of the three variants; flocks between
  one and `flockMax`.
- Chunk spacing tightens with distance by the authored maximum, stops tightening
  at the cap, and always advances the frontier so generation terminates.
- Determinism: identical object streams and identical altitude streams from the
  same seed, different streams from a different seed.
- Difficulty ramp: hazard density rises with distance and the ramp caps.
- Destroyer generation floods the field with birds.

### The interaction matrix

Table-driven over six ability states x nine object kinds, with a coverage test
that fails if any cell is missing. Every case builds a one-object world, forces
the requested ability state, and steps one fine frame. See the matrix table below.

Beyond the matrix, each ability has its own behavioural suite:

- **Lindon / CONSUME** — locks the cast-time heading and holds it; accelerates at
  the authored rate for the whole burn; raises a slow technique to the speed
  floor; picks a forward-and-up heading when stalled; gravity and drag both off;
  collision radius doubled (verified by a gap that only a burning technique
  reaches); spikes incinerated for points with the burn intact; storms burned
  away; armour shattered at 200 px/s; ground contact skips (`bounce` with variant
  `skip`) without ending the burn; a pad deflects without ending the burn; bird,
  Thousand-Mile Cloud and golden-beast boosts all feed the burn speed rather than
  the velocity; the burn ends within one frame of its authored duration and hands
  the technique back to gravity.
- **Yerin / SWORD SEEKER** — castable with nothing on screen, levelling flat at
  the dart floor (asserted to be at least the spec's 650 px/s); a faster technique
  keeps its own speed; never targets an object behind the projectile; prefers the
  nearest eligible beast ahead; ignores prey beyond the lock range; drops the lock
  when the prey dies or slips behind; drives in for a centre strike; one prey per
  cast for a bird, a golden beast and an armoured beast; the strike carries the
  accumulated hunt speed into the projectile with the exit lift; armour shatters
  at 200 px/s while hunting; storms are cut with zero drag and announced once;
  spikes are sliced for points; expires within one frame of its duration.
- **Mercy / SHADOW STRINGS** — arrests a fall; never adds downward speed to a
  rising or level shot (both signs of `vy` tested); gravity multiplier applied
  exactly; forward pull through reduced drag applied exactly; a glide stays aloft
  longer and travels further than an unassisted fall; expires within one frame of
  its duration; grants no immunity of any kind.
- **Ziel / CONJURE FORMATION** — upward slam proportional to the incoming fall
  speed; the launch floor for a slow or rising technique; the forward kick, and
  the multiplicative form for a very fast technique; strictly stronger than a
  ground pad at every incoming speed, both by constants and by a side-by-side
  simulation; castable instantly at launch and at any altitude; leaves no
  lingering ability state.
- **No ability** — the bird boost formula exactly; the upward trajectory kick;
  the 700 px/s cap on the speed term (boosts at 1000 and 3000 px/s are equal to
  nine decimal places, and a 200 px/s boost is smaller); size scaling;
  distance-scaled points; the golden beast's fixed surge, identical at 200 and
  2000 px/s; orb boost and points; the Thousand-Mile Cloud sling with its upward
  component and its 280–360 boost band; storm drag on both axes, warned once;
  armour shatter above 430 px/s and hard deflect below; pad trampoline including
  the floor for a gentle landing; spike death with the exact `IMPALED` wording;
  a spire resolving before a pad on the same frame.
- **Aura clouds** — charge refund; conversion to points at full charges with the
  score change asserted, never a dead pickup; the charge pool never overfills;
  shield and low-gravity durations; every variant scores; the low-gravity
  multiplier; Mercy's stronger glide gravity wins when both are active; expiry.
- **AURA SHIELD** — spikes bounce harmlessly with the run surviving; storms
  destroyed on contact; armour shattered at 120 px/s; the shield expires within
  one frame of its duration and stops protecting.
- **Charges** — three per run; decrement per cast with `abilitiesUsed` tracking;
  `abilityFail` at zero with no state change; casting blocked outside the fly
  phase; refunded by a green cloud; held steady under `infiniteCharges`.

A short `spec anchors` block asserts only the values the design pins rather than
tunes: the doubled Consume radius, three charges, the 700 px/s boost cap, the
430 px/s shatter threshold, the ground pad's 1.5x/300 trampoline, Ziel strictly
above it, the golden beast's fixed +380/-150, storm drag at 2.6/s, a non-zero
full-charge payout, and the four distinct ability verbs.

### Scoring

`distanceMultiplier` at 0, one divisor and five divisors, linearity and absence
of a ceiling; `beastPoints` base case, scaling, half-up rounding and integrality;
`formatDistance` across the metre/kilometre boundary including rounding before
unit selection; `formatSpeed` conversion and rounding.

### Persistence

- `migrate`: complete defaults from nothing; the prototype's flat
  `{ lindon: { dist, score } }` shape including the seeded lifetime total and the
  prototype dev flag; the versioned nested shape; a partial save; an unknown
  future version; the version stamp; unrecognised character ids dropped; the
  `lastCharacter` fallback.
- Corruption: sixteen junk inputs (null, undefined, numbers, `NaN`, strings, a
  JSON string, booleans, arrays, an array of records, a function, a symbol) never
  throw and always yield a usable save; wrong-typed records ignored; negative,
  `NaN` and `Infinity` record fields replaced with zero; volumes clamped into
  0..1; non-boolean toggles fall back to their defaults.
- `SaveManager`: round-trip through a real Web Storage implementation; defaults
  when nothing is stored; recovery from malformed JSON and from five other
  garbage payloads; prototype record import including the dev flag; a corrupt
  prototype save ignored; graceful degradation with `null` storage; survival of a
  storage that throws on write; subscriber notification and unsubscription;
  `resetAll`.
- `commitRun`: first run reported as a record; a shorter run reported as no
  record but still aggregated; distance and score records reported independently;
  rounding of distance, score, altitude and speed; best altitude and speed kept
  across runs; global run count and the launched flag; per-character isolation;
  a safe empty record for a character that has never played.
- Settings persist independently and are re-clamped on load.

### Unlock

Locked on a fresh save; locked while any one of the four is short (each knocked
back in turn); locked with three of four; unlocked with all four; the exact
threshold boundary; the tester unlock forces it open without granting progress
and closes again when turned off; survives a reload; per-character fractions in
order, correct, clamped to 1 and never outside 0..1; Eithan's own distance
ignored. `UNLOCK_KM` is read from `@/data/characters` throughout; separate
assertions pin the shipping value at 100 and the gating roster at the four
playable characters.

### The Destroyer

Does not trigger before the delay; triggers within one frame of it; the exact
`THE DESTROYER HAS COME` wording; `groundGone` set and charges zeroed;
`useAbility()` inert before and during the sequence; detonation rate against the
authored interval; detonations continue for the whole sequence; beasts scored;
the run ends at delay + duration; it ends by dissipating, never by dying;
distance accumulates; the speed ceiling is respected; the scythe levels out;
reproducible from a seed. The records policy is covered at the `SaveManager`
level: `CHARACTERS.eithan.noRecords` is `true`, no other character carries it,
the simulation emits no `newRecord` of its own, a host honouring the flag leaves
Eithan's slate blank after a 250 km run, and an Eithan record cannot open the
unlock gate.

### Run lifecycle

Aim to `done` for all four playable characters; termination for all five
characters across six seeds; `x`, `y`, `vx` and `vy` asserted finite on **every
frame** of fifteen full runs; recorded distance monotonic frame by frame;
recorded top speed never decreases and clears the launch speed; peak altitude at
or above the current altitude every frame; end-of-run stat consistency across
thirty runs (positive distance, non-negative score, non-negative peak altitude,
beasts never exceeding total hits, death cause either `IMPALED` or `null`); both
end conditions observed. Settle: the run ends inside `PHYSICS.settleTime`, emits
`settle` rather than a death, ends immediately below the horizontal floor, and
does not settle while still bouncing. Balance bot: finished runs for every
character, determinism per seed, higher skill travelling further across the
roster, the safety bound respected, a novice still clearing 100 m, and the four
characters within the section 7 parity target of 15% at high skill.

## The interaction matrix

Rows are ability states, columns object kinds. Each cell gives the emitted event
and, where relevant, the outcome. Every cell is exercised by
`tests/unit/abilities.test.ts`.

| | bird | golden beast | armoured beast | aura orb | aura cloud | Thousand-Mile Cloud | storm | formation pad | rock spire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **none** | `bird` — capped boost, upward kick, scaled points | `rare` — fixed +380/-150, 400 base points | `armorShatter` above 430 px/s, `armorDeflect` (vx x0.35, vy x0.55) below | `orb` — small forward boost, +25 | `aura` — variant effect, +30 | `tmc` — +280..360, upward kick, +60 | `stormEnter` — vx x(1-2.6dt), vy x(1-1.2dt), warned once | `pad` — 1.5x with 300 floor, forward kick, +75 | `spikeDeath` — IMPALED, run over |
| **Consume (Lindon)** | `bird` — boost feeds burn speed | `rare` — fixed burn bonus | `armorShatter` at any speed, variant `burn` | `orb` — points only, velocity untouched | `aura` — variant effect, +30 | `tmc` — fixed burn bonus | `stormDestroy` +100, variant `burn` | `pad` — deflects upward, burn continues | `spikeDestroy` +100, variant `burn`, burn continues |
| **Sword Seeker (Yerin)** | `bird` — hunt ends, speed carried out with exit lift | `rare` — hunt ends, speed carried out | `armorShatter` at any speed, variant `cut`, hunt ends | `orb` — points only, velocity untouched | `aura` — variant effect, +30 | `tmc` — fixed hunt bonus | `stormCut` — zero drag, announced once | `pad` — trampoline applied, hunt keeps driving | `spikeDestroy` +100, variant `cut` |
| **Shadow Strings (Mercy)** | `bird` — normal boost | `rare` — normal surge | as **none** (no immunity) | `orb` — normal boost | `aura` — variant effect | `tmc` — normal sling | `stormEnter` — normal drag | `pad` — normal trampoline | `spikeDeath` — IMPALED, run over |
| **Aura Shield** | `bird` — normal boost | `rare` — normal surge | `armorShatter` at any speed, variant `shield` | `orb` — normal boost | `aura` — variant effect | `tmc` — normal sling | `stormDestroy` +100, variant `shield` | `pad` — normal trampoline | `spikeDestroy` +100, variant `shield`, harmless |
| **Light as Air** | `bird` — normal boost | `rare` — normal surge | as **none** (no immunity) | `orb` — normal boost | `aura` — variant effect | `tmc` — normal sling | `stormEnter` — normal drag | `pad` — normal trampoline | `spikeDeath` — IMPALED, run over |

Notes that the table cannot carry:

- Immunity is exactly `Consume || Aura Shield || Sword Seeker`. Shadow Strings and
  Light as Air grant none.
- A ground contact resolves before air objects, and a spire resolves before a pad,
  so a lethal landing is never pre-empted by a pickup on the same frame.
- One prey per cast: a bird, a golden beast or an armoured beast each end a hunt.
  Storms, spires, orbs, aura clouds and Thousand-Mile Clouds do not.
- Boosts route by ability: Consume and Sword Seeker absorb bird boosts into their
  driving speed at their own absorb rates, and take fixed bonuses from
  Thousand-Mile Clouds and golden beasts.

## Deliberately not covered

- **Rendering, animation and audio.** No test asserts a frame index, a sprite, a
  particle count, a shake magnitude or a sound. The simulation emits events with
  a magnitude and the presentation layer decides what to do with them; testing
  the decision would freeze art and feel decisions that are meant to keep moving.
- **Camera behaviour.** Not part of the simulation module.
- **Absolute ability tuning numbers.** Burn duration, hunt duration, glide pull,
  acceleration rates and boost absorption are balance-pass territory. The tests
  assert the *shape* of each rule against the data files (heading locked, gravity
  off, exactly one prey, strictly stronger than a pad) so a tuning change moves a
  number without breaking the suite, while the `spec anchors` block pins the
  handful of values the design fixes.
- **Input handling and touch gestures.** `aimByDrag` and `aimBy` are thin clamped
  setters; the interesting behaviour is in the Phaser input layer and belongs to
  the end-to-end tests.
- **Scene flow, menus and results screens.** End-to-end territory.
- **Feather, particle and hit-stop parameters** in `src/data/feel.ts`.
- **Statistical balance targets beyond parity.** Median and P90 run distances per
  character belong to the balance harness telemetry, not to a pass/fail unit
  test; only the 15% parity target and a novice floor are asserted here, because
  those are stated requirements rather than tuning preferences.

## Tests that document known defects

Four tests use `it.fails(...)`. They assert the *correct* behaviour and are
expected to fail, so the suite stays green while the defect stays visible. When a
defect is fixed, `it.fails` becomes `it` and the assertion starts guarding the
fix.

| Test | File | Defect |
| --- | --- | --- |
| `still spawns golden beasts on a kilometre-scale run` | `spawn.test.ts` | The hazard ramp widens armour's cumulative threshold past the golden beast's, closing the golden beast window at 1025 m |
| `still spawns formation pads on a kilometre-scale run` | `spawn.test.ts` | The same mechanism closes the formation pad window at 2150 m |
| `still spawns Thousand-Mile Clouds from the main table past 2 km` | `spawn.test.ts` | The same mechanism closes the main-table Thousand-Mile Cloud window at 1900 m |
| `records the peak speed a collision boost produces` | `lifecycle.test.ts` | `stats.topSpeed` is sampled during motion integration, before collisions resolve, so a pickup's peak is only seen a frame later and is lost entirely if the run ends on that frame |

A companion test, `records the distances at which the reward windows close`,
computes those three distances from the data so the numbers stay honest if the
ramp is retuned.
