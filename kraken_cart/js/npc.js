import { HC } from './hc.js';
import './voxel.js';
import './sylvan/models.js';

const THREE = HC.THREE, S = HC.vs;

/* ============================================================================
   ROSTER — disalin apa adanya dari sylvandominion.web.id/js/config.js
   (`NPC_ROLES`, build v0.2.169): nama, emoji, warna jubah/hood, HP, damage,
   kecepatan, dan skill pasif tiap arketipe. `recruitable` = `recruit` di sana.
   ============================================================================ */
HC.NPC_ROLES = [
  { id:'guard', name:'Penjaga Desa', e:'🛡️', recruitable:false, robe:0xa8552f, hood:0x3c4a68,
    hp:120, dmg:11, speed:3.2,
    skill:{ id:'bulwark', name:'Benteng Desa', e:'🛡️', desc:'Damage yang diterima -20%' } },
  { id:'hunter', name:'Pemburu', e:'🏹', recruitable:true, robe:0x4f6b34, hood:0x2f4020,
    hp:105, dmg:16, speed:3.9,
    skill:{ id:'keen', name:'Mata Pemburu', e:'🎯', desc:'+25% damage & jangkauan serang lebih jauh' } },
  { id:'miner', name:'Penambang', e:'⛏️', recruitable:true, robe:0x6b5a3a, hood:0x4a3c26,
    hp:130, dmg:12, speed:3.0,
    skill:{ id:'digger', name:'Tangan Tambang', e:'⛏️', desc:'Menambang 2× lebih cepat & sesekali dapat bahan ekstra' } },
  { id:'farmer', name:'Petani', e:'🌾', recruitable:true, robe:0x6a8f3f, hood:0x465f2a,
    hp:100, dmg:8, speed:3.1,
    skill:{ id:'green', name:'Tangan Hijau', e:'🌾', desc:'Farming lebih cepat & hasil panen +1' } },
  { id:'herbal', name:'Tabib Desa', e:'⚗️', recruitable:true, robe:0x7a4f7d, hood:0x4d3050,
    hp:95, dmg:9, speed:3.4,
    skill:{ id:'mend', name:'Tangan Penyembuh', e:'💚', desc:'Memulihkan 1.5 HP/detik ke pemain di dekatnya' } },
  { id:'warrior', name:'Petarung', e:'⚔️', recruitable:true, robe:0x8f3b3b, hood:0x5a2323,
    hp:150, dmg:20, speed:3.3,
    skill:{ id:'taunt', name:'Tameng Hidup', e:'😤', desc:'Menarik perhatian monster supaya menyerang dirinya' } },
  { id:'guardian', name:'Guardian', e:'🛡️', recruitable:true, robe:0x37527a, hood:0x22314d,
    hp:210, dmg:10, speed:2.9,
    skill:{ id:'aegis', name:'Aegis Pelindung', e:'🛡️', desc:'Damage yang diterima seluruh tim & pemain -18% · memancing monster' } },
  { id:'merchant', name:'Pedagang', e:'🏪', recruitable:false, robe:0xc9a24b, hood:0x8a6a1e,
    hp:100, dmg:6, speed:2.6,
    skill:{ id:'trade', name:'Jiwa Dagang', e:'🪙', desc:'Menjual barang & membeli hasil buruanmu' } },
  { id:'dungeonmaster', name:'Dungeon Master', e:'🧙', recruitable:false, robe:0x4a2a6a, hood:0x2a1a3a,
    hp:150, dmg:10, speed:2.8,
    skill:{ id:'dchange', name:'Penjaga Reruntuhan', e:'🗝️', desc:'Menjual Dungeon Changer — mengubah level dungeon' } },
  { id:'petmerchant', name:'Pet Merchant', e:'🐾', recruitable:false, robe:0xefe6d5, hood:0x854c24,
    hp:140, dmg:14, speed:3.2,
    skill:{ id:'petguard', name:'Penjaga Kandang', e:'🐾', desc:'Bergerak & bertarung hanya dalam radius 4 blok dari kandang pet' } },
  { id:'lionknight', name:'Manusia Singa', e:'🦁', recruitable:true, rare:true, weight:9,
    robe:0xC8912F, hood:0xFFD700, hp:260, dmg:26, speed:3.6,
    skill:{ id:'lionclaw', name:'Auman Singa', e:'🦁', desc:'Pasif Cakar Singa: +20% damage · +jangkauan pedang · memancing monster · Aktif AUMAN SINGA: raungan 360° dua gelombang (1,3× + 0,7×) merusak & mendorong semua monster di sekeliling' } },
  { id:'elfmage', name:'Penyihir Elf', e:'🔮', recruitable:true, rare:true, weight:10,
    robe:0x2c4a8c, hood:0x5a7bd0, hp:130, dmg:24, speed:3.5,
    skill:{ id:'arcane', name:'Berkat Arcane', e:'✨', desc:'+18% damage seluruh tim · memulihkan stamina pemain lebih cepat' } },
  { id:'stonegiant', name:'Raksasa Batu', e:'🗿', recruitable:true, rare:true, weight:8,
    robe:0x71767d, hood:0x464e5c, hp:340, dmg:30, speed:2.6,
    skill:{ id:'quake', name:'Hantaman Bumi', e:'💥', desc:'Hantaman mace mengguncang tanah · damage besar & memancing monster' } },
  { id:'rabbitwarrior', name:'Kelinci Cakar', e:'🐰', recruitable:true, rare:true, weight:9,
    robe:0x8ea6c0, hood:0x2fa3a0, hp:235, dmg:23, speed:4.8,
    skill:{ id:'rapidclaw', name:'Rapid Claw', e:'🐾', desc:'5 cakaran kilat beruntun · cakaran ketiga combo +30% damage' } },
  { id:'goblin', name:'Goblin Emas', e:'👺', recruitable:true, rare:true, weight:9,
    robe:0x4f9e3a, hood:0xd9a531, hp:185, dmg:19, speed:4.6,
    skill:{ id:'backstab', name:'Backstab Leap', e:'🗡️', desc:'Loncat ke punggung monster · 5 tusukan beruntun (total damage 5×) · monster yang ditunggangi tak bisa membalas' } },
  { id:'magesupport', name:'Mage Support', e:'🔯', recruitable:true, rare:true, legendary:true, weight:6,
    robe:0x3a5a8c, hood:0x6a8fd0, hp:160, dmg:16, speed:3.4,
    skill:{ id:'support', name:'Dukungan Arcane', e:'🔯', desc:'Aura Pasif +15% DEF tim saat direkrut · Healing Aura memulihkan tim bertahap · Aura Perisai aktif · Hujan Bintang' } },
  { id:'royalguard', name:'Royal Guard', e:'🛡️', recruitable:true, rare:true, weight:8,
    robe:0xb02a26, hood:0xe0b048, hp:300, dmg:24, speed:3.0,
    skill:{ id:'royalbash', name:'Shield Bash', e:'👑', desc:'BASH: hantaman perisai membuat mob di kerucut depan pingsan (stun) · PROVOKE: menantang mob di sekitar untuk menyerangnya · damage diterima -70% selama menantang' } },
  { id:'lich', name:'Lich', e:'☠️', recruitable:true, rare:true, mythic:true, weight:4,
    robe:0x161a20, hood:0x2f8a4e, hp:380, dmg:42, speed:3.2,
    skill:{ id:'lich_wrath', name:'Lich Wrath', e:'☠️', desc:'⚡ Sambaran Petir Ungu beruntun · 🧟 Bangkitkan 3 Zombie Pembantai dari tanah kubur (HP, Damage & Durasi scaling level) · 🩸 Sedot Nyawa memulihkan HP' } },
];
HC.NPC_TEAM_MAX = 3;
HC.NPC_RECRUITABLE = HC.NPC_ROLES.filter((r) => r.recruitable);
HC.NPC_BY_ID = (id) => HC.NPC_ROLES.find((r) => r.id === id);
HC.NPC_SKILL = (id) => {
  const r = HC.NPC_BY_ID(id);
  return r ? r.skill : null;
};

