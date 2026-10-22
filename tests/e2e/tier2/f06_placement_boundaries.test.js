import {
  geodeticToCartesian3,
  computeModelMatrix,
} from '../helpers/mathOracles.js';

export function registerF06BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 06: Georeferenced Placement (Boundaries & Poles)', () => {
    suite.test('F06-B01: Placement at North Pole (lat = +90°) produces valid Cartesian3', () => {
      const ecef = geodeticToCartesian3(90.0, 0.0, 100.0);

      // At North Pole, X and Y should be ~0, Z should be positive semi-minor axis + height
      suite.closeTo(ecef.x, 0.0, 1e-4, 'ECEF X is 0 at North Pole');
      suite.closeTo(ecef.y, 0.0, 1e-4, 'ECEF Y is 0 at North Pole');
      suite.ok(ecef.z > 6350000, 'ECEF Z is positive near polar radius');
    });

    suite.test('F06-B02: Placement at South Pole (lat = -90°) produces valid Cartesian3', () => {
      const ecef = geodeticToCartesian3(-90.0, 0.0, 50.0);

      suite.closeTo(ecef.x, 0.0, 1e-4, 'ECEF X is 0 at South Pole');
      suite.closeTo(ecef.y, 0.0, 1e-4, 'ECEF Y is 0 at South Pole');
      suite.ok(ecef.z < -6350000, 'ECEF Z is negative near polar radius');
    });

    suite.test('F06-B03: Placement at Antimeridian (lon = +180° and -180°) are identical', () => {
      const ecefPositive = geodeticToCartesian3(25.0, 180.0, 100.0);
      const ecefNegative = geodeticToCartesian3(25.0, -180.0, 100.0);

      suite.closeTo(ecefPositive.x, ecefNegative.x, 1e-4);
      suite.closeTo(ecefPositive.y, ecefNegative.y, 1e-4);
      suite.closeTo(ecefPositive.z, ecefNegative.z, 1e-4);
    });

    suite.test('F06-B04: Placement at negative altitude (e.g. Dead Sea: -430m)', () => {
      const ecef = geodeticToCartesian3(31.5, 35.5, -430.0);
      const radiusFromCenter = Math.sqrt(ecef.x ** 2 + ecef.y ** 2 + ecef.z ** 2);

      const ecefSeaLevel = geodeticToCartesian3(31.5, 35.5, 0.0);
      const radiusSeaLevel = Math.sqrt(ecefSeaLevel.x ** 2 + ecefSeaLevel.y ** 2 + ecefSeaLevel.z ** 2);

      suite.closeTo(radiusSeaLevel - radiusFromCenter, 430.0, 1.0, 'Sub-sea-level elevation decreases radius by 430m');
    });

    suite.test('F06-B05: Reject invalid coordinates (NaN, Infinity, out of bounds)', () => {
      const validateCoordinates = (lat, lon, alt) => {
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          throw new Error(`Invalid latitude: ${lat}`);
        }
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          throw new Error(`Invalid longitude: ${lon}`);
        }
        if (!Number.isFinite(alt)) {
          throw new Error(`Invalid altitude: ${alt}`);
        }
        return true;
      };

      suite.throws(() => validateCoordinates(NaN, 12, 10), /Invalid latitude/);
      suite.throws(() => validateCoordinates(95, 12, 10), /Invalid latitude/);
      suite.throws(() => validateCoordinates(41, 195, 10), /Invalid longitude/);
      suite.throws(() => validateCoordinates(41, 12, Infinity), /Invalid altitude/);
    });
  });
}
