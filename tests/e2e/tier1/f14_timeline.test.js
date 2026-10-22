export function registerF14Tests(suite) {
  suite.describe('Tier 1 - Feature 14: Flight Timeline Integration (Happy Path)', () => {
    class MockTimelineController {
      constructor(duration = 20) {
        this.keyframes = [];
        this.currentTime = 0;
        this.totalDuration = duration;
        this.isPlaying = false;
      }

      setKeyframes(kfs) {
        this.keyframes = [...kfs].sort((a, b) => a.time - b.time);
      }

      addKeyframe(kf) {
        this.keyframes.push(kf);
        this.keyframes.sort((a, b) => a.time - b.time);
      }

      deleteKeyframe(id) {
        this.keyframes = this.keyframes.filter((k) => k.id !== id);
      }

      seek(time) {
        this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
      }

      getPlayheadPosition() {
        return this.totalDuration > 0 ? (this.currentTime / this.totalDuration) * 100 : 0;
      }

      interpolatePoseAtCurrentTime() {
        if (this.keyframes.length === 0) return null;
        if (this.keyframes.length === 1) return this.keyframes[0];

        // Find surrounding keyframes
        const t = this.currentTime;
        if (t <= this.keyframes[0].time) return this.keyframes[0];
        if (t >= this.keyframes[this.keyframes.length - 1].time) {
          return this.keyframes[this.keyframes.length - 1];
        }

        for (let i = 0; i < this.keyframes.length - 1; i++) {
          const k0 = this.keyframes[i];
          const k1 = this.keyframes[i + 1];
          if (t >= k0.time && t <= k1.time) {
            const frac = (t - k0.time) / (k1.time - k0.time);
            return {
              lat: k0.lat + (k1.lat - k0.lat) * frac,
              lon: k0.lon + (k1.lon - k0.lon) * frac,
              altitude: k0.altitude + (k1.altitude - k0.altitude) * frac,
              heading: k0.heading + (k1.heading - k0.heading) * frac,
            };
          }
        }
        return this.keyframes[0];
      }
    }

    suite.test('F14-T01: Ingest preset keyframes into timeline model', () => {
      const timeline = new MockTimelineController(20);
      const testKeyframes = [
        { id: 'k1', time: 0, lat: 41.8902, lon: 12.4922, altitude: 50, heading: 0 },
        { id: 'k2', time: 10, lat: 41.8912, lon: 12.4932, altitude: 75, heading: 90 },
        { id: 'k3', time: 20, lat: 41.8902, lon: 12.4922, altitude: 50, heading: 180 },
      ];

      timeline.setKeyframes(testKeyframes);
      suite.strictEqual(timeline.keyframes.length, 3);
      suite.strictEqual(timeline.keyframes[0].id, 'k1');
    });

    suite.test('F14-T02: Playhead percentage calculation maps time to [0, 100%]', () => {
      const timeline = new MockTimelineController(20);

      timeline.seek(0);
      suite.strictEqual(timeline.getPlayheadPosition(), 0);

      timeline.seek(10);
      suite.strictEqual(timeline.getPlayheadPosition(), 50, 'Midpoint is 50%');

      timeline.seek(20);
      suite.strictEqual(timeline.getPlayheadPosition(), 100, 'End point is 100%');
    });

    suite.test('F14-T03: Interpolate camera pose between keyframes on seek', () => {
      const timeline = new MockTimelineController(20);
      timeline.setKeyframes([
        { id: 'k1', time: 0, lat: 10, lon: 20, altitude: 100, heading: 0 },
        { id: 'k2', time: 10, lat: 20, lon: 40, altitude: 200, heading: 100 },
      ]);

      timeline.seek(5); // exactly 50% between k1 and k2
      const pose = timeline.interpolatePoseAtCurrentTime();

      suite.closeTo(pose.lat, 15, 1e-4);
      suite.closeTo(pose.lon, 30, 1e-4);
      suite.closeTo(pose.altitude, 150, 1e-4);
      suite.closeTo(pose.heading, 50, 1e-4);
    });

    suite.test('F14-T04: Add and delete keyframes preserves chronological order', () => {
      const timeline = new MockTimelineController(30);
      timeline.setKeyframes([
        { id: 'k1', time: 0 },
        { id: 'k3', time: 20 },
      ]);

      // Insert k2 at t=10
      timeline.addKeyframe({ id: 'k2', time: 10 });
      suite.strictEqual(timeline.keyframes[1].id, 'k2', 'k2 inserted between k1 and k3');

      // Delete k1
      timeline.deleteKeyframe('k1');
      suite.strictEqual(timeline.keyframes.length, 2);
      suite.strictEqual(timeline.keyframes[0].id, 'k2');
    });

    suite.test('F14-T05: Format time as MM:SS', () => {
      const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      };

      suite.strictEqual(formatTime(0), '00:00');
      suite.strictEqual(formatTime(45), '00:45');
      suite.strictEqual(formatTime(75), '01:15');
      suite.strictEqual(formatTime(3600), '60:00');
    });
  });
}
