/* ============================================================================
   DEKORASI HUTAN — pohon pinus, pohon daun, semak, batu, dan air sungai
   Semua bentuk/tekstur/shader dari hutan_cozy_interaktif_3d.html (js/forest_assets.js).
   Ditempatkan sebagai INSTANCED mesh dengan jendela streaming mengikuti kuda, dan
   posisi dipilih dari hash koordinat — bukan Math.random — jadi peta tetap sama
   setiap load. Tidak ada yang masuk ke heightAt(): dekorasi murni visual.
   ============================================================================ */
import { HC } from './hc.js';
import * as FA from './forest_assets.js';

const THREE = HC.THREE;
const UP = new THREE.Vector3(0, 1, 0);

const PINE_VARIANTS = ['tall_alpine', 'broad_woodland', 'high_canopy', 'young_bushy'];
const COLOR_KEYS = ['emerald', 'olive', 'teal'];
const TREE_SIZE = 1.48;          // semua spesies, sekitar +48% dari baseline
const X_AHEAD = 320, X_BEHIND = 130;
const SIDE_MAX = 160;       // meter dari jalan: hutan boleh menutup sampai horizon
const CELL = 8;             // lebih rapat daripada sebelumnya
const MAX_TOTAL_TREES = 460;

// Deteksi renderer software: di situ jumlah pohon dijaga, culling tetap sama.
function _softGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    const s = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '';
    const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
    return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(s));
  } catch (e) { return false; }
}
const _QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const SOFT = (typeof document !== 'undefined') && !_QS.has('hq') && _softGL();
// Cap per template dipisah per spesies: pohon daun jadi mayoritas tegakan,
// jadi slotnya lebih banyak; cemara tetap punya jatah sendiri.
const PINE_CAP = SOFT ? 9 : 40;
const DEC_CAP = SOFT ? 40 : 150;
const BUSH_CAP = SOFT ? 90 : 420;
const ROCK_CAP = SOFT ? 60 : 260;

// Gabungkan hasil builder (yang berupa Group berisi beberapa Mesh) jadi satu
// BufferGeometry supaya bisa di-instance. Matriks lokal tiap mesh dipertahankan.
function mergeGroupGeometry(root, { skip = [], only = null } = {}) {
  const geos = [];
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (only && !only.includes(o)) return;
    if (skip.includes(o)) return;
    const g = o.geometry.clone();
    const m = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    g.applyMatrix4(m);
    // attribut custom hutan (aSocketPos/aBranchInfo) ikut terbawa clone; kalau
    // mesh lain tidak punya, buang supaya merge konsisten.
    geos.push(g);
  });
  if (!geos.length) return null;
  const keep = ['position', 'normal', 'uv', 'aSocketPos', 'aBranchInfo', 'aProjectedNormal', 'aBranchPhase'];
  let out = geos[0];
  if (geos.length > 1) {
    out = mergeGeometries(geos, keep);
  }
  out.computeBoundingSphere();
  return out;
}

