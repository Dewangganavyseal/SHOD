import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const refHtml = path.join(ROOT, 'reference', 'Hutan Cozy Interaktif 3D (2).html');
const dlHtml = 'C:\\Users\\garment\\Downloads\\Hutan Cozy Interaktif 3D (2).html';
const htmlPath = fs.existsSync(refHtml) ? refHtml : dlHtml;
const lines = fs.readFileSync(htmlPath, 'utf8').split(/\r?\n/);

function mustReplace(src, target, replacement, label) {
  if (!src.includes(target)) {
    throw new Error(`Pattern not found for [${label}]`);
  }
  return src.replace(target, replacement);
}

// Extract lines 474..4221 (Sections 2 through 8 of Hutan Cozy Interaktif 3D (2).html)
let coreWorld = lines.slice(473, 4221).join('\n');

// 1. Scale light intensities for Three.js r160 physical lighting & set decay=0 on point lights
coreWorld = mustReplace(
  coreWorld,
  'const dirLight = new THREE.DirectionalLight(activeAtmosphere.sunColor, activeAtmosphere.sunIntensity);',
  'const dirLight = new THREE.DirectionalLight(activeAtmosphere.sunColor, activeAtmosphere.sunIntensity * Math.PI);',
  'dirLight'
);
coreWorld = mustReplace(
  coreWorld,
  `        const hemiLight = new THREE.HemisphereLight(
            activeAtmosphere.hemiSky,
            activeAtmosphere.hemiGround,
            activeAtmosphere.hemiIntensity
        );`,
  `        const hemiLight = new THREE.HemisphereLight(
            activeAtmosphere.hemiSky,
            activeAtmosphere.hemiGround,
            activeAtmosphere.hemiIntensity * Math.PI
        );`,
  'hemiLight'
);
coreWorld = mustReplace(
  coreWorld,
  'const campfireLight = new THREE.PointLight(0xff8c2b, 2.5, 15, 1.6);',
  'const campfireLight = new THREE.PointLight(0xff8c2b, 2.5 * Math.PI, 15, 0);',
  'campfireLight'
);
coreWorld = mustReplace(
  coreWorld,
  'const truckHeadLight = new THREE.PointLight(0xffd78a, 1.4, 11, 1.8);',
  'const truckHeadLight = new THREE.PointLight(0xffd78a, 1.4 * Math.PI, 11, 0);',
  'truckHeadLight'
);

// 2. Apply Hutan Cozy cel-shading to HC.VOXEL_MAT (horse, cart, cargo, passengers)
coreWorld = mustReplace(
  coreWorld,
  'applyStylizedCelShading(terrainMat, { rimStrength: 0.08, shadowLift: 0.56 });',
  'applyStylizedCelShading(terrainMat, { rimStrength: 0.08, shadowLift: 0.56 });\n        if (HC.VOXEL_MAT) applyStylizedCelShading(HC.VOXEL_MAT, { rimStrength: 0.16, shadowLift: 0.64 });',
  'VOXEL_MAT cel shading'
);

// 3. Encode SkyDome shader output to sRGB for Three.js r160 linear THREE.Color uniforms
coreWorld = mustReplace(
  coreWorld,
  `                    gl_FragColor = vec4(skyCol, 1.0);
                }`,
  `                    gl_FragColor = vec4(skyCol, 1.0);
                    #include <colorspace_fragment>
                }`,
  'skyDomeMat colorspace'
);

// 4. Calibrate BotW Pond water colors to linear space & encode output via colorspace_fragment
coreWorld = mustReplace(
  coreWorld,
  `                    vec3 shallowCol = vec3(0.32, 0.88, 0.80); // Crystal turquoise shallows
                    vec3 midWaterCol = vec3(0.11, 0.62, 0.72); // Hyrule emerald-cyan
                    vec3 deepWaterCol = vec3(0.06, 0.28, 0.44); // Deep indigo-teal basin`,
  `                    vec3 shallowCol = pow(vec3(0.32, 0.88, 0.80), vec3(2.2)); // Crystal turquoise shallows
                    vec3 midWaterCol = pow(vec3(0.11, 0.62, 0.72), vec3(2.2)); // Hyrule emerald-cyan
                    vec3 deepWaterCol = pow(vec3(0.06, 0.28, 0.44), vec3(2.2)); // Deep indigo-teal basin`,
  'pondMat water colors'
);
coreWorld = mustReplace(
  coreWorld,
  `vec3 causticLight = mix(vec3(0.65, 0.98, 0.92), uSunColor * 1.15, 0.55);`,
  `vec3 causticLight = mix(pow(vec3(0.65, 0.98, 0.92), vec3(2.2)), uSunColor * 1.15, 0.55);`,
  'pondMat causticLight'
);
coreWorld = mustReplace(
  coreWorld,
  `vec3 foamCol = mix(vec3(0.88, 0.98, 1.0), uSunColor, 0.24);`,
  `vec3 foamCol = mix(pow(vec3(0.88, 0.98, 1.0), vec3(2.2)), uSunColor, 0.24);`,
  'pondMat foamCol'
);
coreWorld = mustReplace(
  coreWorld,
  `                    gl_FragColor = vec4(surfaceCol, finalAlpha);
                }`,
  `                    gl_FragColor = vec4(surfaceCol, finalAlpha);
                    #include <colorspace_fragment>
                }`,
  'pondMat colorspace'
);

// 5. Replace Terrain Floor Material & Section 5A Grass with exact 1:1 Dylearn 3D Pixel-Art Grass System
const DYLEARN_CLOUD_GLSL = [
  'vec2 dylearnRotateVec2(vec2 v, float angleDeg) {',
  '    float a = radians(angleDeg);',
  '    float c = cos(a);',
  '    float s = sin(a);',
  '    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);',
  '}',
  'float dylearnCloudNoise(vec3 wp) {',
  '    float t = (uCloudWorldY - wp.y) / max(uSunDir.y, 0.18);',
  '    vec3 hitPos = wp + t * uSunDir;',
  '    float invScale = 1.0 / max(uCloudScale, 0.001);',
  '    vec2 d1 = normalize(dylearnRotateVec2(uCloudDir, uCloudDivergeAngle));',
  '    vec2 d2 = normalize(dylearnRotateVec2(uCloudDir, -uCloudDivergeAngle));',
  '    vec2 td1 = uTime * uCloudSpeed * d1;',
  '    vec2 td2 = uTime * uCloudSpeed * d2;',
  '    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;',
  '    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;',
  '    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);',
  '    lv = (lv - 0.5) * uCloudContrast + 0.5;',
  '    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);',
  '}'
].join('\n');

const DYLEARN_TERRAIN_BLOCK = [
  '        function createDylearnNoiseTexture(size, basePeriod, seed, octaves = 4) {',
  '            const hash = (ix, iy, p, s) => {',
  '                const wx = ((ix % p) + p) % p;',
  '                const wy = ((iy % p) + p) % p;',
  '                let h = Math.imul(wx + Math.imul(wy, 374761393) + Math.imul(s, 668265263), 1274126177);',
  '                h = Math.imul(h ^ (h >>> 13), 1274126177);',
  '                return ((h ^ (h >>> 16)) >>> 0) / 4294967295;',
  '            };',
  '            const smooth = (t) => t * t * (3 - 2 * t);',
  '            const raw = new Float32Array(size * size);',
  '            let min = Infinity, max = -Infinity;',
  '            for (let y = 0; y < size; y++) {',
  '                for (let x = 0; x < size; x++) {',
  '                    let val = 0, amp = 1, ampSum = 0, p = basePeriod;',
  '                    for (let o = 0; o < octaves; o++) {',
  '                        const fx = (x / size) * p;',
  '                        const fy = (y / size) * p;',
  '                        const x0 = Math.floor(fx), y0 = Math.floor(fy);',
  '                        const tx = smooth(fx - x0), ty = smooth(fy - y0);',
  '                        const n00 = hash(x0, y0, p, seed + o * 19);',
  '                        const n10 = hash(x0 + 1, y0, p, seed + o * 19);',
  '                        const n01 = hash(x0, y0 + 1, p, seed + o * 19);',
  '                        const n11 = hash(x0 + 1, y0 + 1, p, seed + o * 19);',
  '                        const nx0 = n00 + (n10 - n00) * tx;',
  '                        const nx1 = n01 + (n11 - n01) * tx;',
  '                        val += (nx0 + (nx1 - nx0) * ty) * amp;',
  '                        ampSum += amp;',
  '                        amp *= 0.5;',
  '                        p *= 2;',
  '                    }',
  '                    val /= ampSum;',
  '                    raw[y * size + x] = val;',
  '                    if (val < min) min = val;',
  '                    if (val > max) max = val;',
  '                }',
  '            }',
  '            const span = Math.max(0.001, max - min);',
  '            const data = new Uint8Array(size * size * 4);',
  '            for (let i = 0; i < raw.length; i++) {',
  '                const v = Math.max(0, Math.min(255, Math.round(((raw[i] - min) / span) * 255)));',
  '                const idx = i * 4;',
  '                data[idx] = v; data[idx + 1] = v; data[idx + 2] = v; data[idx + 3] = 255;',
  '            }',
  '            const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);',
  '            tex.generateMipmaps = false;',
  '            tex.minFilter = THREE.LinearFilter;',
  '            tex.magFilter = THREE.LinearFilter;',
  '            tex.wrapS = THREE.RepeatWrapping;',
  '            tex.wrapT = THREE.RepeatWrapping;',
  '            tex.needsUpdate = true;',
  '            return tex;',
  '        }',
  '',
  '        const dylearnAlbedo2Noise = createDylearnNoiseTexture(256, 3, 17, 4);',
  '        const dylearnAlbedo3Noise = createDylearnNoiseTexture(256, 3, 53, 4);',
  '        const dylearnWindNoise = createDylearnNoiseTexture(256, 5, 101, 3);',
  '        const dylearnCloudNoise = createDylearnNoiseTexture(256, 3, 211, 4);',
  '',
  '        const dylearnSharedUniforms = {',
  '            uAlbedo1: { value: new THREE.Color(0x71a200) },',
  '            uAlbedo2: { value: new THREE.Color(0x8ead36) },',
  '            uAlbedo3: { value: new THREE.Color(0x80a739) },',
  '            uAccentAlbedo1: { value: new THREE.Color(0x9ab700) },',
  '            uAccentAlbedo2: { value: new THREE.Color(0x6c9a00) },',
  '            uAlbedo2Noise: { value: dylearnAlbedo2Noise },',
  '            uAlbedo3Noise: { value: dylearnAlbedo3Noise },',
  '            uAlbedo2Scale: { value: 0.042 },',
  '            uAlbedo2Threshold: { value: 0.537 },',
  '            uAlbedo3Scale: { value: 0.038 },',
  '            uAlbedo3Threshold: { value: 0.471 },',
  '            uGrassMoodTint: { value: new THREE.Color(1.0, 1.0, 1.0) },',
  '            uCloudNoise: { value: dylearnCloudNoise },',
  '            uCloudScale: { value: 40.0 },',
  '            uCloudWorldY: { value: 50.0 },',
  '            uCloudSpeed: { value: -0.014 },',
  '            uCloudContrast: { value: 3.845 },',
  '            uCloudThreshold: { value: 0.27 },',
  '            uCloudDir: { value: new THREE.Vector2(0.25, -0.968) },',
  '            uCloudShadowMin: { value: 0.28 },',
  '            uCloudDivergeAngle: { value: 20.0 },',
  '            uToonCuts: { value: 3.0 },',
  '            uToonWrap: { value: 0.14 },',
  '            uToonSteepness: { value: 1.0 },',
  '            uThresholdGradSize: { value: 0.255 }',
  '        };',
  '',
  '        const terrainMat = new THREE.MeshStandardMaterial({',
  '            vertexColors: true,',
  '            roughness: 0.92,',
  '            metalness: 0.0',
  '        });',
  '        terrainMat.onBeforeCompile = (shader) => {',
  '            shader.uniforms.uTime = celShaderUniforms.uTime;',
  '            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;',
  '            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;',
  '            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;',
  '            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;',
  '            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;',
  '            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;',
  '            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;',
  '            Object.assign(shader.uniforms, dylearnSharedUniforms);',
  '',
  '            shader.vertexShader = [',
  '                \'attribute float aMeadowMask;\',',
  '                \'varying float vMeadowMask;\',',
  '                \'varying vec3 vTerrainWorldPos;\',',
  '                \'varying vec3 vTerrainWorldNormal;\'',
  '            ].join(\'\\n\') + \'\\n\' + shader.vertexShader;',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <begin_vertex>\',',
  '                [',
  '                    \'#include <begin_vertex>\',',
  '                    \'vMeadowMask = aMeadowMask;\',',
  '                    \'vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\',',
  '                    \'vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            shader.fragmentShader = [',
  '                \'uniform float uTime;\',',
  '                \'uniform vec3 uSunDir;\',',
  '                \'uniform vec3 uSunColor;\',',
  '                \'uniform vec3 uShadowTint;\',',
  '                \'uniform float uSceneBrightness;\',',
  '                \'uniform vec3 uCampfirePos;\',',
  '                \'uniform vec3 uCampfireColor;\',',
  '                \'uniform float uCampfireStrength;\',',
  '                \'uniform vec3 uAlbedo1;\',',
  '                \'uniform vec3 uAlbedo2;\',',
  '                \'uniform vec3 uAlbedo3;\',',
  '                \'uniform sampler2D uAlbedo2Noise;\',',
  '                \'uniform sampler2D uAlbedo3Noise;\',',
  '                \'uniform float uAlbedo2Scale;\',',
  '                \'uniform float uAlbedo2Threshold;\',',
  '                \'uniform float uAlbedo3Scale;\',',
  '                \'uniform float uAlbedo3Threshold;\',',
  '                \'uniform vec3 uGrassMoodTint;\',',
  '                \'uniform sampler2D uCloudNoise;\',',
  '                \'uniform float uCloudScale;\',',
  '                \'uniform float uCloudWorldY;\',',
  '                \'uniform float uCloudSpeed;\',',
  '                \'uniform float uCloudContrast;\',',
  '                \'uniform float uCloudThreshold;\',',
  '                \'uniform vec2 uCloudDir;\',',
  '                \'uniform float uCloudShadowMin;\',',
  '                \'uniform float uCloudDivergeAngle;\',',
  '                \'uniform float uToonCuts;\',',
  '                \'uniform float uToonWrap;\',',
  '                \'uniform float uToonSteepness;\',',
  '                \'varying float vMeadowMask;\',',
  '                \'varying vec3 vTerrainWorldPos;\',',
  '                \'varying vec3 vTerrainWorldNormal;\',',
  DYLEARN_CLOUD_GLSL.split('\n').map((l) => '                ' + JSON.stringify(l)).join(',\n'),
  '            ].join(\'\\n\') + \'\\n\' + shader.fragmentShader;'
].join('\n');

