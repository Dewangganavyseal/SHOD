import { HC } from '../hc.js';

const THREE = HC.THREE;

// ============================================================================
// DETERMINISTIC RNG & MATH HELPERS
// ============================================================================

function makeRng(seed = 415265) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function applyCel(ctx, mat, opts) {
  if (ctx && typeof ctx.applyStylizedCelShading === 'function') {
    ctx.applyStylizedCelShading(mat, opts);
  }
  return mat;
}

function makeCanvasTexture(size, drawFn, repeatX = 1, repeatY = 1, isColor = true) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  drawFn(g, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURES (BotW / Truckful Painterly Style)
// ============================================================================

/**
 * Dark blue-slate cave granite with fine quartz mineral veins and lower-edge dampness.
 */
function createCavernRockTexture(seed = 8101) {
  return makeCanvasTexture(256, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#364253';
    g.fillRect(0, 0, w, h);

    // Broad chiseled granite strata & mineral clouds (wrapped horizontally & vertically)
    const tones = ['#2a3443', '#425064', '#4d5d73', '#2e3948', '#56677e', '#3a4759'];
    for (let i = 0; i < 150; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const rx = 14 + rng() * 34;
      const ry = 8 + rng() * 20;
      const rot = (rng() - 0.5) * 0.55;
      g.fillStyle = tones[Math.floor(rng() * tones.length)];
      g.globalAlpha = 0.24 + rng() * 0.28;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Crisp horizontal & angled sedimentary rock fractures
    g.globalAlpha = 0.42;
    for (let c = 0; c < 30; c++) {
      let cx = rng() * w;
      let cy = rng() * h;
      g.strokeStyle = c % 3 === 0 ? '#18202c' : '#232d3b';
      g.lineWidth = 1.0 + rng() * 1.5;
      for (const ox of [-w, 0, w]) {
        g.beginPath();
        g.moveTo(cx + ox, cy);
        let px = cx;
        let py = cy;
        for (let s = 0; s < 4; s++) {
          px += 12 + (rng() - 0.35) * 18;
          py += (rng() - 0.5) * 10;
          g.lineTo(px + ox, py);
        }
        g.stroke();
      }
    }

    // Fine crystalline quartz mineral veins (icy cyan & subtle lavender threads)
    for (let v = 0; v < 24; v++) {
      let vx = rng() * w;
      let vy = rng() * h;
      const veinPts = [[vx, vy]];
      for (let s = 0; s < 5; s++) {
        vx += (rng() - 0.28) * 26;
        vy += (rng() - 0.45) * 24;
        veinPts.push([vx, vy]);
      }
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          // Soft mineral glow halo
          g.globalAlpha = 0.14;
          g.strokeStyle = v % 3 === 0 ? '#c4b5fd' : '#67e8f9';
          g.lineWidth = 3.2;
          g.beginPath();
          g.moveTo(veinPts[0][0] + ox, veinPts[0][1] + oy);
          for (let p = 1; p < veinPts.length; p++) {
            g.lineTo(veinPts[p][0] + ox, veinPts[p][1] + oy);
          }
          g.stroke();

          // Sharp hairline quartz core
          g.globalAlpha = 0.55;
          g.strokeStyle = v % 3 === 0 ? '#ede9fe' : '#cffafe';
          g.lineWidth = 1.0;
          g.stroke();
        }
      }
    }

    // Subtle sunlit bevel streaks & crystalline mineral flecks
    g.globalAlpha = 0.20;
    for (let i = 0; i < 120; i++) {
      g.fillStyle = rng() > 0.35 ? '#94b2d0' : '#bae6fd';
      g.fillRect(rng() * w, rng() * h, 1.8, 1.8);
    }

    // Wet/damp lower mineral zone (canvas bottom => UV.v near 0)
    g.globalAlpha = 1.0;
    const dampGrad = g.createLinearGradient(0, h * 0.52, 0, h);
    dampGrad.addColorStop(0.0, 'rgba(18, 28, 42, 0.0)');
    dampGrad.addColorStop(0.45, 'rgba(16, 26, 40, 0.34)');
    dampGrad.addColorStop(1.0, 'rgba(11, 20, 34, 0.62)');
    g.fillStyle = dampGrad;
    g.fillRect(0, h * 0.52, w, h * 0.48);

    // Subtle damp mineral sheen streaks rising from base
    for (let d = 0; d < 28; d++) {
      const dx = rng() * w;
      const dy = h * (0.64 + rng() * 0.32);
      g.fillStyle = 'rgba(125, 211, 252, 0.14)';
      g.fillRect(dx, dy, 1.5 + rng() * 2.5, h - dy);
    }
  }, 1, 1, true);
}

/**
 * Coastal cliff stone overlaid with painterly emerald-olive moss for cavern exterior.
 */
