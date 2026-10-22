/**
 * Empirical Stress Test Suite for Milestone 2: Scenery Isolation & Clipping
 * Challenger: challenger_m2_2
 *
 * Tests:
 * 1. Clipping plane geometry (normals, distances, transforms, and clipping behavior analysis)
 * 2. Rapid on/off toggling (100 and 500 flips, memory cleanup, state consistency)
 * 3. Null tileset recovery (late tileset arrival, multiple tileset attach/detach)
 * 4. Scenery unload & clipping planes cleanup (clean removal, idempotency)
 * 5. UI state synchronization with IndexedDB persistence (sliders & Reset Defaults)
 * 6. Edge cases & boundary stress (extreme coordinates, zero/negative inputs, NaN protection)
 */

import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { CustomSceneryManager } from '../packages/web/src/cesium/managers/CustomSceneryManager.js';
import { SceneryStorageService } from '../packages/web/src/services/aleph/sceneryStorage.js';

class EmpiricalSuite {
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

async function runM2EmpiricalTests() {
  console.log('================================================================');
  console.log('  Milestone 2 Scenery Isolation Empirical Challenge Suite       ');
  console.log('================================================================\n');

  const suite = new EmpiricalSuite('Milestone 2 Stress Tests');

  // Helper to create a standard mock capture
  const createMockCapture = (overrides = {}) => ({
    id: 'test-capture-' + Math.random().toString(36).slice(2, 8),
    name: 'Colosseum Sample Test',
    lat: 41.89021,
    lon: 12.49223,
    baseAltitude: 24.0,
    altitudeOffset: 0,
    heading: 0,
    scale: 1.0,
    radius: 95.0,
    bounds: [41.889, 12.491, 41.891, 12.493],
    importedAt: Date.now(),
    isolationEnabled: true,
    ...overrides,
  });

  // Helper to create a mock Cesium3DTileset with proper clippingPlanes tracking
  const createMockTileset = () => {
    let destroyedCollections = [];
    let _clippingPlanes = undefined;
    return {
      get clippingPlanes() {
        return _clippingPlanes;
      },
      set clippingPlanes(val) {
        if (_clippingPlanes && _clippingPlanes !== val && typeof _clippingPlanes.destroy === 'function') {
          _clippingPlanes.destroy();
          destroyedCollections.push(_clippingPlanes);
        }
        _clippingPlanes = val;
      },
      getDestroyedCount() {
        return destroyedCollections.length;
      }
    };
  };

  // --------------------------------------------------------------------------
  // Group 1: Clipping Plane Geometry & Collection Creation
  // --------------------------------------------------------------------------
  console.log('▸ Group 1: Clipping Plane Geometry & Collection Creation');

  suite.test('1.1: Clipping planes collection is created with 4 vertical planes and correct normals', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;
    const capture = createMockCapture({ radius: 80.0 });
    mgr.activeCapture = capture;

    mgr.setIsolation(true);

    assert.equal(mgr.isolationEnabled, true);
    assert.equal(mgr.activePlanes.length, 4);
    assert.ok(mockTileset.clippingPlanes, 'Tileset assigned clipping collection');
    assert.equal(mockTileset.clippingPlanes.length, 4);

    // Verify normals: East (+1, 0, 0), West (-1, 0, 0), North (0, +1, 0), South (0, -1, 0)
    assert.deepEqual(mgr.activePlanes[0].normal, { x: 1, y: 0, z: 0 });
    assert.deepEqual(mgr.activePlanes[1].normal, { x: -1, y: 0, z: 0 });
    assert.deepEqual(mgr.activePlanes[2].normal, { x: 0, y: 1, z: 0 });
    assert.deepEqual(mgr.activePlanes[3].normal, { x: 0, y: -1, z: 0 });
  });

