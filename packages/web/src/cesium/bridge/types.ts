import * as Cesium from 'cesium';
import type { CameraType } from '../managers/CameraManager';
import type { PerformanceSnapshot } from '../core/PerformanceGovernor';

export type GameMode = 'play' | 'builder';

export interface VehicleStateData {
  speed: number;
  velocity: number;
  position: Cesium.Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
  /** Degrees / metres, precomputed so UI code doesn't need Cesium math. */
  longitude: number;
  latitude: number;
  altitude: number;
}

export interface CameraStateData {
  type: CameraType;
}

export interface RoverModeData {
  enabled: boolean;
}

export interface CollisionDetectionData {
  enabled: boolean;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  position: Cesium.Cartesian3;
  heading: number;
  vehicleType: string;
}

export interface PlayersData {
  players: OnlinePlayer[];
  updateType: 'full' | 'incremental';
}

export interface GameReadyData {
  ready: boolean;
}

export interface LocationChangedData {
  longitude: number;
  latitude: number;
  altitude: number;
}

export interface CrashData {
  crashed: boolean;
}

export interface ModeChangedData {
  mode: GameMode;
  previousMode: GameMode;
}

export interface PerformanceStatsData extends PerformanceSnapshot {
  groundQueriesPerSecond: number;
  physicsStepsLastFrame: number;
}

export interface GameEvents {
  gameReady: GameReadyData;
  vehicleStateChanged: VehicleStateData;
  cameraChanged: CameraStateData;
  roverModeChanged: RoverModeData;
  collisionDetectionChanged: CollisionDetectionData;
  playersUpdated: PlayersData;
  locationChanged: LocationChangedData;
  crashed: CrashData;
  modeChanged: ModeChangedData;
  performanceStats: PerformanceStatsData;
  [key: string]: unknown;
}

