// Forge planning engine — PURE functions only (no DOM, no network, no storage).
// Convention: every amount is in TODAY'S MONEY (real terms) in one base currency.
// Growth uses the REAL return = (1+nominal)/(1+inflation)-1, compounded monthly.
// See docs/ENGINE.md for the maths and docs/SPEC.md for the scenario schema.

// ---------- date helpers ('YYYY-MM' or 'YYYY-MM-DD' -> month index) ----------
import { ym, fromYm } from './dates.js';
import { accessMonth } from './pots.js';
export { ym, fromYm };

// ---------- core formulas ----------
export function realRate(nominal, inflation) {
  return (1 + nominal) / (1 + inflation) - 1;
}
export function futureValue(pv, rate, years) {
  return pv * Math.pow(1 + rate, years);
}
export function impliedRate(pv, fv, years) {
  return Math.pow(fv / pv, 1 / years) - 1;
}
// Pot needed at retirement so that (spend - other income) is sustainable at the withdrawal rate.
export function targetPot({ annualSpend, otherAnnualIncome = 0, withdrawalRate }) {
  if (!(withdrawalRate > 0)) throw new RangeError('withdrawalRate must be > 0');
  return Math.max(0, annualSpend - otherAnnualIncome) / withdrawalRate;
}
// Pot needed TODAY such that, with zero further contributions, it grows to `target`.
export function coastNumber({ target, realReturn, yearsToRetirement }) {
  if (yearsToRetirement <= 0) return target;
  return target / Math.pow(1 + realReturn, yearsToRetirement);
}
export function coastStatus({ pot, target, realReturn, yearsToRetirement }) {
  const cn = coastNumber({ target, realReturn, yearsToRetirement });
  return {
    coastNumber: cn,
    progress: cn > 0 ? pot / cn : 1,
    isCoasting: pot >= cn,
    surplus: Math.max(0, pot - cn),
    shortfall: Math.max(0, cn - pot),
  };
}

// ---------- scenario evaluation ----------
// A cash-flow item is { id, name, kind:'income'|'expense', monthly | annual | steps, from?, to? }
//   steps: [{ from:'YYYY-MM', monthly }]  -> latest step whose `from` <= month applies (pay scales)
function itemMonthly(item, i) {
  const from = item.from ? ym(item.from) : -Infinity;
  const to = item.to ? ym(item.to) : Infinity;
  if (i < from || i > to) return 0;
  if (Array.isArray(item.steps) && item.steps.length) {
    let amt = 0;
    let best = -Infinity;
    for (const st of item.steps) {
      const f = ym(st.from);
      if (f <= i && f >= best) { best = f; amt = st.monthly; }
    }
    return amt;
  }
  if (item.monthly != null) return item.monthly;
  if (item.annual != null) return item.annual / 12;
  return 0;
}

export function monthlyNet(s, i) {
  let net = 0;
  for (const it of s.items || []) {
    const v = itemMonthly(it, i);
    net += it.kind === 'expense' ? -v : v;
  }
  for (const o of s.oneOffs || []) {
    if (ym(o.at) === i) net += o.amount; // signed: + inflow, - outflow
  }
  return net;
}

// s = { start, birth, retirementAge, openingPot?, pots?, flowPot?, assumptions:{nominalReturn, inflation,
//       withdrawalRate, retirementSpend, otherRetirementIncome?, cashRealReturn?}, items?, oneOffs?,
//       investShare?, redirectAfterCoast? }
// Pots (src/engine/pots.js) must already be in the base currency. Without `pots`, `openingPot` is one
// invested, always-accessible pot — exactly the original single-pot model.
//
// Each month: every pot grows at its own real rate; per-pot contributions land in their pot; positive net
// flow goes to `flowPot` (default: first accessible invested pot); negative net flow is drawn from pots that
// are accessible THAT MONTH — cash first, then invested, then unlocked pensions/super. A locked pot is never
// drawn early: if the accessible pots run dry the shortfall shows up as a negative accessible balance and
// `depletedAt` is set, even if a locked pension is large.
function normalizePots(s) {
  if (Array.isArray(s.pots) && s.pots.length) return s.pots;
  return [{ id: 'main', name: 'Invested', kind: 'invested', balance: s.openingPot || 0 }];
}
const DRAW_ORDER = { cash: 0, invested: 1, pension: 2, super: 3 };

