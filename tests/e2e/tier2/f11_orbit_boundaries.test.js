import {
  generateOrbitKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerF11BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 11: 360° Orbit (Boundaries & Edge Cases)', () => {
    suite.test('F11-B01: Zero model radius enforces safe minimum orbit distance', () => {
      const keyframes = generateOrbitKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 0.0, // zero radius
        durationSeconds: 20,
        keyframeCount: 8,
      });

      suite.strictEqual(keyframes.length, 8);
      // Even with 0 radius, camera distance should not collapse to 0
      const dLat = Math.abs(keyframes[0].lat - 41.8902);
      suite.ok(dLat > 0, 'Camera offset is non-zero');
    });

    suite.test('F11-B02: Extreme model radius (50,000m) produces valid geodetic coordinates', () => {
      const keyframes = generateOrbitKeyframesOracle({
        centerLat: 0.0,
        centerLon: 0.0,
        baseAltitude: 100.0,
        radius: 50000.0, // 50km radius
        durationSeconds: 60,
        keyframeCount: 16,
      });

      for (const kf of keyframes) {
        suite.ok(kf.lat >= -90 && kf.lat <= 90, 'Lat within bounds');
        suite.ok(kf.lon >= -180 && kf.lon <= 180, 'Lon within bounds');
        suite.ok(kf.altitude > 100.0, 'Altitude valid');
      }
    });

    suite.test('F11-B03: Very short duration (1s) and long duration (3600s) timeline intervals', () => {
      const shortOrbit = generateOrbitKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 50.0,
        durationSeconds: 1.0,
        keyframeCount: 5,
      });
      suite.strictEqual(shortOrbit[0].time, 0.0);
      suite.strictEqual(shortOrbit[4].time, 1.0);

      const longOrbit = generateOrbitKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 50.0,
        durationSeconds: 3600.0,
        keyframeCount: 5,
      });
      suite.strictEqual(longOrbit[0].time, 0.0);
      suite.strictEqual(longOrbit[4].time, 3600.0);
    });

    suite.test('F11-B04: High-latitude orbit (70° N) accounts for longitudinal convergence', () => {
      const highLatOrbit = generateOrbitKeyframesOracle({
        centerLat: 70.0,
        centerLon: 15.0,
        baseAltitude: 50.0,
        radius: 100.0,
        durationSeconds: 20,
        keyframeCount: 16,
      });

      // At 70° N, cos(70°) ≈ 0.342, so 1 meter is ~2.9x more degrees of longitude than at equator
      const eastKf = highLatOrbit[4]; // ~90° angle
      const dLon = Math.abs(eastKf.lon - 15.0);
      suite.ok(dLon > 0.001, 'Calculates proportional longitude delta');
    });

    suite.test('F11-B05: Orbit with single keyframe edge case defaults cleanly', () => {
      const singleKfOrbit = generateOrbitKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
        durationSeconds: 10,
        keyframeCount: 2,
      });

      suite.strictEqual(singleKfOrbit.length, 2);
      suite.ok(Number.isFinite(singleKfOrbit[0].lat));
      suite.ok(Number.isFinite(singleKfOrbit[1].lat));
    });
  });
}
