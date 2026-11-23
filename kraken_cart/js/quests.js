/* ============================================================================
   QUESTS — Inter-Village Delivery Quest System (Headless + DOM safe)
   ========================================================================= */

function tr(key, fallback, vars = null) {
  const fn = typeof globalThis !== 'undefined' && globalThis.HC && globalThis.HC.t;
  if (typeof fn === 'function') return fn(key, vars);
  let out = fallback;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export const GOODS_POOL = [
  { kind: 'spices', name: 'Spice Crate', nameKey: 'goods_spices', icon: '🧂', mats: { wood: 1, cloth: 1 } },
  { kind: 'wheat', name: 'Wheat Sack', nameKey: 'goods_wheat', icon: '🌾', mats: { leather: 2, wood: 1 } },
  { kind: 'cloth', name: 'Woven Cloth', nameKey: 'goods_cloth', icon: '🧵', mats: { cloth: 2, leather: 1 } },
  { kind: 'potions', name: 'Forest Potions', nameKey: 'goods_potions', icon: '🧪', mats: { wood: 2, iron: 1 } },
  { kind: 'iron_tools', name: 'Iron Tools', nameKey: 'goods_iron_tools', icon: '⚒️', mats: { iron: 2, wood: 1 } },
  { kind: 'honey', name: 'Wild Honey', nameKey: 'goods_honey', icon: '🍯', mats: { wood: 2, leather: 1 } },
  { kind: 'coffee', name: 'Coffee Beans', nameKey: 'goods_coffee', icon: '☕', mats: { cloth: 1, iron: 1, wood: 1 } },
  { kind: 'ceramics', name: 'Village Ceramics', nameKey: 'goods_ceramics', icon: '🏺', mats: { wood: 1, iron: 2 } },
];

export const PASSENGER_POOL = [
  { roleId: 'merchant', labelEn: 'Silk Merchant', labelId: 'Pedagang Sutra', icon: '🧳' },
  { roleId: 'herbal', labelEn: 'Village Herbalist', labelId: 'Tabib Desa', icon: '🌿' },
  { roleId: 'farmer', labelEn: 'Harvest Farmer', labelId: 'Petani Panen', icon: '🌾' },
  { roleId: 'petmerchant', labelEn: 'Traveling Trader', labelId: 'Pedagang Keliling', icon: '🎒' },
];

function shortNameOf(v) {
  if (!v) return '';
  if (v.name) return v.name;
  const raw = String(v.title || v.id || 'Village');
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
    const giverRoleId = (giverNpc && giverNpc.role && giverNpc.role.id) ? giverNpc.role.id : null;
    const giverName = (giverNpc && giverNpc.role && giverNpc.role.name) ? giverNpc.role.name : null;

    if (this._offersByVillage.has(villageId)) {
      const cached = this._offersByVillage.get(villageId);
      if (giverName) cached.giverName = giverName;
      else cached.giverName = tr('quest_giver_fallback', `${cached.fromName} Villager`, { village: cached.fromName });
      cached.giverRoleId = giverRoleId;
      return cached;
    }
    const list = this._villages();
    const fromIdx = list.findIndex((v) => v.id === villageId);
    if (fromIdx < 0 || list.length < 2) return null;
    const fromV = list[fromIdx];
    const others = list.filter((v) => v.id !== villageId);
    const destIdx = (fromIdx * 2 + this._offerCounter) % others.length;
    const toV = others[destIdx];
    const isPassenger = !(fromIdx === 0 && this._offerCounter === 0) && ((fromIdx + this._offerCounter) % 3 === 1);
    const dist = Math.round(Math.hypot(toV.cx - fromV.cx, toV.cz - fromV.cz));
    const rewardGold = Math.max(25, Math.round(25 + dist * 0.14 + (isPassenger ? 12 : 0)));

    let offer;
    if (isPassenger) {
      const pCount = ((fromIdx + this._offerCounter) % 2) + 1;
      const p1 = PASSENGER_POOL[(fromIdx + this._offerCounter) % PASSENGER_POOL.length];
      const p2 = PASSENGER_POOL[(fromIdx + this._offerCounter + 1) % PASSENGER_POOL.length];
      const roles = pCount === 2 ? [p1.roleId, p2.roleId] : [p1.roleId];
      const langId = typeof HC !== 'undefined' && typeof HC.getLang === 'function' && HC.getLang() === 'id';
      const labelId = pCount === 2 ? `2 Penumpang (${p1.labelId})` : p1.labelId;
      const labelEn = pCount === 2 ? `2 Travelers (${p1.labelEn})` : p1.labelEn;
      const label = langId ? labelId : labelEn;
      offer = {
        id: `q_${this._questSeq++}`,
        questType: 'passenger',
        passengerCount: pCount,
        passengerRoles: roles,
        fromId: fromV.id,
        fromName: shortNameOf(fromV),
        toId: toV.id,
        toName: shortNameOf(toV),
        toX: toV.cx,
        toZ: toV.cz,
        cargoKind: null,
        cargoNameKey: null,
        cargoName: label,
        cargoNameId: labelId,
        cargoNameEn: labelEn,
        cargoIcon: p1.icon || '🧳',
        giverRoleId,
        giverName: giverName || tr('quest_giver_fallback', `${shortNameOf(fromV)} Villager`, { village: shortNameOf(fromV) }),
        distance: dist,
        rewardGold,
        rewardMaterials: { cloth: 1, leather: 1, wood: 1 },
      };
    } else {
      const goods = GOODS_POOL[(fromIdx * 3 + this._offerCounter) % GOODS_POOL.length];
      const localizedCargo = tr(goods.nameKey, goods.name);
      offer = {
        id: `q_${this._questSeq++}`,
        questType: 'cargo',
        passengerCount: 0,
        passengerRoles: [],
        fromId: fromV.id,
        fromName: shortNameOf(fromV),
        toId: toV.id,
        toName: shortNameOf(toV),
        toX: toV.cx,
        toZ: toV.cz,
        cargoKind: goods.kind,
        cargoNameKey: goods.nameKey,
        cargoName: localizedCargo,
        cargoIcon: goods.icon,
        giverRoleId,
        giverName: giverName || tr('quest_giver_fallback', `${shortNameOf(fromV)} Villager`, { village: shortNameOf(fromV) }),
        distance: dist,
        rewardGold,
        rewardMaterials: { ...(goods.mats || { wood: 1, iron: 1 }) },
      };
    }
    this._offersByVillage.set(villageId, offer);
    return offer;
  }

  acceptQuest(villageId, wildNpcs = null) {
    if (this.activeQuest) {
      return {
        ok: false,
        msg: tr('quest_active_err', 'Already carrying an active delivery to {to}.', { to: this.activeQuest.toName }),
        quest: this.activeQuest,
      };
    }
    const offer = this.getOfferForVillage(villageId, wildNpcs);
    if (!offer) {
      return { ok: false, msg: tr('quest_none_err', 'No quest available here.'), quest: null };
    }
    let receiverNpc = null;
    let receiverRoleId = null;
    let receiverName = tr('quest_receiver_fallback', `${offer.toName} Villager`, { village: offer.toName });
    if (Array.isArray(wildNpcs)) {
      const destPool = wildNpcs.filter((w) => w && !w.recruited && w.site === offer.toId);
      if (destPool.length > 0) {
        receiverNpc = destPool[Math.floor(Math.random() * destPool.length)];
        if (receiverNpc.role && receiverNpc.role.name) {
          receiverName = receiverNpc.role.name;
          receiverRoleId = receiverNpc.role.id || null;
        }
      }
    }
    const localizedCargo = offer.cargoNameKey ? tr(offer.cargoNameKey, offer.cargoName) : offer.cargoName;
    this.activeQuest = {
      ...offer,
      cargoName: localizedCargo,
      receiverNpc,
      receiverRoleId,
      receiverName,
      startedAt: Date.now(),
    };
    this._offersByVillage.delete(villageId);
    return {
      ok: true,
      msg: tr('quest_accepted_toast', 'Quest accepted from {giver}: Deliver {cargo} to {receiver} in {to} (+{gold} G)!', {
        giver: offer.giverName,
        cargo: localizedCargo,
        receiver: receiverName,
        to: offer.toName,
        gold: offer.rewardGold,
      }),
      quest: this.activeQuest,
    };
  }

  abandonQuest() {
    const prev = this.activeQuest;
    this.activeQuest = null;
    return prev;
  }

  // Dipanggil saat bahasa diganti. Cache offer dibuang supaya nama pemberi
  // quest ikut bahasa baru; quest aktif memakai ulang role id yang tersimpan.
  relocalize() {
    this._offersByVillage.clear();
    const q = this.activeQuest;
    if (!q) return;
    const langId = typeof HC !== 'undefined' && typeof HC.getLang === 'function' && HC.getLang() === 'id';
    if (q.cargoNameKey) q.cargoName = tr(q.cargoNameKey, q.cargoName);
    else if (q.cargoNameId || q.cargoNameEn) q.cargoName = (langId ? q.cargoNameId : q.cargoNameEn) || q.cargoName;
    const giverRole = q.giverRoleId && typeof HC !== 'undefined' && HC.NPC_BY_ID ? HC.NPC_BY_ID(q.giverRoleId) : null;
    q.giverName = giverRole
      ? giverRole.name
      : tr('quest_giver_fallback', `${q.fromName} Villager`, { village: q.fromName });
    const receiverRole = (q.receiverNpc && q.receiverNpc.role)
      || (q.receiverRoleId && typeof HC !== 'undefined' && HC.NPC_BY_ID ? HC.NPC_BY_ID(q.receiverRoleId) : null);
    q.receiverName = receiverRole
      ? receiverRole.name
      : tr('quest_receiver_fallback', `${q.toName} Villager`, { village: q.toName });
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
