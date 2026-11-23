import { HC } from './hc.js';
import './voxel.js';

const THREE = HC.THREE, V = HC.VoxelBuilder, P = HC.PAL, S = HC.cartVS, H = HC.vs;

// ============================================================
//  CART UPGRADE TIERS — Gerobak Besar (4 Penumpang + Perbekalan)
// ============================================================
HC.CART_UPGRADES = {
  capacity: [
    { tier: 0, label: 'Lv1 • 4 Penumpang + 6 Brg', count: 6, passengers: 4, bedHalfL: 28, bedHalfW: 15, cabinLen: 18, bedFrontX: 24, railSlats: 2, railTopVox: 13.5, massAdd: 40 },
    { tier: 1, label: 'Lv2 • 4 Penumpang + 8 Brg', count: 8, passengers: 4, bedHalfL: 32, bedHalfW: 15, cabinLen: 18, bedFrontX: 24, railSlats: 3, railTopVox: 16.5, massAdd: 75 },
    { tier: 2, label: 'Lv3 • 4 Penumpang + 12 Brg', count: 12, passengers: 4, bedHalfL: 36, bedHalfW: 15, cabinLen: 18, bedFrontX: 24, railSlats: 4, railTopVox: 19.5, massAdd: 120 }
  ],
  wheels: [
    { tier: 0, label: 'Lv1 • Kayu Ek (tanpa per)', rFront: 8.8, rRear: 10.4, widthVox: 2.4, trackZ: 17.2, travel: 0, rigid: true },
    { tier: 1, label: 'Lv2 • Sabuk Besi + Per Daun', rFront: 9.5, rRear: 11.2, widthVox: 3.1, trackZ: 18.0, travel: 0.24, rigid: false },
    { tier: 2, label: 'Lv3 • Baja Tempa + Per Ganda', rFront: 10.2, rRear: 12.0, widthVox: 3.8, trackZ: 18.8, travel: 0.34, rigid: false }
  ],
  suspension: [
    { tier: 0, label: 'Lv1 • Poros Kaku (tanpa suspensi)', kSpring: 0, cDamp: 0, rollLim: 0.39, coils: 0, travel: 0, rigid: true },
    { tier: 1, label: 'Lv2 • Per Daun + Koil Kuningan', kSpring: 11000, cDamp: 1150, rollLim: 0.43, coils: 1, travel: 0.24, rigid: false },
    { tier: 2, label: 'Lv3 • Heavy Twin-Coil Offroad', kSpring: 14000, cDamp: 1350, rollLim: 0.49, coils: 2, travel: 0.34, rigid: false }
  ],
  canopy: [
    { tier: 0, label: 'Lv1 • Bak Kayu Terbuka' },
    { tier: 1, label: 'Lv2 • Perisai Besi + Lentera Kembar' },
    { tier: 2, label: 'Lv3 • Kanopi Tenda Ekspedisi' }
  ]
};

function buildSpokedWheel(radiusVox, widthVox, tier = 0) {
  const vb = new V(S);
  const R = radiusVox;
  const tireHex = tier === 0 ? P.ironDark : tier === 1 ? P.iron : 0x3a3f46;
  const tireThick = tier === 0 ? 0.55 : tier === 1 ? 0.85 : 1.15;
  const rIn = R - 2.1;
  const w0 = -Math.floor(widthVox / 2), w1 = Math.ceil(widthVox / 2);

  for (let x = -R - 1; x <= R + 1; x++) {
    for (let y = -R - 1; y <= R + 1; y++) {
      const d = Math.hypot(x, y);
      if (d <= R + 0.45 && d >= R - tireThick) {
        vb.box(x, y, w0, x, y, w1, tireHex, 0.025);
      } else if (d < R - tireThick && d >= rIn) {
        const rimHex = tier === 0 ? ((x + y) & 1 ? P.oakMid : P.oakDark) : tier === 1 ? P.oakDark : P.ironDark;
        vb.box(x, y, w0, x, y, w1, rimHex, 0.04);
      }
    }
  }
  const spokes = tier === 2 ? 12 : 10;
  const spokeHex = tier === 2 ? P.iron : P.oakLite;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    vb.line(ca * 2.0, sa * 2.0, 0, ca * (rIn + 0.4), sa * (rIn + 0.4), 0, tier === 2 ? 0.48 : 0.65, spokeHex, 0.03);
  }
  vb.cylZ(w0 - 1, w1 + 1, 0, 0, 2.7, tier === 2 ? P.ironDark : P.oakDark, 0, 0.03);
  vb.cylZ(w0 - 1, w0, 0, 0, 2.9, P.iron, 2.1, 0.02);
  vb.cylZ(w1, w1 + 1, 0, 0, 2.9, P.iron, 2.1, 0.02);
  vb.cylZ(w0 - 2, w1 + 2, 0, 0, 1.4, P.ironDark, 0, 0.02);
  vb.box(-0.6, -0.6, w1 + 2, 0.6, 0.6, w1 + 2, P.brass, 0.01);
  if (tier >= 1) {
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      vb.set(Math.round(Math.cos(a) * (R - 0.3)), Math.round(Math.sin(a) * (R - 0.3)), w1, P.brass, 0.01);
    }
  }
  return vb.build(0, 0, 0);
}

function buildSpringAssembly(susTier = 1) {
  const g = new THREE.Group();
  const lb = new V(S);
  lb.box(-6, 0, -1, 6, 0, 1, P.ironDark, 0.02);
  lb.box(-4, 1, -1, 4, 1, 1, P.iron, 0.02);
  if (susTier >= 1) lb.box(-2, 2, -1, 2, 2, 1, P.ironDark, 0.02);
  if (susTier >= 2) lb.box(-5, -1, -1, 5, -1, 1, P.iron, 0.02);
  lb.box(-6, -1, -1, -5, 1, 1, P.brass, 0.02);
  lb.box(5, -1, -1, 6, 1, 1, P.brass, 0.02);
  const leaf = lb.build(0, 0, 0);
  g.add(leaf);

  const cb = new V(S);
  const coilColA = susTier === 2 ? P.lantern : P.brass;
  for (let y = 0; y <= 7; y++) {
    const col = y % 2 === 0 ? P.iron : coilColA;
    if (susTier === 2) {
      cb.box(-2.2, -y, -1, -0.6, -y, 1, col, 0.02);
      cb.box(0.6, -y, -1, 2.2, -y, 1, col, 0.02);
    } else {
      cb.box(-1, -y, -1, 1, -y, 1, col, 0.02);
    }
  }
  const coil = cb.build(0, 0, 0);
  coil.position.set(0, 2 * S, 0);
  g.add(coil);

  return { group: g, leaf, coil };
}

function buildRigidMount() {
  // Lv1: roda kayu dipaku mati ke rangka — TIDAK ada per, tidak ada travel.
  const g = new THREE.Group();
  const lb = new V(S);
  lb.box(-6, 0, -1, 6, 0, 1, P.ironDark, 0.02);
  lb.box(-4, 1, -1, 4, 1, 1, P.iron, 0.02);
  lb.box(-2, 2, -1, 2, 2, 1, P.ironDark, 0.02);
  lb.box(-6, -1, -1, -5, 1, 1, P.ironDark, 0.02);
  lb.box(5, -1, -1, 6, 1, 1, P.ironDark, 0.02);
  const plate = lb.build(0, 0, 0);
  g.add(plate);
  return { group: g, leaf: plate, coil: null, rigid: true };
}