coreWorld = mustReplace(
  coreWorld,
  `        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.92,
            metalness: 0.0
        });
        applyStylizedCelShading(terrainMat, { rimStrength: 0.08, shadowLift: 0.56 });`,
  `        ${DYLEARN_TERRAIN_BLOCK.replace(/^        /, '')}
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
                ].join('\\n')
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
                    ].join('\\n')
                );
            }
        };
        if (HC.VOXEL_MAT) applyStylizedCelShading(HC.VOXEL_MAT, { rimStrength: 0.16, shadowLift: 0.64 });`,
  'dylearn terrainMat'
);

coreWorld = mustReplace(
  coreWorld,
  `                const posAttr = geo.attributes.position;
                const colors = new Float32Array(posAttr.count * 3);
                let minY = 999, maxY = -999;`,
  `                const posAttr = geo.attributes.position;
                const colors = new Float32Array(posAttr.count * 3);
                const meadowMasks = new Float32Array(posAttr.count);
                let minY = 999, maxY = -999;`,
  'terrain meadowMasks alloc'
);

coreWorld = mustReplace(
  coreWorld,
  `                    colors[i * 3] = tempCol.r;
                    colors[i * 3 + 1] = tempCol.g;
                    colors[i * 3 + 2] = tempCol.b;
                }

                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));`,
  `                    let meadowMask = 1.0;
                    meadowMask *= (1.0 - campFactor * 0.92);
                    meadowMask *= (1.0 - roadFactor * 0.98);
                    meadowMask *= (1.0 - shoreFactor * 0.96);
                    meadowMasks[i] = Math.max(0.0, Math.min(1.0, meadowMask));

                    colors[i * 3] = tempCol.r;
                    colors[i * 3 + 1] = tempCol.g;
                    colors[i * 3 + 2] = tempCol.b;
                }

                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                geo.setAttribute('aMeadowMask', new THREE.BufferAttribute(meadowMasks, 1));`,
  'terrain meadowMasks attr'
);

