/**
 * The soundtrack.
 *
 * Three tracks, all in D dorian so a transition between them — and any pickup
 * chime that lands over them — stays consonant. Everything is sequenced against
 * the audio clock with the standard look-ahead pattern: a 25 ms timer wakes up,
 * schedules every step that falls inside the next 120 ms, and goes back to
 * sleep. Note timing therefore comes from `AudioContext.currentTime`, not from
 * the timer, so scheduler jitter never reaches the ear.
 *
 * `flight` is the loop that has to survive hundreds of runs, so it is built as
 * four layers that fade in with intensity rather than as a melody. Sparse
 * material that changes shape with the player's altitude ages far better than a
 * tune, however good the tune is.
 */

import {
  DORIAN,
  PENTATONIC,
  ROOT_MIDI,
  type SynthTarget,
  Voice,
  ahr,
  clamp,
  degree,
  hold,
  jitter,
  mtof,
  perc,
  rnd,
  smoothstep,
  sweep,
} from './synth';

export type MusicTrack = 'menu' | 'flight' | 'destroyer';

type LayerName = 'base' | 'bass' | 'arp' | 'shimmer';
const LAYER_NAMES: readonly LayerName[] = ['base', 'bass', 'arp', 'shimmer'];

/** How far ahead of the audio clock notes are queued, in seconds. */
const LOOKAHEAD = 0.12;
/** Scheduler wake-up interval, in milliseconds. */
const TICK_MS = 25;

const scaleHz = (index: number, root = ROOT_MIDI): number => mtof(degree(DORIAN, index, root));
const pentHz = (index: number, root = ROOT_MIDI): number => mtof(degree(PENTATONIC, index, root));

/* ------------------------------------------------------------------ */
/* Note voices                                                         */
/* ------------------------------------------------------------------ */

/** Sustained chord tone: two detuned saws, slow in, slow out. */
function padNote(v: Voice, t: number, freq: number, duration: number, peak: number): void {
  const stack = v.stack('sawtooth', freq, 2, 8);
  const lp = v.filter('lowpass', freq * 2, 0.9);
  const g = v.gain(0);
  v.chain(stack.node, lp, g, v.out);
  sweep(lp.frequency, t, freq * 1.6, freq * 3.4, duration * 0.6);
  const end = ahr(g.gain, t, peak, duration * 0.35, duration * 0.2, duration * 0.6);
  for (const o of stack.oscs) v.run(o, t, end + 0.02);
  v.seal();
}

/** Struck tone with inharmonic partials — the chimes and shimmer. */
function bellNote(v: Voice, t: number, freq: number, duration: number, peak: number): void {
  const partials = [1, 2.02, 3.83];
  const amps = [1, 0.38, 0.18];
  for (let i = 0; i < partials.length; i++) {
    const o = v.osc(i === 0 ? 'sine' : 'triangle', freq * partials[i], jitter(5));
    const g = v.gain(0);
    v.chain(o, g, v.out);
    const end = perc(g.gain, t, peak * amps[i], 0.004, duration / (1 + i * 0.9));
    v.run(o, t, end + 0.02);
  }
  v.seal();
}

/** Short filtered pluck for the arpeggio. */
function pluckNote(v: Voice, t: number, freq: number, duration: number, peak: number): void {
  const stack = v.stack('square', freq, 2, 6);
  const lp = v.filter('lowpass', freq * 3, 4.5);
  const g = v.gain(0);
  v.chain(stack.node, lp, g, v.out);
  // A per-note cutoff envelope is what keeps a square arp from sounding static
  // over the hundreds of repeats this loop will get.
  sweep(lp.frequency, t, freq * 7, freq * 1.6, duration);
  const end = perc(g.gain, t, peak, 0.004, duration);
  for (const o of stack.oscs) v.run(o, t, end + 0.02);
  v.seal();
}

