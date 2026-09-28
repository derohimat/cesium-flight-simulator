import { useGameEvent } from '../../../hooks/useGameEvent';

export interface VehiclePosition {
  longitude: number;
  latitude: number;
  altitude: number;
  heading: number;
}

const DEFAULT_POSITION: VehiclePosition = {
  longitude: 11.9746,
  latitude: 57.7089,
  altitude: 200,
  heading: 0,
};

/**
 * 10 Hz is plenty for a minimap. Every update re-renders a second WebGL context (Mapbox)
 * that competes with Cesium for the GPU, and it used to run at the full 60 Hz event rate.
 */
const MINIMAP_UPDATE_MS = 100;

export function useVehiclePosition(): VehiclePosition {
  const vehicleState = useGameEvent('vehicleStateChanged', { throttle: MINIMAP_UPDATE_MS });

  if (!vehicleState) return DEFAULT_POSITION;
  return {
    longitude: vehicleState.longitude,
    latitude: vehicleState.latitude,
    altitude: vehicleState.altitude,
    heading: (vehicleState.heading * 180) / Math.PI,
  };
}
