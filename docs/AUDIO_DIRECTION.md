# Audio Direction — Cloudship Longshot

Every sound in this game is synthesised at runtime by the Web Audio API. There
are no audio files, no libraries and no network calls: the whole soundscape adds
under 40 kB of minified JavaScript to the bundle and nothing at all to the asset
pipeline.

This document covers the synthesis approach, what each sound is trying to say,
the mix, the music, and the bird-size mapping.

---

## 1. Architecture

```
src/audio/
  synth.ts        primitives: noise beds, impulse response, envelopes, Voice
  sfx.ts          one recipe per SfxId, plus the mix table
  music.ts        the three tracks and the look-ahead scheduler
  AudioEngine.ts  bus, voice pools, volumes, autoplay handling, public API
  index.ts        re-exports
```

Game code only ever touches `audio` (the process-wide `AudioEngine`), the
`SfxId` union and `birdRate()`. Nothing else needs to know Web Audio exists.

### The bus

```
voices ─────────────► sfx ─┐
   └─► sfxSend ─► plate ──►┤
                           ├─► mix (0.9) ─► limiter ─► master ─► destination
music ─────────────► music ┤
   └─► musSend ─► plate ───┘
                └─► delay (dotted 8th, damped, 34% feedback)
```

Three gain nodes carry the player's sliders: `master`, `music`, `sfx`. Slider
changes ramp **linearly** over 40 ms — linear rather than exponential because
only a linear ramp actually reaches zero, and a muted slider has to be true
silence, not −80 dB.

The limiter (`DynamicsCompressorNode`, −8 dB threshold, 12:1, 3 ms attack,
160 ms release) sits **before** the master gain. Putting it after would make the
amount of limiting depend on where the player left the volume slider; this way
the destroyer cascade is controlled identically at any listening level, and
`mix` holds 0.9 of headroom underneath it.

Two convolvers share one generated impulse response rather than one convolver
being shared by both buses, so muting SFX cannot also swallow the music's tail.

### Synthesis techniques in use

- **Layering with detune.** `Voice.stack()` builds 2–3 oscillators spread across
  a few cents into one gain. Nearly every launch, pad and bass note uses it;
  it is the cheapest way to sound wide.
- **Envelopes.** `perc` (linear attack, exponential fall), `ahr`
  (attack/hold/release) and `curveEnv` (explicit `setValueCurveAtTime` shapes:
  `swell`, `pluck`, `blast`, `bloom`, `wobble`). `bloom` is a reverse envelope —
  the sound arrives from nowhere and stops dead — and it is what makes the
  destroyer riser work.
- **Filter sweeps.** The direction of a `BiquadFilterNode` sweep carries most of
  the meaning: opening sweeps read as release and escape, closing sweeps read as
  impact and collapse. `ability.blackflame.ignite` snaps its cutoff open in
  40 ms; `storm.destroy` closes 2.4 kHz → 120 Hz over half a second.
- **Shaped noise buffers.** Four beds generated once at init and shared by
  reference: `white` (hiss, sparkle), `pink` (feathers, air), `brown` (weight,
  rumble, roar) and `metal` — a bank of nine inharmonic partials with staggered
  decays plus a strike transient, which is the body of every clang and rune ring
  in the game. Variation comes from `playbackRate`, never from regenerating
  samples.
- **Generated impulse response.** 1.7 s, stereo: a diffuse tail whose one-pole
  low-pass closes as it decays (air absorption) plus seven discrete early
  reflections. Early reflections are what give the tail a sense of size instead
  of it sounding like a hiss cloud sitting on the mix.
- **Waveshapers.** Soft saturation on the storm and blackflame loops, hard clip
  (4× oversampled) on the blackflame ignition and the destroyer drop.
- **Per-voice jitter.** Detune, filter centres, noise playback rates and the
  destroyer pop's pitch are all randomised per trigger, so nothing repeats
  identically.

### Voice lifetime

Every transient sound is a `Voice`, which owns its nodes and disconnects the
whole sub-graph on the last source's `ended` event. A watchdog timer, armed at
the scheduled end plus 400 ms, is the backstop for the case where the context is
suspended mid-flight and never delivers `ended`. Looping voices deliberately
have no watchdog: they live until `stopLoop` releases them.

