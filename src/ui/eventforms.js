// Event editor forms (T2.6). PURE: field definitions per template and form ⇄ params conversion.
// Validation is the engine's own eventProblems() — one source of truth for what a valid event is.
//
// The Speedbird pathway is NOT offered here: in a plan built from answers, the pathway already comes from
// questions 11, 12 and 50 (investing per stage). Adding a salary on top would count money twice (D22).
import { eventProblems, TEMPLATES } from '../engine/events.js';

const num = (x) => (x === '' || x == null ? null : Number(x));
const orNull = (x) => (x === '' || x == null ? null : x);

// Field: { k, label, type: 'month'|'money'|'number'|'text'|'select', opts?, help?, optional? }
export const FORMS = {
  child: {
    title: 'A child', blurb: 'Yearly costs by age, and private school if you want it. Kids from your answers are already in the plan.',
    fields: [
      { k: 'name', label: 'Name or label', type: 'text', optional: true },
      { k: 'birth', label: 'Born (month and year)', type: 'month' },
      { k: 'cost0', label: 'Yearly cost, age 0–4', type: 'money', optional: true },
      { k: 'cost4', label: 'Yearly cost, age 4–11', type: 'money', optional: true },
      { k: 'cost11', label: 'Yearly cost, age 11–18', type: 'money', optional: true },
      { k: 'schoolFrom', label: 'Private school from age', type: 'select', opts: [['', 'No private school'], ['3', '3'], ['4', '4'], ['7', '7'], ['11', '11'], ['13', '13']], optional: true },
      { k: 'schoolFee', label: 'School fee per year', type: 'money', optional: true, help: 'Until 18.' },
    ],
    toParams: (v) => ({
      name: v.name || 'Child', birth: orNull(v.birth),
      costBands: [[0, 4, v.cost0], [4, 11, v.cost4], [11, 18, v.cost11]].filter(([, , a]) => num(a) != null).map(([f, t, a]) => ({ fromAge: f, toAge: t, annual: num(a) })),
      school: v.schoolFrom ? { fromAge: Number(v.schoolFrom), toAge: 18, annualFee: num(v.schoolFee) } : null,
    }),
    fromParams: (p) => {
      const band = (f) => (p.costBands || []).find((b) => b.fromAge === f);
      return { name: p.name === 'Child' ? '' : p.name || '', birth: p.birth || '', cost0: band(0)?.annual ?? '', cost4: band(4)?.annual ?? '', cost11: band(11)?.annual ?? '',
        schoolFrom: p.school ? String(p.school.fromAge) : '', schoolFee: p.school?.annualFee ?? '' };
    },
  },
  houseDeposit: {
    title: 'Buy a home', blurb: 'Deposit and buying costs when you buy, then the mortgage from the month after.',
    fields: [
      { k: 'at', label: 'When you buy', type: 'month' },
      { k: 'deposit', label: 'Deposit', type: 'money' },
      { k: 'buyingCosts', label: 'Buying costs (stamp duty, legal, moving)', type: 'money', optional: true },
      { k: 'mortMonthly', label: 'Mortgage per month', type: 'money', optional: true },
      { k: 'mortYears', label: 'Mortgage term (years)', type: 'number', optional: true },
    ],
    toParams: (v) => ({ at: orNull(v.at), deposit: num(v.deposit), buyingCosts: num(v.buyingCosts) || 0,
      mortgage: num(v.mortMonthly) != null || num(v.mortYears) != null ? { monthly: num(v.mortMonthly), years: num(v.mortYears) } : null }),
    fromParams: (p) => ({ at: p.at || '', deposit: p.deposit ?? '', buyingCosts: p.buyingCosts || '', mortMonthly: p.mortgage?.monthly ?? '', mortYears: p.mortgage?.years ?? '' }),
  },
  holiday: {
    title: 'Holidays', blurb: 'Set aside each month for the holidays you want each year.',
    fields: [
      { k: 'name', label: 'Label', type: 'text', optional: true },
      { k: 'perYear', label: 'Holidays a year', type: 'number' },
      { k: 'costEach', label: 'Cost of each', type: 'money' },
      { k: 'from', label: 'From', type: 'month' },
      { k: 'to', label: 'Until (optional)', type: 'month', optional: true },
    ],
    toParams: (v) => ({ name: v.name || 'Holidays', perYear: num(v.perYear), costEach: num(v.costEach), from: orNull(v.from), to: orNull(v.to) }),
    fromParams: (p) => ({ name: p.name === 'Holidays' ? '' : p.name || '', perYear: p.perYear ?? '', costEach: p.costEach ?? '', from: p.from || '', to: p.to || '' }),
  },
  car: {
    title: 'A car', blurb: 'Buy it, run it, and replace it every few years until you stop work.',
    fields: [
      { k: 'name', label: 'Label', type: 'text', optional: true },
      { k: 'at', label: 'When you buy', type: 'month' },
      { k: 'cost', label: 'Price', type: 'money' },
      { k: 'runningMonthly', label: 'Running costs per month', type: 'money', optional: true },
      { k: 'replaceEvery', label: 'Replace every (years)', type: 'number', optional: true },
    ],
    toParams: (v) => ({ name: v.name || 'Car', at: orNull(v.at), cost: num(v.cost), runningMonthly: num(v.runningMonthly) || 0, replaceEvery: num(v.replaceEvery) }),
    fromParams: (p) => ({ name: p.name === 'Car' ? '' : p.name || '', at: p.at || '', cost: p.cost ?? '', runningMonthly: p.runningMonthly || '', replaceEvery: p.replaceEvery ?? '' }),
  },
  oneOffTrip: {
    title: 'A trip', blurb: 'A one-off cost in a single month — a dirt-bike trip, a wedding, a big birthday.',
    fields: [
      { k: 'name', label: 'What is it?', type: 'text' },
      { k: 'at', label: 'When', type: 'month' },
      { k: 'cost', label: 'Cost', type: 'money' },
    ],
    toParams: (v) => ({ name: v.name || 'Trip', at: orNull(v.at), cost: num(v.cost) }),
    fromParams: (p) => ({ name: p.name || '', at: p.at || '', cost: p.cost ?? '' }),
  },
  relocation: {
    title: 'Move country', blurb: 'A moving cost, and living costs going up or down by a percentage from then on.',
    fields: [
      { k: 'at', label: 'When you move', type: 'month' },
      { k: 'currency', label: 'Currency there', type: 'select', opts: [['GBP', '£ Pounds'], ['AUD', 'A$ Aussie dollars'], ['EUR', '€ Euros'], ['USD', '$ US dollars']] },
      { k: 'costOfLivingChangePct', label: 'Living costs change (%)', type: 'number', help: 'e.g. 10 for 10% dearer, −10 for cheaper.' },
      { k: 'oneOffCost', label: 'Moving cost', type: 'money', optional: true },
    ],
    toParams: (v) => ({ at: orNull(v.at), currency: v.currency || 'GBP', costOfLivingChangePct: num(v.costOfLivingChangePct) ?? 0, oneOffCost: num(v.oneOffCost) || 0 }),
    fromParams: (p) => ({ at: p.at || '', currency: p.currency || 'GBP', costOfLivingChangePct: p.costOfLivingChangePct ?? '', oneOffCost: p.oneOffCost || '' }),
  },
};
export const EDITABLE = Object.keys(FORMS);

