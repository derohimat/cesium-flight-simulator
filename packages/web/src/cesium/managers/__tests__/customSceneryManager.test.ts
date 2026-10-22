import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { CustomSceneryManager } from '../CustomSceneryManager';
import type { AlephCaptureMetadata } from '../../../services/aleph/types';

console.log('🧪 Starting CustomSceneryManager Unit Test Suite...');

// 1. Initial State
{
  const mgr = new CustomSceneryManager();
  assert.equal(mgr.isolationEnabled, false, 'Initial isolation should be false');
  assert.equal(mgr.activePlanes.length, 0, 'Initial active planes should be empty');
  assert.equal(mgr.getActiveCapture(), null, 'No active capture initially');
  assert.equal(mgr.getModel(), null, 'No active model initially');
  assert.equal(mgr.getActiveBoundingSphere(), null, 'Bounding sphere is null when unloaded');
  console.log('  ✓ 1. Initial state verified');
}

// 2. Input Validation and Clamping
{
  const mgr = new CustomSceneryManager();

  // Altitude offset clamping
  assert.equal(mgr.clampAltitudeOffset(-100), -100);
  assert.equal(mgr.clampAltitudeOffset(-150), -100);
  assert.equal(mgr.clampAltitudeOffset(100), 100);
  assert.equal(mgr.clampAltitudeOffset(250), 100);
  assert.equal(mgr.clampAltitudeOffset(0), 0);
  assert.throws(() => mgr.clampAltitudeOffset(NaN), /Invalid altitude offset/);
  assert.throws(() => mgr.clampAltitudeOffset(Infinity), /Invalid altitude offset/);
  assert.throws(() => mgr.clampAltitudeOffset('20' as any), /Invalid altitude offset/);

  // Heading normalization
  assert.equal(mgr.normalizeHeading(0), 0);
  assert.equal(mgr.normalizeHeading(360), 0);
  assert.equal(mgr.normalizeHeading(450), 90);
  assert.equal(mgr.normalizeHeading(720), 0);
  assert.equal(mgr.normalizeHeading(-90), 270);
  assert.equal(mgr.normalizeHeading(-360), 0);
  assert.equal(mgr.normalizeHeading(-450), 270);
  assert.throws(() => mgr.normalizeHeading(NaN), /Invalid heading/);
  assert.throws(() => mgr.normalizeHeading(Infinity), /Invalid heading/);

  // Scale clamping
  assert.equal(mgr.clampScale(0.1), 0.1);
  assert.equal(mgr.clampScale(0.01), 0.1);
  assert.equal(mgr.clampScale(1.0), 1.0);
  assert.equal(mgr.clampScale(5.0), 5.0);
  assert.equal(mgr.clampScale(10.0), 5.0);
  assert.throws(() => mgr.clampScale(0), /Invalid scale factor/);
  assert.throws(() => mgr.clampScale(-1), /Invalid scale factor/);
  assert.throws(() => mgr.clampScale(NaN), /Invalid scale factor/);
  console.log('  ✓ 2. Input validation & clamping verified');
}

// 3. Scenery Isolation & Clipping Plane Geometry
{
  const mgr = new CustomSceneryManager();
  const mockTileset: any = { clippingPlanes: null };
  mgr.tileset = mockTileset;

  // Enable isolation with default radius (75m)
  mgr.setIsolation(true, 75.0);
  assert.equal(mgr.isolationEnabled, true);
  assert.equal(mgr.activePlanes.length, 4);

  // Radius = 75 + 5 = 80 -> distance = -80
  assert.equal(mgr.activePlanes[0].distance, -80.0);
  assert.deepEqual(mgr.activePlanes[0].normal, { x: 1, y: 0, z: 0 });
  assert.deepEqual(mgr.activePlanes[1].normal, { x: -1, y: 0, z: 0 });
  assert.deepEqual(mgr.activePlanes[2].normal, { x: 0, y: 1, z: 0 });
  assert.deepEqual(mgr.activePlanes[3].normal, { x: 0, y: -1, z: 0 });
  assert.ok(mockTileset.clippingPlanes, 'Tileset assigned clipping collection');
  assert.equal(mockTileset.clippingPlanes.enabled, true);
  assert.equal(mockTileset.clippingPlanes.unionClippingRegions, false, 'unionClippingRegions must be false for intersection clipping');

  // Zero-radius enforcement (min 10m + 5m margin = 15m)
  mgr.setIsolation(true, 0.0);
  assert.equal(mgr.activePlanes[0].distance, -15.0);

  // Switching active capture radius
  mgr.setIsolation(true, 100.0);
  assert.equal(mgr.activePlanes[0].distance, -105.0);

  mgr.setIsolation(true, 30.0);
  assert.equal(mgr.activePlanes[0].distance, -35.0);

  // Disable isolation
  mgr.setIsolation(false);
  assert.equal(mgr.isolationEnabled, false);
  assert.equal(mgr.activePlanes.length, 0);
  assert.equal(mockTileset.clippingPlanes, undefined);
  console.log('  ✓ 3. Scenery isolation & clipping plane geometry verified');
}