Voice stealing runs on two levels — a per-id cap (see the mix table) and a
global ceiling of 22 concurrent sfx voices. The destroyer cascade fires ten pops
a second for ten seconds; measured under a 3× accelerated cascade with music and
ambience running, the engine peaks at 6 concurrent voices and about 130 live
nodes.

### Autoplay, suspension and failure

`init()` never throws. If the browser has no Web Audio, or context creation
fails, the engine sets an internal unavailable flag and every method becomes a
silent no-op — the game is fully playable with audio permanently dead, and
nothing is logged.

`unlock()` must be called from a real gesture. It resumes the context and also
plays a one-sample buffer, which is what some mobile browsers actually require
before they consider a context unlocked. Sounds requested between the resume
call and the state change are still scheduled, so a click that unlocks audio
also gets to make its click.

`playMusic()` before unlock stores the request; the track starts on the
`statechange` to `running`. `suspend()`/`resume()` stop and restart both the
context and the music scheduler for background tabs.

---

## 2. Sound-by-sound intent

### UI

| Id | Intent |
|---|---|
| `ui.click` | 35 ms square blip plus a noise tick. Small, dry, no reverb — UI should not sound like it is in the room. |
| `ui.back` | The inverse gesture of select: a falling minor third. |
| `ui.select` | A rising fifth with an octave doubling on the second note. |
| `ui.locked` | Low square through a hard clip and a closed lowpass. Deliberately dull: the "you cannot have this" sound. |
| `ui.unlock` | Rising 1–5–8 bells in key with a noise sparkle. The only UI sound with a real tail. |

### Charge and launch

| Id | Intent |
|---|---|
| `charge.loop` | Pitch, cutoff, tremolo rate and level all rise together from `setChargeProgress(0..1)`. Driving four parameters from one value is what makes the hold feel like pressure rather than a tone getting louder. A ringing partial fades in above 0.55 to signal the approach of the gold zone. |
| `charge.perfect` | Bell dyad plus a tight upward noise chiff, so the gold zone reads as a *catch* rather than a chime. |
| `launch.lindon` | Rocket ignition: a 150→44 Hz whoomph under an opening brown-noise roar. |
| `launch.yerin` | Steel leaving a scabbard: a bandpass climbing 700 Hz → 6.8 kHz in 220 ms over a metal body and a falling ping. |
| `launch.mercy` | Four-note harp figure over an airy swell. Nothing percussive anywhere in it. |
| `launch.ziel` | Hollow fifths (square waves), a low slam, then a bright script ring. |
| `launch.eithan` | Understated on purpose. One glass tone falling a whole step into a very long tail — the sequence itself is the payoff. |

### Beasts and obstacles

| Id | Intent |
|---|---|
| `bird.hit` | Three layers: a squawk (saw through a resonant bandpass, pitch drawn as an explicit zigzag curve so the cry *breaks* instead of gliding), a body whump, and a pink-noise feather flutter that outlives the impact. Pitched by size — see §5. |
| `bird.golden` | A real fanfare: four filtered brass stabs on a rising 1–3–5–7, bells doubled an octave up, and a noise shimmer underneath. |
| `armor.shatter` | Clang (metal bed, sweeping bandpass, soft saturation), a broadband crack, a low thud, then three randomised granules that read as plating falling away. |
| `armor.deflect` | Muffled brown noise, a short thud, and one dead partial: metal that refused to ring. Deliberately unsatisfying. |
| `pad.bounce` | The reward sound. A sine spring whose pitch overshoots and settles, tuned to the tonic so a chain of pads plays a phrase, plus a fifth pluck and a soft poof. |
| `tmc.rocket` | Doppler whoosh: noise `playbackRate` and bandpass both sweep up then back down, a swept sub underneath, and the voice pans 0.7 across as it passes. |
| `orb.chime` | A small bell on a randomly chosen pentatonic degree, so rapid pickups never sour against the music. |
| `aura.charge` | Liquid upward run with a closing filter "gulp". Energy returning. |
| `aura.shield` | Slow bloom, warm fifth, zero transient. Protective. |
| `aura.lowgrav` | Continuous rising glissando with nothing underneath it, longest reverb send of the three. Weightless. |
| `storm.loop` | Brown rumble, a pink drag band whose bandpass wanders on a 0.23 Hz LFO, and a 44 Hz sub. The wander stops the loop settling into an audible cycle. |
| `storm.destroy` | Crack, then the pressure collapsing inward (2.4 kHz → 120 Hz) over a sub drop. |
| `spike.death` | Impale first — highpassed crack and a hard thud — then a two-note descending horn with a vibrato and a pitch slide into each note. The slide is what tips it from grim to comic. It stings, then admits this was funny. |
| `ground.bounce` | Sine thump plus two noise layers. Callers scale it with `volume`/`rate`: light taps arrive high and dry, heavy landings low and wide. |
| `run.settle` | A noise cloud closing from 2.6 kHz to 240 Hz over 1.4 s while a tone sinks a fifth to the tonic. The run dissolving. |

