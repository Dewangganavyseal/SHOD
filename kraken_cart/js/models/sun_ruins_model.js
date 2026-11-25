import { HC } from '../hc.js';
const THREE = HC.THREE;

// ============================================================================
// DETERMINISTIC RNG & CONTEXT HELPERS
// ============================================================================

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cel(ctx, mat, opts) {
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

// ============================================================================
// PROCEDURAL CANVAS TEXTURES (SRGBColorSpace)
// ============================================================================

function makeCanvasTexture(w, h, drawFn, wrapS = THREE.RepeatWrapping, wrapT = THREE.RepeatWrapping, rx = 1, ry = 1) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  drawFn(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.repeat.set(rx, ry);
  tex.needsUpdate = true;
  return tex;
}

function createLimestoneTexture(seed = 4101) {
  return makeCanvasTexture(256, 256, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#dfd0ae';
    g.fillRect(0, 0, w, h);

    // Subtle warm sunlit travertine washes
    const washes = ['#eadec1', '#d6c39c', '#cbb589', '#efe6cf', '#ddcba6'];
    for (let i = 0; i < 90; i++) {
      g.fillStyle = washes[Math.floor(rng() * washes.length)];
      g.globalAlpha = 0.20 + rng() * 0.22;
      const x = rng() * w;
      const y = rng() * h;
      const rx = 8 + rng() * 24;
      const ry = 5 + rng() * 14;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.ellipse(x + ox, y + oy, rx, ry, (rng() - 0.5) * 0.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Carved ashlar stone block courses
    const rows = 4;
    const rowH = h / rows;
    const blockTones = ['#e5d8b8', '#d9c8a3', '#ceb98f', '#ece2c8', '#dfd0ac'];
    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      const cols = r % 2 === 0 ? 3 : 4;
      const colW = w / cols;
      const shift = (r % 2) * (colW * 0.45);
      for (let c = -1; c <= cols; c++) {
        const x0 = c * colW + shift;
        g.globalAlpha = 0.34;
        g.fillStyle = blockTones[Math.floor(rng() * blockTones.length)];
        g.fillRect(x0 + 2, y0 + 2, colW - 4, rowH - 4);

        // Top sunlit bevel & lower shadow bevel
        g.globalAlpha = 0.32;
        g.fillStyle = '#faf3e1';
        g.fillRect(x0 + 2, y0 + 2, colW - 4, 2.5);
        g.fillStyle = '#978362';
        g.fillRect(x0 + 2, y0 + rowH - 4, colW - 4, 2.5);
      }

      // Horizontal mortar seam
      g.globalAlpha = 0.55;
      g.strokeStyle = '#8b7756';
      g.lineWidth = 2.0;
      g.beginPath();
      g.moveTo(0, y0 + 0.5);
      for (let x = 16; x <= w; x += 16) {
        g.lineTo(x, y0 + 0.5 + (rng() - 0.5) * 1.4);
      }
      g.stroke();

      // Vertical mortar seams
      for (let c = 0; c <= cols; c++) {
        const vx = ((c * colW + shift) % w + w) % w;
        g.beginPath();
        g.moveTo(vx, y0);
        g.lineTo(vx + (rng() - 0.5) * 1.6, y0 + rowH);
        g.stroke();
      }
    }

    // Hand-carved weathering fissures & tiny limestone pores
    g.globalAlpha = 0.42;
    g.strokeStyle = '#756245';
    g.lineWidth = 1.25;
    for (let k = 0; k < 16; k++) {
      let cx = rng() * w;
      let cy = rng() * h;
      g.beginPath();
      g.moveTo(cx, cy);
      const segs = 3 + Math.floor(rng() * 4);
      for (let s = 0; s < segs; s++) {
        cx += (rng() - 0.5) * 26;
        cy += (rng() - 0.35) * 20;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }

    g.globalAlpha = 0.24;
    for (let p = 0; p < 220; p++) {
      g.fillStyle = rng() > 0.45 ? '#8f7b5b' : '#f7f0de';
      g.fillRect(rng() * w, rng() * h, 1.6, 1.6);
    }
    g.globalAlpha = 1.0;
  }, THREE.RepeatWrapping, THREE.RepeatWrapping, 2, 2);
}

function createMossStoneTexture(seed = 4202) {
  return makeCanvasTexture(256, 256, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#928b79';
    g.fillRect(0, 0, w, h);

    // Mineral stone mottling
    const stoneTones = ['#7c7666', '#a49b87', '#6c685a', '#b1a68e', '#888271'];
    for (let i = 0; i < 120; i++) {
      g.fillStyle = stoneTones[Math.floor(rng() * stoneTones.length)];
      g.globalAlpha = 0.28 + rng() * 0.25;
      const x = rng() * w;
      const y = rng() * h;
      const r = 6 + rng() * 18;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Weathered block lines & deep stone cracks
    g.globalAlpha = 0.48;
    g.strokeStyle = '#4e493e';
    g.lineWidth = 2.0;
    for (let r = 0; r < 4; r++) {
      const y0 = r * (h / 4);
      g.beginPath();
      g.moveTo(0, y0);
      g.lineTo(w, y0);
      g.stroke();
    }
    for (let c = 0; c < 14; c++) {
      let cx = rng() * w;
      let cy = rng() * h;
      g.beginPath();
      g.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) {
        cx += (rng() - 0.5) * 24;
        cy += (rng() - 0.5) * 24;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }

    // Lush deep emerald & olive creeping moss blotches
    const mossTones = ['#395b2b', '#4d7637', '#2c4721', '#658b42', '#3f6730'];
    for (let m = 0; m < 130; m++) {
      g.fillStyle = mossTones[Math.floor(rng() * mossTones.length)];
      g.globalAlpha = 0.34 + rng() * 0.34;
      const x = rng() * w;
      const y = rng() * h;
      const rx = 5 + rng() * 16;
      const ry = 4 + rng() * 13;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.ellipse(x + ox, y + oy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Pale sage lichen flecks
    g.globalAlpha = 0.36;
    for (let l = 0; l < 95; l++) {
      g.fillStyle = rng() > 0.4 ? '#9ab07c' : '#6c884b';
      g.beginPath();
      g.arc(rng() * w, rng() * h, 1.2 + rng() * 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1.0;
  }, THREE.RepeatWrapping, THREE.RepeatWrapping, 2, 2);
}

function createMosaicFloorTexture(seed = 4303) {
  return makeCanvasTexture(512, 512, (g, w, h) => {
    const rng = makeRng(seed);
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Warm travertine grout base
    g.fillStyle = '#9b8b6d';
    g.fillRect(0, 0, w, h);

    // Outer courtyard slate-limestone paving tiles
    const tileCols = 16;
    const step = w / tileCols;
    const outerTones = ['#d8c8a4', '#ceb990', '#e0d3b3', '#c5af86', '#d3c19a'];
    for (let iy = 0; iy < tileCols; iy++) {
      for (let ix = 0; ix < tileCols; ix++) {
        g.fillStyle = outerTones[Math.floor(rng() * outerTones.length)];
        g.fillRect(ix * step + 2, iy * step + 2, step - 4, step - 4);
        g.fillStyle = 'rgba(255,248,230,0.22)';
        g.fillRect(ix * step + 2, iy * step + 2, step - 4, 3);
      }
    }

    // Corner solar quadrant geometric inlays
    const corners = [
      [0, 0], [w, 0], [w, h], [0, h],
    ];
    for (const [kx, ky] of corners) {
      g.fillStyle = '#477c79';
      g.beginPath();
      g.arc(kx, ky, 82, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#cf9e46';
      g.beginPath();
      g.arc(kx, ky, 54, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e5d8b9';
      g.beginPath();
      g.arc(kx, ky, 28, 0, Math.PI * 2);
      g.fill();
    }

    // Outer perimeter mosaic border frame
    const pad = 16;
    g.strokeStyle = '#6e5e44';
    g.lineWidth = 6;
    g.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    g.strokeStyle = '#cf9b43';
    g.lineWidth = 4;
    g.strokeRect(pad + 8, pad + 8, w - (pad + 8) * 2, h - (pad + 8) * 2);

    // Outer circular sun-ring framing the central sunburst
    g.fillStyle = '#73644c';
    g.beginPath();
    g.arc(cx, cy, 236, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#d9caa5';
    g.beginPath();
    g.arc(cx, cy, 228, 0, Math.PI * 2);
    g.fill();

    // 24-segment alternating border ring (terracotta, teal, ivory)
    const segCount = 24;
    for (let i = 0; i < segCount; i++) {
      const a0 = (i / segCount) * Math.PI * 2;
      const a1 = ((i + 1) / segCount) * Math.PI * 2;
      g.fillStyle = i % 3 === 0 ? '#be824a' : i % 3 === 1 ? '#417d7a' : '#e6dac0';
      g.beginPath();
      g.moveTo(cx + Math.cos(a0) * 196, cy + Math.sin(a0) * 196);
      g.arc(cx, cy, 224, a0 + 0.015, a1 - 0.015);
      g.arc(cx, cy, 196, a1 - 0.015, a0 + 0.015, true);
      g.closePath();
      g.fill();
    }

    // Sunburst background disc
    g.fillStyle = '#99896c';
    g.beginPath();
    g.arc(cx, cy, 192, 0, Math.PI * 2);
    g.fill();

    // 12-pointed golden & turquoise sunburst rays (clearly visible outside central altar!)
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2;
      const angNext = ((i + 0.5) / rays) * Math.PI * 2;
      const angPrev = ((i - 0.5) / rays) * Math.PI * 2;

      // Wide background wedge
      g.fillStyle = i % 2 === 0 ? '#dfd2b2' : '#c6b38b';
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, 188, angPrev, angNext);
      g.closePath();
      g.fill();

      // Sharp golden solar ray
      g.fillStyle = i % 2 === 0 ? '#d8a23e' : '#3e8482';
      g.beginPath();
      g.moveTo(cx + Math.cos(ang - 0.14) * 78, cy + Math.sin(ang - 0.14) * 78);
      g.lineTo(cx + Math.cos(ang) * 186, cy + Math.sin(ang) * 186);
      g.lineTo(cx + Math.cos(ang + 0.14) * 78, cy + Math.sin(ang + 0.14) * 78);
      g.closePath();
      g.fill();

      // Crisp stone grout highlight along ray ridge
      g.strokeStyle = '#6f5f46';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(ang) * 76, cy + Math.sin(ang) * 76);
      g.lineTo(cx + Math.cos(ang) * 186, cy + Math.sin(ang) * 186);
      g.stroke();
    }

    // Inner mosaic rings beneath & around altar steps
    g.strokeStyle = '#6d5e45';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, 144, 0, Math.PI * 2);
    g.stroke();

    g.fillStyle = '#cf9c3f';
    g.beginPath();
    g.arc(cx, cy, 112, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#e7dbc0';
    g.beginPath();
    g.arc(cx, cy, 94, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#3b7f7d';
    g.beginPath();
    g.arc(cx, cy, 62, 0, Math.PI * 2);
    g.fill();

    // Fine radial stone tesserae cracks & mossy edge weathering
    g.globalAlpha = 0.34;
    g.strokeStyle = '#61533e';
    g.lineWidth = 1.6;
    for (let c = 0; c < 18; c++) {
      let x = rng() * w;
      let y = rng() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (rng() - 0.5) * 44;
        y += (rng() - 0.5) * 44;
        g.lineTo(x, y);
      }
      g.stroke();
    }

    // Subtle emerald moss creeping at mosaic corners & seams
    for (let m = 0; m < 85; m++) {
      const mx = rng() * w;
      const my = rng() * h;
      const dist = Math.hypot(mx - cx, my - cy);
      if (dist < 155 && rng() < 0.72) continue;
      g.fillStyle = rng() > 0.5 ? '#486d35' : '#5d8341';
      g.globalAlpha = 0.22 + rng() * 0.24;
      g.beginPath();
      g.ellipse(mx, my, 4 + rng() * 14, 3 + rng() * 11, rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1.0;
  }, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, 1, 1);
}

function createWarmGlowTexture() {
  return makeCanvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0.0, 'rgba(255, 248, 206, 1.0)');
    grad.addColorStop(0.32, 'rgba(255, 188, 86, 0.70)');
    grad.addColorStop(0.68, 'rgba(255, 118, 32, 0.24)');
    grad.addColorStop(1.0, 'rgba(255, 96, 20, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, 1, 1);
}

// ============================================================================
// GEOMETRY MERGING & PRIMITIVE BATCH HELPERS
// ============================================================================

function mergeGeometries(rawGeos) {
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
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    prepared.push(g);
    totalVerts += pos.count;
    src.dispose();
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let offset = 0;
  for (let i = 0; i < prepared.length; i++) {
    const g = prepared[i];
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    positions.set(p.array, offset * 3);
    normals.set(n.array, offset * 3);
    uvs.set(u.array, offset * 2);
    offset += p.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  return out;
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();

function pushGeo(list, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  _pos.set(x, y, z);
  _scale.set(sx, sy, sz);
  _mat4.compose(_pos, _quat, _scale);
  geo.applyMatrix4(_mat4);
  list.push(geo);
}

function pushBox(list, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  pushGeo(list, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
}

function pushCyl(list, rTop, rBot, h, segs, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  pushGeo(list, new THREE.CylinderGeometry(rTop, rBot, h, segs), x, y, z, rx, ry, rz);
}

// ============================================================================
// CUSTOM SCULPTED PROCEDURAL GEOMETRIES
// ============================================================================

/**
 * Builds a classically fluted stone column shaft with subtle entasis taper
 * and optional jagged slanted fracture at the top for broken ruins.
 */
function buildFlutedColumnGeo(rBot, rTop, height, flutes = 12, radialSegs = 36, heightSegs = 6, brokenOpts = null) {
  const positions = [];
  const uvs = [];
  const rng = makeRng(brokenOpts ? brokenOpts.seed : 9001);

  const ringPts = [];
  const topAngles = [];
  const topRads = [];
  const topHeights = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const t = iy / heightSegs;
    const baseR = rBot + (rTop - rBot) * t + Math.sin(t * Math.PI) * 0.015;
    // Fade flutes gently near bottom/top collars
    const fluteFade = Math.min(1, t * 7.0) * (brokenOpts ? 1.0 : Math.min(1, (1 - t) * 7.0));
    const ring = [];

    for (let ir = 0; ir <= radialSegs; ir++) {
      const u = ir / radialSegs;
      const theta = u * Math.PI * 2;
      const fluteWave = 0.5 + 0.5 * Math.cos(theta * flutes);
      const fluteIndent = Math.pow(fluteWave, 1.35) * 0.058 * baseR * fluteFade;
      const r = baseR - fluteIndent;
      const vx = Math.cos(theta) * r;
      const vz = Math.sin(theta) * r;

      let topY = height;
      if (brokenOpts) {
        const jag =
          Math.sin(theta * 4.0 + brokenOpts.phase) * 0.11 +
          Math.cos(theta * 7.0 - brokenOpts.phase * 1.4) * 0.065 +
          Math.sin(theta * 11.0 + brokenOpts.phase * 2.1) * 0.03;
        topY = Math.max(0.45, height + brokenOpts.slantX * vx + brokenOpts.slantZ * vz + jag);
      }

      const vy = t * topY;
      ring.push([vx, vy, vz, u, t]);

      if (iy === heightSegs && ir < radialSegs) {
        topAngles.push(theta);
        topRads.push(r);
        topHeights.push(vy);
      }
    }
    ringPts.push(ring);
  }

  // Side cylinder faces
  for (let iy = 0; iy < heightSegs; iy++) {
    const rowA = ringPts[iy];
    const rowB = ringPts[iy + 1];
    for (let ir = 0; ir < radialSegs; ir++) {
      const a = rowA[ir];
      const b = rowA[ir + 1];
      const c = rowB[ir + 1];
      const d = rowB[ir];

      positions.push(a[0], a[1], a[2], d[0], d[1], d[2], b[0], b[1], b[2]);
      uvs.push(a[3], a[4], d[3], d[4], b[3], b[4]);

      positions.push(b[0], b[1], b[2], d[0], d[1], d[2], c[0], c[1], c[2]);
      uvs.push(b[3], b[4], d[3], d[4], c[3], c[4]);
    }
  }

  // Top cap (flat for intact, fractured jagged stone plane for broken)
  const centerTopY = brokenOpts
    ? height + (rng() - 0.5) * 0.08
    : height;
  const topRow = ringPts[heightSegs];
  for (let ir = 0; ir < radialSegs; ir++) {
    const p1 = topRow[ir];
    const p2 = topRow[ir + 1];
    positions.push(0, centerTopY, 0, p2[0], p2[1], p2[2], p1[0], p1[1], p1[2]);
    uvs.push(0.5, 0.5, 0.5 + p2[0], 0.5 + p2[2], 0.5 + p1[0], 0.5 + p1[2]);
  }

  // Bottom cap
  const botRow = ringPts[0];
  for (let ir = 0; ir < radialSegs; ir++) {
    const p1 = botRow[ir];
    const p2 = botRow[ir + 1];
    positions.push(0, 0, 0, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    uvs.push(0.5, 0.5, 0.5 + p1[0], 0.5 + p1[2], 0.5 + p2[0], 0.5 + p2[2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a beveled trapezoidal voussoir stone block for curved temple arches.
 */
function buildVoussoirGeo(innerR, outerR, depth, halfAngle) {
  const shape = new THREE.Shape();
  const a0 = -halfAngle;
  const a1 = halfAngle;
  shape.moveTo(Math.sin(a0) * innerR, Math.cos(a0) * innerR);
  shape.lineTo(Math.sin(a0) * outerR, Math.cos(a0) * outerR);
  shape.lineTo(Math.sin(a1) * outerR, Math.cos(a1) * outerR);
  shape.lineTo(Math.sin(a1) * innerR, Math.cos(a1) * innerR);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  return geo;
}

/**
 * Builds a stylized BotW/Truckful multi-frond arched fern cluster.
 */
function buildFernCluster(list, cx, cy, cz, scale = 1.0, seed = 1) {
  const rng = makeRng(seed);
  const frondCount = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < frondCount; i++) {
    const yaw = (i / frondCount) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const tilt = 0.45 + rng() * 0.48;
    const len = (0.48 + rng() * 0.32) * scale;
    const width = (0.14 + rng() * 0.06) * scale;

    // 2-segment arched blade per fern frond
    const seg1 = new THREE.BoxGeometry(width, 0.025 * scale, len * 0.56);
    seg1.translate(0, 0, len * 0.28);
    pushGeo(
      list,
      seg1,
      cx,
      cy + 0.03 * scale,
      cz,
      -tilt,
      yaw,
      0
    );

    const midDist = Math.cos(tilt) * len * 0.52;
    const midH = Math.sin(tilt) * len * 0.52;
    const seg2 = new THREE.ConeGeometry(width * 0.55, len * 0.55, 4);
    seg2.rotateX(Math.PI * 0.5);
    seg2.translate(0, 0, len * 0.24);
    pushGeo(
      list,
      seg2,
      cx + Math.sin(yaw) * midDist,
      cy + 0.03 * scale + midH,
      cz + Math.cos(yaw) * midDist,
      -tilt + 0.52,
      yaw,
      0
    );
  }
}

/**
 * Builds an irregular angular weathered boulder/rubble rock.
 */
function pushRockChunk(list, cx, cy, cz, rx, ry, rz, yaw = 0, seed = 11) {
  const geo = new THREE.DodecahedronGeometry(1.0, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const n = 0.80 + 0.34 * hash01(i * 3.17 + seed * 1.7 + vx * 5.1 + vz * 7.3);
    pos.setXYZ(i, vx * n, vy * (vy < 0 ? 0.65 : n), vz * n);
  }
  geo.computeVertexNormals();
  pushGeo(list, geo, cx, cy, cz, (hash01(seed) - 0.5) * 0.4, yaw, (hash01(seed + 7) - 0.5) * 0.4, rx, ry, rz);
}

// ============================================================================
// ARCHITECTURAL SECTION BUILDERS
// ============================================================================

function buildPlatformsAndStairs(batches, walkableGeos, minLocalY) {
  const { limestone, carved, moss } = batches;

  const tier1Top = 0.66;
  const tier2Top = 1.32;
  const skirtBottom = Math.min(-0.95, minLocalY - 0.55);
  const skirtH = 0.28 - skirtBottom;

  // --- Tier 1: 23m x 23m Foundation Platform ---
  const t1Size = 23.0;
  const t1Half = t1Size * 0.5; // 11.5
  const t1CoreH = tier1Top - skirtBottom;
  pushBox(walkableGeos, t1Size, t1CoreH, t1Size, 0, skirtBottom + t1CoreH * 0.5, 0);

  // Mossy foundation skirt wrapping Tier 1 lower edge
  pushBox(moss, t1Size + 0.34, skirtH, t1Size + 0.34, 0, skirtBottom + skirtH * 0.5, 0);

  // Tier 1 sculpted rim curbs along the 4 edges (open cleanly at [-2.35, +2.35] for stairs!)
  const t1CurbW = 0.54;
  const t1CurbH = 0.14;
  const t1SegLen = t1Half - 2.35; // 9.15m per side wing
  const t1SegCenter = 2.35 + t1SegLen * 0.5;
  const t1CurbPos = t1Half - t1CurbW * 0.5;
  for (const s of [-1, 1]) {
    // North/South curb wings
    pushBox(carved, t1SegLen, t1CurbH, t1CurbW, -t1SegCenter, tier1Top + t1CurbH * 0.45, s * t1CurbPos);
    pushBox(carved, t1SegLen, t1CurbH, t1CurbW, +t1SegCenter, tier1Top + t1CurbH * 0.45, s * t1CurbPos);
    // East/West curb wings
    pushBox(carved, t1CurbW, t1CurbH, t1SegLen, s * t1CurbPos, tier1Top + t1CurbH * 0.45, -t1SegCenter);
    pushBox(carved, t1CurbW, t1CurbH, t1SegLen, s * t1CurbPos, tier1Top + t1CurbH * 0.45, +t1SegCenter);
  }

  // Ashlar corner capstones on Tier 1
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushBox(moss, 0.85, 0.18, 0.85, sx * (t1Half - 0.42), tier1Top + 0.08, sz * (t1Half - 0.42));
    }
  }

  // --- 4 Wide Outer Stairways (N, S, E, W) from terrain up to Tier 1 ---
  // Stair width 4.40m, 3 steps (0.22m rise, 0.55m depth each), outer reach +-13.15m
  const outerStairW = 4.40;
  const outerStepD = 0.55;
  const outerDirs = [
    { dx: 0, dz: 1, rotY: 0 },               // South (+Z)
    { dx: 0, dz: -1, rotY: Math.PI },        // North (-Z)
    { dx: 1, dz: 0, rotY: Math.PI * 0.5 },   // East (+X)
    { dx: -1, dz: 0, rotY: -Math.PI * 0.5 }, // West (-X)
  ];

  for (const dir of outerDirs) {
    for (let st = 0; st < 3; st++) {
      const stepTop = (st + 1) * 0.22; // 0.22, 0.44, 0.66
      const distOut = t1Half + (2 - st) * outerStepD + outerStepD * 0.5;
      const stepH = stepTop - skirtBottom;
      const lx = dir.dx * distOut;
      const lz = dir.dz * distOut;
      pushGeo(
        walkableGeos,
        new THREE.BoxGeometry(outerStairW, stepH, outerStepD + 0.06),
        lx,
        skirtBottom + stepH * 0.5,
        lz,
        0,
        dir.rotY,
        0
      );
      // Subtle front nosing trim on step tread
      pushGeo(
        carved,
        new THREE.BoxGeometry(outerStairW + 0.04, 0.06, 0.10),
        dir.dx * (distOut + outerStepD * 0.48),
        stepTop - 0.025,
        dir.dz * (distOut + outerStepD * 0.48),
        0,
        dir.rotY,
        0
      );
    }

    // Stepped stair cheek walls flanking left & right of outer stair
    for (const side of [-1, 1]) {
      const cheekLocalX = side * (outerStairW * 0.5 + 0.26);
      const cheekDist = t1Half + outerStepD * 1.5;
      const wx = dir.dx * cheekDist + Math.cos(dir.rotY) * cheekLocalX;
      const wz = dir.dz * cheekDist - Math.sin(dir.rotY) * cheekLocalX;
      const cheekH = 0.92 - skirtBottom;
      pushGeo(
        carved,
        new THREE.BoxGeometry(0.48, cheekH, outerStepD * 3 + 0.22),
        wx,
        skirtBottom + cheekH * 0.5,
        wz,
        0,
        dir.rotY,
        0
      );
      // End stone finial block on cheek wall
      const endDist = t1Half + outerStepD * 2.95;
      const ex = dir.dx * endDist + Math.cos(dir.rotY) * cheekLocalX;
      const ez = dir.dz * endDist - Math.sin(dir.rotY) * cheekLocalX;
      pushGeo(
        moss,
        new THREE.BoxGeometry(0.58, 0.22, 0.58),
        ex,
        0.54,
        ez,
        0,
        dir.rotY,
        0
      );
    }
  }

  // --- Tier 2: 14m x 14m Middle Terrace ---
  const t2Size = 14.0;
  const t2Half = t2Size * 0.5; // 7.0
  const t2H = tier2Top - tier1Top; // 0.66
  pushBox(walkableGeos, t2Size, t2H, t2Size, 0, tier1Top + t2H * 0.5 - 0.02, 0);
  // Moss-stained molding skirt around Tier 2
  pushBox(moss, t2Size + 0.24, 0.26, t2Size + 0.24, 0, tier1Top + 0.11, 0);

  // Tier 2 carved stone curb framing the 12.6m mosaic courtyard (open at [-2.05, +2.05])
  const t2CurbW = 0.68;
  const t2CurbH = 0.14;
  const t2SegLen = t2Half - 2.05; // 4.95m
  const t2SegCenter = 2.05 + t2SegLen * 0.5;
  const t2CurbPos = t2Half - t2CurbW * 0.5;
  for (const s of [-1, 1]) {
    pushBox(carved, t2SegLen, t2CurbH, t2CurbW, -t2SegCenter, tier2Top + t2CurbH * 0.35, s * t2CurbPos);
    pushBox(carved, t2SegLen, t2CurbH, t2CurbW, +t2SegCenter, tier2Top + t2CurbH * 0.35, s * t2CurbPos);
    pushBox(carved, t2CurbW, t2CurbH, t2SegLen, s * t2CurbPos, tier2Top + t2CurbH * 0.35, -t2SegCenter);
    pushBox(carved, t2CurbW, t2CurbH, t2SegLen, s * t2CurbPos, tier2Top + t2CurbH * 0.35, +t2SegCenter);
  }

  // --- 4 Wide Inner Stairways (N, S, E, W) from Tier 1 up to Tier 2 ---
  const innerStairW = 4.00;
  const innerStepD = 0.50;
  for (const dir of outerDirs) {
    for (let st = 0; st < 3; st++) {
      const stepTop = tier1Top + (st + 1) * 0.22; // 0.88, 1.10, 1.32
      const distOut = t2Half + (2 - st) * innerStepD + innerStepD * 0.5;
      const stepH = stepTop - tier1Top + 0.04;
      pushGeo(
        walkableGeos,
        new THREE.BoxGeometry(innerStairW, stepH, innerStepD + 0.06),
        dir.dx * distOut,
        tier1Top - 0.04 + stepH * 0.5,
        dir.dz * distOut,
        0,
        dir.rotY,
        0
      );
      pushGeo(
        carved,
        new THREE.BoxGeometry(innerStairW + 0.04, 0.055, 0.09),
        dir.dx * (distOut + innerStepD * 0.48),
        stepTop - 0.02,
        dir.dz * (distOut + innerStepD * 0.48),
        0,
        dir.rotY,
        0
      );
    }

    // Cheek curbs on inner stairs
    for (const side of [-1, 1]) {
      const cheekLocalX = side * (innerStairW * 0.5 + 0.24);
      const cheekDist = t2Half + innerStepD * 1.5;
      const wx = dir.dx * cheekDist + Math.cos(dir.rotY) * cheekLocalX;
      const wz = dir.dz * cheekDist - Math.sin(dir.rotY) * cheekLocalX;
      pushGeo(
        carved,
        new THREE.BoxGeometry(0.44, 0.86, innerStepD * 3 + 0.16),
        wx,
        tier1Top + 0.42,
        wz,
        0,
        dir.rotY,
        0
      );
    }
  }

  // Subtle decorative stone paver seams on Tier 1 walkway corners
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushBox(limestone, 2.2, 0.03, 2.2, sx * 7.8, tier1Top + 0.008, sz * 7.8);
    }
  }
}

function addClassicalPillarBaseAndLowerShaft(batches, x, z, baseY) {
  const { moss, carved } = batches;
  // Square base plinth
  pushBox(moss, 1.44, 0.34, 1.44, x, baseY + 0.17, z);
  pushBox(carved, 1.24, 0.16, 1.24, x, baseY + 0.42, z);
  // Molded torus base rings
  pushCyl(carved, 0.55, 0.60, 0.12, 16, x, baseY + 0.56, z);
  pushCyl(carved, 0.49, 0.53, 0.10, 16, x, baseY + 0.67, z);
  // Shaft starts at baseY + 0.72 (= 1.38m)
  return baseY + 0.72;
}

function addIntactPillar(batches, x, z, baseY) {
  const { limestone, carved } = batches;
  const shaftStart = addClassicalPillarBaseAndLowerShaft(batches, x, z, baseY);
  const shaftH = 4.24; // shaftTop = 1.38 + 4.24 = 5.62m

  // Fluted cylindrical shaft
  const shaft = buildFlutedColumnGeo(0.46, 0.39, shaftH, 12, 36, 6, null);
  pushGeo(limestone, shaft, x, shaftStart, z);

  // Carved ornamental stone rings inlaid along shaft ("bertatah cincin")
  for (const t of [0.34, 0.68]) {
    const ry = shaftStart + shaftH * t;
    const rr = 0.46 + (0.39 - 0.46) * t + 0.045;
    pushCyl(carved, rr, rr + 0.015, 0.11, 18, x, ry, z);
  }

  // Classical stone capital (necking collar, flaring echinus bell, 4 volute bolsters, square abacus)
  const capBase = shaftStart + shaftH; // 5.62
  pushCyl(carved, 0.43, 0.43, 0.09, 16, x, capBase + 0.045, z);
  pushCyl(carved, 0.64, 0.40, 0.30, 14, x, capBase + 0.24, z);

  // 4 corner volute scrolls
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushCyl(
        carved,
        0.14,
        0.14,
        0.26,
        10,
        x + sx * 0.47,
        capBase + 0.36,
        z + sz * 0.47,
        sz === sx ? Math.PI * 0.5 : 0,
        0,
        sz !== sx ? Math.PI * 0.5 : 0
      );
    }
  }

  // Heavy square abacus cap (top = 5.62 + 0.60 = 6.22m)
  pushBox(carved, 1.36, 0.22, 1.36, x, capBase + 0.49, z);
  return capBase + 0.60; // 6.22m
}

function addFriezeBeamSegment(batches, cx, cz, spanLen, beamY, horizontalAlongX, includeDentils = true) {
  const { limestone, carved, moss, dark, gold } = batches;
  const rotY = horizontalAlongX ? 0 : Math.PI * 0.5;

  // Lower stepped architrave beam
  pushGeo(limestone, new THREE.BoxGeometry(spanLen, 0.42, 1.02), cx, beamY + 0.21, cz, 0, rotY, 0);
  pushGeo(dark, new THREE.BoxGeometry(spanLen - 0.1, 0.08, 1.08), cx, beamY + 0.43, cz, 0, rotY, 0);

  // Recessed frieze band with carved triglyphs & solar metopes
  pushGeo(limestone, new THREE.BoxGeometry(spanLen - 0.04, 0.44, 0.90), cx, beamY + 0.69, cz, 0, rotY, 0);
  const count = Math.max(2, Math.floor(spanLen / 1.15));
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count - 0.5) * (spanLen - 0.65);
    const px = cx + (horizontalAlongX ? t : 0);
    const pz = cz + (horizontalAlongX ? 0 : t);
    // Triglyph block
    pushGeo(carved, new THREE.BoxGeometry(0.24, 0.42, 0.98), px, beamY + 0.69, pz, 0, rotY, 0);
    // Carved solar disc relief between triglyphs
    if (i < count - 1) {
      const midT = ((i + 1.0) / count - 0.5) * (spanLen - 0.65);
      const mx = cx + (horizontalAlongX ? midT : 0);
      const mz = cz + (horizontalAlongX ? 0 : midT);
      pushGeo(gold, new THREE.CylinderGeometry(0.12, 0.12, 0.96, 10), mx, beamY + 0.69, mz, Math.PI * 0.5, rotY, 0);
    }
  }

  // Dentil teeth under cornice
  if (includeDentils) {
    const dCount = Math.max(4, Math.floor(spanLen / 0.36));
    for (let d = 0; d < dCount; d++) {
      const dt = ((d + 0.5) / dCount - 0.5) * (spanLen - 0.22);
      const dx = cx + (horizontalAlongX ? dt : 0);
      const dz = cz + (horizontalAlongX ? 0 : dt);
      pushGeo(carved, new THREE.BoxGeometry(0.16, 0.11, 1.12), dx, beamY + 0.95, dz, 0, rotY, 0);
    }
  }

  // Overhanging upper cornice + mossy top cap
  pushGeo(carved, new THREE.BoxGeometry(spanLen + 0.08, 0.20, 1.24), cx, beamY + 1.10, cz, 0, rotY, 0);
  pushGeo(moss, new THREE.BoxGeometry(spanLen * 0.85, 0.10, 1.06), cx, beamY + 1.24, cz, 0, rotY, 0);
}

function addPortalArchLintel(batches, cx, cz, beamY, alongX) {
  const { limestone, carved, moss, gold, cyanRune } = batches;
  const rotY = alongX ? 0 : Math.PI * 0.5;
  const span = 6.50; // between -3.25 and +3.25

  // Twin springer piers above the flanking gate capitals
  for (const s of [-1, 1]) {
    const sx = cx + (alongX ? s * 3.05 : 0);
    const sz = cz + (alongX ? 0 : s * 3.05);
    pushGeo(carved, new THREE.BoxGeometry(0.95, 0.42, 1.12), sx, beamY + 0.21, sz, 0, rotY, 0);
  }

  // Voussoir stone arch ring curving over the doorway
  const archCenterY = beamY - 0.28; // 5.94m
  const innerR = 2.30;
  const outerR = 3.02;
  const voussoirCount = 11;
  const arcHalf = Math.PI * 0.44;
  for (let i = 0; i < voussoirCount; i++) {
    const frac = i / (voussoirCount - 1);
    const ang = -arcHalf + frac * arcHalf * 2;
    const isKeystone = i === Math.floor(voussoirCount / 2);
    const vOuter = isKeystone ? outerR + 0.22 : outerR;
    const vDepth = isKeystone ? 1.14 : 1.02;
    const vGeo = buildVoussoirGeo(innerR, vOuter, vDepth, (arcHalf / voussoirCount) * 0.92);
    vGeo.rotateZ(-ang);
    pushGeo(isKeystone ? carved : limestone, vGeo, cx, archCenterY, cz, 0, rotY, 0);
  }

  // Carved solar emblem on keystone (front & back)
  const keyY = archCenterY + (innerR + outerR) * 0.5 + 0.08;
  pushGeo(gold, new THREE.CylinderGeometry(0.24, 0.24, 1.20, 12), cx, keyY, cz, Math.PI * 0.5, rotY, 0);
  pushGeo(cyanRune, new THREE.CylinderGeometry(0.11, 0.11, 1.24, 8), cx, keyY, cz, Math.PI * 0.5, rotY, 0);

  // Spandrel stone shoulders tying arch into horizontal cornice level (beamY + 2.45m)
  for (const s of [-1, 1]) {
    const sx = cx + (alongX ? s * 2.48 : 0);
    const sz = cz + (alongX ? 0 : s * 2.48);
    pushGeo(limestone, new THREE.BoxGeometry(1.55, 1.20, 0.94), sx, beamY + 1.02, sz, 0, rotY, 0);
  }

  // Upper horizontal carved frieze crown & stepped pediment above the arch
  addFriezeBeamSegment(batches, cx, cz, span + 0.45, beamY + 1.48, alongX, true);
  pushGeo(moss, new THREE.BoxGeometry(3.8, 0.26, 1.04), cx, beamY + 2.84, cz, 0, rotY, 0);
}

function buildColonnadeAndBrokenPillars(batches, registerCollider, baseY) {
  const { limestone, carved, moss } = batches;
  const L = 9.40;
  const G = 3.25;
  const tier1Top = 0.66;

  // 8 Intact Pillars forming U-shape around North (-Z), West (-X), East (+X)
  const intactCoords = [
    [-L, -L], [-G, -L], [G, -L], [L, -L], // North side (4)
    [-L, -G], [-L, G],                     // West side middle (2)
    [L, -G],  [L, G],                      // East side middle (2)
  ];

  let lintelBaseY = 6.22;
  for (const [px, pz] of intactCoords) {
    lintelBaseY = addIntactPillar(batches, px, pz, tier1Top);
    registerCollider('ruin_pillar', px, pz, 0.82, baseY + 7.6);
  }

  // North carved arch lintels & frieze (z = -L)
  addFriezeBeamSegment(batches, -(L + G) * 0.5, -L, (L - G) + 1.20, lintelBaseY, true);
  addPortalArchLintel(batches, 0, -L, lintelBaseY, true);
  addFriezeBeamSegment(batches, (L + G) * 0.5, -L, (L - G) + 1.20, lintelBaseY, true);

  // West carved arch lintels & frieze (x = -L)
  addFriezeBeamSegment(batches, -L, -(L + G) * 0.5, (L - G) + 1.20, lintelBaseY, false);
  addPortalArchLintel(batches, -L, 0, lintelBaseY, false);
  // Broken cantilevered lintel end past West-South pillar (-L, +G)
  addFriezeBeamSegment(batches, -L, G + 1.15, 1.65, lintelBaseY, false, false);

  // East carved arch lintels & frieze (x = +L)
  addFriezeBeamSegment(batches, L, -(L + G) * 0.5, (L - G) + 1.20, lintelBaseY, false);
  addPortalArchLintel(batches, L, 0, lintelBaseY, false);
  // Broken cantilevered lintel end past East-South pillar (+L, +G)
  addFriezeBeamSegment(batches, L, G + 1.15, 1.65, lintelBaseY, false, false);

  // Corner capstone blocks bridging N/W and N/E entablatures cleanly
  for (const sx of [-1, 1]) {
    pushBox(carved, 1.38, 1.32, 1.38, sx * L, lintelBaseY + 0.66, -L);
  }

  // --- 4 Broken Jagged Pillars on South Front (+Z) & Fallen Column Drums ---
  const brokenSpecs = [
    {
      x: -L, z: L, h: 1.92, slantX: 0.26, slantZ: -0.18, seed: 101,
      drum: { x: -7.15, z: 9.55, len: 2.35, yaw: 0.34, r: 0.42 },
      cap:  { x: -10.25, z: 7.55, len: 1.15, yaw: -0.68, r: 0.44 },
    },
    {
      x: -G, z: L, h: 2.74, slantX: -0.22, slantZ: 0.21, seed: 202,
      drum: { x: -5.10, z: 8.15, len: 2.10, yaw: -0.52, r: 0.41 },
      cap:  { x: -4.15, z: 10.65, len: 0.95, yaw: 0.85, r: 0.42 },
    },
    {
      x: G, z: L, h: 2.32, slantX: 0.21, slantZ: 0.22, seed: 303,
      drum: { x: 5.25, z: 8.20, len: 2.25, yaw: 0.56, r: 0.41 },
      cap:  { x: 4.25, z: 10.60, len: 0.92, yaw: -0.92, r: 0.42 },
    },
    {
      x: L, z: L, h: 1.54, slantX: -0.28, slantZ: -0.16, seed: 404,
      drum: { x: 7.45, z: 9.05, len: 2.45, yaw: -0.28, r: 0.42 },
      cap:  { x: 10.35, z: 7.35, len: 1.25, yaw: 0.78, r: 0.44 },
    },
  ];

  for (const bp of brokenSpecs) {
    const shaftStart = addClassicalPillarBaseAndLowerShaft(batches, bp.x, bp.z, tier1Top);
    const brokenShaft = buildFlutedColumnGeo(0.46, 0.41, bp.h, 12, 36, 5, {
      slantX: bp.slantX,
      slantZ: bp.slantZ,
      phase: bp.seed * 0.37,
      seed: bp.seed,
    });
    pushGeo(limestone, brokenShaft, bp.x, shaftStart, bp.z);

    // Lower carved ring if tall enough
    if (bp.h > 1.75) {
      pushCyl(carved, 0.47, 0.48, 0.11, 18, bp.x, shaftStart + 1.38, bp.z);
    }

    registerCollider('ruin_pillar', bp.x, bp.z, 0.82, baseY + shaftStart + bp.h + 0.3);

    // Fallen fluted column cylinder resting horizontally on Tier 1 floor
    const d = bp.drum;
    const drumGeo = buildFlutedColumnGeo(d.r, d.r * 0.96, d.len, 12, 28, 4, {
      slantX: 0.18,
      slantZ: -0.14,
      phase: bp.seed * 0.71,
      seed: bp.seed + 17,
    });
    drumGeo.translate(0, -d.len * 0.5, 0);
    drumGeo.rotateZ(Math.PI * 0.5);
    pushGeo(limestone, drumGeo, d.x, tier1Top + d.r * 0.86, d.z, 0.04, d.yaw, 0.05);

    // Ring collar on fallen cylinder
    pushCyl(
      carved,
      d.r * 1.07,
      d.r * 1.07,
      0.11,
      16,
      d.x + Math.cos(d.yaw) * 0.18,
      tier1Top + d.r * 0.86,
      d.z - Math.sin(d.yaw) * 0.18,
      0,
      d.yaw,
      Math.PI * 0.5
    );

    // Register two circle colliders along large fallen shaft so player/horse never clips through
    const ux = Math.cos(d.yaw);
    const uz = -Math.sin(d.yaw);
    registerCollider('ruin_pillar', d.x - ux * (d.len * 0.25), d.z - uz * (d.len * 0.25), 0.56, baseY + tier1Top + d.r * 2.1);
    registerCollider('ruin_pillar', d.x + ux * (d.len * 0.25), d.z + uz * (d.len * 0.25), 0.56, baseY + tier1Top + d.r * 2.1);

    // Secondary broken column piece / crushed capital nearby
    const c = bp.cap;
    const capDrum = buildFlutedColumnGeo(c.r, c.r * 0.94, c.len, 12, 24, 3, {
      slantX: -0.16,
      slantZ: 0.14,
      phase: bp.seed * 1.13,
      seed: bp.seed + 53,
    });
    capDrum.translate(0, -c.len * 0.5, 0);
    capDrum.rotateZ(Math.PI * 0.5);
    pushGeo(moss, capDrum, c.x, tier1Top + c.r * 0.82, c.z, -0.04, c.yaw, 0.03);
    registerCollider('ruin_pillar', c.x, c.z, 0.55, baseY + tier1Top + c.r * 2.0);
  }
}

function buildAltarAndSunObelisk(batches, walkableGeos, crystalRefs, registerCollider, baseY, materials) {
  const { limestone, carved, moss, dark, gold, cyanRune, goldRune } = batches;
  const tier2Top = 1.32;

  // --- Tier 3: Stepped Circular Sacred Altar Dais ---
  // Step 1 (walkable circular dais r = 3.45m, +0.22m)
  pushCyl(walkableGeos, 3.45, 3.55, 0.24, 16, 0, tier2Top + 0.11, 0);
  pushCyl(carved, 3.48, 3.52, 0.06, 16, 0, tier2Top + 0.21, 0);

  // Step 2 (walkable circular dais r = 2.55m, +0.22m)
  pushCyl(walkableGeos, 2.55, 2.65, 0.24, 16, 0, tier2Top + 0.33, 0);
  pushCyl(gold, 2.38, 2.42, 0.04, 16, 0, tier2Top + 0.45, 0);

  // Central Altar Pedestal (non-walkable center monument)
  const pedBaseY = tier2Top + 0.44; // 1.76
  pushCyl(moss, 1.56, 1.66, 0.32, 8, 0, pedBaseY + 0.16, 0, 0, Math.PI / 8, 0);
  pushBox(carved, 1.92, 0.54, 1.92, 0, pedBaseY + 0.59, 0);
  // Glowing cyan rune collar around altar waist
  pushBox(cyanRune, 1.98, 0.10, 1.98, 0, pedBaseY + 0.62, 0);
  // Flared altar table cornice
  pushBox(carved, 2.26, 0.22, 2.26, 0, pedBaseY + 0.97, 0);
  pushBox(gold, 2.02, 0.07, 2.02, 0, pedBaseY + 1.11, 0);

  // 4 carved corner scroll buttresses on altar pedestal
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.cos(ang) * 1.16;
    const bz = Math.sin(ang) * 1.16;
    pushBox(carved, 0.42, 0.68, 0.42, bx, pedBaseY + 0.54, bz, 0, -ang, 0);
  }

  // --- Central Sun Obelisk ---
  const obBaseY = pedBaseY + 1.14; // 2.90m
  const obH = 4.65;
  const rBot = 0.88;
  const rTop = 0.48;

  // Square footing beneath obelisk shaft
  pushBox(carved, 1.44, 0.22, 1.44, 0, obBaseY + 0.11, 0);

  const shaftStart = obBaseY + 0.22; // 3.12m
  // 4-sided tapered shaft rotated PI/4 so faces align cleanly to N/S/E/W
  pushCyl(limestone, rTop, rBot, obH, 4, 0, shaftStart + obH * 0.5, 0, 0, Math.PI / 4, 0);

  // Pyramidion apex (truncated at top with golden cradle prongs)
  const pyrStart = shaftStart + obH; // 7.77m
  const pyrH = 0.66;
  pushCyl(carved, 0.10, rTop * 1.04, pyrH, 4, 0, pyrStart + pyrH * 0.5, 0, 0, Math.PI / 4, 0);

  // Face geometry parameters for flush carved collars & glowing cyan/gold rune bands
  const halfWBot = rBot / Math.SQRT2;
  const halfWTop = rTop / Math.SQRT2;
  const faceTilt = Math.atan2(halfWBot - halfWTop, obH);

  // Horizontal bronze/stone collars around obelisk
  for (const t of [0.16, 0.50, 0.86]) {
    const cy = shaftStart + obH * t;
    const hw = halfWBot + (halfWTop - halfWBot) * t;
    pushBox(gold, hw * 2.08, 0.10, hw * 2.08, 0, cy, 0);
    pushBox(cyanRune, hw * 2.11, 0.04, hw * 2.11, 0, cy, 0);
  }

  // Carved glowing cyan & gold rune inscriptions on all 4 obelisk faces
  const faceDirs = [
    { rotY: 0 },
    { rotY: Math.PI * 0.5 },
    { rotY: Math.PI },
    { rotY: -Math.PI * 0.5 },
  ];
  const midT = 0.52;
  const midY = shaftStart + obH * midT;
  const midDist = halfWBot + (halfWTop - halfWBot) * midT + 0.018;

  for (const fd of faceDirs) {
    const sinY = Math.sin(fd.rotY);
    const cosY = Math.cos(fd.rotY);

    // Recessed stone panel framing runes
    pushGeo(
      dark,
      new THREE.BoxGeometry(0.46, 3.05, 0.03),
      sinY * (midDist - 0.01),
      midY,
      cosY * (midDist - 0.01),
      -faceTilt,
      fd.rotY,
      0
    );

    // Vertical glowing cyan rune spine
    pushGeo(
      cyanRune,
      new THREE.BoxGeometry(0.075, 2.75, 0.045),
      sinY * midDist,
      midY,
      cosY * midDist,
      -faceTilt,
      fd.rotY,
      0
    );

    // Horizontal cyan rune crossbars
    for (const yOff of [-0.95, -0.35, 0.35, 0.95]) {
      const distAt = midDist - yOff * Math.tan(faceTilt);
      pushGeo(
        cyanRune,
        new THREE.BoxGeometry(0.32 - yOff * 0.05, 0.06, 0.045),
        sinY * distAt,
        midY + yOff,
        cosY * distAt,
        -faceTilt,
        fd.rotY,
        0
      );
    }

    // Central glowing gold solar medallion inlay on each face
    const sunY = shaftStart + obH * 0.68;
    const sunDist = halfWBot + (halfWTop - halfWBot) * 0.68 + 0.025;
    pushGeo(
      goldRune,
      new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10),
      sinY * sunDist,
      sunY,
      cosY * sunDist,
      Math.PI * 0.5 - faceTilt,
      fd.rotY,
      0
    );
  }

  // 4-prong golden finial cradle at pyramidion tip
  const tipY = pyrStart + pyrH; // 8.43m
  const cradleTiltM = new THREE.Matrix4();
  const cradleYawM = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const prongGeo = new THREE.BoxGeometry(0.08, 0.36, 0.08);
    cradleTiltM.makeRotationZ(-0.28);
    cradleYawM.makeRotationY(-a);
    prongGeo.applyMatrix4(cradleTiltM);
    prongGeo.applyMatrix4(cradleYawM);
    pushGeo(gold, prongGeo, Math.cos(a) * 0.24, tipY + 0.06, Math.sin(a) * 0.24);
  }

  // Register central monument circle collider (radius 1.68 leaves outer dais step rings walkable!)
  registerCollider('ruin_pillar', 0, 0, 1.68, baseY + tipY + 1.4);

  // --- Animated Floating Solar Crystal at Obelisk Apex ---
  const crystalBaseY = tipY + 0.64; // ~9.07m
  const crystalPivot = new THREE.Group();
  crystalPivot.position.set(0, crystalBaseY, 0);

  const outerCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.56, 0), materials.crystalOuter);
  outerCrystal.scale.set(0.84, 1.52, 0.84);
  crystalPivot.add(outerCrystal);

  const innerCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), materials.crystalCore);
  innerCrystal.scale.set(0.84, 1.48, 0.84);
  crystalPivot.add(innerCrystal);

  const orbitalRingA = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.032, 6, 18), materials.goldRune);
  orbitalRingA.rotation.x = 0.55;
  crystalPivot.add(orbitalRingA);

  const orbitalRingB = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.024, 6, 18), materials.cyanRune);
  orbitalRingB.rotation.y = 0.75;
  orbitalRingB.rotation.x = -0.45;
  crystalPivot.add(orbitalRingB);

  const crystalHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: materials.glowTex,
      color: 0x7df9ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  crystalHalo.scale.set(2.8, 2.8, 1);
  crystalPivot.add(crystalHalo);

  crystalRefs.crystalPivot = crystalPivot;
  crystalRefs.crystalBaseY = crystalBaseY;
  crystalRefs.innerCrystal = innerCrystal;
  crystalRefs.orbitalRingA = orbitalRingA;
  crystalRefs.orbitalRingB = orbitalRingB;
  crystalRefs.crystalHalo = crystalHalo;
}

