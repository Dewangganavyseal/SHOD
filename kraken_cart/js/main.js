import { HC } from './hc.js';
import './voxel.js';
import './horse.js';
import './cart.js';
import './world.js';
import './physics.js';
import './animator.js';
import './npc.js';
import './mobs.js';
import './sylvan/models.js';
import { UpgradeStore } from './upgrades.js';
import { initUpgradeUI } from './ui.js';
import { Survival } from './survival.js';
import { initTouchControls } from './touch_controls.js';
import {
  QUALITY_ORDER, QUALITY_PRESETS, resolveQuality, saveQualityKey,
  bakeNpcLod, setNpcLod, updateNpcLod, cullDistantNpcs
} from './perf.js';

const THREE = HC.THREE, S = HC.vs;

/* Kualitas dipilih SEBELUM world dibuat: jumlah/blokshadow & pixel ratio
   tidak boleh baru dipilih setelah mesh dibangun. Pilihan user disimpan di
   localStorage; bisa dipaksa lewat ?quality=potato untuk debugging. */
const quality = resolveQuality();
HC.QUALITY = quality;

const container = document.getElementById('app');
const scene = new THREE.Scene();
/* Model Sylvan (Royalguard cloth, efek Lich) memasang mesh tambahan lewat
   `Game.scene`. Shim hanya menyediakan Group gantung; tanpa baris ini 12 panel
   jubah di-simulate tiap frame tapi tidak pernah masuk render graph. */
if (window.Game) Game.scene = scene;
scene.background = new THREE.Color(0x6bb0e6);

const initW = Math.max(1, window.innerWidth);
const initH = Math.max(1, window.innerHeight);
const camera = new THREE.PerspectiveCamera(46, initW / initH, 0.2, 180);

const renderer = new THREE.WebGLRenderer({
  antialias: !!quality.antialias,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: !!quality.preserveDrawingBuffer
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap) * (quality.renderScale || 1));
renderer.setSize(initW, initH);
renderer.shadowMap.enabled = quality.shadows !== false;
renderer.shadowMap.autoUpdate = quality.shadows !== 'static';
renderer.shadowMap.type = quality.shadows === 'static' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
container.appendChild(renderer.domElement);

// ---------------- upgrade store & rig ----------------
const store = new UpgradeStore();
const world = new HC.World(scene);
const startPose = world.initialHorsePose ? world.initialHorsePose() : { x: 0, z: 0, yaw: 0 };
const startY = world.terrainHeightAt ? world.terrainHeightAt(startPose.x, startPose.z) : 0;

const horse = HC.buildHorse();
horse.root.position.set(startPose.x, startY, startPose.z);
horse.root.rotation.y = startPose.yaw;
scene.add(horse.root);

const PIVOT_Y = 0.58;
let cart = HC.buildCart(PIVOT_Y, store.cartConfig());
scene.add(cart.root);
cart.root.position.set(
  startPose.x - Math.cos(startPose.yaw) * HC.hitchDist,
  startY + PIVOT_Y,
  startPose.z + Math.sin(startPose.yaw) * HC.hitchDist
);

const animator = new HC.HorseAnimator(horse, world);
animator.x = startPose.x;
animator.z = startPose.z;
animator.yaw = startPose.yaw;
animator.forwardX = Math.cos(startPose.yaw);
animator.forwardZ = -Math.sin(startPose.yaw);

const physics = new HC.CartPhysics(cart, world, PIVOT_Y);
physics.joltScale = store.joltScale();
physics.reset(startPose.x, startPose.z, startPose.yaw);
const HITCH_DIST = Math.max(2.2, Math.hypot(startPose.x - physics.pos.x, startPose.z - physics.pos.z));

// ---------------- NPC squad (roster Sylvan Dominion) ----------------
const party = new HC.NPCParty(scene);
party.world = world;   // NPC liar berdiri di permukaan terrain
party.bindCart(cart);
if (world.placeNPCsInWorld) {
  world.placeNPCsInWorld(party);
} else {
  for (const w of party.wild) if (w.root) w.root.position.y = world.terrainHeightAt(w.x, w.z);
  for (const w of party.wild) {
    if (!party.avoidSiteProps) break;
    party.avoidSiteProps(world, w);
  }
}

// ---------------- Hutan Mobs (Kelinci Voxel & Babi Hutan + Tactical Combat AI) ----------------
const mobs = new HC.ForestMobs(scene, world);
HC.mobs = mobs;
window.MOBS = mobs;

// ---------------- kualitas grafis + optimasi mesh NPC ----------------
/* LOD NPC: model Sylvan penuh dekat, model statis hasil bake jauh. */
function makeNpcLod(root) {
  if (!root) return null;
  return bakeNpcLod(root, THREE);
}

const mountNpcSquad = party.mount.bind(party);
party.mount = function (c) {
  mountNpcSquad(c);
  // Penumpang selalu di depan kamera: pakai model penuh, jangan LOD beku.
  // Ini juga menutup bug "warga direkrut dari jauh lalu duduk sebagai patung".
  for (const p of (c && c.npcPassengers) || []) setNpcLod(p, false);
};

if (quality.npcLod) for (const w of party.wild) makeNpcLod(w.root);
// Warga respawn sesudah direkrut: bake supaya nanti kalau dilepas sudah siap.
HC.onNPCSpawn = (item) => { if (item && item.root && quality.npcLod) makeNpcLod(item.root); };

world.bindRenderer(renderer);