/* ============================================================================
   EFEK SKILL DI SHOD
   Sylvan Dominion punya monster; SHOD tidak. Jadi tiap skill pasif dipetakan ke
   sistem yang setara di sini: ketahanan roda, regen roda, dan pembersihan
   kerikil di jalur. Angka diambil dari deskripsi aslinya (-20%, -18%, 1.5 HP/s,
   +15% DEF, dst.), sisanya penyesuaian karena tak ada target monster.
   ============================================================================ */
HC.NPC_SKILL_FX = {
  bulwark:    { dmg: 0.80, note: 'damage roda -20%' },
  keen:       { dmg: 0.85, note: 'kerikil terdeteksi lebih awal (-15% dampak)' },
  digger:     { regen: 0.6, note: 'tambal roda otomatis 0.6 HP/s' },
  green:      { regen: 0.5, note: 'rawat roda 0.5 HP/s' },
  mend:       { regen: 1.5, note: 'pulihkan roda 1.5 HP/s' },
  taunt:      { dmg: 0.60, note: 'badan jadi tameng (-40% dampak roda)' },
  aegis:      { dmg: 0.82, note: 'aura tim: damage -18%' },
  trade:      { dmg: 1.00, note: 'tidak ikut bertarung' },
  dchange:    { dmg: 1.00, note: 'tidak ikut bertarung' },
  petguard:   { dmg: 1.00, note: 'tidak ikut bertarung' },
  lionclaw:   { dmg: 0.90, clear: { radius: 3.2, period: 5 }, note: 'Auman Singa menyapu kerikil' },
  arcane:     { dmg: 0.85, speed: 1.05, note: 'aura arcane: damage -15%, laju +5%' },
  quake:      { clear: { radius: 4.5, period: 6 }, note: 'Hantaman Bumi meratakan kerikil' },
  rapidclaw:  { dmg: 0.90, speed: 1.10, note: 'cakaran kilat (-10% dampak, laju +10%)' },
  backstab:   { dmg: 0.88, note: 'tusukan cepat (-12% dampak)' },
  support:    { dmg: 0.85, regen: 0.8, note: '+15% DEF tim & healing aura' },
  royalbash:  { dmg: 0.70, note: 'perisai kerajaan (-30% dampak)' },
  lich_wrath: { dmg: 0.80, clear: { radius: 5.0, period: 8 }, regen: 0.4, note: 'petir ungu & sedot nyawa' },
};
HC.npcSkillFx = (role) => (role && role.skill && HC.NPC_SKILL_FX[role.skill.id]) || { dmg: 1 };

