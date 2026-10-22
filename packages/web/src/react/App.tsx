import { useState } from 'react';
import { IntroScreen } from './shared/components/IntroScreen';
import { DebugPanel } from './features/debug/components/DebugPanel';
import { ControlsPanel } from './features/controls/components/ControlsPanel';
import { PerfOverlay } from './features/debug/components/PerfOverlay';
import { LocationSelector } from './features/location/components/LocationSelector';
import { CameraControls } from './features/camera/components/CameraControls';
import { StudioModeUI } from './layouts/StudioModeUI';
import { BuilderModeUI } from './layouts/BuilderModeUI';
import { ModeToggle } from './features/builder/components/ModeToggle';
import { useGameMode } from './hooks/useGameMode';
import { ThrottleSlider } from './features/controls/components/mobile/ThrottleSlider';
import { isMobileDevice } from './shared/utils/mobileDetect';
import { useGameMethod } from './hooks/useGameMethod';
import { HUD } from './features/hud/components/HUD';
import { CrashScreen } from './features/crash/components/CrashScreen';
import { RecordingStatus } from './features/hud/components/RecordingStatus';
import { MissionHUD } from './features/missions/components/MissionHUD';
import { MissionResult } from './features/missions/components/MissionResult';
import { LandmarkCard } from './features/missions/components/LandmarkCard';
import { FlightAssistOverlay } from './features/hud/components/FlightAssistOverlay';

export function App() {
  const { mode } = useGameMode();
  const isMobile = isMobileDevice();
  const { setThrottle } = useGameMethod();
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(true);

  const handleThrottleChange = (percent: number) => {
    setThrottle(percent / 100);
  };

  return (
    <>
      {/* Global UI - Intro modal */}
      <IntroScreen />

      {/* Top Bar - Left Group (System Settings, Controls Help, Frame-rate Monitor) */}
      <div className="fixed top-3 sm:top-4 left-3 sm:left-4 z-50 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        <DebugPanel />
        <ControlsPanel />
        <PerfOverlay />
      </div>

      {/* Top Bar - Right Group (Location Teleport, Camera Viewport, Mode Switch) */}
      <div className="fixed top-3 sm:top-4 right-3 sm:right-4 z-50 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        <LocationSelector />
        <CameraControls />
        <ModeToggle />
      </div>
      
      {/* Mode-specific UI */}
      {mode === 'play' && !isMobile && (
        <StudioModeUI 
          isTimelineCollapsed={isTimelineCollapsed}
          onTimelineCollapseChange={setIsTimelineCollapsed}
        />
      )}
      {mode === 'builder' && <BuilderModeUI />}

      {/* Dynamic HUD - Speedometer & MiniMap (adapts vertical offset to Timeline dock state) */}
      <HUD 
        hasTimeline={mode === 'play' && !isMobile}
        timelineExpanded={mode === 'play' && !isMobile && !isTimelineCollapsed} 
      />

      {/* Mobile controls */}
      {isMobile && <ThrottleSlider onChange={handleThrottleChange} />}

      {/* Missions & location info */}
      <MissionHUD />
      <LandmarkCard />
      <FlightAssistOverlay />

      {/* Overlays */}
      <CrashScreen />
      <MissionResult />
      <RecordingStatus />
    </>
  );
}
