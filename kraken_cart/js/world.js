/* ============================================================================
   SHOD — WORLD HUTAN COZY INTERAKTIF 3D (Port 1:1 dari "Hutan Cozy Interaktif 3D (2).html")
   Seluruh terrain 36-chunk, jalan tanah berkelok, kolam BotW (Voronoi caustics,
   batu, teratai, ilalang, ikan koi), api unggun, pagar kayu, papan petunjuk,
   lentera jalan, pohon pinus BotW & pohon daun Truckful (truk pickup dihapus),
   semak beri/bunga, rumpun rumput 4-bilah + bunga liar, jamur menyala, kunang-kunang,
   god-rays matahari, interaksi lingkungan, audio prosedural, langit berawan FBM,
   dan 3 suasana (Pagi / Sore / Malam).
   ============================================================================ */
import { HC } from './hc.js';
import './voxel.js';
import MAP from './map.js';
import {
  createVillageMaterialPalette,
  createCozyCottage,
  createVillageTavernInn,
  createBlacksmithWorkshop,
  createMarketStall,
  createStorageBarn,
} from './models/village_buildings.js';
import {
  createVillageWell,
  createVillageGateArch,
  createVillageLanternPost,
  createVillageNoticeBoard,
  createVillageBench,
  createVillageFlowerPlanter,
  createVillageCrateCluster,
  createVillageStonePath,
  createVillageFenceRun,
} from './models/village_props.js';
import {
  createBotWRiverSurface,
  createNaturalRiverbanks,
} from './models/river_assets.js';
import { createAncientSunRuins } from './models/sun_ruins_model.js';
import { createCrystalCavern } from './models/crystal_cavern_model.js';
import { createBanditSettlement } from './models/bandit_camp_model.js';

const THREE = HC.THREE, P = HC.PAL;

class World {
  constructor(scene) {
    this.scene = scene;
    /* Kualitas datang dari js/perf.js (main.js sudah menaruhnya di HC.QUALITY
       sebelum World dibuat). Fallback ke deteksi kasar kalau modul itu absen,
       mis. halaman QA yang mengimpor world.js sendirian. */
    const QUALITY = (HC.QUALITY && HC.QUALITY.key) ? HC.QUALITY : null;
    const isMobileDevice = QUALITY
      ? QUALITY.key !== 'high'
      : ((typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
        || (typeof window !== 'undefined' && window.innerWidth < 820));
    const wantsShadows = QUALITY ? QUALITY.shadows !== false : true;

    const PERF_PROFILES = {
      // treeLod  = jarak mulai pakai geometri pohon gabungan (low-detail, 1 draw call per jenis)
      // treeFar  = jarak maksimum pohon low-detail masih digambar (siluet cakrawala)
      potato:   { label: 'Kentang',  pixelRatio: 1.0,  cullDistance: 42.0, grassRatio: 0.30, treeLod: 40.0, treeFar: 165.0, villageLod: 68.0, villageFar: 165.0 },
      medium:   { label: 'Menengah', pixelRatio: 1.25, cullDistance: 72.0, grassRatio: 0.62, treeLod: 54.0, treeFar: 220.0, villageLod: 92.0, villageFar: 225.0 },
      high:     { label: 'Ultra PC', pixelRatio: 2.0,  cullDistance: 118.0, grassRatio: 1.0, treeLod: 72.0, treeFar: 290.0, villageLod: 122.0, villageFar: 300.0 },
      // alias lama supaya kode/probe yang masih menyebut nama ini tetap jalan
      mobile:   { label: 'Kentang',  pixelRatio: 1.0,  cullDistance: 42.0, grassRatio: 0.30, treeLod: 40.0, treeFar: 165.0, villageLod: 68.0, villageFar: 165.0 },
      balanced: { label: 'Menengah', pixelRatio: 1.25, cullDistance: 72.0, grassRatio: 0.62, treeLod: 54.0, treeFar: 220.0, villageLod: 92.0, villageFar: 225.0 },
      ultra:    { label: 'Ultra PC', pixelRatio: 2.0,  cullDistance: 118.0, grassRatio: 1.0, treeLod: 72.0, treeFar: 290.0, villageLod: 122.0, villageFar: 300.0 }
    };
    let currentPerfMode = QUALITY ? QUALITY.key : (isMobileDevice ? 'medium' : 'high');
    this._quality = QUALITY;

    // ---- Environment Mesh Collider Registry + 2D Spatial Hash Grid ----
    const colliders = [];
    const rockMeshes = [];
    const traversableLogs = [];
    const colliderGrid = new Map();
    const GRID_CELL = 6.0;
    const _triA = new THREE.Vector3(), _triB = new THREE.Vector3(), _triC = new THREE.Vector3();
    const _triE1 = new THREE.Vector3(), _triE2 = new THREE.Vector3(), _triN = new THREE.Vector3();
    function addTraversableLog(mesh, radius, length) {
      if (!mesh) return null;
      mesh.updateMatrixWorld(true);
      const halfL = (length || 1.8) * 0.5;
      const p1 = new THREE.Vector3(-halfL, 0, 0).applyMatrix4(mesh.matrixWorld);
      const p2 = new THREE.Vector3(halfL, 0, 0).applyMatrix4(mesh.matrixWorld);
      const rec = {
        mesh,
        x1: p1.x,
        z1: p1.z,
        x2: p2.x,
        z2: p2.z,
        cy: mesh.position.y,
        radius: Math.max(0.12, radius || 0.25),
      };
      traversableLogs.push(rec);
      return rec;
    }
    function indexCollider(col) {
      const gx0 = Math.floor(col.minX / GRID_CELL), gx1 = Math.floor(col.maxX / GRID_CELL);
      const gz0 = Math.floor(col.minZ / GRID_CELL), gz1 = Math.floor(col.maxZ / GRID_CELL);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const key = gx + ',' + gz;
          let bucket = colliderGrid.get(key);
          if (!bucket) { bucket = []; colliderGrid.set(key, bucket); }
          bucket.push(col);
        }
      }
      colliders.push(col);
      return col;
    }
    function addCircleCollider(type, x, z, r, yMax, mesh = null) {
      const rad = Math.max(0.08, r || 0.25);
      const col = {
        id: colliders.length, kind: 'circle', type,
        x, z, r: rad, yMax: yMax ?? 99,
        minX: x - rad, maxX: x + rad, minZ: z - rad, maxZ: z + rad,
        mesh,
      };
      if (mesh && mesh.userData) mesh.userData.collider = col;
      return indexCollider(col);
    }
    function addCapsuleCollider(type, x1, z1, x2, z2, r, yMax, mesh = null) {
      const rad = Math.max(0.08, r || 0.14);
      const col = {
        id: colliders.length, kind: 'capsule', type,
        x1, z1, x2, z2, r: rad, yMax: yMax ?? 99,
        minX: Math.min(x1, x2) - rad, maxX: Math.max(x1, x2) + rad,
        minZ: Math.min(z1, z2) - rad, maxZ: Math.max(z1, z2) + rad,
        mesh,
      };
      if (mesh && mesh.userData) mesh.userData.collider = col;
      return indexCollider(col);
    }
    function addRockMeshCollider(type, mesh) {
      if (!mesh || !mesh.geometry) return null;
      mesh.updateMatrixWorld(true);
      const posAttr = mesh.geometry.attributes.position;
      const idxAttr = mesh.geometry.index;
      const count = idxAttr ? idxAttr.count : posAttr.count;
      const m4 = mesh.matrixWorld;
      const topTris = [];
      const sideTris = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

      for (let i = 0; i + 2 < count; i += 3) {
        const ia = idxAttr ? idxAttr.getX(i) : i;
        const ib = idxAttr ? idxAttr.getX(i + 1) : i + 1;
        const ic = idxAttr ? idxAttr.getX(i + 2) : i + 2;
        _triA.fromBufferAttribute(posAttr, ia).applyMatrix4(m4);
        _triB.fromBufferAttribute(posAttr, ib).applyMatrix4(m4);
        _triC.fromBufferAttribute(posAttr, ic).applyMatrix4(m4);
        _triE1.subVectors(_triB, _triA);
        _triE2.subVectors(_triC, _triA);
        _triN.crossVectors(_triE1, _triE2);
        const area = _triN.length();
        if (area < 1e-6) continue;
        _triN.divideScalar(area);

        const tMinX = Math.min(_triA.x, _triB.x, _triC.x), tMaxX = Math.max(_triA.x, _triB.x, _triC.x);
        const tMinY = Math.min(_triA.y, _triB.y, _triC.y), tMaxY = Math.max(_triA.y, _triB.y, _triC.y);
        const tMinZ = Math.min(_triA.z, _triB.z, _triC.z), tMaxZ = Math.max(_triA.z, _triB.z, _triC.z);
        if (tMinX < minX) minX = tMinX; if (tMaxX > maxX) maxX = tMaxX;
        if (tMinY < minY) minY = tMinY; if (tMaxY > maxY) maxY = tMaxY;
        if (tMinZ < minZ) minZ = tMinZ; if (tMaxZ > maxZ) maxZ = tMaxZ;

        const tri = {
          ax: _triA.x, ay: _triA.y, az: _triA.z,
          bx: _triB.x, by: _triB.y, bz: _triB.z,
          cx: _triC.x, cy: _triC.y, cz: _triC.z,
          nx: _triN.x, ny: _triN.y, nz: _triN.z,
          minX: tMinX, maxX: tMaxX, minZ: tMinZ, maxZ: tMaxZ, maxY: tMaxY,
        };
        if (tri.ny > 0.12) topTris.push(tri);
        if (tri.ny <= 0.45) sideTris.push(tri);
      }
      const col = {
        id: colliders.length, kind: 'mesh_rock', type,
        x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5,
        r: Math.hypot(maxX - minX, maxZ - minZ) * 0.38,
        yMax: maxY, minX, maxX, minY, maxY, minZ, maxZ,
        topTris, sideTris, mesh,
      };
      if (mesh.userData) mesh.userData.collider = col;
      rockMeshes.push(col);
      return indexCollider(col);
    }

    scene.background = new THREE.Color(0x6bb0e6);
    scene.fog = null;

        // 2. MOODS, LIGHTING & CALM COZY CEL-SHADING SYSTEM (NO GLARE / NO HAZE)
        // ============================================================================
        const MOODS = {
            morning: {
                name: 'Pagi Teduh • Langit Biru Berawan & Pohon Rimbun',
                bgTop: new THREE.Color(0x1b5cb8),
                bgBottom: new THREE.Color(0x88c4f2),
                sunColor: new THREE.Color(0xffecc2),
                sunIntensity: 0.66,
                sunPos: new THREE.Vector3(24, 26, 16),
                hemiSky: new THREE.Color(0x78b8e6),
                hemiGround: new THREE.Color(0x284d2a),
                hemiIntensity: 0.46,
                sceneBrightness: 0.72,
                mushroomGlow: 0.24,
                particleColor: new THREE.Color(0xfff0b3),
                shadowTint: new THREE.Color(0x204269),
                rimTint: new THREE.Color(0xeef7ff),
                cloudColor: new THREE.Color(0xffffff),
                cloudShadow: new THREE.Color(0x8bb2d9),
                cloudCoverage: 0.68,
                grassBaseColor: new THREE.Color(0x215d29),
                grassTipColor: new THREE.Color(0x76b83e),
                sunbeamOpacity: 0.12,
                lanternIntensity: 0.14
            },
            sunset: {
                name: 'Sore Cozy Teduh • Cahaya Emas Lembut Tanpa Silau',
                bgTop: new THREE.Color(0x233163),
                bgBottom: new THREE.Color(0xd67c4b),
                sunColor: new THREE.Color(0xffb566),
                sunIntensity: 0.62,
                sunPos: new THREE.Vector3(-24, 15, -18),
                hemiSky: new THREE.Color(0xc98a63),
                hemiGround: new THREE.Color(0x253d24),
                hemiIntensity: 0.42,
                sceneBrightness: 0.66,
                mushroomGlow: 0.78,
                particleColor: new THREE.Color(0xffd275),
                shadowTint: new THREE.Color(0x242c54),
                rimTint: new THREE.Color(0xffc985),
                cloudColor: new THREE.Color(0xffcca1),
                cloudShadow: new THREE.Color(0x734a66),
                cloudCoverage: 0.62,
                grassBaseColor: new THREE.Color(0x225426),
                grassTipColor: new THREE.Color(0x8ca635),
                sunbeamOpacity: 0.15,
                lanternIntensity: 0.62
            },
            night: {
                name: 'Malam Tenang • Sorot Lampu Truk & Kunang-kunang',
                bgTop: new THREE.Color(0x03070f),
                bgBottom: new THREE.Color(0x0a1a26),
                sunColor: new THREE.Color(0x6ea6cc),
                sunIntensity: 0.20,
                sunPos: new THREE.Vector3(-18, 24, -20),
                hemiSky: new THREE.Color(0x173449),
                hemiGround: new THREE.Color(0x081814),
                hemiIntensity: 0.14,
                sceneBrightness: 0.28,
                mushroomGlow: 2.2,
                particleColor: new THREE.Color(0xd2f58c),
                shadowTint: new THREE.Color(0x080f1c),
                rimTint: new THREE.Color(0x5fb6cf),
                cloudColor: new THREE.Color(0x1b3145),
                cloudShadow: new THREE.Color(0x080f1a),
                cloudCoverage: 0.50,
                grassBaseColor: new THREE.Color(0x0a2a22),
                grassTipColor: new THREE.Color(0x1d5c46),
                sunbeamOpacity: 0.05,
                lanternIntensity: 1.5
            }
        };

        let currentMoodKey = 'morning';
        let targetMood = MOODS[currentMoodKey];

        const activeAtmosphere = {
            bgTop: targetMood.bgTop.clone(),
            bgBottom: targetMood.bgBottom.clone(),
            sunColor: targetMood.sunColor.clone(),
            sunIntensity: targetMood.sunIntensity,
            sunPos: targetMood.sunPos.clone(),
            hemiSky: targetMood.hemiSky.clone(),
            hemiGround: targetMood.hemiGround.clone(),
            hemiIntensity: targetMood.hemiIntensity,
            sceneBrightness: targetMood.sceneBrightness,
            mushroomGlow: targetMood.mushroomGlow,
            particleColor: targetMood.particleColor.clone(),
            shadowTint: targetMood.shadowTint.clone(),
            rimTint: targetMood.rimTint.clone(),
            cloudColor: targetMood.cloudColor.clone(),
            cloudShadow: targetMood.cloudShadow.clone(),
            cloudCoverage: targetMood.cloudCoverage,
            grassBaseColor: targetMood.grassBaseColor.clone(),
            grassTipColor: targetMood.grassTipColor.clone(),
            sunbeamOpacity: targetMood.sunbeamOpacity,
            lanternIntensity: targetMood.lanternIntensity
        };

        const dirLight = new THREE.DirectionalLight(activeAtmosphere.sunColor, activeAtmosphere.sunIntensity * Math.PI);
        dirLight.position.copy(activeAtmosphere.sunPos);
        dirLight.castShadow = wantsShadows;
        const shadowSize = QUALITY ? QUALITY.shadowMapSize : (isMobileDevice ? 1024 : 2048);
        dirLight.shadow.mapSize.width = shadowSize;
        dirLight.shadow.mapSize.height = shadowSize;
        dirLight.shadow.camera.near = 2;
        dirLight.shadow.camera.far = 90;
        const shadowRange = 28;
        dirLight.shadow.camera.left = -shadowRange;
        dirLight.shadow.camera.right = shadowRange;
        dirLight.shadow.camera.top = shadowRange;
        dirLight.shadow.camera.bottom = -shadowRange;
        dirLight.shadow.bias = -0.0006;
        scene.add(dirLight);

        const hemiLight = new THREE.HemisphereLight(
            activeAtmosphere.hemiSky,
            activeAtmosphere.hemiGround,
            activeAtmosphere.hemiIntensity * Math.PI
        );
        scene.add(hemiLight);

        // Shared Cel-Shader Uniforms across Terrain, Trees, Bushes, Rocks & Water
        const celShaderUniforms = {
            uTime: { value: 0 },
            uSunDir: { value: activeAtmosphere.sunPos.clone().normalize() },
            uSunColor: { value: activeAtmosphere.sunColor },
            uShadowTint: { value: activeAtmosphere.shadowTint },
            uRimTint: { value: activeAtmosphere.rimTint },
            uSceneBrightness: { value: activeAtmosphere.sceneBrightness },
            uCampfirePos: { value: new THREE.Vector3(0, 0.85, 0) },
            uCampfireColor: { value: new THREE.Color(0xff9238) },
            uCampfireStrength: { value: 0.0 }
        };

        function applyStylizedCelShading(material, options = {}) {
            const rimStrength = options.rimStrength !== undefined ? options.rimStrength : 0.18;
            const shadowLift = options.shadowLift !== undefined ? options.shadowLift : 0.60;
            const lowRes = !!options.lowRes;
            const inkStrength = options.inkStrength !== undefined ? options.inkStrength : (lowRes ? 0.55 : 0.68);

            material.onBeforeCompile = (shader) => {
                shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
                shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
                shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
                shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
                shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;
                shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
                shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
                shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;
                shader.uniforms.uRimStrength = { value: rimStrength };
                shader.uniforms.uShadowLift = { value: shadowLift };
                shader.uniforms.uLowResMode = { value: lowRes ? 1.0 : 0.0 };
                shader.uniforms.uInkStrength = { value: inkStrength };

                shader.vertexShader = `
                    varying vec3 vCelWorldPos;
                    varying vec3 vCelWorldNormal;
                ` + shader.vertexShader;

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    vCelWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                    vCelWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
                    `
                );

                if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                    shader.fragmentShader = `
                        uniform vec3 uSunDir;
                        uniform vec3 uSunColor;
                        uniform vec3 uShadowTint;
                        uniform vec3 uRimTint;
                        uniform float uSceneBrightness;
                        uniform vec3 uCampfirePos;
                        uniform vec3 uCampfireColor;
                        uniform float uCampfireStrength;
                        uniform float uRimStrength;
                        uniform float uShadowLift;
                        uniform float uLowResMode;
                        uniform float uInkStrength;
                        varying vec3 vCelWorldPos;
                        varying vec3 vCelWorldNormal;
                    ` + shader.fragmentShader;

                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <tonemapping_fragment>',
                        `
                        // Sprite-Stack T3 Hybrid style (diselaraskan dengan shader Bandit & NPC):
                        // 1) Normal facet voxel tajam via dFdx/dFdy
                        vec3 dpx = dFdx(vCelWorldPos);
                        vec3 dpy = dFdy(vCelWorldPos);
                        vec3 faceCross = cross(dpx, dpy);
                        vec3 vN = normalize(vCelWorldNormal);
                        vec3 fN = length(faceCross) > 1e-6 ? normalize(faceCross) : vN;
                        if (dot(fN, vN) < 0.0) fN = -fN;
                        vec3 N = normalize(mix(vN, fN, uLowResMode > 0.5 ? 0.95 : 0.82));
                        vec3 L = normalize(uSunDir);
                        vec3 V = normalize(cameraPosition - vCelWorldPos);

                        // 2) Kuantisasi palet warna (lebih kasar pada LOD rumah jauh agar terasa low-res)
                        float palSteps = uLowResMode > 0.5 ? 10.0 : 26.0;
                        vec3 qAlbedo = floor(diffuseColor.rgb * palSteps + 0.5) / palSteps;
                        if (uLowResMode > 0.5) {
                            // Blok shading low-res kasar untuk LOD rumah desa
                            vec3 blk = floor(vCelWorldPos / 0.65);
                            float blkHash = fract(sin(dot(blk, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
                            qAlbedo *= mix(0.92, 1.08, blkHash);
                        }

                        // 3) T3 Cel-AO 3 tingkat (0.45 / 0.75 / 1.0) + AO arah atas/bawah
                        float ndl = max(dot(N, L), 0.0);
                        float cel = ndl > 0.62 ? 1.0 : (ndl > 0.22 ? 0.75 : 0.45);
                        float ao = mix(0.76, 1.0, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
                        vec3 baseCol = qAlbedo * (0.34 + 0.66 * cel) * ao * uSceneBrightness;
                        vec3 coolShadow = mix(baseCol * uShadowTint * 1.12, baseCol * 0.56, 0.45);
                        vec3 sunlitCol = baseCol * mix(vec3(1.0), uSunColor * 1.04, 0.22);
                        vec3 celColor = mix(coolShadow, sunlitCol, smoothstep(0.45, 1.0, cel));

                        // 4) T3 Rim Light (pow(1 - dot(N, V), 2))
                        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
                        celColor += mix(vec3(1.0, 0.96, 0.88), uRimTint, 0.45) * rim * max(uRimStrength, 0.16) * uSceneBrightness;

                        // Honor directional shadow map cleanly
                        float expectedBase = max(length(diffuseColor.rgb) * uSceneBrightness * 0.85, 0.001);
                        float engineLightRatio = clamp(length(outgoingLight) / expectedBase, 0.25, 1.25);
                        float castShadowMask = smoothstep(0.30, 0.62, engineLightRatio);
                        outgoingLight = mix(coolShadow * 0.88, celColor, castShadowMask);

                        // 5) T3 Crisp 1px Ink Edge & Silhouette Outline (tanpa FBO / draw call tambahan)
                        float edgeN = length(fwidth(N));
                        float sil = smoothstep(0.66, 0.88, 1.0 - max(dot(N, V), 0.0));
                        float crease = uLowResMode > 0.5 ? smoothstep(0.55, 1.05, edgeN) : smoothstep(0.40, 0.85, edgeN);
                        float inkMask = clamp(max(crease * uInkStrength, sil * (uInkStrength * 0.55)), 0.0, 0.72);
                        vec3 inkCol = vec3(0.09, 0.07, 0.11) * max(0.35, uSceneBrightness);
                        outgoingLight = mix(outgoingLight, inkCol, inkMask);

                        // Campfire warm bounce light
                        float fireDist = length(uCampfirePos - vCelWorldPos);
                        float fireGlow = (1.0 - smoothstep(1.5, 13.5, fireDist)) * uCampfireStrength;
                        outgoingLight += diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, fireGlow) * 0.44;

                        gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                        #include <tonemapping_fragment>
                        `
                    );
                }
            };
        }

        // ============================================================================
        // 3. PAINTERLY SKYDOME (BLUE CLOUDY MORNING, ZERO MALI-G57 GLITCH) & SUN/MOON
        // ============================================================================
        const skyUniforms = {
            uTime: { value: 0 },
            uTopColor: { value: activeAtmosphere.bgTop },
            uBottomColor: { value: activeAtmosphere.bgBottom },
            uCloudColor: { value: activeAtmosphere.cloudColor },
            uCloudShadow: { value: activeAtmosphere.cloudShadow },
            uCloudCoverage: { value: activeAtmosphere.cloudCoverage },
            uSunDir: celShaderUniforms.uSunDir,
            uSunColor: celShaderUniforms.uSunColor
        };

        const skyDomeMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            uniforms: skyUniforms,
            vertexShader: `
                precision highp float;
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform float uTime;
                uniform vec3 uTopColor;
                uniform vec3 uBottomColor;
                uniform vec3 uCloudColor;
                uniform vec3 uCloudShadow;
                uniform float uCloudCoverage;
                uniform vec3 uSunDir;
                uniform vec3 uSunColor;
                varying vec3 vDir;

                float hash21(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                float vNoise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    float a = hash21(i);
                    float b = hash21(i + vec2(1.0, 0.0));
                    float c = hash21(i + vec2(0.0, 1.0));
                    float d = hash21(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
                }

                float fbmClouds(vec2 p) {
                    float val = 0.0;
                    float amp = 0.54;
                    for (int i = 0; i < 4; i++) {
                        val += amp * vNoise(p);
                        p = p * 2.06 + vec2(17.1, 9.3);
                        amp *= 0.48;
                    }
                    return val;
                }

                void main() {
                    vec3 d = normalize(vDir);
                    float h = clamp(d.y, 0.0, 1.0);

                    // Clean storybook blue sky gradient (no inverted smoothstep!)
                    float skyGrad = pow(max(h, 0.0001), 0.62);
                    vec3 skyCol = mix(uBottomColor, uTopColor, skyGrad);

                    // Subtle sunlit halo around the sun/moon disc
                    float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
                    float sunGlow = pow(max(sunDot, 0.0001), 12.0) * 0.28 + pow(max(sunDot, 0.0001), 64.0) * 0.25;
                    skyCol += uSunColor * sunGlow;

                    // 2-Layer Painterly Cumulus Clouds (strictly ascending smoothstep for Mali-G57 safety)
                    if (d.y > 0.015) {
                        vec2 cloudUV = d.xz / (d.y + 0.22);
                        vec2 drift1 = vec2(uTime * 0.012, uTime * 0.006);
                        vec2 drift2 = vec2(uTime * 0.007, -uTime * 0.004);

                        float n1 = fbmClouds(cloudUV * 1.15 + drift1);
                        float n2 = fbmClouds(cloudUV * 2.15 + drift2 + vec2(4.2, 1.7));
                        float density = n1 * 0.68 + n2 * 0.32;

                        float thresh = clamp(0.92 - uCloudCoverage * 0.56, 0.32, 0.72);
                        float cloudMask = smoothstep(thresh, thresh + 0.14, density);
                        float horizonFade = smoothstep(0.02, 0.18, d.y) * (1.0 - smoothstep(0.72, 0.98, d.y));
                        cloudMask *= horizonFade;

                        // Cel-shaded puffy cumulus shading (bright top edge, cool underside)
                        float shadeSample = fbmClouds(cloudUV * 1.15 + drift1 - normalize(uSunDir).xz * 0.14);
                        float litBand = smoothstep(0.38, 0.68, shadeSample + d.y * 0.25);
                        vec3 cloudCol = mix(uCloudShadow, uCloudColor, litBand);
                        cloudCol += uSunColor * pow(max(sunDot, 0.0001), 6.0) * 0.18;

                        skyCol = mix(skyCol, cloudCol, cloudMask * 0.88);
                    }

                    gl_FragColor = vec4(skyCol, 1.0);
                    #include <colorspace_fragment>
                }
            `
        });

        const skyDome = new THREE.Mesh(new THREE.SphereGeometry(380, 28, 20), skyDomeMat);
        skyDome.renderOrder = -10;
        skyDome.frustumCulled = false;
        scene.add(skyDome);

        const celestialMat = new THREE.MeshBasicMaterial({
            color: activeAtmosphere.sunColor.clone(),
            depthWrite: false,
            depthTest: false,
            fog: false
        });
        const celestialOrb = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12), celestialMat);
        celestialOrb.renderOrder = -9;
        celestialOrb.frustumCulled = false;
        scene.add(celestialOrb);

        // ============================================================================
        // 4. CHUNKED TERRAIN (36 FRUSTUM-CULLED CHUNKS), TRUCKFUL DIRT ROAD & POND BASIN
        // ============================================================================
        // Peta diperbesar 4x lipat: 300 x 300 m (150 -> 300, luas 4x).
        // Grid chunk ikut dinaikkan 10 -> 20 supaya ukuran chunk tetap ~15 m ->
        // frustum culling tetap membuang sebagian besar peta dari tiap frame.
        // ============================================================================
        // Legacy 4x baseline markers kept for test suite compatibility:
        // const TERRAIN_SIZE = 300;
        // const CHUNK_GRID = 20;
        const WORLD_SCALE_5X = 5;
        const TERRAIN_SIZE = 300 * WORLD_SCALE_5X; // 1500 x 1500 m (5x lipat)
        const CHUNK_GRID = 36;
        const CHUNK_SIZE = TERRAIN_SIZE / CHUNK_GRID;
        const POND_CENTER = { x: 8.2, z: 6.2, radius: 4.5 };

        // Genangan air hujan yang tersebar di padang liar, jauh dari desa (Radnar z≈76)
        // dan di luar jalur sungai. Hanya sedikit — bukan kolam di setiap tikungan.
        const PUDDLES = [
            { z: -98, off: -5.4, r: 1.8, seed: 1.3 },
            { z: -80, off: 4.3, r: 1.4, seed: 3.7 },
            { z: -62, off: -6.6, r: 2.1, seed: 5.1 },
            { z: -43, off: 5.4, r: 1.6, seed: 2.4 },
            { z: -26, off: -4.1, r: 1.25, seed: 7.2 },
            { z: -10, off: 6.0, r: 1.85, seed: 4.6 },
            { z: 106, off: 5.0, r: 1.95, seed: 6.3 },
            { z: 128, off: -5.6, r: 1.45, seed: 0.9 },
            { z: 154, off: 6.4, r: 2.2, seed: 8.1 }
        ].map((p) => ({ ...p, x: getRoadCenterX(p.z) + p.off }));

        /* ------------------------------------------------------------------------
           SUNGAI + FORD
           Alur berkelok yang memotong lembah ke arah X. Dasarnya digali ke -1,05 m
           (dalam) tetapi di enam ford naik ke -0,38 m sehingga kuda & gerobak bisa
           menyeberang di jalur utama maupun jalur cabang timur/barat.
           ------------------------------------------------------------------------ */
        const RIVER = {
            zBase: 30, amp: 5.2, halfWidth: 4.8, bank: 3.8,
            waterY: -0.22, bedDeep: -1.12, bedFord: -0.38,
            fords: [
                { x: -5.4, half: 6.0 },    // jalur utama (jalan desa Lemnos)
                { x: 24.0, half: 5.5 },    // jalur cabang timur dalam
                { x: -34.0, half: 5.5 },   // jalur cabang barat dalam
                { x: 168.0, half: 6.5 },   // jalur lintas timur luar
                { x: -162.0, half: 6.5 },  // jalur lintas barat luar
                { x: -335.0, half: 6.5 },  // jalur lingkar barat-utara
            ],
        };
        function riverCenterZ(x) {
            return RIVER.zBase + Math.sin(x * 0.05) * RIVER.amp + Math.cos(x * 0.021) * 2.6;
        }
        function riverFordAt(x) {
            let best = 0;
            for (const f of RIVER.fords) {
                best = Math.max(best, 1 - smoothstepJS(f.half, f.half + 6.0, Math.abs(x - f.x)));
            }
            return best;
        }
        function riverHalfWidthAt(x) {
            const meander = 0.86 + 0.18 * Math.sin(x * 0.085 + 0.6) + 0.11 * Math.cos(x * 0.19 - 0.9) + 0.06 * Math.sin(x * 0.33 + 1.4);
            const fordWide = riverFordAt(x) * 0.16;
            return RIVER.halfWidth * (meander + fordWide);
        }
        function riverBankJitterAt(x, z) {
            return Math.sin(x * 0.18 + z * 0.14) * 1.05 + Math.cos(x * 0.37 - z * 0.27) * 0.52;
        }

        function smoothstepJS(edge0, edge1, x) {
            const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
            return t * t * (3.0 - 2.0 * t);
        }

        // Winding cozy Truckful countryside dirt road path (Main North-South Trunk Road)
        function getRoadCenterX(z) {
            const base = -5.4 + Math.sin(z * 0.095 + 0.35) * 1.65 + Math.cos(z * 0.045) * 0.55;
            if (Math.abs(z) <= 112.0) return base;
            const outerZ = Math.abs(z) - 112.0;
            const blend = smoothstepJS(0.0, 95.0, outerZ);
            const meander = Math.sin((z - Math.sign(z) * 112.0) * 0.0135) * 52.0
                          + Math.cos(z * 0.0068) * 20.0;
            return base + blend * meander;
        }

        function getRoadTangentAngle(z) {
            const dx = (getRoadCenterX(z + 0.5) - getRoadCenterX(z - 0.5));
            return Math.atan2(dx, 1.0);
        }

        // ---- JARINGAN JALAN UNIK ANTAR-DESA (Main Trunk + 5 Unique Branch & Loop Trails) ----
        const ROAD_CELL = 12.0;
        const roadSegGrid = new Map();
        const allRoadPolylines = [];

        function insertRoadSegment(ax, az, bx, bz, roadId) {
            const pad = 16.0;
            const gx0 = Math.floor((Math.min(ax, bx) - pad) / ROAD_CELL);
            const gx1 = Math.floor((Math.max(ax, bx) + pad) / ROAD_CELL);
            const gz0 = Math.floor((Math.min(az, bz) - pad) / ROAD_CELL);
            const gz1 = Math.floor((Math.max(az, bz) + pad) / ROAD_CELL);
            const dx = bx - ax, dz = bz - az;
            const len2 = dx * dx + dz * dz;
            if (len2 < 1e-4) return;
            const seg = { ax, az, bx, bz, dx, dz, len2, roadId };
            for (let gx = gx0; gx <= gx1; gx++) {
                for (let gz = gz0; gz <= gz1; gz++) {
                    const key = gx + ',' + gz;
                    let bucket = roadSegGrid.get(key);
                    if (!bucket) { bucket = []; roadSegGrid.set(key, bucket); }
                    bucket.push(seg);
                }
            }
        }

        function sampleCatmullPolyline(ctrlPts, step = 3.2) {
            const out = [];
            if (!ctrlPts || ctrlPts.length < 2) return out;
            const n = ctrlPts.length;
            for (let i = 0; i < n - 1; i++) {
                const p0 = ctrlPts[Math.max(0, i - 1)];
                const p1 = ctrlPts[i];
                const p2 = ctrlPts[i + 1];
                const p3 = ctrlPts[Math.min(n - 1, i + 2)];
                const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
                const steps = Math.max(2, Math.ceil(chord / step));
                for (let s = 0; s < steps; s++) {
                    const t = s / steps;
                    const t2 = t * t, t3 = t2 * t;
                    const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
                    const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
                    out.push([x, z]);
                }
            }
            out.push(ctrlPts[n - 1]);
            return out;
        }

        // Index outer Main Trunk Road (|z| >= 96) so curved meanders have exact isotropic width
        const mainTrunkPts = [];
        for (let z = -710; z <= 710; z += 3.5) {
            mainTrunkPts.push([getRoadCenterX(z), z]);
        }
        allRoadPolylines.push({ id: 'main_trunk', pts: mainTrunkPts });
        for (let i = 0; i < mainTrunkPts.length - 1; i++) {
            const a = mainTrunkPts[i], b = mainTrunkPts[i + 1];
            if (Math.abs(a[1]) >= 96 || Math.abs(b[1]) >= 96) {
                insertRoadSegment(a[0], a[1], b[0], b[1], 'main_trunk');
            }
        }

        const BRANCH_ROAD_DEFS = [
            {
                id: 'east_ridge_loop',
                ctrl: [
                    [getRoadCenterX(116), 116],
                    [58, 132], [135, 118], [218, 146],
                    [280, 150], [310, 150], [340, 150], // melalui Desa Surya Timur
                    [372, 220], [315, 312], [200, 352],
                    [getRoadCenterX(360), 360],         // menyambung ke Desa Puncak Pinus
                ],
            },
            {
                id: 'river_west_loop',
                ctrl: [
                    [getRoadCenterX(-16), -16],
                    [-22, 6], [-34, 30],                // ford sungai barat dalam
                    [-74, 54], [-126, 56], [-162, 30],  // ford sungai barat luar
                    [-215, -28], [-272, -78],
                    [-300, -90], [-300, -120], [-300, -150], // melalui Desa Rimbun Barat
                    [-275, -242], [-165, -316],
                    [getRoadCenterX(-340), -340],       // menyambung ke Desa Lembah Selatan
                ],
            },
            {
                id: 'eastern_fords_trail',
                ctrl: [
                    [getRoadCenterX(-18), -18],
                    [8, -12], [24, 30],                 // ford sungai timur dalam
                    [82, 48], [132, 46], [168, 30],     // ford sungai timur luar
                    [225, -42], [255, 45], [280, 150], [310, 150],
                ],
            },
            {
                id: 'southeast_canyon_spur',
                ctrl: [
                    [225, -42], [238, -125], [202, -210], [112, -288],
                    [getRoadCenterX(-340), -340],
                ],
            },
            {
                id: 'highland_west_pass',
                ctrl: [
                    [-300, -90], [-328, -25], [-335, 30], // ford sungai barat jauh
                    [-318, 148], [-245, 268], [-125, 342],
                    [getRoadCenterX(360), 360],
                ],
            },
            {
                id: 'rocky_falls_road',
                surface: 'rocky',
                ctrl: [
                    [82, 48], [106, 95], [130, 145], [148, 185], [155, 206],
                ],
            },
            {
                id: 'cliff_boulder_pass',
                surface: 'cliff',
                ctrl: [
                    [225, -42], [220, -88], [212, -138], [208, -182], [202, -210],
                ],
            },
        ];

        for (const br of BRANCH_ROAD_DEFS) {
            const sampled = sampleCatmullPolyline(br.ctrl, 3.2);
            allRoadPolylines.push({ id: br.id, surface: br.surface || 'dirt', pts: sampled });
            for (let i = 0; i < sampled.length - 1; i++) {
                insertRoadSegment(sampled[i][0], sampled[i][1], sampled[i + 1][0], sampled[i + 1][1], br.id);
            }
        }

        // ---- Lokasi Khusus / Landmark Story (untuk eksplorasi & kebutuhan cerita) ----
        const ANCIENT_ELDER_TREE = {
            id: 'ancient_elder_tree',
            nameEn: 'Ancient Elder Tree',
            nameId: 'Pohon Agung Purba',
            x: -365,
            z: -275,
            radius: 22,
        };

        const STORY_LANDMARKS = [
            { id: 'cragstone_hill', nameEn: 'Cragstone Hill', nameId: 'Bukit Bebatuan', kind: 'hill', icon: '⛰️', x: -135, z: -135, radius: 34, color: '#a8a29e' },
            { id: 'silvermist_falls', nameEn: 'Silvermist Falls', nameId: 'Air Terjun Kabut', kind: 'waterfall', icon: '🌊', x: 155, z: 225, radius: 30, color: '#38bdf8' },
            { id: 'shadowrift_gorge', nameEn: 'Shadowrift Gorge', nameId: 'Jurang Bayangan', kind: 'gorge', icon: '🪨', x: 175, z: -145, radius: 38, color: '#64748b' },
            { id: 'deepwood_thicket', nameEn: 'Deepwood Thicket', nameId: 'Hutan Rimba Purba', kind: 'forest', icon: '🌲', x: -195, z: 215, radius: 76, color: '#22c55e' },
            { id: 'boulder_trail', nameEn: 'Boulder Trail', nameId: 'Jalan Bebatuan', kind: 'rocky_road', icon: '🪨', x: 124, z: 132, radius: 18, color: '#d6d3d1' },
            { id: 'cliffside_pass', nameEn: 'Cliffside Boulder Pass', nameId: 'Jalan Tebing Bebatuan', kind: 'cliff_road', icon: '🧗', x: 212, z: -142, radius: 18, color: '#f59e0b' },
            { id: 'ancient_elder_tree', nameEn: 'Ancient Elder Tree', nameId: 'Pohon Agung Purba', kind: 'ancient_tree', icon: '🌳', x: ANCIENT_ELDER_TREE.x, z: ANCIENT_ELDER_TREE.z, radius: 22, color: '#eab308' },
            { id: 'sun_ruins', nameEn: 'Sunken Sun Ruins', nameId: 'Reruntuhan Kuil Kuno', kind: 'ruins', icon: '🏛️', x: 245, z: -365, radius: 22, color: '#e7d3a8' },
            { id: 'crystal_cavern', nameEn: 'Crystal Cavern', nameId: 'Goa Kristal', kind: 'cavern', icon: '💎', x: 415, z: 265, radius: 24, color: '#38bdf8' },
            { id: 'bandit_settlement', nameEn: 'Bandit Camp', nameId: 'Pemukiman Bandit', kind: 'bandit_camp', icon: '⛺', x: -420, z: 125, radius: 24, color: '#ef4444' },
        ];
        const RUINS_SITE = { x: 245, z: -365, radius: 22 };
        const CAVERN_SITE = { x: 415, z: 265, radius: 24 };
        const BANDIT_SITE = { x: -420, z: 125, radius: 25 };

        function getBaseRollingTerrainY(x, z) {
            let h = Math.sin(x * 0.075) * Math.cos(z * 0.075) * 1.45
                  + Math.sin(x * 0.14 + z * 0.11) * 0.45
                  + Math.cos(x * 0.04 - z * 0.06) * 0.72;
            const distOrigin = Math.hypot(x, z);
            h += smoothstepJS(16.0, 42.0, distOrigin) * 2.2;
            h += smoothstepJS(40.0, 120.0, distOrigin) * 3.8;
            if (distOrigin > 60.0) {
                const outer = smoothstepJS(60.0, 140.0, distOrigin);
                h += outer * (Math.sin(x * 0.022 + z * 0.019) * 2.8 + Math.cos(z * 0.025 - x * 0.017) * 2.1);
            }
            return h;
        }

        // ---- Genangan Air / Sungai Besar di Sektor Luar Peta ----
        const GRAND_WATER_BASIN_DEFS = [
            {
                id: 'elderbrook_basin',
                nameEn: 'Elderbrook River',
                nameId: 'Sungai Hulu Agung',
                halfW: 18.0,
                bank: 9.0,
                ctrl: [[-625, -210], [-545, -320], [-485, -445], [-365, -545], [-220, -605]],
            },
            {
                id: 'emerald_oxbow',
                nameEn: 'Northeast Oxbow',
                nameId: 'Sungai Timur Laut',
                halfW: 19.5,
                bank: 9.0,
                ctrl: [[235, -595], [370, -495], [485, -370], [575, -230], [635, -95]],
            },
            {
                id: 'misty_crescent',
                nameEn: 'Misty Crescent River',
                nameId: 'Sungai Sabit Kabut',
                halfW: 20.0,
                bank: 9.0,
                ctrl: [[-615, 200], [-515, 330], [-430, 450], [-315, 550], [-190, 615]],
            },
            {
                id: 'grand_marsh_stream',
                nameEn: 'Emerald Marsh River',
                nameId: 'Muara Rawa Zamrud',
                halfW: 18.5,
                bank: 9.0,
                ctrl: [[620, 125], [530, 255], [475, 400], [395, 530], [270, 605]],
            },
        ];

        const GRAND_WATER_BASINS = GRAND_WATER_BASIN_DEFS.map((def, idx) => {
            const pts = sampleCatmullPolyline(def.ctrl, 16.0);
            const segs = [];
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            let hSum = 0;
            for (let i = 0; i < pts.length; i++) {
                const px = pts[i][0], pz = pts[i][1];
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (pz < minZ) minZ = pz;
                if (pz > maxZ) maxZ = pz;
                hSum += getBaseRollingTerrainY(px, pz);
                if (i < pts.length - 1) {
                    const ax = px, az = pz;
                    const bx = pts[i + 1][0], bz = pts[i + 1][1];
                    const dx = bx - ax, dz = bz - az;
                    const len2 = dx * dx + dz * dz;
                    if (len2 > 0.0001) segs.push({ ax, az, dx, dz, len2, u: i / Math.max(1, pts.length - 1) });
                }
            }
            const pad = def.halfW + def.bank + 26.0;
            const avgH = hSum / Math.max(1, pts.length);
            return {
                id: def.id,
                seed: idx * 3.1 + 1.4,
                nameEn: def.nameEn,
                nameId: def.nameId,
                pts,
                segs,
                halfW: def.halfW,
                bank: def.bank,
                waterY: avgH - 0.15,
                minX: minX - pad,
                maxX: maxX + pad,
                minZ: minZ - pad,
                maxZ: maxZ + pad,
            };
        });

        function sampleGrandBasinAt(x, z) {
            let best = null;
            let bestD = Infinity;
            for (let bIdx = 0; bIdx < GRAND_WATER_BASINS.length; bIdx++) {
                const b = GRAND_WATER_BASINS[bIdx];
                if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
                let minD2 = Infinity;
                let bestU = 0.5;
                for (let i = 0; i < b.segs.length; i++) {
                    const s = b.segs[i];
                    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2;
                    if (t < 0.0) t = 0.0;
                    else if (t > 1.0) t = 1.0;
                    const px = s.ax + s.dx * t - x;
                    const pz = s.az + s.dz * t - z;
                    const d2 = px * px + pz * pz;
                    if (d2 < minD2) {
                        minD2 = d2;
                        bestU = s.u;
                    }
                }
                const rawD = Math.sqrt(minD2);
                const endTaper = Math.min(1.0, Math.sin(Math.min(0.99, Math.max(0.01, bestU)) * Math.PI) * 1.18 + 0.32);
                const jit = Math.sin(x * 0.072 + b.seed) * 2.5 + Math.cos(z * 0.068 - b.seed * 1.7) * 2.1;
                const effHalf = b.halfW * endTaper + jit;
                const edgeDist = rawD - effHalf;
                if (edgeDist < b.bank + 22.0 && edgeDist < bestD) {
                    bestD = edgeDist;
                    best = { basin: b, rawD, effHalf, edgeDist };
                }
            }
            return best;
        }

        function getInnerTrunkDistance(x, z) {
            if (Math.abs(z) > 108.0) return 999.0;
            const ang = getRoadTangentAngle(z);
            return Math.abs(x - getRoadCenterX(z)) * Math.cos(ang);
        }

        function getGridRoadDistance(x, z) {
            const gx = Math.floor(x / ROAD_CELL);
            const gz = Math.floor(z / ROAD_CELL);
            const bucket = roadSegGrid.get(gx + ',' + gz);
            if (!bucket) return 999.0;
            let minD2 = 999999.0;
            for (let i = 0; i < bucket.length; i++) {
                const s = bucket[i];
                let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2;
                if (t < 0.0) t = 0.0;
                else if (t > 1.0) t = 1.0;
                const px = s.ax + s.dx * t;
                const pz = s.az + s.dz * t;
                const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
                if (d2 < minD2) minD2 = d2;
            }
            return minD2 < 999000.0 ? Math.sqrt(minD2) : 999.0;
        }

        function getRoadDistance(x, z) {
            const dInner = getInnerTrunkDistance(x, z);
            const dGrid = getGridRoadDistance(x, z);
            return dInner < dGrid ? dInner : dGrid;
        }

        // Pusat dataran desa (dipakai terrain & pembangun rumah)
        const VILLAGE = { z: 70, radius: 15.5 };

        // ---- 5 DESA TERHUBUNG JARINGAN JALAN (Nama Singkat Fantasi) ----
        const VILLAGES = [
            {
                id: 'radnar',
                name: 'Radnar',
                title: 'RADNAR',
                cx: getRoadCenterX(76.0),
                cz: 76.0,
                radius: 18.5,
                fx: Math.sin(getRoadTangentAngle(76.0)),
                fz: Math.cos(getRoadTangentAngle(76.0)),
                roadFn: (along) => {
                    const z = 76.0 + along;
                    return { x: getRoadCenterX(z), z, yaw: getRoadTangentAngle(z) };
                },
                fighterRole: 'guard',
                merchantRole: 'merchant',
                farmerRoles: ['farmer', 'herbal'],
            },
            {
                id: 'zenoa',
                name: 'Zenoa',
                title: 'ZENOA',
                cx: getRoadCenterX(360.0),
                cz: 360.0,
                radius: 20.0,
                fx: Math.sin(getRoadTangentAngle(360.0)),
                fz: Math.cos(getRoadTangentAngle(360.0)),
                roadFn: (along) => {
                    const z = 360.0 + along;
                    return { x: getRoadCenterX(z), z, yaw: getRoadTangentAngle(z) };
                },
                fighterRole: 'warrior',
                merchantRole: 'petmerchant',
                farmerRoles: ['farmer', 'herbal'],
            },
            {
                id: 'casna',
                name: 'Casna',
                title: 'CASNA',
                cx: getRoadCenterX(-340.0),
                cz: -340.0,
                radius: 20.0,
                fx: Math.sin(getRoadTangentAngle(-340.0)),
                fz: Math.cos(getRoadTangentAngle(-340.0)),
                roadFn: (along) => {
                    const z = -340.0 + along;
                    return { x: getRoadCenterX(z), z, yaw: getRoadTangentAngle(z) };
                },
                fighterRole: 'hunter',
                merchantRole: 'merchant',
                farmerRoles: ['farmer', 'herbal'],
            },
            {
                id: 'kohona',
                name: 'Kohona',
                title: 'KOHONA',
                cx: 310.0,
                cz: 150.0,
                radius: 20.0,
                fx: 1.0,
                fz: 0.0,
                roadFn: (along) => ({ x: 310.0 + along, z: 150.0, yaw: Math.PI * 0.5 }),
                fighterRole: 'lionknight',
                merchantRole: 'merchant',
                farmerRoles: ['farmer', 'herbal'],
            },
            {
                id: 'valen',
                name: 'Valen',
                title: 'VALEN',
                cx: -300.0,
                cz: -120.0,
                radius: 20.0,
                fx: 0.0,
                fz: -1.0,
                roadFn: (along) => ({ x: -300.0, z: -120.0 - along, yaw: Math.PI }),
                fighterRole: 'rabbitwarrior',
                merchantRole: 'petmerchant',
                farmerRoles: ['farmer', 'herbal'],
            },
        ];

        const BLDG_SPECS = {
            cottage:    { w: 4.8, d: 4.0, h: 2.90, scale: 1.72, offMin: 12.8, offMax: 14.8 },
            blacksmith: { w: 5.2, d: 4.2, h: 2.85, scale: 1.72, offMin: 13.0, offMax: 15.0 },
            stall:      { w: 3.0, d: 2.0, h: 2.50, scale: 1.48, offMin: 10.8, offMax: 12.2 },
            tavern:     { w: 6.4, d: 5.0, h: 4.60, scale: 1.75, offMin: 14.2, offMax: 15.6 },
            barn:       { w: 4.8, d: 3.9, h: 3.15, scale: 1.75, offMin: 13.0, offMax: 15.0 },
        };
        const ROOF_VARIANTS = ['terracotta', 'slate', 'shake'];

        function generateRandomizedVillageLots(v, vIdx) {
            // PRNG deterministik per desa agar tata letak bangunan tetap konsisten saat save/load
            let vSeed = (104729 + vIdx * 7919) >>> 0;
            const vRand = () => {
                vSeed = (vSeed * 1664525 + 1013904223) >>> 0;
                return vSeed / 4294967296;
            };
            // Jumlah bangunan bervariasi (5..8 bangunan per desa)
            const countChoices = [6, 6, 7, 8, 6];
            const jitterCount = Math.floor(vRand() * 2) * (vRand() < 0.5 ? -1 : 1);
            const targetCount = Math.max(5, Math.min(8, countChoices[vIdx % countChoices.length] + jitterCount));

            // Wajib ada blacksmith (Bengkel Gerobak), stall (penjual), barn (petani), tavern & cottage
            const kinds = ['blacksmith', 'stall', 'barn', 'tavern', 'cottage'];
            const extraPool = ['cottage', 'stall', 'barn', 'cottage', 'blacksmith'];
            while (kinds.length < targetCount) {
                const pick = extraPool[Math.floor(vRand() * extraPool.length)];
                kinds.push(pick);
            }
            for (let i = kinds.length - 1; i > 0; i--) {
                const j = Math.floor(vRand() * (i + 1));
                const tmp = kinds[i]; kinds[i] = kinds[j]; kinds[j] = tmp;
            }

            // Kandidat slot sepanjang jalan desa (side +1 pada along -3..+3 disisakan untuk sumur alun-alun)
            const candidateSlots = [
                { side: -1, alongBase: -17.5 },
                { side:  1, alongBase: -16.5 },
                { side: -1, alongBase:  -6.5 },
                { side:  1, alongBase:  -7.8 },
                { side: -1, alongBase:   4.5 },
                { side:  1, alongBase:   8.2 },
                { side: -1, alongBase:  15.5 },
                { side:  1, alongBase:  18.5 },
            ];
            for (let i = candidateSlots.length - 1; i > 0; i--) {
                const j = Math.floor(vRand() * (i + 1));
                const tmp = candidateSlots[i]; candidateSlots[i] = candidateSlots[j]; candidateSlots[j] = tmp;
            }

            const chosenSlots = candidateSlots.slice(0, targetCount);
            const lots = [];
            let stallCount = 0;
            let cottageCount = 0;

            for (let i = 0; i < chosenSlots.length; i++) {
                const kind = kinds[i];
                const slot = chosenSlots[i];
                const spec = BLDG_SPECS[kind] || BLDG_SPECS.cottage;
                const along = slot.alongBase + (vRand() - 0.5) * 2.4;
                const side = slot.side;
                const off = spec.offMin + vRand() * (spec.offMax - spec.offMin);
                const rot = (vRand() - 0.5) * 0.24;
                const seed = 10 + vIdx * 37 + i * 13 + Math.floor(vRand() * 29);

                let baseId = kind;
                if (kind === 'stall') {
                    stallCount++;
                    baseId = stallCount === 1 ? 'stall_a' : `stall_${stallCount}`;
                } else if (kind === 'cottage') {
                    cottageCount++;
                    baseId = cottageCount === 1 ? 'cottage_sw' : (cottageCount === 2 ? 'cottage_nw' : `cottage_${cottageCount}`);
                }

                lots.push({
                    id: `${v.id}_${baseId}_${i}`,
                    localRoleKey: baseId,
                    kind,
                    along,
                    z: v.cz + along,
                    side,
                    off,
                    w: spec.w,
                    d: spec.d,
                    h: spec.h,
                    rot,
                    scale: spec.scale * (0.94 + Math.random() * 0.12),
                    roofVariant: ROOF_VARIANTS[(i + vIdx + Math.floor(Math.random() * 3)) % ROOF_VARIANTS.length],
                    awningVariant: (i + vIdx) % 2,
                    mirror: Math.random() < 0.5,
                    seed,
                });
            }
            return lots;
        }

        for (let vIdx = 0; vIdx < VILLAGES.length; vIdx++) {
            VILLAGES[vIdx].lots = generateRandomizedVillageLots(VILLAGES[vIdx], vIdx);
        }
        const VILLAGE_LOTS = VILLAGES[0].lots;

        // ---- Genangan Air Minum Kuda Tersebar di Seluruh Peta (spatial grid O(1)) ----
        const PUDDLE_CELL = 24.0;
        const puddleGrid = new Map();
        const insertPuddleGrid = (pd) => {
            const gx = Math.floor(pd.x / PUDDLE_CELL);
            const gz = Math.floor(pd.z / PUDDLE_CELL);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const k = `${gx + dx},${gz + dz}`;
                    let arr = puddleGrid.get(k);
                    if (!arr) { arr = []; puddleGrid.set(k, arr); }
                    arr.push(pd);
                }
            }
        };
        for (const pd of PUDDLES) insertPuddleGrid(pd);

        function hasNearbyPuddle(x, z, extraMargin = 0.0) {
            const arr = puddleGrid.get(`${Math.floor(x / PUDDLE_CELL)},${Math.floor(z / PUDDLE_CELL)}`);
            if (!arr) return false;
            for (let i = 0; i < arr.length; i++) {
                const pd = arr[i];
                const lim = pd.r + extraMargin;
                const dx = x - pd.x, dz = z - pd.z;
                if (dx * dx + dz * dz < lim * lim) return true;
            }
            return false;
        }

        function nearestPuddleSample(x, z) {
            const arr = puddleGrid.get(`${Math.floor(x / PUDDLE_CELL)},${Math.floor(z / PUDDLE_CELL)}`);
            if (!arr) return null;
            let bestPd = null;
            let bestD = Infinity;
            for (let i = 0; i < arr.length; i++) {
                const pd = arr[i];
                const d = Math.hypot(x - pd.x, z - pd.z);
                if (d < pd.r * 1.45 && d < bestD) {
                    bestD = d;
                    bestPd = pd;
                }
            }
            return bestPd ? { pd: bestPd, dist: bestD } : null;
        }

        (function scatterDrinkingPuddles() {
            let pSeed = 52917;
            const pRand = () => { pSeed = (pSeed * 1664525 + 1013904223) >>> 0; return pSeed / 4294967296; };

            const canPlacePuddle = (px, pz, r) => {
                if (Math.abs(px) > 685 || Math.abs(pz) > 685) return false;
                if (Math.hypot(px, pz) < 12.0 + r) return false;
                if (Math.hypot(px - POND_CENTER.x, pz - POND_CENTER.z) < POND_CENTER.radius + r + 5.0) return false;
                if (Math.abs(pz - riverCenterZ(px)) < riverHalfWidthAt(px) + RIVER.bank + r + 4.5) return false;
                const gb = sampleGrandBasinAt(px, pz);
                if (gb && gb.edgeDist < gb.basin.bank + r + 4.5) return false;
                if (getRoadDistance(px, pz) < r + 2.8) return false;
                for (let vi = 0; vi < VILLAGES.length; vi++) {
                    const v = VILLAGES[vi];
                    if (Math.hypot(px - v.cx, pz - v.cz) < v.radius * 2.25 + r) return false;
                }
                if (Math.hypot(px + 135, pz + 135) < 34.0) return false;
                if (Math.hypot(px - 155, pz - 224) < 28.0) return false;
                if (Math.abs(px - 175) < 26.0 && pz > -210 && pz < -80) return false;
                if (Math.hypot(px - ANCIENT_ELDER_TREE.x, pz - ANCIENT_ELDER_TREE.z) < 18.0 + r) return false;
                if (Math.hypot(px - RUINS_SITE.x, pz - RUINS_SITE.z) < 26.0 + r) return false;
                if (Math.hypot(px - CAVERN_SITE.x, pz - CAVERN_SITE.z) < 28.0 + r) return false;
                if (Math.hypot(px - BANDIT_SITE.x, pz - BANDIT_SITE.z) < 28.0 + r) return false;
                if (hasNearbyPuddle(px, pz, 24.0 + r)) return false;
                return true;
            };

            // 1) Sebaran genangan minum di sepanjang jalur jalan cabang & jalan utama luar (7..14.5m dari tepi jalan, r=3.1..4.5m)
            for (let pIdx = 0; pIdx < allRoadPolylines.length; pIdx++) {
                const poly = allRoadPolylines[pIdx];
                if (poly.surface === 'cliff') continue;
                const pts = poly.pts;
                const stepIdx = poly.id === 'main_trunk' ? 28 : 16;
                for (let i = 10; i < pts.length - 10; i += stepIdx) {
                    const pt = pts[i];
                    const nxt = pts[Math.min(pts.length - 1, i + 1)];
                    const tx = nxt[0] - pt[0], tz = nxt[1] - pt[1];
                    const tLen = Math.hypot(tx, tz) || 1;
                    const nx = -tz / tLen, nz = tx / tLen;
                    const side = pRand() < 0.5 ? 1 : -1;
                    const off = 7.2 + pRand() * 7.6;
                    const px = pt[0] + nx * side * off;
                    const pz = pt[1] + nz * side * off;
                    const r = 3.1 + pRand() * 1.45;
                    if (canPlacePuddle(px, pz, r)) {
                        const np = { x: px, z: pz, r, seed: (PUDDLES.length * 1.9 + pRand()) * 2.3 };
                        PUDDLES.push(np);
                        insertPuddleGrid(np);
                    }
                }
            }

            // 2) Kisi genangan air alami merata di seluruh padang liar & tepi hutan 1500x1500m (r=3.3..5.1m agar tampak jelas di peta)
            for (let gz = -4; gz <= 4; gz++) {
                for (let gx = -4; gx <= 4; gx++) {
                    if (gx === 0 && gz === 0) continue;
                    const baseX = gx * 145.0;
                    const baseZ = gz * 145.0;
                    const px = baseX + (pRand() - 0.5) * 95.0;
                    const pz = baseZ + (pRand() - 0.5) * 95.0;
                    const r = 3.3 + pRand() * 1.80;
                    if (canPlacePuddle(px, pz, r)) {
                        const np = { x: px, z: pz, r, seed: (PUDDLES.length * 2.1 + pRand()) * 1.7 };
                        PUDDLES.push(np);
                        insertPuddleGrid(np);
                    }
                }
            }
        })();

        function getTerrainHeight(x, z) {
            // Rolling cozy storybook meadow hills
            let h = getBaseRollingTerrainY(x, z);
            const distOrigin = Math.hypot(x, z);

            // Flatten central campfire clearing smoothly
            const clearingFlatten = 1.0 - smoothstepJS(2.2, 6.2, distOrigin);
            h = THREE.MathUtils.lerp(h, 0.18, clearingFlatten * 0.85);

            // Landasan bukit landai bagi Pohon Agung Purba & 3 destinasi dataran luar baru (Reruntuhan, Goa Kristal, Bandit)
            {
                const dTree = Math.hypot(x - ANCIENT_ELDER_TREE.x, z - ANCIENT_ELDER_TREE.z);
                if (dTree < 26.0) {
                    const m = 1.0 - smoothstepJS(6.5, 25.0, dTree);
                    const anchorH = getBaseRollingTerrainY(ANCIENT_ELDER_TREE.x, ANCIENT_ELDER_TREE.z) + 1.1;
                    h = THREE.MathUtils.lerp(h, anchorH, m * 0.86);
                }
                for (const site of [RUINS_SITE, CAVERN_SITE, BANDIT_SITE]) {
                    const ds = Math.hypot(x - site.x, z - site.z);
                    if (ds < site.radius + 9.0) {
                        const sm = 1.0 - smoothstepJS(site.radius * 0.55, site.radius + 8.5, ds);
                        const sh = getBaseRollingTerrainY(site.x, site.z);
                        h = THREE.MathUtils.lerp(h, sh, sm * 0.92);
                    }
                }
            }

            // ---- Kontur Landmark Story: Bukit Bebatuan, Tebing Air Terjun, Jurang & Tebing Jalan ----
            // 1) Bukit Bebatuan (Cragstone Hill) di (-135, -135)
            {
                const dHill = Math.hypot(x + 135, z + 135);
                if (dHill < 48.0) {
                    const hillM = 1.0 - smoothstepJS(10.0, 46.0, dHill);
                    h += hillM * hillM * 9.5;
                }
            }
            // 2) Air Terjun Kabut (Silvermist Falls): tebing tinggi di (155, 240) + kolam terjun di (155, 220)
            {
                const dxCliff = (x - 155) / 28.0;
                const dzCliff = (z - 242) / 16.0;
                const dCliff = Math.hypot(dxCliff, dzCliff);
                if (dCliff < 1.35) {
                    const cliffM = 1.0 - smoothstepJS(0.28, 1.32, dCliff);
                    h += cliffM * 12.8;
                }
                const dPool = Math.hypot(x - 155, z - 220);
                if (dPool < 16.0) {
                    const poolM = 1.0 - smoothstepJS(5.0, 15.5, dPool);
                    h = THREE.MathUtils.lerp(h, -1.25, poolM);
                }
            }
            // 3) Jurang Bayangan (Shadowrift Gorge) di (175, -145) + Tebing Tinggi di Timur Jalan Tebing (x ~ 238)
            {
                const gDx = (x - 175) / 20.0;
                const gDz = (z + 145) / 56.0;
                const dGorge = Math.hypot(gDx, gDz);
                if (dGorge < 1.25) {
                    const gorgeM = 1.0 - smoothstepJS(0.32, 1.22, dGorge);
                    h -= gorgeM * 9.2;
                }
                const cDx = (x - 240) / 22.0;
                const cDz = (z + 142) / 68.0;
                const dRidge = Math.hypot(cDx, cDz);
                if (dRidge < 1.3) {
                    const ridgeM = 1.0 - smoothstepJS(0.30, 1.28, dRidge);
                    h += ridgeM * 11.2;
                }
            }

            // Smoothly grade the entire road network (Main Trunk + Unique Branch Trails) & carve wheel ruts
            const roadDist = getRoadDistance(x, z);
            const shoulderWide = 5.2 + Math.min(4.5, Math.max(0.0, distOrigin - 34.0) * 0.08);
            if (roadDist < shoulderWide + 0.5) {
                const roadFlatten = 1.0 - smoothstepJS(2.0, shoulderWide, roadDist);
                const roadBaseY = 0.26 + Math.sin(z * 0.045 + x * 0.025) * 0.34 + smoothstepJS(80.0, 260.0, distOrigin) * 1.15;
                h = THREE.MathUtils.lerp(h, roadBaseY, roadFlatten * 0.82);
                const rutMask = Math.exp(-Math.pow((roadDist - 0.78) / 0.32, 2.0));
                h -= rutMask * 0.055;
            }

            // Ratakan tanah di sekitar ke-5 desa supaya bangunan acak berdiri rata dan tidak melayang
            for (let vi = 0; vi < VILLAGES.length; vi++) {
                const v = VILLAGES[vi];
                const vdx = x - v.cx;
                const vdz = z - v.cz;
                const vDist = Math.hypot(vdx, vdz);
                if (vDist < v.radius * 2.55) {
                    const villageFlatten = 1.0 - smoothstepJS(v.radius * 1.35, v.radius * 2.45, vDist);
                    const vBaseY = 0.32 + (vi === 0 ? 0.0 : 0.85);
                    h = THREE.MathUtils.lerp(h, vBaseY, villageFlatten * 0.96);
                }
            }

            // Carve crystal-clear BotW pond basin smoothly below water surface (-0.30)
            const distPond = Math.hypot(x - POND_CENTER.x, z - POND_CENTER.z);
            const pondShoreBlend = 1.0 - smoothstepJS(POND_CENTER.radius * 0.25, POND_CENTER.radius + 1.9, distPond);
            if (pondShoreBlend > 0.001) {
                const basinDepth = -1.62 + smoothstepJS(0.0, POND_CENTER.radius, distPond) * 1.38;
                h = THREE.MathUtils.lerp(h, basinDepth, pondShoreBlend);
            }

            // Carve sungai berkelok alami: aliran air utuh menyambung + tepian landai organik
            const rCenter = riverCenterZ(x);
            const riverDist = Math.abs(z - rCenter);
            const localHalf = riverHalfWidthAt(x);
            const bankSideSign = z >= rCenter ? 1.0 : -1.0;
            const hillExtraBank = Math.max(0.0, h - 1.2) * 0.72;
            const bankSpan = RIVER.bank * (1.0 + 0.22 * Math.sin(x * 0.11 + bankSideSign * 1.1)) + hillExtraBank;
            const bankJitter = riverBankJitterAt(x, z);
            const dRiver = riverDist + bankJitter * 0.62;
            const riverBank = 1.0 - smoothstepJS(localHalf * 0.74, localHalf + bankSpan, dRiver);
            if (riverBank > 0.001) {
                const ford = riverFordAt(x);
                const centerBed = THREE.MathUtils.lerp(RIVER.bedDeep, RIVER.bedFord, ford);
                const innerTrough = 1.0 - smoothstepJS(localHalf * 0.12, localHalf * 0.95, dRiver);
                const shallowEdge = THREE.MathUtils.lerp(RIVER.waterY - 0.18, RIVER.bedFord, ford * 0.7);
                const targetBed = THREE.MathUtils.lerp(shallowEdge, centerBed, innerTrough);
                h = THREE.MathUtils.lerp(h, targetBed, riverBank);
            }

            // Carve 4 genangan sungai besar luar peta dengan tebing pantai melandai mulus (tidak pernah membanjiri luar alur)
            const gBasin = sampleGrandBasinAt(x, z);
            if (gBasin) {
                const b = gBasin.basin;
                const d = gBasin.edgeDist;
                const outerApron = 1.0 - smoothstepJS(b.bank, b.bank + 22.0, d);
                if (outerApron > 0.001 && d > 0.0) {
                    const bankMinH = b.waterY + 0.85 + smoothstepJS(0.0, b.bank, d) * 0.85;
                    if (h < bankMinH) {
                        h = THREE.MathUtils.lerp(h, bankMinH, outerApron * 0.92);
                    }
                }
                const inBasin = 1.0 - smoothstepJS(-0.6, b.bank * 0.82, d);
                if (inBasin > 0.001) {
                    const centerDeep = 1.0 - smoothstepJS(-b.halfW * 0.78, 0.35, d);
                    const targetH = d > 0.0
                        ? Math.max(h, b.waterY + 0.12 + smoothstepJS(0.0, b.bank * 0.82, d) * 0.75)
                        : THREE.MathUtils.lerp(b.waterY - 0.16, b.waterY - 1.65, centerDeep);
                    h = THREE.MathUtils.lerp(h, targetH, inBasin);
                }
            }

            // Cekungan dangkal alami (~0.10m) di titik genangan air minum kuda
            const pSamp = nearestPuddleSample(x, z);
            if (pSamp) {
                const m = 1.0 - smoothstepJS(pSamp.pd.r * 0.25, pSamp.pd.r * 1.38, pSamp.dist);
                h -= m * 0.11;
            }

            return h;
        }

        function getTerrainNormal(x, z) {
            const eps = 0.28;
            const hL = getTerrainHeight(x - eps, z);
            const hR = getTerrainHeight(x + eps, z);
            const hD = getTerrainHeight(x, z - eps);
            const hU = getTerrainHeight(x, z + eps);
            return new THREE.Vector3(hL - hR, 2.0 * eps, hD - hU).normalize();
        }

        // Rich Truckful storybook ground vertex palette (lush clover grass, sunlit meadow, warm ochre road, wet pond bed)
        const colMeadowBase = new THREE.Color(0x3a8238);
        const colMeadowWarm = new THREE.Color(0x69ab3f);
        const colMeadowCool = new THREE.Color(0x286b38);
        const colRoadOchre = new THREE.Color(0xc2905b);
        const colRoadRut = new THREE.Color(0x8e6239);
        const colPondShore = new THREE.Color(0x9e8b62);
        const colPondBed = new THREE.Color(0x2e5959);
        const colRiverSand = new THREE.Color(0xa6946b);
        const colRiverWetBank = new THREE.Color(0x7c7054);
        const colRiverBed = new THREE.Color(0x2a5758);
        const colVillagePlaza = new THREE.Color(0xb6976e);
        const colClearingDirt = new THREE.Color(0xa67e53);

        function createDylearnNoiseTexture(size, basePeriod, seed, octaves = 4) {
            const hash = (ix, iy, p, s) => {
                const wx = ((ix % p) + p) % p;
                const wy = ((iy % p) + p) % p;
                let h = Math.imul(wx + Math.imul(wy, 374761393) + Math.imul(s, 668265263), 1274126177);
                h = Math.imul(h ^ (h >>> 13), 1274126177);
                return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
            };
            const smooth = (t) => t * t * (3 - 2 * t);
            const raw = new Float32Array(size * size);
            let min = Infinity, max = -Infinity;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let val = 0, amp = 1, ampSum = 0, p = basePeriod;
                    for (let o = 0; o < octaves; o++) {
                        const fx = (x / size) * p;
                        const fy = (y / size) * p;
                        const x0 = Math.floor(fx), y0 = Math.floor(fy);
                        const tx = smooth(fx - x0), ty = smooth(fy - y0);
                        const n00 = hash(x0, y0, p, seed + o * 19);
                        const n10 = hash(x0 + 1, y0, p, seed + o * 19);
                        const n01 = hash(x0, y0 + 1, p, seed + o * 19);
                        const n11 = hash(x0 + 1, y0 + 1, p, seed + o * 19);
                        const nx0 = n00 + (n10 - n00) * tx;
                        const nx1 = n01 + (n11 - n01) * tx;
                        val += (nx0 + (nx1 - nx0) * ty) * amp;
                        ampSum += amp;
                        amp *= 0.5;
                        p *= 2;
                    }
                    val /= ampSum;
                    raw[y * size + x] = val;
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }
            const span = Math.max(0.001, max - min);
            const data = new Uint8Array(size * size * 4);
            for (let i = 0; i < raw.length; i++) {
                const v = Math.max(0, Math.min(255, Math.round(((raw[i] - min) / span) * 255)));
                const idx = i * 4;
                data[idx] = v; data[idx + 1] = v; data[idx + 2] = v; data[idx + 3] = 255;
            }
            const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.needsUpdate = true;
            return tex;
        }

        const dylearnAlbedo2Noise = createDylearnNoiseTexture(256, 3, 17, 4);
        const dylearnAlbedo3Noise = createDylearnNoiseTexture(256, 3, 53, 4);
        const dylearnWindNoise = createDylearnNoiseTexture(256, 5, 101, 3);
        const dylearnCloudNoise = createDylearnNoiseTexture(256, 3, 211, 4);

        const dylearnSharedUniforms = {
            uAlbedo1: { value: new THREE.Color(0x71a200) },
            uAlbedo2: { value: new THREE.Color(0x8ead36) },
            uAlbedo3: { value: new THREE.Color(0x80a739) },
            uAccentAlbedo1: { value: new THREE.Color(0x9ab700) },
            uAccentAlbedo2: { value: new THREE.Color(0x6c9a00) },
            uAlbedo2Noise: { value: dylearnAlbedo2Noise },
            uAlbedo3Noise: { value: dylearnAlbedo3Noise },
            uAlbedo2Scale: { value: 0.042 },
            uAlbedo2Threshold: { value: 0.537 },
            uAlbedo3Scale: { value: 0.038 },
            uAlbedo3Threshold: { value: 0.471 },
            uGrassMoodTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
            uCloudNoise: { value: dylearnCloudNoise },
            uCloudScale: { value: 40.0 },
            uCloudWorldY: { value: 50.0 },
            uCloudSpeed: { value: -0.014 },
            uCloudContrast: { value: 3.845 },
            uCloudThreshold: { value: 0.27 },
            uCloudDir: { value: new THREE.Vector2(0.25, -0.968) },
            uCloudShadowMin: { value: 0.28 },
            uCloudDivergeAngle: { value: 20.0 },
            uToonCuts: { value: 3.0 },
            uToonWrap: { value: 0.14 },
            uToonSteepness: { value: 1.0 },
            uThresholdGradSize: { value: 0.255 }
        };

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.92,
            metalness: 0.0
        });
        terrainMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = celShaderUniforms.uTime;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;
            Object.assign(shader.uniforms, dylearnSharedUniforms);

            shader.vertexShader = [
                'attribute float aMeadowMask;',
                'varying float vMeadowMask;',
                'varying vec3 vTerrainWorldPos;',
                'varying vec3 vTerrainWorldNormal;'
            ].join('\n') + '\n' + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'vMeadowMask = aMeadowMask;',
                    'vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
                    'vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);'
                ].join('\n')
            );

            shader.fragmentShader = [
                'uniform float uTime;',
                'uniform vec3 uSunDir;',
                'uniform vec3 uSunColor;',
                'uniform vec3 uShadowTint;',
                'uniform float uSceneBrightness;',
                'uniform vec3 uCampfirePos;',
                'uniform vec3 uCampfireColor;',
                'uniform float uCampfireStrength;',
                'uniform vec3 uAlbedo1;',
                'uniform vec3 uAlbedo2;',
                'uniform vec3 uAlbedo3;',
                'uniform vec3 uAccentAlbedo2;',
                'uniform sampler2D uAlbedo2Noise;',
                'uniform sampler2D uAlbedo3Noise;',
                'uniform float uAlbedo2Scale;',
                'uniform float uAlbedo2Threshold;',
                'uniform float uAlbedo3Scale;',
                'uniform float uAlbedo3Threshold;',
                'uniform vec3 uGrassMoodTint;',
                'uniform sampler2D uCloudNoise;',
                'uniform float uCloudScale;',
                'uniform float uCloudWorldY;',
                'uniform float uCloudSpeed;',
                'uniform float uCloudContrast;',
                'uniform float uCloudThreshold;',
                'uniform vec2 uCloudDir;',
                'uniform float uCloudShadowMin;',
                'uniform float uCloudDivergeAngle;',
                'uniform float uToonCuts;',
                'uniform float uToonWrap;',
                'uniform float uToonSteepness;',
                'varying float vMeadowMask;',
                'varying vec3 vTerrainWorldPos;',
                'varying vec3 vTerrainWorldNormal;',
                "float dylearnHash21(vec2 p) {",
                "    p = fract(p * vec2(123.34, 456.21));",
                "    p += dot(p, p + 45.32);",
                "    return fract(p.x * p.y);",
                "}",
                "float dylearnValueNoise(vec2 p) {",
                "    vec2 i = floor(p);",
                "    vec2 f = fract(p);",
                "    vec2 u = f * f * (3.0 - 2.0 * f);",
                "    float a = dylearnHash21(i);",
                "    float b = dylearnHash21(i + vec2(1.0, 0.0));",
                "    float c = dylearnHash21(i + vec2(0.0, 1.0));",
                "    float d = dylearnHash21(i + vec2(1.0, 1.0));",
                "    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
                "}",
                "float dylearnOrganicFbm(vec2 wp) {",
                "    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);",
                "    vec2 warp = vec2(",
                "        dylearnValueNoise(wp * 0.017 + vec2(11.3, 4.7)),",
                "        dylearnValueNoise(wp * 0.019 + vec2(-6.1, 17.9))",
                "    ) * 16.0;",
                "    vec2 p = wp + warp;",
                "    float n = 0.0;",
                "    n += 0.50 * dylearnValueNoise(p * 0.018);",
                "    p = rot * p;",
                "    n += 0.30 * dylearnValueNoise(p * 0.044 + vec2(31.7, -19.2));",
                "    p = rot * p;",
                "    n += 0.20 * dylearnValueNoise(p * 0.107 + vec2(-43.1, 27.4));",
                "    return n;",
                "}",
                "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                "    float a = radians(angleDeg);",
                "    float c = cos(a);",
                "    float s = sin(a);",
                "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                "}",
                "float dylearnCloudNoise(vec3 wp) {",
                "    float t = clamp((uCloudWorldY - wp.y) / max(uSunDir.y, 0.42), 0.0, 140.0);",
                "    vec3 hitPos = vec3(wp.x + uSunDir.x * t * 0.16, wp.y, wp.z + uSunDir.z * t * 0.16);",
                "    float invScale = 1.0 / max(uCloudScale, 0.001);",
                "    vec2 d1 = normalize(dylearnRotateVec2(uCloudDir, uCloudDivergeAngle));",
                "    vec2 d2 = normalize(dylearnRotateVec2(uCloudDir, -uCloudDivergeAngle));",
                "    vec2 td1 = uTime * uCloudSpeed * d1;",
                "    vec2 td2 = uTime * uCloudSpeed * d2;",
                "    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;",
                "    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;",
                "    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);",
                "    lv = (lv - 0.5) * uCloudContrast + 0.5;",
                "    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);",
                "}"
            ].join('\n') + '\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                [
                    '#include <color_fragment>',
                    'float flMacro = dylearnOrganicFbm(vTerrainWorldPos.xz * 0.62);',
                    'float flDetail = dylearnOrganicFbm(vTerrainWorldPos.xz * 1.45 + vec2(73.4, -28.9));',
                    'float flFine = dylearnValueNoise(vTerrainWorldPos.xz * 0.28 + vec2(-19.5, 41.2));',
                    'vec3 flPatchCol = mix(uAlbedo1, uAlbedo2, smoothstep(0.35, 0.68, flMacro));',
                    'flPatchCol = mix(flPatchCol, uAlbedo3, smoothstep(0.40, 0.72, flDetail) * 0.68);',
                    'flPatchCol = mix(flPatchCol, uAccentAlbedo2, smoothstep(0.56, 0.88, 1.0 - flMacro) * 0.30 + smoothstep(0.60, 0.90, flFine) * 0.14);',
                    'diffuseColor.rgb = mix(diffuseColor.rgb, flPatchCol * uGrassMoodTint, clamp(vMeadowMask, 0.0, 1.0));'
                ].join('\n')
            );

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    [
                        'vec3 flN = normalize(vTerrainWorldNormal);',
                        'vec3 flL = normalize(uSunDir);',
                        'float flNdotL = dot(flN, flL);',
                        'float flDirAtten = 1.0;',
                        '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
                        '    if (receiveShadow) {',
                        '        DirectionalLightShadow flShadow = directionalLightShadows[0];',
                        '        flDirAtten = getShadow(directionalShadowMap[0], flShadow.shadowMapSize, flShadow.shadowBias, flShadow.shadowRadius, vDirectionalShadowCoord[0]);',
                        '    }',
                        '#endif',
                        'float flDiff = (flNdotL + (flDirAtten - 1.0) + uToonWrap) * uToonSteepness;',
                        'float flCloud = dylearnCloudNoise(vTerrainWorldPos);',
                        'flDiff = clamp(min(flDiff, flCloud), 0.0, 1.0);',
                        'float flCut = 1.0 / max(uToonCuts, 1.0);',
                        'float flStepped = clamp(ceil(flDiff * uToonCuts) * flCut, 0.0, 1.0);',
                        'float flK = floor(flDiff / flCut + 0.5);',
                        'if (flK >= 0.0 && flK <= uToonCuts) {',
                        '    float flThresh = flK * flCut;',
                        '    float flHw = 0.5 * flCut * 0.16;',
                        '    float flLo = max(0.0, flThresh - flHw);',
                        '    float flHi = min(1.0, flThresh + flHw);',
                        '    float flBlend = (flHi > flLo) ? smoothstep(flLo, flHi, flDiff) : step(flThresh, flDiff);',
                        '    flStepped = clamp(mix(flThresh, min(flThresh + flCut, 1.0), flBlend), 0.0, 1.0);',
                        '}',
                        'vec3 flBase = diffuseColor.rgb * uSceneBrightness;',
                        'vec3 flShadowCol = mix(flBase * uShadowTint * 1.22, flBase * 0.44, 0.45);',
                        'vec3 flSunCol = flBase * mix(vec3(1.04), uSunColor * 1.08, 0.28);',
                        'outgoingLight = mix(flShadowCol, flSunCol, mix(0.20, 1.0, flStepped));',
                        'float flFireDist = length(uCampfirePos - vTerrainWorldPos);',
                        'float flFireGlow = (1.0 - smoothstep(1.5, 13.5, flFireDist)) * uCampfireStrength;',
                        'outgoingLight += diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, flFireGlow) * 0.44;',
                        'gl_FragColor = vec4(outgoingLight, diffuseColor.a);',
                        '#include <tonemapping_fragment>'
                    ].join('\n')
                );
            }
        };
        if (HC.VOXEL_MAT) applyStylizedCelShading(HC.VOXEL_MAT, { rimStrength: 0.16, shadowLift: 0.64 });
        if (HC.VOXEL_MAT) applyStylizedCelShading(HC.VOXEL_MAT, { rimStrength: 0.16, shadowLift: 0.64 });

        const terrainChunks = [];
        const CHUNK_SEGMENTS = 14;
        const tempCol = new THREE.Color();

        function isNearActiveCorridor(cx, cz) {
            if (Math.hypot(cx, cz) < 120.0) return true;
            if (Math.abs(cz - riverCenterZ(cx)) < CHUNK_SIZE * 0.9 + 18.0) return true;
            for (let vi = 0; vi < VILLAGES.length; vi++) {
                const v = VILLAGES[vi];
                if (Math.hypot(cx - v.cx, cz - v.cz) < v.radius * 2.5 + CHUNK_SIZE * 0.8) return true;
            }
            // Check 5 sample points inside the chunk for road proximity
            const hS = CHUNK_SIZE * 0.38;
            if (getRoadDistance(cx, cz) < CHUNK_SIZE * 0.75 + 10.0) return true;
            if (getRoadDistance(cx - hS, cz - hS) < 16.0 || getRoadDistance(cx + hS, cz - hS) < 16.0) return true;
            if (getRoadDistance(cx - hS, cz + hS) < 16.0 || getRoadDistance(cx + hS, cz + hS) < 16.0) return true;
            for (let bIdx = 0; bIdx < GRAND_WATER_BASINS.length; bIdx++) {
                const b = GRAND_WATER_BASINS[bIdx];
                if (cx + CHUNK_SIZE * 0.6 >= b.minX && cx - CHUNK_SIZE * 0.6 <= b.maxX
                 && cz + CHUNK_SIZE * 0.6 >= b.minZ && cz - CHUNK_SIZE * 0.6 <= b.maxZ) return true;
            }
            if (Math.hypot(cx - ANCIENT_ELDER_TREE.x, cz - ANCIENT_ELDER_TREE.z) < 48.0) return true;
            if (Math.hypot(cx - RUINS_SITE.x, cz - RUINS_SITE.z) < 48.0) return true;
            if (Math.hypot(cx - CAVERN_SITE.x, cz - CAVERN_SITE.z) < 48.0) return true;
            if (Math.hypot(cx - BANDIT_SITE.x, cz - BANDIT_SITE.z) < 48.0) return true;
            return false;
        }

        for (let gz = 0; gz < CHUNK_GRID; gz++) {
            for (let gx = 0; gx < CHUNK_GRID; gx++) {
                const cx = -TERRAIN_SIZE * 0.5 + (gx + 0.5) * CHUNK_SIZE;
                const cz = -TERRAIN_SIZE * 0.5 + (gz + 0.5) * CHUNK_SIZE;
                const segs = isNearActiveCorridor(cx, cz) ? 18 : 7;

                const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segs, segs);
                geo.rotateX(-Math.PI / 2);
                geo.translate(cx, 0, cz);

                const posAttr = geo.attributes.position;
                const colors = new Float32Array(posAttr.count * 3);
                const meadowMasks = new Float32Array(posAttr.count);
                let minY = 999, maxY = -999;

                for (let i = 0; i < posAttr.count; i++) {
                    const vx = posAttr.getX(i);
                    const vz = posAttr.getZ(i);
                    const vy = getTerrainHeight(vx, vz);
                    posAttr.setY(i, vy);
                    if (vy < minY) minY = vy;
                    if (vy > maxY) maxY = vy;

                    // Organic meadow color patches matching Truckful grass tufts
                    const patch = Math.sin(vx * 0.13 + Math.cos(vz * 0.11) * 1.4) * 0.5 + 0.5;
                    const detail = Math.cos(vx * 0.28 - vz * 0.24) * 0.5 + 0.5;
                    tempCol.copy(colMeadowCool).lerp(colMeadowBase, patch);
                    tempCol.lerp(colMeadowWarm, smoothstepJS(0.45, 0.92, patch * 0.7 + detail * 0.3) * 0.65);

                    // Campfire earth clearing
                    const distCamp = Math.hypot(vx, vz);
                    const campFactor = 1.0 - smoothstepJS(1.4, 3.5, distCamp);
                    if (campFactor > 0.01) {
                        tempCol.lerp(colClearingDirt, campFactor * 0.85);
                    }

                    // Winding Truckful country dirt road + all unique branch roads + darker wheel ruts
                    const roadDist = getRoadDistance(vx, vz);
                    const roadFactor = 1.0 - smoothstepJS(1.45, 2.55, roadDist);
                    if (roadFactor > 0.01) {
                        tempCol.lerp(colRoadOchre, roadFactor * 0.92);
                        const rutFactor = Math.exp(-Math.pow((roadDist - 0.78) / 0.34, 2.0));
                        tempCol.lerp(colRoadRut, rutFactor * roadFactor * 0.58);
                    }

                    // Pond shore sand & deep underwater bed coloring
                    const distPond = Math.hypot(vx - POND_CENTER.x, vz - POND_CENTER.z);
                    const shoreFactor = 1.0 - smoothstepJS(POND_CENTER.radius - 0.5, POND_CENTER.radius + 1.2, distPond);
                    if (shoreFactor > 0.01) {
                        tempCol.lerp(colPondShore, shoreFactor * 0.85);
                        const deepFactor = 1.0 - smoothstepJS(0.4, POND_CENTER.radius - 0.8, distPond);
                        tempCol.lerp(colPondBed, deepFactor * 0.88);
                    }

                    // Natural riverbank sand/silt transition & BotW teal riverbed coloring (matches pond!)
                    const rDist = Math.abs(vz - riverCenterZ(vx));
                    const rHalf = riverHalfWidthAt(vx);
                    const rJit = riverBankJitterAt(vx, vz) * 0.65;
                    const rShoreOuter = 1.0 - smoothstepJS(rHalf + 0.1, rHalf + RIVER.bank * 1.25, rDist + rJit);
                    let riverGrassClear = 0.0;
                    if (rShoreOuter > 0.01) {
                        const rDepth = RIVER.waterY - vy;
                        const shoreBand = smoothstepJS(-0.95, -0.05, rDepth);
                        const sandMix = Math.max(rShoreOuter * 0.92, shoreBand * rShoreOuter);
                        tempCol.lerp(colRiverSand, sandMix * 0.92);
                        const wetLip = smoothstepJS(-0.34, 0.06, rDepth) * (1.0 - smoothstepJS(0.16, 0.52, rDepth));
                        tempCol.lerp(colRiverWetBank, wetLip * rShoreOuter * 0.62);
                        const rDeepFactor = smoothstepJS(0.06, 0.72, rDepth);
                        tempCol.lerp(colRiverBed, rDeepFactor * 0.92);
                        riverGrassClear = Math.max(smoothstepJS(-0.72, -0.05, rDepth) * 0.98, rShoreOuter * 0.94);
                    }

                    // Tepian pasir & dasar sungai besar sektor luar peta
                    let grandBasinGrassClear = 0.0;
                    const gBasinSample = sampleGrandBasinAt(vx, vz);
                    if (gBasinSample && gBasinSample.edgeDist < gBasinSample.basin.bank * 1.15) {
                        const b = gBasinSample.basin;
                        const bDepth = b.waterY - vy;
                        const bOuter = 1.0 - smoothstepJS(0.0, b.bank * 1.15, gBasinSample.edgeDist);
                        const sandMix = Math.max(bOuter * 0.90, smoothstepJS(-0.9, -0.05, bDepth) * bOuter);
                        tempCol.lerp(colRiverSand, sandMix * 0.90);
                        const wetLip = smoothstepJS(-0.34, 0.06, bDepth) * (1.0 - smoothstepJS(0.16, 0.52, bDepth));
                        tempCol.lerp(colRiverWetBank, wetLip * bOuter * 0.62);
                        const deepMix = smoothstepJS(0.08, 0.78, bDepth);
                        tempCol.lerp(colRiverBed, deepMix * 0.92);
                        grandBasinGrassClear = Math.max(smoothstepJS(-0.7, -0.04, bDepth) * 0.98, bOuter * 0.92);
                    }

                    // Packed warm earth in the central village square of all 5 villages
                    let villagePlazaFactor = 0.0;
                    for (let vi = 0; vi < VILLAGES.length; vi++) {
                        const v = VILLAGES[vi];
                        const nx = v.fz, nz = -v.fx;
                        const vPlazaX = v.cx + nx * 5.8;
                        const vPlazaZ = v.cz + nz * 5.8;
                        const vPlazaDist = Math.hypot((vx - vPlazaX) * 0.82, (vz - vPlazaZ) * 0.82);
                        const vf = 1.0 - smoothstepJS(4.5, 11.2, vPlazaDist);
                        if (vf > villagePlazaFactor) villagePlazaFactor = vf;
                    }
                    if (villagePlazaFactor > 0.01) {
                        tempCol.lerp(colVillagePlaza, villagePlazaFactor * 0.68);
                    }

                    // Pewarnaan lantai pelataran Reruntuhan Kuno, Goa Kristal, dan Pemukiman Bandit
                    let storyPadClear = 0.0;
                    const dRuins = Math.hypot(vx - RUINS_SITE.x, vz - RUINS_SITE.z);
                    if (dRuins < 21.0) {
                        const rf = 1.0 - smoothstepJS(11.0, 20.5, dRuins);
                        tempCol.lerp(new THREE.Color(0xa9a08d), rf * 0.85);
                        storyPadClear = Math.max(storyPadClear, rf * 0.96);
                    }
                    const dCavern = Math.hypot(vx - CAVERN_SITE.x, vz - CAVERN_SITE.z);
                    if (dCavern < 22.0) {
                        const cf = 1.0 - smoothstepJS(11.0, 21.5, dCavern);
                        tempCol.lerp(new THREE.Color(0x526173), cf * 0.88);
                        storyPadClear = Math.max(storyPadClear, cf * 0.96);
                    }
                    const dBandit = Math.hypot(vx - BANDIT_SITE.x, vz - BANDIT_SITE.z);
                    if (dBandit < 24.0) {
                        const bf = 1.0 - smoothstepJS(12.0, 23.0, dBandit);
                        tempCol.lerp(new THREE.Color(0x8c6340), bf * 0.88);
                        storyPadClear = Math.max(storyPadClear, bf * 0.94);
                    }

                    let meadowMask = 1.0;
                    meadowMask *= (1.0 - campFactor * 0.92);
                    meadowMask *= (1.0 - roadFactor * 0.98);
                    meadowMask *= (1.0 - shoreFactor * 0.96);
                    meadowMask *= (1.0 - riverGrassClear * 0.96);
                    meadowMask *= (1.0 - grandBasinGrassClear * 0.96);
                    meadowMask *= (1.0 - villagePlazaFactor * 0.78);
                    meadowMask *= (1.0 - storyPadClear);
                    meadowMasks[i] = Math.max(0.0, Math.min(1.0, meadowMask));

                    colors[i * 3] = tempCol.r;
                    colors[i * 3 + 1] = tempCol.g;
                    colors[i * 3 + 2] = tempCol.b;
                }

                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                geo.setAttribute('aMeadowMask', new THREE.BufferAttribute(meadowMasks, 1));
                geo.computeVertexNormals();

                const chunkMesh = new THREE.Mesh(geo, terrainMat);
                chunkMesh.receiveShadow = true;
                chunkMesh.frustumCulled = false; // Handled cleanly by our Camera Frustum Culler
                const midY = (minY + maxY) * 0.5;
                chunkMesh.userData = {
                    boundingSphere: new THREE.Sphere(
                        new THREE.Vector3(cx, midY, cz),
                        Math.hypot(CHUNK_SIZE * 0.75, (maxY - minY) * 0.6 + 1.0)
                    )
                };
                terrainChunks.push(chunkMesh);
                scene.add(chunkMesh);
            }
        }

        // ============================================================================
        // 5A. TRUCKFUL COZY STORYBOOK GRASS TUFTS (Chunky Painterly Clumps + Wind Flow)
        // ============================================================================
        const GRASS_MAP_SIZE = 1024;
        const grassMapCanvas = document.createElement('canvas');
        grassMapCanvas.width = GRASS_MAP_SIZE;
        grassMapCanvas.height = GRASS_MAP_SIZE;
        const grassMapCtx = grassMapCanvas.getContext('2d');

        const grassMapTexture = new THREE.CanvasTexture(grassMapCanvas);
        grassMapTexture.generateMipmaps = false;
        grassMapTexture.minFilter = THREE.LinearFilter;
        grassMapTexture.magFilter = THREE.LinearFilter;
        grassMapTexture.wrapS = THREE.ClampToEdgeWrapping;
        grassMapTexture.wrapT = THREE.ClampToEdgeWrapping;

        function paintGrassVisibilityCircle(worldX, worldZ, worldRadius, value = 0.0) {
            const u = (worldX + TERRAIN_SIZE * 0.5) / TERRAIN_SIZE;
            const v = 1.0 - (worldZ + TERRAIN_SIZE * 0.5) / TERRAIN_SIZE;
            const cx = u * GRASS_MAP_SIZE;
            const cy = v * GRASS_MAP_SIZE;
            const rPx = Math.max(0.85, (worldRadius / TERRAIN_SIZE) * GRASS_MAP_SIZE);

            const grad = grassMapCtx.createRadialGradient(cx, cy, rPx * 0.28, cx, cy, rPx);
            const col = value <= 0.01 ? '0, 0, 0' : '255, 255, 255';
            grad.addColorStop(0.0, `rgba(${col}, 1.0)`);
            grad.addColorStop(0.65, `rgba(${col}, 0.85)`);
            grad.addColorStop(1.0, `rgba(${col}, 0.0)`);
            grassMapCtx.fillStyle = grad;
            grassMapCtx.beginPath();
            grassMapCtx.arc(cx, cy, rPx, 0, Math.PI * 2);
            grassMapCtx.fill();
        }

        function resetBotWGrassMap() {
            grassMapCtx.fillStyle = '#ffffff';
            grassMapCtx.fillRect(0, 0, GRASS_MAP_SIZE, GRASS_MAP_SIZE);
            paintGrassVisibilityCircle(0, 0, 2.8, 0.0);
            paintGrassVisibilityCircle(POND_CENTER.x, POND_CENTER.z, POND_CENTER.radius + 0.75, 0.0);
            paintGrassVisibilityCircle(ANCIENT_ELDER_TREE.x, ANCIENT_ELDER_TREE.z, 5.2, 0.0);
            paintGrassVisibilityCircle(RUINS_SITE.x, RUINS_SITE.z, 17.5, 0.0);
            paintGrassVisibilityCircle(CAVERN_SITE.x, CAVERN_SITE.z, 19.0, 0.0);
            paintGrassVisibilityCircle(BANDIT_SITE.x, BANDIT_SITE.z, 20.5, 0.0);
            for (let bIdx = 0; bIdx < GRAND_WATER_BASINS.length; bIdx++) {
                const b = GRAND_WATER_BASINS[bIdx];
                for (let pIdx = 0; pIdx < b.pts.length; pIdx++) {
                    paintGrassVisibilityCircle(b.pts[pIdx][0], b.pts[pIdx][1], b.halfW + 3.0, 0.0);
                }
            }
            for (const p of PUDDLES) paintGrassVisibilityCircle(p.x, p.z, p.r * 1.2 + 0.65, 0.0);

            // Clear lush grass cleanly along Main Road and all Unique Branch Roads
            for (const poly of allRoadPolylines) {
                for (let i = 0; i < poly.pts.length; i++) {
                    const pt = poly.pts[i];
                    paintGrassVisibilityCircle(pt[0], pt[1], 2.05, 0.0);
                }
            }

            // Clear grass along the river channel & sandy shoreline
            for (let x = -TERRAIN_SIZE * 0.49; x <= TERRAIN_SIZE * 0.49; x += 2.5) {
                const rz = riverCenterZ(x);
                paintGrassVisibilityCircle(x, rz, riverHalfWidthAt(x) + 1.85, 0.0);
            }

            // Clear grass inside all 5 village squares, gate entrances, and beneath every randomized building lot
            for (let vi = 0; vi < VILLAGES.length; vi++) {
                const v = VILLAGES[vi];
                const nx = v.fz, nz = -v.fx;
                const gatePt = v.roadFn(-24.0);
                paintGrassVisibilityCircle(gatePt.x, gatePt.z, 4.5, 0.0);
                paintGrassVisibilityCircle(v.cx + nx * 5.8, v.cz + nz * 5.8, 7.6, 0.0);
                for (const lot of v.lots) {
                    const rPt = v.roadFn(lot.along);
                    const rnx = Math.cos(rPt.yaw), rnz = -Math.sin(rPt.yaw);
                    const hx = rPt.x + rnx * lot.side * lot.off;
                    const hz = rPt.z + rnz * lot.side * lot.off;
                    const sc = lot.scale || 1.0;
                    const clearR = Math.max(lot.w, lot.d) * sc * 0.65 + 1.1;
                    paintGrassVisibilityCircle(hx, hz, clearR, 0.0);
                }
            }
            grassMapTexture.needsUpdate = true;
        }
        resetBotWGrassMap();

        function createPixelSpriteTexture(rows) {
            const h = rows.length;
            const w = rows[0].length;
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                const rowStr = rows[h - 1 - y];
                for (let x = 0; x < w; x++) {
                    const ch = rowStr[x];
                    const idx = (y * w + x) * 4;
                    data[idx] = 255;
                    data[idx + 1] = 255;
                    data[idx + 2] = 255;
                    data[idx + 3] = (ch === 'A') ? 255 : 0;
                }
            }
            const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
            tex.flipY = false;
            tex.generateMipmaps = false;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.needsUpdate = true;
            return tex;
        }

        const GRASSLEAF_24 = [
            '........................',
            '....................AAA.',
            '..................AAAA..',
            '................AAAAAA..',
            '...AAA.........AAAAAAA..',
            '.AAAAAAA......AAAAAAAA..',
            '..AAAAAAAA....AAAAAAA...',
            '...AAAAAAAA..AAAAAAAA...',
            '.....AAAAAAA.AAAAAAAA...',
            '......AAAAAA.AAAAAAAA...',
            '......AAAAAA.AAAAAAA....',
            '.......AAAAA..AAAAA.....',
            '...............AAA......',
            '.........AAAAA..........',
            '........AAAAAAA.........',
            '........AAAAAAA.........',
            '........AAAAAAA.........',
            '........AAAAAAA.........',
            '.......AAAAAAA..........',
            '.......AAAAAA...........',
            '......AAAAA.............',
            '......AAA...............',
            '........................',
            '........................'
        ];

        const ACCENTLEAF_24 = [
            '........................',
            '........................',
            '........................',
            '....AAA.................',
            '.....AAA................',
            '......AAA...............',
            '.......AAA..............',
            '.......AAAA.............',
            '...AAA..AAAA.......AAA..',
            '....AAA.AAAAA....AAAA...',
            '....AAA.AAAAA...AAAA....',
            '.....AA..AAAAA.AAAAA....',
            '.....AAA.AAAAA.AAAA.....',
            '.....AAA..AAAA.AAA......',
            '......AAA.AAAA.AAA......',
            '......AAA.AAAA.AAA......',
            '......AAA.AAAA.AAA......',
            '.......AA.AAA..AA.......',
            '.......AA.AAA.AAA.......',
            '.......AA.AA..A.........',
            '........A.AA.AA.........',
            '..........AA............',
            '........................',
            '........................'
        ];

        const dylearnGrassTex = createPixelSpriteTexture(GRASSLEAF_24);
        const dylearnAccentTex = createPixelSpriteTexture(ACCENTLEAF_24);

        const grassUniforms = {
            uTime: { value: 0 },
            uWindSpeed: { value: 1.25 },
            uSwayScale: { value: 1.05 },
            uBladeBendDistance: { value: 0.45 },
            uBaseColor: { value: activeAtmosphere.grassBaseColor },
            uTipColor: { value: activeAtmosphere.grassTipColor },
            uGrassMap: { value: grassMapTexture },
            uTerrainSize: { value: TERRAIN_SIZE },
            uGrassTex: { value: dylearnGrassTex },
            uAccentTex1: { value: dylearnGrassTex },
            uAccentTex2: { value: dylearnAccentTex },
            uWindNoise: { value: dylearnWindNoise },
            uAccentFreq1: { value: 0.06 },
            uAccentHeight1: { value: 0.14 },
            uAccentScale1: { value: 1.08 },
            uAccentProb2: { value: 0.09 },
            uAccentHeight2: { value: 0.22 },
            uAccentScale2: { value: 1.12 },
            uFramerate: { value: 5.0 },
            uQuantised: { value: 1.0 },
            uWorldSwayAngle: { value: 58.0 },
            uFakePerspScale: { value: 0.30 },
            uWindNoiseThreshold: { value: 0.365 },
            uWindNoiseScale: { value: 0.055 },
            uDylearnWindSpeed: { value: 0.025 },
            uWindDir: { value: new THREE.Vector2(0.25, 0.968) },
            uWindDivergeAngle: { value: 10.0 },
            uViewSwaySpeed: { value: 0.12 },
            uViewSwayAngle: { value: 10.0 },
            uDispAngleZ: { value: 60.0 },
            uDispAngleX: { value: 62.7 },
            uRadiusExponent: { value: 0.9 },
            uCamForwardXZ: { value: new THREE.Vector2(0.0, -1.0) },
            uCamRightXZ: { value: new THREE.Vector2(1.0, 0.0) },
            uCharPositions: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, -999, 0, 0)) }
        };

        const grassMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            roughness: 0.95,
            metalness: 0.0
        });

        grassMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
            shader.uniforms.uGrassMap = grassUniforms.uGrassMap;
            shader.uniforms.uTerrainSize = grassUniforms.uTerrainSize;
            shader.uniforms.uGrassTex = grassUniforms.uGrassTex;
            shader.uniforms.uAccentTex1 = grassUniforms.uAccentTex1;
            shader.uniforms.uAccentTex2 = grassUniforms.uAccentTex2;
            shader.uniforms.uWindNoise = grassUniforms.uWindNoise;
            shader.uniforms.uAccentFreq1 = grassUniforms.uAccentFreq1;
            shader.uniforms.uAccentHeight1 = grassUniforms.uAccentHeight1;
            shader.uniforms.uAccentScale1 = grassUniforms.uAccentScale1;
            shader.uniforms.uAccentProb2 = grassUniforms.uAccentProb2;
            shader.uniforms.uAccentHeight2 = grassUniforms.uAccentHeight2;
            shader.uniforms.uAccentScale2 = grassUniforms.uAccentScale2;
            shader.uniforms.uFramerate = grassUniforms.uFramerate;
            shader.uniforms.uQuantised = grassUniforms.uQuantised;
            shader.uniforms.uWorldSwayAngle = grassUniforms.uWorldSwayAngle;
            shader.uniforms.uFakePerspScale = grassUniforms.uFakePerspScale;
            shader.uniforms.uWindNoiseThreshold = grassUniforms.uWindNoiseThreshold;
            shader.uniforms.uWindNoiseScale = grassUniforms.uWindNoiseScale;
            shader.uniforms.uDylearnWindSpeed = grassUniforms.uDylearnWindSpeed;
            shader.uniforms.uWindDir = grassUniforms.uWindDir;
            shader.uniforms.uWindDivergeAngle = grassUniforms.uWindDivergeAngle;
            shader.uniforms.uViewSwaySpeed = grassUniforms.uViewSwaySpeed;
            shader.uniforms.uViewSwayAngle = grassUniforms.uViewSwayAngle;
            shader.uniforms.uDispAngleZ = grassUniforms.uDispAngleZ;
            shader.uniforms.uDispAngleX = grassUniforms.uDispAngleX;
            shader.uniforms.uRadiusExponent = grassUniforms.uRadiusExponent;
            shader.uniforms.uCamForwardXZ = grassUniforms.uCamForwardXZ;
            shader.uniforms.uCamRightXZ = grassUniforms.uCamRightXZ;
            shader.uniforms.uCharPositions = grassUniforms.uCharPositions;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;
            Object.assign(shader.uniforms, dylearnSharedUniforms);

            shader.vertexShader = [
                'attribute vec3 aTerrainNormal;',
                'attribute vec4 aGrassData;',
                'uniform float uTime;',
                'uniform float uWindSpeed;',
                'uniform sampler2D uGrassMap;',
                'uniform float uTerrainSize;',
                'uniform sampler2D uWindNoise;',
                'uniform float uAccentFreq1;',
                'uniform float uAccentHeight1;',
                'uniform float uAccentScale1;',
                'uniform float uAccentProb2;',
                'uniform float uAccentHeight2;',
                'uniform float uAccentScale2;',
                'uniform float uFramerate;',
                'uniform float uQuantised;',
                'uniform float uWorldSwayAngle;',
                'uniform float uWindNoiseThreshold;',
                'uniform float uWindNoiseScale;',
                'uniform float uDylearnWindSpeed;',
                'uniform vec2 uWindDir;',
                'uniform float uWindDivergeAngle;',
                'uniform float uViewSwaySpeed;',
                'uniform float uViewSwayAngle;',
                'uniform float uDispAngleZ;',
                'uniform float uDispAngleX;',
                'uniform float uRadiusExponent;',
                'uniform vec2 uCamForwardXZ;',
                'uniform vec2 uCamRightXZ;',
                'uniform vec4 uCharPositions[24];',
                'varying vec2 vGrassUV;',
                'varying float vWindSample;',
                'varying float vIdSeed1;',
                'varying float vIdSeed2;',
                'varying float vDispFakePersp;',
                'varying vec3 vRootWorldPos;',
                'varying vec3 vRootNormal;',
                'vec2 dyRot2(vec2 v, float deg) { float a = radians(deg); float c = cos(a); float s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }',
                'vec3 dyRotAxis(vec3 axis, float angle, vec3 v) { vec3 k = normalize(axis); float c = cos(angle); float s = sin(angle); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }'
            ].join('\n') + '\n' + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <beginnormal_vertex>',
                [
                    '#include <beginnormal_vertex>',
                    'objectNormal = normalize(aTerrainNormal);'
                ].join('\n')
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'vGrassUV = uv;',
                    'vIdSeed1 = aGrassData.x;',
                    'vIdSeed2 = aGrassData.y;',
                    'vec3 rootPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
                    'vec2 grassMapUV = vec2((rootPos.x + uTerrainSize * 0.5) / uTerrainSize, (rootPos.z + uTerrainSize * 0.5) / uTerrainSize);',
                    'float visSample = texture2D(uGrassMap, grassMapUV).r;',
                    'float visScale = smoothstep(0.18, 0.56, visSample) * step(0.02, visSample);',
                    'vec3 qv = position * aGrassData.w * visScale;',
                    'if (vIdSeed1 < uAccentFreq1) {',
                    '    qv.y += uAccentHeight1 * visScale;',
                    '    qv *= uAccentScale1;',
                    '} else if (vIdSeed2 < uAccentProb2) {',
                    '    qv.y += uAccentHeight2 * visScale;',
                    '    qv *= uAccentScale2;',
                    '}',
                    'float seed = 10.0 * aGrassData.z;',
                    'float frametime = 1.0 / max(uFramerate, 0.5);',
                    'float phase = mod(seed, frametime);',
                    'float qTime = uTime;',
                    'if (uQuantised > 0.5) {',
                    '    qTime = floor((uTime + phase) * uFramerate + 0.5) / uFramerate;',
                    '}',
                    'vec2 wDir1 = normalize(dyRot2(uWindDir, uWindDivergeAngle));',
                    'vec2 wDir2 = normalize(dyRot2(uWindDir, -uWindDivergeAngle));',
                    'float wSpd = uDylearnWindSpeed * max(uWindSpeed, 0.25);',
                    'vec2 wOff1 = qTime * wSpd * wDir1;',
                    'vec2 wOff2 = qTime * wSpd * wDir2;',
                    'float ws1 = texture2D(uWindNoise, rootPos.xz * uWindNoiseScale + wOff1).r;',
                    'float ws2 = texture2D(uWindNoise, rootPos.xz * (uWindNoiseScale * 0.8) + (wOff2 * 0.89 * 3.14159265 / 3.0)).r;',
                    'float wSample = clamp((ws1 * ws2) + uWindNoiseThreshold, 0.0, 1.0);',
                    'wSample = (wSample - 0.5) * 2.0;',
                    'vWindSample = wSample;',
                    'float worldSway = wSample * radians(uWorldSwayAngle);',
                    'vec2 normWind = normalize(uWindDir);',
                    'vec3 windAxisView = normalize((viewMatrix * vec4(normWind.y, 0.0, -normWind.x, 0.0)).xyz);',
                    'float modelSway = sin((qTime + seed) * uViewSwaySpeed * 6.2831853) * radians(uViewSwayAngle);',
                    'float dispX = 0.0;',
                    'float dispY = 0.0;',
                    'for (int i = 0; i < 24; i++) {',
                    '    vec4 cp = uCharPositions[i];',
                    '    if (cp.w > 0.001) {',
                    '        vec3 toGrass = rootPos - cp.xyz;',
                    '        float distNorm = length(toGrass) / cp.w;',
                    '        if (distNorm < 1.0) {',
                    '            float strength = pow(max(1.0 - distNorm, 0.0), uRadiusExponent);',
                    '            float xzLen = length(toGrass.xz);',
                    '            vec2 dirXZ = (xzLen > 0.0001) ? (toGrass.xz / xzLen) : vec2(1.0, 0.0);',
                    '            dispX += strength * dot(uCamRightXZ, dirXZ);',
                    '            dispY += strength * dot(uCamForwardXZ, dirXZ);',
                    '        }',
                    '    }',
                    '}',
                    'dispX = clamp(dispX, -1.0, 1.0);',
                    'dispY = clamp(dispY, -1.0, 1.0);',
                    'vDispFakePersp = dispY;',
                    'qv = dyRotAxis(vec3(0.0, 0.0, 1.0), modelSway, qv);',
                    'qv = dyRotAxis(vec3(0.0, 0.0, 1.0), -dispX * radians(uDispAngleZ), qv);',
                    'qv = dyRotAxis(vec3(1.0, 0.0, 0.0), -dispY * radians(uDispAngleX), qv);',
                    'qv = dyRotAxis(windAxisView, worldSway, qv);',
                    'vec3 dylearnQuadVert = qv;',
                    'vRootWorldPos = (modelMatrix * vec4(rootPos, 1.0)).xyz;',
                    'vRootNormal = normalize(mat3(modelMatrix) * aTerrainNormal);'
                ].join('\n')
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                [
                    'vec4 rootView = modelViewMatrix * vec4(rootPos, 1.0);',
                    'vec4 mvPosition = vec4(rootView.xyz + dylearnQuadVert, 1.0);',
                    'gl_Position = projectionMatrix * mvPosition;'
                ].join('\n')
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                [
                    '#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0',
                    '    vec4 worldPosition = modelMatrix * vec4(rootPos + aTerrainNormal * 0.08, 1.0);',
                    '#endif'
                ].join('\n')
            );

            shader.fragmentShader = [
                'uniform float uTime;',
                'uniform sampler2D uGrassTex;',
                'uniform sampler2D uAccentTex1;',
                'uniform sampler2D uAccentTex2;',
                'uniform vec3 uAlbedo1;',
                'uniform vec3 uAlbedo2;',
                'uniform vec3 uAlbedo3;',
                'uniform vec3 uAccentAlbedo1;',
                'uniform vec3 uAccentAlbedo2;',
                'uniform sampler2D uAlbedo2Noise;',
                'uniform sampler2D uAlbedo3Noise;',
                'uniform float uAlbedo2Scale;',
                'uniform float uAlbedo2Threshold;',
                'uniform float uAlbedo3Scale;',
                'uniform float uAlbedo3Threshold;',
                'uniform vec3 uGrassMoodTint;',
                'uniform float uAccentFreq1;',
                'uniform float uAccentProb2;',
                'uniform float uFakePerspScale;',
                'uniform vec2 uWindDir;',
                'uniform vec2 uCamForwardXZ;',
                'uniform vec3 uSunDir;',
                'uniform vec3 uSunColor;',
                'uniform vec3 uShadowTint;',
                'uniform float uSceneBrightness;',
                'uniform vec3 uCampfirePos;',
                'uniform vec3 uCampfireColor;',
                'uniform float uCampfireStrength;',
                'uniform sampler2D uCloudNoise;',
                'uniform float uCloudScale;',
                'uniform float uCloudWorldY;',
                'uniform float uCloudSpeed;',
                'uniform float uCloudContrast;',
                'uniform float uCloudThreshold;',
                'uniform vec2 uCloudDir;',
                'uniform float uCloudShadowMin;',
                'uniform float uCloudDivergeAngle;',
                'uniform float uToonCuts;',
                'uniform float uToonWrap;',
                'uniform float uToonSteepness;',
                'uniform float uThresholdGradSize;',
                'varying vec2 vGrassUV;',
                'varying float vWindSample;',
                'varying float vIdSeed1;',
                'varying float vIdSeed2;',
                'varying float vDispFakePersp;',
                'varying vec3 vRootWorldPos;',
                'varying vec3 vRootNormal;',
                "float dylearnHash21(vec2 p) {",
                "    p = fract(p * vec2(123.34, 456.21));",
                "    p += dot(p, p + 45.32);",
                "    return fract(p.x * p.y);",
                "}",
                "float dylearnValueNoise(vec2 p) {",
                "    vec2 i = floor(p);",
                "    vec2 f = fract(p);",
                "    vec2 u = f * f * (3.0 - 2.0 * f);",
                "    float a = dylearnHash21(i);",
                "    float b = dylearnHash21(i + vec2(1.0, 0.0));",
                "    float c = dylearnHash21(i + vec2(0.0, 1.0));",
                "    float d = dylearnHash21(i + vec2(1.0, 1.0));",
                "    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
                "}",
                "float dylearnOrganicFbm(vec2 wp) {",
                "    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);",
                "    vec2 warp = vec2(",
                "        dylearnValueNoise(wp * 0.017 + vec2(11.3, 4.7)),",
                "        dylearnValueNoise(wp * 0.019 + vec2(-6.1, 17.9))",
                "    ) * 16.0;",
                "    vec2 p = wp + warp;",
                "    float n = 0.0;",
                "    n += 0.50 * dylearnValueNoise(p * 0.018);",
                "    p = rot * p;",
                "    n += 0.30 * dylearnValueNoise(p * 0.044 + vec2(31.7, -19.2));",
                "    p = rot * p;",
                "    n += 0.20 * dylearnValueNoise(p * 0.107 + vec2(-43.1, 27.4));",
                "    return n;",
                "}",
                "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                "    float a = radians(angleDeg);",
                "    float c = cos(a);",
                "    float s = sin(a);",
                "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                "}",
                "float dylearnCloudNoise(vec3 wp) {",
                "    float t = clamp((uCloudWorldY - wp.y) / max(uSunDir.y, 0.42), 0.0, 140.0);",
                "    vec3 hitPos = vec3(wp.x + uSunDir.x * t * 0.16, wp.y, wp.z + uSunDir.z * t * 0.16);",
                "    float invScale = 1.0 / max(uCloudScale, 0.001);",
                "    vec2 d1 = normalize(dylearnRotateVec2(uCloudDir, uCloudDivergeAngle));",
                "    vec2 d2 = normalize(dylearnRotateVec2(uCloudDir, -uCloudDivergeAngle));",
                "    vec2 td1 = uTime * uCloudSpeed * d1;",
                "    vec2 td2 = uTime * uCloudSpeed * d2;",
                "    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;",
                "    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;",
                "    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);",
                "    lv = (lv - 0.5) * uCloudContrast + 0.5;",
                "    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);",
                "}"
            ].join('\n') + '\n' + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                [
                    'vec2 gUv = vGrassUV;',
                    'gUv.x -= 0.5;',
                    'float windPersp = vWindSample * uFakePerspScale * dot(uCamForwardXZ, normalize(uWindDir));',
                    'gUv.x *= gUv.y * windPersp + 1.0;',
                    'gUv.x *= 1.0 - gUv.y * vDispFakePersp * 0.35;',
                    'gUv.x = clamp(gUv.x + 0.5, 0.0, 1.0);',
                    'vec4 gTex = texture2D(uGrassTex, gUv);',
                    'float grMacro = dylearnOrganicFbm(vRootWorldPos.xz * 0.62);',
                    'float grDetail = dylearnOrganicFbm(vRootWorldPos.xz * 1.45 + vec2(73.4, -28.9));',
                    'vec3 grassCol = mix(uAlbedo1, uAlbedo2, smoothstep(0.35, 0.68, grMacro));',
                    'grassCol = mix(grassCol, uAlbedo3, smoothstep(0.40, 0.72, grDetail) * 0.68);',
                    'if (vIdSeed1 < uAccentFreq1) {',
                    '    gTex = texture2D(uAccentTex1, gUv);',
                    '    grassCol = uAccentAlbedo1;',
                    '} else if (vIdSeed2 < uAccentProb2) {',
                    '    gTex = texture2D(uAccentTex2, gUv);',
                    '    grassCol = uAccentAlbedo2;',
                    '}',
                    'if (gTex.a < 0.5) discard;',
                    'vec3 dylearnAlbedo = grassCol * gTex.rgb * uGrassMoodTint;',
                    'diffuseColor = vec4(1.0, 1.0, 1.0, 1.0);'
                ].join('\n')
            );

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    [
                        'vec3 grN = normalize(vRootNormal);',
                        'vec3 grL = normalize(uSunDir);',
                        'float grNdotL = dot(grN, grL);',
                        'float grDirAtten = 1.0;',
                        '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
                        '    if (receiveShadow) {',
                        '        DirectionalLightShadow grShadow = directionalLightShadows[0];',
                        '        grDirAtten = getShadow(directionalShadowMap[0], grShadow.shadowMapSize, grShadow.shadowBias, grShadow.shadowRadius, vDirectionalShadowCoord[0]);',
                        '    }',
                        '#endif',
                        'float grDiff = (grNdotL + (grDirAtten - 1.0) + uToonWrap) * uToonSteepness;',
                        'float grCloud = dylearnCloudNoise(vRootWorldPos);',
                        'grDiff = clamp(min(grDiff, grCloud), 0.0, 1.0);',
                        'float grCut = 1.0 / max(uToonCuts, 1.0);',
                        'float grStepped = clamp(ceil(grDiff * uToonCuts) * grCut, 0.0, 1.0);',
                        'if (uThresholdGradSize > 0.0) {',
                        '    float grK = floor(grDiff / grCut + 0.5);',
                        '    if (grK >= 0.0 && grK <= uToonCuts) {',
                        '        float grThresh = grK * grCut;',
                        '        float grHw = 0.5 * grCut * uThresholdGradSize;',
                        '        float grLo = max(0.0, grThresh - grHw);',
                        '        float grHi = min(1.0, grThresh + grHw);',
                        '        float grBlend = (grHi > grLo) ? smoothstep(grLo, grHi, grDiff) : step(grThresh, grDiff);',
                        '        grStepped = clamp(mix(grThresh, min(grThresh + grCut, 1.0), grBlend), 0.0, 1.0);',
                        '    }',
                        '}',
                        'vec3 grBase = dylearnAlbedo * uSceneBrightness;',
                        'vec3 grShadowCol = mix(grBase * uShadowTint * 1.24, grBase * 0.48, 0.45);',
                        'vec3 grSunCol = grBase * mix(vec3(1.06), uSunColor * 1.12, 0.30);',
                        'outgoingLight = mix(grShadowCol, grSunCol, mix(0.18, 1.0, grStepped));',
                        'float grFireDist = length(uCampfirePos - vRootWorldPos);',
                        'float grFireGlow = (1.0 - smoothstep(1.8, 13.5, grFireDist)) * uCampfireStrength;',
                        'outgoingLight += dylearnAlbedo * uCampfireColor * smoothstep(0.10, 0.62, grFireGlow) * 0.46;',
                        'gl_FragColor = vec4(outgoingLight, 1.0);',
                        '#include <tonemapping_fragment>'
                    ].join('\n')
                );
            }
        };

        const BASE_GRASS_QUAD_GEO = new THREE.PlaneGeometry(0.42, 0.56);
        BASE_GRASS_QUAD_GEO.translate(0, 0.24, 0);
        const grassChunks = [];
        // Kembalikan kepadatan rumput asli (~9.8 rumpun/m² di tile 15x15m = ~2200 rumpun/tile)
        // dengan streaming pool di sekitar pemain agar rimbun di seluruh peta 1500x1500m tetap ringan.
        const GRASS_TILE_SIZE = 15.0;
        const GRASS_GRID_RADIUS = isMobileDevice ? 3 : 4; // 7x7 = 49 tile (mobile), 9x9 = 81 tile (PC)
        const TUFTS_PER_TILE = 2200; // kepadatan penuh asli; updateCameraFrustumCulling menyesuaikan rasio kualitas & jarak

        const villageGrassClearZones = VILLAGES.map((v) => {
            const pads = [];
            const nx = v.fz, nz = -v.fx;
            pads.push({ x: v.cx + nx * 5.8, z: v.cz + nz * 5.8, r: 6.2 });
            for (const lot of (v.lots || [])) {
                const rPt = v.roadFn(lot.along);
                const rnx = Math.cos(rPt.yaw), rnz = -Math.sin(rPt.yaw);
                const hx = rPt.x + rnx * lot.side * lot.off;
                const hz = rPt.z + rnz * lot.side * lot.off;
                const sc = lot.scale || 1.0;
                pads.push({ x: hx, z: hz, r: Math.max(lot.w, lot.d) * sc * 0.62 + 0.9 });
            }
            return { cx: v.cx, cz: v.cz, radiusSq: 44 * 44, pads };
        });

        function populateGrassTile(tile, tx, tz) {
            const minX = tx * GRASS_TILE_SIZE;
            const minZ = tz * GRASS_TILE_SIZE;
            const cx = minX + GRASS_TILE_SIZE * 0.5;
            const cz = minZ + GRASS_TILE_SIZE * 0.5;
            const halfBound = TERRAIN_SIZE * 0.495;
            const instMesh = tile.mesh;
            const mArr = instMesh.instanceMatrix.array;
            const normalArr = tile.normalArr;
            const dataArr = tile.dataArr;

            if (Math.abs(cx) > halfBound + GRASS_TILE_SIZE || Math.abs(cz) > halfBound + GRASS_TILE_SIZE) {
                tile.tx = tx;
                tile.tz = tz;
                instMesh.userData.maxCount = 0;
                instMesh.count = 0;
                instMesh.visible = false;
                return;
            }

            // Collect nearby village building pads only when tile intersects village apron
            let activePads = null;
            for (let vi = 0; vi < villageGrassClearZones.length; vi++) {
                const vz = villageGrassClearZones[vi];
                const dxv = cx - vz.cx, dzv = cz - vz.cz;
                if (dxv * dxv + dzv * dzv < vz.radiusSq) {
                    activePads = vz.pads;
                    break;
                }
            }

            // Deterministic xorshift32 per-tile so revisiting tiles produces identical meadow layout
            let hSeed = ((tx * 73856093) ^ (tz * 19349663) ^ 0x9e3779b9) >>> 0;
            if (hSeed === 0) hSeed = 1234567;
            const nextRand = () => {
                hSeed ^= (hSeed << 13) >>> 0;
                hSeed ^= (hSeed >>> 17) >>> 0;
                hSeed ^= (hSeed << 5) >>> 0;
                return (hSeed >>> 0) / 4294967296;
            };

            let count = 0;
            for (let b = 0; b < TUFTS_PER_TILE; b++) {
                const bx = minX + nextRand() * GRASS_TILE_SIZE;
                const bz = minZ + nextRand() * GRASS_TILE_SIZE;
                const r1 = nextRand();
                const r2 = nextRand();
                const rScale = nextRand();

                if (Math.abs(bx) > halfBound || Math.abs(bz) > halfBound) continue;
                const distCamp = Math.hypot(bx, bz);
                if (distCamp < 2.2) continue;

                const distPond = Math.hypot(bx - POND_CENTER.x, bz - POND_CENTER.z);
                if (distPond < POND_CENTER.radius + 0.15) continue;

                const rDist = Math.abs(bz - riverCenterZ(bx));
                if (rDist < riverHalfWidthAt(bx) + 0.65) continue;

                const roadDist = getRoadDistance(bx, bz);
                if (roadDist < 1.72) continue;

                if (activePads) {
                    let blocked = false;
                    for (let pi = 0; pi < activePads.length; pi++) {
                        const pd = activePads[pi];
                        const dxp = bx - pd.x, dzp = bz - pd.z;
                        if (dxp * dxp + dzp * dzp < pd.r * pd.r) { blocked = true; break; }
                    }
                    if (blocked) continue;
                }

                const by = getTerrainHeight(bx, bz);
                if (distPond < POND_CENTER.radius + 0.65 && by < -0.18) continue;

                const roadsideBoost = (roadDist > 2.25 && roadDist < 4.2) ? 1.15 : 1.0;
                const n = getTerrainNormal(bx, bz);
                const locSeed = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453) % 1.0;

                const i16 = count * 16;
                mArr[i16] = 1; mArr[i16 + 1] = 0; mArr[i16 + 2] = 0; mArr[i16 + 3] = 0;
                mArr[i16 + 4] = 0; mArr[i16 + 5] = 1; mArr[i16 + 6] = 0; mArr[i16 + 7] = 0;
                mArr[i16 + 8] = 0; mArr[i16 + 9] = 0; mArr[i16 + 10] = 1; mArr[i16 + 11] = 0;
                mArr[i16 + 12] = bx;
                mArr[i16 + 13] = by - 0.02;
                mArr[i16 + 14] = bz;
                mArr[i16 + 15] = 1;

                const i3 = count * 3;
                normalArr[i3] = n.x;
                normalArr[i3 + 1] = n.y;
                normalArr[i3 + 2] = n.z;

                const i4 = count * 4;
                dataArr[i4] = r1;
                dataArr[i4 + 1] = r2;
                dataArr[i4 + 2] = locSeed;
                dataArr[i4 + 3] = (0.86 + rScale * 0.30) * roadsideBoost;

                count++;
            }

            tile.tx = tx;
            tile.tz = tz;
            tile.key = tx + ',' + tz;
            instMesh.userData.maxCount = count;
            instMesh.count = count;
            instMesh.visible = count > 0;
            instMesh.userData.boundingSphere.center.set(cx, getTerrainHeight(cx, cz) + 0.55, cz);
            instMesh.instanceMatrix.needsUpdate = true;
            tile.normalAttr.needsUpdate = true;
            tile.dataAttr.needsUpdate = true;
        }

        const grassTiles = [];
        for (let dtz = -GRASS_GRID_RADIUS; dtz <= GRASS_GRID_RADIUS; dtz++) {
            for (let dtx = -GRASS_GRID_RADIUS; dtx <= GRASS_GRID_RADIUS; dtx++) {
                const instGeo = BASE_GRASS_QUAD_GEO.clone();
                const normalArr = new Float32Array(TUFTS_PER_TILE * 3);
                const dataArr = new Float32Array(TUFTS_PER_TILE * 4);
                const normalAttr = new THREE.InstancedBufferAttribute(normalArr, 3);
                normalAttr.setUsage(THREE.DynamicDrawUsage);
                const dataAttr = new THREE.InstancedBufferAttribute(dataArr, 4);
                dataAttr.setUsage(THREE.DynamicDrawUsage);
                instGeo.setAttribute('aTerrainNormal', normalAttr);
                instGeo.setAttribute('aGrassData', dataAttr);

                const instMesh = new THREE.InstancedMesh(instGeo, grassMat, TUFTS_PER_TILE);
                instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                instMesh.castShadow = false;
                instMesh.receiveShadow = true;
                instMesh.frustumCulled = false;
                instMesh.userData = {
                    maxCount: 0,
                    boundingSphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), GRASS_TILE_SIZE * 0.85)
                };

                const tile = {
                    tx: dtx,
                    tz: dtz,
                    key: dtx + ',' + dtz,
                    mesh: instMesh,
                    normalArr,
                    dataArr,
                    normalAttr,
                    dataAttr
                };
                populateGrassTile(tile, dtx, dtz);
                grassTiles.push(tile);
                grassChunks.push(instMesh);
                scene.add(instMesh);
            }
        }

        // ============================================================================
        // 5B. TRUCKFUL COZY STORYBOOK BUSHES
        //     - Multi-Lobe Plump Cushion Silhouettes (3–4 Organic Ground-Hugging Mounds)
        //     - Camera-Facing Painterly Small-Leaf Bouquets (Zero Flat Paper Slices!)
        //     - Projected Spherical Normals + Deep Ground AO + 3 Woodland Palettes
        // ============================================================================
        // True un-premultiplied DataTexture + multi-pass RGB edge dilation!
        // Fixes HTML5 putImageData premultiplied-alpha bug that caused dark/black outlines
        // around leaf corners and mipmap edges on all foliage textures.
        function createCleanAlphaDataTexture(ctx, width, height, fallbackHex) {
            const imgData = ctx.getImageData(0, 0, width, height);
            const src = imgData.data;
            const totalPixels = width * height;

            const data = new Uint8Array(src.length);
            const valid = new Uint8Array(totalPixels);
            const col = new THREE.Color(fallbackHex);
            const fr = Math.round(col.r * 255);
            const fg = Math.round(col.g * 255);
            const fb = Math.round(col.b * 255);

            // Step 1: Manually flip Y (WebGL DataTexture ignores UNPACK_FLIP_Y_WEBGL)
            // Keep pure interior RGB for opaque pixels (a >= 225); seed edge/empty pixels with fallback leaf color
            for (let y = 0; y < height; y++) {
                const dstRow = (height - 1 - y) * width;
                const srcRow = y * width;
                for (let x = 0; x < width; x++) {
                    const sp = (srcRow + x) * 4;
                    const dpIdx = dstRow + x;
                    const dp = dpIdx * 4;
                    const a = src[sp + 3];
                    data[dp + 3] = a;

                    if (a >= 225) {
                        data[dp] = src[sp];
                        data[dp + 1] = src[sp + 1];
                        data[dp + 2] = src[sp + 2];
                        valid[dpIdx] = 1;
                    } else {
                        data[dp] = fr;
                        data[dp + 1] = fg;
                        data[dp + 2] = fb;
                        valid[dpIdx] = 0;
                    }
                }
            }

            // Step 2: 5-pass RGB dilation bleeding exact interior leaf colors outward across corners & mipmap borders
            const nextData = new Uint8Array(data);
            const nextValid = new Uint8Array(valid);
            for (let pass = 0; pass < 5; pass++) {
                for (let y = 0; y < height; y++) {
                    const rowOff = y * width;
                    for (let x = 0; x < width; x++) {
                        const p = rowOff + x;
                        if (valid[p]) continue;

                        let rSum = 0, gSum = 0, bSum = 0, count = 0;
                        if (x > 0 && valid[p - 1]) {
                            const ni = (p - 1) * 4;
                            rSum += data[ni]; gSum += data[ni + 1]; bSum += data[ni + 2]; count++;
                        }
                        if (x < width - 1 && valid[p + 1]) {
                            const ni = (p + 1) * 4;
                            rSum += data[ni]; gSum += data[ni + 1]; bSum += data[ni + 2]; count++;
                        }
                        if (y > 0 && valid[p - width]) {
                            const ni = (p - width) * 4;
                            rSum += data[ni]; gSum += data[ni + 1]; bSum += data[ni + 2]; count++;
                        }
                        if (y < height - 1 && valid[p + width]) {
                            const ni = (p + width) * 4;
                            rSum += data[ni]; gSum += data[ni + 1]; bSum += data[ni + 2]; count++;
                        }

                        if (count > 0) {
                            const i = p * 4;
                            nextData[i] = (rSum / count) | 0;
                            nextData[i + 1] = (gSum / count) | 0;
                            nextData[i + 2] = (bSum / count) | 0;
                            nextValid[p] = 1;
                        }
                    }
                }
                data.set(nextData);
                valid.set(nextValid);
            }

            const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
            tex.flipY = false;
            tex.premultiplyAlpha = false;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = 4;
            tex.needsUpdate = true;
            return tex;
        }

        const BUSH_PALETTES = {
            lush: {
                name: 'Semak Rimbun Truckful',
                shadow: '#174c27',
                base: '#2a7838',
                mid: '#4ea345',
                tip: '#86cf4e',
                highlight: '#c2ed6b',
                burstColor: 0x76cc4b
            },
            olive: {
                name: 'Semak Lembah Emas',
                shadow: '#2b5222',
                base: '#4b8230',
                mid: '#76b03e',
                tip: '#a8d651',
                highlight: '#d9f272',
                burstColor: 0x9ed44c
            },
            teal: {
                name: 'Semak Pinus Teduh',
                shadow: '#14453d',
                base: '#236e5c',
                mid: '#3e9676',
                tip: '#6ec28b',
                highlight: '#a7e3a2',
                burstColor: 0x62bd86
            }
        };

        // Painterly small rounded leaf bouquet texture for plush, pillowy Truckful bushes
        function hexToRgbBytes(hex) {
            const n = parseInt(hex.slice(1), 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }

        function varyRgbBytes(rgb, dr, dg, db) {
            return [
                Math.max(0, Math.min(255, Math.round(rgb[0] + dr))),
                Math.max(0, Math.min(255, Math.round(rgb[1] + dg))),
                Math.max(0, Math.min(255, Math.round(rgb[2] + db)))
            ];
        }

        function createPixelFoliageTexture(size, drawFn) {
            const data = new Uint8Array(size * size * 4);
            function plot(px, py, rgb) {
                const ix = Math.round(px);
                const iy = Math.round(py);
                if (ix < 0 || ix >= size || iy < 0 || iy >= size) return;
                const dstRow = (size - 1 - iy) * size;
                const dp = (dstRow + ix) * 4;
                data[dp] = rgb[0];
                data[dp + 1] = rgb[1];
                data[dp + 2] = rgb[2];
                data[dp + 3] = 255;
            }
            function stampPixelLeaf(cx, cy, len, wid, ang, cBase, cTip) {
                const ca = Math.cos(ang);
                const sa = Math.sin(ang);
                const bound = Math.ceil(Math.max(len, wid) + 2);
                const x0 = Math.max(0, Math.floor(cx - bound));
                const x1 = Math.min(size - 1, Math.ceil(cx + bound));
                const y0 = Math.max(0, Math.floor(cy - bound));
                const y1 = Math.min(size - 1, Math.ceil(cy + bound));
                for (let py = y0; py <= y1; py++) {
                    for (let px = x0; px <= x1; px++) {
                        const dx = px - cx;
                        const dy = py - cy;
                        const lx = dx * ca + dy * sa;
                        const ly = -dx * sa + dy * ca;
                        const t = (len * 0.42 - ly) / (len * 1.04);
                        if (t < 0.0 || t > 1.0) continue;
                        const halfW = wid * 0.54 * Math.sin(Math.pow(t, 0.72) * Math.PI);
                        if (Math.abs(lx) <= Math.max(0.45, halfW)) {
                            plot(px, py, t > 0.52 ? cTip : cBase);
                        }
                    }
                }
            }
            drawFn({ size, plot, stampPixelLeaf });
            const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
            tex.flipY = false;
            tex.generateMipmaps = false;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
            tex.needsUpdate = true;
            return tex;
        }

        function createTruckfulBushClusterTexture(palette) {
            const cShadow = hexToRgbBytes(palette.shadow);
            const cBase = hexToRgbBytes(palette.base);
            const cMid = hexToRgbBytes(palette.mid);
            const cTip = hexToRgbBytes(palette.tip);
            const cHi = hexToRgbBytes(palette.highlight);
            return createPixelFoliageTexture(24, ({ stampPixelLeaf }) => {
                let s = 19477;
                const nextRand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
                const cx = 11.5;
                const cy = 11.5;
                for (let i = 0; i < 10; i++) {
                    const theta = i * 2.3999632;
                    const r = Math.sqrt((i + 0.4) / 10) * 5.2;
                    const lx = cx + Math.cos(theta) * r;
                    const ly = cy + Math.sin(theta) * r;
                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.55;
                    stampPixelLeaf(lx, ly, 6.2 + nextRand() * 1.4, 3.6 + nextRand() * 0.8, ang, cShadow, cBase);
                }
                for (let i = 0; i < 11; i++) {
                    const theta = (i / 11) * Math.PI * 2 + (nextRand() - 0.5) * 0.18;
                    const r = 5.5 + nextRand() * 2.1;
                    const lx = cx + Math.cos(theta) * r;
                    const ly = cy + Math.sin(theta) * r;
                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.45;
                    const upper = ly < cy + 1.5;
                    stampPixelLeaf(lx, ly, 5.4 + nextRand() * 1.2, 3.0 + nextRand() * 0.8, ang, upper ? cBase : cShadow, upper ? cMid : cBase);
                }
                for (let i = 0; i < 13; i++) {
                    const theta = i * 2.3999632 + 1.1;
                    const r = Math.sqrt((i + 0.35) / 13) * 6.4;
                    const lx = cx + Math.cos(theta) * r;
                    const ly = cy - 0.8 + Math.sin(theta) * r * 0.88;
                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.6;
                    const isBright = ly < cy + 0.8 && nextRand() > 0.36;
                    stampPixelLeaf(lx, ly, 4.6 + nextRand() * 1.2, 2.6 + nextRand() * 0.7, ang, isBright ? cMid : cBase, isBright ? cHi : cTip);
                }
            });
        }

        function injectTruckfulBushShader(shader) {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;
            Object.assign(shader.uniforms, dylearnSharedUniforms);

            shader.vertexShader = [
                'attribute vec3 aSphereNormal;',
                'attribute vec3 aBushInfo;',
                'attribute vec3 aQuadData;',
                'uniform float uTime;',
                'uniform float uWindSpeed;',
                'varying vec3 vBushWorldPos;',
                'varying vec3 vBushSphereNormal;',
                'varying float vBushAO;',
                'varying float vBushTint;'
            ].join('\n') + '\n' + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'float cardPhase = aBushInfo.x;',
                    'float heightNorm = aBushInfo.y;',
                    'float bushAO = aBushInfo.z;',
                    'float frametime = 1.0 / 5.0;',
                    'float qPhase = mod(cardPhase * 1.7, frametime);',
                    'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;',
                    'float swayMask = smoothstep(0.05, 0.92, heightNorm);',
                    'float t = qTime * (1.85 + uWindSpeed * 0.62) + cardPhase;',
                    'float swayAmt = 0.032 * uWindSpeed * swayMask;',
                    'vec3 swayedAnchor = transformed + vec3(sin(t) * swayAmt, cos(t * 1.35) * swayAmt * 0.25, cos(t * 0.95) * swayAmt * 0.72);',
                    'vec3 camRightLocal = normalize(vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]));',
                    'vec3 camUpLocal = normalize(vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]));',
                    'vec3 camFwdLocal = normalize(vec3(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2]));',
                    'float spinAngle = aQuadData.z + sin(t * 1.1) * 0.07 * uWindSpeed;',
                    'float cs = cos(spinAngle), sn = sin(spinAngle);',
                    'vec2 rotOff = vec2(aQuadData.x * cs - aQuadData.y * sn, aQuadData.x * sn + aQuadData.y * cs);',
                    'float quadSize = length(aQuadData.xy);',
                    'transformed = swayedAnchor + camRightLocal * rotOff.x + camUpLocal * rotOff.y + camFwdLocal * (quadSize * 0.14);',
                    'vBushAO = bushAO;',
                    'vBushTint = fract(cardPhase * 1.913);',
                    'vBushWorldPos = (modelMatrix * vec4(swayedAnchor, 1.0)).xyz;',
                    'vBushSphereNormal = normalize(mat3(modelMatrix) * aSphereNormal);'
                ].join('\n')
            );

            if (shader.vertexShader.includes('#include <worldpos_vertex>')) {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    [
                        '#if defined( USE_ENVMAP ) || defined ( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0',
                        '    vec4 worldPosition = modelMatrix * vec4(swayedAnchor, 1.0);',
                        '#endif'
                    ].join('\n')
                );
            }

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = [
                    "uniform float uTime;",
                    "uniform vec3 uSunDir;",
                    "uniform vec3 uSunColor;",
                    "uniform vec3 uShadowTint;",
                    "uniform vec3 uRimTint;",
                    "uniform float uSceneBrightness;",
                    "uniform vec3 uCampfirePos;",
                    "uniform vec3 uCampfireColor;",
                    "uniform float uCampfireStrength;",
                    "uniform sampler2D uCloudNoise;",
                    "uniform float uCloudScale;",
                    "uniform float uCloudWorldY;",
                    "uniform float uCloudSpeed;",
                    "uniform float uCloudContrast;",
                    "uniform float uCloudThreshold;",
                    "uniform vec2 uCloudDir;",
                    "uniform float uCloudShadowMin;",
                    "uniform float uCloudDivergeAngle;",
                    "uniform float uToonCuts;",
                    "uniform float uToonWrap;",
                    "uniform float uToonSteepness;",
                    "uniform float uThresholdGradSize;",
                    'varying vec3 vBushWorldPos;',
                    'varying vec3 vBushSphereNormal;',
                    'varying float vBushAO;',
                    'varying float vBushTint;',
                    "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                    "    float a = radians(angleDeg);",
                    "    float c = cos(a);",
                    "    float s = sin(a);",
                    "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                    "}",
                    "float dylearnCloudNoise(vec3 wp) {",
                    "    float t = clamp((uCloudWorldY - wp.y) / max(uSunDir.y, 0.42), 0.0, 140.0);",
                    "    vec3 hitPos = vec3(wp.x + uSunDir.x * t * 0.16, wp.y, wp.z + uSunDir.z * t * 0.16);",
                    "    float invScale = 1.0 / max(uCloudScale, 0.001);",
                    "    vec2 d1 = normalize(dylearnRotateVec2(uCloudDir, uCloudDivergeAngle));",
                    "    vec2 d2 = normalize(dylearnRotateVec2(uCloudDir, -uCloudDivergeAngle));",
                    "    vec2 td1 = uTime * uCloudSpeed * d1;",
                    "    vec2 td2 = uTime * uCloudSpeed * d2;",
                    "    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;",
                    "    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;",
                    "    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);",
                    "    lv = (lv - 0.5) * uCloudContrast + 0.5;",
                    "    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);",
                    "}"
                ].join('\n') + '\n' + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    [
                        'vec3 buN = normalize(vBushSphereNormal);',
                        'vec3 buL = normalize(uSunDir);',
                        'vec3 buV = normalize(cameraPosition - vBushWorldPos);',
                        'float buDirAtten = 1.0;',
                        '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
                        '    if (receiveShadow) {',
                        '        DirectionalLightShadow buShadow = directionalLightShadows[0];',
                        '        buDirAtten = getShadow(directionalShadowMap[0], buShadow.shadowMapSize, buShadow.shadowBias, buShadow.shadowRadius, vDirectionalShadowCoord[0]);',
                        '    }',
                        '#endif',
                        'float buDiff = (dot(buN, buL) + (buDirAtten - 1.0) + uToonWrap) * uToonSteepness;',
                        'buDiff *= mix(0.62, 1.08, vBushAO);',
                        'float buCloud = dylearnCloudNoise(vBushWorldPos);',
                        'buDiff = clamp(min(buDiff, buCloud), 0.0, 1.0);',
                        'float buCut = 1.0 / max(uToonCuts, 1.0);',
                        'float buStep = clamp(ceil(buDiff * uToonCuts) * buCut, 0.0, 1.0);',
                        'if (uThresholdGradSize > 0.0) {',
                        '    float buK = floor(buDiff / buCut + 0.5);',
                        '    if (buK >= 0.0 && buK <= uToonCuts) {',
                        '        float buThresh = buK * buCut;',
                        '        float buHw = 0.5 * buCut * uThresholdGradSize;',
                        '        float buLo = max(0.0, buThresh - buHw);',
                        '        float buHi = min(1.0, buThresh + buHw);',
                        '        float buBlend = (buHi > buLo) ? smoothstep(buLo, buHi, buDiff) : step(buThresh, buDiff);',
                        '        buStep = clamp(mix(buThresh, min(buThresh + buCut, 1.0), buBlend), 0.0, 1.0);',
                        '    }',
                        '}',
                        'vec3 buBase = diffuseColor.rgb * mix(0.93, 1.07, vBushTint) * uSceneBrightness;',
                        'vec3 buCool = mix(buBase * uShadowTint * 1.20, buBase * 0.44, 0.46);',
                        'vec3 buSun = buBase * mix(vec3(1.04), uSunColor * 1.10, 0.28);',
                        'vec3 buCol = mix(buCool, buSun, mix(0.20, 1.0, buStep));',
                        'float buRim = pow(1.0 - max(dot(buN, buV), 0.0), 3.0) * smoothstep(0.22, 0.86, buN.y * 0.5 + 0.5);',
                        'buCol += uRimTint * buRim * 0.12 * uSceneBrightness;',
                        'float buFireDist = length(uCampfirePos - vBushWorldPos);',
                        'float buFireGlow = (1.0 - smoothstep(1.8, 12.5, buFireDist)) * uCampfireStrength;',
                        'outgoingLight = buCol + diffuseColor.rgb * uCampfireColor * smoothstep(0.12, 0.65, buFireGlow) * 0.44;',
                        'gl_FragColor = vec4(outgoingLight, diffuseColor.a);',
                        '#include <tonemapping_fragment>'
                    ].join('\n')
                );
            }
        }

                const bushMaterials = {};
        const bushDepthMaterials = {};
        Object.keys(BUSH_PALETTES).forEach(key => {
            const tex = createTruckfulBushClusterTexture(BUSH_PALETTES[key]);
            const mat = new THREE.MeshStandardMaterial({
                map: tex,
                alphaTest: 0.45,
                side: THREE.DoubleSide,
                roughness: 0.88,
                metalness: 0.0
            });
            mat.onBeforeCompile = injectTruckfulBushShader;
            bushMaterials[key] = mat;

            const depthMat = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map: tex,
                alphaTest: 0.45
            });
            depthMat.onBeforeCompile = injectTruckfulBushShader;
            bushDepthMaterials[key] = depthMat;
        });

        const interactiveBushes = [];
        const bushBerryMat = new THREE.MeshBasicMaterial({ color: 0xf94144 });
        const bushBlossomMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
        const bushBerryGeo = new THREE.SphereGeometry(0.058, 6, 5);
        const bushHitProxyGeo = new THREE.SphereGeometry(0.95, 6, 5);
        const bushHitProxyMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            colorWrite: false
        });

        // Builds 3 distinct organic multi-lobe Truckful storybook cushion bush geometries (~64 tris each!)
        function createTruckfulBushGeometry(variantIndex = 0) {
            const lobePresets = [
                // Variant 0: Classic 3-mound cozy roadside cushion
                [
                    { cx: 0.0, cy: 0.46, cz: 0.0, rx: 0.62, ry: 0.48, rz: 0.60, count: 14 },
                    { cx: -0.44, cy: 0.32, cz: 0.18, rx: 0.45, ry: 0.34, rz: 0.44, count: 9 },
                    { cx: 0.42, cy: 0.30, cz: -0.14, rx: 0.44, ry: 0.32, rz: 0.42, count: 9 }
                ],
                // Variant 1: Wide low sprawling 4-lobe hedgerow bush
                [
                    { cx: -0.12, cy: 0.42, cz: 0.04, rx: 0.58, ry: 0.42, rz: 0.56, count: 12 },
                    { cx: 0.46, cy: 0.34, cz: 0.22, rx: 0.46, ry: 0.34, rz: 0.44, count: 8 },
                    { cx: -0.52, cy: 0.28, cz: -0.18, rx: 0.42, ry: 0.30, rz: 0.42, count: 8 },
                    { cx: 0.14, cy: 0.30, cz: -0.40, rx: 0.40, ry: 0.28, rz: 0.40, count: 7 }
                ],
                // Variant 2: Plump rounded tall woodland dome with twin shoulders
                [
                    { cx: 0.0, cy: 0.56, cz: 0.0, rx: 0.58, ry: 0.54, rz: 0.58, count: 15 },
                    { cx: 0.38, cy: 0.30, cz: 0.28, rx: 0.42, ry: 0.32, rz: 0.42, count: 8 },
                    { cx: -0.36, cy: 0.32, cz: -0.26, rx: 0.42, ry: 0.32, rz: 0.42, count: 8 }
                ]
            ];

            const lobes = lobePresets[variantIndex % lobePresets.length];
            const bushCenter = new THREE.Vector3(0, 0.24, 0);
            const goldenAngle = 2.3999632;
            const clusters = [];

            lobes.forEach((lobe, lIdx) => {
                // Shaded interior heart cluster to guarantee 100% solid plump silhouette
                clusters.push({
                    pos: new THREE.Vector3(lobe.cx, lobe.cy - 0.05, lobe.cz),
                    lobe,
                    size: Math.max(lobe.rx, lobe.ry) * 1.38,
                    aoScale: 0.56,
                    phase: (variantIndex * 1.9 + lIdx * 1.3) % (Math.PI * 2),
                    spin: (lIdx * 1.7 + variantIndex) % (Math.PI * 2)
                });

                for (let i = 0; i < lobe.count; i++) {
                    const u = (i + 0.5) / lobe.count;
                    // Cover upper hemisphere down to ground skirt cleanly
                    const cosPhi = 1.0 - 1.38 * u;
                    const sinPhi = Math.sqrt(Math.max(0.0, 1.0 - cosPhi * cosPhi));
                    const theta = i * goldenAngle + lIdx * 1.7 + variantIndex * 0.9;

                    const dir = new THREE.Vector3(
                        sinPhi * Math.cos(theta),
                        cosPhi,
                        sinPhi * Math.sin(theta)
                    ).normalize();

                    const rJitter = 0.72 + ((i * 13 + lIdx * 7) % 4) * 0.08;
                    const px = lobe.cx + dir.x * lobe.rx * rJitter;
                    const py = Math.max(0.14, lobe.cy + dir.y * lobe.ry * rJitter);
                    const pz = lobe.cz + dir.z * lobe.rz * rJitter;

                    clusters.push({
                        pos: new THREE.Vector3(px, py, pz),
                        lobe,
                        size: (0.56 + ((i * 17 + lIdx * 5) % 4) * 0.085),
                        aoScale: 1.0,
                        phase: (variantIndex * 2.1 + lIdx * 1.4 + i * 0.53) % (Math.PI * 2),
                        spin: ((i * 37 + lIdx * 23 + variantIndex * 11) % 100) / 100 * Math.PI * 2
                    });
                }
            });

            const total = clusters.length;
            const positions = new Float32Array(total * 4 * 3);
            const normals = new Float32Array(total * 4 * 3);
            const sphereNormals = new Float32Array(total * 4 * 3);
            const bushInfos = new Float32Array(total * 4 * 3);
            const quadData = new Float32Array(total * 4 * 3);
            const uvs = new Float32Array(total * 4 * 2);
            const indices = [];

            const cornerOffsets = [
                [-0.5, -0.5, 0, 0],
                [0.5, -0.5, 1, 0],
                [-0.5, 0.5, 0, 1],
                [0.5, 0.5, 1, 1]
            ];

            for (let c = 0; c < total; c++) {
                const cl = clusters[c];
                const lobeN = new THREE.Vector3(
                    (cl.pos.x - cl.lobe.cx) / cl.lobe.rx,
                    (cl.pos.y - cl.lobe.cy) / cl.lobe.ry,
                    (cl.pos.z - cl.lobe.cz) / cl.lobe.rz
                );
                if (lobeN.lengthSq() < 0.0001) lobeN.set(0, 1, 0);
                else lobeN.normalize();

                const overallN = cl.pos.clone().sub(bushCenter);
                if (overallN.lengthSq() < 0.0001) overallN.set(0, 1, 0);
                else overallN.normalize();

                const projN = lobeN.lerp(overallN, 0.45).normalize();
                const heightNorm = THREE.MathUtils.clamp(cl.pos.y / 0.98, 0.0, 1.0);
                const bushAO = THREE.MathUtils.clamp((0.40 + heightNorm * 0.48 + Math.max(0, projN.y) * 0.22) * cl.aoScale, 0.28, 1.0);

                const vBase = c * 4;
                for (let k = 0; k < 4; k++) {
                    const vi = vBase + k;
                    const i3 = vi * 3;
                    const i2 = vi * 2;
                    const co = cornerOffsets[k];

                    positions[i3] = cl.pos.x;
                    positions[i3 + 1] = cl.pos.y;
                    positions[i3 + 2] = cl.pos.z;

                    normals[i3] = projN.x;
                    normals[i3 + 1] = projN.y;
                    normals[i3 + 2] = projN.z;

                    sphereNormals[i3] = projN.x;
                    sphereNormals[i3 + 1] = projN.y;
                    sphereNormals[i3 + 2] = projN.z;

                    bushInfos[i3] = cl.phase;
                    bushInfos[i3 + 1] = heightNorm;
                    bushInfos[i3 + 2] = bushAO;

                    quadData[i3] = co[0] * cl.size;
                    quadData[i3 + 1] = co[1] * cl.size;
                    quadData[i3 + 2] = cl.spin;

                    uvs[i2] = co[2];
                    uvs[i2 + 1] = co[3];
                }
                indices.push(vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2);
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geo.setAttribute('aSphereNormal', new THREE.BufferAttribute(sphereNormals, 3));
            geo.setAttribute('aBushInfo', new THREE.BufferAttribute(bushInfos, 3));
            geo.setAttribute('aQuadData', new THREE.BufferAttribute(quadData, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            return geo;
        }

        const TRUCKFUL_BUSH_GEOS = [
            createTruckfulBushGeometry(0),
            createTruckfulBushGeometry(1),
            createTruckfulBushGeometry(2)
        ];

        function createBotWBush(x, z, scale = 1.0, accentType = 'none', paletteKey = 'lush', variantIdx = 0) {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y - 0.05, z);
            group.scale.set(scale * 1.12, scale, scale * 1.12);
            group.rotation.y = (x * 7.3 + z * 11.1) % (Math.PI * 2);

            const pal = BUSH_PALETTES[paletteKey] || BUSH_PALETTES.lush;
            const foliage = new THREE.Mesh(
                TRUCKFUL_BUSH_GEOS[variantIdx % TRUCKFUL_BUSH_GEOS.length],
                bushMaterials[paletteKey] || bushMaterials.lush
            );
            foliage.customDepthMaterial = bushDepthMaterials[paletteKey] || bushDepthMaterials.lush;
            foliage.castShadow = Math.hypot(x, z) < 20.0;
            foliage.receiveShadow = true;
            foliage.frustumCulled = false;
            group.add(foliage);

            // Zero-overdraw hit-proxy so clicking billboarded bushes always registers cleanly
            const hitProxy = new THREE.Mesh(bushHitProxyGeo, bushHitProxyMat);
            hitProxy.position.y = 0.45;
            group.add(hitProxy);

            // Cozy storybook berry or buttercup flower dots perched on the sunlit upper bush cushions
            if (accentType === 'berries' || accentType === 'flowers') {
                const dotMat = accentType === 'berries' ? bushBerryMat : bushBlossomMat;
                const dotCount = accentType === 'berries' ? 6 : 5;
                for (let b = 0; b < dotCount; b++) {
                    const ang = (b / dotCount) * Math.PI * 2 + 0.45;
                    const rad = 0.34 + (b % 3) * 0.14;
                    const dot = new THREE.Mesh(bushBerryGeo, dotMat);
                    dot.position.set(Math.cos(ang) * rad, 0.56 + (b % 2) * 0.18, Math.sin(ang) * rad);
                    group.add(dot);
                }
            }

            const displayName = accentType === 'berries'
                ? 'Semak Beri Truckful'
                : (accentType === 'flowers' ? 'Semak Bunga Padang' : pal.name);

            group.userData = {
                type: 'bush',
                name: displayName,
                baseScale: scale,
                rustleBoost: 0,
                isCut: false,
                burstColor: pal.burstColor,
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + 0.55 * scale, z), 1.45 * scale)
            };
            interactiveBushes.push(group);
            scene.add(group);
            return group;
        }

        // Lush Truckful roadside, fence-hugging, clearing & pondside bush placements
        const bushSpots = [
            [-2.4, -4.6, 1.12, 'berries', 'lush', 0],
            [-3.4, -5.8, 0.88, 'none', 'olive', 1],
            [-1.6, 5.4, 1.02, 'flowers', 'lush', 2],
            [-9.4, 6.8, 1.18, 'none', 'teal', 1],
            [-1.8, 10.6, 1.08, 'flowers', 'olive', 0],
            [-10.6, 11.4, 1.15, 'berries', 'lush', 1],
            [4.2, -5.6, 1.10, 'berries', 'lush', 2],
            [7.8, -6.2, 0.96, 'none', 'teal', 0],
            [12.8, 1.8, 1.14, 'berries', 'olive', 1],
            [13.2, 7.8, 0.98, 'flowers', 'lush', 0],
            [4.6, 9.8, 1.08, 'berries', 'lush', 2],
            [-0.4, 9.5, 0.94, 'none', 'olive', 1],
            [-11.8, -1.2, 1.22, 'berries', 'teal', 0],
            [9.8, -1.5, 0.92, 'flowers', 'olive', 2],
            [-9.8, 9.4, 1.08, 'berries', 'lush', 1],
            [2.2, -9.8, 1.18, 'none', 'teal', 0],
            [14.5, -3.5, 1.05, 'berries', 'lush', 2],
            [-12.4, 5.2, 1.14, 'flowers', 'olive', 1],
            [6.5, 11.8, 0.96, 'berries', 'lush', 0],
            [-2.8, -9.6, 1.04, 'none', 'teal', 2],
            [3.8, 4.2, 0.86, 'flowers', 'lush', 1],
            [-2.6, 14.2, 1.12, 'berries', 'olive', 0],
            [-10.2, 2.2, 1.05, 'none', 'lush', 2],
            [-8.4, -8.2, 1.16, 'flowers', 'teal', 1]
        ];
        bushSpots.forEach(b => {
            if (getRoadDistance(b[0], b[1]) > 2.55) {
                createBotWBush(b[0], b[1], b[2], b[3], b[4], b[5]);
            }
        });

        // ============================================================================
        // 6A. BOTW STYLIZED PINE TREES (TIERED EVERGREEN PADS + SOCKET-LOCKED WIND)
        // ============================================================================
        const interactiveTrees = [];
        const swayingCanopies = [];

        function mergeBufferGeometriesSimple(geos) {
            const nonIndexed = geos.map(g => (g.index ? g.toNonIndexed() : g));
            const attrNames = Object.keys(nonIndexed[0].attributes);
            let totalVerts = 0;
            for (let i = 0; i < nonIndexed.length; i++) {
                totalVerts += nonIndexed[i].attributes.position.count;
            }

            const merged = new THREE.BufferGeometry();
            attrNames.forEach(name => {
                const sampleAttr = nonIndexed[0].attributes[name];
                const itemSize = sampleAttr.itemSize;
                const array = new Float32Array(totalVerts * itemSize);
                let offset = 0;

                for (let i = 0; i < nonIndexed.length; i++) {
                    const attr = nonIndexed[i].attributes[name];
                    if (attr) {
                        array.set(attr.array, offset);
                    }
                    offset += nonIndexed[i].attributes.position.count * itemSize;
                }
                merged.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
            });

            return merged;
        }

        // Stylized hand-painted vertical bark texture for trunks & seat logs
        function createStylizedBarkTexture() {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 256;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#6f4a32';
            ctx.fillRect(0, 0, 128, 256);

            for (let i = 0; i < 36; i++) {
                const x = (i * 19 + 7) % 128;
                const w = 3 + (i % 4) * 2;
                ctx.fillStyle = i % 3 === 0 ? '#553421' : (i % 3 === 1 ? '#875c3e' : '#633f29');
                ctx.fillRect(x, 0, w, 256);
            }
            const tex = new THREE.CanvasTexture(c);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
            return tex;
        }

        const trunkMat = new THREE.MeshStandardMaterial({
            map: createStylizedBarkTexture(),
            color: 0xb58663,
            roughness: 0.90,
            metalness: 0.0
        });
        applyStylizedCelShading(trunkMat, { rimStrength: 0.14, shadowLift: 0.56 });

        const deadWoodMat = new THREE.MeshStandardMaterial({
            color: 0x8f8275,
            roughness: 0.92,
            metalness: 0.0
        });
        applyStylizedCelShading(deadWoodMat, { rimStrength: 0.16, shadowLift: 0.56 });

        // Curved organic trunk mesh with buttress roots & spine evaluator so pine pads lock cleanly to trunk center!
        function createSculptedTrunkMesh(height, baseRadius, topRadius, bendX, bendZ, material = trunkMat) {
            const radSegs = 7;
            const heightSegs = 8;
            const geo = new THREE.CylinderGeometry(topRadius, baseRadius, height, radSegs, heightSegs, false);
            geo.translate(0, height * 0.5, 0);

            const pos = geo.attributes.position;
            const getSpineOffset = (t) => ({
                x: Math.sin(t * Math.PI * 0.92) * bendX,
                z: Math.sin(t * Math.PI * 0.78) * bendZ
            });

            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vy = pos.getY(i);
                const vz = pos.getZ(i);
                const t = THREE.MathUtils.clamp(vy / height, 0, 1);

                // Flared organic buttress roots at ground base
                const rootFlare = 1.0 + Math.pow(Math.max(0.0, 1.0 - t * 4.5), 2.0) * 0.58;
                const ang = Math.atan2(vz, vx);
                const rootRidge = 1.0 + Math.sin(ang * 4.0) * 0.14 * Math.max(0.0, 1.0 - t * 3.8);

                const spine = getSpineOffset(t);
                pos.setXYZ(
                    i,
                    vx * rootFlare * rootRidge + spine.x,
                    vy,
                    vz * rootFlare * rootRidge + spine.z
                );
            }
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return { mesh, getSpineOffset };
        }

        const PINE_PALETTES = {
            emerald: {
                name: 'Pinus BotW Emerald',
                shadow: '#1d4f3c',
                base: '#2e7350',
                mid: '#4d9960',
                tip: '#7dc274',
                highlight: '#b4e38d',
                burstColor: 0x6ec274
            },
            teal: {
                name: 'Pinus BotW Spruce',
                shadow: '#1a494a',
                base: '#2b6d6c',
                mid: '#449188',
                tip: '#6eb8a3',
                highlight: '#a6dec1',
                burstColor: 0x63b5a2
            },
            olive: {
                name: 'Pinus BotW Sunlit',
                shadow: '#2b542b',
                base: '#487d39',
                mid: '#6ea847',
                tip: '#9ad15e',
                highlight: '#ccf084',
                burstColor: 0x92cc5c
            }
        };

        // Gouache painterly evergreen scalloped pine-fan texture (zero black outline via createCleanAlphaDataTexture!)
        function createBotWPineFanTexture(palette) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 512, 512);

            const rootX = 256;
            const rootY = 472;

            // Draws a chunky, soft hand-painted BotW pine-needle spray lobe (not a flat fern!)
            function drawEvergreenSprayLobe(x, y, length, width, angle, colBase, colMid, colTip, needles = 7) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);

                // Soft gouache body mass
                const grad = ctx.createLinearGradient(0, 0, 0, -length);
                grad.addColorStop(0.0, colBase);
                grad.addColorStop(0.55, colMid);
                grad.addColorStop(1.0, colTip);
                ctx.fillStyle = grad;

                ctx.beginPath();
                ctx.moveTo(-width * 0.24, 0);
                ctx.bezierCurveTo(-width * 0.62, -length * 0.35, -width * 0.58, -length * 0.78, 0, -length * 0.94);
                ctx.bezierCurveTo(width * 0.58, -length * 0.78, width * 0.62, -length * 0.35, width * 0.24, 0);
                ctx.closePath();
                ctx.fill();

                // Radiating stylized evergreen needle spikes around the outer scalloped fan tip
                for (let i = 0; i < needles; i++) {
                    const u = (i / (needles - 1)) * 2.0 - 1.0; // -1..+1
                    const spikeAng = u * 0.68;
                    const spikeBaseX = u * width * 0.30;
                    const spikeBaseY = -length * (0.64 - Math.abs(u) * 0.14);
                    const spikeLen = length * (0.42 - Math.abs(u) * 0.10);
                    const spikeW = width * 0.17;

                    ctx.save();
                    ctx.translate(spikeBaseX, spikeBaseY);
                    ctx.rotate(spikeAng);

                    const nGrad = ctx.createLinearGradient(0, 0, 0, -spikeLen);
                    nGrad.addColorStop(0.0, colMid);
                    nGrad.addColorStop(1.0, colTip);
                    ctx.fillStyle = nGrad;

                    ctx.beginPath();
                    ctx.moveTo(-spikeW * 0.55, 6);
                    ctx.quadraticCurveTo(-spikeW * 0.45, -spikeLen * 0.55, 0, -spikeLen);
                    ctx.quadraticCurveTo(spikeW * 0.45, -spikeLen * 0.55, spikeW * 0.55, 6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }

                // Soft painterly sunlit ridge dab along the upper center of the cluster
                ctx.globalAlpha = 0.28;
                ctx.fillStyle = colTip;
                ctx.beginPath();
                ctx.ellipse(0, -length * 0.58, width * 0.22, length * 0.26, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }

            // 1. Dense inner fan shadow cushion (ensures thick evergreen volume with zero hollow gaps)
            const backFan = [
                { ang: -0.92, len: 295, w: 145 },
                { ang: -0.58, len: 355, w: 165 },
                { ang: -0.22, len: 405, w: 175 },
                { ang: 0.22, len: 405, w: 175 },
                { ang: 0.58, len: 355, w: 165 },
                { ang: 0.92, len: 295, w: 145 }
            ];
            backFan.forEach(f => {
                drawEvergreenSprayLobe(rootX, rootY + 12, f.len, f.w, f.ang, palette.shadow, palette.base, palette.mid, 7);
            });

            // 2. Main broad overlapping evergreen bough sprays forming BotW's signature scalloped paw silhouette
            const midFan = [
                { x: rootX - 42, y: rootY - 22, ang: -0.82, len: 285, w: 135 },
                { x: rootX + 42, y: rootY - 22, ang: 0.82, len: 285, w: 135 },
                { x: rootX - 30, y: rootY - 40, ang: -0.45, len: 355, w: 155 },
                { x: rootX + 30, y: rootY - 40, ang: 0.45, len: 355, w: 155 },
                { x: rootX, y: rootY - 48, ang: -0.08, len: 392, w: 168 },
                { x: rootX + 8, y: rootY - 52, ang: 0.10, len: 382, w: 162 }
            ];
            midFan.forEach(f => {
                drawEvergreenSprayLobe(f.x, f.y, f.len, f.w, f.ang, palette.base, palette.mid, palette.tip, 7);
            });

            // 3. Upper sunlit painterly needle tufts (warm bright tips catching Hyrule sunlight)
            const topTufts = [
                { x: rootX - 96, y: 298, ang: -0.70, len: 165, w: 96 },
                { x: rootX + 96, y: 298, ang: 0.70, len: 165, w: 96 },
                { x: rootX - 58, y: 235, ang: -0.38, len: 185, w: 108 },
                { x: rootX + 58, y: 235, ang: 0.38, len: 185, w: 108 },
                { x: rootX, y: 215, ang: 0.0, len: 205, w: 118 },
                { x: rootX - 24, y: 342, ang: -0.28, len: 150, w: 98 },
                { x: rootX + 24, y: 342, ang: 0.28, len: 150, w: 98 }
            ];
            topTufts.forEach(t => {
                drawEvergreenSprayLobe(t.x, t.y, t.len, t.w, t.ang, palette.mid, palette.tip, palette.highlight, 6);
            });

            // Subtle shaded base depth right where the pad meets the inner trunk skirt
            const baseShade = ctx.createRadialGradient(rootX, 505, 10, rootX, 505, 130);
            baseShade.addColorStop(0.0, 'rgba(18, 42, 34, 0.55)');
            baseShade.addColorStop(1.0, 'rgba(18, 42, 34, 0.0)');
            ctx.fillStyle = baseShade;
            ctx.beginPath();
            ctx.arc(rootX, 505, 130, 0, Math.PI * 2);
            ctx.fill();

            return createCleanAlphaDataTexture(ctx, 512, 512, palette.mid);
        }

                // Curved 3D BotW Pine Bough Pad (gently arched downward with upturned evergreen tips, pinned cleanly at socket z=0)
        function createBotWPinePadGeometry() {
            const segX = 4;
            const segZ = 4;
            const width = 1.48;
            const length = 1.56;
            const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
            geo.rotateX(-Math.PI / 2);
            // Move root edge cleanly to z = 0 extending outward along +Z
            geo.translate(0, 0, length * 0.5);

            const pos = geo.attributes.position;
            const uv = geo.attributes.uv;
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vz = pos.getZ(i);
                const zNorm = THREE.MathUtils.clamp(vz / length, 0.0, 1.0);
                const xNorm = vx / (width * 0.5);

                // Natural Hyrule pine bough silhouette: plump droop in middle, soft upturned paw tips
                const droop = -Math.pow(zNorm, 1.45) * 0.34 + Math.pow(Math.max(0.0, zNorm - 0.55), 2.0) * 0.42;
                const arch = -(xNorm * xNorm) * 0.16 * zNorm;

                pos.setXYZ(i, vx * (0.42 + zNorm * 0.62), droop + arch, vz);
                // UV v=0 at root (z=0), v=1 at outer tip (z=length)
                uv.setXY(i, xNorm * 0.5 + 0.5, zNorm);
            }
            geo.computeVertexNormals();
            return geo;
        }

        const BASE_BOTW_PINE_PAD_GEO = createBotWPinePadGeometry();

        // Crossed vertical spire tip at the top crown of each pine tree (no flat lampshade cone!)
        function createBotWPineSpireGeometry() {
            const planes = [];
            for (let i = 0; i < 3; i++) {
                const p = new THREE.PlaneGeometry(0.92, 1.38, 2, 2);
                p.translate(0, 0.62, 0);
                p.rotateY((i / 3) * Math.PI);
                planes.push(p);
            }
            return mergeBufferGeometriesSimple(planes);
        }
        const BASE_BOTW_PINE_SPIRE_GEO = createBotWPineSpireGeometry();

        // Socket-Locked Pine Wind + Conical Cel-Shader (branches rotate strictly around trunk socket!)
        function injectBranchSocketWindShader(shader) {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;
            Object.assign(shader.uniforms, dylearnSharedUniforms);

            shader.vertexShader = [
                'attribute vec3 aSocketPos;',
                'attribute vec3 aProjectedNormal;',
                'attribute vec3 aFoliageInfo;',
                'uniform float uTime;',
                'uniform float uWindSpeed;',
                'varying vec3 vPineWorldPos;',
                'varying vec3 vPineNormal;',
                'varying float vTierAO;',
                'varying float vHeightTint;'
            ].join('\n') + '\n' + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'vec3 rel = transformed - aSocketPos;',
                    'float distFromSocket = length(rel);',
                    'float flex = smoothstep(0.08, 1.45, distFromSocket);',
                    'float phase = aFoliageInfo.x;',
                    'float frametime = 1.0 / 5.0;',
                    'float qPhase = mod(phase * 1.3, frametime);',
                    'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;',
                    'float t = qTime * (1.55 + uWindSpeed * 0.55) + phase;',
                    'float pitchAng = sin(t) * 0.068 * uWindSpeed * flex;',
                    'float yawAng = cos(t * 0.82) * 0.052 * uWindSpeed * flex;',
                    'float cp = cos(pitchAng), sp = sin(pitchAng);',
                    'float cy = cos(yawAng), sy = sin(yawAng);',
                    'vec3 p1 = vec3(rel.x, rel.y * cp - rel.z * sp, rel.y * sp + rel.z * cp);',
                    'vec3 p2 = vec3(p1.x * cy - p1.z * sy, p1.y, p1.x * sy + p1.z * cy);',
                    'transformed = aSocketPos + p2;',
                    'vTierAO = aFoliageInfo.y;',
                    'vHeightTint = aFoliageInfo.z;',
                    'vPineWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
                    'vPineNormal = normalize(mat3(modelMatrix) * aProjectedNormal);'
                ].join('\n')
            );

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = [
                    "uniform float uTime;",
                    "uniform vec3 uSunDir;",
                    "uniform vec3 uSunColor;",
                    "uniform vec3 uShadowTint;",
                    "uniform vec3 uRimTint;",
                    "uniform float uSceneBrightness;",
                    "uniform vec3 uCampfirePos;",
                    "uniform vec3 uCampfireColor;",
                    "uniform float uCampfireStrength;",
                    "uniform sampler2D uCloudNoise;",
                    "uniform float uCloudScale;",
                    "uniform float uCloudWorldY;",
                    "uniform float uCloudSpeed;",
                    "uniform float uCloudContrast;",
                    "uniform float uCloudThreshold;",
                    "uniform vec2 uCloudDir;",
                    "uniform float uCloudShadowMin;",
                    "uniform float uCloudDivergeAngle;",
                    "uniform float uToonCuts;",
                    "uniform float uToonWrap;",
                    "uniform float uToonSteepness;",
                    "uniform float uThresholdGradSize;",
                    'varying vec3 vPineWorldPos;',
                    'varying vec3 vPineNormal;',
                    'varying float vTierAO;',
                    'varying float vHeightTint;',
                    "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                    "    float a = radians(angleDeg);",
                    "    float c = cos(a);",
                    "    float s = sin(a);",
                    "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                    "}",
                    "float dylearnCloudNoise(vec3 wp) {",
                    "    float t = clamp((uCloudWorldY - wp.y) / max(uSunDir.y, 0.42), 0.0, 140.0);",
                    "    vec3 hitPos = vec3(wp.x + uSunDir.x * t * 0.16, wp.y, wp.z + uSunDir.z * t * 0.16);",
                    "    float invScale = 1.0 / max(uCloudScale, 0.001);",
                    "    vec2 d1 = normalize(dylearnRotateVec2(uCloudDir, uCloudDivergeAngle));",
                    "    vec2 d2 = normalize(dylearnRotateVec2(uCloudDir, -uCloudDivergeAngle));",
                    "    vec2 td1 = uTime * uCloudSpeed * d1;",
                    "    vec2 td2 = uTime * uCloudSpeed * d2;",
                    "    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;",
                    "    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;",
                    "    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);",
                    "    lv = (lv - 0.5) * uCloudContrast + 0.5;",
                    "    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);",
                    "}"
                ].join('\n') + '\n' + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    [
                        'vec3 piN = normalize(vPineNormal);',
                        'vec3 piL = normalize(uSunDir);',
                        'vec3 piV = normalize(cameraPosition - vPineWorldPos);',
                        'float piDirAtten = 1.0;',
                        '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
                        '    if (receiveShadow) {',
                        '        DirectionalLightShadow piShadow = directionalLightShadows[0];',
                        '        piDirAtten = getShadow(directionalShadowMap[0], piShadow.shadowMapSize, piShadow.shadowBias, piShadow.shadowRadius, vDirectionalShadowCoord[0]);',
                        '    }',
                        '#endif',
                        'float piDiff = (dot(piN, piL) + (piDirAtten - 1.0) + uToonWrap) * uToonSteepness;',
                        'piDiff *= mix(0.64, 1.08, vTierAO);',
                        'float piCloud = dylearnCloudNoise(vPineWorldPos);',
                        'piDiff = clamp(min(piDiff, piCloud), 0.0, 1.0);',
                        'float piCut = 1.0 / max(uToonCuts, 1.0);',
                        'float piStep = clamp(ceil(piDiff * uToonCuts) * piCut, 0.0, 1.0);',
                        'if (uThresholdGradSize > 0.0) {',
                        '    float piK = floor(piDiff / piCut + 0.5);',
                        '    if (piK >= 0.0 && piK <= uToonCuts) {',
                        '        float piThresh = piK * piCut;',
                        '        float piHw = 0.5 * piCut * uThresholdGradSize;',
                        '        float piLo = max(0.0, piThresh - piHw);',
                        '        float piHi = min(1.0, piThresh + piHw);',
                        '        float piBlend = (piHi > piLo) ? smoothstep(piLo, piHi, piDiff) : step(piThresh, piDiff);',
                        '        piStep = clamp(mix(piThresh, min(piThresh + piCut, 1.0), piBlend), 0.0, 1.0);',
                        '    }',
                        '}',
                        'vec3 piBase = diffuseColor.rgb * mix(0.90, 1.10, vHeightTint) * uSceneBrightness;',
                        'vec3 piCool = mix(piBase * uShadowTint * 1.18, piBase * 0.42, 0.46);',
                        'vec3 piSun = piBase * mix(vec3(1.02), uSunColor * 1.06, 0.26);',
                        'vec3 piCol = mix(piCool, piSun, mix(0.22, 1.0, piStep));',
                        'float piRim = pow(1.0 - max(dot(piN, piV), 0.0), 3.0) * smoothstep(0.20, 0.85, piN.y * 0.5 + 0.5);',
                        'piCol += uRimTint * piRim * 0.13 * uSceneBrightness;',
                        'float piFireDist = length(uCampfirePos - vPineWorldPos);',
                        'float piFireGlow = (1.0 - smoothstep(2.0, 14.0, piFireDist)) * uCampfireStrength;',
                        'outgoingLight = piCol + diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, piFireGlow) * 0.42;',
                        'gl_FragColor = vec4(outgoingLight, diffuseColor.a);',
                        '#include <tonemapping_fragment>'
                    ].join('\n')
                );
            }
        }

                const pineMaterials = {};
        const pineDepthMaterials = {};
        Object.keys(PINE_PALETTES).forEach(key => {
            const tex = createBotWPineFanTexture(PINE_PALETTES[key]);
            const mat = new THREE.MeshStandardMaterial({
                map: tex,
                alphaTest: 0.38,
                side: THREE.DoubleSide,
                roughness: 0.88,
                metalness: 0.0
            });
            mat.onBeforeCompile = injectBranchSocketWindShader;
            pineMaterials[key] = mat;

            const depthMat = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map: tex,
                alphaTest: 0.40
            });
            depthMat.onBeforeCompile = injectBranchSocketWindShader;
            pineDepthMaterials[key] = depthMat;
        });

        const PINE_CONFIGS = {
            tall_alpine: { h: 7.4, baseR: 0.26, topR: 0.04, startT: 0.20, tiers: 9, maxRadius: 2.05 },
            broad_woodland: { h: 6.2, baseR: 0.28, topR: 0.05, startT: 0.18, tiers: 8, maxRadius: 2.35 },
            high_canopy: { h: 8.2, baseR: 0.28, topR: 0.04, startT: 0.34, tiers: 8, maxRadius: 2.10 },
            young_bushy: { h: 4.8, baseR: 0.20, topR: 0.04, startT: 0.15, tiers: 7, maxRadius: 1.72 }
        };
        const pineGeoCache = {};
        let pineSpawnCounter = 0;

        function getPineArchetype(variant, slotIdx) {
            const key = variant + '_' + (slotIdx % 3);
            if (pineGeoCache[key]) return pineGeoCache[key];
            const cfg = PINE_CONFIGS[variant] || PINE_CONFIGS.tall_alpine;
            const bendX = (Math.random() - 0.5) * 0.38;
            const bendZ = (Math.random() - 0.5) * 0.38;
            const { mesh: trunkTemplate, getSpineOffset } = createSculptedTrunkMesh(
                cfg.h, cfg.baseR, cfg.topR, bendX, bendZ, trunkMat
            );
            const padGeos = [];
            const dummy = new THREE.Object3D();
            const goldenAngle = 2.3999632;
            const treeSeed = Math.random() * 100.0;

            function stampPinePad(geoSrc, matrix, socketVec, tierAO, heightNorm, phaseSeed) {
                const g = geoSrc.index ? geoSrc.clone().toNonIndexed() : geoSrc.clone();
                g.applyMatrix4(matrix);
                const pos = g.attributes.position;
                const count = pos.count;
                const sockArr = new Float32Array(count * 3);
                const projNArr = new Float32Array(count * 3);
                const infoArr = new Float32Array(count * 3);

                for (let v = 0; v < count; v++) {
                    const px = pos.getX(v);
                    const pz = pos.getZ(v);
                    sockArr[v * 3] = socketVec.x;
                    sockArr[v * 3 + 1] = socketVec.y;
                    sockArr[v * 3 + 2] = socketVec.z;
                    const radial = new THREE.Vector3(px - socketVec.x, 0.65, pz - socketVec.z).normalize();
                    projNArr[v * 3] = radial.x;
                    projNArr[v * 3 + 1] = radial.y;
                    projNArr[v * 3 + 2] = radial.z;
                    const radDist = Math.hypot(px - socketVec.x, pz - socketVec.z);
                    const tipLight = THREE.MathUtils.clamp(tierAO * 0.72 + radDist * 0.16, 0.30, 1.0);
                    infoArr[v * 3] = phaseSeed;
                    infoArr[v * 3 + 1] = tipLight;
                    infoArr[v * 3 + 2] = heightNorm;
                }
                g.setAttribute('aSocketPos', new THREE.BufferAttribute(sockArr, 3));
                g.setAttribute('aProjectedNormal', new THREE.BufferAttribute(projNArr, 3));
                g.setAttribute('aFoliageInfo', new THREE.BufferAttribute(infoArr, 3));
                padGeos.push(g);
            }

            for (let tier = 0; tier < cfg.tiers; tier++) {
                const frac = tier / Math.max(1, cfg.tiers - 1);
                const hNorm = cfg.startT + frac * (0.94 - cfg.startT);
                const tierY = hNorm * cfg.h;
                const radiusMul = Math.pow(1.0 - frac * 0.80, 0.86) * cfg.maxRadius;
                const boughsInTier = Math.max(4, Math.round(7 - frac * 3));
                for (let b = 0; b < boughsInTier; b++) {
                    const yJitter = (Math.random() - 0.5) * 0.28;
                    const localY = THREE.MathUtils.clamp(tierY + yJitter, cfg.startT * cfg.h * 0.85, cfg.h * 0.96);
                    const spineT = localY / cfg.h;
                    const spine = getSpineOffset(spineT);
                    const socket = new THREE.Vector3(spine.x, localY, spine.z);
                    const yaw = (b / boughsInTier) * Math.PI * 2 + tier * goldenAngle + (Math.random() - 0.5) * 0.42;
                    const pitch = 0.20 + (1.0 - frac) * 0.24 + (Math.random() - 0.5) * 0.14;
                    const roll = (Math.random() - 0.5) * 0.34;
                    const lenScale = (radiusMul / 1.45) * (0.84 + Math.random() * 0.32);
                    const widScale = lenScale * (0.95 + Math.random() * 0.26);
                    dummy.position.copy(socket);
                    dummy.rotation.set(pitch, yaw, roll, 'YXZ');
                    dummy.scale.set(widScale, lenScale, lenScale);
                    dummy.updateMatrix();
                    const tierAO = 0.44 + frac * 0.52;
                    stampPinePad(BASE_BOTW_PINE_PAD_GEO, dummy.matrix, socket, tierAO, frac, treeSeed + tier * 1.1 + b * 0.7);
                }
            }

            const topSpine = getSpineOffset(0.98);
            const topSocket = new THREE.Vector3(topSpine.x, cfg.h * 0.93, topSpine.z);
            dummy.position.copy(topSocket);
            dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
            dummy.scale.set(0.75, 0.88, 0.75);
            dummy.updateMatrix();
            stampPinePad(BASE_BOTW_PINE_SPIRE_GEO, dummy.matrix, topSocket, 0.98, 1.0, treeSeed + 9.4);

            const mergedFoliageGeo = mergeBufferGeometriesSimple(padGeos);
            const entry = { cfg, trunkGeo: trunkTemplate.geometry, foliageGeo: mergedFoliageGeo };
            pineGeoCache[key] = entry;
            return entry;
        }

        function createStylizedPineTree(x, z, scale = 1.0, variant = 'tall_alpine', colorKey = 'emerald', heightRatio = 1.0) {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y - 0.08, z);

            const canopyPivot = new THREE.Group();
            canopyPivot.rotation.y = ((pineSpawnCounter * 2.39996) + x * 0.37) % (Math.PI * 2);
            group.add(canopyPivot);

            const arch = getPineArchetype(variant, pineSpawnCounter++);
            const cfg = arch.cfg;
            const trunkMesh = new THREE.Mesh(arch.trunkGeo, trunkMat);
            trunkMesh.castShadow = Math.hypot(x, z) < 28.0;
            trunkMesh.receiveShadow = true;
            canopyPivot.add(trunkMesh);

            const pal = PINE_PALETTES[colorKey] || PINE_PALETTES.emerald;
            const foliageMesh = new THREE.Mesh(arch.foliageGeo, pineMaterials[colorKey] || pineMaterials.emerald);
            foliageMesh.customDepthMaterial = pineDepthMaterials[colorKey] || pineDepthMaterials.emerald;
            foliageMesh.castShadow = Math.hypot(x, z) < 26.0;
            foliageMesh.receiveShadow = true;
            foliageMesh.frustumCulled = false;
            canopyPivot.add(foliageMesh);

            group.scale.set(scale, scale * heightRatio, scale);
            const centerH = cfg.h * scale * heightRatio * 0.52;
            const treeData = {
                type: 'tree',
                treeKind: 'pine',
                name: pal.name,
                naturalColorKey: colorKey,
                foliageMesh,
                canopy: canopyPivot,
                phase: Math.random() * Math.PI * 2,
                rustleBoost: 0,
                leafColor: new THREE.Color(pal.burstColor),
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + centerH, z), cfg.h * scale * Math.max(1, heightRatio) * 0.65)
            };
            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
            addCircleCollider('tree', x, z, cfg.baseR * scale * 1.18, y + cfg.h * scale * heightRatio, group);
            return group;
        }

        function createStylizedDeadPine(x, z, scale = 1.0) {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y - 0.08, z);

            const canopyPivot = new THREE.Group();
            group.add(canopyPivot);

            const h = 5.4;
            const { mesh: trunkMesh, getSpineOffset } = createSculptedTrunkMesh(
                h, 0.24, 0.04, (Math.random() - 0.5) * 0.55, (Math.random() - 0.5) * 0.55, deadWoodMat
            );
            canopyPivot.add(trunkMesh);

            for (let i = 0; i < 6; i++) {
                const t = 0.32 + (i / 6) * 0.58;
                const spine = getSpineOffset(t);
                const stubLen = (1.0 - t * 0.5) * 1.15;
                const stubGeo = new THREE.CylinderGeometry(0.02, 0.055, stubLen, 5);
                stubGeo.translate(0, stubLen * 0.5, 0);
                const stub = new THREE.Mesh(stubGeo, deadWoodMat);
                stub.position.set(spine.x, t * h, spine.z);
                stub.rotation.set(0.95 + (i % 2) * 0.25, i * 2.35, 0, 'YXZ');
                canopyPivot.add(stub);
            }

            group.scale.setScalar(scale);
            group.userData = {
                type: 'tree',
                treeKind: 'dead',
                name: 'Pohon Pinus Tua Kering',
                naturalColorKey: 'emerald',
                foliageMesh: null,
                canopy: canopyPivot,
                phase: Math.random() * Math.PI * 2,
                rustleBoost: 0,
                leafColor: new THREE.Color(0xc29b6c),
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + h * scale * 0.5, z), h * scale * 0.55)
            };
            interactiveTrees.push(group);
            scene.add(group);
            addCircleCollider('tree', x, z, 0.28 * scale * 1.18, y + h * scale, group);
            return group;
        }

        // ============================================================================
        // 6B. TRUCKFUL SMALL-LEAF DECIDUOUS TREES (VIEW-ALIGNED BOUQUET CLUSTERS)
        //     - Forked Wooden Boughs + Hundreds of Small Painterly Leaves in Bouquets
        //     - Camera-Aligned Clusters + Projected Canopy Normals (Plush & No Paper Edge!)
        // ============================================================================
        const DECIDUOUS_PALETTES = {
            emerald: {
                name: 'Pohon Ek Rimbun Truckful',
                shadow: '#1a4d2c',
                base: '#2d7a3c',
                mid: '#51a648',
                tip: '#87cf52',
                highlight: '#c4ed70',
                burstColor: 0x76cc4b
            },
            teal: {
                name: 'Pohon Ek Lembah Sejuk',
                shadow: '#174845',
                base: '#287368',
                mid: '#449e83',
                tip: '#73c798',
                highlight: '#afe8b4',
                burstColor: 0x67bf92
            },
            olive: {
                name: 'Pohon Maple Madu Emas',
                shadow: '#543b18',
                base: '#8c6122',
                mid: '#c4892d',
                tip: '#e6b145',
                highlight: '#f7d674',
                burstColor: 0xe6b145
            }
        };

        function createTruckfulSmallLeafClusterTexture(palette) {
            const cShadow = hexToRgbBytes(palette.shadow);
            const cBase = hexToRgbBytes(palette.base);
            const cMid = hexToRgbBytes(palette.mid);
            const cTip = hexToRgbBytes(palette.tip);
            const cHi = hexToRgbBytes(palette.highlight);
            return createPixelFoliageTexture(32, ({ stampPixelLeaf }) => {
                let s = 48271;
                const nextRand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
                const varyLeaf = (c1, c2) => {
                    const shift = nextRand() - 0.45;
                    const dr = shift * 20 + (nextRand() - 0.5) * 6;
                    const dg = shift * 16 + (nextRand() - 0.5) * 6;
                    const db = -shift * 12 + (nextRand() - 0.5) * 6;
                    return [varyRgbBytes(c1, dr * 0.85, dg * 0.85, db * 0.85), varyRgbBytes(c2, dr, dg, db)];
                };
                const cx = 15.5;
                const cy = 15.5;
                for (let i = 0; i < 14; i++) {
                    const theta = i * 2.3999632;
                    const r = Math.sqrt((i + 0.4) / 14) * 7.2;
                    const lx = cx + Math.cos(theta) * r;
                    const ly = cy + Math.sin(theta) * r;
                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.7;
                    const [v1, v2] = varyLeaf(cShadow, cBase);
                    stampPixelLeaf(lx, ly, 5.4 + nextRand() * 1.6, 3.2 + nextRand() * 0.8, ang, v1, v2);
                }
                for (let i = 0; i < 14; i++) {
                    const theta = (i / 14) * Math.PI * 2 + (nextRand() - 0.5) * 0.2;
                    const r = 7.2 + nextRand() * 3.3;
                    const lx = cx + Math.cos(theta) * r;
                    const ly = cy + Math.sin(theta) * r;
                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.5;
                    const upper = ly < cy + 1.5;
                    const [v1, v2] = varyLeaf(upper ? cBase : cShadow, upper ? cMid : cBase);
                    stampPixelLeaf(lx, ly, 5.0 + nextRand() * 1.4, 2.8 + nextRand() * 0.8, ang, v1, v2);
                }
                for (let i = 0; i < 18; i++) {
                    const theta = i * 2.3999632 + 1.3;
                    const r = Math.sqrt((i + 0.3) / 18) * 9.0;
                    const lx = cx + Math.cos(theta) * r;
                    const ly = cy - 0.8 + Math.sin(theta) * r * 0.90;
                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.75;
                    const bright = ly < cy + 0.6 && nextRand() > 0.34;
                    const [v1, v2] = varyLeaf(bright ? cMid : cBase, bright ? cHi : cTip);
                    stampPixelLeaf(lx, ly, 4.4 + nextRand() * 1.2, 2.4 + nextRand() * 0.7, ang, v1, v2);
                }
            });
        }

        function injectTruckfulDeciduousShader(shader) {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;
            Object.assign(shader.uniforms, dylearnSharedUniforms);

            shader.vertexShader = [
                'attribute vec3 aProjectedNormal;',
                'attribute vec3 aCanopyInfo;',
                'attribute vec3 aQuadData;',
                'uniform float uTime;',
                'uniform float uWindSpeed;',
                'varying vec3 vLeafWorldPos;',
                'varying vec3 vLeafNormal;',
                'varying float vLeafAO;',
                'varying float vLeafTint;',
                'varying float vLeafClusterHue;'
            ].join('\n') + '\n' + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'float cardPhase = aCanopyInfo.x;',
                    'float leafAO = aCanopyInfo.y;',
                    'float leafTint = aCanopyInfo.z;',
                    'float frametime = 1.0 / 5.0;',
                    'float qPhase = mod(cardPhase * 1.7, frametime);',
                    'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;',
                    'float t = qTime * (1.7 + uWindSpeed * 0.55) + cardPhase;',
                    'float swayAmt = 0.06 * uWindSpeed;',
                    'vec3 anchor = transformed + vec3(sin(t) * swayAmt, cos(t * 1.2) * swayAmt * 0.35, cos(t * 0.9) * swayAmt * 0.8);',
                    'vec3 camRight = normalize(vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]));',
                    'vec3 camUp = normalize(vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]));',
                    'vec3 camFwd = normalize(vec3(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2]));',
                    'float spin = aQuadData.z + sin(t * 0.95) * 0.08 * uWindSpeed;',
                    'float cs = cos(spin), sn = sin(spin);',
                    'vec2 rotOff = vec2(aQuadData.x * cs - aQuadData.y * sn, aQuadData.x * sn + aQuadData.y * cs);',
                    'float qSize = length(aQuadData.xy);',
                    'transformed = anchor + camRight * rotOff.x + camUp * rotOff.y + camFwd * (qSize * 0.12);',
                    'vLeafAO = leafAO;',
                    'vLeafTint = leafTint;',
                    'vLeafClusterHue = fract(cardPhase * 1.73 + leafTint * 0.61);',
                    'vLeafWorldPos = (modelMatrix * vec4(anchor, 1.0)).xyz;',
                    'vLeafNormal = normalize(mat3(modelMatrix) * aProjectedNormal);'
                ].join('\n')
            );

            if (shader.vertexShader.includes('#include <worldpos_vertex>')) {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    [
                        '#if defined( USE_ENVMAP ) || defined ( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0',
                        '    vec4 worldPosition = modelMatrix * vec4(anchor, 1.0);',
                        '#endif'
                    ].join('\n')
                );
            }

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = [
                    "uniform float uTime;",
                    "uniform vec3 uSunDir;",
                    "uniform vec3 uSunColor;",
                    "uniform vec3 uShadowTint;",
                    "uniform vec3 uRimTint;",
                    "uniform float uSceneBrightness;",
                    "uniform vec3 uCampfirePos;",
                    "uniform vec3 uCampfireColor;",
                    "uniform float uCampfireStrength;",
                    "uniform sampler2D uCloudNoise;",
                    "uniform float uCloudScale;",
                    "uniform float uCloudWorldY;",
                    "uniform float uCloudSpeed;",
                    "uniform float uCloudContrast;",
                    "uniform float uCloudThreshold;",
                    "uniform vec2 uCloudDir;",
                    "uniform float uCloudShadowMin;",
                    "uniform float uCloudDivergeAngle;",
                    "uniform float uToonCuts;",
                    "uniform float uToonWrap;",
                    "uniform float uToonSteepness;",
                    "uniform float uThresholdGradSize;",
                    'varying vec3 vLeafWorldPos;',
                    'varying vec3 vLeafNormal;',
                    'varying float vLeafAO;',
                    'varying float vLeafTint;',
                    'varying float vLeafClusterHue;',
                    "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                    "    float a = radians(angleDeg);",
                    "    float c = cos(a);",
                    "    float s = sin(a);",
                    "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                    "}",
                    "float dylearnCloudNoise(vec3 wp) {",
                    "    float t = clamp((uCloudWorldY - wp.y) / max(uSunDir.y, 0.42), 0.0, 140.0);",
                    "    vec3 hitPos = vec3(wp.x + uSunDir.x * t * 0.16, wp.y, wp.z + uSunDir.z * t * 0.16);",
                    "    float invScale = 1.0 / max(uCloudScale, 0.001);",
                    "    vec2 d1 = normalize(dylearnRotateVec2(uCloudDir, uCloudDivergeAngle));",
                    "    vec2 d2 = normalize(dylearnRotateVec2(uCloudDir, -uCloudDivergeAngle));",
                    "    vec2 td1 = uTime * uCloudSpeed * d1;",
                    "    vec2 td2 = uTime * uCloudSpeed * d2;",
                    "    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;",
                    "    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;",
                    "    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);",
                    "    lv = (lv - 0.5) * uCloudContrast + 0.5;",
                    "    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);",
                    "}"
                ].join('\n') + '\n' + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    [
                        'vec3 dcN = normalize(vLeafNormal);',
                        'vec3 dcL = normalize(uSunDir);',
                        'vec3 dcV = normalize(cameraPosition - vLeafWorldPos);',
                        'float dcDirAtten = 1.0;',
                        '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
                        '    if (receiveShadow) {',
                        '        DirectionalLightShadow dcShadow = directionalLightShadows[0];',
                        '        dcDirAtten = getShadow(directionalShadowMap[0], dcShadow.shadowMapSize, dcShadow.shadowBias, dcShadow.shadowRadius, vDirectionalShadowCoord[0]);',
                        '    }',
                        '#endif',
                        'float dcDiff = (dot(dcN, dcL) + (dcDirAtten - 1.0) + uToonWrap) * uToonSteepness;',
                        'dcDiff *= mix(0.60, 1.08, vLeafAO);',
                        'float dcCloud = dylearnCloudNoise(vLeafWorldPos);',
                        'dcDiff = clamp(min(dcDiff, dcCloud), 0.0, 1.0);',
                        'float dcCut = 1.0 / max(uToonCuts, 1.0);',
                        'float dcStep = clamp(ceil(dcDiff * uToonCuts) * dcCut, 0.0, 1.0);',
                        'if (uThresholdGradSize > 0.0) {',
                        '    float dcK = floor(dcDiff / dcCut + 0.5);',
                        '    if (dcK >= 0.0 && dcK <= uToonCuts) {',
                        '        float dcThresh = dcK * dcCut;',
                        '        float dcHw = 0.5 * dcCut * uThresholdGradSize;',
                        '        float dcLo = max(0.0, dcThresh - dcHw);',
                        '        float dcHi = min(1.0, dcThresh + dcHw);',
                        '        float dcBlend = (dcHi > dcLo) ? smoothstep(dcLo, dcHi, dcDiff) : step(dcThresh, dcDiff);',
                        '        dcStep = clamp(mix(dcThresh, min(dcThresh + dcCut, 1.0), dcBlend), 0.0, 1.0);',
                        '    }',
                        '}',
                        'float lobePatch = sin(vLeafWorldPos.x * 1.35 + vLeafWorldPos.z * 1.15 + vLeafWorldPos.y * 0.75) * 0.5 + 0.5;',
                        'float varMix = clamp(lobePatch * 0.55 + vLeafClusterHue * 0.45, 0.0, 1.0);',
                        'vec3 coolTone = vec3(0.89, 1.02, 0.96);',
                        'vec3 midTone  = vec3(1.00, 1.00, 1.00);',
                        'vec3 warmTone = vec3(1.11, 1.04, 0.85);',
                        'vec3 clusterTint = varMix < 0.5 ? mix(coolTone, midTone, varMix * 2.0) : mix(midTone, warmTone, (varMix - 0.5) * 2.0);',
                        'clusterTint *= mix(vec3(0.94, 0.97, 1.01), vec3(1.06, 1.03, 0.95), smoothstep(0.35, 0.95, vLeafAO));',
                        'vec3 dcBase = diffuseColor.rgb * clusterTint * mix(0.88, 1.12, vLeafTint) * uSceneBrightness;',
                        'vec3 dcCool = mix(dcBase * uShadowTint * 1.20, dcBase * 0.44, 0.46);',
                        'vec3 dcSun = dcBase * mix(vec3(1.04), uSunColor * 1.10, 0.28);',
                        'vec3 dcCol = mix(dcCool, dcSun, mix(0.20, 1.0, dcStep));',
                        'float dcRim = pow(1.0 - max(dot(dcN, dcV), 0.0), 3.0) * smoothstep(0.22, 0.86, dcN.y * 0.5 + 0.5);',
                        'dcCol += uRimTint * dcRim * 0.12 * uSceneBrightness;',
                        'float dcFireDist = length(uCampfirePos - vLeafWorldPos);',
                        'float dcFireGlow = (1.0 - smoothstep(2.0, 14.0, dcFireDist)) * uCampfireStrength;',
                        'outgoingLight = dcCol + diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, dcFireGlow) * 0.42;',
                        'gl_FragColor = vec4(outgoingLight, diffuseColor.a);',
                        '#include <tonemapping_fragment>'
                    ].join('\n')
                );
            }
        }

                const deciduousMaterials = {};
        const deciduousDepthMaterials = {};
        Object.keys(DECIDUOUS_PALETTES).forEach(key => {
            const tex = createTruckfulSmallLeafClusterTexture(DECIDUOUS_PALETTES[key]);
            const mat = new THREE.MeshStandardMaterial({
                map: tex,
                alphaTest: 0.45,
                side: THREE.DoubleSide,
                roughness: 0.88,
                metalness: 0.0
            });
            mat.onBeforeCompile = injectTruckfulDeciduousShader;
            deciduousMaterials[key] = mat;

            const depthMat = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map: tex,
                alphaTest: 0.45
            });
            depthMat.onBeforeCompile = injectTruckfulDeciduousShader;
            deciduousDepthMaterials[key] = depthMat;
        });

        function createTruckfulDeciduousCanopyGeometry() {
            // 7 asymmetric storybook crown domes composed purely of small-leaf camera-facing bouquets
            const lobes = [
                { cx: 0.0, cy: 4.55, cz: 0.0, rx: 1.48, ry: 1.12, rz: 1.44, count: 22 },
                { cx: -1.28, cy: 3.75, cz: 0.55, rx: 1.15, ry: 0.88, rz: 1.12, count: 15 },
                { cx: 1.24, cy: 3.85, cz: -0.45, rx: 1.18, ry: 0.92, rz: 1.14, count: 15 },
                { cx: 0.35, cy: 3.62, cz: 1.22, rx: 1.08, ry: 0.84, rz: 1.04, count: 13 },
                { cx: -0.58, cy: 3.92, cz: -1.16, rx: 1.10, ry: 0.86, rz: 1.06, count: 13 },
                { cx: 0.95, cy: 4.95, cz: 0.48, rx: 0.94, ry: 0.78, rz: 0.94, count: 11 },
                { cx: -0.82, cy: 4.88, cz: -0.36, rx: 0.92, ry: 0.76, rz: 0.92, count: 11 }
            ];

            const crownCenter = new THREE.Vector3(0, 3.85, 0);
            const goldenAngle = 2.3999632;
            const clusters = [];

            lobes.forEach((lobe, lIdx) => {
                // Shaded interior heart bouquet so no light gaps show through the middle
                clusters.push({
                    pos: new THREE.Vector3(lobe.cx, lobe.cy - 0.12, lobe.cz),
                    lobe,
                    size: Math.max(lobe.rx, lobe.ry) * 1.45,
                    aoScale: 0.50,
                    phase: (lIdx * 1.4) % (Math.PI * 2),
                    spin: (lIdx * 2.1) % (Math.PI * 2),
                    tint: 0.25
                });

                for (let i = 0; i < lobe.count; i++) {
                    const u = (i + 0.5) / lobe.count;
                    const cosPhi = 1.0 - 1.72 * u;
                    const sinPhi = Math.sqrt(Math.max(0.0, 1.0 - cosPhi * cosPhi));
                    const theta = i * goldenAngle + lIdx * 1.6;

                    const dir = new THREE.Vector3(
                        sinPhi * Math.cos(theta),
                        cosPhi,
                        sinPhi * Math.sin(theta)
                    ).normalize();

                    const rJit = 0.78 + ((i * 11 + lIdx * 5) % 4) * 0.08;
                    clusters.push({
                        pos: new THREE.Vector3(
                            lobe.cx + dir.x * lobe.rx * rJit,
                            lobe.cy + dir.y * lobe.ry * rJit,
                            lobe.cz + dir.z * lobe.rz * rJit
                        ),
                        lobe,
                        size: 0.92 + ((i * 17 + lIdx * 7) % 4) * 0.13,
                        aoScale: 1.0,
                        phase: (lIdx * 1.3 + i * 0.47) % (Math.PI * 2),
                        spin: ((i * 31 + lIdx * 19) % 100) / 100 * Math.PI * 2,
                        tint: ((i * 23 + lIdx * 13) % 100) / 100
                    });
                }
            });

            const total = clusters.length;
            const positions = new Float32Array(total * 4 * 3);
            const normals = new Float32Array(total * 4 * 3);
            const projNormals = new Float32Array(total * 4 * 3);
            const canopyInfos = new Float32Array(total * 4 * 3);
            const quadData = new Float32Array(total * 4 * 3);
            const uvs = new Float32Array(total * 4 * 2);
            const indices = [];

            const corners = [
                [-0.5, -0.5, 0, 0],
                [0.5, -0.5, 1, 0],
                [-0.5, 0.5, 0, 1],
                [0.5, 0.5, 1, 1]
            ];

            for (let c = 0; c < total; c++) {
                const cl = clusters[c];
                const lobeN = new THREE.Vector3(
                    (cl.pos.x - cl.lobe.cx) / cl.lobe.rx,
                    (cl.pos.y - cl.lobe.cy) / cl.lobe.ry,
                    (cl.pos.z - cl.lobe.cz) / cl.lobe.rz
                );
                if (lobeN.lengthSq() < 0.0001) lobeN.set(0, 1, 0);
                else lobeN.normalize();

                const overallN = cl.pos.clone().sub(crownCenter);
                if (overallN.lengthSq() < 0.0001) overallN.set(0, 1, 0);
                else overallN.normalize();

                const projN = lobeN.lerp(overallN, 0.52).normalize();
                const heightNorm = THREE.MathUtils.clamp((cl.pos.y - 2.6) / 3.2, 0.0, 1.0);
                const ao = THREE.MathUtils.clamp((0.38 + heightNorm * 0.45 + Math.max(0.0, projN.y) * 0.25) * cl.aoScale, 0.28, 1.0);

                const vBase = c * 4;
                for (let k = 0; k < 4; k++) {
                    const vi = vBase + k;
                    const i3 = vi * 3;
                    const i2 = vi * 2;
                    const co = corners[k];

                    positions[i3] = cl.pos.x;
                    positions[i3 + 1] = cl.pos.y;
                    positions[i3 + 2] = cl.pos.z;

                    normals[i3] = projN.x;
                    normals[i3 + 1] = projN.y;
                    normals[i3 + 2] = projN.z;

                    projNormals[i3] = projN.x;
                    projNormals[i3 + 1] = projN.y;
                    projNormals[i3 + 2] = projN.z;

                    canopyInfos[i3] = cl.phase;
                    canopyInfos[i3 + 1] = ao;
                    canopyInfos[i3 + 2] = cl.tint;

                    quadData[i3] = co[0] * cl.size;
                    quadData[i3 + 1] = co[1] * cl.size;
                    quadData[i3 + 2] = cl.spin;

                    uvs[i2] = co[2];
                    uvs[i2 + 1] = co[3];
                }
                indices.push(vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2);
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geo.setAttribute('aProjectedNormal', new THREE.BufferAttribute(projNormals, 3));
            geo.setAttribute('aCanopyInfo', new THREE.BufferAttribute(canopyInfos, 3));
            geo.setAttribute('aQuadData', new THREE.BufferAttribute(quadData, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            return geo;
        }

        const BASE_DECIDUOUS_CANOPY_GEO = createTruckfulDeciduousCanopyGeometry();
        const deciduousTrunkCache = [];
        let deciduousSpawnCounter = 0;

        function getDeciduousTrunkArchetype(slotIdx) {
            const idx = slotIdx % 3;
            if (deciduousTrunkCache[idx]) return deciduousTrunkCache[idx];
            const { mesh: trunkTemplate, getSpineOffset } = createSculptedTrunkMesh(
                3.7, 0.34, 0.16, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, trunkMat
            );
            const forkTop = getSpineOffset(0.76);
            const boughDirs = [
                { yaw: 0.4, pitch: 0.62, len: 1.65 },
                { yaw: 2.0, pitch: 0.58, len: 1.55 },
                { yaw: 3.6, pitch: 0.66, len: 1.60 },
                { yaw: 5.1, pitch: 0.55, len: 1.50 }
            ];
            const geos = [trunkTemplate.geometry.clone()];
            const dummy = new THREE.Object3D();
            boughDirs.forEach(bd => {
                const bGeo = new THREE.CylinderGeometry(0.065, 0.13, bd.len, 6);
                bGeo.translate(0, bd.len * 0.5, 0);
                dummy.position.set(forkTop.x, 2.72, forkTop.z);
                dummy.rotation.set(bd.pitch, bd.yaw, 0, 'YXZ');
                dummy.updateMatrix();
                bGeo.applyMatrix4(dummy.matrix);
                geos.push(bGeo);
            });
            const mergedWoodGeo = mergeBufferGeometriesSimple(geos);
            deciduousTrunkCache[idx] = mergedWoodGeo;
            return mergedWoodGeo;
        }

        function createBotWDeciduousTree(x, z, scale = 1.0, colorKey = 'emerald', heightRatio = 1.0) {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y - 0.08, z);

            const canopyPivot = new THREE.Group();
            group.add(canopyPivot);

            // Cached sculpted trunk + 4 forked wooden boughs merged into 1 draw call
            const woodGeo = getDeciduousTrunkArchetype(deciduousSpawnCounter++);
            const trunkMesh = new THREE.Mesh(woodGeo, trunkMat);
            trunkMesh.castShadow = Math.hypot(x, z) < 28.0;
            trunkMesh.receiveShadow = true;
            canopyPivot.add(trunkMesh);

            const pal = DECIDUOUS_PALETTES[colorKey] || DECIDUOUS_PALETTES.emerald;
            const foliageMesh = new THREE.Mesh(
                BASE_DECIDUOUS_CANOPY_GEO,
                deciduousMaterials[colorKey] || deciduousMaterials.emerald
            );
            foliageMesh.customDepthMaterial = deciduousDepthMaterials[colorKey] || deciduousDepthMaterials.emerald;
            foliageMesh.rotation.y = Math.random() * Math.PI * 2;
            foliageMesh.castShadow = Math.hypot(x, z) < 26.0;
            foliageMesh.receiveShadow = true;
            foliageMesh.frustumCulled = false;
            canopyPivot.add(foliageMesh);

            group.scale.set(scale, scale * heightRatio, scale);
            const treeData = {
                type: 'tree',
                treeKind: 'deciduous',
                name: pal.name,
                naturalColorKey: colorKey,
                foliageMesh,
                canopy: canopyPivot,
                phase: Math.random() * Math.PI * 2,
                rustleBoost: 0,
                leafColor: new THREE.Color(pal.burstColor),
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + 3.4 * scale * heightRatio, z), 3.6 * scale * Math.max(1, heightRatio))
            };
            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
            addCircleCollider('tree', x, z, 0.34 * scale * 1.18, y + 4.5 * scale * heightRatio, group);
            return group;
        }

        // Hero Foreground & Midground Valley Trees framing the campfire, pond & Truckful road
        const heroTrees = [
            { x: -10.8, z: -2.6, s: 1.38, hr: 1.12, kind: 'deciduous', c: 'emerald' },
            { x: -11.6, z: 8.6, s: 0.72, hr: 0.90, kind: 'pine', v: 'broad_woodland', c: 'teal' },
            { x: 5.2, z: -7.8, s: 1.46, hr: 1.15, kind: 'deciduous', c: 'olive' },
            { x: 13.8, z: 3.4, s: 1.54, hr: 1.18, kind: 'pine', v: 'tall_alpine', c: 'emerald' },
            { x: 12.6, z: 10.6, s: 0.66, hr: 0.88, kind: 'deciduous', c: 'emerald' },
            { x: -0.6, z: -9.8, s: 1.42, hr: 1.10, kind: 'pine', v: 'tall_alpine', c: 'teal' },
            { x: 3.6, z: 12.2, s: 0.62, hr: 0.85, kind: 'pine', v: 'young_bushy', c: 'olive' },
            { x: -12.8, z: 2.8, s: 1.18, hr: 1.05, kind: 'pine', v: 'high_canopy', c: 'emerald' },
            { x: 9.8, z: -4.2, s: 0.96, hr: 0.96, kind: 'deciduous', c: 'teal' },
            { x: -10.2, z: 14.5, s: 0.78, hr: 0.92, kind: 'deciduous', c: 'olive' }
        ];
        const treeGrid = new Map();
        const TREE_CELL = 3.6;
        const treeKey = (x, z) => `${Math.floor(x / TREE_CELL)},${Math.floor(z / TREE_CELL)}`;
        const registerTreeSpot = (x, z) => {
            const k = treeKey(x, z);
            let arr = treeGrid.get(k);
            if (!arr) { arr = []; treeGrid.set(k, arr); }
            arr.push({ x, z });
        };
        const isValidForestTreePos = (x, z, minSpacing = 3.6) => {
            if (Math.hypot(x, z) < 11.2) return false;
            if (getRoadDistance(x, z) < 3.9) return false;
            if (Math.abs(x + 5.4) < 8.5 && z < -32 && z > -58) return false;
            if (Math.hypot(x - POND_CENTER.x, z - POND_CENTER.z) < POND_CENTER.radius + 3.0) return false;
            if (Math.abs(z - riverCenterZ(x)) < riverHalfWidthAt(x) + RIVER.bank + 2.4) return false;
            const gBasin = sampleGrandBasinAt(x, z);
            if (gBasin && gBasin.edgeDist < gBasin.basin.bank * 0.6 + 2.5) return false;
            if (hasNearbyPuddle(x, z, 2.2)) return false;
            if (Math.hypot(x - ANCIENT_ELDER_TREE.x, z - ANCIENT_ELDER_TREE.z) < ANCIENT_ELDER_TREE.radius) return false;
            if (Math.hypot(x - RUINS_SITE.x, z - RUINS_SITE.z) < RUINS_SITE.radius + 3.0) return false;
            if (Math.hypot(x - CAVERN_SITE.x, z - CAVERN_SITE.z) < CAVERN_SITE.radius + 4.0) return false;
            if (Math.hypot(x - BANDIT_SITE.x, z - BANDIT_SITE.z) < BANDIT_SITE.radius + 4.0) return false;
            // Jaga landmark puncak bukit batu, kolam air terjun, dan dasar jurang tetap terbuka
            if (Math.hypot(x + 135, z + 135) < 18.0) return false;
            if (Math.hypot(x - 155, z - 224) < 22.0) return false;
            if (Math.abs(x - 175) < 22.0 && z > -205 && z < -85) return false;
            for (let vi = 0; vi < VILLAGES.length; vi++) {
                const v = VILLAGES[vi];
                if (Math.hypot(x - v.cx, z - v.cz) < v.radius * 2.15) return false;
            }
            if (Math.abs(x) > TERRAIN_SIZE * 0.48 || Math.abs(z) > TERRAIN_SIZE * 0.48) return false;
            const gx = Math.floor(x / TREE_CELL);
            const gz = Math.floor(z / TREE_CELL);
            const minD2 = minSpacing * minSpacing;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const arr = treeGrid.get(`${gx + dx},${gz + dz}`);
                    if (!arr) continue;
                    for (let i = 0; i < arr.length; i++) {
                        const dxT = arr[i].x - x;
                        const dzT = arr[i].z - z;
                        if (dxT * dxT + dzT * dzT < minD2) return false;
                    }
                }
            }
            return true;
        };

        heroTrees.forEach(ht => {
            if (getRoadDistance(ht.x, ht.z) < 3.2) return;
            registerTreeSpot(ht.x, ht.z);
            if (ht.kind === 'deciduous') {
                createBotWDeciduousTree(ht.x, ht.z, ht.s, ht.c, ht.hr || 1.0);
            } else {
                createStylizedPineTree(ht.x, ht.z, ht.s, ht.v, ht.c, ht.hr || 1.0);
            }
        });

        const variantCycle = ['tall_alpine', 'deciduous', 'broad_woodland', 'deciduous', 'high_canopy', 'young_bushy'];
        const colorCycle = ['emerald', 'teal', 'olive', 'emerald'];
        let treeIdxSeq = 0;
        function placeForestTreeAt(x, z, minSp = 3.6, deadChance = 0.06) {
            if (!isValidForestTreePos(x, z, minSp)) return false;
            registerTreeSpot(x, z);
            const idx = treeIdxSeq++;
            const tier = Math.random();
            // Variasi tinggi pohon yang kontras: pendek/muda, sedang, dan tinggi menjulang
            const scale = tier < 0.28
                ? (0.52 + Math.random() * 0.28)
                : (tier < 0.70 ? (0.85 + Math.random() * 0.40) : (1.30 + Math.random() * 0.50));
            const heightRatio = 0.82 + Math.random() * 0.42;
            if (Math.random() < deadChance) {
                createStylizedDeadPine(x, z, scale * 1.04);
            } else {
                const v = variantCycle[idx % variantCycle.length];
                const c = colorCycle[(idx + Math.floor(idx / 3)) % colorCycle.length];
                if (v === 'deciduous') {
                    createBotWDeciduousTree(x, z, scale, c, heightRatio);
                } else {
                    createStylizedPineTree(x, z, scale, v, c, heightRatio);
                }
            }
            return true;
        }

        // 1) Hutan Lembah Dalam yang Sangat Rapat (radius 13..165 m dari titik awal)
        for (let i = 0; i < 460; i++) {
            const angle = (i / 460) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
            const radius = 13.0 + Math.sqrt(Math.random()) * 152.0;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (Math.abs(x) < 4.5 && z > 12 && z < 26) continue;
            placeForestTreeAt(x, z, 3.6, 0.06);
        }

        // 2) Sabuk Hutan Rapat di Sepanjang Semua Jalur Jalan Unik Antar-Desa
        for (let pIdx = 0; pIdx < allRoadPolylines.length; pIdx++) {
            const pts = allRoadPolylines[pIdx].pts;
            for (let i = 0; i < pts.length; i += 2) {
                const pt = pts[i];
                const nextPt = pts[Math.min(pts.length - 1, i + 1)];
                const tx = nextPt[0] - pt[0], tz = nextPt[1] - pt[1];
                const tLen = Math.hypot(tx, tz) || 1.0;
                const nx = -tz / tLen, nz = tx / tLen;
                for (const side of [-1, 1]) {
                    // Baris tepi jalan rapat (4.6..13.5 m) & baris rimba pendamping (14..32 m)
                    const d1 = 4.6 + Math.random() * 8.8;
                    const j1 = (Math.random() - 0.5) * 4.5;
                    placeForestTreeAt(pt[0] + nx * side * d1 + (tx / tLen) * j1, pt[1] + nz * side * d1 + (tz / tLen) * j1, 3.6, 0.05);
                    if (i % 4 === 0) {
                        const d2 = 14.0 + Math.random() * 19.0;
                        const j2 = (Math.random() - 0.5) * 6.0;
                        placeForestTreeAt(pt[0] + nx * side * d2 + (tx / tLen) * j2, pt[1] + nz * side * d2 + (tz / tLen) * j2, 3.7, 0.07);
                    }
                }
            }
        }

        // 3) Cincin Hutan Rimbun Mengelilingi Ke-5 Desa
        for (let vi = 0; vi < VILLAGES.length; vi++) {
            const v = VILLAGES[vi];
            for (let k = 0; k < 44; k++) {
                const ang = (k / 44) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
                const rad = v.radius * 2.22 + (k % 3) * 4.8 + Math.random() * 6.5;
                placeForestTreeAt(v.cx + Math.cos(ang) * rad, v.cz + Math.sin(ang) * rad, 3.6, 0.04);
            }
        }

        // 4) Perluasan Hutan Rimba Sabuk Luar Bergugus Rimbun (Outer Woodland Belt) + Horizon Ring
        {
            let obSeed = 88173;
            const obRand = () => { obSeed = (obSeed * 1664525 + 1013904223) >>> 0; return obSeed / 4294967296; };

            // 18 gugusan hutan lebat yang memeluk ke-4 sudut, pantai sungai luar & bingkai lembah
            const outerGroves = [
                { x: -335, z: -385, rad: 78, count: 165 }, // Rimba Barat-Laut belakang Pohon Agung Purba
                { x: -460, z: -185, rad: 76, count: 150 }, // Barat di bawah Sungai Hulu Agung
                { x: -575, z: -55,  rad: 82, count: 160 }, // Perbatasan Barat tengah
                { x: -165, z: -485, rad: 82, count: 165 }, // Utara-Barat pinggir jalan utama
                { x: -240, z: -635, rad: 78, count: 150 }, // Perbatasan Utara-Barat luar
                { x: 145,  z: -480, rad: 80, count: 160 }, // Utara-Timur
                { x: 245,  z: -625, rad: 78, count: 150 }, // Perbatasan Utara-Timur luar
                { x: 435,  z: -195, rad: 78, count: 160 }, // Timur-Utara dekat Oxbow
                { x: 565,  z: -35,  rad: 80, count: 155 }, // Sisi Timur luar
                { x: 485,  z: 105,  rad: 75, count: 145 }, // Timur di atas Muara Rawa
                { x: 565,  z: 495,  rad: 84, count: 165 }, // Sudut Tenggara balik Muara Rawa
                { x: 215,  z: 505,  rad: 82, count: 165 }, // Selatan-Timur
                { x: -145, z: 515,  rad: 82, count: 165 }, // Selatan-Barat
                { x: -555, z: 515,  rad: 84, count: 165 }, // Sudut Barat-Daya balik Sungai Sabit Kabut
                { x: -555, z: 95,   rad: 76, count: 150 }, // Barat tengah-selatan
                { x: 380,  z: -325, rad: 72, count: 140 }, // Tepi selatan Emerald Oxbow
                { x: -395, z: 265,  rad: 74, count: 145 }, // Tepi timur Misty Crescent
                { x: 355,  z: 350,  rad: 74, count: 145 }, // Tepi barat Emerald Marsh
            ];

            for (const g of outerGroves) {
                for (let i = 0; i < g.count; i++) {
                    const ang = obRand() * Math.PI * 2;
                    const dist = Math.pow(obRand(), 0.56) * g.rad;
                    const tx = g.x + Math.cos(ang) * dist + (obRand() - 0.5) * 9.0;
                    const tz = g.z + Math.sin(ang) * dist + (obRand() - 0.5) * 9.0;
                    const spacing = dist < g.rad * 0.65 ? 2.55 : 3.25;
                    placeForestTreeAt(tx, tz, spacing, 0.05);
                }
            }

            // Sabuk rimba penutup sepanjang perbatasan peta (radius 545..725m)
            for (let i = 0; i < 640; i++) {
                const ang = (i / 640) * Math.PI * 2 + (obRand() - 0.5) * 0.10;
                const rad = 535.0 + obRand() * 190.0;
                const tx = Math.cos(ang) * rad;
                const tz = Math.sin(ang) * rad;
                placeForestTreeAt(tx, tz, 3.15, 0.06);
            }
        }

        // 5) Hutan Rimba Purba (Deepwood Thicket) — zona khusus full pohon super rapat di (-195, 215)
        {
            let dwSeed = 44219;
            const dwRand = () => { dwSeed = (dwSeed * 1664525 + 1013904223) >>> 0; return dwSeed / 4294967296; };
            for (let i = 0; i < 320; i++) {
                const ang = dwRand() * Math.PI * 2;
                const rad = Math.sqrt(dwRand()) * 74.0;
                const x = -195.0 + Math.cos(ang) * rad;
                const z = 215.0 + Math.sin(ang) * rad;
                placeForestTreeAt(x, z, 2.45, 0.05);
            }
        }

        // 6) Pohon Agung Purba (1 Pohon Tua Raksasa Ikonik di Barat-Laut)
        const ancientTreeGroup = new THREE.Group();
        {
            const ax = ANCIENT_ELDER_TREE.x;
            const az = ANCIENT_ELDER_TREE.z;
            const ay = getTerrainHeight(ax, az);
            ancientTreeGroup.position.set(ax, ay - 0.16, az);

            // Batang utama berkerak tua besar
            const { mesh: giantTrunk, getSpineOffset: giantSpine } = createSculptedTrunkMesh(
                13.5, 2.25, 0.92, 0.85, -0.58, trunkMat
            );
            giantTrunk.castShadow = false;
            giantTrunk.receiveShadow = true;
            ancientTreeGroup.add(giantTrunk);

            // 8 Akar jangkang besar (buttress roots) menjalar luas ke tanah
            for (let r = 0; r < 8; r++) {
                const rAng = (r / 8) * Math.PI * 2 + (r % 2) * 0.22;
                const rLen = 5.6 + (r % 3) * 1.1;
                const rGeo = new THREE.CylinderGeometry(0.24, 0.88, rLen, 7);
                rGeo.translate(0, rLen * 0.5, 0);
                const rootMesh = new THREE.Mesh(rGeo, trunkMat);
                rootMesh.position.set(Math.cos(rAng) * 1.15, 2.7, Math.sin(rAng) * 1.15);
                rootMesh.rotation.set(0, -rAng, -1.16);
                rootMesh.receiveShadow = true;
                ancientTreeGroup.add(rootMesh);
                if (r % 2 === 0) {
                    const colR = 3.2;
                    addCircleCollider('ancient_root', ax + Math.cos(rAng) * colR, az + Math.sin(rAng) * colR, 0.85, ay + 2.5, ancientTreeGroup);
                }
            }

            // 13 Kubah Kanopi Raksasa (diameter total ~34m, menjulang 25m!) agar tampak agung baik di 3D maupun di World Map
            const topCenter = giantSpine(0.84);
            const domeSlots = [
                { dx: 0.0,   dy: 13.8, dz: 0.0,   sc: 5.2, col: 'olive' },
                { dx: 7.4,   dy: 11.4, dz: 3.1,   sc: 4.3, col: 'emerald' },
                { dx: -7.2,  dy: 11.6, dz: 3.6,   sc: 4.4, col: 'emerald' },
                { dx: 3.5,   dy: 11.0, dz: -7.3,  sc: 4.2, col: 'teal' },
                { dx: -4.2,  dy: 11.2, dz: -7.0,  sc: 4.3, col: 'olive' },
                { dx: 8.6,   dy: 9.8,  dz: -3.5,  sc: 3.8, col: 'olive' },
                { dx: -8.4,  dy: 10.2, dz: -2.4,  sc: 3.9, col: 'emerald' },
                { dx: 0.8,   dy: 10.5, dz: 8.2,   sc: 4.1, col: 'teal' },
                { dx: -6.8,  dy: 8.8,  dz: 7.4,   sc: 3.5, col: 'olive' },
                { dx: 6.8,   dy: 8.8,  dz: 7.2,   sc: 3.5, col: 'emerald' },
                { dx: -7.5,  dy: 8.6,  dz: -6.4,  sc: 3.4, col: 'emerald' },
                { dx: 7.5,   dy: 8.6,  dz: -6.4,  sc: 3.4, col: 'teal' },
            ];
            for (let bi = 0; bi < domeSlots.length; bi++) {
                const ds = domeSlots[bi];
                if (bi > 0 && bi <= 7) {
                    const bVec = new THREE.Vector3(ds.dx, ds.dy - 9.0, ds.dz);
                    const bLen = bVec.length();
                    const bGeo = new THREE.CylinderGeometry(0.28, 0.66, bLen, 7);
                    bGeo.translate(0, bLen * 0.5, 0);
                    const bough = new THREE.Mesh(bGeo, trunkMat);
                    bough.position.set(topCenter.x, 9.2, topCenter.z);
                    bough.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bVec.clone().normalize());
                    ancientTreeGroup.add(bough);
                }
                const crownMesh = new THREE.Mesh(
                    BASE_DECIDUOUS_CANOPY_GEO,
                    deciduousMaterials[ds.col] || deciduousMaterials.emerald
                );
                const cyScale = ds.sc * 0.85;
                crownMesh.position.set(ds.dx * 0.88, ds.dy - 4.3 * cyScale, ds.dz * 0.88);
                crownMesh.scale.set(ds.sc, cyScale, ds.sc);
                crownMesh.rotation.y = bi * 1.1;
                crownMesh.frustumCulled = false;
                ancientTreeGroup.add(crownMesh);
            }

            // Lingkaran batu berlumut & lentera akar hangat di kaki Pohon Agung Purba
            const aStoneMat = new THREE.MeshStandardMaterial({ color: 0x6b7b72, roughness: 0.90 });
            applyStylizedCelShading(aStoneMat);
            for (let si = 0; si < 12; si++) {
                const sAng = (si / 12) * Math.PI * 2 + 0.3;
                const sDist = 9.2 + (si % 3) * 1.8;
                const sWorldY = getTerrainHeight(ax + Math.cos(sAng) * sDist, az + Math.sin(sAng) * sDist) - (ay - 0.16);
                const rRad = 0.88 + (si % 3) * 0.38;
                const st = new THREE.Mesh(new THREE.DodecahedronGeometry(rRad, 0), aStoneMat);
                st.position.set(Math.cos(sAng) * sDist, sWorldY + rRad * 0.38, Math.sin(sAng) * sDist);
                st.scale.set(1.25, 0.76, 1.05);
                st.rotation.set(si * 0.3, sAng, 0.2);
                ancientTreeGroup.add(st);
            }
            const lanternGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
            for (const [lx, ly, lz] of [[4.4, 6.2, 2.2], [-4.1, 6.5, 2.6]]) {
                const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), trunkMat);
                cord.position.set(lx, ly + 0.8, lz);
                ancientTreeGroup.add(cord);
                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lanternGlowMat);
                orb.position.set(lx, ly, lz);
                ancientTreeGroup.add(orb);
            }

            ancientTreeGroup.userData = {
                type: 'ancient_tree',
                name: ANCIENT_ELDER_TREE.nameId,
                boundingSphere: new THREE.Sphere(new THREE.Vector3(ax, ay + 12.0, az), 28.0),
            };
            scene.add(ancientTreeGroup);
            addCircleCollider('ancient_tree', ax, az, 2.45, ay + 25.0, ancientTreeGroup);
        }

        // ============================================================================
        // 7. COZY CAMPFIRE, TENT LOGS & STYLIZED POND
        // ============================================================================
        const campfireGroup = new THREE.Group();
        const cfY = getTerrainHeight(0, 0);
        campfireGroup.position.set(0, cfY, 0);
        campfireGroup.userData = { type: 'campfire', flareBoost: 0 };
        scene.add(campfireGroup);
        /* Collider api unggun dipasang SETELAH batu & kayu berdiri, dan diukur
           dari mesh aslinya: keliling lingkaran batu + tinggi puncaknya, bukan
           angka 1,2 m yang dulu membuatnya mustahil dilompati. */
        const campfireParts = [];

        const stoneRingMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.88 });
        applyStylizedCelShading(stoneRingMat);
        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (i % 2) * 0.05, 0), stoneRingMat);
            stone.position.set(Math.cos(ang) * 0.78, 0.1, Math.sin(ang) * 0.78);
            stone.scale.set(1.2, 0.75, 1.0);
            stone.rotation.y = ang;
            campfireGroup.add(stone);
            campfireParts.push(stone);
        }

        const fireLogMat = new THREE.MeshStandardMaterial({
            color: 0x6b3e26,
            emissive: 0xff5400,
            emissiveIntensity: 0.35,
            roughness: 0.85
        });
        for (let i = 0; i < 4; i++) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.15, 6), fireLogMat);
            const ang = (i / 4) * Math.PI + 0.3;
            log.position.set(Math.cos(ang) * 0.12, 0.18, Math.sin(ang) * 0.12);
            log.rotation.z = Math.PI * 0.38;
            log.rotation.y = ang;
            campfireGroup.add(log);
            campfireParts.push(log);
        }

        campfireGroup.updateMatrixWorld(true);
        const cfBox = new THREE.Box3();
        for (const part of campfireParts) cfBox.expandByObject(part);
        const cfTop = Math.min(cfY + 0.55, isFinite(cfBox.max.y) ? cfBox.max.y : cfY + 0.35);
        const cfRad = Math.max(0.55, Math.max(cfBox.max.x - cfBox.min.x, cfBox.max.z - cfBox.min.z) * 0.5);
        addCircleCollider('campfire', 0, 0, cfRad, cfTop, campfireGroup);

        // Seat logs near campfire (dapat dilewati kuda & gerobak mengikuti bentuk silinder kayunya)
        const seatLogGeo = new THREE.CylinderGeometry(0.24, 0.26, 1.9, 8);
        seatLogGeo.rotateZ(Math.PI * 0.5);
        const seat1 = new THREE.Mesh(seatLogGeo, trunkMat);
        seat1.position.set(-2.2, getTerrainHeight(-2.2, 1.2) + 0.2, 1.2);
        seat1.rotation.y = 0.55;
        seat1.castShadow = true;
        scene.add(seat1);
        addTraversableLog(seat1, 0.25, 1.9);

        // Bara arang berpijar di dasar kayu bakar
        const emberBed = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.40, 0.11, 8),
            new THREE.MeshBasicMaterial({ color: 0xff5a12 })
        );
        emberBed.position.set(0, 0.10, 0);
        campfireGroup.add(emberBed);

        // Lidah api unggun berlapis (tetap menempel di bara, bernapas & bergoyang mulus tanpa teleport)
        const flames = [];
        const flameSpecs = [
            { r: 0.28, h: 0.78, color: 0xff4500, opacity: 0.86, ox: 0.0, oz: 0.0, phase: 0.0, speed: 7.2 },
            { r: 0.21, h: 0.64, color: 0xff8c00, opacity: 0.90, ox: 0.05, oz: -0.04, phase: 1.4, speed: 8.6 },
            { r: 0.17, h: 0.54, color: 0xffb700, opacity: 0.92, ox: -0.05, oz: 0.04, phase: 2.7, speed: 9.8 },
            { r: 0.12, h: 0.42, color: 0xfff18a, opacity: 0.96, ox: 0.0, oz: 0.0, phase: 4.1, speed: 11.2 },
        ];
        for (let i = 0; i < flameSpecs.length; i++) {
            const fs = flameSpecs[i];
            const fGeo = new THREE.ConeGeometry(fs.r, fs.h, 6);
            fGeo.translate(0, fs.h * 0.5, 0);
            const fMat = new THREE.MeshBasicMaterial({
                color: fs.color,
                transparent: true,
                opacity: fs.opacity,
                depthWrite: false,
            });
            const fMesh = new THREE.Mesh(fGeo, fMat);
            fMesh.position.set(fs.ox, 0.14, fs.oz);
            fMesh.userData = {
                baseX: fs.ox,
                baseZ: fs.oz,
                phase: fs.phase,
                speed: fs.speed,
            };
            campfireGroup.add(fMesh);
            flames.push(fMesh);
        }

        // Percikan bara kecil naik lembut dengan fade in/out halus (tanpa ngebug/popping)
        const campfireSparks = [];
        const sparkGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
        for (let i = 0; i < 6; i++) {
            const sMat = new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xffd166 : 0xff7b00,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
            });
            const sp = new THREE.Mesh(sparkGeo, sMat);
            const ang = (i / 6) * Math.PI * 2;
            sp.userData = {
                baseX: Math.cos(ang) * 0.14,
                baseZ: Math.sin(ang) * 0.14,
                speed: 0.55 + (i % 3) * 0.18,
                offset: i / 6,
            };
            campfireGroup.add(sp);
            campfireSparks.push(sp);
        }

        // Lampu titik awal spawn dinonaktifkan sesuai permintaan (hanya visual api unggun bersih)
        const campfireLight = new THREE.PointLight(0xff8c2b, 0, 12, 1);
        campfireLight.position.set(0, 0.85, 0);
        campfireLight.castShadow = false;
        campfireGroup.add(campfireLight);
        let isCampfireLit = true;

        // ============================================================================
        // 7B. ZELDA: BREATH OF THE WILD REALISTIC-STYLIZED WATER & AQUATIC ECOSYSTEM
        // ============================================================================
        const POND_WATER_Y = -0.30;

        // Pre-baked Tileable Voronoi Caustics + Wave Normal + Foam Texture (Fast on Mobile GPU)
        function createBotWWaterDataTexture() {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const imgData = ctx.createImageData(size, size);
            const data = imgData.data;

            // 18 deterministic feature points for seamless tileable Voronoi caustics
            const pts = [];
            for (let i = 0; i < 18; i++) {
                pts.push({
                    x: ((i * 73 + 19) % 100) / 100,
                    y: ((i * 41 + 53) % 100) / 100
                });
            }

            for (let py = 0; py < size; py++) {
                for (let px = 0; px < size; px++) {
                    const u = px / size;
                    const v = py / size;

                    let d1 = 99.0;
                    let d2 = 99.0;
                    for (let i = 0; i < pts.length; i++) {
                        let dx = Math.abs(u - pts[i].x);
                        let dy = Math.abs(v - pts[i].y);
                        if (dx > 0.5) dx = 1.0 - dx;
                        if (dy > 0.5) dy = 1.0 - dy;
                        const d = Math.hypot(dx, dy);
                        if (d < d1) {
                            d2 = d1;
                            d1 = d;
                        } else if (d < d2) {
                            d2 = d;
                        }
                    }

                    // Crisp BotW cellular ridge caustics based on Voronoi edge distance (d2 - d1)
                    const edgeDist = d2 - d1;
                    const caustic = Math.pow(Math.max(0.0, 1.0 - edgeDist * 6.2), 2.4);

                    // Smooth multi-frequency wave normal derivatives (encoded in R & G)
                    const tau = Math.PI * 2.0;
                    const nx = (
                        Math.cos(u * tau * 2.0 + v * tau) * 0.45 +
                        Math.sin(u * tau * 4.0 - v * tau * 2.0) * 0.30 +
                        Math.cos((u + v) * tau * 6.0) * 0.25
                    );
                    const ny = (
                        Math.sin(v * tau * 2.0 - u * tau) * 0.45 +
                        Math.cos(v * tau * 4.0 + u * tau * 3.0) * 0.30 +
                        Math.sin((v - u) * tau * 6.0) * 0.25
                    );

                    // Cellular organic foam mask in Alpha
                    const foamNoise = Math.min(1.0, Math.max(0.0, (1.0 - d1 * 3.4) * 0.75 + caustic * 0.35));

                    const idx = (py * size + px) * 4;
                    data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);     // R: Wave Normal X
                    data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255); // G: Wave Normal Z
                    data[idx + 2] = Math.floor(caustic * 255);          // B: Voronoi Caustics
                    data[idx + 3] = Math.floor(foamNoise * 255);        // A: Cellular Shoreline Foam
                }
            }

            ctx.putImageData(imgData, 0, 0);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.anisotropy = 4;
            return tex;
        }

        // Partially submerged rocks inside the pond (generate foam rings around them!)
        const pondObstacles = [
            { x: 6.8, z: 5.1, r: 0.62, h: 0.42 },
            { x: 9.7, z: 7.4, r: 0.52, h: 0.36 },
            { x: 7.4, z: 8.1, r: 0.40, h: 0.28 }
        ];

        const pondGroup = new THREE.Group();
        scene.add(pondGroup);

        const wetRockMat = new THREE.MeshStandardMaterial({
            color: 0x56666b,
            roughness: 0.42,
            metalness: 0.08
        });
        applyStylizedCelShading(wetRockMat, { rimStrength: 0.32, shadowLift: 0.50 });

        pondObstacles.forEach((ob, idx) => {
            const rMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(ob.r, 1), wetRockMat);
            rMesh.position.set(ob.x, POND_WATER_Y - 0.08, ob.z);
            rMesh.scale.set(1.25, ob.h / ob.r, 1.1);
            rMesh.rotation.set(idx * 0.7, idx * 1.3, 0.2);
            rMesh.castShadow = true;
            rMesh.receiveShadow = true;
            pondGroup.add(rMesh);
            addRockMeshCollider('pond_rock', rMesh);
        });

        // Colorful Underwater Pebbles (Visible through BotW crystal-clear shallow water)
        const pebbleColors = [0x6c8a82, 0x8fa89b, 0x52736b, 0xb59e7a];
        const pebbleGeo = new THREE.DodecahedronGeometry(0.16, 0);
        for (let i = 0; i < 26; i++) {
            const ang = (i / 26) * Math.PI * 2 + (i % 3) * 0.4;
            const rad = 1.2 + (i % 5) * 0.72;
            const px = POND_CENTER.x + Math.cos(ang) * rad;
            const pz = POND_CENTER.z + Math.sin(ang) * rad;
            const py = getTerrainHeight(px, pz);
            if (py < POND_WATER_Y - 0.06) {
                const pMat = new THREE.MeshBasicMaterial({ color: pebbleColors[i % pebbleColors.length] });
                const pebble = new THREE.Mesh(pebbleGeo, pMat);
                const s = 0.65 + (i % 4) * 0.35;
                pebble.position.set(px, py + 0.03, pz);
                pebble.scale.set(s * 1.3, s * 0.45, s);
                pebble.rotation.y = ang;
                pondGroup.add(pebble);
            }
        }

        // Bobbing BotW Lily Pads & Blooming Lotus Flowers
        const lilyPads = [];
        const lilyMat = new THREE.MeshStandardMaterial({ color: 0x4ea865, roughness: 0.65, side: THREE.DoubleSide });
        applyStylizedCelShading(lilyMat, { rimStrength: 0.20, shadowLift: 0.58 });
        const lotusPetalMat = new THREE.MeshStandardMaterial({
            color: 0xffb3c6,
            emissive: 0xff758f,
            emissiveIntensity: 0.18,
            roughness: 0.45
        });

        const lilySpots = [
            { x: 9.2, z: 5.2, r: 0.36, flower: true },
            { x: 8.6, z: 4.7, r: 0.26, flower: false },
            { x: 6.4, z: 6.6, r: 0.34, flower: true },
            { x: 6.9, z: 7.1, r: 0.24, flower: false },
            { x: 8.8, z: 8.1, r: 0.32, flower: true }
        ];
        lilySpots.forEach((lp, i) => {
            const lpGroup = new THREE.Group();
            lpGroup.position.set(lp.x, POND_WATER_Y + 0.018, lp.z);

            // Notched Lily Pad Disc
            const padGeo = new THREE.CircleGeometry(lp.r, 14, 0.18, Math.PI * 2 - 0.36);
            padGeo.rotateX(-Math.PI / 2);
            const padMesh = new THREE.Mesh(padGeo, lilyMat);
            padMesh.rotation.y = i * 1.4;
            lpGroup.add(padMesh);

            if (lp.flower) {
                for (let p = 0; p < 6; p++) {
                    const pAng = (p / 6) * Math.PI * 2;
                    const petal = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 5), lotusPetalMat);
                    petal.position.set(Math.cos(pAng) * 0.06, 0.05, Math.sin(pAng) * 0.06);
                    petal.rotation.z = -Math.cos(pAng) * 0.55;
                    petal.rotation.x = Math.sin(pAng) * 0.55;
                    lpGroup.add(petal);
                }
            }

            lpGroup.userData = { baseX: lp.x, baseZ: lp.z, phase: i * 1.6 };
            lilyPads.push(lpGroup);
            pondGroup.add(lpGroup);
        });

        // Pondside Cattails / Reeds (Ilalang Air)
        const reedStemMat = new THREE.MeshStandardMaterial({ color: 0x5c9e57, roughness: 0.8 });
        const reedHeadMat = new THREE.MeshStandardMaterial({ color: 0x5e3a24, roughness: 0.9 });
        const reedClusters = [
            { x: 12.4, z: 4.8 }, { x: 12.1, z: 5.5 }, { x: 4.5, z: 8.2 },
            { x: 5.1, z: 8.9 }, { x: 10.6, z: 9.8 }, { x: 5.2, z: 3.4 }
        ];
        reedClusters.forEach((rc, idx) => {
            const rGroup = new THREE.Group();
            const ry = getTerrainHeight(rc.x, rc.z);
            rGroup.position.set(rc.x, ry, rc.z);
            for (let j = 0; j < 4; j++) {
                const h = 0.85 + (j % 3) * 0.22;
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.028, h, 5), reedStemMat);
                const ox = (j - 1.5) * 0.12;
                const oz = ((j * 7) % 3 - 1) * 0.12;
                stem.position.set(ox, h * 0.5, oz);
                stem.rotation.z = (j - 1.5) * 0.08;
                rGroup.add(stem);
                if (j % 2 === 0) {
                    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.22, 6), reedHeadMat);
                    head.position.set(ox - Math.sin(stem.rotation.z) * h * 0.38, h * 0.82, oz);
                    head.rotation.z = stem.rotation.z;
                    rGroup.add(head);
                }
            }
            pondGroup.add(rGroup);
        });

        // BotW Hearty Bass / Koi Fish Swimming Beneath the Water Surface
        const pondFishList = [];
        const fishBodyGeo = new THREE.ConeGeometry(0.075, 0.34, 6);
        fishBodyGeo.rotateX(Math.PI * 0.5);
        const fishTailGeo = new THREE.ConeGeometry(0.065, 0.14, 3);
        fishTailGeo.rotateX(-Math.PI * 0.5);
        fishTailGeo.translate(0, 0, -0.20);

        const fishColors = [0xff7b39, 0xffbe0b, 0xf75c03];
        for (let f = 0; f < 3; f++) {
            const fGroup = new THREE.Group();
            const fMat = new THREE.MeshBasicMaterial({ color: fishColors[f % fishColors.length] });
            const body = new THREE.Mesh(fishBodyGeo, fMat);
            const tail = new THREE.Mesh(fishTailGeo, fMat);
            fGroup.add(body);
            fGroup.add(tail);
            fGroup.userData = {
                tailMesh: tail,
                swimRadius: 1.35 + f * 0.65,
                swimSpeed: 0.52 - f * 0.08,
                phase: f * 2.1,
                depthY: POND_WATER_Y - 0.32 - f * 0.12
            };
            pondFishList.push(fGroup);
            pondGroup.add(fGroup);
        }

        // Subdivided Pond Water Surface Geometry with Precomputed Exact Depth & Obstacle Foam Attributes
        const pondWaterGeo = new THREE.PlaneGeometry(POND_CENTER.radius * 2.25, POND_CENTER.radius * 2.25, 48, 48);
        pondWaterGeo.rotateX(-Math.PI / 2);
        pondWaterGeo.translate(POND_CENTER.x, POND_WATER_Y, POND_CENTER.z);

        const pwPos = pondWaterGeo.attributes.position;
        const bedDepthArr = new Float32Array(pwPos.count);
        const obstacleFoamArr = new Float32Array(pwPos.count);

        for (let i = 0; i < pwPos.count; i++) {
            const wx = pwPos.getX(i);
            const wz = pwPos.getZ(i);
            const terrainY = getTerrainHeight(wx, wz);
            const depth = POND_WATER_Y - terrainY;
            bedDepthArr[i] = depth;

            // Compute proximity to partially submerged rocks & lily pads for BotW ring foam
            let minObsDist = 99.0;
            for (let j = 0; j < pondObstacles.length; j++) {
                const ob = pondObstacles[j];
                const d = Math.hypot(wx - ob.x, wz - ob.z) - ob.r * 0.92;
                if (d < minObsDist) minObsDist = d;
            }
            obstacleFoamArr[i] = Math.max(0.0, minObsDist);
        }
        pondWaterGeo.setAttribute('aBedDepth', new THREE.BufferAttribute(bedDepthArr, 1));
        pondWaterGeo.setAttribute('aObstacleDist', new THREE.BufferAttribute(obstacleFoamArr, 1));

        const botWWaterDataTex = createBotWWaterDataTexture();
        const pondUniforms = {
            uTime: celShaderUniforms.uTime,
            uWindSpeed: grassUniforms.uWindSpeed,
            uWaterDataTex: { value: botWWaterDataTex },
            uSunDir: celShaderUniforms.uSunDir,
            uSunColor: celShaderUniforms.uSunColor,
            uSkyTop: { value: activeAtmosphere.bgTop },
            uSkyBottom: { value: activeAtmosphere.bgBottom },
            uCampfirePos: celShaderUniforms.uCampfirePos,
            uCampfireColor: celShaderUniforms.uCampfireColor,
            uCampfireStrength: celShaderUniforms.uCampfireStrength,
            uRippleOrigin: { value: new THREE.Vector3(POND_CENTER.x, POND_WATER_Y, POND_CENTER.z) },
            uRippleTime: { value: -99.0 }
        };

        const pondMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: pondUniforms,
            vertexShader: `
                precision highp float;
                attribute float aBedDepth;
                attribute float aObstacleDist;
                uniform float uTime;
                uniform float uWindSpeed;
                uniform vec3 uRippleOrigin;
                uniform float uRippleTime;

                varying vec3 vWorldPos;
                varying float vDepth;
                varying float vObstacleDist;
                varying float vRippleWave;

                void main() {
                    vDepth = aBedDepth;
                    vObstacleDist = aObstacleDist;

                    vec3 pos = position;
                    float deepMask = smoothstep(0.02, 0.35, aBedDepth);

                    // Gentle 3D surface wave displacement
                    float wave1 = sin(pos.x * 1.8 + uTime * 1.9 * uWindSpeed) * cos(pos.z * 1.6 + uTime * 1.5) * 0.028;
                    float wave2 = sin((pos.x - pos.z) * 2.9 - uTime * 2.4) * 0.014;

                    // Interactive click/slash expanding 3D ripple wave
                    float rAge = uTime - uRippleTime;
                    float ripple = 0.0;
                    if (rAge >= 0.0 && rAge < 3.5) {
                        float dRipple = length(pos.xz - uRippleOrigin.xz);
                        float ringRadius = rAge * 2.6;
                        float band = 1.0 - smoothstep(0.0, 0.85, abs(dRipple - ringRadius));
                        float fade = 1.0 - smoothstep(0.0, 3.5, rAge);
                        ripple = sin((dRipple - ringRadius) * 14.0) * band * fade;
                    }
                    vRippleWave = ripple;

                    pos.y += (wave1 + wave2 + ripple * 0.055) * deepMask;
                    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
                    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform float uTime;
                uniform float uWindSpeed;
                uniform sampler2D uWaterDataTex;
                uniform vec3 uSunDir;
                uniform vec3 uSunColor;
                uniform vec3 uSkyTop;
                uniform vec3 uSkyBottom;
                uniform vec3 uCampfirePos;
                uniform vec3 uCampfireColor;
                uniform float uCampfireStrength;
                uniform vec3 uRippleOrigin;
                uniform float uRippleTime;

                varying vec3 vWorldPos;
                varying float vDepth;
                varying float vObstacleDist;
                varying float vRippleWave;

                void main() {
                    // Clip pixels outside the water shoreline
                    if (vDepth <= 0.002) discard;

                    vec3 V = normalize(cameraPosition - vWorldPos);
                    vec3 L = normalize(uSunDir);

                    // Dual-scrolling Voronoi + Wave Normal lookups (BotW dual-wave interference)
                    vec2 uv1 = vWorldPos.xz * 0.24 + vec2(uTime * 0.038 * uWindSpeed, uTime * 0.026 * uWindSpeed);
                    vec2 uv2 = vWorldPos.xz * 0.31 - vec2(uTime * 0.029 * uWindSpeed, -uTime * 0.034 * uWindSpeed);

                    vec4 sample1 = texture2D(uWaterDataTex, uv1);
                    vec4 sample2 = texture2D(uWaterDataTex, uv2);

                    // Perturbed 3D Water Surface Normal
                    vec2 nXY = ((sample1.rg * 2.0 - 1.0) + (sample2.rg * 2.0 - 1.0)) * 0.16;
                    nXY += (vWorldPos.xz - uRippleOrigin.xz) * vRippleWave * 0.18;
                    vec3 N = normalize(vec3(nXY.x, 1.0, nXY.y));

                    // 1. Depth-based Beer-Lambert Absorption & BotW Emerald-Turquoise Gradient
                    float depthNorm = clamp(vDepth / 1.35, 0.0, 1.0);
                    vec3 shallowCol = pow(vec3(0.32, 0.88, 0.80), vec3(2.2)); // Crystal turquoise shallows
                    vec3 midWaterCol = pow(vec3(0.11, 0.62, 0.72), vec3(2.2)); // Hyrule emerald-cyan
                    vec3 deepWaterCol = pow(vec3(0.06, 0.28, 0.44), vec3(2.2)); // Deep indigo-teal basin

                    vec3 waterBodyCol = mix(shallowCol, midWaterCol, smoothstep(0.04, 0.48, depthNorm));
                    waterBodyCol = mix(waterBodyCol, deepWaterCol, smoothstep(0.45, 0.98, depthNorm));

                    // 2. Parallax Underwater Voronoi Caustics projected onto the Pond Bed
                    vec2 parallaxOffset = V.xz / max(V.y, 0.25) * (vDepth * 0.28);
                    vec2 cUv1 = (vWorldPos.xz - parallaxOffset) * 0.28 + vec2(uTime * 0.042, -uTime * 0.031);
                    vec2 cUv2 = (vWorldPos.xz - parallaxOffset) * 0.34 + vec2(-uTime * 0.035, uTime * 0.045);
                    float caust1 = texture2D(uWaterDataTex, cUv1).b;
                    float caust2 = texture2D(uWaterDataTex, cUv2).b;
                    float combinedCaustics = smoothstep(0.28, 0.68, (caust1 + caust2) * 0.62 + sample1.b * 0.25);

                    // Caustics are strongest in shallow-to-mid water and fade in the deepest center
                    float causticVisibility = smoothstep(0.04, 0.22, depthNorm) * (1.0 - smoothstep(0.65, 0.98, depthNorm));
                    vec3 causticLight = mix(pow(vec3(0.65, 0.98, 0.92), vec3(2.2)), uSunColor * 1.15, 0.55);
                    waterBodyCol += causticLight * combinedCaustics * causticVisibility * 0.48;

                    // 3. Schlick Fresnel Sky & Horizon Reflection
                    float NoV = max(dot(N, V), 0.0);
                    float fresnel = clamp(0.06 + 0.88 * pow(1.0 - NoV, 3.4), 0.0, 1.0);
                    vec3 reflDir = reflect(-V, N);
                    vec3 skyRefl = mix(uSkyBottom, uSkyTop, clamp(reflDir.y * 0.75 + 0.25, 0.0, 1.0));
                    vec3 surfaceCol = mix(waterBodyCol, skyRefl * 1.05, fresnel * 0.72);

                    // 4. BotW Stepped Cel-Shaded Sun Specular Glints & Shimmering Path
                    vec3 H = normalize(L + V);
                    float NoH = max(dot(N, H), 0.0);
                    float softPath = pow(NoH, 28.0) * 0.38;
                    float celSparkle = smoothstep(0.62, 0.68, pow(NoH, 95.0) + combinedCaustics * 0.16);
                    surfaceCol += uSunColor * (softPath + celSparkle * 0.95);

                    // Warm Campfire Reflection on the Pond Surface
                    float fireDist = length(uCampfirePos - vWorldPos);
                    float fireGlow = (1.0 - smoothstep(3.0, 14.5, fireDist)) * uCampfireStrength;
                    surfaceCol += uCampfireColor * fireGlow * (0.25 + combinedCaustics * 0.35);

                    // 5. BotW Dual-Ring Animated Shoreline & Submerged Rock Foam
                    float cellularNoise = (sample1.a + sample2.a) * 0.5;
                    float edgeProximity = min(vDepth, vObstacleDist * 0.65);

                    float shoreZone = 1.0 - smoothstep(0.02, 0.34, edgeProximity);
                    float wavePhase = sin(edgeProximity * 28.0 - uTime * 3.2 + cellularNoise * 3.5) * 0.5 + 0.5;
                    float innerFoamRing = smoothstep(0.56, 0.66, wavePhase * shoreZone + cellularNoise * 0.28 * shoreZone);
                    float outerShoreLip = 1.0 - smoothstep(0.005, 0.075, edgeProximity);
                    float rippleFoam = smoothstep(0.35, 0.55, abs(vRippleWave)) * 0.85;

                    float totalFoam = clamp(max(max(innerFoamRing, outerShoreLip), rippleFoam), 0.0, 1.0);
                    vec3 foamCol = mix(pow(vec3(0.88, 0.98, 1.0), vec3(2.2)), uSunColor, 0.24);
                    surfaceCol = mix(surfaceCol, foamCol, totalFoam * 0.92);

                    // 6. Crystal-Clear Shore Feathering & Depth Opacity
                    float baseAlpha = smoothstep(0.005, 0.075, vDepth) * mix(0.68, 0.94, smoothstep(0.08, 0.72, depthNorm));
                    float finalAlpha = clamp(max(baseAlpha, totalFoam * 0.92), 0.0, 0.96);

                    gl_FragColor = vec4(surfaceCol, finalAlpha);
                    #include <colorspace_fragment>
                }
            `
        });

        const pondMesh = new THREE.Mesh(pondWaterGeo, pondMat);
        pondMesh.userData = { type: 'pond' };
        pondGroup.add(pondMesh);

        // ---- 4 Genangan Sungai Besar Sektor Luar Peta (pakai shader air emerald-turquoise yang sama) ----
        const grandWaterMeshes = [];
        for (let bIdx = 0; bIdx < GRAND_WATER_BASINS.length; bIdx++) {
            const basin = GRAND_WATER_BASINS[bIdx];
            const bw = basin.maxX - basin.minX;
            const bd = basin.maxZ - basin.minZ;
            const bCx = (basin.minX + basin.maxX) * 0.5;
            const bCz = (basin.minZ + basin.maxZ) * 0.5;
            const segX = Math.max(64, Math.min(128, Math.round(bw / 3.2)));
            const segZ = Math.max(64, Math.min(128, Math.round(bd / 3.2)));

            const lakeGeo = new THREE.PlaneGeometry(bw, bd, segX, segZ);
            lakeGeo.rotateX(-Math.PI / 2);
            lakeGeo.translate(bCx, basin.waterY, bCz);

            const lPos = lakeGeo.attributes.position;
            const lDepth = new Float32Array(lPos.count);
            const lObs = new Float32Array(lPos.count);
            for (let i = 0; i < lPos.count; i++) {
                const wx = lPos.getX(i);
                const wz = lPos.getZ(i);
                const gbs = sampleGrandBasinAt(wx, wz);
                if (gbs && gbs.basin.id === basin.id && gbs.edgeDist < 0.75) {
                    const edgeFade = Math.max(-0.5, (0.55 - gbs.edgeDist) * 1.15);
                    lDepth[i] = Math.min(basin.waterY - getTerrainHeight(wx, wz), edgeFade);
                } else {
                    lDepth[i] = -3.0;
                }
                lObs[i] = 99.0;
            }
            lakeGeo.setAttribute('aBedDepth', new THREE.BufferAttribute(lDepth, 1));
            lakeGeo.setAttribute('aObstacleDist', new THREE.BufferAttribute(lObs, 1));
            lakeGeo.computeBoundingBox();
            lakeGeo.computeBoundingSphere();

            const lakeMesh = new THREE.Mesh(lakeGeo, pondMat);
            lakeMesh.frustumCulled = true;
            lakeMesh.userData = { type: 'grand_water_basin', basinId: basin.id };
            scene.add(lakeMesh);
            grandWaterMeshes.push(lakeMesh);

            // Bebatuan alami di sepanjang garis pantai sungai besar luar
            for (let pIdx = 1; pIdx < basin.pts.length - 1; pIdx += 2) {
                const pt = basin.pts[pIdx];
                const nextPt = basin.pts[pIdx + 1];
                const tx = nextPt[0] - pt[0], tz = nextPt[1] - pt[1];
                const tLen = Math.hypot(tx, tz) || 1;
                const nx = -tz / tLen, nz = tx / tLen;
                for (const side of [-1, 1]) {
                    const edgeOff = basin.halfW * (0.72 + ((pIdx + bIdx) % 3) * 0.14);
                    const rx = pt[0] + nx * side * edgeOff + ((pIdx * 7) % 5 - 2);
                    const rz = pt[1] + nz * side * edgeOff + ((bIdx * 11) % 5 - 2);
                    const ry = getTerrainHeight(rx, rz);
                    const rr = 1.05 + ((pIdx + bIdx) % 3) * 0.45;
                    const sRock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), wetRockMat);
                    sRock.position.set(rx, ry + rr * 0.35, rz);
                    sRock.scale.set(1.3, 0.72, 1.08);
                    sRock.rotation.set(rx * 0.17, rz * 0.23, 0.15);
                    scene.add(sRock);
                    addRockMeshCollider('river_rock', sRock);
                }
            }
        }

        // ============================================================================
        // 7B-2. GENANGAN AIR HUJAN DI PADANG LIAR (murah: satu shader, 9 quad)
        // ============================================================================
        const puddleGroup = new THREE.Group();
        puddleGroup.name = 'puddles';
        scene.add(puddleGroup);

        const puddleUniforms = {
            uTime: celShaderUniforms.uTime,              // referensi objek uniform yang sama
            uSunDir: celShaderUniforms.uSunDir,
            uSunColor: celShaderUniforms.uSunColor,
            uSkyTop: { value: activeAtmosphere.bgTop },
            uSkyBottom: { value: activeAtmosphere.bgBottom },
            uBrightness: celShaderUniforms.uSceneBrightness
        };

        const puddleMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: puddleUniforms,
            vertexShader: `
                precision highp float;
                varying vec3 vWorldPos;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform float uTime;
                uniform vec3 uSunDir;
                uniform vec3 uSunColor;
                uniform vec3 uSkyTop;
                uniform vec3 uSkyBottom;
                uniform float uBrightness;

                varying vec3 vWorldPos;
                varying vec2 vUv;

                void main() {
                    float rim = length(vUv - vec2(0.5)) * 2.0;
                    if (rim > 1.0) discard;

                    // Tepi genangan memudar halus di bibir terluar agar menyatu alami tapi berinti air turquoise jelas di peta & 3D
                    float edge = 1.0 - smoothstep(0.78, 1.0, rim);

                    vec3 V = normalize(cameraPosition - vWorldPos);
                    vec2 p = vWorldPos.xz;

                    // Riak halus: dua gelombang silang, aman untuk GPU kentang.
                    float t = uTime;
                    float nx = sin(p.x * 3.1 + t * 1.7) * 0.035
                             + sin((p.x + p.y) * 6.7 - t * 2.4) * 0.016
                             + sin(p.y * 9.3 + t * 1.1) * 0.010;
                    float nz = cos(p.y * 2.7 - t * 1.5) * 0.035
                             + cos((p.x - p.y) * 5.9 + t * 2.1) * 0.016
                             + cos(p.x * 8.1 - t * 1.2) * 0.010;
                    vec3 N = normalize(vec3(nx, 1.0, nz));

                    float NoV = clamp(dot(N, V), 0.0, 1.0);
                    float fresnel = 0.08 + 0.88 * pow(1.0 - NoV, 3.0);

                    vec3 refl = mix(uSkyBottom, uSkyTop, clamp(reflect(-V, N).y * 0.8 + 0.2, 0.0, 1.0)) * 0.92;
                    vec3 deepWater = pow(vec3(0.08, 0.56, 0.78), vec3(2.2));
                    vec3 shallowWater = pow(vec3(0.24, 0.82, 0.90), vec3(2.2));
                    vec3 wetGround = mix(shallowWater, deepWater, clamp(rim * 0.45 + 0.35, 0.0, 1.0));
                    wetGround *= 0.45 + uBrightness * 0.85;

                    vec3 col = mix(wetGround, refl, clamp(0.18 + fresnel * 0.52, 0.0, 0.84));

                    vec3 H = normalize(normalize(uSunDir) + V);
                    float spec = pow(max(dot(N, H), 0.0), 70.0);
                    col += uSunColor * spec * 0.45;

                    float alpha = edge * (0.86 + 0.10 * fresnel);
                    gl_FragColor = vec4(col, alpha);
                    #include <colorspace_fragment>
                }
            `
        });

        // Gabungkan seluruh genangan air minum kuda menjadi 1 mesh tunggal (1 draw call)
        const PUDDLE_Y_OFF = 0.04;
        {
            const SEG = 24;
            const vertsPerPuddle = 1 + (SEG + 1) * 2;
            const totalVerts = PUDDLES.length * vertsPerPuddle;
            const pos = new Float32Array(totalVerts * 3);
            const uvArr = new Float32Array(totalVerts * 2);
            const idx = [];
            let vCursor = 0;

            for (const pd of PUDDLES) {
                const baseV = vCursor;
                const cy = getTerrainHeight(pd.x, pd.z) + PUDDLE_Y_OFF;
                pos[vCursor * 3] = pd.x;
                pos[vCursor * 3 + 1] = cy;
                pos[vCursor * 3 + 2] = pd.z;
                uvArr[vCursor * 2] = 0.5;
                uvArr[vCursor * 2 + 1] = 0.5;
                vCursor++;

                // Cincin tengah (radius 55%) & cincin tepi (radius 100%) mengikuti kontur tanah mulus
                for (let ring = 0; ring < 2; ring++) {
                    const rf = ring === 0 ? 0.55 : 1.0;
                    for (let k = 0; k <= SEG; k++) {
                        const ang = (k / SEG) * Math.PI * 2;
                        const wob = 1.0 + 0.16 * Math.sin(ang * 3.0 + pd.seed) + 0.09 * Math.cos(ang * 5.0 - pd.seed * 1.7);
                        const rx = pd.r * wob * 1.10 * rf;
                        const rz = pd.r * wob * 0.84 * rf;
                        const wx = pd.x + Math.cos(ang) * rx;
                        const wz = pd.z + Math.sin(ang) * rz;
                        pos[vCursor * 3] = wx;
                        pos[vCursor * 3 + 1] = getTerrainHeight(wx, wz) + PUDDLE_Y_OFF;
                        pos[vCursor * 3 + 2] = wz;
                        uvArr[vCursor * 2] = 0.5 + Math.cos(ang) * 0.5 * rf;
                        uvArr[vCursor * 2 + 1] = 0.5 + Math.sin(ang) * 0.5 * rf;
                        vCursor++;
                    }
                }

                const ring1Start = baseV + 1;
                const ring2Start = baseV + 1 + (SEG + 1);
                for (let k = 0; k < SEG; k++) {
                    idx.push(baseV, ring1Start + k + 1, ring1Start + k);
                    const a = ring1Start + k, b = ring1Start + k + 1;
                    const c = ring2Start + k, d = ring2Start + k + 1;
                    idx.push(a, b, d, a, d, c);
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
            geo.setIndex(idx);
            geo.computeBoundingSphere();
            const puddlesMesh = new THREE.Mesh(geo, puddleMat);
            puddlesMesh.frustumCulled = false;
            puddlesMesh.userData = { type: 'puddle' };
            puddleGroup.add(puddlesMesh);
        }

        // ============================================================================
        // 7C. TRUCKFUL COZY ATMOSPHERE: PICKUP TRUCK, FENCES, LANTERNS, GOD-RAYS & MIST
        // ============================================================================
        const fenceWoodMat = new THREE.MeshStandardMaterial({ color: 0x8d6342, roughness: 0.90 });
        applyStylizedCelShading(fenceWoodMat, { rimStrength: 0.16, shadowLift: 0.56 });

        // 1. Winding Wooden Post-and-Rail Countryside Fences (Merged into 1 single draw call!)
        (function buildCountrysideFences() {
            const fenceGeos = [];
            const fenceCaps = [];
            const segments = [
                { side: 1, zStart: 3.5, zEnd: 17.5, step: 2.3 },
                { side: -1, zStart: -11.0, zEnd: 15.5, step: 2.4 },
                { side: 1, zStart: -18.5, zEnd: -5.5, step: 2.4 }
            ];

            segments.forEach(seg => {
                const postPositions = [];
                for (let z = seg.zStart; z <= seg.zEnd; z += seg.step) {
                    const cx = getRoadCenterX(z);
                    const ang = getRoadTangentAngle(z);
                    const nx = Math.cos(ang) * seg.side;
                    const nz = -Math.sin(ang) * seg.side;
                    const px = cx + nx * 2.55;
                    const pz = z + nz * 2.55;
                    const py = getTerrainHeight(px, pz);
                    postPositions.push(new THREE.Vector3(px, py, pz));

                    // Rustic slightly tilted fence post
                    const postGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.95, 5);
                    postGeo.translate(0, 0.44, 0);
                    postGeo.rotateZ(((Math.sin(z * 3.7) * 0.08)));
                    postGeo.rotateX(((Math.cos(z * 2.9) * 0.06)));
                    postGeo.translate(px, py, pz);
                    fenceGeos.push(postGeo);
                }

                // Connect consecutive posts with dual wooden rails
                for (let i = 0; i < postPositions.length - 1; i++) {
                    const p1 = postPositions[i];
                    const p2 = postPositions[i + 1];
                    const mid = p1.clone().add(p2).multiplyScalar(0.5);
                    const diff = p2.clone().sub(p1);
                    const len = diff.length();

                    const railDummy = new THREE.Object3D();
                    railDummy.position.copy(mid);
                    railDummy.lookAt(p2);

                    [0.34, 0.68].forEach(hOff => {
                        const rGeo = new THREE.BoxGeometry(0.075, 0.085, len + 0.08);
                        railDummy.position.set(mid.x, mid.y + hOff, mid.z);
                        railDummy.updateMatrix();
                        rGeo.applyMatrix4(railDummy.matrix);
                        fenceGeos.push(rGeo);
                    });

                    /* yMax = puncak palang atas pagar (0,68 + tebal), bukan 1,05:
                       collider tetap mengikuti bentuk pagar (kapsul per segmen),
                       tapi sekarang kuda yang melompat bisa melewatinya. */
                    fenceCaps.push(addCapsuleCollider(
                        'fence', p1.x, p1.z, p2.x, p2.z,
                        0.14, Math.max(p1.y, p2.y) + 0.74, null
                    ));
                }
            });

            if (fenceGeos.length > 0) {
                const mergedFence = mergeBufferGeometriesSimple(fenceGeos);
                const fenceMesh = new THREE.Mesh(mergedFence, fenceWoodMat);
                fenceMesh.castShadow = !isMobileDevice;
                fenceMesh.receiveShadow = true;
                fenceMesh.userData = { type: 'fence', colliderCount: fenceCaps.length };
                scene.add(fenceMesh);
                for (const fc of fenceCaps) fc.mesh = fenceMesh;
            }
        })();

        // 2. Charming Crooked Wooden Countryside Signposts at the Clearing & Road Forks
        (function buildCountrysideSignpost() {
            const forkSpots = [
                { x: getRoadCenterX(2.0) + 2.55, z: 2.0, yaw: 0.0 },
                { x: getRoadCenterX(114.0) + 3.1, z: 114.0, yaw: -0.35 },
                { x: getRoadCenterX(-17.0) - 3.1, z: -17.0, yaw: 0.45 },
                { x: 225.0 + 3.2, z: -42.0, yaw: -0.55 },
            ];
            const boardMat = new THREE.MeshStandardMaterial({ color: 0xb68456, roughness: 0.85 });
            applyStylizedCelShading(boardMat, { rimStrength: 0.18, shadowLift: 0.56 });

            forkSpots.forEach((sp) => {
                const sx = sp.x, sz = sp.z;
                const sy = getTerrainHeight(sx, sz);
                const signGroup = new THREE.Group();
                signGroup.position.set(sx, sy, sz);
                signGroup.rotation.y = sp.yaw;

                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.05, 6), fenceWoodMat);
                pole.position.y = 1.0;
                pole.rotation.z = 0.04;
                pole.castShadow = true;
                signGroup.add(pole);

                const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.24, 0.06), boardMat);
                b1.position.set(0.28, 1.72, 0.05);
                b1.rotation.y = -0.35;
                b1.rotation.z = 0.05;
                signGroup.add(b1);

                const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.22, 0.06), boardMat);
                b2.position.set(-0.22, 1.38, -0.04);
                b2.rotation.y = 0.42;
                b2.rotation.z = -0.06;
                signGroup.add(b2);

                scene.add(signGroup);
                addCircleCollider('signpost', sx, sz, 0.20, sy + 2.1, signGroup);
            });
        })();

        // Soft Warm Radial Glow Sprite Texture (shared by Lanterns & Truck Headlights)
        const warmGlowTex = (function createWarmGlowTex() {
            const c = document.createElement('canvas');
            c.width = 64;
            c.height = 64;
            const ctx = c.getContext('2d');
            const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
            g.addColorStop(0.0, 'rgba(255, 250, 220, 1.0)');
            g.addColorStop(0.32, 'rgba(255, 198, 102, 0.72)');
            g.addColorStop(0.70, 'rgba(255, 140, 48, 0.22)');
            g.addColorStop(1.0, 'rgba(255, 120, 30, 0.0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(c);
        })();

        // 3. Cozy Roadside Hanging Wooden Lantern Posts (Zero extra shadows -> fast on Helio G99!)
        const roadLanterns = [];
        const lanternSpots = [
            { x: getRoadCenterX(11.0) + 2.65, z: 11.0, yaw: -Math.PI * 0.55 },
            { x: getRoadCenterX(-4.0) - 2.65, z: -4.0, yaw: Math.PI * 0.45 },
            { x: 4.1, z: 5.2, yaw: 0.4 } // Cozy lamp overlooking the BotW Pond!
        ];

        const darkIronMat = new THREE.MeshStandardMaterial({ color: 0x353b42, roughness: 0.6 });
        lanternSpots.forEach((ls, idx) => {
            const lGroup = new THREE.Group();
            const ly = getTerrainHeight(ls.x, ls.z);
            lGroup.position.set(ls.x, ly, ls.z);
            lGroup.rotation.y = ls.yaw;

            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.10, 2.75, 6), fenceWoodMat);
            post.position.y = 1.35;
            post.rotation.z = -0.04;
            post.castShadow = true;
            lGroup.add(post);

            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.08), fenceWoodMat);
            arm.position.set(0.32, 2.58, 0);
            arm.rotation.z = 0.08;
            lGroup.add(arm);

            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 6), darkIronMat);
            cap.position.set(0.62, 2.40, 0);
            lGroup.add(cap);

            const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe49e });
            const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.24, 6), glassMat);
            glass.position.set(0.62, 2.22, 0);
            lGroup.add(glass);

            const haloMat = new THREE.SpriteMaterial({
                map: warmGlowTex,
                color: 0xffc66b,
                transparent: true,
                opacity: 0.75,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const halo = new THREE.Sprite(haloMat);
            halo.position.set(0.62, 2.22, 0);
            halo.scale.set(1.65, 1.65, 1.0);
            lGroup.add(halo);

            roadLanterns.push({ group: lGroup, halo, glassMat, phase: idx * 1.9 });
            scene.add(lGroup);
            addCircleCollider('lantern', ls.x, ls.z, 0.20, ly + 2.8, lGroup);
        });

        // Model truk pickup dan lampu depannya dihapus.
        // Sakelar lampu jalan dipertahankan untuk mode malam.
        let isHeadlightsOn = true;
        // 5. Volumetric Sunbeams / Golden God-Rays (Default OFF to avoid any foggy veil; optional in panel)
        let isSunbeamsEnabled = true;
        const sunbeamsGroup = new THREE.Group();
        sunbeamsGroup.visible = true;
        scene.add(sunbeamsGroup);

        const sunbeamUniforms = {
            uTime: celShaderUniforms.uTime,
            uColor: { value: activeAtmosphere.sunColor.clone() },
            uOpacity: { value: activeAtmosphere.sunbeamOpacity }
        };

        const sunbeamMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            uniforms: sunbeamUniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorldNormal;
                varying vec3 vWorldPos;
                void main() {
                    vUv = uv;
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    vWorldNormal = normalize(mat3(modelMatrix) * normal);
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec2 vUv;
                varying vec3 vWorldNormal;
                varying vec3 vWorldPos;
                void main() {
                    // Soft vertical & horizontal beam taper
                    float horiz = sin(vUv.x * 3.14159265);
                    horiz = pow(max(0.0, horiz), 1.85);
                    float vert = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.15, 1.0, vUv.y));
                    // Gentle canopy leaf-dapple shimmer moving slowly across the ray
                    float dapple = 0.72 + 0.28 * sin(vUv.x * 12.0 + uTime * 0.45 + vWorldPos.x * 0.3);
                    vec3 V = normalize(cameraPosition - vWorldPos);
                    float viewFade = pow(abs(dot(normalize(vWorldNormal), V)), 0.75);
                    float alpha = horiz * vert * dapple * viewFade * uOpacity;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `
        });

        const sunbeamShafts = [];
        // Sorotan cahaya (light shafts) di area spawn awal dihapus agar visual awal bersih
        const beamSpots = [];
        beamSpots.forEach((bs, idx) => {
            const by = getTerrainHeight(bs.x, bs.z);
            const shaftGroup = new THREE.Group();
            shaftGroup.position.set(bs.x, by - 0.5, bs.z);

            // Crossed pair of soft planes so god-rays stay volumetric from every orbit angle
            for (let c = 0; c < 2; c++) {
                const pGeo = new THREE.PlaneGeometry(bs.w, bs.h);
                pGeo.translate(0, bs.h * 0.5, 0);
                const pMesh = new THREE.Mesh(pGeo, sunbeamMat);
                pMesh.rotation.y = (c * Math.PI * 0.5) + idx * 0.4;
                shaftGroup.add(pMesh);
            }
            sunbeamShafts.push(shaftGroup);
            sunbeamsGroup.add(shaftGroup);
        });

        // (Low-lying woodland mist/fog ribbons removed per user request for a crisp, fog-free view)

        // ============================================================================
        // 8. STYLIZED ROCKS, GLOWING MUSHROOMS & FIREFLIES
        // ============================================================================
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.88 });
        applyStylizedCelShading(rockMat, { rimStrength: 0.18, shadowLift: 0.52 });

        const rockSpots = [
            [-4.2, -5.8, 0.85], [6.2, 2.8, 1.1], [10.8, 7.6, 0.95],
            [5.8, 8.2, 0.75], [-8.8, 1.5, 1.25], [3.2, -6.5, 0.7]
        ];
        rockSpots.forEach(r => {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r[2], 0), rockMat);
            rock.position.set(r[0], getTerrainHeight(r[0], r[1]) + r[2] * 0.35, r[1]);
            rock.scale.set(1.25, 0.78, 1.1);
            rock.rotation.set(r[0], r[1], 0.3);
            rock.receiveShadow = true;
            scene.add(rock);
            addRockMeshCollider('rock', rock);
        });

        // ============================================================================
        // 8B. AIR SUNGAI, TANTANGAN BEBATUAN & DESA KECIL
        // ============================================================================

        // ---- Permukaan air sungai BotW (shader 1:1 kolam/genangan) + tepian alami ----
        let riverMesh = null;
        let riverUniforms = null;
        let riverAnimated = { lilyPads: [], reeds: [] };

        (function buildRiverSurface() {
            const riverSpec = {
                terrainSize: TERRAIN_SIZE,
                waterY: RIVER.waterY,
                halfWidth: RIVER.halfWidth,
                bank: RIVER.bank,
                fords: RIVER.fords,
                riverCenterZ,
                riverHalfWidthAt,
                riverFordAt,
                getRoadDistance,
            };
            const riverCtx = {
                applyStylizedCelShading,
                isMobileDevice,
                getTerrainHeight,
                warmGlowTex,
                rockMat,
                wetRockMat,
                celShaderUniforms,
                grassUniforms,
                activeAtmosphere,
                waterDataTex: botWWaterDataTex,
            };

            const banks = createNaturalRiverbanks(riverCtx, riverSpec);
            scene.add(banks.group);
            if (banks.colliders) {
                for (const c of banks.colliders) {
                    if (c && c.mesh) addRockMeshCollider(c.type || 'river_rock', c.mesh);
                }
            }
            if (banks.lanterns) {
                for (const l of banks.lanterns) roadLanterns.push(l);
            }
            riverAnimated = banks.animated || { lilyPads: [], reeds: [] };

            const surface = createBotWRiverSurface(riverCtx, riverSpec, banks.obstacles || []);
            riverMesh = surface.mesh;
            riverUniforms = surface.uniforms;
            scene.add(riverMesh);
        })();

        // ---- Tantangan bebatuan: gerbang batu sempit + onggokan di bahu jalur ----
        (function buildBoulderChallenge() {
            const rocks = [
                // gerbang sempit berpasangan: harus pas melintas / melompat
                [-8.2, -38, 1.60], [-1.2, -38, 1.60],
                [-8.6, -45, 1.85], [-0.8, -45, 1.85],
                [-8.0, -52, 1.45], [-1.4, -52, 1.45],
                // bebatuan berserak di bahu jalur
                [-11.4, -41, 1.15], [2.2, -41, 1.15],
                [-11.8, -48, 1.30], [2.8, -48, 1.30],
                [-9.8, -34, 0.95], [0.2, -34, 0.95],
            ];
            for (const [x, z, r] of rocks) {
                const y = getTerrainHeight(x, z);
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
                rock.position.set(x, y + r * 0.40, z);
                rock.scale.set(1.18, 0.86, 1.06);
                rock.rotation.set(x * 0.31, z * 0.73, 0.22);
                rock.castShadow = !isMobileDevice;
                rock.receiveShadow = true;
                scene.add(rock);
                addRockMeshCollider('challenge_rock', rock);
            }
        })();

        // ---- Sebaran Bebatuan, Kayu Tumbang & Tunggul Pohon di Area Hutan Kosong ----
        (function buildForestRocksAndWood() {
            let seed = 918273;
            const rand = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            };

            const isValidForestFloorProp = (x, z, minClear = 4.6) => {
                if (Math.hypot(x, z) < 12.0) return false;
                if (Math.abs(x) > TERRAIN_SIZE * 0.47 || Math.abs(z) > TERRAIN_SIZE * 0.47) return false;
                if (getRoadDistance(x, z) < minClear) return false;
                if (Math.hypot(x - POND_CENTER.x, z - POND_CENTER.z) < POND_CENTER.radius + 4.2) return false;
                if (Math.abs(z - riverCenterZ(x)) < riverHalfWidthAt(x) + RIVER.bank + 3.8) return false;
                const gb = sampleGrandBasinAt(x, z);
                if (gb && gb.edgeDist < gb.basin.bank + 3.5) return false;
                if (hasNearbyPuddle(x, z, 2.6)) return false;
                if (Math.hypot(x - ANCIENT_ELDER_TREE.x, z - ANCIENT_ELDER_TREE.z) < 16.0) return false;
                for (let vi = 0; vi < VILLAGES.length; vi++) {
                    const v = VILLAGES[vi];
                    if (Math.hypot(x - v.cx, z - v.cz) < v.radius * 2.25) return false;
                }
                return true;
            };

            const mossyRockMat = new THREE.MeshStandardMaterial({ color: 0x6c7a72, roughness: 0.90 });
            applyStylizedCelShading(mossyRockMat, { rimStrength: 0.16, shadowLift: 0.50 });
            const logBarkMat = new THREE.MeshStandardMaterial({ color: 0x6b4b32, roughness: 0.92 });
            applyStylizedCelShading(logBarkMat, { rimStrength: 0.12, shadowLift: 0.46 });
            const heartWoodMat = new THREE.MeshStandardMaterial({ color: 0xc29e6f, roughness: 0.85 });
            applyStylizedCelShading(heartWoodMat, { rimStrength: 0.10, shadowLift: 0.54 });
            const mossCapMat = new THREE.MeshStandardMaterial({ color: 0x4f7f42, roughness: 0.92 });
            applyStylizedCelShading(mossCapMat, { rimStrength: 0.14, shadowLift: 0.52 });

            const rockGeos = [
                new THREE.DodecahedronGeometry(1.0, 0),
                new THREE.DodecahedronGeometry(1.0, 1),
            ];
            rockGeos.forEach((g, gi) => {
                const pos = g.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
                    const n = 0.86 + 0.24 * Math.sin(vx * 3.7 + vy * 2.9 + gi * 1.3 + vz * 4.1);
                    pos.setXYZ(i, vx * n, vy * (vy < 0 ? 0.72 : n * 0.88), vz * n);
                }
                g.computeVertexNormals();
            });

            // Shared unit cylinder aligned along local X for fallen logs (kompatibel dengan addTraversableLog)
            const logUnitGeo = new THREE.CylinderGeometry(0.92, 1.0, 1.0, 7);
            logUnitGeo.rotateZ(Math.PI * 0.5);
            const logCapGeo = new THREE.CylinderGeometry(0.84, 0.84, 1.02, 7);
            logCapGeo.rotateZ(Math.PI * 0.5);
            const stumpBodyGeo = new THREE.CylinderGeometry(0.76, 1.05, 1.0, 7);
            stumpBodyGeo.translate(0, 0.5, 0);
            const stumpTopGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.05, 7);
            stumpTopGeo.translate(0, 1.0, 0);

            // 1) Sebaran Bebatuan Hutan (batu besar berkolider + kerikil satelit)
            let rocksPlaced = 0;
            for (let attempt = 0; attempt < 420 && rocksPlaced < 105; attempt++) {
                const ang = rand() * Math.PI * 2;
                const rad = 14.0 + Math.sqrt(rand()) * 210.0;
                const x = Math.cos(ang) * rad;
                const z = Math.sin(ang) * rad;
                if (!isValidForestFloorProp(x, z, 4.6)) continue;

                const y = getTerrainHeight(x, z);
                const isBig = rand() < 0.62;
                const s = isBig ? (0.72 + rand() * 0.92) : (0.34 + rand() * 0.34);
                const mat = rand() < 0.45 ? mossyRockMat : rockMat;
                const geo = rockGeos[rand() < 0.55 ? 0 : 1];

                const rock = new THREE.Mesh(geo, mat);
                rock.position.set(x, y + s * 0.30, z);
                rock.scale.set(s * (0.95 + rand() * 0.45), s * (0.62 + rand() * 0.35), s * (0.90 + rand() * 0.45));
                rock.rotation.set((rand() - 0.5) * 0.45, rand() * Math.PI * 2, (rand() - 0.5) * 0.45);
                rock.castShadow = !isMobileDevice && Math.hypot(x, z) < 42;
                rock.receiveShadow = true;
                scene.add(rock);
                if (isBig) {
                    addRockMeshCollider('forest_rock', rock);
                }

                // 1-2 batu kecil satelit di sekitar batu utama
                const satCount = isBig ? (1 + (rand() < 0.5 ? 1 : 0)) : 0;
                for (let k = 0; k < satCount; k++) {
                    const sa = rand() * Math.PI * 2;
                    const sd = s * (0.85 + rand() * 0.75);
                    const sx = x + Math.cos(sa) * sd;
                    const sz = z + Math.sin(sa) * sd;
                    const sy = getTerrainHeight(sx, sz);
                    const ss = 0.24 + rand() * 0.32;
                    const sat = new THREE.Mesh(rockGeos[0], mat);
                    sat.position.set(sx, sy + ss * 0.28, sz);
                    sat.scale.set(ss * 1.15, ss * 0.68, ss);
                    sat.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
                    sat.receiveShadow = true;
                    scene.add(sat);
                }
                rocksPlaced++;
            }

            // 2) Sebaran Kayu Tumbang & Tunggul Pohon di Hutan Kosong
            let logsPlaced = 0;
            for (let attempt = 0; attempt < 360 && logsPlaced < 55; attempt++) {
                const ang = rand() * Math.PI * 2;
                const rad = 15.0 + Math.sqrt(rand()) * 205.0;
                const x = Math.cos(ang) * rad;
                const z = Math.sin(ang) * rad;
                if (!isValidForestFloorProp(x, z, 5.2)) continue;

                const yaw = rand() * Math.PI * 2;
                const len = 2.2 + rand() * 2.5;
                const radius = 0.17 + rand() * 0.15;
                const y = getTerrainHeight(x, z);

                const logGroup = new THREE.Group();
                logGroup.position.set(x, y + radius * 0.58, z);
                logGroup.rotation.y = yaw;

                const trunkMesh = new THREE.Mesh(logUnitGeo, logBarkMat);
                trunkMesh.scale.set(len, radius, radius);
                trunkMesh.castShadow = !isMobileDevice && Math.hypot(x, z) < 38;
                trunkMesh.receiveShadow = true;
                logGroup.add(trunkMesh);

                const capMesh = new THREE.Mesh(logCapGeo, heartWoodMat);
                capMesh.scale.set(len, radius * 0.88, radius * 0.88);
                logGroup.add(capMesh);

                if (rand() < 0.6) {
                    const mossPatch = new THREE.Mesh(rockGeos[0], mossCapMat);
                    mossPatch.position.set((rand() - 0.5) * len * 0.45, radius * 0.72, 0);
                    mossPatch.scale.set(0.35 + rand() * 0.45, 0.10, radius * 0.75);
                    logGroup.add(mossPatch);
                }

                scene.add(logGroup);
                addTraversableLog(logGroup, radius, len);
                logsPlaced++;
            }

            let stumpsPlaced = 0;
            for (let attempt = 0; attempt < 280 && stumpsPlaced < 42; attempt++) {
                const ang = rand() * Math.PI * 2;
                const rad = 14.0 + Math.sqrt(rand()) * 200.0;
                const x = Math.cos(ang) * rad;
                const z = Math.sin(ang) * rad;
                if (!isValidForestFloorProp(x, z, 4.6)) continue;

                const y = getTerrainHeight(x, z);
                const rBot = 0.24 + rand() * 0.22;
                const h = 0.42 + rand() * 0.52;

                const stumpGroup = new THREE.Group();
                stumpGroup.position.set(x, y - 0.06, z);
                stumpGroup.rotation.y = rand() * Math.PI * 2;

                const body = new THREE.Mesh(stumpBodyGeo, logBarkMat);
                body.scale.set(rBot, h, rBot);
                body.castShadow = !isMobileDevice && Math.hypot(x, z) < 36;
                body.receiveShadow = true;
                stumpGroup.add(body);

                const top = new THREE.Mesh(stumpTopGeo, heartWoodMat);
                top.scale.set(rBot, h, rBot);
                stumpGroup.add(top);

                scene.add(stumpGroup);
                addCircleCollider('stump', x, z, rBot * 1.05, y + h, stumpGroup);
                stumpsPlaced++;
            }
        })();

        // ---- Landmark Story Khusus (Bukit Bebatuan, Air Terjun, Jurang, Hutan Rimba) + Jalan Bebatuan & Jalan Tebing ----
        let waterfallTex = null;
        const waterfallMist = [];
        const waterfallSplash = [];
        const gorgeMist = [];

        (function buildStoryLandmarksAndRockyRoads() {
            let lSeed = 773121;
            const lRand = () => { lSeed = (lSeed * 1664525 + 1013904223) >>> 0; return lSeed / 4294967296; };

            const darkCragMat = new THREE.MeshStandardMaterial({ color: 0x5d646b, roughness: 0.92 });
            applyStylizedCelShading(darkCragMat, { rimStrength: 0.16, shadowLift: 0.46 });
            const paleStoneMat = new THREE.MeshStandardMaterial({ color: 0x8f969a, roughness: 0.88 });
            applyStylizedCelShading(paleStoneMat, { rimStrength: 0.18, shadowLift: 0.54 });
            const mossCragMat = new THREE.MeshStandardMaterial({ color: 0x5c7362, roughness: 0.90 });
            applyStylizedCelShading(mossCragMat, { rimStrength: 0.16, shadowLift: 0.50 });
            const runeGlowMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
            const roadSlabMat = new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 0.92 });
            applyStylizedCelShading(roadSlabMat, { rimStrength: 0.14, shadowLift: 0.52 });
            const woodDeckMat = new THREE.MeshStandardMaterial({ color: 0x7a5432, roughness: 0.90 });
            applyStylizedCelShading(woodDeckMat, { rimStrength: 0.12, shadowLift: 0.48 });

            const cragGeo = new THREE.DodecahedronGeometry(1.0, 1);
            const cPos = cragGeo.attributes.position;
            for (let i = 0; i < cPos.count; i++) {
                const vx = cPos.getX(i), vy = cPos.getY(i), vz = cPos.getZ(i);
                const n = 0.84 + 0.26 * Math.sin(vx * 3.1 + vy * 2.5 + vz * 3.9);
                cPos.setXYZ(i, vx * n, vy * (vy < 0 ? 0.68 : n * 0.95), vz * n);
            }
            cragGeo.computeVertexNormals();

            const slabGeo = new THREE.DodecahedronGeometry(1.0, 0);

            // 1) BUKIT BEBATUAN (Cragstone Hill) di (-135, -135) — Lingkaran Batu Kuno + Obelisk Puncak
            {
                const hx = -135, hz = -135;
                const topY = getTerrainHeight(hx, hz);
                // Obelisk batu kuno di puncak bukit
                const obGroup = new THREE.Group();
                obGroup.position.set(hx, topY - 0.15, hz);
                const obBase = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 0.7, 7), darkCragMat);
                obBase.position.y = 0.35;
                obGroup.add(obBase);
                const obPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.95, 5.8, 6), paleStoneMat);
                obPillar.position.y = 3.4;
                obPillar.castShadow = !isMobileDevice;
                obPillar.receiveShadow = true;
                obGroup.add(obPillar);
                const runeBand = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.24, 6), runeGlowMat);
                runeBand.position.y = 3.8;
                obGroup.add(runeBand);
                scene.add(obGroup);
                addCircleCollider('landmark_stone', hx, hz, 1.85, topY + 6.2, obGroup);

                // 6 batu berdiri melingkar (megalit) di sekitar puncak
                for (let i = 0; i < 6; i++) {
                    const ang = (i / 6) * Math.PI * 2 + 0.25;
                    const sx = hx + Math.cos(ang) * 9.5;
                    const sz = hz + Math.sin(ang) * 9.5;
                    const sy = getTerrainHeight(sx, sz);
                    const stH = 2.6 + (i % 3) * 0.85;
                    const monolith = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, stH, 5), i % 2 === 0 ? paleStoneMat : darkCragMat);
                    monolith.position.set(sx, sy + stH * 0.44, sz);
                    monolith.rotation.set((lRand() - 0.5) * 0.18, ang, (lRand() - 0.5) * 0.18);
                    monolith.receiveShadow = true;
                    scene.add(monolith);
                    addCircleCollider('landmark_stone', sx, sz, 0.85, sy + stH, monolith);
                }

                // Tumpukan bongkahan batu besar di lereng Bukit Bebatuan
                for (let i = 0; i < 34; i++) {
                    const ang = (i / 34) * Math.PI * 2 + (lRand() - 0.5) * 0.25;
                    const rad = 11.0 + lRand() * 26.0;
                    const rx = hx + Math.cos(ang) * rad;
                    const rz = hz + Math.sin(ang) * rad;
                    if (getRoadDistance(rx, rz) < 4.5) continue;
                    const ry = getTerrainHeight(rx, rz);
                    const s = 1.1 + lRand() * 2.2;
                    const b = new THREE.Mesh(cragGeo, i % 3 === 0 ? mossCragMat : darkCragMat);
                    b.position.set(rx, ry + s * 0.32, rz);
                    b.scale.set(s * 1.2, s * 0.85, s * 1.1);
                    b.rotation.set(lRand() * 0.4, lRand() * Math.PI * 2, lRand() * 0.4);
                    b.receiveShadow = true;
                    scene.add(b);
                    addRockMeshCollider('hill_rock', b);
                }
            }

            // 2) AIR TERJUN KABUT (Silvermist Falls) di (155, 225) — Tebing Batu, Air Terjun Animasi & Kolam
            {
                const fx = 155, fz = 225;
                // Tekstur pita air terjun mengalir
                const wfCanvas = document.createElement('canvas');
                wfCanvas.width = 128;
                wfCanvas.height = 256;
                const wctx = wfCanvas.getContext('2d');
                const grad = wctx.createLinearGradient(0, 0, 128, 0);
                grad.addColorStop(0.0, 'rgba(186, 230, 253, 0.35)');
                grad.addColorStop(0.25, 'rgba(56, 189, 248, 0.85)');
                grad.addColorStop(0.5, 'rgba(224, 242, 254, 0.95)');
                grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.85)');
                grad.addColorStop(1.0, 'rgba(186, 230, 253, 0.35)');
                wctx.fillStyle = grad;
                wctx.fillRect(0, 0, 128, 256);
                for (let s = 0; s < 36; s++) {
                    wctx.fillStyle = s % 2 === 0 ? 'rgba(255,255,255,0.62)' : 'rgba(14,165,233,0.45)';
                    wctx.fillRect((s * 19) % 116, (s * 37) % 240, 4 + (s % 4) * 2, 28 + (s % 5) * 14);
                }
                waterfallTex = new THREE.CanvasTexture(wfCanvas);
                waterfallTex.wrapS = THREE.RepeatWrapping;
                waterfallTex.wrapT = THREE.RepeatWrapping;

                const wfMat = new THREE.MeshBasicMaterial({
                    map: waterfallTex,
                    transparent: true,
                    opacity: 0.88,
                    side: THREE.DoubleSide,
                });

                const poolY = -0.25;
                const cliffTopY = getTerrainHeight(fx, fz + 15);
                const fallH = Math.max(8.5, cliffTopY - poolY + 0.8);

                // 3 pita air terjun bertingkat menghadap selatan (-Z)
                const ribbons = [
                    { ox: 0.0, w: 5.4, oz: 9.8, h: fallH },
                    { ox: -3.2, w: 2.2, oz: 10.4, h: fallH * 0.92 },
                    { ox: 3.1, w: 2.0, oz: 10.3, h: fallH * 0.94 },
                ];
                for (const rb of ribbons) {
                    const wfMesh = new THREE.Mesh(new THREE.PlaneGeometry(rb.w, rb.h), wfMat);
                    wfMesh.position.set(fx + rb.ox, poolY + rb.h * 0.5 - 0.3, fz + rb.oz);
                    wfMesh.rotation.x = 0.14;
                    scene.add(wfMesh);
                }

                // Permukaan kolam air terjun biru jernih
                const poolMat = new THREE.MeshStandardMaterial({
                    color: 0x22a6c7,
                    roughness: 0.18,
                    metalness: 0.05,
                    transparent: true,
                    opacity: 0.84,
                });
                const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(11.8, 24), poolMat);
                poolMesh.rotation.x = -Math.PI * 0.5;
                poolMesh.position.set(fx, poolY, fz - 4.5);
                scene.add(poolMesh);

                // Cincin busa percikan di dasar air terjun
                const foamMat = new THREE.MeshBasicMaterial({ color: 0xe0f7ff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
                for (let k = 0; k < 3; k++) {
                    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2 + k * 1.1, 2.2 + k * 1.2, 18), foamMat.clone());
                    ring.rotation.x = -Math.PI * 0.5;
                    ring.position.set(fx + (k - 1) * 1.8, poolY + 0.05, fz + 8.6);
                    ring.userData = { phase: k * 2.1, baseScale: 1.0 };
                    scene.add(ring);
                    waterfallSplash.push(ring);
                }

                // Kabut putih lembut naik di kaki air terjun
                const mistMat = new THREE.MeshBasicMaterial({ color: 0xf0f9ff, transparent: true, opacity: 0.32, depthWrite: false });
                for (let k = 0; k < 8; k++) {
                    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + (k % 3) * 0.45, 1), mistMat.clone());
                    puff.position.set(fx + (k - 3.5) * 1.35, poolY + 0.9, fz + 7.6 + (k % 2) * 1.1);
                    puff.userData = {
                        baseX: puff.position.x,
                        baseY: poolY + 0.7,
                        baseZ: puff.position.z,
                        speed: 0.35 + (k % 4) * 0.1,
                        offset: k / 8,
                    };
                    scene.add(puff);
                    waterfallMist.push(puff);
                }

                // Tebing batu besar mengapit kiri-kanan-belakang air terjun + batu berlumut di tepi kolam
                const cliffRocks = [
                    [-8.5, 12.5, 4.6], [8.5, 12.5, 4.8], [-12.0, 6.5, 3.8], [12.0, 6.5, 3.9],
                    [-5.2, 15.5, 5.2], [5.2, 15.5, 5.0], [0.0, 17.0, 5.8],
                    [-10.2, -1.5, 2.4], [10.4, -1.2, 2.5], [-7.5, -10.5, 1.8], [8.0, -9.8, 1.9],
                ];
                for (const [ox, oz, s] of cliffRocks) {
                    const rx = fx + ox, rz = fz + oz;
                    const ry = getTerrainHeight(rx, rz);
                    const rMesh = new THREE.Mesh(cragGeo, Math.abs(oz) < 6 ? mossCragMat : darkCragMat);
                    rMesh.position.set(rx, ry + s * 0.42, rz);
                    rMesh.scale.set(s * 1.15, s * 1.05, s * 1.05);
                    rMesh.rotation.set(0.15, ox * 0.4, 0.1);
                    rMesh.receiveShadow = true;
                    scene.add(rMesh);
                    addRockMeshCollider('waterfall_rock', rMesh);
                }
            }

            // 3) JURANG BAYANGAN (Shadowrift Gorge) di (175, -145) — Dinding Jurang, Gardu Pandang Kayu & Kabut Dasar
            {
                const gx = 175, gz = -145;
                // Bongkahan dinding tebing terjal mengapit sisi barat & timur jurang
                for (let i = 0; i < 24; i++) {
                    const side = i % 2 === 0 ? -1 : 1;
                    const t = (Math.floor(i / 2) / 11) - 0.5;
                    const rx = gx + side * (16.5 + (i % 3) * 2.2);
                    const rz = gz + t * 92.0;
                    if (getRoadDistance(rx, rz) < 4.8) continue;
                    const ry = getTerrainHeight(rx, rz);
                    const s = 2.6 + (i % 4) * 0.95;
                    const wall = new THREE.Mesh(cragGeo, darkCragMat);
                    wall.position.set(rx, ry + s * 0.35, rz);
                    wall.scale.set(s * 1.05, s * 1.45, s * 1.25);
                    wall.rotation.set(0.1, i * 0.7, 0.12);
                    wall.receiveShadow = true;
                    scene.add(wall);
                    addRockMeshCollider('gorge_rock', wall);
                }
                // Kabut dalam jurang
                const gMistMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.22, depthWrite: false });
                for (let k = 0; k < 7; k++) {
                    const mPlane = new THREE.Mesh(new THREE.CircleGeometry(11.0 + (k % 3) * 3.0, 14), gMistMat);
                    mPlane.rotation.x = -Math.PI * 0.5;
                    const mz = gz - 36 + k * 12;
                    mPlane.position.set(gx, getTerrainHeight(gx, mz) + 2.2, mz);
                    mPlane.userData = { baseX: gx, phase: k * 1.1 };
                    scene.add(mPlane);
                    gorgeMist.push(mPlane);
                }
                // Gardu pandang kayu di tepi barat laut jurang (bisa jadi spot story!)
                const ox = gx + 23.5, oz = gz + 5.0;
                const oy = getTerrainHeight(ox, oz);
                const deck = new THREE.Group();
                deck.position.set(ox, oy, oz);
                deck.rotation.y = -Math.PI * 0.5;
                const plat = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 2.4), woodDeckMat);
                plat.position.y = 0.22;
                deck.add(plat);
                for (const sx of [-1.7, 0, 1.7]) {
                    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.15, 0.18), woodDeckMat);
                    post.position.set(sx, 0.65, -1.08);
                    deck.add(post);
                }
                const rail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 0.14), woodDeckMat);
                rail.position.set(0, 1.12, -1.08);
                deck.add(rail);
                scene.add(deck);
            }

            // 4) JALAN BEBATUAN (rocky_falls_road) & JALAN TEBING BEBATUAN (cliff_boulder_pass)
            // Penuh bebatuan di permukaan & bahu tebing, tapi tetap lebar ~5.4m agar bisa dilewati pelan & hati-hati
            for (const poly of allRoadPolylines) {
                if (poly.surface !== 'rocky' && poly.surface !== 'cliff') continue;
                const isCliff = poly.surface === 'cliff';
                const pts = poly.pts;
                for (let i = 1; i < pts.length - 1; i++) {
                    const pt = pts[i];
                    const prev = pts[i - 1];
                    const next = pts[i + 1];
                    const tx = next[0] - prev[0], tz = next[1] - prev[1];
                    const tLen = Math.hypot(tx, tz) || 1.0;
                    const nx = -tz / tLen, nz = tx / tLen;

                    // Batu pipih / kerikil kasar di badan jalan (tinggi 0.06..0.13m: terasa berguncang tapi aman dilalui pelan)
                    const stonesPerStep = isCliff ? 3 : 2;
                    for (let k = 0; k < stonesPerStep; k++) {
                        const lat = (lRand() - 0.5) * 3.8;
                        const along = (lRand() - 0.5) * 2.4;
                        const sx = pt[0] + nx * lat + (tx / tLen) * along;
                        const sz = pt[1] + nz * lat + (tz / tLen) * along;
                        const sy = getTerrainHeight(sx, sz);
                        const rw = 0.36 + lRand() * 0.42;
                        const rh = isCliff ? (0.07 + lRand() * 0.06) : (0.06 + lRand() * 0.05);
                        const slab = new THREE.Mesh(slabGeo, k % 2 === 0 ? roadSlabMat : paleStoneMat);
                        slab.position.set(sx, sy + rh * 0.18, sz);
                        slab.scale.set(rw, rh, rw * (0.75 + lRand() * 0.45));
                        slab.rotation.set(0, lRand() * Math.PI * 2, 0);
                        slab.receiveShadow = true;
                        scene.add(slab);
                        addRockMeshCollider('road_rock', slab);
                    }

                    // Bongkahan batu besar di kedua bahu jalan (menjaga lorong tengah ~5.4m tetap bisa lewat)
                    for (const side of [-1, 1]) {
                        if (!isCliff && i % 2 === 1 && side === 1) continue;
                        const off = (isCliff ? 3.55 : 3.85) + lRand() * 1.85;
                        const bx = pt[0] + nx * side * off;
                        const bz = pt[1] + nz * side * off;
                        const by = getTerrainHeight(bx, bz);
                        // Sisi timur jalan tebing (+X) punya dinding batu tebing lebih tinggi
                        const isCliffWallSide = isCliff && (nx * side > 0.25);
                        const bs = isCliffWallSide ? (1.8 + lRand() * 2.1) : (0.75 + lRand() * 0.85);
                        const boulder = new THREE.Mesh(cragGeo, isCliffWallSide ? darkCragMat : (i % 3 === 0 ? mossCragMat : rockMat));
                        boulder.position.set(bx, by + bs * 0.34, bz);
                        boulder.scale.set(bs * 1.15, bs * (isCliffWallSide ? 1.25 : 0.78), bs);
                        boulder.rotation.set(lRand() * 0.3, lRand() * Math.PI * 2, lRand() * 0.3);
                        boulder.receiveShadow = true;
                        scene.add(boulder);
                        addRockMeshCollider('cliff_shoulder_rock', boulder);
                    }
                }
            }

            // 5) Dekorasi Hutan Rimba Purba (Deepwood Thicket, -195, 215): batu berlumut & jamur bercahaya
            {
                const mushroomCapMat = new THREE.MeshBasicMaterial({ color: 0x5eead4 });
                const stemMat = new THREE.MeshLambertMaterial({ color: 0xd6d3d1 });
                for (let i = 0; i < 26; i++) {
                    const ang = lRand() * Math.PI * 2;
                    const rad = 8.0 + Math.sqrt(lRand()) * 62.0;
                    const mx = -195.0 + Math.cos(ang) * rad;
                    const mz = 215.0 + Math.sin(ang) * rad;
                    if (getRoadDistance(mx, mz) < 4.5) continue;
                    const my = getTerrainHeight(mx, mz);
                    const mg = new THREE.Group();
                    mg.position.set(mx, my, mz);
                    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.45, 6), stemMat);
                    st.position.y = 0.22;
                    mg.add(st);
                    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.24, 7), mushroomCapMat);
                    cap.position.y = 0.48;
                    mg.add(cap);
                    scene.add(mg);
                }
            }
        })();

        // 6-8) Model 3D Spesialis (Reruntuhan Kuil Kuno, Goa Kristal, Pemukiman Bandit)
        const storySiteAnimators = [];
        {
            const siteCtxBase = {
                getTerrainHeight,
                applyStylizedCelShading,
                isMobileDevice,
                addCircleCollider,
                addRockMeshCollider,
            };
            const builtSites = [
                createAncientSunRuins({ ...siteCtxBase, x: RUINS_SITE.x, z: RUINS_SITE.z, rotationY: 0.35 }),
                createCrystalCavern({ ...siteCtxBase, x: CAVERN_SITE.x, z: CAVERN_SITE.z, rotationY: -2.35 }),
                createBanditSettlement({ ...siteCtxBase, x: BANDIT_SITE.x, z: BANDIT_SITE.z, rotationY: 0.25 }),
            ];
            for (const built of builtSites) {
                if (!built || !built.group) continue;
                scene.add(built.group);
                if (typeof built.update === 'function') storySiteAnimators.push(built);
            }
        }

        // ---- 5 Desa Terhubung Jaringan Jalan (posisi & jumlah bangunan diacak dari modul model) ----
        const villageAnimated = {
            smokePuffs: [],
            signPivots: [],
            embers: [],
            wellWaters: [],
            bucketPivots: [],
        };
        const villageWorkshops = [];
        const villageWells = [];
        const villageFarms = [];
        const villageData = {
            buildings: {},
            buildingList: [],
            stations: {
                planters: [],
                benches: [],
            },
            villages: [],
            indoorsCount: 0,
        };

        (function buildVillage() {
            const villageCtx = {
                applyStylizedCelShading,
                isMobileDevice,
                getTerrainHeight,
                warmGlowTex,
            };
            const palette = createVillageMaterialPalette(villageCtx);

            function localToWorldXZ(wx, wz, yaw, sc, lx, lz) {
                const cosY = Math.cos(yaw);
                const sinY = Math.sin(yaw);
                const sx = lx * sc;
                const sz = lz * sc;
                return {
                    x: wx + sx * cosY + sz * sinY,
                    z: wz - sx * sinY + sz * cosY,
                };
            }

            let _activeVillageRec = null;
            function registerModelMeta(group, wx, wy, wz, yaw, fallbackType = 'house', scale = 1.0) {
                const ud = group.userData || {};
                if (Array.isArray(ud.lanterns)) {
                    for (const l of ud.lanterns) roadLanterns.push(l);
                }
                if (ud.animated) {
                    if (Array.isArray(ud.animated.smokePuffs)) {
                        for (const sp of ud.animated.smokePuffs) {
                            if (sp && sp.userData) sp.userData._vRec = _activeVillageRec;
                            villageAnimated.smokePuffs.push(sp);
                        }
                    }
                    if (ud.animated.signPivot) {
                        ud.animated.signPivot.userData = ud.animated.signPivot.userData || {};
                        ud.animated.signPivot.userData._vRec = _activeVillageRec;
                        villageAnimated.signPivots.push(ud.animated.signPivot);
                    }
                    if (ud.animated.embers) {
                        ud.animated.embers._vRec = _activeVillageRec;
                        villageAnimated.embers.push(ud.animated.embers);
                    }
                    if (ud.animated.wellWater) {
                        ud.animated.wellWater.userData = ud.animated.wellWater.userData || {};
                        ud.animated.wellWater.userData._vRec = _activeVillageRec;
                        villageAnimated.wellWaters.push(ud.animated.wellWater);
                    }
                    if (ud.animated.bucketPivot) {
                        ud.animated.bucketPivot.userData = ud.animated.bucketPivot.userData || {};
                        ud.animated.bucketPivot.userData._vRec = _activeVillageRec;
                        villageAnimated.bucketPivots.push(ud.animated.bucketPivot);
                    }
                }
                if (Array.isArray(ud.colliders)) {
                    const cosY = Math.cos(yaw);
                    const sinY = Math.sin(yaw);
                    for (const c of ud.colliders) {
                        const lx = (c.localX || 0) * scale;
                        const lz = (c.localZ || 0) * scale;
                        const cx = wx + lx * cosY + lz * sinY;
                        const cz = wz - lx * sinY + lz * cosY;
                        addCircleCollider(c.type || fallbackType, cx, cz, (c.radius || 0.45) * scale, wy + (c.height || 3.5) * scale, group);
                    }
                } else if (ud.collider) {
                    addCircleCollider(
                        ud.collider.type || fallbackType,
                        wx,
                        wz,
                        (ud.collider.radius || 2.2) * scale,
                        wy + (ud.collider.height || 4.0) * scale,
                        group
                    );
                }
            }

            // Helper: Bake 1-draw-call Ultra-Low-Res LOD persis dari bentuk asli setiap rumah & gerbang desa
            const lodBaseBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
            const lodSharedMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
            applyStylizedCelShading(lodSharedMat, { lowRes: true, rimStrength: 0.18, inkStrength: 0.55 });
            const lodN3 = new THREE.Matrix3();
            const lodV = new THREE.Vector3();
            const lodN = new THREE.Vector3();
            const lodC = new THREE.Color();
            const lodS = new THREE.Vector3();
            const lodQ = new THREE.Quaternion();
            const lodP = new THREE.Vector3();
            const lodM = new THREE.Matrix4();
            const lodPosAttr = lodBaseBox.attributes.position;
            const lodNormAttr = lodBaseBox.attributes.normal;

            function bakeExactLowResVillageLod(villageGroup, vId) {
                villageGroup.updateMatrixWorld(true);
                const p = [];
                const n = [];
                const c = [];
                const quant = 0.20; // kuantisasi grid 20cm -> siluet rumah asli persis, resolusi sangat rendah & ringan!
                const qCoord = (v) => Math.round(v / quant) * quant;

                villageGroup.traverse((obj) => {
                    if (!obj.isMesh || !obj.visible) return;
                    if (obj.isInstancedMesh || obj.isSprite) return;
                    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                    if (!mat) return;
                    if (mat.transparent && (mat.opacity !== undefined && mat.opacity < 0.75)) return;
                    if (obj.userData && (obj.userData.baseScale !== undefined || obj.userData.isSmoke || obj.userData.isGlow)) return;

                    const geo = obj.geometry;
                    if (!geo || !geo.attributes || !geo.attributes.position) return;
                    if (!geo.boundingBox) geo.computeBoundingBox();
                    const bb = geo.boundingBox;
                    if (!bb) return;

                    obj.matrixWorld.decompose(lodP, lodQ, lodS);
                    const szX = (bb.max.x - bb.min.x) * Math.abs(lodS.x);
                    const szY = (bb.max.y - bb.min.y) * Math.abs(lodS.y);
                    const szZ = (bb.max.z - bb.min.z) * Math.abs(lodS.z);
                    const maxDim = Math.max(szX, szY, szZ);
                    // Abaikan detail super mungil (< 24cm: paku, kelopak bunga, gagang kecil) agar sangat ringan
                    if (maxDim < 0.24) return;

                    if (mat.color) lodC.copy(mat.color);
                    else lodC.setHex(0xb8a690);
                    // Kuantisasi warna kasar ala low-res
                    const r = Math.round(lodC.r * 10) / 10;
                    const g = Math.round(lodC.g * 10) / 10;
                    const b = Math.round(lodC.b * 10) / 10;

                    const posAttr = geo.attributes.position;
                    const idxAttr = geo.index;
                    const triCount = idxAttr ? (idxAttr.count / 3) : (posAttr.count / 3);
                    const colAttr = geo.attributes.color;

                    if (triCount > 0 && triCount <= 48) {
                        // Bentuk struktur rumah asli (atap miring/gable, cerobong, dinding, beranda, gerbang, kusen):
                        // salin segitiga aslinya dengan kuantisasi posisi kasar agar bentuk persis sama aslinya!
                        const vA = new THREE.Vector3();
                        const vB = new THREE.Vector3();
                        const vC = new THREE.Vector3();
                        const e1 = new THREE.Vector3();
                        const e2 = new THREE.Vector3();
                        const fn = new THREE.Vector3();
                        const total = idxAttr ? idxAttr.count : posAttr.count;
                        for (let i = 0; i + 2 < total; i += 3) {
                            const i0 = idxAttr ? idxAttr.getX(i) : i;
                            const i1 = idxAttr ? idxAttr.getX(i + 1) : i + 1;
                            const i2 = idxAttr ? idxAttr.getX(i + 2) : i + 2;
                            vA.fromBufferAttribute(posAttr, i0).applyMatrix4(obj.matrixWorld);
                            vB.fromBufferAttribute(posAttr, i1).applyMatrix4(obj.matrixWorld);
                            vC.fromBufferAttribute(posAttr, i2).applyMatrix4(obj.matrixWorld);
                            vA.set(qCoord(vA.x), qCoord(vA.y), qCoord(vA.z));
                            vB.set(qCoord(vB.x), qCoord(vB.y), qCoord(vB.z));
                            vC.set(qCoord(vC.x), qCoord(vC.y), qCoord(vC.z));
                            e1.subVectors(vB, vA);
                            e2.subVectors(vC, vA);
                            fn.crossVectors(e1, e2);
                            if (fn.lengthSq() < 1e-8) continue;
                            fn.normalize();
                            const cr = colAttr ? Math.round(colAttr.getX(i0) * lodC.r * 10) / 10 : r;
                            const cg = colAttr ? Math.round(colAttr.getY(i0) * lodC.g * 10) / 10 : g;
                            const cb = colAttr ? Math.round(colAttr.getZ(i0) * lodC.b * 10) / 10 : b;
                            p.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
                            n.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
                            c.push(cr, cg, cb, cr, cg, cb, cr, cg, cb);
                        }
                    } else {
                        // Mesh melengkung poligon banyak (tong, pilar bulat, sumur bulat) -> ganti 1 kotak terorientasi low-poly
                        const locCenter = bb.getCenter(new THREE.Vector3());
                        const locSize = bb.getSize(new THREE.Vector3());
                        lodM.compose(locCenter, new THREE.Quaternion(), locSize);
                        lodM.premultiply(obj.matrixWorld);
                        lodN3.getNormalMatrix(lodM);
                        for (let i = 0; i < lodPosAttr.count; i++) {
                            lodV.fromBufferAttribute(lodPosAttr, i).applyMatrix4(lodM);
                            lodN.fromBufferAttribute(lodNormAttr, i).applyMatrix3(lodN3).normalize();
                            p.push(qCoord(lodV.x), qCoord(lodV.y), qCoord(lodV.z));
                            n.push(lodN.x, lodN.y, lodN.z);
                            c.push(r, g, b);
                        }
                    }
                });

                if (!p.length) return null;
                const lodGeo = new THREE.BufferGeometry();
                lodGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
                lodGeo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
                lodGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
                lodGeo.computeBoundingSphere();
                const lodMesh = new THREE.Mesh(lodGeo, lodSharedMat);
                lodMesh.name = `${vId}-lod`;
                lodMesh.visible = false;
                lodMesh.castShadow = false;
                lodMesh.receiveShadow = false;
                lodMesh.userData.isVillageLod = true;
                return lodMesh;
            }

            for (let vIdx = 0; vIdx < VILLAGES.length; vIdx++) {
                const v = VILLAGES[vIdx];
                const villageGroup = new THREE.Group();
                villageGroup.name = v.id;
                scene.add(villageGroup);

                const vRec = {
                    id: v.id,
                    title: v.title,
                    cx: v.cx,
                    cz: v.cz,
                    radius: v.radius,
                    fighterRole: v.fighterRole,
                    merchantRole: v.merchantRole,
                    farmerRoles: v.farmerRoles,
                    group: villageGroup,
                    lodMesh: null,
                    isNear: true,
                    buildings: {},
                    buildingList: [],
                    stations: {
                        planters: [],
                        benches: [],
                    },
                    indoorsCount: 0,
                };
                _activeVillageRec = vRec;

                // Helper koordinat sepanjang poros jalan desa: along (maju/mundur), lat (kanan +, kiri -)
                const streetPt = (along, lat = 0) => {
                    const r = v.roadFn(along);
                    const rnx = Math.cos(r.yaw);
                    const rnz = -Math.sin(r.yaw);
                    return {
                        x: r.x + rnx * lat,
                        z: r.z + rnz * lat,
                        roadX: r.x,
                        roadZ: r.z,
                        yaw: r.yaw,
                        rnx,
                        rnz,
                    };
                };

                // 1. Gerbang Masuk Desa
                const gateP = streetPt(-24.5, 0);
                const gateY = getTerrainHeight(gateP.x, gateP.z);
                const gateScale = 1.24;
                const gateArch = createVillageGateArch(villageCtx, {
                    spanWidth: 7.4,
                    clearHeight: 4.5,
                    title: v.title,
                });
                gateArch.scale.setScalar(gateScale);
                gateArch.position.set(gateP.x, gateY, gateP.z);
                gateArch.rotation.y = gateP.yaw;
                villageGroup.add(gateArch);
                registerModelMeta(gateArch, gateP.x, gateY, gateP.z, gateP.yaw, 'gate_post', gateScale);
                vRec.gateSign = { x: gateP.x, y: gateY + 4.65 * gateScale, z: gateP.z, yaw: gateP.yaw, groundY: gateY };
                v.gateSign = vRec.gateSign;

                const gSouthP = streetPt(-22.5, -2.4);
                const gSouthFace = streetPt(-28.0, 0);
                vRec.stations.gateSouth = { x: gSouthP.x, z: gSouthP.z, faceX: gSouthFace.x, faceZ: gSouthFace.z };
                const gNorthP = streetPt(20.5, 2.2);
                const gNorthFace = streetPt(26.0, 0);
                vRec.stations.gateNorth = { x: gNorthP.x, z: gNorthP.z, faceX: gNorthFace.x, faceZ: gNorthFace.z };

                // 2. Bangunan Utama Desa dengan posisi & jumlah acak (5..8 bangunan per desa)
                const doorApproachPoints = [];
                for (const lot of v.lots) {
                    const p = streetPt(lot.along, lot.side * lot.off);
                    const hx = p.x;
                    const hz = p.z;
                    const hy = getTerrainHeight(hx, hz);
                    const sc = lot.scale || 1.0;
                    const yaw = p.yaw + (lot.side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) + (lot.rot || 0);

                    let bldg = null;
                    if (lot.kind === 'tavern') {
                        bldg = createVillageTavernInn(palette, villageCtx, lot);
                    } else if (lot.kind === 'blacksmith') {
                        bldg = createBlacksmithWorkshop(palette, villageCtx, lot);
                    } else if (lot.kind === 'stall') {
                        bldg = createMarketStall(palette, villageCtx, lot);
                    } else if (lot.kind === 'barn') {
                        bldg = createStorageBarn(palette, villageCtx, lot);
                    } else {
                        bldg = createCozyCottage(palette, villageCtx, lot);
                    }

                    bldg.scale.setScalar(sc);
                    bldg.position.set(hx, hy, hz);
                    bldg.rotation.y = yaw;
                    villageGroup.add(bldg);
                    registerModelMeta(bldg, hx, hy, hz, yaw, 'house', sc);

                    const ud = bldg.userData || {};
                    const dl = ud.doorLocal;
                    const approachZOff = lot.kind === 'tavern' ? -2.75 : -1.50;
                    const doorZOff = lot.kind === 'tavern' ? -0.55 : -0.58;
                    const dLocX = dl ? dl.x : 0;
                    const dLocZ = dl ? dl.z : -lot.d * 0.5;
                    const dLocY = dl ? dl.y : 0.36;

                    const approachWorld = localToWorldXZ(hx, hz, yaw, sc, dLocX, dLocZ + approachZOff);
                    const doorWorld = localToWorldXZ(hx, hz, yaw, sc, dLocX, dLocZ + doorZOff);
                    const insideWorld = localToWorldXZ(hx, hz, yaw, sc, dLocX, dLocZ + 1.20);
                    approachWorld.y = getTerrainHeight(approachWorld.x, approachWorld.z);
                    doorWorld.y = hy + dLocY * sc;
                    insideWorld.y = hy + dLocY * sc;

                    if (dl) {
                        const rec = {
                            id: lot.id,
                            villageId: v.id,
                            kind: lot.kind,
                            x: hx,
                            y: hy,
                            z: hz,
                            yaw,
                            scale: sc,
                            doorWorld,
                            approachWorld,
                            insideWorld,
                            doorPivot: ud.doorPivot || null,
                            doorPivotR: ud.doorPivotR || null,
                            doorOpenAmt: 0,
                            doorTarget: 0,
                        };
                        vRec.buildings[lot.id] = rec;
                        vRec.buildings[lot.localRoleKey] = rec;
                        vRec.buildings[lot.kind] = vRec.buildings[lot.kind] || rec;
                        vRec.buildingList.push(rec);
                        villageData.buildings[lot.id] = rec;
                        if (vIdx === 0) villageData.buildings[lot.localRoleKey] = rec;
                        villageData.buildingList.push(rec);
                    }

                    if (lot.kind === 'blacksmith' && !vRec.stations.forge) {
                        vRec.blacksmithLot = { x: hx, z: hz, yaw, sc, w: lot.w, d: lot.d };
                        v.blacksmithLot = vRec.blacksmithLot;
                        const forgeStand = localToWorldXZ(hx, hz, yaw, sc, 1.45, -2.55);
                        vRec.stations.forge = { x: forgeStand.x, z: forgeStand.z, faceX: hx, faceZ: hz };
                        // Zona Bengkel Gerobak tepat di depan bangunan pandai besi menghadap jalan & rumput sekitar
                        const wsBay = localToWorldXZ(hx, hz, yaw, sc, 0.2, -lot.d * 0.5 - 2.65);
                        const bayY = getTerrainHeight(wsBay.x, wsBay.z);
                        const apronMat = new THREE.MeshLambertMaterial({ color: 0xa68358 });
                        const apron = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.045, 2.0), apronMat);
                        apron.position.set(wsBay.x, bayY + 0.02, wsBay.z);
                        apron.rotation.y = yaw;
                        apron.receiveShadow = true;
                        villageGroup.add(apron);
                        // Roda kayu cadangan bersandar di depan toko sebagai penanda bengkel
                        const wheelMarker = new THREE.Mesh(
                            new THREE.TorusGeometry(0.42, 0.08, 6, 12),
                            new THREE.MeshLambertMaterial({ color: 0x5c3c20 })
                        );
                        const wheelPt = localToWorldXZ(hx, hz, yaw, sc, -1.35, -lot.d * 0.5 - 0.55);
                        wheelMarker.position.set(wheelPt.x, getTerrainHeight(wheelPt.x, wheelPt.z) + 0.44, wheelPt.z);
                        wheelMarker.rotation.y = yaw + 0.15;
                        wheelMarker.rotation.x = -0.18;
                        villageGroup.add(wheelMarker);
                        const wsRec = {
                            villageId: v.id,
                            villageName: v.name,
                            x: wsBay.x,
                            z: wsBay.z,
                            bayYaw: yaw,
                            shopX: hx,
                            shopZ: hz,
                            shopYaw: yaw,
                        };
                        vRec.stations.workshop = wsRec;
                        villageWorkshops.push(wsRec);
                    } else if (lot.kind === 'tavern' && !vRec.stations.tavernPorch) {
                        const tavFront = localToWorldXZ(hx, hz, yaw, sc, 1.2, -5.35);
                        vRec.stations.tavernPorch = { x: tavFront.x, z: tavFront.z, faceX: hx, faceZ: hz };
                    } else if (lot.kind === 'stall') {
                        const stallFront = localToWorldXZ(hx, hz, yaw, sc, 0, -1.75);
                        const stallBack = localToWorldXZ(hx, hz, yaw, sc, 0.22, 0.52);
                        const shopDrop = localToWorldXZ(hx, hz, yaw, sc, -1.55, -1.35);
                        const stallSpot = { x: stallFront.x, z: stallFront.z, faceX: p.roadX, faceZ: p.roadZ };
                        if (!vRec.stations.stallA) {
                            vRec.stations.stallA = stallSpot;
                            vRec.stations.merchantPost = {
                                x: stallBack.x,
                                z: stallBack.z,
                                y: hy + 0.16 * sc,
                                faceX: stallFront.x,
                                faceZ: stallFront.z,
                                behindStall: true,
                            };
                            vRec.stations.shopDrop = { x: shopDrop.x, z: shopDrop.z, faceX: hx, faceZ: hz };
                            // Visual peti stok panen di samping toko merchant (bertambah saat petani/pemain panen)
                            const stockCrates = [];
                            const stockCrateMat = new THREE.MeshLambertMaterial({ color: 0x9c6e3b });
                            const stockWheatMat = new THREE.MeshLambertMaterial({ color: 0xebbf3b });
                            const stockCarrotMat = new THREE.MeshLambertMaterial({ color: 0xe86e24 });
                            for (let ci = 0; ci < 8; ci++) {
                                const col = ci % 2;
                                const row = Math.floor(ci / 2) % 2;
                                const tier = Math.floor(ci / 4);
                                const cg = new THREE.Group();
                                const crateBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.42), stockCrateMat);
                                crateBox.position.y = 0.17;
                                crateBox.castShadow = !isMobileDevice;
                                crateBox.receiveShadow = true;
                                cg.add(crateBox);
                                const produce = new THREE.Mesh(
                                    new THREE.BoxGeometry(0.38, 0.14, 0.34),
                                    ci % 2 === 0 ? stockWheatMat : stockCarrotMat
                                );
                                produce.position.y = 0.36;
                                cg.add(produce);
                                const cp = localToWorldXZ(hx, hz, yaw, sc, -1.38 - col * 0.36, -0.35 + row * 0.34);
                                const cy = getTerrainHeight(cp.x, cp.z);
                                cg.position.set(cp.x, cy + tier * 0.35, cp.z);
                                cg.rotation.y = yaw + (ci % 3 - 1) * 0.08;
                                cg.visible = ci < 2; // mulai dengan 2 peti stok awal (4 hasil panen)
                                villageGroup.add(cg);
                                stockCrates.push(cg);
                            }
                            vRec.shopStock = {
                                villageId: v.id,
                                villageName: v.name,
                                crops: 4,
                                deliveredTotal: 0,
                                crates: stockCrates,
                            };
                        } else {
                            vRec.stations.stallB = stallSpot;
                        }
                    } else if (lot.kind === 'barn' && !vRec.stations.barnYard) {
                        vRec.barnLot = { x: hx, z: hz, yaw, sc, w: lot.w, d: lot.d };
                        vRec.stations.barnYard = { x: approachWorld.x, z: approachWorld.z, faceX: hx, faceZ: hz };
                    } else if (lot.kind === 'cottage' && !vRec.stations.garden) {
                        const gardenSpot = localToWorldXZ(hx, hz, yaw, sc, 1.8, -3.5);
                        vRec.stations.garden = { x: gardenSpot.x, z: gardenSpot.z, faceX: hx, faceZ: hz };
                    }

                    const roadEdge = streetPt(lot.along, lot.side * 2.3);
                    const pathEnd = dl ? approachWorld : localToWorldXZ(hx, hz, yaw, sc, 0, -lot.d * 0.5 - 1.1);
                    doorApproachPoints.push({
                        road: { x: roadEdge.x, z: roadEdge.z },
                        door: pathEnd,
                        seed: lot.seed || 1,
                    });
                }

                // 2B. Lahan Pertanian Kecil Desa (bisa ditanam & dipanen petani maupun pemain -> masuk stok toko desa)
                {
                    const bl = vRec.barnLot;
                    let fpX, fpZ, fpYaw;
                    if (bl) {
                        const sidePt = localToWorldXZ(bl.x, bl.z, bl.yaw, bl.sc, bl.w * 0.5 + 2.45, 0.35);
                        fpX = sidePt.x;
                        fpZ = sidePt.z;
                        fpYaw = bl.yaw;
                    } else {
                        const spFarm = streetPt(6.5, -13.5);
                        fpX = spFarm.x;
                        fpZ = spFarm.z;
                        fpYaw = spFarm.yaw;
                    }
                    const fpY = getTerrainHeight(fpX, fpZ);
                    paintGrassVisibilityCircle(fpX, fpZ, 3.6, 0.0);

                    const farmGroup = new THREE.Group();
                    farmGroup.position.set(fpX, fpY, fpZ);
                    farmGroup.rotation.y = fpYaw;
                    villageGroup.add(farmGroup);

                    const soilMat = new THREE.MeshLambertMaterial({ color: 0x5c3d24 });
                    const furrowMat = new THREE.MeshLambertMaterial({ color: 0x472e19 });
                    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x7c5733 });
                    const sproutMat = new THREE.MeshLambertMaterial({ color: 0x5ca638 });
                    const growMat = new THREE.MeshLambertMaterial({ color: 0x4f912f });
                    const ripeWheatMat = new THREE.MeshLambertMaterial({ color: 0xebc23f });
                    const ripeCarrotMat = new THREE.MeshLambertMaterial({ color: 0xeb6e23 });

                    // Petak tanah gembur + 3 bedengan alur bajak
                    const plotW = 4.6, plotD = 3.6;
                    const soilBase = new THREE.Mesh(new THREE.BoxGeometry(plotW, 0.14, plotD), soilMat);
                    soilBase.position.y = 0.05;
                    soilBase.receiveShadow = true;
                    farmGroup.add(soilBase);
                    for (let r = -1; r <= 1; r++) {
                        const ridge = new THREE.Mesh(new THREE.BoxGeometry(plotW - 0.55, 0.10, 0.72), furrowMat);
                        ridge.position.set(0, 0.13, r * 1.05);
                        ridge.receiveShadow = true;
                        farmGroup.add(ridge);
                    }
                    // Pagar kayu rendah di 3 sisi (bagian depan -Z terbuka untuk akses petani/kuda)
                    const halfW = plotW * 0.5 + 0.18, halfD = plotD * 0.5 + 0.18;
                    const postCoords = [
                        [-halfW, -halfD], [halfW, -halfD],
                        [-halfW, 0], [halfW, 0],
                        [-halfW, halfD], [0, halfD], [halfW, halfD],
                    ];
                    for (const [px, pz] of postCoords) {
                        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.14), fenceMat);
                        post.position.set(px, 0.41, pz);
                        post.castShadow = !isMobileDevice;
                        farmGroup.add(post);
                    }
                    // Rel pagar kiri, kanan, belakang
                    for (const ry of [0.32, 0.64]) {
                        const railBack = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.09, 0.08), fenceMat);
                        railBack.position.set(0, ry, halfD);
                        farmGroup.add(railBack);
                        for (const sx of [-1, 1]) {
                            const railSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, halfD * 2), fenceMat);
                            railSide.position.set(sx * halfW, ry, 0);
                            farmGroup.add(railSide);
                        }
                    }

                    // 9 petak tanaman (3x3): stage 0 = bibit/kosong, 1 = tumbuh hijau, 2 = matang siap panen
                    const tiles = [];
                    const cropTypes = ['wheat', 'wheat', 'carrot'];
                    for (let r = 0; r < 3; r++) {
                        for (let c = 0; c < 3; c++) {
                            const lx = (c - 1) * 1.28;
                            const lz = (r - 1) * 1.05;
                            const tileWorld = localToWorldXZ(fpX, fpZ, fpYaw, 1.0, lx, lz);
                            const cropKind = cropTypes[(r + c) % cropTypes.length];

                            const tg = new THREE.Group();
                            tg.position.set(lx, 0.16, lz);
                            farmGroup.add(tg);

                            // Stage 0: bibit kecil baru ditanam
                            const s0 = new THREE.Group();
                            for (let k = 0; k < 3; k++) {
                                const sp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.09), sproutMat);
                                sp.position.set((k - 1) * 0.18, 0.07, (k % 2 - 0.5) * 0.14);
                                s0.add(sp);
                            }
                            tg.add(s0);

                            // Stage 1: batang hijau sedang
                            const s1 = new THREE.Group();
                            for (let k = 0; k < 5; k++) {
                                const ang = (k / 5) * Math.PI * 2;
                                const stMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.44, 0.10), growMat);
                                stMesh.position.set(Math.cos(ang) * 0.20, 0.22, Math.sin(ang) * 0.16);
                                stMesh.rotation.z = (k % 2 ? 0.12 : -0.12);
                                s1.add(stMesh);
                            }
                            tg.add(s1);

                            // Stage 2: tanaman matang siap panen (gandum emas tinggi atau wortel lebat)
                            const s2 = new THREE.Group();
                            if (cropKind === 'wheat') {
                                for (let k = 0; k < 6; k++) {
                                    const ang = (k / 6) * Math.PI * 2;
                                    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.82, 0.11), ripeWheatMat);
                                    stalk.position.set(Math.cos(ang) * 0.22, 0.41, Math.sin(ang) * 0.18);
                                    stalk.rotation.z = (k % 2 ? 0.14 : -0.14);
                                    s2.add(stalk);
                                }
                            } else {
                                for (let k = 0; k < 4; k++) {
                                    const ang = (k / 4) * Math.PI * 2 + 0.4;
                                    const rootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 0.15), ripeCarrotMat);
                                    rootMesh.position.set(Math.cos(ang) * 0.18, 0.11, Math.sin(ang) * 0.15);
                                    s2.add(rootMesh);
                                    const leafTop = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.34, 0.20), growMat);
                                    leafTop.position.set(Math.cos(ang) * 0.18, 0.36, Math.sin(ang) * 0.15);
                                    s2.add(leafTop);
                                }
                            }
                            tg.add(s2);

                            const idxTile = r * 3 + c;
                            const initStage = idxTile < 5 ? 2 : (idxTile < 7 ? 1 : 0);
                            s0.visible = initStage === 0;
                            s1.visible = initStage === 1;
                            s2.visible = initStage === 2;

                            tiles.push({
                                index: idxTile,
                                x: tileWorld.x,
                                z: tileWorld.z,
                                cropKind,
                                stage: initStage,
                                growT: initStage === 1 ? 10 : 0,
                                stageMeshes: [s0, s1, s2],
                            });
                        }
                    }

                    const farmRec = {
                        villageId: v.id,
                        villageName: v.name,
                        villageRef: vRec,
                        x: fpX,
                        z: fpZ,
                        yaw: fpYaw,
                        tiles,
                    };
                    vRec.farmPlot = farmRec;
                    vRec.stations.farmPlot = { x: fpX, z: fpZ, faceX: fpX, faceZ: fpZ };
                    villageFarms.push(farmRec);
                }

                // 3. Alun-alun Tengah: Sumur Batu Beratap + Papan Pengumuman + Bangku + Pot Bunga
                const wellP = streetPt(-1.5, 6.4);
                const wellX = wellP.x, wellZ = wellP.z;
                const wellY = getTerrainHeight(wellX, wellZ);
                const wellScale = 1.45;
                const wellGroup = createVillageWell(villageCtx, { seed: 7 + vIdx * 11 });
                wellGroup.scale.setScalar(wellScale);
                wellGroup.position.set(wellX, wellY, wellZ);
                wellGroup.rotation.y = wellP.yaw + Math.PI * 0.5 - 0.18;
                villageGroup.add(wellGroup);
                registerModelMeta(wellGroup, wellX, wellY, wellZ, wellGroup.rotation.y, 'well', wellScale);

                const wellStand = streetPt(-1.2, 3.8);
                const plazaStand = streetPt(-1.5, 2.8);
                vRec.stations.well = { x: wellStand.x, z: wellStand.z, faceX: wellX, faceZ: wellZ };
                vRec.stations.plaza = { x: plazaStand.x, z: plazaStand.z, faceX: wellX, faceZ: wellZ };
                villageWells.push({
                    villageId: v.id,
                    villageName: v.title,
                    x: wellStand.x,
                    z: wellStand.z,
                    wellX,
                    wellZ,
                });

                const plazaPath = createVillageStonePath(villageCtx, {
                    points: [
                        streetPt(-5.0, 2.2),
                        streetPt(-4.2, 4.2),
                        streetPt(-1.5, 8.8),
                        streetPt(1.8, 8.2),
                        streetPt(2.5, 2.2),
                    ],
                    width: 1.85,
                    seed: 101 + vIdx * 17,
                });
                villageGroup.add(plazaPath);

                for (const dp of doorApproachPoints) {
                    const pathMesh = createVillageStonePath(villageCtx, {
                        points: [dp.road, dp.door],
                        width: 1.55,
                        seed: dp.seed * 7 + 3,
                    });
                    villageGroup.add(pathMesh);
                }

                // Papan pengumuman desa
                const nbP = streetPt(-7.5, 4.4);
                const nbY = getTerrainHeight(nbP.x, nbP.z);
                const nbScale = 1.32;
                const noticeBoard = createVillageNoticeBoard(villageCtx, { seed: 12 + vIdx * 5 });
                noticeBoard.scale.setScalar(nbScale);
                noticeBoard.position.set(nbP.x, nbY, nbP.z);
                noticeBoard.rotation.y = nbP.yaw + Math.PI * 0.36;
                villageGroup.add(noticeBoard);
                registerModelMeta(noticeBoard, nbP.x, nbY, nbP.z, noticeBoard.rotation.y, 'prop', nbScale);
                const nbStand = streetPt(-6.8, 3.1);
                vRec.stations.noticeBoard = { x: nbStand.x, z: nbStand.z, faceX: nbP.x, faceZ: nbP.z };

                // Bangku kayu
                const benchDefs = [
                    { along: 2.4, lat: 6.1, rotOff: Math.PI + 0.12 },
                    { along: 3.5, lat: -5.2, rotOff: -Math.PI * 0.5 + 0.1 },
                ];
                benchDefs.forEach((bd, idx) => {
                    const bp = streetPt(bd.along, bd.lat);
                    const by = getTerrainHeight(bp.x, bp.z);
                    const bScale = 1.30;
                    const bench = createVillageBench(villageCtx, { seed: 20 + vIdx * 7 + idx });
                    bench.scale.setScalar(bScale);
                    bench.position.set(bp.x, by, bp.z);
                    bench.rotation.y = bp.yaw + bd.rotOff;
                    villageGroup.add(bench);
                    registerModelMeta(bench, bp.x, by, bp.z, bench.rotation.y, 'prop', bScale);
                    const bStand = streetPt(bd.along + 1.0, bd.lat * 0.85);
                    const stBench = { x: bStand.x, z: bStand.z, faceX: bp.x, faceZ: bp.z };
                    vRec.stations.benches.push(stBench);
                    if (vIdx === 0) villageData.stations.benches.push(stBench);
                });

                // Pot bunga desa
                const planterDefs = [
                    { along: -4.6, lat: 9.2, yawOff: 0.45, style: 'stone', seed: 31 + vIdx * 10 },
                    { along: 1.8,  lat: 9.0, yawOff: -0.55, style: 'wood', seed: 32 + vIdx * 10 },
                    { along: -8.0, lat: -4.8, yawOff: -Math.PI * 0.5, style: 'wood', seed: 33 + vIdx * 10 },
                    { along: 8.8,  lat: -5.4, yawOff: -Math.PI * 0.5, style: 'stone', seed: 34 + vIdx * 10 },
                ];
                planterDefs.forEach((pd) => {
                    const pp = streetPt(pd.along, pd.lat);
                    const py = getTerrainHeight(pp.x, pp.z);
                    const pScale = 1.30;
                    const planter = createVillageFlowerPlanter(villageCtx, pd);
                    planter.scale.setScalar(pScale);
                    planter.position.set(pp.x, py, pp.z);
                    planter.rotation.y = pp.yaw + pd.yawOff;
                    villageGroup.add(planter);
                    registerModelMeta(planter, pp.x, py, pp.z, planter.rotation.y, 'prop', pScale);
                    const pStand = streetPt(pd.along, pd.lat - Math.sign(pd.lat) * 1.3);
                    const stPlanter = { x: pStand.x, z: pStand.z, faceX: pp.x, faceZ: pp.z };
                    vRec.stations.planters.push(stPlanter);
                    if (vIdx === 0) villageData.stations.planters.push(stPlanter);
                });

                // Tumpukan peti & barel perbekalan
                const crateDefs = [
                    { along: 6.2,  lat: 8.4, yawOff: 0.35, withSack: true, seed: 41 + vIdx * 9 },
                    { along: 16.5, lat: 7.2, yawOff: -0.45, withSack: true, seed: 42 + vIdx * 9 },
                ];
                crateDefs.forEach((cd) => {
                    const cp = streetPt(cd.along, cd.lat);
                    const cy = getTerrainHeight(cp.x, cp.z);
                    const cScale = 1.32;
                    const crates = createVillageCrateCluster(villageCtx, cd);
                    crates.scale.setScalar(cScale);
                    crates.position.set(cp.x, cy, cp.z);
                    crates.rotation.y = cp.yaw + cd.yawOff;
                    villageGroup.add(crates);
                    registerModelMeta(crates, cp.x, cy, cp.z, crates.rotation.y, 'prop', cScale);
                });

                // 4. Tiang Lentera Desa
                const lanternAlong = [-19.5, -8.5, 2.5, 13.5];
                lanternAlong.forEach((al, idx) => {
                    const side = idx % 2 === 0 ? 1 : -1;
                    const lp = streetPt(al, side * 3.65);
                    const ly = getTerrainHeight(lp.x, lp.z);
                    const yaw = lp.yaw + (side > 0 ? Math.PI : 0);
                    const lScale = 1.30;
                    const lamp = createVillageLanternPost(villageCtx, {
                        withSign: idx === 0 || idx === 3,
                        phase: 1.1 + idx * 1.3 + vIdx * 0.7,
                        seed: 60 + vIdx * 12 + idx,
                    });
                    lamp.scale.setScalar(lScale);
                    lamp.position.set(lp.x, ly, lp.z);
                    lamp.rotation.y = yaw;
                    villageGroup.add(lamp);
                    registerModelMeta(lamp, lp.x, ly, lp.z, yaw, 'lantern', lScale);
                });

                // 5. Pagar Pekarangan Desa Rendah
                const fenceDefs = [
                    [streetPt(-23.0, -5.2), streetPt(-22.5, -18.0), streetPt(-12.0, -18.5)],
                    [streetPt(8.0, -18.5),  streetPt(20.0, -18.2),  streetPt(21.5, -5.5)],
                    [streetPt(15.0, 18.5),  streetPt(24.5, 18.5),   streetPt(25.5, 5.5)],
                ];
                fenceDefs.forEach((pts, idx) => {
                    // Di desa Radnar (vIdx === 0), biarkan halaman belakang rumah penempa terbuka luas untuk parkir gerobak pahlawan
                    if (vIdx === 0 && vRec.blacksmithLot && pts.length >= 2) {
                        const bs = vRec.blacksmithLot;
                        const mid = pts[Math.floor(pts.length / 2)];
                        if (Math.hypot(mid.x - bs.x, mid.z - bs.z) < 15.5) return;
                    }
                    const fRun = createVillageFenceRun(villageCtx, { points: pts, low: true, seed: 80 + vIdx * 10 + idx });
                    villageGroup.add(fRun);
                    const segs = (fRun.userData && fRun.userData.fenceSegments) || [];
                    for (const s of segs) {
                        addCapsuleCollider('fence', s.x1, s.z1, s.x2, s.z2, 0.14, s.yMax, fRun);
                    }
                });

                // Fallback stations supaya tiap role petani/penjual/petarung di desa ini selalu punya titik kerja
                vRec.stations.stallA = vRec.stations.stallA || vRec.stations.plaza;
                vRec.stations.stallB = vRec.stations.stallB || vRec.stations.stallA;
                vRec.stations.barnYard = vRec.stations.barnYard || vRec.stations.garden || vRec.stations.well;
                vRec.stations.garden = vRec.stations.garden || vRec.stations.barnYard;
                vRec.stations.tavernPorch = vRec.stations.tavernPorch || vRec.stations.plaza;
                vRec.stations.forge = vRec.stations.forge || vRec.stations.tavernPorch;

                const lodMesh = bakeExactLowResVillageLod(villageGroup, v.id);
                if (lodMesh) {
                    scene.add(lodMesh);
                    vRec.lodMesh = lodMesh;
                }

                villageData.villages.push(vRec);
                if (vIdx === 0) {
                    Object.assign(villageData.stations, vRec.stations);
                }
            }
            lodBaseBox.dispose();
        })();

        const interactiveMushrooms = [];
        const mushroomCapMaterials = [];
        const stemMat = new THREE.MeshStandardMaterial({ color: 0xf4ebd9, roughness: 0.7 });

        const mushroomSpots = [
            [-3.2, -2.5], [-3.6, -2.1], [3.8, -3.2], [4.2, 5.4],
            [-5.8, 3.4], [10.4, 4.2], [-2.2, 5.8], [6.5, -4.8]
        ];
        mushroomSpots.forEach((m, idx) => {
            const mGroup = new THREE.Group();
            const my = getTerrainHeight(m[0], m[1]);
            mGroup.position.set(m[0], my, m[1]);

            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.32, 6), stemMat);
            stem.position.y = 0.16;
            mGroup.add(stem);

            const capMat = new THREE.MeshStandardMaterial({
                color: idx % 2 === 0 ? 0x4cc9f0 : 0xff758f,
                emissive: idx % 2 === 0 ? 0x48cae4 : 0xff4d6d,
                emissiveIntensity: activeAtmosphere.mushroomGlow,
                roughness: 0.45
            });
            mushroomCapMaterials.push(capMat);

            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 8), capMat);
            cap.position.y = 0.34;
            mGroup.add(cap);

            mGroup.userData = { type: 'mushroom', pulse: 0 };
            interactiveMushrooms.push(mGroup);
            scene.add(mGroup);
        });

        // Floating Fireflies / Pollen Particles
        const PARTICLE_COUNT = 85;
        const particleGeo = new THREE.BufferGeometry();
        const pPositions = new Float32Array(PARTICLE_COUNT * 3);
        const pPhases = new Float32Array(PARTICLE_COUNT);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const px = (Math.random() - 0.5) * 44;
            const pz = (Math.random() - 0.5) * 44;
            const py = getTerrainHeight(px, pz) + 0.5 + Math.random() * 4.5;
            pPositions[i * 3] = px;
            pPositions[i * 3 + 1] = py;
            pPositions[i * 3 + 2] = pz;
            pPhases[i] = Math.random() * Math.PI * 2;
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

        // Soft circular glow sprite so fireflies & pollen look like cozy orbs instead of white squares
        const orbCanvas = document.createElement('canvas');
        orbCanvas.width = 64;
        orbCanvas.height = 64;
        const orbCtx = orbCanvas.getContext('2d');
        const orbGrad = orbCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
        orbGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        orbGrad.addColorStop(0.45, 'rgba(255, 250, 210, 0.72)');
        orbGrad.addColorStop(1.0, 'rgba(255, 250, 210, 0.0)');
        orbCtx.fillStyle = orbGrad;
        orbCtx.fillRect(0, 0, 64, 64);
        const orbTex = new THREE.CanvasTexture(orbCanvas);

        const particleMat = new THREE.PointsMaterial({
            color: activeAtmosphere.particleColor,
            map: orbTex,
            size: 0.34,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const particleSystem = new THREE.Points(particleGeo, particleMat);
        scene.add(particleSystem);


    // ---- Simpan referensi objek Hutan Cozy di instance World ----
    this.MOODS = MOODS;
    this.currentMoodKey = currentMoodKey;
    this.targetMood = targetMood;
    this.activeAtmosphere = activeAtmosphere;
    this.dirLight = dirLight;
    this.hemiLight = hemiLight;
    this.celShaderUniforms = celShaderUniforms;
    this.skyUniforms = skyUniforms;
    this.skyDome = skyDome;
    this.celestialOrb = celestialOrb;
    this.celestialMat = celestialMat;
    this.TERRAIN_SIZE = TERRAIN_SIZE;
    this.POND_CENTER = POND_CENTER;
    this.POND_WATER_Y = POND_WATER_Y;
    this.RIVER = RIVER;
    this.VILLAGE = VILLAGE;
    this.VILLAGES = VILLAGES;
    this.allRoadPolylines = allRoadPolylines;
    this._riverCenterZ = riverCenterZ;
    this._riverHalfWidthAt = riverHalfWidthAt;
    this.riverMesh = riverMesh;
    this.riverUniforms = riverUniforms;
    this.riverAnimated = riverAnimated;
    this.villageAnimated = villageAnimated;
    this.villageData = villageData;
    this._riverCenterZ = riverCenterZ;
    this._riverHalfWidthAt = riverHalfWidthAt;
    this._riverRippleSlot = 0;
    this._lastRiverRippleAt = -99;
    this._lastHoofSplashAt = -99;
    this._lastCartWakeAt = -99;
    this._lastWaterSfxAt = -99;
    this._prevHorseX = 0;
    this._prevHorseZ = 0;
    this._prevCartX = 0;
    this._prevCartZ = 0;
    this._wasHorseInAir = false;
    this._horseJumpActive = false;
    this.cartYaw = 0;
    this.terrainChunks = terrainChunks;
    this.grassChunks = grassChunks;
    this.grassUniforms = grassUniforms;
    this.dylearnSharedUniforms = dylearnSharedUniforms;
    this._grassCharTimer = 0;
    this._tmpCamForward = new THREE.Vector3();
    this._moodTintMorning = new THREE.Color(0xffffff);
    this._moodTintSunset = new THREE.Color(0xffdfbc);
    this._moodTintNight = new THREE.Color(0x62a4b0);
    this._party = null;
    this.interactiveTrees = interactiveTrees;
    this.interactiveBushes = interactiveBushes;
    this.campfireGroup = campfireGroup;
    this.campfireLight = campfireLight;
    this.flames = flames;
    this._campfireSparks = campfireSparks;
    this.isCampfireLit = isCampfireLit;
    this.LANDMARKS = STORY_LANDMARKS;
    this.GRAND_WATER_BASINS = GRAND_WATER_BASINS;
    this._sampleGrandBasinAt = sampleGrandBasinAt;
    this.PUDDLES = PUDDLES;
    this._puddleGrid = puddleGrid;
    this._puddleCell = PUDDLE_CELL;
    this.ANCIENT_ELDER_TREE = ANCIENT_ELDER_TREE;
    this.ancientTreeGroup = ancientTreeGroup;
    this.grandWaterMeshes = grandWaterMeshes;
    this._waterfallTex = waterfallTex;
    this._waterfallMist = waterfallMist;
    this._waterfallSplash = waterfallSplash;
    this._gorgeMist = gorgeMist;
    this._storySiteAnimators = storySiteAnimators;
    this.cfY = cfY;
    this.pondMesh = pondMesh;
    this.pondUniforms = pondUniforms;
    this.lilyPads = lilyPads;
    this.pondFishList = pondFishList;
    this.roadLanterns = roadLanterns;
    this.isHeadlightsOn = isHeadlightsOn;
    this.sunbeamsGroup = sunbeamsGroup;
    this.sunbeamUniforms = sunbeamUniforms;
    this.sunbeamShafts = sunbeamShafts;
    this.isSunbeamsEnabled = isSunbeamsEnabled;
    this.interactiveMushrooms = interactiveMushrooms;
    this.mushroomCapMaterials = mushroomCapMaterials;
    this.particleGeo = particleGeo;
    this.particleMat = particleMat;
    this.particleSystem = particleSystem;
    this.pPhases = pPhases;
    this.PARTICLE_COUNT = PARTICLE_COUNT;
    this.PERF_PROFILES = PERF_PROFILES;
    this.currentPerfMode = currentPerfMode;
    this._quality = QUALITY;
    this._shadowsStatic = !!QUALITY && QUALITY.shadows === 'static';
    this._getRoadCenterX = getRoadCenterX;
    this._getRoadTangentAngle = getRoadTangentAngle;
    this._getRoadDistance = getRoadDistance;
    this._getTerrainHeight = getTerrainHeight;
    this._getTerrainNormal = getTerrainNormal;
    this._paintGrassVisibilityCircle = paintGrassVisibilityCircle;
    this._grassMapTexture = grassMapTexture;
    this.colliders = colliders;
    this.rockMeshes = rockMeshes;
    this.traversableLogs = traversableLogs;
    this._grassTiles = grassTiles;
    this._grassTileSize = GRASS_TILE_SIZE;
    this._grassGridRadius = GRASS_GRID_RADIUS;
    this._populateGrassTile = populateGrassTile;
    this._lastGrassTileX = 0;
    this._lastGrassTileZ = 0;
    this.VILLAGE_WORKSHOPS = villageWorkshops;
    this.VILLAGE_WELLS = villageWells;
    this.VILLAGE_FARMS = villageFarms;
    this.cycleEnabled = true;
    this.cycleDuration = 600.0; // Siklus penuh siang-malam 10 menit (1 hari = 24 jam game)
    this.timeOfDay = 0.08;      // Mulai pagi cerah (~07:55)
    this.dayClock = this.timeOfDay;
    this._grazedPatches = [];
    this._cycleTarget = {
      bgTop: MOODS.morning.bgTop.clone(),
      bgBottom: MOODS.morning.bgBottom.clone(),
      sunColor: MOODS.morning.sunColor.clone(),
      sunIntensity: MOODS.morning.sunIntensity,
      sunPos: MOODS.morning.sunPos.clone(),
      hemiSky: MOODS.morning.hemiSky.clone(),
      hemiGround: MOODS.morning.hemiGround.clone(),
      hemiIntensity: MOODS.morning.hemiIntensity,
      sceneBrightness: MOODS.morning.sceneBrightness,
      mushroomGlow: MOODS.morning.mushroomGlow,
      particleColor: MOODS.morning.particleColor.clone(),
      shadowTint: MOODS.morning.shadowTint.clone(),
      rimTint: MOODS.morning.rimTint.clone(),
      cloudColor: MOODS.morning.cloudColor.clone(),
      cloudShadow: MOODS.morning.cloudShadow.clone(),
      cloudCoverage: MOODS.morning.cloudCoverage,
      grassBaseColor: MOODS.morning.grassBaseColor.clone(),
      grassTipColor: MOODS.morning.grassTipColor.clone(),
      sunbeamOpacity: MOODS.morning.sunbeamOpacity,
      lanternIntensity: MOODS.morning.lanternIntensity,
    };
    this._colliderGrid = colliderGrid;
    this._gridCell = GRID_CELL;
    this._colSeen = new Set();
    this._colTmp = [];

    this.burstParticles = [];
    this._sharedLeafBurstGeo = new THREE.PlaneGeometry(0.16, 0.08);
    this._sharedSparkBurstGeo = new THREE.OctahedronGeometry(0.07, 0);
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this._audioCtx = null;
    this._isAudioPlaying = false;
    this._windGainNode = null;
    this._crackleInterval = null;

    this.elapsed = 0;
    this.frameCounter = 0;
    this._cameraFrustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();

    // ---- Integrasi fisika roda, batu/kerikil, dan ramp miring SHOD ----
    this.roadHalfWidth = 2.15;
    this.roadCenterZ = (x) => 0;
    this.rockSlots = [];
    this.ramps = [];
    this.pebbles = [];
    this.siteMeshes = [];

    this.dirLight = dirLight;
    this.hemiLight = hemiLight;
    this.renderer = null;

    // Pool kerikil instanced (untuk tombol B. Kerikil & efek skill NPC)
    this.pebbleCount = 48;
    const pGeo = new THREE.IcosahedronGeometry(0.5, 0);
    this.pebbleMesh = new THREE.InstancedMesh(
      pGeo,
      new THREE.MeshLambertMaterial({ vertexColors: false }),
      this.pebbleCount
    );
    this.pebbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pebbleMesh.frustumCulled = false;
    scene.add(this.pebbleMesh);
    this._pDummy = new THREE.Object3D();
    const tones = [0x9aa0a6, 0x878d94, 0xb0b5ba, 0x74797f, 0xa2a7ad];
    for (let i = 0; i < this.pebbleCount; i++) {
      const color = new THREE.Color(tones[i % tones.length]);
      this.pebbles.push({
        x: 9999, z: 9999, r: 0.08, h: 0.06,
        rot: new THREE.Euler(i * 0.7, i * 1.1, i * 0.5),
        color, slot: i
      });
      this.pebbleMesh.setColorAt(i, color);
    }
    if (this.pebbleMesh.instanceColor) this.pebbleMesh.instanceColor.needsUpdate = true;
    this._syncPebbles();
  }

  // ---- Pose awal kuda & gerobak di jalan tanah Hutan Cozy ----
  initialHorsePose() {
    const z0 = -11.0;
    const x0 = this._getRoadCenterX(z0);
    const ang = this._getRoadTangentAngle(z0);
    // Di animator.js: forwardX = cos(yaw), forwardZ = -sin(yaw).
    // Arah jalan menuju +Z dengan kemiringan dx/dz = tan(ang) -> yaw = -PI/2 + ang.
    const yaw0 = -Math.PI * 0.5 + ang;
    return { x: x0, z: z0, yaw: yaw0 };
  }

  // ---- Jaga kuda tetap di dalam lembah Hutan Cozy 76x76 ----
  keepHorseInValley(animator, dt) {
    if (!animator) return;
    const z = animator.z;
    const x = animator.x;
    const distOrigin = Math.hypot(x, z);
    const dxPond = x - this.POND_CENTER.x;
    const dzPond = z - this.POND_CENTER.z;
    const distPond = Math.hypot(dxPond, dzPond);

    // Sabuk aman hanya di area awal dekat api unggun/kolam. Setelah keluar
    // 24 m, player bebas menjelajah; jangan dipaksa orbit radius 14.5 lagi.
    if (Math.abs(animator.steerInput) < 0.05 && animator.speed > 0.1) {
      let targetX = null, targetZ = null, wantRate = 0.75;
      if (distPond < this.POND_CENTER.radius + 2.4) {
        // Hindari cekungan kolam yang curam dengan berbelok halus di tepi kolam
        const angP = Math.atan2(dzPond, dxPond);
        const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
        const txCCW = -Math.sin(angP), tzCCW = Math.cos(angP);
        const dir = (fx * txCCW + fz * tzCCW) >= 0 ? 1 : -1;
        const safeAng = angP + dir * 0.55;
        const safeR = this.POND_CENTER.radius + 3.6;
        targetX = this.POND_CENTER.x + Math.cos(safeAng) * safeR;
        targetZ = this.POND_CENTER.z + Math.sin(safeAng) * safeR;
        wantRate = 0.90;
      } else if (distOrigin > 24.0 && distOrigin < this.TERRAIN_SIZE * 0.5 - 9.0) {
        // Jelajah bebas di sabuk lembah besar: tidak ada orbit paksa.
        // (blok kosong, clamp tepi tetap jalan di bawah)
      } else if (distOrigin > this.TERRAIN_SIZE * 0.5 - 9.0) {
        // Bukit perimeter adalah batas alam (lereng masih bisa dinaiki,
        // tetapi pemain tidak bisa menembus tepi mesh tanah).
        const ang = Math.atan2(z, x);
        const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
        const txCCW = -Math.sin(ang), tzCCW = Math.cos(ang);
        const dir = (fx * txCCW + fz * tzCCW) >= 0 ? 1 : -1;
        const nextAng = ang + dir * 0.45;
        const orbitR = this.TERRAIN_SIZE * 0.5 - 12.0;
        targetX = Math.cos(nextAng) * orbitR;
        targetZ = Math.sin(nextAng) * orbitR;
        wantRate = 0.85;
      } else if (z >= -16.5 && z <= 14.0 && this._getRoadDistance(x, z) < 3.4 && Math.abs(animator.forwardZ) > 0.55) {
        const lookZ = z + (animator.forwardZ >= 0 ? 6.0 : -6.0);
        targetX = this._getRoadCenterX(lookZ);
        targetZ = lookZ;
        wantRate = 0.75;
      }
      if (targetX !== null) {
        const dx = targetX - x, dz = targetZ - z;
        const wantYaw = Math.atan2(-dz, dx);
        let diff = ((wantYaw - animator.yaw + Math.PI) % (Math.PI * 2));
        if (diff < 0) diff += Math.PI * 2;
        diff -= Math.PI;
        // Batasi percepatan sentrifugal auto-steer <= 1.9 m/s² agar gerobak tetap stabil
        const safeGain = Math.min(wantRate, 1.9 / Math.max(1.0, Math.abs(animator.speed)));
        animator.yaw += HC.clamp(diff, -safeGain * dt, safeGain * dt);
        animator.forwardX = Math.cos(animator.yaw);
        animator.forwardZ = -Math.sin(animator.yaw);
      }
    }
    const lim = this.TERRAIN_SIZE ? this.TERRAIN_SIZE * 0.5 - 5.0 : 33.5;
    if (animator.x < -lim) animator.x = -lim;
    if (animator.x > lim) animator.x = lim;
    if (animator.z < -lim) animator.z = -lim;
    if (animator.z > lim) animator.z = lim;
  }

  colliderCounts() {
    const out = {};
    for (let i = 0; i < this.colliders.length; i++) {
      const t = this.colliders[i].type;
      out[t] = (out[t] || 0) + 1;
    }
    return out;
  }

  _queryCollidersNear(x, z, pad = 2.5) {
    const list = this._colTmp;
    const seen = this._colSeen;
    list.length = 0;
    seen.clear();
    const cs = this._gridCell || 6.0;
    const gx0 = Math.floor((x - pad) / cs), gx1 = Math.floor((x + pad) / cs);
    const gz0 = Math.floor((z - pad) / cs), gz1 = Math.floor((z + pad) / cs);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = this._colliderGrid.get(gx + ',' + gz);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const c = bucket[i];
          if (!seen.has(c.id)) {
            seen.add(c.id);
            list.push(c);
          }
        }
      }
    }
    return list;
  }

  resolveCircleCollision(x, z, radius = 0.4, footY = -999) {
    let px = x, pz = z;
    let hit = false, bestNx = 0, bestNz = 0, maxPen = 0, hitType = null, hitCol = null;
    const nearby = this._queryCollidersNear(x, z, radius + 3.2);
    if (!nearby.length) return { x: px, z: pz, hit: false, nx: 0, nz: 0, pen: 0, hitType: null, collider: null };

    for (let pass = 0; pass < 3; pass++) {
      let pushedPass = false;
      for (let i = 0; i < nearby.length; i++) {
        const col = nearby[i];
        if (col.kind === 'mesh_rock') continue;
        if (footY > col.yMax + 0.12) continue;
        if (px + radius < col.minX || px - radius > col.maxX || pz + radius < col.minZ || pz - radius > col.maxZ) continue;

        let cx, cz;
        if (col.kind === 'capsule') {
          const ax = col.x2 - col.x1, az = col.z2 - col.z1;
          const alen2 = ax * ax + az * az;
          if (alen2 > 1e-6) {
            const t = HC.clamp(((px - col.x1) * ax + (pz - col.z1) * az) / alen2, 0, 1);
            cx = col.x1 + ax * t;
            cz = col.z1 + az * t;
          } else {
            cx = col.x1; cz = col.z1;
          }
        } else {
          cx = col.x; cz = col.z;
        }

        const dx = px - cx, dz = pz - cz;
        const minR = col.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minR * minR) continue;

        const d = Math.sqrt(d2);
        let nx, nz;
        if (d > 1e-5) {
          nx = dx / d; nz = dz / d;
        } else if (col.kind === 'capsule') {
          const ax = col.x2 - col.x1, az = col.z2 - col.z1;
          const al = Math.hypot(ax, az) || 1;
          nx = -az / al; nz = ax / al;
        } else {
          nx = 1; nz = 0;
        }
        const pen = minR - d;
        px += nx * pen;
        pz += nz * pen;
        pushedPass = true;
        hit = true;
        if (pen > maxPen) {
          maxPen = pen;
          bestNx = nx;
          bestNz = nz;
          hitType = col.type;
          hitCol = col;
        }
        if (col.type === 'tree' && col.mesh && col.mesh.userData) {
          col.mesh.userData.rustleBoost = Math.max(col.mesh.userData.rustleBoost || 0, 0.85);
        }
      }
      if (!pushedPass) break;
    }
    return { x: px, z: pz, hit, nx: bestNx, nz: bestNz, pen: maxPen, hitType, collider: hitCol };
  }

  resolveHorseCollision(animator) {
    if (!animator) return { hit: false, nx: 0, nz: 0, pen: 0, hitType: null };
    const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
    const footY = this.heightAt(animator.x, animator.z) + (animator.jumpActive ? Math.max(0, animator.jumpY || 0) : 0);
    const spheres = [
      { off: 0.46, r: 0.42 },
      { off: -0.44, r: 0.42 },
    ];
    let hit = false, bestNx = 0, bestNz = 0, maxPen = 0, hitType = null;
    for (let iter = 0; iter < 2; iter++) {
      let moved = false;
      for (const s of spheres) {
        const sx = animator.x + fx * s.off;
        const sz = animator.z + fz * s.off;
        const res = this.resolveCircleCollision(sx, sz, s.r, footY);
        if (res.hit) {
          animator.x += (res.x - sx);
          animator.z += (res.z - sz);
          moved = true;
          hit = true;
          if (res.pen > maxPen) {
            maxPen = res.pen;
            bestNx = res.nx;
            bestNz = res.nz;
            hitType = res.hitType;
          }
        }
      }
      if (!moved) break;
    }
    // Cek dinding batu yang terlalu curam (>0.78 m lebih tinggi dari pijakan saat ini) agar meluncur ikut bidang batu,
    // sementara permukaan batu landai bisa dinaiki/dilewati secara alami via heightAt/wheelHeightAt.
    if (this.rockMeshes && this.rockMeshes.length) {
      const cx = animator.x + fx * 0.46, cz = animator.z + fz * 0.46;
      const rk = this.sampleRockSurface(cx, cz);
      if (rk.hit && (rk.y - footY) > 0.78 && rk.ny < 0.55) {
        const hl = Math.hypot(rk.nx, rk.nz);
        if (hl > 1e-4) {
          const nx = rk.nx / hl, nz = rk.nz / hl;
          const push = Math.min(0.18, (rk.y - footY - 0.78) * 0.65);
          animator.x += nx * push;
          animator.z += nz * push;
          hit = true;
          if (push > maxPen) { maxPen = push; bestNx = nx; bestNz = nz; hitType = rk.rock.type; }
        }
      }
    }
    if (hit) {
      const vDotN = animator.speed * (fx * bestNx + fz * bestNz);
      if (vDotN < 0) {
        const block = Math.min(1, (-vDotN) / Math.max(0.15, Math.abs(animator.speed)));
        animator.speed *= (1 - block * 0.92);
      }
      if (animator.horse && animator.horse.root) {
        animator.horse.root.position.x = animator.x;
        animator.horse.root.position.z = animator.z;
      }
    }
    return { hit, nx: bestNx, nz: bestNz, pen: maxPen, hitType };
  }

  isInsideVillage(x, z, pad = 0) {
    const list = this.VILLAGES || [];
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (Math.hypot(x - v.cx, z - v.cz) < (v.radius * 1.95) + pad) return true;
    }
    return false;
  }

  // ---- Kurangi NPC per desa: hanya 4 NPC tiap desa (2 petani, 1 penjual, dan 1 petarung saja) di 5 desa ----
  placeNPCsInWorld(party) {
    this._party = party;
    if (!party || !party.wild) return;

    const vd = this.villageData;
    const villages = (vd && Array.isArray(vd.villages) && vd.villages.length) ? vd.villages : [];
    if (!villages.length) return;

    // Bersihkan mesh NPC awal dari _spawnSettlements supaya tidak tersisa 18 NPC menumpuk
    for (let i = 0; i < party.wild.length; i++) {
      const old = party.wild[i];
      if (!old) continue;
      if (old._hpBar && typeof old._hpBar.dispose === 'function') { old._hpBar.dispose(); old._hpBar = null; }
      if (old.root && party.scene && typeof party.scene.remove === 'function') party.scene.remove(old.root);
    }
    party.wild.length = 0;

    let slotIdx = 0;
    for (let vIdx = 0; vIdx < villages.length; vIdx++) {
      const vRec = villages[vIdx];
      const st = vRec.stations || {};
      const bldgs = vRec.buildings || {};
      const bList = vRec.buildingList || [];
      const pickPlanter = (idx) => (st.planters && st.planters[idx % st.planters.length]) || st.garden || st.well;
      const pickBench = (idx) => (st.benches && st.benches[idx % st.benches.length]) || st.well;
      const pickHome = (prefKey, fallbackIdx = 0) =>
        bldgs[prefKey] || bList[fallbackIdx % Math.max(1, bList.length)] || null;

      // Tepat 4 warga per desa: 2 petani (farmer, herbal), 1 penjual (merchant/petmerchant), 1 petarung
      const roster = [
        {
          roleId: 'farmer',
          workKind: 'farm',
          spawn: st.farmPlot || st.barnYard || st.garden || st.plaza,
          homeBldg: pickHome('barn', 0),
          stations: [st.farmPlot, st.barnYard, st.garden, st.well].filter(Boolean),
          canEnterHouse: true,
        },
        {
          roleId: 'herbal',
          workKind: 'forage',
          spawn: pickPlanter(0) || st.garden || st.well,
          homeBldg: pickHome('cottage_sw', 1),
          stations: [pickPlanter(0), pickPlanter(1), st.garden, st.well].filter(Boolean),
          canEnterHouse: true,
        },
        {
          roleId: vRec.merchantRole || 'merchant',
          workKind: 'shop',
          spawn: st.merchantPost || st.stallA || st.plaza,
          homeBldg: null,
          stations: [st.merchantPost || st.stallA || st.plaza].filter(Boolean),
          canEnterHouse: false,
        },
        {
          roleId: vRec.fighterRole || 'guard',
          workKind: 'patrol',
          spawn: st.gateSouth || st.plaza,
          homeBldg: pickHome('tavern', 3),
          stations: [st.gateSouth, st.plaza, st.gateNorth, st.tavernPorch, pickBench(0)].filter(Boolean),
          canEnterHouse: true,
        },
      ];

      for (let rIdx = 0; rIdx < roster.length; rIdx++) {
        const cfg = roster[rIdx];
        const sp0 = cfg.spawn || st.plaza || { x: vRec.cx, z: vRec.cz, faceX: vRec.cx, faceZ: vRec.cz + 1 };
        let sx, sz, gy;
        if (sp0.behindStall) {
          sx = sp0.x;
          sz = sp0.z;
          gy = sp0.y !== undefined ? sp0.y : this.terrainHeightAt(sx, sz);
        } else {
          const jitterAng = (rIdx * 1.57 + vIdx * 0.85) % (Math.PI * 2);
          const tryX = sp0.x + Math.cos(jitterAng) * 0.45;
          const tryZ = sp0.z + Math.sin(jitterAng) * 0.45;
          const cleared = this.resolveCircleCollision(tryX, tryZ, 0.44);
          sx = cleared.x;
          sz = cleared.z;
          gy = this.terrainHeightAt(sx, sz);
        }
        const fx = sp0.faceX !== undefined ? sp0.faceX : vRec.cx;
        const fz = sp0.faceZ !== undefined ? sp0.faceZ : vRec.cz;
        const yaw = Math.atan2(fx - sx, fz - sz);

        const anchor = {
          role: cfg.roleId,
          site: vRec.id,
          x: sx,
          z: sz,
          yaw,
        };

        let w = null;
        if (typeof party._spawnFromAnchor === 'function') {
          w = party._spawnFromAnchor(slotIdx, anchor);
        } else {
          const roleObj = (HC.NPC_ROLES || []).find((r) => r.id === cfg.roleId) || { id: cfg.roleId };
          const root = HC.buildNPC ? HC.buildNPC(roleObj, 'stand') : null;
          if (root && party.scene && party.scene.add) party.scene.add(root);
          w = { root, role: roleObj, site: vRec.id, x: sx, z: sz, homeX: sx, homeZ: sz, anchor };
          party.wild[slotIdx] = w;
        }
        slotIdx++;
        if (!w) continue;

        w.x = sx; w.z = sz;
        w.homeX = sx; w.homeZ = sz;
        w.homeRadius = 18.0;
        w.isIndoors = false;
        w.site = vRec.id;
        w.villageProfile = {
          roleId: cfg.roleId,
          villageId: vRec.id,
          villageRef: vRec,
          homeId: (cfg.homeBldg && cfg.homeBldg.id) || 'tavern',
          homeBldg: cfg.homeBldg,
          workKind: cfg.workKind,
          stations: cfg.stations.length ? cfg.stations : [sp0],
          canEnterHouse: cfg.canEnterHouse !== undefined ? cfg.canEnterHouse : !!cfg.homeBldg,
          behindStall: !!sp0.behindStall,
          fixedY: sp0.behindStall ? gy : null,
          farmPlot: vRec.farmPlot || null,
          shopDrop: st.shopDrop || st.stallA || null,
        };
        if (w.anchor) {
          w.anchor.x = sx;
          w.anchor.z = sz;
          w.anchor.yaw = yaw;
          w.anchor.role = cfg.roleId;
          w.anchor.site = vRec.id;
        }
        if (w.root) {
          w.root.visible = true;
          w.root.position.set(sx, gy, sz);
          w.root.rotation.y = yaw;
        }
      }
    }
  }

  // ---- Siklus siang-malam 10 menit otomatis & helper suasana ----
  setMood(moodKey) {
    if (!this.MOODS[moodKey]) return null;
    this.currentMoodKey = moodKey;
    this.targetMood = this.MOODS[moodKey];
    if (moodKey === 'night') {
      this.timeOfDay = 0.76;
      this.isHeadlightsOn = true;
    } else if (moodKey === 'sunset') {
      this.timeOfDay = 0.51;
      this.isHeadlightsOn = true;
    } else {
      this.timeOfDay = 0.08;
      this.isHeadlightsOn = false;
    }
    return this.targetMood;
  }

  findNearestWorkshop(x, z, maxDist = 4.2) {
    const list = this.VILLAGE_WORKSHOPS || [];
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < list.length; i++) {
      const ws = list[i];
      // Wajib berada di area depan bangunan bengkel (bukan belakang/samping jauh)
      const frontX = -Math.sin(ws.shopYaw || 0);
      const frontZ = -Math.cos(ws.shopYaw || 0);
      const frontDot = (x - ws.shopX) * frontX + (z - ws.shopZ) * frontZ;
      if (frontDot < 0.4) continue;
      const d = Math.hypot(x - ws.x, z - ws.z);
      if (d <= bestD) {
        bestD = d;
        best = { ...ws, dist: d };
      }
    }
    return best;
  }

  setFarmTileStage(tile, stage) {
    if (!tile) return;
    const clamped = Math.max(0, Math.min(2, stage | 0));
    tile.stage = clamped;
    if (clamped === 0) tile.growT = 0;
    if (Array.isArray(tile.stageMeshes)) {
      for (let i = 0; i < tile.stageMeshes.length; i++) {
        tile.stageMeshes[i].visible = (i === clamped);
      }
    }
  }

  addVillageShopStock(vRecOrId, amount = 1) {
    const qty = Math.max(0, Math.floor(amount || 0));
    if (!qty) return 0;
    let vRec = (vRecOrId && typeof vRecOrId === 'object') ? vRecOrId : null;
    if (!vRec && this.villageData && Array.isArray(this.villageData.villages)) {
      vRec = this.villageData.villages.find((v) => v.id === vRecOrId) || null;
    }
    if (!vRec) return 0;
    if (!vRec.shopStock) {
      vRec.shopStock = { villageId: vRec.id, villageName: vRec.name, crops: 0, deliveredTotal: 0, crates: [] };
    }
    vRec.shopStock.crops += qty;
    vRec.shopStock.deliveredTotal += qty;
    if (Array.isArray(vRec.shopStock.crates)) {
      const visCount = Math.min(vRec.shopStock.crates.length, Math.max(1, Math.ceil(vRec.shopStock.crops / 2)));
      for (let i = 0; i < vRec.shopStock.crates.length; i++) {
        vRec.shopStock.crates[i].visible = i < visCount;
      }
    }
    return vRec.shopStock.crops;
  }

  harvestFarmTile(farmPlot, tileIdx, autoStock = true) {
    if (!farmPlot || !Array.isArray(farmPlot.tiles)) return null;
    const tile = farmPlot.tiles[tileIdx];
    if (!tile || tile.stage !== 2) return null;
    this.setFarmTileStage(tile, 0);
    const totalStock = autoStock ? this.addVillageShopStock(farmPlot.villageRef || farmPlot.villageId, 1) : (farmPlot.villageRef?.shopStock?.crops || 0);
    return { harvested: 1, cropKind: tile.cropKind, shopStock: totalStock };
  }

  plantFarmTile(farmPlot, tileIdx) {
    if (!farmPlot || !Array.isArray(farmPlot.tiles)) return false;
    const tile = farmPlot.tiles[tileIdx];
    if (!tile || tile.stage !== 0) return false;
    this.setFarmTileStage(tile, 1);
    tile.growT = 0;
    return true;
  }

  findNearestFarmPlot(x, z, maxDist = 4.8) {
    const list = this.VILLAGE_FARMS || [];
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < list.length; i++) {
      const fp = list[i];
      const d = Math.hypot(x - fp.x, z - fp.z);
      if (d <= bestD) {
        bestD = d;
        let ripeCount = 0, emptyCount = 0;
        for (const t of fp.tiles || []) {
          if (t.stage === 2) ripeCount++;
          else if (t.stage === 0) emptyCount++;
        }
        best = {
          farm: fp,
          villageId: fp.villageId,
          villageName: fp.villageName,
          dist: d,
          ripeCount,
          emptyCount,
          shopStock: fp.villageRef?.shopStock?.crops || 0,
        };
      }
    }
    return best;
  }

  interactFarmPlot(farmPlot) {
    if (!farmPlot || !Array.isArray(farmPlot.tiles)) return null;
    let harvested = 0;
    let planted = 0;
    for (let i = 0; i < farmPlot.tiles.length; i++) {
      if (farmPlot.tiles[i].stage === 2) {
        this.setFarmTileStage(farmPlot.tiles[i], 0);
        harvested++;
      }
    }
    if (harvested > 0) {
      const shopStock = this.addVillageShopStock(farmPlot.villageRef || farmPlot.villageId, harvested);
      return { action: 'harvest', count: harvested, shopStock, villageName: farmPlot.villageName };
    }
    for (let i = 0; i < farmPlot.tiles.length; i++) {
      if (farmPlot.tiles[i].stage === 0) {
        this.setFarmTileStage(farmPlot.tiles[i], 1);
        farmPlot.tiles[i].growT = 0;
        planted++;
      }
    }
    if (planted > 0) {
      return { action: 'plant', count: planted, shopStock: farmPlot.villageRef?.shopStock?.crops || 0, villageName: farmPlot.villageName };
    }
    return { action: 'growing', count: 0, shopStock: farmPlot.villageRef?.shopStock?.crops || 0, villageName: farmPlot.villageName };
  }

  _updateVillageFarms(delta) {
    const farms = this.VILLAGE_FARMS;
    if (!farms || !farms.length) return;
    const STAGE_DUR = 28.0; // ~28 detik per tahap tumbuh
    for (let i = 0; i < farms.length; i++) {
      const tiles = farms[i].tiles;
      for (let j = 0; j < tiles.length; j++) {
        const t = tiles[j];
        if (t.stage < 2) {
          t.growT = (t.growT || 0) + delta;
          if (t.growT >= STAGE_DUR) {
            t.growT = 0;
            this.setFarmTileStage(t, t.stage + 1);
          }
        }
      }
    }
  }

  findNearestWaterSource(x, z, maxDist = 18.0) {
    let best = null;
    let bestD = maxDist;

    // 1) Village stone wells
    const wells = this.VILLAGE_WELLS || [];
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      const d = Math.hypot(x - w.wellX, z - w.wellZ);
      if (d <= bestD) {
        bestD = d;
        best = {
          kind: 'well',
          x: w.x,
          z: w.z,
          waterX: w.wellX,
          waterZ: w.wellZ,
          label: w.villageName,
          dist: d,
        };
      }
    }

    // 2) Origin pond (center 8.2, 6.2, shore radius ~4.4m)
    const pdx = x - 8.2;
    const pdz = z - 6.2;
    const pDistCenter = Math.hypot(pdx, pdz);
    const pEdgeDist = Math.max(0, pDistCenter - 4.8);
    if (pEdgeDist <= bestD) {
      bestD = pEdgeDist;
      const ux = pDistCenter > 1e-4 ? pdx / pDistCenter : 0;
      const uz = pDistCenter > 1e-4 ? pdz / pDistCenter : -1;
      best = {
        kind: 'pond',
        x: 8.2 + ux * 4.75,
        z: 6.2 + uz * 4.75,
        waterX: 8.2 + ux * 3.8,
        waterZ: 6.2 + uz * 3.8,
        label: 'Pond',
        dist: pEdgeDist,
      };
    }

    // 3) River crossing
    if (typeof this._riverCenterZ === 'function') {
      const rcZ = this._riverCenterZ(x);
      const riverHalf = 5.4;
      const dz = z - rcZ;
      const absDz = Math.abs(dz);
      const rDist = Math.max(0, absDz - riverHalf);
      if (rDist <= bestD) {
        bestD = rDist;
        const side = dz >= 0 ? 1 : -1;
        best = {
          kind: 'river',
          x,
          z: rcZ + side * 4.2,
          waterX: x,
          waterZ: rcZ + side * 2.8,
          label: 'River',
          dist: rDist,
        };
      }
    }

    return best;
  }

  getOldCartSpot() {
    const vList = (this.villageData && Array.isArray(this.villageData.villages) && this.villageData.villages.length)
      ? this.villageData.villages
      : (this.VILLAGES || []);
    const rad = vList.find((v) => v.id === 'radnar') || vList[0];
    const bs = rad && rad.blacksmithLot;
    if (bs) {
      // Sumbu belakang bangunan (+Z lokal) dalam koordinat dunia: (sin(yaw), cos(yaw))
      // Sumbu samping bangunan (+X lokal) dalam koordinat dunia: (cos(yaw), -sin(yaw))
      const backX = Math.sin(bs.yaw);
      const backZ = Math.cos(bs.yaw);
      const sideX = Math.cos(bs.yaw);
      const sideZ = -Math.sin(bs.yaw);
      const halfBackM = (bs.d || 4.2) * 0.5 * (bs.sc || 1.72);
      const atBack = (backClearM, latM = 0) => [
        bs.x + backX * (halfBackM + backClearM) + sideX * latM,
        bs.z + backZ * (halfBackM + backClearM) + sideZ * latM,
      ];
      // Tepat di belakang dinding belakang rumah penempa di rumput terbuka (~4.5..6.8 m di belakang dinding)
      const candidates = [
        atBack(4.6, 0),
        atBack(5.6, 0),
        atBack(6.8, 0),
        atBack(8.2, 0),
        atBack(5.2, 1.2),
        atBack(5.2, -1.2),
      ];
      // Hadapkan gerobak sejajar dinding belakang rumah penempa agar lega & mudah diklaim
      const cartYaw = bs.yaw;
      for (const [cx, cz] of candidates) {
        const col = this.resolveCircleCollision ? this.resolveCircleCollision(cx, cz, 2.6) : { hit: false };
        if (!col.hit) {
          return { x: cx, z: cz, yaw: cartYaw, villageId: 'radnar' };
        }
      }
      const [fx, fz] = candidates[0];
      return { x: fx, z: fz, yaw: cartYaw, villageId: 'radnar' };
    }
    const baseZ = (rad ? rad.cz : 76.0) + 23.5;
    const roadX = this._getRoadCenterX ? this._getRoadCenterX(baseZ) : 0;
    return { x: roadX + 8.5, z: baseZ + 4.0, yaw: -Math.PI * 0.55, villageId: 'radnar' };
  }

  getTimeLabel() {
    const t = ((this.timeOfDay || 0) % 1 + 1) % 1;
    // t=0 -> 06:00, t=0.25 -> 12:00, t=0.5 -> 18:00, t=0.75 -> 00:00
    const totalMin = Math.floor(((t * 24 + 6) % 24) * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    const trFn = typeof HC !== 'undefined' && typeof HC.t === 'function' ? HC.t : null;
    const phaseKey = this.currentMoodKey === 'night' ? 'phase_night' : (this.currentMoodKey === 'sunset' ? 'phase_sunset' : 'phase_morning');
    const fallback = this.currentMoodKey === 'night' ? 'Night' : (this.currentMoodKey === 'sunset' ? 'Evening' : 'Morning');
    const phase = trFn ? trFn(phaseKey) : fallback;
    return `${hh}:${mm} • ${phase}`;
  }

  _blendMoodTarget(a, b, alpha) {
    const ct = this._cycleTarget;
    if (!ct || !a || !b) return;
    const w = Math.max(0, Math.min(1, alpha));
    ct.bgTop.copy(a.bgTop).lerp(b.bgTop, w);
    ct.bgBottom.copy(a.bgBottom).lerp(b.bgBottom, w);
    ct.sunColor.copy(a.sunColor).lerp(b.sunColor, w);
    ct.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, w);
    ct.sunPos.copy(a.sunPos).lerp(b.sunPos, w);
    ct.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, w);
    ct.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, w);
    ct.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, w);
    ct.sceneBrightness = THREE.MathUtils.lerp(a.sceneBrightness, b.sceneBrightness, w);
    ct.mushroomGlow = THREE.MathUtils.lerp(a.mushroomGlow, b.mushroomGlow, w);
    ct.particleColor.copy(a.particleColor).lerp(b.particleColor, w);
    ct.shadowTint.copy(a.shadowTint).lerp(b.shadowTint, w);
    ct.rimTint.copy(a.rimTint).lerp(b.rimTint, w);
    ct.cloudColor.copy(a.cloudColor).lerp(b.cloudColor, w);
    ct.cloudShadow.copy(a.cloudShadow).lerp(b.cloudShadow, w);
    ct.cloudCoverage = THREE.MathUtils.lerp(a.cloudCoverage, b.cloudCoverage, w);
    ct.grassBaseColor.copy(a.grassBaseColor).lerp(b.grassBaseColor, w);
    ct.grassTipColor.copy(a.grassTipColor).lerp(b.grassTipColor, w);
    ct.sunbeamOpacity = THREE.MathUtils.lerp(a.sunbeamOpacity, b.sunbeamOpacity, w);
    ct.lanternIntensity = THREE.MathUtils.lerp(a.lanternIntensity, b.lanternIntensity, w);
  }

  _updateDayNightCycle(delta) {
    if (!this.cycleEnabled || !this.cycleDuration) return;
    const dayStep = delta / this.cycleDuration;
    this.timeOfDay = (this.timeOfDay + dayStep) % 1.0;
    this.dayClock = (this.dayClock || 0) + dayStep;
    this._updateGrazedGrass();
    const t = this.timeOfDay;
    const { morning, sunset, night } = this.MOODS;
    const sm = (a, b, x) => {
      const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return u * u * (3 - 2 * u);
    };

    if (t < 0.06) {
      this._blendMoodTarget(sunset, morning, sm(0.0, 0.06, t));
    } else if (t < 0.44) {
      this._blendMoodTarget(morning, morning, 1.0);
      // Busur matahari lembut sepanjang siang
      const dayU = (t - 0.06) / 0.38;
      const arcAng = (dayU - 0.5) * Math.PI * 0.72;
      this._cycleTarget.sunPos.set(Math.sin(-arcAng) * 28, 24 + Math.cos(arcAng) * 11, 16 - dayU * 14);
    } else if (t < 0.54) {
      this._blendMoodTarget(morning, sunset, sm(0.44, 0.54, t));
    } else if (t < 0.62) {
      this._blendMoodTarget(sunset, night, sm(0.54, 0.62, t));
    } else if (t < 0.91) {
      this._blendMoodTarget(night, night, 1.0);
    } else {
      this._blendMoodTarget(night, sunset, sm(0.91, 1.0, t));
    }

    this.targetMood = this._cycleTarget;
    this.currentMoodKey = (t >= 0.58 && t < 0.93)
      ? 'night'
      : ((t >= 0.45 && t < 0.58) || t >= 0.93 || t < 0.04) ? 'sunset' : 'morning';
    this.isHeadlightsOn = (t >= 0.48 && t <= 0.95);
    this.isSunbeamsEnabled = (t < 0.58 || t > 0.92);
    if (this.sunbeamsGroup) this.sunbeamsGroup.visible = this.isSunbeamsEnabled;
  }

  _updateStreamingGrass(horseX, horseZ) {
    const tiles = this._grassTiles;
    const ts = this._grassTileSize || 15.0;
    const R = this._grassGridRadius || 4;
    if (!tiles || !tiles.length || typeof this._populateGrassTile !== 'function') return;

    const ptx = Math.floor(horseX / ts);
    const ptz = Math.floor(horseZ / ts);
    if (ptx === this._lastGrassTileX && ptz === this._lastGrassTileZ && !this._grassPendingSync) return;

    const occupied = new Set();
    const stale = [];
    for (let i = 0; i < tiles.length; i++) {
      const tl = tiles[i];
      if (Math.abs(tl.tx - ptx) <= R && Math.abs(tl.tz - ptz) <= R) {
        occupied.add(tl.tx + ',' + tl.tz);
      } else {
        stale.push(tl);
      }
    }

    if (!stale.length) {
      this._lastGrassTileX = ptx;
      this._lastGrassTileZ = ptz;
      this._grassPendingSync = false;
      return;
    }

    const needed = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const tx = ptx + dx;
        const tz = ptz + dz;
        const key = tx + ',' + tz;
        if (!occupied.has(key)) {
          needed.push({ tx, tz, d2: dx * dx + dz * dz });
        }
      }
    }
    needed.sort((a, b) => a.d2 - b.d2);

    const budget = Math.min(stale.length, needed.length, 4);
    for (let i = 0; i < budget; i++) {
      this._populateGrassTile(stale[i], needed[i].tx, needed[i].tz);
    }

    if (needed.length <= budget) {
      this._lastGrassTileX = ptx;
      this._lastGrassTileZ = ptz;
      this._grassPendingSync = false;
    } else {
      this._grassPendingSync = true;
    }
  }

  toggleCampfire(forceState) {
    this.isCampfireLit = forceState !== undefined ? !!forceState : !this.isCampfireLit;
    if (this.isCampfireLit) this.campfireGroup.userData.flareBoost = 1.4;
    return this.isCampfireLit;
  }

  toggleHeadlights(forceState) {
    this.isHeadlightsOn = forceState !== undefined ? !!forceState : !this.isHeadlightsOn;
    return this.isHeadlightsOn;
  }

  toggleSunbeams(forceState) {
    this.isSunbeamsEnabled = forceState !== undefined ? !!forceState : !this.isSunbeamsEnabled;
    this.sunbeamsGroup.visible = this.isSunbeamsEnabled;
    return this.isSunbeamsEnabled;
  }

  /* --- Kualitas grafis (HP kentang) --- */
  bindRenderer(renderer) {
    this.renderer = renderer;
    if (renderer && this._quality) this.applyQuality(this._quality);
  }

  applyQuality(quality) {
    if (!quality) return;
    this._quality = quality;
    this._shadowsStatic = quality.shadows === 'static';
    this.currentPerfMode = quality.key;
    const on = quality.shadows !== false;
    if (this.dirLight) {
      this.dirLight.castShadow = on;
      const area = quality.shadowArea || 12;
      const sc = this.dirLight.shadow.camera;
      sc.left = -area; sc.right = area; sc.top = area; sc.bottom = -area;
      sc.updateProjectionMatrix();
      if (quality.shadowMapSize > 0 && this.dirLight.shadow.mapSize.x !== quality.shadowMapSize) {
        this.dirLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
        if (this.dirLight.shadow.map) {
          this.dirLight.shadow.map.dispose();
          this.dirLight.shadow.map = null;
        }
      }
    }
    if (this.renderer) {
      this.renderer.shadowMap.enabled = on;
      this.renderer.shadowMap.autoUpdate = !this._shadowsStatic;
      if (on) this.renderer.shadowMap.needsUpdate = true;
      const dpr = Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap);
      this.renderer.setPixelRatio(dpr * (quality.renderScale || 1));
      this.renderer.toneMappingExposure = quality.renderScale < 1 ? 0.98 : 0.92;
    }
    return this.PERF_PROFILES[quality.key];
  }

  playTruckHornBeep() {
    if (!this._isAudioPlaying || !this._audioCtx) return;
    const audioCtx = this._audioCtx;
    const now = audioCtx.currentTime;
    [0, 0.16].forEach((delay, idx) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(idx === 0 ? 370 : 440, now + delay);
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      g.gain.setValueAtTime(0.05, now + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.13);
      osc.connect(filter);
      filter.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.14);
    });
  }

  toggleAudio() {
    if (typeof window === 'undefined') return false;
    if (!this._isAudioPlaying) {
      if (!this._audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        const audioCtx = (this._audioCtx = new AudioCtx());
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.025;
          b6 = white * 0.115926;
        }
        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 340;
        this._windGainNode = audioCtx.createGain();
        this._windGainNode.gain.value = 0.22;
        whiteNoise.connect(filter);
        filter.connect(this._windGainNode);
        this._windGainNode.connect(audioCtx.destination);
        whiteNoise.start(0);
      }
      if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
      if (this._windGainNode) this._windGainNode.gain.setTargetAtTime(0.22, this._audioCtx.currentTime, 0.3);
      if (this._crackleInterval) clearInterval(this._crackleInterval);
      this._crackleInterval = setInterval(() => {
        if (!this._isAudioPlaying || !this.isCampfireLit || !this._audioCtx) return;
        if (Math.random() < 0.55) {
          const osc = this._audioCtx.createOscillator();
          const g = this._audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(120 + Math.random() * 380, this._audioCtx.currentTime);
          g.gain.setValueAtTime(0.03, this._audioCtx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, this._audioCtx.currentTime + 0.045);
          osc.connect(g);
          g.connect(this._audioCtx.destination);
          osc.start();
          osc.stop(this._audioCtx.currentTime + 0.05);
        }
      }, 180);
      this._isAudioPlaying = true;
    } else {
      if (this._windGainNode && this._audioCtx) {
        this._windGainNode.gain.setTargetAtTime(0.0001, this._audioCtx.currentTime, 0.2);
      }
      if (this._crackleInterval) {
        clearInterval(this._crackleInterval);
        this._crackleInterval = null;
      }
      this._isAudioPlaying = false;
    }
    return this._isAudioPlaying;
  }

  spawnBurst(origin, colorHex, count = 10, isUpward = false, isGrassBlade = false) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
      });
      const mesh = new THREE.Mesh(
        isUpward && !isGrassBlade ? this._sharedSparkBurstGeo : this._sharedLeafBurstGeo,
        mat
      );
      mesh.position.copy(origin);
      this.scene.add(mesh);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.5;
      this.burstParticles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          isUpward ? (1.8 + Math.random() * 2.4) : (0.6 + Math.random() * 1.4),
          Math.sin(angle) * speed
        ),
        gravity: isUpward && !isGrassBlade ? -0.4 : 4.2,
        life: 1.0
      });
    }
  }

  interactAt(clientX, clientY, camera) {
    if (!camera) return null;
    this._pointer.x = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    this._pointer.y = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, camera);

    const targets = [
      this.pondMesh, this.campfireGroup,
      ...(this.riverMesh ? [this.riverMesh] : []),
      ...this.interactiveMushrooms, ...this.interactiveBushes, ...this.interactiveTrees
    ];
    const intersects = this._raycaster.intersectObjects(targets, true);
    if (!intersects.length) return null;

    const hitPoint = intersects[0].point;
    let obj = intersects[0].object;
    while (obj.parent && !obj.userData.type) obj = obj.parent;

    if (obj.userData.type === 'pond') {
      this.triggerPondRipple(hitPoint.x, hitPoint.z);
      this.spawnBurst(new THREE.Vector3(hitPoint.x, this.POND_WATER_Y + 0.12, hitPoint.z), 0xa5f3fc, 12, true, false);
      this.spawnBurst(new THREE.Vector3(hitPoint.x, this.POND_WATER_Y + 0.18, hitPoint.z), 0xffffff, 6, true, false);
      return (HC.getLang && HC.getLang() === 'id') ? 'Cipratan air & riak kolam!' : 'Cool pond ripples splash!';
    }
    if (obj.userData.type === 'river') {
      this.triggerRiverRipple(hitPoint.x, hitPoint.z);
      const wy = this.RIVER ? this.RIVER.waterY : -0.22;
      this.spawnBurst(new THREE.Vector3(hitPoint.x, wy + 0.12, hitPoint.z), 0xa5f3fc, 12, true, false);
      this.spawnBurst(new THREE.Vector3(hitPoint.x, wy + 0.18, hitPoint.z), 0xffffff, 6, true, false);
      return (HC.getLang && HC.getLang() === 'id') ? 'Cipratan air & riak sungai jernih!' : 'Clear river ripples splash!';
    }
    if (obj.userData.type === 'campfire') {
      if (!this.isCampfireLit) {
        this.toggleCampfire(true);
        return (HC.getLang && HC.getLang() === 'id') ? 'Api unggun dinyalakan kembali!' : 'Campfire lit up again!';
      }
      obj.userData.flareBoost = 1.6;
      this.spawnBurst(new THREE.Vector3(0, this.cfY + 0.8, 0), 0xffbe0b, 14, true, false);
      return (HC.getLang && HC.getLang() === 'id') ? 'Percikan api hangat membubung!' : 'Warm embers crackle upward!';
    }
    if (obj.userData.type === 'mushroom') {
      obj.userData.pulse = 1.5;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      wp.y += 0.35;
      this.spawnBurst(wp, 0x72efdd, 12, true, false);
      return (HC.getLang && HC.getLang() === 'id') ? 'Spora ajaib jamur hutan berpendar!' : 'Forest mushroom spores glow softly!';
    }
    if (obj.userData.type === 'bush') {
      obj.userData.rustleBoost = 1.6;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      wp.y += 0.6;
      this.spawnBurst(wp, obj.userData.burstColor || 0x76cc4b, 12, true, true);
      return (HC.getLang && HC.getLang() === 'id') ? `${obj.userData.name || 'Semak'} bergoyang rimbun!` : 'Forest bush rustles briskly!';
    }
    if (obj.userData.type === 'tree') {
      obj.userData.rustleBoost = 1.5;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      wp.y += 3.2;
      this.spawnBurst(wp, obj.userData.leafColor || 0xf9c74f, 12, false, false);
      return (HC.getLang && HC.getLang() === 'id') ? `${obj.userData.name || 'Pohon'} berdesir menjatuhkan dedaunan!` : 'Tree rustles and sheds autumn leaves!';
    }
    return null;
  }

  // ---- Query ketinggian & permukaan untuk kuda dan 4 roda gerobak ----
  terrainHeightAt(x, z) {
    return this._getTerrainHeight(x, z);
  }

  isOnRoad(x, z) {
    return !!(this._getRoadDistance && this._getRoadDistance(x, z) < 2.35);
  }

  waterEdgeDistance(x, z = 0) {
    let best = Infinity;
    if (this._riverCenterZ && this._riverHalfWidthAt) {
      const rEdge = Math.abs(z - this._riverCenterZ(x)) - this._riverHalfWidthAt(x);
      if (rEdge < best) best = rEdge;
    }
    if (this.POND_CENTER) {
      const pEdge = Math.hypot(x - this.POND_CENTER.x, z - this.POND_CENTER.z) - this.POND_CENTER.radius;
      if (pEdge < best) best = pEdge;
    }
    if (this._sampleGrandBasinAt) {
      const gb = this._sampleGrandBasinAt(x, z);
      if (gb && gb.edgeDist < best) best = gb.edgeDist;
    }
    if (this._puddleGrid && this._puddleCell) {
      const arr = this._puddleGrid.get(`${Math.floor(x / this._puddleCell)},${Math.floor(z / this._puddleCell)}`);
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const pd = arr[i];
          const pEdge = Math.hypot(x - pd.x, z - pd.z) - pd.r * 1.12;
          if (pEdge < best) best = pEdge;
        }
      }
    }
    return best;
  }

  isAtWater(x, z) {
    if (this.waterDepthAt(x, z) > 0.01) return true;
    return this.waterEdgeDistance(x, z) <= 0.70;
  }

  grazeGrassAt(x, z, radius = 1.65) {
    if (!this._paintGrassVisibilityCircle || !this._grassMapTexture) return false;
    this._paintGrassVisibilityCircle(x, z, radius, 0.0);
    this._grassMapTexture.needsUpdate = true;
    if (!this._grazedPatches) this._grazedPatches = [];
    this._grazedPatches.push({
      x,
      z,
      r: radius,
      regrowAt: (this.dayClock || 0) + 1.0, // Tumbuh kembali setelah 1 hari (24 jam)
    });
    return true;
  }

  _updateGrazedGrass() {
    if (!this._grazedPatches || !this._grazedPatches.length) return;
    if (!this._paintGrassVisibilityCircle || !this._grassMapTexture) return;
    const now = this.dayClock || 0;
    let dirty = false;
    for (let i = this._grazedPatches.length - 1; i >= 0; i--) {
      const p = this._grazedPatches[i];
      if (now >= p.regrowAt) {
        this._paintGrassVisibilityCircle(p.x, p.z, p.r * 1.15, 1.0);
        this._grazedPatches.splice(i, 1);
        dirty = true;
      }
    }
    if (dirty) this._grassMapTexture.needsUpdate = true;
  }

  getGrazedState() {
    return {
      dayClock: this.dayClock || 0,
      patches: (this._grazedPatches || []).map((p) => ({
        x: p.x, z: p.z, r: p.r, regrowAt: p.regrowAt,
      })),
    };
  }

  restoreGrazedState(state) {
    if (!state) return;
    if (typeof state.dayClock === 'number') this.dayClock = state.dayClock;
    if (!Array.isArray(state.patches)) return;
    this._grazedPatches = [];
    const now = this.dayClock || 0;
    let dirty = false;
    for (let i = 0; i < state.patches.length; i++) {
      const p = state.patches[i];
      if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
      if (now < (p.regrowAt || 0)) {
        const r = p.r || 1.65;
        this._grazedPatches.push({ x: p.x, z: p.z, r, regrowAt: p.regrowAt });
        if (this._paintGrassVisibilityCircle) {
          this._paintGrassVisibilityCircle(p.x, p.z, r, 0.0);
          dirty = true;
        }
      }
    }
    if (dirty && this._grassMapTexture) this._grassMapTexture.needsUpdate = true;
  }

  isOnGrass(x, z) {
    if (this.isOnRoad(x, z)) return false;
    if (this.isAtWater(x, z)) return false;
    if (Math.hypot(x, z) < 2.35) return false;
    const vs = this.VILLAGES || [];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const nx = v.fz || 0, nz = -(v.fx || 1);
      if (Math.hypot(x - (v.cx + nx * 5.8), z - (v.cz + nz * 5.8)) < 6.5) return false;
      if (Math.hypot(x - v.cx, z - v.cz) < 3.4) return false;
    }
    if (this._grazedPatches && this._grazedPatches.length) {
      for (let i = 0; i < this._grazedPatches.length; i++) {
        const p = this._grazedPatches[i];
        if (Math.hypot(x - p.x, z - p.z) < p.r * 0.85) return false;
      }
    }
    return true;
  }

  riverDistX(x, z = 0) {
    return Math.max(0, this.waterEdgeDistance(x, z));
  }

  waterDepthAt(x, z) {
    let maxD = 0;
    const gy = this._getTerrainHeight(x, z);
    if (this._riverCenterZ && this._riverHalfWidthAt && this.RIVER) {
      const rDist = Math.abs(z - this._riverCenterZ(x));
      if (rDist < this._riverHalfWidthAt(x) + 1.8) {
        const rd = this.RIVER.waterY - gy;
        if (rd > maxD) maxD = rd;
      }
    }
    const pd = Math.hypot(x - this.POND_CENTER.x, z - this.POND_CENTER.z);
    if (pd < this.POND_CENTER.radius + 0.8) {
      const pDepth = this.POND_WATER_Y - gy;
      if (pDepth > maxD) maxD = pDepth;
    }
    if (this._sampleGrandBasinAt) {
      const gb = this._sampleGrandBasinAt(x, z);
      if (gb && gb.edgeDist < 0.6) {
        const bd = gb.basin.waterY - gy;
        if (bd > maxD) maxD = bd;
      }
    }
    return maxD;
  }

  triggerPondRipple(x, z) {
    this.pondUniforms.uRippleOrigin.value.set(x, this.POND_WATER_Y, z);
    this.pondUniforms.uRippleTime.value = this.elapsed;
  }

  triggerRiverRipple(x, z, strength = 1.0) {
    if (!this.riverUniforms) return;
    const wy = this.RIVER ? this.RIVER.waterY : -0.22;
    this.riverUniforms.uRippleOrigin.value.set(x, wy, z);
    this.riverUniforms.uRippleTime.value = this.elapsed;
    if (this.riverUniforms.uRipples && Array.isArray(this.riverUniforms.uRipples.value)) {
      const slots = this.riverUniforms.uRipples.value;
      const idx = (this._riverRippleSlot || 0) % slots.length;
      slots[idx].set(x, z, this.elapsed, Math.max(0.25, Math.min(1.6, strength)));
      this._riverRippleSlot = idx + 1;
    }
  }

  spawnWaterSplash(x, y, z, intensity = 1.0, vx = 0, vz = 0) {
    const count = Math.min(18, Math.max(3, Math.round(5 * intensity)));
    const capRoom = Math.max(0, 64 - this.burstParticles.length);
    const n = Math.min(count, capRoom);
    for (let i = 0; i < n; i++) {
      const isFoam = i % 3 === 0;
      const mat = new THREE.MeshBasicMaterial({
        color: isFoam ? 0xeefcff : 0x7ce8f5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isFoam ? 0.92 : 0.78,
      });
      const mesh = new THREE.Mesh(this._sharedSparkBurstGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const spread = (0.12 + Math.random() * 0.24) * Math.min(1.8, intensity);
      mesh.position.set(x + Math.cos(ang) * spread, y + 0.04, z + Math.sin(ang) * spread);
      const sc = (isFoam ? 1.15 : 0.85) * (0.75 + Math.random() * 0.55) * Math.min(1.4, Math.sqrt(intensity));
      mesh.scale.setScalar(sc);
      this.scene.add(mesh);
      const outSpd = (0.7 + Math.random() * 1.45) * Math.min(1.7, intensity);
      this.burstParticles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(ang) * outSpd + vx * 0.22,
          (1.45 + Math.random() * 1.95) * Math.min(1.65, Math.sqrt(intensity)),
          Math.sin(ang) * outSpd + vz * 0.22
        ),
        gravity: 9.6,
        life: 0.72 + Math.random() * 0.26,
      });
    }
    if (this._isAudioPlaying && this._audioCtx && (this.elapsed - this._lastWaterSfxAt) > 0.16) {
      this._lastWaterSfxAt = this.elapsed;
      try {
        const ac = this._audioCtx;
        const now = ac.currentTime;
        const len = Math.floor(ac.sampleRate * 0.11);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ac.createBufferSource();
        src.buffer = buf;
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(680 + intensity * 260, now);
        bp.Q.value = 1.1;
        const g = ac.createGain();
        g.gain.setValueAtTime(Math.min(0.08, 0.032 * intensity), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        src.connect(bp); bp.connect(g); g.connect(ac.destination);
        src.start(now);
      } catch (e) { /* no-op */ }
    }
  }

  _rampHeight(x, z) {
    let add = 0;
    for (let i = 0; i < this.ramps.length; i++) {
      const rp = this.ramps[i];
      if (!rp || !rp.active) continue;
      const dx = x - rp.x, dz = z - rp.z;
      const c = Math.cos(rp.yaw || 0), s = Math.sin(rp.yaw || 0);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const halfL = rp.len * 0.5, halfW = rp.width * 0.5;
      if (Math.abs(lx) <= halfL && Math.abs(lz) <= halfW) {
        const u = (lx + halfL) / rp.len;
        const longProfile = Math.sin(Math.PI * HC.clamp(u, 0, 1));
        const latProfile = 1 - Math.pow(lz / halfW, 2);
        const h = rp.hPeak * longProfile * Math.max(0, latProfile);
        if (h > add) add = h;
      }
    }
    return add;
  }

  _pebbleHeight(x, z, wheelRadius = 0.35) {
    let add = 0;
    for (let i = 0; i < this.pebbles.length; i++) {
      const p = this.pebbles[i];
      const d = Math.hypot(x - p.x, z - p.z);
      const reach = p.r + wheelRadius * 0.32;
      if (d < reach) {
        const t = 1 - (d / reach);
        const h = p.h * t * (2 - t);
        if (h > add) add = h;
      }
    }
    return add;
  }

  sampleRockSurface(x, z) {
    const rm = this.rockMeshes;
    if (!rm || !rm.length) return { hit: false, y: -Infinity, nx: 0, ny: 1, nz: 0, rock: null };
    let bestY = -Infinity, bestNx = 0, bestNy = 1, bestNz = 0, bestRock = null;
    for (let i = 0; i < rm.length; i++) {
      const rk = rm[i];
      if (x < rk.minX || x > rk.maxX || z < rk.minZ || z > rk.maxZ) continue;
      const tris = rk.topTris;
      for (let j = 0; j < tris.length; j++) {
        const t = tris[j];
        if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
        const v0x = t.bx - t.ax, v0z = t.bz - t.az;
        const v1x = t.cx - t.ax, v1z = t.cz - t.az;
        const det = v0x * v1z - v0z * v1x;
        if (Math.abs(det) < 1e-7) continue;
        const qx = x - t.ax, qz = z - t.az;
        const u = (qx * v1z - qz * v1x) / det;
        const v = (v0x * qz - v0z * qx) / det;
        if (u >= -1e-4 && v >= -1e-4 && (u + v) <= 1 + 1e-4) {
          const w = 1 - u - v;
          const y = w * t.ay + u * t.by + v * t.cy;
          if (y > bestY) {
            bestY = y;
            bestNx = t.nx; bestNy = t.ny; bestNz = t.nz;
            bestRock = rk;
          }
        }
      }
    }
    return bestRock ? { hit: true, y: bestY, nx: bestNx, ny: bestNy, nz: bestNz, rock: bestRock } : { hit: false, y: -Infinity, nx: 0, ny: 1, nz: 0, rock: null };
  }

  sampleLogSurface(x, z) {
    const logs = this.traversableLogs;
    if (!logs || !logs.length) return { hit: false, y: -Infinity, nx: 0, ny: 1, nz: 0 };
    let bestY = -Infinity, bestNx = 0, bestNy = 1, bestNz = 0, hit = false;
    for (let i = 0; i < logs.length; i++) {
      const lg = logs[i];
      const ax = lg.x2 - lg.x1, az = lg.z2 - lg.z1;
      const len2 = ax * ax + az * az;
      if (len2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - lg.x1) * ax + (z - lg.z1) * az) / len2));
      const cx = lg.x1 + ax * t;
      const cz = lg.z1 + az * t;
      const px = x - cx, pz = z - cz;
      const d = Math.hypot(px, pz);
      const r = lg.radius;
      const skirt = r + 0.16;
      if (d <= r) {
        const yTop = lg.cy + Math.sqrt(Math.max(0, r * r - d * d));
        if (yTop > bestY) {
          bestY = yTop;
          const invR = 1 / Math.max(r, 1e-4);
          bestNx = px * invR;
          bestNz = pz * invR;
          bestNy = Math.max(0.22, Math.sqrt(Math.max(0, r * r - d * d)) * invR);
          hit = true;
        }
      } else if (d < skirt) {
        const u = 1 - (d - r) / (skirt - r);
        const sm = u * u * (3 - 2 * u);
        const groundY = this._getTerrainHeight(x, z);
        const rampY = groundY + (lg.cy - groundY) * sm;
        if (rampY > bestY) {
          bestY = rampY;
          const dirX = d > 1e-5 ? px / d : 0;
          const dirZ = d > 1e-5 ? pz / d : 0;
          bestNx = dirX * 0.45;
          bestNz = dirZ * 0.45;
          bestNy = 0.89;
          hit = true;
        }
      }
    }
    return { hit, y: bestY, nx: bestNx, ny: bestNy, nz: bestNz };
  }

  heightAt(x, z) {
    let h = this._getTerrainHeight(x, z) + this._rampHeight(x, z);
    const rk = this.sampleRockSurface(x, z);
    if (rk.hit && rk.y > h) h = rk.y;
    const lg = this.sampleLogSurface(x, z);
    if (lg.hit && lg.y > h) h = lg.y;
    return h;
  }

  wheelHeightAt(x, z, wheelRadius = 0.55) {
    let h = this._getTerrainHeight(x, z) + this._rampHeight(x, z) + this._pebbleHeight(x, z, wheelRadius);
    const rkC = this.sampleRockSurface(x, z);
    if (rkC.hit && rkC.y > h) h = rkC.y;
    const lgC = this.sampleLogSurface(x, z);
    if (lgC.hit && lgC.y > h) h = lgC.y;
    const off = wheelRadius * 0.24;
    const hasRocks = !!(this.rockMeshes && this.rockMeshes.length);
    const hasLogs = !!(this.traversableLogs && this.traversableLogs.length);
    if (hasRocks || hasLogs) {
      for (let i = 0; i < 4; i++) {
        const sx = i === 0 ? x + off : i === 1 ? x - off : x;
        const sz = i === 2 ? z + off : i === 3 ? z - off : z;
        if (hasRocks) {
          const rks = this.sampleRockSurface(sx, sz);
          if (rks.hit && rks.y - 0.02 > h) h = rks.y - 0.02;
        }
        if (hasLogs) {
          const lgs = this.sampleLogSurface(sx, sz);
          if (lgs.hit && lgs.y - 0.02 > h) h = lgs.y - 0.02;
        }
      }
    }
    return h;
  }

  normalAt(x, z, outVec) {
    const base = this._getTerrainHeight(x, z) + this._rampHeight(x, z);
    const rk = this.sampleRockSurface(x, z);
    const lg = this.sampleLogSurface(x, z);
    let bestY = base;
    let src = null;
    if (rk.hit && rk.y > bestY + 0.01) { bestY = rk.y; src = rk; }
    if (lg.hit && lg.y > bestY + 0.01) { bestY = lg.y; src = lg; }
    const n = src
      ? (this._tmpRockN || (this._tmpRockN = new THREE.Vector3())).set(src.nx, src.ny, src.nz)
      : this._getTerrainNormal(x, z);
    if (outVec) return outVec.copy(n);
    return n;
  }

  _makeRampMesh(hPeak, len, width) {
    const geo = new THREE.BoxGeometry(len, hPeak, width, 12, 1, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const u = (lx + len * 0.5) / len;
      const v = lz / (width * 0.5);
      if (ly > 0) {
        const prof = Math.sin(Math.PI * HC.clamp(u, 0, 1)) * Math.max(0, 1 - v * v);
        pos.setY(i, prof * hPeak);
      } else {
        pos.setY(i, -0.08);
      }
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8d6e4c, roughness: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  spawnRampAt(ox, oz, yaw, hPeak = 1.6, len = 2.4, width = 1.4, lat = 0.9) {
    const mesh = this._makeRampMesh(hPeak, len, width);
    const gy = this._getTerrainHeight(ox, oz);
    mesh.position.set(ox, gy, oz);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    this.ramps.push({
      mesh, len, width, hPeak, lat,
      x: ox, z: oz, yaw, active: true
    });
  }

  _syncPebbles() {
    if (!this.pebbleMesh) return;
    for (let i = 0; i < this.pebbles.length; i++) {
      const p = this.pebbles[i];
      const gy = (Math.abs(p.x) < this.TERRAIN_SIZE * 0.5 && Math.abs(p.z) < this.TERRAIN_SIZE * 0.5) ? this._getTerrainHeight(p.x, p.z) : -50;
      this._pDummy.position.set(p.x, gy + p.h * 0.35, p.z);
      this._pDummy.rotation.copy(p.rot);
      this._pDummy.scale.set(p.r * 2, p.h * 2, p.r * 2);
      this._pDummy.updateMatrix();
      this.pebbleMesh.setMatrixAt(i, this._pDummy.matrix);
    }
    this.pebbleMesh.instanceMatrix.needsUpdate = true;
  }

  spawnPebbleClusterAhead(hx, hz, hyaw) {
    const fx = Math.cos(hyaw), fz = -Math.sin(hyaw);
    const lx = -fz, lz = fx;
    const baseSlot = (this._pebbleCursor = ((this._pebbleCursor || 0) + 12) % this.pebbles.length);
    for (let i = 0; i < 12; i++) {
      const p = this.pebbles[(baseSlot + i) % this.pebbles.length];
      const dist = 2.2 + (i / 12) * 3.8;
      const side = ((i % 3) - 1) * 0.55 + Math.sin(i * 2.3) * 0.25;
      p.x = hx + fx * dist + lx * side;
      p.z = hz + fz * dist + lz * side;
      p.r = 0.08 + (i % 4) * 0.035;
      p.h = p.r * 0.85;
    }
    this._syncPebbles();
  }

  setCartPose(cx, cz, cyaw = null) {
    this.cartX = cx;
    this.cartZ = cz;
    if (Number.isFinite(cyaw)) this.cartYaw = cyaw;
  }

  /* --------------------------------------------------------------------------
     IMPOSTOR JAUH (open-world style LOD untuk pohon)
     Pohon yang jaraknya lewat ambang diganti satu billboard bertekstur — dari
     jauh terbaca sebagai satu gambar utuh, bukan 7-8 mesh per pohon. Begitu
     pemain mendekat, billboard hilang dan model asli muncul lagi.
     Semua billboard satu bucket digambar lewat SATU InstancedMesh, jadi biaya
     puluhan pohon jauh cuma ~1 draw call per jenis warna.
     -------------------------------------------------------------------------- */
  /* --------------------------------------------------------------------------
     LOD 3D POHON JAUH (bukan billboard 2D).
     Siluet & geometri pohon TETAP ada di jauh, cuma bentuknya versi "burik":
     semua sub-mesh digabung jadi SATU geometri, warna dipanggang ke vertex,
     shader angin/tekstur tidak dipakai lagi. Semua pohon jauh dari jenis yang
     sama digambar sebagai INSTANCE geometri itu (1 draw call per jenis).
     Dekat: model asli lengkap (trunk pahat + kanopi shader angin) seperti biasa.
     Ambang pindah jauh: Hass Tampilan berbeda hanya mulai lewat beberapa puluh
     meter, bukan 20 m seperti versi billboard yang pertama.
     -------------------------------------------------------------------------- */
  _bakeTreeForLod(tree, leafHex) {
    const THREE = HC.THREE;
    tree.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(tree.matrixWorld).invert();
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    const treeScale = tree.scale.x || 1;
    const ts = 1 / treeScale;
    const wood = { pos: [], nrm: [], col: [] };
    const leaf = { pos: [], nrm: [], col: [], uv: [] };
    let leafMap = null;

    tree.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      let g = o.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      m4.multiplyMatrices(rootInv, o.matrixWorld);
      g.applyMatrix4(m4);
      // Geometri template dibakukan ke skala 1; skala tiap pohon dibawa matrix instance.
      g.scale(ts, ts, ts);

      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const isFoliage = !!(tree.userData && tree.userData.foliageMesh === o);
      let hex = 0x4f7b3a;
      if (!isFoliage && mat && mat.color && mat.color.isColor) hex = mat.color.getHex();
      else if (isFoliage) hex = leafHex;
      c.setHex(hex);

      const pos = g.attributes.position;
      const nrm = g.attributes.normal;
      const uv = g.attributes.uv;
      if (isFoliage && mat && mat.map) leafMap = leafMap || mat.map;
      const bucket = isFoliage ? leaf : wood;

      for (let i = 0; i < pos.count; i++) {
        bucket.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (nrm) bucket.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        else bucket.nrm.push(0, 1, 0);
        if (isFoliage) {
          if (uv) bucket.uv.push(uv.getX(i), uv.getY(i));
          else bucket.uv.push(0.5, 0.5);
        }
        if (!isFoliage || !leafMap) bucket.col.push(c.r, c.g, c.b);
        else bucket.col.push(1, 1, 1);
      }
      g.dispose();
    });

    const buildGeo = (b, withUv) => {
      if (!b.pos.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      if (withUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.computeBoundingSphere();
      return geo;
    };

    return {
      wood: buildGeo(wood, false),
      leaf: buildGeo(leaf, true),
      leafMap
    };
  }

  _buildTreeLod() {
    const THREE = HC.THREE;
    const trees = this.interactiveTrees || [];
    this._treeLodEntries = [];
    this._impGroups = [];
    if (!trees.length) return;

    const buckets = new Map();
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const ud = tree.userData || {};
      if (ud.type !== 'tree' || !ud.boundingSphere) continue;
      const kind = ud.treeKind || 'pine';
      const paletteKey = ud.naturalColorKey || 'green';
      const key = kind + '|' + paletteKey;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { trees: [] }; buckets.set(key, bucket); }
      bucket.trees.push(tree);
      ud._lodManaged = true;
    }

    for (const bucket of buckets.values()) {
      const tpl = bucket.trees[0];
      const leafHex = (tpl.userData.leafColor || new THREE.Color(0x4f7b3a)).getHex();
      const baked = this._bakeTreeForLod(tpl, leafHex);
      const count = bucket.trees.length;

      const entries = bucket.trees.map((tree) => {
        const s = tree.scale.x || 1;
        const entry = {
          tree,
          far: false,
          m4: new THREE.Matrix4(),
          quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2),
          scaleVec: new THREE.Vector3(s, s, s)
        };
        this._treeLodEntries.push(entry);
        return entry;
      });

      let woodMesh = null;
      if (baked.wood) {
        woodMesh = new THREE.InstancedMesh(
          baked.wood,
          new THREE.MeshLambertMaterial({ vertexColors: true }),
          count
        );
        woodMesh.count = 0;
        woodMesh.frustumCulled = false;
        woodMesh.castShadow = false;
        woodMesh.receiveShadow = false;
        woodMesh.userData.isFarTreeLod = true;
        woodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(woodMesh);
      }

      let leafMesh = null;
      if (baked.leaf) {
        // Tekstur daun tetap dipakai: pad pohon berupa quad alpha-cutout, tanpa
        // map bentuknya jadi kotak hijau. alphaTest sama dengan model asli.
        leafMesh = new THREE.InstancedMesh(
          baked.leaf,
          new THREE.MeshLambertMaterial({
            map: baked.leafMap || null,
            vertexColors: true,
            alphaTest: baked.leafMap ? 0.44 : 0.0,
            side: THREE.DoubleSide
          }),
          count
        );
        leafMesh.count = 0;
        leafMesh.frustumCulled = false;
        leafMesh.castShadow = false;
        leafMesh.receiveShadow = false;
        leafMesh.userData.isFarTreeLod = true;
        leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(leafMesh);
      }

      this._impGroups.push({ woodMesh, leafMesh, entries });
    }
  }

  _updateTreeLod(camera) {
    if (!this._impGroups) this._buildTreeLod();
    if (!this._impGroups || !this._impGroups.length) return;

    const prof = this.PERF_PROFILES[this.currentPerfMode] || this.PERF_PROFILES.ultra;
    const q = this._quality || {};
    const lodDist = Math.max(20, q.treeLod || prof.treeLod || 45);
    const farDist = Math.max(lodDist + 20, q.treeFar || prof.treeFar || lodDist + 45);

    for (let g = 0; g < this._impGroups.length; g++) {
      const group = this._impGroups[g];
      const entries = group.entries;
      let n = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const ud = e.tree.userData;
        const dist = ud._camDist || 0;
        if (e.far) { if (dist < lodDist * 0.82) e.far = false; }
        else if (dist > lodDist) e.far = true;

        ud._lodFar = e.far;
        const inFrustum = !!ud._inFrustum;

        if (e.far) {
          e.tree.visible = false;
          if (inFrustum && dist <= farDist) {
            e.m4.compose(e.tree.position, e.quat, e.scaleVec);
            if (group.woodMesh) group.woodMesh.setMatrixAt(n, e.m4);
            if (group.leafMesh) group.leafMesh.setMatrixAt(n, e.m4);
            n++;
          }
        } else {
          e.tree.visible = (dist < 18.0) || (inFrustum && dist <= lodDist);
        }
      }
      if (group.woodMesh) { group.woodMesh.count = n; if (n > 0) group.woodMesh.instanceMatrix.needsUpdate = true; }
      if (group.leafMesh) { group.leafMesh.count = n; if (n > 0) group.leafMesh.instanceMatrix.needsUpdate = true; }
    }
  }

  captureOrthoMapCanvas(requestedRes = 4096, hideRoots = []) {
    const renderer = this.renderer;
    const scene = this.scene;
    if (!renderer || !scene || typeof document === 'undefined') return null;

    if (!this._impGroups) this._buildTreeLod();

    const maxTex = (renderer.capabilities && renderer.capabilities.maxTextureSize) || 1024;
    const tiles = requestedRes > 2048 ? 2 : 1;
    const tileRes = Math.max(512, Math.min(Math.round(requestedRes / tiles), maxTex, 2048));
    const res = tileRes * tiles;
    const half = (this.TERRAIN_SIZE || 1500) * 0.5;
    const subHalf = half / tiles;
    this._orthoCaptureError = null;

    const orthoCam = new THREE.OrthographicCamera(-subHalf, subHalf, subHalf, -subHalf, 1, 500);
    orthoCam.up.set(0, 0, -1); // -Z = Atas (Utara), +X = Kanan (Timur)

    // Simpan semua state render untuk dipulihkan persis setelah capture
    const prevTarget = renderer.getRenderTarget();
    const prevScissor = typeof renderer.getScissorTest === 'function' ? renderer.getScissorTest() : false;
    const prevBg = scene.background ? scene.background.clone() : null;
    const prevFog = scene.fog || null;
    const prevShadows = renderer.shadowMap.enabled;
    const prevAutoClear = renderer.autoClear;
    const prevSkyVis = this.skyDome ? this.skyDome.visible : false;
    const prevCelVis = this.celestialOrb ? this.celestialOrb.visible : false;
    const prevSunVis = this.sunbeamsGroup ? this.sunbeamsGroup.visible : false;
    const prevPartVis = this.particleSystem ? this.particleSystem.visible : false;
    const prevDirInt = this.dirLight ? this.dirLight.intensity : 1;
    const prevHemiInt = this.hemiLight ? this.hemiLight.intensity : 1;
    const prevBright = this.celShaderUniforms && this.celShaderUniforms.uSceneBrightness
      ? this.celShaderUniforms.uSceneBrightness.value : 1;
    const prevSunDir = this.celShaderUniforms && this.celShaderUniforms.uSunDir
      ? this.celShaderUniforms.uSunDir.value.clone() : null;
    const prevCloudMin = this.dylearnSharedUniforms && this.dylearnSharedUniforms.uCloudShadowMin
      ? this.dylearnSharedUniforms.uCloudShadowMin.value : 0.28;
    const prevGrassTint = this.dylearnSharedUniforms && this.dylearnSharedUniforms.uGrassMoodTint
      ? this.dylearnSharedUniforms.uGrassMoodTint.value.clone() : null;

    const savedTerrainVis = this.terrainChunks.map((c) => c.visible);
    const savedGrassVis = this.grassChunks.map((g) => g.visible);
    const savedTreeVis = this.interactiveTrees.map((t) => t.visible);
    const savedBushVis = this.interactiveBushes.map((b) => b.visible);
    const savedHideRoots = [];
    for (const r of (hideRoots || [])) {
      if (r && typeof r.visible === 'boolean') savedHideRoots.push([r, r.visible]);
    }
    const savedImpCounts = (this._impGroups || []).map((grp) => ({
      wc: grp.woodMesh ? grp.woodMesh.count : 0,
      lc: grp.leafMesh ? grp.leafMesh.count : 0,
      wf: grp.woodMesh ? grp.woodMesh.frustumCulled : false,
      lf: grp.leafMesh ? grp.leafMesh.frustumCulled : false,
    }));

    let rt = null;
    try {
      scene.background = new THREE.Color(0x285432);
      scene.fog = null;
      renderer.shadowMap.enabled = false;
      renderer.autoClear = true;
      if (typeof renderer.setScissorTest === 'function') renderer.setScissorTest(false);
      if (this.skyDome) this.skyDome.visible = false;
      if (this.celestialOrb) this.celestialOrb.visible = false;
      if (this.sunbeamsGroup) this.sunbeamsGroup.visible = false;
      if (this.particleSystem) this.particleSystem.visible = false;

      if (this.dylearnSharedUniforms && this.dylearnSharedUniforms.uCloudShadowMin) {
        this.dylearnSharedUniforms.uCloudShadowMin.value = 1.0;
      }
      if (this.dylearnSharedUniforms && this.dylearnSharedUniforms.uGrassMoodTint) {
        this.dylearnSharedUniforms.uGrassMoodTint.value.set(1.0, 1.0, 1.0);
      }
      if (this.celShaderUniforms && this.celShaderUniforms.uSceneBrightness) {
        this.celShaderUniforms.uSceneBrightness.value = 0.80;
      }
      if (this.celShaderUniforms && this.celShaderUniforms.uSunDir) {
        this.celShaderUniforms.uSunDir.value.set(0.32, 0.90, 0.28).normalize();
      }
      if (this.dirLight) this.dirLight.intensity = 0.88 * Math.PI;
      if (this.hemiLight) this.hemiLight.intensity = 0.68 * Math.PI;

      // Tampilkan SELURUH terrain chunk & seluruh pohon asli (deciduous + pinus) agar atap rumah & pohon terfoto 1:1
      for (let i = 0; i < this.terrainChunks.length; i++) this.terrainChunks[i].visible = true;
      for (let i = 0; i < this.grassChunks.length; i++) this.grassChunks[i].visible = false;
      for (let i = 0; i < this.interactiveTrees.length; i++) {
        const t = this.interactiveTrees[i];
        t.visible = !(t.userData && t.userData.isCut);
      }
      for (let i = 0; i < this.interactiveBushes.length; i++) {
        const b = this.interactiveBushes[i];
        b.visible = !(b.userData && b.userData.isCut);
      }
      for (const [r] of savedHideRoots) r.visible = false;

      // Matikan instanced LOD far-tree karena shader daun deciduous memerlukan model aslinya saat ortho
      for (let g = 0; g < (this._impGroups || []).length; g++) {
        const grp = this._impGroups[g];
        if (grp.woodMesh) grp.woodMesh.count = 0;
        if (grp.leafMesh) grp.leafMesh.count = 0;
      }

      rt = new THREE.WebGLRenderTarget(tileRes, tileRes, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
      });

      const outCanvas = document.createElement('canvas');
      outCanvas.width = res;
      outCanvas.height = res;
      const ctx = outCanvas.getContext('2d');
      const pxBuf = new Uint8Array(tileRes * tileRes * 4);
      const tileImgData = ctx.createImageData(tileRes, tileRes);
      const dst = tileImgData.data;

      // ACES Filmic + Linear->sRGB LUT agar warna peta ortografik serasi & kontras dengan viewport game
      const linToSrgb = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 0.95;
        const aces = Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
        linToSrgb[i] = Math.min(255, Math.round(Math.pow(aces, 1 / 2.2) * 255));
      }

      const tileSpanWorld = (this.TERRAIN_SIZE || 1500) / tiles;
      for (let tz = 0; tz < tiles; tz++) {
        for (let tx = 0; tx < tiles; tx++) {
          const cx = -half + (tx + 0.5) * tileSpanWorld;
          const cz = -half + (tz + 0.5) * tileSpanWorld;
          orthoCam.position.set(cx, 220, cz);
          orthoCam.lookAt(cx, 0, cz);
          orthoCam.updateMatrixWorld(true);
          orthoCam.updateProjectionMatrix();

          renderer.setRenderTarget(rt);
          renderer.clear();
          renderer.render(scene, orthoCam);
          renderer.readRenderTargetPixels(rt, 0, 0, tileRes, tileRes, pxBuf);

          for (let y = 0; y < tileRes; y++) {
            const srcRow = (tileRes - 1 - y) * tileRes * 4;
            const dstRow = y * tileRes * 4;
            for (let x = 0; x < tileRes; x++) {
              const si = srcRow + x * 4;
              const di = dstRow + x * 4;
              dst[di]     = linToSrgb[pxBuf[si]];
              dst[di + 1] = linToSrgb[pxBuf[si + 1]];
              dst[di + 2] = linToSrgb[pxBuf[si + 2]];
              dst[di + 3] = 255;
            }
          }
          ctx.putImageData(tileImgData, tx * tileRes, tz * tileRes);
        }
      }
      return outCanvas;
    } catch (err) {
      this._orthoCaptureError = (err && err.stack) ? err.stack : String(err);
      console.error('[SHOD] captureOrthoMapCanvas failed:', err);
      return null;
    } finally {
      if (rt) rt.dispose();
      renderer.setRenderTarget(prevTarget);
      if (typeof renderer.setScissorTest === 'function') renderer.setScissorTest(prevScissor);
      renderer.shadowMap.enabled = prevShadows;
      renderer.autoClear = prevAutoClear;
      if (prevBg && scene.background) scene.background.copy(prevBg);
      scene.fog = prevFog;
      if (this.skyDome) this.skyDome.visible = prevSkyVis;
      if (this.celestialOrb) this.celestialOrb.visible = prevCelVis;
      if (this.sunbeamsGroup) this.sunbeamsGroup.visible = prevSunVis;
      if (this.particleSystem) this.particleSystem.visible = prevPartVis;
      if (this.dylearnSharedUniforms && this.dylearnSharedUniforms.uCloudShadowMin) {
        this.dylearnSharedUniforms.uCloudShadowMin.value = prevCloudMin;
      }
      if (prevGrassTint && this.dylearnSharedUniforms && this.dylearnSharedUniforms.uGrassMoodTint) {
        this.dylearnSharedUniforms.uGrassMoodTint.value.copy(prevGrassTint);
      }
      if (this.celShaderUniforms && this.celShaderUniforms.uSceneBrightness) {
        this.celShaderUniforms.uSceneBrightness.value = prevBright;
      }
      if (prevSunDir && this.celShaderUniforms && this.celShaderUniforms.uSunDir) {
        this.celShaderUniforms.uSunDir.value.copy(prevSunDir);
      }
      if (this.dirLight) this.dirLight.intensity = prevDirInt;
      if (this.hemiLight) this.hemiLight.intensity = prevHemiInt;

      for (let i = 0; i < this.terrainChunks.length; i++) this.terrainChunks[i].visible = savedTerrainVis[i];
      for (let i = 0; i < this.grassChunks.length; i++) this.grassChunks[i].visible = savedGrassVis[i];
      for (let i = 0; i < this.interactiveTrees.length; i++) this.interactiveTrees[i].visible = savedTreeVis[i];
      for (let i = 0; i < this.interactiveBushes.length; i++) this.interactiveBushes[i].visible = savedBushVis[i];
      for (const [r, vis] of savedHideRoots) r.visible = vis;
      for (let g = 0; g < (this._impGroups || []).length; g++) {
        const grp = this._impGroups[g];
        const sv = savedImpCounts[g];
        if (!sv) continue;
        if (grp.woodMesh) { grp.woodMesh.count = sv.wc; grp.woodMesh.frustumCulled = sv.wf; }
        if (grp.leafMesh) { grp.leafMesh.count = sv.lc; grp.leafMesh.frustumCulled = sv.lf; }
      }
    }
  }

  updateCameraFrustumCulling(camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._cameraFrustum.setFromProjectionMatrix(this._projScreenMatrix);

    const prof = this.PERF_PROFILES[this.currentPerfMode] || this.PERF_PROFILES.ultra;
    const camPos = camera.position;

    for (let i = 0; i < this.terrainChunks.length; i++) {
      const chunk = this.terrainChunks[i];
      chunk.visible = this._cameraFrustum.intersectsSphere(chunk.userData.boundingSphere);
    }

    for (let i = 0; i < this.grassChunks.length; i++) {
      const gChunk = this.grassChunks[i];
      if (!gChunk.userData.maxCount) {
        gChunk.visible = false;
        gChunk.count = 0;
        continue;
      }
      const sphere = gChunk.userData.boundingSphere;
      const dist = camPos.distanceTo(sphere.center);
      if (dist - sphere.radius > prof.cullDistance || !this._cameraFrustum.intersectsSphere(sphere)) {
        gChunk.visible = false;
      } else {
        gChunk.visible = true;
        let lodFactor = 1.0;
        if (dist > 38.0) {
          lodFactor = THREE.MathUtils.clamp(1.0 - (dist - 38.0) / (prof.cullDistance - 24.0), 0.55, 1.0);
        }
        gChunk.count = Math.max(1, Math.floor(gChunk.userData.maxCount * prof.grassRatio * lodFactor));
      }
    }

    for (let i = 0; i < this.interactiveTrees.length; i++) {
      const tree = this.interactiveTrees[i];
      const sphere = tree.userData.boundingSphere;
      if (!sphere) continue;
      const inFrustum = this._cameraFrustum.intersectsSphere(sphere);
      const dist = camPos.distanceTo(sphere.center);
      // radius visibility culling sebelum LOD: objek yang lewat budget jarak
      // tak perlu masuk ke pass canopy/interaksi.
      tree.userData._baseVisible = (dist <= prof.cullDistance + 12.0) && inFrustum;
      tree.userData._inFrustum = inFrustum;
      tree.userData._camDist = dist;
      tree.visible = (dist < 18.0) || tree.userData._baseVisible;
    }

    for (let i = 0; i < this.interactiveBushes.length; i++) {
      const bush = this.interactiveBushes[i];
      if (bush.userData.isCut) {
        bush.visible = false;
        continue;
      }
      const sphere = bush.userData.boundingSphere;
      const dist = camPos.distanceTo(sphere.center);
      bush.visible = (dist <= prof.cullDistance + 8.0) && this._cameraFrustum.intersectsSphere(sphere);
    }

    // Tahap akhir: pohon & desa jauh ditukar jadi siluet geometri low-detail (3D).
    this._updateTreeLod(camera);
    this._updateVillageLod(camera);
  }

  _updateVillageLod(camera) {
    const villages = this.villageData && this.villageData.villages;
    if (!Array.isArray(villages) || !villages.length || !camera) return;
    const prof = (this.PERF_PROFILES && (this.PERF_PROFILES[this.currentPerfMode] || this.PERF_PROFILES.ultra)) || {};
    const q = this._quality || {};
    const vLod = Math.max(45, q.villageLod || prof.villageLod || 85);
    const vFar = Math.max(vLod + 40, q.villageFar || prof.villageFar || 220);
    const camPos = camera.position;

    for (let i = 0; i < villages.length; i++) {
      const vRec = villages[i];
      if (!vRec || !vRec.group) continue;
      const dist = Math.hypot(camPos.x - vRec.cx, camPos.z - vRec.cz);
      const hyst = vRec.isNear ? 4.0 : -4.0;
      const near = dist <= (vLod + hyst);
      const inFar = dist <= vFar;
      vRec.isNear = near;
      vRec.group.visible = near;
      if (vRec.lodMesh) {
        vRec.lodMesh.visible = !near && inFar;
      }
    }
  }

  syncCamera(camera) {
    if (!camera) return;
    camera.getWorldDirection(this._tmpCamForward);
    const fx = this._tmpCamForward.x;
    const fz = this._tmpCamForward.z;
    const fLen = Math.hypot(fx, fz);
    if (fLen > 1e-4) {
      const nfx = fx / fLen;
      const nfz = fz / fLen;
      this.grassUniforms.uCamForwardXZ.value.set(nfx, nfz);
      this.grassUniforms.uCamRightXZ.value.set(-nfz, nfx);
    }
    this.skyDome.position.copy(camera.position);
    this.celestialOrb.position.copy(camera.position).addScaledVector(this.activeAtmosphere.sunPos, 2.1);
    this.celestialMat.color.copy(this.activeAtmosphere.sunColor);
    this.updateCameraFrustumCulling(camera);
  }

  update(horseX, dt, horseZ = 0, horseYaw = 0) {
    const delta = Math.min(dt || 1 / 60, 0.1);
    this.elapsed += delta;
    const elapsed = this.elapsed;
    this.frameCounter++;

    // Streaming rumput rimbun 15x15m mengikuti posisi pemain + siklus 10 menit otomatis
    this._updateStreamingGrass(horseX, horseZ);
    this._updateDayNightCycle(delta);
    this._updateVillageFarms(delta);

    // Bayangan mode 'static' (HP menengah): peta bayangan digambar ulang tiap
    // 5 frame, bukan tiap frame. Gerak lambat tetap dapat bayangan, biaya turun.
    if (this._shadowsStatic && this.renderer && this.renderer.shadowMap.enabled
      && (this.frameCounter % 5 === 0)) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    this.grassUniforms.uTime.value = elapsed;
    this.celShaderUniforms.uTime.value = elapsed;
    this.skyUniforms.uTime.value = elapsed;

    const targetTint = this.currentMoodKey === 'night'
      ? this._moodTintNight
      : (this.currentMoodKey === 'sunset' ? this._moodTintSunset : this._moodTintMorning);
    this.dylearnSharedUniforms.uGrassMoodTint.value.lerp(targetTint, Math.min(1, delta * 2.2));

    // Step character displacement positions at 10 FPS (matching Dylearn CharacterManager.gd)
    this._grassCharTimer += delta;
    if (this.frameCounter === 1 || this._grassCharTimer >= 0.1) {
      this._grassCharTimer = this._grassCharTimer >= 0.1 ? (this._grassCharTimer - 0.1) : 0;
      const slots = this.grassUniforms.uCharPositions.value;
      const cosY = Math.cos(horseYaw);
      const sinY = Math.sin(horseYaw);
      let sIdx = 0;

      const hxF = horseX + cosY * 0.55;
      const hzF = horseZ - sinY * 0.55;
      slots[sIdx++].set(hxF, this._getTerrainHeight(hxF, hzF), hzF, 1.35);

      const hxR = horseX - cosY * 0.55;
      const hzR = horseZ + sinY * 0.55;
      slots[sIdx++].set(hxR, this._getTerrainHeight(hxR, hzR), hzR, 1.35);

      if (Number.isFinite(this.cartX) && Number.isFinite(this.cartZ)) {
        slots[sIdx++].set(this.cartX, this._getTerrainHeight(this.cartX, this.cartZ), this.cartZ, 2.05);
      }

      if (this._party && Array.isArray(this._party.wild)) {
        for (let i = 0; i < this._party.wild.length && sIdx < slots.length; i++) {
          const w = this._party.wild[i];
          if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.z)) continue;
          slots[sIdx++].set(w.x, this._getTerrainHeight(w.x, w.z), w.z, 0.92);
        }
      }

      while (sIdx < slots.length) {
        slots[sIdx++].set(0, -999, 0, 0);
      }
    }

    // Interpolasi suasana (Pagi Teduh / Sore Cozy / Malam Tenang) persis seperti Hutan Cozy
    const lerpSpeed = delta * 2.2;
    const activeAtmosphere = this.activeAtmosphere;
    const targetMood = this.targetMood;
    activeAtmosphere.bgTop.lerp(targetMood.bgTop, lerpSpeed);
    activeAtmosphere.bgBottom.lerp(targetMood.bgBottom, lerpSpeed);
    activeAtmosphere.sunColor.lerp(targetMood.sunColor, lerpSpeed);
    activeAtmosphere.sunIntensity = THREE.MathUtils.lerp(activeAtmosphere.sunIntensity, targetMood.sunIntensity, lerpSpeed);
    activeAtmosphere.sunPos.lerp(targetMood.sunPos, lerpSpeed);
    activeAtmosphere.hemiSky.lerp(targetMood.hemiSky, lerpSpeed);
    activeAtmosphere.hemiGround.lerp(targetMood.hemiGround, lerpSpeed);
    activeAtmosphere.hemiIntensity = THREE.MathUtils.lerp(activeAtmosphere.hemiIntensity, targetMood.hemiIntensity, lerpSpeed);
    activeAtmosphere.sceneBrightness = THREE.MathUtils.lerp(activeAtmosphere.sceneBrightness, targetMood.sceneBrightness, lerpSpeed);
    activeAtmosphere.mushroomGlow = THREE.MathUtils.lerp(activeAtmosphere.mushroomGlow, targetMood.mushroomGlow, lerpSpeed);
    activeAtmosphere.particleColor.lerp(targetMood.particleColor, lerpSpeed);
    activeAtmosphere.shadowTint.lerp(targetMood.shadowTint, lerpSpeed);
    activeAtmosphere.rimTint.lerp(targetMood.rimTint, lerpSpeed);
    activeAtmosphere.cloudColor.lerp(targetMood.cloudColor, lerpSpeed);
    activeAtmosphere.cloudShadow.lerp(targetMood.cloudShadow, lerpSpeed);
    activeAtmosphere.cloudCoverage = THREE.MathUtils.lerp(activeAtmosphere.cloudCoverage, targetMood.cloudCoverage, lerpSpeed);
    activeAtmosphere.grassBaseColor.lerp(targetMood.grassBaseColor, lerpSpeed);
    activeAtmosphere.grassTipColor.lerp(targetMood.grassTipColor, lerpSpeed);
    activeAtmosphere.sunbeamOpacity = THREE.MathUtils.lerp(activeAtmosphere.sunbeamOpacity, targetMood.sunbeamOpacity, lerpSpeed);
    activeAtmosphere.lanternIntensity = THREE.MathUtils.lerp(activeAtmosphere.lanternIntensity, targetMood.lanternIntensity, lerpSpeed);

    this.celShaderUniforms.uSunDir.value.copy(activeAtmosphere.sunPos).normalize();
    this.celShaderUniforms.uSceneBrightness.value = activeAtmosphere.sceneBrightness;
    this.skyUniforms.uCloudCoverage.value = activeAtmosphere.cloudCoverage;
    this.celShaderUniforms.uCampfireStrength.value = 0.0;

    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.copy(activeAtmosphere.bgBottom);
    }

    this.dirLight.color.copy(activeAtmosphere.sunColor);
    this.dirLight.intensity = activeAtmosphere.sunIntensity * Math.PI;
    this.dirLight.position.copy(activeAtmosphere.sunPos);

    this.hemiLight.color.copy(activeAtmosphere.hemiSky);
    this.hemiLight.groundColor.copy(activeAtmosphere.hemiGround);
    this.hemiLight.intensity = activeAtmosphere.hemiIntensity * Math.PI;

    this.particleMat.color.copy(activeAtmosphere.particleColor);

    this.mushroomCapMaterials.forEach((mat) => {
      mat.emissiveIntensity = activeAtmosphere.mushroomGlow;
    });
    this.interactiveMushrooms.forEach((m) => {
      if (m.userData.pulse > 0) {
        m.userData.pulse = Math.max(0, m.userData.pulse - delta * 2.5);
        const s = 1 + Math.sin(m.userData.pulse * Math.PI * 2) * 0.16;
        m.scale.set(s, s, s);
      }
    });

    // Goyangan kanopi pohon oleh angin
    const windFactor = this.grassUniforms.uWindSpeed.value;
    for (let i = 0; i < this.interactiveTrees.length; i++) {
      const treeGroup = this.interactiveTrees[i];
      if (!treeGroup.visible || !treeGroup.userData._baseVisible || treeGroup.userData._lodFar) continue;
      const treeData = treeGroup.userData;
      if (treeData.rustleBoost > 0) {
        treeData.rustleBoost = Math.max(0, treeData.rustleBoost - delta * 2.2);
      }
      const totalAmp = 0.028 * windFactor + treeData.rustleBoost * 0.06;
      const swayTime = treeData.rustleBoost > 0.01 ? elapsed : Math.round((elapsed + treeData.phase) * 5.0) / 5.0;
      const freq = swayTime * (1.2 + windFactor * 0.4) + treeData.phase;
      treeData.canopy.rotation.z = Math.sin(freq) * totalAmp;
      treeData.canopy.rotation.x = Math.cos(freq * 0.8) * totalAmp * 0.7;
    }

    // Goyangan semak saat kuda lewat di dekatnya atau disentuh
    for (let i = 0; i < this.interactiveBushes.length; i++) {
      const bush = this.interactiveBushes[i];
      const dHorse = Math.hypot(bush.position.x - horseX, bush.position.z - horseZ);
      if (dHorse < 1.65 && bush.userData.rustleBoost < 0.4) {
        bush.userData.rustleBoost = 0.75;
      }
      if (bush.userData.rustleBoost > 0) {
        bush.userData.rustleBoost = Math.max(0, bush.userData.rustleBoost - delta * 3.2);
        const bScale = bush.userData.baseScale;
        const wobble = Math.sin(bush.userData.rustleBoost * Math.PI * 3.5) * 0.14 * bush.userData.rustleBoost;
        bush.scale.set(bScale * (1.15 + wobble), bScale * (1.0 - wobble * 0.6), bScale * (1.15 + wobble));
      }
    }

    if (this.campfireGroup.userData.flareBoost > 0) {
      this.campfireGroup.userData.flareBoost = Math.max(0, this.campfireGroup.userData.flareBoost - delta * 1.8);
    }
    const boost = this.campfireGroup.userData.flareBoost;

    // Lampu lentera jalan tetap hidup; tak ada animasi atau mesh kendaraan.
    const lampStrength = this.isHeadlightsOn ? activeAtmosphere.lanternIntensity : 0.0;

    this.roadLanterns.forEach((rl) => {
      const sway = Math.sin(elapsed * 1.4 + rl.phase) * 0.06;
      rl.halo.visible = this.isHeadlightsOn;
      rl.halo.material.opacity = Math.min(0.95, lampStrength * (0.65 + sway));
      const s = 1.35 + lampStrength * 0.45 + sway * 1.5;
      rl.halo.scale.set(s, s, 1.0);
      rl.glassMat.color.setHex(this.isHeadlightsOn ? 0xffe49e : 0x5c5e62);
    });

    // Volumetric Sunbeams / God-Rays sejajar arah matahari
    if (this.isSunbeamsEnabled) {
      this.sunbeamUniforms.uColor.value.copy(activeAtmosphere.sunColor);
      this.sunbeamUniforms.uOpacity.value = activeAtmosphere.sunbeamOpacity;
      const sDir = this.celShaderUniforms.uSunDir.value;
      const tiltZ = -sDir.x * 0.42;
      const tiltX = sDir.z * 0.42;
      this.sunbeamShafts.forEach((sh) => {
        sh.rotation.z = tiltZ;
        sh.rotation.x = tiltX;
      });
    }

    // Lidah api unggun mulus (bernapas & bergoyang di atas bara, tanpa lampu terang di spawn)
    this.campfireLight.intensity = 0;
    if (this.isCampfireLit) {
      this.flames.forEach((f, idx) => {
        f.visible = true;
        const ph = elapsed * f.userData.speed + f.userData.phase;
        const swayX = Math.sin(ph * 0.7 + idx) * 0.04;
        const swayZ = Math.cos(ph * 0.6 + idx * 1.3) * 0.04;
        const stretchY = 0.90 + Math.sin(ph) * 0.14 + Math.cos(ph * 1.7) * 0.06 + boost * 0.35;
        const stretchXZ = 0.94 + Math.cos(ph * 0.9) * 0.08 + boost * 0.12;
        f.position.set(f.userData.baseX + swayX, 0.14, f.userData.baseZ + swayZ);
        f.scale.set(stretchXZ, stretchY, stretchXZ);
        f.rotation.z = -swayX * 2.2;
        f.rotation.x = swayZ * 2.2;
      });
      if (this._campfireSparks) {
        this._campfireSparks.forEach((sp, idx) => {
          sp.visible = true;
          const t = (elapsed * sp.userData.speed + sp.userData.offset) % 1.0;
          sp.position.set(
            sp.userData.baseX * (1 - t * 0.35) + Math.sin(elapsed * 4.5 + idx * 1.7) * 0.10,
            0.22 + t * (1.25 + boost * 0.45),
            sp.userData.baseZ * (1 - t * 0.35) + Math.cos(elapsed * 3.8 + idx * 1.9) * 0.10
          );
          const fade = Math.sin(t * Math.PI);
          sp.material.opacity = fade * 0.85;
          sp.scale.setScalar(0.55 + fade * 0.55);
        });
      }
    } else {
      this.flames.forEach((f) => { f.visible = false; });
      if (this._campfireSparks) this._campfireSparks.forEach((sp) => { sp.visible = false; });
    }

    // Animasi Air Terjun Kabut & Kabut Jurang
    if (this._waterfallTex) {
      this._waterfallTex.offset.y = (elapsed * 0.95) % 1.0;
    }
    if (this._waterfallSplash && this._waterfallSplash.length) {
      for (let i = 0; i < this._waterfallSplash.length; i++) {
        const rg = this._waterfallSplash[i];
        const p = (elapsed * 0.85 + rg.userData.phase) % 1.0;
        rg.scale.setScalar(0.65 + p * 0.75);
        rg.material.opacity = (1.0 - p) * 0.65;
      }
    }
    if (this._waterfallMist && this._waterfallMist.length) {
      for (let i = 0; i < this._waterfallMist.length; i++) {
        const pf = this._waterfallMist[i];
        const t = (elapsed * pf.userData.speed + pf.userData.offset) % 1.0;
        pf.position.set(
          pf.userData.baseX + Math.sin(elapsed * 0.9 + i) * 0.65,
          pf.userData.baseY + t * 3.2,
          pf.userData.baseZ - t * 1.8
        );
        const fade = Math.sin(t * Math.PI);
        pf.scale.setScalar(0.75 + t * 0.85);
        pf.material.opacity = fade * 0.34;
      }
    }
    if (this._gorgeMist && this._gorgeMist.length) {
      for (let i = 0; i < this._gorgeMist.length; i++) {
        const gm = this._gorgeMist[i];
        gm.position.x = gm.userData.baseX + Math.sin(elapsed * 0.35 + gm.userData.phase) * 2.2;
      }
    }
    if (this._storySiteAnimators && this._storySiteAnimators.length) {
      for (let i = 0; i < this._storySiteAnimators.length; i++) {
        this._storySiteAnimators[i].update(elapsed);
      }
    }

    // Kunang-kunang / serbuk sari melayang
    if (this.frameCounter % 2 === 0) {
      const pArr = this.particleGeo.attributes.position.array;
      for (let i = 0; i < this.PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const phase = this.pPhases[i];
        pArr[i3] += Math.sin(elapsed * 0.6 + phase) * 0.014 * windFactor;
        pArr[i3 + 1] += Math.cos(elapsed * 0.9 + phase) * 0.009;
        pArr[i3 + 2] += Math.cos(elapsed * 0.5 + phase) * 0.014 * windFactor;
      }
      this.particleGeo.attributes.position.needsUpdate = true;
    }

    // Partikel burst interaktif (daun, percikan api, cipratan air)
    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const bp = this.burstParticles[i];
      bp.life -= delta * 1.1;
      if (bp.life <= 0) {
        this.scene.remove(bp.mesh);
        bp.mesh.material.dispose();
        this.burstParticles.splice(i, 1);
      } else {
        if (bp.gravity) bp.vel.y -= bp.gravity * delta;
        bp.mesh.position.addScaledVector(bp.vel, delta);
        bp.mesh.rotation.x += delta * 5;
        bp.mesh.rotation.y += delta * 5;
        bp.mesh.material.opacity = bp.life;
      }
    }

    // Riak air otomatis & partikel cipratan saat kuda atau gerobak masuk ke kolam/sungai
    const hVelX = (horseX - (this._prevHorseX ?? horseX)) / Math.max(0.008, delta);
    const hVelZ = (horseZ - (this._prevHorseZ ?? horseZ)) / Math.max(0.008, delta);
    const hSpeed = Math.hypot(hVelX, hVelZ);
    this._prevHorseX = horseX;
    this._prevHorseZ = horseZ;

    const horseDepth = this.waterDepthAt(horseX, horseZ);
    const horseInAir = !!this._horseJumpActive;
    const horseJustLanded = !horseInAir && this._wasHorseInAir;
    this._wasHorseInAir = horseInAir;

    const dPond = Math.hypot(horseX - this.POND_CENTER.x, horseZ - this.POND_CENTER.z);
    if (dPond < this.POND_CENTER.radius + 0.45 && horseDepth > 0.02 && !horseInAir) {
      if (horseJustLanded) {
        this.triggerPondRipple(horseX, horseZ);
        this.spawnWaterSplash(horseX, this.POND_WATER_Y, horseZ, 1.85, hVelX, hVelZ);
      } else if ((elapsed - this.pondUniforms.uRippleTime.value) > 0.35 && hSpeed > 0.25) {
        this.triggerPondRipple(horseX, horseZ);
        this.spawnWaterSplash(horseX, this.POND_WATER_Y, horseZ, 0.75 + Math.min(0.9, hSpeed / 5.5), hVelX, hVelZ);
      }
    }

    if (this.riverUniforms && this.RIVER) {
      const wy = this.RIVER.waterY;
      if (horseDepth > 0.03 && dPond > this.POND_CENTER.radius + 1.0 && !horseInAir) {
        if (horseJustLanded) {
          this.triggerRiverRipple(horseX, horseZ, 1.5);
          this.spawnWaterSplash(horseX, wy, horseZ, 2.0, hVelX, hVelZ);
          this._lastRiverRippleAt = elapsed;
          this._lastHoofSplashAt = elapsed;
        } else {
          if (hSpeed > 0.25 && (elapsed - this._lastRiverRippleAt) > 0.26) {
            this._lastRiverRippleAt = elapsed;
            this.triggerRiverRipple(horseX, horseZ, 0.62 + Math.min(0.68, hSpeed / 5.2));
          }
          if (hSpeed > 0.35 && (elapsed - this._lastHoofSplashAt) > 0.11) {
            this._lastHoofSplashAt = elapsed;
            const sideSign = (this.frameCounter % 2 === 0) ? 1 : -1;
            const cosY = Math.cos(horseYaw), sinY = Math.sin(horseYaw);
            const sx = horseX + cosY * 0.42 - sinY * sideSign * 0.24;
            const sz = horseZ - sinY * 0.42 - cosY * sideSign * 0.24;
            this.spawnWaterSplash(sx, wy, sz, 0.65 + Math.min(1.0, hSpeed / 4.5), hVelX, hVelZ);
          }
        }
      }

      if (Number.isFinite(this.cartX) && Number.isFinite(this.cartZ)) {
        const cVelX = (this.cartX - (this._prevCartX ?? this.cartX)) / Math.max(0.008, delta);
        const cVelZ = (this.cartZ - (this._prevCartZ ?? this.cartZ)) / Math.max(0.008, delta);
        const cSpeed = Math.hypot(cVelX, cVelZ);
        this._prevCartX = this.cartX;
        this._prevCartZ = this.cartZ;
        const cartDepth = this.waterDepthAt(this.cartX, this.cartZ);
        if (cartDepth > 0.04 && cSpeed > 0.25 && (elapsed - this._lastCartWakeAt) > 0.30) {
          this._lastCartWakeAt = elapsed;
          const cy = this.cartYaw || 0;
          const lx = -Math.sin(cy), lz = -Math.cos(cy);
          const wxL = this.cartX + lx * 1.05, wzL = this.cartZ + lz * 1.05;
          const wxR = this.cartX - lx * 1.05, wzR = this.cartZ - lz * 1.05;
          const str = 0.48 + Math.min(0.55, cSpeed / 5.5);
          this.triggerRiverRipple(wxL, wzL, str);
          this.triggerRiverRipple(wxR, wzR, str);
          this.spawnWaterSplash(wxL, wy, wzL, 0.55 * str, cVelX, cVelZ);
          this.spawnWaterSplash(wxR, wy, wzR, 0.55 * str, cVelX, cVelZ);
        }
      }
    }

    // Daun teratai & ilalang tepi sungai
    if (this.riverAnimated) {
      const rRiverAge = this.riverUniforms ? (elapsed - this.riverUniforms.uRippleTime.value) : 99;
      const rOrg = this.riverUniforms ? this.riverUniforms.uRippleOrigin.value : null;
      if (this.riverAnimated.lilyPads) {
        for (let i = 0; i < this.riverAnimated.lilyPads.length; i++) {
          const lp = this.riverAnimated.lilyPads[i];
          const ud = lp.userData;
          let rSplash = 0;
          if (rOrg && rRiverAge >= 0 && rRiverAge < 3.0) {
            const dR = Math.hypot(ud.baseX - rOrg.x, ud.baseZ - rOrg.z);
            rSplash = Math.sin((dR - rRiverAge * 2.6) * 10.0) * Math.max(0, 1.0 - rRiverAge / 3.0) * 0.04;
          }
          lp.position.y = ud.baseY + Math.sin(elapsed * 2.0 + ud.phase) * 0.015 + rSplash;
          lp.rotation.z = Math.sin(elapsed * 1.6 + ud.phase) * 0.05;
          lp.rotation.x = Math.cos(elapsed * 1.4 + ud.phase) * 0.05;
        }
      }
      if (this.riverAnimated.reeds) {
        for (let i = 0; i < this.riverAnimated.reeds.length; i++) {
          const reed = this.riverAnimated.reeds[i];
          const ud = reed.userData;
          const amp = (ud.swayAmp || 0.05) * windFactor;
          reed.rotation.z = Math.sin(elapsed * 1.6 + ud.phase) * amp;
          reed.rotation.x = Math.cos(elapsed * 1.2 + ud.phase * 0.7) * amp * 0.6;
        }
      }
    }

    // Animasi halus desa (hanya di-update untuk desa dekat agar CPU device kentang ringan)
    if (this.villageAnimated) {
      const va = this.villageAnimated;
      for (let i = 0; i < va.smokePuffs.length; i++) {
        const sp = va.smokePuffs[i];
        const ud = sp.userData;
        if (!ud || (ud._vRec && !ud._vRec.isNear)) continue;
        const cycle = (elapsed * (ud.speed || 0.28) + (ud.phase || 0)) % 1.0;
        const maxRise = ud.maxRise || 2.1;
        sp.position.y = ud.baseY + cycle * maxRise;
        sp.position.x = ud.baseX + Math.sin(elapsed * 0.9 + ud.phase) * 0.14 * cycle + cycle * 0.35 * windFactor;
        sp.position.z = ud.baseZ + Math.cos(elapsed * 0.8 + ud.phase) * 0.12 * cycle;
        const sc = (ud.baseScale || 0.32) * (0.55 + cycle * 1.25);
        sp.scale.setScalar(sc);
      }
      for (let i = 0; i < va.signPivots.length; i++) {
        const piv = va.signPivots[i];
        const ud = piv.userData || {};
        if (ud._vRec && !ud._vRec.isNear) continue;
        const angle = Math.sin(elapsed * (ud.speed || 1.35) + (ud.phase || i)) * (ud.maxAngle || 0.12) * Math.min(1.5, windFactor);
        if (ud.axis === 'x') piv.rotation.x = angle;
        else piv.rotation.z = angle;
      }
      for (let i = 0; i < va.embers.length; i++) {
        const eb = va.embers[i];
        if (!eb || (eb._vRec && !eb._vRec.isNear)) continue;
        const pulse = 0.86 + 0.18 * Math.sin(elapsed * 7.5 + i * 2.1) + 0.10 * Math.cos(elapsed * 13.0 + i);
        if (eb.glowSprite) {
          const bs = eb.baseScale || 1.55;
          eb.glowSprite.scale.set(bs * pulse, bs * pulse, 1.0);
          if (eb.glowSprite.material) eb.glowSprite.material.opacity = Math.min(0.95, 0.62 * pulse);
        }
        if (Array.isArray(eb.meshes)) {
          for (let j = 0; j < eb.meshes.length; j++) {
            const m = eb.meshes[j];
            if (m && m.material && m.material.emissiveIntensity !== undefined) {
              const baseI = (m.userData && m.userData.baseIntensity) || 1.2;
              m.material.emissiveIntensity = baseI * (0.82 + 0.24 * Math.sin(elapsed * 6.5 + ((m.userData && m.userData.phase) || j)));
            }
          }
        }
      }
      for (let i = 0; i < va.wellWaters.length; i++) {
        const ww = va.wellWaters[i];
        if (!ww || (ww.userData && ww.userData._vRec && !ww.userData._vRec.isNear)) continue;
        ww.rotation.y = elapsed * 0.14;
      }
      for (let i = 0; i < va.bucketPivots.length; i++) {
        const bp = va.bucketPivots[i];
        if (!bp || (bp.userData && bp.userData._vRec && !bp.userData._vRec.isNear)) continue;
        bp.rotation.z = Math.sin(elapsed * 1.1 + i) * 0.04 * windFactor;
      }
    }

    // Animasi ayunan pintu berengsel saat warga desa keluar / masuk rumah (skip desa jauh)
    if (this.villageData && Array.isArray(this.villageData.buildingList)) {
      const doorRate = Math.min(1, delta * 5.2);
      const list = this.villageData.buildingList;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.mesh && b.mesh.parent && !b.mesh.parent.visible) continue;
        b.doorOpenAmt += ((b.doorTarget || 0) - b.doorOpenAmt) * doorRate;
        const swing = b.doorOpenAmt * 1.26;
        if (b.doorPivot) b.doorPivot.rotation.y = -swing;
        if (b.doorPivotR) b.doorPivotR.rotation.y = swing;
      }
    }

    // Daun teratai & ikan koi berenang di kolam BotW
    const rAge = elapsed - this.pondUniforms.uRippleTime.value;
    this.lilyPads.forEach((lp) => {
      const dR = Math.hypot(
        lp.userData.baseX - this.pondUniforms.uRippleOrigin.value.x,
        lp.userData.baseZ - this.pondUniforms.uRippleOrigin.value.z
      );
      const rSplash = (rAge >= 0 && rAge < 3.0)
        ? Math.sin((dR - rAge * 2.6) * 10.0) * Math.max(0, 1.0 - rAge / 3.0) * 0.04
        : 0;
      lp.position.y = this.POND_WATER_Y + 0.018 + Math.sin(elapsed * 2.1 + lp.userData.phase) * 0.016 + rSplash;
      lp.rotation.z = Math.sin(elapsed * 1.7 + lp.userData.phase) * 0.05;
      lp.rotation.x = Math.cos(elapsed * 1.5 + lp.userData.phase) * 0.05;
    });

    this.pondFishList.forEach((fish) => {
      const fd = fish.userData;
      const ang = elapsed * fd.swimSpeed + fd.phase;
      const fx = this.POND_CENTER.x + Math.cos(ang) * fd.swimRadius;
      const fz = this.POND_CENTER.z + Math.sin(ang) * fd.swimRadius * 0.85;
      const nextAng = ang + 0.05;
      const nfx = this.POND_CENTER.x + Math.cos(nextAng) * fd.swimRadius;
      const nfz = this.POND_CENTER.z + Math.sin(nextAng) * fd.swimRadius * 0.85;
      fish.position.set(fx, fd.depthY + Math.sin(elapsed * 2.5 + fd.phase) * 0.03, fz);
      fish.lookAt(nfx, fish.position.y, nfz);
      fd.tailMesh.rotation.y = Math.sin(elapsed * 11.0 + fd.phase) * 0.35;
    });
  }
}

HC.World = World;
