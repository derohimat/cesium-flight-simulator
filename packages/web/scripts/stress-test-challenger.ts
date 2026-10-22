import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Polyfill environment globals before importing services
(globalThis as any).indexedDB = indexedDB;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to construct a synthetic valid GLB buffer
function buildSyntheticGlb(options: {
  lat?: number;
  lon?: number;
  base?: number;
  radius?: number;
  name?: string;
  bounds?: [number, number, number, number];
} = {}): Uint8Array {
  const {
    lat = 41.8902,
    lon = 12.4922,
    base = 24.0,
    radius = 95.0,
    name = 'Colosseum Photogrammetry',
    bounds = [41.889, 12.491, 41.891, 12.493],
  } = options;

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Aleph 3D Pipeline',
      extras: {
        latitude: lat,
        longitude: lon,
        base: base,
        radius: radius,
        bounds: bounds,
        name: name,
        description: 'Synthetic photogrammetric test capture',
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'RootNode' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        type: 'VEC3',
        componentType: 5126,
        count: 8,
        min: [-radius, 0, -radius],
        max: [radius, 50, radius],
      },
    ],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const chunk0Length = jsonBytes.length + jsonPadding;

  const binPayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const binPadding = (4 - (binPayload.length % 4)) % 4;
  const chunk1Length = binPayload.length + binPadding;

  const totalLength = 12 + (8 + chunk0Length) + (8 + chunk1Length);
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  // Header
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);          // version 2
  view.setUint32(8, totalLength, true);

  // Chunk 0 (JSON)
  view.setUint32(12, chunk0Length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  buffer.set(jsonBytes, 20);
  for (let i = 0; i < jsonPadding; i++) {
    buffer[20 + jsonBytes.length + i] = 0x20; // space padding
  }

  // Chunk 1 (BIN)
  const chunk1Offset = 20 + chunk0Length;
  view.setUint32(chunk1Offset, chunk1Length, true);
  view.setUint32(chunk1Offset + 4, 0x004e4942, true); // "BIN\0"
  buffer.set(binPayload, chunk1Offset + 8);

  return buffer;
}

// Minimal ZIP generator for testing ZIP package ingestion
function buildSyntheticZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const data = entry.data;

    // Local file header (30 bytes + name + data)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local header signature
    lv.setUint16(4, 20, true);         // Version needed
    lv.setUint16(6, 0, true);          // Flags
    lv.setUint16(8, 0, true);          // Compression (0 = Stored)
    lv.setUint16(10, 0, true);         // Time
    lv.setUint16(12, 0, true);         // Date
    lv.setUint32(14, 0, true);         // CRC32 (mock 0)
    lv.setUint32(18, data.length, true); // Compressed size
    lv.setUint32(22, data.length, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, data);

    // Central directory header (46 bytes + name)
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // Relative offset of local header
    cdHeader.set(nameBytes, 46);

    centralDirParts.push(cdHeader);
    offset += localHeader.length + data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const p of centralDirParts) cdSize += p.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);

  // Total size
  let total = 0;
  for (const p of parts) total += p.length;
  for (const p of centralDirParts) total += p.length;
  total += eocd.length;

  const result = new Uint8Array(total);
  let cur = 0;
  for (const p of parts) {
    result.set(p, cur);
    cur += p.length;
  }
  for (const p of centralDirParts) {
    result.set(p, cur);
    cur += p.length;
  }
  result.set(eocd, cur);

  return result;
}

// Import code under test
import {
  parseGlbBuffer,
  parseMetadataJson,
  parseCapturePackage,
  sceneryStorage,
  SceneryStorageService,
  BUNDLED_SAMPLE_ID,
} from '../src/services/aleph/index';

