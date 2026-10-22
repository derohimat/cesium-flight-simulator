/**
 * Authoritative Mathematical Oracles for:
 * - WGS84 Geodetic to ECEF Transformations
 * - Cesium Transforms (headingPitchRollToFixedFrame) 4x4 Matrices
 * - Parametric Cinematography Trajectories (360° Orbit, Fly-by, Spiral Reveal)
 */

export const WGS84_A = 6378137.0; // semi-major axis (meters)
export const WGS84_F = 1.0 / 298.257223563; // flattening
export const WGS84_B = WGS84_A * (1.0 - WGS84_F); // semi-minor axis
export const WGS84_E2 = 2.0 * WGS84_F - WGS84_F * WGS84_F; // eccentricity squared (0.00669437999014)

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180.0;
}

export function toDegrees(radians) {
  return (radians * 180.0) / Math.PI;
}

/**
 * Converts WGS84 (lat, lon in degrees, altitude in meters) to ECEF (X, Y, Z in meters).
 */
export function geodeticToCartesian3(latDeg, lonDeg, heightMeters) {
  const phi = toRadians(latDeg);
  const lambda = toRadians(lonDeg);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  const N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinPhi * sinPhi);

  const x = (N + heightMeters) * cosPhi * cosLambda;
  const y = (N + heightMeters) * cosPhi * sinLambda;
  const z = (N * (1.0 - WGS84_E2) + heightMeters) * sinPhi;

  return { x, y, z };
}

/**
 * Computes the local East, North, Up unit vectors in ECEF frame.
 */
export function computeEnuBasis(latDeg, lonDeg) {
  const phi = toRadians(latDeg);
  const lambda = toRadians(lonDeg);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  return {
    east: { x: -sinLambda, y: cosLambda, z: 0.0 },
    north: { x: -sinPhi * cosLambda, y: -sinPhi * sinLambda, z: cosPhi },
    up: { x: cosPhi * cosLambda, y: cosPhi * sinLambda, z: sinPhi },
  };
}

/**
 * Normalizes heading to [0, 360) range.
 */
export function normalizeHeading(headingDeg) {
  let h = headingDeg % 360;
  if (h < 0) h += 360;
  return h === 0 ? 0 : h;
}

/**
 * Computes 4x4 affine model matrix for Cesium headingPitchRollToFixedFrame
 * with scale factor applied.
 * Matrix is returned as 16-element column-major array (Cesium standard).
 */
export function computeModelMatrix(latDeg, lonDeg, heightMeters, headingDeg = 0, pitchDeg = 0, rollDeg = 0, scale = 1.0) {
  const origin = geodeticToCartesian3(latDeg, lonDeg, heightMeters);
  const enu = computeEnuBasis(latDeg, lonDeg);

  const psi = toRadians(normalizeHeading(headingDeg)); // heading (yaw around Up)
  const theta = toRadians(pitchDeg);                   // pitch around East
  const gamma = toRadians(rollDeg);                    // roll around North

  const cosPsi = Math.cos(psi);
  const sinPsi = Math.sin(psi);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosGamma = Math.cos(gamma);
  const sinGamma = Math.sin(gamma);

  // Rotation in ENU coordinates (Z-Up, Y-North, X-East)
  // R = R_z(psi) * R_x(theta) * R_y(gamma)
  const r00 = cosPsi * cosGamma - sinPsi * sinTheta * sinGamma;
  const r01 = -sinPsi * cosTheta;
  const r02 = cosPsi * sinGamma + sinPsi * sinTheta * cosGamma;

  const r10 = sinPsi * cosGamma + cosPsi * sinTheta * sinGamma;
  const r11 = cosPsi * cosTheta;
  const r12 = sinPsi * sinGamma - cosPsi * sinTheta * cosGamma;

  const r20 = -cosTheta * sinGamma;
  const r21 = sinTheta;
  const r22 = cosTheta * cosGamma;

  // Transform ENU rotation columns into ECEF coordinates
  // Col 0: East * r00 + North * r10 + Up * r20
  const c0x = (enu.east.x * r00 + enu.north.x * r10 + enu.up.x * r20) * scale;
  const c0y = (enu.east.y * r00 + enu.north.y * r10 + enu.up.y * r20) * scale;
  const c0z = (enu.east.z * r00 + enu.north.z * r10 + enu.up.z * r20) * scale;

  // Col 1: East * r01 + North * r11 + Up * r21
  const c1x = (enu.east.x * r01 + enu.north.x * r11 + enu.up.x * r21) * scale;
  const c1y = (enu.east.y * r01 + enu.north.y * r11 + enu.up.y * r21) * scale;
  const c1z = (enu.east.z * r01 + enu.north.z * r11 + enu.up.z * r21) * scale;

  // Col 2: East * r02 + North * r12 + Up * r22
  const c2x = (enu.east.x * r02 + enu.north.x * r12 + enu.up.x * r22) * scale;
  const c2y = (enu.east.y * r02 + enu.north.y * r12 + enu.up.y * r22) * scale;
  const c2z = (enu.east.z * r02 + enu.north.z * r12 + enu.up.z * r22) * scale;

  // Column-major 4x4 matrix
  return [
    c0x, c0y, c0z, 0,
    c1x, c1y, c1z, 0,
    c2x, c2y, c2z, 0,
    origin.x, origin.y, origin.z, 1,
  ];
}

/**
 * 360° Orbit Trajectory Generator Oracle.
 * Produces keyframes rotating around center at radius = modelRadius * 1.8.
 */
