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
import { UpgradeStore, HorseStatsStore, MATERIAL_DEFS, UPGRADE_COSTS, HORSE_STAT_DEFS } from './upgrades.js';
import { initUpgradeUI } from './ui.js';
import { Survival } from './survival.js';
import { DeliveryQuestSystem, GOODS_POOL, PASSENGER_POOL } from './quests.js';
import { MapUI } from './minimap.js';
import { getLang, setLang, onLangChange, t } from './i18n.js';
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
const camera = new THREE.PerspectiveCamera(46, initW / initH, 0.2, 450);

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
const horseStats = new HorseStatsStore();
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

function qualityLabelText(key, fallback) {
  const k = key === 'high' ? 'quality_high' : key === 'med' ? 'quality_med' : 'quality_low';
  return t(k) || fallback;
}
const qualityBar = document.getElementById('quality-bar');
function refreshQualityBar() {
  if (!qualityBar) return;
  qualityBar.querySelectorAll('button').forEach((b) => {
    const qKey = b.dataset.quality;
    const p = QUALITY_PRESETS[qKey];
    if (p) b.textContent = `${p.icon} ${qualityLabelText(qKey, p.label)}`;
    b.classList.toggle('active', qKey === quality.key);
  });
  qualityBar.title = `${t('quality_label')}: ${qualityLabelText(quality.key, quality.label)} — ${quality.hint}`;
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
    btn.textContent = `${p.icon} ${qualityLabelText(key, p.label)}`;
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
  physics.pullPowerScale = horseStats.pullMul();
  cart = newCart;
  window.RIG.cart = newCart;
  party.bindCart(cart);
  if (party.members.length || (party.questPassengers && party.questPassengers.length)) {
    party.mount(cart);
  }
  if (typeof quests !== 'undefined' && quests && quests.activeQuest && quests.activeQuest.questType !== 'passenger' && HC.setQuestCargoOnCart) {
    HC.setQuestCargoOnCart(cart, physics, quests.activeQuest.cargoKind, 3, {
      toName: quests.activeQuest.toName,
      cargoName: quests.activeQuest.cargoName,
    });
  }
  reanchorRopes();
}

let ui = null;

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
const hudGold = document.getElementById('hud-gold');
const hudTime = document.getElementById('hud-time');
const portraitHpFill = document.getElementById('portrait-hp-fill');
const portraitLvBadge = document.getElementById('portrait-lv-badge');
const portraitCanvasEl = document.getElementById('horse-portrait-canvas');
const btnHorsePortrait = document.getElementById('btn-horse-portrait');
const btnSettings = document.getElementById('btn-settings');
const statsPanelEl = document.getElementById('horse-stats-panel');
const settingsPanelEl = document.getElementById('settings-panel');
const horseUpgradeListEl = document.getElementById('horse-upgrade-list');
const langBarEl = document.getElementById('lang-bar');
const btnStatsClose = document.getElementById('btn-stats-close');
const btnSettingsClose = document.getElementById('btn-settings-close');
const btnSaveGame = document.getElementById('btn-save-game');
const btnReturnMenu = document.getElementById('btn-return-menu');
const mainMenuEl = document.getElementById('main-menu');
const btnMenuLoad = document.getElementById('btn-menu-load');
const btnMenuNew = document.getElementById('btn-menu-new');
const menuSaveInfoEl = document.getElementById('menu-save-info');
const menuLangBarEl = document.getElementById('menu-lang-bar');
const letterCardEl = document.getElementById('letter-card');
const cutsceneBoxEl = document.getElementById('cutscene-box');
const csSpeakerEl = document.getElementById('cs-speaker');
const csTextEl = document.getElementById('cs-text');
const btnCutsceneNext = document.getElementById('btn-cutscene-next');
const npcMiniBarEl = document.getElementById('npc-mini-bar');
const questHudEl = document.getElementById('quest-hud');
const toastBannerEl = document.getElementById('toast-banner');
const wheelHpOverlayEl = document.getElementById('wheel-hp-overlay');
const cargoLabelOverlayEl = document.getElementById('cargo-label-overlay');
const btnInspectEl = document.getElementById('btn-inspect');

// Live 3D Horse Head Portrait renderer (head-only bust)
let portraitRender = null;
if (portraitCanvasEl && HC.buildHorseHeadPortrait) {
  try {
    const pScene = new THREE.Scene();
    const pCam = new THREE.PerspectiveCamera(34, 1, 0.08, 12);
    pCam.position.set(0.64, 0.24, 0.96);
    pCam.lookAt(-0.01, 0.06, 0.0);
    pScene.add(new THREE.HemisphereLight(0xfff7e6, 0x263238, 1.35));
    const pKey = new THREE.DirectionalLight(0xfff1d6, 1.35);
    pKey.position.set(1.4, 2.2, 1.6);
    pScene.add(pKey);
    const pRim = new THREE.DirectionalLight(0x93c5fd, 0.55);
    pRim.position.set(-1.5, 0.6, -1.2);
    pScene.add(pRim);
    const pBust = HC.buildHorseHeadPortrait();
    pBust.root.rotation.y = 0.12;
    pScene.add(pBust.root);
    const pRen = new THREE.WebGLRenderer({
      canvas: portraitCanvasEl,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    pRen.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    pRen.setSize(128, 128, false);
    pRen.outputColorSpace = THREE.SRGBColorSpace;
    pRen.render(pScene, pCam);
    portraitRender = { scene: pScene, camera: pCam, renderer: pRen, bust: pBust, frameCount: 0 };
  } catch (_err) {
    portraitRender = null;
  }
}

let _toastTimer = null;
let _lastToastText = '';
function showToast(text) {
  if (!toastBannerEl || !text || text === _lastToastText) return;
  _lastToastText = text;
  toastBannerEl.textContent = text;
  toastBannerEl.hidden = false;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toastBannerEl.hidden = true;
    _lastToastText = '';
  }, 3400);
}

let renderHorseUpgrades = () => {};

function setStatsPanelOpen(open) {
  if (!statsPanelEl || !btnHorsePortrait) return;
  const show = !!open;
  statsPanelEl.hidden = !show;
  btnHorsePortrait.classList.toggle('open', show);
  btnHorsePortrait.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) renderHorseUpgrades();
  if (show && settingsPanelEl && btnSettings) {
    settingsPanelEl.hidden = true;
    btnSettings.classList.remove('open');
    btnSettings.setAttribute('aria-expanded', 'false');
  }
}

function setSettingsPanelOpen(open) {
  if (!settingsPanelEl || !btnSettings) return;
  const show = !!open;
  settingsPanelEl.hidden = !show;
  btnSettings.classList.toggle('open', show);
  btnSettings.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show && statsPanelEl && btnHorsePortrait) {
    statsPanelEl.hidden = true;
    btnHorsePortrait.classList.remove('open');
    btnHorsePortrait.setAttribute('aria-expanded', 'false');
  }
}

if (btnHorsePortrait) {
  btnHorsePortrait.addEventListener('click', (e) => {
    e.preventDefault();
    setStatsPanelOpen(statsPanelEl ? statsPanelEl.hidden : false);
  });
}
if (btnStatsClose) {
  btnStatsClose.addEventListener('click', (e) => { e.preventDefault(); setStatsPanelOpen(false); });
}
if (btnSettings) {
  btnSettings.addEventListener('click', (e) => {
    e.preventDefault();
    setSettingsPanelOpen(settingsPanelEl ? settingsPanelEl.hidden : false);
  });
}
if (btnSettingsClose) {
  btnSettingsClose.addEventListener('click', (e) => { e.preventDefault(); setSettingsPanelOpen(false); });
}

for (const lbEl of [langBarEl, menuLangBarEl]) {
  if (!lbEl) continue;
  lbEl.querySelectorAll('.lang-chip').forEach((btn) => {
    const pick = (e) => {
      e.preventDefault();
      const lang = btn.dataset.lang;
      if (lang) setLang(lang);
    };
    btn.addEventListener('click', pick);
    btn.addEventListener('touchstart', pick, { passive: false });
  });
}

// ---- Main Menu, Story Cutscene (Hero's Old Cart), Save & Load ----
const GAME_SAVE_KEY = 'shod_save_v1';
let gameMode = 'menu';      // 'menu' | 'cutscene' | 'play'
let hasCart = true;
let storyStage = 'done';    // 'to_radnar' | 'find_cart' | 'done'
let _radnarCutscenePlayed = false;
let _cutsceneIdx = 0;
let _cutsceneGuardNpc = null;
const _csCamPos = new THREE.Vector3();
const _csCamTarget = new THREE.Vector3();
const _menuCamPos = new THREE.Vector3();
const _menuCamTarget = new THREE.Vector3();
let _menuCamT = 0;

function syncMenuLangChips() {
  const cur = getLang();
  for (const lbEl of [langBarEl, menuLangBarEl]) {
    if (!lbEl) continue;
    lbEl.querySelectorAll('.lang-chip').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === cur);
    });
  }
}

function readSavedData() {
  try {
    const raw = localStorage.getItem(GAME_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (_e) {
    return null;
  }
}

function refreshMainMenuUI() {
  const save = readSavedData();
  if (btnMenuLoad) btnMenuLoad.disabled = !save;
  if (menuSaveInfoEl) {
    if (save) {
      const stageLbl = save.storyStage === 'done'
        ? (save.hasCart ? 'Expedition' : 'Quest')
        : (save.storyStage === 'find_cart' ? 'Old Cart' : 'Radnar');
      menuSaveInfoEl.textContent = t('menu_save_info', { gold: Math.floor(save.gold || 0), stage: stageLbl });
    } else {
      menuSaveInfoEl.textContent = t('menu_no_save');
    }
  }
}

// ---- Delivery Quests & World Map + Minimap ----
const quests = new DeliveryQuestSystem({ world });
quests.gold = 120;
quests.assignVillageQuestNpcs(party.wild);
const mapUI = new MapUI({
  world,
  miniCanvas: document.getElementById('minimap-canvas'),
  fullCanvas: document.getElementById('worldmap-canvas'),
  modalEl: document.getElementById('worldmap-modal'),
  miniWrap: document.getElementById('minimap-wrap'),
  closeBtn: document.getElementById('btn-worldmap-close'),
  locLabelEl: document.getElementById('minimap-loc'),
  coordLabelEl: document.getElementById('worldmap-coords'),
  quests,
});

function createQuestMarkerMesh(symbol) {
  const g = new THREE.Group();
  const isBang = symbol === '!';
  const col = isBang ? 0xfacc15 : 0x34d399;
  const mat = new THREE.MeshBasicMaterial({ color: col });
  const rim = new THREE.MeshBasicMaterial({ color: isBang ? 0x92400e : 0x065f46 });
  const unit = 0.095;
  const px = (gx, gy, cMat = mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(unit, unit, unit * 0.72), cMat);
    m.position.set(gx * unit, gy * unit, 0);
    g.add(m);
  };
  if (isBang) {
    for (let y = 2; y <= 5; y++) px(0, y, mat);
    px(0, 0, mat);
    // Halo ring kecil di bawah
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.21, 16),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.18;
    g.add(ring);
  } else {
    px(-1, 5, mat); px(0, 5, mat); px(1, 5, mat);
    px(1, 4, mat);
    px(0, 3, mat); px(1, 3, mat);
    px(0, 2, mat);
    px(0, 0, mat);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.21, 16),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.18;
    g.add(ring);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), rim);
  back.position.set(0, 2.5 * unit, -0.05);
  g.add(back);
  g.visible = false;
  return g;
}

