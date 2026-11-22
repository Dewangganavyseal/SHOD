import { HC } from './hc.js';
import {
  buildSmallBandit,
  buildBigBandit,
  animateSmallBandit,
  animateBigBandit,
} from './models/bandit_models.js';

const THREE = HC.THREE;

/* ============================================================================
   KRKAEN CART — FOREST MOBS, TACTICAL COMBAT AI, JUICY VFX & 3D HP BARS
   ----------------------------------------------------------------------------
   - Kelinci Voxel (Putih & Cokelat) + AI kabur alami saat didekati
   - Babi Hutan Voxel Pastel + pola serang ber-telegraph (seruduk & uppercut)
   - AI Bertarung NPC taktis (mengamati, berputar, membaca telegraph, menghindar,
     menyerang saat ada celah, lalu mundur menjaga jarak aman)
   - Efek VFX juicy (sabit tebasan, proyektil panah/sihir, hit-flash, hit-stop,
     squash-and-stretch, cincin kejut, angka damage/hindar, & HP bar 3D halus)
   ============================================================================ */

const unitCubeGeo = new THREE.BoxGeometry(1, 1, 1);

function damp(cur, tgt, lam, dt) {
  return THREE.MathUtils.lerp(cur, tgt, 1 - Math.exp(-lam * dt));
}
function dampAngle(cur, tgt, lam, dt) {
  let diff = ((tgt - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return cur + diff * (1 - Math.exp(-lam * dt));
}
function wrapAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function easeOutCubic(t) {
  const u = clamp(t, 0, 1);
  return 1 - Math.pow(1 - u, 3);
}
function easeInOutCubic(t) {
  const u = clamp(t, 0, 1);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}
function easeOutBack(t) {
  const u = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}
function randRange(min, max) {
  return min + Math.random() * (max - min);
}
function groundY(world, x, z) {
  if (!world) return 0;
  if (world.heightAt) return world.heightAt(x, z);
  if (world.terrainHeightAt) return world.terrainHeightAt(x, z);
  return 0;
}
function turnToward(cur, tgt, rate, dt) {
  const diff = wrapAngle(tgt - cur);
  const step = rate * dt;
  return Math.abs(diff) <= step ? tgt : cur + Math.sign(diff) * step;
}

const POND = { x: 8.2, z: 6.2, safeR: 5.05 };
const MAX_ROAM_R = 715.0;

function keepOutOfPondAndBounds(pos, world, radius) {
  const dP = Math.hypot(pos.x - POND.x, pos.z - POND.z);
  const minPond = POND.safeR + radius;
  if (dP < minPond && dP > 1e-4) {
    pos.x = POND.x + ((pos.x - POND.x) / dP) * minPond;
    pos.z = POND.z + ((pos.z - POND.z) / dP) * minPond;
  }
  const dO = Math.hypot(pos.x, pos.z);
  if (dO > MAX_ROAM_R) {
    pos.x = (pos.x / dO) * MAX_ROAM_R;
    pos.z = (pos.z / dO) * MAX_ROAM_R;
  }
  if (world && typeof world.resolveCircleCollision === 'function') {
    const res = world.resolveCircleCollision(pos.x, pos.z, radius);
    if (res.hit) {
      pos.x = res.x;
      pos.z = res.z;
    }
    return res;
  }
  return { hit: false, nx: 0, nz: 0 };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/* ============================================================================
   1. JUICY FLOATING 3D HP BAR (TRAILING DAMAGE, POP PULSE, COLOR GRADIENT)
   ============================================================================ */
class HealthBar3D {
  /** @param {THREE.Scene} scene @param {{ isEnemy?: boolean, label?: string, width?: number }} opts */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.isEnemy = !!opts.isEnemy;
    this.baseW = opts.width || 1.05;
    this.baseH = this.baseW * 0.23;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 30;
    this.ctx = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;

    this.mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.renderOrder = 26;
    this.sprite.visible = false;
    this.sprite.scale.set(this.baseW, this.baseH, 1);
    if (this.scene) this.scene.add(this.sprite);

    this.ratio = 1;
    this.trailRatio = 1;
    this.opacity = 0;
    this.fadeHold = 0;
    // Bar postur ("celah"): tipis, muncul di bawah HP selama bertarung.
    this.posture = 0;
    this.postureOn = false;
    this.shakeT = 0;
    this.popT = 0;
    this.flashT = 0;
    this._lastSig = '';
    this._redraw();
  }

  onHit() {
    this.shakeT = 0.24;
    this.popT = 0.28;
    this.flashT = 0.16;
    this.fadeHold = 4.2;
  }

  /** Bar postur: 0 = tenang, 1 = guard pecah / celah terbuka lebar. */
  setPosture(ratio, on) {
    const next = clamp(ratio || 0, 0, 1);
    const nextOn = !!on;
    if (Math.abs(next - this.posture) < 0.006 && nextOn === this.postureOn) return;
    this.posture = next;
    this.postureOn = nextOn;
    this._lastSig = '';
  }

  setHp(hp, maxHp, inCombat, dt) {
    const safeMax = Math.max(1, maxHp || 1);
    const nextRatio = clamp((hp ?? safeMax) / safeMax, 0, 1);
    if (nextRatio < this.ratio - 0.004) {
      this.fadeHold = 4.2;
    }
    this.ratio = nextRatio;

    if (this.trailRatio < this.ratio) {
      this.trailRatio = this.ratio;
    } else if (this.trailRatio > this.ratio) {
      const drop = Math.max(0.08, (this.trailRatio - this.ratio) * 2.4) * dt;
      this.trailRatio = Math.max(this.ratio, this.trailRatio - drop);
    }

    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.popT > 0) this.popT = Math.max(0, this.popT - dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (inCombat || (this.ratio < 0.995 && this.ratio > 0)) {
      this.fadeHold = Math.max(this.fadeHold, inCombat ? 2.8 : 1.5);
    } else if (this.fadeHold > 0) {
      this.fadeHold = Math.max(0, this.fadeHold - dt);
    }

    const wantAlpha = (inCombat || this.fadeHold > 0 || (this.ratio < 0.995 && this.ratio > 0))
      ? (this.ratio <= 0 ? 0.55 : 1.0)
      : 0.0;
    this.opacity = damp(this.opacity, wantAlpha, wantAlpha > this.opacity ? 18 : 5.5, dt);
    this.mat.opacity = this.opacity;
    this.sprite.visible = this.opacity > 0.025;

    if (this.sprite.visible) {
      const rQ = Math.round(this.ratio * 200);
      const tQ = Math.round(this.trailRatio * 200);
      const fQ = this.flashT > 0.01 ? 1 : 0;
      const pQ = Math.round(this.posture * 40) + (this.postureOn ? 1000 : 0);
      const sig = `${rQ}|${tQ}|${fQ}|${pQ}`;
      if (sig !== this._lastSig) {
        this._lastSig = sig;
        this._redraw();
      }
    }
  }

  _redraw() {
    const ctx = this.ctx;
    const W = 128, H = 30;
    ctx.clearRect(0, 0, W, H);

    const showPosture = this.postureOn || this.posture > 0.01;

    // Outer shadow pill
    ctx.fillStyle = 'rgba(24, 16, 14, 0.72)';
    drawRoundedRect(ctx, 4, 4, W - 8, H - 8, 9);
    ctx.fill();

    // Rim stroke (brighter during hit flash)
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.flashT > 0.01 ? 'rgba(255, 245, 220, 0.96)' : 'rgba(255, 246, 232, 0.42)';
    ctx.stroke();

    // Inner track (HP), menyisakan satu lajur tipis untuk postur
    const px = 8, py = 8, pw = W - 16, ph = showPosture ? 9 : 11;
    ctx.fillStyle = 'rgba(15, 11, 14, 0.82)';
    drawRoundedRect(ctx, px, py, pw, ph, 5);
    ctx.fill();

    // Delayed trail fill (juicy creamy-gold drain shadow)
    if (this.trailRatio > this.ratio + 0.005) {
      const tw = Math.max(4, pw * this.trailRatio);
      ctx.fillStyle = this.isEnemy ? '#ffe39f' : '#fff7d6';
      drawRoundedRect(ctx, px, py, tw, ph, 4);
      ctx.fill();
    }

    // Active HP fill with smooth gradient
    if (this.ratio > 0.004) {
      const hw = Math.max(5, pw * this.ratio);
      const grad = ctx.createLinearGradient(px, py, px + pw, py);
      if (this.isEnemy) {
        grad.addColorStop(0, '#e84148');
        grad.addColorStop(0.55, '#f26d52');
        grad.addColorStop(1, '#ff9f43');
      } else if (this.ratio > 0.5) {
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(1, '#6ee7b7');
      } else if (this.ratio > 0.26) {
        grad.addColorStop(0, '#f59e0b');
        grad.addColorStop(1, '#fde047');
      } else {
        grad.addColorStop(0, '#dc2626');
        grad.addColorStop(1, '#fb7185');
      }
      ctx.fillStyle = grad;
      drawRoundedRect(ctx, px, py, hw, ph, 4);
      ctx.fill();

      // Top glossy highlight band
      ctx.fillStyle = this.flashT > 0.01 ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.28)';
      drawRoundedRect(ctx, px + 1, py + 1, Math.max(3, hw - 2), Math.max(2, ph * 0.36), 3);
      ctx.fill();
    }

    // Lajur postur: makin penuh, makin dekat ke guard pecah
    if (showPosture) {
      const sy2 = py + ph + 2;
      const sh2 = 4.5;
      ctx.fillStyle = 'rgba(12, 10, 16, 0.86)';
      drawRoundedRect(ctx, px, sy2, pw, sh2, 2.2);
      ctx.fill();
      if (this.posture > 0.004) {
        const pgr = ctx.createLinearGradient(px, sy2, px + pw, sy2);
        pgr.addColorStop(0, '#d8c37a');
        pgr.addColorStop(1, '#fffdf4');
        ctx.fillStyle = pgr;
        drawRoundedRect(ctx, px, sy2, Math.max(2, pw * clamp(this.posture, 0, 1)), sh2, 2.2);
        ctx.fill();
      }
    }

    this.tex.needsUpdate = true;
  }

  updateTransform(x, y, z, _dt) {
    if (!this.sprite.visible) return;
    let sx = 0, sy = 0;
    let sc = 1.0;
    if (this.shakeT > 0) {
      sx = Math.sin(this.shakeT * 78) * 0.065 * (this.shakeT / 0.24);
      sy = Math.cos(this.shakeT * 62) * 0.03 * (this.shakeT / 0.24);
    }
    if (this.popT > 0) {
      const p = Math.sin((this.popT / 0.28) * Math.PI);
      sc += p * 0.24;
    }
    this.sprite.position.set(x + sx, y + sy, z);
    this.sprite.scale.set(this.baseW * sc, this.baseH * (1 + (sc - 1) * 0.8), 1);
  }

  hideNow() {
    this.opacity = 0;
    this.fadeHold = 0;
    this.mat.opacity = 0;
    this.sprite.visible = false;
  }

  dispose() {
    if (this.scene && this.sprite.parent === this.scene) {
      this.scene.remove(this.sprite);
    }
    this.mat.dispose();
    this.tex.dispose();
  }
}

HC.HealthBar3D = HealthBar3D;

/* ============================================================================
   2. JUICY COMBAT & MOB VFX SYSTEM
   ============================================================================ */
const DUST_PALETTE = [0xf2e4d5, 0xe8d5c0, 0xf7eee4, 0xdfc6ae];
const BINKY_PALETTE = [0xf7a8b8, 0xffd578, 0x9bd7c7, 0xf5b08e];
const CRUMB_PALETTE = [0xb5d9a8, 0xebd49b, 0xf2b59b, 0xd8c1a7];
const SPARK_PALETTE = [0xf5be4f, 0xf29076, 0x8ccab9, 0xffe48f];

function createVoxelStarGroup(mat) {
  const g = new THREE.Group();
  const bx = new THREE.Mesh(unitCubeGeo, mat); bx.scale.set(1.45, 0.46, 0.46);
  const by = new THREE.Mesh(unitCubeGeo, mat); by.scale.set(0.46, 1.65, 0.46);
  const bz = new THREE.Mesh(unitCubeGeo, mat); bz.scale.set(0.46, 0.46, 1.45);
  g.add(bx, by, bz);
  return g;
}

function createVoxelHeartMesh(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const coords = [
    [-1, 1], [1, 1],
    [-1.5, 0.3], [-0.5, 0.3], [0.5, 0.3], [1.5, 0.3],
    [-1, -0.5], [0, -0.5], [1, -0.5],
    [0, -1.3],
  ];
  for (const [x, y] of coords) {
    const b = new THREE.Mesh(unitCubeGeo, mat);
    b.position.set(x * 0.48, y * 0.48, 0);
    b.scale.set(0.5, 0.5, 0.45);
    g.add(b);
  }
  return { mesh: g, mat };
}

function createSleepyZMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x9fb3d9, transparent: true, opacity: 0.9 });
  const coords = [
    [-1, 1], [0, 1], [1, 1],
    [0, 0],
    [-1, -1], [0, -1], [1, -1],
  ];
  for (const [x, y] of coords) {
    const b = new THREE.Mesh(unitCubeGeo, mat);
    b.position.set(x * 0.34, y * 0.34, 0);
    b.scale.set(0.36, 0.36, 0.22);
    g.add(b);
  }
  return { mesh: g, mat };
}

function createSimpleArrowFallback() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6e4726 });
  const head = new THREE.MeshLambertMaterial({ color: 0xe4eef8 });
  const fletch = new THREE.MeshBasicMaterial({ color: 0xeee8d8 });
  const shaft = new THREE.Mesh(unitCubeGeo, wood); shaft.scale.set(0.032, 0.032, 0.76);
  const tip = new THREE.Mesh(unitCubeGeo, head); tip.scale.set(0.08, 0.025, 0.14); tip.position.z = 0.42;
  const feather = new THREE.Mesh(unitCubeGeo, fletch); feather.scale.set(0.1, 0.015, 0.16); feather.position.z = -0.3;
  g.add(shaft, tip, feather);
  return g;
}

class CombatVFX {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'forest-combat-vfx';
    if (this.scene) this.scene.add(this.group);

    this.particles = [];
    this.slashes = [];
    this.projectiles = [];
    this.popups = [];
    this.hitStopTimer = 0;

