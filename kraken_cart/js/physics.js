import { HC } from './hc.js';
import './voxel.js';
const THREE = HC.THREE, S = HC.cartVS, H = HC.vs;
const UP = new THREE.Vector3(0, 1, 0);

// Batas guling: gerobak boleh miring sampai 75°, begitu nyentuh batas itu
// langsung jatuh rebah (~89°) lalu berhenti total. Bukan animasi: sudut 75°
// tetap dicapai dari momen gaya & kontak roda.
const FLIP_ANG = 80 * Math.PI / 180;   // 1.3963 rad — batas guling 80°
const LAY_ANG  = 76 * Math.PI / 180;   // 1.3265 rad — di atas ini rebah sekali jalan
const REST_ANG = 1.56;                 // sudut rebah final (~89.4°)

// AABB visual barang di frame bak. localHalf/localCenter disimpan tanpa
// rotasi, jadi rotasi Y di sini harus mengikuti konvensi Three.js:
// x' =  x cos + z sin, z' = -x sin + z cos.
function cargoFootprint(posX, posZ, center, half, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    x: posX + c * center.x + s * center.z,
    z: posZ - s * center.x + c * center.z,
    hx: Math.abs(c) * half.x + Math.abs(s) * half.z,
    hz: Math.abs(s) * half.x + Math.abs(c) * half.z
  };
}

// Batas origin mesh supaya AABB visual tetap di dalam bak. Hasilnya origin
// (bukan pusat visual), jadi bisa langsung dipakai untuk clamp localPos.
function cargoBedLimits(center, half, yaw, bed, pad = 0.004) {
  const fp = cargoFootprint(0, 0, center, half, yaw);
  let minX = bed.xMin + fp.hx - fp.x + pad;
  let maxX = bed.xMax - fp.hx - fp.x - pad;
  let minZ = bed.zMin + fp.hz - fp.z + pad;
  let maxZ = bed.zMax - fp.hz - fp.z - pad;
  if (minX > maxX) { const mid = (bed.xMin + bed.xMax) * 0.5; minX = maxX = mid; }
  if (minZ > maxZ) { const mid = (bed.zMin + bed.zMax) * 0.5; minZ = maxZ = mid; }
  return { minX, maxX, minZ, maxZ, fp };
}

function cargoColliderBoxes(item) {
  if (item.colliderBoxes && item.colliderBoxes.length) return item.colliderBoxes;
  const collider = item.mesh && item.mesh.userData && item.mesh.userData.voxelCollider;
  const scale = item.mesh && item.mesh.scale ? item.mesh.scale.x : 1;
  if (collider && collider.boxes && collider.boxes.length) {
    return collider.boxes.map((box) => ({
      cx: box.cx * scale, cy: box.cy * scale, cz: box.cz * scale,
      hx: box.hx * scale, hy: box.hy * scale, hz: box.hz * scale
    }));
  }
  const c = item.localCenter || { x: 0, y: 0, z: 0 };
  const h = item.localHalf || item.half || { x: 0.05, y: 0.05, z: 0.05 };
  return [{ cx: c.x, cy: c.y, cz: c.z, hx: h.x, hy: h.y, hz: h.z }];
}

function worldCargoBoxes(item) {
  const yaw = item.localAng ? item.localAng.y : item.homeRot && item.homeRot.y || 0;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const boxes = (item.colliderBoxes || cargoColliderBoxes(item)).map((box) => ({
    x: item.localPos.x + c * box.cx + s * box.cz,
    z: item.localPos.z - s * box.cx + c * box.cz,
    y: item.localPos.y + box.cy,
    hx: box.hx, hy: box.hy, hz: box.hz, yaw
  }));
  const bounds = boxes.reduce((out, box) => {
    const hx = Math.abs(c) * box.hx + Math.abs(s) * box.hz;
    const hz = Math.abs(s) * box.hx + Math.abs(c) * box.hz;
    out.xMin = Math.min(out.xMin, box.x - hx);
    out.xMax = Math.max(out.xMax, box.x + hx);
    out.zMin = Math.min(out.zMin, box.z - hz);
    out.zMax = Math.max(out.zMax, box.z + hz);
    out.yMin = Math.min(out.yMin, box.y - box.hy);
    out.yMax = Math.max(out.yMax, box.y + box.hy);
    return out;
  }, { xMin: Infinity, xMax: -Infinity, zMin: Infinity, zMax: -Infinity, yMin: Infinity, yMax: -Infinity });
  boxes.bounds = bounds;
  return boxes;
}

function cargoBoundsOverlapXZ(aBoxes, bBoxes) {
  const a = aBoxes.bounds, b = bBoxes.bounds;
  return !a || !b || (a.xMin < b.xMax && a.xMax > b.xMin && a.zMin < b.zMax && a.zMax > b.zMin);
}

function cargoBoundsOverlap3D(aBoxes, bBoxes) {
  const a = aBoxes.bounds, b = bBoxes.bounds;
  return !a || !b || (a.xMin < b.xMax && a.xMax > b.xMin
    && a.zMin < b.zMax && a.zMax > b.zMin
    && a.yMin < b.yMax && a.yMax > b.yMin);
}

function cargoBoxOverlapXZ(a, b, pad = 0) {
  const ac = Math.cos(a.yaw), as = Math.sin(a.yaw);
  const bc = Math.cos(b.yaw), bs = Math.sin(b.yaw);
  const axes = [
    { x: ac, z: -as }, { x: as, z: ac },
    { x: bc, z: -bs }, { x: bs, z: bc }
  ];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const axis of axes) {
    const ar = a.hx * Math.abs(axis.x * ac - axis.z * as)
      + a.hz * Math.abs(axis.x * as + axis.z * ac);
    const br = b.hx * Math.abs(axis.x * bc - axis.z * bs)
      + b.hz * Math.abs(axis.x * bs + axis.z * bc);
    if (ar + br + pad - Math.abs(dx * axis.x + dz * axis.z) <= 0) return false;
  }
  return true;
}

function cargoBoxesOverlap(aBoxes, bBoxes, verticalPad = 0) {
  for (const a of aBoxes) {
    for (const b of bBoxes) {
      if (Math.min(a.y + a.hy, b.y + b.hy) - Math.max(a.y - a.hy, b.y - b.hy) <= verticalPad) continue;
      if (cargoBoxOverlapXZ(a, b)) return true;
    }
  }
  return false;
}

