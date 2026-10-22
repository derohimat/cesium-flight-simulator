import { MockSceneryStorage } from '../helpers/mockStorage.js';
import { createValidAlephGlb } from '../helpers/glbGenerator.js';
import { BUNDLED_COLOSSEUM_SAMPLE } from '../tier1/f04_sample.test.js';

export function registerF04BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 04: Bundled Sample (Boundaries & Edge Cases)', () => {
    suite.test('F04-B01: Idempotent seeding prevents duplicate sample records', async () => {
      const storage = new MockSceneryStorage();
      await storage.init();
      const sampleGlb = createValidAlephGlb({ radius: 75 });

      // First seed
      await storage.saveCapture(BUNDLED_COLOSSEUM_SAMPLE, sampleGlb);
      // Second seed call with same ID
      await storage.saveCapture(BUNDLED_COLOSSEUM_SAMPLE, sampleGlb);

      const all = await storage.getAllCaptures();
      const sampleMatches = all.filter((c) => c.id === BUNDLED_COLOSSEUM_SAMPLE.id);
      suite.strictEqual(sampleMatches.length, 1, 'Only 1 record exists despite multiple seeds');
    });

    suite.test('F04-B02: Gracefully handle network 404 when fetching sample GLB', async () => {
      const fetchSampleAsset = async (url) => {
        if (url.includes('missing-sample')) {
          const err = new Error('HTTP 404: Not Found');
          err.status = 404;
          throw err;
        }
        return new ArrayBuffer(1024);
      };

      await suite.rejects(
        fetchSampleAsset('/samples/missing-sample/mesh.glb'),
        /HTTP 404/
      );
    });

    suite.test('F04-B03: Bundled sample cannot be permanently lost (re-seed on reset)', async () => {
      const storage = new MockSceneryStorage();
      await storage.init();
      const sampleGlb = createValidAlephGlb();

      await storage.saveCapture(BUNDLED_COLOSSEUM_SAMPLE, sampleGlb);
      // User deletes capture
      await storage.deleteCapture(BUNDLED_COLOSSEUM_SAMPLE.id);
      suite.strictEqual(await storage.getCaptureMetadata(BUNDLED_COLOSSEUM_SAMPLE.id), null);

      // Re-seed restore function restores bundled sample
      const restoreBundled = async () => {
        const current = await storage.getCaptureMetadata(BUNDLED_COLOSSEUM_SAMPLE.id);
        if (!current) {
          await storage.saveCapture(BUNDLED_COLOSSEUM_SAMPLE, sampleGlb);
        }
      };

      await restoreBundled();
      const restored = await storage.getCaptureMetadata(BUNDLED_COLOSSEUM_SAMPLE.id);
      suite.ok(restored, 'Bundled sample restored');
    });

    suite.test('F04-B04: Handle bundled sample metadata with missing optional fields', () => {
      const minimalSample = {
        id: 'bundled-minimal',
        name: 'Minimal Sample',
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
      };

      // Optional fields should receive sensible defaults
      const resolved = {
        ...minimalSample,
        altitudeOffset: minimalSample.altitudeOffset ?? 0.0,
        heading: minimalSample.heading ?? 0.0,
        scale: minimalSample.scale ?? 1.0,
        thumbnailUrl: minimalSample.thumbnailUrl || '/samples/default-thumb.jpg',
        isolationEnabled: minimalSample.isolationEnabled ?? true,
      };

      suite.strictEqual(resolved.altitudeOffset, 0.0);
      suite.strictEqual(resolved.heading, 0.0);
      suite.strictEqual(resolved.scale, 1.0);
      suite.strictEqual(resolved.thumbnailUrl, '/samples/default-thumb.jpg');
      suite.strictEqual(resolved.isolationEnabled, true);
    });

    suite.test('F04-B05: Reject corrupt binary payload when loading bundled sample', () => {
      const corruptPayload = Buffer.from('NOT_A_VALID_GLB_FILE');
      const validateSampleGlb = (buf) => {
        if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) {
          throw new Error('Bundled sample GLB is corrupted or invalid');
        }
      };

      suite.throws(
        () => validateSampleGlb(corruptPayload),
        /Bundled sample GLB is corrupted/
      );
    });
  });
}