export function projectScenario(s) {
  const a = s.assumptions;
  const r = realRate(a.nominalReturn, a.inflation);
  const startI = ym(s.start);
  const birthI = ym(s.birth);
  const endI = birthI + Math.round(s.retirementAge * 12);
  const target = targetPot({
    annualSpend: a.retirementSpend,
    otherAnnualIncome: a.otherRetirementIncome || 0,
    withdrawalRate: a.withdrawalRate,
  });
  const share = s.investShare == null ? 1 : s.investShare;

  const defs = normalizePots(s).map((p) => {
    const pr = Number.isFinite(p.realReturn) ? p.realReturn
      : p.kind === 'cash' ? (Number.isFinite(a.cashRealReturn) ? a.cashRealReturn : 0) : r;
    return { ...p, r: pr, rm: Math.pow(1 + pr, 1 / 12) - 1, from: accessMonth(p, s.birth) };
  });
  const bal = defs.map((p) => Number(p.balance) || 0);
  const sameRate = defs.every((p) => p.r === r);
  const accessibleAt = (k, i) => i >= defs[k].from;
  let flowK = defs.findIndex((p) => p.id === s.flowPot);
  if (flowK < 0) flowK = defs.findIndex((p) => p.kind === 'invested' && p.from === -Infinity);
  if (flowK < 0) flowK = defs.findIndex((p) => p.from === -Infinity);
  if (flowK < 0) { // nothing accessible: invest into a new, empty accessible pot
    defs.push({ id: '__flow', name: 'Invested', kind: 'invested', r, rm: Math.pow(1 + r, 1 / 12) - 1, from: -Infinity });
    bal.push(0);
    flowK = defs.length - 1;
  }
  const drawOrder = defs.map((_, k) => k).sort((x, y) => (DRAW_ORDER[defs[x].kind] ?? 9) - (DRAW_ORDER[defs[y].kind] ?? 9) || x - y);

  const rows = [];
  let coastDate = null;
  let depletedAt = null; // first month the money you can actually touch goes below zero
  let freedTotal = 0;

  for (let i = startI; i <= endI; i++) {
    const yearsLeft = (endI - i) / 12;
    const cn = coastNumber({ target, realReturn: r, yearsToRetirement: yearsLeft });
    for (let k = 0; k < defs.length; k++) {
      bal[k] *= 1 + defs[k].rm;
      if (defs[k].contrib) bal[k] += itemMonthly(defs[k].contrib, i);
    }
    // "Invested-equivalent" pot: what today's balances are worth in coast terms. With one shared rate
    // this is just the total (keeps single-pot results bit-for-bit identical).
    const equiv = () => (sameRate ? bal.reduce((x, y) => x + y, 0)
      : bal.reduce((sum, b, k) => sum + b * Math.pow((1 + defs[k].r) / (1 + r), yearsLeft), 0));
    const coasting = equiv() >= cn;
    const flow = monthlyNet(s, i);
    let contribution;
    let freed = 0;
    if (flow > 0) {
      const invested = flow * share;
      freed = flow - invested; // un-invested surplus is spendable
      contribution = invested;
      if (coasting && s.redirectAfterCoast) {
        freed += invested;
        contribution = 0;
      }
      bal[flowK] += contribution;
    } else {
      contribution = flow; // drawdown
      let need = -flow;
      for (const k of drawOrder) {
        if (need <= 0) break;
        if (!accessibleAt(k, i) || bal[k] <= 0) continue;
        const take = Math.min(bal[k], need);
        bal[k] -= take;
        need -= take;
      }
      if (need > 0) bal[flowK] -= need; // shortfall: accessible money goes negative (borrowing)
    }
    freedTotal += freed;
    let pot = 0, accessible = 0, locked = 0;
    const byPot = {};
    for (let k = 0; k < defs.length; k++) {
      pot += bal[k];
      if (accessibleAt(k, i)) accessible += bal[k]; else locked += bal[k];
      byPot[defs[k].id] = bal[k];
    }
    const eq = equiv();
    if (coastDate === null && eq >= cn) coastDate = fromYm(i);
    if (depletedAt === null && accessible < 0) depletedAt = fromYm(i);
    rows.push({
      ym: fromYm(i),
      age: (i - birthI) / 12,
      pot,
      accessible,
      locked,
      byPot,
      flow,
      contribution,
      freed,
      coastNumber: cn,
      isCoasting: eq >= cn,
    });
  }

  const last = rows[rows.length - 1];
  // Pots still locked when you stop work: the accessible money has to bridge the gap until they open.
  const lockedAtRetirement = defs
    .filter((p) => p.from > endI && Math.abs(last.byPot[p.id]) > 0)
    .map((p) => ({ id: p.id, name: p.name, value: last.byPot[p.id], opens: fromYm(p.from), yearsAfterRetirement: (p.from - endI) / 12 }));
  return {
    rows,
    realReturn: r,
    target,
    coastDate,
    depletedAt,
    freedTotal,
    retirementPot: last.pot,
    accessibleAtRetirement: last.accessible,
    lockedAtRetirement,
    onTrack: last.pot >= target,
    gap: last.pot - target,
  };
}

