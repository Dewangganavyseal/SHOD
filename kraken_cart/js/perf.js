/* ============================================================================
   PERF — preset kualitas bertingkat + penggabung mesh NPC (buat HP kentang)
   ----------------------------------------------------------------------------
   Kenapa file ini ada: adegan hutan menaruh ±1.150 mesh di 18 NPC Sylvan, dan
   hampir setiap mesh punya material sendiri. Di HP kelas bawah yang bikin
   patah-patah itu BIAYA DRAW CALL, bukan jumlah triangle (triangle cuma ~210k,
   draw call-nya 1.500+).

   Isi modul:
   1. QUALITY_PRESETS  : potato / medium / high — dipilih otomatis dari
                         perangkat, bisa dipaksa lewat ?quality= atau tombol HUD,
                         pilihan user disimpan di localStorage.
   2. mergeAnimatedClusters() : gabung mesh yang TIDAK dianimasi menjadi satu
                         mesh per simpul animasi. Tulang yang berputar dibiarkan
                         utuh (jadi jalan/pose tetap hidup), mesh aslinya cuma
                         di-hide supaya bisa dibalikin tanpa rebuild model.
   ========================================================================= */

export const QUALITY_PRESETS = {
  potato: {
    key: 'potato',
    label: 'Kentang',
    icon: '🥔',
    pixelRatioCap: 1.0,
    renderScale: 1.0,
    antialias: false,
    preserveDrawingBuffer: false,
    shadows: false,
    shadowMapSize: 512,
    cullDistance: 30.0,
    grassRatio: 0.30,
    npcLod: true,
    npcLodNear: 7,
    npcCull: 34,
    treeLod: 45,
    treeFar: 95,
    hint: 'HP kelas bawah: bayangan mati, resolusi tetap 100%, rumput 30%, pohon >45 m jadi versi low-detail (bukan billboard)'
  },
  medium: {
    key: 'medium',
    label: 'Menengah',
    icon: '📱',
    pixelRatioCap: 1.25,
    renderScale: 1.0,
    antialias: false,
    preserveDrawingBuffer: true,
    // 'static' = peta bayangan diperbarui tiap 5 frame, bukan tiap frame.
    shadows: 'static',
    shadowMapSize: 1024,
    cullDistance: 52.0,
    grassRatio: 0.62,
    npcLod: true,
    npcLodNear: 13,
    npcCull: 48,
    treeLod: 60,
    treeFar: 115,
    hint: 'HP menengah: bayangan diperbarui berkala, rumput 62%, pohon >60 m versi low-detail'
  },
  high: {
    key: 'high',
    label: 'Ultra',
    icon: '🖥️',
    pixelRatioCap: 2.0,
    renderScale: 1.0,
    antialias: true,
    preserveDrawingBuffer: true,
    shadows: 'full',
    shadowMapSize: 2048,
    cullDistance: 84.0,
    grassRatio: 1.0,
    npcLod: false,
    npcLodNear: 0,
    npcCull: 0,
    treeLod: 80,
    treeFar: 135,
    hint: 'PC/HP kencang: semua detail dekat, pohon >80 m versi low-detail, NPC utuh, bayangan penuh'
  }
};

export const QUALITY_ORDER = ['potato', 'medium', 'high'];
const STORAGE_KEY = 'shod.quality';

function readStoredKey() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return QUALITY_PRESETS[v] ? v : null;
  } catch (e) {
    return null; // localStorage bisa diblokir (mode privat / file://)
  }
}

function readUrlKey() {
  try {
    const v = new URLSearchParams(location.search).get('quality');
    return QUALITY_PRESETS[v] ? v : null;
  } catch (e) {
    return null;
  }
}

/* Skor perangkat. Sengaja konservatif: lebih baik mulai di 'medium' lalu user
   naikkan sendiri daripada mengklaim "lancar" di HP yang ternyata kentang. */
export function detectQualityKey() {
  if (typeof navigator === 'undefined') return 'high';
  const nav = navigator;
  const ua = nav.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const coarse = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    || (nav.maxTouchPoints || 0) > 0;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || (mobileUA ? 3 : 8);
  if (!mobileUA && !coarse) return 'high';         // desktop: full detail
  if (cores <= 4 || mem <= 2) return 'potato';     // 4 core / 2 GB ke bawah
  if (cores <= 6 || mem <= 3) return 'potato';
  return 'medium';
}

