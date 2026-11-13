// Weekly budget ledger — the model of Harvey's BUDGET sheet (D23). PURE: no DOM, storage or network.
//
// Budget shape:
//   { v:1, currency:'AUD', categories:[{ id, name, kind:'income'|'expense' }],
//     entries: { 'YYYY-MM-DD'(Monday): { [categoryId]: signed amount } },   money in +, money out −
//     openingCash, openingAt:'YYYY-MM-DD' (Monday the balance applies from), payLagWeeks (income lands N weeks late),
//     bills:[{ id, name, day:1–31, month?:1–12, amount? }], holdings: see investments.js, extras:[{ id, name, currency, amount }] }
// A week's total is simply the sum of its row (like the sheet's TOTAL column).

const DAY = 86400000;
// Round to pennies symmetrically (−12.345 → −12.35, like a person would), never producing −0.
export const round2 = (x) => { const r = Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100; return r === 0 ? 0 : r; };
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

export function mondayOf(date) {
  const d = typeof date === 'string' ? parse(date) : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return iso(new Date(d.getTime() - dow * DAY));
}
export function addWeeks(monday, n) { return iso(new Date(parse(monday).getTime() + n * 7 * DAY)); }
export function weeksBetween(a, b) { return Math.round((parse(b) - parse(a)) / (7 * DAY)); }
export function weekLabel(monday) {
  const s = parse(monday), e = new Date(s.getTime() + 6 * DAY);
  const f = (d) => `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  return `${f(s)} – ${f(e)}`;
}

export function emptyBudget(currency = 'AUD') {
  return { v: 1, currency, categories: [], entries: {}, openingCash: 0, openingAt: null, payLagWeeks: 0, bills: [], holdings: { lots: [], prices: {} }, extras: [] };
}
export const STARTER_CATEGORIES = [
  ['income', 'Income', 'income'], ['rent', 'Rent', 'expense'], ['food', 'Food', 'expense'], ['transport', 'Transport', 'expense'],
  ['bills', 'Bills', 'expense'], ['fun', 'Fun', 'expense'], ['other', 'Other', 'expense'],
].map(([id, name, kind]) => ({ id, name, kind }));

export function weekKeys(budget) {
  return Object.keys(budget.entries || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
}
export function weekRow(budget, monday) {
  const row = (budget.entries || {})[monday] || {};
  let income = 0, out = 0, inOther = 0;
  for (const c of budget.categories) {
    const v = Number(row[c.id]) || 0;
    if (c.kind === 'income') income += v;
    else if (v < 0) out += v; else inOther += v; // refunds etc. in an expense column count as money in
  }
  return { income: round2(income), spent: round2(-out), otherIn: round2(inOther), total: round2(income + out + inOther) };
}
export function setEntry(budget, monday, catId, amount) {
  const entries = { ...(budget.entries || {}) };
  const row = { ...(entries[monday] || {}) };
  if (amount === null || amount === '' || !Number.isFinite(Number(amount)) || Number(amount) === 0) delete row[catId];
  else row[catId] = round2(Number(amount));
  if (Object.keys(row).length) entries[monday] = row; else delete entries[monday];
  return { ...budget, entries };
}
export function categoryTotals(budget, fromMonday = null, toMonday = null) {
  const out = Object.fromEntries(budget.categories.map((c) => [c.id, 0]));
  for (const k of weekKeys(budget)) {
    if ((fromMonday && k < fromMonday) || (toMonday && k > toMonday)) continue;
    for (const [id, v] of Object.entries(budget.entries[k])) if (id in out) out[id] += Number(v) || 0;
  }
  return out;
}

// Cash balance after each week, from openingCash at openingAt. Non-income money moves in its own week;
// income lands `payLagWeeks` later (Harvey's sheet: earned in a fortnight, paid at the end of the next).
// → [{ week, balance, moved }] for every week from openingAt to the last week with data (+ lag).
export function cashForecast(budget) {
  const keys = weekKeys(budget);
  const start = budget.openingAt || keys[0];
  if (!start) return [];
  const lag = Math.max(0, Math.round(budget.payLagWeeks || 0));
  const last = keys.length ? addWeeks(keys[keys.length - 1], lag) : start;
  const incomeIds = new Set(budget.categories.filter((c) => c.kind === 'income').map((c) => c.id));
  const n = Math.max(0, weeksBetween(start, last)) + 1;
  const moved = new Array(n).fill(0);
  for (const k of keys) {
    for (const [id, v] of Object.entries(budget.entries[k])) {
      const w = weeksBetween(start, k) + (incomeIds.has(id) ? lag : 0);
      if (w >= 0 && w < n) moved[w] += Number(v) || 0;
    }
  }
  let bal = Number(budget.openingCash) || 0;
  return moved.map((m, i) => { bal += m; return { week: addWeeks(start, i), balance: round2(bal), moved: round2(m) }; });
}
// Every Nth week (default fortnightly), as the sheet's "At End" rows: [{ end:'YYYY-MM-DD'(Sunday), balance, change }]
export function forecastBy(budget, everyWeeks = 2) {
  const f = cashForecast(budget);
  const out = [];
  let prev = Number(budget.openingCash) || 0;
  for (let i = everyWeeks - 1; i < f.length; i += everyWeeks) {
    const end = iso(new Date(parse(f[i].week).getTime() + 6 * DAY));
    out.push({ end, balance: f[i].balance, change: round2(f[i].balance - prev) });
    prev = f[i].balance;
  }
  return out;
}

// Next due date for each bill on/after `today` ('YYYY-MM-DD'). Monthly bills use `day` (clamped to the month's
// length); yearly bills also have `month`. → sorted [{ ...bill, due:'YYYY-MM-DD', inDays }]
export function upcomingBills(bills, today) {
  const t = parse(today);
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = [];
  for (const b of bills || []) {
    if (!(b.day >= 1 && b.day <= 31)) continue;
    let y = t.getUTCFullYear(), m = b.month ? b.month - 1 : t.getUTCMonth();
    let d = new Date(Date.UTC(y, m, Math.min(b.day, dim(y, m))));
    if (d < t) {
      if (b.month) y += 1; else { m += 1; if (m > 11) { m = 0; y += 1; } }
      d = new Date(Date.UTC(y, m, Math.min(b.day, dim(y, m))));
    }
    out.push({ ...b, due: iso(d), inDays: Math.round((d - t) / DAY) });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}