const qualityBar = document.getElementById('quality-bar');
function refreshQualityBar() {
  if (!qualityBar) return;
  qualityBar.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.quality === quality.key);
  });
  qualityBar.title = `Grafis: ${quality.label} — ${quality.hint}`;
}
function applyQualityLive(key, persist = true) {
  const preset = QUALITY_PRESETS[key];
  if (!preset) return null;
  quality.key = key;
  Object.assign(quality, preset);
  HC.QUALITY = quality;
  if (persist) saveQualityKey(key);
  if (world.applyQuality) world.applyQuality(quality);
  for (const w of party.wild) {
    if (!w.root) continue;
    if (quality.npcLod) makeNpcLod(w.root);
    else setNpcLod(w.root, false);
  }
  for (const p of cart.npcPassengers || []) {
    if (quality.npcLod) makeNpcLod(p);
    else setNpcLod(p, false);
  }
  refreshQualityBar();
  return quality;
}
if (qualityBar) {
  for (const key of QUALITY_ORDER) {
    const p = QUALITY_PRESETS[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mood-chip quality-chip';
    btn.dataset.quality = key;
    btn.textContent = p.icon + ' ' + p.label;
    const tap = (e) => { e.preventDefault(); applyQualityLive(key); };
    btn.addEventListener('click', tap);
    btn.addEventListener('touchstart', tap, { passive: false });
    qualityBar.appendChild(btn);
  }
  refreshQualityBar();
}

// Probe QA / tombol dev: ganti preset tanpa reload, lihat angka LOD.
window.QUALITY_CTL = {
  apply: applyQualityLive,
  current: () => quality,
  presets: QUALITY_PRESETS,
  stats: () => party.wild.map((w) => {
    const rec = w.root && w.root.userData.__npcLod;
    return { role: w.role && w.role.id, lod: rec ? rec.on : null, meshes: rec ? rec.stats.meshes : 0, lods: rec ? rec.stats.lods : 0 };
  }),
  lodTick: (near) => updateNpcLod(party.wild, animator.x, animator.z, near || quality.npcLodNear)
};

// ---------------- soft contact shadows ----------------
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(90,85,78,0.42)');
  g.addColorStop(0.55, 'rgba(90,85,78,0.18)');
  g.addColorStop(1, 'rgba(90,85,78,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const blobTex = blobTexture();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const horseBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat);
horseBlob.rotation.x = -Math.PI / 2;
horseBlob.scale.set(1.5, 2.5, 1);
horseBlob.position.y = 0.006;
scene.add(horseBlob);
const cartBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat);
cartBlob.rotation.x = -Math.PI / 2;
cartBlob.scale.set(2.2 * HC.cartScale, 2.0 * HC.cartScale, 1);
cartBlob.position.y = 0.006;
scene.add(cartBlob);

// ---------------- ropes (dynamic, Verlet) ----------------
const towL = new HC.Rope(scene, { segments: 14, thickness: 0.030, color: 0xbf9a5f });
const towR = new HC.Rope(scene, { segments: 14, thickness: 0.030, color: 0xbf9a5f });
const traceL = new HC.Rope(scene, { segments: 16, thickness: 0.026, color: 0x9c7a44 });
const traceR = new HC.Rope(scene, { segments: 16, thickness: 0.026, color: 0x9c7a44 });
const reinL = new HC.Rope(scene, { segments: 20, thickness: 0.020, color: 0x4a2c18 });
const reinR = new HC.Rope(scene, { segments: 20, thickness: 0.020, color: 0x4a2c18 });

const anchors = {
  a: new THREE.Vector3(), b: new THREE.Vector3(),
  c: new THREE.Vector3(), d: new THREE.Vector3(),
  gL: new THREE.Vector3(), gR: new THREE.Vector3(),
  stL: new THREE.Vector3(), stR: new THREE.Vector3(),
  bitL: new THREE.Vector3(), bitR: new THREE.Vector3(),
  seat: new THREE.Vector3()
};

function readAnchors() {
  horse.collarLeft.getWorldPosition(anchors.a);
  cart.shaftTipLeft.getWorldPosition(anchors.b);
  horse.collarRight.getWorldPosition(anchors.c);
  cart.shaftTipRight.getWorldPosition(anchors.d);
  horse.girthLeft.getWorldPosition(anchors.gL);
  horse.girthRight.getWorldPosition(anchors.gR);
  cart.singletreeLeft.getWorldPosition(anchors.stL);
  cart.singletreeRight.getWorldPosition(anchors.stR);
  horse.bitLeft.getWorldPosition(anchors.bitL);
  horse.bitRight.getWorldPosition(anchors.bitR);
  cart.seatAnchor.getWorldPosition(anchors.seat);
}

function resetRopes() {
  scene.updateMatrixWorld(true);
  readAnchors();
  towL.reset(anchors.a, anchors.b, 0.04);
  towR.reset(anchors.c, anchors.d, 0.04);
  traceL.reset(anchors.gL, anchors.stL, 0.08);
  traceR.reset(anchors.gR, anchors.stR, 0.08);
  reinL.reset(anchors.bitL, anchors.seat, 0.22);
  reinR.reset(anchors.bitR, anchors.seat, 0.22);
}

function reanchorRopes() {
  scene.updateMatrixWorld(true);
  readAnchors();
  towL.reanchor(anchors.a, anchors.b);
  towR.reanchor(anchors.c, anchors.d);
  traceL.reanchor(anchors.gL, anchors.stL);
  traceR.reanchor(anchors.gR, anchors.stR);
  reinL.reanchor(anchors.bitL, anchors.seat);
  reinR.reanchor(anchors.bitR, anchors.seat);
}

// ---------------- batang penarik (thills) nyata: putar di pangkal, ujung ke kalung ----------------
const _shaftPivotW = new THREE.Vector3();
const _shaftDirW = new THREE.Vector3();
const _shaftCollarMid = new THREE.Vector3();
const _shaftQ = new THREE.Quaternion();
const SHAFT_BASE_PITCH = Math.atan2(HC.shaftTipY - HC.shaftHingeY, HC.shaftTipVox - 24.0);  // kemiringan batang model
const SHAFT_LEN = (HC.shaftTipVox - 24.0) * HC.cartVS;
const hitchAnim = { active: false, elapsed: 0, targetX: 0, targetZ: 0, targetYaw: 0 };
window.HITCH_ANIM = hitchAnim;

function updateShafts(dt) {
  const sg = cart.shaftGroup;
  if (!sg) return;

  if (physics.flipped) {
    sg.rotation.order = 'YXZ';
    sg.rotation.y = HC.damp(sg.rotation.y, 0, 10, dt);
    sg.rotation.z = HC.damp(sg.rotation.z, -SHAFT_BASE_PITCH * 0.5, 10, dt);
    sg.scale.x = HC.damp(sg.scale.x, 1, 10, dt);
    return;
  }

  if (!physics.hitched && !hitchAnim.active) {
    sg.rotation.order = 'YXZ';
    sg.rotation.y = HC.damp(sg.rotation.y, 0, 12, dt);
    sg.rotation.z = HC.damp(sg.rotation.z, -SHAFT_BASE_PITCH - 0.05, 12, dt);
    sg.scale.x = HC.damp(sg.scale.x, 1, 12, dt);
    return;
  }

  sg.getWorldPosition(_shaftPivotW);
  _shaftCollarMid.copy(anchors.a).add(anchors.c).multiplyScalar(0.5);
  _shaftDirW.copy(_shaftCollarMid).sub(_shaftPivotW);

  // ubah ke kerangka bak (bak = chassis, rotasinya ikut roll/pitch/yaw gerobak)
  cart.body.getWorldQuaternion(_shaftQ);
  _shaftQ.invert();
  _shaftDirW.applyQuaternion(_shaftQ);

  const horiz = Math.hypot(_shaftDirW.x, _shaftDirW.z);
  if (horiz > 0.25) {
    const yawWant = Math.atan2(-_shaftDirW.z, _shaftDirW.x);
    const pitchWant = Math.atan2(_shaftDirW.y, horiz) - SHAFT_BASE_PITCH;
    const rate = hitchAnim.active ? 9 : 26;
    // dilancarkan dikit biar nggak geter, tapi tetap ikut kuda (bukan animasi lepas)
    sg.rotation.order = 'YXZ';
    sg.rotation.y = HC.damp(sg.rotation.y, HC.clamp(yawWant, -1.15, 1.15), rate, dt);
    sg.rotation.z = HC.damp(sg.rotation.z, HC.clamp(pitchWant, -0.5, 0.5), rate, dt);
    // panjang batang sedikit nyesuai jarak kalung (toleransi kecil, biar ujungnya nempel)
    const want = Math.max(0.88, Math.min(1.12, horiz / SHAFT_LEN));
    sg.scale.x = HC.damp(sg.scale.x, want, hitchAnim.active ? 9 : 18, dt);
  }
}

function rebuildCartFromStore() {
  const newCart = HC.buildCart(PIVOT_Y, store.cartConfig());
  physics.swapCart(newCart, animator.x, animator.z, animator.yaw);
  physics.joltScale = store.joltScale();
  cart = newCart;
  window.RIG.cart = newCart;
  party.bindCart(cart);
  if (party.members.length) party.mount(cart);   // penumpang NPC duduk ikut pindah ke bak baru
  reanchorRopes();
}

const ui = initUpgradeUI({
  store,
  onSelect(key, idx) {
    if (store.setLevel(key, idx)) {
      rebuildCartFromStore();
      ui.refresh();
    }
  },
  onPreset(kind) {
    if (kind === 'max') store.maxAll();
    else if (kind === 'min') store.minAll();
    else store.reset();
    rebuildCartFromStore();
    ui.refresh();
  }
});

// ---------------- camera / controls ----------------
const controls = new HC.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.2;
controls.maxDistance = 42;
controls.maxPolarAngle = Math.PI * 0.485;
function isPortraitMobile() {
  return window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
}
controls.target.set(startPose.x + 0.8, startY + 1.2, startPose.z + 2.5);
if (isPortraitMobile()) {
  camera.position.set(startPose.x + 7.2, startY + 5.8, startPose.z - 10.5);
} else {
  camera.position.set(startPose.x + 5.8, startY + 5.0, startPose.z - 8.2);
}
controls.update();
if (world.syncCamera) world.syncCamera(camera);

const panelEl = document.getElementById('upgrade-panel');
const followTarget = new THREE.Vector3();

// ---------------- UI ----------------
const hudState = document.getElementById('hud-state');
const hudSpeed = document.getElementById('hud-speed');
const hudHead = document.getElementById('hud-head');
const hudRoll = document.getElementById('hud-roll');
const hudCargo = document.getElementById('hud-cargo');
const hudWheel = document.getElementById('hud-wheel');
const hudNpc = document.getElementById('hud-npc');
const hudNpcMsg = document.getElementById('hud-npc-msg');

// Bar HP / stamina / lapar / haus + pesan kontekstual.
const VITAL_ROWS = [['hp', 'v-hp'], ['stamina', 'v-sta'], ['hunger', 'v-food'], ['thirst', 'v-water']];
function syncVitals() {
  for (const [key, id] of VITAL_ROWS) {
    const val = Math.round(survival[key]);
    const el = document.getElementById(id);
    if (el) el.style.width = val + '%';
    const txt = document.getElementById(id + '-t');
    if (txt) txt.textContent = String(val);
    if (el && el.parentElement && el.parentElement.parentElement) {
      el.parentElement.parentElement.classList.toggle('low', val < 25);
    }
  }
  const msg = document.getElementById('v-msg');
  if (msg && msg.textContent !== survival.msg) msg.textContent = survival.msg;
}

const stateLabel = { walk: 'JALAN', run: 'LARI', jump: 'LOMPAT', graze: 'MAKAN RUMPUT' };

function bindBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  const handler = (e) => { e.preventDefault(); fn(); };
  el.addEventListener('click', handler);
  el.addEventListener('touchstart', handler, { passive: false });
}