describe('CHALLENGER SUITE 1: Multi-file Drop Processing & Packaging', () => {
  it('1.1 Standalone GLB drop: correctly extracts metadata & creates glbBlob', async () => {
    const glbData = buildSyntheticGlb({
      lat: 41.8902,
      lon: 12.4922,
      base: 24.5,
      radius: 95.0,
      name: 'Standalone Colosseum',
    });

    const file = new File([glbData], 'flavian_colosseum.glb', { type: 'model/gltf-binary' });
    const parsed = await parseCapturePackage([file]);

    assert.ok(parsed.metadata, 'Metadata must be produced');
    assert.strictEqual(parsed.metadata.name, 'Standalone Colosseum');
    assert.strictEqual(parsed.metadata.lat, 41.8902);
    assert.strictEqual(parsed.metadata.lon, 12.4922);
    assert.strictEqual(parsed.metadata.baseAltitude, 24.5);
    assert.strictEqual(parsed.metadata.radius, 95.0);
    assert.strictEqual(parsed.metadata.isolationEnabled, true);
    assert.strictEqual(parsed.glbBlob.type, 'model/gltf-binary');
    assert.strictEqual(parsed.glbBlob.size, glbData.byteLength);
    assert.strictEqual(parsed.thumbnailBlob, undefined);
  });

  it('1.2 Multi-file drop: companion metadata.json overrides/supplements GLB extras', async () => {
    const glbData = buildSyntheticGlb({
      lat: 41.0,
      lon: 12.0,
      name: 'Old Name',
    });
    const glbFile = new File([glbData], 'mesh.glb', { type: 'model/gltf-binary' });

    const companionJson = JSON.stringify({
      name: 'Companion Overridden Monument',
      latitude: 41.8902,
      longitude: 12.4922,
      baseAltitude: 30.0,
      altitudeOffset: 12.5,
      heading: 90.0,
      scale: 1.5,
      radius: 110.0,
      description: 'Extracted with drone photogrammetry and companion config',
      isolationEnabled: false,
    });
    const jsonFile = new File([companionJson], 'metadata.json', { type: 'application/json' });

    const parsed = await parseCapturePackage([glbFile, jsonFile]);

    assert.strictEqual(parsed.metadata.name, 'Companion Overridden Monument');
    assert.strictEqual(parsed.metadata.lat, 41.8902);
    assert.strictEqual(parsed.metadata.lon, 12.4922);
    assert.strictEqual(parsed.metadata.baseAltitude, 30.0);
    assert.strictEqual(parsed.metadata.altitudeOffset, 12.5);
    assert.strictEqual(parsed.metadata.heading, 90.0);
    assert.strictEqual(parsed.metadata.scale, 1.5);
    assert.strictEqual(parsed.metadata.radius, 110.0);
    assert.strictEqual(parsed.metadata.isolationEnabled, false);
    assert.ok(parsed.metadata.description?.includes('drone photogrammetry'));
  });

  it('1.3 Multi-file drop: companion thumbnail image is captured and creates thumbnail URL', async () => {
    const glbData = buildSyntheticGlb();
    const glbFile = new File([glbData], 'mesh.glb');
    const thumbData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
    const thumbFile = new File([thumbData], 'preview.png', { type: 'image/png' });

    const parsed = await parseCapturePackage([glbFile, thumbFile]);
    assert.ok(parsed.thumbnailBlob, 'Thumbnail blob should be extracted');
    assert.strictEqual(parsed.thumbnailBlob.size, thumbData.byteLength);
    assert.ok(parsed.metadata.thumbnailUrl?.startsWith('blob:'), 'Thumbnail URL should be a blob URL');
  });

  it('1.4 Order permutation resilience: [metadata.json, thumbnail.jpg, mesh.glb] behaves identically', async () => {
    const glbData = buildSyntheticGlb();
    const glbFile = new File([glbData], 'model.glb');
    const jsonFile = new File([JSON.stringify({ name: 'Permuted Order Capture' })], 'manifest.json');
    const thumbFile = new File([new Uint8Array([1, 2, 3])], 'thumb.jpg', { type: 'image/jpeg' });

    // Pass in inverted order
    const parsed = await parseCapturePackage([jsonFile, thumbFile, glbFile]);
    assert.strictEqual(parsed.metadata.name, 'Permuted Order Capture');
    assert.ok(parsed.glbBlob);
    assert.ok(parsed.thumbnailBlob);
  });

  it('1.5 Manifest.json with Aleph polygon format: computes centroid and bounds', async () => {
    const glbData = buildSyntheticGlb();
    const glbFile = new File([glbData], 'mesh.glb');
    const alephManifest = JSON.stringify({
      format: 'aleph-python',
      version: 6,
      polygon: [
        [41.888, 12.490],
        [41.892, 12.490],
        [41.892, 12.494],
        [41.888, 12.494],
      ],
    });
    const manifestFile = new File([alephManifest], 'manifest.json');

    const parsed = await parseCapturePackage([glbFile, manifestFile]);
    assert.strictEqual(parsed.metadata.lat, 41.890);
    assert.strictEqual(parsed.metadata.lon, 12.492);
    assert.deepStrictEqual(parsed.metadata.bounds, [41.888, 12.490, 41.892, 12.494]);
  });

  it('1.6 ZIP package ingestion: extracts mesh.glb, metadata.json, and thumbnail from ZIP', async () => {
    const glbData = buildSyntheticGlb({ name: 'Zipped Amphitheatre' });
    const metaJson = JSON.stringify({
      name: 'Zipped Amphitheatre Enhanced',
      altitudeOffset: 5.5,
    });
    const thumbBytes = new Uint8Array([137, 80, 78, 71]);

    const zipData = buildSyntheticZip([
      { name: 'mesh.glb', data: glbData },
      { name: 'metadata.json', data: new TextEncoder().encode(metaJson) },
      { name: 'thumbnail.png', data: thumbBytes },
    ]);

    const zipFile = new File([zipData], 'colosseum_capture.zip', { type: 'application/zip' });
    const parsed = await parseCapturePackage([zipFile]);

    assert.strictEqual(parsed.metadata.name, 'Zipped Amphitheatre Enhanced');
    assert.strictEqual(parsed.metadata.altitudeOffset, 5.5);
    assert.ok(parsed.glbBlob);
    assert.strictEqual(parsed.glbBlob.size, glbData.byteLength);
    assert.ok(parsed.thumbnailBlob);
  });

  it('1.7 Invalid drops rejection: missing GLB, empty drop, corrupted ZIP without GLB', async () => {
    // Drop with no GLB
    const textFile = new File(['just some text'], 'readme.txt', { type: 'text/plain' });
    await assert.rejects(
      parseCapturePackage([textFile]),
      /No \.glb 3D model found/
    );

    // Empty file list
    await assert.rejects(
      parseCapturePackage([]),
      /No files provided for ingestion/
    );

    // ZIP without GLB
    const emptyZipData = buildSyntheticZip([
      { name: 'notes.txt', data: new TextEncoder().encode('hello') },
    ]);
    const badZipFile = new File([emptyZipData], 'archive.zip');
    await assert.rejects(
      parseCapturePackage([badZipFile]),
      /No \.glb model file found inside the ZIP archive/
    );

    // Corrupted companion JSON should not crash ingestion
    const glbFile = new File([buildSyntheticGlb({ name: 'Safe Fallback' })], 'mesh.glb');
    const corruptJsonFile = new File(['{not-valid-json:'], 'metadata.json');
    const parsedSafe = await parseCapturePackage([glbFile, corruptJsonFile]);
    assert.strictEqual(parsedSafe.metadata.name, 'Safe Fallback');
  });
});

