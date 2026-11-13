// Pure formatting helpers for the UI (testable in Node).
import { optLabel } from '../onboarding/questions.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Escape ANY user-provided text before it goes into an HTML template.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const SYM = { GBP: '£', AUD: 'A$' };
export function money(amount, currency = 'GBP', { compact = false } = {}) {
  const n = Number(amount) || 0;
  const sym = SYM[currency] || '';
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (compact && a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (compact && a >= 1e4) return `${sign}${sym}${Math.round(a / 1e3)}k`;
  return `${sign}${sym}${Math.round(a).toLocaleString('en-GB')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(s) {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return String(s ?? '');
  const [y, m] = s.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function currentMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PER = { mo: '/mo', yr: '/yr', wk: '/wk', once: '' };

// One-line summary of a saved answer for the review list.
export function summarize(def, rec) {
  if (!rec) return '';
  if (rec.unknown) return 'Don’t know';
  const val = rec.v;
  const sub = (f, x) => {
    if (x === undefined || x === null || x === '') return null;
    if (f.type === 'money') return x && Number.isFinite(x.amount) ? money(x.amount, x.currency) + (PER[f.per] || '') : null;
    if (f.type === 'month') return monthLabel(x);
    if (f.type === 'percent') return `${x}%`;
    if (f.type === 'choice') {
      const o = (f.opts || []).find((o2) => (typeof o2 === 'string' ? o2 : o2.v) === x);
      return o ? optLabel(o) : String(x);
    }
    if (f.type === 'multi') return x.join(', ');
    if (f.type === 'scale') return `${x} / 5`;
    if (f.type === 'number') {
      if (!(def.unit && f === def)) return String(x);
      return def.unit === 'age' ? `Age ${x}` : `${x} ${def.unit}`;
    }
    return String(x);
  };
  if (def.type === 'fields') {
    return def.fields.map((f) => { const s = sub(f, val && val[f.k]); return s ? `${f.label}: ${s}` : null; })
      .filter(Boolean).join(' · ');
  }
  return sub(def, val) ?? '';
}

// 58.25 -> "58 and 3 months"; 58 -> "58".
export function ageLabel(age) {
  const total = Math.round(Number(age) * 12);
  const y = Math.floor(total / 12), mo = total % 12;
  return mo ? `${y} and ${mo} month${mo === 1 ? '' : 's'}` : String(y);
}
// 0.0725 -> "7.3%"; 0.07 -> "7%".
export function pct(x, dp = 1) {
  const v = (Number(x) || 0) * 100;
  return `${Number(v.toFixed(dp))}%`;
}
