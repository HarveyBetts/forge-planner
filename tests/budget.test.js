import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, addWeeks, weeksBetween, weekLabel, emptyBudget, weekRow, setEntry, categoryTotals, cashForecast, forecastBy, upcomingBills, STARTER_CATEGORIES } from '../src/budget/ledger.js';
import { parseQty, parsePrice, holdings } from '../src/budget/investments.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('weeks: Monday start, labels, arithmetic', () => {
  assert.equal(mondayOf('2026-11-02'), '2026-11-02'); // a Monday
  assert.equal(mondayOf('2026-11-08'), '2026-11-02'); // Sunday → same week
  assert.equal(mondayOf('2026-11-09'), '2026-11-09');
  assert.equal(addWeeks('2026-12-28', 1), '2027-01-04');
  assert.equal(weeksBetween('2026-11-02', '2027-01-04'), 9);
  assert.equal(weekLabel('2026-11-02'), '2 Nov – 8 Nov');
  assert.equal(weekLabel('2026-12-28'), '28 Dec – 3 Jan');
});

// A made-up budget in the same shape as Harvey's sheet: 30 weeks, one income column + expense columns.
function sheetLike() {
  const cats = [{ id: 'income', name: 'Income', kind: 'income' }, { id: 'rent', name: 'Rent', kind: 'expense' },
    { id: 'food', name: 'Food', kind: 'expense' }, { id: 'refund', name: 'Refunds', kind: 'expense' }];
  let b = { ...emptyBudget('AUD'), categories: cats, openingCash: 1000, openingAt: '2026-11-02', payLagWeeks: 2 };
  for (let w = 0; w < 30; w++) {
    const k = addWeeks('2026-11-02', w);
    b = setEntry(b, k, 'income', 900 + w);
    b = setEntry(b, k, 'rent', -400);
    b = setEntry(b, k, 'food', -(100 + (w % 3) * 10));
    if (w === 5) b = setEntry(b, k, 'refund', 55);
  }
  return b;
}
// The sheet's own formulas, literally: E(1) = opening + Σ non-income(w1..2);  E(k) = E(k−1) + Σ income(w2k−3..2k−2) + Σ non-income(w2k−1..2k)
function sheetFormulas(b) {
  const keys = Object.keys(b.entries).sort();
  const inc = (w) => (w >= 0 && w < keys.length ? b.entries[keys[w]].income || 0 : 0);
  const non = (w) => (w >= 0 && w < keys.length ? Object.entries(b.entries[keys[w]]).filter(([id]) => id !== 'income').reduce((s, [, v]) => s + v, 0) : 0);
  const E = [];
  let prev = b.openingCash;
  for (let k = 1; k <= 16; k++) {
    const val = prev + inc(2 * k - 4) + inc(2 * k - 3) + non(2 * k - 2) + non(2 * k - 1);
    E.push(val); prev = val;
  }
  return E;
}

test('cash forecast reproduces the spreadsheet’s fortnightly “At End” formulas exactly (pay 2 weeks late)', () => {
  const b = sheetLike();
  const f = forecastBy(b, 2);
  const E = sheetFormulas(b);
  assert.equal(f.length, 16);
  f.forEach((row, i) => near(row.balance, E[i], 1e-6));
  assert.equal(f[0].end, '2026-11-15'); // Sunday ending the first fortnight
  near(f[1].change, E[1] - E[0], 1e-6);
});

test('cash forecast with no pay lag: income lands the same week', () => {
  const b = { ...sheetLike(), payLagWeeks: 0 };
  const wk = cashForecast(b);
  assert.equal(wk.length, 30);
  near(wk[0].balance, 1000 + 900 - 400 - 100);
});

test('week rows: income, spent, refunds and total = row sum', () => {
  const b = sheetLike();
  const r = weekRow(b, addWeeks('2026-11-02', 5));
  assert.deepEqual([r.income, r.spent, r.otherIn], [905, 400 + 120, 55]);
  near(r.total, 905 - 400 - 120 + 55);
  assert.deepEqual(weekRow(b, '2030-01-07'), { income: 0, spent: 0, otherIn: 0, total: 0 });
});

test('setEntry: edits are immutable; blank or zero clears the cell', () => {
  const b = sheetLike();
  const k = '2026-11-02';
  const b2 = setEntry(b, k, 'food', -12.345);
  assert.equal(b2.entries[k].food, -12.35);
  assert.equal(b.entries[k].food, -100);
  const b3 = setEntry(setEntry(setEntry(setEntry(emptyBudget(), k, 'x', 5), k, 'x', ''), k, 'y', 0), k, 'z', 'abc');
  assert.deepEqual(b3.entries, {});
});

test('category totals over a range', () => {
  const t = categoryTotals(sheetLike(), '2026-11-02', '2026-11-09');
  assert.deepEqual(t, { income: 1801, rent: -800, food: -210, refund: 0 });
});