/* Urutan prioritas: ?quality= di URL > pilihan tersimpan > deteksi otomatis. */
export function resolveQuality() {
  const urlKey = readUrlKey();
  const storedKey = readStoredKey();
  const key = urlKey || storedKey || detectQualityKey();
  const preset = QUALITY_PRESETS[key] || QUALITY_PRESETS.medium;
  return { ...preset, auto: !urlKey && !storedKey };
}

export function saveQualityKey(key) {
  try { if (QUALITY_PRESETS[key]) localStorage.setItem(STORAGE_KEY, key); } catch (e) { /* abaikan */ }
}

/* ---------------------------------------------------------------------------
   MERGE MESH NPC
   --------------------------------------------------------------------------- */

const KEEP_NAME = /tool|weapon|pick|hoe|axe|sickle|hammer|basket|lantern|torch|book|staff|bow|shield|sword|spear|cloth|cape|bolt|fire|flame|glow|fx|effect|smoke|dust/i;

function collectProtected(ref) {
  const prot = new Set();
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || depth > 5) return;
    if (v.isObject3D) { prot.add(v.uuid); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    for (const k in v) {
      if (k === 'role' || k === 'root') continue;
      walk(v[k], depth + 1);
    }
  };
  walk(ref, 0);
  return prot;
}

function meshIsMergeable(mesh, prot) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return false;
  if (mesh.visible === false) return false;
  if (prot && (prot.has(mesh.uuid) || (mesh.parent && prot.has(mesh.parent.uuid)))) return false;
  if (mesh.name && KEEP_NAME.test(mesh.name)) return false;
  if (mesh.userData && (mesh.userData.perfProtect || mesh.userData.type)) return false;
  if (mesh.renderOrder) return false;
  const m = mesh.material;
  if (!m || Array.isArray(m)) return false;
  if (!m.isMeshLambertMaterial) return false;      // model Sylvan pakai Lambert polos
  if (m.map || m.alphaMap || m.transparent || (m.opacity !== undefined && m.opacity < 1)) return false;
  if (m.emissive && (m.emissive.r > 0.002 || m.emissive.g > 0.002 || m.emissive.b > 0.002)) return false;
  const g = mesh.geometry;
  if (!g || !g.attributes || !g.attributes.position) return false;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false;
  return true;
}

/* Deteksi simpul yang berubah posisi/rotasi saat model dianimasikan.
   Deteksi runtime dipakai karena tiap model Sylvan punya daftar tulang sendiri;
   daftar nama hard-code akan salah untuk model yang belum dibaca. */
function markAnimatedNodes(root, animateFn, iterations) {
  const nodes = [];
  root.traverse((o) => { if (o.isMesh || o.isGroup) nodes.push(o); });
  for (const o of nodes) {
    o.updateMatrix();
    o.__perfSnap = o.matrix.clone();
  }
  for (let i = 0; i < iterations; i++) {
    try { animateFn(root); } catch (e) { break; }
  }
  const animated = new Set();
  for (const o of nodes) {
    o.updateMatrix();
    const a = o.matrix.elements, b = o.__perfSnap.elements;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-6) { animated.add(o); break; }
    }
    delete o.__perfSnap;
  }
  return animated;
}

