/**
 * Synthetic GLB 2.0 Binary Generator and Spec-Compliant Reference Parser.
 * Generates both valid binary GLB packages and controlled corrupted variants
 * for Tier 1 and Tier 2 testing.
 */

export const GLB_MAGIC = 0x46546c67; // "glTF"
export const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
export const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

export function createValidAlephGlb(options = {}) {
  const {
    lat = 41.8902,
    lon = 12.4922,
    baseAltitude = 24.5,
    altitudeOffset = 0.0,
    heading = 0.0,
    scale = 1.0,
    radius = 75.0,
    bounds = [41.889, 12.491, 41.891, 12.493],
    name = 'Colosseum Photogrammetry Capture',
    description = 'High resolution textured 3D mesh produced by Aleph.',
    binaryBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    omitExtras = false,
  } = options;

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Aleph 3D Reconstruction Pipeline v1.4',
      ...(omitExtras
        ? {}
        : {
            extras: {
              georeference: {
                lat,
                lon,
                baseAltitude,
                altitudeOffset,
                heading,
                scale,
                radius,
                bounds,
              },
              name,
              description,
            },
          }),
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'RootNode' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  };

  const jsonString = JSON.stringify(gltfJson);
  const jsonBuffer = Buffer.from(jsonString, 'utf-8');
  // Pad JSON chunk to 4-byte boundary with 0x20 (space)
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunkLength = jsonBuffer.length + jsonPadding;

  const binBuffer = Buffer.from(binaryBytes);
  // Pad BIN chunk to 4-byte boundary with 0x00
  const binPadding = (4 - (binBuffer.length % 4)) % 4;
  const binChunkLength = binBuffer.length + binPadding;

  const totalLength = 12 + (8 + jsonChunkLength) + (8 + binChunkLength);
  const glbBuffer = Buffer.alloc(totalLength);

  // Write GLB Header (12 bytes)
  glbBuffer.writeUInt32LE(GLB_MAGIC, 0);
  glbBuffer.writeUInt32LE(2, 4); // version 2
  glbBuffer.writeUInt32LE(totalLength, 8);

  // Write Chunk 0 (JSON)
  let offset = 12;
  glbBuffer.writeUInt32LE(jsonChunkLength, offset);
  glbBuffer.writeUInt32LE(CHUNK_TYPE_JSON, offset + 4);
  offset += 8;
  jsonBuffer.copy(glbBuffer, offset);
  offset += jsonBuffer.length;
  for (let i = 0; i < jsonPadding; i++) {
    glbBuffer.writeUInt8(0x20, offset + i);
  }
  offset += jsonPadding;

  // Write Chunk 1 (BIN)
  glbBuffer.writeUInt32LE(binChunkLength, offset);
  glbBuffer.writeUInt32LE(CHUNK_TYPE_BIN, offset + 4);
  offset += 8;
  binBuffer.copy(glbBuffer, offset);
  offset += binBuffer.length;
  for (let i = 0; i < binPadding; i++) {
    glbBuffer.writeUInt8(0x00, offset + i);
  }

  return glbBuffer;
}

export function createCorruptedGlb(variant) {
  const valid = createValidAlephGlb();

  switch (variant) {
    case 'invalid_magic': {
      const copy = Buffer.from(valid);
      copy.writeUInt32LE(0xdeadbeef, 0);
      return copy;
    }
    case 'unsupported_version': {
      const copy = Buffer.from(valid);
      copy.writeUInt32LE(3, 4); // version 3 (unsupported)
      return copy;
    }
    case 'truncated_header': {
      return valid.subarray(0, 8); // only 8 bytes instead of >= 12
    }
    case 'truncated_length': {
      const copy = Buffer.from(valid);
      copy.writeUInt32LE(valid.length * 2, 8); // claims 2x actual buffer length
      return copy;
    }
    case 'corrupted_json': {
      const copy = Buffer.from(valid);
      // Overwrite first 4 bytes of JSON text with invalid bytes '{{"['
      copy.write('{{"[', 20, 'utf-8');
      return copy;
    }
    case 'missing_extras': {
      return createValidAlephGlb({ omitExtras: true });
    }
    case 'empty_buffer': {
      return Buffer.alloc(0);
    }
    default:
      throw new Error(`Unknown corruption variant: ${variant}`);
  }
}

/**
 * Authoritative Reference Parser for GLB binary format.
 */
export function parseAlephGlbReference(buffer) {
  if (!buffer || buffer.length < 12) {
    throw new Error(`Buffer too short to be a valid GLB: length=${buffer?.length || 0}`);
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB magic header: 0x${magic.toString(16)} (expected 0x${GLB_MAGIC.toString(16)})`);
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version} (expected version 2)`);
  }

  const totalLength = buffer.readUInt32LE(8);
  if (buffer.length < totalLength) {
    throw new Error(`Truncated GLB: declared length ${totalLength}, buffer actual ${buffer.length}`);
  }

  // Parse Chunk 0 (must be JSON)
  const chunk0Length = buffer.readUInt32LE(12);
  const chunk0Type = buffer.readUInt32LE(16);
  if (chunk0Type !== CHUNK_TYPE_JSON) {
    throw new Error(`Expected chunk 0 to be JSON (0x${CHUNK_TYPE_JSON.toString(16)}), got 0x${chunk0Type.toString(16)}`);
  }

  if (buffer.length < 20 + chunk0Length) {
    throw new Error('Truncated JSON chunk');
  }

  const jsonStr = buffer.toString('utf-8', 20, 20 + chunk0Length);
  let gltf;
  try {
    gltf = JSON.parse(jsonStr.trim());
  } catch (err) {
    throw new Error(`Malformed GLB JSON chunk: ${err.message}`);
  }

  const georeference = gltf.asset?.extras?.georeference;
  if (!georeference) {
    throw new Error('Missing asset.extras.georeference metadata in GLB');
  }

  return {
    gltf,
    georeference: {
      lat: Number(georeference.lat ?? 0),
      lon: Number(georeference.lon ?? 0),
      baseAltitude: Number(georeference.baseAltitude ?? 0),
      altitudeOffset: Number(georeference.altitudeOffset ?? 0),
      heading: Number(georeference.heading ?? 0),
      scale: Number(georeference.scale ?? 1.0),
      radius: Number(georeference.radius ?? 50.0),
      bounds: georeference.bounds || [0, 0, 0, 0],
    },
    name: gltf.asset?.extras?.name || 'Untitled Capture',
    description: gltf.asset?.extras?.description || '',
    totalLength,
    chunk0Length,
  };
}
