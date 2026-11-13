// Paste-in import (T2.2e): answers typed in the "Forge intake" doc as numbered lines → a preview the user
// confirms before anything is saved. PURE. Tolerant of messy input; anything it can't read is reported,
// never guessed into a wrong answer.
//
//   parsePastedAnswers(text, { base }) -> { entries: [{ n, id, raw, value?, unknown?, error?, note? }], problems: [...] }
//   entriesToAnswers(entries) -> { [id]: { v } | { unknown: true } }   (only the readable ones)
import { QUESTIONS, optValue, optLabel } from './questions.js';
import { validateValue } from './answers.js';

const BY_N = Object.fromEntries(QUESTIONS.map((q) => [q.n, q]));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9$£%'.\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const UNKNOWN_RE = /^(don'?t know|do not know|dont know|dk|idk|not sure|unsure|\?+|skip|skipped|n\/?a|unknown|tbc|tbd|-+)$/i;

// ---------------- value readers ----------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const fullYear = (y) => (y.length === 2 ? (Number(y) <= 50 ? 2000 + Number(y) : 1900 + Number(y)) : Number(y));
const fmtMonth = (y, m) => (m >= 1 && m <= 12 && y >= 1900 && y <= 2100 ? `${y}-${String(m).padStart(2, '0')}` : null);

export function readMonth(text) {
  const t = String(text).trim().toLowerCase();
  let m;
  if ((m = t.match(/\b(\d{4})[-/.](\d{1,2})\b/))) return fmtMonth(Number(m[1]), Number(m[2]));
  if ((m = t.match(/\b(\d{1,2})[-/.](\d{4})\b/))) return fmtMonth(Number(m[2]), Number(m[1]));
  if ((m = t.match(/\b(\d{1,2})[/](\d{1,2})[/](\d{2,4})\b/))) return fmtMonth(fullYear(m[3]), Number(m[2])); // dd/mm/yyyy (UK)
  if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?,?\s+'?(\d{4}|\d{2})\b/))) return fmtMonth(fullYear(m[2]), MONTHS[m[1]]);
  return null;
}

export function readNumber(text) {
  const m = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// "£50k", "A$15,200", "15200 aud", "$1.2m", "50,000 a year" → { amount, currency }
export function readMoney(text, defaultCurrency = 'GBP') {
  const t = String(text).toLowerCase();
  const m = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|m|mil|million|thousand|grand)?\b/);
  if (!m) return null;
  let amount = Number(m[1]);
  const unit = m[2];
  if (unit === 'k' || unit === 'thousand' || unit === 'grand') amount *= 1e3;
  if (unit === 'm' || unit === 'mil' || unit === 'million') amount *= 1e6;
  let currency = defaultCurrency;
  let note;
  if (/£|gbp|pound|quid/.test(t)) currency = 'GBP';
  else if (/a\$|aud|aussie|australian/.test(t)) currency = 'AUD';
  else if (/\$/.test(t)) { currency = 'AUD'; note = '“$” read as Aussie dollars.'; }
  return { value: { amount: Math.round(amount * 100) / 100, currency }, note };
}

// Match free text to one option. Returns { value } | { error }.
export function readChoice(text, opts) {
  const t = norm(text);
  if (!t) return { error: 'Empty answer.' };
  const list = (opts || []).map((o) => ({ v: optValue(o), keys: [norm(optValue(o)), norm(optLabel(o))] }));
  const alias = { y: 'yes', yep: 'yes', yeah: 'yes', n: 'no', nope: 'no' };
  const tt = alias[t] || t;
  const tiers = [
    (k) => k === tt,
    (k) => k.startsWith(tt) && tt.length >= 2,
    (k) => tt.startsWith(k) && k.length >= 2,
    (k) => tt.length >= 3 && k.includes(tt),
  ];
  for (const tier of tiers) {
    const hits = list.filter((o) => o.keys.some(tier));
    const uniq = [...new Set(hits.map((h) => h.v))];
    if (uniq.length === 1) return { value: uniq[0] };
    if (uniq.length > 1) return { error: `Could be ${uniq.map((u) => `“${u}”`).join(' or ')} — answer this one in the app.` };
  }
  return { error: `Didn’t match any option (${list.map((o) => o.v).join(' / ')}).` };
}

// ---------------- per-question reader ----------------
function readField(f, text, base) {
  const t = String(text).trim();
  if (!t) return { skip: true };
  if (f.type === 'money') { const r = readMoney(t, f.currency || base); return r ? r : { error: `${f.label}: no amount found.` }; }
  if (f.type === 'month') { const r = readMonth(t); return r ? { value: r } : { error: `${f.label}: couldn’t read a month and year.` }; }
  if (f.type === 'number' || f.type === 'percent') { const r = readNumber(t); return r != null ? { value: r } : { error: `${f.label}: no number found.` }; }
  if (f.type === 'choice') { const r = readChoice(t, f.opts); return r.error ? { error: `${f.label}: ${r.error}` } : r; }
  return { value: t };
}

