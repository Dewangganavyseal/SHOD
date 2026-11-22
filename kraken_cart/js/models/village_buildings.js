import { HC } from '../hc.js';

const THREE = HC.THREE;

// ============================================================================
// DETERMINISTIC RNG & PROCEDURAL TEXTURE HELPERS
// ============================================================================

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawRoundedRect(g, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  g.beginPath();
  g.moveTo(x + rad, y);
  g.lineTo(x + w - rad, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rad);
  g.lineTo(x + w, y + h - rad);
  g.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  g.lineTo(x + rad, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rad);
  g.lineTo(x, y + rad);
  g.quadraticCurveTo(x, y, x + rad, y);
  g.closePath();
}

function makeCanvasTexture(w, h, drawFn, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  drawFn(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function createFallbackWarmGlowTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0.0, 'rgba(255, 250, 220, 1.0)');
  grad.addColorStop(0.32, 'rgba(255, 198, 102, 0.72)');
  grad.addColorStop(0.70, 'rgba(255, 140, 48, 0.22)');
  grad.addColorStop(1.0, 'rgba(255, 120, 30, 0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createPlasterTexture(seed = 101) {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#e7dbc0';
    g.fillRect(0, 0, w, h);

    // Soft painterly stucco clouds & trowel marks
    const tones = ['#efe5ce', '#ddd0b2', '#d5c4a1', '#f3ead6', '#e2d4b5'];
    for (let i = 0; i < 95; i++) {
      g.fillStyle = tones[Math.floor(rng() * tones.length)];
      g.globalAlpha = 0.22 + rng() * 0.24;
      const rx = rng() * w;
      const ry = rng() * h;
      const rw = 10 + rng() * 26;
      const rh = 6 + rng() * 14;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.ellipse(rx + ox, ry + oy, rw * 0.5, rh * 0.5, (rng() - 0.5) * 0.4, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Fine hand-brushed horizontal plaster grain
    g.globalAlpha = 0.14;
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = rng() > 0.5 ? '#c6b48f' : '#faf4e6';
      g.lineWidth = 1 + rng() * 1.4;
      const y = rng() * h;
      const x = rng() * w;
      const len = 12 + rng() * 24;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len * 0.5, y + (rng() - 0.5) * 3, x + len, y);
      g.stroke();
    }

    // Subtle tiny speckles for warm handcrafted warmth
    g.globalAlpha = 0.16;
    for (let i = 0; i < 120; i++) {
      g.fillStyle = rng() > 0.4 ? '#b7a480' : '#f7f0df';
      g.fillRect(rng() * w, rng() * h, 1.5, 1.5);
    }
    g.globalAlpha = 1.0;
  }, 1.5, 1.5);
}

function createStoneTexture(seed = 202, darkVariant = false) {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = darkVariant ? '#47413b' : '#655f55';
    g.fillRect(0, 0, w, h);

    const palette = darkVariant
      ? ['#6f665d', '#625a52', '#7d7265', '#58514a', '#867867', '#6a6359']
      : ['#9a9182', '#898174', '#aa9f8c', '#7c7568', '#b1a58e', '#928a7b', '#81886f'];

    const rows = 6;
    const rowH = h / rows;

    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      const cols = 4 + (r % 2);
      const offset = (r % 2) * (w / cols) * 0.5;
      let cursor = -offset;
      for (let c = 0; c <= cols + 1; c++) {
        const stoneW = (w / cols) * (0.82 + rng() * 0.34);
        const stoneH = rowH * (0.76 + rng() * 0.14);
        const sx = cursor + 2;
        const sy = y0 + (rowH - stoneH) * 0.5 + (rng() - 0.5) * 1.4;
        const sw = Math.max(10, stoneW - 4);
        const sh = stoneH;
        const rad = Math.min(sw, sh) * 0.28;
        const col = palette[Math.floor(rng() * palette.length)];

        for (const wrapX of [-w, 0, w]) {
          const dx = sx + wrapX;
          if (dx + sw < -2 || dx > w + 2) continue;

          // Stone body
          g.fillStyle = col;
          drawRoundedRect(g, dx, sy, sw, sh, rad);
          g.fill();

          // Warm top sunlit bevel
          g.fillStyle = darkVariant ? 'rgba(210,198,180,0.16)' : 'rgba(255,248,230,0.22)';
          drawRoundedRect(g, dx + 1.5, sy + 1, sw - 3, sh * 0.36, rad * 0.7);
          g.fill();

          // Bottom underside shadow
          g.fillStyle = 'rgba(30,24,20,0.22)';
          drawRoundedRect(g, dx + 1, sy + sh * 0.66, sw - 2, sh * 0.32, rad * 0.6);
          g.fill();
        }
        cursor += stoneW;
      }
    }

    // Subtle mortar speckling
    g.globalAlpha = 0.12;
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rng() > 0.5 ? '#2b2622' : '#d6ccb8';
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
    g.globalAlpha = 1.0;
  }, 1.5, 1.0);
}

function createWoodTexture(seed = 303, dark = false) {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    const baseColors = dark
      ? ['#5b3d27', '#513521', '#63432c', '#4b311e']
      : ['#9b6a41', '#8e5f39', '#a67549', '#94653d'];

    const planks = 4;
    const plankW = w / planks;

    for (let p = 0; p < planks; p++) {
      const px = p * plankW;
      g.fillStyle = baseColors[p % baseColors.length];
      g.fillRect(px, 0, plankW, h);

      // Painterly wood grain fibers
      for (let i = 0; i < 16; i++) {
        const gx = px + 2 + rng() * (plankW - 4);
        g.strokeStyle = rng() > 0.45
          ? (dark ? 'rgba(32,18,10,0.26)' : 'rgba(72,42,20,0.22)')
          : (dark ? 'rgba(130,92,62,0.18)' : 'rgba(205,156,104,0.22)');
        g.lineWidth = 0.9 + rng() * 1.3;
        g.beginPath();
        g.moveTo(gx, 0);
        const wobble = (rng() - 0.5) * 4.5;
        g.bezierCurveTo(gx + wobble, h * 0.33, gx - wobble, h * 0.66, gx, h);
        g.stroke();
      }

      // Occasional knot
      if (rng() > 0.45) {
        const kx = px + 6 + rng() * (plankW - 12);
        const ky = 18 + rng() * (h - 36);
        g.fillStyle = dark ? 'rgba(30,16,8,0.38)' : 'rgba(84,48,22,0.32)';
        g.beginPath();
        g.ellipse(kx, ky, 3.2, 5.5, 0.1, 0, Math.PI * 2);
        g.fill();
      }

      // Plank seam groove + warm edge highlight
      g.fillStyle = dark ? 'rgba(22,12,6,0.58)' : 'rgba(58,34,16,0.48)';
      g.fillRect(px, 0, 1.8, h);
      g.fillStyle = dark ? 'rgba(132,96,66,0.16)' : 'rgba(222,178,128,0.20)';
      g.fillRect(px + 2, 0, 1.2, h);
    }
  }, 1.0, 1.0);
}

function createShingleTexture(paletteCfg, seed = 404) {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = paletteCfg.seam;
    g.fillRect(0, 0, w, h);

    const rows = 6;
    const cols = 6;
    const rowH = h / rows;
    const tileW = w / cols;

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * (tileW * 0.5);

      // Soft cast shadow band from course above
      g.fillStyle = 'rgba(20, 14, 12, 0.28)';
      g.fillRect(0, y, w, 3.5);

      for (let c = -1; c <= cols + 1; c++) {
        const x = c * tileW + offset;
        const pick = rng();
        const fillCol = pick < 0.14
          ? paletteCfg.accent
          : (pick < 0.45 ? paletteCfg.hi : (pick < 0.78 ? paletteCfg.base : paletteCfg.lo));

        const tw = tileW - 2.2;
        const th = rowH - 1.5;

        g.fillStyle = fillCol;
        g.beginPath();
        g.moveTo(x + 1, y);
        g.lineTo(x + 1 + tw, y);
        g.lineTo(x + 1 + tw, y + th * 0.72);
        g.quadraticCurveTo(x + 1 + tw * 0.5, y + th + 2.5, x + 1, y + th * 0.72);
        g.closePath();
        g.fill();

        // Painterly sunlit top lip on tile
        g.fillStyle = 'rgba(255,245,222,0.16)';
        g.fillRect(x + 2.5, y + 2, tw - 3, 2.5);

        // Soft bottom edge rim shadow
        g.strokeStyle = 'rgba(22,16,14,0.34)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x + 1, y + th * 0.72);
        g.quadraticCurveTo(x + 1 + tw * 0.5, y + th + 2.5, x + 1 + tw, y + th * 0.72);
        g.stroke();
      }
    }
  }, 2.4, 1.8);
}

function createAwningTexture(stripeColor, seed = 505) {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    const stripes = 6;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = (i % 2 === 0) ? '#f2e6cc' : stripeColor;
      g.fillRect(i * sw, 0, sw + 0.5, h);
      // Soft woven fold seam
      g.fillStyle = 'rgba(40,28,20,0.12)';
      g.fillRect(i * sw, 0, 1.5, h);
    }
    // Subtle linen cross-weave grain
    g.globalAlpha = 0.08;
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = rng() > 0.5 ? '#ffffff' : '#3a2b20';
      g.fillRect(0, y, w, 1);
    }
    g.globalAlpha = 1.0;
  }, 1.5, 1.0);
}

