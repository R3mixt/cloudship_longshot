/**
 * The public face of the audio system.
 *
 * Everything the rest of the game needs goes through the `audio` singleton at
 * the bottom of this file. The engine owns the AudioContext, the bus, the voice
 * pools and the music director; nothing else in the codebase should have to
 * know that Web Audio exists.
 *
 * Failure is always silent. If the browser has no Web Audio, or the context is
 * never unlocked by a gesture, every method here becomes a no-op and the game
 * plays exactly as it otherwise would.
 *
 * Bus layout:
 *
 *   voices ──► sfx ──┐
 *      └──► sfxSend ──► plate ──► sfx ──┤
 *   music ──────────┐                   ├──► mix ──► limiter ──► master ──► out
 *      └──► musSend ──► plate + delay ──┘
 *
 * The limiter sits *before* the master volume so the amount of limiting depends
 * on the programme material, not on where the player left the slider.
 */

import { MusicDirector, type MusicTrack } from './music';
import {
  ChargeVoice,
  LOOP_IDS,
  RECIPES,
  SFX_SPEC,
  type SfxId,
  type SfxParams,
} from './sfx';
import { type AudioAssets, type SynthTarget, Voice, clamp, createAssets, hold } from './synth';

export type { SfxId } from './sfx';
export type { MusicTrack } from './music';

export interface SfxOptions {
  /** Linear multiplier on the sound's mix gain. 1 is the designed level. */
  volume?: number;
  /** Playback rate / pitch multiplier. 1 is the designed pitch. */
  rate?: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
  /** Extra pitch offset in cents, applied on top of `rate`. */
  detune?: number;
}

export interface VolumeSettings {
  master: number;
  music: number;
  sfx: number;
}

/** Hard ceiling on simultaneous sfx voices, independent of the per-id caps. */
const MAX_VOICES = 22;
/** Volume slider ramp. Long enough to avoid a click, short enough to feel live. */
const VOLUME_RAMP = 0.04;

interface Bus {
  mix: GainNode;
  limiter: DynamicsCompressorNode;
  master: GainNode;
  music: GainNode;
  musicSend: GainNode;
  sfx: GainNode;
  sfxSend: GainNode;
  nodes: AudioNode[];
}

interface ActiveVoice {
  id: SfxId;
  voice: Voice;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function findAudioContext(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bus: Bus | null = null;
  private assets: AudioAssets | null = null;
  private sfxTarget: SynthTarget | null = null;
  private music: MusicDirector | null = null;

  private readonly active: ActiveVoice[] = [];
  private readonly loops = new Map<SfxId, Voice>();
  private charge: ChargeVoice | null = null;

  private volumes: VolumeSettings = { master: 0.8, music: 0.55, sfx: 0.9 };
  private pendingTrack: MusicTrack | null = null;
  private resuming = false;
  private unavailable = false;
  private suspended = false;

  /* --- lifecycle ---------------------------------------------------- */

  /** Create the context and bus. Safe to call as often as you like. */
  init(): void {
    if (this.ctx !== null || this.unavailable) return;
    const Ctor = findAudioContext();
    if (Ctor === null) {
      this.unavailable = true;
      return;
    }
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.assets = createAssets(ctx);
      this.bus = this.buildBus(ctx, this.assets);
      this.sfxTarget = {
        ctx,
        assets: this.assets,
        dry: this.bus.sfx,
        send: this.bus.sfxSend,
      };
      this.music = new MusicDirector({
        ctx,
        assets: this.assets,
        dry: this.bus.music,
        send: this.bus.musicSend,
      });
      ctx.onstatechange = this.onStateChange;
      this.applyVolumes(true);
    } catch {
      // No usable audio hardware or the context limit was hit. Stay silent.
      this.unavailable = true;
      this.ctx = null;
      this.bus = null;
      this.assets = null;
      this.sfxTarget = null;
      this.music = null;
    }
  }

  /** Call from a real user gesture (pointerdown / keydown). */
  unlock(): void {
    this.init();
    const ctx = this.ctx;
    if (ctx === null) return;
    this.suspended = false;
    if (ctx.state === 'running') {
      this.afterResume();
      return;
    }
    this.resuming = true;
    try {
      void ctx
        .resume()
        .then(() => {
          this.resuming = false;
          this.afterResume();
        })
        .catch(() => {
          this.resuming = false;
        });
    } catch {
      this.resuming = false;
    }
    // A one-sample buffer through the destination satisfies mobile browsers
    // that only consider a context unlocked once something has actually played.
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      src.onended = () => src.disconnect();
    } catch {
      /* nothing to do; the resume above is the real unlock */
    }
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** True once init() has decided audio can never work here. */
  get available(): boolean {
    return !this.unavailable;
  }

  private get live(): boolean {
    if (this.ctx === null || this.suspended) return false;
    return this.ctx.state === 'running' || this.resuming;
  }

