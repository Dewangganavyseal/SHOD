/* ============================================================================
   MINIMAP & WORLD MAP — Peta Mini Kanan Atas + Modal Peta Dunia (Tombol M / Tap)
   ========================================================================= */

function villageLabel(v) {
  if (!v) return '';
  if (v.name) return v.name;
  const raw = String(v.title || v.id || 'Desa');
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export class MapUI {
  constructor(opts = {}) {
    this.world = opts.world || null;
    this.miniCanvas = opts.miniCanvas || null;
    this.fullCanvas = opts.fullCanvas || null;
    this.modalEl = opts.modalEl || null;
    this.miniWrap = opts.miniWrap || null;
    this.closeBtn = opts.closeBtn || null;
    this.locLabelEl = opts.locLabelEl || null;
    this.coordLabelEl = opts.coordLabelEl || null;
    this.isOpen = false;
    this._frame = 0;
    this._baseSize = 512;
    this._baseCanvas = null;
    this._isOrthoBase = false;
    this.miniSpan = 220;
    this.wmZoom = 1.0;
    this.wmCenterX = 0;
    this.wmCenterZ = 0;
    this._lastHorseX = 0;
    this._lastHorseZ = 0;
    this._wmZoomLabelEl = opts.wmZoomLabelEl || (typeof document !== 'undefined' ? document.getElementById('worldmap-zoom-label') : null);

    if (this.miniWrap) {
      this.miniWrap.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.mm-zoom-bar')) return;
        e.preventDefault();
        this.toggle();
      });
      this.miniWrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.zoomMinimap(e.deltaY < 0 ? 0.82 : 1.22);
      }, { passive: false });
    }
    if (typeof document !== 'undefined') {
      const mmIn = document.getElementById('btn-mm-zoom-in');
      const mmOut = document.getElementById('btn-mm-zoom-out');
      if (mmIn) mmIn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.zoomMinimap(0.76); });
      if (mmOut) mmOut.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.zoomMinimap(1.32); });

      const wmIn = document.getElementById('btn-wm-zoom-in');
      const wmOut = document.getElementById('btn-wm-zoom-out');
      const wmReset = document.getElementById('btn-wm-zoom-reset');
      const wmCenter = document.getElementById('btn-wm-center-horse');
      if (wmIn) wmIn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.wmZoom <= 1.02) {
          this.wmCenterX = this._lastHorseX || 0;
          this.wmCenterZ = this._lastHorseZ || 0;
        }
        this.zoomWorldMap(1.5, 0.5, 0.5);
      });
      if (wmOut) wmOut.addEventListener('click', (e) => { e.preventDefault(); this.zoomWorldMap(1 / 1.5, 0.5, 0.5); });
      if (wmReset) wmReset.addEventListener('click', (e) => { e.preventDefault(); this.resetWorldMapView(); });
      if (wmCenter) wmCenter.addEventListener('click', (e) => { e.preventDefault(); this.focusHorseOnWorldMap(); });

      window.addEventListener('keydown', (e) => {
        if (!this.isOpen) return;
        if (e.key === '+' || e.key === '=') {
          if (this.wmZoom <= 1.02) {
            this.wmCenterX = this._lastHorseX || 0;
            this.wmCenterZ = this._lastHorseZ || 0;
          }
          this.zoomWorldMap(1.35, 0.5, 0.5);
        } else if (e.key === '-' || e.key === '_') {
          this.zoomWorldMap(1 / 1.35, 0.5, 0.5);
        } else if (e.key === '0') {
          this.resetWorldMapView();
        }
      });
    }

    if (this.fullCanvas) {
      this._bindWorldMapInteractions();
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.close();
      });
    }
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    this._bakeStaticMap();
  }

  _clampWorldMapView() {
    const T = this._terrainSize();
    this.wmZoom = Math.max(1.0, Math.min(12.0, this.wmZoom));
    const span = T / this.wmZoom;
    const maxOff = Math.max(0, (T - span) * 0.5);
    this.wmCenterX = Math.max(-maxOff, Math.min(maxOff, this.wmCenterX));
    this.wmCenterZ = Math.max(-maxOff, Math.min(maxOff, this.wmCenterZ));
    if (this._wmZoomLabelEl) {
      this._wmZoomLabelEl.textContent = `${this.wmZoom.toFixed(1)}×`;
    }
  }

  zoomMinimap(factor) {
    this.miniSpan = Math.max(100, Math.min(560, this.miniSpan * factor));
    this._drawFullMapNow = true;
  }

  zoomWorldMap(factor, anchorX = 0.5, anchorY = 0.5) {
    const T = this._terrainSize();
    const oldZoom = this.wmZoom;
    const oldSpan = T / oldZoom;
    const worldAtAnchorX = this.wmCenterX + (anchorX - 0.5) * oldSpan;
    const worldAtAnchorZ = this.wmCenterZ + (anchorY - 0.5) * oldSpan;

    const nextZoom = Math.max(1.0, Math.min(12.0, oldZoom * factor));
    const nextSpan = T / nextZoom;
    this.wmZoom = nextZoom;
    this.wmCenterX = worldAtAnchorX - (anchorX - 0.5) * nextSpan;
    this.wmCenterZ = worldAtAnchorZ - (anchorY - 0.5) * nextSpan;
    this._clampWorldMapView();
    this._drawFullMapNow = true;
  }

  resetWorldMapView() {
    this.wmZoom = 1.0;
    this.wmCenterX = 0;
    this.wmCenterZ = 0;
    this._clampWorldMapView();
    this._drawFullMapNow = true;
  }

  focusHorseOnWorldMap() {
    this.wmCenterX = this._lastHorseX || 0;
    this.wmCenterZ = this._lastHorseZ || 0;
    if (this.wmZoom < 3.5) this.wmZoom = 4.0;
    this._clampWorldMapView();
    this._drawFullMapNow = true;
  }

  _bindWorldMapInteractions() {
    const cv = this.fullCanvas;
    if (!cv) return;
    const ptrs = new Map();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastPinchDist = 0;

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = cv.getBoundingClientRect();
      const nx = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5;
      const ny = rect.height > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) : 0.5;
      const factor = e.deltaY < 0 ? 1.28 : 1 / 1.28;
      this.zoomWorldMap(factor, nx, ny);
    }, { passive: false });

    cv.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const nx = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5;
      const ny = rect.height > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) : 0.5;
      if (this.wmZoom >= 7.5) this.resetWorldMapView();
      else this.zoomWorldMap(2.0, nx, ny);
    });

    cv.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (cv.setPointerCapture) {
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (ptrs.size === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        cv.classList.add('is-panning');
      } else if (ptrs.size === 2) {
        dragging = false;
        const [a, b] = Array.from(ptrs.values());
        lastPinchDist = Math.hypot(b.x - a.x, b.y - a.y);
      }
    });

    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size === 2) {
        const [a, b] = Array.from(ptrs.values());
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (lastPinchDist > 4 && dist > 4) {
          const rect = cv.getBoundingClientRect();
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          const nx = rect.width > 0 ? Math.max(0, Math.min(1, (mx - rect.left) / rect.width)) : 0.5;
          const ny = rect.height > 0 ? Math.max(0, Math.min(1, (my - rect.top) / rect.height)) : 0.5;
          this.zoomWorldMap(dist / lastPinchDist, nx, ny);
        }
        lastPinchDist = dist;
        return;
      }

      if (dragging && this.wmZoom > 1.001) {
        const rect = cv.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          const span = this._terrainSize() / this.wmZoom;
          this.wmCenterX -= (dx / rect.width) * span;
          this.wmCenterZ -= (dy / rect.height) * span;
          this._clampWorldMapView();
          this._drawFullMapNow = true;
        }
      }
      lastX = e.clientX;
      lastY = e.clientY;
    });

    const endPtr = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) lastPinchDist = 0;
      if (ptrs.size === 0) {
        dragging = false;
        cv.classList.remove('is-panning');
      }
    };
    cv.addEventListener('pointerup', endPtr);
    cv.addEventListener('pointercancel', endPtr);
  }

  _terrainSize() {
    return (this.world && this.world.TERRAIN_SIZE) || 1500;
  }

  _bakeStaticMap() {
    if (typeof document === 'undefined' || !this.world) return;
    const S = this._baseSize;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const T = this._terrainSize();
    const toPx = (wx, wz) => [
      ((wx + T * 0.5) / T) * S,
      ((wz + T * 0.5) / T) * S,
    ];

    // Base meadow
    const bgGrad = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.08, S * 0.5, S * 0.5, S * 0.7);
    bgGrad.addColorStop(0, '#4f8f4e');
    bgGrad.addColorStop(0.55, '#3b7340');
    bgGrad.addColorStop(1, '#26522e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, S, S);

    // Subtle forest patches texture
    ctx.fillStyle = 'rgba(20, 48, 25, 0.24)';
    for (let i = 0; i < 64; i++) {
      const rx = ((Math.sin(i * 19.3) * 0.5 + 0.5) * 0.9 + 0.05) * S;
      const ry = ((Math.cos(i * 31.7) * 0.5 + 0.5) * 0.9 + 0.05) * S;
      const rad = 12 + (i % 5) * 9;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Winding River
    if (typeof this.world._riverCenterZ === 'function') {
      const step = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Sandy bank stroke
      ctx.beginPath();
      for (let x = -T * 0.5; x <= T * 0.5; x += step) {
        const z = this.world._riverCenterZ(x);
        const [px, py] = toPx(x, z);
        if (x === -T * 0.5) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#c8b384';
      ctx.lineWidth = Math.max(4.5, (14 / T) * S);
      ctx.stroke();

      // Water stream stroke
      ctx.strokeStyle = '#38a7c7';
      ctx.lineWidth = Math.max(2.6, (9 / T) * S);
      ctx.stroke();
    }

    // Pond near origin
    if (this.world.POND_CENTER) {
      const p = this.world.POND_CENTER;
      const [px, py] = toPx(p.x, p.z);
      const pr = Math.max(2.2, (p.radius / T) * S);
      ctx.fillStyle = '#d3bf8e';
      ctx.beginPath();
      ctx.arc(px, py, pr + 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38b5d2';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // All road polylines
    const polys = (this.world && Array.isArray(this.world.allRoadPolylines)) ? this.world.allRoadPolylines : [];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const poly of polys) {
      if (!poly || !Array.isArray(poly.pts) || poly.pts.length < 2) continue;
      const isRocky = poly.surface === 'rocky' || poly.surface === 'cliff';
      ctx.beginPath();
      for (let i = 0; i < poly.pts.length; i++) {
        const [px, py] = toPx(poly.pts[i][0], poly.pts[i][1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = isRocky ? 'rgba(30, 41, 59, 0.72)' : 'rgba(72, 48, 24, 0.55)';
      ctx.lineWidth = Math.max(3.2, (6.5 / T) * S);
      ctx.stroke();
      ctx.strokeStyle = poly.surface === 'cliff' ? '#cbd5e1' : (isRocky ? '#a8a29e' : '#deb778');
      ctx.lineWidth = Math.max(2.0, (4.2 / T) * S);
      ctx.stroke();
    }

    // Special story landmark regions on base map
    const landmarks = (this.world && Array.isArray(this.world.LANDMARKS)) ? this.world.LANDMARKS : [];
    for (const lm of landmarks) {
      if (lm.kind === 'forest') {
        const [lx, ly] = toPx(lm.x, lm.z);
        const lr = Math.max(8, ((lm.radius || 70) / T) * S);
        ctx.fillStyle = 'rgba(20, 83, 45, 0.45)';
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
      } else if (lm.kind === 'waterfall') {
        const [lx, ly] = toPx(lm.x, lm.z);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(lx, ly, Math.max(4, (14 / T) * S), 0, Math.PI * 2);
        ctx.fill();
      } else if (lm.kind === 'gorge') {
        const [lx, ly] = toPx(lm.x, lm.z);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.68)';
        ctx.beginPath();
        ctx.ellipse(lx, ly, Math.max(4, (16 / T) * S), Math.max(8, (46 / T) * S), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Village clearing circles
    const villages = (this.world && Array.isArray(this.world.VILLAGES)) ? this.world.VILLAGES : [];
    const workshops = (this.world && Array.isArray(this.world.VILLAGE_WORKSHOPS)) ? this.world.VILLAGE_WORKSHOPS : [];
    for (const v of villages) {
      const [vx, vy] = toPx(v.cx, v.cz);
      const vr = Math.max(5.5, ((v.radius * 1.45) / T) * S);
      ctx.fillStyle = 'rgba(219, 187, 132, 0.9)';
      ctx.beginPath();
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5c3c1e';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    this._baseCanvas = cv;
  }

  open() {
    this.isOpen = true;
    if (this.modalEl) {
      this.modalEl.hidden = false;
      this.modalEl.style.display = 'flex';
    }
    this._drawFullMapNow = true;
  }

  close() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.hidden = true;
      this.modalEl.style.display = 'none';
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
    return this.isOpen;
  }

  refreshBaseFromOrtho(hideRoots = []) {
    if (!this.world || typeof this.world.captureOrthoMapCanvas !== 'function') return false;
    const cap = this.world.captureOrthoMapCanvas(4096, hideRoots);
    if (!cap) return false;
    this._baseCanvas = cap;
    this._baseSize = cap.width;
    this._isOrthoBase = true;
    this._drawFullMapNow = true;
    return true;
  }

  _drawArrow(ctx, cx, cy, yawRad, size) {
    // animator forward: fx = cos(yaw), fz = -sin(yaw) in north-up coords (+x right, +z down)
    const angle = -yawRad;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 3;

    // Right shaded half
    ctx.beginPath();
    ctx.moveTo(size * 1.2, 0);
    ctx.lineTo(-size * 0.42, 0);
    ctx.lineTo(-size * 0.82, size * 0.76);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();

    // Left highlight half
    ctx.beginPath();
    ctx.moveTo(size * 1.2, 0);
    ctx.lineTo(-size * 0.82, -size * 0.76);
    ctx.lineTo(-size * 0.42, 0);
    ctx.closePath();
    ctx.fillStyle = '#fffbeb';
    ctx.fill();

    // Crisp outer contour
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(size * 1.2, 0);
    ctx.lineTo(-size * 0.82, -size * 0.76);
    ctx.lineTo(-size * 0.42, 0);
    ctx.lineTo(-size * 0.82, size * 0.76);
    ctx.closePath();
    ctx.lineWidth = Math.max(1.3, size * 0.22);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#181410';
    ctx.stroke();
    ctx.restore();
  }

  _drawCampfireIcon(ctx, x, y, r, hollow = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (hollow) {
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(7, r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Warm glow halo
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.6);
    g.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
    g.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Crossed logs at base
    ctx.strokeStyle = '#1c1209';
    ctx.lineWidth = Math.max(1.8, r * 0.36);
    ctx.beginPath();
    ctx.moveTo(-r * 0.78, r * 0.52);
    ctx.lineTo(r * 0.78, r * 0.16);
    ctx.moveTo(r * 0.78, r * 0.52);
    ctx.lineTo(-r * 0.78, r * 0.16);
    ctx.stroke();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(1.1, r * 0.20);
    ctx.stroke();

    // Outer flame silhouette
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.05);
    ctx.quadraticCurveTo(r * 0.72, -r * 0.25, r * 0.56, r * 0.32);
    ctx.quadraticCurveTo(0, r * 0.62, -r * 0.56, r * 0.32);
    ctx.quadraticCurveTo(-r * 0.72, -r * 0.25, 0, -r * 1.05);
    ctx.closePath();
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.lineWidth = Math.max(1.1, r * 0.18);
    ctx.strokeStyle = '#1c1209';
    ctx.stroke();

    // Bright inner flame tongue
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.58);
    ctx.quadraticCurveTo(r * 0.36, -r * 0.08, r * 0.28, r * 0.26);
    ctx.quadraticCurveTo(0, r * 0.42, -r * 0.28, r * 0.26);
    ctx.quadraticCurveTo(-r * 0.36, -r * 0.08, 0, -r * 0.58);
    ctx.closePath();
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.restore();
  }

  _drawCartIcon(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';

    // Pale canopy arch + wooden wagon box + twin wheels
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, r * 0.62, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.lineWidth = Math.max(1.1, r * 0.18);
    ctx.strokeStyle = '#181410';
    ctx.stroke();

    ctx.fillStyle = '#d97706';
    ctx.fillRect(-r * 0.78, -r * 0.12, r * 1.56, r * 0.56);
    ctx.strokeRect(-r * 0.78, -r * 0.12, r * 1.56, r * 0.56);

    for (const wx of [-r * 0.44, r * 0.44]) {
      ctx.beginPath();
      ctx.arc(wx, r * 0.54, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#451a03';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawLandmarkIcon(ctx, x, y, r, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const ol = Math.max(1.1, r * 0.18);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = ol;

    if (kind === 'hill') {
      // Twin craggy rocky peaks
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, r * 0.68);
      ctx.lineTo(-r * 0.35, -r * 0.62);
      ctx.lineTo(r * 0.18, r * 0.68);
      ctx.closePath();
      ctx.fillStyle = '#78716c';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-r * 0.30, r * 0.68);
      ctx.lineTo(r * 0.35, -r * 0.92);
      ctx.lineTo(r * 1.05, r * 0.68);
      ctx.closePath();
      ctx.fillStyle = '#d6d3d1';
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'waterfall') {
      // Slate cliff ledge + cascading turquoise water ribbons
      ctx.fillStyle = '#475569';
      ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.70, r * 1.35);
      ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.70, r * 1.35);

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-r * 0.46, -r * 0.72, r * 0.92, r * 1.18);

      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = Math.max(1.0, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(-r * 0.18, -r * 0.62);
      ctx.lineTo(-r * 0.18, r * 0.35);
      ctx.moveTo(r * 0.18, -r * 0.62);
      ctx.lineTo(r * 0.18, r * 0.35);
      ctx.stroke();

      // White foam pool oval at base
      ctx.fillStyle = '#bae6fd';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = ol;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.56, r * 0.88, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'gorge') {
      // Split dark canyon rock walls flanking a deep jagged chasm
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.65);
      ctx.lineTo(-r * 0.18, -r * 0.55);
      ctx.lineTo(-r * 0.32, 0);
      ctx.lineTo(-r * 0.10, r * 0.72);
      ctx.lineTo(-r * 0.95, r * 0.72);
      ctx.closePath();
      ctx.fillStyle = '#64748b';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r * 0.95, -r * 0.65);
      ctx.lineTo(r * 0.18, -r * 0.55);
      ctx.lineTo(r * 0.04, 0);
      ctx.lineTo(r * 0.22, r * 0.72);
      ctx.lineTo(r * 0.95, r * 0.72);
      ctx.closePath();
      ctx.fillStyle = '#94a3b8';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-r * 0.18, -r * 0.55);
      ctx.lineTo(r * 0.18, -r * 0.55);
      ctx.lineTo(r * 0.04, 0);
      ctx.lineTo(r * 0.22, r * 0.72);
      ctx.lineTo(-r * 0.10, r * 0.72);
      ctx.lineTo(-r * 0.32, 0);
      ctx.closePath();
      ctx.fillStyle = '#090d16';
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'forest') {
      // Clustered deepwood pine trio
      for (const [ox, oy, sc, col] of [
        [-r * 0.42, r * 0.12, 0.74, '#15803d'],
        [r * 0.42, r * 0.12, 0.74, '#15803d'],
        [0, -r * 0.08, 0.96, '#22c55e'],
      ]) {
        ctx.beginPath();
        ctx.moveTo(ox, oy - r * 0.92 * sc);
        ctx.lineTo(ox + r * 0.62 * sc, oy + r * 0.64 * sc);
        ctx.lineTo(ox - r * 0.62 * sc, oy + r * 0.64 * sc);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
        ctx.stroke();
      }
    } else if (kind === 'rocky_road' || kind === 'cliff_road') {
      const mainCol = kind === 'cliff_road' ? '#f59e0b' : '#d6d3d1';
      const subCol = kind === 'cliff_road' ? '#b45309' : '#78716c';
      for (const [bx, by, br, col] of [
        [-r * 0.42, r * 0.18, r * 0.48, subCol],
        [r * 0.44, r * 0.24, r * 0.42, subCol],
        [0, -r * 0.22, r * 0.54, mainCol],
      ]) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.stroke();
      }
    } else if (kind === 'ancient_tree') {
      // Siluet Pohon Agung Purba: akar lebar + batang coklat kokoh + mahkota zamrud-keemasan megah
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, r * 0.82);
      ctx.quadraticCurveTo(-r * 0.18, r * 0.30, -r * 0.20, -r * 0.05);
      ctx.lineTo(r * 0.20, -r * 0.05);
      ctx.quadraticCurveTo(r * 0.18, r * 0.30, r * 0.45, r * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (const [cx, cy, cr, col] of [
        [-r * 0.48, -r * 0.10, r * 0.46, '#15803d'],
        [r * 0.48, -r * 0.10, r * 0.46, '#15803d'],
        [0, -r * 0.42, r * 0.58, '#eab308'],
      ]) {
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.stroke();
      }
    } else if (kind === 'ruins') {
      // Reruntuhan pilar batu kuno & lintel patah
      ctx.fillStyle = '#d6d3d1';
      ctx.fillRect(-r * 0.78, r * 0.44, r * 1.56, r * 0.34);
      ctx.strokeRect(-r * 0.78, r * 0.44, r * 1.56, r * 0.34);
      ctx.fillStyle = '#c2b79f';
      ctx.fillRect(-r * 0.58, -r * 0.52, r * 0.34, r * 0.96);
      ctx.strokeRect(-r * 0.58, -r * 0.52, r * 0.34, r * 0.96);
      ctx.fillRect(r * 0.22, -r * 0.12, r * 0.34, r * 0.56);
      ctx.strokeRect(r * 0.22, -r * 0.12, r * 0.34, r * 0.56);
      ctx.fillRect(-r * 0.72, -r * 0.78, r * 1.12, r * 0.30);
      ctx.strokeRect(-r * 0.72, -r * 0.78, r * 1.12, r * 0.30);
    } else if (kind === 'cavern') {
      // Kubah batu goa gelap + prisma kristal cyan/ungu berpendar
      ctx.beginPath();
      ctx.arc(0, r * 0.35, r * 0.88, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#475569';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-r * 0.42, r * 0.35);
      ctx.lineTo(0, -r * 0.75);
      ctx.lineTo(r * 0.42, r * 0.35);
      ctx.closePath();
      ctx.fillStyle = '#22d3ee';
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'bandit_camp') {
      // Tenda kemah bandit merah marun bertanduk
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(r * 0.92, r * 0.68);
      ctx.lineTo(-r * 0.92, r * 0.68);
      ctx.closePath();
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -r * 0.05);
      ctx.lineTo(r * 0.30, r * 0.68);
      ctx.lineTo(-r * 0.30, r * 0.68);
      ctx.closePath();
      ctx.fillStyle = '#1e1b18';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.85, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.85, 0);
      ctx.closePath();
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawLabelPill(ctx, cx, cy, text, opts = {}, placed = []) {
    const padX = opts.padX || 6;
    const h = opts.height || 17;
    const font = opts.font || '700 11px system-ui, sans-serif';
    const dy = opts.dy || 11;
    const dx = opts.dx || 12;
    const order = opts.order || ['bottom', 'top', 'right', 'left'];
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width + padX * 2);

    const rectsHit = (a, b) => !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
    const makeBox = (dir) => {
      let x = cx - w * 0.5;
      let y = cy + dy;
      if (dir === 'top') { x = cx - w * 0.5; y = cy - dy - h; }
      else if (dir === 'right') { x = cx + dx; y = cy - h * 0.5; }
      else if (dir === 'left') { x = cx - dx - w; y = cy - h * 0.5; }
      else if (dir === 'bottom-far') { x = cx - w * 0.5; y = cy + dy + 16; }
      else if (dir === 'top-far') { x = cx - w * 0.5; y = cy - dy - h - 16; }
      const clampX = Math.max(4, Math.min((opts.maxW || 600) - w - 4, x));
      const clampY = Math.max(4, Math.min((opts.maxH || 600) - h - 4, y));
      return { x1: clampX, y1: clampY, x2: clampX + w, y2: clampY + h };
    };

    let chosen = null;
    for (const dir of [...order, 'bottom-far', 'top-far']) {
      const cand = makeBox(dir);
      if (!placed.some((b) => rectsHit(cand, b))) {
        chosen = cand;
        break;
      }
    }
    if (!chosen) chosen = makeBox(order[0]);
    placed.push(chosen);

    ctx.fillStyle = opts.bg || 'rgba(15, 23, 42, 0.86)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(chosen.x1, chosen.y1, w, h, opts.radius || 5);
    else ctx.rect(chosen.x1, chosen.y1, w, h);
    ctx.fill();
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = opts.borderWidth || 1;
      ctx.stroke();
    }
    ctx.fillStyle = opts.fg || '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, chosen.x1 + w * 0.5, chosen.y1 + h * 0.5 + 0.5);
  }

  update(horseX, horseZ, horseYaw, cartX, cartZ, activeQuest, nearbyVillage) {
    this._frame++;
    this._lastHorseX = horseX;
    this._lastHorseZ = horseZ;
    const trFn = typeof globalThis !== 'undefined' && globalThis.HC && globalThis.HC.t;
    if (this.locLabelEl) {
      this.locLabelEl.textContent = nearbyVillage
        ? `${trFn ? trFn('loc_village_prefix') : 'Village'} ${villageLabel(nearbyVillage)}`
        : (Math.hypot(horseX, horseZ) < 16 ? (trFn ? trFn('loc_camp') : 'Starting Camp') : (trFn ? trFn('loc_forest') : 'Forest & Trail'));
    }
    if (this.isOpen && this.coordLabelEl) {
      this.coordLabelEl.textContent = `X: ${Math.round(horseX)}m • Z: ${Math.round(horseZ)}m`;
    }
    if (this._wmZoomLabelEl) {
      this._wmZoomLabelEl.textContent = `${this.wmZoom.toFixed(1)}×`;
    }

    if ((this._frame % 3 !== 0) && !this._drawFullMapNow) return;
    this._drawFullMapNow = false;

    const T = this._terrainSize();
    const villages = (this.world && Array.isArray(this.world.VILLAGES)) ? this.world.VILLAGES : [];
    const landmarks = (this.world && Array.isArray(this.world.LANDMARKS)) ? this.world.LANDMARKS : [];
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);

    // 1) Top-right Minimap (zoomable local view centered on horse; real buildings visible without house icons)
    if (this.miniCanvas && this._baseCanvas) {
      const ctx = this.miniCanvas.getContext('2d');
      const W = this.miniCanvas.width;
      const H = this.miniCanvas.height;
      const spanWorld = Math.max(100, Math.min(560, this.miniSpan));
      const S = this._baseSize;
      const halfSpan = spanWorld * 0.5;

      const srcW = (spanWorld / T) * S;
      const srcH = srcW;
      const horsePx = ((horseX + T * 0.5) / T) * S;
      const horsePz = ((horseZ + T * 0.5) / T) * S;
      const sx = horsePx - srcW * 0.5;
      const sy = horsePz - srcH * 0.5;

      ctx.fillStyle = '#1b3822';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this._baseCanvas, sx, sy, srcW, srcH, 0, 0, W, H);

      const LW = 144;
      const LH = 144;
      const pxPerM = LW / spanWorld;
      const toMini = (wx, wz) => [
        ((wx - horseX + halfSpan) / spanWorld) * LW,
        ((wz - horseZ + halfSpan) / spanWorld) * LH,
      ];

      ctx.save();
      ctx.scale(W / LW, H / LH);

      // Starting Camp indicator (hollow ring when zoomed close so real campfire & clearing remain visible)
      {
        const [fx, fy] = toMini(0, 0);
        if (fx >= -12 && fx <= LW + 12 && fy >= -12 && fy <= LH + 12) {
          this._drawCampfireIcon(ctx, fx, fy, spanWorld <= 230 ? 5.5 : 4.2, spanWorld <= 230);
        }
      }

      // Active quest vector + perimeter target ring around village (does not cover buildings inside)
      if (activeQuest) {
        const [qx, qy] = toMini(activeQuest.toX, activeQuest.toZ);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 214, 70, 0.85)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(LW * 0.5, LH * 0.5);
        ctx.lineTo(qx, qy);
        ctx.stroke();
        ctx.restore();

        const pad = 11;
        const clampedX = Math.max(pad, Math.min(LW - pad, qx));
        const clampedY = Math.max(pad, Math.min(LH - pad, qy));
        const isOnScreen = qx >= 4 && qx <= LW - 4 && qy >= 4 && qy <= LH - 4;
        const ringR = isOnScreen ? Math.max(7.5, 16 * pxPerM) + pulse * 2.5 : (5.5 + pulse * 2.5);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.arc(clampedX, clampedY, ringR, 0, Math.PI * 2);
        ctx.stroke();
        if (!isOnScreen) {
          ctx.fillStyle = '#ffb703';
          ctx.beginPath();
          ctx.arc(clampedX, clampedY, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Story landmarks on minimap (subtle badge; real waterfalls/gorges/forests show underneath)
      for (const lm of landmarks) {
        const [lx, ly] = toMini(lm.x, lm.z);
        if (lx < -14 || lx > LW + 14 || ly < -14 || ly > LH + 14) continue;
        this._drawLandmarkIcon(ctx, lx, ly, spanWorld <= 240 ? 4.0 : 4.6, lm.kind);
      }

      // Villages: show REAL 3D rooftops from ortho map! Only place name pill outside village building radius
      ctx.font = 'bold 9.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of villages) {
        const [vx, vy] = toMini(v.cx, v.cz);
        if (vx < -28 || vx > LW + 28 || vy < -24 || vy > LH + 24) continue;
        const isCurrent = nearbyVillage && nearbyVillage.id === v.id;
        const isQuestDest = activeQuest && activeQuest.toId === v.id;
        const vRadPx = Math.max(7, (v.radius || 15) * pxPerM);
        if (isCurrent) {
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.75)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.arc(vx, vy, vRadPx * 1.12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const lbl = villageLabel(v);
        const lblY = vy + Math.min(34, vRadPx + 3);
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = 'rgba(10, 16, 28, 0.90)';
        ctx.strokeText(lbl, vx, lblY);
        ctx.fillStyle = isQuestDest ? '#fde047' : isCurrent ? '#86efac' : '#f8fafc';
        ctx.fillText(lbl, vx, lblY);
      }

      // Cart marker
      if (Number.isFinite(cartX) && Number.isFinite(cartZ)) {
        const [cx, cy] = toMini(cartX, cartZ);
        if (cx >= -10 && cx <= LW + 10 && cy >= -10 && cy <= LH + 10) {
          this._drawCartIcon(ctx, cx, cy, 4.2);
        }
      }

      // Horse directional arrow at center
      this._drawArrow(ctx, LW * 0.5, LH * 0.5, horseYaw, 6.0);
      ctx.restore();
    }

    // 2) Full World Map Modal (zoomable 1x..12x & pannable, showing real 3D buildings without icons covering them)
    if (this.isOpen && this.fullCanvas && this._baseCanvas) {
      this._clampWorldMapView();
      const ctx = this.fullCanvas.getContext('2d');
      const W = this.fullCanvas.width;
      const H = this.fullCanvas.height;
      const S = this._baseSize;
      const spanWorld = T / this.wmZoom;
      const halfSpan = spanWorld * 0.5;
      const srcW = (spanWorld / T) * S;
      const srcH = srcW;
      const cxPx = ((this.wmCenterX + T * 0.5) / T) * S;
      const czPx = ((this.wmCenterZ + T * 0.5) / T) * S;
      const sx = cxPx - srcW * 0.5;
      const sy = czPx - srcH * 0.5;

      ctx.fillStyle = '#1b3822';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this._baseCanvas, sx, sy, srcW, srcH, 0, 0, W, H);

      const LW = 600;
      const LH = 600;
      const pxPerM = LW / spanWorld;
      const toFull = (wx, wz) => [
        ((wx - this.wmCenterX + halfSpan) / spanWorld) * LW,
        ((wz - this.wmCenterZ + halfSpan) / spanWorld) * LH,
      ];

      ctx.save();
      ctx.scale(W / LW, H / LH);

      // Adaptive world grid lines (300m -> 100m -> 50m as you zoom in)
      const gridStep = this.wmZoom >= 5.5 ? 50 : this.wmZoom >= 2.2 ? 100 : 300;
      const startWX = Math.ceil((this.wmCenterX - halfSpan) / gridStep) * gridStep;
      const endWX = Math.floor((this.wmCenterX + halfSpan) / gridStep) * gridStep;
      const startWZ = Math.ceil((this.wmCenterZ - halfSpan) / gridStep) * gridStep;
      const endWZ = Math.floor((this.wmCenterZ + halfSpan) / gridStep) * gridStep;
      ctx.strokeStyle = this._isOrthoBase ? 'rgba(255, 248, 220, 0.08)' : 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 1;
      for (let gx = startWX; gx <= endWX; gx += gridStep) {
        const px = ((gx - this.wmCenterX + halfSpan) / spanWorld) * LW;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, LH); ctx.stroke();
      }
      for (let gz = startWZ; gz <= endWZ; gz += gridStep) {
        const py = ((gz - this.wmCenterZ + halfSpan) / spanWorld) * LH;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(LW, py); ctx.stroke();
      }

      // Compass cardinal badges around map perimeter
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [cx, cy, ch] of [
        [LW * 0.5, 13, 'N'],
        [LW * 0.5, LH - 13, 'S'],
        [13, LH * 0.5, 'W'],
        [LW - 13, LH * 0.5, 'E'],
      ]) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.beginPath(); ctx.arc(cx, cy, 9.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c89e4c';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.fillText(ch, cx, cy + 0.5);
      }

      // Reserve visible icon/perimeter footprints for non-overlapping label pills
      const placedBoxes = [];
      const reserveIcon = (ix, iy, r) => placedBoxes.push({ x1: ix - r, y1: iy - r, x2: ix + r, y2: iy + r });
      reserveIcon(LW * 0.5, 13, 12);
      reserveIcon(LW * 0.5, LH - 13, 12);
      reserveIcon(13, LH * 0.5, 12);
      reserveIcon(LW - 13, LH * 0.5, 12);

      const isVisible = (x, y, m = 45) => x >= -m && x <= LW + m && y >= -m && y <= LH + m;

      {
        const [fx, fy] = toFull(0, 0);
        if (isVisible(fx, fy)) reserveIcon(fx, fy, 10);
      }
      {
        const [hpx, hpy] = toFull(horseX, horseZ);
        if (isVisible(hpx, hpy)) reserveIcon(hpx, hpy, 15);
      }
      if (Number.isFinite(cartX) && Number.isFinite(cartZ)) {
        const [cpx, cpy] = toFull(cartX, cartZ);
        if (isVisible(cpx, cpy)) reserveIcon(cpx, cpy, 10);
      }
      for (const v of villages) {
        const [vx, vy] = toFull(v.cx, v.cz);
        if (isVisible(vx, vy, 80)) {
          // Protect village's real building footprint from pill labels when zoomed in!
          const vRadPx = Math.min(54, Math.max(9, (v.radius || 15) * pxPerM));
          reserveIcon(vx, vy, vRadPx);
        }
      }
      for (const lm of landmarks) {
        const [lx, ly] = toFull(lm.x, lm.z);
        if (isVisible(lx, ly)) reserveIcon(lx, ly, 10);
      }

      // Quest route line + hollow outer ring around quest destination village (keeps houses uncovered!)
      if (activeQuest) {
        const [hx, hy] = toFull(horseX, horseZ);
        const [qx, qy] = toFull(activeQuest.toX, activeQuest.toZ);
        ctx.save();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(qx, qy);
        ctx.stroke();
        ctx.restore();

        const qDestV = villages.find((v) => v.id === activeQuest.toId);
        const baseQRad = qDestV ? Math.max(13, (qDestV.radius || 15) * 1.25 * pxPerM) : 14;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(qx, qy, baseQRad + pulse * 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Current village gentle outer emerald ring (no fill over buildings)
      if (nearbyVillage) {
        const [vx, vy] = toFull(nearbyVillage.cx, nearbyVillage.cz);
        if (isVisible(vx, vy, 80)) {
          const rPx = Math.max(12, (nearbyVillage.radius || 15) * 1.18 * pxPerM);
          ctx.save();
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(vx, vy, rPx, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Starting Camp indicator (transitions to delicate hollow ring when zoomed >= 3.2x so campfire stones/tents show!)
      {
        const [fx, fy] = toFull(0, 0);
        if (isVisible(fx, fy)) {
          const zoomClose = this.wmZoom >= 3.2;
          this._drawCampfireIcon(ctx, fx, fy, zoomClose ? Math.min(24, Math.max(9, 4.5 * pxPerM)) : 7.8, zoomClose);
        }
      }

      // Story landmarks (saat zoomed in, situs 3D besar cukup ring tipis agar bangunan/kristal/pohon aslinya terlihat utuh)
      const isIdLang = (typeof HC !== 'undefined' && HC.getLang && HC.getLang() === 'id');
      const lmIconR = this.wmZoom >= 3.5 ? 6.2 : 8.2;
      for (const lm of landmarks) {
        const [lx, ly] = toFull(lm.x, lm.z);
        if (!isVisible(lx, ly)) continue;
        const isSiteStructure = lm.kind === 'ancient_tree' || lm.kind === 'ruins' || lm.kind === 'cavern' || lm.kind === 'bandit_camp';
        if (isSiteStructure && this.wmZoom >= 2.6) {
          const ringR = Math.min(48, Math.max(11, (lm.radius || 20) * 0.85 * pxPerM));
          ctx.save();
          ctx.strokeStyle = lm.color || 'rgba(234, 179, 8, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(lx, ly, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        this._drawLandmarkIcon(ctx, lx, ly, lmIconR, lm.kind);
      }

      // Pill labels ONLY (NO house or anvil icons hiding real 3D roofs!)
      for (const v of villages) {
        const [vx, vy] = toFull(v.cx, v.cz);
        if (!isVisible(vx, vy, 65)) continue;
        const isCurrent = nearbyVillage && nearbyVillage.id === v.id;
        const isDest = activeQuest && activeQuest.toId === v.id;
        const vRadPx = Math.min(54, Math.max(8, (v.radius || 15) * pxPerM));
        this._drawLabelPill(ctx, vx, vy, villageLabel(v), {
          font: '700 12.5px system-ui, sans-serif',
          height: 19,
          padX: 7,
          dy: vRadPx + 5,
          dx: vRadPx + 6,
          radius: 6,
          bg: isDest ? 'rgba(146, 64, 14, 0.94)' : isCurrent ? 'rgba(20, 83, 45, 0.92)' : 'rgba(15, 23, 42, 0.86)',
          border: isDest ? '#facc15' : isCurrent ? '#4ade80' : '#c89e4c',
          borderWidth: 1.1,
          fg: '#f8fafc',
          order: ['bottom', 'top', 'right', 'left'],
        }, placedBoxes);
      }
      {
        const [fx, fy] = toFull(0, 0);
        if (isVisible(fx, fy, 45)) {
          const campOff = this.wmZoom >= 3.2 ? Math.min(30, Math.max(12, 5.5 * pxPerM)) : 11;
          this._drawLabelPill(ctx, fx, fy, trFn ? trFn('loc_camp') : 'Starting Camp', {
            font: '700 11px system-ui, sans-serif',
            height: 17,
            padX: 6,
            dy: campOff,
            dx: campOff + 4,
            bg: 'rgba(28, 19, 12, 0.88)',
            border: 'rgba(251, 146, 60, 0.72)',
            fg: '#ffedd5',
            order: ['top', 'left', 'right', 'bottom'],
          }, placedBoxes);
        }
      }
      for (const lm of landmarks) {
        const [lx, ly] = toFull(lm.x, lm.z);
        if (!isVisible(lx, ly, 45)) continue;
        const lmLbl = isIdLang ? lm.nameId : lm.nameEn;
        const isSiteStructure = lm.kind === 'ancient_tree' || lm.kind === 'ruins' || lm.kind === 'cavern' || lm.kind === 'bandit_camp';
        const siteOff = (isSiteStructure && this.wmZoom >= 2.6)
          ? Math.min(54, Math.max(14, (lm.radius || 18) * pxPerM))
          : 10;
        this._drawLabelPill(ctx, lx, ly, lmLbl, {
          font: '700 11px system-ui, sans-serif',
          height: 17,
          padX: 6,
          dy: siteOff,
          dx: siteOff + 2,
          bg: 'rgba(15, 23, 42, 0.86)',
          border: 'rgba(148, 163, 184, 0.5)',
          fg: '#f1f5f9',
          order: lm.id === 'cliffside_pass' ? ['right', 'top', 'bottom', 'left'] : ['bottom', 'top', 'left', 'right'],
        }, placedBoxes);
      }

      // Cart marker
      if (Number.isFinite(cartX) && Number.isFinite(cartZ)) {
        const [cx, cy] = toFull(cartX, cartZ);
        if (isVisible(cx, cy)) this._drawCartIcon(ctx, cx, cy, 6.4);
      }

      // Player horse arrow
      const [px, py] = toFull(horseX, horseZ);
      if (isVisible(px, py)) this._drawArrow(ctx, px, py, horseYaw, 9.2);
      ctx.restore();
    }
  }
}
