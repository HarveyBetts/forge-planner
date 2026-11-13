import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFx, convert, pickRates, fxBadge, FX_FALLBACK, FX_TTL_MS, FX_KEY } from '../src/fx/fx.js';
import { memoryStorage } from '../src/data/store.js';

const LIVE = { result: 'success', rates: { USD: 1, GBP: 0.8, AUD: 1.5, EUR: 0.9, JPY: 150 } };
const okFetch = (payload = LIVE, counter = { n: 0 }) => async () => { counter.n++; return { ok: true, json: async () => payload }; };
const failFetch = async () => { throw new TypeError('Failed to fetch'); };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !≈ ${b}`);

test('fx: round-trip conversion returns the original amount', () => {
  for (const [a, b] of [['GBP', 'AUD'], ['AUD', 'GBP'], ['EUR', 'AUD'], ['USD', 'GBP']]) {
    for (const x of [0.01, 1, 1000, 123456.78]) close(convert(convert(x, a, b), b, a), x);
  }
  assert.equal(convert(500, 'GBP', 'GBP'), 500);
});

test('fx: converts via USD exactly like legacy fxConvert', () => {
  // £1000 at GBP 0.8 / AUD 1.5 per USD = A$1875
  close(convert(1000, 'GBP', 'AUD', LIVE.rates), 1875);
  close(convert(1000, 'GBP', 'AUD'), 1000 / FX_FALLBACK.GBP * FX_FALLBACK.AUD);
});

test('fx: unknown currency throws (legacy silently used 1:1)', () => {
  assert.throws(() => convert(1, 'GBP', 'XYZ'), /No rate/);
});

test('fx: pickRates validates and trims payloads', () => {
  assert.deepEqual(pickRates(LIVE), { GBP: 0.8, AUD: 1.5, USD: 1, EUR: 0.9 });
  assert.equal(pickRates({ rates: { GBP: 0.8 } }), null);          // AUD missing
  assert.equal(pickRates({ rates: { GBP: -1, AUD: 1.5 } }), null); // nonsense
  assert.equal(pickRates({ rates: { GBP: '0.8', AUD: 1.5 } }), null);
  assert.equal(pickRates(null), null);
});

test('fx: before any fetch, the offline fallback table is used', () => {
  const fx = createFx({ fetch: failFetch, storage: memoryStorage(), now: () => 0 });
  assert.deepEqual(fx.rates(), FX_FALLBACK);
  assert.equal(fx.isLive(), false);
  assert.equal(fx.ageMs(), Infinity);
  assert.equal(fxBadge(fx), 'approx. offline rates');
});

test('fx: offline on first launch → fallback, not persisted, no throw', async () => {
  const mem = memoryStorage();
  const fx = createFx({ fetch: failFetch, storage: mem, now: () => 1000 });
  assert.deepEqual(await fx.ensure(), FX_FALLBACK);
  assert.equal(fx.source(), 'fallback');
  assert.equal(mem.getItem(FX_KEY), null);
});

test('fx: live fetch is used, cached for 6 h, then refreshed', async () => {
  let t = 1_000_000;
  const counter = { n: 0 };
  const mem = memoryStorage();
  const fx = createFx({ fetch: okFetch(LIVE, counter), storage: mem, now: () => t });
  await fx.ensure();
  assert.equal(counter.n, 1);
  assert.equal(fx.isLive(), true);
  close(fx.convert(1000, 'GBP', 'AUD'), 1875);
  t += FX_TTL_MS - 1;
  await fx.ensure();
  assert.equal(counter.n, 1, 'still fresh — no refetch');
  t += 2;
  await fx.ensure();
  assert.equal(counter.n, 2, 'stale — refetched');
  await fx.ensure(true);
  assert.equal(counter.n, 3, 'force always refetches');
});

test('fx: cache survives a reload (new instance, same storage)', async () => {
  const mem = memoryStorage();
  const counter = { n: 0 };
  await createFx({ fetch: okFetch(LIVE, counter), storage: mem, now: () => 5 }).ensure();
  const fx2 = createFx({ fetch: okFetch(LIVE, counter), storage: mem, now: () => 10 });
  assert.equal(fx2.isLive(), true);
  await fx2.ensure();
  assert.equal(counter.n, 1);
});

test('fx: stale cache + offline → keeps the stale real rates', async () => {
  const mem = memoryStorage({ [FX_KEY]: JSON.stringify({ rates: LIVE.rates, t: 0, live: true }) });
  const fx = createFx({ fetch: failFetch, storage: mem, now: () => FX_TTL_MS * 10 });
  const r = await fx.ensure();
  assert.equal(r.GBP, 0.8);
  assert.equal(fxBadge(fx), 'rates updated 2d ago');
});

test('fx: bad payloads, HTTP errors and corrupt cache fall back safely', async () => {
  const bad = createFx({ fetch: okFetch({ rates: { GBP: 'x' } }), storage: memoryStorage(), now: () => 0 });
  assert.deepEqual(await bad.ensure(), FX_FALLBACK);
  const http = createFx({ fetch: async () => ({ ok: false, json: async () => LIVE }), storage: memoryStorage(), now: () => 0 });
  assert.deepEqual(await http.ensure(), FX_FALLBACK);
  const corrupt = createFx({ fetch: failFetch, storage: memoryStorage({ [FX_KEY]: '{oops' }), now: () => 0 });
  assert.deepEqual(corrupt.rates(), FX_FALLBACK);
  const hostile = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  const h = createFx({ fetch: okFetch(), storage: hostile, now: () => 0 });
  assert.equal((await h.ensure()).GBP, 0.8);
  assert.equal(h.isLive(), true); // kept in memory
});

test('fx: concurrent ensure() calls share one request', async () => {
  const counter = { n: 0 };
  const fx = createFx({ fetch: okFetch(LIVE, counter), storage: memoryStorage(), now: () => 0 });
  await Promise.all([fx.ensure(), fx.ensure(), fx.ensure()]);
  assert.equal(counter.n, 1);
});
