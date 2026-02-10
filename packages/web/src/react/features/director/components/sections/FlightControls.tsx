import { memo } from 'react';
import type { FlightMode } from '../DirectorPanel';

interface FlightControlsProps {
  flightMode: FlightMode;
  onModeChange: (mode: FlightMode) => void;
  flightAltitude: number;
  onAltitudeChange: (val: number) => void;
  flightSpeed: number;
  onSpeedChange: (val: number) => void;
  orbitRadius: number;
  onOrbitRadiusChange: (val: number) => void;
  autoAltitudeMode: boolean;
  sceneType: string | null;
  onAutoAltitude: () => void;
}

const SPEED_PRESETS = [
  { label: 'Slow', value: 30, description: 'Detail shots' },
  { label: 'Normal', value: 60, description: 'Standard' },
  { label: 'Fast', value: 100, description: 'Dynamic' },
];

export const FlightControls = memo(function FlightControls({
  flightMode,
  onModeChange,
  flightAltitude,
  onAltitudeChange,
  flightSpeed,
  onSpeedChange,
  orbitRadius,
  onOrbitRadiusChange,
  autoAltitudeMode,
  sceneType,
  onAutoAltitude
}: FlightControlsProps) {
  return (
    <div className="bg-white/5 p-3 rounded-lg space-y-4 border border-white/5">
      <div className="space-y-1.5">
        <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Flight Mode</label>
        <div className="flex bg-black/40 p-1 rounded-lg">
          {(['linear', 'orbit', 'lock'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onModeChange(mode)}
              className={`flex-1 text-xs py-1.5 rounded-md transition-all ${flightMode === mode 
                ? 'bg-white/10 text-white shadow-sm' 
                : 'text-white/40 hover:text-white/70'}`}
            >
              {mode === 'linear' ? 'Linear' : mode === 'orbit' ? 'Orbit' : 'Lock'}
            </button>
          ))}
        </div>
      </div>

      {/* Flight Parameters Sliders */}
      <div className="space-y-4">
        {/* Altitude Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs items-center">
            <span className="text-white/50">Altitude</span>
            <div className="flex items-center gap-2">
              {sceneType && (
                <span className="text-[9px] text-future-accent bg-future-primary/10 px-1.5 py-0.5 rounded border border-future-primary/20">
                  {sceneType}
                </span>
              )}
              <span className={`font-mono ${autoAltitudeMode ? 'text-green-400' : 'text-white/90'}`}>
                {flightAltitude}m
              </span>
            </div>
          </div>
          <input
            type="range"
            min="50"
            max="2000"
            step="50"
            value={flightAltitude}
            onChange={(e) => onAltitudeChange(Number(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-future-primary hover:bg-white/20 transition-colors"
          />
          {/* Auto Altitude Button */}
          <button
            onClick={onAutoAltitude}
            className={`w-full text-[10px] py-1.5 px-2 rounded transition-all flex items-center justify-center gap-1.5 ${autoAltitudeMode
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'
              }`}
            title="Automatically calculate best viewing altitude based on terrain"
          >
            <span className={autoAltitudeMode ? 'animate-pulse' : ''}>✨</span> 
            Smart Altitude Optimization
          </button>
        </div>

        {/* Speed Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs items-center">
            <span className="text-white/50">Speed</span>
            <span className="text-future-accent font-mono">{flightSpeed}m/s</span>
          </div>
          <input
            type="range"
            min="20"
            max="150"
            step="5"
            value={flightSpeed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-future-primary hover:bg-white/20 transition-colors"
          />
          {/* Speed Presets */}
          <div className="flex gap-1">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => onSpeedChange(preset.value)}
                className={`flex-1 text-[10px] py-1 px-1 rounded transition-colors border ${flightSpeed === preset.value
                  ? 'bg-future-primary/20 text-future-accent border-future-primary/30'
                  : 'bg-white/5 text-white/40 border-transparent hover:bg-white/10'
                  }`}
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {flightMode === 'orbit' && (
        <div className="space-y-2 pt-3 border-t border-white/5">
          <div className="flex justify-between text-xs text-white/50">
            <span>Orbit Radius</span>
            <span className="text-white/90 font-mono">{orbitRadius}m</span>
          </div>
          <input
            type="range"
            min="200"
            max="2000"
            step="50"
            value={orbitRadius}
            onChange={(e) => onOrbitRadiusChange(Number(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-future-primary hover:bg-white/20 transition-colors"
          />
        </div>
      )}

      {flightMode === 'lock' && (
        <div className="text-[10px] text-amber-400/80 bg-amber-900/20 px-2 py-1.5 rounded border border-amber-500/20 flex items-center gap-2">
          <span>ℹ️</span>
          Path: Camera Position ⟶ Target
        </div>
      )}
    </div>
  );
});