function makeBarrelMesh(tintHex) {
  const b = new V(S);
  for (let y = -6; y <= 6; y++) {
    const r = 5.0 - Math.abs(y) * 0.14;
    const isHoop = Math.abs(y) === 5 || Math.abs(y) === 2;
    b.cylY(0, 0, y, y, r, isHoop ? P.ironDark : tintHex, 0, 0.045);
  }
  b.cylY(0, 0, 6, 6, 4.1, P.oakLite, 0, 0.03);
  b.box(-0.6, 6, -0.6, 0.6, 7, 0.6, P.brass);
  return b.build(0, 0, 0);
}

function makeCrateMesh(w, h, d, mainHex, trimHex) {
  const c = new V(S);
  c.box(-w, -h, -d, w, h, d, mainHex, 0.05);
  for (const sx of [-w, w]) c.box(sx, -h, -d, sx, h, d, trimHex, 0.03);
  for (const sz of [-d, d]) c.box(-w, -h, sz, w, h, sz, trimHex, 0.03);
  c.line(-w + 1, -h + 1, d, w - 1, h - 1, d, 0.5, P.oakMid, 0.02);
  c.line(-w + 1, -h + 1, -d, w - 1, h - 1, -d, 0.5, P.oakMid, 0.02);
  for (const sx of [-w, w])
    for (const sy of [-h, h])
      for (const sz of [-d, d])
        c.set(sx, sy, sz, P.ironDark, 0.01);
  return c.build(0, 0, 0);
}

function makeSackMesh(colHex) {
  const sb = new V(S);
  sb.ellipsoid(0, 0, 0, 5.0, 3.5, 4.0, colHex, 0.05);
  sb.box(-1.5, 2.7, -1.5, 1.5, 3.7, 1.5, P.sackTie, 0.02);
  sb.ellipsoid(0, 4.3, 0, 2.0, 1.2, 2.0, colHex, 0.04);
  return sb.build(0, 0, 0);
}

function makeTarpMesh() {
  const tb = new V(S);
  tb.cylZ(-7, 7, 0, 0, 3.1, P.canvas, 0, 0.04);
  tb.cylZ(-7, 7, 0, 0, 1.7, P.padCloth, 0, 0.03);
  tb.cylZ(-4, -3, 0, 0, 3.4, P.leather, 2.7, 0.02);
  tb.cylZ(3, 4, 0, 0, 3.4, P.leather, 2.7, 0.02);
  return tb.build(0, 0, 0);
}

function makeTreasureChestMesh() {
  const cb = new V(S);
  cb.box(-5, -3, -4, 5, 2, 4, P.oakDark, 0.04);
  cb.box(-5, 2, -4, 5, 4, 4, P.oakMid, 0.04);
  for (const x of [-4, 0, 4]) cb.box(x, -3, -4, x, 4, 4, P.brass, 0.02);
  cb.box(-1, 0, 4, 1, 2, 5, P.lantern, 0.01);
  return cb.build(0, 0, 0);
}

// ============================================================
//  VOXEL PASSENGERS (4 adventurer duduk berhadapan, tanpa kusir)
// ============================================================
function makePassengerGroup(spec) {
  const root = new THREE.Group();
  const b = new V(H);

  // Seated legs & boots (extending forward +X and down to floor)
  b.box(1, -2, -2, 5, 0, -1, spec.pants, 0.03);
  b.box(1, -2,  1, 5, 0,  2, spec.pants, 0.03);
  b.box(4, -6, -2, 6, -2, -1, spec.pants, 0.03);
  b.box(4, -6,  1, 6, -2,  2, spec.pants, 0.03);
  b.box(4, -7, -2, 7, -6, -1, P.leather, 0.02);
  b.box(4, -7,  1, 7, -6,  2, P.leather, 0.02);

  // Pelvis base on bench
  b.box(-2, -1, -3, 2, 1, 3, spec.pants, 0.03);
  root.add(b.build(0, 0, 0));

  // Upper body pivot (sways with cart roll/pitch/bumps)
  const upper = new THREE.Group();
  upper.position.set(0, 1 * H, 0);
  root.add(upper);

  const ub = new V(H);
  // Torso tunic / jacket + belt + collar
  ub.box(-2, 0, -3, 2, 8, 3, spec.shirt, 0.04);
  ub.box(-2, 0, -3, 2, 1, 3, P.leather, 0.02);
  ub.set(2, 0, 0, P.brass, 0.01);
  ub.box(-1, 7, -2, 2, 8, 2, spec.trim, 0.02);

  // Arms resting forward on lap (nggak ada kusir, semua penumpang santai)
  const armY = 3;
  ub.box(-1, armY, -5, 4, armY + 2, -4, spec.shirt, 0.03);
  ub.box(-1, armY,  4, 4, armY + 2,  5, spec.shirt, 0.03);
  ub.box(4, armY, -5, 5, armY + 1, -4, spec.skin, 0.02);
  ub.box(4, armY,  4, 5, armY + 1,  5, spec.skin, 0.02);

  // Backpack / satchel on rear passengers
  if (spec.pack) {
    ub.box(-4, 1, -2, -2, 7, 2, P.sack, 0.04);
    ub.box(-4, 5, -2, -2, 6, 2, P.leather, 0.02);
  }
  upper.add(ub.build(0, 0, 0));

  // Head pivot
  const head = new THREE.Group();
  head.position.set(0, 8.5 * H, 0);
  upper.add(head);

  const hb = new V(H);
  // Minecraft-style voxel head (6x6x6)
  hb.box(-2, 0, -3, 3, 5, 3, spec.skin, 0.03);
  // Eyes & eyebrows
  hb.set(3, 3, -1, P.eyeWhite, 0.01);
  hb.set(3, 3, -2, P.eyePupil, 0.01);
  hb.set(3, 3,  1, P.eyeWhite, 0.01);
  hb.set(3, 3,  2, P.eyePupil, 0.01);
  hb.box(3, 4, -2, 3, 4, -1, spec.hair, 0.02);
  hb.box(3, 4,  1, 3, 4,  2, spec.hair, 0.02);
  // Hair back & sides
  hb.box(-3, 1, -3, 2, 5, 3, spec.hair, 0.03);

  if (spec.beard) {
    hb.box(2, 0, -2, 4, 2, 2, spec.hair, 0.03);
  }
  if (spec.hat === 'cowboy') {
    hb.box(-4, 5, -5, 5, 6, 5, P.leather2, 0.03);
    hb.box(-2, 6, -3, 3, 8, 3, P.leather, 0.03);
    hb.box(-2, 6, -3, 3, 6, 3, P.brass, 0.02);
  } else if (spec.hat === 'bandana') {
    hb.box(-3, 5, -3, 3, 6, 3, P.padCloth, 0.03);
    hb.box(-4, 3, -1, -3, 5, 1, P.padCloth, 0.03);
  } else if (spec.hat === 'straw') {
    hb.box(-4, 5, -5, 5, 6, 5, P.sack, 0.03);
    hb.box(-2, 6, -3, 3, 7, 3, P.canvas, 0.03);
    hb.box(-2, 6, -3, 3, 6, 3, P.padCloth, 0.02);
  } else {
    hb.box(-2, 5, -3, 3, 6, 3, spec.hair, 0.03);
  }

  head.add(hb.build(0, 0, 0));
  return { root, upper, head, phase: spec.phase || 0 };
}

