import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, fingerprint, createSync, SYNC_KEYS } from '../src/data/sync.js';
import { createSupabase } from '../src/data/supabase.js';
import { createMockSupabase } from './fixtures/mock-supabase.js';
import { memoryStorage } from '../src/data/store.js';

const K = SYNC_KEYS;
async function device(mock, email, clock, { signUp = false } = {}) {
  const storage = memoryStorage();
  let online = true;
  const net = async (...a) => { if (!online) throw new TypeError('Failed to fetch'); return mock.fetch(...a); };
  const sb = createSupabase({ url: 'https://abc.supabase.co', anonKey: 'k', fetch: net, storage, now: clock.now });
  if (signUp) await sb.signUp(email, 'secret123'); else await sb.signIn(email, 'secret123');
  const sync = createSync({ sb, storage, now: clock.now });
  return { storage, sb, sync, setOnline: (v) => (online = v) };
}
const mkClock = () => { const c = { t: Date.UTC(2026, 10, 13, 10), now: () => c.t, tick: (ms = 60000) => (c.t += ms) }; return c; };

test('fingerprint: stable, content-sensitive, empty for nothing', () => {
  assert.equal(fingerprint(null), '');
  assert.equal(fingerprint('{"a":1}'), fingerprint('{"a":1}'));
  assert.notEqual(fingerprint('{"a":1}'), fingerprint('{"a":2}'));
});

test('reconcile: push / pull / same / conflicts / first-sync choice', () => {
  const meta = { lastSyncAt: 1, docs: { settings: { hash: fingerprint('{"a":1}'), remoteAt: 't1', localAt: 100 } } };
  // local changed only → push
  assert.deepEqual(reconcile({ local: { settings: '{"a":2}' }, remote: { settings: { data: { a: 1 }, updatedAt: 't1' } }, meta }).push, ['settings']);
  // remote changed only → pull
  assert.deepEqual(reconcile({ local: { settings: '{"a":1}' }, remote: { settings: { data: { a: 3 }, updatedAt: 't2' } }, meta }).pull, ['settings']);
  // both changed → later edit wins
  const both = reconcile({ local: { settings: '{"a":2}' }, remote: { settings: { data: { a: 3 }, updatedAt: new Date(50).toISOString() } }, meta });
  assert.deepEqual([both.push, both.conflicts], [['settings'], [{ doc: 'settings', kept: 'this device' }]]);
  const both2 = reconcile({ local: { settings: '{"a":2}' }, remote: { settings: { data: { a: 3 }, updatedAt: new Date(500).toISOString() } }, meta });
  assert.deepEqual([both2.pull, both2.conflicts[0].kept], [['settings'], 'other device']);
  // identical content → nothing to move
  assert.deepEqual(reconcile({ local: { settings: '{"a":5}' }, remote: { settings: { data: { a: 5 }, updatedAt: 't9' } }, meta }).same, ['settings']);
  // first sync, both have different data → must choose; with a choice → that side wins
  const first = { local: { budget: '{"v":1,"x":1}' }, remote: { budget: { data: { v: 1, x: 2 }, updatedAt: 't' } }, meta: null };
  assert.equal(reconcile(first).needsChoice, true);
  assert.deepEqual(reconcile({ ...first, prefer: 'remote' }).pull, ['budget']);
  assert.deepEqual(reconcile({ ...first, prefer: 'local' }).push, ['budget']);
  // fresh device (nothing local) never needs a choice: it just pulls
  assert.deepEqual(reconcile({ local: {}, remote: { budget: { data: { v: 1 }, updatedAt: 't' } }, meta: null }), { push: [], pull: ['budget'], conflicts: [], same: [], needsChoice: false });
});

