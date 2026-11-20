import json, re, pathlib
raw = pathlib.Path('/data/workspace/hutan/index.html').read_text()
SCRIPT = raw.split('<script>')[-1].split('</script>')[0]
EXTRACT = json.load(open('/data/workspace/kraken_cart/scripts/forest_extract.json'))

def span_balanced(start, open_ch, close_ch, s=SCRIPT):
    i = s.index(open_ch, start); depth=0; in_str=None; esc=False; in_line=in_block=False; j=i
    while j < len(s):
        c=s[j]; n=s[j+1] if j+1<len(s) else ''
        if in_line:
            if c=='\n': in_line=False
        elif in_block:
            if c=='*' and n=='/': in_block=False; j+=1
        elif in_str:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==in_str: in_str=None
        else:
            if c=='/' and n=='/': in_line=True; j+=1
            elif c=='/' and n=='*': in_block=True; j+=1
            elif c in ('"',"'",'`'): in_str=c
            elif c==open_ch: depth+=1
            elif c==close_ch:
                depth-=1
                if depth==0: return i, j+1
        j+=1
    raise ValueError

def assign_src(token):
    start = SCRIPT.index(token)
    i = SCRIPT.index('=', start)+1
    depth=0; in_str=None; esc=False; in_line=in_block=False; j=i
    pairs={'{':'}','[':']','(':')'}
    while j < len(SCRIPT):
        c=SCRIPT[j]; n=SCRIPT[j+1] if j+1<len(SCRIPT) else ''
        if in_line:
            if c=='\n': in_line=False
        elif in_block:
            if c=='*' and n=='/': in_block=False; j+=1
        elif in_str:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==in_str: in_str=None
        else:
            if c=='/' and n=='/': in_line=True; j+=1
            elif c=='/' and n=='*': in_block=True; j+=1
            elif c in ('"',"'",'`'): in_str=c
            elif c in pairs: depth+=1
            elif c in pairs.values(): depth-=1
            elif c==';' and depth==0: return SCRIPT[start:j+1]
        j+=1
    raise ValueError(token)

HEADER = '''/* ============================================================================
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
'''

FUNCS = [
 'createWindFlowTexture','createBladeShadingTexture','createBotWGrassBladeGeometry',
 'applyStylizedCelShading','mergeBufferGeometriesSimple','createBotWBushLeafTexture',
 'createBotWBush','createSculptedTrunkMesh','addLowerDeadBranchStubs',
 'createBotWPineFanTexture','injectBranchSocketWindShader',
 'createBotWPinePadGeometry','createBotWPineTierSkirtGeometry','createStylizedPineTree','createStylizedDeadPine',
 'createFluffyZeldaLeafCardTexture','injectFluffyZeldaLeafShader',
 'createCurvedLeafTuftCardGeometry','createBotWDeciduousTree','createBotWWaterDataTexture',
 'getTerrainNormal',
]
CONSTS = ['PINE_PALETTES','trunkMat','deadWoodMat','bushLeafMat','berryMat','rockMat',
          'BASE_BOTW_PINE_PAD_GEO','BASE_FLUFFY_LEAF_CARD_GEO']
LOOPS = '''
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
'''
EXPORTS = '''
export {
  createStylizedPineTree, createBotWDeciduousTree, createStylizedDeadPine,
  createBotWBush, createBotWGrassBladeGeometry, createBotWWaterDataTexture,
  createWindFlowTexture, createBladeShadingTexture, applyStylizedCelShading,
  grassMat, grassUniforms, celShaderUniforms, pineMaterials, deciduousMaterials,
  pineDepthMaterials, deciduousDepthMaterials, PINE_PALETTES,
  trunkMat, deadWoodMat, bushLeafMat, berryMat, rockMat,
  setForestSeed, setTerrainHeightSampler, getTerrainHeight, atmosphere,
};
'''

parts = [HEADER]
for f in FUNCS:
    parts.append('\n// ---- source: '+f+' ----\n' + EXTRACT['function '+f])
for c in CONSTS:
    parts.append('\n'+EXTRACT['const '+c])
parts.append(LOOPS)
parts.append('\n' + assign_src('const grassMat ='))
parts.append('\n'+assign_src('grassMat.onBeforeCompile'))
parts.append(EXPORTS)
code = '\n'.join(parts)
# Math.random() hanya untuk variasi visual; dipaksa deterministik.
code = code.replace('Math.random()', 'rnd()')
path = pathlib.Path('/data/workspace/kraken_cart/js/forest_assets.js')
path.write_text(code)
print('wrote', path, len(code), 'chars')
