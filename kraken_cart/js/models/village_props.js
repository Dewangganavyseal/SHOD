import { HC } from '../hc.js';

const THREE = HC.THREE;

// ============================================================================
// DETERMINISTIC HELPERS & GEOMETRY MERGER
// ============================================================================

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function makeRng(seed = 1) {
  let s = (seed * 1.6180339 + 13.37);
  return () => {
    s += 1.0;
    return hash01(s);
  };
}

function cel(ctx, mat, opts = { rimStrength: 0.16, shadowLift: 0.58 }) {
  if (ctx && typeof ctx.applyStylizedCelShading === 'function') {
    ctx.applyStylizedCelShading(mat, opts);
  }
  return mat;
}

function getTerrainY(ctx, x, z) {
  if (ctx && typeof ctx.getTerrainHeight === 'function') {
    return ctx.getTerrainHeight(x, z);
  }
  return 0;
}

function setShadow(mesh, ctx, cast = true, receive = true) {
  const isMobile = !!(ctx && ctx.isMobileDevice);
  mesh.castShadow = cast && !isMobile;
  mesh.receiveShadow = receive;
  return mesh;
}

function mergeGeometries(rawGeos, includeColor = false) {
  const prepared = [];
  let totalVerts = 0;

  for (let i = 0; i < rawGeos.length; i++) {
    const src = rawGeos[i];
    if (!src) continue;
    const g = src.index ? src.toNonIndexed() : src.clone();
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) {
      g.dispose();
      continue;
    }
    if (!g.getAttribute('normal')) {
      g.computeVertexNormals();
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    if (includeColor && !g.getAttribute('color')) {
      const cols = new Float32Array(pos.count * 3);
      cols.fill(1.0);
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    prepared.push(g);
    totalVerts += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  if (totalVerts === 0) return merged;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = includeColor ? new Float32Array(totalVerts * 3) : null;

  let offset = 0;
  for (let i = 0; i < prepared.length; i++) {
    const g = prepared[i];
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const count = pos.count;

    positions.set(pos.array, offset * 3);
    normals.set(norm.array, offset * 3);
    uvs.set(uv.array, offset * 2);
    if (includeColor) {
      const col = g.getAttribute('color');
      colors.set(col.array, offset * 3);
    }
    offset += count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (includeColor) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  merged.computeBoundingSphere();
  return merged;
}

function paintGeoVertexColor(geo, hexColor) {
  const c = new THREE.Color(hexColor);
  const count = geo.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURES (PAINTERLY BOTW / TRUCKFUL PALETTE)
// ============================================================================

function makeCanvasTexture(w, h, drawFn, repeatX = 1, repeatY = 1) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) drawFn(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  } else {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function drawRoundedRect(g, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
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

function createCobblestoneTexture() {
  return makeCanvasTexture(256, 256, (g, w, h) => {
    // Warm mortar ground
    g.fillStyle = '#5e5a52';
    g.fillRect(0, 0, w, h);

    const rows = 6;
    const rowH = h / rows;
    const stoneTones = ['#9d988c', '#b0a999', '#8a857b', '#a89f8d', '#939689', '#bfb7a5'];

    for (let r = 0; r < rows; r++) {
      const cols = 4 + (r % 2);
      const colW = w / cols;
      const shift = (r % 2) * (colW * 0.45);
      for (let c = -1; c <= cols; c++) {
        const seed = r * 31 + c * 17 + 5;
        const jx = (hash01(seed) - 0.5) * 6;
        const jy = (hash01(seed + 1) - 0.5) * 4;
        const x = c * colW + shift + jx + 3;
        const y = r * rowH + jy + 3;
        const sw = colW - 6 - hash01(seed + 2) * 3;
        const sh = rowH - 6 - hash01(seed + 3) * 3;
        const rad = 8;

        const tone = stoneTones[Math.floor(hash01(seed + 4) * stoneTones.length)];
        g.fillStyle = tone;
        drawRoundedRect(g, x, y, Math.max(8, sw), Math.max(8, sh), rad);
        g.fill();

        // Warm upper-left painterly highlight
        g.fillStyle = 'rgba(255, 250, 236, 0.22)';
        drawRoundedRect(g, x + 2, y + 2, Math.max(4, sw * 0.72), Math.max(3, sh * 0.36), rad * 0.6);
        g.fill();

        // Lower-right soft bevel shadow
        g.fillStyle = 'rgba(42, 40, 38, 0.22)';
        g.fillRect(x + 3, y + sh - 5, Math.max(4, sw - 6), 4);

        // Subtle cozy moss fleck on occasional mortar seams
        if (hash01(seed + 9) > 0.72) {
          g.fillStyle = 'rgba(104, 134, 72, 0.45)';
          g.beginPath();
          g.arc(x + 4, y + sh - 1, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
}

function createWoodPlankTexture(baseHex = '#8d623f', grainHex = '#6c472b', highlightHex = '#a87a52') {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = baseHex;
    g.fillRect(0, 0, w, h);

    // Subtle plank bands
    const planks = 4;
    const ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const y = p * ph;
      g.fillStyle = p % 2 === 0 ? 'rgba(255,235,205,0.06)' : 'rgba(30,15,5,0.08)';
      g.fillRect(0, y, w, ph);

      // Horizontal fibers
      for (let i = 0; i < 14; i++) {
        const s = p * 53 + i * 11;
        const fy = y + 2 + hash01(s) * (ph - 4);
        g.strokeStyle = i % 3 === 0 ? highlightHex : grainHex;
        g.globalAlpha = 0.22 + hash01(s + 2) * 0.22;
        g.lineWidth = 1 + hash01(s + 3) * 1.4;
        g.beginPath();
        g.moveTo(0, fy);
        g.bezierCurveTo(
          w * 0.33, fy + (hash01(s + 4) - 0.5) * 4,
          w * 0.66, fy + (hash01(s + 5) - 0.5) * 4,
          w, fy
        );
        g.stroke();
      }
      g.globalAlpha = 1.0;

      // Plank seam
      g.fillStyle = 'rgba(35, 20, 10, 0.45)';
      g.fillRect(0, y + ph - 2, w, 2);
    }
  });
}

function createShingleTexture() {
  return makeCanvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6f4230';
    g.fillRect(0, 0, w, h);

    const rows = 8;
    const cols = 7;
    const rh = h / rows;
    const cw = w / cols;
    const palette = ['#8f5038', '#9f5b3f', '#7e4632', '#a86545', '#764938', '#8a573d'];

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const s = r * 43 + c * 19;
        const x = c * cw + offset;
        const y = r * rh;
        const col = palette[Math.floor(hash01(s) * palette.length)];

        // Drop shadow under shingle tab
        g.fillStyle = 'rgba(28, 14, 10, 0.38)';
        g.fillRect(x + 1, y + rh - 4, cw - 2, 5);

        // Scalloped cedar shingle tab
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x + 1, y);
        g.lineTo(x + cw - 1, y);
        g.lineTo(x + cw - 1, y + rh - 6);
        g.quadraticCurveTo(x + cw * 0.5, y + rh + 2, x + 1, y + rh - 6);
        g.closePath();
        g.fill();

        // Subtle sunlit ridge highlight
        g.fillStyle = 'rgba(255, 224, 186, 0.14)';
        g.fillRect(x + 3, y + 2, cw - 6, 4);

        // Occasional painterly moss touch on cedar shingles
        if (hash01(s + 7) > 0.84) {
          g.fillStyle = 'rgba(114, 146, 74, 0.42)';
          g.beginPath();
          g.ellipse(x + cw * 0.4, y + rh * 0.7, 7, 4, 0.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
}

function createWellWaterTexture() {
  return makeCanvasTexture(256, 256, (g, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Deep luminous turquoise-teal radial gradient (crystal clear spring water!)
    const bg = g.createRadialGradient(cx, cy, 8, cx, cy, w * 0.52);
    bg.addColorStop(0.0, '#6ce6e2');
    bg.addColorStop(0.32, '#35bec2');
    bg.addColorStop(0.68, '#1a8b99');
    bg.addColorStop(0.92, '#115d6b');
    bg.addColorStop(1.0, '#0c4350');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // Gentle concentric water ripple rings
    for (let i = 1; i <= 5; i++) {
      g.strokeStyle = i % 2 === 0 ? 'rgba(220, 255, 252, 0.42)' : 'rgba(145, 245, 240, 0.28)';
      g.lineWidth = 2.2 - i * 0.2;
      g.beginPath();
      g.arc(cx + Math.sin(i * 1.4) * 4, cy + Math.cos(i * 1.7) * 4, i * 22, 0, Math.PI * 2);
      g.stroke();
    }

    // Painterly BotW caustic arcs
    g.strokeStyle = 'rgba(230, 255, 252, 0.55)';
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const a = hash01(i * 13 + 3) * Math.PI * 2;
      const r = 18 + hash01(i * 13 + 7) * 86;
      const span = 0.25 + hash01(i * 13 + 11) * 0.48;
      g.lineWidth = 1.6 + hash01(i * 13 + 19) * 2.0;
      g.beginPath();
      g.arc(cx, cy, r, a, a + span);
      g.stroke();
    }

    // Soft sky sheen crescent & sparkle flecks
    g.fillStyle = 'rgba(255, 255, 255, 0.36)';
    g.beginPath();
    g.ellipse(cx - 26, cy - 28, 34, 15, -0.55, 0, Math.PI * 2);
    g.fill();

    for (let i = 0; i < 10; i++) {
      const a = hash01(i * 29 + 4) * Math.PI * 2;
      const r = 12 + hash01(i * 29 + 9) * 76;
      g.fillStyle = 'rgba(255, 255, 248, 0.72)';
      g.beginPath();
      g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2 + hash01(i * 29) * 2.0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function createSignboardTexture(title = 'DESA LEMNOS') {
  return makeCanvasTexture(256, 128, (g, w, h) => {
    // Rich carved oak background
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#7c5234');
    bg.addColorStop(0.5, '#6a442a');
    bg.addColorStop(1, '#583721');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // Subtle wood grain strokes
    g.strokeStyle = 'rgba(40, 20, 8, 0.28)';
    for (let y = 8; y < h; y += 9) {
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 2, w * 0.7, y - 2, w, y);
      g.stroke();
    }

    // Carved decorative inner cream/gold border
    g.strokeStyle = '#d9b574';
    g.lineWidth = 3;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = '#3c2515';
    g.lineWidth = 2;
    g.strokeRect(14, 14, w - 28, h - 28);

    // Cozy corner leaf emblems
    const corners = [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]];
    g.fillStyle = '#97bf68';
    for (const [cx, cy] of corners) {
      g.beginPath();
      g.arc(cx, cy, 4.5, 0, Math.PI * 2);
      g.fill();
    }

    // Small rustic golden sun/wheat crest at top center
    g.fillStyle = '#f2c76e';
    g.beginPath();
    g.arc(w * 0.5, 28, 6, 0, Math.PI * 2);
    g.fill();

    // Hand-painted storybook village name
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 28px Georgia, serif';
    g.fillStyle = '#2d1a0d';
    g.fillText(title, w * 0.5 + 2, h * 0.57 + 2);
    g.fillStyle = '#fff1cf';
    g.fillText(title, w * 0.5, h * 0.57);

    // Subtitle flourish line
    g.strokeStyle = '#e4c27c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.24, h * 0.78);
    g.lineTo(w * 0.76, h * 0.78);
    g.stroke();
  });
}

function createParchmentTexture(variant = 0) {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    const bases = ['#f5e7c4', '#efe0b8', '#f8edd0', '#e9d5a7'];
    g.fillStyle = bases[variant % bases.length];
    g.fillRect(0, 0, w, h);

    // Aged edge vignette
    g.strokeStyle = 'rgba(138, 102, 58, 0.35)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);

    // Header sketch or title bar
    g.fillStyle = '#5c3f28';
    g.fillRect(22, 22, w - 44, 7);

    if (variant % 2 === 0) {
      // Little quest map / creature sketch box
      g.strokeStyle = '#755438';
      g.lineWidth = 2;
      g.strokeRect(24, 36, 40, 34);
      g.fillStyle = '#9c6e46';
      g.beginPath();
      g.arc(44, 53, 9, 0, Math.PI * 2);
      g.fill();
    }

    // Ink script lines
    g.fillStyle = 'rgba(72, 50, 32, 0.72)';
    const startY = variant % 2 === 0 ? 78 : 42;
    for (let y = startY; y < h - 18; y += 11) {
      const lw = 48 + hash01(variant * 19 + y) * 34;
      g.fillRect(20, y, Math.min(w - 40, lw), 3.5);
    }

    // Tiny crimson wax seal stamp at bottom-right
    g.fillStyle = '#b9342c';
    g.beginPath();
    g.arc(w - 26, h - 24, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#df5b4e';
    g.beginPath();
    g.arc(w - 28, h - 26, 3, 0, Math.PI * 2);
    g.fill();
  });
}

function createCanvasSackTexture() {
  return makeCanvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#cbb38a';
    g.fillRect(0, 0, w, h);

    // Woven burlap crosshatch
    g.strokeStyle = 'rgba(118, 92, 58, 0.25)';
    g.lineWidth = 2;
    for (let i = 0; i < w; i += 6) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(w, i);
      g.stroke();
    }
    // Red-ochre painted flour stripe
    g.fillStyle = 'rgba(164, 72, 52, 0.45)';
    g.fillRect(0, h * 0.44, w, 10);
  });
}

function createFallbackWarmGlowTex() {
  return makeCanvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0.0, 'rgba(255, 250, 220, 1.0)');
    grad.addColorStop(0.32, 'rgba(255, 198, 102, 0.72)');
    grad.addColorStop(0.70, 'rgba(255, 140, 48, 0.22)');
    grad.addColorStop(1.0, 'rgba(255, 120, 30, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// ============================================================================
// SHARED PALETTE CACHE (PER CTX, MINIMAL DRAW CALLS & SHARED TEXTURES)
// ============================================================================

const paletteCache = new WeakMap();
let fallbackPalette = null;

function getPropPalette(ctx) {
  if (ctx && typeof ctx === 'object' && paletteCache.has(ctx)) {
    return paletteCache.get(ctx);
  }
  if (!ctx && fallbackPalette) return fallbackPalette;

  const stoneTex = createCobblestoneTexture();
  const woodTex = createWoodPlankTexture('#926842', '#6a472a', '#b08357');
  const darkWoodTex = createWoodPlankTexture('#66452d', '#472e1c', '#825a3c');
  const shingleTex = createShingleTexture();
  const wellWaterTex = createWellWaterTexture();
  const sackTex = createCanvasSackTexture();
  const parchmentTextures = [
    createParchmentTexture(0),
    createParchmentTexture(1),
    createParchmentTexture(2),
    createParchmentTexture(3)
  ];

  const stoneMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xd8d2c6,
    map: stoneTex,
    roughness: 0.92,
    metalness: 0.02
  }), { rimStrength: 0.16, shadowLift: 0.56 });

  const stoneLightMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xe6dfd0,
    map: stoneTex,
    roughness: 0.88,
    metalness: 0.02
  }), { rimStrength: 0.18, shadowLift: 0.60 });

  const stoneWetDarkMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x4b5759,
    map: stoneTex,
    roughness: 0.78,
    side: THREE.DoubleSide
  }), { rimStrength: 0.10, shadowLift: 0.45 });

  const stonePathMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: stoneTex,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.02
  }), { rimStrength: 0.14, shadowLift: 0.60 });

  const woodMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xd8b996,
    map: woodTex,
    roughness: 0.86,
    metalness: 0.02
  }), { rimStrength: 0.15, shadowLift: 0.58 });

  const darkWoodMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc29e7e,
    map: darkWoodTex,
    roughness: 0.88,
    metalness: 0.02
  }), { rimStrength: 0.14, shadowLift: 0.54 });

  const shingleMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xe8d0bf,
    map: shingleTex,
    roughness: 0.84,
    metalness: 0.04
  }), { rimStrength: 0.20, shadowLift: 0.58 });

  const ironMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x383e45,
    roughness: 0.56,
    metalness: 0.35
  }), { rimStrength: 0.22, shadowLift: 0.50 });

  const ropeMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc8aa74,
    roughness: 0.95
  }), { rimStrength: 0.14, shadowLift: 0.60 });

  const plasterMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xefe3c8,
    roughness: 0.90
  }), { rimStrength: 0.14, shadowLift: 0.64 });

  const soilMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x4c3726,
    roughness: 0.96
  }), { rimStrength: 0.08, shadowLift: 0.52 });

  const leafBrightMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x5ca642,
    roughness: 0.82
  }), { rimStrength: 0.20, shadowLift: 0.62 });

  const leafDeepMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x3e7e34,
    roughness: 0.86
  }), { rimStrength: 0.16, shadowLift: 0.58 });

  const flowerMats = [
    cel(ctx, new THREE.MeshStandardMaterial({ color: 0xf7c93b, roughness: 0.72 }), { rimStrength: 0.22, shadowLift: 0.66 }), // Sunflower gold
    cel(ctx, new THREE.MeshStandardMaterial({ color: 0x5eb8f5, roughness: 0.72 }), { rimStrength: 0.22, shadowLift: 0.66 }), // Sky blue
    cel(ctx, new THREE.MeshStandardMaterial({ color: 0xf06595, roughness: 0.72 }), { rimStrength: 0.22, shadowLift: 0.66 }), // Berry pink
    cel(ctx, new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: 0.74 }), { rimStrength: 0.20, shadowLift: 0.68 })  // White daisy
  ];

  const flowerCenterMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xe89b24,
    roughness: 0.78
  }), { rimStrength: 0.18, shadowLift: 0.62 });

  const waxSealMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc2352c,
    roughness: 0.55
  }), { rimStrength: 0.22, shadowLift: 0.56 });

  const sackMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xe8d9be,
    map: sackTex,
    roughness: 0.94
  }), { rimStrength: 0.14, shadowLift: 0.60 });

  const wellWaterDepthMat = new THREE.MeshBasicMaterial({
    color: 0x0b3f4a
  });

  const wellWaterSurfaceMat = new THREE.MeshStandardMaterial({
    color: 0x72ebe7,
    map: wellWaterTex,
    emissive: 0x105d68,
    emissiveIntensity: 0.38,
    roughness: 0.14,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88
  });

  const wellWaterSheenMat = new THREE.MeshBasicMaterial({
    color: 0xb8fff9,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });

  const parchmentMats = parchmentTextures.map((tex) => cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    roughness: 0.88,
    side: THREE.DoubleSide
  }), { rimStrength: 0.10, shadowLift: 0.68 }));

  const warmGlowTex = (ctx && ctx.warmGlowTex) ? ctx.warmGlowTex : createFallbackWarmGlowTex();

  const pal = {
    stoneMat,
    stoneLightMat,
    stoneWetDarkMat,
    stonePathMat,
    woodMat,
    darkWoodMat,
    shingleMat,
    ironMat,
    ropeMat,
    plasterMat,
    soilMat,
    leafBrightMat,
    leafDeepMat,
    flowerMats,
    flowerCenterMat,
    waxSealMat,
    sackMat,
    wellWaterDepthMat,
    wellWaterSurfaceMat,
    wellWaterSheenMat,
    parchmentMats,
    warmGlowTex,
    signboardMatCache: new Map()
  };

  if (ctx && typeof ctx === 'object') {
    paletteCache.set(ctx, pal);
  } else {
    fallbackPalette = pal;
  }
  return pal;
}

