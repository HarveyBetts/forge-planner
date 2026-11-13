// Pure onboarding logic: validation, which questions show, progress, and turning answers into a
// starter scenario for the engine. No DOM, no storage, no network.
import { QUESTIONS, BY_ID, v, optValue } from './questions.js';
import { ym, fromYm } from '../engine/engine.js';
import { defaultAccessAge } from '../engine/pots.js';
import { monthLabel } from '../ui/format.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const has = (x) => x !== undefined && x !== null && x !== '';

// ---------- validation ----------
// Returns null when OK, or a short human message. Empty values are invalid here — the UI offers
// "Don't know / skip" for those instead of saving an empty answer.
export function validateValue(def, value) {
  const t = def.type;
  if (t === 'text' || t === 'longtext') {
    return typeof value === 'string' && value.trim() ? null : 'Type an answer, or tap “Don’t know”.';
  }
  if (t === 'number' || t === 'percent') {
    if (!isNum(value)) return 'Enter a number.';
    if (def.min != null && value < def.min) return `Must be at least ${def.min}.`;
    if (def.max != null && value > def.max) return `Must be ${def.max} or less.`;
    if (t === 'percent' && (value < 0 || value > 100)) return 'Enter a percentage from 0 to 100.';
    return null;
  }
  if (t === 'money') {
    if (!value || !isNum(value.amount)) return 'Enter an amount.';
    if (value.amount < 0) return 'Amounts can’t be negative.';
    if (!['GBP', 'AUD'].includes(value.currency)) return 'Pick £ or A$.';
    return null;
  }
  if (t === 'month') {
    return typeof value === 'string' && MONTH_RE.test(value) ? null : 'Pick a month and year.';
  }
  if (t === 'choice') {
    return (def.opts || []).map(optValue).includes(value) ? null : 'Pick one option.';
  }
  if (t === 'multi') {
    const ok = Array.isArray(value) && value.length > 0 && value.every((x) => (def.opts || []).map(optValue).includes(x));
    return ok ? null : 'Pick at least one option.';
  }
  if (t === 'scale') {
    return Number.isInteger(value) && value >= 1 && value <= 5 ? null : 'Pick a point on the scale.';
  }
  if (t === 'fields') {
    if (!value || typeof value !== 'object') return 'Fill in at least one box.';
    let filled = 0;
    for (const f of def.fields) {
      const sub = value[f.k];
      if (!has(sub) || (f.type === 'money' && !isNum(sub && sub.amount))) continue;
      const err = validateValue(f, sub);
      if (err) return `${f.label}: ${err}`;
      filled++;
    }
    return filled ? null : 'Fill in at least one box, or tap “Don’t know”.';
  }
  return 'Unknown question type.';
}

// ---------- visibility & progress ----------
export function isVisible(def, answers) {
  try { return !def.when || def.when(answers || {}) === true; } catch { return true; }
}
export function visibleQuestions(answers, mode = 'full') {
  return QUESTIONS.filter((q) => (mode === 'quick' ? q.star : true) && isVisible(q, answers));
}
export function isAnswered(answers, id) {
  const r = answers && answers[id];
  return !!r && (r.unknown === true || r.v !== undefined);
}
export function progress(answers, mode = 'full') {
  const list = visibleQuestions(answers, mode);
  const done = list.filter((q) => isAnswered(answers, q.id)).length;
  return { done, total: list.length, ratio: list.length ? done / list.length : 1 };
}
// The next question to ask after `currentId` (or the first unanswered one).
export function nextQuestion(answers, mode, currentId) {
  const list = visibleQuestions(answers, mode);
  if (currentId) {
    const i = list.findIndex((q) => q.id === currentId);
    if (i >= 0 && i + 1 < list.length) return list[i + 1];
    if (i >= 0) return null;
  }
  return list.find((q) => !isAnswered(answers, q.id)) || null;
}
export function prevQuestion(answers, mode, currentId) {
  const list = visibleQuestions(answers, mode);
  const i = list.findIndex((q) => q.id === currentId);
  return i > 0 ? list[i - 1] : null;
}

