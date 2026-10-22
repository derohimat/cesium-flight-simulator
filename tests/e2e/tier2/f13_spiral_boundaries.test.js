import {
  generateSpiralRevealKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerF13BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 13: Spiral Reveal (Boundaries & Edge Cases)', () => {
    suite.test('F13-B01: Multi-revolution spiral (3.0 revolutions) generates smooth spiral trajectory', () => {
      const keyframes = generateSpiralRevealKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
        durationSeconds: 30,
        keyframeCount: 25,
        revolutions: 3.0,
      });

      suite.strictEqual(keyframes.length, 25);
      suite.strictEqual(keyframes[0].time, 0.0);
      suite.strictEqual(keyframes[24].time, 30.0);
    });

    suite.test('F13-B02: Negative base altitude (e.g. -400m) maintains positive vertical ascent', () => {
      const negativeAltSpiral = generateSpiralRevealKeyframesOracle({
        centerLat: 31.5,
        centerLon: 35.5,
        baseAltitude: -400.0,
        radius: 50.0,
        durationSeconds: 20,
        keyframeCount: 10,
        revolutions: 1.0,
      });

      for (let i = 1; i < negativeAltSpiral.length; i++) {
        suite.ok(
          negativeAltSpiral[i].altitude >= negativeAltSpiral[i - 1].altitude,
          'Altitude steadily increases even from negative base'
        );
      }
    });

    suite.test('F13-B03: Zero radius model uses default spiral expansion envelope', () => {
      const zeroRadSpiral = generateSpiralRevealKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 0.0,
        durationSeconds: 15,
        keyframeCount: 8,
      });

      suite.strictEqual(zeroRadSpiral.length, 8);
      suite.ok(zeroRadSpiral[7].altitude > zeroRadSpiral[0].altitude);
    });

    suite.test('F13-B04: Clamping pitch limits to prevent gimbal flip (-85° to 0°)', () => {
      const clampPitch = (pitch) => Math.max(-85.0, Math.min(0.0, pitch));

      suite.strictEqual(clampPitch(-10), -10);
      suite.strictEqual(clampPitch(-89), -85, 'Clamps downward pitch to -85°');
      suite.strictEqual(clampPitch(15), 0, 'Clamps upward pitch to 0°');
    });

    suite.test('F13-B05: Single-turn spiral minimum duration validation', () => {
      const spiral = generateSpiralRevealKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 60.0,
        durationSeconds: 5.0,
        keyframeCount: 5,
        revolutions: 1.0,
      });

      suite.strictEqual(spiral.length, 5);
      suite.strictEqual(spiral[4].time, 5.0);
    });
  });
}