describe('CHALLENGER SUITE 2: Sample Auto-Seeding Idempotency Across Multiple Inits', () => {
  let sampleGlb: Uint8Array;
  let sampleMeta: any;

  before(() => {
    // Read real bundled Colosseum assets from disk
    const sampleDir = path.resolve(__dirname, '../public/samples/colosseum');
    sampleGlb = new Uint8Array(fs.readFileSync(path.join(sampleDir, 'mesh.glb')));
    sampleMeta = JSON.parse(fs.readFileSync(path.join(sampleDir, 'metadata.json'), 'utf-8'));

    // Mock global window and fetch
    (globalThis as any).window = globalThis;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes('metadata.json')) {
        return {
          ok: true,
          json: async () => sampleMeta,
        };
      }
      if (url.includes('mesh.glb')) {
        return {
          ok: true,
          blob: async () => new Blob([sampleGlb], { type: 'model/gltf-binary' }),
        };
      }
      return { ok: false, status: 404 };
    };
  });

  it('2.1 Sequential repeated inits: calling init() 10 consecutive times maintains exactly 1 record', async () => {
    const storage = new SceneryStorageService();

    // Call init 10 times consecutively
    for (let i = 0; i < 10; i++) {
      await storage.init();
    }

    const all = await storage.getAllCaptures();
    const sampleMatches = all.filter(c => c.id === BUNDLED_SAMPLE_ID);

    assert.strictEqual(sampleMatches.length, 1, 'Exactly one bundled sample must exist');
    assert.strictEqual(sampleMatches[0].id, BUNDLED_SAMPLE_ID);
    assert.strictEqual(sampleMatches[0].isBundled, true);
    assert.strictEqual(sampleMatches[0].name, sampleMeta.name);

    const modelBlob = await storage.getModelBlob(BUNDLED_SAMPLE_ID);
    assert.ok(modelBlob, 'Model blob must be retrievable');
    assert.strictEqual(modelBlob.size, sampleGlb.byteLength);
  });

  it('2.2 Concurrent inits: Promise.all([init(), init(), init(), init()]) does not duplicate or throw', async () => {
    // Reset DB or use fresh instance
    const storage = new SceneryStorageService();

    // Fire 5 concurrent inits
    await Promise.all([
      storage.init(),
      storage.init(),
      storage.init(),
      storage.init(),
      storage.init(),
    ]);

    const all = await storage.getAllCaptures();
    const sampleMatches = all.filter(c => c.id === BUNDLED_SAMPLE_ID);
    assert.strictEqual(sampleMatches.length, 1, 'Only 1 record must exist under concurrent inits');
  });

  it('2.3 User modifications preservation: subsequent inits NEVER overwrite modified sliders/attributes', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    // User fine-tunes sliders in UI
    await storage.updateMetadata(BUNDLED_SAMPLE_ID, {
      altitudeOffset: 42.5,
      heading: 185.0,
      scale: 2.2,
      name: 'Custom Tuned Colosseum',
      isolationEnabled: false,
    });

    // Simulate multiple browser refreshes
    for (let i = 0; i < 5; i++) {
      await storage.init();
    }

    const current = await storage.getCaptureMetadata(BUNDLED_SAMPLE_ID);
    assert.ok(current, 'Sample must exist');
    assert.strictEqual(current.altitudeOffset, 42.5, 'altitudeOffset must be preserved');
    assert.strictEqual(current.heading, 185.0, 'heading must be preserved');
    assert.strictEqual(current.scale, 2.2, 'scale must be preserved');
    assert.strictEqual(current.name, 'Custom Tuned Colosseum', 'name must be preserved');
    assert.strictEqual(current.isolationEnabled, false, 'isolationEnabled must be preserved');
  });

  it('2.4 Delete and re-seed lifecycle: sample can be re-seeded if wiped', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    // Delete sample
    await storage.deleteCapture(BUNDLED_SAMPLE_ID);
    assert.strictEqual(await storage.getCaptureMetadata(BUNDLED_SAMPLE_ID), null);
    assert.strictEqual(await storage.getModelBlob(BUNDLED_SAMPLE_ID), null);

    // Call init again (e.g. restore sample)
    await storage.init();
    const restored = await storage.getCaptureMetadata(BUNDLED_SAMPLE_ID);
    assert.ok(restored, 'Sample must be re-seeded after explicit deletion');
    assert.strictEqual(restored.id, BUNDLED_SAMPLE_ID);
  });
});

