import * as Cesium from 'cesium';
import { TypedEventEmitter } from './TypedEventEmitter';
import type { GameEvents, VehicleStateData, GameMode, PerformanceStatsData, CameraPositionData } from './types';
import type { CesiumVehicleGame } from '../bootstrap/main';
import type { CameraType } from '../managers/CameraManager';
import type { QualityConfig } from '../core/Scene';
import { Car } from '../vehicles/car/Car';
import { Aircraft } from '../vehicles/aircraft/Aircraft';
import type { Vehicle } from '../vehicles/Vehicle';
import { ModeManager } from '../modes/ModeManager';
import type { FrameHook } from '../core/GameLoop';
import { LandmarkWatcher } from '../missions/LandmarkWatcher';
import { MISSIONS } from '../missions/missions';
import type { MissionDefinition, MissionSnapshot } from '../missions/types';

/** UI refresh rates. Faster only burns main-thread time the renderer needs. */
const VEHICLE_STATE_INTERVAL_MS = 1000 / 30;
const CAMERA_STATE_INTERVAL_MS = 100;
const MISSION_STATE_INTERVAL_MS = 100;
const LANDMARK_CHECK_INTERVAL_MS = 1000;
const PERFORMANCE_STATS_INTERVAL_MS = 250;

export class GameBridge extends TypedEventEmitter<GameEvents> {
  private game: CesiumVehicleGame;
  private currentMode: GameMode = 'play';
  private modeManager: ModeManager;
  private frameHook: FrameHook;
  private lastVehicleEmit = 0;
  private lastStatsEmit = 0;
  private lastCameraEmit = 0;
  private lastMissionEmit = 0;
  private lastLandmarkCheck = 0;
  private landmarks = new LandmarkWatcher();
  private lastCrashed = false;
  private static readonly scratchCartographic = new Cesium.Cartographic();
  private static readonly scratchCameraCartographic = new Cesium.Cartographic();

  constructor(game: CesiumVehicleGame) {
    super();
    this.game = game;
    this.modeManager = new ModeManager(game);
    // Emit from the render loop, right after the frame is submitted: the UI sees exactly what
    // was drawn, and a timer can't wake up in the middle of a frame.
    this.frameHook = { onFrameEnd: (_start, end) => this.onFrameEnd(end) };
    this.game.getGameLoop().addFrameHook(this.frameHook);
    this.game.getMissionManager().onEvent((event) => {
      if (event.type === 'objectiveCompleted' && event.placeId) {
        this.landmarks.markShown(event.placeId, performance.now());
      }
      this.emit('missionEvent', event);
      this.emit('missionState', this.game.getMissionManager().getSnapshot());
    });
    this.setupVehicleChangeListener();
    this.setupBuilderModeListener();
    this.applyQualityPreset('performance');
    console.log('🎮 Applied performance mode on startup');
  }

  private setupBuilderModeListener(): void {
    this.game.getInputManager().onInput('toggleBuilder', (pressed) => {
      if (pressed) {
        this.toggleBuilderMode();
      }
    });
  }

  private setupVehicleChangeListener(): void {
    this.game.getVehicleManager().addVehicleChangeListener((vehicle) => {
      this.emitVehicleChangeEvents(vehicle);
    });
  }

  private onFrameEnd(now: number): void {
    if (now - this.lastVehicleEmit >= VEHICLE_STATE_INTERVAL_MS) {
      this.lastVehicleEmit = now;
      this.emitVehicleState();
    }
    if (now - this.lastCameraEmit >= CAMERA_STATE_INTERVAL_MS && this.listenerCount('cameraPositionChanged') > 0) {
      this.lastCameraEmit = now;
      this.emit('cameraPositionChanged', this.getCurrentCameraPosition());
    }
    const missions = this.game.getMissionManager();
    if (now - this.lastMissionEmit >= MISSION_STATE_INTERVAL_MS && missions.getStatus() !== 'idle') {
      this.lastMissionEmit = now;
      this.emit('missionState', missions.getSnapshot());
    }
    if (now - this.lastLandmarkCheck >= LANDMARK_CHECK_INTERVAL_MS && !missions.isRunning()) {
      this.lastLandmarkCheck = now;
      this.checkLandmarks(now);
    }
    if (now - this.lastStatsEmit >= PERFORMANCE_STATS_INTERVAL_MS && this.listenerCount('performanceStats') > 0) {
      this.lastStatsEmit = now;
      this.emit('performanceStats', this.getPerformanceStats());
    }
  }

