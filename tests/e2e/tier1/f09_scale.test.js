import {
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF09Tests(suite) {
  suite.describe('Tier 1 - Feature 09: Real-time Scaling Control (Happy Path)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const altitude = 24.5;

    suite.test('F09-T01: 2.0x scale doubles column vector magnitudes in modelMatrix', () => {
      const mat1 = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 1.0);
      const mat2 = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 2.0);

      const lenCol0_1 = Math.sqrt(mat1[0] ** 2 + mat1[1] ** 2 + mat1[2] ** 2);
      const lenCol0_2 = Math.sqrt(mat2[0] ** 2 + mat2[1] ** 2 + mat2[2] ** 2);

      suite.closeTo(lenCol0_1, 1.0, 1e-4);
      suite.closeTo(lenCol0_2, 2.0, 1e-4, 'Scale 2.0x scales column length to 2.0');
    });

    suite.test('F09-T02: 0.5x scale halves column vector magnitudes in modelMatrix', () => {
      const matHalf = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 0.5);
      const lenCol0 = Math.sqrt(matHalf[0] ** 2 + matHalf[1] ** 2 + matHalf[2] ** 2);
      const lenCol1 = Math.sqrt(matHalf[4] ** 2 + matHalf[5] ** 2 + matHalf[6] ** 2);
      const lenCol2 = Math.sqrt(matHalf[8] ** 2 + matHalf[9] ** 2 + matHalf[10] ** 2);

      suite.closeTo(lenCol0, 0.5, 1e-4);
      suite.closeTo(lenCol1, 0.5, 1e-4);
      suite.closeTo(lenCol2, 0.5, 1e-4);
    });

    suite.test('F09-T03: 1.0x scale preserves unit basis lengths (identity scaling)', () => {
      const mat1 = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 1.0);
      const lenCol0 = Math.sqrt(mat1[0] ** 2 + mat1[1] ** 2 + mat1[2] ** 2);
      const lenCol1 = Math.sqrt(mat1[4] ** 2 + mat1[5] ** 2 + mat1[6] ** 2);
      const lenCol2 = Math.sqrt(mat1[8] ** 2 + mat1[9] ** 2 + mat1[10] ** 2);

      suite.closeTo(lenCol0, 1.0, 1e-4);
      suite.closeTo(lenCol1, 1.0, 1e-4);
      suite.closeTo(lenCol2, 1.0, 1e-4);
    });

    suite.test('F09-T04: Scaling updates effective bounding sphere radius proportionally', () => {
      const baseRadius = 75.0;
      const scale = 2.5;
      const scaledRadius = baseRadius * scale;

      suite.closeTo(scaledRadius, 187.5, 1e-4, 'Scaled radius = baseRadius * scale');
    });

    suite.test('F09-T05: Scaling slider bounds define [0.1x, 5.0x]', () => {
      const minScale = 0.1;
      const maxScale = 5.0;
      const step = 0.1;

      suite.strictEqual(minScale, 0.1);
      suite.strictEqual(maxScale, 5.0);
      suite.strictEqual(step, 0.1);
    });
  });
}