let _qMarkerT = 0;
function syncQuestNpcMarkers(dt) {
  _qMarkerT += dt;
  quests.assignVillageQuestNpcs(party.wild);
  const q = quests.activeQuest;
  const givers = new Set(quests._questNpcByVillage.values());
  const radStoryGuard = (!hasCart && storyStage === 'to_radnar')
    ? ((party.wild || []).find((w) => !w.recruited && w.site === 'radnar' && (w.role.id === 'guard' || w.role.id === 'warrior'))
      || (party.wild || []).find((w) => !w.recruited && w.site === 'radnar'))
    : null;
  const bob = Math.sin(_qMarkerT * 3.4) * 0.11;

  for (const m of party.members) {
    if (m && m.root && m.root.userData && m.root.userData.__qMarkers) {
      m.root.userData.__qMarkers['!'].visible = false;
      m.root.userData.__qMarkers['?'].visible = false;
    }
  }
  for (const w of party.wild) {
    if (!w || !w.root) continue;
    let showSym = null;
    if (!w.recruited && !w.isIndoors) {
      if (radStoryGuard) {
        if (w === radStoryGuard) showSym = '!';
      } else if (hasCart) {
        if (q) {
          if (q.receiverNpc === w) showSym = '?';
        } else if (givers.has(w)) {
          showSym = '!';
        }
      }
    }
    let cache = w.root.userData.__qMarkers;
    if (!showSym) {
      if (cache) {
        cache['!'].visible = false;
        cache['?'].visible = false;
      }
      continue;
    }
    if (!cache) {
      cache = {
        '!': createQuestMarkerMesh('!'),
        '?': createQuestMarkerMesh('?'),
      };
      w.root.add(cache['!']);
      w.root.add(cache['?']);
      w.root.userData.__qMarkers = cache;
    }
    cache['!'].visible = showSym === '!';
    cache['?'].visible = showSym === '?';
    const act = cache[showSym];
    act.position.y = 2.35 + bob;
    act.rotation.y += dt * 1.9;
  }
}

function tryAcceptQuestAtGiver(nearGiver) {
  if (!nearGiver || quests.activeQuest) return false;
  if (!hasCart) {
    showToast(t('quest_need_cart'));
    return false;
  }
  const res = quests.acceptQuest(nearGiver.villageId, party.wild);
  if (res.ok && res.quest) {
    if (res.quest.questType === 'passenger') {
      if (party.boardQuestPassengers) party.boardQuestPassengers(res.quest.passengerRoles, cart);
      if (HC.clearQuestCargoFromCart) HC.clearQuestCargoFromCart(cart, physics);
    } else {
      if (party.clearQuestPassengers) party.clearQuestPassengers(cart);
      if (HC.setQuestCargoOnCart) {
        HC.setQuestCargoOnCart(cart, physics, res.quest.cargoKind, 3, {
          toName: res.quest.toName,
          cargoName: res.quest.cargoName,
        });
      }
    }
  }
  _tagCartRef = null;
  _lastQuestSig = '';
  _lastDockSig = '';
  showToast(res.msg);
  survival.msg = res.msg;
  syncVitals();
  renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
  renderNpcDock();
  return !!res.ok;
}

let _lastQuestSig = '';
function renderQuestHud(nearVillage) {
  if (!questHudEl) return;
  const q = quests.activeQuest;
  const radnarV = (world.VILLAGES && world.VILLAGES[0]) || { cx: 0, cz: 76 };
  const langKey = getLang();

  if (!hasCart) {
    const dDest = storyStage === 'find_cart'
      ? Math.round(Math.hypot(physics.pos.x - animator.x, physics.pos.z - animator.z))
      : Math.round(Math.hypot(radnarV.cx - animator.x, radnarV.cz - animator.z));
    const sig = `STORY|${langKey}|${storyStage}|${Math.floor(dDest / 2)}`;
    if (sig === _lastQuestSig) return;
    _lastQuestSig = sig;
    questHudEl.innerHTML = '';
    const pill = document.createElement('div');
    pill.className = 'q-pill';
    if (storyStage === 'find_cart') {
      pill.innerHTML =
        `<div class="q-pill-head"><span>🪵 ${t('story_obj_cart')}</span><span>${dDest}m</span></div>` +
        `<div class="q-pill-sub">${t('story_obj_cart_sub', { d: dDest })}</div>`;
    } else {
      pill.innerHTML =
        `<div class="q-pill-head"><span>📜 ${t('story_obj_radnar')}</span><span>${dDest}m</span></div>` +
        `<div class="q-pill-sub">${t('story_obj_radnar_sub', { d: dDest })}</div>`;
    }
    questHudEl.appendChild(pill);
    return;
  }

  const nearGiver = !q ? quests.getNearbyQuestNpc(animator.x, animator.z, party.wild, 6.2) : null;
  const offer = nearGiver ? quests.getOfferForVillage(nearGiver.villageId, party.wild) : null;
  const vGiver = (!q && !nearGiver && nearVillage) ? quests.getQuestNpcForVillage(nearVillage.id, party.wild) : null;
  const dGiver = vGiver ? Math.round(Math.hypot(vGiver.x - animator.x, vGiver.z - animator.z)) : 0;
  const distM = q ? Math.round(quests.distanceToTarget(animator.x, animator.z)) : 0;
  const sig = q
    ? `A|${langKey}|${q.id}|${Math.floor(distM / 5)}|${quests.gold}`
    : (offer && nearGiver)
      ? `G|${langKey}|${offer.id}|${nearGiver.npc.uid}|${quests.gold}`
      : nearVillage
        ? `H|${langKey}|${nearVillage.id}|${vGiver ? vGiver.uid : '0'}|${Math.floor(dGiver / 3)}|${quests.gold}`
        : `I|${langKey}|${quests.gold}|${quests.completedCount}`;
  if (sig === _lastQuestSig) return;
  _lastQuestSig = sig;
  questHudEl.innerHTML = '';

  if (q) {
    const isPass = q.questType === 'passenger';
    const subTxt = isPass
      ? t('quest_pass_active_sub', { cargo: q.cargoName, receiver: q.receiverName || q.toName, gold: q.rewardGold })
      : t('quest_active_sub', { cargo: q.cargoName, receiver: q.receiverName || q.toName, gold: q.rewardGold });
    const pill = document.createElement('div');
    pill.className = 'q-pill';
    pill.innerHTML =
      `<div class="q-pill-head"><span>${q.cargoIcon || '📦'} ${t('quest_active_head', { icon: '', to: q.toName }).trim()}</span><span>${distM}m</span></div>` +
      `<div class="q-pill-sub">${subTxt}</div>` +
      `<div class="q-actions"><span class="q-gold-chip">🪙 ${quests.gold} G</span><button type="button" class="q-btn-abandon" id="btn-quest-abandon">${t('quest_abandon_btn')}</button></div>`;
    questHudEl.appendChild(pill);
    const ab = pill.querySelector('#btn-quest-abandon');
    if (ab) ab.addEventListener('click', (e) => {
      e.preventDefault();
      quests.abandonQuest();
      if (HC.clearQuestCargoFromCart) HC.clearQuestCargoFromCart(cart, physics);
      if (party.clearQuestPassengers) party.clearQuestPassengers(cart);
      _tagCartRef = null;
      _lastQuestSig = '';
      showToast(t('quest_abandoned_toast'));
      renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
    });
  } else if (offer && nearGiver) {
    const isPass = offer.questType === 'passenger';
    const subTxt = isPass
      ? t('quest_pass_offer_sub', { count: offer.passengerCount || 1, cargo: offer.cargoName, to: offer.toName, dist: offer.distance })
      : t('quest_offer_sub', { icon: offer.cargoIcon || '', cargo: offer.cargoName, to: offer.toName, dist: offer.distance });
    const pill = document.createElement('div');
    pill.className = 'q-pill';
    pill.innerHTML =
      `<div class="q-pill-head"><span>${t('quest_offer_title', { giver: offer.giverName, village: offer.fromName })}</span><span>+${offer.rewardGold} G</span></div>` +
      `<div class="q-pill-sub">${subTxt}</div>` +
      `<div class="q-actions"><button type="button" class="q-btn-accept" id="btn-quest-accept">${t('quest_accept_btn')}</button></div>`;
    questHudEl.appendChild(pill);
    const acc = pill.querySelector('#btn-quest-accept');
    if (acc) acc.addEventListener('click', (e) => {
      e.preventDefault();
      tryAcceptQuestAtGiver(nearGiver);
    });
  } else if (nearVillage) {
    const pill = document.createElement('div');
    pill.className = 'q-pill';
    const gLabel = (vGiver && vGiver.role && vGiver.role.name) ? vGiver.role.name : 'NPC';
    pill.innerHTML =
      `<div class="q-pill-head"><span>${t('quest_hint_title', { village: nearVillage.name })}</span><span>${vGiver ? `${dGiver}m` : ''}</span></div>` +
      `<div class="q-pill-sub">${t('quest_hint_body', { giver: gLabel })}</div>`;
    questHudEl.appendChild(pill);
  } else {
    const chip = document.createElement('div');
    chip.className = 'q-gold-chip';
    chip.textContent = `🪙 ${quests.gold} G · ${quests.completedCount} ✓`;
    questHudEl.appendChild(chip);
  }
}

let _inspectWasActive = false;
const _inspectSavedLocalOff = new THREE.Vector3();
const _inspectTargetLocalOff = new THREE.Vector3();
const _inspectCurOff = new THREE.Vector3();
const _inspectWantOff = new THREE.Vector3();
const _upY = new THREE.Vector3(0, 1, 0);
let _inspectHasSaved = false;
let _inspectReturning = false;

controls.addEventListener('start', () => {
  if (!animator.inspectMode && _inspectReturning) {
    _inspectReturning = false;
    _inspectHasSaved = false;
  }
});

const INSPECT_MAX_DIST = Math.max(8.5, HITCH_DIST + 4.5);
function canInspectCart() {
  if (!hasCart || gameMode !== 'play') return false;
  if (physics.hitched) return true;
  return Math.hypot(animator.x - physics.pos.x, animator.z - physics.pos.z) <= INSPECT_MAX_DIST;
}

function setInspectMode(on, notifyDenied = false) {
  const next = !!on;
  if (next && workshopOpen) return false;
  if (next && !canInspectCart()) {
    if (notifyDenied) showToast(t('inspect_far'));
    if (_inspectWasActive) on = false;
    else {
      animator.inspectMode = false;
      if (wheelHpOverlayEl) wheelHpOverlayEl.hidden = true;
      return false;
    }
  }
  const finalNext = !!on;
  if (finalNext === _inspectWasActive) return finalNext;
  animator.inspectMode = finalNext;
  if (wheelHpOverlayEl) wheelHpOverlayEl.hidden = !finalNext;
  if (btnInspectEl) {
    btnInspectEl.classList.toggle('active', finalNext);
    btnInspectEl.classList.toggle('held', finalNext);
  }
  if (touchUI && touchUI.setInspectState) touchUI.setInspectState(finalNext);
  if (finalNext) {
    if (!_inspectHasSaved) {
      _inspectSavedLocalOff.copy(camera.position).sub(controls.target).applyAxisAngle(_upY, -animator.yaw);
      _inspectHasSaved = true;
    }
    _inspectReturning = false;
    const side = _inspectSavedLocalOff.z >= 0 ? 1 : -1;
    _inspectTargetLocalOff.set(-1.35, 3.25, side * 6.8);
  } else if (_inspectHasSaved) {
    _inspectReturning = true;
  }
  _inspectWasActive = finalNext;
  return finalNext;
}
function toggleInspectMode() {
  setInspectMode(!animator.inspectMode);
  return animator.inspectMode;
}

// Bar HP / stamina / lapar / haus + pesan kontekstual.
const VITAL_ROWS = [['hp', 'v-hp'], ['stamina', 'v-sta'], ['hunger', 'v-food'], ['thirst', 'v-water']];
function syncVitals() {
  for (const [key, id] of VITAL_ROWS) {
    const val = Math.round(survival[key]);
    const maxVal = key === 'hp' ? (survival.hpMax || 100) : key === 'stamina' ? (survival.staminaMax || 100) : 100;
    const pct = Math.max(0, Math.min(100, Math.round((val / maxVal) * 100)));
    const el = document.getElementById(id);
    if (el) el.style.width = pct + '%';
    const txt = document.getElementById(id + '-t');
    if (txt) txt.textContent = String(val);
    if (el && el.parentElement && el.parentElement.parentElement) {
      el.parentElement.parentElement.classList.toggle('low', pct < 25);
    }
  }
  const hpPct = Math.max(0, Math.min(100, Math.round((survival.hp / (survival.hpMax || 100)) * 100)));
  if (portraitHpFill) portraitHpFill.style.width = hpPct + '%';
  const msg = document.getElementById('v-msg');
  if (msg && msg.textContent !== survival.msg) msg.textContent = survival.msg;
  if (survival.msg) showToast(survival.msg);
}

const btnSleepEl = document.getElementById('btn-sleep');

function bindBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  const handler = (e) => { e.preventDefault(); fn(); };
  el.addEventListener('click', handler);
  el.addEventListener('touchstart', handler, { passive: false });
}

// ---- Survival, Horse Upgrades & Village Cart Workshop ----
const survival = new Survival({ map: HC.MAP, world });

