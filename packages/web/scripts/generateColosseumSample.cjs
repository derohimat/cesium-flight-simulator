const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG
function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

// Generate a valid PNG buffer
function createPng(width, height, colorGen) {
  const bytesPerPixel = 4; // RGBA
  const rowSize = 1 + width * bytesPerPixel; // 1 filter byte per scanline
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorGen(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = createPngChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createPngChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createPngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Generate Colosseum 3D geometry
function generateColosseumMesh() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const segments = 48;

  function addQuad(p1, p2, p3, p4, n, uv1, uv2, uv3, uv4) {
    const baseIdx = positions.length / 3;
    positions.push(...p1, ...p2, ...p3, ...p4);
    normals.push(...n, ...n, ...n, ...n);
    uvs.push(...uv1, ...uv2, ...uv3, ...uv4);
    // Two triangles: (0, 1, 2) and (0, 2, 3)
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  }

  // Tiers definition for Roman Colosseum amphitheatre
  // Outer ellipse: Rx: 94m, Rz: 78m, Height: 48m
  // 4 Outer wall tiers with stepped setbacks
  const wallTiers = [
    { y0: 0,  y1: 12, rx: 94.0, rz: 78.0, thick: 4.0 },
    { y0: 12, y1: 24, rx: 92.5, rz: 76.5, thick: 3.8 },
    { y0: 24, y1: 36, rx: 91.0, rz: 75.0, thick: 3.5 },
    { y0: 36, y1: 48, rx: 89.5, rz: 73.5, thick: 3.2 }
  ];

  for (let t = 0; t < wallTiers.length; t++) {
    const tier = wallTiers[t];
    const nextTier = wallTiers[t + 1];

    for (let s = 0; s < segments; s++) {
      const theta1 = (s / segments) * 2 * Math.PI;
      const theta2 = ((s + 1) / segments) * 2 * Math.PI;

      const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);
      const cos2 = Math.cos(theta2), sin2 = Math.sin(theta2);

      // Outer wall vertices
      const p1 = [tier.rx * cos1, tier.y0, tier.rz * sin1];
      const p2 = [tier.rx * cos2, tier.y0, tier.rz * sin2];
      const p3 = [tier.rx * cos2, tier.y1, tier.rz * sin2];
      const p4 = [tier.rx * cos1, tier.y1, tier.rz * sin1];

      // Normal facing outwards
      const midTheta = (theta1 + theta2) / 2;
      const nOut = [Math.cos(midTheta), 0, Math.sin(midTheta)];

      const u1 = s / segments;
      const u2 = (s + 1) / segments;
      const v0 = t / 4;
      const v1 = (t + 1) / 4;

      addQuad(p1, p2, p3, p4, nOut, [u1, v0], [u2, v0], [u2, v1], [u1, v1]);

      // Inner wall of this tier
      const innerRx = tier.rx - tier.thick;
      const innerRz = tier.rz - tier.thick;
      const ip1 = [innerRx * cos2, tier.y0, innerRz * sin2];
      const ip2 = [innerRx * cos1, tier.y0, innerRz * sin1];
      const ip3 = [innerRx * cos1, tier.y1, innerRz * sin1];
      const ip4 = [innerRx * cos2, tier.y1, innerRz * sin2];
      const nIn = [-Math.cos(midTheta), 0, -Math.sin(midTheta)];

      addQuad(ip1, ip2, ip3, ip4, nIn, [u2, v0], [u1, v0], [u1, v1], [u2, v1]);

      // Top cornice / parapet of this tier
      const tp1 = [tier.rx * cos1, tier.y1, tier.rz * sin1];
      const tp2 = [tier.rx * cos2, tier.y1, tier.rz * sin2];
      const tp3 = [innerRx * cos2, tier.y1, innerRz * sin2];
      const tp4 = [innerRx * cos1, tier.y1, innerRz * sin1];
      addQuad(tp1, tp2, tp3, tp4, [0, 1, 0], [u1, v1], [u2, v1], [u2, v1], [u1, v1]);
    }
  }

  // Seating Cavea (sloping steps from tier 3 inner edge down to arena podium)
  const caveaTiers = 6;
  const topCaveaRx = 86.0, topCaveaRz = 70.0, topCaveaY = 36.0;
  const botCaveaRx = 50.0, botCaveaRz = 34.0, botCaveaY = 4.0;

  for (let c = 0; c < caveaTiers; c++) {
    const f0 = c / caveaTiers;
    const f1 = (c + 1) / caveaTiers;

    const r0x = topCaveaRx - f0 * (topCaveaRx - botCaveaRx);
    const r0z = topCaveaRz - f0 * (topCaveaRz - botCaveaRz);
    const y0 = topCaveaY - f0 * (topCaveaY - botCaveaY);

    const r1x = topCaveaRx - f1 * (topCaveaRx - botCaveaRx);
    const r1z = topCaveaRz - f1 * (topCaveaRz - botCaveaRz);
    const y1 = topCaveaY - f1 * (topCaveaY - botCaveaY);

    for (let s = 0; s < segments; s++) {
      const th1 = (s / segments) * 2 * Math.PI;
      const th2 = ((s + 1) / segments) * 2 * Math.PI;

      const p1 = [r0x * Math.cos(th1), y0, r0z * Math.sin(th1)];
      const p2 = [r0x * Math.cos(th2), y0, r0z * Math.sin(th2)];
      const p3 = [r1x * Math.cos(th2), y1, r1z * Math.sin(th2)];
      const p4 = [r1x * Math.cos(th1), y1, r1z * Math.sin(th1)];

      const nCavea = [0, 0.9, 0.43];
      addQuad(p1, p2, p3, p4, nCavea, [s / segments, f0], [(s + 1) / segments, f0], [(s + 1) / segments, f1], [s / segments, f1]);
    }
  }

  // Arena floor & Podium wall
  const arenaRx = 46.0, arenaRz = 30.0, arenaY = 2.0;
  for (let s = 0; s < segments; s++) {
    const th1 = (s / segments) * 2 * Math.PI;
    const th2 = ((s + 1) / segments) * 2 * Math.PI;

    // Podium vertical wall
    const pw1 = [botCaveaRx * Math.cos(th1), botCaveaY, botCaveaRz * Math.sin(th1)];
    const pw2 = [botCaveaRx * Math.cos(th2), botCaveaY, botCaveaRz * Math.sin(th2)];
    const pw3 = [arenaRx * Math.cos(th2), arenaY, arenaRz * Math.sin(th2)];
    const pw4 = [arenaRx * Math.cos(th1), arenaY, arenaRz * Math.sin(th1)];
    addQuad(pw1, pw2, pw3, pw4, [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);

    // Arena sand floor triangle towards center (0, arenaY, 0)
    const af1 = [0, arenaY, 0];
    const af2 = [arenaRx * Math.cos(th1), arenaY, arenaRz * Math.sin(th1)];
    const af3 = [arenaRx * Math.cos(th2), arenaY, arenaRz * Math.sin(th2)];

    const baseIdx = positions.length / 3;
    positions.push(...af1, ...af2, ...af3);
    normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0);
    uvs.push(0.5, 0.5,  0.5 + 0.5 * Math.cos(th1), 0.5 + 0.5 * Math.sin(th1),  0.5 + 0.5 * Math.cos(th2), 0.5 + 0.5 * Math.sin(th2));
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  return { positions, normals, uvs, indices };
}

// Generate travertine stone texture (128x128)
function generateTravertineTexture() {
  return createPng(128, 128, (x, y, w, h) => {
    // Roman travertine stone colors: warm beige/ochre with stone block seams
    const stoneNoise = ((Math.sin(x * 0.4) * Math.cos(y * 0.3) + Math.sin((x + y) * 0.2)) * 0.5 + 0.5);
    const blockX = x % 32;
    const blockY = y % 16;
    const isMortar = (blockX === 0 || blockY === 0);

    let r = Math.floor(215 + stoneNoise * 25);
    let g = Math.floor(195 + stoneNoise * 20);
    let b = Math.floor(165 + stoneNoise * 18);

    if (isMortar) {
      r = Math.floor(r * 0.7);
      g = Math.floor(g * 0.7);
      b = Math.floor(b * 0.7);
    }

    return [r, g, b, 255];
  });
}

function buildGlb() {
  const meshData = generateColosseumMesh();
  const texturePng = generateTravertineTexture();

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < meshData.positions.length; i += 3) {
    const x = meshData.positions[i];
    const y = meshData.positions[i + 1];
    const z = meshData.positions[i + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const indicesBuf = Buffer.alloc(meshData.indices.length * 2);
  for (let i = 0; i < meshData.indices.length; i++) {
    indicesBuf.writeUInt16LE(meshData.indices[i], i * 2);
  }

  const positionsBuf = Buffer.alloc(meshData.positions.length * 4);
  for (let i = 0; i < meshData.positions.length; i++) {
    positionsBuf.writeFloatLE(meshData.positions[i], i * 4);
  }

  const normalsBuf = Buffer.alloc(meshData.normals.length * 4);
  for (let i = 0; i < meshData.normals.length; i++) {
    normalsBuf.writeFloatLE(meshData.normals[i], i * 4);
  }

  const uvsBuf = Buffer.alloc(meshData.uvs.length * 4);
  for (let i = 0; i < meshData.uvs.length; i++) {
    uvsBuf.writeFloatLE(meshData.uvs[i], i * 4);
  }

  function pad4(buf) {
    const rem = buf.length % 4;
    if (rem === 0) return buf;
    const pad = 4 - rem;
    return Buffer.concat([buf, Buffer.alloc(pad)]);
  }

  const pIndicesBuf = pad4(indicesBuf);
  const pPositionsBuf = pad4(positionsBuf);
  const pNormalsBuf = pad4(normalsBuf);
  const pUvsBuf = pad4(uvsBuf);
  const pTextureBuf = pad4(texturePng);

  const offsetIndices = 0;
  const offsetPositions = offsetIndices + pIndicesBuf.length;
  const offsetNormals = offsetPositions + pPositionsBuf.length;
  const offsetUvs = offsetNormals + pNormalsBuf.length;
  const offsetTexture = offsetUvs + pUvsBuf.length;

  const binBuffer = Buffer.concat([pIndicesBuf, pPositionsBuf, pNormalsBuf, pUvsBuf, pTextureBuf]);

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Aleph',
      copyright: '© Google',
      extras: {
        latitude: 41.89021,
        longitude: 12.49223,
        base: 24.0,
        radius: 95.0,
        bounds: [41.889, 12.491, 41.891, 12.493],
        frame: 'meters east (x), up (y), and south (z) of the center; y = 0 is the lowest point, base meters above sea level',
        name: 'Roman Colosseum (Aleph 3D)'
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Colosseum' }],
    meshes: [
      {
        name: 'ColosseumMesh',
        primitives: [
          {
            attributes: {
              POSITION: 1,
              NORMAL: 2,
              TEXCOORD_0: 3
            },
            indices: 0,
            material: 0
          }
        ]
      }
    ],
    materials: [
      {
        name: 'RomanTravertine',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.05,
          roughnessFactor: 0.85
        },
        doubleSided: true
      }
    ],
    textures: [{ source: 0 }],
    images: [
      {
        bufferView: 4,
        mimeType: 'image/png',
        name: 'travertine'
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: meshData.indices.length,
        type: 'SCALAR',
        min: [0],
        max: [meshData.positions.length / 3 - 1]
      },
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: meshData.positions.length / 3,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      },
      {
        bufferView: 2,
        componentType: 5126, // FLOAT
        count: meshData.normals.length / 3,
        type: 'VEC3',
        min: [-1, -1, -1],
        max: [1, 1, 1]
      },
      {
        bufferView: 3,
        componentType: 5126, // FLOAT
        count: meshData.uvs.length / 2,
        type: 'VEC2',
        min: [0, 0],
        max: [1, 1]
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: offsetIndices,
        byteLength: indicesBuf.length,
        target: 34963 // ELEMENT_ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: offsetPositions,
        byteLength: positionsBuf.length,
        target: 34962 // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: offsetNormals,
        byteLength: normalsBuf.length,
        target: 34962 // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: offsetUvs,
        byteLength: uvsBuf.length,
        target: 34962 // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: offsetTexture,
        byteLength: texturePng.length
      }
    ],
    buffers: [
      {
        byteLength: binBuffer.length
      }
    ]
  };

  const jsonStr = JSON.stringify(gltf);
  let jsonBuffer = Buffer.from(jsonStr, 'utf-8');
  const jsonRem = jsonBuffer.length % 4;
  if (jsonRem !== 0) {
    const pad = 4 - jsonRem;
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from(' '.repeat(pad), 'utf-8')]);
  }

  const header = Buffer.alloc(12);
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  header.writeUInt32LE(0x46546C67, 0); // "glTF"
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLength, 8); // total byte length

  const chunk0Header = Buffer.alloc(8);
  chunk0Header.writeUInt32LE(jsonBuffer.length, 0);
  chunk0Header.writeUInt32LE(0x4E4F534A, 4); // "JSON"

  const chunk1Header = Buffer.alloc(8);
  chunk1Header.writeUInt32LE(binBuffer.length, 0);
  chunk1Header.writeUInt32LE(0x004E4942, 4); // "BIN\0"

  const glb = Buffer.concat([header, chunk0Header, jsonBuffer, chunk1Header, binBuffer]);

  return { glb, gltf, meshData };
}