const DYLEARN_SECTION_5A = [
  '        function createPixelSpriteTexture(rows) {',
  '            const h = rows.length;',
  '            const w = rows[0].length;',
  '            const data = new Uint8Array(w * h * 4);',
  '            for (let y = 0; y < h; y++) {',
  '                const rowStr = rows[h - 1 - y];',
  '                for (let x = 0; x < w; x++) {',
  '                    const ch = rowStr[x];',
  '                    const idx = (y * w + x) * 4;',
  '                    data[idx] = 255;',
  '                    data[idx + 1] = 255;',
  '                    data[idx + 2] = 255;',
  '                    data[idx + 3] = (ch === \'A\') ? 255 : 0;',
  '                }',
  '            }',
  '            const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);',
  '            tex.flipY = false;',
  '            tex.generateMipmaps = false;',
  '            tex.minFilter = THREE.NearestFilter;',
  '            tex.magFilter = THREE.NearestFilter;',
  '            tex.wrapS = THREE.ClampToEdgeWrapping;',
  '            tex.wrapT = THREE.ClampToEdgeWrapping;',
  '            tex.needsUpdate = true;',
  '            return tex;',
  '        }',
  '',
  '        const GRASSLEAF_24 = [',
  '            \'........................\',',
  '            \'....................AAA.\',',
  '            \'..................AAAA..\',',
  '            \'................AAAAAA..\',',
  '            \'...AAA.........AAAAAAA..\',',
  '            \'.AAAAAAA......AAAAAAAA..\',',
  '            \'..AAAAAAAA....AAAAAAA...\',',
  '            \'...AAAAAAAA..AAAAAAAA...\',',
  '            \'.....AAAAAAA.AAAAAAAA...\',',
  '            \'......AAAAAA.AAAAAAAA...\',',
  '            \'......AAAAAA.AAAAAAA....\',',
  '            \'.......AAAAA..AAAAA.....\',',
  '            \'...............AAA......\',',
  '            \'.........AAAAA..........\',',
  '            \'........AAAAAAA.........\',',
  '            \'........AAAAAAA.........\',',
  '            \'........AAAAAAA.........\',',
  '            \'........AAAAAAA.........\',',
  '            \'.......AAAAAAA..........\',',
  '            \'.......AAAAAA...........\',',
  '            \'......AAAAA.............\',',
  '            \'......AAA...............\',',
  '            \'........................\',',
  '            \'........................\'',
  '        ];',
  '',
  '        const ACCENTLEAF_24 = [',
  '            \'........................\',',
  '            \'........................\',',
  '            \'........................\',',
  '            \'....AAA.................\',',
  '            \'.....AAA................\',',
  '            \'......AAA...............\',',
  '            \'.......AAA..............\',',
  '            \'.......AAAA.............\',',
  '            \'...AAA..AAAA.......AAA..\',',
  '            \'....AAA.AAAAA....AAAA...\',',
  '            \'....AAA.AAAAA...AAAA....\',',
  '            \'.....AA..AAAAA.AAAAA....\',',
  '            \'.....AAA.AAAAA.AAAA.....\',',
  '            \'.....AAA..AAAA.AAA......\',',
  '            \'......AAA.AAAA.AAA......\',',
  '            \'......AAA.AAAA.AAA......\',',
  '            \'......AAA.AAAA.AAA......\',',
  '            \'.......AA.AAA..AA.......\',',
  '            \'.......AA.AAA.AAA.......\',',
  '            \'.......AA.AA..A.........\',',
  '            \'........A.AA.AA.........\',',
  '            \'..........AA............\',',
  '            \'........................\',',
  '            \'........................\'',
  '        ];',
  '',
  '        const dylearnGrassTex = createPixelSpriteTexture(GRASSLEAF_24);',
  '        const dylearnAccentTex = createPixelSpriteTexture(ACCENTLEAF_24);',
  '',
  '        const grassUniforms = {',
  '            uTime: { value: 0 },',
  '            uWindSpeed: { value: 1.25 },',
  '            uSwayScale: { value: 1.05 },',
  '            uBladeBendDistance: { value: 0.45 },',
  '            uBaseColor: { value: activeAtmosphere.grassBaseColor },',
  '            uTipColor: { value: activeAtmosphere.grassTipColor },',
  '            uGrassMap: { value: grassMapTexture },',
  '            uTerrainSize: { value: TERRAIN_SIZE },',
  '            uGrassTex: { value: dylearnGrassTex },',
  '            uAccentTex1: { value: dylearnGrassTex },',
  '            uAccentTex2: { value: dylearnAccentTex },',
  '            uWindNoise: { value: dylearnWindNoise },',
  '            uAccentFreq1: { value: 0.06 },',
  '            uAccentHeight1: { value: 0.14 },',
  '            uAccentScale1: { value: 1.08 },',
  '            uAccentProb2: { value: 0.09 },',
  '            uAccentHeight2: { value: 0.22 },',
  '            uAccentScale2: { value: 1.12 },',
  '            uFramerate: { value: 5.0 },',
  '            uQuantised: { value: 1.0 },',
  '            uWorldSwayAngle: { value: 58.0 },',
  '            uFakePerspScale: { value: 0.30 },',
  '            uWindNoiseThreshold: { value: 0.365 },',
  '            uWindNoiseScale: { value: 0.055 },',
  '            uDylearnWindSpeed: { value: 0.025 },',
  '            uWindDir: { value: new THREE.Vector2(0.25, 0.968) },',
  '            uWindDivergeAngle: { value: 10.0 },',
  '            uViewSwaySpeed: { value: 0.12 },',
  '            uViewSwayAngle: { value: 10.0 },',
  '            uDispAngleZ: { value: 60.0 },',
  '            uDispAngleX: { value: 62.7 },',
  '            uRadiusExponent: { value: 0.9 },',
  '            uCamForwardXZ: { value: new THREE.Vector2(0.0, -1.0) },',
  '            uCamRightXZ: { value: new THREE.Vector2(1.0, 0.0) },',
  '            uCharPositions: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, -999, 0, 0)) }',
  '        };',
  '',
  '        const grassMat = new THREE.MeshStandardMaterial({',
  '            color: 0xffffff,',
  '            side: THREE.DoubleSide,',
  '            roughness: 0.95,',
  '            metalness: 0.0',
  '        });',
  '',
  '        grassMat.onBeforeCompile = (shader) => {',
  '            shader.uniforms.uTime = grassUniforms.uTime;',
  '            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;',
  '            shader.uniforms.uGrassMap = grassUniforms.uGrassMap;',
  '            shader.uniforms.uTerrainSize = grassUniforms.uTerrainSize;',
  '            shader.uniforms.uGrassTex = grassUniforms.uGrassTex;',
  '            shader.uniforms.uAccentTex1 = grassUniforms.uAccentTex1;',
  '            shader.uniforms.uAccentTex2 = grassUniforms.uAccentTex2;',
  '            shader.uniforms.uWindNoise = grassUniforms.uWindNoise;',
  '            shader.uniforms.uAccentFreq1 = grassUniforms.uAccentFreq1;',
  '            shader.uniforms.uAccentHeight1 = grassUniforms.uAccentHeight1;',
  '            shader.uniforms.uAccentScale1 = grassUniforms.uAccentScale1;',
  '            shader.uniforms.uAccentProb2 = grassUniforms.uAccentProb2;',
  '            shader.uniforms.uAccentHeight2 = grassUniforms.uAccentHeight2;',
  '            shader.uniforms.uAccentScale2 = grassUniforms.uAccentScale2;',
  '            shader.uniforms.uFramerate = grassUniforms.uFramerate;',
  '            shader.uniforms.uQuantised = grassUniforms.uQuantised;',
  '            shader.uniforms.uWorldSwayAngle = grassUniforms.uWorldSwayAngle;',
  '            shader.uniforms.uFakePerspScale = grassUniforms.uFakePerspScale;',
  '            shader.uniforms.uWindNoiseThreshold = grassUniforms.uWindNoiseThreshold;',
  '            shader.uniforms.uWindNoiseScale = grassUniforms.uWindNoiseScale;',
  '            shader.uniforms.uDylearnWindSpeed = grassUniforms.uDylearnWindSpeed;',
  '            shader.uniforms.uWindDir = grassUniforms.uWindDir;',
  '            shader.uniforms.uWindDivergeAngle = grassUniforms.uWindDivergeAngle;',
  '            shader.uniforms.uViewSwaySpeed = grassUniforms.uViewSwaySpeed;',
  '            shader.uniforms.uViewSwayAngle = grassUniforms.uViewSwayAngle;',
  '            shader.uniforms.uDispAngleZ = grassUniforms.uDispAngleZ;',
  '            shader.uniforms.uDispAngleX = grassUniforms.uDispAngleX;',
  '            shader.uniforms.uRadiusExponent = grassUniforms.uRadiusExponent;',
  '            shader.uniforms.uCamForwardXZ = grassUniforms.uCamForwardXZ;',
  '            shader.uniforms.uCamRightXZ = grassUniforms.uCamRightXZ;',
  '            shader.uniforms.uCharPositions = grassUniforms.uCharPositions;',
  '            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;',
  '            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;',
  '            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;',
  '            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;',
  '            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;',
  '            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;',
  '            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;',
  '            Object.assign(shader.uniforms, dylearnSharedUniforms);',
  '',
  '            shader.vertexShader = [',
  '                \'attribute vec3 aTerrainNormal;\',',
  '                \'attribute vec4 aGrassData;\',',
  '                \'uniform float uTime;\',',
  '                \'uniform float uWindSpeed;\',',
  '                \'uniform sampler2D uGrassMap;\',',
  '                \'uniform float uTerrainSize;\',',
  '                \'uniform sampler2D uWindNoise;\',',
  '                \'uniform float uAccentFreq1;\',',
  '                \'uniform float uAccentHeight1;\',',
  '                \'uniform float uAccentScale1;\',',
  '                \'uniform float uAccentProb2;\',',
  '                \'uniform float uAccentHeight2;\',',
  '                \'uniform float uAccentScale2;\',',
  '                \'uniform float uFramerate;\',',
  '                \'uniform float uQuantised;\',',
  '                \'uniform float uWorldSwayAngle;\',',
  '                \'uniform float uWindNoiseThreshold;\',',
  '                \'uniform float uWindNoiseScale;\',',
  '                \'uniform float uDylearnWindSpeed;\',',
  '                \'uniform vec2 uWindDir;\',',
  '                \'uniform float uWindDivergeAngle;\',',
  '                \'uniform float uViewSwaySpeed;\',',
  '                \'uniform float uViewSwayAngle;\',',
  '                \'uniform float uDispAngleZ;\',',
  '                \'uniform float uDispAngleX;\',',
  '                \'uniform float uRadiusExponent;\',',
  '                \'uniform vec2 uCamForwardXZ;\',',
  '                \'uniform vec2 uCamRightXZ;\',',
  '                \'uniform vec4 uCharPositions[24];\',',
  '                \'varying vec2 vGrassUV;\',',
  '                \'varying float vWindSample;\',',
  '                \'varying float vIdSeed1;\',',
  '                \'varying float vIdSeed2;\',',
  '                \'varying float vDispFakePersp;\',',
  '                \'varying vec3 vRootWorldPos;\',',
  '                \'varying vec3 vRootNormal;\',',
  '                \'vec2 dyRot2(vec2 v, float deg) { float a = radians(deg); float c = cos(a); float s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }\',',
  '                \'vec3 dyRotAxis(vec3 axis, float angle, vec3 v) { vec3 k = normalize(axis); float c = cos(angle); float s = sin(angle); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }\'',
  '            ].join(\'\\n\') + \'\\n\' + shader.vertexShader;',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <beginnormal_vertex>\',',
  '                [',
  '                    \'#include <beginnormal_vertex>\',',
  '                    \'objectNormal = normalize(aTerrainNormal);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <begin_vertex>\',',
  '                [',
  '                    \'#include <begin_vertex>\',',
  '                    \'vGrassUV = uv;\',',
  '                    \'vIdSeed1 = aGrassData.x;\',',
  '                    \'vIdSeed2 = aGrassData.y;\',',
  '                    \'vec3 rootPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);\',',
  '                    \'vec2 grassMapUV = vec2((rootPos.x + uTerrainSize * 0.5) / uTerrainSize, (rootPos.z + uTerrainSize * 0.5) / uTerrainSize);\',',
  '                    \'float visSample = texture2D(uGrassMap, grassMapUV).r;\',',
  '                    \'float visScale = smoothstep(0.18, 0.56, visSample) * step(0.02, visSample);\',',
  '                    \'vec3 qv = position * aGrassData.w * visScale;\',',
  '                    \'if (vIdSeed1 < uAccentFreq1) {\',',
  '                    \'    qv.y += uAccentHeight1 * visScale;\',',
  '                    \'    qv *= uAccentScale1;\',',
  '                    \'} else if (vIdSeed2 < uAccentProb2) {\',',
  '                    \'    qv.y += uAccentHeight2 * visScale;\',',
  '                    \'    qv *= uAccentScale2;\',',
  '                    \'}\',',
  '                    \'float seed = 10.0 * aGrassData.z;\',',
  '                    \'float frametime = 1.0 / max(uFramerate, 0.5);\',',
  '                    \'float phase = mod(seed, frametime);\',',
  '                    \'float qTime = uTime;\',',
  '                    \'if (uQuantised > 0.5) {\',',
  '                    \'    qTime = floor((uTime + phase) * uFramerate + 0.5) / uFramerate;\',',
  '                    \'}\',',
  '                    \'vec2 wDir1 = normalize(dyRot2(uWindDir, uWindDivergeAngle));\',',
  '                    \'vec2 wDir2 = normalize(dyRot2(uWindDir, -uWindDivergeAngle));\',',
  '                    \'float wSpd = uDylearnWindSpeed * max(uWindSpeed, 0.25);\',',
  '                    \'vec2 wOff1 = qTime * wSpd * wDir1;\',',
  '                    \'vec2 wOff2 = qTime * wSpd * wDir2;\',',
  '                    \'float ws1 = texture2D(uWindNoise, rootPos.xz * uWindNoiseScale + wOff1).r;\',',
  '                    \'float ws2 = texture2D(uWindNoise, rootPos.xz * (uWindNoiseScale * 0.8) + (wOff2 * 0.89 * 3.14159265 / 3.0)).r;\',',
  '                    \'float wSample = clamp((ws1 * ws2) + uWindNoiseThreshold, 0.0, 1.0);\',',
  '                    \'wSample = (wSample - 0.5) * 2.0;\',',
  '                    \'vWindSample = wSample;\',',
  '                    \'float worldSway = wSample * radians(uWorldSwayAngle);\',',
  '                    \'vec2 normWind = normalize(uWindDir);\',',
  '                    \'vec3 windAxisView = normalize((viewMatrix * vec4(normWind.y, 0.0, -normWind.x, 0.0)).xyz);\',',
  '                    \'float modelSway = sin((qTime + seed) * uViewSwaySpeed * 6.2831853) * radians(uViewSwayAngle);\',',
  '                    \'float dispX = 0.0;\',',
  '                    \'float dispY = 0.0;\',',
  '                    \'for (int i = 0; i < 24; i++) {\',',
  '                    \'    vec4 cp = uCharPositions[i];\',',
  '                    \'    if (cp.w > 0.001) {\',',
  '                    \'        vec3 toGrass = rootPos - cp.xyz;\',',
  '                    \'        float distNorm = length(toGrass) / cp.w;\',',
  '                    \'        if (distNorm < 1.0) {\',',
  '                    \'            float strength = pow(max(1.0 - distNorm, 0.0), uRadiusExponent);\',',
  '                    \'            float xzLen = length(toGrass.xz);\',',
  '                    \'            vec2 dirXZ = (xzLen > 0.0001) ? (toGrass.xz / xzLen) : vec2(1.0, 0.0);\',',
  '                    \'            dispX += strength * dot(uCamRightXZ, dirXZ);\',',
  '                    \'            dispY += strength * dot(uCamForwardXZ, dirXZ);\',',
  '                    \'        }\',',
  '                    \'    }\',',
  '                    \'}\',',
  '                    \'dispX = clamp(dispX, -1.0, 1.0);\',',
  '                    \'dispY = clamp(dispY, -1.0, 1.0);\',',
  '                    \'vDispFakePersp = dispY;\',',
  '                    \'qv = dyRotAxis(vec3(0.0, 0.0, 1.0), modelSway, qv);\',',
  '                    \'qv = dyRotAxis(vec3(0.0, 0.0, 1.0), -dispX * radians(uDispAngleZ), qv);\',',
  '                    \'qv = dyRotAxis(vec3(1.0, 0.0, 0.0), -dispY * radians(uDispAngleX), qv);\',',
  '                    \'qv = dyRotAxis(windAxisView, worldSway, qv);\',',
  '                    \'vec3 dylearnQuadVert = qv;\',',
  '                    \'vRootWorldPos = (modelMatrix * vec4(rootPos, 1.0)).xyz;\',',
  '                    \'vRootNormal = normalize(mat3(modelMatrix) * aTerrainNormal);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <project_vertex>\',',
  '                [',
  '                    \'vec4 rootView = modelViewMatrix * vec4(rootPos, 1.0);\',',
  '                    \'vec4 mvPosition = vec4(rootView.xyz + dylearnQuadVert, 1.0);\',',
  '                    \'gl_Position = projectionMatrix * mvPosition;\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <worldpos_vertex>\',',
  '                [',
  '                    \'#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\',',
  '                    \'    vec4 worldPosition = modelMatrix * vec4(rootPos + aTerrainNormal * 0.08, 1.0);\',',
  '                    \'#endif\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            shader.fragmentShader = [',
  '                \'uniform float uTime;\',',
  '                \'uniform sampler2D uGrassTex;\',',
  '                \'uniform sampler2D uAccentTex1;\',',
  '                \'uniform sampler2D uAccentTex2;\',',
  '                \'uniform vec3 uAlbedo1;\',',
  '                \'uniform vec3 uAlbedo2;\',',
  '                \'uniform vec3 uAlbedo3;\',',
  '                \'uniform vec3 uAccentAlbedo1;\',',
  '                \'uniform vec3 uAccentAlbedo2;\',',
  '                \'uniform sampler2D uAlbedo2Noise;\',',
  '                \'uniform sampler2D uAlbedo3Noise;\',',
  '                \'uniform float uAlbedo2Scale;\',',
  '                \'uniform float uAlbedo2Threshold;\',',
  '                \'uniform float uAlbedo3Scale;\',',
  '                \'uniform float uAlbedo3Threshold;\',',
  '                \'uniform vec3 uGrassMoodTint;\',',
  '                \'uniform float uAccentFreq1;\',',
  '                \'uniform float uAccentProb2;\',',
  '                \'uniform float uFakePerspScale;\',',
  '                \'uniform vec2 uWindDir;\',',
  '                \'uniform vec2 uCamForwardXZ;\',',
  '                \'uniform vec3 uSunDir;\',',
  '                \'uniform vec3 uSunColor;\',',
  '                \'uniform vec3 uShadowTint;\',',
  '                \'uniform float uSceneBrightness;\',',
  '                \'uniform vec3 uCampfirePos;\',',
  '                \'uniform vec3 uCampfireColor;\',',
  '                \'uniform float uCampfireStrength;\',',
  '                \'uniform sampler2D uCloudNoise;\',',
  '                \'uniform float uCloudScale;\',',
  '                \'uniform float uCloudWorldY;\',',
  '                \'uniform float uCloudSpeed;\',',
  '                \'uniform float uCloudContrast;\',',
  '                \'uniform float uCloudThreshold;\',',
  '                \'uniform vec2 uCloudDir;\',',
  '                \'uniform float uCloudShadowMin;\',',
  '                \'uniform float uCloudDivergeAngle;\',',
  '                \'uniform float uToonCuts;\',',
  '                \'uniform float uToonWrap;\',',
  '                \'uniform float uToonSteepness;\',',
  '                \'uniform float uThresholdGradSize;\',',
  '                \'varying vec2 vGrassUV;\',',
  '                \'varying float vWindSample;\',',
  '                \'varying float vIdSeed1;\',',
  '                \'varying float vIdSeed2;\',',
  '                \'varying float vDispFakePersp;\',',
  '                \'varying vec3 vRootWorldPos;\',',
  '                \'varying vec3 vRootNormal;\',',
  DYLEARN_CLOUD_GLSL.split('\n').map((l) => '                ' + JSON.stringify(l)).join(',\n'),
  '            ].join(\'\\n\') + \'\\n\' + shader.fragmentShader;',
  '',
  '            shader.fragmentShader = shader.fragmentShader.replace(',
  '                \'#include <map_fragment>\',',
  '                [',
  '                    \'vec2 gUv = vGrassUV;\',',
  '                    \'gUv.x -= 0.5;\',',
  '                    \'float windPersp = vWindSample * uFakePerspScale * dot(uCamForwardXZ, normalize(uWindDir));\',',
  '                    \'gUv.x *= gUv.y * windPersp + 1.0;\',',
  '                    \'gUv.x *= 1.0 - gUv.y * vDispFakePersp * 0.35;\',',
  '                    \'gUv.x = clamp(gUv.x + 0.5, 0.0, 1.0);\',',
  '                    \'vec4 gTex = texture2D(uGrassTex, gUv);\',',
  '                    \'float grN2 = texture2D(uAlbedo2Noise, vRootWorldPos.xz * uAlbedo2Scale).r;\',',
  '                    \'float grN3 = texture2D(uAlbedo3Noise, vRootWorldPos.xz * uAlbedo3Scale).r;\',',
  '                    \'vec3 grassCol = uAlbedo1;\',',
  '                    \'if (grN2 > uAlbedo2Threshold) grassCol = uAlbedo2;\',',
  '                    \'if (grN3 > uAlbedo3Threshold) grassCol = uAlbedo3;\',',
  '                    \'if (vIdSeed1 < uAccentFreq1) {\',',
  '                    \'    gTex = texture2D(uAccentTex1, gUv);\',',
  '                    \'    grassCol = uAccentAlbedo1;\',',
  '                    \'} else if (vIdSeed2 < uAccentProb2) {\',',
  '                    \'    gTex = texture2D(uAccentTex2, gUv);\',',
  '                    \'    grassCol = uAccentAlbedo2;\',',
  '                    \'}\',',
  '                    \'if (gTex.a < 0.5) discard;\',',
  '                    \'vec3 dylearnAlbedo = grassCol * gTex.rgb * uGrassMoodTint;\',',
  '                    \'diffuseColor = vec4(1.0, 1.0, 1.0, 1.0);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            if (shader.fragmentShader.includes(\'#include <tonemapping_fragment>\')) {',
  '                shader.fragmentShader = shader.fragmentShader.replace(',
  '                    \'#include <tonemapping_fragment>\',',
  '                    [',
  '                        \'vec3 grN = normalize(vRootNormal);\',',
  '                        \'vec3 grL = normalize(uSunDir);\',',
  '                        \'float grNdotL = dot(grN, grL);\',',
  '                        \'float grDirAtten = 1.0;\',',
  '                        \'#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\',',
  '                        \'    if (receiveShadow) {\',',
  '                        \'        DirectionalLightShadow grShadow = directionalLightShadows[0];\',',
  '                        \'        grDirAtten = getShadow(directionalShadowMap[0], grShadow.shadowMapSize, grShadow.shadowBias, grShadow.shadowRadius, vDirectionalShadowCoord[0]);\',',
  '                        \'    }\',',
  '                        \'#endif\',',
  '                        \'float grDiff = (grNdotL + (grDirAtten - 1.0) + uToonWrap) * uToonSteepness;\',',
  '                        \'float grCloud = dylearnCloudNoise(vRootWorldPos);\',',
  '                        \'grDiff = clamp(min(grDiff, grCloud), 0.0, 1.0);\',',
  '                        \'float grCut = 1.0 / max(uToonCuts, 1.0);\',',
  '                        \'float grStepped = clamp(ceil(grDiff * uToonCuts) * grCut, 0.0, 1.0);\',',
  '                        \'if (uThresholdGradSize > 0.0) {\',',
  '                        \'    float grK = floor(grDiff / grCut + 0.5);\',',
  '                        \'    if (grK >= 0.0 && grK <= uToonCuts) {\',',
  '                        \'        float grThresh = grK * grCut;\',',
  '                        \'        float grHw = 0.5 * grCut * uThresholdGradSize;\',',
  '                        \'        float grLo = max(0.0, grThresh - grHw);\',',
  '                        \'        float grHi = min(1.0, grThresh + grHw);\',',
  '                        \'        float grBlend = (grHi > grLo) ? smoothstep(grLo, grHi, grDiff) : step(grThresh, grDiff);\',',
  '                        \'        grStepped = clamp(mix(grThresh, min(grThresh + grCut, 1.0), grBlend), 0.0, 1.0);\',',
  '                        \'    }\',',
  '                        \'}\',',
  '                        \'vec3 grBase = dylearnAlbedo * uSceneBrightness;\',',
  '                        \'vec3 grShadowCol = mix(grBase * uShadowTint * 1.24, grBase * 0.48, 0.45);\',',
  '                        \'vec3 grSunCol = grBase * mix(vec3(1.06), uSunColor * 1.12, 0.30);\',',
  '                        \'outgoingLight = mix(grShadowCol, grSunCol, mix(0.18, 1.0, grStepped));\',',
  '                        \'float grFireDist = length(uCampfirePos - vRootWorldPos);\',',
  '                        \'float grFireGlow = (1.0 - smoothstep(1.8, 13.5, grFireDist)) * uCampfireStrength;\',',
  '                        \'outgoingLight += dylearnAlbedo * uCampfireColor * smoothstep(0.10, 0.62, grFireGlow) * 0.46;\',',
  '                        \'gl_FragColor = vec4(outgoingLight, 1.0);\',',
  '                        \'#include <tonemapping_fragment>\'',
  '                    ].join(\'\\n\')',
  '                );',
  '            }',
  '        };',
  '',
  '        const BASE_GRASS_QUAD_GEO = new THREE.PlaneGeometry(0.42, 0.56);',
  '        BASE_GRASS_QUAD_GEO.translate(0, 0.24, 0);',
  '        const grassChunks = [];',
  '        const TARGET_TUFTS_PER_CHUNK = 2200;',
  '        const grassDummy = new THREE.Object3D();',
  '',
  '        for (let gz = 0; gz < CHUNK_GRID; gz++) {',
  '            for (let gx = 0; gx < CHUNK_GRID; gx++) {',
  '                const minX = -TERRAIN_SIZE * 0.5 + gx * CHUNK_SIZE;',
  '                const minZ = -TERRAIN_SIZE * 0.5 + gz * CHUNK_SIZE;',
  '                const cx = minX + CHUNK_SIZE * 0.5;',
  '                const cz = minZ + CHUNK_SIZE * 0.5;',
  '',
  '                const validQuads = [];',
  '                for (let b = 0; b < TARGET_TUFTS_PER_CHUNK; b++) {',
  '                    const bx = minX + Math.random() * CHUNK_SIZE;',
  '                    const bz = minZ + Math.random() * CHUNK_SIZE;',
  '',
  '                    const distPond = Math.hypot(bx - POND_CENTER.x, bz - POND_CENTER.z);',
  '                    if (distPond < POND_CENTER.radius - 0.15) continue;',
  '',
  '                    const by = getTerrainHeight(bx, bz);',
  '                    if (distPond < POND_CENTER.radius + 0.35 && by < -0.22) continue;',
  '',
  '                    const roadDist = getRoadDistance(bx, bz);',
  '                    if (roadDist < 1.70) continue;',
  '                    if (Math.hypot(bx, bz) < 2.2) continue;',
  '',
  '                    const roadsideBoost = (roadDist > 2.25 && roadDist < 4.2) ? 1.15 : 1.0;',
  '                    const n = getTerrainNormal(bx, bz);',
  '                    const locSeed = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453) % 1.0;',
  '                    validQuads.push({',
  '                        x: bx, y: by - 0.02, z: bz,',
  '                        nx: n.x, ny: n.y, nz: n.z,',
  '                        seed1: Math.random(),',
  '                        seed2: Math.random(),',
  '                        locSeed,',
  '                        sizeScale: (0.86 + Math.random() * 0.30) * roadsideBoost',
  '                    });',
  '                }',
  '',
  '                if (validQuads.length === 0) continue;',
  '',
  '                const instGeo = BASE_GRASS_QUAD_GEO.clone();',
  '                const count = validQuads.length;',
  '                const normalArr = new Float32Array(count * 3);',
  '                const dataArr = new Float32Array(count * 4);',
  '',
  '                for (let i = 0; i < count; i++) {',
  '                    const vq = validQuads[i];',
  '                    normalArr[i * 3] = vq.nx;',
  '                    normalArr[i * 3 + 1] = vq.ny;',
  '                    normalArr[i * 3 + 2] = vq.nz;',
  '',
  '                    dataArr[i * 4] = vq.seed1;',
  '                    dataArr[i * 4 + 1] = vq.seed2;',
  '                    dataArr[i * 4 + 2] = vq.locSeed;',
  '                    dataArr[i * 4 + 3] = vq.sizeScale;',
  '                }',
  '',
  '                instGeo.setAttribute(\'aTerrainNormal\', new THREE.InstancedBufferAttribute(normalArr, 3));',
  '                instGeo.setAttribute(\'aGrassData\', new THREE.InstancedBufferAttribute(dataArr, 4));',
  '',
  '                const instMesh = new THREE.InstancedMesh(instGeo, grassMat, count);',
  '                for (let i = 0; i < count; i++) {',
  '                    const vq = validQuads[i];',
  '                    grassDummy.position.set(vq.x, vq.y, vq.z);',
  '                    grassDummy.rotation.set(0, 0, 0);',
  '                    grassDummy.scale.set(1, 1, 1);',
  '                    grassDummy.updateMatrix();',
  '                    instMesh.setMatrixAt(i, grassDummy.matrix);',
  '                }',
  '                instMesh.instanceMatrix.needsUpdate = true;',
  '                instMesh.castShadow = false;',
  '                instMesh.receiveShadow = true;',
  '                instMesh.frustumCulled = false;',
  '',
  '                const centerY = getTerrainHeight(cx, cz) + 0.55;',
  '                instMesh.userData = {',
  '                    maxCount: count,',
  '                    boundingSphere: new THREE.Sphere(new THREE.Vector3(cx, centerY, cz), CHUNK_SIZE * 0.85)',
  '                };',
  '                grassChunks.push(instMesh);',
  '                scene.add(instMesh);',
  '            }',
  '        }'
].join('\n');

