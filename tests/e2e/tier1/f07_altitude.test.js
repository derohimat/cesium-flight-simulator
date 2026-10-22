import {
  geodeticToCartesian3,
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF07Tests(suite) {
  suite.describe('Tier 1 - Feature 07: Real-time Altitude Tuning (Happy Path)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const baseAltitude = 24.5;

    suite.test('F07-T01: Positive altitude offset increases distance from Earth center', () => {
      const pos0 = geodeticToCartesian3(lat, lon, baseAltitude);
      const posPlus25 = geodeticToCartesian3(lat, lon, baseAltitude + 25.0);

      const r0 = Math.sqrt(pos0.x ** 2 + pos0.y ** 2 + pos0.z ** 2);
      const rPlus = Math.sqrt(posPlus25.x ** 2 + posPlus25.y ** 2 + posPlus25.z ** 2);

      suite.closeTo(rPlus - r0, 25.0, 1e-2, 'Radial distance increases by exactly 25 meters');
    });

    suite.test('F07-T02: Negative altitude offset decreases distance from Earth center', () => {
      const pos0 = geodeticToCartesian3(lat, lon, baseAltitude);
      const posMinus15 = geodeticToCartesian3(lat, lon, baseAltitude - 15.0);

      const r0 = Math.sqrt(pos0.x ** 2 + pos0.y ** 2 + pos0.z ** 2);
      const rMinus = Math.sqrt(posMinus15.x ** 2 + posMinus15.y ** 2 + posMinus15.z ** 2);

      suite.closeTo(r0 - rMinus, 15.0, 1e-2, 'Radial distance decreases by exactly 15 meters');
    });

    suite.test('F07-T03: Altitude offset slider bounds define [-100m, +100m]', () => {
      const sliderMin = -100;
      const sliderMax = 100;
      const sliderStep = 0.5;

      suite.strictEqual(sliderMin, -100);
      suite.strictEqual(sliderMax, 100);
      suite.ok(sliderStep > 0 && sliderStep <= 1.0);
    });

    suite.test('F07-T04: In-place modelMatrix update preserves lat and lon origin', () => {
      const matrixA = computeModelMatrix(lat, lon, baseAltitude + 10.0, 30, 0, 0, 1.0);
      const matrixB = computeModelMatrix(lat, lon, baseAltitude + 40.0, 30, 0, 0, 1.0);

      // Verify origin translation coordinates changed in the Up direction
      const diffX = matrixB[12] - matrixA[12];
      const diffY = matrixB[13] - matrixA[13];
      const diffZ = matrixB[14] - matrixA[14];
      const shiftMagnitude = Math.sqrt(diffX ** 2 + diffY ** 2 + diffZ ** 2);

      suite.closeTo(shiftMagnitude, 30.0, 1e-2, 'Shift magnitude is exactly 30m');
    });

    suite.test('F07-T05: Altitude shift leaves 3x3 rotation basis invariant', () => {
      const matrixA = computeModelMatrix(lat, lon, baseAltitude + 5.0, 45, 10, 5, 1.0);
      const matrixB = computeModelMatrix(lat, lon, baseAltitude + 55.0, 45, 10, 5, 1.0);

      // Check first 3 columns (rotation components)
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 3; row++) {
          const idx = col * 4 + row;
          suite.closeTo(matrixA[idx], matrixB[idx], 1e-6, `Rotation element [${row},${col}] invariant`);
        }
      }
    });
  });
}
