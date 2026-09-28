import type * as Cesium from 'cesium';
import type { Scene } from './Scene';

/** Called once per rendered frame with the real (unclamped-to-step) frame time. */
export interface Updatable {
  update(deltaTime: number): void;
}

/**
 * Simulation systems stepped at a fixed rate, decoupled from the display refresh rate.
 * `interpolate` is called once per rendered frame with alpha ∈ [0, 1) — the fraction of a
 * step that has accumulated but not yet been simulated — so visuals can blend between the
 * previous and current simulation states.
 */
export interface FixedUpdatable {
  fixedUpdate(fixedDeltaTime: number): void;
  interpolate(alpha: number): void;
}

export interface FrameHook {
  onFrameStart?(frameStartMs: number): void;
  onFrameEnd?(frameStartMs: number, frameEndMs: number): void;
}

/** 60 Hz matches the rate every per-step smoothing constant in the vehicles was tuned for. */
export const FIXED_DT = 1 / 60;
/** Beyond this many steps per frame we drop time instead of spiralling (≈15 fps floor). */
const MAX_STEPS_PER_FRAME = 4;
/** Longer gaps (tab switch, debugger pause) are treated as a single step. */
const MAX_FRAME_DT = 0.25;

/**
 * "Fix your timestep" loop: fixed-rate simulation + interpolated rendering.
 *
 * The previous loop fed the raw frame delta (clamped to 1/30s) straight into physics, which
 * made the sim run in slow motion under 30 fps and made every per-frame lerp in the physics
 * and cameras behave differently at 60 vs 120 vs 144 Hz.
 */
export class GameLoop {
  private scene: Scene;
  private updatables: Updatable[] = [];
  private fixedUpdatables: FixedUpdatable[] = [];
  private frameHooks: FrameHook[] = [];
  private lastTime: number = 0;
  private accumulator: number = 0;
  private isRunning: boolean = false;
  private removePreUpdate: Cesium.Event.RemoveCallback | null = null;
  private removePostRender: Cesium.Event.RemoveCallback | null = null;
  private frameStart: number = 0;

  /** Steps taken in the most recent frame (0 is normal on >60 Hz displays). */
  public lastStepCount: number = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public addUpdatable(updatable: Updatable): void {
    this.updatables.push(updatable);
  }

  public removeUpdatable(updatable: Updatable): void {
    const index = this.updatables.indexOf(updatable);
    if (index > -1) {
      this.updatables.splice(index, 1);
    }
  }

  public addFixedUpdatable(updatable: FixedUpdatable): void {
    this.fixedUpdatables.push(updatable);
  }

  public addFrameHook(hook: FrameHook): void {
    this.frameHooks.push(hook);
  }

  public removeFrameHook(hook: FrameHook): void {
    const index = this.frameHooks.indexOf(hook);
    if (index > -1) {
      this.frameHooks.splice(index, 1);
    }
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    const cesiumScene = this.scene.viewer.scene;
    this.removePreUpdate = cesiumScene.preUpdate.addEventListener(this.update, this);
    this.removePostRender = cesiumScene.postRender.addEventListener(this.endFrame, this);
  }

  public stop(): void {
    this.isRunning = false;
    this.removePreUpdate?.();
    this.removePostRender?.();
    this.removePreUpdate = null;
    this.removePostRender = null;
  }

  private update(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    this.frameStart = currentTime;
    const frameDt = Math.min((currentTime - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = currentTime;

    for (const hook of this.frameHooks) {
      hook.onFrameStart?.(currentTime);
    }

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      for (const system of this.fixedUpdatables) {
        system.fixedUpdate(FIXED_DT);
      }
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME && this.accumulator >= FIXED_DT) {
      // Can't keep up: drop the backlog rather than letting it grow every frame.
      this.accumulator = 0;
    }
    this.lastStepCount = steps;

    const alpha = this.accumulator / FIXED_DT;
    for (const system of this.fixedUpdatables) {
      system.interpolate(alpha);
    }

    for (const updatable of this.updatables) {
      updatable.update(frameDt);
    }
  }

  private endFrame(): void {
    if (!this.isRunning) return;
    const now = performance.now();
    for (const hook of this.frameHooks) {
      hook.onFrameEnd?.(this.frameStart, now);
    }
  }
}