function buildStoneBrazier(batches, brazierAnims, bx, bz, baseY, index, materials) {
  const { carved, moss, dark, gold, ember } = batches;
  const tier2Top = 1.32;

  // Octagonal pedestal base
  pushCyl(moss, 0.64, 0.70, 0.20, 8, bx, tier2Top + 0.10, bz);
  pushCyl(carved, 0.44, 0.52, 0.14, 8, bx, tier2Top + 0.27, bz);

  // Carved legged stone shaft
  pushCyl(carved, 0.30, 0.34, 0.64, 8, bx, tier2Top + 0.66, bz);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    pushBox(
      carved,
      0.16,
      0.72,
      0.24,
      bx + Math.cos(a) * 0.36,
      tier2Top + 0.60,
      bz + Math.sin(a) * 0.36,
      0,
      -a + Math.PI * 0.5,
      0
    );
  }
  pushCyl(gold, 0.38, 0.38, 0.08, 10, bx, tier2Top + 0.96, bz);

  // Flared stone bowl & inner ash bed
  const bowlY = tier2Top + 1.18;
  pushCyl(carved, 0.72, 0.38, 0.36, 10, bx, bowlY, bz);
  pushCyl(carved, 0.76, 0.72, 0.10, 10, bx, bowlY + 0.20, bz);
  pushCyl(dark, 0.56, 0.34, 0.12, 10, bx, bowlY + 0.18, bz);

  // Glowing coal bed
  const coalGeo = new THREE.DodecahedronGeometry(0.42, 0);
  coalGeo.scale(1.0, 0.42, 1.0);
  pushGeo(ember, coalGeo, bx, bowlY + 0.24, bz, 0, index * 0.9, 0);

  // Animated fire group at bowl center
  const fireGroup = new THREE.Group();
  fireGroup.position.set(bx, bowlY + 0.26, bz);

  const tongues = [];
  const tongueSpecs = [
    { x: 0, z: 0, r: 0.24, h: 0.68, core: true },
    { x: 0.13, z: 0.06, r: 0.16, h: 0.50, core: false },
    { x: -0.12, z: 0.08, r: 0.15, h: 0.48, core: false },
    { x: 0.04, z: -0.14, r: 0.17, h: 0.54, core: false },
    { x: -0.07, z: -0.09, r: 0.14, h: 0.44, core: false },
  ];

  for (let i = 0; i < tongueSpecs.length; i++) {
    const sp = tongueSpecs[i];
    const coneGeo = new THREE.ConeGeometry(sp.r, sp.h, 5);
    coneGeo.translate(0, sp.h * 0.5, 0);
    const mesh = new THREE.Mesh(coneGeo, sp.core ? materials.flameCore : materials.flameOuter);
    mesh.position.set(sp.x, 0, sp.z);
    fireGroup.add(mesh);
    tongues.push({
      mesh,
      phase: index * 1.57 + i * 1.13,
      baseY: 0,
      isCore: sp.core,
    });
  }

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: materials.glowTex,
      color: 0xffaa44,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.position.set(0, 0.36, 0);
  halo.scale.set(1.9, 1.9, 1);
  fireGroup.add(halo);

  brazierAnims.push({ fireGroup, tongues, halo, phase: index * 1.57 });
}

