/* ============================================================================
   SHOD — PETA TETAP (hand-authored), bukan prosedural-en-dless
   ============================================================================
   Semua isi dunia didefinisikan di sini: bentuk jalan, profil ketinggian, bukit,
   sungai/ford, batu, ramp kerikil, dan SITUS PERMUKIMAN + kelompok NPC.

   Aturan penting:
   - `Math.random()` TIDAK dipakai untuk isi peta. Setiap benda punya posisi dan
     identitas tetap; kembali ke tempat yang sama selalu menemukan hal yang sama.
   - Mesh terrain/grass boleh dibuat sebagai "jendela" ke peta (streaming visual),
     tetapi isi peta tidak boleh bergeser bersama kuda.
   - Kamp pengganti kota memakai `kind:'settlement'`. Kalau kota sungguhan sudah
     ada, ganti bangunannya; koordinat situs + kelompok NPC-nya tetap di sini.
   ============================================================================ */
import { HC } from './hc.js';

// Interpolasi Hermite pada stasiun x yang berurutan (kurva halus, tanpa random).
function spline(points, x) {
  const n = points.length;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > points[i + 1][0]) i++;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
  const d = p2[0] - p1[0], t = (x - p1[0]) / d, t2 = t * t, t3 = t2 * t;
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * d;
  const m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * d;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1
       + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}

