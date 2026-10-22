import type { AlephCaptureMetadata, AlephGlbExtras, ParsedAlephCapture } from './types';

/**
 * Validates and parses a glTF 2.0 binary (.glb) buffer using DataView.
 * Extracts embedded asset.extras georeference metadata and computes fallback bounding dimensions.
 */
export function parseGlbBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName?: string
): { metadata: AlephCaptureMetadata; gltf: any } {
  const arrayBuffer = buffer instanceof Uint8Array ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
  const dataView = new DataView(arrayBuffer);

  if (dataView.byteLength < 12) {
    throw new Error('Invalid file: buffer is smaller than GLB header (12 bytes).');
  }

  // 1. Validate 12-byte GLB header
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546c67) { // ASCII "glTF"
    throw new Error('Invalid 3D model: file magic does not match glTF binary (0x46546C67).');
  }

  const version = dataView.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}. Only glTF 2.0 is supported.`);
  }

  const totalLength = dataView.getUint32(8, true);
  if (totalLength > dataView.byteLength) {
    throw new Error(`Corrupt GLB: header declared length (${totalLength}) exceeds buffer size (${dataView.byteLength}).`);
  }

  // 2. Read Chunk 0 (JSON)
  if (dataView.byteLength < 20) {
    throw new Error('Corrupt GLB: missing Chunk 0 header.');
  }

  const chunk0Length = dataView.getUint32(12, true);
  const chunk0Type = dataView.getUint32(16, true);
  if (chunk0Type !== 0x4e4f534a) { // ASCII "JSON"
    throw new Error('Corrupt GLB: chunk 0 is not JSON (0x4E4F534A).');
  }

  if (20 + chunk0Length > dataView.byteLength) {
    throw new Error('Corrupt GLB: chunk 0 length extends beyond buffer boundaries.');
  }

  const jsonBytes = new Uint8Array(arrayBuffer, 20, chunk0Length);
  const jsonText = new TextDecoder('utf-8').decode(jsonBytes);

  let gltf: any;
  try {
    gltf = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Corrupt GLB JSON chunk: ${(err as Error).message}`);
  }

  // 3. Extract asset.extras
  const extras: AlephGlbExtras = gltf.asset?.extras || {};

  // Extract or calculate coordinates
  let lat = typeof extras.latitude === 'number' ? extras.latitude : 0;
  let lon = typeof extras.longitude === 'number' ? extras.longitude : 0;
  let baseAltitude = typeof extras.base === 'number' ? extras.base : 0;
  let radius = typeof extras.radius === 'number' ? extras.radius : 0;
  let bounds = Array.isArray(extras.bounds) && extras.bounds.length === 4
    ? (extras.bounds as [number, number, number, number])
    : undefined;

  // 4. Fallback: compute bounding dimensions from mesh accessors if radius is not in extras
  if (!radius || radius <= 0) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    if (Array.isArray(gltf.accessors)) {
      for (const accessor of gltf.accessors) {
        if (accessor.type === 'VEC3' && Array.isArray(accessor.min) && Array.isArray(accessor.max)) {
          minX = Math.min(minX, accessor.min[0]);
          maxX = Math.max(maxX, accessor.max[0]);
          minY = Math.min(minY, accessor.min[1]);
          maxY = Math.max(maxY, accessor.max[1]);
          minZ = Math.min(minZ, accessor.min[2]);
          maxZ = Math.max(maxZ, accessor.max[2]);
        }
      }
    }

    if (minX !== Infinity && maxX !== -Infinity) {
      const width = maxX - minX;
      const height = maxY - minY;
      const depth = maxZ - minZ;
      radius = Math.max(10, 0.5 * Math.sqrt(width * width + height * height + depth * depth));
    } else {
      radius = 50; // safe default radius in meters
    }
  }

  // Fallback bounds if omitted
  if (!bounds && (lat !== 0 || lon !== 0)) {
    const latDelta = (radius / 111320) * 1.5;
    const lonDelta = (radius / (111320 * Math.cos((lat * Math.PI) / 180))) * 1.5;
    bounds = [lat - latDelta, lon - lonDelta, lat + latDelta, lon + lonDelta];
  }

  // Derive human-friendly name
  let name = '';
  if (typeof (extras as any).name === 'string' && (extras as any).name.trim()) {
    name = (extras as any).name.trim();
  } else if (fileName) {
    // Strip file extensions and convert snake_case/kebab-case to title case
    const baseName = fileName.replace(/\.(glb|gltf|zip)$/i, '');
    name = baseName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  if (!name) {
    name = 'Aleph 3D Capture';
  }

  const id = `aleph-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const metadata: AlephCaptureMetadata = {
    id,
    name,
    lat,
    lon,
    baseAltitude,
    altitudeOffset: 0,
    heading: 0,
    scale: 1.0,
    radius,
    bounds,
    importedAt: Date.now(),
    isBundled: false,
    isolationEnabled: true,
    description: (extras as any).description || `Aleph 3D Capture (${Math.round(radius)}m radius)`
  };

  return { metadata, gltf };
}

/**
 * Parses separate metadata.json or manifest.json files exported by Aleph or Sky Studio.
 */
export function parseMetadataJson(jsonStr: string): Partial<AlephCaptureMetadata> {
  try {
    const data = JSON.parse(jsonStr);
    const result: Partial<AlephCaptureMetadata> = {};

    if (data.name) result.name = String(data.name);
    if (data.description) result.description = String(data.description);

    // Coordinate resolution
    if (typeof data.lat === 'number') result.lat = data.lat;
    else if (typeof data.latitude === 'number') result.lat = data.latitude;

    if (typeof data.lon === 'number') result.lon = data.lon;
    else if (typeof data.longitude === 'number') result.lon = data.longitude;

    // Altitude resolution
    if (typeof data.baseAltitude === 'number') result.baseAltitude = data.baseAltitude;
    else if (typeof data.baseElevation === 'number') result.baseAltitude = data.baseElevation;
    else if (typeof data.base === 'number') result.baseAltitude = data.base;
    else if (typeof data.altitude === 'number') result.baseAltitude = data.altitude;

    // Radius resolution
    if (typeof data.radius === 'number') result.radius = data.radius;
    else if (typeof data.boundingRadius === 'number') result.radius = data.boundingRadius;

    // Bounds resolution
    if (Array.isArray(data.bounds) && data.bounds.length === 4) {
      result.bounds = data.bounds as [number, number, number, number];
    }

    // Tuning defaults
    if (typeof data.altitudeOffset === 'number') result.altitudeOffset = data.altitudeOffset;
    if (typeof data.heading === 'number') result.heading = data.heading;
    else if (typeof data.headingOffset === 'number') result.heading = data.headingOffset;
    if (typeof data.scale === 'number') result.scale = data.scale;
    if (typeof data.isolationEnabled === 'boolean') result.isolationEnabled = data.isolationEnabled;
    else if (typeof data.sceneryIsolation === 'boolean') result.isolationEnabled = data.sceneryIsolation;

    // Polygon in Aleph manifest.json
    if (Array.isArray(data.polygon) && data.polygon.length > 0) {
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      for (const pt of data.polygon) {
        const pLat = Array.isArray(pt) ? pt[0] : pt.lat;
        const pLon = Array.isArray(pt) ? pt[1] : pt.lon;
        if (typeof pLat === 'number' && typeof pLon === 'number') {
          minLat = Math.min(minLat, pLat);
          maxLat = Math.max(maxLat, pLat);
          minLon = Math.min(minLon, pLon);
          maxLon = Math.max(maxLon, pLon);
        }
      }
      if (minLat <= maxLat && minLon <= maxLon) {
        if (result.lat === undefined) result.lat = (minLat + maxLat) / 2;
        if (result.lon === undefined) result.lon = (minLon + maxLon) / 2;
        if (!result.bounds) result.bounds = [minLat, minLon, maxLat, maxLon];
      }
    }

    return result;
  } catch (err) {
    console.warn('Failed to parse metadata JSON:', err);
    return {};
  }
}

/**
 * Minimal uncompressed & deflate ZIP reader using browser DecompressionStream.
 */
async function extractZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(buffer);
  let offset = 0;

  while (offset + 30 <= buffer.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      // Reached central directory or end of local headers
      break;
    }

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);

    const nameBytes = new Uint8Array(buffer, offset + 30, fileNameLength);
    const fileName = new TextDecoder('utf-8').decode(nameBytes);

    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
    const compressedData = new Uint8Array(buffer, dataOffset, compressedSize);

    if (compressionMethod === 0) {
      // Stored (no compression)
      entries.set(fileName, compressedData);
    } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
      // Deflate
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compressedData);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        entries.set(fileName, new Uint8Array(decompressed));
      } catch (err) {
        console.warn(`Failed to decompress ZIP entry "${fileName}":`, err);
      }
    }

    offset = dataOffset + compressedSize;
  }

  return entries;
}

/**
 * Ingests multi-file drag-and-drop or file upload (GLB + JSON + Thumbnail, or ZIP).
 */
export async function parseCapturePackage(
  files: File[] | FileList
): Promise<ParsedAlephCapture> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    throw new Error('No files provided for ingestion.');
  }

  // Check if single zip was uploaded
  if (fileArray.length === 1 && fileArray[0].name.toLowerCase().endsWith('.zip')) {
    const zipBuffer = await fileArray[0].arrayBuffer();
    const zipEntries = await extractZipEntries(zipBuffer);

    let glbEntry: { name: string; bytes: Uint8Array } | null = null;
    let jsonEntry: { name: string; bytes: Uint8Array } | null = null;
    let thumbEntry: { name: string; bytes: Uint8Array } | null = null;

    for (const [name, bytes] of zipEntries.entries()) {
      const lower = name.toLowerCase();
      if (lower.endsWith('.glb')) {
        glbEntry = { name, bytes };
      } else if (lower.endsWith('.json') && !lower.includes('package')) {
        jsonEntry = { name, bytes };
      } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
        thumbEntry = { name, bytes };
      }
    }

    if (!glbEntry) {
      throw new Error('No .glb model file found inside the ZIP archive.');
    }

    const { metadata } = parseGlbBuffer(glbEntry.bytes, glbEntry.name);

    if (jsonEntry) {
      const jsonText = new TextDecoder('utf-8').decode(jsonEntry.bytes);
      const jsonMeta = parseMetadataJson(jsonText);
      Object.assign(metadata, jsonMeta);
    }

    let thumbnailBlob: Blob | undefined;
    if (thumbEntry) {
      const mime = thumbEntry.name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      thumbnailBlob = new Blob([thumbEntry.bytes], { type: mime });
      metadata.thumbnailUrl = URL.createObjectURL(thumbnailBlob);
    }

    const glbBlob = new Blob([glbEntry.bytes], { type: 'model/gltf-binary' });
    return { metadata, glbBlob, thumbnailBlob };
  }

  // Find glb file
  const glbFile = fileArray.find(f => f.name.toLowerCase().endsWith('.glb'));
  if (!glbFile) {
    throw new Error('No .glb 3D model found. Please drop an Aleph mesh.glb file or package.');
  }

  const glbBuffer = await glbFile.arrayBuffer();
  const { metadata } = parseGlbBuffer(glbBuffer, glbFile.name);

  // Find optional metadata json
  const jsonFile = fileArray.find(f => f.name.toLowerCase().endsWith('.json'));
  if (jsonFile) {
    const jsonText = await jsonFile.text();
    const jsonMeta = parseMetadataJson(jsonText);
    Object.assign(metadata, jsonMeta);
  }

  // Find optional thumbnail
  const imageFile = fileArray.find(f => /\.(png|jpe?g|webp)$/i.test(f.name));
  let thumbnailBlob: Blob | undefined;
  if (imageFile) {
    thumbnailBlob = imageFile;
    metadata.thumbnailUrl = URL.createObjectURL(imageFile);
  }

  const glbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
  return { metadata, glbBlob, thumbnailBlob };
}