/* ============================================================================
   MODEL — pakai mesh ASLI Sylvan Dominion (js/sylvan/npc_*.js), bukan voxel
   buatan SHOD. Tiap entitas punya build() -> {mesh, parts} dan animate(n, dt).
   Model menghadap +Z; tinggi ±1.3 m dan sudah dalam satuan meter yang sama
   dengan dunia SHOD, jadi cuma diskalakan tipis (1.15) biar sepadan.
   ============================================================================ */
/* Tinggi akhir per role (meter). Model asli datang dalam skala prototipe yang
   berbeda-beda — goblin 1,4 m sementara Raksasa Batu 3,96 m — jadi tiap model
   dinormalisasi ke tinggi targetnya sendiri supaya proporsi Sylvan tetap,
   tapi ukurannya masuk akal di samping gerobak SHOD (bak setinggi ±1 m). */
HC.NPC_HEIGHT = {
  guard: 1.72, hunter: 1.74, miner: 1.64, farmer: 1.72, herbal: 1.68,
  warrior: 1.80, guardian: 1.86, merchant: 1.72, dungeonmaster: 1.80,
  petmerchant: 1.82, lionknight: 2.05, elfmage: 1.82, stonegiant: 2.90,
  rabbitwarrior: 1.56, goblin: 1.22, magesupport: 1.80, royalguard: 2.00,
  lich: 2.30,
};

function sitLegGroups(parts = {}) {
  // Beberapa model Sylvan mewarisi kontrak `legs` sebagai satu Group yang
  // sebenarnya alias hips/body (petmerchant: `parts.legs = hips`). Memutar
  // group itu 90derajat melempar pinggul ke depan dan menelungkupkan seluruh
  // badan di atas bangku, bukan melipat paha. Pulihkan sendi paha asli.
  const banned = [parts.hips, parts.body, parts.torso].filter(Boolean);
  const list = Array.isArray(parts.legs) ? parts.legs.filter(Boolean)
    : parts.legs ? [parts.legs] : [];
  const real = list.filter((g) => !banned.includes(g));
  if (real.length) return real;
  if (parts.rLeg || parts.lLeg) return [parts.rLeg, parts.lLeg].filter(Boolean);
  return [];
}

