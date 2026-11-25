import { HC } from '../hc.js';

const THREE = HC.THREE;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const dampRate = (rate, dt) => (dt > 0 ? 1 - Math.exp(-rate * dt) : 1);
const damp = (cur, target, rate, dt) => {
  if (!Number.isFinite(cur)) return target;
  if (dt <= 0) return target;
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
};

// ============================================================================
// SUN RUINS PURE-VOXEL PALETTE (harmonized with Sylvan NPCs & Bandits)
// ============================================================================

const CG = {
  // Ancient Sun Ruins Limestone
  limeL:   0xd8c69f,
  lime:    0xc9b48a,
  limeM:   0xb39d74,
  limeD:   0x8c7754,

  // Dark Carved Temple Basalt
  basalt:  0x3e3a35,
  basaltD: 0x282522,

  // Stepped Moss Clumps
  mossL:   0x6c8d49,
  moss:    0x537338,
  mossD:   0x3b5426,

  // Ancient Gold Trim
  goldL:   0xf0c450,
  gold:    0xd9a834,
  goldD:   0x9e7418,

  // Glowing Cyan Runes & Visor
  cyanH:   0xc6fff7,
  cyan:    0x7ef7e6,
  cyanD:   0x3bc2b3,

  // Warm Solar Core
  solarH:  0xfff3c4,
  solar:   0xffd25a,
  solarD:  0xe89b1e,
};

// ============================================================================
// PURE VOXEL BUILDERS (STRICTLY ORTHOGONAL BoxGeometry BRICKS)
// ============================================================================

function brickHash(x, y, z) {
  const qx = Math.round(x * 20);
  const qy = Math.round(y * 20);
  const qz = Math.round(z * 20);
  const n = Math.sin(qx * 127.1 + qy * 311.7 + qz * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Batched orthogonal voxel brick builder matching bandit_models.js.
 * Uses a single unit BoxGeometry(1,1,1) merged per parent joint with
 * vertex-colored face shading & subtle deterministic voxel jitter.
 */
function createVoxelBuilder(isMobile = false, materialOverride = null, opts = {}) {
  const base = new THREE.BoxGeometry(1, 1, 1);
  const unit = base.toNonIndexed();
  base.dispose();

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

  const isEmissive = !!opts.emissive;
  const jitterAmt = opts.jitterAmt ?? (isEmissive ? 0.0 : 0.045);
  const castShadow = opts.castShadow !== undefined ? opts.castShadow : !isMobile && !isEmissive;
  const receiveShadow = opts.receiveShadow !== undefined ? opts.receiveShadow : !isMobile && !isEmissive;

  const material =
    materialOverride ||
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: 0x000000,
    });

  return {
    material,
    box(parent, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      let data = batches.get(parent);
      if (!data) {
        data = { p: [], n: [], c: [] };
        batches.set(parent, data);
      }
      euler.set(rx, ry, rz);
      q.setFromEuler(euler);
      posVec.set(x, y, z);
      scaleVec.set(w, h, d);
      matrix.compose(posVec, q, scaleVec);
      normalMat.getNormalMatrix(matrix);

      tint.set(color);
      const j = jitterAmt > 0 ? 1 + (brickHash(x, y, z) - 0.5) * jitterAmt : 1;
      const br = tint.r * j;
      const bg = tint.g * j;
      const bb = tint.b * j;

      const pos = unit.attributes.position;
      const norm = unit.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        data.p.push(v.x, v.y, v.z);
        n.fromBufferAttribute(norm, i).applyMatrix3(normalMat).normalize();
        data.n.push(n.x, n.y, n.z);

        // Subtle quantized per-face shading so stepped voxel courses pop cleanly
        let shade = 1.0;
        if (!isEmissive) {
          if (n.y > 0.6) shade = 1.05;
          else if (n.y < -0.6) shade = 0.89;
          else if (Math.abs(n.x) > 0.6) shade = 0.96;
        }
        data.c.push(
          clamp(br * shade, 0, 1),
          clamp(bg * shade, 0, 1),
          clamp(bb * shade, 0, 1)
        );
      }
    },
    finish() {
      for (const [parent, data] of batches) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.n, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.c, 3));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        parent.add(mesh);
      }
      unit.dispose();
    },
  };
}

