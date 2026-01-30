import { IntroScreen } from './shared/components/IntroScreen';
import { DebugPanel } from './features/debug/components/DebugPanel';
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

export function App() {
  const { mode } = useGameMode();
  const isMobile = isMobileDevice();
  const { setThrottle } = useGameMethod();

  const handleThrottleChange = (percent: number) => {
    setThrottle(percent / 100);
  };

  return (
    <>
      {/* Global UI - always visible */}
      <IntroScreen />
      <DebugPanel />
      
      {/* Mode toggle button */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-auto">
        <ModeToggle />
      </div>
      
      {/* Mode-specific UI */}
      {mode === 'play' && !isMobile && <StudioModeUI />}
      {mode === 'builder' && <BuilderModeUI />}

      {/* Always visible HUD */}
      <HUD />

      {/* Mobile controls */}
      {isMobile && <ThrottleSlider onChange={handleThrottleChange} />}

      {/* Overlays */}
      <CrashScreen />
      <RecordingStatus />
    </>
  );
}
