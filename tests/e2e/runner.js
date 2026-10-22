#!/usr/bin/env node

/**
 * Centralized Executable Test Runner for Opaque-Box E2E Tests
 * Covers Tiers 1-4 (>= 173 test cases) for Aleph 3D Capture Importer & Custom Scenery.
 *
 * Usage:
 *   node tests/e2e/runner.js
 *   node tests/e2e/runner.js --tier=1
 *   node tests/e2e/runner.js --tier=2
 *   node tests/e2e/runner.js --tier=3
 *   node tests/e2e/runner.js --tier=4
 */

import { TestContext } from './helpers/testContext.js';

// Tier 1 Tests
import { registerF01Tests } from './tier1/f01_glb_parsing.test.js';
import { registerF02Tests } from './tier1/f02_drag_drop.test.js';
import { registerF03Tests } from './tier1/f03_storage.test.js';
import { registerF04Tests } from './tier1/f04_sample.test.js';
import { registerF05Tests } from './tier1/f05_library.test.js';
import { registerF06Tests } from './tier1/f06_placement.test.js';
import { registerF07Tests } from './tier1/f07_altitude.test.js';
import { registerF08Tests } from './tier1/f08_heading.test.js';
import { registerF09Tests } from './tier1/f09_scale.test.js';
import { registerF10Tests } from './tier1/f10_isolation.test.js';
import { registerF11Tests } from './tier1/f11_orbit.test.js';
import { registerF12Tests } from './tier1/f12_flyby.test.js';
import { registerF13Tests } from './tier1/f13_spiral.test.js';
import { registerF14Tests } from './tier1/f14_timeline.test.js';
import { registerF15Tests } from './tier1/f15_build_regress.test.js';

// Tier 2 Tests
import { registerF01BoundaryTests } from './tier2/f01_glb_boundaries.test.js';
import { registerF02BoundaryTests } from './tier2/f02_drop_boundaries.test.js';
import { registerF03BoundaryTests } from './tier2/f03_storage_boundaries.test.js';
import { registerF04BoundaryTests } from './tier2/f04_sample_boundaries.test.js';
import { registerF05BoundaryTests } from './tier2/f05_library_boundaries.test.js';
import { registerF06BoundaryTests } from './tier2/f06_placement_boundaries.test.js';
import { registerF07BoundaryTests } from './tier2/f07_altitude_boundaries.test.js';
import { registerF08BoundaryTests } from './tier2/f08_heading_boundaries.test.js';
import { registerF09BoundaryTests } from './tier2/f09_scale_boundaries.test.js';
import { registerF10BoundaryTests } from './tier2/f10_isolation_boundaries.test.js';
import { registerF11BoundaryTests } from './tier2/f11_orbit_boundaries.test.js';
import { registerF12BoundaryTests } from './tier2/f12_flyby_boundaries.test.js';
import { registerF13BoundaryTests } from './tier2/f13_spiral_boundaries.test.js';
import { registerF14BoundaryTests } from './tier2/f14_timeline_boundaries.test.js';
import { registerF15BoundaryTests } from './tier2/f15_build_boundaries.test.js';

// Tier 3 Tests
import { registerTier3CrossFeatureTests } from './tier3/cross_feature.test.js';

// Tier 4 Tests
import { registerTier4RealWorldTests } from './tier4/real_world.test.js';

async function main() {
  const args = process.argv.slice(2);
  const tierArg = args.find((a) => a.startsWith('--tier='));
  const targetTier = tierArg ? parseInt(tierArg.split('=')[1], 10) : null;

  console.log('================================================================');
  console.log('  Aleph 3D Capture Importer & Custom Scenery Test Runner        ');
  console.log('  Integrity Mode: Opaque-Box E2E Test Suite (Tiers 1-4)        ');
  console.log('================================================================\n');

  const suite = new TestContext();

  const runTier1 = targetTier === null || targetTier === 1;
  const runTier2 = targetTier === null || targetTier === 2;
  const runTier3 = targetTier === null || targetTier === 3;
  const runTier4 = targetTier === null || targetTier === 4;

  if (runTier1) {
    registerF01Tests(suite);
    registerF02Tests(suite);
    registerF03Tests(suite);
    registerF04Tests(suite);
    registerF05Tests(suite);
    registerF06Tests(suite);
    registerF07Tests(suite);
    registerF08Tests(suite);
    registerF09Tests(suite);
    registerF10Tests(suite);
    registerF11Tests(suite);
    registerF12Tests(suite);
    registerF13Tests(suite);
    registerF14Tests(suite);
    registerF15Tests(suite);
  }

  if (runTier2) {
    registerF01BoundaryTests(suite);
    registerF02BoundaryTests(suite);
    registerF03BoundaryTests(suite);
    registerF04BoundaryTests(suite);
    registerF05BoundaryTests(suite);
    registerF06BoundaryTests(suite);
    registerF07BoundaryTests(suite);
    registerF08BoundaryTests(suite);
    registerF09BoundaryTests(suite);
    registerF10BoundaryTests(suite);
    registerF11BoundaryTests(suite);
    registerF12BoundaryTests(suite);
    registerF13BoundaryTests(suite);
    registerF14BoundaryTests(suite);
    registerF15BoundaryTests(suite);
  }

  if (runTier3) {
    registerTier3CrossFeatureTests(suite);
  }

  if (runTier4) {
    registerTier4RealWorldTests(suite);
  }

  const { stats, results } = await suite.run();

  // Print results
  for (const group of results) {
    console.log(`\n  ▸ ${group.name}`);
    for (const t of group.tests) {
      const mark = t.passed ? '✓' : '✗';
      const colorMark = t.passed ? `\x1b[32m${mark}\x1b[0m` : `\x1b[31m${mark}\x1b[0m`;
      console.log(`    ${colorMark} ${t.name} (${t.duration}ms)`);
      if (!t.passed && t.error) {
        console.error(`      \x1b[31mError:\x1b[0m ${t.error.message}`);
        if (t.error.stack) {
          const stackLine = t.error.stack.split('\n')[1] || '';
          console.error(`      ${stackLine}`);
        }
      }
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log('  TEST EXECUTION SUMMARY');
  console.log('----------------------------------------------------------------');
  console.log(`  Total Test Cases : ${stats.total}`);
  console.log(`  Passed           : \x1b[32m${stats.passed}\x1b[0m`);
  console.log(`  Failed           : ${stats.failed > 0 ? `\x1b[31m${stats.failed}\x1b[0m` : '0'}`);
  console.log(`  Total Assertions : ${stats.assertions}`);
  console.log(`  Total Duration   : ${stats.duration}ms`);
  console.log('----------------------------------------------------------------');

  if (stats.failed > 0) {
    console.error(`\n❌ TEST SUITE FAILED with ${stats.failed} failing tests.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ ALL ${stats.total} TESTS PASSED SUCCESSFULLY (100% pass rate).\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
