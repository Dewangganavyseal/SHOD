// Stylized Pointed-Leaf Trees (DatBoiEle 7b6XZhsvcEM Method)
// - 256x256 scattered pointed-leaf cutout texture with clear negative space & 10-pass PixelFix RGB dilation
// - 3D center-intersecting spiky leaf bush units + Blender Sphere Normal Transfer (66% bush + 34% crown)
// - Smooth luminous sunlit-lime-to-emerald gradient shader with alpha=0.0 T3 outline opt-out
// - Slender warm-brown forked trunks & visible twigs across 3 distinct models: 'oak_dome', 'twin_bough', 'tiered_shelf'

const STYLIZED_TREE_VARIANTS = ['oak_dome', 'twin_bough', 'tiered_shelf'];

const STYLIZED_DECIDUOUS_PALETTES = {
  emerald: {
    name: 'Pohon Ek Rimbun Cerah',
    shadow: '#1e5c35',
    base: '#338838',
    mid: '#4ea838',
    tip: '#86d43e',
    highlight: '#b4ec56',
    burstColor: 0x62be3a,
  },
  teal: {
    name: 'Pohon Ek Lembah Sejuk',
    shadow: '#18543d',
    base: '#2a7e4a',
    mid: '#429e54',
    tip: '#72cc62',
    highlight: '#9ee67c',
    burstColor: 0x52b058,
  },
  olive: {
    name: 'Pohon Ek Musim Semi',
    shadow: '#2b6128',
    base: '#46912e',
    mid: '#68b634',
    tip: '#9ce044',
    highlight: '#c6f260',
    burstColor: 0x7ac73a,
  },
};