function buildPassengers(body, capSpec = {}) {
  // 4 adventurer, TANPA kusir. Kabin di BURITAN; dua bangku memanjang di sisi
  // KIRI dan KANAN bak. Tiap sisi 2 orang, saling berhadapan melintang gerobak.
  const bedHalfL = capSpec.bedHalfL || 32;
  const xBack = -bedHalfL;
  const benchX0 = xBack + 3, benchX1 = -6;      // sama dengan geometri bangku di buildCart
  const span = benchX1 - benchX0;
  const xA = benchX0 + span * 0.28;
  const xB = benchX0 + span * 0.72;
  const zSeat = 9.3;                             // duduk di bantalan, punggung ke dinding
  const specs = [
    { x: xA, y: 14.2, z:  zSeat, rotY:  Math.PI / 2, shirt: 0x2f5678, pants: 0x2b2f35, skin: 0xe2b18c, hair: 0x382315, trim: P.brass, hat: 'cowboy', beard: true, pack: false, phase: 0.0 },
    { x: xB, y: 14.2, z:  zSeat, rotY:  Math.PI / 2, shirt: 0x8c2721, pants: 0x3b2d22, skin: 0xe8be9b, hair: 0x24170e, trim: P.canvas, hat: 'straw', beard: false, pack: false, phase: 1.4 },
    { x: xA, y: 14.2, z: -zSeat, rotY: -Math.PI / 2, shirt: 0x3b6e4c, pants: 0x352b22, skin: 0xdba67e, hair: 0x1c1410, trim: P.sack, hat: 'bandana', pack: false, phase: 2.7 },
    { x: xB, y: 14.2, z: -zSeat, rotY: -Math.PI / 2, shirt: 0xd4882a, pants: 0x2b2f35, skin: 0xe6b894, hair: 0x563219, trim: P.eyeWhite, hat: 'straw', pack: false, phase: 4.1 }
  ];
  const list = [];
  for (const sp of specs) {
    const passenger = makePassengerGroup(sp);
    // badan orang tetap ukuran manusia (H); cuma posisi duduknya yang ikut skala gerobak
    const seatY = (sp.y - 13.2) * H + 13.2 * S;
    passenger.root.position.set(sp.x * S, seatY, sp.z * S);
    passenger.root.rotation.y = sp.rotY;
    body.add(passenger.root);
    list.push(passenger);
  }
  return list;
}

function makeWaterBarrelMesh() {
  const b = new V(S);
  for (let y = -5; y <= 5; y++) {
    const r = 4.4 - Math.abs(y) * 0.14;
    const isHoop = Math.abs(y) === 4 || Math.abs(y) === 1;
    const col = isHoop ? P.ironDark : (Math.abs(y) === 2 ? 0x2563eb : P.oakMid);
    b.cylY(0, 0, y, y, r, col, 0, 0.04);
  }
  // Open/shimmering fresh turquoise water disc on top + brass tap spout on side
  b.cylY(0, 0, 5, 5, 3.6, 0x38bdf8, 0, 0.02);
  b.cylY(0, 0, 5.2, 5.2, 2.4, 0x7dd3fc, 0, 0.01);
  b.box(-0.7, 5, -0.7, 0.7, 6, 0.7, P.brass, 0.01);
  b.box(3.8, -1, -0.6, 5.0, 0, 0.6, P.brass, 0.01);
  b.box(4.5, -2, -0.5, 5.1, -1, 0.5, P.brass, 0.01);
  return b.build(0, 0, 0);
}

function makeFruitBoxMesh() {
  const b = new V(S);
  // Slatted wooden pine box
  b.box(-4.4, -3.2, -3.8, 4.4, -2.2, 3.8, P.oakMid, 0.04);
  b.box(-4.4, -2.2, -3.8, -3.6, 1.4, 3.8, P.oakLite, 0.04);
  b.box(3.6, -2.2, -3.8, 4.4, 1.4, 3.8, P.oakLite, 0.04);
  b.box(-3.6, -2.2, -3.8, 3.6, 1.4, -3.0, P.oakMid, 0.04);
  b.box(-3.6, -2.2, 3.0, 3.6, 1.4, 3.8, P.oakMid, 0.04);
  // Colorful fresh apples, oranges, pears & leaves packed inside
  const fruits = [
    [-2.0, 0.2, -1.5, 1.35, 0xef4444],
    [ 0.2, 0.4, -1.4, 1.40, 0xf97316],
    [ 2.2, 0.2, -1.2, 1.30, 0xfacc15],
    [-1.8, 0.3,  1.4, 1.35, 0xf97316],
    [ 0.4, 0.5,  1.5, 1.35, 0xef4444],
    [ 2.1, 0.2,  1.3, 1.30, 0xef4444],
    [-0.7, 1.6,  0.0, 1.30, 0xfacc15],
    [ 1.2, 1.5, -0.1, 1.25, 0xef4444],
  ];
  for (const [fx, fy, fz, fr, col] of fruits) {
    b.ellipsoid(fx, fy, fz, fr, fr * 0.9, fr, col, 0.05);
  }
  b.box(-2.4, 1.4, -1.9, -1.6, 2.0, -1.1, 0x22c55e, 0.02);
  b.box(0.0, 2.1, -0.2, 0.8, 2.7, 0.6, 0x16a34a, 0.02);
  return b.build(0, 0, 0);
}

