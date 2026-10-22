/**
 * Milestone 4 Tier 5 Adversarial Stress Testing & E2E Integration Suite
 * 
 * Challenger: challenger_m4
 * 
 * Verifies:
 * 1. Full Lifecycle E2E Pipeline:
 *    GLB Ingestion -> IndexedDB Storage -> CustomSceneryManager Placement ->
 *    Scenery Isolation (unionClippingRegions: false) -> Cinematography Presets ->
 *    Timeline Shortest-Path Heading Interpolation -> In-Place Slider Mutation -> Teardown.
 * 2. Asynchronous Race Conditions & Concurrency:
 *    Concurrent load/unload with loadGeneration counter, cancelled requests, rapid capture switching.
 * 3. High-Frequency Interactivity & Zero WebGL Shader Re-linking:
 *    500 rapid slider drags preserving ClippingPlaneCollection identity and in-place matrix mutation.
 * 4. Geodetic & Boundary Fuzzing:
 *    Poles (±90°), Antimeridian (±180°), sub-sea level (Dead Sea -430m, Mariana Trench -10994m),
 *    zero/negative/huge radii, altitude offsets [-100, +100], heading wrap-around (350° -> 10°).
 * 5. Non-Regression Verification of Core Flight Simulator Systems:
 *    Standard airport locations, HUD telemetry, camera controls, quality presets.
 * 6. Bundled Colosseum Sample Physical Inspection:
 *    Binary GLB header, georeference extras, metadata schema, thumbnail presence.
 */

import '../packages/web/node_modules/fake-indexeddb/auto/index.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Cesium from 'cesium';

// Domain imports
import {
  parseGlbBuffer,
  parseMetadataJson,
  parseCapturePackage,
} from '../packages/web/src/services/aleph/alephParser.ts';
import { SceneryStorageService } from '../packages/web/src/services/aleph/sceneryStorage.ts';
import { CustomSceneryManager } from '../packages/web/src/cesium/managers/CustomSceneryManager.ts';
import {
  generateOrbitKeyframes,
  generateFlyByKeyframes,
  generateSpiralRevealKeyframes,
  normalizeHeading,
  cinematographyPresets,
  type PresetOptions,
} from '../packages/web/src/services/cinematography/CinematographyPresets.ts';
import type { AlephCaptureMetadata } from '../packages/web/src/services/aleph/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to dynamically extract the runtime `interpolatePose` function from StudioModeUI.tsx
const studioModeUIPath = path.join(rootDir, 'packages/web/src/react/layouts/StudioModeUI.tsx');
const studioModeUISrc = fs.readFileSync(studioModeUIPath, 'utf8');

const ts = await import('../packages/web/node_modules/typescript/lib/typescript.js');

const fnMatch = studioModeUISrc.match(/function interpolatePose\([\s\S]*?\n\}/);
if (!fnMatch) {
  throw new Error('Could not extract interpolatePose function from StudioModeUI.tsx');
}
const tsCode = fnMatch[0];
const jsCode = ts.default.transpileModule(tsCode, {
  compilerOptions: { module: ts.default.ModuleKind.ESNext, target: ts.default.ScriptTarget.ES2022 },
}).outputText;
const evalContext = new Function(`${jsCode}\nreturn interpolatePose;`);
const interpolatePose = evalContext();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to construct a synthetic valid binary GLB buffer with custom extras
function createSyntheticGlb(extras: any, meshBox = { min: [-50, -50, -10], max: [50, 50, 20] }): ArrayBuffer {
  const jsonDoc = {
    asset: {
      version: '2.0',
      generator: 'Aleph 3D Test Generator',
      extras,
    },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 8,
        type: 'VEC3',
        min: [meshBox.min[0], meshBox.min[1], meshBox.min[2]],
        max: [meshBox.max[0], meshBox.max[1], meshBox.max[2]],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 96 }],
    buffers: [{ byteLength: 96 }],
  };

  const jsonStr = JSON.stringify(jsonDoc);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const chunk0Length = jsonBytes.byteLength + jsonPadding;

  const binLength = 96;
  const binPadding = 0;
  const chunk1Length = binLength + binPadding;

  const totalLength = 12 + 8 + chunk0Length + 8 + chunk1Length;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // 12-byte header
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);          // version 2
  view.setUint32(8, totalLength, true);

  // Chunk 0 (JSON)
  view.setUint32(12, chunk0Length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  uint8.set(jsonBytes, 20);
  for (let i = 0; i < jsonPadding; i++) {
    uint8[20 + jsonBytes.byteLength + i] = 0x20; // ASCII space
  }

  // Chunk 1 (BIN)
  const chunk1HeaderOffset = 20 + chunk0Length;
  view.setUint32(chunk1HeaderOffset, chunk1Length, true);
  view.setUint32(chunk1HeaderOffset + 4, 0x004e4942, true); // "BIN\0"
  // fill with dummy float values
  const floatView = new Float32Array(buffer, chunk1HeaderOffset + 8, 24);
  floatView.set([
    meshBox.min[0], meshBox.min[1], meshBox.min[2],
    meshBox.max[0], meshBox.max[1], meshBox.max[2],
  ]);

  return buffer;
}

