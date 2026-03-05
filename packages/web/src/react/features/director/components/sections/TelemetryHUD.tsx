import { memo } from 'react';
import { useCameraPosition } from '../../../../hooks/useCameraPosition';

export const TelemetryHUD = memo(function TelemetryHUD() {
  const cameraPosition = useCameraPosition();

  return (
    <div className="bg-black/60 p-2 rounded border border-white/10 font-mono text-xs space-y-1">
      <div className="flex justify-between text-white/70">
        <span>LAT: {cameraPosition.latitude}</span>
        <span>LON: {cameraPosition.longitude}</span>
      </div>
      <div className="flex justify-between text-white/70">
        <span>ALT: {cameraPosition.altitude}m</span>
        <span>HDG: {cameraPosition.heading}°</span>
      </div>
      <div className="flex justify-between text-white/50 text-[10px]">
        <span>PITCH: {cameraPosition.pitch}°</span>
        <span>ROLL: {cameraPosition.roll}°</span>
      </div>
    </div>
  );
});