function syncHorseStats() {
  survival.applyHorseStats(horseStats);
  animator.statSpeedScale = horseStats.speedMul();
  physics.pullPowerScale = horseStats.pullMul();
  if (portraitLvBadge) portraitLvBadge.textContent = `Lv${horseStats.totalLevel()}`;
  syncVitals();
}

renderHorseUpgrades = function renderHorseUpgradeRows() {
  if (!horseUpgradeListEl) return;
  horseUpgradeListEl.innerHTML = '';
  const gold = Math.floor(quests.gold || 0);
  if (hudGold) hudGold.textContent = `${gold} G`;
  for (const def of HORSE_STAT_DEFS) {
    const curLv = horseStats.levels[def.key] || 1;
    const isMax = curLv >= def.maxLv;
    const cost = horseStats.nextCost(def.key);
    const canBuy = !isMax && cost != null && gold >= cost;

    const row = document.createElement('div');
    row.className = 'hu-row';

    const info = document.createElement('div');
    info.className = 'hu-info';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'hu-name';
    nameDiv.innerHTML = `<span>${def.icon} ${t(def.nameKey)}</span><span class="hu-lv">Lv.${curLv}/${def.maxLv}</span>`;
    const effDiv = document.createElement('div');
    effDiv.className = 'hu-effect';
    effDiv.textContent = isMax
      ? `${def.format(curLv)} (MAX)`
      : `${def.format(curLv)} → ${def.format(curLv + 1)}`;
    info.append(nameDiv, effDiv);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hu-btn';
    if (isMax) {
      btn.disabled = true;
      btn.textContent = t('max_btn');
    } else {
      btn.textContent = `${t('upgrade_btn')} (${cost} G)`;
      if (!canBuy) btn.style.opacity = '0.72';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const res = horseStats.upgradeStat(def.key, quests);
        if (!res.ok) {
          showToast(t('not_enough_gold', { g: cost }));
          return;
        }
        syncHorseStats();
        renderHorseUpgrades();
        if (ui && ui.refresh) ui.refresh();
        _lastQuestSig = '';
        showToast(t('horse_upgraded', { stat: t(def.nameKey), lv: res.level, g: res.cost }));
      });
    }
    row.append(info, btn);
    horseUpgradeListEl.appendChild(row);
  }
};

// Village Cart Workshop camera & mode
let workshopOpen = false;
let _wsRecord = null;
const _wsSavedCamPos = new THREE.Vector3();
const _wsSavedTarget = new THREE.Vector3();
const _wsCamGoalPos = new THREE.Vector3();
const _wsCamGoalTarget = new THREE.Vector3();

function computeWorkshopCamera(ws) {
  const cx = physics.pos.x;
  const cz = physics.pos.z;
  const cy = world.terrainHeightAt ? world.terrainHeightAt(cx, cz) : 0;
  // Direction from workshop shopfront toward cart so building sits cleanly in backdrop
  let vx = cx - (ws ? ws.shopX : cx);
  let vz = cz - (ws ? ws.shopZ : cz + 1);
  let len = Math.hypot(vx, vz);
  if (len < 0.8) {
    const yaw = ws ? (ws.shopYaw || 0) : physics.yaw;
    vx = Math.sin(yaw);
    vz = Math.cos(yaw);
  } else {
    vx /= len;
    vz /= len;
  }
  // Rotate slightly (~34 deg) for rich isometric 3/4 view framing horse + cart + grass + shopfront
  const ang = 0.58;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const rx = vx * ca - vz * sa;
  const rz = vx * sa + vz * ca;
  _wsCamGoalTarget.set(
    HC.lerp(cx, animator.x, 0.25),
    cy + 0.55,
    HC.lerp(cz, animator.z, 0.25)
  );
  _wsCamGoalPos.set(
    _wsCamGoalTarget.x + rx * 7.6,
    cy + 4.25,
    _wsCamGoalTarget.z + rz * 7.6
  );
}

function openWorkshop(ws) {
  if (!ws || physics.flipped) return false;
  if (animator.state === 'sleep') doSleepToggle();
  if (animator.inspectMode) setInspectMode(false);
  setStatsPanelOpen(false);
  setSettingsPanelOpen(false);
  if (mapUI && mapUI.isOpen) mapUI.close();

  _wsSavedCamPos.copy(camera.position);
  _wsSavedTarget.copy(controls.target);
  workshopOpen = true;
  _wsRecord = ws;

  keysHeld.forward = false;
  keysHeld.backward = false;
  keysHeld.left = false;
  keysHeld.right = false;
  btnForwardHeld = false;
  btnBackwardHeld = false;
  animator.setThrottle(0);
  animator.setSteer(0);

  computeWorkshopCamera(ws);
  if (ui && ui.open) ui.open(ws);
  return true;
}

function closeWorkshop() {
  if (!workshopOpen) return false;
  workshopOpen = false;
  _wsRecord = null;
  if (ui && ui.close) ui.close();
  controls.target.copy(_wsSavedTarget);
  camera.position.copy(_wsSavedCamPos);
  controls.update();
  _lastDockSig = '';
  _lastQuestSig = '';
  renderNpcDock();
  return true;
}

ui = initUpgradeUI({
  store,
  quests,
  onUpgrade(_key, ok, msg) {
    if (ok) {
      rebuildCartFromStore();
      if (workshopOpen && _wsRecord) computeWorkshopCamera(_wsRecord);
    }
    if (msg) {
      survival.msg = msg;
      showToast(msg);
      syncVitals();
    }
    _lastQuestSig = '';
  },
  onRefill() {
    if ((quests.gold || 0) < 10) {
      showToast(t('not_enough_gold', { g: 10 }));
      return;
    }
    const restored = HC.refillCartSupplies ? HC.refillCartSupplies(cart) : 0;
    if (restored <= 0) {
      showToast(t('ws_refill_full'));
      return;
    }
    quests.gold = Math.max(0, (quests.gold || 0) - 10);
    showToast(t('ws_refill_ok'));
    _lastQuestSig = '';
  },
  onClose() {
    closeWorkshop();
  },
});

function saveGameState(silent = true) {
  try {
    const supplies = (cart && Array.isArray(cart.cargoItems))
      ? cart.cargoItems.filter((it) => it && it.supplyKind).map((it) => ({
          kind: it.supplyKind,
          charges: it.charges || 0,
        }))
      : [];
    const payload = {
      v: 1,
      storyStage,
      hasCart: !!hasCart,
      gold: Math.floor(quests.gold || 0),
      completedCount: quests.completedCount || 0,
      materials: { ...store.materials },
      cartLevels: { ...store.levels },
      horseStats: { ...horseStats.levels },
      timeOfDay: world.timeOfDay || 0.08,
      horse: { x: animator.x, z: animator.z, yaw: animator.yaw },
      cart: { x: physics.pos.x, z: physics.pos.z, yaw: physics.yaw, hitched: !!physics.hitched },
      vitals: {
        hp: survival.hp,
        stamina: survival.stamina,
        hunger: survival.hunger,
        thirst: survival.thirst,
      },
      supplies,
      squad: (party.members || []).map((m) => m.role && m.role.id).filter(Boolean),
    };
    localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(payload));
    refreshMainMenuUI();
    if (!silent) showToast(t('menu_saved_toast'));
    return true;
  } catch (_e) {
    return false;
  }
}

function positionCameraBehindHorse() {
  const gy = world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0;
  const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
  const lx = -fz, lz = fx;
  controls.target.set(animator.x - fx * 1.2, gy + 1.25, animator.z - fz * 1.2);
  const backD = isPortraitMobile() ? 10.5 : 8.2;
  const sideD = isPortraitMobile() ? 5.2 : 4.2;
  const upD = isPortraitMobile() ? 5.8 : 4.9;
  camera.position.set(
    controls.target.x - fx * backD + lx * sideD,
    gy + upD,
    controls.target.z - fz * backD + lz * sideD
  );
  camPrevYaw = animator.yaw;
  controls.update();
}

function enterMainMenu() {
  if (workshopOpen) closeWorkshop();
  if (animator.inspectMode) setInspectMode(false);
  if (mapUI && mapUI.isOpen) mapUI.close();
  setStatsPanelOpen(false);
  setSettingsPanelOpen(false);
  if (letterCardEl) letterCardEl.hidden = true;
  if (cutsceneBoxEl) cutsceneBoxEl.hidden = true;

  gameMode = 'menu';
  _menuCamT = 0;
  document.body.classList.remove('cutscene-open');
  document.body.classList.add('menu-open');
  if (mainMenuEl) mainMenuEl.hidden = false;

  animator.setThrottle(0);
  animator.setSteer(0);
  animator.speed = 0;
  animator.targetSpeed = 0;
  animator.menuIdleMode = true;

  // Frame scenic wide meadow + trees + cart + grazing-looking horse on the right side
  const pose = world.initialHorsePose ? world.initialHorsePose() : { x: 0, z: 0, yaw: 0.4 };
  animator.x = pose.x + 1.6;
  animator.z = pose.z - 2.2;
  animator.yaw = -0.58;
  animator.forwardX = Math.cos(animator.yaw);
  animator.forwardZ = -Math.sin(animator.yaw);
  animator.unhitched = false;
  if (horse && horse.root) {
    horse.root.position.set(animator.x, world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0, animator.z);
    horse.root.rotation.y = animator.yaw;
  }
  physics.reset(animator.x, animator.z, animator.yaw);
  physics.hitched = true;
  setRopesVisible(true);
  resetRopes();

  const gy = world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0;
  _menuCamTarget.set(animator.x - 2.8, gy + 1.0, animator.z + 0.4);
  _menuCamPos.set(animator.x + 6.4, gy + 3.2, animator.z - 6.8);
  controls.target.copy(_menuCamTarget);
  camera.position.copy(_menuCamPos);
  controls.update();
  refreshMainMenuUI();
}

function startNewGame() {
  if (workshopOpen) closeWorkshop();
  if (letterCardEl) letterCardEl.hidden = true;
  if (cutsceneBoxEl) cutsceneBoxEl.hidden = true;
  if (mainMenuEl) mainMenuEl.hidden = true;
  document.body.classList.remove('menu-open', 'cutscene-open');

  gameMode = 'play';
  animator.menuIdleMode = false;
  animator.inspectMode = false;

  // Release any recruited companions or quest passengers
  while (party.members && party.members.length) party.releaseLast();
  if (party.clearQuestPassengers) party.clearQuestPassengers(cart);
  quests.abandonQuest();
  if (HC.clearQuestCargoFromCart) HC.clearQuestCargoFromCart(cart, physics);

  // Fresh story & stats: start solo without cart (quest leads to Radnar -> Hero's Old Cart)
  storyStage = 'to_radnar';
  hasCart = false;
  party.hasCart = false;
  _radnarCutscenePlayed = false;

  quests.gold = 0;
  quests.completedCount = 0;
  store.minAll();
  store.materials = { wood: 0, iron: 0, leather: 0, cloth: 0 };
  store.save();
  for (const d of HORSE_STAT_DEFS) horseStats.levels[d.key] = 1;
  horseStats.save();
  rebuildCartFromStore();
  syncHorseStats();

  survival.hp = survival.hpMax;
  survival.stamina = survival.staminaMax;
  survival.hunger = 100;
  survival.thirst = 100;
  survival.msg = '';

  const pose = world.initialHorsePose ? world.initialHorsePose() : { x: 0, z: -11, yaw: Math.PI * 0.5 };
  animator.x = pose.x;
  animator.z = pose.z;
  animator.yaw = pose.yaw;
  animator.forwardX = Math.cos(pose.yaw);
  animator.forwardZ = -Math.sin(pose.yaw);
  animator.speed = 0;
  animator.targetSpeed = 0;
  animator.setThrottle(0);
  animator.setSteer(0);
  animator.unhitched = true;
  animator.setState('walk');
  if (horse && horse.root) {
    horse.root.position.set(animator.x, world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0, animator.z);
    horse.root.rotation.y = animator.yaw;
  }

  // Park Hero's Old Cart behind Radnar village awaiting the horse
  const oldSpot = world.getOldCartSpot ? world.getOldCartSpot() : { x: 6, z: 98, yaw: -Math.PI * 0.5 };
  physics.reset(oldSpot.x + Math.cos(oldSpot.yaw) * HITCH_DIST, oldSpot.z - Math.sin(oldSpot.yaw) * HITCH_DIST, oldSpot.yaw);
  physics.hitched = false;
  physics.vel.set(0, 0, 0);
  physics.angVel = 0;
  physics.unhitchedDroop = 1;
  physics.syncVisual();
  setRopesVisible(false);

  _tagCartRef = null;
  _lastQuestSig = '';
  _lastDockSig = '';
  _lastHitchSig = '';
  positionCameraBehindHorse();
  renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
  renderNpcDock();
  syncHitchUi();
  syncVitals();
  return true;
}