// 4. Transform Updates & Clipping Plane Expansion
{
  const mgr = new CustomSceneryManager();
  const mockCapture: AlephCaptureMetadata = {
    id: 'test-cap',
    name: 'Test Site',
    lat: 41.8902,
    lon: 12.4922,
    baseAltitude: 24.5,
    altitudeOffset: 0,
    heading: 0,
    scale: 1.0,
    radius: 50.0,
    importedAt: Date.now(),
    isolationEnabled: true,
  };

  mgr.setIsolation(true, 50.0);
  const d0 = mgr.activePlanes[0].distance; // -(50 + 5 + 0) = -55

  const initialCollection = mgr.tilesetClippingCollection;
  assert.ok(initialCollection, 'Initial clipping collection exists');

  // Update transform with altitude offset +40m
  mgr.updateTransform(40.0, 90.0, 1.5);
  assert.equal(mgr.getAltitudeOffset(), 40.0);
  assert.equal(mgr.getHeading(), 90.0);
  assert.equal(mgr.getScale(), 1.5);
  assert.equal(mgr.tilesetClippingCollection, initialCollection, 'Clipping collection mutated in-place without reallocation');
  assert.equal(initialCollection.get(0).distance, mgr.activePlanes[0].distance, 'Plane distances mutated in-place');

  const dAfter = mgr.activePlanes[0].distance;
  // Scaled radius 50 * 1.5 = 75 + 5 + 4 = 84 -> distance = -84 < -55
  assert.ok(dAfter < d0, 'Clipping volume expands with scale and altitude offset');
  console.log('  ✓ 4. Transform updates & clipping expansion verified');
}

// 5. Bounding Sphere Calculation
{
  const mgr = new CustomSceneryManager();
  const mockCapture: AlephCaptureMetadata = {
    id: 'test-cap-sphere',
    name: 'Sphere Test',
    lat: 35.6762,
    lon: 139.6503,
    baseAltitude: 40.0,
    altitudeOffset: 10.0,
    heading: 45.0,
    scale: 2.0,
    radius: 60.0,
    importedAt: Date.now(),
    isolationEnabled: false,
  };

  // Directly set capture
  (mgr as any).activeCapture = mockCapture;
  (mgr as any).currentAltitudeOffset = 10.0;
  (mgr as any).currentScale = 2.0;

  const bs = mgr.getActiveBoundingSphere();
  assert.ok(bs, 'Bounding sphere computed');
  assert.equal(bs.radius, 120.0, 'Radius is baseRadius * scale = 60 * 2 = 120');

  // Verify center is near Earth surface
  const cartographic = Cesium.Cartographic.fromCartesian(bs.center);
  const latDeg = Cesium.Math.toDegrees(cartographic.latitude);
  const lonDeg = Cesium.Math.toDegrees(cartographic.longitude);
  assert.ok(Math.abs(latDeg - 35.6762) < 1e-4, 'Center latitude matches');
  assert.ok(Math.abs(lonDeg - 139.6503) < 1e-4, 'Center longitude matches');
  assert.ok(Math.abs(cartographic.height - 50.0) < 1e-2, 'Center height is baseAlt + offset');

  // Unload
  mgr.unloadScenery();
  assert.equal(mgr.getActiveBoundingSphere(), null, 'Unload clears bounding sphere');
  assert.equal(mgr.getActiveCapture(), null, 'Unload clears active capture');
  console.log('  ✓ 5. Bounding sphere calculation & unload verified');
}

