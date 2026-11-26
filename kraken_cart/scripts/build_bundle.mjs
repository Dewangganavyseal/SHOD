import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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
  src = src.replace(
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/stylized_trees\.js';\s*\r?\n/m,
    'const {$1} = __MOD_STYLIZED_TREES;\n'
  );
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

function buildModelModule(relPath, assignVar) {
  let src = read(relPath);
  src = src.replace(/^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\.\/hc\.js';\s*\r?\n/m, '');
  const idx = src.lastIndexOf('export {');
  if (idx < 0) throw new Error(`export { not found in ${relPath}`);
  src = src.slice(0, idx) + 'return {' + src.slice(idx + 'export {'.length);
  return wrapIIFE(relPath, src, assignVar);
}

function buildWorld() {
  let src = read('js/world.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/world.js (HC)');
  src = mustReplace(src, /^\s*import\s*'\.\/voxel\.js';\s*\r?\n/m, '', 'js/world.js (voxel)');
  src = mustReplace(src, /^\s*import\s+MAP\s+from\s*'\.\/map\.js';\s*\r?\n/m, 'const MAP = __MOD_MAP;\n', 'js/world.js (MAP)');
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/village_buildings\.js';\s*\r?\n/m,
    'const {$1} = __MOD_VILLAGE_BLDG;\n',
    'js/world.js (village_buildings)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/village_props\.js';\s*\r?\n/m,
    'const {$1} = __MOD_VILLAGE_PROPS;\n',
    'js/world.js (village_props)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/river_assets\.js';\s*\r?\n/m,
    'const {$1} = __MOD_RIVER_ASSETS;\n',
    'js/world.js (river_assets)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/sun_ruins_model\.js';\s*\r?\n/m,
    'const {$1} = __MOD_SUN_RUINS;\n',
    'js/world.js (sun_ruins_model)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/crystal_cavern_model\.js';\s*\r?\n/m,
    'const {$1} = __MOD_CRYSTAL_CAVERN;\n',
    'js/world.js (crystal_cavern_model)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/bandit_camp_model\.js';\s*\r?\n/m,
    'const {$1} = __MOD_BANDIT_CAMP;\n',
    'js/world.js (bandit_camp_model)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([^}]*?)\}\s*from\s*'\.\/models\/stylized_trees\.js';\s*\r?\n/m,
    'const {$1} = __MOD_STYLIZED_TREES;\n',
    'js/world.js (stylized_trees)'
  );
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

function buildMobs() {
  let src = read('js/mobs.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/mobs.js (HC)');
  src = mustReplace(
    src,
    /^\s*import\s*\{([\s\S]*?)\}\s*from\s*'\.\/models\/bandit_models\.js';\s*\r?\n/m,
    'const {$1} = __MOD_BANDIT_MODELS;\n',
    'js/mobs.js (bandit_models)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([\s\S]*?)\}\s*from\s*'\.\/models\/t3_sprite_stack\.js';\s*\r?\n/m,
    'const {$1} = __MOD_T3_SPRITE_STACK;\n',
    'js/mobs.js (t3_sprite_stack)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([\s\S]*?)\}\s*from\s*'\.\/models\/sun_ruins_golem_model\.js';\s*\r?\n/m,
    'const {$1} = __MOD_RUINS_GOLEM;\n',
    'js/mobs.js (sun_ruins_golem_model)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{([\s\S]*?)\}\s*from\s*'\.\/models\/crystal_golem_model\.js';\s*\r?\n/m,
    'const {$1} = __MOD_CRYSTAL_GOLEM;\n',
    'js/mobs.js (crystal_golem_model)'
  );
  return wrapIIFE('js/mobs.js', src);
}

function buildUpgrades() {
  let src = read('js/upgrades.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/upgrades.js (import)');
  src = src.replace(/\bexport\s+(const|class|function)\s+/g, '$1 ');
  src += '\nreturn { UPGRADE_LINES, STRAP_JOLT, DEFAULT_LEVELS, MATERIAL_DEFS, UPGRADE_COSTS, HORSE_STAT_DEFS, UpgradeStore, HorseStatsStore };\n';
  return wrapIIFE('js/upgrades.js', src, '__MOD_UPGRADES');
}

function buildUI() {
  let src = read('js/ui.js');
  src = src.replace(/^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '');
  src = mustReplace(
    src,
    /^\s*import\s*\{[^}]*\}\s*from\s*'\.\/upgrades\.js';\s*\r?\n/m,
    'const { UPGRADE_LINES, MATERIAL_DEFS } = __MOD_UPGRADES;\n',
    'js/ui.js (import upgrades)'
  );
  src = mustReplace(
    src,
    /^\s*import\s*\{[^}]*\}\s*from\s*'\.\/i18n\.js';\s*\r?\n/m,
    'const { t } = __MOD_I18N;\n',
    'js/ui.js (import i18n)'
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

function buildQuests() {
  let src = read('js/quests.js');
  src = src.replace(/^\s*export\s*\{[^}]*\};\s*\r?\n?/gm, '');
  src = src.replace(/\bexport\s+(class|const|function)\s+/g, '$1 ');
  src += '\nreturn { DeliveryQuestSystem, GOODS_POOL, PASSENGER_POOL };\n';
  return wrapIIFE('js/quests.js', src, '__MOD_QUESTS');
}

