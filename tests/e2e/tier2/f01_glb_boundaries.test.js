import {
  createCorruptedGlb,
  parseAlephGlbReference,
} from '../helpers/glbGenerator.js';

export function registerF01BoundaryTests(suite) {
  suite.describe('Tier 2 - Feature 01: GLB Parsing (Boundaries & Malformed Payloads)', () => {
    suite.test('F01-B01: Reject GLB with invalid magic header bytes', () => {
      const corrupt = createCorruptedGlb('invalid_magic');
      suite.throws(
        () => parseAlephGlbReference(corrupt),
        /Invalid GLB magic header/
      );
    });

    suite.test('F01-B02: Reject GLB with unsupported glTF version', () => {
      const corrupt = createCorruptedGlb('unsupported_version');
      suite.throws(
        () => parseAlephGlbReference(corrupt),
        /Unsupported GLB version/
      );
    });

    suite.test('F01-B03: Reject truncated GLB buffer shorter than 12-byte header', () => {
      const corrupt = createCorruptedGlb('truncated_header');
      suite.throws(
        () => parseAlephGlbReference(corrupt),
        /Buffer too short/
      );
    });

    suite.test('F01-B04: Reject GLB where buffer size is smaller than declared length', () => {
      const corrupt = createCorruptedGlb('truncated_length');
      suite.throws(
        () => parseAlephGlbReference(corrupt),
        /Truncated GLB/
      );
    });

    suite.test('F01-B05: Reject GLB with corrupted JSON chunk or missing georeference extras', () => {
      const corruptJson = createCorruptedGlb('corrupted_json');
      suite.throws(
        () => parseAlephGlbReference(corruptJson),
        /Malformed GLB JSON chunk/
      );

      const missingExtras = createCorruptedGlb('missing_extras');
      suite.throws(
        () => parseAlephGlbReference(missingExtras),
        /Missing asset.extras.georeference/
      );
    });
  });
}