// Generate thumbnail image (256x256 preview)
function generateThumbnail() {
  return createPng(256, 256, (x, y, w, h) => {
    // Blue Italian sky on top, green/stone ground at bottom, oval amphitheater in center
    const cx = w / 2;
    const cy = h / 2 + 10;
    const dx = (x - cx) / (w * 0.38);
    const dy = (y - cy) / (h * 0.28);
    const dist = dx * dx + dy * dy;

    if (dist <= 1.0) {
      // Inside Colosseum oval: stone shades with inner seating
      if (dist <= 0.35) {
        // Inner arena sand
        return [220, 200, 160, 255];
      }
      return [190, 175, 145, 255];
    } else if (dist <= 1.15) {
      // Outer rim
      return [150, 135, 110, 255];
    }

    if (y < h * 0.6) {
      // Sky gradient
      const skyGrad = y / (h * 0.6);
      return [Math.floor(70 + skyGrad * 40), Math.floor(140 + skyGrad * 40), Math.floor(210 + skyGrad * 30), 255];
    } else {
      // Ground / grass
      return [90, 130, 80, 255];
    }
  });
}

function main() {
  const outDir = path.resolve(__dirname, '../public/samples/colosseum');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Generating Colosseum GLB...');
  const { glb, gltf, meshData } = buildGlb();
  const glbPath = path.join(outDir, 'mesh.glb');
  fs.writeFileSync(glbPath, glb);
  console.log(`Wrote mesh.glb: ${(glb.length / 1024).toFixed(1)} KB with ${meshData.positions.length / 3} vertices.`);

  const metadata = {
    id: 'colosseum-sample',
    name: 'Roman Colosseum (Aleph 3D)',
    category: 'custom',
    lat: 41.89021,
    lon: 12.49223,
    altitude: 150,
    baseAltitude: 24.0,
    altitudeOffset: 0,
    heading: 0,
    scale: 1.0,
    radius: 95.0,
    bounds: [41.889, 12.491, 41.891, 12.493],
    thumbnail: '/samples/colosseum/thumbnail.jpg',
    isolationEnabled: true,
    isBundled: true,
    description: 'High-detail 3D photogrammetric capture of the Roman Colosseum in Rome, Italy, generated by Aleph.'
  };

  const metadataPath = path.join(outDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`Wrote metadata.json`);

  const manifest = {
    format: 'aleph-python',
    version: 6,
    area: {
      latitude: 41.89021,
      longitude: 12.49223,
      base: 24.0,
      radius: 95.0,
      bounds: [41.889, 12.491, 41.891, 12.493]
    },
    polygon: [
      [41.889, 12.491],
      [41.891, 12.491],
      [41.891, 12.493],
      [41.889, 12.493]
    ]
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('Generating thumbnail...');
  const thumbnail = generateThumbnail();
  fs.writeFileSync(path.join(outDir, 'thumbnail.png'), thumbnail);
  fs.writeFileSync(path.join(outDir, 'thumbnail.jpg'), thumbnail);
  console.log('Done generating bundled sample Colosseum!');
}

main();
