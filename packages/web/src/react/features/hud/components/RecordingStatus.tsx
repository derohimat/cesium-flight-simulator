import { useEffect, useState } from 'react';
import { Panel } from '../../../shared/components/Panel';

export function RecordingStatus() {
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    const handleStart = () => setIsConverting(true);
    const handleEnd = () => setIsConverting(false);

    window.addEventListener('recording-conversion-start', handleStart);
    window.addEventListener('recording-conversion-end', handleEnd);

    return () => {
      window.removeEventListener('recording-conversion-start', handleStart);
      window.removeEventListener('recording-conversion-end', handleEnd);
    };
  }, []);

  if (!isConverting) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in pointer-events-auto">
      <Panel className="flex flex-col items-center gap-4 p-8 min-w-[300px] border-future-primary/40 shadow-2xl">
        <div className="animate-spin text-4xl">🔄</div>
        <div className="text-xl font-bold text-[#00f3ff]">Converting to MP4...</div>
        <div className="text-sm text-white/70">Please wait, this may take a moment.</div>
      </Panel>
    </div>
  );
}
