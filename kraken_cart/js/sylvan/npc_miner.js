'use strict';
/* =============================================================================
   ENTITAS NPC: PENAMBANG DESA (⛏️) — OVERHAUL V2
   -----------------------------------------------------------------------------
   Model 3D Voxel Detail Tinggi:
   - Kaki 2-sendi (paha & betis/lutut) dengan celana denim kerja, pelindung
     lutut kulit berpaku baja, dan sepatu bot tambang ujung baja (steel-toe).
   - Torso kemeja kerja flanel + bib overall denim bertali suspender & kancing
     kuningan, sabuk perkakas kulit (pahat besi, gulungan tambang, kantong bijih),
     syal penutup debu merah di leher, serta keranjang ransel kayu di punggung
     yang penuh bongkahan batu, emas, dan kristal berpendar.
   - Kepala dengan janggut tebal penambang, noda jelaga, alis ekspresif, serta
     helm pelindung tambang berlampu karbida kuningan yang menyala.
   - Lengan 2-sendi: tangan kiri memegang lentera tambang kuningan berayun
     dinamis (pendulum physics); tangan kanan menggenggam beliung tambang
     baja berkepala ganda berujung berlian/kristal.
   - Animasi Smooth & Juicy:
     - Idle: napas dada, lampu berkedip lembut, lentera berayun halus, lirikan mata.
     - Jalan/Lari: siklus langkah 2-sendi lutut, goyangan bahu, inersia lentera.
     - Menambang & Bertarung: ancang-ancang angkat beliung tinggi di atas kepala,
       hantaman vertikal bertenaga dengan bungkukan pinggang, dan getaran tumbukan.
   ============================================================================= */

