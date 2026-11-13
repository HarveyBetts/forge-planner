// Turn Harvey's budget + investments workbook into the app's budget model (D23). PURE: works on the cell maps
// from xlsx.js. Everything is found by its HEADINGS, never by fixed cell positions, so added columns/rows still work.
//   workbookToBudget({ sheets }, { today:'YYYY-MM-DD', base:'GBP' }) -> { budget, report: { lines, warnings } }
import { colToIndex } from './xlsx.js';
import { emptyBudget, mondayOf, addWeeks } from './ledger.js';
import { parseQty, parsePrice } from './investments.js';

const norm = (s) => String(s ?? '').replace(/[⁠​ ]/g, ' ').trim().toUpperCase();
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
const title = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();

function grid(cells) {
  const rows = new Map();
  for (const [ref, v] of Object.entries(cells)) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const r = Number(m[2]), c = colToIndex(m[1]);
    if (!rows.has(r)) rows.set(r, new Map());
    rows.get(r).set(c, v);
  }
  const get = (r, c) => (rows.get(r) ? rows.get(r).get(c) : undefined);
  const rowNums = [...rows.keys()].sort((a, b) => a - b);
  const find = (pred) => { for (const r of rowNums) for (const [c, v] of rows.get(r)) if (pred(v, r, c)) return { r, c }; return null; };
  const findAll = (pred) => { const out = []; for (const r of rowNums) for (const [c, v] of rows.get(r)) if (pred(v, r, c)) out.push({ r, c }); return out; };
  return { get, rowNums, rows, find, findAll };
}