function buildGuardianStatue(batches, gx, gz, yaw, mirrorSign, baseY) {
  const { carved, moss, dark, gold, cyanRune } = batches;
  const yawMat = new THREE.Matrix4().makeRotationY(yaw);
  const localMat = new THREE.Matrix4();
  const lEu = new THREE.Euler();
  const lQ = new THREE.Quaternion();
  const lPos = new THREE.Vector3();
  const lScale = new THREE.Vector3(1, 1, 1);

  const pushLocal = (list, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
    lEu.set(rx, ry, rz);
    lQ.setFromEuler(lEu);
    lPos.set(lx, ly, lz);
    localMat.compose(lPos, lQ, lScale);
    geo.applyMatrix4(localMat);
    geo.applyMatrix4(yawMat);
    geo.translate(gx, 0, gz);
    list.push(geo);
  };

  // Pedestal sitting cleanly on terrain/stair shoulder up to tier 1 height (0.66m) + plinth
  pushLocal(moss, new THREE.BoxGeometry(1.56, 1.25, 1.56), 0, 0.15, 0);
  pushLocal(carved, new THREE.BoxGeometry(1.36, 0.30, 1.36), 0, 0.92, 0);

  const standY = 1.07; // Feet level on guardian plinth

  // Heavy armored lower legs / sentinel robe base
  pushLocal(carved, new THREE.BoxGeometry(1.06, 0.78, 0.94), 0, standY + 0.39, -0.04);
  pushLocal(moss, new THREE.BoxGeometry(0.46, 0.84, 0.56), -0.30, standY + 0.42, 0.08);
  pushLocal(carved, new THREE.BoxGeometry(0.46, 0.84, 0.56), 0.30, standY + 0.42, 0.08);

  // Broad angular torso & stone breastplate
  pushLocal(carved, new THREE.CylinderGeometry(0.62, 0.48, 0.96, 6), 0, standY + 1.24, -0.04, 0, Math.PI / 6, 0);
  pushLocal(gold, new THREE.BoxGeometry(0.68, 0.14, 0.74), 0, standY + 0.82, 0);
  // Solar chest crest
  pushLocal(gold, new THREE.CylinderGeometry(0.20, 0.20, 0.08, 8), 0, standY + 1.34, 0.44, Math.PI * 0.5, 0, 0);
  pushLocal(cyanRune, new THREE.CylinderGeometry(0.09, 0.09, 0.10, 6), 0, standY + 1.34, 0.45, Math.PI * 0.5, 0, 0);

  // Broad sculpted shoulder pauldrons
  for (const s of [-1, 1]) {
    const pGeo = new THREE.DodecahedronGeometry(0.34, 0);
    pGeo.scale(1.15, 0.88, 1.05);
    pushLocal(s === mirrorSign ? moss : carved, pGeo, s * 0.68, standY + 1.56, -0.04, 0, s * 0.3, s * -0.25);

    // Forearms reaching forward to grip ceremonial greatsword
    pushLocal(carved, new THREE.BoxGeometry(0.28, 0.54, 0.30), s * 0.58, standY + 1.18, 0.12, -0.35, 0, s * 0.25);
    pushLocal(carved, new THREE.BoxGeometry(0.26, 0.26, 0.50), s * 0.32, standY + 0.98, 0.42, 0.15, -s * 0.48, 0);
  }

  // Ceremonial stone greatsword planted vertically in front of guardian
  pushLocal(dark, new THREE.BoxGeometry(0.20, 1.18, 0.08), 0, standY + 0.59, 0.62);
  pushLocal(gold, new THREE.BoxGeometry(0.56, 0.10, 0.16), 0, standY + 1.18, 0.62);
  pushLocal(carved, new THREE.BoxGeometry(0.11, 0.36, 0.11), 0, standY + 1.38, 0.62);

  // Chiseled low-poly helmet head with horned sun-crest
  const headY = standY + 1.98;
  pushLocal(carved, new THREE.BoxGeometry(0.54, 0.56, 0.56), 0, headY, 0.02, 0.08 * mirrorSign, 0, 0);
  // Angular visor brow & glowing cyan sentinel eyes
  pushLocal(carved, new THREE.BoxGeometry(0.58, 0.14, 0.20), 0, headY + 0.12, 0.24);
  pushLocal(cyanRune, new THREE.BoxGeometry(0.34, 0.06, 0.06), 0, headY + 0.04, 0.29);
  // Twin stone crest horns / solar crown wings
  for (const s of [-1, 1]) {
    pushLocal(gold, new THREE.ConeGeometry(0.11, 0.44, 4), s * 0.26, headY + 0.40, 0.02, -0.18, 0, s * -0.34);
  }
  // Stone mane / cape down the back
  pushLocal(moss, new THREE.BoxGeometry(0.74, 0.92, 0.26), 0, standY + 1.24, -0.44, 0.14, 0, 0);
}

