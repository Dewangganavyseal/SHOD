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
js/mobs.js            kelinci & babi hutan, AI tempur tenang (amati/tangkis/postur), VFX & bar HP 3D
js/survival.js        HP/stamina/lapar/haus + aturan makan & minum
js/touch_controls.js  analog kiri + tombol aksi kanan, overlay portrait
js/ui.js, js/upgrades.js, js/voxel.js, js/hc.js
js/sylvan/            model Sylvan Dominion (vendored) + shim
vendor/               three.js + OrbitControls
tests/                node --test (lihat bagian "Tes")
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
node --test tests/*.test.mjs tests/*.test.js
```

13 tes lama: determinisme peta, batas tanjakan Lv1, roster NPC di situsnya, perilaku NPC,
pose duduk (bukan rebah), jubah/efek Sylvan nempel ke scene, rekrut tidak geser posisi.
Plus `tests/combat-calm.test.mjs`: aturan guard/tangkis/postur (murni angka, jalan headless).

Catatan: `survival.test.js` berakhiran `.js`, jadi perintah lama `tests/*.test.mjs`
melewatkannya — glob di atas sekarang ikut menjalankannya.

## Tempur NPC (tenang, bukan grusa-grusu)

Warga dan regu tidak menyerbu boar. Tempurnya berirama:

- **Amati** — berdiri dengan kaki menapak sambil membaca telegraph boar, lalu satu
  langkah melingkar pendek, lalu amati lagi. Menyerang hanya kalau boar benar-benar
  terbuka (`attack_recover`, `charge_skid`, `hitstun`, `stagger`) atau setelah jeda
  amati selesai.
- **Jawab serangan** — tiap kali boar mulai windup, warga memilih: **menahan** atau
  **menggeser**. Peluangnya per arketipe (`parry` di `ROLE_PROFILES`: Royal Guard 0,90,
  Stone Giant 0,82, Guard 0,80 … Mage Support 0,24).
- **Tangkis (deflect)** — serangan yang mendarat saat warga menahan punya peluang
  ditangkis: nol damage, kilau `spawnDeflectSpark` + "TANGKIS!", hit-stop singkat, dan
  postur boar naik 0,34. Tiga tangkisan = postur penuh = boar **stagger** ("CELAH!"),
  dan warga dapat jendela balas (damage ×1,45).
- **Tahan gagal / guard pecah** — damage dipotong 72%, postur warga naik, dan kalau
  posturnya penuh guard-nya pecah: warga terbuka ±0,9 s ("GUARD PECAH!").
- **Bar kecil di atas kepala** — HP + lajur postur tipis di bawahnya, hanya terlihat
  saat bertarung; boar memakai warna merah, warga hijau.

## Animasi jalan tiap NPC (sumber: Sylvan Dominion)

Semua 18 model di `js/sylvan/` adalah salinan apa adanya dari
`SylvanDominion/js/entities/npc_*.js`, jadi siklus langkahnya memang animasi Sylvan,
bukan voxel buatan SHOD. Kontraknya sama untuk semua: `animate(n, dt)` membaca
`n.vel`, `n.walking`, `n.speed`, `n.swing`, `n.farmT`/`n.mineT`/`n.forageT`, dan
`n.mesh.rotation.y` — semuanya diisi `updateWildNPC`, `_updateMember`, dan AI tempur.

- **Ayunan sederhana** — warrior, merchant, dungeonmaster, guardian, petmerchant,
  lich, goblin, rabbitwarrior, stonegiant, elfmage, magesupport, royalguard.
  `sp = |n.vel|`; kaki diayun `sin(t * 9)`, amplitudo `min(1, sp/2)`, lengan kanan
  mengayun kecuali saat `n.swing` (serangan) atau `n.cast`.
- **Gait teredam + oleng belok** — guard, hunter. `st.gait` dari vel yang dihaluskan,
  langkah 2-sendi (paha + lutut), badan bergoyang `sinP`, cape/tabard berkibar,
  dan oleng belok dari `st.turn` yang dihitung dari `n.mesh.rotation.y`.
- **Kerja + jalan** — farmer, miner, herbal. `move01` dari vel dan `n.walking`,
  siklus cangkul/tambang dari `n.farmT` / `n.mineT` / `n.forageT` + `n.swing`.
- **Mesin state sendiri** — lionknight: `isMoving = n.walking || |vel| > 0.15`,
  lalu memilih pose idle / jalan / kombo; rabbitwarrior memilih idle/walk/run dari
  ambang 0,4 dan 3,0 m/s; lich dan goblin menggerakkan tulangnya per-pose.

Tiga hal yang dulu membuat langkah itu tak terlihat di SHOD, sekarang sudah dijembatani:

1. **Yaw model.** Di Sylvan `n.mesh` adalah entitasnya (yang diputar `n.mesh.rotation.y`),
   di SHOD yang diputar `root`. `HC.animateNPC` meminjamkan yaw root — dihaluskan
   7 Hz seperti `angLerp` Sylvan — ke `mesh.rotation.y` selama `animate()`, lalu
   mengembalikannya, supaya oleng belok, cape, dan pandangan kepala hidup tanpa
   dobel putar.
2. **Vel yang mengalir.** Model membaca `n.vel` mentah, sementara AI SHOD menulisnya
   instan. Kini `st.vel` dihaluskan (`1 - exp(-10·dt)`) selama `animate()` lalu
   dipulihkan, jadi ayunan kaki menggelinding masuk/keluar seperti di Sylvan.
3. **LOD tidak membekukan warga yang berjalan** dalam radius `npcLodNear × 2,2`
   (`updateNpcLod`). Pose hasil bake memang membeku — itu yang membuat warga
   tampak "meluncur" tanpa kaki di kualitas Kentang/Menengah.

## Dunia, sungai, desa & rintangan

Peta sekarang **300 x 300 m** (dulu 150 x 150, luas 4x) dengan chunk 15 m
(`TERRAIN_SIZE = 300`, `CHUNK_GRID = 20`) supaya culling frustum tetap membuang
sebagian besar peta dari tiap frame.

- **Sungai + tiga ford.** Alur berkelok memotong lembah ke arah X
  (`riverCenterZ(x)`), dasarnya digali ke -1,05 m, permukaan air -0,22 m. Di tiga
  ford — jalur utama (x -5,4), jalur timur (x 24), jalur barat (x -34) — dasarnya
  naik ke -0,30 m sehingga kuda bisa menyeberang; di luar ford arusnya dalam.
- **Tantangan bebatuan.** Enam batu besar berpasangan membentuk tiga gerbang
  sempit (z -38, -45, -52) plus onggokan di bahu jalur. Semuanya memakai collider
  mesh batu, jadi bisa dilewati lewat celah atau dilompati.
- **Desa kecil.** Lima rumah batu-kayu beratap limas, sumur desa, dan dua obor
  di tepi jalan (z 58-82). Tanah di dataran desa diratakan di `getTerrainHeight`
  supaya rumah tidak melayang di lereng.

## Melompat dengan momentum

`animator.js` mencatat kecepatan saat kaki lepas tanah (`jumpTakeoff`), lalu:

- **Momentum vertikal & dorongan depan.** Lompat sambil lari menambah tinggi
  (+26% dari `runBlend`, +0,10 m kalau kecepatan lepas tanah > 0,5 m/s) dan
  memberi impuls depan yang menggerus habis sampai mendarat — lompatan jadi
  melesat ke arah hadap, bukan naik-turun di tempat.
- **Tidak mengerem di udara.** Selama `jumpActive`, kecepatan tidak boleh turun
  di bawah kecepatan lepas tanah, jadi lompatan panjang tetap panjang.
- **Pagar & api unggun bisa dilewati.** Collider pagar (`addCapsuleCollider`,
  kapsul per segmen) turun dari +1,05 m ke +0,74 m — puncak palang aslinya — dan
  collider api unggun sekarang diukur dari mesh batu/kayunya sendiri
  (keliling lingkaran batu + tinggi puncaknya), bukan angka 1,2 m. Keduanya tetap
  menahan kuda yang berjalan, tapi bisa dilompati.

## Yang terakhir diubah

- Dunia diperluas 4x (300 x 300 m), ditambah sungai ber-ford, tantangan bebatuan,
  dan desa kecil.
- Lompat membawa momentum: makin cepat lepas tanah, makin jauh & tinggi, dan
  selalu melaju ke arah depan.
- Collider pagar & api unggun mengikuti bentuk mesh-nya sehingga bisa dilompati.
- Animasi jalan Sylvan dipasang utuh: yaw + vel kini dihaluskan untuk `animate()`
  (lihat bagian di atas), dan LOD tidak lagi membekukan warga yang sedang melangkah.
- Tempur NPC dibuat tenang: jeda mengamati, langkah melingkar pendek, geser menghindar
  setengah kecepatan lama, dan jeda serang 1,5× lebih panjang.
- Ditambah tangkisan ala Sekiro: guard, deflect, postur warga & boar, state `stagger`,
  dan bar postur tipis di bar HP 3D.
- Telegraph boar dilonggarkan: windup tusk 0,42 -> 0,55 s, recover 0,55 -> 0,70 s,
  jeda serang 1,55 -> 2,0 s, jeda charge 4,6 -> 5,2 s.

- Pohon semua spesies dinaikkan ~48% (sekarang sekitar 6-12 m).
- Tegakan dibuat campuran: pohon daun mayoritas, cemara jadi aksen
  (cap pool per spesies, fallback antar-template sekaligus biar cap tidak memangkas jumlah).
- Rumput diberi gradasi: petak gundul / pendek / sedang / rumpun tinggi, pakai value-noise
  spasial 7 m + variasi per bilah, bukan tinggi acak per bilah.
- Atmosfer dihangatkan: horizon krem-hangat, fog `0xe3d8c2` density 0.0044,
  key light hangat + fill dingin.
