import {
  generateFlyByKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerF12Tests(suite) {
  suite.describe('Tier 1 - Feature 12: Cinematic Fly-by Path (Happy Path)', () => {
    const options = {
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 24.5,
      radius: 75.0,
      durationSeconds: 15,
      keyframeCount: 9,
    };

    suite.test('F12-T01: Generate fly-by trajectory keyframes', () => {
      const keyframes = generateFlyByKeyframesOracle(options);
      suite.strictEqual(keyframes.length, 9, 'Generates 9 keyframes');
      suite.strictEqual(keyframes[0].time, 0.0, 'Starts at t=0');
      suite.strictEqual(keyframes[keyframes.length - 1].time, 15.0, 'Ends at t=15');
    });

    suite.test('F12-T02: Closest approach distance respects model bounding radius', () => {
      const keyframes = generateFlyByKeyframesOracle(options);
      const midKf = keyframes[Math.floor(keyframes.length / 2)];

      const metersPerDegreeLat = 111320.0;
      const metersPerDegreeLon = 111320.0 * Math.cos((options.centerLat * Math.PI) / 180);

      const dLat = (midKf.lat - options.centerLat) * metersPerDegreeLat;
      const dLon = (midKf.lon - options.centerLon) * metersPerDegreeLon;
      const distance = Math.sqrt(dLat ** 2 + dLon ** 2);

      // Distance at closest point should equal lateralOffset = radius * 1.5 = 112.5m
      suite.closeTo(distance, 75.0 * 1.5, 2.0, 'Closest approach distance is ~1.5x model radius');
    });

    suite.test('F12-T03: Camera heading smoothly tracks model center during fly-by', () => {
      const keyframes = generateFlyByKeyframesOracle(options);

      // Camera starts looking forward-right, turns toward side at closest approach, then backward-right
      const firstHeading = keyframes[0].heading;
      const midHeading = keyframes[Math.floor(keyframes.length / 2)].heading;
      const lastHeading = keyframes[keyframes.length - 1].heading;

      suite.notStrictEqual(firstHeading, midHeading, 'Heading changes between approach and center');
      suite.notStrictEqual(midHeading, lastHeading, 'Heading changes between center and departure');
    });

    suite.test('F12-T04: Altitude clearance maintained above base elevation', () => {
      const keyframes = generateFlyByKeyframesOracle(options);
      for (const kf of keyframes) {
        suite.ok(
          kf.altitude > options.baseAltitude,
          `Keyframe altitude (${kf.altitude}) must exceed base altitude (${options.baseAltitude})`
        );
      }
    });

    suite.test('F12-T05: Keyframe pitch remains stable looking slightly downward', () => {
      const keyframes = generateFlyByKeyframesOracle(options);
      for (const kf of keyframes) {
        suite.ok(kf.pitch < 0 && kf.pitch >= -30, 'Pitch is negative (looking downward) between -30° and 0°');
      }
    });
  });
}
