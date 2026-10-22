import { useState, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { ControlButton } from './ControlButton';
import { VEHICLE_CONTROLS, CAMERA_CONTROLS, MODE_CONTROLS, BUILDER_CONTROLS } from '../constants';
import { useGameMode } from '../../../hooks/useGameMode';

interface ControlsPanelProps {
  triggerClassName?: string;
}

export function ControlsPanel({ triggerClassName }: ControlsPanelProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const { mode } = useGameMode();

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in form fields
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
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
        title="Controls & Shortcuts (?)"
      >
        <span className="text-base group-hover:scale-110 transition-transform">❓</span>
        <span className="hidden sm:inline">Controls</span>
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in pointer-events-auto"
          onClick={() => setIsOpen(false)}
        >
          <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <Panel 
              title={mode === 'builder' ? 'Builder Controls' : 'Flight Controls & Shortcuts'} 
              onClose={() => setIsOpen(false)}
              className="max-h-[80vh] overflow-y-auto shadow-2xl border-white/20"
            >
            <div className="space-y-4">
              {mode === 'builder' ? (
                <>
                  <div className="space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Builder Camera
                    </div>
                    {BUILDER_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Modes
                    </div>
                    {MODE_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Vehicle
                    </div>
                    {VEHICLE_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Camera
                    </div>
                    {CAMERA_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Modes
                    </div>
                    {MODE_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-white/5 pt-3">
                <div className="text-[10px] text-white/30">
                  Press <kbd className="px-1 py-0.5 bg-white/5 rounded text-white/50">?</kbd> to close
                </div>
              </div>
            </div>
          </Panel>
          </div>
        </div>
      )}
    </>
  );
}