HC.buildNPC = function (role, pose = 'stand') {
  const root = new THREE.Group();
  root.name = `npc-${role.id}-${pose}`;
  const ent = HC.SD_NPC_MODELS[role.id];
  let parts = null, mesh = null;
  if (ent) {
    const built = ent.build();
    mesh = built.mesh || built.root;
    parts = built.parts || {};
  } else {
    // jaring pengaman: role tak dikenal
    const b = new HC.VoxelBuilder();
    b.box(-2, 0, -2, 2, 10, 2, role.robe || 0x888888, 0.02);
    mesh = b.build(0, 0, 0);
  }
  const holder = new THREE.Group();
  holder.add(mesh);
  root.add(holder);

  /* Normalisasi tinggi. Model Sylvan sudah berdiri dengan tapak kaki di y=0
     pada ruangnya sendiri (gada/jubah yang menjuntai ke bawah itu bagian dari
     siluet, bukan offset). Jadi cukup skala — jangan digeser naik, nanti
     karakternya ngambang. Pose duduk dibatasi lebih pendek supaya raksasa
     3 m tidak menembus atap gerobak. */
  const baseH = HC.NPC_HEIGHT[role.id] || 1.75;
  const targetH = pose === 'sit' ? Math.min(baseH, 2.05) : baseH;
  root.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(mesh);
  const rawH = Math.max(0.01, raw.max.y - raw.min.y);
  const fit = targetH / rawH;
  mesh.scale.multiplyScalar(fit);
  root.updateMatrixWorld(true);

  const state = {
    mesh, parts,
    role, pose,
    // runtime yang ditunggu animate() bawaan Sylvan
    // Beberapa model rare memakai pos.clone()/lerpVectors, jadi harus Vector3.
    pos: new THREE.Vector3(),
    vel: { x: 0, z: 0 },
    flash: 0, swing: 0, target: null, cast: null, dead: false,
    hp: role.hp, maxHp: role.hp, lvl: 1, level: 1,
    stamina: 100, maxStamina: 100, walking: false, working: false,
    dir: 0, t: 0, speed: role.speed || 3,
    _legs: null, _hipY: 0,
  };

  // kumpulkan grup kaki + tinggi pinggul untuk pose duduk
  state._legs = sitLegGroups(parts);
  if (state._legs.length) state._hipY = state._legs[0].position.y || 0.52;

  /* Satu tick animasi diam dulu: beberapa model (lionknight, dungeonmaster)
     menaruh ujung jubah/buku di bawah telapak, jadi alas kaki baru terbaca
     benar setelah pose akhirnya diterapkan. Lift konstan di holder, bukan di
     root — root dipakai untuk tinggi duduk. */
  if (HC.SD_NPC_MODELS[role.id] && pose === 'stand') {
    try { HC.SD_NPC_MODELS[role.id].animate(state, 1 / 60); } catch (e) { /* no-op */ }
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(root);
    if (isFinite(bb.min.y) && Math.abs(bb.min.y) > 0.02) holder.position.y -= bb.min.y;
    root.updateMatrixWorld(true);
  }

  if (pose === 'sit') {
    /* Duduk: paha diputar ke depan, lalu badan diturunkan sampai PINGGUL tepat
       di atas alas bangku. Tinggi pinggul diukur dari bounding box grup kaki
       (bukan `position.y` grup itu), karena sebagian model menyimpan kaki di
       dalam grup perantara yang sudah punya offset sendiri. */
    const padTop = 13.2 * HC.cartVS;                 // permukaan bangku di ruang body cart
    /* Ukur dulu SEBELUM kaki diputar: memutar grup kaki -90 deg membuat bbox-nya
       memendek, jadi model berpaha bisa salah terbaca sebagai "cuma telapak". */
    root.updateMatrixWorld(true);
    const bbAll = new THREE.Box3().setFromObject(mesh);
    const modelH = Math.max(0.01, bbAll.max.y - bbAll.min.y);
    let legH = 0;
    if (state._legs.length) {
      const bbL = new THREE.Box3().setFromObject(state._legs[0]);
      if (isFinite(bbL.min.y) && isFinite(bbL.max.y)) legH = bbL.max.y - bbL.min.y;
    }
    // Model berpaha asli: rasio tinggi kaki 0,26-0,37 x tinggi badan.
    // Model yang cuma punya telapak/tertutup jubah: 0,00-0,07.
    const robeOnly = legH < modelH * 0.15;
    let hipY = 0.52;
    if (state._legs.length) {
      const wp = new THREE.Vector3();
      state._legs[0].getWorldPosition(wp);
      if (isFinite(wp.y)) hipY = wp.y;
    }
    for (const lg of state._legs) lg.rotation.x = -Math.PI / 2;
    /* padTop sudah dalam ruang body cart, dan root ini nanti di-parent ke
       cart.body — jadi jangan dikompensasi lagi. Menambah 13.2*S di sini bikin
       NPC melayang setinggi bangku. */
    root.position.y = padTop - hipY + 0.02;
    root.rotation.y = 0;                     // ditimpa mount() sesuai slot

    /* ---- model berjubah panjang / tanpa paha (elf, mage support, lich) ----
       parts.legs di model itu cuma TELAPAK kaki; tidak ada paha yang bisa
       dilipat. Kalau diperlakukan seperti model berpaha, badan tegak 1,8 m tetap
       berdiri di atas alas bangku -> kebaca BERDIRI di kursi (keluhan
       "elf-nya berdiri"). Untuk tipe ini: ujung jubah ditaruh pas di alas
       bangku, lalu badan diturunkan sampai tinggi kepala di atas bangku ~1,3 m
       seperti orang duduk. Bagian jubah yang turun masuk ke dalam bak dan
       tertutup dinding bak, jadi tidak terlihat dari luar. */
    if (robeOnly) {
      root.updateMatrixWorld(true);
      const hem = new THREE.Box3().setFromObject(mesh);
      if (isFinite(hem.min.y)) root.position.y += (padTop + 0.02) - hem.min.y;   // ujung jubah di alas
      const seatedH = Math.min(1.35, modelH * 0.74);
      root.position.y -= Math.max(0, modelH - seatedH);
      root.updateMatrixWorld(true);
      state.robeSeated = true;
    }
    /* Clamp lantai bak: jangan ada bagian tubuh yang menembus alas bak.
       Model raksasa kalau cuma pakai tinggi pinggul bisa nyemplung 3 vox. */
    root.updateMatrixWorld(true);
    const bbFloor = new THREE.Box3().setFromObject(mesh);
    const floorY = 2.0 * HC.cartVS;
    if (isFinite(bbFloor.min.y) && bbFloor.min.y < floorY) {
      root.position.y += floorY - bbFloor.min.y;
      root.updateMatrixWorld(true);
    }
  }

  root.userData.npc = state;
  root.userData.npcRoleId = role.id;
  root.userData.npcPose = pose;
  return root;
};

/* Animasi bawaan Sylvan; untuk pose duduk paha dikembalikan ke posisi duduk
   setelah animate() supaya tidak diluruskan lagi. Error TIDAK ditelan diam-diam:
   dicatat ke HC.npcAnimErrors supaya probe bisa membedakan "modelnya diam" dari
   "animate() meledak di frame pertama". */
