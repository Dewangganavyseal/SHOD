import { HC } from './hc.js';

const tr = (k, fb) => (HC && typeof HC.t === 'function' ? HC.t(k) : fb);

// ============================================================
//  CART UPGRADE SYSTEM (VILLAGE WORKSHOP: GOLD + ITEMS)
//  & HORSE ATTRIBUTE UPGRADES
// ============================================================
export const MATERIAL_DEFS = {
  wood: { key: 'wood', icon: '🪵', nameKey: 'mat_wood', name: 'Oak Timber' },
  iron: { key: 'iron', icon: '⚙️', nameKey: 'mat_iron', name: 'Forged Iron' },
  leather: { key: 'leather', icon: '🪢', nameKey: 'mat_leather', name: 'Hide Rope' },
  cloth: { key: 'cloth', icon: '🧵', nameKey: 'mat_cloth', name: 'Heavy Canvas' },
};

export const UPGRADE_COSTS = {
  capacity: [null, { gold: 70, items: { wood: 2, leather: 1 } }, { gold: 130, items: { wood: 4, iron: 2 } }],
  wheels: [null, { gold: 65, items: { wood: 2, iron: 1 } }, { gold: 120, items: { iron: 3, wood: 2 } }],
  suspension: [null, { gold: 75, items: { iron: 2, leather: 1 } }, { gold: 140, items: { iron: 4, leather: 2 } }],
  straps: [null, { gold: 55, items: { leather: 2 } }, { gold: 105, items: { leather: 3, iron: 2 } }],
  canopy: [null, { gold: 65, items: { iron: 2, wood: 1 } }, { gold: 125, items: { cloth: 3, wood: 2 } }],
};

export const UPGRADE_LINES = [
  {
    key: 'capacity',
    nameKey: 'ug_capacity_name',
    name: 'Bed & Cargo Bay',
    icon: '🪵',
    desc: 'Cargo deck size & fence rails height.',
    levels: [
      { shortKey: 'ug_capacity_lv1', short: 'Lv1 Compact', label: 'Lv1 Compact', detail: '4 seats • 6 supplies' },
      { shortKey: 'ug_capacity_lv2', short: 'Lv2 Standard', label: 'Lv2 Standard', detail: '4 seats • 8 supplies' },
      { shortKey: 'ug_capacity_lv3', short: 'Lv3 Expedition', label: 'Lv3 Expedition', detail: '4 seats • 12 supplies' }
    ]
  },
  {
    key: 'wheels',
    nameKey: 'ug_wheels_name',
    name: 'Wheels & Rims',
    icon: '🛞',
    desc: 'Larger, iron-bound wheels roll smoothly over rocks.',
    levels: [
      { shortKey: 'ug_wheels_lv1', short: 'Lv1 Oak Wood', label: 'Lv1 Oak Wood', detail: 'Rigid wooden axle' },
      { shortKey: 'ug_wheels_lv2', short: 'Lv2 Iron Tyre', label: 'Lv2 Iron Tyre', detail: 'Iron rim + springs' },
      { shortKey: 'ug_wheels_lv3', short: 'Lv3 Forged Steel', label: 'Lv3 Forged Steel', detail: 'Offroad wide steel' }
    ]
  },
  {
    key: 'suspension',
    nameKey: 'ug_suspension_name',
    name: 'Suspension & Springs',
    icon: '⚙️',
    desc: 'Adds travel & shock absorption.',
    levels: [
      { shortKey: 'ug_suspension_lv1', short: 'Lv1 Rigid Axle', label: 'Lv1 Rigid Axle', detail: 'No suspension' },
      { shortKey: 'ug_suspension_lv2', short: 'Lv2 Leaf Spring', label: 'Lv2 Leaf Spring', detail: '0.24 m spring travel' },
      { shortKey: 'ug_suspension_lv3', short: 'Lv3 Twin-Coil', label: 'Lv3 Twin-Coil', detail: '0.34 m offroad coils' }
    ]
  },
  {
    key: 'straps',
    nameKey: 'ug_straps_name',
    name: 'Cargo Straps',
    icon: '🪢',
    desc: 'Ties down cargo, reducing bounce.',
    levels: [
      { shortKey: 'ug_straps_lv1', short: 'Lv1 Unstrapped', label: 'Lv1 Unstrapped', detail: 'Loose cargo movement' },
      { shortKey: 'ug_straps_lv2', short: 'Lv2 Hemp Rope', label: 'Lv2 Hemp Rope', detail: '-38% cargo jolt' },
      { shortKey: 'ug_straps_lv3', short: 'Lv3 Chain Net', label: 'Lv3 Chain Net', detail: '-70% cargo jolt' }
    ]
  },
  {
    key: 'canopy',
    nameKey: 'ug_canopy_name',
    name: 'Frame & Canopy',
    icon: '⛺',
    desc: 'Iron armor trim & expedition canvas roof.',
    levels: [
      { shortKey: 'ug_canopy_lv1', short: 'Lv1 Open Bed', label: 'Lv1 Open Bed', detail: 'Plain oak frame' },
      { shortKey: 'ug_canopy_lv2', short: 'Lv2 Iron Guard', label: 'Lv2 Iron Guard', detail: 'Iron plates + lantern' },
      { shortKey: 'ug_canopy_lv3', short: 'Lv3 Canvas Canopy', label: 'Lv3 Canvas Canopy', detail: 'Arched expedition roof' }
    ]
  }
];