// ---- kondisi kuda: stamina / HP / lapar / haus ----
const survival = new Survival({ map: HC.MAP, world });
let runLatched = false;
const keysHeld = { forward: false, backward: false, left: false, right: false };
let btnForwardHeld = false;
let btnBackwardHeld = false;

function syncSteerInput() {
  animator.setSteer(keysHeld.left ? 1 : keysHeld.right ? -1 : 0);
}

function toggleRun() {
  runLatched = !runLatched;
  animator.setState(runLatched ? 'run' : 'walk');
  if (touchUI && touchUI.setRunLatched) touchUI.setRunLatched(runLatched);
}
const survCtx = () => ({
  x: animator.x, z: animator.z, speed: animator.speed,
  moving: Math.abs(animator.throttle) > 0.06,
  running: animator.state === 'run' && animator.throttle > 0.06,
  flipped: !!physics.flipped,
  unhitched: !physics.hitched,
});
function stopForSurvivalAction() {
  keysHeld.forward = false;
  keysHeld.backward = false;
  btnForwardHeld = false;
  btnBackwardHeld = false;
  hitchAnim.active = false;
  animator.cancelDocking();
  animator.setThrottle(0);
  animator.speed = 0;
  animator.targetSpeed = 0;
}
function doEat() {
  stopForSurvivalAction();
  const ctx = survCtx();
  ctx.speed = 0;
  const ok = survival.tryEat(ctx);
  if (ok) animator.setState('graze');
  syncVitals();
}
function doDrink() {
  stopForSurvivalAction();
  const ctx = survCtx();
  ctx.speed = 0;
  const ok = survival.tryDrink(ctx);
  if (ok) {
    animator.setState('graze');
    if (world.triggerPondRipple) world.triggerPondRipple(animator.x, animator.z);
  }
  syncVitals();
}
function doJump() {
  const cost = physics.hitched ? 6 : 4;
  if (survival.stamina < cost) { survival.msg = 'Stamina kurang buat lompat.'; syncVitals(); return; }
  survival.stamina = Math.max(0, survival.stamina - cost);
  animator.setState('jump');
}

const btnWalkEl = document.getElementById('btn-walk');
if (btnWalkEl) {
  const startWalk = (e) => {
    e.preventDefault();
    btnForwardHeld = true;
    btnWalkEl.classList.add('held');
    if (!survival.eating && !survival.drinking && animator.state === 'graze') {
      animator.setState(runLatched ? 'run' : 'walk');
    }
  };
  const stopWalk = (e) => {
    if (e) e.preventDefault();
    btnForwardHeld = false;
    btnWalkEl.classList.remove('held');
  };
  btnWalkEl.addEventListener('pointerdown', startWalk);
  btnWalkEl.addEventListener('pointerup', stopWalk);
  btnWalkEl.addEventListener('pointerleave', stopWalk);
  btnWalkEl.addEventListener('pointercancel', stopWalk);
  btnWalkEl.addEventListener('touchstart', startWalk, { passive: false });
  btnWalkEl.addEventListener('touchend', stopWalk, { passive: false });
  btnWalkEl.addEventListener('touchcancel', stopWalk, { passive: false });
}
const btnRevEl = document.getElementById('btn-rev');
if (btnRevEl) {
  const startRev = (e) => {
    e.preventDefault();
    btnBackwardHeld = true;
    btnRevEl.classList.add('held');
    if (!survival.eating && !survival.drinking && animator.state === 'graze') {
      animator.setState('walk');
    }
  };
  const stopRev = (e) => {
    if (e) e.preventDefault();
    btnBackwardHeld = false;
    btnRevEl.classList.remove('held');
  };
  btnRevEl.addEventListener('pointerdown', startRev);
  btnRevEl.addEventListener('pointerup', stopRev);
  btnRevEl.addEventListener('pointerleave', stopRev);
  btnRevEl.addEventListener('pointercancel', stopRev);
  btnRevEl.addEventListener('touchstart', startRev, { passive: false });
  btnRevEl.addEventListener('touchend', stopRev, { passive: false });
  btnRevEl.addEventListener('touchcancel', stopRev, { passive: false });
}
bindBtn('btn-run', () => toggleRun());
bindBtn('btn-jump', () => doJump());
bindBtn('btn-graze', () => doEat());
bindBtn('btn-drink', () => doDrink());