// 6. Async Load Generation Counter & Cancellation Guard
{
  const mgr = new CustomSceneryManager();
  assert.equal(mgr.getLoadGeneration(), 0, 'Initial load generation is 0');

  mgr.unloadScenery();
  assert.equal(mgr.getLoadGeneration(), 1, 'unloadScenery increments load generation');

  // Test async race condition prevention
  const originalFromGltfAsync = Cesium.Model.fromGltfAsync;
  try {
    let resolveModel1: ((val: any) => void) | null = null;
    let resolveModel2: ((val: any) => void) | null = null;
    let model1Destroyed = false;
    let model2Destroyed = false;

    const mockModel1: any = {
      isDestroyed: () => model1Destroyed,
      destroy: () => { model1Destroyed = true; },
      modelMatrix: new Cesium.Matrix4(),
      scale: 1.0,
    };
    const mockModel2: any = {
      isDestroyed: () => model2Destroyed,
      destroy: () => { model2Destroyed = true; },
      modelMatrix: new Cesium.Matrix4(),
      scale: 1.0,
    };

    let callCount = 0;
    (Cesium.Model as any).fromGltfAsync = () => {
      callCount++;
      if (callCount === 1) {
        return new Promise((resolve) => { resolveModel1 = resolve; });
      } else {
        return new Promise((resolve) => { resolveModel2 = resolve; });
      }
    };

    const mockCapture1: AlephCaptureMetadata = {
      id: 'cap-1',
      name: 'Capture 1',
      lat: 10,
      lon: 20,
      baseAltitude: 100,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 50,
      importedAt: Date.now(),
      isolationEnabled: false,
    };
    const mockCapture2: AlephCaptureMetadata = {
      id: 'cap-2',
      name: 'Capture 2',
      lat: 30,
      lon: 40,
      baseAltitude: 200,
      altitudeOffset: 10,
      heading: 90,
      scale: 2,
      radius: 60,
      importedAt: Date.now(),
      isolationEnabled: false,
    };

    // Start load 1
    const p1 = mgr.loadScenery(mockCapture1, 'blob:model1');
    assert.equal(mgr.getLoadGeneration(), 2, 'Load 1 generation incremented');

    // Immediately start load 2 while load 1 is still in-flight
    const p2 = mgr.loadScenery(mockCapture2, 'blob:model2');
    assert.equal(mgr.getLoadGeneration(), 3, 'Load 2 generation incremented');

    // Now resolve load 1 (the outdated/stale model)
    resolveModel1!(mockModel1);
    await p1;

    // Verify model 1 was discarded and destroyed immediately
    assert.equal(model1Destroyed, true, 'Outdated model 1 was destroyed immediately');
    assert.equal(mgr.getModel(), null, 'Model 1 was not set as active model');

    // Now resolve load 2 (the current model)
    resolveModel2!(mockModel2);
    await p2;

    // Verify model 2 is active and not destroyed
    assert.equal(model2Destroyed, false, 'Current model 2 was kept');
    assert.equal(mgr.getModel(), mockModel2, 'Model 2 set as active model');
    assert.equal(mgr.getAltitudeOffset(), 10, 'Model 2 transform applied');
    assert.equal(mgr.getHeading(), 90, 'Model 2 heading applied');
    assert.equal(mgr.getScale(), 2, 'Model 2 scale applied');

    // Test unloadScenery mid-flight
    callCount = 0;
    let resolveModel3: ((val: any) => void) | null = null;
    let model3Destroyed = false;
    const mockModel3: any = {
      isDestroyed: () => model3Destroyed,
      destroy: () => { model3Destroyed = true; },
      modelMatrix: new Cesium.Matrix4(),
      scale: 1.0,
    };
    (Cesium.Model as any).fromGltfAsync = () => new Promise((resolve) => { resolveModel3 = resolve; });

    const p3 = mgr.loadScenery(mockCapture1, 'blob:model3');
    // User unloads scenery before model arrives
    mgr.unloadScenery();
    resolveModel3!(mockModel3);
    await p3;

    assert.equal(model3Destroyed, true, 'Model arriving after unloadScenery was destroyed');
    assert.equal(mgr.getModel(), null, 'No active model after cancelled load');

    console.log('  ✓ 6. Async load generation counter & cancellation guard verified');
  } finally {
    Cesium.Model.fromGltfAsync = originalFromGltfAsync;
  }
}

console.log('✅ All CustomSceneryManager Unit Tests Passed Successfully!\n');
