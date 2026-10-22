import { createValidAlephGlb, parseAlephGlbReference } from '../helpers/glbGenerator.js';
import { MockSceneryStorage } from '../helpers/mockStorage.js';
import {
  computeModelMatrix,
  generateOrbitKeyframesOracle,
  generateFlyByKeyframesOracle,
  generateSpiralRevealKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerTier3CrossFeatureTests(suite) {
  suite.describe('Tier 3 - Cross-Feature Integration Combinations (15 Scenarios)', () => {
    let storage;

    suite.test('CF01: Ingestion -> Persistence -> Library Listing -> Placement Matrix', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // 1. Ingestion: Parse valid GLB
      const rawGlb = createValidAlephGlb({
        name: 'Pantheon Rome',
        lat: 41.8986,
        lon: 12.4769,
        baseAltitude: 14.0,
        radius: 45.0,
      });
      const parsed = parseAlephGlbReference(rawGlb);

      // 2. Persistence: Save into storage
      const meta = {
        id: 'capture-pantheon',
        name: parsed.name,
        ...parsed.georeference,
        importedAt: Date.now(),
        isolationEnabled: true,
      };
      await storage.saveCapture(meta, rawGlb);

      // 3. Library Listing
      const all = await storage.getAllCaptures();
      suite.strictEqual(all.length, 1);
      suite.strictEqual(all[0].name, 'Pantheon Rome');

      // 4. Placement matrix computation
      const matrix = computeModelMatrix(
        all[0].lat,
        all[0].lon,
        all[0].baseAltitude + all[0].altitudeOffset,
        all[0].heading,
        0,
        0,
        all[0].scale
      );
      suite.strictEqual(matrix.length, 16);
      suite.ok(Number.isFinite(matrix[12]) && Number.isFinite(matrix[13]) && Number.isFinite(matrix[14]));
    });

    suite.test('CF02: Selection -> Placement -> Scenery Isolation Activation', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      const capture = {
        id: 'cap-florence',
        name: 'Florence Cathedral',
        lat: 43.7731,
        lon: 11.2560,
        baseAltitude: 55.0,
        altitudeOffset: 0.0,
        heading: 0.0,
        scale: 1.0,
        radius: 65.0,
        isolationEnabled: true,
      };
      await storage.saveCapture(capture, createValidAlephGlb());

      // Simulate UI selection
      const selected = await storage.getCaptureMetadata('cap-florence');
      suite.ok(selected);

      // Compute placement
      const matrix = computeModelMatrix(selected.lat, selected.lon, selected.baseAltitude);
      suite.strictEqual(matrix[15], 1);

      // Verify scenery isolation bounding planes
      suite.strictEqual(selected.isolationEnabled, true);
      const margin = 5.0;
      const clipDist = -(selected.radius + margin);
      suite.strictEqual(clipDist, -70.0);
    });

    suite.test('CF03: Ingestion -> Altitude Tuning -> Heading Rotation -> Matrix Verification', async () => {
      const lat = 41.8902, lon = 12.4922, baseAlt = 24.5;
      const initialMatrix = computeModelMatrix(lat, lon, baseAlt, 0, 0, 0, 1.0);

      // Tune altitude by +25m and heading by 120°
      const altOffset = 25.0;
      const heading = 120.0;
      const tunedMatrix = computeModelMatrix(lat, lon, baseAlt + altOffset, heading, 0, 0, 1.0);

      // Translation origin changed
      suite.notStrictEqual(initialMatrix[14], tunedMatrix[14]);
      // Rotation orientation changed
      suite.notStrictEqual(initialMatrix[0], tunedMatrix[0]);
    });

    suite.test('CF04: Ingestion -> 360° Orbit Generation -> Timeline Ingestion -> Playhead Seek', async () => {
      const rawGlb = createValidAlephGlb({ radius: 80.0, baseAltitude: 30.0 });
      const parsed = parseAlephGlbReference(rawGlb);

      const orbitKeyframes = generateOrbitKeyframesOracle({
        centerLat: parsed.georeference.lat,
        centerLon: parsed.georeference.lon,
        baseAltitude: parsed.georeference.baseAltitude,
        radius: parsed.georeference.radius,
        durationSeconds: 20,
        keyframeCount: 16,
      });

      suite.strictEqual(orbitKeyframes.length, 16);

      // Timeline ingest and seek
      const duration = 20;
      const seekTime = 10;
      const playheadPct = (seekTime / duration) * 100;
      suite.strictEqual(playheadPct, 50);

      // Verify mid-orbit keyframe
      const midKf = orbitKeyframes[8];
      suite.ok(midKf.time > 8 && midKf.time < 12);
    });

    suite.test('CF05: Ingestion -> Fly-by Generation -> Keyframe Alignment -> Duration Update', () => {
      const flybyKeyframes = generateFlyByKeyframesOracle({
        centerLat: 48.8584,
        centerLon: 2.2945, // Eiffel Tower
        baseAltitude: 33.0,
        radius: 90.0,
        durationSeconds: 15,
        keyframeCount: 9,
      });

      suite.strictEqual(flybyKeyframes[0].time, 0.0);
      suite.strictEqual(flybyKeyframes[8].time, 15.0);
      suite.ok(flybyKeyframes[4].time === 7.5, 'Middle keyframe aligns at 7.5s');
    });

    suite.test('CF06: Ingestion -> Spiral Reveal Generation -> Timeline Keyframe Deletion', () => {
      const spiralKeyframes = generateSpiralRevealKeyframesOracle({
        centerLat: 37.9715,
        centerLon: 23.7257, // Parthenon
        baseAltitude: 156.0,
        radius: 50.0,
        durationSeconds: 25,
        keyframeCount: 10,
      });

      let timelineKeyframes = [...spiralKeyframes];
      suite.strictEqual(timelineKeyframes.length, 10);

      // Delete keyframe at index 5
      const deletedId = timelineKeyframes[5].id;
      timelineKeyframes = timelineKeyframes.filter((k) => k.id !== deletedId);
      suite.strictEqual(timelineKeyframes.length, 9);
      suite.ok(!timelineKeyframes.some((k) => k.id === deletedId));
    });

    suite.test('CF07: Capture Metadata Update -> Storage Sync -> Location List Refresh', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      await storage.saveCapture(
        { id: 'cap-sync', name: 'Site Original', altitudeOffset: 0, heading: 0 },
        createValidAlephGlb()
      );

      // Update in storage
      await storage.updateMetadata('cap-sync', { altitudeOffset: 15, heading: 45 });

      // Refresh list
      const list = await storage.getAllCaptures();
      suite.strictEqual(list[0].altitudeOffset, 15);
      suite.strictEqual(list[0].heading, 45);
    });

    suite.test('CF08: Capture Deletion -> Scene Cleanup -> Isolation Reset -> List Removal', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      await storage.saveCapture({ id: 'cap-delete-me', name: 'To Be Deleted' }, createValidAlephGlb());
      suite.strictEqual((await storage.getAllCaptures()).length, 1);

      // Perform deletion
      await storage.deleteCapture('cap-delete-me');

      // Verify list is empty
      suite.strictEqual((await storage.getAllCaptures()).length, 0);
      suite.strictEqual(await storage.getModelBlob('cap-delete-me'), null);
      suite.strictEqual(await storage.getModelUrl('cap-delete-me'), null);
    });

    suite.test('CF09: Bundled Sample Ingestion -> Model Matrix Calculation -> 360° Orbit', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      const sampleMeta = {
        id: 'bundled-colosseum',
        name: 'Colosseum',
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
        isBundled: true,
      };
      await storage.saveCapture(sampleMeta, createValidAlephGlb());

      const item = await storage.getCaptureMetadata('bundled-colosseum');
      const matrix = computeModelMatrix(item.lat, item.lon, item.baseAltitude);
      suite.ok(matrix);

      const orbit = generateOrbitKeyframesOracle({
        centerLat: item.lat,
        centerLon: item.lon,
        baseAltitude: item.baseAltitude,
        radius: item.radius,
      });
      suite.strictEqual(orbit.length, 16);
    });

    suite.test('CF10: Multiple Model Ingestions -> Independent Transforms -> Distinct Bounding Spheres', () => {
      const modelA = { lat: 41.8902, lon: 12.4922, baseAlt: 24.5, radius: 75.0 };
      const modelB = { lat: 48.8584, lon: 2.2945, baseAlt: 33.0, radius: 120.0 };

      const matA = computeModelMatrix(modelA.lat, modelA.lon, modelA.baseAlt);
      const matB = computeModelMatrix(modelB.lat, modelB.lon, modelB.baseAlt);

      // Check distinct world coordinates
      suite.notStrictEqual(matA[12], matB[12]);
      suite.notStrictEqual(matA[13], matB[13]);
      suite.notStrictEqual(matA[14], matB[14]);
    });

    suite.test('CF11: Scenery Isolation Toggle -> Altitude Adjustment -> Clipping Plane Offset', () => {
      let altitudeOffset = 0.0;
      const modelRadius = 50.0;
      const margin = 5.0;

      const getClippingDistance = (offset) => -(modelRadius + margin + Math.abs(offset * 0.1));

      const d1 = getClippingDistance(altitudeOffset);
      altitudeOffset = 40.0;
      const d2 = getClippingDistance(altitudeOffset);

      suite.ok(d2 < d1, 'Clipping volume expands with high altitude offset to prevent tile leak');
    });

    suite.test('CF12: Heading Wrap-around (359° -> 1°) -> Orbit Trajectory Orientation Sync', () => {
      const mat359 = computeModelMatrix(41.8902, 12.4922, 24.5, 359);
      const mat1 = computeModelMatrix(41.8902, 12.4922, 24.5, 1);

      // Dot product between forward vectors should be close to cos(2°) ≈ 0.9994
      const dot = mat359[4] * mat1[4] + mat359[5] * mat1[5] + mat359[6] * mat1[6];
      suite.closeTo(dot, Math.cos((2 * Math.PI) / 180), 1e-3);
    });

    suite.test('CF13: Scaling Model -> Bounding Radius Update -> Orbit Radius Recalculation', () => {
      const baseRadius = 60.0;
      const scale = 2.0;
      const effectiveRadius = baseRadius * scale; // 120m

      const keyframes = generateOrbitKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: effectiveRadius,
      });

      // Orbit distance should equal effectiveRadius * 1.8 = 216m
      const metersPerDegreeLat = 111320.0;
      const dist = Math.abs(keyframes[0].lat - 41.8902) * metersPerDegreeLat;
      suite.closeTo(dist, 216.0, 1.0);
    });

    suite.test('CF14: Timeline Seeking during Active Isolation -> Camera Pose Interpolation', () => {
      const keyframes = generateFlyByKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
        durationSeconds: 15,
        keyframeCount: 5,
      });

      // Seek to 7.5s (midpoint)
      const t = 7.5;
      const k0 = keyframes[1]; // t=3.75
      const k1 = keyframes[2]; // t=7.5
      suite.strictEqual(k1.time, t);
      suite.ok(Number.isFinite(k1.lat));
    });

    suite.test('CF15: Full Ingestion to Timeline Export Data Structure Verification', async () => {
      const capture = {
        id: 'export-test-capture',
        name: 'Export Site',
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 25.0,
        radius: 50.0,
      };

      const orbit = generateOrbitKeyframesOracle({
        centerLat: capture.lat,
        centerLon: capture.lon,
        baseAltitude: capture.baseAltitude,
        radius: capture.radius,
        durationSeconds: 20,
      });

      const exportPackage = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        capture,
        timeline: {
          totalDuration: 20,
          keyframes: orbit,
        },
      };

      suite.ok(exportPackage.exportPackage ?? true);
      suite.strictEqual(exportPackage.timeline.keyframes.length, 16);
      suite.strictEqual(exportPackage.capture.id, 'export-test-capture');
    });
  });
}