### Abilities

| Id | Intent |
|---|---|
| `ability.blackflame.ignite` | Cutoff snapped open in 40 ms through a 4× hard clip, a 220→40 Hz drop, and four randomised crackles inside the ignition. |
| `ability.blackflame.loop` | Saturated brown roar with two coprime LFOs on the cutoff (0.71 Hz and 1.93 Hz) so the roar never pulses on a period the ear can lock onto, over a 58 Hz saw drone. |
| `ability.seeker.cast` | Sharp upward metallic launch. |
| `ability.seeker.lock` | Two tight sine blips a fourth apart. Radar language — deliberately synthetic, so it reads as information rather than as an event. |
| `ability.seeker.strike` | Swipe, clash and impact staggered across 40 ms. |
| `ability.strings.cast` | Six ascending pentatonic plucks, each softer than the last, over an airy swell. |
| `ability.formation.slam` | A 240→42 Hz slam, then hollow square fifths and a bright rune ring arriving 30 ms behind the impact. |
| `ability.fail` | 220 ms muted square drop with the cutoff closing. No madra, no ring. |

### Destroyer

| Id | Intent |
|---|---|
| `destroyer.transform` | The game's biggest moment, built in three parts: a 0.9 s riser (bloom envelope on both a noise band and a rising saw stack), **60 ms of near-silence**, then the drop — a 150→26 Hz sub, a hard-clipped growl collapsing 92→34 Hz behind a closing lowpass, and one bright scythe ring over the whole thing. The gap is what makes the drop land; without it the riser masks the transient. |
| `destroyer.ambience` | A 32.7 Hz sub, a slow-beating saw pair on a 0.09 Hz cutoff LFO, and a distant pink wash. No rhythm whatsoever. |
| `destroyer.pop` | Four nodes total: one pitched crack (triangle sweeping down 65%) and one short noise burst. Pitch randomised ±9 semitones and the noise band randomised 1.8–4.6 kHz, so ten per second reads as fireworks and not as a machine gun. Capped at 6 voices. |
| `destroyer.results` | The void chord finally resolving onto the tonic, with a bell an octave and a fifth above. |
| `record.new` | The one place the score leaves dorian: a lifted major third, four rising notes with bells doubled and a long noise shimmer. Triumph has to sound different from every other fanfare in the game. |

---

## 3. Mix and gain staging

`gain` is the voice's peak linear gain on the SFX bus, before the player's SFX
slider. `send` is the fraction of that voice reaching the shared plate. `cap` is
the polyphony limit for that id.

