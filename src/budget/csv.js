// Bank CSV import (T3.3). PURE. No bank logins, ever — just the CSV a bank app exports (CLAUDE.md §3.3).
//   parseCSV(text) -> rows (string[][]), RFC 4180 quotes, CRLF, BOM
//   detectColumns(rows) -> { header, dateCol, descCol, amountCol | inCol+outCol, dayFirst } | throws a readable Error
//   toTransactions(rows, cols) -> { txns: [{ id, date, desc, amount }], bad: [{ line, reason }] }
//   merchantKey(desc), applyTransactions(budget, txns, catFor) -> { budget, added, skipped }
import { mondayOf, setEntry } from './ledger.js';

export function parseCSV(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

// "12/03/2027", "2027-03-12", "12 Mar 2027", "12-03-27" → 'YYYY-MM-DD' (dayFirst decides 03/04 ambiguity)
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(v, dayFirst = true) {
  const t = String(v ?? '').trim();
  let m, y, mo, d;
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, mo, d] = [m[1], m[2], m[3]];
  else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) [d, mo, y] = dayFirst ? [m[1], m[2], m[3]] : [m[2], m[1], m[3]];
  else if ((m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})/))) [d, mo, y] = [m[1], MON[m[2].toLowerCase()], m[3]];
  else return null;
  y = String(y).length === 2 ? 2000 + Number(y) : Number(y);
  mo = Number(mo); d = Number(d);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
// "-12.30", "(12.30)", "$1,234.56", "−5", "12.30 CR", "12.30 DR" → number (null if not a number)
export function parseAmount(v) {
  let t = String(v ?? '').trim();
  if (!t) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
  if (/\bDR$/i.test(t)) { sign = -1; t = t.replace(/\s*DR$/i, ''); }
  t = t.replace(/\s*CR$/i, '');
  if (/^[£$€A]*\$?\s*[-−]/.test(t)) sign *= -1; // "-12.30", "$-12.30", "A$ −5"
  const n = Number(t.replace(/[^0-9.]/g, ''));
  return t.replace(/[^0-9]/g, '') === '' || !Number.isFinite(n) ? null : sign * n;
}

const H = (s) => String(s ?? '').trim().toLowerCase();
const DATE_H = ['date', 'transaction date', 'posted date', 'posting date', 'value date'];
const DESC_H = ['description', 'name', 'narrative', 'details', 'merchant', 'payee', 'transaction description', 'reference'];
const AMT_H = ['amount', 'value', 'transaction amount', 'amount (gbp)', 'amount (aud)'];
const IN_H = ['credit', 'money in', 'paid in', 'credit amount', 'deposits'];
const OUT_H = ['debit', 'money out', 'paid out', 'debit amount', 'withdrawals'];

export function detectColumns(rows) {
  if (!rows.length) throw new Error('That file is empty.');
  const first = rows[0].map(H);
  const find = (names) => first.findIndex((h) => names.includes(h));
  const looksHeader = first.some((h) => DATE_H.includes(h)) && !parseDate(rows[0][first.findIndex((h) => DATE_H.includes(h))]);
  let cols;
  if (looksHeader) {
    const dateCol = find(DATE_H);
    const descCol = find(DESC_H);
    const amountCol = find(AMT_H);
    const inCol = find(IN_H), outCol = find(OUT_H);
    if (descCol < 0) throw new Error('Couldn’t find a description column (Description / Name / Narrative / Details).');
    if (amountCol < 0 && (inCol < 0 || outCol < 0)) throw new Error('Couldn’t find an Amount column, or Money in + Money out columns.');
    cols = { header: true, dateCol, descCol, amountCol: amountCol >= 0 ? amountCol : null, inCol: amountCol >= 0 ? null : inCol, outCol: amountCol >= 0 ? null : outCol };
  } else {
    // No header (e.g. CommBank: Date, Amount, Description, Balance) — infer from the first rows.
    const sample = rows.slice(0, 20);
    const width = Math.max(...sample.map((r) => r.length));
    const score = (c, fn) => sample.filter((r) => fn(r[c])).length;
    const dateCol = [...Array(width).keys()].find((c) => score(c, (v) => parseDate(v)) >= sample.length * 0.8);
    if (dateCol == null) throw new Error('Couldn’t find a date column in that file.');
    const numeric = [...Array(width).keys()].filter((c) => c !== dateCol && score(c, (v) => parseAmount(v) !== null) >= sample.length * 0.8);
    const signed = numeric.filter((c) => sample.some((r) => (parseAmount(r[c]) || 0) < 0));
    const amountCol = signed[0] ?? numeric[0];
    const descCol = [...Array(width).keys()].filter((c) => c !== dateCol && !numeric.includes(c))
      .sort((a, b) => score(b, (v) => /[a-z]/i.test(v || '')) - score(a, (v) => /[a-z]/i.test(v || '')))[0];
    if (amountCol == null || descCol == null) throw new Error('Couldn’t work out which columns are the amount and the description.');
    cols = { header: false, dateCol, descCol, amountCol, inCol: null, outCol: null };
  }
  // Day-first unless some date only makes sense month-first (e.g. 03/25/2027).
  const body = rows.slice(cols.header ? 1 : 0);
  const mdy = body.some((r) => { const m = String(r[cols.dateCol] || '').match(/^(\d{1,2})[/.-](\d{1,2})[/.-]/); return m && Number(m[2]) > 12 && Number(m[1]) <= 12; });
  return { ...cols, dayFirst: !mdy };
}

