import { HC } from './hc.js';
import './voxel.js';
import './horse.js';
const THREE = HC.THREE, S = HC.vs;

  const { CY, L1, L2, HOOF_H } = HC.HORSE;

  // Badan kuda diturunkan sedikit supaya kaki punya ruang tekuk (sebelumnya tulang kaki
  // selalu mentok lurus karena jarak pinggul->tapak lebih panjang dari panjang tulang).
  const STANCE_DROP = 1.20;              // voxel: badan turun tipis biar lutut/sikut kelihatan menekuk ke DEPAN
  const UP_AXIS = new THREE.Vector3(0, 1, 0);

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
      this.speed = 1.8;
      this.targetSpeed = 1.85;
      this.throttle = 1;        // gas 0..1 dari analog (default penuh/desktop)
      this.speedScale = 1;      // limiter kondisi badan (survival)
      this.phase = 0;
      this.time = 0;

      // Jump state machine
      this.jumpActive = false;
      this.jumpT = 0;
      this.jumpDur = 1.05;
      this.jumpY = 0;
      this.jumpPitch = 0;

      // Graze blending (0 = normal posture, 1 = head down grazing)
      this.grazeBlend = 0;
      this.runBlend = 0;

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
      this._knee2 = new THREE.Vector3();
    }

    setSteer(v) {
      this.steerInput = Math.max(-1, Math.min(1, v || 0));
    }

    // GAS dari analog (0..1). Desktop tidak punya analog? main menyetel throttle
    // ke 1 supaya perilaku keyboard lama tetap jalan.
    setThrottle(v) { this.throttle = Math.max(0, Math.min(1, v || 0)); }

    setState(mode) {
      if (mode === 'jump') {
        if (!this.jumpActive) {
          if (this.state === 'graze') this.state = this.prevMoveState || 'walk';
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

      // Gas dari analog: throttle 0 = kuda berhenti walau toggle LARI nyala.
      const thr = this.throttle;
      const moving = thr > 0.06;
      const wantRun = this.state === 'run' && moving;

      const isGraze = this.state === 'graze' && !this.jumpActive;
      const isRun = wantRun || (this.jumpActive && this.prevMoveState === 'run' && moving);

      this.grazeBlend = HC.damp(this.grazeBlend, isGraze ? 1 : 0, 5.5, dt);
      this.runBlend = HC.damp(this.runBlend, isRun ? 1 : 0, 6.0, dt);

      // Desired forward speed. Kecepatan puncak ditentukan toggle LARI, tapi
      // besar gas tetap dari analog; kondisi badan (survival) menskalakan semua.
      if (isGraze || !moving) {
        this.targetSpeed = 0;
      } else {
        const span = HC.lerp(1.95, 5.25, this.runBlend);
        this.targetSpeed = span * Math.min(1, thr) * this.speedScale;
        if (this.jumpActive) this.targetSpeed = Math.max(this.targetSpeed, 3.2 * this.speedScale);
      }
      this.speed = HC.damp(this.speed, this.targetSpeed, 6.5, dt);

      // ---- Steering: kepala menoleh dulu, badan menyusul, kaki mengikuti jalur ----
      this.steer = HC.damp(this.steer, this.steerInput, 6.5, dt);
      const turnRate = this.steer * Math.min(0.55, this.speed * 0.30) * (1 - this.grazeBlend * 0.9) * (this.jumpActive ? 0.55 : 1);
      this.yawRate = HC.damp(this.yawRate, turnRate, 8.0, dt);
      this.yaw += this.yawRate * dt;

      // kepala + leher mendahului putaran badan (anticipation), badan menyusul dengan lag
      const headWant = HC.clamp(this.steer * 0.62 + this.yawRate * 0.30, -0.85, 0.85);
      this.headLead = HC.damp(this.headLead, headWant, 10.0, dt);
      this.bodyLag = HC.damp(this.bodyLag, HC.clamp(-this.yawRate * 0.22, -0.26, 0.26), 4.5, dt);

      this.forwardX = Math.cos(this.yaw);
      this.forwardZ = -Math.sin(this.yaw);
      this.x += this.forwardX * this.speed * dt;
      this.z += this.forwardZ * this.speed * dt;

      // Advance gait cycle phase proportional to distance travelled
      const freq = HC.lerp(1.22, 2.38, this.runBlend);
      const speedRatio = HC.clamp(this.speed / HC.lerp(1.95, 5.25, this.runBlend), 0, 1.35);
      this.phase = (this.phase + dt * freq * Math.max(0.15, speedRatio) * (1 - this.grazeBlend * 0.92)) % 1;

      // ---- Jump arc & body pitch ----
      let jumpHeave = 0;
      let jumpPitch = 0;
      let jumpTuckFront = 0;
      let jumpTuckRear = 0;

      if (this.jumpActive) {
        this.jumpT += dt / this.jumpDur;
        const u = this.jumpT;
        if (u < 0.18) {
          // 1) Crouch / gather on hind legs
          const k = HC.smooth(u / 0.18);
          jumpHeave = -0.11 * k;
          jumpPitch = 0.18 * k;
        } else if (u < 0.82) {
          // 2) Airborne parabola
          const a = (u - 0.18) / 0.64;
          const arc = 4 * a * (1 - a);
          jumpHeave = 0.68 * arc;
          jumpPitch = HC.lerp(0.32, -0.28, a);
          jumpTuckFront = Math.sin(Math.PI * HC.clamp((a - 0.02) / 0.72, 0, 1));
          jumpTuckRear = Math.sin(Math.PI * HC.clamp((a - 0.18) / 0.75, 0, 1));
        } else if (u < 1.0) {
          // 3) Landing compression & recovery
          const l = (u - 0.82) / 0.18;
          jumpHeave = -0.10 * Math.sin(Math.PI * l);
          jumpPitch = -0.12 * Math.sin(Math.PI * l);
        } else {
          this.jumpActive = false;
          this.jumpT = 0;
        }
      }

      // ---- Ground height under horse front & rear to tilt body along terrain (mengikuti arah hadap) ----
      const ghFront = this.world.heightAt(this.x + this.forwardX * 0.55, this.z + this.forwardZ * 0.55);
      const ghRear = this.world.heightAt(this.x - this.forwardX * 0.55, this.z - this.forwardZ * 0.55);
      const ghMid = (ghFront + ghRear) * 0.5;
      const terrainPitch = Math.atan2(ghFront - ghRear, 1.10);

      // ---- Torso bobbing & rocking ----
      const p2 = this.phase * Math.PI * 2;
      const moveAmt = HC.clamp(this.speed / 2.2, 0, 1.5) * (1 - this.grazeBlend);
      const walkBob = Math.sin(p2 * 2) * 0.028 * (1 - this.runBlend);
      const runBob = Math.sin(p2) * 0.075 * this.runBlend;
      const runPitch = Math.cos(p2) * 0.085 * this.runBlend;
      const walkRoll = Math.sin(p2) * 0.022 * (1 - this.runBlend);

      const torsoY = CY * S - STANCE_DROP * S + ghMid + (walkBob + runBob) * moveAmt + jumpHeave - this.grazeBlend * 0.40;
      this.horse.root.position.set(this.x, 0, this.z);
      this.horse.root.rotation.y = this.yaw;
      this.horse.torso.position.set(0, torsoY, 0);

      const bankRoll = -this.yawRate * this.speed * 0.055; // miring ke dalam tikungan
      const totalPitch = terrainPitch * 0.65 + runPitch * moveAmt + jumpPitch - this.grazeBlend * 0.11;
      const totalRoll = walkRoll * moveAmt + bankRoll;
      this.horse.torso.rotation.set(totalRoll, this.bodyLag, totalPitch);

      // ---- Neck, Head, Jaw & Ears (Walk / Run / Jump / Graze) ----
      const neckRhythm = Math.sin(p2 * (this.runBlend > 0.5 ? 1 : 2) - 0.7) * HC.lerp(0.06, 0.16, this.runBlend) * moveAmt;
      const jumpNeck = this.jumpActive ? -jumpPitch * 0.55 : 0;

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

      this.horse.neckLow.position.set(
        (11.0 + this.grazeBlend * 1.4) * S,
        ((27.6 - CY) - this.grazeBlend * 4.2) * S,
        0
      );
      this.horse.neckUp.position.set(0, 7.4 * S, 0);
      this.horse.neckLow.rotation.set(
        0,
        grazeSweepYaw * 0.45 * this.grazeBlend + this.headLead * 0.34,
        HC.lerp(nlZ_move, nlZ_graze, this.grazeBlend)
      );
      this.horse.neckUp.rotation.set(
        0,
        grazeSweepYaw * 0.55 * this.grazeBlend + this.headLead * 0.50,
        HC.lerp(nuZ_move, nuZ_graze, this.grazeBlend)
      );
      this.horse.head.rotation.set(
        Math.sin(this.time * 5.2) * 0.04 * this.grazeBlend,
        grazeSweepYaw * 0.35 * this.grazeBlend + this.headLead * 0.62,
        HC.lerp(hdZ_move, hdZ_graze, this.grazeBlend)
      );
      this.horse.jaw.rotation.z = -chew * this.grazeBlend;

      // Ears flick
      for (let i = 0; i < this.horse.ears.length; i++) {
        const s = i === 0 ? -1 : 1;
        const flick = Math.sin(this.time * 3.1 + i * 2.1) * 0.12 + (this.runBlend * -0.28);
        this.horse.ears[i].rotation.set(s * 0.12, 0, flick);
      }

      // ---- Multi-segment Tail inertia & swish ----
      for (let i = 0; i < this.horse.tailSegs.length; i++) {
        const seg = this.horse.tailSegs[i];
        const lag = i * 0.55;
        const lift = i === 0 ? (-0.28 - this.runBlend * 0.45 - (this.jumpActive ? 0.25 : 0)) : -0.06;
        const waveZ = Math.sin(this.time * (4.0 + this.runBlend * 4.5) - lag) * (0.06 + this.runBlend * 0.09);
        const swishX = Math.sin(this.time * 2.4 - lag) * (0.07 + this.grazeBlend * 0.14);
        seg.rotation.set(swishX, 0, lift + waveZ);
      }

      // ---- 4-Leg IK with Surface & Pebble Detection ----
      this.horse.root.updateMatrixWorld(true);

      const walkOffsets = { HL: 0.00, FL: 0.25, HR: 0.50, FR: 0.75 };
      const runOffsets  = { HR: 0.00, HL: 0.15, FR: 0.52, FL: 0.67 };

      const strideLen = HC.lerp(0.46, 0.92, this.runBlend) * HC.clamp(this.speed / 1.9, 0, 1.4) * (1 - this.grazeBlend);
      const stepHeight = HC.lerp(0.16, 0.31, this.runBlend) * HC.clamp(this.speed / 1.6, 0, 1.3) * (1 - this.grazeBlend);
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

        // Jump leg tuck override
        if (this.jumpActive && this.jumpT > 0.16 && this.jumpT < 0.86) {
          const tuck = leg.front ? jumpTuckFront : jumpTuckRear;
          liftY = Math.max(liftY, tuck * 0.36);
          strideX = HC.lerp(strideX, leg.front ? 0.22 * tuck : -0.26 * tuck, tuck);
          fetlockFlex = -tuck * 0.75;
          stance = 0;
        }

        // Get hip world position
        leg.hipGroup.getWorldPosition(this._hipW);

        // Rest neutral foot X/Z beneath hip, diputar mengikuti heading kuda
        const hx = leg.hipLocal.x, hz = leg.hipLocal.z;
        const stanceShift = leg.front ? 0.03 : -0.04;
        const footX = this.x + hx * cy + hz * sy + (strideX + stanceShift) * cy;
        const footZ = this.z - hx * sy + hz * cy - (strideX + stanceShift) * sy;

        // Detect exact ground + pebble height & surface normal at foot (footX, footZ)
        const groundY = this.world.heightAt(footX, footZ);
        this.world.normalAt(footX, footZ, this._normW);

        // Ankle target is hoofHWorld above the ground contact + swing lift
        const ankleY = groundY + hoofHWorld + liftY;
        this._ankleW.set(footX, ankleY, footZ);
        leg.footWorld.set(footX, groundY, footZ);
        leg.stanceBlend = HC.damp(leg.stanceBlend, stance, 18, dt);

        // Solve 2-bone IK di bidang sagital kuda.
        // SEMUA kaki (depan & belakang) sendinya menonjol KE DEPAN -> bendSign +1.
        // (Dulu kaki belakang pakai -1, jadi sikut/lututnya kelipat ke belakang & kelihatan kebalik.)
        const bendSign = 1;
        solveLegIK(this._hipW, this._ankleW, l1World, l2World, bendSign, this._kneeW, cy, -sy);

        // Aim upper bone (H -> K) and lower bone (K -> A)
        HC.aimBone(leg.upperMesh, this._hipW, this._kneeW);
        leg.upperMesh.updateMatrixWorld(true);
        HC.aimBone(leg.lowerMesh, this._kneeW, this._ankleW);
        leg.lowerMesh.updateMatrixWorld(true);

        // Orient hoof: when planted on ground/pebble, align flush to surface normal!
        // When swinging in air, curl hoof naturally with fetlockFlex
        const slopeAngle = Math.atan2(-(this._normW.x * cy - this._normW.z * sy), this._normW.y);
        const airAngle = fetlockFlex;
        const hoofPitch = HC.lerp(airAngle, slopeAngle, leg.stanceBlend);
        // pitch terhadap sumbu lateral kuda (fz, 0, -fx) lalu diputar sesuai heading kuda
        this._hoofAxis.set(-sy, 0, -cy);
        this._qHoof.setFromAxisAngle(this._hoofAxis, hoofPitch);
        this._qYaw.setFromAxisAngle(UP_AXIS, this.yaw);
        this._qHoof.premultiply(this._qYaw);
        HC.setWorldQuat(leg.hoof, this._qHoof);
      }
    }
  }

  HC.HorseAnimator = HorseAnimator;
