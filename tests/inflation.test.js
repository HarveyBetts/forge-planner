import test from 'node:test';
import assert from 'node:assert/strict';
import { inflationFactor, toNominal, toReal, forDisplay, rowsForDisplay, modeLabel } from '../src/engine/inflation.js';
import { projectScenario } from '../src/engine/engine.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const ctx = { start: '2026-01', inflation: 0.025 };

test('inflation factor: 1 at start, (1+i)^years later, < 1 in the past', () => {
  near(inflationFactor('2026-01', '2026-01', 0.025), 1);
  near(inflationFactor('2026-01', '2027-01', 0.025), 1.025);
  near(inflationFactor('2026-01', '2036-01', 0.025), Math.pow(1.025, 10));
  near(inflationFactor('2026-01', '2026-07', 0.025), Math.sqrt(1.025));
  assert.ok(inflationFactor('2026-01', '2025-01', 0.025) < 1);
  assert.throws(() => inflationFactor('2026-01', '2027-01', NaN));
});

test('real ⇄ nominal round-trips', () => {
  for (const at of ['2026-01', '2030-06', '2060-12']) near(toReal(toNominal(12345.67, at, ctx), at, ctx), 12345.67);
});

test('the Instagram $4.3M in 26 years is about $2.26M in today’s money at 2.5% inflation', () => {
  const real = toReal(4.3e6, '2052-01', ctx);
  near(real, 4.3e6 / Math.pow(1.025, 26));
  assert.ok(real > 2.2e6 && real < 2.3e6);
});

test('forDisplay: real is identity, nominal inflates, unknown mode throws', () => {
  assert.equal(forDisplay(100, '2036-01', 'real', ctx), 100);
  assert.equal(forDisplay(100, '2036-01', undefined, ctx), 100);
  near(forDisplay(100, '2036-01', 'nominal', ctx), 100 * Math.pow(1.025, 10));
  assert.throws(() => forDisplay(1, '2036-01', 'weird', ctx), /Unknown display mode/);
});

test('rowsForDisplay: money fields inflated per row date, others untouched, input not mutated', () => {
  const s = { start: '2026-01', birth: '1990-01', retirementAge: 38, openingPot: 1000,
    assumptions: { nominalReturn: 0.05, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 1000 } };
  const rows = projectScenario(s).rows;
  const before = JSON.stringify(rows);
  const nom = rowsForDisplay(rows, 'nominal', { start: s.start, inflation: 0.025 });
  assert.equal(JSON.stringify(rows), before);
  assert.equal(rowsForDisplay(rows, 'real', ctx), rows);
  const last = rows.length - 1;
  near(nom[last].pot, rows[last].pot * inflationFactor('2026-01', rows[last].ym, 0.025) * Math.pow(1.025, 1 / 12)); // end-of-month
  near(nom[last].byPot.main, nom[last].pot);
  assert.equal(nom[last].age, rows[last].age);
  assert.equal(nom[last].isCoasting, rows[last].isCoasting);
  // Nominal growth ≈ the nominal return: 1000 → ~1000 × 1.05^2 after 24 months of growth (25 rows incl. first)
  near(nom[last].pot, 1000 * Math.pow(1.05, 25 / 12), 1e-9);
});

test('mode labels always name the money', () => {
  assert.equal(modeLabel('real'), 'today’s money');
  assert.match(modeLabel('nominal'), /inflation/);
});