export function readAnswer(def, raw, { base = 'GBP' } = {}) {
  // Echoed question text: keep what follows the last "?" if there's something there.
  let text = String(raw).trim();
  const q = text.lastIndexOf('?');
  if (q >= 0 && q < text.length - 1 && norm(text.slice(0, q)).length > 8) text = text.slice(q + 1).trim();
  if (!text) return { error: 'No answer given.' };

  const t = def.type;
  // A real option called "Not sure" beats the don't-know shortcut.
  if (UNKNOWN_RE.test(text) && !(t === 'choice' && readChoice(text, def.opts).value)) return { unknown: true };

  let out;
  if (t === 'text' || t === 'longtext') out = { value: text };
  else if (t === 'month') { const m = readMonth(text); out = m ? { value: m } : { error: 'Couldn’t read a month and year (e.g. “March 1997”).' }; }
  else if (t === 'number' || t === 'percent') { const n = readNumber(text); out = n != null ? { value: n } : { error: 'No number found.' }; }
  else if (t === 'scale') { const n = readNumber(text); out = n != null ? { value: Math.round(n) } : { error: 'Give a number from 1 to 5.' }; }
  else if (t === 'money') { const r = readMoney(text, def.currency || base); out = r || { error: 'No amount found.' }; }
  else if (t === 'choice') out = readChoice(text, def.opts);
  else if (t === 'multi') {
    const parts = text.split(/\s*(?:,|;|\/|\band\b|&)\s*/i).filter(Boolean);
    const vals = [];
    for (const p of parts) {
      const r = readChoice(p, def.opts);
      if (r.error) return { error: `“${p}”: ${r.error}` };
      if (!vals.includes(r.value)) vals.push(r.value);
    }
    out = { value: vals };
  } else if (t === 'fields') out = readFields(def, text, base);
  else out = { error: 'Unsupported question type.' };

  if (out.error || out.unknown) return out;
  const err = validateValue(def, out.value);
  return err ? { error: err } : out;
}

// "How many: 2; age at first: 33; gap 2"  or positional "2, 33, 2" (only when the count matches exactly).
function readFields(def, text, base) {
  const segs = text.split(/\s*(?:;|\n|\|)\s*|,\s*(?=[a-z][a-z ()£$%]*\s*[:=])/i).map((x) => x.trim()).filter(Boolean);
  const value = {};
  const notes = [];
  const labelled = segs.filter((sg) => /[:=]/.test(sg));
  if (labelled.length) {
    for (const sg of labelled) {
      const [kRaw, ...rest] = sg.split(/[:=]/);
      const k = norm(kRaw);
      const f = def.fields.find((x) => norm(x.k) === k || norm(x.label) === k)
        || def.fields.find((x) => norm(x.label).startsWith(k) || k.startsWith(norm(x.label)))
        || def.fields.find((x) => k.length >= 3 && norm(x.label).includes(k));
      if (!f) return { error: `Didn’t recognise “${kRaw.trim()}” (expected ${def.fields.map((x) => x.label).join(', ')}).` };
      const r = readField(f, rest.join(':'), base);
      if (r.error) return r;
      if (r.note) notes.push(r.note);
      if (!r.skip) value[f.k] = r.value;
    }
  } else {
    const parts = text.split(/\s*[,;]\s*/).filter(Boolean);
    if (parts.length !== def.fields.length) {
      return { error: `Label each part, e.g. “${def.fields.map((x) => `${x.label}: …`).join('; ')}”.` };
    }
    for (let i = 0; i < parts.length; i++) {
      const r = readField(def.fields[i], parts[i], base);
      if (r.error) return r;
      if (r.note) notes.push(r.note);
      if (!r.skip) value[def.fields[i].k] = r.value;
    }
    notes.push('Read in order — check each part.');
  }
  return notes.length ? { value, note: notes.join(' ') } : { value };
}

// ---------------- the whole paste ----------------
const LINE_RE = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-–—]\s*(.*)$/i;
const QLINE_RE = /^\s*q(?:uestion)?\s*(\d{1,3})\s+(.*)$/i;

export function parsePastedAnswers(text, { base } = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const raw = []; // { n, text, line }
  const problems = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(LINE_RE) || line.match(QLINE_RE);
    if (m) raw.push({ n: Number(m[1]), text: m[2], line: i + 1 });
    else if (raw.length) raw[raw.length - 1].text += '\n' + line.trim(); // wrapped / multi-line answer
    else problems.push({ line: i + 1, message: `Line ${i + 1} doesn’t start with a question number, so it was ignored.` });
  });
  // Base currency for money without a symbol: q7 in the paste wins, then the caller's.
  const q7 = raw.filter((r) => r.n === 7).pop();
  const b = (q7 && readChoice(q7.text, BY_N[7].opts).value) || base || 'GBP';

  const byN = new Map();
  for (const r of raw) {
    if (byN.has(r.n)) problems.push({ line: r.line, message: `Question ${r.n} appears more than once — the last one is used.` });
    byN.set(r.n, r);
  }
  const entries = [];
  for (const [n, r] of [...byN.entries()].sort((x, y) => x[0] - y[0])) {
    const def = BY_N[n];
    if (!def) { problems.push({ line: r.line, message: `There’s no question ${n}.` }); continue; }
    entries.push({ n, id: def.id, raw: r.text.trim(), ...readAnswer(def, r.text, { base: b }) });
  }
  return { entries, problems };
}

export function entriesToAnswers(entries) {
  const out = {};
  for (const e of entries || []) {
    if (e.error) continue;
    out[e.id] = e.unknown ? { unknown: true } : { v: e.value };
  }
  return out;
}
