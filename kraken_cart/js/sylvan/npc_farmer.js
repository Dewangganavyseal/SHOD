'use strict';
/* =============================================================================
   ENTITAS NPC: PETANI DESA (🌾) — OVERHAUL V2
   -----------------------------------------------------------------------------
   Model 3D Voxel Detail Tinggi:
   - Kaki 2-sendi (paha & betis/lutut) dengan celana kerja digulung, tambalan
     kain hijau di lutut, pembalut betis anyaman, dan sepatu bot kebun berlumpur.
   - Torso kemeja linen hijau daun + celemek kain rami/kulit bertali silang,
     kantong bibit depan berisi bulir gandum & wortel segar, sabuk tali rami
     dengan labu air minum (gourd), serta keranjang panen rotan di punggung
     yang penuh gandum emas, wortel, dan apel merah.
   - Kepala ramah berpipi hangat, alis ekspresif, tangkai gandum emas di sudut
     mulut yang bergerak naik-turun (chewing), dan Topi Jerami Anyaman Lebar
     (wide-brim caping/straw hat) berlapis pita cokelat & hiasan bulir gandum.
   - Lengan 2-sendi: tangan kiri mendekap seikat besar gandum emas (wheat sheaf);
     tangan kanan memegang Sabit Pemanen & Cangkul Baja (dual harvest scythe-hoe).
   - Animasi Smooth & Juicy:
     - Idle: napas santai, mengunyah tangkai gandum, lirikan ramah, gandum bergoyang.
     - Jalan/Lari: langkah ceria 2-sendi lutut, pantulan keranjang panen & topi.
     - Memanen / Bertarung: tebasan sabit melengkung horizontal-diagonal lebar
       dengan putaran pinggang yang bertenaga & luwes.
     - Menanam / Mencangkul: gerakan membungkuk mengolah tanah & menabur benih.
   ============================================================================= */

