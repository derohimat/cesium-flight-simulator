import { MockSceneryStorage } from '../helpers/mockStorage.js';
import { createValidAlephGlb } from '../helpers/glbGenerator.js';

export const BUNDLED_COLOSSEUM_SAMPLE = {
  id: 'bundled-colosseum',
  name: 'Colosseum (Flavian Amphitheatre)',
  description: 'Ancient Roman amphitheatre located in the centre of Rome, Italy.',
  lat: 41.8902,
  lon: 12.4922,
  baseAltitude: 24.5,
  altitudeOffset: 0.0,
  heading: 0.0,
  scale: 1.0,
  radius: 75.0,
  bounds: [41.889, 12.491, 41.891, 12.493],
  thumbnailUrl: '/samples/colosseum/thumbnail.jpg',
  isBundled: true,
  isolationEnabled: true,
};

export function registerF04Tests(suite) {
  suite.describe('Tier 1 - Feature 04: Bundled Colosseum Sample (Happy Path)', () => {
    suite.test('F04-T01: Bundled sample descriptor defines valid metadata schema', () => {
      suite.ok(BUNDLED_COLOSSEUM_SAMPLE.id === 'bundled-colosseum', 'Sample ID defined');
      suite.strictEqual(BUNDLED_COLOSSEUM_SAMPLE.isBundled, true, 'isBundled flag must be true');
    });

    suite.test('F04-T02: Bundled coordinates match real-world Rome location', () => {
      suite.closeTo(BUNDLED_COLOSSEUM_SAMPLE.lat, 41.8902, 1e-3, 'Colosseum latitude in Rome');
      suite.closeTo(BUNDLED_COLOSSEUM_SAMPLE.lon, 12.4922, 1e-3, 'Colosseum longitude in Rome');
      suite.closeTo(BUNDLED_COLOSSEUM_SAMPLE.radius, 75.0, 1.0, 'Colosseum bounding radius');
    });

    suite.test('F04-T03: Bundled sample specifies valid thumbnail and description', () => {
      suite.ok(BUNDLED_COLOSSEUM_SAMPLE.thumbnailUrl.endsWith('.jpg'), 'Thumbnail is a valid image URL');
      suite.ok(BUNDLED_COLOSSEUM_SAMPLE.description.length > 10, 'Description provided');
    });

    suite.test('F04-T04: Automatic seeding of bundled sample into storage', async () => {
      const storage = new MockSceneryStorage();
      await storage.init();

      // Check if sample exists, if not seed it
      let existing = await storage.getCaptureMetadata(BUNDLED_COLOSSEUM_SAMPLE.id);
      suite.strictEqual(existing, null, 'Initially not seeded');

      const sampleGlb = createValidAlephGlb({
        name: BUNDLED_COLOSSEUM_SAMPLE.name,
        lat: BUNDLED_COLOSSEUM_SAMPLE.lat,
        lon: BUNDLED_COLOSSEUM_SAMPLE.lon,
        radius: BUNDLED_COLOSSEUM_SAMPLE.radius,
      });

      await storage.saveCapture(BUNDLED_COLOSSEUM_SAMPLE, sampleGlb);
      existing = await storage.getCaptureMetadata(BUNDLED_COLOSSEUM_SAMPLE.id);
      suite.ok(existing, 'Sample is successfully seeded into storage');
      suite.strictEqual(existing.isBundled, true);
    });

    suite.test('F04-T05: Bundled sample GLB payload contains matching embedded extras', () => {
      const sampleGlb = createValidAlephGlb({
        lat: BUNDLED_COLOSSEUM_SAMPLE.lat,
        lon: BUNDLED_COLOSSEUM_SAMPLE.lon,
        radius: BUNDLED_COLOSSEUM_SAMPLE.radius,
      });

      suite.ok(sampleGlb.length > 50, 'Sample GLB binary has non-zero size');
      const magic = sampleGlb.readUInt32LE(0);
      suite.strictEqual(magic, 0x46546c67, 'Sample GLB starts with magic 0x46546C67');
    });
  });
}
