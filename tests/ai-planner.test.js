// T5.2: client side of the AI planner — request building, readable diffs, apply only what was accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askBody, trimHistory, addTurn, describeChange, applyChanges, answerBlocks, planForAI, MAX_QUESTION, SUGGESTIONS } from '../src/ai/planner.js';
import { createSupabase } from '../src/data/supabase.js';
import { createMockSupabase } from './fixtures/mock-supabase.js';
import { createHandler } from '../supabase/functions/planner-ai/handler.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const ANSWERS = { q1: { v: '1997-03' }, q4: { v: 55 }, q63: { v: gbp(40000) } };
const SCEN = { schemaVersion: 1, baseCurrency: 'GBP', start: '2026-11', birth: '1997-03', retirementAge: 55, assumptions: { nominalReturn: 0.07 },
  items: [{ id: 'investing', kind: 'income', monthly: 500 }, { id: 'ev-1:holidays', kind: 'expense', annual: 3000, eventId: 'ev-1' }],
  oneOffs: [{ at: '2028-01', amount: -2000, name: 'Trip', eventId: 'ev-2' }, { at: '2027-09', amount: -1000, name: 'Training' }],
  pots: [{ id: 'isa', kind: 'invested', balance: 80000 }], events: [] };
const trip = { kind: 'addEvent', template: 'oneOffTrip', name: 'Dirt-bike trip', params: { at: '2028-06', cost: 4000, name: 'Dirt-bike trip' }, assumed: [] };

test('askBody: trims, requires a question and a plan, caps length', () => {
  assert.deepEqual(askBody({ question: '  hi  ', scenario: SCEN }).body.question, 'hi');
  assert.match(askBody({ question: '   ', scenario: SCEN }).error, /Type a question/);
  assert.match(askBody({ question: 'x'.repeat(MAX_QUESTION + 1), scenario: SCEN }).error, /under 2,000/);
  assert.match(askBody({ question: 'hi', scenario: null }).error, /quick-start/);
  assert.equal(SUGGESTIONS.length, 4);
});

test('planForAI sends the plan as answers + events build it: no generated rows, no budget', () => {
  const p = planForAI({ ...SCEN, budget: { secret: 1 } }, [{ id: 'ev-1', template: 'holiday', params: { perYear: 2 }, assumed: ['costEach'], source: 'ai' }]);
  assert.deepEqual(p.items.map((i) => i.id), ['investing']);
  assert.deepEqual(p.oneOffs.map((o) => o.name), ['Training']);
  assert.deepEqual(p.events, [{ id: 'ev-1', template: 'holiday', params: { perYear: 2 } }]);
  assert.ok(!('budget' in p));
  assert.equal(planForAI(null), null);
});

