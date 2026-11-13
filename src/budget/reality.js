// Reality check (T3.4): is the plan's assumed monthly investing backed up by the budget? PURE.
// Uses only weeks that have STARTED (Harvey's sheet also holds planned future weeks), up to the last `lookback` of them.
import { weekKeys, weekRow, mondayOf } from './ledger.js';

const WEEKS_PER_MONTH = 52 / 12;

// → null (no budget data yet) | { weeks, monthlyLeft (base), planned (base), diff, verdict:'more'|'close'|'less'|'negative', from, to }
export function realityCheck(budget, { today, convert, base, plannedMonthly, lookback = 8, tolerance = 0.1 }) {
  if (!budget) return null;
  const now = mondayOf(today);
  const keys = weekKeys(budget).filter((k) => k <= now).slice(-lookback);
  if (keys.length < 2) return { weeks: keys.length, verdict: 'too-few' };
  const weekly = keys.reduce((s, k) => s + weekRow(budget, k).total, 0) / keys.length;
  const cur = budget.currency || base;
  const monthlyLeft = (cur === base ? weekly : convert(weekly, cur, base)) * WEEKS_PER_MONTH;
  const planned = Number(plannedMonthly) || 0;
  const diff = monthlyLeft - planned;
  let verdict;
  if (monthlyLeft < 0) verdict = 'negative';
  else if (planned > 0 && Math.abs(diff) <= planned * tolerance) verdict = 'close';
  else verdict = diff >= 0 ? 'more' : 'less';
  return { weeks: keys.length, from: keys[0], to: keys[keys.length - 1], monthlyLeft, planned, diff, verdict };
}
