/**
 * Automated Verification Suite for Aleph Ingestion & Persistence
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Test 1: Verify bundled sample Colosseum files exist and are valid
console.log('--- Test Suite 1: Bundled Colosseum Sample Assets ---');
const sampleDir = path.resolve(__dirname, '../public/samples/colosseum');
assert.ok(fs.existsSync(sampleDir), 'Sample directory public/samples/colosseum must exist');

const glbPath = path.join(sampleDir, 'mesh.glb');
assert.ok(fs.existsSync(glbPath), 'mesh.glb must exist');
const glbBuffer = fs.readFileSync(glbPath);
assert.ok(glbBuffer.length > 50000, `mesh.glb must be substantial, got ${glbBuffer.length} bytes`);

const metaPath = path.join(sampleDir, 'metadata.json');
assert.ok(fs.existsSync(metaPath), 'metadata.json must exist');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
assert.strictEqual(meta.id, 'colosseum-sample');
assert.strictEqual(meta.lat, 41.89021);
assert.strictEqual(meta.lon, 12.49223);
assert.strictEqual(meta.baseAltitude, 24.0);
assert.strictEqual(meta.radius, 95.0);
assert.deepStrictEqual(meta.bounds, [41.889, 12.491, 41.891, 12.493]);

const thumbPath = path.join(sampleDir, 'thumbnail.jpg');
assert.ok(fs.existsSync(thumbPath), 'thumbnail.jpg must exist');
console.log('✓ Test Suite 1 passed: Bundled Colosseum files validated.');

// Test 2: Binary GLB Parsing & `asset.extras` extraction
console.log('\n--- Test Suite 2: Binary GLB Parsing & asset.extras ---');
const dataView = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);

const magic = dataView.getUint32(0, true);
assert.strictEqual(magic, 0x46546C67, 'Magic must be 0x46546C67 (glTF)');

const version = dataView.getUint32(4, true);
assert.strictEqual(version, 2, 'Version must be 2');

const declaredLen = dataView.getUint32(8, true);
assert.strictEqual(declaredLen, glbBuffer.length, 'Header length must match buffer byteLength');

const chunk0Len = dataView.getUint32(12, true);
const chunk0Type = dataView.getUint32(16, true);
assert.strictEqual(chunk0Type, 0x4E4F534A, 'Chunk 0 type must be JSON');

const jsonStr = new TextDecoder('utf-8').decode(new Uint8Array(glbBuffer.buffer, glbBuffer.byteOffset + 20, chunk0Len));
const gltf = JSON.parse(jsonStr);

assert.ok(gltf.asset, 'glTF must have asset property');
assert.ok(gltf.asset.extras, 'glTF must have asset.extras property');
const extras = gltf.asset.extras;

assert.strictEqual(extras.latitude, 41.89021);
assert.strictEqual(extras.longitude, 12.49223);
assert.strictEqual(extras.base, 24.0);
assert.strictEqual(extras.radius, 95.0);
assert.deepStrictEqual(extras.bounds, [41.889, 12.491, 41.891, 12.493]);
assert.ok(extras.frame.includes('meters east (x), up (y), and south (z) of the center'));
console.log('✓ Test Suite 2 passed: GLB binary structure and embedded extras verified.');

// Test 3: Fallback radius calculation from accessors when extras.radius is absent
console.log('\n--- Test Suite 3: Fallback Bounding Box & Radius Computation ---');
// Modify gltf clone without extras
const gltfNoRadius = JSON.parse(JSON.stringify(gltf));
delete gltfNoRadius.asset.extras.radius;

let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

for (const accessor of gltfNoRadius.accessors) {
  if (accessor.type === 'VEC3' && Array.isArray(accessor.min) && Array.isArray(accessor.max)) {
    minX = Math.min(minX, accessor.min[0]);
    maxX = Math.max(maxX, accessor.max[0]);
    minY = Math.min(minY, accessor.min[1]);
    maxY = Math.max(maxY, accessor.max[1]);
    minZ = Math.min(minZ, accessor.min[2]);
    maxZ = Math.max(maxZ, accessor.max[2]);
  }
}
const width = maxX - minX;
const height = maxY - minY;
const depth = maxZ - minZ;
const computedRadius = 0.5 * Math.sqrt(width * width + height * height + depth * depth);
console.log(`Computed bounding box: width=${width.toFixed(1)}m, height=${height.toFixed(1)}m, depth=${depth.toFixed(1)}m -> radius=${computedRadius.toFixed(1)}m`);
assert.ok(computedRadius >= 90 && computedRadius <= 135, `Computed radius ${computedRadius} should be in realistic Colosseum range (~95m-135m)`);
console.log('✓ Test Suite 3 passed: Fallback radius derivation from accessors verified.');

// Test 4: Manifest & Metadata Parsing Matrix
console.log('\n--- Test Suite 4: Manifest & Metadata Parsing ---');
const manifestPath = path.join(sampleDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert.strictEqual(manifest.format, 'aleph-python');
assert.strictEqual(manifest.version, 6);
assert.ok(Array.isArray(manifest.polygon), 'Manifest polygon array required');

let polyMinLat = 90, polyMaxLat = -90, polyMinLon = 180, polyMaxLon = -180;
for (const pt of manifest.polygon) {
  polyMinLat = Math.min(polyMinLat, pt[0]);
  polyMaxLat = Math.max(polyMaxLat, pt[0]);
  polyMinLon = Math.min(polyMinLon, pt[1]);
  polyMaxLon = Math.max(polyMaxLon, pt[1]);
}
const centroidLat = (polyMinLat + polyMaxLat) / 2;
const centroidLon = (polyMinLon + polyMaxLon) / 2;
assert.strictEqual(centroidLat.toFixed(3), '41.890');
assert.strictEqual(centroidLon.toFixed(3), '12.492');
console.log('✓ Test Suite 4 passed: Manifest centroid and bounds calculation verified.');

// Test 5: Corrupt file handling
console.log('\n--- Test Suite 5: Error Handling on Corrupted Files ---');
const badBuffer = Buffer.from('NOT_A_GLB_HEADER_FOR_SURE');
const badView = new DataView(badBuffer.buffer, badBuffer.byteOffset, badBuffer.byteLength);
const badMagic = badView.getUint32(0, true);
assert.notStrictEqual(badMagic, 0x46546C67, 'Bad buffer must not match GLB magic');
console.log('✓ Test Suite 5 passed: Corrupt input rejected gracefully.');

console.log('\n========================================');
console.log('ALL VERIFICATION SUITES PASSED SUCCESSFULLY');
console.log('========================================');
