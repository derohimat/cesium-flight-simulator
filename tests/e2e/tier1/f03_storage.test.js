import { MockSceneryStorage } from '../helpers/mockStorage.js';
import { createValidAlephGlb } from '../helpers/glbGenerator.js';

export function registerF03Tests(suite) {
  suite.describe('Tier 1 - Feature 03: IndexedDB Persistence (Happy Path)', () => {
    let storage;

    suite.test('F03-T01: Initialize storage database and verify ready state', async () => {
      storage = new MockSceneryStorage();
      suite.strictEqual(storage.isInitialized, false);
      await storage.init();
      suite.strictEqual(storage.isInitialized, true, 'Storage must be initialized');
    });

    suite.test('F03-T02: Save capture metadata and binary model blob', async () => {
      const glbData = createValidAlephGlb();
      const metadata = {
        id: 'capture-colosseum-01',
        name: 'Colosseum Rome',
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 24.5,
        altitudeOffset: 5.0,
        heading: 45.0,
        scale: 1.0,
        radius: 75.0,
        isolationEnabled: true,
      };

      const savedId = await storage.saveCapture(metadata, glbData);
      suite.strictEqual(savedId, 'capture-colosseum-01', 'Saved ID must match');

      const retrievedMeta = await storage.getCaptureMetadata(savedId);
      suite.ok(retrievedMeta, 'Metadata must be retrievable');
      suite.strictEqual(retrievedMeta.name, 'Colosseum Rome');
      suite.closeTo(retrievedMeta.altitudeOffset, 5.0, 1e-4);

      const retrievedBlob = await storage.getModelBlob(savedId);
      suite.ok(retrievedBlob, 'Binary blob must be retrievable');
      suite.strictEqual(retrievedBlob.length, glbData.length);
    });

    suite.test('F03-T03: Retrieve all captures sorted by import timestamp', async () => {
      const sortStorage = new MockSceneryStorage();
      await sortStorage.init();
      const glbData = createValidAlephGlb();
      await sortStorage.saveCapture(
        { id: 'capture-earlier', name: 'Earlier Site', importedAt: 1000 },
        glbData
      );
      await sortStorage.saveCapture(
        { id: 'capture-later', name: 'Later Site', importedAt: 5000 },
        glbData
      );

      const all = await sortStorage.getAllCaptures();
      suite.strictEqual(all.length, 2, 'Must list exactly 2 saved captures');
      suite.strictEqual(all[0].id, 'capture-later', 'Most recent capture must appear first');
      suite.strictEqual(all[1].id, 'capture-earlier', 'Older capture appears second');
    });

    suite.test('F03-T04: Update capture metadata parameters in-place', async () => {
      await storage.updateMetadata('capture-colosseum-01', {
        altitudeOffset: 12.5,
        heading: 90.0,
        scale: 1.5,
      });

      const updated = await storage.getCaptureMetadata('capture-colosseum-01');
      suite.closeTo(updated.altitudeOffset, 12.5, 1e-4);
      suite.closeTo(updated.heading, 90.0, 1e-4);
      suite.closeTo(updated.scale, 1.5, 1e-4);
      suite.strictEqual(updated.name, 'Colosseum Rome', 'Unchanged fields must be preserved');
    });

    suite.test('F03-T05: Delete capture removes both metadata and binary model blob', async () => {
      await storage.deleteCapture('capture-earlier');

      const meta = await storage.getCaptureMetadata('capture-earlier');
      const blob = await storage.getModelBlob('capture-earlier');
      suite.strictEqual(meta, null, 'Deleted metadata must return null');
      suite.strictEqual(blob, null, 'Deleted blob must return null');
    });
  });
}