function createCavernMossTexture(seed = 8202) {
  return makeCanvasTexture(256, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#53606a';
    g.fillRect(0, 0, w, h);

    const rockTones = ['#45515b', '#63717b', '#6d7c86', '#4a5762', '#5b6872'];
    for (let i = 0; i < 110; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const r = 10 + rng() * 26;
      g.fillStyle = rockTones[Math.floor(rng() * rockTones.length)];
      g.globalAlpha = 0.28 + rng() * 0.25;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.ellipse(x + ox, y + oy, r, r * 0.68, (rng() - 0.5) * 0.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Coastal dark granite fissures
    g.globalAlpha = 0.36;
    g.strokeStyle = '#2b343c';
    g.lineWidth = 1.4;
    for (let c = 0; c < 18; c++) {
      let cx = rng() * w;
      let cy = rng() * h;
      g.beginPath();
      g.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) {
        cx += (rng() - 0.4) * 24;
        cy += (rng() - 0.4) * 18;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }

    // Rich coastal BotW moss patches & soft grass-green tufts (concentrated toward top/UV.v > 0.3)
    const mossTones = ['#3d6e47', '#538651', '#6a9d59', '#35604b', '#7cb061'];
    for (let m = 0; m < 135; m++) {
      const x = rng() * w;
      const y = Math.pow(rng(), 1.35) * h * 0.88;
      const rx = 6 + rng() * 18;
      const ry = 4 + rng() * 11;
      g.fillStyle = mossTones[Math.floor(rng() * mossTones.length)];
      g.globalAlpha = 0.34 + rng() * 0.32;
      for (const ox of [-w, 0, w]) {
        g.beginPath();
        g.ellipse(x + ox, y, rx, ry, (rng() - 0.5) * 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Pale sea-lichen & quartz flecks
    g.globalAlpha = 0.28;
    for (let k = 0; k < 90; k++) {
      g.fillStyle = k % 2 === 0 ? '#a9cbb1' : '#d0e2cc';
      g.beginPath();
      g.arc(rng() * w, rng() * h * 0.85, 1.2 + rng() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1.0;
  }, 1, 1, true);
}

/**
 * Faceted hexagonal crystal internal-glow texture (neutral luminous cyan-white so any tint glows).
 */
function createCrystalTexture(seed = 8303) {
  return makeCanvasTexture(256, (g, w, h) => {
    const rng = makeRng(seed);

    // Luminous internal radiance gradient (bright glowing heart + sparkling tip)
    const baseGrad = g.createLinearGradient(0, 0, 0, h);
    baseGrad.addColorStop(0.0, '#ffffff');
    baseGrad.addColorStop(0.22, '#e4fcff');
    baseGrad.addColorStop(0.60, '#b5effa');
    baseGrad.addColorStop(0.88, '#8ad9ee');
    baseGrad.addColorStop(1.0, '#6bb8d6');
    g.fillStyle = baseGrad;
    g.fillRect(0, 0, w, h);

    // 6 crisp vertical prism facet strips matching hexagonal sides
    const cols = 6;
    const colW = w / cols;
    const facetBrightness = [0.95, 0.72, 1.0, 0.65, 0.88, 0.76];
    for (let i = 0; i < cols; i++) {
      const fx = i * colW;
      const b = facetBrightness[i];
      const fGrad = g.createLinearGradient(fx, 0, fx + colW, 0);
      fGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.42)');
      fGrad.addColorStop(0.18, `rgba(210, 248, 255, ${0.28 * b})`);
      fGrad.addColorStop(0.82, `rgba(92, 168, 205, ${0.32 * (1.15 - b)})`);
      fGrad.addColorStop(1.0, 'rgba(55, 120, 165, 0.36)');
      g.fillStyle = fGrad;
      g.fillRect(fx, 0, colW, h);

      // Sharp bright crystalline facet ridge line
      g.strokeStyle = 'rgba(255, 255, 255, 0.68)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(fx, 0);
      g.lineTo(fx, h);
      g.stroke();
    }

    // Internal diagonal refraction planes & chevron cleavage facets
    for (let r = 0; r < 24; r++) {
      const rx = rng() * w;
      const ry = rng() * h;
      const rw = 16 + rng() * 36;
      const rh = 24 + rng() * 58;
      g.fillStyle = r % 2 === 0 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(110, 195, 230, 0.18)';
      g.beginPath();
      g.moveTo(rx, ry);
      g.lineTo(rx + rw, ry + rh * 0.4);
      g.lineTo(rx + rw * 0.35, ry + rh);
      g.closePath();
      g.fill();
    }

    // Fine white glowing internal core filaments & star glints
    g.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    g.lineWidth = 1.2;
    for (let s = 0; s < 18; s++) {
      const sx = rng() * w;
      const sy = rng() * h;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + (rng() - 0.5) * 18, sy - 28 - rng() * 44);
      g.stroke();
    }

    for (let d = 0; d < 65; d++) {
      const dx = rng() * w;
      const dy = rng() * h;
      const dr = 1.0 + rng() * 2.4;
      g.fillStyle = 'rgba(255, 255, 255, 0.72)';
      g.beginPath();
      g.arc(dx, dy, dr, 0, Math.PI * 2);
      g.fill();
    }
  }, 1, 1, true);
}

/**
 * Soft diamond-star glow sprite for floating crystal spores & aura shimmer.
 */
function createSporeGlowTexture() {
  return makeCanvasTexture(64, (g, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rad = g.createRadialGradient(cx, cy, 1, cx, cy, w * 0.48);
    rad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    rad.addColorStop(0.24, 'rgba(220, 248, 255, 0.85)');
    rad.addColorStop(0.55, 'rgba(130, 225, 255, 0.32)');
    rad.addColorStop(1.0, 'rgba(80, 180, 255, 0.0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, w, h);

    // Subtle crisp four-point crystal sparkle cross
    g.fillStyle = 'rgba(255, 255, 255, 0.75)';
    g.beginPath();
    g.moveTo(cx, 6);
    g.lineTo(cx + 3.2, cy - 3.2);
    g.lineTo(w - 6, cy);
    g.lineTo(cx + 3.2, cy + 3.2);
    g.lineTo(cx, h - 6);
    g.lineTo(cx - 3.2, cy + 3.2);
    g.lineTo(6, cy);
    g.lineTo(cx - 3.2, cy - 3.2);
    g.closePath();
    g.fill();
  }, 1, 1, true);
}

// ============================================================================
// GEOMETRY BUILDERS & MERGER
// ============================================================================

function mergeGeometries(geos, includeColor = false) {
  const prepared = [];
  let totalVerts = 0;

  for (let i = 0; i < geos.length; i++) {
    const raw = geos[i];
    if (!raw) continue;
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) {
      g.dispose();
      continue;
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    if (includeColor && !g.getAttribute('color')) {
      const c = new Float32Array(pos.count * 3);
      c.fill(1.0);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
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
    const count = g.getAttribute('position').count;
    positions.set(g.getAttribute('position').array, offset * 3);
    normals.set(g.getAttribute('normal').array, offset * 3);
    uvs.set(g.getAttribute('uv').array, offset * 2);
    if (includeColor) colors.set(g.getAttribute('color').array, offset * 3);
    offset += count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (includeColor) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Rebuilds clean triplanar-height UVs on non-indexed sculpted rock geometry so damp bases align at bottom.
 */
function applyRockTriplanarUVs(geo, uvScale = 0.14) {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  if (!pos || !norm || !uv) return;

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.5, maxY - minY);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    const hNorm = clamp((y - minY) / spanY, 0.02, 0.98);
    if (ny >= nx && ny >= nz) {
      // Top/underside surfaces stay in the dry rock/moss upper UV range
      uv.setXY(i, x * uvScale, 0.48 + ((z * uvScale) % 0.48));
    } else if (nx >= nz) {
      uv.setXY(i, z * uvScale, hNorm);
    } else {
      uv.setXY(i, x * uvScale, hNorm);
    }
  }
  uv.needsUpdate = true;
}

/**
 * Creates a faceted, stratified cliff rock/boulder in local unit bounds transformed by matrix.
 */
function createSculptedRock(sx, sy, sz, px, py, pz, rx, ry, rz, seed, detail = 1, flatBottom = false) {
  const base = new THREE.IcosahedronGeometry(1.0, detail);
  const g = base.index ? base.toNonIndexed() : base.clone();
  base.dispose();

  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    const n1 = Math.sin(vx * 3.1 + seed * 1.3) * Math.cos(vz * 2.9 + seed * 0.7);
    const n2 = Math.sin(vy * 4.4 + vx * 2.2 - seed * 1.9);
    const strata = Math.sin(vy * 7.5 + seed) * 0.06;
    const radScale = 0.86 + n1 * 0.16 + n2 * 0.09 + strata;

    vx *= radScale;
    vz *= radScale;
    vy *= 0.88 + n2 * 0.11;
    if (flatBottom && vy < -0.25) {
      vy = -0.25 + (vy + 0.25) * 0.35;
    }
    pos.setXYZ(i, vx, vy, vz);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m4.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m4);
  g.computeVertexNormals();
  applyRockTriplanarUVs(g, 0.13);
  return g;
}

/**
 * Creates a tapered, fluted stalactite (pointing -Y) or stalagmite (pointing +Y).
 */
function createSpeleothem(radius, height, isStalactite, px, py, pz, tiltX, tiltZ, seed) {
  const segs = 7;
  const rings = 4;
  const base = new THREE.CylinderGeometry(radius * 0.10, radius, height, segs, rings, false);
  if (isStalactite) {
    base.translate(0, height * 0.5, 0);
    base.rotateX(Math.PI);
  } else {
    base.translate(0, height * 0.5, 0);
  }
  const g = base.index ? base.toNonIndexed() : base.clone();
  base.dispose();

  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const rib = 1.0 + 0.16 * Math.sin(ang * 4.0 + seed) + 0.10 * Math.sin(y * 3.8 + seed * 2.1);
    x *= rib;
    z *= rib;
    pos.setXYZ(i, x, y, z);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, seed, tiltZ));
  m4.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m4);
  g.computeVertexNormals();
  applyRockTriplanarUVs(g, 0.22);
  return g;
}

/**
 * Builds a true 6-sided hexagonal prism with a sharp 6-sided pyramidal spire tip and baked facet shading.
 */
function createHexCrystalPrism(radius, height, tipFraction, matrix4, seed) {
  const sides = 6;
  const shaftH = height * (1.0 - tipFraction);
  const baseR = radius;
  const shoulderR = radius * 0.88;

  const positions = [];
  const uvs = [];
  const colors = [];

  const pushTri = (ax, ay, az, au, av, ac, bx, by, bz, bu, bv, bc, cx, cy, cz, cu, cv, cc) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    uvs.push(au, av, bu, bv, cu, cv);
    colors.push(
      ac, ac, ac,
      bc, bc, bc,
      cc, cc, cc
    );
  };

  const facetShades = [1.0, 0.76, 0.94, 0.72, 0.90, 0.80];
  const tipOffset = (hash3(seed, 1.7, 3.1) - 0.5) * radius * 0.18;
  const tipZOffset = (hash3(seed, 4.3, 2.9) - 0.5) * radius * 0.18;

  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const x0b = Math.cos(a0) * baseR;
    const z0b = Math.sin(a0) * baseR;
    const x1b = Math.cos(a1) * baseR;
    const z1b = Math.sin(a1) * baseR;

    const x0s = Math.cos(a0) * shoulderR;
    const z0s = Math.sin(a0) * shoulderR;
    const x1s = Math.cos(a1) * shoulderR;
    const z1s = Math.sin(a1) * shoulderR;

    const u0 = i / sides;
    const u1 = (i + 1) / sides;
    const shade = facetShades[i];
    const baseCol = 0.66 * shade;
    const midCol = 0.92 * shade;
    const tipCol = 1.0;

    // Prism side quad (2 triangles, CCW outward)
    pushTri(
      x0b, 0, z0b, u0, 0.0, baseCol,
      x0s, shaftH, z0s, u0, 0.72, midCol,
      x1s, shaftH, z1s, u1, 0.72, midCol
    );
    pushTri(
      x0b, 0, z0b, u0, 0.0, baseCol,
      x1s, shaftH, z1s, u1, 0.72, midCol,
      x1b, 0, z1b, u1, 0.0, baseCol
    );

    // Pyramidal spire face converging to apex
    pushTri(
      x0s, shaftH, z0s, u0, 0.72, midCol * 1.05,
      tipOffset, height, tipZOffset, (u0 + u1) * 0.5, 1.0, tipCol,
      x1s, shaftH, z1s, u1, 0.72, midCol * 1.05
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.applyMatrix4(matrix4);
  geo.computeVertexNormals();
  return geo;
}

// ============================================================================
// MAIN BUILDER: CRYSTAL LUMINA CAVERN
// ============================================================================

function createCrystalCavern(ctx = {}) {
  const rng = makeRng(4152659);
  const isMobile = !!(ctx && ctx.isMobileDevice);

  const cx = typeof ctx.x === 'number' ? ctx.x : 415;
  const cz = typeof ctx.z === 'number' ? ctx.z : 265;
  const rotY = typeof ctx.rotationY === 'number' ? ctx.rotationY : -2.35;
  const cy = typeof ctx.y === 'number'
    ? ctx.y
    : (typeof ctx.getTerrainHeight === 'function' ? ctx.getTerrainHeight(cx, cz) : 0);

  const group = new THREE.Group();
  group.name = 'CrystalLuminaCavern';
  group.position.set(cx, cy, cz);
  group.rotation.y = rotY;

  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const toWorldXZ = (lx, lz) => [cx + lx * cosR + lz * sinR, cz - lx * sinR + lz * cosR];
  const terrainDeltaY = (lx, lz) => {
    if (!ctx || typeof ctx.getTerrainHeight !== 'function') return 0;
    const [wx, wz] = toWorldXZ(lx, lz);
    return ctx.getTerrainHeight(wx, wz) - cy;
  };
  const addCollider = (lx, lz, radius, localMaxY) => {
    if (!ctx || typeof ctx.addCircleCollider !== 'function') return;
    const [wx, wz] = toWorldXZ(lx, lz);
    ctx.addCircleCollider('cavern_wall', wx, wz, radius, cy + localMaxY, group);
  };

  // ---- 1. Procedural Textures & Materials ----
  const cavernRockTex = createCavernRockTexture(8101);
  const cavernMossTex = createCavernMossTexture(8202);
  const crystalTex = createCrystalTexture(8303);
  const sporeGlowTex = createSporeGlowTexture();

  const rockPrimaryMat = applyCel(ctx, new THREE.MeshStandardMaterial({
    map: cavernRockTex,
    color: 0xc2d1e5,
    roughness: 0.88,
    metalness: 0.06,
  }), { rimStrength: 0.20, shadowLift: 0.48 });

  const rockLightMat = applyCel(ctx, new THREE.MeshStandardMaterial({
    map: cavernRockTex,
    color: 0xe6effa,
    roughness: 0.82,
    metalness: 0.08,
  }), { rimStrength: 0.22, shadowLift: 0.56 });

  const rockWetMat = applyCel(ctx, new THREE.MeshStandardMaterial({
    map: cavernRockTex,
    color: 0x95adc9,
    roughness: 0.52,
    metalness: 0.14,
  }), { rimStrength: 0.28, shadowLift: 0.46 });

  const mossRockMat = applyCel(ctx, new THREE.MeshStandardMaterial({
    map: cavernMossTex,
    color: 0xd9e6de,
    roughness: 0.90,
    metalness: 0.04,
  }), { rimStrength: 0.16, shadowLift: 0.54 });

  const cavernFloorMat = applyCel(ctx, new THREE.MeshStandardMaterial({
    map: cavernRockTex,
    color: 0xaabbd1,
    roughness: 0.84,
    metalness: 0.08,
  }), { rimStrength: 0.14, shadowLift: 0.52 });

  // 3 crystal color variants x 2 pulse phase groups for gentle living shimmer
  const crystalColors = [
    { name: 'aquamarine', hex: 0x22d3ee, emissive: 0x16bcd8 },
    { name: 'amethyst', hex: 0xc084fc, emissive: 0xa855f7 },
    { name: 'diamond_ice', hex: 0x67e8f9, emissive: 0x38bdf8 },
  ];
  const crystalMats = [];
  for (let p = 0; p < 2; p++) {
    for (let c = 0; c < crystalColors.length; c++) {
      const def = crystalColors[c];
      const mat = new THREE.MeshStandardMaterial({
        map: crystalTex,
        emissiveMap: crystalTex,
        color: def.hex,
        emissive: def.emissive,
        emissiveIntensity: 0.82,
        roughness: 0.16,
        metalness: 0.16,
        vertexColors: true,
      });
      crystalMats.push({ mat, phase: p * 1.7 + c * 1.15, baseIntensity: 0.82 });
    }
  }

  // Geometry collector buckets by material key
  const rockPrimaryGeos = [];
  const rockLightGeos = [];
  const rockWetGeos = [];
  const mossRockGeos = [];
  const pebbleWetGeos = [];
  const crystalGeoBuckets = crystalMats.map(() => []);

  // ---- 2. Cavern Stone Floor Courtyard & Entrance Flagstone Threshold (Zero Colliders) ----
  const chamberCenterZ = -1.0;
  {
    const floorGeo = new THREE.CylinderGeometry(11.8, 12.4, 0.18, 28, 1);
    floorGeo.translate(0, -0.05, chamberCenterZ);
    const fPos = floorGeo.getAttribute('position');
    for (let i = 0; i < fPos.count; i++) {
      const x = fPos.getX(i);
      const y = fPos.getY(i);
      const z = fPos.getZ(i);
      if (y > 0) {
        const dCenter = Math.hypot(x, z - chamberCenterZ);
        const ripple = Math.sin(x * 0.42 + z * 0.38) * 0.022;
        const poolDip = dCenter < 3.8 ? -0.08 * (1.0 - dCenter / 3.8) : 0;
        fPos.setY(i, y + ripple + poolDip);
      }
    }
    floorGeo.computeVertexNormals();
    const floorMesh = new THREE.Mesh(floorGeo, cavernFloorMat);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Smooth low approach flagstones leading straight into +Z portal
    const approachGeos = [];
    for (let s = 0; s < 10; s++) {
      const lx = ((s % 3) - 1) * 2.4 + (rng() - 0.5) * 0.7;
      const lz = 7.8 + Math.floor(s / 3) * 1.85 + (rng() - 0.5) * 0.4;
      const ty = terrainDeltaY(lx, lz);
      approachGeos.push(
        createSculptedRock(1.30 + rng() * 0.45, 0.10, 1.00 + rng() * 0.35, lx, ty - 0.02, lz, 0, rng() * Math.PI, 0, s + 20, 0, true)
      );
    }
    const approachMesh = new THREE.Mesh(mergeGeometries(approachGeos), rockWetMat);
    approachMesh.receiveShadow = true;
    group.add(approachMesh);
  }

  // ---- 3. Central Crystal Mirror Pool & Mineral Edge Cobbles (Zero Colliders) ----
  const poolCenterZ = chamberCenterZ;
  let poolShimmerMesh = null;
  {
    // Illuminated mineral basin floor underneath mirror water
    const bedGeo = new THREE.CircleGeometry(3.55, 24);
    bedGeo.rotateX(-Math.PI * 0.5);
    bedGeo.translate(0, 0.035, poolCenterZ);
    const bedMat = new THREE.MeshStandardMaterial({
      map: cavernRockTex,
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.48,
      roughness: 0.35,
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.receiveShadow = true;
    group.add(bedMesh);

    // Reflective crystal mirror water surface
    const poolGeo = new THREE.CircleGeometry(3.45, 28);
    poolGeo.rotateX(-Math.PI * 0.5);
    poolGeo.translate(0, 0.10, poolCenterZ);
    const poolMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x0891b2,
      emissiveIntensity: 0.52,
      roughness: 0.07,
      metalness: 0.62,
      transparent: true,
      opacity: 0.80,
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.receiveShadow = true;
    group.add(poolMesh);

    // Animated caustic ripple ring inside pool
    const shimmerGeo = new THREE.RingGeometry(1.0, 2.95, 28);
    shimmerGeo.rotateX(-Math.PI * 0.5);
    const shimmerMat = new THREE.MeshBasicMaterial({
      map: sporeGlowTex,
      color: 0xa5f3fc,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    poolShimmerMesh = new THREE.Mesh(shimmerGeo, shimmerMat);
    poolShimmerMesh.position.set(0, 0.118, poolCenterZ);
    group.add(poolShimmerMesh);

    // Thin glistening wet stones & tiny low crystal chips lining the shallow pool rim
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + (rng() - 0.5) * 0.14;
      const rad = 3.38 + (rng() - 0.5) * 0.34;
      const px = Math.cos(ang) * rad;
      const pz = poolCenterZ + Math.sin(ang) * rad;
      pebbleWetGeos.push(
        createSculptedRock(0.42 + rng() * 0.28, 0.12 + rng() * 0.05, 0.36 + rng() * 0.22, px, 0.06, pz, 0, ang, 0, i + 90, 0, true)
      );
      if (i % 4 === 0) {
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.45, ang, (rng() - 0.5) * 0.45));
        m4.compose(new THREE.Vector3(px, 0.08, pz), q, new THREE.Vector3(1, 1, 1));
        crystalGeoBuckets[i % crystalMats.length].push(
          createHexCrystalPrism(0.11, 0.36 + rng() * 0.15, 0.32, m4, i + 400)
        );
      }
    }
  }

  // ---- 4. Hollow Ring Cliff Walls (|angle| >= 0.56 rad from +Z entrance) ----
  // Wide ~11m visual mouth & >= 9.6m collider clearance, ~34m x 32m exterior mountain skirt
  const wallCount = 22;
  for (let k = 0; k < wallCount; k++) {
    const t = k / (wallCount - 1);
    const ang = 0.70 + t * (Math.PI * 2 - 1.40);
    const innerRad = 11.4 + (k % 3) * 0.45 + (rng() - 0.5) * 0.32;
    const lx = Math.sin(ang) * innerRad;
    const lz = chamberCenterZ + Math.cos(ang) * innerRad;
    const signedAng = Math.atan2(lx, lz); // exact angle from local +Z entrance axis

    const isPortalJamb = k === 0 || k === wallCount - 1 || k === 1 || k === wallCount - 2;
    const h = isPortalJamb
      ? 7.5 + (k === 1 || k === wallCount - 2 ? 1.2 : 0.2)
      : 8.0 + Math.sin((ang - 0.70) * 0.5) * 2.6 + (k % 2) * 0.9;
    const s = isPortalJamb ? 2.05 : 2.32 + (k % 3) * 0.28;

    // Lower damp cliff wall buttress
    const wallRock = createSculptedRock(
      s * 1.10, h * 0.54, s * 1.06,
      lx, h * 0.40, lz,
      (rng() - 0.5) * 0.12, ang + rng() * 0.35, (rng() - 0.5) * 0.12,
      k * 7 + 11, 1, true
    );
    (k % 2 === 0 ? rockPrimaryGeos : rockLightGeos).push(wallRock);

    // Wet base ledge apron hugging inner wall toe (kept tightly to wall perimeter)
    const baseLedge = createSculptedRock(
      s * 0.62, 1.15 + rng() * 0.4, s * 0.62,
      Math.sin(ang) * (innerRad - 0.85), 0.48, chamberCenterZ + Math.cos(ang) * (innerRad - 0.85),
      0.06, ang + 0.5, 0.05,
      k * 13 + 33, 1, true
    );
    rockWetGeos.push(baseLedge);

    // Register 'cavern_wall' collider strictly where |angle| >= 0.56 rad
    if (Math.abs(signedAng) >= 0.56) {
      const colRadius = isPortalJamb ? 1.55 : s * 0.76;
      addCollider(lx, lz, colRadius, h + 0.4);
    }

    // Outer mossy coastal cliff skirt (~34m x 32m exterior rock mountain silhouette)
    const outerRad = innerRad + 2.05 + (k % 2) * 0.45;
    const ox = Math.sin(ang) * outerRad;
    const oz = chamberCenterZ + Math.cos(ang) * outerRad;
    const oTerrainY = terrainDeltaY(ox, oz);
    const outerH = 5.2 + Math.sin((ang - 0.70) * 0.5) * 2.4 + (k % 3) * 0.75;
    mossRockGeos.push(
      createSculptedRock(
        s * 1.05, outerH * 0.52, s * 1.02,
        ox, oTerrainY + outerH * 0.34, oz,
        0.10, ang + 0.8, -0.08,
        k * 19 + 51, 1, true
      )
    );

    // Secondary outer wall seal collider so players cannot clip into cavern from outside
    if (Math.abs(signedAng) >= 0.64 && k % 2 === 0) {
      addCollider(ox * 0.94, oz * 0.94, 1.75, outerH);
    }
  }

  // Flanking outer mossy coastal entry boulders framing the cave mouth (|ang| >= 0.60 rad)
  for (const side of [-1, 1]) {
    const flx = side * 8.1;
    const flz = 11.4;
    const fty = terrainDeltaY(flx, flz);
    mossRockGeos.push(
      createSculptedRock(2.1, 2.0, 2.0, flx, fty + 1.05, flz, 0.08, side * 0.5, 0.06, side + 300, 1, true)
    );
    addCollider(flx, flz, 1.65, fty + 2.6);

    const flx2 = side * 10.6;
    const flz2 = 9.4;
    const fty2 = terrainDeltaY(flx2, flz2);
    mossRockGeos.push(
      createSculptedRock(2.2, 2.6, 2.1, flx2, fty2 + 1.35, flz2, 0.10, side * 0.9, 0.05, side + 312, 1, true)
    );
  }

  // ---- 5. Layered Vaulted Roof Dome & Wide Portal Arch (Zero Colliders!) ----
  // Center ceiling interior clearance ~10.5m, exterior mountain crown ~13.5m, portal clearance >= 6.8m
  const domeRocks = [
    // [bucket(0=primary,1=light,2=moss), lx, ly, lz, sx, sy, sz, rx, ry, rz]
    // Mouth stone arch spanning +/-X above +Z entrance (soffit stays >= 6.9m in center!)
    [0, -5.2, 8.6, 8.2, 3.2, 1.9, 3.0, 0.10, 0.32, -0.18],
    [0,  5.2, 8.6, 8.2, 3.2, 1.9, 3.0, 0.10, -0.32, 0.18],
    [1, -2.5, 9.6, 8.6, 3.1, 1.8, 2.8, 0.06, 0.18, -0.08],
    [1,  2.5, 9.6, 8.6, 3.1, 1.8, 2.8, 0.06, -0.18, 0.08],
    [2,  0.0, 10.2, 8.3, 5.2, 1.7, 3.1, 0.12, 0.0, 0.0], // mossy keystone brow
    [2, -6.6, 7.6, 7.6, 2.8, 2.2, 2.8, 0.10, 0.5, -0.15],
    [2,  6.6, 7.6, 7.6, 2.8, 2.2, 2.8, 0.10, -0.5, 0.15],

    // Mid vaulted ceiling ribs & shoulders (clear height ~9.5..11.2m inside)
    [0, -6.6, 10.0, 2.6, 4.5, 2.2, 4.6, 0.05, 0.6, -0.22],
    [0,  6.6, 10.0, 2.6, 4.5, 2.2, 4.6, 0.05, -0.6, 0.22],
    [1, -6.8, 10.2, -3.6, 4.8, 2.3, 5.0, -0.05, 1.1, -0.20],
    [1,  6.8, 10.2, -3.6, 4.8, 2.3, 5.0, -0.05, -1.1, 0.20],
    [0,  0.0, 11.0, -8.4, 6.6, 2.5, 4.4, -0.20, 0.15, 0.0],

    // Upper vaulted crown & exterior mountain peak (~13.5m high!)
    [2, -3.4, 11.7, 1.4, 4.8, 1.9, 4.8, 0.05, 0.3, -0.10],
    [2,  3.4, 11.7, 1.4, 4.8, 1.9, 4.8, 0.05, -0.3, 0.10],
    [2, -3.6, 11.8, -4.2, 5.0, 2.0, 4.8, -0.06, 0.8, -0.08],
    [2,  3.6, 11.8, -4.2, 5.0, 2.0, 4.8, -0.06, -0.8, 0.08],
    [1,  0.0, 12.1, -1.5, 5.8, 1.8, 5.6, 0.02, 0.45, 0.0],
    [2,  0.0, 12.4, -1.8, 4.2, 1.4, 4.0, 0.03, 1.1, 0.0],
  ];
  for (let i = 0; i < domeRocks.length; i++) {
    const [b, lx, ly, lz, sx, sy, sz, rx, ry, rz] = domeRocks[i];
    const rock = createSculptedRock(sx, sy, sz, lx, ly, lz, rx, ry, rz, i * 11 + 201, 1, false);
    if (b === 0) rockPrimaryGeos.push(rock);
    else if (b === 1) rockLightGeos.push(rock);
    else mossRockGeos.push(rock);
  }

  // ---- 6. Hanging Stalactites (Mouth Brow & Vault Ceiling) + Perimeter Stalagmites ----
  // Stalactites along entrance mouth lip (tips stay >= 6.5m high so horse clears cleanly!)
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const lx = -4.6 + t * 9.2;
    const archCurve = 1.0 - Math.pow(lx / 5.4, 2.0) * 0.32;
    const topY = 7.9 + archCurve * 1.45;
    const len = 1.05 + (i % 3) * 0.38;
    const lz = 7.6 + Math.sin(t * Math.PI) * 0.9 + (rng() - 0.5) * 0.35;
    const targetBucket = i % 2 === 0 ? rockLightGeos : rockPrimaryGeos;
    targetBucket.push(
      createSpeleothem(0.26 + (i % 2) * 0.09, len, true, lx, topY, lz, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08, i + 501)
    );
  }

  // Interior ceiling dome stalactites (stay high above y >= 7.8m)
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + 0.2;
    const rad = 2.6 + (i % 3) * 2.4;
    const lx = Math.cos(ang) * rad;
    const lz = chamberCenterZ + Math.sin(ang) * rad * 0.90;
    const topY = 10.5 - (rad / 8.5) * 1.0;
    const len = 1.35 + rng() * 1.55;
    const targetBucket = i % 3 === 0 ? rockPrimaryGeos : rockLightGeos;
    targetBucket.push(
      createSpeleothem(0.25 + rng() * 0.14, len, true, lx, topY, lz, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.06, i + 530)
    );
  }

  // Perimeter stalagmites strictly along wall toes (|angle| >= 0.72 rad, R >= 9.3m, keeping >= 8.5m path clear!)
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const ang = 0.75 + t * (Math.PI * 2 - 1.50);
    const rad = 9.35 + (i % 3) * 0.45;
    const lx = Math.sin(ang) * rad;
    const lz = chamberCenterZ + Math.cos(ang) * rad;
    const len = 1.35 + (i % 3) * 0.70 + rng() * 0.35;
    const sr = 0.32 + (i % 2) * 0.13;
    const targetBucket = i % 2 === 0 ? rockWetGeos : rockLightGeos;
    targetBucket.push(
      createSpeleothem(sr, len, false, lx, 0.02, lz, (rng() - 0.5) * 0.10, (rng() - 0.5) * 0.10, i + 570)
    );
  }

  // ---- 7. Hexagonal Pyramid-Tipped Crystal Clusters (>= 24 clusters in 3 colors + pebble rings) ----
  const glowHalos = [];
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();
  const tmpQuat = new THREE.Quaternion();
  const tmpMat = new THREE.Matrix4();

  function addCrystalCluster(lx, ly, lz, scale, colorIdx, options = {}) {
    const {
      inverted = false,
      tiltSpread = 0.42,
      shardCount = 5,
      withPebbleRing = true,
      registerWallCollider = false,
      addFloorGlow = false,
      seedOffset = 0,
    } = options;

    const basePhaseOffset = (seedOffset % 2) * crystalColors.length;
    const cIdx = ((colorIdx % crystalColors.length) + crystalColors.length) % crystalColors.length;
    const bucketIdx = basePhaseOffset + cIdx;
    const colorDef = crystalColors[cIdx];

    // Mineral pebble collar around cluster base
    if (withPebbleRing && !inverted) {
      const pCount = 6;
      const ringR = 0.52 * scale;
      for (let p = 0; p < pCount; p++) {
        const pa = (p / pCount) * Math.PI * 2 + rng() * 0.4;
        const px = lx + Math.cos(pa) * ringR * (0.85 + rng() * 0.3);
        const pz = lz + Math.sin(pa) * ringR * (0.85 + rng() * 0.3);
        const ps = (0.22 + rng() * 0.14) * Math.min(scale, 1.55);
        pebbleWetGeos.push(
          createSculptedRock(ps * 1.25, ps * 0.65, ps, px, ly + ps * 0.18, pz, 0, pa, 0, seedOffset * 13 + p, 0, true)
        );
      }
    }

    // Main central prism + radiating satellite hexagonal prisms
    for (let j = 0; j < shardCount; j++) {
      const isCore = j === 0;
      const radialAng = isCore ? 0 : ((j - 1) / Math.max(1, shardCount - 1)) * Math.PI * 2 + rng() * 0.45;
      const offsetDist = isCore ? 0 : (0.26 + rng() * 0.22) * scale;
      const sx = lx + Math.cos(radialAng) * offsetDist;
      const sz = lz + Math.sin(radialAng) * offsetDist;

      const shardR = (isCore ? 0.40 : 0.22 + rng() * 0.12) * scale;
      const shardH = (isCore ? 2.85 : 1.55 + rng() * 0.95) * scale;
      const tipFrac = 0.26 + rng() * 0.08;

      const lean = isCore ? 0.08 : 0.22 + rng() * tiltSpread;
      const tiltX = Math.sin(radialAng) * lean + (rng() - 0.5) * 0.12;
      const tiltZ = -Math.cos(radialAng) * lean + (rng() - 0.5) * 0.12;

      tmpEuler.set(
        inverted ? Math.PI + tiltX : tiltX,
        radialAng + rng() * 0.6,
        tiltZ
      );
      tmpQuat.setFromEuler(tmpEuler);
      tmpPos.set(sx, ly, sz);
      tmpScale.set(1, 1, 1);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);

      // Slight color variation on secondary shards within cluster for jewel depth
      const targetBucket = isCore || j % 2 === 0
        ? bucketIdx
        : (basePhaseOffset + ((cIdx + 1) % crystalColors.length));

      crystalGeoBuckets[targetBucket].push(
        createHexCrystalPrism(shardR, shardH, tipFrac, tmpMat, seedOffset * 17 + j * 3)
      );
    }

    // Subtle additive ground light pool under interior crystals (zero PointLight GPU cost)
    if (addFloorGlow && !inverted) {
      const glowGeo = new THREE.CircleGeometry(1.75 * scale, 16);
      glowGeo.rotateX(-Math.PI * 0.5);
      const glowMat = new THREE.MeshBasicMaterial({
        map: sporeGlowTex,
        color: colorDef.hex,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.set(lx, 0.06, lz);
      group.add(glowMesh);
      glowHalos.push({ mesh: glowMesh, baseOpacity: 0.22, phase: seedOffset * 0.7 });
    }

    if (registerWallCollider) {
      addCollider(lx, lz, 0.85 * Math.min(scale, 1.35), ly + 3.0 * scale);
    }
  }

  // A) 14 Interior Wall-Perimeter Crystal Clusters (|angle| >= 0.68 rad, R = 9.1..9.9m)
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const ang = 0.72 + t * (Math.PI * 2 - 1.44);
    const rad = 9.15 + (i % 3) * 0.38;
    const lx = Math.sin(ang) * rad;
    const lz = chamberCenterZ + Math.cos(ang) * rad;
    const sc = 0.95 + (i % 3) * 0.26;
    addCrystalCluster(lx, 0.04, lz, sc, i, {
      shardCount: 5,
      tiltSpread: 0.44,
      withPebbleRing: true,
      registerWallCollider: true,
      addFloorGlow: i % 2 === 0,
      seedOffset: 10 + i,
    });
  }

  // B) 2 Portal-Flanking Crystal Beacons (|angle| = 0.61 rad >= 0.56 rad, framing the entrance)
  for (const side of [-1, 1]) {
    const lx = side * 6.95;
    const lz = 9.25;
    const ty = terrainDeltaY(lx, lz);
    addCrystalCluster(lx, ty + 0.06, lz, 1.28, side > 0 ? 0 : 1, {
      shardCount: 5,
      tiltSpread: 0.36,
      withPebbleRing: true,
      registerWallCollider: true,
      addFloorGlow: true,
      seedOffset: 40 + (side > 0 ? 1 : 2),
    });
  }

  // C) 6 Inverted Ceiling-Dome & Arch-Lip Crystal Clusters (hanging downward, zero colliders!)
  const ceilingClusterSpecs = [
    [-2.4, 10.3,  0.8, 1.02, 0],
    [ 2.6, 10.4, -1.0, 1.10, 1],
    [-4.5,  9.6, -3.5, 1.00, 2],
    [ 4.4,  9.7, -3.8, 1.06, 0],
    [ 0.2, 10.7, -5.6, 1.18, 1],
    [ 0.0,  9.6,  6.8, 0.88, 2], // glowing portal crown inverted crystal (tip stays >= 6.8m high!)
  ];
  for (let i = 0; i < ceilingClusterSpecs.length; i++) {
    const [lx, ly, lz, sc, cIdx] = ceilingClusterSpecs[i];
    addCrystalCluster(lx, ly, lz, sc, cIdx, {
      inverted: true,
      shardCount: 4,
      tiltSpread: 0.34,
      withPebbleRing: false,
      registerWallCollider: false,
      seedOffset: 60 + i,
    });
  }

  // D) 6 Giant Dorsal & Crown Exterior Crystal Clusters (scale 2.0-2.8x piercing roof dome!)
  // Highly visible from afar in 3D and on the 4096x4096 top-down World Map ortho snapshot
  const roofGiantSpecs = [
    [ 0.0, 11.4, -1.6, 2.70, 0], // towering central aquamarine spire crown
    [-4.6, 10.5,  1.5, 2.20, 1], // amethyst left shoulder burst
    [ 4.9, 10.4, -2.2, 2.30, 2], // diamond-ice right flank burst
    [-2.5, 10.9, -6.2, 2.10, 2], // back-left ridge crystal cluster
    [ 2.8, 10.6,  4.0, 2.02, 0], // front-right crest burst above arch
    [ 0.8, 10.7, -8.3, 2.15, 1], // back spine amethyst spire
  ];
  for (let i = 0; i < roofGiantSpecs.length; i++) {
    const [lx, ly, lz, sc, cIdx] = roofGiantSpecs[i];
    addCrystalCluster(lx, ly, lz, sc, cIdx, {
      inverted: false,
      shardCount: 6,
      tiltSpread: 0.42,
      withPebbleRing: true,
      registerWallCollider: false, // overhead roof feature — never block floor below!
      seedOffset: 80 + i,
    });
  }

  // ---- 8. Merge Static Rock & Crystal Meshes for Optimal Draw-Call Count ----
  const meshGroups = [
    { geos: rockPrimaryGeos, mat: rockPrimaryMat, cast: true, receive: true },
    { geos: rockLightGeos, mat: rockLightMat, cast: true, receive: true },
    { geos: rockWetGeos, mat: rockWetMat, cast: true, receive: true },
    { geos: mossRockGeos, mat: mossRockMat, cast: true, receive: true },
    { geos: pebbleWetGeos, mat: rockWetMat, cast: false, receive: true },
  ];
  for (const entry of meshGroups) {
    if (entry.geos.length === 0) continue;
    const merged = mergeGeometries(entry.geos, false);
    const mesh = new THREE.Mesh(merged, entry.mat);
    mesh.castShadow = entry.cast && !isMobile;
    mesh.receiveShadow = entry.receive;
    group.add(mesh);
  }

  for (let i = 0; i < crystalGeoBuckets.length; i++) {
    const bucket = crystalGeoBuckets[i];
    if (bucket.length === 0) continue;
    const merged = mergeGeometries(bucket, true);
    const mesh = new THREE.Mesh(merged, crystalMats[i].mat);
    mesh.castShadow = !isMobile;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  // ---- 9. Floating Luminous Spores / Crystal Dust Motes (Points, 1 draw call) ----
  const sporeCount = isMobile ? 54 : 88;
  const sporePositions = new Float32Array(sporeCount * 3);
  const sporeColors = new Float32Array(sporeCount * 3);
  const sporeMeta = [];
  const paletteRGB = [
    new THREE.Color(0x22d3ee),
    new THREE.Color(0xc084fc),
    new THREE.Color(0x67e8f9),
  ];

  for (let i = 0; i < sporeCount; i++) {
    const inEntrance = i < Math.floor(sporeCount * 0.28);
    let sx, sy, sz;
    if (inEntrance) {
      sx = (rng() - 0.5) * 7.6;
      sy = 0.8 + rng() * 5.2;
      sz = 5.5 + rng() * 7.0;
    } else {
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * 8.2;
      sx = Math.cos(ang) * rad;
      sz = -0.8 + Math.sin(ang) * rad;
      sy = 0.7 + rng() * 7.4;
    }
    sporePositions[i * 3] = sx;
    sporePositions[i * 3 + 1] = sy;
    sporePositions[i * 3 + 2] = sz;

    const col = paletteRGB[i % paletteRGB.length];
    sporeColors[i * 3] = col.r;
    sporeColors[i * 3 + 1] = col.g;
    sporeColors[i * 3 + 2] = col.b;

    sporeMeta.push({
      bx: sx,
      by: sy,
      bz: sz,
      ampY: 0.24 + rng() * 0.42,
      ampXZ: 0.16 + rng() * 0.30,
      speed: 0.65 + rng() * 0.85,
      phase: rng() * Math.PI * 2,
    });
  }

  const sporeGeo = new THREE.BufferGeometry();
  const sporePosAttr = new THREE.BufferAttribute(sporePositions, 3);
  sporeGeo.setAttribute('position', sporePosAttr);
  sporeGeo.setAttribute('color', new THREE.BufferAttribute(sporeColors, 3));
  const sporeMat = new THREE.PointsMaterial({
    size: 0.44,
    map: sporeGlowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sporePoints = new THREE.Points(sporeGeo, sporeMat);
  group.add(sporePoints);

  // ---- 10. Frame Animation Hook: Crystal Shimmer, Pool Ripple & Floating Spores ----
  function update(elapsed = 0) {
    // Soft luminous crystal breathing across the 6 color/phase material buckets
    for (let i = 0; i < crystalMats.length; i++) {
      const cm = crystalMats[i];
      cm.mat.emissiveIntensity = cm.baseIntensity + Math.sin(elapsed * 1.45 + cm.phase) * 0.18;
    }

    // Gentle floor glow pulse
    for (let i = 0; i < glowHalos.length; i++) {
      const gh = glowHalos[i];
      gh.mesh.material.opacity = gh.baseOpacity + Math.sin(elapsed * 1.6 + gh.phase) * 0.06;
    }

    // Mirror pool shimmer ring
    if (poolShimmerMesh) {
      const pulse = 1.0 + Math.sin(elapsed * 1.25) * 0.045;
      poolShimmerMesh.scale.set(pulse, 1.0, pulse);
      poolShimmerMesh.rotation.y = elapsed * 0.12;
      poolShimmerMesh.material.opacity = 0.28 + Math.sin(elapsed * 1.8) * 0.08;
    }

    // Drifting floating crystal spores / dust motes
    const arr = sporePosAttr.array;
    for (let i = 0; i < sporeMeta.length; i++) {
      const m = sporeMeta[i];
      const t = elapsed * m.speed + m.phase;
      arr[i * 3] = m.bx + Math.sin(t * 0.72) * m.ampXZ;
      arr[i * 3 + 1] = m.by + Math.sin(t) * m.ampY;
      arr[i * 3 + 2] = m.bz + Math.cos(t * 0.65) * m.ampXZ;
    }
    sporePosAttr.needsUpdate = true;
  }

  return { group, update };
}

export { createCrystalCavern };