function buildMinimap() {
  let src = read('js/minimap.js');
  src = src.replace(/\bexport\s+(class|const|function)\s+/g, '$1 ');
  src += '\nreturn { MapUI };\n';
  return wrapIIFE('js/minimap.js', src, '__MOD_MINIMAP');
}

function buildPerf() {
  let src = read('js/perf.js');
  src = src.replace(/\bexport\s+(const|class|function)\s+/g, '$1 ');
  src += '\nreturn { QUALITY_PRESETS, QUALITY_ORDER, detectQualityKey, resolveQuality, saveQualityKey, bakeNpcLod, setNpcLod, updateNpcLod, cullDistantNpcs };\n';
  return wrapIIFE('js/perf.js', src, '__MOD_PERF');
}

function buildI18n() {
  let src = read('js/i18n.js');
  src = mustReplace(src, /^\s*import\s*\{\s*HC\s*\}\s*from\s*'\.\/hc\.js';\s*\r?\n/m, '', 'js/i18n.js (HC)');
  src = src.replace(/^\s*export\s*\{[^}]*\};\s*\r?\n?/gm, '');
  src = src.replace(/\bexport\s+(const|class|function)\s+/g, '$1 ');
  src += '\nreturn { DICT, getLang, setLang, onLangChange, t };\n';
  return wrapIIFE('js/i18n.js', src, '__MOD_I18N');
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
      'const { getLang, setLang, onLangChange, t } = __MOD_I18N;',
      'const { UpgradeStore, HorseStatsStore, MATERIAL_DEFS, UPGRADE_COSTS, HORSE_STAT_DEFS } = __MOD_UPGRADES;',
      'const { initUpgradeUI } = __MOD_UI;',
      'const { Survival } = __MOD_SURVIVAL;',
      'const { DeliveryQuestSystem, GOODS_POOL, PASSENGER_POOL } = __MOD_QUESTS;',
      'const { MapUI } = __MOD_MINIMAP;',
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
  buildI18n(),
  buildMap(),
  buildSideEffectModule('js/voxel.js'),
  buildSideEffectModule('js/horse.js'),
  buildSideEffectModule('js/cart.js'),
  buildModelModule('js/models/village_buildings.js', '__MOD_VILLAGE_BLDG'),
  buildModelModule('js/models/village_props.js', '__MOD_VILLAGE_PROPS'),
  buildModelModule('js/models/river_assets.js', '__MOD_RIVER_ASSETS'),
  buildModelModule('js/models/sun_ruins_model.js', '__MOD_SUN_RUINS'),
  buildModelModule('js/models/crystal_cavern_model.js', '__MOD_CRYSTAL_CAVERN'),
  buildModelModule('js/models/bandit_camp_model.js', '__MOD_BANDIT_CAMP'),
  buildModelModule('js/models/stylized_trees.js', '__MOD_STYLIZED_TREES'),
  buildWorld(),
  buildSideEffectModule('js/physics.js'),
  buildSideEffectModule('js/animator.js'),
  buildShim(),
  ...SYLVAN_NPCS.map((id) => wrapIIFE(`js/sylvan/npc_${id}.js`, read(`js/sylvan/npc_${id}.js`))),
  buildSylvanModels(),
  buildModelModule('js/models/t3_sprite_stack.js', '__MOD_T3_SPRITE_STACK'),
  buildSideEffectModule('js/npc.js'),
  buildModelModule('js/models/bandit_models.js', '__MOD_BANDIT_MODELS'),
  buildModelModule('js/models/sun_ruins_golem_model.js', '__MOD_RUINS_GOLEM'),
  buildModelModule('js/models/crystal_golem_model.js', '__MOD_CRYSTAL_GOLEM'),
  buildMobs(),
  buildUpgrades(),
  buildSideEffectModule('js/vintage_gui.js'),
  buildSideEffectModule('js/sfx.js'),
  buildUI(),
  buildSurvival(),
  buildQuests(),
  buildMinimap(),
  buildTouchControls(),
  buildPerf(),
  buildMain(),
  '})();\n'
];

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'game.bundle.js');
const bundleCode = chunks.join('\n');
// Pastikan valid sebagai classic <script> (bukan ES module, bebas import/export) untuk file://
new vm.Script(bundleCode, { filename: 'dist/game.bundle.js' });
fs.writeFileSync(outFile, bundleCode, 'utf8');
console.log(`Built ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
