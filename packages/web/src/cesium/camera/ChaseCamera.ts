import * as Cesium from 'cesium';
import { Camera, damp } from './Camera';
import { lerpAngle } from '../vehicles/Vehicle';

export interface ChaseCameraTuning {
  /** Metres from the vehicle's bounding-sphere centre. */
  distance: number;
  /** Pitch on activation, before easing toward the follow pitch. */
  initialPitch: number;
  /** Added to the vehicle's pitch to look over it. */
  pitchOffset: number;
  /** Fraction of the gap to the target closed per 1/60 s. */
  followRate: number;
  /** Fraction of aircraft roll the camera banks with. */
  rollFollow: number;
  /** Ground vehicles: camera roll per radian of heading change per 1/60 s. */
  turnBanking: number;
  baseFov: number;
  maxFov: number;
  /** Speed at which the FOV reaches `maxFov`. */
  fovSpeed: number;
  /** Curve exponent from speed to FOV (2 = quadratic, 3 = cubic). */
  fovCurve: number;
  fovRate: number;
}

/**
 * Third-person camera that trails the vehicle's interpolated pose.
 *
 * Two issues fixed relative to the previous follow cameras:
 *  - Smoothing used fixed per-frame lerp factors, so the camera was twice as stiff at 120 Hz
 *    as at 60 Hz and lurched whenever frame time varied. It now uses exponential damping
 *    normalised to the original 60 fps tuning.
 *  - `Camera.lookAt` rebuilds the orientation with zero roll every call, but the cameras then
 *    twisted by only the *change* in roll since the last frame. Banking never accumulated
 *    and the view micro-jittered in roll instead. The full roll is now applied every frame.
 */
export abstract class ChaseCamera extends Camera {
  private currentHeading = 0;
  private currentPitch = 0;
  private currentRoll = 0;
  private currentFov: number;
  private lastVehicleHeading = 0;
  private hpRange = new Cesium.HeadingPitchRange();

  protected constructor(cesiumCamera: Cesium.Camera, private tuning: ChaseCameraTuning) {
    super(cesiumCamera);
    this.currentFov = tuning.baseFov;
  }

  protected onActivate(): void {
    if (!this.target || !this.target.isModelReady() || !this.target.getBoundingSphere()) return;

    const state = this.target.getState();
    this.currentHeading = Cesium.Math.zeroToTwoPi(state.heading + Math.PI / 2);
    this.currentPitch = this.tuning.initialPitch;
    this.currentRoll = 0;
    this.lastVehicleHeading = state.heading;
  }

  public update(deltaTime: number): void {
    if (!this.isActive || !this.target || !this.target.isModelReady()) {
      return;
    }

    const boundingSphere = this.target.getBoundingSphere();
    if (!boundingSphere || deltaTime <= 0) return;

    const t = this.tuning;
    const state = this.target.getState();

    const targetHeading = state.heading + Math.PI / 2;
    const targetPitch = state.pitch + t.pitchOffset;

    let targetRoll: number;
    if (Math.abs(state.roll) > 0.01) {
      targetRoll = state.roll * t.rollFollow;
    } else {
      // Heading change normalised to a 60 fps frame, so banking doesn't depend on frame rate.
      const headingDelta = Cesium.Math.negativePiToPi(state.heading - this.lastVehicleHeading);
      targetRoll = -headingDelta * (1 / 60 / deltaTime) * t.turnBanking;
    }
    this.lastVehicleHeading = state.heading;

    const k = damp(t.followRate, deltaTime);
    this.currentHeading = lerpAngle(this.currentHeading, targetHeading, k);
    this.currentPitch = Cesium.Math.lerp(this.currentPitch, targetPitch, k);
    this.currentRoll = Cesium.Math.lerp(this.currentRoll, targetRoll, k);

    this.hpRange.heading = this.currentHeading;
    this.hpRange.pitch = this.currentPitch;
    this.hpRange.range = t.distance;
    this.cesiumCamera.lookAt(boundingSphere.center, this.hpRange);

    if (Math.abs(this.currentRoll) > 1e-4) {
      this.cesiumCamera.twistRight(this.currentRoll);
    }

    this.updateDynamicFov(state.speed, deltaTime);
  }

  private updateDynamicFov(speed: number, deltaTime: number): void {
    const t = this.tuning;
    const speedFactor = Math.min(speed / t.fovSpeed, 1.0);
    const targetFov = Cesium.Math.lerp(t.baseFov, t.maxFov, Math.pow(speedFactor, t.fovCurve));

    if (Math.abs(targetFov - this.currentFov) > 0.0005) {
      this.currentFov = Cesium.Math.lerp(this.currentFov, targetFov, damp(t.fovRate, deltaTime));
    }
    const frustum = this.cesiumCamera.frustum;
    if (frustum instanceof Cesium.PerspectiveFrustum && frustum.fov !== this.currentFov) {
      frustum.fov = this.currentFov;
    }
  }
}
