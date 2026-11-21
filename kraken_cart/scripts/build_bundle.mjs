import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function mustReplace(src, pattern, replacement, label) {
  const next = src.replace(pattern, replacement);
  if (next === src) {
    throw new Error(`Pattern not found in ${label}: ${pattern}`);
  }
  return next;
}

function wrapIIFE(label, body, assignVar = null) {
  const header = `// --- ${label} ---\n`;
  if (assignVar) {
    return `${header}const ${assignVar} = (() => {\n'use strict';\n${body}\n})();\n`;
  }
  return `${header}(() => {\n'use strict';\n${body}\n})();\n`;
}

function stripLeadingImports(src) {
  return src.replace(/^(?:[ \t]*import\s+(?:[^;]+?from\s+)?['"][^'"]+['"];?[ \t]*\r?\n)+/m, '');
}

function buildThree() {
  const src = read('vendor/three.module.min.js');
  const idx = src.lastIndexOf('export{');
  if (idx < 0) throw new Error('export{ not found in vendor/three.module.min.js');
  const endIdx = src.indexOf('};', idx);
  if (endIdx < 0) throw new Error('closing }; for export{ not found in vendor/three.module.min.js');

  const exportClause = src.slice(idx + 'export{'.length, endIdx);
  const mapped = exportClause
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(/^(\S+)\s+as\s+(\S+)$/);
      if (m) return `${m[2]}:${m[1]}`;
      return entry;
    });

  const body = src.slice(0, idx) + `return {${mapped.join(',')}};` + src.slice(endIdx + 2);
  return wrapIIFE('vendor/three.module.min.js', body, '__THREE_MOD');
}

function buildOrbitControls() {
  let src = read('vendor/OrbitControls.js');
  src = mustReplace(
    src,
    /^\s*import\s*\{[\s\S]*?\}\s*from\s*'three';\s*\r?\n/,
    'const { EventDispatcher, MOUSE, Quaternion, Spherical, TOUCH, Vector2, Vector3, Plane, Ray, MathUtils } = __THREE_MOD;\n',
    'vendor/OrbitControls.js (import)'
  );
  src = mustReplace(
    src,
    /\s*export\s*\{\s*OrbitControls\s*\};\s*$/,
    '\nreturn { OrbitControls };\n',
    'vendor/OrbitControls.js (export)'
  );
  return wrapIIFE('vendor/OrbitControls.js', src, '__ORBIT_MOD');
}

function buildHC() {
  let src = read('js/hc.js');
  src = mustReplace(src, /^\s*import\s+\*\s+as\s+THREE\s+from\s+'three';\s*\r?\n/m, 'const THREE = __THREE_MOD;\n', 'js/hc.js (THREE)');
  src = mustReplace(
    src,
    /^\s*import\s*\{\s*OrbitControls\s*\}\s*from\s*'three\/addons\/controls\/OrbitControls\.js';\s*\r?\n/m,
    'const { OrbitControls } = __ORBIT_MOD;\n',
    'js/hc.js (OrbitControls)'
  );
  src = mustReplace(src, /export\s+const\s+HC\s*=/, 'const HC =', 'js/hc.js (export)');
  src += '\nreturn { HC };\n';
  return wrapIIFE('js/hc.js', src, '__MOD_HC') + 'const { HC } = __MOD_HC;\n';
}

function buildMap() {
  let src = read('js/map.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/map.js (import)');
  src = mustReplace(src, /export\s+default\s+MAP;/, 'return MAP;', 'js/map.js (export)');
  return wrapIIFE('js/map.js', src, '__MOD_MAP');
}

function buildSideEffectModule(relPath) {
  const src = stripLeadingImports(read(relPath));
  return wrapIIFE(relPath, src);
}

function buildForestAssets() {
  let src = read('js/forest_assets.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/forest_assets.js (import)');
  const idx = src.lastIndexOf('export {');
  if (idx < 0) throw new Error('export { not found in js/forest_assets.js');
  src = src.slice(0, idx) + 'return {' + src.slice(idx + 'export {'.length);
  return wrapIIFE('js/forest_assets.js', src, '__MOD_FA');
}

function buildForestConsumer(relPath) {
  let src = read(relPath);
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', `${relPath} (HC)`);
  src = mustReplace(
    src,
    /^\s*import\s+\*\s+as\s+FA\s+from\s*'\.\/forest_assets\.js';\s*\r?\n/m,
    'const FA = __MOD_FA;\n',
    `${relPath} (FA)`
  );
  src = mustReplace(src, /\bexport\s+class\s+/, 'class ', `${relPath} (export class)`);
  return wrapIIFE(relPath, src);
}

function buildWorld() {
  let src = read('js/world.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/world.js (HC)');
  src = mustReplace(src, /^\s*import\s*'\.\/voxel\.js';\s*\r?\n/m, '', 'js/world.js (voxel)');
  src = mustReplace(src, /^\s*import\s+MAP\s+from\s*'\.\/map\.js';\s*\r?\n/m, 'const MAP = __MOD_MAP;\n', 'js/world.js (MAP)');
  return wrapIIFE('js/world.js', src);
}

function buildShim() {
  let src = read('js/sylvan/shim.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\.\/hc\.js';\s*\r?\n/m, '', 'js/sylvan/shim.js (import)');
  src = mustReplace(src, /\bexport\s*\{\s*T\s*\};\s*$/, '', 'js/sylvan/shim.js (export)');
  return wrapIIFE('js/sylvan/shim.js', src);
}

