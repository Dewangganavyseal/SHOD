import { HC } from '../hc.js';

const THREE = HC.THREE;

// ============================================================================
// 1. MATH, EXPONENTIAL DAMPING & DETERMINISTIC HASH HELPERS
// ============================================================================

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth(t) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

/**
 * Exponential damping: frame-rate independent smooth transition.
 * Snaps cleanly when dt <= 0 (initial build pose).
 */
function damp(cur, target, rate, dt) {
  if (dt <= 0) return target;
  const k = 1 - Math.exp(-rate * dt);
  return cur + (target - cur) * k;
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function makeJoint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ============================================================================
// 2. COLOR PALETTE (CAVERN SLATE, FROST GRANITE, RADIANT CYAN & AMETHYST)
// ============================================================================

const CG = {
  slateDark: 0x1c2230,
  slate: 0x262d3d,
  granite: 0x374158,
  frost: 0x4b5875,
  frostHi: 0x627192,

  cyanDeep: 0x0891b2,
  cyan: 0x22d3ee,
  cyanBright: 0x67e8f9,
  cyanWhite: 0xb6fbff,

  violetDeep: 0x9333ea,
  violet: 0xc084fc,
  violetBright: 0xd8b4fe,
  violetWhite: 0xf0abfc,
};

const CYAN_PALETTE = {
  deep: CG.cyanDeep,
  mid: CG.cyan,
  bright: CG.cyanBright,
  tip: CG.cyanWhite,
};

const VIOLET_PALETTE = {
  deep: CG.violetDeep,
  mid: CG.violet,
  bright: CG.violetBright,
  tip: CG.violetWhite,
};

// ============================================================================
// 3. PURE-VOXEL BATCHED BUILDER (100% AXIS-ALIGNED BOX GEOMETRY)
// ============================================================================

/**
 * Batches axis-aligned BoxGeometry bricks per (parent, materialKey) into clean
 * vertex-colored BufferGeometries with subtle voxel face shading.
 */
function createVoxelBuilder(isMobile = false) {
  const base = new THREE.BoxGeometry(1, 1, 1);
  const unit = base.toNonIndexed();
  base.dispose();

  const stoneMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x000000,
    emissiveIntensity: 1.0,
  });

  const cyanMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x0e7490,
    emissiveIntensity: 0.75,
  });

  const violetMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x6b21a8,
    emissiveIntensity: 0.75,
  });

  const eyeCoreCyanMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x67e8f9,
    emissiveIntensity: 1.45,
  });

  const coreVioletMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0xd8b4fe,
    emissiveIntensity: 1.45,
  });

  const matMap = {
    stone: stoneMat,
    cyan: cyanMat,
    violet: violetMat,
    coreCyan: eyeCoreCyanMat,
    coreViolet: coreVioletMat,
  };

  const crystalKeys = new Set(['cyan', 'violet', 'coreCyan', 'coreViolet']);
  const materials = [stoneMat, cyanMat, violetMat, eyeCoreCyanMat, coreVioletMat];
  for (const m of materials) {
    m.userData._cgBaseEmissive = m.emissive.clone();
    m.userData._cgBaseIntensity = m.emissiveIntensity;
  }

  const batches = new Map();
  const matrix = new THREE.Matrix4();
  const normalMat = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const posVec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const tint = new THREE.Color();

  const posAttr = unit.attributes.position;
  const normAttr = unit.attributes.normal;

  function box(parent, matKey, w, h, d, color, x = 0, y = 0, z = 0) {
    let parentBatches = batches.get(parent);
    if (!parentBatches) {
      parentBatches = new Map();
      batches.set(parent, parentBatches);
    }
    let data = parentBatches.get(matKey);
    if (!data) {
      data = { p: [], n: [], c: [] };
      parentBatches.set(matKey, data);
    }

    euler.set(0, 0, 0);
    q.setFromEuler(euler);
    posVec.set(x, y, z);
    scaleVec.set(w, h, d);
    matrix.compose(posVec, q, scaleVec);
    normalMat.getNormalMatrix(matrix);
    tint.set(color);

    const isCrystal = crystalKeys.has(matKey);
    const jitter = isCrystal ? 0 : (hash3(x * 13.7, y * 19.3, z * 23.1) - 0.5) * 0.065;

    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
      data.p.push(v.x, v.y, v.z);

      n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
      data.n.push(n.x, n.y, n.z);

      let faceShade = 1.0;
      if (n.y > 0.5) faceShade = isCrystal ? 1.08 : 1.07;
      else if (n.y < -0.5) faceShade = isCrystal ? 0.88 : 0.74;
      else if (Math.abs(n.x) > 0.5) faceShade = isCrystal ? 0.94 : 0.89;
      else faceShade = isCrystal ? 0.99 : 0.97;

      const s = clamp(faceShade + jitter, 0.55, 1.15);
      data.c.push(
        clamp(tint.r * s, 0, 1),
        clamp(tint.g * s, 0, 1),
        clamp(tint.b * s, 0, 1)
      );
    }
  }

  function finish() {
    for (const [parent, parentBatches] of batches) {
      for (const [matKey, data] of parentBatches) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.n, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.c, 3));
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, matMap[matKey]);
        mesh.castShadow = !isMobile && !crystalKeys.has(matKey);
        mesh.receiveShadow = !isMobile;
        parent.add(mesh);
      }
    }
    unit.dispose();
  }

  return {
    box,
    finish,
    materials,
    matMap,
  };
}

// ============================================================================
// 4. STEPPED ORTHOGONAL VOXEL PRIMITIVE HELPERS
// ============================================================================

/**
 * Stepped pixel-stair crystal spire built strictly from axis-aligned voxel boxes.
 */
function voxSpire(
  vb,
  parent,
  matKey,
  x,
  y,
  z,
  baseW,
  height,
  steps,
  palette,
  dirY = 1,
  stepShiftX = 0,
  stepShiftZ = 0,
  coreTipMatKey = null
) {
  const stepH = height / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const w = Math.max(0.036, baseW * (1 - t * 0.76));
    const cy = y + dirY * (i + 0.5) * stepH;
    const cx = x + stepShiftX * i;
    const cz = z + stepShiftZ * i;

    let col = palette.mid;
    let useMat = matKey;
    if (i === 0) col = palette.deep;
    else if (i === steps - 1) {
      col = palette.tip;
      if (coreTipMatKey) useMat = coreTipMatKey;
    } else if (i >= steps - 2) col = palette.bright;

    vb.box(parent, useMat, w, stepH * 1.04, w, col, cx, cy, cz);
  }
}

/**
 * Stepped orthogonal pixel-crystal diamond cluster (zero octahedrons/spheres).
 */
function voxDiamond(vb, parent, mainMat, coreMat, x, y, z, u, palette) {
  // Glowing inner core
  vb.box(parent, coreMat, u * 2.2, u * 2.6, u * 2.2, palette.tip, x, y, z);
  // Stepped mid cross arms
  vb.box(parent, mainMat, u * 3.4, u * 1.6, u * 1.6, palette.mid, x, y, z);
  vb.box(parent, mainMat, u * 1.6, u * 1.6, u * 3.4, palette.mid, x, y, z);
  vb.box(parent, mainMat, u * 1.8, u * 3.8, u * 1.8, palette.bright, x, y, z);
  // Stepped top & bottom pixel points
  vb.box(parent, mainMat, u * 1.1, u * 1.4, u * 1.1, palette.deep, x, y + u * 2.4, z);
  vb.box(parent, mainMat, u * 1.1, u * 1.4, u * 1.1, palette.deep, x, y - u * 2.4, z);
  vb.box(parent, coreMat, u * 0.7, u * 0.8, u * 0.7, palette.tip, x, y + u * 3.2, z);
  vb.box(parent, coreMat, u * 0.7, u * 0.8, u * 0.7, palette.tip, x, y - u * 3.2, z);
}

/**
 * Stepped cyan voxel crystal claw built from descending pixel-stair bricks.
 */
