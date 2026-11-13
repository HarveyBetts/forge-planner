import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario, migrateScenario, parseScenario, CURRENT_VERSION } from '../src/engine/schema.js';
import { answersToScenario } from '../src/onboarding/answers.js';

const good = () => ({
  schemaVersion: 1, name: 'Base', start: '2026-11', birth: '1997-03', retirementAge: 55, openingPot: 1000,
  investShare: 1, redirectAfterCoast: false,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000, otherRetirementIncome: 0 },
  items: [{ id: 'pay', name: 'Salary', kind: 'income', steps: [{ from: '2027-09', monthly: 100 }], from: '2027-09', to: null }],
  oneOffs: [{ at: '2028-06', amount: -5000, name: 'Dirt-bike trip' }],
  events: [{ template: 'oneOffTrip', params: { at: '2029-01', cost: 100 } }],
});
const msgs = (s) => validateScenario(s).map((e) => e.message);

test('schema: the SPEC example shape is valid', () => {
  assert.deepEqual(validateScenario(good()), []);
});

test('schema: onboarding output validates', () => {
  const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
  const r = answersToScenario(A({ q1: '1997-03', q4: 55, q63: { amount: 40000, currency: 'GBP' }, q49: { isa: { amount: 5000, currency: 'GBP' } } }), { today: '2026-11' });
  assert.deepEqual(validateScenario(r.scenario), []);
});

test('schema: readable errors for bad top-level fields', () => {
  const m = msgs({ ...good(), start: '2026-13', birth: 'March', retirementAge: 200, investShare: 1.5, baseCurrency: 'JPY', redirectAfterCoast: 'yes' });
  assert.ok(m.includes('Start must be a month like 2026-11.'));
  assert.ok(m.includes('Date of birth must be a month like 1997-03.'));
  assert.ok(m.includes('Retirement age must be a number from 18 to 100.'));
  assert.ok(m.some((x) => /Share invested/.test(x)));
  assert.ok(m.some((x) => /Currency must be one of/.test(x)));
  assert.ok(m.some((x) => /true or false/.test(x)));
});

test('schema: retirement already in the past is caught', () => {
  assert.ok(msgs({ ...good(), birth: '1950-01', retirementAge: 60 }).includes('Retirement age is already in the past for this start date.'));
});

test('schema: assumptions — missing, out of range, sensible wording', () => {
  assert.ok(msgs({ ...good(), assumptions: undefined }).includes('Assumptions are missing.'));
  const m = msgs({ ...good(), assumptions: { nominalReturn: 7, inflation: 0.025, withdrawalRate: 0, retirementSpend: -1 } });
  assert.ok(m.some((x) => /Investment return \(e\.g\. 0\.07 for 7%\) must be between/.test(x)));
  assert.ok(m.some((x) => /Withdrawal rate must be above 0/.test(x)));
  assert.ok(m.some((x) => /Retirement spend/.test(x)));
});

test('schema: items — ids, kinds, amounts, dates, order', () => {
  const s = good();
  s.items = [
    { id: 'a', name: 'Rent', kind: 'expense', monthly: 900, from: '2027-01', to: '2026-01' },
    { id: 'a', kind: 'cost', monthly: 'lots' },
    { kind: 'income' },
    { id: 'b', kind: 'income', steps: [{ from: 'soon', monthly: 1 }] },
    'nope',
  ];
  const m = msgs(s);
  assert.ok(m.includes('Item 1 (“Rent”): ends (2026-01) before it starts (2027-01).'));
  assert.ok(m.includes('Item 2: id “a” is used twice.'));
  assert.ok(m.includes('Item 2: kind must be income or expense.'));
  assert.ok(m.includes('Item 2: monthly amount must be a number.'));
  assert.ok(m.includes('Item 3 needs an id.'));
  assert.ok(m.includes('Item 3 needs a monthly amount, a yearly amount or pay steps.'));
  assert.ok(m.includes('Item 4, step 1: needs a month (from) and a monthly amount.'));
  assert.ok(m.includes('Item 5 must be an object.'));
  // every error has a path
  validateScenario(s).forEach((e) => assert.ok(e.path.startsWith('items'), e.path));
});

test('schema: one-offs, pots and events are checked', () => {
  const m = msgs({ ...good(), oneOffs: [{ at: '2028', amount: '5k', name: 'Car' }],
    pots: [{ id: 'x', kind: 'shares', balance: 1 }], events: [{ template: 'child', params: {} }] });
  assert.ok(m.includes('One-off 1 (“Car”): month must be like 2028-03.'));
  assert.ok(m.includes('One-off 1 (“Car”): amount must be a number (negative for a cost).'));
  assert.ok(m.some((x) => /kind must be one of invested, cash, pension, super/.test(x)));
  assert.ok(m.some((x) => /^Event 1: Birth must be a month/.test(x)));
});

test('migration: v0 (no schemaVersion) upgrades to current; newer versions are refused', () => {
  const { schemaVersion, items, oneOffs, ...v0 } = good();
  const up = migrateScenario(v0);
  assert.equal(up.schemaVersion, CURRENT_VERSION);
  assert.deepEqual(up.items, []);
  assert.deepEqual(validateScenario(up), []);
  assert.throws(() => migrateScenario({ ...good(), schemaVersion: 99 }), /newer version of Forge \(v99\)/);
  assert.throws(() => migrateScenario({ ...good(), schemaVersion: -1 }), /Unknown scenario version/);
  assert.throws(() => migrateScenario([]), /JSON object/);
  // input not mutated
  const v0copy = JSON.parse(JSON.stringify(v0));
  migrateScenario(v0);
  assert.deepEqual(v0, v0copy);
});

test('parseScenario: JSON text in, scenario or errors out', () => {
  assert.equal(parseScenario(JSON.stringify(good())).errors.length, 0);
  assert.deepEqual(parseScenario('{bad').errors, [{ path: '', message: 'That isn’t valid JSON.' }]);
  const bad = parseScenario({ ...good(), start: 'x' });
  assert.equal(bad.scenario, null);
  assert.equal(bad.errors[0].path, 'start');
  assert.match(parseScenario({ ...good(), schemaVersion: 2 }).errors[0].message, /newer version/);
});
