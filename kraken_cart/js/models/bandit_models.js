import { HC } from '../hc.js';

const THREE = HC.THREE;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/* =============================================================================
   SYLVAN VOXEL JOINT BUILDER (1 draw call per joint, isolated material/rig)
   ============================================================================= */
function createVoxelBuilder(isMobile = false) {
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
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });

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

      const pos = unit.attributes.position;
      const norm = unit.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        data.p.push(v.x, v.y, v.z);
        n.fromBufferAttribute(norm, i).applyMatrix3(normalMat).normalize();
        data.n.push(n.x, n.y, n.z);
        data.c.push(tint.r, tint.g, tint.b);
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
        mesh.castShadow = !isMobile;
        parent.add(mesh);
      }
      unit.dispose();
    },
  };
}

function makeJoint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function applyHitFlash(st) {
  const em = st.flash && st.flash > 0 ? 0xaa2222 : 0x000000;
  if (st._lastEm === em) return;
  st._lastEm = em;
  if (st.material && st.material.emissive) {
    st.material.emissive.setHex(em);
  } else if (st.mesh && typeof st.mesh.traverse === 'function') {
    st.mesh.traverse((o) => {
      if (o.material && o.material.emissive) o.material.emissive.setHex(em);
    });
  }
}

/* =============================================================================
   1. SMALL BANDIT — Forest Bandit Scout / Cutthroat (~1.56 m)
   ============================================================================= */
const CS = {
  tunic:    0x454f3d,
  tunicD:   0x2c3428,
  tunicL:   0x5d6952,
  leather:  0x3d2c22,
  leatherD: 0x221813,
  leatherL: 0x594233,
  crimson:  0x9e2226,
  crimsonD: 0x6b1418,
  crimsonL: 0xc23338,
  hood:     0x25282c,
  hoodD:    0x16181b,
  hoodL:    0x383d44,
  iron:     0x6e7680,
  ironD:    0x424850,
  steel:    0xb6c2ce,
  steelD:   0x74808c,
  steelH:   0xe6eff8,
  skin:     0xc89268,
  skinD:    0xa46f48,
  scar:     0x8f433b,
  hair:     0x1e1916,
  gold:     0xd9a834,
  goldD:    0x997018,
  sole:     0x120e0b,
};

/**
 * Builds the procedural Forest Bandit Scout / Cutthroat (~1.56 m tall).
 * @param {boolean} [isMobile=false]
 */
