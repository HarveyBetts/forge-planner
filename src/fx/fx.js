// FX engine — logic ported from legacy Forge (fxEnsure / fxConvert / FX_FALLBACK / fxIsLive / fxAgeMs).
// Free mid-market rates from open.er-api.com (no key), USD-based table, 6 h cache, offline fallback.
// Everything that touches the outside world (fetch, clock, storage) is injected so this is testable.
//
// Differences from legacy, on purpose:
//   - unknown currencies throw instead of silently converting at 1:1 (that hid bugs);
//   - fetched rates are validated (positive finite numbers, GBP + AUD present) before being trusted;
//   - the cache key is versioned (forge.fx.v1) and every storage access is try/caught.
import { FX_FALLBACK, convertApprox } from './fallback.js';

export const FX_URL = 'https://open.er-api.com/v6/latest/USD';
export const FX_TTL_MS = 6 * 3600 * 1000;
export const FX_KEY = 'forge.fx.v1';
export const FX_CODES = ['GBP', 'AUD', 'USD', 'EUR'];
export { FX_FALLBACK };

// Pure conversion via the USD-based table. Same maths as legacy fxConvert.
export function convert(amount, from, to, rates = FX_FALLBACK) {
  return convertApprox(Number(amount) || 0, from, to, rates);
}

// Keep only the currencies Forge uses; null if the payload can't be trusted.
export function pickRates(payload) {
  const src = payload && payload.rates;
  if (!src || typeof src !== 'object') return null;
  const out = {};
  for (const c of FX_CODES) {
    const r = src[c];
    if (typeof r === 'number' && Number.isFinite(r) && r > 0) out[c] = r;
  }
  if (!out.GBP || !out.AUD) return null;
  out.USD = 1; // the table is USD-based by definition
  return out;
}

export function createFx(opts = {}) {
  const doFetch = opts.fetch || ((...a) => globalThis.fetch(...a));
  const now = opts.now || (() => Date.now());
  let storage = opts.storage;
  if (storage === undefined) { try { storage = globalThis.localStorage || null; } catch { storage = null; } }
  const url = opts.url || FX_URL;

  let cache = null; // { rates, t, live }
  let inflight = null;

  function read() {
    if (cache) return cache;
    try {
      const raw = storage ? storage.getItem(FX_KEY) : null;
      if (raw) {
        const j = JSON.parse(raw);
        const rates = j && pickRates(j);
        if (rates && Number.isFinite(j.t)) { cache = { rates, t: j.t, live: !!j.live }; return cache; }
      }
    } catch { /* corrupt or unavailable → behave as never fetched */ }
    return null;
  }
  function write(c) {
    cache = c;
    try { if (storage) storage.setItem(FX_KEY, JSON.stringify(c)); } catch { /* memory only */ }
  }

  const fx = {
    rates() { const c = read(); return (c && c.rates) || FX_FALLBACK; },
    isLive() { const c = read(); return !!(c && c.live); },
    ageMs() { const c = read(); return c && Number.isFinite(c.t) ? now() - c.t : Infinity; },
    // 'live' (fresh or cached real rates) | 'fallback' (offline table, never fetched successfully)
    source() { return fx.isLive() ? 'live' : 'fallback'; },
    convert(amount, from, to) { return convert(amount, from, to, fx.rates()); },
    // Fetch if the cache is older than 6 h (or force). Never throws: worst case you get the fallback table.
    async ensure(force = false) {
      const c = read();
      if (!force && c && c.live && now() - c.t < FX_TTL_MS) return c.rates;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const res = await doFetch(url);
          if (res && (res.ok === undefined || res.ok)) {
            const rates = pickRates(await res.json());
            if (rates) { write({ rates, t: now(), live: true }); return rates; }
          }
        } catch { /* offline, blocked, bad JSON */ }
        if (c && c.rates) return c.rates;                 // stale but real
        cache = { rates: FX_FALLBACK, t: now(), live: false }; // not persisted: retry next launch
        return FX_FALLBACK;
      })();
      try { return await inflight; } finally { inflight = null; }
    },
  };
  return fx;
}

// "updated 3h ago" / "offline rates" — for the small badge next to converted totals.
export function fxBadge(fx) {
  if (!fx.isLive()) return 'approx. offline rates';
  const mins = Math.floor(fx.ageMs() / 60000);
  if (mins < 1) return 'rates updated just now';
  if (mins < 60) return `rates updated ${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `rates updated ${h}h ago` : `rates updated ${Math.floor(h / 24)}d ago`;
}