  suite.test('1.2: Clipping plane distance includes base radius, scale, margin, and altitude padding', () => {
    const mgr = new CustomSceneryManager();
    const capture = createMockCapture({ radius: 50.0 });
    mgr.activeCapture = capture;

    // Radius 50, scale 1.0, altitude offset 0
    // Expected effective radius = Math.max(50 * 1, 10.0) + 5.0 + 0 = 55.0 -> distance = -55.0
    mgr.setIsolation(true);
    assert.equal(mgr.activePlanes[0].distance, -55.0);

    // Radius 50, scale 2.0, altitude offset +30m
    // Scaled radius = 100, margin = 5, altitude padding = |30 * 0.1| = 3.0
    // Expected effective radius = 100 + 5 + 3 = 108.0 -> distance = -108.0
    mgr.updateTransform(30.0, 0, 2.0);
    assert.equal(mgr.activePlanes[0].distance, -108.0);

    // Negative altitude offset: -40m -> padding = 4.0
    mgr.updateTransform(-40.0, 0, 2.0);
    assert.equal(mgr.activePlanes[0].distance, -109.0);
  });

  suite.test('1.3: Safe minimum clipping radius enforced even if capture radius is 0 or negative', () => {
    const mgr = new CustomSceneryManager();
    const capture = createMockCapture({ radius: 0.0 });
    mgr.activeCapture = capture;

    mgr.setIsolation(true, 0.0);
    // Min radius 10.0 + 5.0 margin = 15.0 -> distance = -15.0
    assert.equal(mgr.activePlanes[0].distance, -15.0);
  });

  suite.test('1.4: ClippingPlaneCollection modelMatrix corresponds to EastNorthUp frame at target coordinates', () => {
    const mgr = new CustomSceneryManager();
    const capture = createMockCapture({ lat: 41.89021, lon: 12.49223, baseAltitude: 50.0, altitudeOffset: 10.0 });
    mgr.activeCapture = capture;
    mgr.currentAltitudeOffset = 10.0;

    mgr.setIsolation(true);
    const col = mgr.tilesetClippingCollection;
    assert.ok(col, 'Clipping collection created');
    assert.ok(col.modelMatrix, 'Model matrix set on collection');

    // Expected center Cartesian
    const expectedCenter = Cesium.Cartesian3.fromDegrees(12.49223, 41.89021, 60.0);
    const expectedMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(expectedCenter);

    for (let i = 0; i < 16; i++) {
      assert.ok(
        Math.abs(col.modelMatrix[i] - expectedMatrix[i]) < 1e-6,
        `Matrix element ${i} matches ENU frame`
      );
    }
  });

