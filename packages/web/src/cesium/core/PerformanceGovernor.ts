import type { FrameHook } from './GameLoop';
import type { Scene } from './Scene';

export interface QualityTier {
  msaaSamples: number;
  resolutionScale: number;
  sseMultiplier: number;
}

/**
 * Ordered cheapest-to-lose first. MSAA goes before resolution because FXAA already covers
 * most of what it buys on photogrammetry, while resolution loss is visible everywhere.
 */
export const QUALITY_LADDER: readonly QualityTier[] = [
  { msaaSamples: 4, resolutionScale: 1.0, sseMultiplier: 1.0 },
  { msaaSamples: 2, resolutionScale: 1.0, sseMultiplier: 1.0 },
  { msaaSamples: 1, resolutionScale: 1.0, sseMultiplier: 1.0 },
  { msaaSamples: 1, resolutionScale: 0.85, sseMultiplier: 1.25 },
  { msaaSamples: 1, resolutionScale: 0.75, sseMultiplier: 1.5 },
  { msaaSamples: 1, resolutionScale: 0.65, sseMultiplier: 2.0 },
];

/** From this tier on, HUD glass blur is swapped for flat translucency. */
const LITE_EFFECTS_TIER = 3;

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  onePercentLowFps: number;
  cpuMs: number;
  refreshHz: number;
  targetHz: number;
  paced: boolean;
  adaptive: boolean;
  tier: number;
  tierCount: number;
  msaaSamples: number;
  resolutionScale: number;
  sseMultiplier: number;
}

const HISTORY = 240;
const WINDOW_MS = 1000;
const WARMUP_MS = 3000;
/** Frames longer than this multiple of the target interval count as a visible hitch. */
const MISS_FACTOR = 1.5;
const DEGRADE_MISS_RATIO = 0.08;
const UPGRADE_MISS_RATIO = 0.01;
const DEGRADE_AFTER_BAD_WINDOWS = 2;
const UPGRADE_AFTER_GOOD_WINDOWS = 5;
/** An upgrade that is undone within this long counts as a failed probe. */
const PROBATION_MS = 5000;
const MIN_BACKOFF_MS = 15000;
const MAX_BACKOFF_MS = 60000;
/** Skip evaluation briefly after a change: MSAA/resolution switches realloc framebuffers. */
const SETTLE_MS = 750;
const MIN_TIME_PACED_BEFORE_UNPACE_MS = 20000;

/**
 * Closed-loop quality controller (dynamic resolution scaling + frame pacing).
 *
 * Each second it looks at how many frames missed their vsync budget:
 *  - sustained misses → first lock to half refresh on high-Hz displays (an even 60 on a
 *    120 Hz panel looks far smoother than a jittery 80–100), then step down QUALITY_LADDER;
 *  - sustained headroom → climb back up one step at a time.
 * Upgrades that immediately fail are blocked with exponential backoff so the controller
 * settles instead of oscillating between two tiers.
 */
export class PerformanceGovernor implements FrameHook {
  public readonly frameIntervals = new Float32Array(HISTORY);
  public readonly cpuTimes = new Float32Array(HISTORY);
  public frameCursor = 0;
  private frameCount = 0;

  private lastFrameStart = 0;
  private startedAt = 0;
  private windowStart = 0;
  private windowFrames = 0;
  private windowMisses = 0;
  private windowIntervalSum = 0;
  private badWindows = 0;
  private goodWindows = 0;
  private settleUntil = 0;

  private tier = 0;
  private paced = false;
  private pacedAt = 0;
  private lastUpgradeAt = -Infinity;
  private lastUpgradeKind: 'tier' | 'unpace' | null = null;
  private blockedUntil: number[] = QUALITY_LADDER.map(() => 0);
  private backoff: number[] = QUALITY_LADDER.map(() => MIN_BACKOFF_MS);
  private unpaceBlockedUntil = 0;
  private unpaceBackoff = MIN_BACKOFF_MS;

  private adaptive = true;
  private held = false;
  private refreshHz = 60;

