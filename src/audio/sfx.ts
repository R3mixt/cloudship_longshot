/**
 * Sound recipes — one per id.
 *
 * A recipe never touches the bus: it is handed a `Voice` whose output trim,
 * pan and reverb send are already configured from `SFX_SPEC`, and it builds its
 * layers into `voice.out` at unity-ish peak. That split keeps the mix in one
 * readable table (`SFX_SPEC`) instead of scattered across forty functions.
 *
 * Every recipe returns its nominal duration in seconds. Teardown itself is
 * driven by the voice's own source stop times; the return value tells the
 * engine whether this is a one-shot at all — `Infinity` marks a looping voice
 * that lives until `stopLoop` releases it.
 */

import {
  DORIAN,
  PENTATONIC,
  ROOT_MIDI,
  Voice,
  clamp,
  curveEnv,
  degree,
  ahr,
  jitter,
  mtof,
  perc,
  pick,
  rnd,
  semi,
  sweep,
} from './synth';

export const SFX_IDS = [
  'ui.click',
  'ui.back',
  'ui.select',
  'ui.locked',
  'ui.unlock',
  'charge.loop',
  'charge.perfect',
  'launch.lindon',
  'launch.yerin',
  'launch.mercy',
  'launch.ziel',
  'launch.eithan',
  'bird.hit',
  'bird.golden',
  'armor.shatter',
  'armor.deflect',
  'pad.bounce',
  'tmc.rocket',
  'orb.chime',
  'aura.charge',
  'aura.shield',
  'aura.lowgrav',
  'storm.loop',
  'storm.destroy',
  'spike.death',
  'ground.bounce',
  'run.settle',
  'ability.blackflame.ignite',
  'ability.blackflame.loop',
  'ability.seeker.cast',
  'ability.seeker.lock',
  'ability.seeker.strike',
  'ability.strings.cast',
  'ability.formation.slam',
  'ability.fail',
  'destroyer.transform',
  'destroyer.ambience',
  'destroyer.pop',
  'destroyer.results',
  'record.new',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

/** Ids that keep playing until `stopLoop` is called. */
export const LOOP_IDS: readonly SfxId[] = [
  'charge.loop',
  'storm.loop',
  'ability.blackflame.loop',
  'destroyer.ambience',
];

export interface SfxParams {
  volume: number;
  rate: number;
  pan: number;
  detune: number;
}

/** Voice trim, reverb send and polyphony cap per sound. */
export interface SfxSpec {
  /** Peak linear gain on the sfx bus. */
  gain: number;
  /** 0..1 into the shared plate. */
  send: number;
  /** Maximum simultaneous voices; the oldest is stolen past this. */
  cap: number;
}

export type Recipe = (v: Voice, t: number, p: SfxParams) => number;

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

/** Apply the caller's rate and detune to a design frequency. */
function hz(p: SfxParams, base: number): number {
  return base * p.rate * Math.pow(2, p.detune / 1200);
}

/**
 * A filtered noise transient — the workhorse behind every impact, whoosh and
 * chiff. `f0 -> f1` is where the character lives: opening sweeps read as
 * "release", closing sweeps read as "impact".
 */
function noiseHit(
  v: Voice,
  t: number,
  opts: {
    kind: 'white' | 'pink' | 'brown' | 'metal';
    type: BiquadFilterType;
    f0: number;
    f1: number;
    q?: number;
    peak: number;
    attack: number;
    decay: number;
    rate?: number;
    dest?: AudioNode;
  },
): number {
  const src = v.buf(opts.kind, opts.rate ?? rnd(0.9, 1.1));
  const filt = v.filter(opts.type, opts.f0, opts.q ?? 1);
  const g = v.gain(0);
  v.chain(src, filt, g, opts.dest ?? v.out);
  sweep(filt.frequency, t, opts.f0, opts.f1, opts.attack + opts.decay);
  const end = perc(g.gain, t, opts.peak, opts.attack, opts.decay);
  v.run(src, t, end + 0.02);
  return end;
}

/** Inharmonic sine partials — a struck bell that is cheaper than a convolution. */
function bell(
  v: Voice,
  t: number,
  freq: number,
  duration: number,
  peak: number,
  dest?: AudioNode,
): number {
  const partials = [1, 2.01, 3.01, 4.19];
  const amps = [1, 0.42, 0.24, 0.12];
  const out = dest ?? v.out;
  for (let i = 0; i < partials.length; i++) {
    const o = v.osc(i === 0 ? 'sine' : 'triangle', freq * partials[i], jitter(6));
    const g = v.gain(0);
    v.chain(o, g, out);
    // Higher partials decay faster, which is what makes a struck object read
    // as metal or glass rather than as a stack of tones.
    const d = duration / (1 + i * 0.85);
    const end = perc(g.gain, t, peak * amps[i], 0.003, d);
    v.run(o, t, end + 0.02);
  }
  return t + duration;
}

/** Short plucked tone used by pickups and fanfares. */
function pluck(
  v: Voice,
  t: number,
  freq: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'triangle',
  dest?: AudioNode,
): number {
  const stack = v.stack(type, freq, 2, 7);
  const lp = v.filter('lowpass', freq * 8, 0.8);
  const g = v.gain(0);
  v.chain(stack.node, lp, g, dest ?? v.out);
  sweep(lp.frequency, t, freq * 9, freq * 2.2, duration);
  const end = perc(g.gain, t, peak, 0.004, duration);
  for (const o of stack.oscs) v.run(o, t, end + 0.02);
  return end;
}

/** Low body thump: a sine dropped hard in pitch. */
function thump(
  v: Voice,
  t: number,
  from: number,
  to: number,
  duration: number,
  peak: number,
): number {
  const o = v.osc('sine', from);
  const g = v.gain(0);
  v.chain(o, g, v.out);
  sweep(o.frequency, t, from, to, duration * 0.7);
  const end = perc(g.gain, t, peak, 0.004, duration);
  v.run(o, t, end + 0.02);
  return end;
}

const scaleHz = (index: number, root = ROOT_MIDI): number => mtof(degree(DORIAN, index, root));
const pentHz = (index: number, root = ROOT_MIDI): number => mtof(degree(PENTATONIC, index, root));

/* ------------------------------------------------------------------ */
/* Charge loop                                                         */
/* ------------------------------------------------------------------ */

/**
 * The launch charge. Four things rise together as the meter fills: pitch,
 * filter cutoff, tremolo rate and level. Driving all four from one 0..1 value
 * is what makes the hold feel like pressure building rather than a tone
 * getting louder.
 */
export class ChargeVoice {
  readonly voice: Voice;
  private readonly base: OscillatorNode;
  private readonly harm: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly lfo: OscillatorNode;
  private readonly lfoDepth: GainNode;
  private readonly level: GainNode;
  private readonly shimmer: GainNode;

  constructor(v: Voice, t: number, p: SfxParams) {
    this.voice = v;
    const root = hz(p, 55);

    this.level = v.gain(0);
    this.level.connect(v.out);

    this.filter = v.filter('bandpass', 180, 3.2);
    this.filter.connect(this.level);

    const body = v.gain(0.5);
    body.connect(this.filter);
    this.base = v.osc('sawtooth', root, -8);
    this.harm = v.osc('sawtooth', root * 1.5, 9);
    this.base.connect(body);
    this.harm.connect(body);

    // Amplitude flutter: slow and wide at the start, fast and tight at the top.
    this.lfo = v.osc('sine', 4);
    this.lfoDepth = v.gain(0.35);
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(body.gain);

    // A ringing partial that only appears near the top of the meter.
    this.shimmer = v.gain(0);
    const shine = v.osc('triangle', root * 8, 5);
    const shineFilter = v.filter('highpass', 900, 0.7);
    v.chain(shine, shineFilter, this.shimmer, this.level);

    v.run(this.base, t);
    v.run(this.harm, t);
    v.run(this.lfo, t);
    v.run(shine, t);

    this.level.gain.setValueAtTime(0, t);
    this.level.gain.linearRampToValueAtTime(0.35, t + 0.06);
    this.setProgress(0);
  }

  setProgress(x: number): void {
    const k = clamp(x, 0, 1);
    const now = this.voice.ctx.currentTime;
    const tau = 0.06;
    const root = 55 * (1 + k * 2.2);
    this.base.frequency.setTargetAtTime(root, now, tau);
    this.harm.frequency.setTargetAtTime(root * 1.5, now, tau);
    this.filter.frequency.setTargetAtTime(200 + k * k * 2600, now, tau);
    this.filter.Q.setTargetAtTime(3.2 + k * 5, now, tau);
    this.lfo.frequency.setTargetAtTime(4 + k * 15, now, tau);
    this.lfoDepth.gain.setTargetAtTime(0.35 - k * 0.18, now, tau);
    this.level.gain.setTargetAtTime(0.35 + k * 0.65, now, tau);
    this.shimmer.gain.setTargetAtTime(Math.max(0, k - 0.55) * 0.22, now, tau);
  }

  release(fade = 0.08): void {
    this.voice.release(fade);
  }
}

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* ------------------------------------------------------------------ */

export const RECIPES: Record<SfxId, Recipe> = {
  /* --- UI ---------------------------------------------------------- */

  'ui.click': (v, t, p) => {
    const o = v.osc('square', hz(p, 1180) * rnd(0.98, 1.02), p.detune);
    const lp = v.filter('lowpass', 2600, 0.9);
    const g = v.gain(0);
    v.chain(o, lp, g, v.out);
    const end = perc(g.gain, t, 0.5, 0.001, 0.035);
    v.run(o, t, end + 0.01);
    noiseHit(v, t, {
      kind: 'white',
      type: 'bandpass',
      f0: 3400,
      f1: 2200,
      q: 1.4,
      peak: 0.35,
      attack: 0.001,
      decay: 0.03,
    });
    return 0.08;
  },

  'ui.back': (v, t, p) => {
    // Falling minor third: the inverse gesture of ui.select.
    const a = hz(p, 780);
    const o = v.osc('triangle', a, p.detune);
    const g = v.gain(0);
    v.chain(o, g, v.out);
    o.frequency.setValueAtTime(a, t);
    o.frequency.setValueAtTime(a * semi(-3), t + 0.055);
    perc(g.gain, t, 0.55, 0.002, 0.05);
    const end = perc(g.gain, t + 0.055, 0.45, 0.002, 0.07);
    v.run(o, t, end + 0.01);
    return 0.16;
  },

  'ui.select': (v, t, p) => {
    const a = hz(p, 660);
    const o = v.osc('triangle', a, p.detune);
    const o2 = v.osc('sine', a * 2, 6);
    const g = v.gain(0);
    const g2 = v.gain(0);
    v.chain(o, g, v.out);
    v.chain(o2, g2, v.out);
    o.frequency.setValueAtTime(a, t);
    o.frequency.setValueAtTime(a * semi(7), t + 0.06);
    o2.frequency.setValueAtTime(a * 2, t);
    o2.frequency.setValueAtTime(a * 2 * semi(7), t + 0.06);
    perc(g.gain, t, 0.5, 0.003, 0.055);
    const end = perc(g.gain, t + 0.06, 0.5, 0.003, 0.16);
    perc(g2.gain, t + 0.06, 0.18, 0.004, 0.2);
    v.run(o, t, end + 0.05);
    v.run(o2, t, end + 0.05);
    return 0.3;
  },

  'ui.locked': (v, t, p) => {
    // Deliberately dull and buzzy: the "you cannot have this" sound.
    const o = v.osc('square', hz(p, 118), p.detune);
    const shape = v.shaper(v.assets.shapes.hard, 'none');
    const lp = v.filter('lowpass', 520, 1.2);
    const g = v.gain(0);
    v.chain(o, shape, lp, g, v.out);
    const end = ahr(g.gain, t, 0.45, 0.005, 0.05, 0.06);
    v.run(o, t, end + 0.02);
    return 0.2;
  },

  'ui.unlock': (v, t, p) => {
    // Rising fifth-plus-octave in the game's key, with a bright noise sparkle.
    const notes = [0, 4, 7];
    for (let i = 0; i < notes.length; i++) {
      const at = t + i * 0.085;
      bell(v, at, hz(p, scaleHz(notes[i] + 7)), 0.9 - i * 0.15, 0.4);
    }
    noiseHit(v, t + 0.17, {
      kind: 'white',
      type: 'highpass',
      f0: 2600,
      f1: 7200,
      q: 0.7,
      peak: 0.18,
      attack: 0.09,
      decay: 0.5,
    });
    return 1.3;
  },

  /* --- Charge ------------------------------------------------------- */

  // Built by the engine as a ChargeVoice; this stub exists so the id has a
  // recipe entry and never falls through as a missing sound.
  'charge.loop': () => Infinity,

  'charge.perfect': (v, t, p) => {
    const root = hz(p, scaleHz(7));
    bell(v, t, root, 0.85, 0.5);
    bell(v, t + 0.02, root * semi(7), 0.6, 0.3);
    // A tight upward chiff so the gold zone reads as a "catch", not a chime.
    const src = v.buf('white', 1.3);
    const bp = v.filter('bandpass', 1200, 6);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    sweep(bp.frequency, t, 1200, 6400, 0.12);
    const end = curveEnv(g.gain, t, 0.16, 0.4, 'blast');
    v.run(src, t, end + 0.02);
    return 1.0;
  },

  /* --- Launches ----------------------------------------------------- */

  'launch.lindon': (v, t, p) => {
    // Rocket ignition: a low whoomph under an opening brown-noise roar.
    const src = v.buf('brown', 0.85, true);
    const shape = v.shaper(v.assets.shapes.soft, '2x');
    const lp = v.filter('lowpass', 300, 1.6);
    const g = v.gain(0);
    v.chain(src, shape, lp, g, v.out);
    sweep(lp.frequency, t, 300, 3200, 0.5);
    sweep(lp.frequency, t + 0.5, 3200, 900, 0.55);
    const end = ahr(g.gain, t, 0.55, 0.05, 0.32, 0.6);
    v.run(src, t, end + 0.02);
    thump(v, t, hz(p, 150), hz(p, 44), 0.5, 0.7);
    noiseHit(v, t, {
      kind: 'white',
      type: 'highpass',
      f0: 5000,
      f1: 1400,
      q: 0.8,
      peak: 0.3,
      attack: 0.002,
      decay: 0.18,
    });
    return 1.2;
  },

  'launch.yerin': (v, t, p) => {
    // Steel leaving a scabbard: a bandpass climbing fast over a metal body.
    const src = v.buf('white', 1.4);
    const bp = v.filter('bandpass', 700, 7);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    sweep(bp.frequency, t, 700, 6800, 0.22);
    const end = curveEnv(g.gain, t, 0.3, 0.55, 'blast');
    v.run(src, t, end + 0.02);

    const metal = v.buf('metal', hz(p, 1.55));
    const hp = v.filter('highpass', 900, 0.8);
    const mg = v.gain(0);
    v.chain(metal, hp, mg, v.out);
    const mEnd = perc(mg.gain, t + 0.02, 0.45, 0.004, 0.5);
    v.run(metal, t + 0.02, mEnd + 0.02);

    const ping = v.osc('sine', hz(p, 2400), p.detune);
    const pg = v.gain(0);
    v.chain(ping, pg, v.out);
    sweep(ping.frequency, t, hz(p, 2400), hz(p, 1500), 0.25);
    const pEnd = perc(pg.gain, t, 0.22, 0.002, 0.3);
    v.run(ping, t, pEnd + 0.02);
    return 0.9;
  },

  'launch.mercy': (v, t, p) => {
    // Shadow strings: a soft harp figure over an airy swell. Nothing percussive.
    const notes = [0, 2, 4, 6];
    for (let i = 0; i < notes.length; i++) {
      pluck(v, t + i * 0.05, hz(p, scaleHz(notes[i] + 7)), 0.7 - i * 0.08, 0.4, 'triangle');
    }
    const src = v.buf('pink', 0.7, true);
    const bp = v.filter('bandpass', 900, 1.1);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    sweep(bp.frequency, t, 700, 2400, 0.7);
    const end = curveEnv(g.gain, t, 0.9, 0.22, 'swell');
    v.run(src, t, end + 0.02);
    return 1.1;
  },

  'launch.ziel': (v, t, p) => {
    // Rune conjure: hollow fifths, a slam, then a bright script ring.
    const root = hz(p, scaleHz(0));
    for (const mult of [1, 1.5, 2]) {
      const o = v.osc('square', root * mult, jitter(8));
      const lp = v.filter('lowpass', root * 6, 1.4);
      const g = v.gain(0);
      v.chain(o, lp, g, v.out);
      const end = ahr(g.gain, t, 0.2 / mult, 0.02, 0.12, 0.35);
      v.run(o, t, end + 0.02);
    }
    thump(v, t + 0.05, hz(p, 190), hz(p, 60), 0.35, 0.55);
    const metal = v.buf('metal', hz(p, 2.1));
    const hp = v.filter('highpass', 1600, 0.9);
    const mg = v.gain(0);
    v.chain(metal, hp, mg, v.out);
    const mEnd = perc(mg.gain, t + 0.06, 0.3, 0.006, 0.45);
    v.run(metal, t + 0.06, mEnd + 0.02);
    return 0.9;
  },

  'launch.eithan': (v, t, p) => {
    // Understated on purpose: the sequence itself is the payoff, so the launch
    // is a single glass tone falling away into a long tail.
    const root = hz(p, scaleHz(14));
    bell(v, t, root, 1.6, 0.4);
    const o = v.osc('sine', root * 0.5, p.detune);
    const g = v.gain(0);
    v.chain(o, g, v.out);
    sweep(o.frequency, t, root * 0.5, root * 0.5 * semi(-2), 1.4);
    const end = ahr(g.gain, t, 0.22, 0.25, 0.3, 0.9);
    v.run(o, t, end + 0.02);
    noiseHit(v, t, {
      kind: 'pink',
      type: 'highpass',
      f0: 4000,
      f1: 9000,
      q: 0.7,
      peak: 0.09,
      attack: 0.2,
      decay: 0.8,
    });
    return 1.8;
  },

  /* --- Beasts ------------------------------------------------------- */

  'bird.hit': (v, t, p) => {
    // Squawk: a saw through a resonant bandpass, its pitch drawn as a zigzag so
    // the cry breaks the way a bird's does instead of gliding.
    const f = hz(p, 520) * rnd(0.94, 1.07);
    const o = v.osc('sawtooth', f, jitter(25));
    const bp = v.filter('bandpass', f * 2.6, 5);
    const g = v.gain(0);
    v.chain(o, bp, g, v.out);
    o.frequency.setValueCurveAtTime(
      new Float32Array([f * 1.18, f * 0.84, f * 1.34, f * 0.92, f * 1.05, f * 0.66]),
      t,
      0.11,
    );
    const end = curveEnv(g.gain, t, 0.13, 0.45, 'blast');
    v.run(o, t, end + 0.02);

    // Whump: the body impact, pitched by the same rate so big birds land lower.
    noiseHit(v, t, {
      kind: 'brown',
      type: 'lowpass',
      f0: 900 * p.rate,
      f1: 190 * p.rate,
      q: 1.1,
      peak: 0.6,
      attack: 0.002,
      decay: 0.1,
    });
    // Feathers: a fluttering high band that outlives the impact.
    const fl = v.buf('pink', rnd(0.9, 1.2));
    const fbp = v.filter('bandpass', 2800 * p.rate, 1.6);
    const fg = v.gain(0);
    v.chain(fl, fbp, fg, v.out);
    const fEnd = curveEnv(fg.gain, t + 0.02, 0.34, 0.16, 'wobble');
    v.run(fl, t + 0.02, fEnd + 0.02);
    return 0.42;
  },

  'bird.golden': (v, t, p) => {
    // A real fanfare: brass stabs, a rising triad, shimmer on top.
    const notes = [0, 4, 7, 11];
    for (let i = 0; i < notes.length; i++) {
      const at = t + i * 0.075;
      const f = hz(p, scaleHz(notes[i] + 7));
      const stack = v.stack('sawtooth', f, 3, 12);
      const lp = v.filter('lowpass', 800, 2.4);
      const g = v.gain(0);
      v.chain(stack.node, lp, g, v.out);
      sweep(lp.frequency, at, 700, f * 5, 0.09);
      const end = ahr(g.gain, at, 0.3, 0.012, 0.1, 0.45);
      for (const o of stack.oscs) v.run(o, at, end + 0.02);
      bell(v, at, f * 2, 0.7, 0.16);
    }
    noiseHit(v, t + 0.24, {
      kind: 'white',
      type: 'highpass',
      f0: 3200,
      f1: 9000,
      q: 0.7,
      peak: 0.16,
      attack: 0.1,
      decay: 0.7,
    });
    return 1.4;
  },

  'armor.shatter': (v, t, p) => {
    // Clang, crack, then falling debris.
    const metal = v.buf('metal', hz(p, rnd(0.85, 1.05)));
    const bp = v.filter('bandpass', 1800, 0.9);
    const shape = v.shaper(v.assets.shapes.soft, '2x');
    const g = v.gain(0);
    v.chain(metal, bp, shape, g, v.out);
    sweep(bp.frequency, t, 2600, 1100, 0.5);
    const end = perc(g.gain, t, 0.65, 0.002, 0.7);
    v.run(metal, t, end + 0.02);

    noiseHit(v, t, {
      kind: 'white',
      type: 'highpass',
      f0: 1800,
      f1: 4200,
      q: 0.8,
      peak: 0.5,
      attack: 0.001,
      decay: 0.09,
    });
    thump(v, t, hz(p, 160), hz(p, 55), 0.22, 0.4);

    // Three staggered granules read as plating falling away.
    for (let i = 0; i < 3; i++) {
      noiseHit(v, t + 0.09 + i * 0.055 + rnd(0, 0.02), {
        kind: 'metal',
        type: 'bandpass',
        f0: rnd(1800, 3600),
        f1: rnd(900, 1600),
        q: 3,
        peak: 0.2 - i * 0.05,
        attack: 0.002,
        decay: 0.12,
        rate: rnd(1.4, 2.4),
      });
    }
    return 1.0;
  },

  'armor.deflect': (v, t, p) => {
    // Muffled and short — the sound of not being fast enough.
    noiseHit(v, t, {
      kind: 'brown',
      type: 'lowpass',
      f0: 500,
      f1: 130,
      q: 1.3,
      peak: 0.7,
      attack: 0.003,
      decay: 0.13,
    });
    thump(v, t, hz(p, 120), hz(p, 62), 0.18, 0.5);
    // A single dead partial: metal that refused to ring.
    const o = v.osc('triangle', hz(p, 330), jitter(10));
    const lp = v.filter('lowpass', 700, 0.8);
    const g = v.gain(0);
    v.chain(o, lp, g, v.out);
    const end = perc(g.gain, t, 0.16, 0.004, 0.12);
    v.run(o, t, end + 0.02);
    return 0.3;
  },

  /* --- Pickups and bounces ------------------------------------------ */

  'pad.bounce': (v, t, p) => {
    // The boing is tuned to the game's key so a chain of pads plays a phrase.
    const root = hz(p, scaleHz(0)) * 2;
    const o = v.osc('sine', root);
    const g = v.gain(0);
    v.chain(o, g, v.out);
    // Spring: pitch overshoots upward, settles, then relaxes.
    o.frequency.setValueAtTime(root * 0.55, t);
    o.frequency.exponentialRampToValueAtTime(root * 1.9, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(root * 1.15, t + 0.2);
    const end = perc(g.gain, t, 0.6, 0.004, 0.3);
    v.run(o, t, end + 0.02);

    pluck(v, t + 0.02, root * semi(7), 0.4, 0.3, 'triangle');
    noiseHit(v, t, {
      kind: 'pink',
      type: 'bandpass',
      f0: 900,
      f1: 2600,
      q: 1.2,
      peak: 0.25,
      attack: 0.004,
      decay: 0.12,
    });
    thump(v, t, hz(p, 200), hz(p, 90), 0.16, 0.35);
    return 0.55;
  },

  'tmc.rocket': (v, t, p) => {
    // Doppler whoosh: the noise bed's playbackRate and the bandpass both sweep
    // up and back down, and the voice pans across as it passes.
    const src = v.buf('brown', 0.8);
    const bp = v.filter('bandpass', 400, 1.6);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    src.playbackRate.setValueAtTime(0.75, t);
    src.playbackRate.exponentialRampToValueAtTime(1.55, t + 0.22);
    src.playbackRate.exponentialRampToValueAtTime(0.85, t + 0.6);
    sweep(bp.frequency, t, 400, 2600, 0.24);
    sweep(bp.frequency, t + 0.24, 2600, 500, 0.42);
    const end = curveEnv(g.gain, t, 0.68, 0.6, 'swell');
    v.run(src, t, end + 0.02);

    const sub = v.osc('sine', hz(p, 90));
    const sg = v.gain(0);
    v.chain(sub, sg, v.out);
    sweep(sub.frequency, t, hz(p, 90), hz(p, 220), 0.25);
    sweep(sub.frequency, t + 0.25, hz(p, 220), hz(p, 70), 0.4);
    const sEnd = ahr(sg.gain, t, 0.3, 0.05, 0.2, 0.35);
    v.run(sub, t, sEnd + 0.02);

    if (v.panParam) {
      v.panParam.setValueAtTime(clamp(p.pan - 0.35, -1, 1), t);
      v.panParam.linearRampToValueAtTime(clamp(p.pan + 0.35, -1, 1), t + 0.6);
    }
    return 0.8;
  },

  'orb.chime': (v, t, p) => {
    // Pitch chosen from the pentatonic so rapid pickups never sour.
    const idx = pick([7, 8, 9, 10, 11, 12]);
    bell(v, t, hz(p, pentHz(idx)), 0.75, 0.5);
    noiseHit(v, t, {
      kind: 'white',
      type: 'highpass',
      f0: 5200,
      f1: 8200,
      q: 0.7,
      peak: 0.1,
      attack: 0.002,
      decay: 0.09,
    });
    return 0.85;
  },

  'aura.charge': (v, t, p) => {
    // Refill: a liquid upward run with a closing filter "gulp".
    const o = v.osc('triangle', hz(p, 220), p.detune);
    const lp = v.filter('lowpass', 400, 6);
    const g = v.gain(0);
    v.chain(o, lp, g, v.out);
    sweep(o.frequency, t, hz(p, 220), hz(p, 660), 0.26);
    sweep(lp.frequency, t, 400, 3000, 0.2);
    sweep(lp.frequency, t + 0.2, 3000, 800, 0.2);
    const end = ahr(g.gain, t, 0.55, 0.01, 0.16, 0.2);
    v.run(o, t, end + 0.02);
    pluck(v, t + 0.14, hz(p, scaleHz(14)), 0.35, 0.28);
    return 0.6;
  },

  'aura.shield': (v, t, p) => {
    // Protective: slow bloom, warm fifth, no transient at all.
    const root = hz(p, scaleHz(0));
    for (const mult of [1, 1.5, 3]) {
      const stack = v.stack('sawtooth', root * mult, 2, 9);
      const lp = v.filter('lowpass', root * 3, 1.1);
      const g = v.gain(0);
      v.chain(stack.node, lp, g, v.out);
      sweep(lp.frequency, t, root * 1.4, root * 6, 0.3);
      const end = ahr(g.gain, t, 0.28 / mult, 0.09, 0.14, 0.45);
      for (const o of stack.oscs) v.run(o, t, end + 0.02);
    }
    noiseHit(v, t, {
      kind: 'pink',
      type: 'bandpass',
      f0: 600,
      f1: 1800,
      q: 1.1,
      peak: 0.16,
      attack: 0.08,
      decay: 0.4,
    });
    return 0.85;
  },

  'aura.lowgrav': (v, t, p) => {
    // Weightless: a continuous glissando with nothing underneath it.
    const o = v.osc('sine', hz(p, 440), p.detune);
    const o2 = v.osc('sine', hz(p, 660), 8);
    const g = v.gain(0);
    const g2 = v.gain(0);
    v.chain(o, g, v.out);
    v.chain(o2, g2, v.out);
    sweep(o.frequency, t, hz(p, 440), hz(p, 1760), 0.55);
    sweep(o2.frequency, t, hz(p, 660), hz(p, 2640), 0.55);
    const end = ahr(g.gain, t, 0.4, 0.06, 0.2, 0.35);
    ahr(g2.gain, t, 0.16, 0.12, 0.2, 0.3);
    v.run(o, t, end + 0.02);
    v.run(o2, t, end + 0.02);
    noiseHit(v, t, {
      kind: 'white',
      type: 'bandpass',
      f0: 2000,
      f1: 8000,
      q: 2.2,
      peak: 0.14,
      attack: 0.06,
      decay: 0.5,
    });
    return 0.85;
  },

  /* --- Storms ------------------------------------------------------- */

  'storm.loop': (v, t, _p) => {
    // Interior of a storm: rumble under drag. The bandpass wanders slowly so
    // the loop never settles into an audible cycle.
    const rumble = v.buf('brown', 0.55, true);
    const lp = v.filter('lowpass', 260, 1.4);
    const rg = v.gain(0);
    v.chain(rumble, lp, rg, v.out);
    ahr(rg.gain, t, 0.8, 0.25, 3600, 0.3);
    v.run(rumble, t);

    const drag = v.buf('pink', 0.9, true);
    const bp = v.filter('bandpass', 700, 2.4);
    const dg = v.gain(0);
    v.chain(drag, bp, dg, v.out);
    ahr(dg.gain, t, 0.3, 0.35, 3600, 0.3);
    v.run(drag, t);

    const lfo = v.osc('sine', 0.23);
    const depth = v.gain(320);
    v.chain(lfo, depth, bp.frequency);
    v.run(lfo, t);

    const sub = v.osc('sine', 44);
    const sg = v.gain(0);
    v.chain(sub, sg, v.out);
    ahr(sg.gain, t, 0.3, 0.4, 3600, 0.3);
    v.run(sub, t);
    return Infinity;
  },

  'storm.destroy': (v, t, p) => {
    // Crack, then the pressure collapsing inward.
    noiseHit(v, t, {
      kind: 'white',
      type: 'bandpass',
      f0: 2600,
      f1: 500,
      q: 1.1,
      peak: 0.7,
      attack: 0.002,
      decay: 0.28,
    });
    const src = v.buf('brown', 1.1);
    const lp = v.filter('lowpass', 2400, 3);
    const g = v.gain(0);
    v.chain(src, lp, g, v.out);
    sweep(lp.frequency, t, 2400, 120, 0.5);
    const end = perc(g.gain, t, 0.55, 0.01, 0.6);
    v.run(src, t, end + 0.02);
    thump(v, t + 0.02, hz(p, 180), hz(p, 38), 0.6, 0.6);
    return 0.9;
  },

  /* --- Failure and landing ------------------------------------------ */

  'spike.death': (v, t, p) => {
    // Impale, then a two-note descending horn: it should sting first and only
    // then admit that this was funny.
    noiseHit(v, t, {
      kind: 'white',
      type: 'highpass',
      f0: 3000,
      f1: 900,
      q: 0.9,
      peak: 0.55,
      attack: 0.001,
      decay: 0.12,
    });
    thump(v, t, hz(p, 190), hz(p, 45), 0.3, 0.7);

    const notes = [scaleHz(2), scaleHz(0)];
    for (let i = 0; i < notes.length; i++) {
      const at = t + 0.18 + i * 0.24;
      const f = hz(p, notes[i]) * 0.5;
      const stack = v.stack('sawtooth', f, 2, 14);
      const lp = v.filter('lowpass', f * 4, 3.5);
      const g = v.gain(0);
      const wobble = v.osc('sine', 5.5);
      const wobbleDepth = v.gain(14);
      v.chain(stack.node, lp, g, v.out);
      v.chain(wobble, wobbleDepth, stack.oscs[0].detune);
      // The slide down into each note is what tips it from grim to comic.
      for (const o of stack.oscs) {
        o.frequency.setValueAtTime(f * semi(2), at);
        o.frequency.exponentialRampToValueAtTime(f, at + 0.1);
      }
      sweep(lp.frequency, at, f * 6, f * 2.5, 0.3);
      const end = ahr(g.gain, at, 0.4 - i * 0.08, 0.02, 0.1, 0.22);
      for (const o of stack.oscs) v.run(o, at, end + 0.02);
      v.run(wobble, at, end + 0.02);
    }
    return 1.0;
  },

  'ground.bounce': (v, t, p) => {
    // Scaled by the caller: light taps arrive high and dry, heavy landings low.
    thump(v, t, hz(p, 135), hz(p, 46), 0.28, 0.75);
    noiseHit(v, t, {
      kind: 'brown',
      type: 'lowpass',
      f0: 800 * p.rate,
      f1: 160,
      q: 1.1,
      peak: 0.45,
      attack: 0.002,
      decay: 0.14,
    });
    noiseHit(v, t, {
      kind: 'pink',
      type: 'bandpass',
      f0: 1800,
      f1: 700,
      q: 1.4,
      peak: 0.12,
      attack: 0.002,
      decay: 0.09,
    });
    return 0.4;
  },

  'run.settle': (v, t, p) => {
    // The run dissolving: a noise cloud closing down over a sinking tone.
    const src = v.buf('pink', 0.6, true);
    const lp = v.filter('lowpass', 2600, 1.1);
    const g = v.gain(0);
    v.chain(src, lp, g, v.out);
    sweep(lp.frequency, t, 2600, 240, 1.4);
    const end = ahr(g.gain, t, 0.3, 0.12, 0.3, 1.0);
    v.run(src, t, end + 0.02);

    const o = v.osc('sine', hz(p, scaleHz(7)));
    const og = v.gain(0);
    v.chain(o, og, v.out);
    sweep(o.frequency, t, hz(p, scaleHz(7)), hz(p, scaleHz(0)), 1.3);
    ahr(og.gain, t, 0.28, 0.08, 0.4, 0.9);
    v.run(o, t, end + 0.02);
    return 1.7;
  },

  /* --- Abilities ---------------------------------------------------- */

  'ability.blackflame.ignite': (v, t, p) => {
    const src = v.buf('brown', 0.9);
    const shape = v.shaper(v.assets.shapes.hard, '4x');
    const lp = v.filter('lowpass', 200, 1.8);
    const g = v.gain(0);
    v.chain(src, shape, lp, g, v.out);
    // The cutoff snaps open in 40 ms — that hard front is the ignition.
    sweep(lp.frequency, t, 200, 4200, 0.04);
    sweep(lp.frequency, t + 0.04, 4200, 700, 0.5);
    const end = perc(g.gain, t, 0.6, 0.006, 0.62);
    v.run(src, t, end + 0.02);

    thump(v, t, hz(p, 220), hz(p, 40), 0.55, 0.75);
    // Crackle: a handful of tiny bandpassed bursts inside the ignition.
    for (let i = 0; i < 4; i++) {
      noiseHit(v, t + rnd(0.01, 0.3), {
        kind: 'white',
        type: 'bandpass',
        f0: rnd(1400, 4200),
        f1: rnd(600, 1400),
        q: 5,
        peak: rnd(0.1, 0.22),
        attack: 0.001,
        decay: rnd(0.02, 0.06),
      });
    }
    return 0.95;
  },

  'ability.blackflame.loop': (v, t, _p) => {
    const src = v.buf('brown', 0.75, true);
    const shape = v.shaper(v.assets.shapes.soft, '2x');
    const bp = v.filter('bandpass', 520, 1.3);
    const g = v.gain(0);
    v.chain(src, shape, bp, g, v.out);
    ahr(g.gain, t, 0.75, 0.12, 3600, 0.25);
    v.run(src, t);

    // Two detuned LFOs on the cutoff: coprime rates keep the roar from pulsing
    // on an audible period.
    const lfoA = v.osc('sine', 0.71);
    const lfoB = v.osc('triangle', 1.93);
    const depthA = v.gain(240);
    const depthB = v.gain(110);
    v.chain(lfoA, depthA, bp.frequency);
    v.chain(lfoB, depthB, bp.frequency);
    v.run(lfoA, t);
    v.run(lfoB, t);

    const drone = v.osc('sawtooth', 58, -6);
    const dlp = v.filter('lowpass', 180, 1.2);
    const dg = v.gain(0);
    v.chain(drone, dlp, dg, v.out);
    ahr(dg.gain, t, 0.35, 0.15, 3600, 0.25);
    v.run(drone, t);
    return Infinity;
  },

  'ability.seeker.cast': (v, t, p) => {
    const src = v.buf('white', 1.5);
    const bp = v.filter('bandpass', 900, 8);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    sweep(bp.frequency, t, 900, 5200, 0.18);
    const end = curveEnv(g.gain, t, 0.24, 0.5, 'blast');
    v.run(src, t, end + 0.02);
    const o = v.osc('sawtooth', hz(p, 380), p.detune);
    const lp = v.filter('lowpass', 1200, 4);
    const og = v.gain(0);
    v.chain(o, lp, og, v.out);
    sweep(o.frequency, t, hz(p, 380), hz(p, 1500), 0.2);
    sweep(lp.frequency, t, 1200, 5000, 0.2);
    const oEnd = perc(og.gain, t, 0.35, 0.005, 0.26);
    v.run(o, t, oEnd + 0.02);
    return 0.45;
  },

  'ability.seeker.lock': (v, t, p) => {
    // Two tight blips a fourth apart — radar language, deliberately synthetic.
    const f = hz(p, 1660);
    const o = v.osc('sine', f, p.detune);
    const g = v.gain(0);
    v.chain(o, g, v.out);
    o.frequency.setValueAtTime(f, t);
    o.frequency.setValueAtTime(f * semi(5), t + 0.085);
    perc(g.gain, t, 0.45, 0.002, 0.06);
    const end = perc(g.gain, t + 0.085, 0.5, 0.002, 0.11);
    v.run(o, t, end + 0.02);
    return 0.28;
  },

  'ability.seeker.strike': (v, t, p) => {
    // Swipe, clash, impact — three layers in 40 ms of stagger.
    const src = v.buf('white', 1.7);
    const bp = v.filter('bandpass', 4200, 4);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    sweep(bp.frequency, t, 4200, 1200, 0.16);
    const end = curveEnv(g.gain, t, 0.2, 0.55, 'blast');
    v.run(src, t, end + 0.02);

    const metal = v.buf('metal', hz(p, rnd(1.7, 2.1)));
    const hp = v.filter('highpass', 1400, 0.8);
    const mg = v.gain(0);
    v.chain(metal, hp, mg, v.out);
    const mEnd = perc(mg.gain, t + 0.03, 0.5, 0.002, 0.45);
    v.run(metal, t + 0.03, mEnd + 0.02);
    thump(v, t + 0.03, hz(p, 170), hz(p, 50), 0.22, 0.5);
    return 0.7;
  },

  'ability.strings.cast': (v, t, p) => {
    // An ascending pentatonic gliss, each note softer than the last.
    for (let i = 0; i < 6; i++) {
      pluck(v, t + i * 0.042, hz(p, pentHz(9 + i)), 0.55 - i * 0.05, 0.42 - i * 0.05, 'triangle');
    }
    const src = v.buf('pink', 0.8, true);
    const bp = v.filter('bandpass', 1600, 1.4);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    sweep(bp.frequency, t, 1200, 3600, 0.7);
    const end = curveEnv(g.gain, t, 0.8, 0.18, 'swell');
    v.run(src, t, end + 0.02);
    return 1.0;
  },

  'ability.formation.slam': (v, t, p) => {
    thump(v, t, hz(p, 240), hz(p, 42), 0.4, 0.9);
    noiseHit(v, t, {
      kind: 'brown',
      type: 'lowpass',
      f0: 1600,
      f1: 200,
      q: 1.4,
      peak: 0.5,
      attack: 0.002,
      decay: 0.24,
    });
    // The rune hum arrives just after the impact, hollow fifths only.
    const root = hz(p, scaleHz(0)) * 2;
    for (const mult of [1, 1.5]) {
      const stack = v.stack('square', root * mult, 2, 8);
      const lp = v.filter('lowpass', root * 3, 2);
      const g = v.gain(0);
      v.chain(stack.node, lp, g, v.out);
      const end = ahr(g.gain, t + 0.03, 0.22 / mult, 0.015, 0.09, 0.4);
      for (const o of stack.oscs) v.run(o, t + 0.03, end + 0.02);
    }
    const metal = v.buf('metal', hz(p, 2.4));
    const hp = v.filter('highpass', 2000, 0.9);
    const mg = v.gain(0);
    v.chain(metal, hp, mg, v.out);
    const mEnd = perc(mg.gain, t + 0.02, 0.24, 0.004, 0.4);
    v.run(metal, t + 0.02, mEnd + 0.02);
    return 0.75;
  },

  'ability.fail': (v, t, p) => {
    // A short muted drop: no madra, no ring.
    const o = v.osc('square', hz(p, 260), p.detune);
    const lp = v.filter('lowpass', 900, 1.4);
    const g = v.gain(0);
    v.chain(o, lp, g, v.out);
    sweep(o.frequency, t, hz(p, 260), hz(p, 150), 0.13);
    sweep(lp.frequency, t, 900, 320, 0.14);
    const end = ahr(g.gain, t, 0.35, 0.004, 0.05, 0.09);
    v.run(o, t, end + 0.02);
    return 0.22;
  },

  /* --- Destroyer ---------------------------------------------------- */

  'destroyer.transform': (v, t, p) => {
    // Riser (0.9 s) -> a beat of near-silence -> the drop. The gap is what makes
    // the drop land; without it the riser masks the transient.
    const riser = v.buf('white', 0.8);
    const rbp = v.filter('bandpass', 400, 3);
    const rg = v.gain(0);
    v.chain(riser, rbp, rg, v.out);
    sweep(rbp.frequency, t, 400, 7000, 0.9);
    riser.playbackRate.setValueAtTime(0.7, t);
    riser.playbackRate.exponentialRampToValueAtTime(1.8, t + 0.9);
    curveEnv(rg.gain, t, 0.9, 0.35, 'bloom');
    v.run(riser, t, t + 0.95);

    const riseTone = v.stack('sawtooth', 200, 3, 16);
    const rtFilter = v.filter('lowpass', 500, 4);
    const rtGain = v.gain(0);
    v.chain(riseTone.node, rtFilter, rtGain, v.out);
    for (const o of riseTone.oscs) {
      sweep(o.frequency, t, 200, 1400, 0.9);
      v.run(o, t, t + 0.95);
    }
    sweep(rtFilter.frequency, t, 500, 4000, 0.9);
    curveEnv(rtGain.gain, t, 0.9, 0.28, 'bloom');

    const drop = t + 0.96;
    // Sub drop: 150 Hz down to 26 Hz over 1.4 s, the game's lowest moment.
    const sub = v.osc('sine', 150);
    const sg = v.gain(0);
    v.chain(sub, sg, v.out);
    sweep(sub.frequency, drop, 150, 26, 1.4);
    const sEnd = ahr(sg.gain, drop, 1.0, 0.008, 0.5, 1.1);
    v.run(sub, drop, sEnd + 0.02);

    const growl = v.stack('sawtooth', 92, 3, 22);
    const shape = v.shaper(v.assets.shapes.hard, '4x');
    const glp = v.filter('lowpass', 2600, 2.2);
    const gg = v.gain(0);
    v.chain(growl.node, shape, glp, gg, v.out);
    sweep(glp.frequency, drop, 2600, 180, 1.5);
    const gEnd = ahr(gg.gain, drop, 0.5, 0.01, 0.4, 1.1);
    for (const o of growl.oscs) {
      sweep(o.frequency, drop, 92, 34, 1.5);
      v.run(o, drop, gEnd + 0.02);
    }

    // The scythe: one bright inharmonic ring over the whole collapse.
    const metal = v.buf('metal', hz(p, 0.62));
    const mhp = v.filter('highpass', 700, 0.7);
    const mg = v.gain(0);
    v.chain(metal, mhp, mg, v.out);
    const mEnd = perc(mg.gain, drop, 0.4, 0.004, 1.6);
    v.run(metal, drop, mEnd + 0.02);
    return 2.8;
  },

  'destroyer.ambience': (v, t, _p) => {
    // Void: a sub, a slow-beating pair and a filtered wash. No rhythm at all.
    const sub = v.osc('sine', 32.7);
    const sg = v.gain(0);
    v.chain(sub, sg, v.out);
    ahr(sg.gain, t, 0.65, 0.8, 3600, 0.6);
    v.run(sub, t);

    const pair = v.stack('sawtooth', 65.4, 2, 11);
    const lp = v.filter('lowpass', 260, 2.4);
    const pg = v.gain(0);
    v.chain(pair.node, lp, pg, v.out);
    ahr(pg.gain, t, 0.3, 1.0, 3600, 0.6);
    for (const o of pair.oscs) v.run(o, t);

    const lfo = v.osc('sine', 0.09);
    const depth = v.gain(150);
    v.chain(lfo, depth, lp.frequency);
    v.run(lfo, t);

    const wash = v.buf('pink', 0.45, true);
    const bp = v.filter('bandpass', 1400, 0.8);
    const wg = v.gain(0);
    v.chain(wash, bp, wg, v.out);
    ahr(wg.gain, t, 0.14, 1.4, 3600, 0.6);
    v.run(wash, t);
    return Infinity;
  },

  'destroyer.pop': (v, t, p) => {
    // Fires ~10 times a second for ten seconds, so this is four nodes total:
    // one pitched crack plus one noise burst. Pitch is randomised over a wide
    // range so the cascade reads as fireworks rather than a machine gun.
    const f = hz(p, 900) * semi(rnd(-9, 9));
    const o = v.osc('triangle', f);
    const g = v.gain(0);
    v.chain(o, g, v.out);
    sweep(o.frequency, t, f, f * 0.35, 0.1);
    const end = perc(g.gain, t, 0.5, 0.001, 0.11);
    v.run(o, t, end + 0.01);

    const src = v.buf('white', rnd(0.8, 1.6));
    const bp = v.filter('bandpass', rnd(1800, 4600), 2.2);
    const ng = v.gain(0);
    v.chain(src, bp, ng, v.out);
    const nEnd = perc(ng.gain, t, 0.4, 0.001, rnd(0.05, 0.1));
    v.run(src, t, nEnd + 0.01);
    return 0.16;
  },

  'destroyer.results': (v, t, p) => {
    // Resolution: the void chord finally lands on the tonic.
    const notes = [0, 7, 12, 16];
    for (let i = 0; i < notes.length; i++) {
      const f = hz(p, scaleHz(0)) * semi(notes[i]) * 0.5;
      const stack = v.stack('sawtooth', f, 2, 10);
      const lp = v.filter('lowpass', f * 2, 1.2);
      const g = v.gain(0);
      v.chain(stack.node, lp, g, v.out);
      sweep(lp.frequency, t, f * 1.2, f * 6, 0.7);
      const end = ahr(g.gain, t + i * 0.03, 0.22, 0.2, 0.5, 1.1);
      for (const o of stack.oscs) v.run(o, t + i * 0.03, end + 0.02);
    }
    bell(v, t + 0.12, hz(p, scaleHz(14)), 1.6, 0.24);
    return 2.2;
  },

  'record.new': (v, t, p) => {
    // The one place the score leaves dorian: a lifted third to read as triumph.
    const notes = [0, 4, 7, 12];
    for (let i = 0; i < notes.length; i++) {
      const at = t + i * 0.11;
      const f = hz(p, mtof(ROOT_MIDI + 12)) * semi(notes[i]);
      const stack = v.stack('sawtooth', f, 3, 13);
      const lp = v.filter('lowpass', 900, 2.6);
      const g = v.gain(0);
      v.chain(stack.node, lp, g, v.out);
      sweep(lp.frequency, at, 800, f * 5, 0.1);
      const end = ahr(g.gain, at, 0.26, 0.014, i === 3 ? 0.4 : 0.12, i === 3 ? 0.8 : 0.3);
      for (const o of stack.oscs) v.run(o, at, end + 0.02);
      bell(v, at, f * 2, 0.9, 0.18);
    }
    noiseHit(v, t + 0.33, {
      kind: 'white',
      type: 'highpass',
      f0: 3000,
      f1: 9500,
      q: 0.7,
      peak: 0.16,
      attack: 0.14,
      decay: 0.9,
    });
    return 2.0;
  },
};

/**
 * The mix. `gain` is the voice's peak on the sfx bus; `send` is how much of it
 * reaches the shared plate; `cap` is the polyphony limit that stops any one id
 * from flooding the graph.
 */
export const SFX_SPEC: Record<SfxId, SfxSpec> = {
  'ui.click': { gain: 0.18, send: 0.0, cap: 2 },
  'ui.back': { gain: 0.2, send: 0.05, cap: 2 },
  'ui.select': { gain: 0.24, send: 0.1, cap: 2 },
  'ui.locked': { gain: 0.22, send: 0.0, cap: 2 },
  'ui.unlock': { gain: 0.34, send: 0.3, cap: 1 },

  'charge.loop': { gain: 0.3, send: 0.08, cap: 1 },
  'charge.perfect': { gain: 0.4, send: 0.25, cap: 1 },

  'launch.lindon': { gain: 0.55, send: 0.12, cap: 1 },
  'launch.yerin': { gain: 0.55, send: 0.18, cap: 1 },
  'launch.mercy': { gain: 0.5, send: 0.3, cap: 1 },
  'launch.ziel': { gain: 0.55, send: 0.2, cap: 1 },
  'launch.eithan': { gain: 0.5, send: 0.5, cap: 1 },

  'bird.hit': { gain: 0.45, send: 0.06, cap: 5 },
  'bird.golden': { gain: 0.6, send: 0.25, cap: 1 },
  'armor.shatter': { gain: 0.55, send: 0.2, cap: 3 },
  'armor.deflect': { gain: 0.34, send: 0.05, cap: 3 },

  'pad.bounce': { gain: 0.5, send: 0.12, cap: 3 },
  'tmc.rocket': { gain: 0.5, send: 0.15, cap: 2 },
  'orb.chime': { gain: 0.26, send: 0.35, cap: 4 },
  'aura.charge': { gain: 0.34, send: 0.2, cap: 2 },
  'aura.shield': { gain: 0.34, send: 0.25, cap: 2 },
  'aura.lowgrav': { gain: 0.34, send: 0.4, cap: 2 },

  'storm.loop': { gain: 0.28, send: 0.1, cap: 1 },
  'storm.destroy': { gain: 0.5, send: 0.2, cap: 2 },

  'spike.death': { gain: 0.6, send: 0.2, cap: 1 },
  'ground.bounce': { gain: 0.45, send: 0.05, cap: 3 },
  'run.settle': { gain: 0.34, send: 0.45, cap: 1 },

  'ability.blackflame.ignite': { gain: 0.58, send: 0.12, cap: 1 },
  'ability.blackflame.loop': { gain: 0.3, send: 0.1, cap: 1 },
  'ability.seeker.cast': { gain: 0.44, send: 0.15, cap: 2 },
  'ability.seeker.lock': { gain: 0.26, send: 0.25, cap: 2 },
  'ability.seeker.strike': { gain: 0.55, send: 0.18, cap: 2 },
  'ability.strings.cast': { gain: 0.4, send: 0.35, cap: 1 },
  'ability.formation.slam': { gain: 0.58, send: 0.15, cap: 2 },
  'ability.fail': { gain: 0.24, send: 0.0, cap: 2 },

  'destroyer.transform': { gain: 0.85, send: 0.3, cap: 1 },
  'destroyer.ambience': { gain: 0.32, send: 0.15, cap: 1 },
  'destroyer.pop': { gain: 0.3, send: 0.12, cap: 6 },
  'destroyer.results': { gain: 0.6, send: 0.4, cap: 1 },

  'record.new': { gain: 0.6, send: 0.3, cap: 1 },
};

/**
 * Bird size to playback rate. Radii run 6..14 px with 9 px as the reference,
 * and the curve is deliberately shallower than a straight ratio so a 14 px
 * beast still squawks rather than groans.
 *
 *   r =  6 -> 1.36   (small, sharp)
 *   r =  9 -> 1.00   (reference)
 *   r = 14 -> 0.72   (large, heavy)
 */
export function birdRate(radius: number): number {
  return clamp(Math.pow(9 / Math.max(1, radius), 0.75), 0.7, 1.45);
}
