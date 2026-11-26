/* ============================================================================
   HUTAN COZY visual library — port dari hutan_cozy_interaktif_3d.html
   Builder tekstur/geometri/shader diambil apa adanya dari file sumber (BotW-style
   BotW pine fan pads (model cemara v2), leaf cards, blade grass, water data). Yang diganti hanya
   glue-nya: THREE datang dari HC, terrain dari world SHOD, scene tidak auto-add,
   dan Math.random diganti PRNG deterministik (peta SHOD tetap, bukan generate).
   ============================================================================ */
import { HC } from './hc.js';
const THREE = HC.THREE;

// Builder asli memanggil scene.add & push ke array interaksi hutan; di SHOD object
// dikembalikan lalu dipakai instancing, jadi array ini hanya penampung.
const scene = { add() {} };
const interactiveTrees = [], interactiveBushes = [], swayingCanopies = [];
const pineMaterials = {}, pineDepthMaterials = {};
const deciduousMaterials = {}, deciduousDepthMaterials = {};
const GRASS_WORLD_SPAN = 88.0;

// PRNG deterministik untuk isi visual (bukan Math.random global).
let _rngState = 1;
function rnd() {
  _rngState = (_rngState * 1664525 + 1013904223) >>> 0;
  return _rngState / 4294967296;
}
function setForestSeed(seed) { _rngState = (seed | 0) >>> 0 || 1; }

let _terrainHeight = () => 0;
function getTerrainHeight(x, z) { return _terrainHeight(x, z); }
function setTerrainHeightSampler(fn) { _terrainHeight = fn; }

const atmosphere = {
  sunPos: new THREE.Vector3(0.42, 0.86, 0.30),
  sunColor: new THREE.Color(0xffe9c4),
  shadowTint: new THREE.Color(0x5c6b8a),
  rimTint: new THREE.Color(0xbfe4ff),
  grassBaseColor: new THREE.Color(0x35592a),
  grassTipColor: new THREE.Color(0x9ad464),
  mushroomGlow: 1.0,
};
const celShaderUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: atmosphere.sunPos.clone().normalize() },
  uSunColor: { value: atmosphere.sunColor },
  uShadowTint: { value: atmosphere.shadowTint },
  uRimTint: { value: atmosphere.rimTint },
  uCampfirePos: { value: new THREE.Vector3(0, 0.85, 0) },
  uCampfireColor: { value: new THREE.Color(0xff7b29) },
  uCampfireStrength: { value: 0.0 },
};

const grassMapCanvas = document.createElement('canvas');
grassMapCanvas.width = grassMapCanvas.height = 128;
const grassMapCtx = grassMapCanvas.getContext('2d');
grassMapCtx.fillStyle = '#ffffff';
grassMapCtx.fillRect(0, 0, 128, 128);
const grassMapTexture = new THREE.CanvasTexture(grassMapCanvas);
grassMapTexture.minFilter = THREE.NearestFilter;

const grassUniforms = {
  uTime: { value: 0 },
  uWindSpeed: { value: 1.25 },
  uSwayScale: { value: 1.05 },
  uBladeBendDistance: { value: 0.45 },
  uBladeBendCurve: { value: 2.0 },
  uBaseColor: { value: atmosphere.grassBaseColor },
  uTipColor: { value: atmosphere.grassTipColor },
  uWindMap: { value: createWindFlowTexture() },
  uGrassMap: { value: grassMapTexture },
  uBladeTex: { value: createBladeShadingTexture() },
  uSunDir: celShaderUniforms.uSunDir,
  uSunColor: celShaderUniforms.uSunColor,
  uCampfirePos: celShaderUniforms.uCampfirePos,
  uCampfireColor: celShaderUniforms.uCampfireColor,
  uCampfireStrength: celShaderUniforms.uCampfireStrength,
};


// ---- source: createWindFlowTexture ----
function createWindFlowTexture() {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const img = ctx.createImageData(size, size);
            const d = img.data;
            const tau = Math.PI * 2;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const v = y / size;
                    const wx = Math.sin(u * tau * 2.0 + Math.cos(v * tau)) * 0.5 + 0.5;
                    const wz = Math.cos(v * tau * 2.0 - Math.sin(u * tau)) * 0.5 + 0.5;
                    const idx = (y * size + x) * 4;
                    d[idx] = Math.floor(wx * 255);
                    d[idx + 1] = Math.floor(wz * 255);
                    d[idx + 2] = 128;
                    d[idx + 3] = 255;
                }
            }
            ctx.putImageData(img, 0, 0);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

// ---- source: createBladeShadingTexture ----
function createBladeShadingTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const grad = ctx.createLinearGradient(0, 0, 64, 0);
            grad.addColorStop(0.0, '#d8d8d8');
            grad.addColorStop(0.46, '#ffffff');
            grad.addColorStop(0.50, '#b5b5b5');
            grad.addColorStop(0.54, '#ffffff');
            grad.addColorStop(1.0, '#d8d8d8');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 64, 128);
            return new THREE.CanvasTexture(canvas);
        }

// ---- source: createBotWGrassBladeGeometry ----
function createBotWGrassBladeGeometry(segments = 4) {
            const geo = new THREE.BufferGeometry();
            const positions = [];
            const uvs = [];
            const normals = [];
            const indices = [];

            const width = 0.145;
            const height = 0.98;

            for (let i = 0; i < segments; i++) {
                const t = i / segments;
                const w = width * (1.0 - t * 0.72);
                const y = height * t;

                positions.push(-w * 0.5, y, 0);
                uvs.push(0, t);
                normals.push(0, 1, 0);

                positions.push(w * 0.5, y, 0);
                uvs.push(1, t);
                normals.push(0, 1, 0);
            }
            // Single sharp tip vertex (segments * 2)
            positions.push(0, height, 0);
            uvs.push(0.5, 1.0);
            normals.push(0, 1, 0);

            for (let i = 0; i < segments - 1; i++) {
                const b = i * 2;
                indices.push(b, b + 1, b + 2);
                indices.push(b + 2, b + 1, b + 3);
            }
            const lastBase = (segments - 1) * 2;
            const tipIdx = segments * 2;
            indices.push(lastBase, lastBase + 1, tipIdx);

            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geo.setIndex(indices);
            return geo;
        }