function getSignboardMaterial(ctx, pal, title) {
  const key = title || 'DESA LEMNOS';
  if (pal.signboardMatCache.has(key)) return pal.signboardMatCache.get(key);
  const tex = createSignboardTexture(key);
  const mat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    roughness: 0.82
  }), { rimStrength: 0.14, shadowLift: 0.62 });
  pal.signboardMatCache.set(key, mat);
  return mat;
}

// ============================================================================
// REUSABLE STORYBOOK HANGING LANTERN BUILDER (ZERO POINTLIGHTS!)
// ============================================================================

function buildHangingLantern(ctx, pal, phase = 0, scale = 1.0) {
  const lGroup = new THREE.Group();
  lGroup.scale.setScalar(scale);

  // Suspension chain ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 10), pal.ironMat);
  ring.position.y = 0.02;
  lGroup.add(ring);

  // Small finial knob + tapered hexagonal iron roof hood
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), pal.ironMat);
  finial.position.y = -0.03;
  lGroup.add(finial);

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.13, 6), pal.ironMat);
  hood.position.y = -0.10;
  setShadow(hood, ctx, true, false);
  lGroup.add(hood);

  // Top collar ring
  const topRim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.028, 6), pal.ironMat);
  topRim.position.y = -0.17;
  lGroup.add(topRim);

  // Glowing frosted amber glass core (unique material per lantern for world.js flicker/toggle)
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe49e });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.088, 0.24, 6), glassMat);
  glass.position.y = -0.295;
  lGroup.add(glass);

  // 4 forged iron cage bars around glass
  const barGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.26, 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const bar = new THREE.Mesh(barGeo, pal.ironMat);
    bar.position.set(Math.cos(a) * 0.112, -0.295, Math.sin(a) * 0.112);
    lGroup.add(bar);
  }

  // Lower iron base pan + drop finial
  const basePan = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.06, 0.05, 6), pal.ironMat);
  basePan.position.y = -0.435;
  lGroup.add(basePan);

  const dropTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.055, 5), pal.ironMat);
  dropTip.rotation.x = Math.PI;
  dropTip.position.y = -0.48;
  lGroup.add(dropTip);

  // Warm additive glow halo sprite (unique SpriteMaterial per lantern)
  const haloMat = new THREE.SpriteMaterial({
    map: pal.warmGlowTex,
    color: 0xffc66b,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(0, -0.295, 0);
  halo.scale.set(1.55, 1.55, 1.0);
  lGroup.add(halo);

  return {
    lanternGroup: lGroup,
    entry: {
      group: lGroup,
      halo,
      glassMat,
      phase
    }
  };
}

// Helper for triangular gable panel geometry (extruded flat triangle in XY plane)
function createGableTriangleGeo(halfWidth, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth * 0.5);
  return geo;
}