  suite.test('1.5: Empirical Shader Analysis: unionClippingRegions vs intersection clipping', () => {
    // Mathematical oracle for Cesium clipping plane evaluation:
    // In Cesium, clipPosition = -distance * normal = R * normal.
    // amount = dot(normal, position - clipPosition) = dot(normal, position) - R.
    // Cesium discards fragment if amount <= 0.
    const R = 80.0;
    const planes = [
      new Cesium.ClippingPlane(new Cesium.Cartesian3(1.0, 0.0, 0.0), -R),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(-1.0, 0.0, 0.0), -R),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(0.0, 1.0, 0.0), -R),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(0.0, -1.0, 0.0), -R),
    ];

    const evaluateCesiumClipping = (pos, unionMode) => {
      let anyClipped = false;
      let allClipped = true;
      for (const p of planes) {
        const clipPos = Cesium.Cartesian3.multiplyByScalar(p.normal, -p.distance, new Cesium.Cartesian3());
        const diff = Cesium.Cartesian3.subtract(pos, clipPos, new Cesium.Cartesian3());
        const amount = Cesium.Cartesian3.dot(p.normal, diff);
        const isClippedByPlane = amount <= 0.0;
        if (isClippedByPlane) anyClipped = true;
        allClipped = allClipped && isClippedByPlane;
      }
      return unionMode ? anyClipped : allClipped;
    };

    // Center of model (0, 0, 0)
    const center = new Cesium.Cartesian3(0, 0, 0);
    // Point inside well (40, 0, 0)
    const inside = new Cesium.Cartesian3(40, 0, 0);
    // Point on boundary (80, 0, 0)
    const boundary = new Cesium.Cartesian3(80, 0, 0);
    // Point outside well in background city (150, 0, 0)
    const outside = new Cesium.Cartesian3(150, 0, 0);
    // Distant mountain (2000, 2000, 0)
    const distant = new Cesium.Cartesian3(2000, 2000, 0);

    // In intersection mode (unionClippingRegions = false):
    assert.equal(evaluateCesiumClipping(center, false), true, 'Center clipped in intersect mode');
    assert.equal(evaluateCesiumClipping(inside, false), true, 'Inside clipped in intersect mode');
    assert.equal(evaluateCesiumClipping(boundary, false), true, 'Boundary clipped in intersect mode');
    assert.equal(evaluateCesiumClipping(outside, false), false, 'Outside city KEPT in intersect mode');
    assert.equal(evaluateCesiumClipping(distant, false), false, 'Distant mountain KEPT in intersect mode');

    // In union mode (unionClippingRegions = true, current worker setting):
    // Because outward normal + negative distance covers half-space x <= R for plane 0,
    // and x >= -R for plane 1, their union is the entire real space!
    const unionDistantDiscarded = evaluateCesiumClipping(distant, true);
    assert.equal(unionDistantDiscarded, true, 'Union mode discards distant points (covers full space)');
  });

  // --------------------------------------------------------------------------
  // Group 2: Rapid On/Off Toggling & Stress Stability
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 2: Rapid On/Off Toggling & Stress Stability');

  suite.test('2.1: 100 rapid sequential flips preserve state integrity and leave no dangling planes', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;
    mgr.activeCapture = createMockCapture();

    for (let i = 0; i < 100; i++) {
      mgr.setIsolation(i % 2 === 0);
    }

    // i=99: 99 % 2 !== 0 -> false
    assert.equal(mgr.isolationEnabled, false);
    assert.equal(mgr.activePlanes.length, 0);
    assert.equal(mockTileset.clippingPlanes, undefined);
    assert.equal(mgr.tilesetClippingCollection, null);
  });

  suite.test('2.2: 500 rapid alternating flips verify clean resource destruction', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;
    mgr.activeCapture = createMockCapture();

    for (let i = 0; i < 500; i++) {
      mgr.setIsolation(true);
      mgr.setIsolation(false);
    }

    assert.equal(mgr.isolationEnabled, false);
    assert.equal(mgr.activePlanes.length, 0);
    assert.equal(mockTileset.clippingPlanes, undefined);
    // Every time a new collection replaced the old one or was cleared, destroy was called
    assert.ok(mockTileset.getDestroyedCount() >= 500, 'All collections destroyed properly');
  });

  suite.test('2.3: Rapid interleaved transform updates and isolation toggles preserve numeric validity', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;
    mgr.activeCapture = createMockCapture();

    for (let i = 0; i < 100; i++) {
      const alt = ((i * 7) % 201) - 100; // -100 to +100
      const heading = (i * 37) % 360;
      const scale = 0.1 + ((i * 13) % 49) * 0.1;
      mgr.updateTransform(alt, heading, scale);
      mgr.setIsolation(i % 3 !== 0);

      assert.ok(Number.isFinite(mgr.getAltitudeOffset()));
      assert.ok(Number.isFinite(mgr.getHeading()));
      assert.ok(Number.isFinite(mgr.getScale()));
      if (mgr.isolationEnabled) {
        assert.ok(Number.isFinite(mgr.activePlanes[0].distance));
        assert.ok(mgr.activePlanes[0].distance < 0);
      }
    }
  });

  // --------------------------------------------------------------------------
  // Group 3: Null Tileset Recovery & Late Loading
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 3: Null Tileset Recovery & Late Loading');

  suite.test('3.1: setIsolation(true) executes safely when tileset is null', () => {
    const mgr = new CustomSceneryManager();
    mgr.tileset = null;
    mgr.activeCapture = createMockCapture();

    // Must not throw error
    assert.doesNotThrow(() => {
      mgr.setIsolation(true);
    });

    assert.equal(mgr.isolationEnabled, true);
    assert.equal(mgr.activePlanes.length, 4);
    assert.ok(mgr.tilesetClippingCollection);
  });

  suite.test('3.2: onTilesetLoaded smoothly attaches pre-configured clipping planes', () => {
    const mgr = new CustomSceneryManager();
    mgr.tileset = null;
    mgr.activeCapture = createMockCapture({ radius: 70.0 });

    mgr.setIsolation(true);

    const mockTileset = createMockTileset();
    mgr.onTilesetLoaded(mockTileset);

    assert.equal(mgr.tileset, mockTileset);
    assert.ok(mockTileset.clippingPlanes, 'Late-loaded tileset receives clipping planes');
    assert.equal(mockTileset.clippingPlanes.enabled, true);
    assert.equal(mgr.activePlanes[0].distance, -75.0);
  });

  suite.test('3.3: onTilesetLoaded does not enable clipping if isolation was OFF', () => {
    const mgr = new CustomSceneryManager();
    mgr.tileset = null;
    mgr.activeCapture = createMockCapture();

    mgr.setIsolation(false);

    const mockTileset = createMockTileset();
    mgr.onTilesetLoaded(mockTileset);

    assert.equal(mgr.isolationEnabled, false);
    assert.equal(mockTileset.clippingPlanes, undefined);
  });

  suite.test('3.4: Replacing tileset with a new tileset cleans up old tileset and attaches to new', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset1 = createMockTileset();
    mgr.tileset = mockTileset1;
    mgr.activeCapture = createMockCapture();
    mgr.setIsolation(true);

    assert.ok(mockTileset1.clippingPlanes);

    const mockTileset2 = createMockTileset();
    mgr.onTilesetLoaded(mockTileset2);

    assert.equal(mgr.tileset, mockTileset2);
    assert.ok(mockTileset2.clippingPlanes);
  });

  // --------------------------------------------------------------------------
  // Group 4: Scenery Unload & Clipping Planes Cleanup
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 4: Scenery Unload & Clipping Planes Cleanup');

  suite.test('4.1: unloadScenery cleanly removes clipping planes and resets state', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;
    mgr.activeCapture = createMockCapture();
    mgr.setIsolation(true);

    assert.ok(mockTileset.clippingPlanes);

    mgr.unloadScenery();

    assert.equal(mockTileset.clippingPlanes, undefined, 'tileset.clippingPlanes must be undefined');
    assert.equal(mgr.isolationEnabled, false, 'isolationEnabled must be false');
    assert.equal(mgr.activePlanes.length, 0, 'activePlanes must be empty');
    assert.equal(mgr.tilesetClippingCollection, null, 'tilesetClippingCollection must be null');
    assert.equal(mgr.getActiveCapture(), null, 'activeCapture must be null');
    assert.equal(mgr.getActiveBoundingSphere(), null, 'boundingSphere must be null');
  });

  suite.test('4.2: unloadScenery is strictly idempotent when called multiple times', () => {
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;
    mgr.activeCapture = createMockCapture();
    mgr.setIsolation(true);

    assert.doesNotThrow(() => {
      mgr.unloadScenery();
      mgr.unloadScenery();
      mgr.unloadScenery();
    });

    assert.equal(mockTileset.clippingPlanes, undefined);
    assert.equal(mgr.isolationEnabled, false);
  });

  suite.test('4.3: unloadScenery cleans up without tileset attached', () => {
    const mgr = new CustomSceneryManager();
    mgr.tileset = null;
    mgr.activeCapture = createMockCapture();
    mgr.setIsolation(true);

    assert.doesNotThrow(() => {
      mgr.unloadScenery();
    });

    assert.equal(mgr.isolationEnabled, false);
    assert.equal(mgr.activePlanes.length, 0);
  });

  // --------------------------------------------------------------------------
  // Group 5: UI State Synchronization with IndexedDB Persistence
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 5: UI State Synchronization with IndexedDB Persistence');

  const storage = new SceneryStorageService();

  suite.asyncTest('5.1: Storage initialization and capture seeding', async () => {
    await storage.init();
    const capture = createMockCapture({ id: 'persisted-cap-1', altitudeOffset: 0, heading: 0, scale: 1.0, isolationEnabled: true });
    const dummyBlob = new Blob(['glb binary test data'], { type: 'model/gltf-binary' });
    await storage.saveCapture(capture, dummyBlob);

    const saved = await storage.getCaptureMetadata('persisted-cap-1');
    assert.ok(saved);
    assert.equal(saved.id, 'persisted-cap-1');
  });

  suite.asyncTest('5.2: Sliders update metadata in sceneryStorage (Altitude, Heading, Scale, Isolation)', async () => {
    const capId = 'persisted-cap-1';

    // Simulate Altitude Slider: +25.5m
    await storage.updateMetadata(capId, { altitudeOffset: 25.5 });
    let meta = await storage.getCaptureMetadata(capId);
    assert.equal(meta?.altitudeOffset, 25.5, 'Altitude offset updated in storage');

    // Simulate Heading Slider: 145 degrees
    await storage.updateMetadata(capId, { heading: 145 });
    meta = await storage.getCaptureMetadata(capId);
    assert.equal(meta?.heading, 145, 'Heading updated in storage');

    // Simulate Scaling Slider: 3.25x
    await storage.updateMetadata(capId, { scale: 3.25 });
    meta = await storage.getCaptureMetadata(capId);
    assert.equal(meta?.scale, 3.25, 'Scale updated in storage');

    // Simulate Scenery Isolation Toggle: OFF
    await storage.updateMetadata(capId, { isolationEnabled: false });
    meta = await storage.getCaptureMetadata(capId);
    assert.equal(meta?.isolationEnabled, false, 'Isolation toggled OFF in storage');

    // Simulate Scenery Isolation Toggle: ON
    await storage.updateMetadata(capId, { isolationEnabled: true });
    meta = await storage.getCaptureMetadata(capId);
    assert.equal(meta?.isolationEnabled, true, 'Isolation toggled ON in storage');
  });

  suite.asyncTest('5.3: Reset Defaults restores [0m, 0 deg, 1.0x, true] and persists to storage and manager', async () => {
    const capId = 'persisted-cap-1';
    const mgr = new CustomSceneryManager();
    const mockTileset = createMockTileset();
    mgr.tileset = mockTileset;

    // Load custom scenery into manager
    const initialMeta = await storage.getCaptureMetadata(capId);
    mgr.activeCapture = { ...initialMeta };

    // Simulate user modified sliders: +40m, 210 deg, 2.5x, false
    mgr.updateTransform(40.0, 210.0, 2.5);
    mgr.setIsolation(false);
    await storage.updateMetadata(capId, { altitudeOffset: 40.0, heading: 210.0, scale: 2.5, isolationEnabled: false });

    // Verify modified state
    assert.equal(mgr.getAltitudeOffset(), 40.0);
    assert.equal(mgr.getHeading(), 210.0);
    assert.equal(mgr.getScale(), 2.5);
    assert.equal(mgr.isolationEnabled, false);

    // Simulate Reset Defaults button action (from LocationLibrary.tsx handleResetDefaults)
    const defAlt = 0;
    const defHeading = 0;
    const defScale = 1.0;
    const defIsolation = true;

    mgr.updateTransform(defAlt, defHeading, defScale);
    mgr.setIsolation(defIsolation);
    const defaults = { altitudeOffset: defAlt, heading: defHeading, scale: defScale, isolationEnabled: defIsolation };
    await storage.updateMetadata(capId, defaults);

    // Verify Cesium scene state is restored
    assert.equal(mgr.getAltitudeOffset(), 0);
    assert.equal(mgr.getHeading(), 0);
    assert.equal(mgr.getScale(), 1.0);
    assert.equal(mgr.isolationEnabled, true);
    assert.ok(mockTileset.clippingPlanes, 'Clipping planes re-enabled on reset');

    // Verify storage reflects defaults
    const persisted = await storage.getCaptureMetadata(capId);
    assert.equal(persisted?.altitudeOffset, 0);
    assert.equal(persisted?.heading, 0);
    assert.equal(persisted?.scale, 1.0);
    assert.equal(persisted?.isolationEnabled, true);
  });

  suite.asyncTest('5.4: High-frequency concurrent slider events queue without corrupted records', async () => {
    const capId = 'persisted-cap-1';
    const promises = [];

    // 50 concurrent updates with varying offsets
    for (let i = 0; i < 50; i++) {
      promises.push(storage.updateMetadata(capId, { altitudeOffset: i }));
    }

    await Promise.all(promises);

    const meta = await storage.getCaptureMetadata(capId);
    assert.ok(meta);
    assert.ok(meta.altitudeOffset >= 0 && meta.altitudeOffset < 50);
  });

  // --------------------------------------------------------------------------
  // Group 6: Edge Cases, Bounding Extremes, and Input Validation
  // --------------------------------------------------------------------------
  console.log('\n▸ Group 6: Edge Cases, Bounding Extremes, and Input Validation');

  suite.test('6.1: Altitude offset extreme clamping and NaN protection', () => {
    const mgr = new CustomSceneryManager();
    assert.equal(mgr.clampAltitudeOffset(-100), -100);
    assert.equal(mgr.clampAltitudeOffset(100), 100);
    assert.equal(mgr.clampAltitudeOffset(-1000), -100);
    assert.equal(mgr.clampAltitudeOffset(1000), 100);

    assert.throws(() => mgr.clampAltitudeOffset(NaN), /Invalid altitude offset/);
    assert.throws(() => mgr.clampAltitudeOffset(Infinity), /Invalid altitude offset/);
    assert.throws(() => mgr.clampAltitudeOffset(-Infinity), /Invalid altitude offset/);
    assert.throws(() => mgr.clampAltitudeOffset('abc'), /Invalid altitude offset/);
  });

  suite.test('6.2: Heading normalization handles arbitrary positive and negative rotations', () => {
    const mgr = new CustomSceneryManager();
    assert.equal(mgr.normalizeHeading(0), 0);
    assert.equal(mgr.normalizeHeading(360), 0);
    assert.equal(mgr.normalizeHeading(720), 0);
    assert.equal(mgr.normalizeHeading(361), 1);
    assert.equal(mgr.normalizeHeading(-1), 359);
    assert.equal(mgr.normalizeHeading(-360), 0);
    assert.equal(mgr.normalizeHeading(-721), 359);

    assert.throws(() => mgr.normalizeHeading(NaN), /Invalid heading/);
    assert.throws(() => mgr.normalizeHeading(Infinity), /Invalid heading/);
  });

  suite.test('6.3: Scale clamping protects against non-positive and out-of-range scaling', () => {
    const mgr = new CustomSceneryManager();
    assert.equal(mgr.clampScale(0.1), 0.1);
    assert.equal(mgr.clampScale(5.0), 5.0);
    assert.equal(mgr.clampScale(0.001), 0.1);
    assert.equal(mgr.clampScale(100.0), 5.0);

    assert.throws(() => mgr.clampScale(0), /Invalid scale factor/);
    assert.throws(() => mgr.clampScale(-1), /Invalid scale factor/);
    assert.throws(() => mgr.clampScale(NaN), /Invalid scale factor/);
  });

  suite.test('6.4: Coordinate validation rejects out-of-bounds geographic coordinates', () => {
    const mgr = new CustomSceneryManager();
    assert.throws(() => (mgr).validateCoordinates(91, 0, 0), /Invalid latitude/);
    assert.throws(() => (mgr).validateCoordinates(-91, 0, 0), /Invalid latitude/);
    assert.throws(() => (mgr).validateCoordinates(0, 181, 0), /Invalid longitude/);
    assert.throws(() => (mgr).validateCoordinates(0, -181, 0), /Invalid longitude/);
    assert.throws(() => (mgr).validateCoordinates(0, 0, NaN), /Invalid altitude/);
  });

  // Summary
  console.log('\n================================================================');
  console.log('  EMPIRICAL TEST EXECUTION SUMMARY');
  console.log('================================================================');
  console.log(`  Total Test Cases : ${suite.total}`);
  console.log(`  Passed           : \x1b[32m${suite.passed}\x1b[0m`);
  console.log(`  Failed           : ${suite.failed > 0 ? `\x1b[31m${suite.failed}\x1b[0m` : '0'}`);
  console.log('================================================================\n');

  if (suite.failed > 0) {
    console.error(`❌ SUITE FAILED with ${suite.failed} errors.\n`);
    process.exit(1);
  } else {
    console.log('✅ ALL EMPIRICAL CHALLENGE TESTS PASSED (100% pass rate).\n');
    process.exit(0);
  }
}

runM2EmpiricalTests().catch((err) => {
  console.error('Fatal Suite Exception:', err);
  process.exit(1);
});
