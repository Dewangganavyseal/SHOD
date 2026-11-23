// Headless Chrome smoke test for cargo colliders, stacking, and bed bounds.
// Local:  node tests/tools/headless-cargo.mjs
// Remote: SHOD_URL=https://... node tests/tools/headless-cargo.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome/Edge tidak ditemukan. Set CHROME_PATH.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
};

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.resolve(ROOT, '.' + rel);
      if (!file.startsWith(ROOT + path.sep)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const data = fs.readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function waitForFile(file, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    await sleep(80);
  }
  throw new Error(`Timeout menunggu ${file}`);
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      }
    };
    this.opened = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('CDP WebSocket error'));
    });
  }
  async send(method, params = {}) {
    await this.opened;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function waitForRig(cdp, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `({ ready: !!window.RIG, errors: (window.__errors || []).slice(-8), boot: (document.getElementById('boot-error')||{}).textContent || '' })`,
        returnByValue: true
      });
      const value = result.result && result.result.value;
      if (value && value.ready) return value;
      if (value && value.errors && value.errors.length) {
        console.error('boot errors:', value.errors);
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('RIG tidak siap di headless Chrome');
}

async function main() {
  const chromePath = findChrome();
  const externalUrl = process.env.SHOD_URL || '';
  const local = externalUrl ? null : await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shod-headless-'));
  const url = externalUrl || `http://127.0.0.1:${local.port}/index.html?bundle=1&quality=potato&headless=1`;
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--window-size=1280,800',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let chromeErr = '';
  chrome.stderr.on('data', (d) => { chromeErr += String(d); });

  let cdp = null;
  try {
    const activePort = await waitForFile(path.join(profile, 'DevToolsActivePort'));
    const [portLine, wsPath] = activePort.split(/\r?\n/);
    const debugPort = Number(portLine);
    if (!debugPort) throw new Error('DevToolsActivePort tidak valid');
    let list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    let target = list.find((t) => t.type === 'page');
    if (!target && wsPath) target = { webSocketDebuggerUrl: `ws://127.0.0.1:${debugPort}${wsPath}` };
    if (!target) throw new Error('Target page CDP tidak ditemukan');

    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url });
    await waitForRig(cdp);

    const expression = String.raw`(async () => {
      const out = { pass: [], fail: [] };
      const ok = (name, cond, info) => {
        if (cond) out.pass.push(name);
        else out.fail.push({ name, info });
      };
      const R = window.RIG;
      const HC = window.HC;
      const S = HC.cartVS;
      R.startNewGame();
      await new Promise((r) => setTimeout(r, 120));

      const items = R.cart.cargoItems.filter((it) => it && it.mesh);
      ok('kargo starter terbentuk', items.length >= 6, { count: items.length });
      ok('semua kargo punya compound voxel collider',
        items.every((it) => it.mesh.userData.voxelCollider && it.mesh.userData.voxelCollider.boxes.length > 0),
        { boxes: items.map((it) => (it.mesh.userData.voxelCollider || {}).boxes ? it.mesh.userData.voxelCollider.boxes.length : 0) });
      ok('barrel punya lebih dari satu kotak collider',
        items.some((it) => it.mesh.userData.voxelCollider && it.mesh.userData.voxelCollider.boxes.length > 3),
        { boxes: items.map((it) => (it.mesh.userData.voxelCollider || {}).boxes ? it.mesh.userData.voxelCollider.boxes.length : 0) });

      const cap = R.cart.specs && R.cart.specs.capSpec || { bedFrontX: 24, bedHalfW: 15 };
      const bed = {
        xMin: 1.6 * S,
        xMax: ((cap.bedFrontX ?? 24) - 2) * S,
        zMin: -(((cap.bedHalfW ?? 15) - 1)) * S,
        zMax: (((cap.bedHalfW ?? 15) - 1)) * S
      };
      const inside = (it) => {
        if (!it.localCenter || !it.localHalf) return true;
        const c = Math.cos(it.localAng.y), s = Math.sin(it.localAng.y);
        const cx = it.localPos.x + c * it.localCenter.x + s * it.localCenter.z;
        const cz = it.localPos.z - s * it.localCenter.x + c * it.localCenter.z;
        const hx = Math.abs(c) * it.localHalf.x + Math.abs(s) * it.localHalf.z;
        const hz = Math.abs(s) * it.localHalf.x + Math.abs(c) * it.localHalf.z;
        return cx - hx >= bed.xMin - 0.03 && cx + hx <= bed.xMax + 0.03
          && cz - hz >= bed.zMin - 0.03 && cz + hz <= bed.zMax + 0.03;
      };

      const ph = R.physics;
      for (const it of items) { it.localVel.set(0, 0, 0); it.localAngVel.set(0, 0, 0); }
      for (let i = 0; i < 180; i++) ph.updateCargo(1 / 60, 0, 0);
      ok('kargo starter tetap di dalam bak setelah settle', items.every(inside),
        items.filter((it) => !inside(it)).map((it) => ({ x: it.localPos.x, z: it.localPos.z })));

      // Isolate two items, then drop one exactly over the other.
      const a = items[0], b = items.find((it) => it !== a && it.mesh.userData.voxelCollider);
      for (const it of items) {
        if (it === a || it === b) continue;
        it.hiddenForQuest = true;
        it.mesh.visible = false;
      }
      const targetX = (bed.xMin + bed.xMax) * 0.5;
      const targetZ = 0;
      a.localPos.set(targetX - a.localCenter.x, a.floorY, targetZ - a.localCenter.z);
      a.localVel.set(0, 0, 0); a.localAng.set(a.homeRot.x, a.homeRot.y, a.homeRot.z);
      a.localAngVel.set(0, 0, 0);
      a.homePos.set(a.localPos.x, a.localPos.y, a.localPos.z);
      a._supportBy = null; a._supportY = a.floorY;
      b.homePos.set(targetX - b.localCenter.x, b.floorY, targetZ - b.localCenter.z);
      b.localPos.set(b.homePos.x, a.localPos.y + a._colTop - b._colBottom + 0.28, b.homePos.z);
      b.localVel.set(0, 0, 0); b.localAng.set(b.homeRot.x, b.homeRot.y, b.homeRot.z);
      b.localAngVel.set(0, 0, 0); b._supportBy = null; b._supportY = b.floorY;

      for (let i = 0; i < 240; i++) ph.updateCargo(1 / 60, 0, 0);
      const aTop = a.localPos.y + a._colTop;
      const bBottom = b.localPos.y + b._colBottom;
      ok('barang atas berhenti di permukaan barang bawah', Math.abs(bBottom - aTop) < 0.025,
        { aTop, bBottom, gap: bBottom - aTop, aY: a.localPos.y, bY: b.localPos.y, supportBy: !!b._supportBy });
      ok('barang atas benar-benar di atas barang bawah', b.localPos.y > a.localPos.y + 0.05,
        { aY: a.localPos.y, bY: b.localPos.y });
      ok('barang atas tetap di dalam bak', inside(a) && inside(b), { a: inside(a), b: inside(b) });

      // Quest cargo uses the same collider path.
      HC.setQuestCargoOnCart(R.cart, ph, 'spices', 3);
      const quest = R.cart.cargoItems.filter((it) => it && it.isQuestCargo);
      ok('kargo quest dibuat dengan collider', quest.length === 3 &&
        quest.every((it) => it.mesh.userData.voxelCollider && it.mesh.userData.voxelCollider.boxes.length > 0),
        { count: quest.length });
      for (let i = 0; i < 150; i++) ph.updateCargo(1 / 60, 0, 0);
      ok('kargo quest tetap di dalam bak', quest.every(inside),
        quest.filter((it) => !inside(it)).map((it) => ({ x: it.localPos.x, z: it.localPos.z })));
      ok('tanpa error runtime', !(window.__errors || []).length, (window.__errors || []).slice(-5));

      return out;
    })()`;

    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      console.error(JSON.stringify(result.exceptionDetails, null, 2));
      throw new Error('Test headless exception');
    }
    return result.result.value;
  } finally {
    if (cdp) cdp.close();
    try { local && local.server.close(); } catch {}
    try {
      execFileSync('taskkill', ['/pid', String(chrome.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch {
      try { chrome.kill(); } catch {}
    }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    if (chromeErr && /error/i.test(chromeErr) && !/DevTools listening/.test(chromeErr)) {
      // Keep stderr quiet unless Chrome failed to start; useful in CI logs.
    }
  }
}

main().then((out) => {
  for (const name of out.pass) console.log(`ok - ${name}`);
  for (const f of out.fail) console.error(`not ok - ${f.name}\n  ${JSON.stringify(f.info)}`);
  console.log(`\nheadless cargo: ${out.pass.length} passed, ${out.fail.length} failed`);
  process.exit(out.fail.length ? 1 : 0);
}).catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
