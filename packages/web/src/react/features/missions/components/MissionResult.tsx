import { useEffect, useState } from 'react';
import { useGameBridge } from '../../../hooks/useGameBridge';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { Button } from '../../../shared/components/Button';
import { saveRecord, formatTime } from '../hooks/useMission';
import { Stars } from './MissionsPanel';
import type { MissionEvent } from '../../../../cesium/missions/types';

type Outcome = Extract<MissionEvent, { type: 'completed' } | { type: 'failed' }> & { newBest?: boolean };

const FAIL_TEXT = {
  crashed: 'You crashed. Retry the mission, or close to keep flying from where you went down.',
  timeout: 'Out of time. Hold W for more speed and cut the corners.',
};

/** Finish / failure screen with stars, personal best and retry. */
export function MissionResult() {
  const bridge = useGameBridge();
  const { startMission, dismissMission } = useGameMethod();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(
    () =>
      bridge.on('missionEvent', (event) => {
        if (event.type === 'completed') {
          setOutcome({ ...event, newBest: saveRecord(event.missionId, event.time, event.stars) });
        } else if (event.type === 'failed') {
          setOutcome(event);
        } else if (event.type === 'started' || event.type === 'aborted') {
          setOutcome(null);
        }
      }),
    [bridge]
  );

  if (!outcome) return null;

  const close = () => {
    setOutcome(null);
    dismissMission();
  };
  const retry = () => {
    setOutcome(null);
    startMission(outcome.missionId).catch((error) => console.error('Mission failed to start:', error));
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center animate-fade-in">
      <div className="glass-panel p-8 w-full max-w-sm mx-4 text-center space-y-5">
        <div className="text-[11px] text-white/50 uppercase tracking-[0.25em]">{outcome.title}</div>

        {outcome.type === 'completed' ? (
          <>
            <div className="text-3xl font-bold text-white">Mission complete</div>
            <Stars count={outcome.stars} size="text-4xl" />
            <div>
              <div className="text-4xl font-light text-white tabular-nums">{formatTime(outcome.time)}</div>
              {outcome.newBest && <div className="text-xs text-yellow-300 mt-1">New personal best</div>}
            </div>
            {outcome.splits.length > 1 && (
              <div className="text-[11px] text-white/50 tabular-nums space-x-3">
                {outcome.splits.map((s, i) => (
                  <span key={i}>{i + 1}: {formatTime(s)}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-3xl font-bold text-white">{outcome.reason === 'crashed' ? 'Crashed' : 'Time’s up'}</div>
            <p className="text-sm text-white/60">{FAIL_TEXT[outcome.reason]}</p>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={close} variant="secondary" className="flex-1">
            {outcome.type === 'failed' && outcome.reason === 'crashed' ? 'Keep flying' : 'Close'}
          </Button>
          <Button onClick={retry} variant="primary" className="flex-1">Retry</Button>
        </div>
      </div>
    </div>
  );
}
