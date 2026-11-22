// Lompat ber-momentum, collider yang bisa dilompati, dan peta 4x + sungai/desa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const baseDir = path.dirname(new URL(import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(baseDir, rel), 'utf8');

test('lompat membawa momentum & dorongan ke depan', () => {
  const src = read('../js/animator.js');
  assert.match(src, /this\.jumpTakeoff = Math\.max\(0, this\.speed\)/, 'kecepatan lepas tanah tidak dicatat');
  assert.match(src, /this\.jumpImpulse = /, 'impuls depan tidak dihitung');
  assert.match(src, /const airPush = this\.jumpActive/, 'dorongan udara tidak dipakai');
  assert.match(src, /this\.x \+= this\.forwardX \* \(this\.speed \+ airPush\) \* dt/,
    'gerak maju tidak menjumlahkan dorongan lompat');
  assert.match(src, /if \(this\.jumpActive\) this\.speed = Math\.max\(this\.speed, this\.jumpTakeoff\)/,
    'kuda mengerem di udara');
  assert.match(src, /\(1 \+ 0\.26 \* \(this\.jumpRun \|\| 0\)\)/, 'lompat lari tidak lebih tinggi');
});

test('pagar & api unggun bisa dilompati karena collider ikut bentuk mesh', () => {
  const src = read('../js/world.js');
  assert.match(src, /'fence', p1\.x, p1\.z, p2\.x, p2\.z,\s*\n\s*0\.14, Math\.max\(p1\.y, p2\.y\) \+ 0\.74/,
    'yMax pagar harus puncak palang (0,74), bukan 1,05');
  assert.match(src, /const campfireParts = \[\]/, 'collider api unggun tidak diukur dari mesh');
  assert.match(src, /const cfTop = Math\.min\(cfY \+ 0\.55/, 'tinggi collider api unggun masih terlalu tinggi');
  assert.match(src, /addCircleCollider\('campfire', 0, 0, cfRad, cfTop, campfireGroup\)/,
    'collider api unggun tidak memasang radius/tinggi hasil ukur');
});

test('dunia 4x, sungai ber-ford, bebatuan, dan desa terpasang', () => {
  const src = read('../js/world.js');
  assert.match(src, /const TERRAIN_SIZE = 300;/);
  assert.match(src, /const CHUNK_GRID = 20;/);
  assert.equal((src.match(/\{ x: -?[\d.]+, half: [\d.]+ \}/g) || []).length >= 3, true,
    'ford kurang dari tiga');
  assert.match(src, /function riverCenterZ\(x\)/);
  assert.match(src, /const riverBank = 1\.0 - smoothstepJS/);
  assert.match(src, /buildRiverSurface/, 'permukaan air sungai tidak dibangun');
  assert.match(src, /buildBoulderChallenge/, 'tantangan bebatuan tidak dibangun');
  assert.match(src, /buildVillage/, 'desa tidak dibangun');
  assert.match(src, /const VILLAGE = \{ z: 70, radius: 15\.5 \}/);
});
