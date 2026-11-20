import { HC } from './hc.js';
const THREE = HC.THREE;


const FACE_DIRS = [
  { d: [1, 0, 0], shade: 0.90, v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], n: [1,0,0] },
  { d: [-1, 0, 0], shade: 0.84, v: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], n: [-1,0,0] },
  { d: [0, 1, 0], shade: 1.00, v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], n: [0,1,0] },
  { d: [0, -1, 0], shade: 0.68, v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], n: [0,-1,0] },
  { d: [0, 0, 1], shade: 0.95, v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], n: [0,0,1] },
  { d: [0, 0, -1], shade: 0.80, v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], n: [0,0,-1] }
];

window.HC.VOXEL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 });

class VoxelBuilder {
  constructor(voxelSize = window.HC.vs) {
    this.vs = voxelSize;
    this.map = new Map();
  }
  key(x, y, z) { return `${x},${y},${z}`; }
  set(x, y, z, hex, jitter = 0.045) {
    const ix = Math.round(x), iy = Math.round(y), iz = Math.round(z);
    const h = window.HC.hash(ix * 73.1 + iy * 151.7 + iz * 293.3);
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, (h - 0.5) * jitter * 2);
    this.map.set(this.key(ix, iy, iz), { x: ix, y: iy, z: iz, c });
    return this;
  }
  del(x, y, z) {
    this.map.delete(this.key(Math.round(x), Math.round(y), Math.round(z)));
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, hex, jitter = 0.045) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          this.set(x, y, z, hex, jitter);
    return this;
  }
  cutBox(x0, y0, z0, x1, y1, z1) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          this.del(x, y, z);
    return this;
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, hex, jitter = 0.045) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    const z0 = Math.floor(cz - rz), z1 = Math.ceil(cz + rz);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1.0) this.set(x, y, z, hex, jitter);
        }
    return this;
  }
  cylX(x0, x1, cy, cz, r, hex, rIn = 0, jitter = 0.04) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const R = Math.ceil(r);
    for (let x = ax; x <= bx; x++)
      for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
        for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) {
          const d2 = (y - cy) ** 2 + (z - cz) ** 2;
          if (d2 <= r * r && d2 >= rIn * rIn) this.set(x, y, z, hex, jitter);
        }
    return this;
  }
  cylY(cx, cz, y0, y1, r, hex, rIn = 0, jitter = 0.04) {
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const R = Math.ceil(r);
    for (let y = ay; y <= by; y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++)
        for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) {
          const d2 = (x - cx) ** 2 + (z - cz) ** 2;
          if (d2 <= r * r && d2 >= rIn * rIn) this.set(x, y, z, hex, jitter);
        }
    return this;
  }
  cylZ(z0, z1, cx, cy, r, hex, rIn = 0, jitter = 0.04) {
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    const R = Math.ceil(r);
    for (let z = az; z <= bz; z++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++)
        for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
          const d2 = (x - cx) ** 2 + (y - cy) ** 2;
          if (d2 <= r * r && d2 >= rIn * rIn) this.set(x, y, z, hex, jitter);
        }
    return this;
  }
  line(x0, y0, z0, x1, y1, z1, r, hex, jitter = 0.035) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 1.8));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const z = z0 + (z1 - z0) * t;
      if (r <= 0.6) this.set(x, y, z, hex, jitter);
      else this.ellipsoid(x, y, z, r, r, r, hex, jitter);
    }
    return this;
  }
  build(pivotX = 0, pivotY = 0, pivotZ = 0) {
    const pos = [], norm = [], col = [], idx = [];
    const vs = this.vs;
    let vCount = 0;
    for (const v of this.map.values()) {
      for (const f of FACE_DIRS) {
        const nx = v.x + f.d[0], ny = v.y + f.d[1], nz = v.z + f.d[2];
        if (this.map.has(this.key(nx, ny, nz))) continue;
        for (let i = 0; i < 4; i++) {
          const fv = f.v[i];
          const vx = (v.x + fv[0] - 0.5 - pivotX) * vs;
          const vy = (v.y + fv[1] - 0.5 - pivotY) * vs;
          const vz = (v.z + fv[2] - 0.5 - pivotZ) * vs;
          pos.push(vx, vy, vz);
          norm.push(f.n[0], f.n[1], f.n[2]);
          // Subtle corner AO check for crisp Minecraft block depth
          const sx = fv[0] ? 1 : -1, sy = fv[1] ? 1 : -1, sz = fv[2] ? 1 : -1;
          let occ = 0;
          if (f.d[0] === 0 && this.map.has(this.key(nx + sx, ny, nz))) occ++;
          if (f.d[1] === 0 && this.map.has(this.key(nx, ny + sy, nz))) occ++;
          if (f.d[2] === 0 && this.map.has(this.key(nx, ny, nz + sz))) occ++;
          const ao = 1.0 - occ * 0.085;
          const s = f.shade * ao;
          col.push(v.c.r * s, v.c.g * s, v.c.b * s);
        }
        idx.push(vCount, vCount + 1, vCount + 2, vCount, vCount + 2, vCount + 3);
        vCount += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, window.HC.VOXEL_MAT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

window.HC.VoxelBuilder = VoxelBuilder;
window.HC.PAL = {
  coatDark: 0x563219,
  coatMid:  0x764723,
  coatWarm: 0x8d562c,
  coatLite: 0xa5693a,
  belly:    0x643b1d,
  muzzle:   0x382315,
  nostril:  0x1c110b,
  blaze:    0xefe8dc,
  sock:     0xe8dfd0,
  hoof:     0x1f1c19,
  hoofShoe: 0x6f757d,
  mane:     0x1c1410,
  maneHi:   0x2d2019,
  eyeWhite: 0xf4f1ea,
  eyePupil: 0x120d0a,
  leather:  0x3b2313,
  leather2: 0x59341c,
  padCloth: 0x8c2721,
  padTrim:  0xd9a73c,
  brass:    0xd8a938,
  iron:     0x454a52,
  ironDark: 0x2b2f35,
  oakDark:  0x5a3a1e,
  oakMid:   0x7a512b,
  oakLite:  0x966739,
  oakPlank: 0x895c32,
  canvas:   0xd8cdb8,
  canvas2:  0xc2b49a,
  sack:     0xbca379,
  sackTie:  0x6e5332,
  rope:     0xc29e63,
  gold:     0xe6b43c,
  lantern:  0xffcc4d,
  pebble1:  0x8b8e94,
  pebble2:  0x70747a,
  pebble3:  0x9fa3a9,
  rockDark: 0x5c6066
};