function buildSylvanModels() {
  const src = read('js/sylvan/models.js')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*\r?\n/gm, '')
    .replace(/^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\.\/hc\.js';\s*\r?\n/m, '');
  return wrapIIFE('js/sylvan/models.js', src);
}

function buildUpgrades() {
  let src = read('js/upgrades.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/upgrades.js (import)');
  src = src.replace(/\bexport\s+(const|class)\s+/g, '$1 ');
  src += '\nreturn { UPGRADE_LINES, STRAP_JOLT, DEFAULT_LEVELS, UpgradeStore };\n';
  return wrapIIFE('js/upgrades.js', src, '__MOD_UPGRADES');
}

function buildUI() {
  let src = read('js/ui.js');
  src = mustReplace(
    src,
    /^\s*import\s*\{\s*UPGRADE_LINES\s*\}\s*from\s*'\.\/upgrades\.js';\s*\r?\n/m,
    'const { UPGRADE_LINES } = __MOD_UPGRADES;\n',
    'js/ui.js (import)'
  );
  src = mustReplace(src, /\bexport\s+function\s+initUpgradeUI\b/, 'function initUpgradeUI', 'js/ui.js (export)');
  src += '\nreturn { initUpgradeUI };\n';
  return wrapIIFE('js/ui.js', src, '__MOD_UI');
}

function buildSurvival() {
  let src = read('js/survival.js');
  src = src.replace(/\bexport\s+(const|class)\s+/g, '$1 ');
  src += '\nreturn { SURV_CAP, Survival };\n';
  return wrapIIFE('js/survival.js', src, '__MOD_SURVIVAL');
}

function buildTouchControls() {
  let src = read('js/touch_controls.js');
  src = mustReplace(src, /\bexport\s+function\s+initTouchControls\b/, 'function initTouchControls', 'js/touch_controls.js (export)');
  src += '\nreturn { initTouchControls };\n';
  return wrapIIFE('js/touch_controls.js', src, '__MOD_TOUCH');
}

function buildPerf() {
  let src = read('js/perf.js');
  src = src.replace(/\bexport\s+(const|class|function)\s+/g, '$1 ');
  src += '\nreturn { QUALITY_PRESETS, QUALITY_ORDER, detectQualityKey, resolveQuality, saveQualityKey, bakeNpcLod, setNpcLod, updateNpcLod, cullDistantNpcs };\n';
  return wrapIIFE('js/perf.js', src, '__MOD_PERF');
}

function buildMain() {
  let src = read('js/main.js');
  // Urutan PENTING: blok touch_controls diganti duluan. Regex-nya menelan semua
  // import dari awal file; kalau perf.js diganti duluan, import touch_controls
  // ikut tersapu regex multi-baris perf dan pola ini tidak ketemu lagi.
  src = mustReplace(
    src,
    /^[\s\S]*?import\s*\{\s*initTouchControls\s*\}\s*from\s*'\.\/touch_controls\.js';\s*\r?\n/,
    [
      'const { UpgradeStore } = __MOD_UPGRADES;',
      'const { initUpgradeUI } = __MOD_UI;',
      'const { Survival } = __MOD_SURVIVAL;',
      'const { initTouchControls } = __MOD_TOUCH;',
      ''
    ].join('\n'),
    'js/main.js (imports)'
  );
  src = mustReplace(
    src,
    /^[ \t]*import\s*\{[\s\S]*?\}\s*from\s*'\.\/perf\.js';\s*\r?\n/m,
    'const { QUALITY_ORDER, QUALITY_PRESETS, resolveQuality, saveQualityKey, bakeNpcLod, setNpcLod, updateNpcLod, cullDistantNpcs } = __MOD_PERF;\n',
    'js/main.js (perf imports)'
  );
  return wrapIIFE('js/main.js', src);
}

const SYLVAN_NPCS = [
  'guard', 'hunter', 'miner', 'farmer', 'herbal', 'warrior', 'guardian',
  'merchant', 'dungeonmaster', 'petmerchant', 'lionknight', 'elfmage',
  'stonegiant', 'rabbitwarrior', 'goblin', 'magesupport', 'royalguard', 'lich'
];

const chunks = [
  '// Auto-generated by scripts/build_bundle.mjs for offline/file:// execution.\n(function () {\n',
  buildThree(),
  buildOrbitControls(),
  buildHC(),
  buildMap(),
  buildSideEffectModule('js/voxel.js'),
  buildSideEffectModule('js/horse.js'),
  buildSideEffectModule('js/cart.js'),
  buildWorld(),
  buildSideEffectModule('js/physics.js'),
  buildSideEffectModule('js/animator.js'),
  buildShim(),
  ...SYLVAN_NPCS.map((id) => wrapIIFE(`js/sylvan/npc_${id}.js`, read(`js/sylvan/npc_${id}.js`))),
  buildSylvanModels(),
  buildSideEffectModule('js/npc.js'),
  buildSideEffectModule('js/mobs.js'),
  buildUpgrades(),
  buildUI(),
  buildSurvival(),
  buildTouchControls(),
  buildPerf(),
  buildMain(),
  '})();\n'
];

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'game.bundle.js');
fs.writeFileSync(outFile, chunks.join('\n'), 'utf8');
console.log(`Built ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
