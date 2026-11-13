// Projection chart (T2.4) — SVG string, no libraries. PURE (no DOM).
// Layers: low–high fan (area), middle case (solid), glide path (dashed), target (thin line),
// coast-date marker (vertical), actual check-ins (dots). Values in today's money; negatives are drawn at
// the baseline (a shortfall is said in words in the readout, never drawn as a negative pot).
import { ym, fromYm } from '../engine/engine.js';
import { money, monthLabel } from './format.js';

const W = 340, H = 190;
const PAD = { l: 44, r: 10, t: 12, b: 24 };

// Yearly sample indices (first, every 12th, last).
function sampleIdx(n) {
  const out = [];
  for (let i = 0; i < n; i += 12) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// args: { mid, low, high } projections (same scenario at 3 returns), glide (glidePath), target, coastDate,
//       actuals: [{ at:'YYYY-MM', total }], currency, birth
export function chartModel({ mid, low, high, glide, target, coastDate, actuals = [], currency = 'GBP', birth }) {
  const rows = mid.rows;
  if (!rows || rows.length < 2) return null;
  const idx = sampleIdx(rows.length);
  const startI = ym(rows[0].ym);
  const n = rows.length - 1;
  const pts = idx.map((i) => ({
    i, ym: rows[i].ym, age: rows[i].age,
    mid: rows[i].pot, low: low ? low.rows[i].pot : rows[i].pot, high: high ? high.rows[i].pot : rows[i].pot,
    glide: glide ? glide.points[i]?.value ?? null : null,
  }));
  const maxV = niceMax(Math.max(target || 0, ...pts.map((p) => Math.max(p.high, p.mid, p.glide || 0)),
    ...actuals.map((a) => a.total || 0), 1));
  const x = (i) => PAD.l + (i / n) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - Math.max(0, Math.min(v, maxV)) / maxV) * (H - PAD.t - PAD.b);
  const coastI = coastDate ? Math.max(0, ym(coastDate) - startI) : null;
  const acts = actuals
    .map((a) => ({ ...a, i: ym(a.at) - startI }))
    .filter((a) => a.i >= 0 && a.i <= n && Number.isFinite(a.total));
  return { W, H, PAD, pts, maxV, x, y, n, coastI, acts, target, currency, birth, startI };
}

const f1 = (v) => v.toFixed(1);
const path = (pts, key, x, y) => pts.filter((p) => p[key] != null).map((p, k) => `${k ? 'L' : 'M'}${f1(x(p.i))} ${f1(y(p[key]))}`).join(' ');

export function chartSVG(M) {
  if (!M) return '';
  const { pts, x, y, maxV, n, coastI, acts, target, currency } = M;
  const c = (v) => money(v, currency, { compact: true });
  const fan = `M${pts.map((p) => `${f1(x(p.i))} ${f1(y(p.high))}`).join(' L')} L${pts.slice().reverse().map((p) => `${f1(x(p.i))} ${f1(y(p.low))}`).join(' L')} Z`;
  const ticks = [0, maxV / 2, maxV];
  const ageTicks = [];
  const a0 = Math.ceil(pts[0].age / 5) * 5, a1 = pts[pts.length - 1].age;
  for (let a = a0; a <= a1 + 1e-9; a += a1 - pts[0].age > 30 ? 10 : 5) {
    const i = Math.round((a - pts[0].age) * 12);
    if (i >= 0 && i <= n) ageTicks.push({ a, i });
  }
  const last = pts[pts.length - 1];
  const label = `Projection to age ${Math.round(last.age)}: middle case ${last.mid < 0 ? 'short by ' + c(-last.mid) : c(last.mid)}, range ${c(Math.max(0, last.low))} to ${c(Math.max(0, last.high))}, target ${c(target)}${coastI != null ? ', coast marker shown' : ', coast not reached'}.`;
  return `<svg class="pc" viewBox="0 0 ${M.W} ${M.H}" role="img" aria-label="${label}">
    <g class="pc-grid">${ticks.map((t) => `<line x1="${M.PAD.l}" x2="${M.W - M.PAD.r}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text x="${M.PAD.l - 6}" y="${f1(y(t) + 4)}" text-anchor="end">${c(t)}</text>`).join('')}</g>
    <g class="pc-x">${ageTicks.map((t) => `<text x="${f1(x(t.i))}" y="${M.H - 6}" text-anchor="middle">${t.a}</text>`).join('')}</g>
    <path class="pc-fan" d="${fan}"/>
    ${target > 0 ? `<line class="pc-target" x1="${M.PAD.l}" x2="${M.W - M.PAD.r}" y1="${f1(y(target))}" y2="${f1(y(target))}"/>` : ''}
    ${pts.some((p) => p.glide != null) ? `<path class="pc-glide" d="${path(pts, 'glide', x, y)}"/>` : ''}
    <path class="pc-mid" d="${path(pts, 'mid', x, y)}"/>
    ${coastI != null ? `<g class="pc-coast"><line x1="${f1(x(coastI))}" x2="${f1(x(coastI))}" y1="${M.PAD.t}" y2="${M.H - M.PAD.b}"/><text x="${f1(Math.min(x(coastI) + 4, M.W - M.PAD.r - 2))}" y="${M.PAD.t + 9}" text-anchor="${x(coastI) > M.W - 70 ? 'end' : 'start'}">${coastI === 0 ? 'Coasting now' : 'Coast'}</text></g>` : ''}
    ${acts.map((a) => `<circle class="pc-act" cx="${f1(x(a.i))}" cy="${f1(y(a.total))}" r="3.5"/>`).join('')}
    <line class="pc-rule" x1="0" x2="0" y1="${M.PAD.t}" y2="${M.H - M.PAD.b}" visibility="hidden"/>
    <rect class="pc-hit" x="${M.PAD.l}" y="0" width="${M.W - M.PAD.l - M.PAD.r}" height="${M.H}" fill="transparent"/>
  </svg>`;
}

// Readout for a tapped x (0..1 across the plot). Plain words for the aria-live line under the chart.
export function readoutAt(M, frac) {
  if (!M) return '';
  const target = Math.round(Math.max(0, Math.min(1, frac)) * M.n);
  const p = M.pts.reduce((best, q) => (Math.abs(q.i - target) < Math.abs(best.i - target) ? q : best), M.pts[0]);
  const c = (v) => (v < 0 ? `short by ${money(-v, M.currency, { compact: true })}` : money(v, M.currency, { compact: true }));
  const act = M.acts.find((a) => Math.abs(a.i - p.i) <= 6);
  return {
    i: p.i,
    text: `Age ${Math.floor(p.age)} (${monthLabel(fromYm(M.startI + p.i))}): about ${c(p.mid)}, range ${c(p.low)} – ${c(p.high)}${p.glide != null ? `; plan needs ${c(p.glide)}` : ''}${act ? `; you had ${c(act.total)}` : ''}.`,
  };
}
