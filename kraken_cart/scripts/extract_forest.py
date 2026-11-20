import re, json, pathlib
RAW = pathlib.Path('/data/workspace/hutan/index.html').read_text()
SCRIPT = RAW.split('<script>')[-1].split('</script>')[0]

def span_balanced(start, open_ch, close_ch, s=SCRIPT):
    i = s.index(open_ch, start)
    depth = 0
    in_str = None
    esc = False
    in_line = in_block = False
    j = i
    while j < len(s):
        c = s[j]; n = s[j+1] if j+1 < len(s) else ''
        if in_line:
            if c == '\n': in_line = False
        elif in_block:
            if c == '*' and n == '/': in_block = False; j += 1
        elif in_str:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == in_str: in_str = None
        else:
            if c == '/' and n == '/': in_line = True; j += 1
            elif c == '/' and n == '*': in_block = True; j += 1
            elif c in ('"', "'", '`'): in_str = c
            elif c == open_ch: depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i, j+1
        j += 1
    raise ValueError('unterminated '+open_ch)

def func_src(name):
    start = SCRIPT.index('function '+name+'(')
    p_open = SCRIPT.index('(', start)
    # lompati daftar parameter (bisa berisi default object) dulu
    _, p_close = span_balanced(p_open, '(', ')')
    a, b = span_balanced(p_close, '{', '}')
    return SCRIPT[start:b]

def const_src(name):
    # find const NAME = ... ; at depth 0 including closing of brackets
    m = re.search(r'\bconst\s+'+re.escape(name)+r'\s*=', SCRIPT)
    start = m.start()
    i = SCRIPT.index('=', start)+1
    depth=0; in_str=None; esc=False; in_line=in_block=False
    j=i
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
            elif c==';' and depth==0:
                return SCRIPT[start:j+1]
        j+=1
    raise ValueError('unterminated const '+name)

FUNCS = [
 'applyStylizedCelShading','createWindFlowTexture','createBladeShadingTexture',
 'createBotWGrassBladeGeometry','createBotWBushLeafTexture','createBotWBush',
 'mergeBufferGeometriesSimple','createSculptedTrunkMesh','addLowerDeadBranchStubs',
 'createPainterlyPineBoughTexture','injectBranchSocketWindShader',
 'createCurvedPineBoughGeometry','createStylizedPineTree','createStylizedDeadPine',
 'createFluffyZeldaLeafCardTexture','injectFluffyZeldaLeafShader',
 'createCurvedLeafTuftCardGeometry','createBotWDeciduousTree','createBotWWaterDataTexture',
 'getTerrainNormal'
]
CONSTS = ['PINE_PALETTES','trunkMat','deadWoodMat','bushLeafMat','berryMat',
          'BASE_BOUGH_GEO','BASE_FLUFFY_LEAF_CARD_GEO','rockMat']
out={}
for f in FUNCS:
    out['function '+f]=func_src(f)
for c in CONSTS:
    out['const '+c]=const_src(c)

# ---- Override CEMARA dari file model baru (hutan_pine_v2.html). ----
# Hanya jalur pine yang diambil dari sana; rumput/semak/batu/pohon daun lebar
# tetap dari sumber lama supaya tidak ikut berubah.
PINE_SRC = pathlib.Path('/data/workspace/hutan/hutan_pine_v2.html').read_text()
PINE_SCRIPT = PINE_SRC.split('<script>')[-1].split('</script>')[0]
PINE_FUNCS = ['addLowerDeadBranchStubs','createBotWPineFanTexture','injectBranchSocketWindShader',
              'createBotWPinePadGeometry','createBotWPineTierSkirtGeometry','createStylizedPineTree']
PINE_CONSTS = ['BASE_BOTW_PINE_PAD_GEO']
_OLD_SCRIPT = SCRIPT
SCRIPT = PINE_SCRIPT
def _span_pine(start, open_ch, close_ch):
    return span_balanced(start, open_ch, close_ch, PINE_SCRIPT)
for f in PINE_FUNCS:
    start = PINE_SCRIPT.index('function '+f+'(')
    p_open = PINE_SCRIPT.index('(', start)
    _, p_close = _span_pine(p_open, '(', ')')
    a, b = _span_pine(p_close, '{', '}')
    out['function '+f] = PINE_SCRIPT[start:b]
for c in PINE_CONSTS:
    out['const '+c] = const_src(c)
SCRIPT = _OLD_SCRIPT
for dead in ('function createPainterlyPineBoughTexture','function createCurvedPineBoughGeometry','const BASE_BOUGH_GEO'):
    out.pop(dead, None)
pathlib.Path('/data/workspace/kraken_cart/scripts/forest_extract.json').write_text(json.dumps(out))
print('entries',len(out),'pine-override',len(PINE_FUNCS)+len(PINE_CONSTS),'chars',sum(len(v) for v in out.values()))
# line references for material loops / water, to adapt by hand
for token in ['const pineMaterials','const deciduousMaterials','const grassMat','const pondMat','const celShaderUniforms','const activeAtmosphere','const PINE_COLOR_IDS']:
    idx=SCRIPT.find(token)
    print(token, 'line', RAW[:RAW.find(SCRIPT)].count('\n')+SCRIPT[:idx].count('\n')+1 if idx>=0 else 'N/A')
