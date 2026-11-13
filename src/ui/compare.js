// Scenario compare (T2.7). PURE.
//   applyWhatIf(answers, changes, base) -> a NEW answers object with the what-if's changes
//   compareModel(A, B, { currency }) -> rows [{ key, label, a, b, delta, better }]   (A/B from scenarioSummary)
import { ym } from '../engine/engine.js';
import { money, monthLabel, ageLabel } from './format.js';

// changes: { kids?, ageFirst?, retirementAge?, spend?, investNow? } — anything absent keeps your answer.
export function applyWhatIf(answers, changes = {}, base = 'GBP') {
  const a = JSON.parse(JSON.stringify(answers || {}));
  const val = (id) => (a[id] && !a[id].unknown ? a[id].v : undefined);
  if (Number.isFinite(changes.kids)) {
    const k = { ...(val('q74') || {}) , count: changes.kids };
    if (Number.isFinite(changes.ageFirst)) k.ageFirst = changes.ageFirst;
    a.q74 = { v: k };
  }
  if (Number.isFinite(changes.retirementAge)) a.q4 = { v: changes.retirementAge };
  if (Number.isFinite(changes.spend)) a.q63 = { v: { amount: changes.spend, currency: (val('q63') || {}).currency || base } };
  if (Number.isFinite(changes.investNow)) a.q50 = { v: { ...(val('q50') || {}), now: { amount: changes.investNow, currency: ((val('q50') || {}).now || {}).currency || base } } };
  return a;
}

// Plain-English list of a what-if's changes ("2 kids · stop at 57").
export function describeChanges(c = {}, currency = 'GBP') {
  const out = [];
  if (Number.isFinite(c.kids)) out.push(c.kids === 0 ? 'no kids' : `${c.kids} kid${c.kids === 1 ? '' : 's'}`);
  if (Number.isFinite(c.retirementAge)) out.push(`stop work at ${c.retirementAge}`);
  if (Number.isFinite(c.spend)) out.push(`${money(c.spend, currency, { compact: true })}/yr in retirement`);
  if (Number.isFinite(c.investNow)) out.push(`invest ${money(c.investNow, currency)}/mo now`);
  return out.join(' · ') || 'same as your plan';
}

// summary: { name, status, chip, target, potAtEnd, coastDate, coasting, depletedAt, freeNow, needToday, retirementAge }
const STATUS_RANK = { short: 0, behind: 1, 'on-track': 2, ahead: 3 };
export function compareModel(A, B, { currency = 'GBP' } = {}) {
  const m = (x) => money(x, currency, { compact: true });
  const signed = (d) => (Math.abs(d) < 1 ? 'same' : `${d > 0 ? '+' : '−'}${m(Math.abs(d))}`);
  const pot = (x) => (x < 0 ? `short by ${m(-x)}` : m(x));
  const coast = (s) => (s.coasting ? 'Now' : s.coastDate ? monthLabel(s.coastDate) : 'Not before you stop');
  const span = (mths) => { const y = Math.floor(Math.abs(mths) / 12), r = Math.abs(mths) % 12; return [y ? `${y} yr${y === 1 ? '' : 's'}` : '', r ? `${r} mth${r === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || 'same'; };
  const coastDelta = () => {
    const ia = A.coasting ? 0 : A.coastDate ? ym(A.coastDate) : null, ib = B.coasting ? 0 : B.coastDate ? ym(B.coastDate) : null;
    if (ia === ib) return { delta: 'same', better: null };
    if (ia == null) return { delta: 'B reaches coast', better: 'b' };
    if (ib == null) return { delta: 'B never coasts', better: 'a' };
    if (A.coasting || B.coasting) return { delta: B.coasting ? 'B coasts now' : 'A coasts now', better: B.coasting ? 'b' : 'a' };
    const d = ib - ia;
    return { delta: `${span(d)} ${d > 0 ? 'later' : 'sooner'}`, better: d > 0 ? 'a' : 'b' };
  };
  const moneyRow = (key, label, fa, fb, fmt, higherIsBetter = true) => {
    const d = fb - fa;
    return { key, label, a: fmt(fa), b: fmt(fb), delta: signed(d), better: Math.abs(d) < 1 ? null : (d > 0) === higherIsBetter ? 'b' : 'a' };
  };
  const rows = [
    { key: 'status', label: 'Status', a: A.chip, b: B.chip, delta: A.status === B.status ? 'same' : `${A.chip} → ${B.chip}`,
      better: STATUS_RANK[A.status] === STATUS_RANK[B.status] ? null : STATUS_RANK[B.status] > STATUS_RANK[A.status] ? 'b' : 'a' },
    { key: 'coast', label: 'Coast date', a: coast(A), b: coast(B), ...coastDelta() },
    moneyRow('pot', `Pot when you stop (middle case)`, A.potAtEnd, B.potAtEnd, pot),
    moneyRow('target', 'Target pot', A.target, B.target, m, false),
    moneyRow('need', 'Needed today to stay on plan', Math.max(0, A.needToday), Math.max(0, B.needToday), m, false),
    moneyRow('free', 'Free money this month', A.freeNow, B.freeNow, (x) => money(x, currency)),
    { key: 'age', label: 'Stop work at', a: ageLabel(A.retirementAge), b: ageLabel(B.retirementAge), delta: A.retirementAge === B.retirementAge ? 'same' : `${B.retirementAge > A.retirementAge ? '+' : '−'}${ageLabel(Math.abs(B.retirementAge - A.retirementAge))} yrs`, better: null },
    { key: 'short', label: 'Savings run out', a: A.depletedAt ? monthLabel(A.depletedAt) : 'No', b: B.depletedAt ? monthLabel(B.depletedAt) : 'No',
      delta: (A.depletedAt || null) === (B.depletedAt || null) ? 'same' : !B.depletedAt ? 'B never runs out' : !A.depletedAt ? 'B runs out' : 'different month',
      better: !A.depletedAt === !B.depletedAt ? null : B.depletedAt ? 'a' : 'b' },
  ];
  return { a: A.name, b: B.name, rows };
}
