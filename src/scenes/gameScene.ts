import Phaser from 'phaser';
import type { SoundFn } from '@/app/types';
import { birdRate } from '@/audio';
import { debug } from '@/core/debug';
import { save } from '@/core/save';
import { CHARACTERS, type CharacterId } from '@/data/characters';
import { FEEL } from '@/data/feel';
import { FEATHER_COLORS, OBJECTS } from '@/data/objects';
import { WORLD, altitudeMeters } from '@/data/world';
import { ActorRenderer } from '@/render/actors';
import { EffectsRenderer } from '@/render/effects';
import { GroundRenderer } from '@/render/ground';
import { Hud } from '@/render/hud';
import { ObjectRenderer } from '@/render/objects';
import { DebugOverlay } from '@/render/debugOverlay';
import { SkyRenderer } from '@/render/sky';
import { MAX_STEP, Simulation } from '@/sim/simulation';
import type { SimEvent, SimState } from '@/sim/types';

export const GAME_SCENE = 'game';

export interface GameSceneData {
  character: CharacterId;
  playSound: SoundFn;
  onRunComplete: (sim: Simulation) => void;
  onPauseRequested: () => void;
  onReady: (scene: GameScene) => void;
}

type ChargeKey = 'SPACE' | 'ENTER';

/** Radians per tap of an aim key, and radians per second while one is held. */
const AIM_KEY_STEP = 0.05;
const AIM_KEY_RATE = 1.1;

const DEPTH = {
  sky: 0,
  ground: 10,
  actorsBack: 20,
  objects: 30,
  actors: 40,
  effects: 50,
  hud: 60,
  flash: 70,
  debug: 80,
};

