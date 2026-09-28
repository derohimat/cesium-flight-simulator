import { memo } from 'react';

interface FlightSettingsProps {
  isPortrait: boolean;
  onTogglePortrait: () => void;
  autoRecord: boolean;
  onToggleAutoRecord: () => void;
  vehicleVisibility: boolean;
  onToggleVehicleVisibility: (visible: boolean) => void;
}

export const FlightSettings = memo(function FlightSettings({
  isPortrait,
  onTogglePortrait,
  autoRecord,
  onToggleAutoRecord,
  vehicleVisibility,
  onToggleVehicleVisibility
}: FlightSettingsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded">
      <button
        onClick={onTogglePortrait}
        className={`text-xs py-1.5 px-2 rounded border transition-all ${isPortrait
          ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50'
          : 'bg-transparent border-white/10 text-white/50 hover:text-white hover:bg-white/5'
          }`}
      >
        📱 Portrait (9:16)
      </button>
      <button
        onClick={onToggleAutoRecord}
        className={`text-xs py-1.5 px-2 rounded border transition-all ${autoRecord
          ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/50'
          : 'bg-transparent border-white/10 text-white/50 hover:text-white hover:bg-white/5'
          }`}
      >
        🎥 Auto-Record
      </button>
      
      <label className="col-span-2 flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded cursor-pointer mt-1 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
        <input
          type="checkbox"
          checked={!vehicleVisibility}
          onChange={(e) => onToggleVehicleVisibility(!e.target.checked)}
          className="w-3.5 h-3.5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-offset-0 focus:ring-1 focus:ring-blue-500/50"
        />
        <span className="text-xs text-white/70">Hide Aircraft (Invisible Mode)</span>
      </label>
      
      {/* Terrain Avoidance Status */}
      <div className="col-span-2 flex items-center gap-2 px-2 py-1 bg-green-900/20 rounded border border-green-500/20 mt-1">
        <span className="text-green-400 text-[10px]">🛡️</span>
        <span className="text-[10px] text-green-300/80 uppercase tracking-wider font-medium">Terrain Avoidance Active</span>
      </div>
    </div>
  );
});