// ============================================================================
// 1. VILLAGE WELL (CENTERPIECE WITH CRYSTAL-CLEAR ANIMATED WATER)
// ============================================================================

function createVillageWell(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 7.3);
  const group = new THREE.Group();

  // 1) Raised circular cobblestone apron (r ~ 1.35, grounded down to y = -0.55)
  const apronHeight = 0.68; // y = -0.55 .. +0.13
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.44, apronHeight, 18), pal.stoneMat);
  apron.position.y = -0.55 + apronHeight * 0.5;
  setShadow(apron, ctx, true, true);
  group.add(apron);

  // Sculpted radial curb stones around the apron perimeter
  const curbCount = 14;
  const curbGeo = new THREE.BoxGeometry(0.46, 0.14, 0.24);
  for (let i = 0; i < curbCount; i++) {
    const a = (i / curbCount) * Math.PI * 2;
    const stone = new THREE.Mesh(curbGeo, i % 3 === 0 ? pal.stoneLightMat : pal.stoneMat);
    stone.position.set(Math.cos(a) * 1.24, 0.10 + (rng() - 0.5) * 0.025, Math.sin(a) * 1.24);
    stone.rotation.y = -a + Math.PI * 0.5;
    stone.scale.set(0.92 + rng() * 0.16, 0.9 + rng() * 0.2, 0.92 + rng() * 0.14);
    setShadow(stone, ctx, false, true);
    group.add(stone);
  }

  // Front stone step / bucket rest slab (facing -Z)
  const restSlab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.44), pal.stoneLightMat);
  restSlab.position.set(0.32, 0.16, -1.06);
  restSlab.rotation.y = -0.12;
  setShadow(restSlab, ctx, true, true);
  group.add(restSlab);

  // 2) Multi-stone cylindrical well wall (r = 0.88, height = 0.78, open-ended shaft)
  const wallOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 0.92, 0.78, 16, 1, true),
    pal.stoneMat
  );
  wallOuter.position.y = 0.10 + 0.39;
  setShadow(wallOuter, ctx, true, true);
  group.add(wallOuter);

  // Inner damp stone shaft wall
  const wallInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.73, 0.72, 0.78, 16, 1, true),
    pal.stoneWetDarkMat
  );
  wallInner.position.y = 0.10 + 0.39;
  group.add(wallInner);

  // Sculpted stone coping rim blocks encircling top of well wall (y = 0.84..0.97)
  const rimCount = 12;
  const copingGeo = new THREE.BoxGeometry(0.46, 0.14, 0.26);
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2;
    const block = new THREE.Mesh(copingGeo, i % 2 === 0 ? pal.stoneLightMat : pal.stoneMat);
    block.position.set(Math.cos(a) * 0.81, 0.91 + (rng() - 0.5) * 0.015, Math.sin(a) * 0.81);
    block.rotation.y = -a + Math.PI * 0.5;
    block.scale.set(0.95 + rng() * 0.1, 0.95 + rng() * 0.12, 1.0);
    setShadow(block, ctx, true, true);
    group.add(block);
  }

  // 3) CRYSTAL-CLEAR ANIMATED WATER SURFACE INSIDE WELL (y = 0.56 — NEVER brown wood!)
  const deepDisc = new THREE.Mesh(new THREE.CircleGeometry(0.73, 20), pal.wellWaterDepthMat);
  deepDisc.rotation.x = -Math.PI * 0.5;
  deepDisc.position.y = 0.24;
  group.add(deepDisc);

  const wellWater = new THREE.Group();
  wellWater.position.set(0, 0.56, 0);

  const waterSurface = new THREE.Mesh(new THREE.CircleGeometry(0.73, 24), pal.wellWaterSurfaceMat);
  waterSurface.rotation.x = -Math.PI * 0.5;
  waterSurface.receiveShadow = true;
  wellWater.add(waterSurface);

  // Delicate floating shimmer ring slightly above surface for live sparkle when rotated
  const rippleRing = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.32, 18), pal.wellWaterSheenMat);
  rippleRing.rotation.x = -Math.PI * 0.5;
  rippleRing.position.y = 0.006;
  wellWater.add(rippleRing);

  const rippleRing2 = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.54, 18), pal.wellWaterSheenMat);
  rippleRing2.rotation.x = -Math.PI * 0.5;
  rippleRing2.position.y = 0.008;
  wellWater.add(rippleRing2);

  group.add(wellWater);

  // 4) Twin stout timber support posts (h ~ 2.05) + diagonal knee braces
  const postGeo = new THREE.BoxGeometry(0.16, 2.08, 0.16);
  const baseCollarGeo = new THREE.BoxGeometry(0.24, 0.26, 0.24);
  for (const side of [-1, 1]) {
    const px = side * 0.84;
    const post = new THREE.Mesh(postGeo, pal.darkWoodMat);
    post.position.set(px, 1.14, 0);
    setShadow(post, ctx, true, true);
    group.add(post);

    // Stone socket collar anchoring post to well rim
    const socket = new THREE.Mesh(baseCollarGeo, pal.stoneLightMat);
    socket.position.set(px, 0.94, 0);
    setShadow(socket, ctx, true, true);
    group.add(socket);

    // Iron mounting bracket straps
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.18), pal.ironMat);
    strap.position.set(px, 1.18, 0);
    group.add(strap);

    // Diagonal knee braces tying post to upper crossbeam (inward) & rafters (front/back)
    const inBrace = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.09), pal.darkWoodMat);
    inBrace.position.set(px - side * 0.18, 1.94, 0);
    inBrace.rotation.z = side * 0.72;
    setShadow(inBrace, ctx, true, true);
    group.add(inBrace);

    for (const zDir of [-1, 1]) {
      const eaveBrace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.08), pal.darkWoodMat);
      eaveBrace.position.set(px, 1.88, zDir * 0.16);
      eaveBrace.rotation.x = -zDir * 0.68;
      setShadow(eaveBrace, ctx, true, true);
      group.add(eaveBrace);
    }
  }

  // Horizontal tie beam connecting tops of posts
  const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.13, 0.15), pal.darkWoodMat);
  tieBeam.position.set(0, 2.12, 0);
  setShadow(tieBeam, ctx, true, true);
  group.add(tieBeam);

  // 5) Windlass roller axle, iron crank handle, coiled rope & hanging banded wooden bucket
  const axleY = 1.62;
  const rollerDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.56, 10), pal.woodMat);
  rollerDrum.rotation.z = Math.PI * 0.5;
  rollerDrum.position.set(0, axleY, 0);
  setShadow(rollerDrum, ctx, true, true);
  group.add(rollerDrum);

  // Iron axle shaft + crank handle on +X side
  const ironPin = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.92, 6), pal.ironMat);
  ironPin.rotation.z = Math.PI * 0.5;
  ironPin.position.set(0.04, axleY, 0);
  group.add(ironPin);

  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.045), pal.ironMat);
  crankArm.position.set(0.99, axleY - 0.11, 0);
  group.add(crankArm);

  const crankGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 6), pal.woodMat);
  crankGrip.rotation.z = Math.PI * 0.5;
  crankGrip.position.set(1.09, axleY - 0.23, 0);
  group.add(crankGrip);

  // Coiled rope wrapped around windlass drum
  const coilGeo = new THREE.TorusGeometry(0.088, 0.018, 6, 12);
  for (let i = -3; i <= 3; i++) {
    const coil = new THREE.Mesh(coilGeo, pal.ropeMat);
    coil.rotation.y = Math.PI * 0.5;
    coil.position.set(i * 0.036, axleY, 0);
    group.add(coil);
  }

  // Hanging rope & banded wooden bucket suspended just above the crystal-clear water
  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(0, axleY, 0.05);

  const dropLen = 0.54;
  const dropRope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, dropLen, 6), pal.ropeMat);
  dropRope.position.y = -dropLen * 0.5;
  bucketPivot.add(dropRope);

  // Arched iron bail handle
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 6, 14, Math.PI), pal.ironMat);
  bail.position.y = -dropLen - 0.15;
  bucketPivot.add(bail);

  // Tapered wooden-stave bucket
  const bucketY = -dropLen - 0.29;
  const bucketBody = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.125, 0.28, 12), pal.woodMat);
  bucketBody.position.y = bucketY;
  setShadow(bucketBody, ctx, true, true);
  bucketPivot.add(bucketBody);

  // Twin dark iron hoops around bucket
  const hoopTop = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.158, 0.028, 12), pal.ironMat);
  hoopTop.position.y = bucketY + 0.07;
  bucketPivot.add(hoopTop);

  const hoopBot = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.136, 0.026, 12), pal.ironMat);
  hoopBot.position.y = bucketY - 0.07;
  bucketPivot.add(hoopBot);

  // Little splash of bright teal water inside the bucket
  const bucketWater = new THREE.Mesh(new THREE.CircleGeometry(0.145, 12), pal.wellWaterSurfaceMat);
  bucketWater.rotation.x = -Math.PI * 0.5;
  bucketWater.position.y = bucketY + 0.115;
  bucketPivot.add(bucketWater);

  group.add(bucketPivot);

  // 6) Cute pitched shingled mini-roof (2 angled shingled panels + gable triangles + ridge beam)
  const roofWidth = 2.26; // spans X
  const slopeLen = 1.24;
  const slopePitch = 0.64; // ~36.6 deg
  const ridgeY = 2.74;
  const roofHalfSpanZ = Math.cos(slopePitch) * slopeLen;
  const roofRise = Math.sin(slopePitch) * slopeLen;

  const slopeGeo = new THREE.BoxGeometry(roofWidth, 0.09, slopeLen);
  for (const zDir of [-1, 1]) {
    const slope = new THREE.Mesh(slopeGeo, pal.shingleMat);
    slope.position.set(0, ridgeY - roofRise * 0.48, zDir * roofHalfSpanZ * 0.49);
    slope.rotation.x = zDir * slopePitch;
    setShadow(slope, ctx, true, true);
    group.add(slope);

    // Rafter tails visible under eaves
    for (const rx of [-0.84, 0, 0.84]) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, slopeLen * 0.98), pal.darkWoodMat);
      rafter.position.set(rx, ridgeY - roofRise * 0.48 - 0.07, zDir * roofHalfSpanZ * 0.49);
      rafter.rotation.x = zDir * slopePitch;
      group.add(rafter);
    }
  }

  // Wooden ridge beam & cap
  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(roofWidth + 0.16, 0.13, 0.14), pal.darkWoodMat);
  ridgeBeam.position.set(0, ridgeY + 0.03, 0);
  setShadow(ridgeBeam, ctx, true, true);
  group.add(ridgeBeam);

  // Left & right gable triangles (facing ±X)
  const gableGeo = createGableTriangleGeo(roofHalfSpanZ * 0.92, roofRise * 0.90, 0.09);
  for (const xSide of [-1, 1]) {
    const gable = new THREE.Mesh(gableGeo, pal.plasterMat);
    gable.rotation.y = Math.PI * 0.5;
    gable.position.set(xSide * 0.86, ridgeY - roofRise * 0.88, 0);
    setShadow(gable, ctx, true, true);
    group.add(gable);

    // Timber gable base beam
    const gBase = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, roofHalfSpanZ * 1.92), pal.darkWoodMat);
    gBase.position.set(xSide * 0.86, ridgeY - roofRise * 0.90, 0);
    group.add(gBase);
  }

  // 7) Warm hanging lantern tucked under front-left eave
  const hookBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.24), pal.ironMat);
  hookBar.position.set(-0.84, 2.02, -0.68);
  group.add(hookBar);

  const { lanternGroup, entry: lanternEntry } = buildHangingLantern(ctx, pal, seed * 1.7 + 0.4, 0.78);
  lanternGroup.position.set(-0.84, 2.01, -0.78);
  group.add(lanternGroup);

  group.userData = {
    kind: 'village_well',
    collider: { type: 'well', radius: 1.05, height: 2.6 },
    lanterns: [lanternEntry],
    animated: {
      wellWater,
      bucketPivot
    }
  };
  return group;
}