/**
 * Drives one run: owns the simulation, the renderers, input and the camera, and
 * translates simulation events into feedback.
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private config!: GameSceneData;

  private sky!: SkyRenderer;
  private ground!: GroundRenderer;
  private objects!: ObjectRenderer;
  private actors!: ActorRenderer;
  private effects!: EffectsRenderer;
  private hud!: Hud;
  private debugOverlay: DebugOverlay | null = null;
  private flash!: Phaser.GameObjects.Rectangle;

  private camX = 0;
  private camY = 0;
  private lookahead = 0;
  private shake = 0;
  private hitstop = 0;
  private flashTime = 0;
  private elapsed = 0;
  private running = false;
  private paused = false;

  private pointerDownY = 0;
  private pointerDownX = 0;
  private pointerActive = false;
  private pointerMoved = false;
  private chargingKey: ChargeKey | null = null;
  private recordDistance = 0;
  private inputEnabled = false;
  private endDelay = 0;
  private aimKeys: { up: Phaser.Input.Keyboard.Key[]; down: Phaser.Input.Keyboard.Key[] } = {
    up: [],
    down: [],
  };

  constructor() {
    super(GAME_SCENE);
  }

  init(config: GameSceneData): void {
    this.config = config;
  }

  create(): void {
    const settings = save.settings;

    this.sky = new SkyRenderer(this, DEPTH.sky);
    this.ground = new GroundRenderer(this, DEPTH.ground);
    this.objects = new ObjectRenderer(this, DEPTH.objects);
    this.actors = new ActorRenderer(this, DEPTH.actors);
    this.effects = new EffectsRenderer(this, DEPTH.effects);
    this.hud = new Hud(this, DEPTH.hud);

    this.flash = this.add
      .rectangle(0, 0, WORLD.viewWidth, WORLD.viewHeight, 0xffffff)
      .setOrigin(0, 0)
      .setDepth(DEPTH.flash)
      .setScrollFactor(0)
      .setAlpha(0);

    if (debug.enabled && (debug.hitboxes || debug.fps)) {
      this.debugOverlay = new DebugOverlay(this, DEPTH.debug, debug.hitboxes, debug.fps);
    }

    this.effects.intensity = settings.reducedEffects ? 0.35 : 1;
    this.actors.showSpeedLines = settings.showSpeedLines;

    this.bindInput();
    this.startRun(this.config.character);
    this.enterMenuMode(this.config.character);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.config.onReady(this);
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Idles behind the interface: a live run sits in its aim phase with the HUD
   * hidden and input ignored, so the menu has the actual game world drifting
   * behind it rather than a still frame.
   */
  enterMenuMode(character: CharacterId): void {
    this.startRun(character);
    this.inputEnabled = false;
    this.hud.setVisible(false);
  }

  beginPlay(character: CharacterId): void {
    this.startRun(character);
    this.inputEnabled = true;
    this.hud.setVisible(true);
  }

  startRun(character: CharacterId): void {
    this.sim = new Simulation({
      character,
      seed: debug.seed !== null ? debug.seed : undefined,
    });
    this.sim.infiniteCharges = debug.infiniteCharges;

    this.recordDistance = CHARACTERS[character].noRecords ? 0 : save.record(character).distance;

    this.camX = this.sim.state.x - WORLD.viewWidth * FEEL.camera.anchorX;
    this.camY = this.sim.state.y - WORLD.viewHeight * FEEL.camera.anchorY;
    this.lookahead = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.flashTime = 0;
    this.running = true;
    this.paused = false;
    this.endDelay = 0;
    this.pointerActive = false;
    this.chargingKey = null;

    this.actors.reset();
    this.actors.setCharacter(character);
    this.effects.clear();
    this.objects.clear();
    this.hud.setVisible(true);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private teardown(): void {
    this.sky.destroy();
    this.ground.destroy();
    this.objects.destroy();
    this.actors.destroy();
    this.effects.destroy();
    this.hud.destroy();
    this.debugOverlay?.destroy();
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.inputEnabled || !this.running || this.paused) return;
      this.pointerActive = true;
      this.pointerMoved = false;
      this.pointerDownY = p.y;
      this.pointerDownX = p.x;
      if (this.sim.state.phase === 'aim') this.sim.setCharging(true);
      else if (this.sim.state.phase === 'fly') this.sim.useAbility();
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.pointerActive || this.sim.state.phase !== 'aim') return;
      const dy = (p.y - this.pointerDownY) / this.scale.displayScale.y;
      const dx = (p.x - this.pointerDownX) / this.scale.displayScale.x;
      // Forgiving tap-vs-drag: a few pixels of slop before a hold counts as aiming.
      if (Math.abs(dy) > 3 || Math.abs(dx) > 3) this.pointerMoved = true;
      if (this.pointerMoved) this.sim.aimByDrag(dy);
    });

    const release = () => {
      if (!this.pointerActive) return;
      this.pointerActive = false;
      if (this.sim.state.phase === 'aim' && this.sim.state.charging) this.sim.launch();
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.on(Phaser.Input.Events.GAME_OUT, release);

    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    // Aim keys are resolved once. Held keys ramp the angle smoothly while a
    // single tap nudges it a fixed step, so the game is playable with discrete
    // key presses and not only by holding a key down.
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.aimKeys = {
      up: [keyboard.addKey(KeyCodes.UP), keyboard.addKey(KeyCodes.W)],
      down: [keyboard.addKey(KeyCodes.DOWN), keyboard.addKey(KeyCodes.S)],
    };
    for (const [event, direction] of [
      ['keydown-UP', -1],
      ['keydown-W', -1],
      ['keydown-DOWN', 1],
      ['keydown-S', 1],
    ] as const) {
      keyboard.on(event, () => {
        if (this.inputEnabled && !this.paused) this.sim.aimBy(direction * AIM_KEY_STEP);
      });
    }

    keyboard.on('keydown-SPACE', () => this.onActionDown('SPACE'));
    keyboard.on('keyup-SPACE', () => this.onActionUp('SPACE'));
    keyboard.on('keydown-ENTER', () => this.onActionDown('ENTER'));
    keyboard.on('keyup-ENTER', () => this.onActionUp('ENTER'));
    keyboard.on('keydown-ESC', () => {
      if (this.inputEnabled && this.running) this.config.onPauseRequested();
    });
    keyboard.on('keydown-P', () => {
      if (this.inputEnabled && this.running) this.config.onPauseRequested();
    });
  }

  private onActionDown(key: ChargeKey): void {
    if (!this.inputEnabled || !this.running || this.paused) return;
    const phase = this.sim.state.phase;
    if (phase === 'aim' && this.chargingKey === null) {
      this.chargingKey = key;
      this.sim.setCharging(true);
    } else if (phase === 'fly') {
      this.sim.useAbility();
    }
  }

  /**
   * Releases the charge only for the key that started it.
   *
   * Enter and Space both charge, and the interface starts a run on Enter. The
   * keyup from that same Enter press arrives after the run is already live, and
   * a shared latch read it as the release of a charge Space had just begun —
   * launching at zero power. Tracking which key opened the latch makes the
   * keyboard path deterministic no matter how fast the two presses overlap.
   */
  private onActionUp(key: ChargeKey): void {
    if (this.chargingKey !== key) return;
    this.chargingKey = null;
    if (this.running && this.sim.state.phase === 'aim') this.sim.launch();
  }

  private pollKeyboardAim(dt: number): void {
    if (!this.inputEnabled || this.sim.state.phase !== 'aim') return;
    const rate = AIM_KEY_RATE * dt;
    if (this.aimKeys.up.some((k) => k.isDown)) this.sim.aimBy(-rate);
    if (this.aimKeys.down.some((k) => k.isDown)) this.sim.aimBy(rate);
  }

  // ---------------------------------------------------------------- update

  update(_time: number, delta: number): void {
    let dt = Math.min(MAX_STEP, delta / 1000);
    this.elapsed += dt;

    if (this.paused) {
      this.render(dt);
      return;
    }

    // The run has ended but the world keeps drawing: particles settle, the last
    // popup rises, and the results panel waits its beat.
    if (!this.running) {
      this.render(dt);
      this.tickEndDelay(dt);
      return;
    }

    this.pollKeyboardAim(dt);

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= FEEL.hitstop.timeScale;
    }
    if (debug.slowMotion) dt *= 0.25;

    const alive = this.sim.step(dt);
    this.consumeEvents(this.sim.state.events);
    this.updateCamera(dt);
    this.render(dt);

    if (!alive && this.running) {
      this.running = false;
      // Hold the frame briefly so the final burst, popup and sound land before
      // the panel covers them.
      this.endDelay = this.sim.state.stats.deathCause
        ? FEEL.runEnd.deathDelay
        : FEEL.runEnd.settleDelay;
    }
  }

  private tickEndDelay(dt: number): void {
    if (this.endDelay <= 0) return;
    this.endDelay -= dt;
    if (this.endDelay > 0) return;
    this.endDelay = 0;
    this.hud.setVisible(false);
    this.config.onRunComplete(this.sim);
  }

  private render(dt: number): void {
    const state = this.sim.state;
    const voidFactor = state.destroyer ? Math.min(1, state.destroyerTime * 0.8) : 0;

    this.sky.update(this.camX, this.camY, voidFactor, this.elapsed);
    this.ground.update(this.camX, this.camY, state.groundGone, state.stats.distance);
    this.objects.update(
      state.objects,
      this.camX,
      this.camY,
      this.elapsed,
      state.seek?.lockedId ?? null,
    );
    this.actors.update(state, this.camX, this.camY, this.elapsed, dt);
    this.actors.drawRecordFlag(this.recordDistance, this.camX, this.camY, state.groundGone);
    this.effects.update(dt, this.camX, this.camY);
    this.hud.update(state, this.recordDistance, !save.get().hasLaunched);

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      const strength = save.settings.reducedFlash ? 0.35 : 1;
      this.flash.setAlpha(Math.max(0, Math.min(1, this.flashTime * 6)) * strength);
    } else if (this.flash.alpha !== 0) {
      this.flash.setAlpha(0);
    }

    this.applyShake(dt);
    this.debugOverlay?.update(state, this.camX, this.camY, dt * 1000, this.effects.activeCount);
  }

  private applyShake(dt: number): void {
    const cam = this.cameras.main;
    if (this.shake <= 0) {
      cam.setScroll(0, 0);
      return;
    }
    this.shake = Math.max(0, this.shake - dt * FEEL.shake.decay);
    if (!save.settings.screenShake) {
      cam.setScroll(0, 0);
      return;
    }
    cam.setScroll((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
  }

  private updateCamera(dt: number): void {
    const state = this.sim.state;
    const cam = FEEL.camera;

    // Lookahead leads the projectile in its direction of travel so the player
    // sees what they are flying into rather than where they have been.
    const targetLookahead = Math.min(cam.lookaheadMax, Math.abs(state.vx) * cam.lookaheadPerSpeed);
    this.lookahead += (targetLookahead - this.lookahead) * Math.min(1, cam.lookaheadRate * dt);

    const targetX = state.x - WORLD.viewWidth * cam.anchorX + this.lookahead;
    let targetY = state.y - WORLD.viewHeight * cam.anchorY;
    if (!state.groundGone) {
      targetY = Math.min(targetY, WORLD.groundY + cam.groundMargin - WORLD.viewHeight);
    }

    // During the aim phase the camera sits still; smoothing a stationary target
    // only introduces drift.
    if (state.phase === 'aim') {
      this.camX = targetX;
      this.camY = targetY;
      return;
    }

    const k = Math.min(1, cam.followRate * dt);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    // Smoothing alone loses the projectile at high speed; clamp it back into a
    // safe band so it is always on screen no matter how fast the run gets.
    this.camX = clamp(
      this.camX,
      state.x - WORLD.viewWidth * cam.maxScreenX,
      state.x - WORLD.viewWidth * cam.minScreenX,
    );
    let minY = state.y - WORLD.viewHeight * cam.maxScreenY;
    let maxY = state.y - WORLD.viewHeight * cam.minScreenY;
    if (!state.groundGone) {
      const ceiling = WORLD.groundY + cam.groundMargin - WORLD.viewHeight;
      minY = Math.min(minY, ceiling);
      maxY = Math.min(maxY, ceiling);
    }
    this.camY = clamp(this.camY, minY, maxY);
  }

  // ---------------------------------------------------------------- feedback

  private consumeEvents(events: SimEvent[]): void {
    for (const e of events) this.handleEvent(e);
  }

  private handleEvent(e: SimEvent): void {
    const sound = this.config.playSound;
    const palette = CHARACTERS[this.sim.state.character].palette;
    const glow = hex(palette.glow);

    switch (e.kind) {
      case 'launch':
        this.shakeBy(FEEL.launch.shake);
        this.flashTime = FEEL.launch.flash;
        this.effects.burst(e.x, e.y, FEEL.launch.sparks, glow, 'spark', 90, 0.4);
        sound(`launch.${e.variant}`);
        break;

      case 'perfect':
        this.popup(e);
        this.flashTime = Math.max(this.flashTime, 0.16);
        sound('charge.perfect');
        break;

      case 'bird': {
        const size = e.magnitude;
        this.hitstopFor(OBJECTS.bird.hitstop);
        this.shakeBy(OBJECTS.bird.shakeBase + size * OBJECTS.bird.shakePerRadius);
        this.effects.feathers(
          e.x,
          e.y,
          OBJECTS.bird.featherBase + size * OBJECTS.bird.featherPerRadius,
          hex(FEATHER_COLORS.bird),
        );
        this.effects.burst(e.x, e.y, 6, 0xffffff, 'spark', 60, 0.22);
        this.popup(e);
        sound('bird.hit', { rate: birdRate(size) });
        break;
      }

      case 'rare':
        this.hitstopFor(OBJECTS.rare.hitstop);
        this.shakeBy(OBJECTS.rare.shake);
        this.flashTime = Math.max(this.flashTime, OBJECTS.rare.flash);
        this.effects.feathers(e.x, e.y, OBJECTS.rare.feathers, hex(FEATHER_COLORS.rare));
        this.popup(e);
        sound('bird.golden');
        break;

      case 'armorShatter':
        this.hitstopFor(OBJECTS.armor.hitstop);
        this.shakeBy(OBJECTS.armor.shake);
        this.effects.feathers(
          e.x,
          e.y,
          OBJECTS.armor.shatterFeatherBase + e.magnitude * OBJECTS.armor.shatterFeatherPerRadius,
          hex(FEATHER_COLORS.armor),
        );
        this.popup(e);
        sound('armor.shatter');
        break;

      case 'armorDeflect':
        this.shakeBy(4);
        this.effects.burst(e.x, e.y, 8, 0x8a8a9a, 'dust', 55, 0.4);
        this.popup(e);
        sound('armor.deflect');
        break;

      case 'orb':
        this.effects.burst(e.x, e.y, 8, 0x9fd8ff, 'spark', 70, 0.35);
        this.popup(e);
        sound('orb.chime');
        break;

      case 'aura': {
        const color =
          e.variant === 'charge' ? 0x7dffb0 : e.variant === 'shield' ? 0xffd876 : 0x7de8ff;
        this.hitstopFor(OBJECTS.aura.hitstop);
        this.effects.burst(e.x, e.y, 14, color, 'spark', 80, 0.5);
        this.popup(e);
        sound(`aura.${e.variant}`);
        break;
      }

      case 'tmc':
        this.hitstopFor(OBJECTS.tmc.hitstop);
        this.shakeBy(OBJECTS.tmc.shake);
        this.flashTime = Math.max(this.flashTime, OBJECTS.tmc.flash);
        this.effects.burst(e.x, e.y, 18, 0x9fd8ff, 'spark', 130, 0.6);
        this.popup(e);
        sound('tmc.rocket');
        break;

      case 'stormEnter':
        this.popup(e);
        sound('storm.loop');
        break;

      case 'stormCut':
        this.popup(e);
        sound('ability.seeker.strike', { rate: 1.2 });
        break;

      case 'stormDestroy':
        this.hitstopFor(OBJECTS.storm.hitstop);
        this.shakeBy(OBJECTS.storm.shake);
        this.effects.burst(e.x, e.y, 16, e.variant === 'burn' ? 0xff7733 : 0xffd876, 'spark', 110, 0.5);
        this.effects.burst(e.x, e.y, 10, 0x3a3a4a, 'dust', 80, 0.5);
        this.popup(e);
        sound('storm.destroy');
        break;

      case 'pad':
        this.shakeBy(OBJECTS.pad.shake);
        this.flashTime = Math.max(this.flashTime, OBJECTS.pad.flash);
        this.effects.burst(e.x, WORLD.groundY - 6, 16, 0x7dffb0, 'spark', 120, 0.5);
        this.popup(e);
        sound('pad.bounce');
        break;

      case 'spikeDestroy':
        this.shakeBy(6);
        this.hitstopFor(0.06);
        this.effects.burst(
          e.x,
          WORLD.groundY - 8,
          14,
          e.variant === 'burn' ? 0xff7733 : 0xffd876,
          'rock',
          120,
          0.6,
        );
        this.popup(e);
        sound(e.variant === 'cut' ? 'ability.seeker.strike' : 'armor.shatter');
        break;

      case 'spikeDeath':
        this.shakeBy(OBJECTS.spike.deathShake);
        this.hitstopFor(OBJECTS.spike.deathHitstop);
        this.flashTime = OBJECTS.spike.deathFlash;
        this.effects.burst(e.x, WORLD.groundY - 8, 26, glow, 'spark', 150, 0.7);
        this.effects.burst(e.x, WORLD.groundY - 4, 12, 0x5a5e78, 'rock', 110, 0.6);
        this.popup(e);
        sound('spike.death');
        break;

      case 'bounce':
        if (e.variant === 'skip') {
          this.shakeBy(3);
          this.effects.burst(e.x, WORLD.groundY - 2, 8, 0xff7733, 'dust', 60, 0.4);
          sound('ground.bounce', { volume: 0.5, rate: 1.3 });
        } else {
          const impact = Math.min(1, e.magnitude / 500);
          this.shakeBy(3 + impact * 3);
          this.effects.burst(e.x, WORLD.groundY - 2, 10, 0xc9b98a, 'dust', 70, 0.5);
          this.popup(e);
          sound('ground.bounce', { volume: 0.4 + impact * 0.6, rate: 1.2 - impact * 0.4 });
        }
        break;

      case 'settle':
        this.effects.burst(e.x, WORLD.groundY - 4, 10, glow, 'spark', 40, 0.6);
        sound('run.settle');
        break;

      case 'ability':
        this.onAbilityCast(e, glow);
        break;

      case 'abilityFail':
        sound('ability.fail');
        break;

      case 'seekerLock':
        sound('ability.seeker.lock');
        break;

      case 'destroyerStart':
        this.shakeBy(FEEL.shake.max);
        this.hitstopFor(0.15);
        this.flashTime = 0.5;
        this.popup(e);
        sound('destroyer.transform');
        sound('destroyer.ambience');
        break;

      case 'destroyerBoom': {
        const color =
          e.variant === 'rare'
            ? hex(FEATHER_COLORS.rare)
            : e.variant === 'armor'
              ? hex(FEATHER_COLORS.armor)
              : hex(FEATHER_COLORS.bird);
        this.effects.feathers(e.x, e.y, 16, color);
        sound('destroyer.pop', { rate: 0.8 + Math.random() * 0.8, volume: 0.5 });
        break;
      }

      default:
        break;
    }
  }

  private onAbilityCast(e: SimEvent, glow: number): void {
    const sound = this.config.playSound;
    switch (e.variant) {
      case 'lindon':
        this.shakeBy(5);
        this.flashTime = Math.max(this.flashTime, 0.08);
        this.effects.burst(e.x, e.y, 16, 0xff7733, 'ember', 110, 0.5);
        sound('ability.blackflame.ignite');
        break;
      case 'yerin':
        this.shakeBy(3);
        this.effects.burst(e.x, e.y, 12, 0xffffff, 'spark', 90, 0.3);
        sound('ability.seeker.cast');
        break;
      case 'mercy':
        this.shakeBy(3);
        this.effects.burst(e.x, e.y, 12, 0x8a3fff, 'spark', 70, 0.5);
        sound('ability.strings.cast');
        break;
      case 'ziel':
        this.shakeBy(6);
        this.flashTime = Math.max(this.flashTime, 0.06);
        this.effects.burst(e.x, e.y, 18, 0x7dffb0, 'spark', 140, 0.5);
        sound('ability.formation.slam');
        break;
      default:
        this.effects.burst(e.x, e.y, 10, glow, 'spark', 80, 0.4);
        break;
    }
    this.popup(e);
  }

  private popup(e: SimEvent): void {
    if (e.text?.length) this.effects.popup(e.x, e.y - 12, e.text);
  }

  private shakeBy(amount: number): void {
    this.shake = Math.min(FEEL.shake.max, Math.max(this.shake, amount));
  }

  private hitstopFor(seconds: number): void {
    this.hitstop = Math.min(FEEL.hitstop.max, Math.max(this.hitstop, seconds));
  }

  // ---------------------------------------------------------------- queries

  get simulation(): Simulation {
    return this.sim;
  }

  get state(): SimState {
    return this.sim.state;
  }

  get altitudeIntensity(): number {
    const state = this.sim.state;
    if (state.phase !== 'fly') return 0;
    const speedPart = Math.min(1, Math.hypot(state.vx, state.vy) / 900);
    const altitudePart = Math.min(1, altitudeMeters(state.y) / 900);
    return Math.max(speedPart, altitudePart);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function hex(color: string): number {
  return Phaser.Display.Color.HexStringToColor(color).color;
}
