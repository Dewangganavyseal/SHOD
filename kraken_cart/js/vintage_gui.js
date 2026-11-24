import { HC } from './hc.js';

// ============================================================
//  VINTAGE ORNATE PIXEL ART GUI ENGINE (GUI 1 CLASSIC MENU)
//  Self-contained SVG icon renderer, gold medallion bezel,
//  16-bit SFX synthesizer, and 60fps juicy survival bars.
// ============================================================

const STORAGE_KEY = 'shod_vintage_ui_v1';

const PIXEL_ICONS = {
  corner_rosette: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242', d: '#6b4e2d' },
    grid: [
      '..oooooo..',
      '.ohhhhhmo.',
      'ohhhmmmsso',
      'ohhmhhmsso',
      'ohmhhhhmdo',
      'ohmmhhmmdo',
      'ommmmmmddo',
      'omssssdddo',
      '.osssdddo.',
      '..oooooo..',
    ],
  },
  hud_corner_medallion: {
    pal: { o: '#34282b', h: '#f2dfa8', l: '#e5c88c', m: '#cca76b', s: '#a37b47', d: '#75552f' },
    grid: [
      '...oooooo...',
      '..ohhhhhlo..',
      '.ohhlmmllmo.',
      'ohhsllmmmsmo',
      'ohmlsmmmslmo',
      'ohmmmsmsmmso',
      'olmmmsmsmmso',
      'olmmsmmmsdso',
      'ommsmmmssddo',
      '.ommmmmssdo.',
      '..osssdddo..',
      '...oooooo...',
    ],
  },
  close_x: {
    pal: { o: '#34282b', g: '#e5c88c', r: '#c56248', h: '#e3866f', s: '#8a3529', w: '#f5e6c8' },
    grid: [
      '...oooooo...',
      '..oggggggo..',
      '.oghhhhhrgo.',
      'oghwrrrhwrgo',
      'oghwwrrwwrgo',
      'ogrrwwwwrrgo',
      'ogrrrwwrrsgo',
      'ogrrwwwwrsgo',
      'ogrwrrrrwsgo',
      '.ogssssssgo.',
      '..oggggggo..',
      '...oooooo...',
    ],
  },
  coin: {
    pal: { o: '#34282b', h: '#f5e4bc', m: '#cca76b', s: '#967242', d: '#6b4e2d' },
    grid: [
      '..oooooo..',
      '.ohhhhhmo.',
      'ohhmhhmmso',
      'ohmhhmmmso',
      'ohhmhhmmso',
      'ohmmhhmmso',
      'ohhmhhmsdo',
      'ommmmmmddo',
      '.osssdddo.',
      '..oooooo..',
    ],
  },
  sword: {
    pal: { o: '#34282b', w: '#f2edf0', b: '#b8c0c8', s: '#7f8794', g: '#e5c88c', d: '#967242' },
    grid: [
      '.........ooo',
      '........owwo',
      '.......owwbo',
      '......owwbso',
      '.....owwbso.',
      '..ooowwbso..',
      '.ogggwbso...',
      '..oogggo....',
      '..ogdoog....',
      '.ogdo..o....',
      'ogdo........',
      'ooo.........',
    ],
  },
  crown: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242', r: '#d46652', b: '#78b3c2' },
    grid: [
      '............',
      '.....oo.....',
      '.oo.ohho.oo.',
      'ohhoohhoohho',
      'ohmhhmhhmmso',
      'ohmrhmbhmrso',
      'ohmmmmmmmmso',
      'ohhhhhhhhhso',
      'osssssssssso',
      '.oooooooooo.',
      '............',
      '............',
    ],
  },
  gear: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242', p: '#483c4c' },
    grid: [
      '....oooo....',
      '....ohmo....',
      '.oo.ohmo.oo.',
      'ohmoohmmoohm',
      '.oohhhhmmso.',
      '..ohmpphmo..',
      '..ohmpphmo..',
      '.oommmmmsoo.',
      'omsoossmooso',
      '.oo.osso.oo.',
      '....osso....',
      '....oooo....',
    ],
  },
  gear_big: {
    pal: { o: '#34282b', h: '#f2edf0', m: '#b5adb2', s: '#787078', p: '#483c4c' },
    grid: [
      '....oooo....',
      '....ohmo....',
      '.oo.ohmo.oo.',
      'ohhoohmmooho',
      '.oohhhhmmso.',
      '..ohmppmmo..',
      '..ohmppmmo..',
      '.oommmmmsoo.',
      'omsoossmooso',
      '.oo.osso.oo.',
      '....osso....',
      '....oooo....',
    ],
  },
  wrench: {
    pal: { o: '#34282b', h: '#ebe6e8', m: '#b4acb5', s: '#736b75' },
    grid: [
      '......oo..oo',
      '.....ohhooho',
      '.....ohmhhmo',
      '.....ohmmmo.',
      '....ohmmso..',
      '...ohmmso...',
      '..ohmmso....',
      '.ohmmso.....',
      'ohmmso......',
      'ohmmo.......',
      'osso........',
      'ooo.........',
    ],
  },
  star: {
    pal: { o: '#34282b', h: '#fff0bf', m: '#e5c88c', s: '#b0854a' },
    grid: [
      '.....oo.....',
      '....ohho....',
      '....ohmo....',
      '.ooohmmhooo.',
      'ohhhhmmmmmso',
      '.oohmmmmsoo.',
      '..ohmmmsso..',
      '..ohmmsmso..',
      '.ohmo..omso.',
      '.ooo....ooo.',
    ],
  },
  stat_heart: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242' },
    grid: [
      '............',
      '..ooo..ooo..',
      '.ohhhoohhmo.',
      'ohhhhmmmmmso',
      'ohhhmmmmmmso',
      'ohmmmmmmmmso',
      '.ommmmmmmso.',
      '..ommmmmso..',
      '...ommmso...',
      '....omso....',
      '.....oo.....',
      '............',
    ],
  },
  stat_fist: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242' },
    grid: [
      '............',
      '..oo.oo.oo..',
      '.ohmohmohmo.',
      'ohhmhhmhhmso',
      'ohmmmmmmmmso',
      'ohmmhhhhmmso',
      'ohmmmmmmmmso',
      '.ommmmmmmso.',
      '..ohmmmmso..',
      '..omssssso..',
      '..oooooooo..',
      '............',
    ],
  },
  stat_boot: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242' },
    grid: [
      '............',
      '.....oooo...',
      '....ohhmso..',
      '....ohmmso..',
      '....ohmmso..',
      '...ohmmmso..',
      '..ohhhhhmso.',
      '.ohmmmmmmso.',
      '.osssssssso.',
      '..oooooooo..',
      '............',
      '............',
    ],
  },
  stat_luck: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', s: '#967242' },
    grid: [
      '............',
      '...oooooo...',
      '..ohhhhhmo..',
      '.ohmmmmmmso.',
      'ohmmhhhhmmso',
      'ohmmooommmso',
      'ohmmmmmmmmso',
      '.ohmmmmmmso.',
      '..osssssso..',
      '...oooooo...',
      '............',
      '............',
    ],
  },
  buff_atk: {
    pal: { o: '#34282b', r: '#d46652', h: '#f2a68d', g: '#c5e08b', u: '#7fa858' },
    grid: [
      '.......oo...',
      '.oo...oggo..',
      'ohho.oggggo.',
      '.orro.oguo..',
      'orhhrooguo..',
      '.orro.oguo..',
      'or..ro.oo...',
      'oo..oo......',
    ],
  },
  buff_def: {
    pal: { o: '#34282b', b: '#78b3c2', h: '#c2e6eb', g: '#c5e08b', u: '#7fa858' },
    grid: [
      '.......oo...',
      '.oooo.oggo..',
      'ohhbboogggo.',
      'ohbbbooguo..',
      'obbbbooguo..',
      '.obbbooguo..',
      '..obo..oo...',
      '...o........',
    ],
  },
  buff_spd: {
    pal: { o: '#34282b', c: '#e5c88c', b: '#6ca1a6', g: '#c5e08b', u: '#7fa858' },
    grid: [
      '.......oo...',
      '...oo.oggo..',
      '..occoogggo.',
      '.ocbbooguo..',
      'ocbbbooguo..',
      'occcco.oo...',
      '.oooo.......',
      '............',
    ],
  },
  buff_hp: {
    pal: { o: '#34282b', r: '#c56248', h: '#f0a68b', g: '#c5e08b', u: '#7fa858' },
    grid: [
      '.......oo...',
      '.oo.oooggo..',
      'ohroroogggo.',
      'ohrrrooguo..',
      '.orrrooguo..',
      '..orro.oo...',
      '...oo.......',
      '............',
    ],
  },
  buff_lv: {
    pal: { o: '#34282b', y: '#f2dfa8', m: '#cca76b', g: '#c5e08b', u: '#7fa858' },
    grid: [
      '.......oo...',
      '......oggo..',
      'oy.oyoggggo.',
      'oy.oy.oguo..',
      'oy.oy.oguo..',
      'oyyoy.oguo..',
      'ooooo..oo...',
      '............',
    ],
  },
  hammer: {
    pal: { o: '#34282b', h: '#e6e0e4', m: '#a8a0a8', s: '#6d656e', w: '#cca76b', d: '#8a6538' },
    grid: [
      '.....ooooo..',
      '....ohhhmmo.',
      '...ohhhmmsoo',
      '...ommmmsso.',
      '....oowoo...',
      '....owdo....',
      '...owdo.....',
      '..owdo......',
      '.owdo.......',
      'owdo........',
      'ooo.........',
      '............',
    ],
  },
  potion: {
    pal: { o: '#34282b', g: '#e5c88c', c: '#c9e0e6', r: '#c56248', h: '#f2a288', s: '#8a3529' },
    grid: [
      '....oooo....',
      '....oggo....',
      '....oooo....',
      '....occo....',
      '...occcco...',
      '..ochrhrro..',
      '.ochrrrrrso.',
      '.ohrrrrrrso.',
      '.orrrrrrsso.',
      '..osssssso..',
      '...oooooo...',
      '............',
    ],
  },
  apple: {
    pal: { o: '#34282b', g: '#9cc474', b: '#8a6538', h: '#f09f84', r: '#c56248', s: '#8a3529' },
    grid: [
      '......ooo...',
      '.....oggo...',
      '....oboo....',
      '..ooobooo...',
      '.ohhrrrrro..',
      'ohhhrrrrrso.',
      'ohrrrrrrrso.',
      'orrrrrrrsso.',
      '.orrrrrsso..',
      '..oosssso...',
      '....oooo....',
      '............',
    ],
  },
  map_scroll: {
    pal: { o: '#34282b', h: '#f5e6c8', m: '#dec499', s: '#ad8d5c', r: '#c56248' },
    grid: [
      '..oooooooo..',
      '.ohhhhhhhmo.',
      '.ohmmmmmmso.',
      '.ohmmrmmmso.',
      '.ohmrmrmmso.',
      '.ohmmrmmmso.',
      '.ohmmmmmmso.',
      '.ohmmmmmmso.',
      '.omssssssso.',
      '..oooooooo..',
    ],
  },
  bust_gold: {
    pal: { o: '#34282b', h: '#f5e4bc', m: '#cca76b', s: '#967242' },
    grid: [
      '...oooo...',
      '..ohhhmo..',
      '..ohmmso..',
      '..ommmso..',
      '...oooo...',
      '.oohhhmoo.',
      'ohhmmmmmso',
      'ohmmmmmmso',
      'osssssssso',
      '.oooooooo.',
    ],
  },
  chest: {
    pal: { o: '#34282b', w: '#a87d4f', d: '#755331', g: '#f2dfa8', m: '#cca76b' },
    grid: [
      '.oooooooo.',
      'ogwwwwwwgo',
      'owwwwwwwwo',
      'oggggggggo',
      'odddggdddo',
      'odddggdddo',
      'oddddddddo',
      'ogddddddgo',
      '.oooooooo.',
      '..........',
    ],
  },
  compass: {
    pal: { o: '#34282b', h: '#f2dfa8', m: '#cca76b', r: '#d46652', b: '#8ec1eb', p: '#5c4d61' },
    grid: [
      '....oooo....',
      '..ooppppoo..',
      '.opppoopppo.',
      '.oppprrpppo.',
      'oppprrrppppo',
      'opppohhppppo',
      'opppohhppppo',
      'oppppbbbpppo',
      '.opppbbpppo.',
      '.opppoopppo.',
      '..ooppppoo..',
      '....oooo....',
    ],
  },
  camp_flask: {
    pal: { o: '#34282b', g: '#e5c88c', b: '#8ec1eb', d: '#5b92c2', w: '#f5e4bc', r: '#c56248', h: '#f09f84', l: '#9cc474' },
    grid: [
      '....ooo.........',
      '....ogo...ooo...',
      '...ooooo.ollo...',
      '..owbbbooooho...',
      '.owbbbbbohhrro..',
      '.obbbbbbohhrrso.',
      '.obbbddboorrrso.',
      '..oddddo..osoo..',
      '...oooo.........',
    ],
  },
};

