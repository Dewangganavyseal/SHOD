// Animasi jalan NPC: tiap arketipe Sylvan wajib punya animate() yang dipakai SHOD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(baseDir, rel), 'utf8');

const ROLES = [
  'guard', 'hunter', 'miner', 'farmer', 'herbal', 'warrior', 'guardian',
  'merchant', 'dungeonmaster', 'petmerchant', 'lionknight', 'elfmage',
  'stonegiant', 'rabbitwarrior', 'goblin', 'magesupport', 'royalguard', 'lich',
];

test('18 arketipe punya file model + animate() bawaan Sylvan', () => {
  for (const id of ROLES) {
    const file = `../js/sylvan/npc_${id}.js`;
    assert.ok(fs.existsSync(path.join(baseDir, file)), `model ${id} hilang: ${file}`);
    const src = read(file);
    assert.match(src, /animate/, `${id}: tidak ada animate()`);
    assert.match(src, new RegExp(`window\\.NPC_${id.charAt(0).toUpperCase()}${id.slice(1)}\\s*=`),
      `${id}: window.NPC_${id} tidak dipasang`);
  }
});

test('gait tiap keluarga model membaca vel/walking yang memang diisi SHOD', () => {
  // Keluarga "sine sederhana": kecepatan -> amplitudo langkah
  for (const id of ['warrior', 'merchant', 'dungeonmaster', 'guardian']) {
    assert.match(read(`../js/sylvan/npc_${id}.js`), /Math\.hypot\(n\.vel\.x,\s*n\.vel\.z\)/,
      `${id}: gait tidak membaca n.vel`);
  }
  // Keluarga "gait teredam + state internal" (guard/hunter)
  for (const id of ['guard', 'hunter']) {
    const src = read(`../js/sylvan/npc_${id}.js`);
    assert.match(src, /st\.gait/, `${id}: tidak memakai st.gait`);
    assert.match(src, /mesh\.rotation\.y/, `${id}: oleng belok butuh yaw mesh`);
  }
  // Keluarga "kerja + jalan" (farmer/miner/herbal) memakai n.walking
  for (const id of ['farmer', 'miner', 'herbal']) {
    assert.match(read(`../js/sylvan/npc_${id}.js`), /n\.walking/, `${id}: tidak membaca n.walking`);
  }
  // Lionknight: state machine sendiri, pemicunya n.walking atau kecepatan
  assert.match(read('../js/sylvan/npc_lionknight.js'), /npc\.walking/, 'lionknight: tanpa pemicu jalan');
});

test('SHOD meminjamkan yaw root ke mesh selama animate()', () => {
  const src = read('../js/npc.js');
  assert.match(src, /st\._animYaw/, 'yaw animasi tidak dihaluskan');
  assert.match(src, /mesh\.rotation\.y = st\._animYaw;/, 'yaw tidak dipinjamkan ke mesh');
  assert.match(src, /if \(mirror\) mesh\.rotation\.y = renderYaw;/,
    'yaw render mesh harus dipulihkan supaya tidak dobel putar');
});

test('kecepatan untuk gait dihaluskan seperti lerp Sylvan, lalu dipulihkan', () => {
  const src = read('../js/npc.js');
  assert.match(src, /st\._velSmooth/, 'vel tidak dihaluskan untuk animate()');
  assert.match(src, /st\.vel\.x = rawVx;/, 'vel asli harus dipulihkan setelah animate()');
});


test('LOD tidak membekukan warga yang sedang berjalan di dekat kamera', () => {
  const src = read('../js/perf.js');
  assert.match(src, /const keepWalk = walkDist \|\| nearDist \* 2\.2/, 'radius jalan tidak ada');
  assert.match(src, /busy && d <= keepWalk/, 'warga berjalan tetap dibekukan LOD');
});
