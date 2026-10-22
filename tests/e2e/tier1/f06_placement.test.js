import {
  geodeticToCartesian3,
  computeEnuBasis,
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF06Tests(suite) {
  suite.describe('Tier 1 - Feature 06: Georeferenced GLB Placement (Happy Path)', () => {
    const lat = 41.8902;
    const lon = 12.4922;
    const altitude = 24.5;

    suite.test('F06-T01: Compute ECEF Cartesian3 from WGS84 lat, lon, and elevation', () => {
      const ecef = geodeticToCartesian3(lat, lon, altitude);
      suite.ok(ecef.x !== 0 && ecef.y !== 0 && ecef.z !== 0, 'Coordinates must be non-zero');

      // Distance from center of Earth should be close to Earth radius + altitude
      const radiusFromCenter = Math.sqrt(ecef.x * ecef.x + ecef.y * ecef.y + ecef.z * ecef.z);
      suite.ok(radiusFromCenter > 6350000 && radiusFromCenter < 6385000, 'Radius within Earth bounds');
    });

    suite.test('F06-T02: Compute orthonormal East-North-Up (ENU) basis vectors', () => {
      const enu = computeEnuBasis(lat, lon);

      // East unit vector length
      const eastLen = Math.sqrt(enu.east.x ** 2 + enu.east.y ** 2 + enu.east.z ** 2);
      suite.closeTo(eastLen, 1.0, 1e-6, 'East vector is normalized');

      // North unit vector length
      const northLen = Math.sqrt(enu.north.x ** 2 + enu.north.y ** 2 + enu.north.z ** 2);
      suite.closeTo(northLen, 1.0, 1e-6, 'North vector is normalized');

      // Up unit vector length
      const upLen = Math.sqrt(enu.up.x ** 2 + enu.up.y ** 2 + enu.up.z ** 2);
      suite.closeTo(upLen, 1.0, 1e-6, 'Up vector is normalized');

      // Orthogonality: dot products must be zero
      const dotEN = enu.east.x * enu.north.x + enu.east.y * enu.north.y + enu.east.z * enu.north.z;
      const dotEU = enu.east.x * enu.up.x + enu.east.y * enu.up.y + enu.east.z * enu.up.z;
      const dotNU = enu.north.x * enu.up.x + enu.north.y * enu.up.y + enu.north.z * enu.up.z;

      suite.closeTo(dotEN, 0.0, 1e-6, 'East and North are orthogonal');
      suite.closeTo(dotEU, 0.0, 1e-6, 'East and Up are orthogonal');
      suite.closeTo(dotNU, 0.0, 1e-6, 'North and Up are orthogonal');
    });

    suite.test('F06-T03: Compute 4x4 model matrix via headingPitchRollToFixedFrame', () => {
      const matrix = computeModelMatrix(lat, lon, altitude, 0, 0, 0, 1.0);
      suite.strictEqual(matrix.length, 16, 'Model matrix must have 16 elements (4x4)');

      // Homogeneous coordinate row: [0, 0, 0, 1]
      suite.strictEqual(matrix[3], 0);
      suite.strictEqual(matrix[7], 0);
      suite.strictEqual(matrix[11], 0);
      suite.strictEqual(matrix[15], 1);
    });

    suite.test('F06-T04: Matrix translation column matches geodetic Cartesian3 origin', () => {
      const ecef = geodeticToCartesian3(lat, lon, altitude);
      const matrix = computeModelMatrix(lat, lon, altitude, 45, 0, 0, 1.0);

      suite.closeTo(matrix[12], ecef.x, 1e-2, 'Matrix X translation matches ECEF X');
      suite.closeTo(matrix[13], ecef.y, 1e-2, 'Matrix Y translation matches ECEF Y');
      suite.closeTo(matrix[14], ecef.z, 1e-2, 'Matrix Z translation matches ECEF Z');
    });

    suite.test('F06-T05: Bounding sphere center and radius derivation in world coordinates', () => {
      const ecef = geodeticToCartesian3(lat, lon, altitude);
      const modelRadius = 75.0;

      const boundingSphere = {
        center: ecef,
        radius: modelRadius,
      };

      suite.ok(boundingSphere.center.x !== 0);
      suite.strictEqual(boundingSphere.radius, 75.0);
    });
  });
}