export const STRAP_JOLT = [1, 0.62, 0.30];
export const DEFAULT_LEVELS = { capacity: 0, wheels: 0, suspension: 0, straps: 0, canopy: 0 };
const SAVE_KEY = 'kraken_cart_sim_v3';

export class UpgradeStore {
  constructor() {
    this.levels = { ...DEFAULT_LEVELS };
    this.unlocked = { capacity: [0], wheels: [0], suspension: [0], straps: [0], canopy: [0] };
    this.materials = { wood: 4, iron: 3, leather: 3, cloth: 2 };
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.levels) {
        for (const line of UPGRADE_LINES) {
          const v = data.levels[line.key];
          if (Number.isInteger(v)) this.levels[line.key] = Math.max(0, Math.min(2, v));
        }
      }
      for (const line of UPGRADE_LINES) {
        const saved = data && data.unlocked && Array.isArray(data.unlocked[line.key]) ? data.unlocked[line.key] : null;
        const set = new Set([0, this.levels[line.key] ?? 0]);
        if (saved) {
          for (const idx of saved) {
            if (Number.isInteger(idx) && idx >= 0 && idx <= 2) set.add(idx);
          }
        }
        this.unlocked[line.key] = Array.from(set).sort((a, b) => a - b);
      }
      if (data && data.materials) {
        for (const k of Object.keys(MATERIAL_DEFS)) {
          const v = data.materials[k];
          if (Number.isFinite(v)) this.materials[k] = Math.max(0, v | 0);
        }
      }
    } catch (e) { /* ignore corrupt save */ }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        levels: this.levels,
        unlocked: this.unlocked,
        materials: this.materials,
      }));
    } catch (e) { /* storage may be blocked */ }
  }

  addMaterials(delta = {}) {
    if (!delta) return;
    for (const [k, n] of Object.entries(delta)) {
      if (!(k in MATERIAL_DEFS)) continue;
      this.materials[k] = Math.max(0, (this.materials[k] || 0) + (n | 0));
    }
    this.save();
  }

  nextCost(key) {
    const cur = this.levels[key] ?? 0;
    const nextIdx = cur + 1;
    const tbl = UPGRADE_COSTS[key];
    if (!tbl || nextIdx >= tbl.length) return null;
    return tbl[nextIdx];
  }

  canAffordNext(key, gold = 0) {
    const cost = this.nextCost(key);
    if (!cost) return { ok: false, maxed: true, missingGold: 0, missingItems: {} };
    const missingGold = Math.max(0, (cost.gold || 0) - gold);
    const missingItems = {};
    let itemsOk = true;
    for (const [mk, req] of Object.entries(cost.items || {})) {
      const have = this.materials[mk] || 0;
      if (have < req) {
        missingItems[mk] = req - have;
        itemsOk = false;
      }
    }
    return {
      ok: missingGold === 0 && itemsOk,
      maxed: false,
      cost,
      missingGold,
      missingItems,
    };
  }

  upgradeNextWithCost(key, questSys) {
    const gold = questSys ? (questSys.gold || 0) : 0;
    const chk = this.canAffordNext(key, gold);
    if (chk.maxed) return { ok: false, reason: 'maxed' };
    if (!chk.ok) return { ok: false, reason: chk.missingGold > 0 ? 'gold' : 'items', check: chk };
    if (questSys) questSys.gold = Math.max(0, gold - (chk.cost.gold || 0));
    for (const [mk, req] of Object.entries(chk.cost.items || {})) {
      this.materials[mk] = Math.max(0, (this.materials[mk] || 0) - req);
    }
    const nextIdx = (this.levels[key] ?? 0) + 1;
    this.levels[key] = nextIdx;
    if (!this.isUnlocked(key, nextIdx)) {
      this.unlocked[key] = [...(this.unlocked[key] || [0]), nextIdx].sort((a, b) => a - b);
    }
    this.save();
    return { ok: true, newLevel: nextIdx, cost: chk.cost };
  }

  isUnlocked(key, targetIdx) {
    const idx = Math.max(0, Math.min(2, targetIdx | 0));
    if (idx === 0) return true;
    const list = this.unlocked[key];
    return Array.isArray(list) ? list.includes(idx) : (this.levels[key] ?? 0) >= idx;
  }

  costForLevel(key, targetIdx) {
    const tbl = UPGRADE_COSTS[key];
    const idx = targetIdx | 0;
    if (!tbl || idx < 0 || idx >= tbl.length) return null;
    if (idx === 0) return { gold: 0, items: {} };
    return tbl[idx] || { gold: 0, items: {} };
  }

  canAffordLevel(key, targetIdx, gold = 0) {
    const idx = Math.max(0, Math.min(2, targetIdx | 0));
    if (this.isUnlocked(key, idx)) {
      return { ok: true, unlocked: true, cost: { gold: 0, items: {} }, missingGold: 0, missingItems: {} };
    }
    const cost = this.costForLevel(key, idx);
    if (!cost) return { ok: false, unlocked: false, missingGold: 0, missingItems: {} };
    const missingGold = Math.max(0, (cost.gold || 0) - gold);
    const missingItems = {};
    let itemsOk = true;
    for (const [mk, req] of Object.entries(cost.items || {})) {
      const have = this.materials[mk] || 0;
      if (have < req) {
        missingItems[mk] = req - have;
        itemsOk = false;
      }
    }
    return {
      ok: missingGold === 0 && itemsOk,
      unlocked: false,
      cost,
      missingGold,
      missingItems,
    };
  }

  upgradeToLevelWithCost(key, targetIdx, questSys) {
    const line = UPGRADE_LINES.find((l) => l.key === key);
    if (!line) return { ok: false, reason: 'invalid' };
    const idx = Math.max(0, Math.min(line.levels.length - 1, targetIdx | 0));
    if (this.isUnlocked(key, idx)) {
      this.levels[key] = idx;
      this.save();
      return { ok: true, equipped: true, newLevel: idx, cost: { gold: 0, items: {} } };
    }
    const gold = questSys ? (questSys.gold || 0) : 0;
    const chk = this.canAffordLevel(key, idx, gold);
    if (!chk.ok) return { ok: false, reason: chk.missingGold > 0 ? 'gold' : 'items', check: chk };
    if (questSys) questSys.gold = Math.max(0, gold - (chk.cost.gold || 0));
    for (const [mk, req] of Object.entries(chk.cost.items || {})) {
      this.materials[mk] = Math.max(0, (this.materials[mk] || 0) - req);
    }
    this.levels[key] = idx;
    this.unlocked[key] = Array.from(new Set([...(this.unlocked[key] || [0]), idx])).sort((a, b) => a - b);
    this.save();
    return { ok: true, purchased: true, newLevel: idx, cost: chk.cost };
  }

  previewConfig(overrides = {}) {
    const cfg = { ...this.levels };
    for (const line of UPGRADE_LINES) {
      if (overrides && line.key in overrides) {
        cfg[line.key] = Math.max(0, Math.min(line.levels.length - 1, overrides[line.key] | 0));
      }
    }
    return cfg;
  }

  setLevel(key, idx) {
    const line = UPGRADE_LINES.find((l) => l.key === key);
    if (!line) return false;
    const clamped = Math.max(0, Math.min(line.levels.length - 1, idx | 0));
    if (this.levels[key] === clamped) return false;
    this.levels[key] = clamped;
    this.save();
    return true;
  }

  buy(key) {
    const cur = this.levels[key] ?? 0;
    return this.setLevel(key, Math.min(2, cur + 1));
  }

  maxAll() {
    for (const line of UPGRADE_LINES) this.levels[line.key] = line.levels.length - 1;
    this.save();
  }

  minAll() {
    for (const line of UPGRADE_LINES) this.levels[line.key] = 0;
    this.save();
  }

  cartConfig() { return { ...this.levels }; }
  joltScale() { return STRAP_JOLT[this.levels.straps] ?? 1; }

  reset() {
    this.levels = { ...DEFAULT_LEVELS };
    this.unlocked = { capacity: [0], wheels: [0], suspension: [0], straps: [0], canopy: [0] };
    this.save();
  }
}