// ============================================================================
// 2. VILLAGE GATE ARCH (WELCOMING RUSTIC TIMBER ENTRANCE ARCHWAY)
// ============================================================================

function createVillageGateArch(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const spanWidth = opts.spanWidth ?? 6.2;
  const clearHeight = opts.clearHeight ?? 3.6;
  const title = opts.title || 'DESA LEMNOS';
  const seed = opts.seed ?? 1;
  const halfSpan = spanWidth * 0.5;

  const group = new THREE.Group();
  const lanterns = [];

  // 1) Twin cobblestone pedestal bases (extending down to y = -0.65) + heavy timber gateposts
  const pedHeight = 1.62; // y = -0.65 .. +0.97
  const postHeight = clearHeight + 0.52; // rises into roof truss
  const postGeo = new THREE.BoxGeometry(0.36, postHeight, 0.36);

  for (const side of [-1, 1]) {
    const px = side * halfSpan;

    // Tapered cobblestone pedestal pier
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.58, pedHeight, 4),
      pal.stoneMat
    );
    pedestal.rotation.y = Math.PI * 0.25;
    pedestal.position.set(px, -0.65 + pedHeight * 0.5, 0);
    setShadow(pedestal, ctx, true, true);
    group.add(pedestal);

    // Beveled stone pedestal cap slab
    const capSlab = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.86), pal.stoneLightMat);
    capSlab.position.set(px, 0.98, 0);
    setShadow(capSlab, ctx, true, true);
    group.add(capSlab);

    // Heavy timber pillar
    const post = new THREE.Mesh(postGeo, pal.darkWoodMat);
    post.position.set(px, 0.94 + postHeight * 0.5, 0);
    setShadow(post, ctx, true, true);
    group.add(post);

    // Twin dark iron reinforcement collars around pillar
    for (const strapY of [1.22, clearHeight - 0.12]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.08, 0.40), pal.ironMat);
      strap.position.set(px, strapY, 0);
      group.add(strap);
    }

    // Diagonal timber knee braces under the main tie beam (high up for full cart width!)
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 0.18), pal.darkWoodMat);
    knee.position.set(px - side * 0.48, clearHeight - 0.34, 0);
    knee.rotation.z = side * 0.78;
    setShadow(knee, ctx, true, true);
    group.add(knee);

    // Forged iron scroll bracket & warm hanging lantern on each pillar (facing road -Z & slightly inward)
    const bracketY = clearHeight - 0.62;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.06), pal.ironMat);
    arm.position.set(px - side * 0.34, bracketY, -0.22);
    group.add(arm);

    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.045), pal.ironMat);
    strut.position.set(px - side * 0.26, bracketY - 0.16, -0.22);
    strut.rotation.z = side * 0.68;
    group.add(strut);

    const phase = seed * 1.3 + (side < 0 ? 0.5 : 2.6);
    const { lanternGroup, entry } = buildHangingLantern(ctx, pal, phase, 0.96);
    lanternGroup.position.set(px - side * 0.56, bracketY - 0.03, -0.22);
    group.add(lanternGroup);
    lanterns.push(entry);
  }

  // 2) Horizontal lintel tie-beam & rustic timber truss header
  const mainBeamY = clearHeight + 0.14;
  const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 1.36, 0.28, 0.38), pal.darkWoodMat);
  mainBeam.position.set(0, mainBeamY, 0);
  setShadow(mainBeam, ctx, true, true);
  group.add(mainBeam);

  // Upper collar beam supporting the pitched shingled roof
  const upperBeamY = clearHeight + 0.56;
  const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 1.62, 0.20, 0.30), pal.darkWoodMat);
  upperBeam.position.set(0, upperBeamY, 0);
  setShadow(upperBeam, ctx, true, true);
  group.add(upperBeam);

  // Decorative vertical king/queen struts between main lintel & upper beam
  const strutCount = 5;
  for (let i = 0; i < strutCount; i++) {
    const t = i / (strutCount - 1);
    const sx = (t - 0.5) * (spanWidth - 1.2);
    const vStrut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.16), pal.woodMat);
    vStrut.position.set(sx, (mainBeamY + upperBeamY) * 0.5, 0);
    setShadow(vStrut, ctx, true, true);
    group.add(vStrut);
  }

  // 3) Pitched shingled roof cap over the entire arch beam
  const roofLength = spanWidth + 2.05;
  const slopePitch = 0.54; // ~31 deg
  const slopeDepth = 1.18;
  const ridgeY = upperBeamY + 0.68;
  const halfRunZ = Math.cos(slopePitch) * slopeDepth;
  const riseY = Math.sin(slopePitch) * slopeDepth;

  const slopeGeo = new THREE.BoxGeometry(roofLength, 0.10, slopeDepth);
  for (const zDir of [-1, 1]) {
    const slope = new THREE.Mesh(slopeGeo, pal.shingleMat);
    slope.position.set(0, ridgeY - riseY * 0.48, zDir * halfRunZ * 0.49);
    slope.rotation.x = zDir * slopePitch;
    setShadow(slope, ctx, true, true);
    group.add(slope);

    // Visible timber rafters underneath the roof eaves
    for (let rx = -halfSpan - 0.6; rx <= halfSpan + 0.61; rx += 1.05) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, slopeDepth * 0.96), pal.darkWoodMat);
      rafter.position.set(rx, ridgeY - riseY * 0.48 - 0.08, zDir * halfRunZ * 0.49);
      rafter.rotation.x = zDir * slopePitch;
      group.add(rafter);
    }
  }

  // Chunky wooden ridge beam + charming upturned storybook end finials
  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(roofLength + 0.24, 0.16, 0.16), pal.darkWoodMat);
  ridgeBeam.position.set(0, ridgeY + 0.04, 0);
  setShadow(ridgeBeam, ctx, true, true);
  group.add(ridgeBeam);

  for (const xSide of [-1, 1]) {
    // Gable end fill triangles
    const gable = new THREE.Mesh(createGableTriangleGeo(halfRunZ * 0.92, riseY * 0.88, 0.11), pal.plasterMat);
    gable.rotation.y = Math.PI * 0.5;
    gable.position.set(xSide * (roofLength * 0.5 - 0.18), ridgeY - riseY * 0.88, 0);
    group.add(gable);

    // Upturned ridge tip ornament
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.18), pal.darkWoodMat);
    tip.position.set(xSide * (roofLength * 0.5 + 0.10), ridgeY + 0.11, 0);
    tip.rotation.z = xSide * 0.34;
    group.add(tip);
  }

  // 4) Hanging carved wooden village welcome signboard ("DESA LEMNOS") with breeze sway pivot
  const signPivot = new THREE.Group();
  signPivot.position.set(0, clearHeight, 0);

  // Two iron suspension chains
  const chainGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6);
  for (const cx of [-0.76, 0.76]) {
    const chain = new THREE.Mesh(chainGeo, pal.ironMat);
    chain.position.set(cx, -0.11, 0);
    signPivot.add(chain);

    const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.011, 5, 10), pal.ironMat);
    eyeRing.position.set(cx, -0.22, 0);
    signPivot.add(eyeRing);
  }

  // Carved framed signboard (double-sided CanvasTexture!)
  const signW = 2.16;
  const signH = 0.56;
  const signY = -0.50; // bottom edge sits at clearHeight - 0.78 (~2.82m headroom!)
  const signMat = getSignboardMaterial(ctx, pal, title);

  const signCore = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.08), pal.darkWoodMat);
  signCore.position.set(0, signY, 0);
  setShadow(signCore, ctx, true, true);
  signPivot.add(signCore);

  // Front (-Z) and back (+Z) painted carved faces
  const faceGeo = new THREE.PlaneGeometry(signW - 0.08, signH - 0.08);
  const frontFace = new THREE.Mesh(faceGeo, signMat);
  frontFace.position.set(0, signY, -0.043);
  frontFace.rotation.y = Math.PI;
  signPivot.add(frontFace);

  const backFace = new THREE.Mesh(faceGeo, signMat);
  backFace.position.set(0, signY, 0.043);
  signPivot.add(backFace);

  // Dark timber top/bottom trim moldings + iron corner clasps
  const trimBarGeo = new THREE.BoxGeometry(signW + 0.10, 0.06, 0.11);
  for (const ty of [signY + signH * 0.5, signY - signH * 0.5]) {
    const trim = new THREE.Mesh(trimBarGeo, pal.darkWoodMat);
    trim.position.set(0, ty, 0);
    signPivot.add(trim);
  }
  const claspGeo = new THREE.BoxGeometry(0.11, 0.11, 0.12);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const clasp = new THREE.Mesh(claspGeo, pal.ironMat);
      clasp.position.set(sx * (signW * 0.5 - 0.02), signY + sy * (signH * 0.5 - 0.02), 0);
      signPivot.add(clasp);
    }
  }

  group.add(signPivot);

  // ONLY TWO pillar circle colliders — center road remains 100% open & driveable!
  group.userData = {
    kind: 'village_gate_arch',
    colliders: [
      { localX: -halfSpan, localZ: 0, radius: 0.45, height: 3.8 },
      { localX: halfSpan, localZ: 0, radius: 0.45, height: 3.8 }
    ],
    lanterns,
    animated: {
      signPivot
    }
  };
  return group;
}

