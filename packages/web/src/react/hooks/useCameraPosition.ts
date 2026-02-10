import { useState, useEffect } from 'react';
import { useGameBridge } from './useGameBridge';

export interface CameraPosition {
  latitude: string;
  longitude: string;
  altitude: string;
  heading: string;
  pitch: string;
  roll: string;
}

export function useCameraPosition() {
  const bridge = useGameBridge();
  const [position, setPosition] = useState<CameraPosition>({
    latitude: '0.00000',
    longitude: '0.00000',
    altitude: '0',
    heading: '0',
    pitch: '0',
    roll: '0'
  });

  useEffect(() => {
    let lastUpdate = 0;
    const UPDATE_RATE = 250; // Throttle to 4fps for UI

    const handleCameraUpdate = (data: any) => {
      const now = Date.now();
      if (now - lastUpdate < UPDATE_RATE) return;

      lastUpdate = now;
      setPosition({
        latitude: data.latitude.toFixed(5),
        longitude: data.longitude.toFixed(5),
        altitude: Math.round(data.altitude).toString(),
        heading: Math.round(data.heading).toString(),
        pitch: Math.round(data.pitch).toString(),
        roll: Math.round(data.roll).toString(),
      });
    };

    bridge.on('cameraPositionChanged', handleCameraUpdate);

    return () => {
      bridge.off('cameraPositionChanged', handleCameraUpdate);
    };
  }, [bridge]);

  return position;
}
