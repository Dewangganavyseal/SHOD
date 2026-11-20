import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const HC = (window.HC = {});
HC.THREE = THREE;
HC.OrbitControls = OrbitControls;

HC.vs = 0.0625;                 // 1 voxel unit = 6.25cm
HC.cartScale = 1.2;             // gerobak 20% lebih kecil dari build 1.5x sebelumnya
HC.cartVS = HC.vs * HC.cartScale;

/* Panjang batang tarik (thill) dalam voxel, dihitung dari pusat gerobak.
   Dipakai bareng oleh geometri batang (cart.js), titik ujung batang di fisika
   (physics.js) dan panjang batang di main.js — jangan pernah hard-code 75.5 lagi. */
HC.shaftTipVox = 64;
HC.shaftHingeY = 8.0;           // tinggi engsel batang di bak (voxel)
HC.shaftTipY = 23.0;            // tinggi ujung batang = kalung bahu kuda (voxel)
HC.collarLead = 0.62;           // kalung kuda ada 0.62 m di depan pusat kuda

/* Jarak kuda -> pusat gerobak dipatok dari geometri batang, bukan angka kira-kira:
   ujung batang harus mendarat tepat di kalung kuda. */
HC.hitchDist = HC.shaftTipVox * HC.cartVS - HC.collarLead;

HC.cartBaseMass = 300 * HC.cartScale;
HC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
HC.lerp = (a, b, t) => a + (b - a) * t;
HC.smooth = (t) => t * t * (3 - 2 * t);
HC.damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
HC.DOWN = new THREE.Vector3(0, -1, 0);
HC.UP = new THREE.Vector3(0, 1, 0);

HC.hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

HC.aimBone = function (mesh, fromW, toW) {
  const parent = mesh.parent;
  const a = parent.worldToLocal(fromW.clone());
  const b = parent.worldToLocal(toW.clone());
  const dir = b.sub(a);
  if (dir.lengthSq() < 1e-9) return;
  dir.normalize();
  mesh.quaternion.setFromUnitVectors(HC.DOWN, dir);
};

HC.setWorldQuat = function (obj, qWorld) {
  const pq = new THREE.Quaternion();
  obj.parent.getWorldQuaternion(pq);
  pq.invert();
  obj.quaternion.copy(pq.multiply(qWorld.clone()));
};

HC.worldQuatFromUp = function (normal, extraYaw = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(HC.UP, normal.clone().normalize());
  if (extraYaw) q.multiply(new THREE.Quaternion().setFromAxisAngle(HC.UP, extraYaw));
  return q;
};
