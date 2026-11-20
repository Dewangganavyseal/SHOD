# SHOD / kraken_cart — gerobak kuda voxel (three.js)

Build kerjaan Zwei. Horse + supply cart voxel, medan analitik, hutan cozy yang di-port
dari `hutan_cozy_interaktif_3d.html`, NPC squad Sylvan, survival kuda, dan kontroler mobile.

## Cara jalanin (paling cepat)

Butuh server HTTP statis karena pakai ES module — buka `index.html` langsung dari
`file://` bakal gagal.

```bash
cd kraken_cart
python3 -m http.server 8801 --bind 0.0.0.0
# buka http://localhost:8801/index.html
```

Kalau ada GPU nyata, tambah `?hq=1` biar rumput/hutan pakai setelan penuh:

```
http://localhost:8801/index.html?hq=1
```

Tanpa `?hq=1`, di mesin tanpa GPU (software GL / SwiftShader) rumput otomatis
ditipiskan supaya tab tidak crash. Itu konsesi sandbox, bukan versi final.

## Kontrol

- **Desktop:** W/S atau panah atas-bawah = lari/mundur, A/D atau panah kiri-kanan = belok,
  Spasi = lompat, Shift = lari cepat. Tombol panel kanan buat makan/minum.
- **Mobile (wajib landscape):** analog di **kiri**, tombol `LARI` (toggle) / `LOMPAT` /
  `MAKAN` / `MINUM` di **kanan**. Lepas analog = kuda berhenti walau toggle LARI nyala.

## Kualitas grafis (HP kentang)

Kualitas dipilih otomatis dari jumlah core RAM perangkat sebelum `World` dibuat,
bisa dipaksa lewat URL, dan bisa diganti langsung dari HUD:

```
http://localhost:8801/index.html?quality=potato
http://localhost:8811/index.html?quality=medium
http://localhost:8801/index.html?quality=high
```

Prioritas: `?quality=` > pilihan tersimpan di `localStorage` > deteksi perangkat.
- **🥔 Kentang:** bayangan mati, antialias mati, pixel ratio 0.75, rumput 30%, cull 30 m.
- **📱 Menengah:** bayangan statis (digambar ulang tiap 5 frame), pixel ratio 1.25, rumput 62%.
- **🖥️ Ultra:** semua detail, NPC utuh, bayangan penuh.

Optimasi terbesar adalah **LOD warga**: 18 NPC = 1.163 mesh (1.154 terlihat) dulu
menjadi 1-2 mesh statis saat jauh. Hasil uji browser: mesh NPC terlihat 1.154 → 21,
total scene 2.059 → 926, dan render probe 1.135 → 394 draw call. Warga yang dekat
(radius `npcLodNear`) tetap memakai model penuh yang beranimasi; yang jauh memakai
hasil bake yang posenya membeku — nggak kelihatan dari jarak segitu.

Pilihanmu disimpan, jadi HP yang sudah pernah digeser ke "Menengah" nggak balik
ke Kentang tiap reload. Hapus dengan `localStorage.removeItem('shod.quality')`.

## Struktur


```
index.html            entry point + HUD
css/style.css         HUD, panel upgrade, tombol mobile
js/main.js            loop render, langit (sky dome shader), fog, window.RIG
js/perf.js            preset kualitas (potato/medium/high), deteksi perangkat, LOD bake NPC
js/world.js           medan analitik, jalan, sungai/ford, rumput, situs NPC
js/map.js             peta tetap: sites, npcGroups, boulders, ramps, hashRand deterministik
js/blade_grass.js     rumput instanced per chunk + trample + gradasi tinggi
js/forest_decor.js    pohon/semak/batu instanced (spesies campuran, culling frustum)
js/forest_assets.js   HASIL GENERATE dari hutan_cozy_interaktif_3d.html — jangan edit manual
js/physics.js         rigid body gerobak, roda, thills, kargo, HP roda
js/cart.js            mesh gerobak (voxel builder), roda, bangku penumpang
js/horse.js           mesh kuda voxel
js/animator.js        gait kuda, IK kaki, lompat
js/npc.js             roster NPC Sylvan, wild NPC, squad duduk di bangku
js/survival.js        HP/stamina/lapar/haus + aturan makan & minum
js/touch_controls.js  analog kiri + tombol aksi kanan, overlay portrait
js/ui.js, js/upgrades.js, js/voxel.js, js/hc.js
js/sylvan/            model Sylvan Dominion (vendored) + shim
vendor/               three.js + OrbitControls
tests/                node --test (13 tes)
scripts/              probe browser + generator aset hutan
reference/            sumber HTML hutan yang dipakai generator (lihat bawah)
```

## Regenerate aset hutan

`js/forest_assets.js` **jangan** diedit tangan. Alurnya:

```bash
# sumber yang dipakai script (path-nya hardcoded di script):
#   /data/workspace/hutan/index.html
#   /data/workspace/hutan/hutan_pine_v2.html
python3 scripts/extract_forest.py          # -> scripts/forest_extract.json
python3 scripts/assemble_forest_assets.py  # -> js/forest_assets.js
```

Kalau path-nya beda di mesin lain, ubah dua baris `pathlib.Path(...)` di
`scripts/extract_forest.py` ke file di folder `reference/`.

## Tes

```bash
node --test tests/*.test.mjs
```

13 tes: determinisme peta, batas tanjakan Lv1, roster NPC di situsnya, perilaku NPC,
pose duduk (bukan rebah), jubah/efek Sylvan nempel ke scene, rekrut tidak geser posisi.

## Yang terakhir diubah

- Pohon semua spesies dinaikkan ~48% (sekarang sekitar 6-12 m).
- Tegakan dibuat campuran: pohon daun mayoritas, cemara jadi aksen
  (cap pool per spesies, fallback antar-template sekaligus biar cap tidak memangkas jumlah).
- Rumput diberi gradasi: petak gundul / pendek / sedang / rumpun tinggi, pakai value-noise
  spasial 7 m + variasi per bilah, bukan tinggi acak per bilah.
- Atmosfer dihangatkan: horizon krem-hangat, fog `0xe3d8c2` density 0.0044,
  key light hangat + fill dingin.