function loadGameState() {
  const save = readSavedData();
  if (!save) return false;

  if (mainMenuEl) mainMenuEl.hidden = true;
  if (letterCardEl) letterCardEl.hidden = true;
  if (cutsceneBoxEl) cutsceneBoxEl.hidden = true;
  document.body.classList.remove('menu-open', 'cutscene-open');

  animator.menuIdleMode = false;
  animator.inspectMode = false;
  gameMode = 'play';
  storyStage = save.storyStage || 'done';
  hasCart = save.hasCart !== false;
  party.hasCart = hasCart;
  _radnarCutscenePlayed = storyStage !== 'to_radnar';

  quests.gold = Math.max(0, Math.floor(save.gold || 0));
  quests.completedCount = Math.max(0, Math.floor(save.completedCount || 0));
  quests.abandonQuest();
  if (save.cartLevels) {
    for (const [k, lv] of Object.entries(save.cartLevels)) store.levels[k] = lv;
    store.save();
  }
  if (save.materials) {
    store.materials = { wood: 0, iron: 0, leather: 0, cloth: 0, ...save.materials };
    store.save();
  }
  if (save.horseStats) {
    for (const d of HORSE_STAT_DEFS) {
      if (save.horseStats[d.key]) horseStats.levels[d.key] = save.horseStats[d.key];
    }
    horseStats.save();
  }
  rebuildCartFromStore();
  syncHorseStats();

  if (Array.isArray(save.supplies) && cart && cart.cargoItems) {
    for (const sRec of save.supplies) {
      const it = cart.cargoItems.find((c) => c && c.supplyKind === sRec.kind);
      if (it) it.charges = Math.max(0, Math.min(it.maxCharges || 5, sRec.charges | 0));
    }
  }
  if (save.vitals) {
    survival.hp = Math.max(10, Math.min(survival.hpMax || 100, save.vitals.hp ?? 100));
    survival.stamina = Math.max(0, Math.min(survival.staminaMax || 100, save.vitals.stamina ?? 100));
    survival.hunger = Math.max(0, Math.min(100, save.vitals.hunger ?? 100));
    survival.thirst = Math.max(0, Math.min(100, save.vitals.thirst ?? 100));
  }
  if (typeof save.timeOfDay === 'number') world.timeOfDay = save.timeOfDay;

  while (party.members && party.members.length) party.releaseLast();

  const hPose = save.horse || (world.initialHorsePose ? world.initialHorsePose() : { x: 0, z: 0, yaw: 0 });
  animator.x = hPose.x;
  animator.z = hPose.z;
  animator.yaw = hPose.yaw || 0;
  animator.forwardX = Math.cos(animator.yaw);
  animator.forwardZ = -Math.sin(animator.yaw);
  animator.speed = 0;
  animator.targetSpeed = 0;
  animator.unhitched = !hasCart || !(save.cart && save.cart.hitched !== false);
  if (horse && horse.root) {
    horse.root.position.set(animator.x, world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0, animator.z);
    horse.root.rotation.y = animator.yaw;
  }

  const cPose = save.cart || { x: animator.x, z: animator.z, yaw: animator.yaw, hitched: hasCart };
  physics.reset(animator.x, animator.z, animator.yaw);
  physics.pos.set(cPose.x, 0, cPose.z);
  physics.yaw = cPose.yaw || animator.yaw;
  physics.hitched = !!hasCart && cPose.hitched !== false;
  physics.unhitchedDroop = physics.hitched ? 0 : 1;
  physics.syncVisual();
  setRopesVisible(physics.hitched);
  if (physics.hitched) resetRopes();

  _tagCartRef = null;
  _lastQuestSig = '';
  _lastDockSig = '';
  _lastHitchSig = '';
  positionCameraBehindHorse();
  renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
  renderNpcDock();
  syncHitchUi();
  syncVitals();
  return true;
}

const CUTSCENE_KEYS = ['cutscene_line_1', 'cutscene_line_2', 'cutscene_line_3', 'cutscene_line_4'];
function renderCutsceneStep() {
  if (!cutsceneBoxEl) return;
  if (csSpeakerEl) csSpeakerEl.textContent = t('cutscene_guard_name');
  if (csTextEl) csTextEl.textContent = t(CUTSCENE_KEYS[_cutsceneIdx] || CUTSCENE_KEYS[0]);
  if (letterCardEl) letterCardEl.hidden = (_cutsceneIdx !== 2);
  if (btnCutsceneNext) {
    btnCutsceneNext.textContent = _cutsceneIdx >= CUTSCENE_KEYS.length - 1
      ? t('cutscene_finish_btn')
      : t('cutscene_next_btn');
  }
}

function startRadnarCutscene() {
  if (_radnarCutscenePlayed) return false;
  _radnarCutscenePlayed = true;
  gameMode = 'cutscene';
  _cutsceneIdx = 0;
  keysHeld.forward = false;
  keysHeld.backward = false;
  keysHeld.left = false;
  keysHeld.right = false;
  btnForwardHeld = false;
  btnBackwardHeld = false;
  animator.setThrottle(0);
  animator.setSteer(0);
  animator.speed = 0;
  animator.targetSpeed = 0;
  setStatsPanelOpen(false);
  setSettingsPanelOpen(false);
  if (mapUI && mapUI.isOpen) mapUI.close();

  document.body.classList.add('cutscene-open');
  if (cutsceneBoxEl) cutsceneBoxEl.hidden = false;

  // Bring a Radnar guard/villager beside the horse to speak
  const radGuard = (party.wild || []).find((w) => !w.recruited && w.site === 'radnar' && (w.role.id === 'guard' || w.role.id === 'warrior'))
    || (party.wild || []).find((w) => !w.recruited && w.site === 'radnar');
  if (radGuard && radGuard.root) {
    _cutsceneGuardNpc = radGuard;
    const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
    const lx = -fz, lz = fx;
    const gx = animator.x + fx * 2.1 + lx * 1.1;
    const gz = animator.z + fz * 2.1 + lz * 1.1;
    radGuard.x = gx;
    radGuard.z = gz;
    const gy = world.terrainHeightAt ? world.terrainHeightAt(gx, gz) : 0;
    radGuard.root.position.set(gx, gy, gz);
    radGuard.root.rotation.y = Math.atan2(animator.x - gx, animator.z - gz);
    _csCamTarget.set((animator.x + gx) * 0.5, gy + 1.1, (animator.z + gz) * 0.5);
    _csCamPos.set(_csCamTarget.x + lx * 4.4 - fx * 1.8, gy + 2.3, _csCamTarget.z + lz * 4.4 - fz * 1.8);
  } else {
    const gy = world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0;
    const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
    _csCamTarget.set(animator.x, gy + 1.1, animator.z);
    _csCamPos.set(animator.x - fx * 3.8 + fz * 2.8, gy + 2.4, animator.z - fz * 3.8 - fx * 2.8);
  }
  renderCutsceneStep();
  return true;
}

function advanceCutscene() {
  if (gameMode !== 'cutscene') return false;
  _cutsceneIdx += 1;
  if (_cutsceneIdx < CUTSCENE_KEYS.length) {
    renderCutsceneStep();
    return true;
  }
  if (letterCardEl) letterCardEl.hidden = true;
  if (cutsceneBoxEl) cutsceneBoxEl.hidden = true;
  document.body.classList.remove('cutscene-open');
  gameMode = 'play';
  storyStage = 'find_cart';
  _cutsceneGuardNpc = null;
  _lastQuestSig = '';
  _lastDockSig = '';
  positionCameraBehindHorse();
  renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
  renderNpcDock();
  saveGameState(true);
  return false;
}

function claimHeroOldCart() {
  if (hasCart) return false;
  hasCart = true;
  party.hasCart = true;
  storyStage = 'done';
  animator.unhitched = false;
  animator.cancelDocking();
  hitchAnim.active = false;
  // Snap horse straight in front of cart shafts without altering cart world spot
  const cfx = Math.cos(physics.yaw), cfz = -Math.sin(physics.yaw);
  animator.x = physics.pos.x + cfx * HITCH_DIST;
  animator.z = physics.pos.z + cfz * HITCH_DIST;
  animator.yaw = physics.yaw;
  animator.forwardX = cfx;
  animator.forwardZ = cfz;
  animator.speed = 0;
  animator.targetSpeed = 0;
  if (horse && horse.root) {
    horse.root.position.set(animator.x, world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0, animator.z);
    horse.root.rotation.y = animator.yaw;
  }
  physics.vel.set(0, 0, 0);
  physics.angVel = 0;
  physics.hitched = true;
  physics.unhitchedDroop = 0;
  physics.syncVisual();
  setRopesVisible(true);
  resetRopes();
  reanchorRopes();

  _tagCartRef = null;
  _lastQuestSig = '';
  _lastDockSig = '';
  _lastHitchSig = '';
  showToast(t('story_cart_claimed'));
  survival.msg = t('story_cart_claimed');
  syncVitals();
  renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
  renderNpcDock();
  syncHitchUi();
  saveGameState(true);
  return true;
}

if (btnMenuNew) btnMenuNew.addEventListener('click', (e) => { e.preventDefault(); startNewGame(); });
if (btnMenuLoad) btnMenuLoad.addEventListener('click', (e) => { e.preventDefault(); loadGameState(); });
if (btnSaveGame) btnSaveGame.addEventListener('click', (e) => { e.preventDefault(); saveGameState(false); });
if (btnReturnMenu) btnReturnMenu.addEventListener('click', (e) => { e.preventDefault(); enterMainMenu(); });
if (btnCutsceneNext) btnCutsceneNext.addEventListener('click', (e) => { e.preventDefault(); advanceCutscene(); });