function voxClaw(vb, parent, x, y, z, length, baseW, forwardSign = 1) {
  const segs = 4;
  const segH = length / segs;
  const cols = [CG.cyanDeep, CG.cyan, CG.cyanBright, CG.cyanWhite];
  for (let i = 0; i < segs; i++) {
    const w = Math.max(0.032, baseW * (1 - i * 0.22));
    const sy = y - (i + 0.5) * segH;
    const sz = z + forwardSign * i * 0.022;
    const mk = i === segs - 1 ? 'coreCyan' : 'cyan';
    vb.box(parent, mk, w, segH * 1.08, w * 1.25, cols[i], x, sy, sz);
  }
}

// ============================================================================
// 5. MODEL BUILDER: buildCrystalGolem(isMobile = false)
// ============================================================================

/**
 * Builds the 100% pure-voxel Crystal Golem guardian (~3.60m tall, grounded at y = 0,
 * facing +Z) with Sylvan voxel shading and full BanditMob rig compatibility.
 * @param {boolean} [isMobile=false]
 */
function buildCrystalGolem(isMobile = false) {
  const vb = createVoxelBuilder(!!isMobile);
  const B = vb.box;

  const root = new THREE.Group();
  root.name = 'crystal_golem';

  const LEG_Y = 1.605;
  const BODY_Y = 1.605;

  // --------------------------------------------------------------------------
  // A. ARTICULATED 2-JOINT LEGS, CYAN VOXEL KNEECAPS & CRYSTAL-SPURRED BOOTS
  //    legs: [legL (-X), legR (+X)], shins: [shinL, shinR]
  // --------------------------------------------------------------------------
  const legs = [];
  const shins = [];

  for (const side of [-1, 1]) {
    const leg = makeJoint(root, side * 0.44, LEG_Y, 0);

    // Thigh core & stepped frost-granite plates
    B(leg, 'stone', 0.38, 0.72, 0.38, CG.slateDark, 0, -0.36, 0);
    B(leg, 'stone', 0.46, 0.54, 0.44, CG.slate, 0, -0.34, 0);
    B(leg, 'stone', 0.50, 0.22, 0.48, CG.granite, 0, -0.14, 0);
    B(leg, 'stone', 0.08, 0.44, 0.32, CG.frost, side * 0.24, -0.32, 0);
    B(leg, 'stone', 0.30, 0.16, 0.06, CG.frost, 0, -0.26, 0.23);

    // Embedded outer thigh cyan crystal vein steps
    B(leg, 'cyan', 0.05, 0.12, 0.10, CG.cyanDeep, side * 0.27, -0.24, 0.03);
    B(leg, 'cyan', 0.06, 0.14, 0.08, CG.cyan, side * 0.28, -0.34, 0.05);
    B(leg, 'cyan', 0.04, 0.10, 0.07, CG.cyanBright, side * 0.27, -0.43, 0.04);

    // Knee / Shin Pivot (local y = -0.78 -> world y = 0.80)
    const shin = makeJoint(leg, 0, -0.78, 0);

    // Cyan Voxel Kneecap (stepped stone shield + inlaid diamond cyan crystal)
    B(shin, 'stone', 0.36, 0.24, 0.12, CG.granite, 0, 0.02, 0.22);
    B(shin, 'stone', 0.28, 0.06, 0.14, CG.frost, 0, 0.14, 0.22);
    B(shin, 'stone', 0.28, 0.06, 0.14, CG.frost, 0, -0.10, 0.22);
    B(shin, 'cyan', 0.14, 0.14, 0.06, CG.cyanDeep, 0, 0.02, 0.27);
    B(shin, 'cyan', 0.20, 0.08, 0.05, CG.cyan, 0, 0.02, 0.28);
    B(shin, 'cyan', 0.08, 0.20, 0.05, CG.cyan, 0, 0.02, 0.28);
    B(shin, 'coreCyan', 0.07, 0.07, 0.05, CG.cyanWhite, 0, 0.02, 0.30);

    // Shin column & stepped greave ribs
    B(shin, 'stone', 0.36, 0.54, 0.38, CG.slateDark, 0, -0.31, 0);
    B(shin, 'stone', 0.42, 0.42, 0.42, CG.slate, 0, -0.30, 0.02);
    B(shin, 'stone', 0.16, 0.38, 0.08, CG.frost, 0, -0.30, 0.23);
    B(shin, 'stone', 0.28, 0.36, 0.12, CG.granite, 0, -0.26, -0.20);

    // Crystal-Spurred Stone Boots (sole bottom at y = -0.80 -> grounded at world y = 0.00)
    B(shin, 'stone', 0.54, 0.12, 0.74, CG.slateDark, 0, -0.74, 0.06);
    B(shin, 'stone', 0.50, 0.14, 0.68, CG.slate, 0, -0.64, 0.05);
    B(shin, 'stone', 0.44, 0.14, 0.46, CG.granite, 0, -0.54, 0.12);
    B(shin, 'stone', 0.36, 0.08, 0.26, CG.frost, 0, -0.50, 0.24);

    // Twin stepped stone toe claws with cyan crystal tips
    for (const ts of [-1, 1]) {
      B(shin, 'stone', 0.14, 0.11, 0.14, CG.frost, ts * 0.14, -0.66, 0.41);
      B(shin, 'cyan', 0.08, 0.08, 0.09, CG.cyan, ts * 0.14, -0.65, 0.48);
    }

    // Stepped Heel Crystal Spur (-Z) & Outer Ankle Cyan Spur
    B(shin, 'stone', 0.22, 0.16, 0.14, CG.granite, 0, -0.60, -0.26);
    B(shin, 'violet', 0.12, 0.14, 0.12, CG.violetDeep, 0, -0.58, -0.34);
    B(shin, 'violet', 0.08, 0.12, 0.10, CG.violet, 0, -0.52, -0.40);
    B(shin, 'coreViolet', 0.05, 0.10, 0.08, CG.violetBright, 0, -0.46, -0.45);

    B(shin, 'stone', 0.12, 0.14, 0.16, CG.granite, side * 0.26, -0.56, -0.04);
    B(shin, 'cyan', 0.10, 0.12, 0.10, CG.cyanDeep, side * 0.32, -0.52, -0.06);
    B(shin, 'cyan', 0.08, 0.12, 0.08, CG.cyan, side * 0.36, -0.44, -0.08);
    B(shin, 'coreCyan', 0.05, 0.10, 0.05, CG.cyanBright, side * 0.39, -0.36, -0.09);

    legs.push(leg);
    shins.push(shin);
  }

  // --------------------------------------------------------------------------
  // B. TORSO, PELVIS & RECESSED CHEST CAVITY
  // --------------------------------------------------------------------------
  const body = makeJoint(root, 0, BODY_Y, 0);

  // Pelvis & belt monolith
  const pelvis = makeJoint(body, 0, 0, 0);
  B(pelvis, 'stone', 0.78, 0.28, 0.50, CG.slateDark, 0, 0.10, 0);
  B(pelvis, 'stone', 0.98, 0.18, 0.58, CG.slate, 0, 0.10, 0);
  B(pelvis, 'stone', 1.02, 0.07, 0.62, CG.frost, 0, 0.18, 0);
  // Front loin armor monolith + cyan belt diamond
  B(pelvis, 'stone', 0.36, 0.34, 0.12, CG.granite, 0, -0.02, 0.28);
  B(pelvis, 'stone', 0.24, 0.14, 0.10, CG.frost, 0, -0.18, 0.27);
  B(pelvis, 'cyan', 0.12, 0.12, 0.05, CG.cyan, 0, 0.10, 0.33);
  B(pelvis, 'coreCyan', 0.06, 0.06, 0.04, CG.cyanWhite, 0, 0.10, 0.35);
  // Side hip tassets
  for (const s of [-1, 1]) {
    B(pelvis, 'stone', 0.14, 0.30, 0.44, CG.granite, s * 0.54, 0.02, 0);
    B(pelvis, 'stone', 0.10, 0.22, 0.34, CG.frost, s * 0.58, -0.06, 0);
    B(pelvis, 'violet', 0.05, 0.14, 0.10, CG.violet, s * 0.61, 0.02, 0.04);
  }

  // Tapered abdomen / cavern-slate waist column
  B(body, 'stone', 0.86, 0.32, 0.54, CG.slateDark, 0, 0.39, 0);
  for (const s of [-1, 1]) {
    B(body, 'stone', 0.28, 0.24, 0.58, CG.slate, s * 0.33, 0.39, 0);
  }
  B(body, 'stone', 0.72, 0.08, 0.10, CG.granite, 0, 0.33, 0.26);
  B(body, 'stone', 0.76, 0.08, 0.10, CG.frost, 0, 0.44, 0.27);

  // Upper torso monolith framing the truly RECESSED chest cavity
  // Rear torso block & shoulder bridge
  B(body, 'stone', 1.38, 0.68, 0.44, CG.slate, 0, 0.86, -0.10);
  B(body, 'stone', 1.56, 0.20, 0.72, CG.granite, 0, 1.15, -0.02);
  B(body, 'stone', 1.12, 0.12, 0.58, CG.frost, 0, 1.25, -0.02);
  // Deep recessed cavern back wall behind the dual hearts
  B(body, 'stone', 0.66, 0.52, 0.10, CG.slateDark, 0, 0.83, 0.15);

  // Left & Right front chest armor pillars framing the cavity
  for (const s of [-1, 1]) {
    B(body, 'stone', 0.44, 0.58, 0.34, CG.slate, s * 0.50, 0.84, 0.25);
    B(body, 'stone', 0.36, 0.50, 0.12, CG.granite, s * 0.48, 0.84, 0.40);
    B(body, 'stone', 0.38, 0.12, 0.14, CG.frost, s * 0.49, 1.05, 0.42);
    B(body, 'stone', 0.24, 0.14, 0.10, CG.frostHi, s * 0.52, 0.72, 0.42);
    // Embedded glowing chest edge rune strips
    B(body, s < 0 ? 'cyan' : 'violet', 0.06, 0.24, 0.05, s < 0 ? CG.cyan : CG.violet, s * 0.35, 0.84, 0.44);
  }

  // Lower & upper recessed cavity arches + inward crystal rim teeth
  B(body, 'stone', 0.84, 0.14, 0.26, CG.granite, 0, 0.54, 0.32);
  B(body, 'stone', 0.64, 0.08, 0.12, CG.frost, 0, 0.54, 0.42);
  B(body, 'stone', 0.90, 0.14, 0.26, CG.granite, 0, 1.12, 0.32);
  B(body, 'stone', 0.70, 0.08, 0.12, CG.frost, 0, 1.11, 0.42);

  // Inward cavity crystal rim teeth
  B(body, 'cyan', 0.07, 0.09, 0.07, CG.cyan, -0.25, 1.02, 0.33);
  B(body, 'violet', 0.07, 0.09, 0.07, CG.violet, 0.25, 1.02, 0.33);
  B(body, 'violet', 0.07, 0.08, 0.07, CG.violetDeep, -0.23, 0.63, 0.33);
  B(body, 'cyan', 0.07, 0.08, 0.07, CG.cyanDeep, 0.23, 0.63, 0.33);

  // --------------------------------------------------------------------------
  // C. DUAL HEART VOXEL PRISM CORE (heartCyan & heartViolet pulsing independently)
  // --------------------------------------------------------------------------
  const coreCrystal = makeJoint(body, 0, 0.83, 0.31);
  const heartCyan = makeJoint(coreCrystal, -0.105, 0.035, 0.00);
  const heartViolet = makeJoint(coreCrystal, 0.105, -0.035, 0.015);

  voxDiamond(vb, heartCyan, 'cyan', 'coreCyan', 0, 0, 0, 0.036, CYAN_PALETTE);
  voxDiamond(vb, heartViolet, 'violet', 'coreViolet', 0, 0, 0, 0.036, VIOLET_PALETTE);

  // --------------------------------------------------------------------------
  // D. 6 DORSAL VOXEL CRYSTAL SPINES (erupting from stone sockets on upper back)
  // --------------------------------------------------------------------------
  const spineConfigs = [
    // Left fan (i = 0, 1, 2)
    { pos: [-0.22, 1.14, -0.34], rot: [-0.30, 0.12, 0.22], baseW: 0.17, h: 0.76, steps: 6, isCyan: true },
    { pos: [-0.46, 0.96, -0.36], rot: [-0.44, 0.20, 0.50], baseW: 0.15, h: 0.66, steps: 5, isCyan: false },
    { pos: [-0.32, 0.72, -0.36], rot: [-0.62, 0.14, 0.34], baseW: 0.13, h: 0.50, steps: 5, isCyan: true },
    // Right fan (i = 3, 4, 5)
    { pos: [0.22, 1.14, -0.34], rot: [-0.30, -0.12, -0.22], baseW: 0.17, h: 0.76, steps: 6, isCyan: false },
    { pos: [0.46, 0.96, -0.36], rot: [-0.44, -0.20, -0.50], baseW: 0.15, h: 0.66, steps: 5, isCyan: true },
    { pos: [0.32, 0.72, -0.36], rot: [-0.62, -0.14, -0.34], baseW: 0.13, h: 0.50, steps: 5, isCyan: false },
  ];

  const crystalSpines = [];
  for (let i = 0; i < spineConfigs.length; i++) {
    const sc = spineConfigs[i];
    const sp = makeJoint(body, sc.pos[0], sc.pos[1], sc.pos[2]);
    sp.rotation.set(sc.rot[0], sc.rot[1], sc.rot[2]);
    sp.userData.baseRot = { x: sc.rot[0], y: sc.rot[1], z: sc.rot[2] };

    // Stone dorsal socket collar
    B(sp, 'stone', sc.baseW * 1.45, 0.12, sc.baseW * 1.45, CG.slateDark, 0, 0.02, 0);
    B(sp, 'stone', sc.baseW * 1.25, 0.10, sc.baseW * 1.25, CG.granite, 0, 0.09, 0);

    // Stepped dorsal crystal spire
    voxSpire(
      vb,
      sp,
      sc.isCyan ? 'cyan' : 'violet',
      0,
      0.11,
      0,
      sc.baseW,
      sc.h,
      sc.steps,
      sc.isCyan ? CYAN_PALETTE : VIOLET_PALETTE,
      1,
      0,
      0,
      sc.isCyan ? 'coreCyan' : 'coreViolet'
    );
    crystalSpines.push(sp);
  }

  // --------------------------------------------------------------------------
  // E. 4 ORBITING VOXEL CRYSTAL SHARDS (stepped pixel-diamond blocks)
  // --------------------------------------------------------------------------
  const orbitConfigs = [
    { angle: 0.25, radius: 1.20, baseY: 0.94, speed: 1.08, phase: 0.0, isCyan: true },
    { angle: 1.82, radius: 1.26, baseY: 0.78, speed: 1.08, phase: 1.57, isCyan: false },
    { angle: 3.39, radius: 1.20, baseY: 0.98, speed: 1.08, phase: 3.14, isCyan: true },
    { angle: 4.96, radius: 1.26, baseY: 0.80, speed: 1.08, phase: 4.71, isCyan: false },
  ];

  const orbitShards = [];
  for (let i = 0; i < orbitConfigs.length; i++) {
    const oc = orbitConfigs[i];
    const shard = makeJoint(
      body,
      Math.cos(oc.angle) * oc.radius,
      oc.baseY,
      Math.sin(oc.angle) * oc.radius
    );
    shard.userData = {
      angle: oc.angle,
      radius: oc.radius,
      baseY: oc.baseY,
      speed: oc.speed,
      phase: oc.phase,
    };

    voxDiamond(
      vb,
      shard,
      oc.isCyan ? 'cyan' : 'violet',
      oc.isCyan ? 'coreCyan' : 'coreViolet',
      0,
      0,
      0,
      0.044,
      oc.isCyan ? CYAN_PALETTE : VIOLET_PALETTE
    );
    // Tiny stone rune collar block hugging the center of the orbiting shard
    B(shard, 'stone', 0.16, 0.04, 0.16, CG.frost, 0, 0, 0);
    orbitShards.push(shard);
  }

  // --------------------------------------------------------------------------
  // F. STEPPED MONOLITH CAVERN-STONE HEAD, PIXEL EYES & JAGGED CRYSTAL CROWN
  //    head pivot at body local y = 1.32 -> world y = 2.90m; crown tip = 3.60m
  // --------------------------------------------------------------------------
  const head = makeJoint(body, 0, 1.32, 0.02);

  // Recessed stone neck collar
  B(head, 'stone', 0.42, 0.12, 0.40, CG.slateDark, 0, -0.02, 0);
  B(head, 'stone', 0.46, 0.06, 0.44, CG.granite, 0, 0.02, 0);

  // Cavern-stone monolith cranium & jaw
  B(head, 'stone', 0.46, 0.14, 0.46, CG.slate, 0, 0.10, 0);
  B(head, 'stone', 0.30, 0.10, 0.10, CG.granite, 0, 0.08, 0.25);
  for (const s of [-1, 1]) {
    B(head, 'stone', 0.08, 0.24, 0.34, CG.frost, s * 0.25, 0.20, 0.02);
  }
  // Shadowed eye visor recess
  B(head, 'stone', 0.46, 0.12, 0.44, CG.slateDark, 0, 0.24, 0.01);

  // Glowing square cyan pixel eyes under heavy stepped brow
  for (const s of [-1, 1]) {
    B(head, 'cyan', 0.09, 0.08, 0.04, CG.cyan, s * 0.115, 0.245, 0.235);
    B(head, 'coreCyan', 0.05, 0.05, 0.04, CG.cyanWhite, s * 0.115, 0.245, 0.250);
  }

  // Heavy stepped brow overhang & upper cranium tiers
  B(head, 'stone', 0.52, 0.12, 0.52, CG.granite, 0, 0.36, 0.02);
  B(head, 'stone', 0.54, 0.07, 0.12, CG.frost, 0, 0.36, 0.26);
  B(head, 'stone', 0.44, 0.10, 0.44, CG.slate, 0, 0.45, -0.01);
  B(head, 'stone', 0.36, 0.06, 0.36, CG.frost, 0, 0.49, -0.01);

  // Jagged Voxel Crystal Crown (staggered pixel columns in cyan & violet -> top ~y=0.70 => 3.60m!)
  // Central cyan crown spire
  voxSpire(vb, head, 'cyan', 0, 0.46, 0.02, 0.12, 0.26, 4, CYAN_PALETTE, 1, 0, 0, 'coreCyan');
  // Twin flanking violet crown horns
  for (const s of [-1, 1]) {
    voxSpire(
      vb,
      head,
      'violet',
      s * 0.14,
      0.44,
      0.04,
      0.10,
      0.21,
      4,
      VIOLET_PALETTE,
      1,
      s * 0.018,
      0,
      'coreViolet'
    );
    // Secondary rear-side cyan pixel spike
    voxSpire(
      vb,
      head,
      'cyan',
      s * 0.12,
      0.44,
      -0.12,
      0.08,
      0.16,
      3,
      CYAN_PALETTE,
      1,
      s * 0.01,
      -0.012,
      'coreCyan'
    );
  }
  // Forehead amethyst crown gem & rear center violet tooth
  B(head, 'coreViolet', 0.06, 0.08, 0.05, CG.violetWhite, 0, 0.42, 0.25);
  voxSpire(vb, head, 'violet', 0, 0.45, -0.15, 0.09, 0.18, 3, VIOLET_PALETTE, 1, 0, -0.014, 'coreViolet');

  // --------------------------------------------------------------------------
  // G. LEFT ARM (armL + foreL ending in 3 STEPPED CYAN VOXEL CRYSTAL CLAWS)
  // --------------------------------------------------------------------------
  const armL = makeJoint(body, -0.92, 1.00, 0);
  // Massive stepped shoulder pauldron
  B(armL, 'stone', 0.56, 0.32, 0.56, CG.slate, -0.04, 0.06, 0);
  B(armL, 'stone', 0.46, 0.18, 0.46, CG.granite, -0.06, 0.22, 0);
  B(armL, 'stone', 0.34, 0.10, 0.34, CG.frost, -0.08, 0.31, 0);
  // Pauldron stepped crystal spikes (amethyst + cyan)
  voxSpire(vb, armL, 'violet', -0.08, 0.28, 0.04, 0.13, 0.34, 4, VIOLET_PALETTE, 1, -0.025, 0, 'coreViolet');
  voxSpire(vb, armL, 'cyan', -0.18, 0.20, 0.12, 0.10, 0.24, 3, CYAN_PALETTE, 1, -0.025, 0.015, 'coreCyan');
  voxSpire(vb, armL, 'violet', -0.12, 0.22, -0.14, 0.10, 0.24, 3, VIOLET_PALETTE, 1, -0.02, -0.015, 'coreViolet');

  // Upper arm stone block & elbow joint
  B(armL, 'stone', 0.34, 0.46, 0.36, CG.slateDark, 0, -0.30, 0);
  B(armL, 'stone', 0.38, 0.34, 0.38, CG.slate, 0, -0.28, 0);
  B(armL, 'stone', 0.10, 0.24, 0.24, CG.frost, -0.19, -0.28, 0);

  const foreL = makeJoint(armL, 0, -0.56, 0);
  // Heavy gauntlet forearm + outer stone fin + crystal conduit
  B(foreL, 'stone', 0.34, 0.46, 0.36, CG.slateDark, 0, -0.24, 0);
  B(foreL, 'stone', 0.40, 0.40, 0.40, CG.slate, 0, -0.25, 0);
  B(foreL, 'stone', 0.44, 0.14, 0.44, CG.granite, 0, -0.44, 0);
  B(foreL, 'stone', 0.08, 0.34, 0.22, CG.frost, -0.21, -0.24, -0.02);
  B(foreL, 'violet', 0.06, 0.26, 0.09, CG.violet, -0.23, -0.24, 0.02);

  // Knuckle block + 3 STEPPED CYAN VOXEL CRYSTAL CLAWS
  B(foreL, 'stone', 0.36, 0.14, 0.32, CG.granite, 0, -0.52, 0.04);
  voxClaw(vb, foreL, -0.12, -0.56, 0.06, 0.34, 0.085, 1);
  voxClaw(vb, foreL, 0.00, -0.56, 0.09, 0.39, 0.095, 1);
  voxClaw(vb, foreL, 0.12, -0.56, 0.06, 0.33, 0.085, 1);
  // Inner thumb crystal claw
  voxClaw(vb, foreL, 0.17, -0.50, 0.15, 0.22, 0.075, 1);

  // --------------------------------------------------------------------------
  // H. RIGHT ARM & HEAVY VOXEL CRYSTAL BATTLE-AXE / CLEAVER (armR + foreR + weaponR)
  // --------------------------------------------------------------------------
  const armR = makeJoint(body, 0.92, 1.00, 0);
  // Asymmetric massive right pauldron
  B(armR, 'stone', 0.60, 0.34, 0.60, CG.slate, 0.05, 0.06, 0);
  B(armR, 'stone', 0.50, 0.20, 0.50, CG.granite, 0.07, 0.23, 0);
  B(armR, 'stone', 0.38, 0.10, 0.38, CG.frost, 0.09, 0.32, 0);
  // Pauldron stepped crystal spikes (cyan dominant + amethyst)
  voxSpire(vb, armR, 'cyan', 0.10, 0.30, 0.02, 0.14, 0.40, 5, CYAN_PALETTE, 1, 0.028, 0, 'coreCyan');
  voxSpire(vb, armR, 'cyan', 0.20, 0.22, 0.14, 0.11, 0.28, 4, CYAN_PALETTE, 1, 0.028, 0.015, 'coreCyan');
  voxSpire(vb, armR, 'violet', 0.12, 0.24, -0.15, 0.11, 0.28, 4, VIOLET_PALETTE, 1, 0.022, -0.015, 'coreViolet');

  // Upper arm stone sleeve
  B(armR, 'stone', 0.36, 0.46, 0.38, CG.slateDark, 0, -0.30, 0);
  B(armR, 'stone', 0.40, 0.34, 0.40, CG.slate, 0, -0.28, 0);
  B(armR, 'stone', 0.10, 0.24, 0.24, CG.frost, 0.20, -0.28, 0);

  const foreR = makeJoint(armR, 0, -0.56, 0);
  // Heavy right gauntlet bracer & clenched fist gripping battle-axe
  B(foreR, 'stone', 0.36, 0.46, 0.38, CG.slateDark, 0, -0.24, 0);
  B(foreR, 'stone', 0.42, 0.40, 0.42, CG.slate, 0, -0.25, 0);
  B(foreR, 'stone', 0.44, 0.16, 0.44, CG.granite, 0, -0.45, 0);
  B(foreR, 'stone', 0.08, 0.34, 0.22, CG.frost, 0.22, -0.24, -0.02);
  B(foreR, 'cyan', 0.06, 0.26, 0.09, CG.cyan, 0.24, -0.24, 0.02);
  // Heavy clenched stone fingers wrapping the handle
  B(foreR, 'stone', 0.28, 0.20, 0.26, CG.granite, 0, -0.52, 0.03);
  B(foreR, 'stone', 0.22, 0.14, 0.10, CG.frost, 0, -0.52, 0.15);

  // Heavy Voxel Crystal Battle-Axe / Cleaver (`weaponR`) — haft extends +Z forward, blade edge faces -Y
  const weaponR = makeJoint(foreR, 0, -0.52, 0.03);

  // Carved stone shaft along +Z & frost-granite grip collars flanking fist (z = 0)
  B(weaponR, 'stone', 0.11, 0.11, 1.42, CG.slateDark, 0, 0, 0.35);
  B(weaponR, 'stone', 0.145, 0.145, 0.09, CG.granite, 0, 0, -0.15);
  B(weaponR, 'stone', 0.145, 0.145, 0.09, CG.granite, 0, 0, 0.16);
  B(weaponR, 'stone', 0.165, 0.165, 0.09, CG.frost, 0, 0, -0.34);
  // Rear pommel stepped amethyst spike (-Z behind wrist)
  B(weaponR, 'violet', 0.11, 0.11, 0.08, CG.violetDeep, 0, 0, -0.42);
  B(weaponR, 'violet', 0.08, 0.08, 0.08, CG.violet, 0, 0, -0.49);
  B(weaponR, 'coreViolet', 0.05, 0.05, 0.07, CG.violetWhite, 0, 0, -0.56);
  // Front shaft stepped cyan spear tip (+Z ahead of axe socket)
  B(weaponR, 'cyan', 0.11, 0.11, 0.10, CG.cyanDeep, 0, 0, 1.09);
  B(weaponR, 'cyan', 0.08, 0.08, 0.10, CG.cyan, 0, 0, 1.18);
  B(weaponR, 'coreCyan', 0.05, 0.05, 0.09, CG.cyanWhite, 0, 0, 1.26);

  // Heavy stone axe-head collar socket (at z = +0.76)
  B(weaponR, 'stone', 0.20, 0.24, 0.34, CG.slate, 0, 0, 0.76);
  B(weaponR, 'stone', 0.24, 0.18, 0.24, CG.frost, 0, 0, 0.76);
  B(weaponR, 'violet', 0.25, 0.10, 0.12, CG.violet, 0, 0, 0.76);

  // Stepped Crescent Crystal Cleaver Blade (-Y chopping edge for forward/downward cleave)
  B(weaponR, 'violet', 0.14, 0.10, 0.38, CG.violetDeep, 0, -0.14, 0.76);
  B(weaponR, 'cyan', 0.12, 0.10, 0.48, CG.cyanDeep, 0, -0.23, 0.76);
  B(weaponR, 'cyan', 0.10, 0.10, 0.62, CG.cyan, 0, -0.32, 0.76);
  B(weaponR, 'cyan', 0.075, 0.09, 0.76, CG.cyanBright, 0, -0.41, 0.76);
  // Razor pixel-stepped cutting teeth along -Y leading edge
  B(weaponR, 'coreCyan', 0.05, 0.07, 0.36, CG.cyanWhite, 0, -0.48, 0.76);
  B(weaponR, 'coreCyan', 0.05, 0.07, 0.14, CG.cyanWhite, 0, -0.47, 1.08);
  B(weaponR, 'coreCyan', 0.05, 0.07, 0.14, CG.cyanWhite, 0, -0.47, 0.44);
  // Front & rear crescent blade wing horns
  B(weaponR, 'cyan', 0.08, 0.09, 0.10, CG.cyan, 0, -0.32, 1.05);
  B(weaponR, 'cyan', 0.08, 0.09, 0.10, CG.cyan, 0, -0.32, 0.47);

  // Top counter-balance stepped amethyst pick (+Y back spike at z = +0.76)
  B(weaponR, 'violet', 0.13, 0.10, 0.20, CG.violetDeep, 0, 0.14, 0.76);
  B(weaponR, 'violet', 0.10, 0.10, 0.14, CG.violet, 0, 0.23, 0.76);
  B(weaponR, 'coreViolet', 0.07, 0.09, 0.08, CG.violetWhite, 0, 0.31, 0.76);

  vb.finish();

  const parts = {
    body,
    head,
    armL,
    foreL,
    armR,
    foreR,
    weaponR,
    legs,
    shins,
    pelvis,
    coreCrystal,
    heartCyan,
    heartViolet,
    coreCyan: heartCyan,
    coreAmethyst: heartViolet,
    crystalSpines,
    orbitShards,
    crystalMats: [vb.matMap.cyan, vb.matMap.violet, vb.matMap.coreCyan, vb.matMap.coreViolet],
    bodyY: BODY_Y,
    legY: LEG_Y,
  };

  animateCrystalGolem(
    {
      mesh: root,
      parts,
      material: vb.materials,
      vel: { x: 0, z: 0 },
      flash: 0,
      swing: 0,
      telegraph: 0,
      target: null,
      dead: false,
      state: 'idle',
    },
    0
  );

  return { mesh: root, parts, material: vb.materials, materials: vb.materials };
}