const touchUI = initTouchControls({
  animator, survival,
  onJump: doJump, onEat: doEat, onDrink: doDrink, onRunToggle: toggleRun, onHitch: toggleHitch,
  isTouchDevice: matchMedia('(pointer: coarse)').matches,
});
// Kuda mulai diam sampai input maju (W/↑ atau analog) ditekan.
animator.setThrottle(0);
function rampPeakForCart() {
  // Tinggi "sayap miring" di satu sisi roda. Suspensi makin kaku (Lv2/Lv3),
  // makin tinggi batu yang dibutuhin buat bikin bodi miring lewat 75°.
  // Tetap fisika: gaya yang bikin miring datang dari roda naik tanjakan.
  const sus = (cart.specs && cart.specs.susSpec) || {};
  const t = sus.tier || 0;
  // gerobak 1.5x: tanjakan ikut diskalakan biar sudut miring per meter sama
  return (1.90 + t * 0.40) * HC.cartScale;
}
// tanjakan miring ditaruh di jalur RODA KANAN gerobak (bukan di depan kuda),
// supaya berapa pun sudut beloknya, roda kanan tetap naik ke punggung tanjakan
function spawnTipRamp() {
  const ph = physics;
  const fx = Math.cos(ph.yaw), fz = -Math.sin(ph.yaw);
  let rw = null;
  for (const w of ph.wheels) if (w.ref.front && w.wa.z < 0) rw = w;
  if (!rw) rw = ph.wheels[0];
  // hitung posisi roda dari state fisika terkini (jangan pakai w.world yang bisa basi
  // tepat setelah gerobak di-rebuild oleh tombol upgrade)
  const rv = new THREE.Vector3(rw.wa.x, rw.wa.y, rw.wa.z).applyQuaternion(ph.q || new THREE.Quaternion());
  const wx = ph.pos.x + rv.x, wz = ph.pos.z + rv.z;
  // PENTING: pangkal tanjakan ditaruh SEDIKIT DI DEPAN roda (bukan 1 m di belakangnya).
  // Kalau roda udah nyemplung di tengah tanjakan pas tombol dipencet, pegas roda langsung
  // njeblos -> gerobak kelacak ke udara. Dengan u~0 di pangkal, roda naik mulus dari nol.
  const ox = wx + fx * 0.20 * HC.cartScale;
  const oz = wz + fz * 0.20 * HC.cartScale;
  world.spawnRampAt(ox, oz, ph.yaw, rampPeakForCart(),
    2.2 * HC.cartScale, 1.35 * HC.cartScale, 0.92 * HC.cartScale);
  animator.setState('run');
}
bindBtn('btn-ramp', spawnTipRamp);
bindBtn('btn-pebble', () => {
  world.spawnPebbleClusterAhead(animator.x, animator.z, animator.yaw);
  animator.setState('run');
});
const npcDockEl = document.getElementById('npc-dock');
let _lastDockSig = '';
const hexCss = (n, fallback) => '#' + ((typeof n === 'number' ? n : fallback) >>> 0).toString(16).padStart(6, '0');
function bindTapSafe(el, fn) {
  let lastTouch = 0;
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    lastTouch = performance.now();
    fn();
  }, { passive: false });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (performance.now() - lastTouch < 400) return;
    fn();
  });
}
function syncNpcHud() {
  physics.damageScale = party.defenseScale();
  if (hudNpcMsg) hudNpcMsg.textContent = party.lastMessage;
  if (hudNpc) {
    const names = party.squad.map((r) => `${r.e || ''}${r.name}`).join(', ');
    hudNpc.textContent = `${party.squad.length}/${HC.NPC_TEAM_MAX}` + (names ? ` — ${names}` : '');
  }
}
function renderNpcDock() {
  if (!npcDockEl) return;
  const near = party.members.length < HC.NPC_TEAM_MAX ? party.nearby(animator.x, animator.z) : null;
  const isStationary = Math.abs(animator.speed) < 0.85 && Math.hypot(physics.vel.x, physics.vel.z) < 0.85;
  const canHitchAction = !physics.flipped && (!physics.hitched || isStationary || hitchAnim.active);
  const al = (!physics.hitched && !physics.flipped) ? getHitchAlignment() : null;
  const hitchMode = !canHitchAction ? 'none'
    : hitchAnim.active ? 'docking'
    : physics.hitched ? 'detach'
    : al.ready ? 'attach'
    : !al.alignedYaw ? 'yaw'
    : !al.alignedLat ? 'lat'
    : al.longErr > 1.25 ? 'rev'
    : 'pos';
  const sig = party.members.map((m) => `${m.uid}:${m.role.id}:${m.state}:${m.inCombat ? 'C' : ''}:${Math.round(m.hp ?? m.maxHp ?? 100)}`).join('|') +
    '#' + (near ? near.npc.role.id : '') +
    '@' + hitchMode + (physics.flipped ? ':F' : '');
  if (sig === _lastDockSig) return;
  _lastDockSig = sig;

  npcDockEl.innerHTML = '';
  const hasAny = party.members.length > 0 || !!near || canHitchAction;
  npcDockEl.hidden = !hasAny;
  if (!hasAny) return;

  const stateText = {
    boarding: 'Menuju Bak...',
    hopping_in: 'Naik Kursi...',
    seated: 'Di Kursi',
    following: 'Jalan Ikut',
    fallen: 'Terjatuh!',
    helping_flip: 'Bantu Angkat',
  };
  for (const m of party.members) {
    const r = m.role;
    const card = document.createElement('div');
    card.className = 'npc-card' + (m.inCombat ? ' fighting' : '');
    card.dataset.uid = String(m.uid);
    card.dataset.state = m.state;

    const rarityCls = r.mythic ? 'mythic' : r.legendary ? 'legendary' : r.rare ? 'rare' : '';
    const robe = hexCss(r.robe, 0x4f6b34);
    const hood = hexCss(r.hood, 0x3c4a68);
    const curHp = Math.max(0, Math.round(m.hp ?? r.hp ?? 100));
    const maxHp = Math.max(1, Math.round(m.maxHp ?? r.hp ?? 100));
    const hpPct = Math.round((curHp / maxHp) * 100);
    const dotCls = m.inCombat ? 'fighting' : m.state;
    const statusLabel = m.inCombat ? '⚔ Bertarung' : (stateText[m.state] || m.state);

    const top = document.createElement('div');
    top.className = 'npc-card-top';
    top.innerHTML =
      `<div class="npc-thumb ${rarityCls}" style="--robe:${robe};--hood:${hood}">` +
        `<span>${r.e || '👤'}</span>` +
        `<i class="npc-dot ${dotCls}"></i>` +
      `</div>` +
      `<div class="npc-meta">` +
        `<div class="npc-name">${r.name}</div>` +
        `<div class="npc-state">${statusLabel}</div>` +
        (m.inCombat || curHp < maxHp
          ? `<div class="npc-hp-mini"><i style="width:${hpPct}%"></i></div>`
          : '') +
      `</div>`;
    card.appendChild(top);

    const acts = document.createElement('div');
    acts.className = 'npc-actions';
    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    const canBoard = m.state === 'following';
    btnToggle.className = 'npc-toggle' + (canBoard ? ' mount' : '');
    if (m.state === 'hopping_in') {
      btnToggle.disabled = true;
      btnToggle.textContent = 'Naik...';
    } else if (m.state === 'fallen') {
      btnToggle.disabled = true;
      btnToggle.textContent = 'Terjatuh';
    } else if (m.state === 'helping_flip') {
      btnToggle.disabled = true;
      btnToggle.textContent = 'Dorong...';
    } else if (canBoard && physics.flipped) {
      btnToggle.disabled = true;
      btnToggle.textContent = '⬆ Terbalik';
    } else if (canBoard) {
      btnToggle.textContent = '⬆ Naik';
      bindTapSafe(btnToggle, () => {
        party.toggleMemberMount(m.uid);
        syncNpcHud();
        renderNpcDock();
      });
    } else {
      btnToggle.textContent = '⬇ Turun';
      bindTapSafe(btnToggle, () => {
        party.toggleMemberMount(m.uid);
        syncNpcHud();
        renderNpcDock();
      });
    }
    const btnKick = document.createElement('button');
    btnKick.type = 'button';
    btnKick.className = 'npc-kick';
    btnKick.title = 'Lepas NPC';
    btnKick.textContent = '×';
    bindTapSafe(btnKick, () => {
      party.releaseMember(m.uid);
      syncNpcHud();
      renderNpcDock();
    });

    acts.appendChild(btnToggle);
    acts.appendChild(btnKick);
    card.appendChild(acts);
    npcDockEl.appendChild(card);
  }

  if (near) {
    const r = near.npc.role;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'npc-nearby-card';
    pill.textContent = `+ Rekrut ${r.e || ''} ${r.name}`;
    bindTapSafe(pill, recruitNearbyNPC);
    npcDockEl.appendChild(pill);
  }

  if (canHitchAction) {
    const hBtn = document.createElement('button');
    hBtn.type = 'button';
    hBtn.className = 'npc-hitch-card' + (!physics.hitched ? ' free' : '');
    if (hitchAnim.active) {
      hBtn.textContent = '⏳ Ngepasin Posisi...';
      hBtn.disabled = true;
    } else if (physics.hitched) {
      hBtn.textContent = '🔓 Lepas Tali Gerobak';
    } else if (al && al.ready) {
      hBtn.textContent = '🔗 Pasang Tali Gerobak';
    } else {
      hBtn.textContent = !al.alignedYaw ? '🔗 Luruskan Arah Kuda'
        : !al.alignedLat ? '🔗 Tengahkan di Batang'
        : al.longErr > 1.25 ? '🔗 Mundur ke Batang Depan'
        : '🔗 Posisikan di Batang Depan';
      hBtn.disabled = true;
    }
    bindTapSafe(hBtn, toggleHitch);
    npcDockEl.appendChild(hBtn);
  }
}
party.onChange = renderNpcDock;

function recruitNearbyNPC() {
  party.recruit(animator.x, animator.z);
  syncNpcHud();
  renderNpcDock();
}
function releaseLastNPC() {
  party.releaseLast();
  syncNpcHud();
  renderNpcDock();
}
bindBtn('btn-recruit', recruitNearbyNPC);
bindBtn('btn-release', releaseLastNPC);
window.recruitNearbyNPC = recruitNearbyNPC;
window.releaseLastNPC = releaseLastNPC;
const ALL_ROPES = [towL, towR, traceL, traceR, reinL, reinR];
function setRopesVisible(v) {
  for (const r of ALL_ROPES) if (r && r.setVisible) r.setVisible(v);
}