// ============================================================================
// 3. VILLAGE LANTERN POST (STORYBOOK LAMP POST)
// ============================================================================

function createVillageLanternPost(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const seed = opts.seed ?? 1;
  const phase = opts.phase ?? (seed * 1.9);
  const group = new THREE.Group();

  // 1) Stacked cobblestone base collar (y = -0.45 .. +0.35)
  const basePlinth = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.27, 0.80, 8), pal.stoneMat);
  basePlinth.position.y = -0.45 + 0.40;
  setShadow(basePlinth, ctx, true, true);
  group.add(basePlinth);

  const baseCap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.09, 8), pal.stoneLightMat);
  baseCap.position.y = 0.36;
  setShadow(baseCap, ctx, true, true);
  group.add(baseCap);

  // 2) Chamfered dark timber post (h ~ 2.85, rising from y = 0.25 to 3.10)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.105, 2.85, 8), pal.darkWoodMat);
  post.position.y = 0.25 + 1.425;
  setShadow(post, ctx, true, true);
  group.add(post);

  // Decorative iron band & pointed cap finial at top of post
  const postCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.08, 8), pal.ironMat);
  postCollar.position.y = 2.86;
  group.add(postCollar);

  const postCap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), pal.ironMat);
  postCap.position.y = 3.16;
  group.add(postCap);

  // 3) Curved / angled wooden bracket arm with diagonal strut (+X direction)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.085, 0.085), pal.darkWoodMat);
  arm.position.set(0.34, 2.88, 0);
  arm.rotation.z = 0.07;
  setShadow(arm, ctx, true, true);
  group.add(arm);

  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.07), pal.darkWoodMat);
  strut.position.set(0.22, 2.66, 0);
  strut.rotation.z = 0.76;
  setShadow(strut, ctx, true, true);
  group.add(strut);

  // Iron scroll curl tip on arm
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 10, Math.PI * 1.4), pal.ironMat);
  hook.position.set(0.68, 2.86, 0);
  group.add(hook);

  // 4) Hanging storybook iron lantern & glowing halo
  const { lanternGroup, entry: lanternEntry } = buildHangingLantern(ctx, pal, phase, 0.95);
  lanternGroup.position.set(0.68, 2.82, 0);
  group.add(lanternGroup);

  // 5) Optional directional signpost arm & cute hanging flower pot
  if (opts.withSign) {
    const signArm = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.19, 0.055), pal.woodMat);
    signArm.position.set(-0.34, 2.12, 0.04);
    signArm.rotation.y = 0.16;
    setShadow(signArm, ctx, true, true);
    group.add(signArm);

    // Pointed arrow tip on sign
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.18, 4), pal.woodMat);
    tip.rotation.z = Math.PI * 0.5;
    tip.rotation.x = Math.PI * 0.25;
    tip.scale.set(1.0, 1.0, 0.45);
    tip.position.set(-0.76, 2.12, 0.10);
    group.add(tip);

    // Small wooden flower pot tucked on bracket below sign
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 0.18, 8), pal.shingleMat);
    pot.position.set(-0.24, 1.66, 0);
    setShadow(pot, ctx, true, true);
    group.add(pot);

    const potLeaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), pal.leafBrightMat);
    potLeaf.position.set(-0.24, 1.78, 0);
    potLeaf.scale.set(1.1, 0.72, 1.1);
    group.add(potLeaf);

    const potBloom = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.055, 0),
      pal.flowerMats[Math.abs(Math.floor(seed)) % pal.flowerMats.length]
    );
    potBloom.position.set(-0.26, 1.86, 0.04);
    group.add(potBloom);
  }

  group.userData = {
    kind: 'village_lantern_post',
    lanterns: [lanternEntry],
    collider: { type: 'lantern', radius: 0.24, height: 2.9 }
  };
  return group;
}

// ============================================================================
// 4. VILLAGE NOTICE BOARD (QUEST BOARD WITH TILTED FLYERS & MINI-ROOF)
// ============================================================================

function createVillageNoticeBoard(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 11.1);
  const group = new THREE.Group();

  // 1) Twin timber posts (y = -0.45 .. 2.05) + stone collar footings
  const postGeo = new THREE.BoxGeometry(0.14, 2.50, 0.14);
  const footingGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.64, 6);
  for (const xSide of [-1, 1]) {
    const px = xSide * 0.80;
    const post = new THREE.Mesh(postGeo, pal.darkWoodMat);
    post.position.set(px, -0.45 + 1.25, 0);
    setShadow(post, ctx, true, true);
    group.add(post);

    const footing = new THREE.Mesh(footingGeo, pal.stoneMat);
    footing.position.set(px, -0.45 + 0.32, 0);
    setShadow(footing, ctx, true, true);
    group.add(footing);
  }

  // 2) Framed dark plank backing board (facing -Z)
  const boardW = 1.48;
  const boardH = 0.94;
  const boardY = 1.48;

  const backing = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.07), pal.darkWoodMat);
  backing.position.set(0, boardY, 0);
  setShadow(backing, ctx, true, true);
  group.add(backing);

  // Horizontal perimeter frame rails & small bottom ledge shelf
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.16, 0.09, 0.12), pal.woodMat);
  topRail.position.set(0, boardY + boardH * 0.5, 0);
  setShadow(topRail, ctx, true, true);
  group.add(topRail);

  const botLedge = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.20, 0.08, 0.20), pal.woodMat);
  botLedge.position.set(0, boardY - boardH * 0.5, -0.03);
  setShadow(botLedge, ctx, true, true);
  group.add(botLedge);

  // 3) Shingled mini-roof cap over the notice board
  const roofW = 1.98;
  const slopeD = 0.52;
  const pitch = 0.52;
  const ridgeY = 2.38;
  const runZ = Math.cos(pitch) * slopeD;
  const riseY = Math.sin(pitch) * slopeD;

  const slopeGeo = new THREE.BoxGeometry(roofW, 0.075, slopeD);
  for (const zDir of [-1, 1]) {
    const slope = new THREE.Mesh(slopeGeo, pal.shingleMat);
    slope.position.set(0, ridgeY - riseY * 0.48, zDir * runZ * 0.49);
    slope.rotation.x = zDir * pitch;
    setShadow(slope, ctx, true, true);
    group.add(slope);
  }

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.10, 0.10, 0.10), pal.darkWoodMat);
  ridge.position.set(0, ridgeY + 0.02, 0);
  setShadow(ridge, ctx, true, true);
  group.add(ridge);

  // End gable triangles
  const gableGeo = createGableTriangleGeo(runZ * 0.90, riseY * 0.88, 0.07);
  for (const xSide of [-1, 1]) {
    const gable = new THREE.Mesh(gableGeo, pal.woodMat);
    gable.rotation.y = Math.PI * 0.5;
    gable.position.set(xSide * 0.80, ridgeY - riseY * 0.88, 0);
    group.add(gable);
  }

  // 4) 5 slightly tilted parchment flyers pinned with tiny red wax seals / pegs (front -Z)
  const flyerSpots = [
    { x: -0.48, y: 1.68, w: 0.30, h: 0.34, rot: 0.09 },
    { x: -0.06, y: 1.64, w: 0.34, h: 0.38, rot: -0.06 },
    { x: 0.42, y: 1.69, w: 0.28, h: 0.32, rot: 0.11 },
    { x: -0.30, y: 1.26, w: 0.32, h: 0.30, rot: -0.10 },
    { x: 0.24, y: 1.24, w: 0.34, h: 0.32, rot: 0.07 }
  ];
  const pinGeo = new THREE.CylinderGeometry(0.020, 0.018, 0.022, 6);

  flyerSpots.forEach((f, idx) => {
    const mat = pal.parchmentMats[idx % pal.parchmentMats.length];
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), mat);
    sheet.position.set(f.x, f.y, -0.040 - idx * 0.002);
    sheet.rotation.y = Math.PI;
    sheet.rotation.z = f.rot + (rng() - 0.5) * 0.05;
    group.add(sheet);

    const pin = new THREE.Mesh(pinGeo, idx % 3 === 0 ? pal.ironMat : pal.waxSealMat);
    pin.rotation.x = Math.PI * 0.5;
    pin.position.set(f.x, f.y + f.h * 0.38, -0.048 - idx * 0.002);
    group.add(pin);
  });

  // 2 subtle notices on the back (+Z) so it reads nicely from 360 degrees
  for (let b = 0; b < 2; b++) {
    const bx = b === 0 ? -0.28 : 0.26;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.34), pal.parchmentMats[(b + 1) % pal.parchmentMats.length]);
    sheet.position.set(bx, 1.50 + (b === 0 ? 0.06 : -0.08), 0.040);
    sheet.rotation.z = b === 0 ? -0.08 : 0.11;
    group.add(sheet);
  }

  group.userData = {
    kind: 'village_notice_board',
    collider: { type: 'prop', radius: 0.65, height: 2.1 }
  };
  return group;
}

