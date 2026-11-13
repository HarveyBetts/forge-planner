import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, tabOf, tabIndex, slideDir, TABS, tabBarHTML } from '../src/ui/shell.js';
import { milestones } from '../src/ui/milestones.js';
import { projectScenario } from '../src/engine/engine.js';

test('routes: only plain #name routes are accepted', () => {
  assert.equal(parseRoute('#plan'), 'plan');
  assert.equal(parseRoute('settings'), 'settings');
  assert.equal(parseRoute('#answers'), 'answers');
  for (const bad of ['', '#', '#Plan', '#plan/2', '#plan?x=1', '#nope', null, undefined, '#__proto__']) assert.equal(parseRoute(bad), null, String(bad));
});

test('routes: tabs, sub-routes and slide directions', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['Plan', 'Timeline', 'Budget', 'Scenarios', 'Settings']);
  assert.equal(tabOf('answers'), 'settings');
  assert.equal(tabIndex('answers'), 4);
  assert.equal(slideDir('plan', 'budget'), 'fwd');
  assert.equal(slideDir('settings', 'timeline'), 'back');
  assert.equal(slideDir('settings', 'answers'), 'fwd');
  assert.equal(slideDir('answers', 'settings'), 'back');
  assert.equal(slideDir('plan', 'plan'), 'none');
  assert.equal(slideDir(null, 'plan'), 'none');
  assert.match(tabBarHTML(), /href="#scenarios"/);
});

test('milestones: stages, events, coast and the end, in date order with ages and pots', () => {
  const s = { start: '2026-11', birth: '1997-03', retirementAge: 40, openingPot: 50000,
    assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 10000 },
    marks: [{ at: '2027-09', label: 'Speedbird training starts' }],
    items: [{ id: 'school', name: 'Child 1 school', kind: 'expense', annual: 12000, from: '2030-01' }],
    oneOffs: [{ at: '2028-03', amount: -4000, name: 'Dirt-bike trip' }, { at: '2019-01', amount: -1, name: 'Old' }] };
  const p = projectScenario(s);
  const m = milestones(s, p);
  assert.equal(m[0].label, 'Today');
  assert.equal(m[m.length - 1].label, 'Stop work at 40');
  assert.ok(m.every((x, i) => i === 0 || x.at >= m[i - 1].at), 'sorted');
  const trip = m.find((x) => x.label === 'Dirt-bike trip');
  assert.equal(trip.amount, -4000);
  assert.equal(Math.floor(trip.age), 31);
  assert.equal(typeof trip.pot, 'number');
  assert.ok(m.some((x) => x.label === 'Child 1 school starts' && x.amount === -12000 && x.per === 'yr'));
  assert.ok(!m.some((x) => x.label === 'Old'), 'past events left out');
  if (p.coastDate) assert.ok(m.some((x) => x.kind === 'money' && /Coasting/.test(x.label)));
});
