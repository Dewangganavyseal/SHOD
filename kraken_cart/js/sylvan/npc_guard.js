'use strict';
/* =============================================================================
   ENTITAS NPC: PENJAGA DESA (🛡️ Village Watchman / Halberdier)
   -----------------------------------------------------------------------------
   Model 3D Detail Tinggi & Animasi Juicy:
   - Kaki 2-sendi (paha -> lutut/betis) dengan gerakan langkah & tekukan lutut alami
   - Torso berlapis: gambeson merah desa, cuirass pelat baja, tabard depan-belakang,
     sabuk perlengkapan, dan jubah bahu pendek (watchman cape) yang berkibar
   - Kepala detail: wajah tegas berkumis tebal, alis ekspresif, dan Helm Kettle Hat
     baja berpelindung hidung (nasal guard) & jambul kuningan
   - Lengan 2-sendi (bahu -> siku): tangan kiri memegang Perisai Bundar Desa berlapis
     baja, tangan kanan memegang Halberd Penjaga berjumbai merah
   ============================================================================= */

const NPC_Guard = (() => {

  const BODY_Y = 0.78;
  const TAU = Math.PI * 2;

  const C = {
    robe:     0xa8552f, // Tunik / gambeson merah terakota desa
    robeD:    0x783618, // Lipatan tunik gelap
    robeL:    0xc46b42, // Sorot kain tunik
    blue:     0x32425e, // Celana militer biru tua
    blueD:    0x202b3e, // Bayangan celana
    skin:     0xd49b6a, // Kulit wajah
    skinD:    0xb87a4c, // Bayangan kulit
    hair:     0x38261a, // Rambut & kumis coklat tua
    hairD:    0x22160e, // Alis & bayangan kumis
    boot:     0x2c2117, // Sepatu bot kulit tebal
    bootD:    0x1a130c, // Sol sepatu
    wood:     0x5c3d22, // Gagang kayu ash halberd & papan perisai
    woodD:    0x3d2714, // Kayu gelap
    metal:    0xb0bcc9, // Pelat baja utama
    metalD:   0x788492, // Baja gelap / bayangan zirah
    metalH:   0xdce6f0, // Sorot mata pisau & tepi baja mengkilap
    gold:     0xdca428, // Kuningan / emas ornamen desa
    goldD:    0xa67818, // Kuningan tua
    leather:  0x50351f, // Sabuk & sarung tangan kulit
    leatherD: 0x362212, // Kulit gelap
    cape:     0x5e2418, // Jubah pendek penjaga
    capeD:    0x42170e, // Bagian dalam jubah
    crimson:  0xb82929, // Jumbai rumbai halberd & lambang perisai
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  /* Builder penggabung voxel per bagian rig (1 draw call per sendi,
     material dibuat baru per NPC agar hit-flash terisolasi) */
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

  return {
    /* ---------- MODEL 3D ---------- */
    build() {
      const g = new THREE.Group();
      const builder = createVoxelBuilder();
      const box = builder.box;
      const joint = (parent, x = 0, y = 0, z = 0) => {
        const p = new THREE.Group();
        p.position.set(x, y, z);
        parent.add(p);
        return p;
      };

      /* =====================================================================
         1. KAKI 2-SENDI (PAHA -> LUTUT/BETIS -> SEPATU BOT BAJA)
         ===================================================================== */
      const legs = [];
      const shins = [];
      for (const side of [1, -1]) {
        const lg = joint(g, 0.125 * side, 0.52, 0);
        // Paha celana militer biru + pelat paha samping (culet)
        box(lg, 0.19, 0.22, 0.21, C.blue,     0, -0.10, 0);
        box(lg, 0.20, 0.04, 0.22, C.leatherD, 0, -0.16, 0); // Sabuk pengikat pelindung lutut
        box(lg, 0.04, 0.16, 0.16, C.metalD,   side * 0.095, -0.09, 0);

        // Sendi Lutut & Betis (Shin)
        const shin = joint(lg, 0, -0.21, 0);
        // Pelindung lutut baja (Poleyn) bersudut dengan paku kuningan
        box(shin, 0.15, 0.10, 0.06, C.metal,  0,  0.01, 0.105);
        box(shin, 0.11, 0.06, 0.03, C.metalH, 0,  0.01, 0.13);
        box(shin, 0.03, 0.03, 0.02, C.gold,   side * 0.055, 0.01, 0.125);
        // Betis & greave baja depan
        box(shin, 0.17, 0.16, 0.19, C.blueD,  0, -0.07, 0);
        box(shin, 0.13, 0.15, 0.04, C.metalD, 0, -0.08, 0.09);
        // Sepatu bot kulit berlapis pelat jari baja
        box(shin, 0.165, 0.12, 0.185, C.boot,  0, -0.18, 0.005);
        box(shin, 0.18,  0.04, 0.20,  C.leather, 0, -0.13, 0.005); // Manset atas bot
        box(shin, 0.18,  0.08, 0.24,  C.boot,  0, -0.24, 0.03);
        box(shin, 0.14,  0.05, 0.07,  C.metal, 0, -0.25, 0.125);   // Pelindung ujung kaki baja
        box(shin, 0.19,  0.035, 0.26, C.bootD, 0, -0.285, 0.035);  // Sol sepatu tebal

        lg.userData.shin = shin;
        legs.push(lg);
        shins.push(shin);
      }

      /* =====================================================================
         2. TORSO: GAMBESON MERAH, CUIRASS BAJA, TABARD & CAPE PENJAGA
         ===================================================================== */
      const body = joint(g, 0, BODY_Y, 0);

      // Inti tunik gambeson berlapis
      box(body, 0.50, 0.46, 0.32, C.robe,  0,  0.01, 0);
      box(body, 0.52, 0.10, 0.35, C.robeD, 0, -0.19, 0);
      // Kerah tinggi gambeson pelindung leher (gorget kulit/baja)
      box(body, 0.36, 0.07, 0.30, C.leatherD, 0, 0.25, 0);
      box(body, 0.32, 0.05, 0.28, C.metalD,   0, 0.27, 0.02);

      // Zirah Pelat Dada Baja (Breastplate & Backplate) berprofil V
      box(body, 0.46, 0.32, 0.12, C.metal,  0, 0.06,  0.13);
      box(body, 0.40, 0.24, 0.05, C.metalH, 0, 0.08,  0.185);
      box(body, 0.16, 0.26, 0.03, C.metal,  0, 0.07,  0.205); // Lunas tengah cuirass
      box(body, 0.44, 0.30, 0.09, C.metalD, 0, 0.05, -0.14);  // Pelat punggung
      // Lis kuningan & lambang perisai emas di dada
      box(body, 0.38, 0.03, 0.03, C.gold,   0, 0.20,  0.195);
      box(body, 0.07, 0.09, 0.02, C.gold,   0, 0.09,  0.215);
      for (const s of [-1, 1]) {
        box(body, 0.035, 0.035, 0.02, C.gold, s * 0.16, 0.16, 0.195);
        box(body, 0.035, 0.035, 0.02, C.gold, s * 0.15, 0.00, 0.190);
        // Pelat pelindung pinggul (Tassets baja)
        box(body, 0.15, 0.12, 0.05, C.metalD, s * 0.17, -0.22, 0.16, -0.1, 0, -s * 0.08);
        box(body, 0.13, 0.03, 0.06, C.goldD,  s * 0.17, -0.27, 0.16, -0.1, 0, -s * 0.08);
      }

      // Sabuk kulit prajurit tebal, gesper kuningan, kantong & terompet jaga
      box(body, 0.53, 0.08, 0.36, C.leather,  0, -0.10, 0);
      box(body, 0.54, 0.03, 0.37, C.leatherD, 0, -0.10, 0);
      box(body, 0.11, 0.10, 0.04, C.gold,     0, -0.10, 0.175);
      box(body, 0.06, 0.05, 0.02, 0x1c1610,   0, -0.10, 0.192);
      // Kantong kulit di pinggul kanan & sarung belati kecil di kiri
      box(body, 0.10, 0.12, 0.09, C.leatherD, 0.23, -0.13, 0.11);
      box(body, 0.08, 0.035, 0.07, C.gold,    0.23, -0.07, 0.115);
      box(body, 0.05, 0.18, 0.06, C.leatherD, -0.25, -0.14, -0.04, 0.35, 0, 0.15);

      // Rok Tabard Depan & Belakang (mengayun mengikuti langkah)
      const tabardF = joint(body, 0, -0.14, 0.165);
      box(tabardF, 0.22, 0.22, 0.03, C.robe, 0, -0.10, 0);
      box(tabardF, 0.22, 0.035, 0.035, C.gold, 0, -0.20, 0);
      box(tabardF, 0.04, 0.18, 0.035, C.goldD, 0, -0.09, 0.005);

      // Jubah Pendek Bahu Penjaga (Watchman Half-Cape di punggung)
      const cape = joint(body, 0, 0.21, -0.17);
      box(cape, 0.46, 0.06, 0.06, C.capeD, 0, -0.02, 0);
      box(cape, 0.44, 0.32, 0.04, C.cape,  0, -0.18, -0.02, 0.08, 0, 0);
      box(cape, 0.40, 0.22, 0.035, C.capeD, 0, -0.40, -0.04, 0.14, 0, 0);
      box(cape, 0.40, 0.035, 0.04, C.goldD, 0, -0.50, -0.05, 0.14, 0, 0);
      // Peniti jubah emas di kedua bahu depan
      for (const s of [-1, 1]) {
        box(body, 0.07, 0.07, 0.04, C.gold, s * 0.19, 0.21, 0.15);
      }

      /* =====================================================================
         3. KEPALA: WAJAH PRAJURIT, KUMIS TEBAL & HELM KETTLE HAT BAJA
         ===================================================================== */
      const head = joint(body, 0, 0.38, 0);

      // Kepala & rahang kokoh
      box(head, 0.34, 0.31, 0.32, C.skin,  0,  0.01, 0);
      box(head, 0.31, 0.09, 0.30, C.skinD, 0, -0.12, 0.01);
      // Telinga & rambut belakang di bawah helm
      for (const s of [-1, 1]) {
        box(head, 0.04, 0.09, 0.06, C.skinD, s * 0.18, -0.01, 0);
        box(head, 0.04, 0.14, 0.20, C.hairD, s * 0.165, 0.02, -0.05);
      }
      box(head, 0.32, 0.16, 0.06, C.hairD, 0, 0.0, -0.15);

      // Mata prajurit fokus dengan kilau putih & alis ekspresif
      const brows = [];
      for (const s of [1, -1]) {
        box(head, 0.075, 0.055, 0.02, 0xffffff, 0.082 * s, 0.02, 0.158);
        box(head, 0.042, 0.055, 0.02, 0x182232, 0.082 * s, 0.02, 0.166);
        box(head, 0.018, 0.018, 0.01, 0xffffff, 0.092 * s, 0.034, 0.174);
        const brow = joint(head, 0.082 * s, 0.068, 0.168);
        box(brow, 0.095, 0.028, 0.03, C.hairD, 0, 0, 0);
        brows.push({ brow, side: s });
      }

      // Hidung mancung, kumis handlebar tebal & janggut dagu pendek
      box(head, 0.06, 0.10, 0.08, C.skinD, 0, -0.015, 0.185);
      box(head, 0.20, 0.055, 0.05, C.hairD, 0, -0.075, 0.175);
      box(head, 0.26, 0.038, 0.045, C.hair,  0, -0.095, 0.172);
      for (const s of [-1, 1]) {
        box(head, 0.05, 0.045, 0.04, C.hair, s * 0.13, -0.08, 0.168, 0, 0, s * 0.25);
        // Tali dagu kulit di pipi
        box(head, 0.025, 0.18, 0.035, C.leatherD, s * 0.172, -0.02, 0.05);
      }
      box(head, 0.10, 0.045, 0.04, C.hairD, 0, -0.145, 0.162);

      // HELM KETTLE HAT BAJA (Chapel-de-fer) lengkap dengan pinggiran miring & pelindung hidung
      box(head, 0.38, 0.16, 0.38, C.metal,  0, 0.15, -0.005);
      box(head, 0.34, 0.06, 0.34, C.metalH, 0, 0.24, -0.005);
      // Pita kuningan penguat mahkota helm
      box(head, 0.39, 0.035, 0.39, C.gold,  0, 0.105, -0.005);
      // Pinggiran lebar Kettle Hat (Brim) berlapis tepi baja & paku keling
      box(head, 0.52, 0.035, 0.52, C.metalD, 0, 0.08, -0.005);
      box(head, 0.55, 0.025, 0.55, C.metal,  0, 0.068, -0.005);
      // Jambul lunas baja atas (Medial Comb) & Pelindung Hidung (Nasal Bar)
      box(head, 0.055, 0.11, 0.36, C.metalH, 0, 0.26, -0.005);
      box(head, 0.06,  0.03, 0.37, C.gold,   0, 0.31, -0.005);
      box(head, 0.048, 0.13, 0.045, C.metalH, 0, 0.02, 0.198);

      /* =====================================================================
         4. LENGAN KIRI 2-SENDI + PERISAI BUNDAR DESA (ARM_L -> FORE_L -> SHIELD)
         ===================================================================== */
      const armL = joint(body, -0.32, 0.17, 0);
      // Pauldron baja bertingkat dengan lis emas
      box(armL, 0.20, 0.11, 0.22, C.metal,  -0.02,  0.03, 0, 0, 0, 0.12);
      box(armL, 0.18, 0.06, 0.20, C.metalH, -0.02,  0.08, 0, 0, 0, 0.12);
      box(armL, 0.21, 0.03, 0.23, C.gold,   -0.02, -0.01, 0, 0, 0, 0.12);
      // Lengan atas gambeson
      box(armL, 0.14, 0.20, 0.15, C.robe,    0, -0.11, 0);

      // Siku & Lengan Bawah Kiri (Forearm L)
      const foreL = joint(armL, 0, -0.21, 0);
      box(foreL, 0.15, 0.07, 0.16, C.metalD,  0,  0.0,  0);    // Pelindung siku (couter)
      box(foreL, 0.145, 0.14, 0.15, C.metal,  0, -0.09, 0);    // Vambrace baja
      box(foreL, 0.15, 0.03, 0.155, C.goldD,  0, -0.04, 0);
      box(foreL, 0.135, 0.10, 0.14, C.leather, 0, -0.19, 0.01); // Gauntlet kulit

      // Perisai Bundar/Oktagonal Penjaga Desa di lengan bawah kiri
      const shield = joint(foreL, -0.11, -0.12, 0.10);
      shield.rotation.set(-0.08, 0.22, 0);
      // Papan kayu ek berlapis bingkai baja oktagonal
      box(shield, 0.44, 0.48, 0.045, C.wood,    0, 0, 0);
      box(shield, 0.36, 0.54, 0.042, C.woodD,   0, 0, -0.002);
      box(shield, 0.50, 0.38, 0.042, C.woodD,   0, 0, -0.002);
      // Bingkai baja luar & palang salib merah-emas desa
      box(shield, 0.47, 0.51, 0.025, C.metalD,  0, 0, 0.022);
      box(shield, 0.38, 0.42, 0.030, C.wood,    0, 0, 0.025);
      box(shield, 0.38, 0.08, 0.035, C.crimson, 0, 0, 0.028);
      box(shield, 0.08, 0.42, 0.035, C.crimson, 0, 0, 0.028);
      // Boss baja cembung tengah (Umbo) + 4 paku keling emas
      box(shield, 0.14, 0.14, 0.055, C.metalH,  0, 0, 0.048);
      box(shield, 0.08, 0.08, 0.065, C.gold,    0, 0, 0.058);
      for (const sx of [-0.15, 0.15]) {
        for (const sy of [-0.17, 0.17]) {
          box(shield, 0.035, 0.035, 0.02, C.gold, sx, sy, 0.042);
        }
      }

      /* =====================================================================
         5. LENGAN KANAN 2-SENDI + HALBERD PENJAGA DESA (ARM_R -> FORE_R -> GRIP)
         ===================================================================== */
      const armR = joint(body, 0.32, 0.17, 0);
      box(armR, 0.20, 0.11, 0.22, C.metal,   0.02,  0.03, 0, 0, 0, -0.12);
      box(armR, 0.18, 0.06, 0.20, C.metalH,  0.02,  0.08, 0, 0, 0, -0.12);
      box(armR, 0.21, 0.03, 0.23, C.gold,    0.02, -0.01, 0, 0, 0, -0.12);
      box(armR, 0.14, 0.20, 0.15, C.robe,    0, -0.11, 0);

      const foreR = joint(armR, 0, -0.21, 0);
      box(foreR, 0.15, 0.07, 0.16, C.metalD,   0,  0.0,  0);
      box(foreR, 0.145, 0.14, 0.15, C.metal,   0, -0.09, 0);
      box(foreR, 0.15, 0.03, 0.155, C.goldD,   0, -0.04, 0);
      box(foreR, 0.135, 0.10, 0.14, C.leather, 0, -0.19, 0.01);

      // Grip Halberd di tangan kanan (menghadap ke depan +Z)
      const grip = joint(foreR, 0, -0.19, 0.05);
      grip.rotation.set(-0.22, 0, 0.04);

      // Batang kayu Halberd panjang + balutan kulit + pommel kuningan belakang
      box(grip, 0.046, 0.046, 1.32, C.wood,     0, 0,  0.34);
      box(grip, 0.056, 0.056, 0.26, C.leatherD, 0, 0,  0.02);
      box(grip, 0.065, 0.065, 0.06, C.gold,     0, 0, -0.32); // Pommel belakang
      // Soket baja & cincin emas leher halberd + rumbai merah (tassel)
      box(grip, 0.072, 0.072, 0.12, C.gold,     0, 0,  0.86);
      box(grip, 0.058, 0.058, 0.26, C.metalD,   0, 0,  0.98);
      const tassel = joint(grip, 0, -0.04, 0.84);
      box(tassel, 0.045, 0.14, 0.055, C.crimson, 0, -0.06, 0, 0.2, 0, 0);
      box(tassel, 0.050, 0.03, 0.060, C.gold,    0, -0.12, 0.01, 0.2, 0, 0);

      // Bilah Kapak Bulan Sabit Halberd (menghadap bawah/samping-depan)
      box(grip, 0.032, 0.20, 0.20, C.metalD,  0,  0.09, 0.98);
      box(grip, 0.026, 0.28, 0.26, C.metal,   0,  0.14, 0.99);
      box(grip, 0.018, 0.32, 0.28, C.metalH,  0,  0.17, 1.00); // Mata kapak tajam
      // Kait penarik zirah di sisi sebaliknya (Rear Fluke)
      box(grip, 0.028, 0.14, 0.12, C.metalD,  0, -0.10, 0.96, -0.35, 0, 0);
      box(grip, 0.020, 0.08, 0.08, C.metalH,  0, -0.16, 0.93, -0.55, 0, 0);
      // Tombak Runcing Panjang di Ujung Depan (+Z)
      box(grip, 0.050, 0.050, 0.24, C.metal,  0, 0, 1.16);
      box(grip, 0.034, 0.034, 0.18, C.metalH, 0, 0, 1.30);
      box(grip, 0.020, 0.020, 0.10, 0xffffff, 0, 0, 1.40);

      // Gabungkan seluruh geometri voxel per sendi
      builder.finish();

      const parts = {
        body,
        head,
        armL,
        foreL,
        shield,
        armR,
        foreR,
        grip,
        tassel,
        legs,
        shins,
        tabardF,
        cape,
        brows,
        bodyY: BODY_Y
      };

      this.animate({ mesh: g, parts, vel: { x: 0, z: 0 } }, 0);
      return { mesh: g, parts };
    },

    /* ---------- ANIMASI LENGKAP (SMOOTH & JUICY) ---------- */
    animate(n, dt) {
      const P = n.parts;
      if (!P || !P.body) return;

      dt = Math.min(dt || 0, 0.1);
      const t = (n._guardT = (n._guardT || 0) + dt);

      /* 1. Hit-flash merah saat terkena serangan */
      const em = (n.flash && n.flash > 0) ? 0xaa2222 : 0x000000;
      if (n._lastEm !== em) {
        n._lastEm = em;
        n.mesh.traverse(o => {
          if (o.material && o.material.emissive) o.material.emissive.setHex(em);
        });
      }

      /* 2. Damping Kecepatan, Arah Belok & Sikap Siaga Tempur */
      const rawSp = Math.hypot(n.vel ? n.vel.x : 0, n.vel ? n.vel.z : 0);
      const yaw = n.mesh ? n.mesh.rotation.y : 0;
      const st = n._guardState || (n._guardState = {
        speed: 0,
        gait: 0,
        runBlend: 0,
        combat: 0,
        turn: 0,
        yaw: yaw,
        atkActive: false,
        atkT: 0,
        lastSwing: 0,
        comboAlt: 0
      });

      const easeMove = 1 - Math.exp(-12 * dt);
      const easePose = 1 - Math.exp(-8 * dt);
      st.speed += (rawSp - st.speed) * easeMove;
      st.gait += (clamp(st.speed / 1.8, 0, 1) - st.gait) * easeMove;
      st.runBlend += (clamp((st.speed - 2.3) / 1.5, 0, 1) - st.runBlend) * easeMove;
      st.combat += ((n.target ? 1 : 0) - st.combat) * easePose;

      const yawDiff = Math.atan2(Math.sin(yaw - st.yaw), Math.cos(yaw - st.yaw));
      const instTurn = dt > 0.0005 ? clamp(yawDiff / dt, -5, 5) * 0.035 : 0;
      st.turn += (instTurn - st.turn) * (1 - Math.exp(-10 * dt));
      st.yaw = yaw;

      /* 3. Timeline Serangan Juicy (Trigger dari n.swing -> 0.50s Full Martial Halberd Combo) */
      const curSwing = n.swing || 0;
      if (curSwing > st.lastSwing + 0.02) {
        st.atkActive = true;
        st.atkT = 0;
        st.comboAlt = 1 - st.comboAlt; // Bergantian antara tebasan kapak & tusukan tombak!
      }
      st.lastSwing = curSwing;

      const ATK_DUR = 0.48;
      if (st.atkActive) {
        st.atkT += dt;
        if (st.atkT >= ATK_DUR) {
          st.atkActive = false;
          st.atkT = 0;
        }
      }

      // Kurva 3-Fase Serangan Halberd:
      // 0.00..0.11s : Windup / Tarik Bahu & Angkat Halberd
      // 0.11..0.24s : Cleave / Thrust Eksplosif + Lunge Badan + Perisai Menahan
      // 0.24..0.48s : Follow-through & Elastic Recovery
      let windW = 0, strikeW = 0, lungeZ = 0, torsoTwist = 0;
      if (st.atkActive) {
        const at = st.atkT;
        if (at < 0.11) {
          windW = smooth(at / 0.11);
          lungeZ = -0.04 * windW;
          torsoTwist = -0.28 * windW;
        } else if (at < 0.24) {
          const u = smooth((at - 0.11) / 0.13);
          windW = 1 - u;
          strikeW = u;
          lungeZ = lerp(-0.04, 0.11, u);
          torsoTwist = lerp(-0.28, 0.36, u);
        } else {
          const u = clamp((at - 0.24) / (ATK_DUR - 0.24), 0, 1);
          const decay = Math.exp(-5 * u);
          strikeW = Math.max(0, Math.cos(u * Math.PI * 1.8) * decay);
          lungeZ = 0.11 * decay * Math.cos(u * Math.PI * 1.4);
          torsoTwist = 0.36 * decay * Math.cos(u * Math.PI * 1.4);
        }
      }

      /* 4. Fase Langkah Baris-Berbaris & Artikulasi Lutut 2-Sendi */
      const gait = st.gait;
      const stepFreq = 7.8 + st.speed * 1.3;
      const phase = (n._guardStep = ((n._guardStep || 0) + dt * stepFreq * (0.15 + gait * 0.85)) % TAU);

      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);
      const stepAmp = (0.52 + st.runBlend * 0.22) * gait;

      if (P.legs && P.legs.length >= 2) {
        // Kaki Kanan (legs[0]) & Kaki Kiri (legs[1])
        const hip0 = sinP * stepAmp - strikeW * 0.22 + windW * 0.12;
        const hip1 = -sinP * stepAmp + strikeW * 0.26 - windW * 0.12;
        P.legs[0].rotation.set(hip0, 0, 0);
        P.legs[1].rotation.set(hip1, 0, 0);

        // Lutut (shins) menekuk alami ke belakang saat kaki diangkat mengayun maju
        if (P.shins && P.shins.length >= 2) {
          const knee0 = Math.max(0, cosP) * 0.68 * gait + Math.max(0, -hip0) * 0.25 + strikeW * 0.28;
          const knee1 = Math.max(0, -cosP) * 0.68 * gait + Math.max(0, -hip1) * 0.25 + windW * 0.22;
          P.shins[0].rotation.x = knee0;
          P.shins[1].rotation.x = knee1;
        }
      }

      /* 5. Suspensi Badan, Napas, Putaran Bahu & Goyangan Tabard/Cape */
      const breathe = Math.sin(t * 2.2) * 0.008;
      const walkBob = Math.abs(sinP) * 0.036 * gait;
      const crouchCombat = st.combat * 0.015 + Math.abs(lungeZ) * 0.2;

      P.body.position.set(
        sinP * 0.015 * gait,
        P.bodyY + breathe + walkBob - crouchCombat,
        lungeZ
      );
      P.body.rotation.set(
        0.04 * gait + st.runBlend * 0.06 - windW * 0.10 + strikeW * 0.16 + Math.sin(t * 2.2) * 0.01,
        -sinP * 0.08 * gait + torsoTwist,
        cosP * 0.025 * gait - st.turn
      );

      // Rok Tabard depan & Cape belakang berkibar mengikuti gerak langkah & serangan
      if (P.tabardF) {
        P.tabardF.rotation.x = -0.06 - Math.abs(sinP) * 0.18 * gait - strikeW * 0.22 + Math.sin(t * 2.5) * 0.02;
      }
      if (P.cape) {
        const wind = 0.06 + gait * 0.24 + st.runBlend * 0.15 + strikeW * 0.25;
        P.cape.rotation.x = wind + Math.sin(phase * 2 - 0.6) * 0.08 * gait + Math.sin(t * 2.0) * 0.03;
        P.cape.rotation.z = cosP * 0.05 * gait + st.turn * 0.8;
      }

      /* 6. Kepala & Ekspresi Alis (Patroli Mengawasi vs Fokus Tempur) */
      if (P.head) {
        // Gelombang menoleh patroli yang memiliki jeda natural di kiri & kanan
        const rawLook = Math.sin(t * 1.1) + 0.25 * Math.sin(t * 3.3);
        const patrolYaw = clamp(rawLook * 0.28, -0.35, 0.35) * (1 - st.combat) * (1 - gait * 0.5);
        const patrolPitch = Math.sin(t * 1.8) * 0.035 * (1 - st.combat);

        P.head.rotation.set(
          patrolPitch + st.combat * 0.06 - strikeW * 0.08,
          patrolYaw - torsoTwist * 0.65,
          -st.turn * 0.4
        );

        // Alis menukik tajam saat siaga tempur atau menyerang
        if (P.brows) {
          const stern = st.combat * 0.16 + (windW + strikeW) * 0.18;
          for (const { brow, side } of P.brows) {
            brow.rotation.z = -side * stern;
            brow.position.y = 0.068 - stern * 0.02;
          }
        }
      }

      /* 7. Lengan Kiri 2-Sendi & Perisai (Ayunan Jalan -> Shield Guard -> Brace) */
      if (P.armL && P.foreL) {
        const armSwingL = -sinP * 0.42 * gait * (1 - st.combat * 0.65);
        const guardLiftX = -0.38 * st.combat - windW * 0.25 + strikeW * 0.18;
        const guardInY   =  0.32 * st.combat - windW * 0.20 + strikeW * 0.25;

        P.armL.rotation.set(
          armSwingL + guardLiftX + Math.sin(t * 2.2) * 0.02,
          guardInY,
          -0.06 - st.combat * 0.10 - windW * 0.12
        );
        // Siku kiri menekuk mengangkat perisai ke depan dada
        P.foreL.rotation.set(
          -0.18 - Math.max(0, -armSwingL) * 0.45 - st.combat * 0.42 - windW * 0.20,
          0.12 * st.combat,
          0
        );
      }

      /* 8. Lengan Kanan 2-Sendi & Halberd (Patroli -> Siaga -> Tebasan/Tusukan Juicy) */
      if (P.armR && P.foreR && P.grip) {
        const armSwingR = sinP * 0.36 * gait * (1 - st.combat * 0.6);
        const breatheR  = Math.cos(t * 2.2) * 0.025;

        // Pose dasar memegang halberd
        let rShoulderX = armSwingR - 0.12 * st.combat + breatheR;
        let rShoulderY = -0.06 * st.combat;
        let rShoulderZ = 0.06 + 0.06 * st.combat;
        let rElbowX    = -0.22 - Math.max(0, -armSwingR) * 0.35 - 0.18 * st.combat;
        let rGripX     = -0.22 - 0.10 * st.combat;

        if (st.comboAlt === 0) {
          // JURUS 1: Tebasan Kapak Halberd Melengkung dari Atas (Overhead Cleave)
          rShoulderX = lerp(rShoulderX, -1.65, windW);
          rShoulderZ = lerp(rShoulderZ,  0.28, windW);
          rElbowX    = lerp(rElbowX,    -0.55, windW);
          rGripX     = lerp(rGripX,     -0.45, windW);

          rShoulderX = lerp(rShoulderX,  0.48, strikeW);
          rShoulderY = lerp(rShoulderY,  0.22, strikeW);
          rShoulderZ = lerp(rShoulderZ, -0.12, strikeW);
          rElbowX    = lerp(rElbowX,    -0.08, strikeW);
          rGripX     = lerp(rGripX,      0.62, strikeW);
        } else {
          // JURUS 2: Hujaman Tombak Halberd Lurus ke Depan (Piercing Lunge Thrust)
          rShoulderX = lerp(rShoulderX,  0.42, windW);
          rShoulderY = lerp(rShoulderY, -0.25, windW);
          rElbowX    = lerp(rElbowX,    -0.88, windW);
          rGripX     = lerp(rGripX,     -0.10, windW);

          rShoulderX = lerp(rShoulderX, -0.82, strikeW);
          rShoulderY = lerp(rShoulderY,  0.16, strikeW);
          rElbowX    = lerp(rElbowX,    -0.04, strikeW);
          rGripX     = lerp(rGripX,      0.52, strikeW);
        }

        P.armR.rotation.set(rShoulderX, rShoulderY, rShoulderZ);
        P.foreR.rotation.set(rElbowX, 0, 0);
        P.grip.rotation.set(rGripX, 0, 0.04);

        // Rumbai merah (tassel) pada leher halberd berayun mengikuti inersia ayunan senjata
        if (P.tassel) {
          P.tassel.rotation.x = 0.25 + windW * 0.55 - strikeW * 0.75 + Math.sin(phase) * 0.18 * gait;
          P.tassel.rotation.z = Math.cos(t * 3.5) * 0.08 + st.turn * 0.6;
        }
      }
    }
  };
})();

window.NPC_Guard = NPC_Guard;
