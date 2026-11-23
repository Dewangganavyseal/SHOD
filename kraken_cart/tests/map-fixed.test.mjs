// Peta tetap: data authoring harus konsisten sebelum world.js memakainya.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, '../js/map.js'), 'utf8');

// map.js meng-import hc.js (browser THREE), jadi diekstrak lewat evaluasi ringan.
const body = src
  .replace(/^import .*$/gm, '')
  .replace(/export default MAP;/, '')
  .replace(/HC\.MAP = MAP;/, 'return MAP;');
const MAP = new Function('HC', body)({ MAP: null });

test('map fixed: jalan & elevasi deterministik (dua panggilan identik)', () => {
  for (const x of [-20, 0, 37, 120, 260, 400]) {
    assert.equal(MAP.roadCenterZ(x), MAP.roadCenterZ(x));
    assert.equal(MAP.roadElevation(x), MAP.roadElevation(x));
  }
  assert.ok(Math.abs(MAP.roadCenterZ(60) - MAP.roadCenterZ(-10)) > 0.5, 'jalan harus berkelok');
  assert.ok(MAP.roadElevation(254) - MAP.roadElevation(150) > 1.0, 'harus ada tanjakan nyata');
});

test('tanjakan tidak lebih curam dari batas Lv1 (~0.30)', () => {
  let max = 0;
  for (let x = MAP.bounds.xMin; x <= MAP.bounds.xMax - 1; x += 0.5) {
    const g = Math.abs(MAP.roadElevation(x + 0.5) - MAP.roadElevation(x)) / 0.5;
    if (g > max) max = g;
  }
  assert.ok(max <= 0.30, `grade maksimum ${max.toFixed(3)} melebihi 0.30`);
});

test('semua 18 arketipe NPC terpasang tepat sekali di kelompok tetap', () => {
  const spawns = MAP.allNPCSpawns();
  const ids = spawns.map((s) => s.role).sort();
  assert.equal(spawns.length, 18);
  assert.deepEqual(ids, ['dungeonmaster', 'elfmage', 'farmer', 'goblin', 'guard', 'guardian', 'herbal', 'hunter', 'lich', 'lionknight', 'magesupport', 'merchant', 'miner', 'petmerchant', 'rabbitwarrior', 'royalguard', 'stonegiant', 'warrior'].sort());
  for (const s of spawns) {
    assert.ok(s.x > MAP.bounds.xMin && s.x < MAP.bounds.xMax, `${s.role} di luar batas x`);
    assert.ok(s.z > MAP.bounds.zMin && s.z < MAP.bounds.zMax, `${s.role} di luar batas z`);
  }
});

test('setiap kelompok NPC berada di situsnya, bukan menyebar bebas', () => {
  const spawns = MAP.allNPCSpawns();
  for (const s of spawns) {
    const site = MAP.sites.find((v) => v.id === s.site);
    const d = Math.hypot(s.x - site.x, s.z - site.z);
    assert.ok(d <= site.radius, `${s.role} ${d.toFixed(2)} m dari ${site.id} (radius ${site.radius})`);
  }
});

test('boulder & ramp punya koordinat tetap dan berada di jalur', () => {
  assert.ok(MAP.boulders.length >= 8);
  assert.ok(MAP.ramps.length >= 2);
  for (const [x, zOff] of MAP.boulders) {
    assert.ok(Number.isFinite(x) && Number.isFinite(zOff));
    assert.ok(Math.abs(zOff) < 1.6, `boulder x=${x} terlalu jauh dari jalur`);
  }
  for (const r of MAP.ramps) {
    assert.ok(Number.isFinite(r.x) && Math.abs(r.lateral) < 3);
  }
});
