/* Probe mandiri (tanpa state antar-call): tabrakan gerobak vs kuda.
   js(open('scripts/horse_brake_probe.js').read())  -> definisi
   js("window.__hbRun(154, 6, 0)")                  -> setup di x=154, laju 6 m/s,
                                                       kuda berhenti seketika (brakeAt=0)
   Semua frame dijalankan dalam satu evaluasi supaya state nggak bisa "lari" ke tab lain. */
(() => {
  const R = window.RIG, ph = R.physics, w = R.world, A = R.animator;
  const rz = (x) => w.roadCenterZ(x);
  const HL = 1.02, HW = 0.44;

  window.__hbClear = function () {
    const q = ph.q, cap = R.cart.specs.capSpec;
    const fx = ((cap.bedFrontX ?? 24) - 2.0) * HC.cartVS;
    const fX = Math.cos(A.yaw), fZ = -Math.sin(A.yaw), lX = -fZ, lZ = fX;
    let worst = 9;
    for (const z of [-0.3, 0, 0.3]) {
      const rl = new HC.THREE.Vector3(fx, 0, z).applyQuaternion(q);
      const dx = ph.pos.x + rl.x - A.x, dz = ph.pos.z + rl.z - A.z;
      const of = HL - Math.abs(dx * fX + dz * fZ);
      const ol = HW - Math.abs(dx * lX + dz * lZ);
      worst = Math.min(worst, -Math.max(of, ol));   // negatif = masih di luar kuda
    }
    return worst;
  };

  window.__hbRun = function (X0 = 154, SPD = 6, BRAKE_AT = 0, FRAMES = 60, dt = 1 / 60) {
    window.__freeze = true;
    A.x = X0; A.z = rz(X0); A.yaw = 0;
    A.speed = 0; A.targetSpeed = 0; A.yawRate = 0; A.steer = 0; A.steerInput = 0;
    ph.reset(X0, rz(X0), 0);
    let x = X0;                       // kuda DIAM; gerobak datang dari belakang
    ph.vel.x = SPD;
    const out = { frames: [], maxPen: 0, minClear: 9, maxPitch: 0, maxPitchUp: 0, maxRoll: 0 };
    for (let k = 0; k < FRAMES; k++) {
      A.x = x; A.z = rz(x); A.yaw = 0;
      R.stepSim(dt);
      const pen = ph._horsePen || 0;
      const clear = window.__hbClear();
      out.maxPen = Math.max(out.maxPen, pen);
      out.minClear = Math.min(out.minClear, clear);
      out.maxPitch = Math.max(out.maxPitch, Math.abs(ph.pitch));
      out.maxPitchUp = Math.max(out.maxPitchUp, ph.pitch);
      out.maxRoll = Math.max(out.maxRoll, Math.abs(ph.roll));
      if (k % 10 === 0 || k === FRAMES - 1) out.frames.push({
        f: k, hx: +x.toFixed(2), cx: +ph.pos.x.toFixed(2), pitch: +ph.pitch.toFixed(3),
        roll: +ph.roll.toFixed(3), pen: +pen.toFixed(3), clear: +clear.toFixed(3),
        cvx: +ph.vel.x.toFixed(2), cy: +R.cart.root.position.y.toFixed(2)
      });
    }
    out.maxPen = +out.maxPen.toFixed(3);
    out.minClear = +out.minClear.toFixed(3);
    out.maxPitch = +out.maxPitch.toFixed(3);
    out.maxPitchUp = +out.maxPitchUp.toFixed(3);
    out.maxRoll = +out.maxRoll.toFixed(3);
    out.flipped = ph.flipped;
    out.finalVel = +ph.vel.x.toFixed(2);
    out.finalCX = +ph.pos.x.toFixed(2);
    out.horseX = +A.x.toFixed(2);
    return out;
  };
  return 'hb2 ready';
})()