// PRNG deterministik; input angka tetap = output selalu identik tiap load.
function hashRand(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= (Math.imul(n | 0, 1000003) ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const MAP = {
  id: 'shod-lemnos-road-01',
  title: 'Lemnos Road — peta tetap',
  // Batas fisik peta. Tidak ada tanjakan/kerikil/NPC baru di luar area ini.
  bounds: { xMin: -30, xMax: 430, zMin: -105, zMax: 105 },

  // ---- JALAN: setiap titik ditulis manual, bukan sine acak ------------------
  roadPoints: [
    [-30, 0], [-12, 0], [0, 0.8], [18, 2.6], [40, -2.2], [62, -4.2],
    [84, 1.5], [108, 5.0], [132, 2.0], [156, -3.2], [180, -1.2],
    [204, 1.6], [228, 4.0], [252, 3.2], [276, -2.8], [300, -4.6],
    [324, -1.4], [348, 3.6], [372, 4.8], [396, 1.4], [418, -.6], [430, -.6],
  ],
  // ---- PROFIL TANJAKAN/TURUNAN: stasiun tertentu, kemiringan dibuat <= 17° --
  elevationPoints: [
    [-30, 0], [-12, 0], [0, 0.10], [24, 0.22], [46, 0.15], [62, 0.40],
    [74, 0.75], [90, 2.50], [104, 3.10], [120, 3.00], [140, 1.30],
    [158, 0.25], [176, 0.12], [204, 0.16], [220, 0.65], [238, 2.60],
    [254, 3.40], [270, 3.25], [292, 1.30], [310, 0.32], [328, 0.20],
    [346, 0.70], [364, 2.30], [380, 2.95], [398, 1.00], [416, 0.10], [430, 0.10],
  ],
  // Bukit samping: diletakkan manual, tidak dilahirkan dari periode acak.
  hills: [
    { x: 36,  z: -30, amp: 7.0, rx: 25, rz: 18 },
    { x: 72,  z: 31,  amp: 9.0, rx: 24, rz: 20 },
    { x: 118, z: -32, amp: 11.0, rx: 30, rz: 23 },
    { x: 166, z: 33,  amp: 7.5, rx: 22, rz: 18 },
    { x: 240, z: -36, amp: 12.0, rx: 28, rz: 24 },
    { x: 302, z: 35,  amp: 10.0, rx: 26, rz: 22 },
    { x: 366, z: -33, amp: 12.5, rx: 32, rz: 24 },
    { x: 410, z: 32,  amp: 8.0, rx: 20, rz: 20 },
  ],
  // Satu ford sungai permanen di lintasan datar.
  fords: [{ x: 190, half: 8.5, fade: 5.0, depth: 1.15, snake: 4.0 }],

  // ---- SITUS TETAP: kamp/pos/lapak menggantikan kota untuk sementara ---------
  // `side` = sisi jalan; posisi z dihitung dari jalan agar tetap di permukaan
  // yang masuk akal. NPC tidak memilih sendiri tempat baru.
  sites: [
    { id: 'pos-gerbang', name: 'Pos Gerbang', kind: 'guardpost', x: 12, side: -1, off: 6.0, radius: 6 },
    { id: 'kamp-penjelajah', name: 'Kamp Penjelajah', kind: 'settlement', x: 48, side: 1, off: 7.2, radius: 8 },
    { id: 'ladang-utara', name: 'Ladang & Kebun', kind: 'farm', x: 96, side: -1, off: 8.0, radius: 9 },
    { id: 'tambang-batu', name: 'Tambang Batu', kind: 'mine', x: 146, side: 1, off: 8.5, radius: 8 },
    { id: 'pasar-jembatan', name: 'Pasar Jembatan', kind: 'market', x: 204, side: -1, off: 6.6, radius: 9 },
    { id: 'kemah-pemburu', name: 'Kemah Pemburu', kind: 'hunters', x: 258, side: -1, off: 7.0, radius: 7 },
    { id: 'makam-lich', name: 'Makam Kuno', kind: 'ruins', x: 308, side: 1, off: 9.0, radius: 8 },
    { id: 'gerbang-kota', name: 'Gerbang Kota (sementara kamp)', kind: 'city-gate', x: 386, side: -1, off: 8.0, radius: 10 },
  ],

  // Kelompok NPC: satu entri = SATU WARGA di kursi/pos yang sudah ditentukan.
  // `a` sudut pada site, `d` jarak dari pusat site. `yaw` menghadap pusat site,
  // bukan putar random. Kelompok ini tidak respawn di depan kuda.
  npcGroups: [
    { site: 'pos-gerbang', members: [
      { role: 'guard', a: 0.2, d: 2.2 }, { role: 'royalguard', a: 2.6, d: 2.4 },
    ] },
    { site: 'kamp-penjelajah', members: [
      { role: 'warrior', a: 0.1, d: 2.7 }, { role: 'merchant', a: 1.9, d: 3.2 }, { role: 'petmerchant', a: 3.6, d: 3.0 },
    ] },
    { site: 'ladang-utara', members: [
      { role: 'farmer', a: 0.4, d: 2.2 }, { role: 'herbal', a: 2.5, d: 2.8 },
    ] },
    { site: 'tambang-batu', members: [
      { role: 'miner', a: 0.3, d: 2.0 }, { role: 'stonegiant', a: 2.4, d: 2.7 },
    ] },
    { site: 'pasar-jembatan', members: [
      { role: 'guardian', a: 0.2, d: 2.5 }, { role: 'dungeonmaster', a: 2.0, d: 2.6 }, { role: 'goblin', a: 4.0, d: 2.4 },
    ] },
    { site: 'kemah-pemburu', members: [
      { role: 'hunter', a: 0.3, d: 2.2 }, { role: 'rabbitwarrior', a: 2.7, d: 2.5 },
    ] },
    { site: 'makam-lich', members: [
      { role: 'lich', a: 0.4, d: 2.0 }, { role: 'elfmage', a: 2.8, d: 2.7 },
    ] },
    { site: 'gerbang-kota', members: [
      { role: 'lionknight', a: 0.2, d: 2.3 }, { role: 'magesupport', a: 2.4, d: 2.6 },
    ] },
  ],

  // Batu besar & ramp = tantangan yang sengaja ditempatkan di koordinat ini.
  boulders: [
    [8, -.6, .36, .30], [27, .8, .40, .30], [56, -.7, .32, .28],
    [86, 1.0, .38, .31], [126, -.8, .40, .32], [168, .6, .34, .28],
    [214, -.5, .42, .32], [244, .9, .36, .30], [284, -.7, .40, .31],
    [334, .7, .38, .30], [370, -.6, .42, .32], [404, .5, .35, .28],
  ],
  ramps: [
    { x: 66, lateral: -1.95, h: .76, len: 2.6, width: 1.35, lat: .85 },
    { x: 232, lateral: 1.95, h: .76, len: 2.6, width: 1.35, lat: .85 },
    { x: 342, lateral: -1.95, h: .76, len: 2.6, width: 1.35, lat: .85 },
  ],
  roadHalf: 2.55,
};

MAP.roadCenterZ = (x) => spline(MAP.roadPoints, x);
MAP.roadElevation = (x) => spline(MAP.elevationPoints, x);
MAP.sitePosition = (site) => {
  const forwardZ = MAP.roadCenterZ(site.x + 4) - MAP.roadCenterZ(site.x - 4);
  const len = Math.hypot(8, forwardZ);
  // tegak lurus jalan, dengan sisi tetap (+1/-1), bukan z absolut.
  const nx = -forwardZ / len * site.side, nz = 8 / len * site.side;
  return { x: site.x + nx * site.off, z: MAP.roadCenterZ(site.x) + nz * site.off };
};
for (const s of MAP.sites) Object.assign(s, MAP.sitePosition(s));
MAP.fordNear = (x) => {
  let best = null, dist = Infinity;
  for (const f of MAP.fords) { const d = Math.abs(x - f.x); if (d < dist) { dist = d; best = f; } }
  return dist < (best?.half || 0) + (best?.fade || 0) + 24 ? best : null;
};
MAP.fordCenterX = (f, z) => f.x + f.snake * Math.sin(z * 0.065);
MAP.waterLevel = (f) => MAP.roadElevation(f.x) - 0.34;
MAP.hashRand = hashRand;

// Verifikasi data authoring (di test): setiap role dipakai TEPAT sekali di peta,
// semua titik grup berada dalam batas, dan situs tidak bertumpuk di jalan.
MAP.allNPCSpawns = () => MAP.npcGroups.flatMap((g) => {
  const site = MAP.sites.find((s) => s.id === g.site);
  if (!site) throw new Error(`Situs NPC tidak ada: ${g.site}`);
  return g.members.map((m) => ({
    ...m, site: site.id, x: site.x + Math.cos(m.a) * m.d, z: site.z + Math.sin(m.a) * m.d,
    yaw: Math.atan2(site.x - (site.x + Math.cos(m.a) * m.d), site.z - (site.z + Math.sin(m.a) * m.d)),
  }));
});

HC.MAP = MAP;

export default MAP;