  constructor(private scene: Scene) {}

  // --- Frame hooks ------------------------------------------------------------------------

  public onFrameStart(now: number): void {
    if (this.startedAt === 0) this.startedAt = now;
    if (this.lastFrameStart > 0) {
      const interval = now - this.lastFrameStart;
      // Ignore gaps from hidden tabs / debugger pauses; they're not rendering performance.
      if (interval < 500) {
        this.frameIntervals[this.frameCursor] = interval;
        this.recordWindowFrame(interval);
      }
    }
    this.lastFrameStart = now;

    if (this.windowStart === 0) this.windowStart = now;
    if (now - this.windowStart >= WINDOW_MS) {
      this.evaluateWindow(now);
      this.windowStart = now;
      this.windowFrames = 0;
      this.windowMisses = 0;
      this.windowIntervalSum = 0;
    }
  }

  public onFrameEnd(frameStart: number, frameEnd: number): void {
    this.cpuTimes[this.frameCursor] = frameEnd - frameStart;
    this.frameCursor = (this.frameCursor + 1) % HISTORY;
    this.frameCount = Math.min(this.frameCount + 1, HISTORY);
  }

  private recordWindowFrame(interval: number): void {
    this.windowFrames++;
    this.windowIntervalSum += interval;
    if (interval > (1000 / this.targetHz()) * MISS_FACTOR) this.windowMisses++;
  }

  private targetHz(): number {
    return this.paced ? this.refreshHz / 2 : this.refreshHz;
  }

  // --- Control loop -----------------------------------------------------------------------

  private evaluateWindow(now: number): void {
    this.refreshHz = this.scene.getRefreshHz();

    if (!this.adaptive || this.held || document.hidden) return;
    if (now - this.startedAt < WARMUP_MS || now < this.settleUntil) return;
    if (this.windowFrames < 10) return;

    const missRatio = this.windowMisses / this.windowFrames;
    const avgFps = 1000 / (this.windowIntervalSum / this.windowFrames);
    const target = this.targetHz();

    if (missRatio > DEGRADE_MISS_RATIO || avgFps < target * 0.9) {
      this.goodWindows = 0;
      // A just-tried upgrade gets one window to prove itself, so failed probes stay short.
      const inProbation = this.lastUpgradeKind !== null && now - this.lastUpgradeAt < PROBATION_MS;
      if (++this.badWindows >= DEGRADE_AFTER_BAD_WINDOWS || inProbation) {
        this.badWindows = 0;
        this.degrade(now, avgFps);
      }
    } else if (missRatio < UPGRADE_MISS_RATIO && avgFps >= target * 0.97) {
      this.badWindows = 0;
      if (++this.goodWindows >= UPGRADE_AFTER_GOOD_WINDOWS) {
        this.goodWindows = 0;
        this.upgrade(now);
      }
    } else {
      this.badWindows = 0;
      this.goodWindows = 0;
    }
  }

  private degrade(now: number, avgFps: number): void {
    const failedProbe = now - this.lastUpgradeAt < PROBATION_MS;

    if (failedProbe && this.lastUpgradeKind === 'unpace') {
      this.unpaceBlockedUntil = now + this.unpaceBackoff;
      this.unpaceBackoff = Math.min(this.unpaceBackoff * 2, MAX_BACKOFF_MS);
      this.setPaced(true, now);
    } else if (failedProbe && this.lastUpgradeKind === 'tier') {
      // The tier we just climbed to can't be sustained: go back and don't retry for a while.
      const failedTier = this.tier;
      this.blockedUntil[failedTier] = now + this.backoff[failedTier];
      this.backoff[failedTier] = Math.min(this.backoff[failedTier] * 2, MAX_BACKOFF_MS);
      this.setTier(this.tier + 1);
    } else if (!this.paced && this.refreshHz >= 100 && avgFps < this.refreshHz * 0.85) {
      // Pacing costs no image quality, so on high-refresh panels it goes first.
      this.setPaced(true, now);
    } else if (this.tier < QUALITY_LADDER.length - 1) {
      this.setTier(this.tier + 1);
    } else {
      return;
    }
    this.lastUpgradeKind = null;
    this.settleUntil = now + SETTLE_MS;
  }