// "02/11 - 08/11" → { d: 2, m: 11 };  Excel serial date → { y, d, m }
function weekStartFromLabel(v) {
  if (isNum(v) && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  const m = String(v ?? '').match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
  return { d: Number(m[1]), m: Number(m[2]), y };
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const isMonday = (s) => mondayOf(s) === s;

// Pick the year that makes the first week start on a Monday, nearest to today.
function inferYear(first, today) {
  const ty = Number(today.slice(0, 4));
  for (const y of [ty, ty - 1, ty + 1, ty - 2, ty + 2]) if (isMonday(iso(y, first.m, first.d))) return y;
  return ty;
}

function readBudgetSheet(sheet, today, report) {
  const g = grid(sheet.cells);
  const dateCell = g.find((v, r) => norm(v) === 'DATE' && [...g.rows.get(r).values()].some((x) => norm(x) === 'INCOME'));
  if (!dateCell) return null;
  const hr = dateCell.r;
  const header = [...g.rows.get(hr).entries()].sort((a, b) => a[0] - b[0]);
  const incomeCol = header.find(([, v]) => norm(v) === 'INCOME')[0];
  const totalCol = (header.find(([c, v]) => c > incomeCol && norm(v) === 'TOTAL') || [Infinity])[0];
  const cols = header.filter(([c, v]) => c >= incomeCol && c < totalCol && norm(v));
  const seen = new Set();
  const categories = cols.map(([c, v]) => {
    let id = c === incomeCol ? 'income' : slug(v);
    while (seen.has(id)) id += '-2';
    seen.add(id);
    return { id, name: title(v), kind: c === incomeCol ? 'income' : 'expense', col: c };
  });

  // Week rows: from the header down to a TOTAL row (or the first row with no date label).
  const weekRows = [];
  for (const r of g.rowNums.filter((x) => x > hr)) {
    const lab = g.get(r, dateCell.c);
    if (norm(lab) === 'TOTAL' || lab === undefined) break;
    const ws = weekStartFromLabel(lab);
    if (ws) weekRows.push({ r, ws, label: lab });
  }
  if (!weekRows.length) { report.warnings.push('Found the budget headings but no weeks under them.'); }
  const firstY = weekRows.length ? (weekRows[0].ws.y || inferYear(weekRows[0].ws, today)) : null;
  const first = weekRows.length ? mondayOf(iso(firstY, weekRows[0].ws.m, weekRows[0].ws.d)) : null;
  const entries = {};
  let mismatched = 0;
  weekRows.forEach((w, i) => {
    const key = addWeeks(first, i);
    if (Number(key.slice(8, 10)) !== w.ws.d || Number(key.slice(5, 7)) !== w.ws.m) mismatched++;
    const row = {};
    for (const c of categories) {
      const v = g.get(w.r, c.col);
      if (isNum(v) && v !== 0) row[c.id] = Math.round(v * 100) / 100;
    }
    if (Object.keys(row).length) entries[key] = row;
  });
  if (mismatched) report.warnings.push(`${mismatched} week label${mismatched === 1 ? '' : 's'} didn’t follow on week by week — the weeks were laid out in order from ${first}.`);

  // Labelled single values: the number below the label ("Current", "Premium Bonds Total").
  const below = (pred) => {
    const at = g.find((v) => typeof v === 'string' && pred(norm(v)));
    if (!at) return null;
    for (let r = at.r + 1; r <= at.r + 3; r++) { const v = g.get(r, at.c); if (isNum(v)) return v; }
    return null;
  };
  const cash = below((s) => s === 'CURRENT' || s === 'CURRENT BALANCE' || s === 'CASH');
  const bonds = below((s) => s.startsWith('PREMIUM BONDS'));

  // Bills: a name with a due day beside it ("Aus Phone | 14th", "Electricity | 4th May").
  const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const bills = [];
  for (const { r, c } of g.findAll((v) => typeof v === 'string' && /^\d{1,2}(ST|ND|RD|TH)(\s+[A-Z]{3,})?$/.test(norm(v)))) {
    const name = g.get(r, c - 1);
    if (typeof name !== 'string' || !name.trim()) continue;
    const m = norm(g.get(r, c)).match(/^(\d{1,2})(?:ST|ND|RD|TH)(?:\s+([A-Z]{3}))?/);
    bills.push({ id: slug(name), name: name.trim(), day: Number(m[1]), ...(m[2] && MONTHS[m[2]] ? { month: MONTHS[m[2]] } : {}) });
  }

  // The sheet's fortnightly "At End" table pays income two weeks late — keep that behaviour.
  const atEnd = g.find((v) => norm(v) === 'AT END');
  const hasAud = !!g.find((v) => norm(v) === 'AUD');
  return {
    categories: categories.map(({ col, ...c }) => c), entries, first, last: weekRows.length ? addWeeks(first, weekRows.length - 1) : null,
    weeks: weekRows.length, cash, bonds, bills, payLagWeeks: atEnd ? 2 : 0, currency: hasAud ? 'AUD' : null,
  };
}

function readInvestmentsSheet(sheet) {
  const g = grid(sheet.cells);
  const tickers = g.findAll((v) => norm(v) === 'TICKER');
  if (!tickers.length) return null;
  const hr = tickers[0].r;
  const head = (r, from, to) => {
    const map = {};
    for (const [c, v] of g.rows.get(r)) if (c >= from && c < to) map[norm(v)] = c;
    return map;
  };
  // Lots table = the TICKER column with FILLED QTY/SHARES + COST next to it; holdings table = the one with LIVE PRICE.
  const sorted = tickers.filter((t) => t.r === hr).sort((a, b) => a.c - b.c);
  let lotsAt = null, holdAt = null;
  sorted.forEach((t, i) => {
    const h = head(hr, t.c, sorted[i + 1] ? sorted[i + 1].c : Infinity);
    if (('LIVE PRICE' in h || 'PRICE' in h) && 'CURRENCY' in h && !holdAt) holdAt = { ...t, h };
    else if (!lotsAt && ('FILLED QTY' in h || 'SHARES' in h || 'QTY' in h)) lotsAt = { ...t, h };
  });
  const prices = {};
  if (holdAt) {
    const { h } = holdAt;
    for (const r of g.rowNums.filter((x) => x > hr)) {
      const t = norm(g.get(r, holdAt.c));
      if (!t) continue;
      const price = g.get(r, h['LIVE PRICE'] ?? h.PRICE);
      const cur = norm(g.get(r, h.CURRENCY));
      if (isNum(price)) prices[t] = { price, currency: cur === 'GBP' && /p$/.test(String(g.get(r, h.CURRENCY))) ? 'GBX' : (cur || null), ...(h.COMPANY ? { name: String(g.get(r, h.COMPANY) ?? '').trim() || undefined } : {}) };
    }
  }
  const lots = [];
  if (lotsAt) {
    const { h } = lotsAt;
    const qc = h['FILLED QTY'] ?? h.SHARES ?? h.QTY;
    const pc = h.AMOUNT ?? h.PRICE;
    const cc = Object.entries(h).find(([k]) => k.startsWith('COST'))?.[1];
    for (const r of g.rowNums.filter((x) => x > hr)) {
      const t = norm(g.get(r, lotsAt.c));
      if (!t) continue;
      const shares = parseQty(g.get(r, qc));
      const p = pc != null ? parsePrice(g.get(r, pc), prices[t]?.currency || null) : null;
      const cost = g.get(r, cc);
      if (!(shares > 0)) continue;
      lots.push({ ticker: t, shares, price: p ? p.amount : null, currency: (p && p.currency) || prices[t]?.currency || 'GBP', costGBP: isNum(cost) ? cost : parseQty(cost) || 0 });
    }
  }
  return { lots, prices };
}

export function workbookToBudget(wb, { today, base = 'GBP' } = {}) {
  if (!today) throw new Error('workbookToBudget needs today (YYYY-MM-DD)');
  const report = { lines: [], warnings: [] };
  let b = null, inv = null;
  for (const s of wb.sheets || []) {
    if (!b) { const r = readBudgetSheet(s, today, report); if (r) { b = r; report.lines.push(`Budget from sheet “${s.name}”.`); continue; } }
    if (!inv) { const r = readInvestmentsSheet(s); if (r && (r.lots.length || Object.keys(r.prices).length)) { inv = r; report.lines.push(`Investments from sheet “${s.name}”.`); } }
  }
  if (!b && !inv) throw new Error('Couldn’t find a budget (headings DATE and INCOME) or investments (heading TICKER) in that file.');
  const budget = emptyBudget(b?.currency || base);
  if (b) {
    Object.assign(budget, { categories: b.categories, entries: b.entries, openingAt: b.first, payLagWeeks: b.payLagWeeks, bills: b.bills });
    if (isNum(b.cash)) budget.openingCash = b.cash;
    else report.warnings.push('No “Current” balance found — your cash forecast starts from 0.');
    if (isNum(b.bonds)) budget.extras.push({ id: 'premium-bonds', name: 'Premium Bonds', currency: 'GBP', amount: b.bonds });
    report.lines.push(`${b.weeks} weeks (${b.first} to ${b.last}), ${b.categories.length} categories.`);
    if (b.bills.length) report.lines.push(`${b.bills.length} bills with due days.`);
    if (b.payLagWeeks) report.lines.push('Pay lands 2 weeks after it’s earned, as in your sheet’s “At End” table.');
  }
  if (inv) {
    budget.holdings = { lots: inv.lots, prices: Object.fromEntries(Object.entries(inv.prices).map(([t, p]) => [t, { ...p, at: today, source: 'spreadsheet' }])) };
    const tick = new Set(inv.lots.map((l) => l.ticker));
    const unpriced = [...tick].filter((t) => !inv.prices[t]);
    report.lines.push(`${inv.lots.length} purchases across ${tick.size} holdings.`);
    if (unpriced.length) report.warnings.push(`No saved price for ${unpriced.join(', ')} — add one in Investments.`);
  }
  return { budget, report };
}
