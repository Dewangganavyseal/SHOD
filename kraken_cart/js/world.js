/* ============================================================================
   SHOD — WORLD HUTAN COZY INTERAKTIF 3D (Port 1:1 dari "Hutan Cozy Interaktif 3D (2).html")
   Seluruh terrain 36-chunk, jalan tanah berkelok, kolam BotW (Voronoi caustics,
   batu, teratai, ilalang, ikan koi), api unggun, pagar kayu, papan petunjuk,
   lentera jalan, truk pickup merah, pohon pinus BotW & pohon daun Truckful,
   semak beri/bunga, rumpun rumput 4-bilah + bunga liar, jamur menyala, kunang-kunang,
   god-rays matahari, interaksi lingkungan, audio prosedural, langit berawan FBM,
   dan 3 suasana (Pagi / Sore / Malam).
   ============================================================================ */
import { HC } from './hc.js';
import './voxel.js';
import MAP from './map.js';

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
      potato:   { label: 'Kentang',  pixelRatio: 1.0,  cullDistance: 30.0, grassRatio: 0.30 },
      medium:   { label: 'Menengah', pixelRatio: 1.25, cullDistance: 52.0, grassRatio: 0.62 },
      high:     { label: 'Ultra PC', pixelRatio: 2.0,  cullDistance: 84.0, grassRatio: 1.0  },
      // alias lama supaya kode/probe yang masih menyebut nama ini tetap jalan
      mobile:   { label: 'Kentang',  pixelRatio: 1.0,  cullDistance: 30.0, grassRatio: 0.30 },
      balanced: { label: 'Menengah', pixelRatio: 1.25, cullDistance: 52.0, grassRatio: 0.62 },
      ultra:    { label: 'Ultra PC', pixelRatio: 2.0,  cullDistance: 84.0, grassRatio: 1.0  }
    };
    let currentPerfMode = QUALITY ? QUALITY.key : (isMobileDevice ? 'medium' : 'high');
    this._quality = QUALITY;

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
                bgTop: new THREE.Color(0x061021),
                bgBottom: new THREE.Color(0x143047),
                sunColor: new THREE.Color(0x7ab8de),
                sunIntensity: 0.42,
                sunPos: new THREE.Vector3(-18, 24, -20),
                hemiSky: new THREE.Color(0x224861),
                hemiGround: new THREE.Color(0x0e2420),
                hemiIntensity: 0.30,
                sceneBrightness: 0.48,
                mushroomGlow: 2.0,
                particleColor: new THREE.Color(0xd2f58c),
                shadowTint: new THREE.Color(0x0e1d33),
                rimTint: new THREE.Color(0x67c9e0),
                cloudColor: new THREE.Color(0x2c4e69),
                cloudShadow: new THREE.Color(0x112233),
                cloudCoverage: 0.50,
                grassBaseColor: new THREE.Color(0x0f382e),
                grassTipColor: new THREE.Color(0x2b785c),
                sunbeamOpacity: 0.06,
                lanternIntensity: 1.35
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
            uCampfireStrength: { value: 1.0 }
        };

        function applyStylizedCelShading(material, options = {}) {
            const rimStrength = options.rimStrength !== undefined ? options.rimStrength : 0.13;
            const shadowLift = options.shadowLift !== undefined ? options.shadowLift : 0.60;

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
                        varying vec3 vCelWorldPos;
                        varying vec3 vCelWorldNormal;
                    ` + shader.fragmentShader;

                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <tonemapping_fragment>',
                        `
                        vec3 N = normalize(vCelWorldNormal);
                        vec3 L = normalize(uSunDir);
                        vec3 V = normalize(cameraPosition - vCelWorldPos);

                        float halfLambert = dot(N, L) * 0.5 + 0.5;
                        float band1 = smoothstep(0.24, 0.48, halfLambert);
                        float band2 = smoothstep(0.56, 0.82, halfLambert);
                        float toonStep = band1 * 0.60 + band2 * 0.40;

                        vec3 baseCol = diffuseColor.rgb * uSceneBrightness;
                        vec3 coolShadow = mix(baseCol * uShadowTint * 1.18, baseCol * 0.44, 0.46);
                        vec3 sunlitCol = baseCol * mix(vec3(1.0), uSunColor * 1.04, 0.24);
                        vec3 celColor = mix(coolShadow, sunlitCol, toonStep);

                        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * smoothstep(0.18, 0.85, N.y * 0.5 + 0.5);
                        celColor += uRimTint * rim * uRimStrength * uSceneBrightness;

                        // Honor directional shadow map smoothly without crushing brightness at calmer light levels
                        float expectedBase = max(length(diffuseColor.rgb) * uSceneBrightness * 0.85, 0.001);
                        float engineLightRatio = clamp(length(outgoingLight) / expectedBase, 0.25, 1.25);
                        float castShadowMask = smoothstep(0.30, 0.62, engineLightRatio);
                        outgoingLight = mix(coolShadow * 0.90, celColor, castShadowMask);

                        // Campfire warm bounce light (no expensive 6-pass cubemap shadow!)
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

        const skyDome = new THREE.Mesh(new THREE.SphereGeometry(120, 28, 20), skyDomeMat);
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
        const TERRAIN_SIZE = 76;
        const CHUNK_GRID = 6;
        const CHUNK_SIZE = TERRAIN_SIZE / CHUNK_GRID;
        const POND_CENTER = { x: 8.2, z: 6.2, radius: 4.5 };

        // Winding cozy Truckful countryside dirt road path
        function getRoadCenterX(z) {
            return -5.4 + Math.sin(z * 0.095 + 0.35) * 1.65 + Math.cos(z * 0.045) * 0.55;
        }

        function getRoadTangentAngle(z) {
            const dx = Math.cos(z * 0.095 + 0.35) * 1.65 * 0.095 - Math.sin(z * 0.045) * 0.55 * 0.045;
            return Math.atan2(dx, 1.0);
        }

        function getRoadDistance(x, z) {
            const ang = getRoadTangentAngle(z);
            return Math.abs(x - getRoadCenterX(z)) * Math.cos(ang);
        }

        function smoothstepJS(edge0, edge1, x) {
            const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
            return t * t * (3.0 - 2.0 * t);
        }

        function getTerrainHeight(x, z) {
            // Rolling cozy storybook meadow hills
            let h = Math.sin(x * 0.075) * Math.cos(z * 0.075) * 1.45
                  + Math.sin(x * 0.14 + z * 0.11) * 0.45
                  + Math.cos(x * 0.04 - z * 0.06) * 0.72;

            // Gentle valley amphitheater rise toward the outer edges
            const distOrigin = Math.hypot(x, z);
            h += smoothstepJS(16.0, 38.0, distOrigin) * 2.4;

            // Flatten central campfire clearing smoothly
            const clearingFlatten = 1.0 - smoothstepJS(2.2, 6.2, distOrigin);
            h = THREE.MathUtils.lerp(h, 0.18, clearingFlatten * 0.85);

            // Smoothly grade the Truckful dirt road & carve subtle twin wheel tracks
            const roadDist = getRoadDistance(x, z);
            const roadFlatten = 1.0 - smoothstepJS(1.8, 4.4, roadDist);
            const roadBaseY = 0.24 + Math.sin(z * 0.07) * 0.32;
            h = THREE.MathUtils.lerp(h, roadBaseY, roadFlatten * 0.78);
            const rutMask = Math.exp(-Math.pow((roadDist - 0.78) / 0.32, 2.0));
            h -= rutMask * 0.055;

            // Carve crystal-clear BotW pond basin smoothly below water surface (-0.30)
            const distPond = Math.hypot(x - POND_CENTER.x, z - POND_CENTER.z);
            const pondShoreBlend = 1.0 - smoothstepJS(POND_CENTER.radius * 0.25, POND_CENTER.radius + 1.9, distPond);
            if (pondShoreBlend > 0.001) {
                const basinDepth = -1.62 + smoothstepJS(0.0, POND_CENTER.radius, distPond) * 1.38;
                h = THREE.MathUtils.lerp(h, basinDepth, pondShoreBlend);
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
                "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                "    float a = radians(angleDeg);",
                "    float c = cos(a);",
                "    float s = sin(a);",
                "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                "}",
                "float dylearnCloudNoise(vec3 wp) {",
                "    float t = (uCloudWorldY - wp.y) / max(uSunDir.y, 0.18);",
                "    vec3 hitPos = wp + t * uSunDir;",
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
                    'float flNoise2 = texture2D(uAlbedo2Noise, vTerrainWorldPos.xz * uAlbedo2Scale).r;',
                    'float flNoise3 = texture2D(uAlbedo3Noise, vTerrainWorldPos.xz * uAlbedo3Scale).r;',
                    'vec3 flPatchCol = uAlbedo1;',
                    'if (flNoise2 > uAlbedo2Threshold) flPatchCol = uAlbedo2;',
                    'if (flNoise3 > uAlbedo3Threshold) flPatchCol = uAlbedo3;',
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

        for (let gz = 0; gz < CHUNK_GRID; gz++) {
            for (let gx = 0; gx < CHUNK_GRID; gx++) {
                const cx = -TERRAIN_SIZE * 0.5 + (gx + 0.5) * CHUNK_SIZE;
                const cz = -TERRAIN_SIZE * 0.5 + (gz + 0.5) * CHUNK_SIZE;

                const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
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

                    // Winding Truckful country dirt road + darker wheel ruts
                    const roadDist = getRoadDistance(vx, vz);
                    const roadFactor = 1.0 - smoothstepJS(1.35, 2.35, roadDist);
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

                    let meadowMask = 1.0;
                    meadowMask *= (1.0 - campFactor * 0.92);
                    meadowMask *= (1.0 - roadFactor * 0.98);
                    meadowMask *= (1.0 - shoreFactor * 0.96);
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
        //     - 4-Blade Fanned Chunky Painterly Grass Tuft Geometry (Soft Meadow Look)
        //     - Organic Meadow Color Patches & Ground-Root Blending (Zero Spiky Look)
        //     - Tangent-Space (TBN) Alignment, Scrolling _WindMap & Real-time _GrassMap
        // ============================================================================
        const GRASS_MAP_SIZE = 256;
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
            const rPx = (worldRadius / TERRAIN_SIZE) * GRASS_MAP_SIZE;

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
            // Smooth natural falloff around campfire clearing & pond shoreline
            paintGrassVisibilityCircle(0, 0, 3.3, 0.0);
            paintGrassVisibilityCircle(POND_CENTER.x, POND_CENTER.z, POND_CENTER.radius + 0.9, 0.0);

            // Clear lush grass cleanly along the winding Truckful country dirt road
            for (let z = -TERRAIN_SIZE * 0.48; z <= TERRAIN_SIZE * 0.48; z += 1.4) {
                const rx = getRoadCenterX(z);
                paintGrassVisibilityCircle(rx, z, 2.35, 0.0);
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
                "vec2 dylearnRotateVec2(vec2 v, float angleDeg) {",
                "    float a = radians(angleDeg);",
                "    float c = cos(a);",
                "    float s = sin(a);",
                "    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);",
                "}",
                "float dylearnCloudNoise(vec3 wp) {",
                "    float t = (uCloudWorldY - wp.y) / max(uSunDir.y, 0.18);",
                "    vec3 hitPos = wp + t * uSunDir;",
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
                    'float grN2 = texture2D(uAlbedo2Noise, vRootWorldPos.xz * uAlbedo2Scale).r;',
                    'float grN3 = texture2D(uAlbedo3Noise, vRootWorldPos.xz * uAlbedo3Scale).r;',
                    'vec3 grassCol = uAlbedo1;',
                    'if (grN2 > uAlbedo2Threshold) grassCol = uAlbedo2;',
                    'if (grN3 > uAlbedo3Threshold) grassCol = uAlbedo3;',
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
        const TARGET_TUFTS_PER_CHUNK = 2200;
        const grassDummy = new THREE.Object3D();

        for (let gz = 0; gz < CHUNK_GRID; gz++) {
            for (let gx = 0; gx < CHUNK_GRID; gx++) {
                const minX = -TERRAIN_SIZE * 0.5 + gx * CHUNK_SIZE;
                const minZ = -TERRAIN_SIZE * 0.5 + gz * CHUNK_SIZE;
                const cx = minX + CHUNK_SIZE * 0.5;
                const cz = minZ + CHUNK_SIZE * 0.5;

                const validQuads = [];
                for (let b = 0; b < TARGET_TUFTS_PER_CHUNK; b++) {
                    const bx = minX + Math.random() * CHUNK_SIZE;
                    const bz = minZ + Math.random() * CHUNK_SIZE;

                    const distPond = Math.hypot(bx - POND_CENTER.x, bz - POND_CENTER.z);
                    if (distPond < POND_CENTER.radius - 0.15) continue;

                    const by = getTerrainHeight(bx, bz);
                    if (distPond < POND_CENTER.radius + 0.35 && by < -0.22) continue;

                    const roadDist = getRoadDistance(bx, bz);
                    if (roadDist < 1.70) continue;
                    if (Math.hypot(bx, bz) < 2.2) continue;

                    const roadsideBoost = (roadDist > 2.25 && roadDist < 4.2) ? 1.15 : 1.0;
                    const n = getTerrainNormal(bx, bz);
                    const locSeed = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453) % 1.0;
                    validQuads.push({
                        x: bx, y: by - 0.02, z: bz,
                        nx: n.x, ny: n.y, nz: n.z,
                        seed1: Math.random(),
                        seed2: Math.random(),
                        locSeed,
                        sizeScale: (0.86 + Math.random() * 0.30) * roadsideBoost
                    });
                }

                if (validQuads.length === 0) continue;

                const instGeo = BASE_GRASS_QUAD_GEO.clone();
                const count = validQuads.length;
                const normalArr = new Float32Array(count * 3);
                const dataArr = new Float32Array(count * 4);

                for (let i = 0; i < count; i++) {
                    const vq = validQuads[i];
                    normalArr[i * 3] = vq.nx;
                    normalArr[i * 3 + 1] = vq.ny;
                    normalArr[i * 3 + 2] = vq.nz;

                    dataArr[i * 4] = vq.seed1;
                    dataArr[i * 4 + 1] = vq.seed2;
                    dataArr[i * 4 + 2] = vq.locSeed;
                    dataArr[i * 4 + 3] = vq.sizeScale;
                }

                instGeo.setAttribute('aTerrainNormal', new THREE.InstancedBufferAttribute(normalArr, 3));
                instGeo.setAttribute('aGrassData', new THREE.InstancedBufferAttribute(dataArr, 4));

                const instMesh = new THREE.InstancedMesh(instGeo, grassMat, count);
                for (let i = 0; i < count; i++) {
                    const vq = validQuads[i];
                    grassDummy.position.set(vq.x, vq.y, vq.z);
                    grassDummy.rotation.set(0, 0, 0);
                    grassDummy.scale.set(1, 1, 1);
                    grassDummy.updateMatrix();
                    instMesh.setMatrixAt(i, grassDummy.matrix);
                }
                instMesh.instanceMatrix.needsUpdate = true;
                instMesh.castShadow = false;
                instMesh.receiveShadow = true;
                instMesh.frustumCulled = false;

                const centerY = getTerrainHeight(cx, cz) + 0.55;
                instMesh.userData = {
                    maxCount: count,
                    boundingSphere: new THREE.Sphere(new THREE.Vector3(cx, centerY, cz), CHUNK_SIZE * 0.85)
                };
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
                    "    float t = (uCloudWorldY - wp.y) / max(uSunDir.y, 0.18);",
                    "    vec3 hitPos = wp + t * uSunDir;",
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
            const cShadow = hexToRgbBytes(palette.shadow);
            const cBase = hexToRgbBytes(palette.base);
            const cMid = hexToRgbBytes(palette.mid);
            const cTip = hexToRgbBytes(palette.tip);
            const cHi = hexToRgbBytes(palette.highlight);
            return createPixelFoliageTexture(32, ({ stampPixelLeaf }) => {
                let s = 31337;
                const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
                const rootX = 15.5;
                const rootY = 29.0;
                for (let i = -3; i <= 3; i++) {
                    const frac = i / 3;
                    const ang = frac * 0.82;
                    const len = (21 - Math.abs(frac) * 6.5) + rand() * 1.5;
                    stampPixelLeaf(rootX + frac * 1.8, rootY - 0.8, len, 4.4, ang, cShadow, cBase);
                }
                for (let i = -4; i <= 4; i++) {
                    const frac = i / 4;
                    const ang = frac * 0.92 + (rand() - 0.5) * 0.08;
                    const len = (24 - Math.abs(frac) * 7.5) + rand() * 1.8;
                    stampPixelLeaf(rootX + frac * 2.2, rootY - 1.8, len, 3.4, ang, cBase, cMid);
                }
                for (let i = -3; i <= 3; i++) {
                    const frac = i / 3;
                    const ang = frac * 0.80 + (rand() - 0.5) * 0.1;
                    const baseDist = 8.2 + (1.0 - Math.abs(frac)) * 5.2;
                    const fx = rootX + Math.sin(ang) * baseDist;
                    const fy = rootY - 2.2 - Math.cos(ang) * baseDist;
                    const len = 9.5 + (1.0 - Math.abs(frac)) * 4.0 + rand() * 1.6;
                    stampPixelLeaf(fx, fy, len, 2.5, ang, cMid, (i % 2 === 0) ? cHi : cTip);
                }
            });
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
                    "    float t = (uCloudWorldY - wp.y) / max(uSunDir.y, 0.18);",
                    "    vec3 hitPos = wp + t * uSunDir;",
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
                alphaTest: 0.44,
                side: THREE.DoubleSide,
                roughness: 0.88,
                metalness: 0.0
            });
            mat.onBeforeCompile = injectBranchSocketWindShader;
            pineMaterials[key] = mat;

            const depthMat = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map: tex,
                alphaTest: 0.44
            });
            depthMat.onBeforeCompile = injectBranchSocketWindShader;
            pineDepthMaterials[key] = depthMat;
        });

        function createStylizedPineTree(x, z, scale = 1.0, variant = 'tall_alpine', colorKey = 'emerald') {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y - 0.08, z);

            const canopyPivot = new THREE.Group();
            group.add(canopyPivot);

            const configs = {
                tall_alpine: { h: 7.4, baseR: 0.26, topR: 0.04, startT: 0.20, tiers: 9, maxRadius: 2.05 },
                broad_woodland: { h: 6.2, baseR: 0.28, topR: 0.05, startT: 0.18, tiers: 8, maxRadius: 2.35 },
                high_canopy: { h: 8.2, baseR: 0.28, topR: 0.04, startT: 0.34, tiers: 8, maxRadius: 2.10 },
                young_bushy: { h: 4.8, baseR: 0.20, topR: 0.04, startT: 0.15, tiers: 7, maxRadius: 1.72 }
            };
            const cfg = configs[variant] || configs.tall_alpine;

            const bendX = (Math.random() - 0.5) * 0.38;
            const bendZ = (Math.random() - 0.5) * 0.38;
            const { mesh: trunkMesh, getSpineOffset } = createSculptedTrunkMesh(
                cfg.h, cfg.baseR, cfg.topR, bendX, bendZ, trunkMat
            );
            canopyPivot.add(trunkMesh);

            const padGeos = [];
            const dummy = new THREE.Object3D();
            const goldenAngle = 2.3999632;
            const treeSeed = Math.random() * 100.0;

            function stampPinePad(geoSrc, matrix, socketVec, tierAO, heightNorm, phaseSeed) {
                const g = geoSrc.clone().toNonIndexed();
                g.applyMatrix4(matrix);
                const pos = g.attributes.position;
                const count = pos.count;
                const sockArr = new Float32Array(count * 3);
                const projNArr = new Float32Array(count * 3);
                const infoArr = new Float32Array(count * 3);

                for (let v = 0; v < count; v++) {
                    const px = pos.getX(v);
                    const py = pos.getY(v);
                    const pz = pos.getZ(v);

                    sockArr[v * 3] = socketVec.x;
                    sockArr[v * 3 + 1] = socketVec.y;
                    sockArr[v * 3 + 2] = socketVec.z;

                    // Conical outward normal from trunk axis for unified, smooth BotW cel-shading
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

            // Build dense, overlapping spiral evergreen pine bough tiers with randomized natural yaw/pitch/roll
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

            // Natural pointed evergreen crown spire at top of trunk
            const topSpine = getSpineOffset(0.98);
            const topSocket = new THREE.Vector3(topSpine.x, cfg.h * 0.93, topSpine.z);
            dummy.position.copy(topSocket);
            dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
            dummy.scale.set(0.75, 0.88, 0.75);
            dummy.updateMatrix();
            stampPinePad(BASE_BOTW_PINE_SPIRE_GEO, dummy.matrix, topSocket, 0.98, 1.0, treeSeed + 9.4);

            const mergedFoliageGeo = mergeBufferGeometriesSimple(padGeos);
            const pal = PINE_PALETTES[colorKey] || PINE_PALETTES.emerald;
            const foliageMesh = new THREE.Mesh(mergedFoliageGeo, pineMaterials[colorKey] || pineMaterials.emerald);
            foliageMesh.customDepthMaterial = pineDepthMaterials[colorKey] || pineDepthMaterials.emerald;
            foliageMesh.castShadow = Math.hypot(x, z) < 26.0;
            foliageMesh.receiveShadow = true;
            foliageMesh.frustumCulled = false;
            canopyPivot.add(foliageMesh);

            group.scale.setScalar(scale);
            const centerH = cfg.h * scale * 0.52;
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
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + centerH, z), cfg.h * scale * 0.65)
            };
            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
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
                    "    float t = (uCloudWorldY - wp.y) / max(uSunDir.y, 0.18);",
                    "    vec3 hitPos = wp + t * uSunDir;",
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

        function createBotWDeciduousTree(x, z, scale = 1.0, colorKey = 'emerald') {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y - 0.08, z);

            const canopyPivot = new THREE.Group();
            group.add(canopyPivot);

            // Sculpted trunk + 4 forked wooden boughs reaching into the leafy crown
            const { mesh: trunkMesh, getSpineOffset } = createSculptedTrunkMesh(
                3.7, 0.34, 0.16, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, trunkMat
            );
            canopyPivot.add(trunkMesh);

            const forkTop = getSpineOffset(0.76);
            const boughDirs = [
                { yaw: 0.4, pitch: 0.62, len: 1.65 },
                { yaw: 2.0, pitch: 0.58, len: 1.55 },
                { yaw: 3.6, pitch: 0.66, len: 1.60 },
                { yaw: 5.1, pitch: 0.55, len: 1.50 }
            ];
            boughDirs.forEach(bd => {
                const bGeo = new THREE.CylinderGeometry(0.065, 0.13, bd.len, 6);
                bGeo.translate(0, bd.len * 0.5, 0);
                const bMesh = new THREE.Mesh(bGeo, trunkMat);
                bMesh.position.set(forkTop.x, 2.72, forkTop.z);
                bMesh.rotation.set(bd.pitch, bd.yaw, 0, 'YXZ');
                bMesh.castShadow = true;
                canopyPivot.add(bMesh);
            });

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

            group.scale.setScalar(scale);
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
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + 3.4 * scale, z), 3.6 * scale)
            };
            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
            return group;
        }

        // Hero Foreground & Midground Valley Trees framing the campfire, pond & Truckful road
        const heroTrees = [
            { x: -10.8, z: -2.6, s: 1.05, kind: 'deciduous', c: 'emerald' },
            { x: -11.6, z: 8.6, s: 0.96, kind: 'pine', v: 'broad_woodland', c: 'teal' },
            { x: 5.2, z: -7.8, s: 1.08, kind: 'deciduous', c: 'olive' },
            { x: 13.8, z: 3.4, s: 1.02, kind: 'pine', v: 'tall_alpine', c: 'emerald' },
            { x: 12.6, z: 10.6, s: 0.95, kind: 'deciduous', c: 'emerald' },
            { x: -0.6, z: -9.8, s: 1.12, kind: 'pine', v: 'tall_alpine', c: 'teal' },
            { x: 3.6, z: 12.2, s: 0.92, kind: 'pine', v: 'young_bushy', c: 'olive' },
            { x: -12.8, z: 2.8, s: 1.02, kind: 'pine', v: 'high_canopy', c: 'emerald' },
            { x: 9.8, z: -4.2, s: 0.98, kind: 'deciduous', c: 'teal' },
            { x: -10.2, z: 14.5, s: 0.94, kind: 'deciduous', c: 'olive' }
        ];
        heroTrees.forEach(ht => {
            if (getRoadDistance(ht.x, ht.z) < 3.2) return;
            if (ht.kind === 'deciduous') {
                createBotWDeciduousTree(ht.x, ht.z, ht.s, ht.c);
            } else {
                createStylizedPineTree(ht.x, ht.z, ht.s, ht.v, ht.c);
            }
        });

        const variantCycle = ['tall_alpine', 'deciduous', 'broad_woodland', 'deciduous', 'high_canopy', 'young_bushy'];
        const colorCycle = ['emerald', 'teal', 'olive', 'emerald'];

        for (let i = 0; i < 58; i++) {
            const angle = (i / 58) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
            const radius = 15.5 + Math.random() * 25;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            if (Math.abs(x) < 4.5 && z > 12 && z < 26) continue;
            if (Math.hypot(x - POND_CENTER.x, z - POND_CENTER.z) < POND_CENTER.radius + 2.8) continue;
            // Keep the Truckful dirt road open and lined nicely with trees on either side
            if (getRoadDistance(x, z) < 3.4) continue;

            const scale = 0.88 + Math.random() * 0.48;
            if (Math.random() < 0.08) {
                createStylizedDeadPine(x, z, scale * 1.05);
            } else {
                const v = variantCycle[i % variantCycle.length];
                const c = colorCycle[(i + Math.floor(i / 3)) % colorCycle.length];
                if (v === 'deciduous') {
                    createBotWDeciduousTree(x, z, scale, c);
                } else {
                    createStylizedPineTree(x, z, scale, v, c);
                }
            }
        }

        // Outer horizon forest ring framing the valley rim
        for (let i = 0; i < 28; i++) {
            const angle = (i / 28) * Math.PI * 2 + (Math.sin(i * 4.7) * 0.07);
            const radius = 30.5 + (i % 4) * 1.85;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (Math.hypot(x - POND_CENTER.x, z - POND_CENTER.z) < POND_CENTER.radius + 3.0) continue;
            if (getRoadDistance(x, z) < 3.6) continue;
            const scale = 0.95 + (i % 5) * 0.11;
            const v = variantCycle[(i + 1) % variantCycle.length];
            const c = colorCycle[(i + 2) % colorCycle.length];
            if (v === 'deciduous') {
                createBotWDeciduousTree(x, z, scale, c);
            } else {
                createStylizedPineTree(x, z, scale, v, c);
            }
        }

        // ============================================================================
        // 7. COZY CAMPFIRE, TENT LOGS & STYLIZED POND
        // ============================================================================
        const campfireGroup = new THREE.Group();
        const cfY = getTerrainHeight(0, 0);
        campfireGroup.position.set(0, cfY, 0);
        campfireGroup.userData = { type: 'campfire', flareBoost: 0 };
        scene.add(campfireGroup);

        const stoneRingMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.88 });
        applyStylizedCelShading(stoneRingMat);
        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (i % 2) * 0.05, 0), stoneRingMat);
            stone.position.set(Math.cos(ang) * 0.78, 0.1, Math.sin(ang) * 0.78);
            stone.scale.set(1.2, 0.75, 1.0);
            stone.rotation.y = ang;
            campfireGroup.add(stone);
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
        }

        // Seat logs near campfire
        const seatLogGeo = new THREE.CylinderGeometry(0.24, 0.26, 1.9, 8);
        seatLogGeo.rotateZ(Math.PI * 0.5);
        const seat1 = new THREE.Mesh(seatLogGeo, trunkMat);
        seat1.position.set(-2.2, getTerrainHeight(-2.2, 1.2) + 0.2, 1.2);
        seat1.rotation.y = 0.55;
        seat1.castShadow = true;
        scene.add(seat1);

        const flames = [];
        const flameColors = [0xff5400, 0xff9e00, 0xffea00];
        for (let i = 0; i < 6; i++) {
            const fMat = new THREE.MeshBasicMaterial({
                color: flameColors[i % flameColors.length],
                transparent: true,
                opacity: 0.88
            });
            const fMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.26 - i * 0.02, 0), fMat);
            const ang = (i / 6) * Math.PI * 2;
            fMesh.userData = {
                baseX: Math.cos(ang) * 0.14,
                baseZ: Math.sin(ang) * 0.14,
                speed: 1.4 + (i % 3) * 0.45,
                offset: i * 0.37
            };
            campfireGroup.add(fMesh);
            flames.push(fMesh);
        }

        // PointLight WITHOUT shadow map (avoids 6x cubemap shadow pass on Mali-G57!)
        const campfireLight = new THREE.PointLight(0xff8c2b, 2.5 * Math.PI, 15, 0);
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

        const pondUniforms = {
            uTime: celShaderUniforms.uTime,
            uWindSpeed: grassUniforms.uWindSpeed,
            uWaterDataTex: { value: createBotWWaterDataTexture() },
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

        // ============================================================================
        // 7C. TRUCKFUL COZY ATMOSPHERE: PICKUP TRUCK, FENCES, LANTERNS, GOD-RAYS & MIST
        // ============================================================================
        const fenceWoodMat = new THREE.MeshStandardMaterial({ color: 0x8d6342, roughness: 0.90 });
        applyStylizedCelShading(fenceWoodMat, { rimStrength: 0.16, shadowLift: 0.56 });

        // 1. Winding Wooden Post-and-Rail Countryside Fences (Merged into 1 single draw call!)
        (function buildCountrysideFences() {
            const fenceGeos = [];
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
                }
            });

            if (fenceGeos.length > 0) {
                const mergedFence = mergeBufferGeometriesSimple(fenceGeos);
                const fenceMesh = new THREE.Mesh(mergedFence, fenceWoodMat);
                fenceMesh.castShadow = !isMobileDevice;
                fenceMesh.receiveShadow = true;
                scene.add(fenceMesh);
            }
        })();

        // 2. Charming Crooked Wooden Countryside Signpost at the Clearing Fork
        (function buildCountrysideSignpost() {
            const sx = getRoadCenterX(2.0) + 2.55;
            const sz = 2.0;
            const sy = getTerrainHeight(sx, sz);
            const signGroup = new THREE.Group();
            signGroup.position.set(sx, sy, sz);

            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.05, 6), fenceWoodMat);
            pole.position.y = 1.0;
            pole.rotation.z = 0.04;
            pole.castShadow = true;
            signGroup.add(pole);

            const boardMat = new THREE.MeshStandardMaterial({ color: 0xb68456, roughness: 0.85 });
            applyStylizedCelShading(boardMat, { rimStrength: 0.18, shadowLift: 0.56 });

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
        });

        // 4. Iconic Truckful Cozy Red Vintage Pickup Truck (Interactive Suspension + Volumetric Headlights!)
        const truckGroup = new THREE.Group();
        const TRUCK_Z = 7.4;
        const TRUCK_X = getRoadCenterX(TRUCK_Z) - 3.25;
        paintGrassVisibilityCircle(TRUCK_X, TRUCK_Z, 2.6, 0.0);
        grassMapTexture.needsUpdate = true;
        const TRUCK_Y = getTerrainHeight(TRUCK_X, TRUCK_Z);
        const TRUCK_YAW = getRoadTangentAngle(TRUCK_Z) + Math.PI; // Facing into the cozy clearing/forest

        truckGroup.position.set(TRUCK_X, TRUCK_Y, TRUCK_Z);
        truckGroup.rotation.y = TRUCK_YAW;
        truckGroup.userData = {
            type: 'truck',
            bounceEnergy: 0,
            baseY: TRUCK_Y
        };

        const truckBodyGroup = new THREE.Group();
        truckGroup.add(truckBodyGroup);

        const truckRedMat = new THREE.MeshStandardMaterial({ color: 0xd6453a, roughness: 0.48, metalness: 0.08 });
        applyStylizedCelShading(truckRedMat, { rimStrength: 0.30, shadowLift: 0.52 });

        const truckCreamMat = new THREE.MeshStandardMaterial({ color: 0xf6ead4, roughness: 0.55 });
        applyStylizedCelShading(truckCreamMat, { rimStrength: 0.24, shadowLift: 0.58 });

        const truckGlassMat = new THREE.MeshStandardMaterial({ color: 0x7cb9c4, roughness: 0.22, metalness: 0.15 });
        applyStylizedCelShading(truckGlassMat, { rimStrength: 0.38, shadowLift: 0.55 });

        const tireMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.92 });
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xc8955c, roughness: 0.85 });
        applyStylizedCelShading(crateMat, { rimStrength: 0.16, shadowLift: 0.55 });

        // Lower chassis & front hood (chunky cozy storybook silhouette)
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.52, 3.35), truckRedMat);
        chassis.position.set(0, 0.62, 0);
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        truckBodyGroup.add(chassis);

        // Rounded front hood bulge
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.22, 1.05), truckRedMat);
        hood.position.set(0, 0.94, 1.08);
        hood.castShadow = true;
        truckBodyGroup.add(hood);

        // Cabin & Cream Roof
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.78, 1.05), truckRedMat);
        cab.position.set(0, 1.24, 0.18);
        cab.castShadow = true;
        truckBodyGroup.add(cab);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.14, 1.12), truckCreamMat);
        roof.position.set(0, 1.66, 0.18);
        roof.castShadow = true;
        truckBodyGroup.add(roof);

        // Windshield & Side Windows
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.44, 1.09), truckGlassMat);
        windshield.position.set(0, 1.32, 0.18);
        truckBodyGroup.add(windshield);

        const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.40, 0.72), truckGlassMat);
        sideGlass.position.set(0, 1.32, 0.18);
        truckBodyGroup.add(sideGlass);

        // Chrome Front & Rear Bumpers + Grill
        const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.16, 0.22), truckCreamMat);
        frontBumper.position.set(0, 0.44, 1.72);
        truckBodyGroup.add(frontBumper);

        const grill = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 0.08), darkIronMat);
        grill.position.set(0, 0.72, 1.68);
        truckBodyGroup.add(grill);

        // Wooden Cargo Bed Side Rails
        [-0.74, 0.74].forEach(rx => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 1.48), fenceWoodMat);
            rail.position.set(rx, 1.02, -0.94);
            truckBodyGroup.add(rail);
        });
        const backRail = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.34, 0.08), fenceWoodMat);
        backRail.position.set(0, 1.00, -1.64);
        truckBodyGroup.add(backRail);

        // Cozy Packed Delivery Cargo in the Truck Bed (Crates, Barrel & Cloth Bundle!)
        const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.62), crateMat);
        crate1.position.set(-0.32, 1.12, -0.82);
        crate1.rotation.y = 0.14;
        crate1.castShadow = true;
        truckBodyGroup.add(crate1);

        const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.42, 0.52), crateMat);
        crate2.position.set(0.32, 1.06, -1.16);
        crate2.rotation.y = -0.18;
        truckBodyGroup.add(crate2);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.62, 8), fenceWoodMat);
        barrel.position.set(0.32, 1.14, -0.58);
        barrel.rotation.z = 0.08;
        truckBodyGroup.add(barrel);

        const parcelMat = new THREE.MeshStandardMaterial({ color: 0x529688, roughness: 0.75 });
        applyStylizedCelShading(parcelMat);
        const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.44), parcelMat);
        parcel.position.set(-0.24, 1.54, -0.84);
        parcel.rotation.y = -0.22;
        truckBodyGroup.add(parcel);

        // 4 Chunky Bouncy Rubber Wheels with Cream Hubcaps
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.30, 12);
        wheelGeo.rotateZ(Math.PI * 0.5);
        const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.33, 10);
        hubGeo.rotateZ(Math.PI * 0.5);
        [
            [-0.82, 0.38, 1.04], [0.82, 0.38, 1.04],
            [-0.82, 0.38, -0.96], [0.82, 0.38, -0.96]
        ].forEach(wp => {
            const wGroup = new THREE.Group();
            wGroup.position.set(wp[0], wp[1], wp[2]);
            const tire = new THREE.Mesh(wheelGeo, tireMat);
            tire.castShadow = true;
            const hub = new THREE.Mesh(hubGeo, truckCreamMat);
            wGroup.add(tire);
            wGroup.add(hub);
            truckGroup.add(wGroup);
        });

        // Glowing Headlights, Taillights & Volumetric Headlight Cones (Signature Truckful look!)
        let isHeadlightsOn = true;
        const headlightCones = [];
        const headlightSprites = [];

        const headBeamMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uColor: { value: new THREE.Color(0xffe09c) },
                uOpacity: { value: 0.32 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormalV;
                varying vec3 vViewDir;
                void main() {
                    vUv = uv;
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    vNormalV = normalize(normalMatrix * normal);
                    vViewDir = normalize(-mvPos.xyz);
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec2 vUv;
                varying vec3 vNormalV;
                varying vec3 vViewDir;
                void main() {
                    // Fade softly along cone length (vUv.y = 1 near lamp -> 0 at far end) & edges
                    float lenFade = pow(clamp(vUv.y, 0.0, 1.0), 1.65) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
                    float edgeFade = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 1.35);
                    float alpha = lenFade * edgeFade * uOpacity;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `
        });

        const beamGeo = new THREE.ConeGeometry(1.55, 7.2, 14, 1, true);
        beamGeo.translate(0, -3.6, 0);
        beamGeo.rotateX(-Math.PI * 0.5 + 0.08);

        const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
        const tailLampMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d });

        [-0.56, 0.56].forEach(lx => {
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lampBulbMat);
            bulb.position.set(lx, 0.74, 1.68);
            truckBodyGroup.add(bulb);

            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: warmGlowTex,
                color: 0xffe09c,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));
            sprite.position.set(lx, 0.74, 1.76);
            sprite.scale.set(1.1, 1.1, 1.0);
            truckBodyGroup.add(sprite);
            headlightSprites.push(sprite);

            const beam = new THREE.Mesh(beamGeo, headBeamMat);
            beam.position.set(lx, 0.74, 1.72);
            truckBodyGroup.add(beam);
            headlightCones.push(beam);

            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.08), tailLampMat);
            tail.position.set(lx * 1.1, 0.72, -1.68);
            truckBodyGroup.add(tail);
        });

        // Subtle warm headlight bounce light in front of the truck (no shadow map!)
        const truckHeadLight = new THREE.PointLight(0xffd78a, 1.4 * Math.PI, 11, 0);
        truckHeadLight.position.set(0, 1.1, 4.4);
        truckHeadLight.castShadow = false;
        truckBodyGroup.add(truckHeadLight);

        scene.add(truckGroup);
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
        const beamSpots = [
            { x: -4.8, z: 6.5, w: 3.4, h: 16.0 },
            { x: -1.5, z: 1.5, w: 3.8, h: 17.5 },
            { x: 6.8, z: 5.5, w: 4.0, h: 16.5 },
            { x: -8.5, z: -2.0, w: 3.6, h: 18.0 },
            { x: 3.5, z: -6.5, w: 3.5, h: 17.0 },
            { x: -5.5, z: 13.5, w: 3.4, h: 16.5 }
        ];
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
        });

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
    this.isCampfireLit = isCampfireLit;
    this.cfY = cfY;
    this.pondMesh = pondMesh;
    this.pondUniforms = pondUniforms;
    this.lilyPads = lilyPads;
    this.pondFishList = pondFishList;
    this.roadLanterns = roadLanterns;
    this.truckGroup = truckGroup;
    this.truckBodyGroup = truckBodyGroup;
    this.truckHeadLight = truckHeadLight;
    this.headBeamMat = headBeamMat;
    this.headlightCones = headlightCones;
    this.headlightSprites = headlightSprites;
    this.isHeadlightsOn = isHeadlightsOn;
    this.sunbeamsGroup = sunbeamsGroup;
    this.sunbeamUniforms = sunbeamUniforms;
    this.sunbeamShafts = sunbeamShafts;
    this.isSunbeamsEnabled = isSunbeamsEnabled;
    this.interactiveMushrooms = interactiveMushrooms;
    this.mushroomCapMaterials = mushroomCapMaterials;
    this.particleGeo = particleGeo;
    this.particleMat = particleMat;
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
      } else if (distOrigin > 17.5) {
        // Putar halus menyusuri tepi lembah (bebas U-turn tajam)
        const ang = Math.atan2(z, x);
        const fx = Math.cos(animator.yaw), fz = -Math.sin(animator.yaw);
        const txCCW = -Math.sin(ang), tzCCW = Math.cos(ang);
        const dir = (fx * txCCW + fz * tzCCW) >= 0 ? 1 : -1;
        const nextAng = ang + dir * 0.45;
        const orbitR = 14.5;
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
    const lim = 33.5;
    if (animator.x < -lim) animator.x = -lim;
    if (animator.x > lim) animator.x = lim;
    if (animator.z < -lim) animator.z = -lim;
    if (animator.z > lim) animator.z = lim;
  }

  // ---- Tempatkan 18 warga NPC Sylvan di titik-titik cozy dalam lembah ----
  placeNPCsInWorld(party) {
    this._party = party;
    if (!party || !party.wild) return;
    const spots = [
      // Sekitar api unggun & kayu duduk
      { x: -2.4, z: -1.8, faceX: 0, faceZ: 0 },
      { x:  2.2, z: -2.1, faceX: 0, faceZ: 0 },
      { x:  2.5, z:  1.6, faceX: 0, faceZ: 0 },
      // Dekat papan petunjuk & persimpangan jalan
      { x: -1.8, z:  3.2, faceX: -5, faceZ: 3.2 },
      { x: -2.2, z: -5.2, faceX: -5, faceZ: -5.2 },
      // Tepi kolam BotW
      { x:  3.6, z:  3.8, faceX: 8.2, faceZ: 6.2 },
      { x:  4.2, z:  9.8, faceX: 8.2, faceZ: 6.2 },
      { x: 11.8, z:  2.6, faceX: 8.2, faceZ: 6.2 },
      { x: 12.6, z:  8.8, faceX: 8.2, faceZ: 6.2 },
      // Dekat truk pickup merah & pagar kayu
      { x: -9.8, z:  5.4, faceX: -7.5, faceZ: 7.4 },
      { x: -9.5, z:  9.6, faceX: -7.5, faceZ: 7.4 },
      { x: -8.6, z: -2.8, faceX: -5.4, faceZ: -2.8 },
      { x: -8.8, z: -9.5, faceX: -5.4, faceZ: -9.5 },
      // Padang bunga & bukit lembah
      { x:  5.5, z: -4.8, faceX: 0, faceZ: 0 },
      { x:  8.4, z: -2.2, faceX: 0, faceZ: 0 },
      { x: -2.5, z: 12.5, faceX: -5.0, faceZ: 12.5 },
      { x: -8.5, z: 14.2, faceX: -5.0, faceZ: 14.2 },
      { x:  1.8, z: -11.5, faceX: -5.4, faceZ: -11.5 }
    ];
    for (let i = 0; i < party.wild.length; i++) {
      const w = party.wild[i];
      const sp = spots[i % spots.length];
      const gy = this.terrainHeightAt(sp.x, sp.z);
      const yaw = Math.atan2(sp.faceX - sp.x, sp.faceZ - sp.z);
      w.x = sp.x; w.z = sp.z;
      w.homeX = sp.x; w.homeZ = sp.z;
      if (w.anchor) { w.anchor.x = sp.x; w.anchor.z = sp.z; w.anchor.yaw = yaw; }
      if (w.root) {
        w.root.position.set(sp.x, gy, sp.z);
        w.root.rotation.y = yaw;
      }
    }
  }

  // ---- Ganti suasana Hutan Cozy (morning / sunset / night) ----
  setMood(moodKey) {
    if (!this.MOODS[moodKey]) return null;
    this.currentMoodKey = moodKey;
    this.targetMood = this.MOODS[moodKey];
    if (moodKey === 'night') this.isHeadlightsOn = true;
    return this.targetMood;
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
      if (this.dirLight.shadow.mapSize.x !== quality.shadowMapSize) {
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
      this.pondMesh, this.campfireGroup, this.truckGroup,
      ...this.interactiveMushrooms, ...this.interactiveBushes, ...this.interactiveTrees
    ];
    const intersects = this._raycaster.intersectObjects(targets, true);
    if (!intersects.length) return null;

    const hitPoint = intersects[0].point;
    let obj = intersects[0].object;
    while (obj.parent && !obj.userData.type) obj = obj.parent;

    if (obj.userData.type === 'truck') {
      obj.userData.bounceEnergy = 1.65;
      const exhaustWorld = new THREE.Vector3(-0.45, 0.45, -1.78).applyMatrix4(this.truckGroup.matrixWorld);
      this.spawnBurst(exhaustWorld, 0xfff1d6, 9, true, false);
      this.playTruckHornBeep();
      return 'Tin-tin! Truk pikap Truckful membal!';
    }
    if (obj.userData.type === 'pond') {
      this.triggerPondRipple(hitPoint.x, hitPoint.z);
      this.spawnBurst(new THREE.Vector3(hitPoint.x, this.POND_WATER_Y + 0.12, hitPoint.z), 0xa5f3fc, 12, true, false);
      this.spawnBurst(new THREE.Vector3(hitPoint.x, this.POND_WATER_Y + 0.18, hitPoint.z), 0xffffff, 6, true, false);
      return 'Cipratan air & riak kolam BotW!';
    }
    if (obj.userData.type === 'campfire') {
      if (!this.isCampfireLit) {
        this.toggleCampfire(true);
        return 'Api unggun dinyalakan kembali!';
      }
      obj.userData.flareBoost = 1.6;
      this.spawnBurst(new THREE.Vector3(0, this.cfY + 0.8, 0), 0xffbe0b, 14, true, false);
      return 'Percikan api hangat membubung!';
    }
    if (obj.userData.type === 'mushroom') {
      obj.userData.pulse = 1.5;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      wp.y += 0.35;
      this.spawnBurst(wp, 0x72efdd, 12, true, false);
      return 'Spora ajaib jamur hutan berpendar!';
    }
    if (obj.userData.type === 'bush') {
      obj.userData.rustleBoost = 1.6;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      wp.y += 0.6;
      this.spawnBurst(wp, obj.userData.burstColor || 0x76cc4b, 12, true, true);
      return (obj.userData.name || 'Semak') + ' bergoyang rimbun!';
    }
    if (obj.userData.type === 'tree') {
      obj.userData.rustleBoost = 1.5;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      wp.y += 3.2;
      this.spawnBurst(wp, obj.userData.leafColor || 0xf9c74f, 12, false, false);
      return (obj.userData.name || 'Pohon') + ' berdesir menjatuhkan dedaunan!';
    }
    return null;
  }

  // ---- Query ketinggian & permukaan untuk kuda dan 4 roda gerobak ----
  terrainHeightAt(x, z) {
    return this._getTerrainHeight(x, z);
  }

  isOnRoad(x, z) {
    return this._getRoadDistance(x, z) < 2.15;
  }

  riverDistX(x, z) {
    const d = Math.hypot(x - this.POND_CENTER.x, z - this.POND_CENTER.z);
    if (d < this.POND_CENTER.radius - 0.35) return 4.0;   // di dalam air kolam
    if (d <= this.POND_CENTER.radius + 4.8) return 7.0;   // di tepi kolam -> bisa minum!
    return 25.0;                                          // jauh dari kolam
  }

  triggerPondRipple(x, z) {
    this.pondUniforms.uRippleOrigin.value.set(x, this.POND_WATER_Y, z);
    this.pondUniforms.uRippleTime.value = this.elapsed;
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

  heightAt(x, z) {
    return this._getTerrainHeight(x, z) + this._rampHeight(x, z);
  }

  wheelHeightAt(x, z, wheelRadius = 0.55) {
    return this._getTerrainHeight(x, z) + this._rampHeight(x, z) + this._pebbleHeight(x, z, wheelRadius);
  }

  normalAt(x, z, outVec) {
    const n = this._getTerrainNormal(x, z);
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
      const gy = (Math.abs(p.x) < 40 && Math.abs(p.z) < 40) ? this._getTerrainHeight(p.x, p.z) : -50;
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

  setCartPose(cx, cz) {
    this.cartX = cx;
    this.cartZ = cz;
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
      if (sphere) {
        const dist = camPos.distanceTo(sphere.center);
        tree.visible = (dist < 18.0) || this._cameraFrustum.intersectsSphere(sphere);
      }
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
    this.celShaderUniforms.uCampfireStrength.value = THREE.MathUtils.lerp(
      this.celShaderUniforms.uCampfireStrength.value,
      this.isCampfireLit ? (1.0 + Math.sin(elapsed * 12) * 0.12) : 0.0,
      0.15
    );

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
      if (!treeGroup.visible) continue;
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

    // Truk pickup idle, bounce suspensi, & lampu sorot
    const idleEngine = Math.sin(elapsed * 18.0) * 0.008;
    if (this.truckGroup.userData.bounceEnergy > 0) {
      this.truckGroup.userData.bounceEnergy = Math.max(0, this.truckGroup.userData.bounceEnergy - delta * 2.1);
    }
    const bEnergy = this.truckGroup.userData.bounceEnergy;
    const bounceY = Math.sin(bEnergy * Math.PI * 3.5) * 0.14 * bEnergy;
    const bounceRoll = Math.sin(bEnergy * Math.PI * 3.0) * 0.065 * bEnergy;
    this.truckBodyGroup.position.y = idleEngine + Math.max(-0.04, bounceY);
    this.truckBodyGroup.rotation.z = bounceRoll;
    this.truckBodyGroup.rotation.x = Math.cos(bEnergy * Math.PI * 2.5) * 0.04 * bEnergy;

    const lampStrength = this.isHeadlightsOn ? activeAtmosphere.lanternIntensity : 0.0;
    this.headBeamMat.uniforms.uOpacity.value = THREE.MathUtils.lerp(
      this.headBeamMat.uniforms.uOpacity.value,
      lampStrength * (0.28 + bEnergy * 0.12),
      0.15
    );
    this.headlightCones.forEach((c) => { c.visible = lampStrength > 0.03; });
    this.headlightSprites.forEach((s) => {
      s.visible = this.isHeadlightsOn;
      s.material.opacity = Math.min(1.0, 0.45 + lampStrength * 0.45);
    });
    this.truckHeadLight.intensity = THREE.MathUtils.lerp(this.truckHeadLight.intensity, lampStrength * 1.6 * Math.PI, 0.15);

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

    // Lidah api unggun
    if (this.isCampfireLit) {
      const flicker = Math.sin(elapsed * 14) * 0.22 + Math.cos(elapsed * 23) * 0.15;
      this.campfireLight.intensity = THREE.MathUtils.lerp(this.campfireLight.intensity, (2.5 + flicker + boost * 1.8) * Math.PI, 0.2);
      this.flames.forEach((f, idx) => {
        f.visible = true;
        const t = (elapsed * f.userData.speed + f.userData.offset) % 1.0;
        f.position.y = 0.25 + t * (1.15 + boost * 0.65);
        f.position.x = f.userData.baseX * (1 - t * 0.5) + Math.sin(elapsed * 8 + idx) * 0.06;
        f.position.z = f.userData.baseZ * (1 - t * 0.5) + Math.cos(elapsed * 7 + idx) * 0.06;
        const scale = (1.0 - t * 0.75) * (1 + boost * 0.35);
        f.scale.set(scale, scale * 1.4, scale);
        f.rotation.y += delta * 3;
      });
    } else {
      this.campfireLight.intensity = THREE.MathUtils.lerp(this.campfireLight.intensity, 0, 0.15);
      this.flames.forEach((f) => { f.visible = false; });
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

    // Riak air otomatis bila kuda masuk ke tepi/dalam kolam
    const dPond = Math.hypot(horseX - this.POND_CENTER.x, horseZ - this.POND_CENTER.z);
    if (dPond < this.POND_CENTER.radius + 0.3 && (elapsed - this.pondUniforms.uRippleTime.value) > 0.65) {
      this.triggerPondRipple(horseX, horseZ);
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
