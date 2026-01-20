import { useState } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useGameMethod } from '../../../hooks/useGameMethod';

interface Waypoint {
  lat: number;
  lon: number;
  name: string;
}

type FlightMode = 'linear' | 'orbit' | 'lock';

export function DirectorPanel() {
  const [isPortrait, setIsPortrait] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const { flyPath, startRecording, stopRecording, startOrbit, flyPathWithTargetLock } = useGameMethod();

  const [cityName, setCityName] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // New State for Flight Modes
  const [flightMode, setFlightMode] = useState<FlightMode>('linear');
  const [orbitRadius, setOrbitRadius] = useState(500);

  // Toggle Portrait Mode
  const togglePortrait = () => {
    setIsPortrait(!isPortrait);
    if (!isPortrait) {
      document.body.classList.add('portrait-mode');
    } else {
      document.body.classList.remove('portrait-mode');
    }
    // Trigger window resize event to ensure Cesium updates
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  };

  // Nominatim API Search
  const searchCity = async () => {
    if (!cityName.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const newWaypoint: Waypoint = {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon),
          name: result.display_name.split(',')[0] // Keep name short
        };

        console.log('Geocoded:', newWaypoint); // Verification requirement
        setWaypoints([...waypoints, newWaypoint]);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartFlight = async () => {
    if (waypoints.length === 0) return;

    if (autoRecord) {
      startRecording();
      setIsRecording(true);
    }

    try {
      if (flightMode === 'linear') {
        await flyPath(waypoints);
      } else if (flightMode === 'orbit') {
        const target = waypoints[waypoints.length - 1];
        startOrbit(target.lat, target.lon, 100, orbitRadius, 0.2, () => {
          console.log("Orbit complete.");
          if (autoRecord) {
            stopRecording();
            setIsRecording(false);
          }
        });
      } else if (flightMode === 'lock') {
        if (waypoints.length >= 2) {
          const target = waypoints[waypoints.length - 1];
          const path = waypoints.slice(0, waypoints.length - 1);
          flyPathWithTargetLock(path, target, 20); // Default 20s
        }
      }
    } catch (e) {
      console.error("Flight failed", e);
    }

    // specific handling for linear completion or manual stop
    if (flightMode === 'linear' && autoRecord) {
      stopRecording();
      setIsRecording(false);
    }
  };

  const isStartDisabled = () => {
    if (flightMode === 'linear' && waypoints.length < 1) return true;
    if (flightMode === 'orbit' && waypoints.length < 1) return true;
    if (flightMode === 'lock' && waypoints.length < 2) return true;
    return false;
  };

  return (
    <div className="fixed top-8 left-8 z-50 w-80 pointer-events-auto">
      <Panel title="🎬 Director Mode">
        <div className="space-y-4 p-1">
          {/* Settings Section */}
          <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded">
            <button
              onClick={togglePortrait}
              className={`text-xs py-1 px-2 rounded border transition-colors ${isPortrait
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-transparent border-white/20 text-white/50 hover:text-white'
                }`}
            >
              📱 Portrait (9:16)
            </button>
            <button
              onClick={() => setAutoRecord(!autoRecord)}
              className={`text-xs py-1 px-2 rounded border transition-colors ${autoRecord
                ? 'bg-red-600 border-red-500 text-white'
                : 'bg-transparent border-white/20 text-white/50 hover:text-white'
                }`}
            >
              🎥 Auto-Record: {autoRecord ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Input Section */}
          <div className="flex gap-2">
            <input
              type="text"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              placeholder="Enter City Name..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && searchCity()}
            />
            <button
              onClick={searchCity}
              disabled={isSearching}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSearching ? '...' : 'Add'}
            </button>
          </div>

          {/* Flight Mode Selector */}
          <div className="bg-white/5 p-2 rounded space-y-2">
            <label className="text-xs text-white/50 uppercase tracking-wider block">Flight Mode</label>
            <select
              value={flightMode}
              onChange={(e) => setFlightMode(e.target.value as FlightMode)}
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="linear">➡️ Linear Flyover</option>
              <option value="orbit">🔄 Orbit (360°)</option>
              <option value="lock">🎯 Target Lock</option>
            </select>

            {flightMode === 'orbit' && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs text-white/70">
                  <span>Radius</span>
                  <span>{orbitRadius}m</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="2000"
                  step="50"
                  value={orbitRadius}
                  onChange={(e) => setOrbitRadius(Number(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}

            {flightMode === 'lock' && (
              <div className="text-xs text-amber-400">
                * Requires at least 2 waypoints (Path points + Target)
              </div>
            )}
          </div>

          {/* Waypoints List */}
          <div className="max-h-40 overflow-y-auto space-y-2">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              Waypoints ({waypoints.length})
            </h3>

            {waypoints.length === 0 ? (
              <div className="text-xs text-white/30 text-center py-4">
                No waypoints added yet.
              </div>
            ) : (
              <div className="space-y-1">
                {waypoints.map((wp, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded text-sm gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{idx + 1}. {wp.name}</div>
                      <div className="text-xs text-white/40 font-mono">
                        {wp.lat.toFixed(2)}, {wp.lon.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Flight Button */}
          <button
            onClick={handleStartFlight}
            disabled={isStartDisabled()}
            className={`w-full py-3 rounded font-medium transition-colors flex items-center justify-center gap-2 ${isStartDisabled()
              ? 'bg-gray-700 text-gray-400'
              : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
          >
            {isRecording && <span className="animate-pulse w-2 h-2 rounded-full bg-red-400" />}
            {isRecording ? 'Recording...' : `Start ${flightMode === 'linear' ? 'Linear Flight' : flightMode === 'orbit' ? 'Orbit' : 'Cinematic Lock'}`}
          </button>
        </div>
      </Panel>
    </div>
  );
}
