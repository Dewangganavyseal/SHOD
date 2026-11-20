'use strict';
/* =============================================================================
   ENTITAS NPC: PEMBURU (🏹 Master Forest Ranger / Archer)
   -----------------------------------------------------------------------------
   Model 3D Detail Tinggi & Animasi Memanah Otentik:
   - Kaki 2-sendi (paha -> lutut/betis) dengan pembungkus betis kulit silang
   - Torso berlapis: tunik hijau rimba, rompi kulit (jerkin), kerah bulu serigala,
     jubah pengintai (ranger cloak) berkibar, dan tabung anak panah (quiver)
     di punggung berisi anak panah berbulu
   - Kepala detail: tudung ranger berbulu pegar emas (pheasant feather), alis
     artikulatif yang memicing fokus saat membidik
   - Cara memegang busur yang benar:
     * Saat jalan/patroli: busur dibawa miring ergonomis di sisi depan tubuh
     * Saat membidik & menembak: badan berputar menyamping ala pemanah, tangan
       kiri meluruskan busur vertikal di depan dada, sayap busur (limbs) melengkung
       dan tali busur (V-string) tertarik ke belakang bersama anak panah oleh
       tangan kanan hingga ke pipi, lalu melesat!
   ============================================================================= */

const NPC_Hunter = (() => {

  const BODY_Y = 0.78;
  const TAU = Math.PI * 2;

  const C = {
    robe:    0x4a6632, // Tunik hijau hutan
    robeD:   0x314620, // Bayangan tunik hijau
    robeL:   0x668846, // Sorot tunik daun
    hood:    0x293b1b, // Tudung & jubah ranger hijau gelap
    hoodD:   0x1a2610, // Lipatan dalam tudung
    skin:    0xd29a68, // Kulit wajah
    skinD:   0xb0764c, // Bayangan kulit
    hair:    0x382414, // Rambut & janggut coklat
    hairD:   0x22150a, // Alis tegas
    boot:    0x2c2015, // Sepatu bot senyap
    bootD:   0x18110a, // Sol sepatu
    leather: 0x5e3e22, // Rompi kulit, sabuk & quiver
    leatherD:0x3e2714, // Kulit gelap
    wood:    0x6e4726, // Kayu busur yew/ash & batang panah
    woodD:   0x472d16, // Riser busur gelap
    metal:   0xb0bcc9, // Baja mata panah
    metalH:  0xe4eef8, // Ujung tajam mata panah
    gold:    0xdca832, // Ornamen emas & bulu pegar
    fur:     0x6e563b, // Kerah bulu pundak
    furL:    0x8c7051, // Sorot bulu
    string:  0xeee8d8, // Tali busur & bulu panah putih
    fletchR: 0xc9382b, // Aksen bulu panah merah
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  /* Builder penggabung voxel per bagian rig (1 draw call per sendi) */
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

  /* Helper pembuat model 3D anak panah detail (dipakai di busur & proyektil terbang) */
  function buildArrowMesh() {
    const g = new THREE.Group();
    const builder = createVoxelBuilder();
    const box = builder.box;
    // Batang kayu panah lurus sepanjang +Z (-0.36 .. +0.36)
    box(g, 0.024, 0.024, 0.72, C.wood,    0, 0,  0.00);
    // Nok belakang (nock) kuningan
    box(g, 0.028, 0.028, 0.04, C.gold,    0, 0, -0.36);
    // Bulu unggas (fletching) 4 sirip putih & merah di ekor panah
    box(g, 0.085, 0.012, 0.14, C.string,  0, 0, -0.27);
    box(g, 0.012, 0.085, 0.14, C.string,  0, 0, -0.27);
    box(g, 0.090, 0.014, 0.04, C.fletchR, 0, 0, -0.32);
    box(g, 0.014, 0.090, 0.04, C.fletchR, 0, 0, -0.32);
    // Cincin pengikat mata panah & Mata Panah Baja Broadhead tajam di depan (+Z)
    box(g, 0.032, 0.032, 0.05, C.metal,   0, 0,  0.36);
    box(g, 0.075, 0.018, 0.11, C.metal,   0, 0,  0.42);
    box(g, 0.018, 0.065, 0.11, C.metal,   0, 0,  0.42);
    box(g, 0.048, 0.016, 0.08, C.metalH,  0, 0,  0.49);
    box(g, 0.024, 0.014, 0.05, 0xffffff,  0, 0,  0.54);
    builder.finish();
    return g;
  }

  return {
    buildArrowMesh,

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
         1. KAKI 2-SENDI (PAHA -> LUTUT/BETIS -> SEPATU BOT RANGER SENYAP)
         ===================================================================== */
      const legs = [];
      const shins = [];
      for (const side of [1, -1]) {
        const lg = joint(g, 0.12 * side, 0.52, 0);
        box(lg, 0.18, 0.21, 0.20, C.robeD,    0, -0.095, 0);
        box(lg, 0.19, 0.04, 0.21, C.leatherD, 0, -0.15,  0);

        const shin = joint(lg, 0, -0.21, 0);
        // Pelindung lutut kulit fleksibel
        box(shin, 0.14, 0.09, 0.05, C.leather,  0,  0.01, 0.095);
        // Betis & lilitan tali kulit silang (ranger wraps)
        box(shin, 0.165, 0.16, 0.185, C.hoodD,  0, -0.07, 0);
        box(shin, 0.175, 0.035, 0.195, C.leather, 0, -0.03, 0);
        box(shin, 0.172, 0.035, 0.192, C.leather, 0, -0.10, 0);
        // Sepatu bot kulit berburu senyap
        box(shin, 0.16,  0.12, 0.18,  C.boot,     0, -0.18, 0.005);
        box(shin, 0.175, 0.04, 0.195, C.leatherD, 0, -0.13, 0.005);
        box(shin, 0.175, 0.08, 0.23,  C.boot,     0, -0.24, 0.03);
        box(shin, 0.185, 0.035, 0.25, C.bootD,    0, -0.285, 0.035);

        lg.userData.shin = shin;
        legs.push(lg);
        shins.push(shin);
      }

      /* =====================================================================
         2. TORSO: TUNIK RIMBA, ROMPI KULIT, MANTEL & QUIVER PANAH
         ===================================================================== */
      const body = joint(g, 0, BODY_Y, 0);

      // Tunik hijau rimba & rompi kulit (jerkin)
      box(body, 0.48, 0.46, 0.31, C.robe,     0,  0.01, 0);
      box(body, 0.50, 0.10, 0.34, C.robeD,    0, -0.19, 0);
      box(body, 0.44, 0.32, 0.10, C.hood,     0,  0.04,  0.12);
      box(body, 0.38, 0.26, 0.04, C.leather,  0,  0.05,  0.165);
      box(body, 0.42, 0.30, 0.07, C.hoodD,    0,  0.04, -0.13);

      // Kerah bulu hangat berlapis di pundak & leher
      box(body, 0.52, 0.09, 0.36, C.fur,  0, 0.20, 0);
      box(body, 0.46, 0.06, 0.32, C.furL, 0, 0.24, -0.01);
      // Selempang dada kulit (chest baldric) penahan quiver
      box(body, 0.48, 0.055, 0.03, C.leatherD, 0, 0.06, 0.18, 0, 0, 0.58);
      box(body, 0.07, 0.07,  0.03, C.gold,    -0.04, 0.08, 0.19);

      // Sabuk pemburu, kantong umpan, pisau buru & terompet tanduk
      box(body, 0.51, 0.075, 0.35, C.leatherD, 0, -0.10, 0);
      box(body, 0.10, 0.09,  0.04, C.gold,     0, -0.10, 0.17);
      box(body, 0.11, 0.12,  0.08, C.leather,  0.20, -0.12, 0.12);
      box(body, 0.06, 0.15,  0.06, C.wood,    -0.20, -0.13, 0.12, 0, 0, 0.25);

      // Jubah Pendek Pengintai Hutan (Ranger Cloak) di punggung
      const cloak = joint(body, 0, 0.20, -0.16);
      box(cloak, 0.44, 0.30, 0.035, C.hood,  0, -0.15, -0.01, 0.08, 0, 0);
      box(cloak, 0.38, 0.24, 0.03,  C.hoodD, 0, -0.38, -0.03, 0.14, 0, 0);

      // Tabung Anak Panah (Quiver) di punggung kanan berisi 4 anak panah berbulu
      const quiver = joint(body, 0.08, 0.06, -0.20);
      quiver.rotation.z = 0.42;
      box(quiver, 0.13, 0.44, 0.12, C.leatherD, 0, 0, 0);
      box(quiver, 0.14, 0.06, 0.13, C.fur,      0,  0.20, 0);
      box(quiver, 0.14, 0.05, 0.13, C.gold,     0, -0.19, 0);
      for (const pa of [[-0.035, 0.29, 0], [0.035, 0.27, -0.02], [0, 0.32, 0.02], [-0.01, 0.26, -0.03]]) {
        box(quiver, 0.022, 0.22, 0.022, C.wood,    pa[0], pa[1], pa[2]);
        box(quiver, 0.050, 0.08, 0.014, C.string,  pa[0], pa[1] + 0.09, pa[2]);
        box(quiver, 0.052, 0.025, 0.016, C.fletchR, pa[0], pa[1] + 0.12, pa[2]);
      }

      /* =====================================================================
         3. KEPALA: TUDUNG RANGER, BULU PEGAR EMAS & ALIS FOKUS MEMBIDIK
         ===================================================================== */
      const head = joint(body, 0, 0.38, 0);
      box(head, 0.34, 0.31, 0.32, C.skin,  0,  0.01, 0);
      box(head, 0.30, 0.08, 0.30, C.skinD, 0, -0.12, 0.01);

      // Tudung kain pemanah (Ranger Hood) membungkus kepala atas & belakang
      box(head, 0.40, 0.18, 0.39, C.hood,  0, 0.14, -0.015);
      box(head, 0.42, 0.16, 0.16, C.hoodD, 0, 0.03, -0.13);
      box(head, 0.36, 0.08, 0.14, C.hood,  0, 0.18,  0.12, 0.18, 0, 0); // Puncak tudung depan
      for (const s of [-1, 1]) {
        box(head, 0.05, 0.22, 0.24, C.hoodD, s * 0.185, 0.02, -0.03);
      }

      // Bulu Burung Pegar Emas (Pheasant Feather) di sisi kiri tudung
      const feather = joint(head, -0.20, 0.14, 0.02);
      feather.rotation.set(-0.18, 0, 0.32);
      box(feather, 0.022, 0.26, 0.055, C.gold,  0, 0.10, 0);
      box(feather, 0.018, 0.16, 0.042, C.robeL, 0, 0.17, -0.01);
      box(feather, 0.024, 0.06, 0.045, C.fletchR, 0, 0.23, -0.015);

      // Mata zamrud tajam & Alis artikulatif (memicing saat membidik)
      const brows = [];
      for (const s of [1, -1]) {
        box(head, 0.072, 0.052, 0.02, 0xffffff, 0.08 * s, 0.02, 0.158);
        box(head, 0.040, 0.052, 0.02, 0x244a1e, 0.08 * s, 0.02, 0.166);
        box(head, 0.016, 0.016, 0.01, 0xffffff, 0.088 * s, 0.034, 0.174);
        const brow = joint(head, 0.08 * s, 0.066, 0.168);
        box(brow, 0.09, 0.026, 0.026, C.hairD, 0, 0, 0);
        brows.push({ brow, side: s });
      }
      box(head, 0.058, 0.09, 0.08, C.skinD, 0, -0.015, 0.185);
      box(head, 0.16, 0.05, 0.045, C.hairD, 0, -0.08, 0.172);
      box(head, 0.10, 0.07, 0.045, C.hair,  0, -0.13, 0.165);

      /* =====================================================================
         4. LENGAN KIRI 2-SENDI + BUSUR RECURVE ARTIKULASI (BOW + V-STRING + ARROW)
         ===================================================================== */
      const armL = joint(body, -0.31, 0.17, 0);
      box(armL, 0.17, 0.10, 0.18, C.hood, 0,  0.02, 0);
      box(armL, 0.14, 0.20, 0.14, C.robe, 0, -0.11, 0);

      const foreL = joint(armL, 0, -0.21, 0);
      // Pelindung lengan panahan kulit tebal (Archer's Bracer)
      box(foreL, 0.145, 0.14, 0.145, C.leatherD, 0, -0.08, 0);
      box(foreL, 0.15,  0.03, 0.15,  C.gold,     0, -0.03, 0);
      box(foreL, 0.15,  0.03, 0.15,  C.gold,     0, -0.13, 0);
      box(foreL, 0.13,  0.09, 0.13,  C.skin,     0, -0.19, 0.01);

      /* BUSUR RECURVE (bowPivot) di genggaman tangan kiri:
         Dirancang di bidang (Y-Z) bowPivot:
         - Sumbu panjang busur (sayap atas & bawah) membentang di sumbu Z bowPivot
           sehingga ketika lengan kiri diangkat ke depan (armL.rotation.x ~ -90°),
           sumbu Z lokal foreL menunjuk lurus KE ATAS (+Y dunia) -> Busur berdiri
           TEGAK VERTIKAL sempurna di depan pemanah! */
      const bowPivot = joint(foreL, 0, -0.20, 0.03);
      // Riser tengah pegangan busur
      box(bowPivot, 0.048, 0.065, 0.24, C.woodD,    0,  0.0,  0);
      box(bowPivot, 0.054, 0.072, 0.10, C.leather,  0,  0.0,  0);
      box(bowPivot, 0.056, 0.045, 0.03, C.gold,     0, -0.01, 0.11);
      box(bowPivot, 0.056, 0.045, 0.03, C.gold,     0, -0.01, -0.11);

      // Sayap Busur Atas (Upper Limb: membentang ke +Z bowPivot, melengkung ke +Y = belakang)
      const limbTop = joint(bowPivot, 0, 0, 0.11);
      box(limbTop, 0.040, 0.048, 0.26, C.wood, 0, 0.03, 0.12, -0.22, 0, 0);
      box(limbTop, 0.034, 0.040, 0.15, C.gold, 0, 0.04, 0.29,  0.32, 0, 0);

      // Sayap Busur Bawah (Lower Limb: membentang ke -Z bowPivot, melengkung ke +Y = belakang)
      const limbBot = joint(bowPivot, 0, 0, -0.11);
      box(limbBot, 0.040, 0.048, 0.26, C.wood, 0, 0.03, -0.12,  0.22, 0, 0);
      box(limbBot, 0.034, 0.040, 0.15, C.gold, 0, 0.04, -0.29, -0.32, 0, 0);

      /* Tali Busur 2-Segmen (stringTop & stringBot) yang bisa ditarik membentuk huruf V */
      const strMat = new THREE.MeshLambertMaterial({ color: C.string });
      const strGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
      const stringTop = new THREE.Mesh(strGeo, strMat);
      const stringBot = new THREE.Mesh(strGeo, strMat);
      bowPivot.add(stringTop);
      bowPivot.add(stringBot);

      /* Anak panah yang sedang dipasang pada busur (nockedArrow):
         Menunjuk ke arah -Y bowPivot (= lurus ke depan +Z dunia saat lengan diangkat!) */
      const nockedArrow = buildArrowMesh();
      nockedArrow.rotation.x = Math.PI / 2; // +Z arrow -> -Y bowPivot (arah tembak depan!)
      bowPivot.add(nockedArrow);

      /* =====================================================================
         5. LENGAN KANAN 2-SENDI (PENARIK TALI BUSUR & PENGAMBIL PANAH QUIVER)
         ===================================================================== */
      const armR = joint(body, 0.31, 0.17, 0);
      box(armR, 0.17, 0.10, 0.18, C.hood, 0,  0.02, 0);
      box(armR, 0.14, 0.20, 0.14, C.robe, 0, -0.11, 0);

      const foreR = joint(armR, 0, -0.21, 0);
      box(foreR, 0.145, 0.14, 0.145, C.leatherD, 0, -0.08, 0);
      box(foreR, 0.15,  0.03, 0.15,  C.gold,     0, -0.03, 0);
      // Sarung tangan panahan 3-jari (shooting glove)
      box(foreR, 0.13,  0.09, 0.13,  C.leather,  0, -0.19, 0.01);

      // Gabungkan seluruh geometri voxel per sendi
      builder.finish();

      const parts = {
        body,
        head,
        feather,
        brows,
        cloak,
        quiver,
        armL,
        foreL,
        bowPivot,
        limbTop,
        limbBot,
        stringTop,
        stringBot,
        nockedArrow,
        armR,
        foreR,
        legs,
        shins,
        bodyY: BODY_Y
      };

      this.animate({ mesh: g, parts, vel: { x: 0, z: 0 } }, 0);
      return { mesh: g, root: g, parts };
    },

    /* ---------- HELPER TALI BUSUR V-SHAPED DINAMIS ---------- */
    _updateBowString(P, pullDist, twang) {
      // Ujung sayap atas & bawah di ruang bowPivot
      const flex = pullDist * 0.38;
      P.limbTop.rotation.x = -flex;
      P.limbBot.rotation.x =  flex;

      const tipZ = 0.44 - pullDist * 0.06;
      const tipY = 0.07 + pullDist * 0.08;
      const nockY = tipY + pullDist + twang; // Titik tengah tali yang ditarik ke belakang (+Y bowPivot)

      // Segmen tali atas: dari (0, tipY, tipZ) ke (0, nockY, 0)
      const dyT = nockY - tipY;
      const dzT = -tipZ;
      const lenT = Math.hypot(dyT, dzT);
      P.stringTop.position.set(0, (tipY + nockY) * 0.5, tipZ * 0.5);
      P.stringTop.scale.set(1, 1, lenT);
      P.stringTop.rotation.set(Math.atan2(dyT, -dzT), 0, 0);

      // Segmen tali bawah: dari (0, tipY, -tipZ) ke (0, nockY, 0)
      const dyB = nockY - tipY;
      const dzB = tipZ;
      const lenB = Math.hypot(dyB, dzB);
      P.stringBot.position.set(0, (tipY + nockY) * 0.5, -tipZ * 0.5);
      P.stringBot.scale.set(1, 1, lenB);
      P.stringBot.rotation.set(-Math.atan2(dyB, dzB), 0, 0);

      // Posisi anak panah mengikuti titik nock tali busur
      if (P.nockedArrow) {
        P.nockedArrow.position.set(0.025, nockY - 0.36, 0);
      }
    },

    /* ---------- ANIMASI LENGKAP (SMOOTH & JUICY ARCHERY) ---------- */
    animate(n, dt) {
      const P = n.parts;
      if (!P || !P.body) return;

      dt = Math.min(dt || 0, 0.1);
      const t = (n._huntT = (n._huntT || 0) + dt);

      /* 1. Hit-flash merah saat terkena serangan */
      const em = (n.flash && n.flash > 0) ? 0xaa2222 : 0x000000;
      if (n._lastEm !== em) {
        n._lastEm = em;
        n.mesh.traverse(o => {
          if (o.material && o.material.emissive) o.material.emissive.setHex(em);
        });
      }

      /* 2. Damping Kecepatan, Belokan & Sikap Memanah */
      const rawSp = Math.hypot(n.vel ? n.vel.x : 0, n.vel ? n.vel.z : 0);
      const yaw = n.mesh ? n.mesh.rotation.y : 0;
      const st = n._huntState || (n._huntState = {
        speed: 0,
        gait: 0,
        runBlend: 0,
        combat: 0,
        turn: 0,
        yaw: yaw,
        shotActive: false,
        shotT: 0,
        lastSwing: 0
      });

      const easeMove = 1 - Math.exp(-12 * dt);
      const easePose = 1 - Math.exp(-9 * dt);
      st.speed += (rawSp - st.speed) * easeMove;
      st.gait += (clamp(st.speed / 1.9, 0, 1) - st.gait) * easeMove;
      st.runBlend += (clamp((st.speed - 2.4) / 1.5, 0, 1) - st.runBlend) * easeMove;

      /* Trigger Siklus Memanah (Draw -> Release -> Quiver Reload) */
      const curSwing = n.swing || 0;
      if (curSwing > st.lastSwing + 0.02) {
        st.shotActive = true;
        st.shotT = 0;
      }
      st.lastSwing = curSwing;

      const SHOT_DUR = 0.72;
      if (st.shotActive) {
        st.shotT += dt;
        if (st.shotT >= SHOT_DUR) {
          st.shotActive = false;
          st.shotT = 0;
        }
      }

      const hasTarget = (n.target && !n.target.dead) || st.shotActive ? 1 : 0;
      st.combat += (hasTarget - st.combat) * easePose;

      const yawDiff = Math.atan2(Math.sin(yaw - st.yaw), Math.cos(yaw - st.yaw));
      const instTurn = dt > 0.0005 ? clamp(yawDiff / dt, -5, 5) * 0.035 : 0;
      st.turn += (instTurn - st.turn) * (1 - Math.exp(-10 * dt));
      st.yaw = yaw;

      /* 3. Evaluasi Fase Memanah:
            - Saat combat siaga: busur diangkat setengah tarikan (ready draw)
            - Saat shotActive (0.00..0.72s):
              * 0.00..0.34s : Full Draw (tarik tali busur penuh ke pipi + tahan bidik)
              * 0.34..0.50s : Release & Recoil (tali melesat + anak panah lepas + tangan kanan mental)
              * 0.50..0.72s : Quiver Reach (tangan kanan mengambil anak panah baru dari quiver punggung) */
      let drawAmt = st.combat * 0.16; // Tarikan siaga ringan
      let releaseW = 0;
      let quiverW = 0;
      let stringTwang = 0;
      let arrowVisible = st.combat > 0.25;

      if (st.shotActive) {
        const stT = st.shotT;
        if (stT < 0.34) {
          // Fase 1: Tarik tali busur penuh hingga pipi
          const u = smooth(stT / 0.30);
          drawAmt = lerp(0.12, 0.36, u);
          arrowVisible = true;
        } else if (stT < 0.50) {
          // Fase 2: Lepas anak panah! Tali bergetar cepat & panah di busur hilang (karena sudah meluncur!)
          const u = (stT - 0.34) / 0.16;
          drawAmt = 0;
          releaseW = Math.sin(u * Math.PI);
          stringTwang = Math.sin(u * Math.PI * 6) * Math.exp(-u * 4) * 0.045;
          arrowVisible = false;
        } else {
          // Fase 3: Tangan kanan meraih tabung quiver di punggung untuk mengambil anak panah baru
          const u = (stT - 0.50) / (SHOT_DUR - 0.50);
          quiverW = Math.sin(u * Math.PI);
          arrowVisible = u > 0.55;
          drawAmt = u > 0.55 ? smooth((u - 0.55) / 0.45) * 0.14 : 0;
        }
      }

      if (P.nockedArrow) P.nockedArrow.visible = arrowVisible;
      this._updateBowString(P, drawAmt, stringTwang);

      /* 4. Langkah Kaki 2-Sendi & Sikap Kuda-Kuda Pemanah */
      const gait = st.gait;
      const stepFreq = 8.2 + st.speed * 1.4;
      const phase = (n._huntStep = ((n._huntStep || 0) + dt * stepFreq * (0.15 + gait * 0.85)) % TAU);
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);
      const stepAmp = (0.50 + st.runBlend * 0.22) * gait;

      if (P.legs && P.legs.length >= 2) {
        const stanceSpread = st.combat * 0.10;
        const hip0 = sinP * stepAmp + stanceSpread;
        const hip1 = -sinP * stepAmp - stanceSpread;
        P.legs[0].rotation.set(hip0, 0, -st.combat * 0.05);
        P.legs[1].rotation.set(hip1, 0,  st.combat * 0.05);

        if (P.shins && P.shins.length >= 2) {
          P.shins[0].rotation.x = Math.max(0, cosP) * 0.65 * gait + st.combat * 0.12;
          P.shins[1].rotation.x = Math.max(0, -cosP) * 0.65 * gait + st.combat * 0.12;
        }
      }

      /* 5. Putaran Badan Menyamping Khas Pemanah (Archer's Side Stance) */
      const breathe = Math.sin(t * 2.3) * 0.008;
      const walkBob = Math.abs(sinP) * 0.034 * gait;
      const archerTwistY = -0.46 * st.combat - (drawAmt / 0.36) * 0.14 + releaseW * 0.10;

      P.body.position.set(
        sinP * 0.014 * gait,
        P.bodyY + breathe + walkBob - st.combat * 0.02,
        -releaseW * 0.04
      );
      P.body.rotation.set(
        0.04 * gait + st.runBlend * 0.06 - releaseW * 0.06,
        -sinP * 0.07 * gait * (1 - st.combat * 0.7) + archerTwistY,
        cosP * 0.02 * gait - st.turn
      );

      if (P.cloak) {
        const wind = 0.06 + gait * 0.26 + st.runBlend * 0.16 + releaseW * 0.18;
        P.cloak.rotation.x = wind + Math.sin(phase * 2 - 0.5) * 0.08 * gait;
        P.cloak.rotation.z = cosP * 0.05 * gait + st.turn * 0.7;
      }

      /* 6. Kepala Counter-Rotate Membidik Lurus ke Sasaran + Alis Memicing */
      if (P.head) {
        const rawLook = Math.sin(t * 1.15) + 0.25 * Math.sin(t * 3.4);
        const patrolYaw = clamp(rawLook * 0.30, -0.36, 0.36) * (1 - st.combat) * (1 - gait * 0.4);
        P.head.rotation.set(
          Math.sin(t * 1.7) * 0.03 * (1 - st.combat) + st.combat * 0.05,
          patrolYaw - archerTwistY, // Kompensasi putaran dada agar wajah tetap lurus ke target!
          -st.combat * 0.06 - st.turn * 0.35
        );

        if (P.feather) {
          P.feather.rotation.z = 0.32 + Math.sin(t * 3.2 + phase) * (0.06 + gait * 0.08) + releaseW * 0.22;
        }
        if (P.brows && P.brows.length >= 2) {
          const aimSquint = st.combat * 0.15 + (drawAmt / 0.36) * 0.15;
          P.brows[0].brow.rotation.z = -aimSquint * 1.2; // Mata kanan memicing membidik
          P.brows[1].brow.rotation.z =  aimSquint * 0.7;
        }
      }

      /* 7. Lengan Kiri & Orientasi Busur (Carry Ergonomis -> Vertical/Canted Bow Aim) */
      if (P.armL && P.foreL && P.bowPivot) {
        const walkSwingL = -sinP * 0.38 * gait;
        // Saat santai/jalan: lengan turun, busur dimiringkan ergonomis agar tidak menembus paha
        const carryArmX = walkSwingL + 0.08;
        const carryArmY = 0.12;
        const carryArmZ = -0.10;
        const carryForeX = -0.35 - Math.max(0, -walkSwingL) * 0.3;

        // Saat membidik/menembak: lengan kiri lurus ke arah target (+Z dunia), sedikit miring (archer cant)
        const aimArmX = -1.48 - releaseW * 0.12;
        const aimArmY = -archerTwistY - 0.04;
        const aimArmZ = -0.16;
        const aimForeX = -0.06;

        P.armL.rotation.set(
          lerp(carryArmX, aimArmX, st.combat),
          lerp(carryArmY, aimArmY, st.combat),
          lerp(carryArmZ, aimArmZ, st.combat)
        );
        P.foreL.rotation.set(lerp(carryForeX, aimForeX, st.combat), 0, 0);

        // Rotasi bowPivot di dalam tangan kiri:
        // Saat carry: diputar menyilang sedikit agar sayap busur sejajar samping badan
        // Saat aim: tegak lurus (sedikit canted 0.18 rad) menghadap sasaran!
        P.bowPivot.rotation.set(
          lerp(-0.95, 0.04, st.combat),
          lerp(0.35,  0.0,  st.combat),
          lerp(0.45,  0.18, st.combat)
        );
      }

      /* 8. Lengan Kanan (Ayunan Jalan -> Tarik Tali Busur ke Pipi -> Release -> Ambil Panah Quiver) */
      if (P.armR && P.foreR) {
        const walkSwingR = sinP * 0.38 * gait;
        const pullRatio = clamp(drawAmt / 0.36, 0, 1);

        // Pose 1: Jalan / Diam biasa
        let rx = walkSwingR, ry = 0, rz = 0.08;
        let fx = -0.25 - Math.max(0, -walkSwingR) * 0.35, fy = 0;

        // Pose 2: Menarik tali busur di depan dada/pipi (Siku kanan diangkat tinggi ke belakang)
        const drawArmX = -1.42 - pullRatio * 0.12;
        const drawArmY = -0.32 - pullRatio * 0.38;
        const drawArmZ =  0.42 + pullRatio * 0.25;
        const drawForeX = -0.95 - pullRatio * 0.48;
        const drawForeY =  0.35;

        rx = lerp(rx, drawArmX, st.combat);
        ry = lerp(ry, drawArmY, st.combat);
        rz = lerp(rz, drawArmZ, st.combat);
        fx = lerp(fx, drawForeX, st.combat);
        fy = lerp(fy, drawForeY, st.combat);

        // Pose 3: Recoil / Follow-through sesaat setelah melepaskan tali busur
        if (releaseW > 0.01) {
          rx = lerp(rx, -1.55, releaseW);
          ry = lerp(ry, -0.82, releaseW);
          rz = lerp(rz,  0.68, releaseW);
          fx = lerp(fx, -0.65, releaseW);
        }

        // Pose 4: Meraih Quiver di punggung untuk mencabut anak panah berikutnya
        if (quiverW > 0.01) {
          rx = lerp(rx, -2.35, quiverW);
          ry = lerp(ry,  0.35, quiverW);
          rz = lerp(rz,  0.28, quiverW);
          fx = lerp(fx, -1.25, quiverW);
        }

        P.armR.rotation.set(rx, ry, rz);
        P.foreR.rotation.set(fx, fy, 0);
      }
    }
  };
})();

window.NPC_Hunter = NPC_Hunter;
