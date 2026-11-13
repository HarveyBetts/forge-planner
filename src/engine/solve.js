// "What must be true" solvers. PURE. Each answers: holding everything else fixed, what value of ONE lever
// puts the plan on track (retirement pot ≥ target)? `null` = not reachable with that lever alone within
// sane bounds — the UI must say so in words ("not reachable by … alone"), never show null/NaN.
//
// All use bisection on a monotone-in-practice question, then VERIFY the answer with a real projection
// (falling back to a scan when the plan isn't monotone, e.g. negative balances compounding at the return).
import { projectScenario, solveMonthlyContribution, ym } from './engine.js';

const onTrack = (s) => projectScenario(s).onTrack;

// Smallest x in [lo, hi] with pred(x) true, assuming pred is false→true as x rises. null if pred(hi) false.
export function bisectMin(pred, lo, hi, iters = 50) {
  if (pred(lo)) return lo;
  if (!pred(hi)) return null;
  for (let k = 0; k < iters; k++) {
    const mid = (lo + hi) / 2;
    if (pred(mid)) hi = mid; else lo = mid;
  }
  return hi;
}
// Largest x in [lo, hi] with pred(x) true, assuming pred is true→false as x rises. null if pred(lo) false.
export function bisectMax(pred, lo, hi, iters = 50) {
  if (pred(hi)) return hi;
  if (!pred(lo)) return null;
  for (let k = 0; k < iters; k++) {
    const mid = (lo + hi) / 2;
    if (pred(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// Nominal return (before inflation) needed. Searched 0%–20%. Returns 0 if even 0% works.
export function requiredNominalReturn(s, { max = 0.2 } = {}) {
  const at = (nr) => onTrack({ ...s, assumptions: { ...s.assumptions, nominalReturn: nr } });
  const r = bisectMin(at, 0, max, 40);
  if (r === null) return null;
  if (at(r)) return r;
  // Not monotone: scan in 0.25% steps.
  for (let nr = 0; nr <= max + 1e-9; nr += 0.0025) if (at(nr)) return nr;
  return null;
}

// Earliest retirement age (to the month) that's on track, from 1 month after today up to maxAge.
export function requiredRetirementAge(s, { maxAge = 80 } = {}) {
  const startI = ym(s.start), birthI = ym(s.birth);
  const ageAt = (months) => months / 12;
  const lo = startI - birthI + 1;          // months of age, earliest candidate
  const hi = Math.round(maxAge * 12);
  if (hi < lo) return null;
  const at = (m) => onTrack({ ...s, retirementAge: ageAt(m) });
  // Integer bisection over months.
  if (!at(hi)) return null;
  let a = lo, b = hi;
  if (at(a)) return ageAt(a);
  while (b - a > 1) {
    const mid = Math.floor((a + b) / 2);
    if (at(mid)) b = mid; else a = mid;
  }
  // Verify: no earlier on-track age (cheap yearly scan catches non-monotone plans).
  for (let m = lo; m < b; m += 12) if (at(m)) return ageAt(m);
  return ageAt(b);
}

// Highest yearly retirement spend (today's money) that's on track. 0 → null (nothing is affordable).
export function affordableRetirementSpend(s) {
  const cur = s.assumptions.retirementSpend;
  const at = (spend) => onTrack({ ...s, assumptions: { ...s.assumptions, retirementSpend: spend } });
  const hi = Math.max(cur, 1) * 4;
  const v = bisectMax(at, 0, hi, 50);
  if (v === null || v <= 0) return null;
  return v;
}

// Everything at once for the plan screen. Each field: number, or null = not reachable by that lever alone.
export function whatMustBeTrue(s) {
  const p = projectScenario(s);
  if (p.onTrack) return { onTrack: true, extraMonthly: 0, nominalReturn: null, retirementAge: null, retirementSpend: null, spendCut: 0 };
  const spend = affordableRetirementSpend(s);
  return {
    onTrack: false,
    extraMonthly: solveMonthlyContribution(s),
    nominalReturn: requiredNominalReturn(s),
    retirementAge: requiredRetirementAge(s),
    retirementSpend: spend,
    spendCut: spend === null ? null : Math.max(0, s.assumptions.retirementSpend - spend),
  };
}
