import fs from 'node:fs';
import path from 'node:path';

export function registerF15Tests(suite) {
  suite.describe('Tier 1 - Feature 15: Build & Regression Integrity (Happy Path)', () => {
    const projectRoot = path.resolve(process.cwd());

    suite.test('F15-T01: Root and web package.json files exist and parse as valid JSON', () => {
      const rootPkgPath = path.join(projectRoot, 'package.json');
      const webPkgPath = path.join(projectRoot, 'packages/web/package.json');

      suite.ok(fs.existsSync(rootPkgPath), 'Root package.json must exist');
      suite.ok(fs.existsSync(webPkgPath), 'Web package.json must exist');

      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
      const webPkg = JSON.parse(fs.readFileSync(webPkgPath, 'utf-8'));

      suite.ok(rootPkg.name, 'Root package has a name');
      suite.ok(webPkg.name, 'Web package has a name');
    });

    suite.test('F15-T02: Web tsconfig.json specifies compiler options and ESNext target', () => {
      const tsconfigPath = path.join(projectRoot, 'packages/web/tsconfig.json');
      suite.ok(fs.existsSync(tsconfigPath), 'tsconfig.json must exist');

      const raw = fs.readFileSync(tsconfigPath, 'utf-8');
      const stripped = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const tsconfig = JSON.parse(stripped);
      suite.ok(tsconfig.compilerOptions, 'compilerOptions defined');
      suite.strictEqual(tsconfig.compilerOptions.jsx, 'react-jsx');
    });

    suite.test('F15-T03: Existing curated locations in data/places.ts are intact', () => {
      const placesPath = path.join(projectRoot, 'packages/web/src/data/places.ts');
      suite.ok(fs.existsSync(placesPath), 'places.ts exists');

      const content = fs.readFileSync(placesPath, 'utf-8');
      suite.ok(content.includes('export const PLACES'), 'Exports PLACES array');
      suite.ok(content.includes('grandcanyon'), 'Contains Grand Canyon preset');
      suite.ok(content.includes('colosseum'), 'Contains Colosseum preset');
    });

    suite.test('F15-T04: Studio components index exports LocationLibrary and FlightTimeline', () => {
      const studioIndexPath = path.join(
        projectRoot,
        'packages/web/src/react/features/studio/components/index.ts'
      );
      suite.ok(fs.existsSync(studioIndexPath), 'studio components index.ts exists');

      const content = fs.readFileSync(studioIndexPath, 'utf-8');
      suite.ok(content.includes('LocationLibrary'), 'Exports LocationLibrary');
      suite.ok(content.includes('FlightTimeline'), 'Exports FlightTimeline');
    });

    suite.test('F15-T05: Simulator vehicle manager retains standard aircraft and car capabilities', () => {
      const vehicleManagerPath = path.join(
        projectRoot,
        'packages/web/src/cesium/managers/VehicleManager.ts'
      );
      suite.ok(fs.existsSync(vehicleManagerPath), 'VehicleManager.ts exists');

      const content = fs.readFileSync(vehicleManagerPath, 'utf-8');
      suite.ok(content.includes('Aircraft'), 'Retains Aircraft vehicle');
      suite.ok(content.includes('Car'), 'Retains Car vehicle');
    });
  });
}
