import * as Cesium from 'cesium';
import { FixedUpdatable } from '../core/GameLoop';
import type { GroundSampler } from '../core/GroundSampler';

export interface VehicleConfig {
  modelUrl: string;
  scale?: number;
  position: Cesium.Cartesian3;
  heading?: number;
  pitch?: number;
  roll?: number;
  modelHeadingOffset?: number;
}

export interface VehicleState {
  position: Cesium.Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
  velocity: number;
  speed: number;
}

/**
 * Base vehicle with fixed-step simulation and interpolated presentation.
 *
 * `position` / `hpRoll` are the simulation state, advanced only in `step()` at a fixed rate.
 * Each rendered frame, `interpolate(alpha)` blends the previous and current simulation poses
 * into `renderPosition` / `renderHpr`, which drive the model matrix and everything that looks
 * at the vehicle (cameras, HUD). That keeps motion smooth on any refresh rate without making
 * the physics frame-rate dependent.
 */
export abstract class Vehicle implements FixedUpdatable {
  protected primitive: Cesium.Model | null = null;
  protected position: Cesium.Cartesian3;
  protected hpRoll: Cesium.HeadingPitchRoll;
  protected velocity: number = 0;
  protected speed: number = 0;
  protected isReady: boolean = false;
  protected sceneRef: Cesium.Scene | null = null;
  protected groundSampler: GroundSampler | null = null;
  protected modelHeadingOffset: number = 0;
  public physicsEnabled: boolean = true;

  private previousPosition: Cesium.Cartesian3;
  private previousHpr: Cesium.HeadingPitchRoll;
  protected renderPosition: Cesium.Cartesian3;
  protected renderHpr: Cesium.HeadingPitchRoll;

  public readonly id: string;
  public readonly config: VehicleConfig;

  private static readonly scratchPositionClone = new Cesium.Cartesian3();
  private static readonly scratchHPR = new Cesium.HeadingPitchRoll();

  constructor(id: string, config: VehicleConfig) {
    this.id = id;
    this.config = config;
    this.position = Cesium.Cartesian3.clone(config.position);
    this.hpRoll = new Cesium.HeadingPitchRoll(
      config.heading || 0,
      config.pitch || 0,
      config.roll || 0
    );
    this.modelHeadingOffset = config.modelHeadingOffset || 0;

    this.previousPosition = Cesium.Cartesian3.clone(this.position);
    this.previousHpr = Cesium.HeadingPitchRoll.clone(this.hpRoll);
    this.renderPosition = Cesium.Cartesian3.clone(this.position);
    this.renderHpr = Cesium.HeadingPitchRoll.clone(this.hpRoll);
  }

  public async initialize(scene: Cesium.Scene, groundSampler?: GroundSampler): Promise<void> {
    try {
      this.sceneRef = scene;
      this.groundSampler = groundSampler ?? null;

      Vehicle.scratchHPR.heading = this.hpRoll.heading + this.modelHeadingOffset;
      Vehicle.scratchHPR.pitch = this.hpRoll.pitch;
      Vehicle.scratchHPR.roll = this.hpRoll.roll;

      this.primitive = scene.primitives.add(
        await Cesium.Model.fromGltfAsync({
          url: this.config.modelUrl,
          scale: this.config.scale || 1.0,
          // Height queries are ray picks; a pickable vehicle is the first thing every
          // downward ray from above it hits, which makes Cesium hide it and re-render the
          // whole pick pass. Nothing clicks on vehicles, so opt out of picking entirely.
          allowPicking: false,
          modelMatrix: Cesium.Transforms.headingPitchRollToFixedFrame(
            this.position,
            Vehicle.scratchHPR,
            Cesium.Ellipsoid.WGS84
          )
        })
      );

      this.primitive?.readyEvent.addEventListener(() => {
        this.isReady = true;
        this.onModelReady();
      });
    } catch (error) {
      console.error(`Failed to load vehicle model: ${error}`);
    }
  }

  protected onModelReady(): void {
    // Override in subclasses for specific initialization
  }

  /** Advance the simulation by exactly one fixed step. */
  protected abstract step(fixedDeltaTime: number): void;