const grassStartMarker = '        // Tileable 2D Scrolling Wind Flow Map Texture (_WindMap)';
const grassEndMarker = '        scene.add(flowerMesh);';
const gsIdx = coreWorld.indexOf(grassStartMarker);
const geIdx = coreWorld.indexOf(grassEndMarker, gsIdx);
if (gsIdx === -1 || geIdx === -1) {
  throw new Error('Pattern not found for [Section 5A grass block]');
}
coreWorld = coreWorld.slice(0, gsIdx) + DYLEARN_SECTION_5A + coreWorld.slice(geIdx + grassEndMarker.length);

// 6. Add outer horizon forest ring (28 trees along valley rim radius 30.5..36.5)
coreWorld = mustReplace(
  coreWorld,
  `                } else {
                    createStylizedPineTree(x, z, scale, v, c);
                }
            }
        }`,
  `                } else {
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
        }`,
  'outer horizon trees'
);

// 7. Enable subtle Volumetric Sunbeams / God-Rays by default
coreWorld = mustReplace(
  coreWorld,
  `        let isSunbeamsEnabled = false;
        const sunbeamsGroup = new THREE.Group();
        sunbeamsGroup.visible = false;`,
  `        let isSunbeamsEnabled = true;
        const sunbeamsGroup = new THREE.Group();
        sunbeamsGroup.visible = true;`,
  'sunbeams default'
);

