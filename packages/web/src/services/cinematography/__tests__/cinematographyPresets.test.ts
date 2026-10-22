import assert from 'node:assert/strict';
import {
  cinematographyPresets,
  CinematographyPresets,
  generateOrbitKeyframes,
  generateFlyByKeyframes,
  generateSpiralRevealKeyframes,
  normalizeHeading,
  toRadians,
  toDegrees,
} from '../CinematographyPresets';

console.log('🧪 Starting CinematographyPresets Unit Test Suite...');

// 1. Math Utility Functions
{
  assert.equal(normalizeHeading(0), 0);
  assert.equal(normalizeHeading(360), 0);
  assert.equal(normalizeHeading(450), 90);
  assert.equal(normalizeHeading(720), 0);
  assert.equal(normalizeHeading(-90), 270);
  assert.equal(normalizeHeading(-360), 0);
  assert.equal(normalizeHeading(-450), 270);

  assert.ok(Math.abs(toRadians(180) - Math.PI) < 1e-6);
  assert.ok(Math.abs(toDegrees(Math.PI) - 180) < 1e-6);
  console.log('  ✓ 1. Math utility functions verified');
}

// 2. 360° Orbit Camera Path
{
  const options = {
    centerLat: 41.8902,
    centerLon: 12.4922,
    baseAltitude: 24.5,
    radius: 75.0,
    durationSeconds: 20,
    keyframeCount: 16,
  };

  const keyframes = generateOrbitKeyframes(options);
  assert.equal(keyframes.length, 16, 'Generates 16 keyframes');
  assert.equal(keyframes[0].time, 0.0, 'First keyframe at t=0');
  assert.equal(keyframes[keyframes.length - 1].time, 20.0, 'Last keyframe at t=20');

  // Orbit radius check
  const metersPerDegreeLat = 111320.0;
  const metersPerDegreeLon = 111320.0 * Math.cos((options.centerLat * Math.PI) / 180);
  const dLatMeters = (keyframes[0].lat - options.centerLat) * metersPerDegreeLat;
  const dLonMeters = (keyframes[0].lon - options.centerLon) * metersPerDegreeLon;
  const distance = Math.sqrt(dLatMeters ** 2 + dLonMeters ** 2);
  assert.ok(Math.abs(distance - 75.0 * 1.8) < 1.0, 'Distance matches radius * 1.8');

  // Closed loop check
  const kf0 = keyframes[0];
  const kfLast = keyframes[keyframes.length - 1];
  assert.ok(Math.abs(kf0.lat - kfLast.lat) < 1e-4, 'Closed loop lat matches');
  assert.ok(Math.abs(kf0.lon - kfLast.lon) < 1e-4, 'Closed loop lon matches');
  assert.equal(kf0.heading, kfLast.heading, 'Closed loop heading matches');

  // Monotonic time progression
  for (let i = 1; i < keyframes.length; i++) {
    assert.ok(keyframes[i].time > keyframes[i - 1].time, 'Monotonic timestamps');
  }

  // Heading points inward
  for (let i = 0; i < keyframes.length; i++) {
    const fraction: number = i / (keyframes.length - 1);
    const angleDeg: number = fraction * 360.0;
    let expectedHeading: number = (angleDeg + 180.0) % 360.0;
    if (expectedHeading === 360) expectedHeading = 0;
    assert.ok(Math.abs(keyframes[i].heading - expectedHeading) < 1.0, `Keyframe ${i} heading points toward center`);
  }

  console.log('  ✓ 2. 360° Orbit keyframes verified');
}

// 3. Cinematic Fly-by Path
{
  const options = {
    centerLat: 41.8902,
    centerLon: 12.4922,
    baseAltitude: 24.5,
    radius: 75.0,
    durationSeconds: 15,
    keyframeCount: 9,
  };

  const keyframes = generateFlyByKeyframes(options);
  assert.equal(keyframes.length, 9, 'Generates 9 keyframes');
  assert.equal(keyframes[0].time, 0.0, 'Starts at t=0');
  assert.equal(keyframes[8].time, 15.0, 'Ends at t=15');

  // Closest approach clearance at midpoint
  const midKf = keyframes[4];
  const metersPerDegreeLat = 111320.0;
  const metersPerDegreeLon = 111320.0 * Math.cos((options.centerLat * Math.PI) / 180);
  const dLat = (midKf.lat - options.centerLat) * metersPerDegreeLat;
  const dLon = (midKf.lon - options.centerLon) * metersPerDegreeLon;
  const distance = Math.sqrt(dLat ** 2 + dLon ** 2);
  assert.ok(Math.abs(distance - 75.0 * 1.5) < 2.0, 'Closest approach distance is ~1.5x model radius');

  // Pitch downward
  for (const kf of keyframes) {
    assert.ok(kf.pitch < 0 && kf.pitch >= -30, 'Pitch is slightly downward');
    assert.ok(kf.altitude > options.baseAltitude, 'Altitude cleared above base');
  }

  // Camera tracking heading changes through flight
  assert.notEqual(keyframes[0].heading, keyframes[4].heading);
  assert.notEqual(keyframes[4].heading, keyframes[8].heading);

  console.log('  ✓ 3. Cinematic Fly-by keyframes verified');
}