function buildRubbleAndFoliage(batches, ctx, originX, originZ, cosY, sinY, baseY) {
  const { limestone, moss, fern } = batches;
  const rng = makeRng(8842);

  const localToTerrainDelta = (lx, lz) => {
    const wx = originX + lx * cosY + lz * sinY;
    const wz = originZ - lx * sinY + lz * cosY;
    return getTerrainY(ctx, wx, wz) - baseY;
  };

  // --- Interior corner rubble & moss cushions on Tier 1 & Tier 2 corners (well clear of stairs!) ---
  const cornerSpots = [
    // Tier 1 inner corners
    { x: -10.35, z: -10.35, y: 0.66, s: 1.0 },
    { x: 10.35,  z: -10.35, y: 0.66, s: 1.05 },
    { x: -10.45, z: 10.35,  y: 0.66, s: 1.25 },
    { x: 10.45,  z: 10.35,  y: 0.66, s: 1.20 },
    // Broken South facade scattered masonry chunks (outside [-2.5, +2.5] stair corridor!)
    { x: -6.10, z: 10.45, y: 0.66, s: 0.95 },
    { x: 6.25,  z: 10.40, y: 0.66, s: 1.0 },
    { x: -8.30, z: 7.45,  y: 0.66, s: 0.85 },
    { x: 8.20,  z: 7.50,  y: 0.66, s: 0.90 },
    // Tier 2 corners near braziers
    { x: -6.20, z: -6.20, y: 1.32, s: 0.80 },
    { x: 6.20,  z: -6.20, y: 1.32, s: 0.78 },
    { x: -6.25, z: 6.20,  y: 1.32, s: 0.85 },
    { x: 6.25,  z: 6.20,  y: 1.32, s: 0.82 },
  ];

  for (let i = 0; i < cornerSpots.length; i++) {
    const sp = cornerSpots[i];
    // Creeping moss pillow
    const mossGeo = new THREE.DodecahedronGeometry(0.46 * sp.s, 1);
    mossGeo.scale(1.35, 0.36, 1.2);
    pushGeo(fern, mossGeo, sp.x, sp.y + 0.06, sp.z, 0, rng() * Math.PI, 0);

    // 2-3 weathered stone rubble chunks
    const chunkCount = 2 + (i % 2);
    for (let c = 0; c < chunkCount; c++) {
      const ang = rng() * Math.PI * 2;
      const dist = 0.22 + rng() * 0.55;
      const rx = (0.24 + rng() * 0.24) * sp.s;
      const ry = (0.16 + rng() * 0.18) * sp.s;
      const rz = (0.22 + rng() * 0.24) * sp.s;
      pushRockChunk(
        c % 2 === 0 ? moss : limestone,
        sp.x + Math.cos(ang) * dist,
        sp.y + ry * 0.65,
        sp.z + Math.sin(ang) * dist,
        rx,
        ry,
        rz,
        rng() * Math.PI,
        i * 31 + c * 13
      );
    }

    // Lush fern rosette tucked at stone edge
    buildFernCluster(
      fern,
      sp.x + (rng() - 0.5) * 0.55,
      sp.y + 0.02,
      sp.z + (rng() - 0.5) * 0.55,
      0.85 * sp.s,
      i * 47 + 9
    );
  }

  // --- Outer Perimeter Boulders & Wild Fern Clusters adapted to terrain height ---
  const perimeterSpots = [
    [-12.3, -11.9], [-12.2, -5.2], [-12.2, 5.4], [-12.3, 12.1],
    [12.3, -11.9],  [12.2, -5.4],  [12.2, 5.2],  [12.3, 12.1],
    [-6.2, -12.3],  [6.2, -12.3],  [-6.8, 12.2], [6.8, 12.2],
  ];

  for (let i = 0; i < perimeterSpots.length; i++) {
    const [px, pz] = perimeterSpots[i];
    const gy = localToTerrainDelta(px, pz);

    pushRockChunk(
      i % 3 === 0 ? limestone : moss,
      px,
      gy + 0.26,
      pz,
      0.55 + rng() * 0.45,
      0.38 + rng() * 0.28,
      0.52 + rng() * 0.42,
      rng() * Math.PI,
      700 + i * 19
    );

    // Moss cushion + twin fern fronds hugging foundation wall
    const bushGeo = new THREE.DodecahedronGeometry(0.45, 1);
    bushGeo.scale(1.4, 0.48, 1.3);
    pushGeo(fern, bushGeo, px + (px > 0 ? -0.35 : 0.35), gy + 0.14, pz, 0, rng() * Math.PI, 0);

    buildFernCluster(
      fern,
      px + (rng() - 0.5) * 0.85,
      gy + 0.04,
      pz + (rng() - 0.5) * 0.85,
      1.05 + rng() * 0.35,
      900 + i * 23
    );
  }
}

