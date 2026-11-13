// T2.2b: the remaining onboarding answers → scenario. One test per mapping, exact months and amounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answersToScenario } from '../src/onboarding/answers.js';
import { monthlyNet, projectScenario, ym } from '../src/engine/engine.js';
import { validateScenario } from '../src/engine/schema.js';

const today = '2026-11';
const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const core = { q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000) };
const run = (extra) => {
  const r = answersToScenario(A({ ...core, ...extra }), { today });
  assert.deepEqual(validateScenario(r.scenario), [], 'scenario must stay schema-valid');
  assert.doesNotThrow(() => projectScenario(r.scenario));
  return r;
};
const item = (r, id) => r.scenario.items.find((i) => i.id === id);
const net = (r, m) => monthlyNet(r.scenario, ym(m));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const pilot = { q11: 'Offer accepted', q12: '2027-09' };

test('q14: the part of training you pay yourself is a one-off at course start', () => {
  const r = run({ ...pilot, q14: { total: gbp(100000), youPay: gbp(12000) } });
  assert.deepEqual(r.scenario.oneOffs.find((o) => o.name === 'Training (your share)'), { at: '2027-09', amount: -12000, name: 'Training (your share)' });
  const onlyTotal = run({ ...pilot, q14: { total: gbp(100000) } });
  assert.ok(!onlyTotal.scenario.oneOffs.some((o) => /Training/.test(o.name)));
  assert.ok(onlyTotal.notPlaced.some((t) => /question 14/.test(t)));
});

test('q15: training loan → fixed repayments for exactly years×12 months, shrinking in today’s money', () => {
  const r = run({ ...pilot, q13: ['Loan'], q15: { amount: gbp(60000), rate: 6, start: '2029-03', years: 10 } });
  const loan = item(r, 'training-loan');
  const i = 0.06 / 12, n = 120;
  const pay = 60000 * i / (1 - Math.pow(1 + i, -n));
  near(loan.nominalMonthly, pay, 1e-9);
  assert.equal(net(r, '2029-02'), 0);
  near(-net(r, '2029-03'), pay / Math.pow(1.025, 28 / 12), 1e-9);     // 28 months after today
  near(-net(r, '2030-03'), pay / Math.pow(1.025, 40 / 12), 1e-9);     // one year on: deflated a year more
  near(-net(r, '2039-02'), pay / Math.pow(1.025, 136 / 12), 1e-9);    // 120th (last) payment, year 10 step
  assert.equal(net(r, '2039-03'), 0);
  assert.equal(loan.steps.length, 10);
  // 0% loan: amount / months
  const free = run({ ...pilot, q13: ['Loan'], q15: { amount: gbp(12000), rate: 0, start: today, years: 1 } });
  near(item(free, 'training-loan').nominalMonthly, 1000, 1e-9);
  // incomplete → not placed
  const part = run({ ...pilot, q13: ['Loan'], q15: { amount: gbp(60000) } });
  assert.equal(item(part, 'training-loan'), undefined);
  assert.ok(part.notPlaced.some((t) => /question 15/.test(t)));
});

test('q76: parental leave pauses investing for N months from each birth', () => {
  const r = run({ ...pilot, q50: { now: gbp(500), training: gbp(0), fo: gbp(2000) }, q74: { count: 2, ageFirst: 33, gap: 2 }, q76: 6 });
  // Child 1 born 2030-03 (age 33), child 2 2032-03. FO investing (£2,000) from 2029-03.
  assert.equal(net(r, '2030-02'), 2000);
  assert.equal(net(r, '2030-03'), 0);
  assert.equal(net(r, '2030-08'), 0);   // 6th month
  assert.equal(net(r, '2030-09'), 2000);
  assert.equal(net(r, '2032-03'), 0);
  assert.equal(net(r, '2032-09'), 2000);
  assert.ok(r.assumptions.some((t) => /no investing for 6 months/.test(t)));
});

test('q99 + q36: mortgage from the month after buying for years×12 months; rent stops', () => {
  const r = run({ q94: 'Buy', q97: gbp(400000), q98: { percent: 10, by: '2034-06' }, q99: { years: 25, monthly: gbp(1800) }, q36: gbp(1200) });
  assert.deepEqual(r.scenario.oneOffs.find((o) => o.name === 'House deposit'), { at: '2034-06', amount: -40000, name: 'House deposit' });
  assert.equal(net(r, '2034-06'), -40000);
  assert.equal(net(r, '2034-07'), -1800 + 1200);
  assert.equal(net(r, '2059-06'), -1800 + 1200);   // 300th payment
  assert.equal(net(r, '2059-07'), 1200);           // mortgage paid off; rent still not paid
  const m = item(r, 'mortgage');
  assert.deepEqual([m.from, m.to, m.monthly], ['2034-07', '2059-06', 1800]);
});

