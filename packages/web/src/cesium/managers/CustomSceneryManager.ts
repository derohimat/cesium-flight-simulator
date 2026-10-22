import * as Cesium from 'cesium';
import type { Scene } from '../core/Scene';
import type { AlephCaptureMetadata } from '../../services/aleph/types';

export interface ICustomSceneryManager {
  loadScenery(capture: AlephCaptureMetadata, modelBlobUrl: string): Promise<void>;
  updateTransform(altitudeOffset: number, heading: number, scale: number): void;
  setIsolation(enabled: boolean): void;
  unloadScenery(): void;
  getActiveBoundingSphere(): { center: Cesium.Cartesian3; radius: number } | null;
}

export class CustomSceneryManager implements ICustomSceneryManager {
  private scene?: Scene;
  private activeModel: Cesium.Model | null = null;
  private activeCapture: AlephCaptureMetadata | null = null;
  private loadGeneration: number = 0;
  
  // Transform state
  private currentAltitudeOffset: number = 0;
  private currentHeading: number = 0;
  private currentScale: number = 1.0;

  // Isolation & clipping state
  public isolationEnabled: boolean = false;
  public activePlanes: Array<{ normal: { x: number; y: number; z: number }; distance: number }> = [];
  public modelRadius: number = 75.0;
  public tilesetClippingCollection: Cesium.ClippingPlaneCollection | null = null;
  public tileset: Cesium.Cesium3DTileset | null = null;

  constructor(scene?: Scene) {
    this.scene = scene;
  }

  // --- Validation and Clamping Helpers ---

  public clampAltitudeOffset(offset: number): number {
    if (typeof offset !== 'number' || !Number.isFinite(offset)) {
      throw new Error(`Invalid altitude offset: ${offset}`);
    }
    return Math.max(-100.0, Math.min(100.0, offset));
  }

  public normalizeHeading(heading: number): number {
    if (typeof heading !== 'number' || !Number.isFinite(heading)) {
      throw new Error(`Invalid heading: ${heading}`);
    }
    let h = heading % 360;
    if (h < 0) h += 360;
    return h === 0 ? 0 : h;
  }