// 8. Park vintage red pickup truck beside dirt road so the road is clear for horse + cart
coreWorld = mustReplace(
  coreWorld,
  'const TRUCK_X = getRoadCenterX(TRUCK_Z);',
  'const TRUCK_X = getRoadCenterX(TRUCK_Z) - 3.25;\n        paintGrassVisibilityCircle(TRUCK_X, TRUCK_Z, 2.6, 0.0);\n        grassMapTexture.needsUpdate = true;',
  'TRUCK_X'
);

// 9. Avoid Three.js r160 deprecation warning on tex.encoding = THREE.sRGBEncoding
if (!coreWorld.includes('tex.encoding = THREE.sRGBEncoding;')) {
  throw new Error('Pattern not found for [tex.encoding]');
}
coreWorld = coreWorld.replace(
  /tex\.encoding\s*=\s*THREE\.sRGBEncoding;/g,
  "if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;"
);

// 10. Dylearn 3D Pixel-Art Foliage System (Bushes, Pines, and Deciduous Trees)
//     - Crisp NearestFilter low-res pixel-art sprites, 5 FPS stepped sway, card-center LIGHT_VERTEX,
//       3-band hybrid toon shading + shared world-space cloud shadows
//     - Preserves natural multi-shade leaf variation on deciduous trees (pines stay unified per tree)
function replaceBetweenMarkers(src, startMarker, endMarker, replacement, label) {
  const sIdx = src.indexOf(startMarker);
  const eIdx = sIdx === -1 ? -1 : src.indexOf(endMarker, sIdx);
  if (sIdx === -1 || eIdx === -1) {
    throw new Error(`Marker slice failed for [${label}]`);
  }
  return src.slice(0, sIdx) + replacement + src.slice(eIdx);
}

const DYLEARN_CLOUD_UNIFORMS_GLSL = [
  'uniform float uTime;',
  'uniform vec3 uSunDir;',
  'uniform vec3 uSunColor;',
  'uniform vec3 uShadowTint;',
  'uniform vec3 uRimTint;',
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
  'uniform float uThresholdGradSize;'
];

