import test from 'node:test';
import assert from 'node:assert/strict';
import { chartModel, chartSVG, readoutAt } from '../src/ui/chart.js';
import { projectScenario } from '../src/engine/engine.js';
import { glidePath } from '../src/engine/glide.js';

const scen = (pot, extra = {}) => ({
  start: '2026-11', birth: '1997-03', retirementAge: 55, openingPot: pot,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000 },
  items: [{ id: 'inv', kind: 'income', monthly: 500 }], oneOffs: [], ...extra,
});
const build = (s, actuals) => {
  const at = (nr) => projectScenario({ ...s, assumptions: { ...s.assumptions, nominalReturn: nr } });
  const mid = projectScenario(s);
  return chartModel({ mid, low: at(0.04), high: at(0.09), glide: glidePath(s), target: mid.target, coastDate: mid.coastDate, currency: 'GBP', birth: s.birth, actuals });
};
const noBad = (svg) => assert.ok(!/NaN|undefined|Infinity/.test(svg), 'no NaN/undefined in SVG');

test('chart: all layers present for a normal plan', () => {
  const M = build(scen(50000));
  const svg = chartSVG(M);
  noBad(svg);
  for (const cls of ['pc-fan', 'pc-mid', 'pc-glide', 'pc-target', 'pc-grid', 'pc-x', 'pc-hit']) assert.ok(svg.includes(`class="${cls}"`), cls);
  assert.match(svg, /role="img" aria-label="Projection to age 55/);
  // yearly sampling: first, every 12th, last
  assert.equal(M.pts[0].i, 0);
  assert.equal(M.pts[M.pts.length - 1].i, M.n);
  assert.ok(M.pts.every((p, k) => k === 0 || p.i > M.pts[k - 1].i));
});

test('chart: never coasts → no coast marker; label says so', () => {
  const svg = chartSVG(build(scen(0, { items: [] })));
  noBad(svg);
  assert.ok(!svg.includes('pc-coast'));
  assert.match(svg, /coast not reached/);
});

test('chart: already coasting → marker at the start reading "Coasting now"', () => {
  const M = build(scen(3e6));
  assert.equal(M.coastI, 0);
  const svg = chartSVG(M);
  noBad(svg);
  assert.match(svg, /Coasting now/);
});

test('chart: shortfall is drawn at the baseline, said in words', () => {
  const M = build(scen(1000, { items: [{ id: 'fees', kind: 'expense', monthly: 3000 }] }));
  const svg = chartSVG(M);
  noBad(svg);
  const baseY = M.y(0);
  assert.ok(M.pts.every((p) => M.y(p.mid) <= baseY + 1e-9));
  assert.match(readoutAt(M, 1).text, /short by/);
  assert.match(svg, /middle case short by/);
});

test('chart: actuals drawn as dots and mentioned in the readout', () => {
  const M = build(scen(50000), [{ at: '2027-11', total: 60000 }, { at: '2010-01', total: 1 }]);
  assert.equal(M.acts.length, 1);
  assert.match(chartSVG(M), /class="pc-act"/);
  const r = readoutAt(M, 12 / M.n);
  assert.match(r.text, /^Age 30 \(Nov 2027\): about £[\d.]+k, range .* plan needs .*; you had £60k\.$/);
});

test('chart: too short to draw → null and empty SVG', () => {
  const s = scen(1000, { start: '2052-03' });
  const mid = projectScenario(s);
  assert.equal(chartModel({ mid, target: mid.target }), null);
  assert.equal(chartSVG(null), '');
  assert.equal(readoutAt(null, 0.5), '');
});

test('chart: readout clamps taps outside the plot', () => {
  const M = build(scen(50000));
  assert.equal(readoutAt(M, -3).i, 0);
  assert.equal(readoutAt(M, 7).i, M.n);
});
