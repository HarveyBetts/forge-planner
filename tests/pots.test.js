import test from 'node:test';
import assert from 'node:assert/strict';
import { projectScenario, ym } from '../src/engine/engine.js';
import {
  ukPensionAccessAge, superPreservationAge, defaultAccessAge, accessMonth, potsToBase, potProblems,
} from '../src/engine/pots.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
// Zero-growth scenario: person born 1990-01, projected 2026-01 → retirement at 40 (2030-01).
const base = (extra = {}) => ({
  start: '2026-01', birth: '1990-01', retirementAge: 40,
  assumptions: { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1000 },
  items: [], oneOffs: [], ...extra,
});

test('access rules: UK NMPA 55 → 57 from April 2028 (gov.uk)', () => {
  assert.equal(ukPensionAccessAge('1972-01'), 55); // turns 55 Jan 2027, before the rise
  assert.equal(ukPensionAccessAge('1973-03'), 55); // turns 55 Mar 2028
  assert.equal(ukPensionAccessAge('1973-04'), 57); // turns 55 Apr 2028
  assert.equal(ukPensionAccessAge('1997-03'), 57);
});

test('access rules: AU preservation age table (ATO)', () => {
  assert.equal(superPreservationAge('1960-06'), 55);
  assert.equal(superPreservationAge('1960-07'), 56);
  assert.equal(superPreservationAge('1961-06'), 56);
  assert.equal(superPreservationAge('1962-12'), 58);
  assert.equal(superPreservationAge('1964-06'), 59);
  assert.equal(superPreservationAge('1964-07'), 60);
  assert.equal(superPreservationAge('1997-03'), 60);
});

test('access rules: ISA/cash have no lock', () => {
  assert.equal(defaultAccessAge('invested', '1997-03'), null);
  assert.equal(defaultAccessAge('cash', '1997-03'), null);
  assert.equal(defaultAccessAge('super', '1997-03'), 60);
  assert.equal(accessMonth({ accessAge: null }, '1990-01'), -Infinity);
  assert.equal(accessMonth({ accessAge: 60 }, '1990-01'), ym('2050-01'));
});

test('pots: single invested pot matches the original openingPot model exactly', () => {
  const s = base({ openingPot: 5000, items: [{ id: 'x', kind: 'income', monthly: 100 }],
    assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 20000 } });
  const a = projectScenario(s);
  const b = projectScenario({ ...s, pots: [{ id: 'isa', kind: 'invested', balance: 5000 }] });
  assert.equal(a.retirementPot, b.retirementPot);
  assert.equal(a.coastDate, b.coastDate);
});

test('pots: a LOCKED pot cannot fund drawdown before its access age', () => {
  // £1,000 in an ISA, £100,000 in super locked until 60. Spending £500/mo from 2026-01.
  const s = base({
    pots: [
      { id: 'isa', name: 'ISA', kind: 'invested', balance: 1000 },
      { id: 'super', name: 'Super', kind: 'super', balance: 100000, accessAge: 60 },
    ],
    items: [{ id: 'spend', kind: 'expense', monthly: 500 }],
  });
  const p = projectScenario(s);
  assert.equal(p.depletedAt, '2026-03');           // ISA: 1000 → 500 → 0 → −500
  assert.equal(p.rows[2].byPot.super, 100000);     // super untouched
  assert.equal(p.rows[2].accessible, -500);
  assert.equal(p.rows[2].locked, 100000);
  assert.ok(p.rows[2].pot > 0, 'total looks fine, which is exactly why accessible is tracked separately');
  assert.deepEqual(p.lockedAtRetirement.map((x) => [x.id, x.opens, x.yearsAfterRetirement]), [['super', '2050-01', 20]]);
});

test('pots: once unlocked, a pension does fund drawdown', () => {
  const s = base({
    start: '2049-11', retirementAge: 61,
    pots: [{ id: 'pen', kind: 'pension', balance: 1000, accessAge: 60 }],
    items: [{ id: 'spend', kind: 'expense', monthly: 100 }],
  });
  const p = projectScenario(s);
  const byYm = Object.fromEntries(p.rows.map((r) => [r.ym, r]));
  // Nov/Dec 2049 locked: no accessible pot → shortfall goes to the (new, empty) flow pot
  assert.equal(byYm['2049-12'].accessible, -200);
  assert.equal(byYm['2049-12'].byPot.pen, 1000);
  assert.equal(p.depletedAt, '2049-11');
  // From Jan 2050 the pension is drawn
  assert.equal(byYm['2050-01'].byPot.pen, 900);
});

test('pots: drawdown order is cash, then invested, then unlocked pensions', () => {
  const s = base({
    pots: [
      { id: 'isa', kind: 'invested', balance: 300 },
      { id: 'cash', kind: 'cash', balance: 200 },
    ],
    items: [{ id: 'spend', kind: 'expense', monthly: 250 }],
  });
  const r0 = projectScenario(s).rows[0];
  assert.equal(r0.byPot.cash, 0);
  assert.equal(r0.byPot.isa, 250);
});

test('pots: positive flow goes to flowPot (default first accessible invested pot)', () => {
  const pots = [
    { id: 'cash', kind: 'cash', balance: 0 },
    { id: 'super', kind: 'super', balance: 0, accessAge: 60 },
    { id: 'isa', kind: 'invested', balance: 0 },
  ];
  const s = base({ pots, items: [{ id: 'pay', kind: 'income', monthly: 100 }] });
  assert.equal(projectScenario(s).rows[0].byPot.isa, 100);
  assert.equal(projectScenario({ ...s, flowPot: 'cash' }).rows[0].byPot.cash, 100);
});

