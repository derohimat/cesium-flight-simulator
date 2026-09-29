import { useEffect, useState } from 'react';
import { useGameBridge } from '../../../hooks/useGameBridge';
import { useGameEvent } from '../../../hooks/useGameEvent';

/**
 * Flight-safety notices: "Loading scenery" while a teleport holds for tiles, and a PULL UP
 * warning while auto-GCAS is flying the aircraft away from terrain.
 */
export function FlightAssistOverlay() {
  const bridge = useGameBridge();
  const [loading, setLoading] = useState(false);
  const vehicle = useGameEvent('vehicleStateChanged', { throttle: 100 });

  useEffect(() => bridge.on('sceneryLoading', ({ loading }) => setLoading(loading)), [bridge]);

  return (
    <>
      {loading && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="glass-panel px-5 py-2.5 text-sm text-white/80 animate-pulse-subtle">
            Loading scenery… holding position
          </div>
        </div>
      )}

      {vehicle?.landed && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="glass-panel px-5 py-2.5 text-sm text-white/80">
            🛬 On the ground — hold <kbd className="px-1 bg-white/10 rounded">W</kbd> to take off,{' '}
            <kbd className="px-1 bg-white/10 rounded">A</kbd>/<kbd className="px-1 bg-white/10 rounded">D</kbd> to steer
          </div>
        </div>
      )}

      {vehicle?.collisionAssistActive && (
        <div className="fixed top-[38%] left-1/2 -translate-x-1/2 z-50 pointer-events-none text-center" role="alert">
          <div className="px-6 py-2 rounded-lg border-2 border-red-500 bg-red-600/25 text-red-300
                          text-2xl font-bold tracking-[0.3em] animate-pulse">
            PULL UP
          </div>
          <div className="text-[11px] text-white/70 mt-1.5">Auto-GCAS climbing clear of terrain</div>
        </div>
      )}
    </>
  );
}