test('two devices: A edits → B gets it; deletions travel too', async () => {
  const mock = createMockSupabase(); const clock = mkClock();
  const A = await device(mock, 'h@example.com', clock, { signUp: true });
  A.storage.setItem(K.settings, JSON.stringify({ events: [{ id: 'e1' }] }));
  A.storage.setItem(K.budget, JSON.stringify({ v: 1, currency: 'AUD', categories: [], entries: {} }));
  assert.deepEqual((await A.sync.syncNow()).pushed.sort(), ['budget', 'settings']);
  const B = await device(mock, 'h@example.com', clock);
  assert.deepEqual((await B.sync.syncNow()).pulled.sort(), ['budget', 'settings']);
  assert.equal(JSON.parse(B.storage.getItem(K.settings)).events[0].id, 'e1');
  // A removes the budget → B loses it too
  clock.tick(); A.storage.removeItem(K.budget);
  assert.deepEqual((await A.sync.syncNow()).pushed, ['budget']);
  assert.deepEqual((await B.sync.syncNow()).pulled, ['budget']);
  assert.equal(B.storage.getItem(K.budget), null);
  // nothing changed → nothing moves
  assert.deepEqual(await B.sync.syncNow(), { pushed: [], pulled: [], conflicts: [] });
});

test('offline edits are kept and uploaded on reconnect', async () => {
  const mock = createMockSupabase(); const clock = mkClock();
  const A = await device(mock, 'o@example.com', clock, { signUp: true });
  await A.sync.syncNow();
  A.setOnline(false);
  clock.tick(); A.storage.setItem(K.snapshots, JSON.stringify([{ at: '2026-11', total: 5 }]));
  const r = await A.sync.syncNow();
  assert.match(r.error, /Failed to fetch/);
  assert.equal(A.sync.status.error, 'Failed to fetch');
  A.setOnline(true);
  assert.deepEqual((await A.sync.syncNow()).pushed, ['snapshots']);
  assert.equal(A.sync.status.error, null);
  const B = await device(mock, 'o@example.com', clock);
  await B.sync.syncNow();
  assert.equal(JSON.parse(B.storage.getItem(K.snapshots))[0].total, 5);
});

test('both devices edit the same document → the later edit wins and it’s reported', async () => {
  const mock = createMockSupabase(); const clock = mkClock();
  const A = await device(mock, 'c@example.com', clock, { signUp: true });
  A.storage.setItem(K.settings, '{"v":"base"}'); await A.sync.syncNow();
  const B = await device(mock, 'c@example.com', clock); await B.sync.syncNow();
  clock.tick(); A.storage.setItem(K.settings, '{"v":"from A"}'); A.sync.noteLocal();   // A edits first…
  clock.tick(); B.storage.setItem(K.settings, '{"v":"from B"}'); B.sync.noteLocal();   // …B edits later
  await A.sync.syncNow();                                                              // A uploads its edit
  const rb = await B.sync.syncNow();                                                   // B: both changed, B's edit is later
  assert.deepEqual(rb.conflicts, [{ doc: 'settings', kept: 'this device' }]);
  const ra = await A.sync.syncNow();
  assert.deepEqual(ra.pulled, ['settings']);
  assert.equal(A.storage.getItem(K.settings), '{"v":"from B"}');
});

test('first sign-in on a phone that already has different data asks which copy to keep', async () => {
  const mock = createMockSupabase(); const clock = mkClock();
  const A = await device(mock, 'f@example.com', clock, { signUp: true });
  A.storage.setItem(K.onboarding, '{"v":1,"answers":{"q4":{"v":55}}}'); await A.sync.syncNow();
  const B = await device(mock, 'f@example.com', clock);
  B.storage.setItem(K.onboarding, '{"v":1,"answers":{"q4":{"v":60}}}');
  assert.deepEqual(await B.sync.syncNow(), { needsChoice: true });
  assert.equal(B.storage.getItem(K.onboarding), '{"v":1,"answers":{"q4":{"v":60}}}'); // untouched until chosen
  await B.sync.syncNow({ prefer: 'remote' });
  assert.equal(JSON.parse(B.storage.getItem(K.onboarding)).answers.q4.v, 55);
});

test('signed out → sync does nothing', async () => {
  const mock = createMockSupabase();
  const sb = createSupabase({ url: 'https://abc.supabase.co', anonKey: 'k', fetch: mock.fetch, storage: memoryStorage() });
  assert.deepEqual(await createSync({ sb, storage: memoryStorage() }).syncNow(), { skipped: 'signed out' });
});