function buildSmallBandit(isMobile = false) {
  const g = new THREE.Group();
  const builder = createVoxelBuilder(isMobile);
  const box = builder.box;

  const BODY_Y = 0.84;
  const LEG_Y = 0.560;

  // --- 1. 2-JOINT ARTICULATED LEGS (thigh -> knee/shin -> strapped boots) ---
  const legs = [];
  const shins = [];
  for (const side of [1, -1]) {
    const lg = makeJoint(g, 0.115 * side, LEG_Y, 0);
    // Olive-slate trousers & thigh leather strap
    box(lg, 0.175, 0.23, 0.19, CS.tunicD, 0, -0.105, 0);
    box(lg, 0.188, 0.036, 0.202, CS.leatherD, 0, -0.15, 0);
    if (side === 1) {
      // Strapped throwing-knife thigh holster on right leg
      box(lg, 0.038, 0.14, 0.056, CS.leather, 0.095, -0.095, 0.02, 0.12, 0, 0);
      box(lg, 0.026, 0.05, 0.024, CS.iron, 0.098, -0.02, 0.03, 0.12, 0, 0);
    } else {
      box(lg, 0.032, 0.08, 0.12, CS.leatherL, -0.09, -0.10, 0);
    }

    const shin = makeJoint(lg, 0, -0.24, 0);
    // Iron knee guard + rivets
    box(shin, 0.14, 0.085, 0.05, CS.ironD, 0, 0.015, 0.095);
    box(shin, 0.095, 0.05, 0.025, CS.iron, 0, 0.015, 0.115);
    box(shin, 0.02, 0.02, 0.015, CS.steel, side * 0.042, 0.015, 0.115);

    // Calf & crisscrossed leather leg wraps
    box(shin, 0.155, 0.16, 0.17, CS.hood, 0, -0.08, 0);
    box(shin, 0.166, 0.028, 0.18, CS.leather, 0, -0.048, 0, 0.1, 0, 0);
    box(shin, 0.164, 0.028, 0.178, CS.leatherL, 0, -0.108, 0, -0.1, 0, 0);

    // Strapped rogue boot cuff, foot & sole sitting at y = 0
    box(shin, 0.172, 0.045, 0.188, CS.leatherL, 0, -0.15, 0.005);
    box(shin, 0.03, 0.03, 0.02, CS.iron, side * 0.082, -0.15, 0.03);
    box(shin, 0.155, 0.11, 0.175, CS.leatherD, 0, -0.21, 0.005);
    box(shin, 0.165, 0.075, 0.23, CS.leatherD, 0, -0.268, 0.032);
    box(shin, 0.135, 0.05, 0.07, CS.leather, 0, -0.275, 0.125);
    box(shin, 0.175, 0.030, 0.25, CS.sole, 0, -0.305, 0.035);

    lg.userData.shin = shin;
    legs.push(lg);
    shins.push(shin);
  }

  // --- 2. TORSO: RAGGED TUNIC, BANDOLIER + 3 THROWING DAGGERS, POUCH & CAPE ---
  const body = makeJoint(g, 0, BODY_Y, 0);

  box(body, 0.45, 0.45, 0.29, CS.tunic, 0, 0.02, 0);
  box(body, 0.42, 0.32, 0.10, CS.leather, 0, 0.06, 0.115);
  box(body, 0.41, 0.32, 0.07, CS.leatherD, 0, 0.05, -0.12);
  // Collar cowl wrap
  box(body, 0.34, 0.07, 0.28, CS.hoodD, 0, 0.24, 0.01);
  box(body, 0.30, 0.055, 0.04, CS.crimsonD, 0, 0.22, 0.145);

  // Tattered asymmetrical tunic hem around waist
  box(body, 0.47, 0.10, 0.31, CS.tunicD, 0, -0.19, 0);
  box(body, 0.14, 0.12, 0.035, CS.tunic, -0.13, -0.25, 0.155, -0.06, 0, 0.08);
  box(body, 0.13, 0.14, 0.035, CS.tunicL, 0.03, -0.26, 0.158, -0.05, 0, -0.04);
  box(body, 0.12, 0.10, 0.035, CS.tunicD, 0.16, -0.24, 0.15, -0.08, 0, -0.08);
  box(body, 0.10, 0.16, 0.03, CS.crimsonD, -0.15, -0.21, 0.162, -0.08, 0, 0.14);
  box(body, 0.16, 0.13, 0.035, CS.tunicD, -0.08, -0.25, -0.15, 0.06, 0, 0.05);
  box(body, 0.15, 0.11, 0.035, CS.tunic, 0.11, -0.24, -0.15, 0.08, 0, -0.06);

  // Thick leather belt + tarnished iron buckle
  box(body, 0.48, 0.075, 0.325, CS.leatherD, 0, -0.11, 0);
  box(body, 0.10, 0.09, 0.035, CS.iron, 0, -0.11, 0.162);
  box(body, 0.055, 0.045, 0.02, 0x161210, 0, -0.11, 0.175);

  // Stolen gold coin pouch at right hip + small pouch at left hip
  box(body, 0.105, 0.12, 0.095, CS.leatherL, 0.23, -0.15, 0.09);
  box(body, 0.065, 0.035, 0.065, CS.leatherD, 0.23, -0.085, 0.09);
  box(body, 0.072, 0.02, 0.072, CS.gold, 0.23, -0.085, 0.09);
  box(body, 0.045, 0.025, 0.045, CS.gold, 0.24, -0.065, 0.10);
  box(body, 0.038, 0.02, 0.038, CS.goldD, 0.215, -0.068, 0.08);
  box(body, 0.09, 0.10, 0.08, CS.leatherD, -0.22, -0.14, 0.08);
  box(body, 0.03, 0.03, 0.02, CS.iron, -0.22, -0.11, 0.125);

  // Crisscrossed throwing-knife bandolier across chest + 3 miniature throwing daggers
  box(body, 0.48, 0.052, 0.032, CS.leatherD, 0, 0.06, 0.168, 0, 0, -0.62);
  box(body, 0.44, 0.042, 0.028, CS.leatherL, 0, 0.05, 0.162, 0, 0, 0.56);
  box(body, 0.048, 0.048, 0.022, CS.iron, 0, 0.06, 0.180);
  box(body, 0.055, 0.07, 0.035, CS.leather, -0.14, -0.02, 0.175, 0, 0, 0.1);

  const knifeSlot = (kx, ky, kz, krz) => {
    const c = Math.cos(krz);
    const s = Math.sin(krz);
    const kbox = (w, h, d, col, ox, oy, oz) => {
      box(body, w, h, d, col, kx + ox * c - oy * s, ky + ox * s + oy * c, kz + oz, 0, 0, krz);
    };
    kbox(0.022, 0.062, 0.018, CS.leatherD, 0, 0.042, 0);
    kbox(0.028, 0.020, 0.020, CS.iron, 0, 0.078, 0);
    kbox(0.048, 0.016, 0.020, CS.ironD, 0, 0.008, 0);
    kbox(0.026, 0.092, 0.012, CS.steelH, 0, -0.045, 0);
    kbox(0.014, 0.072, 0.016, CS.steelD, 0, -0.042, 0.002);
  };
  knifeSlot(-0.12, 0.14, 0.184, 0.52);
  knifeSlot(-0.02, 0.07, 0.186, 0.52);
  knifeSlot(0.09, 0.00, 0.184, 0.52);

  // Tattered crimson-charcoal scout half-cape (parts.cloak)
  const cloak = makeJoint(body, 0, 0.21, -0.155);
  box(cloak, 0.46, 0.07, 0.07, CS.crimsonD, 0, -0.01, 0);
  box(cloak, 0.42, 0.26, 0.035, CS.crimson, 0, -0.14, -0.02, 0.09, 0, 0);
  box(cloak, 0.38, 0.24, 0.02, CS.hood, 0, -0.14, -0.005, 0.09, 0, 0);
  box(cloak, 0.17, 0.24, 0.028, CS.crimsonD, -0.11, -0.34, -0.045, 0.14, 0, -0.08);
  box(cloak, 0.15, 0.18, 0.028, CS.hood, 0.10, -0.31, -0.04, 0.12, 0, 0.06);
  box(cloak, 0.12, 0.26, 0.024, CS.crimson, 0, -0.37, -0.05, 0.16, 0, 0);

  // --- 3. HEAD: SHADOWED HOOD, CRIMSON BANDANA MASK, BANGS, SCAR, BROWS ---
  const head = makeJoint(body, 0, 0.405, 0.015);
  box(head, 0.31, 0.29, 0.30, CS.skin, 0, 0.01, 0);
  box(head, 0.28, 0.08, 0.28, CS.skinD, 0, -0.11, 0.01);
  box(head, 0.055, 0.065, 0.06, CS.skinD, 0, -0.005, 0.165);
  // Subtle cheek scar above mask
  box(head, 0.065, 0.016, 0.015, CS.scar, -0.09, -0.005, 0.155, 0, 0, -0.38);

  // Crimson bandana lower-face mask + back knot & tails
  box(head, 0.335, 0.145, 0.17, CS.crimson, 0, -0.08, 0.09);
  box(head, 0.12, 0.04, 0.04, CS.crimsonL, 0, -0.01, 0.165);
  box(head, 0.30, 0.04, 0.03, CS.crimsonD, 0, -0.09, 0.178);
  box(head, 0.33, 0.075, 0.32, CS.crimsonD, 0, -0.09, 0);
  box(head, 0.07, 0.06, 0.05, CS.crimson, 0, -0.085, -0.17);
  box(head, 0.045, 0.14, 0.02, CS.crimson, -0.04, -0.14, -0.195, 0.32, 0, -0.28);
  box(head, 0.04, 0.11, 0.02, CS.crimsonL, 0.045, -0.13, -0.19, 0.26, 0, 0.34);

  // Narrowed eyes with white glint + expressive brows
  const brows = [];
  for (const s of [1, -1]) {
    box(head, 0.072, 0.038, 0.02, 0xffffff, 0.076 * s, 0.032, 0.149);
    box(head, 0.038, 0.038, 0.02, 0x261a10, 0.074 * s, 0.032, 0.156);
    box(head, 0.015, 0.015, 0.01, 0xffffff, 0.084 * s, 0.041, 0.163);
    const brow = makeJoint(head, 0.076 * s, 0.066, 0.160);
    box(brow, 0.092, 0.026, 0.026, CS.hair, 0, 0, 0);
    brows.push({ brow, side: s });
  }

  // Dark spiky hair bangs peeking from hood rim
  box(head, 0.055, 0.08, 0.045, CS.hair, -0.045, 0.105, 0.162, 0.25, 0, 0.22);
  box(head, 0.048, 0.07, 0.04, CS.hair, 0.02, 0.115, 0.165, 0.22, 0, -0.15);
  box(head, 0.045, 0.075, 0.04, CS.hair, -0.11, 0.095, 0.15, 0.15, 0, 0.35);
  box(head, 0.045, 0.07, 0.04, CS.hair, 0.10, 0.10, 0.15, 0.15, 0, -0.30);

  // Deep shadowed rogue hood/cowl (top reaches ~1.56 m)
  box(head, 0.39, 0.16, 0.38, CS.hood, 0, 0.17, -0.015);
  box(head, 0.055, 0.26, 0.27, CS.hoodD, -0.178, 0.04, -0.02);
  box(head, 0.055, 0.26, 0.27, CS.hoodD, 0.178, 0.04, -0.02);
  box(head, 0.38, 0.24, 0.14, CS.hoodD, 0, 0.04, -0.14);
  box(head, 0.40, 0.07, 0.15, CS.hoodL, 0, 0.195, 0.135, 0.24, 0, 0);
  box(head, 0.26, 0.09, 0.24, CS.hood, 0, 0.255, -0.03, -0.12, 0, 0);
  box(head, 0.14, 0.075, 0.16, CS.hoodD, 0, 0.28, -0.14, -0.25, 0, 0);

  // --- 4. LEFT ARM (SPIKED LEATHER PAULDRON + BRACER + REVERSE-GRIP DIRK) ---
  const armL = makeJoint(body, -0.295, 0.165, 0);
  box(armL, 0.19, 0.09, 0.20, CS.leather, -0.02, 0.04, 0, 0, 0, 0.18);
  box(armL, 0.17, 0.06, 0.18, CS.leatherD, -0.04, -0.02, 0, 0, 0, 0.24);
  box(armL, 0.024, 0.024, 0.02, CS.iron, -0.09, 0.03, 0.06);
  box(armL, 0.024, 0.024, 0.02, CS.iron, -0.09, 0.03, -0.06);
  box(armL, 0.032, 0.095, 0.032, CS.iron, -0.06, 0.10, 0.035, 0.15, 0, 0.45);
  box(armL, 0.028, 0.08, 0.028, CS.iron, -0.05, 0.09, -0.045, -0.15, 0, 0.45);
  box(armL, 0.125, 0.19, 0.135, CS.tunicD, 0, -0.095, 0);

  const foreL = makeJoint(armL, 0, -0.195, 0);
  box(foreL, 0.135, 0.15, 0.14, CS.leather, 0, -0.085, 0);
  box(foreL, 0.142, 0.025, 0.148, CS.leatherD, 0, -0.04, 0);
  box(foreL, 0.142, 0.025, 0.148, CS.leatherD, 0, -0.13, 0);
  box(foreL, 0.02, 0.02, 0.02, CS.steel, -0.072, -0.085, 0.03);
  box(foreL, 0.02, 0.02, 0.02, CS.steel, -0.072, -0.085, -0.03);
  box(foreL, 0.115, 0.085, 0.12, CS.leatherD, 0, -0.19, 0.01);

  const gripL = makeJoint(foreL, 0, -0.20, 0.035);
  // Reverse-grip parrying dirk extending back (-Z) along left forearm
  box(gripL, 0.042, 0.042, 0.035, CS.iron, 0, 0, 0.11);
  box(gripL, 0.036, 0.038, 0.14, CS.leatherD, 0, 0, 0.02);
  box(gripL, 0.14, 0.032, 0.035, CS.ironD, 0, 0, -0.055);
  box(gripL, 0.025, 0.045, 0.04, CS.iron, 0.068, 0.01, -0.075, -0.35, 0, 0);
  box(gripL, 0.025, 0.045, 0.04, CS.iron, -0.068, 0.01, -0.075, -0.35, 0, 0);
  box(gripL, 0.020, 0.042, 0.34, CS.steelD, 0, 0.008, -0.24);
  box(gripL, 0.012, 0.046, 0.34, CS.steelH, 0, -0.008, -0.24);
  box(gripL, 0.016, 0.022, 0.04, CS.steel, 0, 0.032, -0.19);
  box(gripL, 0.014, 0.024, 0.08, 0xffffff, 0, -0.002, -0.43);

  // --- 5. RIGHT ARM (LIGHT STRAP + BRACER + SERRATED CURVED DAGGER) ---
  const armR = makeJoint(body, 0.295, 0.165, 0);
  box(armR, 0.145, 0.06, 0.155, CS.leatherD, 0.01, 0.02, 0, 0, 0, -0.15);
  box(armR, 0.03, 0.03, 0.02, CS.iron, 0.06, 0.02, 0.06);
  box(armR, 0.125, 0.19, 0.135, CS.tunic, 0, -0.095, 0);
  box(armR, 0.135, 0.028, 0.145, CS.leather, 0, -0.12, 0);

  const foreR = makeJoint(armR, 0, -0.195, 0);
  box(foreR, 0.135, 0.15, 0.14, CS.leather, 0, -0.085, 0);
  box(foreR, 0.142, 0.025, 0.148, CS.leatherD, 0, -0.04, 0);
  box(foreR, 0.142, 0.025, 0.148, CS.leatherD, 0, -0.13, 0);
  box(foreR, 0.02, 0.02, 0.02, CS.steel, 0.072, -0.085, 0.03);
  box(foreR, 0.02, 0.02, 0.02, CS.steel, 0.072, -0.085, -0.03);
  box(foreR, 0.115, 0.085, 0.12, CS.leatherD, 0, -0.19, 0.01);

  const gripR = makeJoint(foreR, 0, -0.20, 0.045);
  // Serrated curved steel dagger extending forward (+Z)
  box(gripR, 0.044, 0.046, 0.04, CS.iron, 0, 0, -0.105);
  box(gripR, 0.038, 0.04, 0.14, CS.leatherD, 0, 0, -0.015);
  box(gripR, 0.135, 0.034, 0.038, CS.iron, 0, 0, 0.065);
  box(gripR, 0.018, 0.052, 0.24, CS.steel, 0, 0.004, 0.20);
  box(gripR, 0.010, 0.024, 0.24, CS.steelH, 0, -0.018, 0.20);
  box(gripR, 0.016, 0.024, 0.034, CS.steelD, 0, 0.034, 0.13, 0.25, 0, 0);
  box(gripR, 0.016, 0.024, 0.034, CS.steelD, 0, 0.034, 0.20, 0.25, 0, 0);
  box(gripR, 0.016, 0.024, 0.034, CS.steelD, 0, 0.034, 0.27, 0.25, 0, 0);
  box(gripR, 0.015, 0.042, 0.16, CS.steelH, 0, 0.02, 0.37, -0.16, 0, 0);
  box(gripR, 0.012, 0.022, 0.07, 0xffffff, 0, 0.036, 0.46, -0.22, 0, 0);

  builder.finish();

  const parts = {
    body,
    head,
    armL,
    foreL,
    armR,
    foreR,
    gripL,
    gripR,
    legs,
    shins,
    cloak,
    brows,
    bodyY: BODY_Y,
  };

  animateSmallBandit(
    { mesh: g, parts, material: builder.material, vel: { x: 0, z: 0 }, flash: 0, swing: 0, telegraph: 0 },
    0
  );

  return { mesh: g, parts, material: builder.material };
}

