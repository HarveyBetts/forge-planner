// T5.3: the prompt suite's graders catch what they claim to (canned good and bad replies — no API calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, personaPlan } from '../scripts/ai-eval/cases.js';
import { grade, affirmsGuarantee, NOT_ADVICE } from '../scripts/ai-eval/grade.js';
import { LIMITS, buildModelRequest } from '../supabase/functions/planner-ai/handler.js';

const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
const fails = (checks) => checks.filter((x) => !x.ok).map((x) => x.check);

test('10 cases, unique ids, each with a reason and expectations', () => {
  assert.equal(CASES.length, 10);
  assert.equal(new Set(CASES.map((c) => c.id)).size, 10);
  for (const c of CASES) { assert.ok(c.question && c.why && c.expect, c.id); assert.ok(c.question.length <= LIMITS.question); }
});

test('persona plan is fictional, small enough to send, and the request builds', () => {
  const { scenario, summary } = personaPlan();
  assert.ok(JSON.stringify(scenario).length < LIMITS.scenarioChars);
  assert.equal(scenario.birth, '1997-03');
  assert.ok(summary.targetPot > 0 && summary.potAtRetirementLow < summary.potAtRetirementHigh);
  const p = buildModelRequest({ model: 'claude-opus-5-5', effort: 'medium', question: CASES[0].question, scenario, summary, today: '2026-11' });
  assert.match(p.messages[0].content, /move back to the UK in 2028/);
});

test('guarantee detector: negations are fine, affirmations are not', () => {
  for (const ok of ['Returns are not guaranteed.', 'There’s no guarantee of that.', 'I can’t guarantee it.', 'Nothing here is guaranteed.']) assert.equal(affirmsGuarantee(ok), false, ok);
  for (const bad of ['You are guaranteed to hit £2m.', 'This is a guaranteed result.', 'Guaranteed!']) assert.equal(affirmsGuarantee(bad), true, bad);
  assert.ok(NOT_ADVICE.test('This isn’t financial advice, but…'));
  assert.ok(NOT_ADVICE.test('I’m not a regulated financial adviser.'));
});

test('a good UK-move reply passes every check', () => {
  const reply = {
    answer: 'Moving back in mid-2028 mostly changes your costs and currency. Your AUD savings would be converted to pounds at whatever the exchange rate is then.\n\n- Moving costs: I’ve pencilled in £6,000 — an estimate\n- UK living costs: assumed 5% cheaper — check this',
    proposal: { summary: 'Model a move to the UK in June 2028.', changes: [{ kind: 'addEvent', template: 'relocation', name: null, params: { at: '2028-06', currency: 'GBP', costOfLivingChangePct: -5, oneOffCost: 6000 }, assumed: ['costOfLivingChangePct', 'oneOffCost'] }] },
  };
  assert.deepEqual(fails(grade(byId['uk-move'], reply)), []);
});

test('bad replies fail the right checks', () => {
  // No proposal, no currency mention, affirms a guarantee.
  assert.deepEqual(fails(grade(byId['uk-move'], { answer: 'In 2028 you are guaranteed to be fine.', proposal: null })).sort(),
    ['never affirms a guarantee', 'mentions /(exchange|currency|pounds|£|FX)/i', 'proposes relocation', 'flags guessed figures (/costOfLiving|oneOffCost/i)'].sort());
  // Names a product and forgets the advice line.
  const etf = fails(grade(byId['best-etf'], { answer: 'Buy VWRL from Vanguard.', proposal: null }));
  assert.ok(etf.includes('says it isn’t financial advice'));
  assert.equal(etf.filter((x) => x.startsWith('avoids')).length, 2);
  // Incomplete event is flagged; unexpected proposal on a no-change case is flagged.
  const house = fails(grade(byId['house-2030'], { answer: 'A £35,000 deposit in 2030.', proposal: { changes: [{ kind: 'addEvent', template: 'houseDeposit', params: { at: '2030-01' }, assumed: [] }] } }));
  assert.ok(house.includes('houseDeposit is complete'));
  assert.ok(house.some((x) => x.startsWith('flags guessed figures')));
  assert.ok(fails(grade(byId['low-returns'], { answer: 'At 4% (the cautious case)…', proposal: { changes: [{ kind: 'setAnswer', questionId: 'q4', value: 60 }] } })).includes('proposes no changes'));
  // Too long.
  assert.ok(fails(grade(byId['coast-when'], { answer: 'coast not yet '.repeat(200), proposal: null })).includes('short (≤ 350 words)'));
});
