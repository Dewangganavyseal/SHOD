/* Probe: pemakaian HP roda saat nyetir normal (autopilot ngikutin jalan).
   js(open('scripts/wheel_hp_probe.js').read()) -> definisi
   __hpSetup(x0)  lalu  __hpStep(n)  berulang; __hpReport() di akhir.
   Mencatat: HP per roda, puncak _imp/_lat/_dmg per roda, jarak tempuh. */
(() => {
  const R = window.RIG;
  window.__freeze = true;
  window.__hp = { log: [], x0: 0, frames: 0, peak: {}, dist: 0 };

  window.__hpSetup = function (x0 = 0) {
    const A = R.animator, ph = R.physics, rz = (x) => R.world.roadCenterZ(x);
    A.x = x0; A.z = rz(x0); A.yaw = 0; A.speed = 0; A.targetSpeed = 0; A.steerInput = 0;
    A.state = 'run'; A.prevMoveState = 'run';
    ph.reset(x0, rz(x0), 0);
    ph.resetWheels();
    window.__hp = { log: [], x0, frames: 0, peak: {}, dist: 0 };
    for (const w of ph.wheels) { window.__hp.peak[w.ref ? (w.ref.name || w.ref.front ? 'front' : 'rear') : 'w'] = 0; }
    return { x0, hp: ph.wheels.map(w => +w.hp.toFixed(1)) };
  };

  window.__hpStep = function (n) {
    const A = R.animator, ph = R.physics, W = R.world, H = window.__hp;
    const dt = 1 / 60;
    for (let k = 0; k < n; k++) {
      // autopilot: arahkan kuda ke titik 9 m di depan pada garis tengah jalan
      const tx = A.x + 9;
      const want = Math.atan2(-(W.roadCenterZ(tx) - A.z), 9);
      const d = Math.atan2(Math.sin(want - A.yaw), Math.cos(want - A.yaw));
      A.steerInput = Math.max(-1, Math.min(1, d * 3.0));
      const px = A.x, pz = A.z;
      R.stepSim(dt);
      H.frames++;
      H.dist += Math.hypot(A.x - px, A.z - pz);
      for (const w of ph.wheels) {
        const imp = w._lastImp || 0, lat = w._lastLat || 0, dmg = w._lastDmg || 0;
        const id = w.wa.x > 0 ? (w.wa.z > 0 ? 'FL' : 'FR') : (w.wa.z > 0 ? 'RL' : 'RR');
        const p = H.peak[id] || (H.peak[id] = { imp: 0, lat: 0, dmg: 0, dmgSum: 0 });
        p.imp = Math.max(p.imp, imp); p.lat = Math.max(p.lat, lat);
        p.dmg = Math.max(p.dmg, dmg); p.dmgSum += dmg;
      }
      if (H.frames % 60 === 0) H.log.push({ f: H.frames, x: +A.x.toFixed(0), speed: +A.speed.toFixed(2),
        hp: ph.wheels.map(w => +w.hp.toFixed(1)), dist: +H.dist.toFixed(0) });
    }
    return { frames: H.frames, x: +R.animator.x.toFixed(0), speed: +R.animator.speed.toFixed(2),
      offRoad: +(R.animator.z - R.world.roadCenterZ(R.animator.x)).toFixed(2),
      hp: ph.wheels.map(w => +w.hp.toFixed(1)), dist: +H.dist.toFixed(0) };
  };

  window.__hpReport = function () {
    const H = window.__hp, ph = R.physics;
    const refLoad = 1.7 * (ph.mass * 9.81) / 4;
    return { frames: H.frames, dist: +H.dist.toFixed(0), log: H.log, peak: H.peak,
      refLoad: +refLoad.toFixed(0), mass: +ph.mass.toFixed(0), rigid: !!ph.susRigid,
      threshImp: 2.35, threshLat: +(refLoad * 1.55).toFixed(0),
      hp: ph.wheels.map(w => +w.hp.toFixed(1)) };
  };
  return 'hp probe ready';
})()