/* =============================================================================
   2. BIG BANDIT — Forest Bandit Marauder / Brute (~2.45 m)
   ============================================================================= */
const CB = {
  skin:     0xb87e58,
  skinD:    0x8f5d3e,
  scar:     0x853b34,
  shirt:    0x2a2420,
  leather:  0x452d1d,
  leatherD: 0x291a10,
  leatherL: 0x62422b,
  iron:     0x444b54,
  ironD:    0x2a2f36,
  ironL:    0x68727e,
  steel:    0xa2aebc,
  steelD:   0x606b78,
  steelH:   0xe2ecf6,
  fur:      0x5c4634,
  furD:     0x3b2c20,
  furL:     0x846850,
  crimson:  0x7c1d1f,
  crimsonD: 0x4d1012,
  wood:     0x5c3c20,
  woodD:    0x3b2411,
  hair:     0x1c1510,
  hairL:    0x32261d,
  eye:      0xffaa28,
  eyeH:     0xffe688,
  sack:     0x785c3a,
  gold:     0xd9a42a,
  sole:     0x110e0c,
};

/**
 * Builds the procedural Forest Bandit Marauder / Brute (~2.45 m tall, ~0.76 m chest width).
 * @param {boolean} [isMobile=false]
 */
function buildBigBandit(isMobile = false) {
  const g = new THREE.Group();
  const builder = createVoxelBuilder(isMobile);
  const box = builder.box;

  const BODY_Y = 1.35;
  const LEG_Y = 0.885;

  // --- 1. 2-JOINT HEAVY LEGS (studded trousers -> spiked knees & riveted greaves -> war boots) ---
  const legs = [];
  const shins = [];
  for (const side of [1, -1]) {
    const lg = makeJoint(g, 0.205 * side, LEG_Y, 0);
    // Studded leather trousers
    box(lg, 0.29, 0.38, 0.31, CB.leather, 0, -0.18, 0);
    box(lg, 0.05, 0.28, 0.24, CB.leatherD, side * 0.145, -0.17, 0);
    box(lg, 0.028, 0.028, 0.022, CB.ironL, side * 0.172, -0.09, 0.06);
    box(lg, 0.028, 0.028, 0.022, CB.ironL, side * 0.172, -0.09, -0.06);
    box(lg, 0.028, 0.028, 0.022, CB.ironL, side * 0.172, -0.22, 0.06);
    box(lg, 0.028, 0.028, 0.022, CB.ironL, side * 0.172, -0.22, -0.06);
    box(lg, 0.305, 0.055, 0.325, CB.leatherD, 0, -0.32, 0);

    const shin = makeJoint(lg, 0, -0.38, 0);
    // Spiked knee plate
    box(shin, 0.24, 0.14, 0.075, CB.iron, 0, 0.02, 0.16);
    box(shin, 0.17, 0.09, 0.035, CB.ironL, 0, 0.02, 0.19);
    box(shin, 0.05, 0.05, 0.09, CB.steel, 0, 0.02, 0.235);

    // Calf & riveted iron shin greave
    box(shin, 0.265, 0.28, 0.28, CB.leatherD, 0, -0.13, 0);
    box(shin, 0.20, 0.24, 0.06, CB.iron, 0, -0.14, 0.135);
    box(shin, 0.06, 0.22, 0.03, CB.ironL, 0, -0.14, 0.165);
    for (const rx of [-0.065, 0.065]) {
      for (const ry of [-0.07, -0.20]) {
        box(shin, 0.024, 0.024, 0.02, CB.steel, rx, ry, 0.168);
      }
    }

    // Heavy iron-shod war boot with sole at y = 0
    box(shin, 0.28, 0.06, 0.295, CB.leatherL, 0, -0.27, 0.005);
    box(shin, 0.26, 0.15, 0.28, CB.leatherD, 0, -0.35, 0.01);
    box(shin, 0.285, 0.10, 0.37, CB.leatherD, 0, -0.43, 0.045);
    box(shin, 0.24, 0.085, 0.11, CB.iron, 0, -0.435, 0.195);
    box(shin, 0.16, 0.05, 0.04, CB.ironL, 0, -0.42, 0.245);
    box(shin, 0.30, 0.040, 0.39, CB.sole, 0, -0.48, 0.05);

    lg.userData.shin = shin;
    legs.push(lg);
    shins.push(shin);
  }

  // --- 2. BROAD TORSO (~0.76 m chest): SCARRED MUSCLE, IRON CUIRASS, FUR, CHAINS, SKULL BUCKLE, LOOT SACK, CAPE ---
  const body = makeJoint(g, 0, BODY_Y, 0);

  // Broad scarred muscular chest & dark wool undershirt
  box(body, 0.76, 0.42, 0.44, CB.skin, 0, 0.16, 0);
  box(body, 0.68, 0.34, 0.40, CB.shirt, 0, -0.17, 0);
  box(body, 0.72, 0.16, 0.43, CB.leatherD, 0, -0.35, 0);
  // Chest battle scar on bare right pectoral
  box(body, 0.18, 0.025, 0.02, CB.scar, 0.17, 0.20, 0.222, 0, 0, 0.48);
  box(body, 0.14, 0.022, 0.02, CB.scar, 0.20, 0.13, 0.222, 0, 0, -0.24);

  // Asymmetrical heavy riveted dark-iron chest cuirass
  box(body, 0.56, 0.36, 0.11, CB.iron, -0.07, 0.08, 0.19);
  box(body, 0.34, 0.30, 0.06, CB.ironL, -0.18, 0.12, 0.238);
  box(body, 0.48, 0.13, 0.06, CB.ironD, 0.04, -0.06, 0.22, 0, 0, -0.22);
  box(body, 0.66, 0.42, 0.10, CB.ironD, 0, 0.08, -0.20);
  for (const [rvX, rvY, rvZ] of [
    [-0.30, 0.22, 0.265], [-0.06, 0.22, 0.265],
    [-0.30, 0.02, 0.265], [-0.06, 0.02, 0.265],
    [0.16, -0.08, 0.25], [0.23, -0.11, 0.245],
  ]) {
    box(body, 0.028, 0.028, 0.022, CB.steel, rvX, rvY, rvZ);
  }

  // Heavy iron chain baldrics crisscrossed across chest
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const cx = lerp(0.32, -0.30, u);
    const cy = lerp(0.28, -0.14, u);
    const col = i % 2 === 0 ? CB.ironL : CB.ironD;
    box(body, 0.058, 0.048, 0.045, col, cx, cy, 0.265, 0, 0, 0.62);
  }
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const cx = lerp(-0.28, 0.28, u);
    const cy = lerp(0.26, 0.02, u);
    const col = i % 2 === 0 ? CB.iron : CB.ironL;
    box(body, 0.052, 0.044, 0.042, col, cx, cy, 0.258, 0, 0, -0.42);
  }
  box(body, 0.085, 0.085, 0.03, CB.ironL, -0.01, 0.11, 0.275);

  // Jagged wolf/bear-fur shoulder mantle (layered voxel fur tuft collar)
  box(body, 0.90, 0.13, 0.50, CB.fur, 0, 0.32, -0.02);
  box(body, 0.84, 0.09, 0.46, CB.furD, 0, 0.26, -0.02);
  for (const [fx, fy, fz, frx, frz, fc] of [
    [-0.36, 0.39, 0.05, 0.22, 0.35, CB.furL],
    [-0.20, 0.41, -0.14, -0.25, 0.18, CB.fur],
    [0.0, 0.42, -0.20, -0.35, 0.0, CB.furL],
    [0.22, 0.41, -0.14, -0.25, -0.18, CB.fur],
    [0.36, 0.39, 0.05, 0.22, -0.35, CB.furL],
    [-0.28, 0.35, 0.18, 0.32, 0.24, CB.furD],
    [0.28, 0.35, 0.18, 0.32, -0.24, CB.furD],
  ]) {
    box(body, 0.12, 0.13, 0.11, fc, fx, fy, fz, frx, 0, frz);
  }

  // Heavy war-belt, skull-emblem iron buckle, hip chain & loot sack
  box(body, 0.74, 0.11, 0.45, CB.leatherD, 0, -0.24, 0);
  box(body, 0.17, 0.15, 0.04, CB.ironD, 0, -0.24, 0.232);
  box(body, 0.11, 0.095, 0.045, CB.ironL, 0, -0.225, 0.252);
  box(body, 0.028, 0.026, 0.02, 0x101012, -0.028, -0.22, 0.272);
  box(body, 0.028, 0.026, 0.02, 0x101012, 0.028, -0.22, 0.272);
  box(body, 0.075, 0.036, 0.038, CB.ironL, 0, -0.27, 0.250);
  box(body, 0.015, 0.022, 0.015, 0x101012, -0.018, -0.272, 0.268);
  box(body, 0.015, 0.022, 0.015, 0x101012, 0.018, -0.272, 0.268);

  // Hip chain on left hip
  for (let i = 0; i < 6; i++) {
    const cy = -0.29 - i * 0.035;
    const cz = 0.14 - Math.sin(i * 0.6) * 0.09;
    box(body, 0.048, 0.042, 0.048, i % 2 === 0 ? CB.ironL : CB.ironD, -0.375, cy, cz, 0.2, 0, 0);
  }

  // Plump loot sack tied on right hip
  box(body, 0.18, 0.24, 0.17, CB.sack, 0.38, -0.36, 0.04, 0, 0, 0.14);
  box(body, 0.10, 0.05, 0.10, CB.leatherD, 0.36, -0.23, 0.04);
  box(body, 0.07, 0.05, 0.07, CB.gold, 0.38, -0.21, 0.06);

  // Iron-studded leather tassets
  for (const s of [-1, 1]) {
    box(body, 0.22, 0.16, 0.06, CB.leather, s * 0.22, -0.39, 0.21, -0.1, 0, -s * 0.1);
    box(body, 0.035, 0.035, 0.02, CB.ironL, s * 0.22, -0.39, 0.245, -0.1, 0, -s * 0.1);
  }

  // Tattered dark-crimson war cape (parts.cloak)
  const cloak = makeJoint(body, 0, 0.33, -0.25);
  box(cloak, 0.72, 0.10, 0.08, CB.furD, 0, -0.02, 0);
  box(cloak, 0.68, 0.42, 0.045, CB.crimson, 0, -0.23, -0.02, 0.08, 0, 0);
  box(cloak, 0.60, 0.34, 0.035, CB.crimsonD, 0, -0.52, -0.05, 0.12, 0, 0);
  box(cloak, 0.20, 0.34, 0.032, CB.crimson, -0.20, -0.74, -0.08, 0.14, 0, -0.06);
  box(cloak, 0.22, 0.40, 0.032, CB.crimsonD, 0.0, -0.78, -0.09, 0.15, 0, 0);
  box(cloak, 0.18, 0.28, 0.032, CB.crimson, 0.21, -0.71, -0.075, 0.13, 0, 0.07);

  // --- 3. HEAD: HORNED/SPIKED IRON HALF-HELM, JAW GUARD, AMBER EYES, BRAIDED BEARD ---
  const head = makeJoint(body, 0, 0.58, 0.02);
  box(head, 0.26, 0.14, 0.24, CB.skinD, 0, -0.16, -0.01);
  box(head, 0.42, 0.38, 0.40, CB.skin, 0, 0.01, 0);
  box(head, 0.43, 0.07, 0.08, CB.skinD, 0, 0.08, 0.19);

  // Fierce glowing-amber eyes & heavy furrowed brows
  const brows = [];
  for (const s of [1, -1]) {
    box(head, 0.10, 0.055, 0.025, 0x160e0a, 0.095 * s, 0.03, 0.20);
    box(head, 0.068, 0.042, 0.022, CB.eye, 0.095 * s, 0.03, 0.208);
    box(head, 0.028, 0.028, 0.015, CB.eyeH, 0.095 * s, 0.03, 0.215);
    const brow = makeJoint(head, 0.098 * s, 0.078, 0.215);
    box(brow, 0.125, 0.038, 0.042, CB.hair, 0, 0, 0);
    brows.push({ brow, side: s });
  }

  // Riveted iron jaw-guard mask & braided dark beard peeking underneath
  box(head, 0.44, 0.13, 0.24, CB.iron, 0, -0.11, 0.105);
  box(head, 0.36, 0.08, 0.06, CB.ironD, 0, -0.13, 0.215);
  box(head, 0.026, 0.026, 0.02, CB.steel, -0.14, -0.11, 0.22);
  box(head, 0.026, 0.026, 0.02, CB.steel, 0.14, -0.11, 0.22);

  box(head, 0.22, 0.06, 0.06, CB.hair, 0, -0.17, 0.19);
  box(head, 0.075, 0.16, 0.065, CB.hair, -0.06, -0.24, 0.18, -0.08, 0, 0.12);
  box(head, 0.075, 0.18, 0.065, CB.hairL, 0.06, -0.25, 0.18, -0.08, 0, -0.12);
  box(head, 0.085, 0.03, 0.075, CB.ironL, -0.065, -0.28, 0.18);
  box(head, 0.085, 0.03, 0.075, CB.ironL, 0.065, -0.29, 0.18);

  // Dark iron horned/spiked half-helm with noseguard (horn apex reaches ~2.45 m)
  box(head, 0.46, 0.20, 0.44, CB.iron, 0, 0.19, -0.005);
  box(head, 0.49, 0.06, 0.47, CB.ironL, 0, 0.11, 0);
  box(head, 0.055, 0.20, 0.22, CB.ironD, -0.23, 0.01, 0.01);
  box(head, 0.055, 0.20, 0.22, CB.ironD, 0.23, 0.01, 0.01);
  box(head, 0.058, 0.15, 0.05, CB.ironL, 0, 0.03, 0.235); // Noseguard
  box(head, 0.07, 0.07, 0.42, CB.ironD, 0, 0.31, -0.005); // Crest ridge
  box(head, 0.04, 0.08, 0.04, CB.steel, 0, 0.36, 0.12);
  box(head, 0.04, 0.09, 0.04, CB.steel, 0, 0.365, 0.0);
  box(head, 0.04, 0.08, 0.04, CB.steel, 0, 0.36, -0.12);

  for (const s of [1, -1]) {
    box(head, 0.095, 0.14, 0.095, CB.ironD, s * 0.24, 0.23, 0, 0.08, 0, -s * 0.55);
    box(head, 0.075, 0.15, 0.075, CB.ironL, s * 0.31, 0.33, 0.03, 0.16, 0, -s * 0.22);
    box(head, 0.048, 0.13, 0.048, CB.steel, s * 0.33, 0.43, 0.06, 0.22, 0, s * 0.12);
  }

  // --- 4. LEFT MASSIVE ARM (SPIKED PAULDRON + CHAIN GAUNTLET + WOODEN BUCKLER) ---
  const armL = makeJoint(body, -0.495, 0.255, 0);
  box(armL, 0.29, 0.16, 0.32, CB.iron, -0.04, 0.06, 0, 0, 0, 0.16);
  box(armL, 0.27, 0.10, 0.30, CB.ironD, -0.06, -0.04, 0, 0, 0, 0.24);
  box(armL, 0.04, 0.12, 0.04, CB.steel, -0.08, 0.16, 0.07, 0.18, 0, 0.45);
  box(armL, 0.045, 0.14, 0.045, CB.steel, -0.09, 0.17, 0, 0, 0, 0.55);
  box(armL, 0.04, 0.12, 0.04, CB.steel, -0.08, 0.16, -0.07, -0.18, 0, 0.45);
  box(armL, 0.22, 0.32, 0.23, CB.skin, 0, -0.17, 0);
  box(armL, 0.235, 0.055, 0.245, CB.ironD, 0, -0.18, 0);

  const foreL = makeJoint(armL, 0, -0.34, 0);
  box(foreL, 0.22, 0.10, 0.23, CB.iron, 0, 0, 0);
  box(foreL, 0.21, 0.24, 0.22, CB.leatherD, 0, -0.15, 0);
  box(foreL, 0.224, 0.045, 0.234, CB.ironL, 0, -0.08, 0);
  box(foreL, 0.224, 0.045, 0.234, CB.ironD, 0, -0.15, 0);
  box(foreL, 0.224, 0.045, 0.234, CB.ironL, 0, -0.22, 0);
  box(foreL, 0.19, 0.11, 0.20, CB.iron, 0, -0.30, 0.01);

  // Iron-studded wooden buckler / forearm shield strapped to left forearm
  const shield = makeJoint(foreL, -0.145, -0.15, 0.06);
  shield.rotation.set(-0.06, 0.26, 0);
  box(shield, 0.44, 0.44, 0.05, CB.wood, 0, 0, 0);
  box(shield, 0.34, 0.52, 0.045, CB.woodD, 0, 0, -0.002);
  box(shield, 0.52, 0.34, 0.045, CB.woodD, 0, 0, -0.002);
  box(shield, 0.44, 0.06, 0.058, CB.ironD, 0, 0, 0.004);
  box(shield, 0.06, 0.44, 0.058, CB.ironD, 0, 0, 0.004);
  box(shield, 0.14, 0.14, 0.06, CB.iron, 0, 0, 0.03);
  box(shield, 0.045, 0.045, 0.08, CB.steel, 0, 0, 0.07);
  for (const sx of [-0.15, 0.15]) {
    for (const sy of [-0.15, 0.15]) {
      box(shield, 0.036, 0.036, 0.03, CB.ironL, sx, sy, 0.035);
    }
  }

  // --- 5. RIGHT MASSIVE ARM (SPIKED PAULDRON + CHAIN GAUNTLET + NOTCHED GREATAXE) ---
  const armR = makeJoint(body, 0.495, 0.255, 0);
  box(armR, 0.27, 0.14, 0.29, CB.iron, 0.035, 0.055, 0, 0, 0, -0.16);
  box(armR, 0.25, 0.09, 0.27, CB.ironD, 0.055, -0.035, 0, 0, 0, -0.22);
  box(armR, 0.042, 0.13, 0.042, CB.steel, 0.08, 0.15, 0.045, 0.14, 0, -0.48);
  box(armR, 0.042, 0.12, 0.042, CB.steel, 0.08, 0.14, -0.05, -0.14, 0, -0.48);
  box(armR, 0.22, 0.32, 0.23, CB.skin, 0, -0.17, 0);
  box(armR, 0.14, 0.025, 0.02, CB.scar, 0.115, -0.15, 0.02, 0.3, 0, 0);
  box(armR, 0.235, 0.055, 0.245, CB.ironD, 0, -0.18, 0);

  const foreR = makeJoint(armR, 0, -0.34, 0);
  box(foreR, 0.22, 0.10, 0.23, CB.iron, 0, 0, 0);
  box(foreR, 0.21, 0.24, 0.22, CB.leatherD, 0, -0.15, 0);
  box(foreR, 0.224, 0.045, 0.234, CB.ironL, 0, -0.08, 0);
  box(foreR, 0.224, 0.045, 0.234, CB.ironD, 0, -0.15, 0);
  box(foreR, 0.224, 0.045, 0.234, CB.ironL, 0, -0.22, 0);
  box(foreR, 0.19, 0.11, 0.20, CB.iron, 0, -0.30, 0.01);

  const gripR = makeJoint(foreR, 0, -0.31, 0.06);
  // Massive notched iron Greataxe / War Cleaver (blade edge faces -Y for overhead cleave)
  box(gripR, 0.064, 0.064, 1.56, CB.wood, 0, 0, 0.40);
  box(gripR, 0.076, 0.076, 0.32, CB.leatherD, 0, 0, 0.02);
  box(gripR, 0.074, 0.074, 0.05, CB.ironL, 0, 0, -0.24);
  box(gripR, 0.074, 0.074, 0.05, CB.ironL, 0, 0, 0.26);
  box(gripR, 0.074, 0.074, 0.05, CB.ironL, 0, 0, 0.56);

  // Iron skull pommel at butt of haft
  box(gripR, 0.11, 0.11, 0.11, CB.ironL, 0, 0, -0.41);
  box(gripR, 0.025, 0.025, 0.02, 0x101012, -0.026, 0.015, -0.46);
  box(gripR, 0.025, 0.025, 0.02, 0x101012, 0.026, 0.015, -0.46);
  box(gripR, 0.08, 0.045, 0.08, CB.ironD, 0, -0.05, -0.41);

  // Heavy double-bevel notched steel axe head, back spike & top spear finial
  box(gripR, 0.095, 0.12, 0.34, CB.ironD, 0, 0, 0.94);
  box(gripR, 0.066, 0.22, 0.36, CB.steelD, 0, -0.14, 0.94);
  box(gripR, 0.044, 0.20, 0.46, CB.steel, 0, -0.27, 0.94);
  // Gleaming razor cutting edge broken by battle notches
  box(gripR, 0.024, 0.075, 0.12, CB.steelH, 0, -0.39, 0.77);
  box(gripR, 0.024, 0.085, 0.15, CB.steelH, 0, -0.40, 0.94);
  box(gripR, 0.024, 0.075, 0.12, CB.steelH, 0, -0.39, 1.11);
  box(gripR, 0.016, 0.032, 0.10, 0xffffff, 0, -0.435, 0.77);
  box(gripR, 0.016, 0.034, 0.12, 0xffffff, 0, -0.445, 0.94);
  box(gripR, 0.016, 0.032, 0.10, 0xffffff, 0, -0.435, 1.11);
  // Back spike & front spear tip
  box(gripR, 0.042, 0.18, 0.08, CB.iron, 0, 0.14, 0.94, 0.22, 0, 0);
  box(gripR, 0.026, 0.10, 0.045, CB.steelH, 0, 0.24, 0.92, 0.28, 0, 0);
  box(gripR, 0.055, 0.055, 0.16, CB.ironL, 0, 0, 1.15);
  box(gripR, 0.032, 0.032, 0.12, CB.steelH, 0, 0, 1.26);

  builder.finish();

  const parts = {
    body,
    head,
    armL,
    foreL,
    armR,
    foreR,
    gripR,
    legs,
    shins,
    cloak,
    brows,
    bodyY: BODY_Y,
  };

  animateBigBandit(
    { mesh: g, parts, material: builder.material, vel: { x: 0, z: 0 }, flash: 0, swing: 0, telegraph: 0 },
    0
  );

  return { mesh: g, parts, material: builder.material };
}