test('bills: next due date, month-end clamp, yearly, sorted', () => {
  const up = upcomingBills([
    { id: 'p', name: 'Phone', day: 14 }, { id: 'l', name: 'Loan', day: 6 }, { id: 'r', name: 'Rent', day: 31 },
    { id: 'e', name: 'Electricity', day: 4, month: 5 }, { id: 'bad', name: 'Bad', day: 0 },
  ], '2027-02-10');
  assert.deepEqual(up.map((b) => [b.name, b.due, b.inDays]), [
    ['Phone', '2027-02-14', 4], ['Rent', '2027-02-28', 18], ['Loan', '2027-03-06', 24], ['Electricity', '2027-05-04', 83],
  ]);
  assert.equal(upcomingBills([{ id: 'p', name: 'Phone', day: 10 }], '2027-02-10')[0].inDays, 0);
  assert.equal(upcomingBills([{ id: 'x', name: 'X', day: 1 }], '2027-12-15')[0].due, '2028-01-01');
});

test('starter categories are generic and well-formed', () => {
  assert.ok(STARTER_CATEGORIES.some((c) => c.kind === 'income'));
  assert.equal(new Set(STARTER_CATEGORIES.map((c) => c.id)).size, STARTER_CATEGORIES.length);
});

test('investments: parse copy-pasted quantities and prices', () => {
  assert.equal(parseQty('28⁠.⁠5193234'), 28.5193234);
  assert.equal(parseQty(''), null);
  assert.deepEqual(parsePrice('$12⁠.⁠85'), { amount: 12.85, currency: 'USD' });
  assert.deepEqual(parsePrice('£1.20'), { amount: 1.2, currency: 'GBP' });
  assert.deepEqual(parsePrice('125p'), { amount: 125, currency: 'GBX' });
  assert.deepEqual(parsePrice(42.98, 'GBP'), { amount: 42.98, currency: 'GBP' });
  assert.equal(parsePrice('n/a'), null);
});

test('investments: lots roll up per ticker like the sheet (shares, cost, averages, value, gain)', () => {
  const lots = [
    { ticker: 'VUSA', shares: 10, price: 100, currency: 'GBP', costGBP: 1000 },
    { ticker: 'vusa', shares: 5, price: 110, currency: 'GBP', costGBP: 550 },
    { ticker: 'AAPL', shares: 2, price: 150, currency: 'USD', costGBP: 240 },
    { ticker: 'XYZ', shares: 100, price: 120, currency: 'GBX', costGBP: 120 },
    { ticker: 'NOPRICE', shares: 1, price: 5, currency: 'GBP', costGBP: 5 },
  ];
  const prices = { VUSA: { price: 120, currency: 'GBP' }, AAPL: { price: 200, currency: 'USD' }, XYZ: { price: 150, currency: 'GBX' } };
  const toGBP = (a, c) => (c === 'USD' ? a * 0.8 : NaN);
  const { list, totals } = holdings(lots, prices, toGBP);
  const v = list.find((h) => h.ticker === 'VUSA');
  assert.equal(v.shares, 15);
  assert.equal(v.cost, 1550);
  near(v.avgCost, 1550 / 15);
  near(v.avgBuyPrice, (1000 + 550) / 15);
  assert.equal(v.value, 1800);
  assert.equal(v.gain, 250);
  near(v.gainPct, 250 / 1550);
  near(list.find((h) => h.ticker === 'AAPL').value, 2 * 200 * 0.8);
  near(list.find((h) => h.ticker === 'XYZ').value, 150);      // 100 × 150p = £150
  assert.equal(list.find((h) => h.ticker === 'NOPRICE').value, null);
  assert.deepEqual(totals.unpriced, ['NOPRICE']);
  near(totals.value, 1800 + 320 + 150);
  near(totals.gain, (1800 + 320 + 150) - (1550 + 240 + 120)); // unpriced lot excluded from the gain
  assert.equal(totals.cost, 1550 + 240 + 120 + 5);
});

import { cashNow, netWorth, parseEntry, entryText, defaultWeek } from '../src/budget/view.js';

test('view: cash today follows the forecast; net worth converts every part to the base currency', () => {
  const b = sheetLike(); // opening A$1,000 from 2 Nov 2026, pay 2 weeks late
  assert.equal(cashNow(b, '2026-10-01'), 1000);
  assert.equal(cashNow(b, '2026-11-04'), 1000 - 400 - 100);   // week 1 started; pay not landed yet
  b.extras = [{ id: 'pb', name: 'Premium Bonds', currency: 'GBP', amount: 500 }];
  b.holdings = { lots: [{ ticker: 'VUSA', shares: 10, price: 100, currency: 'GBP', costGBP: 1000 }], prices: { VUSA: { price: 110, currency: 'GBP' } } };
  const convert = (a, f, t) => (f === 'AUD' && t === 'GBP' ? a * 0.5 : f === t ? a : NaN);
  const nw = netWorth(b, { convert, base: 'GBP', today: '2026-11-04' });
  assert.deepEqual(nw.parts.map((p) => [p.id, p.inBase]), [['cash', 250], ['pb', 500], ['investments', 1100]]);
  assert.equal(nw.total, 1850);
});