  public fixedUpdate(fixedDeltaTime: number): void {
    if (!this.isReady) return;

    // Snapshot even when paused/crashed so interpolation settles on the frozen pose.
    Cesium.Cartesian3.clone(this.position, this.previousPosition);
    Cesium.HeadingPitchRoll.clone(this.hpRoll, this.previousHpr);

    if (this.physicsEnabled) {
      this.step(fixedDeltaTime);
    }
  }

  public interpolate(alpha: number): void {
    if (!this.isReady || !this.physicsEnabled) return;

    Cesium.Cartesian3.lerp(this.previousPosition, this.position, alpha, this.renderPosition);
    this.renderHpr.heading = lerpAngle(this.previousHpr.heading, this.hpRoll.heading, alpha);
    this.renderHpr.pitch = Cesium.Math.lerp(this.previousHpr.pitch, this.hpRoll.pitch, alpha);
    this.renderHpr.roll = Cesium.Math.lerp(this.previousHpr.roll, this.hpRoll.roll, alpha);

    this.updateModelMatrix();
  }

  public setInput(_input: Record<string, boolean | number | undefined>): void {
    // Override in subclasses
  }

  public toggleCollisionDetection?(): void {
    // Optional - override in subclasses that support collision detection
  }

  /** Presented (interpolated) state — what is on screen this frame. */
  public getState(): VehicleState {
    Cesium.Cartesian3.clone(this.renderPosition, Vehicle.scratchPositionClone);
    return {
      position: Vehicle.scratchPositionClone,
      heading: this.renderHpr.heading,
      pitch: this.renderHpr.pitch,
      roll: this.renderHpr.roll,
      velocity: this.velocity,
      speed: this.speed
    };
  }

  public setState(state: VehicleState): void {
    this.position = Cesium.Cartesian3.clone(state.position);
    this.hpRoll.heading = state.heading;
    this.hpRoll.pitch = state.pitch;
    this.hpRoll.roll = state.roll;
    this.velocity = state.velocity;
    this.speed = state.speed;
    this.snapToSimulation();
  }

  /** Discard interpolation history, e.g. after a teleport, so we don't blend across it. */
  protected snapToSimulation(): void {
    Cesium.Cartesian3.clone(this.position, this.previousPosition);
    Cesium.Cartesian3.clone(this.position, this.renderPosition);
    Cesium.HeadingPitchRoll.clone(this.hpRoll, this.previousHpr);
    Cesium.HeadingPitchRoll.clone(this.hpRoll, this.renderHpr);
    this.updateModelMatrix();
  }

  /** Current simulation (not interpolated) position. */
  public getSimulationPosition(result: Cesium.Cartesian3): Cesium.Cartesian3 {
    return Cesium.Cartesian3.clone(this.position, result);
  }

  public getPosition(): Cesium.Cartesian3 {
    return Cesium.Cartesian3.clone(this.renderPosition, Vehicle.scratchPositionClone);
  }

  public getBoundingSphere(): Cesium.BoundingSphere | null {
    return this.primitive?.boundingSphere || null;
  }

  public isModelReady(): boolean {
    return this.isReady;
  }

  public setVisible(visible: boolean): void {
    if (this.primitive) {
      this.primitive.show = visible;
    }
  }

  protected updateModelMatrix(): void {
    if (this.primitive) {
      Vehicle.scratchHPR.heading = this.renderHpr.heading + this.modelHeadingOffset;
      Vehicle.scratchHPR.pitch = this.renderHpr.pitch;
      Vehicle.scratchHPR.roll = this.renderHpr.roll;

      Cesium.Transforms.headingPitchRollToFixedFrame(
        this.renderPosition,
        Vehicle.scratchHPR,
        Cesium.Ellipsoid.WGS84,
        undefined,
        this.primitive.modelMatrix
      );
    }
  }

  public destroy(): void {
    if (this.primitive) {
      if (this.sceneRef) {
        try {
          this.sceneRef.primitives.remove(this.primitive);
        } catch {}
      }
      this.primitive = null;
      this.isReady = false;
    }
  }
}

/** Interpolate along the shorter arc; result in [0, 2π). */
export function lerpAngle(from: number, to: number, t: number): number {
  let delta = Cesium.Math.zeroToTwoPi(to) - Cesium.Math.zeroToTwoPi(from);
  if (delta > Math.PI) delta -= Cesium.Math.TWO_PI;
  else if (delta < -Math.PI) delta += Cesium.Math.TWO_PI;
  return Cesium.Math.zeroToTwoPi(from + delta * t);
}
