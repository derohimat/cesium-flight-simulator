import { useState, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { useCameraPosition } from '../../../hooks/useCameraPosition';

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
  const {
    flyPath,
    startRecording,
    stopRecording,
    startOrbit,
    stopOrbit,
    stopLock,
    flyPathWithTargetLock,
    setVehicleVisibility,
    getCurrentCameraPosition,
    showFlightGuide,
    hideFlightGuide
  } = useGameMethod();

  const cameraPosition = useCameraPosition();

  const [cityName, setCityName] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // New State for Flight Modes
  const [flightMode, setFlightMode] = useState<FlightMode>('linear');
  const [orbitRadius, setOrbitRadius] = useState(500);

  // New State for Flight Parameters
  const [flightAltitude, setFlightAltitude] = useState(200);
  const [flightSpeed, setFlightSpeed] = useState(200);

  // Effect to show/hide flight guide based on target (last waypoint)
  useEffect(() => {
    if (waypoints.length > 0) {
      const target = waypoints[waypoints.length - 1];
      showFlightGuide(target);
    } else {
      hideFlightGuide();
    }
  }, [waypoints, showFlightGuide, hideFlightGuide]);

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
        setCityName(''); // Clear input after add
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartFlight = async () => {
    if (waypoints.length === 0) return;

    // cleanup
    hideFlightGuide();
    stopOrbit();
    stopLock();

    const currentPos = getCurrentCameraPosition();
    const startPoint = { lat: currentPos.latitude, lon: currentPos.longitude, name: 'Start' };

    // For linear flight, we fly FROM current camera position TO the waypoints
    const flightPath = flightMode === 'linear' ? [startPoint, ...waypoints] : waypoints;

    if (autoRecord) {
      startRecording();
      setIsRecording(true);
    }

    try {
      if (flightMode === 'linear') {
        console.log('Flight Plan created:', flightPath);
        await flyPath(flightPath.map(wp => ({ lat: wp.lat, lon: wp.lon })), { speed: flightSpeed, altitude: flightAltitude });
      } else if (flightMode === 'orbit') {
        const target = waypoints[waypoints.length - 1];
        startOrbit(target.lat, target.lon, flightAltitude, orbitRadius, 0.2, () => {
          console.log("Orbit complete.");
          if (autoRecord) {
            const filename = `arrival-${target.name.replace(/\s+/g, '-')}-${flightAltitude}m-orbit.mp4`;
            stopRecording(filename);
            setIsRecording(false);
          }
        });
      } else if (flightMode === 'lock') {
        if (waypoints.length >= 1) { // We can start lock from current pos to target if we have 1 waypoint? 
        // The original logic required 2 waypoints in list. 
        // Now we use current pos as start.
        // If we have 1 waypoint (Target), we fly from Current -> Target with lock?
        // flyPathWithTargetLock takes a PATH and a TARGET.
        // Let's assume path is Start -> Target (or nearby).
          const target = waypoints[waypoints.length - 1];

          // If we want a flyby with lock, we might need more logic. 
          // For now, let's keep original behavior: path is valid waypoints list minus target?
          // Or better: Fly from Current Position around/towards target?
          // Let's stick to using the waypoints list as the path, but prepend start?
          // Actually, `flyPathWithTargetLock` expects the path to be the camera path. 
          // Updated logic: Path = [Start, ...waypoints excluding last? or all?]
          // If flightMode is lock, Usually 1st point is start, last point is target? 
          // Let's use [Start, ...waypoints] as path, and Target is the LAST one.
          const lockPath = [startPoint, ...waypoints];
          // The target to lock ON is the last waypoint.
          // Pass speed to flyPathWithTargetLock options
          flyPathWithTargetLock(lockPath.map(p => ({ lat: p.lat, lon: p.lon })), { lat: target.lat, lon: target.lon }, { speed: flightSpeed }); 
        }
      }
    } catch (e) {
      console.error("Flight failed", e);
    }

    // specific handling for linear completion or manual stop is tricky because flyPath is async but might return early? 
    // flyPath awaits completion.
    // So for linear:
    if (flightMode === 'linear') {
      if (autoRecord) {
        const target = waypoints[waypoints.length - 1];
        const filename = `arrival-${target.name.replace(/\s+/g, '-')}-${flightAltitude}m-${flightSpeed}ms.mp4`;
        stopRecording(filename);
        setIsRecording(false);
      }
    }
  };

  const handleStopRecording = () => {
    stopRecording();
    setIsRecording(false);
  };

  const isStartDisabled = () => {
    if (flightMode === 'linear' && waypoints.length < 1) return true;
    if (flightMode === 'orbit' && waypoints.length < 1) return true;
    if (flightMode === 'lock' && waypoints.length < 1) return true; // Changed to 1 as we use current pos
    return false;
  };

  return (
    <div className="fixed top-8 left-8 z-50 w-80 pointer-events-auto">
      <Panel title="🎬 Director Mode">
        <div className="space-y-4 p-1">
          {/* HUD Telemetry Section */}
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
            <label className="col-span-2 flex items-center gap-2 px-2 py-1 bg-white/5 rounded cursor-pointer mt-1">
              <input
                type="checkbox"
                onChange={(e) => {
                  setVehicleVisibility(!e.target.checked);
                }}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-offset-0 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-white/70">Hide Aircraft (Invisible Mode)</span>
            </label>
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

            {/* Flight Parameters Sliders */}
            <div className="space-y-4 pt-2 border-t border-white/10">
              {/* Altitude Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/70">
                  <span>Flight Altitude</span>
                  <span>{flightAltitude}m</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={flightAltitude}
                  onChange={(e) => setFlightAltitude(Number(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Speed Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/70">
                  <span>Flight Speed</span>
                  <span>{flightSpeed}m/s</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={flightSpeed}
                  onChange={(e) => setFlightSpeed(Number(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {flightMode === 'orbit' && (
              <div className="space-y-1 pt-1 border-t border-white/10 mt-2">
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
                * Path: Camera -&gt; Target
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

          {isRecording && (
            <button
              onClick={handleStopRecording}
              className="w-full py-3 rounded font-medium transition-colors flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white animate-pulse"
            >
              ⏹ Stop Recording
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}
