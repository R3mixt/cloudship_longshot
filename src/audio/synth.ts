/**
 * Synthesis primitives shared by every sound in the game.
 *
 * Two rules keep the audio graph healthy:
 *
 *  1. Sample data (noise beds, the room impulse) is generated once at init and
 *     shared by reference. Variation between repeats comes from `playbackRate`,
 *     filter offsets and pitch jitter — never from regenerating buffers.
 *  2. Every transient sound lives inside a `Voice`, which disconnects its whole
 *     sub-graph once its sources have ended. Nothing accumulates on the bus.
 */

/** Exponential ramps cannot reach zero; this is the practical floor. */
export const EPS = 0.0001;

export type NoiseKind = 'white' | 'pink' | 'brown' | 'metal';

/** Exactly the array flavour `WaveShaperNode.curve` accepts. */
export type ShapeCurve = NonNullable<WaveShaperNode['curve']>;

export interface ShaperBank {
  /** Gentle saturation: adds even harmonics without obvious distortion. */
  soft: ShapeCurve;
  /** Aggressive clip for blackflame grit and the destroyer drop. */
  hard: ShapeCurve;
  /** Wavefolder — turns a clean sine into a bright, metallic timbre. */
  fold: ShapeCurve;
}

export interface AudioAssets {
  noise: Record<NoiseKind, AudioBuffer>;
  shapes: ShaperBank;
  /** Small generated room used as a convolver impulse response. */
  room: AudioBuffer;
}

/** A destination pair: dry input plus a shared reverb send. */
export interface SynthTarget {
  ctx: AudioContext;
  assets: AudioAssets;
  dry: AudioNode;
  send: AudioNode;
}

/* ------------------------------------------------------------------ */
/* Random helpers                                                      */
/* ------------------------------------------------------------------ */

export function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Symmetric jitter in cents, used to keep repeated hits from phasing alike. */
export function jitter(cents: number): number {
  return (Math.random() * 2 - 1) * cents;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length) % items.length];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** MIDI note number to frequency. */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Ratio for a pitch offset in semitones. */
export function semi(n: number): number {
  return Math.pow(2, n / 12);
}

/* ------------------------------------------------------------------ */
/* Musical material                                                    */
/* ------------------------------------------------------------------ */

/**
 * The whole score sits in D dorian. Sharing one mode between the menu, flight
 * and pickup sounds means a chime landing over the music is always consonant,
 * and menu -> flight transitions never clash.
 */
export const ROOT_MIDI = 50; // D3
export const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
/** D minor pentatonic — used for anything that fires at unpredictable times. */
export const PENTATONIC = [0, 3, 5, 7, 10] as const;

/** Scale degree (may be negative or beyond an octave) to a MIDI note. */
export function degree(scale: readonly number[], index: number, root = ROOT_MIDI): number {
  const n = scale.length;
  const octave = Math.floor(index / n);
  const step = ((index % n) + n) % n;
  return root + octave * 12 + scale[step];
}

/* ------------------------------------------------------------------ */
/* Buffers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Noise beds. White is the raw source; pink and brown are progressively darker
 * and are what most impacts actually use — white noise alone reads as "hiss"
 * at 320x180, while brown noise reads as "weight".
 */
export function createNoiseBuffer(ctx: AudioContext, seconds: number, kind: NoiseKind): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === 'white') {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Kellett's economical pink filter: seven one-poles summed.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    // Metal: a bank of inharmonic partials with independent decays, plus a
    // sliver of noise for the initial strike. Played back at varying rates this
    // is the body of every clang, shatter and rune ring in the game.
    const partials = [1, 2.71, 4.13, 5.42, 7.09, 9.31, 11.8, 14.2, 17.5];
    const base = 190 / ctx.sampleRate;
    for (let p = 0; p < partials.length; p++) {
      const w = 2 * Math.PI * base * partials[p];
      const phase = Math.random() * Math.PI * 2;
      const decay = 3 + p * 1.6;
      const amp = 1 / (1 + p * 0.8);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] += Math.sin(phase + w * i) * amp * Math.exp(-decay * t);
      }
    }
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = data[i] * 0.32 + (Math.random() * 2 - 1) * Math.exp(-90 * t) * 0.5;
    }
  }

  // Normalise so recipe gains mean the same thing across every bed.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    const g = 0.98 / peak;
    for (let i = 0; i < len; i++) data[i] *= g;
  }
  return buffer;
}