// ============================================================================
// 5. VILLAGE BENCH (COZY RUSTIC WOODEN BENCH, FACING -Z)
// ============================================================================

function createVillageBench(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const w = opts.width ?? 1.75;
  const d = opts.depth ?? 0.58;
  const group = new THREE.Group();

  // 1) Twin stout notched legs extending down to y = -0.35
  const legHeight = 0.80; // y = -0.35 .. +0.45
  const legX = w * 0.38;
  for (const xSide of [-1, 1]) {
    const lx = xSide * legX;

    // Front leg post
    const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.11, legHeight, 0.11), pal.darkWoodMat);
    frontLeg.position.set(lx, -0.35 + legHeight * 0.5, -d * 0.34);
    setShadow(frontLeg, ctx, true, true);
    group.add(frontLeg);

    // Rear leg post (extends up to become angled backrest upright)
    const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.11, legHeight, 0.11), pal.darkWoodMat);
    backLeg.position.set(lx, -0.35 + legHeight * 0.5, d * 0.34);
    setShadow(backLeg, ctx, true, true);
    group.add(backLeg);

    // Side cross-bearer tying front & rear legs under the seat
    const bearer = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, d * 0.92), pal.darkWoodMat);
    bearer.position.set(lx, 0.39, 0);
    setShadow(bearer, ctx, true, true);
    group.add(bearer);

    // Lower side foot tie rail
    const lowTie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, d * 0.68), pal.darkWoodMat);
    lowTie.position.set(lx, 0.14, 0);
    group.add(lowTie);

    // Angled backrest upright rising from rear seat corner
    const backPost = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.58, 0.09), pal.darkWoodMat);
    backPost.position.set(lx, 0.68, d * 0.42);
    backPost.rotation.x = 0.18;
    setShadow(backPost, ctx, true, true);
    group.add(backPost);
  }

  // Central lower stretcher bar between left & right legs
  const stretcher = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.08, 0.08), pal.darkWoodMat);
  stretcher.position.set(0, 0.16, 0.02);
  setShadow(stretcher, ctx, true, true);
  group.add(stretcher);

  // 2) Thick 3-plank honey-oak seat
  const plankGeo = new THREE.BoxGeometry(w, 0.065, d * 0.29);
  for (let i = -1; i <= 1; i++) {
    const plank = new THREE.Mesh(plankGeo, pal.woodMat);
    plank.position.set(0, 0.465, i * (d * 0.32));
    setShadow(plank, ctx, true, true);
    group.add(plank);
  }

  // Iron bolt caps on seat ends
  const boltGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6);
  for (const xSide of [-1, 1]) {
    for (const zOff of [-d * 0.32, d * 0.32]) {
      const bolt = new THREE.Mesh(boltGeo, pal.ironMat);
      bolt.position.set(xSide * legX, 0.502, zOff);
      group.add(bolt);
    }
  }

  // 3) Dual angled backrest slats (+Z side, facing -Z)
  const slatGeo = new THREE.BoxGeometry(w * 0.98, 0.14, 0.048);
  const lowSlat = new THREE.Mesh(slatGeo, pal.woodMat);
  lowSlat.position.set(0, 0.69, d * 0.40);
  lowSlat.rotation.x = 0.18;
  setShadow(lowSlat, ctx, true, true);
  group.add(lowSlat);

  const highSlat = new THREE.Mesh(slatGeo, pal.woodMat);
  highSlat.position.set(0, 0.87, d * 0.435);
  highSlat.rotation.x = 0.18;
  setShadow(highSlat, ctx, true, true);
  group.add(highSlat);

  group.userData = {
    kind: 'village_bench',
    collider: { type: 'prop', radius: 0.75, height: 0.9 }
  };
  return group;
}

// ============================================================================
// 6. VILLAGE FLOWER PLANTER (TIMBER OR STONE TROUGH WITH LUSH BLOSSOMS)
// ============================================================================

function createVillageFlowerPlanter(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 19.7);
  const w = opts.width ?? 1.5;
  const d = opts.depth ?? 0.6;
  const isStone = opts.style === 'stone' || (!opts.style && (Math.abs(Math.floor(seed)) % 2 === 1));
  const group = new THREE.Group();

  // 1) Trough body grounded down to y = -0.38
  const wallH = 0.84; // y = -0.38 .. +0.46
  const bodyMat = isStone ? pal.stoneMat : pal.woodMat;
  const trimMat = isStone ? pal.stoneLightMat : pal.darkWoodMat;

  const box = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), bodyMat);
  box.position.y = -0.38 + wallH * 0.5;
  setShadow(box, ctx, true, true);
  group.add(box);

  // Beveled top rim lip around the planter
  const rimH = 0.08;
  const frontRim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.10, rimH, 0.10), trimMat);
  frontRim.position.set(0, 0.47, -d * 0.5 + 0.02);
  setShadow(frontRim, ctx, true, true);
  group.add(frontRim);

  const backRim = frontRim.clone();
  backRim.position.z = d * 0.5 - 0.02;
  group.add(backRim);

  const sideRimGeo = new THREE.BoxGeometry(0.10, rimH, d + 0.10);
  for (const sx of [-1, 1]) {
    const sRim = new THREE.Mesh(sideRimGeo, trimMat);
    sRim.position.set(sx * (w * 0.5 - 0.02), 0.47, 0);
    setShadow(sRim, ctx, true, true);
    group.add(sRim);
  }

  // Corner posts / iron straps for timber style
  if (!isStone) {
    const cornerGeo = new THREE.BoxGeometry(0.11, 0.52, 0.11);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(cornerGeo, pal.darkWoodMat);
        post.position.set(sx * (w * 0.5 - 0.02), 0.22, sz * (d * 0.5 - 0.02));
        group.add(post);
      }
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.04, d + 0.03), pal.ironMat);
    strap.position.y = 0.18;
    group.add(strap);
  }

  // 2) Dark sculpted soil mound inside trough
  const soil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.14, 0.10, d - 0.14), pal.soilMat);
  soil.position.y = 0.45;
  setShadow(soil, ctx, false, true);
  group.add(soil);

  // 3) Lush painterly leaf tufts
  const tuftGeo = new THREE.DodecahedronGeometry(0.17, 0);
  const tuftCount = 8;
  for (let i = 0; i < tuftCount; i++) {
    const t = (i + 0.5) / tuftCount;
    const fx = (t - 0.5) * (w - 0.28) + (rng() - 0.5) * 0.08;
    const fz = (rng() - 0.5) * (d - 0.24);
    const leaf = new THREE.Mesh(tuftGeo, i % 2 === 0 ? pal.leafBrightMat : pal.leafDeepMat);
    leaf.position.set(fx, 0.53 + rng() * 0.06, fz);
    leaf.scale.set(0.95 + rng() * 0.45, 0.58 + rng() * 0.28, 0.85 + rng() * 0.40);
    leaf.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
    setShadow(leaf, ctx, true, true);
    group.add(leaf);
  }

  // 4) Vibrant storybook blossoms (sunflower gold, sky blue, berry pink, white daisies)
  const stemGeo = new THREE.CylinderGeometry(0.011, 0.014, 0.22, 4);
  const bloomGeo = new THREE.DodecahedronGeometry(0.062, 0);
  const centerGeo = new THREE.SphereGeometry(0.028, 5, 4);

  const primaryIdx = Math.abs(Math.floor(seed)) % pal.flowerMats.length;
  const secondaryIdx = (primaryIdx + 1 + (Math.abs(Math.floor(seed * 3)) % 2)) % pal.flowerMats.length;

  const flowerCount = 13;
  for (let i = 0; i < flowerCount; i++) {
    const fx = ((i + 0.5) / flowerCount - 0.5) * (w - 0.26) + (rng() - 0.5) * 0.10;
    const fz = (rng() - 0.5) * (d - 0.22);
    const h = 0.15 + rng() * 0.16;
    const tiltX = (rng() - 0.5) * 0.35;
    const tiltZ = (rng() - 0.5) * 0.35;

    const stem = new THREE.Mesh(stemGeo, pal.leafDeepMat);
    stem.scale.y = h / 0.22;
    stem.position.set(fx, 0.49 + h * 0.5, fz);
    stem.rotation.set(tiltX, 0, tiltZ);
    group.add(stem);

    const fMat = (i % 3 === 0) ? pal.flowerMats[secondaryIdx] : pal.flowerMats[primaryIdx];
    const bloom = new THREE.Mesh(bloomGeo, fMat);
    const topX = fx - Math.sin(tiltZ) * h * 0.5;
    const topZ = fz + Math.sin(tiltX) * h * 0.5;
    const topY = 0.51 + h;
    bloom.position.set(topX, topY, topZ);
    bloom.scale.set(1.1, 0.65, 1.1);
    bloom.rotation.set(tiltX, rng() * Math.PI, tiltZ);
    group.add(bloom);

    const center = new THREE.Mesh(centerGeo, pal.flowerCenterMat);
    center.position.set(topX, topY + 0.032, topZ);
    group.add(center);
  }

  group.userData = {
    kind: 'village_flower_planter',
    collider: { type: 'prop', radius: 0.65, height: 0.7 }
  };
  return group;
}