// ============================================================
//  HORSE STATS & LEVEL UPGRADES
// ============================================================
export const HORSE_STAT_DEFS = [
  { key: 'speed', nameKey: 'stat_speed', name: 'Top Speed', icon: '⚡', maxLv: 5, costs: [0, 50, 85, 130, 185], format: (lv) => `${(5.25 * (1 + (lv - 1) * 0.10)).toFixed(2)} m/s` },
  { key: 'stamina', nameKey: 'stat_stamina', name: 'Stamina Pool', icon: '💨', maxLv: 5, costs: [0, 45, 80, 120, 175], format: (lv) => `${100 + (lv - 1) * 20} cap` },
  { key: 'power', nameKey: 'stat_power', name: 'Pull Power', icon: '💪', maxLv: 5, costs: [0, 50, 85, 130, 185], format: (lv) => `${100 + (lv - 1) * 14}%` },
  { key: 'vitality', nameKey: 'stat_vitality', name: 'Toughness HP', icon: '❤️', maxLv: 5, costs: [0, 45, 80, 120, 175], format: (lv) => `${100 + (lv - 1) * 20} HP` },
];

const HORSE_SAVE_KEY = 'shod_horse_stats_v1';

export class HorseStatsStore {
  constructor() {
    this.levels = { speed: 1, stamina: 1, power: 1, vitality: 1 };
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(HORSE_SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.levels) {
        for (const d of HORSE_STAT_DEFS) {
          const v = data.levels[d.key];
          if (Number.isInteger(v)) this.levels[d.key] = Math.max(1, Math.min(d.maxLv, v));
        }
      }
    } catch (e) { /* ignore */ }
  }

  save() {
    try {
      localStorage.setItem(HORSE_SAVE_KEY, JSON.stringify({ levels: this.levels }));
    } catch (e) { /* ignore */ }
  }

  totalLevel() {
    return (this.levels.speed || 1) + (this.levels.stamina || 1) + (this.levels.power || 1) + (this.levels.vitality || 1) - 3;
  }

  nextCost(key) {
    const def = HORSE_STAT_DEFS.find((d) => d.key === key);
    if (!def) return null;
    const cur = this.levels[key] || 1;
    if (cur >= def.maxLv) return null;
    return def.costs[cur] || 100;
  }

  upgradeStat(key, questSys) {
    const cost = this.nextCost(key);
    if (cost == null) return { ok: false, reason: 'maxed' };
    const gold = questSys ? (questSys.gold || 0) : 0;
    if (gold < cost) return { ok: false, reason: 'gold', cost };
    if (questSys) questSys.gold = gold - cost;
    this.levels[key] = (this.levels[key] || 1) + 1;
    this.save();
    return { ok: true, key, level: this.levels[key], cost, label: tr(HORSE_STAT_DEFS.find((d) => d.key === key).nameKey, key) };
  }

  speedMul() { return 1 + ((this.levels.speed || 1) - 1) * 0.10; }
  staminaMax() { return 100 + ((this.levels.stamina || 1) - 1) * 20; }
  staminaDrainMul() { return Math.max(0.65, 1 - ((this.levels.stamina || 1) - 1) * 0.08); }
  pullMul() { return 1 + ((this.levels.power || 1) - 1) * 0.14; }
  hpMax() { return 100 + ((this.levels.vitality || 1) - 1) * 20; }
  healMul() { return 1 + ((this.levels.vitality || 1) - 1) * 0.15; }
}
