/* ============================================================================
   SURVIVAL — stamina, HP, lapar, haus untuk kuda SHOD
   Dirancang bebas THREE.DOM: bisa diuji headless dengan konteks palsu.
   Aturan yang diminta:
   - Lari = TOGGLE, tapi kalau analog tidak digerakkan kuda berhenti. Toggle lari
     hanya membuka KECEPATAN MAKSIMAL; gas-nya tetap dari joystick.
   - Lapar/haus turun pelan; lari dan melompat bikin boros.
   - HP turun kalau kelaparan/kehausan akut atau gerobak rebah, naik pelan kalau
     perut kenyang + istirahat.
   ========================================================================= */

export const SURV_CAP = 100;

function tr(key, fallback, vars = null) {
  const fn = typeof globalThis !== 'undefined' && globalThis.HC && globalThis.HC.t;
  if (typeof fn === 'function') return fn(key, vars);
  let out = fallback;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export class Survival {
  constructor(opts = {}) {
    this.map = opts.map || null;             // HC.MAP (roadCenterZ, roadHalf)
    this.world = opts.world || null;         // buat cek sungai
    this.hpMax = SURV_CAP;
    this.staminaMax = SURV_CAP;
    this.drainScale = 1.0;
    this.healScale = 1.0;
    this.hp = this.hpMax;
    this.stamina = this.staminaMax;
    this.hunger = SURV_CAP;
    this.thirst = SURV_CAP;
    this.eatT = 0;                            // sisa detik lagi makan
    this.drinkT = 0;
    this.msg = '';
    this.landedHard = 0;
  }

  get eating() { return this.eatT > 0; }
  get drinking() { return this.drinkT > 0; }
  get starving() { return this.hunger <= 0.01; }
  get parched() { return this.thirst <= 0.01; }
  get exhausted() { return this.stamina <= 0.01; }

  applyHorseStats(horseStats) {
    if (!horseStats) return;
    const prevHpMax = this.hpMax || SURV_CAP;
    const prevStamMax = this.staminaMax || SURV_CAP;
    const nextHpMax = horseStats.hpMax ? horseStats.hpMax() : SURV_CAP;
    const nextStamMax = horseStats.staminaMax ? horseStats.staminaMax() : SURV_CAP;
    this.hpMax = nextHpMax;
    this.staminaMax = nextStamMax;
    if (nextHpMax > prevHpMax) this.hp = Math.min(nextHpMax, this.hp + (nextHpMax - prevHpMax));
    if (nextStamMax > prevStamMax) this.stamina = Math.min(nextStamMax, this.stamina + (nextStamMax - prevStamMax));
    this.drainScale = horseStats.staminaDrainMul ? horseStats.staminaDrainMul() : 1.0;
    this.healScale = horseStats.healMul ? horseStats.healMul() : 1.0;
  }

  onRoad(x, z) {
    if (this.world && this.world.isOnRoad) return this.world.isOnRoad(x, z);
    const m = this.map;
    return !!(m && Math.abs(z - m.roadCenterZ(x)) < (m.roadHalf + 0.5));
  }
  riverDistance(x, z) {
    const w = this.world;
    return (w && w.riverDistX) ? w.riverDistX(x, z) : Infinity;
  }

  /* --- action: graze on grass --- */
  tryEat(ctx) {
    if (Math.abs(ctx.speed) > 1.0) return this._deny(tr('msg_stop_eat', 'Stop first to graze.'));
    if (this.world && typeof this.world.isOnGrass === 'function') {
      if (!this.world.isOnGrass(ctx.x, ctx.z)) {
        return this._deny(tr('msg_need_grass', 'Must stand directly on grass to graze.'));
      }
    } else {
      if (this.onRoad(ctx.x, ctx.z)) return this._deny(tr('msg_need_grass', 'Must stand directly on grass to graze.'));
      if (this.riverDistance(ctx.x, ctx.z) < 8.5) return this._deny(tr('msg_need_grass', 'Must stand directly on grass to graze.'));
    }
    this.eatT = 2.6;
    this.drinkT = 0;
    this.msg = tr('msg_grazing', 'Horse is grazing...');
    return true;
  }

  /* --- action: drink from river/pond --- */
  tryDrink(ctx) {
    if (Math.abs(ctx.speed) > 1.0) return this._deny(tr('msg_stop_drink', 'Stop first to drink.'));
    if (this.world && typeof this.world.isAtWater === 'function') {
      if (!this.world.isAtWater(ctx.x, ctx.z)) {
        return this._deny(tr('msg_need_water', 'Stand right by the river or pond to drink.'));
      }
    } else if (this.riverDistance(ctx.x, ctx.z) > 9.5) {
      return this._deny(tr('msg_need_water', 'Stand right by the river or pond to drink.'));
    }
    this.drinkT = 2.2;
    this.eatT = 0;
    this.msg = tr('msg_drinking', 'Horse is drinking water...');
    return true;
  }

  /* --- action: eat from Fruit Box inside cart (Hold Q + Click Item) --- */
  eatFromSupply(item) {
    if (!item || (item.charges || 0) <= 0) {
      return this._deny(tr('msg_supply_empty', 'That supply is empty! Refill at a Cart Workshop (or drink at river).'));
    }
    item.charges = Math.max(0, (item.charges || 0) - 1);
    this.hunger = Math.min(SURV_CAP, this.hunger + 38);
    this.stamina = Math.min(this.staminaMax, this.stamina + 16);
    this.hp = Math.min(this.hpMax, this.hp + 8);
    this.eatT = 1.4;
    this.drinkT = 0;
    this.msg = tr('msg_ate_fruit', '🍎 Ate fresh fruit from box! ({c}/{m} left)', {
      c: item.charges,
      m: item.maxCharges || 5,
    });
    return true;
  }

  /* --- action: drink from Water Barrel inside cart (Hold Q + Click Item) --- */
  drinkFromSupply(item) {
    if (!item || (item.charges || 0) <= 0) {
      return this._deny(tr('msg_supply_empty', 'That supply is empty! Refill at a Cart Workshop (or drink at river).'));
    }
    item.charges = Math.max(0, (item.charges || 0) - 1);
    this.thirst = Math.min(SURV_CAP, this.thirst + 42);
    this.stamina = Math.min(this.staminaMax, this.stamina + 16);
    this.drinkT = 1.4;
    this.eatT = 0;
    this.msg = tr('msg_drank_barrel', '💧 Drank fresh water from barrel! ({c}/{m} left)', {
      c: item.charges,
      m: item.maxCharges || 5,
    });
    return true;
  }

  _deny(why) { this.msg = why; return false; }

  /* Skala kecepatan maksimum akibat kondisi badan (dipakai animator). */
  speedScale() {
    let s = 1;
    if (this.starving) s *= 0.62;
    if (this.parched) s *= 0.72;
    if (this.exhausted) s *= 0.5;
    if (this.hp < this.hpMax * 0.25) s *= 0.75;
    return s;
  }

  /* Boleh lari? stamina habis = cuma bisa jalan. */
  canRun() { return this.stamina > 4 && this.hp > 0; }

  update(dt, ctx) {
    const moving = !!ctx.moving;
    const sleeping = !!ctx.sleeping && !moving;
    const running = !!ctx.running && moving && !sleeping;
    const grazing = this.eating;
    const unhitched = !!ctx.unhitched;
    const vitalMul = (unhitched ? 0.60 : 1.0) * (sleeping ? 0.40 : 1.0);
    const stamMul = (unhitched ? 0.55 : 1.0) * (this.drainScale || 1.0);
    const healMul = this.healScale || 1.0;

    if (this.eatT > 0) {
      this.eatT = Math.max(0, this.eatT - dt);
      this.hunger = Math.min(SURV_CAP, this.hunger + 38.5 * dt);
      this.stamina = Math.min(this.staminaMax, this.stamina + 14.0 * dt);
      if (this.eatT === 0) this.msg = '';
    } else {
      this.hunger = Math.max(0, this.hunger - dt * (0.45 + (running ? 0.30 : moving ? 0.10 : 0)) * vitalMul);
    }

    if (this.drinkT > 0) {
      this.drinkT = Math.max(0, this.drinkT - dt);
      this.thirst = Math.min(SURV_CAP, this.thirst + 46.0 * dt);
      this.stamina = Math.min(this.staminaMax, this.stamina + 12.0 * dt);
      if (this.drinkT === 0) this.msg = '';
    } else {
      this.thirst = Math.max(0, this.thirst - dt * (0.32 + (running ? 0.38 : moving ? 0.10 : 0)) * vitalMul);
    }

    // Stamina: saat tidur pulih cepat (+22/s); saat lepas tali pemakaian stamina lebih hemat.
    if (sleeping) this.stamina = Math.min(this.staminaMax, this.stamina + 22.0 * healMul * dt);
    else if (running) this.stamina = Math.max(0, this.stamina - 3.2 * stamMul * dt);
    else if (moving) this.stamina = Math.max(0, this.stamina - 0.25 * stamMul * dt);
    else if (!grazing && !this.drinking) this.stamina = Math.min(this.staminaMax, this.stamina + (unhitched ? 14.0 : 12.0) * dt);

    // HP: lapar/haus akut dan gerobak rebah menggerus; tidur & istirahat kenyang memulihkan HP.
    let dmg = 0;
    if (this.starving) dmg += 2.4;
    if (this.parched) dmg += 2.8;
    if (ctx.flipped) dmg += 3.5;
    if (this.landedHard > 0) { dmg += this.landedHard; this.landedHard = 0; }
    if (dmg > 0) this.hp = Math.max(0, this.hp - dmg * dt);
    else if (sleeping && this.hunger > 25 && this.thirst > 25) {
      this.hp = Math.min(this.hpMax, this.hp + 4.0 * healMul * dt);
    } else if (!running && !moving && this.hunger > 55 && this.thirst > 55) {
      this.hp = Math.min(this.hpMax, this.hp + 1.5 * healMul * dt);
    }
    this.hp = Math.min(this.hpMax, Math.max(0, this.hp));
  }
}
