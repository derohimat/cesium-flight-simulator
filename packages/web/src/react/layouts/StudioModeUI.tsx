import { useState, useEffect, useCallback } from 'react';
import * as Cesium from 'cesium';
import { DirectorPanel } from '../features/director/components/DirectorPanel';
import { LocationLibrary } from '../features/studio/components/LocationLibrary';
import { ExportPanel } from '../features/studio/components/ExportPanel';
import { MissionsPanel } from '../features/missions/components/MissionsPanel';
import { FlightTimeline, type Keyframe } from '../features/studio/components/FlightTimeline';
import { useGameMethod } from '../hooks/useGameMethod';
import { useOptionalGameBridge } from '../hooks/useGameBridge';
import type { Location } from '../features/studio/components/LocationLibrary';

/**
 * Interpolates camera position and orientation along keyframes at time t.
 * Uses shortest-angular-path for heading to prevent 360° spinning wraps.
 */
function interpolatePose(
  time: number,
  kfs: Keyframe[]
): { lat: number; lon: number; altitude: number; heading: number; pitch: number; roll: number } | null {
  if (!kfs || kfs.length === 0) return null;
  if (kfs.length === 1) {
    return {
      lat: kfs[0].lat,
      lon: kfs[0].lon,
      altitude: kfs[0].altitude,
      heading: kfs[0].heading,
      pitch: kfs[0].pitch ?? -15,
      roll: kfs[0].roll ?? 0,
    };
  }

  const t = Math.max(0, time);

  if (t <= kfs[0].time) {
    return {
      lat: kfs[0].lat,
      lon: kfs[0].lon,
      altitude: kfs[0].altitude,
      heading: kfs[0].heading,
      pitch: kfs[0].pitch ?? -15,
      roll: kfs[0].roll ?? 0,
    };
  }

  const last = kfs[kfs.length - 1];
  if (t >= last.time) {
    return {
      lat: last.lat,
      lon: last.lon,
      altitude: last.altitude,
      heading: last.heading,
      pitch: last.pitch ?? -15,
      roll: last.roll ?? 0,
    };
  }

  for (let i = 0; i < kfs.length - 1; i++) {
    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    if (t >= k0.time && t <= k1.time) {
      const dt = k1.time - k0.time;
      const frac = dt === 0 ? 0 : (t - k0.time) / dt;

      // Shortest angle heading interpolation
      let diff = (k1.heading - k0.heading) % 360;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      let heading = (k0.heading + diff * frac) % 360;
      if (heading < 0) heading += 360;

      const pitch = (k0.pitch ?? -15) + ((k1.pitch ?? -15) - (k0.pitch ?? -15)) * frac;
      const roll = (k0.roll ?? 0) + ((k1.roll ?? 0) - (k0.roll ?? 0)) * frac;

      return {
        lat: k0.lat + (k1.lat - k0.lat) * frac,
        lon: k0.lon + (k1.lon - k0.lon) * frac,
        altitude: k0.altitude + (k1.altitude - k0.altitude) * frac,
        heading,
        pitch,
        roll,
      };
    }
  }

  return kfs[0];
}

export interface StudioModeUIProps {
  isTimelineCollapsed?: boolean;
  onTimelineCollapseChange?: (collapsed: boolean) => void;
}