/** Bass pulse: saw over a sine sub, both closed down by a lowpass. */
function bassNote(v: Voice, t: number, freq: number, duration: number, peak: number): void {
  const saw = v.osc('sawtooth', freq, -5);
  const sub = v.osc('sine', freq * 0.5, 4);
  const mix = v.gain(0.6);
  const lp = v.filter('lowpass', freq * 4, 3);
  const g = v.gain(0);
  saw.connect(mix);
  sub.connect(mix);
  v.chain(mix, lp, g, v.out);
  sweep(lp.frequency, t, freq * 8, freq * 2, duration * 0.8);
  const end = ahr(g.gain, t, peak, 0.008, duration * 0.35, duration * 0.6);
  v.run(saw, t, end + 0.02);
  v.run(sub, t, end + 0.02);
  v.seal();
}

/** Low pulse on the downbeat. Felt more than heard. */
function pulseNote(v: Voice, t: number, from: number, to: number, peak: number): void {
  const o = v.osc('sine', from);
  const g = v.gain(0);
  v.chain(o, g, v.out);
  sweep(o.frequency, t, from, to, 0.09);
  const end = perc(g.gain, t, peak, 0.004, 0.24);
  v.run(o, t, end + 0.02);
  v.seal();
}

/** Noise tick on the offbeat, keeps the flight loop moving. */
function hatNote(v: Voice, t: number, peak: number): void {
  const src = v.buf('white', rnd(1.1, 1.7));
  const hp = v.filter('highpass', 6200, 0.9);
  const g = v.gain(0);
  v.chain(src, hp, g, v.out);
  const end = perc(g.gain, t, peak, 0.001, rnd(0.02, 0.04));
  v.run(src, t, end + 0.01);
  v.seal();
}

/** A slow band of air — the wind under the menu and the swells in flight. */
function airSwell(v: Voice, t: number, duration: number, peak: number, centre: number): void {
  const src = v.buf('pink', rnd(0.5, 0.8));
  const bp = v.filter('bandpass', centre, 1.2);
  const g = v.gain(0);
  v.chain(src, bp, g, v.out);
  sweep(bp.frequency, t, centre * 0.7, centre * 1.9, duration);
  const end = ahr(g.gain, t, peak, duration * 0.45, 0.02, duration * 0.5);
  v.run(src, t, end + 0.02);
  v.seal();
}

/* ------------------------------------------------------------------ */
/* Track material                                                      */
/* ------------------------------------------------------------------ */

/** Menu chord cycle: Dm9 - Am7 - Cadd9 - Gsus2, one bar each. */
const MENU_CHORDS: readonly (readonly number[])[] = [
  [50, 57, 60, 64, 69],
  [45, 52, 55, 60, 64],
  [48, 55, 59, 62, 67],
  [43, 50, 55, 57, 62],
];

/** Flight bass roots, one per bar. Modal movement, no leading tones. */
const FLIGHT_ROOTS = [38, 38, 36, 43] as const;
/** Which 16ths the bass speaks on. Gaps matter more than the notes. */
const BASS_MASK = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0] as const;
/** Arpeggio rhythm and its scale degrees, read modulo their own lengths. */
const ARP_MASK = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1] as const;
const ARP_DEGREES = [7, 9, 11, 14, 11, 9, 12, 9] as const;

/* ------------------------------------------------------------------ */
/* Director                                                            */
/* ------------------------------------------------------------------ */

export class MusicDirector {
  private readonly target: SynthTarget;
  private track: MusicTrack | null = null;
  private out: GainNode | null = null;
  private layers: Record<LayerName, GainNode> | null = null;
  private targets: Record<LayerName, SynthTarget> | null = null;
  private drones: Voice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  private step = 0;
  private nextTime = 0;
  private stepDur = 0.26;
  private baseStepDur = 0.26;
  private steps = 64;
  private intensity = 0;
  /** Current target level per layer, so silent layers can be skipped entirely. */
  private levels: Record<LayerName, number> = { base: 1, bass: 0, arp: 0, shimmer: 0 };

  constructor(target: SynthTarget) {
    this.target = target;
  }

