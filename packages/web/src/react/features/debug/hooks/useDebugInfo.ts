import { useState, useEffect } from 'react';
import { useGameEvent } from '../../../hooks/useGameEvent';
import { useGameMethod } from '../../../hooks/useGameMethod';

export function useDebugInfo() {
  const { getCollisionDetection, getRoverMode } = useGameMethod();
  const [collisionEnabled, setCollisionEnabled] = useState(getCollisionDetection());
  const [heightLockEnabled, setHeightLockEnabled] = useState(getRoverMode());

  const collisionData = useGameEvent('collisionDetectionChanged');
  const roverModeData = useGameEvent('roverModeChanged');
  // Measured by the engine's PerformanceGovernor rather than a separate rAF loop here.
  const stats = useGameEvent('performanceStats');

  useEffect(() => {
    if (collisionData !== null) {
      setCollisionEnabled(collisionData.enabled);
    }
  }, [collisionData]);

  useEffect(() => {
    if (roverModeData !== null) {
      setHeightLockEnabled(roverModeData.enabled);
    }
  }, [roverModeData]);

  return { collisionEnabled, heightLockEnabled, fps: stats ? Math.round(stats.fps) : 0 };
}
