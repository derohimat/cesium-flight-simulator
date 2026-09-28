import { useState } from 'react';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { useCameraState } from '../hooks/useCameraState';

const CAMERA_MODES = [
  { id: 'follow', name: 'Follow', icon: '🎥', description: 'Chase camera' },
  { id: 'followClose', name: 'Close-Up', icon: '📹', description: 'Close chase' },
  { id: 'fpv', name: 'FPV Drone', icon: '🚁', description: 'First-person' },
  { id: 'cinematic', name: 'Cinematic', icon: '🎬', description: 'Pro shots' },
];

export function CameraControls() {
  const { switchCamera } = useGameMethod();
  const { cameraType } = useCameraState();
  const [isOpen, setIsOpen] = useState(false);

  const currentCamera = CAMERA_MODES.find(c => c.id === cameraType) || CAMERA_MODES[0];

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="glass-panel px-4 py-2.5 hover:bg-white/10 transition-all duration-300 group"
        title="Switch Camera (C)"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{currentCamera.icon}</span>
          <span className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">
            {currentCamera.name}
          </span>
          <span className={`text-xs text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </button>

      {/* Camera Mode Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 glass-panel p-2 space-y-1 animate-fade-in z-50">
          {CAMERA_MODES.map((camera) => (
            <button
              key={camera.id}
              onClick={() => {
                // Cycle through cameras until we reach the desired one
                let attempts = 0;
                const maxAttempts = CAMERA_MODES.length;
                const cycleTo = () => {
                  if (cameraType !== camera.id && attempts < maxAttempts) {
                    switchCamera();
                    attempts++;
                    setTimeout(cycleTo, 50);
                  }
                };
                cycleTo();
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${cameraType === camera.id
                  ? 'bg-future-primary/30 text-white'
                  : 'hover:bg-white/10 text-white/70'
                }`}
            >
              <span className="text-xl">{camera.icon}</span>
              <div className="text-left flex-1">
                <div className="text-sm font-medium">{camera.name}</div>
                <div className="text-xs text-white/50">{camera.description}</div>
              </div>
              {cameraType === camera.id && (
                <span className="text-future-primary text-sm">✓</span>
              )}
            </button>
          ))}

          {/* Quick switch hint */}
          <div className="pt-2 mt-2 border-t border-white/10">
            <p className="text-xs text-white/40 text-center">
              Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60 mx-1">C</kbd> to cycle
            </p>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
