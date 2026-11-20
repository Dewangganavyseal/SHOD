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

export class Survival {
  constructor(opts = {}) {
    this.map = opts.map || null;             // HC.MAP (roadCenterZ, roadHalf)
    this.world = opts.world || null;         // buat cek sungai
    this.hp = SURV_CAP;
    this.stamina = SURV_CAP;
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

  onRoad(x, z) {
    if (this.world && this.world.isOnRoad) return this.world.isOnRoad(x, z);
    const m = this.map;
    return !!(m && Math.abs(z - m.roadCenterZ(x)) < (m.roadHalf + 0.5));
  }
  riverDistance(x, z) {
    const w = this.world;
    return (w && w.riverDistX) ? w.riverDistX(x, z) : Infinity;
  }

  /* --- aksi: makan (rumput) --- */
  tryEat(ctx) {
    if (Math.abs(ctx.speed) > 1.0) return this._deny('Berhenti dulu buat makan.');
    if (this.onRoad(ctx.x, ctx.z)) return this._deny('Di jalan gak ada rumput. Ke pinggir dulu.');
    if (this.riverDistance(ctx.x, ctx.z) < 8.5) return this._deny('Di air kuda gak makan rumput.');
    if (this.hunger >= SURV_CAP - 1) return this._deny('Perut masih kenyang.');
    this.eatT = 2.6;
    this.drinkT = 0;
    this.msg = 'Kuda makan rumput...';
    return true;
  }

  /* --- aksi: minum (harus dekat sungai) --- */
  tryDrink(ctx) {
    if (Math.abs(ctx.speed) > 1.0) return this._deny('Berhenti dulu buat minum.');
    if (this.riverDistance(ctx.x, ctx.z) > 9.5) return this._deny('Terlalu jauh dari sungai.');
    if (this.thirst >= SURV_CAP - 1) return this._deny('Kuda belum haus.');
    this.drinkT = 2.2;
    this.eatT = 0;
    this.msg = 'Kuda minum di sungai...';
    return true;
  }

  _deny(why) { this.msg = why; return false; }

  /* Skala kecepatan maksimum akibat kondisi badan (dipakai animator). */
  speedScale() {
    let s = 1;
    if (this.starving) s *= 0.62;
    if (this.parched) s *= 0.72;
    if (this.exhausted) s *= 0.5;
    if (this.hp < 25) s *= 0.75;
    return s;
  }

  /* Boleh lari? stamina habis = cuma bisa jalan. */
  canRun() { return this.stamina > 4 && this.hp > 0; }

  update(dt, ctx) {
    const moving = !!ctx.moving;
    const running = !!ctx.running && moving;
    const grazing = this.eating;

    if (this.eatT > 0) {
      this.eatT = Math.max(0, this.eatT - dt);
      this.hunger = Math.min(SURV_CAP, this.hunger + 19.0 * dt);
      this.stamina = Math.min(SURV_CAP, this.stamina + 8.0 * dt);
      if (this.eatT === 0) this.msg = 'Kenyang. Gas lagi.';
    } else {
      this.hunger = Math.max(0, this.hunger - dt * (0.45 + (running ? 0.30 : moving ? 0.10 : 0)));
    }

    if (this.drinkT > 0) {
      this.drinkT = Math.max(0, this.drinkT - dt);
      this.thirst = Math.min(SURV_CAP, this.thirst + 32.0 * dt);
      if (this.drinkT === 0) this.msg = 'Udah minum.';
    } else {
      this.thirst = Math.max(0, this.thirst - dt * (0.32 + (running ? 0.38 : moving ? 0.10 : 0)));
    }

    // Stamina: lari ngos-ngosan, jalan santai, diam/eat minum pulih.
    if (running) this.stamina = Math.max(0, this.stamina - 11.0 * dt);
    else if (moving) this.stamina = Math.max(0, this.stamina - 1.3 * dt);
    else if (!grazing && !this.drinking) this.stamina = Math.min(SURV_CAP, this.stamina + 9.5 * dt);

    // HP: lapar/haus akut dan gerobak rebah menggerus; istirahat kenyang pelan pulih.
    let dmg = 0;
    if (this.starving) dmg += 2.4;
    if (this.parched) dmg += 2.8;
    if (ctx.flipped) dmg += 3.5;
    if (this.landedHard > 0) { dmg += this.landedHard; this.landedHard = 0; }
    if (dmg > 0) this.hp = Math.max(0, this.hp - dmg * dt);
    else if (!running && !moving && this.hunger > 55 && this.thirst > 55) {
      this.hp = Math.min(SURV_CAP, this.hp + 1.5 * dt);
    }
    this.hp = Math.min(SURV_CAP, Math.max(0, this.hp));
  }
}
