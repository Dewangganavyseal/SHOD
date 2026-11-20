// Intended behavior tests for NPC intelligence bridge; run with node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const baseDir = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(baseDir, '../js/npc.js'), 'utf8');
const mapSrc = fs.readFileSync(path.join(baseDir, '../js/map.js'), 'utf8');
const NPCParty = new Function('HC', src.slice(src.indexOf('HC.NPCParty = class')) + '\nreturn HC.NPCParty;')({
  NPC_ROLES: [], NPC_RECRUITABLE: [],
  MAP: new Function('HC', mapSrc.replace(/^import .*$/gm, '').replace(/export default MAP;/, '').replace(/HC\.MAP = MAP;/, 'return MAP;'))({ MAP: null }),
  NPC_BEHAVIOR: {}, buildNPC() { return { userData: {}, position: { set() {} }, rotation: {} }; },
});

test('all 18 archetypes have explicit non-combat behavior profiles', () => {
  const block = src.match(/HC\.NPC_BEHAVIOR\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || '';
  const ids = [...block.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  assert.equal(ids.length, 18);
  assert.ok(ids.includes('farmer') && ids.includes('miner') && ids.includes('herbal'));
});

test('wild NPC update grounds root and passes state into native animation', () => {
  assert.match(src, /HC\.updateWildNPC\s*=\s*function/);
  assert.match(src, /root\.position\.set\(item\.x, gy, item\.z\)/);
  assert.match(src, /HC\.animateNPC\(root, dt\)/);
  assert.match(src, /HC\.updateWildNPC\(w, dt \|\| 1 \/ 60, \{ x, z \}, this\.world\)/);
});

test('local NPC walks are clamped to their authored home radius', () => {
  const start = src.indexOf('HC.NPC_BEHAVIOR =');
  const end = src.indexOf('/* ============================================================================\n   PARTY', start);
  const bridge = src.slice(start, end);
  const HC = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), animateNPC() {} };
  const updateWildNPC = new Function('HC', `${bridge}; return HC.updateWildNPC;`)(HC);
  const role = { id: 'guard', speed: 3 };
  const root = {
    userData: { npc: { role, speed: 3, pos: { copy() {} }, vel: {}, _legs: [] } },
    position: { set(x, y, z) { this.x=x; this.y=y; this.z=z; } },
    rotation: { y: 0 },
  };
  const item = { root, role, x: 0, z: 0, homeX: 0, homeZ: 0 };
  item.brain = { phase: 'walk', t: 100, dir: Math.PI / 2, actT: 100, swingT: -1, healT: -1, harvest: true };
  let maxD = 0;
  for (let i = 0; i < 240; i++) {
    updateWildNPC(item, 0.1, { x: 100, z: 100 }, { terrainHeightAt: () => 0 });
    maxD = Math.max(maxD, Math.hypot(item.x - item.homeX, item.z - item.homeZ));
  }
  assert.ok(maxD <= HC.NPC_BEHAVIOR.guard.radius + 0.02,
    `NPC jalan keluar dari pos: ${maxD.toFixed(2)} m (radius ${HC.NPC_BEHAVIOR.guard.radius})`);
});

test('native animation exceptions are observable instead of swallowed', () => {
  assert.match(src, /HC\.npcAnimErrors\s*=\s*HC\.npcAnimErrors\s*\|\|\s*\{\}/);
  assert.match(src, /HC\.npcAnimErrors\[st\.role\.id\]\s*=/);
  assert.match(src, /delete HC\.npcAnimErrors\[st\.role\.id\]/);
});

test('sit rig memakai sendi paha, bukan alias hips (petmerchant tidak rebah)', () => {
  const fun = src.match(/function sitLegGroups\(parts[\s\S]*?\n}/);
  assert.ok(fun, 'helper sitLegGroups(parts) belum ada');
  const resolve = new Function('parts', `${fun[0]}; return sitLegGroups(parts);`);
  const hips = { name: 'hips' }, rLeg = { name: 'rLeg' }, lLeg = { name: 'lLeg' };
  assert.deepEqual(resolve({ hips, legs: hips, rLeg, lLeg }), [rLeg, lLeg],
    'alias legs=hips tidak boleh diputar: badan rebah di bangku');
  const thigh = { name: 'thighL' }, thigh2 = { name: 'thighR' };
  assert.deepEqual(resolve({ legs: [thigh, thigh2] }), [thigh, thigh2],
    'model dengan kaki asli tetap memakai parts.legs');
  assert.deepEqual(resolve({}), [], 'model tanpa kaki -> jalur jubah');
});

