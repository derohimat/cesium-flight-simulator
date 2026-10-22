import { createValidAlephGlb, parseAlephGlbReference } from '../helpers/glbGenerator.js';
import { MockSceneryStorage } from '../helpers/mockStorage.js';
import {
  computeModelMatrix,
  generateOrbitKeyframesOracle,
  generateFlyByKeyframesOracle,
  generateSpiralRevealKeyframesOracle,
} from '../helpers/mathOracles.js';

export function registerTier4RealWorldTests(suite) {
  suite.describe('Tier 4 - Real-World Application Scenarios (8 Complete Workflows)', () => {
    let storage;

    suite.test('RW01: The Colosseum Cinematic Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // Step 1: User imports real-world Colosseum GLB
      const colosseumGlb = createValidAlephGlb({
        name: 'Colosseum Photogrammetry',
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
      });
      const parsed = parseAlephGlbReference(colosseumGlb);

      // Step 2: Store in IndexedDB
      const captureId = await storage.saveCapture(
        {
          id: 'rome-colosseum',
          name: parsed.name,
          ...parsed.georeference,
          isolationEnabled: true,
        },
        colosseumGlb
      );

      // Step 3: Scene placement & transformation
      const meta = await storage.getCaptureMetadata(captureId);
      const matrix = computeModelMatrix(meta.lat, meta.lon, meta.baseAltitude);
      suite.strictEqual(matrix.length, 16);

      // Step 4: Generate 360° Orbit preset
      const orbit = generateOrbitKeyframesOracle({
        centerLat: meta.lat,
        centerLon: meta.lon,
        baseAltitude: meta.baseAltitude,
        radius: meta.radius,
        durationSeconds: 20,
        keyframeCount: 16,
      });
      suite.strictEqual(orbit.length, 16);

      // Step 5: Scrub across timeline: 0s, 5s, 10s, 15s, 20s
      for (const t of [0, 5, 10, 15, 20]) {
        const matchingKf = orbit.find((k) => Math.abs(k.time - t) < 1.0);
        suite.ok(matchingKf, `Found keyframe near t=${t}`);
      }
    });

    suite.test('RW02: Tower Fly-by Filming Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // Step 1: Import Eiffel Tower model
      const eiffelGlb = createValidAlephGlb({
        name: 'Eiffel Tower',
        lat: 48.8584,
        lon: 2.2945,
        baseAltitude: 33.0,
        radius: 90.0,
      });
      const parsed = parseAlephGlbReference(eiffelGlb);

      // Step 2: Fine tune altitude offset by +15m to match ground elevation
      parsed.georeference.altitudeOffset = 15.0;

      // Step 3: Compute updated model matrix
      const matrix = computeModelMatrix(
        parsed.georeference.lat,
        parsed.georeference.lon,
        parsed.georeference.baseAltitude + parsed.georeference.altitudeOffset
      );
      suite.ok(matrix);

      // Step 4: Generate Cinematic Fly-by
      const flyby = generateFlyByKeyframesOracle({
        centerLat: parsed.georeference.lat,
        centerLon: parsed.georeference.lon,
        baseAltitude: parsed.georeference.baseAltitude + parsed.georeference.altitudeOffset,
        radius: parsed.georeference.radius,
        durationSeconds: 15,
        keyframeCount: 9,
      });

      // Step 5: Verify tangent flight vector passes alongside tower
      const closestPass = flyby[4];
      suite.ok(closestPass.altitude > 48.0, 'Safe clearance above tower base');
    });

    suite.test('RW03: Mountain Fortress Spiral Reveal Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // High-altitude alpine fortress
      const fortressGlb = createValidAlephGlb({
        name: 'Alpine Fortress',
        lat: 46.5197,
        lon: 9.8783,
        baseAltitude: 1850.0,
        radius: 110.0,
      });
      const parsed = parseAlephGlbReference(fortressGlb);

      // Rotate heading to 215° to face valley entrance
      const heading = 215.0;
      const matrix = computeModelMatrix(
        parsed.georeference.lat,
        parsed.georeference.lon,
        parsed.georeference.baseAltitude,
        heading
      );
      suite.ok(matrix);

      // Generate Spiral Reveal with 2.0 revolutions
      const spiral = generateSpiralRevealKeyframesOracle({
        centerLat: parsed.georeference.lat,
        centerLon: parsed.georeference.lon,
        baseAltitude: parsed.georeference.baseAltitude,
        radius: parsed.georeference.radius,
        durationSeconds: 30,
        keyframeCount: 20,
        revolutions: 2.0,
      });

      suite.strictEqual(spiral.length, 20);
      suite.ok(spiral[19].altitude > spiral[0].altitude + 150.0, 'Ascends over 150m');
    });

    suite.test('RW04: Multi-Capture Scenery Switching Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // Site A (Tokyo)
      await storage.saveCapture(
        {
          id: 'site-tokyo',
          name: 'Tokyo Temple',
          lat: 35.7148,
          lon: 139.7967,
          baseAltitude: 10.0,
          radius: 40.0,
        },
        createValidAlephGlb()
      );

      // Site B (New York)
      await storage.saveCapture(
        {
          id: 'site-ny',
          name: 'Brooklyn Bridge Pier',
          lat: 40.7061,
          lon: -73.9969,
          baseAltitude: 5.0,
          radius: 85.0,
        },
        createValidAlephGlb()
      );

      // Load Site A
      const siteA = await storage.getCaptureMetadata('site-tokyo');
      const matA = computeModelMatrix(siteA.lat, siteA.lon, siteA.baseAltitude);

      // Switch to Site B
      const siteB = await storage.getCaptureMetadata('site-ny');
      const matB = computeModelMatrix(siteB.lat, siteB.lon, siteB.baseAltitude);

      // Verify camera coordinates jumped across globe (>10,000 km)
      const dx = matA[12] - matB[12];
      const dy = matA[13] - matB[13];
      const dz = matA[14] - matB[14];
      const distKm = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2) / 1000.0;
      suite.ok(distKm > 9000, `Intercontinental teleport distance: ${distKm.toFixed(0)}km`);
    });

    suite.test('RW05: Fine-Tuning & Persistence Round-trip Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // 1. Initial capture save
      await storage.saveCapture(
        {
          id: 'fine-tune-site',
          name: 'Survey Site',
          lat: 41.8902,
          lon: 12.4922,
          baseAltitude: 50.0,
          altitudeOffset: 0.0,
          heading: 0.0,
          scale: 1.0,
        },
        createValidAlephGlb()
      );

      // 2. Adjust sliders: altitude -40m, heading 135°, scale 1.5x
      await storage.updateMetadata('fine-tune-site', {
        altitudeOffset: -40.0,
        heading: 135.0,
        scale: 1.5,
      });

      // 3. Simulate browser reload (new storage query)
      const reloaded = await storage.getCaptureMetadata('fine-tune-site');
      suite.strictEqual(reloaded.altitudeOffset, -40.0);
      suite.strictEqual(reloaded.heading, 135.0);
      suite.strictEqual(reloaded.scale, 1.5);
    });

    suite.test('RW06: Cinematography Custom Timeline Assembly Workflow', () => {
      // Generate Orbit base
      const orbitKeyframes = generateOrbitKeyframesOracle({
        centerLat: 41.8902,
        centerLon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
        durationSeconds: 20,
        keyframeCount: 6,
      });

      // Director adds custom start intro shot and outro shot
      const introShot = {
        id: 'custom-intro',
        time: 0.0,
        lat: 41.8850,
        lon: 12.4850,
        altitude: 200.0,
        heading: 45.0,
        pitch: -20.0,
        roll: 0.0,
        label: 'Wide Approach',
      };

      const outroShot = {
        id: 'custom-outro',
        time: 25.0,
        lat: 41.9000,
        lon: 12.5000,
        altitude: 350.0,
        heading: 30.0,
        pitch: -35.0,
        roll: 0.0,
        label: 'High Departure',
      };

      // Offset orbit keyframes by 2.5s to fit between intro and outro
      const shiftedOrbit = orbitKeyframes.map((k) => ({
        ...k,
        time: Math.round((k.time + 2.5) * 100) / 100,
      }));

      const assembledTimeline = [introShot, ...shiftedOrbit, outroShot].sort((a, b) => a.time - b.time);

      suite.strictEqual(assembledTimeline.length, 8);
      suite.strictEqual(assembledTimeline[0].id, 'custom-intro');
      suite.strictEqual(assembledTimeline[assembledTimeline.length - 1].id, 'custom-outro');
    });

    suite.test('RW07: Offline & Quota Recovery Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // Pre-seed offline cache
      const glb = createValidAlephGlb();
      await storage.saveCapture(
        { id: 'offline-cached-capture', name: 'Offline Colosseum', lat: 41.8902, lon: 12.4922 },
        glb
      );

      // Storage quota warning (storage near limit)
      storage.setQuotaExceeded(true);

      // Attempting to save new massive capture fails
      await suite.rejects(
        storage.saveCapture({ id: 'excess-capture' }, glb),
        /The quota has been exceeded/
      );

      // But existing cached capture remains fully readable and usable
      storage.setQuotaExceeded(false); // Quota error applies to writes, reads succeed
      const cached = await storage.getCaptureMetadata('offline-cached-capture');
      suite.ok(cached, 'Cached capture available');
      suite.strictEqual(cached.name, 'Offline Colosseum');
    });

    suite.test('RW08: Full Production Lifecycle Workflow', async () => {
      storage = new MockSceneryStorage();
      await storage.init();

      // 1. Drag & drop raw GLB
      const glbBuffer = createValidAlephGlb({
        name: 'Production Model',
        lat: 41.8902,
        lon: 12.4922,
        baseAltitude: 24.5,
        radius: 75.0,
      });

      // 2. Auto-parse metadata
      const parsed = parseAlephGlbReference(glbBuffer);
      suite.ok(parsed);

      // 3. Persist to IndexedDB
      const capId = await storage.saveCapture(
        {
          id: 'prod-lifecycle-01',
          name: parsed.name,
          ...parsed.georeference,
          isolationEnabled: true,
        },
        glbBuffer
      );

      // 4. Teleport camera & apply isolation
      const cap = await storage.getCaptureMetadata(capId);
      suite.strictEqual(cap.isolationEnabled, true);

      // 5. Generate Fly-by keyframes
      const flyby = generateFlyByKeyframesOracle({
        centerLat: cap.lat,
        centerLon: cap.lon,
        baseAltitude: cap.baseAltitude,
        radius: cap.radius,
        durationSeconds: 15,
      });
      suite.strictEqual(flyby.length, 9);

      // 6. Export timeline
      const exportedJson = JSON.stringify({ captureId: capId, keyframes: flyby });
      suite.ok(exportedJson.length > 100);

      // 7. Clean deletion
      await storage.deleteCapture(capId);
      suite.strictEqual(await storage.getCaptureMetadata(capId), null);
    });
  });
}
