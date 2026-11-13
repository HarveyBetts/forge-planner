import test from 'node:test';
import assert from 'node:assert/strict';
import { bisectMin, bisectMax, requiredNominalReturn, requiredRetirementAge, affordableRetirementSpend, whatMustBeTrue } from '../src/engine/solve.js';
import { projectScenario, targetPot } from '../src/engine/engine.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
// Born 1990-01, start 2026-01, retire at 40 (2030-01): 49 monthly rows.
const base = (extra = {}) => ({
  start: '2026-01', birth: '1990-01', retirementAge: 40, openingPot: 0,
  assumptions: { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 4000 }, // target 100k
  items: [], oneOffs: [], ...extra,
});

test('bisect helpers find boundaries and report unreachable as null', () => {
  near(bisectMin((x) => x >= 3.3, 0, 10), 3.3, 1e-9);
  near(bisectMax((x) => x <= 7.25, 0, 10), 7.25, 1e-9);
  assert.equal(bisectMin(() => false, 0, 1), null);
  assert.equal(bisectMax(() => false, 0, 1), null);
  assert.equal(bisectMin(() => true, 0, 1), 0);
  assert.equal(bisectMax(() => true, 0, 1), 1);
});

test('affordable spend: matches the closed form pot × withdrawal rate', () => {
  // £1,000/mo for 49 months at 0% = £49,000 → affords £1,960/yr at 4%.
  const s = base({ items: [{ id: 'inv', kind: 'income', monthly: 1000 }] });
  near(affordableRetirementSpend(s), 49000 * 0.04, 0.01);
  // with other retirement income it rises one-for-one
  near(affordableRetirementSpend({ ...s, assumptions: { ...s.assumptions, otherRetirementIncome: 500 } }), 1960 + 500, 0.01);
  // nothing saved → nothing affordable
  assert.equal(affordableRetirementSpend(base()), null);
});

test('required return: the found rate is on track and 0.1% less is not', () => {
  const s = base({ retirementAge: 60, openingPot: 30000, assumptions: { nominalReturn: 0.02, inflation: 0.02, withdrawalRate: 0.04, retirementSpend: 4000 } });
  const r = requiredNominalReturn(s);
  assert.ok(r > 0.02 && r < 0.2, String(r));
  const at = (nr) => projectScenario({ ...s, assumptions: { ...s.assumptions, nominalReturn: nr } }).onTrack;
  assert.equal(at(r), true);
  assert.equal(at(r - 0.001), false);
  // analytic check: 2026-01 → 2050-01 is 289 monthly growth steps: 30k × (1+real)^(289/12) = 100k
  const real = Math.pow(100000 / 30000, 12 / 289) - 1;
  near(r, (1 + real) * 1.02 - 1, 0.0005);
});

test('required return: unreachable within 0–20% → null; already fine at 0% → 0', () => {
  assert.equal(requiredNominalReturn(base({ openingPot: 1 })), null);
  assert.equal(requiredNominalReturn(base({ openingPot: 200000 })), 0);
});

test('required retirement age: earliest month that works, exactly', () => {
  // £1,000/mo at 0%: need 100k → 100 months. Born 1990-01, start 2026-01 (age 36): after 100 rows → age 36 + 99/12.
  const s = base({ items: [{ id: 'inv', kind: 'income', monthly: 1000 }] });
  const age = requiredRetirementAge(s);
  near(age, 36 + 99 / 12, 1e-9);
  assert.equal(projectScenario({ ...s, retirementAge: age }).onTrack, true);
  assert.equal(projectScenario({ ...s, retirementAge: age - 1 / 12 }).onTrack, false);
});

test('required retirement age: unreachable by 80 → null', () => {
  assert.equal(requiredRetirementAge(base({ items: [{ id: 'inv', kind: 'income', monthly: 10 }] })), null);
});

test('whatMustBeTrue: on track → zeros; behind → each lever, nulls where unreachable', () => {
  const ok = whatMustBeTrue(base({ openingPot: 200000 }));
  assert.equal(ok.onTrack, true);
  assert.equal(ok.extraMonthly, 0);
  const s = base({ items: [{ id: 'inv', kind: 'income', monthly: 1000 }] });
  const w = whatMustBeTrue(s);
  assert.equal(w.onTrack, false);
  near(w.extraMonthly, (100000 - 49000) / 49, 0.01);
  assert.equal(w.nominalReturn !== undefined, true);
  near(w.retirementAge, 36 + 99 / 12, 1e-9);
  near(w.spendCut, 4000 - 1960, 0.01);
  // A plan with no savings: no spend is affordable → null, not NaN
  const none = whatMustBeTrue(base());
  assert.equal(none.retirementSpend, null);
  assert.equal(none.spendCut, null);
  assert.ok(Object.values(none).every((x) => x === null || typeof x === 'number' || typeof x === 'boolean'));
});

test('solvers see life events (projectScenario expands them)', () => {
  const s = base({ openingPot: 100000, events: [{ template: 'oneOffTrip', params: { at: '2027-01', cost: 10000 } }] });
  assert.equal(projectScenario(s).retirementPot, 90000);
  assert.equal(projectScenario(s).onTrack, false);
  near(whatMustBeTrue(s).extraMonthly, 10000 / 49, 0.01);
  assert.equal(targetPot({ annualSpend: 4000, withdrawalRate: 0.04 }), 100000);
});
