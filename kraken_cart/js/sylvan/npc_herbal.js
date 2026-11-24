'use strict';
/* =============================================================================
   ENTITAS NPC: TABIB DESA (⚗️) — OVERHAUL V2
   -----------------------------------------------------------------------------
   Model 3D Voxel Detail Tinggi:
   - Kaki 2-sendi (paha & betis/lutut) dengan celana/jubah bawah ungu tua
     bertepi sulaman emas dan sepatu bot kulit apoteker bergesper perak.
   - Torso jubah ungu mistis + kerah mantel emas + celemek putih bersih dokter
     (dengan flap bawah berayun & saku berisi gulungan resep), sabuk kulit
     bergesper perak, serta selempang Potion Bandolier berisi 3 botol ramuan
     kaca berpendar (Merah HP, Hijau Herbal, Biru Mana) lengkap dengan tutup gabus.
   - Ransel Apoteker di punggung (pack) berisi gulungan perkamen medis, lumpang
     batu, ikatan daun obat kering, dan labu alkimia kaca.
   - Kepala ramah bijaksana dengan rambut & janggut perak rapi, alis ekspresif,
     kacamata baca berbingkai perak (glasses), serta Baret Beludru Ungu (beret)
     berbros emas, permata zamrud, dan helai daun sage putih.
   - Lengan 2-sendi: tangan kiri menjinjing Keranjang Rotan Tanaman Obat
     (basketPivot) berayun dinamis (pendulum) penuh bunga biru, beri merah & daun
     obat; tangan kanan memegang Tongkat Penyembuh Mahkota Emas dengan Inti
     Kristal Giok Melayang (jadeCore), Cincin Halo Emas Berputar (haloRing), dan
     3 Partikel Cahaya Penyembuh (motes).
   ============================================================================= */

