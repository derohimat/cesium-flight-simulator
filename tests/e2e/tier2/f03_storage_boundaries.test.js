import { MockSceneryStorage } from '../helpers/mockStorage.js';
import { createValidAlephGlb } from '../helpers/glbGenerator.js';

export function registerF03BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 03: Storage (Boundaries & Error Handling)', () => {
    let storage;

    suite.test('F03-B01: Handle QuotaExceededError during large capture save', async () => {
      storage = new MockSceneryStorage();
      await storage.init();
      storage.setQuotaExceeded(true);

      const glbData = createValidAlephGlb();
      await suite.rejects(
        storage.saveCapture({ id: 'huge-model', name: 'Huge' }, glbData),
        /The quota has been exceeded/
      );
    });

    suite.test('F03-B02: Return null when querying non-existent capture ID', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      const meta = await storage.getCaptureMetadata('does-not-exist');
      const blob = await storage.getModelBlob('does-not-exist');
      const url = await storage.getModelUrl('does-not-exist');

      suite.strictEqual(meta, null);
      suite.strictEqual(blob, null);
      suite.strictEqual(url, null);
    });

    suite.test('F03-B03: Reject metadata update for non-existent capture ID', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      await suite.rejects(
        storage.updateMetadata('non-existent-id', { heading: 45 }),
        /not found/
      );
    });

    suite.test('F03-B04: Reject saving capture with missing metadata ID or empty buffer', async () => {
      storage = new MockSceneryStorage();
      await storage.init();
      const glbData = createValidAlephGlb();

      await suite.rejects(
        storage.saveCapture({ name: 'No ID' }, glbData),
        /missing id/
      );

      await suite.rejects(
        storage.saveCapture({ id: 'valid-id' }, Buffer.alloc(0)),
        /cannot be empty/
      );
    });

    suite.test('F03-B05: Deleting non-existent ID completes idempotently without throwing', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // Deleting a non-existent item should not crash
      await storage.deleteCapture('already-deleted-or-never-existed');
      const meta = await storage.getCaptureMetadata('already-deleted-or-never-existed');
      suite.strictEqual(meta, null);
    });
  });
}
