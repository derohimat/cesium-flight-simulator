import * as Cesium from 'cesium';
import type { GroundSampler } from '../../core/GroundSampler';

/** Re-sample a parked vehicle this often, so it settles as finer tiles stream in. */
const IDLE_RESAMPLE_INTERVAL = 0.25;
/** Movement below this (metres) counts as parked. */
const MOVE_EPSILON = 0.01;
const MAX_SLOPE = 1.5;

/**
 * Keeps a position glued to the rendered surface using as few height queries as possible.
 *
 * Queries go through the per-frame GroundSampler budget. A stationary vehicle doesn't query
 * every frame, and when the budget is spent (several physics steps in one slow frame) the
 * height is extrapolated along the slope measured between the last two samples.
 */
export class TerrainClamping {
  private groundOffset: number;
  private hasSample = false;
  private lastGroundHeight = 0;
  private slope = 0;
  private readonly lastSamplePosition = new Cesium.Cartesian3();
  /** Tracked separately from samples: a query can find no surface (tiles not loaded yet). */
  private hasQueried = false;
  private timeSinceQuery = 0;
  private readonly lastQueryPosition = new Cesium.Cartesian3();

  private static readonly scratchCartographic = new Cesium.Cartographic();

  constructor(groundOffset: number = 0.0) {
    this.groundOffset = groundOffset;
  }

  /** Clamps `position` in place. */
  public clampToGround(
    position: Cesium.Cartesian3,
    deltaTime: number,
    sampler: GroundSampler,
    objectsToExclude?: object[]
  ): void {
    const cartographic = Cesium.Cartographic.fromCartesian(
      position,
      Cesium.Ellipsoid.WGS84,
      TerrainClamping.scratchCartographic
    );
    if (!cartographic) return;

    this.timeSinceQuery += deltaTime;
    const moved = this.hasSample
      ? Cesium.Cartesian3.distance(position, this.lastSamplePosition)
      : Infinity;

    let groundHeight: number | undefined;
    const wantsSample =
      !this.hasQueried ||
      this.timeSinceQuery >= IDLE_RESAMPLE_INTERVAL ||
      Cesium.Cartesian3.distance(position, this.lastQueryPosition) > MOVE_EPSILON;

    if (wantsSample && sampler.hasBudget()) {
      groundHeight = sampler.sampleHeight(cartographic, objectsToExclude);
      this.hasQueried = true;
      this.timeSinceQuery = 0;
      Cesium.Cartesian3.clone(position, this.lastQueryPosition);
      if (groundHeight !== undefined) {
        if (this.hasSample && moved > 0.05) {
          this.slope = Cesium.Math.clamp(
            (groundHeight - this.lastGroundHeight) / moved,
            -MAX_SLOPE,
            MAX_SLOPE
          );
        }
        this.lastGroundHeight = groundHeight;
        this.hasSample = true;
      }
    }
    const sampled = groundHeight !== undefined;

    if (groundHeight === undefined) {
      // Nothing known under us yet: leave the position as-is, like before.
      if (!this.hasSample) return;
      groundHeight = this.lastGroundHeight + (moved === Infinity ? 0 : this.slope * moved);
    }

    cartographic.height = groundHeight + this.groundOffset;
    Cesium.Cartographic.toCartesian(cartographic, Cesium.Ellipsoid.WGS84, position);
    if (sampled) {
      // Store the clamped point: a parked vehicle must measure zero movement next step.
      Cesium.Cartesian3.clone(position, this.lastSamplePosition);
      Cesium.Cartesian3.clone(position, this.lastQueryPosition);
    }
  }

  public reset(): void {
    this.hasSample = false;
    this.hasQueried = false;
    this.slope = 0;
  }

  public setGroundOffset(offset: number): void {
    this.groundOffset = offset;
  }

  public getGroundOffset(): number {
    return this.groundOffset;
  }
}
