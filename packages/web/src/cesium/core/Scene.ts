import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { getTokens } from '../../utils/tokenValidator';
import { RenderLoop } from './RenderLoop';

export interface QualityConfig {
  fxaaEnabled: boolean;
  maximumScreenSpaceError: number;
  dynamicScreenSpaceError: boolean;
  dynamicScreenSpaceErrorFactor: number;
  skipLevelOfDetail: boolean;
  bloomEnabled: boolean;
  hdr: boolean;
  exposure: number;
  msaaSamples: number;
  resolutionScale: number;
}

export class Scene {
  public viewer: Cesium.Viewer;
  public scene: Cesium.Scene;
  public camera: Cesium.Camera;
  public clock: Cesium.Clock;
  public primitives: Cesium.PrimitiveCollection;

  /** Radians per second (was 0.1° per rendered frame, i.e. ~6°/s at 60 fps). */
  private rotationSpeed = Cesium.Math.toRadians(6);
  private earthSpinListener: Cesium.Event.RemoveCallback | null = null;
  private tileset: Cesium.Cesium3DTileset | null = null;
  private renderLoop: RenderLoop;
  /** User/preset-chosen SSE; the performance governor scales it by `sseMultiplier`. */
  private baseMaximumScreenSpaceError = 24;
  private sseMultiplier = 1;

  constructor(containerId: string) {
    Cesium.Ion.defaultAccessToken = getTokens().cesium;
    
    this.viewer = new Cesium.Viewer(containerId, {
      timeline: false,
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      shadows: false,
      msaaSamples: 4,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      // Rendering is driven by RenderLoop, which adds vsync-locked frame pacing.
      useDefaultRenderLoop: false,
    });

    this.scene = this.viewer.scene;
    this.camera = this.viewer.camera;
    this.clock = this.viewer.clock;
    this.primitives = this.scene.primitives;

    this.setupScene();
    this.setupPostProcessing();
    this.loadTerrain();

    this.renderLoop = new RenderLoop(this.viewer.cesiumWidget);
    this.renderLoop.start();
  }

  private setupScene(): void {
    this.viewer.scene.globe.show = false;
    // Frame stats are shown by the React perf overlay (fed by PerformanceGovernor).
    this.scene.debugShowFramesPerSecond = false;

    // Disable default camera controller (we use custom cameras in play mode)
    this.viewer.scene.screenSpaceCameraController.enableRotate = false;
    this.viewer.scene.screenSpaceCameraController.enableZoom = false;
    this.viewer.scene.screenSpaceCameraController.enableLook = false;
    this.viewer.scene.screenSpaceCameraController.enableTilt = false;

    // Mars-like atmosphere
    if (this.scene.skyAtmosphere) {
      // this.scene.skyAtmosphere.atmosphereMieCoefficient = new Cesium.Cartesian3(9.0e-5, 2.0e-5, 1.0e-5);
      // this.scene.skyAtmosphere.atmosphereRayleighCoefficient = new Cesium.Cartesian3(9.0e-6, 2.0e-6, 1.0e-6);
      // this.scene.skyAtmosphere.atmosphereRayleighScaleHeight = 9000;
      // this.scene.skyAtmosphere.atmosphereMieScaleHeight = 2700.0;
      // this.scene.skyAtmosphere.saturationShift = -0.1;
      // this.scene.skyAtmosphere.perFragmentAtmosphere = true;
    }
  }

  private setupPostProcessing(): void {
    const bloom = this.viewer.scene.postProcessStages.bloom;
    bloom.enabled = true;
    bloom.uniforms.brightness = -0.5;
    bloom.uniforms.stepSize = 1.0;
    bloom.uniforms.sigma = 3.0;
    bloom.uniforms.delta = 1.5;
    this.scene.highDynamicRange = true;
    this.viewer.scene.postProcessStages.exposure = 1.5;
    
    this.viewer.scene.postProcessStages.fxaa.enabled = true;
  }