// Short, stable id for de-duplication across re-imports (date|amount|description).
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export function toTransactions(rows, cols) {
  const txns = [], bad = [];
  const seen = new Map();
  rows.slice(cols.header ? 1 : 0).forEach((r, i) => {
    const line = i + (cols.header ? 2 : 1);
    const date = parseDate(r[cols.dateCol], cols.dayFirst);
    let amount = null;
    if (cols.amountCol != null) amount = parseAmount(r[cols.amountCol]);
    else {
      const inn = parseAmount(r[cols.inCol]), out = parseAmount(r[cols.outCol]);
      if (inn != null || out != null) amount = (inn || 0) - Math.abs(out || 0);
    }
    const desc = String(r[cols.descCol] ?? '').replace(/\s+/g, ' ').trim();
    if (!date) return bad.push({ line, reason: `no readable date (“${String(r[cols.dateCol] ?? '').slice(0, 20)}”)` });
    if (amount == null) return bad.push({ line, reason: 'no readable amount' });
    if (amount === 0) return; // £0 holds / declined
    const key = `${date}|${amount.toFixed(2)}|${desc.toLowerCase()}`;
    const n = (seen.get(key) || 0) + 1; seen.set(key, n); // two identical coffees on one day are both real
    txns.push({ id: hash(`${key}|${n}`), date, desc: desc || '(no description)', amount: Math.round(amount * 100) / 100 });
  });
  return { txns, bad };
}

// "CARD PURCHASE WOOLWORTHS 1234 SYDNEY AU 12/03" → "woolworths sydney" (letters only, noise words dropped, first 2 words)
const NOISE = new Set(['card', 'purchase', 'pos', 'eftpos', 'visa', 'debit', 'credit', 'payment', 'transfer', 'to', 'from', 'value', 'date', 'au', 'aus', 'gb', 'uk', 'pty', 'ltd', 'the', 'contactless', 'apple', 'pay', 'direct']);
export function merchantKey(desc) {
  const words = String(desc).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 2).join(' ') || String(desc).toLowerCase().trim().slice(0, 20) || 'unknown';
}

// Add each transaction into its week's category total. catFor(txn) → categoryId | null (skip). Already-imported ids skipped.
export function applyTransactions(budget, txns, catFor) {
  const done = new Set(budget.imported || []);
  let b = budget, added = 0, skipped = 0;
  for (const t of txns) {
    if (done.has(t.id)) { skipped++; continue; }
    const cat = catFor(t);
    if (!cat) continue;
    const wk = mondayOf(t.date);
    const cur = Number(((b.entries || {})[wk] || {})[cat]) || 0;
    b = setEntry(b, wk, cat, cur + t.amount);
    done.add(t.id);
    added++;
  }
  return { budget: { ...b, imported: [...done] }, added, skipped };
}