const NPC_Herbal = (() => {
  const PALETTE = {
    robe:        0x6e4275,
    robeD:       0x48284d,
    robeL:       0x915f99,
    apron:       0xf0eadc,
    apronD:      0xd4cbb8,
    skin:        0xd89e6c,
    skinD:       0xb57c4e,
    hair:        0xebe3d5,
    hairD:       0xc9bfb0,
    boot:        0x2d2219,
    bootD:       0x1a130d,
    leather:     0x694425,
    leatherD:    0x422914,
    wood:        0x6b4728,
    woodD:       0x452c16,
    metal:       0xd0dce8,
    metalD:      0x7c8b99,
    gold:        0xe3af36,
    goldD:       0xa87b1c,
    jade:        0x2ee87a,
    jadeL:       0x98ffbe,
    potRed:      0xf23847,
    potGreen:    0x32eb78,
    potBlue:     0x3894f2,
    cork:        0xb8864c,
    herb:        0x3eb854,
    herbD:       0x268238,
    berry:       0xe83850,
    flower:      0x4ca6ff,
    scroll:      0xf5e8c8
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
         1. KAKI 2-SENDI (JUBAH BAWAH TABIB & SEPATU BOT APOTEKER)
         ===================================================================== */
      const legs = [];
      const shins = [];
      for (const s of [-1, 1]) {
        const lg = joint(g, 0.12 * s, 0.52, 0);
        // Paha jubah dalam ungu gelap
        box(lg, 0.185, 0.21, 0.20, C.robeD, 0, -0.09, 0);
        box(lg, 0.19,  0.05, 0.205, C.robe, 0, -0.17, 0);

        // Sendi Lutut & Betis (Shin)
        const shin = joint(lg, 0, -0.20, 0);
        box(shin, 0.17,  0.15, 0.185, C.robe,  0, -0.06, 0);
        box(shin, 0.175, 0.03, 0.19,  C.gold,  0, -0.125, 0); // Lis sulaman emas bawah jubah
        // Sepatu bot kulit lembut tabib + gesper perak
        box(shin, 0.165, 0.12, 0.18,  C.boot,  0, -0.19, 0.005);
        box(shin, 0.06,  0.04, 0.02,  C.metal, 0, -0.19, 0.095); // Gesper perak sepatu
        box(shin, 0.175, 0.08, 0.225, C.boot,  0, -0.25, 0.025);
        box(shin, 0.185, 0.038, 0.24, C.bootD, 0, -0.295, 0.028);

        lg.userData.shin = shin;
        legs.push(lg);
        shins.push(shin);
      }

      /* =====================================================================
         2. TORSO (JUBAH UNGU + CELEMEK PUTIH + SELEMPANG RAMUAN + RANSEL OBAT)
         ===================================================================== */
      const body = joint(g, 0, BODY_Y, 0);

      // Jubah utama ungu mistis + mantel bahu berlis emas
      box(body, 0.47, 0.45, 0.30, C.robe,  0,  0.01, 0);
      box(body, 0.49, 0.12, 0.32, C.robeD, 0,  0.16, 0); // Mantel bahu tabib
      box(body, 0.50, 0.025, 0.33, C.gold, 0,  0.10, 0); // Lis emas mantel bahu
      box(body, 0.26, 0.06, 0.31, C.apron, 0,  0.21, 0.01); // Kerah putih bersih

      // Celemek Putih Bersih Tabib di Depan
      box(body, 0.38, 0.34, 0.035, C.apron,  0, -0.03, 0.148);
      // Saku celemek depan berisi gulungan resep & tanaman obat
      box(body, 0.28, 0.13, 0.045, C.apronD, 0, -0.09, 0.162);
      box(body, 0.10, 0.025, 0.05, C.jade,   0, -0.08, 0.185); // Lambang palang hijau penyembuh
      box(body, 0.025, 0.10, 0.05, C.jade,   0, -0.08, 0.185);
      box(body, 0.045, 0.09, 0.04, C.scroll, -0.09, -0.01, 0.17, 0, 0,  0.18); // Gulungan resep
      box(body, 0.04,  0.08, 0.03, C.herb,    0.09, -0.01, 0.17, 0, 0, -0.22); // Pucuk herbal

      // Flap Bawah Celemek (berayun mengikuti langkah)
      const apronFlap = joint(body, 0, -0.18, 0.15);
      box(apronFlap, 0.36, 0.20, 0.03, C.apron,  0, -0.09, 0);
      box(apronFlap, 0.36, 0.03, 0.035, C.apronD, 0, -0.18, 0);

      // Sabuk Kulit Apoteker & Gesper Perak
      box(body, 0.50, 0.075, 0.335, C.leatherD, 0, -0.12, 0);
      box(body, 0.11, 0.09,  0.035, C.metal,    0, -0.12, 0.162);
      box(body, 0.06, 0.05,  0.04,  C.jade,     0, -0.12, 0.165); // Permata giok di gesper

      // Kantong kulit ramuan di pinggang kanan
      box(body, 0.12, 0.14, 0.10, C.leather,  0.22, -0.15, 0.09, 0, 0, -0.08);
      box(body, 0.125, 0.035, 0.105, C.gold,  0.22, -0.09, 0.09, 0, 0, -0.08);

      // Selempang Potion Bandolier Menyilang di Dada
      box(body, 0.50, 0.065, 0.035, C.leatherD, 0, 0.05, 0.162, 0, 0, 0.56);
      box(body, 0.50, 0.065, 0.035, C.leatherD, 0, 0.05, -0.158, 0, 0, -0.56);

      // 3 Botol Ramuan Kaca Berpendar di Dada (Merah HP, Hijau Herbal, Biru Mana)
      const potions = [];
      const potConfigs = [
        { x: -0.11, y: 0.115, col: C.potRed },
        { x:  0.00, y: 0.045, col: C.potGreen },
        { x:  0.11, y: -0.025, col: C.potBlue }
      ];
      for (const pc of potConfigs) {
        const pg = joint(body, pc.x, pc.y, 0.188);
        pg.rotation.z = -0.18;
        // Leher kaca & sumbat gabus
        box(pg, 0.036, 0.03, 0.036, C.metal, 0, 0.048, 0);
        box(pg, 0.028, 0.028, 0.028, C.cork, 0, 0.068, 0);
        // Cairan ramuan berpendar (MeshBasicMaterial)
        const liq = new THREE.Mesh(
          new THREE.BoxGeometry(0.062, 0.075, 0.058),
          new THREE.MeshBasicMaterial({ color: pc.col })
        );
        liq.position.set(0, 0, 0);
        pg.add(liq);
        potions.push(liq);
      }

      // Ransel Apoteker & Rak Tanaman Obat di Punggung (pack)
      const pack = joint(body, 0, 0.04, -0.16);
      box(pack, 0.32, 0.32, 0.16, C.leather,  0,  0.0,  -0.08);
      box(pack, 0.34, 0.09, 0.18, C.leatherD, 0,  0.12, -0.08); // Penutup atas tas kulit
      box(pack, 0.05, 0.12, 0.02, C.gold,    -0.09, 0.08, -0.175); // Sabuk pengunci emas
      box(pack, 0.05, 0.12, 0.02, C.gold,     0.09, 0.08, -0.175);
      // Gulungan perkamen medis di atas tas punggung
      box(pack, 0.38, 0.075, 0.075, C.scroll, 0,  0.20, -0.08);
      box(pack, 0.08, 0.085, 0.085, C.gold,  -0.14, 0.20, -0.08);
      box(pack, 0.08, 0.085, 0.085, C.gold,   0.14, 0.20, -0.08);
      // Ikatan tanaman herbal tergantung di sisi tas
      box(pack, 0.08, 0.14, 0.08, C.herb,    -0.18, -0.02, -0.08, 0, 0, 0.18);
      box(pack, 0.06, 0.08, 0.06, C.flower,  -0.19, -0.10, -0.08, 0, 0, 0.18);

      /* =====================================================================
         3. KEPALA, KACAMATA PERAK, JANGGUT BIJAK & BARET BELUDRU UNGU
         ===================================================================== */
      const head = joint(body, 0, 0.38, 0);

      // Leher & Kepala
      box(head, 0.23, 0.10, 0.23, C.skinD, 0, -0.16, 0);
      box(head, 0.34, 0.31, 0.32, C.skin,  0,  0.0,  0);
      // Telinga
      box(head, 0.04, 0.09, 0.07, C.skinD, -0.18, -0.01, -0.01);
      box(head, 0.04, 0.09, 0.07, C.skinD,  0.18, -0.01, -0.01);

      // Mata ramah bijaksana & hidung
      for (const s of [-1, 1]) {
        box(head, 0.07, 0.048, 0.02, 0xffffff, 0.08 * s, 0.02, 0.156);
        box(head, 0.04, 0.048, 0.02, 0x284032, 0.08 * s, 0.02, 0.164);
        box(head, 0.016, 0.016, 0.02, 0xffffff, 0.088 * s, 0.032, 0.17);
      }
      box(head, 0.058, 0.085, 0.07, C.skinD, 0, -0.01, 0.175);

      // Kacamata Baca Berbingkai Perak (Spectacles)
      const glasses = joint(head, 0, 0.02, 0.176);
      for (const s of [-1, 1]) {
        // Bingkai lensa kiri & kanan
        box(glasses, 0.095, 0.018, 0.018, C.metal,  0.082 * s,  0.032, 0);
        box(glasses, 0.095, 0.018, 0.018, C.metal,  0.082 * s, -0.032, 0);
        box(glasses, 0.018, 0.068, 0.018, C.metal,  0.040 * s,  0.0,   0);
        box(glasses, 0.018, 0.068, 0.018, C.metal,  0.124 * s,  0.0,   0);
        // Gagang kacamata ke telinga
        box(glasses, 0.014, 0.014, 0.16,  C.metalD, 0.132 * s,  0.01, -0.08);
      }
      // Jembatan hidung kacamata
      box(glasses, 0.05, 0.018, 0.018, C.metal, 0, 0.01, 0.002);

      // Alis perak ekspresif (brows)
      const brows = [];
      for (const s of [-1, 1]) {
        const br = joint(head, 0.08 * s, 0.075, 0.165);
        box(br, 0.09, 0.028, 0.025, C.hair, 0, 0, 0);
        brows.push(br);
      }

      // Rambut perak & Janggut Rapi Apoteker
      box(head, 0.35, 0.15, 0.12, C.hairD, 0,  0.0,  -0.12);
      box(head, 0.05, 0.12, 0.10, C.hair, -0.165, -0.01, 0.04);
      box(head, 0.05, 0.12, 0.10, C.hair,  0.165, -0.01, 0.04);
      box(head, 0.20, 0.04, 0.045, C.hair, 0, -0.065, 0.165); // Kumis perak rapi
      box(head, 0.24, 0.10, 0.12, C.hairD, 0, -0.11,  0.11);  // Janggut rahang
      box(head, 0.16, 0.10, 0.08, C.hair,  0, -0.16,  0.14);  // Janggut dagu lancip rapi
      box(head, 0.10, 0.06, 0.06, C.hairD, 0, -0.21,  0.145);

      // Baret Beludru Ungu Tabib + Bros Daun Emas & Permata Giok (beret)
      const beret = joint(head, 0, 0.12, 0);
      beret.rotation.set(-0.04, 0, -0.08); // Sedikit miring artistik
      box(beret, 0.38, 0.055, 0.38, C.robeD, 0, 0.01, 0); // Pita lingkar baret
      box(beret, 0.39, 0.02,  0.39, C.gold,  0, 0.035, 0); // Lis benang emas
      box(beret, 0.45, 0.09,  0.44, C.robe,  0.02, 0.075, -0.01); // Gembung baret
      box(beret, 0.38, 0.05,  0.37, C.robeL, 0.03, 0.13,  -0.01); // Puncak baret
      // Bros emas + permata giok + helai daun obat di sisi kanan baret
      box(beret, 0.08, 0.08,  0.025, C.gold,  0.16, 0.05, 0.185);
      box(beret, 0.045, 0.045, 0.03, C.jade,  0.16, 0.05, 0.192);
      box(beret, 0.035, 0.14, 0.03,  C.herb,  0.19, 0.12, 0.17, -0.15, 0, -0.38);

      /* =====================================================================
         4. LENGAN KIRI 2-SENDI + KERANJANG ROTAN TANAMAN OBAT (PENDULUM)
         ===================================================================== */
      const armL = joint(body, -0.30, 0.17, 0);
      box(armL, 0.165, 0.16, 0.165, C.robe,  0, -0.06, 0);
      box(armL, 0.18,  0.06, 0.18,  C.robeL, 0, -0.15, 0);
      box(armL, 0.185, 0.02, 0.185, C.gold,  0, -0.175, 0);

      const foreL = joint(armL, 0, -0.17, 0);
      box(foreL, 0.135, 0.16, 0.135, C.skin,  0, -0.07, 0);
      box(foreL, 0.13,  0.09, 0.13,  C.skinD, 0, -0.18, 0.01);

      // Keranjang Anyaman Tanaman Obat di Tangan Kiri (basketPivot)
      const basketPivot = joint(foreL, -0.03, -0.19, 0.06);
      // Gagang melengkung keranjang rotan
      box(basketPivot, 0.03, 0.14, 0.20, C.woodD, 0, -0.06, 0);
      box(basketPivot, 0.24, 0.035, 0.22, C.woodD, 0, -0.13, 0); // Bibir keranjang
      box(basketPivot, 0.22, 0.13,  0.20, C.wood,  0, -0.20, 0); // Badan keranjang
      box(basketPivot, 0.18, 0.03,  0.16, C.woodD, 0, -0.27, 0); // Alas keranjang
      // Tanaman obat rimbun, beri merah & bunga biru di dalam keranjang
      box(basketPivot, 0.19, 0.06, 0.17, C.herbD,  0,    -0.11,  0);
      box(basketPivot, 0.10, 0.08, 0.09, C.herb,  -0.04, -0.08,  0.03, 0.1, 0,  0.2);
      box(basketPivot, 0.065, 0.065, 0.065, C.berry, -0.05, -0.06, 0.04);
      box(basketPivot, 0.065, 0.065, 0.065, C.flower, 0.05, -0.06, -0.03);
      box(basketPivot, 0.05,  0.07,  0.05,  C.gold,   0.04, -0.06,  0.05);

      /* =====================================================================
         5. LENGAN KANAN 2-SENDI + TONGKAT PENYEMBUH KRISTAL GIOK MELAYANG
         ===================================================================== */
      const armR = joint(body, 0.30, 0.17, 0);
      box(armR, 0.165, 0.16, 0.165, C.robe,  0, -0.06, 0);
      box(armR, 0.18,  0.06, 0.18,  C.robeL, 0, -0.15, 0);
      box(armR, 0.185, 0.02, 0.185, C.gold,  0, -0.175, 0);

      const foreR = joint(armR, 0, -0.17, 0);
      box(foreR, 0.135, 0.16, 0.135, C.skin,  0, -0.07, 0);
      box(foreR, 0.13,  0.09, 0.13,  C.skinD, 0, -0.18, 0.01);

      // Grip Tongkat Penyembuh di tangan kanan (mengarah ke depan +Z)
      const grip = joint(foreR, 0, -0.18, 0.04);
      grip.rotation.set(-0.22, 0, 0);

      // Batang kayu ek tua berbalut cincin emas & sulur hidup
      box(grip, 0.046, 0.046, 1.06, C.wood,     0, 0,  0.34);
      box(grip, 0.056, 0.056, 0.22, C.leatherD, 0, 0,  0.02); // Balutan kulit pegangan
      box(grip, 0.062, 0.062, 0.06, C.gold,     0, 0, -0.21); // Pommel emas belakang
      box(grip, 0.058, 0.058, 0.05, C.gold,     0, 0,  0.52); // Cincin tengah
      box(grip, 0.068, 0.068, 0.08, C.gold,     0, 0,  0.84); // Dasar mahkota tongkat

      // Mahkota Penyangga Kristal (2 Lengan Emas Melengkung Caduceus + Daun Obat)
      box(grip, 0.04, 0.14, 0.14, C.gold,  0,  0.08, 0.92,  0.35, 0, 0);
      box(grip, 0.04, 0.14, 0.14, C.gold,  0, -0.08, 0.92, -0.35, 0, 0);
      box(grip, 0.035, 0.05, 0.12, C.goldD, 0,  0.13, 1.02, -0.20, 0, 0);
      box(grip, 0.035, 0.05, 0.12, C.goldD, 0, -0.13, 1.02,  0.20, 0, 0);
      // Sayap daun zamrud kecil di leher mahkota tongkat
      box(grip, 0.14, 0.03, 0.06, C.herb,  0.08, 0, 0.86, 0,  0.3, 0);
      box(grip, 0.14, 0.03, 0.06, C.herb, -0.08, 0, 0.86, 0, -0.3, 0);

      // Inti Kristal Giok Penyembuh Melayang & Berputar (jadeCore)
      const jadeCore = joint(grip, 0, 0, 1.00);
      const jadeMesh1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.095, 0.15),
        new THREE.MeshBasicMaterial({ color: C.jade })
      );
      const jadeMesh2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.065, 0.19),
        new THREE.MeshBasicMaterial({ color: C.jadeL })
      );
      jadeCore.add(jadeMesh1);
      jadeCore.add(jadeMesh2);

      // Cincin Halo Emas Berputar Mengelilingi Kristal Giok (haloRing)
      const haloRing = joint(grip, 0, 0, 1.00);
      box(haloRing, 0.20, 0.022, 0.022, C.gold,  0,  0.10, 0);
      box(haloRing, 0.20, 0.022, 0.022, C.gold,  0, -0.10, 0);
      box(haloRing, 0.022, 0.20, 0.022, C.gold,  0.10, 0,  0);
      box(haloRing, 0.022, 0.20, 0.022, C.gold, -0.10, 0,  0);

      // 3 Partikel Cahaya Penyembuh (Motes) yang mengorbit saat merapal/menyembuhkan
      const motes = [];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.045, 0.045),
          new THREE.MeshBasicMaterial({ color: i === 0 ? C.jadeL : C.jade })
        );
        jadeCore.add(m);
        motes.push(m);
      }

      // Selesaikan penggabungan geometri voxel
      vb.finish();

      const parts = {
        body,
        apronFlap,
        potions,
        pack,
        head,
        glasses,
        brows,
        beret,
        armL,
        foreL,
        basketPivot,
        armR,
        foreR,
        grip,
        jadeCore,
        haloRing,
        motes,
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
      const t = (n._herbalT = (n._herbalT || 0) + dt);

      /* 1. Hit-flash merah saat terkena serangan */
      const em = (n.flash && n.flash > 0) ? 0xaa2222 : 0x000000;
      if (n._lastEm !== em && n.mesh) {
        n._lastEm = em;
        n.mesh.traverse(o => {
          if (o.material && o.material.emissive) o.material.emissive.setHex(em);
        });
      }

      /* 2. State Halus (Kecepatan, Siklus Langkah, Merapal/Menyembuhkan & Ayunan) */
      const rawSp = Math.hypot(n.vel ? n.vel.x : 0, n.vel ? n.vel.z : 0);
      const isWorking = !!(
        n.working ||
        (n.forageT && n.forageT > 0) ||
        (n.mineT && n.mineT > 0)
      );
      const isHealing = !!(n.healing || (n.healT && n.healT > 0.05));
      const hasSwing = (n.swing && n.swing > 0) || isWorking;

      const st = n._herbalState || (n._herbalState = {
        speed: 0,
        gait: 0,
        runBlend: 0,
        workBlend: 0,
        healBlend: 0,
        workCycle: 0,
        swingActive: false,
        basketPitch: 0,
        basketRoll: 0
      });

      const moveTarget = (n.walking || rawSp > 0.12) ? rawSp : 0;
      st.speed = lerp(st.speed, moveTarget, clamp(dt * 10, 0, 1));
      const move01 = clamp(st.speed / Math.max(1, (n.speed || 3.4) * 0.9), 0, 1.35);
      const walk01 = clamp(move01, 0, 1);
      const isRun = move01 > 0.82 ? (move01 - 0.82) / 0.53 : 0;
      st.runBlend = lerp(st.runBlend, clamp(isRun, 0, 1), clamp(dt * 7, 0, 1));
      st.healBlend = lerp(st.healBlend, isHealing ? 1 : 0, clamp(dt * 6, 0, 1));

      if (walk01 > 0.02) {
        const freq = lerp(7.0, 11.2, st.runBlend) * clamp(0.65 + move01 * 0.45, 0.6, 1.4);
        st.gait = (st.gait + dt * freq) % (Math.PI * 2);
      }

      st.workBlend = lerp(st.workBlend, hasSwing ? 1 : 0, clamp(dt * 14, 0, 1));
      if (hasSwing) {
        if (!st.swingActive) {
          st.swingActive = true;
          st.workCycle = 0.04;
        }
        const rate = isWorking ? 0.95 : 1.75;
        st.workCycle += dt * rate;
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

      /* 3. Siklus Kaki 2-Sendi & Flap Celemek */
      const stride = lerp(0.54, 0.80, st.runBlend) * walk01;
      const kneeBend = lerp(0.52, 0.86, st.runBlend) * walk01;

      const legR = sinP * stride;
      const legL = -sinP * stride;
      const liftR = Math.max(0, cosP);
      const liftL = Math.max(0, -cosP);

      const brace = st.workBlend * (1 - walk01 * 0.7);
      P.legs[0].rotation.set(legR + brace * 0.12, 0, 0);
      P.legs[1].rotation.set(legL - brace * 0.14, 0, 0);

      if (P.shins && P.shins.length === 2) {
        P.shins[0].rotation.x = liftR * kneeBend + brace * 0.15;
        P.shins[1].rotation.x = liftL * kneeBend + brace * 0.12;
      }

      if (P.apronFlap) {
        const maxForwardLeg = Math.min(legR, legL);
        P.apronFlap.rotation.x = clamp(maxForwardLeg * 0.72 - 0.05 - walk01 * 0.08, -0.75, 0.12);
      }

      /* 4. Gerak Badan, Napas & Koreografi Tongkat Penyembuh */
      const breath = Math.sin(t * 2.4) * 0.012 * (1 - walk01 * 0.6);
      const stepBob = Math.abs(sinP) * lerp(0.034, 0.058, st.runBlend) * walk01;
      const forwardLean = lerp(0.04, 0.14, st.runBlend) * walk01;

      const c = st.workCycle;
      let bodyPitchAdd = 0;
      let bodyYawAdd = 0;
      let bodySink = 0;

      // Pose dasar lengan kanan (memegang tongkat giok) & kiri (menjinjing keranjang obat)
      let armRPitch = -sinP * 0.38 * walk01 - 0.18;
      let armRYaw = 0;
      let armRRoll = -0.06;
      let foreRPitch = -0.36 - Math.max(0, -sinP) * 0.20 * walk01;
      let gripPitch = -0.22;

      let armLPitch = sinP * 0.30 * walk01 - 0.28;
      let armLYaw = 0.08;
      let armLRoll = 0.10;
      let foreLPitch = -0.46;

      // Saat pasif menyembuhkan pemain (mend/healBlend), angkat tongkat lembut ke depan atas
      if (st.healBlend > 0.01 && st.workBlend < 0.2) {
        const hb = st.healBlend;
        const wave = Math.sin(t * 4.2);
        armRPitch  = lerp(armRPitch,  -0.95 + wave * 0.12, hb);
        armRYaw    = lerp(armRYaw,    -0.12 + Math.cos(t * 2.1) * 0.10, hb);
        foreRPitch = lerp(foreRPitch, -0.45, hb);
        gripPitch  = lerp(gripPitch,  -0.05, hb);
        armLPitch  = lerp(armLPitch,  -0.52 - wave * 0.08, hb);
      }

      // Saat menyerang / memanen tanaman obat (3-Phase Staff Cast/Strike)
      if (st.workBlend > 0.01 && st.swingActive) {
        const wb = st.workBlend;
        let rPitch = -0.2, rYaw = 0, rRoll = -0.06, fPitch = -0.36, gPitch = -0.22;
        let lPitch = -0.45, lYaw = 0.16;

        if (c < 0.36) {
          // Fase 1: Angkat tongkat penyembuh & himpun energi zamrud
          const u = smooth(c / 0.36);
          bodyPitchAdd = lerp(0, -0.14, u) * wb;
          bodyYawAdd   = lerp(0, -0.34, u) * wb;
          bodySink     = lerp(0,  0.02, u) * wb;
          rPitch       = lerp(-0.20, -1.65, u);
          rYaw         = lerp(0,     -0.38, u);
          rRoll        = lerp(-0.06, -0.26, u);
          fPitch       = lerp(-0.36, -0.62, u);
          gPitch       = lerp(-0.22, -0.35, u);
          lPitch       = lerp(-0.30, -0.65, u);
          lYaw         = lerp(0.08,   0.28, u);
        } else if (c < 0.65) {
          // Fase 2: Ayunan dorong tongkat & pancaran kristal giok ke depan!
          const u = Math.pow(clamp((c - 0.36) / 0.29, 0, 1), 1.5);
          bodyPitchAdd = lerp(-0.14,  0.24, u) * wb;
          bodyYawAdd   = lerp(-0.34,  0.32, u) * wb;
          bodySink     = lerp( 0.02, -0.05, u) * wb;
          rPitch       = lerp(-1.65, -0.38, u);
          rYaw         = lerp(-0.38,  0.28, u);
          rRoll        = lerp(-0.26,  0.10, u);
          fPitch       = lerp(-0.62, -0.12, u);
          gPitch       = lerp(-0.35,  0.28, u);
          lPitch       = lerp(-0.65, -0.32, u);
          lYaw         = lerp(0.28,  -0.10, u);
        } else {
          // Fase 3: Pemulihan luwes kembali ke kuda-kuda tabib
          const u = smooth((c - 0.65) / 0.35);
          bodyPitchAdd = lerp(0.24, 0, u) * wb;
          bodyYawAdd   = lerp(0.32, 0, u) * wb;
          bodySink     = lerp(-0.05, 0, u) * wb;
          rPitch       = lerp(-0.38, -0.20, u);
          rYaw         = lerp(0.28,  0,     u);
          rRoll        = lerp(0.10, -0.06,  u);
          fPitch       = lerp(-0.12, -0.36, u);
          gPitch       = lerp(0.28,  -0.22, u);
          lPitch       = lerp(-0.32, -0.30, u);
          lYaw         = lerp(-0.10,  0.08, u);
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
      P.body.rotation.y = -sinP * 0.07 * walk01 + bodyYawAdd;
      P.body.rotation.z = cosP * 0.025 * walk01;

      P.armR.rotation.set(armRPitch, armRYaw, armRRoll);
      P.foreR.rotation.set(foreRPitch, 0, 0);
      P.grip.rotation.set(gripPitch, 0, 0);

      P.armL.rotation.set(armLPitch, armLYaw, armLRoll);
      P.foreL.rotation.set(foreLPitch, 0, 0);

      /* 5. Ayunan Pendulum Keranjang Obat, Kristal Giok Berputar & Partikel Orbit */
      if (P.basketPivot) {
        const targetBX = -(armLPitch + foreLPitch) * 0.48 + Math.sin(t * 2.5) * 0.05 + cosP * 0.15 * walk01;
        const targetBZ = Math.cos(t * 2.0) * 0.04 - sinP * 0.08 * walk01;
        st.basketPitch = lerp(st.basketPitch, targetBX, clamp(dt * 9, 0, 1));
        st.basketRoll  = lerp(st.basketRoll,  targetBZ, clamp(dt * 9, 0, 1));
        P.basketPivot.rotation.set(st.basketPitch, 0, st.basketRoll);
      }

      const magicPower = Math.max(st.workBlend, st.healBlend);
      if (P.jadeCore) {
        const spinSpeed = lerp(2.2, 8.5, magicPower);
        P.jadeCore.rotation.z = (P.jadeCore.rotation.z || 0) + dt * spinSpeed;
        P.jadeCore.position.y = Math.sin(t * 3.8) * 0.018;
        const sc = 1 + magicPower * 0.25 + Math.sin(t * 6.5) * 0.06;
        P.jadeCore.scale.setScalar(sc);
      }
      if (P.haloRing) {
        P.haloRing.rotation.z = -t * lerp(1.6, 6.0, magicPower);
        P.haloRing.rotation.x = Math.sin(t * 2.4) * 0.35;
        P.haloRing.rotation.y = Math.cos(t * 2.0) * 0.35;
      }
      if (P.motes && P.motes.length === 3) {
        const orbitR = lerp(0.08, 0.19, magicPower);
        for (let i = 0; i < 3; i++) {
          const ang = t * lerp(3.0, 7.5, magicPower) + (i * Math.PI * 2) / 3;
          P.motes[i].position.set(
            Math.cos(ang) * orbitR,
            Math.sin(ang) * orbitR,
            Math.sin(ang * 2) * 0.06
          );
        }
      }

      // Denyut halus botol ramuan di selempang dada
      if (P.potions) {
        for (let i = 0; i < P.potions.length; i++) {
          const pScale = 1 + Math.sin(t * 4.5 + i * 1.8) * 0.05;
          P.potions[i].scale.set(1, pScale, 1);
        }
      }

      if (P.pack) {
        P.pack.position.y = 0.04 + Math.abs(sinP) * 0.016 * walk01;
      }

      /* 6. Kepala, Kacamata & Alis */
      const lookYaw = (n.headAngle !== undefined && n.headAngle !== null)
        ? n.headAngle
        : ((n.target || isWorking) ? -bodyYawAdd * 0.65 : Math.sin(t * 1.15) * 0.28 * (1 - walk01 * 0.6));
      const lookPitch = Math.sin(t * 1.6) * 0.04;

      P.head.rotation.y = lerp(P.head.rotation.y || 0, lookYaw, clamp(dt * 8, 0, 1));
      P.head.rotation.x = lerp(P.head.rotation.x || 0, lookPitch, clamp(dt * 8, 0, 1));

      if (P.brows && P.brows.length === 2) {
        const browTilt = n.target ? 0.14 : -0.04;
        P.brows[0].rotation.z = -browTilt;
        P.brows[1].rotation.z =  browTilt;
      }
    }
  };
})();

window.NPC_Herbal = NPC_Herbal;
