import * as Cesium from 'cesium';
import type { CameraType } from '../managers/CameraManager';
import type { PerformanceSnapshot } from '../core/PerformanceGovernor';
import type { MissionEvent, MissionSnapshot } from '../missions/types';
import type { LandmarkNearby } from '../missions/LandmarkWatcher';

export type GameMode = 'play' | 'builder';

export interface VehicleStateData {
  speed: number;
  velocity: number;
  position: Cesium.Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
  /** Auto-GCAS is currently pulling the aircraft away from terrain. */
  collisionAssistActive: boolean;
  /** On the ground after a landing (hold W to take off). */
  landed: boolean;
  /** Degrees / metres, precomputed so UI code doesn't need Cesium math. */
  longitude: number;
  latitude: number;
  altitude: number;
}

export interface CameraStateData {
  type: CameraType;
}

export interface CameraPositionData {
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
  pitch: number;
  roll: number;
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
  cameraPositionChanged: CameraPositionData;
  roverModeChanged: RoverModeData;
  collisionDetectionChanged: CollisionDetectionData;
  playersUpdated: PlayersData;
  locationChanged: LocationChangedData;
  crashed: CrashData;
  modeChanged: ModeChangedData;
  performanceStats: PerformanceStatsData;
  missionState: MissionSnapshot;
  sceneryLoading: { loading: boolean };
  missionEvent: MissionEvent;
  landmarkNearby: LandmarkNearby;
  [key: string]: unknown;
}

