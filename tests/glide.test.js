import test from 'node:test';
import assert from 'node:assert/strict';
import { glidePath, glideAt, trackStatus } from '../src/engine/glide.js';
import { projectScenario, coastNumber, realRate } from '../src/engine/engine.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const base = (extra = {}) => ({
  start: '2026-01', birth: '1990-01', retirementAge: 40, openingPot: 0,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 4000 }, // target 100k
  items: [], oneOffs: [], ...extra,
});

test('glide: ends at the target; with no flows it is the coast-number line', () => {
  const s = base();
  const g = glidePath(s);
  assert.equal(g.points.length, 49);
  assert.equal(g.points[48].value, 100000);
  const r = realRate(0.07, 0.025);
  near(g.points[0].value, coastNumber({ target: 100000, realReturn: r, yearsToRetirement: 48 / 12 }));
  near(g.needToday, coastNumber({ target: 100000, realReturn: r, yearsToRetirement: 49 / 12 }));
});

test('glide: starting exactly at needToday, the projection lands exactly on target', () => {
  const s = base({ items: [{ id: 'inv', kind: 'income', monthly: 500 }, { id: 'fees', kind: 'expense', monthly: 900, from: '2028-01', to: '2028-12' }],
    oneOffs: [{ at: '2027-06', amount: -8000 }] });
  const g = glidePath(s);
  const p = projectScenario({ ...s, openingPot: g.needToday });
  near(p.retirementPot, 100000, 1e-9);
  // and every row of that projection sits on the glide
  p.rows.forEach((row, k) => near(row.pot, g.points[k].value, 1e-9));
});

test('glide: future costs raise the line; future savings lower it', () => {
  const plain = glidePath(base()).needToday;
  const costs = glidePath(base({ oneOffs: [{ at: '2028-01', amount: -20000 }] })).needToday;
  const saves = glidePath(base({ items: [{ id: 'inv', kind: 'income', monthly: 1000 }] })).needToday;
  assert.ok(costs > plain && saves < plain);
});

test('glide: investShare and events are respected', () => {
  const half = glidePath(base({ items: [{ id: 'inv', kind: 'income', monthly: 1000 }], investShare: 0.5 }));
  const p = projectScenario({ ...base({ items: [{ id: 'inv', kind: 'income', monthly: 1000 }], investShare: 0.5 }), openingPot: half.needToday });
  near(p.retirementPot, 100000, 1e-9);
  const ev = glidePath(base({ events: [{ template: 'oneOffTrip', params: { at: '2027-01', cost: 5000 } }] }));
  const one = glidePath(base({ oneOffs: [{ at: '2027-01', amount: -5000 }] }));
  near(ev.needToday, one.needToday, 1e-12);
});

test('glideAt: before start, inside, after end', () => {
  const g = glidePath(base());
  assert.equal(glideAt(g, '2025-06'), g.needToday);
  assert.equal(glideAt(g, '2026-01'), g.points[0].value);
  assert.equal(glideAt(g, '2028-07'), g.points[30].value);
  assert.equal(glideAt(g, '2030-01'), 100000);
  assert.equal(glideAt(g, '2031-01'), 100000);
});

test('trackStatus: boundaries are inclusive for on-track', () => {
  assert.equal(trackStatus(105, 100).status, 'on-track');   // exactly +5%
  assert.equal(trackStatus(95, 100).status, 'on-track');    // exactly −5%
  assert.equal(trackStatus(105.0001, 100).status, 'ahead');
  assert.equal(trackStatus(94.9999, 100).status, 'behind');
  assert.equal(trackStatus(100, 100).status, 'on-track');
  const t = trackStatus(120, 100);
  assert.deepEqual([t.diff, t.band, t.ratio], [20, 5, 1.2]);
});

test('trackStatus: custom tolerance, minimum band, zero/negative glide', () => {
  assert.equal(trackStatus(110, 100, { tolerance: 0.1 }).status, 'on-track');
  assert.equal(trackStatus(300, 0).status, 'ahead');               // glide 0 → band 0
  assert.equal(trackStatus(300, 0, { minBand: 500 }).status, 'on-track');
  assert.equal(trackStatus(0, -1000).status, 'ahead');              // future savings already cover it
  assert.equal(trackStatus(0, -1000).ratio, null);
  assert.throws(() => trackStatus(NaN, 1), /two numbers/);
});