  private emitVehicleState(): void {
    const vehicle = this.game.getVehicleManager().getActiveVehicle();

    if (vehicle && vehicle.isModelReady()) {
      this.emit('vehicleStateChanged', this.toVehicleStateData(vehicle));

      // Only on transitions; re-sending while crashed re-rendered the crash screen every tick.
      // During a mission the crash is the mission's (its result screen handles it).
      const crashed =
        vehicle instanceof Aircraft && vehicle.isCrashed() && !this.game.getMissionManager().isRunning() &&
        this.game.getMissionManager().getStatus() !== 'failed';
      if (crashed !== this.lastCrashed) {
        this.emit('crashed', { crashed });
      }
      this.lastCrashed = crashed;
    }
  }

  private toVehicleStateData(vehicle: Vehicle): VehicleStateData {
    const state = vehicle.getState();
    const carto = Cesium.Cartographic.fromCartesian(
      state.position,
      Cesium.Ellipsoid.WGS84,
      GameBridge.scratchCartographic
    );
    return {
      speed: state.speed,
      velocity: state.velocity,
      position: Cesium.Cartesian3.clone(state.position),
      heading: state.heading,
      pitch: state.pitch,
      roll: state.roll,
      longitude: carto ? Cesium.Math.toDegrees(carto.longitude) : 0,
      latitude: carto ? Cesium.Math.toDegrees(carto.latitude) : 0,
      altitude: carto ? carto.height : 0,
    };
  }

  private checkLandmarks(now: number): void {
    if (this.listenerCount('landmarkNearby') === 0) return;
    const state = this.getVehicleState();
    if (!state) return;
    const nearby = this.landmarks.check(state.latitude, state.longitude, now);
    if (nearby) this.emit('landmarkNearby', nearby);
  }

  // --- Missions ---------------------------------------------------------------------------

  public getMissions(): MissionDefinition[] {
    return MISSIONS;
  }

  public startMission(missionId: string): Promise<void> {
    return this.game.getMissionManager().start(missionId);
  }

  public abortMission(): void {
    this.game.getMissionManager().abort();
    this.emit('missionState', this.game.getMissionManager().getSnapshot());
  }

  /** Close the result screen; a crashed aircraft continues from its crash site. */
  public dismissMission(): void {
    this.game.getMissionManager().dismiss();
    this.game.getVehicleManager().recoverFromCrash();
    this.emit('missionState', this.game.getMissionManager().getSnapshot());
  }

  public getMissionState(): MissionSnapshot {
    return this.game.getMissionManager().getSnapshot();
  }

  public getPerformanceStats(): PerformanceStatsData {
    return {
      ...this.game.getPerformanceGovernor().snapshot(),
      groundQueriesPerSecond: this.game.getGroundSampler().queriesPerSecond,
      physicsStepsLastFrame: this.game.getGameLoop().lastStepCount,
    };
  }

  /** Live ring buffers (ms) for the frame-time graph; `cursor` is the next write index. */
  public getFrameHistory(): { intervals: Float32Array; cpu: Float32Array; cursor: number } {
    const governor = this.game.getPerformanceGovernor();
    return { intervals: governor.frameIntervals, cpu: governor.cpuTimes, cursor: governor.frameCursor };
  }

  public setAdaptiveQuality(enabled: boolean): void {
    this.game.getPerformanceGovernor().setAdaptive(enabled);
  }

  public emitVehicleChangeEvents(vehicle: Vehicle): void {
    if (vehicle instanceof Car) {
      this.emit('collisionDetectionChanged', {
        enabled: vehicle.getCollisionDetection(),
      });
      this.emit('roverModeChanged', {
        enabled: vehicle.getRoverMode(),
      });
    } else if (vehicle instanceof Aircraft) {
      this.emit('collisionDetectionChanged', { enabled: false });
      this.emit('roverModeChanged', { enabled: false });
    }
  }

  public switchCamera(): void {
    const cameraManager = this.game.getCameraManager();
    cameraManager.switchCamera();
    this.emit('cameraChanged', {
      type: cameraManager.getActiveCameraType(),
    });
  }

  public getCameraType(): CameraType {
    return this.game.getCameraManager().getActiveCameraType();
  }

  public toggleRoverMode(): void {
    const active = this.game.getVehicleManager().getActiveVehicle();
    if (!active) return;

    if (active instanceof Car) {
      const newMode = !active.getRoverMode();
      active.setRoverMode(newMode);
      this.emit('roverModeChanged', { enabled: newMode });
    }
  }

  public toggleVehicleType(): void {
    this.game.getVehicleManager().toggleVehicleType();
  }

  public getRoverMode(): boolean {
    const active = this.game.getVehicleManager().getActiveVehicle();
    if (!active) return true;
    if (active instanceof Car) return active.getRoverMode();
    if (active instanceof Aircraft) return false;
    return true;
  }

  public toggleCollisionDetection(): void {
    const active = this.game.getVehicleManager().getActiveVehicle();
    if (active instanceof Car) {
      active.toggleCollisionDetection();
      this.emit('collisionDetectionChanged', {
        enabled: active.getCollisionDetection(),
      });
    } else {
      // Aircraft: treat as collision always enabled off (no toggle)
      this.emit('collisionDetectionChanged', { enabled: false });
    }
  }