/**
 * A generated impulse response. Rather than pure exponential noise this builds
 * a short pre-delay, a handful of discrete early reflections and a diffuse
 * tail that is progressively low-passed, which is what stops the reverb from
 * sounding like a hiss cloud sitting on top of the mix.
 */
export function createRoomImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, len, rate);
  const reflections = [0.011, 0.019, 0.031, 0.043, 0.057, 0.079, 0.101];

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // Diffuse tail with a one-pole low-pass that closes as the tail decays,
    // mimicking air absorption.
    let lp = 0;
    let coef = 0.55;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      lp += ((Math.random() * 2 - 1) - lp) * coef;
      coef = 0.55 - 0.45 * t;
      data[i] = lp * env * 0.6;
    }
    // Early reflections give the tail a sense of size before it smears.
    for (let r = 0; r < reflections.length; r++) {
      const offset = Math.floor((reflections[r] + (ch === 0 ? 0 : 0.004)) * rate);
      if (offset < len) data[offset] += (r % 2 === 0 ? 1 : -1) * (0.5 / (1 + r));
    }
  }
  return buffer;
}

/* ------------------------------------------------------------------ */
/* Waveshaper curves                                                   */
/* ------------------------------------------------------------------ */

function makeSaturationCurve(amount: number, n = 1024): ShapeCurve {
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function makeFoldCurve(n = 1024): ShapeCurve {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.sin(x * Math.PI * 1.6) * 0.8;
  }
  return curve;
}

export function createAssets(ctx: AudioContext): AudioAssets {
  return {
    noise: {
      white: createNoiseBuffer(ctx, 1.4, 'white'),
      pink: createNoiseBuffer(ctx, 1.8, 'pink'),
      brown: createNoiseBuffer(ctx, 2.4, 'brown'),
      metal: createNoiseBuffer(ctx, 1.2, 'metal'),
    },
    shapes: {
      soft: makeSaturationCurve(2.5),
      hard: makeSaturationCurve(22),
      fold: makeFoldCurve(),
    },
    room: createRoomImpulse(ctx, 1.7, 2.6),
  };
}

/* ------------------------------------------------------------------ */
/* Envelopes and sweeps                                                */
/* ------------------------------------------------------------------ */

/** Cancel pending automation and pin the param at its current value. */
export function hold(param: AudioParam, when: number): void {
  const v = param.value;
  param.cancelScheduledValues(when);
  param.setValueAtTime(v, when);
}

/**
 * Percussive envelope: linear attack (short enough to read as instant, long
 * enough to avoid a click) then an exponential fall to silence.
 * Returns the absolute time the tail ends.
 */
export function perc(
  param: AudioParam,
  t0: number,
  peak: number,
  attack: number,
  decay: number,
): number {
  param.setValueAtTime(EPS, t0);
  param.linearRampToValueAtTime(Math.max(peak, EPS), t0 + attack);
  param.exponentialRampToValueAtTime(EPS, t0 + attack + decay);
  param.setValueAtTime(0, t0 + attack + decay);
  return t0 + attack + decay;
}

/** Attack / hold / release with a flat sustain in the middle. */
export function ahr(
  param: AudioParam,
  t0: number,
  peak: number,
  attack: number,
  sustain: number,
  release: number,
): number {
  param.setValueAtTime(EPS, t0);
  param.linearRampToValueAtTime(Math.max(peak, EPS), t0 + attack);
  param.setValueAtTime(Math.max(peak, EPS), t0 + attack + sustain);
  param.exponentialRampToValueAtTime(EPS, t0 + attack + sustain + release);
  param.setValueAtTime(0, t0 + attack + sustain + release);
  return t0 + attack + sustain + release;
}