const NPC_Farmer = (() => {
  const PALETTE = {
    robe:        0x5e8a36,
    robeD:       0x3f6122,
    robeL:       0x7ead4e,
    collar:      0xe8dfc8,
    apron:       0x6b4c2e,
    apronD:      0x47311c,
    apronL:      0x87633f,
    pants:       0x4a3b2a,
    pantsD:      0x33281b,
    skin:        0xd89e6a,
    skinD:       0xb57c4c,
    blush:       0xd97b66,
    hair:        0x422c18,
    hairD:       0x291a0d,
    straw:       0xe2ba42,
    strawD:      0xb58d28,
    strawL:      0xf7d86c,
    boot:        0x2e2318,
    bootD:       0x1a130c,
    wood:        0x664426,
    woodD:       0x422a15,
    metal:       0xb4c2cf,
    metalD:      0x6e7b87,
    metalH:      0xe4eef7,
    wheat:       0xebbf3b,
    wheatL:      0xffe270,
    stem:        0x82a336,
    carrot:      0xed7124,
    leaf:        0x489632,
    apple:       0xc9342b,
    gourd:       0xc78d38
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
         1. KAKI 2-SENDI (PAHA -> LUTUT BERTAMBAL -> SEPATU BOT KEBUN)
         ===================================================================== */
      const legs = [];
      const shins = [];
      for (const s of [-1, 1]) {
        const lg = joint(g, 0.12 * s, 0.52, 0);
        // Paha celana kerja cokelat tanah
        box(lg, 0.18, 0.21, 0.195, C.pants,  0, -0.09, 0);
        box(lg, 0.185, 0.06, 0.20, C.pantsD, 0, -0.01, 0);

        // Sendi Lutut & Betis (Shin)
        const shin = joint(lg, 0, -0.20, 0);
        // Tambalan kain hijau di lutut (knee patch)
        box(shin, 0.145, 0.095, 0.045, C.robeD,  0,  0.01, 0.088);
        box(shin, 0.12,  0.07,  0.05,  C.robe,   0,  0.01, 0.091);
        // Celana kerja bawah digulung sebatas betis
        box(shin, 0.165, 0.14,  0.18,  C.pantsD, 0, -0.07, 0);
        box(shin, 0.18,  0.04,  0.195, C.strawD, 0, -0.13, 0); // Lipatan gulungan celana
        // Sepatu bot kebun kulit
        box(shin, 0.17,  0.12,  0.185, C.boot,   0, -0.19, 0.005);
        box(shin, 0.178, 0.08,  0.23,  C.boot,   0, -0.25, 0.025);
        box(shin, 0.188, 0.04,  0.245, C.bootD,  0, -0.295, 0.028);

        lg.userData.shin = shin;
        legs.push(lg);
        shins.push(shin);
      }

      /* =====================================================================
         2. TORSO (KEMEJA HIJAU + CELEMEK TANI + KANTONG BIBIT + KERANJANG PANEN)
         ===================================================================== */
      const body = joint(g, 0, BODY_Y, 0);

      // Kemeja kerja hijau daun & kerah linen krem terbuka
      box(body, 0.47, 0.45, 0.30, C.robe,   0,  0.01, 0);
      box(body, 0.43, 0.16, 0.27, C.robeD,  0, -0.16, 0);
      box(body, 0.24, 0.06, 0.31, C.collar, 0,  0.21, 0.01);
      box(body, 0.08, 0.10, 0.03, C.collar, 0,  0.16, 0.155);

      // Celemek Kerja Kain Rami & Kulit (Depan)
      box(body, 0.42, 0.36, 0.035, C.apron,  0, -0.04, 0.148);
      box(body, 0.44, 0.16, 0.32,  C.apron,  0, -0.15, 0.0); // Rok pendek celemek
      // Kantong besar benih & hasil kebun di depan celemek
      box(body, 0.30, 0.15, 0.05,  C.apronD, 0, -0.10, 0.168);
      box(body, 0.28, 0.025, 0.055, C.strawD, 0, -0.03, 0.172); // Bibir kantong
      // Wortel & bulir gandum menyembul dari kantong depan
      box(body, 0.045, 0.10, 0.04, C.carrot, -0.06, -0.01, 0.175, 0, 0,  0.22);
      box(body, 0.035, 0.06, 0.03, C.leaf,   -0.08,  0.05, 0.175, 0, 0,  0.30);
      box(body, 0.05,  0.09, 0.03, C.wheat,   0.06, -0.01, 0.175, 0, 0, -0.18);
      box(body, 0.04,  0.07, 0.03, C.wheatL,  0.09,  0.01, 0.175, 0, 0, -0.32);

      // Tali suspender celemek menyilang di punggung
      for (const s of [-1, 1]) {
        box(body, 0.065, 0.36, 0.03, C.apronD, 0.13 * s, 0.06,  0.155);
        box(body, 0.065, 0.09, 0.32, C.apronD, 0.13 * s, 0.205, 0);
        box(body, 0.065, 0.36, 0.03, C.apronD, 0.11 * s, 0.05, -0.152, 0, 0, -0.22 * s);
      }

      // Sabuk Tali Rami Berpilin & Labu Air (Gourd) di Pinggang
      box(body, 0.50, 0.065, 0.34, C.strawD, 0, -0.11, 0);
      box(body, 0.09, 0.08,  0.06, C.straw, -0.14, -0.11, 0.165); // Simpul tali rami
      box(body, 0.045, 0.12, 0.04, C.straw, -0.16, -0.18, 0.165, 0, 0, 0.18); // Ujung tali menjuntai
      // Labu air minum di pinggang kanan
      box(body, 0.09, 0.10, 0.09, C.gourd,   0.24, -0.17, 0.06, 0, 0, -0.15);
      box(body, 0.06, 0.06, 0.06, C.gourd,   0.23, -0.10, 0.06, 0, 0, -0.15);
      box(body, 0.03, 0.03, 0.03, C.kerchief || 0x9e2f24, 0.22, -0.06, 0.06);

      // Keranjang Panen Rotan di Punggung (Basket)
      const basket = joint(body, 0, 0.04, -0.16);
      box(basket, 0.32, 0.32, 0.18, C.wood,   0,  0.0,  -0.09);
      box(basket, 0.35, 0.045, 0.21, C.strawD, 0,  0.14, -0.09); // Lingkar rotan atas
      box(basket, 0.34, 0.035, 0.20, C.strawD, 0,  0.0,  -0.09); // Lingkar tengah
      box(basket, 0.34, 0.04, 0.20, C.woodD,   0, -0.14, -0.09); // Dasar keranjang
      // Isi keranjang: ikatan gandum emas, wortel & apel merah segar
      box(basket, 0.26, 0.10, 0.14, C.stem,    0,     0.17, -0.09);
      box(basket, 0.14, 0.16, 0.10, C.wheat,  -0.06,  0.24, -0.09, -0.18, 0,  0.15);
      box(basket, 0.11, 0.14, 0.09, C.wheatL, -0.08,  0.29, -0.10, -0.25, 0,  0.22);
      box(basket, 0.08, 0.08, 0.08, C.apple,   0.07,  0.21, -0.07);
      box(basket, 0.06, 0.12, 0.06, C.carrot,  0.08,  0.22, -0.12, -0.20, 0, -0.22);
      box(basket, 0.05, 0.08, 0.05, C.leaf,    0.10,  0.28, -0.13, -0.25, 0, -0.30);

      /* =====================================================================
         3. KEPALA, TANGKAI GANDUM DI MULUT & TOPI JERAMI ANYAMAN LEBAR
         ===================================================================== */
      const head = joint(body, 0, 0.38, 0);

      // Leher & Kepala ramah
      box(head, 0.23, 0.10, 0.23, C.skinD, 0, -0.16, 0);
      box(head, 0.34, 0.31, 0.32, C.skin,  0,  0.0,  0);
      // Telinga & rona pipi hangat
      box(head, 0.04, 0.09, 0.07, C.skinD, -0.18, -0.01, -0.01);
      box(head, 0.04, 0.09, 0.07, C.skinD,  0.18, -0.01, -0.01);
      box(head, 0.055, 0.03, 0.015, C.blush, -0.11, -0.03, 0.158);
      box(head, 0.055, 0.03, 0.015, C.blush,  0.11, -0.03, 0.158);

      // Mata cerah bersahabat & hidung
      for (const s of [-1, 1]) {
        box(head, 0.075, 0.052, 0.02, 0xffffff, 0.08 * s, 0.02, 0.156);
        box(head, 0.042, 0.052, 0.02, 0x243618, 0.08 * s, 0.02, 0.164);
        box(head, 0.018, 0.018, 0.02, 0xffffff, 0.09 * s, 0.034, 0.17);
      }
      box(head, 0.06, 0.085, 0.07, C.skinD, 0, -0.01, 0.175);
      // Senyum ramah petani
      box(head, 0.11, 0.026, 0.02, 0x8a4432, 0, -0.08, 0.162);
      // Rambut cokelat di bawah topi
      box(head, 0.35, 0.14, 0.12, C.hair, 0, 0.01, -0.12);
      box(head, 0.05, 0.10, 0.08, C.hair, -0.165, 0.02, 0.06);
      box(head, 0.05, 0.10, 0.08, C.hair,  0.165, 0.02, 0.06);

      // Alis ekspresif (brows)
      const brows = [];
      for (const s of [-1, 1]) {
        const br = joint(head, 0.08 * s, 0.07, 0.165);
        box(br, 0.09, 0.028, 0.025, C.hairD, 0, 0, 0);
        brows.push(br);
      }

      // Tangkai Gandum Emas di Sudut Mulut (wheatStalk — bergerak naik-turun)
      const wheatStalk = joint(head, 0.055, -0.078, 0.168);
      wheatStalk.rotation.set(0.35, 0.18, -0.38);
      box(wheatStalk, 0.018, 0.018, 0.16, C.stem,   0, 0, 0.08);
      box(wheatStalk, 0.042, 0.042, 0.09, C.wheat,  0, 0, 0.18);
      box(wheatStalk, 0.032, 0.032, 0.05, C.wheatL, 0, 0, 0.24);

      // Topi Jerami Anyaman Lebar Bertingkat (Wide-Brim Straw Hat / Caping)
      const hat = joint(head, 0, 0.12, 0);
      hat.rotation.set(-0.06, 0, 0.03);
      // Pinggiran topi lebar berlapis anyaman
      box(hat, 0.62, 0.028, 0.62, C.strawL, 0,  0.0,  0);
      box(hat, 0.56, 0.035, 0.56, C.straw,  0,  0.02, 0);
      box(hat, 0.46, 0.035, 0.46, C.strawD, 0,  0.045, 0);
      // Pita kain cokelat melingkari mahkota topi + menyelipkan bulir gandum
      box(hat, 0.37, 0.045, 0.37, C.apronD, 0,  0.075, 0);
      box(hat, 0.04, 0.12,  0.04, C.wheatL, 0.19, 0.12, 0.04, 0.2, 0, -0.35);
      // Mahkota topi jerami bertingkat
      box(hat, 0.35, 0.11,  0.35, C.straw,  0,  0.13, 0);
      box(hat, 0.29, 0.06,  0.29, C.strawL, 0,  0.20, 0);
      box(hat, 0.18, 0.035, 0.18, C.strawD, 0,  0.24, 0);

      /* =====================================================================
         4. LENGAN KIRI 2-SENDI + SEIKAT GANDUM EMAS (WHEAT SHEAF)
         ===================================================================== */
      const armL = joint(body, -0.295, 0.17, 0);
      box(armL, 0.16, 0.15, 0.16, C.robe,  0, -0.06, 0);
      box(armL, 0.175, 0.05, 0.175, C.robeL, 0, -0.145, 0); // Lipatan lengan baju gulung

      const foreL = joint(armL, 0, -0.17, 0);
      box(foreL, 0.135, 0.16, 0.135, C.skin,  0, -0.07, 0);
      box(foreL, 0.13,  0.09, 0.13,  C.skinD, 0, -0.18, 0.01);

      // Seikat Besar Bulir Gandum Emas di Tangan Kiri (sheafPivot)
      const sheafPivot = joint(foreL, -0.04, -0.17, 0.10);
      sheafPivot.rotation.set(0.28, 0.12, 0.18);
      // Pangkal batang bawah & ikatan tali rami
      box(sheafPivot, 0.14, 0.24, 0.14, C.stem,   0, -0.04, 0);
      box(sheafPivot, 0.16, 0.045, 0.16, C.apronD, 0, -0.02, 0);
      // Rumpun bulir gandum emas mekar di bagian atas
      box(sheafPivot, 0.19, 0.16, 0.19, C.wheat,  0,  0.14, 0);
      box(sheafPivot, 0.15, 0.12, 0.15, C.wheatL, 0,  0.25, 0);
      box(sheafPivot, 0.08, 0.14, 0.08, C.wheatL, -0.07, 0.22,  0.05,  0.2, 0,  0.28);
      box(sheafPivot, 0.08, 0.14, 0.08, C.wheat,   0.07, 0.22, -0.04, -0.2, 0, -0.28);

      /* =====================================================================
         5. LENGAN KANAN 2-SENDI + SABIT PEMANEN & CANGKUL BAJA (GRIP)
         ===================================================================== */
      const armR = joint(body, 0.295, 0.17, 0);
      box(armR, 0.16, 0.15, 0.16, C.robe,  0, -0.06, 0);
      box(armR, 0.175, 0.05, 0.175, C.robeL, 0, -0.145, 0);

      const foreR = joint(armR, 0, -0.17, 0);
      box(foreR, 0.135, 0.16, 0.135, C.skin,   0, -0.07, 0);
      box(foreR, 0.135, 0.09, 0.135, C.apronD, 0, -0.18, 0.01); // Sarung tangan kebun kanan

      // Grip Alat Tani di tangan kanan (mengarah ke depan +Z)
      const grip = joint(foreR, 0, -0.18, 0.04);
      grip.rotation.set(-0.20, 0, 0);

      // Gagang kayu ash panjang + pegangan samping sabit (snath nib)
      box(grip, 0.045, 0.048, 1.04, C.wood,   0, 0,  0.34);
      box(grip, 0.055, 0.055, 0.22, C.apronD, 0, 0,  0.02); // Balutan kulit pegangan
      box(grip, 0.058, 0.058, 0.05, C.strawD, 0, 0, -0.20); // Pommel belakang
      box(grip, 0.09,  0.038, 0.038, C.woodD, -0.05, 0.02, 0.32); // Pegangan bantu samping
      box(grip, 0.065, 0.068, 0.09, C.metalD, 0, 0,  0.80); // Cincin besi pengunci

      // Kepala Cangkul / Penggaruk Tanah di sisi bawah-depan
      box(grip, 0.09,  0.14,  0.04, C.metal,  0, -0.09, 0.82,  0.22, 0, 0);
      box(grip, 0.11,  0.08,  0.025, C.metalH, 0, -0.16, 0.84, 0.28, 0, 0);

      // Bilah Sabit Pemanen Baja Melengkung (Crescent Harvest Scythe Blade)
      box(grip, 0.18,  0.032, 0.11, C.metal,  -0.08, 0.02, 0.86, 0,  0.18, 0);
      box(grip, 0.18,  0.026, 0.09, C.metal,  -0.22, 0.02, 0.91, 0,  0.42, 0);
      box(grip, 0.14,  0.022, 0.07, C.metalH, -0.33, 0.02, 0.98, 0,  0.68, 0);
      // Mata tajam sabit mengilap di sisi dalam lengkungan
      box(grip, 0.28,  0.016, 0.035, C.metalH, -0.16, 0.02, 0.84, 0, 0.32, 0);

      // Selesaikan penggabungan geometri voxel
      vb.finish();

      const parts = {
        body,
        head,
        hat,
        brows,
        wheatStalk,
        basket,
        armL,
        foreL,
        sheafPivot,
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
      const t = (n._farmerT = (n._farmerT || 0) + dt);

      /* 1. Hit-flash merah saat terkena serangan */
      const em = (n.flash && n.flash > 0) ? 0xaa2222 : 0x000000;
      if (n._lastEm !== em && n.mesh) {
        n._lastEm = em;
        n.mesh.traverse(o => {
          if (o.material && o.material.emissive) o.material.emissive.setHex(em);
        });
      }

      /* 2. State Halus (Kecepatan, Siklus Langkah, Bertani & Ayunan) */
      const rawSp = Math.hypot(n.vel ? n.vel.x : 0, n.vel ? n.vel.z : 0);
      const isFarming = !!(
        (n.farmT && n.farmT > 0) ||
        n.working ||
        (n.forageT && n.forageT > 0) ||
        (n.mineT && n.mineT > 0)
      );
      const hasSwing = (n.swing && n.swing > 0) || isFarming;
      // Bedakan mode mencangkul/menanam vs membabat panen/bertarung
      const isPlanting = !!(n.farmTask && n.farmTask.action && n.farmTask.action !== 'harvest' && n.farmT > 0);

      const st = n._farmerState || (n._farmerState = {
        speed: 0,
        gait: 0,
        runBlend: 0,
        workBlend: 0,
        workCycle: 0,
        swingActive: false
      });

      const moveTarget = (n.walking || rawSp > 0.12) ? rawSp : 0;
      st.speed = lerp(st.speed, moveTarget, clamp(dt * 10, 0, 1));
      const move01 = clamp(st.speed / Math.max(1, (n.speed || 3.1) * 0.9), 0, 1.35);
      const walk01 = clamp(move01, 0, 1);
      const isRun = move01 > 0.82 ? (move01 - 0.82) / 0.53 : 0;
      st.runBlend = lerp(st.runBlend, clamp(isRun, 0, 1), clamp(dt * 7, 0, 1));

      if (walk01 > 0.02) {
        const freq = lerp(7.2, 11.4, st.runBlend) * clamp(0.65 + move01 * 0.45, 0.6, 1.4);
        st.gait = (st.gait + dt * freq) % (Math.PI * 2);
      }

      // Siklus kerja/tebasan: terus berputar mulus walau n.swing di-clamp >= 0.2 oleh aiFarmer
      st.workBlend = lerp(st.workBlend, hasSwing ? 1 : 0, clamp(dt * 14, 0, 1));
      if (hasSwing) {
        if (!st.swingActive) {
          st.swingActive = true;
          st.workCycle = 0.04;
        }
        const rate = isPlanting ? 0.92 : (isFarming ? 0.85 : 1.65);
        st.workCycle += dt * rate;
        if (st.workCycle >= 1) {
          if (isFarming || (n.swing && n.swing > 0.15)) {
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

      /* 3. Siklus Kaki 2-Sendi (Langkah Ceria & Kuda-kuda Tani) */
      const stride = lerp(0.58, 0.85, st.runBlend) * walk01;
      const kneeBend = lerp(0.56, 0.92, st.runBlend) * walk01;

      const legR = sinP * stride;
      const legL = -sinP * stride;
      const liftR = Math.max(0, cosP);
      const liftL = Math.max(0, -cosP);

      const brace = st.workBlend * (1 - walk01 * 0.7);
      P.legs[0].rotation.set(legR + brace * 0.15, 0, 0);
      P.legs[1].rotation.set(legL - brace * 0.15, 0, 0);

      if (P.shins && P.shins.length === 2) {
        P.shins[0].rotation.x = liftR * kneeBend + brace * 0.20;
        P.shins[1].rotation.x = liftL * kneeBend + brace * 0.16;
      }

      /* 4. Gerak Badan, Napas & Koreografi Kerja Tani / Tebasan Sabit */
      const breath = Math.sin(t * 2.5) * 0.012 * (1 - walk01 * 0.6);
      const stepBob = Math.abs(sinP) * lerp(0.038, 0.065, st.runBlend) * walk01;
      const forwardLean = lerp(0.04, 0.15, st.runBlend) * walk01;

      const c = st.workCycle;
      let bodyPitchAdd = 0;
      let bodyYawAdd = 0;
      let bodySink = 0;

      // Pose dasar lengan kanan (memegang sabit/cangkul) & kiri (mendekap ikatan gandum)
      let armRPitch = -sinP * 0.42 * walk01 - 0.14;
      let armRYaw = 0;
      let armRRoll = -0.06;
      let foreRPitch = -0.34 - Math.max(0, -sinP) * 0.22 * walk01;
      let gripPitch = -0.20;
      let gripYaw = 0;

      let armLPitch = sinP * 0.26 * walk01 - 0.42;
      let armLYaw = 0.22;
      let armLRoll = 0.10;
      let foreLPitch = -0.58;

      if (st.workBlend > 0.01 && st.swingActive) {
        const wb = st.workBlend;
        let rPitch = -0.2, rYaw = 0, rRoll = -0.06, fPitch = -0.35, gPitch = -0.20, gYaw = 0;
        let lPitch = -0.52, lYaw = 0.28;

        if (isPlanting) {
          // MODE MENCANGKUL & MENANAM BENIH (Vertikal ke tanah)
          if (c < 0.40) {
            const u = smooth(c / 0.40);
            bodyPitchAdd = lerp(0, -0.16, u) * wb;
            bodySink     = lerp(0,  0.01, u) * wb;
            rPitch       = lerp(-0.20, -1.85, u);
            fPitch       = lerp(-0.35, -0.68, u);
            gPitch       = lerp(-0.20, -0.35, u);
          } else if (c < 0.66) {
            const u = Math.pow(clamp((c - 0.40) / 0.26, 0, 1), 1.5);
            bodyPitchAdd = lerp(-0.16,  0.34, u) * wb;
            bodySink     = lerp( 0.01, -0.06, u) * wb;
            rPitch       = lerp(-1.85, -0.15, u);
            fPitch       = lerp(-0.68, -0.12, u);
            gPitch       = lerp(-0.35,  0.35, u);
          } else {
            const u = smooth((c - 0.66) / 0.34);
            bodyPitchAdd = lerp(0.34, 0, u) * wb;
            bodySink     = lerp(-0.06, 0, u) * wb;
            rPitch       = lerp(-0.15, -0.20, u);
            fPitch       = lerp(-0.12, -0.35, u);
            gPitch       = lerp(0.35,  -0.20, u);
          }
        } else {
          // MODE TEBASAN SABIT PEMANEN / SERANGAN (Ayunan Melengkung Lebar Kanan-ke-Kiri)
          if (c < 0.36) {
            // Fase 1: Tarik sabit lebar ke samping kanan belakang
            const u = smooth(c / 0.36);
            bodyPitchAdd = lerp(0,  0.10, u) * wb;
            bodyYawAdd   = lerp(0, -0.45, u) * wb;
            bodySink     = lerp(0, -0.03, u) * wb;
            rPitch       = lerp(-0.20, -1.25, u);
            rYaw         = lerp(0,     -0.68, u);
            rRoll        = lerp(-0.06, -0.42, u);
            fPitch       = lerp(-0.35, -0.55, u);
            gPitch       = lerp(-0.20, -0.05, u);
            gYaw         = lerp(0,     -0.25, u);
            lPitch       = lerp(-0.42, -0.58, u);
            lYaw         = lerp(0.22,   0.38, u);
          } else if (c < 0.66) {
            // Fase 2: Babadan sabit cepat menyapu diagonal dari kanan ke kiri depan!
            const u = Math.pow(clamp((c - 0.36) / 0.30, 0, 1), 1.45);
            bodyPitchAdd = lerp( 0.10,  0.26, u) * wb;
            bodyYawAdd   = lerp(-0.45,  0.48, u) * wb;
            bodySink     = lerp(-0.03, -0.06, u) * wb;
            rPitch       = lerp(-1.25, -0.55, u);
            rYaw         = lerp(-0.68,  0.78, u);
            rRoll        = lerp(-0.42,  0.28, u);
            fPitch       = lerp(-0.55, -0.18, u);
            gPitch       = lerp(-0.05,  0.24, u);
            gYaw         = lerp(-0.25,  0.35, u);
            lPitch       = lerp(-0.58, -0.36, u);
            lYaw         = lerp(0.38,   0.12, u);
          } else {
            // Fase 3: Follow-through & kembali ke sikap siaga
            const u = smooth((c - 0.66) / 0.34);
            bodyPitchAdd = lerp(0.26, 0, u) * wb;
            bodyYawAdd   = lerp(0.48, 0, u) * wb;
            bodySink     = lerp(-0.06, 0, u) * wb;
            rPitch       = lerp(-0.55, -0.20, u);
            rYaw         = lerp(0.78,  0,     u);
            rRoll        = lerp(0.28, -0.06,  u);
            fPitch       = lerp(-0.18, -0.35, u);
            gPitch       = lerp(0.24,  -0.20, u);
            gYaw         = lerp(0.35,  0,     u);
            lPitch       = lerp(-0.36, -0.42, u);
            lYaw         = lerp(0.12,   0.22, u);
          }
        }

        armRPitch  = lerp(armRPitch,  rPitch, wb);
        armRYaw    = lerp(armRYaw,    rYaw,   wb);
        armRRoll   = lerp(armRRoll,   rRoll,  wb);
        foreRPitch = lerp(foreRPitch, fPitch, wb);
        gripPitch  = lerp(gripPitch,  gPitch, wb);
        gripYaw    = lerp(gripYaw,    gYaw,   wb);

        armLPitch  = lerp(armLPitch,  lPitch, wb);
        armLYaw    = lerp(armLYaw,    lYaw,   wb);
      }

      P.body.position.y = P.bodyY + breath + stepBob + bodySink;
      P.body.rotation.x = forwardLean + bodyPitchAdd;
      P.body.rotation.y = -sinP * 0.08 * walk01 + bodyYawAdd;
      P.body.rotation.z = cosP * 0.03 * walk01;

      P.armR.rotation.set(armRPitch, armRYaw, armRRoll);
      P.foreR.rotation.set(foreRPitch, 0, 0);
      P.grip.rotation.set(gripPitch, gripYaw, 0);

      P.armL.rotation.set(armLPitch, armLYaw, armLRoll);
      P.foreL.rotation.set(foreLPitch, 0, 0);

      /* 5. Sekunder: Ikatan Gandum, Keranjang Panen, Topi Jerami & Tangkai Gandum di Mulut */
      if (P.sheafPivot) {
        P.sheafPivot.rotation.x = 0.28 + Math.sin(t * 2.6) * 0.04 + cosP * 0.08 * walk01;
        P.sheafPivot.rotation.z = 0.18 + Math.cos(t * 2.1) * 0.03;
      }
      if (P.basket) {
        P.basket.position.y = 0.04 + Math.abs(sinP) * 0.02 * walk01;
        P.basket.rotation.x = -Math.abs(cosP) * 0.045 * walk01;
      }
      if (P.hat) {
        P.hat.rotation.x = -0.06 - Math.abs(sinP) * 0.035 * walk01;
        P.hat.rotation.z = 0.03 + cosP * 0.025 * walk01;
      }
      // Tangkai gandum di mulut bergerak naik-turun seperti sedang dikunyah santai
      if (P.wheatStalk) {
        P.wheatStalk.rotation.x = 0.35 + Math.sin(t * 5.8) * 0.11;
        P.wheatStalk.rotation.z = -0.38 + Math.cos(t * 2.9) * 0.05;
      }

      /* 6. Kepala & Alis */
      const lookYaw = (n.headAngle !== undefined && n.headAngle !== null)
        ? n.headAngle
        : ((n.target || isFarming) ? -bodyYawAdd * 0.65 : Math.sin(t * 1.25) * 0.30 * (1 - walk01 * 0.6));
      const lookPitch = isFarming
        ? clamp(0.18 - bodyPitchAdd * 0.3, -0.20, 0.32)
        : Math.sin(t * 1.7) * 0.04;

      P.head.rotation.y = lerp(P.head.rotation.y || 0, lookYaw, clamp(dt * 8, 0, 1));
      P.head.rotation.x = lerp(P.head.rotation.x || 0, lookPitch, clamp(dt * 8, 0, 1));

      if (P.brows && P.brows.length === 2) {
        const browTilt = n.target ? 0.15 : -0.04;
        P.brows[0].rotation.z = -browTilt;
        P.brows[1].rotation.z =  browTilt;
      }
    }
  };
})();

window.NPC_Farmer = NPC_Farmer;