HC.npcAnimErrors = HC.npcAnimErrors || {};
HC.animateNPC = function (root, dt) {
  const st = root.userData && root.userData.npc;
  if (!st || !HC.SD_NPC_MODELS[st.role.id]) return;
  const ent = HC.SD_NPC_MODELS[st.role.id];
  if (typeof ent.animate !== 'function') return;
  try {
    ent.animate(st, dt || 1 / 60);
    delete HC.npcAnimErrors[st.role.id];
  } catch (e) {
    HC.npcAnimErrors[st.role.id] = (e && e.message) || String(e);
  }
  if (st.pose === 'sit') for (const lg of st._legs) lg.rotation.x = -Math.PI / 2;
};

/* ============================================================================
   KECERDASAN WARGA — padanan SHOD dari NPCS.ai() Sylvan
   ----------------------------------------------------------------------------
   Sylvan mengatur NPC lewat ai() -> aiPatrol/aiFarmer/aiGather/aiShopkeeper
   yang menulis n.vel/n.walking/n.working/farmT/mineT/forageT/headAngle, lalu
   animate() bawaan model memutar tulangnya. SHOD tidak punya blok, monster,
   maupun jalur A*: jadi yang diport adalah KONTRAK yang sama (state yang sama,
   plus gerak di atas terrain analitik), bukan mesin tempurnya.

   Tiap arketipe punya jadwal sendiri:
   - 'post'   : jaga tempat (guard, warrior, guardian) — geser dikit, siaga.
   - 'work'   : siklus kerja (farmer/miner/herbal) — kerja di titik, lalu geser.
   - 'shop'   : jaga lapak (merchant/dungeonmaster/petmerchant) — hadap kuda.
   - 'roam'   : pengembara (rare) — jalan lebih jauh, sesekali aksi.
   Semua menghadap kuda saat dekat dan menjauh kalau kuda mau nabrak.
   ============================================================================ */
HC.NPC_BEHAVIOR = {
  guard:        { mode: 'post', radius: 2.4, walk: 0.55, pause: [3.0, 6.0], work: null,     act: 7.0,  face: 7.0 },
  warrior:      { mode: 'post', radius: 2.8, walk: 0.60, pause: [3.0, 6.5], work: null,     act: 6.0,  face: 7.0 },
  guardian:     { mode: 'post', radius: 2.2, walk: 0.45, pause: [4.0, 7.0], work: null,     act: 8.0,  face: 7.0 },
  hunter:       { mode: 'post', radius: 3.2, walk: 0.55, pause: [3.0, 6.0], work: null,     act: 4.5,  face: 8.0 },
  farmer:       { mode: 'work', radius: 3.4, walk: 0.45, pause: [0.6, 1.6], work: 'farm',   act: 0,    face: 6.0 },
  miner:        { mode: 'work', radius: 3.0, walk: 0.40, pause: [0.5, 1.4], work: 'mine',   act: 0,    face: 6.0 },
  herbal:       { mode: 'work', radius: 3.0, walk: 0.40, pause: [0.5, 1.4], work: 'forage', act: 0,    face: 6.0 },
  merchant:     { mode: 'shop', radius: 0.8, walk: 0.25, pause: [5.0, 8.0], work: null,     act: 6.0,  face: 7.0 },
  dungeonmaster:{ mode: 'shop', radius: 0.6, walk: 0.20, pause: [5.0, 9.0], work: null,     act: 5.0,  face: 7.0 },
  petmerchant:  { mode: 'shop', radius: 1.4, walk: 0.30, pause: [4.0, 7.0], work: null,     act: 7.0,  face: 6.0 },
  lionknight:   { mode: 'roam', radius: 5.0, walk: 0.50, pause: [2.5, 5.0], work: null,     act: 9.0,  face: 9.0 },
  elfmage:      { mode: 'roam', radius: 4.2, walk: 0.45, pause: [2.5, 5.5], work: null,     act: 8.0,  face: 9.0 },
  stonegiant:   { mode: 'roam', radius: 3.6, walk: 0.35, pause: [3.5, 7.0], work: null,     act: 9.0,  face: 9.0 },
  rabbitwarrior:{ mode: 'roam', radius: 4.6, walk: 0.75, pause: [1.5, 3.5], work: null,     act: 5.0,  face: 8.0 },
  goblin:       { mode: 'roam', radius: 4.4, walk: 0.70, pause: [1.5, 4.0], work: null,     act: 5.0,  face: 8.0 },
  magesupport:  { mode: 'roam', radius: 4.0, walk: 0.45, pause: [3.0, 6.0], work: null,     act: 7.0,  face: 9.0 },
  royalguard:   { mode: 'post', radius: 2.6, walk: 0.50, pause: [3.0, 6.5], work: null,     act: 7.0,  face: 8.0 },
  lich:         { mode: 'roam', radius: 3.8, walk: 0.35, pause: [3.5, 7.0], work: null,     act: 9.0,  face: 9.0 },
};

const _rnd = (a, b) => a + Math.random() * (b - a);

/* Satu tick AI untuk NPC liar: pilih fase (diam/jalan/kerja), gerakkan root di
   atas terrain, isi state yang dibaca animate(), lalu animasikan. */