test('history: last 3 exchanges, alternating, starting with the user', () => {
  let h = [];
  for (let i = 1; i <= 5; i++) h = addTurn(h, `q${i}`, `a${i}`);
  assert.deepEqual(h.map((m) => m.text), ['q3', 'a3', 'q4', 'a4', 'q5', 'a5']);
  assert.deepEqual(trimHistory([{ role: 'assistant', text: 'x' }, { role: 'user', text: 'q' }, { role: 'assistant', text: 'a' }]).map((m) => m.text), ['q', 'a']);
  assert.deepEqual(trimHistory([{ role: 'user', text: 'q' }, { role: 'user', text: 'q2' }]), []);
  assert.deepEqual(trimHistory('junk'), []);
  assert.equal(trimHistory([{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a'.repeat(5000) }])[1].text.length, 2000);
});

test('describeChange: readable rows, estimates flagged, engine problems surfaced', () => {
  const d = describeChange({ ...trip, assumed: ['cost'] }, { currency: 'GBP' });
  assert.equal(d.title, 'Add a trip: Dirt-bike trip');
  assert.equal(d.detail, 'Jun 2028 · £4,000');
  assert.deepEqual(d.estimate, ['cost']);
  assert.deepEqual(d.problems, []);
  const missing = describeChange({ kind: 'addEvent', template: 'holiday', name: 'Holidays', params: { perYear: 2, from: '2027-01' }, assumed: [] });
  assert.ok(missing.problems.some((p) => /cost of each holiday/.test(p)));
  const child = describeChange({ kind: 'addEvent', template: 'child', name: 'Child 1', params: { birth: '2031-05', costBands: [{ fromAge: 0, toAge: 18, annual: 9000 }], school: { fromAge: 11, toAge: 18, annualFee: 20000 } }, assumed: ['costBands', 'school.annualFee'] });
  assert.equal(child.title, 'Add a child: Child 1');
  assert.match(child.detail, /May 2031 · £9,000\/yr age 0–18 · school £20,000\/yr from 11/);
  const age = describeChange({ kind: 'setAnswer', questionId: 'q4', value: 57 }, { answers: ANSWERS });
  assert.deepEqual([age.title, age.detail, age.problems], ['Stop work at a different age', '55 → 57', []]);
  assert.ok(describeChange({ kind: 'setAnswer', questionId: 'q4', value: 12 }, { answers: ANSWERS }).problems.length);
  const spend = describeChange({ kind: 'setAnswer', questionId: 'q63', value: gbp(35000) }, { answers: ANSWERS });
  assert.equal(spend.detail, '£40,000/yr → £35,000/yr');
  assert.ok(describeChange({ kind: 'setAnswer', questionId: 'q63', value: 5 }, { answers: ANSWERS }).problems.length);
  assert.ok(describeChange({ kind: 'nuke' }).problems.length);
  const move = describeChange({ kind: 'addEvent', template: 'relocation', params: { at: '2028-03', currency: 'GBP', costOfLivingChangePct: -10, oneOffCost: 6000 }, assumed: [] });
  assert.equal(move.detail, 'Mar 2028 · to GBP · living costs -10% · £6,000 to move');
});

test('applyChanges: only accepted, valid changes; never mutates; marks AI events and estimates', () => {
  const events = [{ id: 'ev-1', template: 'holiday', params: { perYear: 1, costEach: 2000, from: '2027-01' } }];
  const answers = { ...ANSWERS };
  let n = 0;
  const out = applyChanges({ events, answers }, [
    { ...trip, assumed: ['cost'] },
    { kind: 'setAnswer', questionId: 'q4', value: 57 },
    { kind: 'setAnswer', questionId: 'q63', value: { amount: 35000 } },
    { kind: 'addEvent', template: 'holiday', params: { perYear: 2 } }, // invalid → skipped
  ], { base: 'GBP', newId: () => `ev-new-${++n}` });
  assert.equal(events.length, 1, 'input untouched');
  assert.equal(answers.q4.v, 55, 'input untouched');
  assert.deepEqual(out.events[1], { id: 'ev-new-1', template: 'oneOffTrip', params: { at: '2028-06', cost: 4000, name: 'Dirt-bike trip' }, assumed: ['cost'], source: 'ai' });
  assert.equal(out.events.length, 2);
  assert.equal(out.answers.q4.v, 57);
  assert.deepEqual(out.answers.q63.v, gbp(35000));
  assert.deepEqual(applyChanges({ events, answers }, []), { events, answers });
});

test('answerBlocks: paragraphs and bullet lists, markdown bold stripped', () => {
  assert.deepEqual(answerBlocks('First para.\nstill first.\n\n- one\n- **two**\n\nEnd.'), [
    { type: 'p', text: 'First para. still first.' }, { type: 'ul', items: ['one', 'two'] }, { type: 'p', text: 'End.' },
  ]);
  assert.deepEqual(answerBlocks('Options:\n1. Save more\n2. Retire later'), [{ type: 'p', text: 'Options:' }, { type: 'ul', items: ['Save more', 'Retire later'] }]);
  assert.deepEqual(answerBlocks(''), []);
});

// The client and the edge function agree end to end (mock Supabase in front, real handler behind).
test('sb.askPlanner talks to the planner-ai function with the signed-in token', async () => {
  const mock = createMockSupabase();
  const seen = [];
  const handler = createHandler({
    env: { get: () => '' },
    getUser: async (t) => { const id = mock.tokens.get(t); return id ? { id } : null; },
    bumpUsage: async () => true,
    callModel: async (p) => { seen.push(p); return { stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ answer: 'Yes.', proposal: { summary: 'Add it.', changes: [{ kind: 'addEvent', template: 'oneOffTrip', name: 'Trip', paramsJson: '{"at":"2028-06","cost":4000}', questionId: 'none', valueJson: 'null', assumed: [] }] } }) }] }; },
  });
  const fetch = async (url, init) => {
    if (new URL(url).pathname === '/functions/v1/planner-ai') {
      const res = await handler(new Request(url, { method: init.method, headers: init.headers, body: init.body }));
      return { ok: res.ok, status: res.status, text: () => res.text() };
    }
    return mock.fetch(url, init);
  };
  const storage = new Map();
  const sb = createSupabase({ url: 'https://abc.supabase.co', anonKey: 'anon', fetch, storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) } });
  await assert.rejects(sb.askPlanner(askBody({ question: 'hi', scenario: SCEN }).body), (e) => e.status === 401 && e.code === 'auth');
  await sb.signUp('a@b.co', 'secret123');
  const r = await sb.askPlanner(askBody({ question: 'Can I do the trip?', scenario: SCEN }).body);
  assert.equal(r.answer, 'Yes.');
  assert.deepEqual(r.proposal.changes[0].params, { at: '2028-06', cost: 4000 });
  assert.match(seen[0].messages.at(-1).content, /Can I do the trip\?/);
});
