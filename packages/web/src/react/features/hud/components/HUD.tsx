import { Panel } from '../../../shared/components/Panel';
import { Speedometer } from './Speedometer';
import { MiniMap } from './MiniMap';
import { AddressChip } from './AddressChip';

export interface HUDProps {
  hasTimeline?: boolean;
  timelineExpanded?: boolean;
}

export function HUD({ hasTimeline = true, timelineExpanded = false }: HUDProps = {}) {
  // Determine vertical clearance:
  // - No timeline present (e.g. builder mode or mobile): resting bottom-8 (32px)
  // - Collapsed timeline dock (~56px top edge): clearance bottom-20 (80px)
  // - Expanded timeline panel (~406px top edge): clearance bottom-[27rem] (432px)
  const bottomPosition = !hasTimeline
    ? 'bottom-8'
    : timelineExpanded
    ? 'bottom-[27rem]'
    : 'bottom-20';

  return (
    <>
      {/* Speedometer Center - positioned above timeline with smooth transition */}
      <div 
        className={`fixed left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 transition-all duration-300 pointer-events-none ${bottomPosition}`}
      >
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <AddressChip />
          <Panel variant="minimal">
            <Speedometer />
          </Panel>
        </div>
      </div>

      {/* Mini-Map Bottom Right - clean corner clearance */}
      <div className="fixed bottom-6 right-6 z-40 pointer-events-auto">
        <MiniMap />
      </div>
    </>
  );
}