function makeJoint(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * Helper to stack a clean stepped voxel moss clump (pure orthogonal boxes).
 */
function addMossClump(box, parent, x, y, z, w = 0.24, h = 0.14, d = 0.24, flipX = 1) {
  box(parent, w, h * 0.55, d, CG.mossD, x, y, z);
  box(parent, w * 0.78, h * 0.45, d * 0.78, CG.moss, x + flipX * w * 0.06, y + h * 0.42, z - d * 0.04);
  box(parent, w * 0.48, h * 0.36, d * 0.50, CG.mossL, x - flipX * w * 0.08, y + h * 0.72, z + d * 0.06);
}

/**
 * Builds a pure-voxel stepped pixel ring in the XY plane from discrete
 * axis-aligned voxel blocks (no Torus/Ring geometry, no tilted rectangles).
 */
function addPixelRingXY(box, parent, radius, step, thicknessZ, segments, colorFn) {
  const seen = new Set();
  for (let i = 0; i < segments; i++) {
    const ang = (i / segments) * TAU;
    const gx = Math.round((Math.cos(ang) * radius) / step);
    const gy = Math.round((Math.sin(ang) * radius) / step);
    const key = `${gx},${gy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const col = colorFn(i, gx, gy, ang);
    box(parent, step * 1.02, step * 1.02, thicknessZ, col, gx * step, gy * step, 0);
  }
}

// ============================================================================
// MAIN BUILDER: buildSunRuinsGolem(isMobile = false)
// ============================================================================

/**
 * Builds the 100% pure-voxel Ancient Sun Ruins Guardian Golem (~3.70 m tall).
 * Grounded cleanly at y = 0, facing +Z.
 * @param {boolean|object} [isMobile=false]
 */
function buildSunRuinsGolem(isMobile = false) {
  const mobile = typeof isMobile === 'object' ? !!(isMobile.isMobileDevice || isMobile.isMobile) : !!isMobile;

  const root = new THREE.Group();
  root.name = 'sun_ruins_golem';

  // Primary batched stone/moss/gold voxel builder (flashes red on hit)
  const stoneBuilder = createVoxelBuilder(mobile);
  const box = stoneBuilder.box;

  // Emissive voxel builders for glowing cyan runes, eye visor, and solar core
  const cyanMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0x4de8d8,
    emissiveIntensity: 1.15,
    vertexColors: true,
  });
  cyanMat.userData = { isEnergyGlow: true, baseIntensity: 1.15 };
  const cyanBuilder = createVoxelBuilder(mobile, cyanMat, { emissive: true, castShadow: false, receiveShadow: false });
  const cyanBox = cyanBuilder.box;

  const solarMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xf2a92c,
    emissiveIntensity: 1.25,
    vertexColors: true,
  });
  solarMat.userData = { isEnergyGlow: true, baseIntensity: 1.25 };
  const solarBuilder = createVoxelBuilder(mobile, solarMat, { emissive: true, castShadow: false, receiveShadow: false });
  const solarBox = solarBuilder.box;

  const crispGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
  });
  crispGlowMat.userData = { isEnergyGlow: true };
  const crispBuilder = createVoxelBuilder(mobile, crispGlowMat, { emissive: true, castShadow: false, receiveShadow: false });
  const crispBox = crispBuilder.box;

  const BODY_Y = 1.62;
  const LEG_Y = 1.518;
  const SHIN_Y = -0.68; // World knee pivot y = 1.518 - 0.68 = 0.838 m

  // --------------------------------------------------------------------------
  // 1. 2-JOINT ARTICULATED VOXEL PILLAR LEGS (legs: [legL, legR], shins: [shinL, shinR])
  //    Foot sole rests at shin y = -0.80 => exact world y = 0.000
  // --------------------------------------------------------------------------
  const legs = [];
  const shins = [];

  for (const side of [-1, 1]) {
    const isLeft = side < 0;
    const lg = makeJoint(root, isLeft ? 'legL' : 'legR', side * 0.40, LEG_Y, 0);

    // Basalt hip socket & stepped carved limestone thigh pillar
    box(lg, 0.44, 0.20, 0.46, CG.basalt, 0, -0.02, 0);
    box(lg, 0.48, 0.24, 0.50, CG.lime, 0, -0.22, 0);
    box(lg, 0.44, 0.26, 0.46, CG.limeM, 0, -0.45, 0);
    box(lg, 0.38, 0.12, 0.40, CG.basaltD, 0, -0.61, 0);

    // Gold thigh trim cuff + corner rivets
    box(lg, 0.49, 0.07, 0.51, CG.gold, 0, -0.43, 0);
    box(lg, 0.51, 0.04, 0.14, CG.goldD, 0, -0.43, 0);

    // Recessed front thigh cyan rune channel flanked by basalt cheeks
    box(lg, 0.14, 0.26, 0.04, CG.basaltD, side * 0.11, -0.23, 0.24);
    cyanBox(lg, 0.055, 0.22, 0.035, CG.cyan, side * 0.11, -0.23, 0.255);

    // Outer stepped stone hip plate + creeping moss clump
    box(lg, 0.12, 0.28, 0.36, CG.limeD, side * 0.24, -0.22, 0);
    addMossClump(box, lg, side * 0.24, -0.08, isLeft ? -0.04 : 0.04, 0.16, 0.13, 0.22, side);

    // Knee & Shin Joint (world y = 0.80)
    const shin = makeJoint(lg, isLeft ? 'shinL' : 'shinR', 0, SHIN_Y, 0);

    // Pure-voxel stepped basalt knee axle drum
    box(shin, 0.38, 0.20, 0.28, CG.basalt, 0, 0, 0);
    box(shin, 0.34, 0.28, 0.20, CG.basaltD, 0, 0, 0);

    // Heavy stepped limestone & gold projecting knee shield
    box(shin, 0.38, 0.24, 0.10, CG.lime, 0, 0.02, 0.17);
    box(shin, 0.28, 0.18, 0.07, CG.limeL, 0, 0.02, 0.23);
    box(shin, 0.16, 0.11, 0.05, CG.gold, 0, 0.02, 0.27);
    solarBox(shin, 0.06, 0.07, 0.035, CG.solar, 0, 0.02, 0.295);

    // Lower greave pillar (flares slightly toward ankle)
    box(shin, 0.40, 0.22, 0.42, CG.limeM, 0, -0.21, 0);
    box(shin, 0.46, 0.26, 0.48, CG.lime, 0, -0.43, 0);

    // Front shin cyan rune groove framed by basalt
    box(shin, 0.14, 0.32, 0.04, CG.basaltD, 0, -0.35, 0.235);
    cyanBox(shin, 0.055, 0.27, 0.035, CG.cyan, 0, -0.35, 0.25);

    // Gold ankle band + back calf moss clump
    box(shin, 0.50, 0.07, 0.52, CG.gold, 0, -0.58, 0.01);
    addMossClump(box, shin, side * 0.03, -0.30, -0.23, 0.24, 0.15, 0.14, side);

    // Chunky Voxel Stone Boot (sole bottom strictly at y = -0.80 => world y = 0.000)
    box(shin, 0.54, 0.08, 0.72, CG.basaltD, 0, -0.76, 0.08);
    box(shin, 0.48, 0.14, 0.58, CG.limeM, 0, -0.65, 0.04);
    box(shin, 0.38, 0.07, 0.14, CG.gold, 0, -0.60, 0.22);
    box(shin, 0.42, 0.14, 0.16, CG.limeD, 0, -0.73, -0.22);

    // Three heavy chunky stone toe bricks + basalt toe caps (bottom at y = -0.80)
    for (const toeIdx of [-1, 0, 1]) {
      const toeW = toeIdx === 0 ? 0.16 : 0.13;
      const toeH = toeIdx === 0 ? 0.14 : 0.12;
      const toeD = toeIdx === 0 ? 0.24 : 0.20;
      const tx = toeIdx * 0.175;
      const tz = toeIdx === 0 ? 0.42 : 0.40;
      box(shin, toeW, toeH, toeD, toeIdx === 0 ? CG.limeL : CG.lime, tx, -0.80 + toeH * 0.5, tz);
      box(shin, toeW * 0.82, 0.07, 0.08, toeIdx === 0 ? CG.goldD : CG.basalt, tx, -0.80 + 0.035, tz + toeD * 0.46);
    }

    lg.userData.shin = shin;
    legs.push(lg);
    shins.push(shin);
  }

  // --------------------------------------------------------------------------
  // 2. PELVIS, RECESSED CHEST CHAMBER & MOSS-DRAPED COLLAR (body at y = 1.62)
  // --------------------------------------------------------------------------
  const body = makeJoint(root, 'body', 0, BODY_Y, 0);

  // Pelvis waist core + gold girdle + stepped temple loincloth & side tassets
  box(body, 0.92, 0.34, 0.62, CG.basalt, 0, 0.02, 0);
  box(body, 1.04, 0.10, 0.70, CG.gold, 0, 0.14, 0);
  box(body, 0.22, 0.13, 0.06, CG.goldD, 0, 0.14, 0.35);
  cyanBox(body, 0.12, 0.07, 0.04, CG.cyan, 0, 0.14, 0.375);

  // Front stepped temple loincloth slab
  box(body, 0.40, 0.18, 0.10, CG.lime, 0, -0.02, 0.34);
  box(body, 0.32, 0.16, 0.08, CG.limeM, 0, -0.17, 0.35);
  box(body, 0.20, 0.10, 0.07, CG.limeD, 0, -0.28, 0.35);
  box(body, 0.42, 0.05, 0.11, CG.gold, 0, 0.05, 0.345);
  solarBox(body, 0.08, 0.20, 0.04, CG.solar, 0, -0.10, 0.385);

  // Rear loincloth slab & side hip tassets
  box(body, 0.44, 0.34, 0.09, CG.limeM, 0, -0.06, -0.33);
  box(body, 0.30, 0.14, 0.07, CG.limeD, 0, -0.25, -0.33);
  for (const side of [-1, 1]) {
    box(body, 0.12, 0.34, 0.48, CG.limeM, side * 0.52, -0.04, 0);
    box(body, 0.09, 0.18, 0.36, CG.limeD, side * 0.54, -0.21, 0);
    box(body, 0.06, 0.12, 0.38, CG.gold, side * 0.57, 0.06, 0);
  }

  // Lower abdomen stone tier + glowing cyan waist energy seam
  cyanBox(body, 0.96, 0.06, 0.68, CG.cyanD, 0, 0.21, 0);
  box(body, 1.12, 0.28, 0.68, CG.limeM, 0, 0.36, 0);
  box(body, 0.36, 0.24, 0.06, CG.basaltD, 0, 0.36, 0.33);
  cyanBox(body, 0.07, 0.20, 0.04, CG.cyan, 0, 0.36, 0.36);

  // Recessed Dark Basalt Chest Chamber Cavity & Massive Backstone Monolith
  box(body, 1.36, 0.72, 0.34, CG.limeM, 0, 0.82, -0.22);
  box(body, 1.54, 0.22, 0.30, CG.lime, 0, 1.08, -0.20);
  box(body, 0.88, 0.66, 0.38, CG.basaltD, 0, 0.80, -0.02); // Deep chamber recess wall
  box(body, 0.84, 0.12, 0.50, CG.basalt, 0, 0.50, 0.08);   // Chamber lower sill
  box(body, 0.84, 0.12, 0.50, CG.basalt, 0, 1.08, 0.08);   // Chamber upper lintel

  // Asymmetrical Cracked Left & Right Limestone Pectoral Halves framing the open core cavity
  // Left pectoral monolith (x: -0.90 to -0.26)
  box(body, 0.56, 0.62, 0.48, CG.lime, -0.60, 0.80, 0.14);
  box(body, 0.16, 0.24, 0.44, CG.limeM, -0.32, 0.94, 0.14);
  box(body, 0.14, 0.20, 0.44, CG.limeL, -0.34, 0.62, 0.14);
  box(body, 0.10, 0.14, 0.36, CG.basalt, -0.28, 0.78, 0.12);
  box(body, 0.48, 0.08, 0.12, CG.gold, -0.56, 1.02, 0.34);

  // Right pectoral monolith (x: +0.26 to +0.92, slightly bulkier & stepped differently)
  box(body, 0.60, 0.64, 0.50, CG.lime, 0.62, 0.81, 0.14);
  box(body, 0.16, 0.22, 0.44, CG.limeL, 0.32, 0.96, 0.14);
  box(body, 0.14, 0.22, 0.44, CG.limeM, 0.33, 0.63, 0.14);
  box(body, 0.10, 0.16, 0.38, CG.basalt, 0.28, 0.80, 0.12);
  box(body, 0.52, 0.09, 0.12, CG.gold, 0.58, 1.04, 0.35);

  // Stepped Cyan & Solar Energy Cracks radiating out from chest chamber
  cyanBox(body, 0.14, 0.055, 0.04, CG.cyan, -0.36, 0.72, 0.38);
  cyanBox(body, 0.12, 0.055, 0.04, CG.cyan, -0.46, 0.67, 0.38);
  solarBox(body, 0.12, 0.05, 0.04, CG.solar, -0.36, 0.92, 0.38);
  cyanBox(body, 0.14, 0.055, 0.04, CG.cyan, 0.36, 0.70, 0.39);
  cyanBox(body, 0.12, 0.055, 0.04, CG.cyan, 0.46, 0.65, 0.39);
  solarBox(body, 0.14, 0.05, 0.04, CG.solar, 0.36, 0.94, 0.39);

  // Massive Stepped Temple Shoulder Collar (~1.88 m span)
  box(body, 1.88, 0.18, 0.82, CG.lime, 0, 1.18, -0.02);
  box(body, 1.56, 0.12, 0.72, CG.limeL, 0, 1.31, -0.02);
  box(body, 1.62, 0.07, 0.76, CG.gold, 0, 1.26, -0.02);
  box(body, 0.60, 0.10, 0.56, CG.basaltD, 0, 1.34, 0.04); // Recessed head levitation basin

  // Pure-voxel square cyan levitation rune frame under floating monolith head
  cyanBox(body, 0.44, 0.04, 0.05, CG.cyan, 0, 1.39, 0.24);
  cyanBox(body, 0.44, 0.04, 0.05, CG.cyan, 0, 1.39, -0.16);
  cyanBox(body, 0.05, 0.04, 0.40, CG.cyan, -0.20, 1.39, 0.04);
  cyanBox(body, 0.05, 0.04, 0.40, CG.cyan, 0.20, 1.39, 0.04);

  // Lush Stepped Moss Collar Blocks wrapping shoulders, nape, and upper spine
  addMossClump(box, body, -0.56, 1.36, -0.08, 0.44, 0.16, 0.42, -1);
  addMossClump(box, body, 0.56, 1.37, -0.06, 0.46, 0.17, 0.42, 1);
  addMossClump(box, body, 0, 1.32, -0.28, 0.58, 0.18, 0.30, 1);
  addMossClump(box, body, -0.34, 0.98, -0.36, 0.30, 0.18, 0.20, -1);
  addMossClump(box, body, 0.36, 0.90, -0.36, 0.28, 0.16, 0.20, 1);

  // --------------------------------------------------------------------------
  // 2B. SOLAR HEART CORE (coreOrb) INSIDE CHEST CHAMBER (100% PURE VOXEL)
  // --------------------------------------------------------------------------
  const coreOrb = makeJoint(body, 'coreOrb', 0, 0.79, 0.22);

  // Stepped pixel-sphere Solar Core (coreInner)
  const coreInner = makeJoint(coreOrb, 'coreInner', 0, 0, 0);
  crispBox(coreInner, 0.14, 0.14, 0.14, CG.solarH, 0, 0, 0);
  solarBox(coreInner, 0.21, 0.10, 0.10, CG.solar, 0, 0, 0);
  solarBox(coreInner, 0.10, 0.21, 0.10, CG.solar, 0, 0, 0);
  solarBox(coreInner, 0.10, 0.10, 0.21, CG.solar, 0, 0, 0);
  for (const sx of [-0.07, 0.07]) {
    for (const sy of [-0.07, 0.07]) {
      for (const sz of [-0.07, 0.07]) {
        solarBox(coreInner, 0.055, 0.055, 0.055, CG.solarD, sx, sy, sz);
      }
    }
  }

  // Orbiting Cyan Arcane Shard Cage (coreShell)
  const coreShell = makeJoint(coreOrb, 'coreShell', 0, 0, 0);
  for (const [sx, sy, sz] of [
    [0.18, 0, 0], [-0.18, 0, 0],
    [0, 0.18, 0], [0, -0.18, 0],
    [0, 0, 0.18], [0, 0, -0.18],
  ]) {
    cyanBox(coreShell, 0.05, 0.05, 0.05, CG.cyan, sx, sy, sz);
  }

  // Counter-Rotating Stepped Voxel Gimbal Rings (coreRingA, coreRingB)
  const coreRingA = makeJoint(coreOrb, 'coreRingA', 0, 0, 0);
  addPixelRingXY(box, coreRingA, 0.26, 0.052, 0.044, 16, (i) => (i % 4 === 0 ? CG.goldL : CG.gold));
  coreRingA.rotation.set(0.58, 0.25, 0);

  const coreRingB = makeJoint(coreOrb, 'coreRingB', 0, 0, 0);
  addPixelRingXY(
    cyanBox,
    coreRingB,
    0.32,
    0.048,
    0.036,
    20,
    (i) => (i % 5 === 0 ? CG.solar : CG.cyan)
  );
  coreRingB.rotation.set(-0.48, -0.35, 0.4);

  // --------------------------------------------------------------------------
  // 2C. PIXEL-STEPPED DORSAL SUN HALO (sunHalo -> innerHaloRing, outerRing)
  //     Center at world y = 1.62 + 1.11 = 2.73 m; ray tips reach ~3.68 m
  // --------------------------------------------------------------------------
  const sunHaloBaseY = 1.11;
  const sunHaloBaseZ = -0.62;
  const sunHalo = makeJoint(body, 'sunHalo', 0, sunHaloBaseY, sunHaloBaseZ);

  const innerHaloRing = makeJoint(sunHalo, 'innerHaloRing', 0, 0, 0);
  addPixelRingXY(box, innerHaloRing, 0.38, 0.075, 0.06, 20, (i) => (i % 5 === 0 ? CG.gold : CG.basalt));
  // 4 cardinal glowing cyan rune nodes on inner ring
  for (const [rx, ry] of [[0.38, 0], [-0.38, 0], [0, 0.38], [0, -0.38]]) {
    cyanBox(innerHaloRing, 0.08, 0.08, 0.075, CG.cyan, rx, ry, 0);
  }

  const outerRing = makeJoint(sunHalo, 'outerRing', 0, 0, 0);
  addPixelRingXY(
    box,
    outerRing,
    0.64,
    0.08,
    0.07,
    28,
    (i) => (i % 2 === 0 ? CG.gold : CG.lime)
  );

  // 4 Major Cardinal Stepped Solar Obelisk Rays (+Y, -Y, +X, -X)
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const horiz = dx !== 0;
    box(outerRing, horiz ? 0.12 : 0.17, horiz ? 0.17 : 0.12, 0.08, CG.lime, dx * 0.72, dy * 0.72, 0);
    box(outerRing, horiz ? 0.10 : 0.11, horiz ? 0.11 : 0.10, 0.075, CG.gold, dx * 0.81, dy * 0.81, 0);
    solarBox(outerRing, horiz ? 0.08 : 0.065, horiz ? 0.065 : 0.08, 0.065, CG.solar, dx * 0.89, dy * 0.89, 0);
    cyanBox(outerRing, 0.055, 0.055, 0.08, CG.cyan, dx * 0.64, dy * 0.64, 0);
  }

  // 4 Minor Diagonal Pixel-Stepped Sun Rays (pure orthogonal stair steps!)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      box(outerRing, 0.09, 0.09, 0.07, CG.goldD, sx * 0.49, sy * 0.49, 0);
      box(outerRing, 0.08, 0.08, 0.065, CG.gold, sx * 0.56, sy * 0.56, 0);
      cyanBox(outerRing, 0.06, 0.06, 0.06, CG.cyan, sx * 0.63, sy * 0.63, 0);
    }
  }

  // --------------------------------------------------------------------------
  // 3. NECKLESS MONOLITH VOXEL HEAD (head + eyeVisor + eyeCore + crown + moss)
  //    Center at body y = 1.53 => world y = 3.15 m; crown reaches ~3.57 m
  // --------------------------------------------------------------------------
  const headBaseY = 1.53;
  const head = makeJoint(body, 'head', 0, headBaseY, 0.05);

  // Main monolithic limestone block & weathered lower jaw
  box(head, 0.56, 0.44, 0.52, CG.lime, 0, 0.02, 0);
  box(head, 0.48, 0.14, 0.46, CG.limeM, 0, -0.17, 0.01);
  box(head, 0.14, 0.12, 0.12, CG.limeD, -0.22, -0.14, -0.20);
  box(head, 0.14, 0.12, 0.12, CG.limeD, 0.22, 0.16, -0.20);

  // Hanging pure-voxel levitation crystal under chin
  box(head, 0.24, 0.05, 0.24, CG.goldD, 0, -0.25, 0);
  cyanBox(head, 0.08, 0.09, 0.08, CG.cyan, 0, -0.30, 0);
  crispBox(head, 0.045, 0.05, 0.045, CG.cyanH, 0, -0.34, 0);

  // Recessed dark basalt horizontal visor slot + overhanging gold brow & cheek blocks
  box(head, 0.44, 0.11, 0.09, CG.basaltD, 0, 0.02, 0.225);
  box(head, 0.58, 0.075, 0.14, CG.gold, 0, 0.11, 0.235);
  box(head, 0.54, 0.06, 0.12, CG.limeL, 0, 0.17, 0.22);
  box(head, 0.10, 0.18, 0.12, CG.limeM, -0.23, -0.05, 0.23);
  box(head, 0.10, 0.18, 0.12, CG.limeM, 0.23, -0.05, 0.23);
  box(head, 0.28, 0.10, 0.09, CG.limeM, 0, -0.11, 0.24);

  // Glowing Horizontal Cyan Voxel Eye Slit & Cyclops Pixel Core
  const eyeVisor = makeJoint(head, 'eyeVisor', 0, 0.02, 0.27);
  cyanBox(eyeVisor, 0.36, 0.046, 0.03, CG.cyan, 0, 0, 0);
  const eyeCore = makeJoint(eyeVisor, 'eyeCore', 0, 0, 0.014);
  solarBox(eyeCore, 0.075, 0.075, 0.03, CG.solar, 0, 0, 0);
  crispBox(eyeCore, 0.038, 0.038, 0.032, CG.cyanH, 0, 0, 0.008);

  // Side Temple Ear Buttresses with vertical glowing cyan runes
  for (const side of [-1, 1]) {
    box(head, 0.09, 0.36, 0.26, CG.limeM, side * 0.31, 0.06, 0);
    box(head, 0.07, 0.26, 0.14, CG.gold, side * 0.35, 0.08, 0.02);
    cyanBox(head, 0.035, 0.20, 0.05, CG.cyan, side * 0.375, 0.08, 0.02);
  }

  // Stepped Temple Ziggurat Crown Crest & Moss Patch
  box(head, 0.44, 0.08, 0.42, CG.limeM, 0, 0.27, -0.01);
  box(head, 0.30, 0.07, 0.30, CG.gold, 0, 0.34, -0.01);
  box(head, 0.14, 0.12, 0.12, CG.limeL, 0, 0.37, 0.14);
  solarBox(head, 0.06, 0.07, 0.04, CG.solar, 0, 0.37, 0.205);
  addMossClump(box, head, -0.08, 0.29, -0.14, 0.24, 0.10, 0.20, -1);

  // --------------------------------------------------------------------------
  // 4. HOVERING MOSSY SHOULDER BOULDERS & 2-JOINT ARMS
  //    armL (-X): Limestone Buckler Shield | armR (+X): Sun Relic Siege Hammer
  // --------------------------------------------------------------------------
  const buildArm = (side) => {
    const isLeft = side < 0;
    const arm = makeJoint(body, isLeft ? 'armL' : 'armR', side * 1.04, 1.06, 0.02);

    // Floating Mossy Stone Voxel Shoulder Boulder (child of arm)
    const padX = side * 0.15;
    const padY = isLeft ? 0.22 : 0.25;
    const shoulderPad = makeJoint(arm, isLeft ? 'shoulderPadL' : 'shoulderPadR', padX, padY, 0);

    // Pure-voxel levitation crystal underneath shoulder boulder
    cyanBox(shoulderPad, 0.09, 0.09, 0.09, CG.cyan, 0, -0.17, 0);
    crispBox(shoulderPad, 0.05, 0.14, 0.05, CG.cyanH, 0, -0.17, 0);

    if (isLeft) {
      // Left Boulder: Stepped limestone boulder dome + gold trim + rich moss cushion
      box(shoulderPad, 0.56, 0.09, 0.56, CG.basalt, 0, -0.07, 0);
      box(shoulderPad, 0.60, 0.18, 0.58, CG.lime, 0, 0.04, 0);
      box(shoulderPad, 0.46, 0.11, 0.46, CG.limeM, 0.02, 0.16, 0);
      box(shoulderPad, 0.30, 0.07, 0.32, CG.limeL, 0.04, 0.23, 0.02);
      box(shoulderPad, 0.10, 0.14, 0.48, CG.gold, -0.29, 0.06, 0);
      cyanBox(shoulderPad, 0.04, 0.09, 0.24, CG.cyan, -0.33, 0.06, 0);
      addMossClump(box, shoulderPad, -0.06, 0.19, -0.06, 0.34, 0.16, 0.34, -1);
      addMossClump(box, shoulderPad, -0.20, 0.11, 0.14, 0.18, 0.11, 0.20, -1);
    } else {
      // Right Boulder: Bulkier stepped boulder + golden Sun Horn Crest + moss cap
      box(shoulderPad, 0.62, 0.09, 0.60, CG.basalt, 0, -0.07, 0);
      box(shoulderPad, 0.66, 0.20, 0.62, CG.lime, 0, 0.05, 0);
      box(shoulderPad, 0.50, 0.12, 0.48, CG.limeM, -0.02, 0.18, 0);
      box(shoulderPad, 0.34, 0.08, 0.34, CG.limeL, -0.04, 0.26, 0.02);
      // Stepped Temple Horn Fin on outer ridge
      box(shoulderPad, 0.14, 0.22, 0.30, CG.goldD, 0.26, 0.16, 0);
      box(shoulderPad, 0.10, 0.20, 0.20, CG.gold, 0.30, 0.27, 0);
      solarBox(shoulderPad, 0.05, 0.16, 0.12, CG.solar, 0.34, 0.22, 0.02);
      addMossClump(box, shoulderPad, 0.02, 0.22, -0.08, 0.36, 0.16, 0.36, 1);
    }

    // Basalt shoulder ball socket & Upper Arm Stone Pillar
    const upperW = isLeft ? 0.40 : 0.44;
    const upperD = isLeft ? 0.40 : 0.44;
    box(arm, 0.32, 0.22, 0.32, CG.basaltD, 0, -0.02, 0);
    box(arm, upperW, 0.54, upperD, CG.limeM, 0, -0.34, 0);
    box(arm, upperW + 0.05, 0.08, upperD + 0.05, CG.gold, 0, -0.36, 0);
    cyanBox(arm, 0.045, 0.24, 0.09, CG.cyan, side * (upperW * 0.5 + 0.01), -0.30, 0);

    // Elbow & Forearm Joint (y = -0.64 in arm)
    const fore = makeJoint(arm, isLeft ? 'foreL' : 'foreR', 0, -0.64, 0);

    // Pure-voxel stepped basalt elbow hinge drum
    box(fore, upperW * 0.92, 0.20, 0.32, CG.basalt, 0, 0, 0);
    box(fore, upperW * 0.84, 0.24, 0.24, CG.basaltD, 0, 0, 0);

    // Heavy Forearm Monolith Gauntlet
    const foreW = isLeft ? 0.46 : 0.52;
    const foreH = isLeft ? 0.60 : 0.64;
    const foreD = isLeft ? 0.46 : 0.52;
    box(fore, foreW, foreH, foreD, CG.lime, 0, -foreH * 0.5 - 0.04, 0);
    box(fore, foreW + 0.04, 0.08, foreD + 0.04, CG.gold, 0, -0.14, 0);
    box(fore, foreW + 0.04, 0.08, foreD + 0.04, CG.goldD, 0, -foreH - 0.02, 0);

    // Glowing cyan/solar rune wraps around forearm
    cyanBox(fore, foreW + 0.025, 0.05, foreD + 0.025, CG.cyan, 0, -0.26, 0);
    cyanBox(fore, foreW + 0.025, 0.05, foreD + 0.025, CG.cyan, 0, -0.48, 0);
    if (isLeft) {
      solarBox(fore, 0.05, 0.26, foreD + 0.03, CG.solar, 0, -0.37, 0);
    } else {
      solarBox(fore, foreW + 0.03, 0.28, 0.055, CG.solar, 0, -0.37, 0);
    }

    // Chunky Voxel Stone Fist & Articulated Finger Bricks
    const fistY = -foreH - 0.18;
    const fistW = isLeft ? 0.42 : 0.48;
    const fistH = isLeft ? 0.22 : 0.25;
    const fistD = isLeft ? 0.42 : 0.48;

    box(fore, fistW, fistH, fistD, CG.limeM, 0, fistY, 0.02);
    box(fore, fistW * 0.96, 0.07, 0.09, CG.gold, 0, fistY - 0.04, fistD * 0.48);

    // 4 Carved Voxel Fingers (proximal + curled lower knuckle blocks)
    const fSpan = fistW * 0.80;
    for (let f = 0; f < 4; f++) {
      const fx = -fSpan * 0.5 + (f + 0.5) * (fSpan / 4);
      const fw = (fSpan / 4) * 0.78;
      box(fore, fw, 0.12, 0.13, CG.lime, fx, fistY - fistH * 0.5 - 0.05, fistD * 0.24);
      box(fore, fw * 0.92, 0.10, 0.14, CG.limeD, fx, fistY - fistH * 0.5 - 0.12, fistD * 0.08);
    }
    // Opposable Voxel Thumb Brick on inner palm side
    box(fore, 0.12, 0.15, 0.17, CG.lime, isLeft ? fistW * 0.46 : -fistW * 0.46, fistY - 0.03, fistD * 0.25);

    if (!isLeft) {
      // Heavy Sun Relic Voxel Siege Hammer gripped inside right fist (+Z forward)
      const gripR = makeJoint(fore, 'gripR', 0, fistY - 0.02, 0.04);

      // Basalt shaft & gold handguard rings
      box(gripR, 0.11, 0.11, 1.38, CG.basalt, 0, 0, 0.24);
      box(gripR, 0.14, 0.14, 0.07, CG.gold, 0, 0, -0.14);
      box(gripR, 0.14, 0.14, 0.07, CG.gold, 0, 0, 0.24);
      box(gripR, 0.14, 0.14, 0.07, CG.gold, 0, 0, 0.52);

      // Stepped stone & gold counterweight pommel
      box(gripR, 0.18, 0.18, 0.16, CG.limeM, 0, 0, -0.45);
      box(gripR, 0.12, 0.12, 0.07, CG.goldD, 0, 0, -0.54);
      cyanBox(gripR, 0.06, 0.06, 0.04, CG.cyan, 0, 0, -0.575);

      // Colossal Stepped Voxel Siege Hammer Head at z = +0.84
      const hz = 0.84;
      box(gripR, 0.40, 0.60, 0.42, CG.basaltD, 0, 0, hz);
      box(gripR, 0.44, 0.54, 0.46, CG.lime, 0, 0, hz);
      box(gripR, 0.36, 0.66, 0.36, CG.limeM, 0, 0, hz);
      box(gripR, 0.28, 0.72, 0.28, CG.limeL, 0, 0, hz); // Top & bottom stepped stone impact faces

      // Gold hammer head binding belt & striking face plates
      box(gripR, 0.48, 0.14, 0.50, CG.gold, 0, 0, hz);
      box(gripR, 0.32, 0.05, 0.32, CG.goldD, 0, 0.37, hz);
      box(gripR, 0.32, 0.05, 0.32, CG.goldD, 0, -0.37, hz);

      // Glowing cyan & warm solar power blocks recessed on left/right/front hammer faces
      cyanBox(gripR, 0.47, 0.08, 0.24, CG.cyan, 0, 0.18, hz);
      cyanBox(gripR, 0.47, 0.08, 0.24, CG.cyan, 0, -0.18, hz);
      solarBox(gripR, 0.50, 0.09, 0.18, CG.solar, 0, 0, hz);
      crispBox(gripR, 0.51, 0.045, 0.09, CG.solarH, 0, 0, hz);
      cyanBox(gripR, 0.14, 0.22, 0.05, CG.cyan, 0, 0, hz + 0.24);

      // Ancient moss patch on upper rear edge of hammer head
      addMossClump(box, gripR, 0.08, 0.31, hz - 0.14, 0.18, 0.09, 0.16, 1);
    }

    return { arm, fore, shoulderPad, padBaseY: padY };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Bake all static voxel batches into clean BufferGeometry meshes
  stoneBuilder.finish();
  cyanBuilder.finish();
  solarBuilder.finish();
  crispBuilder.finish();

  const parts = {
    body,
    head,
    eyeVisor,
    eyeCore,
    coreOrb,
    coreInner,
    coreShell,
    coreRingA,
    coreRingB,
    sunHalo,
    innerHaloRing,
    outerRing,
    armL: leftArm.arm,
    foreL: leftArm.fore,
    shoulderPadL: leftArm.shoulderPad,
    armR: rightArm.arm,
    foreR: rightArm.fore,
    shoulderPadR: rightArm.shoulderPad,
    legs,
    shins,
    bodyY: BODY_Y,
    legY: LEG_Y,
    headBaseY,
    sunHaloBaseY,
    sunHaloBaseZ,
    padBaseYL: leftArm.padBaseY,
    padBaseYR: rightArm.padBaseY,
    runeMats: [cyanMat, solarMat],
    crispGlowMat,
  };

  // Initialize exact neutral resting pose (dt = 0 snaps cleanly)
  animateSunRuinsGolem(
    {
      mesh: root,
      parts,
      material: stoneBuilder.material,
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

  return {
    mesh: root,
    parts,
    material: stoneBuilder.material,
  };
}

// ============================================================================
// SMOOTH DAMPED ANIMATOR: animateSunRuinsGolem(st, dt)
// ============================================================================

/**
 * Safe hit-flash handler for both MeshLambertMaterial and emissive/basic voxel meshes.
 * Skips energy-glow materials and cleanly restores emissive to 0x000000 when flash === 0.
 */
function applyHitFlash(st) {
  const em = st.flash && st.flash > 0 ? 0xaa2222 : 0x000000;
  if (st._lastEm === em) return;
  st._lastEm = em;

  const setMat = (m) => {
    if (m && m.emissive && !(m.userData && m.userData.isEnergyGlow)) {
      m.emissive.setHex(em);
    }
  };

  if (Array.isArray(st.material)) {
    for (let i = 0; i < st.material.length; i++) setMat(st.material[i]);
  } else if (st.material) {
    setMat(st.material);
  } else if (st.mesh && typeof st.mesh.traverse === 'function') {
    st.mesh.traverse((o) => {
      if (!o.material) return;
      if (Array.isArray(o.material)) {
        for (let i = 0; i < o.material.length; i++) setMat(o.material[i]);
      } else {
        setMat(o.material);
      }
    });
  }
}

/**
 * Animates the Pure-Voxel Sun Ruins Golem smoothly across idle, walk/stalk,
 * attack_windup, attack_strike, attack_recover, hitstun/stagger, and die states.
 * @param {object} st
 * @param {number} dt
 */
function animateSunRuinsGolem(st, dt) {
  if (!st || !st.parts || !st.parts.body) return;
  const P = st.parts;

  const safeDt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
  const t = (st._t = (st._t || 0) + safeDt);

  applyHitFlash(st);

  const vx = st.vel && Number.isFinite(st.vel.x) ? st.vel.x : 0;
  const vz = st.vel && Number.isFinite(st.vel.z) ? st.vel.z : 0;
  const rawSpeed = Math.hypot(vx, vz);
  const yaw = st.mesh && st.mesh.rotation && Number.isFinite(st.mesh.rotation.y) ? st.mesh.rotation.y : 0;

  const anim =
    st._golemAnim ||
    (st._golemAnim = {
      speedNorm: 0,
      gaitBlend: 0,
      combatBlend: 0,
      telegraphBlend: 0,
      swingBlend: 0,
      impactBlend: 0,
      dieBlend: 0,
      turnLean: 0,
      yaw,
      stepPhase: 0,
      haloAngle: 0,
      coreAngle: 0,
      headScanYaw: 0,
      headPitch: 0.02,
      bodyPitch: 0.03,
      bodyYaw: 0,
      bodyRoll: 0,
      bodyBob: 0,
      bodyZ: 0,
      haloTiltX: 0,
      haloTiltZ: 0,
      energyPulse: 1,
      hipL: -0.05,
      hipR: -0.05,
      kneeL: 0.10,
      kneeR: 0.10,
      lSX: -0.14,
      lSY: 0.16,
      lSZ: -0.14,
      lEX: -0.44,
      lEZ: 0.08,
      rSX: -0.14,
      rSY: -0.08,
      rSZ: 0.14,
      rEX: -0.40,
      rEZ: -0.08,
      windCarry: 0,
      atkActive: false,
      atkT: 0,
      lastSwing: 0,
      lastState: null,
    });

  const aMove = dampRate(7.5, safeDt);
  const aPose = dampRate(6.5, safeDt);
  const aTele = dampRate(11.5, safeDt);
  const aStrike = dampRate(17.5, safeDt);
  const aRecover = dampRate(7.0, safeDt);
  const aDie = dampRate(4.5, safeDt);
  const aTurn = dampRate(7.0, safeDt);

  const isDead = !!(st.dead || st.state === 'die' || (typeof st.hp === 'number' && st.hp <= 0));
  const alive = 1 - anim.dieBlend;

  const targetSpeedNorm = isDead ? 0 : clamp(rawSpeed / 2.2, 0, 1);
  anim.speedNorm += (targetSpeedNorm - anim.speedNorm) * aMove;
  anim.gaitBlend += (smooth(clamp(anim.speedNorm * 1.15, 0, 1)) - anim.gaitBlend) * aMove;
  const inCombat = !!(st.target || st.state === 'stalk' || st.state === 'attack_windup' || st.state === 'attack_strike' || st.state === 'attack_recover');
  anim.combatBlend += ((inCombat && !isDead ? 1 : 0) - anim.combatBlend) * aPose;
  anim.dieBlend += ((isDead ? 1 : 0) - anim.dieBlend) * aDie;

  const rawTele = st.state === 'attack_windup' ? Math.max(st.telegraph || 0, 0.55) : st.telegraph || 0;
  const targetTele = isDead ? 0 : smooth(clamp(rawTele, 0, 1));
  anim.telegraphBlend += (targetTele - anim.telegraphBlend) * aTele;

  // Smooth yaw banking on turns
  const yawDiff = Math.atan2(Math.sin(yaw - anim.yaw), Math.cos(yaw - anim.yaw));
  const instTurn = safeDt > 0.0005 ? clamp(yawDiff / safeDt, -3.5, 3.5) * 0.042 : 0;
  anim.turnLean += (instTurn * alive - anim.turnLean) * aTurn;
  anim.yaw = yaw;

  // Trigger heavy overhead Siege Hammer slam on swing > 0 or attack_strike / slam state
  const curSwing = Number.isFinite(st.swing) ? st.swing : 0;
  const strikeTriggered =
    (curSwing > 0 && (anim.lastSwing <= 0 || curSwing > anim.lastSwing + 0.02)) ||
    ((st.state === 'attack_strike' || st.state === 'slam') &&
      anim.lastState !== 'attack_strike' &&
      anim.lastState !== 'slam');
  if (!isDead && strikeTriggered) {
    anim.atkActive = true;
    anim.atkT = 0;
    anim.windCarry = Math.max(anim.telegraphBlend, 0.85);
  }
  anim.lastSwing = curSwing;
  anim.lastState = st.state || null;

  const ATK_DUR = 0.96;
  if (anim.atkActive) {
    anim.atkT += safeDt;
    if (anim.atkT >= ATK_DUR || isDead) {
      anim.atkActive = false;
      anim.atkT = 0;
      anim.windCarry = 0;
    }
  }

  let strikeTarget = 0;
  let impactTarget = 0;
  let windCarryW = 0;

  if (anim.atkActive) {
    const at = anim.atkT;
    if (at < 0.21) {
      const u = smooth((at + 0.015) / 0.225);
      strikeTarget = u;
      windCarryW = anim.windCarry * (1 - u);
      impactTarget = smooth((u - 0.62) / 0.38) * 0.72;
    } else if (at < 0.42) {
      const u = clamp((at - 0.21) / 0.21, 0, 1);
      strikeTarget = 1.0 - 0.06 * u;
      impactTarget = 0.72 + 0.28 * Math.sin(u * Math.PI);
    } else {
      const u = clamp((at - 0.42) / (ATK_DUR - 0.42), 0, 1);
      const easeOut = 1 - smooth(u);
      strikeTarget = 0.94 * easeOut;
      impactTarget = 0.48 * Math.pow(1 - u, 2);
    }
  }

  const swingRate = strikeTarget > anim.swingBlend ? aStrike : aRecover;
  anim.swingBlend += (strikeTarget - anim.swingBlend) * swingRate;
  anim.impactBlend += (impactTarget - anim.impactBlend) * (impactTarget > anim.impactBlend ? aStrike : aRecover);

  const windW = clamp(Math.max(anim.telegraphBlend, windCarryW) * alive, 0, 1);
  const strikeW = clamp(anim.swingBlend * alive, 0, 1);
  const impactW = clamp(anim.impactBlend * alive, 0, 1);
  const dieW = anim.dieBlend;
  const hitstunW = !isDead && (st.state === 'hitstun' || st.state === 'stagger') ? 1 : 0;

  // Ponderous colossus stride phase
  const gait = anim.gaitBlend * (1 - windW * 0.65) * (1 - strikeW * 0.65) * alive;
  const stepFreq = 3.1 + anim.speedNorm * 1.9;
  anim.stepPhase = (anim.stepPhase + safeDt * stepFreq * (0.08 + gait * 0.92)) % TAU;
  const sinP = Math.sin(anim.stepPhase);
  const cosP = Math.cos(anim.stepPhase);
  const strideAmp = (0.35 + anim.speedNorm * 0.11) * gait;

  // --------------------------------------------------------------------------
  // 1. LEGS & KNEES: Weighted stride, braced windup/slam, limp die buckle
  // --------------------------------------------------------------------------
  if (P.legs && P.legs.length >= 2) {
    const targetHipL =
      -0.05 * alive - sinP * strideAmp - windW * 0.18 - impactW * 0.30 - dieW * 0.56;
    const targetHipR =
      -0.05 * alive + sinP * strideAmp + windW * 0.14 - impactW * 0.30 - dieW * 0.62;

    anim.hipL = damp(anim.hipL, targetHipL, 12.0, safeDt);
    anim.hipR = damp(anim.hipR, targetHipR, 12.0, safeDt);

    P.legs[0].rotation.set(anim.hipL, 0.04, -0.05 - windW * 0.035);
    P.legs[1].rotation.set(anim.hipR, -0.04, 0.05 + windW * 0.035);

    if (P.shins && P.shins.length >= 2) {
      const liftL = Math.max(0, cosP) * 0.54 * gait + Math.max(0, -targetHipL) * 0.14 * gait;
      const liftR = Math.max(0, -cosP) * 0.54 * gait + Math.max(0, -targetHipR) * 0.14 * gait;

      const targetKneeL = 0.10 * alive + liftL + windW * 0.22 + impactW * 0.50 + dieW * 1.12;
      const targetKneeR = 0.10 * alive + liftR + windW * 0.18 + impactW * 0.50 + dieW * 1.18;

      anim.kneeL = damp(anim.kneeL, targetKneeL, 12.0, safeDt);
      anim.kneeR = damp(anim.kneeR, targetKneeR, 12.0, safeDt);

      P.shins[0].rotation.x = anim.kneeL;
      P.shins[1].rotation.x = anim.kneeR;
    }
  }

  // --------------------------------------------------------------------------
  // 2. TORSO / BODY: Heavy breathing, gait roll, windup coil -> slam crunch
  // --------------------------------------------------------------------------
  const breathe = Math.sin(t * 1.45) * 0.020 * alive;
  const strideDouble = Math.cos(anim.stepPhase * 2);
  const strideBob = (0.040 * strideDouble - 0.022) * gait;
  const plantStomp = -Math.max(0, -strideDouble) * 0.028 * gait;

  const targetBodyPitch =
    0.03 +
    0.07 * gait +
    0.05 * anim.combatBlend -
    0.32 * windW +
    0.46 * strikeW -
    0.10 * hitstunW +
    Math.sin(t * 1.45) * 0.016 * alive +
    dieW * 0.65;
  const targetBodyYaw = -sinP * 0.11 * gait - 0.22 * windW + 0.34 * strikeW;
  const targetBodyRoll = cosP * 0.05 * gait - anim.turnLean + dieW * 0.10;
  const targetBodyBob = breathe + strideBob + plantStomp - windW * 0.06 - impactW * 0.24 - dieW * 0.52;
  const targetBodyZ = -0.09 * windW + 0.20 * strikeW + dieW * 0.16;

  anim.bodyPitch += (targetBodyPitch - anim.bodyPitch) * aPose;
  anim.bodyYaw += (targetBodyYaw - anim.bodyYaw) * aMove;
  anim.bodyRoll += (targetBodyRoll - anim.bodyRoll) * aTurn;
  anim.bodyBob += (targetBodyBob - anim.bodyBob) * aTele;
  anim.bodyZ += (targetBodyZ - anim.bodyZ) * aTele;

  const bodyBaseY = P.bodyY ?? 1.62;
  P.body.position.set(-sinP * 0.042 * gait, bodyBaseY + anim.bodyBob, anim.bodyZ);
  P.body.rotation.set(anim.bodyPitch, anim.bodyYaw, anim.bodyRoll);

  // --------------------------------------------------------------------------
  // 3. NECKLESS MONOLITH VOXEL HEAD: Gentle levitation & sentinel scanning
  // --------------------------------------------------------------------------
  if (P.head) {
    const calmFactor = (1 - anim.combatBlend) * (1 - gait * 0.7) * (1 - windW) * (1 - strikeW) * alive;
    const rawScan = clamp((Math.sin(t * 0.62) + 0.35 * Math.sin(t * 1.37)) * 0.26, -0.34, 0.34);
    const targetHeadYaw = rawScan * calmFactor - anim.bodyYaw * 0.50;
    const targetHeadPitch = 0.02 - 0.14 * windW + 0.16 * strikeW + Math.sin(t * 1.45) * 0.018 * alive + dieW * 0.36;

    anim.headScanYaw += (targetHeadYaw - anim.headScanYaw) * aPose;
    anim.headPitch += (targetHeadPitch - anim.headPitch) * aPose;

    const headFloat = Math.sin(t * 1.75 + 0.6) * 0.028 * alive - dieW * 0.12;
    P.head.position.y = (P.headBaseY ?? 1.53) + headFloat;
    P.head.rotation.set(anim.headPitch, anim.headScanYaw, -anim.turnLean * 0.35);
  }

  // --------------------------------------------------------------------------
  // 4. PIXEL-STEPPED DORSAL SUN HALO: Continuous spin + inertia tilt
  // --------------------------------------------------------------------------
  const haloSpinSpeed = (0.44 + anim.combatBlend * 0.28 + windW * 1.15 + strikeW * 0.95) * alive;
  anim.haloAngle = (anim.haloAngle + safeDt * haloSpinSpeed) % TAU;

  if (P.outerRing) P.outerRing.rotation.z = anim.haloAngle;
  if (P.innerHaloRing) P.innerHaloRing.rotation.z = -anim.haloAngle * 0.68;

  if (P.sunHalo) {
    const haloHoverY = Math.sin(t * 1.45 + 1.1) * 0.04 * alive + windW * 0.08 - dieW * 0.20;
    const haloHoverZ = Math.cos(t * 1.15) * 0.02 * alive - windW * 0.07 + strikeW * 0.09;
    const targetHaloTiltX = 0.08 * gait - anim.bodyPitch * 0.40 + strikeW * 0.20 + dieW * 0.28;
    const targetHaloTiltZ = -anim.turnLean * 0.85 - anim.bodyRoll * 0.65;

    anim.haloTiltX += (targetHaloTiltX - anim.haloTiltX) * aPose;
    anim.haloTiltZ += (targetHaloTiltZ - anim.haloTiltZ) * aTurn;

    P.sunHalo.position.set(0, (P.sunHaloBaseY ?? 1.11) + haloHoverY, (P.sunHaloBaseZ ?? -0.62) + haloHoverZ);
    P.sunHalo.rotation.set(anim.haloTiltX, 0, anim.haloTiltZ);
  }

  // --------------------------------------------------------------------------
  // 5. SOLAR HEART CORE & CYAN/SOLAR RUNE PULSE
  // --------------------------------------------------------------------------
  const coreSpinSpeed = (1.1 + windW * 2.8 + strikeW * 2.4) * alive;
  anim.coreAngle = (anim.coreAngle + safeDt * coreSpinSpeed) % TAU;

  const targetEnergy = (1.0 + 0.16 * Math.sin(t * 2.5) + 0.90 * windW + 1.10 * strikeW) * (0.06 + 0.94 * alive);
  anim.energyPulse += (targetEnergy - anim.energyPulse) * aTele;

  if (P.coreOrb) {
    const coreScale = (0.94 + 0.07 * Math.sin(t * 2.5) + 0.15 * windW + 0.20 * strikeW) * (0.65 + 0.35 * alive);
    P.coreOrb.scale.setScalar(coreScale);
    if (P.coreInner) P.coreInner.rotation.set(anim.coreAngle * 0.7, anim.coreAngle, 0);
    if (P.coreShell) P.coreShell.rotation.set(-anim.coreAngle * 0.5, -anim.coreAngle * 0.8, anim.coreAngle * 0.3);
    if (P.coreRingA) P.coreRingA.rotation.set(0.58 + anim.coreAngle * 0.8, anim.coreAngle * 0.6, anim.coreAngle * 0.35);
    if (P.coreRingB) P.coreRingB.rotation.set(-0.48 - anim.coreAngle * 0.65, -anim.coreAngle * 0.9, 0.4 + anim.coreAngle * 0.5);
  }

  if (P.runeMats) {
    for (let i = 0; i < P.runeMats.length; i++) {
      const rm = P.runeMats[i];
      const baseInt = (rm.userData && rm.userData.baseIntensity) || 1.15;
      rm.emissiveIntensity = baseInt * anim.energyPulse;
    }
  }
  if (P.crispGlowMat) {
    const glowMul = clamp(0.18 + 0.82 * alive * (0.85 + 0.15 * Math.sin(t * 2.5)), 0.15, 1.0);
    P.crispGlowMat.color.setScalar(glowMul);
  }

  // --------------------------------------------------------------------------
  // 6. ARMS, BUCKLER SHIELD GUARD, SIEGE HAMMER OVERHEAD SLAM & SHOULDER BOULDERS
  // --------------------------------------------------------------------------
  if (P.armL && P.foreL && P.armR && P.foreR) {
    const armSwingAmp = 0.40 * gait * (1 - windW) * (1 - strikeW);
    const swingL = sinP * armSwingAmp;
    const swingR = -sinP * armSwingAmp;

    const elbowLagL = Math.max(0, -sinP) * 0.24 * gait + Math.max(0, -cosP) * 0.14 * gait;
    const elbowLagR = Math.max(0, sinP) * 0.24 * gait + Math.max(0, cosP) * 0.14 * gait;

    // Neutral & combat guard stance
    let lSX = -0.14 + swingL - 0.18 * anim.combatBlend + Math.sin(t * 1.45 + 0.4) * 0.025 * alive;
    let lSY = 0.16 + 0.22 * anim.combatBlend;
    let lSZ = -0.14 - 0.05 * anim.combatBlend;
    let lEX = -0.44 - elbowLagL - 0.24 * anim.combatBlend + Math.cos(t * 1.45) * 0.02 * alive;
    let lEZ = 0.08;

    let rSX = -0.14 + swingR - 0.12 * anim.combatBlend - Math.sin(t * 1.45 + 0.4) * 0.025 * alive;
    let rSY = -0.08 - 0.08 * anim.combatBlend;
    let rSZ = 0.14 + 0.05 * anim.combatBlend;
    let rEX = -0.40 - elbowLagR - 0.18 * anim.combatBlend - Math.cos(t * 1.45) * 0.02 * alive;
    let rEZ = -0.08;

    // Windup (telegraph): Heavy left stone fist and right Siege Hammer both raise for a devastating slam!
    const tremor = windW > 0.45 ? Math.sin(t * 28) * 0.022 * windW : 0;
    lSX = lerp(lSX, -2.05 + tremor, windW);
    lSY = lerp(lSY, -0.14, windW);
    lSZ = lerp(lSZ, -0.22, windW);
    lEX = lerp(lEX, -0.52, windW);
    lEZ = lerp(lEZ, 0.08, windW);

    rSX = lerp(rSX, -2.75 - tremor, windW);
    rSY = lerp(rSY, 0.14, windW);
    rSZ = lerp(rSZ, 0.24, windW);
    rEX = lerp(rEX, -0.48, windW);
    rEZ = lerp(rEZ, -0.10, windW);

    // Strike (slam): Siege Hammer and heavy left stone fist smash forward together!
    lSX = lerp(lSX, -0.34, strikeW);
    lSY = lerp(lSY, 0.16, strikeW);
    lSZ = lerp(lSZ, -0.06, strikeW);
    lEX = lerp(lEX, -0.22, strikeW);
    lEZ = lerp(lEZ, 0.04, strikeW);

    rSX = lerp(rSX, -0.26, strikeW);
    rSY = lerp(rSY, -0.16, strikeW);
    rSZ = lerp(rSZ, 0.06, strikeW);
    rEX = lerp(rEX, -0.16, strikeW);
    rEZ = lerp(rEZ, 0.04, strikeW);

    // Die: Heavy limp slump
    lSX = lerp(lSX, -0.22, dieW);
    lSZ = lerp(lSZ, -0.20, dieW);
    lEX = lerp(lEX, -0.16, dieW);

    rSX = lerp(rSX, -0.24, dieW);
    rSZ = lerp(rSZ, 0.20, dieW);
    rEX = lerp(rEX, -0.14, dieW);

    const aArm = anim.atkActive || windW > 0.02 ? dampRate(19.0, safeDt) : dampRate(11.0, safeDt);
    anim.lSX += (lSX - anim.lSX) * aArm;
    anim.lSY += (lSY - anim.lSY) * aArm;
    anim.lSZ += (lSZ - anim.lSZ) * aArm;
    anim.lEX += (lEX - anim.lEX) * aArm;
    anim.lEZ += (lEZ - anim.lEZ) * aArm;

    anim.rSX += (rSX - anim.rSX) * aArm;
    anim.rSY += (rSY - anim.rSY) * aArm;
    anim.rSZ += (rSZ - anim.rSZ) * aArm;
    anim.rEX += (rEX - anim.rEX) * aArm;
    anim.rEZ += (rEZ - anim.rEZ) * aArm;

    P.armL.rotation.set(anim.lSX, anim.lSY, anim.lSZ);
    P.foreL.rotation.set(anim.lEX, 0, anim.lEZ);
    P.armR.rotation.set(anim.rSX, anim.rSY, anim.rSZ);
    P.foreR.rotation.set(anim.rEX, 0, anim.rEZ);

    // Hovering mossy shoulder boulders float smoothly
    if (P.shoulderPadL) {
      const floatL = Math.sin(t * 1.9) * 0.038 * alive + windW * 0.07 - impactW * 0.04 - dieW * 0.13;
      P.shoulderPadL.position.y = (P.padBaseYL ?? 0.22) + floatL;
      P.shoulderPadL.rotation.set(0, 0, Math.sin(t * 1.5) * 0.04 * alive + windW * 0.12 - dieW * 0.16);
    }
    if (P.shoulderPadR) {
      const floatR = Math.sin(t * 1.9 + 1.4) * 0.038 * alive + windW * 0.07 - impactW * 0.04 - dieW * 0.13;
      P.shoulderPadR.position.y = (P.padBaseYR ?? 0.25) + floatR;
      P.shoulderPadR.rotation.set(0, 0, -Math.sin(t * 1.5 + 0.8) * 0.04 * alive - windW * 0.12 + dieW * 0.16);
    }
  }
}

export { buildSunRuinsGolem, animateSunRuinsGolem };
