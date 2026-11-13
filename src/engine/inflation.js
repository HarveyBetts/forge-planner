// Real (today's money) ⇄ nominal (future money) conversion — for DISPLAY ONLY. The engine always works
// in today's money (D4); a nominal view just inflates each value by the months between `start` and its date.
// PURE. Inflation is the scenario's assumption (annual, e.g. 0.025), compounded monthly like the engine.
import { ym } from './dates.js';

export const MODES = ['real', 'nominal'];

// Growth factor of prices from `start` to `at` ('YYYY-MM'). 1 at start; < 1 for dates before start.
export function inflationFactor(start, at, inflation) {
  if (!Number.isFinite(inflation) || inflation <= -1) throw new RangeError('inflation must be a number > -100%');
  const months = ym(at) - ym(start);
  return Math.pow(1 + inflation, months / 12);
}
export function toNominal(amountToday, at, { start, inflation }) {
  return amountToday * inflationFactor(start, at, inflation);
}
export function toReal(amountNominal, at, { start, inflation }) {
  return amountNominal / inflationFactor(start, at, inflation);
}
// Convert for the chosen display mode. 'real' is the identity.
export function forDisplay(amountToday, at, mode, ctx) {
  if (mode === 'nominal') return toNominal(amountToday, at, ctx);
  if (mode === 'real' || mode == null) return amountToday;
  throw new RangeError(`Unknown display mode "${mode}"`);
}
// Projection rows in the chosen mode (money fields only; ages/flags untouched). Returns new rows.
// Engine rows are END-of-month values (the first row already includes a month of growth), so a row dated
// month m is inflated over (m − start + 1) months; that keeps nominal growth equal to the nominal return.
const MONEY_FIELDS = ['pot', 'accessible', 'locked', 'flow', 'contribution', 'freed', 'coastNumber'];
export function rowsForDisplay(rows, mode, ctx) {
  if (mode === 'real' || mode == null) return rows;
  return rows.map((r) => {
    const f = inflationFactor(ctx.start, r.ym, ctx.inflation) * Math.pow(1 + ctx.inflation, 1 / 12);
    const out = { ...r };
    for (const k of MONEY_FIELDS) if (typeof r[k] === 'number') out[k] = r[k] * f;
    if (r.byPot) out.byPot = Object.fromEntries(Object.entries(r.byPot).map(([id, v]) => [id, v * f]));
    return out;
  });
}
// Words to put next to numbers so the mode is never ambiguous (DESIGN: always say "today's money").
export function modeLabel(mode) {
  return mode === 'nominal' ? 'future money (with inflation)' : 'today’s money';
}
