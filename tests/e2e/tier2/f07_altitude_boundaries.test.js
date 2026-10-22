import {
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF07BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 07: Altitude Tuning (Boundaries & Stress)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const baseAltitude = 24.5;

    const clampAltitudeOffset = (offset) => {
      if (typeof offset !== 'number' || !Number.isFinite(offset)) {
        throw new Error(`Invalid altitude offset: ${offset}`);
      }
      return Math.max(-100.0, Math.min(100.0, offset));
    };

    suite.test('F07-B01: Clamp altitude offset at minimum boundary (-100m)', () => {
      suite.strictEqual(clampAltitudeOffset(-100.0), -100.0);
      suite.strictEqual(clampAltitudeOffset(-150.0), -100.0, 'Clamps values below -100m');
      suite.strictEqual(clampAltitudeOffset(-9999.0), -100.0);
    });

    suite.test('F07-B02: Clamp altitude offset at maximum boundary (+100m)', () => {
      suite.strictEqual(clampAltitudeOffset(100.0), 100.0);
      suite.strictEqual(clampAltitudeOffset(250.0), 100.0, 'Clamps values above +100m');
      suite.strictEqual(clampAltitudeOffset(10000.0), 100.0);
    });

    suite.test('F07-B03: Reject non-numeric altitude offset inputs', () => {
      suite.throws(() => clampAltitudeOffset('50m'), /Invalid altitude offset/);
      suite.throws(() => clampAltitudeOffset(null), /Invalid altitude offset/);
      suite.throws(() => clampAltitudeOffset(undefined), /Invalid altitude offset/);
      suite.throws(() => clampAltitudeOffset(NaN), /Invalid altitude offset/);
    });

    suite.test('F07-B04: High-frequency sequential altitude adjustment (1000 updates) preserves stability', () => {
      let offset = 0.0;
      for (let i = 0; i < 1000; i++) {
        offset = clampAltitudeOffset(offset + (i % 2 === 0 ? 0.2 : -0.19));
      }
      const mat = computeModelMatrix(lat, lon, baseAltitude + offset, 0, 0, 0, 1.0);
      for (const val of mat) {
        suite.ok(Number.isFinite(val), 'Matrix values remain finite under rapid updates');
      }
    });

    suite.test('F07-B05: Sub-millimeter precision offset (0.001m) does not produce NaN', () => {
      const fineOffset = 0.001;
      const mat = computeModelMatrix(lat, lon, baseAltitude + fineOffset, 0, 0, 0, 1.0);
      suite.ok(Number.isFinite(mat[14]), 'Z coordinate is finite');
    });
  });
}