function computeCargoSupports(items, boxesByItem, maxGap = 0.035, maxPenetration = 0.085) {
  const supports = items.map((item) => ({ y: item.floorY, restY: item.floorY, by: null }));
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.spilled || a.hiddenForQuest) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.spilled || b.hiddenForQuest) continue;
      if (!cargoBoundsOverlapXZ(boxesByItem[i], boxesByItem[j])) continue;
      for (const ab of boxesByItem[i]) {
        const aBottom = ab.y - ab.hy;
        for (const bb of boxesByItem[j]) {
          if (Math.abs(ab.y - bb.y) > ab.hy + bb.hy + maxGap) continue;
          const bBottom = bb.y - bb.hy;
          const bTop = bb.y + bb.hy;
          const aCenterOnB = Math.abs(ab.x - bb.x) <= bb.hx + ab.hx * 0.15
            && Math.abs(ab.z - bb.z) <= bb.hz + ab.hz * 0.15;
          if (aBottom >= bTop - maxPenetration && aBottom <= bTop + maxGap
            && aCenterOnB && cargoBoxOverlapXZ(ab, bb)) {
            if (bTop > supports[i].y) supports[i] = { y: bTop, by: b };
          }
          const aTop = ab.y + ab.hy;
          const bCenterOnA = Math.abs(bb.x - ab.x) <= ab.hx + bb.hx * 0.15
            && Math.abs(bb.z - ab.z) <= ab.hz + bb.hz * 0.15;
          if (bBottom >= aTop - maxPenetration && bBottom <= aTop + maxGap
            && bCenterOnA && cargoBoxOverlapXZ(ab, bb)) {
            if (aTop > supports[j].y) supports[j] = { y: aTop, by: a };
          }
        }
      }
    }
  }
  return supports;
}


  // ============================================================
  //  VERLET ROPE — sag, tension, stretch-resist
  // ============================================================
  class Rope {
    constructor(scene, { segments = 18, thickness = 0.032, color = 0xb99760, gravity = -9.81 }) {
      this.scene = scene;
      this.segments = segments;
      this.thickness = thickness;
      this.gravity = gravity;
      this.points = [];
      this.prev = [];
      this.restLen = 0.1;
      this.taut = 0;

      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshLambertMaterial({ color });
      this.visible = true;
      this.meshes = [];
      for (let i = 0; i < segments; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = false;
        scene.add(m);
        this.meshes.push(m);
      }
      for (let i = 0; i <= segments; i++) {
        this.points.push(new THREE.Vector3());
        this.prev.push(new THREE.Vector3());
      }
    }

    reset(a, b, sag = 0.18, fixedLength = null) {
      // Panjang tali = jarak ujung + kelonggaran. Dulu panjangnya PERSIS jarak ujung,
      // jadi tali tanpa slack: begitu bak miring tajam dan ujung batang bergerak,
      // solver cuma bisa memendekkan segmen dan kelebihannya keluar sebagai busur
      // KE ATAS ("tali kuda ngebug naik"). Dengan slack, tali menggantung wajar.
      const span = fixedLength !== null ? fixedLength : Math.min(a.distanceTo(b) * 1.06 + 0.02, 4.0);
      this.restLen = span / this.segments;
      this.sag = sag;
      for (let i = 0; i <= this.segments; i++) {
        const t = i / this.segments;
        const p = this.points[i];
        p.lerpVectors(a, b, t);
        p.y -= Math.sin(Math.PI * t) * sag;
        this.prev[i].copy(p);
      }
      this.render();
    }

    reanchor(a, b) {
      // Smoothly move rope points to new anchors WITHOUT changing this.restLen
      const sag = this.sag ?? 0.16;
      for (let i = 0; i <= this.segments; i++) {
        const t = i / this.segments;
        const p = this.points[i];
        p.lerpVectors(a, b, t);
        p.y -= Math.sin(Math.PI * t) * sag;
        this.prev[i].copy(p);
      }
      this.render();
    }

    update(dt, aWorld, bWorld) {
      const pts = this.points, prev = this.prev, n = this.segments;
      // If endpoints teleported (> 4.5 m), re-seat along endpoints without stretching restLen
      if (aWorld.distanceTo(bWorld) > 4.5 || pts[0].distanceTo(aWorld) > 1.8 || pts[n].distanceTo(bWorld) > 1.8) {
        this.reanchor(aWorld, bWorld);
        return;
      }
      const dt2 = dt * dt;
      for (let i = 1; i < n; i++) {
        const p = pts[i], q = prev[i];
        const vx = (p.x - q.x) * 0.94;
        const vy = (p.y - q.y) * 0.94;
        const vz = (p.z - q.z) * 0.94;
        q.copy(p);
        p.x += vx;
        p.y += vy + this.gravity * dt2;
        p.z += vz;
      }
      pts[0].copy(aWorld);
      pts[n].copy(bWorld);

      const strainLimit = this.restLen * 1.04;
      for (let it = 0; it < 8; it++) {
        for (let i = 0; i < n; i++) {
          const p0 = pts[i], p1 = pts[i + 1];
          const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5;
          if (d <= strainLimit) continue;
          const diff = (d - this.restLen) / d;
          const w0 = i === 0 ? 0 : (i + 1 === n ? 2 : 1);
          const w1 = i + 1 === n ? 0 : (i === 0 ? 2 : 1);
          p0.x += dx * diff * 0.5 * (w0 / 1.5);
          p0.y += dy * diff * 0.5 * (w0 / 1.5);
          p0.z += dz * diff * 0.5 * (w0 / 1.5);
          p1.x -= dx * diff * 0.5 * (w1 / 1.5);
          p1.y -= dy * diff * 0.5 * (w1 / 1.5);
          p1.z -= dz * diff * 0.5 * (w1 / 1.5);
        }
        pts[0].copy(aWorld);
        pts[n].copy(bWorld);
      }

      // floor collision
      for (let i = 1; i < n; i++) {
        if (pts[i].y < this.thickness * 1.2) {
          pts[i].y = this.thickness * 1.2;
        }
      }

      /* Tali yang sudah teregang = GARIS LURUS.
         Constraint solver di atas hanya bisa memendekkan segmen. Kalau jarak ujung
         melebihi panjang total, sisa panjangnya dulu "dibuang" dengan melengkungkan
         rantai KE ATAS, jadi terlihat ngambang waktu bak miring tajam. Di sini rantai
         diproyeksikan ke garis ujung-ujung begitu slack hampir habis; sisa slack
         dipakai sebagai sag ke BAWAH (arah yang wajar buat tali). */
      {
        const spanT = aWorld.distanceTo(bWorld);
        const total = this.restLen * n;
        const slack = Math.max(0, total - spanT);
        if (slack < total * 0.30) {
          const k = slack < total * 0.02 ? 1 : 1 - slack / (total * 0.30);
          const sagLeft = Math.min(slack * 0.55, this.sag ?? 0.16);
          for (let i = 1; i < n; i++) {
            const t = i / n, p = pts[i];
            const lx = aWorld.x + (bWorld.x - aWorld.x) * t;
            const ly = aWorld.y + (bWorld.y - aWorld.y) * t - Math.sin(Math.PI * t) * sagLeft * (1 - k);
            const lz = aWorld.z + (bWorld.z - aWorld.z) * t;
            p.x += (lx - p.x) * k;
            p.y += (ly - p.y) * k;
            p.z += (lz - p.z) * k;
            prev[i].copy(p);
          }
        }
      }

      const straight = aWorld.distanceTo(bWorld);
      this.taut = Math.max(0, Math.min(1, (straight / (this.restLen * n) - 0.94) * 4));

      this.render();
    }

    render() {
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      for (let i = 0; i < this.segments; i++) {
        const p0 = this.points[i], p1 = this.points[i + 1];
        const m = this.meshes[i];
        dir.subVectors(p1, p0);
        const len = dir.length() || 1e-4;
        m.position.copy(p0).addScaledVector(dir, 0.5);
        m.quaternion.setFromUnitVectors(up, dir.normalize());
        m.scale.set(this.thickness, len * 1.06, this.thickness);
        m.visible = this.visible !== false;
      }
    }

    setVisible(v) {
      this.visible = !!v;
      for (const m of this.meshes) m.visible = this.visible;
    }
  }

  // ============================================================
  //  CART PHYSICS — 4 wheel independent suspension, rollover,
  //  cargo spill, drawbar spring
  // ============================================================
  class CartPhysics {
    constructor(cart, world, pivotY) {
      this.cart = cart;
      this.world = world;
      this.pivotY = pivotY;

      this.hitchDist = HC.hitchDist;
      this.pos = new THREE.Vector3(-this.hitchDist, 0, 0);
      this.vel = new THREE.Vector3();
      this.heave = 0;
      this.heaveVel = 0;
      this.groundY = 0;        // ketinggian tanah acuan di pusat gerobak (terrain follow)
      this._groundReady = false;
      this.roll = 0;
      this.rollV = 0;
      this.pitch = 0;
      this.pitchV = 0;
      this.yaw = 0;
      this.yawV = 0;
      this.flipAxis = 'roll';
      // bolster depan: poros roda depan bisa berputar di kingpin (turntable wagon beneran)
      this.axleYaw = 0;
      this.axleYawV = 0;

      this.mass = HC.cartBaseMass;
      this.Iroll = 105;
      this.Ipitch = 165;
      this.applySpec(cart);
      this.joltScale = 1;   // straps upgrade lowers this (cargo bounces less)
      this.damageScale = 1; // pengawal NPC di bangku buritan nurunin damage roda
      this.pullPowerScale = 1.0; // horse Pull Power stat multiplier
      const capMass = (cart.specs && cart.specs.capSpec && cart.specs.capSpec.massAdd) || 0;
      this.mass += capMass;
      this.flipped = false;
      this.flipDir = 0;
      this.flipCooldown = 0;
      this.hitched = true;
      this.unhitchedDroop = 0;
      this.liftProgress = 0;
      this.onFlip = null;
      this._envHit = { hit: false, nx: 0, nz: 0, pen: 0, hitType: null };

      this.wheels = cart.wheels.map((w) => ({
        ref: w,
        wa: new THREE.Vector3(w.localX, w.radius - pivotY, w.localZ),
        comp: 0,
        compVel: 0,
        contact: false,
        spin: 0,
        world: new THREE.Vector3(),
        hp: 100, hpMax: 100, broken: false, detached: false,
        _imp: 0, _lat: 0
      }));
      this.debris = [];        // roda yang lepas: ikut fisika sendiri (jatuh & berhenti)

      this.q = new THREE.Quaternion();
      this._lq = new THREE.Quaternion();
      this._lg = new THREE.Vector3();
      this._la = new THREE.Vector3();
      this.euler = new THREE.Euler(0, 0, 0, 'YZX');
      this._v = new THREE.Vector3();
      this._a1 = new THREE.Vector3();
      this._a2 = new THREE.Vector3();
      this._a3 = new THREE.Vector3();
      this._com = new THREE.Vector3();
      this._rp = new THREE.Vector3();
      this._om = new THREE.Vector3();
      this._hp = new THREE.Vector3();
      this._w1 = new THREE.Vector3();
      this._w2 = new THREE.Vector3();
      this._w3 = new THREE.Vector3();
      this._w4 = new THREE.Vector3();
      this._w5 = new THREE.Vector3();
      this._w6 = new THREE.Vector3();
      this._w8 = new THREE.Vector3();
      this._rebuildDims();
      this.initCargoItems();
    }

    // ============================================================
    //  RIGID-BODY CORE
    //  Gerobak = bodi dinamis penuh (posisi, yaw, roll, pitch, heave).
    //  Gaya yang bekerja cuma 3: (1) batang penarik pegas-damper,
    //  (2) kontak 4 roda (pegas suspensi + friksi ban),
    //  (3) kontak rangka ke tanah.
    //  Tidak ada lagi "kalau roll > limit lalu dipaksa terguling".
    // ============================================================
    _wrapAngle(a) {
      // Hati-hati: kalau `a` Infinity, loop while lama bakal muter selamanya
      // dan halaman nge-hang. Modulo dulu, plus buang nilai non-finite.
      if (!Number.isFinite(a)) return 0;
      a %= Math.PI * 2;
      if (a > Math.PI) a -= Math.PI * 2;
      if (a < -Math.PI) a += Math.PI * 2;
      return a;
    }

    _rebuildDims() {
      const S = HC.cartVS;
      const cap = (this.cart.specs && this.cart.specs.capSpec) || { bedHalfL: 28, bedHalfW: 15, railTopVox: 13.5 };
      const halfW = (cap.bedHalfW || 15) * S;
      const yRail = (cap.railTopVox || 13.5) * S - this.pivotY;

      // Titik kontak rangka: sudut atas dinding bak (kiri/kanan, depan/tengah/belakang)
      // Sengaja tidak pakai sudut bawah, supaya gerobak benar-benar bisa rebah dulu
      // sebelum rangka menyentuh tanah (bukan scraping di 10 derajat).
      const pts = [];
      const xs = [-((cap.bedHalfL || 28) * S) + 0.12, 0, (cap.bedHalfL || 28) * S * 0.55];
      for (const x of xs) {
        for (const z of [-halfW, halfW]) {
          pts.push(new THREE.Vector3(x, yRail, z));
          pts.push(new THREE.Vector3(x, yRail - 0.30, z));
        }
      }
      this.bodyPts = pts;

      // Massa & inersia dihitung dari dimensi gerobak (bukan angka sakti)
      const L = (cap.bedHalfL || 28) * 2 * S;
      const W = halfW * 2;
      const H = Math.max(1.0, (cap.railTopVox || 13.5) * S);
      this.mass = HC.cartBaseMass + ((cap.massAdd || 0));
      this.Iroll = this.mass * (W * W + H * H) / 12;
      this.Ipitch = this.mass * (L * L + H * H) / 12;
      this.Iyaw = this.mass * (L * L + W * W) / 12;
      this.comLocal = new THREE.Vector3(-L * 0.05, H * 0.44, 0);

      // Tali tarik (traces) nyambung dari sabuk perut kuda ke ujung singletree
      const bodyYOff = (this.cart && this.cart.body)
        ? this.cart.body.position.y
        : (0.42 * HC.cartScale - this.pivotY);
      this.traceLocal = [
        new THREE.Vector3(35.0 * S, 12.2 * S + bodyYOff, 9.2 * S),
        new THREE.Vector3(35.0 * S, 12.2 * S + bodyYOff, -9.2 * S)
      ];
      this.traceRest = [null, null];
      // Ujung batang penarik (thills) tepat di kalung kuda (mengacu HC.shaftTipVox)
      this.tipLocal = [
        new THREE.Vector3(HC.shaftTipVox * S, HC.shaftTipY * S, 5.0 * S),
        new THREE.Vector3(HC.shaftTipVox * S, HC.shaftTipY * S, -5.0 * S)
      ];
      this.tipMidLocal = new THREE.Vector3(HC.shaftTipVox * S, HC.shaftTipY * S, 0);
      this.tipRestLat = [0, 0];

      // sifat bahan sambungan (bisa di-upgrade nanti)
      this.kTrace = 62000;    // N/m — tali kulit + sabuk perut
      this.cTrace = 6200;     // N·s/m
      this.kThill = 36000;     // N/m — batang kayu menyalurkan gaya samping
      this.cThill = 6800;     // N·s/m
      this.tireLatK = 5600;   // N per m/s slip lateral
      this.tireMu = 0.86;

      // ---- bolster depan (turntable) ----
      // Roda depan nggak kaku nempel bodi: porosnya berputar di kingpin, diputar
      // oleh gaya samping batang penarik yang nyangkut di ujung poros.
      // Ini yang bikin gerobak belok kayak wagon beneran, bukan geser kaku.
      this.kingpinX = 16.0 * S;     // sumbu putar = garis poros depan
      this.Iaxle = 14;              // kg·m² (poros + 2 roda + singletree)
      this.kAxle = 34000;            // N·m/rad — balik ke tengah (geometri trek)
      this.cAxle = 4200;             // N·m·s/rad
      this.axleTrail = 0.07;        // m — jejak ban: bikin poros self-aligning
      // RODA TIDAK MEMBELOK. Keempat roda selalu segaris bodi (seperti wagon
      // barang beneran yang porosnya dipatri ke rangka). Belok terjadi karena
      // kuda menarik batang ke samping -> bodi yaw, ban nyeret, lalu bodi
      // miring ke luar tikungan. Kalau tikungannya terlalu tajam, miringnya
      // lewat titik kritis dan gerobak terguling.
      this.axleMax = 0;             // rad — 0 = poros dipatri, tidak ada steering
      // kemiringan badan saat belok (efek sentrifugal di titik berat)
      this.leanMax = 0.50;          // rad (~28,6°) plafon kemiringan mekanis
      this.leanPerG = 0.20;         // rad per m/s² percepatan lateral
      this.latLiftG = 5.5;          // m/s² — di atas ini roda dalam mulai terangkat
      this.leanDamp = 3.2;          // redaman biar tidak osilasi
      this.tipAccel = 0;            // 0 = pakai ambang geometri (m/s²)
      this._qAy = new THREE.Quaternion();
      this._w7 = new THREE.Vector3();
      this._w8 = new THREE.Vector3();
      this._axlePull = new THREE.Vector3();
      this._axleSing = new THREE.Vector3();
      this._qInv = new THREE.Quaternion();
    }

    _anchorFallback(horseX, horseZ, horseYaw, side, lx = 0.62, ly = 1.34, lz = 0.30) {
      const c = Math.cos(horseYaw), s = Math.sin(horseYaw);
      const zs = side * lz;
      return new THREE.Vector3(horseX + lx * c + zs * s, ly, horseZ - lx * s + zs * c);
    }

    _substep(h, horseYaw, hvx, hvz, hYawRate, hitchColL, hitchColR, hitchGirthL, hitchGirthR, horsePos) {
      const g = 9.81, m = this.mass;
      if (this.asleep && this.flipped) {
        this.vel.set(0, 0, 0);
        this.rollV = 0; this.pitchV = 0; this.yawV = 0; this.heaveVel = 0;
        const restSign = Math.sign(this.roll || this.flipDir || 1);
        this.roll = restSign * REST_ANG;
        this.pitch *= Math.exp(-8.0 * h);
        if (this._sleepHeave !== undefined) this.heave = this._sleepHeave;
        this._lying = true;
        return;
      }

      this.euler.set(this.roll, this.yaw, this.pitch, 'YZX');
      this.q.setFromEuler(this.euler);
      const q = this.q;
      const fwd = this._a1.set(1, 0, 0).applyQuaternion(q);
      const leftA = this._a2.set(0, 0, 1).applyQuaternion(q);
      const upA = this._a3.set(0, 1, 0).applyQuaternion(q);
      const rootY = this.groundY + this.pivotY + this.heave;
      const com = this._com.copy(this.comLocal).applyQuaternion(q).add(this._rp.set(this.pos.x, rootY, this.pos.z));

      const omega = this._om.copy(fwd).multiplyScalar(this.rollV)
        .addScaledVector(leftA, this.pitchV).addScaledVector(upA, this.yawV);

      let Fx = 0, Fy = 0, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
      const addForce = (fx, fy, fz, px, py, pz) => {
        Fx += fx; Fy += fy; Fz += fz;
        const rx = px - com.x, ry = py - com.y, rz = pz - com.z;
        const tr = ry * fz - rz * fy;
        Tx += tr;
        Ty += rz * fx - rx * fz;
        Tz += rx * fy - ry * fx;
        if (this._dbg) {
          const k = this._src || 'other';
          this._dbg[k] = (this._dbg[k] || 0) + tr;
          this._dbgN[k] = (this._dbgN[k] || 0) + (fz);
        }
      };
      // kecepatan sebuah titik material di bodi: v + ω × r
      const velAt = (px, py, pz, out) => {
        const rx = px - com.x, ry = py - com.y, rz = pz - com.z;
        return out.set(
          this.vel.x + (omega.y * rz - omega.z * ry),
          this.heaveVel + (omega.z * rx - omega.x * rz),
          this.vel.z + (omega.x * ry - omega.y * rx)
        );
      };

      const restSag = (m * g) / (4 * Math.max(1000, this.kSpring));

      // Bodi udah kelewat titik balik -> bukan lagi "miring", tapi REBAH.
      // Saat rebah roda & batang udah gak nanggung apa-apa: yang nyentuh tanah badan bak.
      // Kalau gaya roda/batang tetap dihitung, gerobak mental-mentul gak bisa diem.
      const lying = Math.abs(this.roll) > FLIP_ANG;
      this._lying = lying;

      // arah bolster depan (diputar axleYaw sekitar sumbu tegak bodi)
      const ca = Math.cos(this.axleYaw), sa = Math.sin(this.axleYaw);
      const fwdF = this._w7.set(fwd.x * ca + leftA.x * sa, fwd.y * ca + leftA.y * sa, fwd.z * ca + leftA.z * sa);
      const leftF = this._w8.set(leftA.x * ca - fwd.x * sa, leftA.y * ca - fwd.y * sa, leftA.z * ca - fwd.z * sa);

      // ---------- (2) kontak roda: axle rigid Lv1 / suspensi Lv2+ + friksi ban ----------
      this._src = 'wheel';
      for (const w of this.wheels) {
        if (lying || w.detached) { w.contact = false; continue; }   // rebah / roda lepas: gak napak
        // roda depan berputar mengelilingi kingpin saat bolster membelok
        let lx = w.wa.x, lz = w.wa.z;
        if (w.ref.front) {
          const dxk = w.wa.x - this.kingpinX;
          lx = this.kingpinX + dxk * ca - w.wa.z * sa;
          lz = dxk * sa + w.wa.z * ca;
        }
        const rl = this._w1.set(lx, w.wa.y, lz).applyQuaternion(q);
        const wx = this.pos.x + rl.x, wy = rootY + rl.y, wz = this.pos.z + rl.z;
        w.world.set(wx, wy, wz);
        const gh = this.world.wheelHeightAt(wx, wz, w.ref.radius);
        const pen = gh + w.ref.radius - wy;
        const impact = Math.max(0, pen);
        const hitTravel = Math.min(this.wheelTravel, impact);
        const springK = this.susRigid ? 0 : this.kSpring;
        const damperC = this.susRigid ? 0 : this.cDamp;
        w.contact = pen > -0.025;
        w.compTarget = this.susRigid ? 0 : Math.max(0, Math.min(hitTravel, this.wheelTravel));
        if (this.susRigid) {
          // Poros kaku: hanya pembatas penetrasi keras. Gak ada displacement
          // elastis; impuls benturan langsung ke rangka, menghasilkan heave/pitch.
          w.comp = 0;
          w.compVel = 0;
        } else {
          w.comp += (w.compTarget - w.comp) * Math.min(1, h * 28);
        }
        if (pen <= 0) continue;

        const vAt = velAt(wx, wy, wz, this._w2);
        const vn = vAt.x * upA.x + vAt.y * upA.y + vAt.z * upA.z;

        // ---- catat beban buat "nyawa" roda (diproses sekali per frame) ----
        // PENTING: cuma BENTURAN yang dihitung, bukan getaran kontak yang nyambung.
        // Dulu setiap frame kontak dipakai, jadi di poros kaku vn osilasi 4-8 m/s
        // terus -> HP roda habis puluhan detik cuma karena jalan kasar.
        if (!w.detached) {
          const hitDown = -vn;                       // makin besar = makin keras nyentuh tanah
          const freshHit = !w._wasContact || (pen - (w._prevPen ?? pen)) > 0.02;
          if (freshHit && hitDown > w._imp) w._imp = hitDown;
          w._prevPen = pen;
        }
        let N;
        if (this.susRigid) {
          /* Kontak poros kaku (Lv1): tidak ada langkah pegas, jadi seluruh
             ketinggian batu/kerikil langsung jadi gaya normal ke rangka.
             Kekakuan tinggi (90 kN/m, ~8x Lv2) = hentakan keras; redaman
             mendekati kritis supaya tidak memantul jadi "gerobak terbang". */
          N = 80000 * Math.min(pen, 0.08) - 18000 * vn;
          if (pen > 0.08) N += 3.5e5 * (pen - 0.08);
        } else {
          N = springK * Math.min(pen, 0.30) - damperC * vn;
          if (pen > 0.30) N += springK * 2.5 * (pen - 0.30);  // bump-stop (lembut, jangan ketapel)
        }
        if (N <= 0) continue;
        // plafon gaya normal: roda boleh nahan berat, tapi gak boleh nendang gerobak ke udara
        // bodi makin miring -> roda makin nggak boleh nyembur; gaya normal dipotong
        // sebanding cos(roll). Tanpa ini, roda sisi tanjakan jadi ketapel 9g.
        const aRollNow = Math.abs(this.roll);
        const capMul = this.susRigid ? 7.0 : 9.0;
        const nCap = (capMul * (m * g) / 4) * Math.max(0.15, Math.cos(Math.min(1.3, aRollNow)));
        N = Math.min(N, nCap);

        // arah gelinding & arah tahanan samping ban: roda depan ikut bolster, roda belakang tetap sejajar bak
        const wf = w.ref.front ? fwdF : fwd;
        const wl = w.ref.front ? leftF : leftA;
        const vLong = vAt.x * wf.x + vAt.y * wf.y + vAt.z * wf.z;
        // kecepatan samping ban depan juga kena tambahan karena poros sedang berputar (axleYawV)
        const vLatExtra = w.ref.front ? (-this.axleYawV * this.axleTrail) : 0;
        const vLat = (vAt.x * wl.x + vAt.y * wl.y + vAt.z * wl.z) + vLatExtra;
        const capF = this.tireMu * N;
        // ban depan di bolster lebih mudah mengikuti belokan dan melurus di belakang kuda
        const latScale = w.ref.front ? 0.35 : 1.05;
        let fLat = -vLat * (this.tireLatK * latScale);
        fLat = Math.max(-capF, Math.min(capF, fLat));
        let fLong = -Math.sign(vLong) * Math.min(Math.abs(vLong) * 420, 0.055 * N);
        fLong = Math.max(-capF * 0.85, Math.min(capF * 0.85, fLong));
        // beban samping (nabrak batu / nyeret miring) juga bikin roda rusak
        if (!w.detached) {
          const latLoad = Math.abs(fLat) + Math.abs(fLong);
          if (latLoad > w._lat) w._lat = latLoad;
        }

        // Gaya normal (suspensi) di pusat roda, gaya ban (gesek) di TAPAK = nempuh tanah.
        // Ini yang bikin gerobak benar-benar nge-roll & bisa guling di tikungan/landai:
        // gaya gesek samping yang bekerja jauh di bawah titik berat punya lengan momen besar.
        addForce(upA.x * N, upA.y * N, upA.z * N, wx, wy, wz);
        addForce(
          wl.x * fLat + wf.x * fLong,
          wl.y * fLat + wf.y * fLong,
          wl.z * fLat + wf.z * fLong,
          wx, gh, wz
        );
      }

      // ---------- (1a) TALI TARIK (traces): sabuk perut kuda -> singletree gerobak ----------
      // Aktif hanya saat kuda terikat (hitched).
      this._src = 'trace';
      if (lying) { this.vel.x *= 0.995; this.vel.z *= 0.995; }   // kuda gak bisa nggeret gerobak rebah
      if (!this.traceRest) this.traceRest = [null, null];
      const girths = [hitchGirthL, hitchGirthR];
      if (this.hitched && !lying && (this.traceRest[0] == null || !isFinite(this.traceRest[0])) && girths[0] && girths[1]) {
        // Panjang istirahat kiri & kanan HARUS identik agar tidak pernah mengunci tarikan miring
        let sumL = 0;
        for (let i = 0; i < 2; i++) {
          const rl0 = this._w3.copy(this.traceLocal[i]).applyQuaternion(q);
          sumL += Math.hypot(
            (this.pos.x + rl0.x) - girths[i].x,
            (rootY + rl0.y) - girths[i].y,
            (this.pos.z + rl0.z) - girths[i].z
          );
        }
        const symRest = Math.max(1.2, Math.min(3.2, sumL * 0.5));
        this.traceRest[0] = symRest;
        this.traceRest[1] = symRest;
      }
      if (this.hitched) {
        for (let i = 0; i < 2; i++) {
          const A = girths[i];
          if (!A || lying) continue;
          const rl = this._w3.copy(this.traceLocal[i]).applyQuaternion(q);
          const bx = this.pos.x + rl.x, by = rootY + rl.y, bz = this.pos.z + rl.z;
          const dx = bx - A.x, dy = by - A.y, dz = bz - A.z;
          const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (!(L > 1e-4)) continue;
          const nx = dx / L, ny = dy / L, nz = dz / L;
          if (this.traceRest[i] == null || !isFinite(this.traceRest[i])) this.traceRest[i] = L;

          const rAx = A.x - horsePos.x, rAz = A.z - horsePos.z;
          const vAx = hvx + hYawRate * rAz;
          const vAz = hvz - hYawRate * rAx;
          const vB = velAt(bx, by, bz, this._w4);
          const relN = (vAx - vB.x) * nx + (0 - vB.y) * ny + (vAz - vB.z) * nz;

          // damping: laju regangan = (vB - vA)·n  ->  -cTrace*relN
          const pwr = this.pullPowerScale || 1.0;
          let F = this.kTrace * pwr * (L - this.traceRest[i]) - this.cTrace * relN;
          F = Math.max(0, Math.min(22000 * pwr, F));
          if (F > 0) {
            const fyPull = -ny * F * 0.20;
            const applyY = Math.min(by, com.y + 0.02);
            addForce(-nx * F, fyPull, -nz * F, bx, applyY, bz);
          }
        }
      }

      // Permintaan percepatan sentripetal dari gerak kuda (nol saat kuda dilepas).
      this._hSpeed = this.hitched ? Math.hypot(hvx, hvz) : 0;
      this._aLatDemand = this._hSpeed * (this.hitched ? hYawRate : 0);

      // ---------- (1b) BATANG PENARIK (thills) + BREECHING (rem mundur) + SELF-ALIGN ----------
      this._src = 'thill';
      const latX = leftA.x, latZ = leftA.z;
      const hfx = Math.cos(horseYaw), hfz = -Math.sin(horseYaw);
      const axleY = rootY + (this.wheels[0] ? this.wheels[0].wa.y : 0.28);
      if (this.hitched && !lying && hitchColL && hitchColR) {
        const colMidX = (hitchColL.x + hitchColR.x) * 0.5;
        const colMidZ = (hitchColL.z + hitchColR.z) * 0.5;
        const rlMid = this._w5.copy(this.tipMidLocal).applyQuaternion(q);
        const bx = this.pos.x + rlMid.x, by = rootY + rlMid.y, bz = this.pos.z + rlMid.z;

        const rCx = colMidX - horsePos.x, rCz = colMidZ - horsePos.z;
        const vCx = hvx + hYawRate * rCz;
        const vCz = hvz - hYawRate * rCx;
        const vB = velAt(bx, by, bz, this._w6);

        // 1) Gaya pemusat lateral batang ke kalung (rest = 0 murni, simetris)
        const dLat = (bx - colMidX) * latX + (bz - colMidZ) * latZ;
        const relLat = (vCx - vB.x) * latX + (vCz - vB.z) * latZ;
        let fLatThill = -this.kThill * 1.45 * dLat + this.cThill * 1.45 * relLat;
        fLatThill = Math.max(-26000, Math.min(26000, fLatThill));
        addForce(latX * fLatThill, 0, latZ * fLatThill, bx, axleY, bz);

        // 2) Breeching (rem belakang batang tarik) saat gerobak menyusul kuda yang ngerem,
        // atau mendorong mundur gerobak secara halus ketika kuda mundur terikat.
        const hFwdSpeed = hvx * hfx + hvz * hfz;
        const overRun = (bx - colMidX) * hfx + (bz - colMidZ) * hfz;
        const relFwd = (vB.x - vCx) * hfx + (vB.z - vCz) * hfz;
        const revEngage = hFwdSpeed < -0.05 && (overRun > -0.02 || relFwd > 0.02);
        if (overRun > 0.03 || (this._hSpeed < 0.35 && relFwd > 0.04) || revEngage) {
          const comp = Math.max(0, overRun - (revEngage ? -0.02 : 0.03));
          let fBrake = comp * 44000 + Math.max(0, relFwd) * 9500;
          if (this._hSpeed < 0.25 && relFwd > 0) fBrake += relFwd * 3200;
          fBrake = Math.min(30000, fBrake);
          if (fBrake > 0) addForce(-hfx * fBrake, 0, -hfz * fBrake, com.x, com.y, com.z);
        }

        // 3) Torsi penyearah alami (self-aligning trail): hidung gerobak selalu meluruskan diri ke kalung
        const toColX = colMidX - this.pos.x;
        const toColZ = colMidZ - this.pos.z;
        const toColDist = Math.hypot(toColX, toColZ);
        if (toColDist > 1.2) {
          const wantYaw = Math.atan2(-toColZ, toColX);
          const yawErr = this._wrapAngle(wantYaw - this.yaw);
          const tAlign = Math.max(-14000, Math.min(14000, 11000 * yawErr - 2600 * this.yawV));
          Ty += tAlign;
        }

        // 4) Tarikan pemusat lembut di jalur lurus maju supaya gerobak cepat kembali di belakang kuda
        if (hFwdSpeed > 0.35 && Math.abs(hYawRate) < 0.15) {
          const hLx = -hfz, hLz = hfx;
          const latOff = (this.pos.x - horsePos.x) * hLx + (this.pos.z - horsePos.z) * hLz;
          const fCenter = Math.max(-4500, Math.min(4500, -latOff * 2200));
          addForce(hLx * fCenter, 0, hLz * fCenter, this.pos.x, axleY, this.pos.z);
        }

        // 5) Redaman parkir halus saat kuda benar-benar berhenti agar gerobak cepat tenang
        if (this._hSpeed < 0.08) {
          const vCartMag = Math.hypot(this.vel.x, this.vel.z);
          if (vCartMag > 0.01) {
            const parkDamp = Math.min(12000, vCartMag * 3600);
            addForce(-(this.vel.x / vCartMag) * parkDamp, 0, -(this.vel.z / vCartMag) * parkDamp, com.x, com.y, com.z);
          }
        }
      } else if (!this.hitched && !lying) {
        // Gerobak diparkir tanpa kuda: rem parkir kuat menahan agar tidak menggelinding
        const vCartMag = Math.hypot(this.vel.x, this.vel.z);
        if (vCartMag > 0.008) {
          const parkDamp = Math.min(16000, vCartMag * 4800);
          addForce(-(this.vel.x / vCartMag) * parkDamp, 0, -(this.vel.z / vCartMag) * parkDamp, com.x, com.y, com.z);
        }
        this.yawV *= Math.exp(-5.0 * h);
      }

      // ---------- (2b) GEROBAK vs KUDANYA SENDIRI ----------
      // Kuda itu kinematic (posisinya dari animator), jadi nggak bisa diselesaikan
      // pakai pegas di sini: di turunan, satu frame bisa bikin bak masuk 0.5 m ke
      // badan kuda. Penanganannya ada di _resolveHorseContact() setelah substep
      // loop: koreksi posisi + pembatalan kecepatan (collider keras).

      // ---------- (3) kontak rangka ke tanah ----------
      this._src = 'body';
      for (const bp of this.bodyPts) {
        const rl = this._w5.copy(bp).applyQuaternion(q);
        const px = this.pos.x + rl.x, py = rootY + rl.y, pz = this.pos.z + rl.z;
        // begitu rebah, badan bak bersandar ke tanah rata samping jalan (bukan di punggung ramp),
        // supaya sisi bak nggak melorot-lorot di lereng batu
        // permukaan acuan saat rebah = terrain di titik itu (bukan y=0 rata)
        const gh = lying ? this.groundY : this.world.heightAt(px, pz);
        const pen = gh - py;
        if (pen <= 0) continue;
        const vp = velAt(px, py, pz, this._w6);
        let N = 46000 * pen - (lying ? 3400 : 1400) * vp.y;
        if (N <= 0) continue;
        const capF = 0.72 * N;
        let fpx = -vp.x * 900, fpz = -vp.z * 900;
        const mag = Math.hypot(fpx, fpz);
        if (mag > capF && mag > 1e-6) { fpx *= capF / mag; fpz *= capF / mag; }
        if (lying || this.flipped) {
          Fx += fpx; Fy += N; Fz += fpz;
        } else {
          addForce(fpx, N, fpz, px, py, pz);
        }
      }

      // ---------- integrasi ----------
      const ax = Fx / m, az = Fz / m;
      this.vel.x += ax * h;
      this.vel.z += az * h;
      this.heaveVel += (Fy / m - g) * h;

      const dragL = Math.exp(-0.16 * h);
      this.vel.x *= dragL; this.vel.z *= dragL;

      const tRoll = Tx * fwd.x + Ty * fwd.y + Tz * fwd.z;
      let tPitch = Tx * leftA.x + Ty * leftA.y + Tz * leftA.z;
      let tYaw = Tx * upA.x + Ty * upA.y + Tz * upA.z;
      if (lying || this.flipped) {
        tPitch *= 0.06;
        tYaw *= 0.04;
      }

      this.rollV += (tRoll / this.Iroll) * h;
      this.pitchV += (tPitch / this.Ipitch) * h;
      this.yawV += (tYaw / this.Iyaw) * h;

      // ---------- (4) GRAVITASI SEBAGAI PENGGULING ----------
      // Selama titik berat masih di dalam garis roda, gaya normal roda yang menahan.
      // Tapi begitu roll lewat sudut kritis (atan(b/h)), proyeksi titik berat keluar dari
      // garis roda -> berat bodi sendiri jadi momen pengguling. Tanpa suku ini bodi cuma
      // miring lalu balik lagi (pegas suspensi selalu menang), jadi gerobak "gak bisa guling".
      {
        if (!this._halfTrack || this._halfTrack < 0.1) {
          let z = 0.5;
          for (const w of this.wheels) z = Math.max(z, Math.abs(w.wa.z));
          this._halfTrack = z;
        }
        const hCom = Math.max(0.35, com.y - this.groundY);   // tinggi titik berat di atas tapak
        // Transfer beban: saat tikungan kencang, beban pindah ke roda luar dan
        // roda dalam mulai terangkat -> lengan penahan efektif menyusut. Ini yang
        // bikin tikungan sangat tajam bisa menggulingkan gerobak.
        const aLatAbs = Math.abs(this._aLatDemand || 0);
        const ltFactor = Math.max(0.14, 1 - aLatAbs / (this.latLiftG || 5.5));
        const bEff = this._halfTrack * 0.62 * ltFactor;
        const crit = Math.atan2(bEff, hCom);
        const aR = Math.abs(this.roll);
        this._tipCrit = crit;
        this._tipArm = hCom * Math.sin(aR) - bEff * Math.cos(aR);
        // Hanya dorong guling oleh gravitasi jika kemiringan sudah ekstrem (>55°) dan titik berat melewati garis roda
        if (this._tipArm > 0 && aR > 55 * Math.PI / 180 && !lying) {
          this.rollV += Math.sign(this.roll) * (m * g * this._tipArm / this.Iroll) * h * 1.8;
        }
        this._tipGravT = 0;
      }

      // redaman struktur ringan (bukan "ditarik ke nol")
      const aDrag = Math.exp(-0.25 * h);
      this.rollV *= aDrag; this.pitchV *= aDrag; this.yawV *= aDrag;
      if (lying || this.flipped) {
        // rebah di tanah: gesekan badan + muatan nyeret -> redaman gede, cepat berhenti
        const gDrag = Math.exp(-3.8 * h);
        this.vel.x *= gDrag; this.vel.z *= gDrag;
        this.rollV *= Math.exp(-5.0 * h);
        this.pitchV *= Math.exp(-7.5 * h);
        this.yawV *= Math.exp(-8.5 * h);
        this.pitch *= Math.exp(-4.5 * h);
        if (this.rollV * Math.sign(this.roll) > 0) this.rollV *= Math.exp(-6.0 * h);
      }
      // clamp kecepatan: gerobak rebah/mau rebah gak boleh kelacak atau muter sendiri
      const vMax = lying ? 1.8 : (this.flipped ? 3.5 : 9.0);
      const vMag = Math.hypot(this.vel.x, this.vel.z);
      if (vMag > vMax) { const sc = vMax / vMag; this.vel.x *= sc; this.vel.z *= sc; }
      if (lying && vMag < 0.18) { this.vel.x = 0; this.vel.z = 0; }   // udah diem ya diem
      this.heaveVel = Math.max(-7, Math.min(7, this.heaveVel));
      const rvCap = lying ? 12 : 3.2;   // sebelum rebah: miringnya keg see, bukan keplak
      const pvCap = lying ? 1.0 : (this.flipped ? 2.5 : 12);
      const yvCap = lying ? 0.6 : (this.flipped ? 1.5 : 6);
      this.rollV = Math.max(-rvCap, Math.min(rvCap, this.rollV));
      this.pitchV = Math.max(-pvCap, Math.min(pvCap, this.pitchV));
      this.yawV = Math.max(-yvCap, Math.min(yvCap, this.yawV));

      // ---- bolster depan: castor yang ngejar arah tarikan ----
      // Poros depan bebas berputar di kingpin; tali (traces) dari sabuk perut kuda
      // menarik singletree, jadi poros selalu menyelaraskan diri ke arah tarik itu.
      // Ini constraint beneran (castor), bukan animasi: gerobak belok karena porosnya
      // dipaksa sejajar tali, bukan karena bodinya diputar script.
      // titik singletree (pusat ikatan tali) di dunia, ikut putaran bolster
      {
        const cmx = (this.traceLocal[0].x + this.traceLocal[1].x) * 0.5;
        const cmy = (this.traceLocal[0].y + this.traceLocal[1].y) * 0.5;
        this._axleSing.set(
          this.kingpinX + (cmx - this.kingpinX) * ca,
          cmy,
          0
        ).applyQuaternion(q).add(this._rp.set(this.pos.x, rootY, this.pos.z));
      }
      // Arah yang "benar" buat roda depan = arah gerak titik poros depan itu sendiri.
      // Poros depan yang bebas (castor + trail) selalu nyari posisi ini: ban depan
      // nggak nyeret, jadi gerobak belok mulus ngikutin kuda tanpa ngelawan.
      // Roda depan di poros putar (kingpin) selaras dengan arah lari titik poros itu sendiri
      // + arah kalung kuda (karena batang nyangkut di poros depan). Jadi ban depan menggelinding
      // ke arah belok, sementara roda belakang tetap lurus ke bak -> bak ngikutin dengan trail alami.
      // Poros dipatri: tidak ada castor, tidak ada steering. axleYaw selalu 0,
      // jadi keempat roda tetap sejajar bodi berapa pun tajam beloknya.
      this.axleYaw = 0;
      this.axleYawV = 0;

      // Begitu latch guling aktif, kontak roda TIDAK boleh melawan jatuhnya:
      // tanpa ini torsi kontak (penetrasi roda sisi luar) menahan bodi tegak
      // selamanya dan gerobak "tidak mau terguling" di tanjakan curam.
      if (this._tipLatched && !lying) this.rollV = 0;
      this.roll += this.rollV * h;
      // ---- rebah sekali jalan ----
      // Begitu bodi lewat titik balik (~52 deg), udah gak ada gaya yang bisa balikin:
      // gravitasi + muatan narik ke samping. Jadi dibiarin jatuh ke samping SEKALI,
      // lenturannya diredam, lalu berhenti rebah (~90 deg). Bukan diputer script:
      // sudut picunya tetap dari fisika (roll beneran lewat titik kritis).
      if (this.flipped && Math.abs(this.roll) > LAY_ANG) {
        const tgt = Math.sign(this.roll) * REST_ANG;
        this.roll += (tgt - this.roll) * Math.min(1, 7.5 * h);
        this.rollV *= Math.exp(-7.0 * h);
        this.pitch *= Math.exp(-4.5 * h);
      }
      const ROLL_REST = REST_ANG + 0.02;
      if (Math.abs(this.roll) > ROLL_REST) {
        this.roll = Math.sign(this.roll) * ROLL_REST;
        this.rollV = 0;
      }
      /* ---- kemiringan badan saat belok ----
         Percepatan sentrifugal a_lat = v * yawRate bekerja di titik berat,
         sementara ban menahan di tapak (bawah). Selisih lengan itu yang bikin
         bodi miring KE LUAR tikungan — persis wagon beneran. Karena roda tidak
         membelok, ban nyeret lebih banyak saat tikungan tajam, jadi momennya
         juga membesar sampai gerobak bisa terguling. */
      {
        // kecepatan maju dihitung langsung dari state (this.forwardSpeed baru
        // diisi setelah substep selesai -> kalau dipakai di sini nilainya NaN
        // di substep pertama dan meracuni seluruh gerobak)
        const vFwdNow = this.vel.x * fwd.x + this.vel.z * fwd.z;
        // pakai permintaan kuda kalau ada (lebih stabil), fallback ke yawV bodi
        const aLat = (Math.abs(this._aLatDemand) > 0.05)
          ? this._aLatDemand
          : vFwdNow * this.yawV;                              // m/s², arah lateral bodi
        const aLatAbs = Math.abs(aLat);
        if (!this.flipped && !lying && aLatAbs > 0.05) {
          /* Bodi miring KE LUAR tikungan, sebanding percepatan sentrifugal.
             Dipakai target sudut + pegas, bukan torsi mentah: torsi mentah
             bikin miringnya numpuk terus (tikungan pelan pun jadi doyong).
             Batas atasnya yang menentukan takdir: kalau target melewati sudut
             kritis (setelah transfer beban menyempitkan lengan penahan),
             suku gravitasi di atas mengambil alih dan gerobak terguling. */
          const rollTgt = -Math.sign(aLat) * Math.min(this.leanMax, aLatAbs * this.leanPerG);
          const kDrive = 26, cDrive = 7.5;
          this.rollV += ((rollTgt - this.roll) * kDrive - this.rollV * cDrive) * h;
        }

        // Batas guling ditentukan langsung oleh sudut kemiringan 80° (FLIP_ANG), bukan timer tikungan prematur
        this._tipT = 0;
        if (this.flipped && Math.abs(this.roll) < LAY_ANG) {
          if (this._tipLatched) {
            /* Terguling karena tikungan: sudut sudah lewat batas stabilitas, jadi
               tidak ada lagi penahan. Bodi DIPUTAR turun ke samping dengan laju
               tetap (bukan animasi: ini konsekuensi sudut kritis yang sudah
               dilewati, sama seperti gerobak asli yang jatuh sekali jalan).
               Pegas roda tidak boleh melawan, jadi rollV dinolkan dulu. */
            this.rollV = 0;
            this.roll += (this.flipDir || 1) * 2.2 * h;
          } else {
            this.rollV += (this.flipDir || 1) * 6.0 * h;
          }
        }
      }
      this.pitch += this.pitchV * h;
      if (lying || this.flipped) this.pitch = Math.max(-0.42, Math.min(0.42, this.pitch));
      this.yaw = this._wrapAngle(this.yaw + this.yawV * h);
      this.heave += this.heaveVel * h;

      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;

      // ---- tidur: rebah + udah pelan -> kunci total di tempat ----
      // Tanpa ini, kontak rangka (pegas 46 kN/m di 18 titik) bikin bodi getar & ngeloyor
      // pelan-pelan selamanya. Kuda juga udah berhenti, jadi emang gak ada yang narik.
      if (lying) {
        const vNow = Math.hypot(this.vel.x, this.vel.z);
        if (Math.abs(this.roll) >= REST_ANG - 0.06 && vNow < 0.35) this._sleepT = 1.0;
        else if (vNow < 1.0 && Math.abs(this.rollV) < 0.9) this._sleepT += h;
        else this._sleepT = 0;
        if (this._sleepT > 0.30) {
          if (!this.asleep) this._sleepHeave = this.heave;   // kunci tinggi rebahnya
          this.asleep = true;
          this.vel.set(0, 0, 0);
          this.rollV = 0; this.pitchV = 0; this.yawV = 0; this.heaveVel = 0;
          if (this._sleepHeave !== undefined) this.heave = this._sleepHeave;
        }
      } else {
        this._sleepT = 0; this.asleep = false; this._sleepHeave = undefined;
      }

      // rangka tidak boleh nembus tanah
      const minY = -this.pivotY * 0.52;
      if (this.heave < minY) {
        this.heave = minY;
        if (this.heaveVel < 0) this.heaveVel *= -0.22;
      }
      // hard cap: rangka poros kaku tidak boleh terangkat lebih dari ~1 roda
      if (this.heave > 0.34) {
        this.heave = 0.34;
        if (this.heaveVel > 0) this.heaveVel *= 0.4;
      }

      // jackknife: batang mentok pinggang kuda (aktif hanya saat kuda terikat)
      const dJack = this._wrapAngle(this.yaw - horseYaw);
      const maxJack = 0.58;
      if (this.hitched && Math.abs(this.roll) < LAY_ANG && Math.abs(dJack) > maxJack) {
        const sg = Math.sign(dJack);
        this.yaw = this._wrapAngle(horseYaw + sg * maxJack);
        if (this.yawV * sg > 0) this.yawV *= -0.25;
      }

    }

    /* Kuda = collider KERAS 3 lapis (pembatas longitudinal buritan + kotak badan
       kuda + pembatas amplop hitch), dipanggil di setiap substep supaya gerobak
       tidak pernah tembus ke kuda saat kuda mengerem mendadak di kecepatan tinggi. */
    _resolveHorseContact(horseX, horseZ, horseYaw, hvx, hvz) {
      if (!this.hitched || this.flipped || this._lying) { this._horsePen = 0; return; }
      this.euler.set(this.roll, this.yaw, this.pitch, 'YZX');
      this.q.setFromEuler(this.euler);
      const q = this.q, Sv = HC.cartVS;
      const capH = (this.cart.specs && this.cart.specs.capSpec) || {};
      const frontX = (capH.bedFrontX ?? 24) * Sv;
      const halfWz = (capH.bedHalfW ?? 15) * Sv;
      const fX = Math.cos(horseYaw), fZ = -Math.sin(horseYaw);   // maju kuda
      const lX = -fZ, lZ = fX;                                    // kiri kuda

      // Pass 1: Jarak aman longitudinal di belakang buritan kuda (tanpa batas 0.30 m)
      const HORSE_REAR = 1.12;
      const edgeZ = [-halfWz, -halfWz * 0.5, 0, halfWz * 0.5, halfWz];
      let maxOver = 0;
      for (const pz of edgeZ) {
        const rl = this._w7.set(frontX, 0, pz).applyQuaternion(q);
        const dx = (this.pos.x + rl.x) - horseX;
        const dz = (this.pos.z + rl.z) - horseZ;
        const lf = dx * fX + dz * fZ;
        const over = lf + HORSE_REAR;
        if (over > maxOver) maxOver = over;
      }
      if (maxOver > 0) {
        this.pos.x -= fX * maxOver;
        this.pos.z -= fZ * maxOver;
        const relF = (this.vel.x - hvx) * fX + (this.vel.z - hvz) * fZ;
        if (relF > 0) {
          this.vel.x -= fX * relF;
          this.vel.z -= fZ * relF;
        }
        this.yawV *= 0.6;
        this.pitchV = Math.min(this.pitchV, 0.5);
      }

      // Pass 2: Penjaga kotak badan kuda penuh (front + mid-front; jangan dorong maju ke depan kuda)
      const HL = 1.08, HW = 0.52;
      const boxPts = [
        [frontX, 0], [frontX, halfWz], [frontX, -halfWz],
        [frontX, halfWz * 0.5], [frontX, -halfWz * 0.5],
        [frontX * 0.55, halfWz * 1.05], [frontX * 0.55, -halfWz * 1.05]
      ];
      let boxPen = 0, nX = 0, nZ = 0;
      for (const p of boxPts) {
        const rl = this._w7.set(p[0], 0, p[1]).applyQuaternion(q);
        const dx = (this.pos.x + rl.x) - horseX;
        const dz = (this.pos.z + rl.z) - horseZ;
        const lf = dx * fX + dz * fZ;
        const ll = dx * lX + dz * lZ;
        const of = HL - Math.abs(lf);
        const ol = HW - Math.abs(ll);
        if (of <= 0 || ol <= 0) continue;
        let pn, nf = 0, nl = 0;
        if (of <= ol && lf < 0.25) {
          // Tolak ke belakang kuda (-fX, -fZ), jangan pernah melempar bak ke depan (+fX)
          pn = lf + HL;
          nf = -1;
        } else if (ol < of) {
          pn = ol;
          nl = ll >= 0 ? 1 : -1;
        } else {
          pn = lf + HL;
          nf = -1;
        }
        if (pn > boxPen) { boxPen = pn; nX = fX * nf + lX * nl; nZ = fZ * nf + lZ * nl; }
      }
      if (boxPen > 0.002) {
        this.pos.x += nX * boxPen;
        this.pos.z += nZ * boxPen;
        const vn = this.vel.x * nX + this.vel.z * nZ;
        const hv = hvx * nX + hvz * nZ;
        if (vn < hv) {
          this.vel.x += nX * (hv - vn);
          this.vel.z += nZ * (hv - vn);
        }
        const relF = (this.vel.x - hvx) * fX + (this.vel.z - hvz) * fZ;
        if (relF > 0) {
          this.vel.x -= fX * relF;
          this.vel.z -= fZ * relF;
        }
      }

      // Pass 3: Pembatas amplop hitch supaya gerobak tidak melenceng ekstrem atau putus terlalu jauh
      const dxC = this.pos.x - horseX, dzC = this.pos.z - horseZ;
      const latC = dxC * lX + dzC * lZ;
      if (Math.abs(latC) > 2.2) {
        const sgL = Math.sign(latC);
        const overL = Math.abs(latC) - 2.2;
        this.pos.x -= lX * sgL * overL;
        this.pos.z -= lZ * sgL * overL;
        const vLat = (this.vel.x - hvx) * lX + (this.vel.z - hvz) * lZ;
        if (vLat * sgL > 0) {
          this.vel.x -= lX * vLat;
          this.vel.z -= lZ * vLat;
        }
      }
      const dxR = this.pos.x - horseX, dzR = this.pos.z - horseZ;
      const distC = Math.hypot(dxR, dzR);
      const maxDist = (this.hitchDist || HC.hitchDist) + 1.3;
      if (distC > maxDist && distC > 1e-4) {
        const rx = dxR / distC, rz = dzR / distC;
        const overR = distC - maxDist;
        this.pos.x -= rx * overR;
        this.pos.z -= rz * overR;
        const vRad = (this.vel.x - hvx) * rx + (this.vel.z - hvz) * rz;
        if (vRad > 0) {
          this.vel.x -= rx * vRad;
          this.vel.z -= rz * vRad;
        }
      }

      this._horsePen = Math.max(0, maxOver, boxPen);
    }

    _resolveEnvCollisions() {
      if (this.asleep && this.flipped) {
        this._envHit.hit = false;
        this._envHit.pen = 0;
        this._envHit.hitType = null;
        return;
      }
      if (!this.world || typeof this.world.resolveCircleCollision !== 'function') {
        this._envHit.hit = false;
        this._envHit.pen = 0;
        this._envHit.hitType = null;
        return;
      }
      this.euler.set(this.roll, this.yaw, this.pitch, 'YZX');
      this.q.setFromEuler(this.euler);
      const q = this.q, Sv = HC.cartVS;
      const capH = (this.cart.specs && this.cart.specs.capSpec) || {};
      const frontX = (capH.bedFrontX ?? 24) * Sv;
      const rearX = (capH.bedRearX ?? -24) * Sv;
      const midX = (frontX + rearX) * 0.5;
      const wLat = this.wheels && this.wheels[0] ? Math.abs(this.wheels[0].wa.z) + 0.06 : 1.02;
      const halfW = Math.max((capH.bedHalfW ?? 15) * Sv, wLat);
      const hullPts = [
        [frontX, halfW], [frontX, 0], [frontX, -halfW],
        [midX, halfW], [midX, -halfW],
        [rearX, halfW], [rearX, 0], [rearX, -halfW],
      ];
      let hit = false, bestNx = 0, bestNz = 0, bestPen = 0, hitType = null;
      let pushX = 0, pushZ = 0, torqueY = 0;
      const footY = this.groundY - 0.35;
      const tmp = this._w8 || (this._w8 = new THREE.Vector3());
      for (let i = 0; i < hullPts.length; i++) {
        const p = hullPts[i];
        const rl = tmp.set(p[0], 0, p[1]).applyQuaternion(q);
        const wx = this.pos.x + rl.x, wz = this.pos.z + rl.z;
        const res = this.world.resolveCircleCollision(wx, wz, 0.28, footY);
        if (res.hit) {
          const px = res.x - wx, pz = res.z - wz;
          hit = true;
          if (Math.abs(px) > Math.abs(pushX)) pushX = px;
          if (Math.abs(pz) > Math.abs(pushZ)) pushZ = pz;
          torqueY += (rl.z * px - rl.x * pz);
          if (res.pen > bestPen) {
            bestPen = res.pen;
            bestNx = res.nx;
            bestNz = res.nz;
            hitType = res.hitType;
          }
        }
      }
      this._envHit.hit = hit;
      this._envHit.nx = bestNx;
      this._envHit.nz = bestNz;
      this._envHit.pen = bestPen;
      this._envHit.hitType = hitType;
      if (hit) {
        this.pos.x += pushX;
        this.pos.z += pushZ;
        const vn = this.vel.x * bestNx + this.vel.z * bestNz;
        if (vn < 0) {
          const bounce = vn * 1.12;
          this.vel.x -= bestNx * bounce;
          this.vel.z -= bestNz * bounce;
        }
        if (!this.flipped && !this._lying) {
          this.yawV = Math.max(-1.8, Math.min(1.8, this.yawV + Math.max(-0.5, Math.min(0.5, torqueY * 1.4))));
        }
      }
    }

    update(dt, horseX, horseSpeed, horseZ = 0, horseYaw = 0, collarWorld = null) {
      dt = Math.min(Math.max(dt, 0.0005), 0.033);
      const prevVx = this.vel.x, prevVz = this.vel.z, prevHeaveVel = this.heaveVel;

      // kecepatan kuda (kinematic driver)
      const hfx = Math.cos(horseYaw), hfz = -Math.sin(horseYaw);
      const hvx = hfx * horseSpeed, hvz = hfz * horseSpeed;
      if (this._prevHorseYaw === undefined || !isFinite(this._prevHorseYaw)) this._prevHorseYaw = horseYaw;
      const hYawRate = Math.max(-4, Math.min(4, this._wrapAngle(horseYaw - this._prevHorseYaw) / dt));
      this._prevHorseYaw = horseYaw;

      const horsePos = this._hp.set(horseX, 0, horseZ);
      const hk = collarWorld || {};
      // terrain-following baseline moves with the cart: subtract it from the
      // contact penetration, while heave remains the suspension/jolt response.
      const sampledGround = this.world.terrainHeightAt
        ? this.world.terrainHeightAt(this.pos.x, this.pos.z)
        : this.world.heightAt(this.pos.x, this.pos.z);
      if (!this._groundReady) {
        this.groundY = sampledGround;
        this._groundReady = true;
      } else {
        // Follow the terrain exactly; heave then only carries the bump response,
        // so a climbing cart does not accumulate a fake "floating" offset.
        this.groundY = sampledGround;
      }
      const colL = hk.collarL || this._anchorFallback(horseX, horseZ, horseYaw, 1, 0.62, 1.34, 0.30);
      const colR = hk.collarR || this._anchorFallback(horseX, horseZ, horseYaw, -1, 0.62, 1.34, 0.30);
      const girL = hk.girthL || this._anchorFallback(horseX, horseZ, horseYaw, 1, 0.10, 1.30, 0.36);
      const girR = hk.girthR || this._anchorFallback(horseX, horseZ, horseYaw, -1, 0.10, 1.30, 0.36);

      this._dbg = {}; this._dbgN = {};
      const SUB = 6, h = dt / SUB;
      // Fixed terrain-bump impulse for Lv1: deterministic and independent of the
      // contact solver's per-frame _imp reset. Sample surface change under each
      // wheel; with no suspension this height delta is transmitted to the chassis.
      const rigidBump = [];
      if (this.susRigid) {
        const fwdX = Math.cos(this.yaw), fwdZ = -Math.sin(this.yaw);
        for (const w of this.wheels) {
          const oldX = w._bumpX ?? (this.pos.x + fwdX * w.wa.x - fwdZ * w.wa.z);
          const oldZ = w._bumpZ ?? (this.pos.z + fwdZ * w.wa.x + fwdX * w.wa.z);
          const newX = this.pos.x + fwdX * w.wa.x - fwdZ * w.wa.z;
          const newZ = this.pos.z + fwdZ * w.wa.x + fwdX * w.wa.z;
          const surfNew = this.world.wheelHeightAt(newX, newZ, w.ref.radius);
          const surfOld = this.world.wheelHeightAt(oldX, oldZ, w.ref.radius);
          const rise = surfNew - surfOld;
          rigidBump.push({ w, rise, surfNew });
          w._rise = rise;                 // perpindahan vertikal permukaan di bawah roda, 1 frame
          w._bumpX = newX; w._bumpZ = newZ;
        }
      }
      let peakHorsePen = 0;
      let peakEnvPen = 0;
      let peakEnvHit = { hit: false, nx: 0, nz: 0, pen: 0, hitType: null };
      for (let i = 0; i < SUB; i++) {
        this._substep(h, horseYaw, hvx, hvz, hYawRate, colL, colR, girL, girR, horsePos);
        // Selesaikan kontak keras tiap substep supaya bak tidak pernah menembus buritan kuda & objek alam
        this._resolveHorseContact(horseX, horseZ, horseYaw, hvx, hvz);
        this._resolveEnvCollisions();
        if (this._horsePen > peakHorsePen) peakHorsePen = this._horsePen;
        if (this._envHit.hit && this._envHit.pen >= peakEnvPen) {
          peakEnvPen = this._envHit.pen;
          peakEnvHit.hit = true;
          peakEnvHit.nx = this._envHit.nx;
          peakEnvHit.nz = this._envHit.nz;
          peakEnvHit.pen = this._envHit.pen;
          peakEnvHit.hitType = this._envHit.hitType;
        }
      }
      this._horsePen = peakHorsePen;
      this._envHit = peakEnvHit;
      if (this.susRigid && rigidBump.length) {
        /* Poros kaku = tinggi rangka MENGIKUTI roda, tidak ada langkah pegas.
           Jadi undakan di bawah roda langsung jadi displacement bodi (bukan
           gaya yang diredam): kerikil/batu bikin gerobak keguncang seketika.
           Dikali <1 supaya contact solver tetap punya ruang, tidak osilasi. */
        /* Rangka mengikuti BIDANG roda, bukan mengakumulasi impuls.
           Dulu heave dijumlahkan dari rise tiap frame: di tanjakan panjang mean
           rise selalu positif, jadi bodi naik terus sampai melayang 6 m. Sekarang
           target heave dihitung dari rata-rata permukaan di bawah empat roda
           (relatif groundY) lalu dikejar cepat — guncangan tetap terasa, tapi
           tidak bisa drift. */
        let riseSum = 0, pitchRise = 0, surfSum = 0, n = 0;
        for (const b of rigidBump) {
          const r = Math.max(-0.10, Math.min(0.10, b.rise));
          const side = Math.sign(b.w.wa.x) || 1;
          riseSum += r; pitchRise += r * side; surfSum += b.surfNew; n++;
        }
        const meanRise = n ? riseSum / n : 0;
        const meanSurf = n ? surfSum / n : this.groundY;
        const heaveTgt = Math.max(-0.32, Math.min(0.32, meanSurf - this.groundY));
        // poros kaku = tidak ada per, jadi rangka MENGIKUTI bidang roda saat itu
        // juga (tanpa lag). Kalau diberi lag, guncangan justru lebih halus dari Lv2.
        const kFollow = 1;
        const prevHeaveNow = this.heave;
        this.heave += (heaveTgt - this.heave) * kFollow;
        this.heaveVel = (this.heave - prevHeaveNow) / dt;
        // pitch/roll jolt tetap dari beda tinggi antar roda (bukan common mode)
        const pitchDiff = n ? pitchRise / n : 0;
        this.pitchV += pitchDiff * 2.4;

        /* Poros kaku = bodi dipaku ke poros, jadi sikapnya MENGIKUTI bidang empat
           roda, bukan diredam pegas. Di sini bidang itu dipakai sebagai sudut
           acuan: beda tinggi depan-belakang -> pitch, kiri-kanan -> roll.
           Efeknya kerikil/bebatuan langsung bikin rangka goyang, sementara
           Lv2/Lv3 tetap tenang karena punya per. */
        if (!this.flipped && Math.abs(this.roll) < Math.PI * 0.40) {
          let fy = 0, fn = 0, ry = 0, rn = 0, ly = 0, ln = 0, rry = 0, rrn = 0;
          for (const b of rigidBump) {
            const sy = b.surfNew;
            if (b.w.wa.x > 0.01) { fy += sy; fn++; } else if (b.w.wa.x < -0.01) { ry += sy; rn++; }
            if (b.w.wa.z > 0.01) { ly += sy; ln++; } else if (b.w.wa.z < -0.01) { rry += sy; rrn++; }
          }
          const wheelBase = Math.max(0.6, Math.abs(this.wheels[0]?.wa.x - this.wheels[2]?.wa.x) || 1.7);
          const trackW = Math.max(0.6, Math.abs(this.wheels[0]?.wa.z - this.wheels[1]?.wa.z) || 2.0);
          if (fn && rn) {
            const pitchGeo = Math.max(-0.45, Math.min(0.45, Math.atan2((fy / fn) - (ry / rn), wheelBase)));
            this.pitch += (pitchGeo - this.pitch) * Math.min(1, dt * 30);
            this.pitchV *= Math.exp(-4.0 * dt);
          }
          if (ln && rrn) {
            // Pada Euler('YZX'): roll > 0 memutar +Z turun, jadi sisi +Z lebih tinggi (ly > rry) butuh roll negatif
            const rollGeo = Math.max(-0.45, Math.min(0.45, Math.atan2((rry / rrn) - (ly / ln), trackW)));
            const critR = Math.max(this._tipCrit || 0.68, 1.15);
            const ratio = Math.abs(this.roll) / critR;
            const follow = ratio <= 0.78 ? 1 : Math.max(0, 1 - (ratio - 0.78) / 0.22);
            this.roll += (rollGeo - this.roll) * Math.min(1, dt * 14 * follow);
          }
        }
      } else if (!this.susRigid && !this.flipped && !this._lying) {
        let fy = 0, fn = 0, ry = 0, rn = 0;
        for (const w of this.wheels) {
          if (!w.contact || w.detached) continue;
          const sy = this.world.wheelHeightAt(w.world.x, w.world.z, w.ref.radius);
          if (w.wa.x > 0.01) { fy += sy; fn++; } else if (w.wa.x < -0.01) { ry += sy; rn++; }
        }
        if (fn && rn) {
          const wheelBase = Math.max(0.6, Math.abs(this.wheels[0]?.wa.x - this.wheels[2]?.wa.x) || 1.7);
          const pitchGeo = Math.max(-0.45, Math.min(0.45, Math.atan2((fy / fn) - (ry / rn), wheelBase)));
          this.pitch += (pitchGeo - this.pitch) * Math.min(1, dt * 10);
          this.pitchV *= Math.exp(-3.5 * dt);
        }
      }

      // ---- state turunan ----
      const cfx = Math.cos(this.yaw), cfz = -Math.sin(this.yaw);
      this.forwardSpeed = this.vel.x * cfx + this.vel.z * cfz;
      const yawRate = this.yawV;
      this.centrifugal = yawRate * this.forwardSpeed;
      const ax = (this.vel.x - prevVx) / dt;
      const accY = (this.heaveVel - prevHeaveVel) / dt;

      // wental / rebah: keputusan dari sikap bodi, bukan dipaksa skrip
      // ---------- NYAWA RODA: benturan keras ngurangin HP ----------
      // Tiap roda punya hp 0..100. Nabrak keras (mendarat dari lompat, nyeruduk batu,
      // nyeret di tanjakan) ngurangin HP. HP mentok 0 -> roda rusak (oleng, ban lemah);
      // begitu gerobak terguling, roda yang HP-nya 0 langsung lepas & mental ke tanah.
      // Grace ~0.8 s setelah reset/spawn: gerobak masih "duduk" ke tanah,
      // hentakan awal itu bukan kerusakan.
      if (this._dmgGrace === undefined) this._dmgGrace = 0;
      if (this._dmgGrace > 0) this._dmgGrace = Math.max(0, this._dmgGrace - dt);
      const noDamage = this._dmgGrace > 0;
      const refLoad = 1.7 * (this.mass * 9.81) / 4;   // beban normal satu roda
      for (const w of this.wheels) {
        if (w.detached || !w.ref) { w._imp = 0; w._lat = 0; continue; }
        const impV = w._imp, latV = w._lat;
        w._lastImp = impV; w._lastLat = latV;    // buat probe QA
        let dmg = 0;
        // Gerobak yang masih diam / baru mendarat dari spawn bukan "benturan".
        const groundSpeed = Math.hypot(this.vel.x, this.vel.z);
        if (groundSpeed < 1.0) { w._lastDmg = 0; w._wasContact = !!w.contact;
          if ((w._dmgCd || 0) > 0) w._dmgCd = Math.max(0, w._dmgCd - dt);
          w._imp = 0; w._lat = 0; w._rise = 0; continue; }
        /* Roda rusak karena HENTAKAN, bukan karena ban nahan beban.
           Sebelumnya ada suku "beban samping": |fLat|+|fLong| > 1.55 x beban roda
           dianggap benturan. Masalahnya gaya geser ban nyentuh angka itu tiap
           guncangan kecil di jalan (0.26 m/s slip samping = 3 kN), jadi HP roda
           ngucur terus walau cuma jalan lurus enak. Sekarang sumber damage cuma:
           (a) impak normal roda yang benar-benar baru (tanah/batu dinaiki cepat), dan
           (b) undakan besar khusus poros kaku. */
        if (impV > (this.susRigid ? 3.0 : 2.6)) {
          dmg += (impV - (this.susRigid ? 3.0 : 2.6)) * (this.susRigid ? 2.2 : 6.5);
        }
        // Undakan tajam (batu/tebing kecil) di bawah poros kaku: biayanya kecil
        // per lewatan, bukan per frame — cooldown di bawah yang nahan lajunya.
        const riseRate = Math.abs(w._rise || 0) / Math.max(1e-3, dt);
        if (this.susRigid && riseRate > 4.0) dmg += Math.min(1.2, (riseRate - 4.0) * 0.30);
        // Satu kejadian = satu potong HP. Cooldown 0.25 s per roda mencegah satu
        // hentakan panjang dipotong berkali-kali, sekaligus jadi plafon ~32 HP/s.
        if (noDamage && dmg > 0) dmg = 0;
        if (dmg > 0) {
          if ((w._dmgCd || 0) > 0) dmg = 0;
          else { dmg = Math.min(dmg, 9.0); w._dmgCd = 0.25; }
        }
        if (dmg > 0 && w.hp > 0) {
          w.hp = Math.max(0, w.hp - dmg * (this.damageScale ?? 1));
          w._hitFlash = 0.45;
          if (w.hp <= 0) { w.broken = true; if (this.onWheelBroken) this.onWheelBroken(w); }
        }
        w._lastDmg = dmg;
        w._wasContact = !!w.contact;
        // Damage rata-rata per meter, bukan per frame: framerate atau melambat
        // menjelang benturan nggak bikin satu pukulan dobel/berlipat.
        if ((w._dmgCd || 0) > 0) w._dmgCd = Math.max(0, w._dmgCd - dt);
        w._imp = 0; w._lat = 0; w._rise = 0;
        if (w._hitFlash > 0) w._hitFlash = Math.max(0, w._hitFlash - dt);
      }

      // ---- batas angkat hidung ----
      // Bak boleh ikut kemiringan tanjakan (maks ~17°) dan sedikit memantul, tapi
      // TIDAK boleh berdiri tegak sampai menindih kuda. Lewat batas: sudut dipegang,
      // kecepatan sudutnya dimatikan, sisa energinya dibuang.
      const PITCH_MAX = 0.62;   // ~35°
      if (!this.flipped && Math.abs(this.pitch) > PITCH_MAX) {
        const s = Math.sign(this.pitch) || 1;
        this.pitch = s * PITCH_MAX;
        if (this.pitchV * s > 0) this.pitchV = 0;
      }

      // ambang "terbalik" diturunkan ke batas geometri bodi: bodi sudah rebah ke sisi
      // (bukan angka gameplay) — di atas ~24° muatan sudah longsor & roda satu sisi lepas
      const tilt = Math.max(Math.abs(this.roll), Math.abs(this.pitch) * 0.8);
      if (!this.flipped && tilt > FLIP_ANG) {
        this._triggerFlip(
          Math.abs(this.roll) >= Math.abs(this.pitch) * 0.8 ? 'roll' : 'pitch',
          Math.sign(this.roll || this.pitch) || 1,
          false
        );
      } else if (this.flipped && !this._tipLatched && tilt < 0.90) {
        // hanya rollover fisik biasa yang bisa auto-recover; trigger sentrifugal terkunci sampai Reset
        this.flipped = false;
      }

      // ---- sinkron visual (termasuk gerobak mendingkluk ke depan saat kuda lepas) ----
      const wantDroop = (!this.hitched && !this.flipped) ? 1 : 0;
      this.unhitchedDroop = HC.damp(this.unhitchedDroop || 0, wantDroop, 5.5, dt);
      const visPitch = this.pitch - this.unhitchedDroop * 0.13;
      const visRoll = (this.flipped && this.liftProgress > 0)
        ? this.roll * (1 - this.liftProgress * 0.88)
        : this.roll;
      this.euler.set(visRoll, this.yaw, visPitch, 'YZX');
      this.q.setFromEuler(this.euler);
      this.cart.root.position.set(this.pos.x, this.groundY + this.pivotY + this.heave, this.pos.z);
      this.cart.chassis.quaternion.copy(this.q);

      for (const w of this.wheels) {
        w.spin -= (this.forwardSpeed / w.ref.radius) * dt;
        const pv = w.ref.wheelPivot;
        if (!w.detached) {
          if (w.contact && !this._lying) {
            // roda napak: pakai posisi kontak hasil fisika (biar presisi di tanjakan)
            pv.position.set(
              w.world.x - this.cart.root.position.x,
              w.world.y + w.comp - this.cart.root.position.y,
              w.world.z - this.cart.root.position.z
            );
          } else {
            // roda gak napak (lagi miring/terguling di udara): IKUT BAK.
            // Dulu di sini roda dibiarkan di posisi dunia terakhir -> kelihatan melayang.
            const rl = this._w4.copy(w.wa).applyQuaternion(this.q);
            pv.position.set(rl.x, rl.y + w.comp, rl.z);
          }
        }
        pv.quaternion.copy(this.q);
        if (w.ref.front) {
          pv.quaternion.multiply(this._qAy.setFromAxisAngle(UP, this.axleYaw));
        }
        // roda rusak: ban oleng + goyang (tanda HP-nya tipis)
        if (w.hp < 45 && !w.detached) {
          const wob = (1 - w.hp / 45);
          w.ref.wheelMesh.rotation.z = w.spin + Math.sin(w.spin * 3.1) * 0.22 * wob;
          w.ref.wheelMesh.rotation.y = Math.sin(w.spin * 1.7) * 0.16 * wob;
        } else {
          w.ref.wheelMesh.rotation.z = w.spin;
          w.ref.wheelMesh.rotation.y = 0;
        }
        w.ref.worldY = w.world.y;
        w.ref.comp = w.comp;
      }

      this.updateDebris(dt);

      // suspension visuals on leaf springs (Lv1 = rigid mount, no coil to animate)
      for (const w of this.wheels) {
        const mount = w.ref.mount;
        const sag = w.comp / 0.26;
        const baseY = w.ref.mountYVox ?? 2.5;
        mount.position.y = (baseY + sag * 3.4) * S;
        const sp = w.ref.spring;
        if (sp && sp.coil) {
          sp.coil.scale.y = Math.max(0.35, 1 - sag * 0.75);
          sp.coil.position.y = (2 + sag * 5.2) * S;
          sp.leaf.rotation.x = -sag * 0.10;
        }
      }

      // ---- Lentera gantung: pendulum 2 sumbu (bukan animasi palsu) ----
      // Gravitasi di kerangka bodi + gaya inersia dari percepatan gerobak, jadi
      // lentera ikut terayun waktu gerobak mengerem, belok, atau terombang-ambing.
      const lant = this.cart.lantern;
      if (lant && lant.pivot) {
        const sw = lant.swing;
        const L = Math.max(0.12, lant.length || 0.26);
        const ldt = Math.min(dt, 0.05);

        this._la.set(ax, accY, (this.vel.z - prevVz) / dt);
        this._lq.copy(this.q).invert();
        this._la.applyQuaternion(this._lq);
        this._lg.set(0, -9.81, 0).applyQuaternion(this._lq).sub(this._la);

        // α = (d × g)/L dengan d ≈ (az, -1, -ax) di kerangka bodi
        const gx = this._lg.x, gy = this._lg.y, gz = this._lg.z;
        let alphaX = (-gz + sw.ax * gy) / L;
        let alphaZ = (gx + sw.az * gy) / L;

        // gesekan engsel + redaman udara
        alphaX -= sw.wx * 2.8;
        alphaZ -= sw.wz * 2.8;
        sw.wx = HC.clamp(sw.wx + alphaX * ldt, -14, 14);
        sw.wz = HC.clamp(sw.wz + alphaZ * ldt, -14, 14);
        sw.ax = HC.clamp(sw.ax + sw.wx * ldt, -0.55, 0.55);
        sw.az = HC.clamp(sw.az + sw.wz * ldt, -0.55, 0.55);
        if (Math.abs(sw.ax) >= 0.55) sw.wx *= -0.18;
        if (Math.abs(sw.az) >= 0.55) sw.wz *= -0.18;

        lant.pivot.rotation.x = sw.ax;
        lant.pivot.rotation.z = sw.az;
      }

      // penumpang ikut goyang: badan miring lawan roll, kepala bob saat kerikil
      const psg = this.cart.passengers;
      if (psg) {
        this._t = (this._t || 0) + dt;
        for (let i = 0; i < psg.length; i++) {
          const p = psg[i];
          const ph = (p.phase || 0) + this._t;
          const lean = Math.max(-0.45, Math.min(0.45, -this.roll * 0.62 + this.rollV * 0.06));
          p.upper.rotation.z = HC.damp(p.upper.rotation.z, lean, 7, dt);
          p.upper.rotation.x = HC.damp(p.upper.rotation.x, this.pitch * 0.55, 7, dt);
          p.upper.position.y = (1 + Math.abs(this.heaveVel) * 0.006) * H;
          p.head.rotation.z = HC.damp(p.head.rotation.z, -this.roll * 0.22 + Math.sin(ph * 7.3) * 0.02, 9, dt);
          p.head.rotation.y = Math.sin(ph * 1.7) * 0.10;
          p.head.position.y = (8.5 + Math.sin(ph * 9.1) * 0.035) * H;
        }
      }

      this.updateCargo(dt, ax, accY + 9.81);
      return this.forwardSpeed;
    }

    // ================= SISTEM NYAWA RODA =================
    // Ringkasan buat HUD: [{id, hp, broken, detached}, ...]
    wheelReport() {
      return (this.wheels || []).map((w) => ({
        id: (w.ref && w.ref.id) || '?',
        hp: Math.round(w.hp),
        broken: !!w.broken,
        detached: !!w.detached
      }));
    }

    // Roda yang HP-nya 0 dilepas dari bak begitu gerobak terguling.
    shedBrokenWheels() {
      const out = [];
      for (const w of this.wheels) {
        if (w.detached || w.hp > 0) continue;
        if (this.detachWheel(w)) out.push((w.ref && w.ref.id) || '?');
      }
      this.lastShed = out;
      return out;
    }

    detachWheel(w) {
      const ref = w && w.ref;
      const scene = this.cart && this.cart.root && this.cart.root.parent;
      if (!ref || !ref.wheelPivot || !scene) return false;
      const obj = ref.wheelPivot;
      obj.updateMatrixWorld(true);
      scene.attach(obj);              // pindah ke koordinat dunia, lepas dari bak
      w.detached = true;
      w.contact = false;

      const sp = Math.hypot(this.vel.x, this.vel.z);
      const side = Math.sign(w.wa.z) || 1;
      const lx = Math.sin(this.yaw), lz = Math.cos(this.yaw);   // kiri bak
      this.debris.push({
        obj,
        id: ref.id,
        r: ref.radius,
        vel: new THREE.Vector3(
          this.vel.x * 0.85 + lx * side * (1.7 + sp * 0.40),
          1.1 + sp * 0.26 + Math.random() * 0.5,
          this.vel.z * 0.85 + lz * side * (1.7 + sp * 0.40)
        ),
        ang: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 9
        ),
        rest: false
      });
      return true;
    }

    // Fisika sederhana buat roda lepas: jatuh, mantul, ngelinding, berhenti.
    updateDebris(dt) {
      if (!this.debris || !this.debris.length) return;
      for (const d of this.debris) {
        if (d.rest || !d.obj) continue;
        d.vel.y -= 9.81 * dt;
        d.obj.position.addScaledVector(d.vel, dt);
        d.obj.rotation.x += d.ang.x * dt;
        d.obj.rotation.y += d.ang.y * dt;
        d.obj.rotation.z += d.ang.z * dt;
        const p = d.obj.position;
        if (this.world && typeof this.world.resolveCircleCollision === 'function') {
          const er = this.world.resolveCircleCollision(p.x, p.z, d.r || 0.35, p.y - (d.r || 0.35));
          if (er.hit) {
            p.x = er.x; p.z = er.z;
            const vn = d.vel.x * er.nx + d.vel.z * er.nz;
            if (vn < 0) {
              d.vel.x -= er.nx * vn * 1.25;
              d.vel.z -= er.nz * vn * 1.25;
            }
          }
        }
        const gy = this.world.heightAt(p.x, p.z) + d.r * 0.55;
        if (p.y <= gy) {
          p.y = gy;
          const drop = -d.vel.y;
          if (drop > 0.9) {
            d.vel.y = drop * 0.34;
            d.vel.x *= 0.68; d.vel.z *= 0.68;
            d.ang.multiplyScalar(0.62);
          } else {
            d.vel.y = 0;
            d.vel.x *= 0.90; d.vel.z *= 0.90;
            d.ang.multiplyScalar(0.85);
            if (Math.abs(d.vel.x) + Math.abs(d.vel.z) < 0.12) {
              d.rest = true;
              d.vel.set(0, 0, 0);
            }
          }
        }
      }
    }

    clearDebris() {
      if (!this.debris) { this.debris = []; return; }
      for (const d of this.debris) {
        if (d.obj && d.obj.parent) d.obj.parent.remove(d.obj);
      }
      this.debris.length = 0;
    }

    // Balikin semua roda ke bak + HP penuh (dipanggil reset / ganti gerobak)
    resetWheels() {
      this.clearDebris();
      if (!this.wheels) return;
      for (const w of this.wheels) {
        w.hp = w.hpMax || 100;
        w.broken = false;
        w._imp = 0; w._lat = 0; w._rigidLoad = 0; w._hitFlash = 0;
        w._wasContact = false; w._prevPen = 0; w._lastDmg = 0; w._dmgCd = 0;
        if (w.detached) {
          w.detached = false;
          const ref = w.ref;
          if (ref && ref.wheelPivot && this.cart && this.cart.root) {
            if (ref.wheelPivot.parent !== this.cart.root) this.cart.root.add(ref.wheelPivot);
            ref.wheelPivot.position.set(w.wa.x, w.wa.y + w.comp, w.wa.z);
            ref.wheelPivot.rotation.set(0, 0, 0);
          }
        }
        if (w.ref && w.ref.wheelMesh) { w.ref.wheelMesh.rotation.set(0, 0, 0); w.ref.wheelMesh.rotation.z = w.spin; }
      }
    }

    initCargoItems() {
      this.spilled = [];
      for (let i = 0; i < this.cart.cargoItems.length; i++) {
        const item = this.cart.cargoItems[i];
        item.spilled = false;
        item.localPos = item.homePos.clone();
        item.localVel = new THREE.Vector3();
        item.localAng = new THREE.Vector3(item.homeRot.x, item.homeRot.y, item.homeRot.z);
        item.localQuat = new THREE.Quaternion().setFromEuler(item.homeRot);
        item.localAngVel = new THREE.Vector3();
        item.floorY = item.homePos.y;
        item.bounciness = 0.38 + (i % 3) * 0.08;
        item.pos = new THREE.Vector3();
        item.quat = new THREE.Quaternion();
        item.vel = new THREE.Vector3();
        item.angVel = new THREE.Vector3();
        item.mesh.position.copy(item.homePos);
        item.mesh.quaternion.copy(item.localQuat);
        // Collider PER BARANG: AABB dari mesh aslinya (bukan satu radius seragam).
        // Dipakai untuk tabrakan barang-barang di dalam bak maupun saat tumpah.
        const bb = new THREE.Box3().setFromObject(item.mesh);
        const sz = bb.getSize(new THREE.Vector3());
        item.half = new THREE.Vector3(
          Math.max(0.05, sz.x * 0.45),
          Math.max(0.05, sz.y * 0.45),
          Math.max(0.05, sz.z * 0.45)
        );
        // Fallback untuk item lama: frame visual belum tersimpan. Item baru
        // menyimpan localHalf/localCenter yang tidak ikut terotasi ganda.
        if (!item.localHalf) {
          item.localHalf = new THREE.Vector3(item.half.x / 0.9, item.half.y / 0.9, item.half.z / 0.9);
          item.localCenter = new THREE.Vector3();
        }
        item.radius = Math.max(item.radius || 0, Math.max(item.half.x, item.half.z));
        // Collider voxel gabungan: bentuknya mengikuti mesh (bukan AABB gemuk).
        // Dipakai untuk tumpukan & kontak sempit, jadi sudut kosong barrel
        // tidak dianggap padat.
        item.colliderBoxes = cargoColliderBoxes(item);
        item._colBottom = Math.min(...item.colliderBoxes.map((b) => b.cy - b.hy));
        item._colTop = Math.max(...item.colliderBoxes.map((b) => b.cy + b.hy));
        item._supportY = item.floorY;
        item._supportBy = null;
        item._onTopPrev = false;
        item._restT = 0;
      }
    }

    startFlip(axis = 'roll', dir = 1) {
      if (this.flipped) return;
      this.flipped = true;
      this.flipAxis = axis === 'pitch' ? 'pitch' : 'roll';
      this.flipDir = dir || 1;
      this.spillCargo();
    }

    ejectItemToWorld(item, boostY = 1.2) {
      if (item.spilled) return;
      const scene = this.cart.root.parent;
      if (!scene) return;
      item.spilled = true;
      this.cart.root.updateMatrixWorld(true);
      item.mesh.getWorldPosition(item.pos);
      item.mesh.getWorldQuaternion(item.quat);
      scene.attach(item.mesh);
      const wVel = item.localVel.clone().applyQuaternion(this.q);
      item.vel.set(
        this.vel.x * 0.65 + wVel.x + (Math.random() - 0.5) * 1.4,
        Math.max(0.8, wVel.y + boostY + Math.random() * 1.2),
        wVel.z + Math.sign(this.roll || (Math.random() - 0.5)) * (1.1 + Math.random() * 1.3)
      );
      item.angVel.set(
        item.localAngVel.x + (Math.random() - 0.5) * 5.5,
        item.localAngVel.y + (Math.random() - 0.5) * 4.0,
        item.localAngVel.z + (Math.random() - 0.5) * 5.5
      );
      this.spilled.push(item);
    }

    spillCargo() {
      for (const item of this.cart.cargoItems) {
        if (!item.spilled && !item.hiddenForQuest) this.ejectItemToWorld(item, 1.5);
      }
    }

    updateCargo(dt, cartAccX = 0, susKickY = 0) {
      const g = 9.81;
      const items = this.cart.cargoItems;
      if (!items || !items.length) return;
      const stepDt = Math.min(0.033, Math.max(0.004, dt));
      const invDt = 1 / stepDt;

      const capSpec = (this.cart.specs && this.cart.specs.capSpec) || { bedHalfL: 22, railTopVox: 16.5 };
      const bedMinX = 1.6 * S, bedMaxX = ((capSpec.bedFrontX ?? 24) - 2.0) * S;
      const halfW = Math.max(6, (capSpec.bedHalfW ?? 15) - 1);
      const bedMinZ = -halfW * S, bedMaxZ = halfW * S;
      const plankY = 6.0 * S;
      const railTopY = (capSpec.railTopVox ?? 16.5) * S;
      const frontRailTopY = Math.min(railTopY, 13.5 * S);
      const divRailTopY = Math.max(railTopY, 18.0 * S);

      // Wheel shock (only positive compression rate)
      let wheelShock = 0;
      for (const w of this.wheels) {
        const dComp = Math.max(0, w.comp - (w.prevComp || 0));
        w.prevComp = w.comp;
        w.cornerJolt = dComp / Math.max(0.008, stepDt);
        wheelShock += w.cornerJolt;
      }

      // Apakah gerobak sedang aktif bergerak / miring berubah / terguncang?
      const cartSpeed = Math.hypot(this.vel.x, this.vel.z);
      const dRoll = Math.abs(this.roll - (this._prevCargoRoll ?? this.roll)) * invDt;
      const dPitch = Math.abs(this.pitch - (this._prevCargoPitch ?? this.pitch)) * invDt;
      this._prevCargoRoll = this.roll;
      this._prevCargoPitch = this.pitch;
      const cartAgitated = this.flipped
        || cartSpeed > 0.14
        || Math.abs(this.rollV) > 0.08
        || Math.abs(this.pitchV) > 0.08
        || dRoll > 0.08
        || dPitch > 0.08
        || Math.abs(cartAccX) > 0.45
        || wheelShock > 0.08;

      const tmpV = this._cargoTmpV || (this._cargoTmpV = new THREE.Vector3());
      const rotAxis = this._cargoRollAxis || (this._cargoRollAxis = new THREE.Vector3());
      const rotDq = this._cargoRollDq || (this._cargoRollDq = new THREE.Quaternion());

      // Helper: siapkan data geometri pusat (c0) & ukuran tiap barang supaya berputar murni di titik tengahnya
      const ensureItemGeom = (it) => {
        if (!it.localQuat) {
          it.localQuat = new THREE.Quaternion().setFromEuler(
            it.homeRot || new THREE.Euler(it.localAng.x, it.localAng.y, it.localAng.z)
          );
        }
        if (!it._c0) {
          const vc = it.localCenter || new THREE.Vector3();
          const q0 = new THREE.Quaternion().setFromEuler(it.homeRot || new THREE.Euler());
          it._c0 = new THREE.Vector3(vc.x, vc.y, vc.z).applyQuaternion(q0);
        }
        const vh = it.localHalf || (it.half ? new THREE.Vector3(it.half.x / 0.9, it.half.y / 0.9, it.half.z / 0.9) : new THREE.Vector3(0.14, 0.14, 0.14));
        it._vh = vh;
        // Radius horizontal seragam (tidak berubah saat barang berputar -> nol getaran AABB!)
        it._colR = Math.max(0.08, (vh.x + vh.z) * 0.44);
        const q = it.localQuat;
        const r10 = 2 * (q.x * q.y + q.w * q.z);
        const r11 = 1 - 2 * (q.x * q.x + q.z * q.z);
        const r12 = 2 * (q.y * q.z - q.w * q.x);
        it._rotHalfY = Math.abs(r10) * vh.x + Math.abs(r11) * vh.y + Math.abs(r12) * vh.z;
      };

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || it.spilled || it.hiddenForQuest) continue;
        ensureItemGeom(it);
        if (cartAgitated) it._sleepTimer = 0;
      }

      // Hitung tumpukan antar-barang dari posisi pusat visual sebenarnya (center = localPos + _c0)
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        if (!a || a.spilled || a.hiddenForQuest) continue;
        let bestSurfY = plankY;
        let bestBy = null;
        const ax = a.localPos.x + a._c0.x;
        const az = a.localPos.z + a._c0.z;
        const aBot = (a.localPos.y + a._c0.y) - a._rotHalfY;
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const b = items[j];
          if (!b || b.spilled || b.hiddenForQuest) continue;
          if (b._supportBy === a) continue;
          const bx = b.localPos.x + b._c0.x;
          const bz = b.localPos.z + b._c0.z;
          const bTop = (b.localPos.y + b._c0.y) + b._rotHalfY;
          const hDist = Math.hypot(ax - bx, az - bz);
          // Pusat barang atas harus berada di atas bidang barang bawah; lewat tepi -> langsung jatuh ke lantai
          if (hDist <= b._colR * 0.92 && aBot >= bTop - 0.09 && aBot <= bTop + 0.05) {
            if (bTop > bestSurfY) {
              bestSurfY = bTop;
              bestBy = b;
            }
          }
        }
        a._supportSurfY = bestSurfY;
        a._supportBy = bestBy;
        // Jika pendukungnya hilang atau bergerak, bangunkan barang di atasnya
        if (bestBy && (bestBy._sleepTimer || 0) < 0.22) a._sleepTimer = 0;
        if (!bestBy && a.localPos.y + a._c0.y - a._rotHalfY > plankY + 0.018) a._sleepTimer = 0;
      }

      const accClamped = Math.max(-8, Math.min(8, cartAccX));
      const centClamped = Math.max(-7, Math.min(7, this.centrifugal || 0));
      const gx = -Math.sin(this.pitch) * g * 1.35 - accClamped * 0.65;
      const gz =  Math.sin(this.roll)  * g * 1.45 - centClamped * 0.55 - this.rollV * 1.4;
      const gy = -Math.cos(this.roll) * Math.cos(this.pitch) * g;

      // Pass 1: Integrasi gaya untuk barang yang belum tidur (asleep)
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || it.spilled || it.hiddenForQuest) continue;
        it._prevRollX = it.localPos.x;
        it._prevRollZ = it.localPos.z;

        const hasSupport = !!it._supportBy;
        const surfY = it._supportSurfY ?? plankY;
        const restY = surfY + it._rotHalfY - it._c0.y;
        it._restYNow = restY;
        const onFloor = it.localPos.y <= restY + 0.015;
        it._onFloorNow = onFloor;

        // Jika gerobak diam (termasuk di lereng miring!) dan barang sudah tenang menapak -> kunci 100% stabil tanpa getar/putar!
        if (!this.flipped && (it._sleepTimer || 0) >= 0.22 && onFloor) {
          it.localPos.y = restY;
          it.localVel.set(0, 0, 0);
          it.localAngVel.set(0, 0, 0);
          continue;
        }

        let localBumpKick = 0;
        if (onFloor) {
          for (const w of this.wheels) {
            const distX = Math.abs(it.localPos.x - w.wa.x);
            const distZ = Math.abs(it.localPos.z - w.wa.z);
            const weight = Math.max(0.2, 1.0 - (distX * 0.35 + distZ * 0.45));
            localBumpKick += (w.cornerJolt || 0) * weight * this.joltScale;
          }
        }

        it.localVel.x += gx * stepDt;
        it.localVel.z += gz * stepDt;
        it.localVel.y += gy * stepDt;

        if (onFloor && localBumpKick > 0.40) {
          const hop = Math.min(0.90, 0.20 + (localBumpKick - 0.40) * (0.30 + (i % 3) * 0.07));
          it.localVel.y = Math.max(it.localVel.y, hop);
          it.localVel.x += (((i * 7) % 5) - 2) * 0.08 * hop;
          it.localVel.z += (((i * 11) % 5) - 2) * 0.09 * hop;
          it._sleepTimer = 0;
        }

        it.localVel.multiplyScalar(Math.exp(-1.1 * stepDt));
        if (it.localVel.lengthSq() > 9.0) it.localVel.setLength(3.0);
        it.localPos.addScaledVector(it.localVel, stepDt);

        const ceilY = Math.max(railTopY, restY) + 0.45;
        if (it.localPos.y > ceilY) {
          it.localPos.y = ceilY;
          if (it.localVel.y > 0) it.localVel.y = 0;
        }

        if (it.localPos.y < restY) {
          const impact = -it.localVel.y;
          it.localPos.y = restY;
          if (impact > 0.32) {
            it.localVel.y = impact * Math.min(0.32, it.bounciness);
          } else {
            it.localVel.y = 0;
          }
          const floorFriction = hasSupport ? Math.exp(-2.2 * stepDt) : Math.exp(-4.2 * stepDt);
          it.localVel.x *= floorFriction;
          it.localVel.z *= floorFriction;
          it._onFloorNow = true;
        }

        // Cek keluar batas mangkuk HANYA jika bagian bawah barang benar-benar melampaui tinggi pagar atau gerobak terbalik
        const cx = it.localPos.x + it._c0.x;
        const cz = it.localPos.z + it._c0.z;
        const outOfBed = (
          cz < bedMinZ - 0.14 ||
          cz > bedMaxZ + 0.14 ||
          cx < bedMinX - 0.16 ||
          cx > bedMaxX + 0.16
        );
        if (this.flipped || outOfBed) {
          this.ejectItemToWorld(it, 0.75);
        }
      }

      // Pass 2: Solver PBD 3 iterasi (pisah antar-barang + tahan dinding pagar serentak -> nol interpenetrasi & nol getar!)
      const clampItemToWalls = (it) => {
        const r = it._colR;
        const cx = it.localPos.x + it._c0.x;
        const cz = it.localPos.z + it._c0.z;
        const itemBottomY = (it.localPos.y + it._c0.y) - it._rotHalfY;
        const minX = bedMinX + r, maxX = bedMaxX - r;
        const minZ = bedMinZ + r, maxZ = bedMaxZ - r;
        if (itemBottomY <= railTopY + 0.04) {
          if (cz < minZ) it.localPos.z = minZ - it._c0.z;
          else if (cz > maxZ) it.localPos.z = maxZ - it._c0.z;
        }
        if (itemBottomY <= divRailTopY + 0.04 && cx < minX) {
          it.localPos.x = minX - it._c0.x;
        }
        if (itemBottomY <= frontRailTopY + 0.04 && cx > maxX) {
          it.localPos.x = maxX - it._c0.x;
        }
      };

      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < items.length; i++) {
          const a = items[i];
          if (!a || a.spilled || a.hiddenForQuest) continue;
          clampItemToWalls(a);
          for (let j = i + 1; j < items.length; j++) {
            const b = items[j];
            if (!b || b.spilled || b.hiddenForQuest) continue;
            if (a._supportBy === b || b._supportBy === a) continue;
            const ay = a.localPos.y + a._c0.y;
            const by = b.localPos.y + b._c0.y;
            if (Math.abs(ay - by) >= (a._rotHalfY + b._rotHalfY) * 0.85) continue;

            const ax = a.localPos.x + a._c0.x, az = a.localPos.z + a._c0.z;
            const bx = b.localPos.x + b._c0.x, bz = b.localPos.z + b._c0.z;
            let dx = bx - ax, dz = bz - az;
            let d = Math.hypot(dx, dz);
            const minDist = a._colR + b._colR;
            if (d >= minDist) continue;
            if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
            const nx = dx / d, nz = dz / d;
            const pen = minDist - d;
            const aAsleep = (a._sleepTimer || 0) >= 0.22;
            const bAsleep = (b._sleepTimer || 0) >= 0.22;
            const wA = aAsleep && !bAsleep ? 0.0 : (bAsleep && !aAsleep ? 1.0 : 0.5);
            const wB = 1.0 - wA;
            a.localPos.x -= nx * pen * wA;
            a.localPos.z -= nz * pen * wA;
            b.localPos.x += nx * pen * wB;
            b.localPos.z += nz * pen * wB;
            clampItemToWalls(a);
            clampItemToWalls(b);

            if (iter === 0) {
              const rvx = b.localVel.x - a.localVel.x;
              const rvz = b.localVel.z - a.localVel.z;
              const vn = rvx * nx + rvz * nz;
              if (vn < 0) {
                // Hanya memantul ringan jika tabrakan cepat (> 0.55 m/s); kontak diam tidak boleh memantul!
                const e = vn < -0.55 ? 0.18 : 0.0;
                const jImp = -(1 + e) * vn * 0.5;
                if (!aAsleep) { a.localVel.x -= nx * jImp; a.localVel.z -= nz * jImp; }
                if (!bAsleep) { b.localVel.x += nx * jImp; b.localVel.z += nz * jImp; }
              }
            }
          }
        }
      }

      // Pass 3: Rekonsiliasi kecepatan PBD, rotasi menggelinding di pusat geometri, & penguncian diam (sleep)
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || it.spilled || it.hiddenForQuest) continue;

        const actualDx = it.localPos.x - (it._prevRollX ?? it.localPos.x);
        const actualDz = it.localPos.z - (it._prevRollZ ?? it.localPos.z);
        const actualMove = Math.hypot(actualDx, actualDz);

        // Rekonsiliasi kecepatan PBD: cegah kecepatan hantu menumpuk saat barang tertahan pagar/tetangga!
        const pbdVx = actualDx * invDt;
        const pbdVz = actualDz * invDt;
        if (Math.abs(pbdVx) < Math.abs(it.localVel.x)) it.localVel.x = pbdVx * 0.85;
        if (Math.abs(pbdVz) < Math.abs(it.localVel.z)) it.localVel.z = pbdVz * 0.85;

        if (!cartAgitated && it._onFloorNow && actualMove < 0.0035 && Math.abs(it.localVel.y) < 0.08) {
          it._sleepTimer = (it._sleepTimer || 0) + stepDt;
        } else if (actualMove > 0.006 || Math.abs(it.localVel.y) > 0.15) {
          it._sleepTimer = 0;
        }

        if ((it._sleepTimer || 0) >= 0.22 && it._onFloorNow) {
          // Diam mutlak tanpa getar dan tanpa berputar sedikit pun
          it.localPos.x = it._prevRollX ?? it.localPos.x;
          it.localPos.z = it._prevRollZ ?? it.localPos.z;
          it.localVel.set(0, 0, 0);
          it.localAngVel.set(0, 0, 0);
        } else if (actualMove > 0.0025) {
          // Menggelinding murni proporsional jarak tempuh nyata (dTheta = ds / r) tanpa residual spin!
          const rollR = Math.max(0.13, it.radius || 0.16);
          const wx = (actualDz * invDt) / rollR;
          const wz = -(actualDx * invDt) / rollR;
          it.localAngVel.set(wx, 0, wz);
          const wMag = Math.hypot(wx, wz);
          const wClamped = Math.min(wMag, 10.0);
          if (wClamped > 0.02) {
            rotAxis.set(wx / wMag, 0, wz / wMag);
            rotDq.setFromAxisAngle(rotAxis, wClamped * stepDt);
            it.localQuat.premultiply(rotDq).normalize();
          }
        } else {
          it.localAngVel.set(0, 0, 0);
        }

        // Poskan mesh dengan kompensasi pivot pusat geometri (_c0 - R(q)*localCenter) agar berputar tepat di tengah barang!
        const vc = it.localCenter || tmpV.set(0, 0, 0);
        tmpV.set(vc.x, vc.y, vc.z).applyQuaternion(it.localQuat);
        it.mesh.position.set(
          it.localPos.x + it._c0.x - tmpV.x,
          it.localPos.y + it._c0.y - tmpV.y,
          it.localPos.z + it._c0.z - tmpV.z
        );
        it.mesh.quaternion.copy(it.localQuat);
      }

      // 2) World physics for spilled cargo items (gravity, ground + pebble bounce, rolling, item-item collisions)
      for (let i = 0; i < this.spilled.length; i++) {
        const item = this.spilled[i];
        if (item.carriedBy) continue;
        item.vel.y -= g * dt;
        item.pos.addScaledVector(item.vel, dt);
        if (this.world && typeof this.world.resolveCircleCollision === 'function') {
          const er = this.world.resolveCircleCollision(item.pos.x, item.pos.z, item.radius || 0.25, item.pos.y - (item.radius || 0.25));
          if (er.hit) {
            item.pos.x = er.x; item.pos.z = er.z;
            const vn = item.vel.x * er.nx + item.vel.z * er.nz;
            if (vn < 0) {
              item.vel.x -= er.nx * vn * 1.25;
              item.vel.z -= er.nz * vn * 1.25;
            }
          }
        }
        item.mesh.position.copy(item.pos);
        item.quat.multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(item.angVel.x * dt, item.angVel.y * dt, item.angVel.z * dt)
          )
        );
        item.mesh.quaternion.copy(item.quat);

        const gh = this.world.heightAt(item.pos.x, item.pos.z);
        const rest = gh + item.radius * 0.72;
        if (item.pos.y < rest) {
          item.pos.y = rest;
          item.vel.y *= -0.36;
          item.vel.x *= 0.80;
          item.vel.z *= 0.80;
          // Rolling angular velocity coupled to ground velocity
          item.angVel.z = -item.vel.x / Math.max(0.12, item.radius);
          item.angVel.x =  item.vel.z / Math.max(0.12, item.radius);
          if (Math.abs(item.vel.y) < 0.25) item.vel.y = 0;
        }
        // Spin barang tumpah harus mati, bukan muter terus di tempat.
        const onGround = item.pos.y <= rest + 0.003;
        item.angVel.multiplyScalar(Math.exp(-(onGround ? 6.0 : 0.8) * dt));
        if (onGround && Math.hypot(item.vel.x, item.vel.z) < 0.18) {
          item.angVel.multiplyScalar(Math.exp(-10.0 * dt));
        }
        if (item.angVel.length() > 16) item.angVel.setLength(16);

        // no leash: spilled cargo stays where it fell and is left behind as the cart drives on
        const rr = Math.hypot(item.vel.x, item.vel.z);
        if (rr > 1e-4) {
          const fr = Math.min(rr, 2.6 * dt + rr * 0.9 * dt);
          item.vel.x -= (item.vel.x / rr) * fr;
          item.vel.z -= (item.vel.z / rr) * fr;
        }
      }

      // Spilled item-item collisions on the ground
      for (let i = 0; i < this.spilled.length; i++) {
        const a = this.spilled[i];
        if (a.carriedBy) continue;
        for (let j = i + 1; j < this.spilled.length; j++) {
          const b = this.spilled[j];
          if (b.carriedBy) continue;
          const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
          const minD = Math.max(0.08, (a.radius + b.radius) * 0.78);
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 1e-6 && d2 < minD * minD) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d, nz = dz / d;
            // AABB per barang kalau ada; kalau nggak, pakai radius
            const hr = Math.max(0.05, ((a.half ? Math.min(a.half.x, a.half.z) : a.radius) +
                                       (b.half ? Math.min(b.half.x, b.half.z) : b.radius)) * 0.9);
            const ov = (Math.min(minD, hr) - d) * 0.5;
            if (ov <= 0) continue;
            a.pos.x -= nx * ov; a.pos.z -= nz * ov;
            b.pos.x += nx * ov; b.pos.z += nz * ov;
            const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
            const vn = rvx * nx + rvz * nz;
            if (vn < 0) {
              const imp = -vn * 0.7;
              a.vel.x -= nx * imp; a.vel.z -= nz * imp;
              b.vel.x += nx * imp; b.vel.z += nz * imp;
            }
          }
        }
      }
    }

    /* Satu sumber kebenaran buat parameter kaku/pegas. Dipakai constructor
       DAN swapCart supaya ganti roda di UI benar-benar mengubah fisika. */
    applySpec(cart) {
      const sus = (cart.specs && cart.specs.susSpec) || { kSpring: 39000, cDamp: 1380, rollLim: 0.43 };
      /* RODA Lv1 = POROS KAKU: tidak ada per, tidak ada langkah suspensi.
         Semua gaya kontak langsung masuk ke rangka -> kerikil & batu kecil
         mengguncang seluruh gerobak (dampak terasa di muatan & penumpang). */
      this.susRigid = !!(sus.rigid
        || (cart.specs && cart.specs.rigidAxle)
        || (cart.specs && cart.specs.wheelSpec && cart.specs.wheelSpec.rigid));
      this.kSpring = this.susRigid ? 0 : sus.kSpring * HC.cartScale;
      this.cDamp = this.susRigid ? 0 : sus.cDamp * HC.cartScale;
      this.wheelTravel = this.susRigid ? 0 : (sus.travel || 0.24);
      this.rollLim = sus.rollLim || 0.43;
    }

    swapCart(newCart, horseX = 0, horseZ = 0, horseYaw = 0) {
      const prevSpin = this.wheels && this.wheels[0] ? this.wheels[0].spin : 0;
      const savedX = this.pos.x, savedZ = this.pos.z, savedYaw = this.yaw;
      const savedVx = this.vel.x, savedVz = this.vel.z;
      const keepMotion = !this.flipped;

      const scene = this.cart.root.parent;
      if (scene) {
        for (const item of this.spilled) {
          if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
        }
        scene.remove(this.cart.root);
        scene.add(newCart.root);
      }
      this.cart = newCart;
      this.applySpec(newCart);
      const capMass = (newCart.specs && newCart.specs.capSpec && newCart.specs.capSpec.massAdd) || 0;
      this.mass = HC.cartBaseMass + capMass;
      this._rebuildDims();
      this.wheels = newCart.wheels.map((w) => ({
        ref: w,
        wa: new THREE.Vector3(w.localX, w.radius - this.pivotY, w.localZ),
        comp: 0,
        compVel: 0,
        prevComp: 0,
        cornerJolt: 0,
        contact: false,
        spin: prevSpin,
        world: new THREE.Vector3(),
        hp: 100, hpMax: 100, broken: false, detached: false,
        _imp: 0, _lat: 0
      }));
      this.clearDebris();
      this.spilled = [];
      this.reset(horseX, horseZ, horseYaw);
      if (keepMotion) {
        this.pos.set(savedX, 0, savedZ);
        this.yaw = savedYaw;
        this.vel.set(savedVx, 0, savedVz);
      }
      this.syncVisual();
    }

    _triggerFlip(axis = 'roll', dir = 1, latched = false) {
      if (this.flipped) return;
      this.flipped = true;
      if (latched) this._tipLatched = true;
      this.flipAxis = axis;
      this.flipDir = dir || 1;
      this.hitched = false;
      this.liftProgress = 0;
      for (const w of (this.wheels || [])) {
        if (!w || w.detached) continue;
        const maxHp = w.hpMax || 100;
        w.hp = Math.max(0, (w.hp ?? maxHp) - maxHp * 0.20);
        if (w.hp <= 0) w.broken = true;
      }
      this.spillCargo();
      this.shedBrokenWheels();
      if (typeof this.onFlip === 'function') {
        try { this.onFlip(); } catch (e) { /* no-op */ }
      }
    }

    rightCartInPlace() {
      this.flipped = false;
      this._lying = false;
      this._tipLatched = false;
      this._tipT = 0;
      this._tipGravT = 0;
      this._sleepT = 0;
      this.asleep = false;
      this.flipDir = 0;
      this.liftProgress = 0;
      this.roll = 0; this.rollV = 0;
      this.pitch = 0; this.pitchV = 0;
      this.yawV = 0;
      this.heave = 0; this.heaveVel = 0;
      this.vel.set(0, 0, 0);
      this.hitched = false;
      this.unhitchedDroop = 1;
      this._dmgGrace = 1.0;

      this.clearDebris();
      for (const w of (this.wheels || [])) {
        if (w.detached) {
          w.detached = false;
          w.broken = false;
          w.hp = 20;
          const ref = w.ref;
          if (ref && ref.wheelPivot && this.cart && this.cart.root) {
            if (ref.wheelPivot.parent !== this.cart.root) this.cart.root.add(ref.wheelPivot);
            ref.wheelPivot.position.set(w.wa.x, w.wa.y + (w.comp || 0), w.wa.z);
            ref.wheelPivot.rotation.set(0, 0, 0);
          }
        }
        w._imp = 0; w._lat = 0; w._rigidLoad = 0; w._hitFlash = 0;
        w._wasContact = false; w._prevPen = 0; w._lastDmg = 0; w._dmgCd = 0;
      }

      for (const it of (this.cart && this.cart.cargoItems) || []) {
        if (!it.spilled) {
          if (it.localVel) it.localVel.set(0, 0, 0);
          if (it.localAngVel) it.localAngVel.set(0, 0, 0);
        }
      }
      this.syncVisual();
    }

    claimSpilledItem(npcUid, x, z, maxDist = 28) {
      let best = null;
      let bestD = maxDist;
      for (const item of this.spilled || []) {
        if (!item || !item.spilled || item.carriedBy) continue;
        if (item.claimedBy && item.claimedBy !== npcUid) continue;
        const ix = item.pos ? item.pos.x : 0;
        const iz = item.pos ? item.pos.z : 0;
        const d = Math.hypot(ix - x, iz - z);
        if (d < bestD) {
          bestD = d;
          best = item;
        }
      }
      if (best) best.claimedBy = npcUid;
      return best;
    }

    pickUpSpilledItem(item, npcUid) {
      if (!item || !item.spilled) return false;
      item.carriedBy = npcUid;
      item.claimedBy = npcUid;
      if (item.vel) item.vel.set(0, 0, 0);
      if (item.angVel) item.angVel.set(0, 0, 0);
      return true;
    }

    releaseCargoClaim(npcUid) {
      const scene = this.cart && this.cart.root && this.cart.root.parent;
      for (const item of this.spilled || []) {
        if (!item) continue;
        if (item.claimedBy === npcUid) item.claimedBy = null;
        if (item.carriedBy === npcUid) {
          item.carriedBy = null;
          if (scene && item.mesh && item.mesh.parent !== scene) scene.attach(item.mesh);
          if (item.mesh && item.pos) item.pos.copy(item.mesh.position);
          if (item.vel) item.vel.set(0, 0.3, 0);
        }
      }
    }

    loadCargoItemIntoCart(item) {
      if (!item) return (this.spilled || []).length;
      const idx = (this.spilled || []).indexOf(item);
      if (idx >= 0) this.spilled.splice(idx, 1);
      item.spilled = false;
      item.carriedBy = null;
      item.claimedBy = null;
      if (this.cart && this.cart.body && item.mesh) this.cart.body.add(item.mesh);
      if (item.localPos && item.homePos) item.localPos.copy(item.homePos);
      if (item.localVel) item.localVel.set(0, 0, 0);
      if (item.localAng && item.homeRot) item.localAng.set(item.homeRot.x, item.homeRot.y, item.homeRot.z);
      if (item.localQuat && item.homeRot) item.localQuat.setFromEuler(item.homeRot);
      if (item.localAngVel) item.localAngVel.set(0, 0, 0);
      if (item.mesh && item.homePos) item.mesh.position.copy(item.homePos);
      if (item.mesh && item.localQuat) item.mesh.quaternion.copy(item.localQuat);
      else if (item.mesh && item.homeRot) item.mesh.rotation.copy(item.homeRot);
      item._restT = 0.5;
      return (this.spilled || []).length;
    }

    takeBanditHit(dmg, fromX, fromZ, isHeavy = false) {
      if (this.flipped) return 0;
      const dx = this.pos.x - fromX;
      const dz = this.pos.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d;
      const nz = dz / d;
      const lx = Math.sin(this.yaw);
      const lz = Math.cos(this.yaw);
      const lat = nx * lx + nz * lz;
      const sideSign = lat >= 0 ? -1 : 1;

      this.rollV += sideSign * (isHeavy ? 1.25 : 0.65);
      this.heaveVel += isHeavy ? 0.85 : 0.45;
      this.vel.x += nx * (isHeavy ? 1.15 : 0.55);
      this.vel.z += nz * (isHeavy ? 1.15 : 0.55);

      let bestW = null;
      let bestDist = Infinity;
      let fallbackW = null;
      for (const w of this.wheels || []) {
        if (!w || w.detached) continue;
        if (!fallbackW) fallbackW = w;
        if (w.hp <= 0) continue;
        const wx = (w.world && Number.isFinite(w.world.x)) ? w.world.x : this.pos.x;
        const wz = (w.world && Number.isFinite(w.world.z)) ? w.world.z : this.pos.z;
        const wd = Math.hypot(wx - fromX, wz - fromZ);
        if (wd < bestDist) {
          bestDist = wd;
          bestW = w;
        }
      }
      bestW = bestW || fallbackW;
      const baseDmg = isHeavy ? 16 : 9;
      const wheelDmg = Math.max(1, Math.round(baseDmg * (this.damageScale ?? 1)));
      if (bestW) {
        bestW.hp = Math.max(0, (bestW.hp ?? 100) - wheelDmg);
        bestW._hitFlash = 0.55;
        if (bestW.hp <= 0) {
          bestW.broken = true;
          if (typeof this.onWheelBroken === 'function') this.onWheelBroken(bestW);
        }
      }

      if (isHeavy && Math.random() < 0.35 && this.cart && Array.isArray(this.cart.cargoItems)) {
        const unspilled = this.cart.cargoItems.find((it) => !it.spilled);
        if (unspilled) this.ejectItemToWorld(unspilled, 1.3);
      }
      return wheelDmg;
    }

    syncVisual() {
      const root = this.cart.root;
      root.position.set(this.pos.x, this.groundY + this.pivotY + this.heave, this.pos.z);
      const visPitch = this.pitch - (this.unhitchedDroop || 0) * 0.13;
      const visRoll = (this.flipped && this.liftProgress > 0)
        ? this.roll * (1 - this.liftProgress * 0.88)
        : this.roll;
      if (this.euler && this.q) {
        this.euler.set(visRoll, this.yaw, visPitch, 'YZX');
        this.q.setFromEuler(this.euler);
      }
      if (this.q) this.cart.chassis.quaternion.copy(this.q);
      if (this.wheels) {
        for (const w of this.wheels) {
          if (w.detached) continue;
          if (this.q) {
            const rl = this._w4.copy(w.wa).applyQuaternion(this.q);
            w.ref.wheelPivot.position.set(rl.x, rl.y + (w.comp || 0), rl.z);
            w.ref.wheelPivot.quaternion.copy(this.q);
            if (w.ref.front) w.ref.wheelPivot.quaternion.multiply(this._qAy.setFromAxisAngle(UP, this.axleYaw));
          } else {
            w.ref.wheelPivot.position.set(w.ref.localX, w.ref.radius - this.pivotY, w.ref.localZ);
          }
        }
      }
      root.updateMatrixWorld(true);
    }

    reset(horseX = 0, horseZ = 0, horseYaw = 0) {
      this.flipped = false;
      this._lying = false;
      this._tipLatched = false;
      this._tipT = 0;
      this._tipGravT = 0;
      this.flipDir = 0;
      this.hitched = true;
      this.unhitchedDroop = 0;
      this.liftProgress = 0;
      this.roll = 0; this.rollV = 0;
      this.pitch = 0; this.pitchV = 0;
      this.heave = 0; this.heaveVel = 0;
      this.yaw = horseYaw; this.yawV = 0;
      this.axleYaw = 0; this.axleYawV = 0;
      this._prevHorseYaw = horseYaw;
      this._groundReady = false;
      for (const w of (this.wheels || [])) { w._bumpX = undefined; w._bumpZ = undefined; }
      this._sleepT = 0; this.asleep = false;
      this.traceRest = [null, null];
      this.tipRestLat = [null, null];
      const d = this.hitchDist || HC.hitchDist;
      this._dmgGrace = 0.8;     // jangan hitung kerusakan saat gerobak "duduk" ke tanah
      this.pos.set(horseX - Math.cos(horseYaw) * d, 0, horseZ + Math.sin(horseYaw) * d);
      this.vel.set(0, 0, 0);
      this.euler.set(0, this.yaw, 0, 'YZX');
      if (this.q) this.q.setFromEuler(this.euler);
      for (const item of this.spilled) {
        this.cart.body.add(item.mesh);
      }
      this.initCargoItems();
      for (const w of this.wheels) w.comp = 0;
      this.resetWheels();
      this.syncVisual();
    }
  }

  /**
   * Solid horizontal collision against Horse (two-circle capsule) & Cart (oriented box).
   * Prevents NPCs/mobs from clipping through and supplies ram impact velocity.
   */
  HC.resolveRigObstacle = function (x, z, r = 0.4, horseCtx = null, cartCtx = null) {
    let px = x;
    let pz = z;
    let hit = false;
    let nx = 0;
    let nz = 0;
    let source = null;
    let hitFromX = x;
    let hitFromZ = z;
    let impactSpeed = 0;

    if (horseCtx && Number.isFinite(horseCtx.x) && Number.isFinite(horseCtx.z)) {
      const hyaw = horseCtx.yaw || 0;
      const hfx = Math.cos(hyaw);
      const hfz = -Math.sin(hyaw);
      const hSpd = Math.abs(horseCtx.speed || 0);
      const minD = 0.58 + r;
      for (const off of [0.46, -0.48]) {
        const cx = horseCtx.x + hfx * off;
        const cz = horseCtx.z + hfz * off;
        const dx = px - cx;
        const dz = pz - cz;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const d = Math.sqrt(dSq);
          const unx = d > 1e-4 ? dx / d : hfx;
          const unz = d > 1e-4 ? dz / d : hfz;
          px = cx + unx * minD;
          pz = cz + unz * minD;
          hit = true;
          nx = unx;
          nz = unz;
          source = 'horse';
          hitFromX = horseCtx.x;
          hitFromZ = horseCtx.z;
          impactSpeed = Math.max(impactSpeed, hSpd);
        }
      }
    }

    if (cartCtx && cartCtx.active && Number.isFinite(cartCtx.x) && Number.isFinite(cartCtx.z)) {
      const cyaw = cartCtx.yaw || 0;
      const cfx = Math.cos(cyaw);
      const cfz = -Math.sin(cyaw);
      const clx = -cfz;
      const clz = cfx;
      const dx = px - cartCtx.x;
      const dz = pz - cartCtx.z;
      const lx = dx * cfx + dz * cfz;
      const lz = dx * clx + dz * clz;
      const hl = 2.02 + r;
      const hw = 1.16 + r;
      if (Math.abs(lx) < hl && Math.abs(lz) < hw) {
        const penX = hl - Math.abs(lx);
        const penZ = hw - Math.abs(lz);
        let unx = 0, unz = 0;
        let nlx = lx, nlz = lz;
        if (penX < penZ) {
          const s = lx >= 0 ? 1 : -1;
          nlx = s * hl;
          unx = s * cfx;
          unz = s * cfz;
        } else {
          const s = lz >= 0 ? 1 : -1;
          nlz = s * hw;
          unx = s * clx;
          unz = s * clz;
        }
        px = cartCtx.x + cfx * nlx + clx * nlz;
        pz = cartCtx.z + cfz * nlx + clz * nlz;
        hit = true;
        nx = unx;
        nz = unz;
        source = 'cart';
        hitFromX = cartCtx.x;
        hitFromZ = cartCtx.z;
        const cSpd = Math.abs(cartCtx.speed || 0);
        const hSpd = horseCtx ? Math.abs(horseCtx.speed || 0) : 0;
        impactSpeed = Math.max(impactSpeed, cSpd, hSpd * 0.9);
      }
    }

    return { hit, x: px, z: pz, nx, nz, source, impactSpeed, hitFromX, hitFromZ };
  };

  HC.Rope = Rope;
  HC.CartPhysics = CartPhysics;
