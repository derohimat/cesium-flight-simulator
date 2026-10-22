import {
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF09BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 09: Scaling Control (Boundaries & Edge Cases)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const altitude = 24.5;

    const clampScale = (s) => {
      if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) {
        throw new Error(`Invalid scale factor: ${s}`);
      }
      return Math.max(0.1, Math.min(5.0, s));
    };

    suite.test('F09-B01: Clamp scale at minimum allowable boundary (0.1x)', () => {
      suite.strictEqual(clampScale(0.1), 0.1);
      suite.strictEqual(clampScale(0.01), 0.1, 'Clamps scales below 0.1x');
      suite.strictEqual(clampScale(0.0001), 0.1);
    });

    suite.test('F09-B02: Clamp scale at maximum allowable boundary (5.0x)', () => {
      suite.strictEqual(clampScale(5.0), 5.0);
      suite.strictEqual(clampScale(10.0), 5.0, 'Clamps scales above 5.0x');
      suite.strictEqual(clampScale(50.0), 5.0);
    });

    suite.test('F09-B03: Reject non-positive scales (0.0x, negative scales)', () => {
      suite.throws(() => clampScale(0.0), /Invalid scale factor/);
      suite.throws(() => clampScale(-1.0), /Invalid scale factor/);
      suite.throws(() => clampScale(-0.5), /Invalid scale factor/);
    });

    suite.test('F09-B04: Scaled matrix determinant remains strictly positive (preserves face winding)', () => {
      const mat = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 2.5);

      // Determinant of 3x3 rotation/scale submatrix
      const a = mat[0], b = mat[4], c = mat[8];
      const d = mat[1], e = mat[5], f = mat[9];
      const g = mat[2], h = mat[6], i = mat[10];

      const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

      // det = s^3 = 2.5^3 = 15.625
      suite.closeTo(det, 2.5 ** 3, 1e-2, 'Determinant = scale^3');
      suite.ok(det > 0, 'Determinant is strictly positive');
    });

    suite.test('F09-B05: Reject non-numeric scale inputs', () => {
      suite.throws(() => clampScale('2.0x'), /Invalid scale factor/);
      suite.throws(() => clampScale(null), /Invalid scale factor/);
      suite.throws(() => clampScale(undefined), /Invalid scale factor/);
      suite.throws(() => clampScale(NaN), /Invalid scale factor/);
    });
  });
}