  private async loadTerrain(): Promise<void> {
    try {
      this.tileset = await Cesium.createGooglePhotorealistic3DTileset(
        {
          onlyUsingWithGoogleGeocoder: true,
        },
        {
          maximumScreenSpaceError: 24,
          dynamicScreenSpaceError: true,
          dynamicScreenSpaceErrorDensity: 2.0e-4,
          dynamicScreenSpaceErrorFactor: 24.0,
          dynamicScreenSpaceErrorHeightFalloff: 0.25,
          cullRequestsWhileMoving: true,
          cullRequestsWhileMovingMultiplier: 60.0,
          skipLevelOfDetail: true,
          baseScreenSpaceError: 1024,
          skipScreenSpaceErrorFactor: 16,
          skipLevels: 1,
        }
      );
      this.primitives.add(this.tileset);
      this.applyScreenSpaceError();

      this.setVehicleQualityMode('aircraft');
    } catch (error) {
      console.log('Terrain loading failed:', error);
    }
  }

  public clampToHeight(position: Cesium.Cartesian3, objectsToExclude?: any[]): Cesium.Cartesian3 | undefined {
    return this.scene.clampToHeight(position, objectsToExclude);
  }

  public setVehicleQualityMode(vehicleType: 'aircraft' | 'car'): void {
    if (!this.tileset) return;

    this.baseMaximumScreenSpaceError = 24;
    this.applyScreenSpaceError();
    console.log(`${vehicleType === 'car' ? '🚗' : '✈️'} Switched to ${vehicleType} mode - SSE: 24`);
  }

  public getQualityConfig(): QualityConfig {
    return {
      fxaaEnabled: this.viewer.scene.postProcessStages.fxaa.enabled,
      maximumScreenSpaceError: this.baseMaximumScreenSpaceError,
      dynamicScreenSpaceError: this.tileset?.dynamicScreenSpaceError ?? true,
      dynamicScreenSpaceErrorFactor: this.tileset?.dynamicScreenSpaceErrorFactor ?? 24.0,
      skipLevelOfDetail: this.tileset?.skipLevelOfDetail ?? true,
      bloomEnabled: this.viewer.scene.postProcessStages.bloom.enabled,
      hdr: this.scene.highDynamicRange,
      exposure: this.viewer.scene.postProcessStages.exposure,
      msaaSamples: this.getMsaaSamples(),
      resolutionScale: this.getResolutionScale(),
    };
  }

  public updateQualityConfig(config: Partial<QualityConfig>): void {
    if (config.fxaaEnabled !== undefined) {
      this.viewer.scene.postProcessStages.fxaa.enabled = config.fxaaEnabled;
    }

    if (config.maximumScreenSpaceError !== undefined) {
      this.baseMaximumScreenSpaceError = config.maximumScreenSpaceError;
      this.applyScreenSpaceError();
    }

    if (this.tileset) {
      if (config.dynamicScreenSpaceError !== undefined) {
        this.tileset.dynamicScreenSpaceError = config.dynamicScreenSpaceError;
      }
      if (config.dynamicScreenSpaceErrorFactor !== undefined) {
        this.tileset.dynamicScreenSpaceErrorFactor = config.dynamicScreenSpaceErrorFactor;
      }
      if (config.skipLevelOfDetail !== undefined) {
        this.tileset.skipLevelOfDetail = config.skipLevelOfDetail;
      }
    }

    if (config.bloomEnabled !== undefined) {
      this.viewer.scene.postProcessStages.bloom.enabled = config.bloomEnabled;
    }
    if (config.hdr !== undefined) {
      this.scene.highDynamicRange = config.hdr;
    }
    if (config.exposure !== undefined) {
      this.viewer.scene.postProcessStages.exposure = config.exposure;
    }
    if (config.msaaSamples !== undefined) {
      this.setMsaaSamples(config.msaaSamples);
    }
    if (config.resolutionScale !== undefined) {
      this.setResolutionScale(config.resolutionScale);
    }
  }

  // --- Runtime performance knobs (driven by PerformanceGovernor) --------------------------