test('q99 without q36: mortgage only; missing mortgage → not placed', () => {
  const r = run({ q94: 'Buy', q97: gbp(400000), q98: { percent: 10, by: '2034-06' }, q99: { years: 25, monthly: gbp(1800) } });
  assert.equal(item(r, 'rent-saved'), undefined);
  assert.equal(net(r, '2034-07'), -1800);
  const none = run({ q94: 'Buy', q97: gbp(400000), q98: { percent: 10, by: '2034-06' } });
  assert.ok(none.notPlaced.includes('Mortgage payments (question 99).'));
});

test('q100: buying costs wanted but no figure → not placed (nothing invented)', () => {
  const r = run({ q94: 'Buy', q97: gbp(400000), q98: { percent: 10, by: '2034-06' }, q100: 'Yes' });
  assert.ok(r.notPlaced.some((t) => /question 100/.test(t)));
  assert.equal(r.scenario.oneOffs.filter((o) => o.at === '2034-06').length, 1);
});

test('q87: university wanted but no amount → not placed', () => {
  const kids = { q74: { count: 1, ageFirst: 33 } };
  assert.ok(run({ ...kids, q87: 'Fully' }).notPlaced.some((t) => /University \(fully paid/.test(t)));
  assert.ok(run({ ...kids, q87: 'Partly' }).notPlaced.some((t) => /University \(partly paid/.test(t)));
  assert.ok(!run({ ...kids, q87: 'Not at all' }).notPlaced.some((t) => /University/.test(t)));
});

test('q92: faster school-fee inflation has no rate → noted, fees stay inflation-only', () => {
  const school = { q74: { count: 1, ageFirst: 33 }, q79: 'Definite', q81: 'Prep (4)', q82: gbp(20000) };
  const r = run({ ...school, q92: 'Yes, assume faster' });
  assert.ok(r.notPlaced.some((t) => /question 92/.test(t)));
  assert.equal(item(r, 'school-1').annual, 20000);
  assert.ok(!run({ ...school, q92: 'No, same as inflation' }).notPlaced.some((t) => /question 92/.test(t)));
});

test('q111: car running costs from the first car (FO start), or from now with no purchase', () => {
  const r = run({ ...pilot, q107: gbp(20000), q110: 8, q111: gbp(250) });
  const c = item(r, 'car-running');
  assert.deepEqual([c.from, c.monthly], ['2029-03', 250]);
  assert.equal(net(r, '2029-02'), 0);
  assert.equal(net(r, '2029-03'), -20000 - 250);
  assert.equal(net(r, '2029-04'), -250);
  assert.equal(item(run({ q111: gbp(150) }), 'car-running').from, today);
});

test('q21: captain upgrade is a timeline mark, never a made-up pay rise', () => {
  const r = run({ ...pilot, q21: { model: 'Yes', age: 40 } });
  assert.deepEqual(r.scenario.marks.find((m) => m.label === 'Captain upgrade'), { at: '2037-03', label: 'Captain upgrade' });
  assert.ok(r.notPlaced.some((t) => /Captain pay/.test(t)));
  assert.ok(!r.scenario.items.some((i) => /captain/i.test(i.name || '')));
  assert.equal(run({ ...pilot, q21: { model: 'No', age: 40 } }).scenario.marks.some((m) => m.label === 'Captain upgrade'), false);
});

test('q3: coming back to the UK is a timeline mark; its costs are not placed', () => {
  const r = run({ q2: 'Come back to the UK', q3: { when: '2028-06', where: 'Taunton' } });
  assert.deepEqual(r.scenario.marks.find((m) => /UK/.test(m.label)), { at: '2028-06', label: 'Move back to the UK (Taunton)' });
  assert.ok(r.notPlaced.some((t) => /UK move/.test(t)));
});

test('settings overrides: inflation and cash growth flow into the scenario and the assumption wording', () => {
  const r = answersToScenario(A({ ...core, q49: { cashGBP: gbp(1000) }, q13: ['Loan'], ...pilot, q15: { amount: gbp(12000), rate: 0, start: '2027-11', years: 1 } }),
    { today, inflation: 0.03, cashRealReturn: -0.01 });
  assert.equal(r.scenario.assumptions.inflation, 0.03);
  assert.equal(r.scenario.assumptions.cashRealReturn, -0.01);
  assert.ok(r.assumptions.includes('Inflation: 3% a year. All figures are in today’s money.'));
  assert.ok(r.assumptions.some((t) => /Cash savings grow -1% a year after inflation/.test(t)));
  // loan repayments deflate at the overridden rate: first payment a year after today → ÷1.03
  near(item(r, 'training-loan').steps[0].monthly, 1000 / 1.03, 1e-9);
  const d = answersToScenario(A({ ...core, q49: { cashGBP: gbp(1000) } }), { today });
  assert.equal(d.scenario.assumptions.inflation, 0.025);
  assert.equal(d.scenario.assumptions.cashRealReturn, undefined);
});
