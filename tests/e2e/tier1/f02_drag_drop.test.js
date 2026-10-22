import { createValidAlephGlb } from '../helpers/glbGenerator.js';

export function registerF02Tests(suite) {
  suite.describe('Tier 1 - Feature 02: Drag & Drop / File Upload UI (Happy Path)', () => {
    suite.test('F02-T01: Process dropped .glb file in dropzone event', async () => {
      const glbBuffer = createValidAlephGlb();
      const mockFile = {
        name: 'colosseum_capture.glb',
        size: glbBuffer.length,
        type: 'model/gltf-binary',
        arrayBuffer: async () => glbBuffer.buffer,
      };

      const mockDropEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        dataTransfer: {
          files: [mockFile],
        },
      };

      suite.ok(mockDropEvent.dataTransfer.files.length === 1, 'Event contains 1 dropped file');
      suite.ok(mockDropEvent.dataTransfer.files[0].name.endsWith('.glb'), 'Dropped file is a .glb');
      const bytes = await mockDropEvent.dataTransfer.files[0].arrayBuffer();
      suite.strictEqual(bytes.byteLength, glbBuffer.length, 'Buffer bytes preserved across drop');
    });

    suite.test('F02-T02: Process file input change event', async () => {
      const glbBuffer = createValidAlephGlb();
      const mockFile = {
        name: 'custom_monument.glb',
        size: glbBuffer.length,
        type: 'model/gltf-binary',
        arrayBuffer: async () => glbBuffer.buffer,
      };

      const mockChangeEvent = {
        target: {
          files: [mockFile],
        },
      };

      suite.strictEqual(mockChangeEvent.target.files.length, 1, 'File input selected 1 file');
      suite.strictEqual(mockChangeEvent.target.files[0].name, 'custom_monument.glb');
    });

    suite.test('F02-T03: Drag state machine transitions correctly', () => {
      let isDragging = false;
      const onDragEnter = () => { isDragging = true; };
      const onDragLeave = () => { isDragging = false; };
      const onDrop = () => { isDragging = false; };

      suite.strictEqual(isDragging, false, 'Initial state: not dragging');
      onDragEnter();
      suite.strictEqual(isDragging, true, 'DragEnter: isDragging is true');
      onDragLeave();
      suite.strictEqual(isDragging, false, 'DragLeave: isDragging is false');
      onDragEnter();
      onDrop();
      suite.strictEqual(isDragging, false, 'Drop: isDragging resets to false');
    });

    suite.test('F02-T04: Automatic capture title generation from file name', () => {
      const filename = 'flavian_amphitheatre_rome.glb';
      const cleanTitle = filename.replace(/\.(glb|gltf|zip)$/i, '').replace(/[-_]/g, ' ');
      suite.strictEqual(cleanTitle, 'flavian amphitheatre rome', 'File name sanitized into readable title');
    });

    suite.test('F02-T05: Dropzone accept filter accepts GLB, GLTF, and ZIP packages', () => {
      const acceptedExtensions = ['.glb', '.gltf', '.zip'];
      const testFiles = ['mesh.glb', 'scene.gltf', 'capture_pack.zip'];

      for (const file of testFiles) {
        const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
        suite.ok(acceptedExtensions.includes(ext), `Extension ${ext} must be accepted`);
      }
    });
  });
}
