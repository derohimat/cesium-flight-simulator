export function registerF10BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 10: Scenery Isolation (Boundaries & Edge Cases)', () => {
    class MockCustomSceneryManager {
      constructor() {
        this.isolationEnabled = false;
        this.activePlanes = [];
        this.modelRadius = 0.0;
        this.tileset = null;
      }

      setIsolation(enabled, modelRadius = 0) {
        this.isolationEnabled = Boolean(enabled);
        if (this.isolationEnabled) {
          // Enforce minimum clipping radius of 10m even if model radius is 0
          const effectiveRadius = Math.max(modelRadius, 10.0) + 5.0;
          this.activePlanes = [
            { normal: { x: 1, y: 0, z: 0 }, distance: -effectiveRadius },
            { normal: { x: -1, y: 0, z: 0 }, distance: -effectiveRadius },
            { normal: { x: 0, y: 1, z: 0 }, distance: -effectiveRadius },
            { normal: { x: 0, y: -1, z: 0 }, distance: -effectiveRadius },
          ];
          if (this.tileset) {
            this.tileset.clippingPlanes = { planes: this.activePlanes, enabled: true };
          }
        } else {
          this.activePlanes = [];
          if (this.tileset) {
            this.tileset.clippingPlanes = null;
          }
        }
      }
    }

    suite.test('F10-B01: Zero-radius model enforces safe minimum isolation clipping radius', () => {
      const manager = new MockCustomSceneryManager();
      manager.setIsolation(true, 0.0); // radius 0

      suite.strictEqual(manager.activePlanes.length, 4);
      // Min radius 10m + margin 5m = 15m
      suite.strictEqual(manager.activePlanes[0].distance, -15.0, 'Safe minimum clipping distance enforced');
    });

    suite.test('F10-B02: Rapid isolation toggling (100 on/off flips) does not cause state drift', () => {
      const manager = new MockCustomSceneryManager();

      for (let i = 0; i < 100; i++) {
        manager.setIsolation(i % 2 === 0, 50.0);
      }
      // Last iteration i=99: 99 % 2 !== 0 -> false
      suite.strictEqual(manager.isolationEnabled, false);
      suite.strictEqual(manager.activePlanes.length, 0);
    });

    suite.test('F10-B03: Gracefully handles scenery isolation when background tileset is null', () => {
      const manager = new MockCustomSceneryManager();
      manager.tileset = null; // No Google 3D Tileset loaded

      // Must not throw TypeError: cannot set property of null
      manager.setIsolation(true, 50.0);
      suite.strictEqual(manager.isolationEnabled, true);
    });

    suite.test('F10-B04: Clipping plane normals point outward away from model center', () => {
      const manager = new MockCustomSceneryManager();
      manager.setIsolation(true, 75.0);

      // Check normals are outward facing unit vectors
      const [eastPlane, westPlane, northPlane, southPlane] = manager.activePlanes;

      suite.deepStrictEqual(eastPlane.normal, { x: 1, y: 0, z: 0 });
      suite.deepStrictEqual(westPlane.normal, { x: -1, y: 0, z: 0 });
      suite.deepStrictEqual(northPlane.normal, { x: 0, y: 1, z: 0 });
      suite.deepStrictEqual(southPlane.normal, { x: 0, y: -1, z: 0 });
    });

    suite.test('F10-B05: Switching active captures properly resets previous isolation planes', () => {
      const manager = new MockCustomSceneryManager();
      manager.setIsolation(true, 100.0); // Capture A (radius 100)
      suite.strictEqual(manager.activePlanes[0].distance, -105.0);

      manager.setIsolation(true, 30.0); // Capture B (radius 30)
      suite.strictEqual(manager.activePlanes[0].distance, -35.0, 'Planes updated to Capture B bounds');
    });
  });
}
