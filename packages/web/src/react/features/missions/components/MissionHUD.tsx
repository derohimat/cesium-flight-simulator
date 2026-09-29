import { useEffect, useState } from 'react';
import { useGameBridge } from '../../../hooks/useGameBridge';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { useMission, formatTime, formatDistance } from '../hooks/useMission';

/** Objective guidance while a mission runs: direction arrow, distance, altitude cue, timer. */
export function MissionHUD() {
  const mission = useMission();
  const bridge = useGameBridge();
  const { abortMission } = useGameMethod();
  const [split, setSplit] = useState<string | null>(null);

  const running = mission.status === 'preparing' || mission.status === 'countdown' || mission.status === 'active';

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') abortMission();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, abortMission]);

  // Flash the split time as each objective is cleared.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = bridge.on('missionEvent', (event) => {
      if (event.type !== 'objectiveCompleted' || event.remaining === 0) return;
      setSplit(`${event.name} · ${formatTime(event.split)}`);
      clearTimeout(timer);
      timer = setTimeout(() => setSplit(null), 2500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [bridge]);

  if (!running) return null;

  if (mission.status === 'preparing') {
    return (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="glass-panel px-5 py-2.5 text-sm text-white/80 animate-pulse-subtle">
          Loading scenery for <span className="font-semibold text-white">{mission.title}</span>…
        </div>
      </div>
    );
  }

  if (mission.status === 'countdown') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-white/70 text-sm uppercase tracking-[0.3em] mb-2">{mission.title}</div>
        <div className="text-8xl font-bold text-white tabular-nums drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
          {Math.max(1, Math.ceil(mission.countdown))}
        </div>
      </div>
    );
  }

  const remaining = mission.timeLimit !== null ? mission.timeLimit - mission.elapsed : null;
  const urgent = remaining !== null && remaining < 15;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center gap-2">
      <div className="glass-panel px-5 py-3 flex items-center gap-5 min-w-[340px]">
        <svg
          viewBox="0 0 48 48"
          className="w-12 h-12 shrink-0 text-future-accent drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]"
          style={{ transform: `rotate(${mission.relativeBearing}deg)`, transition: 'transform 120ms linear' }}
          aria-label={`Target ${Math.round(mission.relativeBearing)} degrees ${mission.relativeBearing >= 0 ? 'right' : 'left'}`}
        >
          <path d="M24 4 L38 40 L24 32 L10 40 Z" fill="currentColor" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-white/50 uppercase tracking-wider">
            {mission.objectiveIndex + 1} / {mission.objectiveCount}
          </div>
          <div className="text-sm font-semibold text-white truncate">{mission.objectiveName}</div>
          <div className="text-xs text-white/60 tabular-nums">
            {formatDistance(mission.distance)}
            {mission.verticalCue === 'climb' && <span className="ml-2 text-yellow-300">↑ Climb</span>}
            {mission.verticalCue === 'descend' && <span className="ml-2 text-yellow-300">↓ Descend</span>}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-light text-white tabular-nums">{formatTime(mission.elapsed)}</div>
          {remaining !== null && (
            <div className={`text-[10px] tabular-nums ${urgent ? 'text-red-400' : 'text-white/50'}`}>
              {formatTime(Math.max(0, remaining))} left
            </div>
          )}
        </div>
      </div>

      {split && (
        <div className="glass-panel px-3 py-1 text-xs text-green-300 tabular-nums animate-fade-in">✓ {split}</div>
      )}
      <div className="text-[10px] text-white/40">Esc to abort</div>
    </div>
  );
}
