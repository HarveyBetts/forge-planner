import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, expandEvents, eventProblems, TEMPLATES } from '../src/engine/events.js';
import { monthlyNet, projectScenario, ym, fromYm } from '../src/engine/engine.js';

const base = (extra = {}) => ({
  start: '2026-11', birth: '1997-03', retirementAge: 55,
  assumptions: { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1000 },
  items: [], oneOffs: [], ...extra,
});
// Net flow of a scenario for a given month — the "exact cash-flow months" probe.
const at = (s, m) => monthlyNet(s, ym(m));
const months = (s, from, to) => { const out = {}; for (let i = ym(from); i <= ym(to); i++) out[fromYm(i)] = at(s, fromYm(i)); return out; };

test('speedbirdPathway: salary stages land in the exact months', () => {
  const s = applyEvent(base(), { template: 'speedbirdPathway', params: {
    courseStart: '2027-09', trainingMonths: 18, reducedScaleYears: 5,
    salarySteps: [{ stage: 'training', monthly: 100 }, { stage: 'reduced', monthly: 2000 }, { stage: 'main', monthly: 4000 }, { stage: 'main', yearsIn: 3, monthly: 5000 }],
  } });
  assert.equal(at(s, '2027-08'), 0);       // before the course
  assert.equal(at(s, '2027-09'), 100);     // training starts
  assert.equal(at(s, '2029-02'), 100);     // last training month (18th)
  assert.equal(at(s, '2029-03'), 2000);    // First Officer, reduced scale
  assert.equal(at(s, '2034-02'), 2000);    // last reduced month (5 years)
  assert.equal(at(s, '2034-03'), 4000);    // main scale
  assert.equal(at(s, '2037-02'), 4000);
  assert.equal(at(s, '2037-03'), 5000);    // +3 years on main scale
});

test('speedbirdPathway: training costs (one-off + monthly) and replacing the current job', () => {
  const s0 = base({ items: [{ id: 'karting', name: 'Karting job', kind: 'income', monthly: 3000, from: '2026-11' }] });
  const s = applyEvent(s0, { template: 'speedbirdPathway', params: {
    courseStart: '2027-09', trainingMonths: 18,
    trainingCosts: [{ name: 'Kit', amount: 1500 }, { name: 'Medical', amount: 300, monthsIn: 2 }, { name: 'Living away', monthly: 400 }],
    replaces: ['karting'],
  } });
  assert.equal(at(s, '2027-08'), 3000);              // still at the karting job
  assert.equal(at(s, '2027-09'), -1500 - 400);        // job ends, kit bought, living costs start
  assert.equal(at(s, '2027-10'), -400);
  assert.equal(at(s, '2027-11'), -300 - 400);         // medical 2 months in
  assert.equal(at(s, '2029-02'), -400);               // last training month
  assert.equal(at(s, '2029-03'), 0);                  // no salary given → nothing invented
});

test('speedbirdPathway: never invents a salary', () => {
  const s = applyEvent(base(), { template: 'speedbirdPathway', params: {} });
  assert.equal(s.items.length, 0);
  assert.deepEqual(eventProblems({ template: 'speedbirdPathway', params: { salarySteps: [{ stage: 'main' }] } }),
    ['Salary step 1: enter a monthly take-home amount.']);
});

test('child: cost bands and school fees run birthday to the month before the end birthday', () => {
  const s = applyEvent(base(), { template: 'child', params: {
    birth: '2031-06', costBands: [{ fromAge: 0, toAge: 4, annual: 12000 }, { fromAge: 4, toAge: 18, annual: 6000 }],
    school: { fromAge: 4, toAge: 18, annualFee: 24000 },
  } });
  assert.equal(at(s, '2031-05'), 0);
  assert.equal(at(s, '2031-06'), -1000);              // born
  assert.equal(at(s, '2035-05'), -1000);              // last month aged 3
  assert.equal(at(s, '2035-06'), -500 - 2000);        // 4th birthday: band 2 + school
  assert.equal(at(s, '2049-05'), -500 - 2000);        // last month aged 17
  assert.equal(at(s, '2049-06'), 0);                  // 18th birthday: done
});

test('houseDeposit: deposit + costs at completion, mortgage from the next month for exactly N years', () => {
  const s = applyEvent(base(), { template: 'houseDeposit', params: { at: '2034-06', deposit: 45000, buyingCosts: 5000, mortgage: { monthly: 1800, years: 25 } } });
  assert.equal(at(s, '2034-06'), -50000);
  assert.equal(at(s, '2034-07'), -1800);
  assert.equal(at(s, '2059-06'), -1800);              // 300th payment
  assert.equal(at(s, '2059-07'), 0);
  const n = Object.values(months(s, '2034-07', '2059-12')).filter((x) => x === -1800).length;
  assert.equal(n, 300);
});

test('holiday: perYear × costEach, smoothed monthly, between from and to', () => {
  const s = applyEvent(base(), { template: 'holiday', params: { perYear: 2, costEach: 3000, from: '2030-01', to: '2030-12' } });
  assert.equal(at(s, '2029-12'), 0);
  assert.equal(at(s, '2030-01'), -500);
  assert.equal(at(s, '2030-12'), -500);
  assert.equal(at(s, '2031-01'), 0);
  const year = Object.values(months(s, '2030-01', '2030-12')).reduce((a, b) => a + b, 0);
  assert.equal(year, -6000);
});

