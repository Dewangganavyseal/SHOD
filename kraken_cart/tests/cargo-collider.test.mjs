// Collider voxel kargo: bentuk mengikuti mesh dan dipakai untuk tumpukan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = path.dirname(fileURLToPath(import.meta.url));

const voxelSrc = fs.readFileSync(path.join(baseDir, '../js/voxel.js'), 'utf8');
const mcStart = voxelSrc.indexOf('  makeCollider(');
const mcEnd = voxelSrc.indexOf('  build(', mcStart);
assert.ok(mcStart >= 0 && mcEnd > mcStart, 'makeCollider tidak ditemukan');
const makeCollider = new Function(
  `return ({ ${voxelSrc.slice(mcStart, mcEnd)} }).makeCollider;`
)();

const physSrc = fs.readFileSync(path.join(baseDir, '../js/physics.js'), 'utf8');
const phStart = physSrc.indexOf('function cargoColliderBoxes');
const phEnd = physSrc.indexOf('//  VERLET ROPE');
assert.ok(phStart >= 0 && phEnd > phStart, 'helper collider fisika tidak ditemukan');
const { computeCargoSupports, worldCargoBoxes } = new Function(
  `${physSrc.slice(phStart, phEnd)}\nreturn { computeCargoSupports, worldCargoBoxes };`
)();

function builder(vs, cells) {
  const map = new Map();
  for (const [x, y, z] of cells) map.set(`${x},${y},${z}`, { x, y, z });
  return { vs, map };
}

function occupiedByBoxes(boxes, vs) {
  const cells = new Set();
  for (const b of boxes) {
    const x0 = Math.round((b.cx - b.hx) / vs + 0.5);
    const x1 = Math.round((b.cx + b.hx) / vs - 0.5);
    const y0 = Math.round((b.cy - b.hy) / vs + 0.5);
    const y1 = Math.round((b.cy + b.hy) / vs - 0.5);
    const z0 = Math.round((b.cz - b.hz) / vs + 0.5);
    const z1 = Math.round((b.cz + b.hz) / vs - 0.5);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) cells.add(`${x},${y},${z}`);
  }
  return cells;
}

test('kotak solid digabung jadi satu collider dengan ukuran tepat', () => {
  const cells = [];
  for (let x = -1; x <= 1; x++)
    for (let y = 0; y <= 1; y++)
      for (let z = -1; z <= 1; z++) cells.push([x, y, z]);
  const vs = 0.1;
  const boxes = makeCollider.call(builder(vs, cells));
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].cx) < 1e-9);
  assert.ok(Math.abs(boxes[0].cy - 0.05) < 1e-9);
  assert.ok(Math.abs(boxes[0].cz) < 1e-9);
  assert.ok(Math.abs(boxes[0].hx - 0.15) < 1e-9);
  assert.ok(Math.abs(boxes[0].hy - 0.1) < 1e-9);
  assert.ok(Math.abs(boxes[0].hz - 0.15) < 1e-9);
});

test('collider mengikuti siluet silinder, bukan AABB penuh', () => {
  const cells = [];
  const r = 2.2;
  for (let y = -2; y <= 2; y++)
    for (let x = -4; x <= 4; x++)
      for (let z = -4; z <= 4; z++)
        if (x * x + z * z <= r * r) cells.push([x, y, z]);
  const vs = 0.1;
  const boxes = makeCollider.call(builder(vs, cells));
  const covered = occupiedByBoxes(boxes, vs);
  assert.equal(covered.size, cells.length, 'collider harus menutup semua voxel');
  for (const cell of cells) assert.ok(covered.has(cell.join(',')), `voxel ${cell} hilang`);
  assert.ok(!covered.has('3,0,3'), 'sudut kosong tidak boleh jadi collider');
  assert.ok(boxes.length < cells.length / 3, 'collider harus digabung, bukan per voxel');
});

test('barang di atas ditahan permukaan barang bawah yang benar-benar bertumpuk', () => {
  const lower = {
    floorY: 0, spilled: false, hiddenForQuest: false,
    localPos: { x: 0, y: 0, z: 0 }, localAng: { y: 0 },
    colliderBoxes: [{ cx: 0, cy: 0.25, cz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }]
  };
  const upper = {
    floorY: 0, spilled: false, hiddenForQuest: false,
    localPos: { x: 0.02, y: 0.5, z: 0 }, localAng: { y: 0 },
    colliderBoxes: [{ cx: 0, cy: 0.1, cz: 0, hx: 0.15, hy: 0.1, hz: 0.15 }]
  };
  const items = [lower, upper];
  const boxes = items.map((it) => worldCargoBoxes(it));
  const supports = computeCargoSupports(items, boxes);
  assert.ok(Math.abs(supports[1].y - 0.5) < 1e-9);
  assert.equal(supports[1].by, lower);
  assert.equal(supports[0].by, null);
});

test('barang bersebelahan tidak dianggap ditumpuk walaupun AABB berimpit', () => {
  const a = {
    floorY: 0, spilled: false, hiddenForQuest: false,
    localPos: { x: 0, y: 0, z: 0 }, localAng: { y: 0 },
    colliderBoxes: [{ cx: 0, cy: 0.3, cz: 0, hx: 0.05, hy: 0.3, hz: 0.3 }]
  };
  const b = {
    floorY: 0, spilled: false, hiddenForQuest: false,
    localPos: { x: 0.15, y: 0, z: 0 }, localAng: { y: 0 },
    colliderBoxes: [{ cx: 0, cy: 0.3, cz: 0, hx: 0.05, hy: 0.3, hz: 0.3 }]
  };
  const items = [a, b];
  const supports = computeCargoSupports(items, items.map((it) => worldCargoBoxes(it)));
  assert.equal(supports[0].by, null);
  assert.equal(supports[1].by, null);
});

test('sudut kosong barrel tidak menahan barang yang hanya berimpit di AABB', () => {
  const lower = {
    floorY: 0, spilled: false, hiddenForQuest: false,
    localPos: { x: 0, y: 0, z: 0 }, localAng: { y: 0 },
    colliderBoxes: [
      { cx: 0.25, cy: 0.25, cz: 0.25, hx: 0.1, hy: 0.25, hz: 0.1 },
      { cx: -0.25, cy: 0.25, cz: -0.25, hx: 0.1, hy: 0.25, hz: 0.1 }
    ]
  };
  const upper = {
    floorY: 0, spilled: false, hiddenForQuest: false,
    localPos: { x: 0.39, y: 0.6, z: 0.39 }, localAng: { y: 0 },
    colliderBoxes: [{ cx: 0, cy: 0.1, cz: 0, hx: 0.06, hy: 0.1, hz: 0.06 }]
  };
  const items = [lower, upper];
  const supports = computeCargoSupports(items, items.map((it) => worldCargoBoxes(it)));
  assert.equal(supports[1].by, null, 'sudut kosong tidak boleh menahan');
});
