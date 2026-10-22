import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { CustomSceneryManager } from '../CustomSceneryManager';
import type { AlephCaptureMetadata } from '../../../services/aleph/types';

console.log('⚡ Starting CustomSceneryManager Adversarial Stress Harness...\n');

// Helper to sleep in async tests
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// STRESS TEST 1: Rapid Concurrent loadScenery / unloadScenery Race Conditions
// ============================================================================
console.log('🔥 [Stress 1] Rapid Concurrent loadScenery / unloadScenery (50 concurrent ops)...');
{
  const primitivesList: any[] = [];
  const mockScene: any = {
    primitives: {
      add: (item: any) => {
        primitivesList.push(item);
        return item;
      },
      remove: (item: any) => {
        const idx = primitivesList.indexOf(item);
        if (idx !== -1) primitivesList.splice(idx, 1);
        return true;
      },
      contains: (item: any) => primitivesList.includes(item),
    },
  };

  const mgr = new CustomSceneryManager(mockScene);
  const originalFromGltfAsync = Cesium.Model.fromGltfAsync;

  const createdModels: Array<{
    id: string;
    destroyed: boolean;
    model: any;
  }> = [];

  try {
    (Cesium.Model as any).fromGltfAsync = async (options: any) => {
      // Simulate variable network / decode latency between 2ms and 25ms
      const delay = Math.floor(Math.random() * 24) + 2;
      await sleep(delay);

      // 10% simulated corruption failure (before model creation)
      if (options.url.includes('corrupt')) {
        throw new Error('Simulated GLB parse error');
      }

      const modelEntry: { id: string; destroyed: boolean; model: any } = {
        id: options.url,
        destroyed: false,
        model: null,
      };

      const mockModel: any = {
        url: options.url,
        isDestroyed: () => modelEntry.destroyed,
        destroy: () => {
          modelEntry.destroyed = true;
        },
        modelMatrix: Cesium.Matrix4.clone(options.modelMatrix || Cesium.Matrix4.IDENTITY),
        scale: options.scale || 1.0,
      };

      modelEntry.model = mockModel;
      createdModels.push(modelEntry);

      return mockModel;
    };

    const TOTAL_OPS = 50;
    const promises: Promise<any>[] = [];
    let lastDispatchedOp: 'load' | 'unload' = 'load';
    let lastLoadedId = '';

    for (let i = 0; i < TOTAL_OPS; i++) {
      const isCorrupt = i % 10 === 0 && i > 0;
      const modelUrl = `blob:test-model-${i}${isCorrupt ? '-corrupt' : ''}`;
      const capture: AlephCaptureMetadata = {
        id: `cap-${i}`,
        name: `Stress Capture ${i}`,
        lat: 10 + (i * 0.1),
        lon: 20 + (i * 0.1),
        baseAltitude: 100 + i,
        altitudeOffset: (i % 20) - 10,
        heading: (i * 37) % 360,
        scale: 1.0 + (i % 4) * 0.5,
        radius: 40 + i,
        importedAt: Date.now(),
        isolationEnabled: i % 2 === 0,
      };

      // Dispatch load
      const p = mgr.loadScenery(capture, modelUrl).catch((_err) => {
        // Expected for corrupt models
      });
      promises.push(p);
      lastDispatchedOp = 'load';
      lastLoadedId = modelUrl;

      // Interleave occasional immediate unloads (every 7th op)
      if (i % 7 === 3) {
        mgr.unloadScenery();
        lastDispatchedOp = 'unload';
      }

      // Interleave micro-ticks
      if (i % 5 === 0) {
        await sleep(3);
      }
    }

    // Await all background loads to finish settling
    await Promise.all(promises);

    console.log(`    Total created models: ${createdModels.length}`);
    console.log(`    Active primitives count: ${primitivesList.length}`);
    console.log(`    Last dispatched operation: ${lastDispatchedOp}`);

    // Verification 1: Primitives list must NEVER have more than 1 model
    assert.ok(primitivesList.length <= 1, `Primitives list leaked! Found ${primitivesList.length} items`);

    if (lastDispatchedOp === 'unload') {
      assert.equal(mgr.getModel(), null, 'Model should be null after unload');
      assert.equal(primitivesList.length, 0, 'Primitives list should be empty after unload');
    } else {
      const active = mgr.getModel();
      if (active) {
        assert.equal(primitivesList.length, 1, 'Exactly one primitive active');
        assert.equal(primitivesList[0], active, 'Active model matches primitive in scene');
        assert.equal(active.isDestroyed(), false, 'Active model must not be destroyed');
      }
    }

    // Verification 2: Every single model that is not active MUST be destroyed
    let unreferencedUndestroyed = 0;
    for (const entry of createdModels) {
      if (entry.model !== mgr.getModel() && !entry.destroyed) {
        unreferencedUndestroyed++;
      }
    }
    assert.equal(
      unreferencedUndestroyed,
      0,
      `Memory leak! ${unreferencedUndestroyed} stale models were not destroyed via model.destroy()`
    );

    // Final unload verification
    mgr.unloadScenery();
    assert.equal(primitivesList.length, 0, 'Primitives list empty after final unload');
    assert.equal(mgr.getModel(), null, 'Active model null after final unload');
    for (const entry of createdModels) {
      assert.equal(entry.destroyed, true, `Model ${entry.id} must be destroyed after unload`);
    }

    console.log('  ✓ [Stress 1 PASS] Zero primitive leaks, all stale/cancelled models destroyed promptly.\n');
  } finally {
    Cesium.Model.fromGltfAsync = originalFromGltfAsync;
  }
}