function buildCargoItems(capTier = 1) {
  // Cargo ditempatkan di kompartemen DEPAN (x: 2..22, z: -13..13) dengan tata letak organik.
  // Item starter mencakup perbekalan kuda (Tong Air & Kotak Buah) di sisi depan agar mudah diklik saat tekan Q!
  const allDefs = [
    // Lv1 (6 barang): Starter perbekalan kuda + perlengkapan ekspedisi
    { build: () => makeWaterBarrelMesh(), pos: [18.0, 11.4, -7.8], rot: [0, 0.14, 0], r: 4.5, nameKey: 'item_water_barrel', supplyKind: 'water', charges: 5, maxCharges: 5 },
    { build: () => makeFruitBoxMesh(), pos: [18.0, 9.6, 7.6], rot: [0, -0.16, 0], r: 4.6, nameKey: 'item_fruit_box', supplyKind: 'food', charges: 5, maxCharges: 5 },
    { build: () => makeBarrelMesh(P.oakDark), pos: [6.0, 12.1, -8.2], rot: [0, 0.22, 0], r: 5.0, nameKey: 'item_oil_cask' },
    { build: () => makeSackMesh(P.sack), pos: [10.4, 9.6, 7.8], rot: [0.04, -0.34, 0], r: 4.0, nameKey: 'item_oat_sack' },
    { build: () => makeCrateMesh(4, 3.5, 4, P.oakMid, P.oakDark), pos: [6.4, 9.6, 7.4], rot: [0, -0.19, 0], r: 4.3, nameKey: 'item_hay_bale' },
    { build: () => makeTarpMesh(), pos: [11.2, 9.2, -1.0], rot: [0, 0.18, 0], r: 3.8, nameKey: 'item_travel_tarp' },
    // Lv2 (+2 = 8)
    { build: () => makeTreasureChestMesh(), pos: [14.2, 9.1, 0.6], rot: [0, -0.26, 0], r: 4.5, nameKey: 'item_storage_chest' },
    { build: () => makeCrateMesh(5, 4, 5, P.oakLite, P.oakDark), pos: [6.0, 10.1, 0.5], rot: [0, 0.35, 0], r: 4.8, nameKey: 'item_tool_crate' },
    // Lv3 (+4 = 12)
    { build: () => makeTreasureChestMesh(), pos: [14.8, 9.1, -7.2], rot: [0, 0.19, 0], r: 4.4, nameKey: 'item_storage_chest' },
    { build: () => makeSackMesh(P.sack), pos: [13.2, 9.6, 4.4], rot: [0.08, -0.45, 0], r: 3.9, nameKey: 'item_oat_sack' },
    { build: () => makeCrateMesh(4, 3, 4, P.oakLite, P.oakDark), pos: [19.4, 9.1, 0.2], rot: [0, 0.28, 0], r: 4.2, nameKey: 'item_tool_crate' },
    { build: () => makeSackMesh(P.canvas), pos: [8.8, 9.6, -4.6], rot: [-0.04, 0.52, 0], r: 3.9, nameKey: 'item_oat_sack' }
  ];

  const spec = HC.CART_UPGRADES.capacity[capTier] || HC.CART_UPGRADES.capacity[1];
  const count = spec.count;
  const items = [];
  for (let i = 0; i < count; i++) {
    const d = allDefs[i];
    items.push({
      mesh: d.build(),
      nameKey: d.nameKey || 'item_tool_crate',
      supplyKind: d.supplyKind || null,
      charges: d.charges != null ? d.charges : 0,
      maxCharges: d.maxCharges != null ? d.maxCharges : 0,
      homePos: new THREE.Vector3(d.pos[0] * S, d.pos[1] * S, d.pos[2] * S),
      homeRot: new THREE.Euler(d.rot[0], d.rot[1], d.rot[2]),
      radius: d.r * S
    });
  }
  return items;
}

HC.buildQuestCargoMesh = function (cargoKind = 'spices', sc = S) {
  const b = new V(sc);
  const kind = String(cargoKind || 'spices');
  if (kind === 'spices') {
    // Peti terbuka berisi 4 mangkuk rempah warna-warni
    b.box(-4.2, -3.0, -3.8, 4.2, -2.0, 3.8, P.oakMid, 0.04);
    b.box(-4.2, -2.0, -3.8, -3.4, 1.4, 3.8, P.oakDark, 0.03);
    b.box(3.4, -2.0, -3.8, 4.2, 1.4, 3.8, P.oakDark, 0.03);
    b.box(-3.4, -2.0, -3.8, 3.4, 1.4, -3.0, P.oakLite, 0.03);
    b.box(-3.4, -2.0, 3.0, 3.4, 1.4, 3.8, P.oakLite, 0.03);
    // 4 kompartemen rempah (kunyit, cabai, jintan, herba)
    b.box(-3.0, -2.0, -2.6, -0.3, 1.9, -0.3, 0xf59e0b, 0.05);
    b.box(0.3, -2.0, -2.6, 3.0, 2.2, -0.3, 0xdc2626, 0.05);
    b.box(-3.0, -2.0, 0.3, -0.3, 2.1, 2.6, 0xeab308, 0.05);
    b.box(0.3, -2.0, 0.3, 3.0, 1.8, 2.6, 0x16a34a, 0.05);
    b.box(-4.3, -3.0, -3.9, 4.3, -2.6, -3.5, P.brass, 0.01);
  } else if (kind === 'wheat') {
    // Karung gandum montok terikat tali + bulir emas mencuat
    b.ellipsoid(0, 0.2, 0, 4.2, 3.2, 3.6, 0xd6b376, 0.05);
    b.box(-1.6, 2.6, -1.6, 1.6, 3.5, 1.6, 0x78552b, 0.02);
    for (const [ox, oz] of [[-0.8, -0.6], [0.7, -0.4], [0, 0.8], [-0.4, 0.2]]) {
      b.line(ox, 3.0, oz, ox * 2.2, 5.4, oz * 2.2, 0.45, 0xfacc15, 0.03);
      b.set(Math.round(ox * 2.2), 5, Math.round(oz * 2.2), 0xca8a04, 0.02);
    }
  } else if (kind === 'cloth') {
    // Tumpukan gulungan kain tenun bermotif warna mencolok + tali pengikat
    b.box(-4.2, -3.0, -3.8, 4.2, -2.2, 3.8, P.oakDark, 0.03);
    b.cylX(-4.0, 4.0, -0.4, -1.8, 1.7, 0xbe123c, 0, 0.04);
    b.cylX(-4.0, 4.0, -0.4, 1.8, 1.7, 0x1d4ed8, 0, 0.04);
    b.cylX(-3.8, 3.8, 2.1, 0.0, 1.6, 0xd97706, 0, 0.04);
    for (const sx of [-2.4, 2.4]) {
      b.box(sx, -2.2, -3.6, sx + 0.6, 3.8, 3.6, P.leather, 0.02);
    }
  } else if (kind === 'potions') {
    // Rak kayu apotek berisi 4 botol ramuan kaca berwarna cerah + gabus
    b.box(-4.0, -3.0, -3.6, 4.0, -1.8, 3.6, P.oakDark, 0.03);
    b.box(-3.8, -1.8, -3.4, 3.8, 0.8, -2.8, P.oakMid, 0.03);
    b.box(-3.8, -1.8, 2.8, 3.8, 0.8, 3.4, P.oakMid, 0.03);
    const flasks = [[-2.0, -1.5, 0x10b981], [2.0, -1.5, 0xf43f5e], [-2.0, 1.5, 0x3b82f6], [2.0, 1.5, 0xf59e0b]];
    for (const [fx, fz, col] of flasks) {
      b.cylY(fx, fz, -1.8, 1.8, 1.35, col, 0, 0.02);
      b.cylY(fx, fz, 1.8, 3.2, 0.65, 0xdbeafe, 0, 0.01);
      b.box(fx - 0.5, 3.2, fz - 0.5, fx + 0.5, 4.0, fz + 0.5, P.oakLite, 0.01);
    }
  } else if (kind === 'iron_tools') {
    // Peti perkakas besi tempa + batangan baja + kapak/beliung menonjol
    b.box(-4.4, -3.0, -3.6, 4.4, 1.6, 3.6, P.oakDark, 0.04);
    b.box(-4.5, -3.0, -3.7, -3.8, 1.8, 3.7, P.ironDark, 0.02);
    b.box(3.8, -3.0, -3.7, 4.5, 1.8, 3.7, P.ironDark, 0.02);
    b.box(-3.0, 1.2, -2.4, 0.5, 2.6, 0.0, 0x94a3b8, 0.02);
    b.box(-2.4, 2.6, -2.0, 0.2, 3.6, -0.4, 0xcbd5e1, 0.02);
    b.line(-1.0, 0.5, 1.8, 3.6, 4.6, 1.0, 0.55, P.oakMid, 0.02);
    b.box(2.2, 3.6, -0.6, 4.2, 5.2, 2.6, 0x64748b, 0.02);
  } else if (kind === 'honey') {
    // Peti jerami isi 2 guci madu hutan keemasan menetes
    b.box(-4.2, -3.0, -3.4, 4.2, 0.2, 3.4, P.oakMid, 0.04);
    b.box(-3.6, -2.0, -2.8, 3.6, 0.6, 2.8, 0xeab308, 0.04);
    for (const hx of [-1.9, 1.9]) {
      b.cylY(hx, 0, -1.6, 2.6, 1.7, 0xc2410c, 0, 0.03);
      b.cylY(hx, 0, 2.4, 3.3, 1.25, 0xfbbf24, 0, 0.02);
      b.box(hx - 1.0, 1.6, 1.2, hx - 0.3, 2.6, 1.7, 0xf59e0b, 0.01);
      b.box(hx - 0.8, 3.3, -0.8, hx + 0.8, 4.1, 0.8, 0xfef3c7, 0.02);
    }
  } else if (kind === 'coffee') {
    // Karung goni kopi cokelat gelap penuh biji kopi sangrai
    b.ellipsoid(0, -0.4, 0, 4.0, 2.8, 3.5, 0x7c5a38, 0.05);
    b.cylY(0, 0, 1.4, 2.6, 2.8, 0x9a754c, 0, 0.03);
    b.cylY(0, 0, 2.3, 3.8, 2.2, 0x3b1f14, 0, 0.04);
    b.box(-1.2, 3.4, -1.0, 1.2, 4.3, 1.0, 0x522e1f, 0.03);
    b.box(-4.0, -1.0, -0.8, -3.5, 0.8, 0.8, 0xdc2626, 0.02);
    b.box(3.5, -1.0, -0.8, 4.0, 0.8, 0.8, 0xdc2626, 0.02);
  } else {
    // 'ceramics': Peti jerami berpelindung dengan guci keramik porselen biru-putih
    b.box(-4.0, -3.0, -3.6, 4.0, 0.4, 3.6, P.oakLite, 0.04);
    b.box(-3.4, -2.0, -3.0, 3.4, 0.8, 3.0, 0xe5cf8c, 0.04);
    b.cylY(-1.2, 0, -1.2, 3.0, 2.0, 0xf8fafc, 0, 0.02);
    b.cylY(-1.2, 0, 0.4, 1.3, 2.05, 0x1d4ed8, 0, 0.01);
    b.cylY(-1.2, 0, 3.0, 4.4, 0.95, 0xf8fafc, 0, 0.02);
    b.cylY(-1.2, 0, 4.0, 4.6, 1.35, 0x1d4ed8, 0, 0.01);
    b.cylY(2.2, 0.6, -1.0, 1.4, 1.3, 0xf8fafc, 0, 0.02);
    b.cylY(2.2, 0.6, 0.8, 1.3, 1.35, 0x1d4ed8, 0, 0.01);
  }
  const mesh = b.build(0, 0, 0);
  mesh.userData.questCargoKind = kind;
  return mesh;
};

