import { useEffect, useRef, useState } from 'react';
import { useGameEvent } from '../../../hooks/useGameEvent';
import { useGameMethod } from '../../../hooks/useGameMethod';

const GRAPH_WIDTH = 220;
const GRAPH_HEIGHT = 56;
const GRAPH_FRAMES = 110;
/** Top of the graph: 50 ms ≈ 20 fps. */
const GRAPH_MAX_MS = 50;

const COLOR_OK = '#4ade80';
const COLOR_WARN = '#facc15';
const COLOR_BAD = '#f87171';
const COLOR_CPU = 'rgba(96, 165, 250, 0.9)';

function fpsColorClass(fps: number, targetHz: number): string {
  if (fps >= targetHz * 0.95) return 'text-green-400';
  if (fps >= targetHz * 0.75) return 'text-yellow-400';
  return 'text-red-400';
}

/**
 * Frame-time HUD. The collapsed chip updates from the 4 Hz stats event; the expanded graph
 * reads the governor's ring buffers straight from the engine each animation frame and draws
 * imperatively, so it adds no React work per frame.
 */
export function PerfOverlay() {
  const stats = useGameEvent('performanceStats');
  const { getFrameHistory } = useGameMethod();
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetMsRef = useRef(1000 / 60);

  if (stats) targetMsRef.current = 1000 / stats.targetHz;

  useEffect(() => {
    if (!expanded) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GRAPH_WIDTH * dpr;
    canvas.height = GRAPH_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    const barWidth = GRAPH_WIDTH / GRAPH_FRAMES;
    const yFor = (ms: number) => GRAPH_HEIGHT - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * GRAPH_HEIGHT;

    let raf = 0;
    const draw = () => {
      const { intervals, cpu, cursor } = getFrameHistory();
      const size = intervals.length;
      const budget = targetMsRef.current;

      ctx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
      for (let i = 0; i < GRAPH_FRAMES; i++) {
        const idx = (cursor - GRAPH_FRAMES + i + size) % size;
        const interval = intervals[idx];
        if (!interval) continue;
        const x = i * barWidth;
        ctx.fillStyle = interval <= budget * 1.15 ? COLOR_OK : interval <= budget * 1.5 ? COLOR_WARN : COLOR_BAD;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, yFor(interval), Math.max(barWidth - 0.5, 1), GRAPH_HEIGHT - yFor(interval));
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLOR_CPU;
        ctx.fillRect(x, yFor(cpu[idx]), Math.max(barWidth - 0.5, 1), GRAPH_HEIGHT - yFor(cpu[idx]));
      }

      // Frame budget line.
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, yFor(budget) + 0.5);
      ctx.lineTo(GRAPH_WIDTH, yFor(budget) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [expanded, getFrameHistory]);

  const fps = stats ? Math.round(stats.fps) : 0;
  const targetHz = stats?.targetHz ?? 60;

  return (
    <button
      type="button"
      onClick={() => setExpanded(e => !e)}
      className="fixed top-8 left-20 z-50 glass-panel px-3 py-2 text-left font-mono
                 hover:bg-white/10 transition-colors duration-200
                 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
      title="Performance (click to expand)"
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-semibold tabular-nums ${fpsColorClass(fps, targetHz)}`}>{fps}</span>
        <span className="text-[10px] text-white/50 uppercase tracking-wider">fps</span>
        {stats && (
          <span className="text-[10px] text-white/50 tabular-nums">
            {stats.frameMs.toFixed(1)}ms · 1% {Math.round(stats.onePercentLowFps)}
          </span>
        )}
      </div>

      {expanded && stats && (
        <div className="mt-2 space-y-1.5">
          <canvas
            ref={canvasRef}
            style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
            className="block rounded bg-black/30"
          />
          <div className="flex gap-3 text-[9px] text-white/40">
            <span><span style={{ color: COLOR_OK }}>■</span> frame</span>
            <span><span style={{ color: COLOR_CPU }}>■</span> cpu</span>
            <span>┄ budget</span>
          </div>
          <StatRow
            label="Display"
            value={`${stats.refreshHz} Hz${stats.paced ? ` → locked ${Math.round(stats.targetHz)}` : ''}`}
          />
          <StatRow
            label="Quality"
            value={
              stats.adaptive
                ? `auto · level ${stats.tierCount - stats.tier}/${stats.tierCount}`
                : 'manual'
            }
          />
          <StatRow
            label="Render"
            value={`MSAA ${stats.msaaSamples}× · ${Math.round(stats.resolutionScale * 100)}% · SSE ×${stats.sseMultiplier}`}
          />
          <StatRow label="CPU" value={`${stats.cpuMs.toFixed(1)} ms/frame`} />
          <StatRow
            label="Physics"
            value={`${stats.physicsStepsLastFrame} step · ${stats.groundQueriesPerSecond} ray/s`}
          />
        </div>
      )}
    </button>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-[10px]">
      <span className="text-white/50">{label}</span>
      <span className="text-white/85 tabular-nums">{value}</span>
    </div>
  );
}