  private buildBus(ctx: AudioContext, assets: AudioAssets): Bus {
    const master = ctx.createGain();
    master.gain.value = this.volumes.master;
    master.connect(ctx.destination);

    // Catches the stacked peaks of the destroyer cascade and heavy hit chains
    // without audibly pumping on ordinary play.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    limiter.connect(master);

    const mix = ctx.createGain();
    mix.gain.value = 0.9; // headroom below the limiter
    mix.connect(limiter);

    const music = ctx.createGain();
    music.gain.value = this.volumes.music;
    music.connect(mix);

    const sfx = ctx.createGain();
    sfx.gain.value = this.volumes.sfx;
    sfx.connect(mix);

    // Two convolvers share one generated impulse: separate nodes so muting the
    // sfx bus cannot also mute the music's tail.
    const sfxPlate = ctx.createConvolver();
    sfxPlate.buffer = assets.room;
    sfxPlate.normalize = true;
    const sfxReturn = ctx.createGain();
    sfxReturn.gain.value = 0.85;
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 1;
    sfxSend.connect(sfxPlate);
    sfxPlate.connect(sfxReturn);
    sfxReturn.connect(sfx);

    const musicPlate = ctx.createConvolver();
    musicPlate.buffer = assets.room;
    musicPlate.normalize = true;
    const musicReturn = ctx.createGain();
    musicReturn.gain.value = 0.8;
    const musicSend = ctx.createGain();
    musicSend.gain.value = 1;
    musicSend.connect(musicPlate);
    musicPlate.connect(musicReturn);
    musicReturn.connect(music);

    // Dotted-eighth echo at the flight tempo, so chimes fall back into the grid.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.345;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const delayReturn = ctx.createGain();
    delayReturn.gain.value = 0.3;
    const delayDamp = ctx.createBiquadFilter();
    delayDamp.type = 'lowpass';
    delayDamp.frequency.value = 2600;
    musicSend.connect(delay);
    delay.connect(delayDamp);
    delayDamp.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayReturn);
    delayReturn.connect(music);