test('car: purchases every N years until retirement, plus running costs', () => {
  const s = applyEvent(base(), { template: 'car', params: { at: '2029-03', cost: 20000, runningMonthly: 250, replaceEvery: 8 } });
  const buys = s.oneOffs.map((o) => o.at);
  assert.deepEqual(buys, ['2029-03', '2037-03', '2045-03']); // 2053-03 is after retirement (2052-03)
  assert.equal(at(s, '2029-02'), 0);
  assert.equal(at(s, '2029-03'), -20250);
  assert.equal(at(s, '2029-04'), -250);
  const once = applyEvent(base(), { template: 'car', params: { at: '2029-03', cost: 20000 } });
  assert.equal(once.oneOffs.length, 1);
});

test('oneOffTrip: one negative one-off in the right month', () => {
  const s = applyEvent(base(), { template: 'oneOffTrip', params: { at: '2028-03', cost: 4000, name: 'Dirt-bike trip' } });
  assert.equal(at(s, '2028-02'), 0);
  assert.equal(at(s, '2028-03'), -4000);
  assert.equal(at(s, '2028-04'), 0);
  assert.equal(s.oneOffs[0].name, 'Dirt-bike trip');
});

test('relocation: living costs scale from the move month; moving cost lands that month', () => {
  const s0 = base({ items: [
    { id: 'living', name: 'Living', kind: 'expense', monthly: 2000, from: '2026-11' },
    { id: 'gym', name: 'Gym', kind: 'expense', monthly: 100, from: '2026-11', to: '2027-12' },
    { id: 'later', name: 'Later thing', kind: 'expense', monthly: 50, from: '2030-01' },
  ] });
  const s = applyEvent(s0, { template: 'relocation', params: { at: '2028-01', currency: 'GBP', costOfLivingChangePct: 10, oneOffCost: 3000 } });
  assert.equal(at(s, '2027-12'), -2100);              // before: living + gym
  assert.equal(at(s, '2028-01'), -2200 - 3000);       // living +10%, gym already ended, moving cost
  assert.equal(at(s, '2028-02'), -2200);
  assert.equal(at(s, '2029-12'), -2200);
  assert.equal(at(s, '2030-01'), -2200 - 55);         // a cost starting after the move is scaled too, not doubled
});

test('relocation: 0% change only adds the moving cost', () => {
  const s0 = base({ items: [{ id: 'living', kind: 'expense', monthly: 2000 }] });
  const s = applyEvent(s0, { template: 'relocation', params: { at: '2028-01', currency: 'AUD', costOfLivingChangePct: 0, oneOffCost: 1000 } });
  assert.equal(at(s, '2028-01'), -3000);
  assert.equal(at(s, '2028-02'), -2000);
});

test('expandEvents is idempotent and undoes item patches before re-applying', () => {
  const s0 = base({
    items: [{ id: 'karting', kind: 'income', monthly: 3000 }, { id: 'living', kind: 'expense', monthly: 2000 }],
    events: [
      { id: 'pilot', template: 'speedbirdPathway', params: { courseStart: '2027-09', replaces: ['karting'], salarySteps: [{ stage: 'reduced', monthly: 2500 }] } },
      { id: 'uk', template: 'relocation', params: { at: '2030-01', currency: 'GBP', costOfLivingChangePct: 20, oneOffCost: 0 } },
      { id: 'trip', template: 'oneOffTrip', params: { at: '2028-03', cost: 4000 } },
    ],
  });
  const once = expandEvents(s0).scenario;
  const twice = expandEvents(once).scenario;
  assert.deepEqual(twice, once);
  for (const m of ['2027-08', '2027-09', '2028-03', '2029-03', '2030-01']) assert.equal(at(twice, m), at(once, m));
  assert.equal(at(once, '2027-08'), 1000);
  assert.equal(at(once, '2030-01'), 2500 - 2400);
  // removing an event and re-expanding restores the original items exactly
  const without = expandEvents({ ...once, events: [] }).scenario;
  assert.deepEqual(without.items, s0.items);
  assert.deepEqual(without.oneOffs, []);
});

test('expandEvents skips invalid events and reports readable problems', () => {
  const { scenario, problems } = expandEvents(base({ events: [
    { template: 'oneOffTrip', params: { at: '2028-03' } },
    { template: 'nope' },
    { template: 'holiday', params: { perYear: 2, costEach: 1000, from: '2030-01' } },
  ] }));
  assert.equal(problems.length, 2);
  assert.deepEqual(problems[0].problems, ['Enter the trip’s cost.']);
  assert.match(problems[1].problems[0], /Unknown event type/);
  assert.equal(at(scenario, '2030-01'), -2000 / 12);
});

test('every template rejects empty params with readable messages, and has a label', () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    assert.ok(t.label, name);
    if (name === 'speedbirdPathway') continue; // valid with defaults (no salary → nothing invented)
    const p = eventProblems({ template: name, params: {} });
    assert.ok(p.length > 0, name);
    p.forEach((m) => assert.match(m, /^[A-Z].*\.$/, `${name}: ${m}`));
  }
  assert.throws(() => applyEvent(base(), { template: 'oneOffTrip', params: {} }), /Trip month/);
});

test('expanded events project through the engine', () => {
  const { scenario } = expandEvents(base({ openingPot: 100000, events: [{ template: 'oneOffTrip', params: { at: '2028-03', cost: 4000 } }] }));
  assert.equal(projectScenario(scenario).retirementPot, 96000);
});
