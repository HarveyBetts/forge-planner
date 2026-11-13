// T5.3: deterministic checks for one AI planner reply. PURE (unit-tested in tests/ai-eval.test.js).
//   grade(caseDef, reply) -> [{ check, ok, detail }]   reply = { answer, proposal } as the edge function returns it
import { eventProblems } from '../../src/engine/events.js';

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// "guaranteed" is only OK when negated ("not guaranteed", "no guarantee", "can't guarantee").
export function affirmsGuarantee(text) {
  const t = String(text || '');
  for (const m of t.matchAll(/\bguarantee(d|s)?\b/gi)) {
    const before = t.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (!/\b(not|no|never|can[’']?t|cannot|isn[’']?t|aren[’']?t|nothing|without|won[’']?t)\b[^.]*$/.test(before)) return true;
  }
  return false;
}
export const NOT_ADVICE = /(not (regulated )?financial advice|not (a )?(regulated )?(financial )?advi[sc]e|not a (regulated )?financial advis[eo]r|isn[’']?t (regulated )?financial advice)/i;

export function grade(c, reply) {
  const out = [];
  const add = (check, ok, detail = '') => out.push({ check, ok: !!ok, detail });
  const answer = String(reply && reply.answer || '');
  const changes = (reply && reply.proposal && Array.isArray(reply.proposal.changes)) ? reply.proposal.changes : [];
  const e = c.expect || {};

  add('answers', answer.trim().length > 0);
  add('short (≤ 350 words)', words(answer) <= 350, `${words(answer)} words`);
  add('never affirms a guarantee', !affirmsGuarantee(answer));
  add('today’s-money framing kept (no “in 2050 money”)', !/\bin (19|20)\d\d (money|pounds|dollars)\b/i.test(answer) || /today[’']?s money/i.test(answer));
  if (e.notAdvice) add('says it isn’t financial advice', NOT_ADVICE.test(answer));
  for (const re of e.mentions || []) add(`mentions ${re}`, re.test(answer));
  for (const re of e.forbids || []) add(`avoids ${re}`, !re.test(answer));

  if (e.proposal === 'none') add('proposes no changes', changes.length === 0, `${changes.length} proposed`);
  else if (Array.isArray(e.proposal)) {
    for (const want of e.proposal) {
      const hit = changes.find((ch) => ch.kind === want.kind && (!want.template || ch.template === want.template) && (!want.questionId || ch.questionId === want.questionId));
      add(`proposes ${want.template || want.questionId || want.kind}`, !!hit);
    }
  }
  // Every proposed event must be complete enough to add (or the app shows "Fill in" — acceptable but noted).
  for (const ch of changes.filter((x) => x.kind === 'addEvent')) {
    const p = eventProblems({ template: ch.template, params: ch.params });
    add(`${ch.template} is complete`, p.length === 0, p.join(' '));
  }
  if (e.assumedLike) {
    const flagged = changes.some((ch) => (ch.assumed || []).some((a) => e.assumedLike.test(a)));
    add(`flags guessed figures (${e.assumedLike})`, flagged, JSON.stringify(changes.map((ch) => ch.assumed || [])));
  }
  return out;
}
