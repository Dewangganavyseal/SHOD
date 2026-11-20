import assert from 'node:assert/strict';
import { Survival } from '../js/survival.js';

const MAP = { roadHalf: 3, roadCenterZ: () => 0 };
const WATER = { riverDistX: () => Infinity };
const ctx = (o = {}) => ({ x: 20, z: 14, speed: 0, moving: false, running: false, flipped: false, ...o });
function sim(S, seconds, c) { for (let t = 0; t < seconds; t += 1 / 60) S.update(1 / 60, ctx(c)); }

// 1) Lari boros stamina, lapar, dan haus; jalan boros lebih pelan.
const S = new Survival({ map: MAP, world: WATER });
sim(S, 20, { moving: true, running: true, speed: 5 });
assert(S.stamina < 100 && S.hunger < 100 && S.thirst < 100, 'lari harus menggerus');
console.log('  lari 20 s:', S.stamina.toFixed(1), S.hunger.toFixed(1), S.thirst.toFixed(1));
assert(S.stamina < 40, 'stamina turun nyata saat lari');

// 2) Stamina habis -> tidak boleh lari + top speed dibatasi.
sim(S, 40, { moving: true, running: true });
assert.equal(S.canRun(), false);
assert(S.speedScale() < 1);
console.log('  stamina habis: canRun=0, speedScale=' + S.speedScale().toFixed(2));

// 3) Diam pulih stamina, tapi lapar/haus tetap turun.
const st0 = S.stamina;
sim(S, 10);
assert(S.stamina > st0, 'pulih pas diam');

// 4) Lapar 0 dan haus 0 -> HP terkikis; kecepatan drop.
const S2 = new Survival({ map: MAP, world: WATER });
S2.hunger = 0.02; S2.thirst = 0.02;
sim(S2, 5);
assert(S2.hp < 100, 'kelaparan menggerus HP');
assert(S2.starving && S2.parched);
console.log('  lapar+haus 5 s: HP', S2.hp.toFixed(2));
sim(S2, 5, { moving: true, hunger: false });
assert(S2.speedScale() < 0.5);

// 5) MAKAN: di jalan / di air / masih kencang tidak boleh; di rumput pelan boleh.
const S3 = new Survival({ map: MAP, world: WATER });
S3.hunger = 40;
assert.equal(S3.tryEat(ctx({ z: 0 })), false, 'makan di jalan ditolak');
assert.equal(S3.tryEat(ctx({ z: 14, speed: 4 })), false, 'makan sambil kencang ditolak');
assert.equal(S3.tryEat(ctx({ z: 14 })), true);
assert.equal(S3.eating, true);
// makan memperlambat makanan: lapar naik kembali + stamina ikut pulih
const h0 = S3.hunger;
sim(S3, 3);
assert(S3.hunger > h0 + 15, 'lapar terisi');
assert.equal(S3.eating, false, 'makan selesai sendiri');
console.log('  lapar 40 ->', S3.hunger.toFixed(1));

// 6) MINUM: harus dekat sungai.
const S4 = new Survival({ map: MAP, world: WATER });
S4.thirst = 30;
assert.equal(S4.tryDrink(ctx({ z: 14 })), false, 'jauh dari sungai ditolak');
const NEAR_WATER = { riverDistX: () => 5 };
const S5 = new Survival({ map: MAP, world: NEAR_WATER });
S5.thirst = 30;
assert.equal(S5.tryDrink(ctx({ z: 14 })), true);
sim(S5, 3);
assert(S5.thirst > 75, 'haus terisi');
console.log('  haus 30 ->', S5.thirst.toFixed(1));

// 7) HP tidak bocor >100/<0 dan pemulihan pas kondisi bagus.
const S6 = new Survival({ map: MAP, world: WATER });
S6.hp = 99;
sim(S6, 4);
assert(S6.hp <= 100 && S6.hp > 99);
sim(S6, 1, { flipped: true });
assert(S6.hp < 100, 'gerobak terbalik melukai kuda');
const S7 = new Survival({ map: MAP, world: WATER });
S7.hunger = 0; S7.thirst = 0;
sim(S7, 400, {});
assert.equal(S7.hp, 0, 'selapar ini lama-lama kuda KO');
assert(S7.speedScale() > 0, 'speedScale tetap angka positif');

// 8) Deterministik: run dua kali hasil sama.
function runOnce() { const s = new Survival({ map: MAP, world: WATER }); sim(s, 30, { moving: true, running: true }); return [s.hp, s.stamina, s.hunger, s.thirst]; }
assert.deepEqual(runOnce(), runOnce());

console.log('\nOK semua — survival (stamina, HP, lapar, haus, makan, rumput, sungai, KO) valid.');
