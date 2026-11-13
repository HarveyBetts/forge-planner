// Monthly check-in (T3.1). PURE helpers: which pots to ask about, turning typed values into q49, and the history.
import { monthLabel } from './format.js';

// The pots question 49 asks about, with their fixed currencies (other follows the base currency).
export function checkinFields(base = 'GBP') {
  return [
    { k: 'cashGBP', label: 'Cash (£)', currency: 'GBP' },
    { k: 'cashAUD', label: 'Cash (A$)', currency: 'AUD' },
    { k: 'isa', label: 'Stocks ISA', currency: 'GBP' },
    { k: 'super', label: 'Australian super', currency: 'AUD' },
    { k: 'other', label: 'Anything else', currency: base },
  ];
}
// values: { cashGBP: '1,200', isa: '' ... } → q49 object (blank = remove that pot; unreadable = keep the old one)
export function valuesToQ49(values, old = {}, base = 'GBP') {
  const out = { ...old };
  for (const f of checkinFields(base)) {
    if (!(f.k in values)) continue;
    const raw = String(values[f.k] ?? '').trim();
    if (raw === '') { delete out[f.k]; continue; }
    const n = Number(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || raw.replace(/[^0-9]/g, '') === '') continue;
    out[f.k] = { amount: Math.round(n * 100) / 100, currency: f.currency };
  }
  return out;
}
// Snapshot to store: { at, pots, total (invested-equivalent, base currency), status, need }
export function makeSnapshot(at, q49, summary, equivPot) {
  return { at, pots: q49, total: Math.round(equivPot), status: summary.status, need: Math.round(Math.max(0, summary.needToday)) };
}
// "Up £2.1k since Sep 2026" style trend between the last two snapshots.
export function trend(snaps, fmt) {
  if (!snaps || snaps.length < 2) return '';
  const [a, b] = snaps.slice(-2);
  const d = b.total - a.total;
  if (Math.abs(d) < 1) return `No change since ${monthLabel(a.at)}`;
  return `${d > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(d))} since ${monthLabel(a.at)}`;
}
// Back-up reminder: nudge if never, or more than `days` ago (SECURITY.md rule 9: remind monthly).
export function backupDue(lastBackupAt, now = Date.now(), days = 30) {
  if (!lastBackupAt) return true;
  const t = Date.parse(lastBackupAt);
  return !Number.isFinite(t) || now - t > days * 86400000;
}
