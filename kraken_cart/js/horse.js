import { HC } from './hc.js';
import './voxel.js';
const THREE = HC.THREE, V = HC.VoxelBuilder, P = HC.PAL;


  // Horse authored in voxel units (1u = 6.25cm). Ground = y 0. Body pivot center y = CY.
  const TORSO_REF = 23.5;
  const CY = 25.0;
  const L1 = 13.0;   // upper leg bone
  const L2 = 11.4;   // lower leg bone (cannon)
  const HOOF_H = 2.1;
  const ANKLE_Y = HOOF_H; // IK chain target height above ground

  HC.HORSE = { CY, TORSO_REF, L1, L2, HOOF_H, ANKLE_Y, SHOULDER_Y: 25, HIP_Y: 25.4 };

  HC.buildHorse = function () {
    const root = new THREE.Group();
    root.name = 'horse';

    // ---------------- TORSO ----------------
    const torso = new THREE.Group();
    torso.position.set(0, CY * HC.vs, 0);
    root.add(torso);

    const tb = new V();
    const B = (x0, y0, z0, x1, y1, z1, c, j) => tb.box(x0, y0 - TORSO_REF, z0, x1, y1 - TORSO_REF, z1, c, j);

    // barrel: stacked layers, elliptical cross-section (voxel smooth silhouette)
    for (let y = 16; y <= 30; y++) {
      const t = (y - 23.2) / 7.3;
      const wz = 5.6 * Math.sqrt(Math.max(0, 1 - t * t));
      if (wz < 0.7) continue;
      const xs = 11.6 * Math.sqrt(Math.max(0.05, 1 - Math.pow(t * 0.62, 2)));
      const col = y >= 28 ? P.coatLite : y <= 19 ? P.belly : P.coatMid;
      B(-xs, y, -wz, xs, y, wz, col);
    }
    // depth plane: ensure chest depth at front, rump at rear
    for (let z = -5.4; z <= 5.4; z++) {
      const t = z / 5.6;
      const shrink = Math.sqrt(Math.max(0, 1 - t * t));
      B(9.4, 18, z, 9.4 + 4.8 * shrink, 29, z, P.coatMid);
      B(-9.4 - 5.2 * shrink, 19, z, -9.2, 30.2, z, P.coatWarm);
    }

    // chest plate + shoulder mass
    B(10.0, 17, -4.6, 15.0, 28, 4.6, P.coatMid);
    B(10.0, 17, -4.6, 15.0, 22, 4.6, P.coatWarm);
    // wishbone / breast
    B(13.6, 19, -4.2, 15.6, 26, 4.2, P.coatDark, 0.03);
    // rump mass
    B(-15.4, 20, -4.9, -10.6, 30.4, 4.9, P.coatWarm);
    B(-15.4, 24, -4.4, -12.4, 30.4, 4.4, P.coatLite);
    // hips points
    B(-14.4, 27, -5.4, -12.0, 29.6, -4.6, P.coatLite);
    B(-14.4, 27, 4.6, -12.0, 29.6, 5.4, P.coatLite);
    // withers ridge
    B(4.0, 29, -2.2, 10.4, 31.4, 2.2, P.coatLite);
    B(6.0, 30, -1.4, 9.6, 32.0, 1.4, P.coatWarm);
    // spine dip + back line
    B(-9.0, 30, -1.2, 4.0, 30.8, 1.2, P.coatWarm);
    // belly underline (darker)
    B(-8.0, 16, -3.4, 8.0, 17, 3.4, P.belly, 0.03);
    // neck root blend + knuckle that hides the seam when the neck swings
    B(9.4, 26, -3.6, 12.6, 31, 3.6, P.coatMid);
    B(9.2, 25.4, -3.9, 13.2, 30.0, 3.9, P.coatMid, 0.03);
    B(10.0, 24.8, -3.4, 13.6, 26.4, 3.4, P.coatWarm, 0.03);
    // cream patches (very subtle, adds voxel texture richness)
    B(2.0, 26, 5.0, 7.0, 29, 5.6, P.coatLite, 0.03);
    B(-6.0, 24, -5.6, -1.0, 28, -5.0, P.coatWarm, 0.03);

    // saddle pad + saddle on the back
    B(-1.4, 30.6, -4.6, 8.2, 31.4, 4.6, P.padCloth, 0.02);
    B(-1.6, 31.4, -4.8, 8.4, 31.8, 4.8, P.padTrim, 0.02);
    B(0.4, 31.8, -3.6, 6.4, 33.2, 3.6, P.leather);
    B(0.0, 33.2, -3.0, 6.8, 33.8, 3.0, P.leather2);
    B(3.0, 31.8, -3.9, 3.9, 33.4, 3.9, P.leather2);
    // saddle horn + cantle
    B(6.0, 33.4, -1.4, 7.0, 34.6, 1.4, P.leather);
    B(-0.4, 33.6, -2.0, 1.0, 34.8, 2.0, P.leather);
    // girth strap around barrel
    B(1.0, 16.4, -5.9, 3.0, 31.6, -5.2, P.leather, 0.03);
    B(1.0, 16.4, 5.2, 3.0, 31.6, 5.9, P.leather, 0.03);
    B(1.0, 15.8, -4.8, 3.0, 16.6, 4.8, P.leather2);
    B(1.6, 15.2, -1.0, 2.6, 16.0, 1.0, P.brass);
    // stirrup leathers
    B(2.0, 22, -5.8, 2.8, 31.4, -5.2, P.leather, 0.02);
    B(2.0, 22, 5.2, 2.8, 31.4, 5.8, P.leather, 0.02);
    B(1.6, 20.6, -6.2, 3.2, 22.2, -5.0, P.iron);
    B(1.6, 20.6, 5.0, 3.2, 22.2, 6.2, P.iron);

    const torsoMesh = tb.build(0, 0, 0);
    torso.add(torsoMesh);

    // ---------------- NECK LOWER ----------------
    const S = HC.vs;
    const neckLow = new THREE.Group();
    neckLow.position.set(11.0 * S, (27.6 - TORSO_REF) * S, 0);
    torso.add(neckLow);

    const collarLeft = new THREE.Object3D();
    collarLeft.position.set(0.5 * S, 2.6 * S, 4.5 * S);
    neckLow.add(collarLeft);
    const collarRight = new THREE.Object3D();
    collarRight.position.set(0.5 * S, 2.6 * S, -4.5 * S);
    neckLow.add(collarRight);
    const girthLeft = new THREE.Object3D();
    girthLeft.position.set(1.8 * S, (21.5 - TORSO_REF) * S, 5.7 * S);
    torso.add(girthLeft);
    const girthRight = new THREE.Object3D();
    girthRight.position.set(1.8 * S, (21.5 - TORSO_REF) * S, -5.7 * S);
    torso.add(girthRight);

    const nb = new V();
    for (let y = 0; y <= 8; y++) {
      const wz = 3.9 - y * 0.10;
      const dx = 3.6 - y * 0.07;
      nb.box(-dx, y, -wz, dx, y, wz, y > 5 ? P.coatLite : P.coatMid);
    }
    // crest / mane ridge along the top-back of neck
    for (let y = 0; y <= 8; y++) {
      nb.box(-4.1 + y * 0.05, y, -1.5, -3.4, y, 1.5, P.mane, 0.05);
      nb.box(-4.5 + y * 0.05, y, -0.9, -4.0, y, 0.9, P.maneHi, 0.03);
    }
    // throat latch shadow
    nb.box(3.4, 0, -2.6, 3.9, 5, 2.6, P.coatDark, 0.03);
    // joint knuckle at the neckUp pivot (hides gaps when the upper neck bends)
    nb.box(-3.3, 6.2, -3.3, 3.3, 9.4, 3.3, P.coatMid, 0.03);
    nb.box(-2.9, 9.0, -2.9, 2.9, 10.2, 2.9, P.coatLite, 0.03);
    // collar (hames): pads + wooden yoke + brass ring
    nb.box(-1.2, 1.2, -4.4, 0.4, 4.6, -4.0, P.leather);
    nb.box(-1.2, 1.2, 4.0, 0.4, 4.6, 4.4, P.leather);
    nb.box(-1.6, 4.6, -3.6, 0.6, 5.6, 3.6, P.oakMid);
    nb.box(-1.0, 5.6, -2.4, 0.4, 6.2, 2.4, P.oakDark);
    nb.box(0.4, 2.2, -4.6, 1.0, 3.4, -4.2, P.brass);
    nb.box(0.4, 2.2, 4.2, 1.0, 3.4, 4.6, P.brass);
    const neckLowMesh = nb.build(0, 0, 0);
    neckLow.add(neckLowMesh);

    // ---------------- NECK UPPER ----------------
    const neckUp = new THREE.Group();
    neckUp.position.set(0, 7.4 * S, 0);
    neckLow.add(neckUp);

    const ub = new V();
    for (let y = 0; y <= 7; y++) {
      const wz = 3.2 - y * 0.09;
      const dx = 3.0 - y * 0.06;
      ub.box(-dx, y, -wz, dx, y, wz, y > 4 ? P.coatLite : P.coatMid);
    }
    for (let y = 0; y <= 7; y++) {
      ub.box(-3.5 + y * 0.04, y, -1.3, -2.9, y, 1.3, P.mane, 0.05);
      ub.box(-3.9 + y * 0.04, y - 0.2, -0.7, -3.4, y, 0.7, P.maneHi, 0.03);
    }
    ub.box(2.6, 0, -2.2, 3.1, 6, 2.2, P.coatWarm, 0.03);
    // joint knuckle at the head pivot
    ub.box(-2.8, 5.4, -2.8, 2.8, 8.6, 2.8, P.coatMid, 0.03);
    ub.box(0.2, 8.2, -2.4, 3.0, 9.2, 2.4, P.coatLite, 0.03);
    const neckUpMesh = ub.build(0, 0, 0);
    neckUp.add(neckUpMesh);

    // ---------------- HEAD ----------------
    const head = new THREE.Group();
    head.position.set(0.2 * S, 6.6 * S, 0);
    neckUp.add(head);

    const hb = new V();
    // skull
    hb.box(0, -1.4, -2.7, 4.2, 4.2, 2.7, P.coatMid);
    hb.box(3.4, 0.6, -2.5, 5.0, 3.8, 2.5, P.coatLite);
    // cheek / jawline mass
    hb.box(0.6, -2.4, -2.9, 3.8, -0.6, 2.9, P.coatWarm);
    // muzzle
    hb.box(4.6, -1.0, -2.2, 7.8, 2.2, 2.2, P.coatMid);
    hb.box(7.0, -0.6, -2.3, 8.2, 2.0, 2.3, P.muzzle);
    // nostril + lip detail
    hb.box(7.6, 1.0, -1.9, 8.3, 1.7, -1.1, P.nostril);
    hb.box(7.6, 1.0, 1.1, 8.3, 1.7, 1.9, P.nostril);
    hb.box(7.4, -0.8, -2.0, 8.3, -0.2, 2.0, P.muzzle, 0.02);
    // blaze on the face
    hb.box(3.6, 1.6, -1.0, 7.2, 3.2, 1.0, P.blaze, 0.02);
    // eyes (white + pupil + lid)
    for (const s of [-1, 1]) {
      hb.box(2.0, 1.6, s * 2.7, 3.0, 2.8, s * 2.9, P.eyeWhite, 0.0);
      hb.box(2.2, 1.9, s * 2.9, 2.8, 2.6, s * 3.0, P.eyePupil, 0.0);
      hb.box(1.7, 2.8, s * 2.6, 3.1, 3.2, s * 2.9, P.coatDark, 0.02);
      // cheekbone highlight
      hb.box(1.0, 0.0, s * 2.6, 3.6, 1.4, s * 2.8, P.coatLite, 0.02);
    }
    // ears
    hb.box(-0.6, 4.0, -2.2, 1.2, 6.4, -1.2, P.coatWarm);
    hb.box(-0.4, 4.2, -2.0, 0.9, 6.0, -1.4, P.coatDark, 0.01);
    hb.box(-0.6, 4.0, 1.2, 1.2, 6.4, 2.2, P.coatWarm);
    hb.box(-0.4, 4.2, 1.4, 0.9, 6.0, 2.0, P.coatDark, 0.01);
    // forelock
    hb.box(-0.4, 4.0, -1.6, 1.6, 5.8, 1.6, P.mane, 0.04);
    // bridle: browband, cheekpiece, noseband, bit
    hb.box(0.4, 3.3, -2.8, 1.6, 3.9, 2.8, P.leather, 0.02);
    hb.box(3.0, -0.4, -2.6, 3.8, 3.4, -2.3, P.leather, 0.02);
    hb.box(3.0, -0.4, 2.3, 3.8, 3.4, 2.6, P.leather, 0.02);
    hb.box(6.2, 0.0, -2.5, 7.0, 1.2, 2.5, P.leather2, 0.02);
    hb.box(2.6, -1.6, -2.6, 3.2, 0.2, 2.6, P.leather, 0.02);
    hb.box(3.0, -2.0, -2.5, 3.6, -1.4, -1.9, P.brass);
    hb.box(3.0, -2.0, 1.9, 3.6, -1.4, 2.5, P.brass);
    const headMesh = hb.build(0, 0, 0);
    head.add(headMesh);

    // jaw (chew animation)
    const jaw = new THREE.Group();
    jaw.position.set(1.2 * S, -1.2 * S, 0);
    head.add(jaw);
    const jb = new V();
    jb.box(0.6, -1.6, -2.2, 6.6, 0.3, 2.2, P.coatWarm);
    jb.box(5.6, -1.4, -2.0, 7.2, 0.2, 2.0, P.muzzle);
    jb.box(6.4, -1.2, -1.6, 7.4, 0.0, 1.6, P.nostril, 0.02);
    const jawMesh = jb.build(0, 0, 0);
    jaw.add(jawMesh);

    // ears pivot groups (flick animation) — rebuild small meshes
    const ears = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0.3 * S, 4.6 * S, s * 1.7 * S);
      head.add(g);
      const eb = new V();
      eb.box(-0.9, 0, -0.7, 1.1, 3.0, 0.7, P.coatWarm);
      eb.box(-0.6, 0.2, -0.45, 0.8, 2.6, 0.45, P.coatDark, 0.02);
      g.add(eb.build(0, 0, 0));
      ears.push(g);
    }

    // ---------------- TAIL ----------------
    const tailSegs = [];
    let tailParent = torso;
    let tailPos = new THREE.Vector3(-15.0 * S, (29.6 - TORSO_REF) * S, 0);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.position.copy(tailPos);
      tailParent.add(g);
      const len = 3.4 - i * 0.35;
      const w = 1.9 - i * 0.16;
      const tbv = new V();
      tbv.box(-w * 0.55, -len, -w, w * 1.15, 0, w, i < 2 ? P.coatDark : P.mane);
      if (i >= 2) {
        tbv.box(-w * 0.4, -len, -w * 1.15, w * 1.3, -len * 0.2, w * 1.15, P.mane, 0.06);
      }
      g.add(tbv.build(0, 0, 0));
      tailSegs.push(g);
      tailParent = g;
      tailPos = new THREE.Vector3(0, -len * S, 0);
    }

    // ---------------- LEGS ----------------
    const legs = [];
    const legDefs = [
      { id: 'FL', hip: [8.6, 25.2, 4.5], front: true },
      { id: 'FR', hip: [8.6, 25.2, -4.5], front: true },
      { id: 'HL', hip: [-8.8, 25.4, 4.7], front: false },
      { id: 'HR', hip: [-8.8, 25.4, -4.7], front: false }
    ];

    for (const def of legDefs) {
      const hipGroup = new THREE.Group();
      hipGroup.position.set(def.hip[0] * S, (def.hip[1] - TORSO_REF) * S, def.hip[2] * S);
      torso.add(hipGroup);

      // upper bone (thigh / humerus) — sculpted muscular volume tapering into knee/hock
      const uv = new V();
      if (def.front) {
        // Broad muscular shoulder & upper forearm
        uv.box(-3, -4, -2, 3, 2, 2, P.coatMid);
        uv.box(-2, -3, -2, 3, 1, 2, P.coatWarm, 0.03);
        // Mid forearm muscle belly + front radius contour
        uv.box(-2, -8, -2, 2, -4, 2, P.coatMid);
        uv.box(0, -7, -1, 3, -2, 1, P.coatWarm, 0.03);
        // Tapered lower forearm + rear tendon
        uv.box(-2, -L1, -1, 1, -8, 1, P.coatDark, 0.03);
        uv.box(-1, -10, -2, 1, -7, 2, P.coatMid, 0.02);
      } else {
        // Powerful upper haunch / quarter
        uv.box(-4, -5, -2, 3, 2, 2, P.coatMid);
        uv.box(-3, -4, -2, 2, 1, 2, P.coatWarm, 0.03);
        uv.box(-3, -6, -1, 2, 0, 1, P.coatLite, 0.03);
        // Curved gaskin muscle belly
        uv.box(-3, -9, -2, 2, -5, 2, P.coatMid);
        uv.box(-2, -8, -2, 2, -5, 2, P.coatWarm, 0.03);
        // Taper above hock
        uv.box(-2, -L1, -1, 1, -9, 1, P.coatDark, 0.03);
      }
      const upperMesh = uv.build(0, 0, 0);
      hipGroup.add(upperMesh);

      // knee / hock pivot at end of upper
      const knee = new THREE.Group();
      knee.position.set(0, -L1 * S, 0);
      upperMesh.add(knee);

      const lv = new V();
      const l2i = Math.round(L2);
      // Upper cannon + rear flexor tendon ridge
      lv.box(-1, -4, -1, 1, 0, 1, P.coatDark);
      lv.box(-2, -4, -1, -1, -1, 1, P.coatDark, 0.02);
      lv.box(-1, -4, -1, 2, -2, 1, P.coatMid, 0.03);

      // White socks (P.sock) on ALL 4 LEGS with sculpted fetlock joint & rear feather tuft
      lv.box(-1, -7, -1, 2, -5, 1, P.sock, 0.015);
      lv.box(-2, -7, -1, -1, -5, 1, P.sock, 0.02);
      // Volumetric fetlock ankle swell (symmetric Z: -2..2)
      lv.box(-2, -10, -2, 2, -8, 2, P.sock, 0.015);
      lv.del(2, -8, -2); lv.del(2, -8, 2);
      lv.del(2, -10, -2); lv.del(2, -10, 2);
      // Rear fetlock tuft / draft feathering
      lv.box(-3, -11, -1, -1, -8, 1, P.sock, 0.02);
      // Pastern into coronet band
      lv.box(-1, -l2i, -1, 2, -10, 1, P.sock, 0.015);
      const lowerMesh = lv.build(0, 0, 0);
      knee.add(lowerMesh);

      // Volumetric bell-shaped hoof + flat iron horseshoe (symmetric Z: -2..2)
      const hoof = new THREE.Group();
      hoof.position.set(0, -L2 * S, 0);
      lowerMesh.add(hoof);
      const hv = new V();
      // Upper coronet & hoof wall
      hv.box(-1, -1, -2, 2, 0, 2, P.hoof, 0.02);
      hv.del(2, 0, -2); hv.del(2, 0, 2);
      hv.del(-1, 0, -2); hv.del(-1, 0, 2);
      // Flared lower hoof bell + iron horseshoe sole
      hv.box(-2, -2, -2, 3, -1, 2, P.hoof, 0.02);
      hv.del(3, -1, -2); hv.del(3, -1, 2);
      hv.del(-2, -1, -2); hv.del(-2, -1, 2);
      hv.box(-2, -2, -2, 3, -2, 2, P.hoofShoe, 0.02);
      hv.del(3, -2, -2); hv.del(3, -2, 2);
      hv.del(-2, -2, -2); hv.del(-2, -2, 2);
      for (const s of [-2, 2]) {
        hv.set(1, -2, s, P.iron, 0.01);
        hv.set(-1, -2, s, P.iron, 0.01);
      }
      const hoofMesh = hv.build(0, 0, 0);
      hoof.add(hoofMesh);

      // Sculpted knee joint facing forward on all 4 legs
      {
        const kb = new V();
        kb.box(-1, -1, -2, 2, 1, 2, P.coatDark, 0.02);
        kb.del(-1, -1, -2); kb.del(-1, -1, 2);
        kb.box(1, -1, -1, 2, 1, 1, P.coatMid, 0.02);
        knee.add(kb.build(0, 0, 0));
      }

      legs.push({
        id: def.id, front: def.front, hipGroup, upperMesh, knee, lowerMesh, hoof, hoofMesh,
        hipLocal: new THREE.Vector3(def.hip[0] * S, (def.hip[1] - TORSO_REF) * S, def.hip[2] * S),
        phaseOffset: 0,
        footWorld: new THREE.Vector3(),
        stanceBlend: 1
      });
    }

    // bridle bit anchors for the dynamic reins
    const bitLeft = new THREE.Object3D();
    bitLeft.position.set(3.3 * S, -1.7 * S, 2.2 * S);
    head.add(bitLeft);
    const bitRight = new THREE.Object3D();
    bitRight.position.set(3.3 * S, -1.7 * S, -2.2 * S);
    head.add(bitRight);

    return {
      root, torso, neckLow, neckUp, head, jaw, ears, tailSegs, legs,
      neckLowMesh, neckUpMesh, headMesh,
      collarLeft, collarRight, girthLeft, girthRight, bitLeft, bitRight
    };
  };

  // Dedicated 3D Horse Head Portrait Rig (renders ONLY the horse's head for top-left HUD)
  HC.buildHorseHeadPortrait = function () {
    const S = HC.vs;
    const root = new THREE.Group();
    root.name = 'horse-head-portrait';

    const head = new THREE.Group();
    head.position.set(-3.4 * S, -1.2 * S, 0);
    root.add(head);

    const hb = new V();
    // Short upper neck bust + mane crest for tight head framing (no body)
    hb.box(-2.8, -4.6, -2.6, 1.4, 2.2, 2.6, P.coatMid);
    hb.box(-3.4, -4.2, -1.2, -2.5, 4.4, 1.2, P.mane, 0.04);
    hb.box(0, -1.4, -2.7, 4.2, 4.2, 2.7, P.coatMid);
    hb.box(3.4, 0.6, -2.5, 5.0, 3.8, 2.5, P.coatLite);
    hb.box(0.6, -2.4, -2.9, 3.8, -0.6, 2.9, P.coatWarm);
    hb.box(4.6, -1.0, -2.2, 7.8, 2.2, 2.2, P.coatMid);
    hb.box(7.0, -0.6, -2.3, 8.2, 2.0, 2.3, P.muzzle);
    hb.box(7.6, 1.0, -1.9, 8.3, 1.7, -1.1, P.nostril);
    hb.box(7.6, 1.0, 1.1, 8.3, 1.7, 1.9, P.nostril);
    hb.box(7.4, -0.8, -2.0, 8.3, -0.2, 2.0, P.muzzle, 0.02);
    hb.box(3.6, 1.6, -1.0, 7.2, 3.2, 1.0, P.blaze, 0.02);
    for (const s of [-1, 1]) {
      hb.box(2.0, 1.6, s * 2.7, 3.0, 2.8, s * 2.9, P.eyeWhite, 0.0);
      hb.box(2.2, 1.9, s * 2.9, 2.8, 2.6, s * 3.0, P.eyePupil, 0.0);
      hb.box(1.7, 2.8, s * 2.6, 3.1, 3.2, s * 2.9, P.coatDark, 0.02);
      hb.box(1.0, 0.0, s * 2.6, 3.6, 1.4, s * 2.8, P.coatLite, 0.02);
    }
    hb.box(-0.4, 4.0, -1.6, 1.6, 5.8, 1.6, P.mane, 0.04);
    // Bridle & brass bit
    hb.box(0.4, 3.3, -2.8, 1.6, 3.9, 2.8, P.leather, 0.02);
    hb.box(3.0, -0.4, -2.6, 3.8, 3.4, -2.3, P.leather, 0.02);
    hb.box(3.0, -0.4, 2.3, 3.8, 3.4, 2.6, P.leather, 0.02);
    hb.box(6.2, 0.0, -2.5, 7.0, 1.2, 2.5, P.leather2, 0.02);
    hb.box(2.6, -1.6, -2.6, 3.2, 0.2, 2.6, P.leather, 0.02);
    hb.box(3.0, -2.0, -2.5, 3.6, -1.4, -1.9, P.brass);
    hb.box(3.0, -2.0, 1.9, 3.6, -1.4, 2.5, P.brass);
    head.add(hb.build(0, 0, 0));

    const jaw = new THREE.Group();
    jaw.position.set(1.2 * S, -1.2 * S, 0);
    head.add(jaw);
    const jb = new V();
    jb.box(0.6, -1.6, -2.2, 6.6, 0.3, 2.2, P.coatWarm);
    jb.box(5.6, -1.4, -2.0, 7.2, 0.2, 2.0, P.muzzle);
    jb.box(6.4, -1.2, -1.6, 7.4, 0.0, 1.6, P.nostril, 0.02);
    jaw.add(jb.build(0, 0, 0));

    const ears = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0.3 * S, 4.6 * S, s * 1.7 * S);
      head.add(g);
      const eb = new V();
      eb.box(-0.9, 0, -0.7, 1.1, 3.0, 0.7, P.coatWarm);
      eb.box(-0.6, 0.2, -0.45, 0.8, 2.6, 0.45, P.coatDark, 0.02);
      g.add(eb.build(0, 0, 0));
      ears.push(g);
    }

    return { root, head, jaw, ears };
  };
