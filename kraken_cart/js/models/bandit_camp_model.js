import { HC } from '../hc.js';

const THREE = HC.THREE;

// ============================================================================
// DETERMINISTIC RNG & GEOMETRY MERGE HELPERS
// ============================================================================

function makeRng(seed = 7711) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cel(ctx, mat, opts = { rimStrength: 0.16, shadowLift: 0.54 }) {
  if (ctx && typeof ctx.applyStylizedCelShading === 'function') {
    ctx.applyStylizedCelShading(mat, opts);
  }
  return mat;
}

function setShadow(mesh, isMobile, cast = true, receive = true) {
  mesh.castShadow = cast && !isMobile;
  mesh.receiveShadow = receive;
  return mesh;
}

function transformAndPush(list, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  list.push(g);
  return g;
}

function mergeGeometries(rawGeos) {
  const prepared = [];
  let totalVerts = 0;

  for (let i = 0; i < rawGeos.length; i++) {
    const src = rawGeos[i];
    if (!src) continue;
    const g = src.index ? src.toNonIndexed() : src;
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) {
      if (g !== src) g.dispose();
      continue;
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    prepared.push(g);
    totalVerts += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  if (totalVerts === 0) return merged;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

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
    offset += count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

function makeTransformedMesh(geo, mat, parent, isMobile, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  setShadow(m, isMobile, cast, receive);
  if (parent) parent.add(m);
  return m;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURES (THREE.SRGBColorSpace)
// ============================================================================

function makeCanvasTex(w, h, drawFn, repeatX = 1, repeatY = 1, wrapClamp = false) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  drawFn(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = wrapClamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = wrapClamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function createPalisadeWoodTex(seed = 101) {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#4c3220';
    g.fillRect(0, 0, w, h);

    // Coarse rough-bark vertical ridges
    const strips = 18;
    const sw = w / strips;
    for (let i = 0; i < strips; i++) {
      const x = i * sw;
      const pick = rng();
      g.fillStyle = pick < 0.35 ? '#3a2416' : (pick < 0.72 ? '#593b26' : '#66452d');
      g.fillRect(x, 0, sw + 0.6, h);

      // Bark cleft shadow
      g.fillStyle = 'rgba(20, 11, 6, 0.45)';
      g.fillRect(x, 0, 1.6, h);
    }

    // Gnarled fibrous grooves & fissures
    for (let i = 0; i < 65; i++) {
      const gx = rng() * w;
      const gy = rng() * h;
      const len = 18 + rng() * 44;
      g.strokeStyle = rng() > 0.35 ? 'rgba(24, 14, 8, 0.50)' : 'rgba(132, 95, 62, 0.28)';
      g.lineWidth = 1.0 + rng() * 1.6;
      g.beginPath();
      g.moveTo(gx, gy);
      g.bezierCurveTo(
        gx + (rng() - 0.5) * 5,
        gy + len * 0.35,
        gx + (rng() - 0.5) * 5,
        gy + len * 0.7,
        gx + (rng() - 0.5) * 3,
        gy + len
      );
      g.stroke();
    }

    // Knots and earthy moss/soot mottling near base
    for (let k = 0; k < 6; k++) {
      const kx = 8 + rng() * (w - 16);
      const ky = 12 + rng() * (h - 24);
      g.fillStyle = 'rgba(26, 15, 8, 0.52)';
      g.beginPath();
      g.ellipse(kx, ky, 3.2, 6.4, (rng() - 0.5) * 0.25, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(116, 82, 54, 0.34)';
      g.lineWidth = 1.1;
      g.stroke();
    }

    // Weathered muddy bottom tint
    const grad = g.createLinearGradient(0, h * 0.72, 0, h);
    grad.addColorStop(0, 'rgba(32, 22, 14, 0.0)');
    grad.addColorStop(1, 'rgba(28, 22, 16, 0.48)');
    g.fillStyle = grad;
    g.fillRect(0, h * 0.72, w, h * 0.28);
  }, 1.0, 1.0);
}

function createCrimsonTentTex(seed = 202, brightVariant = false) {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = brightVariant ? '#a62024' : '#7f181c';
    g.fillRect(0, 0, w, h);

    // Patchwork stitched canvas blocks
    const patches = [
      { x: 0, y: 0, pw: 64, ph: 62, c: brightVariant ? '#b8282b' : '#8d1e22' },
      { x: 64, y: 0, pw: 64, ph: 62, c: brightVariant ? '#961a1d' : '#6c1317' },
      { x: 0, y: 62, pw: 52, ph: 66, c: brightVariant ? '#8d191d' : '#651215' },
      { x: 52, y: 62, pw: 76, ph: 66, c: brightVariant ? '#ad2428' : '#841b1f' },
    ];
    for (const p of patches) {
      g.fillStyle = p.c;
      g.fillRect(p.x + 1, p.y + 1, p.pw - 2, p.ph - 2);
    }

    // Painterly fabric creases & sun-bleached folds
    for (let i = 0; i < 42; i++) {
      const fx = rng() * w;
      const fy = rng() * h;
      g.strokeStyle = rng() > 0.5 ? 'rgba(235, 118, 98, 0.16)' : 'rgba(38, 6, 8, 0.22)';
      g.lineWidth = 1.2 + rng() * 1.8;
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + (rng() - 0.5) * 28, fy + 16 + rng() * 24);
      g.stroke();
    }

    // Coarse linen weave
    g.globalAlpha = 0.09;
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = y % 6 === 0 ? '#ffd0c4' : '#2a080a';
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 4) {
      g.fillStyle = '#360b0d';
      g.fillRect(x, 0, 1, h);
    }
    g.globalAlpha = 1.0;

    // Cross-stitching along patchwork seams
    const drawStitchLine = (x1, y1, x2, y2) => {
      const steps = Math.floor(Math.hypot(x2 - x1, y2 - y1) / 6);
      g.strokeStyle = '#d6b68a';
      g.lineWidth = 1.3;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const sx = x1 + (x2 - x1) * t;
        const sy = y1 + (y2 - y1) * t;
        g.beginPath();
        g.moveTo(sx - 2.2, sy - 2.2);
        g.lineTo(sx + 2.2, sy + 2.2);
        g.stroke();
      }
    };
    drawStitchLine(64, 0, 64, 62);
    drawStitchLine(52, 62, 52, 128);
    drawStitchLine(0, 62, 128, 62);

    // Aged dirt & soot along lower edge hem
    const hemGrad = g.createLinearGradient(0, h * 0.74, 0, h);
    hemGrad.addColorStop(0, 'rgba(34, 18, 12, 0.0)');
    hemGrad.addColorStop(1, 'rgba(34, 18, 12, 0.55)');
    g.fillStyle = hemGrad;
    g.fillRect(0, h * 0.74, w, h * 0.26);

    // Subtle worn dark trim stripe near hem
    g.fillStyle = 'rgba(42, 10, 12, 0.45)';
    g.fillRect(0, h - 10, w, 4);
  }, 1.2, 1.0);
}

function createLeatherTentTex(seed = 303) {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#73482b';
    g.fillRect(0, 0, w, h);

    // Stitched hide patches
    const hides = [
      { x: 2, y: 2, pw: 60, ph: 58, c: '#815233' },
      { x: 64, y: 2, pw: 62, ph: 66, c: '#653d22' },
      { x: 2, y: 62, pw: 62, ph: 64, c: '#5c361e' },
      { x: 66, y: 70, pw: 60, ph: 56, c: '#7a4d2f' },
    ];
    for (const p of hides) {
      g.fillStyle = p.c;
      g.fillRect(p.x, p.y, p.pw, p.ph);
    }

    // Worn tanned blotches & leather creases
    for (let i = 0; i < 65; i++) {
      g.fillStyle = rng() > 0.48 ? 'rgba(164, 114, 72, 0.16)' : 'rgba(42, 24, 12, 0.18)';
      g.beginPath();
      g.ellipse(rng() * w, rng() * h, 4 + rng() * 11, 3 + rng() * 8, rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }

    // Rawhide thong lacing along seams
    g.strokeStyle = '#c8a678';
    g.lineWidth = 1.4;
    for (let y = 4; y < h; y += 7) {
      g.beginPath();
      g.moveTo(60, y);
      g.lineTo(67, y + 3.5);
      g.stroke();
    }
    for (let x = 4; x < w; x += 7) {
      g.beginPath();
      g.moveTo(x, 60);
      g.lineTo(x + 3.5, 67);
      g.stroke();
    }

    // Weathered muddy bottom fringe
    const hemGrad = g.createLinearGradient(0, h * 0.75, 0, h);
    hemGrad.addColorStop(0, 'rgba(32, 20, 12, 0.0)');
    hemGrad.addColorStop(1, 'rgba(28, 18, 10, 0.52)');
    g.fillStyle = hemGrad;
    g.fillRect(0, h * 0.75, w, h * 0.25);
  }, 1.1, 1.0);
}

function createPlankTex(seed = 404, dark = false) {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    const cols = dark
      ? ['#573923', '#4b311e', '#614129', '#452c1a']
      : ['#835634', '#744b2c', '#8e603b', '#6d4528'];

    const planks = 4;
    const pw = w / planks;
    for (let p = 0; p < planks; p++) {
      const px = p * pw;
      g.fillStyle = cols[p % cols.length];
      g.fillRect(px, 0, pw, h);

      // Grain streaks
      for (let i = 0; i < 14; i++) {
        const gx = px + 2 + rng() * (pw - 4);
        g.strokeStyle = rng() > 0.45 ? 'rgba(34, 18, 8, 0.28)' : 'rgba(185, 138, 92, 0.20)';
        g.lineWidth = 0.9 + rng() * 1.1;
        g.beginPath();
        g.moveTo(gx, 0);
        const wob = (rng() - 0.5) * 4;
        g.bezierCurveTo(gx + wob, h * 0.35, gx - wob, h * 0.7, gx, h);
        g.stroke();
      }

      // Seam groove & nail heads
      g.fillStyle = 'rgba(20, 11, 5, 0.62)';
      g.fillRect(px, 0, 2.0, h);
      g.fillStyle = 'rgba(190, 145, 98, 0.16)';
      g.fillRect(px + 2.2, 0, 1.1, h);

      for (const ny of [16, h - 18]) {
        g.fillStyle = '#25262a';
        g.beginPath();
        g.arc(px + 6, ny + (rng() - 0.5) * 3, 1.6, 0, Math.PI * 2);
        g.arc(px + pw - 5, ny + (rng() - 0.5) * 3, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 1.0, 1.0);
}

function createDarkShingleTex(seed = 505) {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#261e1c';
    g.fillRect(0, 0, w, h);

    const rows = 6;
    const cols = 6;
    const rh = h / rows;
    const cw = w / cols;
    const tones = ['#3d312d', '#493a34', '#332926', '#543f35', '#42362e'];

    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const off = (r % 2) * cw * 0.5;
      for (let c = -1; c <= cols + 1; c++) {
        const x = c * cw + off;
        const tw = cw - 2;
        const th = rh - 1.5;
        g.fillStyle = tones[Math.floor(rng() * tones.length)];
        g.beginPath();
        g.moveTo(x + 1, y);
        g.lineTo(x + 1 + tw, y);
        g.lineTo(x + 1 + tw, y + th * 0.78);
        g.lineTo(x + 1 + tw * 0.5, y + th + 1.5);
        g.lineTo(x + 1, y + th * 0.78);
        g.closePath();
        g.fill();

        g.fillStyle = 'rgba(210, 185, 160, 0.12)';
        g.fillRect(x + 2, y + 1.5, tw - 3, 2);
        g.strokeStyle = 'rgba(14, 10, 8, 0.45)';
        g.lineWidth = 1.2;
        g.stroke();
      }
    }
  }, 2.2, 2.0);
}

function createCrimsonBannerTex() {
  return makeCanvasTex(128, 256, (g, w, h) => {
    // Rich maroon cloth body
    g.fillStyle = '#8b171b';
    g.fillRect(0, 0, w, h);

    // Subtle central brighter crimson band
    g.fillStyle = '#a82226';
    g.fillRect(14, 10, w - 28, h - 34);

    // Tattered gold border trim
    g.strokeStyle = '#d9a441';
    g.lineWidth = 5;
    g.strokeRect(10, 8, w - 20, h - 32);

    // Crimson Fang Emblem: bold bone-white crescent fangs & crossed blade
    g.save();
    g.translate(w * 0.5, h * 0.44);

    // Dark shield medallion behind emblem
    g.fillStyle = '#3c0b0e';
    g.beginPath();
    g.arc(0, 0, 34, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e0ae4b';
    g.lineWidth = 3;
    g.stroke();

    // Crossed stylized daggers
    g.strokeStyle = '#d8dee4';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-22, 20);
    g.lineTo(22, -22);
    g.moveTo(22, 20);
    g.lineTo(-22, -22);
    g.stroke();

    // Twin jagged crimson/ivory fangs
    g.fillStyle = '#f3ead8';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 18, -14);
      g.lineTo(s * 5, -14);
      g.lineTo(s * 10, 22);
      g.closePath();
      g.fill();
    }
    g.restore();

    // Lower hem weathered soot
    const hem = g.createLinearGradient(0, h * 0.75, 0, h);
    hem.addColorStop(0, 'rgba(20, 8, 8, 0.0)');
    hem.addColorStop(1, 'rgba(20, 8, 8, 0.5)');
    g.fillStyle = hem;
    g.fillRect(0, h * 0.75, w, h * 0.25);
  }, 1, 1, true);
}

