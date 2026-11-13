import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ym, fromYm, realRate, futureValue, impliedRate, targetPot, coastNumber, coastStatus,
  monthlyNet, projectScenario, projectFan, solveMonthlyContribution,
} from '../src/engine/engine.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

const base = () => ({
  start: '2026-01',
  birth: '1990-01',
  retirementAge: 37, // endI = 2027-01 (13 monthly rows)
  openingPot: 0,
  assumptions: { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1000 },
  items: [],
  oneOffs: [],
});

test('date helpers round-trip', () => {
  assert.equal(fromYm(ym('2027-09-06')), '2027-09');
  assert.throws(() => ym('nonsense'));
});

test('realRate', () => near(realRate(0.07, 0.025), 0.0439024, 1e-6));

test('Instagram sanity check: $715k -> $4.3M over 26y implies ~7.1% nominal, not inflation-adjusted', () => {
  const r = impliedRate(715000, 4300000, 26);
  near(r, 0.0714, 0.001);
  near(futureValue(715000, r, 26), 4300000, 1);
});

test('targetPot', () => {
  near(targetPot({ annualSpend: 200000, withdrawalRate: 0.04 }), 5000000);
  near(targetPot({ annualSpend: 200000, otherAnnualIncome: 40000, withdrawalRate: 0.04 }), 4000000);
  assert.equal(targetPot({ annualSpend: 1000, otherAnnualIncome: 5000, withdrawalRate: 0.04 }), 0);
  assert.throws(() => targetPot({ annualSpend: 1, withdrawalRate: 0 }));
});

test('coastNumber round-trips to target', () => {
  const cn = coastNumber({ target: 1000000, realReturn: 0.04, yearsToRetirement: 30 });
  near(futureValue(cn, 0.04, 30), 1000000, 1e-4);
  assert.equal(coastNumber({ target: 5, realReturn: 0.04, yearsToRetirement: 0 }), 5);
});

test('coastStatus flags', () => {
  const a = coastStatus({ pot: 400000, target: 1000000, realReturn: 0.04, yearsToRetirement: 30 });
  assert.equal(a.isCoasting, true);
  assert.ok(a.surplus > 0 && a.shortfall === 0);
  const b = coastStatus({ pot: 10000, target: 1000000, realReturn: 0.04, yearsToRetirement: 30 });
  assert.equal(b.isCoasting, false);
  assert.ok(b.shortfall > 0 && b.surplus === 0);
});

test('zero-return projection sums flows exactly', () => {
  const s = base();
  s.openingPot = 1000;
  s.items = [
    { id: 'pay', kind: 'income', monthly: 500, from: '2026-01', to: '2026-12' },
    { id: 'rent', kind: 'expense', monthly: 200, from: '2026-01', to: '2026-12' },
  ];
  const p = projectScenario(s);
  assert.equal(p.rows.length, 13);
  near(p.retirementPot, 1000 + 12 * 300, 1e-9);
});

test('pay-scale steps apply from their start month', () => {
  const s = base();
  s.items = [{ id: 'pay', kind: 'income', from: '2026-01', to: '2026-12',
    steps: [{ from: '2026-01', monthly: 100 }, { from: '2026-07', monthly: 200 }] }];
  near(projectScenario(s).retirementPot, 6 * 100 + 6 * 200, 1e-9);
});

test('one-offs are signed and land in the right month', () => {
  const s = base();
  s.openingPot = 1000;
  s.oneOffs = [{ at: '2026-03', amount: -500 }, { at: '2026-04', amount: 200 }];
  assert.equal(monthlyNet(s, ym('2026-03')), -500);
  near(projectScenario(s).retirementPot, 700, 1e-9);
});

test('negative net flow draws the pot down', () => {
  const s = base();
  s.openingPot = 1000;
  s.items = [{ id: 'x', kind: 'expense', monthly: 50, from: '2026-01', to: '2026-04' }];
  near(projectScenario(s).retirementPot, 800, 1e-9);
});

test('investShare splits surplus into invested vs freed', () => {
  const s = base();
  s.items = [{ id: 'pay', kind: 'income', monthly: 1000, from: '2026-01', to: '2026-12' }];
  s.investShare = 0.5;
  const p = projectScenario(s);
  near(p.retirementPot, 6000, 1e-9);
  near(p.freedTotal, 6000, 1e-9);
});

test('already past coast number -> coastDate is the start month', () => {
  const s = base();
  s.assumptions = { nominalReturn: 0.07, inflation: 0.02, withdrawalRate: 0.04, retirementSpend: 1000 };
  s.openingPot = 1000000;
  assert.equal(projectScenario(s).coastDate, '2026-01');
});

test('never reaching coast -> coastDate is null', () => {
  const s = base();
  s.assumptions = { nominalReturn: 0.04, inflation: 0.02, withdrawalRate: 0.04, retirementSpend: 100000 };
  s.openingPot = 10;
  assert.equal(projectScenario(s).coastDate, null);
});

test('redirectAfterCoast frees contributions once coasting', () => {
  const s = base();
  s.assumptions = { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 400 }; // target 10,000
  s.openingPot = 20000; // already above target
  s.items = [{ id: 'pay', kind: 'income', monthly: 1000, from: '2026-01', to: '2026-12' }];
  s.redirectAfterCoast = true;
  const p = projectScenario(s);
  near(p.freedTotal, 12000, 1e-9);
  near(p.retirementPot, 20000, 1e-9);
});

test('projectFan is monotonic in return', () => {
  const s = base();
  s.retirementAge = 60; // 24 years
  s.assumptions = { nominalReturn: 0.07, inflation: 0.02, withdrawalRate: 0.04, retirementSpend: 30000 };
  s.openingPot = 50000;
  s.items = [{ id: 'save', kind: 'income', monthly: 500 }];
  const f = projectFan(s, [0.03, 0.06, 0.09]);
  assert.ok(f[0].retirementPot < f[1].retirementPot && f[1].retirementPot < f[2].retirementPot);
});

test('solveMonthlyContribution hits the target', () => {
  const s = base();
  s.retirementAge = 60;
  s.assumptions = { nominalReturn: 0.07, inflation: 0.02, withdrawalRate: 0.04, retirementSpend: 40000 };
  s.openingPot = 20000;
  const c = solveMonthlyContribution(s);
  assert.ok(c > 0);
  const p = projectScenario({ ...s, items: [{ id: 'c', kind: 'income', monthly: c }] });
  near(p.retirementPot, p.target, p.target * 0.001);
  assert.equal(solveMonthlyContribution({ ...s, openingPot: 5e7 }), 0);
});

test('depletedAt marks the first month the pot goes negative', () => {
  const s = base();
  s.openingPot = 100;
  s.items = [{ id: 'x', kind: 'expense', monthly: 50, from: '2026-01', to: '2026-12' }];
  assert.equal(projectScenario(s).depletedAt, '2026-03');
  s.items = [];
  assert.equal(projectScenario(s).depletedAt, null);
});