// ============================================================================
// STRESS TEST 2: 500 Rapid Slider Drags with Scenery Isolation
// ============================================================================
console.log('🔥 [Stress 2] 500 Rapid Slider Drags with Active Isolation...');
{
  const mockTileset: any = { clippingPlanes: null };
  const mockScene: any = {
    primitives: {
      add: () => {},
      remove: () => {},
    },
    getTileset: () => mockTileset,
  };

  const mgr = new CustomSceneryManager(mockScene);
  mgr.tileset = mockTileset;

  const baseCapture: AlephCaptureMetadata = {
    id: 'slider-stress-cap',
    name: 'Slider Stress Test',
    lat: 41.8902,
    lon: 12.4922,
    baseAltitude: 25.0,
    altitudeOffset: 0.0,
    heading: 0.0,
    scale: 1.0,
    radius: 75.0,
    importedAt: Date.now(),
    isolationEnabled: true,
  };

  let mockModelDestroyed = false;
  const mockModel: any = {
    isDestroyed: () => mockModelDestroyed,
    destroy: () => { mockModelDestroyed = true; },
    modelMatrix: new Cesium.Matrix4(),
    scale: 1.0,
  };

  (mgr as any).activeModel = mockModel;
  (mgr as any).activeCapture = { ...baseCapture };

  // Enable isolation
  mgr.setIsolation(true);

  // Capture initial collection reference
  const initialCollection = mgr.tilesetClippingCollection;
  assert.ok(initialCollection, 'Clipping collection instantiated');
  assert.equal(mockTileset.clippingPlanes, initialCollection, 'Tileset clippingPlanes matches collection');
  assert.equal(initialCollection.unionClippingRegions, false, 'unionClippingRegions is false');

  const DRAG_STEPS = 500;
  const initialMatrix = mockModel.modelMatrix;

  for (let step = 0; step < DRAG_STEPS; step++) {
    // Generate pseudo-random or continuous slider movements
    const altitudeOffset = -100 + ((step * 1.37) % 200); // between -100 and +100
    const heading = (step * 7.19) % 720 - 360; // between -360 and +360
    const scale = 0.1 + ((step * 0.049) % 4.9); // between 0.1 and 5.0

    mgr.updateTransform(altitudeOffset, heading, scale);

    // 1. In-place preservation check: Collection reference MUST NEVER change
    assert.equal(
      mgr.tilesetClippingCollection,
      initialCollection,
      `Step ${step}: tilesetClippingCollection was re-allocated! Reference broke.`
    );
    assert.equal(
      mockTileset.clippingPlanes,
      initialCollection,
      `Step ${step}: mockTileset.clippingPlanes was re-assigned! Causes shader re-compilation.`
    );

    // 2. In-place modelMatrix check: activeModel.modelMatrix object identity MUST NOT change
    assert.equal(
      mockModel.modelMatrix,
      initialMatrix,
      `Step ${step}: activeModel.modelMatrix identity changed!`
    );

    // 3. Verify matrix values are finite and valid
    for (let m = 0; m < 16; m++) {
      assert.ok(
        Number.isFinite(mockModel.modelMatrix[m]),
        `Step ${step}: Matrix element ${m} is non-finite: ${mockModel.modelMatrix[m]}`
      );
    }

    // 4. Verify plane distances updated correctly
    const clampedAlt = mgr.getAltitudeOffset();
    const clampedScale = mgr.getScale();
    const expectedRadius = Math.max(75.0 * clampedScale, 10.0) + 5.0 + Math.abs(clampedAlt * 0.1);
    const expectedDistance = -expectedRadius;

    assert.equal(
      mgr.activePlanes[0].distance,
      expectedDistance,
      `Step ${step}: activePlanes[0].distance mismatch`
    );
    assert.equal(
      initialCollection.get(0).distance,
      expectedDistance,
      `Step ${step}: clippingPlane[0].distance in collection not updated in-place`
    );
    assert.equal(
      initialCollection.get(1).distance,
      expectedDistance,
      `Step ${step}: clippingPlane[1].distance mismatch`
    );
    assert.equal(
      initialCollection.get(2).distance,
      expectedDistance,
      `Step ${step}: clippingPlane[2].distance mismatch`
    );
    assert.equal(
      initialCollection.get(3).distance,
      expectedDistance,
      `Step ${step}: clippingPlane[3].distance mismatch`
    );

    // 5. Verify bounding sphere calculation remains valid throughout dragging
    const bs = mgr.getActiveBoundingSphere();
    assert.ok(bs, `Step ${step}: Bounding sphere is null`);
    assert.ok(Number.isFinite(bs.radius) && bs.radius > 0, `Step ${step}: Invalid BS radius ${bs.radius}`);
    assert.ok(
      Number.isFinite(bs.center.x) && Number.isFinite(bs.center.y) && Number.isFinite(bs.center.z),
      `Step ${step}: Invalid BS center`
    );
  }

  console.log(`  ✓ [Stress 2 PASS] Completed ${DRAG_STEPS} rapid slider updates: zero collection allocations, zero tileset re-assignments.\n`);
}