HC.clearQuestCargoFromCart = function (cart, physics) {
  if (!cart || !Array.isArray(cart.cargoItems)) return 0;
  let removed = 0;
  for (let i = cart.cargoItems.length - 1; i >= 0; i--) {
    const it = cart.cargoItems[i];
    if (it && it.hiddenForQuest) {
      it.hiddenForQuest = false;
      if (it.mesh) it.mesh.visible = true;
    }
    if (!it || !it.isQuestCargo) continue;
    if (it.mesh && it.mesh.parent) it.mesh.parent.remove(it.mesh);
    if (physics && Array.isArray(physics.spilled)) {
      const sIdx = physics.spilled.indexOf(it);
      if (sIdx >= 0) physics.spilled.splice(sIdx, 1);
    }
    cart.cargoItems.splice(i, 1);
    removed++;
  }
  return removed;
};

HC.refillCartSupplies = function (cart) {
  if (!cart || !Array.isArray(cart.cargoItems)) return 0;
  let refilled = 0;
  for (const it of cart.cargoItems) {
    if (!it || !it.supplyKind) continue;
    const mx = it.maxCharges || 5;
    if ((it.charges || 0) < mx) {
      refilled += mx - (it.charges || 0);
      it.charges = mx;
    }
  }
  return refilled;
};

HC.makeWaterBucketMesh = function (sc = S) {
  const grp = new THREE.Group();
  const b = new V(sc);
  b.cylY(0, 0, -2.2, 2.2, 2.1, P.oakMid, 0, 0.03);
  b.cylY(0, 0, 0.8, 1.5, 2.25, P.ironDark, 0, 0.01);
  b.cylY(0, 0, -1.7, -1.0, 2.22, P.ironDark, 0, 0.01);
  b.box(-2.2, 2.2, -0.35, -1.7, 4.0, 0.35, P.ironDark, 0.01);
  b.box(1.7, 2.2, -0.35, 2.2, 4.0, 0.35, P.ironDark, 0.01);
  b.box(-2.2, 3.8, -0.35, 2.2, 4.3, 0.35, P.oakLite, 0.02);
  grp.add(b.build(0, 0, 0));

  const wGeo = new THREE.CylinderGeometry(1.75 * sc, 1.75 * sc, 0.4 * sc, 10);
  const wMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.25, metalness: 0.1 });
  const wDisc = new THREE.Mesh(wGeo, wMat);
  wDisc.position.y = 1.65 * sc;
  wDisc.visible = false;
  grp.add(wDisc);
  grp.userData.waterDisc = wDisc;
  return grp;
};