function createTavernSignTexture() {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    // Warm timber board background
    g.fillStyle = '#5e3c24';
    g.fillRect(0, 0, w, h);

    // Inner recessed painted oak field
    g.fillStyle = '#8b5d38';
    g.fillRect(8, 8, w - 16, h - 16);

    // Cream painterly border trim
    g.strokeStyle = '#efe0be';
    g.lineWidth = 4;
    g.strokeRect(12, 12, w - 24, h - 24);

    // Painted cozy golden foaming mug emblem
    // Mug handle
    g.strokeStyle = '#f5d27a';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(84, 68, 15, -Math.PI * 0.45, Math.PI * 0.45);
    g.stroke();

    // Mug body
    g.fillStyle = '#e7b952';
    drawRoundedRect(g, 40, 46, 44, 52, 6);
    g.fill();

    // Mug dark wood bands
    g.fillStyle = '#7c4c24';
    g.fillRect(40, 58, 44, 5);
    g.fillRect(40, 82, 44, 5);

    // Creamy foam crown
    g.fillStyle = '#fbf4e2';
    const puffs = [[46, 44, 11], [59, 39, 13], [74, 43, 11], [63, 47, 10]];
    for (const [px, py, pr] of puffs) {
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fill();
    }

    // Iron corner studs
    g.fillStyle = '#32373d';
    for (const sx of [19, w - 19]) {
      for (const sy of [19, h - 19]) {
        g.beginPath();
        g.arc(sx, sy, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 1, 1);
}

function createStallSignTexture() {
  return makeCanvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#624027';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#9b6c43';
    g.fillRect(5, 5, w - 10, h - 10);
    g.strokeStyle = '#f1e3c4';
    g.lineWidth = 2.5;
    g.strokeRect(8, 8, w - 16, h - 16);

    // Stylized painted apple + leaf + loaf emblem
    g.fillStyle = '#d84a3c';
    g.beginPath();
    g.arc(36, 35, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5da04a';
    g.beginPath();
    g.ellipse(42, 22, 6, 3.5, -0.5, 0, Math.PI * 2);
    g.fill();

    // Golden bread loaf
    g.fillStyle = '#e4ae52';
    g.beginPath();
    g.ellipse(82, 36, 22, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9c6624';
    g.lineWidth = 2;
    for (const lx of [72, 82, 92]) {
      g.beginPath();
      g.moveTo(lx - 4, 29);
      g.lineTo(lx + 4, 38);
      g.stroke();
    }
  }, 1, 1);
}

// ============================================================================
// MATERIAL PALETTE & LANTERN UNIT FACTORY
// ============================================================================

function makeCelMaterial(ctx, params, celOpts) {
  const mat = new THREE.MeshStandardMaterial(params);
  if (ctx && typeof ctx.applyStylizedCelShading === 'function') {
    ctx.applyStylizedCelShading(mat, celOpts);
  }
  return mat;
}

function applyShadow(mesh, ctx, cast = true, receive = true) {
  mesh.castShadow = !!(cast && !(ctx && ctx.isMobileDevice));
  mesh.receiveShadow = !!receive;
  return mesh;
}

function createLanternUnit(palette, ctx = {}, opts = {}) {
  const phase = opts.phase !== undefined ? opts.phase : 0.7;
  const scale = opts.scale !== undefined ? opts.scale : 1.0;

  const group = new THREE.Group();
  group.scale.setScalar(scale);

  // Hanging hook / chain
  const chain = new THREE.Mesh(palette.geos.lanternChain, palette.ironMat);
  chain.position.y = -0.06;
  group.add(chain);

  // Iron cap
  const cap = new THREE.Mesh(palette.geos.lanternCap, palette.ironMat);
  cap.position.y = -0.15;
  group.add(cap);

  // Glowing lantern glass (own MeshBasicMaterial so night dimming/flicker is safe)
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
  const glass = new THREE.Mesh(palette.geos.lanternGlass, glassMat);
  glass.position.y = -0.30;
  group.add(glass);

  // Iron lantern bottom base
  const base = new THREE.Mesh(palette.geos.lanternBase, palette.ironMat);
  base.position.y = -0.43;
  group.add(base);

  // Soft warm radial halo sprite (NO PointLight!)
  const glowTex = (ctx && ctx.warmGlowTex) || palette.warmGlowTex;
  const haloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffc66b,
    transparent: true,
    opacity: 0.74,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.y = -0.30;
  halo.scale.set(1.45, 1.45, 1.0);
  group.add(halo);

  return { group, halo, glassMat, phase };
}

function createVillageMaterialPalette(ctx = {}) {
  const plasterTex = createPlasterTexture(101);
  const stoneTex = createStoneTexture(202, false);
  const chimneyStoneTex = createStoneTexture(257, true);
  const woodTex = createWoodTexture(303, false);
  const darkWoodTex = createWoodTexture(359, true);

  const shingleTex = {
    terracotta: createShingleTexture({
      base: '#9c4835',
      hi: '#b55b44',
      lo: '#7f3728',
      accent: '#b96d46',
      seam: '#4b221a',
    }, 401),
    slate: createShingleTexture({
      base: '#3f6154',
      hi: '#527768',
      lo: '#2f493f',
      accent: '#687f4f',
      seam: '#1e2f28',
    }, 409),
    shake: createShingleTexture({
      base: '#8c633b',
      hi: '#a5794d',
      lo: '#6e4b2b',
      accent: '#b48a57',
      seam: '#3e2918',
    }, 419),
  };

  const awningTex = [
    createAwningTexture('#b54b38', 501),
    createAwningTexture('#3a6b52', 509),
  ];

  const tavernSignTex = createTavernSignTexture();
  const stallSignTex = createStallSignTexture();
  const warmGlowTex = (ctx && ctx.warmGlowTex) ? ctx.warmGlowTex : createFallbackWarmGlowTex();

  const plasterMat = makeCelMaterial(ctx, {
    color: 0xf7efe0,
    map: plasterTex,
    roughness: 0.93,
  }, { rimStrength: 0.14, shadowLift: 0.60 });

  const plasterWarmMat = makeCelMaterial(ctx, {
    color: 0xf0deb8,
    map: plasterTex,
    roughness: 0.93,
  }, { rimStrength: 0.14, shadowLift: 0.59 });

  const stoneMat = makeCelMaterial(ctx, {
    color: 0xe6dfd0,
    map: stoneTex,
    roughness: 0.91,
  }, { rimStrength: 0.16, shadowLift: 0.56 });

  const chimneyMat = makeCelMaterial(ctx, {
    color: 0xd9d1c5,
    map: chimneyStoneTex,
    roughness: 0.92,
  }, { rimStrength: 0.16, shadowLift: 0.52 });

  const woodMat = makeCelMaterial(ctx, {
    color: 0xe8d5bc,
    map: woodTex,
    roughness: 0.88,
  }, { rimStrength: 0.16, shadowLift: 0.56 });

  const darkWoodMat = makeCelMaterial(ctx, {
    color: 0xd8c3aa,
    map: darkWoodTex,
    roughness: 0.86,
  }, { rimStrength: 0.15, shadowLift: 0.54 });

  const doorWoodMat = makeCelMaterial(ctx, {
    color: 0xc99c74,
    map: woodTex,
    roughness: 0.85,
  }, { rimStrength: 0.16, shadowLift: 0.55 });

  const roofMats = {
    terracotta: makeCelMaterial(ctx, {
      color: 0xf4e8df,
      map: shingleTex.terracotta,
      roughness: 0.85,
    }, { rimStrength: 0.18, shadowLift: 0.52 }),
    slate: makeCelMaterial(ctx, {
      color: 0xeaf0ec,
      map: shingleTex.slate,
      roughness: 0.84,
    }, { rimStrength: 0.18, shadowLift: 0.52 }),
    shake: makeCelMaterial(ctx, {
      color: 0xf2e7d8,
      map: shingleTex.shake,
      roughness: 0.88,
    }, { rimStrength: 0.17, shadowLift: 0.54 }),
  };

  const shutterMats = {
    terracotta: makeCelMaterial(ctx, { color: 0x486d58, roughness: 0.88 }, { rimStrength: 0.15, shadowLift: 0.56 }),
    slate: makeCelMaterial(ctx, { color: 0x9b543c, roughness: 0.88 }, { rimStrength: 0.15, shadowLift: 0.56 }),
    shake: makeCelMaterial(ctx, { color: 0x4b6a7a, roughness: 0.88 }, { rimStrength: 0.15, shadowLift: 0.56 }),
  };

  const awningMats = [
    makeCelMaterial(ctx, {
      color: 0xffffff,
      map: awningTex[0],
      roughness: 0.90,
      side: THREE.DoubleSide,
    }, { rimStrength: 0.15, shadowLift: 0.58 }),
    makeCelMaterial(ctx, {
      color: 0xffffff,
      map: awningTex[1],
      roughness: 0.90,
      side: THREE.DoubleSide,
    }, { rimStrength: 0.15, shadowLift: 0.58 }),
  ];

  // Warm glowing amber window glass (intentionally without cel-shader override so emissive shines at dusk/night)
  const windowGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffe29c,
    emissive: 0xff9f38,
    emissiveIntensity: 0.68,
    roughness: 0.35,
  });

  const ironMat = makeCelMaterial(ctx, {
    color: 0x363b42,
    roughness: 0.54,
    metalness: 0.36,
  }, { rimStrength: 0.24, shadowLift: 0.48 });

  const foliageMat = makeCelMaterial(ctx, {
    color: 0x4f8342,
    roughness: 0.86,
  }, { rimStrength: 0.18, shadowLift: 0.58 });

  const flowerMats = [
    makeCelMaterial(ctx, { color: 0xe35a4d, roughness: 0.82 }, { rimStrength: 0.20, shadowLift: 0.62 }),
    makeCelMaterial(ctx, { color: 0xf2c647, roughness: 0.82 }, { rimStrength: 0.20, shadowLift: 0.62 }),
    makeCelMaterial(ctx, { color: 0x9f7fd9, roughness: 0.82 }, { rimStrength: 0.20, shadowLift: 0.62 }),
    makeCelMaterial(ctx, { color: 0xef8ea4, roughness: 0.82 }, { rimStrength: 0.20, shadowLift: 0.62 }),
  ];

  const hayMat = makeCelMaterial(ctx, {
    color: 0xd7b05c,
    roughness: 0.94,
  }, { rimStrength: 0.16, shadowLift: 0.58 });

  const waterMat = makeCelMaterial(ctx, {
    color: 0x3b8aa0,
    roughness: 0.24,
    metalness: 0.08,
  }, { rimStrength: 0.28, shadowLift: 0.58 });

  const clothMat = makeCelMaterial(ctx, {
    color: 0xe9dac0,
    roughness: 0.92,
  }, { rimStrength: 0.14, shadowLift: 0.60 });

  const charcoalMat = makeCelMaterial(ctx, {
    color: 0x262220,
    roughness: 0.95,
  }, { rimStrength: 0.12, shadowLift: 0.44 });

  // Emissive forge embers (intentionally un-overridden so ember glow stays vibrant)
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff7722,
    emissive: 0xff4a0a,
    emissiveIntensity: 1.35,
    roughness: 0.65,
  });

  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0xf4efe8,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });

  const tavernSignMat = makeCelMaterial(ctx, {
    color: 0xffffff,
    map: tavernSignTex,
    roughness: 0.86,
  }, { rimStrength: 0.15, shadowLift: 0.58 });

  const stallSignMat = makeCelMaterial(ctx, {
    color: 0xffffff,
    map: stallSignTex,
    roughness: 0.86,
  }, { rimStrength: 0.15, shadowLift: 0.58 });

  const produceMats = {
    appleRed: makeCelMaterial(ctx, { color: 0xd64336, roughness: 0.72 }, { rimStrength: 0.22, shadowLift: 0.58 }),
    appleGreen: makeCelMaterial(ctx, { color: 0x7cb042, roughness: 0.74 }, { rimStrength: 0.20, shadowLift: 0.58 }),
    breadGold: makeCelMaterial(ctx, { color: 0xdba04c, roughness: 0.88 }, { rimStrength: 0.16, shadowLift: 0.58 }),
    potionBlue: new THREE.MeshStandardMaterial({
      color: 0x4bc3e8,
      emissive: 0x1a7fa6,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    }),
    potionPink: new THREE.MeshStandardMaterial({
      color: 0xea6aa0,
      emissive: 0xa62a64,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    }),
  };

  // Shared reusable geometries
  const geos = {
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    lanternChain: new THREE.CylinderGeometry(0.018, 0.018, 0.14, 5),
    lanternCap: new THREE.ConeGeometry(0.16, 0.12, 6),
    lanternGlass: new THREE.CylinderGeometry(0.10, 0.082, 0.22, 6),
    lanternBase: new THREE.CylinderGeometry(0.095, 0.065, 0.055, 6),
    leafCluster: new THREE.DodecahedronGeometry(0.13, 0),
    flowerHead: new THREE.IcosahedronGeometry(0.062, 0),
    smokePuff: new THREE.DodecahedronGeometry(0.28, 1),
    barrelBody: new THREE.CylinderGeometry(0.27, 0.25, 0.68, 9),
    barrelHoop: new THREE.TorusGeometry(0.268, 0.018, 5, 10),
    logPiece: new THREE.CylinderGeometry(0.068, 0.074, 0.54, 6),
    emberChunk: new THREE.DodecahedronGeometry(0.095, 0),
    appleSphere: new THREE.IcosahedronGeometry(0.072, 0),
    breadLoaf: new THREE.SphereGeometry(0.11, 7, 5),
    bottleBody: new THREE.CylinderGeometry(0.042, 0.052, 0.15, 7),
    bottleNeck: new THREE.CylinderGeometry(0.022, 0.028, 0.06, 6),
  };

  const palette = {
    textures: {
      plasterTex,
      stoneTex,
      chimneyStoneTex,
      woodTex,
      darkWoodTex,
      shingleTex,
      awningTex,
      tavernSignTex,
      stallSignTex,
    },
    warmGlowTex,
    plasterMat,
    plasterWarmMat,
    stoneMat,
    chimneyMat,
    woodMat,
    darkWoodMat,
    doorWoodMat,
    roofMats,
    shutterMats,
    awningMats,
    windowGlassMat,
    ironMat,
    foliageMat,
    flowerMats,
    hayMat,
    waterMat,
    clothMat,
    charcoalMat,
    emberMat,
    smokeMat,
    tavernSignMat,
    stallSignMat,
    produceMats,
    geos,
    createLanternUnit: (overrideCtx, opts) => createLanternUnit(palette, overrideCtx || ctx, opts),
  };

  return palette;
}

// ============================================================================
// SHARED ARCHITECTURAL SUB-BUILDERS
// ============================================================================

function addBox(parent, w, h, d, x, y, z, mat, ctx, cast = true, receive = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  applyShadow(m, ctx, cast, receive);
  parent.add(m);
  return m;
}

