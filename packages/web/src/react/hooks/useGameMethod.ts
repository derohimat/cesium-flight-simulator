import { useGameBridge } from './useGameBridge';
import type { CameraType } from '../../cesium/managers/CameraManager';
import type { VehicleStateData } from '../../cesium/bridge/types';
import type { QualityConfig } from '../../cesium/core/Scene';

export function useGameMethod() {
  const bridge = useGameBridge();

  return {
    switchCamera: () => bridge.switchCamera(),
    getCameraType: (): CameraType => bridge.getCameraType(),
    toggleRoverMode: () => bridge.toggleRoverMode(),
    toggleVehicleType: () => bridge.toggleVehicleType(),
    getRoverMode: (): boolean => bridge.getRoverMode(),
    toggleCollisionDetection: () => bridge.toggleCollisionDetection(),
    getCollisionDetection: (): boolean => bridge.getCollisionDetection(),
    getVehicleState: (): VehicleStateData | null => bridge.getVehicleState(),
    teleportTo: (longitude: number, latitude: number, altitude: number, heading?: number) => 
      bridge.teleportTo(longitude, latitude, altitude, heading),
    restart: () => bridge.restart(),
    getQualitySettings: (): QualityConfig => bridge.getQualitySettings(),
    updateQualitySettings: (config: Partial<QualityConfig>) => bridge.updateQualitySettings(config),
    applyQualityPreset: (preset: 'performance' | 'balanced' | 'quality' | 'ultra') => bridge.applyQualityPreset(preset),
    toggleBuilderMode: () => bridge.toggleBuilderMode(),
    setMode: (mode: 'play' | 'builder') => bridge.setMode(mode),
    getMode: () => bridge.getMode(),
    setThrottle: (percent: number) => bridge.setThrottle(percent),
    flyPath: (waypoints: { lat: number; lon: number }[]) => bridge.flyPath(waypoints),
    startRecording: () => bridge.startRecording(),
    stopRecording: () => bridge.stopRecording(),
    startOrbit: (lat: number, lon: number, height: number, radius?: number, speed?: number, onComplete?: () => void) =>
      bridge.startOrbit(lat, lon, height, radius, speed, onComplete),
    stopOrbit: () => bridge.stopOrbit(),
    flyPathWithTargetLock: (waypoints: { lat: number; lon: number }[], target: { lat: number; lon: number }, duration?: number) =>
      bridge.flyPathWithTargetLock(waypoints, target, duration),
    stopLock: () => bridge.stopLock(),
  };
}