HC.setQuestCargoOnCart = function (cart, physics, cargoKind = 'spices', count = 3, questMeta = null) {
  if (!cart || !cart.body) return [];
  HC.clearQuestCargoFromCart(cart, physics);

  // Tempatkan barang quest di kompartemen kargo tanpa menumpuk barang pengisi
  const qSlots = [
    { pos: [11.0, 10.2, -6.2], rot: [0, 0.16, 0] },
    { pos: [13.8, 10.2, 0.2],  rot: [0, -0.22, 0] },
    { pos: [10.8, 10.2, 6.2],  rot: [0, 0.28, 0] },
  ];
  const n = Math.max(1, Math.min(qSlots.length, count | 0));
  const placed = [];

  // Sembunyikan semua barang filler statis selain perbekalan kuda (Water Barrel & Fruit Box) agar barang quest terlihat jelas
  for (const ex of cart.cargoItems) {
    if (!ex || ex.isQuestCargo || ex.supplyKind || ex.spilled || ex.hiddenForQuest) continue;
    ex.hiddenForQuest = true;
    if (ex.mesh) ex.mesh.visible = false;
  }

  for (let i = 0; i < n; i++) {
    const slot = qSlots[i];
    const hp = new THREE.Vector3(slot.pos[0] * S, slot.pos[1] * S, slot.pos[2] * S);
    const hr = new THREE.Euler(slot.rot[0], slot.rot[1], slot.rot[2]);

    const mesh = HC.buildQuestCargoMesh(cargoKind, S);
    mesh.position.copy(hp);
    mesh.rotation.copy(hr);
    cart.body.add(mesh);

    const bb = new THREE.Box3().setFromObject(mesh);
    const sz = bb.getSize(new THREE.Vector3());
    const half = new THREE.Vector3(
      Math.max(0.05, sz.x * 0.45),
      Math.max(0.05, sz.y * 0.45),
      Math.max(0.05, sz.z * 0.45)
    );
    const item = {
      mesh,
      isQuestCargo: true,
      cargoKind,
      nameKey: `goods_${cargoKind}`,
      questToName: questMeta ? questMeta.toName : null,
      homePos: hp,
      homeRot: hr,
      localPos: hp.clone(),
      localVel: new THREE.Vector3(),
      localAng: new THREE.Vector3(hr.x, hr.y, hr.z),
      localAngVel: new THREE.Vector3(),
      floorY: hp.y,
      bounciness: 0.36 + (i % 3) * 0.06,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      spilled: false,
      half,
      radius: Math.max(half.x, half.z, 0.28),
      _onTopPrev: false,
      _restT: 0,
    };
    mesh.userData.cartItem = item;
    cart.cargoItems.push(item);
    placed.push(item);
  }
  return placed;
};

