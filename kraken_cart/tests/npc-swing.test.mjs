// Regresi ayunan tangan NPC: non-combat memakai pulsa pendek, combat tetap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(baseDir, rel), 'utf8');
const src = read('../js/npc.js');
const mobsSrc = read('../js/mobs.js');

const pulseBlock = src.slice(
  src.indexOf('const NPC_SWING_PULSE'),
  src.indexOf('function _setVillageDoorHold')
);
const { NPC_SWING_PULSE, _armSwing, _tickSwing } = new Function(
  `${pulseBlock}; return { NPC_SWING_PULSE, _armSwing, _tickSwing };`
)();

test('pulsa ayunan non-combat pendek dan berhenti sendiri', () => {
  assert.ok(NPC_SWING_PULSE > 0 && NPC_SWING_PULSE <= 0.3);
  const m = { swingPulse: 0 };
  _armSwing(m);
  assert.equal(m.swingPulse, NPC_SWING_PULSE);
  assert.equal(_tickSwing(m, 0.1), NPC_SWING_PULSE - 0.1);
  _armSwing(m);
  for (let i = 0; i < 120; i++) _tickSwing(m, 1 / 60);
  assert.equal(m.swingPulse, 0, 'pulsa tidak boleh berubah jadi timer berjalan');
  assert.equal(_tickSwing(m, 1 / 60), 0);
});

test('pulsa baru tidak menumpuk saat aksi berulang', () => {
  const m = { swingPulse: 0 };
  for (let i = 0; i < 8; i++) {
    _armSwing(m);
    for (let f = 0; f < 6; f++) _tickSwing(m, 1 / 60);
  }
  assert.ok(m.swingPulse <= NPC_SWING_PULSE);
});

test('14 arketipe recruitable punya profil perilaku dan model animate', () => {
  const block = src.match(/HC\.NPC_ROLES\s*=\s*\[([\s\S]*?)\n\];/)?.[1] || '';
  const entries = block.split(/(?=\{ id:')/).slice(1)
    .filter((chunk) => /recruitable:true/.test(chunk))
    .map((chunk) => chunk.match(/^\{ id:'(\w+)'/)[1]);
  const expected = [
    'hunter', 'miner', 'farmer', 'herbal', 'warrior', 'guardian', 'lionknight',
    'elfmage', 'stonegiant', 'rabbitwarrior', 'goblin', 'magesupport', 'royalguard', 'lich',
  ];
  assert.deepEqual(entries.sort(), expected.slice().sort());
  for (const id of expected) {
    assert.match(src, new RegExp(`\\b${id}:\\s*\\{ mode:`), `${id}: profil perilaku hilang`);
    const model = `../js/sylvan/npc_${id}.js`;
    assert.ok(fs.existsSync(path.join(baseDir, model)), `${id}: model hilang`);
  }
});

test('state diam/jalan mematikan pulsa supaya tangan tidak terus mengayun', () => {
  assert.match(src, /if \(walkingNow\) m\.swingPulse = 0;/);
  assert.match(src, /st\.swing = walkingNow \? 0 : _tickSwing\(m, dt\);/);
  assert.match(src, /st\.swing = 0;/, 'pose duduk/naik harus mereset ayunan');
});

test('combat tetap memakai decay ayunan sendiri (tidak ikut pulsa non-combat)', () => {
  assert.match(mobsSrc, /this\.animState\.swing = 0\.35;/);
  assert.match(mobsSrc, /st\.swing = 0\.25;/);
  assert.match(mobsSrc, /if \(st\.swing > 0\) st\.swing = Math\.max\(0, st\.swing - dt\);/);
  assert.doesNotMatch(src, /swingT \+=/, 'non-combat tidak boleh menambah timer tanpa henti');
});