function applyTranslations() {
  document.documentElement.lang = getLang();
  document.title = t('page_title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  syncMenuLangChips();
  refreshMainMenuUI();
  if (gameMode === 'cutscene') renderCutsceneStep();
  refreshQualityBar();
  renderHorseUpgrades();
  if (ui && ui.refreshLang) ui.refreshLang();
  if (typeof touchUI !== 'undefined' && touchUI && touchUI.refreshLang) touchUI.refreshLang();
  _lastQuestSig = '';
  _lastDockSig = '';
  _lastHitchSig = '';
  _lastMiniNpcSig = '';
  _lastBannerSig = '';
  syncHitchUi();
  syncFlipBanner();
  renderNpcDock();
  renderQuestHud(quests.getNearbyVillage(animator.x, animator.z));
}
onLangChange(() => applyTranslations());
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
  sleeping: animator.state === 'sleep' && Math.abs(animator.throttle) <= 0.06,
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
function doInteract() {
  if (gameMode === 'cutscene') {
    advanceCutscene();
    return true;
  }
  if (gameMode !== 'play') return false;
  if (workshopOpen) {
    closeWorkshop();
    return true;
  }
  if (!hasCart && storyStage === 'to_radnar' && !_radnarCutscenePlayed && world.VILLAGES && world.VILLAGES[0]) {
    const rad = world.VILLAGES[0];
    const rx = (rad.cx !== undefined) ? rad.cx : (rad.x || 0);
    const rz = (rad.cz !== undefined) ? rad.cz : (rad.z || 76);
    if (Math.hypot(animator.x - rx, animator.z - rz) <= 30.0) {
      return startRadnarCutscene();
    }
  }
  if (!hasCart && storyStage === 'find_cart') {
    const dCart = Math.hypot(animator.x - physics.pos.x, animator.z - physics.pos.z);
    if (dCart <= 7.5) return claimHeroOldCart();
  }
  const nearGiver = (!quests.activeQuest && hasCart) ? quests.getNearbyQuestNpc(animator.x, animator.z, party.wild, 6.2) : null;
  if (nearGiver) return tryAcceptQuestAtGiver(nearGiver);

  const ws = (hasCart && world.findNearestWorkshop) ? world.findNearestWorkshop(animator.x, animator.z, 11.5) : null;
  if (ws) return openWorkshop(ws);

  if (survival.canDrink && survival.canDrink()) {
    doDrink();
    return true;
  }
  showToast(t('no_interact_near'));
  return false;
}
function doJump() {
  const cost = physics.hitched ? 6 : 4;
  if (survival.stamina < cost) { survival.msg = t('msg_stamina_jump'); syncVitals(); return; }
  survival.stamina = Math.max(0, survival.stamina - cost);
  animator.setState('jump');
}
function doSleepToggle() {
  if (animator.state === 'sleep') {
    animator.setState(runLatched ? 'run' : 'walk');
    survival.msg = t('msg_sleep_off');
    if (btnSleepEl) btnSleepEl.classList.remove('active');
    if (touchUI && touchUI.setSleepState) touchUI.setSleepState(false);
    syncVitals();
    return false;
  }
  if (physics.flipped || animator.jumpActive) {
    survival.msg = t('msg_sleep_deny');
    syncVitals();
    return false;
  }
  stopForSurvivalAction();
  survival.eatT = 0;
  survival.drinkT = 0;
  if (animator.inspectMode) setInspectMode(false);
  animator.setState('sleep');
  survival.msg = t('msg_sleep_on');
  if (btnSleepEl) btnSleepEl.classList.add('active');
  if (touchUI && touchUI.setSleepState) touchUI.setSleepState(true);
  syncVitals();
  return true;
}

const btnWalkEl = document.getElementById('btn-walk');
if (btnWalkEl) {
  const startWalk = (e) => {
    e.preventDefault();
    btnForwardHeld = true;
    btnWalkEl.classList.add('held');
    if (!survival.eating && !survival.drinking && (animator.state === 'graze' || animator.state === 'sleep')) {
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
    if (!survival.eating && !survival.drinking && (animator.state === 'graze' || animator.state === 'sleep')) {
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
bindBtn('btn-interact', () => doInteract());
bindBtn('btn-sleep', () => doSleepToggle());
if (btnInspectEl) {
  const startInsp = (e) => { e.preventDefault(); setInspectMode(true, true); };
  const stopInsp = (e) => { if (e) e.preventDefault(); setInspectMode(false); };
  btnInspectEl.addEventListener('pointerdown', startInsp);
  btnInspectEl.addEventListener('pointerup', stopInsp);
  btnInspectEl.addEventListener('pointerleave', stopInsp);
  btnInspectEl.addEventListener('pointercancel', stopInsp);
  btnInspectEl.addEventListener('touchstart', startInsp, { passive: false });
  btnInspectEl.addEventListener('touchend', stopInsp, { passive: false });
  btnInspectEl.addEventListener('touchcancel', stopInsp, { passive: false });
}
bindBtn('btn-map', () => mapUI.toggle());

const touchUI = initTouchControls({
  animator, survival,
  onJump: doJump, onEat: doEat, onInteract: doInteract, onSleep: doSleepToggle, onRunToggle: toggleRun, onHitch: toggleHitch,
  onInspect: (on) => setInspectMode(on, !!on),
  isTouchDevice: matchMedia('(pointer: coarse)').matches,
});
if (touchUI && touchUI.refreshLang) {
  onLangChange(() => touchUI.refreshLang());
}
syncHorseStats();
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
let _lastMiniNpcSig = '';
function renderNpcMiniBar() {
  if (!npcMiniBarEl) return;
  const sig = party.members.map((m) => `${m.uid}:${m.state}:${m.inCombat ? 1 : 0}:${Math.round(m.hp ?? 100)}`).join('|') +
    (physics.flipped ? ':F' : '');
  if (sig === _lastMiniNpcSig) return;
  _lastMiniNpcSig = sig;

  npcMiniBarEl.innerHTML = '';
  for (const m of party.members) {
    const r = m.role || {};
    const robe = hexCss(r.robe, 0x4f6b34);
    const hood = hexCss(r.hood, 0x3c4a68);
    const curHp = Math.max(0, Math.round(m.hp ?? r.hp ?? 100));
    const maxHp = Math.max(1, Math.round(m.maxHp ?? r.hp ?? 100));
    const hpPct = Math.round((curHp / maxHp) * 100);
    const dotCls = m.inCombat ? 'fighting' : m.state;

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'npc-mini-chip' + (m.inCombat ? ' fighting' : '');
    chip.style.setProperty('--robe', robe);
    chip.style.setProperty('--hood', hood);
    chip.dataset.uid = String(m.uid);
    chip.dataset.state = m.state;
    const actionHint = m.state === 'following' ? 'Click: Board Cart' : (m.state === 'seated' ? 'Click: Guard Foot' : m.state);
    chip.title = `${r.name || 'NPC'} — ${actionHint}`;
    chip.innerHTML =
      `<span>${r.e || '👤'}</span>` +
      `<i class="nm-dot ${dotCls}"></i>` +
      `<span class="nm-hp"><i style="width:${hpPct}%"></i></span>`;

    bindTapSafe(chip, () => {
      if (m.state === 'following' && physics.flipped) return;
      party.toggleMemberMount(m.uid);
      _lastMiniNpcSig = '';
      syncNpcHud();
      renderNpcMiniBar();
      renderNpcDock();
    });
    npcMiniBarEl.appendChild(chip);
  }
}

function renderNpcDock() {
  renderNpcMiniBar();
  if (!npcDockEl) return;
  const near = party.members.length < HC.NPC_TEAM_MAX ? party.nearby(animator.x, animator.z) : null;
  const nearOldCart = (!hasCart && storyStage === 'find_cart' && Math.hypot(animator.x - physics.pos.x, animator.z - physics.pos.z) <= 7.5);
  const nearGiver = (hasCart && !quests.activeQuest) ? quests.getNearbyQuestNpc(animator.x, animator.z, party.wild, 6.2) : null;
  const offer = nearGiver ? quests.getOfferForVillage(nearGiver.villageId, party.wild) : null;
  const nearWorkshop = (hasCart && !workshopOpen && world.findNearestWorkshop)
    ? world.findNearestWorkshop(animator.x, animator.z, 11.5)
    : null;
  const isStationary = Math.abs(animator.speed) < 0.85 && Math.hypot(physics.vel.x, physics.vel.z) < 0.85;
  const canHitchAction = hasCart && !physics.flipped && ((!physics.hitched) || hitchAnim.active);
  const al = (hasCart && !physics.hitched && !physics.flipped) ? getHitchAlignment() : null;
  const hitchMode = !canHitchAction ? 'none'
    : hitchAnim.active ? 'docking'
    : physics.hitched ? (isStationary ? 'detach' : 'none')
    : al.ready ? 'attach'
    : !al.alignedYaw ? 'yaw'
    : !al.alignedLat ? 'lat'
    : al.longErr > 1.25 ? 'rev'
    : 'pos';
  const langKey = getLang();
  const sig = `${langKey}|${nearOldCart ? 'C' : ''}|${near ? near.npc.role.id : ''}|${nearGiver ? nearGiver.npc.uid : ''}|${nearWorkshop ? nearWorkshop.villageId : ''}@${hitchMode}${physics.flipped ? ':F' : ''}`;
  if (sig === _lastDockSig) return;
  _lastDockSig = sig;

  npcDockEl.innerHTML = '';
  const hasAny = nearOldCart || !!near || !!(offer && nearGiver) || !!nearWorkshop || (canHitchAction && hitchMode !== 'none');
  npcDockEl.hidden = !hasAny;
  if (!hasAny) return;

  if (nearOldCart) {
    const cBtn = document.createElement('button');
    cBtn.type = 'button';
    cBtn.className = 'npc-nearby-card';
    cBtn.style.background = 'rgba(180, 83, 9, 0.94)';
    cBtn.style.borderColor = '#fbbf24';
    cBtn.textContent = t('story_claim_cart_btn');
    bindTapSafe(cBtn, claimHeroOldCart);
    npcDockEl.appendChild(cBtn);
  }

  if (offer && nearGiver) {
    const qBtn = document.createElement('button');
    qBtn.type = 'button';
    qBtn.className = 'npc-nearby-card';
    qBtn.style.background = 'rgba(180, 83, 9, 0.92)';
    qBtn.style.borderColor = '#fbbf24';
    qBtn.textContent = `${t('quest_accept_btn')} (${offer.toName})`;
    bindTapSafe(qBtn, () => tryAcceptQuestAtGiver(nearGiver));
    npcDockEl.appendChild(qBtn);
  }

  if (nearWorkshop) {
    const wBtn = document.createElement('button');
    wBtn.type = 'button';
    wBtn.className = 'npc-nearby-card';
    wBtn.style.background = 'rgba(14, 116, 144, 0.92)';
    wBtn.style.borderColor = '#38bdf8';
    wBtn.textContent = t('ws_prompt', { village: nearWorkshop.villageName });
    bindTapSafe(wBtn, () => openWorkshop(nearWorkshop));
    npcDockEl.appendChild(wBtn);
  }

  if (near) {
    const r = near.npc.role;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'npc-nearby-card';
    pill.textContent = `+ ${t('ctrl_recruit')} ${r.e || ''} ${r.name}`;
    bindTapSafe(pill, recruitNearbyNPC);
    npcDockEl.appendChild(pill);
  }

  if (canHitchAction && hitchMode !== 'none') {
    const hBtn = document.createElement('button');
    hBtn.type = 'button';
    hBtn.className = 'npc-hitch-card' + (!physics.hitched ? ' free' : '');
    if (hitchAnim.active) {
      hBtn.textContent = '⏳ ' + t('state_dock') + '...';
      hBtn.disabled = true;
    } else if (physics.hitched) {
      hBtn.textContent = '🔓 ' + t('ctrl_hitch_detach');
    } else if (al && al.ready) {
      hBtn.textContent = '🔗 ' + t('ctrl_hitch_free');
    } else {
      hBtn.textContent = '🔗 ' + (!al.alignedYaw ? t('ctrl_hitch_align_yaw')
        : !al.alignedLat ? t('ctrl_hitch_align_lat')
        : al.longErr > 1.25 ? t('ctrl_hitch_reverse')
        : t('ctrl_hitch_pos'));
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
  if (!hasCart) {
    const sig = 'NC_' + storyStage + '_' + getLang();
    if (sig === _lastHitchSig) return;
    _lastHitchSig = sig;
    btnHitchEl.style.display = 'none';
    if (touchUI && touchUI.setHitchState) {
      touchUI.setHitchState({ free: false, disabled: true, sub: '' });
    }
    return;
  }
  if (btnHitchEl.style.display === 'none') btnHitchEl.style.display = '';
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
    btnHitchEl.textContent = '⚠ ' + t('ctrl_hitch_flipped');
  } else if (hitchAnim.active) {
    btnHitchEl.disabled = true;
    btnHitchEl.textContent = '⏳ ' + t('state_dock') + '...';
  } else if (physics.hitched) {
    btnHitchEl.disabled = movingFast;
    btnHitchEl.textContent = movingFast ? ('🔗 ' + t('ctrl_hitch_stop')) : ('🔓 ' + t('ctrl_hitch_detach'));
  } else if (al.ready) {
    btnHitchEl.disabled = false;
    btnHitchEl.textContent = '🔗 ' + t('ctrl_hitch_free');
  } else {
    btnHitchEl.disabled = true;
    btnHitchEl.textContent = '🔗 ' + (!al.alignedYaw ? t('ctrl_hitch_align_yaw')
      : !al.alignedLat ? t('ctrl_hitch_align_lat')
      : al.longErr > 1.25 ? t('ctrl_hitch_reverse')
      : t('ctrl_hitch_pos'));
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
      survival.msg = t('ctrl_hitch_flipped');
      syncVitals();
      return false;
    }
    const movingFast = Math.abs(animator.speed) >= 0.85 || Math.hypot(physics.vel.x, physics.vel.z) >= 0.85;
    if (physics.hitched && movingFast) {
      survival.msg = t('ctrl_hitch_stop');
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
    survival.msg = t('msg_unhitched');
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
  survival.msg = t('msg_hitched');
  syncVitals();
  _lastDockSig = '';
  _lastHitchSig = '';
  renderNpcDock();
  syncHitchUi();
}

function reHitchCart() {
  if (physics.flipped) {
    survival.msg = t('flip_banner_btn');
    syncVitals();
    return false;
  }
  if (physics.hitched || hitchAnim.active) return true;
  const al = getHitchAlignment();
  if (!al.ready) {
    if (!al.alignedYaw) survival.msg = t('ctrl_hitch_align_yaw');
    else if (!al.alignedLat) survival.msg = t('ctrl_hitch_align_lat');
    else if (al.longErr > 1.25) survival.msg = t('ctrl_hitch_reverse');
    else survival.msg = t('ctrl_hitch_pos');
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
  survival.msg = t('msg_docking');
  syncVitals();
  _lastDockSig = '';
  _lastHitchSig = '';
  renderNpcDock();
  syncHitchUi();
  return true;
}

function toggleHitch() {
  if (!hasCart) {
    if (storyStage === 'find_cart' && Math.hypot(animator.x - physics.pos.x, animator.z - physics.pos.z) <= 7.5) {
      return claimHeroOldCart();
    }
    return false;
  }
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
    fbNpcCountEl.textContent = npcN > 0 ? String(npcN) : '0';
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
      { zoneWidth: 0.18, perfectWidth: 0.06, cursorSpeed: 1.45, gainGood: 14, gainPerfect: 22, missPenalty: 12, decayPerSec: 4.2, label: t('flip_solo') },
      { zoneWidth: 0.26, perfectWidth: 0.09, cursorSpeed: 1.22, gainGood: 20, gainPerfect: 30, missPenalty: 9,  decayPerSec: 2.8, label: t('flip_help', { n: 1 }) },
      { zoneWidth: 0.34, perfectWidth: 0.12, cursorSpeed: 1.04, gainGood: 26, gainPerfect: 38, missPenalty: 6,  decayPerSec: 1.6, label: t('flip_help', { n: 2 }) },
      { zoneWidth: 0.42, perfectWidth: 0.16, cursorSpeed: 0.88, gainGood: 32, gainPerfect: 46, missPenalty: 4,  decayPerSec: 0.8, label: t('flip_help', { n: 3 }) },
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
    this._setFeedback(t('flip_hint'), 'info');
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
      this._setFeedback(t('flip_perfect', { p: cfg.gainPerfect }), 'perfect');
      this.zoneCenter = 0.34 + Math.random() * 0.32;
    } else if (dist <= cfg.zoneWidth * 0.5) {
      this.progress = Math.min(100, this.progress + cfg.gainGood);
      this._setFeedback(t('flip_good', { p: cfg.gainGood }), 'good');
      this.zoneCenter = 0.34 + Math.random() * 0.32;
    } else {
      this.progress = Math.max(0, this.progress - cfg.missPenalty);
      this._setFeedback(t('flip_miss', { p: cfg.missPenalty }), 'miss');
      this._shake();
    }
    physics.liftProgress = Math.max(0, Math.min(1, this.progress / 100));
    this._render(cfg);

    if (this.progress >= 100) {
      physics.liftProgress = 1;
      physics.rightCartInPlace();
      this.stop(true);
      const spilledLeft = physics.spilled ? physics.spilled.length : 0;
      survival.msg = spilledLeft > 0
        ? (npcN > 0
          ? t('flip_done_spilled', { n: npcN, s: spilledLeft })
          : t('flip_done_spilled_solo', { s: spilledLeft }))
        : (npcN > 0
          ? t('flip_done_clean', { n: npcN })
          : t('flip_done_clean_solo'));
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
    ? `${t('flip_banner_text')} (${broken} detached)`
    : t('flip_banner_text');
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

// ---- Vignette malam mengikuti siklus 10 menit otomatis ----
const vignetteEl = document.getElementById('cozy-vignette');

// ---- Interaksi klik langsung pada pohon, semak, kolam, api unggun, jamur ----
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
    syncVitals();
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
  if (gameMode === 'menu') return;
  if (gameMode === 'cutscene') {
    if (k === ' ' || k === 'enter' || k === 'f' || k === 'e') {
      e.preventDefault();
      if (!e.repeat) advanceCutscene();
    }
    return;
  }
  if (k === 'w' || k === 'arrowup') {
    keysHeld.forward = true;
    if (!survival.eating && !survival.drinking && (animator.state === 'graze' || animator.state === 'sleep')) {
      animator.setState(runLatched ? 'run' : 'walk');
    }
    e.preventDefault();
  }
  else if (k === 's' || k === 'arrowdown') {
    keysHeld.backward = true;
    if (!survival.eating && !survival.drinking && (animator.state === 'graze' || animator.state === 'sleep')) {
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
    if (workshopOpen) { e.preventDefault(); closeWorkshop(); }
    else if (mapUI.isOpen) { e.preventDefault(); mapUI.close(); }
    else if (statsPanelEl && !statsPanelEl.hidden) { e.preventDefault(); setStatsPanelOpen(false); }
    else if (settingsPanelEl && !settingsPanelEl.hidden) { e.preventDefault(); setSettingsPanelOpen(false); }
    else if (animator.inspectMode) { e.preventDefault(); setInspectMode(false); }
    else if (animator.state === 'sleep') { e.preventDefault(); doSleepToggle(); }
    else if (flipGame.active) { e.preventDefault(); flipGame.stop(false); }
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
  else if (k === '4' || k === 'f') { e.preventDefault(); if (!e.repeat) doInteract(); }
  else if (k === 'z') { e.preventDefault(); if (!e.repeat) doSleepToggle(); }
  else if (k === 'm') { e.preventDefault(); if (!e.repeat) mapUI.toggle(); }
  else if (k === 'q') { e.preventDefault(); setInspectMode(true, !e.repeat); }
  else if (k === 't') spawnTipRamp();
  else if (k === 'b') world.spawnPebbleClusterAhead(animator.x, animator.z, animator.yaw);
  else if (k === 'g') recruitNearbyNPC();
  else if (k === 'h') releaseLastNPC();
  else if (k === 'v') { e.preventDefault(); if (!e.repeat) toggleHitch(); }
  else if (k === 'x') resetRig();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keysHeld.forward = false;
  else if (k === 's' || k === 'arrowdown') keysHeld.backward = false;
  else if (k === 'arrowleft' || k === 'a') { keysHeld.left = false; syncSteerInput(); }
  else if (k === 'arrowright' || k === 'd') { keysHeld.right = false; syncSteerInput(); }
  else if (k === 'q') setInspectMode(false);
});
window.addEventListener('blur', () => {
  keysHeld.forward = false;
  keysHeld.backward = false;
  keysHeld.left = false;
  keysHeld.right = false;
  btnForwardHeld = false;
  btnBackwardHeld = false;
  setInspectMode(false);
  animator.setSteer(0);
  animator.setThrottle(0);
});

// ---------------- loop ----------------
resetRopes();
scene.updateMatrixWorld(true);
syncHitchUi();
syncFlipBanner();

const _projTmp = new THREE.Vector3();
const _wheelBadgeEls = [0, 1, 2, 3].map((i) => document.getElementById('whp-' + i));
const _cartBadgeEl = document.getElementById('whp-cart');

function updateWheelHpOverlay() {
  if (!wheelHpOverlayEl) return;
  const active = !!animator.inspectMode;
  wheelHpOverlayEl.hidden = !active;
  if (!active) return;

  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  let sumHp = 0;

  for (let i = 0; i < physics.wheels.length && i < _wheelBadgeEls.length; i++) {
    const w = physics.wheels[i];
    const el = _wheelBadgeEls[i];
    if (!el || !w) continue;
    const hp = Math.max(0, Math.round(w.hp || 0));
    const maxHp = Math.max(1, Math.round(w.hpMax || 100));
    sumHp += w.detached ? 0 : hp;

    if (w.ref && w.ref.wheelPivot && !w.detached) {
      w.ref.wheelPivot.getWorldPosition(_projTmp);
    } else if (w.world) {
      _projTmp.copy(w.world);
    } else {
      el.style.display = 'none';
      continue;
    }
    _projTmp.y += 0.42;
    _projTmp.project(camera);
    if (_projTmp.z > 1 || _projTmp.z < -1) {
      el.style.display = 'none';
      continue;
    }
    const sx = (_projTmp.x * 0.5 + 0.5) * vw;
    const sy = (-_projTmp.y * 0.5 + 0.5) * vh;
    el.style.display = '';
    el.style.left = Math.round(sx) + 'px';
    el.style.top = Math.round(sy) + 'px';

    const valEl = el.querySelector('.whp-val');
    if (valEl) valEl.textContent = w.detached ? t('wheel_detached') : `${hp}/${maxHp}`;
    el.className = 'whp-badge ' + (w.detached ? 'dead' : hp >= 70 ? 'ok' : hp >= 35 ? 'warn' : 'crit');
  }

  if (_cartBadgeEl && cart && cart.root) {
    _projTmp.copy(cart.root.position);
    _projTmp.y += 1.95;
    _projTmp.project(camera);
    if (_projTmp.z <= 1 && _projTmp.z >= -1) {
      const avg = Math.round(sumHp / Math.max(1, physics.wheels.length));
      const sx = (_projTmp.x * 0.5 + 0.5) * vw;
      const sy = (-_projTmp.y * 0.5 + 0.5) * vh;
      _cartBadgeEl.style.display = '';
      _cartBadgeEl.style.left = Math.round(sx) + 'px';
      _cartBadgeEl.style.top = Math.round(sy) + 'px';
      const valEl = _cartBadgeEl.querySelector('.whp-val');
      if (valEl) valEl.textContent = `${avg}/100`;
      _cartBadgeEl.className = 'whp-badge ' + (avg >= 70 ? 'ok' : avg >= 35 ? 'warn' : 'crit');
    } else {
      _cartBadgeEl.style.display = 'none';
    }
  }
}

// Clickable starter supply consumption + 3D mesh raycast + Hold-Q & Fallen item labels
function consumeCartSupply(item) {
  if (!item || !item.supplyKind || item.spilled) return false;
  const ok = item.supplyKind === 'water'
    ? survival.drinkFromSupply(item)
    : survival.eatFromSupply(item);
  syncVitals();
  updateCargoLabelOverlay();
  return ok;
}

const _supplyRay = new THREE.Raycaster();
const _supplyPointer = new THREE.Vector2();
let _supplyDownPt = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (animator.inspectMode && !workshopOpen) {
    _supplyDownPt = { x: e.clientX, y: e.clientY };
  } else {
    _supplyDownPt = null;
  }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!_supplyDownPt || !animator.inspectMode || workshopOpen || !cart || !cart.cargoItems) {
    _supplyDownPt = null;
    return;
  }
  const distPx = Math.hypot(e.clientX - _supplyDownPt.x, e.clientY - _supplyDownPt.y);
  _supplyDownPt = null;
  if (distPx > 12) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  _supplyPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _supplyPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  _supplyRay.setFromCamera(_supplyPointer, camera);
  const targets = [];
  for (const it of cart.cargoItems) {
    if (!it.spilled && !it.hiddenForQuest && it.supplyKind && it.mesh) targets.push(it.mesh);
  }
  if (targets.length === 0) return;
  const hits = _supplyRay.intersectObjects(targets, true);
  if (!hits.length) return;
  let obj = hits[0].object;
  while (obj) {
    if (obj.userData && obj.userData.cartItem) {
      consumeCartSupply(obj.userData.cartItem);
      break;
    }
    obj = obj.parent;
  }
});

const FALLEN_LABEL_DIST = 11.0;
const _itemWorldPos = new THREE.Vector3();
let _tagCartRef = null;
let _tagItemCount = -1;

function requestWaterBarrelRefill(barrelItem, waterSrc = null) {
  if (!hasCart || gameMode !== 'play' || workshopOpen || !barrelItem || barrelItem.spilled) return false;
  const nearWater = waterSrc || (world.findNearestWaterSource
    ? world.findNearestWaterSource(physics.pos.x, physics.pos.z, 18.0)
    : null);
  if (!nearWater) {
    survival.msg = t('refill_no_water');
    showToast(survival.msg);
    syncVitals();
    return false;
  }
  const ch = barrelItem.charges || 0;
  const maxC = barrelItem.maxCharges || 5;
  if (ch >= maxC) {
    survival.msg = t('refill_done', { c: ch, m: maxC });
    showToast(survival.msg);
    syncVitals();
    return false;
  }
  if (!party.members || !party.members.length) {
    survival.msg = t('refill_need_npc');
    showToast(survival.msg);
    syncVitals();
    return false;
  }
  if (animator.inspectMode) setInspectMode(false);
  const res = party.startWaterRefillTask(nearWater, barrelItem, cart, {
    onProgress: (c, m, mem) => {
      const nm = (mem && mem.role && mem.role.name) ? mem.role.name : 'NPC';
      survival.msg = t('refill_step', { npc: nm, c, m });
      showToast(survival.msg);
      syncVitals();
    },
    onDone: (c, m) => {
      survival.msg = t('refill_done', { c, m });
      showToast(survival.msg);
      syncVitals();
      saveGameState(true);
    },
    onCancel: () => {
      survival.msg = t('refill_cancelled');
      showToast(survival.msg);
      syncVitals();
    },
  });
  if (res && res.ok) {
    const nm = (res.member && res.member.role && res.member.role.name) ? res.member.role.name : 'NPC';
    survival.msg = t('refill_started', { npc: nm });
    showToast(survival.msg);
    syncVitals();
    return true;
  }
  return false;
}

function syncCargoTagPool() {
  if (!cargoLabelOverlayEl) return;
  const items = (cart && cart.cargoItems) || [];
  if (_tagCartRef !== cart || _tagItemCount !== items.length) {
    _tagCartRef = cart;
    _tagItemCount = items.length;
    cargoLabelOverlayEl.innerHTML = '';
    for (const item of items) {
      const tag = document.createElement('div');
      tag.className = 'cargo-tag';
      tag.style.display = 'none';
      const handleTap = (e) => {
        if (!animator.inspectMode || workshopOpen || !item.supplyKind || item.spilled) return;
        const actEl = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        if (actEl && actEl.dataset.act === 'refill') {
          e.preventDefault();
          e.stopPropagation();
          requestWaterBarrelRefill(item);
          return;
        }
        if ((actEl && actEl.dataset.act === 'consume') || (!actEl && (item.charges || 0) > 0)) {
          e.preventDefault();
          e.stopPropagation();
          consumeCartSupply(item);
        }
      };
      tag.addEventListener('click', handleTap);
      item._tagEl = tag;
      cargoLabelOverlayEl.appendChild(tag);
    }
  }
}

function updateCargoLabelOverlay() {
  if (!cargoLabelOverlayEl || !cart || !cart.cargoItems) return;
  syncCargoTagPool();
  const hideAll = !hasCart || gameMode !== 'play' || workshopOpen || (mapUI && mapUI.isOpen);
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const inspectOn = !!animator.inspectMode && !hideAll;
  const nearWater = (inspectOn && world.findNearestWaterSource)
    ? world.findNearestWaterSource(physics.pos.x, physics.pos.z, 18.0)
    : null;
  const fetchingNpc = inspectOn && party && party.members
    ? party.members.find((m) => m.state === 'fetching_water')
    : null;

  for (const item of cart.cargoItems) {
    const el = item._tagEl;
    if (!el) continue;
    if (hideAll || item.hiddenForQuest) {
      el.style.display = 'none';
      continue;
    }

    const isSpilled = !!item.spilled;
    let show = false;
    if (isSpilled) {
      if (item.mesh) item.mesh.getWorldPosition(_itemWorldPos);
      else if (item.worldPos) _itemWorldPos.copy(item.worldPos);
      else continue;
      const dist = Math.hypot(_itemWorldPos.x - animator.x, _itemWorldPos.z - animator.z);
      show = dist <= FALLEN_LABEL_DIST || inspectOn;
    } else {
      show = inspectOn;
      if (show && item.mesh) item.mesh.getWorldPosition(_itemWorldPos);
    }

    if (!show || !item.mesh) {
      el.style.display = 'none';
      continue;
    }

    _projTmp.copy(_itemWorldPos);
    _projTmp.y += isSpilled ? 0.38 : (item.supplyKind ? 0.44 : 0.34);
    _projTmp.project(camera);
    if (_projTmp.z > 1 || _projTmp.z < -1) {
      el.style.display = 'none';
      continue;
    }
    const sx = (_projTmp.x * 0.5 + 0.5) * vw;
    const sy = (-_projTmp.y * 0.5 + 0.5) * vh;
    if (sx < -60 || sx > vw + 60 || sy < -30 || sy > vh + 30) {
      el.style.display = 'none';
      continue;
    }

    const itemName = item.isQuestCargo && quests.activeQuest && quests.activeQuest.cargoName
      ? quests.activeQuest.cargoName
      : (item.nameKey ? t(item.nameKey) : (item.name || 'Cargo'));

    let cls = 'cargo-tag';
    if (isSpilled) cls += ' fallen-item';
    else if (item.isQuestCargo) cls += ' quest-item';
    else if (item.supplyKind === 'water') cls += ' supply-water';
    else if (item.supplyKind === 'food') cls += ' supply-food';
    const ch = item.charges || 0;
    const maxCh = item.maxCharges || 5;
    const canRefillHere = !isSpilled && item.supplyKind === 'water' && nearWater && ch < maxCh;
    if (!isSpilled && item.supplyKind && inspectOn) {
      if (ch > 0 || canRefillHere) cls += ' clickable';
      else cls += ' empty';
    }

    let badgeHtml = '';
    if (isSpilled) badgeHtml += `<span class="cq-badge">${t('item_fallen_tag')}</span>`;
    if (item.isQuestCargo) badgeHtml += `<span class="cq-badge">${t('item_quest_tag')}</span>`;
    const chargeHtml = (!isSpilled && item.supplyKind)
      ? ` <span>(${ch}/${maxCh})</span>`
      : '';

    let hintHtml = '';
    if (!isSpilled && item.supplyKind && inspectOn) {
      if (item.supplyKind === 'water') {
        const acts = [];
        if (ch > 0) acts.push(`<button type="button" class="cargo-act-btn" data-act="consume">${t('item_click_drink')}</button>`);
        if (fetchingNpc) acts.push(`<span class="cs-hint">${t('item_refill_active', { c: ch, m: maxCh })}</span>`);
        else if (nearWater && ch < maxCh) acts.push(`<button type="button" class="cargo-act-btn refill" data-act="refill">${t('item_refill_btn')}</button>`);
        else if (ch <= 0) acts.push(`<span class="cs-hint">${t('item_empty')}</span>`);
        hintHtml = acts.length ? `<span class="cargo-tag-actions">${acts.join('')}</span>` : '';
      } else {
        hintHtml = ch > 0
          ? `<span class="cargo-tag-actions"><button type="button" class="cargo-act-btn food" data-act="consume">${t('item_click_eat')}</button></span>`
          : `<span class="cs-hint">${t('item_empty')}</span>`;
      }
    }
    const nextHtml = `<span class="cargo-tag-row">${badgeHtml}<span>${itemName}${chargeHtml}</span></span>${hintHtml}`;

    if (el.className !== cls) el.className = cls;
    if (el.dataset.html !== nextHtml) {
      el.dataset.html = nextHtml;
      el.innerHTML = nextHtml;
    }
    el.style.display = '';
    el.style.left = Math.round(sx) + 'px';
    el.style.top = Math.round(sy) + 'px';
  }
}

let last = performance.now();
let camPrevYaw = animator.yaw;
let _sleepZTimer = 0;
const _sleepHeadW = new THREE.Vector3();
window.__manualSim = false;

function stepSim(dt) {
  if (gameMode === 'menu') {
    animator.menuIdleMode = true;
    animator.setSteer(0);
    animator.setThrottle(0);
    animator.speed = 0;
    animator.targetSpeed = 0;
    animator.update(dt);
    world.setCartPose(physics.pos.x, physics.pos.z, physics.yaw);
    world.update(animator.x, dt, animator.z, animator.yaw);
    scene.updateMatrixWorld(true);
    readAnchors();
    if (physics.syncVisual) physics.syncVisual();
    if (physics.hitched) {
      towL.update(dt, anchors.a, anchors.b);
      towR.update(dt, anchors.c, anchors.d);
      traceL.update(dt, anchors.gL, anchors.stL);
      traceR.update(dt, anchors.gR, anchors.stR);
      reinL.update(dt, anchors.bitL, anchors.seat);
      reinR.update(dt, anchors.bitR, anchors.seat);
    }
    _menuCamT += dt;
    controls.target.set(
      _menuCamTarget.x + Math.sin(_menuCamT * 0.22) * 0.25,
      _menuCamTarget.y,
      _menuCamTarget.z + Math.cos(_menuCamT * 0.18) * 0.18
    );
    camera.position.set(
      _menuCamPos.x + Math.sin(_menuCamT * 0.19) * 0.55,
      _menuCamPos.y + Math.sin(_menuCamT * 0.31) * 0.12,
      _menuCamPos.z + Math.cos(_menuCamT * 0.21) * 0.45
    );
    controls.update();
    if (world.syncCamera) world.syncCamera(camera);
    updateWheelHpOverlay();
    updateCargoLabelOverlay();
    renderer.render(scene, camera);
    return;
  }
  if (gameMode === 'cutscene') {
    animator.menuIdleMode = false;
    animator.setSteer(0);
    animator.setThrottle(0);
    animator.speed = 0;
    animator.targetSpeed = 0;
    animator.update(dt);
    if (_cutsceneGuardNpc && _cutsceneGuardNpc.root && HC.animateNPC) {
      HC.animateNPC(_cutsceneGuardNpc.root, dt);
    }
    world.update(animator.x, dt, animator.z, animator.yaw);
    scene.updateMatrixWorld(true);
    if (physics.syncVisual) physics.syncVisual();
    const kCs = 1 - Math.exp(-5.0 * dt);
    controls.target.lerp(_csCamTarget, kCs);
    camera.position.lerp(_csCamPos, kCs);
    controls.update();
    if (world.syncCamera) world.syncCamera(camera);
    updateWheelHpOverlay();
    updateCargoLabelOverlay();
    renderer.render(scene, camera);
    return;
  }
  animator.menuIdleMode = false;
  if (storyStage === 'to_radnar' && !_radnarCutscenePlayed && world.VILLAGES && world.VILLAGES[0]) {
    const rad = world.VILLAGES[0];
    const rx = (rad.cx !== undefined) ? rad.cx : (rad.x || 0);
    const rz = (rad.cz !== undefined) ? rad.cz : (rad.z || 76);
    if (Math.hypot(animator.x - rx, animator.z - rz) <= 24.0) {
      if (startRadnarCutscene()) return;
    }
  }
  // --- horse controls & workshop lock ---
  const wasActing = survival.eating || survival.drinking;
  const acting = wasActing;
  const pcForward = !workshopOpen && !!(keysHeld.forward || btnForwardHeld || window.__forceForward);
  const pcBackward = !workshopOpen && !!(keysHeld.backward || btnBackwardHeld || window.__forceBackward);
  const stickActive = !workshopOpen && !!(touchUI.active && touchUI.joystick && touchUI.joystick.pad && touchUI.joystick.pad.active);
  if (workshopOpen) {
    animator.setSteer(0);
    animator.setThrottle(0);
  } else if (hitchAnim.active) {
    // Sedang ngepasin perlahan ke pangkal batang gerobak
  } else if (acting) {
    animator.setThrottle(0);
  } else if (pcForward && !pcBackward) {
    if (animator.state === 'graze' || animator.state === 'sleep') animator.setState(runLatched ? 'run' : 'walk');
    animator.setThrottle(1);
  } else if (pcBackward && !pcForward) {
    if (animator.state === 'graze' || animator.state === 'sleep' || animator.state === 'run') {
      runLatched = false;
      animator.setState('walk');
      if (touchUI && touchUI.setRunLatched) touchUI.setRunLatched(false);
    }
    animator.setThrottle(-1);
  } else if (!stickActive) {
    animator.setThrottle(0);
  } else if (stickActive && animator.state === 'sleep') {
    const mStick = Math.hypot(touchUI.joystick.vec.x || 0, touchUI.joystick.vec.y || 0);
    if (mStick > 0.16) animator.setState(runLatched ? 'run' : 'walk');
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

  animator.unhitched = !hasCart || !physics.hitched;
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
  world._horseJumpActive = !!animator.jumpActive;
  world.setCartPose(physics.pos.x, physics.pos.z, physics.yaw);
  world.update(animator.x, dt, animator.z, animator.yaw);
  if (vignetteEl) vignetteEl.classList.toggle('night-mist', world.currentMoodKey === 'night');
  party.hasCart = hasCart;
  party.update(animator.x, animator.z, animator.yaw, dt, cart, hasCart ? physics : null);
  mobs.update(dt, {
    animator,
    physics,
    hasCart,
    horseHp: survival.hp,
    party,
    camera,
    world,
    onCartAttacked: (dmg, variant) => {
      const label = t(variant === 'big' ? 'bandit_big' : 'bandit_small');
      survival.msg = t('msg_cart_attacked', { who: label, dmg });
      syncVitals();
    },
    onHorseAttacked: (dmg, variant) => {
      const label = t(variant === 'big' ? 'bandit_big' : 'bandit_small');
      survival.hp = Math.max(0, survival.hp - dmg);
      survival.msg = t('msg_horse_attacked', { who: label, dmg });
      showToast(survival.msg);
      syncVitals();
    },
    onMobRammed: (mob, dmg) => {
      const who = mob && mob.kind === 'bandit'
        ? t(mob.variant === 'big' ? 'bandit_big' : 'bandit_small')
        : ((mob && mob.kind) || 'Mob');
      const msg = t('msg_ram_hit', { who, dmg });
      survival.msg = msg;
      showToast(msg);
      syncVitals();
    },
    onNightAmbush: (list) => {
      const n = (list && list.length) || 1;
      const msg = t('msg_ambush', { n });
      survival.msg = msg;
      showToast(msg);
      syncVitals();
    },
  });
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

  // Quest antar-desa, marker NPC [!]/[?], & peta mini
  syncQuestNpcMarkers(dt);
  const nearVillage = quests.getNearbyVillage(animator.x, animator.z);
  quests.update(animator.x, animator.z, hasCart ? physics : null, (done) => {
    if (HC.clearQuestCargoFromCart) HC.clearQuestCargoFromCart(cart, physics);
    if (party.clearQuestPassengers) party.clearQuestPassengers(cart);
    if (done.rewardMaterials && store.addMaterials) store.addMaterials(done.rewardMaterials);
    const matTxt = done.rewardMaterials
      ? Object.entries(done.rewardMaterials).map(([k, n]) => {
          const d = MATERIAL_DEFS[k];
          return `${d ? d.icon : ''}${n} ${d ? t(d.nameKey) : k}`;
        }).join(', ')
      : '';
    const toastKey = done.questType === 'passenger' ? 'quest_pass_complete_toast' : 'quest_complete_toast';
    const msg = t(toastKey, {
      cargo: done.cargoName,
      receiver: done.receiverName || done.toName,
      to: done.toName,
      gold: done.rewardGold,
      mats: matTxt || 'Materials',
    });
    survival.msg = msg;
    showToast(msg);
    syncVitals();
    if (ui && ui.refresh && ui.isOpen && ui.isOpen()) ui.refresh();
    _tagCartRef = null;
    _tagItemCount = -1;
    _lastQuestSig = '';
    _lastDockSig = '';
    saveGameState(true);
  }, party.wild);
  renderQuestHud(nearVillage);
  mapUI.update(animator.x, animator.z, animator.yaw, physics.pos.x, physics.pos.z, quests.activeQuest, nearVillage);

  // anchor sabuk perut & kalung kuda harus segar sebelum physics:
  // gerobak ditarik lewat tali (traces) + dibimbing batang (thills)
  scene.updateMatrixWorld(true);
  readAnchors();
  if (hasCart) {
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
  } else {
    if (physics.syncVisual) physics.syncVisual();
  }

  flipGame.step(dt);
  syncFlipBanner();
  syncHitchUi();

  const gyHorse = world.terrainHeightAt ? world.terrainHeightAt(animator.x, animator.z) : 0;
  horseBlob.position.set(animator.x - Math.cos(animator.yaw) * 0.15, gyHorse + 0.02, animator.z + Math.sin(animator.yaw) * 0.15);
  cartBlob.visible = hasCart || storyStage === 'find_cart';
  cartBlob.position.set(cart.root.position.x, (world.terrainHeightAt ? world.terrainHeightAt(cart.root.position.x, cart.root.position.z) : 0) + 0.02, cart.root.position.z);

  const inspAllowed = canInspectCart();
  if (animator.inspectMode && !inspAllowed) setInspectMode(false);
  if (btnInspectEl) {
    btnInspectEl.disabled = !inspAllowed;
    btnInspectEl.style.display = hasCart ? '' : 'none';
  }
  if (touchUI && touchUI.setInspectDisabled) touchUI.setInspectDisabled(!inspAllowed);

  if (workshopOpen) {
    if (_wsRecord) computeWorkshopCamera(_wsRecord);
    const kWs = 1 - Math.exp(-7.5 * dt);
    controls.target.lerp(_wsCamGoalTarget, kWs);
    camera.position.lerp(_wsCamGoalPos, kWs);
  } else {
    // Hold-Q Inspect focuses camera cleanly onto cart & wheels; release returns smoothly
    const focusX = animator.inspectMode
      ? HC.lerp(animator.x, physics.pos.x, 0.85)
      : (animator.x - animator.forwardX * 1.2);
    const focusZ = animator.inspectMode
      ? HC.lerp(animator.z, physics.pos.z, 0.85)
      : (animator.z - animator.forwardZ * 1.2);
    const gyFocus = world.terrainHeightAt ? world.terrainHeightAt(focusX, focusZ) : 0;
    followTarget.set(focusX, gyFocus + (animator.inspectMode ? 0.85 : 1.25), focusZ);

    const dYawCam = animator.yaw - camPrevYaw;
    camPrevYaw = animator.yaw;
    if (Math.abs(dYawCam) > 1e-5) {
      const ox = camera.position.x - controls.target.x;
      const oz = camera.position.z - controls.target.z;
      const cc = Math.cos(dYawCam), ss = Math.sin(dYawCam);
      camera.position.x = controls.target.x + ox * cc + oz * ss;
      camera.position.z = controls.target.z - ox * ss + oz * cc;
    }

    const kRate = animator.inspectMode ? 7.5 : (_inspectReturning ? 8.5 : 4.5);
    const k = 1 - Math.exp(-kRate * dt);
    const dx = (followTarget.x - controls.target.x) * k;
    const dy = (followTarget.y - controls.target.y) * k;
    const dz = (followTarget.z - controls.target.z) * k;
    controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;

    if (animator.inspectMode) {
      _inspectWantOff.copy(_inspectTargetLocalOff).applyAxisAngle(_upY, animator.yaw);
      _inspectCurOff.copy(camera.position).sub(controls.target);
      _inspectCurOff.lerp(_inspectWantOff, 1 - Math.exp(-7.5 * dt));
      camera.position.copy(controls.target).add(_inspectCurOff);
    } else if (_inspectReturning && _inspectHasSaved) {
      _inspectWantOff.copy(_inspectSavedLocalOff).applyAxisAngle(_upY, animator.yaw);
      _inspectCurOff.copy(camera.position).sub(controls.target);
      _inspectCurOff.lerp(_inspectWantOff, 1 - Math.exp(-8.5 * dt));
      if (_inspectCurOff.distanceTo(_inspectWantOff) < 0.04) {
        _inspectCurOff.copy(_inspectWantOff);
        _inspectReturning = false;
        _inspectHasSaved = false;
      }
      camera.position.copy(controls.target).add(_inspectCurOff);
    }
  }

  controls.update();
  if (world.syncCamera) world.syncCamera(camera);

  // Sleepy Zzz particles saat kuda tidur
  if (animator.sleepBlend > 0.72 && mobs && mobs.vfx && mobs.vfx.spawnSleepyZ) {
    _sleepZTimer += dt;
    if (_sleepZTimer >= 1.25) {
      _sleepZTimer = 0;
      if (horse && horse.head && horse.head.getWorldPosition) {
        horse.head.getWorldPosition(_sleepHeadW);
        mobs.vfx.spawnSleepyZ(_sleepHeadW);
      }
    }
  } else {
    _sleepZTimer = 0.85;
  }

  const st = animator.jumpActive ? 'jump'
    : hitchAnim.active ? 'dock'
    : animator.speed < -0.08 ? 'rev'
    : animator.state;
  const label = t(`state_${st}`) || st.toUpperCase();
  if (hudState) hudState.textContent = label;
  for (const [m, id] of [['walk','btn-walk'],['rev','btn-rev'],['run','btn-run'],['jump','btn-jump'],['graze','btn-graze'],['sleep','btn-sleep']]) {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('primary', st === m);
  }
  if (btnSleepEl) btnSleepEl.classList.toggle('active', animator.state === 'sleep');
  if (touchUI && touchUI.setSleepState) touchUI.setSleepState(animator.state === 'sleep');
  if (hudSpeed) hudSpeed.textContent = (Math.abs(animator.speed) * 3.6).toFixed(1) + ' km/h';
  syncVitals();
  if (hudHead) {
    const st2 = animator.steer;
    hudHead.textContent = st2 > 0.12 ? t('steer_left') : st2 < -0.12 ? t('steer_right') : t('steer_straight');
  }
  if (hudRoll) {
    const deg = (physics.roll * 180 / Math.PI).toFixed(0);
    hudRoll.textContent = deg + '°' + (physics.flipped ? ` — ${t('flipped_tag')}` : '');
    hudRoll.style.color = physics.flipped ? '#c0392b' : '';
  }
  if (hudCargo) {
    if (!hasCart) {
      hudCargo.textContent = storyStage === 'find_cart' ? t('story_obj_cart') : '—';
      hudCargo.style.color = '';
    } else {
      const total = cart.cargoItems.length;
      const spilled = physics.spilled.length;
      const inBed = total - spilled;
      const pCount = party.members.filter((m) => m.state === 'seated').length
        + (party.questPassengers ? party.questPassengers.length : 0);
      let maxDy = 0;
      for (const it of cart.cargoItems) {
        if (!it.spilled) maxDy = Math.max(maxDy, it.localPos.y - it.floorY);
      }
      hudCargo.textContent = spilled > 0
        ? `${pCount} npc · ${inBed}/${total} (${spilled} fallen)`
        : `${pCount} npc · ${inBed}/${total} · ${(maxDy * 100).toFixed(0)}cm`;
      hudCargo.style.color = spilled > 0 ? '#f87171' : '';
    }
  }
  if (hudWheel) {
    const rep = physics.wheelReport ? physics.wheelReport() : [];
    let worst = 100, lost = 0;
    const parts = rep.map((r) => {
      worst = Math.min(worst, r.hp);
      if (r.detached) lost++;
      return r.detached ? '✕' : String(Math.round(r.hp));
    });
    hudWheel.textContent = lost > 0
      ? `${parts.join(' · ')} (${lost} ${t('wheel_detached').toLowerCase()})`
      : parts.join(' · ');
    hudWheel.style.color = lost > 0 ? '#c084fc' : worst <= 0 ? '#f87171' : worst < 45 ? '#fb923c' : '';
  }
  if (hudGold) hudGold.textContent = `${quests.gold} G`;
  if (hudTime && world.getTimeLabel) hudTime.textContent = world.getTimeLabel();

  if (portraitRender && ((portraitRender.frameCount++ & 3) === 0)) {
    const nowT = world.totalTime || 0;
    const { bust } = portraitRender;
    bust.root.rotation.y = 0.12 + Math.sin(nowT * 0.9) * 0.08 + (animator.steer || 0) * 0.22;
    bust.root.rotation.z = -(animator.sleepBlend || 0) * 0.28 + Math.sin(nowT * 1.4) * 0.02;
    if (bust.ears && bust.ears.length >= 2) {
      const eBob = Math.sin(nowT * 2.1) * 0.06;
      bust.ears[0].rotation.z = 0.08 + eBob;
      bust.ears[1].rotation.z = -0.08 - eBob;
    }
    portraitRender.renderer.render(portraitRender.scene, portraitRender.camera);
  }

  renderer.render(scene, camera);
  updateWheelHpOverlay();
  updateCargoLabelOverlay();
}

function frame(now) {
  const rawDt = (now - last) / 1000;
  last = now;
  if (!window.__manualSim) {
    if (window.__freeze) {
      renderer.render(scene, camera);
    } else {
      const dt = Math.min(0.033, Math.max(0.001, rawDt));
      stepSim(dt);
    }
  }
  requestAnimationFrame(frame);
}

applyTranslations();
enterMainMenu();

window.RIG = {
  scene, camera, renderer, controls, animator, physics, world, cart, horse,
  store, horseStats, ui, party, mobs, quests, mapUI,
  toggleInspectMode, setInspectMode, canInspectCart, doSleepToggle, doInteract,
  openWorkshop, closeWorkshop, getLang, setLang,
  startNewGame, loadGameState, saveGameState, enterMainMenu, advanceCutscene, claimHeroOldCart,
  requestWaterBarrelRefill, getHasCart: () => hasCart, getStoryStage: () => storyStage, getGameMode: () => gameMode,
  rebuildCartFromStore, stepSim, ropes: { towL, towR, traceL, traceR, reinL, reinR }
};
window.SURVIVAL = survival;
window.TOUCH_UI = touchUI;
window.QUESTS = quests;
window.MAP_UI = mapUI;
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
