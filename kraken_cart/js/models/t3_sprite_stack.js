import { HC } from '../hc.js';

const THREE = HC.THREE;

/* ============================================================================
   SPRITE·STACK T3 HYBRID — Automatic Original-Rig Baker + WebGL2 OBB Raymarcher
   ----------------------------------------------------------------------------
   Converts existing articulated Three.js voxel models (buildSmallBandit,
   buildBigBandit, buildVoxelBoarRig) directly into Sprite·Stack T3 Hybrid:
   - Bakes each original articulated part (<= 12 parts) into a 24x24x24 voxel
     grid packed into ONE shared RGBA8 THREE.Data3DTexture (24x24x(24*N)),
     NearestFilter & ClampToEdgeWrapping, preserving exact original shapes,
     proportions, and colors (both vertexColors boxes & material.color meshes).
   - Drives OBB transforms directly from the original rig's real animated joints
     (animateSmallBandit, animateBigBandit, BoarMob._blendAndApply) so every
     original pose, lunge, weapon swing, ear twitch, and death fall is preserved.
   - Fragment shader (GLSL 300 es) executes all 5 T3 Hybrid passes in 1 frame:
       1) RAW ALBEDO
       2) NORMALS
       3) CEL-AO (3-tier quantized cel 0.45 / 0.75 / 1.0 + neighbor voxel AO)
       4) SHADOW-RIM (directional sun + rim light + hit flash / telegraph)
       5) PIXEL SNAP + 1PX OUTLINE (virtual low-res grid + 4-neighbor outline
          + exact gl_FragDepth integration with the 3D scene).
   ============================================================================ */

const MAX_PARTS = 14;
const GRID = 24;
const HALF_GRID = 12;

let _t3PassMode = 5; // 1=Albedo, 2=Normals, 3=Cel-AO, 4=Shadow-Rim, 5=Full Pixel-Snap+Outline

function setT3Pass(mode) {
  const m = Math.max(1, Math.min(5, (mode | 0) || 5));
  _t3PassMode = m;
  return _t3PassMode;
}

function getT3Pass() {
  return _t3PassMode;
}

HC.setT3Pass = setT3Pass;
HC.getT3Pass = getT3Pass;

// ---- 3D Voxel Atlas (24x24x(24*N) RGBA8) ----
class T3VoxelAtlas {
  constructor(partCount) {
    this.partCount = Math.min(MAX_PARTS, Math.max(1, partCount | 0));
    this.width = GRID;
    this.height = GRID;
    this.depth = GRID * this.partCount;
    this.data = new Uint8Array(this.width * this.height * this.depth * 4);
    this.voxelCount = 0;
  }

  setGrid(partIdx, gx, gy, gz, r, g, b, a = 255) {
    if (partIdx < 0 || partIdx >= this.partCount) return;
    if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID || gz < 0 || gz >= GRID) return;
    const zSlice = partIdx * GRID + gz;
    const idx = ((zSlice * GRID + gy) * GRID + gx) * 4;
    if (this.data[idx + 3] === 0) this.voxelCount++;
    this.data[idx] = r;
    this.data[idx + 1] = g;
    this.data[idx + 2] = b;
    this.data[idx + 3] = a;
  }

  toTexture() {
    const tex = new THREE.Data3DTexture(this.data, this.width, this.height, this.depth);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    tex.userData = { partCount: this.partCount, voxelCount: this.voxelCount, grid: GRID };
    return tex;
  }
}

// ---- Automatic Oriented-Box Extractor & Voxelizer from Original Three.js Rigs ----
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vD = new THREE.Vector3();
const _vP = new THREE.Vector3();
const _vMin = new THREE.Vector3();
const _vMax = new THREE.Vector3();
const _mPartInv = new THREE.Matrix4();
const _mRootInv = new THREE.Matrix4();
const _mRelRoot = new THREE.Matrix4();
const _mMeshRel = new THREE.Matrix4();
const _mPartScale = new THREE.Matrix4();
const _bakePos = new THREE.Vector3();
const _bakeQuat = new THREE.Quaternion();
const _bakeScale = new THREE.Vector3();
const _mBoxInv = new THREE.Matrix4();
const _mBox = new THREE.Matrix4();
const _mBasis = new THREE.Matrix4();
const _axX = new THREE.Vector3();
const _axY = new THREE.Vector3();
const _axZ = new THREE.Vector3();
const _tmpCol = new THREE.Color();

