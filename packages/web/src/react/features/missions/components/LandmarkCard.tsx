import { useEffect, useState } from 'react';
import { useGameBridge } from '../../../hooks/useGameBridge';

interface Card {
  key: number;
  title: string;
  subtitle?: string;
  fact: string;
}

const SHOW_MS = 8000;

/**
 * Location info: a card when you fly past a catalogued landmark, or clear a sightseeing
 * objective. One at a time; newer cards replace older ones.
 */
export function LandmarkCard() {
  const bridge = useGameBridge();
  const [card, setCard] = useState<Card | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let key = 0;
    const show = (next: Omit<Card, 'key'>) => {
      setCard({ ...next, key: ++key });
      clearTimeout(timer);
      timer = setTimeout(() => setCard(null), SHOW_MS);
    };
    const offNearby = bridge.on('landmarkNearby', (l) =>
      show({ title: l.name, subtitle: l.description, fact: l.fact })
    );
    const offMission = bridge.on('missionEvent', (event) => {
      if (event.type === 'objectiveCompleted' && event.fact) {
        show({ title: event.name, subtitle: 'Landmark reached', fact: event.fact });
      }
    });
    return () => {
      offNearby();
      offMission();
      clearTimeout(timer);
    };
  }, [bridge]);

  if (!card) return null;

  return (
    <div key={card.key} className="fixed bottom-44 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-slide-in">
      <div className="glass-panel px-5 py-3 max-w-md">
        <div className="flex items-baseline gap-2">
          <span className="text-base">📍</span>
          <span className="text-sm font-semibold text-white">{card.title}</span>
          {card.subtitle && <span className="text-[11px] text-white/50">{card.subtitle}</span>}
        </div>
        <p className="text-xs text-white/75 mt-1 leading-relaxed">{card.fact}</p>
      </div>
    </div>
  );
}
