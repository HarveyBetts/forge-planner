// Life-event templates. PURE: applyEvent(scenario, event) returns a NEW scenario with the event's cash flows
// added as ordinary `items` / `oneOffs` (tagged with `eventId`), so the engine never needs to know about events.
//
// Conventions (same as the engine): amounts are TODAY'S money in the base currency; costs are given as
// positive numbers here and become expenses / negative one-offs; month ranges are inclusive; an "age X to Y"
// range runs from the month of the Xth birthday to the month BEFORE the Yth birthday.
//
// Rule (CLAUDE.md §3.1): every money figure is a parameter the user supplies. Templates never fill in a
// salary, fee or price. Missing figures are reported by eventProblems(), not guessed.
import { ym, fromYm } from './dates.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isMonth = (x) => typeof x === 'string' && MONTH_RE.test(x);
export const addMonths = (s, n) => fromYm(ym(s) + Math.round(n));
export const addYears = (s, y) => addMonths(s, Math.round(y * 12));

// ---------------- template definitions ----------------
// Each: { label, defaults, problems(params) -> string[], build(params, scenario) -> { items, oneOffs, patchItems? } }
export const TEMPLATES = {
  // BA Speedbird Pilot Academy: training, then a reduced salary for N years, then the main First Officer scale.
  // params: courseStart ('2027-09'), trainingMonths (18), reducedScaleYears (5),
  //   salarySteps: [{ stage:'training'|'reduced'|'main', yearsIn?: number, monthly }]  ← take-home, USER INPUT
  //   trainingCosts: [{ name?, amount, monthsIn? }   one-off, monthsIn after course start (default 0)
  //                   | { name?, monthly }]          every month of training
  //   replaces: [itemId]   income items that stop the month before the course starts (e.g. current job)
  speedbirdPathway: {
    label: 'Speedbird pilot pathway',
    defaults: { courseStart: '2027-09', trainingMonths: 18, reducedScaleYears: 5, salarySteps: [], trainingCosts: [], replaces: [] },
    problems(p) {
      const out = [];
      if (!isMonth(p.courseStart)) out.push('Course start must be a month (YYYY-MM).');
      if (!(isNum(p.trainingMonths) && p.trainingMonths > 0 && p.trainingMonths <= 60)) out.push('Training length must be 1–60 months.');
      if (!(isNum(p.reducedScaleYears) && p.reducedScaleYears >= 0 && p.reducedScaleYears <= 20)) out.push('Reduced-scale years must be 0–20.');
      (p.salarySteps || []).forEach((st, i) => {
        if (!['training', 'reduced', 'main'].includes(st && st.stage)) out.push(`Salary step ${i + 1}: stage must be training, reduced or main.`);
        if (!(isNum(st && st.monthly) && st.monthly >= 0)) out.push(`Salary step ${i + 1}: enter a monthly take-home amount.`);
        if (st && st.yearsIn != null && !(isNum(st.yearsIn) && st.yearsIn >= 0)) out.push(`Salary step ${i + 1}: years in must be 0 or more.`);
      });
      (p.trainingCosts || []).forEach((c, i) => {
        const ok = (isNum(c && c.amount) && c.amount >= 0) || (isNum(c && c.monthly) && c.monthly >= 0);
        if (!ok) out.push(`Training cost ${i + 1}: enter an amount or a monthly cost.`);
        if (c && c.monthsIn != null && !(isNum(c.monthsIn) && c.monthsIn >= 0)) out.push(`Training cost ${i + 1}: months in must be 0 or more.`);
      });
      return out;
    },
    build(p) {
      const foStart = addMonths(p.courseStart, p.trainingMonths);
      const mainStart = addYears(foStart, p.reducedScaleYears);
      const stageStart = { training: p.courseStart, reduced: foStart, main: mainStart };
      const items = [];
      const oneOffs = [];
      const steps = (p.salarySteps || [])
        .map((st) => ({ from: addYears(stageStart[st.stage], st.yearsIn || 0), monthly: st.monthly }))
        .sort((a, b) => ym(a.from) - ym(b.from));
      if (steps.length) {
        items.push({ id: 'speedbird-salary', name: 'Pilot salary (take-home)', kind: 'income', steps, from: steps[0].from });
      }
      (p.trainingCosts || []).forEach((c, i) => {
        if (isNum(c.monthly)) {
          items.push({ id: `speedbird-cost-${i + 1}`, name: c.name || 'Training costs', kind: 'expense', monthly: c.monthly,
            from: p.courseStart, to: addMonths(foStart, -1) });
        } else {
          oneOffs.push({ at: addMonths(p.courseStart, c.monthsIn || 0), amount: -c.amount, name: c.name || 'Training cost' });
        }
      });
      const patchItems = (p.replaces || []).map((id) => ({ id, to: addMonths(p.courseStart, -1) }));
      return { items, oneOffs, patchItems, marks: { courseStart: p.courseStart, foStart, mainStart } };
    },
  },

  // A child. params: birth, costBands: [{ fromAge, toAge, annual }]  ← USER INPUT,
  //   school?: { fromAge, toAge, annualFee }  ← USER INPUT, name?
  child: {
    label: 'Child',
    defaults: { birth: null, costBands: [], school: null, name: 'Child' },
    problems(p) {
      const out = [];
      if (!isMonth(p.birth)) out.push('Birth must be a month (YYYY-MM).');
      const band = (b, what) => {
        if (!(isNum(b && b.fromAge) && isNum(b.toAge) && b.fromAge >= 0 && b.toAge > b.fromAge && b.toAge <= 30)) out.push(`${what}: ages must run from a lower to a higher age (max 30).`);
      };
      (p.costBands || []).forEach((b, i) => {
        band(b, `Cost band ${i + 1}`);
        if (!(isNum(b && b.annual) && b.annual >= 0)) out.push(`Cost band ${i + 1}: enter a yearly cost.`);
      });
      if (p.school) {
        band(p.school, 'School');
        if (!(isNum(p.school.annualFee) && p.school.annualFee >= 0)) out.push('School: enter the yearly fee.');
      }
      return out;
    },
    build(p) {
      const name = p.name || 'Child';
      const range = (fromAge, toAge) => ({ from: addYears(p.birth, fromAge), to: addMonths(addYears(p.birth, toAge), -1) });
      const items = (p.costBands || []).map((b, i) => ({ id: `child-cost-${i + 1}`, name: `${name}: costs age ${b.fromAge}–${b.toAge}`,
        kind: 'expense', annual: b.annual, ...range(b.fromAge, b.toAge) }));
      if (p.school) {
        items.push({ id: 'child-school', name: `${name}: school fees`, kind: 'expense', annual: p.school.annualFee, ...range(p.school.fromAge, p.school.toAge) });
      }
      return { items, oneOffs: [], marks: { birth: p.birth } };
    },
  },

  // Buying a home. params: at, deposit, buyingCosts?, mortgage?: { monthly, years }  ← all USER INPUT
  houseDeposit: {
    label: 'Buy a home',
    defaults: { at: null, deposit: null, buyingCosts: 0, mortgage: null },
    problems(p) {
      const out = [];
      if (!isMonth(p.at)) out.push('Purchase month must be YYYY-MM.');
      if (!(isNum(p.deposit) && p.deposit >= 0)) out.push('Enter the deposit.');
      if (p.buyingCosts != null && !(isNum(p.buyingCosts) && p.buyingCosts >= 0)) out.push('Buying costs must be 0 or more.');
      if (p.mortgage && !(isNum(p.mortgage.monthly) && p.mortgage.monthly >= 0 && isNum(p.mortgage.years) && p.mortgage.years > 0 && p.mortgage.years <= 40)) {
        out.push('Mortgage: enter the monthly payment and a term of 1–40 years.');
      }
      return out;
    },
    build(p) {
      const oneOffs = [{ at: p.at, amount: -p.deposit, name: 'House deposit' }];
      if (p.buyingCosts) oneOffs.push({ at: p.at, amount: -p.buyingCosts, name: 'Buying costs' });
      const items = [];
      // First payment the month after completion; `years × 12` payments.
      if (p.mortgage) items.push({ id: 'mortgage', name: 'Mortgage', kind: 'expense', monthly: p.mortgage.monthly,
        from: addMonths(p.at, 1), to: addMonths(p.at, p.mortgage.years * 12) });
      return { items, oneOffs, marks: { at: p.at } };
    },
  },

  // Recurring holidays, smoothed monthly (like a sinking fund). params: perYear, costEach, from, to?
  holiday: {
    label: 'Holidays',
    defaults: { perYear: 1, costEach: null, from: null, to: null, name: 'Holidays' },
    problems(p) {
      const out = [];
      if (!(isNum(p.perYear) && p.perYear > 0 && p.perYear <= 12)) out.push('Holidays a year must be 1–12.');
      if (!(isNum(p.costEach) && p.costEach >= 0)) out.push('Enter the cost of each holiday.');
      if (!isMonth(p.from)) out.push('Start month must be YYYY-MM.');
      if (p.to != null && (!isMonth(p.to) || (isMonth(p.from) && ym(p.to) < ym(p.from)))) out.push('End month must be YYYY-MM and after the start.');
      return out;
    },
    build(p) {
      return { items: [{ id: 'holidays', name: p.name || 'Holidays', kind: 'expense', annual: p.perYear * p.costEach, from: p.from, to: p.to || null }],
        oneOffs: [], marks: { from: p.from } };
    },
  },

  // A car. params: at, cost, runningMonthly?, replaceEvery? (years), until? (default: retirement)
  car: {
    label: 'Car',
    defaults: { at: null, cost: null, runningMonthly: 0, replaceEvery: null, until: null, name: 'Car' },
    problems(p) {
      const out = [];
      if (!isMonth(p.at)) out.push('Purchase month must be YYYY-MM.');
      if (!(isNum(p.cost) && p.cost >= 0)) out.push('Enter the car’s cost.');
      if (p.runningMonthly != null && !(isNum(p.runningMonthly) && p.runningMonthly >= 0)) out.push('Running cost must be 0 or more.');
      if (p.replaceEvery != null && !(isNum(p.replaceEvery) && p.replaceEvery >= 1 && p.replaceEvery <= 30)) out.push('Replace every must be 1–30 years.');
      if (p.until != null && !isMonth(p.until)) out.push('Until must be YYYY-MM.');
      return out;
    },
    build(p, s) {
      const name = p.name || 'Car';
      const until = p.until || (s && s.birth && s.retirementAge ? fromYm(ym(s.birth) + Math.round(s.retirementAge * 12)) : p.at);
      const oneOffs = [];
      let at = p.at;
      do {
        oneOffs.push({ at, amount: -p.cost, name });
        at = p.replaceEvery ? addYears(at, p.replaceEvery) : null;
      } while (at && ym(at) <= ym(until));
      const items = p.runningMonthly ? [{ id: 'car-running', name: `${name}: running costs`, kind: 'expense', monthly: p.runningMonthly, from: p.at, to: p.until || null }] : [];
      return { items, oneOffs, marks: { at: p.at } };
    },
  },

  // A one-off trip (e.g. the dirt-bike trip). params: at, cost, name?
  oneOffTrip: {
    label: 'Trip',
    defaults: { at: null, cost: null, name: 'Trip' },
    problems(p) {
      const out = [];
      if (!isMonth(p.at)) out.push('Trip month must be YYYY-MM.');
      if (!(isNum(p.cost) && p.cost >= 0)) out.push('Enter the trip’s cost.');
      return out;
    },
    build(p) {
      return { items: [], oneOffs: [{ at: p.at, amount: -p.cost, name: p.name || 'Trip' }], marks: { at: p.at } };
    },
  },

  // Moving country (e.g. Australia → UK). params: at, currency, costOfLivingChangePct, oneOffCost,
  //   affects?: [itemId] (default: every expense item still running at `at` that didn't come from an event)
  // Amounts stay in the scenario's base currency (the engine is single-currency); `currency` is recorded
  // for display/FX-risk notes. Living costs are scaled by the % from the move month onwards.
  relocation: {
    label: 'Move country',
    defaults: { at: null, currency: 'GBP', costOfLivingChangePct: 0, oneOffCost: 0, affects: null },
    problems(p) {
      const out = [];
      if (!isMonth(p.at)) out.push('Move month must be YYYY-MM.');
      if (!['GBP', 'AUD', 'USD', 'EUR'].includes(p.currency)) out.push('Destination currency must be GBP, AUD, USD or EUR.');
      if (!(isNum(p.costOfLivingChangePct) && p.costOfLivingChangePct > -90 && p.costOfLivingChangePct < 500)) out.push('Cost-of-living change must be a percentage (e.g. -10 or 15).');
      if (!(isNum(p.oneOffCost) && p.oneOffCost >= 0)) out.push('Moving cost must be 0 or more.');
      return out;
    },
    build(p, s) {
      const oneOffs = p.oneOffCost ? [{ at: p.at, amount: -p.oneOffCost, name: 'Moving costs' }] : [];
      const atI = ym(p.at);
      const factor = 1 + p.costOfLivingChangePct / 100;
      const items = [];
      const patchItems = [];
      if (factor !== 1) {
        const targets = (s.items || []).filter((it) => it.kind === 'expense' && (p.affects ? p.affects.includes(it.id) : !it.eventId)
          && (!it.to || ym(it.to) >= atI));
        for (const it of targets) {
          const startsLater = it.from && ym(it.from) >= atI;
          const scaled = { ...it, id: `${it.id}-after-move`, name: `${it.name || it.id} (after move)`, from: startsLater ? it.from : p.at };
          delete scaled.eventId;
          if (it.monthly != null) scaled.monthly = it.monthly * factor;
          if (it.annual != null) scaled.annual = it.annual * factor;
          if (Array.isArray(it.steps)) scaled.steps = it.steps.map((st) => ({ ...st, monthly: st.monthly * factor }));
          items.push(scaled);
          // The original stops the month before the move (or is dropped entirely if it starts after it).
          patchItems.push(startsLater ? { id: it.id, remove: true } : { id: it.id, to: addMonths(p.at, -1) });
        }
      }
      return { items, oneOffs, patchItems, marks: { at: p.at, currency: p.currency } };
    },
  },
};

