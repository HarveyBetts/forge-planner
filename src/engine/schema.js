// Scenario JSON schema (docs/SPEC.md), versioned. PURE.
//   validateScenario(s) -> [{ path, message }]   (empty = valid). Messages are plain English for the UI.
//   migrateScenario(s)  -> upgraded copy at CURRENT_VERSION (throws a readable Error if it can't)
//   parseScenario(text|object) -> { scenario, errors }   migrate + validate in one go (imports, backups, AI diffs)
import { eventProblems } from './events.js';
import { potProblems } from './pots.js';

export const CURRENT_VERSION = 1;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CURRENCIES = ['GBP', 'AUD', 'USD', 'EUR'];
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isMonth = (x) => typeof x === 'string' && MONTH_RE.test(x);
const mi = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; };

// Migrations: MIGRATIONS[n] upgrades a version-n scenario to n+1. v0 = anything saved before schemaVersion existed.
const MIGRATIONS = {
  0: (s) => ({ ...s, schemaVersion: 1, items: s.items || [], oneOffs: s.oneOffs || [] }),
};

export function migrateScenario(input) {
  if (!isObj(input)) throw new Error('A scenario must be a JSON object.');
  let s = JSON.parse(JSON.stringify(input));
  let v = s.schemaVersion == null ? 0 : s.schemaVersion;
  if (!Number.isInteger(v) || v < 0) throw new Error(`Unknown scenario version "${s.schemaVersion}".`);
  if (v > CURRENT_VERSION) throw new Error(`This scenario was made by a newer version of Forge (v${v}). Update the app to open it.`);
  while (v < CURRENT_VERSION) {
    s = MIGRATIONS[v](s);
    v = s.schemaVersion;
  }
  return s;
}