const PIXEL_FOLIAGE_HELPERS_AND_BUSH = [
  '        function hexToRgbBytes(hex) {',
  '            const n = parseInt(hex.slice(1), 16);',
  '            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];',
  '        }',
  '',
  '        function varyRgbBytes(rgb, dr, dg, db) {',
  '            return [',
  '                Math.max(0, Math.min(255, Math.round(rgb[0] + dr))),',
  '                Math.max(0, Math.min(255, Math.round(rgb[1] + dg))),',
  '                Math.max(0, Math.min(255, Math.round(rgb[2] + db)))',
  '            ];',
  '        }',
  '',
  '        function createPixelFoliageTexture(size, drawFn) {',
  '            const data = new Uint8Array(size * size * 4);',
  '            function plot(px, py, rgb) {',
  '                const ix = Math.round(px);',
  '                const iy = Math.round(py);',
  '                if (ix < 0 || ix >= size || iy < 0 || iy >= size) return;',
  '                const dstRow = (size - 1 - iy) * size;',
  '                const dp = (dstRow + ix) * 4;',
  '                data[dp] = rgb[0];',
  '                data[dp + 1] = rgb[1];',
  '                data[dp + 2] = rgb[2];',
  '                data[dp + 3] = 255;',
  '            }',
  '            function stampPixelLeaf(cx, cy, len, wid, ang, cBase, cTip) {',
  '                const ca = Math.cos(ang);',
  '                const sa = Math.sin(ang);',
  '                const bound = Math.ceil(Math.max(len, wid) + 2);',
  '                const x0 = Math.max(0, Math.floor(cx - bound));',
  '                const x1 = Math.min(size - 1, Math.ceil(cx + bound));',
  '                const y0 = Math.max(0, Math.floor(cy - bound));',
  '                const y1 = Math.min(size - 1, Math.ceil(cy + bound));',
  '                for (let py = y0; py <= y1; py++) {',
  '                    for (let px = x0; px <= x1; px++) {',
  '                        const dx = px - cx;',
  '                        const dy = py - cy;',
  '                        const lx = dx * ca + dy * sa;',
  '                        const ly = -dx * sa + dy * ca;',
  '                        const t = (len * 0.42 - ly) / (len * 1.04);',
  '                        if (t < 0.0 || t > 1.0) continue;',
  '                        const halfW = wid * 0.54 * Math.sin(Math.pow(t, 0.72) * Math.PI);',
  '                        if (Math.abs(lx) <= Math.max(0.45, halfW)) {',
  '                            plot(px, py, t > 0.52 ? cTip : cBase);',
  '                        }',
  '                    }',
  '                }',
  '            }',
  '            drawFn({ size, plot, stampPixelLeaf });',
  '            const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);',
  '            tex.flipY = false;',
  '            tex.generateMipmaps = false;',
  '            tex.minFilter = THREE.NearestFilter;',
  '            tex.magFilter = THREE.NearestFilter;',
  '            tex.wrapS = THREE.ClampToEdgeWrapping;',
  '            tex.wrapT = THREE.ClampToEdgeWrapping;',
  '            if (\'colorSpace\' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;',
  '            tex.needsUpdate = true;',
  '            return tex;',
  '        }',
  '',
  '        function createTruckfulBushClusterTexture(palette) {',
  '            const cShadow = hexToRgbBytes(palette.shadow);',
  '            const cBase = hexToRgbBytes(palette.base);',
  '            const cMid = hexToRgbBytes(palette.mid);',
  '            const cTip = hexToRgbBytes(palette.tip);',
  '            const cHi = hexToRgbBytes(palette.highlight);',
  '            return createPixelFoliageTexture(24, ({ stampPixelLeaf }) => {',
  '                let s = 19477;',
  '                const nextRand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };',
  '                const cx = 11.5;',
  '                const cy = 11.5;',
  '                for (let i = 0; i < 10; i++) {',
  '                    const theta = i * 2.3999632;',
  '                    const r = Math.sqrt((i + 0.4) / 10) * 5.2;',
  '                    const lx = cx + Math.cos(theta) * r;',
  '                    const ly = cy + Math.sin(theta) * r;',
  '                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.55;',
  '                    stampPixelLeaf(lx, ly, 6.2 + nextRand() * 1.4, 3.6 + nextRand() * 0.8, ang, cShadow, cBase);',
  '                }',
  '                for (let i = 0; i < 11; i++) {',
  '                    const theta = (i / 11) * Math.PI * 2 + (nextRand() - 0.5) * 0.18;',
  '                    const r = 5.5 + nextRand() * 2.1;',
  '                    const lx = cx + Math.cos(theta) * r;',
  '                    const ly = cy + Math.sin(theta) * r;',
  '                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.45;',
  '                    const upper = ly < cy + 1.5;',
  '                    stampPixelLeaf(lx, ly, 5.4 + nextRand() * 1.2, 3.0 + nextRand() * 0.8, ang, upper ? cBase : cShadow, upper ? cMid : cBase);',
  '                }',
  '                for (let i = 0; i < 13; i++) {',
  '                    const theta = i * 2.3999632 + 1.1;',
  '                    const r = Math.sqrt((i + 0.35) / 13) * 6.4;',
  '                    const lx = cx + Math.cos(theta) * r;',
  '                    const ly = cy - 0.8 + Math.sin(theta) * r * 0.88;',
  '                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.6;',
  '                    const isBright = ly < cy + 0.8 && nextRand() > 0.36;',
  '                    stampPixelLeaf(lx, ly, 4.6 + nextRand() * 1.2, 2.6 + nextRand() * 0.7, ang, isBright ? cMid : cBase, isBright ? cHi : cTip);',
  '                }',
  '            });',
  '        }',
  '',
  '        function injectTruckfulBushShader(shader) {',
  '            shader.uniforms.uTime = grassUniforms.uTime;',
  '            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;',
  '            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;',
  '            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;',
  '            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;',
  '            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;',
  '            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;',
  '            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;',
  '            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;',
  '            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;',
  '            Object.assign(shader.uniforms, dylearnSharedUniforms);',
  '',
  '            shader.vertexShader = [',
  '                \'attribute vec3 aSphereNormal;\',',
  '                \'attribute vec3 aBushInfo;\',',
  '                \'attribute vec3 aQuadData;\',',
  '                \'uniform float uTime;\',',
  '                \'uniform float uWindSpeed;\',',
  '                \'varying vec3 vBushWorldPos;\',',
  '                \'varying vec3 vBushSphereNormal;\',',
  '                \'varying float vBushAO;\',',
  '                \'varying float vBushTint;\'',
  '            ].join(\'\\n\') + \'\\n\' + shader.vertexShader;',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <begin_vertex>\',',
  '                [',
  '                    \'#include <begin_vertex>\',',
  '                    \'float cardPhase = aBushInfo.x;\',',
  '                    \'float heightNorm = aBushInfo.y;\',',
  '                    \'float bushAO = aBushInfo.z;\',',
  '                    \'float frametime = 1.0 / 5.0;\',',
  '                    \'float qPhase = mod(cardPhase * 1.7, frametime);\',',
  '                    \'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;\',',
  '                    \'float swayMask = smoothstep(0.05, 0.92, heightNorm);\',',
  '                    \'float t = qTime * (1.85 + uWindSpeed * 0.62) + cardPhase;\',',
  '                    \'float swayAmt = 0.032 * uWindSpeed * swayMask;\',',
  '                    \'vec3 swayedAnchor = transformed + vec3(sin(t) * swayAmt, cos(t * 1.35) * swayAmt * 0.25, cos(t * 0.95) * swayAmt * 0.72);\',',
  '                    \'vec3 camRightLocal = normalize(vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]));\',',
  '                    \'vec3 camUpLocal = normalize(vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]));\',',
  '                    \'vec3 camFwdLocal = normalize(vec3(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2]));\',',
  '                    \'float spinAngle = aQuadData.z + sin(t * 1.1) * 0.07 * uWindSpeed;\',',
  '                    \'float cs = cos(spinAngle), sn = sin(spinAngle);\',',
  '                    \'vec2 rotOff = vec2(aQuadData.x * cs - aQuadData.y * sn, aQuadData.x * sn + aQuadData.y * cs);\',',
  '                    \'float quadSize = length(aQuadData.xy);\',',
  '                    \'transformed = swayedAnchor + camRightLocal * rotOff.x + camUpLocal * rotOff.y + camFwdLocal * (quadSize * 0.14);\',',
  '                    \'vBushAO = bushAO;\',',
  '                    \'vBushTint = fract(cardPhase * 1.913);\',',
  '                    \'vBushWorldPos = (modelMatrix * vec4(swayedAnchor, 1.0)).xyz;\',',
  '                    \'vBushSphereNormal = normalize(mat3(modelMatrix) * aSphereNormal);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            if (shader.vertexShader.includes(\'#include <worldpos_vertex>\')) {',
  '                shader.vertexShader = shader.vertexShader.replace(',
  '                    \'#include <worldpos_vertex>\',',
  '                    [',
  '                        \'#if defined( USE_ENVMAP ) || defined ( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\',',
  '                        \'    vec4 worldPosition = modelMatrix * vec4(swayedAnchor, 1.0);\',',
  '                        \'#endif\'',
  '                    ].join(\'\\n\')',
  '                );',
  '            }',
  '',
  '            if (shader.fragmentShader.includes(\'#include <tonemapping_fragment>\')) {',
  '                shader.fragmentShader = [',
  ...DYLEARN_CLOUD_UNIFORMS_GLSL.map((l) => '                    ' + JSON.stringify(l) + ','),
  '                    \'varying vec3 vBushWorldPos;\',',
  '                    \'varying vec3 vBushSphereNormal;\',',
  '                    \'varying float vBushAO;\',',
  '                    \'varying float vBushTint;\',',
  DYLEARN_CLOUD_GLSL.split('\n').map((l) => '                    ' + JSON.stringify(l)).join(',\n'),
  '                ].join(\'\\n\') + \'\\n\' + shader.fragmentShader;',
  '',
  '                shader.fragmentShader = shader.fragmentShader.replace(',
  '                    \'#include <tonemapping_fragment>\',',
  '                    [',
  '                        \'vec3 buN = normalize(vBushSphereNormal);\',',
  '                        \'vec3 buL = normalize(uSunDir);\',',
  '                        \'vec3 buV = normalize(cameraPosition - vBushWorldPos);\',',
  '                        \'float buDirAtten = 1.0;\',',
  '                        \'#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\',',
  '                        \'    if (receiveShadow) {\',',
  '                        \'        DirectionalLightShadow buShadow = directionalLightShadows[0];\',',
  '                        \'        buDirAtten = getShadow(directionalShadowMap[0], buShadow.shadowMapSize, buShadow.shadowBias, buShadow.shadowRadius, vDirectionalShadowCoord[0]);\',',
  '                        \'    }\',',
  '                        \'#endif\',',
  '                        \'float buDiff = (dot(buN, buL) + (buDirAtten - 1.0) + uToonWrap) * uToonSteepness;\',',
  '                        \'buDiff *= mix(0.62, 1.08, vBushAO);\',',
  '                        \'float buCloud = dylearnCloudNoise(vBushWorldPos);\',',
  '                        \'buDiff = clamp(min(buDiff, buCloud), 0.0, 1.0);\',',
  '                        \'float buCut = 1.0 / max(uToonCuts, 1.0);\',',
  '                        \'float buStep = clamp(ceil(buDiff * uToonCuts) * buCut, 0.0, 1.0);\',',
  '                        \'if (uThresholdGradSize > 0.0) {\',',
  '                        \'    float buK = floor(buDiff / buCut + 0.5);\',',
  '                        \'    if (buK >= 0.0 && buK <= uToonCuts) {\',',
  '                        \'        float buThresh = buK * buCut;\',',
  '                        \'        float buHw = 0.5 * buCut * uThresholdGradSize;\',',
  '                        \'        float buLo = max(0.0, buThresh - buHw);\',',
  '                        \'        float buHi = min(1.0, buThresh + buHw);\',',
  '                        \'        float buBlend = (buHi > buLo) ? smoothstep(buLo, buHi, buDiff) : step(buThresh, buDiff);\',',
  '                        \'        buStep = clamp(mix(buThresh, min(buThresh + buCut, 1.0), buBlend), 0.0, 1.0);\',',
  '                        \'    }\',',
  '                        \'}\',',
  '                        \'vec3 buBase = diffuseColor.rgb * mix(0.93, 1.07, vBushTint) * uSceneBrightness;\',',
  '                        \'vec3 buCool = mix(buBase * uShadowTint * 1.20, buBase * 0.44, 0.46);\',',
  '                        \'vec3 buSun = buBase * mix(vec3(1.04), uSunColor * 1.10, 0.28);\',',
  '                        \'vec3 buCol = mix(buCool, buSun, mix(0.20, 1.0, buStep));\',',
  '                        \'float buRim = pow(1.0 - max(dot(buN, buV), 0.0), 3.0) * smoothstep(0.22, 0.86, buN.y * 0.5 + 0.5);\',',
  '                        \'buCol += uRimTint * buRim * 0.12 * uSceneBrightness;\',',
  '                        \'float buFireDist = length(uCampfirePos - vBushWorldPos);\',',
  '                        \'float buFireGlow = (1.0 - smoothstep(1.8, 12.5, buFireDist)) * uCampfireStrength;\',',
  '                        \'outgoingLight = buCol + diffuseColor.rgb * uCampfireColor * smoothstep(0.12, 0.65, buFireGlow) * 0.44;\',',
  '                        \'gl_FragColor = vec4(outgoingLight, diffuseColor.a);\',',
  '                        \'#include <tonemapping_fragment>\'',
  '                    ].join(\'\\n\')',
  '                );',
  '            }',
  '        }',
  '',
  '        '
].join('\n');

coreWorld = replaceBetweenMarkers(
  coreWorld,
  '        function createTruckfulBushClusterTexture(palette) {',
  '        const bushMaterials = {};',
  PIXEL_FOLIAGE_HELPERS_AND_BUSH,
  'Bush pixel foliage & Dylearn shader'
);

const PIXEL_PINE_TEXTURE = [
  '        function createBotWPineFanTexture(palette) {',
  '            const cShadow = hexToRgbBytes(palette.shadow);',
  '            const cBase = hexToRgbBytes(palette.base);',
  '            const cMid = hexToRgbBytes(palette.mid);',
  '            const cTip = hexToRgbBytes(palette.tip);',
  '            const cHi = hexToRgbBytes(palette.highlight);',
  '            return createPixelFoliageTexture(32, ({ stampPixelLeaf }) => {',
  '                let s = 31337;',
  '                const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };',
  '                const rootX = 15.5;',
  '                const rootY = 29.0;',
  '                for (let i = -3; i <= 3; i++) {',
  '                    const frac = i / 3;',
  '                    const ang = frac * 0.82;',
  '                    const len = (21 - Math.abs(frac) * 6.5) + rand() * 1.5;',
  '                    stampPixelLeaf(rootX + frac * 1.8, rootY - 0.8, len, 4.4, ang, cShadow, cBase);',
  '                }',
  '                for (let i = -4; i <= 4; i++) {',
  '                    const frac = i / 4;',
  '                    const ang = frac * 0.92 + (rand() - 0.5) * 0.08;',
  '                    const len = (24 - Math.abs(frac) * 7.5) + rand() * 1.8;',
  '                    stampPixelLeaf(rootX + frac * 2.2, rootY - 1.8, len, 3.4, ang, cBase, cMid);',
  '                }',
  '                for (let i = -3; i <= 3; i++) {',
  '                    const frac = i / 3;',
  '                    const ang = frac * 0.80 + (rand() - 0.5) * 0.1;',
  '                    const baseDist = 8.2 + (1.0 - Math.abs(frac)) * 5.2;',
  '                    const fx = rootX + Math.sin(ang) * baseDist;',
  '                    const fy = rootY - 2.2 - Math.cos(ang) * baseDist;',
  '                    const len = 9.5 + (1.0 - Math.abs(frac)) * 4.0 + rand() * 1.6;',
  '                    stampPixelLeaf(fx, fy, len, 2.5, ang, cMid, (i % 2 === 0) ? cHi : cTip);',
  '                }',
  '            });',
  '        }',
  '',
  '        '
].join('\n');