// ============================================================================
// 6. HIT FLASH HANDLER (Red flash + clean crystal emissive restoration)
// ============================================================================

function collectMaterials(st, out) {
  const pushMat = (m) => {
    if (m && typeof m === 'object' && m.emissive && out.indexOf(m) === -1) {
      out.push(m);
    }
  };
  const inspect = (entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      for (let i = 0; i < entry.length; i++) inspect(entry[i]);
    } else {
      pushMat(entry);
    }
  };

  inspect(st.material);
  inspect(st.materials);
  if (out.length === 0 && st.mesh && typeof st.mesh.traverse === 'function') {
    st.mesh.traverse((o) => {
      if (o && o.material) inspect(o.material);
    });
  }
}

function applyHitFlash(st, crystalPulse = 1.0) {
  const flashing = !!(st.flash && st.flash > 0);
  const mats = st._cgMats || (st._cgMats = []);
  if (mats.length === 0 || st._cgMatRef !== st.material) {
    mats.length = 0;
    st._cgMatRef = st.material;
    collectMaterials(st, mats);
  }

  for (let i = 0; i < mats.length; i++) {
    const m = mats[i];
    if (!m.userData) m.userData = {};
    if (!m.userData._cgBaseEmissive) {
      m.userData._cgBaseEmissive = m.emissive.clone();
      m.userData._cgBaseIntensity = m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1.0;
    }

    if (flashing) {
      m.emissive.setHex(0xd93848);
      if (m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = Math.max(m.userData._cgBaseIntensity, 1.35);
      }
    } else {
      m.emissive.copy(m.userData._cgBaseEmissive);
      if (m.emissiveIntensity !== undefined) {
        const baseI = m.userData._cgBaseIntensity;
        const isEmissiveCrystal = m.userData._cgBaseEmissive.getHex() !== 0x000000;
        m.emissiveIntensity = isEmissiveCrystal ? baseI * crystalPulse : baseI;
      }
    }
  }
}

