// Pure: turn data/seed.local.json into an onboarding-answers backup the app can import
// ("Restore answers from a backup"). Dev-only — lives in scripts/, never copied into _site/.
//
// Rule (CLAUDE.md §3.1 + seed _README): only facts Harvey has CONFIRMED become answers.
//   - list items with a `confirmed` flag are used only when confirmed === true
//   - top-level scalars (birth, retirementAge, baseCurrency) are used when non-null
//   - `assumptions` are placeholders by definition and are never imported
// Everything else is reported in `skipped` (names only — never values) so the onboarding asks for it.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const POT_FIELD = { isa: 'isa', 'au-super': 'super', 'cash-gbp': 'cashGBP', 'cash-aud': 'cashAUD' };
const TIMELINE_Q = { 'speedbird-start': 'q12' };

export function seedToAnswers(seed, { now = () => new Date().toISOString() } = {}) {
  if (!seed || typeof seed !== 'object') throw new Error('Seed must be a JSON object.');
  const answers = {};
  const used = [];
  const skipped = [];

  if (seed.baseCurrency === 'GBP' || seed.baseCurrency === 'AUD') { answers.q7 = { v: seed.baseCurrency }; used.push('base currency'); }
  if (typeof seed.birth === 'string' && MONTH_RE.test(seed.birth)) { answers.q1 = { v: seed.birth }; used.push('date of birth'); }
  else skipped.push('date of birth');
  if (Number.isFinite(seed.retirementAge) && seed.retirementAge >= 30 && seed.retirementAge <= 80) { answers.q4 = { v: seed.retirementAge }; used.push('retirement age'); }
  else skipped.push('retirement age');

  const pots = {};
  for (const p of Array.isArray(seed.openingPots) ? seed.openingPots : []) {
    const field = POT_FIELD[p && p.id];
    const label = (p && p.name) || (p && p.id) || 'unnamed pot';
    if (p && p.confirmed === true && field && Number.isFinite(p.balance) && (p.currency === 'GBP' || p.currency === 'AUD')) {
      pots[field] = { amount: p.balance, currency: p.currency };
      used.push(label);
    } else {
      skipped.push(label + (p && p.confirmed !== true ? ' (not confirmed)' : ''));
    }
  }
  if (Object.keys(pots).length) answers.q49 = { v: pots };

  for (const t of Array.isArray(seed.timeline) ? seed.timeline : []) {
    const q = TIMELINE_Q[t && t.id];
    const label = (t && t.name) || (t && t.id) || 'unnamed event';
    if (t && t.confirmed === true && q && MONTH_RE.test(t.date || '')) { answers[q] = { v: t.date }; used.push(label); }
    else if (q || (t && t.confirmed !== true)) skipped.push(label + (t && t.confirmed !== true ? ' (not confirmed)' : ''));
    // confirmed items with no question mapping (e.g. "training lasts 18 months") are already the app's defaults.
  }
  if (seed.assumptions) skipped.push('assumptions (placeholders — set them in onboarding)');

  const backup = { app: 'forge', kind: 'onboarding-answers', v: 1, exportedAt: now(), mode: 'quick', answers };
  return { backup, used, skipped };
}
