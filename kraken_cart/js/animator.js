import { HC } from './hc.js';
import './voxel.js';
import './horse.js';
const THREE = HC.THREE, S = HC.vs;

  const { CY, TORSO_REF = 23.5, L1, L2, HOOF_H } = HC.HORSE;

  // Badan kuda cukup tinggi seperti kuda dewasa dengan kurva sendi anatomis alami.
  const STANCE_DROP = 0.62;
  const UP_AXIS = new THREE.Vector3(0, 1, 0);
  const LOCAL_Z = new THREE.Vector3(0, 0, 1);

  // Solve 2-bone IK in world space: Hip H -> Knee K -> Ankle A
  // bendSign: +1 bends knee toward +X (front leg carpus/fetlock sweep), -1 bends hock toward -X (rear leg)
  // Solve 2-bone IK di BIDANG SAGITAL KUDA (bukan bidang X-Y dunia).
  // fx/fz = arah maju kuda di dunia, jadi tekukan lutut selalu ke depan/belakang
  // searah badan kuda — nggak pernah tekuk ke samping walau kuda lagi muter.
  function solveLegIK(H, A, l1, l2, bendSign, outK, fx, fz) {
    let dx = A.x - H.x, dy = A.y - H.y, dz = A.z - H.z;
    let d = Math.hypot(dx, dy, dz);
    const maxR = (l1 + l2) * 0.999;
    const minR = Math.abs(l1 - l2) * 1.08;
    if (d > maxR) {
      const sc = maxR / d;
      A.set(H.x + dx * sc, H.y + dy * sc, H.z + dz * sc);
      dx = A.x - H.x; dy = A.y - H.y; dz = A.z - H.z; d = maxR;
    } else if (d < minR) {
      const sc = minR / Math.max(d, 1e-6);
      A.set(H.x + dx * sc, H.y + dy * sc, H.z + dz * sc);
      dx = A.x - H.x; dy = A.y - H.y; dz = A.z - H.z; d = minR;
    }

    const ux = dx / d, uy = dy / d, uz = dz / d;
    const cosA = HC.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    // arah tekuk = arah maju kuda, diproyeksikan ke bidang tegak lurus tulang (H->A)
    const dot = fx * ux + fz * uz;
    let wx = fx - dot * ux;
    let wy = -dot * uy;
    let wz = fz - dot * uz;
    let wl = Math.hypot(wx, wy, wz);
    if (wl < 1e-4) { wx = fx; wy = 0; wz = fz; wl = 1; }
    wx /= wl; wy /= wl; wz /= wl;

    outK.set(
      H.x + (ux * cosA + wx * sinA * bendSign) * l1,
      H.y + (uy * cosA + wy * sinA * bendSign) * l1,
      H.z + (uz * cosA + wz * sinA * bendSign) * l1
    );
  }

  class HorseAnimator {
    constructor(horse, world) {
      this.horse = horse;
      this.world = world;

      this.state = 'walk'; // 'walk' | 'run' | 'jump' | 'graze'
      this.prevMoveState = 'walk';
      this.x = 0;
      this.z = 0;
      this.yaw = 0;          // heading (rad): forward = (cos yaw, 0, -sin yaw)
      this.yawRate = 0;
      this.steer = 0;        // smoothed steering input (-1 kiri .. +1 kanan)
      this.steerInput = 0;
      this.headLead = 0;     // kepala/leher mendahului badan saat belok
      this.bodyLag = 0;
      this.forwardX = 1;
      this.forwardZ = 0;
      this.speed = 0;
      this.targetSpeed = 0;
      this.throttle = 0;        // gas -1..1 dari input (diam sampai ditekan maju/mundur)
      this.speedScale = 1;      // limiter kondisi badan (survival)
      this.statSpeedScale = 1;  // bonus upgrade Top Speed kuda
      this.unhitched = false;   // tanpa gerobak: kuda jauh lebih lincah & cepat
      this.docking = null;      // animasi ngepasin posisi kuda ke pangkal batang gerobak
      this.phase = 0;
      this.time = 0;

      // Jump state machine
      this.jumpActive = false;
      this.jumpT = 0;
      this.jumpDur = 1.05;
      this.jumpY = 0;
      this.jumpPitch = 0;
      /* Momentum lompat: diambil saat kaki lepas tanah, lalu menggerus kuda
         ke depan selama di udara. Lari -> lompat lebih jauh & sedikit lebih
         tinggi, jalan -> lompatan kecil ke depan, diam -> lompat di tempat. */
      this.jumpTakeoff = 0;
      this.jumpImpulse = 0;
      this.jumpRun = 0;

      // Graze blending (0 = normal posture, 1 = head down grazing)
      this.grazeBlend = 0;
      this.runBlend = 0;
      // Sleep posture blending (0 = awake, 1 = lying in sternal recumbency)
      this.sleepBlend = 0;
      // Cart/wheel inspect mode (Q): kepala & leher menoleh ke samping/belakang ke arah roda gerobak
      this.inspectMode = false;
      this.inspectBlend = 0;
      this.menuIdleMode = false;
      this._menuT = 0;

      // Per-leg phase offsets:
      // Walk 4-beat: HL(0.0), FL(0.25), HR(0.50), FR(0.75)
      // Run/Gallop 4-beat canter: HR(0.0), HL(0.14), FR(0.52), FL(0.66)
      this._hipW = new THREE.Vector3();
      this._ankleW = new THREE.Vector3();
      this._kneeW = new THREE.Vector3();
      this._normW = new THREE.Vector3();
      this._hoofAxis = new THREE.Vector3();
      this._qHoof = new THREE.Quaternion();
      this._qYaw = new THREE.Quaternion();
      this._qGround = new THREE.Quaternion();
      this._qAir = new THREE.Quaternion();
      this._qSleep = new THREE.Quaternion();
      this._knee2 = new THREE.Vector3();
      this._sleepKneeW = new THREE.Vector3();
      this._sleepAnkleW = new THREE.Vector3();
      this._dirTmp1 = new THREE.Vector3();
      this._dirTmp2 = new THREE.Vector3();
    }

    setSteer(v) {
      this.steerInput = Math.max(-1, Math.min(1, v || 0));
    }

    // GAS dari analog (-1..1). Desktop tidak punya analog? main menyetel throttle
    // ke 1 / -1 supaya perilaku keyboard maju & mundur tetap jalan.
    setThrottle(v) { this.throttle = Math.max(-1, Math.min(1, v || 0)); }

    cancelDocking() { this.docking = null; }

    setState(mode) {
      if (mode === 'jump') {
        if (!this.jumpActive) {
          if (this.state === 'graze' || this.state === 'sleep') this.state = this.prevMoveState || 'walk';
          /* Catat kecepatan saat lepas tanah. Impuls depan dibatasi agar lompat saat
             lari terasa atletis dan natural, bukan melesat ekstrem. */
          this.jumpTakeoff = Math.max(0, this.speed);
          this.jumpRun = this.runBlend;
          this.jumpImpulse = Math.min(1.65, this.jumpTakeoff * (0.18 + 0.06 * this.jumpRun)
            + (this.jumpTakeoff > 0.5 ? 0.32 + 0.18 * this.jumpRun : 0));
          this.jumpActive = true;
          this.jumpT = 0;
        }
        return;
      }
      if (mode === 'walk' || mode === 'run') this.prevMoveState = mode;
      this.state = mode;
    }

    update(dt) {
      dt = Math.min(dt, 0.033);
      this.time += dt;

      const statSpd = this.statSpeedScale || 1;
      const walkMax = (this.unhitched ? 2.30 : 1.95) * statSpd;
      const runMax = (this.unhitched ? 6.15 : 5.25) * statSpd;
      const revMax = (this.unhitched ? 1.55 : 1.05) * statSpd;
      let moving = false;
      let pivoting = false;

      if (this.docking) {
        const d = this.docking;
        const dx = d.x - this.x;
        const dz = d.z - this.z;
        const dist = Math.hypot(dx, dz);
        let dyaw = d.yaw - this.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;

        const maxYawStep = 1.5 * dt;
        const yawStep = HC.clamp(dyaw, -maxYawStep, maxYawStep);
        this.yaw += yawStep;
        this.yawRate = yawStep / Math.max(dt, 1e-4);
        this.steer = HC.clamp(dyaw * 1.4, -1, 1);

        this.forwardX = Math.cos(this.yaw);
        this.forwardZ = -Math.sin(this.yaw);

        const maxSpd = Math.min(1.15, dist * 3.8);
        let vx = 0, vz = 0;
        if (dist > 1e-4) {
          vx = (dx / dist) * maxSpd;
          vz = (dz / dist) * maxSpd;
          const step = Math.min(dist, maxSpd * dt);
          this.x += (dx / dist) * step;
          this.z += (dz / dist) * step;
        }
        const signedSpd = vx * this.forwardX + vz * this.forwardZ;
        this.speed = HC.damp(this.speed, signedSpd, 12.0, dt);
        this.targetSpeed = signedSpd;
        this.throttle = Math.abs(signedSpd) > 0.05 ? Math.sign(signedSpd) * 0.45 : 0;
        this.runBlend = HC.damp(this.runBlend, 0, 8.0, dt);
        this.grazeBlend = HC.damp(this.grazeBlend, 0, 8.0, dt);
        this.sleepBlend = HC.damp(this.sleepBlend, 0, 7.0, dt);
        this.inspectBlend = HC.damp(this.inspectBlend, 0, 8.0, dt);
        this.headLead = HC.damp(this.headLead, HC.clamp(this.steer * 0.45, -0.5, 0.5), 10.0, dt);
        this.bodyLag = HC.damp(this.bodyLag, HC.clamp(-this.yawRate * 0.16, -0.18, 0.18), 6.0, dt);
        moving = Math.abs(this.speed) > 0.04;
        pivoting = !d.arrived && (Math.abs(this.yawRate) > 0.12 || dist > 0.04);

        if (dist < 0.03 && Math.abs(dyaw) < 0.025) {
          this.x = d.x;
          this.z = d.z;
          this.yaw = d.yaw;
          this.forwardX = Math.cos(this.yaw);
          this.forwardZ = -Math.sin(this.yaw);
          this.speed = 0;
          this.targetSpeed = 0;
          this.yawRate = 0;
          this.steer = 0;
          this.throttle = 0;
          d.arrived = true;
          moving = false;
          pivoting = false;
        }
      } else {
        // Gas dari analog (-1..1): throttle 0 = kuda berhenti walau toggle LARI nyala.
        const thr = this.throttle;
        const movingFwd = thr > 0.06;
        const movingRev = thr < -0.06;
        moving = movingFwd || movingRev;
        const wantRun = this.state === 'run' && movingFwd;

        if (this.state === 'sleep' && moving) {
          this.state = this.prevMoveState || 'walk';
        }
        const isSleep = !this.menuIdleMode && this.state === 'sleep' && !this.jumpActive && !moving;
        const isGraze = this.menuIdleMode ? ((this._menuT % 11.0) < 6.0) : (this.state === 'graze' && !this.jumpActive && !isSleep);
        const isRun = wantRun || (this.jumpActive && this.prevMoveState === 'run' && movingFwd);

        if (this.menuIdleMode) this._menuT += dt;
        const menuPhase = this.menuIdleMode ? (this._menuT % 11.0) : 0;
        const menuLookYaw = (this.menuIdleMode && menuPhase >= 6.0)
          ? Math.sin(((menuPhase - 6.0) / 5.0) * Math.PI * 2) * 0.58
          : 0;

        this.sleepBlend = HC.damp(this.sleepBlend, isSleep ? 1 : 0, 2.6, dt);
        this.grazeBlend = HC.damp(this.grazeBlend, isGraze ? 1 : 0, this.menuIdleMode ? 3.2 : 5.5, dt);
        this.inspectBlend = HC.damp(this.inspectBlend, (this.inspectMode && !isGraze && !isSleep && !this.menuIdleMode) ? 1 : 0, 6.5, dt);
        this.runBlend = HC.damp(this.runBlend, isRun ? 1 : 0, 6.0, dt);

        // Desired speed (+ maju, - mundur); kondisi badan (survival) menskalakan semua.
        if (this.menuIdleMode || isGraze || isSleep || !moving) {
          this.targetSpeed = 0;
        } else if (movingRev) {
          this.targetSpeed = -revMax * Math.min(1, Math.abs(thr)) * this.speedScale;
        } else {
          const span = HC.lerp(walkMax, runMax, this.runBlend);
          const wDepth = (!this.jumpActive && this.world && this.world.waterDepthAt)
            ? this.world.waterDepthAt(this.x, this.z) : 0;
          const waterScale = wDepth > 0.04 ? (1.0 - HC.clamp(wDepth * 0.28, 0, 0.28)) : 1.0;
          this.targetSpeed = span * Math.min(1, thr) * this.speedScale * waterScale;
          if (this.jumpActive) this.targetSpeed = Math.max(this.targetSpeed, (this.unhitched ? 3.8 : 3.2) * this.speedScale);
        }
        this.speed = HC.damp(this.speed, this.targetSpeed, this.unhitched ? 10.5 : 6.5, dt);
        if (!moving && Math.abs(this.speed) < 0.04) this.speed = 0;
        // Di udara kuda tidak mengerem: momentum lepas tanah dipertahankan.
        if (this.jumpActive) this.speed = Math.max(this.speed, this.jumpTakeoff);

        // ---- Steering: kepala menoleh dulu, badan menyusul; radius belok jauh lebih lincah ----
        this.steer = HC.damp(this.steer, this.menuIdleMode ? 0 : this.steerInput, this.unhitched ? 10.5 : 8.0, dt);
        const turnCap = this.unhitched ? 1.65 : 1.15;
        const turnMul = this.unhitched ? 0.85 : 0.62;
        const absSpd = Math.abs(this.speed);
        let rawTurn = Math.min(turnCap, absSpd * turnMul);
        if (this.unhitched && Math.abs(this.steer) > 0.04) {
          rawTurn = Math.max(rawTurn, 0.92);
        }
        const turnRate = this.steer * rawTurn * (1 - this.grazeBlend * 0.9) * (1 - this.sleepBlend) * (this.jumpActive ? 0.55 : 1);
        this.yawRate = HC.damp(this.yawRate, turnRate, this.unhitched ? 11.5 : 9.5, dt);
        this.yaw += this.yawRate * dt;

        // kepala + leher mendahului putaran badan (anticipation), badan menyusul dengan lag
        const headWant = (this.menuIdleMode
          ? menuLookYaw
          : HC.clamp(this.steer * 0.62 + this.yawRate * 0.24, -0.85, 0.85)) * (1 - this.sleepBlend);
        this.headLead = HC.damp(this.headLead, headWant, this.menuIdleMode ? 4.2 : 10.0, dt);
        this.bodyLag = HC.damp(this.bodyLag, HC.clamp(-this.yawRate * 0.18, -0.26, 0.26), 5.0, dt);

        this.forwardX = Math.cos(this.yaw);
        this.forwardZ = -Math.sin(this.yaw);
        // Dorongan depan saat melompat: penuh di awal lompatan, habis saat mendarat.
        const airPush = this.jumpActive
          ? this.jumpImpulse * Math.max(0, 1 - Math.pow(HC.clamp(this.jumpT, 0, 1), 2))
          : 0;
        this.x += this.forwardX * (this.speed + airPush) * dt;
        this.z += this.forwardZ * (this.speed + airPush) * dt;

        pivoting = this.unhitched && Math.abs(this.yawRate) > 0.12 && absSpd < 0.15 && !isGraze && !isSleep && !this.jumpActive;
      }

      // Advance gait cycle phase proportional to signed distance travelled (or gentle shuffle saat putar di tempat)
      const absSpeed = Math.abs(this.speed);
      const freq = HC.lerp(1.22, 2.38, this.runBlend);
      const denom = this.speed < -0.02 ? revMax : HC.lerp(walkMax, runMax, this.runBlend);
      const speedRatio = HC.clamp(absSpeed / denom, 0, 1.35);
      if (absSpeed > 0.02) {
        const dirSign = this.speed >= 0 ? 1 : -1;
        this.phase = ((this.phase + dirSign * dt * freq * speedRatio * (1 - this.grazeBlend * 0.92)) % 1 + 1) % 1;
      } else if (pivoting) {
        this.phase = (this.phase + dt * 1.15 * HC.clamp(Math.abs(this.yawRate), 0.25, 1.4)) % 1;
      }

      // ---- Jump arc & smooth equestrian pitch bascule ----
      let jumpHeave = 0;
      let jumpPitch = 0;
      let jumpTuckFront = 0;
      let jumpTuckRear = 0;
      let jumpAir = 0;

      if (this.jumpActive) {
        this.jumpT += dt / this.jumpDur;
        const u = this.jumpT;
        if (u < 0.16) {
          // 1) Gather & rock weight onto hind quarters (nose gently lifts)
          const k = HC.smooth(u / 0.16);
          jumpHeave = -0.10 * k;
          jumpPitch = 0.24 * k;
          jumpTuckFront = 0.22 * k;
        } else if (u < 0.84) {
          // 2) Smooth parabolic bascule arc (C0 continuous pitch + heave)
          const a = (u - 0.16) / 0.68;
          // Lari -> lompat lebih tinggi; tanpa gerobak lebih tinggi lagi.
          const maxH = ((this.unhitched ? 0.84 : 0.72) * (1 + 0.26 * (this.jumpRun || 0)))
            + (this.jumpTakeoff > 0.5 ? 0.10 : 0);
          jumpHeave = Math.sin(Math.PI * a) * maxH - (1 - a) * (1 - a) * 0.10;
          jumpPitch = 0.24 * Math.cos(Math.PI * a);
          jumpAir = Math.sin(Math.PI * a);
          jumpTuckFront = Math.sin(Math.PI * HC.clamp(a / 0.82, 0, 1));
          jumpTuckRear = Math.sin(Math.PI * HC.clamp((a - 0.12) / 0.86, 0, 1));
        } else if (u < 1.0) {
          // 3) Cushioned front-then-hind landing absorb
          const l = (u - 0.84) / 0.16;
          jumpHeave = -0.11 * Math.sin(Math.PI * l);
          jumpPitch = -0.24 * Math.pow(1 - l, 1.5);
        } else {
          this.jumpActive = false;
          this.jumpT = 0;
        }
      }
      this.jumpY = Math.max(0, jumpHeave);
      this.jumpPitch = jumpPitch;

      // ---- Ground height under horse front & rear to tilt body along terrain (mengikuti arah hadap) ----
      const ghFront = this.world.heightAt(this.x + this.forwardX * 0.55, this.z + this.forwardZ * 0.55);
      const ghRear = this.world.heightAt(this.x - this.forwardX * 0.55, this.z - this.forwardZ * 0.55);
      const ghMid = (ghFront + ghRear) * 0.5;
      const terrainPitch = Math.atan2(ghFront - ghRear, 1.10);

      // ---- Torso bobbing & rocking + realistic equine sternal recumbency sleeping posture ----
      const p2 = this.phase * Math.PI * 2;
      const sl = this.sleepBlend || 0;
      const breath = Math.sin(this.time * 1.15);
      const moveAmt = HC.clamp(absSpeed / 2.2 + (pivoting ? 0.16 : 0), 0, 1.5) * (1 - this.grazeBlend) * (1 - sl);
      const walkBob = Math.sin(p2 * 2) * 0.028 * (1 - this.runBlend);
      const runBob = Math.sin(p2) * 0.075 * this.runBlend;
      const runPitch = Math.cos(p2) * 0.085 * this.runBlend;
      const walkRoll = Math.sin(p2) * 0.022 * (1 - this.runBlend);

      const standTorsoY = CY * S - STANCE_DROP * S + ghMid + (walkBob + runBob) * moveAmt + jumpHeave - this.grazeBlend * 0.48;
      // Belly voxel bottom = 16 -> -7.5*S = -0.469 m below torso pivot; resting height ghMid + 0.50 m puts belly flush on turf with gentle breathing heave
      const sleepTorsoY = ghMid + 0.50 + breath * 0.016;
      const torsoY = HC.lerp(standTorsoY, sleepTorsoY, sl);
      this.horse.root.position.set(this.x, 0, this.z);
      this.horse.root.rotation.y = this.yaw;
      this.horse.torso.position.set(0, torsoY, 0);

      const bankRoll = -this.yawRate * Math.max(0, this.speed) * 0.055; // miring ke dalam tikungan maju
      const standPitch = terrainPitch * 0.65 + runPitch * moveAmt + jumpPitch - this.grazeBlend * 0.11;
      const standRoll = walkRoll * moveAmt + bankRoll;
      const totalPitch = HC.lerp(standPitch, terrainPitch * 0.85 - 0.04, sl);
      const totalRoll = HC.lerp(standRoll, 0.21 + breath * 0.012, sl);
      this.horse.torso.rotation.set(totalRoll, this.bodyLag * (1 - sl), totalPitch);

      // ---- Neck, Head, Jaw & Ears (Walk / Run / Jump / Graze / Sleep) ----
      const neckRhythm = Math.sin(p2 * (this.runBlend > 0.5 ? 1 : 2) - 0.7) * HC.lerp(0.06, 0.16, this.runBlend) * moveAmt;
      const jumpNeck = this.jumpActive ? (jumpAir * -0.26 - jumpPitch * 0.35) : 0;

      // Grazing procedural motion: reach down to ground y=0, nibble & tug sideways
      const grazeTug = Math.sin(this.time * 7.2) * 0.055 + Math.sin(this.time * 2.3) * 0.04;
      const grazeSweepYaw = Math.sin(this.time * 1.15) * 0.28 + Math.sin(this.time * 3.7) * 0.05;
      const chew = Math.max(0, Math.sin(this.time * 11.5)) * 0.22 + 0.04;

      // Base upright angles vs deep grazing angles (reaches ground cleanly!)
      const nlZ_move = -0.38 + neckRhythm + jumpNeck - this.runBlend * 0.16;
      const nuZ_move = -0.22 + neckRhythm * 0.6;
      const hdZ_move = 0.42 - neckRhythm * 0.7 + this.runBlend * 0.18;

      // Grazing chain solved so the muzzle actually lands on the ground:
      // neck drops forward-down (-2.55 rad), second segment straightens (-0.55),
      // then the head counter-rotates to aim the muzzle down-forward at ~-1.1 rad.
      const nlZ_graze = -1.66 + grazeTug * 0.14;
      const nuZ_graze = -0.62 + grazeTug * 0.18;
      const hdZ_graze = 0.52 + grazeTug * 0.32;

      const nlZ_stand = HC.lerp(nlZ_move, nlZ_graze, this.grazeBlend);
      const nuZ_stand = HC.lerp(nuZ_move, nuZ_graze, this.grazeBlend);
      const hdZ_stand = HC.lerp(hdZ_move, hdZ_graze, this.grazeBlend);

      const nlZ_sleep = -1.28 + breath * 0.025;
      const nuZ_sleep = -0.30 + breath * 0.015;
      const hdZ_sleep = 0.46 - breath * 0.015;

      this.horse.neckLow.position.set(
        (11.0 + this.grazeBlend * 1.4 + sl * 0.6) * S,
        ((27.6 - TORSO_REF) - this.grazeBlend * 4.2 - sl * 2.2) * S,
        0
      );
      this.horse.neckUp.position.set(0, 7.4 * S, 0);
      const insp = this.inspectBlend || 0;
      const nlYawStand = grazeSweepYaw * 0.45 * this.grazeBlend + this.headLead * 0.34 + 0.58 * insp;
      const nuYawStand = grazeSweepYaw * 0.55 * this.grazeBlend + this.headLead * 0.50 + 0.54 * insp;
      const hdYawStand = grazeSweepYaw * 0.35 * this.grazeBlend + this.headLead * 0.62 + 0.50 * insp;

      this.horse.neckLow.rotation.set(
        0,
        HC.lerp(nlYawStand, 0.30, sl),
        HC.lerp(nlZ_stand - 0.14 * insp, nlZ_sleep, sl)
      );
      this.horse.neckUp.rotation.set(
        0,
        HC.lerp(nuYawStand, 0.24, sl),
        HC.lerp(nuZ_stand - 0.06 * insp, nuZ_sleep, sl)
      );
      this.horse.head.rotation.set(
        HC.lerp(Math.sin(this.time * 5.2) * 0.04 * this.grazeBlend + 0.08 * insp, -0.06, sl),
        HC.lerp(hdYawStand, 0.16, sl),
        HC.lerp(hdZ_stand - 0.16 * insp, hdZ_sleep, sl)
      );
      this.horse.jaw.rotation.z = -chew * this.grazeBlend * (1 - sl);

      // Ears flick (relaxed outward droop when sleeping)
      for (let i = 0; i < this.horse.ears.length; i++) {
        const s = i === 0 ? -1 : 1;
        const flick = Math.sin(this.time * 3.1 + i * 2.1) * 0.12 + (this.runBlend * -0.28);
        const earRotX = HC.lerp(s * 0.12, s * 0.34, sl);
        const earRotZ = HC.lerp(flick, -0.24, sl);
        this.horse.ears[i].rotation.set(earRotX, 0, earRotZ);
      }

      // ---- Multi-segment Tail inertia & swish (rests calmly when sleeping) ----
      for (let i = 0; i < this.horse.tailSegs.length; i++) {
        const seg = this.horse.tailSegs[i];
        const lag = i * 0.55;
        const liftStand = i === 0 ? (-0.28 - this.runBlend * 0.45 - (this.jumpActive ? 0.25 : 0)) : -0.06;
        const waveZ = Math.sin(this.time * (4.0 + this.runBlend * 4.5) - lag) * (0.06 + this.runBlend * 0.09);
        const swishX = Math.sin(this.time * 2.4 - lag) * (0.07 + this.grazeBlend * 0.14);
        const liftSleep = i === 0 ? -0.58 : -0.18;
        seg.rotation.set(swishX * (1 - sl), 0, HC.lerp(liftStand + waveZ, liftSleep, sl));
      }

      // ---- 4-Leg IK with Surface & Pebble Detection ----
      this.horse.root.updateMatrixWorld(true);

      const walkOffsets = { HL: 0.00, FL: 0.25, HR: 0.50, FR: 0.75 };
      const runOffsets  = { HR: 0.00, HL: 0.15, FR: 0.52, FL: 0.67 };

      const strideScale = this.speed < -0.02 ? 0.72 : 1.0;
      const strideLen = pivoting
        ? 0.14
        : HC.lerp(0.46, 0.92, this.runBlend) * HC.clamp(absSpeed / 1.9, 0, 1.4) * strideScale * (1 - this.grazeBlend);
      const stepHeight = pivoting
        ? 0.09
        : HC.lerp(0.16, 0.31, this.runBlend) * HC.clamp(absSpeed / 1.6, 0, 1.3) * strideScale * (1 - this.grazeBlend);
      const duty = HC.lerp(0.62, 0.42, this.runBlend); // fraction of cycle foot is planted on ground

      const l1World = L1 * S;
      const l2World = L2 * S;
      const hoofHWorld = HOOF_H * S;

      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      for (const leg of this.horse.legs) {
        const wOff = walkOffsets[leg.id];
        const rOff = runOffsets[leg.id];
        const off = HC.lerp(wOff, rOff, this.runBlend);
        const u = (this.phase + off) % 1;

        let strideX = 0;
        let liftY = 0;
        let stance = 1;
        let fetlockFlex = 0;

        if (this.grazeBlend > 0.85 && !this.jumpActive) {
          // Grazing stance: front legs spread slightly ("grazing split") so muzzle easily touches ground
          if (leg.id === 'FL') strideX = 0.14;
          else if (leg.id === 'FR') strideX = -0.10 + Math.max(0, Math.sin(this.time * 1.6)) * 0.06;
          else if (leg.id === 'HL') strideX = -0.05;
          else strideX = 0.04;
          liftY = leg.id === 'FR' ? Math.max(0, Math.sin(this.time * 1.6)) * 0.045 : 0;
          stance = liftY > 0.01 ? 0.3 : 1.0;
        } else if (!moving && absSpeed < 0.05 && !pivoting && !this.jumpActive) {
          // Diam di tempat: keempat kaki menapak rata di tanah.
          strideX = 0;
          liftY = 0;
          stance = 1.0;
          fetlockFlex = 0;
        } else if (u < duty) {
          // Stance phase: foot sweeps from +stride/2 to -stride/2 on the ground
          const t = u / duty;
          strideX = (0.5 - t) * strideLen;
          liftY = 0;
          stance = 1.0;
          // Mid-stance fetlock loading
          fetlockFlex = Math.sin(Math.PI * t) * 0.14 * moveAmt;
        } else {
          // Swing phase: foot lifts in a smooth cycloid arc from -stride/2 to +stride/2
          const t = (u - duty) / (1 - duty);
          strideX = (-0.5 + HC.smooth(t)) * strideLen;
          const bell = Math.sin(Math.PI * t);
          liftY = bell * stepHeight;
          stance = 0.0;
          fetlockFlex = -bell * 0.58; // hoof curls back while airborne
        }

        // Jump leg tuck override: kaki ikut naik bersama badan di udara & ditekuk rapi di bawah perut
        let airTuck = 0;
        if (this.jumpActive && this.jumpT < 0.86) {
          const isLeft = (leg.id === 'FL' || leg.id === 'HL');
          const stagger = isLeft ? 0.06 : -0.04;
          const tuckRaw = leg.front ? jumpTuckFront : jumpTuckRear;
          airTuck = HC.clamp(tuckRaw + stagger * jumpAir, 0, 1);
          const airProg = HC.clamp((this.jumpT - 0.16) / 0.68, 0, 1);
          const frontReach = airProg > 0.70 ? ((airProg - 0.70) / 0.30) * 0.30 : 0;
          const rearPush = airProg < 0.25 ? -(1 - airProg / 0.25) * 0.24 : 0;
          strideX = leg.front
            ? HC.lerp(strideX, 0.34 * airTuck + frontReach, Math.max(jumpAir, airTuck))
            : HC.lerp(strideX, -0.22 * airTuck + rearPush, Math.max(jumpAir, airTuck));
          fetlockFlex = -0.68 * airTuck;
          stance = this.jumpT < 0.16 && !leg.front ? 1.0 : 0;
        }

        // Get hip world position
        leg.hipGroup.getWorldPosition(this._hipW);

        // Rest neutral foot X/Z beneath hip, diputar mengikuti heading kuda
        const hx = leg.hipLocal.x, hz = leg.hipLocal.z;
        const stanceShift = leg.front ? 0.02 : -0.08;
        const footX = this.x + hx * cy + hz * sy + (strideX + stanceShift) * cy;
        const footZ = this.z - hx * sy + hz * cy - (strideX + stanceShift) * sy;

        // Detect exact ground + pebble + rock mesh height & surface normal at foot (footX, footZ)
        const groundY = this.world.heightAt(footX, footZ);
        this.world.normalAt(footX, footZ, this._normW);

        // Ankle target follows airborne torso + folds knees cleanly toward belly
        const baseAnkleY = groundY + hoofHWorld + liftY;
        const desiredDrop = HC.lerp(1.28, 0.72, airTuck);
        const airAnkleY = this._hipW.y - desiredDrop;
        const ankleY = airTuck > 0.02
          ? Math.max(baseAnkleY, HC.lerp(baseAnkleY, airAnkleY, HC.clamp(Math.max(airTuck * 1.15, jumpAir), 0, 1)))
          : baseAnkleY;
        this._ankleW.set(footX, ankleY, footZ);
        leg.footWorld.set(footX, groundY, footZ);
        leg.stanceBlend = HC.damp(leg.stanceBlend, stance, 18, dt);

        // Solve 2-bone IK di bidang sagital kuda:
        // Semua kaki (depan & belakang) sikunya menekuk menghadap ke depan (+1).
        const bendSign = 1;
        solveLegIK(this._hipW, this._ankleW, l1World, l2World, bendSign, this._kneeW, cy, -sy);

        // Realistic sleeping folded legs blend (sternum & flank tucked cleanly above grass)
        if (sl > 0.005) {
          const isLeft = (leg.id === 'FL' || leg.id === 'HL');
          const latSign = isLeft ? 1 : -1;
          const sdX = sy, sdZ = cy; // local +Z axis in world space (left = +1, right = -1)
          // 1) Save standing/walking upper & lower bone unit directions
          this._dirTmp1.subVectors(this._kneeW, this._hipW);
          if (this._dirTmp1.lengthSq() > 1e-8) this._dirTmp1.normalize();
          this._dirTmp2.subVectors(this._ankleW, this._kneeW);
          if (this._dirTmp2.lengthSq() > 1e-8) this._dirTmp2.normalize();

          // 2) Compute target sleeping upper & lower unit directions
          if (leg.front) {
            const sideLat = -0.14 * latSign;
            this._sleepKneeW.set(cy * 0.62 + sdX * sideLat, -0.49, -sy * 0.62 + sdZ * sideLat).normalize();
            const cannonLat = -0.16 * latSign;
            this._sleepAnkleW.set(-cy * 0.63 + sdX * cannonLat, 0.04, sy * 0.63 + sdZ * cannonLat).normalize();
          } else {
            const hipLat = isLeft ? 0.12 : -0.18;
            this._sleepKneeW.set(cy * 0.64 + sdX * hipLat, -0.45, -sy * 0.64 + sdZ * hipLat).normalize();
            const cannonLat = isLeft ? -0.12 : 0.08;
            this._sleepAnkleW.set(-cy * 0.62 + sdX * cannonLat, -0.05, sy * 0.62 + sdZ * cannonLat).normalize();
          }

          // 3) Smoothly blend bone directions preserving exact bone lengths l1 & l2
          this._dirTmp1.lerp(this._sleepKneeW, sl).normalize();
          this._dirTmp2.lerp(this._sleepAnkleW, sl).normalize();
          this._kneeW.copy(this._hipW).addScaledVector(this._dirTmp1, l1World);
          const minSleepY = groundY + 0.085;
          if (this._kneeW.y < minSleepY && sl > 0.25) {
            this._kneeW.y = HC.lerp(this._kneeW.y, minSleepY, HC.clamp((sl - 0.25) / 0.75, 0, 1));
          }
          this._ankleW.copy(this._kneeW).addScaledVector(this._dirTmp2, l2World);
          if (this._ankleW.y < minSleepY && sl > 0.25) {
            this._ankleW.y = HC.lerp(this._ankleW.y, minSleepY, HC.clamp((sl - 0.25) / 0.75, 0, 1));
          }
        }

        // Aim upper bone (H -> K) and lower bone (K -> A)
        HC.aimBone(leg.upperMesh, this._hipW, this._kneeW);
        leg.upperMesh.updateMatrixWorld(true);
        HC.aimBone(leg.lowerMesh, this._kneeW, this._ankleW);
        leg.lowerMesh.updateMatrixWorld(true);

        // Orient hoof: flush to terrain normal when planted, pure sagittal curl when airborne
        this._qYaw.setFromAxisAngle(UP_AXIS, this.yaw);
        this._qGround.setFromUnitVectors(UP_AXIS, this._normW).multiply(this._qYaw);
        this._qAir.setFromAxisAngle(LOCAL_Z, fetlockFlex).premultiply(this._qYaw);
        this._qHoof.copy(this._qAir).slerp(this._qGround, leg.stanceBlend);
        if (sl > 0.005) {
          const sleepHoofPitch = leg.front ? -1.42 : -1.24;
          this._qSleep.setFromAxisAngle(LOCAL_Z, sleepHoofPitch).premultiply(this._qYaw);
          this._qHoof.slerp(this._qSleep, sl);
        }
        HC.setWorldQuat(leg.hoof, this._qHoof);
      }
    }
  }

  HC.HorseAnimator = HorseAnimator;
