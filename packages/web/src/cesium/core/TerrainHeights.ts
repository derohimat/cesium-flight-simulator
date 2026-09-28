import * as Cesium from 'cesium';

/** Resolves ground heights (metres) for points; undefined where unknown. */
export type HeightSampler = (points: Cesium.Cartographic[]) => Promise<(number | undefined)[]>;

const MAX_CACHE_ENTRIES = 20000;

/**
 * Real terrain elevation for flight planning, independent of what's rendered.
 *
 * The app hides Cesium's globe and draws Google Photorealistic 3D Tiles instead, so
 * `globe.getHeight()` always returns undefined and callers saw sea level everywhere. Heights
 * here come from Cesium World Terrain via `sampleTerrainMostDetailed`: plain heightmap tile
 * fetches, with no rendering and no pick passes, so planning never costs frame time. Requests are
 * batched and cached at ~1 m resolution; sync lookups read the cache after `prefetch()`.
 */
export class TerrainHeights {
  private cache = new Map<string, number>();
  private sampler: HeightSampler;
  private providerPromise: Promise<Cesium.TerrainProvider> | null = null;

  constructor(sampler?: HeightSampler) {
    this.sampler = sampler ?? ((points) => this.sampleWorldTerrain(points));
  }

  private static key(lng: number, lat: number): string {
    return `${lng.toFixed(5)},${lat.toFixed(5)}`;
  }

  /** Cached height in metres, or undefined if not fetched (or unavailable). */
  public get(lng: number, lat: number): number | undefined {
    return this.cache.get(TerrainHeights.key(lng, lat));
  }

  /** Fetch every uncached point in one batch. Never rejects: failures just stay uncached. */
  public async prefetch(points: { lng: number; lat: number }[]): Promise<void> {
    const missing = new Map<string, { lng: number; lat: number }>();
    for (const p of points) {
      const key = TerrainHeights.key(p.lng, p.lat);
      if (!this.cache.has(key)) missing.set(key, p);
    }
    if (missing.size === 0) return;

    const keys = [...missing.keys()];
    const cartographics = [...missing.values()].map((p) => Cesium.Cartographic.fromDegrees(p.lng, p.lat));
    try {
      const heights = await this.sampler(cartographics);
      if (this.cache.size + keys.length > MAX_CACHE_ENTRIES) this.cache.clear();
      keys.forEach((key, i) => {
        const h = heights[i];
        if (h !== undefined && Number.isFinite(h)) this.cache.set(key, h);
      });
    } catch (error) {
      console.warn('Terrain height lookup failed; falling back to sea level:', error);
    }
  }

  private async sampleWorldTerrain(points: Cesium.Cartographic[]): Promise<(number | undefined)[]> {
    this.providerPromise ??= Cesium.createWorldTerrainAsync();
    let provider: Cesium.TerrainProvider;
    try {
      provider = await this.providerPromise;
    } catch (error) {
      this.providerPromise = null; // allow a retry later (e.g. token fixed)
      throw error;
    }
    const sampled = await Cesium.sampleTerrainMostDetailed(provider, points);
    return sampled.map((c) => c.height);
  }
}
