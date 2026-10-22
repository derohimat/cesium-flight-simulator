import {
  generateOrbitKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerF11Tests(suite) {
  suite.describe('Tier 1 - Feature 11: 360° Orbit Camera Path (Happy Path)', () => {
    const options = {
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 24.5,
      radius: 75.0,
      durationSeconds: 20,
      keyframeCount: 16,
    };

    suite.test('F11-T01: Generate orbit keyframes with standard options', () => {
      const keyframes = generateOrbitKeyframesOracle(options);
      suite.strictEqual(keyframes.length, 16, 'Generates 16 keyframes');
      suite.strictEqual(keyframes[0].time, 0.0, 'First keyframe starts at t=0');
      suite.strictEqual(keyframes[keyframes.length - 1].time, 20.0, 'Last keyframe ends at t=20');
    });

    suite.test('F11-T02: Orbit camera distance is calculated at radius * 1.8', () => {
      const keyframes = generateOrbitKeyframesOracle(options);
      const expectedOrbitRadiusMeters = 75.0 * 1.8; // 135 meters

      // Check distance of keyframe 0 from center
      const metersPerDegreeLat = 111320.0;
      const dLatMeters = (keyframes[0].lat - options.centerLat) * metersPerDegreeLat;
      const metersPerDegreeLon = 111320.0 * Math.cos((options.centerLat * Math.PI) / 180);
      const dLonMeters = (keyframes[0].lon - options.centerLon) * metersPerDegreeLon;
      const distance = Math.sqrt(dLatMeters ** 2 + dLonMeters ** 2);

      suite.closeTo(distance, expectedOrbitRadiusMeters, 1.0, 'Distance matches radius * 1.8');
    });

    suite.test('F11-T03: Keyframe angles form a full 360° loop around center', () => {
      const keyframes = generateOrbitKeyframesOracle(options);
      // Keyframe 0 and Keyframe 15 should have close spatial positions (closed loop)
      const kf0 = keyframes[0];
      const kfLast = keyframes[keyframes.length - 1];

      suite.closeTo(kf0.lat, kfLast.lat, 1e-4, 'Start and end latitudes match for closed loop');
      suite.closeTo(kf0.lon, kfLast.lon, 1e-4, 'Start and end longitudes match for closed loop');
    });

    suite.test('F11-T04: Camera heading points inward toward center throughout orbit', () => {
      const keyframes = generateOrbitKeyframesOracle(options);

      // Verify that every keyframe's heading points directly inward toward center:
      // When camera is at orbital angle theta, heading pointing inward is (theta + 180°) % 360
      for (let i = 0; i < keyframes.length; i++) {
        const fraction = i / (keyframes.length - 1);
        const angleDeg = fraction * 360.0;
        let expectedHeading = (angleDeg + 180.0) % 360.0;
        if (expectedHeading === 360) expectedHeading = 0;

        const actualHeading = keyframes[i].heading === 360 ? 0 : keyframes[i].heading;
        suite.closeTo(actualHeading, expectedHeading, 1.0, `Keyframe ${i} heading points toward center`);
      }
    });

    suite.test('F11-T05: Keyframe timestamps are strictly monotonically increasing', () => {
      const keyframes = generateOrbitKeyframesOracle(options);
      for (let i = 1; i < keyframes.length; i++) {
        suite.ok(
          keyframes[i].time > keyframes[i - 1].time,
          `Keyframe ${i} time (${keyframes[i].time}) must be > keyframe ${i - 1} time (${keyframes[i - 1].time})`
        );
      }
    });
  });
}