function _wrapAng(a) {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function getHitchAlignment() {
  const cfx = Math.cos(physics.yaw), cfz = -Math.sin(physics.yaw);
  const clx = -cfz, clz = cfx;
  const targetX = physics.pos.x + cfx * HITCH_DIST;
  const targetZ = physics.pos.z + cfz * HITCH_DIST;
  const dx = animator.x - targetX;
  const dz = animator.z - targetZ;
  const longErr = dx * cfx + dz * cfz;
  const latErr = dx * clx + dz * clz;
  const yawErr = _wrapAng(animator.yaw - physics.yaw);
  const alignedYaw = Math.abs(yawErr) <= 0.52;
  const alignedLat = Math.abs(latErr) <= 0.68;
  const alignedLong = longErr >= -0.58 && longErr <= 1.25;
  const ready = !physics.flipped && !physics.hitched && alignedYaw && alignedLat && alignedLong;
  return {
    ready,
    alignedYaw, alignedLat, alignedLong,
    longErr, latErr, yawErr,
    targetX, targetZ, targetYaw: physics.yaw,
  };
}
window.getHitchAlignment = getHitchAlignment;

const btnHitchEl = document.getElementById('btn-hitch');
let _lastHitchSig = '';
function syncHitchUi() {
  if (!btnHitchEl) return;
  const free = !physics.hitched;
  const movingFast = Math.abs(animator.speed) >= 0.85 || Math.hypot(physics.vel.x, physics.vel.z) >= 0.85;
  const al = (free && !physics.flipped) ? getHitchAlignment() : null;
  const hint = physics.flipped ? 'F'
    : hitchAnim.active ? 'A'
    : !free ? (movingFast ? 'M' : 'H')
    : al.ready ? 'R'
    : !al.alignedYaw ? 'Y'
    : !al.alignedLat ? 'L'
    : al.longErr > 1.25 ? 'B' : 'P';
  if (hint === _lastHitchSig) return;
  _lastHitchSig = hint;
  btnHitchEl.classList.toggle('active-free', free);
  if (physics.flipped) {
    btnHitchEl.disabled = true;
    btnHitchEl.textContent = '⚠ Terbalik';
  } else if (hitchAnim.active) {
    btnHitchEl.disabled = true;
    btnHitchEl.textContent = '⏳ Ngepasin...';
  } else if (physics.hitched) {
    btnHitchEl.disabled = movingFast;
    btnHitchEl.textContent = movingFast ? '🔗 Berhenti Dulu' : '🔓 Lepas Tali [V]';
  } else if (al.ready) {
    btnHitchEl.disabled = false;
    btnHitchEl.textContent = '🔗 Pasang Tali [V]';
  } else {
    btnHitchEl.disabled = true;
    btnHitchEl.textContent = !al.alignedYaw ? '🔗 Luruskan Arah'
      : !al.alignedLat ? '🔗 Tengahkan Posisi'
      : al.longErr > 1.25 ? '🔗 Mundur ke Batang'
      : '🔗 Mundur Pas Batang';
  }
  if (touchUI && touchUI.setHitchState) {
    const sub = physics.flipped ? 'terbalik'
      : hitchAnim.active ? 'ngepasin'
      : physics.hitched ? (movingFast ? 'berhenti' : 'lepas')
      : al.ready ? 'pasang!'
      : 'dekatkan';
    touchUI.setHitchState({ free, disabled: !!btnHitchEl.disabled, sub });
  }
}

function unhitchCart(fromFlip = false) {
  if (!fromFlip) {
    if (physics.flipped) {
      survival.msg = 'Gerobak sedang terbalik!';
      syncVitals();
      return false;
    }
    const movingFast = Math.abs(animator.speed) >= 0.85 || Math.hypot(physics.vel.x, physics.vel.z) >= 0.85;
    if (physics.hitched && movingFast) {
      survival.msg = 'Hentikan kuda & gerobak dulu sebelum melepas tali.';
      syncVitals();
      return false;
    }
  }
  hitchAnim.active = false;
  hitchAnim.elapsed = 0;
  animator.cancelDocking();
  physics.hitched = false;
  animator.unhitched = true;
  setRopesVisible(false);
  if (!fromFlip) {
    survival.msg = 'Tali dilepas — kuda bebas bergerak & bisa mundur/putar bebas.';
    syncVitals();
  }
  _lastDockSig = '';
  _lastHitchSig = '';
  renderNpcDock();
  syncHitchUi();
  return true;
}

function finalizeReHitch() {
  hitchAnim.active = false;
  hitchAnim.elapsed = 0;
  animator.cancelDocking();
  animator.speed = 0;
  animator.targetSpeed = 0;
  animator.yawRate = 0;
  animator.steer = 0;
  animator.setThrottle(0);
  animator.unhitched = false;
  animator.yaw = physics.yaw;
  animator.forwardX = Math.cos(physics.yaw);
  animator.forwardZ = -Math.sin(physics.yaw);
  animator.x = physics.pos.x + animator.forwardX * HITCH_DIST;
  animator.z = physics.pos.z + animator.forwardZ * HITCH_DIST;
  physics.vel.set(0, 0, 0);
  physics.angVel = 0;
  physics.hitched = true;
  physics.unhitchedDroop = 0;
  animator.update(0.001);
  if (physics.syncVisual) physics.syncVisual();
  setRopesVisible(true);
  resetRopes();
  survival.msg = 'Tali terpasang — gerobak siap ditarik kembali.';
  syncVitals();
  _lastDockSig = '';
  _lastHitchSig = '';
  renderNpcDock();
  syncHitchUi();
}

function reHitchCart() {
  if (physics.flipped) {
    survival.msg = 'Balikkan gerobak terlebih dahulu.';
    syncVitals();
    return false;
  }
  if (physics.hitched || hitchAnim.active) return true;
  const al = getHitchAlignment();
  if (!al.ready) {
    if (!al.alignedYaw) survival.msg = 'Luruskan arah hadap kuda searah gerobak dulu.';
    else if (!al.alignedLat) survival.msg = 'Tengahkan posisi kuda di antara kedua batang depan.';
    else if (al.longErr > 1.25) survival.msg = 'Mundurkan kuda perlahan hingga masuk di antara dua batang depan.';
    else survival.msg = 'Posisikan kuda tepat di antara kedua pegangan gerobak depan.';
    syncVitals();
    return false;
  }
  keysHeld.forward = false;
  keysHeld.backward = false;
  btnForwardHeld = false;
  btnBackwardHeld = false;
  hitchAnim.active = true;
  hitchAnim.elapsed = 0;
  hitchAnim.targetX = al.targetX;
  hitchAnim.targetZ = al.targetZ;
  hitchAnim.targetYaw = al.targetYaw;
  animator.docking = { x: al.targetX, z: al.targetZ, yaw: al.targetYaw, arrived: false };
  survival.msg = 'Kuda mengepasin posisi perlahan ke batang gerobak...';
  syncVitals();
  _lastDockSig = '';
  _lastHitchSig = '';
  renderNpcDock();
  syncHitchUi();
  return true;
}

function toggleHitch() {
  if (physics.hitched) return unhitchCart(false);
  return reHitchCart();
}
bindBtn('btn-hitch', toggleHitch);
window.toggleHitch = toggleHitch;

// ---- Minigame Balikkan Gerobak (dibantu NPC) ----
const flipBannerEl = document.getElementById('flip-banner');
const fbNpcCountEl = document.getElementById('fb-npc-count');
const btnStartFlipEl = document.getElementById('btn-start-flip');
const flipGameEl = document.getElementById('flip-minigame');
const fmHelpBadgeEl = document.getElementById('fm-help-badge');
const fmProgFillEl = document.getElementById('fm-prog-fill');
const fmProgPctEl = document.getElementById('fm-prog-pct');
const fmZoneEl = document.getElementById('fm-zone');
const fmPerfectEl = document.getElementById('fm-perfect');
const fmCursorEl = document.getElementById('fm-cursor');
const fmFeedbackEl = document.getElementById('fm-feedback');
const btnFlipPushEl = document.getElementById('btn-flip-push');
const btnFlipCancelEl = document.getElementById('btn-flip-cancel');

let _lastBannerSig = '';
function syncFlipBanner() {
  if (!flipBannerEl) return;
  const show = !!physics.flipped && !flipGame.active;
  const npcN = party.members.length;
  const sig = `${show ? '1' : '0'}|${npcN}`;
  if (sig === _lastBannerSig) return;
  _lastBannerSig = sig;
  flipBannerEl.hidden = !show;
  flipBannerEl.style.display = show ? '' : 'none';
  if (fbNpcCountEl) {
    fbNpcCountEl.textContent = npcN > 0
      ? `${npcN} NPC siap membantu`
      : 'Sendirian (lebih berat — rekrut NPC jika ada)';
  }
}

const flipGame = {
  active: false,
  progress: 0,
  cursor: 0.5,
  dir: 1,
  zoneCenter: 0.5,
  cooldown: 0,
  _shakeTimer: null,

  configForCount(npcCount) {
    const c = Math.max(0, Math.min(4, Math.floor(npcCount || 0)));
    const table = [
      { zoneWidth: 0.18, perfectWidth: 0.06, cursorSpeed: 1.45, gainGood: 14, gainPerfect: 22, missPenalty: 12, decayPerSec: 4.2, label: '0 NPC (Sendirian — Berat!)' },
      { zoneWidth: 0.26, perfectWidth: 0.09, cursorSpeed: 1.22, gainGood: 20, gainPerfect: 30, missPenalty: 9,  decayPerSec: 2.8, label: '1 NPC Membantu (+Mudah)' },
      { zoneWidth: 0.34, perfectWidth: 0.12, cursorSpeed: 1.04, gainGood: 26, gainPerfect: 38, missPenalty: 6,  decayPerSec: 1.6, label: '2 NPC Membantu (+Lebih Mudah)' },
      { zoneWidth: 0.42, perfectWidth: 0.16, cursorSpeed: 0.88, gainGood: 32, gainPerfect: 46, missPenalty: 4,  decayPerSec: 0.8, label: '3 NPC Membantu (Sangat Ringan!)' },
    ];
    return table[Math.min(3, c)];
  },

  _render(cfg) {
    const c = cfg || this.configForCount(party.members.length);
    if (fmHelpBadgeEl) fmHelpBadgeEl.textContent = c.label;
    const pct = Math.max(0, Math.min(100, Math.round(this.progress)));
    if (fmProgFillEl) fmProgFillEl.style.width = pct + '%';
    if (fmProgPctEl) fmProgPctEl.textContent = pct + '%';
    if (fmZoneEl) {
      fmZoneEl.style.left = ((this.zoneCenter - c.zoneWidth * 0.5) * 100).toFixed(2) + '%';
      fmZoneEl.style.width = (c.zoneWidth * 100).toFixed(2) + '%';
    }
    if (fmPerfectEl) {
      fmPerfectEl.style.left = ((this.zoneCenter - c.perfectWidth * 0.5) * 100).toFixed(2) + '%';
      fmPerfectEl.style.width = (c.perfectWidth * 100).toFixed(2) + '%';
    }
    if (fmCursorEl) {
      fmCursorEl.style.left = (this.cursor * 100).toFixed(2) + '%';
    }
  },

  _setFeedback(text, kind) {
    if (!fmFeedbackEl) return;
    fmFeedbackEl.textContent = text;
    fmFeedbackEl.dataset.kind = kind || '';
  },

  _shake() {
    if (!flipGameEl) return;
    flipGameEl.classList.remove('fm-shake');
    void flipGameEl.offsetWidth;
    flipGameEl.classList.add('fm-shake');
    if (this._shakeTimer) clearTimeout(this._shakeTimer);
    this._shakeTimer = setTimeout(() => flipGameEl.classList.remove('fm-shake'), 320);
  },

  start() {
    if (!physics.flipped) return false;
    this.active = true;
    this.progress = 8;
    this.cursor = 0.18;
    this.dir = 1;
    this.zoneCenter = 0.5;
    this.cooldown = 0;
    party.setHelpingFlip(true);
    if (flipGameEl) {
      flipGameEl.hidden = false;
      flipGameEl.style.display = '';
    }
    this._setFeedback('Tekan SPASI atau DORONG saat jarum di zona hijau!', 'info');
    this._render();
    _lastDockSig = '';
    renderNpcDock();
    syncFlipBanner();
    return true;
  },

  stop(succeeded = false) {
    this.active = false;
    if (!succeeded) physics.liftProgress = 0;
    party.setHelpingFlip(false);
    if (flipGameEl) {
      flipGameEl.hidden = true;
      flipGameEl.style.display = 'none';
    }
    _lastDockSig = '';
    _lastBannerSig = '';
    renderNpcDock();
    syncFlipBanner();
  },

  step(dt) {
    if (!this.active) return;
    if (!physics.flipped) {
      this.stop(false);
      return;
    }
    const cfg = this.configForCount(party.members.length);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    this.cursor += this.dir * cfg.cursorSpeed * dt;
    if (this.cursor >= 0.96) { this.cursor = 0.96; this.dir = -1; }
    else if (this.cursor <= 0.04) { this.cursor = 0.04; this.dir = 1; }
    if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - cfg.decayPerSec * dt);
    }
    physics.liftProgress = Math.max(0, Math.min(1, this.progress / 100));
    this._render(cfg);
  },

  push() {
    if (!this.active || !physics.flipped) return false;
    if (this.cooldown > 0) return false;
    this.cooldown = 0.20;
    const npcN = party.members.length;
    const cfg = this.configForCount(npcN);
    const dist = Math.abs(this.cursor - this.zoneCenter);
    if (dist <= cfg.perfectWidth * 0.5) {
      this.progress = Math.min(100, this.progress + cfg.gainPerfect);
      this._setFeedback(`SEMPURNA! Angkatan kuat (+${cfg.gainPerfect}%)`, 'perfect');
      this.zoneCenter = 0.34 + Math.random() * 0.32;
    } else if (dist <= cfg.zoneWidth * 0.5) {
      this.progress = Math.min(100, this.progress + cfg.gainGood);
      this._setFeedback(`BAGUS! Terus dorong (+${cfg.gainGood}%)`, 'good');
      this.zoneCenter = 0.34 + Math.random() * 0.32;
    } else {
      this.progress = Math.max(0, this.progress - cfg.missPenalty);
      this._setFeedback(`MELESET! (-${cfg.missPenalty}%) Tunggu zona hijau`, 'miss');
      this._shake();
    }
    physics.liftProgress = Math.max(0, Math.min(1, this.progress / 100));
    this._render(cfg);

    if (this.progress >= 100) {
      physics.liftProgress = 1;
      physics.rightCartInPlace();
      this.stop(true);
      survival.msg = npcN > 0
        ? `Gerobak berhasil ditegakkan bersama ${npcN} NPC! Dekati gerobak untuk pasang tali.`
        : 'Gerobak berhasil ditegakkan! Dekati gerobak untuk pasang tali.';
      syncVitals();
      syncNpcHud();
      syncHitchUi();
    }
    return true;
  },
};

