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

    if (this.miniWrap) {
      this.miniWrap.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggle();
      });
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
      ctx.beginPath();
      for (let i = 0; i < poly.pts.length; i++) {
        const [px, py] = toPx(poly.pts[i][0], poly.pts[i][1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(72, 48, 24, 0.55)';
      ctx.lineWidth = Math.max(3.2, (6.5 / T) * S);
      ctx.stroke();
      ctx.strokeStyle = '#deb778';
      ctx.lineWidth = Math.max(2.0, (4.2 / T) * S);
      ctx.stroke();
    }

    // Village clearing circles
    const villages = (this.world && Array.isArray(this.world.VILLAGES)) ? this.world.VILLAGES : [];
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

  _drawArrow(ctx, cx, cy, yawRad, size, fill = '#fff3b0', stroke = '#1e293b') {
    // animator forward: fx = cos(yaw), fz = -sin(yaw) in north-up coords (+x right, +z down)
    const angle = -yawRad;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size * 1.15, 0);
    ctx.lineTo(-size * 0.78, -size * 0.72);
    ctx.lineTo(-size * 0.42, 0);
    ctx.lineTo(-size * 0.78, size * 0.72);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  update(horseX, horseZ, horseYaw, cartX, cartZ, activeQuest, nearbyVillage) {
    this._frame++;
    if (this.locLabelEl) {
      this.locLabelEl.textContent = nearbyVillage
        ? `Desa ${villageLabel(nearbyVillage)}`
        : (Math.hypot(horseX, horseZ) < 16 ? 'Perkemahan' : 'Hutan & Jalan');
    }
    if (this.isOpen && this.coordLabelEl) {
      this.coordLabelEl.textContent = `X: ${Math.round(horseX)}m • Z: ${Math.round(horseZ)}m`;
    }

    if ((this._frame % 3 !== 0) && !this._drawFullMapNow) return;
    this._drawFullMapNow = false;

    const T = this._terrainSize();
    const villages = (this.world && Array.isArray(this.world.VILLAGES)) ? this.world.VILLAGES : [];
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);

    // 1) Top-right Minimap (cropped local 480m view centered on horse)
    if (this.miniCanvas && this._baseCanvas) {
      const ctx = this.miniCanvas.getContext('2d');
      const W = this.miniCanvas.width;
      const H = this.miniCanvas.height;
      const spanWorld = 520;
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

      const toMini = (wx, wz) => [
        ((wx - horseX + halfSpan) / spanWorld) * W,
        ((wz - horseZ + halfSpan) / spanWorld) * H,
      ];

      // Campfire point
      {
        const [fx, fy] = toMini(0, 0);
        if (fx >= -8 && fx <= W + 8 && fy >= -8 && fy <= H + 8) {
          ctx.fillStyle = '#ff9f1c';
          ctx.beginPath();
          ctx.arc(fx, fy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Active quest vector + target marker
      if (activeQuest) {
        const [qx, qy] = toMini(activeQuest.toX, activeQuest.toZ);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 214, 70, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(W * 0.5, H * 0.5);
        ctx.lineTo(qx, qy);
        ctx.stroke();
        ctx.restore();

        const pad = 11;
        const clampedX = Math.max(pad, Math.min(W - pad, qx));
        const clampedY = Math.max(pad, Math.min(H - pad, qy));
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(clampedX, clampedY, 5 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffb703';
        ctx.beginPath();
        ctx.arc(clampedX, clampedY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Villages inside/near minimap
      ctx.font = 'bold 9.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of villages) {
        const [vx, vy] = toMini(v.cx, v.cz);
        if (vx < -20 || vx > W + 20 || vy < -14 || vy > H + 14) continue;
        const isQuestDest = activeQuest && activeQuest.toId === v.id;
        ctx.fillStyle = isQuestDest ? '#ffd166' : '#fef3c7';
        ctx.beginPath();
        ctx.arc(vx, vy, isQuestDest ? 4.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const lbl = villageLabel(v);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillText(lbl, vx + 1, vy + 6);
        ctx.fillStyle = isQuestDest ? '#ffe066' : '#f8fafc';
        ctx.fillText(lbl, vx, vy + 5);
      }

      // Cart marker
      if (Number.isFinite(cartX) && Number.isFinite(cartZ)) {
        const [cx, cy] = toMini(cartX, cartZ);
        ctx.fillStyle = '#d97706';
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1.2;
        ctx.fillRect(cx - 2.6, cy - 2.6, 5.2, 5.2);
        ctx.strokeRect(cx - 2.6, cy - 2.6, 5.2, 5.2);
      }

      // Horse directional arrow at center
      this._drawArrow(ctx, W * 0.5, H * 0.5, horseYaw, 6.2, '#ffffff', '#0f172a');
    }

    // 2) Full World Map Modal (when open)
    if (this.isOpen && this.fullCanvas && this._baseCanvas) {
      const ctx = this.fullCanvas.getContext('2d');
      const W = this.fullCanvas.width;
      const H = this.fullCanvas.height;

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(this._baseCanvas, 0, 0, W, H);

      // Subtle grid lines every 300m
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let g = 1; g < 5; g++) {
        const p = (g / 5) * W;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
      }

      const toFull = (wx, wz) => [
        ((wx + T * 0.5) / T) * W,
        ((wz + T * 0.5) / T) * H,
      ];

      // Campfire icon
      {
        const [fx, fy] = toFull(0, 0);
        ctx.fillStyle = '#fb923c';
        ctx.beginPath(); ctx.arc(fx, fy, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff7ed';
        ctx.fillText('Kemah Awal', fx, fy + 16);
      }

      // Quest route line
      if (activeQuest) {
        const [hx, hy] = toFull(horseX, horseZ);
        const [qx, qy] = toFull(activeQuest.toX, activeQuest.toZ);
        ctx.save();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(qx, qy);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(qx, qy, 12 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // All 5 villages with crisp pills
      for (const v of villages) {
        const [vx, vy] = toFull(v.cx, v.cz);
        const isCurrent = nearbyVillage && nearbyVillage.id === v.id;
        const isDest = activeQuest && activeQuest.toId === v.id;
        ctx.fillStyle = isDest ? '#fbbf24' : isCurrent ? '#4ade80' : '#fef3c7';
        ctx.beginPath();
        ctx.arc(vx, vy, isDest || isCurrent ? 7.5 : 6.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.stroke();

        const lbl = villageLabel(v);
        ctx.font = '700 13px system-ui, sans-serif';
        const tw = ctx.measureText(lbl).width + 14;
        const bx = vx - tw * 0.5;
        const by = vy + 10;
        ctx.fillStyle = isDest ? 'rgba(180, 83, 9, 0.92)' : 'rgba(15, 23, 42, 0.84)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, tw, 20, 6);
        else ctx.rect(bx, by, tw, 20);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, vx, by + 10);
      }

      // Cart marker
      if (Number.isFinite(cartX) && Number.isFinite(cartZ)) {
        const [cx, cy] = toFull(cartX, cartZ);
        ctx.fillStyle = '#ea580c';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
        ctx.strokeRect(cx - 4, cy - 4, 8, 8);
      }

      // Player horse arrow
      const [px, py] = toFull(horseX, horseZ);
      this._drawArrow(ctx, px, py, horseYaw, 9.5, '#ffffff', '#0f172a');
    }
  }
}
