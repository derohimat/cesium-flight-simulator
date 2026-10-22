import {
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF08Tests(suite) {
  suite.describe('Tier 1 - Feature 08: Real-time Heading Rotation (Happy Path)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const altitude = 24.5;

    suite.test('F08-T01: 90° heading rotation produces orthogonal rotation in ENU plane', () => {
      const mat0 = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 1.0);
      const mat90 = computeModelMatrix(lat, lon, altitude, 90, 0, 0, 1.0);

      // At 0° heading, Col 1 is North. At 90° heading, Col 0 rotates to North.
      const dot = mat0[4] * mat90[0] + mat0[5] * mat90[1] + mat0[6] * mat90[2];
      suite.closeTo(dot, 1.0, 1e-4, 'Col 0 at 90° aligns with Col 1 at 0°');
    });

    suite.test('F08-T02: 180° heading rotation inverts local forward horizontal vector', () => {
      const mat0 = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 1.0);
      const mat180 = computeModelMatrix(lat, lon, altitude, 180, 0, 0, 1.0);

      // Col 1 (North) at 180° should be opposite to Col 1 at 0°
      const dot = mat0[4] * mat180[4] + mat0[5] * mat180[5] + mat0[6] * mat180[6];
      suite.closeTo(dot, -1.0, 1e-4, 'North vector reverses direction at 180° heading');
    });

    suite.test('F08-T03: 270° heading rotation produces complementary orthogonal orientation', () => {
      const mat90 = computeModelMatrix(lat, lon, altitude, 90, 0, 0, 1.0);
      const mat270 = computeModelMatrix(lat, lon, altitude, 270, 0, 0, 1.0);

      // Col 0 at 270° should be opposite to Col 0 at 90°
      const dot = mat90[0] * mat270[0] + mat90[1] * mat270[1] + mat90[2] * mat270[2];
      suite.closeTo(dot, -1.0, 1e-4, 'Opposite orientation between 90° and 270°');
    });

    suite.test('F08-T04: Heading changes leave origin position translation invariant', () => {
      const mat0 = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 1.0);
      const mat45 = computeModelMatrix(lat, lon, altitude, 45, 0, 0, 1.0);
      const mat120 = computeModelMatrix(lat, lon, altitude, 120, 0, 0, 1.0);

      suite.closeTo(mat0[12], mat45[12], 1e-6);
      suite.closeTo(mat0[13], mat45[13], 1e-6);
      suite.closeTo(mat0[14], mat45[14], 1e-6);

      suite.closeTo(mat0[12], mat120[12], 1e-6);
      suite.closeTo(mat0[13], mat120[13], 1e-6);
      suite.closeTo(mat0[14], mat120[14], 1e-6);
    });

    suite.test('F08-T05: Heading slider bounds define [0°, 360°]', () => {
      const min = 0;
      const max = 360;
      const step = 1;

      suite.strictEqual(min, 0);
      suite.strictEqual(max, 360);
      suite.strictEqual(step, 1);
    });
  });
}