function addUnitBox(parent, geos, sx, sy, sz, x, y, z, mat, ctx, cast = false, receive = true) {
  const m = new THREE.Mesh(geos.unitBox, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  applyShadow(m, ctx, cast, receive);
  parent.add(m);
  return m;
}

/**
 * Cobblestone foundation plinth extending strictly from y = -0.75 up to y = topY
 * so buildings NEVER float on sloped terrain.
 */
function buildStonePlinth(parent, palette, ctx, w, d, topY = 0.36, xOff = 0, zOff = 0) {
  const bottomY = -0.75;
  const h = topY - bottomY;
  const plinth = addBox(
    parent,
    w,
    h,
    d,
    xOff,
    bottomY + h * 0.5,
    zOff,
    palette.stoneMat,
    ctx,
    true,
    true
  );
  // Subtle chamfered stone sill cap right at topY
  addBox(
    parent,
    w + 0.08,
    0.09,
    d + 0.08,
    xOff,
    topY - 0.03,
    zOff,
    palette.stoneMat,
    ctx,
    false,
    true
  );
  return plinth;
}

/**
 * True pitched gable roof with watertight dual angled shingle slabs,
 * extruded triangular gable walls, exposed rafters, ridge beam + cap, and bargeboards.
 * Supports ridgeAxis: 'z' (gable triangles face -Z/+Z) or 'x' (gable triangles face -X/+X).
 */
function buildGableRoof(parent, palette, ctx, cfg) {
  const {
    w,
    d,
    wallTop,
    roofH,
    ridgeAxis = 'z',
    roofMat,
    gableMat,
    eaveOut = 0.44,
    gableOut = 0.36,
    slabThick = 0.14,
    xOff = 0,
    zOff = 0,
    withTimberGableTrim = true,
  } = cfg;

  const roofGroup = new THREE.Group();
  roofGroup.position.set(xOff, 0, zOff);
  parent.add(roofGroup);

  const span = ridgeAxis === 'z' ? w : d;
  const length = ridgeAxis === 'z' ? d : w;
  const hs = span * 0.5;
  const alpha = Math.atan2(roofH, hs);
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);

  // 1. Solid watertight triangular gable prism filling the entire attic volume
  const triShape = new THREE.Shape();
  triShape.moveTo(-hs, 0);
  triShape.lineTo(hs, 0);
  triShape.lineTo(0, roofH);
  triShape.closePath();

  const gableDepth = length - 0.02;
  const gableGeo = new THREE.ExtrudeGeometry(triShape, {
    depth: gableDepth,
    bevelEnabled: false,
  });
  // Normalize UVs so CanvasTextures tile nicely on gable triangles
  const uvAttr = gableGeo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uvAttr.getX(i) * 0.42, uvAttr.getY(i) * 0.42);
  }
  uvAttr.needsUpdate = true;
  gableGeo.translate(0, 0, -gableDepth * 0.5);

  const gableMesh = new THREE.Mesh(gableGeo, gableMat);
  gableMesh.position.y = wallTop - 0.01;
  if (ridgeAxis === 'x') {
    gableMesh.rotation.y = Math.PI * 0.5;
  }
  applyShadow(gableMesh, ctx, true, true);
  roofGroup.add(gableMesh);

  // 2. Dual pitched shingled roof slabs meeting tightly at ridge apex
  const sMax = (hs + eaveOut) / cosA;
  const apexPad = 0.06;
  const slabLen = sMax + apexPad;
  const sMid = (-apexPad + sMax) * 0.5;
  const uCenter = sMid * cosA + (slabThick * 0.5) * sinA;
  const yCenter = (wallTop + roofH) - sMid * sinA + (slabThick * 0.5) * cosA;
  const totalLen = length + gableOut * 2;

  for (const side of [-1, 1]) {
    const slabGeo = ridgeAxis === 'z'
      ? new THREE.BoxGeometry(slabLen, slabThick, totalLen)
      : new THREE.BoxGeometry(totalLen, slabThick, slabLen);
    const slab = new THREE.Mesh(slabGeo, roofMat);
    if (ridgeAxis === 'z') {
      slab.position.set(side * uCenter, yCenter, 0);
      slab.rotation.z = -side * alpha;
    } else {
      slab.position.set(0, yCenter, side * uCenter);
      slab.rotation.x = side * alpha;
    }
    applyShadow(slab, ctx, true, true);
    roofGroup.add(slab);
  }

  // 3. Sculpted timber ridge beam & peaked ridge cap
  const ridgeBeamLen = totalLen + 0.24;
  const ridgeBeam = ridgeAxis === 'z'
    ? addBox(roofGroup, 0.18, 0.20, ridgeBeamLen, 0, wallTop + roofH + 0.02, 0, palette.darkWoodMat, ctx, true, true)
    : addBox(roofGroup, ridgeBeamLen, 0.20, 0.18, 0, wallTop + roofH + 0.02, 0, palette.darkWoodMat, ctx, true, true);
  // Sculpted ridge cap sitting snugly atop the seam
  const ridgeCap = ridgeAxis === 'z'
    ? addBox(roofGroup, 0.24, 0.11, totalLen + 0.08, 0, wallTop + roofH + slabThick * 0.92, 0, palette.darkWoodMat, ctx, false, true)
    : addBox(roofGroup, totalLen + 0.08, 0.11, 0.24, 0, wallTop + roofH + slabThick * 0.92, 0, palette.darkWoodMat, ctx, false, true);
  void ridgeBeam;
  void ridgeCap;

  // 4. Exposed wooden rafter tails along both eaves
  const rafterCount = Math.max(4, Math.round(totalLen / 0.85));
  const rafterLen = (eaveOut + 0.36) / cosA;
  const rSMid = (hs / cosA) + (eaveOut - 0.14) / cosA * 0.5;
  const rU = rSMid * cosA - 0.05 * sinA;
  const rY = (wallTop + roofH) - rSMid * sinA - 0.05 * cosA;

  for (let i = 0; i < rafterCount; i++) {
    const t = rafterCount === 1 ? 0 : (i / (rafterCount - 1)) - 0.5;
    const along = t * (totalLen - 0.34);
    for (const side of [-1, 1]) {
      const rMesh = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
      if (ridgeAxis === 'z') {
        rMesh.scale.set(rafterLen, 0.09, 0.085);
        rMesh.position.set(side * rU, rY, along);
        rMesh.rotation.z = -side * alpha;
      } else {
        rMesh.scale.set(0.085, 0.09, rafterLen);
        rMesh.position.set(along, rY, side * rU);
        rMesh.rotation.x = side * alpha;
      }
      applyShadow(rMesh, ctx, false, true);
      roofGroup.add(rMesh);
    }
  }

  // 5. Decorative gable bargeboards (angled fascia trim) on both gable ends
  const bargeThick = 0.075;
  const bargeH = 0.16;
  const bargeU = sMid * cosA - 0.01 * sinA;
  const bargeY = (wallTop + roofH) - sMid * sinA - 0.01 * cosA;
  for (const endSign of [-1, 1]) {
    const endPos = endSign * (totalLen * 0.5 - bargeThick * 0.45);
    for (const side of [-1, 1]) {
      const bMesh = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
      if (ridgeAxis === 'z') {
        bMesh.scale.set(slabLen + 0.04, bargeH, bargeThick);
        bMesh.position.set(side * bargeU, bargeY, endPos);
        bMesh.rotation.z = -side * alpha;
      } else {
        bMesh.scale.set(bargeThick, bargeH, slabLen + 0.04);
        bMesh.position.set(endPos, bargeY, side * bargeU);
        bMesh.rotation.x = side * alpha;
      }
      applyShadow(bMesh, ctx, false, true);
      roofGroup.add(bMesh);
    }
  }

  // 6. Half-timbered gable wall framing (collar beam + king post + angled gable braces)
  if (withTimberGableTrim) {
    for (const endSign of [-1, 1]) {
      const facePos = endSign * (length * 0.5 + 0.015);
      // Base tie beam along eave line
      if (ridgeAxis === 'z') {
        addUnitBox(roofGroup, palette.geos, span + 0.08, 0.13, 0.08, 0, wallTop, facePos, palette.darkWoodMat, ctx, false, true);
        // Collar tie midway up gable
        const collarY = wallTop + roofH * 0.48;
        const collarW = span * 0.52;
        addUnitBox(roofGroup, palette.geos, collarW, 0.10, 0.075, 0, collarY, facePos, palette.darkWoodMat, ctx, false, true);
        // Vertical king post from collar up to ridge
        addUnitBox(roofGroup, palette.geos, 0.11, roofH * 0.52, 0.075, 0, wallTop + roofH * 0.72, facePos, palette.darkWoodMat, ctx, false, true);
        // Two flanking lower studs
        for (const sx of [-1, 1]) {
          addUnitBox(roofGroup, palette.geos, 0.10, roofH * 0.48, 0.075, sx * span * 0.22, wallTop + roofH * 0.24, facePos, palette.darkWoodMat, ctx, false, true);
        }
      } else {
        addUnitBox(roofGroup, palette.geos, 0.08, 0.13, span + 0.08, facePos, wallTop, 0, palette.darkWoodMat, ctx, false, true);
        const collarY = wallTop + roofH * 0.48;
        const collarW = span * 0.52;
        addUnitBox(roofGroup, palette.geos, 0.075, 0.10, collarW, facePos, collarY, 0, palette.darkWoodMat, ctx, false, true);
        addUnitBox(roofGroup, palette.geos, 0.075, roofH * 0.52, 0.11, facePos, wallTop + roofH * 0.72, 0, palette.darkWoodMat, ctx, false, true);
        for (const sz of [-1, 1]) {
          addUnitBox(roofGroup, palette.geos, 0.075, roofH * 0.48, 0.10, facePos, wallTop + roofH * 0.24, sz * span * 0.22, palette.darkWoodMat, ctx, false, true);
        }
      }
    }
  }

  return roofGroup;
}

/**
 * Recessed glowing mullioned window built in local +Z outward space.
 * Rotate by Math.PI for front (-Z) wall, 0 for back (+Z), +/-PI/2 for side walls.
 */
function buildWindow(palette, ctx, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 0.84;
  const h = opts.h !== undefined ? opts.h : 0.92;
  const withShutters = opts.withShutters !== false;
  const withFlowerBox = opts.withFlowerBox !== false;
  const shutterMat = opts.shutterMat || palette.shutterMats.terracotta;
  const seed = opts.seed !== undefined ? opts.seed : 17;

  const g = new THREE.Group();

  // Warm glowing recessed glass pane
  addUnitBox(g, palette.geos, w - 0.10, h - 0.10, 0.035, 0, 0, 0.015, palette.windowGlassMat, ctx, false, false);

  // Timber outer surround frame (jambs, head lintel, projecting sill)
  const frameD = 0.085;
  const bar = 0.075;
  addUnitBox(g, palette.geos, bar, h, frameD, -w * 0.5 + bar * 0.5, 0, 0.035, palette.darkWoodMat, ctx, false, true);
  addUnitBox(g, palette.geos, bar, h, frameD, w * 0.5 - bar * 0.5, 0, 0.035, palette.darkWoodMat, ctx, false, true);
  addUnitBox(g, palette.geos, w + 0.10, bar + 0.02, frameD + 0.03, 0, h * 0.5 - bar * 0.4, 0.045, palette.darkWoodMat, ctx, false, true);
  addUnitBox(g, palette.geos, w + 0.14, bar + 0.01, frameD + 0.07, 0, -h * 0.5 + bar * 0.3, 0.065, palette.darkWoodMat, ctx, false, true);

  // Wooden cross mullions
  addUnitBox(g, palette.geos, 0.042, h - 0.10, 0.035, 0, 0, 0.042, palette.darkWoodMat, ctx, false, false);
  addUnitBox(g, palette.geos, w - 0.10, 0.042, 0.035, 0, 0.03, 0.042, palette.darkWoodMat, ctx, false, false);

  // Slightly angled open wooden shutters
  if (withShutters) {
    const shW = w * 0.44;
    const shH = h - 0.08;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (w * 0.5 + 0.015), 0, 0.055);
      // Local +Z is outward; rotating left shutter by +0.28 and right by -0.28 opens outward!
      pivot.rotation.y = -side * 0.28;

      const panel = new THREE.Mesh(palette.geos.unitBox, shutterMat);
      panel.scale.set(shW, shH, 0.042);
      panel.position.set(side * shW * 0.5, 0, 0);
      applyShadow(panel, ctx, false, true);
      pivot.add(panel);

      // Decorative timber trim strips on shutter
      for (const ty of [-shH * 0.28, shH * 0.28]) {
        addUnitBox(pivot, palette.geos, shW * 0.92, 0.05, 0.054, side * shW * 0.5, ty, 0.005, palette.darkWoodMat, ctx, false, false);
      }
      g.add(pivot);
    }
  }

  // Cozy wooden flower box bursting with greenery & blossoms
  if (withFlowerBox) {
    const rng = makeRng(seed);
    const boxW = w + 0.10;
    const boxY = -h * 0.5 - 0.11;

    // Wooden trough + 2 brackets
    addUnitBox(g, palette.geos, boxW, 0.16, 0.20, 0, boxY, 0.12, palette.woodMat, ctx, false, true);
    addUnitBox(g, palette.geos, boxW + 0.04, 0.035, 0.22, 0, boxY + 0.075, 0.12, palette.darkWoodMat, ctx, false, true);
    for (const sx of [-1, 1]) {
      addUnitBox(g, palette.geos, 0.06, 0.12, 0.14, sx * (boxW * 0.36), boxY - 0.12, 0.08, palette.darkWoodMat, ctx, false, false);
    }

    // Leafy greenery mounds
    const leafCount = 4;
    for (let i = 0; i < leafCount; i++) {
      const lx = ((i / (leafCount - 1)) - 0.5) * (boxW - 0.22);
      const leaf = new THREE.Mesh(palette.geos.leafCluster, palette.foliageMat);
      leaf.position.set(lx, boxY + 0.12 + rng() * 0.03, 0.13 + (rng() - 0.5) * 0.04);
      leaf.scale.set(1.1 + rng() * 0.25, 0.72 + rng() * 0.25, 0.95);
      leaf.rotation.set(rng(), rng(), rng());
      g.add(leaf);
    }

    // Colorful storybook blossoms
    const flowerCount = 5;
    for (let i = 0; i < flowerCount; i++) {
      const fx = ((i / (flowerCount - 1)) - 0.5) * (boxW - 0.18);
      const fMat = palette.flowerMats[Math.floor(rng() * palette.flowerMats.length)];
      const fl = new THREE.Mesh(palette.geos.flowerHead, fMat);
      fl.position.set(fx, boxY + 0.19 + rng() * 0.04, 0.15 + (rng() - 0.5) * 0.06);
      fl.scale.setScalar(0.85 + rng() * 0.35);
      g.add(fl);
    }
  }

  return g;
}

/**
 * Framed carved wooden door (single or double) in local +Z outward space.
 * Bottom of door sits at local y = 0.
 */
function buildDoor(palette, ctx, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 1.06;
  const h = opts.h !== undefined ? opts.h : 1.88;
  const isDouble = !!opts.doubleDoor;
  const isBarn = !!opts.barnCrossBrace;
  const withThreshold = opts.withThreshold !== false;
  const plinthTop = opts.plinthTop !== undefined ? opts.plinthTop : 0.36;

  const g = new THREE.Group();

  // Outer heavy timber jambs & overhanging lintel
  const jamb = 0.11;
  addUnitBox(g, palette.geos, jamb, h, 0.16, -w * 0.5 - jamb * 0.35, h * 0.5, 0.04, palette.darkWoodMat, ctx, false, true);
  addUnitBox(g, palette.geos, jamb, h, 0.16, w * 0.5 + jamb * 0.35, h * 0.5, 0.04, palette.darkWoodMat, ctx, false, true);
  addUnitBox(g, palette.geos, w + jamb * 2 + 0.14, 0.14, 0.20, 0, h + 0.06, 0.06, palette.darkWoodMat, ctx, true, true);

  // Dark shadowy doorway backing recess (visible when hinged door swings open!)
  addUnitBox(g, palette.geos, w - 0.04, h - 0.04, 0.024, 0, h * 0.5, 0.016, palette.charcoalMat, ctx, false, false);

  let doorPivot = null;
  let doorPivotR = null;

  if (isDouble) {
    const leafW = w * 0.5 - 0.02;
    const pivots = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (w * 0.49), 0, 0.062);
      g.add(pivot);
      pivots.push(pivot);

      const lx = -side * (leafW * 0.5);
      // Door leaf plank body
      addUnitBox(pivot, palette.geos, leafW, h - 0.02, 0.065, lx, h * 0.5, 0, palette.doorWoodMat, ctx, false, true);
      // Inner meeting stile
      addUnitBox(pivot, palette.geos, 0.04, h - 0.04, 0.08, -side * (leafW - 0.02), h * 0.5, 0.008, palette.darkWoodMat, ctx, false, true);
      // Horizontal rails
      addUnitBox(pivot, palette.geos, leafW - 0.02, 0.09, 0.03, lx, h * 0.15, 0.04, palette.darkWoodMat, ctx, false, true);
      addUnitBox(pivot, palette.geos, leafW - 0.02, 0.09, 0.03, lx, h * 0.85, 0.04, palette.darkWoodMat, ctx, false, true);

      if (isBarn) {
        // Bold barn X cross-braces on each door leaf
        const diagLen = Math.hypot(leafW - 0.08, h * 0.68);
        const diagAng = Math.atan2(h * 0.68, leafW - 0.08);
        for (const dSign of [-1, 1]) {
          const brace = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
          brace.scale.set(diagLen, 0.085, 0.032);
          brace.position.set(lx, h * 0.5, 0.045);
          brace.rotation.z = dSign * diagAng;
          pivot.add(brace);
        }
      } else {
        // Tavern upper small window peep panes
        addUnitBox(pivot, palette.geos, leafW * 0.46, 0.34, 0.035, lx, h * 0.66, 0.032, palette.windowGlassMat, ctx, false, false);
        addUnitBox(pivot, palette.geos, leafW * 0.54, 0.045, 0.045, lx, h * 0.66, 0.042, palette.darkWoodMat, ctx, false, false);
        addUnitBox(pivot, palette.geos, 0.045, 0.38, 0.045, lx, h * 0.66, 0.042, palette.darkWoodMat, ctx, false, false);
      }

      // Iron strap hinges near outer jamb edge
      for (const hy of [h * 0.24, h * 0.76]) {
        addUnitBox(pivot, palette.geos, 0.28, 0.055, 0.025, -side * 0.16, hy, 0.055, palette.ironMat, ctx, false, false);
      }

      // Iron handle near meeting edge
      addUnitBox(pivot, palette.geos, 0.045, 0.16, 0.06, -side * (leafW - 0.10), h * 0.48, 0.058, palette.ironMat, ctx, false, false);
    }
    doorPivot = pivots[0];
    doorPivotR = pivots[1];
  } else {
    doorPivot = new THREE.Group();
    doorPivot.position.set(-w * 0.49, 0, 0.062);
    g.add(doorPivot);
    const lx = w * 0.49;

    // Single cottage/workshop door leaf anchored on left jamb pivot
    addUnitBox(doorPivot, palette.geos, w - 0.02, h - 0.02, 0.065, lx, h * 0.5, 0, palette.doorWoodMat, ctx, false, true);
    addUnitBox(doorPivot, palette.geos, w - 0.12, 0.085, 0.032, lx, h * 0.22, 0.038, palette.darkWoodMat, ctx, false, true);
    addUnitBox(doorPivot, palette.geos, w - 0.12, 0.085, 0.032, lx, h * 0.78, 0.038, palette.darkWoodMat, ctx, false, true);
    // Decorative arched top transom trim bar
    addUnitBox(doorPivot, palette.geos, w * 0.62, 0.07, 0.04, lx, h - 0.12, 0.04, palette.darkWoodMat, ctx, false, false);
    // Small cozy upper door peep glass
    addUnitBox(doorPivot, palette.geos, 0.26, 0.28, 0.032, lx, h * 0.62, 0.032, palette.windowGlassMat, ctx, false, false);
    addUnitBox(doorPivot, palette.geos, 0.30, 0.038, 0.045, lx, h * 0.62, 0.042, palette.darkWoodMat, ctx, false, false);
    addUnitBox(doorPivot, palette.geos, 0.038, 0.32, 0.045, lx, h * 0.62, 0.042, palette.darkWoodMat, ctx, false, false);

    // Iron strap hinges (left jamb side) & iron ring latch (right side)
    for (const hy of [h * 0.26, h * 0.74]) {
      addUnitBox(doorPivot, palette.geos, 0.32, 0.052, 0.028, 0.18, hy, 0.055, palette.ironMat, ctx, false, false);
    }
    addUnitBox(doorPivot, palette.geos, 0.055, 0.16, 0.06, w - 0.16, h * 0.47, 0.058, palette.ironMat, ctx, false, false);
  }

  g.userData = {
    doorPivot,
    doorPivotR,
  };

  // Grounded stone step threshold (anchored down to y = -0.75 - plinthTop in local door coords!)
  if (withThreshold) {
    const stepTop = -0.02;
    const stepBottom = -plinthTop - 0.75;
    const stepH = stepTop - stepBottom;
    addBox(g, w + 0.36, stepH, 0.46, 0, stepBottom + stepH * 0.5, 0.24, palette.stoneMat, ctx, true, true);
    // Lower front step
    const lowTop = -plinthTop * 0.52;
    const lowH = lowTop - stepBottom;
    if (lowH > 0.1) {
      addBox(g, w + 0.24, lowH, 0.34, 0, stepBottom + lowH * 0.5, 0.56, palette.stoneMat, ctx, false, true);
    }
  }

  return g;
}