coreWorld = replaceBetweenMarkers(
  coreWorld,
  '        function createBotWPineFanTexture(palette) {',
  '        // Curved 3D BotW Pine Bough Pad',
  PIXEL_PINE_TEXTURE,
  'Pine 32x32 pixel fan texture'
);

const PIXEL_PINE_SHADER = [
  '        function injectBranchSocketWindShader(shader) {',
  '            shader.uniforms.uTime = grassUniforms.uTime;',
  '            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;',
  '            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;',
  '            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;',
  '            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;',
  '            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;',
  '            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;',
  '            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;',
  '            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;',
  '            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;',
  '            Object.assign(shader.uniforms, dylearnSharedUniforms);',
  '',
  '            shader.vertexShader = [',
  '                \'attribute vec3 aSocketPos;\',',
  '                \'attribute vec3 aProjectedNormal;\',',
  '                \'attribute vec3 aFoliageInfo;\',',
  '                \'uniform float uTime;\',',
  '                \'uniform float uWindSpeed;\',',
  '                \'varying vec3 vPineWorldPos;\',',
  '                \'varying vec3 vPineNormal;\',',
  '                \'varying float vTierAO;\',',
  '                \'varying float vHeightTint;\'',
  '            ].join(\'\\n\') + \'\\n\' + shader.vertexShader;',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <begin_vertex>\',',
  '                [',
  '                    \'#include <begin_vertex>\',',
  '                    \'vec3 rel = transformed - aSocketPos;\',',
  '                    \'float distFromSocket = length(rel);\',',
  '                    \'float flex = smoothstep(0.08, 1.45, distFromSocket);\',',
  '                    \'float phase = aFoliageInfo.x;\',',
  '                    \'float frametime = 1.0 / 5.0;\',',
  '                    \'float qPhase = mod(phase * 1.3, frametime);\',',
  '                    \'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;\',',
  '                    \'float t = qTime * (1.55 + uWindSpeed * 0.55) + phase;\',',
  '                    \'float pitchAng = sin(t) * 0.068 * uWindSpeed * flex;\',',
  '                    \'float yawAng = cos(t * 0.82) * 0.052 * uWindSpeed * flex;\',',
  '                    \'float cp = cos(pitchAng), sp = sin(pitchAng);\',',
  '                    \'float cy = cos(yawAng), sy = sin(yawAng);\',',
  '                    \'vec3 p1 = vec3(rel.x, rel.y * cp - rel.z * sp, rel.y * sp + rel.z * cp);\',',
  '                    \'vec3 p2 = vec3(p1.x * cy - p1.z * sy, p1.y, p1.x * sy + p1.z * cy);\',',
  '                    \'transformed = aSocketPos + p2;\',',
  '                    \'vTierAO = aFoliageInfo.y;\',',
  '                    \'vHeightTint = aFoliageInfo.z;\',',
  '                    \'vPineWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\',',
  '                    \'vPineNormal = normalize(mat3(modelMatrix) * aProjectedNormal);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            if (shader.fragmentShader.includes(\'#include <tonemapping_fragment>\')) {',
  '                shader.fragmentShader = [',
  ...DYLEARN_CLOUD_UNIFORMS_GLSL.map((l) => '                    ' + JSON.stringify(l) + ','),
  '                    \'varying vec3 vPineWorldPos;\',',
  '                    \'varying vec3 vPineNormal;\',',
  '                    \'varying float vTierAO;\',',
  '                    \'varying float vHeightTint;\',',
  DYLEARN_CLOUD_GLSL.split('\n').map((l) => '                    ' + JSON.stringify(l)).join(',\n'),
  '                ].join(\'\\n\') + \'\\n\' + shader.fragmentShader;',
  '',
  '                shader.fragmentShader = shader.fragmentShader.replace(',
  '                    \'#include <tonemapping_fragment>\',',
  '                    [',
  '                        \'vec3 piN = normalize(vPineNormal);\',',
  '                        \'vec3 piL = normalize(uSunDir);\',',
  '                        \'vec3 piV = normalize(cameraPosition - vPineWorldPos);\',',
  '                        \'float piDirAtten = 1.0;\',',
  '                        \'#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\',',
  '                        \'    if (receiveShadow) {\',',
  '                        \'        DirectionalLightShadow piShadow = directionalLightShadows[0];\',',
  '                        \'        piDirAtten = getShadow(directionalShadowMap[0], piShadow.shadowMapSize, piShadow.shadowBias, piShadow.shadowRadius, vDirectionalShadowCoord[0]);\',',
  '                        \'    }\',',
  '                        \'#endif\',',
  '                        \'float piDiff = (dot(piN, piL) + (piDirAtten - 1.0) + uToonWrap) * uToonSteepness;\',',
  '                        \'piDiff *= mix(0.64, 1.08, vTierAO);\',',
  '                        \'float piCloud = dylearnCloudNoise(vPineWorldPos);\',',
  '                        \'piDiff = clamp(min(piDiff, piCloud), 0.0, 1.0);\',',
  '                        \'float piCut = 1.0 / max(uToonCuts, 1.0);\',',
  '                        \'float piStep = clamp(ceil(piDiff * uToonCuts) * piCut, 0.0, 1.0);\',',
  '                        \'if (uThresholdGradSize > 0.0) {\',',
  '                        \'    float piK = floor(piDiff / piCut + 0.5);\',',
  '                        \'    if (piK >= 0.0 && piK <= uToonCuts) {\',',
  '                        \'        float piThresh = piK * piCut;\',',
  '                        \'        float piHw = 0.5 * piCut * uThresholdGradSize;\',',
  '                        \'        float piLo = max(0.0, piThresh - piHw);\',',
  '                        \'        float piHi = min(1.0, piThresh + piHw);\',',
  '                        \'        float piBlend = (piHi > piLo) ? smoothstep(piLo, piHi, piDiff) : step(piThresh, piDiff);\',',
  '                        \'        piStep = clamp(mix(piThresh, min(piThresh + piCut, 1.0), piBlend), 0.0, 1.0);\',',
  '                        \'    }\',',
  '                        \'}\',',
  '                        \'vec3 piBase = diffuseColor.rgb * mix(0.90, 1.10, vHeightTint) * uSceneBrightness;\',',
  '                        \'vec3 piCool = mix(piBase * uShadowTint * 1.18, piBase * 0.42, 0.46);\',',
  '                        \'vec3 piSun = piBase * mix(vec3(1.02), uSunColor * 1.06, 0.26);\',',
  '                        \'vec3 piCol = mix(piCool, piSun, mix(0.22, 1.0, piStep));\',',
  '                        \'float piRim = pow(1.0 - max(dot(piN, piV), 0.0), 3.0) * smoothstep(0.20, 0.85, piN.y * 0.5 + 0.5);\',',
  '                        \'piCol += uRimTint * piRim * 0.13 * uSceneBrightness;\',',
  '                        \'float piFireDist = length(uCampfirePos - vPineWorldPos);\',',
  '                        \'float piFireGlow = (1.0 - smoothstep(2.0, 14.0, piFireDist)) * uCampfireStrength;\',',
  '                        \'outgoingLight = piCol + diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, piFireGlow) * 0.42;\',',
  '                        \'gl_FragColor = vec4(outgoingLight, diffuseColor.a);\',',
  '                        \'#include <tonemapping_fragment>\'',
  '                    ].join(\'\\n\')',
  '                );',
  '            }',
  '        }',
  '',
  '        '
].join('\n');

coreWorld = replaceBetweenMarkers(
  coreWorld,
  '        function injectBranchSocketWindShader(shader) {',
  '        const pineMaterials = {};',
  PIXEL_PINE_SHADER,
  'Pine Dylearn 3-band toon + cloud shader'
);