if (btnStartFlipEl) bindTapSafe(btnStartFlipEl, () => flipGame.start());
if (btnFlipPushEl) bindTapSafe(btnFlipPushEl, () => flipGame.push());
if (btnFlipCancelEl) bindTapSafe(btnFlipCancelEl, () => flipGame.stop(false));
if (flipBannerEl) { flipBannerEl.hidden = true; flipBannerEl.style.display = 'none'; }
if (flipGameEl) { flipGameEl.hidden = true; flipGameEl.style.display = 'none'; }
window.FLIP_GAME = flipGame;

physics.onFlip = () => {
  unhitchCart(true);
  party.onCartFlip(cart, physics);
  const dmgRep = physics.wheelReport ? physics.wheelReport() : [];
  const broken = dmgRep.filter((r) => r.detached).length;
  survival.msg = broken > 0
    ? `Gerobak terguling! Kuda terlepas, ${broken} roda lepas, NPC terjatuh.`
    : 'Gerobak terguling! Kuda terlepas, ban -20% HP, NPC terjatuh.';
  _lastDockSig = '';
  _lastBannerSig = '';
  syncVitals();
  syncNpcHud();
  renderNpcDock();
  syncHitchUi();
  syncFlipBanner();
};

function clearRamps() {
  if (!world || !world.ramps) return;
  for (let i = 0; i < world.ramps.length; i++) {
    const rp = world.ramps[i];
    if (rp && rp.mesh) scene.remove(rp.mesh);
  }
  world.ramps.length = 0;
}
function resetRig() {
  clearRamps();
  flipGame.stop(false);
  hitchAnim.active = false;
  hitchAnim.elapsed = 0;
  animator.cancelDocking();
  const pose = (world.initialHorsePose && (physics.flipped || !physics.hitched || Math.hypot(animator.x, animator.z) > 28))
    ? world.initialHorsePose()
    : { x: animator.x, z: animator.z, yaw: animator.yaw };
  animator.x = pose.x;
  animator.z = pose.z;
  animator.yaw = pose.yaw;
  animator.forwardX = Math.cos(pose.yaw);
  animator.forwardZ = -Math.sin(pose.yaw);
  animator.speed = 0;
  animator.targetSpeed = 0;
  animator.unhitched = false;
  animator.setThrottle(0);
  if (cart.shaftGroup) {
    cart.shaftGroup.rotation.set(0, 0, 0);
    cart.shaftGroup.scale.set(1, 1, 1);
  }
  physics.reset(animator.x, animator.z, animator.yaw);
  setRopesVisible(true);
  resetRopes();
  animator.setState('walk');
  _lastDockSig = '';
  _lastHitchSig = '';
  _lastBannerSig = '';
  renderNpcDock();
  syncHitchUi();
  syncFlipBanner();
}
bindBtn('btn-reset', resetRig);

// ---- Suasana & Lingkungan Hutan Cozy (Pagi / Sore / Malam + Api / Lampu / Sinar / Suara) ----
const vignetteEl = document.getElementById('cozy-vignette');
document.querySelectorAll('#hud [data-mood]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const m = btn.dataset.mood;
    if (world.setMood) world.setMood(m);
    document.querySelectorAll('#hud [data-mood]').forEach((b) => b.classList.toggle('active', b === btn));
    if (vignetteEl) vignetteEl.classList.toggle('night-mist', m === 'night');
  });
});

