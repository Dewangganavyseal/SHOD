// Frame visual kargo: offset origin mesh dan clamp AABB ke dalam bak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(baseDir, '../js/physics.js'), 'utf8');
const start = src.indexOf('function cargoFootprint');
const end = src.indexOf('//  VERLET ROPE');
assert.ok(start >= 0 && end > start, 'helper frame kargo tidak ditemukan');
const { cargoFootprint, cargoBedLimits } = new Function(
  `${src.slice(start, end)}\nreturn { cargoFootprint, cargoBedLimits };`
)();

const bed = { xMin: 0.12, xMax: 1.65, zMin: -1.05, zMax: 1.05 };
const pad = 0.004;

test('offset visual mengikuti rotasi Y Three.js, bukan rotasi matematis Z-up', () => {
  const fp = cargoFootprint(0, 0, { x: 0.1, z: 0.2 }, { x: 0.3, z: 0.4 }, Math.PI / 2);
  // x' = x cos + z sin = z, z' = -x sin + z cos = -x
  assert.ok(Math.abs(fp.x - 0.2) < 1e-9);
  assert.ok(Math.abs(fp.z + 0.1) < 1e-9);
  assert.ok(Math.abs(fp.hx - 0.4) < 1e-9);
  assert.ok(Math.abs(fp.hz - 0.3) < 1e-9);
});

test('clamp origin menjaga seluruh AABB visual di dalam bak untuk semua yaw', () => {
  const half = { x: 0.31, z: 0.276 };
  const centers = [
    { x: 0, z: 0 },
    { x: 0.0265, z: 0 },
    { x: 0, z: -0.0345 },
    { x: 0.05, z: 0.02 },
    { x: -0.03, z: -0.0345 }
  ];
  for (const yaw of [-0.52, -0.22, 0, 0.14, 0.28, 0.52]) {
    for (const center of centers) {
      const lim = cargoBedLimits(center, half, yaw, bed, pad);
      for (const posX of [lim.minX, lim.maxX]) {
        for (const posZ of [lim.minZ, lim.maxZ]) {
          const fp = cargoFootprint(posX, posZ, center, half, yaw);
          assert.ok(fp.x - fp.hx >= bed.xMin + pad - 1e-9, `xMin yaw=${yaw}`);
          assert.ok(fp.x + fp.hx <= bed.xMax - pad + 1e-9, `xMax yaw=${yaw}`);
          assert.ok(fp.z - fp.hz >= bed.zMin + pad - 1e-9, `zMin yaw=${yaw}`);
          assert.ok(fp.z + fp.hz <= bed.zMax - pad + 1e-9, `zMax yaw=${yaw}`);
        }
      }
    }
  }
});
