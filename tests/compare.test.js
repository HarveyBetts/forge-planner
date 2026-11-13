import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWhatIf, describeChanges, compareModel } from '../src/ui/compare.js';

const base = { q4: { v: 55 }, q63: { v: { amount: 40000, currency: 'GBP' } }, q74: { v: { count: 1, ageFirst: 33, gap: 2 } }, q50: { v: { now: { amount: 500, currency: 'GBP' }, fo: { amount: 2000, currency: 'GBP' } } } };

test('applyWhatIf changes only what’s asked, never the original', () => {
  const a = applyWhatIf(base, { kids: 2, retirementAge: 57, spend: 50000, investNow: 800 });
  assert.deepEqual(a.q74.v, { count: 2, ageFirst: 33, gap: 2 });
  assert.equal(a.q4.v, 57);
  assert.deepEqual(a.q63.v, { amount: 50000, currency: 'GBP' });
  assert.deepEqual(a.q50.v, { now: { amount: 800, currency: 'GBP' }, fo: { amount: 2000, currency: 'GBP' } });
  assert.equal(base.q74.v.count, 1);
  assert.deepEqual(applyWhatIf(base, {}), base);
  assert.deepEqual(applyWhatIf({}, { kids: 1, ageFirst: 34 }).q74.v, { count: 1, ageFirst: 34 });
});

test('describeChanges reads naturally', () => {
  assert.equal(describeChanges({ kids: 2, retirementAge: 57 }), '2 kids · stop work at 57');
  assert.equal(describeChanges({ kids: 0, spend: 50000, investNow: 750 }), 'no kids · £50k/yr in retirement · invest £750/mo now');
  assert.equal(describeChanges({}), 'same as your plan');
});

const S = (o) => ({ name: 'A', status: 'on-track', chip: 'On track', target: 1e6, potAtEnd: 1.1e6, coastDate: '2040-03', coasting: false, depletedAt: null, freeNow: 0, needToday: 200000, retirementAge: 55, ...o });

test('compare: one more child — later coast, lower pot, more needed today', () => {
  const m = compareModel(S({ name: 'One child' }), S({ name: 'Two children', status: 'behind', chip: 'Behind', potAtEnd: 0.9e6, coastDate: '2043-05', needToday: 260000 }));
  const r = Object.fromEntries(m.rows.map((x) => [x.key, x]));
  assert.deepEqual([m.a, m.b], ['One child', 'Two children']);
  assert.deepEqual([r.status.delta, r.status.better], ['On track → Behind', 'a']);
  assert.deepEqual([r.coast.a, r.coast.b, r.coast.delta, r.coast.better], ['Mar 2040', 'May 2043', '3 yrs 2 mths later', 'a']);
  assert.deepEqual([r.pot.delta, r.pot.better], ['−£200k', 'a']);
  assert.deepEqual([r.need.delta, r.need.better], ['+£60k', 'a']);
  assert.deepEqual([r.target.delta, r.target.better], ['same', null]);
});

test('compare: coasting, never coasting, running out, shortfall wording', () => {
  const r1 = Object.fromEntries(compareModel(S({ coasting: true }), S({ coastDate: null })).rows.map((x) => [x.key, x]));
  assert.deepEqual([r1.coast.a, r1.coast.b, r1.coast.delta, r1.coast.better], ['Now', 'Not before you stop', 'B never coasts', 'a']);
  const r2 = Object.fromEntries(compareModel(S({ potAtEnd: -50000, depletedAt: '2038-08', status: 'short', chip: 'Runs short' }), S()).rows.map((x) => [x.key, x]));
  assert.equal(r2.pot.a, 'short by £50k');
  assert.deepEqual([r2.short.a, r2.short.b, r2.short.delta, r2.short.better], ['Aug 2038', 'No', 'B never runs out', 'b']);
  const r3 = Object.fromEntries(compareModel(S(), S({ retirementAge: 57 })).rows.map((x) => [x.key, x]));
  assert.equal(r3.age.delta, '+2 yrs');
});
