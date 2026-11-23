// Kamera workshop: orbit mengunci gerobak, lalu kontrol lama dipulihkan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(baseDir, '../js/main.js'), 'utf8');
const cameraFn = src.slice(src.indexOf('function computeWorkshopCamera'), src.indexOf('function openWorkshop'));
const openFn = src.slice(src.indexOf('function openWorkshop'), src.indexOf('function closeWorkshop'));
const closeFn = src.slice(src.indexOf('function closeWorkshop'), src.indexOf('ui = initUpgradeUI'));

test('pivot orbit workshop tepat di gerobak, bukan di kuda', () => {
  assert.match(cameraFn, /_wsCamGoalTarget\.set\(cx, cy \+ 0\.55, cz\)/);
  assert.doesNotMatch(cameraFn, /animator\.x/, 'pivot masih mengikuti kuda');
  assert.doesNotMatch(cameraFn, /animator\.z/, 'pivot masih mengikuti kuda');
});

test('workshop menonaktifkan pan dan menyimpan kontrol lama', () => {
  assert.match(openFn, /_wsSavedCtl\.enablePan = controls\.enablePan/);
  assert.match(openFn, /_wsSavedCtl\.minDistance = controls\.minDistance/);
  assert.match(openFn, /_wsSavedCtl\.maxDistance = controls\.maxDistance/);
  assert.match(openFn, /controls\.enablePan = false/);
});

test('keluar workshop memulihkan pan/zoom/jarak dan membuang momentum orbit', () => {
  assert.match(closeFn, /controls\.enablePan = _wsSavedCtl\.enablePan/);
  assert.match(closeFn, /controls\.enableZoom = _wsSavedCtl\.enableZoom/);
  assert.match(closeFn, /controls\.minDistance = _wsSavedCtl\.minDistance/);
  assert.match(closeFn, /controls\.maxDistance = _wsSavedCtl\.maxDistance/);
  assert.match(closeFn, /controls\.target\.copy\(_wsSavedTarget\)/);
  assert.match(closeFn, /camera\.position\.copy\(_wsSavedCamPos\)/);
  assert.match(closeFn, /controls\.enableDamping = false/);
  assert.match(closeFn, /controls\.enableDamping = damp/);
});
