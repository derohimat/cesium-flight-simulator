import { useState, useEffect, useCallback, useMemo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { useCameraPosition } from '../../../hooks/useCameraPosition';
import { TelemetryHUD } from './sections/TelemetryHUD';
import { FlightSettings } from './sections/FlightSettings';
import { WaypointSearch } from './sections/WaypointSearch';
import { FlightControls } from './sections/FlightControls';
import { WaypointList } from './sections/WaypointList';
import { cn } from '../../../shared/utils/cn';
import { getTokens } from '../../../../utils/tokenValidator';

export interface Waypoint {
  lat: number;
  lon: number;
  name: string;
}

export type FlightMode = 'linear' | 'orbit' | 'lock';

export function DirectorPanel() {
  const [isPortrait, setIsPortrait] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [vehicleVisibility, setVisibility] = useState(true); // Internal state to match prop name

  const {
    flyPath,
    startRecording,
    stopRecording: stopRec,
    startOrbit,
    stopOrbit,
    stopLock,
    flyPathWithTargetLock,
    setVehicleVisibility,
    getCurrentCameraPosition,
    showFlightGuide,
    hideFlightGuide,
    setCameraSpeed,
    teleportTo,
    calculateAutoAltitude,
    calculateAutoAltitudeForPath
  } = useGameMethod();

  const cameraPosition = useCameraPosition();

  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Flight Modes State
  const [flightMode, setFlightMode] = useState<FlightMode>('linear');
  const [orbitRadius, setOrbitRadius] = useState(500);

  // Flight Parameters State
  const [flightAltitude, setFlightAltitude] = useState(200);
  const [flightSpeed, setFlightSpeed] = useState(60); 

  // Auto altitude state
  const [autoAltitudeMode, setAutoAltitudeMode] = useState(false);
  const [sceneType, setSceneType] = useState<string | null>(null);

  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // Sync Camera Speed with Flight Speed slider
  useEffect(() => {
    setCameraSpeed(flightSpeed);
  }, [flightSpeed, setCameraSpeed]);

  // Effect to show/hide flight guide based on target (last waypoint)
  useEffect(() => {
    if (waypoints.length > 0) {
      const target = waypoints[waypoints.length - 1];
      showFlightGuide(target);
    } else {
      hideFlightGuide();
    }
  }, [waypoints, showFlightGuide, hideFlightGuide]);

  // Handlers wrapped in useCallback for stable props to memoized children
  const handleTogglePortrait = useCallback(() => {
    setIsPortrait(prev => {
      const newVal = !prev;
      if (newVal) {
        document.body.classList.add('portrait-mode');
      } else {
        document.body.classList.remove('portrait-mode');
      }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        return newVal;
      });
  }, []);

  const handleToggleAutoRecord = useCallback(() => setAutoRecord(p => !p), []);

  const handleToggleVehicleVisibility = useCallback((val: boolean) => {
    setVisibility(val);
    setVehicleVisibility(val);
  }, [setVehicleVisibility]);

  const handleSearch = useCallback(async (city: string) => {
    setIsSearching(true);
    const tokens = getTokens();
    
    try {
      let result;
      
      if (tokens.mapbox) {
        // Use Mapbox Geocoding API
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?access_token=${tokens.mapbox}&limit=1`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          result = {
            lat: feature.center[1],
            lon: feature.center[0],
            name: feature.text
          };
        }
      } else {
        // Fallback to Nominatim (OpenStreetMap)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`
        );
        const data = await response.json();

        if (data && data.length > 0) {
          const item = data[0];
          result = {
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            name: item.display_name.split(',')[0]
          };
        }
      }

      if (result) {
        const newWaypoint: Waypoint = {
          lat: result.lat,
          lon: result.lon,
          name: result.name
        };
        setWaypoints(prev => [...prev, newWaypoint]);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleRemoveWaypoint = useCallback((index: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearWaypoints = useCallback(() => {
    setWaypoints([]);
  }, []);

  const handleAutoAltitude = useCallback(() => {
    if (waypoints.length > 0) {
      const autoAlt = calculateAutoAltitudeForPath(waypoints);
      if (autoAlt) {
        setFlightAltitude(autoAlt);
        setAutoAltitudeMode(true);
        const wp = waypoints[0];
        const result = calculateAutoAltitude(wp.lon, wp.lat);
        if (result) setSceneType(result.sceneType);
      }
    } else {
      const pos = getCurrentCameraPosition();
      const result = calculateAutoAltitude(pos.longitude, pos.latitude);
      if (result) {
        setFlightAltitude(result.altitude);
        setAutoAltitudeMode(true);
        setSceneType(result.sceneType);
      }
    }
  }, [waypoints, calculateAutoAltitude, calculateAutoAltitudeForPath, getCurrentCameraPosition]);

  const handleStartFlight = async () => {
    if (waypoints.length === 0) return;

    hideFlightGuide();
    stopOrbit();
    stopLock();

    const currentPos = getCurrentCameraPosition();
    const startPoint = { lat: currentPos.latitude, lon: currentPos.longitude, name: 'Start' };

    if (autoRecord) {
      startRecording();
      setIsRecording(true);
    }

    try {
      if (flightMode === 'linear') {
        const entryPoint = waypoints[0];
        teleportTo(entryPoint.lon, entryPoint.lat, flightAltitude);
        await new Promise(resolve => setTimeout(resolve, 500));
        await flyPath(waypoints.map(wp => ({ lat: wp.lat, lon: wp.lon })), { speed: flightSpeed, altitude: flightAltitude });
      } else if (flightMode === 'orbit') {
        const target = waypoints[waypoints.length - 1];
        startOrbit(target.lat, target.lon, flightAltitude, orbitRadius, 0.2, () => {
          if (autoRecord) {
            const filename = `arrival-${target.name.replace(/\s+/g, '-')}-${flightAltitude}m-orbit.mp4`;
             stopRec(filename);
             setIsRecording(false);
           }
        });
      } else if (flightMode === 'lock') {
        const target = waypoints[waypoints.length - 1];
        const lockPath = [startPoint, ...waypoints];
        flyPathWithTargetLock(lockPath.map(p => ({ lat: p.lat, lon: p.lon })), { lat: target.lat, lon: target.lon }, { speed: flightSpeed });
      }
    } catch (e) {
      console.error("Flight failed", e);
    }

    if (flightMode === 'linear' && autoRecord) {
      const target = waypoints[waypoints.length - 1];
      const filename = `arrival-${target.name.replace(/\s+/g, '-')}-${flightAltitude}m-${flightSpeed}ms.mp4`;
      stopRec(filename);
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    stopRec();
    setIsRecording(false);
  };

  const isStartDisabled = useMemo(() => {
    if (flightMode === 'linear' && waypoints.length < 1) return true;
    if (flightMode === 'orbit' && waypoints.length < 1) return true;
    if (flightMode === 'lock' && waypoints.length < 1) return true; 
    return false;
  }, [flightMode, waypoints]);

  return (
    <div className="fixed top-8 left-8 z-50 w-80 pointer-events-auto flex flex-col gap-2 max-h-[85vh]">
      <Panel title="🎬 Director Mode" className="p-0 overflow-hidden flex flex-col">
        {/* Sticky Header with Telemetry */}
        <div className="p-3 bg-black/40 border-b border-white/10 backdrop-blur-xl">
          <TelemetryHUD cameraPosition={cameraPosition} />

          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-full mt-2 flex items-center justify-center gap-1 text-[10px] text-white/40 hover:text-white/70 uppercase tracking-widest transition-colors py-1"
          >
            {isSettingsOpen ? 'Collapse Settings' : 'Expand Settings'}
            <span className={cn("transition-transform duration-300", isSettingsOpen ? "rotate-180" : "")}>▼</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className={cn(
          "overflow-y-auto transition-all duration-300 ease-in-out custom-scrollbar",
          isSettingsOpen ? "max-h-[60vh] opacity-100 p-3 space-y-4" : "max-h-0 opacity-0 p-0 overflow-hidden"
        )}>

          <FlightSettings
            isPortrait={isPortrait}
            onTogglePortrait={handleTogglePortrait}
            autoRecord={autoRecord}
            onToggleAutoRecord={handleToggleAutoRecord}
            vehicleVisibility={vehicleVisibility}
            onToggleVehicleVisibility={handleToggleVehicleVisibility}
          />

          <WaypointSearch
            onSearch={handleSearch}
            isSearching={isSearching}
          />

          <FlightControls
            flightMode={flightMode}
            onModeChange={setFlightMode}
            flightAltitude={flightAltitude}
            onAltitudeChange={(val) => { setFlightAltitude(val); setAutoAltitudeMode(false); setSceneType(null); }}
            flightSpeed={flightSpeed}
            onSpeedChange={setFlightSpeed}
            orbitRadius={orbitRadius}
            onOrbitRadiusChange={setOrbitRadius}
            autoAltitudeMode={autoAltitudeMode}
            sceneType={sceneType}
            onAutoAltitude={handleAutoAltitude}
          />

          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold text-white/40 uppercase tracking-wider flex justify-between items-center">
              <span>Waypoints ({waypoints.length})</span>
            </h3>
            <WaypointList
              waypoints={waypoints}
              onRemove={handleRemoveWaypoint}
              onClear={handleClearWaypoints}
            />
          </div>
        </div>

        {/* Footer Actions - Always Visible */}
        <div className="p-3 bg-black/40 border-t border-white/10 backdrop-blur-xl mt-auto">
          {isRecording ? (
            <button
              onClick={handleStopRecording}
              className="w-full py-3 rounded font-medium transition-colors flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-lg shadow-red-900/40"
            >
              <span className="w-2 h-2 bg-white rounded-full animate-ping" />
              Stop Recording
            </button>
          ) : (
            <button
                onClick={handleStartFlight}
                disabled={isStartDisabled}
                className={cn(
                  "w-full py-3 rounded font-medium transition-all flex items-center justify-center gap-2",
                  isStartDisabled
                    ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                    : "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-lg shadow-green-900/30 border border-green-400/20"
                )}
            >
                {`Start ${flightMode === 'linear' ? 'Linear Flight' : flightMode === 'orbit' ? 'Orbit' : 'Lock'}`}
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}
