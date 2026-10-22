/**
 * Empirical Adversarial Stress Test Suite for Milestone 3:
 * Cinematography Presets, Timeline Interpolation & Integration
 *
 * Tests:
 * 1. CinematographyPresets Pathological Inputs & Extreme Geodesy
 * 2. Shortest-Angular-Path Heading Wrapping & Interpolation Invariants
 * 3. Monotonicity & Closed-Loop Precision
 * 4. Boundary Trajectories (Poles, Antimeridian, Negative Altitudes)
 * 5. Simulation of Flight Timeline Scrubbing & Animation Frame Loop
 */

import assert from 'node:assert/strict';
import {
  generateOrbitKeyframes,
  generateFlyByKeyframes,
  generateSpiralRevealKeyframes,
  normalizeHeading,
  toRadians,
  toDegrees,
  cinematographyPresets,
} from '../packages/web/src/services/cinematography/CinematographyPresets.ts';

class AdversarialSuite {
  constructor(name) {
    this.name = name;
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(desc, fn) {
    this.total++;
    try {
      fn();
      this.passed++;
      console.log(`  ✓ ${desc}`);
    } catch (err) {
      this.failed++;
      this.errors.push({ desc, error: err });
      console.error(`  ✗ ${desc}`);
      console.error(`    Error: ${err.message}`);
    }
  }

  async asyncTest(desc, fn) {
    this.total++;
    try {
      await fn();
      this.passed++;
      console.log(`  ✓ ${desc}`);
    } catch (err) {
      this.failed++;
      this.errors.push({ desc, error: err });
      console.error(`  ✗ ${desc}`);
      console.error(`    Error: ${err.message}`);
    }
  }
}

async function runM3AdversarialTests() {
  console.log('================================================================');
  console.log('  Milestone 3 Cinematography & Timeline Adversarial Suite       ');
  console.log('================================================================\n');

  const suite = new AdversarialSuite('Milestone 3 Stress Tests');

  // --------------------------------------------------------------------------
  // Group 1: Cinematography Presets Pathological Inputs & Null Safety
  // --------------------------------------------------------------------------
  console.log('▸ Group 1: Cinematography Presets Pathological Inputs & Null Safety');

  suite.test('1.1: Orbit trajectory handles radius = 0, negative, NaN, and Infinity with safe fallback', () => {
    for (const badRadius of [0, -50, NaN, Infinity, -Infinity]) {
      const kfs = generateOrbitKeyframes({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 20.0,
        radius: badRadius,
      });
      assert.ok(Array.isArray(kfs));
      assert.ok(kfs.length >= 2);
      for (const kf of kfs) {
        assert.ok(Number.isFinite(kf.lat), 'lat is finite');
        assert.ok(Number.isFinite(kf.lon), 'lon is finite');
        assert.ok(Number.isFinite(kf.altitude), 'altitude is finite');
        assert.ok(Number.isFinite(kf.heading), 'heading is finite');
        assert.ok(Number.isFinite(kf.time), 'time is finite');
      }
    }
  });

  suite.test('1.2: Fly-by trajectory handles non-positive duration and invalid keyframe count', () => {
    for (const badDuration of [0, -10, NaN, Infinity]) {
      const kfs = generateFlyByKeyframes({
        centerLat: 48.8584,
        centerLon: 2.2945,
        baseAltitude: 35.0,
        radius: 60.0,
        durationSeconds: badDuration,
        keyframeCount: 0, // Should clamp to >= 2
      });
      assert.ok(kfs.length >= 2);
      assert.equal(kfs[0].time, 0);
      assert.ok(kfs[kfs.length - 1].time > 0);
      assert.ok(Number.isFinite(kfs[kfs.length - 1].time));
    }
  });

  suite.test('1.3: Spiral Reveal trajectory handles zero revolutions and negative base elevation', () => {
    const kfs = generateSpiralRevealKeyframes({
      centerLat: 31.5,
      centerLon: 35.5,
      baseAltitude: -415.0, // Dead Sea
      radius: 40.0,
      revolutions: 0, // Should fallback to safe default
    });
    assert.ok(kfs.length >= 2);
    // Verifies positive vertical climb even from negative altitudes
    assert.ok(kfs[kfs.length - 1].altitude > kfs[0].altitude);
    for (const kf of kfs) {
      assert.ok(Number.isFinite(kf.altitude));
      assert.ok(kf.pitch >= -85 && kf.pitch <= 0);
    }
  });

  // --------------------------------------------------------------------------
  // Group 2: Geodetic Singularity & Boundary Conditions
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 2: Geodetic Singularity & Boundary Conditions');

  suite.test('2.1: Orbit trajectory at North Pole (+90°) avoids cosine singularity (cos 90 = 0)', () => {
    const kfs = generateOrbitKeyframes({
      centerLat: 90.0,
      centerLon: 0.0,
      baseAltitude: 100.0,
      radius: 50.0,
    });
    assert.ok(kfs.length >= 2);
    for (const kf of kfs) {
      assert.ok(!Number.isNaN(kf.lat), 'lat not NaN');
      assert.ok(!Number.isNaN(kf.lon), 'lon not NaN');
      assert.ok(Number.isFinite(kf.lat), 'lat finite');
      assert.ok(Number.isFinite(kf.lon), 'lon finite');
    }
  });

  suite.test('2.2: Orbit trajectory at South Pole (-90°) avoids cosine singularity', () => {
    const kfs = generateOrbitKeyframes({
      centerLat: -90.0,
      centerLon: 0.0,
      baseAltitude: 2800.0,
      radius: 80.0,
    });
    assert.ok(kfs.length >= 2);
    for (const kf of kfs) {
      assert.ok(Number.isFinite(kf.lat));
      assert.ok(Number.isFinite(kf.lon));
    }
  });

  suite.test('2.3: Trajectory near Antimeridian (lon = 180° / -180°) produces valid coordinates', () => {
    const kfs = generateOrbitKeyframes({
      centerLat: -16.5,
      centerLon: 179.999, // Fiji / Antimeridian
      baseAltitude: 10.0,
      radius: 100.0,
    });
    assert.ok(kfs.length >= 2);
    for (const kf of kfs) {
      assert.ok(Number.isFinite(kf.lat));
      assert.ok(Number.isFinite(kf.lon));
    }
  });

  // --------------------------------------------------------------------------
  // Group 3: Shortest-Angular-Path Heading Wrapping & Interpolation Invariants
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 3: Shortest-Angular-Path Heading Wrapping & Interpolation Invariants');

  // Exact function from StudioModeUI.tsx
  function interpolatePose(time, kfs) {
    if (!kfs || kfs.length === 0) return null;
    if (kfs.length === 1) {
      return {
        lat: kfs[0].lat,
        lon: kfs[0].lon,
        altitude: kfs[0].altitude,
        heading: kfs[0].heading,
        pitch: kfs[0].pitch ?? -15,
        roll: kfs[0].roll ?? 0,
      };
    }

    const t = Math.max(0, time);

    if (t <= kfs[0].time) {
      return {
        lat: kfs[0].lat,
        lon: kfs[0].lon,
        altitude: kfs[0].altitude,
        heading: kfs[0].heading,
        pitch: kfs[0].pitch ?? -15,
        roll: kfs[0].roll ?? 0,
      };
    }

    const last = kfs[kfs.length - 1];
    if (t >= last.time) {
      return {
        lat: last.lat,
        lon: last.lon,
        altitude: last.altitude,
        heading: last.heading,
        pitch: last.pitch ?? -15,
        roll: last.roll ?? 0,
      };
    }

    for (let i = 0; i < kfs.length - 1; i++) {
      const k0 = kfs[i];
      const k1 = kfs[i + 1];
      if (t >= k0.time && t <= k1.time) {
        const dt = k1.time - k0.time;
        const frac = dt === 0 ? 0 : (t - k0.time) / dt;

        // Shortest angle heading interpolation
        let diff = (k1.heading - k0.heading) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        let heading = (k0.heading + diff * frac) % 360;
        if (heading < 0) heading += 360;

        const pitch = (k0.pitch ?? -15) + ((k1.pitch ?? -15) - (k0.pitch ?? -15)) * frac;
        const roll = (k0.roll ?? 0) + ((k1.roll ?? 0) - (k0.roll ?? 0)) * frac;

        return {
          lat: k0.lat + (k1.lat - k0.lat) * frac,
          lon: k0.lon + (k1.lon - k0.lon) * frac,
          altitude: k0.altitude + (k1.altitude - k0.altitude) * frac,
          heading,
          pitch,
          roll,
        };
      }
    }

    return kfs[0];
  }

  suite.test('3.1: Shortest angle heading wraps 350° -> 10° via 0° (20° turn, not 340° spin)', () => {
    const kfs = [
      { id: '1', time: 0, lat: 0, lon: 0, altitude: 100, heading: 350 },
      { id: '2', time: 10, lat: 0, lon: 0, altitude: 100, heading: 10 },
    ];
    // Midpoint at t=5 should be heading 0° (or 360°)
    const pose = interpolatePose(5, kfs);
    assert.ok(pose);
    assert.ok(Math.abs(pose.heading - 0) < 1e-4 || Math.abs(pose.heading - 360) < 1e-4, `Midpoint heading is 0, got ${pose.heading}`);
  });

  suite.test('3.2: Shortest angle heading wraps 10° -> 350° via 0° (counter-clockwise 20° turn)', () => {
    const kfs = [
      { id: '1', time: 0, lat: 0, lon: 0, altitude: 100, heading: 10 },
      { id: '2', time: 10, lat: 0, lon: 0, altitude: 100, heading: 350 },
    ];
    const pose = interpolatePose(5, kfs);
    assert.ok(pose);
    assert.ok(Math.abs(pose.heading - 0) < 1e-4 || Math.abs(pose.heading - 360) < 1e-4);
  });

  suite.test('3.3: Interpolate with identical adjacent keyframe timestamps (dt=0) avoids NaN', () => {
    const kfs = [
      { id: '1', time: 5, lat: 10, lon: 10, altitude: 50, heading: 90 },
      { id: '2', time: 5, lat: 20, lon: 20, altitude: 100, heading: 180 },
    ];
    const pose = interpolatePose(5, kfs);
    assert.ok(pose);
    assert.ok(Number.isFinite(pose.lat));
    assert.ok(Number.isFinite(pose.lon));
    assert.ok(Number.isFinite(pose.altitude));
    assert.ok(Number.isFinite(pose.heading));
  });

  suite.test('3.4: Interpolate with single keyframe returns that keyframe values safely', () => {
    const kfs = [
      { id: '1', time: 10, lat: 41.89, lon: 12.49, altitude: 75, heading: 45 },
    ];
    const pose = interpolatePose(0, kfs);
    assert.ok(pose);
    assert.equal(pose.lat, 41.89);
    assert.equal(pose.heading, 45);
  });

  suite.test('3.5: Interpolate with empty keyframes array returns null safely', () => {
    assert.equal(interpolatePose(5, []), null);
    assert.equal(interpolatePose(5, null), null);
  });

  // --------------------------------------------------------------------------
  // Group 4: Smooth Animation Scrubbing & Keyframe Continuity
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 4: Smooth Animation Scrubbing & Keyframe Continuity');

  suite.test('4.1: Continuous 1000-step scrub of 360° Orbit has continuous delta distances', () => {
    const orbit = generateOrbitKeyframes({
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 24.5,
      radius: 75.0,
      durationSeconds: 20,
      keyframeCount: 16,
    });

    let prevPose = interpolatePose(0, orbit);
    let maxJumpMeters = 0;

    for (let step = 1; step <= 1000; step++) {
      const t = (step / 1000) * 20;
      const pose = interpolatePose(t, orbit);

      const dLatMeters = (pose.lat - prevPose.lat) * 111320.0;
      const dLonMeters = (pose.lon - prevPose.lon) * 111320.0 * Math.cos(toRadians(41.8902));
      const jumpMeters = Math.sqrt(dLatMeters ** 2 + dLonMeters ** 2);

      if (jumpMeters > maxJumpMeters) {
        maxJumpMeters = jumpMeters;
      }
      prevPose = pose;
    }

    // Over 1000 steps of a 20s orbit (circumference ~ 2*PI*135m ≈ 848m),
    // average step is ~0.85m. Max jump should be well under 5.0m.
    assert.ok(maxJumpMeters < 3.0, `Max jump between steps is ${maxJumpMeters.toFixed(2)}m (must be < 3.0m)`);
  });

  suite.test('4.2: Closed-loop orbit keyframe 0 and keyframe last match position within 0.01m', () => {
    const orbit = generateOrbitKeyframes({
      centerLat: 35.6762, // Tokyo
      centerLon: 139.6503,
      baseAltitude: 40.0,
      radius: 120.0,
      durationSeconds: 30,
      keyframeCount: 32,
    });

    const kfStart = orbit[0];
    const kfEnd = orbit[orbit.length - 1];

    const dLatMeters = Math.abs(kfStart.lat - kfEnd.lat) * 111320.0;
    const dLonMeters = Math.abs(kfStart.lon - kfEnd.lon) * 111320.0 * Math.cos(toRadians(35.6762));
    const distMeters = Math.sqrt(dLatMeters ** 2 + dLonMeters ** 2);

    assert.ok(distMeters < 0.01, `Loop closure distance is ${distMeters.toFixed(4)}m (must be < 0.01m)`);
    assert.equal(kfStart.heading, kfEnd.heading, 'Headings match exactly');
  });

  suite.test('4.3: Fly-by tangential closest approach matches exactly 1.5x model radius', () => {
    const radius = 80.0;
    const flyby = generateFlyByKeyframes({
      centerLat: 51.5074, // London
      centerLon: -0.1278,
      baseAltitude: 15.0,
      radius,
      durationSeconds: 15,
      keyframeCount: 9,
    });

    const midKf = flyby[4]; // Midpoint
    const dLat = (midKf.lat - 51.5074) * 111320.0;
    const dLon = (midKf.lon - (-0.1278)) * 111320.0 * Math.cos(toRadians(51.5074));
    const distance = Math.sqrt(dLat ** 2 + dLon ** 2);

    const expected = radius * 1.5; // 120m
    assert.ok(Math.abs(distance - expected) < 1.0, `Closest approach is ${distance.toFixed(2)}m (expected ${expected}m)`);
  });

  // Summary
  console.log('\n================================================================');
  console.log('  MILESTONE 3 ADVERSARIAL STRESS SUMMARY');
  console.log('================================================================');
  console.log(`  Total Test Cases : ${suite.total}`);
  console.log(`  Passed           : \x1b[32m${suite.passed}\x1b[0m`);
  console.log(`  Failed           : ${suite.failed > 0 ? `\x1b[31m${suite.failed}\x1b[0m` : '0'}`);
  console.log('================================================================\n');

  if (suite.failed > 0) {
    console.error(`❌ M3 ADVERSARIAL SUITE FAILED with ${suite.failed} errors.\n`);
    process.exit(1);
  } else {
    console.log('✅ ALL M3 ADVERSARIAL TESTS PASSED (100% pass rate).\n');
    process.exit(0);
  }
}

runM3AdversarialTests().catch((err) => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