function createStrategyMapTex() {
  return makeCanvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#dfcca1';
    g.fillRect(0, 0, w, h);

    // Aged parchment edges
    const edge = g.createRadialGradient(w * 0.5, h * 0.5, 22, w * 0.5, h * 0.5, 76);
    edge.addColorStop(0, 'rgba(223, 204, 161, 0.0)');
    edge.addColorStop(1, 'rgba(130, 92, 48, 0.45)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);

    // Inked border
    g.strokeStyle = '#5a3d24';
    g.lineWidth = 3;
    g.strokeRect(7, 7, w - 14, h - 14);

    // River winding blue ink curve
    g.strokeStyle = '#4e7c94';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(14, 112);
    g.bezierCurveTo(42, 74, 86, 68, 112, 18);
    g.stroke();

    // Dirt road dotted line
    g.strokeStyle = '#7b5532';
    g.lineWidth = 2.5;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(18, 32);
    g.quadraticCurveTo(62, 54, 108, 96);
    g.stroke();
    g.setLineDash([]);

    // Raid target red X marks & arrows
    g.strokeStyle = '#b42222';
    g.lineWidth = 3;
    for (const [tx, ty] of [[42, 42], [88, 78]]) {
      g.beginPath();
      g.moveTo(tx - 6, ty - 6);
      g.lineTo(tx + 6, ty + 6);
      g.moveTo(tx + 6, ty - 6);
      g.lineTo(tx - 6, ty + 6);
      g.stroke();
    }

    // Compass rose in corner
    g.strokeStyle = '#442b16';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(24, 98, 8, 0, Math.PI * 2);
    g.moveTo(24, 87);
    g.lineTo(24, 109);
    g.moveTo(13, 98);
    g.lineTo(35, 98);
    g.stroke();
  }, 1, 1, true);
}

function createArcheryTargetTex() {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rings = [
      { r: 62, c: '#c8a656' }, // outer straw rim
      { r: 53, c: '#f2e8cf' }, // cream outer ring
      { r: 41, c: '#a61f24' }, // red ring
      { r: 29, c: '#f2e8cf' }, // cream inner ring
      { r: 17, c: '#b81d22' }, // bullseye red
      { r: 6,  c: '#e6b83c' }, // gold center
    ];
    g.fillStyle = '#b79144';
    g.fillRect(0, 0, w, h);

    for (const rg of rings) {
      g.fillStyle = rg.c;
      g.beginPath();
      g.arc(cx, cy, rg.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(40, 26, 14, 0.35)';
      g.lineWidth = 1.4;
      g.stroke();
    }

    // Woven straw texture hairlines
    const rng = makeRng(606);
    g.strokeStyle = 'rgba(110, 78, 28, 0.22)';
    g.lineWidth = 1;
    for (let i = 0; i < 48; i++) {
      const a = rng() * Math.PI * 2;
      const r0 = 10 + rng() * 44;
      g.beginPath();
      g.arc(cx, cy, r0, a, a + 0.35);
      g.stroke();
    }
  }, 1, 1, true);
}

