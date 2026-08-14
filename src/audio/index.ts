/**
 * Public surface of the audio module.
 *
 * Game code should only ever need `audio`, the `SfxId` union and `birdRate`.
 * The synthesis primitives are exported for the sound-test screen and for
 * anything that wants to build a one-off voice on the same bus.
 */

export { AudioEngine, audio } from './AudioEngine';
export type { SfxOptions, VolumeSettings } from './AudioEngine';
export { SFX_IDS, SFX_SPEC, LOOP_IDS, birdRate } from './sfx';
export type { SfxId, SfxSpec, SfxParams } from './sfx';
export type { MusicTrack } from './music';
export { MusicDirector } from './music';
export {
  DORIAN,
  PENTATONIC,
  ROOT_MIDI,
  Voice,
  createAssets,
  degree,
  mtof,
  smoothstep,
} from './synth';
export type { AudioAssets, NoiseKind, SynthTarget, VoiceOptions } from './synth';