function renderIcon(name, sizePx = 20) {
  const def = PIXEL_ICONS[name];
  if (!def) return '';
  const h = def.grid.length;
  const w = def.grid[0].length;
  let rects = '';
  for (let y = 0; y < h; y++) {
    const row = def.grid[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch !== '.' && def.pal[ch]) {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${def.pal[ch]}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

const FILIGREE_SVG = (() => {
  const rows = [
    '.....oooo.............oooo.....',
    '...oo....oo...ooo...oo....oo...',
    '.oo..oooo..ooo...ooo..oooo..oo.',
    'o..oo....oo.........oo....oo..o',
  ];
  let rects = '';
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === 'o') {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#6b5d70"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 31 4" width="124" height="8" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
})();

function buildOrnateCircleMedallionRingSvg(sizePx = 86) {
  const N = 44;
  const cx = 21.5;
  const cy = 21.5;
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  const isGoldRing = (x, y) => Math.hypot(x - cx, y - cy) <= 20.15;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inBody = isGoldRing(x, y);
      if (!inBody) {
        const adj =
          (x > 0 && isGoldRing(x - 1, y)) ||
          (x < N - 1 && isGoldRing(x + 1, y)) ||
          (y > 0 && isGoldRing(x, y - 1)) ||
          (y < N - 1 && isGoldRing(x, y + 1));
        if (adj) grid[y][x] = '#34282b';
        continue;
      }
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const light = dx + dy;

      if (d >= 16.55) {
        let col = '#cca76b';
        if (d >= 19.05) {
          if (light < 2.0) col = '#f2dfa8';
          else if (light < 11.0) col = '#e5c88c';
          else col = '#967242';
        } else if (d >= 17.65) {
          if (light < -12.0) col = '#f2dfa8';
          else if (light < -2.0) col = '#e5c88c';
          else if (light < 10.0) col = '#cca76b';
          else col = '#a37b47';
        } else {
          if (light < -4.0) col = '#a37b47';
          else if (light < 8.0) col = '#cca76b';
          else col = '#e5c88c';
        }
        grid[y][x] = col;
      } else if (d >= 15.5) {
        grid[y][x] = '#34282b';
      }
      // Interior d < 15.5 remains transparent so live 3D horse portrait shows cleanly!
    }
  }

  let rects = '';
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const col = grid[y][x];
      if (!col) { x++; continue; }
      let run = 1;
      while (x + run < N && grid[y][x + run] === col) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${col}"/>`;
      x += run;
    }
  }
  return `<svg viewBox="0 0 ${N} ${N}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

function hydrateSvgs(root = document) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.js-icon').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const sz = parseInt(el.getAttribute('data-size') || '20', 10);
    el.innerHTML = renderIcon(name, sz);
  });
  root.querySelectorAll('.js-corner').forEach((el) => {
    const pos = el.getAttribute('data-pos');
    el.className = `corner-medallion ${pos}`;
    el.innerHTML = renderIcon('corner_rosette', 16);
  });
  root.querySelectorAll('.js-hud-corner').forEach((el) => {
    const pos = el.getAttribute('data-pos');
    const sz = parseInt(el.getAttribute('data-size') || '22', 10);
    el.className = `hud-corner-medallion ${pos}`;
    el.innerHTML = renderIcon('hud_corner_medallion', sz);
  });
  root.querySelectorAll('.js-filigree').forEach((el) => {
    const pos = el.getAttribute('data-pos');
    el.className = `filigree-strip ${pos}`;
    el.innerHTML = FILIGREE_SVG;
  });
  root.querySelectorAll('.js-medallion-ring').forEach((el) => {
    const sz = parseInt(el.getAttribute('data-size') || '86', 10);
    el.innerHTML = buildOrnateCircleMedallionRingSvg(sz);
  });
}

// ============================================================
//  16-BIT CHIPTUNE SFX & SETTINGS
// ============================================================
const uiState = {
  sfxVol: 8,
  sfxEnabled: true,
  uiShake: true,
};

function loadUiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d && Number.isFinite(d.sfxVol)) uiState.sfxVol = Math.max(0, Math.min(12, d.sfxVol | 0));
    if (d && typeof d.sfxEnabled === 'boolean') uiState.sfxEnabled = d.sfxEnabled;
    if (d && typeof d.uiShake === 'boolean') uiState.uiShake = d.uiShake;
  } catch (_e) { /* ignore */ }
}

function saveUiSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(uiState));
  } catch (_e) { /* ignore */ }
}

let _audioCtx = null;
function getAudioCtx() {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch (_e) {
    return null;
  }
}

function playSfx(type = 'click') {
  if (!uiState.sfxEnabled || uiState.sfxVol <= 0) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const vol = (uiState.sfxVol / 12) * 0.14;
    const now = ctx.currentTime;
    const tone = (freq, dur, wave, startOffset = 0, endFreq = null) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + startOffset + dur);
      gain.gain.setValueAtTime(vol, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.01);
    };
    if (type === 'hit') {
      tone(185, 0.11, 'sawtooth', 0, 72);
      tone(110, 0.08, 'square', 0.03, 55);
    } else if (type === 'heal') {
      tone(440, 0.08, 'triangle', 0, 520);
      tone(587, 0.10, 'triangle', 0.06, 660);
      tone(880, 0.14, 'sine', 0.12);
    } else if (type === 'confirm') {
      tone(523, 0.07, 'square', 0);
      tone(659, 0.07, 'square', 0.06);
      tone(784, 0.10, 'square', 0.12);
      tone(1046, 0.16, 'triangle', 0.18);
    } else {
      tone(540, 0.04, 'square', 0, 620);
    }
  } catch (_e) { /* ignore autoplay restrictions */ }
}

// ============================================================
//  JUICY 60FPS SURVIVAL BARS + PIXEL PARTICLES
// ============================================================
const barDefs = {
  hp: {
    target: 100, display: 100, ghost: 100, surge: 100, max: 100, ghostDelay: 0,
    numColor: '#e6947c', particleHex: ['#f5e4bc', '#e08265', '#c56248'],
  },
  stamina: {
    target: 100, display: 100, ghost: 100, surge: 100, max: 100, ghostDelay: 0,
    numColor: '#9bc9cc', particleHex: ['#e2f7f7', '#9bc9cc', '#6ca1a6'],
  },
  hunger: {
    target: 100, display: 100, ghost: 100, surge: 100, max: 100, ghostDelay: 0,
    numColor: '#ebc070', particleHex: ['#fff2cc', '#ebc070', '#cf9444'],
  },
  thirst: {
    target: 100, display: 100, ghost: 100, surge: 100, max: 100, ghostDelay: 0,
    numColor: '#8ec1eb', particleHex: ['#e0f2ff', '#8ec1eb', '#5b92c2'],
  },
};

const barEls = {};
const particles = [];
let fxCanvas = null;
let fxCtx = null;
let floatLayer = null;
let _initialized = false;

function cacheBarDom() {
  for (const key of Object.keys(barDefs)) {
    const row = document.getElementById(`v-row-${key}`);
    if (!row) continue;
    barEls[key] = {
      row,
      ghost: document.getElementById(`v-ghost-${key}`),
      surge: document.getElementById(`v-surge-${key}`),
      fill: row.querySelector('.surv-fill'),
      shimmer: document.getElementById(`v-shimmer-${key}`),
      flash: document.getElementById(`v-flash-${key}`),
      num: document.getElementById(`v-${key === 'hunger' ? 'food' : key === 'thirst' ? 'water' : key === 'stamina' ? 'sta' : 'hp'}-t`),
    };
  }
}

function triggerClassAnim(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function spawnBarParticles(rect, colors, isIncrease) {
  if (!fxCanvas || !rect || rect.width <= 0) return;
  const count = isIncrease ? 10 : 12;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: rect.left + rect.width * (isIncrease ? Math.random() : (0.72 + Math.random() * 0.28)),
      y: rect.top + rect.height * Math.random(),
      vx: isIncrease ? (Math.random() - 0.5) * 60 : (Math.random() - 0.3) * 110,
      vy: isIncrease ? -(48 + Math.random() * 75) : -(38 + Math.random() * 72),
      gravity: isIncrease ? 95 : 270,
      size: Math.random() > 0.45 ? 4 : 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.42 + Math.random() * 0.30,
    });
  }
}

function spawnFloatNumber(rect, delta, color) {
  if (!floatLayer || !rect || rect.width <= 0) return;
  const el = document.createElement('div');
  el.className = 'float-num';
  el.style.left = `${rect.left + rect.width * 0.65}px`;
  el.style.top = `${rect.top - 4}px`;
  el.style.color = delta > 0 ? '#d7f2a8' : color;
  el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
  floatLayer.appendChild(el);
  setTimeout(() => el.remove(), 860);
}

function updateVitals(vals) {
  const mapping = [
    ['hp', vals.hp, vals.hpMax || 100],
    ['stamina', vals.stamina, vals.staminaMax || 100],
    ['hunger', vals.hunger, 100],
    ['thirst', vals.thirst, 100],
  ];
  for (const [key, rawVal, rawMax] of mapping) {
    const b = barDefs[key];
    const nextMax = Math.max(1, Math.round(rawMax));
    const nextVal = Math.max(0, Math.min(nextMax, rawVal));
    const prevTarget = b.target;
    const delta = nextVal - prevTarget;
    b.max = nextMax;
    b.target = nextVal;

    const d = barEls[key];
    if (d && d.num) {
      d.num.textContent = `${Math.round(nextVal)}/${nextMax}`;
    }

    // Trigger juicy burst only on discrete events (>= 5 units change)
    if (Math.abs(delta) >= 5 && _initialized) {
      const domRow = d && d.row;
      const domFill = d && d.fill;
      const med = document.getElementById('btn-horse-portrait');
      if (delta < 0) {
        b.ghost = Math.max(b.ghost, b.display);
        b.ghostDelay = 0.28;
        b.surge = nextVal;
        playSfx('hit');
        if (d) {
          triggerClassAnim(d.flash, 'hit');
          if (uiState.uiShake) triggerClassAnim(domRow, 'anim-shake');
        }
        if (uiState.uiShake) triggerClassAnim(med, 'anim-shake');
        if (domRow) {
          const rect = (domFill && domFill.getBoundingClientRect().width > 4)
            ? domFill.getBoundingClientRect()
            : domRow.getBoundingClientRect();
          spawnBarParticles(rect, b.particleHex, false);
          spawnFloatNumber(rect, Math.round(delta), b.numColor);
        }
      } else {
        b.surge = nextVal;
        b.ghost = Math.min(b.ghost, nextVal);
        playSfx('heal');
        if (d) triggerClassAnim(d.shimmer, 'sweep');
        triggerClassAnim(med, 'anim-pop');
        if (domRow) {
          const rect = domRow.getBoundingClientRect();
          spawnBarParticles(rect, b.particleHex, true);
          spawnFloatNumber(rect, Math.round(delta), '#d7f2a8');
        }
      }
    }
  }
}

let _hadParticles = false;
function step(dt) {
  if (!dt || dt <= 0) return;
  const cdt = Math.min(0.05, dt);
  let anyLow = false;

  for (const key of Object.keys(barDefs)) {
    const b = barDefs[key];
    const mainRate = b.display > b.target ? 16 : 7.5;
    b.display += (b.target - b.display) * Math.min(1, cdt * mainRate);
    if (Math.abs(b.target - b.display) < 0.08) b.display = b.target;

    if (b.ghostDelay > 0) {
      b.ghostDelay -= cdt;
    } else if (b.ghost > b.display) {
      b.ghost += (b.display - b.ghost) * Math.min(1, cdt * 3.8);
      if (b.ghost - b.display < 0.1) b.ghost = b.display;
    } else {
      b.ghost = b.display;
    }

    if (b.surge < b.display) b.surge = b.display;

    const pctFill = Math.max(0, Math.min(100, (b.display / b.max) * 100));
    const pctGhost = Math.max(0, Math.min(100, (b.ghost / b.max) * 100));
    const pctSurge = Math.max(0, Math.min(100, (b.surge / b.max) * 100));
    const isLow = (b.target / b.max) <= 0.25;
    if (isLow) anyLow = true;

    const d = barEls[key];
    if (d) {
      if (d.fill) d.fill.style.width = `${pctFill}%`;
      if (d.ghost) d.ghost.style.width = `${pctGhost}%`;
      if (d.surge) d.surge.style.width = `${pctSurge}%`;
      if (d.row) d.row.classList.toggle('low-warning', isLow);
    }
  }

  const med = document.getElementById('btn-horse-portrait');
  if (med) med.classList.toggle('low-warning-medallion', anyLow);

  if (fxCtx && fxCanvas) {
    if (particles.length > 0) {
      _hadParticles = true;
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= cdt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * cdt;
        p.x += p.vx * cdt;
        p.y += p.vy * cdt;
        fxCtx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.35));
        fxCtx.fillStyle = '#34282b';
        fxCtx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, p.size + 2, p.size + 2);
        fxCtx.fillStyle = p.color;
        fxCtx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      fxCtx.globalAlpha = 1;
    } else if (_hadParticles) {
      _hadParticles = false;
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    }
  }
}

function renderAudioControls() {
  const host = document.getElementById('vintage-audio-controls');
  if (!host) return;
  let segs = '';
  for (let i = 1; i <= 12; i++) {
    segs += `<span class="pip-slider-seg ${i <= uiState.sfxVol ? 'on' : ''}"></span>`;
  }
  const pct = Math.round((uiState.sfxVol / 12) * 100);
  host.innerHTML = `
    <div class="v-audio-row">
      <div class="v-audio-head">
        <span class="font-pixel-title">SFX VOL</span>
        <span>${pct}%</span>
      </div>
      <div class="pip-slider" id="v-sfx-slider">${segs}</div>
    </div>
    <div class="v-toggle-row">
      <span>SFX 16-BIT</span>
      <button type="button" class="pixel-toggle ${uiState.sfxEnabled ? 'on' : ''}" id="v-tgl-sfx" aria-label="Toggle SFX">
        <span class="pixel-toggle-knob"></span>
      </button>
    </div>
    <div class="v-toggle-row">
      <span>UI SHAKE</span>
      <button type="button" class="pixel-toggle ${uiState.uiShake ? 'on' : ''}" id="v-tgl-shake" aria-label="Toggle UI Shake">
        <span class="pixel-toggle-knob"></span>
      </button>
    </div>
  `;

  const slider = host.querySelector('#v-sfx-slider');
  if (slider) {
    const updateFromPointer = (clientX) => {
      const rect = slider.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const nextVal = Math.round(ratio * 12);
      if (uiState.sfxVol !== nextVal) {
        uiState.sfxVol = nextVal;
        saveUiSettings();
        renderAudioControls();
        playSfx('click');
      }
    };
    slider.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (slider.setPointerCapture) slider.setPointerCapture(ev.pointerId);
      updateFromPointer(ev.clientX);
    });
    slider.addEventListener('pointermove', (ev) => {
      if (ev.buttons === 1 || ev.pressure > 0) updateFromPointer(ev.clientX);
    });
  }
  const tglSfx = host.querySelector('#v-tgl-sfx');
  if (tglSfx) {
    tglSfx.addEventListener('click', (e) => {
      e.preventDefault();
      uiState.sfxEnabled = !uiState.sfxEnabled;
      saveUiSettings();
      renderAudioControls();
      playSfx('click');
    });
  }
  const tglShake = host.querySelector('#v-tgl-shake');
  if (tglShake) {
    tglShake.addEventListener('click', (e) => {
      e.preventDefault();
      uiState.uiShake = !uiState.uiShake;
      saveUiSettings();
      renderAudioControls();
      playSfx('click');
    });
  }
}

function setDesc(title, body) {
  const tEl = document.getElementById('desc-title');
  const bEl = document.getElementById('desc-body');
  if (tEl && title) tEl.textContent = title;
  if (bEl && body) bEl.textContent = body;
}

function init() {
  loadUiSettings();
  hydrateSvgs(document);
  cacheBarDom();
  renderAudioControls();

  fxCanvas = document.getElementById('fx-canvas');
  floatLayer = document.getElementById('float-layer');
  if (fxCanvas) {
    fxCtx = fxCanvas.getContext('2d');
    const resizeFx = () => {
      fxCanvas.width = window.innerWidth;
      fxCanvas.height = window.innerHeight;
    };
    resizeFx();
    window.addEventListener('resize', resizeFx);
  }

  // Wire Settings General / Controls tab switcher
  const tabBtns = document.querySelectorAll('[data-settings-tab]');
  const genPane = document.getElementById('settings-tab-general');
  const ctrlPane = document.getElementById('settings-tab-controls');
  tabBtns.forEach((tb) => {
    tb.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tb.getAttribute('data-settings-tab');
      tabBtns.forEach((b) => b.classList.toggle('is-active', b === tb));
      if (genPane) genPane.hidden = target !== 'general';
      if (ctrlPane) ctrlPane.hidden = target !== 'controls';
    });
  });

  // Subtle global click SFX on UI buttons
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;
    if (btn.id === 'btn-walk' || btn.id === 'btn-rev' || btn.id === 'btn-left' || btn.id === 'btn-right') return;
    playSfx('click');
  }, { passive: true });

  _initialized = true;
}

HC.VintageGUI = {
  init,
  hydrateSvgs,
  renderIcon,
  playSfx,
  updateVitals,
  step,
  setDesc,
  renderAudioControls,
};
