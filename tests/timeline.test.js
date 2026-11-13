import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineModel, readoutText, nextStop } from '../src/ui/timeline.js';
import { milestones } from '../src/ui/milestones.js';
import { projectScenario } from '../src/engine/engine.js';

const s = {
  start: '2026-11', birth: '1997-03', retirementAge: 40, openingPot: 10000, baseCurrency: 'GBP',
  assumptions: { nominalReturn: 0, inflation: 0, withdrawalRate: 0.04, retirementSpend: 1000 },
  marks: [{ at: '2027-09', label: 'Speedbird training starts' }, { at: '2029-03', label: 'First Officer (reduced Speedbird scale)' }],
  items: [{ id: 'inv', kind: 'income', monthly: 100 }],
  oneOffs: [{ at: '2028-03', amount: -4000, name: 'Dirt-bike trip' }],
};
const res = projectScenario(s);
const M = timelineModel(s, res, milestones(s, res));

test('timeline: spans today → stop-work with stops at the right months', () => {
  assert.equal(M.n, res.rows.length - 1);
  const byLabel = Object.fromEntries(M.stops.map((m) => [m.label, m.i]));
  assert.equal(byLabel.Today, 0);
  assert.equal(byLabel['Speedbird training starts'], 10);
  assert.equal(byLabel['Dirt-bike trip'], 16);
  assert.equal(byLabel['First Officer (reduced Speedbird scale)'], 28);
  assert.equal(byLabel['Stop work at 40'], M.n);
});

test('timeline: readout follows the scrub position (age, pot, stage, cash flow)', () => {
  const a = M.at(0);
  assert.deepEqual([a.ym, a.stage, a.pot], ['2026-11', 'Today', 10100]);
  const b = M.at(16);
  assert.equal(b.ym, '2028-03');
  assert.equal(b.stage, 'Speedbird training starts');
  assert.equal(b.flow, 100 - 4000);
  assert.equal(b.here[0].label, 'Dirt-bike trip');
  assert.equal(b.pot, 10000 + 17 * 100 - 4000);
  const c = M.at(30);
  assert.equal(c.stage, 'First Officer (reduced Speedbird scale)');
  assert.equal(Math.floor(c.age), 32); // May 2029, born Mar 1997
  assert.equal(M.at(-5).i, 0);
  assert.equal(M.at(1e6).i, M.n);
});

test('timeline: readout text and stop-to-stop jumps', () => {
  assert.equal(readoutText(M.at(16)), 'Mar 2028, age 31: pot about £7,700. Speedbird training starts.');
  assert.equal(nextStop(M, 0, 1), 10);
  assert.equal(nextStop(M, 10, 1), 16);
  assert.equal(nextStop(M, 16, -1), 10);
  assert.equal(nextStop(M, 0, -1), null);
  assert.equal(nextStop(M, M.n, 1), null);
  assert.match(readoutText({ ...M.at(0), pot: -5000 }), /short by £5,000/);
});
