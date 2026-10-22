import { useState, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { Button } from '../../../shared/components/Button';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { useDebugInfo } from '../hooks/useDebugInfo';
import { useQualitySettings } from '../hooks/useQualitySettings';
import { QualityPresets } from './QualityPresets';
import { QualityControls } from './QualityControls';

interface DebugPanelProps {
  triggerClassName?: string;
}

export function DebugPanel({ triggerClassName }: DebugPanelProps = {}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in form fields
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={triggerClassName || "glass-panel px-3 py-2 hover:bg-white/10 transition-all duration-300 text-white/70 hover:text-white text-xs font-medium flex items-center gap-1.5 group"}
        title="Settings & Debug (`)"
      >
        <span className="text-base group-hover:scale-110 transition-transform">⚙️</span>
        <span className="hidden sm:inline">Settings</span>
      </button>

      {isOpen && <DebugPanelContent onClose={() => setIsOpen(false)} />}
    </>
  );
}

/** Mounted only while open, so its subscriptions and polling cost nothing when closed. */
function DebugPanelContent({ onClose }: { onClose: () => void }) {
  const { toggleCollisionDetection, toggleRoverMode, toggleVehicleType, switchCamera, getCollisionAssist, setCollisionAssist } = useGameMethod();
  const { collisionEnabled, heightLockEnabled, fps } = useDebugInfo();
  const [collisionAssist, setCollisionAssistState] = useState(getCollisionAssist);
  const { config, adaptive, setAdaptive, updateSetting, applyPreset } = useQualitySettings();

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-start justify-start p-4 pt-16 bg-black/40 backdrop-blur-xs animate-fade-in pointer-events-auto"
      onClick={onClose}
    >
      <div 
        className="w-80 max-h-[calc(100vh-100px)] overflow-y-auto animate-slide-in shadow-2xl" 
        onClick={(e) => e.stopPropagation()}
      >
        <Panel title="Settings & Quality" onClose={onClose} className="min-w-[280px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/80 font-medium">FPS</span>
            <span className={`font-mono font-semibold text-lg ${
              fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {fps}
            </span>
          </div>

          <div className="border-t border-white/5 pt-4">
            <QualityPresets onApplyPreset={applyPreset} />
          </div>

          <div className="border-t border-white/5 pt-4">
            <QualityControls
              config={config}
              adaptive={adaptive}
              onAdaptiveChange={setAdaptive}
              onUpdateSetting={updateSetting}
            />
          </div>

          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="text-[11px] text-white/70 uppercase tracking-wider mb-2 font-medium">Game Controls</div>
            <Button
              onClick={switchCamera}
              variant="secondary"
              size="sm"
              className="w-full"
            >
              📷 Switch Camera (C)
            </Button>

            <Button
              onClick={() => {
                setCollisionAssist(!collisionAssist);
                setCollisionAssistState(!collisionAssist);
              }}
              variant={collisionAssist ? 'primary' : 'secondary'}
              size="sm"
              className="w-full"
              title="Automatic ground-collision avoidance: pulls up when terrain is ahead"
            >
              🛟 Collision Assist {collisionAssist ? 'On' : 'Off'}
            </Button>

            <Button
              onClick={toggleCollisionDetection}
              variant={collisionEnabled ? 'primary' : 'secondary'}
              size="sm"
              className="w-full"
            >
              🛡️ Collision {collisionEnabled ? 'On' : 'Off'}
            </Button>

            <Button
              onClick={toggleRoverMode}
              variant={heightLockEnabled ? 'primary' : 'secondary'}
              size="sm"
              className="w-full"
            >
              🔒 Height Lock {heightLockEnabled ? 'On' : 'Off'}
            </Button>

            <Button
              onClick={toggleVehicleType}
              variant="secondary"
              size="sm"
              className="w-full"
            >
              🔄 Switch Vehicle (M)
            </Button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="text-[10px] text-white/50">
              Press <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/70">~</kbd> to close
            </div>
          </div>
        </div>
      </Panel>
      </div>
    </div>
  );
}


