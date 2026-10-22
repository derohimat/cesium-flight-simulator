/**
/**
 * Empirical Adversarial Stress Test Suite for Milestone 3:
 * Cinematography Presets & Timeline Integration
 *
 * Challenger: challenger_m3
 *
 * Verifies:
 * 1. CinematographyPresets radius fuzzing (0, negative, sub-meter, extreme, non-finite)
 * 2. CinematographyPresets coordinate fuzzing (Poles ±90°, Antimeridian ±180°, Dead Sea -430m, Everest)
 * 3. Monotonic timestamps, finite coordinates, heading in [0, 360), clearance >= 10m
 * 4. Timeline shortest-path 360° heading wrap interpolation (no 340° back-spins)
 * 5. Timeline keyframe structure edge cases (empty, single, duplicate timestamps, out-of-bounds seeking)
 * 6. Continuous playback smoothness across full preset trajectories
 * 7. LocationLibrary & StudioModeUI integration points
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateOrbitKeyframes,
  generateFlyByKeyframes,
  generateSpiralRevealKeyframes,
  normalizeHeading,
  toRadians,
  toDegrees,
  cinematographyPresets,
  type PresetOptions,
} from '../packages/web/src/services/cinematography/CinematographyPresets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Dynamically extract the exact `interpolatePose` function from StudioModeUI.tsx
const studioModeUIPath = path.join(rootDir, 'packages/web/src/react/layouts/StudioModeUI.tsx');
const studioModeUISrc = fs.readFileSync(studioModeUIPath, 'utf8');

import ts from '../packages/web/node_modules/typescript/lib/typescript.js';

// Extract interpolatePose function body from lines 17-87
const fnMatch = studioModeUISrc.match(/function interpolatePose\([\s\S]*?\n\}/);
if (!fnMatch) {
  throw new Error('Could not find interpolatePose function in StudioModeUI.tsx');
}

const tsCode = fnMatch[0];
const jsCode = ts.transpileModule(tsCode, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const evalContext = new Function(`${jsCode}\nreturn interpolatePose;`);
const interpolatePose = evalContext();

class StressSuite {
  name: string;
  total = 0;
  passed = 0;
  failed = 0;
  errors: { desc: string; error: Error }[] = [];

  constructor(name: string) {
    this.name = name;
  }

  test(desc: string, fn: () => void) {
    this.total++;
    try {
      fn();
      this.passed++;
      console.log(`  ✓ ${desc}`);
    } catch (err: any) {
      this.failed++;
      this.errors.push({ desc, error: err });
      console.error(`  ✗ ${desc}`);
      console.error(`    Error: ${err.message}`);
    }
  }

  summary() {
    console.log('\n================================================================');
    console.log(`  ${this.name} Results: ${this.passed}/${this.total} passed (${this.failed} failed)`);
    console.log('================================================================\n');
    if (this.failed > 0) {
      console.error('FAILURES:');
      for (const f of this.errors) {
        console.error(`- ${f.desc}: ${f.error.message}`);
      }
    }
    return this.failed === 0;
  }
}

const suite = new StressSuite('Milestone 3 Cinematography & Timeline Empirical Stress Suite');

console.log('Starting Milestone 3 Empirical Stress Testing...\n');

// -----------------------------------------------------------------------------
// SECTION 1: CinematographyPresets Radius Fuzzing
// -----------------------------------------------------------------------------
console.log('▸ Section 1: Radius Fuzzing across All Presets');

const testRadii = [
  0,
  -50,
  -1e-9,
  -1000,
  0.0001, // sub-millimeter
  0.1,    // sub-meter
  1.0,
  5.0,
  50.0,   // standard
  1000.0,
  50000.0, // 50km extreme
  NaN as any,
  Infinity as any,
  -Infinity as any,
  null as any,
  undefined as any,
];

for (const r of testRadii) {
  const rLabel = typeof r === 'number' && isNaN(r) ? 'NaN' : String(r);

  suite.test(`1.1 Orbit handles radius = ${rLabel} safely without NaN or zero clearance`, () => {
    const kfs = generateOrbitKeyframes({
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 22.0,
      radius: r,
    });

    assert.ok(Array.isArray(kfs));
    assert.ok(kfs.length >= 2, 'Must have at least 2 keyframes');

    // Verify all keyframes
    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i];
      assert.ok(Number.isFinite(kf.lat), `lat must be finite at index ${i}`);
      assert.ok(Number.isFinite(kf.lon), `lon must be finite at index ${i}`);
      assert.ok(Number.isFinite(kf.altitude), `altitude must be finite at index ${i}`);
      assert.ok(Number.isFinite(kf.heading), `heading must be finite at index ${i}`);
      assert.ok(kf.heading >= 0 && kf.heading < 360, `heading must be in [0, 360), got ${kf.heading}`);
      assert.ok(Number.isFinite(kf.pitch), `pitch must be finite at index ${i}`);
      assert.ok(Number.isFinite(kf.time), `time must be finite at index ${i}`);
      if (i > 0) {
        assert.ok(kf.time >= kfs[i - 1].time, `time must be non-decreasing at index ${i}`);
      }
    }

    // Verify minimum clearance: camera altitude must be strictly above base altitude
    assert.ok(kfs[0].altitude >= 22.0 + 10.0 * 0.4, 'Must enforce safe minimum vertical clearance');

    // Verify closed-loop orbit: kf[0] and kf[last] positions must match closely
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    assert.ok(Math.abs(first.lat - last.lat) < 1e-4, 'Orbit start/end lat must match');
    assert.ok(Math.abs(first.lon - last.lon) < 1e-4, 'Orbit start/end lon must match');
    assert.strictEqual(first.heading, last.heading, 'Orbit start/end heading must match');
  });

  suite.test(`1.2 Fly-by handles radius = ${rLabel} safely without NaN`, () => {
    const kfs = generateFlyByKeyframes({
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 22.0,
      radius: r,
    });

    assert.ok(Array.isArray(kfs));
    assert.ok(kfs.length >= 2);

    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i];
      assert.ok(Number.isFinite(kf.lat));
      assert.ok(Number.isFinite(kf.lon));
      assert.ok(Number.isFinite(kf.altitude));
      assert.ok(Number.isFinite(kf.heading));
      assert.ok(kf.heading >= 0 && kf.heading < 360, `heading must be [0, 360), got ${kf.heading}`);
      assert.ok(Number.isFinite(kf.pitch));
      assert.ok(Number.isFinite(kf.time));
    }
  });

  suite.test(`1.3 Spiral Reveal handles radius = ${rLabel} safely without NaN`, () => {
    const kfs = generateSpiralRevealKeyframes({
      centerLat: 41.8902,
      centerLon: 12.4922,
      baseAltitude: 22.0,
      radius: r,
    });

    assert.ok(Array.isArray(kfs));
    assert.ok(kfs.length >= 2);

    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i];
      assert.ok(Number.isFinite(kf.lat));
      assert.ok(Number.isFinite(kf.lon));
      assert.ok(Number.isFinite(kf.altitude));
      assert.ok(Number.isFinite(kf.heading));
      assert.ok(kf.heading >= 0 && kf.heading < 360, `heading must be [0, 360), got ${kf.heading}`);
      assert.ok(Number.isFinite(kf.pitch));
      assert.ok(kf.pitch >= -85.0 && kf.pitch <= 0.0, `pitch must be clamped [-85, 0], got ${kf.pitch}`);
      assert.ok(Number.isFinite(kf.time));
      if (i > 0) {
        assert.ok(kf.altitude >= kfs[i - 1].altitude, 'Spiral altitude must ascend monotonically');
      }
    }
  });
}

// -----------------------------------------------------------------------------
// SECTION 2: Coordinate Fuzzing (Poles, Antimeridian, Dead Sea, Everest)
// -----------------------------------------------------------------------------
console.log('\n▸ Section 2: Extreme Coordinate & Elevation Fuzzing');

const extremeCoordinates = [
  { desc: 'North Pole exact (+90°)', lat: 90.0, lon: 0.0, alt: 10.0 },
  { desc: 'North Pole antimeridian (+90°, 180°)', lat: 90.0, lon: 180.0, alt: 0.0 },
  { desc: 'North Pole near-boundary (+89.99999°)', lat: 89.99999, lon: 45.0, alt: 5.0 },
  { desc: 'South Pole exact (-90°)', lat: -90.0, lon: 0.0, alt: 2800.0 },
  { desc: 'South Pole antimeridian (-90°, -180°)', lat: -90.0, lon: -180.0, alt: 2800.0 },
  { desc: 'South Pole near-boundary (-89.99999°)', lat: -89.99999, lon: -120.0, alt: 2800.0 },
  { desc: 'Antimeridian positive (+180°)', lat: 0.0, lon: 180.0, alt: 0.0 },
  { desc: 'Antimeridian negative (-180°)', lat: 0.0, lon: -180.0, alt: 0.0 },
  { desc: 'Dead Sea sub-sea-level elevation (-430m)', lat: 31.5, lon: 35.5, alt: -430.0 },
  { desc: 'Mariana Trench extreme negative (-10994m)', lat: 11.35, lon: 142.2, alt: -10994.0 },
  { desc: 'Mount Everest peak elevation (+8848.86m)', lat: 27.9881, lon: 86.9250, alt: 8848.86 },
];

for (const coord of extremeCoordinates) {
  suite.test(`2.1 Orbit at ${coord.desc}: no division-by-zero, all finite`, () => {
    const kfs = generateOrbitKeyframes({
      centerLat: coord.lat,
      centerLon: coord.lon,
      baseAltitude: coord.alt,
      radius: 65.0,
    });

    assert.strictEqual(kfs.length, 16);
    for (const kf of kfs) {
      assert.ok(Number.isFinite(kf.lat), `lat must be finite`);
      assert.ok(Number.isFinite(kf.lon), `lon must be finite`);
      assert.ok(Number.isFinite(kf.altitude), `alt must be finite`);
      assert.ok(Number.isFinite(kf.heading), `heading must be finite`);
      assert.ok(kf.heading >= 0 && kf.heading < 360, `heading in [0, 360)`);
      if (coord.alt < 0) {
        assert.ok(kf.altitude > coord.alt, 'Camera altitude must stay above sub-sea-level terrain');
      }
    }
  });

  suite.test(`2.2 Fly-by at ${coord.desc}: all finite, valid tracking`, () => {
    const kfs = generateFlyByKeyframes({
      centerLat: coord.lat,
      centerLon: coord.lon,
      baseAltitude: coord.alt,
      radius: 65.0,
    });

    assert.strictEqual(kfs.length, 9);
    for (const kf of kfs) {
      assert.ok(Number.isFinite(kf.lat));
      assert.ok(Number.isFinite(kf.lon));
      assert.ok(Number.isFinite(kf.altitude));
      assert.ok(Number.isFinite(kf.heading));
      assert.ok(kf.heading >= 0 && kf.heading < 360);
    }
  });

  suite.test(`2.3 Spiral Reveal at ${coord.desc}: all finite, positive ascent`, () => {
    const kfs = generateSpiralRevealKeyframes({
      centerLat: coord.lat,
      centerLon: coord.lon,
      baseAltitude: coord.alt,
      radius: 65.0,
    });

    assert.strictEqual(kfs.length, 16);
    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i];
      assert.ok(Number.isFinite(kf.lat));
      assert.ok(Number.isFinite(kf.lon));
      assert.ok(Number.isFinite(kf.altitude));
      assert.ok(Number.isFinite(kf.heading));
      assert.ok(kf.heading >= 0 && kf.heading < 360);
      if (i > 0) {
        assert.ok(kf.altitude > kfs[i - 1].altitude, 'Ascent must be strictly positive');
      }
    }
  });
}

// -----------------------------------------------------------------------------
// SECTION 3: Duration, KeyframeCount, Revolutions Fuzzing
// -----------------------------------------------------------------------------
console.log('\n▸ Section 3: Duration, Keyframe Count, and Parameter Fuzzing');

const countTests = [
  { duration: 0, count: 0, revs: 0 },
  { duration: -15, count: -5, revs: -1 },
  { duration: 0.5, count: 2, revs: 0.1 },
  { duration: 86400, count: 200, revs: 10 },
  { duration: NaN as any, count: undefined as any, revs: NaN as any },
  { duration: undefined as any, count: undefined as any, revs: undefined as any },
];

for (let i = 0; i < countTests.length; i++) {
  const p = countTests[i];
  suite.test(`3.${i + 1} Presets fallback gracefully with invalid duration/count/revs (case ${i + 1})`, () => {
    const orbit = generateOrbitKeyframes({
      centerLat: 45.0,
      centerLon: 10.0,
      baseAltitude: 100.0,
      radius: 50.0,
      durationSeconds: p.duration,
      keyframeCount: p.count,
    });
    assert.ok(orbit.length >= 2, 'Orbit keyframes must have at least 2 items');
    assert.ok(orbit[orbit.length - 1].time > 0, 'Duration must be positive');

    const spiral = generateSpiralRevealKeyframes({
      centerLat: 45.0,
      centerLon: 10.0,
      baseAltitude: 100.0,
      radius: 50.0,
      durationSeconds: p.duration,
      keyframeCount: p.count,
      revolutions: p.revs,
    });
    assert.ok(spiral.length >= 2);
    assert.ok(spiral[spiral.length - 1].time > 0);
  });
}

// -----------------------------------------------------------------------------
// SECTION 4: Timeline Pose Interpolation - 360° Heading Wrap-Around
// -----------------------------------------------------------------------------
console.log('\n▸ Section 4: Timeline Pose Interpolation - 360° Heading Wrap-Around');

suite.test('4.1 Clockwise crossing 350° -> 10° rotates shortest path through 0° (NOT 340° backwards)', () => {
  const kfs = [
    { id: 'k0', time: 0, lat: 45, lon: 10, altitude: 100, heading: 350, pitch: -15, roll: 0 },
    { id: 'k1', time: 10, lat: 45, lon: 10, altitude: 100, heading: 10, pitch: -15, roll: 0 },
  ];

  // At midpoint t = 5 (frac = 0.5), heading should be exactly 0° (or 360° % 360 = 0°)
  const mid = interpolatePose(5, kfs);
  assert.ok(mid);
  assert.strictEqual(Math.round(mid.heading), 0, `Midpoint must be 0°, got ${mid.heading}`);

  // Test dense sampling (1000 steps)
  for (let s = 0; s <= 1000; s++) {
    const t = (s / 1000) * 10;
    const pose = interpolatePose(t, kfs);
    assert.ok(pose);
    assert.ok(pose.heading >= 0 && pose.heading < 360, `Heading must be [0, 360), got ${pose.heading}`);

    // The heading must stay strictly in the arc [350, 360) U [0, 10]
    const inArc = pose.heading >= 350 || pose.heading <= 10;
    assert.ok(inArc, `Heading at t=${t} took long path! Value: ${pose.heading}`);
  }
});

suite.test('4.2 Counter-clockwise crossing 10° -> 350° rotates shortest path through 0° (NOT 340° forwards)', () => {
  const kfs = [
    { id: 'k0', time: 0, lat: 45, lon: 10, altitude: 100, heading: 10, pitch: -15, roll: 0 },
    { id: 'k1', time: 10, lat: 45, lon: 10, altitude: 100, heading: 350, pitch: -15, roll: 0 },
  ];

  const mid = interpolatePose(5, kfs);
  assert.ok(mid);
  assert.strictEqual(Math.round(mid.heading), 0, `Midpoint must be 0°, got ${mid.heading}`);

  // Test dense sampling
  for (let s = 0; s <= 1000; s++) {
    const t = (s / 1000) * 10;
    const pose = interpolatePose(t, kfs);
    assert.ok(pose);
    assert.ok(pose.heading >= 0 && pose.heading < 360);

    const inArc = pose.heading <= 10 || pose.heading >= 350;
    assert.ok(inArc, `Heading at t=${t} took long path! Value: ${pose.heading}`);
  }
});

suite.test('4.3 Boundary crossing 359° -> 1° and 1° -> 359°', () => {
  const kfs1 = [
    { id: 'k0', time: 0, lat: 45, lon: 10, altitude: 100, heading: 359, pitch: 0, roll: 0 },
    { id: 'k1', time: 10, lat: 45, lon: 10, altitude: 100, heading: 1, pitch: 0, roll: 0 },
  ];
  const mid1 = interpolatePose(5, kfs1);
  assert.ok(mid1);
  assert.strictEqual(Math.round(mid1.heading), 0, `Midpoint must be 0°, got ${mid1.heading}`);

  const kfs2 = [
    { id: 'k0', time: 0, lat: 45, lon: 10, altitude: 100, heading: 1, pitch: 0, roll: 0 },
    { id: 'k1', time: 10, lat: 45, lon: 10, altitude: 100, heading: 359, pitch: 0, roll: 0 },
  ];
  const mid2 = interpolatePose(5, kfs2);
  assert.ok(mid2);
  assert.strictEqual(Math.round(mid2.heading), 0, `Midpoint must be 0°, got ${mid2.heading}`);
});

suite.test('4.4 Non-wrapping rotation 170° -> 190° rotates through 180°', () => {
  const kfs = [
    { id: 'k0', time: 0, lat: 45, lon: 10, altitude: 100, heading: 170, pitch: 0, roll: 0 },
    { id: 'k1', time: 10, lat: 45, lon: 10, altitude: 100, heading: 190, pitch: 0, roll: 0 },
  ];
  const mid = interpolatePose(5, kfs);
  assert.ok(mid);
  assert.strictEqual(Math.round(mid.heading), 180, `Midpoint must be 180°, got ${mid.heading}`);
});

suite.test('4.5 Identical headings (270° -> 270°) remain static at 270°', () => {
  const kfs = [
    { id: 'k0', time: 0, lat: 45, lon: 10, altitude: 100, heading: 270, pitch: 0, roll: 0 },
    { id: 'k1', time: 10, lat: 45, lon: 10, altitude: 100, heading: 270, pitch: 0, roll: 0 },
  ];
  const mid = interpolatePose(5, kfs);
  assert.ok(mid);
  assert.strictEqual(mid.heading, 270);
});

// -----------------------------------------------------------------------------
// SECTION 5: Timeline Keyframe Structural Stress Cases
// -----------------------------------------------------------------------------
console.log('\n▸ Section 5: Timeline Keyframe Structural Stress Cases');

suite.test('5.1 Empty keyframes array returns null safely', () => {
  assert.strictEqual(interpolatePose(0, []), null);
  assert.strictEqual(interpolatePose(10, []), null);
  assert.strictEqual(interpolatePose(-5, []), null);
  assert.strictEqual(interpolatePose(null as any, []), null);
});

suite.test('5.2 Single keyframe returns that keyframe without error for any seek time', () => {
  const single = [{ id: 'k0', time: 5, lat: 40, lon: 15, altitude: 250, heading: 90, pitch: -10, roll: 2 }];
  const seekTimes = [-100, 0, 2.5, 5, 10, 9999];
  for (const t of seekTimes) {
    const pose = interpolatePose(t, single);
    assert.ok(pose);
    assert.strictEqual(pose.lat, 40);
    assert.strictEqual(pose.lon, 15);
    assert.strictEqual(pose.altitude, 250);
    assert.strictEqual(pose.heading, 90);
    assert.strictEqual(pose.pitch, -10);
    assert.strictEqual(pose.roll, 2);
  }
});

suite.test('5.3 Duplicate timestamps between adjacent keyframes (dt = 0)', () => {
  const duplicates = [
    { id: 'k0', time: 5, lat: 10, lon: 20, altitude: 100, heading: 45, pitch: -10, roll: 0 },
    { id: 'k1', time: 5, lat: 30, lon: 40, altitude: 200, heading: 90, pitch: -20, roll: 0 },
  ];
  // Seeking to t = 5
  const pose = interpolatePose(5, duplicates);
  assert.ok(pose);
  assert.ok(Number.isFinite(pose.lat));
  assert.ok(Number.isFinite(pose.lon));
  assert.ok(Number.isFinite(pose.altitude));
  assert.ok(Number.isFinite(pose.heading));
});

suite.test('5.4 Triple duplicate timestamps at same second', () => {
  const triplets = [
    { id: 'k0', time: 2, lat: 10, lon: 20, altitude: 50, heading: 0, pitch: 0, roll: 0 },
    { id: 'k1', time: 2, lat: 20, lon: 30, altitude: 100, heading: 90, pitch: 0, roll: 0 },
    { id: 'k2', time: 2, lat: 30, lon: 40, altitude: 150, heading: 180, pitch: 0, roll: 0 },
  ];
  const pose = interpolatePose(2, triplets);
  assert.ok(pose);
  assert.ok(Number.isFinite(pose.lat));
  assert.ok(Number.isFinite(pose.heading));
});

suite.test('5.5 Seeking outside keyframe bounds clamps cleanly to endpoints', () => {
  const kfs = [
    { id: 'k0', time: 2, lat: 10, lon: 10, altitude: 100, heading: 0, pitch: -10, roll: 0 },
    { id: 'k1', time: 8, lat: 20, lon: 20, altitude: 200, heading: 180, pitch: -20, roll: 0 },
  ];

  // Before first keyframe
  const before = interpolatePose(-10, kfs);
  assert.ok(before);
  assert.strictEqual(before.lat, 10);
  assert.strictEqual(before.altitude, 100);

  // After last keyframe
  const after = interpolatePose(100, kfs);
  assert.ok(after);
  assert.strictEqual(after.lat, 20);
  assert.strictEqual(after.altitude, 200);
});

suite.test('5.6 Exact keyframe hit returns exact values', () => {
  const kfs = [
    { id: 'k0', time: 0, lat: 11.11, lon: 22.22, altitude: 33.33, heading: 44.44, pitch: -15, roll: 0 },
    { id: 'k1', time: 10, lat: 55.55, lon: 66.66, altitude: 77.77, heading: 88.88, pitch: -25, roll: 0 },
  ];
  const p0 = interpolatePose(0, kfs);
  assert.ok(p0);
  assert.strictEqual(p0.lat, 11.11);
  assert.strictEqual(p0.lon, 22.22);
  assert.strictEqual(p0.altitude, 33.33);
  assert.strictEqual(p0.heading, 44.44);

  const p1 = interpolatePose(10, kfs);
  assert.ok(p1);
  assert.strictEqual(p1.lat, 55.55);
  assert.strictEqual(p1.lon, 66.66);
  assert.strictEqual(p1.altitude, 77.77);
  assert.strictEqual(p1.heading, 88.88);
});

// -----------------------------------------------------------------------------
// SECTION 6: Full Integration Scrubbing across Generated Preset Trajectories
// -----------------------------------------------------------------------------
console.log('\n▸ Section 6: Full Preset Generation Fed to Timeline Interpolation');

suite.test('6.1 360° Orbit keyframes scrubbed across 500 timeline steps remain smooth', () => {
  const orbitKfs = generateOrbitKeyframes({
    centerLat: 41.8902,
    centerLon: 12.4922,
    baseAltitude: 22.0,
    radius: 65.0,
    durationSeconds: 15.0,
    keyframeCount: 16,
  });

  const duration = orbitKfs[orbitKfs.length - 1].time;
  const steps = 500;
  let prevHeading: number | null = null;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    const pose = interpolatePose(t, orbitKfs);
    assert.ok(pose, `Pose at t=${t} must exist`);
    assert.ok(Number.isFinite(pose.lat));
    assert.ok(Number.isFinite(pose.lon));
    assert.ok(Number.isFinite(pose.altitude));
    assert.ok(Number.isFinite(pose.heading));
    assert.ok(pose.heading >= 0 && pose.heading < 360);

    if (prevHeading !== null) {
      // Angular difference between adjacent steps (dt = 0.03s) must be tiny (< 5°)
      let diff = Math.abs(pose.heading - prevHeading);
      if (diff > 180) diff = 360 - diff;
      assert.ok(diff < 5.0, `Step ${i} (t=${t}): heading delta is too large (${diff}°)`);
    }
    prevHeading = pose.heading;
  }
});

suite.test('6.2 Spiral Reveal keyframes scrubbed across 500 timeline steps show monotonic altitude ascent', () => {
  const spiralKfs = generateSpiralRevealKeyframes({
    centerLat: 41.8902,
    centerLon: 12.4922,
    baseAltitude: 22.0,
    radius: 65.0,
    durationSeconds: 18.0,
    keyframeCount: 20,
    revolutions: 2.0,
  });

  const duration = spiralKfs[spiralKfs.length - 1].time;
  const steps = 500;
  let prevAlt = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    const pose = interpolatePose(t, spiralKfs);
    assert.ok(pose);
    assert.ok(Number.isFinite(pose.altitude));
    assert.ok(pose.altitude >= prevAlt - 1e-6, `Altitude must ascend monotonically at step ${i}`);
    prevAlt = pose.altitude;
  }
});

// -----------------------------------------------------------------------------
// SECTION 7: LocationLibrary & StudioModeUI Code Inspection & Wiring
// -----------------------------------------------------------------------------
console.log('\n▸ Section 7: LocationLibrary & StudioModeUI Wiring Verification');

suite.test('7.1 LocationLibrary.tsx contains preset trigger buttons wired to onApplyCinematographyPreset', () => {
  const locLibPath = path.join(rootDir, 'packages/web/src/react/features/studio/components/LocationLibrary.tsx');
  const locLibSrc = fs.readFileSync(locLibPath, 'utf8');

  assert.ok(locLibSrc.includes('cinematographyPresets'), 'LocationLibrary must import/use cinematographyPresets');
  assert.ok(locLibSrc.includes('generateOrbitKeyframes') || locLibSrc.includes('cinematographyPresets.generateOrbitKeyframes'), 'Orbit button must be wired');
  assert.ok(locLibSrc.includes('generateFlyByKeyframes') || locLibSrc.includes('cinematographyPresets.generateFlyByKeyframes'), 'Fly-by button must be wired');
  assert.ok(locLibSrc.includes('generateSpiralRevealKeyframes') || locLibSrc.includes('cinematographyPresets.generateSpiralRevealKeyframes'), 'Spiral button must be wired');
  assert.ok(locLibSrc.includes('onApplyCinematographyPreset'), 'Callback onApplyCinematographyPreset must be invoked');
});

suite.test('7.2 StudioModeUI.tsx renders FlightTimeline with complete playback and scrubbing controls', () => {
  assert.ok(studioModeUISrc.includes('<FlightTimeline'), 'StudioModeUI must render <FlightTimeline');
  assert.ok(studioModeUISrc.includes('keyframes='), 'FlightTimeline must receive keyframes prop');
  assert.ok(studioModeUISrc.includes('currentTime='), 'FlightTimeline must receive currentTime prop');
  assert.ok(studioModeUISrc.includes('onSeek='), 'FlightTimeline must receive onSeek prop');
  assert.ok(studioModeUISrc.includes('onPlayPreview='), 'FlightTimeline must receive onPlayPreview prop');
  assert.ok(studioModeUISrc.includes('onStopPreview='), 'FlightTimeline must receive onStopPreview prop');
  assert.ok(studioModeUISrc.includes('isCollapsed='), 'FlightTimeline must receive isCollapsed prop');
  assert.ok(studioModeUISrc.includes('onToggleCollapse='), 'FlightTimeline must receive onToggleCollapse prop');
  assert.ok(studioModeUISrc.includes('handleApplyCinematographyPreset'), 'StudioModeUI must wire preset application');
});

// Run summary and exit
const allPassed = suite.summary();
if (!allPassed) {
  process.exit(1);
} else {
  console.log('🎉 ALL Milestone 3 Adversarial Stress Tests PASSED!\n');
}