test('view: typed amounts → signed entries (spend positive, refunds with +) and back', () => {
  assert.equal(parseEntry('120', 'expense'), -120);
  assert.equal(parseEntry('A$1,200.50', 'expense'), -1200.5);
  assert.equal(parseEntry('+35', 'expense'), 35);
  assert.equal(parseEntry('900', 'income'), 900);
  assert.equal(parseEntry('-50', 'income'), -50);
  assert.equal(parseEntry('', 'expense'), null);
  assert.equal(parseEntry('0', 'income'), null);
  assert.equal(parseEntry('abc', 'expense'), undefined);
  for (const [v, k] of [[-120, 'expense'], [35, 'expense'], [900, 'income'], [-50, 'income']]) assert.equal(parseEntry(entryText(v, k), k), v);
  assert.equal(entryText(null, 'expense'), '');
});

test('view: default week is this week if covered, else the nearest week with data', () => {
  const b = sheetLike();
  assert.equal(defaultWeek(b, '2026-11-11'), '2026-11-09');
  assert.equal(defaultWeek(b, '2026-01-01'), '2026-11-02');
  assert.equal(defaultWeek(b, '2030-01-01'), Object.keys(b.entries).sort().pop());
});

import { realityCheck } from '../src/budget/reality.js';
test('reality check: only started weeks, monthly from weekly, verdicts', () => {
  const b = sheetLike(); // AUD, weekly totals ≈ 900+w −400 −(100..120)
  const convert = (a, f, t) => (f === 'AUD' && t === 'GBP' ? a * 0.5 : NaN);
  assert.equal(realityCheck(null, {}), null);
  assert.deepEqual(realityCheck(b, { today: '2026-11-03', convert, base: 'GBP', plannedMonthly: 500 }), { weeks: 1, verdict: 'too-few' });
  const r = realityCheck(b, { today: '2026-11-16', convert, base: 'GBP', plannedMonthly: 500 }); // weeks 1–3 started
  assert.equal(r.weeks, 3);
  const weekly = ((900 - 400 - 100) + (901 - 400 - 110) + (902 - 400 - 120)) / 3;
  assert.ok(Math.abs(r.monthlyLeft - weekly * 0.5 * 52 / 12) < 1e-9);
  assert.equal(r.verdict, 'more');                                         // ~£851/mo left vs £500 planned
  assert.equal(realityCheck(b, { today: '2026-11-16', convert, base: 'GBP', plannedMonthly: 850 }).verdict, 'close');
  assert.equal(realityCheck(b, { today: '2026-11-16', convert, base: 'GBP', plannedMonthly: 2000 }).verdict, 'less');
  const broke = setEntry(setEntry(setEntry(b, '2026-11-02', 'rent', -5000), '2026-11-09', 'rent', -5000), '2026-11-16', 'rent', -5000);
  assert.equal(realityCheck(broke, { today: '2026-11-16', convert, base: 'GBP', plannedMonthly: 500 }).verdict, 'negative');
  // lookback limits the window to the most recent weeks
  assert.equal(realityCheck(b, { today: '2027-06-01', convert, base: 'GBP', plannedMonthly: 0, lookback: 4 }).weeks, 4);
});

import { weekVsPlan, overPlan, setPlan, flagLevel } from '../src/budget/plan.js';
test('planned vs actual: spend over plan, income short of plan, plan editing', () => {
  let b = sheetLike(); // week 2026-11-02: income 900, rent −400, food −100
  b = setPlan(setPlan(setPlan(b, 'rent', '400'), 'food', 'A$80'), 'income', 1000);
  const w = Object.fromEntries(weekVsPlan(b, '2026-11-02').map((r) => [r.id, r]));
  assert.deepEqual([w.rent.actual, w.rent.plan, w.rent.over, w.rent.ratio], [400, 400, 0, 1]);
  assert.deepEqual([w.food.actual, w.food.plan, w.food.over], [100, 80, 20]);
  assert.deepEqual([w.income.actual, w.income.short], [900, 100]);
  assert.equal(w.refund.plan, 0);
  assert.deepEqual(overPlan(b, '2026-11-02').map((r) => r.id), ['food']);
  assert.equal(setPlan(b, 'food', '').plan.food, undefined);
  assert.equal(setPlan(b, 'food', '0').plan.food, undefined);
  assert.deepEqual(flagLevel('off'), { bar: false, text: false, banner: false });
  assert.deepEqual(flagLevel('loud'), { bar: true, text: true, banner: true });
});
