/* Audit tiap NPC Sylvan di runtime SHOD: apakah animate() benar-benar gerak,
   apakah ada error yang sekarang ditelan HC.animateNPC, dan state apa yang
   diperlukan supaya animasi hidup. */
window.__npcAudit = function (frames = 30) {
  const out = [];
  for (const role of HC.NPC_ROLES) {
    const ent = HC.SD_NPC_MODELS[role.id];
    const rec = { id: role.id, hasModel: !!ent, hasAnimate: !!(ent && ent.animate) };
    if (!ent || !ent.animate) { out.push(rec); continue; }
    let root;
    try { root = HC.buildNPC(role, 'stand'); } catch (e) {
      rec.buildError = String(e); out.push(rec); continue;
    }
    const st = root.userData.npc;
    rec.posIsVector = !!(st.pos && st.pos.isVector3);
    const p = st.parts || {};
    // simpan referensi bagian yang seharusnya bergerak
    const tracked = [];
    const add = (name, o) => { if (o && o.isObject3D) tracked.push({ name, o }); };
    add('body', p.body); add('head', p.head);
    (p.legs || []).forEach((l, i) => add('leg' + i, l));
    (p.shins || []).forEach((l, i) => add('shin' + i, l));
    (p.arms || []).forEach((l, i) => add('arm' + i, l));
    rec.parts = tracked.map(t => t.name);
    const snap = () => tracked.map(t => [t.o.rotation.x, t.o.rotation.z, t.o.position.y]);
    const scenario = (name, prep) => {
      const errs = [];
      try { prep(st); } catch (e) { errs.push('prep:' + e.message); }
      const before = snap();
      let maxDelta = 0;
      for (let i = 0; i < frames; i++) {
        try { ent.animate(st, 1 / 60); }
        catch (e) { if (errs.length < 3) errs.push(`${name}:${e.message}`); break; }
        if (i % 5 === 4) {
          const now = snap();
          now.forEach((v, j) => {
            const b = before[j];
            for (let k = 0; k < 3; k++) {
              if (!Number.isFinite(v[k])) { if (errs.length < 3) errs.push(`${name}:NaN ${tracked[j].name}`); continue; }
              maxDelta = Math.max(maxDelta, Math.abs(v[k] - b[k]));
            }
          });
        }
      }
      return { motion: +maxDelta.toFixed(4), errs };
    };
    rec.idle = scenario('idle', (s) => { s.vel.x = 0; s.vel.z = 0; s.walking = false; });
    rec.walk = scenario('walk', (s) => { s.vel.x = 1.6; s.vel.z = 0.4; s.walking = true; });
    rec.work = scenario('work', (s) => {
      s.vel.x = 0; s.vel.z = 0; s.walking = false; s.working = true;
      s.farmT = 1; s.farmTask = { action: 'harvest' }; s.mineT = 1; s.forageT = 1;
    });
    rec.swing = scenario('swing', (s) => { s.swing = 0.001; });
    // mesh dipindah animate? beberapa model menulis mesh.position.y = pos.y + ...
    rec.meshY = root.children[0] && root.children[0].children[0] ? +root.children[0].children[0].position.y.toFixed(3) : null;
    out.push(rec);
  }
  return out;
};