// ---------- answers -> starter scenario ----------
export const REQUIRED_FOR_PLAN = ['q1', 'q4', 'q63'];
// Speedbird course length — a published fact of the course Harvey accepted (18 months), editable later.
export const DEFAULT_TRAINING_MONTHS = 18;
export const DEFAULT_INFLATION = 0.025;
const RETURNS = { 'Cautious (4% a year)': 0.04, 'Middle (7% a year)': 0.07, 'Optimistic (9% a year)': 0.09 };
const WITHDRAWALS = { 'Cautious (3.5%)': 0.035, 'Standard (4%)': 0.04, 'Aggressive (5%)': 0.05 };
const SCHOOL_FROM = { 'Nursery (3)': 3, 'Prep (4)': 4, 'Senior (11)': 11, 'Senior (13)': 13 };

const addMonths = (s, n) => fromYm(ym(s) + n);
const addYears = (s, y) => addMonths(s, Math.round(y * 12));

// opts.today: 'YYYY-MM'. opts.convert(amount, from, to): currency conversion (injected so this stays pure).
export function answersToScenario(answers, opts = {}) {
  const today = opts.today;
  if (!today) throw new Error('answersToScenario needs opts.today (YYYY-MM)');
  const convert = opts.convert || ((a, from, to) => {
    if (from === to) return a;
    throw new Error(`No converter for ${from}->${to}`);
  });
  const missing = REQUIRED_FOR_PLAN.filter((id) => v(answers, id) === undefined);
  if (missing.length) return { scenario: null, missing, assumptions: [], notPlaced: [] };

  const base = v(answers, 'q7') || 'GBP';
  const money = (m) => (m && isNum(m.amount) ? convert(m.amount, m.currency || base, base) : 0);
  const assumptions = [];
  const notPlaced = [];
  const items = [];
  const oneOffs = [];

  const birth = v(answers, 'q1');
  const retirementAge = v(answers, 'q4');
  const retirementSpend = money(v(answers, 'q63'));
  const endYm = addYears(birth, retirementAge);

  // Retirement income from pensions the user has chosen to include.
  const sp = v(answers, 'q64') || {};
  const ap = v(answers, 'q65') || {};
  const otherRetirementIncome = (sp.include === 'Yes' ? money(sp.amount) : 0) + (ap.include === 'Yes' ? money(ap.amount) : 0);
  if (!otherRetirementIncome) assumptions.push('No state or airline pension counted.');

  let nominalReturn = RETURNS[v(answers, 'q55')];
  if (nominalReturn == null) { nominalReturn = 0.07; assumptions.push('Investment return: 7% a year before inflation (middle case).'); }
  let withdrawalRate = WITHDRAWALS[v(answers, 'q66')];
  if (withdrawalRate == null) { withdrawalRate = 0.04; assumptions.push('Withdrawal rate: 4% a year.'); }
  assumptions.push(`Inflation: ${DEFAULT_INFLATION * 100}% a year. All figures are in today’s money.`);

  // Opening pots (q49), each in the base currency with its own growth and access rules (T1.2).
  const bal = v(answers, 'q49') || {};
  const POT_DEFS = [
    ['cashGBP', 'Cash (£)', 'cash'], ['cashAUD', 'Cash (A$)', 'cash'], ['isa', 'Stocks ISA', 'invested'],
    ['super', 'Australian super', 'super'], ['other', 'Other savings', 'invested'],
  ];
  const pots = [];
  for (const [k, name, kind] of POT_DEFS) {
    const m = bal[k];
    if (!m || !isNum(m.amount)) continue;
    pots.push({ id: k, name, kind, balance: money(m), originalCurrency: m.currency || base, accessAge: defaultAccessAge(kind, birth) });
  }
  // Positive cash flow is invested in the ISA if there is one, else in "Other savings"/a new invested pot.
  const openingPot = pots.reduce((sum, p) => sum + p.balance, 0);
  if (pots.some((p) => p.kind === 'cash')) assumptions.push('Cash savings keep pace with inflation but don’t grow beyond it (0% real). Shares grow at the investment return.');
  const sup = pots.find((p) => p.kind === 'super');
  if (sup) {
    assumptions.push(`Australian super can’t be touched until ${sup.accessAge} (ATO preservation age for your birth date), and only once you meet a condition of release such as retiring. Estimate — check with your fund.`);
  }

  // Career timing.
  const speedbird = v(answers, 'q11') !== 'Not doing it';
  const courseStart = speedbird ? v(answers, 'q12') : undefined;
  const foStart = courseStart ? addMonths(courseStart, DEFAULT_TRAINING_MONTHS) : undefined;
  if (courseStart) assumptions.push(`Training lasts ${DEFAULT_TRAINING_MONTHS} months from ${monthLabel(courseStart)}.`);
  const marks = [];
  if (courseStart) marks.push({ at: courseStart, label: 'Speedbird training starts' });
  if (foStart) marks.push({ at: foStart, label: 'First Officer (reduced Speedbird scale)' });

  // Monthly investing as steps across life stages.
  const inv = v(answers, 'q50') || {};
  const steps = [];
  if (inv.now) steps.push({ from: today, monthly: money(inv.now) });
  if (courseStart && ym(courseStart) >= ym(today)) {
    steps.push({ from: courseStart, monthly: inv.training ? money(inv.training) : 0 });
    if (!inv.training) assumptions.push('No investing during training.');
  }
  if (foStart && ym(foStart) >= ym(today)) {
    if (inv.fo) steps.push({ from: foStart, monthly: money(inv.fo) });
    else { notPlaced.push('Investing as a First Officer (question 50).'); }
  }
  if (steps.length) {
    if (ym(steps[0].from) > ym(today)) steps.unshift({ from: today, monthly: 0 });
    items.push({ id: 'investing', name: 'Monthly investing', kind: 'income', steps, from: today });
  } else {
    notPlaced.push('Monthly investing (question 50).');
  }

  // Kids and private school.
  const kids = v(answers, 'q74') || {};
  const count = isNum(kids.count) ? kids.count : 0;
  if (count > 0) {
    if (!isNum(kids.ageFirst)) notPlaced.push('Kids: your age at the first child (question 74).');
    else {
      const gap = isNum(kids.gap) ? kids.gap : 2;
      if (!isNum(kids.gap)) assumptions.push('Kids two years apart.');
      const school = v(answers, 'q79');
      const fromAge = SCHOOL_FROM[v(answers, 'q81')];
      const fee = money(v(answers, 'q82'));
      const extras = money(v(answers, 'q85'));
      const childcare = money(v(answers, 'q86'));
      for (let k = 0; k < count; k++) {
        const childBirth = addYears(birth, kids.ageFirst + k * gap);
        if (ym(childBirth) > ym(endYm)) continue;
        const label = `Child ${k + 1}`;
        if (childcare) {
          items.push({ id: `childcare-${k + 1}`, name: `${label} childcare`, kind: 'expense', monthly: childcare,
            from: childBirth, to: addMonths(addYears(childBirth, fromAge && fromAge < 4 ? fromAge : 4), -1) });
        }
        if (school && school !== 'No') {
          if (fromAge != null && fee) {
            items.push({ id: `school-${k + 1}`, name: `${label} private school`, kind: 'expense', annual: fee + extras,
              from: addYears(childBirth, fromAge), to: addMonths(addYears(childBirth, 18), -1) });
          } else {
            notPlaced.push(`${label} school fees (questions 81 and 82).`);
          }
        }
      }
      if (school && school !== 'No' && fee) assumptions.push('School fees rise with inflation only, until 18.');
    }
  }

  // Home deposit.
  if (v(answers, 'q94') !== 'Rent long-term') {
    const price = money(v(answers, 'q97'));
    const dep = v(answers, 'q98') || {};
    if (price && isNum(dep.percent) && dep.by) {
      oneOffs.push({ at: dep.by, amount: -price * dep.percent / 100, name: 'House deposit' });
      assumptions.push('House: deposit only; mortgage payments and buying costs not modelled yet.');
    } else if (price || has(dep.by)) {
      notPlaced.push('House deposit (questions 97 and 98).');
    }
  }

  // Cars: buy at First Officer start (or now), then every N years until retirement.
  const carBudget = money(v(answers, 'q107'));
  if (carBudget) {
    const every = v(answers, 'q110');
    let at = foStart && ym(foStart) >= ym(today) ? foStart : today;
    if (!isNum(every)) assumptions.push('One car purchase (no replacement cycle given).');
    do {
      oneOffs.push({ at, amount: -carBudget, name: 'Car' });
      at = isNum(every) ? addYears(at, every) : null;
    } while (at && ym(at) <= ym(endYm));
  }

  // Dirt-bike trip.
  const trip = v(answers, 'q113') || {};
  if (trip.cost && isNum(trip.cost.amount)) {
    if (trip.when) oneOffs.push({ at: trip.when, amount: -money(trip.cost), name: 'Dirt-bike trip' });
    else notPlaced.push('Dirt-bike trip date (question 113).');
  }

  // Family holidays: from first child if any, else from First Officer start, else now.
  const hol = v(answers, 'q116') || {};
  if (isNum(hol.perYear) && hol.costEach && isNum(hol.costEach.amount)) {
    let from = foStart && ym(foStart) >= ym(today) ? foStart : today;
    if (count > 0 && isNum(kids.ageFirst)) from = addYears(birth, kids.ageFirst);
    if (ym(from) < ym(today)) from = today;
    items.push({ id: 'holidays', name: 'Family holidays', kind: 'expense', annual: hol.perYear * money(hol.costEach), from });
  }

  // Wedding, lump sums, big purchases.
  const wed = v(answers, 'q73') || {};
  if (wed.amount && isNum(wed.amount.amount)) {
    if (wed.when) oneOffs.push({ at: wed.when, amount: -money(wed.amount), name: 'Wedding' });
    else notPlaced.push('Wedding date (question 73).');
  }
  const lump = v(answers, 'q58') || {};
  if (lump.amount && isNum(lump.amount.amount) && lump.when) oneOffs.push({ at: lump.when, amount: money(lump.amount), name: lump.what || 'Lump sum' });
  const buy = v(answers, 'q59') || {};
  if (buy.amount && isNum(buy.amount.amount) && buy.when) oneOffs.push({ at: buy.when, amount: -money(buy.amount), name: buy.what || 'Big purchase' });

  // Drop anything dated before today or after retirement (the engine only runs today → retirement).
  const inRange = (at) => ym(at) >= ym(today) && ym(at) <= ym(endYm);
  const keptOneOffs = oneOffs.filter((o) => inRange(o.at));
  if (keptOneOffs.length < oneOffs.length) assumptions.push('Events dated before today or after retirement were left out.');

  const scenario = {
    schemaVersion: 1,
    name: 'From onboarding',
    baseCurrency: base,
    start: today,
    birth,
    retirementAge,
    openingPot,
    pots,
    marks,
    investShare: 1,
    redirectAfterCoast: v(answers, 'q57') === 'Spend more now once on track',
    assumptions: { nominalReturn, inflation: DEFAULT_INFLATION, withdrawalRate, retirementSpend, otherRetirementIncome },
    items,
    oneOffs: keptOneOffs,
  };
  return { scenario, missing: [], assumptions, notPlaced };
}

export { QUESTIONS, BY_ID };