// ============================================================================
// 7. SMOOTH EXPONENTIALLY-DAMPED ANIMATOR: animateCrystalGolem(st, dt)
// ============================================================================

/**
 * Smoothly animates the pure-voxel Crystal Golem across idle, walk/stalk,
 * attack_windup, attack_strike, attack_recover, die, and hit-flash states.
 * @param {object} st
 * @param {number} dt
 */
function animateCrystalGolem(st, dt) {
  if (!st || !st.parts || !st.parts.body) return;
  const P = st.parts;

  const safeDt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
  const t = (st._t = (st._t || 0) + safeDt);

  const yaw = st.mesh && st.mesh.rotation && Number.isFinite(st.mesh.rotation.y) ? st.mesh.rotation.y : 0;
  const vx = st.vel && Number.isFinite(st.vel.x) ? st.vel.x : 0;
  const vz = st.vel && Number.isFinite(st.vel.z) ? st.vel.z : 0;
  const rawSp = Math.hypot(vx, vz);

  const isDead = !!(
    st.dead ||
    st.state === 'die' ||
    (typeof st.hp === 'number' && st.hp <= 0)
  );

  const anim =
    st._crystalGolemAnim ||
    (st._crystalGolemAnim = {
      speedNorm: 0,
      gaitBlend: 0,
      combatBlend: 0,
      telegraphBlend: 0,
      swingBlend: 0,
      recoverBlend: 0,
      dieBlend: 0,
      turnLean: 0,
      headTrackYaw: 0,
      yaw,
      stepPhase: 0,
      heartPhaseCyan: 0,
      heartPhaseViolet: 1.7,
      atkActive: false,
      atkT: 0,
      lastSwing: 0,
      lastState: st.state || 'idle',
      windCarry: 0,
      bodyX: 0,
      bodyY: P.bodyY || 1.605,
      bodyZ: 0,
      bodyRX: 0,
      bodyRY: 0,
      bodyRZ: 0,
      headY: 1.32,
      headRX: 0,
      headRY: 0,
      headRZ: 0,
      armLRX: -0.14,
      armLRY: 0.10,
      armLRZ: -0.16,
      foreLRX: -0.42,
      foreLRY: 0.08,
      armRRX: -0.14,
      armRRY: -0.06,
      armRRZ: 0.18,
      foreRRX: -0.50,
      foreRRY: -0.04,
      foreRRZ: -0.06,
      legLRX: -0.04,
      legLRZ: -0.04,
      legRRX: -0.04,
      legRRZ: 0.04,
      shinLRX: 0.08,
      shinRRX: 0.08,
    });

  // --- 1. Exponentially Damped State Blends ---
  const stateName = st.state || 'idle';
  const walkFromState = !isDead && stateName === 'walk' ? 0.55 : 0;
  const targetSpeedNorm = isDead ? 0 : Math.max(clamp(rawSp / 2.0, 0, 1), walkFromState);
  const targetGait = isDead ? 0 : Math.max(clamp(rawSp / 1.15, 0, 1), walkFromState);
  const targetCombat = !isDead && st.target ? 1 : 0;

  let teleInput = clamp(st.telegraph || 0, 0, 1);
  if (!isDead && stateName === 'attack_windup' && teleInput < 0.05) {
    teleInput = 0.85;
  }
  const targetTele = isDead ? 0 : smooth(teleInput);

  anim.speedNorm = damp(anim.speedNorm, targetSpeedNorm, 7.5, safeDt);
  anim.gaitBlend = damp(anim.gaitBlend, targetGait, 8.5, safeDt);
  anim.combatBlend = damp(anim.combatBlend, targetCombat, 6.0, safeDt);
  anim.telegraphBlend = damp(anim.telegraphBlend, targetTele, 11.5, safeDt);
  anim.dieBlend = damp(anim.dieBlend, isDead ? 1 : 0, 5.2, safeDt);

  const yawDiff = wrapAngle(yaw - anim.yaw);
  const instTurn = safeDt > 0.0005 ? clamp(yawDiff / safeDt, -4.0, 4.0) * 0.042 : 0;
  anim.turnLean = damp(anim.turnLean, isDead ? 0 : instTurn, 7.5, safeDt);
  anim.yaw = yaw;

  // --- 2. Heavy Crystal Battle-Axe Cleave Envelope ---
  const curSwing = st.swing || 0;
  const enteredStrikeState = !isDead && stateName === 'attack_strike' && anim.lastState !== 'attack_strike';
  const swingTriggered =
    !isDead &&
    curSwing > 0 &&
    (anim.lastSwing <= 0 || curSwing > anim.lastSwing + 0.02) &&
    !(stateName === 'attack_strike' && anim.atkActive && anim.atkT < 0.25);

  if (enteredStrikeState || swingTriggered) {
    anim.atkActive = true;
    anim.atkT = 0;
    anim.windCarry = Math.max(anim.telegraphBlend, 0.82);
  }
  anim.lastSwing = curSwing;
  anim.lastState = stateName;

  const ATK_DUR = 0.72;
  const STRIKE_PEAK_T = 0.20;
  let slashTarget = 0;
  let recoverTarget = stateName === 'attack_recover' && !isDead ? 0.55 : 0;
  let windEffort = anim.telegraphBlend;

  if (anim.atkActive) {
    anim.atkT += safeDt;
    if (anim.atkT >= ATK_DUR || isDead) {
      anim.atkActive = false;
      anim.atkT = 0;
      anim.windCarry = 0;
    } else {
      const at = anim.atkT;
      if (at < STRIKE_PEAK_T) {
        const u = clamp(at / STRIKE_PEAK_T, 0, 1);
        const arc = 1 - Math.pow(1 - u, 2.35);
        slashTarget = arc;
        recoverTarget = Math.max(recoverTarget, arc * 0.30);
        windEffort = Math.max(windEffort, anim.windCarry * (1 - arc));
      } else {
        const u = clamp((at - STRIKE_PEAK_T) / (ATK_DUR - STRIKE_PEAK_T), 0, 1);
        const overshoot = Math.sin(Math.min(1, u * 2.2) * Math.PI * 0.5) * 0.14;
        const easeDecay = Math.pow(1 - u, 2.1);
        slashTarget = clamp((1.0 + overshoot) * easeDecay, 0, 1.14);
        recoverTarget = Math.max(recoverTarget, Math.sin(u * Math.PI) * 0.85);
        windEffort = 0;
      }
    }
  }

  anim.swingBlend = damp(anim.swingBlend, isDead ? 0 : slashTarget, slashTarget > anim.swingBlend ? 24.0 : 8.5, safeDt);
  anim.recoverBlend = damp(anim.recoverBlend, recoverTarget, 8.0, safeDt);

  const dieW = clamp(anim.dieBlend, 0, 1);
  const alive = 1 - dieW;
  const windW = clamp(windEffort * alive, 0, 1);
  const strikeW = clamp(anim.swingBlend * alive, 0, 1.14);
  const recoverW = clamp(anim.recoverBlend * alive, 0, 1);
  const atkMute = clamp(1 - Math.max(windW, Math.min(1, strikeW)), 0, 1);

  // --- 3. Dual Heart Voxel Prism Independent Pulsing & Hit Flash ---
  const energyRate = (1.0 + 1.1 * windW + 1.5 * Math.min(1, strikeW)) * alive;
  anim.heartPhaseCyan = (anim.heartPhaseCyan + safeDt * (2.6 + 2.8 * energyRate)) % TAU;
  anim.heartPhaseViolet = (anim.heartPhaseViolet + safeDt * (3.1 + 3.0 * energyRate)) % TAU;

  const waveC = Math.sin(anim.heartPhaseCyan);
  const waveV = Math.sin(anim.heartPhaseViolet);
  const pulseIntensity = clamp(
    (0.92 + 0.14 * waveC + 0.10 * waveV + 0.42 * windW + 0.48 * Math.min(1, strikeW)) * (0.20 + 0.80 * alive),
    0.14,
    2.1
  );
  applyHitFlash(st, pulseIntensity);

  if (P.coreCrystal) {
    const cScale = (1.0 + 0.05 * waveC + 0.14 * windW + 0.08 * Math.min(1, strikeW)) * (0.72 + 0.28 * alive);
    P.coreCrystal.scale.setScalar(cScale);
    P.coreCrystal.rotation.y = Math.sin(t * 1.35) * 0.12 * alive;
  }
  if (P.heartCyan) {
    const sc = 1.0 + 0.09 * waveC + 0.12 * windW;
    P.heartCyan.scale.setScalar(sc);
    P.heartCyan.position.y = 0.035 + waveC * 0.016 * alive;
    P.heartCyan.rotation.set(waveC * 0.12 * alive, t * 0.85 * alive, -waveC * 0.10 * alive);
  }
  if (P.heartViolet) {
    const sv = 1.0 + 0.09 * waveV + 0.12 * Math.min(1, strikeW);
    P.heartViolet.scale.setScalar(sv);
    P.heartViolet.position.y = -0.035 + waveV * 0.016 * alive;
    P.heartViolet.rotation.set(-waveV * 0.12 * alive, -t * 0.95 * alive, waveV * 0.10 * alive);
  }

  // --- 4. Heavy Grounded Stride & Knees ---
  const gait = anim.gaitBlend * (1 - windW * 0.55) * (1 - Math.min(1, strikeW) * 0.55) * alive;
  const stepFreq = 3.6 + anim.speedNorm * 2.0;
  anim.stepPhase = (anim.stepPhase + safeDt * stepFreq * (0.08 + gait * 0.92)) % TAU;
  const sinP = Math.sin(anim.stepPhase);
  const cosP = Math.cos(anim.stepPhase);
  const stepAmp = (0.38 + anim.speedNorm * 0.14) * gait;

  const tgtLegLRX = -0.04 * alive - sinP * stepAmp + windW * 0.16 - strikeW * 0.22 - dieW * 0.52;
  const tgtLegRRX = -0.04 * alive + sinP * stepAmp - windW * 0.20 + strikeW * 0.20 - dieW * 0.56;
  const tgtLegLRZ = -0.04 - windW * 0.04;
  const tgtLegRRZ = 0.04 + windW * 0.04;

  const tgtShinLRX =
    0.08 * alive +
    Math.max(0, cosP) * 0.50 * gait +
    Math.max(0, -tgtLegLRX) * 0.22 * gait +
    windW * 0.20 +
    strikeW * 0.24 +
    dieW * 1.08;
  const tgtShinRRX =
    0.08 * alive +
    Math.max(0, -cosP) * 0.50 * gait +
    Math.max(0, -tgtLegRRX) * 0.22 * gait +
    windW * 0.26 +
    strikeW * 0.16 +
    dieW * 1.14;

  anim.legLRX = damp(anim.legLRX, tgtLegLRX, 12.0, safeDt);
  anim.legRRX = damp(anim.legRRX, tgtLegRRX, 12.0, safeDt);
  anim.legLRZ = damp(anim.legLRZ, tgtLegLRZ, 10.0, safeDt);
  anim.legRRZ = damp(anim.legRRZ, tgtLegRRZ, 10.0, safeDt);
  anim.shinLRX = damp(anim.shinLRX, tgtShinLRX, 13.0, safeDt);
  anim.shinRRX = damp(anim.shinRRX, tgtShinRRX, 13.0, safeDt);

  if (P.legs && P.legs.length >= 2) {
    P.legs[0].rotation.set(anim.legLRX, 0, anim.legLRZ);
    P.legs[1].rotation.set(anim.legRRX, 0, anim.legRRZ);
  }
  if (P.shins && P.shins.length >= 2) {
    P.shins[0].rotation.x = anim.shinLRX;
    P.shins[1].rotation.x = anim.shinRRX;
  }

  // --- 5. Torso Breathing, Coiled Windup, Heavy Diagonal Cleave & Die Slump ---
  const baseBodyY = P.bodyY || 1.605;
  const breathe = Math.sin(t * 1.8) * 0.022 * (1 - gait * 0.4) * alive;
  const walkBob = Math.abs(sinP) * 0.048 * gait;
  const stanceDip = windW * 0.05 + Math.min(1, strikeW) * 0.09 + recoverW * 0.04 + dieW * 0.46;

  const tgtBodyX = -sinP * 0.042 * gait + windW * 0.05 - strikeW * 0.06;
  const tgtBodyY = baseBodyY + breathe + walkBob - stanceDip;
  const tgtBodyZ = -0.10 * windW + 0.20 * strikeW + 0.14 * dieW;

  const tgtBodyRX =
    0.03 * alive +
    0.07 * gait +
    0.04 * anim.speedNorm +
    Math.sin(t * 1.8 - 0.35) * 0.016 * alive -
    0.20 * windW +
    0.30 * strikeW +
    0.08 * recoverW +
    0.58 * dieW;
  const tgtBodyRY =
    sinP * 0.10 * gait * atkMute +
    0.46 * windW -
    0.56 * strikeW -
    0.10 * recoverW;
  const tgtBodyRZ =
    -cosP * 0.04 * gait * atkMute +
    Math.sin(t * 0.9) * 0.018 * (1 - gait) * alive -
    anim.turnLean -
    0.14 * windW +
    0.12 * strikeW +
    0.08 * dieW;

  anim.bodyX = damp(anim.bodyX, tgtBodyX, 11.0, safeDt);
  anim.bodyY = damp(anim.bodyY, tgtBodyY, 9.5, safeDt);
  anim.bodyZ = damp(anim.bodyZ, tgtBodyZ, 13.0, safeDt);
  anim.bodyRX = damp(anim.bodyRX, tgtBodyRX, 11.0, safeDt);
  anim.bodyRY = damp(anim.bodyRY, tgtBodyRY, 14.0, safeDt);
  anim.bodyRZ = damp(anim.bodyRZ, tgtBodyRZ, 11.0, safeDt);

  P.body.position.set(anim.bodyX, anim.bodyY, anim.bodyZ);
  P.body.rotation.set(anim.bodyRX, anim.bodyRY, anim.bodyRZ);

  if (P.pelvis) {
    P.pelvis.rotation.set(0.02 * anim.speedNorm, sinP * 0.05 * gait * atkMute, -cosP * 0.03 * gait);
  }

  // --- 6. Monolith Stone Head & Jagged Voxel Crystal Crown ---
  let desiredLookYaw = 0;
  if (!isDead && st.target && st.mesh && st.mesh.position) {
    let tp = null;
    if (typeof st.target.getPos === 'function') tp = st.target.getPos();
    else if (typeof st.target.x === 'number' && typeof st.target.z === 'number') tp = st.target;
    if (tp && Number.isFinite(tp.x) && Number.isFinite(tp.z)) {
      const dx = tp.x - st.mesh.position.x;
      const dz = tp.z - st.mesh.position.z;
      if (dx * dx + dz * dz > 0.04) {
        const worldBearing = Math.atan2(dx, dz);
        desiredLookYaw = clamp(wrapAngle(worldBearing - yaw), -0.46, 0.46);
      }
    }
  }
  const idleScanYaw =
    Math.sin(t * 0.74) * 0.22 * (1 - anim.combatBlend) * (1 - gait * 0.45) * atkMute * alive;
  anim.headTrackYaw = damp(anim.headTrackYaw, desiredLookYaw + idleScanYaw, 6.5, safeDt);

  const tgtHeadY = 1.32 + Math.sin(t * 1.8 - 0.75) * 0.015 * alive + 0.015 * windW - 0.04 * dieW;
  const tgtHeadRX = -0.02 * alive + Math.sin(t * 1.8 - 1.0) * 0.024 * alive - 0.12 * windW + 0.14 * strikeW + 0.36 * dieW;
  const tgtHeadRY = anim.headTrackYaw - 0.24 * windW + 0.32 * strikeW;
  const tgtHeadRZ = Math.cos(t * 0.9 - 0.6) * 0.028 * (1 - gait) * alive - anim.turnLean * 0.42;

  anim.headY = damp(anim.headY, tgtHeadY, 7.5, safeDt);
  anim.headRX = damp(anim.headRX, tgtHeadRX, 8.0, safeDt);
  anim.headRY = damp(anim.headRY, tgtHeadRY, 8.5, safeDt);
  anim.headRZ = damp(anim.headRZ, tgtHeadRZ, 8.0, safeDt);

  if (P.head) {
    P.head.position.y = anim.headY;
    P.head.rotation.set(anim.headRX, anim.headRY, anim.headRZ);
  }

  // --- 7. Arms: Left Crystal Claw Guard & Right Battle-Axe Cleave ---
  if (P.armL && P.foreL && P.armR && P.foreR) {
    const swingL = -sinP * 0.38 * gait * atkMute;
    const swingR = sinP * 0.28 * gait * atkMute;

    // Left Arm (3 cyan crystal claws)
    let tgtLRX = -0.14 * alive + swingL - 0.16 * anim.combatBlend + Math.cos(t * 1.8 - 0.5) * 0.03 * alive;
    let tgtLRY = 0.10 * alive + 0.16 * anim.combatBlend;
    let tgtLRZ = -0.16 - 0.06 * anim.combatBlend;
    let tgtLFRX = -0.42 * alive - Math.max(0, -swingL) * 0.22 - 0.20 * anim.combatBlend;
    let tgtLFRY = 0.08 + 0.12 * anim.combatBlend;

    // Windup guard reach
    tgtLRX = lerp(tgtLRX, -0.58, windW);
    tgtLRY = lerp(tgtLRY, 0.34, windW);
    tgtLRZ = lerp(tgtLRZ, -0.28, windW);
    tgtLFRX = lerp(tgtLFRX, -0.56, windW);
    tgtLFRY = lerp(tgtLFRY, 0.22, windW);

    // Strike counter-swing
    const strikeClamp = clamp(strikeW, 0, 1.14);
    tgtLRX = lerp(tgtLRX, 0.38, strikeClamp);
    tgtLRY = lerp(tgtLRY, -0.26, strikeClamp);
    tgtLRZ = lerp(tgtLRZ, -0.38, strikeClamp);
    tgtLFRX = lerp(tgtLFRX, -0.32, strikeClamp);

    // Die limp drop
    tgtLRX = lerp(tgtLRX, -0.22, dieW);
    tgtLRZ = lerp(tgtLRZ, -0.24, dieW);
    tgtLFRX = lerp(tgtLFRX, -0.18, dieW);

    // Right Arm (Voxel Crystal Battle-Axe / Cleaver)
    let tgtRRX = -0.14 * alive + swingR - 0.08 * anim.combatBlend + Math.sin(t * 1.8 - 0.6) * 0.028 * alive;
    let tgtRRY = -0.06 - 0.08 * anim.combatBlend;
    let tgtRRZ = 0.18 + 0.06 * anim.combatBlend;
    let tgtRFRX = -0.50 * alive - 0.12 * anim.combatBlend + Math.max(0, -swingR) * 0.16;
    let tgtRFRY = -0.04;
    let tgtRFRZ = -0.06;

    // Windup: hoist heavy crystal battle-axe high and back-right
    const tremor = windW > 0.60 ? Math.sin(t * 26.0) * 0.016 * windW : 0;
    tgtRRX = lerp(tgtRRX, -2.05 + tremor, windW);
    tgtRRY = lerp(tgtRRY, -0.22, windW);
    tgtRRZ = lerp(tgtRRZ, 0.54, windW);
    tgtRFRX = lerp(tgtRFRX, -0.44, windW);
    tgtRFRY = lerp(tgtRFRY, -0.22, windW);
    tgtRFRZ = lerp(tgtRFRZ, 0.12, windW);

    // Strike: devastating diagonal-to-front cleave driving crystal blade down-across
    tgtRRX = lerp(tgtRRX, 0.14, strikeClamp);
    tgtRRY = lerp(tgtRRY, -0.78 - 0.12 * recoverW, strikeClamp);
    tgtRRZ = lerp(tgtRRZ, -0.08, strikeClamp);
    tgtRFRX = lerp(tgtRFRX, -0.18, strikeClamp);
    tgtRFRY = lerp(tgtRFRY, 0.24, strikeClamp);
    tgtRFRZ = lerp(tgtRFRZ, 0.28, strikeClamp);

    // Recover settle
    tgtRRX = lerp(tgtRRX, -0.28, recoverW * (1 - strikeClamp * 0.7));

    // Die limp drop
    tgtRRX = lerp(tgtRRX, -0.26, dieW);
    tgtRRZ = lerp(tgtRRZ, 0.26, dieW);
    tgtRFRX = lerp(tgtRFRX, -0.16, dieW);

    const armRate = strikeClamp > 0.05 ? 20.0 : 9.5;
    anim.armLRX = damp(anim.armLRX, tgtLRX, armRate, safeDt);
    anim.armLRY = damp(anim.armLRY, tgtLRY, armRate, safeDt);
    anim.armLRZ = damp(anim.armLRZ, tgtLRZ, armRate, safeDt);
    anim.foreLRX = damp(anim.foreLRX, tgtLFRX, armRate, safeDt);
    anim.foreLRY = damp(anim.foreLRY, tgtLFRY, armRate, safeDt);

    anim.armRRX = damp(anim.armRRX, tgtRRX, armRate, safeDt);
    anim.armRRY = damp(anim.armRRY, tgtRRY, armRate, safeDt);
    anim.armRRZ = damp(anim.armRRZ, tgtRRZ, armRate, safeDt);
    anim.foreRRX = damp(anim.foreRRX, tgtRFRX, armRate, safeDt);
    anim.foreRRY = damp(anim.foreRRY, tgtRFRY, armRate, safeDt);
    anim.foreRRZ = damp(anim.foreRRZ, tgtRFRZ, armRate, safeDt);

    P.armL.rotation.set(anim.armLRX, anim.armLRY, anim.armLRZ);
    P.foreL.rotation.set(anim.foreLRX, anim.foreLRY, 0);

    P.armR.rotation.set(anim.armRRX, anim.armRRY, anim.armRRZ);
    P.foreR.rotation.set(anim.foreRRX, anim.foreRRY, anim.foreRRZ);
  }

  // --- 8. 6 Dorsal Crystal Spines Breathing & Flare ---
  if (P.crystalSpines) {
    for (let i = 0; i < P.crystalSpines.length; i++) {
      const sp = P.crystalSpines[i];
      const br = sp.userData.baseRot;
      if (!br) continue;
      const sideSign = i < 3 ? -1 : 1;
      const wave = Math.sin(t * 2.0 + i * 0.85) * 0.028 * alive;
      const flare = windW * 0.14 + Math.min(1, strikeW) * 0.18 - dieW * 0.12;
      sp.rotation.set(
        br.x - flare * 0.55 + wave,
        br.y,
        br.z + sideSign * flare * 0.65
      );
    }
  }

  // --- 9. 4 Orbiting Voxel Crystal Shards ---
  if (P.orbitShards) {
    const orbitBoost = (1.0 + 1.15 * windW + 1.85 * Math.min(1, strikeW)) * (0.15 + 0.85 * alive);
    for (let i = 0; i < P.orbitShards.length; i++) {
      const shard = P.orbitShards[i];
      const u = shard.userData;
      if (!u) continue;
      u.angle = (u.angle + safeDt * u.speed * orbitBoost) % TAU;
      const rad = u.radius + Math.sin(t * 1.6 + u.phase) * 0.045 * alive + windW * 0.12 - dieW * 0.18;
      shard.position.set(
        Math.cos(u.angle) * rad,
        u.baseY + Math.sin(t * 2.2 + u.phase) * 0.10 * alive - dieW * 0.34,
        Math.sin(u.angle) * rad
      );
      shard.rotation.y = -u.angle + t * 1.35 * alive;
      shard.rotation.z = Math.sin(t * 1.8 + u.phase) * 0.22 * alive;
    }
  }
}

export { buildCrystalGolem, animateCrystalGolem };
