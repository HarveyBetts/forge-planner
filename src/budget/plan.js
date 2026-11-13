// Planned vs actual per category (T3.2b). PURE.
//   budget.plan = { [categoryId]: weekly amount }  (a positive number: what you plan to spend — or earn, for income)
import { round2 } from './ledger.js';

// For one week: [{ id, name, kind, actual (positive), plan, ratio, over }] for categories with a plan or a value.
export function weekVsPlan(budget, monday) {
  const row = (budget.entries || {})[monday] || {};
  const plan = budget.plan || {};
  return budget.categories.map((c) => {
    const v = Number(row[c.id]) || 0;
    const actual = c.kind === 'income' ? v : Math.max(0, -v);
    const p = Number(plan[c.id]) || 0;
    const ratio = p > 0 ? actual / p : null;
    const over = c.kind !== 'income' && p > 0 && actual > p ? round2(actual - p) : 0;
    const short = c.kind === 'income' && p > 0 && actual < p ? round2(p - actual) : 0;
    return { id: c.id, name: c.name, kind: c.kind, actual: round2(actual), plan: p, ratio, over, short };
  });
}
export function overPlan(budget, monday) {
  return weekVsPlan(budget, monday).filter((r) => r.over > 0).sort((a, b) => b.over - a.over);
}
export function setPlan(budget, catId, amount) {
  const plan = { ...(budget.plan || {}) };
  const n = Number(String(amount ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || String(amount ?? '').replace(/[^0-9]/g, '') === '') delete plan[catId];
  else plan[catId] = round2(n);
  return { ...budget, plan };
}
// How loudly to flag overspending (settings.overspend from q47): which UI pieces show.
export function flagLevel(overspend) {
  return { off: { bar: false, text: false, banner: false }, quiet: { bar: false, text: true, banner: false },
    nudge: { bar: true, text: true, banner: false }, loud: { bar: true, text: true, banner: true } }[overspend] || { bar: true, text: true, banner: false };
}