export type CurveShape = 'swell' | 'pluck' | 'blast' | 'bloom' | 'wobble';

function buildCurve(kind: CurveShape, peak: number, points: number): Float32Array {
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    let v: number;
    switch (kind) {
      case 'swell':
        // Slow in, slow out — used where a sound should feel inhaled.
        v = Math.sin(Math.PI * t) ** 1.6;
        break;
      case 'pluck':
        v = Math.pow(1 - t, 3.2);
        break;
      case 'blast':
        // Near-instant front, long convex tail.
        v = t < 0.02 ? t / 0.02 : Math.pow(1 - (t - 0.02) / 0.98, 1.7);
        break;
      case 'bloom':
        // Reverse envelope: the sound arrives from nowhere and stops dead.
        v = Math.pow(t, 2.6);
        break;
      default:
        // Amplitude flutter, for wings and roaring flame.
        v = (0.55 + 0.45 * Math.sin(t * Math.PI * 9)) * Math.pow(1 - t, 1.2);
        break;
    }
    out[i] = v * peak;
  }
  out[points - 1] = 0;
  return out;
}

/** Envelope drawn as an explicit curve — for shapes ramps cannot express. */
export function curveEnv(
  param: AudioParam,
  t0: number,
  duration: number,
  peak: number,
  kind: CurveShape,
  points = 48,
): number {
  param.setValueCurveAtTime(buildCurve(kind, peak, points), t0, duration);
  return t0 + duration;
}

/** Frequency sweep. Exponential reads as musical, linear reads as mechanical. */
export function sweep(
  param: AudioParam,
  t0: number,
  from: number,
  to: number,
  duration: number,
  mode: 'exp' | 'lin' = 'exp',
): void {
  param.setValueAtTime(from, t0);
  if (mode === 'exp') param.exponentialRampToValueAtTime(Math.max(to, EPS), t0 + duration);
  else param.linearRampToValueAtTime(to, t0 + duration);
}