HC.buildCart = function (pivotY = 0.58, upgrades = {}) {
  const capTier = upgrades.capacity ?? 1;
  const wheelTier = upgrades.wheels ?? 1;
  const susTier = upgrades.suspension ?? 1;
  const canopyTier = upgrades.canopy ?? 0;

  const capSpec = HC.CART_UPGRADES.capacity[capTier] || HC.CART_UPGRADES.capacity[1];
  const wheelSpec = HC.CART_UPGRADES.wheels[wheelTier] || HC.CART_UPGRADES.wheels[1];
  const susSpec = HC.CART_UPGRADES.suspension[susTier] || HC.CART_UPGRADES.suspension[1];
  // Lv1 wheel axle is physically rigid regardless of the separate suspension selector.
  const rigidAxle = !!(wheelSpec.rigid || susSpec.rigid);

  const root = new THREE.Group();
  root.name = 'cart';

  const chassis = new THREE.Group();
  root.add(chassis);
  const body = new THREE.Group();
  body.position.y = 0.42 * HC.cartScale - pivotY;
  chassis.add(body);

  const cb = new V(S);
  const xBack = -capSpec.bedHalfL;
  const xFront = 24;
  const zSide = capSpec.bedHalfW || 15; // Lebar 30 voxel (~1.9 m) muat 2 orang berdampingan lega
  const rearAxleX = Math.min(-18, xBack + 8);

  // Heavy oak longitudinal beams (frame rails)
  cb.box(xBack - 1, 2, -zSide + 3, xFront + 1, 4, -zSide + 5, P.oakDark, 0.04);
  cb.box(xBack - 1, 2,  zSide - 5, xFront + 1, 4,  zSide - 3, P.oakDark, 0.04);
  cb.box(xBack, 2, -1, xFront, 4, 1, P.oakDark, 0.04);

  // Crossbeams
  for (let x = xBack + 2; x <= xFront - 2; x += 9) {
    cb.box(x - 1, 2, -zSide, x + 1, 4, zSide, P.oakDark, 0.04);
  }

  // Planked floor bed (wider & longer)
  for (let z = -zSide; z <= zSide; z++) {
    const plankCol = Math.floor((z + zSide) / 3) % 2 === 0 ? P.oakMid : P.oakPlank;
    cb.box(xBack, 5, z, xFront, 6, z, plankCol, 0.05);
  }

  // Side & front/rear stakes
  const stakeTop = 6 + capSpec.railSlats * 3 + 1;
  const postXs = [];
  for (let x = xBack; x < xFront; x += 10) postXs.push(x);
  postXs.push(xFront);

  for (const x of postXs) {
    for (const z of [-zSide, zSide]) {
      cb.box(x, 6, z, x + (x === xFront ? 0 : 1), stakeTop, z + (z > 0 ? 1 : -1), P.oakDark, 0.04);
      cb.set(x, 7, z + (z > 0 ? 1 : -1), P.ironDark, 0.01);
      cb.set(x, stakeTop - 1, z + (z > 0 ? 1 : -1), P.ironDark, 0.01);
    }
  }

  // Horizontal side slats — tinggi di kabin penumpang, 2 tingkat di bak kargo
  for (const z of [-zSide, zSide]) {
    for (let s = 0; s < capSpec.railSlats; s++) {
      const sy = 8 + s * 3;
      const col = s % 2 === 0 ? P.oakMid : P.oakLite;
      const x0 = s <= 1 ? xBack : Math.max(xBack, 1);
      cb.box(x0, sy, z, xFront, sy + 1, z, col, 0.045);
    }
  }

  // Front dashboard & rear tailgate
  const gateTop = 6 + capSpec.railSlats * 3;
  for (const x of [xBack, xFront]) {
    const topY = x === xFront ? Math.min(gateTop, 13) : gateTop;
    cb.box(x, 7, -zSide, x, topY, zSide, P.oakMid, 0.045);
    cb.box(x, topY, -zSide, x, topY + 1, zSide, P.oakDark, 0.03);
    for (const z of [-10, 0, 10]) {
      cb.box(x + (x > 0 ? 1 : -1), 6, z - 1, x + (x > 0 ? 1 : -1), topY - 1, z + 1, P.ironDark, 0.02);
    }
  }

  // ============================================================
  //  KABIN PENUMPANG DI BURITAN; BANGKU KIRI-KANAN SALING BERPANDANGAN
  // ============================================================
  // Bangku KIRI (z positif), memanjang di buritan; penumpang hadap ke lorong tengah.
  const benchX0 = xBack + 3, benchX1 = -6;
  cb.box(benchX0, 11,  8, benchX1, 12, 12, P.oakLite, 0.04);
  cb.box(benchX0, 12,  8, benchX1, 13, 12, P.padCloth, 0.03);
  cb.box(benchX0, 13, 12, benchX1, 18, 14, P.oakDark, 0.04);
  // Bangku KANAN (z negatif), cermin dari bangku kiri.
  cb.box(benchX0, 11, -12, benchX1, 12, -8, P.oakLite, 0.04);
  cb.box(benchX0, 12, -12, benchX1, 13, -8, P.padCloth, 0.03);
  cb.box(benchX0, 13, -14, benchX1, 18, -12, P.oakDark, 0.04);
  // Sekat melintang: kargo depan (x >= 2) terpisah dari penumpang di buritan.
  cb.box(0, 7, -zSide + 1, 1, Math.max(18, gateTop), zSide - 1, P.oakDark, 0.04);
  cb.box(0, Math.max(18, gateTop), -zSide, 1, Math.max(18, gateTop) + 1, zSide, P.ironDark, 0.02);
  // Detail dek barang: alas kayu anti-selip, siku besi pengikat sudut, dan cincin pengait di pagar
  for (const bx of [4, 10, 16, 21]) {
    cb.box(bx, 6, -(zSide - 2), bx, 6, zSide - 2, P.oakDark, 0.03);
  }
  for (const sz of [-(zSide - 1), zSide - 1]) {
    cb.box(2, 7, sz, 3, 9, sz, P.ironDark, 0.02);
    cb.box(22, 7, sz, 23, 9, sz, P.ironDark, 0.02);
    for (const rx of [6, 12, 18]) {
      cb.box(rx, 9, sz, rx + 1, 10, sz, P.brass, 0.015);
    }
  }

  // Rak/pijakan depan dan dashboard hanya di kompartemen barang, tanpa kursi kusir.
  cb.box(23, 8, -zSide + 1, 25, 9, zSide - 1, P.oakDark, 0.04);
  cb.box(26, 9, -zSide + 1, 27, 13, zSide - 1, P.oakMid, 0.03);
  cb.box(26, 13, -zSide + 1, 27, 14, zSide - 1, P.ironDark, 0.02);

  // Armor / Iron Trim on Canopy/Frame Tier >= 1. Sekat internal di x=0 tetap utuh.
  if (canopyTier >= 1) {
    for (const z of [-(zSide + 1), zSide + 1]) {
      cb.box(xBack, 5, z, xFront, 6, z, P.ironDark, 0.02);
      cb.box(xBack, gateTop, z, xFront, gateTop, z, P.brass, 0.02);
    }
    cb.box(xBack - 3, 3, -12, xBack - 1, 5, 12, P.ironDark, 0.02);
  }

  // Expedition Canvas Canopy Arch & Roof on Canopy Tier == 2 (covers cargo + both passenger benches, raised high for clear sightline)
  if (canopyTier === 2) {
    const archXs = [xBack + 2, Math.round((xBack + 2) * 0.5), 1, 18];
    const roofBaseY = Math.max(stakeTop + 1, 29);
    for (const ax of archXs) {
      cb.box(ax, stakeTop, -zSide, ax + 1, roofBaseY + 3, -zSide, P.oakDark, 0.03);
      cb.box(ax, stakeTop,  zSide, ax + 1, roofBaseY + 3,  zSide, P.oakDark, 0.03);
    }
    for (let z = -zSide; z <= zSide; z++) {
      const archH = Math.round(Math.cos((z / (zSide + 1)) * (Math.PI * 0.48)) * 5.0);
      const yTop = roofBaseY + 2 + archH;
      const col = Math.abs(z) % 4 === 0 ? P.sack : P.canvas;
      cb.box(xBack + 1, yTop, z, xFront - 2, yTop + 1, z, col, 0.035);
    }
  }

  // Side tool rack
  cb.box(-18, 11, -(zSide + 1), -2, 11, -(zSide + 1), P.oakLite, 0.02);
  cb.box(-6, 9, -(zSide + 1), -2, 13, -(zSide + 1), P.iron, 0.02);
  cb.box(-2, 9, -(zSide + 1), -2, 13, -(zSide + 1), P.eyeWhite, 0.01);

  // Pulling shafts (thills) — DIPISAH ke shaftGroup yang bisa berputar di pangkalnya,
  // supaya ujung batang selalu ngarah ke kalung bahu kuda (batang beneran bukan kaku nempel bak).
  const sb = new V(S);
  for (const s of [-1, 1]) {
    const z0 = s * 8.2;   // pangkal batang di sisi depan bak
    const z1 = s * 5.0;   // ujung merapat ke sisi kalung bahu kuda
    cb.box(xFront - 1, 7, z0 - 1, xFront + 3, 9, z0 + 1, P.ironDark, 0.02);  // bracket tetap di bak
    sb.line(xFront + 1, 8.0, z0, HC.shaftTipVox - 1.5, HC.shaftTipY - 0.4, z1, 0.85, P.oakDark, 0.035);
    sb.box(HC.shaftTipVox - 1.5, HC.shaftTipY - 1, z1 - 1, HC.shaftTipVox + 1.5, HC.shaftTipY + 0.6, z1 + 1, P.ironDark, 0.02);
    sb.box(HC.shaftTipVox + 0.5, HC.shaftTipY - 0.6, z1 - 0.5, HC.shaftTipVox + 1.5, HC.shaftTipY + 0.2, z1 + 0.5, P.brass, 0.01);
    // tali kulit pengikat ujung batang ke kalung bahu (biar kelihatan benar-benar nyambung)
    sb.box(HC.shaftTipVox - 2, HC.shaftTipY - 0.8, z1 - 0.5, HC.shaftTipVox + 3, HC.shaftTipY + 0.4, z1 + 0.5, P.leather, 0.02);
  }
  const shaftGroup = new THREE.Group();
  shaftGroup.position.set(xFront * S, 8.0 * S, 0); // pivot tepat di engsel pangkal batang (x=xFront, y=8)
  const shaftMesh = sb.build(xFront, 8.0, 0);      // geometri relatif ke engsel
  shaftGroup.add(shaftMesh);
  body.add(shaftGroup);
  // Singletree crossbar (di belakang pantat kuda dengan jarak aman untuk kaki belakang, x=35, y=11.5)
  cb.box(34, 11.0, -9.5, 36, 12.2, 9.5, P.oakMid, 0.03);
  cb.box(35, 11.0, -9.5, 35, 13.0, -8.5, P.iron);
  cb.box(35, 11.0,  8.5, 35, 13.0,  9.5, P.iron);

  // ============================================================
  //  BESI PENYANGGA POROS (axle beam) — menghubungkan roda KIRI & KANAN
  //  Hub roda di ruang body = (radius - 0.42) m -> voxel: r + 0.45 - 0.42/S
  // ============================================================
  // Tinggi pusat roda di ruang body (voxel). Roda digantung di cart.root pada
  // y = radius - pivotY, sedangkan body duduk di y = 0.42*cartScale - pivotY,
  // jadi selisihnya = radius - 0.42*cartScale. Ditulis pakai radius roda yang
  // sebenarnya dipakai fisika supaya boss poros tidak meleset.
  const hubVox = (r) => (r + 0.45) - (0.42 * HC.cartScale) / S;
  // ------------------------------------------------------------
  //  BESI PENYANGGA POROS: balok besi melintang KIRI-KANAN.
  //  Lantai bak ada di sekitar voxel y=-1.5, jadi balok ditaruh DI BAWAH
  //  lantai (y=-4..-1) supaya kelihatan dari samping/bawah, lalu di kedua
  //  ujungnya dipasang link vertikal yang naik ke rumah poros roda.
  // ------------------------------------------------------------
  const axleMeshes = [];
  const axleBeam = (bx, r, isFront, tag) => {
    const yHub = hubVox(r);                              // pusat roda (voxel, pecahan)
    const yB = Math.round(yHub);
    const zWheel = wheelSpec.trackZ;                      // bidang roda
    const zEnd = zWheel - wheelSpec.widthVox * 0.5 + 0.4; // ujung mentok ke muka dalam roda
    const ab = new V(S);
    // 1) BALOK POROS: melintang tepat di tinggi pusat roda, jadi kelihatan
    //    benar-benar menyambung roda kiri dan kanan (bukan menggantung di kolong).
    ab.box(bx - 1, yB - 1, -zEnd, bx + 1, yB + 1, zEnd, P.iron, 0.03);
    // 2) flange tipis atas-bawah biar kebaca besi tempa
    ab.box(bx - 2, yB + 1, -zEnd + 1, bx + 2, yB + 2, zEnd - 1, P.ironDark, 0.02);
    ab.box(bx - 2, yB - 2, -zEnd + 1, bx + 2, yB - 1, zEnd - 1, P.ironDark, 0.02);
    // 3) rumah poros (boss) di KEDUA ujung, menggemuk ke arah roda
    for (const sd of [-1, 1]) {
      const zc = sd * zEnd;
      ab.box(bx - 2, yB - 2, zc - 1, bx + 2, yB + 2, zc + 2, P.ironDark, 0.02);     // rumah poros
      ab.box(bx - 1, yB - 1, zc + 1, bx + 1, yB + 1, zc + 3, P.brass, 0.01);        // baut kuningan
    }
    // 4) gantungan poros -> rangka bak, biar porosnya kelihatan ditopang
    for (const sd of [-1, 1]) {
      const zc = sd * (zEnd - 2.0);
      ab.box(bx - 1, yB + 2, zc - 1, bx + 1, 2, zc + 1, P.ironDark, 0.02);          // link ke balok memanjang
    }
    // 5) penguat tengah + rumah kingpin (poros depan)
    ab.box(bx - 2, yB - 1, -2, bx + 2, yB + 1, 2, P.ironDark, 0.02);
    if (isFront) ab.box(bx - 1, yB - 2, -1, bx + 1, yB + 3, 1, P.iron, 0.02);
    const m = ab.build(0, 0, 0);
    m.name = tag;
    body.add(m);
    axleMeshes.push(m);
    return m;
  };
  axleBeam(16, wheelSpec.rFront, true, 'axleFront');
  axleBeam(rearAxleX, wheelSpec.rRear, false, 'axleRear');
  body.add(cb.build(0, 0, 0));

  // Starter gerobak kosong tanpa penumpang (direkrut langsung di desa)
  const passengers = [];

  // Swinging iron lantern
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(22 * S, 15 * S, (zSide + 1.5) * S);
  body.add(lanternPivot);
  const lb = new V(S);
  lb.box(-1, -2, -1, 1, 0, 1, P.ironDark);
  lb.box(-1.5, -5, -1.5, 1.5, -2, 1.5, P.lantern, 0.01);
  lb.box(-2, -6, -2, 2, -5, 2, P.ironDark);
  lanternPivot.add(lb.build(0, 0, 0));

  // Rope attachment anchors (ujung batang tepat di kalung bahu kuda & singletree sejajar sabuk perut)
  const shaftTipLeft = new THREE.Object3D();
  shaftTipLeft.position.set((HC.shaftTipVox - xFront) * S, (HC.shaftTipY - HC.shaftHingeY) * S, 5.0 * S);
  shaftGroup.add(shaftTipLeft);
  const shaftTipRight = new THREE.Object3D();
  shaftTipRight.position.set((HC.shaftTipVox - xFront) * S, (HC.shaftTipY - HC.shaftHingeY) * S, -5.0 * S);
  shaftGroup.add(shaftTipRight);
  const singletreeLeft = new THREE.Object3D();
  singletreeLeft.position.set(35.0 * S, 12.2 * S, 9.2 * S);
  body.add(singletreeLeft);
  const singletreeRight = new THREE.Object3D();
  singletreeRight.position.set(35.0 * S, 12.2 * S, -9.2 * S);
  body.add(singletreeRight);

  // Reins: ujung belakang diikat ke dashboard (tanpa kusir)
  const seatAnchor = new THREE.Object3D();
  // Tanpa kusir: tali kekang diikat ke palang dashboard depan, bukan ke tangan orang
  seatAnchor.position.set(25.5 * S, 14.6 * S, 0);
  body.add(seatAnchor);

  const wheelDefs = [
    { id: 'FL', x: 16, z: wheelSpec.trackZ, r: wheelSpec.rFront, front: true },
    { id: 'FR', x: 16, z: -wheelSpec.trackZ, r: wheelSpec.rFront, front: true },
    { id: 'RL', x: rearAxleX, z: wheelSpec.trackZ, r: wheelSpec.rRear, front: false },
    { id: 'RR', x: rearAxleX, z: -wheelSpec.trackZ, r: wheelSpec.rRear, front: false }
  ];

  const wheels = [];
  for (const wd of wheelDefs) {
    const mount = new THREE.Group();
    const mountY = hubVox(wd.r);           // pegas duduk tepat di poros roda
    mount.position.set(wd.x * S, mountY * S, (wd.z > 0 ? (zSide - 1.5) : -(zSide - 1.5)) * S);
    body.add(mount);
    const spring = rigidAxle ? buildRigidMount() : buildSpringAssembly(susTier);
    mount.add(spring.group);

    const wheelPivot = new THREE.Group();
    const wheelMesh = buildSpokedWheel(wd.r, wheelSpec.widthVox, wheelTier);
    wheelPivot.add(wheelMesh);
    root.add(wheelPivot);

    wheels.push({
      id: wd.id,
      front: wd.front,
      localX: wd.x * S,
      localZ: wd.z * S,
      radius: (wd.r + 0.45) * S,
      mountYVox: mountY,
      restSusLen: 4.5 * S,
      susLen: 4.5 * S,
      susVel: 0,
      compression: 0,
      spin: 0,
      groundY: 0,
      mount,
      spring,
      wheelPivot,
      wheelMesh
    });
  }

  const cargoItems = buildCargoItems(capTier);
  for (const item of cargoItems) {
    item.mesh.position.copy(item.homePos);
    item.mesh.rotation.copy(item.homeRot);
    item.mesh.userData.cartItem = item;
    body.add(item.mesh);
    item.vel = new THREE.Vector3();
    item.angVel = new THREE.Vector3();
    item.spilled = false;
  }

  return {
    root,
    chassis,
    body,
    wheels,
    axleMeshes,
    cargoItems,
    passengers,
    npcPassengers: [],   // diisi HC.NPCParty.mount() waktu kuda merekrut NPC
    lanternPivot,
    shaftGroup,
    shaftTipLeft,
    shaftTipRight,
    singletreeLeft,
    singletreeRight,
    seatAnchor,
    upgrades: { capacity: capTier, wheels: wheelTier, suspension: susTier, canopy: canopyTier },
    specs: { capSpec, wheelSpec, susSpec, rigidAxle }
  };
};
