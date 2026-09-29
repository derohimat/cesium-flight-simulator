import * as Cesium from 'cesium';
import type { FrameHook } from './GameLoop';

/**
 * `Scene.pickFromRay` is marked @private (so it's missing from the typings) but it's the
 * machinery `sampleHeight`/`clampToHeight` are built on and has been stable for years.
 */
type RayPickScene = {
  pickFromRay?: (
    ray: Cesium.Ray,
    objectsToExclude?: object[],
    width?: number
  ) => { object?: unknown; position?: Cesium.Cartesian3 } | undefined;
};

/**
 * Budgeted access to `scene.sampleHeight` / `scene.pickFromRay`.
 *
 * Every height query in Cesium is a full offscreen render: it re-runs primitive/tileset
 * update for a pick pass and then reads the result back with a *synchronous* `readPixels`,
 * which stalls until the GPU has drained. Calling it several times per frame (as the car
 * used to) costs more than the frame itself. This class caps queries per frame and keeps
 * statistics so the perf overlay can show what physics is spending.
 */
export class GroundSampler implements FrameHook {
  private remaining: number;
  private queriesThisWindow = 0;
  private windowStart = performance.now();
  private readonly supported: boolean;

  /**
   * Overlays (mission gates, beacons) hidden for the duration of each query. Cesium still runs
   * non-pickable primitives in pick passes and their depth is what height queries read, so a
   * gate under the aircraft would otherwise register as ground.
   */
  private queryHidden: { show: boolean }[] = [];

  /** Height queries issued per second, averaged over the last full second. */
  public queriesPerSecond = 0;

  constructor(
    private scene: Cesium.Scene,
    private budgetPerFrame: number = 2
  ) {
    this.remaining = budgetPerFrame;
    this.supported = scene.sampleHeightSupported;
  }

  public onFrameStart(now: number): void {
    this.remaining = this.budgetPerFrame;
    if (now - this.windowStart >= 1000) {
      this.queriesPerSecond = Math.round((this.queriesThisWindow * 1000) / (now - this.windowStart));
      this.queriesThisWindow = 0;
      this.windowStart = now;
    }
  }

  public hasBudget(): boolean {
    return this.supported && this.remaining > 0;
  }

  public hideDuringQueries(overlay: { show: boolean }): void {
    if (!this.queryHidden.includes(overlay)) this.queryHidden.push(overlay);
  }

  public stopHidingDuringQueries(overlay: { show: boolean }): void {
    this.queryHidden = this.queryHidden.filter((o) => o !== overlay);
  }

  /** Run a query with overlays hidden, restoring each one's previous visibility. */
  private withOverlaysHidden<T>(query: () => T): T {
    if (this.queryHidden.length === 0) return query();
    const previous = this.queryHidden.map((o) => o.show);
    for (const o of this.queryHidden) o.show = false;
    try {
      return query();
    } finally {
      this.queryHidden.forEach((o, i) => (o.show = previous[i]));
    }
  }

  /** Queries still allowed this frame, so callers can reserve budget for more important ones. */
  public remainingBudget(): number {
    return this.supported ? this.remaining : 0;
  }

  /**
   * Height of the rendered surface (terrain / 3D tiles) under `cartographic`, or undefined if
   * nothing is loaded there. Returns undefined without querying when out of budget; callers
   * that must distinguish the two should check `hasBudget()` first.
   */
  public sampleHeight(cartographic: Cesium.Cartographic, objectsToExclude?: object[]): number | undefined {
    if (!this.hasBudget()) return undefined;
    this.remaining--;
    this.queriesThisWindow++;
    try {
      return this.withOverlaysHidden(() => this.scene.sampleHeight(cartographic, objectsToExclude));
    } catch {
      return undefined;
    }
  }

  /**
   * One-off height query outside the per-frame budget, for user actions (e.g. recovering after
   * a crash) rather than per-step physics.
   */
  public sampleHeightNow(cartographic: Cesium.Cartographic, objectsToExclude?: object[]): number | undefined {
    if (!this.supported) return undefined;
    this.queriesThisWindow++;
    try {
      return this.withOverlaysHidden(() => this.scene.sampleHeight(cartographic, objectsToExclude));
    } catch {
      return undefined;
    }
  }

  /**
   * Distance along `ray` to the first rendered surface, or undefined if nothing is hit (or out
   * of budget). Same cost as a height sample, but it is a sweep: it finds thin obstacles
   * anywhere on the path that point samples spaced along it would skip.
   */
  public castRay(ray: Cesium.Ray, objectsToExclude?: object[]): number | undefined {
    const pickFromRay = (this.scene as unknown as RayPickScene).pickFromRay;
    if (!pickFromRay || !this.hasBudget()) return undefined;
    this.remaining--;
    this.queriesThisWindow++;
    try {
      const hit = this.withOverlaysHidden(() => pickFromRay.call(this.scene, ray, objectsToExclude));
      return hit?.position ? Cesium.Cartesian3.distance(ray.origin, hit.position) : undefined;
    } catch {
      return undefined;
    }
  }
}
