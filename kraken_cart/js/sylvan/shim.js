/* Shim lingkungan Sylvan Dominion untuk model NPC asli (js/sylvan/npc_*.js).
   File model itu naskah klasik yang mengandalkan variabel global: THREE,
   IS_MOBILE, lerp/clamp/rand, serta sistem FX/Monsters/Player/NPCS/Game/CFG/Sfx.
   Modul ini menyediakan versi aman (no-op) supaya build() & animate() jalan di
   SHOD tanpa mesin tempur Sylvan. Urutan impor penting: modul ini HARUS masuk
   sebelum file model mana pun dievaluasi. */
import { HC } from '../hc.js';

const T = HC.THREE;

if (!window.THREE) window.THREE = T;
window.IS_MOBILE = false;

if (!window.lerp) window.lerp = (a, b, t) => a + (b - a) * t;
if (!window.clamp) window.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
if (!window.rand) window.rand = (a = 1, b = 0) => (b === 0 ? Math.random() * a : a + Math.random() * (b - a));
if (!window.angLerp) {
  window.angLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
}

/* Wadah scene: main.js menimpa `Game.scene` dengan scene asli supaya efek
   (FX) yang dibuat model benar-benar tampil. */
if (!window.Game) window.Game = { scene: new T.Group(), loop() {} };
if (!window.CFG) window.CFG = { NPC: { TEAM_MAX: 3 }, NPC_RARE_MAX_LEVEL: 100, SEA: 0 };

/* FX: setiap pemanggilan mengembalikan Group kosong supaya rantai
   `.position.set(...)` / `.add(...)` pada hasilnya tidak meledak. */
const fxStub = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === 'update') return () => {};
      return () => new T.Group();
    },
  },
);
if (!window.FX) window.FX = fxStub;
if (!window.Sfx) window.Sfx = new Proxy({}, { get: () => () => {} });
if (!window.ITEMS) window.ITEMS = new Proxy({}, { get: () => () => {} });

/* Furni: cache material bersama milik prototipe Royal Guard (Furni.M(key,color)).
   Di SHOD cukup satu material Lambert per warna, di-cache per key. */
if (!window.Furni) {
  const matCache = new Map();
  window.Furni = {
    M(key, color) {
      if (matCache.has(key)) return matCache.get(key);
      const m = new T.MeshLambertMaterial({ color });
      matCache.set(key, m);
      return m;
    },
    clear() { matCache.clear(); },
  };
}

/* PortFX/MobNet/WeaponManager/ShieldModels/World: dipakai model rare saat
   efek tempur atau sinkronisasi jaringan. Di SHOD semuanya no-op. */
if (!window.PortFX) window.PortFX = fxStub;
if (!window.MobNet) window.MobNet = new Proxy({}, { get: () => () => {} });
if (!window.WeaponManager) window.WeaponManager = { get: () => null, build: () => new T.Group() };
if (!window.ShieldModels) window.ShieldModels = { get: () => null, build: () => new T.Group() };
if (!window.World) window.World = { groundAt: () => 0 };
if (!window.PI) window.PI = Math.PI;
/* Easing kurva yang dipakai NPC Goblin (PE.out / PE.bell). */
if (!window.PE) window.PE = {
  in(t) { const u = Math.max(0, Math.min(1, t)); return u * u; },
  out(t) { const u = Math.max(0, Math.min(1, t)); return 1 - (1 - u) * (1 - u); },
  inOut(t) { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); },
  bell(t) { const u = Math.max(0, Math.min(1, t)); return Math.sin(u * Math.PI); },
  seg(t, a, b) {
    if (b <= a) return t >= a ? 1 : 0;
    return Math.max(0, Math.min(1, (t - a) / (b - a)));
  },
};

if (!window.Monsters) {
  window.Monsters = {
    list: [],
    hurt() {},
    isAnimal: () => false,
    isTargetable: () => false,
    addThreat() {},
    shareKillXp() {},
    rollLevel: () => 1,
  };
}

if (!window.Player) {
  window.Player = {
    hp: 100,
    maxHp: 100,
    level: 1,
    dead: false,
    pos: new T.Vector3(),
    hurt() {},
    takeDamage() {},
  };
}

/* NPCS: NPC asli memanggil balik ke sistem induknya (damage, threat, dsb).
   Di SHOD semua itu no-op; nilainya dibuat masuk akal supaya animasi idle
   tidak menghasilkan NaN. */
if (!window.NPCS) {
  const stub = {
    list: [],
    team: [],
    npcDef: null,
    npcMaxHp: (n) => (n && n.maxHp) || 100,
    npcDmg: (n) => (n && n.dmg) || 10,
    npcReach: () => 3,
    skillStamCost: () => 0,
    isTeam: () => false,
    stepFree() {},
    say() {},
    hurt() {},
    aiFight() {},
    despawn() {},
    give() {},
    refreshGear() {},
    buildModel: (role) => HC.buildNPC(role, 'stand'),
    animate() {},
    update() {},
  };
  window.NPCS = stub;
}

export { T };
