/* ============================================================================
   QUESTS — Sistem Quest Pengantaran Barang Antar-Desa
   Bebas THREE.DOM: dapat diuji headless maupun di browser.
   ========================================================================= */

export const GOODS_POOL = [
  { kind: 'spices', name: 'Peti Rempah', icon: '🧂' },
  { kind: 'wheat', name: 'Karung Gandum', icon: '🌾' },
  { kind: 'cloth', name: 'Kain Tenun', icon: '🧵' },
  { kind: 'potions', name: 'Ramuan Hutan', icon: '🧪' },
  { kind: 'iron_tools', name: 'Perkakas Besi', icon: '⚒️' },
  { kind: 'honey', name: 'Madu Hutan', icon: '🍯' },
  { kind: 'coffee', name: 'Biji Kopi', icon: '☕' },
  { kind: 'ceramics', name: 'Keramik Desa', icon: '🏺' },
];

function shortNameOf(v) {
  if (!v) return '';
  if (v.name) return v.name;
  const raw = String(v.title || v.id || 'Desa');
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export class DeliveryQuestSystem {
  constructor(opts = {}) {
    this.world = opts.world || null;
    this.gold = 0;
    this.completedCount = 0;
    this.activeQuest = null;
    this._offerCounter = 0;
    this._offersByVillage = new Map();
    this._questNpcByVillage = new Map();
    this._questSeq = 1;
  }

  _villages() {
    return (this.world && Array.isArray(this.world.VILLAGES)) ? this.world.VILLAGES : [];
  }

  assignVillageQuestNpcs(wildNpcs) {
    if (!Array.isArray(wildNpcs)) return;
    const list = this._villages();
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const cur = this._questNpcByVillage.get(v.id);
      if (cur && !cur.recruited && wildNpcs.includes(cur) && cur.site === v.id) {
        continue;
      }
      const pool = wildNpcs.filter((w) => w && !w.recruited && w.site === v.id);
      if (pool.length > 0) {
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        this._questNpcByVillage.set(v.id, chosen);
      } else {
        this._questNpcByVillage.delete(v.id);
      }
    }
  }

  getQuestNpcForVillage(villageId, wildNpcs) {
    if (Array.isArray(wildNpcs)) this.assignVillageQuestNpcs(wildNpcs);
    return this._questNpcByVillage.get(villageId) || null;
  }

  getNearbyQuestNpc(x, z, wildNpcs, radius = 5.8) {
    if (Array.isArray(wildNpcs)) this.assignVillageQuestNpcs(wildNpcs);
    let best = null;
    let bestD = radius;
    for (const [villageId, npc] of this._questNpcByVillage.entries()) {
      if (!npc || npc.recruited || npc.isIndoors) continue;
      const d = Math.hypot(x - npc.x, z - npc.z);
      if (d <= bestD) {
        bestD = d;
        best = { npc, villageId, dist: d };
      }
    }
    return best;
  }

  getNearbyVillage(x, z) {
    const list = this._villages();
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const r = (v.radius || 20) * 2.15;
      if (Math.hypot(x - v.cx, z - v.cz) <= r) return v;
    }
    return null;
  }

  getOfferForVillage(villageId, wildNpcs = null) {
    if (!villageId) return null;
    if (Array.isArray(wildNpcs)) this.assignVillageQuestNpcs(wildNpcs);
    const giverNpc = this._questNpcByVillage.get(villageId) || null;
    const giverName = (giverNpc && giverNpc.role && giverNpc.role.name) ? giverNpc.role.name : null;

    if (this._offersByVillage.has(villageId)) {
      const cached = this._offersByVillage.get(villageId);
      if (giverName) cached.giverName = giverName;
      return cached;
    }
    const list = this._villages();
    const fromIdx = list.findIndex((v) => v.id === villageId);
    if (fromIdx < 0 || list.length < 2) return null;
    const fromV = list[fromIdx];
    const others = list.filter((v) => v.id !== villageId);
    const destIdx = (fromIdx * 2 + this._offerCounter) % others.length;
    const toV = others[destIdx];
    const goods = GOODS_POOL[(fromIdx * 3 + this._offerCounter) % GOODS_POOL.length];
    const dist = Math.round(Math.hypot(toV.cx - fromV.cx, toV.cz - fromV.cz));
    const rewardGold = Math.max(25, Math.round(25 + dist * 0.14));
    const offer = {
      id: `q_${this._questSeq++}`,
      fromId: fromV.id,
      fromName: shortNameOf(fromV),
      toId: toV.id,
      toName: shortNameOf(toV),
      toX: toV.cx,
      toZ: toV.cz,
      cargoKind: goods.kind,
      cargoName: goods.name,
      cargoIcon: goods.icon,
      giverName: giverName || `Warga ${shortNameOf(fromV)}`,
      distance: dist,
      rewardGold,
    };
    this._offersByVillage.set(villageId, offer);
    return offer;
  }

  acceptQuest(villageId, wildNpcs = null) {
    if (this.activeQuest) {
      return {
        ok: false,
        msg: `Masih ada pengantaran aktif ke ${this.activeQuest.toName}.`,
        quest: this.activeQuest,
      };
    }
    const offer = this.getOfferForVillage(villageId, wildNpcs);
    if (!offer) {
      return { ok: false, msg: 'Tidak ada quest tersedia di sini.', quest: null };
    }
    let receiverNpc = null;
    let receiverName = `Warga ${offer.toName}`;
    if (Array.isArray(wildNpcs)) {
      const destPool = wildNpcs.filter((w) => w && !w.recruited && w.site === offer.toId);
      if (destPool.length > 0) {
        receiverNpc = destPool[Math.floor(Math.random() * destPool.length)];
        if (receiverNpc.role && receiverNpc.role.name) receiverName = receiverNpc.role.name;
      }
    }
    this.activeQuest = {
      ...offer,
      receiverNpc,
      receiverName,
      startedAt: Date.now(),
    };
    this._offersByVillage.delete(villageId);
    return {
      ok: true,
      msg: `Quest diterima dari ${offer.giverName}: Antar ${offer.cargoName} ke ${receiverName} di ${offer.toName} (+${offer.rewardGold} Emas)!`,
      quest: this.activeQuest,
    };
  }

  abandonQuest() {
    const prev = this.activeQuest;
    this.activeQuest = null;
    return prev;
  }

  distanceToTarget(x, z) {
    if (!this.activeQuest) return 0;
    const rx = (this.activeQuest.receiverNpc && !this.activeQuest.receiverNpc.recruited && !this.activeQuest.receiverNpc.isIndoors)
      ? this.activeQuest.receiverNpc.x : this.activeQuest.toX;
    const rz = (this.activeQuest.receiverNpc && !this.activeQuest.receiverNpc.recruited && !this.activeQuest.receiverNpc.isIndoors)
      ? this.activeQuest.receiverNpc.z : this.activeQuest.toZ;
    return Math.hypot(rx - x, rz - z);
  }

  update(horseX, horseZ, physics, onComplete, wildNpcs = null) {
    const q = this.activeQuest;
    if (!q) return null;
    const list = this._villages();
    const dest = list.find((v) => v.id === q.toId) || { cx: q.toX, cz: q.toZ, radius: 20 };

    let arrived = false;
    const rcv = q.receiverNpc;
    if (rcv && !rcv.recruited && !rcv.isIndoors && (!Array.isArray(wildNpcs) || wildNpcs.includes(rcv))) {
      if (Math.hypot(horseX - rcv.x, horseZ - rcv.z) <= 8.5) arrived = true;
    }
    // Fallback ke alun-alun desa tujuan jika NPC sedang di dalam rumah atau pada mode headless
    const fallbackR = rcv ? (dest.radius || 20) * 1.35 : (dest.radius || 20) * 2.15;
    if (!arrived && Math.hypot(horseX - dest.cx, horseZ - dest.cz) <= fallbackR) {
      arrived = true;
    }
    if (!arrived) return null;

    if (physics && physics.flipped) return null;
    if (physics && physics.pos) {
      const dCart = Math.hypot(physics.pos.x - horseX, physics.pos.z - horseZ);
      if (dCart > 18.0) return null;
    }

    this.gold += q.rewardGold;
    this.completedCount += 1;
    if (physics && Array.isArray(physics.wheels)) {
      for (const w of physics.wheels) {
        if (!w || w.detached) continue;
        const maxHp = w.hpMax || 100;
        w.hp = Math.min(maxHp, Math.round((w.hp || 0) + 25));
        if (w.hp > 0) w.broken = false;
      }
    }
    const done = { ...q };
    this.activeQuest = null;
    this._offerCounter += 1;
    this._offersByVillage.clear();
    this._questNpcByVillage.delete(done.fromId);
    if (Array.isArray(wildNpcs)) this.assignVillageQuestNpcs(wildNpcs);
    if (typeof onComplete === 'function') onComplete(done);
    return done;
  }
}