function createCampDirtTex(seed = 707) {
  return makeCanvasTex(128, 128, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#6b4c32';
    g.fillRect(0, 0, w, h);

    for (let i = 0; i < 95; i++) {
      const tone = rng();
      g.fillStyle = tone < 0.35
        ? 'rgba(72, 48, 28, 0.32)'
        : (tone < 0.7 ? 'rgba(128, 92, 58, 0.24)' : 'rgba(54, 46, 40, 0.26)');
      g.beginPath();
      g.ellipse(rng() * w, rng() * h, 4 + rng() * 14, 3 + rng() * 10, rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rng() > 0.5 ? '#483424' : '#96704c';
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
  }, 2.4, 2.4);
}

function createWarmGlowTex() {
  return makeCanvasTex(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.5, h * 0.5, 2, w * 0.5, h * 0.5, 31);
    grad.addColorStop(0.0, 'rgba(255, 250, 210, 1.0)');
    grad.addColorStop(0.32, 'rgba(255, 190, 88, 0.72)');
    grad.addColorStop(0.68, 'rgba(255, 118, 32, 0.24)');
    grad.addColorStop(1.0, 'rgba(255, 96, 24, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, 1, 1, true);
}

function createSmokePuffTex() {
  return makeCanvasTex(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, 30);
    grad.addColorStop(0.0, 'rgba(218, 212, 206, 0.85)');
    grad.addColorStop(0.45, 'rgba(182, 174, 168, 0.45)');
    grad.addColorStop(1.0, 'rgba(140, 134, 130, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, 1, 1, true);
}

// ============================================================================
// MAIN BUILDER: CRIMSON FANG BANDIT SETTLEMENT (~36m diameter)
// ============================================================================

function createBanditSettlement(ctx = {}) {
  const x = Number.isFinite(ctx.x) ? ctx.x : -420;
  const z = Number.isFinite(ctx.z) ? ctx.z : 125;
  const rotationY = Number.isFinite(ctx.rotationY) ? ctx.rotationY : 0.25;
  const isMobile = !!(ctx && ctx.isMobileDevice);
  const rng = makeRng(91337);

  const getTerrainY = (wx, wz) => (
    ctx && typeof ctx.getTerrainHeight === 'function' ? ctx.getTerrainHeight(wx, wz) : 0
  );
  const baseY = getTerrainY(x, z);

  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const toWorldXZ = (lx, lz) => [
    x + lx * cosY + lz * sinY,
    z - lx * sinY + lz * cosY,
  ];
  const localGroundY = (lx, lz) => {
    const [wx, wz] = toWorldXZ(lx, lz);
    return getTerrainY(wx, wz) - baseY;
  };
  const addCollider = (kind, lx, lz, radius, localTopY) => {
    if (!ctx || typeof ctx.addCircleCollider !== 'function') return;
    const [wx, wz] = toWorldXZ(lx, lz);
    const gy = getTerrainY(wx, wz);
    ctx.addCircleCollider(kind, wx, wz, radius, gy + localTopY, group);
  };

  const group = new THREE.Group();
  group.name = 'crimson_fang_settlement';
  group.position.set(x, baseY, z);
  group.rotation.y = rotationY;

  // --------------------------------------------------------------------------
  // 1. PROCEDURAL TEXTURES & CEL-SHADED MATERIALS
  // --------------------------------------------------------------------------
  const palisadeWoodTex = createPalisadeWoodTex(101);
  const crimsonTentTex = createCrimsonTentTex(202, false);
  const brightCrimsonTex = createCrimsonTentTex(219, true);
  const leatherTentTex = createLeatherTentTex(303);
  const plankTex = createPlankTex(404, false);
  const darkPlankTex = createPlankTex(419, true);
  const darkShingleTex = createDarkShingleTex(505);
  const bannerTex = createCrimsonBannerTex();
  const mapTex = createStrategyMapTex();
  const targetTex = createArcheryTargetTex();
  const campDirtTex = createCampDirtTex(707);
  const warmGlowTex = createWarmGlowTex();
  const smokePuffTex = createSmokePuffTex();

  const palisadeWoodMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: palisadeWoodTex,
    color: 0xffffff,
    roughness: 0.92,
  }), { rimStrength: 0.14, shadowLift: 0.48 });

  const hewnTipMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xa87d52,
    roughness: 0.88,
  }), { rimStrength: 0.14, shadowLift: 0.54 });

  const plankMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: plankTex,
    color: 0xffffff,
    roughness: 0.86,
  }), { rimStrength: 0.15, shadowLift: 0.52 });

  const darkWoodMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: darkPlankTex,
    color: 0xffffff,
    roughness: 0.90,
  }), { rimStrength: 0.14, shadowLift: 0.48 });

  const crimsonTentMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: crimsonTentTex,
    color: 0xffffff,
    roughness: 0.86,
    side: THREE.DoubleSide,
  }), { rimStrength: 0.16, shadowLift: 0.54 });

  const brightCrimsonMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: brightCrimsonTex,
    color: 0xffffff,
    roughness: 0.84,
    side: THREE.DoubleSide,
  }), { rimStrength: 0.18, shadowLift: 0.58 });

  const leatherTentMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: leatherTentTex,
    color: 0xffffff,
    roughness: 0.88,
    side: THREE.DoubleSide,
  }), { rimStrength: 0.15, shadowLift: 0.52 });

  const shingleMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: darkShingleTex,
    color: 0xffffff,
    roughness: 0.90,
  }), { rimStrength: 0.16, shadowLift: 0.48 });

  const bannerMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: bannerTex,
    color: 0xffffff,
    roughness: 0.82,
    side: THREE.DoubleSide,
  }), { rimStrength: 0.18, shadowLift: 0.58 });

  const ropeMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc2a16b,
    roughness: 0.92,
  }), { rimStrength: 0.12, shadowLift: 0.52 });

  const ironMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.58,
    metalness: 0.35,
  }), { rimStrength: 0.22, shadowLift: 0.50 });

  const steelBladeMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xb4c2d0,
    roughness: 0.42,
    metalness: 0.55,
  }), { rimStrength: 0.26, shadowLift: 0.58 });

  const goldMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xf4c442,
    roughness: 0.36,
    metalness: 0.55,
  }), { rimStrength: 0.28, shadowLift: 0.62 });

  const stoneMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0x6f6960,
    roughness: 0.94,
  }), { rimStrength: 0.14, shadowLift: 0.50 });

  const dirtMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: campDirtTex,
    color: 0xffffff,
    roughness: 0.96,
  }), { rimStrength: 0.10, shadowLift: 0.52 });

  const strawMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc8a452,
    roughness: 0.92,
  }), { rimStrength: 0.14, shadowLift: 0.56 });

  const targetFaceMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: targetTex,
    color: 0xffffff,
    roughness: 0.85,
  }), { rimStrength: 0.14, shadowLift: 0.58 });

  const mapMat = cel(ctx, new THREE.MeshStandardMaterial({
    map: mapTex,
    color: 0xffffff,
    roughness: 0.85,
    side: THREE.DoubleSide,
  }), { rimStrength: 0.12, shadowLift: 0.60 });

  const featherRedMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc62828,
    roughness: 0.80,
  }), { rimStrength: 0.16, shadowLift: 0.58 });

  const boneMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xe8ddc6,
    roughness: 0.82,
  }), { rimStrength: 0.16, shadowLift: 0.58 });

  const stewMat = cel(ctx, new THREE.MeshStandardMaterial({
    color: 0xc85224,
    roughness: 0.45,
  }), { rimStrength: 0.18, shadowLift: 0.60 });

  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a0a });
  const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff7b1a });
  const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xffe46b });

  // Merge buckets for static batched draw calls
  const palisadeWoodGeos = [];
  const hewnTipGeos = [];
  const plankGeos = [];
  const darkWoodGeos = [];
  const ropeGeos = [];
  const ironGeos = [];
  const steelGeos = [];
  const stoneGeos = [];
  const dirtGeos = [];
  const strawGeos = [];

  const animatedFlames = [];
  const animatedGlows = [];
  const animatedSmokes = [];
  const animatedBanners = [];
  let cauldronPivot = null;
  let stewBubbleGroup = null;

  // Helper to attach flickering flame + warm glow + optional smoke puffs
  function addFireEffect(parent, fx, fy, fz, scale = 1.0, withSmoke = true) {
    const fireGroup = new THREE.Group();
    fireGroup.position.set(fx, fy, fz);
    parent.add(fireGroup);

    const outerConeGeo = new THREE.ConeGeometry(0.24 * scale, 0.68 * scale, 5);
    const innerConeGeo = new THREE.ConeGeometry(0.14 * scale, 0.46 * scale, 5);
    const tongueCount = scale > 0.7 ? 4 : 2;
    for (let i = 0; i < tongueCount; i++) {
      const ang = (i / tongueCount) * Math.PI * 2;
      const rad = tongueCount > 2 ? 0.11 * scale : 0.03 * scale;
      const fOuter = new THREE.Mesh(outerConeGeo, flameOuterMat);
      fOuter.position.set(Math.cos(ang) * rad, 0.28 * scale, Math.sin(ang) * rad);
      fOuter.rotation.y = ang;
      fireGroup.add(fOuter);

      const fInner = new THREE.Mesh(innerConeGeo, flameInnerMat);
      fInner.position.set(Math.cos(ang) * rad * 0.6, 0.22 * scale, Math.sin(ang) * rad * 0.6);
      fireGroup.add(fInner);

      animatedFlames.push({
        mesh: fOuter,
        baseX: fOuter.position.x,
        baseY: fOuter.position.y,
        baseZ: fOuter.position.z,
        phase: i * 1.7 + fx * 0.5 + fz * 0.3,
        speed: 7.5 + i * 1.4,
      });
      animatedFlames.push({
        mesh: fInner,
        baseX: fInner.position.x,
        baseY: fInner.position.y,
        baseZ: fInner.position.z,
        phase: i * 2.3 + 1.1,
        speed: 9.2 + i * 1.1,
      });
    }

    if (warmGlowTex) {
      const glowMat = new THREE.SpriteMaterial({
        map: warmGlowTex,
        color: 0xffb347,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.position.set(0, 0.34 * scale, 0);
      const gs = 1.95 * scale;
      glow.scale.set(gs, gs, 1);
      fireGroup.add(glow);
      animatedGlows.push({
        sprite: glow,
        baseScale: gs,
        phase: fx * 0.4 + fz * 0.7,
      });
    }

    if (withSmoke && smokePuffTex) {
      const puffCount = scale > 0.7 ? 5 : 2;
      for (let i = 0; i < puffCount; i++) {
        const sMat = new THREE.SpriteMaterial({
          map: smokePuffTex,
          color: 0xd4ccc4,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
        const sp = new THREE.Sprite(sMat);
        const bs = (0.42 + (i % 2) * 0.14) * scale;
        sp.scale.set(bs, bs, 1);
        fireGroup.add(sp);
        animatedSmokes.push({
          sprite: sp,
          baseX: (rng() - 0.5) * 0.16 * scale,
          baseY: 0.65 * scale,
          baseZ: (rng() - 0.5) * 0.16 * scale,
          baseScale: bs,
          maxRise: (scale > 0.7 ? 3.2 : 1.55),
          phase: i / puffCount + rng() * 0.12,
          speed: scale > 0.7 ? 0.24 : 0.34,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. BEATEN EARTH CENTRAL HEARTH PAD & PATH ACCENTS
  // --------------------------------------------------------------------------
  {
    const hearthPad = new THREE.CylinderGeometry(3.4, 3.85, 0.08, 18);
    transformAndPush(dirtGeos, hearthPad, 0, localGroundY(0, 0) + 0.01, 0);
    hearthPad.dispose();

    // Subtle stepping/trampled earthen mounds inside the +X gate entrance
    for (let i = 0; i < 4; i++) {
      const px = 4.5 + i * 3.1;
      const pz = (rng() - 0.5) * 1.4;
      const pad = new THREE.CylinderGeometry(1.35, 1.75, 0.06, 10);
      transformAndPush(dirtGeos, pad, px, localGroundY(px, pz) + 0.005, pz);
      pad.dispose();
    }
  }

  // --------------------------------------------------------------------------
  // 3. SPIKED LOG PALISADE PERIMETER (R ~ 16.5m, OPEN ~7m GATE AT +X)
  // --------------------------------------------------------------------------
  {
    const PALISADE_R = 16.5;
    const GATE_HALF_ANG = 0.245; // 2 * 16.5 * sin(0.245) ~= 8.0m center-to-center -> ~7.1m clear gate!
    const POST_COUNT = 52;

    const unitLogGeo = new THREE.CylinderGeometry(0.26, 0.31, 1.0, 7);
    const unitTipGeo = new THREE.ConeGeometry(0.26, 1.0, 7);
    const unitRailGeo = new THREE.BoxGeometry(1.0, 0.14, 0.12);
    const unitRopeRingGeo = new THREE.TorusGeometry(0.29, 0.038, 5, 8);
    const unitMoundGeo = new THREE.CylinderGeometry(0.36, 0.56, 0.24, 7);
    const unitBraceGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.0, 6);

    const postCoords = [];
    for (let i = 0; i < POST_COUNT; i++) {
      const t = i / (POST_COUNT - 1);
      const ang = GATE_HALF_ANG + t * (Math.PI * 2 - GATE_HALF_ANG * 2);
      const rad = PALISADE_R + (rng() - 0.5) * 0.26;
      const px = Math.cos(ang) * rad;
      const pz = Math.sin(ang) * rad;
      const gy = localGroundY(px, pz);

      const postH = 2.8 + rng() * 1.2; // 2.8m to 4.0m
      const tipH = 0.62 + rng() * 0.28;
      const shaftH = postH - tipH;
      const thick = 0.88 + rng() * 0.26;
      const leanX = (rng() - 0.5) * 0.07;
      const leanZ = (rng() - 0.5) * 0.07;
      const yaw = rng() * Math.PI * 2;

      // Vertical log shaft
      transformAndPush(
        palisadeWoodGeos,
        unitLogGeo,
        px, gy + shaftH * 0.5 - 0.08, pz,
        leanX, yaw, leanZ,
        thick, shaftH, thick
      );

      // Sharpened pale hewn point
      transformAndPush(
        hewnTipGeos,
        unitTipGeo,
        px - Math.sin(leanZ) * (shaftH * 0.5),
        gy + shaftH + tipH * 0.45 - 0.08,
        pz + Math.sin(leanX) * (shaftH * 0.5),
        leanX, yaw, leanZ,
        thick * 0.96, tipH, thick * 0.96
      );

      // Soil berm around base
      transformAndPush(dirtGeos, unitMoundGeo, px, gy + 0.08, pz, 0, yaw, 0, thick, 1, thick);

      // Rope lashings at upper and lower horizontal rail heights
      for (const ryOff of [0.95, 2.05]) {
        transformAndPush(
          ropeGeos,
          unitRopeRingGeo,
          px, gy + ryOff, pz,
          Math.PI * 0.5 + leanX, 0, leanZ,
          thick, thick, 1.0
        );
      }

      // Interior diagonal brace strut every 4th post
      if (i % 4 === 2) {
        const inward = ang + Math.PI;
        const bx = px + Math.cos(inward) * 0.72;
        const bz = pz + Math.sin(inward) * 0.72;
        const bgy = localGroundY(bx, bz);
        transformAndPush(
          darkWoodGeos,
          unitBraceGeo,
          bx, bgy + 0.88, bz,
          0, -ang, 0.58,
          1.0, 2.05, 1.0
        );
      }

      postCoords.push({ px, pz, gy, postH });

      // Register world circle collider for every palisade post so wall is impenetrable
      addCollider('bandit_wall', px, pz, 0.96, postH + 0.2);
    }

    // Horizontal cross-rails connecting adjacent palisade logs
    for (let i = 0; i < postCoords.length - 1; i++) {
      const a = postCoords[i];
      const b = postCoords[i + 1];
      const dx = b.px - a.px;
      const dz = b.pz - a.pz;
      const segLen = Math.hypot(dx, dz) + 0.14;
      const mx = (a.px + b.px) * 0.5;
      const mz = (a.pz + b.pz) * 0.5;
      const mgy = (a.gy + b.gy) * 0.5;
      const segYaw = -Math.atan2(dz, dx);

      for (const railY of [0.95, 2.05]) {
        transformAndPush(
          darkWoodGeos,
          unitRailGeo,
          mx, mgy + railY, mz,
          0, segYaw, 0,
          segLen, 1.0, 1.0
        );
      }
    }

    unitLogGeo.dispose();
    unitTipGeo.dispose();
    unitRailGeo.dispose();
    unitRopeRingGeo.dispose();
    unitMoundGeo.dispose();
    unitBraceGeo.dispose();
  }

  // --------------------------------------------------------------------------
  // 4. WIDE OPEN GATE (+X SIDE) WITH 2 TALL POSTS, 2 TORCHES & 2 WAVING BANNERS
  // --------------------------------------------------------------------------
  {
    const gateX = 16.05;
    const gateZAbs = 3.72; // Clear inner span ~6.9m

    const gatePostGeo = new THREE.CylinderGeometry(0.24, 0.34, 5.65, 8);
    const gateCapGeo = new THREE.ConeGeometry(0.28, 0.65, 8);
    const armGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.45, 6);
    const torchStickGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.85, 6);
    const torchCupGeo = new THREE.CylinderGeometry(0.14, 0.08, 0.24, 7);
    const sconceGeo = new THREE.BoxGeometry(0.36, 0.06, 0.06);
    const ironBandGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.12, 8);
    const gateDoorPlankGeo = new THREE.BoxGeometry(0.12, 2.55, 2.45);
    const gateDoorBraceGeo = new THREE.BoxGeometry(0.18, 0.16, 2.5);
    const gateDoorDiagGeo = new THREE.BoxGeometry(0.16, 0.14, 2.85);
    const hornGeo = new THREE.ConeGeometry(0.07, 0.42, 5);

    for (const side of [-1, 1]) {
      const gz = side * gateZAbs;
      const gy = localGroundY(gateX, gz);

      // Tall heavy gate pillar
      transformAndPush(palisadeWoodGeos, gatePostGeo, gateX, gy + 2.75, gz);
      transformAndPush(hewnTipGeos, gateCapGeo, gateX, gy + 5.88, gz);

      // Decorative iron rings & rope wraps
      for (const iy of [1.4, 3.2, 4.7]) {
        transformAndPush(ironGeos, ironBandGeo, gateX, gy + iy, gz);
      }

      // Base stone cairn reinforcing gate pillar
      for (let s = 0; s < 5; s++) {
        const sa = (s / 5) * Math.PI * 2;
        const stoneG = new THREE.DodecahedronGeometry(0.28, 0);
        transformAndPush(
          stoneGeos,
          stoneG,
          gateX + Math.cos(sa) * 0.34,
          gy + 0.18,
          gz + Math.sin(sa) * 0.34,
          s * 0.4, sa, 0.2
        );
        stoneG.dispose();
      }

      // Mounted trophy horns/spikes jutting forward from top of gate post
      transformAndPush(hewnTipGeos, hornGeo, gateX + 0.25, gy + 4.95, gz + side * 0.12, 0.4 * side, 0, -0.75);

      // Horizontal banner cross-arm pointing outward along Z
      const armZ = gz + side * 0.68;
      transformAndPush(darkWoodGeos, armGeo, gateX, gy + 4.82, armZ, Math.PI * 0.5, 0, 0);

      // Swung-wide-open heavy wooden gate wing (flared outward along +X so 7m opening stays clear)
      const wingYaw = side * 1.08;
      const wingDirX = 0.88;
      const wingDirZ = side * 0.47;
      const wingCenterX = gateX + 0.12 + wingDirX * 1.24;
      const wingCenterZ = gz + wingDirZ * 1.24;
      const wingMat = new THREE.Matrix4();
      const wingQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, wingYaw, 0));
      const diagQuat = wingQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.68 * side, 0, 0)));
      const pushWingPart = (bucket, geo, yOff, qUse) => {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        wingMat.compose(new THREE.Vector3(wingCenterX, gy + yOff, wingCenterZ), qUse, new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(wingMat);
        bucket.push(g);
      };
      pushWingPart(plankGeos, gateDoorPlankGeo, 1.32, wingQuat);
      pushWingPart(ironGeos, gateDoorBraceGeo, 0.72, wingQuat);
      pushWingPart(ironGeos, gateDoorBraceGeo, 1.92, wingQuat);
      pushWingPart(darkWoodGeos, gateDoorDiagGeo, 1.32, diagQuat);

      // Gate torch sconce facing slightly inward/forward (+X)
      const tx = gateX + 0.34;
      const ty = gy + 3.05;
      const tz = gz - side * 0.22;
      transformAndPush(ironGeos, sconceGeo, gateX + 0.18, ty - 0.22, tz, 0, side * 0.4, 0);
      transformAndPush(darkWoodGeos, torchStickGeo, tx, ty, tz, 0, 0, -0.25);
      transformAndPush(ironGeos, torchCupGeo, tx + 0.1, ty + 0.38, tz, 0, 0, -0.25);
      addFireEffect(group, tx + 0.12, ty + 0.46, tz, 0.62, false);

      // Waving Crimson Fang maroon banner (subdivided plane for vertex wave in update)
      const bw = 1.05;
      const bh = 2.15;
      const bGeo = new THREE.PlaneGeometry(bw, bh, 6, 8);
      // Taper bottom into swallowtail silhouette
      const posAttr = bGeo.getAttribute('position');
      for (let vi = 0; vi < posAttr.count; vi++) {
        const vx = posAttr.getX(vi);
        const vy = posAttr.getY(vi);
        const vNorm = (vy + bh * 0.5) / bh; // 0 bottom, 1 top
        if (vNorm < 0.18) {
          const centerDip = 1.0 - Math.abs(vx) / (bw * 0.5);
          posAttr.setY(vi, vy + centerDip * 0.32 * (1.0 - vNorm / 0.18));
        }
      }
      bGeo.computeVertexNormals();
      const restPos = new Float32Array(posAttr.array);

      const bannerPivot = new THREE.Group();
      bannerPivot.position.set(gateX + 0.04, gy + 4.78, gz + side * 0.80);
      bannerPivot.rotation.y = Math.PI * 0.5; // face outward along +X
      const bannerMesh = new THREE.Mesh(bGeo, bannerMat);
      bannerMesh.position.set(0, -bh * 0.5, 0);
      setShadow(bannerMesh, isMobile, true, true);
      bannerPivot.add(bannerMesh);
      group.add(bannerPivot);

      animatedBanners.push({
        pivot: bannerPivot,
        mesh: bannerMesh,
        geo: bGeo,
        restPos,
        height: bh,
        phase: side > 0 ? 0.4 : 2.1,
      });

      addCollider('bandit_gate_post', gateX, gz, 0.58, 5.8);
    }

    gatePostGeo.dispose();
    gateCapGeo.dispose();
    armGeo.dispose();
    torchStickGeo.dispose();
    torchCupGeo.dispose();
    sconceGeo.dispose();
    ironBandGeo.dispose();
    gateDoorPlankGeo.dispose();
    gateDoorBraceGeo.dispose();
    gateDoorDiagGeo.dispose();
    hornGeo.dispose();
  }

  // --------------------------------------------------------------------------
  // 5. COMMANDER'S PAVILION (TENDA KOMANDAN UTAMA MARUN BESAR)
  //    Open canopy + crossed timber poles + strategy map table + gold chest
  // --------------------------------------------------------------------------
  {
    const cx = -6.6;
    const cz = -6.2;
    const cy = localGroundY(cx, cz);
    const yaw = 0.80;

    const pav = new THREE.Group();
    pav.position.set(cx, cy, cz);
    pav.rotation.y = yaw;
    group.add(pav);

    const W = 5.4;
    const D = 4.6;
    const wallH = 2.05;
    const lowerRoofPeak = 3.55;
    const upperCapY = 4.42;

    // Ground wooden/dirt terrace plinth + woven crimson camp rug inside
    const plinthMesh = makeTransformedMesh(new THREE.BoxGeometry(W + 0.6, 0.14, D + 0.8), darkWoodMat, pav, isMobile, false, true);
    plinthMesh.position.set(0, 0.05, 0.2);

    const rugMesh = makeTransformedMesh(new THREE.BoxGeometry(3.4, 0.04, 2.7), crimsonTentMat, pav, isMobile, false, true);
    rugMesh.position.set(0, 0.13, 0.1);

    // 4 Corner heavy timber posts + 2 Crossed Entrance Poles (+Z is open front canopy)
    const cornerPostGeo = new THREE.CylinderGeometry(0.11, 0.14, wallH + 0.3, 6);
    for (const [px, pz] of [[-W * 0.48, -D * 0.48], [W * 0.48, -D * 0.48], [-W * 0.48, D * 0.48], [W * 0.48, D * 0.48]]) {
      const p = makeTransformedMesh(cornerPostGeo, darkWoodMat, pav, isMobile);
      p.position.set(px, (wallH + 0.3) * 0.5, pz);
    }

    // Crossed timber poles flanking open front canopy (+Z side)
    const crossPoleGeo = new THREE.CylinderGeometry(0.085, 0.105, 3.05, 6);
    for (const sx of [-1, 1]) {
      const basePos = sx * 2.15;
      const pA = makeTransformedMesh(crossPoleGeo, darkWoodMat, pav, isMobile);
      pA.position.set(basePos, 1.38, D * 0.52);
      pA.rotation.z = 0.24 * sx;
      pA.rotation.x = 0.12;

      const pB = makeTransformedMesh(crossPoleGeo, darkWoodMat, pav, isMobile);
      pB.position.set(basePos - 0.34 * sx, 1.38, D * 0.52);
      pB.rotation.z = -0.24 * sx;
      pB.rotation.x = 0.12;

      // Rope lashing at pole intersection
      const knot = makeTransformedMesh(new THREE.TorusGeometry(0.13, 0.04, 5, 8), ropeMat, pav, isMobile, false, true);
      knot.position.set(basePos - 0.17 * sx, 2.15, D * 0.52 + 0.06);
      knot.rotation.y = Math.PI * 0.5;
    }

    // Back & Side Canvas Walls (open at front +Z canopy)
    const backWall = makeTransformedMesh(new THREE.BoxGeometry(W * 0.96, wallH, 0.08), crimsonTentMat, pav, isMobile);
    backWall.position.set(0, wallH * 0.5 + 0.12, -D * 0.48);

    for (const sx of [-1, 1]) {
      const sideWall = makeTransformedMesh(new THREE.BoxGeometry(0.08, wallH, D * 0.96), crimsonTentMat, pav, isMobile);
      sideWall.position.set(sx * W * 0.48, wallH * 0.5 + 0.12, 0);

      // Rolled tied-back front canopy curtains
      const curtain = makeTransformedMesh(new THREE.CylinderGeometry(0.20, 0.23, wallH * 0.92, 7), brightCrimsonMat, pav, isMobile);
      curtain.position.set(sx * (W * 0.36), wallH * 0.5 + 0.12, D * 0.48);
    }

    // 2-TIER VIBRANT MAROON ROOF (high visibility from top-down map!)
    // Tier 1: Wide flaring pitched lower skirt (4-sided pyramidal hip roof)
    const lowerRoofGeo = new THREE.ConeGeometry(4.35, 1.85, 4);
    lowerRoofGeo.rotateY(Math.PI * 0.25);
    lowerRoofGeo.scale(1.12, 1.0, 0.95);
    const lowerRoof = makeTransformedMesh(lowerRoofGeo, brightCrimsonMat, pav, isMobile);
    lowerRoof.position.set(0, wallH + 0.72, 0);

    // Tier 2: Raised wooden clerestory lantern collar + upper bright maroon cap
    const clerestory = makeTransformedMesh(new THREE.BoxGeometry(2.35, 0.55, 1.95), darkWoodMat, pav, isMobile);
    clerestory.position.set(0, lowerRoofPeak - 0.1, 0);

    const upperRoofGeo = new THREE.ConeGeometry(2.15, 1.15, 4);
    upperRoofGeo.rotateY(Math.PI * 0.25);
    upperRoofGeo.scale(1.14, 1.0, 0.96);
    const upperRoof = makeTransformedMesh(upperRoofGeo, brightCrimsonMat, pav, isMobile);
    upperRoof.position.set(0, upperCapY - 0.45, 0);

    // Extended forward open awning canopy (+Z)
    const awningGeo = new THREE.BoxGeometry(4.2, 0.08, 1.55);
    const awning = makeTransformedMesh(awningGeo, brightCrimsonMat, pav, isMobile);
    awning.position.set(0, 2.38, D * 0.5 + 0.45);
    awning.rotation.x = 0.26;

    // Gold/wooden finial spire & Crimson Fang pennant atop pavilion
    const finialPole = makeTransformedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.92, 6), darkWoodMat, pav, isMobile);
    finialPole.position.set(0, upperCapY + 0.30, 0);
    const finialOrb = makeTransformedMesh(new THREE.OctahedronGeometry(0.16, 0), goldMat, pav, isMobile);
    finialOrb.position.set(0, upperCapY + 0.72, 0);
    const roofPennantGeo = new THREE.ConeGeometry(0.22, 0.72, 3);
    roofPennantGeo.rotateZ(-Math.PI * 0.5);
    roofPennantGeo.scale(1.0, 1.0, 0.18);
    const roofPennant = makeTransformedMesh(roofPennantGeo, brightCrimsonMat, pav, isMobile);
    roofPennant.position.set(0.36, upperCapY + 0.52, 0);

    // Staked guy-ropes anchoring pavilion corners
    const stakeGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.42, 5);
    const upVec = new THREE.Vector3(0, 1, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const rx0 = sx * W * 0.52;
      const rz0 = sz * D * 0.52;
      const rx1 = sx * (W * 0.52 + 1.05);
      const rz1 = sz * (D * 0.52 + 1.05);
      const st = makeTransformedMesh(stakeGeo, darkWoodMat, pav, isMobile, false, true);
      st.position.set(rx1, 0.16, rz1);
      st.rotation.z = -0.35 * sx;
      st.rotation.x = 0.35 * sz;

      const rLen = Math.hypot(rx1 - rx0, rz1 - rz0, 1.93);
      const rope = makeTransformedMesh(new THREE.CylinderGeometry(0.018, 0.018, rLen, 4), ropeMat, pav, isMobile, false, false);
      rope.position.set((rx0 + rx1) * 0.5, 1.18, (rz0 + rz1) * 0.5);
      const dir = new THREE.Vector3(rx1 - rx0, 0.22 - 2.15, rz1 - rz0).normalize();
      rope.quaternion.setFromUnitVectors(upVec, dir);
    }

    // --- INTERIOR: Strategy Map Table, Commander Chair & Open Treasure Chest with Gold Bars ---
    // 1) Wooden Strategy Table (centered slightly forward)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(-0.35, 0.14, 0.35);
    pav.add(tableGroup);

    const tableTop = makeTransformedMesh(new THREE.BoxGeometry(1.85, 0.10, 1.08), plankMat, tableGroup, isMobile);
    tableTop.position.set(0, 0.78, 0);
    for (const [lx, lz] of [[-0.78, -0.42], [0.78, -0.42], [-0.78, 0.42], [0.78, 0.42]]) {
      const leg = makeTransformedMesh(new THREE.BoxGeometry(0.11, 0.78, 0.11), darkWoodMat, tableGroup, isMobile);
      leg.position.set(lx, 0.39, lz);
    }
    const tableStretcher = makeTransformedMesh(new THREE.BoxGeometry(1.55, 0.08, 0.10), darkWoodMat, tableGroup, isMobile);
    tableStretcher.position.set(0, 0.25, 0);

    // Parchment Raid Map unrolled on tabletop + curled scroll ends + red tokens + dagger
    const mapSheet = makeTransformedMesh(new THREE.PlaneGeometry(1.38, 0.84), mapMat, tableGroup, isMobile, false, true);
    mapSheet.rotation.x = -Math.PI * 0.5;
    mapSheet.position.set(0, 0.838, 0);

    for (const sx of [-0.70, 0.70]) {
      const roll = makeTransformedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.86, 7), boneMat, tableGroup, isMobile);
      roll.rotation.x = Math.PI * 0.5;
      roll.position.set(sx, 0.855, 0);
    }
    for (const [tx, tz, mat] of [[-0.22, -0.14, brightCrimsonMat], [0.18, 0.12, brightCrimsonMat], [0.28, -0.18, goldMat]]) {
      const tok = makeTransformedMesh(new THREE.ConeGeometry(0.055, 0.14, 5), mat, tableGroup, isMobile, false, true);
      tok.position.set(tx, 0.90, tz);
    }
    const mapDagger = makeTransformedMesh(new THREE.BoxGeometry(0.05, 0.03, 0.34), steelBladeMat, tableGroup, isMobile, false, true);
    mapDagger.position.set(-0.42, 0.85, 0.22);
    mapDagger.rotation.y = 0.55;

    // 2) Commander's Wooden Chair behind table
    const chairGroup = new THREE.Group();
    chairGroup.position.set(-0.35, 0.14, -0.58);
    chairGroup.rotation.y = 0.12;
    pav.add(chairGroup);
    const seat = makeTransformedMesh(new THREE.BoxGeometry(0.62, 0.08, 0.58), leatherTentMat, chairGroup, isMobile);
    seat.position.set(0, 0.46, 0);
    const chairBack = makeTransformedMesh(new THREE.BoxGeometry(0.62, 0.68, 0.08), darkWoodMat, chairGroup, isMobile);
    chairBack.position.set(0, 0.82, -0.25);
    for (const [clx, clz] of [[-0.25, -0.23], [0.25, -0.23], [-0.25, 0.23], [0.25, 0.23]]) {
      const cleg = makeTransformedMesh(new THREE.BoxGeometry(0.07, 0.46, 0.07), darkWoodMat, chairGroup, isMobile);
      cleg.position.set(clx, 0.23, clz);
    }

    // 3) Open Treasure Chest brimming with Gold Bars beside table
    const chestGroup = new THREE.Group();
    chestGroup.position.set(1.38, 0.14, 0.08);
    chestGroup.rotation.y = -0.42;
    pav.add(chestGroup);

    const chestBox = makeTransformedMesh(new THREE.BoxGeometry(1.02, 0.52, 0.64), darkWoodMat, chestGroup, isMobile);
    chestBox.position.set(0, 0.26, 0);
    for (const sx of [-0.36, 0.36]) {
      const strap = makeTransformedMesh(new THREE.BoxGeometry(0.07, 0.54, 0.68), ironMat, chestGroup, isMobile);
      strap.position.set(sx, 0.26, 0);
    }
    // Propped-open hinged arched lid
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.52, -0.32);
    lidPivot.rotation.x = -1.78;
    chestGroup.add(lidPivot);
    const lidBase = makeTransformedMesh(new THREE.BoxGeometry(1.04, 0.12, 0.64), darkWoodMat, lidPivot, isMobile);
    lidBase.position.set(0, 0.06, 0.32);
    const lidArch = makeTransformedMesh(new THREE.CylinderGeometry(0.30, 0.30, 1.02, 7, 1, false, 0, Math.PI), darkWoodMat, lidPivot, isMobile);
    lidArch.rotation.z = Math.PI * 0.5;
    lidArch.position.set(0, 0.10, 0.32);
    for (const sx of [-0.36, 0.36]) {
      const lStrap = makeTransformedMesh(new THREE.CylinderGeometry(0.315, 0.315, 0.07, 7, 1, false, 0, Math.PI), ironMat, lidPivot, isMobile);
      lStrap.rotation.z = Math.PI * 0.5;
      lStrap.position.set(sx, 0.10, 0.32);
    }

    // Stacked Gold Ingots inside open chest!
    const ingotGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.24, 4);
    ingotGeo.rotateZ(Math.PI * 0.5);
    ingotGeo.rotateX(Math.PI * 0.25);
    for (let layer = 0; layer < 2; layer++) {
      for (let ix = -2; ix <= 2; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          if (layer === 1 && Math.abs(ix) === 2) continue;
          const bar = makeTransformedMesh(ingotGeo, goldMat, chestGroup, isMobile, false, true);
          bar.position.set(ix * 0.16, 0.50 + layer * 0.085, iz * 0.13);
          bar.rotation.y = (ix + iz) * 0.12;
        }
      }
    }
    ingotGeo.dispose();

    // Small glowing lantern on pavilion table corner
    const pavLantern = makeTransformedMesh(new THREE.CylinderGeometry(0.08, 0.09, 0.20, 6), flameInnerMat, tableGroup, isMobile, false, false);
    pavLantern.position.set(0.68, 0.93, -0.28);
    const pavLanternCap = makeTransformedMesh(new THREE.ConeGeometry(0.12, 0.10, 6), ironMat, tableGroup, isMobile, false, false);
    pavLanternCap.position.set(0.68, 1.06, -0.28);

    addCollider('bandit_tent', cx, cz, 3.15, 4.5);
  }

  // --------------------------------------------------------------------------
  // 6. 2-TIER WOODEN BANDIT WATCHTOWER (~8.5m TALL) AT BACK CORNER
  // --------------------------------------------------------------------------
  {
    const tx = -10.3;
    const tz = 1.8;
    const ty = localGroundY(tx, tz);
    const towerYaw = 0.17;

    const tower = new THREE.Group();
    tower.position.set(tx, ty, tz);
    tower.rotation.y = towerYaw;
    group.add(tower);

    const baseHalf = 1.55;
    const topHalf = 1.38;
    const deck1Y = 2.85;
    const deck2Y = 5.25;
    const roofBaseY = 6.75;
    const roofPeakY = 8.48;

    // 4 Corner Support Posts (battered slightly inward from base to deck2)
    const legPts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p0 = new THREE.Vector3(sx * baseHalf, -0.1, sz * baseHalf);
      const p1 = new THREE.Vector3(sx * topHalf, deck2Y + 1.58, sz * topHalf);
      legPts.push({ sx, sz, p0, p1 });

      const vec = new THREE.Vector3().subVectors(p1, p0);
      const len = vec.length();
      const post = makeTransformedMesh(new THREE.CylinderGeometry(0.12, 0.18, len, 7), palisadeWoodMat, tower, isMobile);
      post.position.copy(p0).addScaledVector(vec, 0.5);
      post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());

      // Stone foundation pad under each leg
      const pad = makeTransformedMesh(new THREE.CylinderGeometry(0.32, 0.40, 0.28, 7), stoneMat, tower, isMobile, false, true);
      pad.position.set(p0.x, 0.12, p0.z);
    }

    // Helper for X-braces between two vertical corner profiles
    const addXBrace = (aBot, aTop, bBot, bTop, thick = 0.075) => {
      for (const [pStart, pEnd] of [[aBot, bTop], [bBot, aTop]]) {
        const vec = new THREE.Vector3().subVectors(pEnd, pStart);
        const len = vec.length();
        const beam = makeTransformedMesh(new THREE.BoxGeometry(thick, len, thick), darkWoodMat, tower, isMobile);
        beam.position.copy(pStart).addScaledVector(vec, 0.5);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
      }
    };

    const lerpLeg = (leg, hVal) => {
      const t = THREE.MathUtils.clamp((hVal - leg.p0.y) / (leg.p1.y - leg.p0.y), 0, 1);
      return new THREE.Vector3().lerpVectors(leg.p0, leg.p1, t);
    };

    // 4 Sides X-Bracing across Lower Bay (0.3 -> deck1Y) and Upper Bay (deck1Y -> deck2Y)
    const sidePairs = [[0, 1], [2, 3], [0, 2], [1, 3]]; // N, S, W, E faces
    for (let sIdx = 0; sIdx < sidePairs.length; sIdx++) {
      const [ia, ib] = sidePairs[sIdx];
      const la = legPts[ia];
      const lb = legPts[ib];
      // Lower bay (leave east +X face clear near ground for ladder entrance, brace above or keep high)
      if (sIdx !== 3) {
        addXBrace(lerpLeg(la, 0.35), lerpLeg(la, deck1Y - 0.15), lerpLeg(lb, 0.35), lerpLeg(lb, deck1Y - 0.15), 0.085);
      }
      // Upper bay
      addXBrace(lerpLeg(la, deck1Y + 0.15), lerpLeg(la, deck2Y - 0.12), lerpLeg(lb, deck1Y + 0.15), lerpLeg(lb, deck2Y - 0.12), 0.08);
    }

    // Tier 1 Mid-Landing Deck
    const midDeck = makeTransformedMesh(new THREE.BoxGeometry(3.05, 0.20, 3.05), plankMat, tower, isMobile);
    midDeck.position.set(0, deck1Y, 0);

    // Tier 2 Main Lookout Deck (y = 5.25m)
    const topDeck = makeTransformedMesh(new THREE.BoxGeometry(3.22, 0.24, 3.22), plankMat, tower, isMobile);
    topDeck.position.set(0, deck2Y, 0);

    // Fenced Parapet Railings around Tier 2 Deck
    const railH = 0.92;
    const railPostGeo = new THREE.BoxGeometry(0.11, railH, 0.11);
    const railSpanGeo = new THREE.BoxGeometry(2.96, 0.10, 0.09);
    for (const sz of [-1.42, 1.42]) {
      const topR = makeTransformedMesh(railSpanGeo, darkWoodMat, tower, isMobile);
      topR.position.set(0, deck2Y + railH, sz);
      const midR = makeTransformedMesh(railSpanGeo, darkWoodMat, tower, isMobile);
      midR.position.set(0, deck2Y + railH * 0.52, sz);
      const mp = makeTransformedMesh(railPostGeo, darkWoodMat, tower, isMobile);
      mp.position.set(0, deck2Y + railH * 0.5, sz);
    }
    for (const sx of [-1.42, 1.42]) {
      const lenZ = sx > 0 ? 1.85 : 2.96; // leave gap on +X side for ladder climb-through
      const zOff = sx > 0 ? -0.52 : 0;
      const sideR = makeTransformedMesh(new THREE.BoxGeometry(0.09, 0.10, lenZ), darkWoodMat, tower, isMobile);
      sideR.position.set(sx, deck2Y + railH, zOff);
      const sideR2 = makeTransformedMesh(new THREE.BoxGeometry(0.09, 0.10, lenZ), darkWoodMat, tower, isMobile);
      sideR2.position.set(sx, deck2Y + railH * 0.52, zOff);
      const mp = makeTransformedMesh(railPostGeo, darkWoodMat, tower, isMobile);
      mp.position.set(sx, deck2Y + railH * 0.5, 0.35);
    }

    // Crimson cloth guard skirt draped along front (+X) parapet
    const parapetCloth = makeTransformedMesh(new THREE.BoxGeometry(0.06, 0.72, 1.75), crimsonTentMat, tower, isMobile);
    parapetCloth.position.set(1.48, deck2Y + 0.48, -0.45);

    // Slanted Wooden Ladders (Ground -> Deck 1, and Deck 1 -> Deck 2)
    const buildLadder = (x0, y0, z0, x1, y1, z1, width = 0.68) => {
      const v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
      const len = v.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
      const ladderG = new THREE.Group();
      ladderG.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
      ladderG.quaternion.copy(q);
      tower.add(ladderG);

      const railG = new THREE.BoxGeometry(0.08, len, 0.10);
      for (const sz of [-width * 0.5, width * 0.5]) {
        const s = makeTransformedMesh(railG, darkWoodMat, ladderG, isMobile);
        s.position.set(0, 0, sz);
      }
      const rungCount = Math.max(4, Math.floor(len / 0.38));
      const rungG = new THREE.CylinderGeometry(0.032, 0.032, width + 0.04, 5);
      rungG.rotateX(Math.PI * 0.5);
      for (let r = 0; r < rungCount; r++) {
        const ry = -len * 0.45 + (r / Math.max(1, rungCount - 1)) * (len * 0.90);
        const rg = makeTransformedMesh(rungG, plankMat, ladderG, isMobile);
        rg.position.set(0, ry, 0);
      }
      railG.dispose();
      rungG.dispose();
    };

    // Lower ladder from camp ground (+X) up to Mid-Landing
    buildLadder(2.45, 0.0, 0.78, 1.48, deck1Y + 0.08, 0.78, 0.72);
    // Upper ladder from Mid-Landing up through opening in Deck 2
    buildLadder(1.88, deck1Y + 0.08, 0.78, 1.38, deck2Y + 0.12, 0.78, 0.66);

    // Dark Shingled Pyramid Roof (~1.75m tall, peaking at ~8.48m)
    const roofH = roofPeakY - roofBaseY;
    const roofGeo = new THREE.ConeGeometry(2.55, roofH, 4);
    roofGeo.rotateY(Math.PI * 0.25);
    const towerRoof = makeTransformedMesh(roofGeo, shingleMat, tower, isMobile);
    towerRoof.position.set(0, roofBaseY + roofH * 0.5, 0);

    // Roof wooden rim fascia & pointed finial spike
    const fascia = makeTransformedMesh(new THREE.BoxGeometry(3.45, 0.14, 3.45), darkWoodMat, tower, isMobile);
    fascia.position.set(0, roofBaseY + 0.04, 0);
    const spire = makeTransformedMesh(new THREE.CylinderGeometry(0.04, 0.07, 0.72, 6), darkWoodMat, tower, isMobile);
    spire.position.set(0, roofPeakY + 0.20, 0);

    // Signal Torch Brazier on front-right corner of Watchtower Deck!
    const sigX = 1.45;
    const sigZ = -1.42;
    const sigPost = makeTransformedMesh(new THREE.CylinderGeometry(0.06, 0.08, 1.35, 6), darkWoodMat, tower, isMobile);
    sigPost.position.set(sigX, deck2Y + 0.68, sigZ);
    const sigBasket = makeTransformedMesh(new THREE.CylinderGeometry(0.24, 0.13, 0.30, 7), ironMat, tower, isMobile);
    sigBasket.position.set(sigX, deck2Y + 1.42, sigZ);
    const sigCoal = makeTransformedMesh(new THREE.DodecahedronGeometry(0.14, 0), emberMat, tower, isMobile, false, false);
    sigCoal.position.set(sigX, deck2Y + 1.54, sigZ);
    addFireEffect(tower, sigX, deck2Y + 1.52, sigZ, 0.68, true);

    addCollider('bandit_tower', tx, tz, 2.15, 8.5);
  }

  // --------------------------------------------------------------------------
  // 7. 4 CREW TENTS (2 A-FRAME + 2 CONICAL) WITH STAKES, SLEEPING ROLLS & BLANKETS
  // --------------------------------------------------------------------------
  {
    const crewTents = [
      { lx: 5.8,  lz: -8.8,  type: 'aframe',  mat: leatherTentMat,   trim: crimsonTentMat, sc: 1.05 },
      { lx: 5.6,  lz:  8.8,  type: 'aframe',  mat: crimsonTentMat,   trim: leatherTentMat, sc: 1.08 },
      { lx: -4.8, lz: 10.2,  type: 'conical', mat: leatherTentMat,   trim: crimsonTentMat, sc: 1.12 },
      { lx: 0.6,  lz: -11.4, type: 'conical', mat: brightCrimsonMat, trim: leatherTentMat, sc: 1.02 },
    ];

    const upVecTent = new THREE.Vector3(0, 1, 0);
    for (const ct of crewTents) {
      const gy = localGroundY(ct.lx, ct.lz);
      const tg = new THREE.Group();
      tg.position.set(ct.lx, gy, ct.lz);
      tg.rotation.y = Math.atan2(-ct.lx, -ct.lz); // open doorway faces inward toward campfire plaza
      tg.scale.setScalar(ct.sc);
      group.add(tg);

      if (ct.type === 'aframe') {
        // Triangular prism A-frame tent (open at +Z front)
        const tw = 2.65;
        const th = 2.05;
        const td = 3.10;
        const slopeLen = Math.hypot(tw * 0.5, th);
        const slopeAng = Math.atan2(th, tw * 0.5);

        for (const sx of [-1, 1]) {
          const panel = makeTransformedMesh(new THREE.BoxGeometry(slopeLen + 0.12, 0.06, td), ct.mat, tg, isMobile);
          panel.position.set(sx * tw * 0.25, th * 0.5, 0);
          panel.rotation.z = -sx * slopeAng;
        }
        // Back triangular canvas flap (-Z)
        const backCone = new THREE.ConeGeometry(tw * 0.54, th, 4);
        backCone.rotateY(Math.PI * 0.25);
        backCone.scale(1.0, 1.0, 0.14);
        const backFlap = makeTransformedMesh(backCone, ct.trim, tg, isMobile);
        backFlap.position.set(0, th * 0.5, -td * 0.46);

        // Ridge pole + front & rear upright poles
        const ridge = makeTransformedMesh(new THREE.CylinderGeometry(0.055, 0.055, td + 0.5, 6), darkWoodMat, tg, isMobile);
        ridge.rotation.x = Math.PI * 0.5;
        ridge.position.set(0, th + 0.04, 0);

        for (const pz of [-td * 0.48, td * 0.48]) {
          const upright = makeTransformedMesh(new THREE.CylinderGeometry(0.05, 0.07, th + 0.25, 6), darkWoodMat, tg, isMobile);
          upright.position.set(0, (th + 0.25) * 0.5, pz);
        }

        // Staked guy-ropes at 4 lower eaves
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const peg = makeTransformedMesh(new THREE.CylinderGeometry(0.03, 0.02, 0.34, 5), darkWoodMat, tg, isMobile, false, true);
          peg.position.set(sx * (tw * 0.5 + 0.45), 0.12, sz * (td * 0.42));
          peg.rotation.z = -0.38 * sx;

          const rope = makeTransformedMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4), ropeMat, tg, isMobile, false, false);
          rope.position.set(sx * (tw * 0.5 + 0.22), 0.25, sz * (td * 0.42));
          rope.rotation.z = 0.95 * sx;
        }
      } else {
        // Conical flared bell tent with open front entrance wedge (+Z)
        const radius = 1.85;
        const height = 2.65;
        const coneGeo = new THREE.ConeGeometry(radius, height, 8, 1, true, 0.42, Math.PI * 2 - 0.84);
        const body = makeTransformedMesh(coneGeo, ct.mat, tg, isMobile);
        body.position.set(0, height * 0.5, 0);

        // Upper cap collar + center pole jutting out apex
        const cap = makeTransformedMesh(new THREE.ConeGeometry(0.55, 0.65, 8), ct.trim, tg, isMobile);
        cap.position.set(0, height - 0.18, 0);
        const pole = makeTransformedMesh(new THREE.CylinderGeometry(0.05, 0.075, height + 0.48, 6), darkWoodMat, tg, isMobile);
        pole.position.set(0, (height + 0.48) * 0.5, 0);

        // Flared rolled entrance flaps
        for (const sx of [-1, 1]) {
          const flap = makeTransformedMesh(new THREE.CylinderGeometry(0.11, 0.16, 1.25, 6), ct.trim, tg, isMobile);
          flap.position.set(sx * 0.62, 0.60, radius * 0.72);
          flap.rotation.z = -sx * 0.36;
          flap.rotation.x = 0.25;
        }

        // 5 ground stakes & taut guy-ropes around skirt
        for (let s = 0; s < 5; s++) {
          const ang = 0.55 + (s / 4) * (Math.PI * 2 - 1.1);
          const sx0 = Math.sin(ang) * (radius * 0.86);
          const sz0 = Math.cos(ang) * (radius * 0.86);
          const px = Math.sin(ang) * (radius + 0.42);
          const pz = Math.cos(ang) * (radius + 0.42);

          const peg = makeTransformedMesh(new THREE.CylinderGeometry(0.03, 0.02, 0.34, 5), darkWoodMat, tg, isMobile, false, true);
          peg.position.set(px, 0.12, pz);
          const pegDir = new THREE.Vector3(-Math.sin(ang) * 0.45, 0.90, -Math.cos(ang) * 0.45).normalize();
          peg.quaternion.setFromUnitVectors(upVecTent, pegDir);

          const ropeVec = new THREE.Vector3(px - sx0, 0.14 - 0.55, pz - sz0);
          const rope = makeTransformedMesh(new THREE.CylinderGeometry(0.014, 0.014, ropeVec.length(), 4), ropeMat, tg, isMobile, false, false);
          rope.position.set((sx0 + px) * 0.5, (0.55 + 0.14) * 0.5, (sz0 + pz) * 0.5);
          rope.quaternion.setFromUnitVectors(upVecTent, ropeVec.normalize());
        }
      }

      // Inside crew tent: Rolled Sleeping Bag + Folded Brown/Maroon Blanket + Small Crate
      const bedMat = ct.mat === leatherTentMat ? crimsonTentMat : leatherTentMat;
      const bedPad = makeTransformedMesh(new THREE.BoxGeometry(0.76, 0.09, 1.52), bedMat, tg, isMobile, false, true);
      bedPad.position.set(-0.36, 0.05, -0.10);
      bedPad.rotation.y = 0.08;

      const pillowRoll = makeTransformedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.68, 7), boneMat, tg, isMobile, false, true);
      pillowRoll.rotation.z = Math.PI * 0.5;
      pillowRoll.position.set(-0.36, 0.14, -0.72);

      // Extra rolled sleeping bag tied with rope straps near entrance
      const bedRoll = makeTransformedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.76, 7), ct.trim, tg, isMobile);
      bedRoll.rotation.z = Math.PI * 0.5;
      bedRoll.rotation.y = -0.32;
      bedRoll.position.set(0.45, 0.15, 0.35);
      for (const off of [-0.22, 0.22]) {
        const tie = makeTransformedMesh(new THREE.TorusGeometry(0.155, 0.022, 4, 8), ropeMat, tg, isMobile, false, false);
        tie.position.set(0.45 + Math.cos(-0.32) * off, 0.15, 0.35 - Math.sin(-0.32) * off);
        tie.rotation.y = Math.PI * 0.5 - 0.32;
      }

      addCollider('bandit_tent', ct.lx, ct.lz, 2.05 * ct.sc, 2.9 * ct.sc);
    }
  }

  // --------------------------------------------------------------------------
  // 8. CENTRAL CAMPFIRE HEARTH, TRIPOD CAULDRON, ANIMATED FLAME & 4 LOG SEATS
  // --------------------------------------------------------------------------
  {
    const cy = localGroundY(0, 0);
    const fireBase = new THREE.Group();
    fireBase.position.set(0, cy, 0);
    group.add(fireBase);

    // 11 River Stones in Hearth Ring
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + (rng() - 0.5) * 0.12;
      const r = 0.96 + (rng() - 0.5) * 0.10;
      const sg = new THREE.DodecahedronGeometry(0.24 + rng() * 0.08, 0);
      sg.scale(1.2, 0.72, 1.0);
      transformAndPush(stoneGeos, sg, Math.cos(a) * r, cy + 0.12, Math.sin(a) * r, rng() * 0.4, a, rng() * 0.4);
      sg.dispose();
    }

    // Glowing ember bed + charred firewood logs
    const embers = makeTransformedMesh(new THREE.CylinderGeometry(0.68, 0.78, 0.14, 9), emberMat, fireBase, isMobile, false, false);
    embers.position.set(0, 0.08, 0);

    const logGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.45, 6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI + 0.2;
      const log = makeTransformedMesh(logGeo, darkWoodMat, fireBase, isMobile);
      log.position.set(Math.cos(a) * 0.12, 0.18 + (i % 2) * 0.06, Math.sin(a) * 0.12);
      log.rotation.z = Math.PI * 0.44;
      log.rotation.y = a;
    }
    logGeo.dispose();

    // Wooden Tripod Frame (3 angled poles lashed at y = 2.38m)
    const apexY = 2.38;
    const legSpreadR = 1.28;
    for (let i = 0; i < 3; i++) {
      const ang = i * ((Math.PI * 2) / 3) + 0.35;
      const p0 = new THREE.Vector3(Math.cos(ang) * legSpreadR, -0.05, Math.sin(ang) * legSpreadR);
      const p1 = new THREE.Vector3(Math.cos(ang) * -0.14, apexY + 0.25, Math.sin(ang) * -0.14);
      const vec = new THREE.Vector3().subVectors(p1, p0);
      const pole = makeTransformedMesh(new THREE.CylinderGeometry(0.055, 0.085, vec.length(), 6), palisadeWoodMat, fireBase, isMobile);
      pole.position.copy(p0).addScaledVector(vec, 0.5);
      pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
    }
    const apexTie = makeTransformedMesh(new THREE.TorusGeometry(0.14, 0.05, 5, 8), ropeMat, fireBase, isMobile);
    apexTie.position.set(0, apexY, 0);
    apexTie.rotation.x = Math.PI * 0.5;

    // Hanging Chain + Cast-Iron Stew Cauldron
    cauldronPivot = new THREE.Group();
    cauldronPivot.position.set(0, apexY, 0);
    fireBase.add(cauldronPivot);

    const chainSegGeo = new THREE.TorusGeometry(0.045, 0.015, 4, 6);
    for (let c = 0; c < 6; c++) {
      const link = makeTransformedMesh(chainSegGeo, ironMat, cauldronPivot, isMobile, false, true);
      link.position.set(0, -0.10 - c * 0.11, 0);
      link.rotation.y = (c % 2) * Math.PI * 0.5;
    }
    chainSegGeo.dispose();

    const cauldronGroup = new THREE.Group();
    cauldronGroup.position.set(0, -1.06, 0);
    cauldronPivot.add(cauldronGroup);

    const potBody = makeTransformedMesh(new THREE.SphereGeometry(0.46, 10, 8, 0, Math.PI * 2, 0.42, Math.PI - 0.42), ironMat, cauldronGroup, isMobile);
    potBody.scale.set(1.0, 0.92, 1.0);
    const potRim = makeTransformedMesh(new THREE.TorusGeometry(0.39, 0.05, 6, 12), ironMat, cauldronGroup, isMobile);
    potRim.rotation.x = Math.PI * 0.5;
    potRim.position.set(0, 0.36, 0);

    // Bail handle arch connecting rim to hanging chain
    const bail = makeTransformedMesh(new THREE.TorusGeometry(0.39, 0.025, 5, 10, Math.PI), ironMat, cauldronGroup, isMobile);
    bail.position.set(0, 0.36, 0);

    // Bubbling hearty stew inside cauldron + wooden ladle
    const stewSurf = makeTransformedMesh(new THREE.CircleGeometry(0.36, 10), stewMat, cauldronGroup, isMobile, false, true);
    stewSurf.rotation.x = -Math.PI * 0.5;
    stewSurf.position.set(0, 0.30, 0);

    stewBubbleGroup = new THREE.Group();
    stewBubbleGroup.position.set(0, 0.31, 0);
    cauldronGroup.add(stewBubbleGroup);
    for (let b = 0; b < 4; b++) {
      const ba = b * 1.55;
      const bub = makeTransformedMesh(new THREE.SphereGeometry(0.045, 5, 4), flameInnerMat, stewBubbleGroup, isMobile, false, false);
      bub.position.set(Math.cos(ba) * 0.15, 0, Math.sin(ba) * 0.15);
    }

    const ladleStick = makeTransformedMesh(new THREE.CylinderGeometry(0.022, 0.028, 0.68, 5), plankMat, cauldronGroup, isMobile);
    ladleStick.position.set(0.16, 0.46, 0.12);
    ladleStick.rotation.z = -0.45;
    ladleStick.rotation.x = 0.25;

    // Campfire flickering flames, warm glow & rising smoke wisps
    addFireEffect(fireBase, 0, 0.18, 0, 1.12, true);

    // 4 Seated Bark Log Benches arranged around campfire
    const seatLogGeo = new THREE.CylinderGeometry(0.24, 0.26, 1.95, 7);
    const chockGeo = new THREE.BoxGeometry(0.26, 0.18, 0.42);
    const seatAngles = [0.46, 1.92, 3.62, 5.14];
    for (let i = 0; i < seatAngles.length; i++) {
      const sa = seatAngles[i];
      const sr = 2.75;
      const sx = Math.cos(sa) * sr;
      const sz = Math.sin(sa) * sr;
      const sgy = localGroundY(sx, sz);

      transformAndPush(palisadeWoodGeos, seatLogGeo, sx, sgy + 0.28, sz, Math.PI * 0.5, sa, 0);
      for (const endOff of [-0.62, 0.62]) {
        const cxOff = -Math.sin(sa) * endOff;
        const czOff = Math.cos(sa) * endOff;
        transformAndPush(darkWoodGeos, chockGeo, sx + cxOff, sgy + 0.09, sz + czOff, 0, sa, 0);
      }
      // Small wooden tankard sitting on log #0 and #2
      if (i % 2 === 0) {
        const mug = makeTransformedMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.18, 6), plankMat, group, isMobile, false, true);
        mug.position.set(sx + 0.12, sgy + 0.56, sz - 0.08);
      }
    }
    seatLogGeo.dispose();
    chockGeo.dispose();

    addCollider('bandit_campfire', 0, 0, 1.45, 2.5);
  }

  // --------------------------------------------------------------------------
  // 9. 2 WOODEN WEAPON & SHIELD RACKS
  // --------------------------------------------------------------------------
  {
    const racks = [
      { lx: 7.4, lz: -3.8, yaw: -0.35 },
      { lx: 7.4, lz:  4.0, yaw:  0.38 },
    ];

    const postGeo = new THREE.BoxGeometry(0.11, 1.55, 0.11);
    const footGeo = new THREE.BoxGeometry(0.14, 0.10, 0.72);
    const barGeo = new THREE.BoxGeometry(2.10, 0.10, 0.10);
    const spearShaftGeo = new THREE.CylinderGeometry(0.025, 0.03, 2.05, 5);
    const spearHeadGeo = new THREE.ConeGeometry(0.065, 0.28, 4);
    const swordBladeGeo = new THREE.BoxGeometry(0.075, 0.92, 0.025);
    const hiltGeo = new THREE.BoxGeometry(0.28, 0.04, 0.06);
    const shieldDiscGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10);
    const shieldRimGeo = new THREE.TorusGeometry(0.42, 0.032, 5, 10);
    const shieldBossGeo = new THREE.SphereGeometry(0.10, 6, 5);

    for (const rk of racks) {
      const rgy = localGroundY(rk.lx, rk.lz);
      const rg = new THREE.Group();
      rg.position.set(rk.lx, rgy, rk.lz);
      rg.rotation.y = rk.yaw;
      group.add(rg);

      // Frame uprights + sled feet + top/mid crossbars
      for (const sx of [-0.88, 0.88]) {
        const up = makeTransformedMesh(postGeo, darkWoodMat, rg, isMobile);
        up.position.set(sx, 0.78, 0);
        const ft = makeTransformedMesh(footGeo, darkWoodMat, rg, isMobile);
        ft.position.set(sx, 0.05, 0);
      }
      const topBar = makeTransformedMesh(barGeo, plankMat, rg, isMobile);
      topBar.position.set(0, 1.38, 0);
      const lowBar = makeTransformedMesh(barGeo, plankMat, rg, isMobile);
      lowBar.position.set(0, 0.42, 0);

      // Leaning Spears & Halberd
      for (let s = 0; s < 3; s++) {
        const sx = -0.58 + s * 0.28;
        const spearG = new THREE.Group();
        spearG.position.set(sx, 1.05, 0.09);
        spearG.rotation.x = -0.18;
        spearG.rotation.z = (s - 1) * 0.06;
        rg.add(spearG);

        makeTransformedMesh(spearShaftGeo, darkWoodMat, spearG, isMobile);
        const head = makeTransformedMesh(spearHeadGeo, steelBladeMat, spearG, isMobile);
        head.position.set(0, 1.12, 0);
      }

      // Bandit Broadsword & Battleaxe leaning beside spears
      for (let w = 0; w < 2; w++) {
        const wx = 0.25 + w * 0.34;
        const swordG = new THREE.Group();
        swordG.position.set(wx, 0.62, -0.09);
        swordG.rotation.x = 0.20;
        swordG.rotation.z = (w === 0 ? 0.08 : -0.1);
        rg.add(swordG);

        const bl = makeTransformedMesh(swordBladeGeo, steelBladeMat, swordG, isMobile);
        bl.position.set(0, 0.12, 0);
        const hl = makeTransformedMesh(hiltGeo, ironMat, swordG, isMobile);
        hl.position.set(0, 0.58, 0);
        const grip = makeTransformedMesh(new THREE.CylinderGeometry(0.025, 0.028, 0.22, 5), leatherTentMat, swordG, isMobile);
        grip.position.set(0, 0.70, 0);
      }

      // 2 Round Iron-Banded Wooden Shields hung/leaning on front of rack
      for (let sh = 0; sh < 2; sh++) {
        const shx = sh === 0 ? -0.45 : 0.45;
        const shMat = sh === 0 ? crimsonTentMat : plankMat;
        const sg = new THREE.Group();
        sg.position.set(shx, 0.65, 0.24);
        sg.rotation.x = -0.26;
        sg.rotation.y = sh === 0 ? 0.16 : -0.16;
        rg.add(sg);

        const disc = makeTransformedMesh(shieldDiscGeo, shMat, sg, isMobile);
        disc.rotation.x = Math.PI * 0.5;
        const rim = makeTransformedMesh(shieldRimGeo, ironMat, sg, isMobile);
        const boss = makeTransformedMesh(shieldBossGeo, steelBladeMat, sg, isMobile);
        boss.position.set(0, 0, 0.04);
      }

      addCollider('bandit_rack', rk.lx, rk.lz, 1.12, 1.75);
    }

    postGeo.dispose();
    footGeo.dispose();
    barGeo.dispose();
    spearShaftGeo.dispose();
    spearHeadGeo.dispose();
    swordBladeGeo.dispose();
    hiltGeo.dispose();
    shieldDiscGeo.dispose();
    shieldRimGeo.dispose();
    shieldBossGeo.dispose();
  }

  // --------------------------------------------------------------------------
  // 10. 2 STRAW ARCHERY TARGETS WITH RED-WHITE BULLSEYE & EMBEDDED ARROWS
  // --------------------------------------------------------------------------
  {
    const targets = [
      { lx: 10.8, lz: -7.0 },
      { lx: 11.6, lz: -4.9 },
    ];

    const legGeo = new THREE.CylinderGeometry(0.045, 0.055, 1.72, 5);
    const arrowShaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.74, 4);
    const fletchGeo = new THREE.BoxGeometry(0.08, 0.14, 0.012);

    for (const tgCfg of targets) {
      const tgy = localGroundY(tgCfg.lx, tgCfg.lz);
      const tg = new THREE.Group();
      tg.position.set(tgCfg.lx, tgy, tgCfg.lz);
      tg.rotation.y = Math.atan2(3.0 - tgCfg.lx, -4.0 - tgCfg.lz); // bullseye faces firing line in camp plaza
      group.add(tg);

      // 3-Leg Wooden Easel Stand
      for (const [lx, lz, rx, rz] of [[-0.44, 0.16, 0.16, -0.22], [0.44, 0.16, 0.16, 0.22], [0, -0.52, -0.34, 0]]) {
        const leg = makeTransformedMesh(legGeo, darkWoodMat, tg, isMobile);
        leg.position.set(lx * 0.55, 0.80, lz * 0.55);
        leg.rotation.set(rx, 0, rz);
      }

      // Straw Disc Drum + Red-White Bullseye Target Face
      const strawHead = new THREE.Group();
      strawHead.position.set(0, 1.18, 0.06);
      strawHead.rotation.x = -0.14;
      tg.add(strawHead);

      const drum = makeTransformedMesh(new THREE.CylinderGeometry(0.58, 0.58, 0.24, 14), strawMat, strawHead, isMobile);
      drum.rotation.x = Math.PI * 0.5;
      const faceFront = makeTransformedMesh(new THREE.CircleGeometry(0.56, 14), targetFaceMat, strawHead, isMobile, false, true);
      faceFront.position.set(0, 0, 0.125);
      const faceBack = makeTransformedMesh(new THREE.CircleGeometry(0.56, 14), strawMat, strawHead, isMobile, false, true);
      faceBack.rotation.y = Math.PI;
      faceBack.position.set(0, 0, -0.125);

      // 4 Stuck Arrows with Red Fletching embedded in target!
      const arrowOffsets = [
        { ax:  0.04, ay:  0.03, rx: 0.12, rz: -0.08 },
        { ax: -0.18, ay:  0.14, rx: 0.06, rz:  0.18 },
        { ax:  0.22, ay: -0.11, rx: -0.08, rz: -0.15 },
        { ax: -0.06, ay: -0.26, rx: 0.18, rz:  0.06 },
      ];
      for (const ar of arrowOffsets) {
        const ag = new THREE.Group();
        ag.position.set(ar.ax, ar.ay, 0.14);
        ag.rotation.set(Math.PI * 0.5 + ar.rx, 0, ar.rz);
        strawHead.add(ag);

        const shaft = makeTransformedMesh(arrowShaftGeo, plankMat, ag, isMobile, false, false);
        shaft.position.set(0, 0.24, 0);
        const f1 = makeTransformedMesh(fletchGeo, featherRedMat, ag, isMobile, false, false);
        f1.position.set(0, 0.54, 0);
        const f2 = makeTransformedMesh(fletchGeo, boneMat, ag, isMobile, false, false);
        f2.position.set(0, 0.54, 0);
        f2.rotation.y = Math.PI * 0.5;
      }

      addCollider('bandit_target', tgCfg.lx, tgCfg.lz, 0.78, 1.75);
    }

    legGeo.dispose();
    arrowShaftGeo.dispose();
    fletchGeo.dispose();
  }

  // --------------------------------------------------------------------------
  // 11. LOOT CRATES, IRON-BANDED BARRELS & SACKS CLUSTERS
  // --------------------------------------------------------------------------
  {
    const addCrate = (parent, lx, ly, lz, size = 0.85, yaw = 0) => {
      const cg = new THREE.Group();
      cg.position.set(lx, ly + size * 0.5, lz);
      cg.rotation.y = yaw;
      parent.add(cg);

      makeTransformedMesh(new THREE.BoxGeometry(size, size, size), plankMat, cg, isMobile);
      // Framed wood edge strips & diagonal slat
      const frame = makeTransformedMesh(new THREE.BoxGeometry(size * 1.03, size * 0.12, size * 1.03), darkWoodMat, cg, isMobile);
      frame.position.y = size * 0.44;
      const frameBot = makeTransformedMesh(new THREE.BoxGeometry(size * 1.03, size * 0.12, size * 1.03), darkWoodMat, cg, isMobile);
      frameBot.position.y = -size * 0.44;
      for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const corner = makeTransformedMesh(new THREE.BoxGeometry(size * 0.10, size * 1.01, size * 0.10), ironMat, cg, isMobile);
        corner.position.set(fx * size * 0.47, 0, fz * size * 0.47);
      }
    };

    const addBarrel = (parent, lx, ly, lz, sc = 1.0, tipped = false, yaw = 0) => {
      const bg = new THREE.Group();
      bg.position.set(lx, ly + (tipped ? 0.34 * sc : 0.48 * sc), lz);
      bg.rotation.y = yaw;
      if (tipped) bg.rotation.z = Math.PI * 0.5;
      bg.scale.setScalar(sc);
      parent.add(bg);

      // Bulging barrel stave profile using 3 stacked cylinders
      makeTransformedMesh(new THREE.CylinderGeometry(0.36, 0.31, 0.32, 10), plankMat, bg, isMobile).position.y = -0.32;
      makeTransformedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.32, 10), plankMat, bg, isMobile).position.y = 0;
      makeTransformedMesh(new THREE.CylinderGeometry(0.31, 0.36, 0.32, 10), plankMat, bg, isMobile).position.y = 0.32;

      // Iron barrel hoops
      for (const hy of [-0.34, 0, 0.34]) {
        const hr = hy === 0 ? 0.37 : 0.345;
        makeTransformedMesh(new THREE.CylinderGeometry(hr, hr, 0.055, 10), ironMat, bg, isMobile).position.y = hy;
      }
    };

    const addLootSack = (parent, lx, ly, lz, yaw = 0) => {
      const sk = new THREE.Group();
      sk.position.set(lx, ly + 0.25, lz);
      sk.rotation.y = yaw;
      parent.add(sk);
      const body = makeTransformedMesh(new THREE.SphereGeometry(0.28, 7, 6), leatherTentMat, sk, isMobile);
      body.scale.set(1.0, 0.92, 0.85);
      const neck = makeTransformedMesh(new THREE.ConeGeometry(0.16, 0.22, 6), leatherTentMat, sk, isMobile);
      neck.position.y = 0.24;
      neck.rotation.x = Math.PI;
      const tie = makeTransformedMesh(new THREE.TorusGeometry(0.09, 0.02, 4, 7), ropeMat, sk, isMobile);
      tie.rotation.x = Math.PI * 0.5;
      tie.position.y = 0.21;
    };

    // Cluster A: Commander Supply Pile (-2.5, -8.8)
    {
      const cx = -2.5, cz = -8.8;
      const cy = localGroundY(cx, cz);
      const cl = new THREE.Group();
      cl.position.set(cx, cy, cz);
      group.add(cl);
      addCrate(cl, -0.45, 0, -0.15, 0.92, 0.18);
      addCrate(cl, -0.42, 0.92, -0.12, 0.64, -0.28);
      addBarrel(cl, 0.55, 0, 0.22, 0.98, false, 0.4);
      addBarrel(cl, 0.45, 0, -0.65, 0.92, false, -0.2);
      addLootSack(cl, -0.18, 0, 0.58, 0.5);
      addCollider('bandit_crates', cx, cz, 1.32, 1.65);
    }

    // Cluster B: South Provisions Pile (1.8, 7.0)
    {
      const cx = 1.8, cz = 7.0;
      const cy = localGroundY(cx, cz);
      const cl = new THREE.Group();
      cl.position.set(cx, cy, cz);
      group.add(cl);
      addCrate(cl, -0.42, 0, 0.25, 0.88, -0.32);
      addBarrel(cl, 0.52, 0, 0.15, 1.0, false, 0.1);
      addBarrel(cl, 0.05, 0, -0.58, 0.92, true, 0.72);
      addLootSack(cl, -0.58, 0, -0.45, -0.4);
      addCollider('bandit_crates', cx, cz, 1.25, 1.35);
    }

    // Cluster C: Watchtower Base Ammo/Supply (-7.6, -1.6)
    {
      const cx = -7.6, cz = -1.6;
      const cy = localGroundY(cx, cz);
      const cl = new THREE.Group();
      cl.position.set(cx, cy, cz);
      group.add(cl);
      addCrate(cl, 0.0, 0, 0.24, 0.84, 0.12);
      addCrate(cl, 0.06, 0.84, 0.22, 0.58, 0.45);
      addBarrel(cl, -0.68, 0, -0.38, 0.96, false, 0.2);
      addCollider('bandit_crates', cx, cz, 1.15, 1.55);
    }
  }

  // --------------------------------------------------------------------------
  // 12. BROKEN WOODEN CART FRAME AT PALISADE EDGE
  // --------------------------------------------------------------------------
  {
    const wx = 1.8;
    const wz = 13.0;
    const wy = localGroundY(wx, wz);
    const cartYaw = 0.48;

    const wreck = new THREE.Group();
    wreck.position.set(wx, wy, wz);
    wreck.rotation.y = cartYaw;
    group.add(wreck);

    // Listing broken wagon chassis tilted down on the missing-wheel (-X) side
    const bedGroup = new THREE.Group();
    bedGroup.position.set(0, 0.44, 0);
    bedGroup.rotation.z = 0.34; // leans down toward missing left wheel
    bedGroup.rotation.x = 0.12;
    wreck.add(bedGroup);

    // Plank floor bed + missing/splintered slats
    for (let p = -2; p <= 2; p++) {
      const pLen = p === -1 ? 1.85 : 2.35; // one plank snapped short!
      const slat = makeTransformedMesh(new THREE.BoxGeometry(0.26, 0.08, pLen), plankMat, bedGroup, isMobile);
      slat.position.set(p * 0.28, 0, p === -1 ? 0.2 : 0);
    }

    // Side rails (left side broken/splintered, right side mostly intact)
    makeTransformedMesh(new THREE.BoxGeometry(0.08, 0.45, 2.35), darkWoodMat, bedGroup, isMobile).position.set(0.70, 0.24, 0);
    makeTransformedMesh(new THREE.BoxGeometry(0.08, 0.38, 1.45), darkWoodMat, bedGroup, isMobile).position.set(-0.70, 0.20, 0.35);
    // Angled broken rail post sticking out
    const brokenRail = makeTransformedMesh(new THREE.BoxGeometry(0.08, 0.12, 0.95), darkWoodMat, bedGroup, isMobile);
    brokenRail.position.set(-0.68, 0.26, -0.68);
    brokenRail.rotation.set(0.28, 0.25, 0);

    // Back tailgate & axle beam
    makeTransformedMesh(new THREE.BoxGeometry(1.42, 0.42, 0.08), plankMat, bedGroup, isMobile).position.set(0, 0.22, -1.16);
    makeTransformedMesh(new THREE.CylinderGeometry(0.065, 0.065, 1.88, 6), ironMat, bedGroup, isMobile).rotation.z = Math.PI * 0.5;

    // Front cracked draft shafts resting down into dirt
    for (const sx of [-0.46, 0.46]) {
      const shaft = makeTransformedMesh(new THREE.BoxGeometry(0.08, 0.08, 1.45), darkWoodMat, bedGroup, isMobile);
      shaft.position.set(sx, -0.10, 1.72);
      shaft.rotation.x = 0.24;
      if (sx < 0) shaft.rotation.y = -0.18;
    }

    // Helper to build spoked wooden wagon wheel
    const buildWheel = (parent, intact = true) => {
      const wg = new THREE.Group();
      parent.add(wg);
      const rimArc = intact ? Math.PI * 2 : Math.PI * 1.42;
      const rim = makeTransformedMesh(new THREE.TorusGeometry(0.54, 0.055, 6, 12, rimArc), darkWoodMat, wg, isMobile);
      rim.rotation.y = Math.PI * 0.5;
      const ironTire = makeTransformedMesh(new THREE.TorusGeometry(0.585, 0.022, 5, 12, rimArc), ironMat, wg, isMobile);
      ironTire.rotation.y = Math.PI * 0.5;
      const hub = makeTransformedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.20, 7), ironMat, wg, isMobile);
      hub.rotation.z = Math.PI * 0.5;

      const spokeCount = intact ? 8 : 5;
      const spGeo = new THREE.CylinderGeometry(0.025, 0.032, 1.02, 5);
      for (let i = 0; i < spokeCount; i++) {
        if (!intact && i === 2) continue;
        const a = (i / 8) * Math.PI * 2;
        const sp = makeTransformedMesh(spGeo, plankMat, wg, isMobile);
        sp.rotation.x = a;
      }
      spGeo.dispose();
      return wg;
    };

    // Intact wheel still mounted on right (+X) axle end
    const rightWheel = buildWheel(bedGroup, true);
    rightWheel.position.set(0.88, -0.02, 0);

    // Detached broken wheel lying flat in dirt beside cart
    const fallenWheel = buildWheel(wreck, false);
    fallenWheel.position.set(-1.32, 0.08, 0.42);
    fallenWheel.rotation.z = Math.PI * 0.5 - 0.12;
    fallenWheel.rotation.y = 0.65;

    // Scattered splintered plank & coil of rope near wreck
    const loosePlank = makeTransformedMesh(new THREE.BoxGeometry(0.24, 0.06, 1.25), plankMat, wreck, isMobile);
    loosePlank.position.set(-0.95, 0.05, -0.92);
    loosePlank.rotation.y = 0.82;

    addCollider('bandit_wreck', wx, wz, 1.75, 1.45);
  }

  // --------------------------------------------------------------------------
  // 13. FINALIZE STATIC MERGED GEOMETRY BATCHES
  // --------------------------------------------------------------------------
  const addMergedBatch = (geos, mat, cast = true, receive = true) => {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos);
    return makeTransformedMesh(merged, mat, group, isMobile, cast, receive);
  };

  addMergedBatch(palisadeWoodGeos, palisadeWoodMat, true, true);
  addMergedBatch(hewnTipGeos, hewnTipMat, true, true);
  addMergedBatch(plankGeos, plankMat, true, true);
  addMergedBatch(darkWoodGeos, darkWoodMat, true, true);
  addMergedBatch(ropeGeos, ropeMat, false, true);
  addMergedBatch(ironGeos, ironMat, true, true);
  addMergedBatch(steelGeos, steelBladeMat, true, true);
  addMergedBatch(stoneGeos, stoneMat, true, true);
  addMergedBatch(dirtGeos, dirtMat, false, true);
  addMergedBatch(strawGeos, strawMat, true, true);

  // --------------------------------------------------------------------------
  // 14. FRAME UPDATE ANIMATION: FLAMES, SMOKE, CAULDRON & WAVING GATE BANNERS
  // --------------------------------------------------------------------------
  function update(elapsed = 0) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;

    // Flickering flames (campfire + gate torches + watchtower signal torch)
    for (let i = 0; i < animatedFlames.length; i++) {
      const f = animatedFlames[i];
      const wave1 = Math.sin(t * f.speed + f.phase);
      const wave2 = Math.cos(t * (f.speed * 1.45) + f.phase * 1.3);
      const sy = 0.85 + 0.24 * wave1 + 0.12 * wave2;
      const sxz = 0.90 + 0.14 * wave2;
      f.mesh.scale.set(sxz, sy, sxz);
      f.mesh.position.set(
        f.baseX + wave2 * 0.025,
        f.baseY + (sy - 1.0) * 0.14,
        f.baseZ + wave1 * 0.025
      );
      f.mesh.rotation.z = wave1 * 0.14;
      f.mesh.rotation.x = wave2 * 0.10;
    }

    // Pulsing warm radial fire/torch glow sprites
    for (let i = 0; i < animatedGlows.length; i++) {
      const g = animatedGlows[i];
      const pulse = 0.90 + 0.14 * Math.sin(t * 7.2 + g.phase) + 0.07 * Math.cos(t * 13.5 + g.phase);
      const s = g.baseScale * pulse;
      g.sprite.scale.set(s, s, 1);
      if (g.sprite.material) {
        g.sprite.material.opacity = Math.min(0.92, 0.68 * pulse);
      }
    }

    // Thin rising smoke wisps from campfire & watchtower signal
    for (let i = 0; i < animatedSmokes.length; i++) {
      const sm = animatedSmokes[i];
      const cycle = (t * sm.speed + sm.phase) % 1.0;
      sm.sprite.position.set(
        sm.baseX + Math.sin(t * 1.1 + sm.phase * 6.2) * 0.22 * cycle + cycle * 0.42,
        sm.baseY + cycle * sm.maxRise,
        sm.baseZ + Math.cos(t * 0.95 + sm.phase * 4.8) * 0.18 * cycle
      );
      const sc = sm.baseScale * (0.65 + cycle * 1.45);
      sm.sprite.scale.set(sc, sc, 1);
      if (sm.sprite.material) {
        sm.sprite.material.opacity = Math.sin(cycle * Math.PI) * 0.36;
      }
    }

    // Gentle cauldron sway & simmering stew bubbles
    if (cauldronPivot) {
      cauldronPivot.rotation.z = Math.sin(t * 1.35) * 0.024;
      cauldronPivot.rotation.x = Math.cos(t * 1.05) * 0.016;
    }
    if (stewBubbleGroup) {
      for (let i = 0; i < stewBubbleGroup.children.length; i++) {
        const b = stewBubbleGroup.children[i];
        const bCycle = (t * 1.8 + i * 0.37) % 1.0;
        const bs = 0.4 + Math.sin(bCycle * Math.PI) * 0.85;
        b.scale.setScalar(bs);
        b.position.y = Math.sin(bCycle * Math.PI) * 0.03;
      }
    }

    // Soft wind billowing on the 2 Crimson Fang gate banners
    for (let i = 0; i < animatedBanners.length; i++) {
      const bn = animatedBanners[i];
      bn.pivot.rotation.x = 0.06 + Math.sin(t * 2.1 + bn.phase) * 0.065;

      const pos = bn.geo.getAttribute('position');
      const rest = bn.restPos;
      const h = bn.height;
      for (let vi = 0; vi < pos.count; vi++) {
        const rx = rest[vi * 3];
        const ry = rest[vi * 3 + 1];
        const rz = rest[vi * 3 + 2];
        const distFromTop = THREE.MathUtils.clamp((h * 0.5 - ry) / h, 0, 1);
        const ripple =
          Math.sin(t * 4.4 - distFromTop * 5.2 + rx * 2.4 + bn.phase) * 0.13 * distFromTop +
          Math.cos(t * 2.9 - distFromTop * 3.1 + bn.phase) * 0.05 * distFromTop;
        pos.setZ(vi, rz + ripple);
      }
      pos.needsUpdate = true;
      bn.geo.computeVertexNormals();
    }
  }

  // Initialize first frame state cleanly
  update(0);

  group.userData = {
    kind: 'bandit_camp',
    name: 'Crimson Fang Settlement',
    update,
  };

  return { group, update };
}

export { createBanditSettlement };