    this._streakGeo = new THREE.BoxGeometry(0.048, 0.048, 0.85);
    this._ringGeo = new THREE.RingGeometry(0.14, 0.23, 24);
  }

  triggerHitStop(sec = 0.045) {
    this.hitStopTimer = Math.max(this.hitStopTimer, Math.min(0.08, sec));
  }

  spawnDust(pos, vel, size = 0.12, life = 0.48, customColor = null) {
    if (this.particles.length > 160) return;
    const mat = new THREE.MeshStandardMaterial({
      color: customColor || DUST_PALETTE[Math.floor(Math.random() * DUST_PALETTE.length)],
      roughness: 0.9,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(unitCubeGeo, mat);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    mesh.scale.setScalar(size * 0.3);
    this.group.add(mesh);

    this.particles.push({
      type: 'dust',
      mesh, mat,
      vel: vel.clone(),
      rot: new THREE.Vector3(randRange(-4, 4), randRange(-4, 4), randRange(-4, 4)),
      age: 0, life, maxSize: size,
    });
  }

  spawnSparkStar(pos, vel, size = 0.095, life = 0.48, customColor = null) {
    if (this.particles.length > 160) return;
    const col = customColor || SPARK_PALETTE[Math.floor(Math.random() * SPARK_PALETTE.length)];
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1.0 });
    const mesh = Math.random() > 0.35 ? createVoxelStarGroup(mat) : new THREE.Mesh(unitCubeGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    this.group.add(mesh);

    this.particles.push({
      type: 'star',
      mesh, mat,
      vel: vel.clone(),
      rot: new THREE.Vector3(randRange(-9, 9), randRange(-9, 9), randRange(-9, 9)),
      age: 0, life, maxSize: size,
    });
  }

  spawnRing(pos, color = 0xffe48f, startRadius = 1.0, maxGrow = 4.2, life = 0.34, flat = true) {
    if (this.particles.length > 160) return;
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this._ringGeo, mat);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.scale.setScalar(startRadius);
    this.group.add(mesh);

    this.particles.push({
      type: 'ring',
      mesh, mat,
      flat,
      startScale: startRadius,
      vel: new THREE.Vector3(),
      rot: new THREE.Vector3(),
      age: 0, life, maxSize: maxGrow,
    });
  }

  spawnSpeedLine(pos, yaw) {
    if (this.particles.length > 160) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xe6cdb6, transparent: true, opacity: 0.65 });
    const g = new THREE.Group();
    const mainBar = new THREE.Mesh(this._streakGeo, mat);
    const tailCube = new THREE.Mesh(unitCubeGeo, mat);
    tailCube.scale.set(0.055, 0.055, 0.12);
    tailCube.position.z = -0.58;
    g.add(mainBar, tailCube);
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.group.add(g);

    const speed = 6.5 + Math.random() * 2.5;
    this.particles.push({
      type: 'streak',
      mesh: g, mat,
      vel: new THREE.Vector3(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed),
      rot: new THREE.Vector3(),
      age: 0, life: 0.24, maxSize: 1,
    });
  }

  /** Voxel crescent slash arc aligned around world yaw (+Z forward) */
  spawnSlashArc(origin, yaw, outerHex = 0xf49d6e, innerHex = 0xffe48f, dir = 1, scale = 1.0) {
    const group = new THREE.Group();
    group.position.copy(origin);
    group.position.x += Math.sin(yaw) * 0.42 * scale;
    group.position.z += Math.cos(yaw) * 0.42 * scale;
    group.position.y += 0.68;

    group.rotation.order = 'YXZ';
    group.rotation.y = yaw + dir * 0.35;
    group.rotation.x = -0.22;
    group.rotation.z = dir > 0 ? -0.45 : Math.PI + 0.45;
    if (dir < 0) group.scale.y = -1;

    const matOuter = new THREE.MeshBasicMaterial({ color: outerHex, transparent: true, opacity: 0.94, depthWrite: false });
    const matInner = new THREE.MeshBasicMaterial({ color: innerHex, transparent: true, opacity: 0.98, depthWrite: false });

    const steps = 13;
    const startA = -Math.PI * 0.56;
    const endA = Math.PI * 0.46;
    const rOuter = 0.82 * scale;
    const rInner = 0.66 * scale;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = THREE.MathUtils.lerp(startA, endA, t);
      const taper = Math.sin(t * Math.PI);
      const bs = (0.052 + taper * 0.098) * scale;

      const ob = new THREE.Mesh(unitCubeGeo, matOuter);
      ob.position.set(Math.cos(angle) * rOuter, Math.sin(angle) * rOuter, 0);
      ob.scale.set(bs, bs, bs * 0.65);
      ob.rotation.z = angle;
      group.add(ob);

      if (i >= 2 && i <= steps - 2) {
        const is = (0.04 + taper * 0.07) * scale;
        const ib = new THREE.Mesh(unitCubeGeo, matInner);
        ib.position.set(Math.cos(angle) * rInner, Math.sin(angle) * rInner, 0.025);
        ib.scale.set(is, is, is * 0.65);
        ib.rotation.z = angle;
        group.add(ib);
      }
    }

    this.group.add(group);
    this.slashes.push({
      group, matOuter, matInner, dir, scale,
      age: 0, life: 0.30, startRotZ: group.rotation.z,
    });

    const tipX = origin.x + Math.sin(yaw) * 0.72 * scale;
    const tipZ = origin.z + Math.cos(yaw) * 0.72 * scale;
    for (let i = 0; i < 7; i++) {
      this.spawnSparkStar(
        new THREE.Vector3(tipX + randRange(-0.25, 0.25), origin.y + randRange(0.45, 1.05), tipZ + randRange(-0.25, 0.25)),
        new THREE.Vector3(
          Math.sin(yaw) * randRange(0.9, 2.2) + randRange(-1.4, 1.4),
          randRange(1.2, 2.6),
          Math.cos(yaw) * randRange(0.9, 2.2) + randRange(-1.4, 1.4)
        ),
        randRange(0.065, 0.11) * scale,
        randRange(0.32, 0.50),
        i % 2 === 0 ? innerHex : outerHex
      );
    }
  }

  /** Juicy burst at hit contact: bright core cube + shockwave ring + star sparks */
  spawnHitImpact(pos, colorHex = 0xffe07d, isCrit = false) {
    // Core flash cube
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const flashCube = new THREE.Mesh(unitCubeGeo, flashMat);
    flashCube.position.copy(pos);
    flashCube.rotation.set(Math.random() * 2, Math.random() * 2, 0);
    const maxS = isCrit ? 0.54 : 0.36;
    flashCube.scale.setScalar(maxS);
    this.group.add(flashCube);
    this.particles.push({
      type: 'flash',
      mesh: flashCube, mat: flashMat,
      vel: new THREE.Vector3(),
      rot: new THREE.Vector3(6, 8, 5),
      age: 0, life: isCrit ? 0.20 : 0.14, maxSize: maxS,
    });

    this.spawnRing(pos, colorHex, isCrit ? 1.1 : 0.8, isCrit ? 5.6 : 3.8, isCrit ? 0.34 : 0.26, false);

    const n = isCrit ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + randRange(-0.25, 0.25);
      const spd = isCrit ? randRange(2.2, 4.2) : randRange(1.4, 3.0);
      this.spawnSparkStar(
        pos.clone().add(new THREE.Vector3(randRange(-0.15, 0.15), randRange(-0.1, 0.15), randRange(-0.15, 0.15))),
        new THREE.Vector3(Math.cos(a) * spd, randRange(1.4, 3.2), Math.sin(a) * spd),
        randRange(0.075, isCrit ? 0.14 : 0.11),
        randRange(0.35, 0.55),
        i % 3 === 0 ? 0xffffff : colorHex
      );
    }
  }

  /** Juicy dodge ring + directional dust trail */
  spawnDodgePuff(pos, moveDir) {
    const gyPos = new THREE.Vector3(pos.x, pos.y + 0.08, pos.z);
    this.spawnRing(gyPos, 0x9bd7c7, 0.85, 3.6, 0.32, true);
    for (let i = 0; i < 6; i++) {
      this.spawnDust(
        new THREE.Vector3(pos.x + randRange(-0.2, 0.2), pos.y + 0.12 + i * 0.05, pos.z + randRange(-0.2, 0.2)),
        new THREE.Vector3(-Math.sin(moveDir) * randRange(0.8, 2.0) + randRange(-0.4, 0.4), randRange(0.3, 1.0), -Math.cos(moveDir) * randRange(0.8, 2.0) + randRange(-0.4, 0.4)),
        randRange(0.09, 0.14),
        0.38,
        i % 2 === 0 ? 0xc7efe2 : 0xf4eee4
      );
    }
  }

  /**
   * Kilauan tangkisan (deflect) ala Sekiro: kilat putih-gold di titik kontak,
   * cincin tajam yang mengecil cepat, lalu bintang kecil berhamburan.
   * Sengaja lebih "bersih" dan lebih singkat daripada hit impact biasa.
   */
  spawnDeflectSpark(pos, colorHex = 0xfff2c4) {
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    const core = new THREE.Mesh(unitCubeGeo, flashMat);
    core.position.copy(pos);
    core.rotation.set(Math.random() * 2, Math.random() * 2, 0);
    const maxS = 0.30;
    core.scale.setScalar(maxS);
    this.group.add(core);
    this.particles.push({
      type: 'flash',
      mesh: core, mat: flashMat,
      vel: new THREE.Vector3(),
      rot: new THREE.Vector3(10, 14, 8),
      age: 0, life: 0.12, maxSize: maxS,
    });

    this.spawnRing(pos, colorHex, 0.55, 2.6, 0.22, false);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + randRange(-0.2, 0.2);
      this.spawnSparkStar(
        pos.clone().add(new THREE.Vector3(randRange(-0.08, 0.08), randRange(-0.08, 0.08), randRange(-0.08, 0.08))),
        new THREE.Vector3(Math.cos(a) * randRange(1.6, 2.8), randRange(0.6, 1.8), Math.sin(a) * randRange(1.6, 2.8)),
        randRange(0.05, 0.085),
        randRange(0.22, 0.34),
        i % 2 === 0 ? 0xffffff : colorHex
      );
    }
  }

  /** Juicy floating damage / callout text sprite */
  spawnDamageText(pos, text, style = 'normal') {
    if (this.popups.length > 28) return;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const palettes = {
      normal: { fill: '#fff8e8', stroke: '#3a241c', size: 32 },
      crit:   { fill: '#ffd447', stroke: '#6b1d14', size: 36 },
      npcHit: { fill: '#ff7a7a', stroke: '#4a151b', size: 32 },
      dodge:  { fill: '#8cf0d2', stroke: '#123e36', size: 28 },
      counter:{ fill: '#7ee8ff', stroke: '#153459', size: 34 },
      heal:   { fill: '#7bed9f', stroke: '#184e2d', size: 28 },
    };
    const pal = palettes[style] || palettes.normal;

    ctx.font = `900 ${pal.size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = pal.stroke;
    ctx.strokeText(text, 80, 34);
    ctx.fillStyle = pal.fill;
    ctx.fillText(text, 80, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 30;
    sprite.position.set(pos.x + randRange(-0.22, 0.22), pos.y + randRange(0.1, 0.35), pos.z + randRange(-0.22, 0.22));
    const baseW = style === 'crit' || style === 'counter' ? 1.55 : 1.25;
    const baseH = baseW * 0.40;
    sprite.scale.set(0.01, 0.01, 1);
    this.group.add(sprite);

    this.popups.push({
      sprite, mat, tex, baseW, baseH,
      vel: new THREE.Vector3(randRange(-0.45, 0.45), style === 'crit' ? 2.4 : 1.85, randRange(-0.45, 0.45)),
      age: 0, life: style === 'crit' || style === 'dodge' ? 0.95 : 0.80,
    });
  }

  /** Spawns 3D voxel arrow or magic orb flying toward a mob */
  spawnProjectile(opts) {
    const { start, target, speed = 15.5, kind = 'arrow', color = 0xffe48f, onHit } = opts;
    let mesh;
    if (kind === 'arrow') {
      if (window.NPC_Hunter && typeof window.NPC_Hunter.buildArrowMesh === 'function') {
        mesh = window.NPC_Hunter.buildArrowMesh();
        mesh.scale.setScalar(1.25);
      } else {
        mesh = createSimpleArrowFallback();
      }
    } else {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color });
      const core = new THREE.Mesh(unitCubeGeo, mat);
      core.scale.setScalar(0.24);
      const aura = new THREE.Mesh(unitCubeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }));
      aura.scale.setScalar(0.14);
      g.add(core, aura);
      mesh = g;
    }
    mesh.position.copy(start);
    this.group.add(mesh);

    this.projectiles.push({
      mesh, target, kind, color, speed,
      age: 0, maxLife: 1.8, trailT: 0, onHit,
    });
  }

  spawnThumpWave(pos) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.spawnDust(
        new THREE.Vector3(pos.x + Math.cos(a) * 0.18, pos.y + 0.06, pos.z + Math.sin(a) * 0.18),
        new THREE.Vector3(Math.cos(a) * randRange(1.4, 2.1), randRange(0.45, 0.85), Math.sin(a) * randRange(1.4, 2.1)),
        randRange(0.08, 0.12),
        0.50
      );
    }
    this.spawnRing(new THREE.Vector3(pos.x, pos.y + 0.025, pos.z), 0xd9bfa5, 1.0, 4.0, 0.45, true);
  }

  spawnBinkyBurst(pos) {
    for (let i = 0; i < 8; i++) {
      const color = BINKY_PALETTE[i % BINKY_PALETTE.length];
      const isHeart = i % 2 === 0;
      let mesh, mat;
      if (isHeart) {
        ({ mesh, mat } = createVoxelHeartMesh(color));
      } else {
        mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
        mesh = createVoxelStarGroup(mat);
      }
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      mesh.position.set(pos.x + Math.cos(angle) * 0.16, pos.y + 0.55, pos.z + Math.sin(angle) * 0.16);
      const maxSize = isHeart ? 0.085 : 0.075;
      mesh.scale.setScalar(maxSize * 0.3);
      this.group.add(mesh);
      this.particles.push({
        type: 'joy',
        mesh, mat,
        vel: new THREE.Vector3(Math.cos(angle) * randRange(0.7, 1.4), randRange(1.1, 2.0), Math.sin(angle) * randRange(0.7, 1.4)),
        rot: new THREE.Vector3(randRange(-3, 3), randRange(-5, 5), randRange(-3, 3)),
        age: 0, life: randRange(0.65, 0.92), maxSize,
      });
    }
  }

  spawnNibbleCrumb(pos) {
    if (this.particles.length > 160) return;
    const mat = new THREE.MeshStandardMaterial({
      color: CRUMB_PALETTE[Math.floor(Math.random() * CRUMB_PALETTE.length)],
      roughness: 0.85,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(unitCubeGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.036);
    this.group.add(mesh);
    this.particles.push({
      type: 'crumb',
      mesh, mat,
      vel: new THREE.Vector3(randRange(-0.45, 0.45), randRange(0.55, 1.05), randRange(-0.45, 0.45)),
      rot: new THREE.Vector3(randRange(-8, 8), randRange(-8, 8), randRange(-8, 8)),
      age: 0, life: 0.42, maxSize: 0.036,
    });
  }

  spawnSleepyZ(pos) {
    if (this.particles.length > 160) return;
    const { mesh, mat } = createSleepyZMesh();
    mesh.position.set(pos.x + randRange(-0.08, 0.08), pos.y + 0.42, pos.z + randRange(-0.08, 0.08));
    mesh.scale.setScalar(0.02);
    this.group.add(mesh);
    this.particles.push({
      type: 'sleepz',
      mesh, mat,
      vel: new THREE.Vector3(randRange(-0.12, 0.12), 0.42, randRange(-0.12, 0.12)),
      rot: new THREE.Vector3(),
      age: 0, life: 1.45, maxSize: 0.10,
    });
  }

  playSfx(kind = 'hit') {
    const w = this.world;
    if (!w || !w._isAudioPlaying || !w._audioCtx) return;
    try {
      const ac = w._audioCtx;
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      if (kind === 'crit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      } else if (kind === 'parry') {
        // "TING" bersih: dua nada pendek naik, tanpa desis — beda jelas dari hit
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      } else if (kind === 'dodge') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);
        g.gain.setValueAtTime(0.045, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
      } else if (kind === 'bow') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(190, now + 0.08);
        g.gain.setValueAtTime(0.04, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);
        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
      }
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (_e) { /* no-op */ }
  }

  update(dt, camera) {
    if (this.hitStopTimer > 0) this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);

    // 1. Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.group.remove(p.mesh);
        if (p.mat) p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      if (p.type === 'dust') {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.exp(-3.2 * dt));
        p.vel.y += 0.38 * dt;
        p.mesh.rotation.x += p.rot.x * dt;
        p.mesh.rotation.y += p.rot.y * dt;
        const grow = t < 0.22 ? easeOutCubic(t / 0.22) : 1 - easeInOutCubic((t - 0.22) / 0.78);
        p.mesh.scale.setScalar(Math.max(0.001, p.maxSize * grow));
        p.mat.opacity = 0.88 * (1 - t * t);
      } else if (p.type === 'star') {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.exp(-4.0 * dt));
        p.vel.y -= 2.4 * dt;
        p.mesh.rotation.x += p.rot.x * dt;
        p.mesh.rotation.y += p.rot.y * dt;
        p.mesh.scale.setScalar(Math.max(0.001, p.maxSize * (1 - t)));
        p.mat.opacity = 1 - Math.pow(t, 1.5);
      } else if (p.type === 'flash') {
        p.mesh.rotation.x += p.rot.x * dt;
        p.mesh.rotation.y += p.rot.y * dt;
        p.mesh.scale.setScalar(Math.max(0.001, p.maxSize * (1 + t * 0.45)));
        p.mat.opacity = 0.95 * (1 - t);
      } else if (p.type === 'ring') {
        const s = (p.startScale || 1) + easeOutCubic(t) * p.maxSize;
        p.mesh.scale.setScalar(s);
        if (!p.flat && camera) p.mesh.quaternion.copy(camera.quaternion);
        p.mat.opacity = 0.82 * (1 - t);
      } else if (p.type === 'streak') {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mat.opacity = 0.65 * Math.sin(t * Math.PI);
      } else if (p.type === 'joy') {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.exp(-2.8 * dt));
        p.vel.y -= 1.35 * dt;
        p.mesh.rotation.y += p.rot.y * dt;
        const grow = t < 0.2 ? easeOutCubic(t / 0.2) : 1 - Math.pow((t - 0.2) / 0.8, 1.6);
        p.mesh.scale.setScalar(Math.max(0.001, p.maxSize * grow));
        p.mat.opacity = 1 - Math.pow(t, 1.8);
      } else if (p.type === 'crumb') {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 3.6 * dt;
        p.mesh.rotation.x += p.rot.x * dt;
        p.mesh.scale.setScalar(Math.max(0.001, p.maxSize * (1 - t)));
        p.mat.opacity = 1 - t;
      } else if (p.type === 'sleepz') {
        p.mesh.position.addScaledVector(p.vel, dt);
        if (camera) p.mesh.quaternion.copy(camera.quaternion);
        const grow = t < 0.25 ? easeOutCubic(t / 0.25) : 1 - Math.pow((t - 0.25) / 0.75, 2);
        p.mesh.scale.setScalar(Math.max(0.001, p.maxSize * grow));
        p.mat.opacity = 0.88 * Math.sin(t * Math.PI);
      }
    }

    // 2. Crescent slash arcs
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) {
        this.group.remove(s.group);
        s.matOuter.dispose();
        s.matInner.dispose();
        this.slashes.splice(i, 1);
        continue;
      }
      const sweep = easeOutCubic(t);
      s.group.rotation.z = s.startRotZ + s.dir * sweep * 1.15;
      const sf = 0.72 + sweep * 0.62;
      s.group.scale.x = sf;
      s.group.scale.y = (s.dir < 0 ? -1 : 1) * sf;
      const alpha = 1 - Math.pow(t, 1.35);
      s.matOuter.opacity = 0.94 * alpha;
      s.matInner.opacity = 0.98 * alpha;
    }

    // 3. Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age += dt;
      if (pr.age >= pr.maxLife || !pr.target || pr.target.dead) {
        this.group.remove(pr.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      const tx = pr.target.x;
      const tz = pr.target.z;
      const ty = pr.target.y + 0.62;
      const dx = tx - pr.mesh.position.x;
      const dy = ty - pr.mesh.position.y;
      const dz = tz - pr.mesh.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = pr.speed * dt;
      if (dist <= Math.max(0.55, step + 0.25)) {
        if (typeof pr.onHit === 'function') pr.onHit(new THREE.Vector3(tx, ty, tz));
        this.group.remove(pr.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      pr.mesh.position.x += (dx / dist) * step;
      pr.mesh.position.y += (dy / dist) * step;
      pr.mesh.position.z += (dz / dist) * step;
      pr.mesh.lookAt(tx, ty, tz);

      pr.trailT += dt;
      if (pr.trailT >= 0.045) {
        pr.trailT = 0;
        if (pr.kind === 'arrow') {
          this.spawnDust(pr.mesh.position.clone(), new THREE.Vector3(0, 0.25, 0), 0.055, 0.20, 0xf7f2e8);
        } else {
          this.spawnSparkStar(pr.mesh.position.clone(), new THREE.Vector3(randRange(-0.4, 0.4), randRange(0.2, 0.7), randRange(-0.4, 0.4)), 0.065, 0.22, pr.color);
        }
      }
    }

    // 4. Floating damage popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pp = this.popups[i];
      pp.age += dt;
      const t = pp.age / pp.life;
      if (t >= 1) {
        this.group.remove(pp.sprite);
        pp.mat.dispose();
        pp.tex.dispose();
        this.popups.splice(i, 1);
        continue;
      }
      pp.sprite.position.addScaledVector(pp.vel, dt);
      pp.vel.y -= 3.2 * dt;
      pp.vel.x *= Math.exp(-3.5 * dt);
      pp.vel.z *= Math.exp(-3.5 * dt);
      const pop = t < 0.18 ? easeOutBack(t / 0.18) : 1.0 - Math.max(0, t - 0.65) * 0.45;
      pp.sprite.scale.set(pp.baseW * pop, pp.baseH * pop, 1);
      pp.mat.opacity = t > 0.55 ? 1 - ((t - 0.55) / 0.45) : 1;
    }
  }
}

HC.CombatVFX = CombatVFX;

/* ============================================================================
   3. KELINCI VOXEL PUTIH & COKELAT (FIDELITY PORT + FLEE AI)
   ============================================================================ */
const RABBIT_PALETTE_WHITE = {
  id: 'white',
  label: 'Kelinci Putih',
  furMain: 0xfaf7f2, furMid: 0xefe8dc, furDeep: 0xe5dacb, furBelly: 0xfffdf9,
  tailWhite: 0xffffff, innerEar: 0xf4b4b4, nosePink: 0xe89696, cheekBlush: 0xf9c8c8,
  eyeColor: 0x3d2a24, eyelidColor: 0xebe2d5, whiskerColor: 0xdfd2c2, pawPad: 0xf2bebe,
};
const RABBIT_PALETTE_BROWN = {
  id: 'brown',
  label: 'Kelinci Cokelat',
  furMain: 0xa67453, furMid: 0xc4926b, furDeep: 0x7d5338, furBelly: 0xf5ead8,
  tailWhite: 0xfaf3e8, innerEar: 0xe8a498, nosePink: 0xd98a7e, cheekBlush: 0xf2aba0,
  eyeColor: 0x2e1e17, eyelidColor: 0x946446, whiskerColor: 0xc9b29e, pawPad: 0xe5b0a5,
};

const RV = 0.052;
const RBODY_BASE_Y = 5.4 * RV;

function createRabbitMaterials(pal) {
  return {
    furMain: new THREE.MeshStandardMaterial({ color: pal.furMain, roughness: 0.86, metalness: 0.0 }),
    furMid: new THREE.MeshStandardMaterial({ color: pal.furMid, roughness: 0.87, metalness: 0.0 }),
    furDeep: new THREE.MeshStandardMaterial({ color: pal.furDeep, roughness: 0.88, metalness: 0.0 }),
    furBelly: new THREE.MeshStandardMaterial({ color: pal.furBelly, roughness: 0.86, metalness: 0.0 }),
    tailWhite: new THREE.MeshStandardMaterial({ color: pal.tailWhite, roughness: 0.85, metalness: 0.0 }),
    innerEar: new THREE.MeshStandardMaterial({ color: pal.innerEar, roughness: 0.78, metalness: 0.0 }),
    nosePink: new THREE.MeshStandardMaterial({ color: pal.nosePink, roughness: 0.72, metalness: 0.0 }),
    cheekBlush: new THREE.MeshStandardMaterial({ color: pal.cheekBlush, roughness: 0.84, metalness: 0.0 }),
    eyeColor: new THREE.MeshStandardMaterial({ color: pal.eyeColor, roughness: 0.14, metalness: 0.04 }),
    eyeShine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    eyelid: new THREE.MeshStandardMaterial({ color: pal.eyelidColor, roughness: 0.86, metalness: 0.0 }),
    whisker: new THREE.MeshStandardMaterial({ color: pal.whiskerColor, roughness: 0.75, metalness: 0.0 }),
    pawPad: new THREE.MeshStandardMaterial({ color: pal.pawPad, roughness: 0.82, metalness: 0.0 }),
  };
}

function addRabbitVoxel(parent, gx, gy, gz, sx, sy, sz, mat, cast = true, receive = true) {
  const mesh = new THREE.Mesh(unitCubeGeo, mat);
  mesh.position.set(gx * RV, gy * RV, gz * RV);
  mesh.scale.set(sx * RV, sy * RV, sz * RV);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function buildVoxelRabbitRig(palette, scene) {
  const m = createRabbitMaterials(palette);
  const rig = {
    palette,
    root: new THREE.Group(),
    squash: new THREE.Group(),
    body: new THREE.Group(),
    head: new THREE.Group(),
    snout: new THREE.Group(),
    eyelids: { L: new THREE.Group(), R: new THREE.Group() },
    ears: {
      L: { base: new THREE.Group(), tip: new THREE.Group() },
      R: { base: new THREE.Group(), tip: new THREE.Group() },
    },
    hindLegs: {
      L: { thigh: new THREE.Group(), hock: new THREE.Group(), foot: new THREE.Group() },
      R: { thigh: new THREE.Group(), hock: new THREE.Group(), foot: new THREE.Group() },
    },
    frontLegs: {
      L: { upper: new THREE.Group(), fore: new THREE.Group() },
      R: { upper: new THREE.Group(), fore: new THREE.Group() },
    },
    tail: new THREE.Group(),
    noseTipAnchor: new THREE.Object3D(),
  };

  rig.root.scale.setScalar(1.08);
  rig.root.add(rig.squash);
  rig.body.position.set(0, RBODY_BASE_Y, 0);
  rig.squash.add(rig.body);

  // Pear-shaped torso
  addRabbitVoxel(rig.body, 0, 0.35, -1.6, 6.8, 5.6, 6.2, m.furMain);
  addRabbitVoxel(rig.body, 0, 3.35, -1.5, 5.2, 0.85, 5.0, m.furMid);
  addRabbitVoxel(rig.body, 0, 3.8, -1.6, 3.4, 0.45, 3.6, m.furMain);
  addRabbitVoxel(rig.body, 0, 0.1, -4.95, 5.2, 4.3, 0.9, m.furMid);

  addRabbitVoxel(rig.body, 0, 0.55, 2.3, 5.4, 4.9, 3.8, m.furMain);
  addRabbitVoxel(rig.body, 0, 3.15, 2.0, 4.0, 0.7, 3.0, m.furMain);
  addRabbitVoxel(rig.body, 0, -0.8, 4.2, 4.0, 2.6, 1.1, m.furBelly, false, true);
  addRabbitVoxel(rig.body, 0, -1.4, 4.65, 2.8, 1.6, 0.6, m.furBelly, false, true);

  addRabbitVoxel(rig.body, 0, -2.55, -0.5, 5.4, 0.95, 7.2, m.furBelly, false, true);
  addRabbitVoxel(rig.body, 0, -3.05, -0.7, 4.0, 0.45, 5.6, m.furBelly, false, true);

  for (const s of [-1, 1]) {
    addRabbitVoxel(rig.body, s * 3.65, 0.0, -1.7, 0.85, 4.3, 4.8, m.furMid);
    addRabbitVoxel(rig.body, s * 2.95, 0.4, 2.1, 0.65, 3.7, 3.0, m.furMain);
    addRabbitVoxel(rig.body, s * 4.05, 1.1, -2.1, 0.28, 1.4, 2.0, m.furDeep, false, true);
    addRabbitVoxel(rig.body, s * 2.4, 3.45, -0.4, 1.2, 0.4, 2.0, m.furDeep, false, true);
    addRabbitVoxel(rig.body, s * 2.2, 3.2, 2.2, 1.0, 0.35, 1.4, m.furMid, false, true);
  }

  // Head
  rig.head.position.set(0, 2.55 * RV, 4.05 * RV);
  rig.body.add(rig.head);
  addRabbitVoxel(rig.head, 0, -1.65, -0.7, 4.0, 1.8, 3.0, m.furMid);
  addRabbitVoxel(rig.head, 0, 0.45, 0.7, 5.8, 4.9, 5.2, m.furMain);
  addRabbitVoxel(rig.head, 0, 3.15, 0.4, 4.5, 0.75, 4.2, m.furMain);
  addRabbitVoxel(rig.head, 0, 3.55, 0.3, 3.1, 0.35, 3.0, m.furMid);
  addRabbitVoxel(rig.head, 0, 0.35, -2.05, 4.6, 3.9, 0.85, m.furMid);
  addRabbitVoxel(rig.head, 0, -2.1, 1.0, 4.2, 0.75, 3.8, m.furBelly, false, true);

  for (const s of [-1, 1]) {
    addRabbitVoxel(rig.head, s * 3.15, -0.35, 0.85, 0.75, 3.3, 3.8, m.furMain);
    addRabbitVoxel(rig.head, s * 3.55, -0.9, 1.1, 0.45, 2.0, 2.6, m.furMid);
    addRabbitVoxel(rig.head, s * 2.85, -0.6, 3.15, 0.95, 0.65, 0.25, m.cheekBlush, false, false);
    addRabbitVoxel(rig.head, s * 3.38, -0.75, 2.35, 0.25, 0.7, 1.0, m.cheekBlush, false, false);
  }

  // Twitching snout + nose
  rig.snout.position.set(0, -0.45 * RV, 3.25 * RV);
  rig.head.add(rig.snout);
  addRabbitVoxel(rig.snout, -0.85, -0.35, 0.45, 1.65, 1.55, 1.35, m.furBelly);
  addRabbitVoxel(rig.snout, 0.85, -0.35, 0.45, 1.65, 1.55, 1.35, m.furBelly);
  addRabbitVoxel(rig.snout, 0, 0.15, 0.35, 2.8, 1.25, 1.25, m.furMain);
  addRabbitVoxel(rig.snout, 0, 0.3, 1.15, 1.25, 0.72, 0.45, m.nosePink, false, false);
  addRabbitVoxel(rig.snout, 0, -0.1, 1.12, 0.65, 0.48, 0.42, m.nosePink, false, false);
  for (const s of [-1, 1]) {
    addRabbitVoxel(rig.snout, s * 2.25, -0.1, 0.65, 1.6, 0.16, 0.16, m.whisker, false, false);
    addRabbitVoxel(rig.snout, s * 2.15, -0.55, 0.6, 1.45, 0.16, 0.16, m.whisker, false, false);
  }
  rig.noseTipAnchor.position.set(0, 0, 1.4 * RV);
  rig.snout.add(rig.noseTipAnchor);

  // Eyes + eyelids
  for (const { key, s } of [{ key: 'L', s: 1 }, { key: 'R', s: -1 }]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(s * 2.55 * RV, 0.85 * RV, 2.65 * RV);
    eyeSocket.rotation.y = s * 0.34;
    rig.head.add(eyeSocket);

    addRabbitVoxel(eyeSocket, 0, 0, 0.25, 1.35, 1.48, 0.42, m.eyeColor, false, false);
    addRabbitVoxel(eyeSocket, -s * 0.3, 0.36, 0.46, 0.48, 0.48, 0.14, m.eyeShine, false, false);
    addRabbitVoxel(eyeSocket, s * 0.32, -0.34, 0.46, 0.26, 0.26, 0.12, m.eyeShine, false, false);

    const lid = rig.eyelids[key];
    lid.position.set(0, 0.78 * RV, 0.42 * RV);
    addRabbitVoxel(lid, 0, -0.76, 0, 1.52, 1.56, 0.3, m.eyelid, false, false);
    addRabbitVoxel(lid, 0, -1.48, 0.05, 1.54, 0.22, 0.32, m.furDeep, false, false);
    lid.scale.y = 0.001;
    eyeSocket.add(lid);
  }

  // 2-segment ears
  for (const { key, s } of [{ key: 'L', s: 1 }, { key: 'R', s: -1 }]) {
    const base = rig.ears[key].base;
    base.position.set(s * 1.65 * RV, 3.15 * RV, -0.35 * RV);
    rig.head.add(base);
    addRabbitVoxel(base, 0, 1.9, 0, 1.9, 4.0, 1.05, m.furMain);
    addRabbitVoxel(base, 0, 2.1, -0.4, 1.5, 3.6, 0.45, m.furMid);
    addRabbitVoxel(base, 0, 2.1, 0.42, 1.15, 3.4, 0.32, m.innerEar, false, true);

    const tip = rig.ears[key].tip;
    tip.position.set(0, 3.85 * RV, 0);
    base.add(tip);
    addRabbitVoxel(tip, 0, 1.55, 0, 1.75, 3.2, 0.92, m.furMain);
    addRabbitVoxel(tip, 0, 3.45, 0, 1.3, 1.0, 0.78, m.furMid);
    addRabbitVoxel(tip, 0, 4.15, 0, 0.85, 0.55, 0.65, m.furDeep);
    addRabbitVoxel(tip, 0, 1.45, 0.36, 1.0, 2.8, 0.28, m.innerEar, false, true);
  }

  // 3-segment hind legs
  for (const { key, s } of [{ key: 'L', s: 1 }, { key: 'R', s: -1 }]) {
    const leg = rig.hindLegs[key];
    leg.thigh.position.set(s * 3.15 * RV, -0.5 * RV, -2.05 * RV);
    rig.body.add(leg.thigh);
    addRabbitVoxel(leg.thigh, s * 0.25, -1.0, 0.0, 2.35, 3.8, 3.7, m.furMain);
    addRabbitVoxel(leg.thigh, s * 0.65, -0.8, -0.1, 1.75, 2.8, 2.8, m.furMid);
    addRabbitVoxel(leg.thigh, s * 0.25, -2.45, -0.65, 1.9, 1.25, 2.3, m.furDeep);

    leg.hock.position.set(s * 0.15 * RV, -2.2 * RV, -1.1 * RV);
    leg.thigh.add(leg.hock);
    addRabbitVoxel(leg.hock, 0, -0.9, 0.2, 1.65, 2.2, 1.65, m.furMain);

    leg.foot.position.set(0, -1.7 * RV, 0.3 * RV);
    leg.hock.add(leg.foot);
    addRabbitVoxel(leg.foot, 0, -0.5, 1.55, 1.9, 1.0, 4.3, m.furBelly);
    addRabbitVoxel(leg.foot, 0, -0.35, 0.6, 1.85, 0.95, 2.2, m.furMain);
    addRabbitVoxel(leg.foot, -0.6, -0.55, 3.8, 0.55, 0.85, 0.7, m.furBelly);
    addRabbitVoxel(leg.foot, 0.0, -0.55, 3.95, 0.58, 0.85, 0.8, m.furBelly);
    addRabbitVoxel(leg.foot, 0.6, -0.55, 3.8, 0.55, 0.85, 0.7, m.furBelly);
    addRabbitVoxel(leg.foot, 0, -0.95, 1.75, 1.2, 0.14, 2.6, m.pawPad, false, false);
  }

  // 2-segment front legs
  for (const { key, s } of [{ key: 'L', s: 1 }, { key: 'R', s: -1 }]) {
    const arm = rig.frontLegs[key];
    arm.upper.position.set(s * 2.05 * RV, -0.9 * RV, 2.95 * RV);
    rig.body.add(arm.upper);
    addRabbitVoxel(arm.upper, 0, -1.05, 0, 1.55, 2.5, 1.55, m.furMain);

    arm.fore.position.set(0, -2.2 * RV, 0.05 * RV);
    arm.upper.add(arm.fore);
    addRabbitVoxel(arm.fore, 0, -0.85, 0.1, 1.4, 1.9, 1.4, m.furMid);
    addRabbitVoxel(arm.fore, 0, -1.85, 0.5, 1.48, 0.9, 1.95, m.furBelly);
    addRabbitVoxel(arm.fore, 0, -2.26, 0.65, 0.95, 0.12, 1.1, m.pawPad, false, false);
  }

  // Fluffy cotton tail
  rig.tail.position.set(0, 0.35 * RV, -5.15 * RV);
  rig.body.add(rig.tail);
  addRabbitVoxel(rig.tail, 0, 0.35, -0.95, 2.4, 2.35, 2.25, m.tailWhite);
  addRabbitVoxel(rig.tail, 0, 0.65, -0.65, 1.9, 1.5, 1.6, m.furMid);
  addRabbitVoxel(rig.tail, 0, 0.25, -1.65, 1.8, 1.8, 1.1, m.tailWhite);
  addRabbitVoxel(rig.tail, 0, 0.55, -0.95, 2.75, 1.55, 1.55, m.tailWhite);
  addRabbitVoxel(rig.tail, 0, 1.45, -1.05, 1.55, 0.85, 1.5, m.tailWhite);

  if (scene) scene.add(rig.root);
  return rig;
}

function createEmptyRabbitPose() {
  return {
    bodyY: RBODY_BASE_Y, bodyRotX: 0, bodyRotY: 0, bodyRotZ: 0,
    squashX: 1, squashY: 1, squashZ: 1,
    headRotX: 0, headRotY: 0, headRotZ: 0,
    headPosY: 2.55 * RV, headPosZ: 4.05 * RV,
    earLBaseX: -0.08, earLBaseY: 0.12, earLBaseZ: 0.14, earLTipX: 0.08,
    earRBaseX: -0.08, earRBaseY: -0.12, earRBaseZ: -0.14, earRTipX: 0.08,
    thighLX: 0, thighRX: 0, thighLZ: 0, thighRZ: 0,
    hockLX: 0, hockRX: 0, footLX: 0, footRX: 0,
    armLX: 0, armRX: 0, armLZ: 0, armRZ: 0,
    foreLX: 0, foreRX: 0, foreLZ: 0, foreRZ: 0,
    tailRotX: 0, tailRotY: 0, lidClosed: 0.001, noseRate: 1.0, lambda: 12,
  };
}

class RabbitMob {
  constructor(scene, world, vfx, palette, homeX, homeZ, yaw = 0) {
    this.kind = 'rabbit';
    this.variant = palette.id;
    this.world = world;
    this.vfx = vfx;
    this.rig = buildVoxelRabbitRig(palette, scene);
    this.homeX = homeX;
    this.homeZ = homeZ;
    this.x = homeX;
    this.z = homeZ;
    this.y = groundY(world, homeX, homeZ);
    this.heading = yaw;
    this.targetHeading = yaw;

    this.behavior = 'idle';
    this.state = 'idle';
    this.stateTime = randRange(0, 0.8);
    this.duration = randRange(2.4, 5.2);
    this.phaseOffset = Math.random() * 10;
    this.pose = createEmptyRabbitPose();

    this.earRadarL = { targetY: 0.15, curY: 0.15, timer: randRange(0.8, 2.5) };
    this.earRadarR = { targetY: -0.15, curY: -0.15, timer: randRange(1.0, 2.8) };
    this.blinkTimer = randRange(1.5, 3.8);
    this.blinkRemain = 0;
    this.dustCooldown = 0;
    this.zTimer = 0;
    this.crumbTimer = 0;
    this.binkyBurstCycle = -1;
    this.thumpCycleDone = -1;
    this.hopCyclePuff = -1;
    this.groomEarSide = Math.random() > 0.5 ? 1 : -1;

    this.fleeTimer = 0;
    this.alertCooldown = 0;
    this.wallSlideT = 0;
    this.wallSlideAng = yaw;
    this.zigPhase = randRange(0, Math.PI * 2);

    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = this.heading;
  }

  setBehavior(next, duration = null) {
    this.behavior = next;
    this.state = next === 'run' ? 'flee' : next;
    this.stateTime = 0;
    const table = {
      idle: [2.2, 4.5], hop: [2.4, 4.8], run: [1.8, 3.2], periscope: [2.0, 3.8],
      groom: [4.2, 5.6], forage: [2.8, 5.0], binky: [1.4, 2.4], thump: [1.8, 2.3], loaf: [4.5, 7.5],
    };
    const r = table[next] || [2.5, 4.2];
    this.duration = duration !== null ? duration : randRange(r[0], r[1]);
    this.binkyBurstCycle = -1;
    this.thumpCycleDone = -1;
    this.hopCyclePuff = -1;
    this.zTimer = 0.6;
    this.groomEarSide = Math.random() > 0.5 ? 1 : -1;
  }

  _nearestThreat(ctx) {
    let minD = Infinity;
    let threatX = 0, threatZ = 0, fastThreat = false;
    const check = (tx, tz, movingFast = false) => {
      const d = Math.hypot(tx - this.x, tz - this.z);
      if (d < minD) {
        minD = d;
        threatX = tx;
        threatZ = tz;
        fastThreat = movingFast;
      }
    };
    const { animator, physics, party, boars } = ctx;
    if (animator) check(animator.x, animator.z, Math.abs(animator.speed || 0) > 2.2);
    if (physics && physics.pos) check(physics.pos.x, physics.pos.z, Math.hypot(physics.vel.x, physics.vel.z) > 2.2);
    if (party) {
      for (const m of party.members || []) {
        if (m.state === 'following' || m.state === 'boarding') check(m.x, m.z, false);
      }
      for (const w of party.wild || []) {
        if (!w.recruited) check(w.x, w.z, false);
      }
    }
    for (const b of boars || []) {
      if (!b.dead) check(b.x, b.z, b.state === 'charge_dash');
    }
    return { dist: minD, x: threatX, z: threatZ, fast: fastThreat };
  }

  _pickNextCalmBehavior() {
    const weighted = [
      { b: 'hop', w: 23 }, { b: 'forage', w: 20 }, { b: 'idle', w: 16 },
      { b: 'periscope', w: 13 }, { b: 'groom', w: 10 }, { b: 'loaf', w: 9 },
      { b: 'binky', w: 6 }, { b: 'thump', w: 3 },
    ];
    const filtered = weighted.filter((it) => it.b !== this.behavior);
    const tot = filtered.reduce((acc, it) => acc + it.w, 0);
    let r = Math.random() * tot;
    let chosen = 'hop';
    for (const it of filtered) {
      r -= it.w;
      if (r <= 0) { chosen = it.b; break; }
    }
    if (chosen === 'hop' || chosen === 'forage') {
      const dh = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
      if (dh > 7.5) {
        this.targetHeading = Math.atan2(this.homeX - this.x, this.homeZ - this.z) + randRange(-0.6, 0.6);
      } else {
        this.targetHeading = this.heading + randRange(-1.4, 1.4);
      }
    }
    this.setBehavior(chosen);
  }

  update(dt, globalTime, ctx) {
    this.stateTime += dt;
    if (this.alertCooldown > 0) this.alertCooldown = Math.max(0, this.alertCooldown - dt);
    if (this.wallSlideT > 0) this.wallSlideT = Math.max(0, this.wallSlideT - dt);

    const threat = this._nearestThreat(ctx);
    const panicRange = threat.fast ? 8.8 : 7.4;
    const alertRange = 10.2;

    if (threat.dist < panicRange) {
      // Kabur segera menjauhi sumber bahaya dengan zig-zag kelinci!
      if (this.behavior !== 'run') {
        this.setBehavior('run', randRange(1.8, 3.0));
      }
      this.fleeTimer = Math.max(this.fleeTimer, 1.55);
      const away = Math.atan2(this.x - threat.x, this.z - threat.z);
      const zig = Math.sin(globalTime * 3.1 + this.zigPhase) * 0.36;
      this.targetHeading = this.wallSlideT > 0 ? this.wallSlideAng : (away + zig);
    } else if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      if (threat.dist < 13.0) {
        const away = Math.atan2(this.x - threat.x, this.z - threat.z);
        this.targetHeading = this.wallSlideT > 0 ? this.wallSlideAng : (away + Math.sin(globalTime * 2.8 + this.zigPhase) * 0.25);
      }
      if (this.fleeTimer <= 0 && threat.dist >= 12.2) {
        this.setBehavior('periscope', randRange(1.8, 2.8));
        this.targetHeading = Math.atan2(threat.x - this.x, threat.z - this.z);
      }
    } else if (threat.dist < alertRange && this.alertCooldown <= 0 && this.behavior !== 'periscope' && this.behavior !== 'thump') {
      this.alertCooldown = 4.5;
      this.targetHeading = Math.atan2(threat.x - this.x, threat.z - this.z);
      this.setBehavior(Math.random() < 0.35 ? 'thump' : 'periscope', randRange(1.4, 2.3));
    } else if (this.stateTime >= this.duration) {
      this._pickNextCalmBehavior();
    }

    // Ear radars
    for (const [rad, s] of [[this.earRadarL, 1], [this.earRadarR, -1]]) {
      rad.timer -= dt;
      if (rad.timer <= 0) {
        rad.timer = randRange(0.9, 2.6);
        rad.targetY = s * randRange(-0.35, 0.65);
      }
      rad.curY = damp(rad.curY, rad.targetY, 6.5, dt);
    }

    const { pose: targetPose, forwardSpeed } = this._evaluatePose(dt, globalTime);

    if (forwardSpeed > 0.01) {
      const dh = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
      if (this.behavior !== 'run' && dh > 9.0 && this.wallSlideT <= 0) {
        const toHome = Math.atan2(this.homeX - this.x, this.homeZ - this.z);
        this.targetHeading = dampAngle(this.targetHeading, toHome, 3.8, dt);
      }
      this.heading = dampAngle(this.heading, this.targetHeading, this.behavior === 'run' ? 9.5 : 5.2, dt);
      this.x += Math.sin(this.heading) * forwardSpeed * dt;
      this.z += Math.cos(this.heading) * forwardSpeed * dt;

      const pos2 = { x: this.x, z: this.z };
      const col = keepOutOfPondAndBounds(pos2, this.world, 0.30);
      this.x = pos2.x;
      this.z = pos2.z;
      if (col.hit && Math.hypot(col.nx, col.nz) > 1e-4) {
        // Luncurkan menyusuri sisi halangan agar tidak terjebak menabrak terus saat kabur
        const nAng = Math.atan2(col.nx, col.nz);
        const away = isFinite(threat.dist) ? Math.atan2(this.x - threat.x, this.z - threat.z) : nAng;
        const c1 = nAng + Math.PI * 0.44;
        const c2 = nAng - Math.PI * 0.44;
        const d1 = Math.cos(c1 - away), d2 = Math.cos(c2 - away);
        const slideAng = Math.max(d1, d2) < -0.15 ? nAng : (d1 >= d2 ? c1 : c2);
        this.wallSlideAng = slideAng;
        this.wallSlideT = 0.55;
        this.targetHeading = slideAng;
        this.heading = dampAngle(this.heading, slideAng, 16, dt);
      }
    } else {
      this.heading = dampAngle(this.heading, this.targetHeading, 4.0, dt);
    }

    // Soft separation from other rabbits
    for (const o of ctx.rabbits || []) {
      if (o === this) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.78 && d > 1e-4) {
        const push = (0.78 - d) * 2.5 * dt;
        this.x += (dx / d) * push;
        this.z += (dz / d) * push;
      }
    }

    this.y = groundY(this.world, this.x, this.z);

    const lam = targetPose.lambda;
    for (const k in this.pose) {
      if (k === 'lambda') continue;
      this.pose[k] = damp(this.pose[k], targetPose[k], lam, dt);
    }

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkRemain = 0.16;
      this.blinkTimer = this.behavior === 'loaf' ? randRange(3.0, 5.5) : randRange(2.0, 4.4);
    }
    let blinkLid = 0;
    if (this.blinkRemain > 0) {
      this.blinkRemain = Math.max(0, this.blinkRemain - dt);
      blinkLid = Math.sin((this.blinkRemain / 0.16) * Math.PI);
    }
    const finalLid = clamp(Math.max(this.pose.lidClosed, blinkLid), 0.001, 1.0);
    this._applyPose(globalTime, finalLid);
  }

  _evaluatePose(dt, gt) {
    const p = createEmptyRabbitPose();
    const st = this.stateTime;
    const ph = this.phaseOffset;
    let forwardSpeed = 0;

    switch (this.behavior) {
      case 'idle': {
        const breath = Math.sin(gt * 2.6 + ph);
        p.bodyY = RBODY_BASE_Y + breath * 0.008;
        p.squashY = 1 + breath * 0.025;
        p.squashX = 1 - breath * 0.015;
        p.squashZ = 1 - breath * 0.012;
        p.headRotY = Math.sin(gt * 0.85 + ph) * 0.24;
        p.headRotZ = Math.sin(gt * 0.62 + ph) * 0.07;
        p.headRotX = 0.04 + breath * 0.03;
        p.earLBaseX = -0.1 + Math.sin(gt * 1.4 + ph) * 0.08;
        p.earRBaseX = -0.1 + Math.cos(gt * 1.2 + ph) * 0.08;
        p.earLBaseY = this.earRadarL.curY;
        p.earRBaseY = this.earRadarR.curY;
        p.earLBaseZ = 0.16; p.earRBaseZ = -0.16;
        p.tailRotX = 0.08 + breath * 0.05;
        p.tailRotY = Math.sin(gt * 3.8 + ph) * 0.08;
        p.noseRate = 1.15; p.lambda = 10;
        break;
      }
      case 'hop': {
        const cycleLen = 0.72;
        const cycleIdx = Math.floor(st / cycleLen);
        const u = (st % cycleLen) / cycleLen;
        if (u < 0.24) {
          const t = easeInOutCubic(u / 0.24);
          p.bodyY = RBODY_BASE_Y - 0.045 * t;
          p.bodyRotX = 0.14 * t;
          p.squashY = 1 - 0.14 * t; p.squashZ = 1 - 0.08 * t; p.squashX = 1 + 0.10 * t;
          p.thighLX = -0.28 * t; p.thighRX = -0.28 * t;
          p.hockLX = 0.36 * t; p.hockRX = 0.36 * t;
          p.armLX = 0.18 * t; p.armRX = 0.18 * t;
          p.earLBaseX = -0.25 * t; p.earRBaseX = -0.25 * t;
          p.headRotX = -0.1 * t;
          forwardSpeed = 0.12;
        } else if (u < 0.72) {
          const t = (u - 0.24) / 0.48;
          const arc = Math.sin(t * Math.PI);
          if (cycleIdx !== this.hopCyclePuff && t > 0.06 && this.vfx) {
            this.hopCyclePuff = cycleIdx;
            const bPos = new THREE.Vector3(this.x - Math.sin(this.heading) * 0.22, this.y + 0.06, this.z - Math.cos(this.heading) * 0.22);
            this.vfx.spawnDust(bPos, new THREE.Vector3(randRange(-0.4, 0.4), randRange(0.35, 0.7), randRange(-0.4, 0.4)), randRange(0.06, 0.09), 0.40);
          }
          p.bodyY = RBODY_BASE_Y + arc * 0.34;
          p.bodyRotX = THREE.MathUtils.lerp(-0.34, 0.30, t);
          p.squashZ = 1 + arc * 0.15; p.squashY = 1 + arc * 0.05; p.squashX = 1 - arc * 0.10;
          const hindKick = Math.sin(Math.min(1, t * 1.4) * Math.PI);
          p.thighLX = hindKick * 0.85 - (1 - hindKick) * 0.35 * t;
          p.thighRX = p.thighLX;
          p.hockLX = -hindKick * 0.55; p.hockRX = p.hockLX;
          p.footLX = hindKick * 0.65; p.footRX = p.footLX;
          p.armLX = -0.55 + t * 0.15; p.armRX = p.armLX;
          p.foreLX = -0.25 * (1 - t); p.foreRX = p.foreLX;
          p.earLBaseX = -0.58 - arc * 0.32; p.earRBaseX = -0.58 - arc * 0.32;
          p.earLTipX = -0.35 * arc; p.earRTipX = -0.35 * arc;
          p.earLBaseZ = 0.24; p.earRBaseZ = -0.24;
          p.headRotX = -p.bodyRotX * 0.65;
          p.tailRotX = 0.42 * arc;
          forwardSpeed = 1.65;
        } else {
          const t = (u - 0.72) / 0.28;
          const cushion = Math.sin(t * Math.PI);
          p.bodyY = RBODY_BASE_Y - cushion * 0.055;
          p.bodyRotX = (1 - t) * 0.18;
          p.squashY = 1 - cushion * 0.14; p.squashX = 1 + cushion * 0.10; p.squashZ = 1 + cushion * 0.06;
          p.thighLX = -0.35 * cushion; p.thighRX = -0.35 * cushion;
          p.armLX = -0.15 * cushion; p.armRX = -0.15 * cushion;
          p.earLBaseX = -0.3 + cushion * 0.25; p.earRBaseX = -0.3 + cushion * 0.25;
          p.earLTipX = 0.28 * cushion; p.earRTipX = 0.28 * cushion;
          forwardSpeed = 0.35 * (1 - t);
        }
        p.noseRate = 1.3; p.lambda = 20;
        break;
      }
      case 'run': {
        const cycleLen = 0.38;
        const u = (st % cycleLen) / cycleLen;
        const air = Math.sin(u * Math.PI);
        p.bodyY = RBODY_BASE_Y + air * 0.40;
        p.bodyRotX = Math.cos(u * Math.PI * 2) * 0.38;
        p.bodyRotZ = Math.sin(st * 9 + ph) * 0.08;
        p.squashZ = 1 + air * 0.24; p.squashY = 1 - (1 - air) * 0.15; p.squashX = 1 - air * 0.12;
        p.thighLX = Math.sin(u * Math.PI * 2 - 0.6) * 0.95;
        p.thighRX = Math.sin(u * Math.PI * 2 - 0.4) * 0.95;
        p.hockLX = -Math.max(0, Math.sin(u * Math.PI * 2 - 0.6)) * 0.6;
        p.hockRX = p.hockLX;
        p.footLX = Math.max(0, Math.sin(u * Math.PI * 2 - 0.6)) * 0.7;
        p.footRX = p.footLX;
        p.armLX = Math.sin(u * Math.PI * 2 + 1.8) * 0.85;
        p.armRX = Math.sin(u * Math.PI * 2 + 2.0) * 0.85;
        p.earLBaseX = -1.22 + air * 0.15; p.earRBaseX = -1.22 + air * 0.15;
        p.earLTipX = -0.25; p.earRTipX = -0.25;
        p.earLBaseZ = 0.28; p.earRBaseZ = -0.28;
        p.headRotX = -p.bodyRotX * 0.65 - 0.06;
        p.tailRotX = 0.55;
        p.tailRotY = Math.sin(st * 22) * 0.24;
        forwardSpeed = 3.8 + air * 2.8;
        p.noseRate = 1.7; p.lambda = 24;

        this.dustCooldown -= dt;
        if (this.dustCooldown <= 0 && this.vfx) {
          this.dustCooldown = 0.11;
          const bPos = new THREE.Vector3(this.x - Math.sin(this.heading) * 0.26, this.y + 0.07, this.z - Math.cos(this.heading) * 0.26);
          this.vfx.spawnDust(
            bPos,
            new THREE.Vector3(-Math.sin(this.heading) * 1.4 + randRange(-0.4, 0.4), randRange(0.4, 0.8), -Math.cos(this.heading) * 1.4 + randRange(-0.4, 0.4)),
            randRange(0.08, 0.12),
            0.42
          );
        }
        break;
      }
      case 'periscope': {
        const rise = easeOutCubic(Math.min(1, st / 0.38));
        p.bodyY = THREE.MathUtils.lerp(RBODY_BASE_Y, 8.75 * RV, rise) + Math.sin(st * 3.2) * 0.008;
        p.bodyRotX = -0.96 * rise;
        p.bodyRotZ = Math.sin(st * 2.3 + ph) * 0.035;
        p.squashY = 1 + 0.06 * rise; p.squashX = 1 - 0.04 * rise;
        p.thighLX = 0.88 * rise; p.thighRX = 0.88 * rise;
        p.hockLX = 0.08 * rise; p.hockRX = 0.08 * rise;
        p.armLX = 0.82 * rise + Math.sin(st * 4.2) * 0.05;
        p.armRX = 0.82 * rise - Math.sin(st * 4.2) * 0.05;
        p.armLZ = -0.26 * rise; p.armRZ = 0.26 * rise;
        p.foreLX = -1.15 * rise; p.foreRX = -1.15 * rise;
        p.headRotX = 0.88 * rise + Math.sin(st * 2.1) * 0.05;
        p.headRotY = Math.sin(st * 1.65 + ph) * 0.52;
        p.headRotZ = Math.sin(st * 1.1) * 0.08;
        p.earLBaseX = 0.08; p.earRBaseX = 0.08;
        p.earLBaseY = this.earRadarL.curY * 1.35; p.earRBaseY = this.earRadarR.curY * 1.35;
        p.earLBaseZ = 0.08; p.earRBaseZ = -0.08;
        p.tailRotX = 0.45 * rise; p.noseRate = 1.9; p.lambda = 14;
        break;
      }
      case 'groom': {
        const ct = st % 4.8;
        const sit = easeOutCubic(Math.min(1, st / 0.35));
        const earSide = this.groomEarSide;
        p.bodyY = THREE.MathUtils.lerp(RBODY_BASE_Y, 7.15 * RV, sit);
        p.bodyRotX = -0.58 * sit;
        p.thighLX = 0.54 * sit; p.thighRX = 0.54 * sit;
        p.hockLX = 0.04 * sit; p.hockRX = 0.04 * sit;
        if (ct < 1.1) {
          const lick = Math.sin(ct * 22);
          p.headRotX = 0.78 + lick * 0.08;
          p.armLX = -0.25 + lick * 0.14; p.armRX = -0.25 - lick * 0.14;
          p.armLZ = -0.38; p.armRZ = 0.38;
          p.foreLX = -1.35 + lick * 0.18; p.foreRX = -1.35 - lick * 0.18;
          p.earLBaseX = -0.2; p.earRBaseX = -0.2; p.lidClosed = 0.25;
        } else if (ct < 2.8) {
          const wt = (ct - 1.1) * 7.2;
          const swipe = Math.sin(wt), swipeUp = Math.cos(wt);
          p.headRotX = 0.68 - swipe * 0.22;
          p.armLX = -0.78 - swipe * 0.45; p.armRX = p.armLX;
          p.armLZ = -0.34 - swipeUp * 0.14; p.armRZ = 0.34 + swipeUp * 0.14;
          p.foreLX = -1.15 - swipeUp * 0.32; p.foreRX = p.foreLX;
          p.lidClosed = 0.35 + Math.max(0, swipe) * 0.55;
        } else {
          const et = ct - 2.8;
          const pull = easeInOutCubic(Math.min(1, et / 0.45)) * (et > 1.65 ? clamp(1 - (et - 1.65) / 0.35, 0, 1) : 1);
          const scrub = Math.sin(et * 16) * pull;
          p.headRotX = 0.72 + scrub * 0.08;
          p.headRotZ = earSide * 0.48 * pull;
          if (earSide > 0) {
            p.earLBaseX = 1.15 * pull + scrub * 0.12; p.earLBaseZ = -0.45 * pull; p.earLTipX = 0.75 * pull;
          } else {
            p.earRBaseX = 1.15 * pull + scrub * 0.12; p.earRBaseZ = 0.45 * pull; p.earRTipX = 0.75 * pull;
          }
          p.armLX = -0.58 + scrub * 0.18; p.armRX = -0.58 - scrub * 0.12;
          p.foreLX = -1.25 + scrub * 0.22; p.foreRX = p.foreLX;
          p.lidClosed = 0.45 * pull;
        }
        p.noseRate = 0.9; p.lambda = 15;
        break;
      }
      case 'forage': {
        const shuffle = Math.sin(st * 4.5 + ph), nibble = Math.sin(st * 24 + ph);
        p.bodyY = RBODY_BASE_Y - 0.03 + Math.abs(shuffle) * 0.02;
        p.bodyRotX = 0.22; p.squashZ = 1.05; p.squashY = 0.96;
        p.headRotX = 0.56 + nibble * 0.045;
        p.headRotY = Math.sin(st * 1.9 + ph) * 0.34;
        p.headPosY = 2.0 * RV;
        p.armLX = Math.sin(st * 4.5) * 0.22; p.armRX = -p.armLX;
        p.thighLX = -Math.sin(st * 4.5) * 0.14; p.thighRX = -p.thighLX;
        p.earLBaseX = 0.15; p.earRBaseX = 0.15;
        p.earLBaseZ = 0.28; p.earRBaseZ = -0.28;
        p.earLTipX = 0.18; p.earRTipX = 0.18;
        p.tailRotY = Math.sin(st * 8) * 0.18;
        p.noseRate = 2.0; forwardSpeed = 0.26; p.lambda = 13;
        this.crumbTimer -= dt;
        if (this.crumbTimer <= 0 && this.vfx) {
          this.crumbTimer = randRange(0.32, 0.60);
          const tip = new THREE.Vector3();
          this.rig.noseTipAnchor.getWorldPosition(tip);
          tip.y = Math.max(this.y + 0.04, tip.y - 0.03);
          this.vfx.spawnNibbleCrumb(tip);
        }
        break;
      }
      case 'binky': {
        const cycleLen = 1.45;
        const cycleIdx = Math.floor(st / cycleLen);
        const u = (st % cycleLen) / cycleLen;
        const twistDir = cycleIdx % 2 === 0 ? 1 : -1;
        if (u < 0.24) {
          const t = easeInOutCubic(u / 0.24);
          p.bodyY = RBODY_BASE_Y - 0.08 * t;
          p.squashY = 1 - 0.22 * t; p.squashX = 1 + 0.16 * t; p.squashZ = 1 + 0.08 * t;
          p.bodyRotX = 0.18 * t;
        } else if (u < 0.78) {
          const t = (u - 0.24) / 0.54;
          const arc = Math.sin(t * Math.PI);
          const twist = Math.sin(t * Math.PI * 2);
          if (cycleIdx !== this.binkyBurstCycle && t > 0.18 && this.vfx) {
            this.binkyBurstCycle = cycleIdx;
            this.vfx.spawnBinkyBurst(new THREE.Vector3(this.x, this.y, this.z));
          }
          p.bodyY = RBODY_BASE_Y + arc * 0.78;
          p.bodyRotY = twistDir * twist * 0.75;
          p.bodyRotZ = twistDir * arc * 0.42;
          p.bodyRotX = -0.25 * Math.cos(t * Math.PI);
          p.squashY = 1 + arc * 0.18; p.squashZ = 1 + arc * 0.14; p.squashX = 1 - arc * 0.12;
          p.thighLX = 0.85 * arc; p.thighRX = 0.75 * arc;
          p.thighLZ = 0.55 * arc; p.thighRZ = -0.55 * arc;
          p.hockLX = -0.55 * arc; p.hockRX = -0.55 * arc;
          p.armLX = -0.75 * arc; p.armRX = -0.55 * arc;
          p.earLBaseX = -0.75 * arc; p.earRBaseX = -0.75 * arc;
          p.earLBaseZ = 0.72 * arc; p.earRBaseZ = -0.72 * arc;
          p.tailRotX = 0.6 * arc; forwardSpeed = 0.75;
        } else {
          const t = (u - 0.78) / 0.22;
          const land = Math.sin(t * Math.PI);
          p.bodyY = RBODY_BASE_Y - land * 0.065;
          p.squashY = 1 - land * 0.18; p.squashX = 1 + land * 0.14;
        }
        p.noseRate = 1.6; p.lambda = 22;
        break;
      }
      case 'thump': {
        const cycleLen = 1.95;
        const cycleIdx = Math.floor(st / cycleLen);
        const u = (st % cycleLen) / cycleLen;
        p.earLBaseX = 0.12; p.earRBaseX = 0.12; p.earLBaseY = 0; p.earRBaseY = 0;
        if (u < 0.36) {
          const t = easeOutCubic(u / 0.36);
          p.bodyY = RBODY_BASE_Y + 0.02 * t; p.bodyRotX = -0.08 * t;
        } else if (u < 0.56) {
          const t = easeOutCubic((u - 0.36) / 0.20);
          p.bodyY = RBODY_BASE_Y + 0.06 * t;
          p.bodyRotZ = 0.14 * t; p.bodyRotX = -0.18 * t;
          p.thighRX = -0.78 * t; p.hockRX = 0.55 * t; p.footRX = -0.35 * t;
        } else if (u < 0.68) {
          const t = (u - 0.56) / 0.12;
          const impact = Math.sin(t * Math.PI);
          if (cycleIdx !== this.thumpCycleDone && t > 0.35 && this.vfx) {
            this.thumpCycleDone = cycleIdx;
            this.vfx.spawnThumpWave(new THREE.Vector3(this.x, this.y, this.z));
          }
          p.bodyY = RBODY_BASE_Y - 0.065 * impact;
          p.squashY = 1 - 0.16 * impact; p.squashX = 1 + 0.13 * impact;
          p.thighRX = 0.12 * impact;
        } else {
          const t = (u - 0.68) / 0.32;
          p.bodyY = RBODY_BASE_Y + Math.sin(t * Math.PI * 5) * (1 - t) * 0.04;
        }
        p.noseRate = 1.75; p.lambda = 24;
        break;
      }
      case 'loaf': {
        const settle = easeInOutCubic(Math.min(1, st / 0.65));
        const sb = Math.sin(gt * 1.45 + ph);
        p.bodyY = THREE.MathUtils.lerp(RBODY_BASE_Y, 3.65 * RV, settle) + sb * 0.006;
        p.squashX = THREE.MathUtils.lerp(1.0, 1.15, settle) - sb * 0.015;
        p.squashY = THREE.MathUtils.lerp(1.0, 0.86, settle) + sb * 0.022;
        p.armLX = 1.38 * settle; p.armRX = 1.38 * settle;
        p.armLZ = -0.35 * settle; p.armRZ = 0.35 * settle;
        p.foreLX = -0.85 * settle; p.foreRX = -0.85 * settle;
        p.thighLX = -0.58 * settle; p.thighRX = -0.58 * settle;
        p.hockLX = 0.72 * settle; p.hockRX = 0.72 * settle;
        p.headPosY = THREE.MathUtils.lerp(2.55 * RV, 2.05 * RV, settle);
        p.headPosZ = THREE.MathUtils.lerp(4.05 * RV, 3.65 * RV, settle);
        p.headRotX = 0.14 * settle + sb * 0.025;
        p.lidClosed = 0.62 * settle;
        p.earLBaseX = -1.32 * settle; p.earRBaseX = -1.32 * settle;
        p.noseRate = 0.32; p.lambda = 7.5;
        if (st > 1.1 && this.vfx) {
          this.zTimer -= dt;
          if (this.zTimer <= 0) {
            this.zTimer = randRange(1.4, 2.2);
            const hw = new THREE.Vector3();
            this.rig.head.getWorldPosition(hw);
            this.vfx.spawnSleepyZ(hw);
          }
        }
        break;
      }
    }
    return { pose: p, forwardSpeed };
  }

  _applyPose(gt, finalLid) {
    const r = this.rig;
    const p = this.pose;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.y = this.heading;
    r.squash.scale.set(p.squashX, p.squashY, p.squashZ);
    r.body.position.y = p.bodyY;
    r.body.rotation.set(p.bodyRotX, p.bodyRotY, p.bodyRotZ);
    r.head.position.set(0, p.headPosY, p.headPosZ);
    r.head.rotation.set(p.headRotX, p.headRotY, p.headRotZ);

    const noseFreq = (28 + (this.variant === 'white' ? 4 : 0)) * p.noseRate;
    const noseWave = Math.sin(gt * noseFreq + this.phaseOffset);
    r.snout.position.y = -0.45 * RV + noseWave * 0.011 * p.noseRate;
    r.snout.rotation.x = noseWave * 0.08 * p.noseRate;
    r.snout.scale.x = 1 + noseWave * 0.045 * p.noseRate;

    r.eyelids.L.scale.y = finalLid; r.eyelids.R.scale.y = finalLid;
    r.ears.L.base.rotation.set(p.earLBaseX, p.earLBaseY, p.earLBaseZ);
    r.ears.L.tip.rotation.x = p.earLTipX;
    r.ears.R.base.rotation.set(p.earRBaseX, p.earRBaseY, p.earRBaseZ);
    r.ears.R.tip.rotation.x = p.earRTipX;

    r.hindLegs.L.thigh.rotation.set(p.thighLX, 0, p.thighLZ);
    r.hindLegs.L.hock.rotation.x = p.hockLX; r.hindLegs.L.foot.rotation.x = p.footLX;
    r.hindLegs.R.thigh.rotation.set(p.thighRX, 0, p.thighRZ);
    r.hindLegs.R.hock.rotation.x = p.hockRX; r.hindLegs.R.foot.rotation.x = p.footRX;

    r.frontLegs.L.upper.rotation.set(p.armLX, 0, p.armLZ);
    r.frontLegs.L.fore.rotation.set(p.foreLX, 0, p.foreLZ);
    r.frontLegs.R.upper.rotation.set(p.armRX, 0, p.armRZ);
    r.frontLegs.R.fore.rotation.set(p.foreRX, 0, p.foreRZ);
    r.tail.rotation.set(p.tailRotX, p.tailRotY, 0);
  }
  dispose() {
    if (this.rig && this.rig.root && this.scene) {
      this.scene.remove(this.rig.root);
    }
  }
}

/* ============================================================================
   4. BABI HUTAN VOXEL MINECRAFT PASTEL (FIDELITY PORT + COMBAT AI)
   ============================================================================ */
const BV = 0.068;
const BBODY_BASE_Y = 11.5 * BV;

function createBoarMaterials() {
  return {
    furBase:     new THREE.MeshStandardMaterial({ color: 0xba8059, roughness: 0.86, metalness: 0.0 }),
    furWarm:     new THREE.MeshStandardMaterial({ color: 0xc98f66, roughness: 0.85, metalness: 0.0 }),
    furDeep:     new THREE.MeshStandardMaterial({ color: 0xa06a48, roughness: 0.87, metalness: 0.0 }),
    furCocoa:    new THREE.MeshStandardMaterial({ color: 0x795038, roughness: 0.86, metalness: 0.0 }),
    furDark:     new THREE.MeshStandardMaterial({ color: 0x623f2c, roughness: 0.85, metalness: 0.0 }),
    furCream:    new THREE.MeshStandardMaterial({ color: 0xebd0b0, roughness: 0.86, metalness: 0.0 }),
    furButter:   new THREE.MeshStandardMaterial({ color: 0xf5e2c8, roughness: 0.85, metalness: 0.0 }),
    eyelidBrown: new THREE.MeshStandardMaterial({ color: 0xa9724e, roughness: 0.86, metalness: 0.0 }),
    snoutPeach:  new THREE.MeshStandardMaterial({ color: 0xeba99d, roughness: 0.78, metalness: 0.0 }),
    snoutLight:  new THREE.MeshStandardMaterial({ color: 0xf4c0b5, roughness: 0.76, metalness: 0.0 }),
    snoutDeep:   new THREE.MeshStandardMaterial({ color: 0xd68c80, roughness: 0.82, metalness: 0.0 }),
    blushPink:   new THREE.MeshStandardMaterial({ color: 0xf49b9c, roughness: 0.84, metalness: 0.0 }),
    ivoryWhite:  new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.45, metalness: 0.0 }),
    ivoryCream:  new THREE.MeshStandardMaterial({ color: 0xf2e2c4, roughness: 0.52, metalness: 0.0 }),
    hoofDark:    new THREE.MeshStandardMaterial({ color: 0x523c32, roughness: 0.74, metalness: 0.0 }),
    hoofAccent:  new THREE.MeshStandardMaterial({ color: 0x6b5043, roughness: 0.76, metalness: 0.0 }),
    eyePupil:    new THREE.MeshStandardMaterial({ color: 0x2c1f1a, roughness: 0.16, metalness: 0.04 }),
    eyeWhite:    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    eyeCross:    new THREE.MeshStandardMaterial({ color: 0x4a3329, roughness: 0.65 }),
  };
}

function addBoarVoxel(parent, gx, gy, gz, sx, sy, sz, mat, cast = true, receive = true) {
  const mesh = new THREE.Mesh(unitCubeGeo, mat);
  mesh.position.set(gx * BV, gy * BV, gz * BV);
  mesh.scale.set(sx * BV, sy * BV, sz * BV);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function buildVoxelBoarRig(scene) {
  const materials = createBoarMaterials();
  const rig = {
    materials,
    root: new THREE.Group(),
    squash: new THREE.Group(),
    body: new THREE.Group(),
    head: new THREE.Group(),
    snout: new THREE.Group(),
    ears: { L: new THREE.Group(), R: new THREE.Group() },
    brows: { L: new THREE.Group(), R: new THREE.Group() },
    eyesAlive: { L: new THREE.Group(), R: new THREE.Group() },
    eyelids: { L: new THREE.Group(), R: new THREE.Group() },
    eyesDead: { L: new THREE.Group(), R: new THREE.Group() },
    legs: { FL: null, FR: null, BL: null, BR: null },
    shins: { FL: null, FR: null, BL: null, BR: null },
    tail: new THREE.Group(),
    tailTip: new THREE.Group(),
    maneTufts: [],
    tuskTipWorld: new THREE.Object3D(),
    dizzyHalo: new THREE.Group(),
    dizzyStars: [],
  };

  rig.root.scale.setScalar(0.92);
  rig.root.add(rig.squash);
  rig.body.position.set(0, BBODY_BASE_Y, 0);
  rig.squash.add(rig.body);

  // Layered torso
  addBoarVoxel(rig.body, 0, 0.2, 0, 10.0, 8.0, 13.8, materials.furBase);
  addBoarVoxel(rig.body, 0, 4.6, -0.2, 8.0, 1.0, 11.8, materials.furBase);
  addBoarVoxel(rig.body, 0, 5.15, 0.2, 5.6, 0.5, 9.6, materials.furWarm);
  addBoarVoxel(rig.body, 0, 0.4, 7.2, 8.2, 6.2, 1.0, materials.furBase);
  addBoarVoxel(rig.body, 0, 0.0, -7.2, 8.4, 6.2, 1.2, materials.furBase);
  addBoarVoxel(rig.body, 0, -0.3, -7.95, 6.0, 4.4, 0.7, materials.furDeep);

  addBoarVoxel(rig.body, 0, -4.15, 0.2, 7.8, 1.2, 11.2, materials.furCream, false, true);
  addBoarVoxel(rig.body, 0, -4.75, 0.4, 5.8, 0.6, 8.6, materials.furButter, false, true);
  addBoarVoxel(rig.body, 0, -1.9, 7.6, 5.4, 2.8, 0.7, materials.furButter, false, true);

  for (const side of [-1, 1]) {
    addBoarVoxel(rig.body, side * 5.35, -0.1, -0.2, 0.9, 6.0, 11.0, materials.furBase);
    addBoarVoxel(rig.body, side * 5.1, 0.3, 3.6, 1.5, 5.4, 4.2, materials.furBase);
    addBoarVoxel(rig.body, side * 5.55, 1.5, 3.8, 0.7, 2.4, 2.8, materials.furWarm);
    addBoarVoxel(rig.body, side * 5.2, -0.6, -4.1, 1.6, 5.2, 4.8, materials.furBase);
    addBoarVoxel(rig.body, side * 5.65, 0.5, -4.2, 0.8, 2.6, 3.2, materials.furWarm);
    addBoarVoxel(rig.body, side * 5.5, -2.2, -4.4, 0.7, 1.6, 2.4, materials.furDeep);
    addBoarVoxel(rig.body, side * 5.82, 1.8, 0.5, 0.25, 1.4, 2.2, materials.furWarm, false, true);
    addBoarVoxel(rig.body, side * 5.82, -1.6, 1.2, 0.25, 1.2, 1.8, materials.furDeep, false, true);
    addBoarVoxel(rig.body, side * 3.8, 4.7, 2.8, 1.6, 0.45, 2.0, materials.furWarm, false, true);
    addBoarVoxel(rig.body, side * 3.6, 4.7, -2.8, 1.5, 0.45, 2.2, materials.furDeep, false, true);
    addBoarVoxel(rig.body, side * 5.85, 0.5, -0.6, 0.3, 1.0, 5.4, materials.furCream, false, true);
    addBoarVoxel(rig.body, side * 5.95, 0.6, -0.4, 0.18, 0.55, 3.2, materials.furButter, false, true);
    addBoarVoxel(rig.body, side * 5.45, 2.4, -1.1, 0.35, 0.9, 4.4, materials.furCream, false, true);
    addBoarVoxel(rig.body, side * 4.5, 3.9, -1.3, 0.8, 0.55, 3.6, materials.furCream, false, true);
  }

  // Stepped dorsal mane
  [
    { y: 5.1, z: 5.0, scale: 1.08 }, { y: 5.3, z: 2.5, scale: 1.05 },
    { y: 5.2, z: 0.0, scale: 0.98 }, { y: 5.0, z: -2.5, scale: 0.88 },
    { y: 4.5, z: -4.9, scale: 0.76 },
  ].forEach((cfg, idx) => {
    const p = new THREE.Group();
    p.position.set(0, cfg.y * BV, cfg.z * BV);
    const s = cfg.scale;
    addBoarVoxel(p, 0, 0.55 * s, 0.1, 1.8 * s, 1.2 * s, 2.1 * s, materials.furCocoa);
    addBoarVoxel(p, 0, 1.45 * s, -0.35 * s, 1.3 * s, 1.15 * s, 1.65 * s, materials.furDark);
    addBoarVoxel(p, 0, 2.25 * s, -0.75 * s, 0.85 * s, 0.9 * s, 1.1 * s, materials.furCocoa);
    rig.body.add(p);
    rig.maneTufts.push({ pivot: p, phaseOffset: idx * 0.45 });
  });

  // Head + cheeks + mane crests
  rig.head.position.set(0, 2.2 * BV, 8.1 * BV);
  rig.body.add(rig.head);
  addBoarVoxel(rig.head, 0, 0.3, 1.5, 8.4, 7.2, 7.2, materials.furBase);
  addBoarVoxel(rig.head, 0, 4.25, 1.2, 6.6, 0.9, 5.6, materials.furBase);
  addBoarVoxel(rig.head, 0, 4.6, 1.6, 4.6, 0.45, 3.8, materials.furWarm);
  addBoarVoxel(rig.head, 0, -3.55, 1.8, 6.2, 0.85, 5.4, materials.furCream, false, true);

  for (const side of [-1, 1]) {
    addBoarVoxel(rig.head, side * 4.55, -0.4, 1.6, 0.9, 5.2, 5.4, materials.furBase);
    addBoarVoxel(rig.head, side * 5.0, -1.2, 2.0, 0.65, 3.2, 3.6, materials.furWarm);
    addBoarVoxel(rig.head, side * 4.4, -2.5, 2.4, 1.1, 1.6, 3.0, materials.furCream, false, true);
    addBoarVoxel(rig.head, side * 3.8, 2.9, 2.2, 1.2, 1.1, 1.6, materials.furWarm, false, true);
  }

  [{ y: 4.55, z: 2.8, scale: 0.92 }, { y: 4.65, z: 0.4, scale: 1.05 }].forEach((cfg, idx) => {
    const p = new THREE.Group();
    p.position.set(0, cfg.y * BV, cfg.z * BV);
    const s = cfg.scale;
    addBoarVoxel(p, 0, 0.55 * s, 0.1, 1.7 * s, 1.25 * s, 1.9 * s, materials.furCocoa);
    addBoarVoxel(p, 0, 1.45 * s, -0.3 * s, 1.15 * s, 1.1 * s, 1.45 * s, materials.furDark);
    addBoarVoxel(p, 0, 2.2 * s, -0.6 * s, 0.75 * s, 0.85 * s, 0.95 * s, materials.furCocoa);
    rig.head.add(p);
    rig.maneTufts.push({ pivot: p, phaseOffset: idx * 0.35 });
  });

  // Peach snout + recessed nostrils + curved voxel ivory tusks
  rig.snout.position.set(0, -1.05 * BV, 5.4 * BV);
  rig.head.add(rig.snout);
  addBoarVoxel(rig.snout, 0, 0.05, 0.1, 5.2, 3.6, 1.2, materials.furBase);
  addBoarVoxel(rig.snout, 0, 0.0, 1.0, 4.6, 3.1, 1.5, materials.snoutPeach);
  addBoarVoxel(rig.snout, 0, 1.55, 1.0, 3.6, 0.45, 1.35, materials.snoutLight);
  addBoarVoxel(rig.snout, 0, -1.55, 0.95, 3.8, 0.45, 1.25, materials.snoutDeep);
  addBoarVoxel(rig.snout, 0, -2.0, 0.4, 3.2, 0.7, 1.4, materials.furCream, false, true);

  addBoarVoxel(rig.snout, 0, 1.15, 1.85, 4.2, 0.7, 0.35, materials.snoutPeach);
  addBoarVoxel(rig.snout, 0, -1.1, 1.85, 4.2, 0.8, 0.35, materials.snoutPeach);
  addBoarVoxel(rig.snout, 0, 0.05, 1.85, 1.05, 1.6, 0.35, materials.snoutPeach);
  addBoarVoxel(rig.snout, -1.8, 0.05, 1.85, 0.7, 1.6, 0.35, materials.snoutPeach);
  addBoarVoxel(rig.snout, 1.8, 0.05, 1.85, 0.7, 1.6, 0.35, materials.snoutPeach);
  addBoarVoxel(rig.snout, -0.98, 0.05, 1.72, 0.95, 1.45, 0.25, materials.hoofDark, false, true);
  addBoarVoxel(rig.snout, 0.98, 0.05, 1.72, 0.95, 1.45, 0.25, materials.hoofDark, false, true);

  const tuskSteps = [
    { x: 2.35, y: -0.65, z: 0.1, s: [1.1, 1.1, 1.1], mat: materials.ivoryCream },
    { x: 3.1, y: -0.3, z: 0.55, s: [1.0, 1.0, 1.0], mat: materials.ivoryCream },
    { x: 3.65, y: 0.4, z: 0.95, s: [0.92, 0.95, 0.92], mat: materials.ivoryCream },
    { x: 3.9, y: 1.25, z: 1.2, s: [0.82, 0.92, 0.82], mat: materials.ivoryWhite },
    { x: 3.8, y: 2.08, z: 1.3, s: [0.68, 0.85, 0.68], mat: materials.ivoryWhite },
    { x: 3.52, y: 2.8, z: 1.25, s: [0.48, 0.68, 0.48], mat: materials.ivoryWhite },
  ];
  for (const side of [-1, 1]) {
    for (const st of tuskSteps) {
      addBoarVoxel(rig.snout, side * st.x, st.y, st.z, st.s[0], st.s[1], st.s[2], st.mat);
    }
  }
  rig.tuskTipWorld.position.set(0, 1.2 * BV, 2.2 * BV);
  rig.snout.add(rig.tuskTipWorld);

  // Eyes, lids, X-eyes, brows, blush
  for (const { key, side } of [{ key: 'L', side: 1 }, { key: 'R', side: -1 }]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 2.8 * BV, 1.25 * BV, 5.1 * BV);
    rig.head.add(eyeSocket);

    const alive = rig.eyesAlive[key];
    addBoarVoxel(alive, 0, 0, 0.05, 1.55, 1.65, 0.32, materials.eyePupil, false, false);
    addBoarVoxel(alive, -side * 0.36, 0.44, 0.22, 0.56, 0.56, 0.16, materials.eyeWhite, false, false);
    addBoarVoxel(alive, side * 0.36, -0.38, 0.22, 0.32, 0.32, 0.14, materials.eyeWhite, false, false);
    eyeSocket.add(alive);

    const lid = rig.eyelids[key];
    lid.position.set(0, 0.85 * BV, 0.24 * BV);
    addBoarVoxel(lid, 0, -0.85, 0, 1.72, 1.72, 0.26, materials.eyelidBrown, false, false);
    addBoarVoxel(lid, 0, -1.62, 0.05, 1.74, 0.24, 0.28, materials.furCocoa, false, false);
    lid.scale.y = 0.001;
    eyeSocket.add(lid);

    const dead = rig.eyesDead[key];
    for (const [px, py] of [[0, 0], [-0.48, 0.48], [0.48, 0.48], [-0.48, -0.48], [0.48, -0.48]]) {
      addBoarVoxel(dead, px, py, 0.16, 0.46, 0.46, 0.32, materials.eyeCross, false, false);
    }
    dead.visible = false;
    eyeSocket.add(dead);

    const brow = rig.brows[key];
    brow.position.set(side * 2.8 * BV, 2.55 * BV, 5.25 * BV);
    addBoarVoxel(brow, 0, 0, 0, 1.85, 0.58, 0.52, materials.furCocoa);
    addBoarVoxel(brow, side * 0.72, -0.18, -0.05, 0.65, 0.48, 0.46, materials.furDark);
    rig.head.add(brow);

    addBoarVoxel(rig.head, side * 3.55, -0.3, 5.16, 1.35, 0.78, 0.22, materials.blushPink, false, false);
    addBoarVoxel(rig.head, side * 4.15, -0.6, 5.05, 0.55, 0.5, 0.22, materials.blushPink, false, false);
  }

  // Ears
  const buildEar = (side) => {
    const ep = new THREE.Group();
    ep.position.set(side * 3.7 * BV, 3.65 * BV, 0.8 * BV);
    addBoarVoxel(ep, side * 0.35, 0.55, 0, 1.7, 1.3, 1.0, materials.furBase);
    addBoarVoxel(ep, side * 0.9, 1.65, -0.1, 2.1, 1.5, 0.9, materials.furBase);
    addBoarVoxel(ep, side * 0.85, 1.45, 0.38, 1.35, 1.75, 0.35, materials.snoutPeach, false, true);
    addBoarVoxel(ep, side * 1.15, 2.35, 0.28, 0.95, 0.85, 0.3, materials.snoutLight, false, true);
    addBoarVoxel(ep, side * 1.35, 2.85, -0.15, 1.65, 1.2, 0.85, materials.furBase);
    addBoarVoxel(ep, side * 1.7, 3.75, -0.2, 1.1, 0.95, 0.78, materials.furCocoa);
    addBoarVoxel(ep, side * 1.95, 4.35, -0.25, 0.7, 0.65, 0.65, materials.furDark);
    return ep;
  };
  rig.ears.L = buildEar(1);
  rig.ears.R = buildEar(-1);
  rig.head.add(rig.ears.L, rig.ears.R);

  // 4x 2-segment cloven legs
  const legConfigs = {
    FL: { pos: [3.4, -4.0, 4.4], side: 1 }, FR: { pos: [-3.4, -4.0, 4.4], side: -1 },
    BL: { pos: [3.5, -4.0, -4.6], side: 1 }, BR: { pos: [-3.5, -4.0, -4.6], side: -1 },
  };
  for (const key of Object.keys(legConfigs)) {
    const cfg = legConfigs[key];
    const lp = new THREE.Group();
    addBoarVoxel(lp, 0, -1.7, 0, 3.05, 3.6, 3.05, materials.furBase);
    addBoarVoxel(lp, cfg.side * 1.48, -1.15, 0.1, 0.35, 1.9, 1.9, materials.furWarm, false, true);
    addBoarVoxel(lp, 0, -3.15, 0, 2.65, 0.95, 2.65, materials.furDeep);

    const sp = new THREE.Group();
    sp.position.set(0, -3.5 * BV, 0);
    addBoarVoxel(sp, 0, -1.1, 0, 2.35, 2.4, 2.35, materials.furBase);
    addBoarVoxel(sp, 0, -2.35, 0.05, 2.48, 0.72, 2.48, materials.hoofAccent);
    addBoarVoxel(sp, -0.62, -3.25, 0.24, 1.1, 1.5, 2.15, materials.hoofDark);
    addBoarVoxel(sp, 0.62, -3.25, 0.24, 1.1, 1.5, 2.15, materials.hoofDark);
    addBoarVoxel(sp, 0, -3.05, -0.95, 1.65, 1.0, 0.75, materials.hoofAccent);
    lp.add(sp);
    lp.position.set(cfg.pos[0] * BV, cfg.pos[1] * BV, cfg.pos[2] * BV);
    rig.body.add(lp);
    rig.legs[key] = lp;
    rig.shins[key] = sp;
  }

  // Curved tufted tail
  rig.tail.position.set(0, 1.1 * BV, -7.8 * BV);
  addBoarVoxel(rig.tail, 0, 0.2, -0.55, 1.15, 1.15, 1.25, materials.furBase);
  addBoarVoxel(rig.tail, 0, 1.05, -1.45, 0.98, 1.05, 1.1, materials.furBase);
  addBoarVoxel(rig.tail, 0, 1.95, -1.95, 0.88, 0.95, 0.98, materials.furDeep);
  rig.tailTip.position.set(0, 2.45 * BV, -2.15 * BV);
  addBoarVoxel(rig.tailTip, 0, 0.5, -0.35, 1.6, 1.65, 1.75, materials.furCocoa);
  addBoarVoxel(rig.tailTip, 0, 1.45, -0.65, 1.05, 0.95, 1.15, materials.furDark);
  addBoarVoxel(rig.tailTip, 0, 0.45, -0.35, 1.95, 1.05, 1.05, materials.furCocoa);
  rig.tail.add(rig.tailTip);
  rig.body.add(rig.tail);

  // Orbiting KO dizzy stars attached to root
  rig.dizzyHalo.scale.setScalar(0.001);
  rig.dizzyHalo.visible = false;
  rig.root.add(rig.dizzyHalo);
  for (let i = 0; i < 3; i++) {
    const starMat = new THREE.MeshStandardMaterial({ color: [0xf5be4f, 0xf29379, 0xffe07d][i], roughness: 0.4 });
    const sv = createVoxelStarGroup(starMat);
    sv.scale.setScalar(0.11);
    rig.dizzyHalo.add(sv);
    rig.dizzyStars.push(sv);
  }

  if (scene) scene.add(rig.root);
  return rig;
}

function createEmptyBoarPose() {
  return {
    localZ: 0, localX: 0, bodyY: BBODY_BASE_Y,
    bodyRotX: 0, bodyRotY: 0, bodyRotZ: 0,
    squashX: 1, squashY: 1, squashZ: 1,
    headRotX: 0, headRotY: 0, headRotZ: 0, headPosY: 2.2 * BV,
    snoutWiggleX: 0, snoutWiggleY: 0,
    earLRotZ: 0, earRRotZ: 0, earLRotX: 0, earRRotX: 0,
    browTilt: 0, browY: 0,
    legFLX: 0, legFRX: 0, legBLX: 0, legBRX: 0,
    legFLZ: 0, legFRZ: 0, legBLZ: 0, legBRZ: 0,
    shinFLX: 0, shinFRX: 0, shinBLX: 0, shinBRX: 0,
    tailRotX: 0, tailRotY: 0, tailTipX: 0, tailTipY: 0,
    maneSway: 0, lambda: 12,
  };
}

class BoarMob {
  constructor(scene, world, vfx, homeX, homeZ, yaw = 0) {
    this.kind = 'boar';
    this.scene = scene;
    this.world = world;
    this.vfx = vfx;
    this.rig = buildVoxelBoarRig(scene);
    this.hpBar = new HealthBar3D(scene, { isEnemy: true, width: 1.15 });

    this.homeX = homeX;
    this.homeZ = homeZ;
    this.x = homeX;
    this.z = homeZ;
    this.y = groundY(world, homeX, homeZ);
    this.heading = yaw;
    this.targetHeading = yaw;

    this.maxHp = 135;
    this.hp = this.maxHp;
    this.dmg = 15;
    this.radius = 0.62;
    this.dead = false;
    this.respawnTimer = 0;

    this.state = 'idle';
    this.stateTime = randRange(0, 0.5);
    this.stateDur = randRange(2.0, 4.0);
    this.pose = createEmptyBoarPose();

    this.target = null;       // NPC descriptor { getPos, takeHit, isAlive }
    this.inCombat = false;
    this.isTelegraphing = false;
    this.telegraphType = null;
    this.isVulnerable = false;
    // Postur boar: ditangkis berulang -> penuh -> CELAH (state 'stagger')
    this.posture = 0;
    this.postureHold = 0;
    this.atkCd = 0;
    this.chargeCd = 0;
    this.attackDir = 1;

    this.flashTimer = 0;
    this.hitstunTimer = 0;
    this.knockVx = 0;
    this.knockVz = 0;
    this.recoilPop = 0;

    this.blinkTimer = randRange(1.8, 4.0);
    this.blinkDuration = 0;
    this.earTwitchTimer = randRange(1.4, 3.2);
    this.earTwitchSide = 1;
    this.earTwitchProgress = 1;
    this.stepPuffTimer = 0;
    this.dieSmokeTimer = 0;
    this.dieImpactDone = false;
    this.paw1Done = false;
    this.paw2Done = false;
    this.skidDone = false;
    this.strikeDealt = false;
    this.dashHitDealt = false;
    this._lastFlashHex = 0;
    this.phaseOffset = Math.random() * 10;

    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = this.heading;
  }

  _setState(next, dur = 1.0) {
    this.state = next;
    this.stateTime = 0;
    this.stateDur = dur;
    this.isTelegraphing = next === 'charge_windup' || next === 'attack_windup' || next === 'charge_dash';
    this.telegraphType = next.startsWith('charge') ? 'charge' : next.startsWith('attack') ? 'tusk' : null;
    this.isVulnerable = next === 'charge_skid' || next === 'attack_recover' || next === 'hitstun' || next === 'stagger';
    if (next === 'charge_windup') {
      this.paw1Done = false;
      this.paw2Done = false;
      this.skidDone = false;
      this.dashHitDealt = false;
    }
    if (next === 'attack_windup') {
      this.strikeDealt = false;
    }
    if (next === 'die') {
      this.dieImpactDone = false;
      this.dieSmokeTimer = 0;
      this.dead = true;
      this.isTelegraphing = false;
      this.isVulnerable = false;
    }
  }

  takeDamage(amount, fromX, fromZ, opts = {}) {
    if (this.dead) return 0;
    const dmg = Math.max(1, Math.round(amount));
    this.hp = Math.max(0, this.hp - dmg);
    this.flashTimer = 0.18;
    this.recoilPop = 1.0;
    this.hpBar.onHit();
    this.inCombat = true;

    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const kb = opts.knockback || (opts.isCrit ? 6.2 : 4.0);
    this.knockVx = (dx / d) * kb;
    this.knockVz = (dz / d) * kb;

    if (this.vfx) {
      this.vfx.spawnHitImpact(
        new THREE.Vector3(this.x, this.y + 0.72, this.z),
        opts.vfxColor || (opts.isCrit ? 0xffd447 : 0xffe48f),
        !!opts.isCrit
      );
      this.vfx.spawnDamageText(
        new THREE.Vector3(this.x, this.y + 1.38, this.z),
        opts.isCrit ? `CRIT -${dmg}!` : `-${dmg}`,
        opts.isCrit ? 'crit' : opts.textStyle || 'normal'
      );
      if (opts.isCrit) this.vfx.triggerHitStop(0.055);
      else this.vfx.triggerHitStop(0.03);
      this.vfx.playSfx(opts.isCrit ? 'crit' : 'hit');
    }

    if (opts.attackerRef && !opts.attackerRef.isKO) {
      this.target = opts.attackerRef;
    }

    if (this.hp <= 0) {
      this._setState('die', 7.5);
      this.respawnTimer = 14.0;
    } else if (this.state !== 'charge_dash' && this.hitstunTimer <= 0) {
      // Micro hit-stagger unless super-armored inside charge dash
      this.hitstunTimer = opts.isCrit ? 0.24 : 0.14;
      if (this.state === 'idle' || this.state === 'walk' || this.state === 'stalk') {
        this._setState('hitstun', this.hitstunTimer);
      }
    }
    return dmg;
  }

  /** Tangkisan menumpuk postur. Penuh = boar terhuyung ('stagger') dan terbuka. */
  addPosture(amount) {
    if (this.dead || !(amount > 0)) return;
    this.posture = clamp(this.posture + amount, 0, 1);
    this.postureHold = 1.8;
    if (this.posture >= 1) {
      this.posture = 0;
      this.postureHold = 0;
      this._setState('stagger', 1.30);
      if (this.vfx) {
        this.vfx.triggerHitStop(0.07);
        this.vfx.spawnRing(new THREE.Vector3(this.x, this.y + 0.35, this.z), 0xfff2c4, 0.9, 4.2, 0.40, true);
        this.vfx.spawnDamageText(new THREE.Vector3(this.x, this.y + 1.5, this.z), 'CELAH!', 'crit');
        this.vfx.playSfx('parry');
      }
    }
  }

  _respawn() {
    this.x = this.homeX;
    this.z = this.homeZ;
    this.y = groundY(this.world, this.x, this.z);
    this.hp = this.maxHp;
    this.dead = false;
    this.inCombat = false;
    this.target = null;
    this.posture = 0;
    this.postureHold = 0;
    this.knockVx = 0; this.knockVz = 0;
    this.rig.dizzyHalo.visible = false;
    this.rig.dizzyHalo.scale.setScalar(0.001);
    this.rig.root.visible = true;
    this._setState('idle', 2.0);
    if (this.vfx) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.vfx.spawnDust(new THREE.Vector3(this.x, this.y + 0.2, this.z), new THREE.Vector3(Math.cos(a) * 1.2, 0.9, Math.sin(a) * 1.2), 0.16, 0.5);
      }
    }
  }

  _applyFlash(dt) {
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    const hex = this.flashTimer > 0 ? 0xff7055 : 0x000000;
    if (hex !== this._lastFlashHex) {
      this._lastFlashHex = hex;
      for (const k of Object.keys(this.rig.materials)) {
        const m = this.rig.materials[k];
        if (m && m.emissive) m.emissive.setHex(hex);
      }
    }
  }

  update(dt, globalTime) {
    this._applyFlash(dt);

    // Dead & KO sequence -> poof -> respawn at territory
    if (this.dead) {
      this.stateTime += dt;
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this._respawn();
        return;
      }
      if (this.stateTime > 6.5) {
        this.rig.root.visible = false;
        this.hpBar.setHp(0, this.maxHp, false, dt);
        return;
      }
      const p = this._evalDiePose(dt);
      this._blendAndApply(dt, globalTime, p);
      this.hpBar.setPosture(0, false);
      this.hpBar.setHp(0, this.maxHp, true, dt);
      this.hpBar.updateTransform(this.x, this.y + 1.35, this.z, dt);
      return;
    }

    this.stateTime += dt;
    if (this.atkCd > 0) this.atkCd = Math.max(0, this.atkCd - dt);
    if (this.chargeCd > 0) this.chargeCd = Math.max(0, this.chargeCd - dt);
    if (this.hitstunTimer > 0) this.hitstunTimer = Math.max(0, this.hitstunTimer - dt);
    // Postur pulih sendiri kalau sebentar tidak ada tangkisan (jeda tenang)
    if (this.postureHold > 0) this.postureHold = Math.max(0, this.postureHold - dt);
    else if (this.posture > 0) this.posture = Math.max(0, this.posture - 0.26 * dt);
    if (this.recoilPop > 0) this.recoilPop = Math.max(0, this.recoilPop - dt * 5.0);

    // Validate current target & leash
    if (this.target) {
      const tp = this.target.getPos();
      const dHome = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
      const dTgt = tp ? Math.hypot(tp.x - this.x, tp.z - this.z) : 999;
      if (!this.target.isAlive() || dHome > 21.0 || dTgt > 17.0) {
        this.target = null;
        this.inCombat = false;
      }
    }
    this.inCombat = !!this.target && !this.dead;

    let forwardSpeed = 0;

    if (this.state === 'hitstun') {
      if (this.stateTime >= this.stateDur) {
        this._setState(this.target ? 'stalk' : 'walk', 1.8);
      }
    } else if (this.state === 'stagger') {
      // Postur pecah: terhuyung tanpa bisa menyerang, celah jelas untuk dibalas
      if (this.stateTime >= this.stateDur) {
        this._setState(this.target ? 'stalk' : 'idle', randRange(1.0, 1.6));
      }
    } else if (this.state === 'charge_windup') {
      if (this.target) {
        const tp = this.target.getPos();
        // Lock charge direction in the first 0.55 s, then freeze aim so NPC can read & dodge!
        if (this.stateTime < 0.52) {
          this.targetHeading = Math.atan2(tp.x - this.x, tp.z - this.z);
          this.heading = turnToward(this.heading, this.targetHeading, 9.0, dt);
        }
      }
      if (this.stateTime >= 0.95) {
        this._setState('charge_dash', 0.85);
      }
    } else if (this.state === 'charge_dash') {
      forwardSpeed = 7.6;
      if (this.target && !this.dashHitDealt) {
        const tp = this.target.getPos();
        const d = Math.hypot(tp.x - this.x, tp.z - this.z);
        if (d < 1.38) {
          this.dashHitDealt = true;
          this.target.takeHit(Math.round(this.dmg * 1.35), this.x, this.z, true);
        }
      }
      if (this.stateTime >= 0.85) {
        this.chargeCd = 5.2;
        this.atkCd = 2.1;
        this._setState('charge_skid', 0.65);
      }
    } else if (this.state === 'charge_skid') {
      forwardSpeed = Math.max(0, (1 - this.stateTime / 0.65) * 2.5);
      if (this.stateTime >= 0.65) {
        this._setState(this.target ? 'stalk' : 'idle', randRange(0.9, 1.5));
      }
    } else if (this.state === 'attack_windup') {
      if (this.target) {
        const tp = this.target.getPos();
        this.targetHeading = Math.atan2(tp.x - this.x, tp.z - this.z);
        this.heading = turnToward(this.heading, this.targetHeading, 11.0, dt);
      }
      if (this.stateTime >= 0.55) {
        this._setState('attack_strike', 0.34);
      }
    } else if (this.state === 'attack_strike') {
      forwardSpeed = 1.8;
      if (!this.strikeDealt && this.stateTime >= 0.08) {
        this.strikeDealt = true;
        if (this.vfx) {
          const mouth = new THREE.Vector3(
            this.x + Math.sin(this.heading) * 0.55,
            this.y + 0.05,
            this.z + Math.cos(this.heading) * 0.55
          );
          this.vfx.spawnSlashArc(mouth, this.heading, 0xf49d6e, 0xffe48f, this.attackDir, 1.05);
        }
        if (this.target) {
          const tp = this.target.getPos();
          const d = Math.hypot(tp.x - this.x, tp.z - this.z);
          if (d < 2.25) {
            this.target.takeHit(this.dmg, this.x, this.z, false);
          }
        }
        this.attackDir *= -1;
      }
      if (this.stateTime >= 0.34) {
        this.atkCd = 2.0;
        this._setState('attack_recover', 0.70);
      }
    } else if (this.state === 'attack_recover') {
      if (this.stateTime >= 0.70) {
        this._setState(this.target ? 'stalk' : 'idle', 1.2);
      }
    } else if (this.target) {
      // Tactical pursuit / stalking
      const tp = this.target.getPos();
      const dx = tp.x - this.x, dz = tp.z - this.z;
      const d = Math.hypot(dx, dz);
      this.targetHeading = Math.atan2(dx, dz);
      this.heading = turnToward(this.heading, this.targetHeading, 6.5, dt);

      if (this.atkCd <= 0 && d <= 2.15) {
        this._setState('attack_windup', 0.55);
      } else if (this.chargeCd <= 0 && d >= 3.8 && d <= 8.2) {
        this._setState('charge_windup', 0.95);
      } else if (d > 2.0) {
        forwardSpeed = d > 4.5 ? 4.4 : 2.9;
      }
    } else {
      // Peaceful patrol around forest territory
      const dh = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
      if (this.stateTime >= this.stateDur) {
        if (this.state === 'walk') {
          this._setState('idle', randRange(2.0, 4.2));
        } else {
          this.targetHeading = dh > 5.5
            ? Math.atan2(this.homeX - this.x, this.homeZ - this.z) + randRange(-0.5, 0.5)
            : this.heading + randRange(-1.5, 1.5);
          this._setState('walk', randRange(2.2, 4.0));
        }
      }
      if (this.state === 'walk') {
        forwardSpeed = 1.55;
        this.heading = turnToward(this.heading, this.targetHeading, 4.2, dt);
      } else {
        // Slowly regen out of combat
        if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 10 * dt);
      }
    }

    // Apply movement & knockback
    if (forwardSpeed > 0.01) {
      this.x += Math.sin(this.heading) * forwardSpeed * dt;
      this.z += Math.cos(this.heading) * forwardSpeed * dt;
    }
    if (Math.hypot(this.knockVx, this.knockVz) > 0.05) {
      this.x += this.knockVx * dt;
      this.z += this.knockVz * dt;
      const dampK = Math.exp(-8.5 * dt);
      this.knockVx *= dampK;
      this.knockVz *= dampK;
    }

    const pos2 = { x: this.x, z: this.z };
    const col = keepOutOfPondAndBounds(pos2, this.world, this.radius);
    this.x = pos2.x;
    this.z = pos2.z;
    if (col.hit && Math.hypot(col.nx, col.nz) > 1e-4) {
      const nAng = Math.atan2(col.nx, col.nz);
      this.targetHeading = nAng + 0.85;
      this.heading = turnToward(this.heading, this.targetHeading, 12, dt);
    }
    this.y = groundY(this.world, this.x, this.z);

    const p = this._evalLivePose(dt, globalTime, forwardSpeed);
    if (this.recoilPop > 0) {
      const pop = Math.sin(this.recoilPop * Math.PI);
      p.squashY -= pop * 0.16;
      p.squashX += pop * 0.14;
      p.squashZ -= pop * 0.08;
    }
    this._blendAndApply(dt, globalTime, p);

    this.hpBar.setPosture(this.posture, this.inCombat);
    this.hpBar.setHp(this.hp, this.maxHp, this.inCombat, dt);
    this.hpBar.updateTransform(this.x, this.y + 1.40, this.z, dt);
  }

  _evalLivePose(dt, gt, speed) {
    const p = createEmptyBoarPose();
    const st = this.stateTime;

    if (this.state === 'hitstun') {
      const u = clamp(st / Math.max(0.1, this.stateDur), 0, 1);
      p.bodyY = BBODY_BASE_Y + Math.sin(u * Math.PI) * 0.08;
      p.bodyRotX = -0.22 * (1 - u);
      p.bodyRotZ = Math.sin(st * 45) * 0.12 * (1 - u);
      p.squashY = 0.86; p.squashX = 1.12;
      p.browTilt = -0.35; p.headRotX = -0.25 * (1 - u);
      p.lambda = 26;
      return p;
    }

    if (this.state === 'stagger') {
      // Terhuyung: badan oleng, kepala menggantung, kaki lemas — jeda yang jelas
      const u = clamp(st / Math.max(0.2, this.stateDur), 0, 1);
      const wob = Math.sin(st * 9.5) * (1 - u);
      p.bodyY = BBODY_BASE_Y - 0.10 + Math.sin(u * Math.PI) * 0.05;
      p.bodyRotX = -0.16 - Math.sin(u * Math.PI) * 0.12;
      p.bodyRotZ = wob * 0.20;
      p.headRotX = -0.34 * (1 - u * 0.6);
      p.headRotZ = wob * 0.26;
      p.earLRotX = -0.20; p.earRRotX = -0.20;
      p.browTilt = -0.42; p.squashY = 0.94; p.squashX = 1.05;
      p.lambda = 13;
      return p;
    }

    if (this.state === 'charge_windup') {
      const ct = st;
      p.localZ = -0.32 * easeOutCubic(Math.min(1, ct * 1.8));
      p.localX = Math.sin(ct * 54) * 0.018;
      p.bodyY = BBODY_BASE_Y - 0.14; p.bodyRotX = 0.16;
      p.squashY = 0.85; p.squashX = 1.11; p.squashZ = 1.06;
      p.headRotX = 0.42 + Math.sin(ct * 18) * 0.025;
      p.browTilt = 0.54; p.browY = -0.026;
      p.earLRotX = -0.55; p.earRRotX = -0.55; p.earLRotZ = 0.25; p.earRRotZ = -0.25;
      let pawA = 0, pawS = 0.15;
      if (ct > 0.18 && ct < 0.48) {
        const pu = (ct - 0.18) / 0.30;
        pawA = Math.sin(pu * Math.PI * 2) * 0.65;
        pawS = Math.max(0, Math.sin(pu * Math.PI)) * 0.72;
        if (ct > 0.30 && !this.paw1Done && this.vfx) {
          this.paw1Done = true;
          this.vfx.spawnDust(new THREE.Vector3(this.x, this.y + 0.08, this.z), new THREE.Vector3(-Math.sin(this.heading) * 1.4, 0.7, -Math.cos(this.heading) * 1.4), 0.15, 0.42);
        }
      } else if (ct > 0.56 && ct < 0.86) {
        const pu = (ct - 0.56) / 0.30;
        pawA = Math.sin(pu * Math.PI * 2) * 0.72;
        pawS = Math.max(0, Math.sin(pu * Math.PI)) * 0.82;
        if (ct > 0.68 && !this.paw2Done && this.vfx) {
          this.paw2Done = true;
          this.vfx.spawnDust(new THREE.Vector3(this.x, this.y + 0.08, this.z), new THREE.Vector3(-Math.sin(this.heading) * 1.6, 0.8, -Math.cos(this.heading) * 1.6), 0.17, 0.45);
        }
      }
      p.legFRX = pawA; p.shinFRX = pawS;
      p.legFLX = -0.22; p.shinFLX = 0.28; p.legBLX = 0.25; p.legBRX = 0.25;
      p.tailRotX = 0.45; p.tailRotY = Math.sin(ct * 24) * 0.14; p.maneSway = -0.22;
      p.lambda = 18;
      return p;
    }

    if (this.state === 'charge_dash') {
      const ph = st * 21.0;
      p.bodyY = BBODY_BASE_Y - 0.07 + Math.abs(Math.sin(ph)) * 0.14;
      p.bodyRotX = 0.20 + Math.cos(ph) * 0.12;
      p.squashZ = 1.18; p.squashY = 0.88; p.squashX = 0.94;
      p.headRotX = 0.44; p.browTilt = 0.58; p.browY = -0.03;
      p.legFLX = Math.sin(ph) * 1.02; p.legFRX = Math.sin(ph + 0.4) * 1.02;
      p.legBLX = Math.sin(ph + Math.PI) * 1.05; p.legBRX = Math.sin(ph + Math.PI + 0.35) * 1.05;
      p.shinFLX = Math.max(0, Math.cos(ph)) * 0.88; p.shinFRX = Math.max(0, Math.cos(ph + 0.4)) * 0.88;
      p.shinBLX = Math.max(0, Math.cos(ph + Math.PI)) * 0.82; p.shinBRX = Math.max(0, Math.cos(ph + Math.PI + 0.35)) * 0.82;
      p.earLRotX = -0.78; p.earRRotX = -0.78; p.earLRotZ = 0.34; p.earRRotZ = -0.34;
      p.tailRotX = 0.62; p.maneSway = -0.34; p.lambda = 24;
      this.stepPuffTimer += dt;
      if (this.stepPuffTimer >= 0.07 && this.vfx) {
        this.stepPuffTimer = 0;
        const bx = this.x - Math.sin(this.heading) * 0.55;
        const bz = this.z - Math.cos(this.heading) * 0.55;
        this.vfx.spawnDust(new THREE.Vector3(bx, this.y + 0.1, bz), new THREE.Vector3(randRange(-0.7, 0.7), 0.7, randRange(-0.7, 0.7)), 0.18, 0.48);
        if (Math.random() > 0.35) {
          this.vfx.spawnSpeedLine(new THREE.Vector3(this.x + randRange(-0.5, 0.5), this.y + randRange(0.35, 1.0), this.z + randRange(-0.5, 0.5)), this.heading);
        }
      }
      return p;
    }

    if (this.state === 'charge_skid') {
      const u = clamp(st / 0.65, 0, 1);
      if (!this.skidDone && this.vfx) {
        this.skidDone = true;
        for (let k = 0; k < 5; k++) {
          this.vfx.spawnDust(new THREE.Vector3(this.x + randRange(-0.3, 0.3), this.y + 0.1, this.z + randRange(-0.3, 0.3)), new THREE.Vector3(randRange(-1.1, 1.1), 0.65, randRange(-1.1, 1.1)), 0.18, 0.5);
        }
      }
      const pk = Math.sin(Math.min(1, u * 1.8) * Math.PI);
      p.bodyY = BBODY_BASE_Y - 0.02 - pk * 0.08;
      p.bodyRotX = -pk * 0.28; p.squashY = 1 - pk * 0.10;
      p.legFLX = -pk * 0.65; p.legFRX = -pk * 0.65; p.legBLX = -pk * 0.4; p.legBRX = -pk * 0.4;
      p.headRotX = -pk * 0.22; p.browTilt = (1 - u) * 0.3; p.lambda = 14;
      return p;
    }

    if (this.state === 'attack_windup') {
      const u = easeInOutCubic(st / 0.55);
      const dir = this.attackDir;
      p.localZ = -0.22 * u; p.bodyY = BBODY_BASE_Y - 0.14 * u;
      p.bodyRotX = 0.18 * u; p.bodyRotY = -dir * 0.34 * u; p.bodyRotZ = dir * 0.10 * u;
      p.squashY = 1 - 0.14 * u; p.squashX = 1 + 0.10 * u;
      p.headRotX = 0.46 * u; p.headRotY = -dir * 0.46 * u; p.headRotZ = dir * 0.24 * u;
      p.browTilt = 0.52 * u; p.browY = -0.025 * u; p.lambda = 18;
      return p;
    }

    if (this.state === 'attack_strike') {
      const u = clamp(st / 0.34, 0, 1);
      const snap = easeOutBack(Math.min(1, u * 1.15));
      const dir = this.attackDir;
      const pop = Math.sin(u * Math.PI);
      p.localZ = THREE.MathUtils.lerp(-0.22, 0.30, Math.min(1, snap));
      p.bodyY = BBODY_BASE_Y + pop * 0.22;
      p.bodyRotX = THREE.MathUtils.lerp(0.18, -0.24, Math.min(1, snap));
      p.bodyRotY = THREE.MathUtils.lerp(-dir * 0.34, dir * 0.40, Math.min(1, snap));
      p.squashY = 1 + pop * 0.18; p.squashX = 1 - pop * 0.10;
      p.headRotX = THREE.MathUtils.lerp(0.46, -0.60, Math.min(1, snap));
      p.headRotY = THREE.MathUtils.lerp(-dir * 0.46, dir * 0.54, Math.min(1, snap));
      p.headRotZ = THREE.MathUtils.lerp(dir * 0.24, -dir * 0.34, Math.min(1, snap));
      p.browTilt = 0.60; p.lambda = 28;
      return p;
    }

    if (this.state === 'attack_recover') {
      const u = clamp(st / 0.70, 0, 1);
      const settle = easeInOutCubic(u);
      p.localZ = THREE.MathUtils.lerp(0.30, 0, settle);
      p.headRotX = THREE.MathUtils.lerp(-0.48, 0.04, settle);
      p.browTilt = THREE.MathUtils.lerp(0.5, 0.15, settle);
      p.lambda = 12;
      return p;
    }

    if (speed > 2.2) {
      // Run / Stalk gallop
      const ph = st * 11.4;
      const air = Math.max(0, Math.sin(ph - 0.45));
      p.legFLX = Math.sin(ph) * 0.85; p.legFRX = Math.sin(ph + 0.32) * 0.85;
      p.legBLX = Math.sin(ph + Math.PI) * 0.88; p.legBRX = Math.sin(ph + Math.PI + 0.28) * 0.88;
      p.shinFLX = Math.max(0, Math.cos(ph - 0.25)) * 0.76; p.shinFRX = Math.max(0, Math.cos(ph + 0.07)) * 0.76;
      p.shinBLX = Math.max(0, Math.cos(ph + Math.PI - 0.2)) * 0.70; p.shinBRX = Math.max(0, Math.cos(ph + Math.PI + 0.08)) * 0.70;
      p.bodyY = BBODY_BASE_Y + air * 0.22;
      p.bodyRotX = Math.cos(ph) * 0.22 + 0.06;
      p.headRotX = -p.bodyRotX * 0.55 - 0.08;
      p.browTilt = 0.36; p.browY = -0.015;
      p.earLRotX = -0.45; p.earRRotX = -0.45;
      p.tailRotX = 0.36; p.maneSway = -0.16; p.lambda = 18;
      return p;
    }

    if (speed > 0.25) {
      // Patrol walk
      const ph = st * 6.8;
      const sA = Math.sin(ph), sB = Math.sin(ph + Math.PI);
      const bounce = Math.abs(sA);
      p.legFLX = sA * 0.52; p.legBRX = sA * 0.52;
      p.legFRX = sB * 0.52; p.legBLX = sB * 0.52;
      p.shinFLX = Math.max(0, Math.cos(ph)) * 0.46; p.shinBRX = Math.max(0, Math.cos(ph)) * 0.42;
      p.shinFRX = Math.max(0, Math.cos(ph + Math.PI)) * 0.46; p.shinBLX = Math.max(0, Math.cos(ph + Math.PI)) * 0.42;
      p.bodyY = BBODY_BASE_Y - 0.01 + bounce * 0.11;
      p.bodyRotZ = sA * 0.08; p.bodyRotY = Math.cos(ph) * 0.05;
      p.headRotX = -0.04 + Math.sin(ph * 2 - 0.85) * 0.07;
      p.tailRotY = Math.sin(ph * 2) * 0.42;
      p.browTilt = this.inCombat ? 0.3 : 0;
      p.lambda = 14;
      return p;
    }

    // Idle
    const breath = Math.sin(gt * 2.4 + this.phaseOffset);
    p.bodyY = BBODY_BASE_Y + breath * 0.014;
    p.squashY = 1 + breath * 0.032; p.squashX = 1 - breath * 0.022;
    p.headRotY = this.inCombat ? 0 : Math.sin(gt * 0.85 + this.phaseOffset) * 0.14;
    p.headRotZ = this.inCombat ? 0 : Math.sin(gt * 0.72 + this.phaseOffset) * 0.06;
    p.browTilt = this.inCombat ? 0.38 : 0;
    p.tailRotY = Math.sin(gt * 4.8 + this.phaseOffset) * 0.32;
    p.lambda = 9;
    return p;
  }

  _evalDiePose(dt) {
    const p = createEmptyBoarPose();
    const st = this.stateTime;
    if (st < 0.28) {
      const u = st / 0.28;
      const hop = easeOutCubic(u);
      p.localX = Math.sin(st * 75) * 0.06 * (1 - u);
      p.bodyY = BBODY_BASE_Y + hop * 0.50;
      p.bodyRotX = -0.22 * hop; p.bodyRotZ = 0.32 * hop;
      p.squashY = 1 + hop * 0.20; p.squashX = 1 - hop * 0.14;
      p.browTilt = -0.38; p.legFLZ = 0.45 * hop; p.legFRZ = -0.45 * hop;
      p.legBLZ = 0.42 * hop; p.legBRZ = -0.42 * hop;
      p.lambda = 26;
    } else if (st < 0.82) {
      const u = (st - 0.28) / 0.54;
      const drop = easeInOutCubic(u);
      p.bodyY = THREE.MathUtils.lerp(BBODY_BASE_Y + 0.50, 0.43, drop) + Math.sin(u * Math.PI) * 0.15;
      p.bodyRotZ = THREE.MathUtils.lerp(0.32, Math.PI * 0.51, easeOutCubic(u));
      if (u > 0.76 && !this.dieImpactDone && this.vfx) {
        this.dieImpactDone = true;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          this.vfx.spawnDust(new THREE.Vector3(this.x + Math.cos(a) * 0.36, this.y + 0.16, this.z + Math.sin(a) * 0.36), new THREE.Vector3(Math.cos(a) * 1.4, 0.9, Math.sin(a) * 1.4), 0.19, 0.65, 0xeee2d7);
          this.vfx.spawnSparkStar(new THREE.Vector3(this.x, this.y + 0.45, this.z), new THREE.Vector3(Math.cos(a) * 1.6, 1.8, Math.sin(a) * 1.6), 0.10, 0.58);
        }
      }
      p.browTilt = -0.35; p.lambda = 18;
    } else {
      const restT = st - 0.82;
      const fade = Math.exp(-restT * 2.2);
      const tw1 = Math.sin(restT * 18) * 0.28 * fade;
      p.bodyY = 0.43; p.bodyRotZ = Math.PI * 0.51; p.bodyRotX = 0.08;
      p.legFLX = -0.18 + tw1; p.legFRX = 0.16 - tw1;
      p.legFLZ = 0.26; p.legFRZ = -0.20; p.legBLZ = 0.24; p.legBRZ = -0.18;
      p.browTilt = -0.35; p.lambda = 10;
      this.dieSmokeTimer += dt;
      if (this.dieSmokeTimer >= 0.45 && this.vfx) {
        this.dieSmokeTimer = 0;
        this.vfx.spawnDust(new THREE.Vector3(this.x + randRange(-0.3, 0.3), this.y + 0.45, this.z + randRange(-0.3, 0.3)), new THREE.Vector3(randRange(-0.2, 0.2), 0.72, randRange(-0.2, 0.2)), 0.14, 0.85, 0xf0e4d8);
      }
    }
    return p;
  }

  _blendAndApply(dt, gt, target) {
    const r = this.rig;
    const lam = target.lambda;
    for (const k in this.pose) {
      if (k === 'lambda') continue;
      this.pose[k] = damp(this.pose[k], target[k], lam, dt);
    }
    const p = this.pose;

    // Position root at (x,y,z) + local animation lunge offset rotated by heading
    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);
    r.root.position.set(this.x + sx * p.localZ + cz * p.localX, this.y, this.z + cz * p.localZ - sx * p.localX);
    r.root.rotation.y = this.heading;

    r.squash.scale.set(p.squashX, p.squashY, p.squashZ);
    r.body.position.y = p.bodyY;
    r.body.rotation.set(p.bodyRotX, p.bodyRotY, p.bodyRotZ);
    r.head.position.y = p.headPosY;
    r.head.rotation.set(p.headRotX, p.headRotY, p.headRotZ);
    r.snout.position.x = p.snoutWiggleX;
    r.snout.position.y = -1.05 * BV + p.snoutWiggleY;

    r.ears.L.rotation.set(p.earLRotX, 0, p.earLRotZ);
    r.ears.R.rotation.set(p.earRRotX, 0, p.earRRotZ);
    r.brows.L.rotation.z = -p.browTilt;
    r.brows.R.rotation.z = p.browTilt;
    r.brows.L.position.y = 2.55 * BV + p.browY;
    r.brows.R.position.y = 2.55 * BV + p.browY;

    r.legs.FL.rotation.set(p.legFLX, 0, p.legFLZ);
    r.legs.FR.rotation.set(p.legFRX, 0, p.legFRZ);
    r.legs.BL.rotation.set(p.legBLX, 0, p.legBLZ);
    r.legs.BR.rotation.set(p.legBRX, 0, p.legBRZ);
    r.shins.FL.rotation.x = p.shinFLX; r.shins.FR.rotation.x = p.shinFRX;
    r.shins.BL.rotation.x = p.shinBLX; r.shins.BR.rotation.x = p.shinBRX;

    r.tail.rotation.set(p.tailRotX, p.tailRotY, 0);
    r.tailTip.rotation.set(p.tailTipX, p.tailTipY, 0);
    for (const tuft of r.maneTufts) {
      tuft.pivot.rotation.x = p.maneSway + Math.sin(gt * 5 - tuft.phaseOffset) * 0.035;
    }

    const isDead = this.dead;
    r.eyesAlive.L.visible = !isDead; r.eyesAlive.R.visible = !isDead;
    r.eyelids.L.visible = !isDead; r.eyelids.R.visible = !isDead;
    r.eyesDead.L.visible = isDead; r.eyesDead.R.visible = isDead;

    if (!isDead) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkDuration = 0.16;
        this.blinkTimer = 2.2 + Math.random() * 2.8;
      }
      let lid = 0.001;
      if (this.blinkDuration > 0) {
        this.blinkDuration = Math.max(0, this.blinkDuration - dt);
        lid = Math.max(0.001, Math.sin((this.blinkDuration / 0.16) * Math.PI));
      }
      r.eyelids.L.scale.y = lid;
      r.eyelids.R.scale.y = lid;
    } else {
      const showDizzy = this.stateTime > 0.68 && this.stateTime < 6.4;
      r.dizzyHalo.visible = showDizzy;
      if (showDizzy) {
        r.dizzyHalo.scale.setScalar(damp(r.dizzyHalo.scale.x, 1.0, 9, dt));
        r.dizzyHalo.position.set(0, 1.15, 0.35);
        r.dizzyStars.forEach((sv, idx) => {
          const a = gt * 3.6 + (idx * Math.PI * 2) / 3;
          sv.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.35);
          sv.rotation.y = gt * 4.5 + idx;
        });
      }
    }
  }
  dispose() {
    if (this.rig && this.rig.root && this.scene) {
      this.scene.remove(this.rig.root);
    }
    if (this.hpBar) {
      this.hpBar.dispose();
    }
  }
}

/* ============================================================================
   4B. SYLVAN-STYLE FOREST BANDITS (SMALL CUTTHROAT SCOUT & BIG GREATAXE BRUTE)
   ============================================================================ */
function keepBanditInForest(pos, world, radius) {
  const dP = Math.hypot(pos.x - POND.x, pos.z - POND.z);
  const minPond = POND.safeR + radius + 0.6;
  if (dP < minPond && dP > 1e-4) {
    pos.x = POND.x + ((pos.x - POND.x) / dP) * minPond;
    pos.z = POND.z + ((pos.z - POND.z) / dP) * minPond;
  }
  // Keep bandits roaming in the forest across the 5x map and outside all 5 villages
  if (world && Array.isArray(world.VILLAGES) && world.VILLAGES.length) {
    for (let i = 0; i < world.VILLAGES.length; i++) {
      const v = world.VILLAGES[i];
      const safeR = (v.radius * 1.95) + radius + 1.5;
      const dx = pos.x - v.cx;
      const dz = pos.z - v.cz;
      const d = Math.hypot(dx, dz);
      if (d < safeR) {
        const inv = d > 1e-4 ? (safeR / d) : 1.0;
        pos.x = v.cx + (d > 1e-4 ? dx * inv : safeR);
        pos.z = v.cz + (d > 1e-4 ? dz * inv : 0);
      }
    }
  } else {
    const vCx = (world && typeof world._getRoadCenterX === 'function') ? world._getRoadCenterX(pos.z) : -5.4;
    if (pos.z > 41.0 && pos.z < 112.0 && Math.abs(pos.x - vCx) < 31.0) {
      const pushSouth = pos.z - 41.0;
      const pushNorth = 112.0 - pos.z;
      const pushSide = 31.0 - Math.abs(pos.x - vCx);
      if (pushSouth <= pushSide && pushSouth <= pushNorth) pos.z = 41.0;
      else if (pushNorth <= pushSide) pos.z = 112.0;
      else pos.x = vCx + Math.sign(pos.x - vCx || 1) * 31.0;
    }
  }
  // Keep bandits out of deep water channels
  if (world && typeof world.waterDepthAt === 'function' && world.waterDepthAt(pos.x, pos.z) > 0.25) {
    const rCenter = world._riverCenterZ ? world._riverCenterZ(pos.x) : 30;
    const side = pos.z >= rCenter ? 1 : -1;
    pos.z = rCenter + side * 6.8;
  }
  const dO = Math.hypot(pos.x, pos.z);
  if (dO > 715.0) {
    pos.x = (pos.x / dO) * 715.0;
    pos.z = (pos.z / dO) * 715.0;
  }
  if (world && typeof world.resolveCircleCollision === 'function') {
    const res = world.resolveCircleCollision(pos.x, pos.z, radius);
    if (res.hit) {
      pos.x = res.x;
      pos.z = res.z;
    }
    return res;
  }
  return { hit: false, nx: 0, nz: 0 };
}

class BanditMob {
  constructor(scene, world, vfx, variant, waypoints, yaw = 0) {
    this.kind = 'bandit';
    this.variant = variant === 'big' ? 'big' : 'small';
    const isBig = this.variant === 'big';

    this.scene = scene;
    this.world = world;
    this.vfx = vfx;

    const isMobile = !!(HC.QUALITY && HC.QUALITY.key !== 'high');
    const built = isBig ? buildBigBandit(isMobile) : buildSmallBandit(isMobile);
    this.mesh = built.mesh;
    this.parts = built.parts;
    this.material = built.material;
    this.hpBar = new HealthBar3D(scene, { isEnemy: true, width: isBig ? 1.42 : 1.04 });

    this.waypoints = Array.isArray(waypoints) && waypoints.length ? waypoints : [{ x: 0, z: 0 }];
    this.wpIdx = 0;
    this.homeX = this.waypoints[0].x;
    this.homeZ = this.waypoints[0].z;
    this.x = this.homeX;
    this.z = this.homeZ;
    this.y = groundY(world, this.x, this.z);
    this.heading = yaw;
    this.targetHeading = yaw;

    this.maxHp = isBig ? 240 : 115;
    this.hp = this.maxHp;
    this.dmg = isBig ? 26 : 14;
    this.walkSpd = isBig ? 1.45 : 2.10;
    // Kecepatan lari bandit minimal 30% lebih pelan dari kuda berlari (5.25 * 0.70 = 3.675 m/s)
    this.chaseSpd = isBig ? 2.65 : 3.55;
    this.isRoadAmbush = false;
    this.radius = isBig ? 0.68 : 0.45;
    this.reach = isBig ? 2.65 : 2.05;
    this.windupDur = isBig ? 0.68 : 0.38;
    this.recoverDur = isBig ? 0.92 : 0.60;
    this.hpBarOffset = isBig ? 2.78 : 1.92;

    this.dead = false;
    this.respawnTimer = 0;
    this.state = 'idle';
    this.stateTime = randRange(0, 0.5);
    this.stateDur = randRange(1.5, 3.0);

    this.target = null;
    this.inCombat = false;
    this.isTelegraphing = false;
    this.telegraphType = null;
    this.isVulnerable = false;
    this.posture = 0;
    this.postureHold = 0;
    this.atkCd = 0;
    this.strafeDir = isBig ? 1 : (Math.random() > 0.5 ? 1 : -1);

    this.flashTimer = 0;
    this.hitstunTimer = 0;
    this.knockVx = 0;
    this.knockVz = 0;
    this.recoilPop = 0;
    this.strikeDealt = false;

    this.animState = {
      mesh: this.mesh,
      parts: this.parts,
      material: this.material,
      vel: { x: 0, z: 0 },
      flash: 0,
      swing: 0,
      telegraph: 0,
      target: null,
    };

    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    this.scene.add(this.mesh);
  }

  _setState(next, dur = 1.0) {
    this.state = next;
    this.stateTime = 0;
    this.stateDur = dur;
    this.isTelegraphing = next === 'attack_windup';
    this.telegraphType = next === 'attack_windup' ? (this.variant === 'big' ? 'charge' : 'slash') : null;
    this.isVulnerable = next === 'attack_recover' || next === 'hitstun' || next === 'stagger';
    if (next === 'attack_windup') {
      this.strikeDealt = false;
    }
    if (next === 'die') {
      this.dead = true;
      this.isTelegraphing = false;
      this.isVulnerable = false;
    }
  }

  takeDamage(amount, fromX, fromZ, opts = {}) {
    if (this.dead) return 0;
    const dmg = Math.max(1, Math.round(amount));
    this.hp = Math.max(0, this.hp - dmg);
    this.flashTimer = 0.20;
    this.recoilPop = 1.0;
    this.hpBar.onHit();
    this.inCombat = true;

    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const kbMul = this.variant === 'big' ? 0.55 : 1.0;
    const kb = (opts.knockback || (opts.isCrit ? 5.6 : 3.6)) * kbMul;
    this.knockVx = (dx / d) * kb;
    this.knockVz = (dz / d) * kb;

    if (this.vfx) {
      this.vfx.spawnHitImpact(
        new THREE.Vector3(this.x, this.y + (this.variant === 'big' ? 1.25 : 0.85), this.z),
        opts.vfxColor || (opts.isCrit ? 0xffd447 : 0xffe48f),
        !!opts.isCrit
      );
      this.vfx.spawnDamageText(
        new THREE.Vector3(this.x, this.y + this.hpBarOffset - 0.1, this.z),
        opts.isCrit ? `CRIT -${dmg}!` : `-${dmg}`,
        opts.isCrit ? 'crit' : opts.textStyle || 'normal'
      );
      this.vfx.triggerHitStop(opts.isCrit ? 0.055 : 0.03);
      this.vfx.playSfx(opts.isCrit ? 'crit' : 'hit');
    }

    if (opts.attackerRef && !opts.attackerRef.isKO) {
      this.target = opts.attackerRef;
    }

    if (this.hp <= 0) {
      this._setState('die', 7.5);
      this.respawnTimer = 16.0;
    } else if (this.hitstunTimer <= 0 && this.state !== 'attack_strike') {
      this.hitstunTimer = opts.isCrit ? 0.24 : 0.14;
      if (this.state === 'idle' || this.state === 'walk' || this.state === 'stalk') {
        this._setState('hitstun', this.hitstunTimer);
      }
    }
    return dmg;
  }

  addPosture(amount) {
    if (this.dead || !(amount > 0)) return;
    this.posture = clamp(this.posture + amount * (this.variant === 'big' ? 0.82 : 1.0), 0, 1);
    this.postureHold = 1.9;
    if (this.posture >= 1) {
      this.posture = 0;
      this.postureHold = 0;
      this._setState('stagger', 1.30);
      if (this.vfx) {
        this.vfx.triggerHitStop(0.07);
        this.vfx.spawnRing(new THREE.Vector3(this.x, this.y + 0.45, this.z), 0xfff2c4, 0.9, 4.2, 0.40, true);
        this.vfx.spawnDamageText(new THREE.Vector3(this.x, this.y + this.hpBarOffset, this.z), 'CELAH!', 'crit');
        this.vfx.playSfx('parry');
      }
    }
  }

  _respawn() {
    this.wpIdx = 0;
    this.x = this.homeX;
    this.z = this.homeZ;
    this.y = groundY(this.world, this.x, this.z);
    this.hp = this.maxHp;
    this.dead = false;
    this.inCombat = false;
    this.target = null;
    this.posture = 0;
    this.postureHold = 0;
    this.knockVx = 0; this.knockVz = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.heading, 0);
    this.mesh.scale.setScalar(1);
    this._setState('idle', 2.0);
  }

  _pickTarget(fullCtx, npcOnly = false) {
    const party = fullCtx && fullCtx.party;
    let best = null;
    let bestD = this.isRoadAmbush ? 22.0 : 10.5;
    const maxHomeDist = this.isRoadAmbush ? 42.0 : 23.0;
    const consider = (ent, root) => {
      if (!ent || ent.isIndoors || ent.recruited) return;
      if (ent.cBrain && ent.cBrain.phase === 'ko') return;
      const d = Math.hypot(ent.x - this.x, ent.z - this.z);
      const dHome = Math.hypot(ent.x - this.homeX, ent.z - this.homeZ);
      if (d < bestD && dHome < maxHomeDist) {
        bestD = d;
        best = {
          id: ent,
          get isKO() { return !!(ent.cBrain && ent.cBrain.phase === 'ko'); },
          isAlive() { return !(ent.cBrain && ent.cBrain.phase === 'ko') && (ent.hp === undefined || ent.hp > 0); },
          getPos() { return { x: ent.x, z: ent.z }; },
          takeHit(dmg, fx, fz, isHeavy) {
            if (HC.combatAI && root) return HC.combatAI.onNpcTakeDamage(ent, root, dmg, fx, fz, isHeavy);
            return 0;
          },
        };
      }
    };
    if (party) {
      for (const m of (party.members || [])) {
        if (m.state === 'following' && m.root) consider(m, m.root);
      }
      for (const w of (party.wild || [])) {
        if (!w.recruited && !w.isIndoors && w.root) {
          const p = combatProfile(w.role);
          if (p.canFight && !p.selfDefense) consider(w, w.root);
        }
      }
    }
    if (best || npcOnly) return best;

    // Jika pemain tidak punya NPC rekrutan yang diturunkan bertarung, bandit menyerang gerobak di luar desa
    const hasDeployedRecruits = !!(party && (party.members || []).some((m) =>
      m.state === 'following' && !(m.cBrain && m.cBrain.phase === 'ko')
    ));
    if (!hasDeployedRecruits && fullCtx && fullCtx.physics && !fullCtx.physics.flipped) {
      const phys = fullCtx.physics;
      let inVillage = false;
      if (this.world && typeof this.world.isInsideVillage === 'function') {
        inVillage = this.world.isInsideVillage(phys.pos.x, phys.pos.z, 2.0);
      } else {
        const vCx = (this.world && typeof this.world._getRoadCenterX === 'function')
          ? this.world._getRoadCenterX(phys.pos.z) : -5.4;
        inVillage = phys.pos.z > 42 && phys.pos.z < 110 && Math.abs(phys.pos.x - vCx) < 30;
      }
      const dCart = Math.hypot(phys.pos.x - this.x, phys.pos.z - this.z);
      const cartAggroRange = this.isRoadAmbush ? 24.0 : 13.5;
      if (!inVillage && dCart < cartAggroRange) {
        return {
          id: phys,
          isCart: true,
          isKO: false,
          isAlive: () => !phys.flipped,
          getPos: () => ({ x: phys.pos.x, z: phys.pos.z }),
          takeHit: (dmg, fx, fz, isHeavy) => phys.takeBanditHit ? phys.takeBanditHit(dmg, fx, fz, isHeavy) : 0,
        };
      }
    }
    return null;
  }

  update(dt, globalTime, fullCtx) {
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.animState.flash = this.flashTimer;
    if (this.animState.swing > 0) this.animState.swing = Math.max(0, this.animState.swing - dt);

    if (this.dead) {
      this.stateTime += dt;
      if (!this.isRoadAmbush) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this._respawn();
          return;
        }
      }
      if (this.stateTime > 5.5) {
        this.mesh.visible = false;
        this.hpBar.setHp(0, this.maxHp, false, dt);
        return;
      }
      const fallU = clamp(this.stateTime / 0.55, 0, 1);
      this.mesh.position.set(this.x, this.y - fallU * 0.25, this.z);
      this.mesh.rotation.set(-fallU * 1.48, this.heading, fallU * 0.25);
      this.animState.vel.x = 0; this.animState.vel.z = 0;
      this.animState.telegraph = 0;
      (this.variant === 'big' ? animateBigBandit : animateSmallBandit)(this.animState, dt);
      this.hpBar.setPosture(0, false);
      this.hpBar.setHp(0, this.maxHp, true, dt);
      this.hpBar.updateTransform(this.x, this.y + this.hpBarOffset * 0.5, this.z, dt);
      return;
    }

    this.stateTime += dt;
    if (this.atkCd > 0) this.atkCd = Math.max(0, this.atkCd - dt);
    if (this.hitstunTimer > 0) this.hitstunTimer = Math.max(0, this.hitstunTimer - dt);
    if (this.postureHold > 0) this.postureHold = Math.max(0, this.postureHold - dt);
    else if (this.posture > 0) this.posture = Math.max(0, this.posture - 0.24 * dt);
    if (this.recoilPop > 0) this.recoilPop = Math.max(0, this.recoilPop - dt * 5.0);

    if (this.target) {
      const tp = this.target.getPos();
      const dHome = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
      const dTgt = tp ? Math.hypot(tp.x - this.x, tp.z - this.z) : 999;
      const homeCap = this.isRoadAmbush ? 44.0 : 25.0;
      const tgtCap = this.isRoadAmbush ? 28.0 : 17.5;
      if (!this.target.isAlive() || dHome > homeCap || dTgt > tgtCap) {
        this.target = null;
      } else if (this.target.isCart && fullCtx) {
        this._cartReaggroT = (this._cartReaggroT || 0) + dt;
        if (this._cartReaggroT >= 0.45) {
          this._cartReaggroT = 0;
          const npcTgt = this._pickTarget(fullCtx, true);
          if (npcTgt) {
            this.target = npcTgt;
          } else {
            const p = fullCtx.party;
            const hasDeployed = !!(p && (p.members || []).some((m) =>
              m.state === 'following' && !(m.cBrain && m.cBrain.phase === 'ko')
            ));
            if (hasDeployed) this.target = null;
          }
        }
      }
    }
    if (!this.target && fullCtx) {
      this.target = this._pickTarget(fullCtx);
    }
    this.inCombat = !!this.target && !this.dead;

    let forwardSpeed = 0;
    let strafeSpeed = 0;
    let teleTarget = 0;
    const effReach = (this.target && this.target.isCart) ? (this.reach + 1.15) : this.reach;

    if (this.state === 'hitstun' || this.state === 'stagger') {
      if (this.stateTime >= this.stateDur) {
        this._setState(this.target ? 'stalk' : 'walk', 1.5);
      }
    } else if (this.state === 'attack_windup') {
      teleTarget = clamp(this.stateTime / this.windupDur, 0, 1);
      if (this.target) {
        const tp = this.target.getPos();
        if (this.stateTime < this.windupDur * 0.65) {
          this.targetHeading = Math.atan2(tp.x - this.x, tp.z - this.z);
          this.heading = turnToward(this.heading, this.targetHeading, 9.0, dt);
        }
      }
      if (this.stateTime >= this.windupDur) {
        this._setState('attack_strike', 0.34);
      }
    } else if (this.state === 'attack_strike') {
      forwardSpeed = this.variant === 'big' ? 1.50 : 2.95;
      if (!this.strikeDealt && this.stateTime >= 0.06) {
        this.strikeDealt = true;
        this.animState.swing = 0.35;
        const isBig = this.variant === 'big';
        if (this.vfx) {
          const pos = new THREE.Vector3(
            this.x + Math.sin(this.heading) * (isBig ? 1.15 : 0.65),
            this.y + (isBig ? 0.35 : 0.85),
            this.z + Math.cos(this.heading) * (isBig ? 1.15 : 0.65)
          );
          this.vfx.spawnSlashArc(
            new THREE.Vector3(this.x, this.y + (isBig ? 0.45 : 0.1), this.z),
            this.heading,
            isBig ? 0xd93829 : 0xe63946,
            0xffe48f,
            this.strafeDir,
            isBig ? 1.45 : 0.95
          );
          if (isBig) {
            this.vfx.spawnRing(pos, 0xff7b39, 0.6, 3.6, 0.35, true);
          }
        }
        if (this.target) {
          const tp = this.target.getPos();
          const d = Math.hypot(tp.x - this.x, tp.z - this.z);
          if (d < effReach + 0.55) {
            const dealt = this.target.takeHit(this.dmg, this.x, this.z, isBig);
            if (this.target.isCart && dealt > 0) {
              if (this.vfx) {
                const hitV = new THREE.Vector3(
                  (tp.x + this.x) * 0.5,
                  this.y + 0.95,
                  (tp.z + this.z) * 0.5
                );
                this.vfx.spawnHitImpact(hitV, 0xff9f43, isBig);
                this.vfx.spawnDamageText(hitV.clone().add(new THREE.Vector3(0, 0.7, 0)), `GEROBAK -${dealt}!`, 'npcHit');
                this.vfx.playSfx('hit');
              }
              if (fullCtx && typeof fullCtx.onCartAttacked === 'function') {
                fullCtx.onCartAttacked(dealt, this.variant);
              }
            }
          }
        }
        this.strafeDir *= -1;
      }
      if (this.stateTime >= 0.34) {
        this.atkCd = this.variant === 'big' ? 1.95 : 1.15;
        this._setState('attack_recover', this.recoverDur);
      }
    } else if (this.state === 'attack_recover') {
      if (this.stateTime >= this.recoverDur) {
        this._setState(this.target ? 'stalk' : 'idle', 1.1);
      }
    } else if (this.target) {
      const tp = this.target.getPos();
      const dx = tp.x - this.x, dz = tp.z - this.z;
      const d = Math.hypot(dx, dz);
      this.targetHeading = Math.atan2(dx, dz);
      this.heading = turnToward(this.heading, this.targetHeading, 7.5, dt);

      if (this.atkCd <= 0 && d <= effReach) {
        this._setState('attack_windup', this.windupDur);
      } else if (d > effReach * 0.92) {
        forwardSpeed = this.chaseSpd;
        if (this.variant === 'small' && d < 5.0) strafeSpeed = this.strafeDir * 1.45;
      } else if (this.variant === 'small') {
        strafeSpeed = this.strafeDir * 1.85;
      }
    } else {
      // Forest patrol along waypoints + reaction if horse rides close
      const anim = fullCtx && fullCtx.animator;
      const dHorse = anim ? Math.hypot(anim.x - this.x, anim.z - this.z) : 999;
      if (this.isRoadAmbush && anim && dHorse < 28.0 && dHorse > 3.2) {
        this.targetHeading = Math.atan2(anim.x - this.x, anim.z - this.z);
        this.heading = turnToward(this.heading, this.targetHeading, 6.0, dt);
        forwardSpeed = this.walkSpd;
      } else if (dHorse < 7.5 && anim) {
        this.targetHeading = Math.atan2(anim.x - this.x, anim.z - this.z);
        this.heading = turnToward(this.heading, this.targetHeading, 5.5, dt);
        if (dHorse < 2.3) {
          forwardSpeed = -1.6;
        } else if (dHorse < 4.5) {
          teleTarget = 0.45;
        }
      } else {
        const wp = this.waypoints[this.wpIdx % this.waypoints.length];
        const wx = wp.x - this.x, wz = wp.z - this.z;
        const dw = Math.hypot(wx, wz);
        if (this.state === 'idle') {
          if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 10 * dt);
          if (this.stateTime >= this.stateDur) {
            this.wpIdx = (this.wpIdx + 1) % this.waypoints.length;
            this._setState('walk', 8.0);
          }
        } else {
          if (dw < 0.75 || this.stateTime >= this.stateDur) {
            this._setState('idle', randRange(1.6, 3.4));
          } else {
            this.targetHeading = Math.atan2(wx, wz);
            this.heading = turnToward(this.heading, this.targetHeading, 4.6, dt);
            forwardSpeed = this.walkSpd;
          }
        }
      }
    }

    const vx = Math.sin(this.heading) * forwardSpeed + Math.cos(this.heading) * strafeSpeed;
    const vz = Math.cos(this.heading) * forwardSpeed - Math.sin(this.heading) * strafeSpeed;
    this.x += vx * dt;
    this.z += vz * dt;

    if (Math.hypot(this.knockVx, this.knockVz) > 0.05) {
      this.x += this.knockVx * dt;
      this.z += this.knockVz * dt;
      const dampK = Math.exp(-8.5 * dt);
      this.knockVx *= dampK;
      this.knockVz *= dampK;
    }

    const pos2 = { x: this.x, z: this.z };
    const col = keepBanditInForest(pos2, this.world, this.radius);
    this.x = pos2.x;
    this.z = pos2.z;
    if (col.hit && Math.hypot(col.nx, col.nz) > 1e-4 && !this.target) {
      this.wpIdx = (this.wpIdx + 1) % this.waypoints.length;
    }
    this.y = groundY(this.world, this.x, this.z);

    this.mesh.position.set(this.x, this.y, this.z);
    const staggerTilt = this.state === 'stagger' ? Math.sin(globalTime * 9.0) * 0.14 : 0;
    this.mesh.rotation.set(0, this.heading, staggerTilt);
    if (this.recoilPop > 0) {
      const pop = Math.sin(this.recoilPop * Math.PI) * 0.12;
      this.mesh.scale.set(1 + pop * 0.7, 1 - pop, 1 + pop * 0.4);
    } else {
      this.mesh.scale.setScalar(1);
    }

    this.animState.vel.x = vx;
    this.animState.vel.z = vz;
    this.animState.telegraph = teleTarget;
    this.animState.target = this.target;
    (this.variant === 'big' ? animateBigBandit : animateSmallBandit)(this.animState, dt);

    this.hpBar.setPosture(this.posture, this.inCombat);
    this.hpBar.setHp(this.hp, this.maxHp, this.inCombat, dt);
    this.hpBar.updateTransform(this.x, this.y + this.hpBarOffset, this.z, dt);
  }
  dispose() {
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
    if (this.hpBar) {
      this.hpBar.dispose();
    }
  }
}

/* ============================================================================
   5. TACTICAL NON-RECKLESS NPC COMBAT AI (OBSERVE, CIRCLE, DODGE, STRIKE)
   ============================================================================ */
/* `parry` = peluang warga memilih MENAHAN & MENANGKIS (deflect) saat boar
   menyerang, bukan menggeser. Penjaga berperisai tinggi, penyihir/petani rendah:
   mereka lebih suka menghindar daripada mengadu besi. */
const ROLE_PROFILES = {
  merchant:      { canFight: false },
  dungeonmaster: { canFight: false },
  petmerchant:   { canFight: false },
  farmer:        { canFight: true, selfDefense: true, prefMin: 2.8, prefMax: 4.0, strikeRange: 2.1, orbitSpd: 2.3, dodgeSpd: 7.0, atkCd: 1.65, parry: 0.30, outer: 0xd6b868, inner: 0xfff3b0 },
  miner:         { canFight: true, selfDefense: true, prefMin: 2.7, prefMax: 3.9, strikeRange: 2.1, orbitSpd: 2.2, dodgeSpd: 6.8, atkCd: 1.65, parry: 0.42, outer: 0x9fb3c8, inner: 0xfff0b5 },
  herbal:        { canFight: true, selfDefense: true, prefMin: 3.0, prefMax: 4.2, strikeRange: 2.2, orbitSpd: 2.5, dodgeSpd: 7.2, atkCd: 1.65, parry: 0.32, outer: 0xa7f3d0, inner: 0xffffff },
  hunter:        { canFight: true, ranged: true, projKind: 'arrow', prefMin: 5.6, prefMax: 8.6, strikeRange: 9.0, orbitSpd: 2.7, dodgeSpd: 8.0, atkCd: 1.45, parry: 0.34, outer: 0x9bd7c7, inner: 0xffe48f },
  elfmage:       { canFight: true, ranged: true, projKind: 'orb', prefMin: 5.8, prefMax: 8.8, strikeRange: 9.4, orbitSpd: 2.5, dodgeSpd: 7.6, atkCd: 1.40, parry: 0.26, outer: 0x74b9ff, inner: 0xdff9fb },
  magesupport:   { canFight: true, ranged: true, projKind: 'orb', prefMin: 5.6, prefMax: 8.4, strikeRange: 9.0, orbitSpd: 2.4, dodgeSpd: 7.4, atkCd: 1.50, parry: 0.24, outer: 0xa29bfe, inner: 0xffeaa7 },
  lich:          { canFight: true, ranged: true, projKind: 'orb', prefMin: 5.4, prefMax: 8.2, strikeRange: 9.2, orbitSpd: 2.2, dodgeSpd: 7.2, atkCd: 1.35, parry: 0.40, outer: 0x9b5de5, inner: 0x72efdd },
  rabbitwarrior: { canFight: true, prefMin: 2.9, prefMax: 4.3, strikeRange: 2.3, orbitSpd: 3.4, dodgeSpd: 9.0, atkCd: 1.05, parry: 0.48, comboMax: 2, outer: 0x5eead4, inner: 0xffffff },
  goblin:        { canFight: true, prefMin: 2.8, prefMax: 4.2, strikeRange: 2.2, orbitSpd: 3.3, dodgeSpd: 8.8, atkCd: 1.10, parry: 0.50, comboMax: 2, outer: 0xfacc15, inner: 0xffffff },
  guardian:      { canFight: true, prefMin: 2.4, prefMax: 3.5, strikeRange: 2.4, orbitSpd: 2.1, dodgeSpd: 6.8, atkCd: 1.50, parry: 0.76, defMul: 0.72, outer: 0x60a5fa, inner: 0xe0f2fe },
  royalguard:    { canFight: true, prefMin: 2.5, prefMax: 3.6, strikeRange: 2.45, orbitSpd: 2.3, dodgeSpd: 7.0, atkCd: 1.35, parry: 0.90, defMul: 0.68, outer: 0xf59e0b, inner: 0xfff7ed },
  stonegiant:    { canFight: true, prefMin: 2.5, prefMax: 3.6, strikeRange: 2.65, orbitSpd: 1.9, dodgeSpd: 6.2, atkCd: 1.70, parry: 0.82, defMul: 0.65, outer: 0xd97706, inner: 0xfde68a },
  lionknight:    { canFight: true, prefMin: 2.7, prefMax: 4.0, strikeRange: 2.55, orbitSpd: 2.8, dodgeSpd: 7.8, atkCd: 1.25, parry: 0.72, defMul: 0.80, outer: 0xfbbf24, inner: 0xffffff },
  warrior:       { canFight: true, prefMin: 2.7, prefMax: 4.0, strikeRange: 2.35, orbitSpd: 2.7, dodgeSpd: 7.6, atkCd: 1.30, parry: 0.64, defMul: 0.85, outer: 0xf43f5e, inner: 0xffe48f },
  guard:         { canFight: true, prefMin: 2.7, prefMax: 3.9, strikeRange: 2.35, orbitSpd: 2.5, dodgeSpd: 7.4, atkCd: 1.35, parry: 0.80, defMul: 0.80, outer: 0x94a3b8, inner: 0xfef08a },
};

function combatProfile(role) {
  return (role && ROLE_PROFILES[role.id]) || { canFight: true, prefMin: 2.7, prefMax: 4.0, strikeRange: 2.3, orbitSpd: 2.5, dodgeSpd: 7.4, atkCd: 1.4, parry: 0.5, outer: 0x93c5fd, inner: 0xffe48f };
}

/* ----------------------------------------------------------------------------
   ATURAN TANGKISAN (murni angka, tanpa THREE) — dipakai AI dan bisa diuji
   headless. `rnd` disuntik supaya kelakuannya deterministik di test.
   ---------------------------------------------------------------------------- */
function guardChoice(prof, rnd = Math.random) {
  const bias = prof && prof.parry != null ? prof.parry : 0.5;
  return rnd() < bias ? 'guard' : 'dodge';
}

/** Hasil satu serangan boar yang jatuh saat warga menahan diri. */
function resolveGuardHit(prof, posture, rawAmount, rnd = Math.random) {
  const raw = Math.max(1, rawAmount || 1);
  const bias = prof && prof.parry != null ? prof.parry : 0.5;
  const cur = clamp(posture || 0, 0, 1);
  if (rnd() < bias) {
    // TANGKIS: nol damage, postur boar naik, warga dapat jendela balas
    return {
      kind: 'deflect', dmg: 0,
      npcPosture: Math.max(0, cur - 0.12),
      boarPosture: 0.34, counter: true, stun: 0,
    };
  }
  const dmg = Math.max(1, Math.round(raw * 0.28));
  const next = cur + 0.34;
  if (next >= 1) {
    // Guard pecah: warga terbuka sebentar, posturnya kembali nol
    return { kind: 'break', dmg, npcPosture: 0, boarPosture: 0.12, counter: false, stun: 0.9 };
  }
  return { kind: 'block', dmg, npcPosture: next, boarPosture: 0.06, counter: false, stun: 0 };
}

class TacticalCombatAI {
  constructor(mobsManager) {
    this.mobs = mobsManager;
  }

  _ensureState(entity, role) {
    const maxHp = entity.maxHp || role.hp || 120;
    if (entity.maxHp == null) entity.maxHp = maxHp;
    if (entity.hp == null) entity.hp = maxHp;
    if (!entity.cBrain) {
      entity.cBrain = {
        phase: 'observe',
        t: randRange(0.45, 1.05),
        atkCd: randRange(0.2, 0.7),
        orbitDir: Math.random() > 0.5 ? 1 : -1,
        orbitFlipT: randRange(1.4, 2.6),
        iFrames: 0,
        dodgeCool: 0,
        dodgeYaw: 0,
        dodgedHitShown: false,
        counterWindow: 0,
        counterBonus: false,
        strikeDealt: false,
        comboStep: 0,
        recoilPop: 0,
        lungeZ: 0,
        hitFlashT: 0,
        knockVx: 0,
        knockVz: 0,
        koT: 0,
        targetBoar: null,
        returningHome: false,
        aggroUntil: 0,
        // tempo tenang: amati -> melingkar sebentar -> serang saat ada celah
        posture: 0,
        stanceCool: 0,
        watchT: randRange(0.9, 1.8),
        circleT: 0,
        deflectFlash: 0,
        guardT: 0,
      };
    }
    if (!entity._hpBar && this.mobs.scene) {
      entity._hpBar = new HealthBar3D(this.mobs.scene, { isEnemy: false, width: 0.96 });
    }
    return entity.cBrain;
  }

  _pickBoarTarget(entity, role, prof, anchorX, anchorZ, detectR, maxLeashR, curTime) {
    let best = null, bestD = detectR;
    const cb = entity.cBrain;
    const forceAggro = cb && curTime < (cb.aggroUntil || 0);
    const foes = [...(this.mobs.boars || []), ...(this.mobs.bandits || [])];
    for (const b of foes) {
      if (b.dead) continue;
      const dNpc = Math.hypot(b.x - entity.x, b.z - entity.z);
      const dAnchor = Math.hypot(b.x - anchorX, b.z - anchorZ);
      if (dAnchor > maxLeashR) continue;
      if (prof.selfDefense && !forceAggro && dNpc > 5.4 && b.target && b.target.id !== entity) continue;
      if (dNpc < bestD) {
        bestD = dNpc;
        best = b;
      }
    }
    return best;
  }

  _applyVisuals(entity, root, dt) {
    const st = root.userData && root.userData.npc;
    const cb = entity.cBrain;
    const holder = root.children && root.children[0];
    if (holder && holder.userData) {
      if (holder.userData._baseY === undefined) holder.userData._baseY = holder.position.y;
      if (holder.userData._baseScaleX === undefined) {
        holder.userData._baseScaleX = holder.scale.x || 1;
        holder.userData._baseScaleY = holder.scale.y || 1;
        holder.userData._baseScaleZ = holder.scale.z || 1;
      }
      if (cb.recoilPop > 0) cb.recoilPop = Math.max(0, cb.recoilPop - dt * 5.2);
      const pop = cb.recoilPop > 0 ? Math.sin(cb.recoilPop * Math.PI) * 0.16 : 0;
      holder.scale.set(
        holder.userData._baseScaleX * (1 + pop * 0.7),
        holder.userData._baseScaleY * (1 - pop),
        holder.userData._baseScaleZ * (1 + pop * 0.4)
      );
      holder.position.y = holder.userData._baseY;
    }

    if (entity._hpBar) {
      const topY = entity.y + (HC.NPC_HEIGHT[entity.role.id] || 1.75) + 0.35;
      const fighting = !!cb.targetBoar && !cb.targetBoar.dead;
      entity._hpBar.setPosture(cb.posture, fighting);
      entity._hpBar.setHp(entity.hp, entity.maxHp, fighting, dt);
      entity._hpBar.updateTransform(entity.x, topY, entity.z, dt);
    }
  }

  _boarAdapter(entity, root) {
    const self = this;
    return {
      id: entity,
      get isKO() { return !!(entity.cBrain && entity.cBrain.phase === 'ko'); },
      isAlive() { return !!(entity.cBrain && entity.cBrain.phase !== 'ko' && entity.hp > 0); },
      getPos() { return { x: entity.x, z: entity.z }; },
      takeHit(dmg, fx, fz, isHeavy) {
        return self.onNpcTakeDamage(entity, root, dmg, fx, fz, isHeavy);
      },
    };
  }

  /** Pingsan: dipakai jalur damage biasa maupun jalur guard. */
  _koNpc(entity) {
    const cb = entity.cBrain;
    if (!cb) return;
    entity.hp = 0;
    cb.phase = 'ko';
    cb.koT = 5.0;
    cb.targetBoar = null;
    cb.posture = 0;
    cb.iFrames = 0;
    if (this.mobs.vfx) {
      this.mobs.vfx.spawnDamageText(new THREE.Vector3(entity.x, entity.y + 1.8, entity.z), 'PINGSAN!', 'npcHit');
    }
  }

  onNpcTakeDamage(entity, root, rawAmount, fromX, fromZ, isHeavy) {
    const role = entity.role;
    const prof = combatProfile(role);
    const cb = this._ensureState(entity, role);
    if (cb.phase === 'ko') return 0;

    /* ---- Warga sedang MENAHAN (guard): tangkis / tahan / guard pecah ----
       Ini inti rasa Sekiro-nya: serangan boar yang dibaca dengan benar tidak
       menghabiskan HP, tapi menambah postur boar sampai ia terbuka. */
    if (cb.phase === 'guard') {
      const outcome = resolveGuardHit(prof, cb.posture, rawAmount);
      const boar = cb.targetBoar;
      const cx = entity.x + (fromX - entity.x) * 0.38;
      const cz = entity.z + (fromZ - entity.z) * 0.38;
      const contact = new THREE.Vector3(cx, entity.y + 1.05, cz);
      cb.posture = outcome.npcPosture;
      cb.aggroUntil = this.mobs.clock + 8.0;

      if (outcome.kind === 'deflect') {
        cb.counterWindow = 1.15;
        cb.atkCd = 0;
        cb.deflectFlash = 0.28;
        cb.recoilPop = 0.55;
        cb.stanceCool = 0.6;
        cb.phase = 'observe';
        cb.t = 0.30;
        cb.watchT = 0.30;
        const st0 = root && root.userData && root.userData.npc;
        if (st0) { st0.flash = 0.12; st0.swing = 0.12; }
        if (boar && boar.addPosture) boar.addPosture(outcome.boarPosture);
        if (this.mobs.vfx) {
          this.mobs.vfx.spawnDeflectSpark(contact, 0xfff2c4);
          this.mobs.vfx.spawnDamageText(new THREE.Vector3(entity.x, entity.y + 1.62, entity.z), 'TANGKIS!', 'counter');
          this.mobs.vfx.playSfx('parry');
          this.mobs.vfx.triggerHitStop(0.045);
        }
        return 0;
      }

      // Tidak sempat menangkis: tahan sebagian, postur naik — atau guard pecah.
      entity.hp = Math.max(0, entity.hp - outcome.dmg);
      cb.hitFlashT = 0.20;
      cb.recoilPop = 0.8;
      const dx2 = entity.x - fromX, dz2 = entity.z - fromZ;
      const d2 = Math.hypot(dx2, dz2) || 1;
      cb.knockVx = (dx2 / d2) * (isHeavy ? 4.2 : 2.6);
      cb.knockVz = (dz2 / d2) * (isHeavy ? 4.2 : 2.6);
      if (boar && boar.addPosture) boar.addPosture(outcome.boarPosture);
      if (entity._hpBar) entity._hpBar.onHit();
      const st1 = root && root.userData && root.userData.npc;
      if (st1) st1.flash = 0.20;
      if (this.mobs.vfx) {
        this.mobs.vfx.spawnHitImpact(contact, 0xffd9a0, outcome.kind === 'break');
        this.mobs.vfx.spawnDamageText(
          new THREE.Vector3(entity.x, entity.y + 1.58, entity.z),
          outcome.kind === 'break' ? 'GUARD PECAH!' : `-${outcome.dmg}`,
          outcome.kind === 'break' ? 'crit' : 'npcHit'
        );
        this.mobs.vfx.playSfx(outcome.kind === 'break' ? 'crit' : 'hit');
      }
      if (entity.hp <= 0) {
        this._koNpc(entity);
      } else if (outcome.kind === 'break') {
        cb.phase = 'hitstun';
        cb.t = outcome.stun;
      } else {
        cb.phase = 'guard';
        cb.guardT = 0;
      }
      return outcome.dmg;
    }

    // Reactive iFrame dodge success!
    if (cb.iFrames > 0) {
      if (!cb.dodgedHitShown && this.mobs.vfx) {
        cb.dodgedHitShown = true;
        cb.counterWindow = 1.15;
        this.mobs.vfx.spawnDamageText(new THREE.Vector3(entity.x, entity.y + 1.55, entity.z), 'HINDAR!', 'dodge');
        this.mobs.vfx.playSfx('dodge');
      }
      return 0;
    }

    const defMul = prof.defMul || 1.0;
    const dmg = Math.max(2, Math.round(rawAmount * defMul));
    entity.hp = Math.max(0, entity.hp - dmg);
    cb.aggroUntil = this.mobs.clock + 8.0;
    cb.hitFlashT = 0.24;
    cb.recoilPop = 1.0;

    const st = root && root.userData && root.userData.npc;
    if (st) st.flash = 0.24;

    const dx = entity.x - fromX, dz = entity.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const kb = isHeavy ? 6.5 : 4.2;
    cb.knockVx = (dx / d) * kb;
    cb.knockVz = (dz / d) * kb;

    if (entity._hpBar) entity._hpBar.onHit();

    if (this.mobs.vfx) {
      this.mobs.vfx.spawnHitImpact(new THREE.Vector3(entity.x, entity.y + 0.85, entity.z), 0xff6b6b, !!isHeavy);
      this.mobs.vfx.spawnDamageText(
        new THREE.Vector3(entity.x, entity.y + 1.55, entity.z),
        `-${dmg}`,
        'npcHit'
      );
      this.mobs.vfx.playSfx('hit');
    }

    if (entity.hp <= 0) {
      this._koNpc(entity);
    } else {
      cb.phase = 'hitstun';
      cb.t = isHeavy ? 0.30 : 0.20;
    }
    return dmg;
  }

  _chooseDodgeAngle(entity, boar, world) {
    const dx = boar.x - entity.x, dz = boar.z - entity.z;
    const toBoar = Math.atan2(dx, dz);
    const awayBoar = toBoar + Math.PI;
    // Perpendicular left or right relative to boar heading
    const perpR = boar.heading + Math.PI * 0.5;
    const perpL = boar.heading - Math.PI * 0.5;
    const candidates = [
      (Math.random() > 0.5 ? perpR : perpL) * 0.72 + awayBoar * 0.28,
      (Math.random() > 0.5 ? perpL : perpR) * 0.72 + awayBoar * 0.28,
      toBoar + entity.cBrain.orbitDir * Math.PI * 0.58,
      awayBoar,
    ];
    for (const ang of candidates) {
      const tx = entity.x + Math.sin(ang) * 1.45;
      const tz = entity.z + Math.cos(ang) * 1.45;
      if (Math.hypot(tx - POND.x, tz - POND.z) < POND.safeR) continue;
      if (world && world.resolveCircleCollision) {
        const res = world.resolveCircleCollision(tx, tz, 0.38);
        if (res.hit && res.pen > 0.15) continue;
      }
      return ang;
    }
    return candidates[0];
  }

  _executeNpcAttack(entity, root, boar, role, prof, cb) {
    const isCounter = cb.counterWindow > 0;
    const isCrit = isCounter || Math.random() < 0.22;
    const baseDmg = role.dmg || 14;
    const dmg = Math.round(baseDmg * (isCounter ? 1.45 : isCrit ? 1.35 : 1.0));
    const dirSign = cb.comboStep % 2 === 0 ? 1 : -1;
    const yawToBoar = Math.atan2(boar.x - entity.x, boar.z - entity.z);

    // Trigger native Sylvan animation!
    const st = root.userData && root.userData.npc;
    if (st) {
      st.swing = 0.25;
      if (role.id === 'rabbitwarrior' && st.rab) {
        st.rab.action = { name: ['combo1', 'combo2', 'combo3'][cb.comboStep % 3], t: 0 };
        st.rab.skillPos = null;
      }
    }

    const adapter = this._boarAdapter(entity, root);
    if (prof.ranged) {
      const start = new THREE.Vector3(
        entity.x + Math.sin(yawToBoar) * 0.45,
        entity.y + 1.05,
        entity.z + Math.cos(yawToBoar) * 0.45
      );
      if (this.mobs.vfx) {
        this.mobs.vfx.playSfx('bow');
        this.mobs.vfx.spawnSparkStar(start, new THREE.Vector3(Math.sin(yawToBoar) * 1.5, 0.6, Math.cos(yawToBoar) * 1.5), 0.075, 0.24, prof.outer);
        this.mobs.vfx.spawnProjectile({
          start,
          target: boar,
          kind: prof.projKind || 'orb',
          color: prof.outer,
          speed: prof.projKind === 'arrow' ? 18.0 : 14.5,
          onHit: () => {
            if (!boar.dead) {
              boar.takeDamage(dmg, entity.x, entity.z, {
                attackerRef: adapter,
                isCrit,
                vfxColor: prof.outer,
                textStyle: isCounter ? 'counter' : (isCrit ? 'crit' : 'normal'),
              });
            }
          },
        });
      }
    } else {
      if (this.mobs.vfx) {
        this.mobs.vfx.spawnSlashArc(
          new THREE.Vector3(entity.x, entity.y, entity.z),
          yawToBoar,
          prof.outer,
          prof.inner,
          dirSign,
          role.id === 'stonegiant' ? 1.35 : 0.95
        );
      }
      const d = Math.hypot(boar.x - entity.x, boar.z - entity.z);
      if (d <= prof.strikeRange + 0.75) {
        boar.takeDamage(dmg, entity.x, entity.z, {
          attackerRef: adapter,
          isCrit,
          vfxColor: prof.outer,
          textStyle: isCounter ? 'counter' : (isCrit ? 'crit' : 'normal'),
        });
      }
    }
    cb.counterWindow = 0;
  }

  _stepTactical(entity, dt, opts) {
    const { root, role, anchorX, anchorZ, detectR, maxLeashR, world, isWild } = opts;
    const prof = combatProfile(role);
    const cb = this._ensureState(entity, role);
    const st = root.userData && root.userData.npc;

    // Knockback dissipation
    if (Math.hypot(cb.knockVx, cb.knockVz) > 0.05) {
      entity.x += cb.knockVx * dt;
      entity.z += cb.knockVz * dt;
      const kd = Math.exp(-9.0 * dt);
      cb.knockVx *= kd; cb.knockVz *= kd;
    }

    if (cb.atkCd > 0) cb.atkCd = Math.max(0, cb.atkCd - dt);
    if (cb.iFrames > 0) cb.iFrames = Math.max(0, cb.iFrames - dt);
    if (cb.dodgeCool > 0) cb.dodgeCool = Math.max(0, cb.dodgeCool - dt);
    if (cb.counterWindow > 0) cb.counterWindow = Math.max(0, cb.counterWindow - dt);
    if (cb.hitFlashT > 0) cb.hitFlashT = Math.max(0, cb.hitFlashT - dt);
    if (cb.stanceCool > 0) cb.stanceCool = Math.max(0, cb.stanceCool - dt);
    if (cb.deflectFlash > 0) cb.deflectFlash = Math.max(0, cb.deflectFlash - dt);
    // Postur warga pulih pelan selama tidak menahan — bukan meter permanen
    if (cb.phase !== 'guard' && cb.posture > 0) cb.posture = Math.max(0, cb.posture - 0.42 * dt);
    if (st) {
      st.flash = cb.hitFlashT;
      if (st.swing > 0) st.swing = Math.max(0, st.swing - dt);
    }

    // Handle KO state cleanly
    if (cb.phase === 'ko') {
      cb.koT -= dt;
      entity.y = groundY(world, entity.x, entity.z);
      root.position.set(entity.x, entity.y, entity.z);
      root.rotation.set(-0.32, entity.dir || 0, 0.35);
      if (st) { st.walking = false; st.vel.x = 0; st.vel.z = 0; }
      HC.animateNPC(root, dt);
      this._applyVisuals(entity, root, dt);
      if (cb.koT <= 0) {
        entity.hp = entity.maxHp;
        cb.phase = 'observe';
        root.rotation.set(0, entity.dir || 0, 0);
        if (this.mobs.vfx) {
          this.mobs.vfx.spawnDamageText(new THREE.Vector3(entity.x, entity.y + 1.5, entity.z), 'BANGKIT!', 'heal');
        }
      }
      return true;
    }

    // Peaceful shopkeepers cautiously step away from boars, never fight
    if (!prof.canFight) {
      const threat = this._pickBoarTarget(entity, role, prof, anchorX, anchorZ, 5.0, maxLeashR, this.mobs.clock);
      if (threat) {
        const d = Math.hypot(threat.x - entity.x, threat.z - entity.z);
        if (d < 4.2 && d > 1e-4) {
          const sp = 2.6;
          entity.x += ((entity.x - threat.x) / d) * sp * dt;
          entity.z += ((entity.z - threat.z) / d) * sp * dt;
          keepOutOfPondAndBounds(entity, world, 0.35);
          entity.y = groundY(world, entity.x, entity.z);
          entity.dir = turnToward(entity.dir || 0, Math.atan2(threat.x - entity.x, threat.z - entity.z), 8, dt);
          root.position.set(entity.x, entity.y, entity.z);
          root.rotation.y = entity.dir;
          if (st) { st.pos.copy(root.position); st.walking = true; st.vel.x = (entity.x - threat.x) / d * sp; st.vel.z = (entity.z - threat.z) / d * sp; }
          HC.animateNPC(root, dt);
          this._applyVisuals(entity, root, dt);
          return true;
        }
      }
      if (entity.hp < entity.maxHp) entity.hp = Math.min(entity.maxHp, entity.hp + 8 * dt);
      this._applyVisuals(entity, root, dt);
      return false;
    }

    // Validate or acquire boar target
    if (cb.targetBoar) {
      const b = cb.targetBoar;
      const dA = Math.hypot(b.x - anchorX, b.z - anchorZ);
      if (b.dead || dA > maxLeashR + 2.5) cb.targetBoar = null;
    }
    if (!cb.targetBoar) {
      cb.targetBoar = this._pickBoarTarget(entity, role, prof, anchorX, anchorZ, detectR, maxLeashR, this.mobs.clock);
      if (cb.targetBoar) {
        cb.phase = 'observe';
        cb.t = randRange(0.9, 1.6);
        cb.watchT = randRange(0.9, 1.6);
        cb.circleT = 0;
      }
    }

    const boar = cb.targetBoar;
    if (!boar) {
      // Out of combat: heal gently and let caller handle calm AI; if wild NPC wandered, walk home smoothly!
      if (entity.hp < entity.maxHp) entity.hp = Math.min(entity.maxHp, entity.hp + 9 * dt);
      if (st) st.target = null;
      if (isWild && !entity.villageProfile) {
        const dh = Math.hypot(entity.x - anchorX, entity.z - anchorZ);
        const homeR = entity.homeRadius || 1.3;
        if (dh > homeR + 0.45) {
          const sp = (role.speed || 3.2) * 0.72;
          const dx = anchorX - entity.x, dz = anchorZ - entity.z;
          entity.x += (dx / dh) * sp * dt;
          entity.z += (dz / dh) * sp * dt;
          keepOutOfPondAndBounds(entity, world, 0.34);
          entity.y = groundY(world, entity.x, entity.z);
          entity.dir = turnToward(entity.dir || 0, Math.atan2(dx, dz), 8, dt);
          root.position.set(entity.x, entity.y, entity.z);
          root.rotation.set(0, entity.dir, 0);
          if (st) { st.pos.copy(root.position); st.walking = true; st.vel.x = (dx / dh) * sp; st.vel.z = (dz / dh) * sp; st.headAngle = 0; }
          HC.animateNPC(root, dt);
          this._applyVisuals(entity, root, dt);
          return true;
        }
      }
      entity.y = groundY(world, entity.x, entity.z);
      root.rotation.x = 0;
      root.rotation.z = 0;
      this._applyVisuals(entity, root, dt);
      return false;
    }

    // ---- IN TACTICAL COMBAT AGAINST BOAR ----
    const adapter = this._boarAdapter(entity, root);
    if (st) st.target = { pos: new THREE.Vector3(boar.x, boar.y, boar.z), dead: boar.dead };

    const dx = boar.x - entity.x, dz = boar.z - entity.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const rx = dx / dist, rz = dz / dist; // unit vector toward boar
    const tx = -rz * cb.orbitDir, tz = rx * cb.orbitDir; // tangent vector (circling)
    const yawToBoar = Math.atan2(dx, dz);

    // Check if boar's telegraphed attack threatens this NPC
    const boarToNpc = Math.atan2(entity.x - boar.x, entity.z - boar.z);
    const angleDiff = Math.abs(wrapAngle(boarToNpc - boar.heading));
    const dangerDist = boar.telegraphType === 'charge' ? 7.5 : 3.2;
    const inDanger = boar.isTelegraphing && dist < dangerDist && angleDiff < (boar.telegraphType === 'charge' ? 0.72 : 1.15);

    let moveX = 0, moveZ = 0, walkingNow = false, moveSpd = 0;

    if (cb.phase === 'hitstun') {
      cb.t -= dt;
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 10, dt);
      if (cb.t <= 0) {
        cb.phase = 'observe';
        cb.t = randRange(0.8, 1.4);
        cb.watchT = randRange(0.8, 1.4);
        cb.circleT = 0;
      }
    } else if (cb.phase === 'dodge') {
      cb.t -= dt;
      // Geser pendek (bukan sprint): satu langkah samping yang terbaca jelas.
      moveSpd = (prof.dodgeSpd || 7.4) * 0.5;
      moveX = Math.sin(cb.dodgeYaw) * moveSpd;
      moveZ = Math.cos(cb.dodgeYaw) * moveSpd;
      walkingNow = true;
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 12, dt);
      if (cb.t <= 0) {
        // Setelah menggeser bersih: balas hanya kalau boar benar-benar terbuka.
        if ((cb.counterWindow > 0 || boar.isVulnerable) && cb.atkCd <= 0.35) {
          cb.atkCd = 0;
          cb.phase = 'approach_strike';
          cb.t = 1.2;
        } else {
          cb.phase = 'observe';
          cb.t = randRange(0.8, 1.5);
          cb.watchT = randRange(0.8, 1.5);
          cb.circleT = 0;
        }
      }
    } else if (cb.phase === 'guard') {
      // ---- MENAHAN: badan merunduk, kaki menapak, tidak mundur tergesa ----
      cb.guardT += dt;
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 10, dt);
      // terlalu dekat -> mundur satu langkah kecil; kalau tidak, tahan di tempat
      const brace = dist < 1.5 ? -0.55 : 0.35;
      moveSpd = Math.abs(brace);
      moveX = rx * brace;
      moveZ = rz * brace;
      walkingNow = moveSpd > 0.2;
      if (cb.guardT > 1.7 || (!boar.isTelegraphing && cb.guardT > 0.4)) {
        cb.phase = 'observe';
        cb.t = randRange(0.7, 1.3);
        cb.watchT = randRange(0.7, 1.3);
        cb.circleT = 0;
        cb.stanceCool = 0.5;
      }
    } else if (inDanger && cb.dodgeCool <= 0 && cb.stanceCool <= 0 && cb.phase !== 'strike') {
      // ---- Dibaca dulu, baru dijawab: tahan & tangkis, atau menggeser ----
      const choice = guardChoice(prof);
      cb.stanceCool = 0.9;
      if (choice === 'guard') {
        cb.phase = 'guard';
        cb.guardT = 0;
        cb.iFrames = 0;
        if (this.mobs.vfx) {
          // kilau tipis: warga siap menahan, bukan panik menggeser
          this.mobs.vfx.spawnRing(
            new THREE.Vector3(entity.x, entity.y + 0.95, entity.z),
            prof.inner, 0.40, 1.7, 0.24, false
          );
        }
      } else {
        cb.phase = 'dodge';
        cb.t = 0.30;
        cb.iFrames = 0.38;
        cb.dodgeCool = 1.60;
        cb.dodgedHitShown = false;
        cb.recoilPop = 0.75;
        cb.dodgeYaw = this._chooseDodgeAngle(entity, boar, world);
        if (this.mobs.vfx) {
          this.mobs.vfx.spawnDodgePuff(new THREE.Vector3(entity.x, entity.y, entity.z), cb.dodgeYaw);
        }
      }
    } else if (cb.phase === 'observe') {
      cb.t -= dt;
      cb.orbitFlipT -= dt;
      if (cb.orbitFlipT <= 0) {
        cb.orbitDir *= -1;
        cb.orbitFlipT = randRange(1.6, 3.1);
      }

      const midR = (prof.prefMin + prof.prefMax) * 0.5;
      const radErr = dist - midR;
      const orbitSpd = (prof.orbitSpd || 2.6) * 0.62;

      /* Tempo tenang: sebagian besar waktu dipakai MENGAMATI dengan kaki
         menapak (napas + geser kecil), lalu satu langkah melingkar pendek. */
      cb.watchT -= dt;
      if (cb.watchT <= 0) {
        cb.watchT = randRange(1.1, 2.0);
        cb.circleT = randRange(0.55, 0.95);
        if (Math.random() > 0.7) cb.orbitDir *= -1;
      }
      const circling = cb.circleT > 0;
      if (circling) cb.circleT -= dt;

      if (circling) {
        const radComp = clamp(radErr * 1.15, -1.0, 1.0);
        const vx = tx * orbitSpd + rx * radComp * 1.4;
        const vz = tz * orbitSpd + rz * radComp * 1.4;
        moveSpd = Math.hypot(vx, vz);
        moveX = vx; moveZ = vz;
        walkingNow = moveSpd > 0.2;
      } else if (dist > prof.prefMax + 0.6) {
        moveSpd = 1.15;                       // merapat secukupnya
        moveX = rx * moveSpd;
        moveZ = rz * moveSpd;
        walkingNow = true;
      } else if (dist < 1.55) {
        moveSpd = 1.0;                        // jaga jarak, bukan menempel
        moveX = -rx * moveSpd;
        moveZ = -rz * moveSpd;
        walkingNow = true;
      }
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 9, dt);

      // Celah: menyerang kalau boar terbuka, atau setelah jeda amati selesai.
      const boarSafe = !boar.isTelegraphing;
      const goodOpening = boar.isVulnerable && cb.atkCd <= 0;
      if (boarSafe && (goodOpening || (cb.t <= 0 && cb.atkCd <= 0 && !circling))) {
        cb.phase = 'approach_strike';
        cb.t = 1.4;
      } else if (cb.t < -2.4) {
        cb.t = randRange(0.8, 1.4);
      }
    } else if (cb.phase === 'approach_strike') {
      cb.t -= dt;
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 12, dt);
      if (prof.ranged && dist < prof.prefMin - 1.2) {
        // Kite backward before firing!
        moveSpd = (role.speed || 3.4) * 1.05;
        moveX = -rx * moveSpd + tx * 0.7;
        moveZ = -rz * moveSpd + tz * 0.7;
        walkingNow = true;
      } else if (dist > prof.strikeRange) {
        const sp = (role.speed || 3.4) * 1.22;
        moveX = (rx * 0.85 + tx * 0.25) * sp;
        moveZ = (rz * 0.85 + tz * 0.25) * sp;
        moveSpd = Math.hypot(moveX, moveZ);
        walkingNow = true;
      }

      if (dist <= prof.strikeRange + (prof.ranged ? 0 : 0.15)) {
        cb.phase = 'strike';
        cb.t = 0.14; // brief crisp anticipation before hit
        cb.strikeDealt = false;
        cb.comboStep = 0;
      } else if (cb.t <= 0) {
        cb.phase = 'observe';
        cb.t = randRange(0.7, 1.2);
        cb.watchT = randRange(0.7, 1.2);
        cb.circleT = 0;
      }
    } else if (cb.phase === 'strike') {
      cb.t -= dt;
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 14, dt);
      if (!cb.strikeDealt && cb.t <= 0.04) {
        cb.strikeDealt = true;
        // Micro forward lunge
        if (!prof.ranged && dist > 1.35) {
          entity.x += rx * 0.36;
          entity.z += rz * 0.36;
        }
        this._executeNpcAttack(entity, root, boar, role, prof, cb);
        cb.recoilPop = 0.65;
      }
      if (cb.t <= -0.18) {
        const comboMax = prof.comboMax || 1;
        if (cb.comboStep + 1 < comboMax && !boar.dead && !boar.isTelegraphing && dist <= prof.strikeRange + 0.6) {
          cb.comboStep++;
          cb.t = 0.14;
          cb.strikeDealt = false;
        } else {
          cb.atkCd = (prof.atkCd || 1.35) * 1.5;
          cb.phase = 'disengage';
          cb.t = randRange(0.60, 0.90);
          cb.orbitDir *= -1;
        }
      }
    } else if (cb.phase === 'disengage') {
      cb.t -= dt;
      const sp = (role.speed || 3.4) * 1.05;
      moveX = (-rx * 0.75 + tx * 0.65) * sp;
      moveZ = (-rz * 0.75 + tz * 0.65) * sp;
      moveSpd = Math.hypot(moveX, moveZ);
      walkingNow = true;
      entity.dir = turnToward(entity.dir || 0, yawToBoar, 10, dt);
      if (cb.t <= 0 || dist >= prof.prefMax) {
        cb.phase = 'observe';
        cb.t = randRange(0.9, 1.6);
        cb.watchT = randRange(0.9, 1.6);
        cb.circleT = 0;
      }
    }

    if (walkingNow) {
      entity.x += moveX * dt;
      entity.z += moveZ * dt;
    }

    // Keep spacing from boar body so NPCs don't clip inside boar
    const bdx = entity.x - boar.x, bdz = entity.z - boar.z;
    const bd = Math.hypot(bdx, bdz);
    if (bd < 1.32 && bd > 1e-4) {
      entity.x = boar.x + (bdx / bd) * 1.32;
      entity.z = boar.z + (bdz / bd) * 1.32;
    }

    // Avoid horse & cart props when fighting near them
    if (opts.hx !== undefined) {
      const hdx = entity.x - opts.hx, hdz = entity.z - opts.hz;
      const hd = Math.hypot(hdx, hdz);
      if (hd < 1.65 && hd > 1e-4) {
        entity.x = opts.hx + (hdx / hd) * 1.65;
        entity.z = opts.hz + (hdz / hd) * 1.65;
      }
    }

    keepOutOfPondAndBounds(entity, world, 0.34);
    entity.y = groundY(world, entity.x, entity.z);

    const leanFwd = cb.phase === 'dodge' ? 0.16 : cb.phase === 'strike' ? 0.14 : cb.phase === 'guard' ? -0.12 : 0;
    const deflectNod = cb.deflectFlash > 0
      ? -Math.sin((cb.deflectFlash / 0.28) * Math.PI) * 0.17
      : 0;
    root.position.set(entity.x, entity.y, entity.z);
    root.rotation.set(leanFwd + deflectNod, entity.dir || 0, 0);

    if (st) {
      st.pos.copy(root.position);
      st.vel.x = walkingNow ? moveX : 0;
      st.vel.z = walkingNow ? moveZ : 0;
      st.walking = walkingNow;
      st.working = false;
      st.headAngle = 0;
    }
    const lodRec = root.userData && root.userData.__npcLod;
    if (lodRec && lodRec.on && HC.QUALITY) {
      // Force full articulated model during combat!
      lodRec.on = false;
      for (const m of lodRec.meshes || []) m.visible = true;
      if (lodRec.baked) lodRec.baked.visible = false;
    }
    HC.animateNPC(root, dt);
    this._applyVisuals(entity, root, dt);
    return true;
  }

  stepWild(item, dt, horse, world) {
    if (!item || !item.root || item.recruited || item.isIndoors) return false;
    const st = item.root.userData && item.root.userData.npc;
    if (!st || !st.role) return false;
    item.y = item.y ?? groundY(world, item.x, item.z);
    item.dir = item.dir ?? (item.root.rotation ? item.root.rotation.y : 0);
    return this._stepTactical(item, dt, {
      root: item.root,
      role: st.role,
      anchorX: item.homeX,
      anchorZ: item.homeZ,
      detectR: 11.5,
      maxLeashR: 12.0,
      world,
      hx: horse && horse.x,
      hz: horse && horse.z,
      isWild: true,
    });
  }

  stepPartyMember(m, dt, hx, hz, _hyaw, _cart, physics, party) {
    if (!m || !m.root || !m.role || m.state !== 'following') return false;
    if (physics && physics.flipped) return false;
    const anchorX = hx, anchorZ = hz;
    const distHorse = Math.hypot(hx - m.x, hz - m.z);
    // If player rode far ahead (> 16 m), prioritize following the horse/cart first!
    if (distHorse > 16.0) {
      if (m.cBrain) m.cBrain.targetBoar = null;
      return false;
    }
    m.y = m.y ?? groundY(party && party.world, m.x, m.z);
    return this._stepTactical(m, dt, {
      root: m.root,
      role: m.role,
      anchorX,
      anchorZ,
      detectR: 13.5,
      maxLeashR: 19.5,
      world: party && party.world,
      hx, hz,
      isWild: false,
    });
  }
}

/* ============================================================================
   6. FOREST MOBS MANAGER (SPAWN KELINCI & BABI HUTAN, ORCHESTRATE SIMULATION)
   ============================================================================ */
class ForestMobs {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.vfx = new CombatVFX(scene, world);
    this.clock = 0;
    this.rabbits = [];
    this.boars = [];
    this.bandits = [];
    this.combatAI = new TacticalCombatAI(this);
    HC.combatAI = this.combatAI;
    HC.mobs = this;

    this._zones = this._buildWorldZones();
    this._spawnCheckT = 0;
    this._nightAmbushTimer = 10.0;
    this._nightAmbushInterval = 18.0;
    this._nightAmbushChance = 0.30;
    const initPose = (world && typeof world.initialHorsePose === 'function')
      ? world.initialHorsePose()
      : { x: -5.4, z: 0 };
    this._lastSpawnX = initPose.x;
    this._lastSpawnZ = initPose.z;
    this._spawnMobs(initPose.x, initPose.z);
  }

  _clearSpawn(x, z, rad = 0.65) {
    const pos = { x, z };
    keepOutOfPondAndBounds(pos, this.world, rad);
    return pos;
  }

  _isValidZonePos(x, z, allowNearCamp = false) {
    if (Math.abs(x) > 705 || Math.abs(z) > 705) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.safeR + 2.4) return false;
    if (!allowNearCamp && Math.hypot(x, z) < 13.0) return false;
    const w = this.world;
    if (w) {
      if (typeof w.waterDepthAt === 'function' && w.waterDepthAt(x, z) > 0.15) return false;
      if (typeof w._getRoadDistance === 'function' && w._getRoadDistance(x, z) < 5.5) return false;
      if (typeof w.isInsideVillage === 'function') {
        if (w.isInsideVillage(x, z, 4.0)) return false;
      } else {
        const vCx = typeof w._getRoadCenterX === 'function' ? w._getRoadCenterX(z) : -5.4;
        if (z > 40.0 && z < 114.0 && Math.abs(x - vCx) < 33.0) return false;
      }
    } else if (z > 40.0 && z < 114.0 && Math.abs(x + 5.4) < 33.0) {
      return false;
    }
    return true;
  }

  _buildWorldZones() {
    const seeds = [
      // Hutan & padang rumput sekitar area awal (radius 8..32 m)
      { x: -13.5, z: -4.8, kind: 'rabbit', count: 2 },
      { x:   3.2, z: -12.5, kind: 'rabbit', count: 2 },
      { x: -14.8, z:  8.5, kind: 'boar', count: 2 },
      { x:  16.5, z: -4.5, kind: 'boar', count: 2 },
      { x: -24.5, z: -10.5, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  23.5, z: -6.5, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: -25.0, z:  15.5, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x:  24.0, z:  16.5, kind: 'rabbit', count: 2 },
      // Lereng selatan & jalur rintangan batu
      { x: -34.0, z: -42.0, kind: 'boar', count: 2 },
      { x:  26.0, z: -46.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x: -65.0, z: -50.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  58.0, z: -56.0, kind: 'boar', count: 2 },
      { x: -18.0, z: -78.0, kind: 'rabbit', count: 2 },
      { x:  32.0, z: -86.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: -72.0, z: -92.0, kind: 'boar', count: 2 },
      { x:  88.0, z: -76.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      // Sayap hutan barat & timur tengah
      { x: -68.0, z:  -6.0, kind: 'rabbit', count: 2 },
      { x: -92.0, z:  18.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  72.0, z:   8.0, kind: 'boar', count: 2 },
      { x:  96.0, z: -12.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      // Tepian sungai utara & sisi luar desa
      { x: -64.0, z:  54.0, kind: 'boar', count: 2 },
      { x:  65.0, z:  55.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: -84.0, z:  82.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x:  78.0, z:  88.0, kind: 'rabbit', count: 2 },
      // Hutan utara di balik Desa Lemnos (z = 116..132)
      { x: -40.0, z: 122.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  36.0, z: 120.0, kind: 'boar', count: 2 },
      { x:  -4.0, z: 125.0, kind: 'rabbit', count: 2 },
      { x:  82.0, z: 118.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      // Koridor jalan unik antar-desa di peta 5x (Desa Puncak Pinus, Lembah Selatan, Surya Timur, Rimbun Barat)
      { x:  55.0, z: 162.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: 145.0, z: 142.0, kind: 'boar', count: 2 },
      { x: 220.0, z: 168.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: 265.0, z: 122.0, kind: 'rabbit', count: 2 },
      { x: 358.0, z: 195.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x: 332.0, z: 285.0, kind: 'boar', count: 2 },
      { x: 225.0, z: 335.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  65.0, z: 330.0, kind: 'rabbit', count: 2 },
      { x: -45.0, z: 215.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  28.0, z: 265.0, kind: 'boar', count: 2 },
      { x: -38.0, z: 420.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  42.0, z: 485.0, kind: 'boar', count: 2 },
      { x: -115.0, z: 68.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x: -195.0, z: -10.0, kind: 'boar', count: 2 },
      { x: -255.0, z: -62.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: -335.0, z: -175.0, kind: 'rabbit', count: 2 },
      { x: -255.0, z: -225.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: -175.0, z: -295.0, kind: 'boar', count: 2 },
      { x: -65.0, z: -210.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x:  24.0, z: -260.0, kind: 'boar', count: 2 },
      { x: -48.0, z: -415.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x:  35.0, z: -475.0, kind: 'rabbit', count: 2 },
      { x: 145.0, z:  22.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: 215.0, z: -25.0, kind: 'boar', count: 2 },
      { x: 255.0, z:  65.0, kind: 'bandit_camp', variants: ['small', 'small'] },
      { x: 225.0, z: -145.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: 145.0, z: -245.0, kind: 'boar', count: 2 },
      { x: -330.0, z:  85.0, kind: 'bandit_camp', variants: ['big', 'small'] },
      { x: -265.0, z: 235.0, kind: 'boar', count: 2 },
      { x: -165.0, z: 320.0, kind: 'bandit_camp', variants: ['small', 'small'] },
    ];

    const zones = [];
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      if (!this._isValidZonePos(s.x, s.z, s.kind === 'rabbit')) continue;
      zones.push({
        id: i,
        x: s.x,
        z: s.z,
        kind: s.kind,
        count: s.count || 2,
        variants: s.variants || ['small', 'small'],
        spawned: false,
        entities: [],
      });
    }
    return zones;
  }

  _spawnZone(z) {
    if (z.spawned) return;
    const spawned = [];
    if (z.kind === 'rabbit') {
      if (this.rabbits.length >= 10) return;
      const room = Math.min(z.count, 10 - this.rabbits.length);
      for (let k = 0; k < room; k++) {
        const ang = (z.id * 1.7 + k * 2.6) % (Math.PI * 2);
        const sp = this._clearSpawn(z.x + Math.cos(ang) * (2.2 + k * 1.4), z.z + Math.sin(ang) * (2.2 + k * 1.4), 0.35);
        const pal = (z.id + k) % 2 === 0 ? RABBIT_PALETTE_WHITE : RABBIT_PALETTE_BROWN;
        const r = new RabbitMob(this.scene, this.world, this.vfx, pal, sp.x, sp.z, ang);
        this.rabbits.push(r);
        spawned.push(r);
      }
    } else if (z.kind === 'boar') {
      if (this.boars.length >= 8) return;
      const room = Math.min(z.count, 8 - this.boars.length);
      for (let k = 0; k < room; k++) {
        const ang = (z.id * 2.1 + k * 3.1) % (Math.PI * 2);
        const sp = this._clearSpawn(z.x + Math.cos(ang) * (2.6 + k * 1.8), z.z + Math.sin(ang) * (2.6 + k * 1.8), 0.70);
        const b = new BoarMob(this.scene, this.world, this.vfx, sp.x, sp.z, ang);
        this.boars.push(b);
        spawned.push(b);
      }
    } else if (z.kind === 'bandit_camp') {
      if (this.bandits.length >= 8) return;
      const room = Math.min(z.variants.length, 8 - this.bandits.length);
      for (let k = 0; k < room; k++) {
        const variant = z.variants[k] === 'big' ? 'big' : 'small';
        const rad = variant === 'big' ? 0.68 : 0.45;
        const a0 = (z.id * 1.3 + k * 2.2) % (Math.PI * 2);
        const off = 2.4 + k * 2.8;
        const wps = [
          { x: z.x + Math.cos(a0) * off, z: z.z + Math.sin(a0) * off },
          { x: z.x + Math.cos(a0 + 2.1) * (off + 4.0), z: z.z + Math.sin(a0 + 2.1) * (off + 4.0) },
          { x: z.x + Math.cos(a0 + 4.2) * (off + 3.5), z: z.z + Math.sin(a0 + 4.2) * (off + 3.5) },
        ].map((wp) => {
          const pos = { x: wp.x, z: wp.z };
          keepBanditInForest(pos, this.world, rad);
          return pos;
        });
        const bd = new BanditMob(this.scene, this.world, this.vfx, variant, wps, a0);
        this.bandits.push(bd);
        spawned.push(bd);
      }
    }
    if (spawned.length > 0) {
      z.entities = spawned;
      z.spawned = true;
    }
  }

  _despawnZone(z, party = null) {
    if (!z.spawned) return;
    if (party && Array.isArray(party.members)) {
      for (const m of party.members) {
        if (m && m.cBrain && m.cBrain.targetBoar && z.entities.includes(m.cBrain.targetBoar)) {
          return;
        }
      }
    }
    for (const ent of z.entities) {
      if (!ent) continue;
      if (typeof ent.dispose === 'function') ent.dispose();
      const idxR = this.rabbits.indexOf(ent);
      if (idxR >= 0) this.rabbits.splice(idxR, 1);
      const idxB = this.boars.indexOf(ent);
      if (idxB >= 0) this.boars.splice(idxB, 1);
      const idxBd = this.bandits.indexOf(ent);
      if (idxBd >= 0) this.bandits.splice(idxBd, 1);
    }
    z.entities = [];
    z.spawned = false;
  }

  _updateProximitySpawns(hx, hz, dt, party = null) {
    const SPAWN_DIST = 54.0;
    const DESPAWN_DIST = 76.0;
    this._spawnCheckT += dt || 0;
    const movedFar = Math.hypot(hx - this._lastSpawnX, hz - this._lastSpawnZ) > 8.0;
    if (!movedFar && this._spawnCheckT < 0.45) return;
    this._spawnCheckT = 0;
    this._lastSpawnX = hx;
    this._lastSpawnZ = hz;

    // 1) Despawn zona yang jauh dulu untuk mengosongkan kuota mob/bandit aktif
    for (let i = 0; i < this._zones.length; i++) {
      const z = this._zones[i];
      if (!z.spawned) continue;
      let minD = Math.hypot(z.x - hx, z.z - hz);
      for (const ent of z.entities) {
        if (ent) minD = Math.min(minD, Math.hypot(ent.x - hx, ent.z - hz));
      }
      if (minD > DESPAWN_DIST) {
        this._despawnZone(z, party);
      }
    }

    // 2) Spawn zona yang dekat (diurutkan dari jarak terdekat)
    const candidates = [];
    for (let i = 0; i < this._zones.length; i++) {
      const z = this._zones[i];
      if (z.spawned) continue;
      const d = Math.hypot(z.x - hx, z.z - hz);
      if (d <= SPAWN_DIST) candidates.push({ z, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (let i = 0; i < candidates.length; i++) {
      this._spawnZone(candidates[i].z);
    }
  }

  _spawnMobs(originX = -5.4, originZ = 0) {
    this._updateProximitySpawns(originX, originZ, 99, null);
  }

  spawnNightRoadAmbush(hx, hz, hyaw = 0, world = this.world) {
    if (world && typeof world.isInsideVillage === 'function' && world.isInsideVillage(hx, hz, 6.0)) {
      return [];
    }
    const fwdX = Math.cos(hyaw);
    const fwdZ = -Math.sin(hyaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const distAhead = 18.0 + Math.random() * 7.0;
    const baseSide = (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 3.5);
    const ambX = hx + fwdX * distAhead + rightX * baseSide;
    const ambZ = hz + fwdZ * distAhead + rightZ * baseSide;

    const variants = Math.random() < 0.30 ? ['big', 'small'] : (Math.random() < 0.55 ? ['small', 'small'] : ['small']);
    const spawned = [];
    for (let k = 0; k < variants.length; k++) {
      if (this.bandits.length >= 12) break;
      const v = variants[k];
      const rad = v === 'big' ? 0.68 : 0.45;
      const sx = ambX + rightX * ((k === 0 ? -1 : 1) * 1.8);
      const sz = ambZ + rightZ * ((k === 0 ? -1 : 1) * 1.8);
      const pos = { x: sx, z: sz };
      keepBanditInForest(pos, world || this.world, rad);
      if (world && typeof world.isInsideVillage === 'function' && world.isInsideVillage(pos.x, pos.z, 4.0)) {
        continue;
      }
      const wps = [
        { x: pos.x, z: pos.z },
        { x: hx + fwdX * (distAhead - 5.5), z: hz + fwdZ * (distAhead - 5.5) },
      ];
      const yawToHorse = Math.atan2(hx - pos.x, hz - pos.z);
      const bd = new BanditMob(this.scene, world || this.world, this.vfx, v, wps, yawToHorse);
      bd.isRoadAmbush = true;
      this.bandits.push(bd);
      spawned.push(bd);
    }
    return spawned;
  }

  _updateNightRoadBandits(hx, hz, hyaw, dt, world, onNightAmbush) {
    const isNight = !!(world && world.currentMoodKey === 'night');
    let activeAmbush = 0;
    for (let i = this.bandits.length - 1; i >= 0; i--) {
      const bd = this.bandits[i];
      if (!bd || !bd.isRoadAmbush) continue;
      const d = Math.hypot(bd.x - hx, bd.z - hz);
      const shouldDespawn = d > 68.0
        || (bd.dead && bd.stateTime > 6.5)
        || (!isNight && !bd.inCombat && d > 18.0);
      if (shouldDespawn) {
        if (typeof bd.dispose === 'function') bd.dispose();
        this.bandits.splice(i, 1);
      } else if (!bd.dead) {
        activeAmbush++;
      }
    }
    if (!isNight) return;

    this._nightAmbushTimer -= dt;
    if (this._nightAmbushTimer > 0) return;
    this._nightAmbushTimer = this._nightAmbushInterval;

    if (activeAmbush >= 3) return;
    if (world && typeof world.isInsideVillage === 'function' && world.isInsideVillage(hx, hz, 6.0)) return;
    const roadDist = (world && typeof world._getRoadDistance === 'function') ? world._getRoadDistance(hx, hz) : 0;
    if (roadDist > 12.0) return;

    if (Math.random() < this._nightAmbushChance) {
      const spawned = this.spawnNightRoadAmbush(hx, hz, hyaw, world);
      if (spawned.length > 0 && typeof onNightAmbush === 'function') {
        onNightAmbush(spawned);
      }
    }
  }

  update(dt, ctx = {}) {
    const rawDt = Math.min(0.05, Math.max(0.001, dt || 1 / 60));
    this.vfx.update(rawDt, ctx.camera);

    // Hit-stop pauses mob/combat physics briefly on juicy critical strikes while VFX keep popping
    const simDt = this.vfx.hitStopTimer > 0 ? rawDt * 0.14 : rawDt;
    this.clock += simDt;

    const anim = ctx.animator;
    if (anim && Number.isFinite(anim.x) && Number.isFinite(anim.z)) {
      this._updateProximitySpawns(anim.x, anim.z, simDt, ctx.party);
      this._updateNightRoadBandits(anim.x, anim.z, anim.yaw || 0, simDt, ctx.world || this.world, ctx.onNightAmbush);
    }

    const fullCtx = {
      animator: anim,
      physics: ctx.physics,
      party: ctx.party,
      rabbits: this.rabbits,
      boars: this.boars,
      bandits: this.bandits,
      onCartAttacked: ctx.onCartAttacked,
    };

    for (const r of this.rabbits) {
      r.update(simDt, this.clock, fullCtx);
    }
    for (const b of this.boars) {
      b.update(simDt, this.clock);
    }
    for (const bd of this.bandits) {
      bd.update(simDt, this.clock, fullCtx);
    }
  }
}

HC.ForestMobs = ForestMobs;