function toByte(v) {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/**
 * Collects all oriented boxes (center, 3 axes with half-lengths, RGB bytes)
 * owned directly by `partNode` (stopping traversal at any other partNode),
 * pre-scaled into `root` metric space so scaled Sylvan/Rabbit rigs bake at exact final size.
 */
function collectPartBoxes(partNode, partSet, rootInv) {
  partNode.updateMatrixWorld(true);
  _mPartInv.copy(partNode.matrixWorld).invert();
  if (rootInv) {
    _mRelRoot.multiplyMatrices(rootInv, partNode.matrixWorld);
    _mRelRoot.decompose(_bakePos, _bakeQuat, _bakeScale);
    const sx = Math.abs(_bakeScale.x) > 1e-4 ? _bakeScale.x : 1.0;
    const sy = Math.abs(_bakeScale.y) > 1e-4 ? _bakeScale.y : 1.0;
    const sz = Math.abs(_bakeScale.z) > 1e-4 ? _bakeScale.z : 1.0;
    _mPartScale.makeScale(sx, sy, sz);
  } else {
    _mPartScale.identity();
  }
  const boxes = [];

  function walk(node) {
    if (node !== partNode && partSet.has(node)) return;
    if (node.visible === false && node !== partNode) return;

    if (node.isMesh && node.geometry && node.geometry.attributes && node.geometry.attributes.position) {
      const geo = node.geometry;
      const posAttr = geo.attributes.position;
      const colAttr = geo.attributes.color;
      _mMeshRel.multiplyMatrices(_mPartInv, node.matrixWorld);
      if (rootInv) _mMeshRel.premultiply(_mPartScale);

      // Case 1: Merged non-indexed boxes (bandit_models.js createVoxelBuilder: 36 verts per box)
      if (!geo.index && colAttr && posAttr.count >= 36 && posAttr.count % 36 === 0) {
        const boxCount = posAttr.count / 36;
        for (let b = 0; b < boxCount; b++) {
          const base = b * 36;
          // Three.js BoxGeometry non-indexed face vertex layout:
          // Face 0 (+X): 0=(+x,+y,+z), 1=(+x,+y,-z), 2=(+x,-y,+z), ...
          // Face 1 (-X): 6=(-x,+y,-z), 7=(-x,+y,+z), 8=(-x,-y,-z), ...
          // Compute exact center from all 36 verts and orthogonal axes from face 0 & face 1
          let cx = 0, cy = 0, cz = 0;
          for (let k = 0; k < 36; k++) {
            _vP.fromBufferAttribute(posAttr, base + k).applyMatrix4(_mMeshRel);
            cx += _vP.x; cy += _vP.y; cz += _vP.z;
          }
          const center = new THREE.Vector3(cx / 36, cy / 36, cz / 36);

          // Extract exact 3 edges from corner v0=(+x,+y,+z):
          // v0 = base+0 (+x,+y,+z), v1 = base+1 (+x,+y,-z), v2 = base+2 (+x,-y,+z), v7 = base+7 (-x,+y,+z)
          _vA.fromBufferAttribute(posAttr, base + 0).applyMatrix4(_mMeshRel);
          _vB.fromBufferAttribute(posAttr, base + 7).applyMatrix4(_mMeshRel);
          _vC.fromBufferAttribute(posAttr, base + 2).applyMatrix4(_mMeshRel);
          _vD.fromBufferAttribute(posAttr, base + 1).applyMatrix4(_mMeshRel);

          const eX = _vA.clone().sub(_vB).multiplyScalar(0.5);
          const eY = _vA.clone().sub(_vC).multiplyScalar(0.5);
          const eZ = _vA.clone().sub(_vD).multiplyScalar(0.5);

          const mat = Array.isArray(node.material) ? node.material[0] : node.material;
          const isEmissive = !!(mat && (mat.isMeshBasicMaterial || (mat.emissiveIntensity && mat.emissiveIntensity > 0.35)))
            || !!(node.userData && node.userData.isEnergyGlow);

          // Linear color bytes matching Three.js r160 Color pipeline
          _tmpCol.setRGB(colAttr.getX(base), colAttr.getY(base), colAttr.getZ(base));
          if (mat && mat.color) _tmpCol.multiply(mat.color);
          boxes.push({
            center,
            eX,
            eY,
            eZ,
            r: toByte(_tmpCol.r),
            g: toByte(_tmpCol.g),
            b: toByte(_tmpCol.b),
            emissive: isEmissive,
          });
        }
      } else {
        // Case 2: Standard Three.js BoxGeometry / Mesh with material.color (e.g. buildVoxelBoarRig / Rabbit)
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (bb) {
          const localCenter = bb.getCenter(new THREE.Vector3());
          const localHalf = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const center = localCenter.clone().applyMatrix4(_mMeshRel);

          const eX = new THREE.Vector3(localHalf.x, 0, 0).transformDirection(_mMeshRel);
          const eY = new THREE.Vector3(0, localHalf.y, 0).transformDirection(_mMeshRel);
          const eZ = new THREE.Vector3(0, 0, localHalf.z).transformDirection(_mMeshRel);
          // Scale axes by actual column lengths of _mMeshRel
          const el = _mMeshRel.elements;
          eX.set(el[0] * localHalf.x, el[1] * localHalf.x, el[2] * localHalf.x);
          eY.set(el[4] * localHalf.y, el[5] * localHalf.y, el[6] * localHalf.y);
          eZ.set(el[8] * localHalf.z, el[9] * localHalf.z, el[10] * localHalf.z);

          const mat = Array.isArray(node.material) ? node.material[0] : node.material;
          const isEmissive = !!(mat && (mat.isMeshBasicMaterial || (mat.emissiveIntensity && mat.emissiveIntensity > 0.35)))
            || !!(node.userData && node.userData.isEnergyGlow);
          if (mat && mat.color) _tmpCol.copy(mat.color);
          else _tmpCol.setHex(0x888888);
          if (mat && mat.emissive && mat.emissiveIntensity && !mat.isMeshBasicMaterial) {
            _tmpCol.addScaledVector ? null : (_tmpCol.r = Math.min(1, _tmpCol.r + mat.emissive.r * mat.emissiveIntensity * 0.5),
              _tmpCol.g = Math.min(1, _tmpCol.g + mat.emissive.g * mat.emissiveIntensity * 0.5),
              _tmpCol.b = Math.min(1, _tmpCol.b + mat.emissive.b * mat.emissiveIntensity * 0.5));
          }

          boxes.push({
            center,
            eX,
            eY,
            eZ,
            r: toByte(_tmpCol.r),
            g: toByte(_tmpCol.g),
            b: toByte(_tmpCol.b),
            emissive: isEmissive,
          });
        }
      }
    }

    const ch = node.children;
    for (let i = 0; i < ch.length; i++) walk(ch[i]);
  }

  walk(partNode);
  return boxes;
}

/**
 * Rasterizes collected boxes of all parts into a shared 24x24x(24*N) 3D texture,
 * auto-centering each part's local grid so long weapons/limbs never clip.
 */
function bakeRigPartsToAtlas(partNodes, voxelSize, root = null) {
  const count = Math.min(MAX_PARTS, partNodes.length);
  const partSet = new Set(partNodes.slice(0, count));
  const atlas = new T3VoxelAtlas(count);
  const partCenters = [];
  if (root) {
    root.updateMatrixWorld(true);
    _mRootInv.copy(root.matrixWorld).invert();
  }
  const rootInv = root ? _mRootInv : null;

  for (let pIdx = 0; pIdx < count; pIdx++) {
    const node = partNodes[pIdx];
    if (!node) {
      partCenters.push(new THREE.Vector3());
      continue;
    }
    const boxes = collectPartBoxes(node, partSet, rootInv);
    if (!boxes.length) {
      partCenters.push(new THREE.Vector3());
      continue;
    }

    // Compute tight bounding box of all boxes in this part (in meters)
    _vMin.set(Infinity, Infinity, Infinity);
    _vMax.set(-Infinity, -Infinity, -Infinity);
    for (const bx of boxes) {
      const rx = Math.abs(bx.eX.x) + Math.abs(bx.eY.x) + Math.abs(bx.eZ.x);
      const ry = Math.abs(bx.eX.y) + Math.abs(bx.eY.y) + Math.abs(bx.eZ.y);
      const rz = Math.abs(bx.eX.z) + Math.abs(bx.eY.z) + Math.abs(bx.eZ.z);
      _vMin.x = Math.min(_vMin.x, bx.center.x - rx);
      _vMin.y = Math.min(_vMin.y, bx.center.y - ry);
      _vMin.z = Math.min(_vMin.z, bx.center.z - rz);
      _vMax.x = Math.max(_vMax.x, bx.center.x + rx);
      _vMax.y = Math.max(_vMax.y, bx.center.y + ry);
      _vMax.z = Math.max(_vMax.z, bx.center.z + rz);
    }

    // Auto-center the part's 24^3 grid on its actual geometry center (in voxel units)
    const centerVox = new THREE.Vector3(
      (_vMin.x + _vMax.x) * 0.5 / voxelSize,
      (_vMin.y + _vMax.y) * 0.5 / voxelSize,
      (_vMin.z + _vMax.z) * 0.5 / voxelSize
    );
    partCenters.push(centerVox);

    // Rasterize each oriented box into the 24^3 grid
    for (const bx of boxes) {
      const lx = bx.eX.length();
      const ly = bx.eY.length();
      const lz = bx.eZ.length();
      if (lx < 1e-6 && ly < 1e-6 && lz < 1e-6) continue;

      // Build orthonormal local basis for point-in-OBB test
      _axX.copy(bx.eX);
      _axY.copy(bx.eY);
      _axZ.copy(bx.eZ);
      if (lx > 1e-6) _axX.divideScalar(lx); else _axX.set(1, 0, 0);
      if (ly > 1e-6) _axY.divideScalar(ly); else _axY.set(0, 1, 0);
      if (lz > 1e-6) _axZ.divideScalar(lz); else _axZ.set(0, 0, 1);

      // Skin pad so thin details (eyes, blades, brows, snout) always capture >= 1 voxel
      const pad = voxelSize * 0.44;
      const hx = Math.max(lx, pad);
      const hy = Math.max(ly, pad);
      const hz = Math.max(lz, pad);

      const rx = Math.abs(bx.eX.x) + Math.abs(bx.eY.x) + Math.abs(bx.eZ.x) + pad;
      const ry = Math.abs(bx.eX.y) + Math.abs(bx.eY.y) + Math.abs(bx.eZ.y) + pad;
      const rz = Math.abs(bx.eX.z) + Math.abs(bx.eY.z) + Math.abs(bx.eZ.z) + pad;

      const gx0 = Math.max(0, Math.floor((bx.center.x - rx) / voxelSize - centerVox.x + HALF_GRID));
      const gx1 = Math.min(GRID - 1, Math.ceil((bx.center.x + rx) / voxelSize - centerVox.x + HALF_GRID));
      const gy0 = Math.max(0, Math.floor((bx.center.y - ry) / voxelSize - centerVox.y + HALF_GRID));
      const gy1 = Math.min(GRID - 1, Math.ceil((bx.center.y + ry) / voxelSize - centerVox.y + HALF_GRID));
      const gz0 = Math.max(0, Math.floor((bx.center.z - rz) / voxelSize - centerVox.z + HALF_GRID));
      const gz1 = Math.min(GRID - 1, Math.ceil((bx.center.z + rz) / voxelSize - centerVox.z + HALF_GRID));

      for (let gz = gz0; gz <= gz1; gz++) {
        const wz = (gz - HALF_GRID + 0.5 + centerVox.z) * voxelSize - bx.center.z;
        for (let gy = gy0; gy <= gy1; gy++) {
          const wy = (gy - HALF_GRID + 0.5 + centerVox.y) * voxelSize - bx.center.y;
          for (let gx = gx0; gx <= gx1; gx++) {
            const wx = (gx - HALF_GRID + 0.5 + centerVox.x) * voxelSize - bx.center.x;
            const px = Math.abs(wx * _axX.x + wy * _axX.y + wz * _axX.z);
            if (px > hx) continue;
            const py = Math.abs(wx * _axY.x + wy * _axY.y + wz * _axY.z);
            if (py > hy) continue;
            const pz = Math.abs(wx * _axZ.x + wy * _axZ.y + wz * _axZ.z);
            if (pz > hz) continue;
            atlas.setGrid(pIdx, gx, gy, gz, bx.r, bx.g, bx.b, bx.emissive ? 180 : 255);
          }
        }
      }
    }
  }

  return {
    texture: atlas.toTexture(),
    partCenters,
    partCount: count,
    voxelSize,
  };
}

// ---- GLSL 300 es Shaders (OBB Raymarching + 5-Pass T3 Hybrid) ----
const T3_VERT = /* glsl */ `
out vec3 vLocalPos;
void main() {
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const T3_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler3D;

uniform sampler3D uVoxelTex;
uniform int uPartCount;
uniform vec3 uPartPos[${MAX_PARTS}];
uniform mat3 uPartRot[${MAX_PARTS}];
uniform float uVoxelSize;
uniform mat4 uMVP;
uniform mat4 uInvMVP;
uniform mat3 uModelRot;
uniform vec4 uViewport;
uniform float uVirtualHeight;
uniform vec3 uSunDir;
uniform vec3 uOutlineColor;
uniform float uFlash;
uniform float uTelegraph;
uniform float uCreaseEnabled;
uniform int uPassMode;

in vec3 vLocalPos;
out vec4 fragColor;

const float FGRID = float(${GRID});
const float FHALF = float(${HALF_GRID});

struct Hit {
  bool ok;
  float t;
  vec3 albedo;
  vec3 normal;
  float ao;
  int partIdx;
  bool emissive;
};

bool isSolid(int partIdx, ivec3 c) {
  if (c.x < 0 || c.x >= ${GRID} || c.y < 0 || c.y >= ${GRID} || c.z < 0 || c.z >= ${GRID}) return false;
  return texelFetch(uVoxelTex, ivec3(c.x, c.y, partIdx * ${GRID} + c.z), 0).a > 0.5;
}

vec4 fetchVoxel(int partIdx, ivec3 c) {
  return texelFetch(uVoxelTex, ivec3(c.x, c.y, partIdx * ${GRID} + c.z), 0);
}

void makePixelRay(vec2 localFrag, out vec3 ro, out vec3 rd) {
  vec2 ndc = (localFrag / max(uViewport.zw, vec2(1.0))) * 2.0 - 1.0;
  vec4 nearL = uInvMVP * vec4(ndc, -1.0, 1.0);
  vec4 midL  = uInvMVP * vec4(ndc,  0.5, 1.0);
  vec3 l0 = nearL.xyz / nearL.w;
  vec3 l1 = midL.xyz  / midL.w;
  ro = l0 / uVoxelSize;
  rd = normalize(l1 - l0);
}

Hit traceAllParts(vec3 ro, vec3 rd, bool needShading) {
  Hit best;
  best.ok = false;
  best.t = 1e20;
  best.albedo = vec3(0.0);
  best.normal = vec3(0.0, 1.0, 0.0);
  best.ao = 1.0;
  best.partIdx = -1;
  best.emissive = false;

  for (int i = 0; i < ${MAX_PARTS}; i++) {
    if (i >= uPartCount) break;

    mat3 rotT = transpose(uPartRot[i]);
    vec3 lp = rotT * (ro - uPartPos[i]) + vec3(FHALF);
    vec3 ld = rotT * rd;

    vec3 safeLd = vec3(
      abs(ld.x) < 1e-6 ? (ld.x >= 0.0 ? 1e-6 : -1e-6) : ld.x,
      abs(ld.y) < 1e-6 ? (ld.y >= 0.0 ? 1e-6 : -1e-6) : ld.y,
      abs(ld.z) < 1e-6 ? (ld.z >= 0.0 ? 1e-6 : -1e-6) : ld.z
    );
    vec3 invD = 1.0 / safeLd;

    // Slab test against [0, GRID]^3
    vec3 t0 = (vec3(0.0) - lp) * invD;
    vec3 t1 = (vec3(FGRID) - lp) * invD;
    vec3 tsmall = min(t0, t1);
    vec3 tbig = max(t0, t1);
    float tmin = max(max(tsmall.x, tsmall.y), tsmall.z);
    float tmax = min(min(tbig.x, tbig.y), tbig.z);

    if (tmax < max(tmin, 0.0) || tmin >= best.t) continue;

    float tCur = max(tmin, 0.0);
    vec3 startPos = lp + safeLd * (tCur + 1e-4);
    ivec3 cell = clamp(ivec3(floor(startPos)), ivec3(0), ivec3(${GRID - 1}));

    ivec3 stepDir = ivec3(
      safeLd.x >= 0.0 ? 1 : -1,
      safeLd.y >= 0.0 ? 1 : -1,
      safeLd.z >= 0.0 ? 1 : -1
    );
    vec3 tDelta = abs(invD);
    vec3 nextBound = vec3(cell) + vec3(
      stepDir.x > 0 ? 1.0 : 0.0,
      stepDir.y > 0 ? 1.0 : 0.0,
      stepDir.z > 0 ? 1.0 : 0.0
    );
    vec3 tMax = (nextBound - lp) * invD;

    vec3 localN = vec3(0.0, 1.0, 0.0);
    if (tmin > 0.0) {
      if (tsmall.x >= tsmall.y && tsmall.x >= tsmall.z) localN = vec3(-float(stepDir.x), 0.0, 0.0);
      else if (tsmall.y >= tsmall.z) localN = vec3(0.0, -float(stepDir.y), 0.0);
      else localN = vec3(0.0, 0.0, -float(stepDir.z));
    }

    for (int s = 0; s < 72; s++) {
      if (cell.x < 0 || cell.x >= ${GRID} || cell.y < 0 || cell.y >= ${GRID} || cell.z < 0 || cell.z >= ${GRID}) break;
      if (tCur >= best.t) break;

      vec4 vx = fetchVoxel(i, cell);
      if (vx.a > 0.5) {
        best.ok = true;
        best.t = tCur;
        best.partIdx = i;
        best.emissive = vx.a < 0.85;
        if (needShading) {
          best.albedo = vx.rgb;
          best.normal = normalize(uPartRot[i] * localN);
          float ao = 1.0;
          ivec3 nOff = ivec3(round(localN));
          if (isSolid(i, cell + nOff)) ao *= 0.55;
          if (isSolid(i, cell + ivec3(0, 1, 0))) ao *= 0.80;
          best.ao = ao;
        }
        break;
      }

      if (tMax.x < tMax.y) {
        if (tMax.x < tMax.z) {
          tCur = tMax.x;
          tMax.x += tDelta.x;
          cell.x += stepDir.x;
          localN = vec3(-float(stepDir.x), 0.0, 0.0);
        } else {
          tCur = tMax.z;
          tMax.z += tDelta.z;
          cell.z += stepDir.z;
          localN = vec3(0.0, 0.0, -float(stepDir.z));
        }
      } else {
        if (tMax.y < tMax.z) {
          tCur = tMax.y;
          tMax.y += tDelta.y;
          cell.y += stepDir.y;
          localN = vec3(0.0, -float(stepDir.y), 0.0);
        } else {
          tCur = tMax.z;
          tMax.z += tDelta.z;
          cell.z += stepDir.z;
          localN = vec3(0.0, 0.0, -float(stepDir.z));
        }
      }
    }
  }

  return best;
}

void writeHitDepth(vec3 ro, vec3 rd, float t) {
  vec3 hitLocal = (ro + rd * t) * uVoxelSize;
  vec4 clipPos = uMVP * vec4(hitLocal, 1.0);
  gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 0.99999);
}

void main() {
  // Pass 05 Pixel Snap: use exact framebuffer viewport pixels; only quantize when rendering above virtual height
  vec2 res = max(uViewport.zw, vec2(1.0));
  vec2 localFrag = gl_FragCoord.xy - uViewport.xy;
  bool isVirtualBuf = res.y <= uVirtualHeight + 2.0;
  float aspect = res.x / max(res.y, 1.0);
  float vH = max(120.0, uVirtualHeight);
  float vW = max(120.0, vH * aspect);
  vec2 pixSize = isVirtualBuf ? vec2(1.0) : (res / vec2(vW, vH));
  vec2 sampleXY = (uPassMode >= 5 && !isVirtualBuf)
    ? (floor(localFrag / pixSize) + 0.5) * pixSize
    : localFrag;

  vec3 ro, rd;
  makePixelRay(sampleXY, ro, rd);

  Hit h = traceAllParts(ro, rd, true);

  if (!h.ok) {
    // Pass 05 1px Silhouette Outline: check 4 virtual pixel neighbors
    if (uPassMode >= 5) {
      vec2 offs[4];
      offs[0] = vec2( pixSize.x, 0.0);
      offs[1] = vec2(-pixSize.x, 0.0);
      offs[2] = vec2(0.0,  pixSize.y);
      offs[3] = vec2(0.0, -pixSize.y);
      float bestOutlineT = 1e20;
      vec3 bestRo = ro;
      vec3 bestRd = rd;
      bool edge = false;
      for (int k = 0; k < 4; k++) {
        vec3 nRo, nRd;
        makePixelRay(sampleXY + offs[k], nRo, nRd);
        Hit nh = traceAllParts(nRo, nRd, false);
        if (nh.ok && nh.t < bestOutlineT) {
          edge = true;
          bestOutlineT = nh.t;
          bestRo = nRo;
          bestRd = nRd;
        }
      }
      if (edge) {
        writeHitDepth(bestRo, bestRd, bestOutlineT);
        vec3 oCol = mix(uOutlineColor, vec3(1.0, 0.35, 0.2), clamp(uTelegraph * 0.65, 0.0, 0.65));
        fragColor = vec4(oCol, 1.0);
        return;
      }
    }
    discard;
  }

  writeHitDepth(ro, rd, h.t);

  vec3 worldN = normalize(uModelRot * h.normal);
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(-(uModelRot * rd));

  // Pass 01: RAW ALBEDO
  if (uPassMode == 1) {
    fragColor = vec4(h.albedo, 1.0);
    return;
  }

  // Pass 02: NORMALS
  if (uPassMode == 2) {
    fragColor = vec4(worldN * 0.5 + 0.5, 1.0);
    return;
  }

  // Pass 03: CEL-AO (3-tier quantized cel 0.45 / 0.75 / 1.0 + neighbor voxel AO)
  float ndl = max(dot(worldN, sunDir), 0.0);
  float cel = ndl > 0.62 ? 1.0 : (ndl > 0.22 ? 0.75 : 0.45);
  vec3 col = h.emissive ? (h.albedo * 1.18) : (h.albedo * (0.34 + 0.66 * cel) * h.ao);

  if (uPassMode == 3) {
    fragColor = vec4(col, 1.0);
    return;
  }

  // Pass 04: SHADOW-RIM + combat hit flash / telegraph glow
  float rim = pow(1.0 - max(dot(worldN, viewDir), 0.0), 2.0);
  float groundShade = mix(0.86, 1.0, clamp(worldN.y * 0.5 + 0.5, 0.0, 1.0));
  if (!h.emissive) {
    col = col * groundShade + vec3(1.0, 0.96, 0.88) * rim * 0.22;
  } else {
    col += vec3(0.95, 0.98, 1.0) * rim * 0.14;
  }

  if (uTelegraph > 0.01) {
    col = mix(col, vec3(1.0, 0.36, 0.14), clamp(uTelegraph * 0.48, 0.0, 0.55));
  }
  if (uFlash > 0.01) {
    col = mix(col, vec3(1.0, 0.96, 0.92), clamp(uFlash, 0.0, 0.85));
  }

  if (uPassMode == 4) {
    fragColor = vec4(col, 1.0);
    return;
  }

  // Pass 05: Crisp internal crease outline (skipped on potato preset for extra FPS)
  if (uCreaseEnabled > 0.5) {
    vec3 rRo, rRd, uRo, uRd;
    makePixelRay(sampleXY + vec2(pixSize.x, 0.0), rRo, rRd);
    makePixelRay(sampleXY + vec2(0.0, pixSize.y), uRo, uRd);
    Hit rh = traceAllParts(rRo, rRd, true);
    Hit uh = traceAllParts(uRo, uRd, true);
    bool crease = false;
    if (rh.ok && (abs(h.t - rh.t) > 3.2 || (rh.partIdx != h.partIdx && dot(h.normal, rh.normal) < 0.78))) {
      crease = true;
    }
    if (!crease && uh.ok && (abs(h.t - uh.t) > 3.2 || (uh.partIdx != h.partIdx && dot(h.normal, uh.normal) < 0.78))) {
      crease = true;
    }
    if (crease) {
      col = mix(col, uOutlineColor, 0.65);
    }
  }

  fragColor = vec4(col, 1.0);
}
`;

// ---- Runtime Actor Driven Directly by Original Articulated Three.js Rig Joints ----
const _syncInvRoot = new THREE.Matrix4();
const _syncRel = new THREE.Matrix4();
const _syncPos = new THREE.Vector3();
const _syncQuat = new THREE.Quaternion();
const _syncScale = new THREE.Vector3();
const _syncRotMat4 = new THREE.Matrix4();
const _syncCenterOff = new THREE.Vector3();
const _tmpVP = new THREE.Matrix4();
const _tmpVp = new THREE.Vector4();
const _tmpSize = new THREE.Vector2();
const _defaultSun = new THREE.Vector3(0.55, 0.78, 0.30).normalize();

class T3SpriteStackActor {
  constructor({ texture, partCenters, partCount, voxelSize, bounds, outlineColor = 0x1b151a, virtualHeight = 270 }) {
    this.texture = texture;
    this.partCenters = partCenters;
    this.partCount = Math.min(MAX_PARTS, partCount);
    this.voxelSize = voxelSize;

    this.partPos = [];
    this.partRot = [];
    for (let i = 0; i < MAX_PARTS; i++) {
      this.partPos.push(new THREE.Vector3());
      this.partRot.push(new THREE.Matrix3());
    }

    const bw = bounds.w || 2.4;
    const bh = bounds.h || 2.4;
    const bd = bounds.d || 2.4;
    const cy = bounds.cy !== undefined ? bounds.cy : bh * 0.5;

    this.uniforms = {
      uVoxelTex: { value: texture },
      uPartCount: { value: this.partCount },
      uPartPos: { value: this.partPos },
      uPartRot: { value: this.partRot },
      uVoxelSize: { value: voxelSize },
      uMVP: { value: new THREE.Matrix4() },
      uInvMVP: { value: new THREE.Matrix4() },
      uModelRot: { value: new THREE.Matrix3() },
      uViewport: { value: new THREE.Vector4(0, 0, 1280, 720) },
      uVirtualHeight: { value: virtualHeight },
      uSunDir: { value: _defaultSun.clone() },
      uOutlineColor: { value: new THREE.Color(outlineColor) },
      uFlash: { value: 0 },
      uTelegraph: { value: 0 },
      uCreaseEnabled: { value: 1.0 },
      uPassMode: { value: _t3PassMode },
    };

    const geo = new THREE.BoxGeometry(bw, bh, bd);
    geo.translate(0, cy, 0);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3 || '300 es',
      vertexShader: T3_VERT,
      fragmentShader: T3_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: true,
      depthTest: true,
      transparent: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = true;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.isT3SpriteStack = true;

    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      if (renderer && typeof renderer.getCurrentViewport === 'function') {
        renderer.getCurrentViewport(_tmpVp);
        this.uniforms.uViewport.value.set(
          _tmpVp.x,
          _tmpVp.y,
          Math.max(1, _tmpVp.z),
          Math.max(1, _tmpVp.w)
        );
      } else if (renderer && renderer.getDrawingBufferSize) {
        renderer.getDrawingBufferSize(_tmpSize);
        this.uniforms.uViewport.value.set(0, 0, Math.max(1, _tmpSize.x), Math.max(1, _tmpSize.y));
      }
      if (camera) {
        _tmpVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.uniforms.uMVP.value.multiplyMatrices(_tmpVP, this.mesh.matrixWorld);
        this.uniforms.uInvMVP.value.copy(this.uniforms.uMVP.value).invert();
      }
      this.uniforms.uModelRot.value.setFromMatrix4(this.mesh.matrixWorld);
      const q = HC.QUALITY;
      if (q) {
        if (q.t3VirtualHeight) this.uniforms.uVirtualHeight.value = q.t3VirtualHeight;
        this.uniforms.uCreaseEnabled.value = q.t3Crease === false ? 0.0 : 1.0;
      }
      this.uniforms.uPassMode.value = _t3PassMode;
    };
  }

  /**
   * Syncs rigid OBB positions & orthonormal rotations directly from the
   * original animated Three.js skeleton nodes relative to `root`.
   */
  syncFromNodes(root, partNodes) {
    if (!root || !partNodes) return;
    root.updateMatrixWorld(true);
    _syncInvRoot.copy(root.matrixWorld).invert();
    const invVs = 1 / this.voxelSize;

    for (let i = 0; i < this.partCount && i < partNodes.length; i++) {
      const node = partNodes[i];
      if (!node) continue;
      _syncRel.multiplyMatrices(_syncInvRoot, node.matrixWorld);
      _syncRel.decompose(_syncPos, _syncQuat, _syncScale);
      _syncRotMat4.makeRotationFromQuaternion(_syncQuat);
      this.partRot[i].setFromMatrix4(_syncRotMat4);

      const cOff = this.partCenters[i];
      if (cOff) {
        _syncCenterOff.copy(cOff).applyMatrix3(this.partRot[i]);
        this.partPos[i].set(
          _syncPos.x * invVs + _syncCenterOff.x,
          _syncPos.y * invVs + _syncCenterOff.y,
          _syncPos.z * invVs + _syncCenterOff.z
        );
      } else {
        this.partPos[i].set(_syncPos.x * invVs, _syncPos.y * invVs, _syncPos.z * invVs);
      }
    }
  }

  setFlash(val) {
    this.uniforms.uFlash.value = Math.max(0, Math.min(1, val || 0));
  }

  setTelegraph(val) {
    this.uniforms.uTelegraph.value = Math.max(0, Math.min(1, val || 0));
  }

  dispose() {
    if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}

// ---- Shared Baked Archetype Cache (baked once directly from original models) ----
const _bakedCache = new Map();

function hideOriginalMeshes(root, excludeMesh) {
  root.traverse((obj) => {
    if (obj === excludeMesh) return;
    if (obj.isMesh && !obj.userData.isT3SpriteStack && !obj.userData.keepVisibleWithT3) {
      obj.visible = false;
    }
  });
}

function getOrBakeArchetype(key, partNodes, voxelSize, root = null) {
  let cached = _bakedCache.get(key);
  if (!cached) {
    cached = bakeRigPartsToAtlas(partNodes, voxelSize, root);
    _bakedCache.set(key, cached);
  }
  return cached;
}

/**
 * Wraps the ORIGINAL Wild Boar rig (`buildVoxelBoarRig`) in Sprite·Stack T3 Hybrid.
 * Bakes directly from the original boar's body, mane, head, snout, tusks, ears, legs, and tail.
 */
function attachT3ToOriginalBoar(rig) {
  const partNodes = [
    rig.body,
    rig.head,
    rig.ears.L,
    rig.ears.R,
    rig.legs.FL,
    rig.legs.FR,
    rig.legs.BL,
    rig.legs.BR,
    rig.tail,
  ];

  // Mark dizzyHalo stars to stay visible when boar is KO'd
  if (rig.dizzyHalo) {
    rig.dizzyHalo.traverse((o) => { o.userData.keepVisibleWithT3 = true; });
  }

  const baked = getOrBakeArchetype('boar', partNodes, 0.048, rig.root);
  const actor = new T3SpriteStackActor({
    texture: baked.texture,
    partCenters: baked.partCenters,
    partCount: baked.partCount,
    voxelSize: baked.voxelSize,
    bounds: { w: 3.0, h: 2.6, d: 3.4, cy: 1.1 },
    outlineColor: 0x1e1410,
    virtualHeight: 270,
  });

  hideOriginalMeshes(rig.root, actor.mesh);
  rig.root.add(actor.mesh);
  actor.syncFromNodes(rig.root, partNodes);

  return { actor, partNodes };
}

/**
 * Wraps the ORIGINAL Small or Big Bandit (`buildSmallBandit` / `buildBigBandit`)
 * in Sprite·Stack T3 Hybrid, preserving 100% of original parts, colors & animations.
 */
function attachT3ToOriginalBandit(built, variant = 'small') {
  const isBig = variant === 'big';
  const p = built.parts;
  const partNodes = [
    p.body,
    p.head,
    p.armL,
    p.foreL,
    p.armR,
    p.foreR,
    p.gripR,
    p.legs[0],
    p.shins[0],
    p.legs[1],
    p.shins[1],
    p.cloak,
  ];

  const voxelSize = isBig ? 0.064 : 0.048;
  const baked = getOrBakeArchetype(isBig ? 'bandit_big' : 'bandit_small', partNodes, voxelSize, built.mesh);
  const actor = new T3SpriteStackActor({
    texture: baked.texture,
    partCenters: baked.partCenters,
    partCount: baked.partCount,
    voxelSize: baked.voxelSize,
    bounds: isBig
      ? { w: 4.4, h: 4.2, d: 4.4, cy: 1.75 }
      : { w: 3.2, h: 3.0, d: 3.2, cy: 1.25 },
    outlineColor: isBig ? 0x141016 : 0x16131a,
    virtualHeight: 270,
  });

  hideOriginalMeshes(built.mesh, actor.mesh);
  built.mesh.add(actor.mesh);
  actor.syncFromNodes(built.mesh, partNodes);

  p.t3Actor = actor;
  p.t3PartNodes = partNodes;
  return { actor, partNodes };
}

function hasAnyMeshDescendant(obj) {
  let found = false;
  obj.traverse((o) => { if (o.isMesh && !o.userData.isT3SpriteStack) found = true; });
  return found;
}

function isDescendantOf(node, ancestor) {
  let cur = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * Automatically selects up to 12 articulated bone nodes from ANY of the 18
 * original Sylvan NPC models, keeping `mesh` as catch-all index 0 so zero
 * sub-meshes are ever dropped.
 */
function collectSylvanPartNodes(mesh, parts) {
  const picked = [];
  const seen = new Set();

  const tryAdd = (obj) => {
    if (!obj || !obj.isObject3D || seen.has(obj) || picked.length >= MAX_PARTS) return;
    if (obj !== mesh && !isDescendantOf(obj, mesh)) return;
    if (!hasAnyMeshDescendant(obj)) return;
    seen.add(obj);
    picked.push(obj);
  };

  tryAdd(mesh);
  if (parts && typeof parts === 'object') {
    const priorityKeys = [
      'body', 'torso', 'chest', 'head',
      'armL', 'leftArm', 'lArm', 'armR', 'rightArm', 'rArm',
      'legs', 'legL', 'leftLeg', 'lLeg', 'legR', 'rightLeg', 'rLeg',
      'weapon', 'sword', 'axe', 'staff', 'bow', 'spear', 'shield', 'book', 'pick', 'hoe', 'club', 'hammer',
      'cape', 'cloak', 'tail', 'wings', 'ears', 'foreL', 'foreR', 'shins',
    ];
    const addVal = (val) => {
      if (!val) return;
      if (Array.isArray(val)) {
        for (const it of val) tryAdd(it);
      } else {
        tryAdd(val);
      }
    };
    for (const k of priorityKeys) {
      if (k in parts) addVal(parts[k]);
    }
    for (const k of Object.keys(parts)) {
      if (picked.length >= MAX_PARTS) break;
      addVal(parts[k]);
    }
  }
  return picked;
}

/**
 * Wraps ANY of the 18 original Sylvan NPC models (stand or sit) in Sprite·Stack
 * T3 Hybrid: bakes once per archetype+pose into a shared 3D RGBA8 texture and
 * reduces each NPC from ~40-90 draw calls down to 1 single draw call!
 */
function attachT3ToOriginalNPC(root, state) {
  if (!root || !state || !state.mesh || !state.role) return null;
  const partNodes = collectSylvanPartNodes(state.mesh, state.parts);
  if (!partNodes.length) return null;

  const roleId = state.role.id || 'npc';
  const pose = state.pose || 'stand';
  const baseH = (HC.NPC_HEIGHT && HC.NPC_HEIGHT[roleId]) || 2.35;
  const targetH = pose === 'sit' ? Math.min(baseH * 0.78, 2.05) : baseH;
  const voxelSize = Math.max(0.042, targetH / 40.0);

  // Temporarily unfold sitting legs during bake so the atlas captures clean neutral legs
  const savedLegRx = [];
  if (pose === 'sit' && Array.isArray(state._legs)) {
    for (let i = 0; i < state._legs.length; i++) {
      savedLegRx.push(state._legs[i].rotation.x);
      state._legs[i].rotation.x = 0;
    }
  }

  const cacheKey = `npc_${roleId}_${pose}`;
  const baked = getOrBakeArchetype(cacheKey, partNodes, voxelSize, root);

  if (savedLegRx.length) {
    for (let i = 0; i < savedLegRx.length; i++) {
      state._legs[i].rotation.x = savedLegRx[i];
    }
  }

  const bw = Math.max(2.2, targetH * 1.45);
  const bh = Math.max(2.0, targetH * 1.28);
  const bd = Math.max(2.2, targetH * 1.45);

  const actor = new T3SpriteStackActor({
    texture: baked.texture,
    partCenters: baked.partCenters,
    partCount: baked.partCount,
    voxelSize: baked.voxelSize,
    bounds: { w: bw, h: bh, d: bd, cy: targetH * 0.56 },
    outlineColor: 0x18151d,
    virtualHeight: (HC.QUALITY && HC.QUALITY.t3VirtualHeight) || 270,
  });

  hideOriginalMeshes(root, actor.mesh);
  root.add(actor.mesh);
  actor.syncFromNodes(root, partNodes);

  state.t3Actor = actor;
  state.t3PartNodes = partNodes;
  root.userData.t3Actor = actor;
  return { actor, partNodes };
}

/**
 * Wraps Solar Relic Stone Golem or Crystal Prism Golem in Sprite·Stack T3 Hybrid
 * (preserving solar core / crystal emissives and smooth animated limbs/halos/shards).
 */
function attachT3ToOriginalGolem(built, variant = 'ruins_golem') {
  if (!built || !built.mesh || !built.parts) return null;
  const isCrystal = variant === 'crystal_golem';
  const p = built.parts;
  const partNodes = isCrystal
    ? [
        p.body,
        p.head,
        p.armL,
        p.foreL,
        p.armR,
        p.foreR,
        p.legs[0],
        p.shins[0],
        p.legs[1],
        p.shins[1],
        ...((p.orbitShards || []).slice(0, 4)),
      ].filter(Boolean)
    : [
        p.body,
        p.head,
        p.innerHaloRing,
        p.outerRing,
        p.shoulderPadL,
        p.armL,
        p.foreL,
        p.shoulderPadR,
        p.armR,
        p.foreR,
        p.legs[0],
        p.shins[0],
        p.legs[1],
        p.shins[1],
      ].filter(Boolean);

  const voxelSize = isCrystal ? 0.084 : 0.088;
  const baked = getOrBakeArchetype(isCrystal ? 'golem_crystal' : 'golem_ruins', partNodes, voxelSize, built.mesh);
  const actor = new T3SpriteStackActor({
    texture: baked.texture,
    partCenters: baked.partCenters,
    partCount: baked.partCount,
    voxelSize: baked.voxelSize,
    bounds: { w: 4.4, h: 4.18, d: 4.4, cy: 2.08 },
    outlineColor: isCrystal ? 0x101324 : 0x1b1612,
    virtualHeight: (HC.QUALITY && HC.QUALITY.t3VirtualHeight) || 360,
  });

  hideOriginalMeshes(built.mesh, actor.mesh);
  built.mesh.add(actor.mesh);
  actor.syncFromNodes(built.mesh, partNodes);

  p.t3Actor = actor;
  p.t3PartNodes = partNodes;
  return { actor, partNodes };
}

/**
 * Wraps the ORIGINAL Forest Rabbit rig (`buildVoxelRabbitRig`) in Sprite·Stack T3 Hybrid.
 */
function attachT3ToOriginalRabbit(rig) {
  if (!rig || !rig.root || !rig.body) return null;
  const partNodes = [
    rig.body,
    rig.head,
    rig.snout,
    rig.ears && rig.ears.L && rig.ears.L.base,
    rig.ears && rig.ears.R && rig.ears.R.base,
    rig.hindLegs && rig.hindLegs.L && rig.hindLegs.L.thigh,
    rig.hindLegs && rig.hindLegs.R && rig.hindLegs.R.thigh,
    rig.frontLegs && rig.frontLegs.L && rig.frontLegs.L.upper,
    rig.frontLegs && rig.frontLegs.R && rig.frontLegs.R.upper,
    rig.tail,
  ].filter(Boolean);

  const baked = getOrBakeArchetype(`rabbit_${rig.palette && rig.palette.id ? rig.palette.id : 'white'}`, partNodes, 0.032, rig.root);
  const actor = new T3SpriteStackActor({
    texture: baked.texture,
    partCenters: baked.partCenters,
    partCount: baked.partCount,
    voxelSize: baked.voxelSize,
    bounds: { w: 1.8, h: 1.9, d: 1.8, cy: 0.78 },
    outlineColor: 0x261d19,
    virtualHeight: (HC.QUALITY && HC.QUALITY.t3VirtualHeight) || 360,
  });

  hideOriginalMeshes(rig.root, actor.mesh);
  rig.root.add(actor.mesh);
  actor.syncFromNodes(rig.root, partNodes);

  return { actor, partNodes };
}

// ---- Universal Screen-Space T3 Hybrid Composite Pass for Buildings & Environments ----
const T3_POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const T3_POST_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform vec3 uOutlineColor;
uniform float uSilStrength;
uniform float uCreaseStrength;
uniform float uQuantSteps;
uniform float uEnabled;

varying vec2 vUv;

float linearizeDepth(float d) {
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / max(0.0001, uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  vec4 baseSample = texture2D(tDiffuse, vUv);
  vec3 col = baseSample.rgb;

  if (uEnabled > 0.5) {
    float dC = texture2D(tDepth, vUv).r;
    if (dC < 0.99985) {
      float zC = linearizeDepth(dC);
      float zL = linearizeDepth(texture2D(tDepth, vUv - vec2(uTexel.x, 0.0)).r);
      float zR = linearizeDepth(texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).r);
      float zD = linearizeDepth(texture2D(tDepth, vUv - vec2(0.0, uTexel.y)).r);
      float zU = linearizeDepth(texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).r);

      // Forward-side depth jump + second-order Laplacian keeps continuous hill slopes 0-outline
      float dzOut = max(0.0, max(max(zL, zR), max(zU, zD)) - zC);
      float lapX = abs(zL + zR - 2.0 * zC);
      float lapY = abs(zU + zD - 2.0 * zC);
      float lap = lapX + lapY;

      // Reject planar sloped terrain/roads where zL < zC < zR symmetrically
      float slopeGate = smoothstep(0.08, 0.24, lap / max(0.28, zC * 0.042));

      float silThresh = max(0.42, zC * 0.055);
      float creaseThresh = max(0.22, zC * 0.030);
      float silMask = smoothstep(silThresh, silThresh * 1.45, dzOut) * slopeGate;
      float creaseMask = smoothstep(creaseThresh, creaseThresh * 1.65, lap) * slopeGate;

      // Neighbor color discontinuity boost helps crisp architectural roof/wall trim edges
      vec3 cL = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 cR = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
      vec3 cU = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
      float colDiff = max(length(col - cL), max(length(col - cR), length(col - cU)));
      creaseMask = max(creaseMask * 0.85, creaseMask * smoothstep(0.03, 0.14, colDiff));

      float distFade = 1.0 - smoothstep(62.0, 125.0, zC);
      float edgeMix = clamp(max(silMask * uSilStrength, creaseMask * uCreaseStrength) * distFade, 0.0, 0.78);
      col = mix(col, uOutlineColor, edgeMix);
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  if (uEnabled > 0.5 && uQuantSteps > 1.0) {
    gl_FragColor.rgb = floor(gl_FragColor.rgb * uQuantSteps + 0.5) / uQuantSteps;
  }
}
`;

function createT3HybridPostProcessor(renderer) {
  if (!renderer || !renderer.capabilities || !renderer.capabilities.isWebGL2) return null;
  const gl = renderer.getContext();
  const hasHalfFloat = !!(
    renderer.extensions && (renderer.extensions.get('EXT_color_buffer_half_float') || renderer.extensions.get('EXT_color_buffer_float'))
  ) || !!(gl && (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')));
  if (!hasHalfFloat) return null;

  const target = new THREE.WebGLRenderTarget(640, 360, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  target.depthTexture = new THREE.DepthTexture(640, 360, THREE.UnsignedIntType);
  target.depthTexture.minFilter = THREE.NearestFilter;
  target.depthTexture.magFilter = THREE.NearestFilter;

  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    tDiffuse: { value: target.texture },
    tDepth: { value: target.depthTexture },
    uTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
    uNear: { value: 0.2 },
    uFar: { value: 450.0 },
    uOutlineColor: { value: new THREE.Color(0x16121b) },
    uSilStrength: { value: 0.72 },
    uCreaseStrength: { value: 0.44 },
    uQuantSteps: { value: 36.0 },
    uEnabled: { value: 1.0 },
  };
  const postMat = new THREE.ShaderMaterial({
    vertexShader: T3_POST_VERT,
    fragmentShader: T3_POST_FRAG,
    uniforms,
    depthWrite: false,
    depthTest: false,
    toneMapped: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);

  let curW = 640;
  let curH = 360;
  const canvasSize = new THREE.Vector2();

  return {
    render(scene, camera) {
      if (!scene || !camera) return;
      const q = HC.QUALITY || {};
      const enabled = q.t3HybridWorld !== false;
      if (!enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      renderer.getSize(canvasSize);
      const aspect = Math.max(0.25, canvasSize.x / Math.max(1, canvasSize.y));
      const vH = Math.max(180, Math.min(540, (q.t3VirtualHeight || 360) | 0));
      const vW = Math.max(180, Math.min(1920, Math.round(vH * aspect)));

      if (vW !== curW || vH !== curH) {
        curW = vW;
        curH = vH;
        target.setSize(vW, vH);
      }

      uniforms.uTexel.value.set(1 / curW, 1 / curH);
      uniforms.uNear.value = camera.near || 0.2;
      uniforms.uFar.value = camera.far || 450.0;
      uniforms.uCreaseStrength.value = q.t3Crease === false ? 0.0 : 0.44;
      uniforms.uSilStrength.value = q.t3Crease === false ? 0.58 : 0.72;
      uniforms.uEnabled.value = 1.0;

      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
      renderer.autoClear = prevAutoClear;
    },
    dispose() {
      target.dispose();
      postMat.dispose();
      quad.geometry.dispose();
    },
  };
}

HC.attachT3ToOriginalNPC = attachT3ToOriginalNPC;
HC.createT3HybridPostProcessor = createT3HybridPostProcessor;

export {
  setT3Pass,
  getT3Pass,
  T3VoxelAtlas,
  T3SpriteStackActor,
  bakeRigPartsToAtlas,
  attachT3ToOriginalBoar,
  attachT3ToOriginalBandit,
  attachT3ToOriginalGolem,
  attachT3ToOriginalRabbit,
  attachT3ToOriginalNPC,
  createT3HybridPostProcessor,
};