  public clampScale(scale: number): number {
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
      throw new Error(`Invalid scale factor: ${scale}`);
    }
    return Math.max(0.1, Math.min(5.0, scale));
  }

  private validateCoordinates(lat: number, lon: number, altitude: number): void {
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`Invalid latitude: ${lat}`);
    }
    if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new Error(`Invalid longitude: ${lon}`);
    }
    if (typeof altitude !== 'number' || !Number.isFinite(altitude)) {
      throw new Error(`Invalid altitude: ${altitude}`);
    }
  }

  // --- Scenery Lifecycle ---

  public async loadScenery(capture: AlephCaptureMetadata, modelBlobUrl: string): Promise<void> {
    // Clean up existing scenery if present
    if (this.activeModel) {
      this.unloadScenery();
    }

    this.validateCoordinates(capture.lat, capture.lon, capture.baseAltitude);

    this.activeCapture = { ...capture };
    this.currentAltitudeOffset = this.clampAltitudeOffset(capture.altitudeOffset ?? 0);
    this.currentHeading = this.normalizeHeading(capture.heading ?? 0);
    this.currentScale = this.clampScale(capture.scale ?? 1.0);
    this.modelRadius = capture.radius ?? 75.0;

    const effectiveAltitude = capture.baseAltitude + this.currentAltitudeOffset;
    const origin = Cesium.Cartesian3.fromDegrees(capture.lon, capture.lat, effectiveAltitude);
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(this.currentHeading),
      0,
      0
    );

    const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
      origin,
      hpr,
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.eastNorthUpToFixedFrame
    );

    const currentGen = ++this.loadGeneration;

    try {
      const model = await Cesium.Model.fromGltfAsync({
        url: modelBlobUrl,
        modelMatrix: modelMatrix,
        scale: this.currentScale,
        allowPicking: false, // Prevents GPU stalls in GroundSampler
        asynchronous: true,
      });

      if (this.loadGeneration !== currentGen) {
        if (!model.isDestroyed()) {
          model.destroy();
        }
        return;
      }

      this.activeModel = model;

      if (this.scene && this.scene.primitives) {
        this.scene.primitives.add(model);
      }

      // Re-apply latest transform so any updates made while loading are reflected
      this.updateTransform(this.currentAltitudeOffset, this.currentHeading, this.currentScale);

      // Apply initial isolation setting
      this.setIsolation(Boolean(capture.isolationEnabled));
    } catch (err) {
      if (this.loadGeneration === currentGen) {
        console.error('Failed to load custom scenery model:', err);
        this.unloadScenery();
        throw err;
      }
    }
  }

  public updateTransform(altitudeOffset: number, heading: number, scale: number): void {
    const clampedOffset = this.clampAltitudeOffset(altitudeOffset);
    const normHeading = this.normalizeHeading(heading);
    const clampedScale = this.clampScale(scale);

    this.currentAltitudeOffset = clampedOffset;
    this.currentHeading = normHeading;
    this.currentScale = clampedScale;

    if (this.activeCapture) {
      this.activeCapture.altitudeOffset = clampedOffset;
      this.activeCapture.heading = normHeading;
      this.activeCapture.scale = clampedScale;
    }

    if (this.activeModel && this.activeCapture) {
      const position = Cesium.Cartesian3.fromDegrees(
        this.activeCapture.lon,
        this.activeCapture.lat,
        this.activeCapture.baseAltitude + clampedOffset
      );
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(normHeading),
        0,
        0
      );

      // Mutate modelMatrix directly in-place without rebuilding geometry
      Cesium.Transforms.headingPitchRollToFixedFrame(
        position,
        hpr,
        Cesium.Ellipsoid.WGS84,
        Cesium.Transforms.eastNorthUpToFixedFrame,
        this.activeModel.modelMatrix
      );

      this.activeModel.scale = clampedScale;
    }

    if (this.isolationEnabled) {
      this.applyClippingPlanes(true);
    }
  }

  public setIsolation(enabled: boolean, modelRadiusOverride?: number): void {
    this.isolationEnabled = Boolean(enabled);
    if (this.activeCapture) {
      this.activeCapture.isolationEnabled = this.isolationEnabled;
    }
    this.applyClippingPlanes(this.isolationEnabled, modelRadiusOverride);
  }

  private getEffectiveTileset(): Cesium.Cesium3DTileset | null {
    if (this.tileset) return this.tileset;
    if (this.scene && typeof this.scene.getTileset === 'function') {
      return this.scene.getTileset();
    }
    return null;
  }

  private applyClippingPlanes(enabled: boolean, modelRadiusOverride?: number): void {
    const tileset = this.getEffectiveTileset();

    if (!enabled) {
      this.activePlanes = [];
      this.tilesetClippingCollection = null;
      if (tileset && tileset.clippingPlanes) {
        tileset.clippingPlanes.enabled = false;
        tileset.clippingPlanes = undefined as any;
      }
      return;
    }

    const baseRadius = modelRadiusOverride !== undefined
      ? modelRadiusOverride
      : (this.activeCapture?.radius ?? this.modelRadius ?? 75.0);
    const scale = this.currentScale || (this.activeCapture?.scale ?? 1.0);
    this.modelRadius = baseRadius;

    // Enforce minimum clipping radius of 10m even if model radius is 0; safety margin 5m
    const scaledRadius = baseRadius * scale;
    const altitudeOffsetPadding = Math.abs(this.currentAltitudeOffset * 0.1);
    const effectiveRadius = Math.max(scaledRadius, 10.0) + 5.0 + altitudeOffsetPadding;
    const planeDistance = -effectiveRadius;

    this.activePlanes = [
      { normal: { x: 1, y: 0, z: 0 }, distance: planeDistance },
      { normal: { x: -1, y: 0, z: 0 }, distance: planeDistance },
      { normal: { x: 0, y: 1, z: 0 }, distance: planeDistance },
      { normal: { x: 0, y: -1, z: 0 }, distance: planeDistance },
    ];

    const lat = this.activeCapture?.lat ?? 0;
    const lon = this.activeCapture?.lon ?? 0;
    const altitude = (this.activeCapture?.baseAltitude ?? 0) + this.currentAltitudeOffset;

    const centerCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, altitude);
    const localTransform = Cesium.Transforms.eastNorthUpToFixedFrame(centerCartesian);

    // In-place mutation when ClippingPlaneCollection already exists
    if (this.tilesetClippingCollection) {
      this.tilesetClippingCollection.modelMatrix = localTransform;
      const count = typeof this.tilesetClippingCollection.length === 'number'
        ? this.tilesetClippingCollection.length
        : ((this.tilesetClippingCollection as any).planes?.length ?? 4);

      for (let i = 0; i < count; i++) {
        if (typeof this.tilesetClippingCollection.get === 'function') {
          const plane = this.tilesetClippingCollection.get(i);
          if (plane) {
            plane.distance = planeDistance;
          }
        } else if ((this.tilesetClippingCollection as any).planes?.[i]) {
          (this.tilesetClippingCollection as any).planes[i].distance = planeDistance;
        }
      }

      if (tileset && tileset.clippingPlanes !== this.tilesetClippingCollection) {
        tileset.clippingPlanes = this.tilesetClippingCollection;
      }
      return;
    }

    const clippingPlanes = [
      new Cesium.ClippingPlane(new Cesium.Cartesian3(1.0, 0.0, 0.0), planeDistance),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(-1.0, 0.0, 0.0), planeDistance),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(0.0, 1.0, 0.0), planeDistance),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(0.0, -1.0, 0.0), planeDistance),
    ];

    const collection = new Cesium.ClippingPlaneCollection({
      modelMatrix: localTransform,
      planes: clippingPlanes,
      unionClippingRegions: false,
      edgeWidth: 0.0,
      edgeColor: Cesium.Color.TRANSPARENT,
      enabled: true,
    });

    this.tilesetClippingCollection = collection;

    if (tileset) {
      tileset.clippingPlanes = collection;
    }
  }

  public onTilesetLoaded(tileset: Cesium.Cesium3DTileset): void {
    if (this.tileset && this.tileset !== tileset && this.tileset.clippingPlanes) {
      this.tileset.clippingPlanes = undefined as any;
    }
    this.tileset = tileset;
    if (this.isolationEnabled) {
      this.applyClippingPlanes(true);
    }
  }

  public unloadScenery(): void {
    this.loadGeneration++;

    if (this.activeModel) {
      if (this.scene && this.scene.primitives) {
        this.scene.primitives.remove(this.activeModel);
      }
      if (!this.activeModel.isDestroyed()) {
        this.activeModel.destroy();
      }
      this.activeModel = null;
    }

    this.applyClippingPlanes(false);
    this.activeCapture = null;
    this.isolationEnabled = false;
    this.activePlanes = [];
    this.tilesetClippingCollection = null;
  }

  public getActiveBoundingSphere(): { center: Cesium.Cartesian3; radius: number } | null {
    if (!this.activeCapture && !this.activeModel) {
      return null;
    }

    const scale = this.currentScale || (this.activeCapture?.scale ?? 1.0);

    if (this.activeModel && this.activeModel.boundingSphere) {
      const bs = this.activeModel.boundingSphere;
      const r = bs.radius > 0 ? bs.radius : (this.activeCapture?.radius || 50.0) * scale;
      return {
        center: bs.center,
        radius: r,
      };
    }

    if (this.activeCapture) {
      const center = Cesium.Cartesian3.fromDegrees(
        this.activeCapture.lon,
        this.activeCapture.lat,
        this.activeCapture.baseAltitude + this.currentAltitudeOffset
      );
      const radius = (this.activeCapture.radius || 50.0) * scale;
      return { center, radius };
    }

    return null;
  }

  // --- Accessors ---

  public getActiveCapture(): AlephCaptureMetadata | null {
    return this.activeCapture;
  }

  public getModel(): Cesium.Model | null {
    return this.activeModel;
  }

  public getAltitudeOffset(): number {
    return this.currentAltitudeOffset;
  }

  public getHeading(): number {
    return this.currentHeading;
  }

  public getScale(): number {
    return this.currentScale;
  }

  public isIsolationEnabled(): boolean {
    return this.isolationEnabled;
  }

  public getLoadGeneration(): number {
    return this.loadGeneration;
  }
}
