import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS, EDITABLE, formToEvent, eventToForm, eventLabel, eventWhen, newEventId } from '../src/ui/eventforms.js';
import { TEMPLATES, applyEvent } from '../src/engine/events.js';
import { monthlyNet, ym } from '../src/engine/engine.js';

const base = { start: '2026-11', birth: '1997-03', retirementAge: 55, assumptions: { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1 }, items: [], oneOffs: [] };

test('every editable form maps to an engine template; Speedbird is not offered (D22)', () => {
  for (const t of EDITABLE) assert.ok(TEMPLATES[t], t);
  assert.ok(!EDITABLE.includes('speedbirdPathway'));
  for (const t of EDITABLE) FORMS[t].fields.forEach((f) => assert.ok(['month', 'money', 'number', 'text', 'select'].includes(f.type), `${t}.${f.k}`));
});

test('trip: form → event → exact cash flow', () => {
  const { event, problems } = formToEvent('oneOffTrip', { name: 'Dirt-bike trip', at: '2028-03', cost: '4000' }, 'e1');
  assert.deepEqual(problems, []);
  assert.deepEqual(event, { id: 'e1', template: 'oneOffTrip', params: { name: 'Dirt-bike trip', at: '2028-03', cost: 4000 } });
  assert.equal(monthlyNet(applyEvent(base, event), ym('2028-03')), -4000);
});

test('child: bands, school and empty optionals', () => {
  const { event, problems } = formToEvent('child', { birth: '2031-06', cost0: '12000', cost4: '', cost11: '6000', schoolFrom: '4', schoolFee: '20000' }, 'c1');
  assert.deepEqual(problems, []);
  assert.deepEqual(event.params.costBands, [{ fromAge: 0, toAge: 4, annual: 12000 }, { fromAge: 11, toAge: 18, annual: 6000 }]);
  assert.deepEqual(event.params.school, { fromAge: 4, toAge: 18, annualFee: 20000 });
  const none = formToEvent('child', { birth: '2031-06', schoolFrom: '' }, 'c2');
  assert.equal(none.event.params.school, null);
  assert.deepEqual(none.problems, []);
  // school chosen but no fee → the engine's readable problem
  assert.deepEqual(formToEvent('child', { birth: '2031-06', schoolFrom: '4' }, 'c3').problems, ['School: enter the yearly fee.']);
});

test('home, holidays, car, move: required fields produce readable problems', () => {
  assert.ok(formToEvent('houseDeposit', {}, 'h').problems.includes('Enter the deposit.'));
  assert.ok(formToEvent('holiday', { perYear: '2' }, 'h').problems.includes('Enter the cost of each holiday.'));
  assert.ok(formToEvent('car', { at: '2029-03' }, 'c').problems.includes('Enter the car’s cost.'));
  assert.ok(formToEvent('relocation', { currency: 'GBP' }, 'r').problems.includes('Move month must be YYYY-MM.'));
  assert.deepEqual(formToEvent('houseDeposit', { at: '2034-06', deposit: '45000', mortMonthly: '1800', mortYears: '25' }, 'h').problems, []);
  assert.match(formToEvent('nope', {}, 'x').problems[0], /Unknown event type/);
});

test('event → form → event round-trips for every template', () => {
  const samples = {
    child: { birth: '2031-06', cost0: '12000', cost4: '8000', cost11: '6000', schoolFrom: '11', schoolFee: '25000', name: 'Ava' },
    houseDeposit: { at: '2034-06', deposit: '45000', buyingCosts: '6000', mortMonthly: '1800', mortYears: '25' },
    holiday: { name: 'Family holidays', perYear: '2', costEach: '5000', from: '2031-01', to: '' },
    car: { name: 'Tesla', at: '2029-03', cost: '40000', runningMonthly: '250', replaceEvery: '8' },
    oneOffTrip: { name: 'Wedding', at: '2030-08', cost: '25000' },
    relocation: { at: '2028-06', currency: 'GBP', costOfLivingChangePct: '-10', oneOffCost: '5000' },
  };
  for (const [t, v] of Object.entries(samples)) {
    const a = formToEvent(t, v, 'x');
    assert.deepEqual(a.problems, [], t);
    const b = formToEvent(t, eventToForm(a.event), 'x');
    assert.deepEqual(b.event, a.event, t);
  }
});

test('labels, dates and ids', () => {
  assert.equal(eventLabel({ template: 'oneOffTrip', params: { name: 'Vietnam' } }), 'Vietnam');
  assert.equal(eventLabel({ template: 'houseDeposit', params: {} }), 'Buy a home');
  assert.equal(eventWhen({ template: 'child', params: { birth: '2031-06' } }), '2031-06');
  assert.equal(newEventId([], 36 ** 3), 'ev-1000');
  assert.equal(newEventId([{ id: 'ev-1000' }], 36 ** 3), 'ev-1000-2');
});