function bindEnvToggle(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const on = fn();
    el.classList.toggle('active', !!on);
  });
}
bindEnvToggle('env-fire', () => world.toggleCampfire && world.toggleCampfire());
bindEnvToggle('env-lamp', () => world.toggleHeadlights && world.toggleHeadlights());
bindEnvToggle('env-rays', () => world.toggleSunbeams && world.toggleSunbeams());
bindEnvToggle('env-audio', () => world.toggleAudio && world.toggleAudio());

// ---- Interaksi klik langsung pada pohon, semak, kolam, api unggun, jamur, & truk ----
let _downPos = { x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => {
  _downPos.x = e.clientX;
  _downPos.y = e.clientY;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - _downPos.x, e.clientY - _downPos.y) > 6) return;
  if (!world.interactAt) return;
  const note = world.interactAt(e.clientX, e.clientY, camera);
  if (note) {
    survival.msg = note;
    const fireBtn = document.getElementById('env-fire');
    if (fireBtn) fireBtn.classList.toggle('active', !!world.isCampfireLit);
  }
});

// ---- kemudi kuda: tekan & tahan (kiri/kanan) ----
function bindSteer(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = (e) => { e.preventDefault(); animator.setSteer(dir); el.classList.add('held'); };
  const stop = (e) => { if (e) e.preventDefault(); animator.setSteer(0); el.classList.remove('held'); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend', stop, { passive: false });
  el.addEventListener('touchcancel', stop, { passive: false });
}
bindSteer('btn-left', 1);
bindSteer('btn-right', -1);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') {
    keysHeld.forward = true;
    if (!survival.eating && !survival.drinking && animator.state === 'graze') {
      animator.setState(runLatched ? 'run' : 'walk');
    }
    e.preventDefault();
  }
  else if (k === 's' || k === 'arrowdown') {
    keysHeld.backward = true;
    if (!survival.eating && !survival.drinking && animator.state === 'graze') {
      animator.setState('walk');
    }
    e.preventDefault();
  }
  else if (k === 'arrowleft' || k === 'a') { keysHeld.left = true; syncSteerInput(); e.preventDefault(); }
  else if (k === 'arrowright' || k === 'd') { keysHeld.right = true; syncSteerInput(); e.preventDefault(); }
  else if (k === '1') {
    runLatched = false;
    animator.setState('walk');
    if (touchUI && touchUI.setRunLatched) touchUI.setRunLatched(false);
  }
  else if (k === '2' || k === 'r' || k === 'shift') { if (!e.repeat) toggleRun(); }
  else if (k === ' ' || k === 'j' || k === 'enter') {
    if (flipGame.active && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      if (!e.repeat) flipGame.push();
    } else if (k === ' ' || k === 'j') {
      e.preventDefault();
      doJump();
    }
  }
  else if (k === 'escape') {
    if (flipGame.active) { e.preventDefault(); flipGame.stop(false); }
    else if (hitchAnim.active) {
      e.preventDefault();
      hitchAnim.active = false;
      hitchAnim.elapsed = 0;
      animator.cancelDocking();
      _lastDockSig = '';
      _lastHitchSig = '';
      renderNpcDock();
      syncHitchUi();
    }
  }
  else if (k === '3' || k === 'e') doEat();
  else if (k === '4' || k === 'f' || k === 'm') doDrink();
  else if (k === 't') spawnTipRamp();
  else if (k === 'b') world.spawnPebbleClusterAhead(animator.x, animator.z, animator.yaw);
  else if (k === 'g') recruitNearbyNPC();
  else if (k === 'h') releaseLastNPC();
  else if (k === 'v') { e.preventDefault(); if (!e.repeat) toggleHitch(); }
  else if (k === 'x') resetRig();
  else if (k === 'u') {
    const p = document.getElementById('upgrade-panel');
    if (p) p.classList.toggle('collapsed');
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keysHeld.forward = false;
  else if (k === 's' || k === 'arrowdown') keysHeld.backward = false;
  else if (k === 'arrowleft' || k === 'a') { keysHeld.left = false; syncSteerInput(); }
  else if (k === 'arrowright' || k === 'd') { keysHeld.right = false; syncSteerInput(); }
});
window.addEventListener('blur', () => {
  keysHeld.forward = false;
  keysHeld.backward = false;
  keysHeld.left = false;
  keysHeld.right = false;
  btnForwardHeld = false;
  btnBackwardHeld = false;
  animator.setSteer(0);
  animator.setThrottle(0);
});

// ---------------- loop ----------------
resetRopes();
scene.updateMatrixWorld(true);
syncHitchUi();
syncFlipBanner();

let last = performance.now();
let camPrevYaw = animator.yaw;
window.__manualSim = false;