  private upgrade(now: number): void {
    if (this.tier > 0 && now >= this.blockedUntil[this.tier - 1]) {
      this.setTier(this.tier - 1);
      this.lastUpgradeKind = 'tier';
    } else if (
      this.paced &&
      this.tier === 0 &&
      now - this.pacedAt > MIN_TIME_PACED_BEFORE_UNPACE_MS &&
      now >= this.unpaceBlockedUntil
    ) {
      this.setPaced(false, now);
      this.lastUpgradeKind = 'unpace';
    } else {
      return;
    }
    this.lastUpgradeAt = now;
    this.settleUntil = now + SETTLE_MS;
  }

  private setTier(tier: number): void {
    this.tier = Math.max(0, Math.min(QUALITY_LADDER.length - 1, tier));
    this.applyTier();
  }

  private applyTier(): void {
    const t = QUALITY_LADDER[this.tier];
    this.scene.setMsaaSamples(t.msaaSamples);
    this.scene.setResolutionScale(t.resolutionScale);
    this.scene.setSseMultiplier(t.sseMultiplier);
    this.scene.setLiteEffects(this.tier >= LITE_EFFECTS_TIER);
  }

  private setPaced(paced: boolean, now: number): void {
    this.paced = paced;
    if (paced) this.pacedAt = now;
    this.scene.setFrameDivisor(paced ? 2 : 1);
  }

  // --- Public API -------------------------------------------------------------------------

  public setAdaptive(enabled: boolean): void {
    if (this.adaptive === enabled) return;
    this.adaptive = enabled;
    this.badWindows = 0;
    this.goodWindows = 0;
    // Either way, hand back the full-quality, un-paced baseline: when enabling, the controller
    // re-discovers the right tier from there; when disabling, manual settings start from it.
    this.tier = 0;
    this.applyTier();
    this.setPaced(false, performance.now());
    this.settleUntil = performance.now() + SETTLE_MS;
  }

  /**
   * Freeze the current tier and pacing (e.g. while recording: a resolution change resizes the
   * canvas mid-stream). Measurement continues; decisions resume from fresh windows.
   */
  public setHold(held: boolean): void {
    this.held = held;
    this.badWindows = 0;
    this.goodWindows = 0;
  }

  public isAdaptive(): boolean {
    return this.adaptive;
  }

  public snapshot(): PerformanceSnapshot {
    const n = this.frameCount;
    let intervalSum = 0;
    let cpuSum = 0;
    const recent = Math.min(n, 60);
    for (let i = 1; i <= recent; i++) {
      const idx = (this.frameCursor - i + HISTORY) % HISTORY;
      intervalSum += this.frameIntervals[idx];
      cpuSum += this.cpuTimes[idx];
    }
    const frameMs = recent > 0 ? intervalSum / recent : 0;

    let onePercentLowFps = 0;
    if (n > 0) {
      const sorted = Array.from(this.frameIntervals.subarray(0, n)).sort((a, b) => b - a);
      const worst = sorted[Math.max(0, Math.floor(n * 0.01))];
      onePercentLowFps = worst > 0 ? 1000 / worst : 0;
    }

    const t = QUALITY_LADDER[this.tier];
    return {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      onePercentLowFps,
      cpuMs: recent > 0 ? cpuSum / recent : 0,
      refreshHz: this.refreshHz,
      targetHz: this.targetHz(),
      paced: this.paced,
      adaptive: this.adaptive,
      tier: this.tier,
      tierCount: QUALITY_LADDER.length,
      msaaSamples: this.adaptive ? t.msaaSamples : this.scene.getMsaaSamples(),
      resolutionScale: this.adaptive ? t.resolutionScale : this.scene.getResolutionScale(),
      sseMultiplier: this.adaptive ? t.sseMultiplier : 1,
    };
  }
}
