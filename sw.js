// Forge service worker — offline app shell (T6.1).
// The build (scripts/build-site.sh) replaces __VERSION__ and __PRECACHE__, so every deploy is a new worker with the exact file
// list: the new version installs in the background, old caches are deleted, and the app works offline from then on.
// Only same-origin GETs are handled (cache-first for the shell). Exchange rates and fonts go straight to the network — FX has its
// own 6-hour cache and offline table, fonts have system fallbacks. Nothing personal is ever cached here: your data is in
// localStorage, not in network responses.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `forge-shell-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('forge-shell-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // network as normal (FX API, fonts)
  // Navigations (opening the app, deep links like #budget) get the cached page; hashes never reach the server anyway.
  const key = req.mode === 'navigate' ? new URL('./index.html', self.registration.scope).href : req;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const shell = await cache.match(new URL('./index.html', self.registration.scope).href);
      if (shell && req.mode === 'navigate') return shell;
      throw err;
    }
  }));
});