function stepSim(dt) {
  // --- kondisi kuda dihitung sebelum gerak biar limiter berlaku di frame sama ---
  const wasActing = survival.eating || survival.drinking;
  const acting = wasActing;
  // Baik PC maupun mobile: kuda DIAM jika tombol maju/mundur atau analog tidak ditekan.
  const pcForward = !!(keysHeld.forward || btnForwardHeld || window.__forceForward);
  const pcBackward = !!(keysHeld.backward || btnBackwardHeld || window.__forceBackward);
  const stickActive = !!(touchUI.active && touchUI.joystick && touchUI.joystick.pad && touchUI.joystick.pad.active);
  if (hitchAnim.active) {
    // Sedang ngepasin perlahan ke pangkal batang gerobak
  } else if (acting) {
    animator.setThrottle(0);
  } else if (pcForward && !pcBackward) {
    if (animator.state === 'graze') animator.setState(runLatched ? 'run' : 'walk');
    animator.setThrottle(1);
  } else if (pcBackward && !pcForward) {
    if (animator.state === 'graze' || animator.state === 'run') {
      runLatched = false;
      animator.setState('walk');
      if (touchUI && touchUI.setRunLatched) touchUI.setRunLatched(false);
    }
    animator.setThrottle(-1);
  } else if (!stickActive) {
    animator.setThrottle(0);
  }
  if (!survival.canRun() && animator.state === 'run') {
    runLatched = false;
    animator.setState('walk');
    if (touchUI && touchUI.setRunLatched) touchUI.setRunLatched(false);
  }
  animator.speedScale = survival.speedScale();
  survival.update(dt, survCtx());
  const stillActing = survival.eating || survival.drinking;
  if (wasActing && !stillActing) animator.setState(runLatched ? 'run' : 'walk');

  animator.unhitched = !physics.hitched;
  animator.update(dt);
  if (world.keepHorseInValley) world.keepHorseInValley(animator, dt);
  if (world.resolveHorseCollision) {
    window.__lastEnvHit = world.resolveHorseCollision(animator);
  }

  // Penahan badan gerobak saat kuda bebas (agar mundur ke saku batang berhenti pas di depan bak,
  // tidak tembus ke dalam badan gerobak).
  if (!physics.hitched && !physics.flipped && !hitchAnim.active) {
    const cfx = Math.cos(physics.yaw), cfz = -Math.sin(physics.yaw);
    const clx = -cfz, clz = cfx;
    const tx = physics.pos.x + cfx * HITCH_DIST;
    const tz = physics.pos.z + cfz * HITCH_DIST;
    const dx = animator.x - tx, dz = animator.z - tz;
    const longErr = dx * cfx + dz * cfz;
    const latErr = dx * clx + dz * clz;
    if (longErr < -0.55 && longErr > -3.6 && Math.abs(latErr) < 1.15) {
      const penFront = -0.55 - longErr;
      const penRear = longErr - (-3.6);
      const penLat = 1.15 - Math.abs(latErr);
      if (penFront <= penRear && penFront <= penLat) {
        animator.x += cfx * penFront;
        animator.z += cfz * penFront;
        if (animator.speed < 0) animator.speed = 0;
      } else if (penRear <= penFront && penRear <= penLat) {
        animator.x -= cfx * penRear;
        animator.z -= cfz * penRear;
        if (animator.speed > 0) animator.speed = 0;
      } else {
        const s = latErr >= 0 ? 1 : -1;
        animator.x += clx * s * penLat;
        animator.z += clz * s * penLat;
      }
      if (animator.horse && animator.horse.root) {
        animator.horse.root.position.x = animator.x;
        animator.horse.root.position.z = animator.z;
      }
    }
  }
  world.setCartPose(physics.pos.x, physics.pos.z);
  world.update(animator.x, dt, animator.z, animator.yaw);
  party.update(animator.x, animator.z, animator.yaw, dt, cart, physics);
  mobs.update(dt, { animator, physics, party, camera, world });
  cullDistantNpcs(party.wild, animator.x, animator.z, quality.npcCull);
  // LOD dievaluasi tiap 12 frame saja: hasil tetap sama di mata, biaya CPU
  // turun (jarak warga jarang berubah signifikan dalam 0.2 s).
  if (quality.npcLod && (world.frameCounter % 12 === 0)) {
    updateNpcLod(party.wild, animator.x, animator.z, quality.npcLodNear);
  }
  party.applyEffects(dt, physics, world);
  for (const p of cart.npcPassengers || []) HC.animateNPC(p, dt);
  syncNpcHud();
  renderNpcDock();

  // anchor sabuk perut & kalung kuda harus segar sebelum physics:
  // gerobak ditarik lewat tali (traces) + dibimbing batang (thills)
  scene.updateMatrixWorld(true);
  readAnchors();
  physics.update(dt, animator.x, animator.speed, animator.z, animator.yaw, {
    collarL: anchors.a, collarR: anchors.c,
    girthL: anchors.gL, girthR: anchors.gR
  });

  if (physics.hitched && !physics.flipped && physics._envHit && physics._envHit.hit) {
    const tx = animator.x - physics.pos.x;
    const tz = animator.z - physics.pos.z;
    const tDist = Math.hypot(tx, tz);
    const maxTether = HITCH_DIST + 0.40;
    if (tDist > maxTether && tDist > 1e-4) {
      const nx = tx / tDist, nz = tz / tDist;
      animator.x = physics.pos.x + nx * maxTether;
      animator.z = physics.pos.z + nz * maxTether;
      const vOut = animator.speed * (animator.forwardX * nx + animator.forwardZ * nz);
      if (vOut > 0) animator.speed *= 0.20;
      if (world.resolveHorseCollision) world.resolveHorseCollision(animator);
      if (animator.horse && animator.horse.root) {
        animator.horse.root.position.x = animator.x;
        animator.horse.root.position.z = animator.z;
      }
    }
  }

  updateShafts(dt);

  if (hitchAnim.active) {
    hitchAnim.elapsed += dt;
    physics.unhitchedDroop = HC.damp(physics.unhitchedDroop || 0, 0, 7.5, dt);
    if (physics.syncVisual) physics.syncVisual();
    if ((animator.docking && animator.docking.arrived) || hitchAnim.elapsed >= 2.2) {
      finalizeReHitch();
    }
  }

  scene.updateMatrixWorld(true);
  readAnchors();
  if (physics.hitched) {
    towL.update(dt, anchors.a, anchors.b);
    towR.update(dt, anchors.c, anchors.d);
    traceL.update(dt, anchors.gL, anchors.stL);
    traceR.update(dt, anchors.gR, anchors.stR);
    reinL.update(dt, anchors.bitL, anchors.seat);
    reinR.update(dt, anchors.bitR, anchors.seat);
  }

  flipGame.step(dt);
  syncFlipBanner();
  syncHitchUi();

  const gyHorse = world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0;
  horseBlob.position.set(animator.x - Math.cos(animator.yaw) * 0.15, gyHorse + 0.02, animator.z + Math.sin(animator.yaw) * 0.15);
  cartBlob.position.set(cart.root.position.x, (world.terrainHeightAt ? world.terrainHeightAt(cart.root.position.x, cart.root.position.z) : 0) + 0.02, cart.root.position.z);

  const panelOpenMobile = isPortraitMobile() && panelEl && !panelEl.classList.contains('collapsed');
  // fokus di dekat kuda (bukan tengah rig) supaya kepala kuda tidak terpotong panel kanan
  const focusX = animator.x - animator.forwardX * 1.2;
  const focusZ = animator.z - animator.forwardZ * 1.2;
  const gyFocus = world.terrainHeightAt ? world.terrainHeightAt(focusX, focusZ) : 0;
  followTarget.set(focusX, gyFocus + (panelOpenMobile ? 0.35 : 1.3), focusZ);

  // chase-cam: kamera ikut berputar mengikuti heading kuda, jadi rig selalu ke-frame saat belok
  const dYawCam = animator.yaw - camPrevYaw;
  camPrevYaw = animator.yaw;
  if (Math.abs(dYawCam) > 1e-5) {
    const ox = camera.position.x - controls.target.x;
    const oz = camera.position.z - controls.target.z;
    const cc = Math.cos(dYawCam), ss = Math.sin(dYawCam);
    camera.position.x = controls.target.x + ox * cc + oz * ss;
    camera.position.z = controls.target.z - ox * ss + oz * cc;
  }

  const k = 1 - Math.exp(-4.5 * dt);
  const dx = (followTarget.x - controls.target.x) * k;
  const dy = (followTarget.y - controls.target.y) * k;
  const dz = (followTarget.z - controls.target.z) * k;
  controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
  camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
  controls.update();
  if (world.syncCamera) world.syncCamera(camera);

  const st = animator.jumpActive ? 'jump'
    : hitchAnim.active ? 'dock'
    : animator.speed < -0.08 ? 'rev'
    : animator.state;
  const label = st === 'dock' ? 'NGEPASIN' : st === 'rev' ? 'MUNDUR' : (stateLabel[st] || st.toUpperCase());
  if (hudState) hudState.textContent = label;
  for (const [m, id] of [['walk','btn-walk'],['rev','btn-rev'],['run','btn-run'],['jump','btn-jump'],['graze','btn-graze']]) {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('primary', st === m);
  }
  if (hudSpeed) hudSpeed.textContent = (Math.abs(animator.speed) * 3.6).toFixed(1) + ' km/j';
  syncVitals();
  if (hudHead) {
    const st2 = animator.steer;
    hudHead.textContent = st2 > 0.12 ? 'BELOK KIRI' : st2 < -0.12 ? 'BELOK KANAN' : 'LURUS';
  }
  if (hudRoll) {
    const deg = (physics.roll * 180 / Math.PI).toFixed(0);
    hudRoll.textContent = deg + '°' + (physics.flipped ? ' — TERBALIK' : '');
    hudRoll.style.color = physics.flipped ? '#c0392b' : '';
  }
  if (hudCargo) {
    const total = cart.cargoItems.length;
    const spilled = physics.spilled.length;
    const inBed = total - spilled;
    const pCount = (cart.passengers && cart.passengers.length) || 4;
    let maxDy = 0;
    for (const it of cart.cargoItems) {
      if (!it.spilled) maxDy = Math.max(maxDy, it.localPos.y - it.floorY);
    }
    hudCargo.textContent = spilled > 0
      ? pCount + ' org • ' + inBed + '/' + total + ' brg (' + spilled + ' jatuh)'
      : pCount + ' org • ' + inBed + '/' + total + ' brg • goyang ' + (maxDy * 100).toFixed(0) + 'cm';
    hudCargo.style.color = spilled > 0 ? '#c0392b' : '';
  }
  if (hudWheel) {
    const rep = physics.wheelReport ? physics.wheelReport() : [];
    let worst = 100, lost = 0;
    const parts = rep.map((r) => {
      worst = Math.min(worst, r.hp);
      if (r.detached) lost++;
      return r.hp;
    });
    hudWheel.textContent = lost > 0
      ? parts.join(' · ') + '  (' + lost + ' roda lepas)'
      : parts.join(' · ');
    hudWheel.style.color = lost > 0 ? '#8e44ad' : worst <= 0 ? '#c0392b' : worst < 45 ? '#d35400' : '';
  }

  renderer.render(scene, camera);
}

function frame(now) {
  const rawDt = (now - last) / 1000;
  last = now;
  if (!window.__manualSim) {
    if (window.__freeze) {
      renderer.render(scene, camera);          // bekukan fisika, tapi compositor tetap dapat frame
    } else {
      const dt = Math.min(0.033, Math.max(0.001, rawDt));
      stepSim(dt);
    }
  }
  requestAnimationFrame(frame);
}

window.RIG = { scene, camera, renderer, controls, animator, physics, world, cart, horse, store, ui, party, mobs, rebuildCartFromStore, stepSim, ropes: { towL, towR, traceL, traceR, reinL, reinR } };
window.SURVIVAL = survival;
window.TOUCH_UI = touchUI;
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