// ============================================================================
// STRESS TEST 3: Radius Overrides During Active Isolation (100 sweeps)
// ============================================================================
console.log('🔥 [Stress 3] 100 Dynamic Radius Overrides with Active Isolation...');
{
  const mockTileset: any = { clippingPlanes: null };
  const mgr = new CustomSceneryManager();
  mgr.tileset = mockTileset;

  (mgr as any).activeCapture = {
    id: 'radius-cap',
    lat: 34.0522,
    lon: -118.2437,
    baseAltitude: 70.0,
    radius: 50.0,
    scale: 1.0,
    altitudeOffset: 0.0,
  };

  mgr.setIsolation(true);
  const collection = mgr.tilesetClippingCollection;
  assert.ok(collection, 'Initial collection created');

  for (let r = 5; r <= 1000; r += 10) {
    mgr.setIsolation(true, r);

    // Collection identity MUST NOT change
    assert.equal(mgr.tilesetClippingCollection, collection, `Radius ${r}: Collection re-instantiated`);
    assert.equal(mockTileset.clippingPlanes, collection, `Radius ${r}: Tileset re-assigned`);

    const expectedRadius = Math.max(r, 10.0) + 5.0;
    assert.equal(collection.get(0).distance, -expectedRadius);
  }

  console.log('  ✓ [Stress 3 PASS] Dynamic radius overrides mutate planes in-place without re-instantiation.\n');
}

// ============================================================================
// STRESS TEST 4: Rapid Isolation Toggling (200 cycles)
// ============================================================================
console.log('🔥 [Stress 4] Rapid Isolation Toggling (200 On/Off cycles)...');
{
  const mockTileset: any = { clippingPlanes: null };
  const mgr = new CustomSceneryManager();
  mgr.tileset = mockTileset;

  (mgr as any).activeCapture = {
    id: 'toggle-cap',
    lat: 48.8584,
    lon: 2.2945,
    baseAltitude: 35.0,
    radius: 60.0,
  };

  for (let cycle = 0; cycle < 200; cycle++) {
    // Enable
    mgr.setIsolation(true);
    assert.equal(mgr.isolationEnabled, true);
    assert.ok(mgr.tilesetClippingCollection !== null);
    assert.equal(mgr.tilesetClippingCollection.unionClippingRegions, false);
    assert.equal(mgr.activePlanes.length, 4);
    assert.equal(mockTileset.clippingPlanes, mgr.tilesetClippingCollection);

    // Disable
    mgr.setIsolation(false);
    assert.equal(mgr.isolationEnabled, false);
    assert.equal(mgr.tilesetClippingCollection, null);
    assert.equal(mgr.activePlanes.length, 0);
    assert.equal(mockTileset.clippingPlanes, undefined);
  }

  console.log('  ✓ [Stress 4 PASS] 200 On/Off cycles cleanly attached and detached without state corruption.\n');
}

