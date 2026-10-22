/**
 * Comprehensive Empirical Stress Test Harness for Milestone 1
 * Tests:
 * 1. alephParser.ts (Fuzzing, corrupted GLBs, missing extras, boundary coordinates, fallback bounds)
 * 2. sceneryStorage.ts (IndexedDB stress, concurrent ops, bad IDs, large blobs, special chars)
 * 3. Colosseum bundled sample (Binary GLB validity, chunk structure, geometry accessors)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper assertion library
class StressAssert {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(name, fn) {
    this.total++;
    try {
      fn();
      this.passed++;
      console.log(`    \x1b[32m✓\x1b[0m ${name}`);
    } catch (err) {
      this.failed++;
      this.errors.push({ name, error: err });
      console.log(`    \x1b[31m✗\x1b[0m ${name}`);
      console.log(`      \x1b[31mError:\x1b[0m ${err.message}`);
    }
  }

  async asyncTest(name, fn) {
    this.total++;
    try {
      await fn();
      this.passed++;
      console.log(`    \x1b[32m✓\x1b[0m ${name}`);
    } catch (err) {
      this.failed++;
      this.errors.push({ name, error: err });
      console.log(`    \x1b[31m✗\x1b[0m ${name}`);
      console.log(`      \x1b[31mError:\x1b[0m ${err.message}`);
    }
  }

  isTrue(cond, msg = 'Expected condition to be true') {
    if (!cond) throw new Error(msg);
  }

  strictEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
    }
  }

  deepStrictEqual(actual, expected, msg) {
    const act = JSON.stringify(actual);
    const exp = JSON.stringify(expected);
    if (act !== exp) {
      throw new Error(msg || `Expected deep equality:\nActual:   ${act}\nExpected: ${exp}`);
    }
  }

  closeTo(actual, expected, delta = 1e-4, msg) {
    if (Math.abs(actual - expected) > delta || Number.isNaN(actual)) {
      throw new Error(msg || `Expected ${actual} close to ${expected} (±${delta})`);
    }
  }

  throws(fn, regexOrMsg) {
    let threw = false;
    let caught;
    try {
      fn();
    } catch (e) {
      threw = true;
      caught = e;
    }
    if (!threw) {
      throw new Error('Expected function to throw error, but it succeeded');
    }
    if (regexOrMsg) {
      const msg = caught.message || String(caught);
      if (regexOrMsg instanceof RegExp) {
        if (!regexOrMsg.test(msg)) {
          throw new Error(`Error message "${msg}" does not match regex ${regexOrMsg}`);
        }
      } else if (typeof regexOrMsg === 'string') {
        if (!msg.includes(regexOrMsg)) {
          throw new Error(`Error message "${msg}" does not include "${regexOrMsg}"`);
        }
      }
    }
  }

  async rejects(p, regexOrMsg) {
    let threw = false;
    let caught;
    try {
      await (typeof p === 'function' ? p() : p);
    } catch (e) {
      threw = true;
      caught = e;
    }
    if (!threw) {
      throw new Error('Expected promise to reject, but it resolved');
    }
    if (regexOrMsg) {
      const msg = caught.message || String(caught);
      if (regexOrMsg instanceof RegExp) {
        if (!regexOrMsg.test(msg)) {
          throw new Error(`Rejection message "${msg}" does not match regex ${regexOrMsg}`);
        }
      } else if (typeof regexOrMsg === 'string') {
        if (!msg.includes(regexOrMsg)) {
          throw new Error(`Rejection message "${msg}" does not include "${regexOrMsg}"`);
        }
      }
    }
  }

  summary() {
    console.log(`\n  Suite: ${this.suiteName} | Passed: ${this.passed}/${this.total} | Failed: ${this.failed}`);
    return { total: this.total, passed: this.passed, failed: this.failed, errors: this.errors };
  }
}

// GLB Generator helper
function buildGlb({
  magic = 0x46546c67,
  version = 2,
  totalLength,
  chunk0Length,
  chunk0Type = 0x4e4f534a,
  jsonObj = { asset: { version: '2.0', extras: { latitude: 41.8902, longitude: 12.4922, base: 24, radius: 95 } } },
  rawJsonBytes,
  binBytes = new Uint8Array([1, 2, 3, 4]),
  omitBin = false
} = {}) {
  const jsonBuf = rawJsonBytes || Buffer.from(JSON.stringify(jsonObj), 'utf-8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const computedChunk0Len = chunk0Length !== undefined ? chunk0Length : jsonBuf.length + jsonPad;

  let total = 12 + 8 + computedChunk0Len;
  let binPad = 0;
  if (!omitBin && binBytes) {
    binPad = (4 - (binBytes.length % 4)) % 4;
    total += 8 + binBytes.length + binPad;
  }

  const finalTotalLen = totalLength !== undefined ? totalLength : total;
  const buf = Buffer.alloc(finalTotalLen);

  buf.writeUInt32LE(magic, 0);
  buf.writeUInt32LE(version, 4);
  buf.writeUInt32LE(finalTotalLen, 8);

  if (buf.length >= 20) {
    buf.writeUInt32LE(computedChunk0Len, 12);
    buf.writeUInt32LE(chunk0Type, 16);
    jsonBuf.copy(buf, 20);
    for (let i = 0; i < jsonPad; i++) {
      if (20 + jsonBuf.length + i < buf.length) {
        buf.writeUInt8(0x20, 20 + jsonBuf.length + i);
      }
    }

    if (!omitBin && binBytes && buf.length >= 20 + computedChunk0Len + 8) {
      const binOff = 20 + computedChunk0Len;
      buf.writeUInt32LE(binBytes.length + binPad, binOff);
      buf.writeUInt32LE(0x004e4942, binOff + 4);
      Buffer.from(binBytes).copy(buf, binOff + 8);
    }
  }

  return buf;
}

// In-Memory IndexedDB Mock for sceneryStorage testing
class MockIDBTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    this.queue = [];
    queueMicrotask(() => this._flush());
  }

  objectStore(name) {
    if (!this.storeNames.includes(name)) {
      throw new Error(`NotFoundError: The specified object store "${name}" is not in transaction`);
    }
    const store = this.db.stores.get(name);
    return new MockIDBObjectStore(this, store);
  }

  _flush() {
    try {
      while (this.queue.length > 0) {
        const op = this.queue.shift();
        op();
      }
      if (this.oncomplete) this.oncomplete({ target: this });
    } catch (err) {
      this.error = err;
      if (this.onerror) this.onerror({ target: this });
      else if (this.onabort) this.onabort({ target: this });
    }
  }
}

class MockIDBRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }
}

class MockIDBObjectStore {
  constructor(tx, backingMap) {
    this.tx = tx;
    this.map = backingMap;
  }

  put(value) {
    const req = new MockIDBRequest();
    this.tx.queue.push(() => {
      if (!value || typeof value !== 'object' || !value.id) {
        const err = new Error('DataError: Missing primary key "id"');
        req.error = err;
        if (req.onerror) req.onerror({ target: req });
        throw err;
      }
      this.map.set(value.id, structuredClone(value));
      req.result = value.id;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  get(id) {
    const req = new MockIDBRequest();
    this.tx.queue.push(() => {
      const val = this.map.get(id);
      req.result = val ? structuredClone(val) : undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  getAll() {
    const req = new MockIDBRequest();
    this.tx.queue.push(() => {
      const vals = Array.from(this.map.values()).map(v => structuredClone(v));
      req.result = vals;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  delete(id) {
    const req = new MockIDBRequest();
    this.tx.queue.push(() => {
      this.map.delete(id);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  createIndex() {}
}

class MockIDBDatabase {
  constructor(name) {
    this.name = name;
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (s) => this.stores.has(s)
    };
  }

  createObjectStore(name, options) {
    if (this.stores.has(name)) {
      throw new Error(`ObjectStore "${name}" already exists`);
    }
    const storeMap = new Map();
    this.stores.set(name, storeMap);
    return new MockIDBObjectStore(null, storeMap);
  }

  transaction(storeNames, mode) {
    return new MockIDBTransaction(this, storeNames, mode);
  }
}

function installMockIndexedDB() {
  const dbs = new Map();

  globalThis.indexedDB = {
    open(name, version) {
      const req = new MockIDBRequest();
      req.onupgradeneeded = null;

      queueMicrotask(() => {
        let db = dbs.get(name);
        const isNew = !db;
        if (isNew) {
          db = new MockIDBDatabase(name);
          dbs.set(name, db);
        }

        req.result = db;

        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
        }

        if (req.onsuccess) {
          req.onsuccess({ target: req });
        }
      });

      return req;
    }
  };

  // Mock URL.createObjectURL and revokeObjectURL
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = (blob) => `blob:mock-uuid-${Math.random().toString(36).substring(2, 9)}`;
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = () => {};
  }
}

// -------------------------------------------------------------
// MAIN TEST EXECUTION
// -------------------------------------------------------------
async function runAllStressTests() {
  console.log('================================================================');
  console.log('  CHALLENGER EMPIRICAL STRESS TEST SUITE (Milestone 1)          ');
  console.log('================================================================\n');

  installMockIndexedDB();

  // Dynamically import tested implementation modules
  const { parseGlbBuffer, parseMetadataJson, parseCapturePackage } = await import(
    '../packages/web/src/services/aleph/alephParser.ts'
  );
  const { SceneryStorageService, BUNDLED_SAMPLE_ID } = await import(
    '../packages/web/src/services/aleph/sceneryStorage.ts'
  );

  const suite1 = new StressAssert('1. alephParser.ts - GLB Header & Chunk Fuzzing');
  const suite2 = new StressAssert('2. alephParser.ts - Boundary Coordinates & Fallbacks');
  const suite3 = new StressAssert('3. alephParser.ts - Metadata & Package Ingestion');
  const suite4 = new StressAssert('4. sceneryStorage.ts - IndexedDB Stress & Concurrency');
  const suite5 = new StressAssert('5. Colosseum Sample - Binary GLB & Asset Inspection');

  // -------------------------------------------------------------
  // SUITE 1: GLB Header & Chunk Fuzzing
  // -------------------------------------------------------------
  console.log(`\n▶ Running ${suite1.suiteName}...`);

  suite1.test('Reject buffer shorter than 12-byte header (0 bytes)', () => {
    suite1.throws(() => parseGlbBuffer(new Uint8Array(0)), /smaller than GLB header/);
  });

  suite1.test('Reject buffer shorter than 12-byte header (4 bytes)', () => {
    suite1.throws(() => parseGlbBuffer(new Uint8Array([0x67, 0x6c, 0x54, 0x46])), /smaller than GLB header/);
  });

  suite1.test('Reject buffer shorter than 12-byte header (11 bytes)', () => {
    suite1.throws(() => parseGlbBuffer(new Uint8Array(11)), /smaller than GLB header/);
  });

  suite1.test('Reject wrong magic bytes (0xDEADBEEF)', () => {
    const glb = buildGlb({ magic: 0xdeadbeef });
    suite1.throws(() => parseGlbBuffer(glb), /file magic does not match/);
  });

  suite1.test('Reject wrong magic bytes (ASCII "RIFF")', () => {
    const glb = buildGlb({ magic: 0x46464952 });
    suite1.throws(() => parseGlbBuffer(glb), /file magic does not match/);
  });

  suite1.test('Reject unsupported glTF version 1', () => {
    const glb = buildGlb({ version: 1 });
    suite1.throws(() => parseGlbBuffer(glb), /Unsupported GLB version: 1/);
  });

  suite1.test('Reject unsupported glTF version 3', () => {
    const glb = buildGlb({ version: 3 });
    suite1.throws(() => parseGlbBuffer(glb), /Unsupported GLB version: 3/);
  });

  suite1.test('Reject declared length exceeding actual buffer byteLength', () => {
    const valid = buildGlb();
    const glb = buildGlb({ totalLength: valid.length * 2 });
    const truncated = glb.subarray(0, valid.length);
    suite1.throws(() => parseGlbBuffer(truncated), /declared length .* exceeds buffer size/);
  });

  suite1.test('Reject truncated Chunk 0 header (< 20 bytes total)', () => {
    const partial = Buffer.alloc(16);
    partial.writeUInt32LE(0x46546c67, 0);
    partial.writeUInt32LE(2, 4);
    partial.writeUInt32LE(16, 8);
    partial.writeUInt32LE(0, 12);
    suite1.throws(() => parseGlbBuffer(partial), /missing Chunk 0 header/);
  });

  suite1.test('Reject Chunk 0 when type is not JSON (BIN chunk first)', () => {
    const glb = buildGlb({ chunk0Type: 0x004e4942 }); // BIN type instead of JSON
    suite1.throws(() => parseGlbBuffer(glb), /chunk 0 is not JSON/);
  });

  suite1.test('Reject Chunk 0 length extending beyond buffer boundary', () => {
    const valid = buildGlb();
    const corrupted = Buffer.from(valid);
    // Overwrite chunk 0 length with value exceeding buffer length
    corrupted.writeUInt32LE(valid.length * 3, 12);
    suite1.throws(() => parseGlbBuffer(corrupted), /chunk 0 length extends beyond buffer boundaries/);
  });

  suite1.test('Reject corrupted non-JSON text in Chunk 0', () => {
    const glb = buildGlb({ rawJsonBytes: Buffer.from('{this is definitely not valid json!@#', 'utf-8') });
    suite1.throws(() => parseGlbBuffer(glb), /Corrupt GLB JSON chunk/);
  });

  suite1.test('Handle empty JSON object in Chunk 0 without crashing', () => {
    const glb = buildGlb({ jsonObj: {} });
    const { metadata } = parseGlbBuffer(glb);
    suite1.isTrue(metadata !== null, 'Should return metadata object');
    suite1.strictEqual(metadata.lat, 0);
    suite1.strictEqual(metadata.lon, 0);
    suite1.strictEqual(metadata.radius, 50, 'Safe default radius 50m');
  });

  // -------------------------------------------------------------
  // SUITE 2: Boundary Coordinates & Fallbacks
  // -------------------------------------------------------------
  console.log(`\n▶ Running ${suite2.suiteName}...`);

  suite2.test('Handle missing asset.extras gracefully with defaults', () => {
    const glb = buildGlb({ jsonObj: { asset: { version: '2.0' } } });
    const { metadata } = parseGlbBuffer(glb);
    suite2.strictEqual(metadata.lat, 0);
    suite2.strictEqual(metadata.lon, 0);
    suite2.strictEqual(metadata.baseAltitude, 0);
    suite2.strictEqual(metadata.radius, 50);
    suite2.strictEqual(metadata.name, 'Aleph 3D Capture');
  });

  suite2.test('Derive name from fileName if not provided in extras', () => {
    const glb = buildGlb({ jsonObj: { asset: { version: '2.0' } } });
    const { metadata } = parseGlbBuffer(glb, 'ancient_roman_aqueduct.glb');
    suite2.strictEqual(metadata.name, 'Ancient Roman Aqueduct');
  });

  suite2.test('Preserve explicit name from extras over fileName', () => {
    const glb = buildGlb({ jsonObj: { asset: { version: '2.0', extras: { name: 'Explicit Temple' } } } });
    const { metadata } = parseGlbBuffer(glb, 'file_name_to_ignore.glb');
    suite2.strictEqual(metadata.name, 'Explicit Temple');
  });

  suite2.test('Boundary coordinates: North Pole (lat = 90, lon = 0)', () => {
    const glb = buildGlb({ jsonObj: { asset: { version: '2.0', extras: { latitude: 90, longitude: 0, radius: 100 } } } });
    const { metadata } = parseGlbBuffer(glb);
    suite2.strictEqual(metadata.lat, 90);
    suite2.strictEqual(metadata.lon, 0);
    suite2.isTrue(Array.isArray(metadata.bounds), 'Bounds should be computed');
    const [s, w, n, e] = metadata.bounds;
    suite2.isTrue(!Number.isNaN(s) && !Number.isNaN(n), 'Latitude bounds must not be NaN at North Pole');
  });

  suite2.test('Boundary coordinates: South Pole (lat = -90, lon = 0)', () => {
    const glb = buildGlb({ jsonObj: { asset: { version: '2.0', extras: { latitude: -90, longitude: 0, radius: 100 } } } });
    const { metadata } = parseGlbBuffer(glb);
    suite2.strictEqual(metadata.lat, -90);
    suite2.strictEqual(metadata.lon, 0);
    const [s, w, n, e] = metadata.bounds;
    suite2.isTrue(!Number.isNaN(s) && !Number.isNaN(n), 'Latitude bounds must not be NaN at South Pole');
  });

  suite2.test('Boundary coordinates: Antimeridian (+180° and -180°)', () => {
    const glbEast = buildGlb({ jsonObj: { asset: { version: '2.0', extras: { latitude: 10, longitude: 180, radius: 100 } } } });
    const { metadata: metaEast } = parseGlbBuffer(glbEast);
    suite2.strictEqual(metaEast.lon, 180);

    const glbWest = buildGlb({ jsonObj: { asset: { version: '2.0', extras: { latitude: 10, longitude: -180, radius: 100 } } } });
    const { metadata: metaWest } = parseGlbBuffer(glbWest);
    suite2.strictEqual(metaWest.lon, -180);
  });

  suite2.test('Negative altitude (Dead Sea -430m)', () => {
    const glb = buildGlb({ jsonObj: { asset: { version: '2.0', extras: { latitude: 31.5, longitude: 35.5, base: -430.5, radius: 200 } } } });
    const { metadata } = parseGlbBuffer(glb);
    suite2.closeTo(metadata.baseAltitude, -430.5, 1e-4);
  });

  suite2.test('Fallback bounding box calculation from synthetic accessors', () => {
    const glb = buildGlb({
      jsonObj: {
        asset: { version: '2.0', extras: { latitude: 45.0, longitude: 9.0 } },
        accessors: [
          {
            type: 'VEC3',
            min: [-50, 0, -30],
            max: [50, 40, 30]
          }
        ]
      }
    });
    const { metadata } = parseGlbBuffer(glb);
    // width = 100, height = 40, depth = 60
    // diag = sqrt(100^2 + 40^2 + 60^2) = sqrt(15200) = 123.288
    // radius = 0.5 * 123.288 = 61.644
    suite2.closeTo(metadata.radius, 61.644, 0.1, 'Derived radius should match accessor geometry');
    suite2.isTrue(metadata.bounds !== undefined, 'Bounds should be computed from derived radius');
  });

  suite2.test('Fallback bounding box with multiple accessors takes union', () => {
    const glb = buildGlb({
      jsonObj: {
        asset: { version: '2.0', extras: { latitude: 45.0, longitude: 9.0 } },
        accessors: [
          { type: 'VEC3', min: [-10, 0, -10], max: [10, 10, 10] },
          { type: 'VEC3', min: [-100, 0, -50], max: [100, 20, 50] }
        ]
      }
    });
    const { metadata } = parseGlbBuffer(glb);
    // minX = -100, maxX = 100 (w=200); minY=0, maxY=20 (h=20); minZ=-50, maxZ=50 (d=100)
    // diag = sqrt(200^2 + 20^2 + 100^2) = sqrt(50400) = 224.499
    // radius = 112.25
    suite2.closeTo(metadata.radius, 112.25, 0.1);
  });

  suite2.test('Fallback bounding box enforces minimum 10m radius for tiny/point mesh', () => {
    const glb = buildGlb({
      jsonObj: {
        asset: { version: '2.0', extras: { latitude: 45.0, longitude: 9.0 } },
        accessors: [
          { type: 'VEC3', min: [0, 0, 0], max: [0.1, 0.1, 0.1] }
        ]
      }
    });
    const { metadata } = parseGlbBuffer(glb);
    suite2.strictEqual(metadata.radius, 10, 'Minimum clamped radius must be 10m');
  });

  suite2.test('Adversarial: Non-numeric coordinate types in extras fallback to 0', () => {
    const glb = buildGlb({
      jsonObj: {
        asset: {
          version: '2.0',
          extras: {
            latitude: '41.8902', // string instead of number
            longitude: null,     // null
            base: undefined,     // undefined
            radius: '95'         // string
          }
        }
      }
    });
    const { metadata } = parseGlbBuffer(glb);
    suite2.strictEqual(metadata.lat, 0, 'String latitude must fallback to 0');
    suite2.strictEqual(metadata.lon, 0, 'Null longitude must fallback to 0');
    suite2.strictEqual(metadata.baseAltitude, 0, 'Undefined base must fallback to 0');
    suite2.strictEqual(metadata.radius, 50, 'String radius must fallback to 50m default');
  });

  // -------------------------------------------------------------
  // SUITE 3: Metadata & Package Ingestion
  // -------------------------------------------------------------
  console.log(`\n▶ Running ${suite3.suiteName}...`);

  suite3.test('parseMetadataJson handles various key conventions', () => {
    const jsonA = JSON.stringify({
      latitude: 41.9,
      longitude: 12.5,
      baseElevation: 30.0,
      boundingRadius: 120.0,
      sceneryIsolation: true,
      headingOffset: 45.0
    });
    const metaA = parseMetadataJson(jsonA);
    suite3.strictEqual(metaA.lat, 41.9);
    suite3.strictEqual(metaA.lon, 12.5);
    suite3.strictEqual(metaA.baseAltitude, 30.0);
    suite3.strictEqual(metaA.radius, 120.0);
    suite3.strictEqual(metaA.isolationEnabled, true);
    suite3.strictEqual(metaA.heading, 45.0);
  });

  suite3.test('parseMetadataJson computes centroid and bounds from polygon array', () => {
    const jsonPolygon = JSON.stringify({
      name: 'Roman Forum Area',
      polygon: [
        [41.8900, 12.4850],
        [41.8940, 12.4850],
        [41.8940, 12.4900],
        [41.8900, 12.4900]
      ]
    });
    const meta = parseMetadataJson(jsonPolygon);
    suite3.closeTo(meta.lat, 41.8920, 1e-4);
    suite3.closeTo(meta.lon, 12.4875, 1e-4);
    suite3.deepStrictEqual(meta.bounds, [41.8900, 12.4850, 41.8940, 12.4900]);
  });

  suite3.test('parseMetadataJson tolerates malformed JSON string', () => {
    const res = parseMetadataJson('Not JSON at all!');
    suite3.deepStrictEqual(res, {});
  });

  suite3.test('parseCapturePackage throws on empty files array', async () => {
    await suite3.rejects(parseCapturePackage([]), /No files provided for ingestion/);
  });

  suite3.test('parseCapturePackage throws when no GLB file is present', async () => {
    const dummyTxt = new File(['text'], 'readme.txt', { type: 'text/plain' });
    await suite3.rejects(parseCapturePackage([dummyTxt]), /No .glb 3D model found/);
  });

  suite3.test('parseCapturePackage parses GLB + metadata.json pair', async () => {
    const glbData = buildGlb({
      jsonObj: { asset: { version: '2.0', extras: { latitude: 40.0, longitude: 10.0, radius: 50 } } }
    });
    const glbFile = new File([glbData], 'model.glb', { type: 'model/gltf-binary' });

    const metaJson = JSON.stringify({
      name: 'Overridden Capture Name',
      altitudeOffset: 15.0,
      heading: 180.0
    });
    const jsonFile = new File([metaJson], 'metadata.json', { type: 'application/json' });

    const result = await parseCapturePackage([glbFile, jsonFile]);
    suite3.strictEqual(result.metadata.name, 'Overridden Capture Name');
    suite3.strictEqual(result.metadata.lat, 40.0);
    suite3.strictEqual(result.metadata.altitudeOffset, 15.0);
    suite3.strictEqual(result.metadata.heading, 180.0);
    suite3.isTrue(result.glbBlob instanceof Blob);
  });

  // -------------------------------------------------------------
  // SUITE 4: sceneryStorage.ts IndexedDB Stress & Concurrency
  // -------------------------------------------------------------
  console.log(`\n▶ Running ${suite4.suiteName}...`);

  const storage = new SceneryStorageService();

  await suite4.asyncTest('Initialize database without errors', async () => {
    await storage.init();
    suite4.isTrue(true);
  });

  await suite4.asyncTest('Save single capture and retrieve metadata and blob', async () => {
    const glbBlob = new Blob([buildGlb()]);
    const metadata = {
      id: 'stress-test-1',
      name: 'Single Site',
      lat: 41.0,
      lon: 12.0,
      baseAltitude: 10,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 50,
      importedAt: 1000,
      isolationEnabled: true
    };

    const savedId = await storage.saveCapture(metadata, glbBlob);
    suite4.strictEqual(savedId, 'stress-test-1');

    const meta = await storage.getCaptureMetadata('stress-test-1');
    suite4.strictEqual(meta.name, 'Single Site');

    const blob = await storage.getModelBlob('stress-test-1');
    suite4.isTrue(blob !== null);
  });

  await suite4.asyncTest('Stress: Concurrent writes (50 parallel operations)', async () => {
    const promises = [];
    const count = 50;

    for (let i = 0; i < count; i++) {
      const glbBlob = new Blob([Buffer.from(`fake-glb-payload-${i}`)]);
      const meta = {
        id: `concurrent-cap-${i}`,
        name: `Concurrent Site #${i}`,
        lat: 40.0 + i * 0.01,
        lon: 10.0 + i * 0.01,
        baseAltitude: 50,
        altitudeOffset: 0,
        heading: i * 5,
        scale: 1,
        radius: 40 + i,
        importedAt: Date.now() + i,
        isolationEnabled: true
      };
      promises.push(storage.saveCapture(meta, glbBlob));
    }

    const results = await Promise.all(promises);
    suite4.strictEqual(results.length, count);

    const all = await storage.getAllCaptures();
    suite4.isTrue(all.length >= 50, `Expected at least 50 captures in DB, found ${all.length}`);
  });

  await suite4.asyncTest('Update metadata of existing capture', async () => {
    await storage.updateMetadata('concurrent-cap-5', {
      altitudeOffset: 25.5,
      heading: 270.0,
      scale: 2.0
    });

    const updated = await storage.getCaptureMetadata('concurrent-cap-5');
    suite4.strictEqual(updated.altitudeOffset, 25.5);
    suite4.strictEqual(updated.heading, 270.0);
    suite4.strictEqual(updated.scale, 2.0);
    suite4.strictEqual(updated.id, 'concurrent-cap-5', 'ID must remain invariant');
  });

  await suite4.asyncTest('Update metadata of non-existent ID throws specific error', async () => {
    await suite4.rejects(
      storage.updateMetadata('non-existent-id-999', { heading: 90 }),
      /Capture metadata with id non-existent-id-999 not found/
    );
  });

  await suite4.asyncTest('Delete capture removes metadata and blob cleanly', async () => {
    await storage.deleteCapture('concurrent-cap-10');

    const meta = await storage.getCaptureMetadata('concurrent-cap-10');
    const blob = await storage.getModelBlob('concurrent-cap-10');
    suite4.strictEqual(meta, null);
    suite4.strictEqual(blob, null);
  });

  await suite4.asyncTest('Delete already deleted or non-existent ID succeeds without error', async () => {
    await storage.deleteCapture('concurrent-cap-10'); // Already deleted
    await storage.deleteCapture('random-never-existed-id');
    suite4.isTrue(true, 'Deleting non-existent key must succeed idempotently');
  });

  await suite4.asyncTest('Special characters in metadata (Unicode, Emojis, SQL, XSS payloads)', async () => {
    const specialName = "🏛️ Colosseo di Roma; DROP TABLE captures; <script>alert('xss')</script> — 漢字";
    const specialMeta = {
      id: 'special-chars-id',
      name: specialName,
      lat: 41.89,
      lon: 12.49,
      baseAltitude: 20,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 90,
      importedAt: Date.now(),
      isolationEnabled: true,
      description: 'Test special characters: \0 \n \r \t \' " ` \\'
    };
    const blob = new Blob(['special payload']);

    await storage.saveCapture(specialMeta, blob);
    const retrieved = await storage.getCaptureMetadata('special-chars-id');
    suite4.strictEqual(retrieved.name, specialName);
    suite4.strictEqual(retrieved.description, specialMeta.description);
  });

  await suite4.asyncTest('Stress: Large payload blob (50MB ArrayBuffer)', async () => {
    const largeSize = 50 * 1024 * 1024; // 50 MB
    console.log(`      Allocating ${largeSize / (1024 * 1024)}MB test buffer...`);
    const largeBuffer = new Uint8Array(largeSize);
    largeBuffer[0] = 0xAA;
    largeBuffer[largeSize - 1] = 0x55;

    const largeBlob = new Blob([largeBuffer], { type: 'model/gltf-binary' });
    const largeMeta = {
      id: 'large-50mb-capture',
      name: '50MB High-Res Photogrammetry Scan',
      lat: 41.8902,
      lon: 12.4922,
      baseAltitude: 24,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 150,
      importedAt: Date.now(),
      isolationEnabled: true
    };

    const tStart = Date.now();
    await storage.saveCapture(largeMeta, largeBlob);
    const writeTime = Date.now() - tStart;
    console.log(`      50MB Blob saved in ${writeTime}ms.`);

    const tReadStart = Date.now();
    const retrievedBlob = await storage.getModelBlob('large-50mb-capture');
    const readTime = Date.now() - tReadStart;
    console.log(`      50MB Blob retrieved in ${readTime}ms.`);

    suite4.isTrue(retrievedBlob !== null);
    suite4.strictEqual(retrievedBlob.size, largeSize);

    // Clean up
    await storage.deleteCapture('large-50mb-capture');
  });

  await suite4.asyncTest('Object URL caching and revocation lifecycle', async () => {
    const id = 'url-lifecycle-id';
    const blob = new Blob(['sample-glb-data']);
    await storage.saveCapture({
      id,
      name: 'URL Test',
      lat: 10,
      lon: 20,
      baseAltitude: 0,
      altitudeOffset: 0,
      heading: 0,
      scale: 1,
      radius: 10,
      importedAt: 1,
      isolationEnabled: true
    }, blob);

    const url1 = await storage.getModelUrl(id);
    suite4.isTrue(typeof url1 === 'string' && url1.startsWith('blob:'));

    // Second call should return cached URL
    const url2 = await storage.getModelUrl(id);
    suite4.strictEqual(url1, url2, 'Subsequent getModelUrl calls must return cached URL');

    // Revoke URL manually
    storage.revokeModelUrl(id);

    // Third call creates fresh URL
    const url3 = await storage.getModelUrl(id);
    suite4.isTrue(typeof url3 === 'string');

    // Delete capture cleans up URL
    await storage.deleteCapture(id);
    const urlAfterDelete = await storage.getModelUrl(id);
    suite4.strictEqual(urlAfterDelete, null, 'Deleted capture returns null URL');
  });

  // -------------------------------------------------------------
  // SUITE 5: Colosseum Sample Asset Binary Inspection
  // -------------------------------------------------------------
  console.log(`\n▶ Running ${suite5.suiteName}...`);

  const colosseumDir = path.join(rootDir, 'packages/web/public/samples/colosseum');
  const glbPath = path.join(colosseumDir, 'mesh.glb');
  const metaPath = path.join(colosseumDir, 'metadata.json');
  const manifestPath = path.join(colosseumDir, 'manifest.json');
  const thumbJpgPath = path.join(colosseumDir, 'thumbnail.jpg');
  const thumbPngPath = path.join(colosseumDir, 'thumbnail.png');

  suite5.test('Verify all required sample files exist on disk', () => {
    suite5.isTrue(fs.existsSync(glbPath), 'mesh.glb must exist');
    suite5.isTrue(fs.existsSync(metaPath), 'metadata.json must exist');
    suite5.isTrue(fs.existsSync(manifestPath), 'manifest.json must exist');
    suite5.isTrue(fs.existsSync(thumbJpgPath), 'thumbnail.jpg must exist');
    suite5.isTrue(fs.existsSync(thumbPngPath), 'thumbnail.png must exist');
  });

  const glbBuffer = fs.readFileSync(glbPath);
  suite5.test('Colosseum mesh.glb size is non-trivial (> 100 KB)', () => {
    suite5.isTrue(glbBuffer.length > 100000, `Expected > 100KB, got ${glbBuffer.length} bytes`);
  });

  suite5.test('Colosseum mesh.glb binary header: magic, version, declared length', () => {
    const view = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
    const magic = view.getUint32(0, true);
    suite5.strictEqual(magic, 0x46546c67, 'Magic must be 0x46546C67 (glTF)');

    const version = view.getUint32(4, true);
    suite5.strictEqual(version, 2, 'glTF version must be 2');

    const declaredLen = view.getUint32(8, true);
    suite5.strictEqual(declaredLen, glbBuffer.length, 'Declared total length must strictly match file byteLength');
  });

  suite5.test('Colosseum Chunk 0 (JSON) validity and length alignment', () => {
    const view = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
    const chunk0Len = view.getUint32(12, true);
    const chunk0Type = view.getUint32(16, true);

    suite5.strictEqual(chunk0Type, 0x4e4f534a, 'Chunk 0 must be JSON (0x4E4F534A)');
    suite5.strictEqual(chunk0Len % 4, 0, 'Chunk 0 length must be aligned to 4-byte boundary');
    suite5.isTrue(20 + chunk0Len <= glbBuffer.length, 'Chunk 0 must fit within buffer');

    const jsonText = new TextDecoder('utf-8').decode(new Uint8Array(glbBuffer.buffer, glbBuffer.byteOffset + 20, chunk0Len));
    const gltf = JSON.parse(jsonText.trim());

    suite5.strictEqual(gltf.asset.version, '2.0');
    suite5.isTrue(gltf.asset.extras !== undefined, 'asset.extras must be present');
    const extras = gltf.asset.extras;

    suite5.strictEqual(extras.latitude, 41.89021, 'extras.latitude matches Colosseum Rome coordinate');
    suite5.strictEqual(extras.longitude, 12.49223, 'extras.longitude matches Colosseum Rome coordinate');
    suite5.strictEqual(extras.base, 24.0, 'extras.base matches Colosseum base elevation');
    suite5.strictEqual(extras.radius, 95.0, 'extras.radius matches Colosseum bounding radius');
    suite5.deepStrictEqual(extras.bounds, [41.889, 12.491, 41.891, 12.493]);
  });

  suite5.test('Colosseum Chunk 1 (BIN) chunk type and boundary alignment', () => {
    const view = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
    const chunk0Len = view.getUint32(12, true);
    const chunk1Offset = 20 + chunk0Len;

    suite5.isTrue(chunk1Offset + 8 <= glbBuffer.length, 'Chunk 1 header must exist');
    const chunk1Len = view.getUint32(chunk1Offset, true);
    const chunk1Type = view.getUint32(chunk1Offset + 4, true);

    suite5.strictEqual(chunk1Type, 0x004e4942, 'Chunk 1 must be BIN (0x004E4942)');
    suite5.strictEqual(chunk1Len % 4, 0, 'Chunk 1 length must be aligned to 4-byte boundary');
    suite5.strictEqual(chunk1Offset + 8 + chunk1Len, glbBuffer.length, 'Chunk 1 + header must terminate at exact EOF');
  });

  suite5.test('Colosseum geometry accessors and vertex bounds consistency', () => {
    const view = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
    const chunk0Len = view.getUint32(12, true);
    const jsonText = new TextDecoder('utf-8').decode(new Uint8Array(glbBuffer.buffer, glbBuffer.byteOffset + 20, chunk0Len));
    const gltf = JSON.parse(jsonText.trim());

    suite5.isTrue(Array.isArray(gltf.accessors) && gltf.accessors.length > 0, 'Must contain accessors');
    suite5.isTrue(Array.isArray(gltf.bufferViews) && gltf.bufferViews.length > 0, 'Must contain bufferViews');
    suite5.isTrue(Array.isArray(gltf.meshes) && gltf.meshes.length > 0, 'Must contain meshes');

    // Find POSITION accessor
    const posAccessorIdx = gltf.meshes[0].primitives[0].attributes.POSITION;
    suite5.isTrue(posAccessorIdx !== undefined, 'Primitive 0 must define POSITION attribute');
    const posAccessor = gltf.accessors[posAccessorIdx];

    suite5.strictEqual(posAccessor.type, 'VEC3');
    suite5.strictEqual(posAccessor.componentType, 5126, 'Component type must be FLOAT (5126)');
    suite5.isTrue(posAccessor.count > 100, `Vertex count must be realistic (>100), got ${posAccessor.count}`);

    const [minX, minY, minZ] = posAccessor.min;
    const [maxX, maxY, maxZ] = posAccessor.max;

    suite5.isTrue(minX < maxX, `minX (${minX}) < maxX (${maxX})`);
    suite5.isTrue(minY < maxY, `minY (${minY}) < maxY (${maxY})`);
    suite5.isTrue(minZ < maxZ, `minZ (${minZ}) < maxZ (${maxZ})`);

    // Verify derived radius from accessors matches Colosseum scale
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const derivedRadius = 0.5 * Math.sqrt(width * width + height * height + depth * depth);
    console.log(`      Colosseum geometry: width=${width.toFixed(1)}m, height=${height.toFixed(1)}m, depth=${depth.toFixed(1)}m -> radius=${derivedRadius.toFixed(1)}m`);
    suite5.isTrue(derivedRadius >= 80 && derivedRadius <= 140, `Derived radius (${derivedRadius}m) must be physically realistic`);
  });

  suite5.test('Verify metadata.json matches Colosseum glTF extras and manifest.json', () => {
    const metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    suite5.strictEqual(metaJson.id, BUNDLED_SAMPLE_ID);
    suite5.strictEqual(metaJson.lat, 41.89021);
    suite5.strictEqual(metaJson.lon, 12.49223);
    suite5.strictEqual(metaJson.baseAltitude, 24);
    suite5.strictEqual(metaJson.radius, 95);
    suite5.strictEqual(metaJson.isolationEnabled, true);
    suite5.strictEqual(metaJson.isBundled, true);

    // Verify manifest polygon encloses the coordinate
    suite5.isTrue(Array.isArray(manifestJson.polygon) && manifestJson.polygon.length >= 3);
    let pMinLat = 90, pMaxLat = -90, pMinLon = 180, pMaxLon = -180;
    for (const pt of manifestJson.polygon) {
      pMinLat = Math.min(pMinLat, pt[0]);
      pMaxLat = Math.max(pMaxLat, pt[0]);
      pMinLon = Math.min(pMinLon, pt[1]);
      pMaxLon = Math.max(pMaxLon, pt[1]);
    }
    suite5.isTrue(metaJson.lat >= pMinLat && metaJson.lat <= pMaxLat, 'Latitude must be inside manifest polygon');
    suite5.isTrue(metaJson.lon >= pMinLon && metaJson.lon <= pMaxLon, 'Longitude must be inside manifest polygon');
  });

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  CHALLENGER STRESS TEST RESULTS');
  console.log('----------------------------------------------------------------');
  const s1Res = suite1.summary();
  const s2Res = suite2.summary();
  const s3Res = suite3.summary();
  const s4Res = suite4.summary();
  const s5Res = suite5.summary();

  const totalAll = s1Res.total + s2Res.total + s3Res.total + s4Res.total + s5Res.total;
  const passedAll = s1Res.passed + s2Res.passed + s3Res.passed + s4Res.passed + s5Res.passed;
  const failedAll = s1Res.failed + s2Res.failed + s3Res.failed + s4Res.failed + s5Res.failed;

  console.log('----------------------------------------------------------------');
  console.log(`  TOTAL TESTS EXECUTED : ${totalAll}`);
  console.log(`  PASSED               : \x1b[32m${passedAll}\x1b[0m`);
  console.log(`  FAILED               : ${failedAll > 0 ? `\x1b[31m${failedAll}\x1b[0m` : '0'}`);
  console.log('================================================================');

  if (failedAll > 0) {
    console.error(`\n❌ STRESS TEST FAILED with ${failedAll} failing tests.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ ALL ${totalAll} EMPIRICAL STRESS TESTS PASSED.\n`);
    process.exit(0);
  }
}

runAllStressTests().catch(err => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