/**
 * Half-timbered wall framing beams on a rectangular box (corner posts, belt rail, studs, knee braces).
 */
function addHalfTimberFraming(parent, palette, ctx, cfg) {
  const { w, d, yBottom, yTop, xOff = 0, zOff = 0, midRailRatio = 0.52, addKneeBraces = true } = cfg;
  const h = yTop - yBottom;
  const yMid = yBottom + h * 0.5;
  const beltY = yBottom + h * midRailRatio;
  const postSize = 0.17;

  // 4 stout corner posts
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addUnitBox(
        parent,
        palette.geos,
        postSize,
        h + 0.04,
        postSize,
        xOff + sx * (w * 0.5 - 0.04),
        yMid,
        zOff + sz * (d * 0.5 - 0.04),
        palette.darkWoodMat,
        ctx,
        false,
        true
      );
    }
  }

  // Horizontal sill, mid belt-rail, and top wall-plate beams
  const beamYs = [yBottom + 0.05, beltY, yTop - 0.04];
  for (const by of beamYs) {
    for (const sz of [-1, 1]) {
      addUnitBox(parent, palette.geos, w + 0.08, 0.12, 0.08, xOff, by, zOff + sz * (d * 0.5 + 0.01), palette.darkWoodMat, ctx, false, true);
    }
    for (const sx of [-1, 1]) {
      addUnitBox(parent, palette.geos, 0.08, 0.12, d + 0.08, xOff + sx * (w * 0.5 + 0.01), by, zOff, palette.darkWoodMat, ctx, false, true);
    }
  }

  // Intermediate vertical timber studs on side walls
  for (const sx of [-1, 1]) {
    const faceX = xOff + sx * (w * 0.5 + 0.01);
    for (const sz of [-0.28, 0.28]) {
      addUnitBox(parent, palette.geos, 0.075, h, 0.11, faceX, yMid, zOff + sz * d, palette.darkWoodMat, ctx, false, true);
    }
  }

  // Diagonal timber knee braces in upper corner bays (iconic BotW / Tudor half-timber charm!)
  if (addKneeBraces) {
    const braceH = Math.min(0.85, (yTop - beltY) * 0.86);
    const braceLen = braceH * 1.28;
    const braceY = yTop - braceH * 0.52;

    for (const sz of [-1, 1]) {
      const faceZ = zOff + sz * (d * 0.5 + 0.018);
      for (const sx of [-1, 1]) {
        const b = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
        b.scale.set(braceLen, 0.095, 0.065);
        b.position.set(xOff + sx * (w * 0.5 - braceH * 0.52), braceY, faceZ);
        b.rotation.z = -sx * 0.78;
        parent.add(b);
      }
    }

    for (const sx of [-1, 1]) {
      const faceX = xOff + sx * (w * 0.5 + 0.018);
      for (const sz of [-1, 1]) {
        const b = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
        b.scale.set(0.065, 0.095, braceLen);
        b.position.set(faceX, braceY, zOff + sz * (d * 0.5 - braceH * 0.52));
        b.rotation.x = sz * 0.78;
        parent.add(b);
      }
    }
  }
}

/**
 * Stone hearth chimney stack anchored down to y = -0.75 with crown cap & animated smoke puffs.
 */
function buildChimneyWithSmoke(parent, palette, ctx, cfg) {
  const {
    x,
    z,
    baseW = 0.96,
    baseD = 0.96,
    topY,
    puffCount = 4,
    seed = 77,
  } = cfg;

  const bottomY = -0.75;
  const splitY = Math.min(topY - 1.6, 2.35);

  // Lower wide hearth breast
  const lowerH = Math.max(1.2, splitY - bottomY);
  addBox(parent, baseW, lowerH, baseD, x, bottomY + lowerH * 0.5, z, palette.chimneyMat, ctx, true, true);

  // Tapered stone shoulder cap
  addBox(parent, baseW + 0.08, 0.14, baseD + 0.08, x, bottomY + lowerH + 0.04, z, palette.stoneMat, ctx, false, true);

  // Upper narrower chimney flue shaft
  const shaftW = baseW * 0.72;
  const shaftD = baseD * 0.72;
  const upperStart = bottomY + lowerH;
  const upperH = Math.max(0.8, topY - upperStart);
  addBox(parent, shaftW, upperH, shaftD, x, upperStart + upperH * 0.5, z, palette.chimneyMat, ctx, true, true);

  // Overhanging stone crown cap + chimney pot rim
  addBox(parent, shaftW + 0.20, 0.14, shaftD + 0.20, x, topY + 0.04, z, palette.stoneMat, ctx, true, true);
  addBox(parent, shaftW * 0.64, 0.16, shaftD * 0.64, x, topY + 0.17, z, palette.chimneyMat, ctx, false, true);
  addBox(parent, shaftW * 0.44, 0.04, shaftD * 0.44, x, topY + 0.24, z, palette.charcoalMat, ctx, false, false);

  // Animated soft semi-transparent smoke puffs
  const smokePuffs = [];
  const rng = makeRng(seed);
  for (let i = 0; i < puffCount; i++) {
    const frac = i / puffCount;
    const mat = palette.smokeMat.clone();
    mat.opacity = 0.44 * (1 - frac * 0.55);
    const puff = new THREE.Mesh(palette.geos.smokePuff, mat);
    const baseY = topY + 0.42 + frac * 1.45;
    const baseScale = 0.68 + frac * 0.85;
    puff.position.set(x + frac * 0.24, baseY, z + (rng() - 0.5) * 0.14);
    puff.scale.set(baseScale * 1.15, baseScale * 0.86, baseScale * 1.05);
    puff.userData = {
      baseX: x,
      baseY: topY + 0.38,
      baseZ: z,
      phase: frac * Math.PI * 2 + seed * 0.17,
      speed: 0.55 + (i % 2) * 0.12,
      maxRise: 1.85,
      baseScale: 0.72,
    };
    parent.add(puff);
    smokePuffs.push(puff);
  }

  return smokePuffs;
}

/**
 * Coopered wooden barrel with twin wrought-iron hoops (base sits at local y = 0).
 */
function buildWoodenBarrel(palette, ctx, opts = {}) {
  const g = new THREE.Group();
  const s = opts.scale !== undefined ? opts.scale : 1.0;
  g.scale.setScalar(s);

  const body = new THREE.Mesh(palette.geos.barrelBody, palette.woodMat);
  body.position.y = 0.34;
  applyShadow(body, ctx, true, true);
  g.add(body);

  for (const hy of [0.16, 0.52]) {
    const hoop = new THREE.Mesh(palette.geos.barrelHoop, palette.ironMat);
    hoop.rotation.x = Math.PI * 0.5;
    hoop.position.y = hy;
    g.add(hoop);
  }

  if (opts.withWater) {
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 9), palette.waterMat);
    water.position.y = 0.64;
    g.add(water);
  }

  return g;
}

/**
 * Wooden supply crate with diagonal framing slats (base sits at local y = 0).
 */
function buildWoodenCrate(palette, ctx, size = 0.56) {
  const g = new THREE.Group();
  addBox(g, size, size, size, 0, size * 0.5, 0, palette.woodMat, ctx, true, true);
  // Corner framing strips
  const t = 0.055;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addUnitBox(g, palette.geos, t, size + 0.01, t, sx * (size * 0.5 - 0.01), size * 0.5, sz * (size * 0.5 - 0.01), palette.darkWoodMat, ctx, false, true);
    }
  }
  addUnitBox(g, palette.geos, size + 0.02, t, size + 0.02, 0, size - t * 0.4, 0, palette.darkWoodMat, ctx, false, true);
  addUnitBox(g, palette.geos, size + 0.02, t, size + 0.02, 0, t * 0.4, 0, palette.darkWoodMat, ctx, false, true);
  return g;
}

// ============================================================================
// 1. COZY COTTAGE
// ============================================================================

