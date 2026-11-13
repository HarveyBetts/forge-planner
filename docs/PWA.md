# PWA — installable, offline Forge (T6.1)

| Check (Lighthouse "installable" + iOS) | Status | How it's met / verified |
|---|---|---|
| Served over HTTPS | ✅ | GitHub Pages (`harveybetts.github.io/forge-planner/`) |
| Web app manifest with name, short_name, start_url, scope, display=standalone, theme/background colours | ✅ | `manifest.webmanifest`; `tests/pwa.test.js` |
| Icons 192 + 512 PNG, a maskable 512 (safe-zone padding) and SVG | ✅ | `icons/` — rendered from the original Forge "blades" logo (vector, from the old app) |
| iOS: apple-touch-icon 180, `apple-mobile-web-app-capable`, title, status-bar style, `viewport-fit=cover` + safe areas | ✅ | `index.html` head; tab bar and sheets use `env(safe-area-inset-*)` |
| Service worker controls the page; app opens offline | ✅ | `sw.js` (cache-first shell, versioned per deploy); e2e `tests/e2e/pwa.spec.js` goes offline and reloads |
| New deploy replaces the old offline copy | ✅ | build stamps a new version → new worker installs, old `forge-shell-*` caches deleted; a toast says the update is ready |
| No personal data in caches | ✅ | only same-origin static files are cached; your data lives in localStorage; FX/fonts are never cached by the worker |
| Theme colour for light and dark | ✅ | two `theme-color` metas; Settings → Appearance steers them |
| Works with storage blocked | ✅ | warns on the first screen (T2.9) |

Worker registration only happens over HTTPS, so local dev and the test server never get a stale cached copy.

**On the iPhone:** open the site in Safari → Share → **Add to Home Screen**. It opens full-screen with the Forge icon and keeps
working without signal (exchange rates fall back to the offline table until you're back online).