// ============================================================================
// 7. VILLAGE CRATE CLUSTER (BARRELS + CROSS-BRACED CRATES + CANVAS SACK)
// ============================================================================

function buildBandedBarrel(ctx, pal, radius = 0.29, height = 0.84) {
  const bGroup = new THREE.Group();

  // Coopered bulging barrel silhouette using LatheGeometry (with -0.30 ground skirt)
  const pts = [
    new THREE.Vector2(radius * 0.80, -0.30),
    new THREE.Vector2(radius * 0.84, 0.0),
    new THREE.Vector2(radius * 0.99, height * 0.32),
    new THREE.Vector2(radius * 1.02, height * 0.50),
    new THREE.Vector2(radius * 0.99, height * 0.68),
    new THREE.Vector2(radius * 0.84, height),
    new THREE.Vector2(radius * 0.74, height),
    new THREE.Vector2(radius * 0.74, height - 0.05),
    new THREE.Vector2(0.0, height - 0.05)
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), pal.woodMat);
  setShadow(body, ctx, true, true);
  bGroup.add(body);

  // 3 dark forged iron hoops
  const hoopSpecs = [
    { y: height * 0.16, r: radius * 0.93 },
    { y: height * 0.50, r: radius * 1.03 },
    { y: height * 0.84, r: radius * 0.93 }
  ];
  for (const hs of hoopSpecs) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(hs.r, hs.r, 0.045, 12, 1, true), pal.ironMat);
    hoop.position.y = hs.y;
    bGroup.add(hoop);
  }

  // Wooden bung stopper on lid
  const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 6), pal.darkWoodMat);
  bung.position.set(radius * 0.26, height - 0.04, 0.04);
  bGroup.add(bung);

  return bGroup;
}

function buildBracedCrate(ctx, pal, size = 0.68, grounded = true) {
  const cGroup = new THREE.Group();

  // Optional grounded foundation skirt below crate so it never floats on hills
  if (grounded) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(size * 0.94, 0.32, size * 0.94), pal.darkWoodMat);
    skirt.position.y = -0.15;
    cGroup.add(skirt);
  }

  // Inner recessed wooden plank core
  const core = new THREE.Mesh(new THREE.BoxGeometry(size * 0.92, size * 0.92, size * 0.92), pal.woodMat);
  core.position.y = size * 0.5;
  setShadow(core, ctx, true, true);
  cGroup.add(core);

  // Corner framing rails (12 edges)
  const railT = size * 0.11;
  const h = size * 0.5;
  const edge = h - railT * 0.5;

  const vGeo = new THREE.BoxGeometry(railT, size, railT);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(vGeo, pal.darkWoodMat);
      p.position.set(sx * edge, h, sz * edge);
      cGroup.add(p);
    }
  }

  const xGeo = new THREE.BoxGeometry(size, railT, railT);
  const zGeo = new THREE.BoxGeometry(railT, railT, size);
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = new THREE.Mesh(xGeo, pal.darkWoodMat);
      bx.position.set(0, h + sy * edge, sz * edge);
      cGroup.add(bx);
    }
    for (const sx of [-1, 1]) {
      const bz = new THREE.Mesh(zGeo, pal.darkWoodMat);
      bz.position.set(sx * edge, h + sy * edge, 0);
      cGroup.add(bz);
    }
  }

  // Iconic diagonal cross-brace plank on each of the 4 vertical faces
  const diagLen = size * 1.12;
  const diagGeo = new THREE.BoxGeometry(diagLen, railT * 0.85, railT * 0.55);
  for (let f = 0; f < 4; f++) {
    const a = f * Math.PI * 0.5;
    const brace = new THREE.Mesh(diagGeo, pal.darkWoodMat);
    brace.position.set(Math.sin(a) * (h - railT * 0.25), h, Math.cos(a) * (h - railT * 0.25));
    brace.rotation.y = a;
    brace.rotation.z = Math.PI * 0.25;
    cGroup.add(brace);
  }

  return cGroup;
}

function buildCanvasSack(ctx, pal) {
  const sGroup = new THREE.Group();

  // Plump grain sack body (extends down to y = -0.22 for slope grounding)
  const sackBody = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 1), pal.sackMat);
  sackBody.scale.set(1.05, 1.32, 0.92);
  sackBody.position.y = 0.22;
  setShadow(sackBody, ctx, true, true);
  sGroup.add(sackBody);

  // Grounding base tuck
  const sackSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.34, 8), pal.sackMat);
  sackSkirt.position.y = -0.14;
  sGroup.add(sackSkirt);

  // Rope tie around cinched neck
  const ropeTie = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 6, 10), pal.ropeMat);
  ropeTie.rotation.x = Math.PI * 0.5;
  ropeTie.position.y = 0.54;
  sGroup.add(ropeTie);

  // Flared sack top ruffle
  const topRuffle = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.14, 7), pal.sackMat);
  topRuffle.rotation.x = Math.PI;
  topRuffle.position.y = 0.62;
  sGroup.add(topRuffle);

  return sGroup;
}

function createVillageCrateCluster(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 23.3);
  const group = new THREE.Group();

  // 1) Primary large cross-braced supply crate
  const mainCrate = buildBracedCrate(ctx, pal, 0.68, true);
  mainCrate.position.set(-0.32, 0, 0.16);
  mainCrate.rotation.y = 0.18 + (rng() - 0.5) * 0.25;
  group.add(mainCrate);

  // 2) Secondary smaller supply crate (stacked or tucked beside based on seed)
  const smallCrate = buildBracedCrate(ctx, pal, 0.46, seed % 2 === 0);
  if (seed % 2 === 1) {
    // Stacked playfully on top of main crate
    smallCrate.position.set(-0.30, 0.68, 0.15);
    smallCrate.rotation.y = -0.35 + (rng() - 0.5) * 0.25;
  } else {
    smallCrate.position.set(-0.36, 0, -0.44);
    smallCrate.rotation.y = 0.42;
  }
  group.add(smallCrate);

  // 3) Twin banded coopered wooden barrels
  const barrelA = buildBandedBarrel(ctx, pal, 0.29, 0.86);
  barrelA.position.set(0.40, 0, 0.18);
  barrelA.rotation.y = rng() * Math.PI * 2;
  group.add(barrelA);

  const barrelB = buildBandedBarrel(ctx, pal, 0.25, 0.74);
  barrelB.position.set(0.32, 0, -0.36);
  barrelB.rotation.y = rng() * Math.PI * 2;
  group.add(barrelB);

  // 4) Optional tied burlap grain sack leaning against the front
  if (opts.withSack !== false) {
    const sack = buildCanvasSack(ctx, pal);
    sack.position.set(-0.18, 0, -0.34);
    sack.rotation.set(0.14, 0.45, -0.10);
    group.add(sack);
  }

  group.userData = {
    kind: 'village_crate_cluster',
    collider: { type: 'prop', radius: 0.85, height: 1.1 }
  };
  return group;
}

// ============================================================================
// 8. VILLAGE STONE PATH (TERRAIN-CONFORMING BEVELED COBBLESTONES)
// ============================================================================

