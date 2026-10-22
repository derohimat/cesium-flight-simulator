import {
  createValidAlephGlb,
  parseAlephGlbReference,
  GLB_MAGIC,
  CHUNK_TYPE_JSON,
  CHUNK_TYPE_BIN,
} from '../helpers/glbGenerator.js';

export function registerF01Tests(suite) {
  suite.describe('Tier 1 - Feature 01: GLB In-browser Parsing (Happy Path)', () => {
    suite.test('F01-T01: Parse valid GLB 2.0 12-byte binary header', () => {
      const glb = createValidAlephGlb();
      suite.ok(glb.length >= 12, 'GLB buffer must be at least 12 bytes');

      const magic = glb.readUInt32LE(0);
      const version = glb.readUInt32LE(4);
      const length = glb.readUInt32LE(8);

      suite.strictEqual(magic, GLB_MAGIC, 'Magic must equal 0x46546C67 ("glTF")');
      suite.strictEqual(version, 2, 'Version must equal 2');
      suite.strictEqual(length, glb.length, 'Declared length must match buffer size');
    });

    suite.test('F01-T02: Extract georeference metadata from asset.extras', () => {
      const glb = createValidAlephGlb({
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
      });

      const parsed = parseAlephGlbReference(glb);
      suite.ok(parsed.georeference, 'Georeference object must be extracted');
      suite.closeTo(parsed.georeference.lat, 41.8902, 1e-4, 'Latitude must match');
      suite.closeTo(parsed.georeference.lon, 12.4922, 1e-4, 'Longitude must match');
      suite.closeTo(parsed.georeference.baseAltitude, 24.5, 1e-2, 'Base altitude must match');
      suite.closeTo(parsed.georeference.radius, 75.0, 1e-2, 'Radius must match');
    });

    suite.test('F01-T03: Extract georeference bounding box coordinate array', () => {
      const expectedBounds = [41.889, 12.491, 41.891, 12.493];
      const glb = createValidAlephGlb({ bounds: expectedBounds });

      const parsed = parseAlephGlbReference(glb);
      suite.deepStrictEqual(parsed.georeference.bounds, expectedBounds, 'Bounds must match [minLat, minLon, maxLat, maxLon]');
    });

    suite.test('F01-T04: Extract model name and descriptive metadata', () => {
      const name = 'Roman Forum Photogrammetry';
      const description = 'Detailed 3D capture from drone photography';
      const glb = createValidAlephGlb({ name, description });

      const parsed = parseAlephGlbReference(glb);
      suite.strictEqual(parsed.name, name, 'Model name must be extracted');
      suite.strictEqual(parsed.description, description, 'Model description must be extracted');
    });

    suite.test('F01-T05: Parse multi-chunk GLB containing both JSON and BIN chunks', () => {
      const binaryPayload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
      const glb = createValidAlephGlb({ binaryBytes: binaryPayload });

      // Chunk 0 (JSON)
      const chunk0Length = glb.readUInt32LE(12);
      const chunk0Type = glb.readUInt32LE(16);
      suite.strictEqual(chunk0Type, CHUNK_TYPE_JSON, 'Chunk 0 must be JSON');

      // Chunk 1 (BIN)
      const chunk1Offset = 20 + chunk0Length;
      const chunk1Length = glb.readUInt32LE(chunk1Offset);
      const chunk1Type = glb.readUInt32LE(chunk1Offset + 4);
      suite.strictEqual(chunk1Type, CHUNK_TYPE_BIN, 'Chunk 1 must be BIN');
      suite.ok(chunk1Length >= binaryPayload.length, 'Binary chunk length must accommodate payload');
    });
  });
}
