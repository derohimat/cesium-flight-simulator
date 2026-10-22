import {
  generateSpiralRevealKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerF13Tests(suite) {
  suite.describe('Tier 1 - Feature 13: Spiral Reveal Camera Path (Happy Path)', () => {
    const options = {
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 24.5,
      radius: 75.0,
      durationSeconds: 25,
      keyframeCount: 20,
      revolutions: 1.5,
    };

    suite.test('F13-T01: Spiral reveal ascends monotonically in altitude over time', () => {
      const keyframes = generateSpiralRevealKeyframesOracle(options);
      suite.strictEqual(keyframes.length, 20);

      for (let i = 1; i < keyframes.length; i++) {
        suite.ok(
          keyframes[i].altitude >= keyframes[i - 1].altitude,
          `Altitude at step ${i} (${keyframes[i].altitude}) must be >= previous (${keyframes[i - 1].altitude})`
        );
      }
    });

    suite.test('F13-T02: Radius expands from initial close distance to wide reveal distance', () => {
      const keyframes = generateSpiralRevealKeyframesOracle(options);

      const metersPerDegreeLat = 111320.0;
      const metersPerDegreeLon = 111320.0 * Math.cos((options.centerLat * Math.PI) / 180);

      const kfFirst = keyframes[0];
      const kfLast = keyframes[keyframes.length - 1];

      const rFirst = Math.sqrt(
        ((kfFirst.lat - options.centerLat) * metersPerDegreeLat) ** 2 +
        ((kfFirst.lon - options.centerLon) * metersPerDegreeLon) ** 2
      );
      const rLast = Math.sqrt(
        ((kfLast.lat - options.centerLat) * metersPerDegreeLat) ** 2 +
        ((kfLast.lon - options.centerLon) * metersPerDegreeLon) ** 2
      );

      suite.ok(rLast > rFirst, `Final radius (${rLast}m) must exceed initial radius (${rFirst}m)`);
      suite.closeTo(rFirst, 75.0 * 1.2, 2.0, 'Start radius ~1.2x');
      suite.closeTo(rLast, 75.0 * 3.0, 2.0, 'End radius ~3.0x');
    });

    suite.test('F13-T03: Camera pitch tilts downward steeper as camera ascends higher', () => {
      const keyframes = generateSpiralRevealKeyframesOracle(options);
      const pitchStart = keyframes[0].pitch;
      const pitchEnd = keyframes[keyframes.length - 1].pitch;

      suite.ok(pitchEnd < pitchStart, `Pitch tilts down more steeply (${pitchEnd}° < ${pitchStart}°)`);
    });

    suite.test('F13-T04: Angular coverage completes configured revolutions', () => {
      const keyframes = generateSpiralRevealKeyframesOracle(options);
      suite.strictEqual(keyframes[0].time, 0.0);
      suite.strictEqual(keyframes[keyframes.length - 1].time, 25.0);
    });

    suite.test('F13-T05: Keyframe altitudes remain strictly above base elevation', () => {
      const keyframes = generateSpiralRevealKeyframesOracle(options);
      for (const kf of keyframes) {
        suite.ok(kf.altitude > options.baseAltitude);
      }
    });
  });
}
