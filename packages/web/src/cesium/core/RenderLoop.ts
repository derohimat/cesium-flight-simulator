import * as Cesium from 'cesium';

const KNOWN_REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 175, 240];
const VSYNC_SAMPLES = 120;

/**
 * Replacement for Cesium's default render loop with vsync-locked frame pacing.
 *
 * Cesium's `targetFrameRate` gate renders when `now - last > 1000 / fps`. Asking for exactly
 * half the refresh rate makes that interval equal to two vsyncs, so ordinary rAF timestamp
 * jitter randomly lands frames on 2 or 3 vsyncs — the uneven cadence pacing is meant to
 * remove. Counting vsyncs instead gives a perfectly even 1-in-N cadence.
 *
 * Because this loop sees every vsync (rendered or not), it also measures the display's
 * refresh rate for the performance governor.
 */
export class RenderLoop {
  private rafId = 0;
  private running = false;
  private lastVsync = 0;
  private lastRender = 0;
  private vsyncSamples = new Float32Array(VSYNC_SAMPLES);
  private vsyncCursor = 0;
  private vsyncCount = 0;
  private divisor = 1;

  public refreshHz = 60;

  constructor(private widget: Cesium.CesiumWidget) {
    this.tick = this.tick.bind(this);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Render on every `n`-th vsync (1 = every vsync). */
  public setDivisor(n: number): void {
    this.divisor = Math.max(1, Math.round(n));
  }

  public getDivisor(): number {
    return this.divisor;
  }

  private tick(now: number): void {
    if (!this.running || this.widget.isDestroyed()) return;

    if (this.lastVsync > 0) {
      const dt = now - this.lastVsync;
      if (dt > 2 && dt < 100) {
        this.vsyncSamples[this.vsyncCursor] = dt;
        this.vsyncCursor = (this.vsyncCursor + 1) % VSYNC_SAMPLES;
        this.vsyncCount = Math.min(this.vsyncCount + 1, VSYNC_SAMPLES);
        if (this.vsyncCursor === 0) this.refreshHz = this.estimateRefreshHz();
      }
    }
    this.lastVsync = now;

    const vsyncMs = 1000 / this.refreshHz;
    const elapsedVsyncs = Math.round((now - this.lastRender) / vsyncMs);
    if (this.divisor === 1 || elapsedVsyncs >= this.divisor) {
      this.lastRender = now;
      try {
        this.widget.resize();
        this.widget.render();
      } catch (error) {
        // Mirror Cesium's default loop: stop and surface the error instead of spamming it.
        this.running = false;
        // Typed as string, but Cesium's own loop passes the Error through and formats it.
        this.widget.showErrorPanel('An error occurred while rendering.  Rendering has stopped.', undefined, error as string);
        return;
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  }

  private estimateRefreshHz(): number {
    const sorted = Array.from(this.vsyncSamples.subarray(0, this.vsyncCount)).sort((a, b) => a - b);
    // Low percentile: vsyncs where the main thread was busy show up as long intervals.
    const hz = 1000 / sorted[Math.floor(sorted.length * 0.2)];
    let best = KNOWN_REFRESH_RATES[0];
    for (const rate of KNOWN_REFRESH_RATES) {
      if (Math.abs(rate - hz) < Math.abs(best - hz)) best = rate;
    }
    return best;
  }
}