// ---- source: applyStylizedCelShading ----
function applyStylizedCelShading(material, options = {}) {
            const rimStrength = options.rimStrength !== undefined ? options.rimStrength : 0.22;
            const shadowLift = options.shadowLift !== undefined ? options.shadowLift : 0.55;

            material.onBeforeCompile = (shader) => {
                shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
                shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
                shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
                shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
                shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
                shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
                shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;

                shader.vertexShader = `
                    varying vec3 vStylizedWorldPos;
                    varying vec3 vStylizedWorldNormal;
                ` + shader.vertexShader;

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    vStylizedWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                    vStylizedWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
                    `
                );

                if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                    shader.fragmentShader = `
                        uniform vec3 uSunDir;
                        uniform vec3 uSunColor;
                        uniform vec3 uShadowTint;
                        uniform vec3 uRimTint;
                        uniform vec3 uCampfirePos;
                        uniform vec3 uCampfireColor;
                        uniform float uCampfireStrength;
                        varying vec3 vStylizedWorldPos;
                        varying vec3 vStylizedWorldNormal;
                    ` + shader.fragmentShader;

                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <tonemapping_fragment>',
                        `
                        // T3 Hybrid Faceted Voxel Normals + 3-Tier Cel-AO + Palette Quantization
                        vec3 dpx = dFdx(vStylizedWorldPos);
                        vec3 dpy = dFdy(vStylizedWorldPos);
                        vec3 fCross = cross(dpx, dpy);
                        vec3 vN = normalize(vStylizedWorldNormal);
                        vec3 fN = length(fCross) > 1e-6 ? normalize(fCross) : vN;
                        if (dot(fN, vN) < 0.0) fN = -fN;
                        vec3 N = normalize(mix(vN, fN, 0.80));
                        vec3 L = normalize(uSunDir);
                        vec3 V = normalize(cameraPosition - vStylizedWorldPos);

                        vec3 sqA = sqrt(max(diffuseColor.rgb, vec3(0.0)));
                        vec3 qS = floor(sqA * 26.0 + 0.5) / 26.0;
                        vec3 qAlbedo = qS * qS;
                        float ndl = max(dot(N, L), 0.0);
                        float cel = ndl > 0.62 ? 1.0 : (ndl > 0.22 ? 0.75 : 0.45);
                        float ao = mix(0.76, 1.0, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
                        vec3 baseCol = qAlbedo * (0.34 + 0.66 * cel) * ao;
                        vec3 shadowCol = mix(baseCol * uShadowTint * 1.15, baseCol * ${shadowLift.toFixed(2)}, 0.45);
                        vec3 litCol = baseCol * mix(vec3(1.0), uSunColor * 1.04, 0.24);
                        vec3 celResult = mix(shadowCol, litCol, smoothstep(0.45, 1.0, cel));

                        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
                        celResult += mix(vec3(1.0, 0.96, 0.88), uRimTint, 0.45) * rim * ${Math.max(rimStrength, 0.16).toFixed(2)};

                        float fireDist = length(uCampfirePos - vStylizedWorldPos);
                        float fireAtten = (1.0 - smoothstep(1.5, 13.5, fireDist)) * uCampfireStrength;
                        celResult += diffuseColor.rgb * uCampfireColor * smoothstep(0.10, 0.65, fireAtten) * 0.48;

                        float expectedBase = max(length(diffuseColor.rgb) * 0.85, 0.001);
                        float engineRatio = clamp(length(outgoingLight) / expectedBase, 0.25, 1.25);
                        float castMask = smoothstep(0.30, 0.62, engineRatio);
                        outgoingLight = mix(shadowCol * 0.88, celResult, castMask) + totalEmissiveRadiance;
                        gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                        #include <tonemapping_fragment>
                        `
                    );
                }
            };
        }

// ---- source: mergeBufferGeometriesSimple ----
function mergeBufferGeometriesSimple(geos) {
            const merged = new THREE.BufferGeometry();
            const attrNames = Object.keys(geos[0].attributes);

            attrNames.forEach(name => {
                const itemSize = geos[0].attributes[name].itemSize;
                let totalLen = 0;
                geos.forEach(g => {
                    if (g.attributes[name]) totalLen += g.attributes[name].array.length;
                });
                const combined = new Float32Array(totalLen);
                let offset = 0;
                geos.forEach(g => {
                    const attr = g.attributes[name];
                    if (attr) {
                        combined.set(attr.array, offset);
                        offset += attr.array.length;
                    }
                });
                merged.setAttribute(name, new THREE.BufferAttribute(combined, itemSize));
            });

            if (geos[0].index) {
                const indices = [];
                let vertexOffset = 0;
                geos.forEach(g => {
                    const idxArr = g.index.array;
                    for (let i = 0; i < idxArr.length; i++) {
                        indices.push(idxArr[i] + vertexOffset);
                    }
                    vertexOffset += g.attributes.position.count;
                });
                merged.setIndex(indices);
            }
            return merged;
        }

// ---- source: createBotWBushLeafTexture ----
function createBotWBushLeafTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const leaves = [
                { x: 64, y: 88, r: 34, c: '#2e6f40' },
                { x: 42, y: 68, r: 30, c: '#3f8a4f' },
                { x: 86, y: 68, r: 30, c: '#3f8a4f' },
                { x: 52, y: 44, r: 28, c: '#5cb25d' },
                { x: 76, y: 44, r: 28, c: '#5cb25d' },
                { x: 64, y: 34, r: 24, c: '#80d16a' }
            ];
            leaves.forEach(lf => {
                ctx.fillStyle = lf.c;
                ctx.beginPath();
                ctx.arc(lf.x, lf.y, lf.r, 0, Math.PI * 2);
                ctx.fill();
            });
            const tex = new THREE.CanvasTexture(canvas);
            tex.encoding = THREE.sRGBEncoding;
            return tex;
        }

// ---- source: createBotWBush ----
function createBotWBush(x, z, scale = 1.0, hasBerries = false) {
            const bushGroup = new THREE.Group();
            const y = getTerrainHeight(x, z);
            bushGroup.position.set(x, y, z);
            bushGroup.scale.set(scale * 1.15, scale, scale * 1.15);

            const cardGeo = new THREE.PlaneGeometry(0.75, 0.75);
            for (let i = 0; i < 18; i++) {
                const phi = Math.acos(1 - (i + 0.5) / 18);
                const theta = i * 2.39996;
                const r = 0.42 + (i % 3) * 0.08;
                const card = new THREE.Mesh(cardGeo, bushLeafMat);
                card.position.set(
                    Math.sin(phi) * Math.cos(theta) * r,
                    Math.cos(phi) * r * 0.8 + 0.35,
                    Math.sin(phi) * Math.sin(theta) * r
                );
                card.lookAt(card.position.clone().multiplyScalar(2.0));
                card.rotation.z += (i % 5) * 0.4;
                card.castShadow = true;
                card.receiveShadow = true;
                bushGroup.add(card);
            }

            if (hasBerries) {
                const bGeo = new THREE.SphereGeometry(0.065, 6, 6);
                for (let b = 0; b < 5; b++) {
                    const bAng = (b / 5) * Math.PI * 2 + 0.4;
                    const berry = new THREE.Mesh(bGeo, berryMat);
                    berry.position.set(Math.cos(bAng) * 0.48, 0.38 + (b % 2) * 0.14, Math.sin(bAng) * 0.48);
                    bushGroup.add(berry);
                }
            }

            bushGroup.userData = {
                type: 'bush',
                name: hasBerries ? 'Semak Wildberry BotW' : 'Semak Rimbun Hyrule',
                baseScale: scale,
                rustleBoost: 0,
                isCut: false,
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + 0.5 * scale, z), 1.2 * scale)
            };
            interactiveBushes.push(bushGroup);
            scene.add(bushGroup);
            return bushGroup;
        }

// ---- source: createSculptedTrunkMesh ----
function createSculptedTrunkMesh(height, bottomRadius, topRadius, curveAmount, material, seed = 0) {
            const radialSegs = 7;
            const heightSegs = 10;
            const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, radialSegs, heightSegs);
            geo.translate(0, height * 0.5, 0);

            const pos = geo.attributes.position;
            const phase1 = (seed % 6.28);
            const phase2 = ((seed * 1.7) % 6.28);

            function getSpineAt(normY) {
                const t = THREE.MathUtils.clamp(normY, 0, 1);
                const sx = Math.sin(t * Math.PI * 1.15 + phase1) * curveAmount * t;
                const sz = Math.cos(t * Math.PI * 0.95 + phase2) * (curveAmount * 0.7) * t;
                return { x: sx, y: t * height, z: sz };
            }

            for (let i = 0; i < pos.count; i++) {
                let vx = pos.getX(i);
                let vy = pos.getY(i);
                let vz = pos.getZ(i);
                const normY = THREE.MathUtils.clamp(vy / height, 0, 1);

                // Root buttress flare near base
                if (normY < 0.18) {
                    const rootFactor = Math.pow(1.0 - normY / 0.18, 2.0);
                    const ang = Math.atan2(vz, vx);
                    const lobe = 1.0 + (0.35 + 0.22 * Math.sin(ang * 4.0 + phase1)) * rootFactor;
                    vx *= lobe;
                    vz *= lobe;
                }

                const spine = getSpineAt(normY);
                pos.setXYZ(i, vx + spine.x, vy, vz + spine.z);
            }

            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, material);
            mesh.userData.getSpineAt = getSpineAt;
            return mesh;
        }

// ---- source: addLowerDeadBranchStubs ----
function addLowerDeadBranchStubs(trunkMesh, height, scale, startNormY, seed) {
            const geos = [trunkMesh.geometry];
            const stubCount = 4;
            for (let i = 0; i < stubCount; i++) {
                const normY = THREE.MathUtils.lerp(0.11, Math.max(0.15, startNormY - 0.02), i / Math.max(1, stubCount - 1));
                const spine = trunkMesh.userData.getSpineAt(normY);
                const stubLen = (0.34 + (i % 3) * 0.14) * scale;
                const stubGeo = new THREE.CylinderGeometry(0.014 * scale, 0.036 * scale, stubLen, 5);
                stubGeo.translate(0, stubLen * 0.5, 0);
                stubGeo.rotateX(1.25 + ((i % 3) - 1) * 0.12);
                stubGeo.rotateY(i * 2.39996 + seed);
                stubGeo.translate(spine.x, spine.y, spine.z);
                geos.push(stubGeo);
            }
            trunkMesh.geometry = mergeBufferGeometriesSimple(geos);
        }

// ---- source: createBotWPineFanTexture ----
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

            const tex = new THREE.CanvasTexture(canvas);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = 4;
            return tex;
        }

// ---- source: injectBranchSocketWindShader ----
function injectBranchSocketWindShader(shader) {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;

            shader.vertexShader = `
                attribute vec3 aSocketPos;
                attribute vec3 aProjectedNormal;
                attribute vec3 aBranchInfo;
                uniform float uTime;
                uniform float uWindSpeed;
                varying float vHeightNorm;
                varying float vTierAO;
                varying float vTipMask;
                varying vec3 vPineWorldPos;
                varying vec3 vProjectedWorldNormal;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vec3 rel = transformed - aSocketPos;
                float distSocket = length(rel);
                float tipMask = smoothstep(0.06, 1.45, distSocket);
                float bPhase = aBranchInfo.x;
                float hNorm = aBranchInfo.y;
                float tierAO = aBranchInfo.z;

                // Pure rotation around the trunk spine socket (aSocketPos) so tiers never detach!
                float wTime = uTime * (1.35 + uWindSpeed * 0.45) + bPhase;
                float amp = (0.032 + 0.036 * hNorm) * uWindSpeed * tipMask;
                float rx = sin(wTime) * amp;
                float rz = cos(wTime * 1.12 + 0.4) * amp * 0.85;
                float cx = cos(rx), sx = sin(rx);
                float cz = cos(rz), sz = sin(rz);

                vec3 r1 = vec3(rel.x, rel.y * cx - rel.z * sx, rel.y * sx + rel.z * cx);
                vec3 r2 = vec3(r1.x * cz - r1.y * sz, r1.x * sz + r1.y * cz, r1.z);

                // Subtle outer needle-tip flutter along the scalloped rim
                float tipFlutter = sin(uTime * (2.5 + uWindSpeed * 0.75) + bPhase * 1.7) * 0.028 * uWindSpeed * tipMask * uv.y;
                transformed = aSocketPos + r2 + aProjectedNormal * (tipFlutter * 0.5);

                vHeightNorm = hNorm;
                vTierAO = tierAO;
                vTipMask = tipMask;
                vPineWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                // CRITICAL: Smooth projected conical/tier normal eliminates flat-plane faceting!
                vProjectedWorldNormal = normalize(mat3(modelMatrix) * aProjectedNormal);
                `
            );

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = `
                    uniform vec3 uSunDir;
                    uniform vec3 uSunColor;
                    uniform vec3 uShadowTint;
                    uniform vec3 uRimTint;
                    uniform vec3 uCampfirePos;
                    uniform vec3 uCampfireColor;
                    uniform float uCampfireStrength;
                    varying float vHeightNorm;
                    varying float vTierAO;
                    varying float vTipMask;
                    varying vec3 vPineWorldPos;
                    varying vec3 vProjectedWorldNormal;
                ` + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    `
                    vec3 N = normalize(vProjectedWorldNormal);
                    vec3 L = normalize(uSunDir);
                    vec3 V = normalize(cameraPosition - vPineWorldPos);

                    // T3 Hybrid 3-Tier Quantized Cel Shading for Pine Canopy
                    float ndl = max(dot(N, L), 0.0) * mix(0.62, 1.12, vTierAO);
                    float cel = ndl > 0.62 ? 1.0 : (ndl > 0.22 ? 0.75 : 0.45);

                    float crownLift = mix(0.86, 1.14, smoothstep(0.0, 1.0, vHeightNorm));
                    vec3 pineSq = sqrt(max(diffuseColor.rgb * crownLift, vec3(0.0)));
                    vec3 pineSqQ = floor(pineSq * 24.0 + 0.5) / 24.0;
                    vec3 baseLeaf = pineSqQ * pineSqQ;

                    vec3 coolShadow = mix(baseLeaf * uShadowTint * 1.28, baseLeaf * 0.54, 0.46);
                    vec3 sunlitPine = baseLeaf * (0.36 + 0.64 * cel) * mix(vec3(1.0), uSunColor, 0.28) * 1.10;
                    vec3 celColor = mix(coolShadow, sunlitPine, smoothstep(0.45, 1.0, cel));

                    // Warm Subsurface Backlight Glow on outer drooping pine tips
                    float sss = pow(clamp(dot(V, -L), 0.0, 1.0), 2.1) * smoothstep(0.35, 0.95, vTierAO);
                    celColor += baseLeaf * uSunColor * sss * 0.30;

                    // Crisp T3 Rim Highlight along sunlit silhouette fringe
                    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0) * smoothstep(0.20, 0.85, N.y * 0.5 + 0.5) * vTipMask;
                    celColor += uRimTint * rim * 0.22;

                    // Gently honor directional cast shadows from neighboring trees
                    float engineLightRatio = clamp(length(outgoingLight) / max(length(diffuseColor.rgb), 0.001), 0.35, 1.35);
                    float castShadowMask = smoothstep(0.36, 0.68, engineLightRatio);
                    outgoingLight = mix(coolShadow * 0.88, celColor, castShadowMask);

                    // Warm Campfire Bounce Glow on lower pine boughs
                    float fireDist = length(uCampfirePos - vPineWorldPos);
                    float fireGlow = (1.0 - smoothstep(2.0, 13.5, fireDist)) * uCampfireStrength;
                    outgoingLight += baseLeaf * uCampfireColor * smoothstep(0.15, 0.65, fireGlow) * 0.52;

                    gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                    #include <tonemapping_fragment>
                    `
                );
            }
        }

// ---- source: createBotWPinePadGeometry ----
function createBotWPinePadGeometry() {
            const width = 1.65;
            const length = 1.58;
            const geo = new THREE.PlaneGeometry(width, length, 4, 3);
            const pos = geo.attributes.position;
            const uv = geo.attributes.uv;

            for (let i = 0; i < pos.count; i++) {
                const u = uv.getX(i); // 0..1 across width
                const v = THREE.MathUtils.clamp(uv.getY(i), 0.0, 1.0); // 0 = trunk root, 1 = outer scalloped tip
                const xNorm = u * 2.0 - 1.0; // -1..+1

                // Fan taper: narrower at trunk root, broad & full toward the outer scalloped edge
                const fanWidthFactor = 0.48 + Math.sin(v * Math.PI * 0.78) * 0.62;
                const vx = xNorm * (width * 0.5) * fanWidthFactor;
                const vz = v * length - 0.14;

                // Classic BotW Cedar/Spruce Swoop: graceful droop downward + subtle upward curl at outer rim
                const droopY = -Math.pow(v, 1.32) * 0.56 + Math.pow(v, 2.8) * 0.24;
                // Soft shingle arch across width so adjacent pads wrap seamlessly around the tree
                const archY = -(xNorm * xNorm) * 0.24 * (0.28 + 0.72 * v);

                pos.setXYZ(i, vx, droopY + archY, vz);
            }
            geo.computeVertexNormals();
            return geo;
        }

// ---- source: createBotWPineTierSkirtGeometry ----
function createBotWPineTierSkirtGeometry(topR, bottomR, height, radialSegs = 7) {
            const geo = new THREE.CylinderGeometry(topR, bottomR, height, radialSegs, 2, true);
            // Position origin at the top center of the tier skirt
            geo.translate(0, -height * 0.5, 0);
            const pos = geo.attributes.position;
            const uv = geo.attributes.uv;

            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vy = pos.getY(i);
                const vz = pos.getZ(i);
                const ang = Math.atan2(vz, vx);
                const tDown = THREE.MathUtils.clamp(-vy / height, 0.0, 1.0);

                // Subtle organic evergreen scallop waves along the skirt rim
                const scallop = 1.0 + Math.sin(ang * radialSegs) * 0.09 * tDown;
                const swoopFlare = 1.0 + Math.pow(tDown, 1.8) * 0.16;
                pos.setXYZ(i, vx * scallop * swoopFlare, vy, vz * scallop * swoopFlare);

                // Map skirt UVs cleanly into the solid opaque green body of the pine fan texture
                const uTile = 0.24 + (Math.abs((uv.getX(i) * 3.0) % 2.0 - 1.0)) * 0.52;
                const vMap = THREE.MathUtils.lerp(0.16, 0.74, tDown);
                uv.setXY(i, uTile, vMap);
            }
            geo.computeVertexNormals();
            return geo;
        }

// ---- source: createStylizedPineTree ----
function createStylizedPineTree(x, z, scale = 1.0, variant = 'tall_alpine', colorKey = 'emerald') {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y, z);

            const seed = Math.abs(Math.sin(x * 19.3 + z * 37.7)) * 100;
            const castsShadow = Math.hypot(x, z) < 24.0;

            let height = 6.2 * scale;
            let startNormY = 0.22;
            let tierCount = 7;
            let maxSpread = 1.48;

            if (variant === 'broad_woodland') {
                height = 5.4 * scale;
                startNormY = 0.17;
                tierCount = 6;
                maxSpread = 1.62;
            } else if (variant === 'high_canopy') {
                height = 6.7 * scale;
                startNormY = 0.36;
                tierCount = 5;
                maxSpread = 1.46;
            } else if (variant === 'young_bushy') {
                height = 4.3 * scale;
                startNormY = 0.13;
                tierCount = 5;
                maxSpread = 1.32;
            }

            const canopy = new THREE.Group();
            group.add(canopy);

            // Warm stylized pine trunk with buttress roots & a few bare lower branch stubs
            const trunk = createSculptedTrunkMesh(height * 0.94, 0.32 * scale, 0.055 * scale, 0.18 * scale, trunkMat, seed);
            addLowerDeadBranchStubs(trunk, height * 0.94, scale, startNormY, seed);
            trunk.castShadow = castsShadow;
            canopy.add(trunk);

            const foliageGeos = [];
            const dummy = new THREE.Object3D();
            const crownMidY = height * (startNormY + 0.42);

            // Helper: Stamp socket anchor, smooth projected conical/tier normals & tier AO onto a foliage geometry
            function finalizeFoliagePiece(geo, spinePos, tierCenterY, tierRadius, normY, baseAO, phase, isInnerSkirt = false) {
                const posAttr = geo.attributes.position;
                const vCount = posAttr.count;
                const socketArr = new Float32Array(vCount * 3);
                const projNormArr = new Float32Array(vCount * 3);
                const infoArr = new Float32Array(vCount * 3);

                for (let v = 0; v < vCount; v++) {
                    const vx = posAttr.getX(v);
                    const vy = posAttr.getY(v);
                    const vz = posAttr.getZ(v);

                    const dx = vx - spinePos.x;
                    const dz = vz - spinePos.z;
                    const radialDist = Math.hypot(dx, dz);
                    const radialNorm = THREE.MathUtils.clamp(radialDist / Math.max(0.25, tierRadius * 1.15), 0.0, 1.0);

                    // PROJECTED CONICAL / TIER NORMAL:
                    // Outward from the trunk spine + pitched upward ~40 deg like a stylized BotW evergreen umbrella!
                    const outDir = radialDist > 0.001
                        ? new THREE.Vector3(dx / radialDist, 0.62 + (vy - tierCenterY) * 0.25, dz / radialDist).normalize()
                        : new THREE.Vector3(0, 1, 0);

                    // Blend gently with overall conical tree silhouette normal for seamless vertical shading
                    const coneN = new THREE.Vector3(
                        dx,
                        Math.max(0.25, (vy - crownMidY) * 0.35 + radialDist * 0.55),
                        dz
                    ).normalize();
                    const projN = outDir.lerp(coneN, 0.30).normalize();

                    // Per-vertex Tier Ambient Occlusion: darker tucked under the tier above, bright on outer sunlit tips
                    const vertAO = isInnerSkirt
                        ? THREE.MathUtils.clamp(baseAO * (0.68 + radialNorm * 0.32), 0.32, 0.72)
                        : THREE.MathUtils.clamp(baseAO * (0.58 + radialNorm * 0.52), 0.38, 1.0);

                    socketArr[v * 3] = spinePos.x;
                    socketArr[v * 3 + 1] = spinePos.y;
                    socketArr[v * 3 + 2] = spinePos.z;

                    projNormArr[v * 3] = projN.x;
                    projNormArr[v * 3 + 1] = projN.y;
                    projNormArr[v * 3 + 2] = projN.z;

                    infoArr[v * 3] = phase;
                    infoArr[v * 3 + 1] = normY;
                    infoArr[v * 3 + 2] = vertAO;
                }

                geo.setAttribute('aSocketPos', new THREE.BufferAttribute(socketArr, 3));
                geo.setAttribute('aProjectedNormal', new THREE.BufferAttribute(projNormArr, 3));
                geo.setAttribute('aBranchInfo', new THREE.BufferAttribute(infoArr, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(projNormArr, 3));
                foliageGeos.push(geo);
            }

            // 1. Build Stacked Volumetric BotW Evergreen Tiers (Bottom Widest -> Top Narrow Crown)
            for (let t = 0; t < tierCount; t++) {
                const progress = tierCount > 1 ? t / (tierCount - 1) : 1.0; // 0 = bottom, 1 = top
                const normY = THREE.MathUtils.lerp(startNormY, 0.89, progress);
                const spine = trunk.userData.getSpineAt(normY);

                const coneProfile = Math.pow(Math.max(0.08, 1.0 - progress * 0.76), 0.82);
                const tierRadius = scale * maxSpread * coneProfile * (0.94 + ((t * 17 + seed) % 7) * 0.02);
                const tierDropH = (0.72 + (1.0 - progress) * 0.36) * scale;
                const tierPhase = (seed + t * 0.95) % (Math.PI * 2);
                const tierBaseAO = THREE.MathUtils.lerp(0.76, 1.0, progress);

                // A) Volumetric Inner Fluted Evergreen Skirt (Fills interior mass with rich cool shadow depth)
                const skirtGeo = createBotWPineTierSkirtGeometry(
                    tierRadius * 0.16,
                    tierRadius * 0.78,
                    tierDropH,
                    7
                );
                skirtGeo.rotateY(t * 0.85 + seed);
                skirtGeo.translate(spine.x, spine.y + 0.14 * scale, spine.z);
                finalizeFoliagePiece(skirtGeo, spine, spine.y - tierDropH * 0.4, tierRadius, normY, tierBaseAO * 0.82, tierPhase, true);

                // B) Main Dense Overlapping Ring of Swooping BotW Pine Fan Pads
                const padCount = Math.round(THREE.MathUtils.lerp(9, 5, progress));
                const ringAngleOffset = t * 0.62 + (seed % 6.28);

                for (let p = 0; p < padCount; p++) {
                    const yawJitter = (((p * 19 + t * 13 + seed) % 11) - 5) * 0.032;
                    const yaw = ringAngleOffset + (p / padCount) * Math.PI * 2 + yawJitter;
                    const pitch = THREE.MathUtils.lerp(0.28, 0.08, progress) + (((p * 23 + t) % 7) - 3) * 0.028;
                    const roll = (((p * 29 + t) % 7) - 3) * 0.045;
                    const padScale = (tierRadius / 1.18) * (0.90 + ((p * 11 + t * 7) % 5) * 0.055);
                    const yJitter = (((p * 7 + t) % 5) - 2) * 0.04 * scale;

                    dummy.position.set(spine.x, spine.y + 0.08 * scale + yJitter, spine.z);
                    dummy.rotation.set(pitch, yaw, roll, 'YXZ');
                    dummy.scale.set(padScale * 1.06, padScale, padScale);
                    dummy.updateMatrix();

                    const padGeo = BASE_BOTW_PINE_PAD_GEO.clone();
                    padGeo.applyMatrix4(dummy.matrix);
                    const padPhase = (tierPhase + p * 0.55) % (Math.PI * 2);
                    finalizeFoliagePiece(padGeo, spine, spine.y, tierRadius, normY, tierBaseAO, padPhase, false);
                }

                // C) Staggered Upper Crown-Bridge Pads (Softens transitions between tiers just like BotW conifers!)
                if (t < tierCount - 1) {
                    const subNormY = Math.min(0.92, normY + 0.048);
                    const subSpine = trunk.userData.getSpineAt(subNormY);
                    const subCount = Math.max(4, padCount - 2);

                    for (let sp = 0; sp < subCount; sp++) {
                        const sYaw = ringAngleOffset + ((sp + 0.5) / subCount) * Math.PI * 2;
                        const sPitch = THREE.MathUtils.lerp(0.18, -0.02, progress);
                        const sScale = (tierRadius / 1.38) * (0.88 + ((sp * 13) % 5) * 0.04);

                        dummy.position.set(subSpine.x, subSpine.y + 0.06 * scale, subSpine.z);
                        dummy.rotation.set(sPitch, sYaw, 0.0, 'YXZ');
                        dummy.scale.set(sScale * 1.04, sScale, sScale);
                        dummy.updateMatrix();

                        const sPadGeo = BASE_BOTW_PINE_PAD_GEO.clone();
                        sPadGeo.applyMatrix4(dummy.matrix);
                        finalizeFoliagePiece(sPadGeo, subSpine, subSpine.y, tierRadius * 0.85, subNormY, Math.min(1.0, tierBaseAO * 1.06), (tierPhase + sp * 0.72) % (Math.PI * 2), false);
                    }
                }
            }

            // 2. Crisp Pointed BotW Evergreen Spire Crown (Top of the Pine Tree)
            const apexSpine = trunk.userData.getSpineAt(0.95);
            const apexRadius = scale * maxSpread * 0.34;
            const spireSkirt = createBotWPineTierSkirtGeometry(0.02 * scale, apexRadius * 0.95, 0.85 * scale, 6);
            spireSkirt.translate(apexSpine.x, apexSpine.y + 0.52 * scale, apexSpine.z);
            finalizeFoliagePiece(spireSkirt, apexSpine, apexSpine.y + 0.25 * scale, apexRadius, 0.98, 1.0, seed % 6.28, false);

            for (let c = 0; c < 4; c++) {
                const cYaw = (c / 4) * Math.PI * 2 + seed;
                const cScale = scale * maxSpread * 0.36;
                dummy.position.set(apexSpine.x, apexSpine.y + 0.10 * scale, apexSpine.z);
                dummy.rotation.set(-0.46, cYaw, 0.0, 'YXZ');
                dummy.scale.set(cScale, cScale, cScale * 1.15);
                dummy.updateMatrix();

                const cPadGeo = BASE_BOTW_PINE_PAD_GEO.clone();
                cPadGeo.applyMatrix4(dummy.matrix);
                finalizeFoliagePiece(cPadGeo, apexSpine, apexSpine.y + 0.2 * scale, apexRadius, 0.99, 1.0, (seed + c) % 6.28, false);
            }

            const pal = PINE_PALETTES[colorKey] || PINE_PALETTES.emerald;
            const mergedFoliage = mergeBufferGeometriesSimple(foliageGeos);
            const foliageMesh = new THREE.Mesh(mergedFoliage, pineMaterials[colorKey] || pineMaterials.emerald);
            foliageMesh.customDepthMaterial = pineDepthMaterials[colorKey] || pineDepthMaterials.emerald;
            foliageMesh.castShadow = castsShadow;
            foliageMesh.receiveShadow = true;
            canopy.add(foliageMesh);

            const treeData = {
                type: 'tree',
                name: pal.name,
                treeKind: 'pine',
                canopy: canopy,
                foliageMesh: foliageMesh,
                naturalColorKey: colorKey,
                phase: rnd() * Math.PI * 2,
                rustleBoost: 0,
                leafColor: new THREE.Color(pal.burstColor),
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + height * 0.55, z), height * 0.78)
            };

            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
            return group;
        }

// ---- source: createStylizedDeadPine ----
function createStylizedDeadPine(x, z, scale = 1.0) {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y, z);

            const height = 4.4 * scale;
            const canopy = new THREE.Group();
            group.add(canopy);

            const trunk = createSculptedTrunkMesh(height, 0.25 * scale, 0.05 * scale, 0.32 * scale, deadWoodMat, x * 12 + z);
            const geos = [trunk.geometry];

            for (let i = 0; i < 9; i++) {
                const normY = 0.28 + (i / 9) * 0.65;
                const spine = trunk.userData.getSpineAt(normY);
                const len = (1.1 - normY * 0.65) * scale;
                const stub = new THREE.CylinderGeometry(0.015 * scale, 0.045 * scale, len, 5);
                stub.translate(0, len * 0.5, 0);
                stub.rotateX(1.1 + (i % 3) * 0.15);
                stub.rotateY(i * 2.4);
                stub.translate(spine.x, spine.y, spine.z);
                geos.push(stub);
            }

            trunk.geometry = mergeBufferGeometriesSimple(geos);
            canopy.add(trunk);

            const treeData = {
                type: 'tree',
                name: 'Pohon Pinus Kering',
                treeKind: 'dead',
                canopy: canopy,
                foliageMesh: null,
                phase: rnd() * Math.PI * 2,
                rustleBoost: 0,
                leafColor: new THREE.Color(0x9c7a54),
                boundingSphere: new THREE.Sphere(new THREE.Vector3(x, y + height * 0.5, z), height * 0.65)
            };
            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
            return group;
        }

// ---- source: createFluffyZeldaLeafCardTexture ----
function createFluffyZeldaLeafCardTexture(palette) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 256, 256);

            // Helper to draw an individual stylized Zelda/Ghibli broad ovate leaf with subtle midrib
            function drawStylizedBroadLeaf(cx, cy, length, width, angle, colBase, colMid, colTip) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(angle);

                const grad = ctx.createLinearGradient(0, 0, 0, -length);
                grad.addColorStop(0.0, colBase);
                grad.addColorStop(0.52, colMid);
                grad.addColorStop(1.0, colTip);

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.bezierCurveTo(-width * 0.85, -length * 0.28, -width * 0.95, -length * 0.76, 0, -length);
                ctx.bezierCurveTo(width * 0.95, -length * 0.76, width * 0.85, -length * 0.28, 0, 0);
                ctx.closePath();
                ctx.fill();

                // Soft painterly highlight along one side of the leaf blade
                ctx.fillStyle = colTip;
                ctx.globalAlpha = 0.28;
                ctx.beginPath();
                ctx.moveTo(0, -length * 0.12);
                ctx.bezierCurveTo(-width * 0.55, -length * 0.34, -width * 0.58, -length * 0.72, 0, -length * 0.92);
                ctx.bezierCurveTo(-width * 0.12, -length * 0.65, -width * 0.10, -length * 0.32, 0, -length * 0.12);
                ctx.fill();

                // Subtle central vein
                ctx.globalAlpha = 0.22;
                ctx.strokeStyle = colTip;
                ctx.lineWidth = 2.2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, -length * 0.10);
                ctx.lineTo(0, -length * 0.82);
                ctx.stroke();

                ctx.restore();
            }

            // Soft inner core fill so overlapping scattered cards never leave harsh holes
            const coreGrad = ctx.createRadialGradient(128, 148, 12, 128, 148, 76);
            coreGrad.addColorStop(0.0, palette.base);
            coreGrad.addColorStop(0.7, palette.shadow);
            coreGrad.addColorStop(1.0, 'rgba(40, 85, 60, 0.0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(128, 148, 76, 0, Math.PI * 2);
            ctx.fill();

            // Back layer of fanned broad leaves
            const backLeaves = [
                { x: 108, y: 196, len: 118, w: 46, ang: -0.72 },
                { x: 148, y: 196, len: 118, w: 46, ang: 0.72 },
                { x: 118, y: 204, len: 110, w: 44, ang: -1.18 },
                { x: 138, y: 204, len: 110, w: 44, ang: 1.18 },
                { x: 128, y: 188, len: 132, w: 50, ang: 0.0 }
            ];
            backLeaves.forEach(l => {
                drawStylizedBroadLeaf(l.x, l.y, l.len, l.w, l.ang, palette.shadow, palette.base, palette.mid);
            });

            // Mid & front layer of fluffy overlapping leaf blades (gives crisp leafy silhouette on inspect)
            const frontLeaves = [
                { x: 116, y: 184, len: 126, w: 48, ang: -0.42, c1: palette.base, c2: palette.mid, c3: palette.tip },
                { x: 140, y: 184, len: 126, w: 48, ang: 0.42, c1: palette.base, c2: palette.mid, c3: palette.tip },
                { x: 102, y: 176, len: 106, w: 42, ang: -0.88, c1: palette.base, c2: palette.mid, c3: palette.tip },
                { x: 154, y: 176, len: 106, w: 42, ang: 0.88, c1: palette.base, c2: palette.mid, c3: palette.tip },
                { x: 128, y: 172, len: 134, w: 52, ang: -0.06, c1: palette.mid, c2: palette.tip, c3: palette.highlight },
                { x: 122, y: 162, len: 105, w: 42, ang: -0.26, c1: palette.mid, c2: palette.tip, c3: palette.highlight },
                { x: 136, y: 162, len: 105, w: 42, ang: 0.28, c1: palette.mid, c2: palette.tip, c3: palette.highlight }
            ];
            frontLeaves.forEach(l => {
                drawStylizedBroadLeaf(l.x, l.y, l.len, l.w, l.ang, l.c1, l.c2, l.c3);
            });

            const tex = new THREE.CanvasTexture(canvas);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = 4;
            return tex;
        }

// ---- source: injectFluffyZeldaLeafShader ----
function injectFluffyZeldaLeafShader(shader) {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
            shader.uniforms.uSunDir = celShaderUniforms.uSunDir;
            shader.uniforms.uSunColor = celShaderUniforms.uSunColor;
            shader.uniforms.uShadowTint = celShaderUniforms.uShadowTint;
            shader.uniforms.uRimTint = celShaderUniforms.uRimTint;
            shader.uniforms.uCampfirePos = celShaderUniforms.uCampfirePos;
            shader.uniforms.uCampfireColor = celShaderUniforms.uCampfireColor;
            shader.uniforms.uCampfireStrength = celShaderUniforms.uCampfireStrength;

            shader.vertexShader = `
                attribute vec3 aSocketPos;
                attribute vec3 aProjectedNormal;
                attribute vec3 aBranchInfo;
                uniform float uTime;
                uniform float uWindSpeed;
                varying float vFoliageAO;
                varying float vHeightNorm;
                varying vec3 vFluffyWorldPos;
                varying vec3 vProjectedWorldNormal;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vec3 relPos = transformed - aSocketPos;
                float distFromSocket = length(relPos);
                float tipFactor = smoothstep(0.05, 1.45, distFromSocket);

                float cardPhase = aBranchInfo.x;
                float heightNorm = aBranchInfo.y;
                float foliageAO = aBranchInfo.z;

                // 1. Cohesive branch lobe sway around its wooden branch socket
                float swayTime = uTime * (1.35 + uWindSpeed * 0.48) + cardPhase * 0.25;
                float amp = (0.032 + 0.028 * heightNorm) * uWindSpeed * tipFactor;
                float rx = sin(swayTime) * amp;
                float rz = cos(swayTime * 1.12 + 0.6) * amp;
                float cx = cos(rx), sx = sin(rx);
                float cz = cos(rz), sz = sin(rz);

                vec3 r1 = vec3(relPos.x, relPos.y * cx - relPos.z * sx, relPos.y * sx + relPos.z * cx);
                vec3 r2 = vec3(r1.x * cz - r1.y * sz, r1.x * sz + r1.y * cz, r1.z);

                // 2. Gentle individual leaf-card flutter along the outer silhouette tips (uv.y)
                float leafFlutter = sin(uTime * (2.6 + uWindSpeed * 0.85) + cardPhase) * 0.042 * uWindSpeed * uv.y;
                vec3 flutterOffset = aProjectedNormal * (leafFlutter * 0.45) + vec3(leafFlutter, 0.0, -leafFlutter * 0.7);

                transformed = aSocketPos + r2 + flutterOffset;

                vFoliageAO = foliageAO;
                vHeightNorm = heightNorm;
                vFluffyWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                // CRITICAL: Use the Projected Vertex Normal from the Scatter Base Lobe Surface!
                vProjectedWorldNormal = normalize(mat3(modelMatrix) * aProjectedNormal);
                `
            );

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = `
                    uniform vec3 uSunDir;
                    uniform vec3 uSunColor;
                    uniform vec3 uShadowTint;
                    uniform vec3 uRimTint;
                    uniform vec3 uCampfirePos;
                    uniform vec3 uCampfireColor;
                    uniform float uCampfireStrength;
                    varying float vFoliageAO;
                    varying float vHeightNorm;
                    varying vec3 vFluffyWorldPos;
                    varying vec3 vProjectedWorldNormal;
                ` + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    `
                    vec3 N = normalize(vProjectedWorldNormal);
                    vec3 L = normalize(uSunDir);
                    vec3 V = normalize(cameraPosition - vFluffyWorldPos);

                    // T3 Hybrid 3-Tier Quantized Cel Shading for Deciduous Foliage
                    float ndl = max(dot(N, L), 0.0) * mix(0.65, 1.10, vFoliageAO);
                    float cel = ndl > 0.62 ? 1.0 : (ndl > 0.22 ? 0.75 : 0.45);

                    float crownLift = mix(0.90, 1.12, smoothstep(0.0, 1.0, vHeightNorm));
                    vec3 decSq = sqrt(max(diffuseColor.rgb * crownLift, vec3(0.0)));
                    vec3 decSqQ = floor(decSq * 24.0 + 0.5) / 24.0;
                    vec3 baseLeaf = decSqQ * decSqQ;

                    vec3 deepCanopyShadow = mix(baseLeaf * uShadowTint * 1.32, baseLeaf * 0.58, 0.48);
                    vec3 sunlitCanopy = baseLeaf * (0.36 + 0.64 * cel) * mix(vec3(1.0), uSunColor, 0.30) * 1.12;
                    vec3 fluffyColor = mix(deepCanopyShadow, sunlitCanopy, smoothstep(0.45, 1.0, cel));

                    // Subsurface Scattering (Warm translucent glow on backlit leaf puffs)
                    float sss = pow(clamp(dot(V, -L), 0.0, 1.0), 2.0) * smoothstep(0.35, 0.95, vFoliageAO);
                    fluffyColor += baseLeaf * uSunColor * sss * 0.34;

                    // Crisp T3 rim highlight
                    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0) * smoothstep(0.2, 0.85, N.y * 0.5 + 0.5);
                    fluffyColor += uRimTint * rim * 0.20;

                    // Blend gently with Three.js cast shadow map
                    float engineLightRatio = clamp(length(outgoingLight) / max(length(diffuseColor.rgb), 0.001), 0.35, 1.35);
                    float castShadowMask = smoothstep(0.36, 0.68, engineLightRatio);
                    outgoingLight = mix(deepCanopyShadow * 0.90, fluffyColor, castShadowMask);

                    // Warm campfire bounce light on lower leaves
                    float fireDist = length(uCampfirePos - vFluffyWorldPos);
                    float fireGlow = (1.0 - smoothstep(2.5, 13.5, fireDist)) * uCampfireStrength;
                    outgoingLight += baseLeaf * uCampfireColor * smoothstep(0.15, 0.65, fireGlow) * 0.52;

                    gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                    #include <tonemapping_fragment>
                    `
                );
            }
        }

// ---- source: createCurvedLeafTuftCardGeometry ----
function createCurvedLeafTuftCardGeometry() {
            const geo = new THREE.PlaneGeometry(1.0, 1.0, 2, 2);
            // Shift pivot near the bottom stem of the leaf cluster
            geo.translate(0, 0.36, 0);
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vy = pos.getY(i);
                // Subtle spherical cup + outward curve at the leaf tip
                const radial = vx * vx + (vy - 0.36) * (vy - 0.36);
                const vz = -radial * 0.22 + Math.pow(Math.max(0, vy), 1.6) * 0.12;
                pos.setZ(i, vz);
            }
            geo.computeVertexNormals();
            return geo;
        }

// ---- source: createBotWDeciduousTree ----
function createBotWDeciduousTree(x, z, scale = 1.0, colorKey = 'emerald') {
            const group = new THREE.Group();
            const y = getTerrainHeight(x, z);
            group.position.set(x, y, z);

            const seed = Math.abs(Math.sin(x * 23.4 + z * 51.2)) * 100;
            const distFromOrigin = Math.hypot(x, z);
            const castsShadow = distFromOrigin < 24.0;

            const trunkHeight = 3.85 * scale;
            const canopy = new THREE.Group();
            group.add(canopy);

            // 1. Sculpted Zelda-style organic trunk with root flare
            const trunk = createSculptedTrunkMesh(
                trunkHeight,
                0.42 * scale,
                0.17 * scale,
                0.28 * scale,
                trunkMat,
                seed
            );

            const boughWoodGeos = [trunk.geometry];
            const scatteredLeafCardGeos = [];
            const GOLDEN_ANGLE = 2.399963229728653;
            const treeCrownCenter = new THREE.Vector3(0, trunkHeight * 1.08, 0);

            // Forest-Pack style surface scatterer on an ellipsoidal canopy lobe with Projected Vertex Normals
            function scatterLeavesOnCanopyLobe(lobeCenter, socketPos, radiusX, radiusY, radiusZ, cardCount, heightNorm, phaseSeed) {
                const dummy = new THREE.Object3D();
                const upVec = new THREE.Vector3(0, 1, 0);

                // Inner core crossed cards + Outer shell Forest-Pack scattered cards
                const totalCards = cardCount + 6;
                for (let c = 0; c < totalCards; c++) {
                    const isCore = c < 6;
                    let dir, shellDist, cardScale;

                    if (isCore) {
                        // Dense inner core cards so you can never see empty holes through the canopy
                        const corePhi = Math.acos(1.0 - ((c + 0.5) / 6) * 1.6);
                        const coreTheta = c * GOLDEN_ANGLE + phaseSeed;
                        dir = new THREE.Vector3(
                            Math.sin(corePhi) * Math.cos(coreTheta),
                            Math.cos(corePhi),
                            Math.sin(corePhi) * Math.sin(coreTheta)
                        ).normalize();
                        shellDist = 0.28;
                        cardScale = (radiusX + radiusY) * 0.62;
                    } else {
                        // Fibonacci sphere distribution across the scatter base surface
                        const idx = c - 6;
                        const u = (idx + 0.5) / cardCount;
                        // Concentrate slightly more on upper & outer hemisphere (y from -0.62 to +1.0)
                        const cosPhi = 1.0 - u * 1.62;
                        const sinPhi = Math.sqrt(Math.max(0.0, 1.0 - cosPhi * cosPhi));
                        const theta = idx * GOLDEN_ANGLE + phaseSeed;

                        dir = new THREE.Vector3(
                            sinPhi * Math.cos(theta),
                            cosPhi,
                            sinPhi * Math.sin(theta)
                        ).normalize();
                        shellDist = 0.72 + ((idx * 37) % 11) / 11.0 * 0.26;
                        cardScale = (radiusX * 0.68) * (0.86 + ((idx * 19) % 7) / 7.0 * 0.34);
                    }

                    // Position on the ellipsoidal scatter base surface
                    const px = lobeCenter.x + dir.x * radiusX * shellDist;
                    const py = lobeCenter.y + dir.y * radiusY * shellDist;
                    const pz = lobeCenter.z + dir.z * radiusZ * shellDist;

                    // Orient card tangent to the lobe surface + fluff outward so leaf tips burst around the silhouette
                    dummy.position.set(px, py, pz);
                    const targetPt = new THREE.Vector3(px + dir.x, py + dir.y * 0.85 + 0.35, pz + dir.z);
                    dummy.lookAt(targetPt);
                    // Random spin around surface normal + outward flare tilt
                    dummy.rotateZ(((c * 53 + phaseSeed) % 100) / 100 * Math.PI * 2);
                    dummy.rotateX(-0.32 - (isCore ? 0.0 : 0.22));
                    dummy.scale.set(cardScale, cardScale, cardScale);
                    dummy.updateMatrix();

                    const cardGeo = BASE_FLUFFY_LEAF_CARD_GEO.clone();
                    cardGeo.applyMatrix4(dummy.matrix);

                    const posAttr = cardGeo.attributes.position;
                    const vCount = posAttr.count;
                    const socketArr = new Float32Array(vCount * 3);
                    const projNormArr = new Float32Array(vCount * 3);
                    const infoArr = new Float32Array(vCount * 3);
                    const cardPhase = (phaseSeed + c * 0.91) % (Math.PI * 2);

                    for (let iv = 0; iv < vCount; iv++) {
                        const vx = posAttr.getX(iv);
                        const vy = posAttr.getY(iv);
                        const vz = posAttr.getZ(iv);

                        // PROJECTED VERTEX NORMAL off the Scatter Base Lobe Surface
                        // Blended 80% from local lobe ellipsoid normal + 20% from overall tree crown dome normal
                        const localNx = (vx - lobeCenter.x) / (radiusX * radiusX);
                        const localNy = (vy - lobeCenter.y) / (radiusY * radiusY);
                        const localNz = (vz - lobeCenter.z) / (radiusZ * radiusZ);
                        const localN = new THREE.Vector3(localNx, localNy + 0.15, localNz).normalize();

                        const globalN = new THREE.Vector3(
                            vx - treeCrownCenter.x,
                            (vy - treeCrownCenter.y) * 1.15 + 0.35,
                            vz - treeCrownCenter.z
                        ).normalize();

                        const projN = localN.lerp(globalN, 0.24).normalize();

                        // Per-vertex Spherical Ambient Occlusion (outer & upper vertices are brightest)
                        const relY = (vy - lobeCenter.y) / radiusY;
                        const radialOut = Math.hypot((vx - lobeCenter.x) / radiusX, (vz - lobeCenter.z) / radiusZ);
                        const ao = isCore
                            ? 0.48
                            : THREE.MathUtils.clamp(0.52 + radialOut * 0.34 + relY * 0.24, 0.38, 1.0);

                        socketArr[iv * 3] = socketPos.x;
                        socketArr[iv * 3 + 1] = socketPos.y;
                        socketArr[iv * 3 + 2] = socketPos.z;

                        projNormArr[iv * 3] = projN.x;
                        projNormArr[iv * 3 + 1] = projN.y;
                        projNormArr[iv * 3 + 2] = projN.z;

                        infoArr[iv * 3] = cardPhase;
                        infoArr[iv * 3 + 1] = heightNorm;
                        infoArr[iv * 3 + 2] = ao;
                    }

                    cardGeo.setAttribute('aSocketPos', new THREE.BufferAttribute(socketArr, 3));
                    cardGeo.setAttribute('aProjectedNormal', new THREE.BufferAttribute(projNormArr, 3));
                    cardGeo.setAttribute('aBranchInfo', new THREE.BufferAttribute(infoArr, 3));
                    // Also override base normal for shadow/depth consistency
                    cardGeo.setAttribute('normal', new THREE.BufferAttribute(projNormArr, 3));
                    scatteredLeafCardGeos.push(cardGeo);
                }
            }

            // 2. Sculpted spreading wooden boughs + multi-lobed Fluffy Zelda canopy puffs
            const boughSpecs = [
                { normY: 0.58, yawOff: 0.0, pitch: 0.78, len: 1.75, rx: 1.38, ry: 1.05, rz: 1.38, cards: 24 },
                { normY: 0.66, yawOff: 2.15, pitch: 0.72, len: 1.85, rx: 1.48, ry: 1.12, rz: 1.45, cards: 26 },
                { normY: 0.74, yawOff: 4.25, pitch: 0.68, len: 1.70, rx: 1.42, ry: 1.08, rz: 1.42, cards: 25 },
                { normY: 0.82, yawOff: 1.08, pitch: 0.58, len: 1.55, rx: 1.35, ry: 1.05, rz: 1.35, cards: 24 },
                { normY: 0.88, yawOff: 3.35, pitch: 0.52, len: 1.45, rx: 1.32, ry: 1.02, rz: 1.32, cards: 22 }
            ];

            boughSpecs.forEach((spec, idx) => {
                const spine = trunk.userData.getSpineAt(spec.normY);
                const yaw = spec.yawOff + (seed % 6.28);
                const branchLen = spec.len * scale;

                const dirX = Math.sin(spec.pitch) * Math.sin(yaw);
                const dirY = Math.cos(spec.pitch);
                const dirZ = Math.sin(spec.pitch) * Math.cos(yaw);

                // Tapered main branch + secondary elbow twig
                const bGeo = new THREE.CylinderGeometry(0.055 * scale, 0.145 * scale, branchLen, 6);
                bGeo.translate(0, branchLen * 0.5, 0);
                bGeo.rotateX(spec.pitch);
                bGeo.rotateY(yaw);
                bGeo.translate(spine.x, spine.y, spine.z);
                boughWoodGeos.push(bGeo);

                const socketPos = new THREE.Vector3(spine.x, spine.y, spine.z);
                const tipCenter = new THREE.Vector3(
                    spine.x + dirX * branchLen,
                    spine.y + dirY * branchLen + 0.24 * scale,
                    spine.z + dirZ * branchLen
                );

                // Main fluffy lobe at the end of this bough
                scatterLeavesOnCanopyLobe(
                    tipCenter,
                    socketPos,
                    spec.rx * scale,
                    spec.ry * scale,
                    spec.rz * scale,
                    spec.cards,
                    spec.normY,
                    seed + idx * 3.1
                );

                // Secondary sub-puff on alternating branches for rich asymmetrical Zelda silhouette
                if (idx % 2 === 0) {
                    const subYaw = yaw + 0.55;
                    const subCenter = new THREE.Vector3(
                        tipCenter.x + Math.sin(subYaw) * 0.68 * scale,
                        tipCenter.y - 0.22 * scale,
                        tipCenter.z + Math.cos(subYaw) * 0.68 * scale
                    );
                    scatterLeavesOnCanopyLobe(
                        subCenter,
                        socketPos,
                        0.96 * scale,
                        0.78 * scale,
                        0.96 * scale,
                        14,
                        spec.normY * 0.92,
                        seed + idx * 5.7
                    );
                }
            });

            // 3. Lush Upper Crown Dome Lobe (Anchors the top of the Fluffy Zelda Tree silhouette)
            const topSpine = trunk.userData.getSpineAt(0.98);
            const topSocket = new THREE.Vector3(topSpine.x, topSpine.y, topSpine.z);
            const crownCenter = new THREE.Vector3(
                topSpine.x,
                topSpine.y + 1.05 * scale,
                topSpine.z
            );
            scatterLeavesOnCanopyLobe(
                crownCenter,
                topSocket,
                1.72 * scale,
                1.32 * scale,
                1.72 * scale,
                32,
                0.98,
                seed + 17.3
            );

            trunk.geometry = mergeBufferGeometriesSimple(boughWoodGeos);
            trunk.castShadow = castsShadow;
            canopy.add(trunk);

            const pal = PINE_PALETTES[colorKey] || PINE_PALETTES.emerald;
            const foliageMat = deciduousMaterials[colorKey] || deciduousMaterials.emerald;
            const foliageDepthMat = deciduousDepthMaterials[colorKey] || deciduousDepthMaterials.emerald;

            const mergedCloudGeo = mergeBufferGeometriesSimple(scatteredLeafCardGeos);
            const foliageMesh = new THREE.Mesh(mergedCloudGeo, foliageMat);
            foliageMesh.customDepthMaterial = foliageDepthMat;
            foliageMesh.castShadow = castsShadow;
            foliageMesh.receiveShadow = true;
            canopy.add(foliageMesh);

            const treeData = {
                type: 'tree',
                name: `Fluffy Tree Zelda Style (${pal.name})`,
                treeKind: 'deciduous',
                canopy: canopy,
                foliageMesh: foliageMesh,
                naturalColorKey: colorKey,
                phase: rnd() * Math.PI * 2,
                rustleBoost: 0,
                leafColor: new THREE.Color(pal.burstColor),
                boundingSphere: new THREE.Sphere(
                    new THREE.Vector3(x, y + trunkHeight * 0.95, z),
                    trunkHeight * 1.15
                )
            };

            group.userData = treeData;
            swayingCanopies.push(treeData);
            interactiveTrees.push(group);
            scene.add(group);
            return group;
        }

// ---- source: createBotWWaterDataTexture ----
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
                    data[idx + 3] = Math.floor(foamNoise * 255);        // A: Cellular Foam Mask
                }
            }

            ctx.putImageData(imgData, 0, 0);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

// ---- source: getTerrainNormal ----
function getTerrainNormal(x, z) {
            const eps = 0.25;
            const hL = getTerrainHeight(x - eps, z);
            const hR = getTerrainHeight(x + eps, z);
            const hD = getTerrainHeight(x, z - eps);
            const hU = getTerrainHeight(x, z + eps);
            return new THREE.Vector3(hL - hR, 2.0 * eps, hD - hU).normalize();
        }

const PINE_PALETTES = {
            emerald: {
                name: 'BotW Soft Emerald',
                shadow: '#23533d',
                base: '#316e4c',
                mid: '#499260',
                tip: '#6eb874',
                highlight: '#9ce08d',
                burstColor: 0x6eb874
            },
            teal: {
                name: 'BotW Soft Spruce',
                shadow: '#214e52',
                base: '#2e696a',
                mid: '#448c87',
                tip: '#67b3a6',
                highlight: '#96decb',
                burstColor: 0x67b3a6
            },
            olive: {
                name: 'BotW Sunlit Meadow',
                shadow: '#355834',
                base: '#4b7642',
                mid: '#6a9c53',
                tip: '#92c468',
                highlight: '#bce38a',
                burstColor: 0x92c468
            }
        };

const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x6e4730,
            roughness: 0.88,
            metalness: 0.0
        });

const deadWoodMat = new THREE.MeshStandardMaterial({
            color: 0x7d6552,
            roughness: 0.92,
            metalness: 0.0
        });

const bushLeafMat = new THREE.MeshStandardMaterial({
            map: createBotWBushLeafTexture(),
            alphaTest: 0.4,
            side: THREE.DoubleSide,
            roughness: 0.82
        });

const berryMat = new THREE.MeshStandardMaterial({
            color: 0xff3b56,
            emissive: 0x991122,
            emissiveIntensity: 0.2,
            roughness: 0.35
        });

const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.88 });

const BASE_BOTW_PINE_PAD_GEO = createBotWPinePadGeometry();

const BASE_FLUFFY_LEAF_CARD_GEO = createCurvedLeafTuftCardGeometry();

Object.keys(PINE_PALETTES).forEach(key => {
  const pal = PINE_PALETTES[key];
  const tex = createBotWPineFanTexture(pal);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.84, metalness: 0.0 });
  mat.onBeforeCompile = injectBranchSocketWindShader;
  pineMaterials[key] = mat;
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.40 });
  depthMat.onBeforeCompile = injectBranchSocketWindShader;
  pineDepthMaterials[key] = depthMat;
});
Object.keys(PINE_PALETTES).forEach(key => {
  const pal = PINE_PALETTES[key];
  const tex = createFluffyZeldaLeafCardTexture(pal);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = injectFluffyZeldaLeafShader;
  deciduousMaterials[key] = mat;
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.38 });
  depthMat.onBeforeCompile = injectFluffyZeldaLeafShader;
  deciduousDepthMaterials[key] = depthMat;
});
applyStylizedCelShading(trunkMat, { rimStrength: 0.18, shadowLift: 0.55 });
applyStylizedCelShading(deadWoodMat, { rimStrength: 0.15, shadowLift: 0.52 });
applyStylizedCelShading(bushLeafMat, { rimStrength: 0.25, shadowLift: 0.58 });
applyStylizedCelShading(rockMat, { rimStrength: 0.18, shadowLift: 0.52 });


const grassMat = new THREE.MeshStandardMaterial({
            roughness: 0.78,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

grassMat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, grassUniforms);

            shader.vertexShader = `
                attribute vec4 aBladeParams;
                uniform float uTime;
                uniform float uWindSpeed;
                uniform float uSwayScale;
                uniform float uBladeBendDistance;
                uniform float uBladeBendCurve;
                uniform sampler2D uWindMap;
                uniform sampler2D uGrassMap;

                varying vec2 vGrassUv;
                varying vec3 vGrassWorldPos;
                varying float vWindShimmer;
                varying float vBladeColorVar;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vGrassUv = uv;
                vBladeColorVar = aBladeParams.w;

                vec3 worldRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                vec2 mapUV = worldRoot.xz / ${GRASS_WORLD_SPAN.toFixed(1)} + 0.5;
                float visibility = texture2D(uGrassMap, mapUV).r;
                float grassScale = smoothstep(0.12, 0.55, visibility);

                float t = uv.y;
                float isBent = step(0.01, t);

                // Forward curvature (pow(t, _BladeBendCurve) * _BladeBendDistance)
                float bendAmt = pow(t, uBladeBendCurve) * (uBladeBendDistance + aBladeParams.y * 0.22);
                transformed.x *= aBladeParams.x * grassScale;
                transformed.y *= aBladeParams.z * uSwayScale * grassScale;
                transformed.z += bendAmt * isBent * grassScale;

                // Scrolling _WindMap Flow Texture Lookup
                vec2 windUV = worldRoot.xz * 0.045 + vec2(uTime * 0.08 * uWindSpeed, uTime * 0.06 * uWindSpeed);
                vec2 windSample = (texture2D(uWindMap, windUV).rg * 2.0 - 1.0) * uWindSpeed;
                float windWave = sin(dot(worldRoot.xz, vec2(0.32, 0.24)) + uTime * 2.3 * uWindSpeed) * 0.5 + 0.5;
                vWindShimmer = smoothstep(0.58, 0.88, windWave) * t;

                transformed.x += windSample.x * 0.28 * t * isBent * grassScale;
                transformed.z += windSample.y * 0.28 * t * isBent * grassScale;

                vGrassWorldPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
                `
            );

            if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
                shader.fragmentShader = `
                    uniform vec3 uBaseColor;
                    uniform vec3 uTipColor;
                    uniform sampler2D uBladeTex;
                    uniform vec3 uSunDir;
                    uniform vec3 uSunColor;
                    uniform vec3 uCampfirePos;
                    uniform vec3 uCampfireColor;
                    uniform float uCampfireStrength;

                    varying vec2 vGrassUv;
                    varying vec3 vGrassWorldPos;
                    varying float vWindShimmer;
                    varying float vBladeColorVar;
                ` + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <tonemapping_fragment>',
                    `
                    float bladeCrease = texture2D(uBladeTex, vGrassUv).r;
                    vec3 tipCol = mix(uTipColor, uTipColor * vec3(1.12, 1.06, 0.86), vBladeColorVar);
                    vec3 gradCol = mix(uBaseColor, tipCol, smoothstep(0.05, 0.92, vGrassUv.y));
                    gradCol *= mix(0.86, 1.06, bladeCrease);

                    // Golden Wind Wave Shimmer across the Meadow + Perceptual T3 Quantization
                    gradCol += uSunColor * vWindShimmer * 0.22;
                    vec3 grSq = sqrt(max(gradCol, vec3(0.0)));
                    vec3 grSqQ = floor(grSq * 24.0 + 0.5) / 24.0;
                    gradCol = grSqQ * grSqQ;

                    // 3-tier T3 stepped directional cast shadows
                    float shadowMask = clamp(length(outgoingLight) / 1.15, 0.42, 1.18);
                    float steppedShadow = shadowMask > 0.78 ? 1.05 : (shadowMask > 0.56 ? 0.82 : 0.58);
                    outgoingLight = gradCol * mix(vec3(1.0), uSunColor, 0.24) * steppedShadow;

                    // Warm Campfire Bounce Glow on Nearby Grass Blades
                    float fireDist = length(uCampfirePos - vGrassWorldPos);
                    float fireGlow = (1.0 - smoothstep(1.2, 11.5, fireDist)) * uCampfireStrength;
                    outgoingLight += gradCol * uCampfireColor * fireGlow * 0.75 * vGrassUv.y;

                    gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                    #include <tonemapping_fragment>
                    `
                );
            }
        };

export {
  createStylizedPineTree, createBotWDeciduousTree, createStylizedDeadPine,
  createBotWBush, createBotWGrassBladeGeometry, createBotWWaterDataTexture,
  createWindFlowTexture, createBladeShadingTexture, applyStylizedCelShading,
  grassMat, grassUniforms, celShaderUniforms, pineMaterials, deciduousMaterials,
  pineDepthMaterials, deciduousDepthMaterials, PINE_PALETTES,
  trunkMat, deadWoodMat, bushLeafMat, berryMat, rockMat,
  setForestSeed, setTerrainHeightSampler, getTerrainHeight, atmosphere,
};