/** Smooth glide toward a target — used for continuously driven parameters. */
export function glide(param: AudioParam, when: number, target: number, tau = 0.05): void {
  param.setTargetAtTime(target, when, tau);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

/**
 * Duck-typed rather than `instanceof AudioNode`, so the module stays usable in
 * test environments that do not define the Web Audio globals.
 */
function isNode(target: AudioNode | AudioParam): target is AudioNode {
  return typeof (target as AudioNode).connect === 'function';
}

export interface VoiceOptions {
  /** Overall trim for the voice, applied after the recipe's own envelopes. */
  gain?: number;
  /** -1..1 stereo position. */
  pan?: number;
  /** 0..1 amount fed to the shared reverb bus. */
  send?: number;
}

/**
 * One playing sound. A voice owns its nodes, starts and stops them on the audio
 * clock, and tears the whole sub-graph down as soon as the last source ends.
 * Recipes should automate their own gains and leave `out.gain` alone — it is
 * reserved for the voice trim and for the fade applied by voice stealing.
 */
export class Voice {
  readonly ctx: AudioContext;
  readonly assets: AudioAssets;
  /** Recipes terminate their chains here. */
  readonly out: GainNode;
  /** Non-null when the platform supports stereo panning. */
  readonly panParam: AudioParam | null;

  /** Called once when the voice has torn itself down. */
  onDispose: (() => void) | null = null;

  private readonly panner: StereoPannerNode | null;
  private readonly sendGain: GainNode | null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private live = 0;
  private disposed = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private endTime = 0;

  constructor(target: SynthTarget, opts: VoiceOptions = {}) {
    const ctx = target.ctx;
    this.ctx = ctx;
    this.assets = target.assets;
    this.out = ctx.createGain();
    this.out.gain.value = opts.gain ?? 1;

    const pan = opts.pan ?? 0;
    const canPan = typeof ctx.createStereoPanner === 'function';
    this.panner = canPan ? ctx.createStereoPanner() : null;
    if (this.panner) {
      this.panner.pan.value = clamp(pan, -1, 1);
      this.out.connect(this.panner);
      this.panner.connect(target.dry);
      this.panParam = this.panner.pan;
    } else {
      this.out.connect(target.dry);
      this.panParam = null;
    }

    const send = opts.send ?? 0;
    if (send > 0) {
      this.sendGain = ctx.createGain();
      this.sendGain.gain.value = send;
      (this.panner ?? this.out).connect(this.sendGain);
      this.sendGain.connect(target.send);
    } else {
      this.sendGain = null;
    }
  }

  get ended(): boolean {
    return this.disposed;
  }

  /* --- node factories ------------------------------------------------ */

  osc(type: OscillatorType, freq: number, detuneCents = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detuneCents;
    return o;
  }

  /** A detuned stack summed into one gain — the cheapest way to sound "wide". */
  stack(
    type: OscillatorType,
    freq: number,
    count: number,
    spreadCents: number,
  ): { node: GainNode; oscs: OscillatorNode[] } {
    const node = this.gain(1 / Math.max(1, count));
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const o = this.osc(type, freq, offset * spreadCents + jitter(3));
      o.connect(node);
      oscs.push(o);
    }
    return { node, oscs };
  }

  buf(kind: NoiseKind, rate = 1, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.assets.noise[kind];
    s.playbackRate.value = rate;
    s.loop = loop;
    return s;
  }

  gain(value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  shaper(curve: ShapeCurve, oversample: OverSampleType = '2x'): WaveShaperNode {
    const w = this.ctx.createWaveShaper();
    w.curve = curve;
    w.oversample = oversample;
    this.nodes.push(w);
    return w;
  }

  delay(time: number, max = 1): DelayNode {
    const d = this.ctx.createDelay(max);
    d.delayTime.value = time;
    this.nodes.push(d);
    return d;
  }

  /**
   * Connect nodes head-to-tail; returns the last audio-rate node so it can be
   * routed on. The chain may terminate on an `AudioParam`, which is how
   * modulation (LFO -> depth -> cutoff) is wired.
   */
  chain(...nodes: (AudioNode | AudioParam)[]): AudioNode {
    let last: AudioNode = nodes[0] as AudioNode;
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i] as AudioNode;
      const to = nodes[i + 1];
      if (isNode(to)) {
        from.connect(to);
        last = to;
      } else {
        from.connect(to);
      }
    }
    return last;
  }

  /**
   * Schedule a source. Omitting `stopAt` marks the source as open-ended, which
   * is how looping voices (charge, storm, blackflame, void) stay alive until
   * something explicitly releases them.
   */
  run(node: AudioScheduledSourceNode, startAt: number, stopAt?: number): void {
    if (this.disposed) return;
    this.sources.push(node);
    node.start(startAt);
    if (stopAt !== undefined) {
      node.stop(stopAt);
      this.endTime = Math.max(this.endTime, stopAt);
      this.live++;
      node.onended = () => {
        this.live--;
        if (this.live <= 0) this.dispose();
      };
    }
  }

  /**
   * Arm the safety net. `onended` is the primary teardown path; the timer only
   * matters if the context is suspended mid-flight and never delivers it.
   */
  seal(): void {
    if (this.disposed || this.live === 0) return;
    const wait = Math.max(0.05, this.endTime - this.ctx.currentTime) + 0.4;
    this.watchdog = setTimeout(() => this.dispose(), wait * 1000);
  }

  /** Fade out and tear down early: voice stealing, stopLoop, scene changes. */
  release(fade = 0.08): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    hold(this.out.gain, now);
    this.out.gain.linearRampToValueAtTime(0, now + fade);
    for (const s of this.sources) {
      try {
        s.stop(now + fade + 0.01);
      } catch {
        /* already stopped */
      }
    }
    if (this.watchdog !== null) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.dispose(), (fade + 0.15) * 1000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    this.sources.length = 0;
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
    this.out.disconnect();
    if (this.panner) this.panner.disconnect();
    if (this.sendGain) this.sendGain.disconnect();
    const cb = this.onDispose;
    this.onDispose = null;
    if (cb) cb();
  }
}
