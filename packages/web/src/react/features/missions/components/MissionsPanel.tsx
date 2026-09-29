import { useMemo, useState } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { Button } from '../../../shared/components/Button';
import { useGameMethod } from '../../../hooks/useGameMethod';
import { useMission, loadRecords, formatTime } from '../hooks/useMission';
import type { MissionDefinition, MissionKind } from '../../../../cesium/missions/types';

const KIND_LABEL: Record<MissionKind, { icon: string; label: string }> = {
  sightseeing: { icon: '🗺️', label: 'Sightseeing' },
  timeTrial: { icon: '⏱️', label: 'Time Trials' },
  landing: { icon: '🛬', label: 'Landings' },
};

export function Stars({ count, size = 'text-sm' }: { count: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? 'text-yellow-400' : 'text-white/15'}>★</span>
      ))}
    </span>
  );
}

export function MissionsPanel() {
  const { getMissions, startMission } = useGameMethod();
  const mission = useMission();
  const missions = useMemo(() => getMissions(), [getMissions]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Re-read after each finish so stars/bests update.
  const records = useMemo(() => loadRecords(), [mission.status]);

  const selected = missions.find((m) => m.id === selectedId) ?? null;
  const busy = mission.status === 'preparing' || mission.status === 'countdown' || mission.status === 'active';

  if (selected) {
    return (
      <MissionBriefing
        mission={selected}
        busy={busy}
        bestTime={records[selected.id]?.bestTime}
        onBack={() => setSelectedId(null)}
        onStart={() => {
          startMission(selected.id).catch((error) => console.error('Mission failed to start:', error));
        }}
      />
    );
  }

  return (
    <Panel title="Missions" className="w-[320px]">
      <div className="space-y-4">
        {(['sightseeing', 'timeTrial', 'landing'] as MissionKind[]).map((kind) => (
          <div key={kind} className="space-y-2">
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
              {KIND_LABEL[kind].icon} {KIND_LABEL[kind].label}
            </div>
            {missions.filter((m) => m.kind === kind).map((m) => {
              const record = records[m.id];
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10
                             transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{m.title}</span>
                    <Stars count={record?.stars ?? 0} />
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">{m.summary}</div>
                  <div className="flex justify-between text-[10px] text-white/40 mt-1.5">
                    <span>{m.region} · {objectiveSummary(m)}</span>
                    {record && <span className="font-mono">Best {formatTime(record.bestTime)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function objectiveSummary(m: MissionDefinition): string {
  const type = m.objectives[0]?.type;
  if (type === 'land') return m.objectives[0].type === 'land' && m.objectives[0].surface === 'water' ? 'water landing' : 'runway landing';
  return `${m.objectives.length} ${type === 'ring' ? 'gates' : 'stops'}`;
}

interface BriefingProps {
  mission: MissionDefinition;
  busy: boolean;
  bestTime?: number;
  onBack: () => void;
  onStart: () => void;
}

function MissionBriefing({ mission, busy, bestTime, onBack, onStart }: BriefingProps) {
  return (
    <Panel title={mission.title} className="w-[320px]">
      <div className="space-y-4">
        <div className="text-[11px] text-white/50">
          {KIND_LABEL[mission.kind].icon} {KIND_LABEL[mission.kind].label} · {mission.region}
        </div>
        <p className="text-sm text-white/80 leading-relaxed">{mission.briefing}</p>

        {mission.scoring === 'landing' ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['3 stars', 'Butter', '< 1.5 m/s, centred'],
              ['2 stars', 'Smooth', '< 3 m/s'],
              ['1 star', 'Firm', '≤ 6 m/s'],
            ].map(([stars, grade, detail]) => (
              <div key={grade} className="bg-white/5 rounded-lg p-2">
                <div className="text-[10px] text-white/40 uppercase">{stars}</div>
                <div className="text-sm text-white">{grade}</div>
                <div className="text-[10px] text-white/50">{detail}</div>
              </div>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-[10px] text-white/40 uppercase">3 stars</div>
            <div className="text-sm font-mono text-white">{formatTime(mission.par.gold)}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-[10px] text-white/40 uppercase">2 stars</div>
            <div className="text-sm font-mono text-white">{formatTime(mission.par.silver)}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-[10px] text-white/40 uppercase">{mission.timeLimit ? 'Limit' : 'Best'}</div>
            <div className="text-sm font-mono text-white">
              {mission.timeLimit ? formatTime(mission.timeLimit) : bestTime ? formatTime(bestTime) : '—'}
            </div>
          </div>
        </div>
        )}

        <div className="text-[10px] text-white/40 leading-relaxed">
          <kbd className="px-1 bg-white/10 rounded">W</kbd>/<kbd className="px-1 bg-white/10 rounded">S</kbd> speed ·{' '}
          <kbd className="px-1 bg-white/10 rounded">A</kbd>/<kbd className="px-1 bg-white/10 rounded">D</kbd> turn ·{' '}
          <kbd className="px-1 bg-white/10 rounded">↑</kbd>/<kbd className="px-1 bg-white/10 rounded">↓</kbd> climb ·{' '}
          <kbd className="px-1 bg-white/10 rounded">Esc</kbd> abort
        </div>

        <div className="flex gap-2">
          <Button onClick={onBack} variant="secondary" size="sm" className="flex-1">Back</Button>
          <Button onClick={onStart} variant="primary" size="sm" className="flex-1" disabled={busy}>
            {busy ? 'In progress…' : 'Start mission'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