/* =============================================================================
   3. ANIMATOR: SMALL BANDIT (agile crouched stride, coiled telegraph, cross-slash)
   ============================================================================= */
/**
 * Animates the Small Bandit scout/cutthroat.
 * @param {object} st
 * @param {number} dt
 */
function animateSmallBandit(st, dt) {
  if (!st || !st.parts || !st.parts.body) return;
  const P = st.parts;

  dt = Math.min(Math.max(dt || 0, 0), 0.1);
  const t = (st._t = (st._t || 0) + dt);

  applyHitFlash(st);

  const vx = st.vel ? st.vel.x || 0 : 0;
  const vz = st.vel ? st.vel.z || 0 : 0;
  const rawSp = Math.hypot(vx, vz);
  const yaw = st.mesh && st.mesh.rotation ? st.mesh.rotation.y : 0;

  const anim =
    st._banditAnim ||
    (st._banditAnim = {
      speed: 0,
      gait: 0,
      runBlend: 0,
      combat: 0,
      turn: 0,
      yaw,
      tele: 0,
      windCarry: 0,
      atkActive: false,
      atkT: 0,
      lastSwing: 0,
      comboAlt: 1,
    });

  const easeMove = dt > 0 ? 1 - Math.exp(-14 * dt) : 1;
  const easePose = dt > 0 ? 1 - Math.exp(-10 * dt) : 1;
  const easeTele = dt > 0 ? 1 - Math.exp(-22 * dt) : 1;

  anim.speed += (rawSp - anim.speed) * easeMove;
  anim.gait += (clamp(anim.speed / 1.9, 0, 1) - anim.gait) * easeMove;
  anim.runBlend += (clamp((anim.speed - 2.6) / 1.6, 0, 1) - anim.runBlend) * easeMove;
  anim.combat += ((st.target ? 1 : 0) - anim.combat) * easePose;

  const targetTele = smooth(clamp(st.telegraph || 0, 0, 1));
  anim.tele += (targetTele - anim.tele) * easeTele;

  const yawDiff = Math.atan2(Math.sin(yaw - anim.yaw), Math.cos(yaw - anim.yaw));
  const instTurn = dt > 0.0005 ? clamp(yawDiff / dt, -5, 5) * 0.04 : 0;
  anim.turn += (instTurn - anim.turn) * (dt > 0 ? 1 - Math.exp(-10 * dt) : 1);
  anim.yaw = yaw;

  // Trigger alternating cross-slash lunge on swing
  const curSwing = st.swing || 0;
  if (curSwing > 0 && (anim.lastSwing <= 0 || curSwing > anim.lastSwing + 0.02)) {
    anim.atkActive = true;
    anim.atkT = 0;
    anim.comboAlt = 1 - anim.comboAlt;
    anim.windCarry = Math.max(anim.tele, 0.55);
  }
  anim.lastSwing = curSwing;

  const ATK_DUR = 0.36;
  if (anim.atkActive) {
    anim.atkT += dt;
    if (anim.atkT >= ATK_DUR) {
      anim.atkActive = false;
      anim.atkT = 0;
      anim.windCarry = 0;
    }
  }

  let strikeW = 0;
  let lungeZ = 0;
  let atkTwist = 0;
  let windW = anim.tele;

  if (anim.atkActive) {
    const at = anim.atkT;
    const altSign = anim.comboAlt === 0 ? 1 : -1;
    if (at < 0.11) {
      const u = smooth((at + 0.025) / 0.135);
      strikeW = u;
      windW = Math.max(windW, anim.windCarry * (1 - u));
      lungeZ = lerp(-0.04 * anim.windCarry, 0.18, u);
      atkTwist = altSign * lerp(-0.28 * anim.windCarry, 0.52, u);
    } else {
      const u = clamp((at - 0.11) / (ATK_DUR - 0.11), 0, 1);
      const decay = Math.exp(-5.5 * u);
      strikeW = Math.max(0, Math.cos(u * Math.PI * 1.4) * decay);
      windW = 0;
      lungeZ = 0.18 * decay * Math.cos(u * Math.PI * 1.2);
      atkTwist = altSign * 0.52 * decay * Math.cos(u * Math.PI * 1.2);
    }
  } else {
    atkTwist = -0.24 * windW;
    lungeZ = -0.05 * windW;
  }

  // Fast agile crouched stride
  const gait = anim.gait;
  const stepFreq = 9.0 + anim.speed * 1.45;
  const phase = (st._step = ((st._step || 0) + dt * stepFreq * (0.15 + gait * 0.85)) % TAU);
  const sinP = Math.sin(phase);
  const cosP = Math.cos(phase);
  const stepAmp = (0.58 + anim.runBlend * 0.24) * gait;

  if (P.legs && P.legs.length >= 2) {
    const hip0 = -0.16 + sinP * stepAmp - windW * 0.36 + strikeW * 0.24;
    const hip1 = -0.16 - sinP * stepAmp - windW * 0.28 - strikeW * 0.34;
    P.legs[0].rotation.set(hip0, 0, 0.04);
    P.legs[1].rotation.set(hip1, 0, -0.04);

    if (P.shins && P.shins.length >= 2) {
      const knee0 =
        0.16 * (1 - gait) +
        Math.max(0, -cosP) * 0.74 * gait +
        Math.max(0, -hip0) * 0.22 * gait +
        windW * 0.52 +
        strikeW * 0.18;
      const knee1 =
        0.16 * (1 - gait) +
        Math.max(0, cosP) * 0.74 * gait +
        Math.max(0, -hip1) * 0.22 * gait +
        windW * 0.44 +
        strikeW * 0.32;
      P.shins[0].rotation.x = knee0;
      P.shins[1].rotation.x = knee1;
    }
  }

  // Body crouch, torso twist & agile forward lean
  const breathe = Math.sin(t * 2.8) * 0.008;
  const walkBob = Math.abs(sinP) * 0.04 * gait;
  const crouch = 0.025 + anim.combat * 0.02 + windW * 0.11 + strikeW * 0.05;

  P.body.position.set(sinP * 0.018 * gait, P.bodyY + breathe + walkBob - crouch, lungeZ);
  P.body.rotation.set(
    0.10 + 0.16 * gait + 0.10 * anim.runBlend + 0.22 * windW + 0.24 * strikeW + Math.sin(t * 2.8) * 0.015,
    -sinP * 0.12 * gait + atkTwist,
    cosP * 0.03 * gait - anim.turn
  );

  if (P.cloak) {
    const billow = 0.12 + gait * 0.32 + anim.runBlend * 0.18 + windW * 0.22 + strikeW * 0.34;
    P.cloak.rotation.x = billow + Math.sin(phase * 2 - 0.5) * 0.10 * gait + Math.sin(t * 2.4) * 0.03;
    P.cloak.rotation.z = cosP * 0.06 * gait + anim.turn * 0.9;
  }

  if (P.head) {
    const scan = clamp((Math.sin(t * 1.3) + 0.3 * Math.sin(t * 3.1)) * 0.25, -0.32, 0.32);
    const patrolYaw = scan * (1 - anim.combat) * (1 - gait * 0.6) * (1 - windW) * (1 - strikeW);
    P.head.rotation.set(
      -0.08 - 0.10 * windW - 0.12 * strikeW + Math.sin(t * 2.2) * 0.025,
      patrolYaw - atkTwist * 0.65,
      -anim.turn * 0.4
    );
    if (P.brows) {
      const fierce = 0.10 + anim.combat * 0.12 + (windW + strikeW) * 0.16;
      for (const { brow, side } of P.brows) {
        brow.rotation.z = -side * fierce;
        brow.position.y = 0.066 - fierce * 0.018;
      }
    }
  }

  // Dual daggers: coiled crouch pull-back (telegraph) -> alternating cross-slash lunge (swing)
  if (P.armL && P.foreL && P.armR && P.foreR && P.gripL && P.gripR) {
    const pumpR = sinP * 0.52 * gait * (1 - windW) * (1 - strikeW);
    const pumpL = -sinP * 0.52 * gait * (1 - windW) * (1 - strikeW);
    const shiver = windW > 0.5 ? Math.sin(t * 40) * 0.025 * windW : 0;

    let rSX = -0.35 + pumpR + Math.cos(t * 2.8) * 0.025;
    let rSY = -0.12 * anim.combat;
    let rSZ = 0.16 + 0.06 * anim.combat;
    let rEX = -0.78 - Math.max(0, -pumpR) * 0.3;
    let rGX = 0.45;

    let lSX = -0.45 + pumpL - Math.cos(t * 2.8) * 0.025;
    let lSY = 0.14 * anim.combat;
    let lSZ = -0.16 - 0.06 * anim.combat;
    let lEX = -0.88 - Math.max(0, -pumpL) * 0.3;
    let lGX = 0.25;

    // Telegraph windup: pull BOTH daggers back in coiled crouch
    rSX = lerp(rSX, 0.72 + shiver, windW);
    rSY = lerp(rSY, -0.35, windW);
    rSZ = lerp(rSZ, 0.34, windW);
    rEX = lerp(rEX, -1.05, windW);
    rGX = lerp(rGX, 0.20, windW);

    lSX = lerp(lSX, 0.62 - shiver, windW);
    lSY = lerp(lSY, 0.35, windW);
    lSZ = lerp(lSZ, -0.32, windW);
    lEX = lerp(lEX, -1.10, windW);
    lGX = lerp(lGX, 0.10, windW);

    // Alternating fast cross-slash lunge
    if (anim.comboAlt === 0) {
      rSX = lerp(rSX, -1.28, strikeW);
      rSY = lerp(rSY, 0.78, strikeW);
      rSZ = lerp(rSZ, -0.14, strikeW);
      rEX = lerp(rEX, -0.15, strikeW);
      rGX = lerp(rGX, 0.42, strikeW);

      lSX = lerp(lSX, 0.42, strikeW);
      lSY = lerp(lSY, -0.24, strikeW);
      lEX = lerp(lEX, -0.68, strikeW);
    } else {
      lSX = lerp(lSX, -1.20, strikeW);
      lSY = lerp(lSY, -0.78, strikeW);
      lSZ = lerp(lSZ, 0.14, strikeW);
      lEX = lerp(lEX, -0.14, strikeW);
      lGX = lerp(lGX, -0.24, strikeW);

      rSX = lerp(rSX, 0.45, strikeW);
      rSY = lerp(rSY, 0.20, strikeW);
      rEX = lerp(rEX, -0.75, strikeW);
    }

    P.armR.rotation.set(rSX, rSY, rSZ);
    P.foreR.rotation.set(rEX, 0, 0);
    P.gripR.rotation.set(rGX, 0, 0);

    P.armL.rotation.set(lSX, lSY, lSZ);
    P.foreL.rotation.set(lEX, 0, 0);
    P.gripL.rotation.set(lGX, 0, 0);
  }
}

