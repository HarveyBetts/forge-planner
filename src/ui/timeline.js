// Timeline scrubber model (T2.5). PURE.
//   timelineModel(s, res, list) -> { n, stops, at(i) }   (i = months from today, 0..n)
// `list` is milestones(s, res). Stops are the markers on the track; at(i) is the readout for a position.
import { ym, fromYm, monthlyNet } from '../engine/engine.js';
import { money, monthLabel } from './format.js';

export function timelineModel(s, res, list) {
  const startI = ym(s.start);
  const n = res.rows.length - 1;
  const stops = list
    .map((m) => ({ ...m, i: ym(m.at) - startI }))
    .filter((m) => m.i >= 0 && m.i <= n && !m.after);
  const stages = stops.filter((m) => m.kind === 'stage' || m.kind === 'today');
  function at(i) {
    const k = Math.max(0, Math.min(n, Math.round(i)));
    const row = res.rows[k];
    const stage = stages.filter((m) => m.i <= k).pop();
    const here = stops.filter((m) => m.i === k);
    const recent = stops.filter((m) => m.i <= k && m.kind !== 'today').pop();
    return {
      i: k, ym: row.ym, age: row.age, pot: row.pot, flow: monthlyNet(s, startI + k),
      stage: stage ? stage.label : 'Today', here, recent,
    };
  }
  return { n, stops, at, currency: s.baseCurrency || 'GBP' };
}

// One-line text for aria-valuetext / screen readers.
export function readoutText(r, currency = 'GBP') {
  const pot = r.pot < 0 ? `short by ${money(-r.pot, currency, { compact: true })}` : money(r.pot, currency, { compact: true });
  return `${monthLabel(r.ym)}, age ${Math.floor(r.age)}: pot about ${pot}. ${r.stage}.`;
}

// Nearest stop to jump to from position i in direction dir (+1 / −1); null if none.
export function nextStop(model, i, dir) {
  const xs = model.stops.map((m) => m.i).filter((x) => (dir > 0 ? x > i : x < i));
  if (!xs.length) return null;
  return dir > 0 ? Math.min(...xs) : Math.max(...xs);
}