// Form values → { event, problems }. Problems come from the engine (readable sentences).
export function formToEvent(template, values, id) {
  const f = FORMS[template];
  if (!f) return { event: null, problems: [`Unknown event type “${template}”.`] };
  const event = { id, template, params: f.toParams(values || {}) };
  return { event, problems: eventProblems(event) };
}
export function eventToForm(event) {
  const f = FORMS[event && event.template];
  return f ? f.fromParams({ ...TEMPLATES[event.template].defaults, ...(event.params || {}) }) : {};
}

// One-line summary for lists ("Dirt-bike trip · Mar 2028 · £4,000").
export function eventLabel(event) {
  const p = event.params || {};
  const T = { child: p.name || 'Child', houseDeposit: 'Buy a home', holiday: p.name || 'Holidays', car: p.name || 'Car', oneOffTrip: p.name || 'Trip', relocation: 'Move country', speedbirdPathway: 'Speedbird pathway' };
  return T[event.template] || event.template;
}
export function eventWhen(event) {
  const p = event.params || {};
  return p.at || p.birth || p.from || p.courseStart || null;
}

export function newEventId(existing = [], now = Date.now()) {
  const ids = new Set(existing.map((e) => e.id));
  let id = `ev-${now.toString(36)}`;
  for (let k = 2; ids.has(id); k++) id = `ev-${now.toString(36)}-${k}`;
  return id;
}