/* =============================================================================
   4. ANIMATOR: BIG BANDIT (heavy lumbering stride, overhead raise, cleave)
   ============================================================================= */
/**
 * Animates the Big Bandit marauder/brute.
 * @param {object} st
 * @param {number} dt
 */
function animateBigBandit(st, dt) {
  if (!st || !st.parts || !st.parts.body) return;
  const P = st.parts;

  dt = Math.min(Math.max(dt || 0, 0), 0.1);
  const t = (st._t = (st._t || 0) + dt);

  applyHitFlash(st);

  const vx = st.vel ? st.vel.x || 0 : 0;
  const vz = st.vel ? st.vel.z || 0 : 0;
  const rawSp = Math.hypot(vx, vz);
  const yaw = st.mesh && st.mesh.rotation ? st.mesh.rotation.y : 0;

  const anim =
    st._bigBanditAnim ||
    (st._bigBanditAnim = {
      speed: 0,
      gait: 0,
      runBlend: 0,
      combat: 0,
      turn: 0,
      yaw,
      tele: 0,
      windCarry: 0,
      atkActive: false,
      atkT: 0,
      lastSwing: 0,
    });

  const easeMove = dt > 0 ? 1 - Math.exp(-9 * dt) : 1;
  const easePose = dt > 0 ? 1 - Math.exp(-7 * dt) : 1;
  const easeTele = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;

  anim.speed += (rawSp - anim.speed) * easeMove;
  anim.gait += (clamp(anim.speed / 1.7, 0, 1) - anim.gait) * easeMove;
  anim.runBlend += (clamp((anim.speed - 2.2) / 1.5, 0, 1) - anim.runBlend) * easeMove;
  anim.combat += ((st.target ? 1 : 0) - anim.combat) * easePose;

  const targetTele = smooth(clamp(st.telegraph || 0, 0, 1));
  anim.tele += (targetTele - anim.tele) * easeTele;

  const yawDiff = Math.atan2(Math.sin(yaw - anim.yaw), Math.cos(yaw - anim.yaw));
  const instTurn = dt > 0.0005 ? clamp(yawDiff / dt, -4, 4) * 0.05 : 0;
  anim.turn += (instTurn - anim.turn) * (dt > 0 ? 1 - Math.exp(-8 * dt) : 1);
  anim.yaw = yaw;

  // Trigger heavy overhead greataxe cleave on swing
  const curSwing = st.swing || 0;
  if (curSwing > 0 && (anim.lastSwing <= 0 || curSwing > anim.lastSwing + 0.02)) {
    anim.atkActive = true;
    anim.atkT = 0;
    anim.windCarry = Math.max(anim.tele, 0.72);
  }
  anim.lastSwing = curSwing;

  const ATK_DUR = 0.54;
  if (anim.atkActive) {
    anim.atkT += dt;
    if (anim.atkT >= ATK_DUR) {
      anim.atkActive = false;
      anim.atkT = 0;
      anim.windCarry = 0;
    }
  }

  let strikeW = 0;
  let lungeZ = 0;
  let atkTwist = 0;
  let windW = anim.tele;

  if (anim.atkActive) {
    const at = anim.atkT;
    if (at < 0.14) {
      const u = smooth((at + 0.025) / 0.165);
      strikeW = u;
      windW = Math.max(windW, anim.windCarry * (1 - u));
      lungeZ = lerp(-0.08 * anim.windCarry, 0.22, u);
      atkTwist = lerp(-0.42 * anim.windCarry, 0.48, u);
    } else {
      const u = clamp((at - 0.14) / (ATK_DUR - 0.14), 0, 1);
      const decay = Math.exp(-4.2 * u);
      strikeW = Math.max(0, Math.cos(u * Math.PI * 1.2) * decay);
      windW = 0;
      lungeZ = 0.22 * decay * Math.cos(u * Math.PI * 1.1);
      atkTwist = 0.48 * decay * Math.cos(u * Math.PI * 1.1);
    }
  } else {
    atkTwist = -0.42 * windW;
    lungeZ = -0.08 * windW;
  }

  // Heavy lumbering ground-shaking stride
  const gait = anim.gait;
  const stepFreq = 5.0 + anim.speed * 0.88;
  const phase = (st._step = ((st._step || 0) + dt * stepFreq * (0.14 + gait * 0.86)) % TAU);
  const sinP = Math.sin(phase);
  const cosP = Math.cos(phase);
  const stepAmp = (0.48 + anim.runBlend * 0.18) * gait;

  if (P.legs && P.legs.length >= 2) {
    const hip0 = -0.10 + sinP * stepAmp + windW * 0.16 - strikeW * 0.20;
    const hip1 = -0.10 - sinP * stepAmp - windW * 0.26 + strikeW * 0.24;
    P.legs[0].rotation.set(hip0, 0, 0.055);
    P.legs[1].rotation.set(hip1, 0, -0.055);

    if (P.shins && P.shins.length >= 2) {
      const knee0 =
        0.10 * (1 - gait) +
        Math.max(0, -cosP) * 0.54 * gait +
        Math.max(0, -hip0) * 0.18 * gait +
        strikeW * 0.28;
      const knee1 =
        0.10 * (1 - gait) +
        Math.max(0, cosP) * 0.54 * gait +
        Math.max(0, -hip1) * 0.18 * gait +
        windW * 0.22 +
        strikeW * 0.20;
      P.shins[0].rotation.x = knee0;
      P.shins[1].rotation.x = knee1;
    }
  }

  // Heavy body roll, windup lean-back -> cleave slam forward
  const breathe = Math.sin(t * 1.7) * 0.015;
  const lumberBob = Math.abs(sinP) * 0.055 * gait;
  const impactDip = strikeW * 0.12 + windW * 0.03;

  P.body.position.set(sinP * 0.032 * gait, P.bodyY + breathe + lumberBob - impactDip, lungeZ);
  P.body.rotation.set(
    0.04 + 0.06 * gait + 0.08 * anim.runBlend - 0.28 * windW + 0.42 * strikeW + Math.sin(t * 1.7) * 0.015,
    -sinP * 0.09 * gait + atkTwist,
    cosP * 0.06 * gait - anim.turn
  );

  if (P.cloak) {
    const billow = 0.08 + gait * 0.24 + anim.runBlend * 0.14 + windW * 0.10 + strikeW * 0.38;
    P.cloak.rotation.x = billow + Math.sin(phase * 2 - 0.4) * 0.07 * gait + Math.sin(t * 1.8) * 0.025;
    P.cloak.rotation.z = cosP * 0.05 * gait + anim.turn * 0.7;
  }

  if (P.head) {
    const scan = clamp(Math.sin(t * 0.85) * 0.26, -0.28, 0.28);
    const patrolYaw = scan * (1 - anim.combat) * (1 - gait * 0.5) * (1 - windW) * (1 - strikeW);
    P.head.rotation.set(
      0.03 - 0.18 * windW + 0.14 * strikeW + Math.sin(t * 1.7) * 0.02,
      patrolYaw - atkTwist * 0.55,
      -anim.turn * 0.35
    );
    if (P.brows) {
      const wrath = 0.14 + anim.combat * 0.12 + (windW + strikeW) * 0.16;
      for (const { brow, side } of P.brows) {
        brow.rotation.z = -side * wrath;
        brow.position.y = 0.078 - wrath * 0.022;
      }
    }
  }

  // Shield arm brace & Massive Greataxe raise overhead (telegraph) -> devastating cleave (swing)
  if (P.armL && P.foreL && P.armR && P.foreR && P.gripR) {
    const armSwingL = -sinP * 0.38 * gait * (1 - windW) * (1 - strikeW);
    const armSwingR = sinP * 0.24 * gait * (1 - windW) * (1 - strikeW);

    let lSX = -0.18 + armSwingL - 0.25 * anim.combat + Math.sin(t * 1.7) * 0.02;
    let lSY = 0.22 * anim.combat;
    let lSZ = -0.10 - 0.06 * anim.combat;
    let lEX = -0.35 - Math.max(0, -armSwingL) * 0.3 - 0.30 * anim.combat;

    lSX = lerp(lSX, -0.52, windW);
    lSY = lerp(lSY, 0.38, windW);
    lSZ = lerp(lSZ, -0.22, windW);
    lEX = lerp(lEX, -0.68, windW);

    lSX = lerp(lSX, 0.35, strikeW);
    lSY = lerp(lSY, -0.18, strikeW);
    lEX = lerp(lEX, -0.45, strikeW);

    P.armL.rotation.set(lSX, lSY, lSZ);
    P.foreL.rotation.set(lEX, 0.08 * anim.combat, 0);

    // Base heavy greataxe carry pose
    let rSX = -0.24 + armSwingR - 0.10 * anim.combat + Math.cos(t * 1.7) * 0.02;
    let rSY = -0.06 * anim.combat;
    let rSZ = 0.10 + 0.06 * anim.combat;
    let rEX = -0.46 - 0.14 * anim.combat;
    let rGX = -0.42;

    // Telegraph: raise massive greataxe HIGH overhead with torso leaned back
    rSX = lerp(rSX, -2.45, windW);
    rSY = lerp(rSY, -0.18, windW);
    rSZ = lerp(rSZ, 0.26, windW);
    rEX = lerp(rEX, -0.42, windW);
    rGX = lerp(rGX, -0.28, windW);

    // Swing: devastating downward overhead cleave
    rSX = lerp(rSX, 0.35, strikeW);
    rSY = lerp(rSY, 0.24, strikeW);
    rSZ = lerp(rSZ, -0.16, strikeW);
    rEX = lerp(rEX, -0.10, strikeW);
    rGX = lerp(rGX, 0.45, strikeW);

    P.armR.rotation.set(rSX, rSY, rSZ);
    P.foreR.rotation.set(rEX, 0, 0);
    P.gripR.rotation.set(rGX, 0, 0);
  }
}

export { buildSmallBandit, buildBigBandit, animateSmallBandit, animateBigBandit };
