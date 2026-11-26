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
  { id:'guardian', name:'Penjaga Perisai', e:'🛡️', recruitable:true, robe:0x37527a, hood:0x22314d,
    hp:210, dmg:10, speed:2.9,
    skill:{ id:'aegis', name:'Aegis Pelindung', e:'🛡️', desc:'Damage yang diterima seluruh tim & pemain -18% · memancing monster' } },
  { id:'merchant', name:'Pedagang', e:'🏪', recruitable:false, robe:0xc9a24b, hood:0x8a6a1e,
    hp:100, dmg:6, speed:2.6,
    skill:{ id:'trade', name:'Jiwa Dagang', e:'🪙', desc:'Menjual barang & membeli hasil buruanmu' } },
  { id:'dungeonmaster', name:'Penguasa Reruntuhan', e:'🧙', recruitable:false, robe:0x4a2a6a, hood:0x2a1a3a,
    hp:150, dmg:10, speed:2.8,
    skill:{ id:'dchange', name:'Penjaga Reruntuhan', e:'🗝️', desc:'Menjual Dungeon Changer — mengubah level dungeon' } },
  { id:'petmerchant', name:'Pedagang Hewan', e:'🐾', recruitable:false, robe:0xefe6d5, hood:0x854c24,
    hp:140, dmg:14, speed:3.2,
    skill:{ id:'petguard', name:'Penjaga Kandang', e:'🐾', desc:'Bergerak & bertarung hanya dalam radius 4 blok dari kandang pet' } },
  { id:'lionknight', name:'Ksatria Singa', e:'🦁', recruitable:true, rare:true, weight:9,
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
  { id:'magesupport', name:'Penyihir Pendukung', e:'🔯', recruitable:true, rare:true, legendary:true, weight:6,
    robe:0x3a5a8c, hood:0x6a8fd0, hp:160, dmg:16, speed:3.4,
    skill:{ id:'support', name:'Dukungan Arcane', e:'🔯', desc:'Aura Pasif +15% DEF tim saat direkrut · Healing Aura memulihkan tim bertahap · Aura Perisai aktif · Hujan Bintang' } },
  { id:'royalguard', name:'Pengawal Kerajaan', e:'🛡️', recruitable:true, rare:true, weight:8,
    robe:0xb02a26, hood:0xe0b048, hp:300, dmg:24, speed:3.0,
    skill:{ id:'royalbash', name:'Shield Bash', e:'👑', desc:'BASH: hantaman perisai membuat mob di kerucut depan pingsan (stun) · PROVOKE: menantang mob di sekitar untuk menyerangnya · damage diterima -70% selama menantang' } },
  { id:'lich', name:'Raja Tulang', e:'☠️', recruitable:true, rare:true, mythic:true, weight:4,
    robe:0x161a20, hood:0x2f8a4e, hp:380, dmg:42, speed:3.2,
    skill:{ id:'lich_wrath', name:'Lich Wrath', e:'☠️', desc:'⚡ Sambaran Petir Ungu beruntun · 🧟 Bangkitkan 3 Zombie Pembantai dari tanah kubur (HP, Damage & Durasi scaling level) · 🩸 Sedot Nyawa memulihkan HP' } },
];
HC.NPC_TEAM_MAX = 2;
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
  bulwark:    { dmg: 0.80, note: 'damage roda -20%', noteEn: 'wheel damage -20%' },
  keen:       { dmg: 0.85, note: 'kerikil terdeteksi lebih awal (-15% dampak)', noteEn: 'spots pebbles early (-15% impact)' },
  digger:     { regen: 0.6, note: 'tambal roda otomatis 0.6 HP/s', noteEn: 'repairs wheels at 0.6 HP/s' },
  green:      { regen: 0.5, note: 'rawat roda 0.5 HP/s', noteEn: 'maintains wheels at 0.5 HP/s' },
  mend:       { regen: 1.5, note: 'pulihkan roda 1.5 HP/s', noteEn: 'restores wheels at 1.5 HP/s' },
  taunt:      { dmg: 0.60, note: 'badan jadi tameng (-40% dampak roda)', noteEn: 'acts as a shield (-40% wheel impact)' },
  aegis:      { dmg: 0.82, note: 'aura tim: damage -18%', noteEn: 'team aura: damage -18%' },
  trade:      { dmg: 1.00, note: 'tidak ikut bertarung', noteEn: 'does not fight' },
  dchange:    { dmg: 1.00, note: 'tidak ikut bertarung', noteEn: 'does not fight' },
  petguard:   { dmg: 1.00, note: 'tidak ikut bertarung', noteEn: 'does not fight' },
  lionclaw:   { dmg: 0.90, clear: { radius: 3.2, period: 5 }, note: 'Auman Singa menyapu kerikil', noteEn: 'Lion’s Roar clears pebbles' },
  arcane:     { dmg: 0.85, speed: 1.05, note: 'aura arcane: damage -15%, laju +5%', noteEn: 'arcane aura: damage -15%, speed +5%' },
  quake:      { clear: { radius: 4.5, period: 6 }, note: 'Hantaman Bumi meratakan kerikil', noteEn: 'Earth Slam clears pebbles' },
  rapidclaw:  { dmg: 0.90, speed: 1.10, note: 'cakaran kilat (-10% dampak, laju +10%)', noteEn: 'rapid claws (-10% impact, speed +10%)' },
  backstab:   { dmg: 0.88, note: 'tusukan cepat (-12% dampak)', noteEn: 'quick strikes (-12% impact)' },
  support:    { dmg: 0.85, regen: 0.8, note: '+15% DEF tim & healing aura', noteEn: '+15% team DEF & healing aura' },
  royalbash:  { dmg: 0.70, note: 'perisai kerajaan (-30% dampak)', noteEn: 'royal shield (-30% impact)' },
  lich_wrath: { dmg: 0.80, clear: { radius: 5.0, period: 8 }, regen: 0.4, note: 'petir ungu & sedot nyawa', noteEn: 'purple lightning & life drain' },
};
HC.npcSkillFx = (role) => (role && role.skill && HC.NPC_SKILL_FX[role.skill.id]) || { dmg: 1 };

const NPC_ROLE_TEXT = {
  guard: ['Village Guard', 'Village Bulwark', 'Incoming damage -20%'],
  hunter: ['Hunter', 'Keen Eye', '+25% damage and longer attack range'],
  miner: ['Miner', 'Mining Hands', 'Mines twice as fast and sometimes finds extra materials'],
  farmer: ['Farmer', 'Green Thumb', 'Faster farming and +1 harvest yield'],
  herbal: ['Village Healer', 'Healing Hands', 'Restores 1.5 HP/s to nearby players'],
  warrior: ['Fighter', 'Living Shield', 'Draws monsters’ attention'],
  guardian: ['Guardian', 'Protective Aegis', 'Reduces damage to the team and player by 18%; taunts monsters'],
  merchant: ['Merchant', 'Trading Spirit', 'Sells goods and buys your hunting spoils'],
  dungeonmaster: ['Dungeon Master', 'Ruins Keeper', 'Sells Dungeon Changer to change dungeon level'],
  petmerchant: ['Pet Merchant', 'Stable Keeper', 'Moves and fights only within 4 blocks of the pet stable'],
  lionknight: ['Lion Knight', 'Lion’s Roar', 'Lion Claw passive: +20% damage and sword range; taunts monsters. Active roar hits and pushes nearby monsters in two waves'],
  elfmage: ['Elf Mage', 'Arcane Blessing', '+18% team damage and faster player stamina recovery'],
  stonegiant: ['Stone Giant', 'Earth Slam', 'Mace slam shakes the ground, deals heavy damage, and taunts monsters'],
  rabbitwarrior: ['Claw Rabbit', 'Rapid Claw', 'Five rapid strikes; the third hit in the combo deals +30% damage'],
  goblin: ['Golden Goblin', 'Backstab Leap', 'Leaps onto a monster’s back for five strikes; mounted monsters cannot retaliate'],
  magesupport: ['Mage Support', 'Arcane Support', 'Passive +15% team DEF; healing aura restores the team; active shield aura and Starfall'],
  royalguard: ['Royal Guard', 'Shield Bash', 'Bash stuns monsters in a forward cone; Provoke draws nearby monsters and reduces incoming damage by 70%'],
  lich: ['Lich', 'Lich Wrath', 'Repeated purple lightning; raises three Slayer Zombies; life drain restores HP'],
};

HC.localizeNpcRoles = function () {
  const english = !HC.getLang || HC.getLang() !== 'id';
  for (const role of HC.NPC_ROLES) {
    const original = NPC_ROLE_TEXT[role.id];
    if (!original) continue;
    if (!role._localizedBase) {
      role._localizedBase = { name: role.name, skillName: role.skill.name, skillDesc: role.skill.desc };
    }
    role.name = english ? original[0] : role._localizedBase.name;
    role.skill.name = english ? original[1] : role._localizedBase.skillName;
    role.skill.desc = english ? original[2] : role._localizedBase.skillDesc;
  }
  for (const id of Object.keys(HC.NPC_SKILL_FX)) {
    const fx = HC.NPC_SKILL_FX[id];
    if (fx.noteEn === undefined) continue;
    if (fx._noteId === undefined) fx._noteId = fx.note;
    fx.note = english ? fx.noteEn : fx._noteId;
  }
};
HC.localizeNpcRoles();

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
  guard: 2.38, hunter: 2.38, miner: 2.26, farmer: 2.34, herbal: 2.28,
  warrior: 2.46, guardian: 2.52, merchant: 2.36, dungeonmaster: 2.42,
  petmerchant: 2.42, lionknight: 2.70, elfmage: 2.42, stonegiant: 3.55,
  rabbitwarrior: 2.15, goblin: 1.68, magesupport: 2.42, royalguard: 2.65,
  lich: 2.95,
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
  const baseH = HC.NPC_HEIGHT[role.id] || 2.35;
  const targetH = pose === 'sit' ? Math.min(baseH * 0.78, 2.05) : baseH;
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
  if (typeof HC.attachT3ToOriginalNPC === 'function' && HC.SD_NPC_MODELS[role.id]) {
    HC.attachT3ToOriginalNPC(root, state);
  }
  return root;
};

/* Animasi bawaan Sylvan; untuk pose duduk paha dikembalikan ke posisi duduk
   setelah animate() supaya tidak diluruskan lagi. Error TIDAK ditelan diam-diam:
   dicatat ke HC.npcAnimErrors supaya probe bisa membedakan "modelnya diam" dari
   "animate() meledak di frame pertama".

   YAW: di Sylvan `n.mesh` ADALAH entitasnya — NPCS.update menulis
   `n.mesh.position.copy(n.pos)` lalu memutar `n.mesh.rotation.y` dengan angLerp,
   dan model membacanya untuk oleng badan saat belok (guard/hunter: `st.turn`),
   kibaran cape, pandangan kepala patroli, serta arah hadap skill. Di SHOD yang
   diputar adalah `root` (mesh cuma anak dari root -> holder), jadi
   `n.mesh.rotation.y` selalu 0 dan semua oleng-belok itu mati.
   Solusi: pinjamkan yaw root (dihaluskan dulu seperti angLerp Sylvan) ke mesh
   HANYA selama animate() dipanggil, lalu kembalikan ke nilai render aslinya
   supaya hadap dunia tetap milik root (tidak dobel putar).

   VEL: Sylvan selalu menyetel `n.vel` lewat lerp, jadi ayunan kaki menggelinding
   masuk/keluar. SHOD menulis `st.vel` secara instan (AI-nya yang pegang angka),
   jadi di sini vel dihaluskan sebentar untuk konsumsi animate() lalu dipulihkan. */
