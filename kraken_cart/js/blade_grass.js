/* ============================================================================
   RUMPUT HUTAN COZY → SHOD  (streaming kamera)
   Geometri bilah + tekstur + shader angin diambil dari hutan_cozy_interaktif_3d.html.
   Prinsip: yang DIGAMBAR hanya chunk yang masuk frustum kamera. Yang di belakang
   kamera tidak dirender sama sekali, dan bilah jauh cuma di-ground sebagian (lazy),
   jadi dunia boleh padat tanpa bikin frame berat.
   Injakan (trample) kuda/gerobak tetap hidup lewat instanceMatrix.
   ========================================================================= */
import { HC } from './hc.js';
import * as FA from './forest_assets.js';

const THREE = HC.THREE;
const UP = new THREE.Vector3(0, 1, 0);

const CHUNK = 20;         // sisi chunk dalam meter
const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

// Renderer software (SwiftShader/llvmpipe) tidak kuat: pangkas otomatis.
function _softwareGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(info));
  } catch (e) { return false; }
}
const SOFT_GL = !QS.has('grassdensity') && !QS.has('hq') && _softwareGL();
const AUTO_SCALE = SOFT_GL ? 1 : 1;
// Pangkas rumput lebih hemat dari baseline; patch gundul/pendek/tinggi dibuat lewat hash spasial.
// Kerapatan bisa ditimpa dari URL: ?grassdensity=1.5 / 0.5.
const DENSITY_REF = { soft: 1.8, hw: 5.4 };
const DENSITY_SCALE = Math.max(0, Math.min(2, parseFloat(QS.get('grassdensity') || '1')));
const DENSITY = (SOFT_GL ? DENSITY_REF.soft : DENSITY_REF.hw) * DENSITY_SCALE * AUTO_SCALE;
const RADIUS_MAX = SOFT_GL ? 62 : 132;  // jarak render rumput (chunk di belakang kamera tetap diculll)
const NEAR = SOFT_GL ? 22 : 34;
const MID = SOFT_GL ? 44 : 80;
const MAX_BLADES_PER_CHUNK = Math.max(1, Math.round(CHUNK * CHUNK * DENSITY));