// ============================================================================
// STRESS TEST 5: Sequential 100 Full Load -> Transform -> Unload Cycles
// ============================================================================
console.log('🔥 [Stress 5] 100 Full Sequential Load -> Transform -> Unload Cycles...');
{
  const primitivesList: any[] = [];
  const mockScene: any = {
    primitives: {
      add: (item: any) => { primitivesList.push(item); return item; },
      remove: (item: any) => {
        const idx = primitivesList.indexOf(item);
        if (idx !== -1) primitivesList.splice(idx, 1);
        return true;
      },
    },
  };

  const mgr = new CustomSceneryManager(mockScene);
  const originalFromGltfAsync = Cesium.Model.fromGltfAsync;

  try {
    for (let cycle = 0; cycle < 100; cycle++) {
      let isDestroyed = false;
      const mockModel: any = {
        isDestroyed: () => isDestroyed,
        destroy: () => { isDestroyed = true; },
        modelMatrix: new Cesium.Matrix4(),
        scale: 1.0,
      };

      (Cesium.Model as any).fromGltfAsync = async () => mockModel;

      const cap: AlephCaptureMetadata = {
        id: `seq-${cycle}`,
        name: `Seq ${cycle}`,
        lat: 30.0,
        lon: 100.0,
        baseAltitude: 50.0,
        altitudeOffset: 0.0,
        heading: 0.0,
        scale: 1.0,
        radius: 40.0,
        importedAt: Date.now(),
        isolationEnabled: cycle % 2 === 0,
      };

      await mgr.loadScenery(cap, `blob:seq-${cycle}`);

      assert.equal(primitivesList.length, 1, `Cycle ${cycle}: Model not in primitives`);
      assert.equal(mgr.getModel(), mockModel, `Cycle ${cycle}: Model not active`);

      // 5 transforms
      for (let t = 0; t < 5; t++) {
        mgr.updateTransform(t * 10, t * 45, 1.0 + t * 0.2);
      }

      mgr.unloadScenery();

      assert.equal(primitivesList.length, 0, `Cycle ${cycle}: Primitives not cleared on unload`);
      assert.equal(mgr.getModel(), null, `Cycle ${cycle}: Model not cleared on unload`);
      assert.equal(isDestroyed, true, `Cycle ${cycle}: Model not destroyed on unload`);
      assert.equal(mgr.getActiveBoundingSphere(), null, `Cycle ${cycle}: Bounding sphere not cleared`);
    }

    console.log('  ✓ [Stress 5 PASS] 100 full sequential lifecycles completed with zero leaks.\n');
  } finally {
    Cesium.Model.fromGltfAsync = originalFromGltfAsync;
  }
}

// ============================================================================
// STRESS TEST 6: Slider Drag During In-Flight Model Download
// ============================================================================
console.log('🔥 [Stress 6] In-flight Slider Drag Before GLB Download Completes...');
{
  let resolveGltf: ((val: any) => void) | null = null;
  let modelDestroyed = false;

  const mockModel: any = {
    isDestroyed: () => modelDestroyed,
    destroy: () => { modelDestroyed = true; },
    modelMatrix: new Cesium.Matrix4(),
    scale: 1.0,
  };

  const originalFromGltfAsync = Cesium.Model.fromGltfAsync;
  (Cesium.Model as any).fromGltfAsync = () => new Promise((resolve) => { resolveGltf = resolve; });

  try {
    const mgr = new CustomSceneryManager();
    const cap: AlephCaptureMetadata = {
      id: 'inflight-cap',
      name: 'Inflight Cap',
      lat: 51.5074,
      lon: -0.1278,
      baseAltitude: 15.0,
      altitudeOffset: 0.0,
      heading: 0.0,
      scale: 1.0,
      radius: 50.0,
      importedAt: Date.now(),
      isolationEnabled: false,
    };

    const loadPromise = mgr.loadScenery(cap, 'blob:inflight');

    // User vigorously adjusts sliders while model is still downloading
    for (let s = 1; s <= 20; s++) {
      mgr.updateTransform(s * 2.5, s * 15, 1.0 + s * 0.1);
    }

    assert.equal(mgr.getAltitudeOffset(), 50.0);
    assert.equal(mgr.getHeading(), 300);
    assert.equal(mgr.getScale(), 3.0);

    // Now model finishes downloading
    resolveGltf!(mockModel);
    await loadPromise;

    // Verify model received the latest transform
    assert.equal(mgr.getModel(), mockModel);
    assert.equal(mockModel.scale, 3.0, 'Model scale matches user adjustments');
    assert.equal(mgr.getAltitudeOffset(), 50.0);
    assert.equal(mgr.getHeading(), 300);

    console.log('  ✓ [Stress 6 PASS] In-flight transform adjustments correctly applied to model upon load.\n');
  } finally {
    Cesium.Model.fromGltfAsync = originalFromGltfAsync;
  }
}

