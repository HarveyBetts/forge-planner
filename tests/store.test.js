import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore, memoryStorage, parseBackup, KEYS } from '../src/data/store.js';

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 13, 0, 0, tick++)).toISOString();
let n = 0;
const ids = () => 'id' + (++n);
const mk = (storage = memoryStorage()) => createLocalStore({ storage, now: clock, id: ids });

test('store: empty storage gives empty results, not errors', async () => {
  const s = mk();
  assert.deepEqual(await s.listScenarios(), []);
  assert.equal(await s.getScenario('nope'), null);
  assert.deepEqual(await s.listSnapshots(), []);
  assert.deepEqual(await s.getSettings(), {});
  assert.equal(await s.deleteScenario('nope'), false);
  assert.equal(s.persistent, true);
});

test('store: scenario save/get/list/delete round-trip', async () => {
  const s = mk();
  const a = await s.saveScenario({ name: 'One child', retirementAge: 55 });
  assert.ok(a.id && a.updatedAt);
  const b = await s.saveScenario({ name: 'Two children' });
  const list = await s.listScenarios();
  assert.deepEqual(list.map((x) => x.name), ['Two children', 'One child']); // newest first
  assert.equal((await s.getScenario(a.id)).retirementAge, 55);
  // update keeps id
  const a2 = await s.saveScenario({ ...a, retirementAge: 57 });
  assert.equal(a2.id, a.id);
  assert.equal((await s.getScenario(a.id)).retirementAge, 57);
  assert.equal(await s.deleteScenario(b.id), true);
  assert.equal((await s.listScenarios()).length, 1);
});

test('store: returned objects are copies (mutating them does not change storage)', async () => {
  const s = mk();
  const a = await s.saveScenario({ name: 'X', items: [] });
  a.items.push('bad');
  const got = await s.getScenario(a.id);
  assert.deepEqual(got.items, []);
  got.name = 'Y';
  assert.equal((await s.getScenario(a.id)).name, 'X');
});

test('store: data survives a new store instance on the same storage', async () => {
  const mem = memoryStorage();
  const s1 = mk(mem);
  const a = await s1.saveScenario({ name: 'Base' });
  await s1.saveSettings({ base: 'GBP' });
  const s2 = mk(mem);
  assert.equal((await s2.getScenario(a.id)).name, 'Base');
  assert.deepEqual(await s2.getSettings(), { base: 'GBP' });
});

test('store: snapshots are one per month, sorted oldest first, validated', async () => {
  const s = mk();
  await s.saveSnapshot({ at: '2027-02', total: 2 });
  await s.saveSnapshot({ at: '2026-12', total: 1 });
  await s.saveSnapshot({ at: '2027-02', total: 3 }); // replaces Feb
  const list = await s.listSnapshots();
  assert.deepEqual(list.map((x) => [x.at, x.total]), [['2026-12', 1], ['2027-02', 3]]);
  await assert.rejects(() => s.saveSnapshot({ at: '2027-13' }), /YYYY-MM/);
});

test('store: settings merge', async () => {
  const s = mk();
  await s.saveSettings({ a: 1 });
  assert.deepEqual(await s.saveSettings({ b: 2 }), { a: 1, b: 2 });
});

test('store: quota error keeps working in memory and flips persistent=false', async () => {
  const quota = memoryStorage();
  quota.setItem = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
  const s = mk(quota);
  const a = await s.saveScenario({ name: 'Still here' });
  assert.equal(s.persistent, false);
  assert.equal((await s.getScenario(a.id)).name, 'Still here');
});

test('store: storage that throws on access (iOS private mode) still works', async () => {
  const hostile = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
  const s = mk(hostile);
  assert.deepEqual(await s.listScenarios(), []);
  await s.saveSettings({ x: 1 });
  assert.deepEqual(await s.getSettings(), { x: 1 });
  assert.equal(s.persistent, false);
  await s.clearAll(); // must not throw
});

test('store: no storage at all (null) runs memory-only', async () => {
  const s = createLocalStore({ storage: null });
  assert.equal(s.persistent, false);
  await s.saveSettings({ y: 2 });
  assert.deepEqual(await s.getSettings(), { y: 2 });
});

