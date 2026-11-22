// Aturan tempur tenang (guard / tangkis / postur) — diuji tanpa THREE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const baseDir = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(baseDir, '../js/mobs.js'), 'utf8');

// guardChoice + resolveGuardHit sengaja murni angka supaya bisa dieksekusi di sini.
const bridge = src.slice(src.indexOf('function guardChoice('), src.indexOf('class TacticalCombatAI'));
const { guardChoice, resolveGuardHit } = new Function(
  'clamp',
  `${bridge}; return { guardChoice, resolveGuardHit };`
)((v, a, b) => Math.max(a, Math.min(b, v)));

test('warga memilih menahan saat peluang tangkisnya tinggi, menggeser saat rendah', () => {
  assert.equal(guardChoice({ parry: 0.9 }, () => 0.1), 'guard');
  assert.equal(guardChoice({ parry: 0.9 }, () => 0.95), 'dodge');
  assert.equal(guardChoice({ parry: 0.2 }, () => 0.5), 'dodge');
  assert.equal(guardChoice({}, () => 0.2), 'guard', 'profil tanpa parry memakai 0,5');
});

test('tangkisan sempurna: nol damage, postur boar naik, dapat jendela balas', () => {
  const out = resolveGuardHit({ parry: 0.9 }, 0, 20, () => 0.1);
  assert.equal(out.kind, 'deflect');
  assert.equal(out.dmg, 0, 'tangkisan tidak menghabiskan HP warga');
  assert.equal(out.counter, true);
  assert.ok(out.boarPosture > 0.3, 'postur boar harus naik banyak');
});

test('tahanan gagal: damage dipotong, postur warga menumpuk', () => {
  const out = resolveGuardHit({ parry: 0.2 }, 0, 20, () => 0.9);
  assert.equal(out.kind, 'block');
  assert.equal(out.dmg, 6, '20 x 0,28 dibulatkan');
  assert.ok(out.npcPosture > 0.3);
  assert.equal(out.counter, false);
});

test('postur penuh memecahkan guard dan mengembalikan postur warga ke nol', () => {
  const out = resolveGuardHit({ parry: 0.2 }, 0.8, 20, () => 0.9);
  assert.equal(out.kind, 'break');
  assert.equal(out.npcPosture, 0);
  assert.ok(out.stun > 0.5, 'guard pecah harus memberi jeda terbuka');
});

test('tiga tangkisan berturut-turut memecahkan postur boar', () => {
  let posture = 0;
  let deflected = 0;
  for (let i = 0; i < 3; i++) {
    const out = resolveGuardHit({ parry: 1 }, 0, 12, () => 0.0);
    posture += out.boarPosture;
    deflected += out.kind === 'deflect' ? 1 : 0;
  }
  assert.equal(deflected, 3);
  assert.ok(posture >= 1, 'postur boar harus penuh setelah tiga tangkisan');
});

test('boar punya state stagger + postur, dan bar HP menampilkannya', () => {
  assert.match(src, /addPosture\(amount\)/, 'boar harus punya addPosture()');
  assert.match(src, /_setState\('stagger', 1\.30\)/, 'postur penuh -> stagger');
  assert.match(src, /next === 'stagger'/, 'stagger harus dihitung sebagai celah (isVulnerable)');
  assert.match(src, /this\.hpBar\.setPosture\(this\.posture, this\.inCombat\)/);
  assert.match(src, /setPosture\(ratio, on\)/, 'HealthBar3D butuh setPosture');
});

test('AI memakai guardChoice dan tidak lagi melingkari tanpa jeda', () => {
  assert.match(src, /const choice = guardChoice\(prof\)/);
  assert.match(src, /cb\.phase = 'guard'/);
  assert.match(src, /cb\.watchT/, 'ada jeda mengamati sebelum melingkar');
});