export function StudioModeUI({
  isTimelineCollapsed: controlledCollapsed,
  onTimelineCollapseChange,
}: StudioModeUIProps = {}) {
  const [activePanel, setActivePanel] = useState<'director' | 'missions' | 'locations' | 'export' | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Timeline State
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(20);
  const [isPlaying, setIsPlaying] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(true);

  const isTimelineCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const setTimelineCollapsed = useCallback((val: boolean) => {
    setInternalCollapsed(val);
    onTimelineCollapseChange?.(val);
  }, [onTimelineCollapseChange]);

  const togglePanel = (panel: 'director' | 'missions' | 'locations' | 'export') => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const optionalBridge = useOptionalGameBridge();
  const { 
    teleportTo, 
    startRecording, 
    stopRecording 
  } = useGameMethod();

  // Apply camera view directly to Cesium
  const applyPoseToCamera = useCallback((pose: { lat: number; lon: number; altitude: number; heading: number; pitch?: number; roll?: number }) => {
    if (!optionalBridge) return;
    const game = (optionalBridge as unknown as { game?: { getCameraManager?: () => { isSuspended: () => boolean; suspend: () => void }; getScene?: () => { camera: Cesium.Camera } } }).game;
    if (!game) return;

    const cameras = game.getCameraManager?.();
    if (cameras && !cameras.isSuspended()) {
      cameras.suspend();
    }

    const scene = game.getScene?.();
    const cesiumCamera = scene?.camera;
    if (cesiumCamera && Cesium.Cartesian3) {
      cesiumCamera.setView({
        destination: Cesium.Cartesian3.fromDegrees(pose.lon, pose.lat, pose.altitude),
        orientation: {
          heading: Cesium.Math.toRadians(pose.heading),
          pitch: Cesium.Math.toRadians(pose.pitch ?? -15),
          roll: Cesium.Math.toRadians(pose.roll ?? 0),
        },
      });
    }
  }, [optionalBridge]);

  // Preview playback animation loop
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setCurrentTime((prev) => {
        const nextTime = prev + dt;
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          const endPose = interpolatePose(totalDuration, keyframes);
          if (endPose) applyPoseToCamera(endPose);
          return totalDuration;
        }

        const pose = interpolatePose(nextTime, keyframes);
        if (pose) applyPoseToCamera(pose);
        return nextTime;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, totalDuration, keyframes, applyPoseToCamera]);

  // Handle location selection - teleport to location
  const handleSelectLocation = (location: Location) => {
    teleportTo(location.lon, location.lat, location.altitude);
  };

  // Handle adding waypoint from location
  const handleAddWaypoint = (_location: Location) => {
    console.log('Add waypoint:', _location);
  };

  // Export handlers
  const handleExport = (settings: Parameters<typeof console.log>[0]) => {
    console.log('Export with settings:', settings);
  };

  const handleTakeScreenshot = () => {
    console.log('Taking screenshot...');
  };

  const handleStartRecording = () => {
    startRecording();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    stopRecording();
    setIsRecording(false);
  };

  // Timeline handlers
  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, time));
    setCurrentTime(clamped);
    const pose = interpolatePose(clamped, keyframes);
    if (pose) {
      applyPoseToCamera(pose);
    }
  };

  const handlePreviewKeyframe = (keyframeId: string) => {
    const kf = keyframes.find((k) => k.id === keyframeId);
    if (kf) {
      setCurrentTime(kf.time);
      applyPoseToCamera(kf);
    }
  };

  const handlePlayPreview = () => {
    if (keyframes.length === 0) return;
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
    }
    setIsPlaying(true);
  };

  const handleStopPreview = () => {
    setIsPlaying(false);
    const game = (optionalBridge as unknown as { game?: { getCameraManager?: () => { isSuspended: () => boolean; resume: () => void } } })?.game;
    const cameras = game?.getCameraManager?.();
    if (cameras?.isSuspended()) {
      cameras.resume();
    }
  };

  const handleAddKeyframe = () => {
    let lat = 0, lon = 0, altitude = 100, heading = 0, pitch = -15, roll = 0;
    if (optionalBridge?.getCurrentCameraPosition) {
      try {
        const cam = optionalBridge.getCurrentCameraPosition();
        lat = cam.latitude;
        lon = cam.longitude;
        altitude = cam.altitude;
        heading = cam.heading;
        pitch = cam.pitch;
        roll = cam.roll;
      } catch (_err) {
        // Fallback below
      }
    } else {
      const currentPose = interpolatePose(currentTime, keyframes);
      if (currentPose) {
        lat = currentPose.lat;
        lon = currentPose.lon;
        altitude = currentPose.altitude;
        heading = currentPose.heading;
        pitch = currentPose.pitch;
        roll = currentPose.roll;
      }
    }

    const newKf: Keyframe = {
      id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: Math.round(currentTime * 100) / 100,
      lat,
      lon,
      altitude,
      heading,
      pitch,
      roll,
      label: `Keyframe ${keyframes.length + 1}`,
    };

    const updated = [...keyframes, newKf].sort((a, b) => a.time - b.time);
    setKeyframes(updated);
  };

  const handleDeleteKeyframe = (id: string) => {
    setKeyframes((prev) => prev.filter((k) => k.id !== id));
  };

  const handleKeyframesChange = (updatedKeyframes: Keyframe[]) => {
    const sorted = [...updatedKeyframes].sort((a, b) => a.time - b.time);
    setKeyframes(sorted);
    if (sorted.length > 0) {
      const maxTime = sorted[sorted.length - 1].time;
      if (maxTime > totalDuration) {
        setTotalDuration(Math.ceil(maxTime));
      }
    }
  };

  // Called when user clicks a preset (Orbit, Fly-by, Spiral) in LocationLibrary
  const handleApplyCinematographyPreset = (_presetName: string, generatedKeyframes: Keyframe[]) => {
    setKeyframes(generatedKeyframes);
    const duration = generatedKeyframes.length > 0 ? generatedKeyframes[generatedKeyframes.length - 1].time : 20;
    setTotalDuration(duration);
    setCurrentTime(0);
    setTimelineCollapsed(false);
    if (generatedKeyframes.length > 0) {
      applyPoseToCamera(generatedKeyframes[0]);
    }
  };

  return (
    <>
      {/* Top Bar - Studio Workflow Tabs */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-[calc(100vw-360px)]">
        <div className="glass-panel px-1.5 py-1 flex items-center gap-1 shadow-xl">
          <PanelTab 
            icon="🎬" 
            label="Director" 
            isActive={activePanel === 'director'} 
            onClick={() => togglePanel('director')} 
          />
          <PanelTab
            icon="🏁"
            label="Missions"
            isActive={activePanel === 'missions'}
            onClick={() => togglePanel('missions')}
          />
          <PanelTab 
            icon="📍" 
            label="Locations" 
            isActive={activePanel === 'locations'} 
            onClick={() => togglePanel('locations')} 
          />
          <PanelTab 
            icon="📤" 
            label="Export" 
            isActive={activePanel === 'export'} 
            onClick={() => togglePanel('export')} 
          />
        </div>
      </div>

      {/* Active Studio Panel - Left Side Drawer */}
      {activePanel && (
        <div className="fixed top-16 left-4 z-40 pointer-events-auto max-h-[calc(100vh-120px)] w-80 sm:w-88 max-w-[calc(100vw-2rem)] overflow-y-auto animate-fade-in shadow-2xl">
          {activePanel === 'director' && <DirectorPanel onClose={() => setActivePanel(null)} />}
          {activePanel === 'missions' && <MissionsPanel onClose={() => setActivePanel(null)} />}
          {activePanel === 'locations' && (
            <LocationLibrary 
              onClose={() => setActivePanel(null)}
              onSelectLocation={handleSelectLocation}
              onAddWaypoint={handleAddWaypoint}
              onApplyCinematographyPreset={handleApplyCinematographyPreset}
            />
          )}
          {activePanel === 'export' && (
            <ExportPanel 
              onClose={() => setActivePanel(null)}
              onExport={handleExport}
              onTakeScreenshot={handleTakeScreenshot}
              isRecording={isRecording}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
            />
          )}
        </div>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="fixed top-16 right-4 z-[60] pointer-events-none">
          <div className="flex items-center gap-2 bg-red-600/90 px-4 py-2 rounded-full animate-pulse shadow-lg shadow-red-900/40">
            <span className="w-3 h-3 bg-white rounded-full" />
            <span className="text-sm font-medium text-white">Recording</span>
          </div>
        </div>
      )}

      {/* Bottom Dock - Flight Timeline */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-3xl pointer-events-auto transition-all duration-300">
        <FlightTimeline
          keyframes={keyframes}
          onKeyframesChange={handleKeyframesChange}
          onAddKeyframe={handleAddKeyframe}
          onDeleteKeyframe={handleDeleteKeyframe}
          onPreview={handlePreviewKeyframe}
          onPlayPreview={handlePlayPreview}
          onStopPreview={handleStopPreview}
          isPlaying={isPlaying}
          currentTime={currentTime}
          totalDuration={totalDuration}
          onSeek={handleSeek}
          isCollapsed={isTimelineCollapsed}
          onToggleCollapse={() => setTimelineCollapsed(!isTimelineCollapsed)}
        />
      </div>

      {/* Keyboard Shortcuts Hint - Bottom Left */}
      <div className="fixed bottom-4 left-4 z-20 pointer-events-none hidden xl:block">
        <div className="glass-panel px-4 py-2 text-xs text-white/50 space-y-1">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 bg-white/10 rounded">C</kbd> Camera</span>
            <span><kbd className="px-1 bg-white/10 rounded">M</kbd> Mode</span>
            <span><kbd className="px-1 bg-white/10 rounded">R</kbd> Restart</span>
          </div>
        </div>
      </div>
    </>
  );
}

// Panel Tab Component
interface PanelTabProps {
  icon: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function PanelTab({ icon, label, isActive, onClick }: PanelTabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg transition-all ${
        isActive 
          ? 'bg-future-primary text-white shadow-md shadow-future-primary/30 font-medium' 
          : 'text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className="text-base sm:text-lg">{icon}</span>
      <span className="hidden sm:inline text-xs sm:text-sm font-medium">{label}</span>
    </button>
  );
}
