const fs = require('fs');
const path = require('path');

const GLB_MAGIC = 0x46546c67;
const CHUNK_TYPE_JSON = 0x4e4f534a;
const CHUNK_TYPE_BIN = 0x004e4942;

/**
 * Generate a clean, modern, low-poly car model in glTF 2.0 / GLB format.
 * Coordinates:
 *   +X = Front (Forward)
 *   -X = Rear (Back)
 *   +Y = Left
 *   -Y = Right
 *   +Z = Up (Ground at Z = 0)
 */
function generateCarModel() {
  const primitivesData = {
    body: { positions: [], normals: [], uvs: [], indices: [] },
    glass: { positions: [], normals: [], uvs: [], indices: [] },
    wheels: { positions: [], normals: [], uvs: [], indices: [] },
    lightsFront: { positions: [], normals: [], uvs: [], indices: [] },
    lightsRear: { positions: [], normals: [], uvs: [], indices: [] },
  };

  // glTF 2.0 coordinate conversion for Cesium:
  // Cesium's Model loader applies Y_UP_TO_Z_UP ([x, y, z] -> [x, -z, y]).
  // To have the vehicle upright with +X=forward, +Y=left, +Z=up in Cesium,
  // the glTF coordinates must be: glTF.X = x, glTF.Y = z, glTF.Z = -y.
  function toGltf([x, y, z]) {
    return [x, z, -y];
  }

  // Helper to add a planar quad (two triangles)
  function addQuad(part, p1, p2, p3, p4) {
    const list = primitivesData[part];
    const baseIdx = list.positions.length / 3;

    const gp1 = toGltf(p1);
    const gp2 = toGltf(p2);
    const gp3 = toGltf(p3);
    const gp4 = toGltf(p4);

    // Calculate surface normal via cross product in glTF coordinates (gp2 - gp1) x (gp3 - gp1)
    const v1 = [gp2[0] - gp1[0], gp2[1] - gp1[1], gp2[2] - gp1[2]];
    const v2 = [gp3[0] - gp1[0], gp3[1] - gp1[1], gp3[2] - gp1[2]];
    let nx = v1[1] * v2[2] - v1[2] * v2[1];
    let ny = v1[2] * v2[0] - v1[0] * v2[2];
    let nz = v1[0] * v2[1] - v1[1] * v2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    list.positions.push(...gp1, ...gp2, ...gp3, ...gp4);
    list.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    list.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    list.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  }

  // Helper to add a triangle
  function addTri(part, p1, p2, p3) {
    const list = primitivesData[part];
    const baseIdx = list.positions.length / 3;

    const gp1 = toGltf(p1);
    const gp2 = toGltf(p2);
    const gp3 = toGltf(p3);

    const v1 = [gp2[0] - gp1[0], gp2[1] - gp1[1], gp2[2] - gp1[2]];
    const v2 = [gp3[0] - gp1[0], gp3[1] - gp1[1], gp3[2] - gp1[2]];
    let nx = v1[1] * v2[2] - v1[2] * v2[1];
    let ny = v1[2] * v2[0] - v1[0] * v2[2];
    let nz = v1[0] * v2[1] - v1[1] * v2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    list.positions.push(...gp1, ...gp2, ...gp3);
    list.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    list.uvs.push(0, 0, 1, 0, 0.5, 1);
    list.indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  // --- CAR BODY (Sleek aerodynamic sports car proportions) ---
  // Dimensions in metres: Length: 4.4m, Width: 1.9m, Height: 1.25m
  // Ground is Z=0. Wheels touch Z=0. Chassis base is at Z=0.25.

  // Chassis bottom
  addQuad('body', [-2.1, -0.85, 0.25], [2.1, -0.85, 0.25], [2.1, 0.85, 0.25], [-2.1, 0.85, 0.25]);

  // Front bumper / nose (slanted down)
  addQuad('body', [2.2, -0.8, 0.28], [2.2, 0.8, 0.28], [2.05, 0.85, 0.55], [2.05, -0.85, 0.55]);
  // Front grille lower
  addQuad('body', [2.1, -0.85, 0.25], [-2.1, -0.85, 0.25], [-2.1, 0.85, 0.25], [2.1, 0.85, 0.25]); // underside
  addQuad('body', [2.1, -0.85, 0.25], [2.2, -0.8, 0.28], [2.2, 0.8, 0.28], [2.1, 0.85, 0.25]);

  // Hood (sloping from nose up to windshield base)
  addQuad('body', [2.05, -0.85, 0.55], [2.05, 0.85, 0.55], [0.65, 0.8, 0.72], [0.65, -0.8, 0.72]);

  // Front fenders / side hood bevels
  addQuad('body', [2.05, 0.85, 0.55], [2.2, 0.8, 0.28], [0.65, 0.9, 0.35], [0.65, 0.8, 0.72]);
  addQuad('body', [2.2, -0.8, 0.28], [2.05, -0.85, 0.55], [0.65, -0.8, 0.72], [0.65, -0.9, 0.35]);

  // Cabin roof
  addQuad('body', [-0.5, -0.65, 1.25], [0.15, -0.65, 1.25], [0.15, 0.65, 1.25], [-0.5, 0.65, 1.25]);

  // Rear deck / trunk
  addQuad('body', [-0.95, -0.75, 0.82], [-0.95, 0.75, 0.82], [-1.95, 0.85, 0.75], [-1.95, -0.85, 0.75]);

  // Rear spoiler
  addQuad('body', [-2.0, -0.8, 0.92], [-1.8, -0.8, 0.92], [-1.8, 0.8, 0.92], [-2.0, 0.8, 0.92]);
  addQuad('body', [-2.0, -0.8, 0.90], [-2.0, 0.8, 0.90], [-1.8, 0.8, 0.90], [-1.8, -0.8, 0.90]);
  // Spoiler struts
  addQuad('body', [-1.9, 0.5, 0.76], [-1.85, 0.5, 0.91], [-1.85, 0.55, 0.91], [-1.9, 0.55, 0.76]);
  addQuad('body', [-1.9, -0.55, 0.76], [-1.85, -0.55, 0.91], [-1.85, -0.5, 0.91], [-1.9, -0.5, 0.76]);

  // Rear bumper / tail fascia
  addQuad('body', [-1.95, 0.85, 0.75], [-1.95, -0.85, 0.75], [-2.1, -0.85, 0.35], [-2.1, 0.85, 0.35]);
  // Rear diffuser lower
  addQuad('body', [-2.1, 0.85, 0.35], [-2.1, -0.85, 0.35], [-2.05, -0.75, 0.25], [-2.05, 0.75, 0.25]);

  // Sides: Left Door & Panels (+Y side)
  addQuad('body', [0.65, 0.8, 0.72], [0.65, 0.9, 0.35], [-0.95, 0.9, 0.35], [-0.95, 0.75, 0.82]);
  addQuad('body', [-0.95, 0.75, 0.82], [-0.95, 0.9, 0.35], [-1.95, 0.85, 0.35], [-1.95, 0.85, 0.75]);
  // Side lower skirt (Left)
  addQuad('body', [0.65, 0.9, 0.35], [2.1, 0.85, 0.25], [2.1, 0.85, 0.25], [0.65, 0.9, 0.35]); // placeholder
  addQuad('body', [2.1, 0.85, 0.25], [-2.05, 0.85, 0.25], [-2.05, 0.85, 0.35], [2.1, 0.85, 0.35]);

  // Sides: Right Door & Panels (-Y side)
  addQuad('body', [0.65, -0.9, 0.35], [0.65, -0.8, 0.72], [-0.95, -0.75, 0.82], [-0.95, -0.9, 0.35]);
  addQuad('body', [-0.95, -0.9, 0.35], [-0.95, -0.75, 0.82], [-1.95, -0.85, 0.75], [-1.95, -0.85, 0.35]);
  // Side lower skirt (Right)
  addQuad('body', [-2.05, -0.85, 0.25], [2.1, -0.85, 0.25], [2.1, -0.85, 0.35], [-2.05, -0.85, 0.35]);

  // --- GLASS / WINDOWS ---
  // Front Windshield (slanted sleek glass)
  addQuad('glass', [0.65, -0.76, 0.73], [0.65, 0.76, 0.73], [0.15, 0.65, 1.25], [0.15, -0.65, 1.25]);

  // Rear Windshield (slanted fastback glass)
  addQuad('glass', [-0.5, 0.65, 1.25], [-0.5, -0.65, 1.25], [-0.95, -0.74, 0.83], [-0.95, 0.74, 0.83]);

  // Left Side Windows
  addQuad('glass', [0.15, 0.66, 1.24], [-0.5, 0.66, 1.24], [-0.65, 0.75, 0.81], [0.45, 0.75, 0.77]);
  // A-pillar & C-pillar triangles (Left)
  addTri('glass', [0.65, 0.76, 0.73], [0.45, 0.75, 0.77], [0.15, 0.66, 1.24]);
  addTri('glass', [-0.5, 0.66, 1.24], [-0.65, 0.75, 0.81], [-0.95, 0.74, 0.83]);

  // Right Side Windows
  addQuad('glass', [-0.5, -0.66, 1.24], [0.15, -0.66, 1.24], [0.45, -0.75, 0.77], [-0.65, -0.75, 0.81]);
  // A-pillar & C-pillar triangles (Right)
  addTri('glass', [0.45, -0.75, 0.77], [0.65, -0.76, 0.73], [0.15, -0.66, 1.24]);
  addTri('glass', [-0.65, -0.75, 0.81], [-0.5, -0.66, 1.24], [-0.95, -0.74, 0.83]);

  // --- HEADLIGHTS (Sleek cyber neon headlights) ---
  // Left headlight
  addQuad('lightsFront', [2.06, 0.45, 0.54], [2.06, 0.82, 0.54], [1.95, 0.84, 0.58], [1.95, 0.45, 0.58]);
  // Right headlight
  addQuad('lightsFront', [2.06, -0.82, 0.54], [2.06, -0.45, 0.54], [1.95, -0.45, 0.58], [1.95, -0.84, 0.58]);

  // --- TAILLIGHTS (Sleek continuous lightbar) ---
  addQuad('lightsRear', [-1.96, -0.82, 0.72], [-1.96, 0.82, 0.72], [-1.96, 0.82, 0.75], [-1.96, -0.82, 0.75]);

  // --- 4 WHEELS (Stylized 8-sided cylinders with rims) ---
  function addWheel(centerX, centerY, centerZ, radius, width) {
    const segments = 10;
    const halfW = width / 2;
    const isLeft = centerY > 0;
    const outerY = centerY + (isLeft ? halfW : -halfW);
    const innerY = centerY - (isLeft ? halfW : -halfW);

    const outerCircle = [];
    const innerCircle = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const dx = Math.cos(angle) * radius;
      const dz = Math.sin(angle) * radius;
      outerCircle.push([centerX + dx, outerY, centerZ + dz]);
      innerCircle.push([centerX + dx, innerY, centerZ + dz]);
    }

    // Outer wheel face
    const outerCenter = [centerX, outerY, centerZ];
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      if (isLeft) {
        addTri('wheels', outerCenter, outerCircle[i], outerCircle[next]);
      } else {
        addTri('wheels', outerCenter, outerCircle[next], outerCircle[i]);
      }
    }

    // Inner wheel face
    const innerCenter = [centerX, innerY, centerZ];
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      if (isLeft) {
        addTri('wheels', innerCenter, innerCircle[next], innerCircle[i]);
      } else {
        addTri('wheels', innerCenter, innerCircle[i], innerCircle[next]);
      }
    }

    // Tire tread / rim cylinder
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      if (isLeft) {
        addQuad('wheels', innerCircle[i], innerCircle[next], outerCircle[next], outerCircle[i]);
      } else {
        addQuad('wheels', outerCircle[i], outerCircle[next], innerCircle[next], innerCircle[i]);
      }
    }
  }

  // Wheel specs: radius = 0.35m (touches ground at Z=0), width = 0.28m
  const wheelR = 0.35;
  const wheelW = 0.28;
  const wheelY = 0.88;
  // Front wheels
  addWheel(1.35, wheelY, wheelR, wheelR, wheelW);
  addWheel(1.35, -wheelY, wheelR, wheelR, wheelW);
  // Rear wheels
  addWheel(-1.3, wheelY, wheelR, wheelR, wheelW);
  addWheel(-1.3, -wheelY, wheelR, wheelR, wheelW);

  // --- BUILD BINARY GLB ---
  const materials = [
    {
      name: 'CarBodyPaint',
      pbrMetallicRoughness: {
        baseColorFactor: [0.08, 0.45, 0.95, 1.0], // Electric Blue Sports Paint
        metallicFactor: 0.8,
        roughnessFactor: 0.25,
      },
    },
    {
      name: 'TintedGlass',
      pbrMetallicRoughness: {
        baseColorFactor: [0.05, 0.08, 0.12, 0.85], // Dark Tint Glass
        metallicFactor: 0.9,
        roughnessFactor: 0.1,
      },
    },
    {
      name: 'WheelTire',
      pbrMetallicRoughness: {
        baseColorFactor: [0.12, 0.12, 0.14, 1.0], // Matte Dark Charcoal Tire
        metallicFactor: 0.3,
        roughnessFactor: 0.7,
      },
    },
    {
      name: 'Headlights',
      pbrMetallicRoughness: {
        baseColorFactor: [0.85, 0.95, 1.0, 1.0],
        metallicFactor: 0.1,
        roughnessFactor: 0.1,
      },
      emissiveFactor: [0.9, 0.95, 1.0],
    },
    {
      name: 'Taillights',
      pbrMetallicRoughness: {
        baseColorFactor: [0.9, 0.05, 0.05, 1.0],
        metallicFactor: 0.1,
        roughnessFactor: 0.2,
      },
      emissiveFactor: [1.0, 0.05, 0.05],
    },
  ];

  const partNames = ['body', 'glass', 'wheels', 'lightsFront', 'lightsRear'];
  const accessors = [];
  const bufferViews = [];
  const primitives = [];
  const binBuffers = [];
  let currentOffset = 0;

  partNames.forEach((name, matIdx) => {
    const data = primitivesData[name];
    if (data.positions.length === 0) return;

    // Positions (Float32)
    const posBuf = Buffer.from(new Float32Array(data.positions).buffer);
    const posMin = [Infinity, Infinity, Infinity];
    const posMax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.positions.length; i += 3) {
      posMin[0] = Math.min(posMin[0], data.positions[i]);
      posMin[1] = Math.min(posMin[1], data.positions[i + 1]);
      posMin[2] = Math.min(posMin[2], data.positions[i + 2]);
      posMax[0] = Math.max(posMax[0], data.positions[i]);
      posMax[1] = Math.max(posMax[1], data.positions[i + 1]);
      posMax[2] = Math.max(posMax[2], data.positions[i + 2]);
    }
    const posViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: posBuf.length,
      target: 34962, // ARRAY_BUFFER
    });
    binBuffers.push(posBuf);
    currentOffset += posBuf.length;

    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: data.positions.length / 3,
      type: 'VEC3',
      min: posMin,
      max: posMax,
    });

    // Normals (Float32)
    const normBuf = Buffer.from(new Float32Array(data.normals).buffer);
    const normViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: normBuf.length,
      target: 34962,
    });
    binBuffers.push(normBuf);
    currentOffset += normBuf.length;

    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      byteOffset: 0,
      componentType: 5126,
      count: data.normals.length / 3,
      type: 'VEC3',
    });

    // UVs (Float32)
    const uvBuf = Buffer.from(new Float32Array(data.uvs).buffer);
    const uvViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: uvBuf.length,
      target: 34962,
    });
    binBuffers.push(uvBuf);
    currentOffset += uvBuf.length;

    const uvAccIdx = accessors.length;
    accessors.push({
      bufferView: uvViewIdx,
      byteOffset: 0,
      componentType: 5126,
      count: data.uvs.length / 2,
      type: 'VEC2',
    });

    // Indices (Uint16)
    const indBuf = Buffer.from(new Uint16Array(data.indices).buffer);
    const indPadding = (4 - (indBuf.length % 4)) % 4;
    const indPaddedBuf = Buffer.concat([indBuf, Buffer.alloc(indPadding)]);
    const indViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: indBuf.length,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });
    binBuffers.push(indPaddedBuf);
    currentOffset += indPaddedBuf.length;

    const indAccIdx = accessors.length;
    accessors.push({
      bufferView: indViewIdx,
      byteOffset: 0,
      componentType: 5123, // UNSIGNED_SHORT
      count: data.indices.length,
      type: 'SCALAR',
    });

    primitives.push({
      attributes: {
        POSITION: posAccIdx,
        NORMAL: normAccIdx,
        TEXCOORD_0: uvAccIdx,
      },
      indices: indAccIdx,
      material: matIdx,
    });
  });

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Aleph SkyStudio Clean Car Generator v1.0',
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'SimpleSportCar', mesh: 0 }],
    meshes: [{ name: 'CarMesh', primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: currentOffset }],
  };

  const jsonString = JSON.stringify(gltfJson);
  const jsonBuffer = Buffer.from(jsonString, 'utf-8');
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunkLength = jsonBuffer.length + jsonPadding;

  const binBuffer = Buffer.concat(binBuffers);
  const binPadding = (4 - (binBuffer.length % 4)) % 4;
  const binChunkLength = binBuffer.length + binPadding;

  const totalLength = 12 + (8 + jsonChunkLength) + (8 + binChunkLength);
  const glbBuffer = Buffer.alloc(totalLength);

  // GLB Header
  glbBuffer.writeUInt32LE(GLB_MAGIC, 0);
  glbBuffer.writeUInt32LE(2, 4);
  glbBuffer.writeUInt32LE(totalLength, 8);

  // Chunk 0: JSON
  let offset = 12;
  glbBuffer.writeUInt32LE(jsonChunkLength, offset);
  glbBuffer.writeUInt32LE(CHUNK_TYPE_JSON, offset + 4);
  offset += 8;
  jsonBuffer.copy(glbBuffer, offset);
  offset += jsonBuffer.length;
  for (let i = 0; i < jsonPadding; i++) glbBuffer.writeUInt8(0x20, offset + i);
  offset += jsonPadding;

  // Chunk 1: BIN
  glbBuffer.writeUInt32LE(binChunkLength, offset);
  glbBuffer.writeUInt32LE(CHUNK_TYPE_BIN, offset + 4);
  offset += 8;
  binBuffer.copy(glbBuffer, offset);
  offset += binBuffer.length;
  for (let i = 0; i < binPadding; i++) glbBuffer.writeUInt8(0x00, offset + i);

  return glbBuffer;
}

const glb = generateCarModel();
const publicCarPath = path.resolve(__dirname, '../public/car.glb');
const publicWalterPath = path.resolve(__dirname, '../public/walter.glb');
fs.writeFileSync(publicCarPath, glb);
fs.writeFileSync(publicWalterPath, glb); // Replace walter.glb with the clean model as well
console.log(`Generated clean car model at ${publicCarPath} (${glb.length} bytes)`);
console.log(`Replaced walter.glb with clean car model at ${publicWalterPath} (${glb.length} bytes)`);
