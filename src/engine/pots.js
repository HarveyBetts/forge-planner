// Pots: where money sits. PURE — no DOM, network or storage. Currency conversion is injected.
//
// Pot shape (in the pot's own currency until potsToBase() converts it):
//   { id, name, currency:'GBP'|'AUD'|…, kind:'invested'|'cash'|'pension'|'super', balance,
//     accessAge?: number|null,        // age it can first be drawn; null/0 = any time
//     realReturn?: number,            // override; else invested/pension/super use the scenario's real return,
//                                     //   cash uses assumptions.cashRealReturn (default 0 — an assumption)
//     contrib?: { monthly|annual|steps, from?, to? }  // money paid straight into this pot (e.g. employer super),
//                                     //   on top of the scenario's net cash flow
//   }
import { ym } from './dates.js';

export const POT_KINDS = ['invested', 'cash', 'pension', 'super'];

// ---------- researched access rules (defaults only — every pot's accessAge is editable) ----------
// Sources (checked 13 Nov 2026; see docs/DECISIONS.md D17):
//  UK: the normal minimum pension age (NMPA) rises from 55 to 57 on 6 April 2028.
//      https://www.gov.uk/government/publications/increasing-normal-minimum-pension-age
//      Some schemes give a "protected pension age" below 57 — that's why it must stay editable.
//  AU: super preservation age is 60 for anyone born on or after 1 July 1964; 55–59 for earlier births.
//      Reaching it is not enough on its own: a "condition of release" (e.g. retiring) is also needed.
//      https://www.ato.gov.au/individuals/super/withdrawing-and-using-your-super/super-withdrawal-options/
export const ACCESS_SOURCES = {
  pension: 'https://www.gov.uk/government/publications/increasing-normal-minimum-pension-age',
  super: 'https://www.ato.gov.au/individuals/super/withdrawing-and-using-your-super/super-withdrawal-options/',
};
const NMPA_RISE_YM = '2028-04'; // 6 April 2028 — month granularity: from April 2028 the age is 57

// UK private/workplace pension: 55 if you reach 55 before the rise, else 57.
export function ukPensionAccessAge(birth) {
  return ym(birth) + 55 * 12 < ym(NMPA_RISE_YM) ? 55 : 57;
}
// Australian super preservation age by date of birth (ATO table).
export function superPreservationAge(birth) {
  const b = ym(birth);
  const bands = [['1960-07', 55], ['1961-07', 56], ['1962-07', 57], ['1963-07', 58], ['1964-07', 59]];
  for (const [before, age] of bands) if (b < ym(before)) return age;
  return 60;
}
export function defaultAccessAge(kind, birth) {
  if (kind === 'pension') return ukPensionAccessAge(birth);
  if (kind === 'super') return superPreservationAge(birth);
  return null; // invested (ISA, GIA) and cash: any time
}

// Month index from which a pot can be drawn (−Infinity = always).
export function accessMonth(pot, birth) {
  const age = pot.accessAge;
  if (!(Number.isFinite(age) && age > 0)) return -Infinity;
  return ym(birth) + Math.round(age * 12);
}

// ---------- currency ----------
// Convert balances and contributions into the base currency. convert(amount, from, to) is injected
// (src/fx/fx.js in the app; a stub in tests). Returns new pot objects; inputs are not mutated.
export function potsToBase(pots, base, convert) {
  const c = (a, from) => (from === base ? a : convert(a, from, base));
  return (pots || []).map((p) => {
    const cur = p.currency || base;
    const out = { ...p, currency: base, originalCurrency: cur, balance: c(Number(p.balance) || 0, cur) };
    if (p.contrib) {
      const k = { ...p.contrib };
      if (k.monthly != null) k.monthly = c(k.monthly, cur);
      if (k.annual != null) k.annual = c(k.annual, cur);
      if (Array.isArray(k.steps)) k.steps = k.steps.map((st) => ({ ...st, monthly: c(st.monthly, cur) }));
      out.contrib = k;
    }
    return out;
  });
}

// Validation used before projecting. Returns a list of readable problems (empty = fine).
export function potProblems(pots) {
  const out = [];
  const seen = new Set();
  (pots || []).forEach((p, i) => {
    const label = (p && p.name) || `Pot ${i + 1}`;
    if (!p || typeof p !== 'object') { out.push(`${label}: not a pot.`); return; }
    if (!p.id) out.push(`${label}: needs an id.`);
    else if (seen.has(p.id)) out.push(`${label}: duplicate id "${p.id}".`);
    seen.add(p.id);
    if (!POT_KINDS.includes(p.kind)) out.push(`${label}: kind must be one of ${POT_KINDS.join(', ')}.`);
    if (!Number.isFinite(Number(p.balance))) out.push(`${label}: balance must be a number.`);
    if (p.accessAge != null && !(Number.isFinite(p.accessAge) && p.accessAge >= 0 && p.accessAge <= 100)) out.push(`${label}: access age must be 0–100.`);
  });
  return out;
}
