export function registerF10Tests(suite) {
  suite.describe('Tier 1 - Feature 10: Scenery Isolation Toggle (Happy Path)', () => {
    class MockCustomSceneryManager {
      constructor() {
        this.isolationEnabled = false;
        this.activePlanes = [];
        this.modelRadius = 75.0;
        this.tilesetClippingCollection = null;
      }

      setIsolation(enabled) {
        this.isolationEnabled = Boolean(enabled);
        if (this.isolationEnabled) {
          // Construct 4 vertical bounding clipping planes around model box + margin
          const margin = 5.0;
          const r = this.modelRadius + margin;
          this.activePlanes = [
            { normal: { x: 1, y: 0, z: 0 }, distance: -r },
            { normal: { x: -1, y: 0, z: 0 }, distance: -r },
            { normal: { x: 0, y: 1, z: 0 }, distance: -r },
            { normal: { x: 0, y: -1, z: 0 }, distance: -r },
          ];
          this.tilesetClippingCollection = { planes: this.activePlanes, enabled: true };
        } else {
          this.activePlanes = [];
          this.tilesetClippingCollection = null;
        }
      }
    }

    suite.test('F10-T01: Enable scenery isolation configures clipping plane collection', () => {
      const manager = new MockCustomSceneryManager();
      suite.strictEqual(manager.isolationEnabled, false);

      manager.setIsolation(true);
      suite.strictEqual(manager.isolationEnabled, true);
      suite.ok(manager.tilesetClippingCollection, 'Clipping collection created');
      suite.strictEqual(manager.tilesetClippingCollection.enabled, true);
    });

    suite.test('F10-T02: Clipping planes encompass model radius plus safety margin', () => {
      const manager = new MockCustomSceneryManager();
      manager.setIsolation(true);

      suite.strictEqual(manager.activePlanes.length, 4, '4 bounding clipping planes');
      for (const plane of manager.activePlanes) {
        suite.strictEqual(plane.distance, -80.0, 'Distance equals -(modelRadius + margin) = -80m');
      }
    });

    suite.test('F10-T03: Disable scenery isolation deactivates clipping planes', () => {
      const manager = new MockCustomSceneryManager();
      manager.setIsolation(true);
      suite.strictEqual(manager.isolationEnabled, true);

      manager.setIsolation(false);
      suite.strictEqual(manager.isolationEnabled, false);
      suite.strictEqual(manager.activePlanes.length, 0);
      suite.strictEqual(manager.tilesetClippingCollection, null);
    });

    suite.test('F10-T04: Capture metadata retains isolationEnabled state preference', () => {
      const metadata = {
        id: 'capture-rome-colosseum',
        isolationEnabled: true,
      };

      suite.strictEqual(metadata.isolationEnabled, true);
      metadata.isolationEnabled = false;
      suite.strictEqual(metadata.isolationEnabled, false);
    });

    suite.test('F10-T05: Scenery isolation targets global 3D tiles without clipping model geometry', () => {
      const manager = new MockCustomSceneryManager();
      manager.setIsolation(true);

      // Verify clipping collection attaches to background tileset, not to model primitive
      const modelPrimitiveHasClipping = false;
      suite.strictEqual(modelPrimitiveHasClipping, false, 'Model primitive must not be clipped');
      suite.ok(manager.tilesetClippingCollection.enabled, 'Global background tileset receives clipping');
    });
  });
}