  get current(): MusicTrack | null {
    return this.track;
  }

  play(track: MusicTrack): void {
    if (this.track === track) return;
    this.stop(0.4);
    const ctx = this.target.ctx;

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.target.dry);
    this.out = out;

    const layers = {} as Record<LayerName, GainNode>;
    const targets = {} as Record<LayerName, SynthTarget>;
    for (const name of LAYER_NAMES) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      layers[name] = g;
      targets[name] = { ctx, assets: this.target.assets, dry: g, send: this.target.send };
    }
    this.layers = layers;
    this.targets = targets;

    this.track = track;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    // Levels first: the drones below are created through `voice()`, which
    // refuses to build anything for a layer that is not going to be heard.
    this.applyLayers(true);

    if (track === 'menu') {
      this.baseStepDur = 0.26;
      this.steps = 64;
      this.startMenu();
    } else if (track === 'flight') {
      this.baseStepDur = 0.115;
      this.steps = 64;
      this.startFlight();
    } else {
      this.baseStepDur = 0.18;
      this.steps = 32;
      this.startDestroyer();
    }
    this.stepDur = this.baseStepDur;

    if (this.timer === null) this.timer = setInterval(this.tick, TICK_MS);
  }

  stop(fade = 1.5): void {
    const out = this.out;
    const layers = this.layers;
    if (out) {
      const now = this.target.ctx.currentTime;
      hold(out.gain, now);
      out.gain.linearRampToValueAtTime(0, now + fade);
    }
    for (const d of this.drones) d.release(fade);
    this.drones = [];
    if (out || layers) {
      // Disconnect only after the fade has actually finished playing out.
      setTimeout(
        () => {
          if (layers) for (const name of LAYER_NAMES) layers[name].disconnect();
          if (out) out.disconnect();
        },
        (fade + 0.25) * 1000,
      );
    }
    this.out = null;
    this.layers = null;
    this.targets = null;
    this.track = null;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setIntensity(x: number): void {
    this.intensity = clamp(x, 0, 1);
    this.applyLayers(false);
    // A touch of tempo lift at speed. Only future steps are affected, so this
    // can be driven every frame without disturbing anything already scheduled.
    if (this.track === 'flight') this.stepDur = this.baseStepDur * (1 - 0.06 * this.intensity);
  }

  /** Pause the scheduler while the context is suspended. */
  suspend(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resume(): void {
    if (this.track !== null && this.timer === null) {
      this.nextTime = this.target.ctx.currentTime + 0.08;
      this.timer = setInterval(this.tick, TICK_MS);
    }
  }

  dispose(): void {
    this.stop(0.05);
  }

  /* --- layering ----------------------------------------------------- */

  private applyLayers(immediate: boolean): void {
    const layers = this.layers;
    if (!layers) return;
    const now = this.target.ctx.currentTime;
    const k = this.intensity;

    let base = 1;
    let bass = 0;
    let arp = 0;
    let shimmer = 0;

    if (this.track === 'flight') {
      // Overlapping fade windows: something is always arriving or leaving, so
      // the mix reads as continuous change rather than as layers switching on.
      bass = smoothstep(0.08, 0.34, k);
      arp = smoothstep(0.32, 0.62, k);
      shimmer = smoothstep(0.58, 0.92, k);
      base = 1 - 0.25 * shimmer;
    } else if (this.track === 'menu') {
      bass = 1;
      arp = 0;
      shimmer = 1;
    } else if (this.track === 'destroyer') {
      bass = 1;
      arp = 1;
      shimmer = 1;
    }

    this.levels = { base, bass, arp, shimmer };
    for (const name of LAYER_NAMES) {
      const p = layers[name].gain;
      if (immediate) p.setValueAtTime(this.levels[name], now);
      else p.setTargetAtTime(this.levels[name], now, 0.25);
    }
  }

  /**
   * Every note in every track is built here, which is also where inaudible
   * layers are dropped: below the threshold the nodes would be rendered and
   * then multiplied by ~0, so a low-intensity flight loop costs almost nothing.
   */
  private voice(layer: LayerName, gain: number, pan = 0, send = 0): Voice | null {
    const targets = this.targets;
    if (!targets || this.levels[layer] < 0.02) return null;
    return new Voice(targets[layer], { gain, pan, send });
  }

  /* --- track setup -------------------------------------------------- */

  private startMenu(): void {
    // A wide, slow band of air: the ship's deck, before anything happens.
    const v = this.voice('base', 0.16, 0, 0.2);
    if (!v) return;
    const t = this.target.ctx.currentTime;
    const src = v.buf('brown', 0.5, true);
    const bp = v.filter('bandpass', 420, 0.7);
    const g = v.gain(0);
    v.chain(src, bp, g, v.out);
    ahr(g.gain, t, 1, 3, 36000, 2);
    const lfo = v.osc('sine', 0.06);
    const depth = v.gain(220);
    v.chain(lfo, depth, bp.frequency);
    v.run(src, t);
    v.run(lfo, t);
    this.drones.push(v);
  }

  private startFlight(): void {
    // A held tonic under everything, so even at intensity 0 the loop has floor.
    const v = this.voice('base', 0.13, 0, 0.1);
    if (!v) return;
    const t = this.target.ctx.currentTime;
    const stack = v.stack('sawtooth', mtof(ROOT_MIDI - 12), 2, 7);
    const lp = v.filter('lowpass', 190, 1.6);
    const g = v.gain(0);
    v.chain(stack.node, lp, g, v.out);
    ahr(g.gain, t, 1, 1.5, 36000, 1.5);
    const lfo = v.osc('sine', 0.13);
    const depth = v.gain(60);
    v.chain(lfo, depth, lp.frequency);
    for (const o of stack.oscs) v.run(o, t);
    v.run(lfo, t);
    this.drones.push(v);
  }

  private startDestroyer(): void {
    const t = this.target.ctx.currentTime;

    const sub = this.voice('base', 0.3, 0, 0.05);
    if (sub) {
      const o = sub.osc('sine', mtof(ROOT_MIDI - 24));
      const g = sub.gain(0);
      sub.chain(o, g, sub.out);
      ahr(g.gain, t, 1, 2, 36000, 1.5);
      sub.run(o, t);
      this.drones.push(sub);
    }

    const drone = this.voice('bass', 0.22, 0, 0.2);
    if (drone) {
      const stack = drone.stack('sawtooth', mtof(ROOT_MIDI - 12), 3, 14);
      const shape = drone.shaper(drone.assets.shapes.soft, '2x');
      const lp = drone.filter('lowpass', 220, 3);
      const g = drone.gain(0);
      drone.chain(stack.node, shape, lp, g, drone.out);
      ahr(g.gain, t, 1, 2.5, 36000, 1.5);
      // Very slow cutoff drift: the void breathing.
      const lfo = drone.osc('sine', 0.07);
      const depth = drone.gain(130);
      drone.chain(lfo, depth, lp.frequency);
      for (const o of stack.oscs) drone.run(o, t);
      drone.run(lfo, t);
      this.drones.push(drone);
    }
  }

  /* --- scheduling --------------------------------------------------- */

  private readonly tick = (): void => {
    if (this.track === null) return;
    const ctx = this.target.ctx;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // If the timer was throttled (background tab) the queue is behind the clock.
    // Resync rather than firing a burst of catch-up notes.
    if (this.nextTime < now) this.nextTime = now + 0.03;
    let guard = 0;
    while (this.nextTime < now + LOOKAHEAD && guard++ < 64) {
      this.schedule(this.step, this.nextTime);
      this.step = (this.step + 1) % this.steps;
      this.nextTime += this.stepDur;
    }
  };

  private schedule(step: number, when: number): void {
    if (this.track === 'menu') this.scheduleMenu(step, when);
    else if (this.track === 'flight') this.scheduleFlight(step, when);
    else this.scheduleDestroyer(step, when);
  }

  private scheduleMenu(step: number, when: number): void {
    const bar = Math.floor(step / 16);
    const within = step % 16;

    if (within === 0) {
      const chord = MENU_CHORDS[bar % MENU_CHORDS.length];
      for (let i = 0; i < chord.length; i++) {
        const v = this.voice('bass', 0.09, rnd(-0.25, 0.25), 0.3);
        if (v) padNote(v, when, mtof(chord[i]), this.stepDur * 17, 1);
      }
    }

    // Wind chimes: probabilistic, never on a grid the ear can lock onto.
    if (within % 2 === 0 && Math.random() < 0.16) {
      const v = this.voice('shimmer', 0.075, rnd(-0.8, 0.8), 0.5);
      if (v) bellNote(v, when + rnd(0, 0.04), pentHz(12 + Math.floor(rnd(0, 7))), 2.6, 1);
    }

    // One low bloom every other bar keeps the drift from feeling static.
    if (within === 8 && bar % 2 === 1) {
      const v = this.voice('base', 0.06, rnd(-0.3, 0.3), 0.4);
      if (v) airSwell(v, when, this.stepDur * 12, 1, 900);
    }
  }

  private scheduleFlight(step: number, when: number): void {
    const bar = Math.floor(step / 16);
    const within = step % 16;

    if (within === 0 || within === 8) {
      const v = this.voice('base', 0.22);
      if (v) pulseNote(v, when, 120, 44, within === 0 ? 1 : 0.7);
    }

    if (BASS_MASK[within] === 1) {
      const root = FLIGHT_ROOTS[bar % FLIGHT_ROOTS.length];
      const v = this.voice('bass', 0.16, 0, 0.05);
      if (v) bassNote(v, when, mtof(root), this.stepDur * 2.4, 1);
    }

    if (ARP_MASK[within] === 1) {
      const idx = (bar * 16 + within) % ARP_DEGREES.length;
      // The bar's bass root transposes the arp, so the same eight degrees give
      // four different colours across the loop.
      const shift = FLIGHT_ROOTS[bar % FLIGHT_ROOTS.length] - FLIGHT_ROOTS[0];
      const v = this.voice('arp', 0.08, rnd(-0.35, 0.35), 0.22);
      if (v) pluckNote(v, when, scaleHz(ARP_DEGREES[idx]) * Math.pow(2, shift / 12), 0.19, 1);
    }

    if (within % 4 === 2) {
      const v = this.voice('arp', 0.05, rnd(-0.4, 0.4));
      if (v) hatNote(v, when, within % 8 === 2 ? 1 : 0.6);
    }

    if (step % 16 === 4 && bar % 2 === 0) {
      const v = this.voice('shimmer', 0.07, rnd(-0.5, 0.5), 0.45);
      if (v) bellNote(v, when, pentHz(17 + (bar % 3)), 1.8, 1);
    }
    if (step % 32 === 24) {
      const v = this.voice('shimmer', 0.05, rnd(-0.4, 0.4), 0.4);
      if (v) airSwell(v, when, this.stepDur * 10, 1, 3200);
    }
  }

  private scheduleDestroyer(step: number, when: number): void {
    if (step % 32 === 0) {
      const v = this.voice('base', 0.3, 0, 0.1);
      if (v) pulseNote(v, when, 90, 28, 1);
    }
    if (step % 8 === 4) {
      const v = this.voice('arp', 0.06, rnd(-0.6, 0.6), 0.5);
      if (v) airSwell(v, when, this.stepDur * 7, 1, rnd(1600, 3400));
    }
    if (step % 16 === 12) {
      // A flattened fifth against the tonic drone: the interval that tells the
      // player this is not the same game any more.
      const v = this.voice('shimmer', 0.055, rnd(-0.5, 0.5), 0.6);
      if (v) bellNote(v, when, mtof(ROOT_MIDI + 18), 3.2, 1);
    }
  }
}
