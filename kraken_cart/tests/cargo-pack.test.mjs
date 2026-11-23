// Packing kargo: barang statis tidak bertumpuk dan semua kargo quest dapat slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(baseDir, '../js/cart.js'), 'utf8');

const packSrc = src.slice(src.indexOf('function packCargoBoxes'), src.indexOf('function buildCargoItems'));
const slotSrc = src.slice(src.indexOf('function findFreeCargoSlot'), src.indexOf('HC.setQuestCargoOnCart'));
const { packCargoBoxes, findFreeCargoSlot } = new Function(
  `${packSrc}\n${slotSrc}\nreturn { packCargoBoxes, findFreeCargoSlot };`
)();

// Ukuran bak Lv1 dalam meter (cartVS 0,075; interior 1,6..22 voxel & -14..14).
const bounds = { xMin: 0.12, xMax: 1.65, zMin: -1.05, zMax: 1.05 };

test('packer kapasitas tidak menumpuk dan tetap di dalam bak', () => {
  for (const count of [6, 8, 12]) {
    const base = Array.from({ length: count }, (_, i) => ({
      index: i,
      width: 0.46 + (i % 4) * 0.06,
      depth: 0.34 + (i % 5) * 0.05
    }));
    let best = null;
    for (let low = 0.18, high = 1, i = 0; i < 26; i++) {
      const scale = (low + high) * 0.5;
      const placed = packCargoBoxes(
        base.map((b) => ({ ...b, width: b.width * scale, depth: b.depth * scale })),
        bounds,
        0.018
      );
      if (placed) { best = { scale, placed }; low = scale; } else high = scale;
    }
    assert.ok(best, `kapasitas ${count}: packer gagal`);
    const placed = best.placed;
    assert.ok(best.scale > 0.2);
    assert.equal(placed.length, count);
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      assert.ok(a.x - a.box.width / 2 >= bounds.xMin - 1e-6, 'kargo keluar sisi belakang');
      assert.ok(a.x + a.box.width / 2 <= bounds.xMax + 1e-6, 'kargo keluar sisi depan');
      assert.ok(a.z - a.box.depth / 2 >= bounds.zMin - 1e-6, 'kargo keluar sisi kiri');
      assert.ok(a.z + a.box.depth / 2 <= bounds.zMax + 1e-6, 'kargo keluar sisi kanan');
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        const overlapX = Math.abs(a.x - b.x) < (a.box.width + b.box.width) / 2 - 1e-6;
        const overlapZ = Math.abs(a.z - b.z) < (a.box.depth + b.box.depth) / 2 - 1e-6;
        assert.ok(!(overlapX && overlapZ), `kapasitas ${count}: kargo ${i} dan ${j} bertumpuk`);
      }
    }
  }
});

test('tiga kargo quest masuk bersama perbekalan di bak Lv1', () => {
  // Dua perbekalan yang selalu tampil (Water Barrel & Fruit Box), ukuran AABB
  // dunia di bak Lv1. Nilai ini sengaja dibulatkan ke atas agar aman.
  const occupied = [
    { x: 0.417, z: 0.776, hx: 0.297 + 0.008, hz: 0.274 + 0.008 },
    { x: 1.001, z: 0.750, hx: 0.271 + 0.008, hz: 0.249 + 0.008 }
  ];
  const quest = { width: 0.762, depth: 0.700 };
  const margin = 0.008;
  let chosen = null;
  for (let scale = 1; scale >= 0.55 - 1e-6; scale -= 0.02) {
    const rects = occupied.slice();
    let ok = true;
    for (let i = 0; i < 3; i++) {
      const hx = quest.width * scale * 0.5 + margin;
      const hz = quest.depth * scale * 0.5 + margin;
      const slot = findFreeCargoSlot(rects, bounds, hx, hz, 0.03);
      if (!slot) { ok = false; break; }
      rects.push({ x: slot.x, z: slot.z, hx, hz });
    }
    if (ok) { chosen = scale; break; }
  }
  assert.ok(chosen, 'tidak ada skala yang memuat 3 kargo quest');
  assert.ok(chosen > 0.8, `kargo quest terlalu kecil (${chosen})`);
});