// 4. Spiral Reveal Path
{
  const options = {
    centerLat: 41.8902,
    centerLon: 12.4922,
    baseAltitude: 24.5,
    radius: 75.0,
    durationSeconds: 25,
    keyframeCount: 20,
    revolutions: 1.5,
  };

  const keyframes = generateSpiralRevealKeyframes(options);
  assert.equal(keyframes.length, 20);

  // Monotonic altitude ascent
  for (let i = 1; i < keyframes.length; i++) {
    assert.ok(keyframes[i].altitude >= keyframes[i - 1].altitude, 'Ascending altitude');
  }

  // Radius expansion
  const metersPerDegreeLat = 111320.0;
  const metersPerDegreeLon = 111320.0 * Math.cos((options.centerLat * Math.PI) / 180);
  const kfFirst = keyframes[0];
  const kfLast = keyframes[keyframes.length - 1];

  const rFirst = Math.sqrt(
    ((kfFirst.lat - options.centerLat) * metersPerDegreeLat) ** 2 +
    ((kfFirst.lon - options.centerLon) * metersPerDegreeLon) ** 2
  );
  const rLast = Math.sqrt(
    ((kfLast.lat - options.centerLat) * metersPerDegreeLat) ** 2 +
    ((kfLast.lon - options.centerLon) * metersPerDegreeLon) ** 2
  );
  assert.ok(rLast > rFirst, 'Radius expands outward');
  assert.ok(Math.abs(rFirst - 75.0 * 1.2) < 2.0, 'Start radius ~1.2x');
  assert.ok(Math.abs(rLast - 75.0 * 3.0) < 2.0, 'End radius ~3.0x');

  // Pitch tilts steeper downward as altitude ascends
  assert.ok(kfLast.pitch < kfFirst.pitch, 'Pitch tilts more steeply downward');

  console.log('  ✓ 4. Spiral Reveal keyframes verified');
}

// 5. Boundary & Stress Edge Cases
{
  // Zero radius fallback
  const zeroOrbit = generateOrbitKeyframes({
    centerLat: 0,
    centerLon: 0,
    baseAltitude: 10,
    radius: 0,
  });
  assert.ok(zeroOrbit.length >= 2);
  assert.ok(zeroOrbit[0].altitude > 10);

  // Extreme high latitude (70° N)
  const highLat = generateOrbitKeyframes({
    centerLat: 70.0,
    centerLon: 15.0,
    baseAltitude: 50.0,
    radius: 100.0,
  });
  assert.ok(highLat.every(kf => Number.isFinite(kf.lat) && Number.isFinite(kf.lon)));

  // Negative base altitude spiral
  const negAltSpiral = generateSpiralRevealKeyframes({
    centerLat: 31.5,
    centerLon: 35.5,
    baseAltitude: -400.0,
    radius: 50.0,
  });
  for (let i = 1; i < negAltSpiral.length; i++) {
    assert.ok(negAltSpiral[i].altitude >= negAltSpiral[i - 1].altitude);
  }

  // Minimum keyframes (2 points)
  const twoPt = generateFlyByKeyframes({
    centerLat: 0,
    centerLon: 0,
    baseAltitude: 0,
    radius: 50,
    keyframeCount: 2,
  });
  assert.equal(twoPt.length, 2);

  console.log('  ✓ 5. Boundary & stress cases verified');
}

// 6. Class Interface & Singleton Instance
{
  const presets = new CinematographyPresets();
  const orbit = presets.generateOrbitKeyframes({ centerLat: 10, centerLon: 10, baseAltitude: 10, radius: 20 });
  const flyby = presets.generateFlyByKeyframes({ centerLat: 10, centerLon: 10, baseAltitude: 10, radius: 20 });
  const spiral = presets.generateSpiralRevealKeyframes({ centerLat: 10, centerLon: 10, baseAltitude: 10, radius: 20 });

  assert.ok(orbit.length > 0);
  assert.ok(flyby.length > 0);
  assert.ok(spiral.length > 0);

  assert.ok(cinematographyPresets instanceof CinematographyPresets);
  console.log('  ✓ 6. Class interface and singleton verified');
}

console.log('🎉 ALL CinematographyPresets UNIT TESTS PASSED!');