    return {
      mix,
      limiter,
      master,
      music,
      musicSend,
      sfx,
      sfxSend,
      nodes: [
        sfxPlate,
        sfxReturn,
        musicPlate,
        musicReturn,
        delay,
        delayDamp,
        feedback,
        delayReturn,
      ],
    };
  }

  private readonly onStateChange = (): void => {
    if (this.ctx !== null && this.ctx.state === 'running') this.afterResume();
  };

  private afterResume(): void {
    if (this.music === null) return;
    if (this.pendingTrack !== null && this.music.current !== this.pendingTrack) {
      this.music.play(this.pendingTrack);
    } else {
      this.music.resume();
    }
  }

  /* --- sound effects ------------------------------------------------ */

  play(id: SfxId, opts?: SfxOptions): void {
    if (!this.live) return;
    const target = this.sfxTarget;
    const spec = SFX_SPEC[id];
    if (target === null || spec === undefined) return;

    const isLoop = LOOP_IDS.indexOf(id) >= 0;
    if (isLoop && this.loops.has(id)) return;

    const params: SfxParams = {
      volume: clamp(opts?.volume ?? 1, 0, 4),
      rate: clamp(opts?.rate ?? 1, 0.25, 4),
      pan: clamp(opts?.pan ?? 0, -1, 1),
      detune: clamp(opts?.detune ?? 0, -2400, 2400),
    };

    this.makeRoom(id, spec.cap);

    const ctx = target.ctx;
    // A hair of latency: scheduling exactly at currentTime risks the first
    // milliseconds of an envelope being dropped mid-render-quantum.
    const when = ctx.currentTime + 0.005;
    let voice: Voice;
    try {
      voice = new Voice(target, {
        gain: spec.gain * params.volume,
        pan: params.pan,
        send: spec.send,
      });
    } catch {
      return;
    }

    try {
      if (id === 'charge.loop') {
        this.charge = new ChargeVoice(voice, when, params);
        this.loops.set(id, voice);
        this.track(id, voice);
        return;
      }
      const duration = RECIPES[id](voice, when, params);
      if (!Number.isFinite(duration)) {
        this.loops.set(id, voice);
      } else {
        voice.seal();
      }
      this.track(id, voice);
    } catch {
      voice.dispose();
    }
  }

  stopLoop(id: SfxId): void {
    const voice = this.loops.get(id);
    if (voice === undefined) return;
    this.loops.delete(id);
    if (id === 'charge.loop') this.charge = null;
    voice.release(0.12);
  }

  /** Release every looping voice — use on scene changes and on death. */
  stopAllLoops(): void {
    for (const id of Array.from(this.loops.keys())) this.stopLoop(id);
  }

  isLoopPlaying(id: SfxId): boolean {
    return this.loops.has(id);
  }

  /** Drive the charge loop, 0..1. Ignored when the loop is not playing. */
  setChargeProgress(t: number): void {
    if (this.charge === null) return;
    if (this.charge.voice.ended) {
      this.charge = null;
      this.loops.delete('charge.loop');
      return;
    }
    this.charge.setProgress(t);
  }

  private track(id: SfxId, voice: Voice): void {
    const entry: ActiveVoice = { id, voice };
    this.active.push(entry);
    voice.onDispose = () => {
      const i = this.active.indexOf(entry);
      if (i >= 0) this.active.splice(i, 1);
      if (this.loops.get(id) === voice) {
        this.loops.delete(id);
        if (id === 'charge.loop') this.charge = null;
      }
    };
  }

  /**
   * Voice stealing. The per-id cap stops one sound (the destroyer cascade fires
   * ten pops a second) from owning the graph; the global cap stops a pile-up of
   * different sounds from doing the same.
   */
  private makeRoom(id: SfxId, cap: number): void {
    let count = 0;
    for (const entry of this.active) if (entry.id === id) count++;
    while (count >= cap) {
      const victim = this.active.find((e) => e.id === id);
      if (victim === undefined) break;
      victim.voice.release(0.02);
      const i = this.active.indexOf(victim);
      if (i >= 0) this.active.splice(i, 1);
      count--;
    }
    while (this.active.length >= MAX_VOICES) {
      const victim = this.active.find((e) => !this.loops.has(e.id)) ?? this.active[0];
      victim.voice.release(0.02);
      const i = this.active.indexOf(victim);
      if (i >= 0) this.active.splice(i, 1);
      else break;
    }
  }

  /* --- music -------------------------------------------------------- */

  playMusic(track: MusicTrack): void {
    this.pendingTrack = track;
    if (!this.live || this.music === null) return;
    this.music.play(track);
  }

  stopMusic(fadeSeconds = 1.2): void {
    this.pendingTrack = null;
    this.music?.stop(Math.max(0.02, fadeSeconds));
  }

  /** 0..1 — altitude / speed aware layering for the flight loop. */
  setMusicLayer(intensity: number): void {
    this.music?.setIntensity(clamp(intensity, 0, 1));
  }

  get currentMusic(): MusicTrack | null {
    return this.music?.current ?? null;
  }

  /* --- mixing ------------------------------------------------------- */

  setVolumes(v: VolumeSettings): void {
    this.volumes = {
      master: clamp(v.master, 0, 1),
      music: clamp(v.music, 0, 1),
      sfx: clamp(v.sfx, 0, 1),
    };
    this.applyVolumes(false);
  }

  getVolumes(): Readonly<VolumeSettings> {
    return this.volumes;
  }

  private applyVolumes(immediate: boolean): void {
    const bus = this.bus;
    const ctx = this.ctx;
    if (bus === null || ctx === null) return;
    const now = ctx.currentTime;
    const set = (param: AudioParam, value: number): void => {
      if (immediate) {
        param.setValueAtTime(value, now);
        return;
      }
      hold(param, now);
      // Linear, not exponential: only a linear ramp actually reaches zero, and
      // a muted slider has to be true silence.
      param.linearRampToValueAtTime(value, now + VOLUME_RAMP);
    };
    set(bus.master.gain, this.volumes.master);
    set(bus.music.gain, this.volumes.music);
    set(bus.sfx.gain, this.volumes.sfx);
  }

  /* --- background tab ----------------------------------------------- */

  suspend(): void {
    this.suspended = true;
    this.music?.suspend();
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running') return;
    try {
      void ctx.suspend().catch(() => undefined);
    } catch {
      /* already suspended */
    }
  }

  resume(): void {
    this.suspended = false;
    const ctx = this.ctx;
    if (ctx === null) return;
    if (ctx.state === 'running') {
      this.afterResume();
      return;
    }
    this.resuming = true;
    try {
      void ctx
        .resume()
        .then(() => {
          this.resuming = false;
          this.afterResume();
        })
        .catch(() => {
          this.resuming = false;
        });
    } catch {
      this.resuming = false;
    }
  }

  destroy(): void {
    for (const entry of this.active.slice()) entry.voice.dispose();
    this.active.length = 0;
    this.loops.clear();
    this.charge = null;
    this.music?.dispose();
    this.music = null;
    const bus = this.bus;
    if (bus !== null) {
      for (const n of bus.nodes) n.disconnect();
      bus.mix.disconnect();
      bus.limiter.disconnect();
      bus.master.disconnect();
      bus.music.disconnect();
      bus.musicSend.disconnect();
      bus.sfx.disconnect();
      bus.sfxSend.disconnect();
    }
    this.bus = null;
    this.sfxTarget = null;
    this.assets = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.pendingTrack = null;
    if (ctx !== null) {
      ctx.onstatechange = null;
      try {
        void ctx.close().catch(() => undefined);
      } catch {
        /* context already closed */
      }
    }
  }
}

/** Process-wide instance. Import this, not the class. */
export const audio = new AudioEngine();