  private applyScreenSpaceError(): void {
    if (this.tileset) {
      this.tileset.maximumScreenSpaceError = this.baseMaximumScreenSpaceError * this.sseMultiplier;
    }
  }

  public setSseMultiplier(multiplier: number): void {
    if (multiplier === this.sseMultiplier) return;
    this.sseMultiplier = multiplier;
    this.applyScreenSpaceError();
  }

  public setMsaaSamples(samples: number): void {
    // Cesium clamps to the context's limit; guard so no-op writes don't realloc framebuffers.
    if (this.scene.msaaSamples !== samples) {
      this.scene.msaaSamples = samples;
    }
  }

  public getMsaaSamples(): number {
    return this.scene.msaaSamples;
  }

  public setResolutionScale(scale: number): void {
    if (this.viewer.resolutionScale !== scale) {
      this.viewer.resolutionScale = scale;
    }
  }

  public getResolutionScale(): number {
    return this.viewer.resolutionScale;
  }

  /** Render every n-th display refresh (2 on a 120 Hz panel = locked 60 fps). */
  public setFrameDivisor(divisor: number): void {
    this.renderLoop.setDivisor(divisor);
  }

  public getRefreshHz(): number {
    return this.renderLoop.refreshHz;
  }

  /**
   * HUD panels use `backdrop-filter: blur()` over the WebGL canvas; since the canvas changes
   * every frame, the compositor re-blurs each panel every frame. Lite mode swaps in flat
   * translucency when the GPU is the bottleneck.
   */
  public setLiteEffects(enabled: boolean): void {
    document.documentElement.classList.toggle('perf-lite', enabled);
  }

  // Earth spinning functionality for startup sequence
  public startEarthSpin(): void {
    if (this.earthSpinListener) {
      return; // Already spinning
    }

    let last = performance.now();
    this.earthSpinListener = this.scene.postRender.addEventListener(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      this.camera.rotateRight(this.rotationSpeed * dt);
    });

    console.log('🌍 Earth spinning started - exploring the world...');
  }

  public stopEarthSpin(): void {
    if (this.earthSpinListener) {
      this.earthSpinListener();
      this.earthSpinListener = null;
      console.log('🌍 Earth spinning stopped');
    }
  }

  public enableDefaultCameraControls(enable: boolean): void {
    this.viewer.scene.screenSpaceCameraController.enableRotate = enable;
    this.viewer.scene.screenSpaceCameraController.enableZoom = enable;
    this.viewer.scene.screenSpaceCameraController.enableLook = enable;
    this.viewer.scene.screenSpaceCameraController.enableTilt = enable;
    this.viewer.scene.screenSpaceCameraController.enableTranslate = enable;
    console.log(`📷 Cesium default camera controls: ${enable ? 'ENABLED' : 'DISABLED'}`);
  }

  // Two-phase smooth zoom animation to target location
  public async zoomToLocation(position: Cesium.Cartesian3, duration: number = 5000): Promise<void> {
    const phase1Duration = duration - 1000; // Most of the time for approach
    const phase2Duration = 1000; // Last 1 second for final positioning

    console.log('📍 Zooming to spawn location...');

    // Phase 1: Approach the location without specific orientation
    await new Promise<void>((resolve) => {
      this.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(
          Cesium.Cartographic.fromCartesian(position).longitude,
          Cesium.Cartographic.fromCartesian(position).latitude,
          400
        ),
        duration: phase1Duration / 1000, // Convert to seconds
        complete: () => {
          console.log('📍 Phase 1 complete - approaching target...');
          resolve();
        }
      });
    });

    // Phase 2: Final positioning with specific orientation
    return new Promise((resolve) => {
      const heading = Cesium.Math.toRadians(230.0);
      const pitch = Cesium.Math.toRadians(-15.0);

      this.camera.flyTo({
        destination: position,
        orientation: {
          heading: heading,
          pitch: pitch,
          roll: 0.0
        },
        duration: phase2Duration / 1000, // Convert to seconds
        complete: () => {
          console.log('📍 Zoom complete - ready for vehicle spawn');
          resolve();
        }
      });
    });
  }
}