function createCozyCottage(palette, ctx = {}, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 4.8;
  const d = opts.d !== undefined ? opts.d : 4.0;
  const h = opts.h !== undefined ? opts.h : 2.9;
  const roofVariant = (opts.roofVariant && palette.roofMats[opts.roofVariant]) ? opts.roofVariant : 'terracotta';
  const dir = opts.mirror ? -1 : 1;
  const seed = opts.seed !== undefined ? opts.seed : 11;

  const group = new THREE.Group();
  const lanterns = [];
  const plinthTop = 0.38;
  const wallH = h - plinthTop;
  const roofH = Math.max(1.55, w * 0.39);
  const roofMat = palette.roofMats[roofVariant];
  const shutterMat = palette.shutterMats[roofVariant] || palette.shutterMats.terracotta;
  const wallMat = (seed % 2 === 0) ? palette.plasterWarmMat : palette.plasterMat;

  // 1. Cobblestone plinth foundation (y = -0.75 .. +0.38)
  buildStonePlinth(group, palette, ctx, w + 0.36, d + 0.36, plinthTop);

  // 2. Main plaster body & half-timbered framing
  addBox(group, w, wallH, d, 0, plinthTop + wallH * 0.5, 0, wallMat, ctx, true, true);
  addHalfTimberFraming(group, palette, ctx, {
    w,
    d,
    yBottom: plinthTop,
    yTop: h,
    midRailRatio: 0.54,
    addKneeBraces: true,
  });

  // 3. True Pitched Gable Roof (ridge along Z, gables on front -Z & back +Z)
  buildGableRoof(group, palette, ctx, {
    w,
    d,
    wallTop: h,
    roofH,
    ridgeAxis: 'z',
    roofMat,
    gableMat: wallMat,
    eaveOut: 0.46,
    gableOut: 0.38,
    withTimberGableTrim: true,
  });

  // 4. Front wooden door on local -Z with stone threshold, pitched awning & hanging lantern
  const doorW = 1.06;
  const doorH = 1.88;
  const door = buildDoor(palette, ctx, { w: doorW, h: doorH, plinthTop });
  door.position.set(0, plinthTop, -d * 0.5);
  door.rotation.y = Math.PI;
  group.add(door);

  // Small pitched entrance awning above front door supported by diagonal brackets
  const awnW = doorW + 0.62;
  const awnDepth = 0.78;
  const awnBaseY = plinthTop + doorH + 0.24;
  const awnSlope = 0.34;
  const awnMesh = addBox(
    group,
    awnW,
    0.09,
    awnDepth / Math.cos(awnSlope),
    0,
    awnBaseY + 0.04,
    -d * 0.5 - awnDepth * 0.48,
    roofMat,
    ctx,
    true,
    true
  );
  awnMesh.rotation.x = -awnSlope;
  // Awning timber fascia lip & two diagonal timber knee brackets
  addUnitBox(group, palette.geos, awnW + 0.06, 0.09, 0.07, 0, awnBaseY - 0.10, -d * 0.5 - awnDepth * 0.92, palette.darkWoodMat, ctx, false, true);
  for (const sx of [-1, 1]) {
    const br = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
    br.scale.set(0.085, 0.085, 0.62);
    br.position.set(sx * (awnW * 0.42), awnBaseY - 0.28, -d * 0.5 - 0.28);
    br.rotation.x = 0.68;
    group.add(br);
  }

  // Hanging porch lantern under entrance awning
  const porchLantern = createLanternUnit(palette, ctx, { phase: seed * 1.3 + 0.4, scale: 0.92 });
  porchLantern.group.position.set(dir * (awnW * 0.38), awnBaseY - 0.12, -d * 0.5 - awnDepth * 0.72);
  group.add(porchLantern.group);
  lanterns.push(porchLantern);

  // 5. Glowing mullioned windows (front, front gable attic, sides, back)
  const winY = plinthTop + 1.24;
  const frontWinX = Math.max(1.26, w * 0.31);
  for (const sx of [-1, 1]) {
    const win = buildWindow(palette, ctx, {
      w: 0.80,
      h: 0.86,
      shutterMat,
      withShutters: true,
      withFlowerBox: true,
      seed: seed * 13 + (sx > 0 ? 5 : 2),
    });
    win.position.set(sx * frontWinX, winY, -d * 0.5);
    win.rotation.y = Math.PI;
    group.add(win);
  }

  // Cozy small glowing attic gable window on front (-Z)
  const atticWin = buildWindow(palette, ctx, {
    w: 0.56,
    h: 0.58,
    shutterMat,
    withShutters: false,
    withFlowerBox: false,
    seed: seed * 19,
  });
  atticWin.position.set(0, h + roofH * 0.34, -d * 0.5);
  atticWin.rotation.y = Math.PI;
  group.add(atticWin);

  // Non-chimney side wall window
  const sideWin1 = buildWindow(palette, ctx, {
    w: 0.94,
    h: 0.90,
    shutterMat,
    withShutters: true,
    withFlowerBox: true,
    seed: seed * 23,
  });
  sideWin1.position.set(-dir * w * 0.5, winY, -0.15);
  sideWin1.rotation.y = -dir * Math.PI * 0.5;
  group.add(sideWin1);

  // Chimney side wall smaller window (positioned forward of chimney)
  const sideWin2 = buildWindow(palette, ctx, {
    w: 0.72,
    h: 0.78,
    shutterMat,
    withShutters: false,
    withFlowerBox: true,
    seed: seed * 29,
  });
  sideWin2.position.set(dir * w * 0.5, winY, -d * 0.24);
  sideWin2.rotation.y = dir * Math.PI * 0.5;
  group.add(sideWin2);

  // Back wall (+Z) window
  const backWin = buildWindow(palette, ctx, {
    w: 0.88,
    h: 0.84,
    shutterMat,
    withShutters: true,
    withFlowerBox: true,
    seed: seed * 31,
  });
  backWin.position.set(-dir * 0.55, winY, d * 0.5);
  group.add(backWin);

  // 6. Stone chimney on side wall rising above ridge + animated smoke puffs
  const chimneyX = dir * (w * 0.5 + 0.24);
  const chimneyZ = d * 0.22;
  const smokePuffs = buildChimneyWithSmoke(group, palette, ctx, {
    x: chimneyX,
    z: chimneyZ,
    baseW: 0.92,
    baseD: 0.94,
    topY: h + roofH + 0.78,
    puffCount: 4,
    seed: seed * 37,
  });

  // 7. Cozy side detail: sheltered firewood rack + wooden barrel beside porch
  const rackX = -dir * (w * 0.5 + 0.34);
  const rackZ = d * 0.26;
  // Grounded timber base & side uprights for firewood rack
  addBox(group, 0.52, 0.42 + 0.75, 1.12, rackX, (0.42 - 0.75) * 0.5, rackZ, palette.stoneMat, ctx, false, true);
  for (const sz of [-0.50, 0.50]) {
    addUnitBox(group, palette.geos, 0.08, 0.92, 0.08, rackX, 0.42 + 0.46, rackZ + sz, palette.darkWoodMat, ctx, false, true);
  }
  const rackRoof = addBox(group, 0.66, 0.06, 1.24, rackX, 1.38, rackZ, palette.darkWoodMat, ctx, false, true);
  rackRoof.rotation.z = dir * 0.26;

  // Stacked firewood logs in 3 neat tiers
  for (let row = 0; row < 3; row++) {
    const cols = 5 - (row % 2);
    for (let col = 0; col < cols; col++) {
      const log = new THREE.Mesh(palette.geos.logPiece, (col + row) % 2 === 0 ? palette.woodMat : palette.doorWoodMat);
      log.rotation.z = Math.PI * 0.5;
      const lz = rackZ + ((col - (cols - 1) * 0.5) * 0.175);
      log.position.set(rackX, 0.50 + row * 0.145, lz);
      group.add(log);
    }
  }

  // Coopered wooden barrel beside front porch
  const barrel = buildWoodenBarrel(palette, ctx, { scale: 0.96 });
  barrel.position.set(-dir * (w * 0.42), plinthTop, -d * 0.5 - 0.44);
  // Grounding stone pad beneath barrel so it never floats off plinth edge
  addBox(group, 0.62, plinthTop + 0.75, 0.62, -dir * (w * 0.42), (plinthTop - 0.75) * 0.5, -d * 0.5 - 0.44, palette.stoneMat, ctx, false, true);
  group.add(barrel);

  group.userData = {
    kind: 'cottage',
    collider: {
      radius: Math.hypot(w * 0.5 + 0.45, d * 0.5 + 0.42) * 0.80,
      height: h + roofH + 0.95,
    },
    doorLocal: { x: 0, y: plinthTop, z: -d * 0.5 },
    doorPivot: door.userData.doorPivot,
    doorPivotR: null,
    lanterns,
    animated: {
      smokePuffs,
    },
  };

  return group;
}

// ============================================================================
// 2. VILLAGE TAVERN & INN (HERO 2-STORY LANDMARK)
// ============================================================================

function createVillageTavernInn(palette, ctx = {}, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 6.4;
  const d = opts.d !== undefined ? opts.d : 5.0;
  const h = opts.h !== undefined ? opts.h : 4.6;
  const roofVariant = (opts.roofVariant && palette.roofMats[opts.roofVariant]) ? opts.roofVariant : 'terracotta';
  const seed = opts.seed !== undefined ? opts.seed : 22;

  const group = new THREE.Group();
  const lanterns = [];

  const plinthTop = 0.45;
  const floor1H = Math.max(2.25, h * 0.51); // ~2.35m
  const floor2H = Math.max(2.00, h - floor1H); // ~2.15m -> wallTop = plinthTop + floor1H + floor2H
  const floor1Top = plinthTop + floor1H;
  const wallTop = floor1Top + floor2H;
  const jettyOut = 0.26;
  const w2 = w + jettyOut * 2;
  const d2 = d + jettyOut * 2;
  const roofH = Math.max(2.25, d2 * 0.46);
  const roofMat = palette.roofMats[roofVariant];
  const shutterMat = palette.shutterMats[roofVariant] || palette.shutterMats.terracotta;

  // 1. Solid Cobblestone Plinth Foundation (y = -0.75 .. +0.45)
  buildStonePlinth(group, palette, ctx, w + 0.42, d + 0.42, plinthTop);

  // 2. Ground Floor (stone lower wainscot + warm plaster upper wall)
  const wainscotH = 0.92;
  addBox(group, w + 0.06, wainscotH, d + 0.06, 0, plinthTop + wainscotH * 0.5, 0, palette.stoneMat, ctx, true, true);
  addBox(group, w, floor1H - wainscotH, d, 0, plinthTop + wainscotH + (floor1H - wainscotH) * 0.5, 0, palette.plasterMat, ctx, true, true);
  addHalfTimberFraming(group, palette, ctx, {
    w,
    d,
    yBottom: plinthTop,
    yTop: floor1Top,
    midRailRatio: 0.40,
    addKneeBraces: false,
  });

  // 3. Cantilevered Overhanging 2nd Floor "Jetty" with Carved Wooden Corbels
  addBox(group, w2, floor2H, d2, 0, floor1Top + floor2H * 0.5, 0, palette.plasterWarmMat, ctx, true, true);
  // Heavy floor jetty trim skirt
  addBox(group, w2 + 0.08, 0.16, d2 + 0.08, 0, floor1Top + 0.04, 0, palette.darkWoodMat, ctx, true, true);

  addHalfTimberFraming(group, palette, ctx, {
    w: w2,
    d: d2,
    yBottom: floor1Top,
    yTop: wallTop,
    midRailRatio: 0.48,
    addKneeBraces: true,
  });

  // Additional decorative 2nd-floor vertical bay posts along front & back
  for (const sz of [-1, 1]) {
    for (const bx of [-w2 * 0.24, 0, w2 * 0.24]) {
      addUnitBox(group, palette.geos, 0.12, floor2H, 0.08, bx, floor1Top + floor2H * 0.5, sz * (d2 * 0.5 + 0.012), palette.darkWoodMat, ctx, false, true);
    }
  }

  // Carved wooden corbel brackets supporting the 2nd floor overhang
  const corbelXs = [-w * 0.42, -w * 0.14, w * 0.14, w * 0.42];
  for (const sz of [-1, 1]) {
    for (const cx of corbelXs) {
      const corb = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
      corb.scale.set(0.13, 0.34, 0.28);
      corb.position.set(cx, floor1Top - 0.16, sz * (d * 0.5 + 0.10));
      corb.rotation.x = sz * 0.36;
      group.add(corb);
    }
  }
  const corbelZs = [-d * 0.36, 0, d * 0.36];
  for (const sx of [-1, 1]) {
    for (const cz of corbelZs) {
      const corb = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
      corb.scale.set(0.28, 0.34, 0.13);
      corb.position.set(sx * (w * 0.5 + 0.10), floor1Top - 0.16, cz);
      corb.rotation.z = -sx * 0.36;
      group.add(corb);
    }
  }

  // 4. Steep Pitched Shingled Gable Roof (ridge along X so front -Z is a dramatic sweeping roof slope!)
  buildGableRoof(group, palette, ctx, {
    w: w2,
    d: d2,
    wallTop,
    roofH,
    ridgeAxis: 'x',
    roofMat,
    gableMat: palette.plasterWarmMat,
    eaveOut: 0.48,
    gableOut: 0.42,
    withTimberGableTrim: true,
  });

  // 5. Cute Projecting Roof Dormer Window on the upper front (-Z) roof slope!
  const dormerW = 1.32;
  const dormerH = 1.04;
  const dormerZ = -d2 * 0.5 + 0.22;
  const dormerBaseY = wallTop + 0.14;
  const dormerGroup = new THREE.Group();
  dormerGroup.position.set(0.25, 0, 0);
  group.add(dormerGroup);

  // Dormer side cheeks & body extending back into main roof slope so zero gap
  const dormerDepth = 1.85;
  addBox(
    dormerGroup,
    dormerW,
    dormerH,
    dormerDepth,
    0,
    dormerBaseY + dormerH * 0.5,
    dormerZ + dormerDepth * 0.5,
    palette.plasterWarmMat,
    ctx,
    true,
    true
  );
  // Corner timber trim on dormer front
  for (const sx of [-1, 1]) {
    addUnitBox(dormerGroup, palette.geos, 0.10, dormerH, 0.10, sx * (dormerW * 0.5 - 0.02), dormerBaseY + dormerH * 0.5, dormerZ + 0.02, palette.darkWoodMat, ctx, false, true);
  }
  // Miniature pitched gable roof atop dormer (ridge along Z)
  buildGableRoof(dormerGroup, palette, ctx, {
    w: dormerW,
    d: dormerDepth + 0.18,
    wallTop: dormerBaseY + dormerH,
    roofH: 0.62,
    ridgeAxis: 'z',
    roofMat,
    gableMat: palette.plasterWarmMat,
    eaveOut: 0.22,
    gableOut: 0.20,
    slabThick: 0.09,
    zOff: dormerZ + dormerDepth * 0.5 - 0.04,
    withTimberGableTrim: false,
  });
  // Glowing dormer window + tiny flower box
  const dormerWin = buildWindow(palette, ctx, {
    w: 0.78,
    h: 0.72,
    shutterMat,
    withShutters: false,
    withFlowerBox: true,
    seed: seed * 41,
  });
  dormerWin.position.set(0, dormerBaseY + dormerH * 0.52, dormerZ);
  dormerWin.rotation.y = Math.PI;
  dormerGroup.add(dormerWin);

  // 6. Wide Covered Front Wooden Porch (-Z) with 3 Sturdy Timber Columns, Steps & Sloped Roof
  const porchDepth = 1.62;
  const porchW = w - 0.10;
  const porchFrontZ = -d * 0.5 - porchDepth;
  const deckY = plinthTop - 0.03;

  // Grounded stone skirt underneath porch deck (y = -0.75 .. deckY - 0.08)
  const skirtH = (deckY - 0.08) - (-0.75);
  addBox(group, porchW - 0.06, skirtH, porchDepth, 0, -0.75 + skirtH * 0.5, -d * 0.5 - porchDepth * 0.5, palette.stoneMat, ctx, true, true);
  // Wooden plank porch deck
  addBox(group, porchW + 0.12, 0.11, porchDepth + 0.12, 0, deckY - 0.03, -d * 0.5 - porchDepth * 0.5, palette.woodMat, ctx, true, true);

  // Wide wooden entrance steps descending from porch deck in front of double doors
  const doorX = -1.12;
  const stepW = 2.05;
  const stepBottom = -0.75;
  const step1Top = deckY - 0.14;
  addBox(group, stepW, step1Top - stepBottom, 0.36, doorX, stepBottom + (step1Top - stepBottom) * 0.5, porchFrontZ - 0.22, palette.woodMat, ctx, false, true);
  const step2Top = deckY - 0.30;
  addBox(group, stepW, step2Top - stepBottom, 0.36, doorX, stepBottom + (step2Top - stepBottom) * 0.5, porchFrontZ - 0.56, palette.woodMat, ctx, false, true);

  // 3 sturdy timber porch columns on stone plinth bases (left, center-right, far-right)
  const colXs = [-porchW * 0.46, 0.62, porchW * 0.46];
  const porchHeaderY = floor1Top - 0.26;
  const colH = porchHeaderY - deckY;
  for (const cx of colXs) {
    // Stone column plinth foot
    addBox(group, 0.28, 0.24, 0.28, cx, deckY + 0.12, porchFrontZ + 0.14, palette.stoneMat, ctx, false, true);
    // Stout timber column
    addBox(group, 0.18, colH, 0.18, cx, deckY + colH * 0.5, porchFrontZ + 0.14, palette.darkWoodMat, ctx, true, true);
    // Angled knee braces at column top
    for (const sx of [-1, 1]) {
      if ((cx < -porchW * 0.4 && sx < 0) || (cx > porchW * 0.4 && sx > 0)) continue;
      const br = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
      br.scale.set(0.46, 0.085, 0.085);
      br.position.set(cx + sx * 0.19, porchHeaderY - 0.20, porchFrontZ + 0.14);
      br.rotation.z = sx * 0.78;
      group.add(br);
    }
  }
  // Porch top timber header beam
  addBox(group, porchW + 0.18, 0.16, 0.18, 0, porchHeaderY, porchFrontZ + 0.14, palette.darkWoodMat, ctx, true, true);

  // Cozy wooden porch railing along the right terrace bay (+0.62 .. +porchW*0.46)
  const railSpan = porchW * 0.46 - 0.62;
  const railCenterX = (0.62 + porchW * 0.46) * 0.5;
  addUnitBox(group, palette.geos, railSpan, 0.08, 0.09, railCenterX, deckY + 0.74, porchFrontZ + 0.14, palette.darkWoodMat, ctx, false, true);
  addUnitBox(group, palette.geos, railSpan, 0.07, 0.07, railCenterX, deckY + 0.16, porchFrontZ + 0.14, palette.darkWoodMat, ctx, false, true);
  for (let i = 1; i <= 5; i++) {
    const bx = 0.62 + (i / 6) * railSpan;
    addUnitBox(group, palette.geos, 0.06, 0.58, 0.06, bx, deckY + 0.45, porchFrontZ + 0.14, palette.woodMat, ctx, false, true);
  }

  // Sloped shingled porch roof
  const pSlope = Math.atan2(0.46, porchDepth + 0.22);
  const pRoofLen = (porchDepth + 0.48) / Math.cos(pSlope);
  const pRoof = addBox(
    group,
    porchW + 0.46,
    0.11,
    pRoofLen,
    0,
    porchHeaderY + 0.26,
    -d * 0.5 - porchDepth * 0.50,
    roofMat,
    ctx,
    true,
    true
  );
  pRoof.rotation.x = -pSlope;

  // 7. Double-Door Tavern Entrance + Twin Hanging Porch Lanterns
  const doubleDoor = buildDoor(palette, ctx, {
    w: 1.48,
    h: 1.96,
    doubleDoor: true,
    withThreshold: false,
    plinthTop,
  });
  doubleDoor.position.set(doorX, plinthTop, -d * 0.5);
  doubleDoor.rotation.y = Math.PI;
  group.add(doubleDoor);

  for (let i = 0; i < 2; i++) {
    const lx = doorX + (i === 0 ? -0.98 : 0.98);
    const lUnit = createLanternUnit(palette, ctx, { phase: seed * 0.9 + i * 2.1, scale: 1.0 });
    lUnit.group.position.set(lx, porchHeaderY - 0.06, porchFrontZ + 0.14);
    group.add(lUnit.group);
    lanterns.push(lUnit);
  }

  // 8. Projecting Iron Bracket + Gently Swinging Painted Wooden Tavern Signboard
  const signPostX = -porchW * 0.46;
  const signBracketY = floor1Top + 0.32;
  // Wrought-iron horizontal arm & curved scroll brace projecting forward-left
  addUnitBox(group, palette.geos, 0.055, 0.055, 1.18, signPostX - 0.06, signBracketY, porchFrontZ - 0.36, palette.ironMat, ctx, false, false);
  const ironBrace = new THREE.Mesh(palette.geos.unitBox, palette.ironMat);
  ironBrace.scale.set(0.045, 0.045, 0.72);
  ironBrace.position.set(signPostX - 0.06, signBracketY - 0.24, porchFrontZ - 0.10);
  ironBrace.rotation.x = 0.72;
  group.add(ironBrace);

  // Sign pivot group for gentle wind swing animation
  const signPivot = new THREE.Group();
  signPivot.position.set(signPostX - 0.06, signBracketY - 0.03, porchFrontZ - 0.58);
  signPivot.userData = { axis: 'z', maxAngle: 0.14, speed: 1.35, phase: seed * 0.5 };

  // Iron hanging rings
  for (const rz of [-0.26, 0.26]) {
    addUnitBox(signPivot, palette.geos, 0.035, 0.14, 0.035, 0, -0.07, rz, palette.ironMat, ctx, false, false);
  }
  // Wooden painted signboard (readable from road approach along X/Z!)
  const signMaterials = [
    palette.tavernSignMat, // +X
    palette.tavernSignMat, // -X
    palette.darkWoodMat,   // +Y
    palette.darkWoodMat,   // -Y
    palette.tavernSignMat, // +Z
    palette.tavernSignMat, // -Z
  ];
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 0.78), signMaterials);
  signBoard.position.set(0, -0.50, 0);
  applyShadow(signBoard, ctx, true, true);
  signPivot.add(signBoard);
  group.add(signPivot);

  // 9. Warm Glowing Mullioned Windows on Both Floors
  // Ground floor right bay large tavern window
  const gfWin = buildWindow(palette, ctx, {
    w: 1.24,
    h: 1.02,
    shutterMat,
    withShutters: true,
    withFlowerBox: true,
    seed: seed * 43,
  });
  gfWin.position.set(1.78, plinthTop + 1.28, -d * 0.5);
  gfWin.rotation.y = Math.PI;
  group.add(gfWin);

  // Second floor front jetty: 3 charming windows with shutters & flower boxes
  const f2WinY = floor1Top + floor2H * 0.50;
  for (const [idx, wx] of [-2.05, 0.0, 2.05].entries()) {
    const win = buildWindow(palette, ctx, {
      w: 0.90,
      h: 0.92,
      shutterMat,
      withShutters: true,
      withFlowerBox: true,
      seed: seed * 47 + idx * 7,
    });
    win.position.set(wx, f2WinY, -d2 * 0.5);
    win.rotation.y = Math.PI;
    group.add(win);
  }

  // Side walls windows (left -X both floors, right +X forward of chimney)
  const leftWin1 = buildWindow(palette, ctx, { w: 1.0, h: 0.96, shutterMat, withShutters: true, withFlowerBox: true, seed: seed * 53 });
  leftWin1.position.set(-w * 0.5, plinthTop + 1.28, 0.15);
  leftWin1.rotation.y = -Math.PI * 0.5;
  group.add(leftWin1);

  const leftWin2 = buildWindow(palette, ctx, { w: 0.92, h: 0.90, shutterMat, withShutters: true, withFlowerBox: true, seed: seed * 59 });
  leftWin2.position.set(-w2 * 0.5, f2WinY, 0.15);
  leftWin2.rotation.y = -Math.PI * 0.5;
  group.add(leftWin2);

  const rightWin2 = buildWindow(palette, ctx, { w: 0.84, h: 0.86, shutterMat, withShutters: false, withFlowerBox: true, seed: seed * 61 });
  rightWin2.position.set(w2 * 0.5, f2WinY, -1.15);
  rightWin2.rotation.y = Math.PI * 0.5;
  group.add(rightWin2);

  // Back wall (+Z) windows
  for (const bx of [-1.65, 1.65]) {
    const bWin = buildWindow(palette, ctx, { w: 0.92, h: 0.90, shutterMat, withShutters: true, withFlowerBox: false, seed: seed * 67 + bx * 3 });
    bWin.position.set(bx, f2WinY, d2 * 0.5);
    group.add(bWin);
  }

  // 10. Massive Stone Hearth Chimney on +X wall with Smoke Puffs
  const smokePuffs = buildChimneyWithSmoke(group, palette, ctx, {
    x: w2 * 0.5 + 0.24,
    z: 0.85,
    baseW: 1.18,
    baseD: 1.32,
    topY: wallTop + roofH + 0.88,
    puffCount: 4,
    seed: seed * 71,
  });

  // 11. Tavern Porch Props: Ale Kegs/Barrels & Rustic Wooden Bench
  const barrel1 = buildWoodenBarrel(palette, ctx, { scale: 0.98 });
  barrel1.position.set(2.45, deckY + 0.02, -d * 0.5 - 0.56);
  group.add(barrel1);

  // Horizontal ale keg on wooden cradle
  const kegGroup = new THREE.Group();
  kegGroup.position.set(1.52, deckY + 0.02, -d * 0.5 - 0.58);
  addUnitBox(kegGroup, palette.geos, 0.44, 0.14, 0.10, 0, 0.07, -0.18, palette.darkWoodMat, ctx, false, true);
  addUnitBox(kegGroup, palette.geos, 0.44, 0.14, 0.10, 0, 0.07, 0.18, palette.darkWoodMat, ctx, false, true);
  const keg = buildWoodenBarrel(palette, ctx, { scale: 0.86 });
  keg.rotation.z = Math.PI * 0.5;
  keg.position.set(0.30, 0.34, 0);
  kegGroup.add(keg);
  group.add(kegGroup);

  // Small tavern barrel near left steps
  const barrel2 = buildWoodenBarrel(palette, ctx, { scale: 0.88 });
  barrel2.position.set(-2.52, deckY + 0.02, -d * 0.5 - 0.52);
  group.add(barrel2);

  group.userData = {
    kind: 'tavern_inn',
    collider: {
      radius: Math.hypot(w2 * 0.5 + 0.55, (d2 + porchDepth) * 0.5) * 0.78,
      height: wallTop + roofH + 1.05,
    },
    doorLocal: { x: doorX, y: plinthTop, z: -d * 0.5 },
    doorPivot: doubleDoor.userData.doorPivot,
    doorPivotR: doubleDoor.userData.doorPivotR,
    lanterns,
    animated: {
      smokePuffs,
      signPivot,
    },
  };

  return group;
}