  public getCollisionDetection(): boolean {
    const active = this.game.getVehicleManager().getActiveVehicle();
    if (active instanceof Car) return active.getCollisionDetection();
    // Aircraft: no collision toggle, return false to avoid UI assuming it's on
    return false;
  }

  public getVehicleState(): VehicleStateData | null {
    const vehicle = this.game.getVehicleManager().getActiveVehicle();
    if (vehicle && vehicle.isModelReady()) {
      return this.toVehicleStateData(vehicle);
    }
    return null;
  }

  public getCurrentCameraPosition(): CameraPositionData {
    const camera = this.game.getScene().camera;
    // positionWC, not position: chase cameras use lookAt, which makes `position` an offset in
    // the vehicle's local frame (it read as ~6,000 km below the surface).
    const positionCartographic = Cesium.Cartographic.fromCartesian(camera.positionWC, Cesium.Ellipsoid.WGS84, GameBridge.scratchCameraCartographic);
    return {
      latitude: Cesium.Math.toDegrees(positionCartographic.latitude),
      longitude: Cesium.Math.toDegrees(positionCartographic.longitude),
      altitude: positionCartographic.height,
      heading: Cesium.Math.toDegrees(camera.heading),
      pitch: Cesium.Math.toDegrees(camera.pitch),
      roll: Cesium.Math.toDegrees(camera.roll),
    };
  }

  public teleportTo(longitude: number, latitude: number, altitude: number, heading: number = 0): void {
    const vehicle = this.game.getVehicleManager().getActiveVehicle();
    if (vehicle) {
      const newPosition = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
      const currentState = vehicle.getState();
      vehicle.setState({
        ...currentState,
        position: newPosition,
        heading: Cesium.Math.toRadians(heading),
        pitch: 0,
        roll: 0,
        velocity: 0,
        speed: 0
      });
      this.emit('locationChanged', {
        longitude,
        latitude,
        altitude
      });
    }
  }

  public restart(): void {
    // Continue from the crash site (the crashed=false event follows from emitVehicleState).
    this.game.getVehicleManager().recoverFromCrash();
  }


  public destroy(): void {
    this.game.getGameLoop().removeFrameHook(this.frameHook);
    this.removeAllListeners();
  }

  public getQualitySettings(): QualityConfig {
    return this.game.getScene().getQualityConfig();
  }

  public updateQualitySettings(config: Partial<QualityConfig>): void {
    // MSAA and resolution are the governor's knobs; touching them by hand means manual mode.
    if (config.msaaSamples !== undefined || config.resolutionScale !== undefined) {
      this.setAdaptiveQuality(false);
    }
    this.game.getScene().updateQualityConfig(config);
  }

  public toggleBuilderMode(): void {
    const newMode: GameMode = this.currentMode === 'play' ? 'builder' : 'play';
    this.setMode(newMode);
  }

  public setMode(mode: GameMode): void {
    if (this.currentMode === mode) {
      console.log(`🎮 Already in ${mode} mode`);
      return;
    }
    
    // Builder mode takes over the camera and freezes physics; a mission can't continue.
    if (mode === 'builder') this.abortMission();

    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    this.modeManager.onModeChanged(previousMode, mode);
    
    this.emit('modeChanged', { mode, previousMode });
    
    console.log(`🎮 Mode changed: ${previousMode} → ${mode}`);
  }

  public getMode(): GameMode {
    return this.currentMode;
  }

  public applyQualityPreset(preset: 'performance' | 'balanced' | 'quality' | 'ultra'): void {
    const presets: Record<string, Partial<QualityConfig>> = {
      performance: {
        maximumScreenSpaceError: 32,
        dynamicScreenSpaceError: true,
        dynamicScreenSpaceErrorFactor: 32,
        skipLevelOfDetail: true,
        fxaaEnabled: true,
        bloomEnabled: false,
        hdr: false,
        exposure: 1.0,
      },
      balanced: {
        maximumScreenSpaceError: 16,
        dynamicScreenSpaceError: true,
        dynamicScreenSpaceErrorFactor: 24,
        skipLevelOfDetail: true,
        fxaaEnabled: true,
        bloomEnabled: true,
        hdr: true,
        exposure: 1.5,
      },
      quality: {
        maximumScreenSpaceError: 8,
        dynamicScreenSpaceError: true,
        dynamicScreenSpaceErrorFactor: 16,
        skipLevelOfDetail: true,
        fxaaEnabled: true,
        bloomEnabled: true,
        hdr: true,
        exposure: 1.5,
      },
      ultra: {
        maximumScreenSpaceError: 4,
        dynamicScreenSpaceError: false,
        dynamicScreenSpaceErrorFactor: 12,
        skipLevelOfDetail: false,
        fxaaEnabled: true,
        bloomEnabled: true,
        hdr: true,
        exposure: 1.8,
      },
    };

    const config = presets[preset];
    if (config) {
      this.updateQualitySettings(config);
      console.log(`🎨 Applied ${preset} quality preset`);
    }
  }