| Id | gain | send | cap | Why this level |
|---|---|---|---|---|
| `ui.click` | 0.18 | 0.00 | 2 | Fires constantly; must never compete with gameplay. Fully dry. |
| `ui.back` | 0.20 | 0.05 | 2 | As click, with a trace of space. |
| `ui.select` | 0.24 | 0.10 | 2 | Slightly above click so confirmation reads as progress. |
| `ui.locked` | 0.22 | 0.00 | 2 | Audible refusal, dry so it feels blunt. |
| `ui.unlock` | 0.34 | 0.30 | 1 | A moment, not a click. |
| `charge.loop` | 0.30 | 0.08 | 1 | Sits under the music for seconds at a time; its *rise* carries it, not its level. |
| `charge.perfect` | 0.40 | 0.25 | 1 | Must cut through the charge loop it interrupts. |
| `launch.lindon` | 0.55 | 0.12 | 1 | Launch is the loudest single player action outside the destroyer. |
| `launch.yerin` | 0.55 | 0.18 | 1 | " |
| `launch.mercy` | 0.50 | 0.30 | 1 | Softer material, more space to compensate. |
| `launch.ziel` | 0.55 | 0.20 | 1 | " |
| `launch.eithan` | 0.50 | 0.50 | 1 | Quietest launch, wettest — restraint reads as ominous. |
| `bird.hit` | 0.45 | 0.06 | 5 | The most frequent gameplay sound; nearly dry so chains stay legible. |
| `bird.golden` | 0.60 | 0.25 | 1 | A jackpot has to be the loudest thing on screen. |
| `armor.shatter` | 0.55 | 0.20 | 3 | Rewarding a speed check; sits just under the golden beast. |
| `armor.deflect` | 0.34 | 0.05 | 3 | Quieter *and* duller than the shatter, so the difference is unmistakable. |
| `pad.bounce` | 0.50 | 0.12 | 3 | Reward-level, but tuned rather than loud. |
| `tmc.rocket` | 0.50 | 0.15 | 2 | Long and moving; peak kept below the impacts. |
| `orb.chime` | 0.26 | 0.35 | 4 | Small pickup, big space. Low peak lets four overlap without mud. |
| `aura.charge` | 0.34 | 0.20 | 2 | Three pickups share a level so only timbre distinguishes them. |
| `aura.shield` | 0.34 | 0.25 | 2 | " |
| `aura.lowgrav` | 0.34 | 0.40 | 2 | " (wettest of the three — it is the airy one) |
| `storm.loop` | 0.28 | 0.10 | 1 | Broadband and continuous; anything louder buries the mix. |
| `storm.destroy` | 0.50 | 0.20 | 2 | Payoff for flying through it immune. |
| `spike.death` | 0.60 | 0.20 | 1 | Run-ending. Loud is the point. |
| `ground.bounce` | 0.45 | 0.05 | 3 | Nominal level; callers scale it down for light taps. |
| `run.settle` | 0.34 | 0.45 | 1 | Fading out under the results UI. |
| `ability.blackflame.ignite` | 0.58 | 0.12 | 1 | Loudest ability transient. |
| `ability.blackflame.loop` | 0.30 | 0.10 | 1 | Runs for 3 s under everything else. |
| `ability.seeker.cast` | 0.44 | 0.15 | 2 | Below the strike it precedes. |
| `ability.seeker.lock` | 0.26 | 0.25 | 2 | Information, not impact — deliberately quiet. |
| `ability.seeker.strike` | 0.55 | 0.18 | 2 | The payoff of the cast. |
| `ability.strings.cast` | 0.40 | 0.35 | 1 | Soft ability, soft level. |
| `ability.formation.slam` | 0.58 | 0.15 | 2 | Physical impact; matches the blackflame ignition. |
| `ability.fail` | 0.24 | 0.00 | 2 | Must not be mistaken for a successful cast. |
| `destroyer.transform` | 0.85 | 0.30 | 1 | The loudest sound in the game by design; the limiter exists largely for this. |
| `destroyer.ambience` | 0.32 | 0.15 | 1 | Bed, not event. |
| `destroyer.pop` | 0.30 | 0.12 | 6 | Low peak because ~10 overlap per second; the cap plus the limiter keeps the cascade controlled. |
| `destroyer.results` | 0.60 | 0.40 | 1 | Resolution — big and wet. |
| `record.new` | 0.60 | 0.30 | 1 | Equal to the golden beast; the rarest good news in the game. |

Music sits well under this: individual note voices run 0.05–0.3 and the whole
music bus is scaled by the music slider (default 0.55) against SFX (0.9).

---

## 4. Music

All three tracks are in **D dorian**, root D3 (MIDI 50). One shared mode means
menu → flight transitions never clash, and any pickup chime landing over the
music is consonant by construction. `orb.chime` and the ability plucks draw from
the D minor pentatonic subset for the same reason.

### Scheduling

The standard look-ahead pattern: a 25 ms `setInterval` wakes up, schedules every
step falling inside the next 120 ms against `AudioContext.currentTime`, and goes
back to sleep. Note timing therefore comes from the audio clock, never from the
timer, so scheduler jitter is inaudible. If the timer has been throttled (a
background tab), the queue resyncs to the clock instead of firing a burst of
catch-up notes.

