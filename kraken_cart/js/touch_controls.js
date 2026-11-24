/* ============================================================================
   KONTROLER SENTUH — analog + tombol aksi (mobile/landscape)
   - Analog kiri: gas + kemudi. Besar dorongan = besar gas. Lepas = kuda berhenti,
     walaupun toggle LARI masih nyala (sesuai permintaan).
   - Tombol kanan: LARI (toggle), LOMPAT, MAKAN, MINUM.
   - Portrait: overlay "putar HP" + tombol layar penuh yang mencoba kunci landscape.
   Komponen ini cuma menyentuh DOM & memanggil API animator/survival yang diberi.
   ========================================================================= */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const tr = (k, fb) => (typeof globalThis !== 'undefined' && globalThis.HC && typeof globalThis.HC.t === 'function' ? globalThis.HC.t(k) : fb);

export function initTouchControls({ animator, survival, onJump, onEat, onInteract, onSleep, onRunToggle, onHitch, onInspect, isTouchDevice }) {
  const touch = isTouchDevice || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('is-touch', !!touch);

  // ---------- overlay portrait / layar penuh ----------
  const rotate = document.createElement('div');
  rotate.id = 'rotate-hint';
  rotate.innerHTML =
    '<div class="rh-card ornate-panel">' +
      '<span class="js-corner" data-pos="tl"></span>' +
      '<span class="js-corner" data-pos="tr"></span>' +
      '<span class="js-corner" data-pos="bl"></span>' +
      '<span class="js-corner" data-pos="br"></span>' +
      '<div class="ornate-panel-inner">' +
        '<div class="rh-icon">📱↻</div>' +
        `<div class="rh-title" id="rh-title">${tr('touch_rotate_title', 'Rotate Phone to LANDSCAPE')}</div>` +
        `<div class="rh-sub" id="rh-sub">${tr('touch_rotate_sub', 'Analog stick on the left, action buttons on the right.')}</div>` +
        `<button id="btn-fullscreen" type="button" class="vintage-pill-btn">${tr('touch_fullscreen', 'Fullscreen + Lock')}</button>` +
      '</div>' +
    '</div>';
  document.body.appendChild(rotate);
  if (typeof globalThis !== 'undefined' && globalThis.HC && globalThis.HC.VintageGUI && globalThis.HC.VintageGUI.hydrateSvgs) {
    globalThis.HC.VintageGUI.hydrateSvgs(rotate);
  }

  async function goFullscreenLandscape() {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* iOS Safari: tidak ada fullscreen API di iPhone */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (e) { /* butuh fullscreen + dukungan browser; kalau gagal tetap tampil */ }
  }
  rotate.querySelector('#btn-fullscreen').addEventListener('click', goFullscreenLandscape);

  const mqPortrait = matchMedia('(orientation: portrait)');
  const updateOrientation = () => {
    const portrait = mqPortrait.matches || window.innerHeight > window.innerWidth;
    rotate.classList.toggle('show', portrait && !!touch);
    document.body.classList.toggle('portrait', portrait);
  };
  window.addEventListener('resize', updateOrientation);
  if (mqPortrait.addEventListener) mqPortrait.addEventListener('change', updateOrientation);
  window.addEventListener('orientationchange', () => setTimeout(updateOrientation, 120));
  // Beberapa browser HP telat menembakkan resize saat rotasi -> cadangan murah.
  setInterval(updateOrientation, 700);
  updateOrientation();

  if (!touch) return { active: false, joystick: null };

  // ---------- joystick analog (kiri bawah, floating glass dengan panah arah) ----------
  const stick = document.createElement('div');
  stick.id = 'stick';
  stick.innerHTML =
    '<span class="st-dir n" aria-hidden="true">▲</span>' +
    '<span class="st-dir s" aria-hidden="true">▼</span>' +
    '<span class="st-dir w" aria-hidden="true">◀</span>' +
    '<span class="st-dir e" aria-hidden="true">▶</span>' +
    '<div id="stick-knob"></div>';
  document.body.appendChild(stick);
  const knob = stick.querySelector('#stick-knob');

  const pad = { active: false, id: null, cx: 0, cy: 0, r: 62 };
  const vec = { x: 0, y: 0 };

  function stickStart(e) {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const r = stick.getBoundingClientRect();
    pad.cx = r.left + r.width / 2;
    pad.cy = r.top + r.height / 2;
    pad.r = Math.max(48, r.width * 0.42);
    pad.active = true;
    pad.id = t.identifier != null ? t.identifier : 'mouse';
    stick.classList.add('held');
    stickMove(e);
  }
  function stickMove(e) {
    if (!pad.active) return;
    let t = e;
    if (e.changedTouches) {
      t = null;
      for (const c of e.changedTouches) if ((c.identifier) === pad.id) t = c;
      if (!t) return;
    }
    let dx = (t.clientX - pad.cx) / pad.r;
    let dy = (t.clientY - pad.cy) / pad.r;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    vec.x = dx; vec.y = dy;
    knob.style.transform = `translate(${dx * pad.r * 0.72}px, ${dy * pad.r * 0.72}px)`;
    applyStick();
  }
  function stickEnd(e) {
    if (!pad.active) return;
    pad.active = false; pad.id = null;
    vec.x = 0; vec.y = 0;
    knob.style.transform = 'translate(0px, 0px)';
    stick.classList.remove('held');
    applyStick();
  }
  function applyStick() {
    // gas: dorong ke atas (maju) / tarik ke bawah (mundur). Saat bebas (unhitched)
    // dorong samping memutar kuda perlahan di tempat tanpa harus jalan maju.
    const m = Math.hypot(vec.x, vec.y);
    let thr = 0;
    if (m >= 0.12) {
      if (vec.y > 0.20) {
        thr = clamp(-vec.y * 1.25, -1, 0);
      } else if (Math.abs(vec.y) <= 0.20 && Math.abs(vec.x) > 0.25) {
        thr = animator.unhitched ? 0 : 0.38;
      } else {
        thr = clamp(-vec.y * 1.25 + (Math.abs(vec.x) > 0.55 ? 0.38 : 0), 0, 1);
      }
      if (Math.abs(thr) > 0 && Math.abs(thr) < 0.16) thr = Math.sign(thr) * 0.16;
    }
    animator.setThrottle(thr);
    animator.setSteer(m < 0.12 ? 0 : clamp(-vec.x * 1.35, -1, 1));
    stick.classList.toggle('moving-fwd', thr > 0.08);
    stick.classList.toggle('moving-rev', thr < -0.08);
    stick.classList.toggle('moving-left', m >= 0.12 && vec.x < -0.25);
    stick.classList.toggle('moving-right', m >= 0.12 && vec.x > 0.25);
  }

  stick.addEventListener('touchstart', (e) => { e.preventDefault(); stickStart(e); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { e.preventDefault(); stickMove(e); }, { passive: false });
  stick.addEventListener('touchend', (e) => { e.preventDefault(); stickEnd(e); }, { passive: false });
  stick.addEventListener('touchcancel', (e) => { e.preventDefault(); stickEnd(e); }, { passive: false });
  // mouse: buat ngetes di desktop
  stick.addEventListener('mousedown', (e) => { e.preventDefault(); stickStart(e); });
  window.addEventListener('mousemove', (e) => { if (pad.active) { e.preventDefault(); stickMove(e); } });
  window.addEventListener('mouseup', () => stickEnd());

  // ---------- tombol aksi ergonomis (kanan bawah, lengkung jempol bulat) ----------
  const padBtns = document.createElement('div');
  padBtns.id = 'action-pad';
  const defs = [
    { id: 'act-jump', icon: '⤴', labelKey: 'touch_jump', label: 'JUMP', cls: 'jump hero' },
    { id: 'act-run', icon: '⚡', labelKey: 'touch_run', label: 'RUN', subKey: 'touch_sub_toggle', sub: 'toggle', cls: 'run' },
    { id: 'act-hitch', icon: '🔗', labelKey: 'touch_hitch', label: 'ROPE', subKey: 'touch_sub_detach', sub: 'unhitch', cls: 'hitch' },
    { id: 'act-inspect', icon: '👁️', labelKey: 'touch_inspect', label: 'CHECK', subKey: 'touch_sub_hold', sub: 'hold', cls: 'inspect' },
    { id: 'act-eat', icon: '🌿', labelKey: 'touch_eat', label: 'GRAZE', cls: 'eat' },
    { id: 'act-interact', icon: '💬', labelKey: 'touch_interact', label: 'TALK', cls: 'drink interact' },
    { id: 'act-sleep', icon: '😴', labelKey: 'touch_sleep', label: 'SLEEP', cls: 'sleep' },
  ];
  for (const d of defs) {
    const b = document.createElement('button');
    b.id = d.id; b.type = 'button';
    b.className = 'act ' + d.cls;
    b.innerHTML =
      '<span class="act-well">' +
        `<span class="ic" aria-hidden="true">${d.icon}</span>` +
        `<span class="lbl">${tr(d.labelKey, d.label)}</span>` +
        (d.sub ? `<span class="sub">${tr(d.subKey, d.sub)}</span>` : '') +
      '</span>';
    padBtns.appendChild(b);
  }
  document.body.appendChild(padBtns);

  const runBtn = padBtns.querySelector('#act-run');
  const hitchBtn = padBtns.querySelector('#act-hitch');
  const inspectBtn = padBtns.querySelector('#act-inspect');
  const sleepBtn = padBtns.querySelector('#act-sleep');
  const press = (el, fn) => {
    // HP asli mengirim touchstart LALU click -> tanpa penjaga ini aksi jalan 2x
    // (toggle lari jadi nyala-mati seketika). Catat waktu sentuh terakhir.
    let lastTouch = 0;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (el.disabled) return;
      lastTouch = performance.now();
      el.classList.add('tap');
      setTimeout(() => el.classList.remove('tap'), 120);
      fn();
    }, { passive: false });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (el.disabled) return;
      if (performance.now() - lastTouch < 600) return;
      el.classList.add('tap');
      setTimeout(() => el.classList.remove('tap'), 120);
      fn();
    });
  };
  press(runBtn, () => onRunToggle && onRunToggle());
  press(padBtns.querySelector('#act-jump'), () => onJump && onJump());
  press(padBtns.querySelector('#act-eat'), () => onEat && onEat());
  press(padBtns.querySelector('#act-interact'), () => onInteract && onInteract());
  press(hitchBtn, () => onHitch && onHitch());
  if (inspectBtn) {
    const startInsp = (e) => {
      e.preventDefault();
      if (inspectBtn.disabled) return;
      onInspect && onInspect(true);
    };
    const endInsp = (e) => { if (e) e.preventDefault(); onInspect && onInspect(false); };
    inspectBtn.addEventListener('touchstart', startInsp, { passive: false });
    inspectBtn.addEventListener('touchend', endInsp, { passive: false });
    inspectBtn.addEventListener('touchcancel', endInsp, { passive: false });
    inspectBtn.addEventListener('mousedown', startInsp);
    inspectBtn.addEventListener('mouseup', endInsp);
    inspectBtn.addEventListener('mouseleave', endInsp);
  }
  if (sleepBtn) press(sleepBtn, () => onSleep && onSleep());

  return {
    active: true,
    joystick: { vec, pad, applyStick },
    setRunLatched(on) { runBtn.classList.toggle('on', !!on); },
    setInspectState(on) { if (inspectBtn) inspectBtn.classList.toggle('on', !!on); },
    setInspectDisabled(disabled) {
      if (!inspectBtn) return;
      inspectBtn.disabled = !!disabled;
      if (disabled) inspectBtn.classList.remove('on');
    },
    setSleepState(on) { if (sleepBtn) sleepBtn.classList.toggle('on', !!on); },
    refreshLang() {
      const rt = rotate.querySelector('#rh-title');
      const rs = rotate.querySelector('#rh-sub');
      const rbtn = rotate.querySelector('#btn-fullscreen');
      if (rt) rt.textContent = tr('touch_rotate_title', 'Rotate Phone to LANDSCAPE');
      if (rs) rs.textContent = tr('touch_rotate_sub', 'Analog stick on the left, action buttons on the right.');
      if (rbtn) rbtn.textContent = tr('touch_fullscreen', 'Fullscreen + Lock');
      for (const d of defs) {
        const el = padBtns.querySelector(`#${d.id}`);
        if (!el) continue;
        const lbl = el.querySelector('.lbl');
        if (lbl) lbl.textContent = tr(d.labelKey, d.label);
        if (d.subKey) {
          const s = el.querySelector('.sub');
          if (s) s.textContent = tr(d.subKey, d.sub);
        }
      }
    },
    setHitchState({ free = false, disabled = false, sub = '' } = {}) {
      if (!hitchBtn) return;
      hitchBtn.classList.toggle('free', !!free);
      hitchBtn.disabled = !!disabled;
      const ic = hitchBtn.querySelector('.ic');
      const s = hitchBtn.querySelector('.sub');
      if (ic) ic.textContent = free ? '🔗' : '🔓';
      if (s && sub) s.textContent = sub;
    },
  };
}