  public setThrottle(percent: number): void {
    this.game.getInputManager().setThrottlePercent(percent * 100);
  }

  public async flyPath(waypoints: { lat: number; lon: number }[], options: { speed?: number; altitude?: number } = {}): Promise<void> {
    await this.game.getAutopilotManager().flyPath(waypoints, options);
  }

  public startRecording(): void {
    // A resolution change resizes the canvas that captureStream records; hold quality steady.
    this.game.getPerformanceGovernor().setHold(true);
    this.game.getRecordingManager().startRecording();
  }

  public stopRecording(fileName?: string): void {
    this.game.getPerformanceGovernor().setHold(false);
    this.game.getRecordingManager().stopRecording(fileName);
  }

  public showFlightGuide(target: { lat: number, lon: number }): void {
    const targetCart = Cesium.Cartographic.fromDegrees(target.lon, target.lat);
    this.game.getAutopilotManager().showGuideLine(targetCart);
  }

  public hideFlightGuide(): void {
    this.game.getAutopilotManager().hideGuideLine();
  }

  public startOrbit(lat: number, lon: number, height: number, radius: number = 200, speed: number = 0.5, onComplete?: () => void): void {
    const center = new Cesium.Cartographic(
      Cesium.Math.toRadians(lon),
      Cesium.Math.toRadians(lat),
      height
    );
    this.game.getAutopilotManager().startOrbit(center, radius, speed, onComplete);
  }

  public stopOrbit(): void {
    this.game.getAutopilotManager().stopOrbit();
  }

  public flyPathWithTargetLock(waypoints: { lat: number; lon: number }[], target: { lat: number; lon: number }, options: { speed?: number; duration?: number } = {}): void {
    const defaultAltitude = 300; 
    const path = waypoints.map(wp => new Cesium.Cartographic(Cesium.Math.toRadians(wp.lon), Cesium.Math.toRadians(wp.lat), defaultAltitude)); // Flight altitude handling is inside AutopilotManager for spline sampling?
    // Wait, flyPathWithTargetLock in AutopilotManager takes Cartographic[] path. 
    // The previous implementation hardcoded 300m height in GameBridge map.
    // The previous AutopilotManager implementation uses spline.evaluate(elapsed).
    // If the path points have 300m height, the camera will fly at 300m height.
    // We should probably allow altitude override here too?
    // For now let's just update the signature to pass options.
    
    // Actually, let's respect the visual guide height if possible, but the path is just waypoints.
    // Let's assume the user wants to fly AT the set altitude.
    
    const targetCart = new Cesium.Cartographic(Cesium.Math.toRadians(target.lon), Cesium.Math.toRadians(target.lat), 0);
    this.game.getAutopilotManager().flyPathWithTargetLock(path, targetCart, options);
  }

  public stopLock(): void {
    this.game.getAutopilotManager().stopLock();
  }

  public setVehicleVisibility(visible: boolean): void {
    this.game.getVehicleManager().setVehicleVisibility(visible);
  }

  public setCameraSpeed(speed: number): void {
    this.modeManager.setCameraSpeed(speed);
  }

  /**
   * Calculate optimal altitude for best view at a location
   */
  public async calculateAutoAltitude(lng: number, lat: number): Promise<{ altitude: number; sceneType: string } | null> {
    const terrainAvoidance = this.game.getAutopilotManager().getTerrainAvoidance();
    if (!terrainAvoidance) return null;

    const result = await terrainAvoidance.withHeights(() => terrainAvoidance.calculateAutoAltitude(lng, lat));
    return {
      altitude: Math.round(result.recommendedAltitude),
      sceneType: result.sceneType
    };
  }

  /**
   * Calculate optimal altitude for a flight path
   */
  public async calculateAutoAltitudeForPath(waypoints: { lat: number; lon: number }[]): Promise<number | null> {
    const terrainAvoidance = this.game.getAutopilotManager().getTerrainAvoidance();
    if (!terrainAvoidance) return null;

    return terrainAvoidance.withHeights(() => terrainAvoidance.calculateAutoAltitudeForPath(waypoints));
  }

  /**
   * Get altitude presets for current camera position
   */
  public async getAltitudePresets(lng: number, lat: number): Promise<{ preset: string; altitude: number; description: string }[] | null> {
    const terrainAvoidance = this.game.getAutopilotManager().getTerrainAvoidance();
    if (!terrainAvoidance) return null;

    return terrainAvoidance.withHeights(() => terrainAvoidance.getAltitudePresets(lng, lat));
  }
}

