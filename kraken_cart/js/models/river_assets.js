import { HC } from '../hc.js';

const THREE = HC.THREE;

// ============================================================================
// DETERMINISTIC HELPERS & PROCEDURAL TEXTURES
// ============================================================================

function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function createMossyStoneTexture() {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx2d = canvas.getContext('2d');

  // Base cool river-stone slate
  ctx2d.fillStyle = '#7c888b';
  ctx2d.fillRect(0, 0, size, size);

  // Soft painterly stone mineral mottling
  for (let i = 0; i < 180; i++) {
    const x = hash1(i * 1.73 + 3.1) * size;
    const y = hash1(i * 2.91 + 7.4) * size;
    const r = 4 + hash1(i * 4.17 + 1.9) * 14;
    const tone = hash1(i * 5.33 + 9.2);
    if (tone < 0.38) {
      ctx2d.fillStyle = 'rgba(84, 96, 102, 0.30)';
    } else if (tone < 0.76) {
      ctx2d.fillStyle = 'rgba(148, 158, 156, 0.24)';
    } else {
      ctx2d.fillStyle = 'rgba(116, 110, 94, 0.22)';
    }
    ctx2d.beginPath();
    ctx2d.arc(x, y, r, 0, Math.PI * 2);
    ctx2d.fill();
  }

  // Subtle dark rock fissures
  ctx2d.strokeStyle = 'rgba(48, 56, 62, 0.34)';
  ctx2d.lineWidth = 1.3;
  for (let c = 0; c < 14; c++) {
    let cx = hash1(c * 9.7 + 2.3) * size;
    let cy = hash1(c * 11.3 + 5.1) * size;
    ctx2d.beginPath();
    ctx2d.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) {
      cx += (hash1(c * 17.1 + s * 3.7) - 0.5) * 18;
      cy += (hash1(c * 23.3 + s * 5.1) - 0.5) * 18;
      ctx2d.lineTo(cx, cy);
    }
    ctx2d.stroke();
  }

  // Painterly olive-emerald river moss flecks concentrated on upper half
  for (let m = 0; m < 85; m++) {
    const x = hash1(m * 6.31 + 19.2) * size;
    const y = hash1(m * 3.89 + 41.7) * size * 0.78;
    const r = 2.5 + hash1(m * 8.13 + 2.5) * 7.5;
    ctx2d.fillStyle = m % 2 === 0 ? 'rgba(92, 138, 68, 0.36)' : 'rgba(118, 162, 74, 0.28)';
    ctx2d.beginPath();
    ctx2d.arc(x, y, r, 0, Math.PI * 2);
    ctx2d.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWeatheredWoodTexture() {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx2d = canvas.getContext('2d');

  ctx2d.fillStyle = '#927960';
  ctx2d.fillRect(0, 0, size, size);

  // Longitudinal river-weathered bark & wood fibers
  for (let i = 0; i < 95; i++) {
    const x = hash1(i * 3.17 + 1.2) * size;
    const w = 1.2 + hash1(i * 5.41 + 4.8) * 3.2;
    const v = hash1(i * 7.93 + 2.1);
    ctx2d.fillStyle =
      v < 0.35
        ? 'rgba(78, 58, 42, 0.34)'
        : v < 0.72
          ? 'rgba(176, 158, 134, 0.26)'
          : 'rgba(116, 104, 88, 0.28)';
    ctx2d.fillRect(x, 0, w, size);
  }

  // Subtle organic wood knots
  for (let k = 0; k < 7; k++) {
    const kx = hash1(k * 13.7 + 5.2) * size;
    const ky = hash1(k * 19.3 + 8.4) * size;
    ctx2d.strokeStyle = 'rgba(64, 46, 32, 0.42)';
    ctx2d.lineWidth = 1.4;
    ctx2d.beginPath();
    ctx2d.ellipse(kx, ky, 4.5, 9.0, 0.15, 0, Math.PI * 2);
    ctx2d.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createFallbackWaterDataTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx2d = canvas.getContext('2d');
  const imgData = ctx2d.createImageData(size, size);
  const data = imgData.data;

  const pts = [];
  for (let i = 0; i < 18; i++) {
    pts.push({
      x: ((i * 73 + 19) % 100) / 100,
      y: ((i * 41 + 53) % 100) / 100,
    });
  }

  const tau = Math.PI * 2.0;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      let d1 = 99.0;
      let d2 = 99.0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(u - pts[i].x);
        let dy = Math.abs(v - pts[i].y);
        if (dx > 0.5) dx = 1.0 - dx;
        if (dy > 0.5) dy = 1.0 - dy;
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const edgeDist = d2 - d1;
      const caustic = Math.pow(Math.max(0.0, 1.0 - edgeDist * 6.2), 2.4);
      const nx =
        Math.cos(u * tau * 2.0 + v * tau) * 0.45 +
        Math.sin(u * tau * 4.0 - v * tau * 2.0) * 0.30 +
        Math.cos((u + v) * tau * 6.0) * 0.25;
      const ny =
        Math.sin(v * tau * 2.0 - u * tau) * 0.45 +
        Math.cos(v * tau * 4.0 + u * tau * 3.0) * 0.30 +
        Math.sin((v - u) * tau * 6.0) * 0.25;
      const foamNoise = Math.min(1.0, Math.max(0.0, (1.0 - d1 * 3.4) * 0.75 + caustic * 0.35));

      const idx = (py * size + px) * 4;
      data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor(caustic * 255);
      data[idx + 3] = Math.floor(foamNoise * 255);
    }
  }

  ctx2d.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ============================================================================
// GEOMETRY SCULPTING & MERGE UTILITIES
// ============================================================================

/**
 * Sculpts a water-worn riverbank boulder from a DodecahedronGeometry.
 * Slightly flattens the underside so boulders seat solidly into sloped riverbanks.
 */
function createSculptedRockGeo(radius, detail, seed, flatness = 0.72) {
  const geo = new THREE.DodecahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const n1 = Math.sin(dir.x * 3.7 + seed * 1.9) * Math.cos(dir.z * 3.3 - seed * 1.1);
    const n2 = Math.cos(dir.y * 4.5 + dir.x * 2.4 + seed * 2.7);
    const radialScale = 1.0 + n1 * 0.16 + n2 * 0.09;
    v.multiplyScalar(radialScale);

    // Flatten the bottom slightly so rocks embed naturally without teetering
    if (v.y < 0) {
      v.y *= flatness * 0.85;
    } else {
      v.y *= flatness;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a single arched botanical frond or grass blade geometry with vertex color gradient.
 */
function createArchedBladeGeo(width, length, arch, baseHex, tipHex) {
  const segs = 3;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const cBase = new THREE.Color(baseHex);
  const cTip = new THREE.Color(tipHex);
  const cTmp = new THREE.Color();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = Math.sin(t * Math.PI * 0.5) * length;
    const z = Math.pow(t, 1.85) * arch;
    const halfW = width * 0.5 * (1.0 - Math.pow(t, 1.35)) * (i === segs ? 0.04 : 1.0);

    cTmp.copy(cBase).lerp(cTip, t);

    positions.push(-halfW, y, z, halfW, y, z);
    uvs.push(0, t, 1, t);
    colors.push(cTmp.r, cTmp.g, cTmp.b, cTmp.r, cTmp.g, cTmp.b);

    if (i < segs) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Merges an array of { geo, matrix } entries into a single static BufferGeometry
 * (so cel shading uses accurate world normals & positions in 1 draw call).
 */
function mergePlacedGeometries(entries, includeColor = false) {
  if (!entries.length) return null;

  // Convert each unique source geometry to non-indexed ONCE (avoids hundreds of redundant allocations)
  const nonIdxCache = new Map();
  let totalVerts = 0;

  for (let e = 0; e < entries.length; e++) {
    const srcGeo = entries[e].geo;
    let cached = nonIdxCache.get(srcGeo);
    if (!cached) {
      const owned = !!srcGeo.index;
      const g = owned ? srcGeo.toNonIndexed() : srcGeo;
      if (!g.attributes.normal) g.computeVertexNormals();
      cached = { geo: g, owned };
      nonIdxCache.set(srcGeo, cached);
    }
    const posAttr = cached.geo.attributes.position;
    if (posAttr) totalVerts += posAttr.count;
  }

  if (totalVerts === 0) {
    nonIdxCache.forEach((c) => {
      if (c.owned) c.geo.dispose();
    });
    return null;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = includeColor ? new Float32Array(totalVerts * 3) : null;

  const normalMat = new THREE.Matrix3();
  const v = new THREE.Vector3();

  let offset = 0;
  for (let e = 0; e < entries.length; e++) {
    const { geo: srcGeo, matrix } = entries[e];
    const g = nonIdxCache.get(srcGeo).geo;
    const posAttr = g.attributes.position;
    if (!posAttr) continue;
    const normAttr = g.attributes.normal;
    const uvAttr = g.attributes.uv;
    const colAttr = g.attributes.color;
    normalMat.getNormalMatrix(matrix);

    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      const idx3 = (offset + i) * 3;
      const idx2 = (offset + i) * 2;

      v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
      positions[idx3] = v.x;
      positions[idx3 + 1] = v.y;
      positions[idx3 + 2] = v.z;

      v.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
      normals[idx3] = v.x;
      normals[idx3 + 1] = v.y;
      normals[idx3 + 2] = v.z;

      if (uvAttr) {
        uvs[idx2] = uvAttr.getX(i);
        uvs[idx2 + 1] = uvAttr.getY(i);
      }

      if (colors) {
        if (colAttr) {
          colors[idx3] = colAttr.getX(i);
          colors[idx3 + 1] = colAttr.getY(i);
          colors[idx3 + 2] = colAttr.getZ(i);
        } else {
          colors[idx3] = 1.0;
          colors[idx3 + 1] = 1.0;
          colors[idx3 + 2] = 1.0;
        }
      }
    }

    offset += count;
  }

  nonIdxCache.forEach((c) => {
    if (c.owned) c.geo.dispose();
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  merged.computeBoundingSphere();
  return merged;
}

// ============================================================================
// 1. NATURAL RIVERBANK ECOSYSTEM (BOULDERS, PEBBLES, REEDS, FERNS, FORDS)
// ============================================================================

function createNaturalRiverbanks(ctx, riverSpec) {
  const applyCel = ctx.applyStylizedCelShading || (() => {});
  const isMobile = !!ctx.isMobileDevice;
  const getTerrainHeight = ctx.getTerrainHeight;
  const warmGlowTex = ctx.warmGlowTex || null;

  const terrainSize = riverSpec.terrainSize || 260;
  const waterY = riverSpec.waterY ?? -0.22;
  const baseHalfWidth = riverSpec.halfWidth ?? 4.8;
  const bankWidth = riverSpec.bank ?? 3.4;
  const fords = riverSpec.fords || [];
  const riverCenterZ = riverSpec.riverCenterZ;
  const riverHalfWidthAt =
    riverSpec.riverHalfWidthAt || ((x) => baseHalfWidth * (0.90 + 0.10 * Math.sin(x * 0.08)));
  const getRoadDistance = riverSpec.getRoadDistance || null;

  const group = new THREE.Group();
  group.name = 'natural-riverbanks';

  const obstacles = [];
  const colliders = [];
  const lanterns = [];
  const animated = {
    lilyPads: [],
    reeds: [],
  };

  // --- Shared Painterly Materials ---
  const mossyStoneTex = createMossyStoneTexture();
  const weatheredWoodTex = createWeatheredWoodTexture();

  const wetRockMat =
    ctx.wetRockMat ||
    (() => {
      const m = new THREE.MeshStandardMaterial({
        color: 0x55686d,
        roughness: 0.38,
        metalness: 0.08,
      });
      applyCel(m, { rimStrength: 0.32, shadowLift: 0.50 });
      return m;
    })();

  const mossyRockMat = new THREE.MeshStandardMaterial({
    color: 0x8d9b8f,
    map: mossyStoneTex,
    roughness: 0.84,
    metalness: 0.03,
  });
  applyCel(mossyRockMat, { rimStrength: 0.22, shadowLift: 0.52 });

  const dryBankRockMat =
    ctx.rockMat ||
    (() => {
      const m = new THREE.MeshStandardMaterial({ color: 0x7b8388, roughness: 0.88 });
      applyCel(m, { rimStrength: 0.18, shadowLift: 0.52 });
      return m;
    })();

  const mossCapMat = new THREE.MeshStandardMaterial({
    color: 0x5b9146,
    roughness: 0.90,
  });
  applyCel(mossCapMat, { rimStrength: 0.24, shadowLift: 0.56 });

  const driftwoodMat = new THREE.MeshStandardMaterial({
    color: 0xa19079,
    map: weatheredWoodTex,
    roughness: 0.88,
  });
  applyCel(driftwoodMat, { rimStrength: 0.18, shadowLift: 0.54 });

  const fordPostWoodMat = new THREE.MeshStandardMaterial({
    color: 0x896241,
    map: weatheredWoodTex,
    roughness: 0.86,
  });
  applyCel(fordPostWoodMat, { rimStrength: 0.18, shadowLift: 0.55 });

  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xcab07e,
    roughness: 0.94,
  });
  applyCel(ropeMat, { rimStrength: 0.14, shadowLift: 0.58 });

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x353b42,
    roughness: 0.58,
    metalness: 0.22,
  });
  applyCel(darkIronMat, { rimStrength: 0.24, shadowLift: 0.48 });

  const reedStemMat = new THREE.MeshStandardMaterial({
    color: 0x5b9d54,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  applyCel(reedStemMat, { rimStrength: 0.22, shadowLift: 0.58 });

  const reedHeadMat = new THREE.MeshStandardMaterial({
    color: 0x5d3923,
    roughness: 0.92,
  });
  applyCel(reedHeadMat, { rimStrength: 0.16, shadowLift: 0.52 });

  const fernMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.76,
    side: THREE.DoubleSide,
  });
  applyCel(fernMat, { rimStrength: 0.26, shadowLift: 0.60 });

  const sedgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.80,
    side: THREE.DoubleSide,
  });
  applyCel(sedgeMat, { rimStrength: 0.24, shadowLift: 0.60 });

  const lilyMat = new THREE.MeshStandardMaterial({
    color: 0x4ea865,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  applyCel(lilyMat, { rimStrength: 0.20, shadowLift: 0.58 });

  const lotusPetalMat = new THREE.MeshStandardMaterial({
    color: 0xffb3c6,
    emissive: 0xff758f,
    emissiveIntensity: 0.18,
    roughness: 0.45,
  });

  // --- Shared Reusable Geometries ---
  const sculptedRocks = [
    createSculptedRockGeo(1.0, 1, 1.3, 0.70),
    createSculptedRockGeo(1.0, 1, 4.7, 0.62),
    createSculptedRockGeo(1.0, 1, 8.9, 0.78),
  ];
  const cobbleGeoLow = createSculptedRockGeo(1.0, 0, 2.5, 0.58);
  const mossCapGeo = new THREE.SphereGeometry(1.0, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.48);
  const pebbleBaseGeo = createSculptedRockGeo(0.16, 0, 6.1, 0.46);

  const reedStemUnitGeo = new THREE.CylinderGeometry(0.014, 0.028, 1.0, 5);
  reedStemUnitGeo.translate(0, 0.5, 0);
  const reedHeadUnitGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.22, 6);
  const reedLeafGeo = createArchedBladeGeo(0.075, 0.72, 0.30, 0x3f7b3e, 0x73b659);
  const fernFrondGeo = createArchedBladeGeo(0.24, 0.78, 0.46, 0x2f6d34, 0x6fb84e);
  const sedgeBladeGeo = createArchedBladeGeo(0.085, 0.58, 0.28, 0x437c3b, 0x82be51);
  const lotusPetalGeo = new THREE.ConeGeometry(0.055, 0.16, 5);

  // --- Spatial Helpers ---
  function isNearFord(x, pad = 1.5) {
    for (let i = 0; i < fords.length; i++) {
      const f = fords[i];
      if (Math.abs(x - f.x) < f.half + pad) return true;
    }
    return false;
  }

  function isNearRoad(x, z, minDist = 3.2) {
    return getRoadDistance ? getRoadDistance(x, z) < minDist : false;
  }

  // Locate actual waterline where sculpted terrain crosses waterY
  function findShoreZ(x, side, cz, halfW) {
    const maxSpan = halfW + bankWidth * 1.15;
    let prevZ = cz;
    let prevH = getTerrainHeight(x, cz);
    const steps = 16;
    for (let s = 1; s <= steps; s++) {
      const z = cz + side * (maxSpan * (s / steps));
      const h = getTerrainHeight(x, z);
      if (prevH < waterY && h >= waterY) {
        const t = (waterY - prevH) / Math.max(1e-4, h - prevH);
        return prevZ + (z - prevZ) * t;
      }
      prevZ = z;
      prevH = h;
    }
    return cz + side * halfW;
  }

  // Buckets for merged static geometries (fast mobile draw calls)
  const wetCobbleEntries = [];
  const mossyCobbleEntries = [];
  const mossCapEntries = [];
  const staticReedStemEntries = [];
  const staticReedHeadEntries = [];
  const fernEntries = [];
  const sedgeEntries = [];
  const driftwoodEntries = [];

  const tmpObj = new THREE.Object3D();
  const maxX = Math.min(260, terrainSize * 0.5 - 10);

  // --------------------------------------------------------------------------
  // A. NATURAL WET BANK BOULDERS, COBBLE CLUSTERS & MID-STREAM OUTCROPS
  // --------------------------------------------------------------------------
  let rockIdx = 0;
  for (let x = -maxX; x <= maxX; x += 2.6) {
    const inCore = Math.abs(x) <= 75;
    if (!inCore && hash1(x * 1.73 + 11.4) > 0.42) continue;

    const cz = riverCenterZ(x);
    const halfW = riverHalfWidthAt(x);

    // Organic rocky-bend density modulation (creates natural stony stretches & quiet grassy coves)
    const bendCluster = 0.5 + 0.5 * Math.sin(x * 0.13 + 0.7) * Math.cos(x * 0.057 - 1.2);

    for (const side of [-1, 1]) {
      rockIdx++;
      const seed = rockIdx * 3.17 + side * 19.3;
      const jitterX = (hash1(seed + 1.1) - 0.5) * 2.1;
      const rx = x + jitterX;

      if (isNearFord(rx, 1.55)) continue;

      const rcz = riverCenterZ(rx);
      const rHalf = riverHalfWidthAt(rx);
      const shoreZ = findShoreZ(rx, side, rcz, rHalf);

      const spawnChance = inCore ? 0.34 + bendCluster * 0.34 : 0.24;
      if (hash1(seed + 2.7) > spawnChance) continue;

      // Offset relative to exact waterline: negative = wading in water, positive = resting on bank
      const shoreOffset = (hash1(seed + 4.3) - 0.38) * 1.45;
      const rz = shoreZ + side * shoreOffset;

      if (isNearRoad(rx, rz, 3.4)) continue;

      const ty = getTerrainHeight(rx, rz);
      const isWet = ty < waterY + 0.20 || shoreOffset < 0.32;
      const baseR = inCore
        ? 0.38 + hash1(seed + 5.9) * 0.68
        : 0.45 + hash1(seed + 5.9) * 0.62;
      const sx = baseR * (1.05 + hash1(seed + 7.1) * 0.42);
      const sy = baseR * (0.56 + hash1(seed + 8.3) * 0.34);
      const sz = baseR * (0.92 + hash1(seed + 9.5) * 0.36);

      // Sink rock firmly into sloped riverbank so bottom NEVER floats
      const seatY = isWet
        ? Math.max(ty + sy * 0.18, waterY - sy * 0.26)
        : ty + sy * 0.22 - 0.08;

      const yaw = hash1(seed + 11.2) * Math.PI * 2;
      const tiltX = (hash1(seed + 12.6) - 0.5) * 0.28;
      const tiltZ = (hash1(seed + 13.8) - 0.5) * 0.28;

      const effectiveR = Math.max(sx, sz) * 0.88;

      if (baseR >= 0.56 && inCore) {
        // Hero boulder: real mesh + rock collider
        const geo = sculptedRocks[rockIdx % sculptedRocks.length];
        const mesh = new THREE.Mesh(geo, isWet ? wetRockMat : mossyRockMat);
        mesh.position.set(rx, seatY, rz);
        mesh.scale.set(sx, sy, sz);
        mesh.rotation.set(tiltX, yaw, tiltZ);
        mesh.castShadow = !isMobile;
        mesh.receiveShadow = true;
        group.add(mesh);

        colliders.push({ type: 'river_rock', mesh });

        // Lush moss cap cushion on top of dry/half-wet hero boulders
        if (!isWet && hash1(seed + 15.1) > 0.38) {
          tmpObj.position.set(rx, seatY + sy * 0.24, rz);
          tmpObj.rotation.set(tiltX * 0.4, yaw, tiltZ * 0.4);
          tmpObj.scale.set(sx * 0.72, sy * 0.56, sz * 0.68);
          tmpObj.updateMatrix();
          mossCapEntries.push({ geo: mossCapGeo, matrix: tmpObj.matrix.clone() });
        }
      } else {
        // Merged bank cobble for fast mobile rendering
        tmpObj.position.set(rx, seatY, rz);
        tmpObj.rotation.set(tiltX, yaw, tiltZ);
        tmpObj.scale.set(sx, sy, sz);
        tmpObj.updateMatrix();
        (isWet ? wetCobbleEntries : mossyCobbleEntries).push({
          geo: sculptedRocks[rockIdx % sculptedRocks.length],
          matrix: tmpObj.matrix.clone(),
        });
      }

      // Register shoreline foam obstacle whenever rock touches or hugs the waterline
      if (ty < waterY + 0.30 || shoreOffset < effectiveR + 0.42) {
        obstacles.push({ x: rx, z: rz, r: effectiveR });
      }

      // 2-3 organic companion cobbles nestled around the hero rock base
      const companions = inCore ? 2 + Math.floor(hash1(seed + 16.7) * 2.2) : 1;
      for (let c = 0; c < companions; c++) {
        const cSeed = seed + 30 + c * 7.3;
        const cAng = yaw + c * 2.15 + hash1(cSeed) * 1.1;
        const cDist = effectiveR * (0.78 + hash1(cSeed + 1.4) * 0.55);
        const cx = rx + Math.cos(cAng) * cDist;
        const czPos = rz + Math.sin(cAng) * cDist;
        if (isNearFord(cx, 1.45) || isNearRoad(cx, czPos, 3.0)) continue;

        const cty = getTerrainHeight(cx, czPos);
        const cr = 0.16 + hash1(cSeed + 2.8) * 0.26;
        const csx = cr * (1.1 + hash1(cSeed + 3.9) * 0.45);
        const csy = cr * (0.52 + hash1(cSeed + 4.7) * 0.30);
        const csz = cr * (0.95 + hash1(cSeed + 5.6) * 0.35);
        const cWet = cty < waterY + 0.14;

        tmpObj.position.set(cx, cty + csy * 0.18 - 0.04, czPos);
        tmpObj.rotation.set(
          (hash1(cSeed + 6.5) - 0.5) * 0.35,
          hash1(cSeed + 7.2) * Math.PI * 2,
          (hash1(cSeed + 8.1) - 0.5) * 0.35
        );
        tmpObj.scale.set(csx, csy, csz);
        tmpObj.updateMatrix();
        (cWet ? wetCobbleEntries : mossyCobbleEntries).push({
          geo: cobbleGeoLow,
          matrix: tmpObj.matrix.clone(),
        });

        if (cty < waterY + 0.16 && cr >= 0.24) {
          obstacles.push({ x: cx, z: czPos, r: Math.max(csx, csz) * 0.85 });
        }
      }
    }
  }

  // Mid-stream rocky outcrops in scenic bends (well clear of all 3 fords!)
  const midStreamSpots = [-64, -51, -21, 9.5, 37.5, 48.5, 61.5];
  midStreamSpots.forEach((mx, idx) => {
    if (isNearFord(mx, 3.2)) return;
    const seed = 410 + idx * 17.3;
    const mcz = riverCenterZ(mx);
    const mHalf = riverHalfWidthAt(mx);
    const latOffset = (hash1(seed) - 0.5) * mHalf * 0.92;
    const mz = mcz + latOffset;
    if (isNearRoad(mx, mz, 4.0)) return;

    const ty = getTerrainHeight(mx, mz);
    const mainR = 0.56 + hash1(seed + 1.8) * 0.34;
    const sx = mainR * 1.28;
    const sy = mainR * 0.76;
    const sz = mainR * 1.06;

    // Emerge naturally ~0.22-0.42m above the water surface, rooted deeply into riverbed
    const rockMesh = new THREE.Mesh(sculptedRocks[idx % sculptedRocks.length], wetRockMat);
    const topY = waterY + 0.16 + hash1(seed + 2.9) * 0.22;
    rockMesh.position.set(mx, Math.max(ty + sy * 0.45, topY - sy * 0.35), mz);
    rockMesh.scale.set(sx, sy, sz);
    rockMesh.rotation.set(0.12, hash1(seed + 4.1) * Math.PI * 2, -0.1);
    rockMesh.castShadow = !isMobile;
    rockMesh.receiveShadow = true;
    group.add(rockMesh);

    const effR = Math.max(sx, sz) * 0.90;
    obstacles.push({ x: mx, z: mz, r: effR });
    colliders.push({ type: 'river_rock', mesh: rockMesh });

    // Small mossy cap on tallest mid-stream boulders
    if (hash1(seed + 5.2) > 0.35) {
      tmpObj.position.set(mx, rockMesh.position.y + sy * 0.28, mz);
      tmpObj.rotation.set(0, rockMesh.rotation.y, 0);
      tmpObj.scale.set(sx * 0.55, sy * 0.42, sz * 0.52);
      tmpObj.updateMatrix();
      mossCapEntries.push({ geo: mossCapGeo, matrix: tmpObj.matrix.clone() });
    }

    // 1-2 smaller half-submerged satellite stones beside the outcrop
    for (let s = 0; s < 2; s++) {
      const ang = hash1(seed + 8.3 + s * 4.1) * Math.PI * 2;
      const ox = mx + Math.cos(ang) * (effR + 0.28 + s * 0.18);
      const oz = mz + Math.sin(ang) * (effR + 0.25);
      const sr = 0.22 + hash1(seed + 11.7 + s * 3.1) * 0.18;
      tmpObj.position.set(ox, waterY - 0.05, oz);
      tmpObj.rotation.set(0.18 * s, ang, -0.15);
      tmpObj.scale.set(sr * 1.25, sr * 0.62, sr * 1.05);
      tmpObj.updateMatrix();
      wetCobbleEntries.push({ geo: cobbleGeoLow, matrix: tmpObj.matrix.clone() });
      obstacles.push({ x: ox, z: oz, r: sr * 1.05 });
    }
  });

  // --------------------------------------------------------------------------
  // B. UNDERWATER RIVER PEBBLES & FORD COBBLES (1-DRAW-CALL InstancedMesh!)
  // --------------------------------------------------------------------------
  const pebblePalette = [
    new THREE.Color(0x6c8a82),
    new THREE.Color(0x8fa89b),
    new THREE.Color(0x52736b),
    new THREE.Color(0xb59e7a),
    new THREE.Color(0x7c9296),
    new THREE.Color(0xa69274),
    new THREE.Color(0x5d7c79),
  ];

  const pebbleTransforms = [];
  const pebbleColorIndices = [];

  // 1) Shallow bank & riverbed pebbles across the visible valley & outer river crossings
  const halfSpanX = Math.min(340, (riverSpec.terrainSize || 300) * 0.45);
  const maxPebbleAttempts = isMobile ? 320 : 480;
  for (let i = 0; i < maxPebbleAttempts && pebbleTransforms.length < (isMobile ? 225 : 340); i++) {
    const u = hash1(i * 4.37 + 91.2);
    const px = (u * 2.0 - 1.0) * halfSpanX;
    const cz = riverCenterZ(px);
    const halfW = riverHalfWidthAt(px);

    // Bias pebbles toward crystal-clear shallow margins & ford crossings where they shine!
    const nearFord = isNearFord(px, 1.0);
    const latRand = hash1(i * 7.83 + 23.6);
    let lat;
    if (nearFord) {
      lat = (latRand * 2.0 - 1.0) * (halfW * 1.02);
    } else {
      const side = hash1(i * 11.1 + 5.3) > 0.5 ? 1 : -1;
      lat = side * halfW * (0.42 + latRand * 0.72);
    }

    const pz = cz + lat;
    const py = getTerrainHeight(px, pz);

    // Must lie submerged beneath clear water (not too deep to vanish, not dry inland)
    if (py < waterY - 0.04 && py > waterY - 0.72) {
      const s = 0.65 + hash1(i * 13.9 + 7.1) * 0.92;
      tmpObj.position.set(px, py + 0.024, pz);
      tmpObj.rotation.set(
        (hash1(i * 17.3 + 2.4) - 0.5) * 0.25,
        hash1(i * 19.7 + 8.9) * Math.PI * 2,
        (hash1(i * 21.1 + 4.2) - 0.5) * 0.25
      );
      tmpObj.scale.set(s * 1.32, s * 0.42, s * (0.92 + hash1(i * 23.5) * 0.30));
      tmpObj.updateMatrix();
      pebbleTransforms.push(tmpObj.matrix.clone());
      pebbleColorIndices.push(i % pebblePalette.length);
    }
  }

  // 2) Extra colorful smooth river stones embedded cleanly in the 3 shallow fords
  for (let fi = 0; fi < fords.length; fi++) {
    const f = fords[fi];
    const fordCount = fi === 0 ? 22 : 14;
    for (let k = 0; k < fordCount; k++) {
      const seed = 700 + fi * 97 + k * 7.13;
      const px = f.x + (hash1(seed) * 2.0 - 1.0) * (f.half + 0.8);
      const cz = riverCenterZ(px);
      const halfW = riverHalfWidthAt(px);
      const pz = cz + (hash1(seed + 1.9) * 2.0 - 1.0) * (halfW * 1.05);
      const py = getTerrainHeight(px, pz);
      if (py < waterY - 0.03) {
        const s = 0.75 + hash1(seed + 3.4) * 0.85;
        tmpObj.position.set(px, py + 0.018, pz);
        tmpObj.rotation.set(0.05, hash1(seed + 5.1) * Math.PI * 2, -0.05);
        tmpObj.scale.set(s * 1.4, s * 0.34, s * 1.1);
        tmpObj.updateMatrix();
        pebbleTransforms.push(tmpObj.matrix.clone());
        pebbleColorIndices.push((fi * 3 + k) % pebblePalette.length);
      }
    }
  }

  if (pebbleTransforms.length > 0) {
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.56,
      metalness: 0.05,
    });
    const pebbleInst = new THREE.InstancedMesh(pebbleBaseGeo, pebbleMat, pebbleTransforms.length);
    pebbleInst.name = 'river-pebbles';
    pebbleInst.castShadow = false;
    pebbleInst.receiveShadow = true;
    for (let i = 0; i < pebbleTransforms.length; i++) {
      pebbleInst.setMatrixAt(i, pebbleTransforms[i]);
      pebbleInst.setColorAt(i, pebblePalette[pebbleColorIndices[i]]);
    }
    pebbleInst.instanceMatrix.needsUpdate = true;
    if (pebbleInst.instanceColor) pebbleInst.instanceColor.needsUpdate = true;
    group.add(pebbleInst);
  }

  // --------------------------------------------------------------------------
  // C. LUSH RIVERBANK VEGETATION: CATTAILS/REEDS, FERNS & SEDGE GRASS CLUMPS
  // --------------------------------------------------------------------------
  let clumpId = 0;
  for (let x = -114; x <= 114; x += 2.2) {
    const inCore = Math.abs(x) <= 72;
    if (!inCore && hash1(x * 2.31 + 43.2) > 0.38) continue;

    // Organic patchiness (natural alternating reed marshes and grassy banks)
    const patchNoise = 0.5 + 0.5 * Math.sin(x * 0.16 - 0.8) * Math.cos(x * 0.073 + 1.5);

    for (const side of [-1, 1]) {
      clumpId++;
      const seed = 1000 + clumpId * 5.37 + side * 29.1;
      const rx = x + (hash1(seed) - 0.5) * 1.85;
      if (isNearFord(rx, 0.85)) continue;

      const cz = riverCenterZ(rx);
      const halfW = riverHalfWidthAt(rx);
      const shoreZ = findShoreZ(rx, side, cz, halfW);

      // 1. Cattail / Reed Clumps hugging moist waterline (waterY - 0.15 .. waterY + 0.45)
      const reedProb = inCore ? 0.24 + patchNoise * 0.38 : 0.18;
      if (hash1(seed + 2.3) < reedProb) {
        const reedOffset = (hash1(seed + 3.7) - 0.35) * 0.95;
        const rz = shoreZ + side * reedOffset;
        if (!isNearRoad(rx, rz, 2.9)) {
          const py = getTerrainHeight(rx, rz);
          if (py > waterY - 0.16 && py < waterY + 0.46) {
            const isAnimatedHero =
              Math.abs(rx) <= 40 && animated.reeds.length < 14 && hash1(seed + 4.9) > 0.52;
            const stalkCount = isAnimatedHero ? 5 : 4 + Math.floor(hash1(seed + 5.8) * 3);

            if (isAnimatedHero) {
              const localStems = [];
              const localHeads = [];
              for (let j = 0; j < stalkCount; j++) {
                const jSeed = seed + 40 + j * 4.7;
                const h = 0.86 + hash1(jSeed) * 0.48;
                const ox = (hash1(jSeed + 1.1) - 0.5) * 0.42;
                const oz = (hash1(jSeed + 2.2) - 0.5) * 0.42;
                const leanZ = (hash1(jSeed + 3.3) - 0.5) * 0.22;
                const leanX = (hash1(jSeed + 4.4) - 0.5) * 0.22;

                tmpObj.position.set(ox, -0.08, oz);
                tmpObj.rotation.set(leanX, hash1(jSeed + 5.5) * Math.PI * 2, leanZ);
                tmpObj.scale.set(1.0, h, 1.0);
                tmpObj.updateMatrix();
                localStems.push({ geo: reedStemUnitGeo, matrix: tmpObj.matrix.clone() });

                // Slender reed leaf blade beside stalk
                if (j < 4) {
                  tmpObj.position.set(ox, -0.04, oz);
                  tmpObj.rotation.set(0.08, j * 1.55 + hash1(jSeed + 6.1), 0);
                  tmpObj.scale.set(1.0, 0.85 + hash1(jSeed + 6.8) * 0.45, 1.0);
                  tmpObj.updateMatrix();
                  localStems.push({ geo: reedLeafGeo, matrix: tmpObj.matrix.clone() });
                }

                // Velvety brown cattail head on half the stalks
                if (j % 2 === 0) {
                  const headH = h * 0.80;
                  tmpObj.position.set(
                    ox - Math.sin(leanZ) * headH,
                    -0.08 + Math.cos(leanZ) * headH,
                    oz + Math.sin(leanX) * headH
                  );
                  tmpObj.rotation.set(leanX, 0, leanZ);
                  tmpObj.scale.set(1.0, 1.0, 1.0);
                  tmpObj.updateMatrix();
                  localHeads.push({ geo: reedHeadUnitGeo, matrix: tmpObj.matrix.clone() });
                }
              }

              const rGroup = new THREE.Group();
              rGroup.position.set(rx, py, rz);
              const sGeo = mergePlacedGeometries(localStems, false);
              if (sGeo) {
                const sMesh = new THREE.Mesh(sGeo, reedStemMat);
                sMesh.receiveShadow = true;
                rGroup.add(sMesh);
              }
              const hGeo = mergePlacedGeometries(localHeads, false);
              if (hGeo) {
                const hMesh = new THREE.Mesh(hGeo, reedHeadMat);
                rGroup.add(hMesh);
              }
              rGroup.userData = {
                phase: hash1(seed + 9.4) * Math.PI * 2,
                swayAmp: 0.045 + hash1(seed + 10.2) * 0.025,
              };
              group.add(rGroup);
              animated.reeds.push(rGroup);
            } else {
              // Merge static reed clump directly into world-space cel-shaded buffers
              for (let j = 0; j < stalkCount; j++) {
                const jSeed = seed + 40 + j * 4.7;
                const h = 0.82 + hash1(jSeed) * 0.50;
                const ox = rx + (hash1(jSeed + 1.1) - 0.5) * 0.48;
                const oz = rz + (hash1(jSeed + 2.2) - 0.5) * 0.48;
                const leanZ = (hash1(jSeed + 3.3) - 0.5) * 0.22;
                const leanX = (hash1(jSeed + 4.4) - 0.5) * 0.22;

                tmpObj.position.set(ox, py - 0.08, oz);
                tmpObj.rotation.set(leanX, hash1(jSeed + 5.5) * Math.PI * 2, leanZ);
                tmpObj.scale.set(1.0, h, 1.0);
                tmpObj.updateMatrix();
                staticReedStemEntries.push({ geo: reedStemUnitGeo, matrix: tmpObj.matrix.clone() });

                if (j < 3) {
                  tmpObj.position.set(ox, py - 0.04, oz);
                  tmpObj.rotation.set(0.06, j * 2.1 + hash1(jSeed + 6.1), 0);
                  tmpObj.scale.set(1.0, 0.8 + hash1(jSeed + 6.8) * 0.45, 1.0);
                  tmpObj.updateMatrix();
                  staticReedStemEntries.push({ geo: reedLeafGeo, matrix: tmpObj.matrix.clone() });
                }

                if (j % 2 === 0) {
                  const headH = h * 0.80;
                  tmpObj.position.set(
                    ox - Math.sin(leanZ) * headH,
                    py - 0.08 + Math.cos(leanZ) * headH,
                    oz + Math.sin(leanX) * headH
                  );
                  tmpObj.rotation.set(leanX, 0, leanZ);
                  tmpObj.scale.set(1.0, 1.0, 1.0);
                  tmpObj.updateMatrix();
                  staticReedHeadEntries.push({ geo: reedHeadUnitGeo, matrix: tmpObj.matrix.clone() });
                }
              }
            }
          }
        }
      }

      // 2. Lush Riverside Fern Rosettes softening the sandy bank into meadow grass (clear of shoreline boulders)
      const fernProb = inCore ? 0.36 : 0.16;
      if (hash1(seed + 11.9) < fernProb) {
        const fx = rx + (hash1(seed + 12.7) - 0.5) * 1.4;
        const fz = shoreZ + side * (1.15 + hash1(seed + 13.8) * 1.95);
        let hitsRock = false;
        for (let oi = 0; oi < obstacles.length; oi++) {
          const ob = obstacles[oi];
          if (Math.hypot(fx - ob.x, fz - ob.z) < ob.r + 0.95) {
            hitsRock = true;
            break;
          }
        }
        if (!hitsRock && !isNearRoad(fx, fz, 3.0)) {
          const fy = getTerrainHeight(fx, fz);
          if (fy > waterY + 0.12 && fy < waterY + 1.65) {
            const frondCount = isMobile ? 5 : 6;
            const fernScale = 0.72 + hash1(seed + 14.9) * 0.55;
            const baseYaw = hash1(seed + 15.6) * Math.PI * 2;
            for (let f = 0; f < frondCount; f++) {
              const fAng = baseYaw + (f / frondCount) * Math.PI * 2 + (hash1(seed + 20 + f) - 0.5) * 0.35;
              const pitch = 0.28 + hash1(seed + 30 + f) * 0.22;
              tmpObj.position.set(fx, fy - 0.04, fz);
              tmpObj.rotation.set(0, fAng, 0);
              tmpObj.rotateX(pitch);
              tmpObj.scale.set(
                fernScale * (0.88 + hash1(seed + 40 + f) * 0.25),
                fernScale * (0.85 + hash1(seed + 50 + f) * 0.30),
                fernScale
              );
              tmpObj.updateMatrix();
              fernEntries.push({ geo: fernFrondGeo, matrix: tmpObj.matrix.clone() });
            }
          }
        }
      }

      // 3. Soft Sedge Grass Clumps blending wet sand edge into clover meadow (clear of boulders)
      const sedgeProb = inCore ? 0.55 : 0.22;
      if (hash1(seed + 61.3) < sedgeProb) {
        const sx = rx + (hash1(seed + 62.1) - 0.5) * 1.7;
        const sz = shoreZ + side * (0.45 + hash1(seed + 63.4) * 1.65);
        let sedgeHitsRock = false;
        for (let oi = 0; oi < obstacles.length; oi++) {
          const ob = obstacles[oi];
          if (Math.hypot(sx - ob.x, sz - ob.z) < ob.r + 0.85) {
            sedgeHitsRock = true;
            break;
          }
        }
        if (!sedgeHitsRock && !isNearRoad(sx, sz, 2.7)) {
          const sy = getTerrainHeight(sx, sz);
          if (sy > waterY + 0.02 && sy < waterY + 1.25) {
            const bladeCount = isMobile ? 5 : 7;
            const tuftScale = 0.75 + hash1(seed + 64.8) * 0.52;
            for (let b = 0; b < bladeCount; b++) {
              const bSeed = seed + 70 + b * 3.1;
              const bAng = (b / bladeCount) * Math.PI * 2 + hash1(bSeed) * 0.65;
              tmpObj.position.set(
                sx + (hash1(bSeed + 1.2) - 0.5) * 0.20,
                sy - 0.04,
                sz + (hash1(bSeed + 2.4) - 0.5) * 0.20
              );
              tmpObj.rotation.set(0, bAng, 0);
              tmpObj.rotateX(0.18 + hash1(bSeed + 3.5) * 0.25);
              tmpObj.scale.set(
                tuftScale,
                tuftScale * (0.78 + hash1(bSeed + 4.6) * 0.45),
                tuftScale
              );
              tmpObj.updateMatrix();
              sedgeEntries.push({ geo: sedgeBladeGeo, matrix: tmpObj.matrix.clone() });
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // D. WEATHERED DRIFTWOOD LOGS ON QUIET GRAVEL BARS (OUTSIDE FORDS)
  // --------------------------------------------------------------------------
  const driftwoodSpots = [
    { x: -57.5, side: -1, len: 2.8, rad: 0.16 },
    { x: -19.5, side: 1, len: 3.1, rad: 0.18 },
    { x: 11.2, side: -1, len: 2.5, rad: 0.15 },
    { x: 41.0, side: 1, len: 3.2, rad: 0.19 },
    { x: 58.5, side: -1, len: 2.6, rad: 0.16 },
    { x: -46.0, side: 1, len: 2.7, rad: 0.17 },
  ];

  const logUnitGeo = new THREE.CylinderGeometry(0.76, 1.0, 1.0, 7);
  logUnitGeo.rotateZ(Math.PI * 0.5);
  const stubUnitGeo = new THREE.CylinderGeometry(0.45, 0.72, 1.0, 5);

  driftwoodSpots.forEach((dw, idx) => {
    if (isNearFord(dw.x, 2.2)) return;
    const cz = riverCenterZ(dw.x);
    const halfW = riverHalfWidthAt(dw.x);
    const shoreZ = findShoreZ(dw.x, dw.side, cz, halfW);
    const dz = shoreZ + dw.side * 0.25;
    if (isNearRoad(dw.x, dz, 4.0)) return;

    const dy = getTerrainHeight(dw.x, dz);
    const yaw = (hash1(idx * 17.3 + 5.1) - 0.5) * 0.95 + (dw.side > 0 ? 0.22 : -0.22);
    const pitch = (hash1(idx * 23.1 + 9.4) - 0.5) * 0.14;

    tmpObj.position.set(dw.x, Math.max(dy + dw.rad * 0.52, waterY - 0.04), dz);
    tmpObj.rotation.set(0.06, yaw, pitch);
    tmpObj.scale.set(dw.len, dw.rad, dw.rad * 1.12);
    tmpObj.updateMatrix();
    driftwoodEntries.push({ geo: logUnitGeo, matrix: tmpObj.matrix.clone() });

    // Broken gnarled branch stub
    const stubX = dw.x + Math.cos(yaw) * (dw.len * 0.22);
    const stubZ = dz - Math.sin(yaw) * (dw.len * 0.22);
    tmpObj.position.set(stubX, Math.max(dy + dw.rad * 0.75, waterY + 0.04), stubZ);
    tmpObj.rotation.set(0.42, yaw + 0.85, -0.58);
    tmpObj.scale.set(dw.rad * 0.65, 0.72, dw.rad * 0.65);
    tmpObj.updateMatrix();
    driftwoodEntries.push({ geo: stubUnitGeo, matrix: tmpObj.matrix.clone() });

    // Subtle water foam obstacle where driftwood touches the waterline
    const waterEndX = dw.x - Math.cos(yaw) * (dw.len * 0.34);
    const waterEndZ = dz + Math.sin(yaw) * (dw.len * 0.34);
    if (getTerrainHeight(waterEndX, waterEndZ) < waterY + 0.08) {
      obstacles.push({ x: waterEndX, z: waterEndZ, r: dw.rad * 1.8 });
    }
  });

  // --------------------------------------------------------------------------
  // E. CALM-BACKWATER LILY PADS & BLOOMING LOTUS FLOWERS IN SHELTERED BENDS
  // --------------------------------------------------------------------------
  const lilyClusters = [
    { x: -18.5, side: -1, count: 4 },
    { x: 10.5, side: 1, count: 4 },
    { x: 39.5, side: -1, count: 3 },
    { x: -49.5, side: 1, count: 3 },
  ];

  let lilyIdx = 0;
  lilyClusters.forEach((lc, cIdx) => {
    if (isNearFord(lc.x, 3.0)) return;
    const cz = riverCenterZ(lc.x);
    const halfW = riverHalfWidthAt(lc.x);
    const shoreZ = findShoreZ(lc.x, lc.side, cz, halfW);

    for (let k = 0; k < lc.count; k++) {
      const seed = 2100 + cIdx * 37 + k * 9.13;
      const lx = lc.x + (hash1(seed) - 0.5) * 2.8;
      // Tuck into calm shallow backwater 0.75m - 1.85m inside the waterline
      const lz = shoreZ - lc.side * (0.75 + hash1(seed + 1.7) * 1.15);
      const bedY = getTerrainHeight(lx, lz);
      const depth = waterY - bedY;
      if (depth < 0.12 || depth > 0.85) continue;

      const r = 0.24 + hash1(seed + 3.2) * 0.14;
      const hasFlower = k % 2 === 0;

      const lpGroup = new THREE.Group();
      lpGroup.position.set(lx, waterY + 0.018, lz);

      const padGeo = new THREE.CircleGeometry(r, 12, 0.18, Math.PI * 2 - 0.36);
      padGeo.rotateX(-Math.PI / 2);
      const padMesh = new THREE.Mesh(padGeo, lilyMat);
      padMesh.rotation.y = hash1(seed + 4.8) * Math.PI * 2;
      lpGroup.add(padMesh);

      if (hasFlower) {
        for (let p = 0; p < 6; p++) {
          const pAng = (p / 6) * Math.PI * 2;
          const petal = new THREE.Mesh(lotusPetalGeo, lotusPetalMat);
          petal.position.set(Math.cos(pAng) * 0.055, 0.048, Math.sin(pAng) * 0.055);
          petal.rotation.z = -Math.cos(pAng) * 0.55;
          petal.rotation.x = Math.sin(pAng) * 0.55;
          lpGroup.add(petal);
        }
      }

      lpGroup.userData = {
        baseX: lx,
        baseZ: lz,
        baseY: waterY + 0.018,
        phase: lilyIdx * 1.55 + 0.6,
      };
      group.add(lpGroup);
      animated.lilyPads.push(lpGroup);
      lilyIdx++;
    }
  });

  // --------------------------------------------------------------------------
  // F. NATURAL RUSTIC FORD CROSSINGS (WOODEN GUIDEPOSTS + FORD LANTERNS)
  // --------------------------------------------------------------------------
  const guidePostGeo = new THREE.CylinderGeometry(0.085, 0.115, 2.25, 7);
  const guideCapGeo = new THREE.ConeGeometry(0.115, 0.12, 7);
  const ropeWrapGeo = new THREE.TorusGeometry(0.098, 0.022, 6, 12);
  ropeWrapGeo.rotateX(Math.PI * 0.5);

  const lanternPostGeo = new THREE.CylinderGeometry(0.078, 0.108, 3.55, 7);
  const lanternArmGeo = new THREE.BoxGeometry(0.82, 0.085, 0.085);
  const lanternBraceGeo = new THREE.BoxGeometry(0.42, 0.06, 0.06);
  const lanternCapGeo = new THREE.ConeGeometry(0.18, 0.14, 6);
  const lanternGlassGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.24, 6);
  const lanternBaseRimGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.05, 6);

  let lanternIdx = 0;
  fords.forEach((f, fi) => {
    const isMainRoadFord = Math.abs(f.x - -5.4) < 2.2 || fi === 0;

    for (const bankSide of [-1, 1]) {
      for (const lrSide of [-1, 1]) {
        const fx = f.x + lrSide * (f.half + 0.85);
        const cz = riverCenterZ(fx);
        const halfW = riverHalfWidthAt(fx);
        const shoreZ = findShoreZ(fx, bankSide, cz, halfW);
        const fz = shoreZ + bankSide * 1.15;
        const fy = getTerrainHeight(fx, fz);

        // Place warm hanging ford lanterns on diagonally framing entrances of the main road ford!
        const isLanternPost = isMainRoadFord && bankSide * lrSide === -1;

        if (isLanternPost) {
          const lGroup = new THREE.Group();
          lGroup.position.set(fx, fy, fz);
          // Aim lantern arm gently inward toward the ford crossing!
          const aimX = f.x - fx;
          const aimZ = cz - fz;
          lGroup.rotation.y = Math.atan2(-aimZ, aimX);

          // Main post extends down to y = -0.75 so it NEVER floats on sloped banks
          const post = new THREE.Mesh(lanternPostGeo, fordPostWoodMat);
          post.position.y = 1.025; // bottom = 1.025 - 1.775 = -0.75, top = 2.80
          post.rotation.z = -0.035;
          post.castShadow = !isMobile;
          post.receiveShadow = true;
          lGroup.add(post);

          // Rope binding collar
          for (let r = 0; r < 3; r++) {
            const rope = new THREE.Mesh(ropeWrapGeo, ropeMat);
            rope.position.set(0.03, 2.38 + r * 0.042, 0);
            lGroup.add(rope);
          }

          // Angled cross-arm & diagonal timber brace
          const arm = new THREE.Mesh(lanternArmGeo, fordPostWoodMat);
          arm.position.set(0.36, 2.62, 0);
          arm.rotation.z = 0.08;
          arm.castShadow = !isMobile;
          lGroup.add(arm);

          const brace = new THREE.Mesh(lanternBraceGeo, fordPostWoodMat);
          brace.position.set(0.20, 2.42, 0);
          brace.rotation.z = 0.72;
          lGroup.add(brace);

          // Iron lantern hood, glowing amber glass & bottom rim
          const cap = new THREE.Mesh(lanternCapGeo, darkIronMat);
          cap.position.set(0.68, 2.44, 0);
          lGroup.add(cap);

          const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe49e });
          const glass = new THREE.Mesh(lanternGlassGeo, glassMat);
          glass.position.set(0.68, 2.26, 0);
          lGroup.add(glass);

          const rim = new THREE.Mesh(lanternBaseRimGeo, darkIronMat);
          rim.position.set(0.68, 2.13, 0);
          lGroup.add(rim);

          // Additive warm glow sprite (zero PointLights for mobile FPS!)
          const haloMat = new THREE.SpriteMaterial({
            map: warmGlowTex,
            color: 0xffc66b,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const halo = new THREE.Sprite(haloMat);
          halo.position.set(0.68, 2.26, 0);
          halo.scale.set(1.70, 1.70, 1.0);
          lGroup.add(halo);

          group.add(lGroup);
          lanterns.push({
            group: lGroup,
            halo,
            glassMat,
            phase: lanternIdx * 1.9 + 0.7,
          });
          lanternIdx++;
        } else {
          // Natural weathered wooden ford guidepost (sunk to y = -0.75)
          const pGroup = new THREE.Group();
          pGroup.position.set(fx, fy, fz);
          pGroup.rotation.y = hash2(fx, fz) * Math.PI * 2;

          const lean = (hash2(fx + 3.1, fz - 1.7) - 0.5) * 0.11;
          const post = new THREE.Mesh(guidePostGeo, fordPostWoodMat);
          post.position.y = 0.375; // bottom = 0.375 - 1.125 = -0.75, top = 1.50
          post.rotation.z = lean;
          post.castShadow = !isMobile;
          post.receiveShadow = true;
          pGroup.add(post);

          const cap = new THREE.Mesh(guideCapGeo, fordPostWoodMat);
          cap.position.set(-Math.sin(lean) * 1.12, 1.54, 0);
          cap.rotation.z = lean;
          pGroup.add(cap);

          // Braided rope wrap around the upper post
          for (let r = 0; r < 3; r++) {
            const rope = new THREE.Mesh(ropeWrapGeo, ropeMat);
            const ry = 1.12 + r * 0.044;
            rope.position.set(-Math.sin(lean) * (ry - 0.375), ry, 0);
            rope.rotation.z = lean;
            pGroup.add(rope);
          }

          group.add(pGroup);
        }

        // Low smooth riverbank cobble cluster framing the outer ford post (never inside crossing lane!)
        for (let k = 0; k < 3; k++) {
          const cSeed = 3100 + fi * 43 + bankSide * 13 + lrSide * 7 + k * 3.7;
          const ang = hash1(cSeed) * Math.PI * 2;
          const ox = fx + lrSide * 0.35 + Math.cos(ang) * (0.35 + k * 0.18);
          const oz = fz + bankSide * 0.12 + Math.sin(ang) * (0.32 + k * 0.16);
          const oy = getTerrainHeight(ox, oz);
          const cr = 0.18 + hash1(cSeed + 1.5) * 0.18;

          tmpObj.position.set(ox, oy + cr * 0.22 - 0.04, oz);
          tmpObj.rotation.set(0.12, ang, -0.08);
          tmpObj.scale.set(cr * 1.35, cr * 0.54, cr * 1.1);
          tmpObj.updateMatrix();
          mossyCobbleEntries.push({ geo: cobbleGeoLow, matrix: tmpObj.matrix.clone() });
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // G. FINALIZE MERGED CEL-SHADED STATIC LAYERS (SUPER-LOW DRAW CALLS!)
  // --------------------------------------------------------------------------
  function addMergedLayer(entries, mat, name, includeColor, castShadow) {
    const geo = mergePlacedGeometries(entries, includeColor);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = castShadow && !isMobile;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  addMergedLayer(wetCobbleEntries, wetRockMat, 'river-wet-cobbles', false, true);
  addMergedLayer(mossyCobbleEntries, mossyRockMat, 'river-mossy-cobbles', false, true);
  addMergedLayer(mossCapEntries, mossCapMat, 'river-boulder-moss', false, false);
  addMergedLayer(staticReedStemEntries, reedStemMat, 'river-reed-stems', false, false);
  addMergedLayer(staticReedHeadEntries, reedHeadMat, 'river-reed-heads', false, false);
  addMergedLayer(fernEntries, fernMat, 'river-bank-ferns', true, false);
  addMergedLayer(sedgeEntries, sedgeMat, 'river-bank-sedges', true, false);
  addMergedLayer(driftwoodEntries, driftwoodMat, 'river-driftwood', false, true);

  // Dispose temporary unit geometries that were only used for merging
  cobbleGeoLow.dispose();
  mossCapGeo.dispose();
  reedStemUnitGeo.dispose();
  reedHeadUnitGeo.dispose();
  reedLeafGeo.dispose();
  fernFrondGeo.dispose();
  sedgeBladeGeo.dispose();
  logUnitGeo.dispose();
  stubUnitGeo.dispose();

  return { group, obstacles, colliders, lanterns, animated };
}

// ============================================================================
// 2. CRYSTAL-CLEAR BOTW FLOWING RIVER SURFACE (1:1 POND SHADER MATCH + FLOW)
// ============================================================================

function createBotWRiverSurface(ctx, riverSpec, obstacles = []) {
  const getTerrainHeight = ctx.getTerrainHeight;
  const celShaderUniforms = ctx.celShaderUniforms;
  const grassUniforms = ctx.grassUniforms;
  const activeAtmosphere = ctx.activeAtmosphere;
  const waterDataTex = ctx.waterDataTex || createFallbackWaterDataTexture();

  const terrainSize = riverSpec.terrainSize || 260;
  const waterY = riverSpec.waterY ?? -0.22;
  const baseHalfWidth = riverSpec.halfWidth ?? 4.8;
  const bankWidth = riverSpec.bank ?? 3.4;
  const riverCenterZ = riverSpec.riverCenterZ;
  const riverHalfWidthAt =
    riverSpec.riverHalfWidthAt || ((x) => baseHalfWidth * (0.90 + 0.10 * Math.sin(x * 0.08)));

  // Spatial-bucket obstacles along X for < 2ms vertex obstacle-distance queries
  const BUCKET_SIZE = 6.0;
  const obstacleBuckets = new Map();
  for (let i = 0; i < obstacles.length; i++) {
    const ob = obstacles[i];
    const b = Math.floor(ob.x / BUCKET_SIZE);
    let arr = obstacleBuckets.get(b);
    if (!arr) {
      arr = [];
      obstacleBuckets.set(b, arr);
    }
    arr.push(ob);
  }

  function queryMinObstacleDist(wx, wz) {
    if (obstacles.length === 0) return 99.0;
    const b = Math.floor(wx / BUCKET_SIZE);
    let minD = 99.0;
    for (let db = -1; db <= 1; db++) {
      const arr = obstacleBuckets.get(b + db);
      if (!arr) continue;
      for (let j = 0; j < arr.length; j++) {
        const ob = arr[j];
        const d = Math.hypot(wx - ob.x, wz - ob.z) - (ob.r * 1.12 + 0.14);
        if (d < minD) minD = d;
      }
    }
    return Math.max(0.0, minD);
  }

  // --- Subdivided Curved Ribbon Geometry (fine resolution eliminates sawtooth banks) ---
  const xStart = -terrainSize * 0.5 + 4.0;
  const xEnd = terrainSize * 0.5 - 4.0;
  const targetStepX = Math.max(1.10, (xEnd - xStart) / 900);
  const sliceSegs = Math.max(850, Math.round((xEnd - xStart) / targetStepX));
  const acrossSegs = 28;
  const cols = acrossSegs + 1;
  const rows = sliceSegs + 1;

  const vertCount = rows * cols;
  const positions = new Float32Array(vertCount * 3);
  const bedDepths = new Float32Array(vertCount);
  const obstacleDists = new Float32Array(vertCount);
  const riverUVs = new Float32Array(vertCount * 2);
  const indices = new Uint32Array(sliceSegs * acrossSegs * 6);

  let alongDist = 0.0;
  let prevX = xStart;
  let prevCz = riverCenterZ(xStart);

  let vi = 0;
  for (let i = 0; i < rows; i++) {
    const u = i / sliceSegs;
    const wx = xStart + (xEnd - xStart) * u;
    const cz = riverCenterZ(wx);

    if (i > 0) {
      alongDist += Math.hypot(wx - prevX, cz - prevCz);
      prevX = wx;
      prevCz = cz;
    }

    // Extend generously beyond waterline so shader discards follow exact sculpted banks
    const halfSpan = riverHalfWidthAt(wx) + bankWidth * 0.95;

    for (let j = 0; j < cols; j++) {
      const acrossNorm = (j / acrossSegs) * 2.0 - 1.0; // -1 (south) to +1 (north)
      const wz = cz + acrossNorm * halfSpan;

      const idx3 = vi * 3;
      const idx2 = vi * 2;
      positions[idx3] = wx;
      positions[idx3 + 1] = waterY;
      positions[idx3 + 2] = wz;

      bedDepths[vi] = waterY - getTerrainHeight(wx, wz);
      obstacleDists[vi] = queryMinObstacleDist(wx, wz);

      riverUVs[idx2] = alongDist;
      riverUVs[idx2 + 1] = acrossNorm;

      vi++;
    }
  }

  // Upward-facing (+Y) triangle winding
  let ii = 0;
  for (let i = 0; i < sliceSegs; i++) {
    const row0 = i * cols;
    const row1 = (i + 1) * cols;
    for (let j = 0; j < acrossSegs; j++) {
      const a = row0 + j;
      const b = row0 + j + 1;
      const c = row1 + j;
      const d = row1 + j + 1;
      indices[ii++] = a;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = d;
      indices[ii++] = c;
    }
  }

  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  riverGeo.setAttribute('aBedDepth', new THREE.BufferAttribute(bedDepths, 1));
  riverGeo.setAttribute('aObstacleDist', new THREE.BufferAttribute(obstacleDists, 1));
  riverGeo.setAttribute('aRiverUV', new THREE.BufferAttribute(riverUVs, 2));
  riverGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  riverGeo.computeVertexNormals();

  const defaultRippleX = -5.4;
  const uniforms = {
    uTime: celShaderUniforms.uTime,
    uWindSpeed: grassUniforms.uWindSpeed,
    uWaterDataTex: { value: waterDataTex },
    uSunDir: celShaderUniforms.uSunDir,
    uSunColor: celShaderUniforms.uSunColor,
    uSkyTop: { value: activeAtmosphere.bgTop },
    uSkyBottom: { value: activeAtmosphere.bgBottom },
    uCampfirePos: celShaderUniforms.uCampfirePos,
    uCampfireColor: celShaderUniforms.uCampfireColor,
    uCampfireStrength: celShaderUniforms.uCampfireStrength,
    uRippleOrigin: { value: new THREE.Vector3(defaultRippleX, waterY, riverCenterZ(defaultRippleX)) },
    uRippleTime: { value: -99.0 },
    uRipples: {
      value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99.0, 0.0)),
    },
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: `
      precision highp float;
      attribute float aBedDepth;
      attribute float aObstacleDist;
      attribute vec2 aRiverUV;

      uniform float uTime;
      uniform float uWindSpeed;
      uniform vec3 uRippleOrigin;
      uniform float uRippleTime;
      uniform vec4 uRipples[6];

      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vObstacleDist;
      varying vec2 vRiverUV;

      void main() {
        vDepth = aBedDepth;
        vObstacleDist = aObstacleDist;
        vRiverUV = aRiverUV;

        vec3 pos = position;
        float deepMask = smoothstep(0.02, 0.35, aBedDepth);
        float centerFlow = 1.0 - smoothstep(0.45, 0.95, abs(aRiverUV.y));

        // Gentle downstream flowing 3D surface ripples (calmer near banks, livelier mid-stream)
        float flowT = uTime * (1.45 * uWindSpeed + 0.30);
        float wave1 = sin(pos.x * 1.15 - flowT + pos.z * 0.85) * cos(pos.z * 1.10 + uTime * 1.15) * (0.014 + 0.008 * centerFlow);
        float wave2 = sin((pos.x * 1.85 - pos.z * 1.35) - uTime * 1.95) * 0.009;

        // Interactive expanding 3D ripple rings (smoothly feathered at origin, zero harsh spike)
        float rippleY = 0.0;
        for (int i = 0; i < 6; i++) {
          vec4 rp = uRipples[i];
          float rAge = uTime - rp.z;
          if (rp.w > 0.01 && rAge >= 0.0 && rAge < 2.6) {
            float dR = length(pos.xz - rp.xy);
            float ringRadius = rAge * 1.85;
            float d = dR - ringRadius;
            float env = exp(-d * d * 2.2) * smoothstep(0.0, 0.22, dR);
            float fade = (1.0 - smoothstep(0.0, 2.6, rAge)) * rp.w;
            rippleY += sin(d * 6.5) * env * fade * 0.032;
          }
        }

        pos.y += (wave1 + wave2 + clamp(rippleY, -0.045, 0.045)) * deepMask;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uWindSpeed;
      uniform sampler2D uWaterDataTex;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyBottom;
      uniform vec3 uCampfirePos;
      uniform vec3 uCampfireColor;
      uniform float uCampfireStrength;
      uniform vec3 uRippleOrigin;
      uniform float uRippleTime;
      uniform vec4 uRipples[6];

      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vObstacleDist;
      varying vec2 vRiverUV;

      void main() {
        // Clip pixels cleanly along the exact carved riverbank shoreline
        if (vDepth <= 0.002) discard;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        // Clean isotropic world-space metric coordinates (matching the pond, zero bend stretching)
        vec2 flowCoord = vWorldPos.xz * 0.24;
        float channelFactor = smoothstep(0.06, 0.52, vDepth) * (1.0 - smoothstep(0.55, 0.98, abs(vRiverUV.y)));

        // Dual-scrolling BotW Voronoi + Wave Normal lookups biased gently downstream (-X)
        float windFactor = max(0.55, uWindSpeed);
        vec2 uv1 = flowCoord + vec2(-uTime * 0.088 * windFactor, uTime * 0.016 * windFactor);
        vec2 uv2 = flowCoord * 1.32 + vec2(-uTime * 0.056 * windFactor, -uTime * 0.024 * windFactor);

        vec4 sample1 = texture2D(uWaterDataTex, uv1);
        vec4 sample2 = texture2D(uWaterDataTex, uv2);

        float fragRipple = 0.0;
        vec2 fragRippleGrad = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec4 rp = uRipples[i];
          float rAge = uTime - rp.z;
          if (rp.w > 0.01 && rAge >= 0.0 && rAge < 2.6) {
            vec2 dVec = vWorldPos.xz - rp.xy;
            float dR = length(dVec);
            vec2 rDir = (dR > 0.025) ? (dVec / dR) : vec2(0.0);
            float ringRadius = rAge * 1.85;
            float d = dR - ringRadius;
            float env = exp(-d * d * 2.2) * smoothstep(0.0, 0.22, dR);
            float fade = (1.0 - smoothstep(0.0, 2.6, rAge)) * rp.w;
            fragRipple += max(0.0, sin(d * 6.5)) * env * fade;
            fragRippleGrad += rDir * (cos(d * 6.5) * env * fade * 0.22);
          }
        }

        // Perturbed 3D Water Surface Normal (slightly livelier mid-channel, glassy along shallows)
        float normalAmp = mix(0.11, 0.16, channelFactor);
        vec2 nXY = ((sample1.rg * 2.0 - 1.0) + (sample2.rg * 2.0 - 1.0)) * normalAmp;
        nXY += fragRippleGrad;
        vec3 N = normalize(vec3(nXY.x, 1.0, nXY.y));

        // 1. Depth-based Beer-Lambert Absorption & Exact BotW Pond Emerald-Turquoise Gradient
        float depthNorm = clamp(vDepth / 1.15, 0.0, 1.0);
        vec3 shallowCol = pow(vec3(0.32, 0.88, 0.80), vec3(2.2)); // Crystal turquoise shallows
        vec3 midWaterCol = pow(vec3(0.11, 0.62, 0.72), vec3(2.2)); // Hyrule emerald-cyan
        vec3 deepWaterCol = pow(vec3(0.06, 0.28, 0.44), vec3(2.2)); // Deep indigo-teal

        vec3 waterBodyCol = mix(shallowCol, midWaterCol, smoothstep(0.04, 0.48, depthNorm));
        waterBodyCol = mix(waterBodyCol, deepWaterCol, smoothstep(0.45, 0.98, depthNorm));

        // 2. Parallax Underwater Voronoi Caustics drifting gently downstream over the riverbed
        vec2 parallaxOffset = V.xz / max(V.y, 0.25) * (vDepth * 0.28);
        vec2 cBase = flowCoord - parallaxOffset * 0.28;
        vec2 cUv1 = cBase * 1.15 + vec2(-uTime * 0.088, -uTime * 0.022);
        vec2 cUv2 = cBase * 1.42 + vec2(-uTime * 0.052, uTime * 0.032);
        float caust1 = texture2D(uWaterDataTex, cUv1).b;
        float caust2 = texture2D(uWaterDataTex, cUv2).b;
        float combinedCaustics = smoothstep(0.28, 0.68, (caust1 + caust2) * 0.62 + sample1.b * 0.25);

        float causticVisibility = smoothstep(0.04, 0.22, depthNorm) * (1.0 - smoothstep(0.65, 0.98, depthNorm));
        vec3 causticLight = mix(pow(vec3(0.65, 0.98, 0.92), vec3(2.2)), uSunColor * 1.15, 0.55);
        waterBodyCol += causticLight * combinedCaustics * causticVisibility * 0.48;

        // 3. Schlick Fresnel Sky & Horizon Reflection
        float NoV = max(dot(N, V), 0.0);
        float fresnel = clamp(0.06 + 0.88 * pow(1.0 - NoV, 3.4), 0.0, 1.0);
        vec3 reflDir = reflect(-V, N);
        vec3 skyRefl = mix(uSkyBottom, uSkyTop, clamp(reflDir.y * 0.75 + 0.25, 0.0, 1.0));
        vec3 surfaceCol = mix(waterBodyCol, skyRefl * 1.05, fresnel * 0.72);

        // 4. BotW Stepped Cel-Shaded Sun Specular Glints & Shimmering Path
        vec3 H = normalize(L + V);
        float NoH = max(dot(N, H), 0.0);
        float softPath = pow(NoH, 28.0) * 0.38;
        float celSparkle = smoothstep(0.62, 0.68, pow(NoH, 95.0) + combinedCaustics * 0.16);
        surfaceCol += uSunColor * (softPath + celSparkle * 0.95);

        // Warm Campfire Reflection on the River Surface
        float fireDist = length(uCampfirePos - vWorldPos);
        float fireGlow = (1.0 - smoothstep(3.0, 14.5, fireDist)) * uCampfireStrength;
        surfaceCol += uCampfireColor * fireGlow * (0.25 + combinedCaustics * 0.35);

        // 5. BotW Soft Organic Shoreline, Boulder & Ripple Foam
        float cellularNoise = (sample1.a + sample2.a) * 0.5;
        float shoreZone = (1.0 - smoothstep(0.02, 0.28, vDepth));
        float wavePhase = sin(vDepth * 16.0 - uTime * 2.4 + cellularNoise * 3.8) * 0.5 + 0.5;
        float innerFoamRing = smoothstep(0.56, 0.72, wavePhase * shoreZone + cellularNoise * 0.26 * shoreZone) * smoothstep(0.015, 0.08, vDepth);
        float outerShoreLip = (1.0 - smoothstep(0.015, 0.095, vDepth)) * smoothstep(0.01, 0.045, vDepth) * 0.68;
        // Dedicated concentric foam ring around submerged & bank boulders (1:1 pond style)
        float rockZone = 1.0 - smoothstep(0.0, 0.56, vObstacleDist);
        float rockWave = sin(vObstacleDist * 18.0 - uTime * 2.8 + cellularNoise * 3.2) * 0.5 + 0.5;
        float rockFoamRing = smoothstep(0.50, 0.64, rockWave * rockZone + cellularNoise * 0.28 * rockZone);
        float rippleFoam = clamp(fragRipple * 0.45, 0.0, 0.55);

        // Subtle, smoothly feathered whitewater shimmer over rocky shallow ford bars
        float fordRiffleMask =
          smoothstep(0.06, 0.22, vDepth) *
          (1.0 - smoothstep(0.24, 0.58, vDepth)) *
          (1.0 - smoothstep(0.45, 0.85, abs(vRiverUV.y)));
        float fordRiffleFoam =
          smoothstep(0.68, 0.84, cellularNoise * 0.78 + combinedCaustics * 0.34) *
          fordRiffleMask * 0.16;

        float totalFoam = clamp(max(max(max(max(innerFoamRing, outerShoreLip), rockFoamRing), rippleFoam), fordRiffleFoam), 0.0, 1.0);
        vec3 foamCol = mix(pow(vec3(0.88, 0.98, 1.0), vec3(2.2)), uSunColor, 0.24);
        surfaceCol = mix(surfaceCol, foamCol, totalFoam * 0.84);

        // 6. Crystal-Clear Shore Feathering & Depth Opacity
        float baseAlpha = smoothstep(0.015, 0.14, vDepth) * mix(0.66, 0.94, smoothstep(0.08, 0.72, depthNorm));
        float finalAlpha = clamp(max(baseAlpha, totalFoam * 0.78 * smoothstep(0.01, 0.055, vDepth)), 0.0, 0.96);

        gl_FragColor = vec4(surfaceCol, finalAlpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(riverGeo, material);
  mesh.name = 'river-water';
  mesh.userData = { type: 'river' };
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  return { mesh, uniforms, material };
}

export { createBotWRiverSurface, createNaturalRiverbanks };