// ============================================================================
// 3. BLACKSMITH & WAGON REPAIR WORKSHOP
// ============================================================================

function createBlacksmithWorkshop(palette, ctx = {}, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 5.2;
  const d = opts.d !== undefined ? opts.d : 4.2;
  const h = opts.h !== undefined ? opts.h : 2.8;
  const roofVariant = (opts.roofVariant && palette.roofMats[opts.roofVariant]) ? opts.roofVariant : 'slate';
  const seed = opts.seed !== undefined ? opts.seed : 33;

  const group = new THREE.Group();
  const lanterns = [];

  const plinthTop = 0.36;
  const roofMat = palette.roofMats[roofVariant];
  const shutterMat = palette.shutterMats[roofVariant] || palette.shutterMats.slate;

  // Split total width into enclosed main stone workshop (left) + open forge bay (right)
  const mainW = w * 0.62;       // ~3.22m
  const forgeW = w * 0.44;      // ~2.29m
  const totalW = mainW + forgeW;
  const mainCenterX = -totalW * 0.5 + mainW * 0.5;
  const dividerX = mainCenterX + mainW * 0.5;
  const forgeRightX = dividerX + forgeW;
  const forgeCenterX = dividerX + forgeW * 0.5;

  // 1. Solid Cobblestone Plinth Foundation spanning BOTH main shop & open forge patio (y = -0.75 .. +0.36)
  buildStonePlinth(group, palette, ctx, totalW + 0.40, d + 0.38, plinthTop, 0, 0);

  // 2. Enclosed Workshop: Heavy Cobblestone Lower Walls + Timber-Framed Upper Walls
  const stoneWallH = (h - plinthTop) * 0.66;
  const upperWallH = (h - plinthTop) - stoneWallH;
  addBox(group, mainW, stoneWallH, d, mainCenterX, plinthTop + stoneWallH * 0.5, 0, palette.stoneMat, ctx, true, true);
  addBox(group, mainW - 0.04, upperWallH, d - 0.04, mainCenterX, plinthTop + stoneWallH + upperWallH * 0.5, 0, palette.plasterMat, ctx, true, true);

  addHalfTimberFraming(group, palette, ctx, {
    w: mainW,
    d,
    yBottom: plinthTop,
    yTop: h,
    xOff: mainCenterX,
    midRailRatio: 0.66,
    addKneeBraces: true,
  });

  // 3. Pitched Slate-Shingle Gable Roof over Main Workshop (ridge along Z)
  const roofH = Math.max(1.52, mainW * 0.48);
  buildGableRoof(group, palette, ctx, {
    w: mainW,
    d,
    wallTop: h,
    roofH,
    ridgeAxis: 'z',
    roofMat,
    gableMat: palette.woodMat,
    eaveOut: 0.42,
    gableOut: 0.36,
    xOff: mainCenterX,
    withTimberGableTrim: true,
  });

  // 4. Front Heavy Iron-Bound Door & Window on Main Workshop (-Z)
  const door = buildDoor(palette, ctx, {
    w: 1.08,
    h: 1.88,
    plinthTop,
  });
  door.position.set(mainCenterX - 0.58, plinthTop, -d * 0.5);
  door.rotation.y = Math.PI;
  group.add(door);

  const frontWin = buildWindow(palette, ctx, {
    w: 0.78,
    h: 0.80,
    shutterMat,
    withShutters: false,
    withFlowerBox: false,
    seed: seed * 11,
  });
  frontWin.position.set(mainCenterX + 0.76, plinthTop + 1.24, -d * 0.5);
  frontWin.rotation.y = Math.PI;
  group.add(frontWin);

  // Back window on workshop
  const backWin = buildWindow(palette, ctx, {
    w: 0.84,
    h: 0.80,
    shutterMat,
    withShutters: true,
    withFlowerBox: false,
    seed: seed * 17,
  });
  backWin.position.set(mainCenterX, plinthTop + 1.24, d * 0.5);
  group.add(backWin);

  // 5. Open-Sided Sloped Lean-To Forge Canopy (+X side) Supported by Stout Posts
  const canopyOuterY = 2.26;
  const canopyInnerY = h + 0.14;
  const canopySpan = forgeW + 0.34;
  const canopySlope = Math.atan2(canopyInnerY - canopyOuterY, canopySpan);
  const canopyLen = canopySpan / Math.cos(canopySlope) + 0.24;

  const canopyRoof = addBox(
    group,
    canopyLen,
    0.12,
    d + 0.66,
    dividerX + canopySpan * 0.5 - 0.08,
    (canopyInnerY + canopyOuterY) * 0.5 + 0.06,
    0,
    roofMat,
    ctx,
    true,
    true
  );
  canopyRoof.rotation.z = -canopySlope;

  // Exposed canopy rafters & outer header beam
  const postX = forgeRightX - 0.12;
  const postH = canopyOuterY - plinthTop;
  for (const sz of [-1, 1]) {
    const pz = sz * (d * 0.5 - 0.18);
    // Stone column base
    addBox(group, 0.32, 0.26, 0.32, postX, plinthTop + 0.13, pz, palette.stoneMat, ctx, false, true);
    // Stout timber post
    addBox(group, 0.20, postH, 0.20, postX, plinthTop + postH * 0.5, pz, palette.darkWoodMat, ctx, true, true);
    // Diagonal timber braces
    const br = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
    br.scale.set(0.09, 0.09, 0.56);
    br.position.set(postX, canopyOuterY - 0.24, pz - sz * 0.22);
    br.rotation.x = sz * 0.78;
    group.add(br);
  }
  addBox(group, 0.18, 0.18, d + 0.36, postX, canopyOuterY, 0, palette.darkWoodMat, ctx, true, true);

  for (let i = 0; i < 4; i++) {
    const rz = ((i / 3) - 0.5) * (d + 0.10);
    const raf = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
    raf.scale.set(canopyLen - 0.1, 0.09, 0.09);
    raf.position.set(dividerX + canopySpan * 0.5 - 0.08, (canopyInnerY + canopyOuterY) * 0.5 - 0.02, rz);
    raf.rotation.z = -canopySlope;
    group.add(raf);
  }

  // 6. Stone Hearth Forge Chimney & Glowing Animated Ember Bed (NO PointLight!)
  const forgeX = forgeCenterX - 0.06;
  const forgeZ = d * 0.5 - 0.88;
  const hearthTopY = plinthTop + 0.92;

  // Heavy stone hearth forge table
  addBox(group, 1.38, 0.92, 1.08, forgeX, plinthTop + 0.46, forgeZ, palette.chimneyMat, ctx, true, true);
  // Raised back & side stone curb around fire bowl
  addBox(group, 1.44, 0.24, 0.22, forgeX, hearthTopY + 0.10, forgeZ + 0.44, palette.stoneMat, ctx, false, true);
  for (const sx of [-1, 1]) {
    addBox(group, 0.20, 0.20, 0.92, forgeX + sx * 0.60, hearthTopY + 0.08, forgeZ, palette.stoneMat, ctx, false, true);
  }
  // Stone chimney hood & flue rising cleanly through canopy roof
  const smokePuffs = buildChimneyWithSmoke(group, palette, ctx, {
    x: forgeX,
    z: forgeZ + 0.38,
    baseW: 1.08,
    baseD: 0.72,
    topY: h + roofH + 0.42,
    puffCount: 3,
    seed: seed * 53,
  });
  // Angled stone smoke hood above embers
  const hood = addBox(group, 1.18, 0.52, 0.82, forgeX, hearthTopY + 0.92, forgeZ + 0.14, palette.chimneyMat, ctx, true, true);
  hood.rotation.x = 0.22;

  // Dark charcoal coal bed + 6 glowing ember chunks + warm radial glow sprite
  addBox(group, 0.88, 0.10, 0.62, forgeX, hearthTopY + 0.02, forgeZ - 0.04, palette.charcoalMat, ctx, false, true);

  const emberMeshes = [];
  const rng = makeRng(seed * 71);
  for (let i = 0; i < 6; i++) {
    const eMat = palette.emberMat.clone();
    const em = new THREE.Mesh(palette.geos.emberChunk, eMat);
    const ex = forgeX + (rng() - 0.5) * 0.62;
    const ez = forgeZ - 0.06 + (rng() - 0.5) * 0.36;
    em.position.set(ex, hearthTopY + 0.08 + rng() * 0.04, ez);
    em.scale.set(0.85 + rng() * 0.55, 0.55 + rng() * 0.35, 0.85 + rng() * 0.55);
    em.rotation.set(rng() * 2, rng() * 2, rng() * 2);
    em.userData = {
      phase: i * 1.15 + seed * 0.3,
      baseIntensity: 1.50 + rng() * 0.35,
    };
    group.add(em);
    emberMeshes.push(em);
  }

  const glowTex = (ctx && ctx.warmGlowTex) || palette.warmGlowTex;
  const emberGlowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xff7b29,
    transparent: true,
    opacity: 0.90,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const emberGlow = new THREE.Sprite(emberGlowMat);
  emberGlow.position.set(forgeX, hearthTopY + 0.34, forgeZ - 0.06);
  emberGlow.scale.set(1.75, 1.55, 1.0);
  group.add(emberGlow);

  // 7. Iron Anvil on Thick Oak Stump
  const anvilX = forgeCenterX - 0.08;
  const anvilZ = -0.36;
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.58, 9), palette.darkWoodMat);
  stump.position.set(anvilX, plinthTop + 0.29, anvilZ);
  applyShadow(stump, ctx, true, true);
  group.add(stump);

  const anvilGroup = new THREE.Group();
  anvilGroup.position.set(anvilX, plinthTop + 0.58, anvilZ);
  anvilGroup.rotation.y = 0.28;
  // Anvil base, narrow waist, flat working face, and tapered conical horn
  addUnitBox(anvilGroup, palette.geos, 0.42, 0.09, 0.26, 0, 0.045, 0, palette.ironMat, ctx, true, true);
  addUnitBox(anvilGroup, palette.geos, 0.26, 0.14, 0.18, 0, 0.15, 0, palette.ironMat, ctx, true, true);
  addUnitBox(anvilGroup, palette.geos, 0.52, 0.12, 0.24, -0.04, 0.27, 0, palette.ironMat, ctx, true, true);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.34, 6), palette.ironMat);
  horn.rotation.z = -Math.PI * 0.5;
  horn.position.set(0.36, 0.27, 0);
  anvilGroup.add(horn);
  group.add(anvilGroup);

  // 8. Water Quenching Barrel (with shimmering blue water top!)
  const quenchBarrel = buildWoodenBarrel(palette, ctx, { scale: 0.94, withWater: true });
  quenchBarrel.position.set(postX - 0.36, plinthTop, -d * 0.5 + 0.72);
  group.add(quenchBarrel);

  // 9. Wagon Wheel & Tool Repair Rack Leaning Against Left Wall (-X)
  const wheelX = mainCenterX - mainW * 0.5 - 0.18;
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(wheelX, plinthTop + 0.56, -0.45);
  wheelGroup.rotation.z = -0.22;
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.055, 6, 12), palette.woodMat);
  wheelRim.rotation.y = Math.PI * 0.5;
  applyShadow(wheelRim, ctx, true, true);
  wheelGroup.add(wheelRim);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8), palette.ironMat);
  wheelHub.rotation.z = Math.PI * 0.5;
  wheelGroup.add(wheelHub);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
    spoke.scale.set(0.05, 0.98, 0.05);
    spoke.rotation.x = (i / 6) * Math.PI;
    wheelGroup.add(spoke);
  }
  group.add(wheelGroup);

  // Wooden tool/blade rack leaning near back-left corner
  const rackGroup = new THREE.Group();
  rackGroup.position.set(wheelX - 0.04, plinthTop, 0.86);
  for (const sz of [-0.36, 0.36]) {
    addUnitBox(rackGroup, palette.geos, 0.07, 1.15, 0.07, 0, 0.58, sz, palette.darkWoodMat, ctx, false, true);
  }
  addUnitBox(rackGroup, palette.geos, 0.08, 0.08, 0.84, 0, 0.35, 0, palette.darkWoodMat, ctx, false, true);
  addUnitBox(rackGroup, palette.geos, 0.08, 0.08, 0.84, 0, 0.92, 0, palette.darkWoodMat, ctx, false, true);
  // Iron smithy tools / blades resting in rack
  for (let i = 0; i < 3; i++) {
    const tz = (i - 1) * 0.22;
    addUnitBox(rackGroup, palette.geos, 0.035, 0.88, 0.07, -0.06, 0.72, tz, palette.ironMat, ctx, false, false);
    addUnitBox(rackGroup, palette.geos, 0.045, 0.22, 0.05, -0.06, 0.22, tz, palette.woodMat, ctx, false, false);
  }
  group.add(rackGroup);

  // 10. Hanging Forge Lantern at Front-Right Canopy Corner
  const forgeLantern = createLanternUnit(palette, ctx, { phase: seed * 1.1 + 0.8, scale: 0.98 });
  forgeLantern.group.position.set(postX - 0.14, canopyOuterY - 0.06, -d * 0.5 + 0.18);
  group.add(forgeLantern.group);
  lanterns.push(forgeLantern);

  group.userData = {
    kind: 'blacksmith',
    collider: {
      radius: Math.hypot(totalW * 0.5 + 0.25, d * 0.5 + 0.25) * 0.82,
      height: h + roofH + 0.65,
    },
    doorLocal: { x: mainCenterX - 0.58, y: plinthTop, z: -d * 0.5 },
    doorPivot: door.userData.doorPivot,
    doorPivotR: null,
    lanterns,
    animated: {
      embers: {
        meshes: emberMeshes,
        glowSprite: emberGlow,
        baseScale: 1.75,
      },
      smokePuffs,
    },
  };

  return group;
}