class TestReporter {
  suiteName: string;
  total = 0;
  passed = 0;
  failed = 0;
  assertions = 0;
  errors: { desc: string; error: Error }[] = [];
  startTime = Date.now();

  constructor(name: string) {
    this.suiteName = name;
  }

  test(desc: string, fn: () => void | Promise<void>): Promise<void> | void {
    this.total++;
    try {
      const res = fn();
      if (res && typeof res.then === 'function') {
        return res
          .then(() => {
            this.passed++;
            console.log(`  ✓ ${desc}`);
          })
          .catch((err: any) => {
            this.failed++;
            this.errors.push({ desc, error: err });
            console.error(`  ✗ ${desc}`);
            console.error(`    ${err.stack || err.message}`);
          });
      }
      this.passed++;
      console.log(`  ✓ ${desc}`);
    } catch (err: any) {
      this.failed++;
      this.errors.push({ desc, error: err });
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.stack || err.message}`);
    }
  }

  assert(condition: boolean, msg: string) {
    this.assertions++;
    if (!condition) {
      throw new Error(`Assertion Failed: ${msg}`);
    }
  }

  summary(): boolean {
    const elapsed = Date.now() - this.startTime;
    console.log('\n================================================================');
    console.log(`  ${this.suiteName} Summary`);
    console.log(`  Tests Passed : ${this.passed}/${this.total} (${this.failed} failed)`);
    console.log(`  Assertions   : ${this.assertions}`);
    console.log(`  Duration     : ${elapsed}ms`);
    console.log('================================================================\n');

    if (this.failed > 0) {
      console.error('Detailed Failures:');
      for (const e of this.errors) {
        console.error(`- ${e.desc}: ${e.error.message}`);
      }
      return false;
    }
    return true;
  }
}

async function runMasterAdversarialSuite() {
  console.log('================================================================');
  console.log('  Milestone 4 Tier 5 White-Box Adversarial Stress Test Suite   ');
  console.log('================================================================\n');

  const report = new TestReporter('Milestone 4 Tier 5 Adversarial Master Harness');

  // ==========================================================================
  // SECTION 1: Full Lifecycle E2E Pipeline
  // ==========================================================================
  console.log('▶ Section 1: Full Lifecycle E2E Pipeline (Ingest -> Store -> Place -> Isolate -> Presets -> Timeline -> Teardown)');

  await report.test('1.1 Ingest binary GLB with georeference extras and compute metadata', () => {
    const glbBuffer = createSyntheticGlb({
      latitude: 41.89021,
      longitude: 12.49223,
      base: 24.0,
      radius: 95.0,
      bounds: [41.889, 12.491, 41.891, 12.493],
    });

    const parsed = parseGlbBuffer(glbBuffer, 'colosseum-synthetic.glb');
    report.assert(parsed.metadata.lat === 41.89021, 'Latitude parsed correctly');
    report.assert(parsed.metadata.lon === 12.49223, 'Longitude parsed correctly');
    report.assert(parsed.metadata.baseAltitude === 24.0, 'Base altitude parsed correctly');
    report.assert(parsed.metadata.radius === 95.0, 'Bounding radius parsed correctly');
    report.assert(parsed.metadata.bounds?.length === 4, 'Bounding box parsed correctly');
  });

  await report.test('1.2 Ingest capture package with metadata.json & mesh.glb pair', async () => {
    const glbBuffer = createSyntheticGlb({});
    const glbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const glbFile = new File([glbBlob], 'mesh.glb', { type: 'model/gltf-binary' });

    const metaJson = JSON.stringify({
      name: 'Custom Package Capture',
      lat: 37.7749,
      lon: -122.4194,
      baseAltitude: 15.0,
      radius: 60.0,
      bounds: [37.77, -122.42, 37.78, -122.41],
    });
    const metaFile = new File([new Blob([metaJson])], 'metadata.json', { type: 'application/json' });

    const parsed = await parseCapturePackage([glbFile, metaFile]);
    report.assert(parsed.metadata.name === 'Custom Package Capture', 'Package name parsed');
    report.assert(parsed.metadata.lat === 37.7749, 'Package latitude parsed');
    report.assert(parsed.metadata.lon === -122.4194, 'Package longitude parsed');
  });

  await report.test('1.3 Dual-store IndexedDB persistence, query, and Object URL generation', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    const captureId = `cap-lifecycle-${Date.now()}`;
    const glbBuffer = createSyntheticGlb({ latitude: 45.0, longitude: 9.0, base: 100.0, radius: 50.0 });
    const glbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' });

    const metadata: AlephCaptureMetadata = {
      id: captureId,
      name: 'Lifecycle Verification Capture',
      lat: 45.0,
      lon: 9.0,
      baseAltitude: 100.0,
      altitudeOffset: 0,
      heading: 0,
      scale: 1.0,
      radius: 50.0,
      bounds: [44.9, 8.9, 45.1, 9.1],
      importedAt: Date.now(),
      isolationEnabled: true,
    };

    const savedId = await storage.saveCapture(metadata, glbBlob);
    report.assert(savedId === captureId, 'Saved capture ID matches');

    const retrievedMeta = await storage.getCaptureMetadata(captureId);
    report.assert(retrievedMeta !== null && retrievedMeta.lat === 45.0, 'Retrieved metadata matches');

    const retrievedBlob = await storage.getModelBlob(captureId);
    report.assert(retrievedBlob !== null && retrievedBlob.size === glbBlob.size, 'Retrieved blob size matches');

    const modelUrl1 = await storage.getModelUrl(captureId);
    report.assert(modelUrl1 !== null && modelUrl1.startsWith('blob:'), 'Model URL is valid blob URL');
    const modelUrl2 = await storage.getModelUrl(captureId);
    report.assert(modelUrl1 === modelUrl2, 'Model URL is cached across multiple requests');

    // Storage update
    await storage.updateMetadata(captureId, { altitudeOffset: 12, heading: 45 });
    const updatedMeta = await storage.getCaptureMetadata(captureId);
    report.assert(updatedMeta?.altitudeOffset === 12 && updatedMeta?.heading === 45, 'Metadata updated in storage');
  });

  await report.test('1.4 CustomSceneryManager georeferenced placement & transform matrix', async () => {
    const primitivesList: any[] = [];
    const mockScene: any = {
      primitives: {
        add: (p: any) => { primitivesList.push(p); return p; },
        remove: (p: any) => {
          const idx = primitivesList.indexOf(p);
          if (idx !== -1) primitivesList.splice(idx, 1);
          return true;
        },
      },
    };

    const origFromGltf = Cesium.Model.fromGltfAsync;
    let createdModelInstance: any = null;

    try {
      (Cesium.Model as any).fromGltfAsync = async (opts: any) => {
        createdModelInstance = {
          url: opts.url,
          modelMatrix: Cesium.Matrix4.clone(opts.modelMatrix || Cesium.Matrix4.IDENTITY),
          scale: opts.scale || 1.0,
          isDestroyed: () => false,
          destroy: () => {},
        };
        return createdModelInstance;
      };

      const manager = new CustomSceneryManager(mockScene);
      const cap: AlephCaptureMetadata = {
        id: 'cap-placement-test',
        name: 'Placement Test',
        lat: 41.89021,
        lon: 12.49223,
        baseAltitude: 24.0,
        altitudeOffset: 5.0,
        heading: 90.0,
        scale: 1.2,
        radius: 80.0,
        importedAt: Date.now(),
        isolationEnabled: false,
      };

      await manager.loadScenery(cap, 'blob:test-placement-url');

      report.assert(primitivesList.length === 1, 'Model added to Cesium primitives');
      report.assert(manager.getAltitudeOffset() === 5.0, 'Manager altitude offset is 5.0m');
      report.assert(manager.getHeading() === 90.0, 'Manager heading is 90.0°');
      report.assert(manager.getScale() === 1.2, 'Manager scale is 1.2x');

      const expectedOrigin = Cesium.Cartesian3.fromDegrees(12.49223, 41.89021, 29.0);
      const matrix = createdModelInstance.modelMatrix;
      const modelOrigin = new Cesium.Cartesian3(matrix[12], matrix[13], matrix[14]);
      const diff = Cesium.Cartesian3.distance(expectedOrigin, modelOrigin);
      report.assert(diff < 0.01, `Model placed accurately at geodetic origin (diff: ${diff.toFixed(4)}m)`);
    } finally {
      (Cesium.Model as any).fromGltfAsync = origFromGltf;
    }
  });

  await report.test('1.5 Scenery Isolation clipping planes & unionClippingRegions = false', () => {
    let assignedCollection: any = null;
    const mockTileset: any = {
      clippingPlanes: null,
    };
    Object.defineProperty(mockTileset, 'clippingPlanes', {
      get: () => assignedCollection,
      set: (c) => { assignedCollection = c; },
    });

    const manager = new CustomSceneryManager();
    manager.tileset = mockTileset;

    const cap: AlephCaptureMetadata = {
      id: 'cap-isolation-test',
      name: 'Isolation Test',
      lat: 41.89021,
      lon: 12.49223,
      baseAltitude: 24.0,
      altitudeOffset: 0,
      heading: 0,
      scale: 1.0,
      radius: 95.0,
      importedAt: Date.now(),
      isolationEnabled: false,
    };

    manager.setIsolation(true, 95.0);

    report.assert(manager.isIsolationEnabled() === true, 'Isolation is reported enabled');
    report.assert(manager.activePlanes.length === 4, '4 clipping planes created');

    const expectedRadius = 95.0 + 5.0; // 95m radius + 5m margin
    const expectedDistance = -expectedRadius;
    report.assert(manager.activePlanes[0].distance === expectedDistance, `Plane distance is ${expectedDistance}m`);

    // Verify outward normals
    const normals = manager.activePlanes.map(p => `${p.normal.x},${p.normal.y},${p.normal.z}`);
    report.assert(normals.includes('1,0,0'), 'Outward normal +X present');
    report.assert(normals.includes('-1,0,0'), 'Outward normal -X present');
    report.assert(normals.includes('0,1,0'), 'Outward normal +Y present');
    report.assert(normals.includes('0,-1,0'), 'Outward normal -Y present');

    // Verify ClippingPlaneCollection properties
    report.assert(assignedCollection !== null, 'Clipping collection assigned to tileset');
    report.assert(assignedCollection.unionClippingRegions === false, 'unionClippingRegions is explicitly FALSE');
  });

  await report.test('1.6 Presets generation & Timeline Shortest-Angular-Path Interpolation', () => {
    const opts: PresetOptions = {
      centerLat: 41.89021,
      centerLon: 12.49223,
      baseAltitude: 24.0,
      radius: 95.0,
      durationSeconds: 15,
      keyframeCount: 16,
    };

    const orbitKfs = cinematographyPresets.generateOrbitKeyframes(opts);
    report.assert(orbitKfs.length === 16, 'Orbit generated 16 keyframes');
    report.assert(orbitKfs[0].time === 0, 'Orbit starts at t=0');
    report.assert(orbitKfs[orbitKfs.length - 1].time === 15, 'Orbit ends at t=15');

    // Test timeline pose interpolation across 100 sample points
    let maxHeadingDelta = 0;
    for (let t = 0; t < 15; t += 0.15) {
      const pose1 = interpolatePose(t, orbitKfs);
      const pose2 = interpolatePose(t + 0.1, orbitKfs);
      report.assert(pose1 !== null && pose2 !== null, 'Interpolated pose is non-null');
      report.assert(Number.isFinite(pose1.lat) && Number.isFinite(pose1.lon), 'Coordinates are finite');

      // Check angular shortest distance
      let dHeading = Math.abs(pose2.heading - pose1.heading);
      if (dHeading > 180) dHeading = 360 - dHeading;
      if (dHeading > maxHeadingDelta) maxHeadingDelta = dHeading;
    }
    // Step is 0.1s in 15s orbit (360° total in 15s = 24°/s -> ~2.4° per 0.1s).
    // It should NEVER jump 340° across the 360°/0° boundary!
    report.assert(maxHeadingDelta < 20.0, `Heading interpolation is smooth across boundary (max delta: ${maxHeadingDelta.toFixed(2)}°)`);
  });

  await report.test('1.7 In-place slider mutations and clean teardown', () => {
    const primitivesList: any[] = [];
    let isModelDestroyed = false;
    const mockModel: any = {
      modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
      scale: 1.0,
      isDestroyed: () => isModelDestroyed,
      destroy: () => { isModelDestroyed = true; },
    };
    const mockScene: any = {
      primitives: {
        add: (p: any) => { primitivesList.push(p); return p; },
        remove: (p: any) => {
          const idx = primitivesList.indexOf(p);
          if (idx !== -1) primitivesList.splice(idx, 1);
          return true;
        },
      },
    };
    primitivesList.push(mockModel);

    let assignedCollection: any = null;
    const mockTileset: any = {
      clippingPlanes: null,
    };
    Object.defineProperty(mockTileset, 'clippingPlanes', {
      get: () => assignedCollection,
      set: (c) => { assignedCollection = c; },
    });

    const manager = new CustomSceneryManager(mockScene);
    manager.tileset = mockTileset;
    (manager as any).activeModel = mockModel;
    (manager as any).activeCapture = {
      id: 'cap-teardown',
      name: 'Teardown Capture',
      lat: 41.89021,
      lon: 12.49223,
      baseAltitude: 24.0,
      altitudeOffset: 0,
      heading: 0,
      scale: 1.0,
      radius: 95.0,
    };

    manager.setIsolation(true);
    const initialCollection = manager.tilesetClippingCollection;

    // Mutate sliders
    manager.updateTransform(20.0, 180.0, 1.5);
    report.assert(manager.getAltitudeOffset() === 20.0, 'Offset updated to 20m');
    report.assert(manager.getHeading() === 180.0, 'Heading updated to 180°');
    report.assert(manager.getScale() === 1.5, 'Scale updated to 1.5x');
    report.assert(mockModel.scale === 1.5, 'Model scale mutated in-place');
    report.assert(manager.tilesetClippingCollection === initialCollection, 'Collection preserved in-place');

    // Teardown
    manager.unloadScenery();
    report.assert(isModelDestroyed === true, 'Model was destroyed on unload');
    report.assert(primitivesList.length === 0, 'Primitives list cleared');
    report.assert(manager.tilesetClippingCollection === null, 'Clipping collection nullified');
    report.assert(mockTileset.clippingPlanes === undefined, 'Tileset clippingPlanes cleared');
  });

  // ==========================================================================
  // SECTION 2: Asynchronous Race Conditions & Concurrency
  // ==========================================================================
  console.log('\n▶ Section 2: Asynchronous Race Conditions & Concurrency');

  await report.test('2.1 Concurrent loadScenery calls with variable decode latencies & loadGeneration', async () => {
    const primitivesList: any[] = [];
    const mockScene: any = {
      primitives: {
        add: (p: any) => { primitivesList.push(p); return p; },
        remove: (p: any) => {
          const idx = primitivesList.indexOf(p);
          if (idx !== -1) primitivesList.splice(idx, 1);
          return true;
        },
      },
    };

    const origFromGltf = Cesium.Model.fromGltfAsync;
    const trackedModels: { id: string; destroyed: boolean }[] = [];

    try {
      (Cesium.Model as any).fromGltfAsync = async (opts: any) => {
        // Random latency between 5ms and 30ms
        const delay = Math.floor(Math.random() * 25) + 5;
        await sleep(delay);

        const entry = { id: opts.url, destroyed: false };
        const mockModel: any = {
          url: opts.url,
          isDestroyed: () => entry.destroyed,
          destroy: () => { entry.destroyed = true; },
          modelMatrix: Cesium.Matrix4.clone(opts.modelMatrix || Cesium.Matrix4.IDENTITY),
          scale: opts.scale || 1.0,
        };
        trackedModels.push(entry);
        return mockModel;
      };

      const manager = new CustomSceneryManager(mockScene);
      const CONCURRENT_OPS = 20;
      const promises: Promise<void>[] = [];

      for (let i = 0; i < CONCURRENT_OPS; i++) {
        const cap: AlephCaptureMetadata = {
          id: `race-cap-${i}`,
          name: `Race Capture ${i}`,
          lat: 40 + i * 0.1,
          lon: 10 + i * 0.1,
          baseAltitude: 100,
          altitudeOffset: 0,
          heading: 0,
          scale: 1.0,
          radius: 50,
          importedAt: Date.now(),
          isolationEnabled: false,
        };
        promises.push(manager.loadScenery(cap, `blob:race-model-${i}`));
      }

      await Promise.allSettled(promises);

      // Verify results
      report.assert(manager.getLoadGeneration() >= CONCURRENT_OPS, 'Load generation incremented on every call');
      report.assert(primitivesList.length === 1, `Exactly 1 active model in primitives (found ${primitivesList.length})`);

      const activeModel = manager.getModel();
      report.assert(activeModel !== null, 'An active model is present');
      report.assert(activeModel?.url === `blob:race-model-${CONCURRENT_OPS - 1}`, 'Last requested model is active model');

      const destroyedStale = trackedModels.filter(m => m.id !== activeModel?.url && m.destroyed);
      report.assert(destroyedStale.length === trackedModels.length - 1, 'All stale models were promptly destroyed');
    } finally {
      (Cesium.Model as any).fromGltfAsync = origFromGltf;
    }
  });

  await report.test('2.2 Rapid interleaved Load -> Unload -> Load with late arrival resolution', async () => {
    const primitivesList: any[] = [];
    const mockScene: any = {
      primitives: {
        add: (p: any) => { primitivesList.push(p); return p; },
        remove: (p: any) => {
          const idx = primitivesList.indexOf(p);
          if (idx !== -1) primitivesList.splice(idx, 1);
          return true;
        },
      },
    };

    const origFromGltf = Cesium.Model.fromGltfAsync;
    let modelADestroyed = false;

    try {
      (Cesium.Model as any).fromGltfAsync = async (opts: any) => {
        if (opts.url.includes('model-slow-A')) {
          await sleep(50); // Slow arrival
          return {
            url: opts.url,
            isDestroyed: () => modelADestroyed,
            destroy: () => { modelADestroyed = true; },
            modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
            scale: 1.0,
          };
        } else {
          await sleep(5); // Fast arrival
          return {
            url: opts.url,
            isDestroyed: () => false,
            destroy: () => {},
            modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
            scale: 1.0,
          };
        }
      };

      const manager = new CustomSceneryManager(mockScene);
      const capA: AlephCaptureMetadata = {
        id: 'cap-A',
        name: 'Model A',
        lat: 10,
        lon: 10,
        baseAltitude: 10,
        altitudeOffset: 0,
        heading: 0,
        scale: 1.0,
        radius: 50,
        importedAt: Date.now(),
        isolationEnabled: false,
      };
      const capB: AlephCaptureMetadata = {
        id: 'cap-B',
        name: 'Model B',
        lat: 20,
        lon: 20,
        baseAltitude: 20,
        altitudeOffset: 0,
        heading: 0,
        scale: 1.0,
        radius: 50,
        importedAt: Date.now(),
        isolationEnabled: false,
      };

      const promiseA = manager.loadScenery(capA, 'blob:model-slow-A');
      manager.unloadScenery();
      const promiseB = manager.loadScenery(capB, 'blob:model-fast-B');

      await Promise.all([promiseA, promiseB]);

      report.assert(manager.getActiveCapture()?.id === 'cap-B', 'Model B is active capture');
      report.assert(manager.getModel()?.url === 'blob:model-fast-B', 'Model B is active model');
      report.assert(modelADestroyed === true, 'Late-arriving Model A was destroyed upon resolution');
      report.assert(primitivesList.length === 1, 'Primitives list contains only Model B');
    } finally {
      (Cesium.Model as any).fromGltfAsync = origFromGltf;
    }
  });

  // ==========================================================================
  // SECTION 3: High-Frequency Interactivity & Zero Shader Re-linking
  // ==========================================================================
  console.log('\n▶ Section 3: High-Frequency Interactivity & Zero WebGL Shader Re-linking');

  await report.test('3.1 500 rapid slider drags preserve ClippingPlaneCollection identity and prevent shader stutter', () => {
    let collectionAssignmentCount = 0;
    let currentCollection: any = null;

    const mockTileset: any = {};
    Object.defineProperty(mockTileset, 'clippingPlanes', {
      get: () => currentCollection,
      set: (c) => {
        collectionAssignmentCount++;
        currentCollection = c;
      },
    });

    const mockModel: any = {
      modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
      scale: 1.0,
      isDestroyed: () => false,
      destroy: () => {},
    };

    const manager = new CustomSceneryManager();
    manager.tileset = mockTileset;
    (manager as any).activeModel = mockModel;
    (manager as any).activeCapture = {
      id: 'cap-slider-stress',
      name: 'Slider Stress Capture',
      lat: 41.89021,
      lon: 12.49223,
      baseAltitude: 24.0,
      altitudeOffset: 0,
      heading: 0,
      scale: 1.0,
      radius: 95.0,
    };

    // Enable isolation
    manager.setIsolation(true);
    const initialCollection = manager.tilesetClippingCollection;
    report.assert(initialCollection !== null, 'Initial clipping collection created');
    report.assert(collectionAssignmentCount === 1, 'Tileset clippingPlanes assigned once on enable');

    const DRAG_COUNT = 500;
    const t0 = performance.now();

    for (let i = 0; i < DRAG_COUNT; i++) {
      const altOffset = -100 + (i % 200); // cycle through offsets
      const heading = (i * 1.5) % 360;
      const scale = 0.5 + (i % 45) * 0.1;
      manager.updateTransform(altOffset, heading, scale);

      report.assert(
        manager.tilesetClippingCollection === initialCollection,
        `Drag ${i}: Clipping collection identity preserved`
      );
    }

    const elapsed = performance.now() - t0;
    console.log(`      500 slider updates executed in ${elapsed.toFixed(2)}ms (${(elapsed / DRAG_COUNT).toFixed(3)}ms/update)`);

    report.assert(collectionAssignmentCount === 1, 'Zero redundant re-assignments to tileset.clippingPlanes');
    report.assert(elapsed < 250, '500 updates completed well within 250ms (real-time 60fps capability)');
  });

  // ==========================================================================
  // SECTION 4: Geodetic & Boundary Fuzzing
  // ==========================================================================
  console.log('\n▶ Section 4: Geodetic & Boundary Fuzzing (Poles, Antimeridian, Depths, Peaks, Heading Wraps)');

  const pathologicalSites = [
    { name: 'North Pole exact', lat: 90.0, lon: 0.0, alt: 0 },
    { name: 'South Pole exact', lat: -90.0, lon: 0.0, alt: 0 },
    { name: 'Antimeridian positive', lat: 0.0, lon: 180.0, alt: 50 },
    { name: 'Antimeridian negative', lat: 0.0, lon: -180.0, alt: 50 },
    { name: 'Dead Sea (sub-sea level)', lat: 31.5, lon: 35.5, alt: -430.0 },
    { name: 'Mariana Trench (extreme sub-sea level)', lat: 11.35, lon: 142.2, alt: -10994.0 },
    { name: 'Mount Everest (extreme peak elevation)', lat: 27.9881, lon: 86.9250, alt: 8848.86 },
    { name: 'Stratosphere High Altitude', lat: 45.0, lon: 9.0, alt: 25000.0 },
  ];

  for (const site of pathologicalSites) {
    await report.test(`4.1 Geodetic placement & trajectory generation at ${site.name}`, () => {
      const manager = new CustomSceneryManager();
      const cap: AlephCaptureMetadata = {
        id: `site-${site.name}`,
        name: site.name,
        lat: site.lat,
        lon: site.lon,
        baseAltitude: site.alt,
        altitudeOffset: 0,
        heading: 0,
        scale: 1.0,
        radius: 100.0,
        importedAt: Date.now(),
        isolationEnabled: true,
      };

      manager.setIsolation(true);
      report.assert(manager.activePlanes.length === 4, 'Isolation planes computed');

      const orbit = cinematographyPresets.generateOrbitKeyframes({
        centerLat: site.lat,
        centerLon: site.lon,
        baseAltitude: site.alt,
        radius: 100.0,
      });
      report.assert(orbit.length > 0, 'Orbit keyframes generated');

      for (const kf of orbit) {
        report.assert(Number.isFinite(kf.lat) && Number.isFinite(kf.lon), 'Coordinates are finite');
        report.assert(Number.isFinite(kf.altitude) && kf.altitude >= site.alt, 'Altitude is above site base');
        report.assert(kf.heading >= 0 && kf.heading < 360, 'Heading is normalized [0, 360)');
      }

      const flyby = cinematographyPresets.generateFlyByKeyframes({
        centerLat: site.lat,
        centerLon: site.lon,
        baseAltitude: site.alt,
        radius: 100.0,
      });
      report.assert(flyby.length > 0, 'Fly-by keyframes generated');

      const spiral = cinematographyPresets.generateSpiralRevealKeyframes({
        centerLat: site.lat,
        centerLon: site.lon,
        baseAltitude: site.alt,
        radius: 100.0,
      });
      report.assert(spiral.length > 0, 'Spiral keyframes generated');
    });
  }

  await report.test('4.2 Radius edge cases: zero, negative, extreme 50,000m, and NaN', () => {
    const manager = new CustomSceneryManager();

    // Zero radius
    manager.setIsolation(true, 0);
    report.assert(manager.activePlanes[0].distance <= -15.0, 'Zero radius enforces minimum safe radius 10m + 5m margin');

    // Negative radius
    const orbitNeg = cinematographyPresets.generateOrbitKeyframes({
      centerLat: 40,
      centerLon: 10,
      baseAltitude: 50,
      radius: -100,
    });
    report.assert(orbitNeg.length > 0 && orbitNeg[0].altitude > 50, 'Negative radius handled with safe default');

    // Extreme radius (50,000m)
    const orbitHuge = cinematographyPresets.generateOrbitKeyframes({
      centerLat: 40,
      centerLon: 10,
      baseAltitude: 50,
      radius: 50000,
    });
    report.assert(orbitHuge.every(k => Number.isFinite(k.lat) && Number.isFinite(k.lon)), 'Huge radius generates finite coordinates');

    // NaN radius
    const orbitNan = cinematographyPresets.generateOrbitKeyframes({
      centerLat: 40,
      centerLon: 10,
      baseAltitude: 50,
      radius: NaN,
    });
    report.assert(orbitNan.every(k => Number.isFinite(k.lat) && Number.isFinite(k.altitude)), 'NaN radius handled without poisoning coordinates');
  });

  await report.test('4.3 Heading boundary normalization & shortest angular path wrapping', () => {
    // Normalization tests
    report.assert(normalizeHeading(0) === 0, '0° normalizes to 0');
    report.assert(normalizeHeading(360) === 0, '360° normalizes to 0');
    report.assert(normalizeHeading(720) === 0, '720° normalizes to 0');
    report.assert(normalizeHeading(450) === 90, '450° normalizes to 90°');
    report.assert(normalizeHeading(-90) === 270, '-90° normalizes to 270°');
    report.assert(normalizeHeading(-360) === 0, '-360° normalizes to 0');

    // Shortest angular path in interpolatePose: 350° -> 10°
    const kfsWrap = [
      { id: 'k0', time: 0, lat: 40, lon: 10, altitude: 100, heading: 350, pitch: -15, roll: 0 },
      { id: 'k1', time: 10, lat: 40, lon: 10, altitude: 100, heading: 10, pitch: -15, roll: 0 },
    ];

    const midPose = interpolatePose(5, kfsWrap);
    report.assert(midPose !== null, 'Midpoint pose exists');
    // At midpoint t=5: heading should be 0° (or 360°), NOT 180°!
    const headingMid = midPose.heading;
    report.assert(
      headingMid === 0 || headingMid === 360 || Math.abs(headingMid) < 1e-4,
      `Midpoint heading between 350° and 10° is 0° (got ${headingMid}°)`
    );

    // Counter-clockwise crossing: 10° -> 350°
    const kfsWrapRev = [
      { id: 'k0', time: 0, lat: 40, lon: 10, altitude: 100, heading: 10, pitch: -15, roll: 0 },
      { id: 'k1', time: 10, lat: 40, lon: 10, altitude: 100, heading: 350, pitch: -15, roll: 0 },
    ];
    const midPoseRev = interpolatePose(5, kfsWrapRev);
    report.assert(
      midPoseRev.heading === 0 || midPoseRev.heading === 360 || Math.abs(midPoseRev.heading) < 1e-4,
      `Midpoint heading between 10° and 350° is 0° (got ${midPoseRev.heading}°)`
    );
  });

  await report.test('4.4 Input validation clamps and non-numeric rejection', () => {
    const manager = new CustomSceneryManager();

    // Altitude clamp
    report.assert(manager.clampAltitudeOffset(-150) === -100, 'Clamps min altitude -100');
    report.assert(manager.clampAltitudeOffset(250) === 100, 'Clamps max altitude +100');
    report.assert(manager.clampAltitudeOffset(0.001) === 0.001, 'Preserves fine offset');

    // Scale clamp
    report.assert(manager.clampScale(0.05) === 0.1, 'Clamps min scale 0.1');
    report.assert(manager.clampScale(10.0) === 5.0, 'Clamps max scale 5.0');

    // Reject non-numeric
    assert.throws(() => manager.clampAltitudeOffset(NaN), /Invalid altitude offset/);
    assert.throws(() => manager.clampAltitudeOffset('abc' as any), /Invalid altitude offset/);
    assert.throws(() => manager.clampScale(0), /Invalid scale factor/);
    assert.throws(() => manager.clampScale(-2), /Invalid scale factor/);
    assert.throws(() => manager.normalizeHeading(Infinity), /Invalid heading/);
  });

  // ==========================================================================
  // SECTION 5: Non-Regression Verification of Flight Simulator Systems
  // ==========================================================================
  console.log('\n▶ Section 5: Non-Regression of Existing Flight Simulator Systems');

  await report.test('5.1 Verify standard airport locations in LocationSelector.tsx', () => {
    const locSelectorPath = path.join(rootDir, 'packages/web/src/react/features/location/components/LocationSelector.tsx');
    const content = fs.readFileSync(locSelectorPath, 'utf8');

    const expectedLocations = [
      'Eiffel Tower', 'Times Square', 'Tokyo Tower', 'Burj Khalifa',
      'Big Ben', 'Opera House', 'Christ the Redeemer', 'Golden Gate Bridge',
      'Great Pyramid', 'Reykjavik', 'Marina Bay', 'Sagrada Familia', 'Gothenburg'
    ];

    for (const loc of expectedLocations) {
      report.assert(content.includes(loc), `Standard location '${loc}' exists in LocationSelector`);
    }
  });

  await report.test('5.2 Verify HUD telemetry and flight controls presets', () => {
    const flightControlsPath = path.join(rootDir, 'packages/web/src/react/features/director/components/sections/FlightControls.tsx');
    const content = fs.readFileSync(flightControlsPath, 'utf8');

    report.assert(content.includes('SPEED_PRESETS'), 'SPEED_PRESETS exists in FlightControls');
    report.assert(content.includes('Slow') && content.includes('Normal') && content.includes('Fast'), 'All speed preset labels present (Slow, Normal, Fast)');
    report.assert(content.includes('30') && content.includes('60') && content.includes('100'), 'All speed preset numeric values present (30, 60, 100)');
  });

  await report.test('5.3 Verify GameBridge quality presets and camera modes', () => {
    const gameBridgePath = path.join(rootDir, 'packages/web/src/cesium/bridge/GameBridge.ts');
    const content = fs.readFileSync(gameBridgePath, 'utf8');

    report.assert(content.includes('applyQualityPreset'), 'applyQualityPreset method present');
    report.assert(content.includes('performance') && content.includes('balanced') && content.includes('quality') && content.includes('ultra'), 'Quality presets defined');
    report.assert(content.includes('maximumScreenSpaceError'), 'Screen space error configuration preserved');
  });

  await report.test('5.4 Verify Scene.ts integration contract and CustomSceneryManager lifecycle', () => {
    const scenePath = path.join(rootDir, 'packages/web/src/cesium/core/Scene.ts');
    const content = fs.readFileSync(scenePath, 'utf8');

    report.assert(content.includes('customSceneryManager'), 'Scene initializes customSceneryManager');
    report.assert(content.includes('CustomSceneryManager'), 'CustomSceneryManager imported in Scene');
  });

  // ==========================================================================
  // SECTION 6: Bundled Colosseum Sample Physical Inspection
  // ==========================================================================
  console.log('\n▶ Section 6: Bundled Colosseum Sample Physical Inspection');

  await report.test('6.1 Colosseum sample directory files exist and have non-zero sizes', () => {
    const colosseumDir = path.join(rootDir, 'packages/web/public/samples/colosseum');
    const glbPath = path.join(colosseumDir, 'mesh.glb');
    const metaPath = path.join(colosseumDir, 'metadata.json');
    const thumbPath = path.join(colosseumDir, 'thumbnail.jpg');

    report.assert(fs.existsSync(glbPath), 'mesh.glb exists on disk');
    report.assert(fs.existsSync(metaPath), 'metadata.json exists on disk');
    report.assert(fs.existsSync(thumbPath), 'thumbnail.jpg exists on disk');

    const glbStat = fs.statSync(glbPath);
    const metaStat = fs.statSync(metaPath);
    const thumbStat = fs.statSync(thumbPath);

    report.assert(glbStat.size > 100000, `mesh.glb is non-trivial model (>100KB, actual: ${glbStat.size} bytes)`);
    report.assert(metaStat.size > 100, `metadata.json has valid content (${metaStat.size} bytes)`);
    report.assert(thumbStat.size > 1000, `thumbnail.jpg is valid image (${thumbStat.size} bytes)`);
  });

  await report.test('6.2 Colosseum binary GLB header and embedded georeference extras verification', () => {
    const glbPath = path.join(rootDir, 'packages/web/public/samples/colosseum/mesh.glb');
    const buffer = fs.readFileSync(glbPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const parsed = parseGlbBuffer(arrayBuffer, 'mesh.glb');
    report.assert(Math.abs(parsed.metadata.lat - 41.8902) < 0.01, `Colosseum latitude is ~41.8902 (got ${parsed.metadata.lat})`);
    report.assert(Math.abs(parsed.metadata.lon - 12.4922) < 0.01, `Colosseum longitude is ~12.4922 (got ${parsed.metadata.lon})`);
    report.assert(parsed.metadata.radius > 50.0, `Colosseum radius is > 50m (got ${parsed.metadata.radius}m)`);
  });

  await report.test('6.3 Colosseum metadata.json schema consistency', () => {
    const metaPath = path.join(rootDir, 'packages/web/public/samples/colosseum/metadata.json');
    const metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    report.assert(typeof metaJson.name === 'string', 'metadata.json has valid name string');
    report.assert(Number.isFinite(metaJson.lat), 'metadata.json has valid lat');
    report.assert(Number.isFinite(metaJson.lon), 'metadata.json has valid lon');
    report.assert(Number.isFinite(metaJson.baseAltitude ?? metaJson.baseElevation), 'metadata.json has valid base elevation');
    report.assert(Number.isFinite(metaJson.radius ?? metaJson.boundingRadius), 'metadata.json has valid radius');
  });

  const success = report.summary();
  if (!success) {
    process.exit(1);
  }
}

runMasterAdversarialSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
