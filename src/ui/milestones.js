// Milestones for the Timeline: life stages and events on one list, each with age and projected pot.
// PURE (no DOM). Inputs: scenario (expanded), projection from projectScenario.
import { ym } from '../engine/engine.js';

const KIND_ORDER = { today: 0, stage: 1, event: 2, money: 3, end: 4 };

export function milestones(s, p) {
  const birthI = ym(s.birth);
  const endI = birthI + Math.round(s.retirementAge * 12);
  const rowAt = (at) => {
    const i = ym(at) - ym(s.start);
    return p.rows[Math.max(0, Math.min(p.rows.length - 1, i))];
  };
  const list = [];
  const add = (at, label, kind, extra = {}) => {
    const i = ym(at);
    if (i < ym(s.start) || i > endI) return;
    const r = rowAt(at);
    list.push({ at, label, kind, age: (i - birthI) / 12, pot: r ? r.pot : null, ...extra });
  };
  add(s.start, 'Today', 'today');
  for (const m of s.marks || []) add(m.at, m.label, 'stage');
  for (const o of s.oneOffs || []) add(o.at, o.name || (o.amount < 0 ? 'Big cost' : 'Money in'), 'event', { amount: o.amount });
  for (const it of s.items || []) {
    if (it.kind !== 'expense' || !it.from || it.off) continue;
    const yearly = it.annual != null ? it.annual : (it.monthly || 0) * 12;
    add(it.from, `${it.name || it.id} starts`, 'event', { amount: -yearly, per: 'yr' });
  }
  if (p.coastDate) add(p.coastDate, 'Coasting: investing becomes optional', 'money');
  if (p.depletedAt) add(p.depletedAt, 'Savings run out on these numbers', 'money', { warn: true });
  for (const l of p.lockedAtRetirement || []) list.push({ at: l.opens, label: `${l.name} unlocks`, kind: 'money', age: (ym(l.opens) - birthI) / 12, pot: null, after: true });
  const endAt = `${Math.floor(endI / 12)}-${String((endI % 12) + 1).padStart(2, '0')}`;
  add(endAt, `Stop work at ${s.retirementAge}`, 'end');
  return list.sort((a, b) => ym(a.at) - ym(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