// ============================================================================
// 4. COZY COUNTRYSIDE MARKET STALL
// ============================================================================

function createMarketStall(palette, ctx = {}, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 3.0;
  const d = opts.d !== undefined ? opts.d : 2.0;
  const h = opts.h !== undefined ? opts.h : 2.5;
  const awningVariant = (opts.awningVariant !== undefined ? opts.awningVariant : 0) % palette.awningMats.length;
  const seed = opts.seed !== undefined ? opts.seed : 44;

  const group = new THREE.Group();
  const lanterns = [];
  const rng = makeRng(seed);

  const deckTopY = 0.16;
  const awningMat = palette.awningMats[awningVariant];

  // 1. Grounding Wooden Floor Platform (down to y = -0.45) + Stone Corner Footing Skirt (down to y = -0.75)
  addBox(group, w + 0.24, 0.34, d + 0.24, 0, -0.75 + 0.17, 0, palette.stoneMat, ctx, false, true);
  const deckH = deckTopY - (-0.45);
  addBox(group, w + 0.30, deckH, d + 0.30, 0, -0.45 + deckH * 0.5, 0, palette.woodMat, ctx, true, true);
  // Dark timber deck trim border
  addBox(group, w + 0.34, 0.07, d + 0.34, 0, deckTopY - 0.02, 0, palette.darkWoodMat, ctx, false, true);

  // 2. Corner Timber Posts with Diagonal Braces (front taller than back for welcoming customer view!)
  const frontTopY = h;
  const backTopY = h - 0.34;
  const px = w * 0.5 - 0.10;
  const pz = d * 0.5 - 0.10;

  for (const sx of [-1, 1]) {
    // Front post (-Z)
    const fh = frontTopY - deckTopY;
    addBox(group, 0.13, fh, 0.13, sx * px, deckTopY + fh * 0.5, -pz, palette.darkWoodMat, ctx, true, true);
    // Back post (+Z)
    const bh = backTopY - deckTopY;
    addBox(group, 0.13, bh, 0.13, sx * px, deckTopY + bh * 0.5, pz, palette.darkWoodMat, ctx, true, true);

    // Diagonal front knee brace
    const brF = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
    brF.scale.set(0.46, 0.075, 0.075);
    brF.position.set(sx * (px - 0.18), frontTopY - 0.22, -pz);
    brF.rotation.z = -sx * 0.78;
    group.add(brF);

    // Side sloped rafter beam connecting front & back post tops
    const sideSlope = Math.atan2(frontTopY - backTopY, pz * 2);
    const sideLen = (pz * 2 + 0.45) / Math.cos(sideSlope);
    const sideBeam = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
    sideBeam.scale.set(0.10, 0.10, sideLen);
    sideBeam.position.set(sx * px, (frontTopY + backTopY) * 0.5, 0);
    sideBeam.rotation.x = sideSlope;
    group.add(sideBeam);
  }

  // Front & back horizontal crossbars
  addBox(group, w + 0.16, 0.11, 0.11, 0, frontTopY, -pz, palette.darkWoodMat, ctx, false, true);
  addBox(group, w + 0.16, 0.11, 0.11, 0, backTopY, pz, palette.darkWoodMat, ctx, false, true);

  // 3. Sloped Striped Fabric Canopy + Scalloped Valance Trim along Front (-Z) Edge
  const canopySlope = Math.atan2(frontTopY - backTopY, pz * 2);
  const canopyDepth = (d + 0.58) / Math.cos(canopySlope);
  const canopyMesh = addBox(
    group,
    w + 0.42,
    0.06,
    canopyDepth,
    0,
    (frontTopY + backTopY) * 0.5 + 0.07,
    0,
    awningMat,
    ctx,
    true,
    true
  );
  canopyMesh.rotation.x = canopySlope;

  // Scalloped hanging valance flaps along front (-Z) awning edge
  const frontLipZ = -(d + 0.54) * 0.5;
  const frontLipY = frontTopY + 0.10;
  const flapCount = 8;
  const flapSpan = (w + 0.36) / flapCount;
  const flapGeo = new THREE.CylinderGeometry(flapSpan * 0.48, flapSpan * 0.48, 0.04, 8, 1, false, -Math.PI * 0.5, Math.PI);
  for (let i = 0; i < flapCount; i++) {
    const fx = -((w + 0.36) * 0.5) + (i + 0.5) * flapSpan;
    const flap = new THREE.Mesh(flapGeo, awningMat);
    flap.rotation.x = Math.PI * 0.5;
    flap.position.set(fx, frontLipY - 0.02, frontLipZ);
    group.add(flap);
  }

  // 4. Sturdy Wooden Display Counter with Draped Cloth Runner
  const counterY = deckTopY + 0.84;
  const counterZ = -d * 0.5 + 0.46;
  const counterW = w - 0.24;
  const counterD = 0.76;

  // Counter base cabinet & thick wooden countertop
  addBox(group, counterW, 0.80, counterD - 0.08, 0, deckTopY + 0.40, counterZ, palette.woodMat, ctx, true, true);
  addBox(group, counterW + 0.10, 0.08, counterD + 0.06, 0, counterY, counterZ, palette.darkWoodMat, ctx, true, true);

  // Draped linen counter cloth overhanging the front (-Z) edge
  addUnitBox(group, palette.geos, counterW * 0.72, 0.025, counterD + 0.12, 0, counterY + 0.045, counterZ - 0.02, palette.clothMat, ctx, false, true);
  addUnitBox(group, palette.geos, counterW * 0.72, 0.34, 0.03, 0, counterY - 0.13, counterZ - counterD * 0.5 - 0.05, palette.clothMat, ctx, false, true);

  // 5. Stylized Colorful Market Wares (Crates of Apples, Bread Basket, Herbs & Elixir Potions)
  const topSurfaceY = counterY + 0.06;

  // Tilted Wooden Produce Crate 1: Red Apples (left)
  const crate1 = new THREE.Group();
  crate1.position.set(-0.78, topSurfaceY + 0.10, counterZ + 0.02);
  crate1.rotation.x = -0.22;
  addUnitBox(crate1, palette.geos, 0.62, 0.16, 0.46, 0, 0, 0, palette.woodMat, ctx, false, true);
  for (let i = 0; i < 6; i++) {
    const ap = new THREE.Mesh(palette.geos.appleSphere, palette.produceMats.appleRed);
    ap.position.set(((i % 3) - 1) * 0.16, 0.10 + (i >= 3 ? 0.02 : 0), (i >= 3 ? 0.10 : -0.10));
    crate1.add(ap);
  }
  group.add(crate1);

  // Tilted Produce Crate 2: Green Apples & Herbs (center-left)
  const crate2 = new THREE.Group();
  crate2.position.set(-0.08, topSurfaceY + 0.10, counterZ + 0.02);
  crate2.rotation.x = -0.22;
  addUnitBox(crate2, palette.geos, 0.58, 0.16, 0.44, 0, 0, 0, palette.woodMat, ctx, false, true);
  for (let i = 0; i < 4; i++) {
    const ap = new THREE.Mesh(palette.geos.appleSphere, palette.produceMats.appleGreen);
    ap.position.set(((i % 2) - 0.5) * 0.18 - 0.08, 0.10, (i >= 2 ? 0.09 : -0.09));
    crate2.add(ap);
  }
  // Fresh green herb tufts
  for (let i = 0; i < 2; i++) {
    const hb = new THREE.Mesh(palette.geos.leafCluster, palette.foliageMat);
    hb.position.set(0.14, 0.11, i === 0 ? -0.07 : 0.08);
    hb.scale.set(0.8, 0.65, 0.8);
    crate2.add(hb);
  }
  group.add(crate2);

  // Woven Bread Basket with Crusty Golden Loaves (center-right)
  const basket = new THREE.Group();
  basket.position.set(0.58, topSurfaceY, counterZ + 0.02);
  const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.18, 9), palette.hayMat);
  bBody.position.y = 0.09;
  basket.add(bBody);
  for (let i = 0; i < 3; i++) {
    const loaf = new THREE.Mesh(palette.geos.breadLoaf, palette.produceMats.breadGold);
    loaf.scale.set(1.25, 0.72, 0.85);
    loaf.position.set((i - 1) * 0.09, 0.19 + (i === 1 ? 0.04 : 0), (i - 1) * 0.04);
    loaf.rotation.y = (rng() - 0.5) * 0.8;
    basket.add(loaf);
  }
  group.add(basket);

  // Glowing Potion Bottles on right end of counter
  const potionConfigs = [
    { x: 1.02, z: counterZ - 0.08, mat: palette.produceMats.potionBlue },
    { x: 1.15, z: counterZ + 0.05, mat: palette.produceMats.potionPink },
    { x: 1.00, z: counterZ + 0.12, mat: palette.produceMats.potionBlue },
  ];
  for (const pc of potionConfigs) {
    const bot = new THREE.Mesh(palette.geos.bottleBody, pc.mat);
    bot.position.set(pc.x, topSurfaceY + 0.075, pc.z);
    group.add(bot);
    const neck = new THREE.Mesh(palette.geos.bottleNeck, palette.woodMat);
    neck.position.set(pc.x, topSurfaceY + 0.17, pc.z);
    group.add(neck);
  }

  // Extra supply crate tucked at rear-left corner of deck
  const backCrate = buildWoodenCrate(palette, ctx, 0.52);
  backCrate.position.set(-w * 0.32, deckTopY, d * 0.24);
  backCrate.rotation.y = 0.18;
  group.add(backCrate);

  // 6. Painted Wooden Merchant Signboard mounted beneath front crossbar
  const signMats = [
    palette.darkWoodMat,
    palette.darkWoodMat,
    palette.darkWoodMat,
    palette.darkWoodMat,
    palette.stallSignMat,
    palette.stallSignMat,
  ];
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 0.06), signMats);
  sign.position.set(-0.22, frontTopY - 0.28, -pz + 0.02);
  group.add(sign);

  // 7. Cozy Hanging Lantern from iron arm on front-right corner post
  addUnitBox(group, palette.geos, 0.05, 0.05, 0.42, px, frontTopY - 0.22, -pz - 0.20, palette.ironMat, ctx, false, false);
  const stallLantern = createLanternUnit(palette, ctx, { phase: seed * 1.4, scale: 0.90 });
  stallLantern.group.position.set(px, frontTopY - 0.25, -pz - 0.36);
  group.add(stallLantern.group);
  lanterns.push(stallLantern);

  group.userData = {
    kind: 'market_stall',
    collider: {
      radius: Math.hypot(w * 0.5 + 0.15, d * 0.5 + 0.15) * 0.80,
      height: h + 0.32,
    },
    lanterns,
    animated: {},
  };

  return group;
}

