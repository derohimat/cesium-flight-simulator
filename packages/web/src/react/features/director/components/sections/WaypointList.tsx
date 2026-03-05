import { memo } from 'react';
import type { Waypoint } from '../DirectorPanel';

interface WaypointListProps {
  waypoints: Waypoint[];
  onRemove: (index: number) => void;
  onGoTo: (index: number) => void;
  onClear: () => void;
}

export const WaypointList = memo(function WaypointList({ waypoints, onRemove, onClear, onGoTo }: WaypointListProps) {
  if (waypoints.length === 0) {
    return (
      <div className="text-xs text-white/30 text-center py-4 bg-white/5 rounded border border-white/5 border-dashed">
        No waypoints added yet.
        <br />
        Search comfortably or click map.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {waypoints.map((wp, idx) => (
          <div 
            key={`${wp.lat}-${wp.lon}-${idx}`} 
            className="group flex items-center justify-between bg-white/5 hover:bg-white/10 p-2 rounded text-sm gap-2 transition-colors border border-transparent hover:border-white/10"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-white/30 font-mono w-4">{idx + 1}</span>
              <div className="min-w-0">
                <div className="truncate font-medium text-white/90">{wp.name}</div>
                <div className="text-[10px] text-white/40 font-mono">
                  {wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => onGoTo(idx)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500/20 text-white/30 hover:text-blue-400 rounded transition-all flex items-center justify-center w-6 h-6"
                title="Go to waypoint"
              >
                📍
              </button>
              <button
                onClick={() => onRemove(idx)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-white/30 hover:text-red-400 rounded transition-all flex items-center justify-center w-6 h-6"
                title="Remove waypoint"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {waypoints.length > 1 && (
        <button 
          onClick={onClear}
          className="w-full text-[10px] text-red-400/50 hover:text-red-400 py-1 hover:bg-red-500/10 rounded transition-colors"
        >
          Clear All Waypoints
        </button>
      )}
    </div>
  );
});
