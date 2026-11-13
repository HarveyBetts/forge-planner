// T4.1: one contract, two stores. Every behaviour the app relies on must hold for LocalStore and SupabaseStore alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore, memoryStorage } from '../src/data/store.js';
import { createSupabaseStore } from '../src/data/supabase-store.js';
import { createSupabase } from '../src/data/supabase.js';
import { createMockSupabase } from './fixtures/mock-supabase.js';

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 13, 0, 0, tick++)).toISOString();
const VALID = { schemaVersion: 1, start: '2026-11', birth: '1997-03', retirementAge: 55,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000 }, items: [], oneOffs: [] };

const STORES = {
  local: async () => createLocalStore({ storage: memoryStorage(), now: clock }),
  supabase: async () => {
    const mock = createMockSupabase();
    const sb = createSupabase({ url: 'https://abc.supabase.co', anonKey: 'k', fetch: mock.fetch, storage: memoryStorage() });
    await sb.signUp(`u${tick++}@example.com`, 'secret123');
    return createSupabaseStore(sb, { now: clock });
  },
};

for (const [name, make] of Object.entries(STORES)) {
  test(`contract (${name}): empty store`, async () => {
    const s = await make();
    assert.deepEqual(await s.listScenarios(), []);
    assert.equal(await s.getScenario('x'), null);
    assert.deepEqual(await s.listSnapshots(), []);
    assert.deepEqual(await s.getSettings(), {});
    assert.equal(await s.getBudget(), null);
  });

  test(`contract (${name}): scenarios save/get/list/delete, copies out`, async () => {
    const s = await make();
    const a = await s.saveScenario({ ...VALID, name: 'A' });
    const b = await s.saveScenario({ ...VALID, name: 'B' });
    assert.deepEqual((await s.listScenarios()).map((x) => x.name), ['B', 'A']);
    const got = await s.getScenario(a.id); got.name = 'changed';
    assert.equal((await s.getScenario(a.id)).name, 'A');
    assert.equal((await s.saveScenario({ ...a, retirementAge: 57 })).id, a.id);
    assert.equal(await s.deleteScenario(b.id), true);
    assert.equal(await s.deleteScenario(b.id), false);
  });

  test(`contract (${name}): snapshots one per month, sorted, validated`, async () => {
    const s = await make();
    await s.saveSnapshot({ at: '2027-02', total: 2 });
    await s.saveSnapshot({ at: '2026-12', total: 1 });
    await s.saveSnapshot({ at: '2027-02', total: 3 });
    assert.deepEqual((await s.listSnapshots()).map((x) => [x.at, x.total]), [['2026-12', 1], ['2027-02', 3]]);
    await assert.rejects(() => s.saveSnapshot({ at: 'bad' }), /YYYY-MM/);
  });

  test(`contract (${name}): settings merge; budget save/remove`, async () => {
    const s = await make();
    await s.saveSettings({ a: 1 });
    assert.deepEqual(await s.saveSettings({ b: 2 }), { a: 1, b: 2 });
    const bud = { v: 1, currency: 'AUD', categories: [{ id: 'income', name: 'Income', kind: 'income' }], entries: {} };
    await s.saveBudget(bud);
    assert.deepEqual(await s.getBudget(), bud);
    await assert.rejects(() => s.saveBudget({ v: 9 }), /v1 budget/);
    await s.removeBudget();
    assert.equal(await s.getBudget(), null);
  });

  test(`contract (${name}): export → clear → import restores everything; bad backups rejected`, async () => {
    const s = await make();
    const a = await s.saveScenario({ ...VALID, name: 'Base' });
    await s.saveSnapshot({ at: '2026-11', total: 10 });
    await s.saveSettings({ events: [{ id: 'e1', template: 'oneOffTrip', params: {} }] });
    await s.saveBudget({ v: 1, currency: 'AUD', categories: [], entries: {} });
    const backup = await s.exportAll();
    await s.clearAll();
    assert.deepEqual(await s.listScenarios(), []);
    const counts = await s.importAll(backup);
    assert.equal(counts.scenarios, 1);
    assert.equal((await s.getScenario(a.id)).name, 'Base');
    assert.equal((await s.listSnapshots())[0].total, 10);
    assert.equal((await s.getSettings()).events[0].id, 'e1');
    assert.ok(await s.getBudget());
    await assert.rejects(() => s.importAll('{"app":"other"}'), /isn’t a Forge backup/);
  });
}