function mergeGeometries(list, keep) {
  let vTotal = 0, iTotal = 0;
  const have = keep.filter((k) => list.every((g) => g.attributes[k]));
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  for (const name of have) {
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(vTotal * size);
    let off = 0;
    for (const g of list) {
      arr.set(g.attributes[name].array, off);
      off += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const idx = new Uint32Array(iTotal);
  let io = 0, vo = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo;
    } else {
      for (let i = 0; i < n; i++) idx[io++] = i + vo;
    }
    vo += n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export class ForestDecor {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'hutan-forest-decor';
    scene.add(this.group);
    this.time = 0;
    this.stats = { trees: 0, bushes: 0, rocks: 0, drawCalls: 0 };
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();

    FA.setTerrainHeightSampler((x, z) => world.meshSurfaceY(x, z));
    this._buildTemplates();
    this._buildWater();
    this.sync(world.terrain.cx);
  }

  // ---------------- template: dibangun sekali, lalu di-instance ----------------
  _buildTemplates() {
    this.templates = [];
    let seed = 7;
    for (const variant of PINE_VARIANTS) {
      for (const key of ['emerald', 'olive']) {
        FA.setForestSeed(seed++);
        const g = FA.createStylizedPineTree(0, 0, 1, variant, key);
        const t = this._templateFromTree(g, FA.pineMaterials[key], FA.pineDepthMaterials[key], `pine-${variant}-${key}`);
        if (t) this.templates.push(t);
      }
    }
    for (const key of COLOR_KEYS) {
      FA.setForestSeed(seed++);
      const g = FA.createBotWDeciduousTree(0, 0, 1, key);
      const t = this._templateFromTree(g, FA.deciduousMaterials[key], FA.deciduousDepthMaterials[key], `broad-${key}`);
      if (t) this.templates.push(t);
    }
    // Semak: gabung 18 kartu daun + berry jadi satu geometri.
    FA.setForestSeed(seed++);
    const bushGroup = FA.createBotWBush(0, 0, 1, true);
    this.bushGeo = mergeGroupGeometry(bushGroup);
    this.bushMat = FA.bushLeafMat;
    FA.setForestSeed(seed++);
    const bushPlain = FA.createBotWBush(0, 0, 1.1, false);
    this.bushGeoPlain = mergeGroupGeometry(bushPlain);

    // Batu hutan: dodecahedron bertumpuk, satu geometri.
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    rockGeo.scale(1.25, 0.78, 1.1);
    this.rockGeo = rockGeo;
    this.rockMat = FA.rockMat;
  }

  _templateFromTree(group, foliageMat, foliageDepthMat, name) {
    const canopy = group.children.find((c) => c.isGroup) || group;
    const meshes = [];
    canopy.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (meshes.length < 2) return null;
    // builder hutan: [0] trunk (castShadow), [1] foliage
    const trunkMesh = meshes[0], foliageMesh = meshes[1];
    const rootInv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const toLocal = (m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
      g.computeBoundingSphere();
      return g;
    };
    return {
      name,
      trunkGeo: toLocal(trunkMesh),
      foliageGeo: toLocal(foliageMesh),
      foliageMat, foliageDepthMat,
      trunkMat: FA.trunkMat,
      height: (group.userData && group.userData.boundingSphere && group.userData.boundingSphere.radius) || 4,
    };
  }

  _makePool(tpl) {
    const cap = tpl.name.startsWith('broad-') ? DEC_CAP : PINE_CAP;
    const trunk = new THREE.InstancedMesh(tpl.trunkGeo, tpl.trunkMat, cap);
    const foliage = new THREE.InstancedMesh(tpl.foliageGeo, tpl.foliageMat, cap);
    foliage.customDepthMaterial = tpl.foliageDepthMat;
    trunk.castShadow = true; trunk.receiveShadow = true;
    foliage.castShadow = true; foliage.receiveShadow = true;
    trunk.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    foliage.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trunk.count = 0; foliage.count = 0;
    // Diculll sendiri berdasarkan frustum kamera terhadap AABB instance yang
    // benar-benar terisi (jadi pohon jauh tetap terlihat kalau kamera menoleh).
    trunk.frustumCulled = false; foliage.frustumCulled = false;
    trunk.name = tpl.name + '-trunk';
    foliage.name = tpl.name + '-foliage';
    this.group.add(trunk); this.group.add(foliage);
    return { tpl, trunk, foliage, cap, used: 0,
             sphere: new THREE.Sphere(new THREE.Vector3(), 1),
             vis: { trunk: true, foliage: true } };
  }

  // ---------------- penempatan deterministik dari peta ----------------
  _siteBlocked(x, z) {
    const MAP = HC.MAP;
    for (const s of MAP.sites) {
      const r = (s.radius || 6) + 3.5;
      if ((x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) < r * r) return true;
    }
    return false;
  }

  _okSpot(x, z, minRoad) {
    const MAP = HC.MAP;
    if (x < MAP.bounds.xMin + 4 || x > MAP.bounds.xMax - 4) return false;
    if (Math.abs(z - MAP.roadCenterZ(x)) < minRoad) return false;
    if (this.world.riverDistX(x, z) < 15.0) return false;
    if (this._siteBlocked(x, z)) return false;
    for (const r of this.world.rockSlots) {
      if (r.big && (x - r.x) * (x - r.x) + (z - r.z) * (z - r.z) < 9) return false;
    }
    return true;
  }

  sync(centerX) {
    if (this._lastCx === centerX) return;
    this._lastCx = centerX;
    const MAP = HC.MAP;
    const c0 = Math.floor((centerX - X_BEHIND) / CELL);
    const c1 = Math.ceil((centerX + X_AHEAD) / CELL);
    const bandCount = Math.ceil(SIDE_MAX / CELL);

    if (!this.pools) this.pools = this.templates.map((t) => this._makePool(t));
    for (const p of this.pools) p.used = 0;

    // Kandidat: deterministik per sel. Prioritas = paling dekat jalan dulu, jadi
    // koridor hutan di tepi jalan selalu penuh walau budget terbatas.
    const want = [];
    for (let ci = c0; ci <= c1; ci++) {
      for (let s = -bandCount; s <= bandCount; s++) {
        if (s === 0) continue;
        const h = (a) => MAP.hashRand(ci * 8191 + s * 61 + a * 733, 997 + a * 41);
        const roll = h(1);
        if (roll > 0.55) continue;
        const x = ci * CELL + (h(2) - 0.5) * CELL * 0.9;
        const side = s > 0 ? 1 : -1;
        const off = Math.abs(s) * CELL + (h(3) - 0.5) * CELL * 0.7;
        const z = MAP.roadCenterZ(x) + side * off;
        if (!this._okSpot(x, z, 5.0 + h(4) * 3.0)) continue;
        const kind = roll < 0.34 ? 'tree' : roll < 0.50 ? 'bush' : 'rock';
        // Distribusi spesies: tegakan campuran; pohon daun jadi mayoritas, tapi
        // cemara tetap hadir sebagai aksen. Stabil per sel, bukan Math.random.
        const deciduous = h(11) < 0.68;
        const canopy = h(12);
        const firstIdx = deciduous ? 8 : 0;
        const templateBias = firstIdx + canopy * (deciduous ? 3 : 8);
        // pohon makin jauh makin jarang: roll tambahan biar tidak jadi tembok
        if (kind === 'tree' && Math.abs(s) > 4 && h(10) > 0.55) continue;
        want.push({ kind, x, z, h, prio: Math.abs(s) * 100 + Math.abs(x - centerX), firstIdx, templateBias,
                    scale: TREE_SIZE * (0.92 + h(5) * 0.34), yaw: h(6) * Math.PI * 2 });
      }
    }
    want.sort((a, b) => a.prio - b.prio);

    if (!this.bushPool) {
      this.bushPool = new THREE.InstancedMesh(this.bushGeo, this.bushMat, BUSH_CAP);
      this.bushPool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.bushPool.frustumCulled = false;
      this.bushPool.castShadow = true;
      this.bushPool.name = 'hutan-bush';
      this.group.add(this.bushPool);
      this.rockPool = new THREE.InstancedMesh(this.rockGeo, this.rockMat, ROCK_CAP);
      this.rockPool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.rockPool.frustumCulled = false;
      this.rockPool.castShadow = true; this.rockPool.receiveShadow = true;
      this.rockPool.name = 'hutan-rock';
      this.group.add(this.rockPool);
    }
    this.bushPool.count = 0; this.rockPool.count = 0;

    this.placed = [];
    let treesUsed = 0;
    const acc = this.pools.map(() => ({ n: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }));
    for (const w of want) {
      const y = this.world.meshSurfaceY(w.x, w.z);
      this._p.set(w.x, y, w.z);
      this._q.setFromAxisAngle(UP, w.yaw);
      if (w.kind === 'tree') {
        if (treesUsed >= (SOFT ? 160 : MAX_TOTAL_TREES)) continue;
        // Pilih template sesuai komposisi spesies; kalau pool pilihannya penuh,
        // jatuh ke template lain dari spesies yang sama dulu sebelum menyerah,
        // supaya cap tidak diam-diam memangkas jumlah pohon.
        const span = w.firstIdx === 8 ? 3 : 8;
        const start = Math.min(this.pools.length - 1, Math.floor(w.templateBias + w.h(7) * 0.9));
        let idx = -1;
        for (let k = 0; k < span; k++) {
          const cand = w.firstIdx + ((start - w.firstIdx + k + span) % span);
          const cp = this.pools[cand];
          if (cp && cp.used < cp.cap) { idx = cand; break; }
        }
        if (idx < 0) continue;
        const pool = this.pools[idx];
        this._s.set(w.scale, w.scale * (0.94 + w.h(8) * 0.16), w.scale);
        this._m.compose(this._p, this._q, this._s);
        pool.trunk.setMatrixAt(pool.used, this._m);
        pool.foliage.setMatrixAt(pool.used, this._m);
        const a = acc[idx];
        a.n++;
        if (w.x < a.minX) a.minX = w.x; if (w.x > a.maxX) a.maxX = w.x;
        if (w.z < a.minZ) a.minZ = w.z; if (w.z > a.maxZ) a.maxZ = w.z;
        if (y < a.minY) a.minY = y; if (y > a.maxY) a.maxY = y;
        this.placed.push({ kind: 'tree', tpl: pool.tpl.name, x: w.x, z: w.z, s: w.scale });
        pool.used++; treesUsed++;
        this.stats.trees++;
      } else if (w.kind === 'bush') {
        if (this.bushPool.count >= BUSH_CAP) continue;
        this._s.set(w.scale, w.scale, w.scale);
        this._m.compose(this._p, this._q, this._s);
        this.bushPool.setMatrixAt(this.bushPool.count++, this._m);
      } else {
        if (this.rockPool.count >= ROCK_CAP) continue;
        this._s.set(w.scale, w.scale * 0.8, w.scale);
        this._q.setFromAxisAngle(UP, w.h(9) * Math.PI);
        this._m.compose(this._p, this._q, this._s);
        this.rockPool.setMatrixAt(this.rockPool.count++, this._m);
      }
    }
    for (let i = 0; i < this.pools.length; i++) {
      const p = this.pools[i], a = acc[i];
      p.trunk.count = p.used; p.foliage.count = p.used;
      p.trunk.instanceMatrix.needsUpdate = true; p.foliage.instanceMatrix.needsUpdate = true;
      if (a.n) {
        // Margin ikut TREE_SIZE: pohon besar butuh bola culling lebih longgar,
        // kalau tidak kanopi terpotong pop saat kamera menoleh.
        const mg = 6 * TREE_SIZE, mr = 12 * TREE_SIZE;
        p.sphere.center.set((a.minX + a.maxX) / 2, (a.minY + a.maxY) / 2 + mg, (a.minZ + a.maxZ) / 2);
        p.sphere.radius = Math.max(mr, Math.hypot(a.maxX - a.minX, a.maxZ - a.minZ) / 2 + mr);
      } else { p.sphere.radius = 0; }
    }
    this.bushPool.instanceMatrix.needsUpdate = true;
    this.rockPool.instanceMatrix.needsUpdate = true;
    this._sphereOf(this.bushPool, this.bushSphere || (this.bushSphere = new THREE.Sphere()));
    this._sphereOf(this.rockPool, this.rockSphere || (this.rockSphere = new THREE.Sphere()));
    this.stats.bushes = this.bushPool.count;
    this.stats.rocks = this.rockPool.count;
  }

  _getCam() {
    if (typeof window === 'undefined') return null;
    const r = window.RIG;
    const cam = r && r.camera;
    return (cam && cam.isCamera) ? cam : null;
  }

  // Bola pembungkus kasar untuk instance yang terisi (untuk culling frustum).
  _sphereOf(mesh, out) {
    const n = mesh.count;
    if (!n) { out.radius = 0; return out; }
    mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere.radius;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const m = this._m;
    for (let i = 0; i < n; i++) {
      mesh.getMatrixAt(i, m);
      const e = m.elements;
      const x = e[12], y = e[13], z = e[14];
      const s = Math.max(Math.abs(e[0]), Math.abs(e[5]), Math.abs(e[10]));
      const rr = r * s;
      if (x - rr < minX) minX = x - rr; if (x + rr > maxX) maxX = x + rr;
      if (y - rr < minY) minY = y - rr; if (y + rr > maxY) maxY = y + rr;
      if (z - rr < minZ) minZ = z - rr; if (z + rr > maxZ) maxZ = z + rr;
    }
    out.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    out.radius = 0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
    return out;
  }

  // ---------------- air: shader hutan, geometri sungai SHOD ----------------
  _buildWater() {
    this.waterDataTex = FA.createBotWWaterDataTexture();
  }

  // Dipanggil world._makeRiverMaterial(): material air gaya hutan di atas
  // geometri ford SHOD (atribut aFlowUv & aDepth tetap dipakai).
  makeWaterMaterial(timeUniform) {
    const tex = this.waterDataTex;
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, depthWrite: false,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRiverTime = timeUniform;
      sh.uniforms.uWaterData = { value: tex };
      sh.vertexShader = 'attribute float aDepth;\nattribute vec2 aFlowUv;\nvarying float vDepth;\nvarying vec2 vRiverUv;\nvarying vec3 vWorldPos;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vDepth=aDepth; vRiverUv=aFlowUv; vWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = 'uniform float uRiverTime;\nuniform sampler2D uWaterData;\nvarying float vDepth;\nvarying vec2 vRiverUv;\nvarying vec3 vWorldPos;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float t = uRiverTime;
          // dua lapis normal bergulir: interference ala BotW
          vec2 uv1 = vWorldPos.xz * 0.22 + vec2(t * 0.045, t * 0.030);
          vec2 uv2 = vWorldPos.xz * 0.33 - vec2(t * 0.036, -t * 0.041);
          vec4 s1 = texture2D(uWaterData, uv1);
          vec4 s2 = texture2D(uWaterData, uv2);
          vec2 nXY = ((s1.rg * 2.0 - 1.0) + (s2.rg * 2.0 - 1.0)) * 0.18;

          float depthNorm = clamp(vDepth / 1.05, 0.0, 1.0);
          // vRiverUv.x = 0..1 melintang sungai → 0.5 di tengah, 0/1 di tepi.
          float edge = abs(vRiverUv.x * 2.0 - 1.0);
          vec3 shallowC = vec3(0.56, 0.93, 0.84);
          vec3 midC = vec3(0.20, 0.72, 0.78);
          vec3 deepC = vec3(0.10, 0.46, 0.62);
          vec3 waterC = mix(shallowC, midC, smoothstep(0.02, 0.35, depthNorm));
          waterC = mix(waterC, deepC, smoothstep(0.55, 1.0, depthNorm));
          // jangan pernah jatuh ke hitam: dasar laut dangkal tetap kebiruan
          waterC = mix(waterC, vec3(0.16, 0.52, 0.60), 0.18);

          // caustic tipis dari kanal biru tekstur data
          float caust = texture2D(uWaterData, vWorldPos.xz * 0.30 + vec2(t * 0.05, -t * 0.04)).b;
          waterC += vec3(0.06, 0.10, 0.09) * caust;

          // kilau matahari (setengah-vektor tetap, arah key light scene)
          vec3 N = normalize(vec3(nXY.x, 1.0, nXY.y));
          vec3 L = normalize(vec3(0.42, 0.86, 0.42));
          vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
          float spec = pow(max(dot(N, Hv), 0.0), 42.0) * 0.55;
          waterC += vec3(spec);

          // busa di tepi sungai: edge → 1 di tepi, vDepth → 0 di tepi.
          float foam = smoothstep(0.80, 0.97, edge) * 0.55
                     + (1.0 - smoothstep(0.02, 0.10, vDepth)) * 0.25;
          waterC = mix(waterC, vec3(0.94, 0.99, 0.98), clamp(foam, 0.0, 0.75));

          diffuseColor.rgb = waterC;
          diffuseColor.a = mix(0.88, 0.97, depthNorm);`);
    };
    return mat;
  }

  update(dt) {
    this.time += dt;
    FA.celShaderUniforms.uTime.value = this.time;
    // Culling kamera per template: yang di belakang kamera tidak disubmit ke GPU.
    const cam = this._getCam();
    if (!cam || !this.pools) return;
    cam.updateMatrixWorld();
    const fr = this._frustum || (this._frustum = new THREE.Frustum());
    const pm = this._pm || (this._pm = new THREE.Matrix4());
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    fr.setFromProjectionMatrix(pm);
    let calls = 0;
    for (const p of this.pools) {
      const vis = p.used > 0 && p.sphere.radius > 0 && fr.intersectsSphere(p.sphere);
      p.trunk.visible = vis; p.foliage.visible = vis;
      if (vis) calls += 2;
    }
    for (const [mesh, sph] of [[this.bushPool, this.bushSphere], [this.rockPool, this.rockSphere]]) {
      if (!mesh) continue;
      const vis = mesh.count > 0 && sph && sph.radius > 0 && fr.intersectsSphere(sph);
      mesh.visible = vis;
      if (vis) calls++;
    }
    this.stats.drawCalls = calls;
  }
}

HC.ForestDecor = ForestDecor;