test('jubah cloth Royalguard & efek Sylvan menempel ke scene asli', () => {
  const main = fs.readFileSync(path.join(baseDir, '../js/main.js'), 'utf8');
  assert.match(main, /Game\.scene\s*=\s*scene/,
    'Game.scene masih Group stub: cape di-simulate tapi tidak pernah dirender');
});

test('kelompok NPC tinggal di situs peta, bukan respawn mengikuti kuda', () => {
  const scene = { add() {}, remove() {} };
  const fakeRole = (id) => ({ id, speed: 3, hp: 1, skill: { id: 'x', name: 'x' } });
  const bridge = src.slice(src.indexOf('HC.NPC_BEHAVIOR ='), src.indexOf('/* ============================================================================\n   PARTY'));
  const map = new Function('HC', mapSrc.replace(/^import .*$/gm, '').replace(/export default MAP;/, '').replace(/HC\.MAP = MAP;/, 'return MAP;'))({ MAP: null });
  const HC = {
    NPC_ROLES: ['guard', 'farmer'].map(fakeRole),
    NPC_RECRUITABLE: ['guard', 'farmer'].map(fakeRole),
    NPC_BEHAVIOR: {}, MAP: map,
    animateNPC() {},
    buildNPC: (role, pose) => ({
      role, pose, userData: { npc: { role, speed: 3, pos: { copy() {} }, vel: {}, _legs: [] } },
      position: { set() {} }, rotation: { y: 0 },
    }),
  };
  new Function('HC', `${bridge}; return HC.updateWildNPC;`)(HC);
  const Party = new Function('HC', src.slice(src.indexOf('HC.NPCParty = class')) + '\nreturn HC.NPCParty;')(HC);
  const party = new Party(scene);
  party.world = { terrainHeightAt: () => 0 };
  assert.equal(party.wild.length, 18, 'satu warga per titik peta (18 arketipe)');
  for (const w of party.wild) {
    assert.equal(w.x, w.anchor.x);
    assert.equal(w.z, w.anchor.z);
    assert.ok(w.site, 'tiap warga punya situs');
  }
  // kuda lewat jauh melewati semua kamp: warga tetap berkelompok di situsnya
  for (let i = 0; i < 90; i++) party.update(20 + i * 4, 3, 0, 1 / 60);
  for (const w of party.wild) {
    const away = Math.hypot(w.x - w.anchor.x, w.z - w.anchor.z);
    assert.ok(away <= 2.5, `${w.role.id} geser ${away.toFixed(2)} m dari situs — ikut kuda?`);
  }
});

test('rekrut mengosongkan slot kamp dan mengisinya lagi di titik yang sama', () => {
  const scene = { add() {}, remove() {} };
  const roles = ['guard', 'farmer'];
  const mk = (id) => ({ id, speed: 3, hp: 1, skill: { id: 'bulwark', name: 'x' } });
  const HC = {
    NPC_ROLES: roles.map(mk), NPC_RECRUITABLE: roles.map(mk), NPC_BEHAVIOR: {},
    NPC_TEAM_MAX: 3,
    NPC_SKILL_FX: { bulwark: { dmg: 0.8, note: 'n' } },
    npcSkillFx: () => ({ dmg: 0.8, note: 'n' }),
    updateWildNPC() {},
    MAP: new Function('HC', mapSrc.replace(/^import .*$/gm, '').replace(/export default MAP;/, '').replace(/HC\.MAP = MAP;/, 'return MAP;'))({ MAP: null }),
    buildNPC: (role) => ({ role, userData: {}, position: { set() {} }, rotation: {} }),
  };
  const Party = new Function('HC', src.slice(src.indexOf('HC.NPCParty = class')) + '\nreturn HC.NPCParty;')(HC);
  const party = new Party(scene);
  const target = party.wild.find((w) => w.slot === undefined) || party.wild[0];
  const anchor = { ...target.anchor };
  const got = party.recruit(target.x, target.z);
  assert.ok(got, 'rekrut berhasil di titik kamp');
  assert.equal(party.squad.length, 1);
  assert.equal(target.recruited, true, 'slot kamp ditandai pergi');
  // lewati masa tunggu 30 s: slot diisi lagi persis di anchor yang sama
  party.update(target.x + 60, target.z, 0, 30.5);
  const back = party.wild[0];
  assert.equal(back.recruited, undefined);
  assert.equal(back.x, anchor.x);
  assert.equal(back.z, anchor.z);
});
