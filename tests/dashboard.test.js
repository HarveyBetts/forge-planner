import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardModel } from '../src/ui/dashboard.js';
import { projectScenario, scenarioCoastStatus } from '../src/engine/engine.js';
import { glidePath } from '../src/engine/glide.js';

const base = (pot, extra = {}) => ({
  start: '2026-11', birth: '1997-03', retirementAge: 55, openingPot: pot,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000 },
  items: [{ id: 'investing', kind: 'income', monthly: 500 }], oneOffs: [], ...extra,
});
const model = (s, o) => dashboardModel(s, projectScenario(s), scenarioCoastStatus(s), o);
const need = (s) => glidePath(s).needToday;

test('dashboard: on track when today’s pot is within ±5% of the glide path', () => {
  const s0 = base(0);
  const m = model(base(need(s0)));
  assert.equal(m.status, 'on-track');
  assert.deepEqual([m.chip.label, m.chip.kind], ['On track', 'info']);
  assert.match(m.message, /reach your target by 55/);
  assert.equal(model(base(need(s0) * 1.049)).status, 'on-track');
  assert.equal(model(base(need(s0) * 0.951)).status, 'on-track');
});

test('dashboard: ahead and behind beyond the band', () => {
  const n = need(base(0));
  const a = model(base(n * 1.2));
  assert.deepEqual([a.status, a.chip.label, a.chip.kind], ['ahead', 'Ahead', 'ok']);
  const b = model(base(n * 0.5));
  assert.deepEqual([b.status, b.chip.label, b.chip.kind], ['behind', 'Behind', 'warn']);
  assert.match(b.message, /fall short/);
  assert.match(model(base(n * 0.5), { tone: 'blunt' }).message, /Something has to change/);
});

test('dashboard: runs short beats the glide status', () => {
  const s = base(1000, { items: [{ id: 'fees', kind: 'expense', monthly: 2000 }] });
  const m = model(s);
  assert.equal(m.status, 'short');
  assert.equal(m.chip.label, 'Runs short');
  assert.match(m.message, /run out in/);
});

test('dashboard: ring caps at 100% and turns into Coasting with a surplus', () => {
  const s = base(2e6);
  const m = model(s);
  assert.equal(m.ring.coasting, true);
  assert.equal(m.ring.ratio, 1);
  assert.equal(m.ring.label, 'Coasting');
  assert.ok(m.ring.pct > 100);
  assert.ok(m.ring.surplus > 0);
  assert.match(m.message, /no more investing/);
  const low = model(base(1000));
  assert.ok(low.ring.ratio > 0 && low.ring.ratio < 1);
  assert.equal(low.ring.coasting, false);
});

test('dashboard: free money this month', () => {
  // Coasting: the planned £500 investing is free money.
  const c = model(base(2e6));
  assert.equal(c.free.amount, 500);
  assert.match(c.free.note, /spend instead of investing/);
  // Not coasting, investShare 80%: £100 of £500 isn't invested.
  const part = model(base(1000, { investShare: 0.8 }));
  assert.ok(Math.abs(part.free.amount - 100) < 1e-9);
  // Not coasting, everything invested: £0 + when it becomes optional (or never).
  const none = model(base(1000));
  assert.equal(none.free.amount, 0);
  assert.match(none.free.note, /optional|still needed/);
  // redirectAfterCoast: already counted in `freed` by the engine — not double counted
  const r = model(base(2e6, { redirectAfterCoast: true }));
  assert.equal(r.free.amount, 500);
});