const PIXEL_DECIDUOUS_FOLIAGE = [
  '        function createTruckfulSmallLeafClusterTexture(palette) {',
  '            const cShadow = hexToRgbBytes(palette.shadow);',
  '            const cBase = hexToRgbBytes(palette.base);',
  '            const cMid = hexToRgbBytes(palette.mid);',
  '            const cTip = hexToRgbBytes(palette.tip);',
  '            const cHi = hexToRgbBytes(palette.highlight);',
  '            return createPixelFoliageTexture(32, ({ stampPixelLeaf }) => {',
  '                let s = 48271;',
  '                const nextRand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };',
  '                const varyLeaf = (c1, c2) => {',
  '                    const shift = nextRand() - 0.45;',
  '                    const dr = shift * 20 + (nextRand() - 0.5) * 6;',
  '                    const dg = shift * 16 + (nextRand() - 0.5) * 6;',
  '                    const db = -shift * 12 + (nextRand() - 0.5) * 6;',
  '                    return [varyRgbBytes(c1, dr * 0.85, dg * 0.85, db * 0.85), varyRgbBytes(c2, dr, dg, db)];',
  '                };',
  '                const cx = 15.5;',
  '                const cy = 15.5;',
  '                for (let i = 0; i < 14; i++) {',
  '                    const theta = i * 2.3999632;',
  '                    const r = Math.sqrt((i + 0.4) / 14) * 7.2;',
  '                    const lx = cx + Math.cos(theta) * r;',
  '                    const ly = cy + Math.sin(theta) * r;',
  '                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.7;',
  '                    const [v1, v2] = varyLeaf(cShadow, cBase);',
  '                    stampPixelLeaf(lx, ly, 5.4 + nextRand() * 1.6, 3.2 + nextRand() * 0.8, ang, v1, v2);',
  '                }',
  '                for (let i = 0; i < 14; i++) {',
  '                    const theta = (i / 14) * Math.PI * 2 + (nextRand() - 0.5) * 0.2;',
  '                    const r = 7.2 + nextRand() * 3.3;',
  '                    const lx = cx + Math.cos(theta) * r;',
  '                    const ly = cy + Math.sin(theta) * r;',
  '                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.5;',
  '                    const upper = ly < cy + 1.5;',
  '                    const [v1, v2] = varyLeaf(upper ? cBase : cShadow, upper ? cMid : cBase);',
  '                    stampPixelLeaf(lx, ly, 5.0 + nextRand() * 1.4, 2.8 + nextRand() * 0.8, ang, v1, v2);',
  '                }',
  '                for (let i = 0; i < 18; i++) {',
  '                    const theta = i * 2.3999632 + 1.3;',
  '                    const r = Math.sqrt((i + 0.3) / 18) * 9.0;',
  '                    const lx = cx + Math.cos(theta) * r;',
  '                    const ly = cy - 0.8 + Math.sin(theta) * r * 0.90;',
  '                    const ang = Math.atan2(lx - cx, -(ly - cy)) + (nextRand() - 0.5) * 0.75;',
  '                    const bright = ly < cy + 0.6 && nextRand() > 0.34;',
  '                    const [v1, v2] = varyLeaf(bright ? cMid : cBase, bright ? cHi : cTip);',
  '                    stampPixelLeaf(lx, ly, 4.4 + nextRand() * 1.2, 2.4 + nextRand() * 0.7, ang, v1, v2);',
  '                }',
  '            });',
  '        }',
  '',
  '        function injectTruckfulDeciduousShader(shader) {',
  '            shader.uniforms.uTime = grassUniforms.uTime;',
  '            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;',
  '            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;',
  '            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;',
  '            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;',
  '            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;',
  '            shader.uniforms.uSceneBrightness = celShaderUniforms.uSceneBrightness;',
  '            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;',
  '            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;',
  '            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;',
  '            Object.assign(shader.uniforms, dylearnSharedUniforms);',
  '',
  '            shader.vertexShader = [',
  '                \'attribute vec3 aProjectedNormal;\',',
  '                \'attribute vec3 aCanopyInfo;\',',
  '                \'attribute vec3 aQuadData;\',',
  '                \'uniform float uTime;\',',
  '                \'uniform float uWindSpeed;\',',
  '                \'varying vec3 vLeafWorldPos;\',',
  '                \'varying vec3 vLeafNormal;\',',
  '                \'varying float vLeafAO;\',',
  '                \'varying float vLeafTint;\',',
  '                \'varying float vLeafClusterHue;\'',
  '            ].join(\'\\n\') + \'\\n\' + shader.vertexShader;',
  '',
  '            shader.vertexShader = shader.vertexShader.replace(',
  '                \'#include <begin_vertex>\',',
  '                [',
  '                    \'#include <begin_vertex>\',',
  '                    \'float cardPhase = aCanopyInfo.x;\',',
  '                    \'float leafAO = aCanopyInfo.y;\',',
  '                    \'float leafTint = aCanopyInfo.z;\',',
  '                    \'float frametime = 1.0 / 5.0;\',',
  '                    \'float qPhase = mod(cardPhase * 1.7, frametime);\',',
  '                    \'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;\',',
  '                    \'float t = qTime * (1.7 + uWindSpeed * 0.55) + cardPhase;\',',
  '                    \'float swayAmt = 0.06 * uWindSpeed;\',',
  '                    \'vec3 anchor = transformed + vec3(sin(t) * swayAmt, cos(t * 1.2) * swayAmt * 0.35, cos(t * 0.9) * swayAmt * 0.8);\',',
  '                    \'vec3 camRight = normalize(vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]));\',',
  '                    \'vec3 camUp = normalize(vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]));\',',
  '                    \'vec3 camFwd = normalize(vec3(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2]));\',',
  '                    \'float spin = aQuadData.z + sin(t * 0.95) * 0.08 * uWindSpeed;\',',
  '                    \'float cs = cos(spin), sn = sin(spin);\',',
  '                    \'vec2 rotOff = vec2(aQuadData.x * cs - aQuadData.y * sn, aQuadData.x * sn + aQuadData.y * cs);\',',
  '                    \'float qSize = length(aQuadData.xy);\',',
  '                    \'transformed = anchor + camRight * rotOff.x + camUp * rotOff.y + camFwd * (qSize * 0.12);\',',
  '                    \'vLeafAO = leafAO;\',',
  '                    \'vLeafTint = leafTint;\',',
  '                    \'vLeafClusterHue = fract(cardPhase * 1.73 + leafTint * 0.61);\',',
  '                    \'vLeafWorldPos = (modelMatrix * vec4(anchor, 1.0)).xyz;\',',
  '                    \'vLeafNormal = normalize(mat3(modelMatrix) * aProjectedNormal);\'',
  '                ].join(\'\\n\')',
  '            );',
  '',
  '            if (shader.vertexShader.includes(\'#include <worldpos_vertex>\')) {',
  '                shader.vertexShader = shader.vertexShader.replace(',
  '                    \'#include <worldpos_vertex>\',',
  '                    [',
  '                        \'#if defined( USE_ENVMAP ) || defined ( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\',',
  '                        \'    vec4 worldPosition = modelMatrix * vec4(anchor, 1.0);\',',
  '                        \'#endif\'',
  '                    ].join(\'\\n\')',
  '                );',
  '            }',
  '',
  '            if (shader.fragmentShader.includes(\'#include <tonemapping_fragment>\')) {',
  '                shader.fragmentShader = [',
  ...DYLEARN_CLOUD_UNIFORMS_GLSL.map((l) => '                    ' + JSON.stringify(l) + ','),
  '                    \'varying vec3 vLeafWorldPos;\',',
  '                    \'varying vec3 vLeafNormal;\',',
  '                    \'varying float vLeafAO;\',',
  '                    \'varying float vLeafTint;\',',
  '                    \'varying float vLeafClusterHue;\',',
  DYLEARN_CLOUD_GLSL.split('\n').map((l) => '                    ' + JSON.stringify(l)).join(',\n'),
  '                ].join(\'\\n\') + \'\\n\' + shader.fragmentShader;',
  '',
  '                shader.fragmentShader = shader.fragmentShader.replace(',
  '                    \'#include <tonemapping_fragment>\',',
  '                    [',
  '                        \'vec3 dcN = normalize(vLeafNormal);\',',
  '                        \'vec3 dcL = normalize(uSunDir);\',',
  '                        \'vec3 dcV = normalize(cameraPosition - vLeafWorldPos);\',',
  '                        \'float dcDirAtten = 1.0;\',',
  '                        \'#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\',',
  '                        \'    if (receiveShadow) {\',',
  '                        \'        DirectionalLightShadow dcShadow = directionalLightShadows[0];\',',
  '                        \'        dcDirAtten = getShadow(directionalShadowMap[0], dcShadow.shadowMapSize, dcShadow.shadowBias, dcShadow.shadowRadius, vDirectionalShadowCoord[0]);\',',
  '                        \'    }\',',
  '                        \'#endif\',',
  '                        \'float dcDiff = (dot(dcN, dcL) + (dcDirAtten - 1.0) + uToonWrap) * uToonSteepness;\',',
  '                        \'dcDiff *= mix(0.60, 1.08, vLeafAO);\',',
  '                        \'float dcCloud = dylearnCloudNoise(vLeafWorldPos);\',',
  '                        \'dcDiff = clamp(min(dcDiff, dcCloud), 0.0, 1.0);\',',
  '                        \'float dcCut = 1.0 / max(uToonCuts, 1.0);\',',
  '                        \'float dcStep = clamp(ceil(dcDiff * uToonCuts) * dcCut, 0.0, 1.0);\',',
  '                        \'if (uThresholdGradSize > 0.0) {\',',
  '                        \'    float dcK = floor(dcDiff / dcCut + 0.5);\',',
  '                        \'    if (dcK >= 0.0 && dcK <= uToonCuts) {\',',
  '                        \'        float dcThresh = dcK * dcCut;\',',
  '                        \'        float dcHw = 0.5 * dcCut * uThresholdGradSize;\',',
  '                        \'        float dcLo = max(0.0, dcThresh - dcHw);\',',
  '                        \'        float dcHi = min(1.0, dcThresh + dcHw);\',',
  '                        \'        float dcBlend = (dcHi > dcLo) ? smoothstep(dcLo, dcHi, dcDiff) : step(dcThresh, dcDiff);\',',
  '                        \'        dcStep = clamp(mix(dcThresh, min(dcThresh + dcCut, 1.0), dcBlend), 0.0, 1.0);\',',
  '                        \'    }\',',
  '                        \'}\',',
  '                        \'float lobePatch = sin(vLeafWorldPos.x * 1.35 + vLeafWorldPos.z * 1.15 + vLeafWorldPos.y * 0.75) * 0.5 + 0.5;\',',
  '                        \'float varMix = clamp(lobePatch * 0.55 + vLeafClusterHue * 0.45, 0.0, 1.0);\',',
  '                        \'vec3 coolTone = vec3(0.89, 1.02, 0.96);\',',
  '                        \'vec3 midTone  = vec3(1.00, 1.00, 1.00);\',',
  '                        \'vec3 warmTone = vec3(1.11, 1.04, 0.85);\',',
  '                        \'vec3 clusterTint = varMix < 0.5 ? mix(coolTone, midTone, varMix * 2.0) : mix(midTone, warmTone, (varMix - 0.5) * 2.0);\',',
  '                        \'clusterTint *= mix(vec3(0.94, 0.97, 1.01), vec3(1.06, 1.03, 0.95), smoothstep(0.35, 0.95, vLeafAO));\',',
  '                        \'vec3 dcBase = diffuseColor.rgb * clusterTint * mix(0.88, 1.12, vLeafTint) * uSceneBrightness;\',',
  '                        \'vec3 dcCool = mix(dcBase * uShadowTint * 1.20, dcBase * 0.44, 0.46);\',',
  '                        \'vec3 dcSun = dcBase * mix(vec3(1.04), uSunColor * 1.10, 0.28);\',',
  '                        \'vec3 dcCol = mix(dcCool, dcSun, mix(0.20, 1.0, dcStep));\',',
  '                        \'float dcRim = pow(1.0 - max(dot(dcN, dcV), 0.0), 3.0) * smoothstep(0.22, 0.86, dcN.y * 0.5 + 0.5);\',',
  '                        \'dcCol += uRimTint * dcRim * 0.12 * uSceneBrightness;\',',
  '                        \'float dcFireDist = length(uCampfirePos - vLeafWorldPos);\',',
  '                        \'float dcFireGlow = (1.0 - smoothstep(2.0, 14.0, dcFireDist)) * uCampfireStrength;\',',
  '                        \'outgoingLight = dcCol + diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, dcFireGlow) * 0.42;\',',
  '                        \'gl_FragColor = vec4(outgoingLight, diffuseColor.a);\',',
  '                        \'#include <tonemapping_fragment>\'',
  '                    ].join(\'\\n\')',
  '                );',
  '            }',
  '        }',
  '',
  '        '
].join('\n');

coreWorld = replaceBetweenMarkers(
  coreWorld,
  '        function createTruckfulSmallLeafClusterTexture(palette) {',
  '        const deciduousMaterials = {};',
  PIXEL_DECIDUOUS_FOLIAGE,
  'Deciduous 32x32 pixel foliage & Dylearn shader'
);

const worldJs = `/* ============================================================================
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
    const isMobileDevice = (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
      || (typeof window !== 'undefined' && window.innerWidth < 820);

    const PERF_PROFILES = {
      mobile:   { label: 'HP G99 Lancar', pixelRatio: 1.15, cullDistance: 48.0, grassRatio: 0.72 },
      balanced: { label: 'Seimbang',      pixelRatio: 1.5,  cullDistance: 64.0, grassRatio: 0.90 },
      ultra:    { label: 'Ultra PC',      pixelRatio: 2.0,  cullDistance: 84.0, grassRatio: 1.0  }
    };
    let currentPerfMode = isMobileDevice ? 'mobile' : 'ultra';

    scene.background = new THREE.Color(0x6bb0e6);
    scene.fog = null;

${coreWorld}

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
`;

const outPath = path.join(ROOT, 'js', 'world.js');
fs.writeFileSync(outPath, worldJs, 'utf8');
console.log('Generated js/world.js (' + (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB)');