function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToRgbBytes(hex) {
  const clean = String(hex || '#74cc3f').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0');
  const num = parseInt(full, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixRgbBytes(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function setTextureSRGB(THREE, tex) {
  if ('colorSpace' in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in tex && THREE.sRGBEncoding !== undefined) {
    tex.encoding = THREE.sRGBEncoding;
  }
  return tex;
}

function createStylizedTreeToolkit(THREE, deps = {}) {
  const depCel = deps.celShaderUniforms || {};
  const depGrass = deps.grassUniforms || {};
  const dylearnUniforms = deps.dylearnSharedUniforms || null;

  const celUniforms = {
    uTime: depCel.uTime || depGrass.uTime || { value: 0 },
    uSunDir: depCel.uSunDir || depGrass.uSunDir || { value: new THREE.Vector3(0.42, 0.86, 0.30).normalize() },
    uSunColor: depCel.uSunColor || depGrass.uSunColor || { value: new THREE.Color(0xffe9c4) },
    uShadowTint: depCel.uShadowTint || { value: new THREE.Color(0x5c6b8a) },
    uRimTint: depCel.uRimTint || { value: new THREE.Color(0xbfe4ff) },
    uSceneBrightness: depCel.uSceneBrightness || { value: 0.72 },
    uCampfirePos: depCel.uCampfirePos || depGrass.uCampfirePos || { value: new THREE.Vector3(0, 0.85, 0) },
    uCampfireColor: depCel.uCampfireColor || depGrass.uCampfireColor || { value: new THREE.Color(0xff9238) },
    uCampfireStrength: depCel.uCampfireStrength || depGrass.uCampfireStrength || { value: 0.0 },
  };

  const windUniforms = {
    uWindSpeed: depGrass.uWindSpeed || { value: 1.25 },
  };

  function createStylizedWoodMaterial() {
    let tex = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 64;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#8b6b57';
        ctx.fillRect(0, 0, 32, 64);
        for (let i = 0; i < 16; i++) {
          const x = (i * 7 + 3) % 32;
          const w = 1 + (i % 2);
          ctx.fillStyle = i % 3 === 0 ? '#745644' : (i % 3 === 1 ? '#9d7b66' : '#82624f');
          ctx.fillRect(x, 0, w, 64);
        }
        // Subtle horizontal pixel bark knots for T3 Hybrid texture feel
        for (let k = 0; k < 10; k++) {
          const kx = (k * 11 + 5) % 30;
          const ky = (k * 17 + 4) % 62;
          ctx.fillStyle = k % 2 === 0 ? '#6b4d3c' : '#a3816b';
          ctx.fillRect(kx, ky, 2, 3);
        }
        tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        setTextureSRGB(THREE, tex);
      }
    }
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: tex ? 0xcbb3a3 : 0x8b6b57,
      roughness: 0.88,
      metalness: 0.0,
    });
    mat.customProgramCacheKey = () => 'stylized-wood-t3-hybrid-outline-v3';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = celUniforms.uSunDir;
      shader.uniforms.uSunColor = celUniforms.uSunColor;
      shader.uniforms.uShadowTint = celUniforms.uShadowTint;
      shader.uniforms.uRimTint = celUniforms.uRimTint;
      shader.uniforms.uSceneBrightness = celUniforms.uSceneBrightness;
      shader.uniforms.uCampfirePos = celUniforms.uCampfirePos;
      shader.uniforms.uCampfireColor = celUniforms.uCampfireColor;
      shader.uniforms.uCampfireStrength = celUniforms.uCampfireStrength;

      shader.vertexShader = [
        'varying vec3 vStWoodWorldPos;',
        'varying vec3 vStWoodWorldN;',
      ].join('\n') + '\n' + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'vec4 swp = vec4(transformed, 1.0);',
          'vec3 swn = objectNormal;',
          '#ifdef USE_INSTANCING',
          '  swp = instanceMatrix * swp;',
          '  swn = mat3(instanceMatrix) * swn;',
          '#endif',
          'swp = modelMatrix * swp;',
          'vStWoodWorldPos = swp.xyz;',
          'vStWoodWorldN = normalize(mat3(modelMatrix) * swn);',
        ].join('\n')
      );

      shader.fragmentShader = [
        'uniform vec3 uSunDir;',
        'uniform vec3 uSunColor;',
        'uniform vec3 uShadowTint;',
        'uniform vec3 uRimTint;',
        'uniform float uSceneBrightness;',
        'uniform vec3 uCampfirePos;',
        'uniform vec3 uCampfireColor;',
        'uniform float uCampfireStrength;',
        'varying vec3 vStWoodWorldPos;',
        'varying vec3 vStWoodWorldN;',
      ].join('\n') + '\n' + shader.fragmentShader;

      if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <tonemapping_fragment>',
          [
            // T3 Hybrid faceted voxel normals via dFdx/dFdy (NO crease ink / NO black outline)
            'vec3 wdpx = dFdx(vStWoodWorldPos);',
            'vec3 wdpy = dFdy(vStWoodWorldPos);',
            'vec3 wCross = cross(wdpx, wdpy);',
            'vec3 wVN = normalize(vStWoodWorldN);',
            'vec3 wFN = length(wCross) > 1e-6 ? normalize(wCross) : wVN;',
            'if (dot(wFN, wVN) < 0.0) wFN = -wFN;',
            'vec3 wN = normalize(mix(wVN, wFN, 0.80));',
            'vec3 wL = normalize(uSunDir);',
            'vec3 wV = normalize(cameraPosition - vStWoodWorldPos);',
            // T3 Hybrid perceptual sqrt palette quantization (22 steps)
            'vec3 wSq = sqrt(max(diffuseColor.rgb, vec3(0.0)));',
            'vec3 wQ = floor(wSq * 22.0 + 0.5) / 22.0;',
            'vec3 wAlbedo = wQ * wQ;',
            // T3 Hybrid 3-tier cel (0.45 / 0.75 / 1.0) + vertical AO + T3 rim light
            'float wNdl = max(dot(wN, wL), 0.0);',
            'float wCel = wNdl > 0.62 ? 1.0 : (wNdl > 0.22 ? 0.75 : 0.45);',
            'float wAo = mix(0.80, 1.0, clamp(wN.y * 0.5 + 0.5, 0.0, 1.0));',
            'float wDay = clamp(uSceneBrightness / 0.72, 0.26, 1.15);',
            'vec3 wBase = wAlbedo * (0.42 + 0.58 * wCel) * wAo * wDay;',
            'vec3 wShad = mix(wBase * uShadowTint * 1.40, wBase * 0.66, 0.55);',
            'vec3 wLit = wBase * mix(vec3(1.0), uSunColor * 1.06, 0.22);',
            'vec3 wCol = mix(wShad, wLit, smoothstep(0.45, 1.0, wCel));',
            'float wRim = pow(1.0 - max(dot(wN, wV), 0.0), 2.0);',
            'wCol += mix(vec3(1.0, 0.96, 0.88), uRimTint, 0.45) * wRim * 0.14 * wDay;',
            'float wFireDist = length(uCampfirePos - vStWoodWorldPos);',
            'float wFireGlow = (1.0 - smoothstep(2.0, 12.0, wFireDist)) * uCampfireStrength;',
            'outgoingLight = wCol + wAlbedo * uCampfireColor * smoothstep(0.12, 0.65, wFireGlow) * 0.42;',
            'gl_FragColor = vec4(outgoingLight, 1.0);',
            '#include <tonemapping_fragment>',
          ].join('\n')
        );
      }
    };
    return mat;
  }

  const stylizedWoodMat = createStylizedWoodMaterial();
  const trunkMat = stylizedWoodMat;

  // --------------------------------------------------------------------------
  // 1. 256x256 Scattered Pointed-Leaf Alpha Texture + 10-Pass PixelFix Dilation
  // --------------------------------------------------------------------------

  function buildDilatedLeafDataTexture(srcRgba, width, height, fallbackHex, flipSourceY) {
    const totalPixels = width * height;
    const data = new Uint8Array(totalPixels * 4);
    const valid = new Uint8Array(totalPixels);
    const [fr, fg, fb] = hexToRgbBytes(fallbackHex);

    for (let y = 0; y < height; y++) {
      const dstRow = (flipSourceY ? (height - 1 - y) : y) * width;
      const srcRow = y * width;
      for (let x = 0; x < width; x++) {
        const sp = (srcRow + x) * 4;
        const dpIdx = dstRow + x;
        const dp = dpIdx * 4;
        const a = srcRgba[sp + 3];
        data[dp + 3] = a;

        if (a >= 195) {
          data[dp] = srcRgba[sp];
          data[dp + 1] = srcRgba[sp + 1];
          data[dp + 2] = srcRgba[sp + 2];
          valid[dpIdx] = 1;
        } else {
          data[dp] = fr;
          data[dp + 1] = fg;
          data[dp + 2] = fb;
          valid[dpIdx] = 0;
        }
      }
    }

    const nextData = new Uint8Array(data);
    const nextValid = new Uint8Array(valid);
    for (let pass = 0; pass < 10; pass++) {
      for (let y = 0; y < height; y++) {
        const rowOff = y * width;
        for (let x = 0; x < width; x++) {
          const p = rowOff + x;
          if (valid[p]) continue;
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          let count = 0;
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
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    setTextureSRGB(THREE, tex);
    tex.needsUpdate = true;
    return tex;
  }

  // Deterministic 22-leaf scattered pointed layout matching tutorial sb_1/sb_2
  // (zero central solid circle; leaves point outward toward corners/edges with clear gaps)
  const SCATTERED_LEAF_SPECS = [
    // Top-Left corner cluster
    { cx: 76,  cy: 76,  len: 74, wid: 39, ang: -0.78, bend: -0.10, tone: 1.00 },
    { cx: 64,  cy: 86,  len: 60, wid: 31, ang: -1.18, bend:  0.08, tone: 0.94 },
    { cx: 90,  cy: 62,  len: 58, wid: 30, ang: -0.36, bend: -0.08, tone: 1.04 },
    // Top-Right corner cluster
    { cx: 180, cy: 76,  len: 74, wid: 39, ang:  0.78, bend:  0.10, tone: 1.02 },
    { cx: 166, cy: 62,  len: 58, wid: 30, ang:  0.34, bend:  0.08, tone: 0.95 },
    { cx: 192, cy: 88,  len: 60, wid: 31, ang:  1.18, bend: -0.08, tone: 1.05 },
    // Bottom-Left corner cluster
    { cx: 76,  cy: 180, len: 74, wid: 39, ang: -2.36, bend:  0.10, tone: 0.96 },
    { cx: 90,  cy: 194, len: 58, wid: 30, ang: -2.76, bend: -0.08, tone: 1.03 },
    { cx: 64,  cy: 168, len: 60, wid: 31, ang: -1.94, bend:  0.08, tone: 0.93 },
    // Bottom-Right corner cluster
    { cx: 180, cy: 180, len: 74, wid: 39, ang:  2.36, bend: -0.10, tone: 1.01 },
    { cx: 192, cy: 168, len: 60, wid: 31, ang:  1.94, bend: -0.08, tone: 0.95 },
    { cx: 166, cy: 194, len: 58, wid: 30, ang:  2.76, bend:  0.08, tone: 1.06 },
    // Mid-edge radiating leaves (N, S, W, E)
    { cx: 126, cy: 66,  len: 62, wid: 32, ang:  0.04, bend:  0.06, tone: 1.03 },
    { cx: 130, cy: 190, len: 62, wid: 32, ang:  3.10, bend: -0.06, tone: 0.97 },
    { cx: 66,  cy: 126, len: 62, wid: 32, ang: -1.54, bend: -0.06, tone: 1.00 },
    { cx: 190, cy: 130, len: 62, wid: 32, ang:  1.58, bend:  0.06, tone: 0.98 },
    // Inner scattered leaves (around radius 28..44px, keeping exact center (128,128) clear!)
    { cx: 102, cy: 102, len: 46, wid: 25, ang: -0.68, bend:  0.08, tone: 1.05 },
    { cx: 154, cy: 100, len: 45, wid: 24, ang:  0.72, bend: -0.08, tone: 0.93 },
    { cx: 100, cy: 154, len: 46, wid: 25, ang: -2.42, bend: -0.07, tone: 0.96 },
    { cx: 156, cy: 156, len: 46, wid: 25, ang:  2.42, bend:  0.07, tone: 1.04 },
    { cx: 130, cy: 96,  len: 40, wid: 23, ang:  0.14, bend: -0.05, tone: 1.02 },
    { cx: 126, cy: 160, len: 40, wid: 23, ang: -2.96, bend:  0.05, tone: 0.95 },
  ];

  function paintHeadlessLeafCluster(size, palette) {
    const buf = new Uint8Array(size * size * 4);
    const scale = size / 256;
    const cMid = hexToRgbBytes(palette.mid);
    const cTip = hexToRgbBytes(palette.tip);
    const cHi = hexToRgbBytes(palette.highlight);
    const leafBaseRgb = mixRgbBytes(cMid, cTip, 0.28);
    const leafTipRgb = mixRgbBytes(cTip, cHi, 0.25);

    const stampPixelPointedLeaf = (cx, cy, len, wid, ang, bend, tone) => {
      const cosA = Math.cos(-ang);
      const sinA = Math.sin(-ang);
      const bound = Math.ceil(Math.max(len, wid) + 2);
      const x0 = Math.max(0, Math.floor(cx - bound));
      const x1 = Math.min(size - 1, Math.ceil(cx + bound));
      const y0 = Math.max(0, Math.floor(cy - bound));
      const y1 = Math.min(size - 1, Math.ceil(cy + bound));
      const br = Math.min(255, Math.round(leafBaseRgb[0] * tone));
      const bg = Math.min(255, Math.round(leafBaseRgb[1] * tone));
      const bb = Math.min(255, Math.round(leafBaseRgb[2] * tone));
      const tr = Math.min(255, Math.round(leafTipRgb[0] * tone));
      const tg = Math.min(255, Math.round(leafTipRgb[1] * tone));
      const tb = Math.min(255, Math.round(leafTipRgb[2] * tone));

      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const dx = px - cx;
          const dy = py - cy;
          const lx = dx * cosA - dy * sinA;
          const ly = dx * sinA + dy * cosA;
          const v = -ly / len;
          if (v < 0 || v > 1) continue;
          const spineX = bend * len * Math.sin(v * Math.PI);
          const profile = Math.sin(Math.pow(v, 0.72) * Math.PI) * (1.0 - 0.14 * v);
          const halfW = wid * 0.52 * profile;
          if (halfW <= 0.15) continue;
          if (Math.abs(lx - spineX) > Math.max(0.45, halfW)) continue;
          // Crisp 2-tone T3 pixel leaf shading (hard alpha 255)
          const isTip = v > 0.56;
          const idx = ((size - 1 - py) * size + px) * 4;
          buf[idx] = isTip ? tr : br;
          buf[idx + 1] = isTip ? tg : bg;
          buf[idx + 2] = isTip ? tb : bb;
          buf[idx + 3] = 255;
        }
      }
    };

    for (let i = 0; i < SCATTERED_LEAF_SPECS.length; i++) {
      const sp = SCATTERED_LEAF_SPECS[i];
      stampPixelPointedLeaf(sp.cx * scale, sp.cy * scale, sp.len * scale, sp.wid * scale, sp.ang, sp.bend, sp.tone);
    }
    return buf;
  }

  function createStylizedLeafClumpTexture(palette) {
    // Crisp 64x64 pixel-art T3 Hybrid scattered pointed-leaf texture (NearestFilter, hard 0/255 alpha)
    const size = 64;
    const pal = palette || STYLIZED_DECIDUOUS_PALETTES.emerald;
    const pixelRgba = paintHeadlessLeafCluster(size, pal);
    return buildDilatedLeafDataTexture(pixelRgba, size, size, pal.mid, false);
  }

  // --------------------------------------------------------------------------
  // 2. Smooth Sphere-Normal Gradient Wind + Cel Shader (Alpha = 0.0 No-Outline)
  // --------------------------------------------------------------------------

  function injectStylizedCloudFoliageShader(shader, palette = STYLIZED_DECIDUOUS_PALETTES.emerald) {
    const pal = palette || STYLIZED_DECIDUOUS_PALETTES.emerald;
    const cShad = new THREE.Color(pal.shadow);
    const cMid = new THREE.Color(pal.mid);
    const cSun = new THREE.Color(pal.tip);
    const cHi = new THREE.Color(pal.highlight);

    shader.uniforms.uTime = celUniforms.uTime;
    shader.uniforms.uWindSpeed = windUniforms.uWindSpeed;
    shader.uniforms.uSunDir = celUniforms.uSunDir;
    shader.uniforms.uSunColor = celUniforms.uSunColor;
    shader.uniforms.uShadowTint = celUniforms.uShadowTint;
    shader.uniforms.uRimTint = celUniforms.uRimTint;
    shader.uniforms.uSceneBrightness = celUniforms.uSceneBrightness;
    shader.uniforms.uCampfirePos = celUniforms.uCampfirePos;
    shader.uniforms.uCampfireColor = celUniforms.uCampfireColor;
    shader.uniforms.uCampfireStrength = celUniforms.uCampfireStrength;
    shader.uniforms.uColShadow = { value: cShad };
    shader.uniforms.uColMid = { value: cMid };
    shader.uniforms.uColSun = { value: cSun };
    shader.uniforms.uColHighlight = { value: cHi };
    shader.uniforms.uMidGreenRef = { value: Math.max(0.08, cMid.g) };

    const useDylearnClouds = Boolean(dylearnUniforms && dylearnUniforms.uCloudNoise);
    if (useDylearnClouds) {
      Object.assign(shader.uniforms, dylearnUniforms);
    }

    const isColorPass = shader.fragmentShader.includes('#include <tonemapping_fragment>');

    shader.vertexShader = [
      'attribute vec3 aSocketPos;',
      'attribute vec3 aProjectedNormal;',
      'attribute vec3 aCanopyInfo;',
      'uniform float uTime;',
      'uniform float uWindSpeed;',
      ...(isColorPass
        ? [
          'varying float vFoliageAO;',
          'varying float vHeightNorm;',
          'varying float vLeafPhase;',
          'varying vec3 vCloudWorldPos;',
          'varying vec3 vProjectedWorldNormal;',
        ]
        : []),
    ].join('\n') + '\n' + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        'vec3 relPos = transformed - aSocketPos;',
        'float distSocket = length(relPos);',
        'float flexMask = smoothstep(0.06, 1.35, distSocket);',
        'float cardPhase = aCanopyInfo.x;',
        'float heightNorm = aCanopyInfo.y;',
        'float radialAO = aCanopyInfo.z;',
        // T3 Hybrid 5 FPS stop-motion breeze timing matching SHOD bushes & pines
        'float frametime = 1.0 / 5.0;',
        'float qPhase = mod(cardPhase * 1.4, frametime);',
        'float qTime = floor((uTime + qPhase) * 5.0 + 0.5) / 5.0;',
        'float swayT = qTime * (1.38 + uWindSpeed * 0.48) + cardPhase * 0.35;',
        'float swayAmp = (0.026 + 0.024 * heightNorm) * uWindSpeed * flexMask;',
        'float rx = sin(swayT) * swayAmp;',
        'float rz = cos(swayT * 1.13 + 0.55) * swayAmp * 0.85;',
        'float cx = cos(rx), sx = sin(rx);',
        'float cz = cos(rz), sz = sin(rz);',
        'vec3 r1 = vec3(relPos.x, relPos.y * cx - relPos.z * sx, relPos.y * sx + relPos.z * cx);',
        'vec3 r2 = vec3(r1.x * cz - r1.y * sz, r1.x * sz + r1.y * cz, r1.z);',
        'float uvRim = 0.5;',
        '#ifdef USE_UV',
        '    uvRim = clamp(length(vUv - vec2(0.5)) * 2.0, 0.0, 1.0);',
        '#endif',
        'float flutter = sin(qTime * (2.65 + uWindSpeed * 0.85) + cardPhase * 1.9) * 0.028 * uWindSpeed * smoothstep(0.68, 0.98, radialAO) * uvRim;',
        'transformed = aSocketPos + r2 + aProjectedNormal * (flutter * 0.65) + vec3(flutter * 0.35, 0.0, -flutter * 0.35);',
        ...(isColorPass
          ? [
            'vec4 scWorldPos4 = vec4(transformed, 1.0);',
            'vec3 scLocalN = aProjectedNormal;',
            '#ifdef USE_INSTANCING',
            '    scWorldPos4 = instanceMatrix * scWorldPos4;',
            '    mat3 scInstM = mat3(instanceMatrix);',
            '    scLocalN = scInstM * (scLocalN / vec3(',
            '        max(dot(scInstM[0], scInstM[0]), 1e-6),',
            '        max(dot(scInstM[1], scInstM[1]), 1e-6),',
            '        max(dot(scInstM[2], scInstM[2]), 1e-6)',
            '    ));',
            '#endif',
            'scWorldPos4 = modelMatrix * scWorldPos4;',
            'vCloudWorldPos = scWorldPos4.xyz;',
            'vProjectedWorldNormal = normalize(mat3(modelMatrix) * scLocalN);',
            'vFoliageAO = radialAO;',
            'vHeightNorm = heightNorm;',
            'vLeafPhase = cardPhase;',
          ]
          : []),
      ].join('\n')
    );

    if (isColorPass) {
      shader.fragmentShader = [
        'uniform float uTime;',
        'uniform vec3 uSunDir;',
        'uniform vec3 uSunColor;',
        'uniform vec3 uShadowTint;',
        'uniform vec3 uRimTint;',
        'uniform float uSceneBrightness;',
        'uniform vec3 uCampfirePos;',
        'uniform vec3 uCampfireColor;',
        'uniform float uCampfireStrength;',
        'uniform vec3 uColShadow;',
        'uniform vec3 uColMid;',
        'uniform vec3 uColSun;',
        'uniform vec3 uColHighlight;',
        'uniform float uMidGreenRef;',
        'varying float vFoliageAO;',
        'varying float vHeightNorm;',
        'varying float vLeafPhase;',
        'varying vec3 vCloudWorldPos;',
        'varying vec3 vProjectedWorldNormal;',
        ...(useDylearnClouds
          ? [
            'uniform sampler2D uCloudNoise;',
            'uniform float uCloudScale;',
            'uniform float uCloudWorldY;',
            'uniform float uCloudSpeed;',
            'uniform float uCloudContrast;',
            'uniform float uCloudThreshold;',
            'uniform vec2 uCloudDir;',
            'uniform float uCloudShadowMin;',
            'uniform float uCloudDivergeAngle;',
            'vec2 scRotateVec2(vec2 v, float angleDeg) {',
            '    float a = radians(angleDeg);',
            '    float c = cos(a); float s = sin(a);',
            '    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);',
            '}',
            'float scCloudNoise(vec3 wp) {',
            '    float t = clamp((uCloudWorldY - wp.y) / max(uSunDir.y, 0.42), 0.0, 140.0);',
            '    vec3 hitPos = vec3(wp.x + uSunDir.x * t * 0.16, wp.y, wp.z + uSunDir.z * t * 0.16);',
            '    float invScale = 1.0 / max(uCloudScale, 0.001);',
            '    vec2 d1 = normalize(scRotateVec2(uCloudDir, uCloudDivergeAngle));',
            '    vec2 d2 = normalize(scRotateVec2(uCloudDir, -uCloudDivergeAngle));',
            '    vec2 td1 = uTime * uCloudSpeed * d1;',
            '    vec2 td2 = uTime * uCloudSpeed * d2;',
            '    float s1 = texture2D(uCloudNoise, hitPos.xz * invScale + td1).r;',
            '    float s2 = texture2D(uCloudNoise, hitPos.xz * (invScale * 0.8) + (td2 * 0.89 * 3.14159265 / 3.0)).r;',
            '    float lv = clamp((s1 * s2) + uCloudThreshold, 0.0, 1.0);',
            '    lv = (lv - 0.5) * uCloudContrast + 0.5;',
            '    return clamp(lv + uCloudThreshold, uCloudShadowMin, 1.0);',
            '}',
          ]
          : []),
      ].join('\n') + '\n' + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        [
          // Unflipped sphere-transferred world normal (continuous across double-sided pixel leaf cards)
          'vec3 N = vProjectedWorldNormal / max(length(vProjectedWorldNormal), 1e-4);',
          'vec3 L = normalize(uSunDir);',
          'vec3 V = normalize(cameraPosition - vCloudWorldPos);',
          'float dayScale = clamp(uSceneBrightness / 0.72, 0.26, 1.08) * 0.90;',

          // T3 Hybrid 3-tier quantized cel shading over sphere-transferred normals
          'float halfL = dot(N, L) * 0.5 + 0.5;',
          'float rawLight = clamp(halfL * 0.68 + vHeightNorm * 0.24 + (vFoliageAO - 0.72) * 0.25, 0.0, 1.0);',
          ...(useDylearnClouds ? ['rawLight *= mix(0.84, 1.0, scCloudNoise(vCloudWorldPos));'] : []),
          'float engineRatio = clamp(length(outgoingLight) / max(length(diffuseColor.rgb) * uSceneBrightness, 0.001), 0.35, 1.35);',
          'float castMask = smoothstep(0.32, 0.68, engineRatio);',
          'rawLight *= mix(0.80, 1.0, castMask);',

          // Crisp T3 3-band cel steps (shadow -> vibrant mid -> sunlit lime) + crown highlight cap
          'float celTier = rawLight > 0.68 ? 1.0 : (rawLight > 0.36 ? 0.52 : 0.0);',
          'vec3 leafCol = celTier > 0.75 ? uColSun : (celTier > 0.25 ? uColMid : uColShadow);',
          'if (rawLight > 0.82 && vHeightNorm > 0.56) leafCol = mix(leafCol, uColHighlight, 0.55);',

          // Keep crisp 2-tone pixel leaf variation from NearestFilter texture
          'float texVar = clamp(diffuseColor.g / max(uMidGreenRef, 0.05), 0.88, 1.14);',
          'leafCol *= texVar;',

          // T3 Hybrid rim light + cool sky bounce on shaded underside
          'float underSky = clamp(-N.y * 0.5 + 0.5, 0.0, 1.0);',
          'leafCol += uColShadow * uRimTint * underSky * 0.09;',
          'float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0) * smoothstep(0.18, 0.85, N.y * 0.5 + 0.5);',
          'leafCol += mix(uColHighlight, uRimTint, 0.35) * rim * 0.16;',

          // T3 Hybrid perceptual sqrt 20-step color quantization (cohesive pixel-art palette!)
          'vec3 sqLeaf = sqrt(max(leafCol * dayScale, vec3(0.0)));',
          'vec3 qLeaf = floor(sqLeaf * 20.0 + 0.5) / 20.0;',
          'leafCol = qLeaf * qLeaf;',

          // Warm campfire bounce on lower leaves at dusk/night
          'float fireDist = length(uCampfirePos - vCloudWorldPos);',
          'float fireGlow = (1.0 - smoothstep(2.0, 13.5, fireDist)) * uCampfireStrength;',
          'leafCol += uColMid * uCampfireColor * smoothstep(0.12, 0.65, fireGlow) * 0.45;',

          // Alpha = 1.0 enables crisp T3 Sobel black outlines around pointed leaf silhouettes
          'gl_FragColor = vec4(leafCol, 1.0);',
          '#include <tonemapping_fragment>',
        ].join('\n')
      );
    }
  }

  const deciduousMaterials = {};
  const deciduousDepthMaterials = {};
  Object.keys(STYLIZED_DECIDUOUS_PALETTES).forEach((key) => {
    const pal = STYLIZED_DECIDUOUS_PALETTES[key];
    const tex = createStylizedLeafClumpTexture(pal);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.84,
      metalness: 0.0,
    });
    mat.customProgramCacheKey = () => `stylized-pointed-foliage-t3-hybrid-outline-${key}-v4`;
    mat.onBeforeCompile = (shader) => injectStylizedCloudFoliageShader(shader, pal);
    deciduousMaterials[key] = mat;

    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tex,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
    depthMat.customProgramCacheKey = () => 'stylized-pointed-foliage-depth-v2';
    depthMat.onBeforeCompile = (shader) => injectStylizedCloudFoliageShader(shader, pal);
    deciduousDepthMaterials[key] = depthMat;
  });

  // --------------------------------------------------------------------------
  // 3. Geometry Utilities: Merger, Slender Curved Limbs, Neat Root Flares
  // --------------------------------------------------------------------------

  function mergeBufferGeometries(geos) {
    if (!geos || geos.length === 0) return new THREE.BufferGeometry();
    const allIndexed = geos.every((g) => Boolean(g.index));
    const list = allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const attrNames = Object.keys(list[0].attributes);

    let totalVerts = 0;
    for (let i = 0; i < list.length; i++) {
      totalVerts += list[i].attributes.position.count;
    }

    const merged = new THREE.BufferGeometry();
    for (let a = 0; a < attrNames.length; a++) {
      const name = attrNames[a];
      const itemSize = list[0].attributes[name].itemSize;
      const combined = new Float32Array(totalVerts * itemSize);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const attr = list[i].attributes[name];
        if (attr) {
          combined.set(attr.array, offset);
          offset += attr.array.length;
        }
      }
      merged.setAttribute(name, new THREE.BufferAttribute(combined, itemSize));
    }

    if (allIndexed) {
      let totalIdx = 0;
      for (let i = 0; i < list.length; i++) totalIdx += list[i].index.count;
      const IndexArr = totalVerts > 65535 ? Uint32Array : Uint16Array;
      const combinedIdx = new IndexArr(totalIdx);
      let idxOff = 0;
      let vertOff = 0;
      for (let i = 0; i < list.length; i++) {
        const idxArr = list[i].index.array;
        for (let k = 0; k < idxArr.length; k++) {
          combinedIdx[idxOff++] = idxArr[k] + vertOff;
        }
        vertOff += list[i].attributes.position.count;
      }
      merged.setIndex(new THREE.BufferAttribute(combinedIdx, 1));
    }
    return merged;
  }

  function buildTaperedCurvedLimb(points, rStart, rEnd, radialSegs = 7, opts = {}) {
    const count = points.length;
    const rings = count - 1;
    const stride = radialSegs + 1;
    const positions = new Float32Array(count * stride * 3);
    const uvs = new Float32Array(count * stride * 2);
    const indices = [];

    const tangents = [];
    for (let i = 0; i < count; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(count - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(next, prev);
      if (t.lengthSq() < 1e-8) t.set(0, 1, 0);
      else t.normalize();
      tangents.push(t);
    }

    let normal = Math.abs(tangents[0].y) < 0.9
      ? new THREE.Vector3(0, 1, 0).cross(tangents[0]).normalize()
      : new THREE.Vector3(1, 0, 0).cross(tangents[0]).normalize();
    let binormal = new THREE.Vector3().crossVectors(tangents[0], normal).normalize();

    const rootFlare = opts.rootFlare || 0;
    const rootSpan = opts.rootSpan || 0.22;
    const rootPhase = opts.rootPhase || 0;
    const taperPow = opts.taperPow || 1.0;

    for (let i = 0; i < count; i++) {
      const tNorm = i / rings;
      const p = points[i];
      const tan = tangents[i];

      if (i > 0) {
        normal = normal.clone().sub(tan.clone().multiplyScalar(normal.dot(tan)));
        if (normal.lengthSq() < 1e-6) {
          normal = Math.abs(tan.y) < 0.9
            ? new THREE.Vector3(0, 1, 0).cross(tan).normalize()
            : new THREE.Vector3(1, 0, 0).cross(tan).normalize();
        } else {
          normal.normalize();
        }
        binormal = new THREE.Vector3().crossVectors(tan, normal).normalize();
      }

      const baseR = rStart + (rEnd - rStart) * Math.pow(tNorm, taperPow);
      const flareEnv = rootFlare > 0 && tNorm < rootSpan
        ? Math.pow(1.0 - tNorm / rootSpan, 1.8) * rootFlare
        : 0;

      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs;
        const ang = u * Math.PI * 2;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const ridge = flareEnv > 0 ? 1.0 + flareEnv * (0.65 + 0.35 * Math.sin(ang * 4.0 + rootPhase)) : 1.0;
        const r = baseR * ridge;

        const vi = i * stride + j;
        positions[vi * 3] = p.x + (normal.x * cosA + binormal.x * sinA) * r;
        positions[vi * 3 + 1] = p.y + (normal.y * cosA + binormal.y * sinA) * r;
        positions[vi * 3 + 2] = p.z + (normal.z * cosA + binormal.z * sinA) * r;

        uvs[vi * 2] = u;
        uvs[vi * 2 + 1] = tNorm;
      }
    }

    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = a + 1;
        const c = (i + 1) * stride + j;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function buildRootButtresses(count, baseRadius, reach, height, seed) {
    const roots = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (hash01(seed + i * 7.1) - 0.5) * 0.38;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rReach = reach * (0.88 + hash01(seed + i * 3.7) * 0.24);
      const pts = [
        new THREE.Vector3(ca * baseRadius * 0.42, height * (0.95 + hash01(seed + i * 5.3) * 0.16), sa * baseRadius * 0.42),
        new THREE.Vector3(ca * rReach * 0.62, height * 0.28, sa * rReach * 0.62),
        new THREE.Vector3(ca * rReach, -0.09, sa * rReach),
      ];
      roots.push(buildTaperedCurvedLimb(pts, baseRadius * 0.46, baseRadius * 0.14, 5, { taperPow: 1.15 }));
    }
    return roots;
  }

  function sampleQuadraticSpine(p0, p1, p2, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const omt = 1.0 - t;
      pts.push(new THREE.Vector3(
        omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x,
        omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y,
        omt * omt * p0.z + 2 * omt * t * p1.z + t * t * p2.z
      ));
    }
    return pts;
  }

  // --------------------------------------------------------------------------
  // 4. 3D Center-Intersecting Spiky Leaf Bush Units + Sphere Normal Transfer
  // --------------------------------------------------------------------------

  function createMinimalWaveLeafPlane() {
    const geo = new THREE.PlaneGeometry(1.0, 1.0, 2, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const r2 = vx * vx + vy * vy;
      pos.setZ(i, -r2 * 0.06);
    }
    geo.computeVertexNormals();
    return geo;
  }

  const BASE_INTERSECT_LEAF_PLANE = createMinimalWaveLeafPlane();

  function buildStylizedFoliagePuffs(puffs, crownCenter, seed = 1.0) {
    const dummy = new THREE.Object3D();
    const cardGeos = [];

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < puffs.length; i++) {
      const pf = puffs[i];
      if (pf.cy - pf.ry < minY) minY = pf.cy - pf.ry;
      if (pf.cy + pf.ry > maxY) maxY = pf.cy + pf.ry;
    }
    const crownHeightSpan = Math.max(0.5, maxY - minY);

    for (let pIdx = 0; pIdx < puffs.length; pIdx++) {
      const puff = puffs[pIdx];
      const puffCenter = new THREE.Vector3(puff.cx, puff.cy, puff.cz);
      const socketPos = new THREE.Vector3(
        puff.sx !== undefined ? puff.sx : puff.cx,
        puff.sy !== undefined ? puff.sy : puff.cy - puff.ry * 0.65,
        puff.sz !== undefined ? puff.sz : puff.cz
      );
      const rx = puff.rx;
      const ry = puff.ry;
      const rz = puff.rz;
      const avgR = (rx + ry + rz) / 3.0;
      const totalCards = puff.cards !== undefined ? puff.cards : 9;
      const puffPhase = seed + pIdx * 2.71;

      for (let c = 0; c < totalCards; c++) {
        let offX = 0;
        let offY = 0;
        let offZ = 0;
        let yaw = puffPhase;
        let pitch = 0;
        const jA = (hash01(puffPhase + c * 11.3) - 0.5) * 0.24;
        const jB = (hash01(puffPhase + c * 17.9) - 0.5) * 0.20;

        if (c === 0) {
          // Vertical '+' plane A
          yaw = puffPhase + jA;
          pitch = 0.14 + jB;
        } else if (c === 1) {
          // Vertical '+' plane B
          yaw = puffPhase + Math.PI * 0.5 + jA;
          pitch = -0.14 + jB;
        } else if (c === 2) {
          // Diagonal 'x' cross A
          yaw = puffPhase + Math.PI * 0.25 + jA;
          pitch = 0.54 + jB * 0.5;
        } else if (c === 3) {
          // Diagonal 'x' cross B
          yaw = puffPhase + Math.PI * 0.75 + jA;
          pitch = -0.54 + jB * 0.5;
        } else if (c >= 4 && c <= 6) {
          // 3 medium-pitched 54..64 deg planes fanned 120 deg apart for 3rd-person fullness
          const k = c - 4;
          yaw = puffPhase + k * ((Math.PI * 2) / 3) + 0.35 + jA;
          pitch = 1.02 + jB * 0.4;
          offX = Math.sin(yaw) * rx * 0.11;
          offZ = Math.cos(yaw) * rz * 0.11;
          offY = ry * 0.06;
        } else {
          // Near-horizontal crown planes (78..86 deg) for overhead & canopy top fullness
          const k = c - 7;
          yaw = puffPhase + k * (Math.PI * 0.5) + jA;
          pitch = 1.42 + jB * 0.25;
          offY = ry * (0.08 + k * 0.03);
        }

        dummy.position.set(puff.cx + offX, puff.cy + offY, puff.cz + offZ);
        dummy.rotation.set(pitch, yaw, 0, 'YXZ');
        dummy.rotateZ(c * 1.5707963 + jB * 2.2);

        const cardScale = avgR * (1.76 + hash01(puffPhase + c * 23.7) * 0.22);
        dummy.scale.set(cardScale, cardScale, cardScale);
        dummy.updateMatrix();

        const cardGeo = BASE_INTERSECT_LEAF_PLANE.clone();
        cardGeo.applyMatrix4(dummy.matrix);

        const posAttr = cardGeo.attributes.position;
        const vCount = posAttr.count;
        const socketArr = new Float32Array(vCount * 3);
        const projNormArr = new Float32Array(vCount * 3);
        const infoArr = new Float32Array(vCount * 3);
        const cardPhase = (puffPhase + c * 0.89) % (Math.PI * 2);

        const invRx2 = 1.0 / Math.max(0.01, rx * rx);
        const invRy2 = 1.0 / Math.max(0.01, ry * ry);
        const invRz2 = 1.0 / Math.max(0.01, rz * rz);

        for (let iv = 0; iv < vCount; iv++) {
          const vx = posAttr.getX(iv);
          const vy = posAttr.getY(iv);
          const vz = posAttr.getZ(iv);

          // BLENDER SPHERE NORMAL TRANSFER: 66% per-bush sphere + 34% overall crown dome
          const lx = (vx - puffCenter.x) * invRx2;
          const ly = (vy - puffCenter.y) * invRy2 + 0.22 / Math.max(0.25, ry);
          const lz = (vz - puffCenter.z) * invRz2;
          const localN = new THREE.Vector3(lx, ly, lz);
          if (localN.lengthSq() < 1e-5) localN.set(0, 1, 0);
          else localN.normalize();

          const crownN = new THREE.Vector3(
            vx - crownCenter.x,
            (vy - crownCenter.y) * 1.15 + 0.30,
            vz - crownCenter.z
          );
          if (crownN.lengthSq() < 1e-5) crownN.set(0, 1, 0);
          else crownN.normalize();

          const projN = localN.lerp(crownN, 0.34).normalize();

          const ellipDist = Math.hypot((vx - puffCenter.x) / rx, (vy - puffCenter.y) / ry, (vz - puffCenter.z) / rz);
          const relPuffY = (vy - puffCenter.y) / ry;
          const heightNorm = clamp01((vy - minY) / crownHeightSpan);
          const radialExposure = clamp01(0.72 + clamp01(ellipDist) * 0.16 + (relPuffY * 0.5 + 0.5) * 0.12);

          socketArr[iv * 3] = socketPos.x;
          socketArr[iv * 3 + 1] = socketPos.y;
          socketArr[iv * 3 + 2] = socketPos.z;

          projNormArr[iv * 3] = projN.x;
          projNormArr[iv * 3 + 1] = projN.y;
          projNormArr[iv * 3 + 2] = projN.z;

          infoArr[iv * 3] = cardPhase;
          infoArr[iv * 3 + 1] = heightNorm;
          infoArr[iv * 3 + 2] = radialExposure;
        }

        cardGeo.setAttribute('aSocketPos', new THREE.BufferAttribute(socketArr, 3));
        cardGeo.setAttribute('aProjectedNormal', new THREE.BufferAttribute(projNormArr, 3));
        cardGeo.setAttribute('aCanopyInfo', new THREE.BufferAttribute(infoArr, 3));
        cardGeo.setAttribute('normal', new THREE.BufferAttribute(projNormArr, 3));
        cardGeos.push(cardGeo);
      }
    }

    return mergeBufferGeometries(cardGeos);
  }

  // --------------------------------------------------------------------------
  // 5. Three Distinct Stylized Tree Archetype Builders (Matching 7b6XZhsvcEM)
  // --------------------------------------------------------------------------

  // Model 0: 'oak_dome' — Broad Spreading Tutorial Oak (maxres.jpg right & f3.jpg right)
  // Slender smooth trunk + 5 graceful upward branches + thin visible twigs + 13 overlapping spiky bushes.
  function buildOakDomeGeometry() {
    const woodGeos = [];
    const puffs = [];

    const trunkPts = [
      new THREE.Vector3(0.0, -0.10, 0.0),
      new THREE.Vector3(0.02, 0.65, -0.01),
      new THREE.Vector3(0.07, 1.40, -0.04),
      new THREE.Vector3(0.10, 2.08, -0.04),
    ];
    woodGeos.push(buildTaperedCurvedLimb(trunkPts, 0.22, 0.125, 7, {
      rootFlare: 0.22,
      rootSpan: 0.20,
      rootPhase: 0.4,
      taperPow: 0.88,
    }));
    woodGeos.push(...buildRootButtresses(4, 0.21, 0.36, 0.30, 11.3));

    const branchSpecs = [
      { yaw: 0.15, reach: 1.48, startY: 1.92, tipY: 3.12, rx: 1.06, ry: 0.90, rz: 1.04, cards: 9 },
      { yaw: 1.42, reach: 1.56, startY: 2.02, tipY: 3.24, rx: 1.12, ry: 0.94, rz: 1.08, cards: 9 },
      { yaw: 2.68, reach: 1.42, startY: 1.96, tipY: 3.04, rx: 1.02, ry: 0.88, rz: 1.00, cards: 9 },
      { yaw: 3.94, reach: 1.54, startY: 2.04, tipY: 3.26, rx: 1.08, ry: 0.92, rz: 1.06, cards: 9 },
      { yaw: 5.18, reach: 1.40, startY: 2.08, tipY: 3.14, rx: 1.00, ry: 0.86, rz: 0.98, cards: 9 },
    ];

    branchSpecs.forEach((sp, bi) => {
      const ca = Math.cos(sp.yaw);
      const sa = Math.sin(sp.yaw);
      const tNorm = clamp01(sp.startY / 2.08);
      const sx = 0.09 * tNorm;
      const sz = -0.04 * tNorm;
      const p0 = new THREE.Vector3(sx, sp.startY, sz);
      const p1 = new THREE.Vector3(sx + ca * sp.reach * 0.52, sp.startY + (sp.tipY - sp.startY) * 0.60, sz + sa * sp.reach * 0.52);
      const p2 = new THREE.Vector3(sx + ca * sp.reach, sp.tipY, sz + sa * sp.reach);
      woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(p0, p1, p2, 5), 0.095, 0.036, 6));

      if (bi < 4) {
        const twigYaw = sp.yaw + (bi % 2 === 0 ? 0.44 : -0.44);
        const twigTip = new THREE.Vector3(
          p1.x + Math.cos(twigYaw) * 0.72,
          p1.y + 0.52,
          p1.z + Math.sin(twigYaw) * 0.72
        );
        woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(p1, new THREE.Vector3((p1.x + twigTip.x) * 0.5, p1.y + 0.34, (p1.z + twigTip.z) * 0.5), twigTip, 3), 0.052, 0.026, 5));
      }

      puffs.push({
        cx: p2.x, cy: p2.y + 0.24, cz: p2.z,
        rx: sp.rx, ry: sp.ry, rz: sp.rz,
        sx: p0.x, sy: p0.y, sz: p0.z,
        cards: sp.cards,
      });
    });

    // Mid-crown bridging clumps + top billowing apex clumps (13 total)
    const forkBase = new THREE.Vector3(0.10, 2.05, -0.04);
    const midApex = new THREE.Vector3(0.12, 3.35, -0.03);
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(forkBase, new THREE.Vector3(0.14, 2.75, -0.04), midApex, 4), 0.105, 0.042, 6));

    const extraPuffs = [
      { cx: 0.88,  cy: 3.85, cz: 0.45,  rx: 1.06, ry: 0.90, rz: 1.02, cards: 9 },
      { cx: -0.92, cy: 3.78, cz: 0.42,  rx: 1.04, ry: 0.88, rz: 1.00, cards: 9 },
      { cx: 0.62,  cy: 3.92, cz: -0.78, rx: 1.02, ry: 0.86, rz: 1.00, cards: 9 },
      { cx: -0.68, cy: 3.84, cz: -0.74, rx: 1.00, ry: 0.84, rz: 0.98, cards: 9 },
      { cx: 0.12,  cy: 4.35, cz: -0.04, rx: 1.32, ry: 1.08, rz: 1.28, cards: 10 },
      { cx: -0.58, cy: 4.46, cz: 0.18,  rx: 0.96, ry: 0.82, rz: 0.94, cards: 9 },
      { cx: 0.56,  cy: 4.42, cz: -0.14, rx: 0.92, ry: 0.78, rz: 0.90, cards: 9 },
      { cx: 0.08,  cy: 3.45, cz: 0.12,  rx: 0.98, ry: 0.80, rz: 0.96, cards: 9 },
    ];
    extraPuffs.forEach((ep) => {
      puffs.push({ ...ep, sx: forkBase.x, sy: forkBase.y, sz: forkBase.z });
    });

    const crownCenter = new THREE.Vector3(0.06, 3.68, -0.02);
    const woodGeo = mergeBufferGeometries(woodGeos);
    const foliageGeo = buildStylizedFoliagePuffs(puffs, crownCenter, 13.7);
    return { woodGeo, foliageGeo, crownHeight: 5.45, crownRadius: 2.85, puffCount: puffs.length, trunkHeight: 2.08 };
  }

  // Model 1: 'twin_bough' — Slender Twin-Stem Tutorial Hero Tree (maxres.jpg left & sb_10)
  // Low graceful Y-split at ~0.92m into 2 slender curving stems + visible twigs + 12 overlapping spiky bushes.
  function buildTwinBoughGeometry() {
    const woodGeos = [];
    const puffs = [];

    const bolePts = [
      new THREE.Vector3(0.0, -0.10, 0.0),
      new THREE.Vector3(-0.02, 0.42, 0.01),
      new THREE.Vector3(-0.04, 0.92, 0.02),
    ];
    woodGeos.push(buildTaperedCurvedLimb(bolePts, 0.21, 0.155, 7, {
      rootFlare: 0.24,
      rootSpan: 0.35,
      rootPhase: 1.2,
      taperPow: 0.9,
    }));
    woodGeos.push(...buildRootButtresses(4, 0.20, 0.36, 0.30, 29.5));

    const forkPos = new THREE.Vector3(-0.04, 0.92, 0.02);

    // Primary taller slender arched stem
    const primaryPts = [
      forkPos.clone(),
      new THREE.Vector3(0.24, 1.72, 0.10),
      new THREE.Vector3(0.50, 2.58, 0.14),
      new THREE.Vector3(0.58, 3.45, 0.10),
      new THREE.Vector3(0.52, 4.02, 0.05),
    ];
    woodGeos.push(buildTaperedCurvedLimb(primaryPts, 0.135, 0.048, 7, { taperPow: 0.95 }));

    // Secondary slender companion stem arcing left
    const secondaryPts = [
      forkPos.clone(),
      new THREE.Vector3(-0.44, 1.56, -0.12),
      new THREE.Vector3(-0.88, 2.28, -0.20),
      new THREE.Vector3(-1.12, 2.98, -0.14),
    ];
    woodGeos.push(buildTaperedCurvedLimb(secondaryPts, 0.115, 0.044, 6, { taperPow: 0.95 }));

    // Visible slender branches & twigs fanning into the canopy
    const twigs = [
      { s: primaryPts[2], m: new THREE.Vector3(0.95, 3.12, 0.32), e: new THREE.Vector3(1.36, 3.68, 0.44), r0: 0.068, r1: 0.028 },
      { s: primaryPts[2], m: new THREE.Vector3(0.28, 3.18, -0.28), e: new THREE.Vector3(0.05, 3.74, -0.64), r0: 0.064, r1: 0.026 },
      { s: secondaryPts[1], m: new THREE.Vector3(-0.98, 2.02, 0.24), e: new THREE.Vector3(-1.46, 2.52, 0.56), r0: 0.062, r1: 0.026 },
      { s: secondaryPts[2], m: new THREE.Vector3(-1.32, 2.75, -0.45), e: new THREE.Vector3(-1.68, 3.22, -0.62), r0: 0.056, r1: 0.025 },
      { s: primaryPts[1], m: new THREE.Vector3(0.64, 2.22, -0.18), e: new THREE.Vector3(1.06, 2.78, -0.44), r0: 0.058, r1: 0.025 },
    ];
    twigs.forEach((tw) => {
      woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(tw.s, tw.m, tw.e, 4), tw.r0, tw.r1, 5));
    });

    const clumpSpecs = [
      // Tall primary upper crown
      { cx: 0.48,  cy: 4.55, cz: 0.06,  rx: 1.24, ry: 1.06, rz: 1.20, s: primaryPts[2], cards: 10 },
      { cx: 1.26,  cy: 3.92, cz: 0.44,  rx: 0.98, ry: 0.84, rz: 0.96, s: primaryPts[2], cards: 9 },
      { cx: -0.12, cy: 4.28, cz: 0.58,  rx: 0.96, ry: 0.86, rz: 0.94, s: primaryPts[2], cards: 9 },
      { cx: 0.14,  cy: 3.98, cz: -0.68, rx: 0.98, ry: 0.84, rz: 0.96, s: primaryPts[2], cards: 9 },
      { cx: 1.02,  cy: 3.12, cz: -0.42, rx: 0.88, ry: 0.76, rz: 0.86, s: primaryPts[1], cards: 9 },
      { cx: 0.62,  cy: 4.92, cz: -0.06, rx: 0.86, ry: 0.78, rz: 0.84, s: primaryPts[3], cards: 9 },
      // Secondary lower-left companion crown
      { cx: -1.16, cy: 3.24, cz: -0.14, rx: 1.08, ry: 0.88, rz: 1.04, s: secondaryPts[1], cards: 9 },
      { cx: -1.52, cy: 2.74, cz: 0.54,  rx: 0.86, ry: 0.74, rz: 0.84, s: secondaryPts[1], cards: 9 },
      { cx: -1.66, cy: 3.38, cz: -0.58, rx: 0.84, ry: 0.72, rz: 0.82, s: secondaryPts[2], cards: 9 },
      { cx: -0.68, cy: 3.86, cz: -0.18, rx: 0.94, ry: 0.82, rz: 0.92, s: secondaryPts[2], cards: 9 },
      // Bridge & outer accents
      { cx: 0.12,  cy: 3.42, cz: 0.46,  rx: 0.88, ry: 0.74, rz: 0.86, s: primaryPts[1], cards: 9 },
      { cx: 1.38,  cy: 3.55, cz: -0.12, rx: 0.76, ry: 0.68, rz: 0.74, s: primaryPts[2], cards: 8 },
    ];
    clumpSpecs.forEach((cl) => {
      puffs.push({
        cx: cl.cx, cy: cl.cy, cz: cl.cz,
        rx: cl.rx, ry: cl.ry, rz: cl.rz,
        sx: cl.s.x, sy: cl.s.y, sz: cl.s.z,
        cards: cl.cards,
      });
    });

    const crownCenter = new THREE.Vector3(-0.14, 3.84, 0.0);
    const woodGeo = mergeBufferGeometries(woodGeos);
    const foliageGeo = buildStylizedFoliagePuffs(puffs, crownCenter, 41.2);
    return { woodGeo, foliageGeo, crownHeight: 5.65, crownRadius: 2.65, puffCount: puffs.length, trunkHeight: 4.02 };
  }

  // Model 2: 'tiered_shelf' — Graceful Slender Multi-Bough Grove Tree
  // Tall sinuous trunk (~4.65m) with 3 alternating slender forked boughs & twigs + 12 overlapping spiky bushes.
  function buildTieredShelfGeometry() {
    const woodGeos = [];
    const puffs = [];

    const trunkHeight = 4.65;
    const trunkPts = [];
    const spineSteps = 12;
    for (let i = 0; i <= spineSteps; i++) {
      const t = i / spineSteps;
      const sx = Math.sin(t * Math.PI * 1.75) * 0.36 * Math.sin(t * Math.PI * 0.9 + 0.15);
      const sz = Math.sin(t * Math.PI * 1.35 + 0.7) * 0.22 * t;
      trunkPts.push(new THREE.Vector3(sx, -0.10 + t * (trunkHeight + 0.10), sz));
    }
    woodGeos.push(buildTaperedCurvedLimb(trunkPts, 0.20, 0.068, 7, {
      rootFlare: 0.22,
      rootSpan: 0.20,
      rootPhase: 2.1,
      taperPow: 0.92,
    }));
    woodGeos.push(...buildRootButtresses(4, 0.19, 0.34, 0.28, 73.9));

    const spineAt = (t) => {
      const idx = clamp01(t) * spineSteps;
      const i0 = Math.floor(idx);
      const i1 = Math.min(spineSteps, i0 + 1);
      return new THREE.Vector3().lerpVectors(trunkPts[i0], trunkPts[i1], idx - i0);
    };

    // Bough 1 (lower left-front)
    const s1Root = spineAt(0.44);
    const s1Mid = new THREE.Vector3(s1Root.x - 0.76, s1Root.y + 0.36, s1Root.z + 0.24);
    const s1Tip = new THREE.Vector3(s1Root.x - 1.46, s1Root.y + 0.68, s1Root.z + 0.44);
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(s1Root, s1Mid, s1Tip, 5), 0.092, 0.032, 6));
    const s1SubTip = new THREE.Vector3(s1Tip.x + 0.44, s1Tip.y + 0.18, s1Tip.z + 0.62);
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(s1Mid, new THREE.Vector3(s1Mid.x - 0.22, s1Mid.y + 0.20, s1Mid.z + 0.42), s1SubTip, 3), 0.055, 0.024, 5));

    puffs.push({ cx: s1Tip.x, cy: s1Tip.y + 0.22, cz: s1Tip.z, rx: 1.04, ry: 0.78, rz: 1.00, sx: s1Root.x, sy: s1Root.y, sz: s1Root.z, cards: 9 });
    puffs.push({ cx: s1SubTip.x, cy: s1SubTip.y + 0.18, cz: s1SubTip.z, rx: 0.84, ry: 0.68, rz: 0.82, sx: s1Mid.x, sy: s1Mid.y, sz: s1Mid.z, cards: 9 });

    // Bough 2 (mid right-back)
    const s2Root = spineAt(0.68);
    const s2Mid = new THREE.Vector3(s2Root.x + 0.72, s2Root.y + 0.38, s2Root.z - 0.24);
    const s2Tip = new THREE.Vector3(s2Root.x + 1.38, s2Root.y + 0.72, s2Root.z - 0.46);
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(s2Root, s2Mid, s2Tip, 5), 0.086, 0.030, 6));
    const s2SubTip = new THREE.Vector3(s2Tip.x - 0.34, s2Tip.y + 0.22, s2Tip.z - 0.58);
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(s2Mid, new THREE.Vector3(s2Mid.x + 0.18, s2Mid.y + 0.22, s2Mid.z - 0.38), s2SubTip, 3), 0.050, 0.024, 5));

    puffs.push({ cx: s2Tip.x, cy: s2Tip.y + 0.22, cz: s2Tip.z, rx: 1.02, ry: 0.80, rz: 0.98, sx: s2Root.x, sy: s2Root.y, sz: s2Root.z, cards: 9 });
    puffs.push({ cx: s2SubTip.x, cy: s2SubTip.y + 0.18, cz: s2SubTip.z, rx: 0.84, ry: 0.68, rz: 0.82, sx: s2Mid.x, sy: s2Mid.y, sz: s2Mid.z, cards: 9 });
    puffs.push({ cx: s2Mid.x + 0.12, cy: s2Mid.y + 0.52, cz: s2Mid.z + 0.44, rx: 0.82, ry: 0.68, rz: 0.80, sx: s2Root.x, sy: s2Root.y, sz: s2Root.z, cards: 9 });

    // Bough 3: Upper elder crown (7 overlapping spiky bushes)
    const s3Root = spineAt(0.86);
    const s3Left = new THREE.Vector3(s3Root.x - 0.78, s3Root.y + 0.68, s3Root.z - 0.28);
    const s3Right = new THREE.Vector3(s3Root.x + 0.72, s3Root.y + 0.64, s3Root.z + 0.44);
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(s3Root, new THREE.Vector3(s3Root.x - 0.42, s3Root.y + 0.44, s3Root.z - 0.16), s3Left, 3), 0.062, 0.026, 5));
    woodGeos.push(buildTaperedCurvedLimb(sampleQuadraticSpine(s3Root, new THREE.Vector3(s3Root.x + 0.38, s3Root.y + 0.40, s3Root.z + 0.24), s3Right, 3), 0.062, 0.026, 5));

    const apexTop = spineAt(1.0);
    puffs.push({ cx: apexTop.x, cy: apexTop.y + 0.78, cz: apexTop.z, rx: 1.18, ry: 0.96, rz: 1.14, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 10 });
    puffs.push({ cx: s3Left.x, cy: s3Left.y + 0.26, cz: s3Left.z, rx: 0.94, ry: 0.78, rz: 0.92, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 9 });
    puffs.push({ cx: s3Right.x, cy: s3Right.y + 0.24, cz: s3Right.z, rx: 0.92, ry: 0.76, rz: 0.90, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 9 });
    puffs.push({ cx: apexTop.x - 0.42, cy: apexTop.y + 0.34, cz: apexTop.z + 0.62, rx: 0.88, ry: 0.74, rz: 0.86, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 9 });
    puffs.push({ cx: apexTop.x + 0.46, cy: apexTop.y + 0.38, cz: apexTop.z - 0.56, rx: 0.86, ry: 0.72, rz: 0.84, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 9 });
    puffs.push({ cx: apexTop.x + 0.10, cy: apexTop.y + 1.24, cz: apexTop.z + 0.04, rx: 0.84, ry: 0.74, rz: 0.82, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 9 });
    puffs.push({ cx: apexTop.x - 0.76, cy: apexTop.y - 0.14, cz: apexTop.z + 0.16, rx: 0.80, ry: 0.68, rz: 0.78, sx: s3Root.x, sy: s3Root.y, sz: s3Root.z, cards: 8 });

    const crownCenter = new THREE.Vector3(0.0, 4.35, 0.0);
    const woodGeo = mergeBufferGeometries(woodGeos);
    const foliageGeo = buildStylizedFoliagePuffs(puffs, crownCenter, 91.4);
    return { woodGeo, foliageGeo, crownHeight: 6.35, crownRadius: 2.75, puffCount: puffs.length, trunkHeight };
  }

  const variantGeometryCache = {};
  let autoCycleIndex = 0;

  function resolveVariantKey(variantKey = 'auto', seedHint = null) {
    if (typeof variantKey === 'number' && Number.isFinite(variantKey)) {
      const idx = ((Math.trunc(variantKey) % 3) + 3) % 3;
      return STYLIZED_TREE_VARIANTS[idx];
    }
    if (typeof variantKey === 'string' && STYLIZED_TREE_VARIANTS.includes(variantKey)) {
      return variantKey;
    }
    if (seedHint !== null && seedHint !== undefined && Number.isFinite(seedHint)) {
      const idx = Math.floor(hash01(seedHint * 0.73 + 1.9) * 3) % 3;
      return STYLIZED_TREE_VARIANTS[idx];
    }
    const idx = autoCycleIndex % 3;
    autoCycleIndex++;
    return STYLIZED_TREE_VARIANTS[idx];
  }

  function createStylizedDeciduousTreeGeometry(variantKey = 'oak_dome') {
    const resolved = resolveVariantKey(variantKey);
    if (variantGeometryCache[resolved]) return variantGeometryCache[resolved];

    let built;
    if (resolved === 'twin_bough') built = buildTwinBoughGeometry();
    else if (resolved === 'tiered_shelf') built = buildTieredShelfGeometry();
    else built = buildOakDomeGeometry();

    built.woodGeo.computeBoundingBox();
    built.woodGeo.computeBoundingSphere();
    built.foliageGeo.computeBoundingBox();
    built.foliageGeo.computeBoundingSphere();

    const entry = {
      variantKey: resolved,
      variantIndex: STYLIZED_TREE_VARIANTS.indexOf(resolved),
      woodGeo: built.woodGeo,
      foliageGeo: built.foliageGeo,
      crownHeight: built.crownHeight,
      crownRadius: built.crownRadius,
      puffCount: built.puffCount,
      trunkHeight: built.trunkHeight,
    };
    variantGeometryCache[resolved] = entry;
    return entry;
  }

  function buildStylizedTree(variantKey = 'auto', colorKey = 'emerald', scale = 1.0, options = {}) {
    const palKey = STYLIZED_DECIDUOUS_PALETTES[colorKey] ? colorKey : 'emerald';
    const pal = STYLIZED_DECIDUOUS_PALETTES[palKey];
    const resolvedVariant = resolveVariantKey(variantKey, options.seedHint);
    const geomEntry = createStylizedDeciduousTreeGeometry(resolvedVariant);

    const group = new THREE.Group();
    const canopyPivot = new THREE.Group();
    group.add(canopyPivot);

    const castsShadow = options.castShadow !== undefined ? Boolean(options.castShadow) : true;
    const heightRatio = options.heightRatio !== undefined ? options.heightRatio : 1.0;

    const trunkMesh = new THREE.Mesh(geomEntry.woodGeo, stylizedWoodMat);
    trunkMesh.castShadow = castsShadow;
    trunkMesh.receiveShadow = true;
    canopyPivot.add(trunkMesh);

    const foliageMat = deciduousMaterials[palKey];
    const foliageDepthMat = deciduousDepthMaterials[palKey];
    const foliageMesh = new THREE.Mesh(geomEntry.foliageGeo, foliageMat);
    foliageMesh.customDepthMaterial = foliageDepthMat;
    foliageMesh.castShadow = castsShadow;
    foliageMesh.receiveShadow = true;
    canopyPivot.add(foliageMesh);

    group.scale.set(scale, scale * heightRatio, scale);
    if (options.yaw !== undefined) {
      group.rotation.y = options.yaw;
    }

    const x = options.x || 0;
    const y = options.y || 0;
    const z = options.z || 0;
    group.position.set(x, y, z);

    const variantTitle = resolvedVariant === 'twin_bough'
      ? 'Dua Batang'
      : (resolvedVariant === 'tiered_shelf' ? 'Teras Bertingkat' : 'Mahkota Rimbun');

    group.userData = {
      type: 'tree',
      treeKind: 'deciduous',
      isStylizedDeciduous: true,
      paletteColors: pal,
      variantKey: resolvedVariant,
      variantIndex: geomEntry.variantIndex,
      name: `${pal.name} (${variantTitle})`,
      naturalColorKey: palKey,
      canopy: canopyPivot,
      trunkMesh,
      foliageMesh,
      phase: options.phase !== undefined ? options.phase : hash01(x * 13.7 + z * 29.3 + 0.5) * Math.PI * 2,
      rustleBoost: 0,
      leafColor: new THREE.Color(pal.burstColor),
      boundingSphere: new THREE.Sphere(
        new THREE.Vector3(x, y + geomEntry.crownHeight * 0.55 * scale * heightRatio, z),
        geomEntry.crownRadius * 1.15 * scale * Math.max(1.0, heightRatio)
      ),
    };

    return group;
  }

  return {
    STYLIZED_TREE_VARIANTS,
    DECIDUOUS_PALETTES: STYLIZED_DECIDUOUS_PALETTES,
    deciduousMaterials,
    deciduousDepthMaterials,
    trunkMat,
    stylizedWoodMat,
    createStylizedLeafClumpTexture,
    injectStylizedCloudFoliageShader,
    buildStylizedFoliagePuffs,
    createStylizedDeciduousTreeGeometry,
    buildStylizedTree,
    resolveVariantKey,
    getCachedGeometryVariants: () => Object.keys(variantGeometryCache),
  };
}

export {
  createStylizedTreeToolkit,
  STYLIZED_TREE_VARIANTS,
  STYLIZED_DECIDUOUS_PALETTES,
};
