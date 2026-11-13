// Forge planning engine — PURE functions only (no DOM, no network, no storage).
// Convention: every amount is in TODAY'S MONEY (real terms) in one base currency.
// Growth uses the REAL return = (1+nominal)/(1+inflation)-1, compounded monthly.
// See docs/ENGINE.md for the maths and docs/SPEC.md for the scenario schema.

// ---------- date helpers ('YYYY-MM' or 'YYYY-MM-DD' -> month index) ----------
export function ym(dateStr) {
  const parts = String(dateStr).split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new RangeError('Bad date: ' + dateStr);
  }
  return y * 12 + (m - 1);
}
export function fromYm(i) {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return y + '-' + String(m).padStart(2, '0');
}

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

// s = { start, birth, retirementAge, openingPot, assumptions:{nominalReturn, inflation, withdrawalRate,
//       retirementSpend, otherRetirementIncome?}, items?, oneOffs?, investShare?, redirectAfterCoast? }
export function projectScenario(s) {
  const a = s.assumptions;
  const r = realRate(a.nominalReturn, a.inflation);
  const rm = Math.pow(1 + r, 1 / 12) - 1;
  const startI = ym(s.start);
  const birthI = ym(s.birth);
  const endI = birthI + Math.round(s.retirementAge * 12);
  const target = targetPot({
    annualSpend: a.retirementSpend,
    otherAnnualIncome: a.otherRetirementIncome || 0,
    withdrawalRate: a.withdrawalRate,
  });
  const share = s.investShare == null ? 1 : s.investShare;

  const rows = [];
  let pot = s.openingPot || 0;
  let coastDate = null;
  let depletedAt = null; // first month the pot goes below zero (costs outgrew savings)
  let freedTotal = 0;

  for (let i = startI; i <= endI; i++) {
    const yearsLeft = (endI - i) / 12;
    const cn = coastNumber({ target, realReturn: r, yearsToRetirement: yearsLeft });
    const grown = pot * (1 + rm);
    const coasting = grown >= cn;
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
    } else {
      contribution = flow; // drawdown
    }
    freedTotal += freed;
    pot = grown + contribution;
    if (coastDate === null && pot >= cn) coastDate = fromYm(i);
    if (depletedAt === null && pot < 0) depletedAt = fromYm(i);
    rows.push({
      ym: fromYm(i),
      age: (i - birthI) / 12,
      pot,
      flow,
      contribution,
      freed,
      coastNumber: cn,
      isCoasting: pot >= cn,
    });
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    realReturn: r,
    target,
    coastDate,
    depletedAt,
    freedTotal,
    retirementPot: last.pot,
    onTrack: last.pot >= target,
    gap: last.pot - target,
  };
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