// ============================================================================
// STRESS TEST 7: Interleaved Load A -> Unload -> Load B Race
// ============================================================================
console.log('🔥 [Stress 7] Interleaved Load A -> Unload -> Load B with Late Arrival...');
{
  let resolveA: ((val: any) => void) | null = null;
  let resolveB: ((val: any) => void) | null = null;
  let modelADestroyed = false;
  let modelBDestroyed = false;

  const mockModelA: any = {
    id: 'A',
    isDestroyed: () => modelADestroyed,
    destroy: () => { modelADestroyed = true; },
    modelMatrix: new Cesium.Matrix4(),
    scale: 1.0,
  };
  const mockModelB: any = {
    id: 'B',
    isDestroyed: () => modelBDestroyed,
    destroy: () => { modelBDestroyed = true; },
    modelMatrix: new Cesium.Matrix4(),
    scale: 2.0,
  };

  const originalFromGltfAsync = Cesium.Model.fromGltfAsync;
  let callNum = 0;
  (Cesium.Model as any).fromGltfAsync = () => {
    callNum++;
    if (callNum === 1) {
      return new Promise((resolve) => { resolveA = resolve; });
    }
    return new Promise((resolve) => { resolveB = resolve; });
  };

  try {
    const primitivesList: any[] = [];
    const mockScene: any = {
      primitives: {
        add: (item: any) => { primitivesList.push(item); return item; },
        remove: (item: any) => {
          const idx = primitivesList.indexOf(item);
          if (idx !== -1) primitivesList.splice(idx, 1);
          return true;
        },
      },
    };

    const mgr = new CustomSceneryManager(mockScene);

    const capA: AlephCaptureMetadata = {
      id: 'cap-A',
      name: 'Cap A',
      lat: 10,
      lon: 10,
      baseAltitude: 100,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 50,
      importedAt: Date.now(),
      isolationEnabled: false,
    };
    const capB: AlephCaptureMetadata = {
      id: 'cap-B',
      name: 'Cap B',
      lat: 20,
      lon: 20,
      baseAltitude: 200,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 50,
      importedAt: Date.now(),
      isolationEnabled: false,
    };

    // 1. Dispatch A
    const pA = mgr.loadScenery(capA, 'blob:A');
    assert.equal(mgr.getLoadGeneration(), 1);

    // 2. Immediate unload
    mgr.unloadScenery();
    assert.equal(mgr.getLoadGeneration(), 2);

    // 3. Dispatch B
    const pB = mgr.loadScenery(capB, 'blob:B');
    assert.equal(mgr.getLoadGeneration(), 3);

    // 4. Now A finishes very late
    resolveA!(mockModelA);
    await pA;

    assert.equal(modelADestroyed, true, 'Model A destroyed upon arrival');
    assert.equal(mgr.getModel(), null, 'Model A not set as active');
    assert.equal(primitivesList.length, 0, 'Model A not added to primitives');

    // 5. Now B finishes
    resolveB!(mockModelB);
    await pB;

    assert.equal(modelBDestroyed, false, 'Model B is active and not destroyed');
    assert.equal(mgr.getModel(), mockModelB, 'Model B is active model');
    assert.equal(primitivesList.length, 1, 'Model B is the sole primitive');
    assert.equal(primitivesList[0], mockModelB);

    console.log('  ✓ [Stress 7 PASS] Late-arriving Model A properly destroyed; Model B becomes sole active model.\n');
  } finally {
    Cesium.Model.fromGltfAsync = originalFromGltfAsync;
  }
}

console.log('🏆 ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY!\n');