const NPC_Miner = (() => {
  const PALETTE = {
    shirt:       0x6b4c32,
    shirtD:      0x4a3320,
    shirtL:      0x856143,
    denim:       0x324358,
    denimD:      0x212d3c,
    denimL:      0x465c75,
    skin:        0xd49664,
    skinD:       0xb07648,
    hair:        0x2a1d12,
    hairD:       0x181009,
    boot:        0x261d15,
    bootD:       0x15100b,
    leather:     0x6e4726,
    leatherD:    0x452b15,
    wood:        0x634124,
    woodD:       0x3f2815,
    metal:       0xa4b2bf,
    metalD:      0x64707d,
    metalH:      0xdce6f0,
    gold:        0xe0ab34,
    goldD:       0xa6781b,
    kerchief:    0x9e2f24,
    kerchiefD:   0x6e1d15,
    helmet:      0x4f3822,
    helmetD:     0x332314,
    rock:        0x5a6068,
    rockD:       0x3d4248,
    crystal:     0x4fd8ff,
    crystalL:    0xa6f0ff,
    rope:        0xc2a46e
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  /* Builder penggabung voxel per sendi (1 draw call per grup) */
  function createVoxelBuilder() {
    const base = new THREE.BoxGeometry(1, 1, 1);
    const unit = base.toNonIndexed();
    base.dispose();
    const batches = new Map();
    const matrix = new THREE.Matrix4();
    const normalMat = new THREE.Matrix3();
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });

    return {
      material,
      box(parent, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
        let data = batches.get(parent);
        if (!data) {
          data = { p: [], n: [], c: [] };
          batches.set(parent, data);
        }
        q.setFromEuler(new THREE.Euler(rx, ry, rz));
        matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
        normalMat.getNormalMatrix(matrix);
        const tint = new THREE.Color(color);
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
          mesh.castShadow = typeof IS_MOBILE === 'undefined' || !IS_MOBILE;
          parent.add(mesh);
        }
        unit.dispose();
      }
    };
  }

  function joint(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  return {
    /* ---------- BANGUN MODEL 3D ---------- */
    build(role) {
      const g = new THREE.Group();
      const vb = createVoxelBuilder();
      const box = vb.box.bind(vb);
      const C = Object.assign({}, PALETTE);
      if (role && role.skin) C.skin = role.skin;

      const BODY_Y = 0.78;

      /* =====================================================================
         1. KAKI 2-SENDI (PAHA -> LUTUT/BETIS -> SEPATU BOT BAJA TAMBANG)
         ===================================================================== */
      const legs = [];
      const shins = [];
      for (const s of [-1, 1]) {
        const lg = joint(g, 0.125 * s, 0.52, 0);
        // Paha denim kerja tebal
        box(lg, 0.185, 0.22, 0.205, C.denim,  0, -0.09, 0);
        box(lg, 0.19,  0.06, 0.21,  C.denimD, 0, -0.01, 0);
        // Jahitan samping celana kerja
        box(lg, 0.015, 0.20, 0.03,  C.goldD,  0.092 * s, -0.09, 0);

        // Sendi Lutut & Betis (Shin)
        const shin = joint(lg, 0, -0.20, 0);
        // Pelindung lutut kulit & paku baja
        box(shin, 0.165, 0.10, 0.055, C.leather,  0,  0.01, 0.095);
        box(shin, 0.145, 0.07, 0.062, C.leatherD, 0,  0.01, 0.098);
        box(shin, 0.03,  0.03, 0.068, C.metal,   -0.045, 0.01, 0.10);
        box(shin, 0.03,  0.03, 0.068, C.metal,    0.045, 0.01, 0.10);
        // Betis celana denim
        box(shin, 0.17,  0.16, 0.19,  C.denimD,   0, -0.08, 0);
        // Leher sepatu bot tambang
        box(shin, 0.178, 0.13, 0.195, C.boot,     0, -0.18, 0.005);
        box(shin, 0.182, 0.03, 0.20,  C.leather,  0, -0.12, 0.005);
        // Kait tali sepatu kuningan
        box(shin, 0.09,  0.09, 0.02,  C.goldD,    0, -0.17, 0.10);
        // Telapak sepatu bot + pelindung jari baja (steel-toe cap)
        box(shin, 0.185, 0.08, 0.24,  C.boot,     0, -0.25, 0.025);
        box(shin, 0.165, 0.065, 0.08, C.metalD,   0, -0.255, 0.115);
        box(shin, 0.14,  0.045, 0.06, C.metal,    0, -0.25, 0.125);
        // Sol karet bergerigi tebal
        box(shin, 0.195, 0.04, 0.255, C.bootD,    0, -0.295, 0.028);

        lg.userData.shin = shin;
        legs.push(lg);
        shins.push(shin);
      }

      /* =====================================================================
         2. TORSO (KEMEJA FLANEL + BIB OVERALL DENIM + SABUK + RANSEL BIJIH)
         ===================================================================== */
      const body = joint(g, 0, BODY_Y, 0);

      // Kemeja kerja cokelat tebal
      box(body, 0.48, 0.45, 0.31, C.shirt,  0,  0.01, 0);
      box(body, 0.44, 0.16, 0.28, C.shirtD, 0, -0.16, 0);

      // Bib Overalls Denim (Dada & Punggung)
      box(body, 0.44, 0.30, 0.04, C.denim,  0, -0.04,  0.15);
      box(body, 0.34, 0.14, 0.045, C.denimL, 0, 0.03,  0.155); // Kantong dada overall
      box(body, 0.32, 0.02, 0.05, C.goldD,  0,  0.09,  0.158); // Jahitan kantong
      box(body, 0.44, 0.28, 0.04, C.denimD, 0, -0.05, -0.15);

      // Tali suspender bahu kiri & kanan + gesper kuningan
      for (const s of [-1, 1]) {
        box(body, 0.075, 0.38, 0.035, C.denimD, 0.135 * s, 0.06,  0.158);
        box(body, 0.075, 0.10, 0.33,  C.denimD, 0.135 * s, 0.205, 0);
        box(body, 0.075, 0.36, 0.035, C.denimD, 0.125 * s, 0.05, -0.155, 0, 0, -0.12 * s);
        box(body, 0.05,  0.04, 0.02,  C.gold,   0.135 * s, 0.11,  0.172);
      }

      // Syal / Bandana Penutup Debu Merah di Leher
      box(body, 0.38, 0.08, 0.34, C.kerchief,  0, 0.21, 0.01);
      box(body, 0.22, 0.11, 0.045, C.kerchief, 0, 0.15, 0.175, 0.12, 0, 0);
      box(body, 0.12, 0.08, 0.045, C.kerchiefD, 0, 0.09, 0.18, 0.15, 0, 0);

      // Sabuk Kulit Perkakas Tambang & Gesper Kuningan
      box(body, 0.51, 0.085, 0.345, C.leatherD, 0, -0.13, 0);
      box(body, 0.12, 0.10,  0.04,  C.gold,     0, -0.13, 0.165);
      box(body, 0.07, 0.06,  0.045, C.leatherD, 0, -0.13, 0.168);

      // Kantong bijih kulit di pinggang kanan & pahat baja + gulungan tali di kiri
      box(body, 0.13, 0.15, 0.11, C.leather,  0.22, -0.15,  0.11, 0, 0, -0.08);
      box(body, 0.135, 0.04, 0.115, C.leatherD, 0.22, -0.09, 0.11, 0, 0, -0.08);
      box(body, 0.04, 0.04, 0.03, C.gold,     0.23, -0.11,  0.165);
      // Gulungan tali tambang & pahat besi di pinggang kiri
      box(body, 0.08, 0.14, 0.14, C.rope,    -0.25, -0.14, -0.02, 0, 0, 0.12);
      box(body, 0.045, 0.18, 0.045, C.metal, -0.22, -0.15,  0.11, 0.18, 0, 0.10);
      box(body, 0.06,  0.05, 0.06,  C.wood,  -0.23, -0.06,  0.12, 0.18, 0, 0.10);

      // Ransel Keranjang Kayu Bijih & Kristal di Punggung (Pack)
      const pack = joint(body, 0, 0.04, -0.17);
      // Rangka kayu & papan keranjang tambang
      box(pack, 0.34, 0.34, 0.18, C.wood,    0,  0.0, -0.09);
      box(pack, 0.36, 0.04, 0.20, C.woodD,   0,  0.15, -0.09);
      box(pack, 0.36, 0.04, 0.20, C.woodD,   0, -0.02, -0.09);
      box(pack, 0.36, 0.04, 0.20, C.woodD,   0, -0.15, -0.09);
      box(pack, 0.04, 0.36, 0.20, C.metalD, -0.15, 0.0, -0.09);
      box(pack, 0.04, 0.36, 0.20, C.metalD,  0.15, 0.0, -0.09);
      // Tumpukan batu tambang, bongkahan emas & kristal biru di puncak ransel
      box(pack, 0.28, 0.10, 0.15, C.rockD,   0,     0.18, -0.09);
      box(pack, 0.12, 0.10, 0.10, C.rock,   -0.07,  0.22, -0.08, 0.2, 0.3, -0.1);
      box(pack, 0.09, 0.09, 0.09, C.gold,    0.07,  0.23, -0.10, 0.3, -0.2, 0.2);
      box(pack, 0.06, 0.06, 0.06, C.gold,   -0.02,  0.24, -0.05, 0.1, 0.4, 0);
      // Kristal biru mencuat
      box(pack, 0.06, 0.15, 0.06, C.crystal, 0.02,  0.26, -0.11, -0.25, 0.15, -0.22);
      box(pack, 0.04, 0.11, 0.04, C.crystalL, -0.09, 0.25, -0.12, -0.18, -0.2, 0.28);

      /* =====================================================================
         3. KEPALA, JANGGUT TEBAL & HELM TAMBANG BERLAMPU KARBIDA
         ===================================================================== */
      const head = joint(body, 0, 0.38, 0);

      // Leher & Kepala
      box(head, 0.24, 0.10, 0.24, C.skinD, 0, -0.16, 0);
      box(head, 0.34, 0.31, 0.32, C.skin,  0,  0.0,  0);
      // Telinga
      box(head, 0.04, 0.09, 0.07, C.skinD, -0.18, -0.01, -0.01);
      box(head, 0.04, 0.09, 0.07, C.skinD,  0.18, -0.01, -0.01);

      // Mata fokus & hidung kokoh
      for (const s of [-1, 1]) {
        box(head, 0.075, 0.05, 0.02, 0xffffff, 0.08 * s, 0.02, 0.156);
        box(head, 0.042, 0.05, 0.02, 0x241a12, 0.08 * s, 0.02, 0.164);
        box(head, 0.018, 0.018, 0.02, 0xffffff, 0.09 * s, 0.032, 0.17);
      }
      box(head, 0.065, 0.09, 0.075, C.skinD, 0, -0.01, 0.175);
      // Noda jelaga batu bara di pipi
      box(head, 0.06, 0.035, 0.015, C.rockD,  0.115, -0.03, 0.158);
      box(head, 0.05, 0.03,  0.015, C.rockD, -0.11,  -0.04, 0.158);

      // Alis tebal ekspresif (brows)
      const brows = [];
      for (const s of [-1, 1]) {
        const br = joint(head, 0.08 * s, 0.068, 0.165);
        box(br, 0.095, 0.032, 0.028, C.hairD, 0, 0, 0);
        brows.push(br);
      }

      // Kumis & Janggut Lebat Penambang (dengan kepang dagu kecil)
      box(head, 0.24, 0.05, 0.05, C.hair,  0, -0.065, 0.165); // Kumis tebal
      box(head, 0.35, 0.12, 0.18, C.hairD, 0, -0.11,  0.09);  // Rahang berjanggut
      box(head, 0.28, 0.12, 0.12, C.hair,  0, -0.16,  0.13);  // Janggut bawah
      box(head, 0.16, 0.09, 0.09, C.hairD, 0, -0.22,  0.14);  // Ujung janggut
      box(head, 0.065, 0.025, 0.065, C.gold, 0, -0.20, 0.155); // Cincin pengikat janggut
      // Rambut belakang di bawah helm
      box(head, 0.35, 0.16, 0.10, C.hairD, 0, -0.02, -0.13);

      // Helm Tambang Kulit Keras & Pelat Baja (Hardhat)
      box(head, 0.39, 0.05, 0.40, C.helmetD, 0, 0.10,  0.0);   // Lingkar dasar helm
      box(head, 0.38, 0.035, 0.11, C.helmet, 0, 0.092, 0.23, 0.14, 0, 0); // Pet pelindung depan
      box(head, 0.38, 0.03, 0.07, C.helmetD, 0, 0.088, -0.21, -0.15, 0, 0); // Pelindung tengkuk
      box(head, 0.37, 0.14, 0.37, C.helmet,  0, 0.17, -0.005); // Kubah helm
      box(head, 0.31, 0.06, 0.31, C.helmetD, 0, 0.25, -0.005); // Puncak kubah
      box(head, 0.07, 0.17, 0.39, C.metalD,  0, 0.185, -0.005); // Tulang punggung baja helm
      // Sabuk pengikat helm & paku keling kuningan
      box(head, 0.40, 0.035, 0.39, C.leatherD, 0, 0.12, 0);

      // Lampu Karbida Kuningan di Dahi Helm
      const lamp = joint(head, 0, 0.185, 0.20);
      box(lamp, 0.11, 0.11, 0.06, C.gold,   0, 0, 0);
      box(lamp, 0.13, 0.13, 0.02, C.goldD,  0, 0, 0.025);
      box(lamp, 0.04, 0.07, 0.04, C.metalD, 0, 0.08, -0.01); // Tangki/cerobong karbida atas
      // Lensa lampu berpendar (MeshBasicMaterial agar menyala di gelap)
      const headLampGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.025),
        new THREE.MeshBasicMaterial({ color: 0xfff3a8 })
      );
      headLampGlow.position.set(0, 0, 0.032);
      lamp.add(headLampGlow);

      /* =====================================================================
         4. LENGAN KIRI 2-SENDI + LENTERA TAMBANG KUNINGAN (PENDULUM)
         ===================================================================== */
      const armL = joint(body, -0.30, 0.17, 0);
      box(armL, 0.165, 0.16, 0.165, C.shirt,  0, -0.06, 0);
      box(armL, 0.18,  0.055, 0.18, C.shirtL, 0, -0.15, 0); // Lipatan lengan baju gulung

      const foreL = joint(armL, 0, -0.17, 0);
      box(foreL, 0.14, 0.15, 0.14, C.skin,     0, -0.07, 0);
      box(foreL, 0.15, 0.05, 0.15, C.leatherD, 0, -0.14, 0); // Manset sarung tangan
      box(foreL, 0.135, 0.10, 0.14, C.leather, 0, -0.19, 0.01); // Sarung tangan kerja kiri

      // Pivot Lentera (menggantung di tangan kiri, berayun alami)
      const lanternPivot = joint(foreL, 0, -0.21, 0.06);
      // Gagang kawat gantung & cincin atas
      box(lanternPivot, 0.03, 0.09, 0.03, C.metalD, 0, -0.04, 0);
      box(lanternPivot, 0.12, 0.025, 0.12, C.goldD, 0, -0.09, 0); // Topi atas lentera
      box(lanternPivot, 0.16, 0.035, 0.16, C.gold,  0, -0.115, 0);
      // Tiang pelindung kaca lentera (4 sudut)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(lanternPivot, 0.02, 0.16, 0.02, C.metalD, 0.065 * sx, -0.20, 0.065 * sz);
        }
      }
      // Tangki minyak kuningan bawah
      box(lanternPivot, 0.16, 0.045, 0.16, C.gold,  0, -0.29, 0);
      box(lanternPivot, 0.13, 0.025, 0.13, C.goldD, 0, -0.32, 0);
      // Inti kaca api lentera berpendar hangat
      const lanternCore = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.145, 0.105),
        new THREE.MeshBasicMaterial({ color: 0xffb838 })
      );
      lanternCore.position.set(0, -0.20, 0);
      lanternPivot.add(lanternCore);

      /* =====================================================================
         5. LENGAN KANAN 2-SENDI + BELIUNG TAMBANG BAJA KEPALA GANDA
         ===================================================================== */
      const armR = joint(body, 0.30, 0.17, 0);
      box(armR, 0.165, 0.16, 0.165, C.shirt,  0, -0.06, 0);
      box(armR, 0.18,  0.055, 0.18, C.shirtL, 0, -0.15, 0);

      const foreR = joint(armR, 0, -0.17, 0);
      box(foreR, 0.14, 0.15, 0.14, C.skin,     0, -0.07, 0);
      box(foreR, 0.15, 0.05, 0.15, C.leatherD, 0, -0.14, 0);
      box(foreR, 0.135, 0.10, 0.14, C.leather, 0, -0.19, 0.01);

      // Grip Beliung di tangan kanan (mengarah ke depan +Z, kepala beliung vertikal di Y)
      const grip = joint(foreR, 0, -0.19, 0.04);
      grip.rotation.set(-0.22, 0, 0);

      // Gagang kayu ash kokoh + balutan kulit + pommel besi belakang
      box(grip, 0.048, 0.052, 0.96, C.wood,     0, 0,  0.28);
      box(grip, 0.058, 0.060, 0.24, C.leatherD, 0, 0,  0.02); // Pegangan tangan berlilit kulit
      box(grip, 0.065, 0.068, 0.05, C.metalD,   0, 0, -0.21); // Pommel pengunci belakang
      box(grip, 0.062, 0.066, 0.08, C.goldD,    0, 0,  0.64); // Cincin kuningan leher beliung

      // Soket kepala beliung baja tempa
      box(grip, 0.095, 0.12, 0.13, C.metalD, 0, 0, 0.71);
      box(grip, 0.075, 0.06, 0.05, C.metal,  0, 0, 0.79); // Ujung pengunci depan

      // Bilah Beliung Atas/Depan (Melengkung tajam untuk menghantam batu)
      box(grip, 0.065, 0.20, 0.085, C.metal,    0,  0.13, 0.70,  0.18, 0, 0);
      box(grip, 0.052, 0.18, 0.068, C.metalH,   0,  0.27, 0.66,  0.34, 0, 0);
      box(grip, 0.038, 0.12, 0.048, C.crystalL, 0,  0.38, 0.60,  0.48, 0, 0); // Ujung berlian/kristal

      // Bilah Pahat/Mattock Bawah/Belakang (Untuk membelah urat bijih)
      box(grip, 0.072, 0.18, 0.082, C.metal,    0, -0.12, 0.70, -0.16, 0, 0);
      box(grip, 0.085, 0.14, 0.055, C.metalH,   0, -0.24, 0.67, -0.28, 0, 0);

      // Selesaikan penggabungan geometri voxel
      vb.finish();

      const parts = {
        body,
        head,
        brows,
        pack,
        lamp,
        headLampGlow,
        armL,
        foreL,
        lanternPivot,
        lanternCore,
        armR,
        foreR,
        grip,
        legs,
        shins,
        bodyY: BODY_Y
      };

      this.animate({ mesh: g, parts, vel: { x: 0, z: 0 } }, 0);
      return { mesh: g, root: g, parts };
    },

    /* ---------- ANIMASI LENGKAP (SMOOTH & JUICY) ---------- */
    animate(n, dt) {
      const P = n.parts;
      if (!P || !P.body) return;

      dt = Math.min(dt || 0, 0.1);
      const t = (n._minerT = (n._minerT || 0) + dt);

      /* 1. Hit-flash merah saat terkena serangan */
      const em = (n.flash && n.flash > 0) ? 0xaa2222 : 0x000000;
      if (n._lastEm !== em && n.mesh) {
        n._lastEm = em;
        n.mesh.traverse(o => {
          if (o.material && o.material.emissive) o.material.emissive.setHex(em);
        });
      }

      /* 2. State Halus (Kecepatan, Siklus Langkah, Menambang & Ayunan) */
      const rawSp = Math.hypot(n.vel ? n.vel.x : 0, n.vel ? n.vel.z : 0);
      const isWorking = !!(n.working || (n.mineT && n.mineT > 0) || (n.forageT && n.forageT > 0));
      const hasSwing = (n.swing && n.swing > 0) || isWorking;

      const st = n._minerState || (n._minerState = {
        speed: 0,
        gait: 0,
        runBlend: 0,
        workBlend: 0,
        workCycle: 0,
        swingActive: false,
        lanternPitch: 0,
        lanternRoll: 0
      });

      const moveTarget = (n.walking || rawSp > 0.12) ? rawSp : 0;
      st.speed = lerp(st.speed, moveTarget, clamp(dt * 10, 0, 1));
      const move01 = clamp(st.speed / Math.max(1, (n.speed || 3.0) * 0.9), 0, 1.35);
      const walk01 = clamp(move01, 0, 1);
      const isRun = move01 > 0.82 ? (move01 - 0.82) / 0.53 : 0;
      st.runBlend = lerp(st.runBlend, clamp(isRun, 0, 1), clamp(dt * 7, 0, 1));

      if (walk01 > 0.02) {
        const freq = lerp(6.8, 11.2, st.runBlend) * clamp(0.65 + move01 * 0.45, 0.6, 1.4);
        st.gait = (st.gait + dt * freq) % (Math.PI * 2);
      }

      // Siklus kerja/serang: tetap berputar penuh meskipun n.swing di-clamp >= 0.2 oleh aiGather
      st.workBlend = lerp(st.workBlend, hasSwing ? 1 : 0, clamp(dt * 14, 0, 1));
      if (hasSwing) {
        if (!st.swingActive) {
          st.swingActive = true;
          st.workCycle = 0.05;
        }
        // Kecepatan ayun beliung (skill digger / tambang terasa cepat & bertenaga)
        const swingRate = isWorking ? 1.0 : 1.75;
        st.workCycle += dt * swingRate;
        if (st.workCycle >= 1) {
          if (isWorking || (n.swing && n.swing > 0.15)) {
            st.workCycle %= 1;
          } else {
            st.workCycle = 0;
            st.swingActive = false;
          }
        }
      } else {
        st.swingActive = false;
        st.workCycle = 0;
      }

      const ph = st.gait;
      const sinP = Math.sin(ph);
      const cosP = Math.cos(ph);

      /* 3. Siklus Kaki 2-Sendi (Paha & Lutut/Betis) */
      const stride = lerp(0.56, 0.84, st.runBlend) * walk01;
      const kneeBend = lerp(0.55, 0.92, st.runBlend) * walk01;

      const legR = sinP * stride;
      const legL = -sinP * stride;
      const liftR = Math.max(0, cosP);
      const liftL = Math.max(0, -cosP);

      // Saat menghantamkan beliung, kaki kanan mundur sedikit untuk kuda-kuda kokoh
      const stanceBracing = st.workBlend * (1 - walk01 * 0.7);
      P.legs[0].rotation.set(legR + stanceBracing * 0.16, 0, 0);
      P.legs[1].rotation.set(legL - stanceBracing * 0.18, 0, 0);

      if (P.shins && P.shins.length === 2) {
        P.shins[0].rotation.x = liftR * kneeBend + stanceBracing * 0.18;
        P.shins[1].rotation.x = liftL * kneeBend + stanceBracing * 0.12;
      }

      /* 4. Gerak Badan, Napas & Pantulan Ransel Bijih */
      const breath = Math.sin(t * 2.3) * 0.012 * (1 - walk01 * 0.6);
      const stepBob = Math.abs(sinP) * lerp(0.036, 0.062, st.runBlend) * walk01;
      const forwardLean = lerp(0.05, 0.16, st.runBlend) * walk01;

      /* 5. Koreografi Ayunan Beliung (3 Fase: Angkat Tinggi -> Hantam -> Getar Tumbukan) */
      const c = st.workCycle;
      let bodyPitchAdd = 0;
      let bodyYawAdd = 0;
      let bodySink = 0;
      let armRPitch = -sinP * 0.42 * walk01 - 0.10;
      let armRYaw = 0;
      let armRRoll = -0.06;
      let foreRPitch = -0.32 - Math.max(0, -sinP) * 0.22 * walk01;
      let gripPitch = -0.22;

      let armLPitch = sinP * 0.36 * walk01 - 0.32;
      let armLYaw = 0.08;
      let armLRoll = 0.08;
      let foreLPitch = -0.45;

      if (st.workBlend > 0.01 && st.swingActive) {
        const wb = st.workBlend;
        let rPitch = -0.2, rYaw = 0, rRoll = -0.08, fPitch = -0.4, gPitch = -0.22;
        let lPitch = -0.55, lYaw = 0.18;

        if (c < 0.42) {
          // Fase 1: Ancang-ancang angkat beliung tinggi ke atas kepala (0.00 -> 0.42)
          const u = smooth(c / 0.42);
          bodyPitchAdd = lerp(0, -0.24, u) * wb;
          bodyYawAdd   = lerp(0, -0.28, u) * wb;
          bodySink     = lerp(0,  0.02, u) * wb;
          rPitch       = lerp(-0.25, -2.35, u);
          rYaw         = lerp(0,     -0.18, u);
          rRoll        = lerp(-0.08, -0.16, u);
          fPitch       = lerp(-0.35, -0.78, u);
          gPitch       = lerp(-0.22, -0.42, u);
          // Tangan kiri mengangkat lentera ke depan untuk menerangi batu/target
          lPitch       = lerp(-0.38, -0.78, u);
          lYaw         = lerp(0.10,   0.26, u);
        } else if (c < 0.64) {
          // Fase 2: Hantaman vertikal cepat & penuh tenaga ke bawah (0.42 -> 0.64)
          const u = Math.pow(clamp((c - 0.42) / 0.22, 0, 1), 1.6);
          bodyPitchAdd = lerp(-0.24,  0.36, u) * wb;
          bodyYawAdd   = lerp(-0.28,  0.22, u) * wb;
          bodySink     = lerp( 0.02, -0.07, u) * wb;
          rPitch       = lerp(-2.35, -0.18, u);
          rYaw         = lerp(-0.18,  0.14, u);
          rRoll        = lerp(-0.16,  0.06, u);
          fPitch       = lerp(-0.78, -0.10, u);
          gPitch       = lerp(-0.42,  0.38, u);
          lPitch       = lerp(-0.78, -0.42, u);
          lYaw         = lerp(0.26,  -0.12, u);
        } else {
          // Fase 3: Getaran tumbukan (impact shudder) & tarik kembali beliung (0.64 -> 1.00)
          const u = smooth((c - 0.64) / 0.36);
          const shudder = (c < 0.78) ? Math.sin((c - 0.64) * 140) * (0.78 - c) * 0.85 : 0;
          bodyPitchAdd = lerp(0.36, 0, u) * wb;
          bodyYawAdd   = lerp(0.22, 0, u) * wb;
          bodySink     = lerp(-0.07, 0, u) * wb;
          rPitch       = lerp(-0.18, -0.25, u) + shudder * 0.25;
          rYaw         = lerp(0.14,  0,     u);
          rRoll        = lerp(0.06, -0.08,  u);
          fPitch       = lerp(-0.10, -0.35, u) + shudder * 0.35;
          gPitch       = lerp(0.38,  -0.22, u) + shudder * 0.40;
          lPitch       = lerp(-0.42, -0.38, u);
          lYaw         = lerp(-0.12,  0.10, u);
        }

        armRPitch  = lerp(armRPitch,  rPitch, wb);
        armRYaw    = lerp(armRYaw,    rYaw,   wb);
        armRRoll   = lerp(armRRoll,   rRoll,  wb);
        foreRPitch = lerp(foreRPitch, fPitch, wb);
        gripPitch  = lerp(gripPitch,  gPitch, wb);

        armLPitch  = lerp(armLPitch,  lPitch, wb);
        armLYaw    = lerp(armLYaw,    lYaw,   wb);
      }

      P.body.position.y = P.bodyY + breath + stepBob + bodySink;
      P.body.rotation.x = forwardLean + bodyPitchAdd;
      P.body.rotation.y = -sinP * 0.08 * walk01 + bodyYawAdd;
      P.body.rotation.z = cosP * 0.03 * walk01;

      P.armR.rotation.set(armRPitch, armRYaw, armRRoll);
      P.foreR.rotation.set(foreRPitch, 0, 0);
      P.grip.rotation.set(gripPitch, 0, 0);

      P.armL.rotation.set(armLPitch, armLYaw, armLRoll);
      P.foreL.rotation.set(foreLPitch, 0, 0);

      /* 6. Ayunan Pendulum Lentera & Pantulan Ransel */
      if (P.lanternPivot) {
        const targetLanternX = -(armLPitch + foreLPitch) * 0.55 + Math.sin(t * 2.8) * 0.06 + cosP * 0.18 * walk01;
        const targetLanternZ = Math.cos(t * 2.1) * 0.05 - sinP * 0.10 * walk01;
        st.lanternPitch = lerp(st.lanternPitch, targetLanternX, clamp(dt * 9, 0, 1));
        st.lanternRoll  = lerp(st.lanternRoll,  targetLanternZ, clamp(dt * 9, 0, 1));
        P.lanternPivot.rotation.set(st.lanternPitch, 0, st.lanternRoll);
      }
      if (P.pack) {
        P.pack.position.y = 0.04 + Math.abs(sinP) * 0.018 * walk01;
        P.pack.rotation.x = -Math.abs(cosP) * 0.04 * walk01;
      }

      /* 7. Kepala, Alis & Kedipan Hangat Lampu Tambang */
      const lookYaw = (n.headAngle !== undefined && n.headAngle !== null)
        ? n.headAngle
        : ((n.target || isWorking) ? -bodyYawAdd * 0.65 : Math.sin(t * 1.15) * 0.28 * (1 - walk01 * 0.6));
      const lookPitch = isWorking
        ? clamp(-bodyPitchAdd * 0.5 + 0.12, -0.25, 0.30)
        : Math.sin(t * 1.6) * 0.04;

      P.head.rotation.y = lerp(P.head.rotation.y || 0, lookYaw, clamp(dt * 8, 0, 1));
      P.head.rotation.x = lerp(P.head.rotation.x || 0, lookPitch, clamp(dt * 8, 0, 1));

      if (P.brows && P.brows.length === 2) {
        const focusBrow = (n.target || isWorking) ? 0.16 : 0.03;
        P.brows[0].rotation.z = -focusBrow;
        P.brows[1].rotation.z =  focusBrow;
      }

      // Denyut cahaya halus pada lampu helm & lentera
      const pulse = 1 + Math.sin(t * 14) * 0.04;
      if (P.headLampGlow) P.headLampGlow.scale.set(pulse, pulse, 1);
      if (P.lanternCore) P.lanternCore.scale.set(pulse, 1, pulse);
    }
  };
})();

window.NPC_Miner = NPC_Miner;