test('store: corrupt JSON in any key is treated as empty', async () => {
  const mem = memoryStorage({ [KEYS.scenarios]: '{not json', [KEYS.snapshots]: '"a string"', [KEYS.settings]: '[1,2]' });
  const s = mk(mem);
  assert.deepEqual(await s.listScenarios(), []);
  assert.deepEqual(await s.listSnapshots(), []);
  assert.deepEqual(await s.getSettings(), {});
  // and writing fixes it
  await s.saveSettings({ ok: true });
  assert.deepEqual(JSON.parse(mem.getItem(KEYS.settings)), { ok: true });
});

const VALID = { schemaVersion: 1, start: '2026-11', birth: '1997-03', retirementAge: 55,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000 }, items: [], oneOffs: [] };

test('store: export → clear → import restores everything (incl. onboarding answers)', async () => {
  const mem = memoryStorage({ [KEYS.onboarding]: JSON.stringify({ v: 1, answers: { q1: { v: '1997-03' } } }) });
  const s = mk(mem);
  const a = await s.saveScenario({ ...VALID, name: 'Base', retirementAge: 55 });
  await s.saveSnapshot({ at: '2026-11', total: 1000 });
  await s.saveSettings({ base: 'AUD' });
  const backup = await s.exportAll();
  await s.clearAll();
  assert.equal(mem.size, 0);
  assert.deepEqual(await s.listScenarios(), []);
  const counts = await s.importAll(backup);
  assert.deepEqual(counts, { scenarios: 1, snapshots: 1, settings: 1, onboarding: true, budget: false });
  assert.equal((await s.getScenario(a.id)).retirementAge, 55);
  assert.equal((await s.listSnapshots())[0].total, 1000);
  assert.deepEqual(await s.getSettings(), { base: 'AUD' });
  assert.equal(JSON.parse(mem.getItem(KEYS.onboarding)).answers.q1.v, '1997-03');
});

test('store: bad backups are rejected with readable errors and nothing is written', async () => {
  const s = mk();
  await s.saveSettings({ keep: 1 });
  await assert.rejects(() => s.importAll('nope'), /valid JSON/);
  await assert.rejects(() => s.importAll('{"app":"other"}'), /isn’t a Forge backup/);
  await assert.rejects(() => s.importAll(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 9 })), /newer version/);
  await assert.rejects(() => s.importAll(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 1, scenarios: [{ name: 'no id' }] })), /no id/);
  await assert.rejects(() => s.importAll(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 1, snapshots: [{ at: '26-1' }] })), /bad month/);
  await assert.rejects(() => s.importAll(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 1, scenarios: [{ ...VALID, id: 'x', name: 'Bad', start: '2026-13' }] })),
    /Scenario 1 \(“Bad”\): Start must be a month/);
  await assert.rejects(() => s.importAll(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 1, scenarios: [{ ...VALID, id: 'x', schemaVersion: 7 }] })), /newer version/);
  assert.deepEqual(await s.getSettings(), { keep: 1 });
});

test('parseBackup: tolerates missing optional sections', () => {
  const d = parseBackup(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 1 }));
  assert.deepEqual(d, { scenarios: [], snapshots: [], settings: {}, onboarding: null, budget: null });
});

test('store: budget save/get and it rides along in backups; damaged budget rejected', async () => {
  const s = mk();
  assert.equal(await s.getBudget(), null);
  await assert.rejects(() => s.saveBudget({ v: 2 }), /v1 budget/);
  const b = { v: 1, currency: 'AUD', categories: [{ id: 'income', name: 'Income', kind: 'income' }], entries: { '2026-11-02': { income: 1 } } };
  await s.saveBudget(b);
  assert.deepEqual(await s.getBudget(), b);
  const backup = await s.exportAll();
  await s.clearAll();
  assert.equal(await s.getBudget(), null);
  const counts = await s.importAll(backup);
  assert.equal(counts.budget, true);
  assert.deepEqual(await s.getBudget(), b);
  await assert.rejects(() => s.importAll(JSON.stringify({ app: 'forge', kind: 'full-backup', v: 1, budget: { v: 1 } })), /budget in that backup is damaged/);
});
