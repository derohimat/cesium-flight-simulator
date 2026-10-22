export function registerF14BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 14: Timeline Integration (Boundaries & Edge Cases)', () => {
    class MockTimelineController {
      constructor(duration = 20) {
        this.keyframes = [];
        this.currentTime = 0;
        this.totalDuration = Math.max(0, duration);
      }

      setKeyframes(kfs) {
        this.keyframes = [...(kfs || [])].sort((a, b) => a.time - b.time);
      }

      seek(time) {
        if (!Number.isFinite(time)) return;
        this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
      }

      getPlayheadPosition() {
        if (this.totalDuration <= 0) return 0;
        return (this.currentTime / this.totalDuration) * 100;
      }

      interpolatePose() {
        if (!this.keyframes || this.keyframes.length === 0) return null;
        if (this.keyframes.length === 1) return this.keyframes[0];

        const t = this.currentTime;
        if (t <= this.keyframes[0].time) return this.keyframes[0];
        const last = this.keyframes[this.keyframes.length - 1];
        if (t >= last.time) return last;

        for (let i = 0; i < this.keyframes.length - 1; i++) {
          const k0 = this.keyframes[i];
          const k1 = this.keyframes[i + 1];
          if (t >= k0.time && t <= k1.time) {
            const dt = k1.time - k0.time;
            const frac = dt === 0 ? 0 : (t - k0.time) / dt;
            return {
              lat: k0.lat + (k1.lat - k0.lat) * frac,
              lon: k0.lon + (k1.lon - k0.lon) * frac,
              altitude: k0.altitude + (k1.altitude - k0.altitude) * frac,
            };
          }
        }
        return this.keyframes[0];
      }
    }

    suite.test('F14-B01: Seek to negative time clamps to 0.0', () => {
      const timeline = new MockTimelineController(20);
      timeline.seek(-15.5);
      suite.strictEqual(timeline.currentTime, 0.0, 'Negative time clamped to 0');
      suite.strictEqual(timeline.getPlayheadPosition(), 0.0);
    });

    suite.test('F14-B02: Seek past total duration clamps to totalDuration', () => {
      const timeline = new MockTimelineController(20);
      timeline.seek(999.0);
      suite.strictEqual(timeline.currentTime, 20.0, 'Excess time clamped to totalDuration');
      suite.strictEqual(timeline.getPlayheadPosition(), 100.0);
    });

    suite.test('F14-B03: Ingest unsorted keyframes automatically sorts chronologically', () => {
      const timeline = new MockTimelineController(30);
      const unsorted = [
        { id: 'k3', time: 25 },
        { id: 'k1', time: 5 },
        { id: 'k2', time: 15 },
      ];

      timeline.setKeyframes(unsorted);
      suite.strictEqual(timeline.keyframes[0].id, 'k1');
      suite.strictEqual(timeline.keyframes[1].id, 'k2');
      suite.strictEqual(timeline.keyframes[2].id, 'k3');
    });

    suite.test('F14-B04: Empty keyframes list handles seek and playhead without division-by-zero or crash', () => {
      const timeline = new MockTimelineController(0); // 0 duration
      timeline.setKeyframes([]);

      timeline.seek(10);
      suite.strictEqual(timeline.currentTime, 0);
      suite.strictEqual(timeline.getPlayheadPosition(), 0);
      suite.strictEqual(timeline.interpolatePose(), null);
    });

    suite.test('F14-B05: Duplicate timestamps between keyframes handled without zero-division in interpolation', () => {
      const timeline = new MockTimelineController(20);
      timeline.setKeyframes([
        { id: 'k1', time: 5, lat: 10, lon: 10, altitude: 50 },
        { id: 'k2', time: 5, lat: 20, lon: 20, altitude: 60 },
      ]);

      timeline.seek(5);
      const pose = timeline.interpolatePose();
      suite.ok(pose, 'Pose returned');
      suite.ok(Number.isFinite(pose.lat));
    });
  });
}
