import { HUD } from '../features/hud/components/HUD';
import { ControlsPanel } from '../features/controls/components/ControlsPanel';
import { CameraControls } from '../features/camera/components/CameraControls';
import { CrashScreen } from '../features/crash/components/CrashScreen';
import { DirectorPanel } from '../features/director/components/DirectorPanel';

export function PlayModeUI() {
  return (
    <>
      <ControlsPanel />
      <div className="fixed top-8 right-8 z-50 flex gap-2 pointer-events-auto">
        <CameraControls />
      </div>
      <HUD />
      <DirectorPanel />
      <CrashScreen />
    </>
  );
}