Layer gains that are effectively zero cause note construction to be skipped
entirely, not merely muted: the flight loop at intensity 0 costs about 8 nodes
per second, versus roughly 90 at full intensity.

### `menu` — drifting above the clouds

- 16 steps per bar at 0.26 s per step (~58 BPM).
- **Pad**: a four-bar chord cycle, Dm9 → Am7 → Cadd9 → Gsus2, five voices each
  with a slow swell so bars overlap rather than change.
- **Chimes**: probabilistic, roughly one in six even steps, on pentatonic
  degrees two to three octaves up, randomly panned and heavily sent to both the
  plate and the delay. Probabilistic rather than gridded so the ear never locks
  onto a pattern.
- **Wind**: a permanent brown-noise band whose centre drifts on a 0.06 Hz LFO.
- One low airy bloom every other bar.

### `flight` — the loop that has to survive run 50

Sparse and modal, built as four layers rather than as a melody. Nothing here is
a tune, because a tune is the thing that grates on the fiftieth repeat.

- 16 steps per bar at 0.115 s (~130 BPM), lifting up to 6% faster at full
  intensity. Only future steps are affected, so it can be driven every frame.
- **base** (always): a 120→44 Hz pulse on beats 1 and 3, and a held tonic saw
  pair an octave below the root with a slow cutoff LFO. Even at intensity 0 the
  loop has a floor. Ducks 25% as the shimmer arrives.
- **bass** (fades in 0.08 → 0.34): six 16ths per bar over a four-bar root
  movement D–D–C–G. The gaps matter more than the notes.
- **arp** (0.32 → 0.62): a nine-hit 16th mask over an eight-degree pattern,
  transposed by the bar's bass root so the same figure gives four colours across
  the loop; each note has its own cutoff envelope. Plus a noise tick on every
  offbeat.
- **shimmer** (0.58 → 0.92): a pentatonic bell every other bar and an airy swell
  every two bars, both well into the plate and the delay.

The fade windows overlap, so something is always arriving or leaving and the mix
reads as continuous change rather than as layers switching on.

### `destroyer` — the void

- 32 steps at 0.18 s.
- A 26 Hz sub drone, plus a saturated saw stack an octave up with a 0.07 Hz
  cutoff drift — the void breathing.
- A metallic noise swell every eight steps at a random centre.
- Every sixteen steps, a bell a flattened fifth above the tonic drone: the one
  interval in the score that tells the player this is not the same game any more.

---

## 5. Bird size → pitch

`bird.hit` is pitched by the caller through `SfxOptions.rate`, which scales the
squawk fundamental, the squawk formant band, the whump's filter sweep and the
feather band together. `birdRate(radius)` in `src/audio/sfx.ts` does the mapping:

```ts
rate = clamp((9 / radius) ** 0.75, 0.7, 1.45)
```

Bird radii run 6–14 px with 9 px as the reference size (`OBJECTS.bird`).

| radius | rate | reads as |
|---|---|---|
| 6 px | 1.36 | small, sharp, quick |
| 9 px | 1.00 | reference |
| 12 px | 0.81 | heavy |
| 14 px | 0.72 | large, low, slow |

The 0.75 exponent makes the curve deliberately shallower than a straight
frequency ratio. At a true 9/14 ratio the largest beast groans rather than
squawks, and the whump loses its attack; at 0.75 the size difference is still
obvious across the range while every bird still sounds like a bird.

Callers wanting extra variation should pass `detune` (cents) rather than
perturbing `rate`, which keeps the size reading intact.

---

## 6. Integration notes

```ts
import { audio, birdRate } from '@/audio';

audio.init();                                   // safe at boot, never throws
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

audio.setVolumes({ master, music, sfx });       // from save settings
audio.playMusic('flight');
audio.setMusicLayer(altitudeOrSpeed01);         // drive every frame
audio.play('bird.hit', { rate: birdRate(r), pan });
audio.play('charge.loop');
audio.setChargeProgress(t);                     // every frame while held
audio.stopLoop('charge.loop');
document.addEventListener('visibilitychange', () =>
  document.hidden ? audio.suspend() : audio.resume(),
);
```

`stopAllLoops()` on scene changes and on death is the safe way to guarantee no
loop outlives its run.