export function validateScenario(s) {
  const errs = [];
  const err = (path, message) => errs.push({ path, message });
  if (!isObj(s)) return [{ path: '', message: 'A scenario must be a JSON object.' }];

  if (s.schemaVersion !== CURRENT_VERSION) err('schemaVersion', `Scenario version must be ${CURRENT_VERSION} (got ${JSON.stringify(s.schemaVersion)}).`);
  if (s.name != null && typeof s.name !== 'string') err('name', 'Name must be text.');
  if (s.baseCurrency != null && !CURRENCIES.includes(s.baseCurrency)) err('baseCurrency', `Currency must be one of ${CURRENCIES.join(', ')}.`);
  if (!isMonth(s.start)) err('start', 'Start must be a month like 2026-11.');
  if (!isMonth(s.birth)) err('birth', 'Date of birth must be a month like 1997-03.');
  if (!(isNum(s.retirementAge) && s.retirementAge >= 18 && s.retirementAge <= 100)) err('retirementAge', 'Retirement age must be a number from 18 to 100.');
  else if (isMonth(s.start) && isMonth(s.birth) && mi(s.birth) + Math.round(s.retirementAge * 12) < mi(s.start)) {
    err('retirementAge', 'Retirement age is already in the past for this start date.');
  }
  if (s.openingPot != null && !isNum(s.openingPot)) err('openingPot', 'Opening pot must be a number.');
  if (s.investShare != null && !(isNum(s.investShare) && s.investShare >= 0 && s.investShare <= 1)) err('investShare', 'Share invested must be between 0 and 1 (e.g. 0.8 for 80%).');
  if (s.redirectAfterCoast != null && typeof s.redirectAfterCoast !== 'boolean') err('redirectAfterCoast', '“Spend once coasting” must be true or false.');

  const a = s.assumptions;
  if (!isObj(a)) err('assumptions', 'Assumptions are missing.');
  else {
    const range = (k, lo, hi, label, required = true) => {
      if (a[k] == null) { if (required) err(`assumptions.${k}`, `${label} is missing.`); return; }
      if (!(isNum(a[k]) && a[k] >= lo && a[k] <= hi)) err(`assumptions.${k}`, `${label} must be between ${lo} and ${hi}.`);
    };
    range('nominalReturn', -0.5, 0.5, 'Investment return (e.g. 0.07 for 7%)');
    range('inflation', -0.1, 0.3, 'Inflation (e.g. 0.025 for 2.5%)');
    if (!(isNum(a.withdrawalRate) && a.withdrawalRate > 0 && a.withdrawalRate <= 0.2)) err('assumptions.withdrawalRate', 'Withdrawal rate must be above 0 and at most 0.2 (e.g. 0.04 for 4%).');
    if (!(isNum(a.retirementSpend) && a.retirementSpend >= 0)) err('assumptions.retirementSpend', 'Retirement spend must be a yearly amount of 0 or more.');
    if (a.otherRetirementIncome != null && !(isNum(a.otherRetirementIncome) && a.otherRetirementIncome >= 0)) err('assumptions.otherRetirementIncome', 'Other retirement income must be 0 or more.');
    range('cashRealReturn', -0.2, 0.2, 'Cash return after inflation', false);
  }

  if (s.items != null && !Array.isArray(s.items)) err('items', 'Items must be a list.');
  const ids = new Set();
  (Array.isArray(s.items) ? s.items : []).forEach((it, i) => {
    const p = `items[${i}]`;
    const label = `Item ${i + 1}${isObj(it) && it.name ? ` (“${it.name}”)` : ''}`;
    if (!isObj(it)) { err(p, `${label} must be an object.`); return; }
    if (typeof it.id !== 'string' || !it.id) err(`${p}.id`, `${label} needs an id.`);
    else if (ids.has(it.id)) err(`${p}.id`, `${label}: id “${it.id}” is used twice.`);
    ids.add(it.id);
    if (!['income', 'expense'].includes(it.kind)) err(`${p}.kind`, `${label}: kind must be income or expense.`);
    const hasSteps = Array.isArray(it.steps) && it.steps.length;
    if (!hasSteps && !isNum(it.monthly) && !isNum(it.annual)) err(p, `${label} needs a monthly amount, a yearly amount or pay steps.`);
    if (it.monthly != null && !isNum(it.monthly)) err(`${p}.monthly`, `${label}: monthly amount must be a number.`);
    if (it.annual != null && !isNum(it.annual)) err(`${p}.annual`, `${label}: yearly amount must be a number.`);
    if (hasSteps) it.steps.forEach((st, j) => {
      if (!isObj(st) || !isMonth(st.from) || !isNum(st.monthly)) err(`${p}.steps[${j}]`, `${label}, step ${j + 1}: needs a month (from) and a monthly amount.`);
    });
    if (it.from != null && !isMonth(it.from)) err(`${p}.from`, `${label}: start must be a month like 2027-09.`);
    if (it.to != null && !isMonth(it.to)) err(`${p}.to`, `${label}: end must be a month like 2030-01.`);
    if (isMonth(it.from) && isMonth(it.to) && mi(it.to) < mi(it.from)) err(`${p}.to`, `${label}: ends (${it.to}) before it starts (${it.from}).`);
  });

  if (s.oneOffs != null && !Array.isArray(s.oneOffs)) err('oneOffs', 'One-offs must be a list.');
  (Array.isArray(s.oneOffs) ? s.oneOffs : []).forEach((o, i) => {
    const label = `One-off ${i + 1}${isObj(o) && o.name ? ` (“${o.name}”)` : ''}`;
    if (!isObj(o)) { err(`oneOffs[${i}]`, `${label} must be an object.`); return; }
    if (!isMonth(o.at)) err(`oneOffs[${i}].at`, `${label}: month must be like 2028-03.`);
    if (!isNum(o.amount)) err(`oneOffs[${i}].amount`, `${label}: amount must be a number (negative for a cost).`);
  });

  if (s.pots != null) {
    if (!Array.isArray(s.pots)) err('pots', 'Pots must be a list.');
    else potProblems(s.pots).forEach((m) => err('pots', m));
  }
  if (s.events != null) {
    if (!Array.isArray(s.events)) err('events', 'Events must be a list.');
    else s.events.forEach((ev, i) => eventProblems(ev).forEach((m) => err(`events[${i}]`, `Event ${i + 1}: ${m}`)));
  }
  return errs;
}

export function parseScenario(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch { return { scenario: null, errors: [{ path: '', message: 'That isn’t valid JSON.' }] }; }
  }
  let scenario;
  try { scenario = migrateScenario(obj); } catch (e) { return { scenario: null, errors: [{ path: 'schemaVersion', message: e.message }] }; }
  const errors = validateScenario(scenario);
  return { scenario: errors.length ? null : scenario, errors };
}
