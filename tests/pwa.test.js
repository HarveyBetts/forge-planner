import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

function build() {
  const out = join(mkdtempSync(join(tmpdir(), 'forge-pwa-')), '_site');
  const r = spawnSync('bash', ['scripts/build-site.sh', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return out;
}
const walk = (d, base = d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), base) : ['./' + join(d, e.name).slice(base.length + 1)]));

test('pwa: manifest is valid and every icon it names exists; index links it all', () => {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(m.short_name, 'Forge');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  for (const i of m.icons) assert.ok(existsSync(i.src), i.src);
  const html = readFileSync('index.html', 'utf8');
  for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'viewport-fit=cover', 'name="theme-color"']) assert.ok(html.includes(s), s);
});

test('pwa: built service worker is stamped and precaches exactly the staged files', () => {
  const out = build();
  const sw = readFileSync(join(out, 'sw.js'), 'utf8');
  assert.ok(!sw.includes('__VERSION__') && !sw.includes('__PRECACHE__'));
  const list = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1]);
  const staged = walk(out).filter((f) => f !== './sw.js' && f !== './.nojekyll');
  assert.deepEqual([...list].filter((f) => f !== './').sort(), staged.sort());
  assert.ok(list.includes('./index.html') && list.includes('./src/app.js') && list.includes('./manifest.webmanifest'));
  assert.ok(!list.some((f) => /^\.\/(data|docs|tests|scripts|supabase)\/|\.xlsx$|local\.json$/.test(f)));
});

// Run the built worker in a sandbox with fake caches + fetch.
function loadWorker(src, { online = true, scope = 'https://x.test/app/' } = {}) {
  const stores = new Map();
  const mkCache = (name) => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name);
    const k = (r) => (typeof r === 'string' ? r : r.url);
    return { addAll: async (urls) => urls.forEach((u) => m.set(new URL(u, scope).href, `cached:${new URL(u, scope).pathname}`)),
      match: async (r) => m.get(k(r)) ?? undefined, put: async (r, res) => m.set(k(r), `cached:${res.body}`) }; };
  const listeners = {};
  const net = [];
  const self = { location: new URL(scope), registration: { scope }, addEventListener: (t, f) => (listeners[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const sandbox = { self, URL, Promise, caches: { open: async (n) => mkCache(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) },
    fetch: async (req) => { net.push(req.url); if (!online) throw new TypeError('offline'); return { ok: true, type: 'basic', body: `net:${new URL(req.url).pathname}`, clone() { return this; } }; } };
  vm.runInNewContext(src, sandbox);
  const fire = async (type, extra = {}) => { let p, responded = null; const ev = { ...extra, waitUntil: (x) => (p = x), respondWith: (x) => (responded = x) }; listeners[type](ev); if (p) await p; return responded ? await responded : undefined; };
  return { fire, stores, net, setOnline: (v) => (sandbox.fetch = async (req) => { net.push(req.url); if (!v) throw new TypeError('offline'); return { ok: true, type: 'basic', body: `net:${new URL(req.url).pathname}`, clone() { return this; } }; }) };
}

test('pwa: worker installs the shell, clears old versions, serves cache-first and works offline', async () => {
  const sw = readFileSync(join(build(), 'sw.js'), 'utf8');
  const w = loadWorker(sw);
  w.stores.set('forge-shell-old', new Map()); // a previous deploy
  await w.fire('install');
  await w.fire('activate');
  assert.deepEqual([...w.stores.keys()].filter((k) => k.startsWith('forge-shell-')).length, 1);
  const get = (path, mode = 'cors') => w.fire('fetch', { request: { method: 'GET', mode, url: 'https://x.test/app/' + path } });
  assert.equal(await get('src/app.js'), 'cached:/app/src/app.js');             // cache-first
  assert.equal(await get('anything#budget', 'navigate'), 'cached:/app/index.html'); // navigations get the shell
  assert.equal(w.net.length, 0);
  w.setOnline(false);
  assert.equal(await get('', 'navigate'), 'cached:/app/index.html');             // offline still opens
  // Cross-origin (FX API) is not intercepted at all.
  assert.equal(await w.fire('fetch', { request: { method: 'GET', mode: 'cors', url: 'https://open.er-api.com/v6/latest/USD' } }), undefined);
  // POSTs are never touched.
  assert.equal(await w.fire('fetch', { request: { method: 'POST', mode: 'cors', url: 'https://x.test/app/x' } }), undefined);
});
