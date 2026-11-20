import { HC } from './hc.js';

// ============================================================
//  CART CUSTOMISATION / UPGRADE SYSTEM (FREE SANDBOX MODE)
//  Kapasitas bak -> Roda -> Suspensi -> Tali pengikat -> Kanopi
// ============================================================
export const UPGRADE_LINES = [
  {
    key: 'capacity',
    name: 'Kapasitas Bak & Kabin',
    icon: 'BED',
    desc: '4 kursi penumpang di depan + bak barang di belakang.',
    levels: [
      { short: 'Lv1 Ringkas', label: 'Lv1 Ringkas', detail: '4 penumpang • 6 barang' },
      { short: 'Lv2 Standar', label: 'Lv2 Standar', detail: '4 penumpang • 8 barang' },
      { short: 'Lv3 Ekspedisi', label: 'Lv3 Ekspedisi', detail: '4 penumpang • 12 barang' }
    ]
  },
  {
    key: 'wheels',
    name: 'Roda',
    icon: 'WHEEL',
    desc: 'Roda lebih besar & lebar menyerap kerikil lebih halus.',
    levels: [
      { short: 'Lv1 Kayu Ek (rigid)', label: 'Lv1 Kayu Ek', detail: 'poros mati — kerikil mengguncang rangka' },
      { short: 'Lv2 Sabuk Besi + Per', label: 'Lv2 Sabuk Besi + Per', detail: 'pegas meredam benturan kecil' },
      { short: 'Lv3 Baja Tempa + Twin-Coil', label: 'Lv3 Baja Tempa + Twin-Coil', detail: 'langkah suspensi terjauh, offroad' }
    ]
  },
  {
    key: 'suspension',
    name: 'Suspensi & Per',
    icon: 'SPRING',
    desc: 'Lv1 poros kaku tanpa suspensi; Lv2–Lv3 menambah travel dan redaman.',
    levels: [
      { short: 'Lv1 Tanpa Suspensi', label: 'Lv1 Poros Kaku', detail: 'tanpa per — rangka ikut terguncang' },
      { short: 'Lv2 Per Daun', label: 'Lv2 Per Daun', detail: 'pegas + travel 0.24 m' },
      { short: 'Lv3 Twin-Coil', label: 'Lv3 Twin-Coil', detail: 'pegas ganda + travel 0.34 m' }
    ]
  },
  {
    key: 'straps',
    name: 'Tali Pengikat',
    icon: 'STRAP',
    desc: 'Muatan diikat, guncangan & kemungkinan tumpah turun.',
    levels: [
      { short: 'Lv1 Tanpa Ikat', label: 'Lv1 Tanpa Ikat', detail: 'muatan bebas melompat' },
      { short: 'Lv2 Tali Tambang', label: 'Lv2 Tali Tambang', detail: 'guncangan -38%' },
      { short: 'Lv3 Jaring Rantai', label: 'Lv3 Jaring + Rantai', detail: 'guncangan -70%' }
    ]
  },
  {
    key: 'canopy',
    name: 'Rangka & Kanopi',
    icon: 'CANOPY',
    desc: 'Pelat besi, bemper, sampai kanopi tenda ekspedisi.',
    levels: [
      { short: 'Lv1 Terbuka', label: 'Lv1 Bak Terbuka', detail: 'kayu polos' },
      { short: 'Lv2 Siku Besi', label: 'Lv2 Perisai Besi', detail: 'trim besi + bemper' },
      { short: 'Lv3 Kanopi', label: 'Lv3 Kanopi Ekspedisi', detail: 'kanopi kanvas lengkung' }
    ]
  }
];

export const STRAP_JOLT = [1, 0.62, 0.30];
export const DEFAULT_LEVELS = { capacity: 1, wheels: 1, suspension: 1, straps: 0, canopy: 0 };
const SAVE_KEY = 'kraken_cart_sim_v2';

export class UpgradeStore {
  constructor() {
    this.levels = { ...DEFAULT_LEVELS };
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
    } catch (e) { /* ignore corrupt save */ }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ levels: this.levels }));
    } catch (e) { /* storage may be blocked */ }
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
    // Backwards-compatible step-up helper
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
    this.save();
  }
}