export function generateOrbitKeyframesOracle(options) {
  const {
    centerLat,
    centerLon,
    baseAltitude,
    radius,
    durationSeconds = 20,
    keyframeCount = 16,
  } = options;

  const effectiveRadius = Math.max(radius > 0 ? radius * 1.8 : 50.0, 10.0);
  const altitude = baseAltitude + effectiveRadius * 0.4;
  const keyframes = [];

  const metersPerDegreeLat = 111320.0;
  const metersPerDegreeLon = 111320.0 * Math.cos(toRadians(centerLat));

  for (let i = 0; i < keyframeCount; i++) {
    const fraction = i / (keyframeCount - 1);
    const time = fraction * durationSeconds;
    const angleRad = fraction * 2.0 * Math.PI;

    // Offset in local ENU meters
    const eastMeters = effectiveRadius * Math.sin(angleRad);
    const northMeters = effectiveRadius * Math.cos(angleRad);

    const lat = centerLat + northMeters / metersPerDegreeLat;
    const lon = centerLon + eastMeters / metersPerDegreeLon;

    // Camera heading points inward toward center
    // When angle is 0 (due North), camera points South (heading 180°)
    const heading = normalizeHeading(toDegrees(angleRad) + 180.0);
    const pitch = -15.0; // looking slightly downward

    keyframes.push({
      id: `kf-orbit-${i}`,
      time: Math.round(time * 100) / 100,
      lat,
      lon,
      altitude,
      heading,
      pitch,
      roll: 0.0,
      label: `Orbit ${(fraction * 360).toFixed(0)}°`,
    });
  }

  return keyframes;
}

/**
 * Cinematic Fly-by Trajectory Generator Oracle.
 * Produces approach, closest approach (tangent), and departure keyframes.
 */
export function generateFlyByKeyframesOracle(options) {
  const {
    centerLat,
    centerLon,
    baseAltitude,
    radius,
    durationSeconds = 15,
    keyframeCount = 9,
  } = options;

  const effectiveRadius = Math.max(radius > 0 ? radius : 50.0, 10.0);
  const flightDistance = effectiveRadius * 4.0;
  const lateralOffset = effectiveRadius * 1.5;
  const altitude = baseAltitude + effectiveRadius * 0.6;

  const metersPerDegreeLat = 111320.0;
  const metersPerDegreeLon = 111320.0 * Math.cos(toRadians(centerLat));

  const keyframes = [];

  for (let i = 0; i < keyframeCount; i++) {
    const fraction = i / (keyframeCount - 1); // 0.0 to 1.0
    const time = fraction * durationSeconds;

    // Forward coordinate along flight path: -flightDistance/2 to +flightDistance/2
    const forwardMeters = (fraction - 0.5) * flightDistance;
    const eastMeters = forwardMeters;
    const northMeters = lateralOffset;

    const lat = centerLat + northMeters / metersPerDegreeLat;
    const lon = centerLon + eastMeters / metersPerDegreeLon;

    // Camera tracks the model center
    // Bearing from camera (eastMeters, northMeters) to model (0, 0)
    const bearingRad = Math.atan2(-eastMeters, -northMeters);
    const heading = normalizeHeading(toDegrees(bearingRad));

    keyframes.push({
      id: `kf-flyby-${i}`,
      time: Math.round(time * 100) / 100,
      lat,
      lon,
      altitude,
      heading,
      pitch: -12.0,
      roll: 0.0,
      label: `Fly-by ${(fraction * 100).toFixed(0)}%`,
    });
  }

  return keyframes;
}

/**
 * Spiral Reveal Trajectory Generator Oracle.
 * Produces ascending helical trajectory expanding outward.
 */
export function generateSpiralRevealKeyframesOracle(options) {
  const {
    centerLat,
    centerLon,
    baseAltitude,
    radius,
    durationSeconds = 25,
    keyframeCount = 20,
    revolutions = 1.5,
  } = options;

  const effectiveRadius = Math.max(radius > 0 ? radius : 50.0, 10.0);
  const startRadius = effectiveRadius * 1.2;
  const endRadius = effectiveRadius * 3.0;
  const startAlt = baseAltitude + effectiveRadius * 0.2;
  const endAlt = baseAltitude + effectiveRadius * 2.0;

  const metersPerDegreeLat = 111320.0;
  const metersPerDegreeLon = 111320.0 * Math.cos(toRadians(centerLat));

  const keyframes = [];

  for (let i = 0; i < keyframeCount; i++) {
    const fraction = i / (keyframeCount - 1);
    const time = fraction * durationSeconds;

    const currentRadius = startRadius + (endRadius - startRadius) * fraction;
    const currentAlt = startAlt + (endAlt - startAlt) * fraction;
    const angleRad = fraction * (revolutions * 2.0 * Math.PI);

    const eastMeters = currentRadius * Math.sin(angleRad);
    const northMeters = currentRadius * Math.cos(angleRad);

    const lat = centerLat + northMeters / metersPerDegreeLat;
    const lon = centerLon + eastMeters / metersPerDegreeLon;

    const heading = normalizeHeading(toDegrees(angleRad) + 180.0);
    // Pitch tilts steeper as altitude climbs
    const pitch = -10.0 - 25.0 * fraction;

    keyframes.push({
      id: `kf-spiral-${i}`,
      time: Math.round(time * 100) / 100,
      lat,
      lon,
      altitude: currentAlt,
      heading,
      pitch,
      roll: 0.0,
      label: `Spiral ${(fraction * 100).toFixed(0)}%`,
    });
  }

  return keyframes;
}