// ============================================================================
// MAIN PUBLIC BUILDER
// ============================================================================

function createAncientSunRuins(ctx = {}) {
  const originX = ctx.x !== undefined ? ctx.x : 245;
  const originZ = ctx.z !== undefined ? ctx.z : -365;
  const rotY = ctx.rotationY !== undefined ? ctx.rotationY : 0.35;
  const baseY = ctx.y !== undefined ? ctx.y : getTerrainY(ctx, originX, originZ);

  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);

  function localToWorld(lx, lz) {
    return {
      wx: originX + lx * cosY + lz * sinY,
      wz: originZ - lx * sinY + lz * cosY,
    };
  }

  function registerCollider(kind, lx, lz, radius, maxY) {
    if (ctx && typeof ctx.addCircleCollider === 'function') {
      const { wx, wz } = localToWorld(lx, lz);
      ctx.addCircleCollider(kind, wx, wz, radius, maxY, group);
    }
  }

  // Sample perimeter terrain heights to make sure foundation skirt reaches down seamlessly
  let minLocalY = 0;
  for (const lx of [-12.5, 0, 12.5]) {
    for (const lz of [-12.5, 0, 12.5]) {
      const { wx, wz } = localToWorld(lx, lz);
      const dy = getTerrainY(ctx, wx, wz) - baseY;
      if (dy < minLocalY) minLocalY = dy;
    }
  }
  minLocalY = Math.max(-2.4, minLocalY);

  // Create procedural CanvasTextures (SRGBColorSpace)
  const limestoneTex = createLimestoneTexture(4101);
  const mossStoneTex = createMossStoneTexture(4202);
  const mosaicFloorTex = createMosaicFloorTexture(4303);
  const glowTex = (ctx && ctx.warmGlowTex) ? ctx.warmGlowTex : createWarmGlowTexture();

  // Cel-shaded stone/moss/foliage materials
  const limestoneMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xf6eedb,
    map: limestoneTex,
    roughness: 0.88,
    metalness: 0.03,
  }), { rimStrength: 0.18, shadowLift: 0.56 });

  const carvedStoneMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xfcf5e6,
    map: limestoneTex,
    roughness: 0.84,
    metalness: 0.04,
  }), { rimStrength: 0.20, shadowLift: 0.58 });

  const mossStoneMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xdfe3d2,
    map: mossStoneTex,
    roughness: 0.92,
    metalness: 0.02,
  }), { rimStrength: 0.16, shadowLift: 0.50 });

  const mosaicFloorMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xfbf4e4,
    map: mosaicFloorTex,
    roughness: 0.85,
    metalness: 0.04,
  }), { rimStrength: 0.12, shadowLift: 0.58 });

  const darkBasaltMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x575248,
    map: mossStoneTex,
    roughness: 0.94,
    metalness: 0.03,
  }), { rimStrength: 0.12, shadowLift: 0.46 });

  const goldTrimMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xdca83f,
    roughness: 0.42,
    metalness: 0.42,
  }), { rimStrength: 0.26, shadowLift: 0.62 });

  const fernMossMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x4b7d37,
    roughness: 0.86,
    side: THREE.DoubleSide,
  }), { rimStrength: 0.24, shadowLift: 0.58 });

  // Emissive rune & flame materials (MeshBasicMaterial)
  const cyanRuneMat = new THREE.MeshBasicMaterial({ color: 0x5eead4 });
  const goldRuneMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const crystalOuterMat = new THREE.MeshBasicMaterial({
    color: 0x7df9ff,
    transparent: true,
    opacity: 0.90,
  });
  const crystalCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff8d6 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6218 });
  const flameOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff8c24,
    transparent: true,
    opacity: 0.86,
  });
  const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe478 });

  const group = new THREE.Group();
  group.name = 'ancient_sun_ruins';
  group.position.set(originX, baseY, originZ);
  group.rotation.y = rotY;
  group.userData = {
    kind: 'sun_ruins',
    nameEn: 'Sunken Sun Ruins',
    nameId: 'Reruntuhan Kuil Kuno',
  };

  // Geometry batches
  const batches = {
    limestone: [],
    carved: [],
    moss: [],
    dark: [],
    gold: [],
    fern: [],
    cyanRune: [],
    goldRune: [],
    ember: [],
  };
  const walkableGeos = [];
  const crystalRefs = {};
  const brazierAnims = [];

  // 1. 3-tier platforms & 4 wide cardinal stairs
  buildPlatformsAndStairs(batches, walkableGeos, minLocalY);

  // 2. 12 Classical fluted pillars (8 intact with carved arch frieze on 3 sides + 4 broken w/ fallen drums)
  buildColonnadeAndBrokenPillars(batches, registerCollider, baseY);

  // 3. Central stepped altar dais, Sun Obelisk w/ glowing runes & floating crystal
  buildAltarAndSunObelisk(batches, walkableGeos, crystalRefs, registerCollider, baseY, {
    crystalOuter: crystalOuterMat,
    crystalCore: crystalCoreMat,
    cyanRune: cyanRuneMat,
    goldRune: goldRuneMat,
    glowTex,
  });

  // 4. 4 Stone Braziers at Middle Terrace corners (+-5.45, +-5.45)
  const brazierCoords = [
    [-5.45, -5.45],
    [5.45, -5.45],
    [-5.45, 5.45],
    [5.45, 5.45],
  ];
  for (let i = 0; i < brazierCoords.length; i++) {
    const [bx, bz] = brazierCoords[i];
    buildStoneBrazier(batches, brazierAnims, bx, bz, baseY, i, {
      flameOuter: flameOuterMat,
      flameCore: flameCoreMat,
      glowTex,
    });
    registerCollider('ruin_pillar', bx, bz, 0.74, baseY + 2.85);
  }

  // 5. 2 Low-poly sculpted Guardian Statues flanking the South main staircase
  buildGuardianStatue(batches, -3.85, 11.95, 0.24, -1, baseY);
  registerCollider('ruin_pillar', -3.85, 11.95, 0.90, baseY + 3.95);

  buildGuardianStatue(batches, 3.85, 11.95, -0.24, 1, baseY);
  registerCollider('ruin_pillar', 3.85, 11.95, 0.90, baseY + 3.95);

  // 6. Rubble chunks, creeping moss & ferns
  buildRubbleAndFoliage(batches, ctx, originX, originZ, cosY, sinY, baseY);

  // --- Finalize Merged Meshes ---
  // Walkable floor & stairs mesh (separate so addRockMeshCollider never picks up high lintels!)
  const walkableFloorMesh = new THREE.Mesh(mergeGeometries(walkableGeos), limestoneMat);
  walkableFloorMesh.name = 'sun_ruins_walkable_floor';
  setShadow(walkableFloorMesh, ctx, false, true);
  group.add(walkableFloorMesh);

  // Central 12.6m x 12.6m Sunburst Mosaic Floor
  const mosaicMesh = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.04, 12.6), mosaicFloorMat);
  mosaicMesh.position.set(0, 1.315, 0);
  mosaicMesh.name = 'sun_ruins_mosaic_floor';
  setShadow(mosaicMesh, ctx, false, true);
  group.add(mosaicMesh);

  const staticMeshSpecs = [
    { key: 'limestone', mat: limestoneMat, cast: true, receive: true, name: 'sun_ruins_limestone' },
    { key: 'carved',    mat: carvedStoneMat, cast: true, receive: true, name: 'sun_ruins_carved' },
    { key: 'moss',      mat: mossStoneMat, cast: true, receive: true, name: 'sun_ruins_moss_stone' },
    { key: 'dark',      mat: darkBasaltMat, cast: false, receive: true, name: 'sun_ruins_dark_recess' },
    { key: 'gold',      mat: goldTrimMat, cast: true, receive: true, name: 'sun_ruins_gold_trim' },
    { key: 'fern',      mat: fernMossMat, cast: false, receive: true, name: 'sun_ruins_ferns_moss' },
    { key: 'cyanRune',  mat: cyanRuneMat, cast: false, receive: false, name: 'sun_ruins_cyan_runes' },
    { key: 'goldRune',  mat: goldRuneMat, cast: false, receive: false, name: 'sun_ruins_gold_runes' },
    { key: 'ember',     mat: emberMat, cast: false, receive: false, name: 'sun_ruins_embers' },
  ];

  for (const spec of staticMeshSpecs) {
    const geos = batches[spec.key];
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos), spec.mat);
    mesh.name = spec.name;
    setShadow(mesh, ctx, spec.cast, spec.receive);
    group.add(mesh);
  }

  // Attach animated crystal & braziers
  if (crystalRefs.crystalPivot) {
    group.add(crystalRefs.crystalPivot);
  }
  for (const b of brazierAnims) {
    group.add(b.fireGroup);
  }

  // Register walkable stair/floor meshes with rock-surface sampler if supported by world
  group.updateMatrixWorld(true);
  if (ctx && typeof ctx.addRockMeshCollider === 'function') {
    ctx.addRockMeshCollider('ruin_floor', walkableFloorMesh);
    ctx.addRockMeshCollider('ruin_floor', mosaicMesh);
  }

  // Animation loop helper
  function update(elapsed) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;

    // Rotate & levitate obelisk peak crystal + orbital rune rings
    if (crystalRefs.crystalPivot) {
      crystalRefs.crystalPivot.position.y = crystalRefs.crystalBaseY + Math.sin(t * 1.65) * 0.16;
      crystalRefs.crystalPivot.rotation.y = t * 0.65;
      crystalRefs.innerCrystal.rotation.y = -t * 1.15;
      crystalRefs.innerCrystal.rotation.x = Math.sin(t * 0.95) * 0.18;
      crystalRefs.orbitalRingA.rotation.z = t * 0.95;
      crystalRefs.orbitalRingA.rotation.x = 0.55 + Math.sin(t * 0.72) * 0.16;
      crystalRefs.orbitalRingB.rotation.z = -t * 0.75;
      crystalRefs.orbitalRingB.rotation.y = t * 0.48;
      const haloScale = 2.65 + Math.sin(t * 2.4) * 0.24;
      crystalRefs.crystalHalo.scale.set(haloScale, haloScale, 1);
    }

    // Subtle breathing glow on cyan obelisk runes
    const runePulse = 0.88 + 0.12 * Math.sin(t * 2.2);
    cyanRuneMat.color.setRGB(0.37 * runePulse, 0.92 * runePulse, 0.83 * runePulse);

    // Pulse & flicker all 4 brazier flames
    for (let i = 0; i < brazierAnims.length; i++) {
      const b = brazierAnims[i];
      for (let j = 0; j < b.tongues.length; j++) {
        const tg = b.tongues[j];
        const sY = (tg.isCore ? 0.90 : 0.84) + 0.28 * Math.sin(t * 6.8 + tg.phase);
        const sXZ = 0.92 + 0.14 * Math.cos(t * 5.3 + tg.phase);
        tg.mesh.scale.set(sXZ, sY, sXZ);
        tg.mesh.rotation.x = Math.sin(t * 4.4 + tg.phase) * 0.14;
        tg.mesh.rotation.z = Math.cos(t * 4.9 + tg.phase) * 0.14;
        tg.mesh.rotation.y = t * (tg.isCore ? -1.4 : 1.1) + tg.phase;
      }
      const hScale = 1.75 + Math.sin(t * 5.6 + b.phase) * 0.22;
      b.halo.scale.set(hScale, hScale, 1);
      b.halo.material.opacity = 0.58 + Math.sin(t * 7.2 + b.phase) * 0.12;
    }
  }

  group.userData.animated = {
    crystal: crystalRefs,
    braziers: brazierAnims,
    update,
  };

  return { group, update };
}

export { createAncientSunRuins };