function mergeMeshGroup(parent, meshes, THREE) {
  const anyCast = meshes.some((m) => m.castShadow);
  const anyRecv = meshes.some((m) => m.receiveShadow);
  const side = meshes[0].material.side;
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();

  const prepared = [];
  let total = 0;
  for (const mesh of meshes) {
    const src = mesh.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    g.applyMatrix4(rel);
    const count = g.attributes.position.count;
    prepared.push({ g, mesh, count });
    total += count;
  }
  if (!total) return null;

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const tint = new THREE.Color();
  let offset = 0;
  for (const { g, mesh, count } of prepared) {
    const p = g.attributes.position.array;
    pos.set(p.length === count * 3 ? p : p.subarray(0, count * 3), offset * 3);
    if (g.attributes.normal) {
      nor.set(g.attributes.normal.array.subarray(0, count * 3), offset * 3);
    }
    const mat = mesh.material;
    const vc = mat.vertexColors && g.attributes.color;
    tint.copy(mat.color || new THREE.Color(0xffffff));
    for (let i = 0; i < count; i++) {
      if (vc) {
        col[(offset + i) * 3] = g.attributes.color.array[i * 3] * tint.r;
        col[(offset + i) * 3 + 1] = g.attributes.color.array[i * 3 + 1] * tint.g;
        col[(offset + i) * 3 + 2] = g.attributes.color.array[i * 3 + 2] * tint.b;
      } else {
        col[(offset + i) * 3] = tint.r;
        col[(offset + i) * 3 + 1] = tint.g;
        col[(offset + i) * 3 + 2] = tint.b;
      }
    }
    offset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  const out = new THREE.Mesh(merged, material);
  out.name = 'perf-merge';
  out.castShadow = anyCast;
  out.receiveShadow = anyRecv;
  out.userData.perfMerged = true;
  return out;
}

/* Merge mesh statis per simpul animasi. Hasil: mesh asli di-hide (bukan dibuang)
   supaya unmergeAnimatedClusters() bisa mengembalikan tampilan penuh. */
export function mergeAnimatedClusters(root, opts = {}) {
  const THREE = opts.THREE;
  if (!root || !THREE) return { ok: false, reason: 'no-root' };
  if (root.userData && root.userData.__perfMerge) return { ok: true, cached: true, ...root.userData.__perfMerge.stats };

  const animate = typeof opts.animate === 'function' ? opts.animate : null;
  const iterations = opts.iterations || 10;
  const animated = animate ? markAnimatedNodes(root, animate, iterations) : new Set();

  const state = root.userData && root.userData.npc;
  const prot = new Set([...collectProtected(state)]);
  if (typeof opts.protect === 'function') {
    root.traverse((o) => { if (opts.protect(o)) prot.add(o.uuid); });
  }

  root.updateMatrixWorld(true);

  // Bucket: mesh -> simpul animasi terdekat (atau root bila tak ada).
  const buckets = new Map();
  let candidates = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    candidates++;
    if (!meshIsMergeable(o, prot)) return;
    let anchor = o.parent;
    while (anchor && anchor !== root && !animated.has(anchor)) anchor = anchor.parent;
    const node = anchor || root;
    const key = node.uuid + '|' + o.material.side;
    if (!buckets.has(key)) buckets.set(key, { node, meshes: [] });
    buckets.get(key).meshes.push(o);
  });

  const created = [];
  const hidden = [];
  for (const { node, meshes } of buckets.values()) {
    if (meshes.length < 2) continue;
    const merged = mergeMeshGroup(node, meshes, THREE);
    if (!merged) continue;
    node.add(merged);
    for (const m of meshes) { m.visible = false; hidden.push(m); }
    created.push(merged);
  }

  const stats = { candidates, merged: created.length, hidden: hidden.length, savedCalls: hidden.length - created.length };
  if (root.userData) root.userData.__perfMerge = { created, hidden, stats };
  return { ok: true, ...stats };
}