HC.updateWildNPC = function (item, dt, horse, world) {
  const root = item.root, st = root && root.userData && root.userData.npc;
  if (!st) return;
  const prof = HC.NPC_BEHAVIOR[st.role.id] || { mode: 'post', radius: 2.5, walk: 0.5, pause: [3, 6], work: null, act: 6, face: 7 };
  const b = item.brain || (item.brain = { phase: 'idle', t: _rnd(0.5, 2.0), dir: root.rotation.y, actT: _rnd(2, prof.act || 8), swingT: -1, healT: -1, harvest: true });

  const dxH = horse.x - item.x, dzH = horse.z - item.z;
  const distH = Math.hypot(dxH, dzH);
  const homeD = Math.hypot(item.x - item.homeX, item.z - item.homeZ);

  /* Jangan biarkan pemain nabrak NPC: kalau kuda terlalu dekat, geser menjauh
     sedikit (NPC "minggir"), bukan menembus gerobak. */
  if (distH < 1.9) {
    const away = Math.atan2(-dxH, -dzH);
    item.x += Math.sin(away) * 1.6 * dt;
    item.z += Math.cos(away) * 1.6 * dt;
    b.phase = 'idle'; b.t = Math.max(b.t, 0.4);
  }

  b.t -= dt;
  if (b.t <= 0) {
    if (b.phase === 'walk') {
      b.phase = prof.work ? 'work' : 'idle';
      b.t = prof.work ? _rnd(2.2, 4.2) : _rnd(prof.pause[0], prof.pause[1]);
    } else if (b.phase === 'work') {
      b.phase = 'idle';
      b.t = _rnd(prof.pause[0], prof.pause[1]);
    } else {
      // diam -> jalan (kecuali penjaga lapak yang cuma geser-geser)
      b.phase = 'walk';
      b.t = _rnd(1.2, 2.8);
      const homeBias = homeD > prof.radius ? Math.atan2(item.homeX - item.x, item.homeZ - item.z) : b.dir;
      b.dir = homeBias + _rnd(-1.1, 1.1);
    }
  }

  let walkSpeed = 0;
  const isWork = b.phase === 'work';
  const maxR = Math.min(prof.radius, item.homeRadius ?? prof.radius);
  if (b.phase === 'walk') {
    const sp = (st.speed || 3) * prof.walk;
    // jangan jalan keluar radius rumah
    if (homeD > maxR) b.dir = Math.atan2(item.homeX - item.x, item.homeZ - item.z);
    const px = item.x, pz = item.z;
    item.x += Math.sin(b.dir) * sp * dt;
    item.z += Math.cos(b.dir) * sp * dt;
    walkSpeed = sp;
    /* Bangunan situs itu solid: kalau langkah berikutnya masuk badan tenda/
       lapak, batalkan langkah dan putar arah. Tanpa ini warga bisa berjalan
       menembus tenda lalu muncul di dalamnya. */
    if (world && world.siteBlockedAt && world.siteBlockedAt(item.site, item.x, item.z)) {
      item.x = px; item.z = pz;
      b.dir += (b.turnSign || 1) * (Math.PI * 0.9);
      b.turnSign = -(b.turnSign || 1);
      walkSpeed = 0;
    }
    // Klem KERAS: radius kamp adalah batas wilayah, bukan saran. Tanpa ini
    // warga terus melangkah sepanjang timer jalan (terukur 2,48 m di radius 2,4).
    const ox = item.x - item.homeX, oz = item.z - item.homeZ;
    const od = Math.hypot(ox, oz);
    if (od > maxR) {
      item.x = item.homeX + (ox / od) * maxR;
      item.z = item.homeZ + (oz / od) * maxR;
      b.dir = Math.atan2(item.homeX - item.x, item.homeZ - item.z);
    }
  }

  const gy = (world && world.terrainHeightAt) ? world.terrainHeightAt(item.x, item.z) : 0;
  root.position.set(item.x, gy, item.z);
  // model Sylvan menghadap +Z lokal -> rotasi root = sudut arah
  let faceYaw = b.dir;
  if (distH < prof.face) faceYaw = Math.atan2(dxH, dzH);   // hadap kuda
  root.rotation.y = faceYaw;

  // ---- state kontrak animate() ----
  st.pos.copy(root.position);
  st.vel.x = walkSpeed ? Math.sin(b.dir) * walkSpeed : 0;
  st.vel.z = walkSpeed ? Math.cos(b.dir) * walkSpeed : 0;
  st.walking = walkSpeed > 0.01;
  st.working = isWork;
  st.speed = st.speed || st.role.speed || 3;
  if (isWork && prof.work === 'farm') {
    st.farmT = 1;
    st.farmTask = b.harvest ? { action: 'harvest' } : { action: 'plant' };
  } else { st.farmT = 0; st.farmTask = null; }
  st.mineT = (isWork && prof.work === 'mine') ? 1 : 0;
  st.forageT = (isWork && prof.work === 'forage') ? 1 : 0;
  st.healT = (isWork && prof.work === 'forage' && b.healT > 0) ? 1 : 0;

  // aksi sesekali (ayun senjata / siaga tempur) — bukan combat ke monster
  if (prof.act > 0) {
    b.actT -= dt;
    if (b.actT <= 0) {
      b.actT = prof.act * _rnd(0.8, 1.5);
      b.swingT = 0.001;
      if (prof.work === 'farm') b.harvest = !b.harvest;
    }
  }
  if (b.swingT > 0) {
    b.swingT += dt;
    st.swing = b.swingT;
    if (b.swingT > 0.9) { b.swingT = -1; st.swing = 0; }
  }
  // Kepala selalu "lurus" karena root sudah diputar hadap kuda; jangan kirim
  // undefined, model lain memakai n.headAngle langsung di lerp().
  st.headAngle = 0;

  HC.animateNPC(root, dt);
};