export function withDefaults(event) {
  const t = TEMPLATES[event && event.template];
  return t ? { ...t.defaults, ...(event.params || {}) } : null;
}

// Readable problems for one event ([] = OK).
export function eventProblems(event) {
  const t = TEMPLATES[event && event.template];
  if (!t) return [`Unknown event type "${event && event.template}".`];
  return t.problems(withDefaults(event));
}

// Apply one event. Throws an Error listing the problems if the event is invalid.
export function applyEvent(scenario, event, index = 0) {
  const problems = eventProblems(event);
  if (problems.length) throw new Error(problems.join(' '));
  const t = TEMPLATES[event.template];
  const eventId = event.id || `${event.template}-${index + 1}`;
  const out = t.build(withDefaults(event), scenario);
  // Changes to existing items are recorded (`patch`) so expandEvents() can undo them before re-applying.
  const items = (scenario.items || []).map((it) => {
    const patch = (out.patchItems || []).find((pt) => pt.id === it.id);
    if (!patch) return { ...it };
    const orig = it.patch || { by: eventId, to: it.to ?? null, off: !!it.off };
    return patch.remove ? { ...it, off: true, patch: orig } : { ...it, to: patch.to, patch: orig };
  });
  const tag = (x) => ({ ...x, eventId });
  return {
    ...scenario,
    items: [...items, ...out.items.map((it) => tag({ ...it, id: `${eventId}:${it.id}` }))],
    oneOffs: [...(scenario.oneOffs || []), ...out.oneOffs.map(tag)],
  };
}

// Expand every event in `scenario.events` (in order). Idempotent: anything previously generated from an
// event (tagged eventId) is removed first. Invalid events are skipped and reported, never half-applied.
export function expandEvents(scenario) {
  const restore = (it) => {
    if (!it.patch) return it;
    const { patch, ...rest } = it;
    const back = { ...rest };
    if (patch.to == null) delete back.to; else back.to = patch.to;
    if (patch.off) back.off = true; else delete back.off;
    return back;
  };
  let s = {
    ...scenario,
    items: (scenario.items || []).filter((it) => !it.eventId).map(restore),
    oneOffs: (scenario.oneOffs || []).filter((o) => !o.eventId),
  };
  const problems = [];
  const marks = {};
  (scenario.events || []).forEach((ev, i) => {
    const p = eventProblems(ev);
    if (p.length) { problems.push({ index: i, id: ev && ev.id, template: ev && ev.template, problems: p }); return; }
    const id = ev.id || `${ev.template}-${i + 1}`;
    marks[id] = TEMPLATES[ev.template].build(withDefaults(ev), s).marks || {};
    s = applyEvent(s, ev, i);
  });
  return { scenario: s, problems, marks };
}