export function unmergeAnimatedClusters(root) {
  const rec = root && root.userData && root.userData.__perfMerge;
  if (!rec) return { ok: false };
  for (const m of rec.hidden) m.visible = true;
  for (const m of rec.created) {
    if (m.parent) m.parent.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  root.userData.__perfMerge = null;
  return { ok: true, restored: rec.hidden.length };
}

/* Culling NPC jauh: hemat draw call saat kuda jalan menjauh dari kamp. */
export function cullDistantNpcs(items, x, z, maxDist) {
  if (!maxDist || !items) return 0;
  let hidden = 0;
  for (const it of items) {
    const root = it && it.root;
    if (!root) continue;
    const d = Math.hypot((it.x || 0) - x, (it.z || 0) - z);
    const far = d > maxDist;
    if (root.visible === far) root.visible = !far;
    if (far) hidden++;
  }
  return hidden;
}

/* ============================================================================
   LOD STATIS NPC ("bake")
   ----------------------------------------------------------------------------
   Kenapa: 18 warga Sylvan = 1.163 mesh dari total 2.129 mesh di scene. Itu
   1.163 draw call tiap frame — biang lag di HP kelas bawah. Merge per simpul
   animasi cuma menyelamatkan ~6% karena hampir semua tulang berputar.

   Solusinya LOD: satu warga di-bake jadi 1-2 mesh statis (vertex color) di
   ruang root-nya. Warga yang jauh pakai hasil bake (1 draw call), warga dekat
   (radius npcLodNear) balik ke model penuh yang beranimasi. Pose ikut membeku
   saat jauh — trade-off sadar, dan tidak terlihat dari jarak segitu.
   ============================================================================ */

// Mesh yang sengaja TIDAK di-bake: efek menyala / transparan / lampu.
const LOD_SKIP = /fx|effect|glow|flame|fire|smoke|dust|spark|trail|bolt|aura|particle|light|beam/i;

function bakeStaticGeometry(root, meshes, THREE, side, inv) {
  const prepared = [];
  let total = 0;
  const tmp = new THREE.Matrix4();
  for (const mesh of meshes) {
    const src = mesh.geometry;
    let g = src.index ? src.toNonIndexed() : src.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    tmp.multiplyMatrices(inv, mesh.matrixWorld);
    g.applyMatrix4(tmp);
    const count = g.attributes.position.count;
    if (!count) { g.dispose(); continue; }
    prepared.push({ g, mesh, count });
    total += count;
  }
  if (!total || !prepared.length) return null;

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const tint = new THREE.Color();
  let offset = 0;
  for (const { g, mesh, count } of prepared) {
    const p = g.attributes.position.array;
    pos.set(p.length === count * 3 ? p : p.subarray(0, count * 3), offset * 3);
    const n = g.attributes.normal.array;
    nor.set(n.length === count * 3 ? n : n.subarray(0, count * 3), offset * 3);
    const mat = mesh.material;
    const vc = (mat.vertexColors && g.attributes.color) ? g.attributes.color.array : null;
    tint.copy(mat.color || new THREE.Color(0xffffff));
    for (let i = 0; i < count; i++) {
      if (vc) {
        col[(offset + i) * 3] = vc[i * 3] * tint.r;
        col[(offset + i) * 3 + 1] = vc[i * 3 + 1] * tint.g;
        col[(offset + i) * 3 + 2] = vc[i * 3 + 2] * tint.b;
      } else {
        col[(offset + i) * 3] = tint.r;
        col[(offset + i) * 3 + 1] = tint.g;
        col[(offset + i) * 3 + 2] = tint.b;
      }
    }
    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  const out = new THREE.Mesh(merged, material);
  out.name = 'npc-lod';
  out.castShadow = false;      // LOD nggak ikut bayangan: itu inti penghematannya
  out.receiveShadow = false;
  out.visible = false;
  out.userData.npcLodMesh = true;
  return { mesh: out, verts: total };
}

/* Bake satu root NPC. Aman dipanggil sekali; panggilan kedua balik cache. */
export function bakeNpcLod(root, THREE) {
  if (!root || !THREE) return { ok: false, reason: 'no-root' };
  const prev = root.userData && root.userData.__npcLod;
  if (prev) return { ok: true, cached: true, ...prev.stats };

  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (!o.visible) return;
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (m.transparent && (m.opacity === undefined || m.opacity < 0.9)) return;
    if (o.name && LOD_SKIP.test(o.name)) return;
    if (o.userData && o.userData.npcLodKeep) return;
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    const side = m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide;
    const key = side === THREE.DoubleSide ? 'double' : 'front';
    if (!buckets.has(key)) buckets.set(key, { side, list: [] });
    buckets.get(key).list.push(o);
  });

  const lods = [];
  const orig = [];
  for (const { side, list } of buckets.values()) {
    const baked = bakeStaticGeometry(root, list, THREE, side, inv);
    if (!baked) continue;
    root.add(baked.mesh);
    lods.push(baked.mesh);
    for (const m of list) orig.push(m);
  }

  const stats = { meshes: orig.length, lods: lods.length };
  root.userData.__npcLod = { lod: lods, orig, on: false, stats };
  return { ok: true, ...stats };
}

/* Tukar tampilan: true = pakai hasil bake (jauh), false = model penuh (dekat). */
export function setNpcLod(root, useLod) {
  const rec = root && root.userData && root.userData.__npcLod;
  if (!rec) return false;
  const want = !!useLod;
  if (rec.on === want) return want;
  rec.on = want;
  for (const m of rec.orig) m.visible = !want;
  for (const l of rec.lod) l.visible = want;
  return want;
}

/* Update LOD semua warga liar tiap beberapa frame (bukan tiap frame). */
export function updateNpcLod(items, x, z, nearDist) {
  if (!items || !nearDist) return 0;
  let count = 0;
  for (const it of items) {
    const root = it && it.root;
    if (!root || !root.parent) continue;      // sudah direkrut: bukan lagi di dunia
    if (!root.userData || !root.userData.__npcLod) continue;
    const d = Math.hypot((it.x || 0) - x, (it.z || 0) - z);
    if (setNpcLod(root, d > nearDist)) count++;
  }
  return count;
}

