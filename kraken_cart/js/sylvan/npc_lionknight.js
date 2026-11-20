'use strict';
/* =============================================================================
   ENTITAS NPC: MANUSIA SINGA / LION KNIGHT (🦁) — VOXEL 3D V2 + 10-FACE CLOTH
   -----------------------------------------------------------------------------
   Diimpor langsung dari NEW MODEL/Lion Warrior New.html dan disesuaikan penuh
   dengan sistem pertarungan in-game serta ukuran & orientasi seluruh Armor
   (ArmorManager: 12 set) dan Sword (WeaponManager: 15 pedang) milik Player.
   ============================================================================= */

const NPC_Lionknight = (() => {
  // --- Helper Matematika & Easing untuk Pergerakan Smooth ---
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (cur, tgt, lambda, dt) => lerp(cur, tgt, 1 - Math.exp(-lambda * dt));
  const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x, 0, 1)));
  const easeInOutSine = (x) => -(Math.cos(Math.PI * clamp(x, 0, 1)) - 1) / 2;
  const smootherstep = (x) => {
    const t = clamp(x, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  function angLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * clamp(t, 0, 1);
  }

  function npcDmgSafe(n) {
    if (typeof NPCS !== 'undefined' && typeof NPCS.npcDmg === 'function') {
      return NPCS.npcDmg(n);
    }
    return (n && n.dmg) ? n.dmg : 28;
  }

  // --- Tekstur Pixel-Voxel Art untuk Jubah 10-Face ---
  function createVoxelCapeTexture(mainHex, darkHex, trimHex) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 32;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    // Warna dasar kain
    ctx.fillStyle = mainHex || '#991b1b';
    ctx.fillRect(0, 0, 16, 32);

    // Shading lipatan vertikal bergaya pixel/voxel
    ctx.fillStyle = darkHex || '#7f1d1d';
    ctx.fillRect(3, 0, 2, 30);
    ctx.fillRect(7, 0, 2, 30);
    ctx.fillRect(11, 0, 2, 30);

    // Pinggiran emas (pixel border)
    ctx.fillStyle = trimHex || '#fbbf24';
    ctx.fillRect(0, 0, 1, 32);
    ctx.fillRect(15, 0, 1, 32);
    ctx.fillRect(0, 30, 16, 2);
    ctx.fillRect(1, 28, 14, 1);

    // Emblem Pixel Mahkota/Singa Emas di tengah punggung jubah
    ctx.fillRect(6, 9, 4, 4);
    ctx.fillRect(5, 7, 1, 2);
    ctx.fillRect(7, 6, 2, 2);
    ctx.fillRect(10, 7, 1, 2);

    if (typeof THREE.CanvasTexture !== 'function') return null;
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.NearestFilter !== undefined) {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
    }
    tex.needsUpdate = true;
    return tex;
  }

  // ==========================================================================
  // PHYSICS CLOTH CAPE (TEPAT 10 TRIANGLE FACES = 5 BARIS x 2 SEGITIGA)
  // ==========================================================================
  function createPhysicsCape10(material) {
    const ROWS = 5;           // 5 segmen vertikal -> 5 quad = 10 triangle faces
    const COLS = 2;           // 2 titik per baris (kiri & kanan) -> 12 vertex total
    const TOTAL_VERTS = (ROWS + 1) * COLS;

    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(TOTAL_VERTS * 3);
    const uvs = new Float32Array(TOTAL_VERTS * 2);
    const indices = [];

    const particles = [];
    const constraints = [];

    // Lebar tiap baris (sedikit melebar di bawah ala jubah ksatria voxel)
    const halfWidths = [0.22, 0.24, 0.26, 0.28, 0.30, 0.32];
    const rowY = [1.42, 1.23, 1.04, 0.84, 0.64, 0.44];
    const baseZ = -0.19;

    for (let r = 0; r <= ROWS; r++) {
      const hw = halfWidths[r];
      const y = rowY[r];
      const z = baseZ - r * 0.015;
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const x = c === 0 ? -hw : hw;

        positions[idx * 3 + 0] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;

        uvs[idx * 2 + 0] = c;
        uvs[idx * 2 + 1] = 1 - r / ROWS;

        particles.push({
          pos: new THREE.Vector3(x, y, z),
          old: new THREE.Vector3(x, y, z),
          pinned: r === 0,
          row: r,
          col: c
        });
      }
    }

    // 5 Quad = Tepat 10 Face Segitiga
    for (let r = 0; r < ROWS; r++) {
      const a = r * 2;
      const b = r * 2 + 1;
      const c = (r + 1) * 2;
      const d = (r + 1) * 2 + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    const addConstraint = (i1, i2, stiffness) => {
      constraints.push({
        i1,
        i2,
        rest: particles[i1].pos.distanceTo(particles[i2].pos),
        stiffness
      });
    };

    for (let r = 0; r <= ROWS; r++) {
      addConstraint(r * 2, r * 2 + 1, 0.96); // Horizontal
      if (r < ROWS) {
        addConstraint(r * 2, (r + 1) * 2, 0.98);         // Vertikal Kiri
        addConstraint(r * 2 + 1, (r + 1) * 2 + 1, 0.98); // Vertikal Kanan
        addConstraint(r * 2, (r + 1) * 2 + 1, 0.88);     // Diagonal Silang 1
        addConstraint(r * 2 + 1, (r + 1) * 2, 0.88);     // Diagonal Silang 2
      }
      if (r < ROWS - 1) {
        addConstraint(r * 2, (r + 2) * 2, 0.50);         // Bending Kiri
        addConstraint(r * 2 + 1, (r + 2) * 2 + 1, 0.50); // Bending Kanan
      }
    }

    if (geom.setIndex) geom.setIndex(indices);
    if (geom.setAttribute && typeof THREE.BufferAttribute === 'function') {
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    if (geom.computeVertexNormals) geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    return {
      mesh,
      geom,
      particles,
      constraints,
      faceCount: indices.length / 3, // 10 faces
      prevPinL: new THREE.Vector3(-halfWidths[0], rowY[0], baseZ),
      prevPinR: new THREE.Vector3(halfWidths[0], rowY[0], baseZ)
    };
  }

  function updatePhysicsCape10(cape, pinL, pinR, externalImpulse, dt, npcTime) {
    if (!cape || !cape.particles) return;
    const stepDt = clamp(dt, 0.004, 0.033);
    const parts = cape.particles;

    const deltaL = pinL.clone().sub(cape.prevPinL);
    const deltaR = pinR.clone().sub(cape.prevPinR);
    cape.prevPinL.copy(pinL);
    cape.prevPinR.copy(pinR);

    // Kunci 2 vertex bahu atas
    parts[0].pos.copy(pinL);
    parts[0].old.copy(pinL);
    parts[1].pos.copy(pinR);
    parts[1].old.copy(pinR);

    const damping = 0.95;
    const gravY = -9.5 * stepDt * stepDt;

    for (let i = 2; i < parts.length; i++) {
      const p = parts[i];
      const vx = (p.pos.x - p.old.x) * damping;
      const vy = (p.pos.y - p.old.y) * damping;
      const vz = (p.pos.z - p.old.z) * damping;

      p.old.copy(p.pos);

      const rf = p.row / 5;
      const windX = Math.sin(npcTime * 3.6 - p.row * 0.85 + p.col) * 0.12 * rf;
      const windZ = (Math.cos(npcTime * 4.2 - p.row * 0.8) * 0.16 - 0.12) * rf;
      const shDelta = p.col === 0 ? deltaL : deltaR;

      p.pos.x += vx - shDelta.x * 0.35 * rf + (externalImpulse.x + windX) * stepDt * stepDt;
      p.pos.y += vy - shDelta.y * 0.25 * rf + gravY + externalImpulse.y * stepDt * stepDt;
      p.pos.z += vz - shDelta.z * 0.45 * rf + (externalImpulse.z + windZ) * stepDt * stepDt;
    }

    const diff = new THREE.Vector3();
    for (let iter = 0; iter < 3; iter++) {
      for (let c = 0; c < cape.constraints.length; c++) {
        const con = cape.constraints[c];
        const p1 = parts[con.i1];
        const p2 = parts[con.i2];
        diff.subVectors(p2.pos, p1.pos);
        const d = diff.length() || 0.0001;
        const corr = ((d - con.rest) / d) * con.stiffness;

        if (p1.pinned && !p2.pinned) {
          p2.pos.addScaledVector(diff, -corr);
        } else if (!p1.pinned && p2.pinned) {
          p1.pos.addScaledVector(diff, corr);
        } else if (!p1.pinned && !p2.pinned) {
          p1.pos.addScaledVector(diff, corr * 0.5);
          p2.pos.addScaledVector(diff, -corr * 0.5);
        }
      }

      // Cegah jubah menembus punggung dan kaki voxel
      for (let i = 2; i < parts.length; i++) {
        const p = parts[i];
        const backLimitZ = p.pos.y > 0.85 ? -0.18 : -0.22 - (0.85 - p.pos.y) * 0.16;
        if (p.pos.z > backLimitZ) p.pos.z = backLimitZ;
        if (p.pos.y < 0.08) p.pos.y = 0.08;
      }
    }

    const posAttr = cape.geom && cape.geom.attributes && cape.geom.attributes.position;
    if (posAttr && posAttr.array) {
      const arr = posAttr.array;
      for (let i = 0; i < parts.length; i++) {
        arr[i * 3 + 0] = parts[i].pos.x;
        arr[i * 3 + 1] = parts[i].pos.y;
        arr[i * 3 + 2] = parts[i].pos.z;
      }
      posAttr.needsUpdate = true;
      if (cape.geom.computeVertexNormals) cape.geom.computeVertexNormals();
    }
  }

  // ==========================================================================
  // GENERATOR PEDANG & TEMA ARMOR VOXEL 3D (Fallback & Integrasi Manager)
  // ==========================================================================
  const WEAPON_THEMES = {
    default:          { blade: 0xfffbeb, guard: 0xf5bd33, gem: 0xdc2626, len: 1.06, w: 0.10, style: 'lion' },
    sword_paladin:    { blade: 0xfef08a, guard: 0xfbbf24, gem: 0x38bdf8, len: 1.12, w: 0.11, style: 'sun' },
    sword_iron:       { blade: 0xe2e8f0, guard: 0x64748b, gem: 0x475569, len: 1.14, w: 0.10, style: 'broad' },
    sword_berserker:  { blade: 0xd6d3d1, guard: 0x78350f, gem: 0xef4444, len: 1.08, w: 0.16, style: 'cleaver' },
    sword_elven:      { blade: 0xa7f3d0, guard: 0x10b981, gem: 0x34d399, len: 1.06, w: 0.07, style: 'katana' },
    sword_steampunk:  { blade: 0xfdba74, guard: 0xb45309, gem: 0xf97316, len: 1.04, w: 0.11, style: 'cog' },
    sword_shadow:     { blade: 0x312e81, guard: 0x1e1b4b, gem: 0xa855f7, len: 0.98, w: 0.065, style: 'katana' },
    sword_juggernaut: { blade: 0x94a3b8, guard: 0x334155, gem: 0xf59e0b, len: 1.24, w: 0.18, style: 'colossus' },
    sword_crystal:    { blade: 0x67e8f9, guard: 0x0284c7, gem: 0xe0f2fe, len: 1.10, w: 0.10, style: 'crystal' },
    sword_reaper:     { blade: 0xc084fc, guard: 0x3b0764, gem: 0x9333ea, len: 1.18, w: 0.08, style: 'scythe' },
    sword_yeti:       { blade: 0xbae6fd, guard: 0x0369a1, gem: 0x38bdf8, len: 1.18, w: 0.14, style: 'crystal' },
    sword_samurai:    { blade: 0xf8fafc, guard: 0x991b1b, gem: 0xfbbf24, len: 1.10, w: 0.06, style: 'katana' },
    sword_dragon:     { blade: 0xfca5a5, guard: 0x991b1b, gem: 0xf97316, len: 1.20, w: 0.13, style: 'fang' },
    sword_leviathan:  { blade: 0xfde047, guard: 0x0d9488, gem: 0x2dd4bf, len: 1.16, w: 0.12, style: 'fang' },
    sword_crab:       { blade: 0xfb7185, guard: 0xbe123c, gem: 0xfda4af, len: 1.10, w: 0.14, style: 'cleaver' },
    sword_centipede:  { blade: 0x86efac, guard: 0x14532d, gem: 0x22c55e, len: 1.14, w: 0.11, style: 'fang' }
  };

  function buildVoxelSword(weaponId) {
    const cfg = WEAPON_THEMES[weaponId] || WEAPON_THEMES.default;
    const g = new THREE.Group();
    g.name = 'Weapon_' + (weaponId || 'default');
    // Rotasi identik dengan Player (js/player.js baris 354-355):
    // Bilah mengarah ke depan (+Z) & mata bilah tajam menghadap atas/bawah (±Y)
    g.position.set(0, 0, 0);
    g.rotation.set(Math.PI / 2, Math.PI / 2, 0);

    const matBlade = new THREE.MeshStandardMaterial({ color: cfg.blade, metalness: 0.85, roughness: 0.20 });
    const matGuard = new THREE.MeshStandardMaterial({ color: cfg.guard, metalness: 0.78, roughness: 0.28 });
    const matGrip  = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const matGem   = new THREE.MeshBasicMaterial({ color: cfg.gem });

    const b = (w, h, d, m, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };

    // Gagang & Pommel Voxel
    g.add(
      b(0.045, 0.24, 0.045, matGrip, 0, -0.06, 0),
      b(0.085, 0.075, 0.085, matGuard, 0, -0.20, 0),
      // Crossguard Voxel Bertingkat + Permata Inti
      b(0.30, 0.06, 0.075, matGuard, 0, 0.07, 0),
      b(0.07, 0.10, 0.06, matGuard, -0.16, 0.09, 0),
      b(0.07, 0.10, 0.06, matGuard, 0.16, 0.09, 0),
      b(0.065, 0.065, 0.09, matGem, 0, 0.07, 0)
    );

    if (cfg.style === 'scythe') {
      // Sabit Voxel Bertingkat
      g.add(
        b(0.045, cfg.len, 0.045, matGuard, 0, 0.08 + cfg.len * 0.5, 0),
        b(0.28, 0.09, 0.03, matBlade, 0.14, cfg.len + 0.04, 0),
        b(0.22, 0.07, 0.03, matBlade, 0.32, cfg.len - 0.01, 0),
        b(0.14, 0.06, 0.03, matBlade, 0.44, cfg.len - 0.06, 0)
      );
    } else {
      // Bilah Pedang Voxel + Ujung Runcing Bertingkat (Stepped Voxel Tip)
      const L = cfg.len;
      const W = cfg.w;
      g.add(
        b(W, L, 0.028, matBlade, 0, 0.10 + L * 0.5, 0),
        b(W * 0.36, L * 0.72, 0.036, matGuard, 0, 0.10 + L * 0.40, 0), // Fuller tengah
        b(W * 0.72, 0.08, 0.028, matBlade, 0, 0.10 + L + 0.04, 0),     // Step ujung 1
        b(W * 0.42, 0.07, 0.028, matBlade, 0, 0.10 + L + 0.11, 0),     // Step ujung 2
        b(W * 0.18, 0.05, 0.028, matBlade, 0, 0.10 + L + 0.17, 0)      // Ujung paling atas
      );
    }

    return g;
  }

  const ARMOR_THEMES = {
    gold:       { primary: 0xfbbf24, secondary: 0xfef08a, cape: '#1e3a8a', dark: '#172554', trim: '#fbbf24', helmStyle: 'crown' },
    paladin:    { primary: 0xfbbf24, secondary: 0xfef08a, cape: '#1e3a8a', dark: '#172554', trim: '#fbbf24', helmStyle: 'crown' },
    iron:       { primary: 0x94a3b8, secondary: 0x475569, cape: '#7f1d1d', dark: '#450a0a', trim: '#cbd5e1', helmStyle: 'visor' },
    knight:     { primary: 0x94a3b8, secondary: 0x475569, cape: '#7f1d1d', dark: '#450a0a', trim: '#cbd5e1', helmStyle: 'visor' },
    berserker:  { primary: 0x78350f, secondary: 0xd97706, cape: '#451a03', dark: '#270e02', trim: '#f59e0b', helmStyle: 'horns' },
    elven:      { primary: 0x059669, secondary: 0x6ee7b7, cape: '#064e3b', dark: '#022c22', trim: '#34d399', helmStyle: 'circlet' },
    copper:     { primary: 0xb45309, secondary: 0xf59e0b, cape: '#431407', dark: '#2a0a04', trim: '#fb923c', helmStyle: 'goggles' },
    steampunk:  { primary: 0xb45309, secondary: 0xf59e0b, cape: '#431407', dark: '#2a0a04', trim: '#fb923c', helmStyle: 'goggles' },
    shadow:     { primary: 0x1e1b4b, secondary: 0x6366f1, cape: '#0f172a', dark: '#020617', trim: '#818cf8', helmStyle: 'hood' },
    assassin:   { primary: 0x1e1b4b, secondary: 0x6366f1, cape: '#0f172a', dark: '#020617', trim: '#818cf8', helmStyle: 'hood' },
    tungsten:   { primary: 0x334155, secondary: 0x94a3b8, cape: '#1e293b', dark: '#0f172a', trim: '#f59e0b', helmStyle: 'colossus' },
    juggernaut: { primary: 0x334155, secondary: 0x94a3b8, cape: '#1e293b', dark: '#0f172a', trim: '#f59e0b', helmStyle: 'colossus' },
    crystal:    { primary: 0x0284c7, secondary: 0x7dd3fc, cape: '#0c4a6e', dark: '#082f49', trim: '#38bdf8', helmStyle: 'spire' },
    mage:       { primary: 0x0284c7, secondary: 0x7dd3fc, cape: '#0c4a6e', dark: '#082f49', trim: '#38bdf8', helmStyle: 'spire' },
    reaper:     { primary: 0x3b0764, secondary: 0xa855f7, cape: '#1e1b4b', dark: '#0f0728', trim: '#c084fc', helmStyle: 'hood' },
    yeti:       { primary: 0xe0f2fe, secondary: 0x38bdf8, cape: '#075985', dark: '#0c4a6e', trim: '#bae6fd', helmStyle: 'horns' },
    samurai:    { primary: 0x991b1b, secondary: 0xfbbf24, cape: '#450a0a', dark: '#280505', trim: '#fde047', helmStyle: 'kabuto' },
    dragon:     { primary: 0xb91c1c, secondary: 0xf97316, cape: '#450a0a', dark: '#280505', trim: '#fb923c', helmStyle: 'dragon' }
  };

  // Helm full-face di ArmorManager yang menutup bagian depan wajah/moncong
  const FULL_FACE_SETS = {
    iron: true,
    gold: true,
    shadow: true,
    tungsten: true,
    reaper: true,
    samurai: true,
    dragon: true
  };

  function clearGroup(grp) {
    if (!grp) return;
    while (grp.children.length > 0) {
      const c = grp.children[0];
      grp.remove(c);
    }
  }

  function resolveArmorQuery(itemId) {
    if (!itemId) return null;
    if (typeof ITEMS !== 'undefined' && ITEMS[itemId]) {
      const it = ITEMS[itemId];
      if (it.armor && it.armor.set) return it.armor.set;
      if (it.armor && it.armor.tier) return it.armor.tier;
    }
    return itemId;
  }

  function resolveArmorSet(itemId) {
    const q = resolveArmorQuery(itemId);
    if (!q) return null;
    if (typeof ArmorManager !== 'undefined' && typeof ArmorManager.getSet === 'function') {
      return ArmorManager.getSet(q);
    }
    return null;
  }

  // ==========================================================================
  // BUILD MODEL VOXEL 3D MANUSIA SINGA (100% THREE.BoxGeometry)
  // ==========================================================================
  function buildLionKnight() {
    const mesh = new THREE.Group();
    mesh.name = 'NPC_Lionknight_Root';

    // Palet Material Voxel (Lambert & Standard Flat untuk ketajaman bidang kotak)
    const mats = {
      fur:       new THREE.MeshLambertMaterial({ color: 0xd98a26 }),
      furLight:  new THREE.MeshLambertMaterial({ color: 0xf6cf86 }),
      furDark:   new THREE.MeshLambertMaterial({ color: 0x9a5813 }),
      maneDark:  new THREE.MeshLambertMaterial({ color: 0x3b1808 }),
      maneMid:   new THREE.MeshLambertMaterial({ color: 0x6b2d0e }),
      maneGold:  new THREE.MeshLambertMaterial({ color: 0xb45b12 }),
      gold:      new THREE.MeshStandardMaterial({ color: 0xf5bd33, roughness: 0.28, metalness: 0.78 }),
      goldDark:  new THREE.MeshStandardMaterial({ color: 0xb87d14, roughness: 0.36, metalness: 0.72 }),
      steel:     new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.75 }),
      steelDark: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.68 }),
      blade:     new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.18, metalness: 0.90 }),
      crimson:   new THREE.MeshLambertMaterial({ color: 0x991b1b }),
      leather:   new THREE.MeshLambertMaterial({ color: 0x451a03 }),
      nose:      new THREE.MeshLambertMaterial({ color: 0x1c120e }),
      ivory:     new THREE.MeshLambertMaterial({ color: 0xfef3c7 }),
      clawDark:  new THREE.MeshLambertMaterial({ color: 0x1e1b18 }),
      eyeGlow:   new THREE.MeshBasicMaterial({ color: 0xffd000 }),
      pupil:     new THREE.MeshBasicMaterial({ color: 0x140600 }),
      tongue:    new THREE.MeshLambertMaterial({ color: 0xe11d48 }),
      cape:      new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: createVoxelCapeTexture('#991b1b', '#7f1d1d', '#fbbf24'),
        side: THREE.DoubleSide,
        flatShading: true
      })
    };

    // Helper tunggal pembuat Balok Voxel (100% BoxGeometry)
    const vox = (w, h, d, mat, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      if (rx || ry || rz) m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    // ------------------------------------------------------------------------
    // 1. HIPS / PELVIS VOXEL (Y = 0.86)
    // ------------------------------------------------------------------------
    const hips = new THREE.Group();
    hips.position.set(0, 0.86, 0);
    mesh.add(hips);

    // Blok pinggul dasar
    hips.add(vox(0.42, 0.16, 0.30, mats.leather, 0, 0, 0));

    // Grup Sabuk, Tabard & Tassets Default (disembunyikan saat memakai pants/waist Player)
    const defaultPelvisGroup = new THREE.Group();
    hips.add(defaultPelvisGroup);

    defaultPelvisGroup.add(
      vox(0.45, 0.08, 0.33, mats.goldDark, 0, 0.03, 0),
      // Gesper Kepala Singa Voxel di Tengah Sabuk
      vox(0.13, 0.12, 0.05, mats.gold, 0, 0.03, 0.165),
      vox(0.06, 0.06, 0.06, mats.crimson, 0, 0.03, 0.175),
      // Tabard kain merah kerajaan menjuntai di depan
      vox(0.16, 0.30, 0.03, mats.crimson, 0, -0.16, 0.165, 0.05, 0, 0),
      vox(0.18, 0.04, 0.035, mats.gold, 0, -0.30, 0.172)
    );

    // Pelindung Paha Samping (Voxel Tassets Kiri & Kanan)
    for (let s of [-1, 1]) {
      defaultPelvisGroup.add(
        vox(0.08, 0.20, 0.28, mats.gold, s * 0.23, -0.09, 0, 0, 0, s * -0.14),
        vox(0.09, 0.04, 0.29, mats.goldDark, s * 0.24, -0.17, 0, 0, 0, s * -0.14)
      );
    }

    // Mount Sabuk/Waist dari ArmorManager.buildPants().waist
    // Dikalibrasi agar tepat membungkus pinggul (y = 0.04..0.14 di ArmorManager -> -0.07..+0.03 di hips)
    const waistMount = new THREE.Group();
    waistMount.position.set(0, -0.11, 0);
    waistMount.scale.set(0.92, 0.95, 0.94);
    hips.add(waistMount);

    // ------------------------------------------------------------------------
    // 2. SPINE / TORSO VOXEL BEROTOT & CUIRASS SINGA EMAS
    // ------------------------------------------------------------------------
    const spine = new THREE.Group();
    spine.position.set(0, 0.08, 0);
    hips.add(spine);

    // Badan dasar Voxel (Perut ramping, dada bidang V-Taper)
    spine.add(
      vox(0.42, 0.20, 0.28, mats.fur, 0, 0.10, 0),
      vox(0.52, 0.32, 0.32, mats.fur, 0, 0.34, 0.01)
    );

    // Grup Armor Dada Default Voxel (disembunyikan saat memakai chestplate Player)
    const defaultChestGroup = new THREE.Group();
    spine.add(defaultChestGroup);

    defaultChestGroup.add(
      // Pelat Perut Voxel Beruas
      vox(0.45, 0.10, 0.31, mats.steel, 0, 0.09, 0.005),
      vox(0.48, 0.10, 0.33, mats.goldDark, 0, 0.18, 0.008),
      // Pelat Dada Utama (Voxel Breastplate)
      vox(0.56, 0.30, 0.35, mats.gold, 0, 0.34, 0.01),
      // Otot Dada Pectoral Voxel Kiri & Kanan
      vox(0.23, 0.18, 0.06, mats.gold, -0.13, 0.37, 0.175),
      vox(0.23, 0.18, 0.06, mats.gold, 0.13, 0.37, 0.175),
      // Relief Emblem Singa Voxel di Tengah Dada
      vox(0.14, 0.14, 0.05, mats.goldDark, 0, 0.36, 0.19),
      vox(0.07, 0.07, 0.06, mats.crimson, 0, 0.36, 0.205),
      // Kerah Pelindung Leher (Voxel Gorget) & Kaitan Jubah Belakang
      vox(0.36, 0.06, 0.28, mats.goldDark, 0, 0.50, 0.01),
      vox(0.08, 0.08, 0.06, mats.gold, -0.21, 0.45, -0.17),
      vox(0.08, 0.08, 0.06, mats.gold, 0.21, 0.45, -0.17)
    );

    // Mount Chestplate dari ArmorManager.buildChestplate()
    // Dikalibrasi: ArmorManager chest (y = 0.16..0.72) -> tepat menutupi spine (y = -0.02..0.51)
    const chestMount = new THREE.Group();
    chestMount.position.set(0, -0.17, 0.005);
    chestMount.scale.set(0.98, 0.95, 0.96);
    spine.add(chestMount);

    // Anchor titik kaitan jubah 10-face di punggung atas
    const capePinAnchorL = new THREE.Object3D();
    capePinAnchorL.position.set(-0.22, 0.46, -0.19);
    const capePinAnchorR = new THREE.Object3D();
    capePinAnchorR.position.set(0.22, 0.46, -0.19);
    spine.add(capePinAnchorL, capePinAnchorR);

    // ------------------------------------------------------------------------
    // 3. LEHER, KEPALA SINGA VOXEL, RAHANG BERENGSEL & SURAI VOXEL 3-LAPIS
    // ------------------------------------------------------------------------
    const neck = new THREE.Group();
    neck.position.set(0, 0.52, 0.01);
    spine.add(neck);
    neck.add(vox(0.28, 0.14, 0.26, mats.furDark, 0, 0.04, 0));

    const head = new THREE.Group();
    head.position.set(0, 0.10, 0.02);
    neck.add(head);

    // Blok Tengkorak Utama & Tulang Pipi Voxel (pusat y = 0.14, atas y = 0.33)
    head.add(
      vox(0.40, 0.38, 0.38, mats.fur, 0, 0.14, 0),
      vox(0.46, 0.20, 0.28, mats.furLight, 0, 0.08, 0.03), // Pipi kiri-kanan melebar
      vox(0.34, 0.06, 0.10, mats.furDark, 0, 0.26, 0.17),  // Alis tengah
      vox(0.15, 0.06, 0.12, mats.furLight, -0.12, 0.27, 0.18, 0, 0, -0.18), // Alis kiri
      vox(0.15, 0.06, 0.12, mats.furLight, 0.12, 0.27, 0.18, 0, 0, 0.18)    // Alis kanan
    );

    // Mata Voxel Bersinar + Pupil Vertikal Hitam
    for (let s of [-1, 1]) {
      head.add(
        vox(0.10, 0.07, 0.04, mats.nose, s * 0.11, 0.19, 0.185),
        vox(0.08, 0.055, 0.045, mats.eyeGlow, s * 0.11, 0.19, 0.192),
        vox(0.025, 0.055, 0.05, mats.pupil, s * 0.11, 0.19, 0.196)
      );
    }

    // Grup Moncong, Hidung, Taring Atas & Kumis (disembunyikan hanya saat memakai Helm Full-Face)
    const snoutGroup = new THREE.Group();
    head.add(snoutGroup);

    snoutGroup.add(
      vox(0.14, 0.10, 0.18, mats.fur, 0, 0.15, 0.24, 0.22, 0, 0),      // Batang hidung
      vox(0.26, 0.12, 0.18, mats.furLight, 0, 0.08, 0.25),             // Moncong atas
      vox(0.30, 0.09, 0.14, mats.furLight, 0, 0.07, 0.27),             // Bantalan kumis
      vox(0.10, 0.06, 0.07, mats.nose, 0, 0.13, 0.33),                 // Hidung hitam voxel
      vox(0.035, 0.05, 0.03, mats.nose, 0, 0.09, 0.34),                // Philtrum (garis bibir)
      // Taring Atas Voxel Kiri & Kanan + Gigi Seri
      vox(0.038, 0.075, 0.038, mats.ivory, -0.09, 0.005, 0.31),
      vox(0.038, 0.075, 0.038, mats.ivory, 0.09, 0.005, 0.31),
      vox(0.12, 0.03, 0.03, mats.ivory, 0, 0.015, 0.32)
    );

    // Kumis Singa Voxel (Whisker Bars)
    for (let s of [-1, 1]) {
      snoutGroup.add(
        vox(0.12, 0.016, 0.016, mats.ivory, s * 0.19, 0.08, 0.29, 0, s * -0.25, s * -0.10),
        vox(0.11, 0.016, 0.016, mats.ivory, s * 0.18, 0.05, 0.28, 0, s * -0.25, s * -0.22)
      );
    }

    // Rahang Bawah Voxel Berengsel (Jaw Pivot)
    const jaw = new THREE.Group();
    jaw.position.set(0, 0.02, 0.14);
    head.add(jaw);

    jaw.add(
      vox(0.22, 0.07, 0.19, mats.fur, 0, -0.03, 0.08),
      vox(0.18, 0.08, 0.14, mats.furLight, 0, -0.07, 0.11), // Janggut dagu voxel
      vox(0.12, 0.025, 0.14, mats.tongue, 0, 0.01, 0.09),   // Lidah
      vox(0.032, 0.055, 0.032, mats.ivory, -0.07, 0.025, 0.15), // Taring bawah kiri
      vox(0.032, 0.055, 0.032, mats.ivory, 0.07, 0.025, 0.15)   // Taring bawah kanan
    );

    // Telinga Singa Voxel (EarL & EarR)
    const createVoxelEar = (side) => {
      const ear = new THREE.Group();
      ear.position.set(side * 0.20, 0.31, -0.02);
      ear.add(
        vox(0.11, 0.13, 0.07, mats.fur, 0, 0.05, 0, 0, 0, side * -0.22),
        vox(0.06, 0.08, 0.04, mats.furLight, 0, 0.05, 0.025, 0, 0, side * -0.22),
        vox(0.09, 0.04, 0.07, mats.maneDark, side * 0.01, 0.12, 0, 0, 0, side * -0.22)
      );
      return ear;
    };
    const earL = createVoxelEar(-1);
    const earR = createVoxelEar(1);
    head.add(earL, earR);

    // SURAI SINGA VOXEL BERLAPIS (Multi-Block Layered Voxel Mane)
    const maneGroup = new THREE.Group();
    head.add(maneGroup);

    // Bagian surai atas & pelipis samping yang otomatis disembunyikan saat memakai Helm Player
    const maneHelmHideGroup = new THREE.Group();
    maneGroup.add(maneHelmHideGroup);

    maneHelmHideGroup.add(
      // Mahkota Atas Bertingkat
      vox(0.50, 0.14, 0.44, mats.maneGold, 0, 0.35, -0.03),
      vox(0.58, 0.14, 0.48, mats.maneMid, 0, 0.41, -0.06),
      vox(0.46, 0.10, 0.42, mats.maneDark, 0, 0.48, -0.09),
      // Surai Samping Membingkai Wajah (Kiri & Kanan)
      vox(0.14, 0.44, 0.40, mats.maneGold, -0.25, 0.15, -0.02, 0, 0, 0.08),
      vox(0.14, 0.44, 0.40, mats.maneGold, 0.25, 0.15, -0.02, 0, 0, -0.08),
      vox(0.14, 0.50, 0.44, mats.maneMid, -0.32, 0.13, -0.07, 0, 0, 0.14),
      vox(0.14, 0.50, 0.44, mats.maneMid, 0.32, 0.13, -0.07, 0, 0, -0.14),
      vox(0.12, 0.42, 0.38, mats.maneDark, -0.37, 0.10, -0.12, 0, 0, 0.20),
      vox(0.12, 0.42, 0.38, mats.maneDark, 0.37, 0.10, -0.12, 0, 0, -0.20),
      // Surai Belakang Atas
      vox(0.56, 0.52, 0.22, mats.maneMid, 0, 0.14, -0.22)
    );

    // Bagian surai tengkuk bawah, dada depan & kepang tempur yang tetap tergerai gagah
    maneGroup.add(
      vox(0.62, 0.36, 0.20, mats.maneDark, 0, 0.02, -0.30),
      vox(0.48, 0.36, 0.18, mats.maneDark, 0, -0.12, -0.26),
      // Jambul Surai Leher/Dada Depan
      vox(0.34, 0.22, 0.16, mats.maneGold, 0, -0.10, 0.10),
      vox(0.24, 0.20, 0.14, mats.maneMid, 0, -0.22, 0.12)
    );

    // 2 Kepang Tempur Voxel di Sisi Dada dengan Cincin Emas
    for (let s of [-1, 1]) {
      maneGroup.add(
        vox(0.10, 0.28, 0.10, mats.maneDark, s * 0.22, -0.14, 0.10, 0.12, 0, s * 0.08),
        vox(0.12, 0.04, 0.12, mats.gold, s * 0.225, -0.10, 0.105),
        vox(0.11, 0.04, 0.11, mats.gold, s * 0.23, -0.22, 0.115),
        vox(0.08, 0.09, 0.08, mats.maneGold, s * 0.235, -0.30, 0.12)
      );
    }

    // Mahkota Diadem Singa Emas Voxel Default
    const defaultHelmGroup = new THREE.Group();
    defaultHelmGroup.add(
      vox(0.44, 0.06, 0.42, mats.gold, 0, 0.31, 0.02),
      vox(0.10, 0.14, 0.06, mats.gold, 0, 0.37, 0.22),
      vox(0.06, 0.10, 0.05, mats.goldDark, -0.14, 0.35, 0.21),
      vox(0.06, 0.10, 0.05, mats.goldDark, 0.14, 0.35, 0.21),
      vox(0.05, 0.05, 0.06, mats.crimson, 0, 0.35, 0.235)
    );
    head.add(defaultHelmGroup);

    // Mount Helm dari ArmorManager.buildHelmet()
    // Dikalibrasi: Tengkorak Player berpusat di y = 0.225, sedangkan Tengkorak Singa di y = 0.14 (selisih -0.085)
    const helmMount = new THREE.Group();
    helmMount.position.set(0, -0.085, 0);
    helmMount.scale.set(1.03, 1.03, 1.03);
    head.add(helmMount);

    // ------------------------------------------------------------------------
    // 4. LENGAN VOXEL 2-SENDI (SHOULDER -> ELBOW -> WRIST BERCAKAR)
    // ------------------------------------------------------------------------
    function createVoxelArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.37, 0.42, 0);
      spine.add(shoulder);

      // Pauldron Bahu Voxel Bertingkat Default (disembunyikan saat memakai Pauldron Player)
      const pauldronGroup = new THREE.Group();
      pauldronGroup.add(
        vox(0.26, 0.16, 0.32, mats.gold, side * 0.04, 0.05, 0, 0, 0, side * -0.18),
        vox(0.28, 0.07, 0.34, mats.goldDark, side * 0.05, -0.02, 0, 0, 0, side * -0.18),
        vox(0.18, 0.08, 0.24, mats.crimson, side * 0.03, 0.12, 0, 0, 0, side * -0.18),
        // Duri Bahu Voxel
        vox(0.06, 0.12, 0.06, mats.ivory, side * 0.12, 0.16, 0, 0, 0, side * -0.45)
      );
      shoulder.add(pauldronGroup);

      // Mount Pauldron dari ArmorManager.buildPauldron()
      // Di-mirror pada sumbu X untuk bahu kiri (side = -1) agar ornamen bahu menghadap keluar
      const pauldronMount = new THREE.Group();
      pauldronMount.position.set(side * 0.03, 0.03, 0);
      pauldronMount.scale.set(side < 0 ? -0.96 : 0.96, 0.96, 0.96);
      shoulder.add(pauldronMount);

      // Lengan Atas Voxel (Bicep)
      shoulder.add(
        vox(0.17, 0.26, 0.17, mats.fur, side * 0.02, -0.14, 0),
        vox(0.19, 0.05, 0.19, mats.goldDark, side * 0.02, -0.16, 0)
      );

      // Sendi Siku Voxel (Elbow)
      const elbow = new THREE.Group();
      elbow.position.set(side * 0.02, -0.27, 0);
      shoulder.add(elbow);

      // Lengan Bawah & Vambrace Voxel
      elbow.add(
        vox(0.15, 0.08, 0.15, mats.goldDark, 0, 0, 0),
        vox(0.16, 0.24, 0.16, mats.fur, 0, -0.13, 0),
        vox(0.18, 0.18, 0.18, mats.gold, 0, -0.13, 0.005),
        vox(0.05, 0.19, 0.06, mats.goldDark, side * 0.08, -0.13, 0)
      );

      // Pergelangan & Tangan Bercakar Voxel (Wrist & Hand)
      const wrist = new THREE.Group();
      wrist.position.set(0, -0.25, 0);
      elbow.add(wrist);

      wrist.add(
        vox(0.16, 0.10, 0.16, mats.furDark, 0, -0.04, 0.01),
        vox(0.17, 0.08, 0.06, mats.gold, 0, -0.035, -0.06)
      );

      // 4 Jari & Cakar Voxel Tajam + Ibu Jari
      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.036;
        wrist.add(
          vox(0.028, 0.055, 0.032, mats.fur, fx, -0.10, 0.04, 0.30, 0, 0),
          vox(0.022, 0.045, 0.024, mats.clawDark, fx, -0.13, 0.06, 0.65, 0, 0)
        );
      }
      wrist.add(
        vox(0.032, 0.05, 0.032, mats.fur, side * -0.08, -0.06, 0.05, 0.3, 0, side * 0.4)
      );

      return { shoulder, elbow, wrist, pauldronGroup, pauldronMount };
    }

    const armL = createVoxelArm(-1);
    const armR = createVoxelArm(1);

    // Mount Senjata di Genggaman Tangan Kanan
    const weaponMount = new THREE.Group();
    weaponMount.position.set(0, -0.06, 0.03);
    armR.wrist.add(weaponMount);

    // ------------------------------------------------------------------------
    // 5. KAKI VOXEL 2-SENDI & PAW BERCAKAR (HIP -> KNEE -> ANKLE)
    // ------------------------------------------------------------------------
    function createVoxelLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.17, -0.06, 0);
      hips.add(hip);

      // Paha Voxel Dasar
      hip.add(vox(0.21, 0.36, 0.21, mats.fur, 0, -0.18, 0));

      // Pelat Pelindung Paha Default (disembunyikan saat memakai celana/greaves Player)
      const defaultThighGroup = new THREE.Group();
      defaultThighGroup.add(vox(0.23, 0.22, 0.12, mats.gold, 0, -0.16, 0.06));
      hip.add(defaultThighGroup);

      // Mount Celana Paha dari ArmorManager.buildPants().legL / legR
      const legMount = new THREE.Group();
      legMount.position.set(0, -0.02, 0);
      legMount.scale.set(0.96, 1.08, 0.96);
      hip.add(legMount);

      // Sendi Lutut Voxel (Knee)
      const knee = new THREE.Group();
      knee.position.set(0, -0.36, 0);
      hip.add(knee);

      // Betis Voxel Dasar
      knee.add(vox(0.17, 0.36, 0.18, mats.fur, 0, -0.18, -0.01));

      // Pelindung Lutut & Greave Default (disembunyikan saat memakai boots Player)
      const defaultBootGroup = new THREE.Group();
      defaultBootGroup.add(
        vox(0.16, 0.13, 0.08, mats.gold, 0, 0.01, 0.10),
        vox(0.08, 0.08, 0.09, mats.goldDark, 0, 0.01, 0.11),
        vox(0.19, 0.28, 0.20, mats.gold, 0, -0.18, 0),
        vox(0.06, 0.29, 0.05, mats.goldDark, 0, -0.18, 0.095)
      );

      // Mount Sepatu dari ArmorManager.buildBoots()
      // Dikalibrasi agar menutupi betis (y = 0) hingga telapak tanah (y = -0.44)
      const bootMount = new THREE.Group();
      bootMount.position.set(0, -0.02, 0);
      bootMount.scale.set(0.96, 1.04, 0.96);
      knee.add(defaultBootGroup, bootMount);

      // Pergelangan Kaki & Telapak Cakar Singa Voxel (Ankle & Paw)
      const ankle = new THREE.Group();
      ankle.position.set(0, -0.36, 0);
      knee.add(ankle);

      ankle.add(
        vox(0.21, 0.09, 0.26, mats.goldDark, 0, -0.03, 0.05),
        vox(0.19, 0.07, 0.12, mats.fur, 0, -0.04, 0.14)
      );

      for (let t = 0; t < 4; t++) {
        const tx = (t - 1.5) * 0.044;
        ankle.add(
          vox(0.036, 0.055, 0.07, mats.furLight, tx, -0.045, 0.18),
          vox(0.024, 0.04, 0.05, mats.clawDark, tx, -0.052, 0.225, 0.35, 0, 0)
        );
      }

      return { hip, knee, ankle, defaultThighGroup, legMount, defaultBootGroup, bootMount };
    }

    const legL = createVoxelLeg(-1);
    const legR = createVoxelLeg(1);

    // ------------------------------------------------------------------------
    // 6. EKOR SINGA VOXEL 3-SEGMEN (tailBase -> tailMid -> tailTip)
    // ------------------------------------------------------------------------
    const tailBase = new THREE.Group();
    tailBase.position.set(0, -0.02, -0.16);
    hips.add(tailBase);
    tailBase.add(vox(0.07, 0.28, 0.07, mats.fur, 0, -0.12, -0.05, -0.42, 0, 0));

    const tailMid = new THREE.Group();
    tailMid.position.set(0, -0.23, -0.11);
    tailBase.add(tailMid);
    tailMid.add(vox(0.06, 0.26, 0.06, mats.fur, 0, -0.11, -0.05, -0.32, 0, 0));

    const tailTip = new THREE.Group();
    tailTip.position.set(0, -0.21, -0.10);
    tailMid.add(tailTip);
    tailTip.add(
      vox(0.05, 0.18, 0.05, mats.furDark, 0, -0.08, -0.03, -0.18, 0, 0),
      // Ujung Jambul Ekor Voxel Bertumpuk
      vox(0.11, 0.14, 0.11, mats.maneDark, 0, -0.19, -0.05),
      vox(0.08, 0.09, 0.08, mats.maneMid, 0, -0.27, -0.06)
    );

    // ------------------------------------------------------------------------
    // 7. JUBAH PHYSICS CLOTH 10-FACE
    // ------------------------------------------------------------------------
    const physicsCape = createPhysicsCape10(mats.cape);
    mesh.add(physicsCape.mesh);

    // ------------------------------------------------------------------------
    // 8. PEDANG VOXEL PUSAKA SINGA EMAS + SLASH TRAIL
    // ------------------------------------------------------------------------
    const defaultWeapon = buildVoxelSword('default');
    weaponMount.add(defaultWeapon);

    // Efek Jejak Tebasan (Slash Trail)
    const trailGeo = new THREE.RingGeometry(0.52, 1.36, 12, 1, -Math.PI * 0.45, Math.PI * 0.85);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const slashTrail = new THREE.Mesh(trailGeo, trailMat);
    slashTrail.position.set(0, 0, 0.12);
    slashTrail.rotation.y = Math.PI / 2;
    weaponMount.add(slashTrail);

    // Ring Gelombang Auman
    const roarRing = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.38, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    roarRing.rotation.x = Math.PI / 2;
    roarRing.position.set(0, 1.35, 0.25);
    mesh.add(roarRing);

    const parts = {
      body: hips,
      bodyY: 0.86,
      hips,
      spine,
      torso: spine,
      neck,
      head,
      snoutGroup,
      jaw,
      earL,
      earR,
      maneGroup,
      maneHelmHideGroup,
      armL: armL.shoulder,
      forearmL: armL.elbow,
      wristL: armL.wrist,
      pauldronL: armL.pauldronGroup,
      pauldronMountL: armL.pauldronMount,
      armR: armR.shoulder,
      forearmR: armR.elbow,
      wristR: armR.wrist,
      pauldronR: armR.pauldronGroup,
      pauldronMountR: armR.pauldronMount,
      legs: [legL.hip, legR.hip],
      legL: legL.hip,
      shinL: legL.knee,
      ankleL: legL.ankle,
      legR: legR.hip,
      shinR: legR.knee,
      ankleR: legR.ankle,
      tail: tailBase,
      tailBase,
      tailMid,
      tailTip,
      cape: physicsCape.mesh,
      physicsCape,
      capePinAnchorL,
      capePinAnchorR,
      weaponMount,
      defaultWeapon,
      sword: defaultWeapon,
      slashTrail,
      roarRing,
      defaultHelmGroup,
      defaultChestGroup,
      defaultPelvisGroup,
      defaultThighGroupL: legL.defaultThighGroup,
      defaultThighGroupR: legR.defaultThighGroup,
      defaultBootGroupL: legL.defaultBootGroup,
      defaultBootGroupR: legR.defaultBootGroup,
      helmMount,
      chestMount,
      waistMount,
      legMountL: legL.legMount,
      legMountR: legR.legMount,
      bootMountL: legL.bootMount,
      bootMountR: legR.bootMount,
      mats,
      rare: { kind: 'lion' }
    };

    return { mesh, parts };
  }

  // ==========================================================================
  // REFRESH GEAR: PASANG ARMOR & PEDANG MILIK PLAYER SECARA PRESISI
  // ==========================================================================
  function refreshGear(npc) {
    if (!npc || !npc.parts) return;
    const p = npc.parts;
    const gear = npc.gear || {};

    // ------------------------------------------------------------------------
    // 1. UPDATE SENJATA (15 Pedang WeaponManager + Rotasi Identik Player)
    // ------------------------------------------------------------------------
    clearGroup(p.weaponMount);
    if (p.slashTrail) p.weaponMount.add(p.slashTrail);

    let customWeapon = null;
    if (gear.weapon) {
      try {
        if (typeof WeaponManager !== 'undefined' && typeof WeaponManager.buildWeapon === 'function') {
          customWeapon = WeaponManager.buildWeapon(gear.weapon);
        } else if (typeof SwordModels !== 'undefined' && typeof SwordModels.buildFor === 'function') {
          customWeapon = SwordModels.buildFor(gear.weapon);
        }
      } catch (e) {
        customWeapon = null;
      }
      if (!customWeapon) {
        customWeapon = buildVoxelSword(gear.weapon);
      }
      // Normalisasi posisi grip tepat di pusat kepalan (weaponMount) & rotasi identik Player
      customWeapon.position.set(0, 0, 0);
      customWeapon.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      p.weaponMount.add(customWeapon);
      p.sword = customWeapon;
    } else {
      p.defaultWeapon.position.set(0, 0, 0);
      p.defaultWeapon.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      p.weaponMount.add(p.defaultWeapon);
      p.sword = p.defaultWeapon;
    }

    // ------------------------------------------------------------------------
    // 2. BERSIHKAN MOUNT ARMOR CUSTOM
    // ------------------------------------------------------------------------
    clearGroup(p.helmMount);
    clearGroup(p.chestMount);
    clearGroup(p.pauldronMountL);
    clearGroup(p.pauldronMountR);
    clearGroup(p.waistMount);
    clearGroup(p.legMountL);
    clearGroup(p.legMountR);
    clearGroup(p.bootMountL);
    clearGroup(p.bootMountR);

    let hasHelm = false;
    let isFullFace = false;
    let hasChest = false;
    let hasPants = false;
    let hasBoots = false;
    let activeThemeKey = null;

    // --- A. HELM ---
    if (gear.helm) {
      const set = resolveArmorSet(gear.helm);
      if (set && typeof set.buildHelmet === 'function') {
        hasHelm = true;
        isFullFace = !!FULL_FACE_SETS[set.id];
        activeThemeKey = activeThemeKey || set.id;
        p.helmMount.add(set.buildHelmet(gear.helm));
      }
    }

    // --- B. CHESTPLATE & PAULDRONS ---
    if (gear.chest) {
      const set = resolveArmorSet(gear.chest);
      if (set && typeof set.buildChestplate === 'function') {
        hasChest = true;
        activeThemeKey = set.id || activeThemeKey;
        p.chestMount.add(set.buildChestplate(gear.chest));
        if (typeof set.buildPauldron === 'function') {
          p.pauldronMountL.add(set.buildPauldron());
          p.pauldronMountR.add(set.buildPauldron());
        }
      }
    }

    // --- C. BOOTS, GREAVES & WAIST/PANTS ---
    if (gear.boots) {
      const set = resolveArmorSet(gear.boots);
      if (set) {
        activeThemeKey = activeThemeKey || set.id;
        if (typeof set.buildBoots === 'function') {
          hasBoots = true;
          p.bootMountL.add(set.buildBoots(gear.boots));
          p.bootMountR.add(set.buildBoots(gear.boots));
        }
        if (typeof set.buildPants === 'function') {
          const pants = set.buildPants();
          if (pants) {
            hasPants = true;
            if (pants.waist) p.waistMount.add(pants.waist);
            // legL di Lion Warrior berada di x = -0.17 (sisi luar -X -> pakai pants.legR),
            // legR berada di x = +0.17 (sisi luar +X -> pakai pants.legL)
            if (pants.legR) p.legMountL.add(pants.legR);
            if (pants.legL) p.legMountR.add(pants.legL);
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. TOGGLE VISIBILITAS BAGIAN DEFAULT AGAR TIDAK BENTROK / CLIPPING
    // ------------------------------------------------------------------------
    if (p.defaultHelmGroup)  p.defaultHelmGroup.visible  = !hasHelm;
    if (p.maneHelmHideGroup) p.maneHelmHideGroup.visible = !hasHelm;
    if (p.earL)              p.earL.visible              = !hasHelm;
    if (p.earR)              p.earR.visible              = !hasHelm;
    if (p.snoutGroup)        p.snoutGroup.visible        = !(hasHelm && isFullFace);
    if (p.jaw)               p.jaw.visible               = !(hasHelm && isFullFace);

    if (p.defaultChestGroup) p.defaultChestGroup.visible = !hasChest;
    if (p.pauldronL)         p.pauldronL.visible         = !hasChest;
    if (p.pauldronR)         p.pauldronR.visible         = !hasChest;

    if (p.defaultPelvisGroup) p.defaultPelvisGroup.visible = !hasPants;
    if (p.defaultThighGroupL) p.defaultThighGroupL.visible = !hasPants;
    if (p.defaultThighGroupR) p.defaultThighGroupR.visible = !hasPants;

    if (p.defaultBootGroupL) p.defaultBootGroupL.visible = !hasBoots;
    if (p.defaultBootGroupR) p.defaultBootGroupR.visible = !hasBoots;
    if (p.ankleL)            p.ankleL.visible            = !hasBoots;
    if (p.ankleR)            p.ankleR.visible            = !hasBoots;

    // ------------------------------------------------------------------------
    // 4. SINKRONISASI WARNA BRACER & JUBAH 10-FACE DENGAN TEMA ARMOR AKTIF
    // ------------------------------------------------------------------------
    const rawKey = activeThemeKey || resolveArmorQuery(gear.chest || gear.helm || gear.boots);
    const theme = (rawKey && ARMOR_THEMES[rawKey]) ? ARMOR_THEMES[rawKey] : null;
    if (theme) {
      p.mats.gold.color.setHex(theme.primary);
      p.mats.goldDark.color.setHex(theme.secondary);
      const tex = createVoxelCapeTexture(theme.cape, theme.dark, theme.trim);
      if (tex) {
        p.mats.cape.map = tex;
        p.mats.cape.needsUpdate = true;
      }
    } else {
      p.mats.gold.color.setHex(0xf5bd33);
      p.mats.goldDark.color.setHex(0xb87d14);
      const tex = createVoxelCapeTexture('#991b1b', '#7f1d1d', '#fbbf24');
      if (tex) {
        p.mats.cape.map = tex;
        p.mats.cape.needsUpdate = true;
      }
    }
  }

  // ==========================================================================
  // ANIMATOR UTAMA (SMOOTH DAMPING + JEDA SERANGAN 0.50 DETIK SEBELUM STRIKE)
  // ==========================================================================
  function animateLionKnight(npc, dt) {
    if (!npc || !npc.parts) return;
    const p = npc.parts;
    dt = clamp(dt || 0.016, 0.001, 0.05);

    // Cooldown skill Auman Singa
    const lk = npc.lion || (npc.lion = { roarCd: 0 });
    lk.roarCd = Math.max(0, lk.roarCd - dt);

    // Deteksi otomatis perubahan equipment (senjata / helm / chest / boots)
    const gObj = npc.gear || {};
    const gearSig = `${gObj.weapon || ''}|${gObj.helm || ''}|${gObj.chest || ''}|${gObj.boots || ''}`;
    if (npc._lkGearSig !== gearSig) {
      npc._lkGearSig = gearSig;
      refreshGear(npc);
    }

    // Hit-flash merah saat terkena damage
    const em = (npc.flash && npc.flash > 0) ? 0xaa2222 : 0x000000;
    if (npc._lastEm !== em && npc.mesh) {
      npc._lastEm = em;
      npc.mesh.traverse(o => {
        if (o.material && o.material.emissive && (!o.parent || !o.parent.name || o.parent.name.indexOf('Weapon_') !== 0)) {
          o.material.emissive.setHex(em);
        }
      });
    }

    // Bersihkan headAngle sisa obrolan saat sudah selesai bicara agar kepala bebas beranimasi
    if (!npc.talking && npc.headAngle !== undefined) {
      delete npc.headAngle;
    }

    // Bila n.swing dipicu dari luar (misal menebang pohon), mulai _lkAtk otomatis
    if (!npc._lkAtk && !npc.roar && npc.swing && npc.swing > 0) {
      npc._hitIdx = (npc._hitIdx || 0) + 1;
      npc._lkAtk = { t: 0, move: npc._hitIdx % 3, hitDone: true };
    }

    if (npc.roar && npc.retreat) npc.roar = null;

    npc._animTime = (npc._animTime || 0) + dt;
    const time = npc._animTime;

    const target = {
      hipsY: 0.86,
      hipsZ: 0,
      hipsRx: 0,
      hipsRy: 0,
      hipsRz: 0,
      spineRx: 0.03,
      spineRy: 0,
      spineRz: 0,
      headRx: 0,
      headRy: 0,
      headRz: 0,
      jawRx: 0.03,
      earRx: 0,
      earRz: 0,
      armLRx: 0.08,
      armLRy: 0,
      armLRz: 0.15,
      elbowLRx: -0.34,
      wristLRx: 0,
      armRRx: 0.12,
      armRRy: 0,
      armRRz: -0.15,
      elbowRRx: -0.40,
      wristRRx: 0,
      wristRRy: 0,
      wristRRz: 0,
      legLRx: 0,
      legLRz: -0.02,
      kneeLRx: 0.05,
      ankleLRx: -0.05,
      legRRx: 0,
      legRRz: 0.02,
      kneeRRx: 0.05,
      ankleRRx: -0.05,
      tailBaseRx: 0.15,
      tailBaseRy: 0,
      tailMidRx: 0.22,
      tailMidRy: 0,
      tailTipRx: 0.18
    };

    let smoothSpeed = 16;
    const capeImpulse = new THREE.Vector3(0, 0, -0.35);
    const spd = Math.hypot((npc.vel && npc.vel.x) || 0, (npc.vel && npc.vel.z) || 0);
    const isMoving = !!(npc.walking || spd > 0.15);

    // ------------------------------------------------------------------------
    // MODE 1: SERANGAN KOMBO 3-JURUS (JEDA WINDUP TEPAT 0.50 DETIK!)
    // ------------------------------------------------------------------------
    if (npc._lkAtk) {
      npc._lkAtk.t += dt;
      const t = npc._lkAtk.t;
      const move = (npc._lkAtk.move || 0) % 3;

      const WINDUP_DURATION = 0.50; // Jeda wajib 0,5 detik sebelum diluncurkan
      const STRIKE_END = 0.68;      // Tebasan kilat (0.50s - 0.68s)
      const TOTAL_DURATION = 1.12;  // Selesai recovery

      if (t < WINDUP_DURATION) {
        // FASE 1: ANCANG-ANCANG / JEDA 0.5 DETIK (0.00s - 0.50s)
        smoothSpeed = 19;
        const coil = t < 0.34 ? easeOutCubic(t / 0.34) : 1.0 + Math.sin((t - 0.34) * 38) * 0.025;
        const tension = easeInOutSine(t / WINDUP_DURATION);

        target.jawRx = 0.20 * coil;
        target.earRx = -0.42 * coil;
        p.slashTrail.material.opacity = 0;

        if (move === 0) {
          // Jurus 1: Tarik pedang ke kanan-atas belakang
          target.hipsY = 0.86 - 0.09 * coil;
          target.hipsZ = -0.08 * coil;
          target.hipsRy = -0.45 * coil;
          target.spineRx = -0.14 * coil;
          target.spineRy = -0.52 * coil;
          target.headRy = 0.65 * coil;
          target.headRx = 0.10 * coil;

          target.armRRx = -1.72 * coil;
          target.armRRy = -0.42 * coil;
          target.armRRz = -0.75 * coil;
          target.elbowRRx = -1.10 * coil;
          target.wristRRx = -0.32 * coil;

          target.armLRx = 0.42 * coil;
          target.armLRz = 0.52 * coil;
          target.elbowLRx = -0.60 * coil;

          target.legLRx = -0.30 * coil;
          target.kneeLRx = 0.50 * coil;
          target.ankleLRx = -0.20 * coil;
          target.legRRx = 0.28 * coil;
          target.kneeRRx = 0.30 * coil;
          target.ankleRRx = -0.40 * coil;
        } else if (move === 1) {
          // Jurus 2: Tarik pedang menyilang ke sisi kiri
          target.hipsY = 0.86 - 0.10 * coil;
          target.hipsZ = -0.07 * coil;
          target.hipsRy = 0.50 * coil;
          target.spineRx = 0.15 * coil;
          target.spineRy = 0.60 * coil;
          target.headRy = -0.72 * coil;

          target.armRRx = 0.32 * coil;
          target.armRRy = 0.82 * coil;
          target.armRRz = 0.48 * coil;
          target.elbowRRx = -1.20 * coil;
          target.wristRRz = 0.42 * coil;

          target.armLRx = -0.60 * coil;
          target.armLRz = 0.65 * coil;
          target.elbowLRx = -0.45 * coil;

          target.legLRx = 0.25 * coil;
          target.kneeLRx = 0.35 * coil;
          target.legRRx = -0.34 * coil;
          target.kneeRRx = 0.52 * coil;
        } else {
          // Jurus 3: Angkat tinggi di atas kepala (Overhead Cleave Windup)
          target.hipsY = 0.86 - 0.13 * coil;
          target.hipsZ = -0.10 * coil;
          target.spineRx = -0.30 * coil;
          target.headRx = 0.26 * coil;
          target.jawRx = 0.38 * tension;

          target.armRRx = -2.30 * coil;
          target.armRRz = -0.20 * coil;
          target.elbowRRx = -0.52 * coil;
          target.wristRRx = -0.42 * coil;

          target.armLRx = -1.90 * coil;
          target.armLRz = 0.26 * coil;
          target.elbowLRx = -0.48 * coil;

          target.legLRx = -0.40 * coil;
          target.kneeLRx = 0.65 * coil;
          target.legRRx = 0.28 * coil;
          target.kneeRRx = 0.45 * coil;
        }

        capeImpulse.set(0, 0.2, 0.8 * coil);
      } else if (t < STRIKE_END) {
        // FASE 2: SERANGAN DILUNCURKAN (Dimulai tepat pada 0.50 detik!)
        smoothSpeed = 40;
        const u = (t - WINDUP_DURATION) / (STRIKE_END - WINDUP_DURATION);
        const strike = easeOutExpo(u);

        p.slashTrail.material.opacity = Math.sin(u * Math.PI) * 0.80;
        target.jawRx = 0.45;
        target.earRx = -0.52;

        if (move === 0) {
          target.hipsY = 0.76;
          target.hipsZ = 0.20 * strike;
          target.hipsRy = lerp(-0.45, 0.56, strike);
          target.spineRx = lerp(-0.14, 0.25, strike);
          target.spineRy = lerp(-0.52, 0.66, strike);
          target.headRy = lerp(0.65, -0.52, strike);

          target.armRRx = lerp(-1.72, 0.70, strike);
          target.armRRy = lerp(-0.42, 0.62, strike);
          target.armRRz = lerp(-0.75, 0.40, strike);
          target.elbowRRx = lerp(-1.10, -0.12, strike);
          target.wristRRx = lerp(-0.32, 0.52, strike);

          target.armLRx = -0.52 * strike;
          target.armLRz = 0.82 * strike;

          target.legLRx = -0.50 * strike;
          target.kneeLRx = 0.70 * strike;
          target.ankleLRx = -0.20 * strike;
          target.legRRx = 0.46 * strike;
          target.kneeRRx = 0.15 * strike;
          capeImpulse.set(-4.5, 1.2, -5.5);
        } else if (move === 1) {
          target.hipsY = 0.76;
          target.hipsZ = 0.19 * strike;
          target.hipsRy = lerp(0.50, -0.60, strike);
          target.spineRx = 0.22 * strike;
          target.spineRy = lerp(0.60, -0.70, strike);
          target.headRy = lerp(-0.72, 0.56, strike);

          target.armRRx = lerp(0.32, -0.32, strike);
          target.armRRy = lerp(0.82, -0.92, strike);
          target.armRRz = lerp(0.48, -0.85, strike);
          target.elbowRRx = lerp(-1.20, -0.10, strike);
          target.wristRRx = 0.46 * strike;

          target.armLRx = 0.46 * strike;
          target.armLRz = 0.62 * strike;

          target.legLRx = 0.40 * strike;
          target.kneeLRx = 0.20 * strike;
          target.legRRx = -0.48 * strike;
          target.kneeRRx = 0.65 * strike;
          capeImpulse.set(4.5, 1.2, -5.5);
        } else {
          target.hipsY = 0.71;
          target.hipsZ = 0.24 * strike;
          target.spineRx = lerp(-0.30, 0.46, strike);
          target.headRx = lerp(0.26, -0.24, strike);

          target.armRRx = lerp(-2.30, 0.92, strike);
          target.armRRz = -0.10;
          target.elbowRRx = lerp(-0.52, -0.08, strike);
          target.wristRRx = lerp(-0.42, 0.65, strike);

          target.armLRx = lerp(-1.90, 0.52, strike);
          target.armLRz = 0.70 * strike;

          target.legLRx = -0.55 * strike;
          target.kneeLRx = 0.80 * strike;
          target.legRRx = 0.50 * strike;
          target.kneeRRx = 0.18 * strike;
          capeImpulse.set(0, 3.2, -7.0);
        }
      } else if (t < TOTAL_DURATION) {
        // FASE 3: FOLLOW-THROUGH & PEMULIHAN MULUS (0.68s - 1.12s)
        smoothSpeed = 14;
        const r = smootherstep((t - STRIKE_END) / (TOTAL_DURATION - STRIKE_END));
        const hold = 1 - r;
        p.slashTrail.material.opacity = Math.max(0, (1 - r * 3.5) * 0.35);

        if (move === 0) {
          target.hipsY = lerp(0.86, 0.76, hold);
          target.hipsZ = 0.20 * hold;
          target.hipsRy = 0.56 * hold;
          target.spineRx = 0.25 * hold;
          target.spineRy = 0.66 * hold;
          target.armRRx = lerp(0.12, 0.70, hold);
          target.armRRy = 0.62 * hold;
          target.armRRz = lerp(-0.15, 0.40, hold);
          target.elbowRRx = lerp(-0.40, -0.12, hold);
          target.wristRRx = 0.52 * hold;
        } else if (move === 1) {
          target.hipsY = lerp(0.86, 0.76, hold);
          target.hipsZ = 0.19 * hold;
          target.hipsRy = -0.60 * hold;
          target.spineRy = -0.70 * hold;
          target.armRRx = lerp(0.12, -0.32, hold);
          target.armRRy = -0.92 * hold;
          target.armRRz = lerp(-0.15, -0.85, hold);
          target.elbowRRx = lerp(-0.40, -0.10, hold);
        } else {
          target.hipsY = lerp(0.86, 0.71, hold);
          target.hipsZ = 0.24 * hold;
          target.spineRx = 0.46 * hold;
          target.armRRx = lerp(0.12, 0.92, hold);
          target.elbowRRx = lerp(-0.40, -0.08, hold);
          target.wristRRx = 0.65 * hold;
        }
      } else {
        p.slashTrail.material.opacity = 0;
        npc._lkAtk = null;
      }
    }
    // ------------------------------------------------------------------------
    // MODE 2: AUMAN SINGA (ROAR DENGAN TARIK NAPAS 0.50 DETIK)
    // ------------------------------------------------------------------------
    else if (npc.roar) {
      npc.roar.t += dt;
      const rt = npc.roar.t;
      p.slashTrail.material.opacity = 0;

      if (rt < 0.50) {
        const c = easeOutCubic(rt / 0.50);
        target.hipsY = 0.86 - 0.08 * c;
        target.spineRx = -0.22 * c;
        target.headRx = -0.30 * c;
        target.jawRx = 0.08 * c;
        target.armLRx = 0.32 * c;
        target.armLRz = 0.24 * c;
        target.armRRx = 0.32 * c;
        target.armRRz = -0.24 * c;
        p.roarRing.material.opacity = 0;
      } else if (rt < 1.35) {
        const u = (rt - 0.50) / 0.85;
        const vib = Math.sin(rt * 48) * 0.04;
        target.hipsY = 0.82;
        target.hipsZ = 0.10;
        target.spineRx = 0.26 + vib * 0.5;
        target.headRx = 0.20 + vib;
        target.jawRx = 0.58 + vib;
        target.earRx = -0.48;

        target.armLRx = -0.42;
        target.armLRz = 0.88;
        target.elbowLRx = -0.25;
        target.armRRx = -0.42;
        target.armRRz = -0.88;
        target.elbowRRx = -0.25;

        target.legLRx = -0.24;
        target.kneeLRx = 0.36;
        target.legRRx = 0.20;
        target.kneeRRx = 0.24;

        const ringScale = 1 + (u * 5.5) % 2.8;
        p.roarRing.scale.set(ringScale, ringScale, 1);
        p.roarRing.material.opacity = Math.max(0, (1 - ((u * 2) % 1)) * 0.55);
        capeImpulse.set(0, 1.8, -6.5);
      } else if (rt < 1.75) {
        p.roarRing.material.opacity = 0;
      } else {
        p.roarRing.material.opacity = 0;
        npc.roar = null;
      }
    }
    // ------------------------------------------------------------------------
    // MODE 3: BERJALAN (WALK) & BERLARI (RUN)
    // ------------------------------------------------------------------------
    else if (isMoving) {
      p.slashTrail.material.opacity = 0;
      p.roarRing.material.opacity = 0;

      const isRun = spd > 3.0;
      const freq = isRun ? 10.5 : 6.4;
      const stride = isRun ? 0.70 : 0.42;
      const ph = time * freq;

      const sinP = Math.sin(ph);
      const cosP = Math.cos(ph);
      const liftL = Math.max(0, cosP);
      const liftR = Math.max(0, -cosP);

      target.hipsY = 0.86 - (isRun ? 0.06 : 0.025) + Math.abs(sinP) * (isRun ? 0.055 : 0.028);
      target.hipsRz = sinP * 0.04;
      target.hipsRy = -sinP * (isRun ? 0.14 : 0.08);

      target.spineRx = isRun ? 0.20 : 0.06;
      target.spineRy = sinP * (isRun ? 0.16 : 0.09);
      target.headRx = isRun ? -0.10 : -0.02;
      target.headRy = -sinP * 0.06;
      target.earRx = isRun ? -0.22 : -0.05;

      target.legLRx = sinP * stride;
      target.kneeLRx = 0.08 + liftL * (isRun ? 0.85 : 0.52);
      target.ankleLRx = -0.06 - liftL * 0.24;

      target.legRRx = -sinP * stride;
      target.kneeRRx = 0.08 + liftR * (isRun ? 0.85 : 0.52);
      target.ankleRRx = -0.06 - liftR * 0.24;

      target.armLRx = -sinP * (isRun ? 0.62 : 0.34);
      target.elbowLRx = isRun ? -0.75 - Math.max(0, sinP) * 0.28 : -0.40;

      target.armRRx = sinP * (isRun ? 0.52 : 0.28) + 0.14;
      target.elbowRRx = isRun ? -0.70 : -0.42;

      capeImpulse.set(sinP * 0.8, isRun ? 0.9 : 0.3, isRun ? -4.8 : -2.2);
    }
    // ------------------------------------------------------------------------
    // MODE 4: DIAM (IDLE BREATHING)
    // ------------------------------------------------------------------------
    else {
      p.slashTrail.material.opacity = 0;
      p.roarRing.material.opacity = 0;

      const breath = Math.sin(time * 2.2);
      const slowGaze = Math.sin(time * 0.85);

      target.hipsY = 0.86 + breath * 0.012;
      target.spineRx = 0.03 + breath * 0.022;
      target.headRx = breath * 0.02;
      target.headRy = slowGaze * 0.10;
      target.jawRx = 0.03 + (breath + 1) * 0.018;

      const earFlick = Math.pow(Math.max(0, Math.sin(time * 1.7)), 12) * 0.20;
      target.earRz = earFlick;

      target.armLRz = 0.15 + breath * 0.022;
      target.armRRz = -0.15 - breath * 0.022;
      target.elbowRRx = -0.40 + breath * 0.03;
    }

    // Ayunan Ekor Voxel 3-Segmen
    const tailFreq = isMoving ? 6.5 : 2.1;
    target.tailBaseRy = Math.sin(time * tailFreq) * 0.25;
    target.tailMidRy = Math.sin(time * tailFreq - 0.8) * 0.32;
    target.tailTipRx = 0.18 + Math.cos(time * tailFreq - 1.4) * 0.24;

    // ------------------------------------------------------------------------
    // INTERPOLASI DAMPING EKSPONENSIAL KE SEMUA SENDI VOXEL
    // ------------------------------------------------------------------------
    p.hips.position.y = damp(p.hips.position.y, target.hipsY, smoothSpeed, dt);
    p.hips.position.z = damp(p.hips.position.z, target.hipsZ, smoothSpeed, dt);
    p.hips.rotation.x = damp(p.hips.rotation.x, target.hipsRx, smoothSpeed, dt);
    p.hips.rotation.y = damp(p.hips.rotation.y, target.hipsRy, smoothSpeed, dt);
    p.hips.rotation.z = damp(p.hips.rotation.z, target.hipsRz, smoothSpeed, dt);

    p.spine.rotation.x = damp(p.spine.rotation.x, target.spineRx, smoothSpeed, dt);
    p.spine.rotation.y = damp(p.spine.rotation.y, target.spineRy, smoothSpeed, dt);
    p.spine.rotation.z = damp(p.spine.rotation.z, target.spineRz, smoothSpeed, dt);

    p.head.rotation.x = damp(p.head.rotation.x, target.headRx, smoothSpeed, dt);
    p.head.rotation.y = damp(p.head.rotation.y, target.headRy, smoothSpeed, dt);
    p.head.rotation.z = damp(p.head.rotation.z, target.headRz, smoothSpeed, dt);

    p.jaw.rotation.x = damp(p.jaw.rotation.x, target.jawRx, smoothSpeed * 1.2, dt);
    p.earL.rotation.x = damp(p.earL.rotation.x, target.earRx, smoothSpeed, dt);
    p.earR.rotation.x = damp(p.earR.rotation.x, target.earRx, smoothSpeed, dt);
    p.earL.rotation.z = damp(p.earL.rotation.z, target.earRz, smoothSpeed, dt);
    p.earR.rotation.z = damp(p.earR.rotation.z, -target.earRz, smoothSpeed, dt);

    p.armL.rotation.x = damp(p.armL.rotation.x, target.armLRx, smoothSpeed, dt);
    p.armL.rotation.y = damp(p.armL.rotation.y, target.armLRy, smoothSpeed, dt);
    p.armL.rotation.z = damp(p.armL.rotation.z, target.armLRz, smoothSpeed, dt);
    p.forearmL.rotation.x = damp(p.forearmL.rotation.x, target.elbowLRx, smoothSpeed, dt);
    p.wristL.rotation.x = damp(p.wristL.rotation.x, target.wristLRx, smoothSpeed, dt);

    p.armR.rotation.x = damp(p.armR.rotation.x, target.armRRx, smoothSpeed, dt);
    p.armR.rotation.y = damp(p.armR.rotation.y, target.armRRy, smoothSpeed, dt);
    p.armR.rotation.z = damp(p.armR.rotation.z, target.armRRz, smoothSpeed, dt);
    p.forearmR.rotation.x = damp(p.forearmR.rotation.x, target.elbowRRx, smoothSpeed, dt);
    p.wristR.rotation.x = damp(p.wristR.rotation.x, target.wristRRx, smoothSpeed, dt);
    p.wristR.rotation.y = damp(p.wristR.rotation.y, target.wristRRy, smoothSpeed, dt);
    p.wristR.rotation.z = damp(p.wristR.rotation.z, target.wristRRz, smoothSpeed, dt);

    p.legL.rotation.x = damp(p.legL.rotation.x, target.legLRx, smoothSpeed, dt);
    p.legL.rotation.z = damp(p.legL.rotation.z, target.legLRz, smoothSpeed, dt);
    p.shinL.rotation.x = damp(p.shinL.rotation.x, target.kneeLRx, smoothSpeed, dt);
    p.ankleL.rotation.x = damp(p.ankleL.rotation.x, target.ankleLRx, smoothSpeed, dt);

    p.legR.rotation.x = damp(p.legR.rotation.x, target.legRRx, smoothSpeed, dt);
    p.legR.rotation.z = damp(p.legR.rotation.z, target.legRRz, smoothSpeed, dt);
    p.shinR.rotation.x = damp(p.shinR.rotation.x, target.kneeRRx, smoothSpeed, dt);
    p.ankleR.rotation.x = damp(p.ankleR.rotation.x, target.ankleRRx, smoothSpeed, dt);

    p.tailBase.rotation.x = damp(p.tailBase.rotation.x, target.tailBaseRx, 12, dt);
    p.tailBase.rotation.y = damp(p.tailBase.rotation.y, target.tailBaseRy, 12, dt);
    p.tailMid.rotation.x = damp(p.tailMid.rotation.x, target.tailMidRx, 12, dt);
    p.tailMid.rotation.y = damp(p.tailMid.rotation.y, target.tailMidRy, 12, dt);
    p.tailTip.rotation.x = damp(p.tailTip.rotation.x, target.tailTipRx, 12, dt);

    // ------------------------------------------------------------------------
    // UPDATE SIMULASI CLOTH PHYSICS JUBAH 10-FACE
    // ------------------------------------------------------------------------
    if (npc.mesh && npc.mesh.updateMatrixWorld && p.capePinAnchorL && p.capePinAnchorR) {
      npc.mesh.updateMatrixWorld(true);
      const pinWorldL = new THREE.Vector3();
      const pinWorldR = new THREE.Vector3();
      if (p.capePinAnchorL.getWorldPosition) {
        p.capePinAnchorL.getWorldPosition(pinWorldL);
        p.capePinAnchorR.getWorldPosition(pinWorldR);
        if (npc.mesh.worldToLocal) {
          npc.mesh.worldToLocal(pinWorldL);
          npc.mesh.worldToLocal(pinWorldR);
        }
      } else {
        pinWorldL.set(-0.22, 1.40, -0.19);
        pinWorldR.set(0.22, 1.40, -0.19);
      }
      updatePhysicsCape10(p.physicsCape, pinWorldL, pinWorldR, capeImpulse, dt, time);
    }
  }

  return {
    /* ---------- TUNING SKILL AUMAN SINGA & COMBAT ---------- */
    LK: {
      wind: 0.50,      // Ancang-ancang 0.5 detik sebelum raungan
      mid:  0.45,
      rec:  0.80,
      cd:   14,
      range: 7,
      R1:   4.5,
      R2:   6.0,
      m1:   1.3,
      m2:   0.7,
      atkWind:   0.50, // Ancang-ancang 0.5 detik sebelum melancarkan setiap serangan pedang
      atkStrike: 0.18, // Fase tebasan kilat (0.50s - 0.68s)
      atkRecov:  0.44  // Fase follow-through & pemulihan (0.68s - 1.12s)
    },
    LK_DUR: 1.75,

    build: buildLionKnight,
    refreshGear: refreshGear,
    animate: animateLionKnight,

    /* =========================================================================
       COMBAT IN-GAME: SKILL AUMAN SINGA + KOMBO PEDANG (ANCANG-ANCANG 0.5 DETIK)
       ========================================================================= */
    combat(n, dt) {
      const lk = n.lion || (n.lion = { roarCd: 0 });
      const R = n.roar;

      /* 1. Sedang melakukan skill aktif AUMAN SINGA */
      if (R) {
        n.vel.x *= 0.65;
        n.vel.z *= 0.65;
        n._lkAtk = null;
        if (!R.w1 && R.t >= this.LK.wind) {
          R.w1 = true;
          this.roarWave(n, this.LK.R1, this.LK.m1, 8);
          this.roarFx(n, 1);
        }
        if (!R.w2 && R.t >= this.LK.wind + this.LK.mid) {
          R.w2 = true;
          this.roarWave(n, this.LK.R2, this.LK.m2, 5);
          this.roarFx(n, 2);
        }
        return true;
      }

      if (!n.target || n.target.dead) return false;

      /* 2. Picu AUMAN SINGA bila dikerubuti >=2 musuh & stamina cukup */
      const roarCost = (typeof NPCS !== 'undefined' && NPCS.skillStamCost)
        ? NPCS.skillStamCost(n, 35)
        : Math.max(46, Math.round((n.maxStamina || 100) * 0.30));

      if (!n._lkAtk && lk.roarCd <= 0 && this.countNear(n, this.LK.range) >= 2 && ((n.stamina || 0) >= roarCost)) {
        n.stamina = (n.stamina || 0) - roarCost;
        n.stamRegenT = 1.8;
        n.roar = { t: 0, w1: false, w2: false };
        lk.roarCd = this.LK.cd;
        if (typeof NPCS !== 'undefined' && NPCS.say) NPCS.say(n, 'AUMAN SINGA!', 1.8);
        if (typeof FX !== 'undefined') {
          FX.ring(n.pos.x, n.pos.y + 0.15, n.pos.z, 0xffd24d, 0.5, 1.6);
          FX.text(n.pos.clone().add(new THREE.Vector3(0, 2, 0)), `-${roarCost} STAM`, '#ffd24d');
        }
        if (typeof PortFX !== 'undefined' && PortFX.spark) {
          PortFX.spark(n.pos.x, n.pos.y + 1.2, n.pos.z, 6, 0xfff0a8, 3);
        }
        return true;
      }

      /* 3. Sedang dalam siklus serangan pedang (Ancang-ancang 0.5s -> Tebas -> Pulih) */
      const to = new THREE.Vector3().subVectors(n.target.pos, n.pos).setY(0);
      const d = to.length();
      const ang = Math.atan2(to.x, to.z);
      const reach = (typeof NPCS !== 'undefined' && NPCS.npcReach) ? NPCS.npcReach(n) : 2.3;

      if (n._lkAtk) {
        if (d > 0.45 && n.mesh) n.mesh.rotation.y = angLerp(n.mesh.rotation.y, ang, dt * 9);
        const dampVel = Math.exp(-9 * dt);
        n.vel.x *= dampVel;
        n.vel.z *= dampVel;

        // Tepat setelah ancang-ancang 0.50 detik selesai, daratkan damage & VFX tebasan!
        if (!n._lkAtk.hitDone && n._lkAtk.t >= this.LK.atkWind) {
          n._lkAtk.hitDone = true;
          const tgt = n._lkAtk.target || n.target;
          if (tgt && !tgt.dead && tgt.pos.distanceTo(n.pos) <= reach + 1.1) {
            const dir = new THREE.Vector3().subVectors(tgt.pos, n.pos).setY(0).normalize().setY(0.25);
            const dmg = npcDmgSafe(n);
            if (typeof Monsters !== 'undefined' && Monsters.hurt) {
              Monsters.hurt(tgt, dmg, dir, 4, n);
            }
            if (typeof FX !== 'undefined' && FX.debris) {
              FX.debris(tgt.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffe08a, 4, 2);
            }
            this.onMeleeHit(n);
            if (typeof Sfx !== 'undefined' && Sfx.at) Sfx.at(tgt.pos, 'hit');
          } else {
            this.onMeleeHit(n);
          }
        }
        this._provokeTarget(n, d);
        return true;
      }

      /* 4. Bila dalam jangkauan & atkCd siap, mulai serangan dengan ancang-ancang 0.5 detik */
      if (n.atkCd <= 0 && d < reach) {
        n.atkCd = (typeof CFG !== 'undefined' && CFG.NPC ? CFG.NPC.ATK_CD : 0.95) + 0.35;
        const nextMove = ((n._hitIdx || 0) + 1) % 3;
        n._lkAtk = {
          t: 0,
          move: nextMove,
          hitDone: false,
          target: n.target
        };
        this._provokeTarget(n, d);
        return true;
      }

      return false;
    },

    _provokeTarget(n, d) {
      const m = n.target;
      if (!m || m.dead) return;
      m.dir = Math.atan2(n.pos.x - m.pos.x, n.pos.z - m.pos.z);
      m.walking = true;
      m.t = Math.max(m.t || 0, 0.4);
      if (m.atkCd <= 0 && d < 2.1 && typeof NPCS !== 'undefined' && NPCS.hurt) {
        m.atkCd = 1.1;
        NPCS.hurt(n, m.dmg);
      }
    },

    roarWave(n, r, mult, knock) {
      const dmg = npcDmgSafe(n) * mult;
      if (typeof Monsters === 'undefined' || !Monsters.list) return;
      for (const m of Monsters.list) {
        if (!Monsters.isTargetable(m) || m.dead) continue;
        const dx = m.pos.x - n.pos.x, dz = m.pos.z - n.pos.z;
        if (dx * dx + dz * dz > r * r) continue;
        const d = Math.hypot(dx, dz) || 0.001;
        Monsters.hurt(m, dmg, new THREE.Vector3(dx / d, 0.3, dz / d), knock, n);
      }
    },

    roarFx(n, wave) {
      if (typeof FX === 'undefined') return;
      if (wave === 1) {
        FX.ring(n.pos.x, n.pos.y + 0.2, n.pos.z, 0xffd24d, 1.4, 8);
        FX.ring(n.pos.x, n.pos.y + 0.1, n.pos.z, 0xfff3c4, 0.7, 4.5);
        if (typeof FX.groundWave === 'function') {
          FX.groundWave(n.pos.x, n.pos.y, n.pos.z, { mode: 'radial', radius: 5.2, color: 0xffd24d });
        }
        if (typeof PortFX !== 'undefined' && PortFX.spark) {
          PortFX.spark(n.pos.x, n.pos.y + 1.4, n.pos.z, 16, 0xffd24d, 11);
        }
        FX.debris(n.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xE3B45A, 14, 4.5);
        FX.text(n.pos.clone().add(new THREE.Vector3(0, 2.6, 0)), 'AUM!!', '#ffd24d');
        FX.addShake(0.6);
        if (typeof MobNet !== 'undefined' && MobNet.isMp() && MobNet.isHost()) {
          MobNet.sendEntityFx('npc_roar', { x: n.pos.x, y: n.pos.y, z: n.pos.z });
        }
        if (typeof Sfx !== 'undefined' && Sfx.at) Sfx.at(n.pos, 'roar');
      } else {
        FX.ring(n.pos.x, n.pos.y + 0.15, n.pos.z, 0xE3B45A, 1.8, 5);
        if (typeof PortFX !== 'undefined' && PortFX.spark) {
          PortFX.spark(n.pos.x, n.pos.y + 1.2, n.pos.z, 8, 0xffe9a0, 7);
        }
      }
    },

    countNear(n, r) {
      let c = 0;
      if (typeof Monsters === 'undefined' || !Monsters.list) return 0;
      for (const m of Monsters.list) {
        if (!m.dead && m.pos.distanceTo(n.pos) < r) c++;
      }
      return c;
    },

    onMeleeHit(n) {
      n._hitIdx = (n._hitIdx || 0) + 1;
      const heavy = n._hitIdx % 3 === 0;
      const a = n.mesh ? n.mesh.rotation.y : 0;
      const px = n.pos.x + Math.sin(a) * 1.35;
      const pz = n.pos.z + Math.cos(a) * 1.35;
      if (typeof PortFX !== 'undefined') {
        if (PortFX.slash) {
          PortFX.slash(
            px, n.pos.y + 1.25, pz, a,
            [n._hitIdx % 2 ? 0.45 : -0.45, 0, 0],
            heavy ? 1.4 : 1.05,
            0xffd97a
          );
        }
        if (PortFX.spark) {
          PortFX.spark(px, n.pos.y + 1.2, pz, heavy ? 8 : 4, 0xfff0a8, heavy ? 8 : 5);
        }
      }
      if (heavy && typeof FX !== 'undefined') {
        FX.ring(px, n.pos.y + 0.05, pz, 0xffd24d, 0.5, 4.5);
        FX.addShake(0.22);
      }
    }
  };
})();

window.NPC_Lionknight = NPC_Lionknight;