// ============================================================================
// 5. RUSTIC TIMBER STORAGE BARN & GRANARY
// ============================================================================

function createStorageBarn(palette, ctx = {}, opts = {}) {
  const w = opts.w !== undefined ? opts.w : 4.6;
  const d = opts.d !== undefined ? opts.d : 3.8;
  const h = opts.h !== undefined ? opts.h : 3.1;
  const roofVariant = (opts.roofVariant && palette.roofMats[opts.roofVariant]) ? opts.roofVariant : 'shake';
  const seed = opts.seed !== undefined ? opts.seed : 55;

  const group = new THREE.Group();
  const lanterns = [];

  const plinthTop = 0.40;
  const wallH = h - plinthTop;
  const roofH = Math.max(2.05, w * 0.47);
  const roofMat = palette.roofMats[roofVariant];

  // 1. Cobblestone Foundation Plinth (y = -0.75 .. +0.40)
  buildStonePlinth(group, palette, ctx, w + 0.38, d + 0.38, plinthTop);

  // 2. Vertical Wood-Plank Barn Walls & Heavy Timber Frame
  addBox(group, w, wallH, d, 0, plinthTop + wallH * 0.5, 0, palette.woodMat, ctx, true, true);
  addHalfTimberFraming(group, palette, ctx, {
    w,
    d,
    yBottom: plinthTop,
    yTop: h,
    midRailRatio: 0.62,
    addKneeBraces: true,
  });

  // 3. Steeply Pitched Shake-Shingle Gable Roof (ridge along Z, gable peak facing -Z road!)
  buildGableRoof(group, palette, ctx, {
    w,
    d,
    wallTop: h,
    roofH,
    ridgeAxis: 'z',
    roofMat,
    gableMat: palette.woodMat,
    eaveOut: 0.48,
    gableOut: 0.42,
    withTimberGableTrim: true,
  });

  // 4. Wide Cross-Braced Double Barn Doors on local -Z
  const barnDoors = buildDoor(palette, ctx, {
    w: 1.88,
    h: 2.04,
    doubleDoor: true,
    barnCrossBrace: true,
    withThreshold: true,
    plinthTop,
  });
  barnDoors.position.set(0, plinthTop, -d * 0.5);
  barnDoors.rotation.y = Math.PI;
  group.add(barnDoors);

  // 5. Upper Hayloft Shutter Door + Projecting Wooden Pulley Beam under Front Gable Peak
  const loftY = h + roofH * 0.30;
  const loftW = 0.96;
  const loftH = 0.98;
  const loftZ = -d * 0.5;

  // Dark recess & golden stored hay peeking out of the hayloft
  addUnitBox(group, palette.geos, loftW, loftH, 0.06, 0, loftY, loftZ - 0.01, palette.charcoalMat, ctx, false, false);
  addUnitBox(group, palette.geos, loftW - 0.16, loftH * 0.42, 0.14, 0, loftY - loftH * 0.24, loftZ - 0.05, palette.hayMat, ctx, false, true);

  // Heavy hayloft timber frame
  addUnitBox(group, palette.geos, loftW + 0.18, 0.10, 0.12, 0, loftY + loftH * 0.5 + 0.03, loftZ - 0.04, palette.darkWoodMat, ctx, false, true);
  addUnitBox(group, palette.geos, loftW + 0.22, 0.10, 0.16, 0, loftY - loftH * 0.5 - 0.03, loftZ - 0.06, palette.darkWoodMat, ctx, false, true);
  for (const sx of [-1, 1]) {
    addUnitBox(group, palette.geos, 0.09, loftH, 0.12, sx * (loftW * 0.5 + 0.03), loftY, loftZ - 0.04, palette.darkWoodMat, ctx, false, true);

    // Half-open wooden hayloft shutters hinged outward toward -Z
    const sPivot = new THREE.Group();
    sPivot.position.set(sx * (loftW * 0.5 + 0.02), loftY, loftZ - 0.06);
    sPivot.rotation.y = sx * 0.52;
    const sh = new THREE.Mesh(palette.geos.unitBox, palette.doorWoodMat);
    sh.scale.set(loftW * 0.48, loftH - 0.06, 0.05);
    sh.position.set(sx * loftW * 0.24, 0, 0);
    sPivot.add(sh);
    // Iron hinge on shutter
    addUnitBox(sPivot, palette.geos, 0.22, 0.045, 0.065, sx * 0.12, 0.24, -0.005, palette.ironMat, ctx, false, false);
    addUnitBox(sPivot, palette.geos, 0.22, 0.045, 0.065, sx * 0.12, -0.24, -0.005, palette.ironMat, ctx, false, false);
    group.add(sPivot);
  }

  // Projecting Wooden Pulley / Hoist Beam directly under front gable peak
  const beamY = h + roofH - 0.34;
  addBox(group, 0.16, 0.16, 1.24, 0, beamY, loftZ - 0.52, palette.darkWoodMat, ctx, true, true);
  // Diagonal timber brace under pulley beam
  const hoistBrace = new THREE.Mesh(palette.geos.unitBox, palette.darkWoodMat);
  hoistBrace.scale.set(0.11, 0.11, 0.68);
  hoistBrace.position.set(0, beamY - 0.24, loftZ - 0.24);
  hoistBrace.rotation.x = 0.72;
  group.add(hoistBrace);

  // Iron pulley wheel + rope + hoist hook hanging from pulley beam tip
  const pulleyWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 8), palette.ironMat);
  pulleyWheel.rotation.z = Math.PI * 0.5;
  pulleyWheel.position.set(0, beamY - 0.17, loftZ - 0.96);
  group.add(pulleyWheel);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 5), palette.hayMat);
  rope.position.set(0, beamY - 0.62, loftZ - 0.96);
  group.add(rope);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 5, 8, Math.PI * 1.45), palette.ironMat);
  hook.position.set(0, beamY - 1.08, loftZ - 0.96);
  hook.rotation.z = Math.PI * 0.8;
  group.add(hook);

  // 6. Slatted Wooden Ventilation Windows on Side Walls
  for (const sx of [-1, 1]) {
    const winX = sx * (w * 0.5 + 0.02);
    const wy = plinthTop + 1.56;
    addUnitBox(group, palette.geos, 0.06, 0.66, 0.74, winX, wy, 0, palette.darkWoodMat, ctx, false, true);
    for (let s = 0; s < 4; s++) {
      addUnitBox(group, palette.geos, 0.09, 0.055, 0.60, winX + sx * 0.02, wy - 0.20 + s * 0.135, 0, palette.woodMat, ctx, false, false);
    }
  }

  // 7. Hanging Warm Barn Lantern beside Double Doors
  addUnitBox(group, palette.geos, 0.07, 0.07, 0.36, 1.32, plinthTop + 2.08, -d * 0.5 - 0.18, palette.darkWoodMat, ctx, false, false);
  const barnLantern = createLanternUnit(palette, ctx, { phase: seed * 1.2 + 0.6, scale: 0.95 });
  barnLantern.group.position.set(1.32, plinthTop + 2.04, -d * 0.5 - 0.32);
  group.add(barnLantern.group);
  lanterns.push(barnLantern);

  // 8. Cozy Rural Props: Stacked Golden Hay Bales (-X side) & Supply Crates + Barrel (+X front corner)
  const hayX = -w * 0.5 - 0.56;
  // Grounded stone/wood pad under hay bales so they never float on slopes
  addBox(group, 0.92, plinthTop + 0.75, 1.88, hayX, (plinthTop - 0.75) * 0.5, 0.25, palette.stoneMat, ctx, false, true);

  const balePositions = [
    { x: hayX, y: plinthTop + 0.24, z: -0.22, rot: 0.05 },
    { x: hayX + 0.02, y: plinthTop + 0.24, z: 0.68, rot: -0.07 },
    { x: hayX, y: plinthTop + 0.72, z: 0.22, rot: 0.10 },
  ];
  for (const bp of balePositions) {
    const bale = new THREE.Group();
    bale.position.set(bp.x, bp.y, bp.z);
    bale.rotation.y = bp.rot;
    addBox(bale, 0.68, 0.46, 0.82, 0, 0, 0, palette.hayMat, ctx, true, true);
    // Twine binding straps
    for (const tz of [-0.22, 0.22]) {
      addUnitBox(bale, palette.geos, 0.71, 0.48, 0.032, 0, 0, tz, palette.darkWoodMat, ctx, false, false);
    }
    group.add(bale);
  }

  // Supply crates & wooden barrel beside right (+X) wall
  const crateX = w * 0.5 + 0.48;
  addBox(group, 0.82, plinthTop + 0.75, 1.56, crateX, (plinthTop - 0.75) * 0.5, -0.58, palette.stoneMat, ctx, false, true);

  const crateA = buildWoodenCrate(palette, ctx, 0.62);
  crateA.position.set(crateX, plinthTop, -0.88);
  crateA.rotation.y = 0.08;
  group.add(crateA);

  const crateB = buildWoodenCrate(palette, ctx, 0.48);
  crateB.position.set(crateX - 0.04, plinthTop + 0.62, -0.86);
  crateB.rotation.y = -0.22;
  group.add(crateB);

  const sideBarrel = buildWoodenBarrel(palette, ctx, { scale: 0.94 });
  sideBarrel.position.set(crateX, plinthTop, -0.14);
  group.add(sideBarrel);

  group.userData = {
    kind: 'storage_barn',
    collider: {
      radius: Math.hypot(w * 0.5 + 0.65, d * 0.5 + 0.42) * 0.80,
      height: h + roofH + 0.55,
    },
    doorLocal: { x: 0, y: plinthTop, z: -d * 0.5 },
    doorPivot: barnDoors.userData.doorPivot,
    doorPivotR: barnDoors.userData.doorPivotR,
    lanterns,
    animated: {},
  };

  return group;
}

export {
  createVillageMaterialPalette,
  createCozyCottage,
  createVillageTavernInn,
  createBlacksmithWorkshop,
  createMarketStall,
  createStorageBarn,
};
