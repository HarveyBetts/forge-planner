// Budget screen logic (T3.7). PURE — rendering lives in app.js; this decides the numbers and the input rules.
import { cashForecast, mondayOf, weekKeys } from './ledger.js';
import { holdings } from './investments.js';

// Cash today: the forecast balance at the latest week that has started; before the first week → opening cash.
export function cashNow(budget, today) {
  const f = cashForecast(budget);
  const wk = mondayOf(today);
  const past = f.filter((r) => r.week <= wk);
  return past.length ? past[past.length - 1].balance : Number(budget.openingCash) || 0;
}

// Net worth in the base currency. convert(amount, from, to) is the app's FX (src/fx). GBX handled by holdings().
export function netWorth(budget, { convert, base, today }) {
  const toBase = (a, c) => (c === base ? a : convert(a, c, base));
  const cash = cashNow(budget, today);
  const h = holdings(budget.holdings?.lots || [], budget.holdings?.prices || {}, (a, c) => convert(a, c, 'GBP'));
  const parts = [
    { id: 'cash', label: 'Cash', amount: cash, currency: budget.currency, inBase: toBase(cash, budget.currency) },
    ...(budget.extras || []).map((e) => ({ id: e.id, label: e.name, amount: e.amount, currency: e.currency, inBase: toBase(e.amount, e.currency) })),
  ];
  if (h.list.length) parts.push({ id: 'investments', label: 'Investments', amount: h.totals.value, currency: 'GBP', inBase: toBase(h.totals.value, 'GBP'), unpriced: h.totals.unpriced });
  return { parts, total: parts.reduce((s, p) => s + (Number.isFinite(p.inBase) ? p.inBase : 0), 0), holdings: h };
}

// Typing into a category cell. Spending categories: "120" = spent 120 (stored −120); "+35" = money back (+35).
// Income: "900" = +900; "-50" = −50. Blank / "0" clears. Commas, currency symbols and spaces are ignored.
export function parseEntry(text, kind) {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const plus = /^\+/.test(t), minus = /^[-−]/.test(t);
  const n = Number(t.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || t.replace(/[^0-9]/g, '') === '') return undefined; // unreadable → keep old value
  if (n === 0) return null;
  if (kind === 'income') return minus ? -n : n;
  return plus ? n : -n;
}
// What the cell shows for editing (inverse of parseEntry).
export function entryText(v, kind) {
  if (v == null || v === 0) return '';
  if (kind === 'income') return v < 0 ? `-${-v}` : String(v);
  return v > 0 ? `+${v}` : String(-v);
}

// Week to show by default: this week if the budget covers it, else the nearest week with data.
export function defaultWeek(budget, today) {
  const wk = mondayOf(today);
  const keys = weekKeys(budget);
  if (!keys.length) return wk;
  if (wk >= keys[0] && wk <= keys[keys.length - 1]) return wk;
  return wk < keys[0] ? keys[0] : keys[keys.length - 1];
}
