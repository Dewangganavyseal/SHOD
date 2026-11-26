import { HC } from './hc.js';

// ============================================================
//  SHOD PROCEDURAL WEB AUDIO SFX & LOCOMOTION ENGINE (HC.SFX)
//  - Zero external audio files (100% offline/bundle-safe)
//  - Syncs live with HC.VintageGUI volume & mute settings
//  - Surface-aware horse hooves (grass/road/rock/water)
//  - Continuous wooden cart rolling rumble + axle creaks + jolts
//  - Crisp SFX for every player, survival, cart, village, UI & combat action
// ============================================================
(function () {
  let _ctx = null;
  let _masterGain = null;
  let _comp = null;
  let _noiseBuf = null;
  let _unlocked = false;

  // Continuous cart rolling loop nodes
  let _cartNodes = null;

  // Movement tracker state
  const _mv = {
    prevPhase: 0,
    prevJumpActive: false,
    prevRunState: false,
    prevSpillCount: 0,
    creakCooldown: 0.6,
    rattleCooldown: 0.25,
    bumpCooldown: 0,
    lastSpeed: 0,
    lastCartSpeed: 0,
    stepSide: 0,
    pivotTimer: 0,
  };

  // Cooldown map for bursty events (cargo spill, combat, etc.)
  const _lastPlayAt = Object.create(null);

  function getSettings() {
    if (HC.VintageGUI && typeof HC.VintageGUI.getAudioSettings === 'function') {
      return HC.VintageGUI.getAudioSettings();
    }
    return { sfxEnabled: true, sfxVol: 8 };
  }

  function masterLevel() {
    const s = getSettings();
    if (!s || !s.sfxEnabled || !(s.sfxVol > 0)) return 0;
    return Math.min(1.0, Math.max(0.0, s.sfxVol / 12));
  }

  function ensureContext() {
    if (typeof window === 'undefined') return null;
    try {
      if (!_ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        _ctx = new AC();
        _comp = _ctx.createDynamicsCompressor();
        _comp.threshold.value = -16;
        _comp.knee.value = 18;
        _comp.ratio.value = 6;
        _comp.attack.value = 0.004;
        _comp.release.value = 0.14;

        _masterGain = _ctx.createGain();
        _masterGain.gain.value = masterLevel() * 0.72;
        _masterGain.connect(_comp);
        _comp.connect(_ctx.destination);
      }
      if (_ctx.state === 'suspended') {
        const p = _ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      if (_ctx.state === 'running') _unlocked = true;
      if (_masterGain) {
        _masterGain.gain.setTargetAtTime(masterLevel() * 0.72, _ctx.currentTime, 0.03);
      }
      return _ctx;
    } catch (_e) {
      return null;
    }
  }

  function ensureNoiseBuffer(ctx) {
    if (_noiseBuf && _noiseBuf.sampleRate === ctx.sampleRate) return _noiseBuf;
    const len = Math.floor(ctx.sampleRate * 2.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      // Blend crisp white + warm pink noise
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2) * 0.9 + white * 0.42));
    }
    _noiseBuf = buf;
    return buf;
  }

  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') {
        p.then(() => { _unlocked = true; }).catch(() => {});
      }
    } else if (ctx.state === 'running') {
      _unlocked = true;
    }
    return true;
  }

  if (typeof window !== 'undefined') {
    const onFirstGesture = () => {
      unlock();
      if (_unlocked) {
        window.removeEventListener('pointerdown', onFirstGesture, true);
        window.removeEventListener('keydown', onFirstGesture, true);
        window.removeEventListener('touchstart', onFirstGesture, true);
      }
    };
    window.addEventListener('pointerdown', onFirstGesture, true);
    window.addEventListener('keydown', onFirstGesture, true);
    window.addEventListener('touchstart', onFirstGesture, true);
    window.addEventListener('blur', () => stopLoops());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopLoops();
      });
    }
  }

  // ---- Low-level synthesis primitives ----
  function tone(ctx, freq, dur, wave = 'sine', offset = 0, endFreq = null, gainAmt = 0.18, attack = 0.004) {
    const t0 = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (endFreq !== null && endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + Math.max(0.01, dur));
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gainAmt), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
    osc.connect(g);
    g.connect(_masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(ctx, dur, filterType = 'bandpass', freq = 900, q = 1.2, gainAmt = 0.16, offset = 0, endFreq = null) {
    const t0 = ctx.currentTime + offset;
    const src = ctx.createBufferSource();
    src.buffer = ensureNoiseBuffer(ctx);
    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(Math.max(40, freq), t0);
    if (endFreq !== null && endFreq > 0) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + Math.max(0.01, dur));
    }
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gainAmt), t0 + Math.min(0.008, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.015, dur));
    src.connect(flt);
    flt.connect(g);
    g.connect(_masterGain);
    const startOff = Math.random() * 1.4;
    src.start(t0, startOff, dur + 0.04);
  }

  function canThrottle(key, minGapSec) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    const prev = _lastPlayAt[key] || 0;
    if (now - prev < minGapSec) return false;
    _lastPlayAt[key] = now;
    return true;
  }

  // ---- Surface detection for footsteps & cart wheels ----
  function detectSurface(world, x, z) {
    if (!world) return 'grass';
    try {
      if (typeof world.waterDepthAt === 'function' && world.waterDepthAt(x, z) > 0.04) {
        return 'water';
      }
      const roadFn = world.getRoadDistance || world._getRoadDistance;
      if (typeof roadFn === 'function' && roadFn(x, z) < 2.65) {
        return 'road';
      }
      const elev = typeof world.terrainHeightAt === 'function' ? world.terrainHeightAt(x, z) : 0;
      let slope = 0;
      if (typeof world.normalAt === 'function') {
        const n = world.normalAt(x, z);
        if (n && Number.isFinite(n.y)) slope = 1 - Math.abs(n.y);
      }
      if (elev > 5.8 || slope > 0.16) return 'rock';
    } catch (_e) { /* fallback grass */ }
    return 'grass';
  }

  // ---- Discrete Action SFX ----
  function play(type = 'click', opts = {}) {
    if (masterLevel() <= 0) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running') return;

    const jit = 0.93 + Math.random() * 0.14;
    const intensity = opts.intensity !== undefined ? Math.max(0.15, Math.min(1.6, opts.intensity)) : 1.0;

    switch (type) {
      // ---- Horse Movement & Hoofbeats ----
      case 'hoof': {
        const surface = opts.surface || 'grass';
        const isRun = !!opts.run;
        const g = (isRun ? 0.22 : 0.14) * intensity;
        if (surface === 'water') {
          noiseBurst(ctx, isRun ? 0.14 : 0.11, 'bandpass', 1250 * jit, 0.9, g * 1.15, 0, 520 * jit);
          tone(ctx, 195 * jit, 0.07, 'sine', 0.006, 92 * jit, g * 0.55, 0.005);
        } else if (surface === 'rock') {
          // Crisp horseshoe clink + stone knock
          tone(ctx, 1520 * jit, 0.045, 'triangle', 0, 920 * jit, g * 0.55, 0.002);
          tone(ctx, 210 * jit, 0.055, 'triangle', 0, 82 * jit, g * 0.80, 0.002);
          noiseBurst(ctx, 0.04, 'highpass', 1700 * jit, 1.5, g * 0.60);
        } else if (surface === 'road') {
          // Crisp country dirt road clop
          tone(ctx, 155 * jit, 0.06, 'triangle', 0, 68 * jit, g * 0.95, 0.002);
          noiseBurst(ctx, 0.055, 'bandpass', 640 * jit, 1.7, g * 0.95, 0, 340 * jit);
        } else {
          // Grass meadow: soft earthy thud + grass brush
          tone(ctx, 118 * jit, 0.065, 'sine', 0, 54 * jit, g * 0.85, 0.003);
          noiseBurst(ctx, 0.065, 'bandpass', 1850 * jit, 1.0, g * 0.45, 0.005, 900 * jit);
        }
        break;
      }

      case 'jump': {
        // Energetic double-hoof push-off + airy leap whoosh + soft horse huff
        tone(ctx, 130 * jit, 0.09, 'triangle', 0, 64, 0.18, 0.003);
        tone(ctx, 165 * jit, 0.12, 'sine', 0.03, 310 * jit, 0.12, 0.01);
        noiseBurst(ctx, 0.18, 'bandpass', 520, 0.9, 0.16, 0.01, 1450);
        break;
      }

      case 'land': {
        const surface = opts.surface || 'grass';
        if (surface === 'water') {
          noiseBurst(ctx, 0.28, 'bandpass', 980 * jit, 0.7, 0.30, 0, 320);
          tone(ctx, 160, 0.12, 'sine', 0.01, 62, 0.18, 0.004);
        } else {
          tone(ctx, 110 * jit, 0.11, 'triangle', 0, 44, 0.26 * intensity, 0.002);
          tone(ctx, 94 * jit, 0.10, 'sine', 0.045, 40, 0.20 * intensity, 0.003);
          noiseBurst(ctx, 0.11, 'lowpass', surface === 'rock' ? 1400 : 680, 1.0, 0.20 * intensity, 0);
        }
        break;
      }

      case 'sprint_on': {
        // Rein snap + brisk horse snort
        noiseBurst(ctx, 0.09, 'bandpass', 1450 * jit, 1.2, 0.15, 0, 720);
        tone(ctx, 290, 0.08, 'triangle', 0.02, 420, 0.11, 0.005);
        break;
      }

      case 'sprint_off': {
        noiseBurst(ctx, 0.08, 'bandpass', 780, 1.1, 0.10, 0, 420);
        tone(ctx, 320, 0.08, 'sine', 0, 210, 0.08, 0.005);
        break;
      }

      // ---- Cart / Wagon Discrete SFX ----
      case 'cart_creak': {
        if (!canThrottle('cart_creak', 0.45)) return;
        const baseF = (370 + Math.random() * 190);
        tone(ctx, baseF, 0.16, 'triangle', 0, baseF * (Math.random() > 0.5 ? 1.18 : 0.84), 0.065 * intensity, 0.02);
        noiseBurst(ctx, 0.13, 'bandpass', baseF * 1.8, 3.2, 0.04 * intensity, 0.01, baseF * 1.3);
        break;
      }

      case 'cart_bump': {
        if (!canThrottle('cart_bump', 0.14)) return;
        // Heavy wooden chassis knock + plank rattle
        tone(ctx, 138 * jit, 0.09, 'triangle', 0, 56, 0.24 * intensity, 0.002);
        noiseBurst(ctx, 0.10, 'bandpass', 420 * jit, 1.4, 0.20 * intensity, 0.01, 210);
        tone(ctx, 295 * jit, 0.05, 'square', 0.03, 180, 0.06 * intensity, 0.003);
        break;
      }

      case 'cargo_spill': {
        if (!canThrottle('cargo_spill', 0.09)) return;
        tone(ctx, 210 * jit, 0.08, 'triangle', 0, 95 * jit, 0.20 * intensity, 0.002);
        tone(ctx, 340 * jit, 0.06, 'sine', 0.045, 165 * jit, 0.14 * intensity, 0.002);
        noiseBurst(ctx, 0.12, 'bandpass', 720 * jit, 1.2, 0.18 * intensity, 0.01, 320);
        break;
      }

      case 'wheel_detach': {
        if (!canThrottle('wheel_detach', 0.20)) return;
        // Wood snap + iron axle clank + spinning bounce
        noiseBurst(ctx, 0.16, 'bandpass', 1100, 1.1, 0.30, 0, 340);
        tone(ctx, 240, 0.14, 'sawtooth', 0, 74, 0.22, 0.002);
        tone(ctx, 760, 0.12, 'triangle', 0.03, 420, 0.16, 0.002);
        tone(ctx, 145, 0.12, 'triangle', 0.14, 70, 0.16, 0.004);
        break;
      }

      case 'cart_flip': {
        // Dramatic wagon crash + wooden splinter + cargo scatter
        tone(ctx, 125, 0.28, 'sawtooth', 0, 38, 0.30, 0.003);
        noiseBurst(ctx, 0.34, 'lowpass', 950, 0.9, 0.32, 0, 180);
        tone(ctx, 290, 0.12, 'square', 0.06, 110, 0.14, 0.003);
        noiseBurst(ctx, 0.22, 'bandpass', 620, 1.3, 0.22, 0.10, 260);
        break;
      }

      case 'hitch': {
        // Iron pin lock + taut leather/rope pull + wood shaft settle
        tone(ctx, 640, 0.07, 'triangle', 0, 880, 0.16, 0.002);
        tone(ctx, 190, 0.10, 'triangle', 0.04, 110, 0.18, 0.003);
        noiseBurst(ctx, 0.12, 'bandpass', 1200, 1.6, 0.14, 0.02, 650);
        tone(ctx, 520, 0.11, 'sine', 0.10, 680, 0.14, 0.004);
        break;
      }

      case 'unhitch': {
        // Pin release clink + shafts dropping gently
        tone(ctx, 740, 0.06, 'triangle', 0, 440, 0.15, 0.002);
        noiseBurst(ctx, 0.10, 'bandpass', 850, 1.5, 0.12, 0.02, 420);
        tone(ctx, 165, 0.11, 'sine', 0.08, 72, 0.18, 0.003);
        break;
      }

      case 'docking': {
        tone(ctx, 420, 0.06, 'triangle', 0, 520, 0.12, 0.003);
        tone(ctx, 520, 0.08, 'triangle', 0.07, 620, 0.12, 0.003);
        break;
      }

      // ---- Flip Minigame ----
      case 'flip_start': {
        tone(ctx, 220, 0.12, 'triangle', 0, 310, 0.15, 0.005);
        noiseBurst(ctx, 0.14, 'bandpass', 480, 1.2, 0.14, 0.02, 320);
        break;
      }
      case 'flip_good': {
        tone(ctx, 392, 0.08, 'triangle', 0, 523, 0.16, 0.003);
        noiseBurst(ctx, 0.08, 'bandpass', 520, 1.4, 0.12, 0);
        break;
      }
      case 'flip_perfect': {
        tone(ctx, 523, 0.07, 'triangle', 0, 659, 0.17, 0.002);
        tone(ctx, 784, 0.13, 'sine', 0.06, 987, 0.18, 0.003);
        break;
      }
      case 'flip_miss': {
        tone(ctx, 180, 0.12, 'sawtooth', 0, 95, 0.16, 0.003);
        noiseBurst(ctx, 0.10, 'lowpass', 500, 1.0, 0.14, 0);
        break;
      }
      case 'flip_done': {
        tone(ctx, 120, 0.14, 'triangle', 0, 54, 0.24, 0.002);
        tone(ctx, 523, 0.08, 'triangle', 0.06);
        tone(ctx, 659, 0.08, 'triangle', 0.13);
        tone(ctx, 784, 0.18, 'sine', 0.20, 1046, 0.18);
        break;
      }

      // ---- Survival Actions ----
      case 'eat': {
        // 3 rhythmic crisp chomps
        for (let i = 0; i < 3; i++) {
          const off = i * 0.13;
          noiseBurst(ctx, 0.075, 'bandpass', (1350 + i * 140) * jit, 1.3, 0.18, off, 620);
          tone(ctx, 210 * jit, 0.055, 'triangle', off, 115, 0.11, 0.003);
        }
        break;
      }

      case 'drink': {
        // 3 refreshing water gulps
        for (let i = 0; i < 3; i++) {
          const off = i * 0.14;
          tone(ctx, (270 + i * 35) * jit, 0.09, 'sine', off, (480 + i * 40) * jit, 0.14, 0.008);
          noiseBurst(ctx, 0.08, 'bandpass', 1100 * jit, 1.1, 0.10, off + 0.01, 600);
        }
        break;
      }

      case 'sleep_on': {
        tone(ctx, 440, 0.14, 'sine', 0, 349, 0.13, 0.01);
        tone(ctx, 349, 0.22, 'sine', 0.12, 261, 0.12, 0.01);
        break;
      }

      case 'sleep_off': {
        tone(ctx, 330, 0.10, 'sine', 0, 440, 0.12, 0.008);
        tone(ctx, 440, 0.15, 'triangle', 0.09, 587, 0.13, 0.008);
        break;
      }

      // ---- Workshop, Upgrades, Quests, NPCs & Dialogue ----
      case 'workshop_open': {
        // Warm blacksmith bell + wooden door creak
        tone(ctx, 660, 0.10, 'triangle', 0, 880, 0.14, 0.003);
        tone(ctx, 990, 0.16, 'sine', 0.07, 1320, 0.11, 0.004);
        break;
      }

      case 'workshop_close': {
        tone(ctx, 520, 0.09, 'triangle', 0, 340, 0.12, 0.003);
        break;
      }

      case 'upgrade': {
        // Anvil hammer clang + celebratory upgrade chime
        tone(ctx, 880, 0.08, 'triangle', 0, 620, 0.18, 0.002);
        noiseBurst(ctx, 0.07, 'highpass', 2200, 1.4, 0.14, 0);
        tone(ctx, 523, 0.07, 'square', 0.09, null, 0.11);
        tone(ctx, 659, 0.07, 'square', 0.15, null, 0.11);
        tone(ctx, 784, 0.09, 'square', 0.21, null, 0.12);
        tone(ctx, 1046, 0.18, 'triangle', 0.27, null, 0.16);
        break;
      }

      case 'equip': {
        tone(ctx, 360, 0.06, 'triangle', 0, 540, 0.15, 0.002);
        tone(ctx, 580, 0.09, 'sine', 0.05, 720, 0.14, 0.003);
        break;
      }

      case 'refill': {
        // Crates loading + water barrel splash
        tone(ctx, 240, 0.07, 'triangle', 0, 140, 0.16, 0.003);
        noiseBurst(ctx, 0.09, 'bandpass', 950, 1.0, 0.14, 0.06, 520);
        tone(ctx, 587, 0.10, 'triangle', 0.11, 784, 0.14, 0.004);
        break;
      }

      case 'quest_accept': {
        noiseBurst(ctx, 0.09, 'bandpass', 2100, 1.0, 0.10, 0, 1200);
        tone(ctx, 440, 0.08, 'triangle', 0.03, null, 0.15);
        tone(ctx, 554, 0.08, 'triangle', 0.11, null, 0.15);
        tone(ctx, 659, 0.16, 'triangle', 0.19, null, 0.17);
        break;
      }

      case 'quest_complete': {
        // Coin jingle + victory fanfare
        tone(ctx, 1318, 0.06, 'sine', 0, 1567, 0.14, 0.002);
        tone(ctx, 1567, 0.08, 'sine', 0.06, 2093, 0.14, 0.002);
        tone(ctx, 523, 0.09, 'triangle', 0.10, null, 0.16);
        tone(ctx, 659, 0.09, 'triangle', 0.18, null, 0.16);
        tone(ctx, 784, 0.09, 'triangle', 0.26, null, 0.16);
        tone(ctx, 1046, 0.26, 'triangle', 0.34, null, 0.20);
        break;
      }

      case 'recruit': {
        // Cheerful whistle + warm chime
        tone(ctx, 620, 0.09, 'sine', 0, 920, 0.15, 0.005);
        tone(ctx, 920, 0.12, 'sine', 0.09, 780, 0.13, 0.005);
        tone(ctx, 523, 0.10, 'triangle', 0.15, 659, 0.12, 0.004);
        break;
      }

      case 'release': {
        tone(ctx, 587, 0.09, 'sine', 0, 440, 0.13, 0.005);
        tone(ctx, 440, 0.13, 'triangle', 0.08, 330, 0.12, 0.005);
        break;
      }

      case 'dialogue_blip': {
        tone(ctx, (520 + Math.random() * 140), 0.045, 'triangle', 0, 660, 0.11, 0.002);
        break;
      }

      case 'map_open': {
        noiseBurst(ctx, 0.11, 'bandpass', 2400, 0.9, 0.14, 0, 1100);
        tone(ctx, 480, 0.06, 'sine', 0.02, 620, 0.08, 0.003);
        break;
      }

      case 'map_close': {
        noiseBurst(ctx, 0.09, 'bandpass', 1800, 1.0, 0.12, 0, 900);
        tone(ctx, 440, 0.06, 'sine', 0.01, 320, 0.08, 0.003);
        break;
      }

      case 'inspect_on': {
        tone(ctx, 360, 0.08, 'sine', 0, 560, 0.11, 0.004);
        break;
      }

      case 'inspect_off': {
        tone(ctx, 520, 0.08, 'sine', 0, 340, 0.10, 0.004);
        break;
      }

      case 'panel_open': {
        tone(ctx, 420, 0.05, 'triangle', 0, 560, 0.11, 0.002);
        break;
      }

      case 'panel_close': {
        tone(ctx, 480, 0.05, 'triangle', 0, 330, 0.10, 0.002);
        break;
      }

      case 'menu_start': {
        tone(ctx, 392, 0.09, 'triangle', 0, null, 0.15);
        tone(ctx, 523, 0.09, 'triangle', 0.08, null, 0.16);
        tone(ctx, 659, 0.18, 'triangle', 0.16, null, 0.18);
        break;
      }

      case 'deny': {
        tone(ctx, 195, 0.08, 'square', 0, 155, 0.12, 0.003);
        tone(ctx, 155, 0.11, 'square', 0.09, 120, 0.11, 0.003);
        break;
      }

      case 'heal': {
        tone(ctx, 440, 0.08, 'triangle', 0, 520, 0.13);
        tone(ctx, 587, 0.10, 'triangle', 0.06, 660, 0.14);
        tone(ctx, 880, 0.15, 'sine', 0.12, null, 0.15);
        break;
      }

      case 'confirm': {
        tone(ctx, 523, 0.07, 'square', 0, null, 0.10);
        tone(ctx, 659, 0.07, 'square', 0.06, null, 0.10);
        tone(ctx, 784, 0.10, 'square', 0.12, null, 0.11);
        tone(ctx, 1046, 0.16, 'triangle', 0.18, null, 0.15);
        break;
      }

      // ---- Combat & Ambush SFX ----
      case 'hit': {
        if (!canThrottle('hit', 0.05)) return;
        tone(ctx, 175 * jit, 0.10, 'sawtooth', 0, 68, 0.18 * intensity, 0.002);
        noiseBurst(ctx, 0.07, 'bandpass', 720 * jit, 1.2, 0.16 * intensity, 0);
        break;
      }

      case 'crit': {
        if (!canThrottle('crit', 0.06)) return;
        tone(ctx, 260 * jit, 0.13, 'sawtooth', 0, 82, 0.24 * intensity, 0.002);
        tone(ctx, 520 * jit, 0.08, 'triangle', 0.01, 220, 0.16 * intensity, 0.002);
        noiseBurst(ctx, 0.10, 'bandpass', 1200 * jit, 1.0, 0.20 * intensity, 0);
        break;
      }

      case 'parry': {
        if (!canThrottle('parry', 0.05)) return;
        tone(ctx, 920 * jit, 0.06, 'sine', 0, 1480 * jit, 0.16, 0.002);
        tone(ctx, 1480 * jit, 0.14, 'triangle', 0.03, 1180 * jit, 0.13, 0.002);
        break;
      }

      case 'dodge': {
        if (!canThrottle('dodge', 0.06)) return;
        noiseBurst(ctx, 0.10, 'bandpass', 950 * jit, 0.9, 0.14, 0, 1800);
        tone(ctx, 340 * jit, 0.08, 'sine', 0, 620 * jit, 0.10, 0.004);
        break;
      }

      case 'bow': {
        if (!canThrottle('bow', 0.05)) return;
        tone(ctx, 560 * jit, 0.08, 'triangle', 0, 185 * jit, 0.14, 0.002);
        noiseBurst(ctx, 0.07, 'highpass', 1600, 1.0, 0.10, 0.01);
        break;
      }

      case 'ram': {
        tone(ctx, 140, 0.16, 'sawtooth', 0, 48, 0.26, 0.002);
        noiseBurst(ctx, 0.16, 'lowpass', 780, 1.0, 0.24, 0);
        break;
      }

      case 'ambush': {
        // Warning horn / tense low brass chord
        tone(ctx, 185, 0.28, 'sawtooth', 0, 175, 0.15, 0.02);
        tone(ctx, 277, 0.28, 'triangle', 0.04, 262, 0.14, 0.02);
        tone(ctx, 146, 0.34, 'sawtooth', 0.22, 130, 0.16, 0.02);
        break;
      }

      case 'click':
      default: {
        tone(ctx, 540 * jit, 0.038, 'square', 0, 640 * jit, 0.085, 0.002);
        break;
      }
    }
  }

  // ---- Continuous Cart Rolling Loop ----
  function ensureCartLoop(ctx) {
    if (_cartNodes && _cartNodes.ctx === ctx) return _cartNodes;
    try {
      const buf = ensureNoiseBuffer(ctx);

      // Layer 1: Low-mid wooden wagon rumble
      const rumbleSrc = ctx.createBufferSource();
      rumbleSrc.buffer = buf;
      rumbleSrc.loop = true;
      const rumbleFlt = ctx.createBiquadFilter();
      rumbleFlt.type = 'bandpass';
      rumbleFlt.frequency.value = 140;
      rumbleFlt.Q.value = 1.4;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.0001;
      rumbleSrc.connect(rumbleFlt);
      rumbleFlt.connect(rumbleGain);
      rumbleGain.connect(_masterGain);
      rumbleSrc.start();

      // Layer 2: Wheel tire / gravel / water slosh texture
      const gravelSrc = ctx.createBufferSource();
      gravelSrc.buffer = buf;
      gravelSrc.loop = true;
      const gravelFlt = ctx.createBiquadFilter();
      gravelFlt.type = 'bandpass';
      gravelFlt.frequency.value = 820;
      gravelFlt.Q.value = 1.1;
      const gravelGain = ctx.createGain();
      gravelGain.gain.value = 0.0001;
      gravelSrc.connect(gravelFlt);
      gravelFlt.connect(gravelGain);
      gravelGain.connect(_masterGain);
      gravelSrc.start(0, 0.65);

      // Layer 3: Subtle rhythmic spoke-turn modulation (LFO -> rumble gain)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 3.0;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.0;
      lfo.connect(lfoDepth);
      lfoDepth.connect(rumbleGain.gain);
      lfo.start();

      _cartNodes = {
        ctx,
        rumbleSrc, rumbleFlt, rumbleGain,
        gravelSrc, gravelFlt, gravelGain,
        lfo, lfoDepth,
      };
      return _cartNodes;
    } catch (_e) {
      return null;
    }
  }

  function stopLoops() {
    if (_cartNodes && _cartNodes.ctx) {
      const now = _cartNodes.ctx.currentTime;
      _cartNodes.rumbleGain.gain.setTargetAtTime(0.0001, now, 0.05);
      _cartNodes.gravelGain.gain.setTargetAtTime(0.0001, now, 0.05);
      _cartNodes.lfoDepth.gain.setTargetAtTime(0.0, now, 0.05);
    }
  }

  // ---- Per-frame Movement & Cart Physics Audio Driver ----
  function updateMovement(dt, state) {
    if (!state) return;
    const lvl = masterLevel();
    if (lvl <= 0 || !state.active) {
      stopLoops();
      return;
    }
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running') return;

    const { animator, physics, world, hasCart } = state;
    if (!animator) return;

    const speed = Math.abs(animator.speed || 0);
    const isRun = (animator.runBlend || 0) > 0.45 || animator.state === 'run';
    const jumpActive = !!animator.jumpActive;
    const surface = detectSurface(world, animator.x, animator.z);

    // 1. Horse landing thud
    if (_mv.prevJumpActive && !jumpActive) {
      play('land', { surface, intensity: Math.min(1.4, 0.85 + speed * 0.08) });
    }
    _mv.prevJumpActive = jumpActive;

    // 2. Horse hoofbeats synchronized with 4-beat gait phase
    const phase = ((animator.phase || 0) % 1 + 1) % 1;
    const prevP = _mv.prevPhase;
    const beats = isRun ? [0.0, 0.14, 0.52, 0.66] : [0.0, 0.25, 0.50, 0.75];

    if (!jumpActive && animator.state !== 'sleep' && animator.state !== 'graze') {
      if (speed > 0.16) {
        const dirFwd = (animator.speed || 0) >= 0;
        for (let i = 0; i < beats.length; i++) {
          const b = beats[i];
          let crossed = false;
          if (dirFwd) {
            crossed = (prevP <= phase) ? (prevP < b && phase >= b) : (prevP < b || phase >= b);
          } else {
            crossed = (prevP >= phase) ? (prevP > b && phase <= b) : (prevP > b || phase <= b);
          }
          if (crossed) {
            const paceScale = Math.min(1.25, 0.55 + speed * 0.15);
            play('hoof', { surface, run: isRun, intensity: paceScale });
            break;
          }
        }
        _mv.pivotTimer = 0;
      } else if (animator.unhitched && Math.abs(animator.yawRate || 0) > 0.22) {
        // Subtle shuffle steps when turning horse in place
        _mv.pivotTimer += dt;
        if (_mv.pivotTimer >= 0.34) {
          _mv.pivotTimer = 0;
          play('hoof', { surface, run: false, intensity: 0.48 });
        }
      }
    }
    _mv.prevPhase = phase;
    _mv.lastSpeed = speed;

    // 3. Continuous Cart Rolling Rumble, Gravel/Water Tire & Axle Creaks
    const nodes = ensureCartLoop(ctx);
    const now = ctx.currentTime;
    const cartMoving = !!(hasCart && physics && !physics.flipped);
    const cartSpeed = cartMoving ? Math.hypot(physics.vel.x || 0, physics.vel.z || 0) : 0;

    if (nodes) {
      if (cartMoving && cartSpeed > 0.12) {
        const cartSurf = detectSurface(world, physics.pos.x, physics.pos.z);
        const normSpd = Math.min(1.0, cartSpeed / 5.2);
        const rumbleVol = (0.045 + normSpd * 0.16);
        const gravelVol = (cartSurf === 'water' ? 0.08 + normSpd * 0.22 : (0.025 + normSpd * 0.11));

        const rumbleFreq = 105 + normSpd * 135;
        const gravelFreq = cartSurf === 'water'
          ? (540 + normSpd * 520)
          : (cartSurf === 'rock' ? (1050 + normSpd * 750) : (cartSurf === 'road' ? (760 + normSpd * 480) : (520 + normSpd * 340)));

        nodes.rumbleFlt.frequency.setTargetAtTime(rumbleFreq, now, 0.06);
        nodes.rumbleGain.gain.setTargetAtTime(rumbleVol, now, 0.07);
        nodes.gravelFlt.frequency.setTargetAtTime(gravelFreq, now, 0.06);
        nodes.gravelGain.gain.setTargetAtTime(gravelVol, now, 0.07);

        // Rhythmic wooden wheel revolution wobble
        nodes.lfo.frequency.setTargetAtTime(1.8 + cartSpeed * 1.35, now, 0.08);
        nodes.lfoDepth.gain.setTargetAtTime(rumbleVol * 0.28, now, 0.08);

        // Periodic wooden axle squeak / creak when turning or climbing/rolling
        _mv.creakCooldown -= dt;
        const turnStress = Math.abs(physics.angVel || 0) * 1.4 + Math.abs(physics.roll || 0) * 2.2;
        if (_mv.creakCooldown <= 0 && (turnStress > 0.26 || Math.random() < 0.018)) {
          play('cart_creak', { intensity: Math.min(1.3, 0.55 + normSpd * 0.5 + turnStress * 0.4) });
          _mv.creakCooldown = Math.max(0.85, 2.3 - normSpd * 0.9 - turnStress * 0.5 + Math.random() * 1.2);
        }

        // Chassis bump / obstacle thud / suspension jolt
        _mv.bumpCooldown = Math.max(0, _mv.bumpCooldown - dt);
        const rollVel = Math.abs(physics.rollVel || 0);
        const pitchVel = Math.abs(physics.pitchVel || 0);
        const envHit = !!(physics._envHit && physics._envHit.hit);
        if (_mv.bumpCooldown <= 0 && (envHit || rollVel > 1.35 || pitchVel > 1.25)) {
          const hitInt = envHit ? Math.min(1.4, 0.75 + cartSpeed * 0.2) : Math.min(1.15, (rollVel + pitchVel) * 0.32);
          play('cart_bump', { intensity: hitInt });
          _mv.bumpCooldown = envHit ? 0.28 : 0.36;
        }
      } else {
        nodes.rumbleGain.gain.setTargetAtTime(0.0001, now, 0.07);
        nodes.gravelGain.gain.setTargetAtTime(0.0001, now, 0.07);
        nodes.lfoDepth.gain.setTargetAtTime(0.0, now, 0.06);
      }
    }
    _mv.lastCartSpeed = cartSpeed;
  }

  HC.SFX = {
    unlock,
    play,
    updateMovement,
    stopLoops,
    detectSurface,
    getSettings,
    isUnlocked: () => _unlocked,
  };
})();