HC.npcAnimErrors = HC.npcAnimErrors || {};
HC.animateNPC = function (root, dt) {
  const st = root.userData && root.userData.npc;
  if (!st || !HC.SD_NPC_MODELS[st.role.id]) return;
  const ent = HC.SD_NPC_MODELS[st.role.id];
  if (typeof ent.animate !== 'function') return;
  const step = dt || 1 / 60;

  const rawVx = st.vel.x, rawVz = st.vel.z;
  const vS = st._velSmooth || (st._velSmooth = { x: rawVx, z: rawVz });
  const kv = 1 - Math.exp(-10 * step);
  vS.x += (rawVx - vS.x) * kv;
  vS.z += (rawVz - vS.z) * kv;
  st.vel.x = vS.x;
  st.vel.z = vS.z;

  const savedPosY = st.pos ? st.pos.y : 0;
  if (st.pos) st.pos.y = 0;

  const mesh = st.mesh;
  const savedMeshPos = (mesh && mesh.position)
    ? { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
    : null;
  const mirror = !!(mesh && mesh.rotation);
  const renderYaw = mirror ? mesh.rotation.y : 0;
  if (mirror) {
    const targetYaw = (root.rotation && root.rotation.y) || 0;
    if (st._animYaw === undefined) st._animYaw = targetYaw;
    let dYaw = targetYaw - st._animYaw;
    dYaw = ((dYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    st._animYaw += dYaw * (1 - Math.exp(-7 * step));
    mesh.rotation.y = st._animYaw;
  }

  try {
    ent.animate(st, step);
    delete HC.npcAnimErrors[st.role.id];
  } catch (e) {
    HC.npcAnimErrors[st.role.id] = (e && e.message) || String(e);
  }

  if (st.pos) st.pos.y = savedPosY;
  if (mesh && mesh.position && savedMeshPos) {
    mesh.position.x = savedMeshPos.x;
    mesh.position.z = savedMeshPos.z;
    if (st.pose === 'sit') {
      mesh.position.y = savedMeshPos.y;
    } else {
      mesh.position.y = Math.max(-0.25, Math.min(0.85, Number.isFinite(mesh.position.y) ? mesh.position.y : 0));
    }
  }

  /* Model yang menulis sendiri mesh.rotation.y / n.vel (goblin, lich, elfmage,
     magesupport, lionknight) ikut dikembalikan: hadap & gerak tetap milik AI. */
  if (mirror) mesh.rotation.y = renderYaw;
  st.vel.x = rawVx;
  st.vel.z = rawVz;
  if (st.pose === 'sit') for (const lg of st._legs) lg.rotation.x = -Math.PI / 2;
  if (st.t3Actor && st.t3PartNodes) {
    st.t3Actor.setFlash(st.flash > 0 ? Math.min(1, st.flash * 4.5) : 0);
    st.t3Actor.syncFromNodes(root, st.t3PartNodes);
  }
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
const npcText = (key, fallback, vars = null) => HC.t ? HC.t(key, vars) : fallback;

/* Model Sylvan membaca `st.swing` sebagai hitung mundur pendek (0.25–0.3 dtk),
   bukan waktu berjalan. Satu pulsa = satu ayunan, lalu kembali netral. */
const NPC_SWING_PULSE = 0.25;
function _armSwing(m) { if (m) m.swingPulse = NPC_SWING_PULSE; }
function _tickSwing(m, dt) {
  if (!m) return 0;
  if (m.swingPulse > 0) m.swingPulse = Math.max(0, m.swingPulse - dt);
  return m.swingPulse || 0;
}

function _setVillageDoorHold(bldg, hold) {
  if (!bldg) return;
  bldg.doorUsers = Math.max(0, (bldg.doorUsers || 0) + (hold ? 1 : -1));
  bldg.doorTarget = bldg.doorUsers > 0 ? 1 : 0;
}

function updateVillageResident(item, dt, horse, world) {
  const root = item.root;
  const st = root && root.userData && root.userData.npc;
  const vp = item.villageProfile;
  if (!st || !vp) return false;

  const prof = HC.NPC_BEHAVIOR[st.role.id] || { mode: 'post', radius: 3.0, walk: 0.5, pause: [3, 6], work: null, act: 6, face: 7 };
  const vd = vp.villageRef || (world && world.villageData);
  const homeBldg = vp.homeBldg || null;
  const stations = vp.stations && vp.stations.length ? vp.stations : [{ x: item.homeX, z: item.homeZ, faceX: item.homeX, faceZ: item.homeZ + 1 }];

  const vb = item.vBrain || (item.vBrain = {
    state: 'work_at_station',
    stationIdx: 0,
    target: stations[0],
    t: _rnd(2.2, 5.5),
    subT: 0,
    cyclesDone: 0,
    nextHomeCycles: 2 + Math.floor(Math.random() * 3),
    dir: root.rotation ? root.rotation.y : 0,
    actT: _rnd(1.5, prof.act || 6),
    swingT: -1,
    healT: -1,
    harvest: true,
    holdingDoor: false,
    goingToDoor: false,
    farmTileIdx: -1,
    farmAction: 'harvest',
    carriedCrops: 0,
  });

  const groundFn = (x, z) => ((world && world.heightAt) ? world.heightAt(x, z)
    : (world && world.terrainHeightAt) ? world.terrainHeightAt(x, z) : 0);

  const releaseDoor = () => {
    if (vb.holdingDoor && homeBldg) {
      _setVillageDoorHold(homeBldg, false);
      vb.holdingDoor = false;
    }
  };
  const acquireDoor = () => {
    if (!vb.holdingDoor && homeBldg) {
      _setVillageDoorHold(homeBldg, true);
      vb.holdingDoor = true;
    }
  };

  const dxH = horse.x - item.x;
  const dzH = horse.z - item.z;
  const distH = Math.hypot(dxH, dzH);

  // ---- State: Indoors resting / working inside home building ----
  if (vb.state === 'indoors') {
    vb.t -= dt;
    root.visible = false;
    item.isIndoors = true;
    st.walking = false;
    st.working = false;
    st.vel.x = 0; st.vel.z = 0;
    if (vb.t <= 0) {
      if (homeBldg) {
        acquireDoor();
        vb.state = 'exiting_house';
        vb.subT = 0;
        item.isIndoors = false;
        if (vd) vd.indoorsCount = Math.max(0, (vd.indoorsCount || 0) - 1);
        item.x = homeBldg.insideWorld.x;
        item.z = homeBldg.insideWorld.z;
        root.visible = true;
        root.scale.setScalar(0.55);
      } else {
        vb.state = 'work_at_station';
        vb.t = _rnd(3.0, 6.0);
        item.isIndoors = false;
        root.visible = true;
      }
    }
    return true;
  }

  let walkSpeed = 0;
  let isWork = false;
  let customY = null;
  let lookHead = 0;

  if (vb.state === 'entering_house' && homeBldg) {
    acquireDoor();
    vb.subT += dt / 0.95;
    const u = HC.clamp(vb.subT, 0, 1);
    const p0 = homeBldg.doorWorld;
    const p1 = homeBldg.insideWorld;
    item.x = p0.x + (p1.x - p0.x) * u;
    item.z = p0.z + (p1.z - p0.z) * u;
    customY = (p0.y !== undefined ? p0.y : groundFn(p0.x, p0.z)) * (1 - u)
      + (p1.y !== undefined ? p1.y : groundFn(p1.x, p1.z)) * u;
    vb.dir = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    walkSpeed = (st.speed || 3) * 0.42;
    const sc = u > 0.45 ? (1.0 - ((u - 0.45) / 0.55) * 0.45) : 1.0;
    root.scale.setScalar(sc);

    if (u >= 1) {
      releaseDoor();
      root.scale.setScalar(1.0);
      root.visible = false;
      item.isIndoors = true;
      if (vd) vd.indoorsCount = (vd.indoorsCount || 0) + 1;
      const isNight = world && world.currentMoodKey === 'night';
      vb.state = 'indoors';
      vb.t = isNight ? _rnd(10.0, 18.0) : _rnd(6.5, 13.0);
      st.walking = false;
      st.vel.x = 0; st.vel.z = 0;
      return true;
    }
  } else if (vb.state === 'exiting_house' && homeBldg) {
    acquireDoor();
    vb.subT += dt / 1.15;
    const u = HC.clamp(vb.subT, 0, 1);
    const p0 = homeBldg.insideWorld;
    const p1 = homeBldg.doorWorld;
    const p2 = homeBldg.approachWorld;
    if (u < 0.48) {
      const a = u / 0.48;
      item.x = p0.x + (p1.x - p0.x) * a;
      item.z = p0.z + (p1.z - p0.z) * a;
      customY = (p0.y !== undefined ? p0.y : groundFn(p0.x, p0.z)) * (1 - a)
        + (p1.y !== undefined ? p1.y : groundFn(p1.x, p1.z)) * a;
      vb.dir = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      root.scale.setScalar(0.55 + a * 0.45);
    } else {
      const a = (u - 0.48) / 0.52;
      item.x = p1.x + (p2.x - p1.x) * a;
      item.z = p1.z + (p2.z - p1.z) * a;
      customY = (p1.y !== undefined ? p1.y : groundFn(p1.x, p1.z)) * (1 - a)
        + groundFn(p2.x, p2.z) * a;
      vb.dir = Math.atan2(p2.x - p1.x, p2.z - p1.z);
      root.scale.setScalar(1.0);
    }
    walkSpeed = (st.speed || 3) * 0.45;
    if (u >= 1) {
      releaseDoor();
      root.scale.setScalar(1.0);
      vb.cyclesDone = 0;
      vb.nextHomeCycles = 2 + Math.floor(Math.random() * 3);
      vb.stationIdx = (vb.stationIdx + 1) % stations.length;
      vb.target = stations[vb.stationIdx];
      vb.state = 'walk_to_target';
      vb.t = 9.0;
    }
  } else if (vb.state === 'going_home' && homeBldg) {
    const dest = vb.goingToDoor ? homeBldg.doorWorld : homeBldg.approachWorld;
    const dx = dest.x - item.x;
    const dz = dest.z - item.z;
    const d = Math.hypot(dx, dz);
    const sp = (st.speed || 3.0) * Math.max(0.45, prof.walk || 0.5);
    vb.t -= dt;

    if (d < 0.45 || vb.t <= 0) {
      if (!vb.goingToDoor) {
        vb.goingToDoor = true;
        vb.t = 4.0;
        acquireDoor();
      } else {
        vb.goingToDoor = false;
        vb.state = 'entering_house';
        vb.subT = 0;
      }
    } else {
      vb.dir = Math.atan2(dx, dz);
      item.x += (dx / d) * sp * dt;
      item.z += (dz / d) * sp * dt;
      walkSpeed = sp;
      if (vb.goingToDoor && homeBldg.approachWorld && homeBldg.doorWorld.y !== undefined) {
        const totalD = Math.max(0.4, Math.hypot(homeBldg.doorWorld.x - homeBldg.approachWorld.x, homeBldg.doorWorld.z - homeBldg.approachWorld.z));
        const prog = HC.clamp(1.0 - d / totalD, 0, 1);
        customY = groundFn(item.x, item.z) * (1 - prog) + homeBldg.doorWorld.y * prog;
      } else if (!vb.goingToDoor && world && typeof world.resolveCircleCollision === 'function') {
        const colRes = world.resolveCircleCollision(item.x, item.z, 0.34);
        if (colRes.hit) {
          item.x = colRes.x;
          item.z = colRes.z;
        }
      }
    }
  } else if (vp.behindStall && vp.workKind === 'shop') {
    // Pedagang berjaga tepat di belakang meja/bangunan toko menghadap pembeli
    const post = stations[0];
    if (post) {
      item.x = post.x;
      item.z = post.z;
      if (vp.fixedY !== null && vp.fixedY !== undefined) customY = vp.fixedY;
      if (distH < prof.face) {
        vb.dir = Math.atan2(dxH, dzH);
      } else if (post.faceX !== undefined && post.faceZ !== undefined) {
        vb.dir = Math.atan2(post.faceX - item.x, post.faceZ - item.z);
      }
      lookHead = Math.sin((item._vClock = (item._vClock || 0) + dt) * 1.1) * 0.18;
    }
    vb.state = 'work_at_station';
  } else if (vp.workKind === 'farm' && vp.farmPlot && Array.isArray(vp.farmPlot.tiles) && vp.farmPlot.tiles.length) {
    // Siklus petani nyata: pilih petak matang/kosong -> berjalan -> panen/tanam -> setor hasil panen ke toko desa
    const farmPlot = vp.farmPlot;
    const sp = (st.speed || 3.0) * 0.52;
    const pickNextFarmTile = () => {
      let ripe = -1, empty = -1;
      for (let ti = 0; ti < farmPlot.tiles.length; ti++) {
        const tl = farmPlot.tiles[ti];
        if (tl.stage === 2 && ripe < 0) ripe = ti;
        if (tl.stage === 0 && empty < 0) empty = ti;
      }
      if (ripe >= 0) return { idx: ripe, action: 'harvest' };
      if (empty >= 0) return { idx: empty, action: 'plant' };
      return null;
    };

    if (vb.state === 'deliver_shop') {
      const drop = vp.shopDrop || stations[0];
      const dx = drop.x - item.x, dz = drop.z - item.z;
      const d = Math.hypot(dx, dz);
      vb.t -= dt;
      if (d < 0.75 || vb.t <= 0) {
        vb.state = 'deliver_unload';
        vb.t = 2.0;
        if (drop.faceX !== undefined && drop.faceZ !== undefined) {
          vb.dir = Math.atan2(drop.faceX - item.x, drop.faceZ - item.z);
        }
      } else {
        vb.dir = Math.atan2(dx, dz);
        item.x += (dx / d) * sp * dt;
        item.z += (dz / d) * sp * dt;
        walkSpeed = sp;
        if (world && typeof world.resolveCircleCollision === 'function') {
          const colRes = world.resolveCircleCollision(item.x, item.z, 0.34);
          if (colRes.hit) { item.x = colRes.x; item.z = colRes.z; }
        }
      }
    } else if (vb.state === 'deliver_unload') {
      vb.t -= dt;
      if (vb.t <= 0) {
        if (vb.carriedCrops > 0 && world && world.addVillageShopStock) {
          world.addVillageShopStock(vp.villageRef || vp.villageId, vb.carriedCrops);
        }
        vb.carriedCrops = 0;
        vb.state = 'farm_seek';
        vb.t = 0.2;
      }
    } else if (vb.state === 'farm_work') {
      const tile = farmPlot.tiles[vb.farmTileIdx];
      vb.t -= dt;
      isWork = true;
      vb.harvest = (vb.farmAction === 'harvest');
      if (tile) vb.dir = Math.atan2(tile.x - item.x, tile.z - item.z);
      if (vb.t <= 0) {
        if (tile && vb.farmAction === 'harvest' && tile.stage === 2 && world && world.harvestFarmTile) {
          world.harvestFarmTile(farmPlot, tile.index, false);
          vb.carriedCrops = (vb.carriedCrops || 0) + 1;
        } else if (tile && vb.farmAction === 'plant' && tile.stage === 0 && world && world.plantFarmTile) {
          world.plantFarmTile(farmPlot, tile.index);
        }
        const nextJob = pickNextFarmTile();
        if (vb.carriedCrops >= 2 || (vb.carriedCrops > 0 && (!nextJob || nextJob.action !== 'harvest'))) {
          vb.state = 'deliver_shop';
          vb.t = 18.0;
        } else {
          vb.state = 'farm_seek';
          vb.t = 0.2;
        }
      }
    } else if (vb.state === 'farm_walk') {
      const tile = farmPlot.tiles[vb.farmTileIdx];
      if (!tile) {
        vb.state = 'farm_seek';
      } else {
        const dx = tile.x - item.x, dz = tile.z - item.z;
        const d = Math.hypot(dx, dz);
        vb.t -= dt;
        if (d < 0.78 || vb.t <= 0) {
          vb.state = 'farm_work';
          vb.t = 3.2;
          vb.dir = Math.atan2(tile.x - item.x, tile.z - item.z);
        } else {
          vb.dir = Math.atan2(dx, dz);
          item.x += (dx / d) * sp * dt;
          item.z += (dz / d) * sp * dt;
          walkSpeed = sp;
          if (world && typeof world.resolveCircleCollision === 'function') {
            const colRes = world.resolveCircleCollision(item.x, item.z, 0.34);
            if (colRes.hit) { item.x = colRes.x; item.z = colRes.z; }
          }
        }
      }
    } else {
      // farm_seek / idle menunggu tanaman tumbuh
      vb.t -= dt;
      if (vb.t <= 0 || vb.state !== 'farm_idle') {
        const job = pickNextFarmTile();
        if (job) {
          vb.farmTileIdx = job.idx;
          vb.farmAction = job.action;
          vb.state = 'farm_walk';
          vb.t = 14.0;
        } else {
          vb.state = 'farm_idle';
          vb.t = 2.5;
          vb.dir = Math.atan2(farmPlot.x - item.x, farmPlot.z - item.z);
          lookHead = Math.sin((item._vClock = (item._vClock || 0) + dt) * 1.1) * 0.25;
        }
      }
    }
  } else if (vb.state === 'walk_to_target') {
    const tgt = vb.target || stations[0];
    const dx = tgt.x - item.x;
    const dz = tgt.z - item.z;
    const d = Math.hypot(dx, dz);
    const sp = (st.speed || 3.0) * Math.max(0.45, prof.walk || 0.5);
    vb.t -= dt;

    if (d < 0.52 || vb.t <= 0) {
      vb.state = 'work_at_station';
      const isShop = vp.workKind === 'shop';
      const isPatrol = vp.workKind === 'patrol';
      vb.t = isShop ? _rnd(7.0, 12.0) : isPatrol ? _rnd(2.6, 4.8) : _rnd(4.5, 8.5);
      if (tgt.faceX !== undefined && tgt.faceZ !== undefined) {
        vb.dir = Math.atan2(tgt.faceX - item.x, tgt.faceZ - item.z);
      }
    } else {
      vb.dir = Math.atan2(dx, dz);
      item.x += (dx / d) * sp * dt;
      item.z += (dz / d) * sp * dt;
      walkSpeed = sp;
      if (world && typeof world.resolveCircleCollision === 'function') {
        const colRes = world.resolveCircleCollision(item.x, item.z, 0.34);
        if (colRes.hit) {
          item.x = colRes.x;
          item.z = colRes.z;
          // Slide slightly around obstacle toward target
          const perpX = -dz / d, perpZ = dx / d;
          item.x += perpX * sp * 0.4 * dt;
          item.z += perpZ * sp * 0.4 * dt;
        }
      }
    }
  } else {
    // ---- work_at_station ----
    vb.t -= dt;
    isWork = vp.workKind === 'farm' || vp.workKind === 'mine' || vp.workKind === 'forage';
    const tgt = vb.target || stations[0];
    if (distH < prof.face) {
      vb.dir = Math.atan2(dxH, dzH);
    } else if (tgt.faceX !== undefined && tgt.faceZ !== undefined) {
      vb.dir = Math.atan2(tgt.faceX - item.x, tgt.faceZ - item.z);
    }
    if (vp.workKind === 'patrol') {
      lookHead = Math.sin((item._vClock = (item._vClock || 0) + dt) * 1.4) * 0.42;
    }

    if (distH < 1.85) {
      const away = Math.atan2(-dxH, -dzH);
      item.x += Math.sin(away) * 1.4 * dt;
      item.z += Math.cos(away) * 1.4 * dt;
    }

    if (vb.t <= 0) {
      vb.cyclesDone++;
      const maxIndoors = (world && world.currentMoodKey === 'night') ? 2 : 1;
      const curIndoors = vd ? (vd.indoorsCount || 0) : 0;
      const nightBias = (world && world.currentMoodKey === 'night') ? 0.72 : 0.45;
      if (vp.canEnterHouse && homeBldg && vb.cyclesDone >= vb.nextHomeCycles
        && curIndoors < maxIndoors && Math.random() < nightBias) {
        vb.state = 'going_home';
        vb.goingToDoor = false;
        vb.t = 14.0;
      } else {
        vb.stationIdx = vp.workKind === 'patrol'
          ? (vb.stationIdx + 1) % stations.length
          : (stations.length > 1 ? ((vb.stationIdx + 1 + Math.floor(Math.random() * (stations.length - 1))) % stations.length) : 0);
        vb.target = stations[vb.stationIdx];
        vb.state = 'walk_to_target';
        vb.t = 12.0;
      }
    }
  }

  const gy = customY !== null ? customY : groundFn(item.x, item.z);
  root.visible = true;
  root.position.set(item.x, gy, item.z);
  root.rotation.y = vb.dir;

  st.pos.copy(root.position);
  st.vel.x = walkSpeed ? Math.sin(vb.dir) * walkSpeed : 0;
  st.vel.z = walkSpeed ? Math.cos(vb.dir) * walkSpeed : 0;
  st.walking = walkSpeed > 0.01;
  st.working = isWork;
  st.speed = st.speed || st.role.speed || 3;
  if (isWork && vp.workKind === 'farm') {
    st.farmT = 1;
    st.farmTask = vb.harvest ? { action: 'harvest' } : { action: 'plant' };
  } else { st.farmT = 0; st.farmTask = null; }
  st.mineT = (isWork && vp.workKind === 'mine') ? 1 : 0;
  st.forageT = (isWork && vp.workKind === 'forage') ? 1 : 0;
  st.healT = (isWork && vp.workKind === 'forage') ? 1 : 0;

  if (prof.act > 0 && vb.state === 'work_at_station') {
    vb.actT -= dt;
    if (vb.actT <= 0) {
      vb.actT = prof.act * _rnd(0.75, 1.4);
      vb.swingT = NPC_SWING_PULSE;
      if (vp.workKind === 'farm') vb.harvest = !vb.harvest;
    }
  }
  st.swing = vb.swingT > 0 ? vb.swingT : 0;
  if (vb.swingT > 0) vb.swingT = Math.max(0, vb.swingT - dt);
  st.headAngle = lookHead;

  const lodRec = root.userData && root.userData.__npcLod;
  if (!(lodRec && lodRec.on)) HC.animateNPC(root, dt);
  return true;
}

/* Satu tick AI untuk NPC liar: pilih fase (diam/jalan/kerja), gerakkan root di
   atas terrain, isi state yang dibaca animate(), lalu animasikan. */
HC.updateWildNPC = function (item, dt, horse, world, rigCtx = null) {
  const root = item.root, st = root && root.userData && root.userData.npc;
  if (!st) return;
  const activeRig = rigCtx || HC._activeRigCtx || (world && world._rigObsCtx) || null;
  if (HC.combatAI && HC.mobs && HC.combatAI.stepWild(item, dt || 1 / 60, horse, world)) return;
  if (item.villageProfile && updateVillageResident(item, dt || 1 / 60, horse, world)) {
    if (activeRig && HC.resolveRigObstacle && !item.villageProfile.behindStall) {
      const rigRes = HC.resolveRigObstacle(item.x, item.z, 0.36, activeRig.horse, activeRig.cart);
      if (rigRes.hit) {
        item.x = rigRes.x;
        item.z = rigRes.z;
        const gyR = (world && world.heightAt) ? world.heightAt(item.x, item.z) : (world && world.terrainHeightAt) ? world.terrainHeightAt(item.x, item.z) : 0;
        root.position.set(item.x, gyR, item.z);
        st.pos.copy(root.position);
      }
    }
    return;
  }
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
    if (world && typeof world.resolveCircleCollision === 'function') {
      const colRes = world.resolveCircleCollision(item.x, item.z, 0.34);
      if (colRes.hit) {
        item.x = colRes.x; item.z = colRes.z;
        b.dir = Math.atan2(colRes.nx, colRes.nz) + (b.turnSign || 1) * 0.45;
        b.turnSign = -(b.turnSign || 1);
      }
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

  if (activeRig && HC.resolveRigObstacle) {
    const rigRes = HC.resolveRigObstacle(item.x, item.z, 0.36, activeRig.horse, activeRig.cart);
    if (rigRes.hit) {
      item.x = rigRes.x;
      item.z = rigRes.z;
      b.dir = Math.atan2(rigRes.nx, rigRes.nz);
      walkSpeed = 0;
    }
  }

  const gy = (world && world.heightAt) ? world.heightAt(item.x, item.z) : (world && world.terrainHeightAt) ? world.terrainHeightAt(item.x, item.z) : 0;
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
      b.swingT = NPC_SWING_PULSE;
      if (prof.work === 'farm') b.harvest = !b.harvest;
    }
  }
  st.swing = b.swingT > 0 ? b.swingT : 0;
  if (b.swingT > 0) b.swingT = Math.max(0, b.swingT - dt);
  // Kepala selalu "lurus" karena root sudah diputar hadap kuda; jangan kirim
  // undefined, model lain memakai n.headAngle langsung di lerp().
  st.headAngle = 0;

  // Warga yang sedang pakai LOD statis tidak perlu dianimasikan: pose-nya
  // memang dibekukan, dan animate() di 18 model itu biaya CPU nyata.
  const lodRec = root.userData && root.userData.__npcLod;
  if (!(lodRec && lodRec.on)) HC.animateNPC(root, dt);
};

/* ============================================================================
   PARTY — rekrut NPC liar, jalan ke belakang gerobak, naik/turun kursi, & kawal.
   ============================================================================ */
HC.NPCParty = class {
  _text(key, fallback, vars = null) {
    this._lastMessageData = { key, fallback, vars: vars ? { ...vars } : null };
    if (typeof HC.t === 'function') return HC.t(key, vars);
    let text = fallback;
    if (vars && typeof text === 'string') {
      for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }
  refreshMessageLanguage() {
    const data = this._lastMessageData;
    if (!data) return;
    const vars = data.vars ? { ...data.vars } : null;
    if (vars && vars.role) {
      if ('name' in vars) vars.name = vars.role.name;
      if ('skill' in vars) vars.skill = vars.role.skill.name;
      if ('note' in vars) vars.note = HC.npcSkillFx(vars.role).note;
    }
    this.lastMessage = (HC && typeof HC.t === 'function') ? HC.t(data.key, vars) : data.fallback;
  }
  constructor(scene) {
    this.scene = scene;
    this.roles = HC.NPC_RECRUITABLE;
    this.squad = [];
    this.members = [];
    this.questPassengers = [];
    this.hasCart = true;
    this._nextUid = 1;
    this.cart = null;
    this.onChange = null;
    this.wild = [];
    this.nextRole = 0;
    this.lastHorse = { x: 0, z: 0, yaw: 0 };
    this.lastMessage = this._text('npc_msg_default', 'NPC tinggal di kamp/pos. Deketin kelompoknya buat rekrut.');
    this._clearT = {};
    this._clock = 0;
    // Kelompok warga permanen dari peta. Tidak ada spawn mengikuti arah kuda.
    this._spawnSettlements();
  }
  bindCart(cart) {
    this.cart = cart;
  }
  _notify() {
    if (typeof this.onChange === 'function') {
      try { this.onChange(); } catch (e) { /* no-op */ }
    }
  }
  // NPC liar & regu berdiri di atas permukaan terrain/batu, bukan di y=0 (medan sekarang berbukit).
  _groundY(x, z) {
    return (this.world && this.world.heightAt) ? this.world.heightAt(x, z)
      : (this.world && this.world.terrainHeightAt) ? this.world.terrainHeightAt(x, z) : 0;
  }
  _spawnSettlements() {
    const spawns = (HC.MAP && HC.MAP.allNPCSpawns) ? HC.MAP.allNPCSpawns() : [];
    this.wild = [];
    for (let i = 0; i < spawns.length; i++) this._spawnFromAnchor(i, spawns[i]);
  }
  _spawnFromAnchor(slot, anchor) {
    const role = HC.NPC_ROLES.find((r) => r.id === anchor.role) || this.roles[this.nextRole++ % this.roles.length];
    const old = this.wild[slot];
    if (old && old._hpBar) { old._hpBar.dispose(); old._hpBar = null; }
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
    // Hook optimasi (mis. merge mesh NPC untuk HP kentang di js/perf.js).
    // Error di hook TIDAK boleh menggagalkan spawn warga.
    if (typeof HC.onNPCSpawn === 'function') {
      try { HC.onNPCSpawn(item); } catch (e) { HC.npcSpawnHookError = (e && e.message) || String(e); }
    }
    return item;
  }
  _seatDefs(cart) {
    const spec = (cart && cart.specs && cart.specs.capSpec) || { bedHalfL: 32 };
    const xBack = -spec.bedHalfL;
    const x0 = xBack + 3, x1 = -6, span = x1 - x0;
    const xA = x0 + span * 0.28, xB = x0 + span * 0.72, z = 9.3;
    /* Model Sylvan menghadap +Z lokal: bangku +Z diputar PI agar menghadap lorong (-Z),
       sedangkan bangku -Z tetap rotasi 0 agar menghadap lorong (+Z). */
    return [
      { x: xA, z: z, rot: Math.PI },
      { x: xA, z: -z, rot: 0 },
      { x: xB, z: z, rot: Math.PI },
      { x: xB, z: -z, rot: 0 },
    ];
  }
  clearQuestPassengers(cart = this.cart) {
    if (cart && cart.body) {
      for (const qp of this.questPassengers || []) {
        if (qp.seatRoot && qp.seatRoot.parent) qp.seatRoot.parent.remove(qp.seatRoot);
        if (Array.isArray(cart.npcPassengers)) {
          const i = cart.npcPassengers.indexOf(qp.seatRoot);
          if (i >= 0) cart.npcPassengers.splice(i, 1);
        }
      }
    }
    this.questPassengers = [];
  }
  boardQuestPassengers(roles = [], cart = this.cart) {
    const c = cart || this.cart;
    this.clearQuestPassengers(c);
    const list = Array.isArray(roles) ? roles.slice(0, 2) : [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r) continue;
      const role = typeof r === 'string' ? (HC.NPC_BY_ID(r) || HC.NPC_ROLES[0]) : r;
      const seatIndex = 2 + i;
      let seatRoot = null;
      if (c && c.body) {
        const seats = this._seatDefs(c);
        const seat = seats[seatIndex % seats.length];
        seatRoot = HC.buildNPC(role, 'sit');
        const vs = HC.cartVS || 0.075;
        seatRoot.position.x = seat.x * vs;
        seatRoot.position.z = seat.z * vs;
        seatRoot.rotation.y = seat.rot;
        seatRoot.userData.npcRoleId = role.id;
        seatRoot.userData.isQuestPassenger = true;
        c.body.add(seatRoot);
        c.npcPassengers = c.npcPassengers || [];
        c.npcPassengers.push(seatRoot);
      }
      this.questPassengers.push({ role, seatIndex, seatRoot });
    }
    return this.questPassengers.length;
  }
  _attachQuestPassengers(cart = this.cart) {
    const c = cart || this.cart;
    if (!c || !c.body || !this.questPassengers || !this.questPassengers.length) return;
    const seats = this._seatDefs(c);
    const vs = HC.cartVS || 0.075;
    c.npcPassengers = c.npcPassengers || [];
    for (const qp of this.questPassengers) {
      const seat = seats[qp.seatIndex % seats.length];
      const seatRoot = HC.buildNPC(qp.role, 'sit');
      seatRoot.position.x = seat.x * vs;
      seatRoot.position.z = seat.z * vs;
      seatRoot.rotation.y = seat.rot;
      seatRoot.userData.npcRoleId = qp.role.id;
      seatRoot.userData.isQuestPassenger = true;
      c.body.add(seatRoot);
      c.npcPassengers.push(seatRoot);
      qp.seatRoot = seatRoot;
    }
  }
  _cartCenterWorld(cart) {
    if (cart && cart.root && cart.root.position && HC.THREE) {
      let yaw = this.lastHorse.yaw || 0;
      if (cart.body) {
        cart.root.updateMatrixWorld(true);
        const fwd = new HC.THREE.Vector3(1, 0, 0);
        const q = new HC.THREE.Quaternion();
        cart.body.getWorldQuaternion(q);
        fwd.applyQuaternion(q);
        yaw = Math.atan2(-fwd.z, fwd.x);
      }
      return { x: cart.root.position.x, z: cart.root.position.z, yaw };
    }
    const hy = this.lastHorse.yaw || 0;
    const d = HC.hitchDist || 4.2;
    return {
      x: this.lastHorse.x - Math.cos(hy) * d,
      z: this.lastHorse.z + Math.sin(hy) * d,
      yaw: hy,
    };
  }
  _cartRearWorld(cart, extraBack = 1.05, lateral = 0) {
    const bedHalfL = (cart && cart.specs && cart.specs.capSpec && cart.specs.capSpec.bedHalfL) || 32;
    const vs = HC.cartVS || 0.075;
    if (cart && cart.root && cart.body && HC.THREE) {
      cart.root.updateMatrixWorld(true);
      const v = new HC.THREE.Vector3(-(bedHalfL * vs) - extraBack, 0, lateral).applyMatrix4(cart.body.matrixWorld);
      const cc = this._cartCenterWorld(cart);
      return { x: v.x, z: v.z, yaw: cc.yaw };
    }
    const cc = this._cartCenterWorld(cart);
    const fx = Math.cos(cc.yaw), fz = -Math.sin(cc.yaw);
    const lx = -fz, lz = fx;
    const back = bedHalfL * vs + extraBack;
    return {
      x: cc.x - fx * back + lx * lateral,
      z: cc.z - fz * back + lz * lateral,
      yaw: cc.yaw,
    };
  }
  _syncDefaultPassengers(cart) {
    if (!cart) return;
    const hasSquad = this.members.length > 0;
    for (const p of cart.passengers || []) {
      if (p && p.root) p.root.visible = !hasSquad;
    }
  }
  _detachSeated(member, cart) {
    if (member && member.seatRoot) {
      if (member.seatRoot.parent) member.seatRoot.parent.remove(member.seatRoot);
      const c = cart || this.cart;
      if (c && Array.isArray(c.npcPassengers)) {
        const idx = c.npcPassengers.indexOf(member.seatRoot);
        if (idx >= 0) c.npcPassengers.splice(idx, 1);
      }
      member.seatRoot = null;
    }
  }
  _spawnStanding(member, x, z, dir) {
    if (member.root) this.scene.remove(member.root);
    const root = HC.buildNPC(member.role, 'stand');
    root.position.set(x, this._groundY(x, z), z);
    if (root.rotation) root.rotation.y = dir;
    this.scene.add(root);
    member.root = root;
    member.x = x;
    member.z = z;
    member.dir = dir;
    member.hopFrom = null;
    member.boardT = 0;
    return root;
  }
  _attachSeated(member, cart) {
    const c = cart || this.cart;
    if (member.root) {
      this.scene.remove(member.root);
      member.root = null;
    }
    this._detachSeated(member, c);
    if (c && c.body) {
      const seats = this._seatDefs(c);
      const seat = seats[member.seatIndex % seats.length];
      const seatRoot = HC.buildNPC(member.role, 'sit');
      const vs = HC.cartVS || 0.075;
      seatRoot.position.x = seat.x * vs;
      seatRoot.position.z = seat.z * vs;
      seatRoot.rotation.y = seat.rot;
      seatRoot.userData.npcRoleId = member.role.id;
      c.body.add(seatRoot);
      c.npcPassengers = c.npcPassengers || [];
      c.npcPassengers.push(seatRoot);
      member.seatRoot = seatRoot;
    }
    member.state = 'seated';
    member.inCombat = false;
    if (member._hpBar) member._hpBar.hideNow();
    if (member.cBrain) member.cBrain.targetBoar = null;
    member.boardT = 0;
    member.hopFrom = null;
    this._syncDefaultPassengers(c);
    this._notify();
  }
  _turnToward(cur, tgt, rate, dt) {
    let diff = ((tgt - cur + Math.PI) % (Math.PI * 2));
    if (diff < 0) diff += Math.PI * 2;
    diff -= Math.PI;
    const step = rate * dt;
    return Math.abs(diff) <= step ? tgt : cur + Math.sign(diff) * step;
  }
  _dropMemberCargo(m, physics = this.physics) {
    if (!m) return;
    if (physics && typeof physics.releaseCargoClaim === 'function') {
      physics.releaseCargoClaim(m.uid);
    } else if (m.haulItem) {
      m.haulItem.carriedBy = null;
      m.haulItem.claimedBy = null;
    }
    m.haulItem = null;
    m.carryingCargo = false;
    m.haulPickT = 0;
  }
  _clearWaterTask(m, reason = null) {
    if (!m) return;
    if (m.bucketMesh && m.bucketMesh.parent) m.bucketMesh.parent.remove(m.bucketMesh);
    m.bucketMesh = null;
    if (m.waterTask) {
      const cb = m.waterTask.onCancel;
      m.waterTask = null;
      if (reason && typeof cb === 'function') {
        try { cb(reason); } catch (e) { /* no-op */ }
      }
    }
  }
  startWaterRefillTask(waterSource, barrelItem, cart = this.cart, callbacks = {}) {
    if (!waterSource || !barrelItem) return { ok: false, reason: 'invalid' };
    if ((barrelItem.charges || 0) >= (barrelItem.maxCharges || 5)) return { ok: false, reason: 'full' };
    if (this.physics && this.physics.flipped) return { ok: false, reason: 'flipped' };
    if (!this.members || !this.members.length) return { ok: false, reason: 'no_npc' };
    const existing = this.members.find((it) => it.state === 'fetching_water');
    if (existing) return { ok: false, reason: 'busy', member: existing };

    const m = this.members.find((it) => it.state === 'following') || this.members[0];
    if (m.state === 'seated' || m.state === 'hopping_in' || m.state === 'boarding') {
      this.disembarkMember(m.uid);
    }
    this._dropMemberCargo(m, this.physics);
    if (m.cBrain) m.cBrain.targetBoar = null;
    m.inCombat = false;

    if (m.root && HC.makeWaterBucketMesh) {
      if (m.bucketMesh && m.bucketMesh.parent) m.bucketMesh.parent.remove(m.bucketMesh);
      const bk = HC.makeWaterBucketMesh();
      bk.position.set(0.28, 0.56, 0.24);
      m.root.add(bk);
      m.bucketMesh = bk;
    }

    m.state = 'fetching_water';
    m.waterTask = {
      waterSource,
      barrelItem,
      cart: cart || this.cart,
      step: 'to_water',
      waitT: 0,
      onProgress: callbacks.onProgress || null,
      onDone: callbacks.onDone || null,
      onCancel: callbacks.onCancel || null,
    };
    this._notify();
    return { ok: true, member: m };
  }
  _updateMember(m, dt, hx, hz, hyaw, cart, physics) {
    const root = m.root;
    if (!root || !HC.THREE) return;
    const st = root.userData && root.userData.npc;
    const c = cart || this.cart;
    const cc = this._cartCenterWorld(c);
    const rigSpd = physics ? Math.hypot(physics.vel.x, physics.vel.z) : 0;
    const flipLock = !!(physics && physics.flipped);
    const resolveProps = (rad = 0.34, skipRig = false) => {
      let hitAny = false;
      if (this.world && typeof this.world.resolveCircleCollision === 'function') {
        const res = this.world.resolveCircleCollision(m.x, m.z, rad);
        if (res.hit) { m.x = res.x; m.z = res.z; hitAny = true; }
      }
      if (!skipRig && HC.resolveRigObstacle) {
        const rigRes = HC.resolveRigObstacle(
          m.x,
          m.z,
          rad,
          { x: hx, z: hz, yaw: hyaw, speed: this._horseMoveSpd || 0 },
          (this.hasCart !== false && c && physics) ? { x: cc.x, z: cc.z, yaw: cc.yaw, speed: physics.forwardSpeed || 0, active: true } : null
        );
        if (rigRes.hit) { m.x = rigRes.x; m.z = rigRes.z; hitAny = true; }
      }
      return hitAny;
    };

    if (m.state === 'fetching_water') {
      const wt = m.waterTask;
      const ws = wt && wt.waterSource;
      const bar = wt && wt.barrelItem;
      const maxC = (bar && bar.maxCharges) || 5;
      const cartDistWater = ws ? Math.hypot(cc.x - ws.x, cc.z - ws.z) : 999;
      if (!wt || !ws || !bar || flipLock || bar.spilled || (bar.charges || 0) >= maxC || cartDistWater > 28.0) {
        const doneCb = wt && wt.onDone;
        const alreadyFull = !!(bar && (bar.charges || 0) >= maxC);
        this._clearWaterTask(m, alreadyFull ? null : 'cancelled');
        if (alreadyFull && typeof doneCb === 'function') {
          try { doneCb(bar.charges, maxC, m); } catch (e) { /* no-op */ }
        }
        m.state = flipLock ? 'following' : 'boarding';
        m.boardT = 0;
        this._notify();
        return;
      }

      const cfx = Math.cos(cc.yaw), cfz = -Math.sin(cc.yaw);
      const clx = -cfz, clz = cfx;
      let tx = ws.x, tz = ws.z;
      let walkingNow = false;
      let workingNow = false;
      const preMoveX = m.x, preMoveZ = m.z;

      if (wt.step === 'to_water') {
        tx = ws.x; tz = ws.z;
        const dx = tx - m.x, dz = tz - m.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.78) {
          const sp = 3.2;
          const mv = Math.min(d, sp * dt);
          m.x += (dx / d) * mv;
          m.z += (dz / d) * mv;
          m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 9.0, dt);
          walkingNow = true;
        } else {
          wt.step = 'scooping';
          wt.waitT = 0.72;
          _armSwing(m);
        }
      } else if (wt.step === 'scooping') {
        m.dir = this._turnToward(m.dir, Math.atan2(ws.waterX - m.x, ws.waterZ - m.z), 9.0, dt);
        workingNow = true;
        wt.waitT -= dt;
        if (wt.waitT <= 0) {
          if (m.bucketMesh && m.bucketMesh.userData && m.bucketMesh.userData.waterDisc) {
            m.bucketMesh.userData.waterDisc.visible = true;
          }
          wt.step = 'to_cart';
        }
      } else if (wt.step === 'to_cart') {
        const side = ((ws.x - cc.x) * clx + (ws.z - cc.z) * clz) >= 0 ? 1 : -1;
        tx = cc.x + cfx * 0.45 + clx * side * 1.66;
        tz = cc.z + cfz * 0.45 + clz * side * 1.66;
        const dx = tx - m.x, dz = tz - m.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.75) {
          const sp = 2.85;
          const mv = Math.min(d, sp * dt);
          m.x += (dx / d) * mv;
          m.z += (dz / d) * mv;
          m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 9.0, dt);
          walkingNow = true;
        } else {
          wt.step = 'pouring';
          wt.waitT = 0.55;
          _armSwing(m);
        }
      } else if (wt.step === 'pouring') {
        m.dir = this._turnToward(m.dir, Math.atan2(cc.x - m.x, cc.z - m.z), 9.0, dt);
        workingNow = true;
        wt.waitT -= dt;
        if (wt.waitT <= 0) {
          bar.charges = Math.min(maxC, (bar.charges || 0) + 1);
          if (m.bucketMesh && m.bucketMesh.userData && m.bucketMesh.userData.waterDisc) {
            m.bucketMesh.userData.waterDisc.visible = false;
          }
          if (typeof wt.onProgress === 'function') {
            try { wt.onProgress(bar.charges, maxC, m); } catch (e) { /* no-op */ }
          }
          if (bar.charges >= maxC) {
            const doneCb = wt.onDone;
            this._clearWaterTask(m);
            m.state = 'boarding';
            m.boardT = 0;
            this._notify();
            if (typeof doneCb === 'function') {
              try { doneCb(bar.charges, maxC, m); } catch (e) { /* no-op */ }
            }
            return;
          }
          wt.step = 'to_water';
        }
      }

      const blocked = resolveProps(0.32);
      if (walkingNow && blocked) {
        const ddx = tx - m.x, ddz = tz - m.z;
        const dd = Math.hypot(ddx, ddz);
        if (dd > 1e-4) {
          const px = -ddz / dd, pz = ddx / dd;
          if (!wt._skirtSign) {
            const crossC = (m.x - cc.x) * px + (m.z - cc.z) * pz;
            wt._skirtSign = crossC >= 0 ? 1 : -1;
          }
          m.x += px * wt._skirtSign * 3.1 * dt;
          m.z += pz * wt._skirtSign * 3.1 * dt;
          resolveProps(0.32);
        }
      } else if (!blocked) {
        wt._skirtSign = 0;
      }
      const gy = this._groundY(m.x, m.z);
      root.position.set(m.x, gy, m.z);
      root.rotation.set(0, m.dir, 0);
      if (st) {
        st.pos.copy(root.position);
        st.walking = walkingNow;
        st.working = workingNow;
        st.swing = _tickSwing(m, dt);
        st.vel.x = walkingNow ? Math.sin(m.dir) * 2.9 : 0;
        st.vel.z = walkingNow ? Math.cos(m.dir) * 2.9 : 0;
        st.headAngle = 0;
      }
      HC.animateNPC(root, dt);
      return;
    }

    if (m.state === 'boarding') {
      if (flipLock) {
        if (st) { st.walking = false; st.vel.x = 0; st.vel.z = 0; }
        HC.animateNPC(root, dt);
        return;
      }
      const rear = this._cartRearWorld(c, 0.95);
      const cfx = Math.cos(cc.yaw), cfz = -Math.sin(cc.yaw);
      const clx = -cfz, clz = cfx;
      const bedHalfL = ((c && c.specs && c.specs.capSpec && c.specs.capSpec.bedHalfL) || 32) * (HC.cartVS || 0.075);

      const relX = m.x - cc.x, relZ = m.z - cc.z;
      const mFwd = relX * cfx + relZ * cfz;
      const mLat = relX * clx + relZ * clz;

      // Jika NPC berada di depan/samping bak, arahkan dulu ke samping luar agar memutar lewat belakang (bukan menembus bak)
      let tgtX = rear.x, tgtZ = rear.z;
      const directDist = Math.hypot(rear.x - m.x, rear.z - m.z);
      if (mFwd > -(bedHalfL + 0.15) && Math.abs(mLat) < 1.85 && directDist > 0.9) {
        const side = mLat >= 0 ? 1 : -1;
        const backDist = bedHalfL + 1.05;
        tgtX = cc.x - cfx * backDist + clx * side * 2.05;
        tgtZ = cc.z - cfz * backDist + clz * side * 2.05;
      }

      const dx = tgtX - m.x, dz = tgtZ - m.z;
      const stepDist = Math.hypot(dx, dz);
      const sp = directDist > 4.0 ? Math.max(2.2, rigSpd + 1.8) : Math.max(1.55, rigSpd + 1.1);
      if (stepDist > 1e-4) {
        const move = Math.min(stepDist, sp * dt);
        m.x += (dx / stepDist) * move;
        m.z += (dz / stepDist) * move;
        m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 9.0, dt);
      }

      // Hindari menembus badan kuda atau gerobak saat memutar dari depan
      const dH = Math.hypot(m.x - hx, m.z - hz);
      if (dH < 1.35 && dH > 1e-4) {
        m.x = hx + ((m.x - hx) / dH) * 1.35;
        m.z = hz + ((m.z - hz) / dH) * 1.35;
      }
      const nRelX = m.x - cc.x, nRelZ = m.z - cc.z;
      const nFwd = nRelX * cfx + nRelZ * cfz;
      const dC = Math.hypot(nRelX, nRelZ);
      if (nFwd > -bedHalfL + 0.2 && dC < 1.50 && dC > 1e-4) {
        m.x = cc.x + (nRelX / dC) * 1.50;
        m.z = cc.z + (nRelZ / dC) * 1.50;
      }
      resolveProps(0.34);

      const gy = this._groundY(m.x, m.z);
      root.position.set(m.x, gy, m.z);
      root.rotation.y = m.dir;
      if (st) {
        st.pos.copy(root.position);
        st.vel.x = stepDist > 1e-4 ? (dx / stepDist) * sp : 0;
        st.vel.z = stepDist > 1e-4 ? (dz / stepDist) * sp : 0;
        st.walking = true;
        st.working = false;
        st.swing = 0;
        st.headAngle = 0;
      }
      HC.animateNPC(root, dt);

      if (Math.hypot(rear.x - m.x, rear.z - m.z) < 0.72) {
        if (c && c.body) {
          m.state = 'hopping_in';
          m.boardT = 0;
          m.hopFrom = { x: m.x, y: gy, z: m.z };
          this._notify();
        } else {
          this._attachSeated(m, c);
        }
      }
      return;
    }

    if (m.state === 'hopping_in') {
      if (flipLock || !c || !c.body) {
        m.state = 'following';
        this._notify();
        return;
      }
      m.boardT += dt / 0.38;
      const u = Math.max(0, Math.min(1, m.boardT));
      const seats = this._seatDefs(c);
      const seat = seats[m.seatIndex % seats.length];
      const vs = HC.cartVS || 0.075;
      c.root.updateMatrixWorld(true);
      const targetW = new HC.THREE.Vector3(seat.x * vs, 0.36, seat.z * vs).applyMatrix4(c.body.matrixWorld);
      const from = m.hopFrom || { x: m.x, y: this._groundY(m.x, m.z), z: m.z };
      const arc = Math.sin(Math.PI * u) * 0.45;
      const px = from.x + (targetW.x - from.x) * u;
      const py = from.y + (targetW.y - from.y) * u + arc;
      const pz = from.z + (targetW.z - from.z) * u;
      root.position.set(px, py, pz);
      m.x = px; m.z = pz;
      m.dir = this._turnToward(m.dir, cc.yaw + seat.rot, 12.0, dt);
      root.rotation.y = m.dir;
      if (st) {
        st.pos.copy(root.position);
        st.walking = false;
        st.vel.x = 0; st.vel.z = 0;
        st.swing = 0;
        st.headAngle = 0;
      }
      HC.animateNPC(root, dt);

      if (m.boardT >= 1) {
        this._attachSeated(m, c);
        this.lastMessage = this._text('npc_msg_boarded', `${m.role.e} ${m.role.name} sudah duduk di bangku gerobak.`, { e: m.role.e, name: m.role.name, role: m.role });
      }
      return;
    }

    // ---- state === 'fallen': terjatuh ke tanah saat gerobak terguling, lalu bangun ----
    if (m.state === 'fallen') {
      resolveProps(0.34);
      m.fallT = (m.fallT || 0) + dt / 0.90;
      const u = Math.max(0, Math.min(1, m.fallT));
      const tilt = u < 0.45
        ? Math.PI * 0.42
        : Math.PI * 0.42 * Math.max(0, 1 - (u - 0.45) / 0.55);
      const gy = this._groundY(m.x, m.z);
      root.position.set(m.x, gy + (u < 0.45 ? 0.14 : 0.04 * (1 - u)), m.z);
      root.rotation.set(tilt, m.dir, 0);
      if (st) {
        st.pos.copy(root.position);
        st.walking = false;
        st.working = false;
        st.vel.x = 0; st.vel.z = 0;
        st.swing = 0;
        st.headAngle = 0;
      }
      HC.animateNPC(root, dt);
      if (m.fallT >= 1) {
        root.rotation.set(0, m.dir, 0);
        m.state = m._wantHelpAfterFall ? 'helping_flip' : 'following';
        m._wantHelpAfterFall = false;
        m.roamPhase = 'roam';
        m.roamT = 0.4;
        this._notify();
      }
      return;
    }

    // ---- state === 'helping_flip': merapat ke samping gerobak terbalik & ikut mendorong ----
    if (m.state === 'helping_flip') {
      const cfx = Math.cos(cc.yaw), cfz = -Math.sin(cc.yaw);
      const clx = -cfz, clz = cfx;
      const side = (physics && physics.flipDir) ? -Math.sign(physics.flipDir) : -1;
      const along = (m.seatIndex - 1) * 1.15;
      const tgtX = cc.x + cfx * along + clx * side * 1.75;
      const tgtZ = cc.z + cfz * along + clz * side * 1.75;
      const dx = tgtX - m.x, dz = tgtZ - m.z;
      const dist = Math.hypot(dx, dz);
      let walkingNow = false;
      if (dist > 0.35) {
        const sp = 3.2;
        const move = Math.min(dist, sp * dt);
        m.x += (dx / dist) * move;
        m.z += (dz / dist) * move;
        m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 9.0, dt);
        walkingNow = true;
      } else {
        m.dir = this._turnToward(m.dir, Math.atan2(cc.x - m.x, cc.z - m.z), 9.0, dt);
        m.flipPulseT = (m.flipPulseT ?? 0) - dt;
        if (m.flipPulseT <= 0) { m.flipPulseT = 0.62; _armSwing(m); }
      }
      if (walkingNow) m.swingPulse = 0;
      resolveProps(0.34);
      const gy = this._groundY(m.x, m.z);
      root.position.set(m.x, gy, m.z);
      root.rotation.set(0, m.dir, 0);
      if (st) {
        st.pos.copy(root.position);
        st.walking = walkingNow;
        st.working = !walkingNow;
        st.swing = walkingNow ? 0 : _tickSwing(m, dt);
        st.vel.x = walkingNow ? (dx / dist) * 3.2 : 0;
        st.vel.z = walkingNow ? (dz / dist) * 3.2 : 0;
        st.headAngle = 0;
      }
      HC.animateNPC(root, dt);
      return;
    }

    // ---- state === 'farm_job': NPC rekrutan bekerja paruh waktu memanen & mengantar hasil ke toko desa ----
    if (m.state === 'farm_job') {
      const job = this._farmJob;
      const farmPlot = job && job.farmPlot;
      if (!job || !farmPlot || !Array.isArray(farmPlot.tiles) || (physics && physics.flipped)
        || Math.hypot(hx - farmPlot.x, hz - farmPlot.z) > 36) {
        m.farmTileIdx = -1;
        m.carriedCrops = 0;
        if (physics && physics.flipped) {
          m.state = 'following';
        } else {
          m.state = 'boarding';
          m.boardT = 0;
          m.hopFrom = null;
        }
        return;
      }

      const claimedByOther = (idx) => this.members.some((o) => o !== m && o.state === 'farm_job' && o.farmTileIdx === idx);
      const pickNextTile = () => {
        let bestRipe = -1, bestRipeD = Infinity;
        let bestEmpty = -1, bestEmptyD = Infinity;
        for (let i = 0; i < farmPlot.tiles.length; i++) {
          if (claimedByOther(i)) continue;
          const tl = farmPlot.tiles[i];
          const d = Math.hypot(tl.x - m.x, tl.z - m.z);
          if (tl.stage === 2 && d < bestRipeD) { bestRipeD = d; bestRipe = i; }
          else if (tl.stage === 0 && d < bestEmptyD) { bestEmptyD = d; bestEmpty = i; }
        }
        if (bestRipe >= 0) return { idx: bestRipe, action: 'harvest' };
        if (bestEmpty >= 0) return { idx: bestEmpty, action: 'plant' };
        return null;
      };

      let walkingNow = false;
      let workingNow = false;
      let curSpeed = 0;
      const sp = 2.65;

      if (m.farmPhase === 'deliver_walk') {
        const drop = job.shopDrop || { x: farmPlot.x, z: farmPlot.z };
        const dx = drop.x - m.x, dz = drop.z - m.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.95) {
          const move = Math.min(d, sp * dt);
          m.x += (dx / d) * move;
          m.z += (dz / d) * move;
          m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 9.0, dt);
          walkingNow = true;
          curSpeed = sp;
          resolveProps(0.34);
        } else {
          m.farmPhase = 'deliver_drop';
          m.farmWorkT = 0.95;
          if (drop.faceX !== undefined && drop.faceZ !== undefined) {
            m.dir = this._turnToward(m.dir, Math.atan2(drop.faceX - m.x, drop.faceZ - m.z), 10.0, dt);
          }
          _armSwing(m);
        }
      } else if (m.farmPhase === 'deliver_drop') {
        m.farmWorkT -= dt;
        workingNow = true;
        if (m.farmWorkT <= 0) {
          const qty = Math.max(1, m.carriedCrops || 1);
          m.carriedCrops = 0;
          const newStock = (this.world && this.world.addVillageShopStock)
            ? this.world.addVillageShopStock(job.villageRef || farmPlot.villageId, qty)
            : 0;
          job.delivered = (job.delivered || 0) + qty;
          if (typeof job.onCropDelivered === 'function') {
            job.onCropDelivered({
              member: m,
              count: qty,
              gold: qty * 5,
              shopStock: newStock,
              villageName: job.villageName,
            });
          }
          m.farmPhase = 'seek';
          m.farmTileIdx = -1;
        }
      } else if (m.farmPhase === 'work_tile') {
        const tl = farmPlot.tiles[m.farmTileIdx];
        if (!tl) {
          m.farmPhase = 'seek';
          m.farmTileIdx = -1;
        } else {
          m.dir = this._turnToward(m.dir, Math.atan2(tl.x - m.x, tl.z - m.z), 10.0, dt);
          m.farmWorkT -= dt;
          workingNow = true;
          m.farmSwingCd = (m.farmSwingCd || 0) - dt;
          if (m.farmSwingCd <= 0) { m.farmSwingCd = 1.05; _armSwing(m); }
          if (m.farmWorkT <= 0) {
            if (m.farmAction === 'harvest' && tl.stage === 2 && this.world && this.world.harvestFarmTile) {
              this.world.harvestFarmTile(farmPlot, tl.index, false);
              m.carriedCrops = (m.carriedCrops || 0) + 1;
              m.farmTileIdx = -1;
              m.farmPhase = 'deliver_walk';
            } else if (m.farmAction === 'plant' && tl.stage === 0 && this.world && this.world.plantFarmTile) {
              this.world.plantFarmTile(farmPlot, tl.index);
              m.farmTileIdx = -1;
              m.farmPhase = 'seek';
            } else {
              m.farmTileIdx = -1;
              m.farmPhase = 'seek';
            }
          }
        }
      } else if (m.farmPhase === 'walk_tile') {
        const tl = farmPlot.tiles[m.farmTileIdx];
        if (!tl || (m.farmAction === 'harvest' && tl.stage !== 2) || (m.farmAction === 'plant' && tl.stage !== 0)) {
          m.farmTileIdx = -1;
          m.farmPhase = 'seek';
        } else {
          const dx = tl.x - m.x, dz = tl.z - m.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.85) {
            const move = Math.min(d, sp * dt);
            m.x += (dx / d) * move;
            m.z += (dz / d) * move;
            m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 9.0, dt);
            walkingNow = true;
            curSpeed = sp;
            resolveProps(0.34);
          } else {
            m.farmPhase = 'work_tile';
            m.farmWorkT = 2.2;
            m.farmSwingCd = 0.1;
          }
        }
      } else {
        // seek
        if (m.carriedCrops > 0) {
          m.farmPhase = 'deliver_walk';
        } else {
          const next = pickNextTile();
          if (next) {
            m.farmTileIdx = next.idx;
            m.farmAction = next.action;
            m.farmPhase = 'walk_tile';
          } else {
            // Semua petak sudah selesai dipanen & ditanam -> kembali naik ke gerobak
            m.farmTileIdx = -1;
            m.state = 'boarding';
            m.boardT = 0;
            m.hopFrom = null;
            const anyStillWorking = this.members.some((o) => o !== m && o.state === 'farm_job');
            if (!anyStillWorking) {
              const finishedJob = this._farmJob;
              this._farmJob = null;
              if (finishedJob && typeof finishedJob.onComplete === 'function') {
                finishedJob.onComplete(finishedJob);
              }
            }
            this._notify();
            return;
          }
        }
      }

      const gy = this._groundY(m.x, m.z);
      root.position.set(m.x, gy, m.z);
      root.rotation.set(0, m.dir, 0);
      if (st) {
        st.pos.copy(root.position);
        st.vel.x = walkingNow ? Math.sin(m.dir) * curSpeed : 0;
        st.vel.z = walkingNow ? Math.cos(m.dir) * curSpeed : 0;
        st.walking = walkingNow;
        st.working = workingNow;
        if (workingNow) {
          st.farmT = 1;
          st.farmTask = { action: m.farmAction === 'plant' ? 'plant' : 'harvest' };
        } else {
          st.farmT = 0;
          st.farmTask = null;
        }
        st.swing = walkingNow ? 0 : _tickSwing(m, dt);
        st.headAngle = 0;
      }
      HC.animateNPC(root, dt);
      return;
    }

    // ---- state === 'following': bertarung taktis jika ada musuh, atau pungut barang jatuh 1 per 1, atau ikuti gerobak ----
    if (HC.combatAI && HC.mobs && HC.combatAI.stepPartyMember(m, dt, hx, hz, hyaw, c, physics, this)) {
      this._dropMemberCargo(m, physics);
      m.inCombat = true;
      return;
    }
    m.inCombat = false;

    // Pungut barang yang tumpah di tanah satu per satu dan muat kembali ke gerobak jika sudah ditegakkan
    if (physics && Array.isArray(physics.spilled) && c) {
      if (m.haulItem && (!m.haulItem.spilled || (m.haulItem.pos && Math.hypot(m.haulItem.pos.x - cc.x, m.haulItem.pos.z - cc.z) > 30))) {
        this._dropMemberCargo(m, physics);
      }
      if (!m.haulItem && !m.carryingCargo && physics.spilled.length > 0 && typeof physics.claimSpilledItem === 'function') {
        m.haulItem = physics.claimSpilledItem(m.uid, m.x, m.z, 28);
        m.carryingCargo = false;
        m.haulPickT = 0;
      }
      if (m.haulItem) {
        const item = m.haulItem;
        let walkingNow = false;
        let workingNow = false;
        let curSpeed = 0;

        if (!m.carryingCargo) {
          const ix = item.pos ? item.pos.x : m.x;
          const iz = item.pos ? item.pos.z : m.z;
          const dxI = ix - m.x, dzI = iz - m.z;
          const dI = Math.hypot(dxI, dzI);
          if (dI > 0.95) {
            const sp = 2.65;
            const move = Math.min(dI, sp * dt);
            m.x += (dxI / dI) * move;
            m.z += (dzI / dI) * move;
            m.dir = this._turnToward(m.dir, Math.atan2(dxI, dzI), 9.0, dt);
            walkingNow = true;
            curSpeed = sp;
            resolveProps(0.34);
          } else {
            m.dir = this._turnToward(m.dir, Math.atan2(dxI || 0.001, dzI || 0.001), 10.0, dt);
            m.haulPickT = (m.haulPickT || 0) + dt;
            workingNow = true;
            if (m.haulPickT >= 0.22) {
              if (typeof physics.pickUpSpilledItem === 'function') {
                physics.pickUpSpilledItem(item, m.uid);
              } else {
                item.carriedBy = m.uid;
              }
              m.carryingCargo = true;
              m.haulPickT = 0;
              _armSwing(m);
            }
          }
          const gy = this._groundY(m.x, m.z);
          root.position.set(m.x, gy, m.z);
          root.rotation.set(0, m.dir, 0);
          if (st) {
            st.pos.copy(root.position);
            st.vel.x = walkingNow ? Math.sin(m.dir) * curSpeed : 0;
            st.vel.z = walkingNow ? Math.cos(m.dir) * curSpeed : 0;
            st.walking = walkingNow;
            st.working = workingNow;
            st.swing = _tickSwing(m, dt);
            st.headAngle = 0;
          }
          HC.animateNPC(root, dt);
          return;
        }

        // Bawa barang menuju belakang gerobak untuk dimuat kembali
        const dropRear = this._cartRearWorld(c, 0.95, (m.seatIndex - 1) * 0.45);
        const dxC = dropRear.x - m.x, dzC = dropRear.z - m.z;
        const dC = Math.hypot(dxC, dzC);
        if (dC > 1.45) {
          const sp = 2.35;
          const move = Math.min(dC, sp * dt);
          m.x += (dxC / dC) * move;
          m.z += (dzC / dC) * move;
          m.dir = this._turnToward(m.dir, Math.atan2(dxC, dzC), 8.5, dt);
          walkingNow = true;
          curSpeed = sp;
          resolveProps(0.34);
        } else {
          m.dir = this._turnToward(m.dir, Math.atan2(cc.x - m.x, cc.z - m.z), 9.0, dt);
          if (!physics.flipped && typeof physics.loadCargoItemIntoCart === 'function') {
            const left = physics.loadCargoItemIntoCart(item);
            m.haulItem = null;
            m.carryingCargo = false;
            m.haulPickT = 0;
            _armSwing(m);
            this.lastMessage = left > 0
              ? this._text('npc_msg_unloading', `${m.role.e} ${m.role.name} memuat barang ke gerobak (${left} tersisa).`, { e: m.role.e, name: m.role.name, left, role: m.role })
              : this._text('npc_msg_loaded_all', `${m.role.e} Semua barang sudah dimuat kembali ke gerobak!`, { e: m.role.e });
            this._notify();
          }
        }

        const gy = this._groundY(m.x, m.z);
        root.position.set(m.x, gy, m.z);
        root.rotation.set(0, m.dir, 0);
        if (m.carryingCargo && item.mesh) {
          const hxItem = m.x + Math.sin(m.dir) * 0.44;
          const hyItem = gy + 0.92 + Math.sin(this._clock * 7.5) * 0.03;
          const hzItem = m.z + Math.cos(m.dir) * 0.44;
          item.mesh.position.set(hxItem, hyItem, hzItem);
          if (item.mesh.rotation) item.mesh.rotation.set(0, m.dir, 0);
          if (item.pos) item.pos.set(hxItem, hyItem, hzItem);
        }
        if (st) {
          st.pos.copy(root.position);
          st.vel.x = walkingNow ? Math.sin(m.dir) * curSpeed : 0;
          st.vel.z = walkingNow ? Math.cos(m.dir) * curSpeed : 0;
          st.walking = walkingNow;
          st.working = false;
          st.swing = _tickSwing(m, dt);
          st.headAngle = 0;
        }
        HC.animateNPC(root, dt);
        return;
      }
    }
    const horseMovedSpd = this._horseMoveSpd || 0;
    const unhitchedFar = physics && !physics.hitched && Math.hypot(hx - cc.x, hz - cc.z) > 9.0;
    const anchorX = unhitchedFar ? hx : (hx + cc.x) * 0.5;
    const anchorZ = unhitchedFar ? hz : (hz + cc.z) * 0.5;
    const refSpd = unhitchedFar ? horseMovedSpd : Math.max(rigSpd, horseMovedSpd);
    const distToAnchor = Math.hypot(anchorX - m.x, anchorZ - m.z);

    if (distToAnchor > 26) {
      if (unhitchedFar) {
        const rfx0 = Math.cos(hyaw), rfz0 = -Math.sin(hyaw);
        m.x = hx - rfx0 * 2.8 + (m.seatIndex - 1) * 0.9;
        m.z = hz - rfz0 * 2.8;
      } else {
        const snap = this._cartRearWorld(c, 2.4, (m.seatIndex - 1) * 0.9);
        m.x = snap.x; m.z = snap.z;
      }
    }

    const rfx = Math.cos(hyaw), rfz = -Math.sin(hyaw);
    const rlx = -rfz, rlz = rfx;
    const escortBaseX = unhitchedFar ? hx : cc.x;
    const escortBaseZ = unhitchedFar ? hz : cc.z;
    const escortOffsets = unhitchedFar
      ? [
          { fwd: -2.2, lat: 2.0 },
          { fwd: -2.2, lat: -2.0 },
          { fwd: -3.4, lat: 0.9 },
        ]
      : [
          { fwd: -0.9, lat: 2.85 },   // sisi kiri gerobak-kuda
          { fwd: -0.9, lat: -2.85 },  // sisi kanan gerobak-kuda
          { fwd: -4.8, lat: 1.90 },   // mengawal di belakang kiri
        ];
    const off = escortOffsets[m.seatIndex % escortOffsets.length];
    const escortX = escortBaseX + rfx * off.fwd + rlx * off.lat;
    const escortZ = escortBaseZ + rfz * off.fwd + rlz * off.lat;
    const distToEscort = Math.hypot(escortX - m.x, escortZ - m.z);

    let walkingNow = false;
    let curSpeed = 0;

    if (refSpd > 0.35 || distToAnchor > 6.5) {
      // Gerobak / kuda sedang jalan atau NPC ketinggalan jauh -> terus kejar & ikuti
      m.roamPhase = 'roam';
      m.roamT = 0.5;
      if (distToEscort > 0.55) {
        const sp = Math.min(Math.max((m.role.speed || 3.4) * 1.25, refSpd + 2.2), Math.max(1.85, distToEscort * 2.1));
        const move = Math.min(distToEscort, sp * dt);
        m.x += ((escortX - m.x) / distToEscort) * move;
        m.z += ((escortZ - m.z) / distToEscort) * move;
        m.dir = this._turnToward(m.dir, Math.atan2(escortX - m.x, escortZ - m.z), 8.5, dt);
        walkingNow = true;
        curSpeed = sp;
      } else {
        m.dir = this._turnToward(m.dir, hyaw + Math.PI * 0.5, 6.0, dt);
      }
    } else {
      // Gerobak/kuda diam -> NPC berjalan-jalan santai di sekitar kuda & gerobak
      m.roamT = (m.roamT ?? 0) - dt;
      if (m.roamT <= 0 || !m.roamTarget) {
        if (m.roamPhase === 'roam') {
          m.roamPhase = 'idle';
          m.roamT = 1.4 + Math.random() * 1.8;
        } else {
          m.roamPhase = 'roam';
          m.roamT = 2.4 + Math.random() * 2.2;
          let picked = null;
          for (let attempt = 0; attempt < 8; attempt++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 2.9 + Math.random() * 2.4;
            const px = anchorX + Math.cos(ang) * rad;
            const pz = anchorZ + Math.sin(ang) * rad;
            if (Math.hypot(px - hx, pz - hz) < 1.85) continue;
            if (Math.hypot(px - cc.x, pz - cc.z) < 2.35) continue;
            picked = { x: px, z: pz };
            break;
          }
          m.roamTarget = picked || { x: escortX, z: escortZ };
        }
      }
      if (m.roamPhase === 'roam' && m.roamTarget) {
        const dx = m.roamTarget.x - m.x, dz = m.roamTarget.z - m.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.35) {
          const sp = 1.45;
          const move = Math.min(d, sp * dt);
          m.x += (dx / d) * move;
          m.z += (dz / d) * move;
          m.dir = this._turnToward(m.dir, Math.atan2(dx, dz), 6.5, dt);
          walkingNow = true;
          curSpeed = sp;
        } else {
          m.roamPhase = 'idle';
          m.roamT = 1.2 + Math.random() * 1.5;
        }
      } else {
        // Saat diam, sesekali menengok ke arah kuda/gerobak
        const look = Math.atan2(hx - m.x, hz - m.z);
        m.dir = this._turnToward(m.dir, look, 2.5, dt);
      }
    }

    // Jaga jarak aman terhadap kuda, gerobak, dan sesama NPC yang turun
    const pushOut = (ox, oz, minR) => {
      const dx = m.x - ox, dz = m.z - oz;
      const d = Math.hypot(dx, dz);
      if (d < minR && d > 1e-4) {
        m.x = ox + (dx / d) * minR;
        m.z = oz + (dz / d) * minR;
      }
    };
    pushOut(hx, hz, 1.75);
    pushOut(cc.x, cc.z, 2.25);
    for (const other of this.members) {
      if (other !== m && other.state === 'following' && other.root) {
        pushOut(other.x, other.z, 1.05);
      }
    }
    resolveProps(0.34);

    const gy = this._groundY(m.x, m.z);
    root.position.set(m.x, gy, m.z);
    root.rotation.set(0, m.dir, 0);
    if (st) {
      st.pos.copy(root.position);
      st.vel.x = walkingNow ? Math.sin(m.dir) * curSpeed : 0;
      st.vel.z = walkingNow ? Math.cos(m.dir) * curSpeed : 0;
      st.walking = walkingNow;
      st.working = false;
      st.swing = _tickSwing(m, dt);
      st.headAngle = 0;
    }
    HC.animateNPC(root, dt);
  }
  update(x, z, yaw, dt, cart = null, physics = null) {
    const stepDt = dt || 1 / 60;
    if (this._prevHPos) {
      this._horseMoveSpd = Math.hypot(x - this._prevHPos.x, z - this._prevHPos.z) / Math.max(stepDt, 1e-4);
    } else {
      this._horseMoveSpd = 0;
    }
    this._prevHPos = { x, z };
    this.lastHorse.x = x; this.lastHorse.z = z; this.lastHorse.yaw = yaw;
    if (cart) this.cart = cart;
    if (physics) this.physics = physics;
    this._clock += stepDt;
    const rigCtx = {
      horse: { x, z, yaw, speed: this._horseMoveSpd || 0 },
      cart: (this.hasCart !== false && this.cart && this.cart.root && physics)
        ? { x: this.cart.root.position.x, z: this.cart.root.position.z, yaw: physics.yaw || 0, speed: physics.forwardSpeed || 0, active: true }
        : null,
    };
    HC._activeRigCtx = rigCtx;
    try {
      for (let i = 0; i < this.wild.length; i++) {
        const w = this.wild[i];
        if (w.respawnAt && this._clock >= w.respawnAt) {
          const prevVp = w.villageProfile;
          const nw = this._spawnFromAnchor(i, w.anchor);
          if (nw && prevVp) {
            nw.villageProfile = prevVp;
            nw.homeRadius = 18.0;
            nw.isIndoors = false;
          }
          w.respawnAt = null;
        }
        if (w.recruited) continue;
        // Tetap berkelompok di kamp/pos; TIDAK respawn random di depan kuda.
        if (w.root) HC.updateWildNPC(w, dt || 1 / 60, { x, z }, this.world);
      }
    } finally {
      HC._activeRigCtx = null;
    }
    for (const m of this.members) {
      if (m.state !== 'seated') {
        this._updateMember(m, stepDt, x, z, yaw, this.cart, physics);
      }
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
      if (w.recruited || w.isIndoors) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < dist) { best = w; dist = d; }
    }
    return best && dist <= 3.8 ? { npc: best, distance: dist } : null;
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
      if (n) this.lastMessage = this._text('npc_msg_clear', `${role.skill.e} ${role.skill.name}: ${n} kerikil di jalur disapu.`, { e: role.skill.e, skill: role.skill.name, n, role });
    }
  }
  recruit(x, z) {
    if (this.squad.length >= HC.NPC_TEAM_MAX) {
      const fn = HC.t;
      this.lastMessage = typeof fn === 'function' ? fn('npc_team_full_2') : 'Regu penuh (2/2). Lepas anggota dulu.';
      return null;
    }
    const hit = this.nearby(x, z);
    if (!hit) { this.lastMessage = this._text('npc_msg_no_target', 'Belum ada NPC dalam jangkauan 3.8 m. Deketin kelompoknya dulu.'); return null; }
    const w = hit.npc;
    const role = w.role;              // ambil dulu: respawn menimpa item.role
    const startX = w.x, startZ = w.z;
    const startDir = (w.root && w.root.rotation && w.root.rotation.y) || 0;
    this.squad.push(role);
    if (w._hpBar) { w._hpBar.dispose(); w._hpBar = null; }
    this.scene.remove(w.root);
    // Warga pergi ikut regu; slot di kamp diisi lagi nanti (30 s) DI SITUS YANG
    // SAMA, bukan muncul mendadak di depan kuda.
    w.recruited = true;
    w.respawnAt = this._clock + 30;

    const usedSeats = new Set(this.members.map((m) => m.seatIndex));
    let seatIndex = 0;
    while (usedSeats.has(seatIndex) && seatIndex < HC.NPC_TEAM_MAX) seatIndex++;

    const member = {
      uid: this._nextUid++,
      role,
      seatIndex,
      state: 'boarding',
      x: startX,
      z: startZ,
      dir: startDir,
      hp: role.hp || 100,
      maxHp: role.hp || 100,
      inCombat: false,
      root: null,
      seatRoot: null,
      boardT: 0,
      hopFrom: null,
      roamPhase: 'roam',
      roamT: 1.5,
      roamTarget: { x: startX, z: startZ },
      actT: 5,
      swingT: -1,
      swingPulse: 0,
      flipPulseT: 0,
    };
    this.members.push(member);
    this._spawnStanding(member, startX, startZ, startDir);
    this._syncDefaultPassengers(this.cart);

    const fx = HC.npcSkillFx(role);
    this.lastMessage = this._text('npc_msg_recruited', `${role.e} ${role.name} direkrut - berjalan ke belakang gerobak... (${fx.note})`, { e: role.e, name: role.name, note: fx.note, role });
    this._notify();
    return role;
  }
  isFarmJobActive(villageId = null) {
    if (!this._farmJob) return false;
    const anyWorking = this.members.some((m) => m.state === 'farm_job');
    if (!anyWorking) { this._farmJob = null; return false; }
    if (villageId && this._farmJob.villageId !== villageId) return false;
    return true;
  }
  startFarmJob(farmPlot, shopDrop, { onCropDelivered = null, onComplete = null } = {}) {
    if (!farmPlot || !this.members.length) return false;
    if (this.physics && this.physics.flipped) return false;
    this._farmJob = {
      villageId: farmPlot.villageId,
      villageName: farmPlot.villageName,
      villageRef: farmPlot.villageRef || null,
      farmPlot,
      shopDrop: shopDrop || { x: farmPlot.x, z: farmPlot.z },
      onCropDelivered,
      onComplete,
      delivered: 0,
    };
    for (const m of this.members) {
      this._clearWaterTask(m);
      this._dropMemberCargo(m, this.physics);
      if (m.state === 'seated' || m.state === 'hopping_in') {
        this._detachSeated(m, this.cart);
        const rear = this._cartRearWorld(this.cart, 1.2, (m.seatIndex - 0.5) * 0.75);
        this._spawnStanding(m, rear.x, rear.z, rear.yaw + Math.PI);
      } else if (!m.root) {
        const rear = this._cartRearWorld(this.cart, 1.2, (m.seatIndex - 0.5) * 0.75);
        this._spawnStanding(m, rear.x, rear.z, rear.yaw + Math.PI);
      }
      m.state = 'farm_job';
      m.farmPhase = 'seek';
      m.farmTileIdx = -1;
      m.farmAction = 'harvest';
      m.farmWorkT = 0;
      m.carriedCrops = 0;
    }
    this._syncDefaultPassengers(this.cart);
    this._notify();
    return true;
  }
  stopFarmJob(boardBack = true) {
    this._farmJob = null;
    for (const m of this.members) {
      if (m.state === 'farm_job') {
        m.farmTileIdx = -1;
        m.carriedCrops = 0;
        if (boardBack && !(this.physics && this.physics.flipped)) {
          m.state = 'boarding';
          m.boardT = 0;
          m.hopFrom = null;
        } else {
          m.state = 'following';
        }
      }
    }
    this._notify();
  }
  boardMember(uid) {
    if (this.physics && this.physics.flipped) {
      this.lastMessage = this._text('npc_msg_flip_first', 'Balikkan gerobak dulu sebelum NPC bisa naik.');
      this._notify();
      return false;
    }
    const m = this.members.find((it) => it.uid === uid);
    if (!m || m.state === 'seated' || m.state === 'boarding' || m.state === 'hopping_in') return false;
    this._dropMemberCargo(m, this.physics);
    m.state = 'boarding';
    m.inCombat = false;
    if (m._hpBar) m._hpBar.hideNow();
    if (m.cBrain) m.cBrain.targetBoar = null;
    m.boardT = 0;
    m.hopFrom = null;
    this.lastMessage = this._text('npc_msg_boarding', `${m.role.e} ${m.role.name} menuju belakang gerobak untuk naik.`, { e: m.role.e, name: m.role.name, role: m.role });
    this._notify();
    return true;
  }
  onCartFlip(cart, physics) {
    const c = cart || this.cart;
    if (c) this.cart = c;
    if (physics) this.physics = physics;
    const cc = this._cartCenterWorld(c);
    const cfx = Math.cos(cc.yaw), cfz = -Math.sin(cc.yaw);
    const clx = -cfz, clz = cfx;
    const side = (physics && physics.flipDir) ? Math.sign(physics.flipDir) : 1;
    for (const m of this.members) {
      this._dropMemberCargo(m, this.physics);
      m._wantHelpAfterFall = false;
      m.inCombat = false;
      if (m._hpBar) m._hpBar.hideNow();
      if (m.cBrain) m.cBrain.targetBoar = null;
      if (m.state === 'seated' || m.state === 'hopping_in') {
        if (m.seatRoot) this._detachSeated(m, c);
        const lat = side * (1.85 + m.seatIndex * 0.55);
        const fwd = (m.seatIndex - 1) * 0.85;
        const landX = cc.x + cfx * fwd + clx * lat;
        const landZ = cc.z + cfz * fwd + clz * lat;
        this._spawnStanding(m, landX, landZ, cc.yaw);
        m.state = 'fallen';
        m.fallT = 0;
        m.fallSide = side;
      } else if (m.state === 'boarding') {
        m.state = 'following';
        m.boardT = 0;
        m.hopFrom = null;
      }
    }
    this._syncDefaultPassengers(c);
    if (this.members.length) {
      this.lastMessage = this._text('npc_msg_flipped', 'Gerobak terguling! Semua NPC terjatuh ke tanah.');
    }
    this._notify();
  }
  setHelpingFlip(active) {
    for (const m of this.members) {
      if (active) {
        this._dropMemberCargo(m, this.physics);
        if (m.state === 'fallen') {
          m._wantHelpAfterFall = true;
        } else if (m.state !== 'seated') {
          m.state = 'helping_flip';
        }
      } else {
        m._wantHelpAfterFall = false;
        if (m.state === 'helping_flip') {
          m.state = 'following';
          m.roamPhase = 'roam';
          m.roamT = 0.2;
        }
      }
    }
    this._notify();
  }
  disembarkMember(uid) {
    const m = this.members.find((it) => it.uid === uid);
    if (!m || m.state === 'following') return false;
    this._clearWaterTask(m);
    if (m.state === 'seated') {
      this._detachSeated(m, this.cart);
      const rear = this._cartRearWorld(this.cart, 1.15, (m.seatIndex - 1) * 0.65);
      this._spawnStanding(m, rear.x, rear.z, rear.yaw + Math.PI);
    }
    m.state = 'following';
    m.roamPhase = 'roam';
    m.roamT = 0.2;
    m.roamTarget = null;
    this.lastMessage = this._text('npc_msg_released_walk', `${m.role.e} ${m.role.name} turun dan berjalan di sekitar gerobak.`, { e: m.role.e, name: m.role.name, role: m.role });
    this._notify();
    return true;
  }
  toggleMemberMount(uid) {
    const m = this.members.find((it) => it.uid === uid);
    if (!m) return false;
    return m.state === 'following' ? this.boardMember(uid) : this.disembarkMember(uid);
  }
  releaseMember(uid) {
    const idx = this.members.findIndex((it) => it.uid === uid);
    if (idx < 0) return null;
    const [m] = this.members.splice(idx, 1);
    this._clearWaterTask(m);
    this._dropMemberCargo(m, this.physics);
    const sIdx = this.squad.indexOf(m.role);
    if (sIdx >= 0) this.squad.splice(sIdx, 1);
    else this.squad.splice(idx, 1);
    if (m._hpBar) { m._hpBar.dispose(); m._hpBar = null; }
    if (m.root) { this.scene.remove(m.root); m.root = null; }
    this._detachSeated(m, this.cart);
    this._syncDefaultPassengers(this.cart);
    this.lastMessage = this._text('npc_msg_released', `${m.role.e} ${m.role.name} dilepas dari regu.`, { e: m.role.e, name: m.role.name, role: m.role });
    this._notify();
    return m.role;
  }
  releaseLast() {
    if (!this.members.length) {
      const role = this.squad.pop();
      this.lastMessage = role
        ? this._text('npc_msg_released', `${role.name} dilepas dari regu.`, { e: role.e, name: role.name, role })
        : this._text('npc_msg_squad_empty', 'Regu kosong.');
      this._notify();
      return role || null;
    }
    const last = this.members[this.members.length - 1];
    return this.releaseMember(last.uid);
  }
  unmount(cart) {
    if (!cart) return;
    for (const p of cart.npcPassengers || []) if (p.parent) p.parent.remove(p);
    cart.npcPassengers = [];
  }
  mount(cart) {
    this.cart = cart;
    this.unmount(cart);
    this._syncDefaultPassengers(cart);
    for (const m of this.members) {
      if (m.state === 'seated') this._attachSeated(m, cart);
    }
    this._attachQuestPassengers(cart);
  }
};
