/**
 * Deep Adversarial Probe Suite for Milestone 1 (alephParser & sceneryStorage)
 */
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { parseGlbBuffer, parseMetadataJson } = await import(
  '../packages/web/src/services/aleph/alephParser.ts'
);

function buildGlbWithJson(jsonString) {
  const jsonBuf = Buffer.from(jsonString, 'utf-8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const chunk0Len = jsonBuf.length + jsonPad;
  const total = 12 + 8 + chunk0Len;
  const buf = Buffer.alloc(total);

  buf.writeUInt32LE(0x46546c67, 0); // "glTF"
  buf.writeUInt32LE(2, 4); // v2
  buf.writeUInt32LE(total, 8);

  buf.writeUInt32LE(chunk0Len, 12);
  buf.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonBuf.copy(buf, 20);
  for (let i = 0; i < jsonPad; i++) {
    buf.writeUInt8(0x20, 20 + jsonBuf.length + i);
  }
  return buf;
}

console.log('--- Testing Probe 1: JSON chunk is "null" ---');
try {
  const glb = buildGlbWithJson('null');
  const res = parseGlbBuffer(glb);
  console.log('Result for "null":', res.metadata);
} catch (err) {
  console.log('Caught expected error for "null":', err.message);
}

console.log('--- Testing Probe 2: JSON chunk is a number "12345" ---');
try {
  const glb = buildGlbWithJson('12345');
  const res = parseGlbBuffer(glb);
  console.log('Result for "12345":', res.metadata);
} catch (err) {
  console.log('Caught expected error for "12345":', err.message);
}

console.log('--- Testing Probe 3: JSON chunk is array "[]" ---');
try {
  const glb = buildGlbWithJson('[]');
  const res = parseGlbBuffer(glb);
  console.log('Result for "[]":', res.metadata);
} catch (err) {
  console.log('Caught expected error for "[]":', err.message);
}

console.log('--- Testing Probe 4: extras.latitude is NaN ---');
try {
  // In JSON, NaN is not valid, but what if extras has latitude: null or string or 0?
  // Let's test non-finite via JSON: null
  const glb = buildGlbWithJson(JSON.stringify({ asset: { extras: { latitude: null, longitude: null } } }));
  const res = parseGlbBuffer(glb);
  console.log('Result for null coordinates:', res.metadata.lat, res.metadata.lon);
} catch (err) {
  console.log('Caught error for null coordinates:', err.message);
}

console.log('--- Testing Probe 5: accessor with empty min/max arrays ---');
try {
  const glb = buildGlbWithJson(JSON.stringify({
    asset: { extras: { latitude: 45, longitude: 10 } },
    accessors: [{ type: 'VEC3', min: [], max: [] }]
  }));
  const res = parseGlbBuffer(glb);
  console.log('Result for empty min/max accessors:', res.metadata.radius);
} catch (err) {
  console.log('Caught error for empty min/max accessors:', err.message);
}

console.log('--- Testing Probe 6: accessor with non-VEC3 type ---');
try {
  const glb = buildGlbWithJson(JSON.stringify({
    asset: { extras: { latitude: 45, longitude: 10 } },
    accessors: [{ type: 'SCALAR', min: [0], max: [100] }]
  }));
  const res = parseGlbBuffer(glb);
  console.log('Result for SCALAR accessor:', res.metadata.radius);
} catch (err) {
  console.log('Caught error for SCALAR accessor:', err.message);
}

console.log('--- Testing Probe 7: bounds array with wrong length (2 elements) ---');
try {
  const glb = buildGlbWithJson(JSON.stringify({
    asset: { extras: { latitude: 45, longitude: 10, radius: 50, bounds: [45, 10] } }
  }));
  const res = parseGlbBuffer(glb);
  console.log('Result for 2-element bounds:', res.metadata.bounds);
} catch (err) {
  console.log('Caught error for 2-element bounds:', err.message);
}

console.log('--- Testing Probe 8: extreme latitude (89.999 degrees) bounds calculation ---');
try {
  const glb = buildGlbWithJson(JSON.stringify({
    asset: { extras: { latitude: 89.999, longitude: 10, radius: 100 } }
  }));
  const res = parseGlbBuffer(glb);
  console.log('Result for 89.999 lat bounds:', res.metadata.bounds);
} catch (err) {
  console.log('Caught error for 89.999 lat:', err.message);
}
