// Glide path + track status. PURE.
//
// The glide path is the pot you'd NEED at each month so that, from there, your remaining planned cash flows
// (investing, school fees, house deposit… everything in the scenario) plus growth land exactly on the target
// at retirement. It ends at the target. With no future flows it is exactly the coast number line; with big
// costs ahead it sits higher, because those costs have to be funded. Being at or above it = on track.
//
// Backward recursion of the engine's own monthly step (pot_i = pot_{i−1}·(1+rm) + c_i):
//     G_end = target,   G_{i−1} = (G_i − c_i) / (1+rm)
// Simplifications (documented in D20): one real return for all money (no per-pot rates or locks) and
// contributions are assumed invested even after coasting (redirectAfterCoast ignored).
import { realRate, targetPot, monthlyNet, ym, fromYm } from './engine.js';
import { expandEvents } from './events.js';

export const DEFAULT_TOLERANCE = 0.05; // ±5% of the glide value counts as "on track"

// → { start, needToday, target, points: [{ ym, value }] }   (one point per engine row, end-of-month values)
export function glidePath(scenario) {
  const s = Array.isArray(scenario.events) && scenario.events.length ? expandEvents(scenario).scenario : scenario;
  const a = s.assumptions;
  const r = realRate(a.nominalReturn, a.inflation);
  const rm = Math.pow(1 + r, 1 / 12) - 1;
  const startI = ym(s.start);
  const endI = ym(s.birth) + Math.round(s.retirementAge * 12);
  const target = targetPot({ annualSpend: a.retirementSpend, otherAnnualIncome: a.otherRetirementIncome || 0, withdrawalRate: a.withdrawalRate });
  const share = s.investShare == null ? 1 : s.investShare;
  const n = Math.max(0, endI - startI + 1);
  const values = new Array(n);
  let g = target;
  for (let k = n - 1; k >= 0; k--) {
    values[k] = g;
    const flow = monthlyNet(s, startI + k);
    const c = flow > 0 ? flow * share : flow;
    g = (g - c) / (1 + rm);
  }
  return { start: s.start, needToday: g, target, points: values.map((value, k) => ({ ym: fromYm(startI + k), value })) };
}

// Glide value for a month: before the first row → needToday; after the last → target.
export function glideAt(glide, at) {
  const i = ym(at) - ym(glide.start);
  if (i < 0) return glide.needToday;
  if (i >= glide.points.length) return glide.target;
  return glide.points[i].value;
}

// Compare an actual pot with the glide value. Within ±band → 'on-track'; band is inclusive.
//   band = max(tolerance × |glide|, minBand)
export function trackStatus(actual, glideValue, { tolerance = DEFAULT_TOLERANCE, minBand = 0 } = {}) {
  if (!Number.isFinite(actual) || !Number.isFinite(glideValue)) throw new RangeError('trackStatus needs two numbers');
  const band = Math.max(Math.abs(glideValue) * tolerance, minBand);
  const diff = actual - glideValue;
  const status = diff > band ? 'ahead' : diff < -band ? 'behind' : 'on-track';
  return { status, diff, band, ratio: glideValue > 0 ? actual / glideValue : null };
}
