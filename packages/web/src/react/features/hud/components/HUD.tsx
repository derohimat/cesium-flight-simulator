import { Panel } from '../../../shared/components/Panel';
import { Speedometer } from './Speedometer';
import { MiniMap } from './MiniMap';

export function HUD() {
  return (
    <>
      {/* Speedometer Center */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4">
        <Panel variant="minimal">
          <Speedometer />
        </Panel>
      </div>

      {/* Mini-Map Bottom Right */}
      <div className="fixed bottom-8 right-8 z-[60] pointer-events-auto">
        <MiniMap />
      </div>
    </>
  );
}