// Coast status for a whole scenario *today*: like coastStatus(), but each pot grows at its own rate
// (cash doesn't compound like shares). `pot` is the "invested-equivalent" value of all pots.
export function scenarioCoastStatus(s) {
  const a = s.assumptions;
  const r = realRate(a.nominalReturn, a.inflation);
  const years = (ym(s.birth) + Math.round(s.retirementAge * 12) - ym(s.start)) / 12;
  const target = targetPot({ annualSpend: a.retirementSpend, otherAnnualIncome: a.otherRetirementIncome || 0, withdrawalRate: a.withdrawalRate });
  const pots = normalizePots(s);
  const pot = pots.reduce((sum, p) => {
    const pr = Number.isFinite(p.realReturn) ? p.realReturn
      : p.kind === 'cash' ? (Number.isFinite(a.cashRealReturn) ? a.cashRealReturn : 0) : r;
    const b = Number(p.balance) || 0;
    return sum + (pr === r ? b : b * Math.pow((1 + pr) / (1 + r), Math.max(0, years)));
  }, 0);
  return { ...coastStatus({ pot, target, realReturn: r, yearsToRetirement: years }), pot, target };
}

// Retirement pot under several nominal-return assumptions (e.g. [0.04, 0.07, 0.09]).
export function projectFan(s, nominalReturns) {
  return nominalReturns.map((nr) => {
    const p = projectScenario({ ...s, assumptions: { ...s.assumptions, nominalReturn: nr } });
    return { nominalReturn: nr, retirementPot: p.retirementPot, onTrack: p.onTrack };
  });
}

// Flat extra monthly contribution (today's money) needed from `start` to hit the target.
// Returns 0 if already on track, null if unreachable within a sane bound.
export function solveMonthlyContribution(s) {
  const run = (c) => projectScenario({
    ...s,
    items: [...(s.items || []), { id: '__solve', kind: 'income', monthly: c }],
    investShare: 1,
    redirectAfterCoast: false,
  });
  if (run(0).onTrack) return 0;
  let hi = 100;
  while (!run(hi).onTrack) {
    hi *= 2;
    if (hi > 1e7) return null;
  }
  let lo = 0;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (run(mid).onTrack) hi = mid; else lo = mid;
  }
  return hi;
}