describe('CHALLENGER SUITE 3: UI State Synchronization & Object URL Lifecycle', () => {
  it('3.1 Deleting a custom capture removes it completely from both object stores', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    const customId = `custom-test-${Date.now()}`;
    const glbData = buildSyntheticGlb();
    const meta = {
      id: customId,
      name: 'Temporary Test Capture',
      lat: 35.6895,
      lon: 139.6917,
      baseAltitude: 40.0,
      altitudeOffset: 0,
      heading: 0,
      scale: 1.0,
      radius: 60.0,
      importedAt: Date.now(),
      isolationEnabled: true,
    };

    await storage.saveCapture(meta, new Blob([glbData]));

    // Verify presence
    assert.ok(await storage.getCaptureMetadata(customId));
    assert.ok(await storage.getModelBlob(customId));

    // Delete
    await storage.deleteCapture(customId);

    // Verify deletion
    assert.strictEqual(await storage.getCaptureMetadata(customId), null);
    assert.strictEqual(await storage.getModelBlob(customId), null);
  });

  it('3.2 Object URL caching and cleanup: getModelUrl caches URL and deleteCapture revokes it', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    const customId = `url-lifecycle-${Date.now()}`;
    const glbData = buildSyntheticGlb();
    await storage.saveCapture(
      {
        id: customId,
        name: 'URL Lifecycle Capture',
        lat: 0,
        lon: 0,
        baseAltitude: 0,
        altitudeOffset: 0,
        heading: 0,
        scale: 1.0,
        radius: 10,
        importedAt: Date.now(),
        isolationEnabled: true,
      },
      new Blob([glbData])
    );

    // Spy on URL.revokeObjectURL
    const revokedUrls: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
      origRevoke?.call(URL, url);
    };

    try {
      // 1. First call creates URL
      const url1 = await storage.getModelUrl(customId);
      assert.ok(url1?.startsWith('blob:'), 'Must produce a blob URL');

      // 2. Second call returns cached URL without re-creating
      const url2 = await storage.getModelUrl(customId);
      assert.strictEqual(url1, url2, 'Consecutive getModelUrl calls must return the identical cached URL');

      // 3. Deleting capture revokes the active Object URL
      await storage.deleteCapture(customId);
      assert.ok(revokedUrls.includes(url1!), 'Active Object URL must be revoked on deletion');

      // 4. Subsequent getModelUrl returns null
      const urlAfterDelete = await storage.getModelUrl(customId);
      assert.strictEqual(urlAfterDelete, null, 'Deleted capture returns null URL');
    } finally {
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('3.3 Deleting non-existent capture is idempotent and does not throw', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    await assert.doesNotReject(async () => {
      await storage.deleteCapture('non-existent-id-xyz');
    }, 'Deleting non-existent ID should complete cleanly');
  });

  it('3.4 LocationLibrary Category Counts and Filter Synchronization Simulation', async () => {
    const storage = new SceneryStorageService();
    await storage.init();

    // Mock curated places count
    const presetLocations = [
      { id: 'place-1', name: 'Preset 1', category: 'landmark' },
      { id: 'place-2', name: 'Preset 2', category: 'city' },
      { id: 'place-3', name: 'Preset 3', category: 'nature' },
    ];

    // Seed 2 custom captures
    const idA = 'custom-a';
    const idB = 'custom-b';
    await storage.saveCapture(
      {
        id: idA,
        name: 'Site A',
        lat: 10,
        lon: 10,
        baseAltitude: 0,
        altitudeOffset: 0,
        heading: 0,
        scale: 1,
        radius: 20,
        importedAt: 100,
        isolationEnabled: true,
      },
      new Blob([new Uint8Array([1, 2])])
    );
    await storage.saveCapture(
      {
        id: idB,
        name: 'Site B',
        lat: 20,
        lon: 20,
        baseAltitude: 0,
        altitudeOffset: 0,
        heading: 0,
        scale: 1,
        radius: 20,
        importedAt: 200,
        isolationEnabled: true,
      },
      new Blob([new Uint8Array([3, 4])])
    );

    // Simulate LocationLibrary loadCaptures
    const fetchCustomLocations = async () => {
      const captures = await storage.getAllCaptures();
      return captures.map(c => ({
        id: c.id,
        name: c.name,
        category: 'custom' as const,
        isCustom: true,
        isBundled: c.isBundled,
      }));
    };

    let customLocations = await fetchCustomLocations();
    // Exclude bundled sample from custom counts if needed, or count total custom
    let totalCustom = customLocations.length;
    let totalLocations = presetLocations.length + totalCustom;
    assert.strictEqual(totalCustom, 3, 'Bundled sample + 2 custom captures = 3 custom locations');
    assert.strictEqual(totalLocations, 6);

    // Simulate selecting Site A
    let selectedCustomId: string | null = idA;

    // Delete Site A
    await storage.deleteCapture(idA);
    if (selectedCustomId === idA) {
      selectedCustomId = null; // Matches LocationLibrary.tsx line 187
    }

    customLocations = await fetchCustomLocations();
    totalCustom = customLocations.length;
    assert.strictEqual(totalCustom, 2, 'Custom count drops to 2');
    assert.strictEqual(selectedCustomId, null, 'Active selection cleared on deleted item');
    assert.ok(!customLocations.some(c => c.id === idA), 'Deleted capture removed from list');

    // Simulate selecting Site B
    selectedCustomId = idB;

    // Delete Site B
    await storage.deleteCapture(idB);
    if (selectedCustomId === idB) {
      selectedCustomId = null;
    }

    customLocations = await fetchCustomLocations();
    totalCustom = customLocations.length;
    assert.strictEqual(totalCustom, 1, 'Only bundled sample remains');
    assert.strictEqual(selectedCustomId, null);
  });
});