function createVillageStonePath(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const points = Array.isArray(opts.points) ? opts.points : [];
  const width = opts.width ?? 1.5;
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 37.1);
  const group = new THREE.Group();

  if (points.length < 2) {
    group.userData = { kind: 'village_stone_path' };
    return group;
  }

  // Reusable flat beveled octagonal stepping stone prototype (top at y = +0.07, bottom skirt at y = -0.07)
  const stoneProto = new THREE.CylinderGeometry(0.46, 0.54, 0.14, 7);
  const stonePalette = [0xdcd5c5, 0xc9c2b2, 0xe5dfd0, 0xbdb7a8, 0xd1ccb9, 0xc3c4b4];
  const geos = [];

  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const posV = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();

  const rowStep = 0.62;
  const eps = 0.28;

  for (let seg = 0; seg < points.length - 1; seg++) {
    const p1 = points[seg];
    const p2 = points[seg + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) continue;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const perpX = -dirZ;
    const perpZ = dirX;
    const segYaw = Math.atan2(dx, dz);

    const rows = Math.max(1, Math.round(dist / rowStep));
    for (let r = 0; r <= rows; r++) {
      // Avoid duplicating stones on shared interior vertices
      if (seg > 0 && r === 0) continue;
      const t = r / rows;
      const cx = p1.x + dx * t;
      const cz = p1.z + dz * t;

      // Alternate between 2 wide flagstones and 3 staggered cobbles across path width
      const stonesInRow = (r % 2 === 0) ? Math.max(2, Math.round(width / 0.68)) : Math.max(2, Math.round(width / 0.56));
      for (let s = 0; s < stonesInRow; s++) {
        const u = stonesInRow === 1 ? 0 : ((s + 0.5) / stonesInRow - 0.5) * (width * 0.86);
        const jitterAlong = (rng() - 0.5) * 0.16;
        const jitterAcross = (rng() - 0.5) * 0.12;
        const sx = cx + perpX * (u + jitterAcross) + dirX * jitterAlong;
        const sz = cz + perpZ * (u + jitterAcross) + dirZ * jitterAlong;

        const gy = getTerrainY(ctx, sx, sz);
        const hL = getTerrainY(ctx, sx - eps, sz);
        const hR = getTerrainY(ctx, sx + eps, sz);
        const hD = getTerrainY(ctx, sx, sz - eps);
        const hU = getTerrainY(ctx, sx, sz + eps);
        normal.set(hL - hR, 2 * eps, hD - hU).normalize();

        const stoneW = (width / stonesInRow) * (0.76 + rng() * 0.24);
        const stoneL = rowStep * (0.68 + rng() * 0.28);
        const stoneYScale = 0.92 + rng() * 0.24;

        // Top face lands strictly at gy + 0.035; skirt embeds 0.10m into terrain (zero floating, zero Z-fighting!)
        const halfThick = 0.07 * stoneYScale;
        posV.set(sx, gy + 0.035 - halfThick, sz);
        quat.setFromUnitVectors(up, normal);
        yawQ.setFromAxisAngle(up, segYaw + (rng() - 0.5) * 0.45);
        quat.multiply(yawQ);
        scaleV.set(stoneW, stoneYScale, stoneL);
        mat4.compose(posV, quat, scaleV);

        const g = stoneProto.clone();
        g.applyMatrix4(mat4);
        const colHex = stonePalette[Math.floor(rng() * stonePalette.length)];
        paintGeoVertexColor(g, colHex);
        geos.push(g);
      }
    }
  }

  stoneProto.dispose();

  if (geos.length > 0) {
    const merged = mergeGeometries(geos, true);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();

    const mesh = new THREE.Mesh(merged, pal.stonePathMat);
    // Flat ground stones receive shadows cleanly without self-shadow speckles
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  group.userData = {
    kind: 'village_stone_path'
  };
  return group;
}

// ============================================================================
// 9. VILLAGE FENCE RUN (LOW RUSTIC PICKET/RAIL FENCE + STONE CORNER PIERS)
// ============================================================================

function createVillageFenceRun(ctx, opts = {}) {
  const pal = getPropPalette(ctx);
  const points = Array.isArray(opts.points) ? opts.points : [];
  const low = opts.low !== false;
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 41.9);
  const group = new THREE.Group();
  const fenceSegments = [];

  if (points.length < 2) {
    group.userData = { kind: 'village_fence_run', fenceSegments };
    return group;
  }

  const fenceH = low ? 0.90 : 1.18;
  const woodGeos = [];
  const stoneGeos = [];

  const postProto = new THREE.BoxGeometry(0.11, 1.0, 0.11);
  const postCapProto = new THREE.ConeGeometry(0.082, 0.10, 4);
  postCapProto.rotateY(Math.PI * 0.25);

  const picketProto = new THREE.BoxGeometry(0.085, 1.0, 0.032);
  const railProto = new THREE.BoxGeometry(0.06, 0.085, 1.0);
  const pierProto = new THREE.CylinderGeometry(0.24, 0.29, 1.0, 4);
  pierProto.rotateY(Math.PI * 0.25);
  const pierCapProto = new THREE.BoxGeometry(0.46, 0.11, 0.46);

  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const vPos = new THREE.Vector3();
  const vScale = new THREE.Vector3();

  function addStonePier(x, z) {
    const gy = getTerrainY(ctx, x, z);
    const pierH = fenceH + 0.14 + 0.50; // grounded down to gy - 0.50
    vPos.set(x, gy - 0.50 + pierH * 0.5, z);
    q.identity();
    vScale.set(1, pierH, 1);
    m.compose(vPos, q, vScale);
    const body = pierProto.clone();
    body.applyMatrix4(m);
    stoneGeos.push(body);

    const cap = pierCapProto.clone();
    cap.translate(x, gy + fenceH + 0.16, z);
    stoneGeos.push(cap);
  }

  function addWoodPost(x, z) {
    const gy = getTerrainY(ctx, x, z);
    const h = fenceH + 0.06 + 0.45; // grounded down to gy - 0.45
    const tiltX = (rng() - 0.5) * 0.05;
    const tiltZ = (rng() - 0.5) * 0.05;
    q.setFromEuler(new THREE.Euler(tiltX, rng() * 0.2, tiltZ));
    vPos.set(x, gy - 0.45 + h * 0.5, z);
    vScale.set(1, h, 1);
    m.compose(vPos, q, vScale);
    const post = postProto.clone();
    post.applyMatrix4(m);
    woodGeos.push(post);

    const cap = postCapProto.clone();
    cap.translate(x, gy + fenceH + 0.10, z);
    woodGeos.push(cap);
  }

  // Decide which polyline vertices receive stone corner piers (endpoints & sharp bends / every 3rd vertex)
  const isPierVertex = points.map((pt, idx) => {
    if (idx === 0 || idx === points.length - 1) return true;
    if (idx % 3 === 0) return true;
    const prev = points[idx - 1];
    const next = points[idx + 1];
    const a1 = Math.atan2(pt.z - prev.z, pt.x - prev.x);
    const a2 = Math.atan2(next.z - pt.z, next.x - pt.x);
    const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    return turn > 0.45;
  });

  // Build vertex piers/posts first
  for (let i = 0; i < points.length; i++) {
    if (isPierVertex[i]) {
      addStonePier(points[i].x, points[i].z);
    } else {
      addWoodPost(points[i].x, points[i].z);
    }
  }

  // Build spans between consecutive vertices
  for (let i = 0; i < points.length - 1; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    const dx = pB.x - pA.x;
    const dz = pB.z - pA.z;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.15) continue;

    const spanCount = Math.max(1, Math.round(segLen / 1.95));
    const yaw = Math.atan2(dx, dz);

    for (let s = 0; s < spanCount; s++) {
      const t1 = s / spanCount;
      const t2 = (s + 1) / spanCount;
      const x1 = pA.x + dx * t1;
      const z1 = pA.z + dz * t1;
      const x2 = pA.x + dx * t2;
      const z2 = pA.z + dz * t2;

      if (s > 0) addWoodPost(x1, z1);

      const y1 = getTerrainY(ctx, x1, z1);
      const y2 = getTerrainY(ctx, x2, z2);
      const spanDx = x2 - x1;
      const spanDy = y2 - y1;
      const spanDz = z2 - z1;
      const span3D = Math.hypot(spanDx, spanDy, spanDz);
      const slopePitch = -Math.atan2(spanDy, Math.hypot(spanDx, spanDz));

      // Register jumpable fence segment collider contract
      fenceSegments.push({
        x1,
        z1,
        x2,
        z2,
        yMax: Math.max(y1, y2) + fenceH
      });

      // Dual horizontal rails (upper & lower) conforming to terrain slope
      const railHeights = low ? [0.34, 0.72] : [0.38, 0.76, 1.06];
      const euler = new THREE.Euler(slopePitch, yaw, 0, 'YXZ');
      q.setFromEuler(euler);

      for (const rh of railHeights) {
        vPos.set((x1 + x2) * 0.5, (y1 + y2) * 0.5 + rh, (z1 + z2) * 0.5);
        vScale.set(1, 1, span3D + 0.04);
        m.compose(vPos, q, vScale);
        const rail = railProto.clone();
        rail.applyMatrix4(m);
        woodGeos.push(rail);
      }

      // Rustic village pickets evenly spaced along the span (offset slightly onto front rail face to prevent z-fighting)
      const perpX = spanDz / Math.max(0.001, Math.hypot(spanDx, spanDz));
      const perpZ = -spanDx / Math.max(0.001, Math.hypot(spanDx, spanDz));
      const picketCount = Math.max(2, Math.floor(Math.hypot(spanDx, spanDz) / 0.34));
      for (let p = 1; p < picketCount; p++) {
        const pt = p / picketCount;
        const px = x1 + spanDx * pt + perpX * 0.042;
        const pz = z1 + spanDz * pt + perpZ * 0.042;
        const py = getTerrainY(ctx, px, pz);
        const ph = fenceH * (0.86 + rng() * 0.09);

        q.setFromAxisAngle(up, yaw + Math.PI * 0.5);
        vPos.set(px, py + ph * 0.5 + 0.06, pz);
        vScale.set(1, ph, 1);
        m.compose(vPos, q, vScale);
        const picket = picketProto.clone();
        picket.applyMatrix4(m);
        woodGeos.push(picket);
      }
    }
  }

  postProto.dispose();
  postCapProto.dispose();
  picketProto.dispose();
  railProto.dispose();
  pierProto.dispose();
  pierCapProto.dispose();

  if (woodGeos.length > 0) {
    const mergedWood = mergeGeometries(woodGeos, false);
    for (let i = 0; i < woodGeos.length; i++) woodGeos[i].dispose();
    const woodMesh = new THREE.Mesh(mergedWood, pal.woodMat);
    setShadow(woodMesh, ctx, true, true);
    group.add(woodMesh);
  }

  if (stoneGeos.length > 0) {
    const mergedStone = mergeGeometries(stoneGeos, false);
    for (let i = 0; i < stoneGeos.length; i++) stoneGeos[i].dispose();
    const stoneMesh = new THREE.Mesh(mergedStone, pal.stoneMat);
    setShadow(stoneMesh, ctx, true, true);
    group.add(stoneMesh);
  }

  group.userData = {
    kind: 'village_fence_run',
    fenceSegments
  };
  return group;
}

export {
  createVillageWell,
  createVillageGateArch,
  createVillageLanternPost,
  createVillageNoticeBoard,
  createVillageBench,
  createVillageFlowerPlanter,
  createVillageCrateCluster,
  createVillageStonePath,
  createVillageFenceRun
};