export class BladeGrass {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'hutan-blade-grass';
    this.chunks = new Map();
    this.baseGeo = FA.createBotWGrassBladeGeometry(3);
    this.mat = FA.grassMat;
    // hutan "melukis" uGrassMap tiap frame sebagai mask area rumput. SHOD sudah
    // membuang rumput di jalan/sungai per bilah di CPU → mask harus netral putih,
    // kalau tidak grassScale=0 dan semua rumput mengecil ke nol.
    const whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteTex.needsUpdate = true;
    FA.grassUniforms.uGrassMap.value = whiteTex;
    this.time = 0;
    this.dummy = new THREE.Object3D();
    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._proj = new THREE.Matrix4();
    this._camPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._tmpVec = new THREE.Vector3();
    this._queue = [];
    this._lastKey = '';
    this.stats = { chunks: 0, blades: 0, drawn: 0, trampled: 0 };
  }

  // Kandidat bilah per chunk: hash koordinat, map tetap sama tiap load.
  _chunkSeedData(ci, cj) {
    const MAP = HC.MAP;
    const arr = [];
    const x0 = ci * CHUNK, z0 = cj * CHUNK;
    for (let i = 0; i < MAX_BLADES_PER_CHUNK; i++) {
      const h = (a) => MAP.hashRand(ci * 7919 + cj * 104729 + i * 1297 + a * 67, 1301 + a * 17);
      const x = x0 + h(1) * CHUNK;
      const z = z0 + h(2) * CHUNK;
      if (x < MAP.bounds.xMin || x > MAP.bounds.xMax) continue;
      if (Math.abs(z - MAP.roadCenterZ(x)) < MAP.roadHalf + 0.7) continue;
      if (this.world.riverDistX(x, z) < 9.5) continue;
      // Smooth deterministic value-noise field: rumpun 6–8 m lebar yang campur
      // membaur, bukan kotak-kotak keras atau bintik acak per bilah.
      const gx = x / 7.0, gz = z / 7.0;
      const ix = Math.floor(gx), iz = Math.floor(gz);
      const fx0 = gx - ix, fz0 = gz - iz;
      const fx = fx0 * fx0 * (3 - 2 * fx0), fz = fz0 * fz0 * (3 - 2 * fz0);
      const field = (cx, cz) => MAP.hashRand(cx * 7919 + cz * 104729, 1301);
      const v00 = field(ix, iz), v10 = field(ix + 1, iz);
      const v01 = field(ix, iz + 1), v11 = field(ix + 1, iz + 1);
      const patchNoise = (v00 + (v10 - v00) * fx) * (1 - fz) + (v01 + (v11 - v01) * fx) * fz;
      const patch = patchNoise * 0.78 + h(8) * 0.22;
      // Fully bare small patches keep some earth visible between grass clumps.
      if (patch < 0.095) continue;
      arr.push({
        x, z,
        ground: false,
        y: 0, yaw: h(3) * Math.PI * 2,
        w: 1.25 + h(4) * 0.70,
        bend: (h(5) - 0.5) * 0.5,
        hgt: (() => {
          // Groundcover berkelompok: sebagian gundul, hamparan pendek, rumpun tinggi.
          // Hash koordinat bikin pola stabil tiap reload dan masih hemat: jumlah instance tetap.
          const height = h(6);
          if (patch < 0.16) return 0.035 + height * 0.07;       // tanah hampir gundul
          if (patch < 0.56) return 0.20 + height * 0.26;        // rumput pendek
          if (patch < 0.84) return 0.48 + height * 0.42;        // sedang
          return 0.88 + height * 0.68;                           // rumpun tinggi
        })(),
        tint: h(7),
        lx: 0, lz: 0,
        nx: 0, ny: 1, nz: 0,
      });
    }
    return arr;
  }

  _buildChunk(ci, cj) {
    const key = ci + ':' + cj;
    if (this.chunks.has(key)) return this.chunks.get(key);
    const blades = this._chunkSeedData(ci, cj);
    if (!blades.length) { this.chunks.set(key, null); return null; }
    const geo = this.baseGeo.clone();
    const params = new Float32Array(blades.length * 4);
    for (let i = 0; i < blades.length; i++) {
      const b = blades[i];
      params[i * 4] = b.w; params[i * 4 + 1] = b.bend;
      params[i * 4 + 2] = b.hgt; params[i * 4 + 3] = b.tint;
    }
    geo.setAttribute('aBladeParams', new THREE.InstancedBufferAttribute(params, 4));
    const mesh = new THREE.InstancedMesh(geo, this.mat, blades.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;          // kami culling sendiri per chunk
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.count = 0;
    mesh.name = `hutan-grass-${key}`;
    this.group.add(mesh);
    const c = {
      ci, cj, key, blades, mesh,
      cx: (ci + 0.5) * CHUNK, cz: (cj + 0.5) * CHUNK,
      active: 0, band: -1,
    };
    // sphere untuk frustum test: pusat dari tinggi terrain aktual + toleransi lereng
    const y = this.world.meshSurfaceY(c.cx, c.cz);
    this._tmpVec.set(c.cx, y + 0.8, c.cz);
    c.sphere = new THREE.Sphere(this._tmpVec.clone(), CHUNK * 0.86 + 6);
    mesh.userData.meanY = y;
    this.chunks.set(key, c);
    return c;
  }

  // Camera dari global (ada di sesi live) ATAU dari registry scene buat headless/QA.
  _getCam() {
    if (typeof window === 'undefined') return null;
    const r = window.RIG;
    const cam = r && r.camera;
    return (cam && cam.isCamera) ? cam : null;
  }

  _bandFor(d) { return d < NEAR ? 2 : (d < MID ? 1 : 0); }
  _bandShare(band) { return band === 2 ? 1 : (band === 1 ? 0.55 : 0.22); }

  // Ground + tulis matriks hanya untuk bilah yang memang digambar.
  _growTo(c, n) {
    if (n <= c.active) return;
    for (let i = c.active; i < n; i++) {
      const b = c.blades[i];
      if (!b.ground) {
        b.y = this.world.meshSurfaceY(b.x, b.z) - 0.03;
        const e = 0.45;
        const hL = this.world.meshSurfaceY(b.x - e, b.z), hR = this.world.meshSurfaceY(b.x + e, b.z);
        const hD = this.world.meshSurfaceY(b.x, b.z - e), hU = this.world.meshSurfaceY(b.x, b.z + e);
        this._n.set(hL - hR, 2 * e, hD - hU).normalize();
        b.nx = this._n.x; b.ny = this._n.y; b.nz = this._n.z;
        b.ground = true;
      }
      c.mesh.setMatrixAt(i, this._matrixFor(b));
    }
    c.active = n;
    c.mesh.instanceMatrix.needsUpdate = true;
  }

  _matrixFor(b, out) {
    const d = out || this.dummy;
    d.position.set(b.x, b.y, b.z);
    this._n.set(b.nx, b.ny, b.nz);
    d.quaternion.setFromUnitVectors(UP, this._n);
    d.rotateY(b.yaw);
    const lean = Math.hypot(b.lx, b.lz);
    if (lean > 1e-4) {
      this._axis.set(b.lz / lean, 0, -b.lx / lean);
      this._q.setFromAxisAngle(this._axis, Math.min(0.95, lean) * 0.95);
      d.quaternion.premultiply(this._q);
    }
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    return d.matrix;
  }

  // Dipanggil saat terrain mesh bergeser: alas bilah harus ikut permukaan baru.
  sync(centerX) {
    this._lastCx = centerX;
    for (const c of this.chunks.values()) {
      if (!c) continue;
      const y = this.world.meshSurfaceY(c.cx, c.cz);
      c.sphere.center.set(c.cx, y + 0.8, c.cz);
      for (let i = 0; i < c.active; i++) c.blades[i].ground = false;
      const wasActive = c.active;
      c.active = 0;
      this._growTo(c, wasActive);
    }
  }

  refreshGround() { /* dikerjakan lazy oleh sync/update */ }

  // Injakan: hanya bilah aktif di dekat penginjak yang disentuh.
  applyTrample(tramplers, rearX, rearZ, dt) {
    let trampled = 0;
    const decay = Math.pow(0.90, dt * 60);
    for (const c of this.chunks.values()) {
      if (!c || c.active === 0) continue;
      let near = false;
      for (let k = 0; k < tramplers.length; k++) {
        const tr = tramplers[k];
        if (Math.abs(c.cx - tr.x) < CHUNK * 0.75 + tr.r && Math.abs(c.cz - tr.z) < CHUNK * 0.75 + tr.r) { near = true; break; }
      }
      if (!near) {
        let hasBent = false;
        for (let i = 0; i < c.active; i++) if (c.blades[i].lx || c.blades[i].lz) { hasBent = true; break; }
        if (!hasBent) continue;
      }
      let touched = false;
      for (let i = 0; i < c.active; i++) {
        const b = c.blades[i];
        let relevant = false;
        for (let k = 0; k < tramplers.length; k++) {
          const tr = tramplers[k];
          const dx = b.x - tr.x, dz = b.z - tr.z;
          if (dx * dx + dz * dz < (tr.r + 1.2) * (tr.r + 1.2)) { relevant = true; break; }
        }
        if (!relevant && !b.lx && !b.lz) continue;
        let px = 0, pz = 0;
        for (let k = 0; k < tramplers.length; k++) {
          const tr = tramplers[k];
          const dx = b.x - tr.x, dz = b.z - tr.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < tr.r * tr.r && d2 > 1e-6) {
            const d = Math.sqrt(d2), w = (1 - d / tr.r) * tr.push;
            px += (dx / d * 0.45 + rearX * 0.55) * w;
            pz += (dz / d * 0.45 + rearZ * 0.55) * w;
          }
        }
        const mag = Math.hypot(px, pz);
        let nx, nz;
        if (mag > 1e-3) { const k = mag > 0.95 ? 0.95 / mag : 1; nx = px * k; nz = pz * k; }
        else { nx = b.lx * decay; nz = b.lz * decay; }
        if (Math.abs(nx) < 0.004 && Math.abs(nz) < 0.004) { nx = 0; nz = 0; }
        if (nx !== b.lx || nz !== b.lz || !b.written) {
          b.lx = nx; b.lz = nz; b.written = true;
          c.mesh.setMatrixAt(i, this._matrixFor(b));
          touched = true; trampled++;
        }
      }
      if (touched) c.mesh.instanceMatrix.needsUpdate = true;
    }
    this.stats.trampled = trampled;
  }

  update(dt, horseX, horseZ, tramplers, rearX, rearZ) {
    this.time += dt;
    FA.grassUniforms.uTime.value = this.time;

    const cam = this._getCam();
    if (!cam) return;
    cam.updateMatrixWorld();
    this._proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._proj);
    cam.getWorldPosition(this._camPos);
    cam.getWorldDirection(this._camDir);
    const camX = this._camPos.x, camZ = this._camPos.z;
    const dirLen = Math.hypot(this._camDir.x, this._camDir.z) || 1;
    const dirX = this._camDir.x / dirLen, dirZ = this._camDir.z / dirLen;

    // --- streaming: hanya petak di depan kamera yang dimau ---
    const ci0 = Math.floor(camX / CHUNK), cj0 = Math.floor(camZ / CHUNK);
    const range = Math.ceil(RADIUS_MAX / CHUNK) + 1;
    this._queue.length = 0;
    for (let a = ci0 - range; a <= ci0 + range; a++) {
      for (let b = cj0 - range; b <= cj0 + range; b++) {
        const cx = (a + 0.5) * CHUNK, cz = (b + 0.5) * CHUNK;
        const dx = cx - camX, dz = cz - camZ;
        const d = Math.hypot(dx, dz);
        if (d > RADIUS_MAX) continue;
        if (d > CHUNK * 1.2) {
          const dot = (dx * dirX + dz * dirZ) / (d || 1);
          if (dot < 0.10) continue;          // di belakang / terlalu pinggir: jangan dimuat
        }
        const key = a + ':' + b;
        if (this.chunks.has(key)) continue;
        this._queue.push([a, b, d]);
      }
    }
    this._queue.sort((u, v) => u[2] - v[2]);
    for (let i = 0; i < Math.min(4, this._queue.length); i++) this._buildChunk(this._queue[i][0], this._queue[i][1]);

    // --- visibility + LOD per chunk (budget pertumbuhan dipakai bersama) ---
    let drawn = 0, blades = 0, growBudget = 1400;
    for (const [key, c] of this.chunks) {
      if (!c) continue;
      const dx = c.cx - camX, dz = c.cz - camZ;
      const d = Math.hypot(dx, dz);
      let vis = d < RADIUS_MAX + CHUNK * 0.6;
      if (vis && d > CHUNK * 1.1) {
        const dot = (dx * dirX + dz * dirZ) / (d || 1);
        if (dot < -0.12) vis = false;
        if (vis) vis = this._frustum.intersectsSphere(c.sphere);
      } else if (vis) {
        vis = d < NEAR || this._frustum.intersectsSphere(c.sphere);
      }
      if (!vis) { c.mesh.visible = false; continue; }
      const band = this._bandFor(d);
      const target = Math.max(1, Math.round(c.blades.length * this._bandShare(band)));
      if (target > c.active) {
        const add = Math.min(target - c.active, growBudget);
        if (add > 0) { this._growTo(c, c.active + add); growBudget -= add; }
      } else if (c.active > target && c._lastTarget === target) {
        c.active = target;      // mengecil: cukup turunkan count, data tetap disimpan
      }
      c._lastTarget = target;
      c.band = band;
      c.mesh.count = Math.min(c.active, target);
      c.mesh.visible = c.mesh.count > 0;
      drawn++; blades += c.mesh.count;
    }
    // lepas chunk yang sudah jauh di belakang
    for (const [key, c] of this.chunks) {
      if (!c) continue;
      if (Math.hypot(c.cx - camX, c.cz - camZ) > RADIUS_MAX * 1.7) {
        this.group.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.dispose();
        this.chunks.delete(key);
      }
    }
    this.stats.chunks = this.chunks.size;
    this.stats.drawn = drawn;
    this.stats.blades = blades;

    if (tramplers) this.applyTrample(tramplers, rearX, rearZ, dt);
  }

  bentCount() {
    let n = 0;
    for (const c of this.chunks.values()) {
      if (!c) continue;
      for (let i = 0; i < c.active; i++) if (Math.hypot(c.blades[i].lx, c.blades[i].lz) > 0.03) n++;
    }
    return n;
  }
}

HC.BladeGrass = BladeGrass;