test('pots: per-pot contributions (e.g. employer super) land in their pot only', () => {
  const s = base({
    pots: [{ id: 'isa', kind: 'invested', balance: 0 },
      { id: 'super', kind: 'super', balance: 0, accessAge: 60, contrib: { monthly: 50, from: '2026-01', to: '2026-12' } }],
  });
  const p = projectScenario(s);
  assert.equal(p.rows[11].byPot.super, 600);
  assert.equal(p.rows[12].byPot.super, 600); // stops after `to`
  assert.equal(p.rows[11].byPot.isa, 0);
});

test('pots: cash grows at cashRealReturn (default 0 real), invested at the scenario rate', () => {
  const s = base({
    assumptions: { nominalReturn: 0.1, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1000 },
    pots: [{ id: 'cash', kind: 'cash', balance: 1000 }, { id: 'isa', kind: 'invested', balance: 1000 }],
  });
  const r = projectScenario(s).rows[11]; // 12 months
  near(r.byPot.cash, 1000);
  near(r.byPot.isa, 1100, 1e-6);
  const c = projectScenario({ ...s, assumptions: { ...s.assumptions, cashRealReturn: 0.02 } }).rows[11];
  near(c.byPot.cash, 1020, 1e-6);
});

test('pots: coasting uses each pot’s own growth (cash doesn’t compound like shares)', () => {
  // Target 25k (1000/0.04). 10% real for shares, 0% cash, 4 years.
  const a = { nominalReturn: 0.1, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1000 };
  const shares = projectScenario(base({ assumptions: a, pots: [{ id: 'isa', kind: 'invested', balance: 18000 }] }));
  const cash = projectScenario(base({ assumptions: a, pots: [{ id: 'c', kind: 'cash', balance: 18000 }] }));
  assert.ok(shares.coastDate, '18k in shares at 10% for 4y passes 25k');
  assert.equal(cash.coastDate, null, '18k in cash at 0% never does');
});

test('potsToBase converts balances and contributions, leaves base-currency pots alone', () => {
  const conv = (a, from, to) => (from === 'AUD' && to === 'GBP' ? a / 2 : NaN);
  const out = potsToBase([
    { id: 'isa', kind: 'invested', currency: 'GBP', balance: 100 },
    { id: 'super', kind: 'super', currency: 'AUD', balance: 1000, contrib: { monthly: 200, steps: [{ from: '2027-01', monthly: 400 }] } },
  ], 'GBP', conv);
  assert.equal(out[0].balance, 100);
  assert.equal(out[1].balance, 500);
  assert.equal(out[1].currency, 'GBP');
  assert.equal(out[1].originalCurrency, 'AUD');
  assert.equal(out[1].contrib.monthly, 100);
  assert.equal(out[1].contrib.steps[0].monthly, 200);
});

test('potProblems reports readable errors', () => {
  assert.deepEqual(potProblems([{ id: 'a', kind: 'invested', balance: 1 }]), []);
  const p = potProblems([{ id: 'a', kind: 'shares', balance: 'x', accessAge: 200 }, { id: 'a', kind: 'cash', balance: 0 }, { kind: 'cash', balance: 0 }]);
  assert.ok(p.some((m) => /kind must be/.test(m)));
  assert.ok(p.some((m) => /balance must be a number/.test(m)));
  assert.ok(p.some((m) => /access age/.test(m)));
  assert.ok(p.some((m) => /duplicate id/.test(m)));
  assert.ok(p.some((m) => /needs an id/.test(m)));
});

import { scenarioCoastStatus, coastStatus } from '../src/engine/engine.js';
import { answersToScenario } from '../src/onboarding/answers.js';

test('scenarioCoastStatus: single pot equals coastStatus; cash counts for less', () => {
  const a = { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000 };
  const s = { start: '2026-11', birth: '1997-03', retirementAge: 55, assumptions: a, openingPot: 100000 };
  const one = scenarioCoastStatus(s);
  const years = (ym('2052-03') - ym('2026-11')) / 12;
  const ref = coastStatus({ pot: 100000, target: 1e6, realReturn: one.realReturn ?? ((1.07 / 1.025) - 1), yearsToRetirement: years });
  near(one.coastNumber, ref.coastNumber, 1e-6);
  near(one.pot, 100000);
  const cash = scenarioCoastStatus({ ...s, pots: [{ id: 'c', kind: 'cash', balance: 100000 }] });
  assert.ok(cash.pot < 100000 / 2, 'cash at 0% real over ~25y is worth far less in coast terms');
});

test('onboarding → pots: super locked past a 55 retirement shows up as a bridge', () => {
  const gbp = (amount) => ({ amount, currency: 'GBP' });
  const ans = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, { v: val }]));
  const r = answersToScenario(ans({
    q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000),
    q49: { isa: gbp(10000), super: { amount: 20000, currency: 'AUD' }, cashGBP: gbp(2000) },
  }), { today: '2026-11', convert: (x, f, t) => (f === t ? x : f === 'AUD' ? x / 2 : x * 2) });
  const p = projectScenario(r.scenario);
  assert.equal(p.lockedAtRetirement.length, 1);
  assert.equal(p.lockedAtRetirement[0].id, 'super');
  assert.equal(p.lockedAtRetirement[0].opens, '2057-03');
  assert.equal(p.lockedAtRetirement[0].yearsAfterRetirement, 5);
  assert.ok(r.assumptions.some((t) => /0% real/.test(t)));
});