/* ============================================================================
   PARTY — rekrut NPC liar, duduk di bangku belakang, buff gerobak.
   ============================================================================ */
HC.NPCParty = class {
  constructor(scene) {
    this.scene = scene;
    this.roles = HC.NPC_RECRUITABLE;
    this.squad = [];
    this.wild = [];
    this.nextRole = 0;
    this.lastHorse = { x: 0, z: 0, yaw: 0 };
    this.lastMessage = 'NPC tinggal di kamp/pos. Deketin kelompoknya buat rekrut.';
    this._clearT = {};
    this._clock = 0;
    // Kelompok warga permanen dari peta. Tidak ada spawn mengikuti arah kuda.
    this._spawnSettlements();
  }
  // NPC liar berdiri di atas terrain, bukan di y=0 (medan sekarang berbukit).
  _groundY(x, z) {
    return (this.world && this.world.terrainHeightAt) ? this.world.terrainHeightAt(x, z) : 0;
  }
  _spawnSettlements() {
    const spawns = (HC.MAP && HC.MAP.allNPCSpawns) ? HC.MAP.allNPCSpawns() : [];
    this.wild = [];
    for (let i = 0; i < spawns.length; i++) this._spawnFromAnchor(i, spawns[i]);
  }
  _spawnFromAnchor(slot, anchor) {
    const role = HC.NPC_ROLES.find((r) => r.id === anchor.role) || this.roles[this.nextRole++ % this.roles.length];
    const old = this.wild[slot];
    if (old && old.root) this.scene.remove(old.root);
    const root = HC.buildNPC(role, 'stand');
    root.userData.npcRoleId = role.id;
    root.position.set(anchor.x, this._groundY(anchor.x, anchor.z), anchor.z);
    root.rotation.y = anchor.yaw || 0;
    this.scene.add(root);
    const item = {
      root, role, site: anchor.site,
      x: anchor.x, z: anchor.z,
      homeX: anchor.x, homeZ: anchor.z,
      // warga menjaga titik kerja/tempat kelompoknya; bukan keluyuran di map
      homeRadius: HC.NPC_BEHAVIOR[role.id]?.work === null ? 0.8 : 1.3,
      anchor: { ...anchor },
    };
    this.wild[slot] = item;
    return item;
  }
  update(x, z, yaw, dt) {
    this.lastHorse.x = x; this.lastHorse.z = z; this.lastHorse.yaw = yaw;
    this._clock += dt || 1 / 60;
    for (let i = 0; i < this.wild.length; i++) {
      const w = this.wild[i];
      if (w.respawnAt && this._clock >= w.respawnAt) {
        this._spawnFromAnchor(i, w.anchor);
        w.respawnAt = null;
      }
      if (w.recruited) continue;
      // Tetap berkelompok di kamp/pos; TIDAK respawn random di depan kuda.
      if (w.root) HC.updateWildNPC(w, dt || 1 / 60, { x, z }, this.world);
    }
  }
  avoidSiteProps(world, item) {
    if (!world || !world.siteBlockedAt || !item || !item.site) return false;
    if (!world.siteBlockedAt(item.site, item.x, item.z)) return false;
    const site = (HC.MAP && HC.MAP.sites || []).find((s) => s.id === item.site);
    if (!site) return false;
    const candidates = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      for (let d = 1.3; d <= site.radius * 0.85; d += 0.9) {
        candidates.push({ x: site.x + Math.cos(a) * d, z: site.z + Math.sin(a) * d });
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - item.x, a.z - item.z) - Math.hypot(b.x - item.x, b.z - item.z));
    for (const p of candidates) {
      if (world.siteBlockedAt && world.siteBlockedAt(item.site, p.x, p.z)) continue;
      let inOther = false;
      for (const s of world.siteMeshes || []) if (s.id !== item.site && world.siteBlockedAt(s.id, p.x, p.z)) inOther = true;
      if (inOther) continue;
      item.anchor.x = p.x; item.anchor.z = p.z;
      item.x = p.x; item.z = p.z;
      item.homeX = p.x; item.homeZ = p.z;
      if (item.root) {
        item.root.position.x = p.x;
        item.root.position.z = p.z;
        if (world.terrainHeightAt) item.root.position.y = world.terrainHeightAt(p.x, p.z);
      }
      return true;
    }
    return false;
  }
  nearby(x, z) {
    let best = null, dist = Infinity;
    for (const w of this.wild) {
      if (w.recruited) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < dist) { best = w; dist = d; }
    }
    return best && dist <= 3.2 ? { npc: best, distance: dist } : null;
  }
  /* Damage roda = hasil kali efek semua anggota (mis. guardian 0.82 + warrior
     0.60 -> 0.49), dibatasi 0.35 supaya tidak pernah nol. */
  defenseScale() {
    let m = 1;
    for (const r of this.squad) m *= HC.npcSkillFx(r).dmg || 1;
    return Math.max(0.35, Math.min(1, m));
  }
  regenRate() {
    let r = 0;
    for (const role of this.squad) r += HC.npcSkillFx(role).regen || 0;
    return r;
  }
  speedMul() {
    let m = 1;
    for (const r of this.squad) m *= HC.npcSkillFx(r).speed || 1;
    return Math.min(1.2, m);
  }
  /* Panggil tiap frame: pulihkan HP roda + skill pembersih kerikil. */
  applyEffects(dt, physics, world) {
    if (!this.squad.length) return;
    const regen = this.regenRate();
    if (regen > 0 && physics && physics.wheels) {
      for (const w of physics.wheels) {
        if (w.detached) continue;
        w.hp = Math.min(w.hpMax || 100, (w.hp ?? 100) + regen * dt);
        if (w.hp > 0) w.broken = false;
      }
    }
    if (!world || !world.pebbles) return;
    const now = performance.now() / 1000;
    for (const role of this.squad) {
      const fx = HC.npcSkillFx(role);
      if (!fx.clear) continue;
      const last = this._clearT[role.id] || 0;
      if (now - last < fx.clear.period) continue;
      this._clearT[role.id] = now;
      const h = this.lastHorse;
      let n = 0;
      for (const p of world.pebbles) {
        if (Math.hypot(p.x - h.x, p.z - h.z) < fx.clear.radius) { p.h = 0; n++; }
      }
      if (n) this.lastMessage = `${role.skill.e} ${role.skill.name}: ${n} kerikil di jalur disapu.`;
    }
  }
  recruit(x, z) {
    if (this.squad.length >= HC.NPC_TEAM_MAX) {
      this.lastMessage = 'Regu penuh (3/3). Lepas anggota dulu.'; return null;
    }
    const hit = this.nearby(x, z);
    if (!hit) { this.lastMessage = 'Belum ada NPC dalam jangkauan 3.2 m. Deketin kelompoknya dulu.'; return null; }
    const w = hit.npc;
    const role = w.role;              // ambil dulu: respawn menimpa item.role
    this.squad.push(role);
    this.scene.remove(w.root);
    // Warga pergi ikut regu; slot di kamp diisi lagi nanti (30 s) DI SITUS YANG
    // SAMA, bukan muncul mendadak di depan kuda.
    w.recruited = true;
    w.respawnAt = this._clock + 30;
    const fx = HC.npcSkillFx(role);
    this.lastMessage = `${role.e} ${role.name} direkrut — ${role.skill.name}: ${fx.note}`;
    return role;
  }
  unmount(cart) {
    for (const p of cart.npcPassengers || []) if (p.parent) p.parent.remove(p);
    cart.npcPassengers = [];
  }
  mount(cart) {
    this.unmount(cart);
    const active = this.squad.length > 0;
    for (const p of cart.passengers || []) p.root.visible = !active;
    const spec = cart.specs.capSpec, xBack = -spec.bedHalfL;
    const x0 = xBack + 3, x1 = -6, span = x1 - x0;
    const xA = x0 + span * 0.28, xB = x0 + span * 0.72, z = 9.3;
    /* Arah hadap: model Sylvan menghadap +Z lokal (BUKAN +X seperti penumpang
       voxel SHOD), sedangkan root di sini tidak diberi kompensasi di holder.
       Karena itu rotasi bangku memakai sumbu Z: bangku +Z harus diputar PI
       supaya hidungnya menuju lorong (-Z), dan bangku -Z tetap 0 supaya
       menghadap +Z. Sebelumnya dipakai +/-PI/2 (resep penumpang SHOD), jadi
       semua kru duduk menyamping menghadap DEPAN gerobak, bukan berhadapan. */
    const seats = [
      { x: xA, z: z, rot: Math.PI },        // bangku +Z -> hadap lorong (-Z)
      { x: xA, z: -z, rot: 0 },             // bangku -Z -> hadap lorong (+Z)
      { x: xB, z: z, rot: Math.PI },        // stasiun depan, sisi +Z
    ];
    for (let i = 0; i < this.squad.length; i++) {
      const role = this.squad[i], seat = seats[i], root = HC.buildNPC(role, 'sit');
      root.position.x = seat.x * HC.cartVS;
      root.position.z = seat.z * HC.cartVS;
      root.rotation.y = seat.rot;
      root.userData.npcRoleId = role.id;
      cart.body.add(root);
      cart.npcPassengers.push(root);
    }
  }
};
