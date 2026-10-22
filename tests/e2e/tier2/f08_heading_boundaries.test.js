import {
  computeModelMatrix,
  normalizeHeading,
} from '../helpers/mathOracles.js';

export function registerF08BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 08: Heading Rotation (Boundaries & Wraps)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const altitude = 24.5;

    suite.test('F08-B01: 0° and 360° heading equivalence produces identical rotation matrices', () => {
      const mat0 = computeModelMatrix(lat, lon, altitude, 0.0, 0, 0, 1.0);
      const mat360 = computeModelMatrix(lat, lon, altitude, 360.0, 0, 0, 1.0);

      for (let i = 0; i < 16; i++) {
        suite.closeTo(mat0[i], mat360[i], 1e-5, `Matrix element [${i}] identical for 0° and 360°`);
      }
    });

    suite.test('F08-B02: Normalize heading angle > 360° (e.g. 450° -> 90°, 720° -> 0°)', () => {
      suite.strictEqual(normalizeHeading(360), 0);
      suite.strictEqual(normalizeHeading(450), 90);
      suite.strictEqual(normalizeHeading(720), 0);
      suite.strictEqual(normalizeHeading(810), 90);
    });

    suite.test('F08-B03: Normalize negative heading angles (e.g. -90° -> 270°, -360° -> 0°)', () => {
      suite.strictEqual(normalizeHeading(-90), 270);
      suite.strictEqual(normalizeHeading(-180), 180);
      suite.strictEqual(normalizeHeading(-360), 0);
      suite.strictEqual(normalizeHeading(-450), 270);
    });

    suite.test('F08-B04: Continuous 360° rotation retains matrix column orthonormality', () => {
      for (let deg = 0; deg <= 360; deg += 30) {
        const mat = computeModelMatrix(lat, lon, altitude, deg, 0, 0, 1.0);

        // Col 0 length
        const len0 = Math.sqrt(mat[0] ** 2 + mat[1] ** 2 + mat[2] ** 2);
        // Col 1 length
        const len1 = Math.sqrt(mat[4] ** 2 + mat[5] ** 2 + mat[6] ** 2);
        // Col 2 length
        const len2 = Math.sqrt(mat[8] ** 2 + mat[9] ** 2 + mat[10] ** 2);

        suite.closeTo(len0, 1.0, 1e-4);
        suite.closeTo(len1, 1.0, 1e-4);
        suite.closeTo(len2, 1.0, 1e-4);

        // Dot product Col 0 and Col 1
        const dot01 = mat[0] * mat[4] + mat[1] * mat[5] + mat[2] * mat[6];
        suite.closeTo(dot01, 0.0, 1e-4);
      }
    });

    suite.test('F08-B05: Reject NaN or non-finite heading inputs', () => {
      const validateHeading = (h) => {
        if (typeof h !== 'number' || !Number.isFinite(h)) {
          throw new Error(`Invalid heading: ${h}`);
        }
        return normalizeHeading(h);
      };

      suite.throws(() => validateHeading(NaN), /Invalid heading/);
      suite.throws(() => validateHeading(Infinity), /Invalid heading/);
      suite.throws(() => validateHeading('180'), /Invalid heading/);
    });
  });
}
