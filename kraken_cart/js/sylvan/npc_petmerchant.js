'use strict';
/* =============================================================================
   ENTITAS NPC: PET MERCHANT / PENJAGA KANDANG (🐴)
   -----------------------------------------------------------------------------
   Model & Rig 3D dari `NEW MODEL/Pet Merchant.html`.
   - Koboi penjaga kandang bertopi kulit lebar, syal merah, rompi kulit,
     sabuk kapsul vitamin pet, dan garpu kebun (pitchfork) 4 gigi tajam.
   - Rig lengkap: pinggul -> dada -> leher -> kepala -> topi -> bandana,
     lengan 3-sendi (bahu -> siku -> pergelangan) + garpu kebun,
     kaki 3-sendi (paha -> lutut -> telapak boots dengan taji emas).
   - Animasi: Idle napas elastis + anggukan koboi, Jalan energik (heel-strike &
     ayunan garpu), dan Serangan tusukan pitchfork bertingkat saat bertarung.
   ============================================================================= */

const NPC_Petmerchant = (() => {

  const SCALE = 0.52; // Penyesuaian ke skala humanoid Sylvan Dominion (tinggi ±1.85m)
  const BODY_Y = 0.60;

  const C = {
    skin:        0xf2c29b,
    skinD:       0xdba67e,
    shirt:       0xefe6d5,
    shirtStripe: 0xd8cbb3,
    vest:        0x6e3f1f,
    vestTrim:    0x8f552d,
    bandana:     0xc92a2a,
    bandanaD:    0x991b1b,
    pants:       0x2b4c6f,
    chaps:       0x7c4824,
    boot:        0x3b2212,
    bootTip:     0x4d2c18,
    bootHeel:    0x24140a,
    gold:        0xf5c542,
    goldLight:   0xffe57f,
    hat:         0x854c24,
    hatD:        0x593115,
    hair:        0x3b2313,
    mustache:    0x422714,
    wood:        0x6e4423,
    woodD:       0x54341a,
    metal:       0x94a3b8,
    metalD:      0x64748b,
    metalL:      0xcbd5e1,
    metalTip:    0xf8fafc,
    potion:      0x38bdf8
  };

  const _matCache = new Map();
  function getMat(hex) {
    let m = _matCache.get(hex);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: hex });
      _matCache.set(hex, m);
    }
    return m;
  }

  function box(host, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMat(color));
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.castShadow = !IS_MOBILE;
    m.receiveShadow = true;
    host.add(m);
    return m;
  }

  return {
    build() {
      const g = new THREE.Group();
      const rig = new THREE.Group();
      rig.scale.setScalar(SCALE);
      g.add(rig);

      const parts = { bodyY: BODY_Y };

      /* --- PINGGUL (HIPS) --- */
      const hips = new THREE.Group();
      hips.position.set(0, 1.15, 0);
      rig.add(hips);
      parts.hips = hips;

      box(hips, 0.94, 0.24, 0.52, C.pants, 0, 0, 0);
      box(hips, 0.99, 0.16, 0.56, 0x382010, 0, 0.06, 0);
      for (let bx = -0.38; bx <= 0.38; bx += 0.19) {
        if (Math.abs(bx) < 0.1) continue;
        box(hips, 0.06, 0.12, 0.59, C.gold, bx, 0.06, 0);
      }
      box(hips, 0.26, 0.20, 0.60, C.gold, 0, 0.06, 0.02);
      box(hips, 0.14, 0.10, 0.62, C.hatD, 0, 0.06, 0.02);
      /* kantong pakan kiri & ramuan */
      box(hips, 0.22, 0.32, 0.28, 0x995c2d, -0.56, -0.06, 0.05);
      box(hips, 0.24, 0.10, 0.30, C.chaps, -0.56, 0.06, 0.05);
      box(hips, 0.08, 0.10, 0.32, C.gold, -0.56, 0.02, 0.05);
      box(hips, 0.14, 0.20, 0.14, C.potion, -0.54, -0.02, -0.18);
      box(hips, 0.08, 0.08, 0.08, 0xd9a760, -0.54, 0.11, -0.18);
      /* laso kanan */
      box(hips, 0.14, 0.36, 0.36, 0xd8b878, 0.55, -0.04, 0);
      box(hips, 0.18, 0.24, 0.24, 0xc2a061, 0.56, -0.04, 0);
      box(hips, 0.16, 0.10, 0.12, C.hatD, 0.55, 0.12, 0);

      /* --- TORSO --- */
      const torso = new THREE.Group();
      torso.position.set(0, 0.12, 0);
      hips.add(torso);
      parts.torso = torso;

      box(torso, 0.92, 1.05, 0.48, C.shirt, 0, 0.52, 0);
      box(torso, 0.12, 1.04, 0.50, C.shirtStripe, 0, 0.52, 0);
      for (const by of [0.30, 0.52, 0.74]) box(torso, 0.06, 0.06, 0.51, C.hatD, 0, by, 0);
      /* rompi kulit */
      box(torso, 0.34, 1.06, 0.52, C.vest, -0.30, 0.52, 0);
      box(torso, 0.34, 1.06, 0.52, C.vest,  0.30, 0.52, 0);
      box(torso, 0.94, 1.06, 0.16, C.vest, 0, 0.52, -0.19);
      box(torso, 0.18, 0.06, 0.54, C.vestTrim, -0.32, 0.34, 0);
      box(torso, 0.18, 0.06, 0.54, C.vestTrim,  0.32, 0.34, 0);
      box(torso, 0.08, 0.92, 0.54, C.vestTrim, -0.15, 0.52, 0);
      box(torso, 0.08, 0.92, 0.54, C.vestTrim,  0.15, 0.52, 0);
      /* lencana bintang emas */
      box(torso, 0.18, 0.18, 0.56, C.gold, -0.32, 0.78, 0);
      box(torso, 0.08, 0.24, 0.57, C.goldLight, -0.32, 0.78, 0);
      box(torso, 0.24, 0.08, 0.57, C.goldLight, -0.32, 0.78, 0);

      /* bandana di leher */
      box(torso, 0.78, 0.18, 0.56, C.bandana, 0, 1.02, 0.02);
      box(torso, 0.22, 0.16, 0.16, C.bandanaD, 0, 1.00, -0.30);
      const bandana = new THREE.Group();
      bandana.position.set(0, 0.96, 0.25);
      torso.add(bandana);
      parts.bandana = bandana;
      box(bandana, 0.40, 0.20, 0.12, C.bandana, 0, -0.08, 0);
      box(bandana, 0.26, 0.16, 0.12, C.bandanaD, 0, -0.22, 0.01);
      box(bandana, 0.12, 0.10, 0.12, C.bandana, 0, -0.32, 0.02);

      /* --- KEPALA & TOPI KOBOY --- */
      const head = new THREE.Group();
      head.position.set(0, 1.10, 0);
      torso.add(head);
      parts.head = head;

      box(head, 0.44, 0.18, 0.44, C.skinD, 0, 0.02, 0);
      box(head, 0.86, 0.84, 0.84, C.skin, 0, 0.42, 0);
      box(head, 0.88, 0.14, 0.86, C.skinD, 0, 0.07, 0);
      box(head, 0.10, 0.22, 0.16, C.skinD, -0.46, 0.40, -0.02);
      box(head, 0.10, 0.22, 0.16, C.skinD,  0.46, 0.40, -0.02);
      /* mata koboi tajam */
      box(head, 0.22, 0.13, 0.06, 0xffffff, -0.20, 0.44, 0.41);
      box(head, 0.22, 0.13, 0.06, 0xffffff,  0.20, 0.44, 0.41);
      box(head, 0.12, 0.13, 0.08, 0x1e293b, -0.18, 0.44, 0.41);
      box(head, 0.12, 0.13, 0.08, 0x1e293b,  0.18, 0.44, 0.41);
      box(head, 0.05, 0.05, 0.09, 0xffffff, -0.21, 0.47, 0.41);
      box(head, 0.05, 0.05, 0.09, 0xffffff,  0.15, 0.47, 0.41);
      /* alis & kumis baplang */
      const brows = new THREE.Group();
      brows.position.set(0, 0.55, 0.42);
      head.add(brows);
      parts.brows = brows;
      box(brows, 0.25, 0.07, 0.08, C.hair, -0.20, 0, 0);
      box(brows, 0.25, 0.07, 0.08, C.hair,  0.20, 0, 0);
      box(head, 0.14, 0.17, 0.14, C.skinD, 0, 0.36, 0.44);
      box(head, 0.48, 0.10, 0.11, C.mustache, 0, 0.24, 0.44);
      box(head, 0.14, 0.14, 0.11, C.mustache, -0.24, 0.19, 0.43);
      box(head, 0.14, 0.14, 0.11, C.mustache,  0.24, 0.19, 0.43);
      box(head, 0.10, 0.08, 0.11, C.mustache, -0.32, 0.22, 0.42);
      box(head, 0.10, 0.08, 0.11, C.mustache,  0.32, 0.22, 0.42);
      box(head, 0.24, 0.09, 0.10, 0x331d0e, 0, 0.10, 0.43);
      box(head, 0.90, 0.46, 0.22, C.hair, 0, 0.48, -0.36);
      box(head, 0.10, 0.36, 0.22, C.hair, -0.43, 0.42, 0.10);
      box(head, 0.10, 0.36, 0.22, C.hair,  0.43, 0.42, 0.10);

      /* TOPI KOBOY VOXEL */
      const hat = new THREE.Group();
      hat.position.set(0, 0.78, 0);
      hat.rotation.x = -0.05;
      head.add(hat);
      parts.hat = hat;
      box(hat, 1.52, 0.10, 1.58, C.hat, 0, 0, 0.02);
      box(hat, 1.20, 0.10, 1.76, C.hat, 0, 0, 0.02);
      box(hat, 0.18, 0.14, 1.40, C.hat, -0.79, 0.08, 0.02);
      box(hat, 0.18, 0.14, 1.40, C.hat,  0.79, 0.08, 0.02);
      box(hat, 0.12, 0.15, 1.14, C.hatD, -0.89, 0.17, 0.02);
      box(hat, 0.12, 0.15, 1.14, C.hatD,  0.89, 0.17, 0.02);
      box(hat, 0.98, 0.14, 0.98, C.hatD, 0, 0.11, 0);
      box(hat, 0.24, 0.16, 0.08, C.gold, 0, 0.12, 0.49);
      box(hat, 0.06, 0.28, 0.14, 0xef4444, 0.51, 0.28, -0.10);
      box(hat, 0.06, 0.20, 0.12, 0xffffff, 0.52, 0.44, -0.16);
      box(hat, 0.92, 0.32, 0.92, C.hat, 0, 0.32, 0);
      box(hat, 0.32, 0.14, 0.84, C.hat, -0.26, 0.52, 0);
      box(hat, 0.32, 0.14, 0.84, C.hat,  0.26, 0.52, 0);
      box(hat, 0.24, 0.08, 0.78, C.hatD, 0, 0.48, 0);

      /* --- LENGAN KIRI & KANAN --- */
      function createArm(isRight) {
        const sign = isRight ? -1 : 1;
        const shoulder = new THREE.Group();
        shoulder.position.set(sign * 0.64, 0.95, 0);
        torso.add(shoulder);

        box(shoulder, 0.36, 0.14, 0.36, C.vest, 0, -0.02, 0);
        box(shoulder, 0.34, 0.42, 0.34, C.shirt, 0, -0.20, 0);
        box(shoulder, 0.37, 0.11, 0.37, C.shirtStripe, 0, -0.38, 0);

        const forearm = new THREE.Group();
        forearm.position.set(0, -0.42, 0);
        shoulder.add(forearm);

        box(forearm, 0.28, 0.24, 0.28, C.skin, 0, -0.12, 0);
        box(forearm, 0.33, 0.14, 0.33, C.boot, 0, -0.26, 0);
        box(forearm, 0.35, 0.06, 0.35, C.gold, 0, -0.21, 0);

        const wrist = new THREE.Group();
        wrist.position.set(0, -0.34, 0);
        forearm.add(wrist);

        box(wrist, 0.30, 0.20, 0.30, C.boot, 0, -0.08, 0);
        box(wrist, 0.10, 0.12, 0.12, C.hatD, -sign * 0.16, -0.08, 0.06);

        return { shoulder, forearm, wrist };
      }

      const rightArm = createArm(true);
      const leftArm = createArm(false);
      parts.rShoulder = rightArm.shoulder;
      parts.rForearm = rightArm.forearm;
      parts.rWrist = rightArm.wrist;
      parts.lShoulder = leftArm.shoulder;
      parts.lForearm = leftArm.forearm;
      parts.lWrist = leftArm.wrist;

      /* GARPU KEBUN (PITCHFORK) DI WRIST KANAN */
      const weapon = new THREE.Group();
      weapon.position.set(0, -0.08, 0.12);
      rightArm.wrist.add(weapon);
      parts.weapon = weapon;

      box(weapon, 0.11, 0.11, 2.30, C.wood, 0, 0, 0.35);
      box(weapon, 0.12, 0.12, 0.18, C.woodD, 0, 0, -0.45);
      box(weapon, 0.12, 0.12, 0.18, C.woodD, 0, 0, 0.75);
      box(weapon, 0.26, 0.15, 0.12, C.boot, 0, 0, -0.82);
      box(weapon, 0.14, 0.14, 0.44, C.boot, 0, 0, 0.0);
      box(weapon, 0.16, 0.16, 0.24, C.metalD, 0, 0, 1.46);
      box(weapon, 0.18, 0.18, 0.08, C.gold, 0, 0, 1.35);
      box(weapon, 0.80, 0.12, 0.15, C.metal, 0, 0, 1.60);
      box(weapon, 0.70, 0.15, 0.11, C.metalD, 0, 0, 1.56);
      for (const tx of [-0.33, -0.11, 0.11, 0.33]) {
        box(weapon, 0.07, 0.09, 0.60, C.metalL, tx, 0.01, 1.93);
        box(weapon, 0.05, 0.06, 0.30, C.metalTip, tx, 0.03, 2.34);
      }
      /* peluit lonceng pet emas di wrist kiri */
      box(leftArm.wrist, 0.18, 0.18, 0.26, C.gold, 0, -0.10, 0.16);
      box(leftArm.wrist, 0.10, 0.10, 0.08, C.goldLight, 0, -0.10, 0.31);

      /* --- KAKI KIRI & KANAN --- */
      function createLeg(isRight) {
        const sign = isRight ? -1 : 1;
        const hipJoint = new THREE.Group();
        hipJoint.position.set(sign * 0.24, -0.08, 0);
        hips.add(hipJoint);

        box(hipJoint, 0.38, 0.52, 0.40, C.pants, 0, -0.26, 0);
        box(hipJoint, 0.41, 0.46, 0.26, C.chaps, 0, -0.26, 0.09);
        box(hipJoint, 0.06, 0.36, 0.16, C.hatD, sign * 0.22, -0.26, 0.02);
        box(hipJoint, 0.32, 0.14, 0.10, C.hatD, 0, -0.46, 0.19);

        const knee = new THREE.Group();
        knee.position.set(0, -0.52, 0);
        hipJoint.add(knee);

        box(knee, 0.36, 0.34, 0.38, C.boot, 0, -0.17, 0);
        box(knee, 0.38, 0.08, 0.40, C.hatD, 0, -0.06, 0);
        box(knee, 0.12, 0.10, 0.41, C.gold, 0, -0.06, 0.02);

        const ankle = new THREE.Group();
        ankle.position.set(0, -0.34, 0);
        knee.add(ankle);

        box(ankle, 0.38, 0.20, 0.50, C.boot, 0, -0.08, 0.06);
        box(ankle, 0.34, 0.14, 0.12, C.bootTip, 0, -0.10, 0.32);
        box(ankle, 0.38, 0.06, 0.18, C.bootHeel, 0, -0.16, -0.10);
        box(ankle, 0.42, 0.06, 0.14, C.hatD, 0, -0.08, -0.16);
        box(ankle, 0.08, 0.14, 0.16, C.gold, 0, -0.08, -0.26);

        return { hipJoint, knee, ankle };
      }

      const rightLeg = createLeg(true);
      const leftLeg = createLeg(false);
      parts.rLeg = rightLeg.hipJoint;
      parts.rKnee = rightLeg.knee;
      parts.rAnkle = rightLeg.ankle;
      parts.lLeg = leftLeg.hipJoint;
      parts.lKnee = leftLeg.knee;
      parts.lAnkle = leftLeg.ankle;

      /* Fallback compatibility */
      parts.body = hips;
      parts.head = head;
      parts.armL = leftArm.shoulder;
      parts.armR = rightArm.shoulder;
      parts.legs = hips;

      return { mesh: g, parts };
    },

    animate(n, dt) {
      const p = n.parts;
      if (!p || !p.hips) return;

      n._pmAnimT = (n._pmAnimT || 0) + dt;
      const t = n._pmAnimT;

      const spd = Math.hypot(n.vel ? n.vel.x : 0, n.vel ? n.vel.z : 0);
      const isWalking = spd > 0.08;
      const isSwing = (n.swing || 0) > 0;

      if (isSwing) {
        /* SERANGAN TUSUKAN PITCHFORK (HACK & SLASH ATTACK) */
        const sw = Math.min(1, Math.max(0, n.swing * 4)); // 0..1
        const snap = Math.sin(sw * Math.PI);

        p.hips.position.y = 1.15 - snap * 0.18;
        p.hips.position.z = snap * 0.45;
        p.torso.rotation.y = snap * 0.35;
        p.torso.rotation.x = snap * 0.28;
        p.head.rotation.y = -snap * 0.20;
        p.hat.rotation.x = -0.05 - snap * 0.18;
        p.bandana.rotation.x = snap * 0.45;

        // Lengan kanan meluruskan garpu ke depan
        p.rShoulder.rotation.x = -snap * 1.55;
        p.rShoulder.rotation.z = -0.12;
        p.rForearm.rotation.x = 0;
        p.rWrist.rotation.x = snap * 0.32;
        p.weapon.rotation.x = 0.85 + snap * 0.35;

        // Lengan kiri mengimbangi di belakang
        p.lShoulder.rotation.x = snap * 0.65;
        p.lShoulder.rotation.z = 0.25;
        p.lForearm.rotation.x = -0.35;

        // Kaki merendah menahan kuda-kuda tusukan
        p.rLeg.rotation.x = -snap * 0.65;
        p.rKnee.rotation.x = snap * 0.55;
        p.lLeg.rotation.x = snap * 0.55;
        p.lKnee.rotation.x = snap * 0.35;
      }
      else if (isWalking) {
        /* SIKLUS JALAN KOBOY DENGAN HEEL-STRIKE & AYUNAN GARPU */
        const w = t * 8.5;
        const stride = Math.sin(w);
        const cosW = Math.cos(w);
        const bounce = Math.abs(cosW);

        p.hips.position.y = 1.12 + bounce * 0.08;
        p.hips.rotation.y = -stride * 0.18;
        p.hips.rotation.z = stride * 0.05;

        p.torso.rotation.x = 0.10 + Math.sin(w * 2) * 0.04;
        p.torso.rotation.y = stride * 0.16;
        p.torso.rotation.z = -stride * 0.04;

        p.head.rotation.y = -stride * 0.10;
        p.head.rotation.x = -0.04 - Math.cos(w * 2 - 0.5) * 0.05;
        p.hat.rotation.x = -0.05 + Math.sin(w * 2 - 0.6) * 0.06;
        p.bandana.rotation.x = 0.16 + Math.sin(w * 2 - 0.7) * 0.14;

        // Kaki kanan & kiri
        p.rLeg.rotation.x = stride * 0.72;
        p.rKnee.rotation.x = Math.max(0, -cosW * 0.75 + 0.15);
        p.rAnkle.rotation.x = Math.sin(w - 0.8) * 0.30;

        p.lLeg.rotation.x = -stride * 0.72;
        p.lKnee.rotation.x = Math.max(0, cosW * 0.75 + 0.15);
        p.lAnkle.rotation.x = -Math.sin(w - 0.8) * 0.30;

        // Lengan kanan mengayun garpu dengan pergelangan luwes
        p.rShoulder.rotation.x = -stride * 0.45 - 0.20;
        p.rShoulder.rotation.z = -0.15;
        p.rForearm.rotation.x = -0.32 - Math.max(0, stride * 0.25);
        p.rWrist.rotation.x = -Math.sin(w - 0.35) * 0.18;
        p.weapon.rotation.x = 0.15;

        // Lengan kiri rileks mengayun
        p.lShoulder.rotation.x = stride * 0.55;
        p.lShoulder.rotation.z = 0.14;
        p.lForearm.rotation.x = -0.25 - Math.max(0, -stride * 0.35);
        p.lWrist.rotation.x = Math.sin(w - 0.35) * 0.20;
      }
      else {
        /* IDLE KOBOY BERNAFAS ELASTIS */
        const b = t * 2.4;
        const breath = Math.sin(b);
        const breathLag = Math.sin(b - 0.55);
        const sway = Math.sin(t * 1.15);

        p.hips.position.y = 1.15 + breath * 0.025;
        p.hips.position.z = 0;
        p.hips.rotation.y = Math.sin(t * 0.8) * 0.07;
        p.hips.rotation.z = -sway * 0.03;

        p.torso.rotation.x = breath * 0.035;
        p.torso.rotation.y = 0;
        p.torso.rotation.z = sway * 0.035;

        p.head.rotation.y = Math.sin(t * 0.85) * 0.18;
        p.head.rotation.x = -breathLag * 0.04;
        p.head.rotation.z = -sway * 0.03;
        p.hat.rotation.x = -0.05 - breathLag * 0.04;
        p.bandana.rotation.x = 0.08 + breathLag * 0.08;

        p.rShoulder.rotation.x = -0.18 + breath * 0.06;
        p.rShoulder.rotation.z = -0.14;
        p.rForearm.rotation.x = -0.30 + breathLag * 0.06;
        p.rWrist.rotation.x = Math.sin(b - 1.0) * 0.06;
        p.weapon.rotation.x = 0.10;

        p.lShoulder.rotation.x = 0.08 - breath * 0.05;
        p.lShoulder.rotation.z = 0.14;
        p.lForearm.rotation.x = -0.22 - breathLag * 0.05;
        p.lWrist.rotation.x = Math.cos(b - 0.9) * 0.06;

        const kneeBend = Math.max(0, -breath) * 0.06;
        p.rLeg.rotation.x = -kneeBend * 0.5;
        p.rKnee.rotation.x = kneeBend;
        p.rAnkle.rotation.x = -kneeBend * 0.5;
        p.lLeg.rotation.x = -kneeBend * 0.5;
        p.lKnee.rotation.x = kneeBend;
        p.lAnkle.rotation.x = -kneeBend * 0.5;
      }
    }
  };
})();

if (typeof window !== 'undefined') {
  window.NPC_Petmerchant = NPC_Petmerchant;
}
