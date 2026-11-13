// T5.1: planner-ai edge function, tested in Node with mocked auth, usage counter and model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, LIMITS, DEFAULTS, sanitiseScenario, readModelResponse, cleanProposal, buildModelRequest } from '../supabase/functions/planner-ai/handler.js';
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, TEMPLATES, ANSWER_IDS } from '../supabase/functions/planner-ai/prompt.js';
import { TEMPLATES as ENGINE_TEMPLATES } from '../src/engine/events.js';
import { QUESTIONS } from '../src/onboarding/questions.js';

const KEY = 'sk-ant-api03-SECRET-KEY-do-not-leak';
const TOKEN = 'eyJhbGciOi.user-token.sig';
const ORIGIN = 'https://harveybetts.github.io';
const URL_ = 'https://proj.supabase.co/functions/v1/planner-ai';

const SCENARIO = {
  schemaVersion: 1, name: 'Main plan', baseCurrency: 'GBP', start: '2026-11', birth: '2000-01', retirementAge: 55,
  openingPot: 20000,
  assumptions: { nominalReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, retirementSpend: 40000 },
  items: [{ id: 'investing', name: 'Monthly investing', kind: 'income', steps: [{ from: '2026-11', monthly: 500 }], from: '2026-11' }],
  pots: [{ id: 'isa', name: 'Stocks ISA', kind: 'invested', balance: 20000, accessAge: 0 }],
  events: [],
};

function modelReply(obj, extra = {}) {
  return { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: JSON.stringify(obj) }], usage: {}, ...extra };
}
const EMPTY = { summary: '', changes: [] };
const NONE = { template: 'none', name: '', paramsJson: '{}', questionId: 'none', valueJson: 'null', assumed: [] };

function setup({ env = {}, user = { id: 'user-1' }, allowed = true, reply = modelReply({ answer: 'You are on track.', proposal: EMPTY }) } = {}) {
  const calls = { getUser: [], bump: [], model: [], logs: [] };
  const vars = { ANTHROPIC_API_KEY: KEY, SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret', ...env };
  const handler = createHandler({
    env: { get: (k) => vars[k] },
    getUser: async (t) => { calls.getUser.push(t); if (user instanceof Error) throw user; return user; },
    bumpUsage: async (id, cap) => { calls.bump.push([id, cap]); if (allowed instanceof Error) throw allowed; return allowed; },
    callModel: async (p) => { calls.model.push(p); if (reply instanceof Error) throw reply; return typeof reply === 'function' ? reply(p) : reply; },
    now: () => new Date('2026-11-13T10:00:00Z'),
    log: (e, f) => calls.logs.push(JSON.stringify({ e, ...f })),
  });
  return { handler, calls };
}

function req(body, { method = 'POST', auth = `Bearer ${TOKEN}`, origin = ORIGIN, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (auth) h.Authorization = auth;
  if (origin) h.Origin = origin;
  return new Request(URL_, { method, headers: h, body: method === 'POST' || method === 'PUT' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
}
const ask = (extra = {}) => ({ question: 'Am I on track to retire at 55?', scenario: SCENARIO, summary: { targetPot: 1000000, coastNumber: 250000, coasting: false }, ...extra });
async function json(res) { const t = await res.text(); return t ? JSON.parse(t) : null; }

// ---------------- CORS / method ----------------
test('preflight from the app origin is allowed and echoes the origin', async () => {
  const { handler, calls } = setup();
  const res = await handler(req(null, { method: 'OPTIONS', auth: null }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /authorization/);
  assert.equal(calls.getUser.length, 0);
});

test('other websites are refused before any work is done', async () => {
  const { handler, calls } = setup();
  const res = await handler(req(ask(), { origin: 'https://evil.example' }));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual([calls.getUser.length, calls.bump.length, calls.model.length], [0, 0, 0]);
});

test('ALLOWED_ORIGIN can list several origins (e.g. a local dev server)', async () => {
  const { handler } = setup({ env: { ALLOWED_ORIGIN: 'https://harveybetts.github.io, http://localhost:8080' } });
  const res = await handler(req(ask(), { origin: 'http://localhost:8080' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8080');
});

test('only POST is accepted', async () => {
  const { handler } = setup();
  assert.equal((await handler(req(null, { method: 'GET' }))).status, 405);
});

// ---------------- auth ----------------
test('no sign-in → 401 and nothing else runs', async () => {
  const { handler, calls } = setup();
  for (const auth of [null, 'Basic abc', 'Bearer', 'token-without-scheme']) {
    const res = await handler(req(ask(), { auth }));
    assert.equal(res.status, 401, String(auth));
    assert.equal((await json(res)).code, 'auth');
  }
  assert.deepEqual([calls.getUser.length, calls.bump.length, calls.model.length], [0, 0, 0]);
});

test('invalid or expired token → 401 (getUser null or throwing)', async () => {
  for (const user of [null, new Error(`jwt expired ${TOKEN}`), { id: '' }]) {
    const { handler, calls } = setup({ user });
    const res = await handler(req(ask()));
    assert.equal(res.status, 401);
    const text = JSON.stringify(await json(res));
    assert.ok(!text.includes(TOKEN));
    assert.deepEqual(calls.getUser, [TOKEN]);
    assert.equal(calls.bump.length + calls.model.length, 0);
  }
});

// ---------------- input checks (none of these use up the daily allowance) ----------------
test('bad requests are rejected before the allowance is counted', async () => {
  const cases = [
    [req('not json'), 400, 'bad_json'],
    [req('[1,2]'), 400, 'bad_json'],
    [req(ask({ question: '   ' })), 400, 'no_question'],
    [req(ask({ question: 42 })), 400, 'no_question'],
    [req(ask({ question: 'x'.repeat(LIMITS.question + 1) })), 413, 'question_too_long'],
    [req(ask({ scenario: undefined })), 400, 'no_scenario'],
    [req(ask({ scenario: [1] })), 400, 'no_scenario'],
    [req(ask({ scenario: { ...SCENARIO, items: Array.from({ length: 400 }, (_, i) => ({ id: `i${i}`, name: 'An expense item with a longish name', kind: 'expense', monthly: 10 })) } })), 413, 'plan_too_big'],
    [req(ask({ history: [{ role: 'assistant', text: 'hi' }] })), 400, 'bad_history'],
    [req(ask({ history: [{ role: 'user', text: 'a' }] })), 400, 'bad_history'],
    [req(ask({ history: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'x'.repeat(LIMITS.historyChars + 1) }] })), 400, 'bad_history'],
    [req(ask({ history: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'q' })) })), 400, 'bad_history'],
  ];
  for (const [r, status, code] of cases) {
    const { handler, calls } = setup();
    const res = await handler(r);
    const b = await json(res);
    assert.equal(res.status, status, code);
    assert.equal(b.code, code);
    assert.equal(calls.bump.length, 0, `${code} must not count against the cap`);
    assert.equal(calls.model.length, 0);
  }
});

test('oversized bodies → 413 (declared length and actual length)', async () => {
  const { handler, calls } = setup();
  const big = JSON.stringify(ask({ padding: 'x'.repeat(LIMITS.bodyBytes) }));
  assert.equal((await handler(req(big))).status, 413);
  assert.equal((await handler(req('{}', { headers: { 'Content-Length': String(LIMITS.bodyBytes + 1) } }))).status, 413);
  assert.equal(calls.bump.length + calls.model.length, 0);
});

// ---------------- daily cap ----------------
test('daily cap: over the limit → 429 and the model is never called', async () => {
  const { handler, calls } = setup({ allowed: false });
  const res = await handler(req(ask()));
  assert.equal(res.status, 429);
  const b = await json(res);
  assert.equal(b.code, 'daily_cap');
  assert.equal(b.cap, DEFAULTS.dailyCap);
  assert.deepEqual(calls.bump, [['user-1', DEFAULTS.dailyCap]]);
  assert.equal(calls.model.length, 0);
});

test('daily cap comes from AI_DAILY_CAP; junk values fall back to the default', async () => {
  for (const [v, want] of [['5', 5], ['0', 0], ['-3', DEFAULTS.dailyCap], ['lots', DEFAULTS.dailyCap], ['2.5', DEFAULTS.dailyCap]]) {
    const { handler, calls } = setup({ env: { AI_DAILY_CAP: v } });
    await handler(req(ask()));
    assert.equal(calls.bump[0][1], want, v);
  }
});

test('usage counter failing → 503, model not called (fails closed)', async () => {
  const { handler, calls } = setup({ allowed: new Error('db down: service-role-secret') });
  const res = await handler(req(ask()));
  assert.equal(res.status, 503);
  assert.ok(!JSON.stringify(await json(res)).includes('service-role-secret'));
  assert.equal(calls.model.length, 0);
});

test('a truthy-but-not-true usage result is not treated as allowed', async () => {
  const { handler, calls } = setup({ allowed: 'yes' });
  assert.equal((await handler(req(ask()))).status, 429);
  assert.equal(calls.model.length, 0);
});

// ---------------- the model request ----------------
test('happy path: answer + proposal; request uses the documented API shape', async () => {
  const { handler, calls } = setup();
  const res = await handler(req(ask()));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await json(res), { answer: 'You are on track.', proposal: null, model: 'claude-opus-5-5' });
  const p = calls.model[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.max_tokens, LIMITS.maxTokens);
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.equal(p.output_config.effort, 'medium');
  assert.deepEqual(p.output_config.format, { type: 'json_schema', schema: OUTPUT_SCHEMA });
  assert.deepEqual(p.system, [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]);
  // Opus 5.5: thinking is always on; no disabled thinking, budgets, sampling params or prefill.
  for (const k of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice']) assert.ok(!(k in p), k);
  assert.equal(p.messages.at(-1).role, 'user');
  const content = p.messages.at(-1).content;
  assert.match(content, /Today is 2026-11\./);
  assert.match(content, /<question>\nAm I on track to retire at 55\?\n<\/question>/);
  assert.match(content, /"coastNumber":250000/);
});

test('model and effort can be overridden by secrets; bad effort falls back to medium', async () => {
  let s = setup({ env: { ANTHROPIC_MODEL: 'claude-sonnet-5-5', AI_EFFORT: 'low' } });
  await s.handler(req(ask()));
  assert.equal(s.calls.model[0].model, 'claude-sonnet-5-5');
  assert.equal(s.calls.model[0].output_config.effort, 'low');
  s = setup({ env: { AI_EFFORT: 'turbo' } });
  await s.handler(req(ask()));
  assert.equal(s.calls.model[0].output_config.effort, 'medium');
});

test('only plan data reaches the model (budget, transactions, notes are dropped)', async () => {
  const { handler, calls } = setup();
  const scenario = {
    ...SCENARIO,
    budget: { entries: { '2026-11-09': { groceries: -82.5 } } },
    transactions: [{ desc: 'WOOLWORTHS SYDNEY', amount: -82.5 }],
    notes: 'my bank password is hunter2',
    items: [{ ...SCENARIO.items[0], memo: 'BSB 062-000 acct 1234', steps: [{ from: '2026-11', monthly: 500, account: '1234' }] }],
    pots: [{ ...SCENARIO.pots[0], accountNumber: '12345678' }],
  };
  await handler(req(ask({ scenario, summary: { coastNumber: 1, nested: { a: 1 }, 'bad key': 2, label: 'x'.repeat(500) } })));
  const content = calls.model[0].messages.at(-1).content;
  for (const leak of ['WOOLWORTHS', 'hunter2', 'BSB', '12345678', '"account"', 'groceries', 'nested', 'bad key']) assert.ok(!content.includes(leak), leak);
  assert.match(content, /"Monthly investing"/);
  assert.ok(!content.includes('x'.repeat(201)), 'long summary strings are trimmed');
});

test('earlier messages are sent as alternating turns before the new question', async () => {
  const { handler, calls } = setup();
  const history = [{ role: 'user', text: 'What if I retire at 50?' }, { role: 'assistant', text: 'You would need about £1.2m.' }];
  await handler(req(ask({ history })));
  const m = calls.model[0].messages;
  assert.deepEqual(m.slice(0, 2), [{ role: 'user', content: 'What if I retire at 50?' }, { role: 'assistant', content: 'You would need about £1.2m.' }]);
  assert.equal(m[2].role, 'user');
});

// ---------------- the model's reply ----------------
test('refusal → friendly 200 with refused:true (no raw model text)', async () => {
  const { handler } = setup({ reply: { stop_reason: 'refusal', content: [], stop_details: { category: 'cyber' } } });
  const res = await handler(req(ask()));
  assert.equal(res.status, 200);
  const b = await json(res);
  assert.equal(b.refused, true);
  assert.equal(b.proposal, null);
  assert.match(b.answer, /can’t help/);
});

test('truncated or malformed replies → 502 with a readable message', async () => {
  for (const [reply, code] of [
    [{ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"answer":"Long' }] }, 'truncated'],
    [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }, 'bad_output'],
    [{ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"answer":""}' }] }, 'bad_output'],
    [null, 'bad_output'],
  ]) {
    const { handler } = setup({ reply });
    const res = await handler(req(ask()));
    assert.equal(res.status, 502, code);
    assert.equal((await json(res)).code, code);
  }
});

test('upstream failure never leaks the API key, the token, the question or the upstream message', async () => {
  const err = Object.assign(new Error(`401 invalid x-api-key ${KEY} for token ${TOKEN}`), { status: 401 });
  const { handler, calls } = setup({ reply: err });
  const q = 'My secret question about my divorce settlement';
  const res = await handler(req(ask({ question: q })));
  assert.equal(res.status, 502);
  const body = await res.text();
  for (const s of [KEY, TOKEN, q, 'invalid x-api-key', 'service-role-secret']) {
    assert.ok(!body.includes(s), `response leaked ${s}`);
    assert.ok(!calls.logs.join('\n').includes(s), `log leaked ${s}`);
  }
  assert.match(calls.logs.join('\n'), /"upstream":401/);
});

test('logs carry status codes only, never the question or plan', async () => {
  const { handler, calls } = setup();
  await handler(req(ask({ question: 'Can I afford private school for two kids?' })));
  const logs = calls.logs.join('\n');
  assert.ok(!logs.includes('private school'));
  assert.ok(!logs.includes('Main plan'));
  assert.match(logs, /"code":"ok"/);
});

test('answers are capped in length', async () => {
  const { handler } = setup({ reply: modelReply({ answer: 'a'.repeat(LIMITS.answerChars + 500), proposal: EMPTY }) });
  const b = await json(await handler(req(ask())));
  assert.equal(b.answer.length, LIMITS.answerChars);
});

test('proposals: valid changes kept and parsed; invalid ones dropped; max 5', async () => {
  const good = { ...NONE, kind: 'addEvent', template: 'oneOffTrip', name: 'Dirt-bike trip', paramsJson: '{"at":"2028-06","cost":3000,"name":"Dirt-bike trip"}', assumed: ['cost'] };
  const changes = [
    good,
    { ...NONE, kind: 'setAnswer', questionId: 'q4', valueJson: '57' },
    { ...NONE, kind: 'addEvent', template: 'speedbirdPathway', paramsJson: '{}' },   // not AI-proposable
    { ...NONE, kind: 'addEvent', template: 'car', paramsJson: 'not json' },
    { ...NONE, kind: 'addEvent', template: 'car', paramsJson: '[1]' },
    { ...NONE, kind: 'setAnswer', questionId: 'q1', valueJson: '"1990-01"' },       // not allowed
    { ...NONE, kind: 'setAnswer', questionId: 'q63', valueJson: 'null' },
    { ...NONE, kind: 'deleteEverything' },
  ];
  const { handler } = setup({ reply: modelReply({ answer: 'Here is a what-if.', proposal: { summary: 'Add the trip and retire at 57.', changes } }) });
  const b = await json(await handler(req(ask())));
  assert.equal(b.proposal.summary, 'Add the trip and retire at 57.');
  assert.deepEqual(b.proposal.changes, [
    { kind: 'addEvent', template: 'oneOffTrip', name: 'Dirt-bike trip', params: { at: '2028-06', cost: 3000, name: 'Dirt-bike trip' }, assumed: ['cost'] },
    { kind: 'setAnswer', questionId: 'q4', value: 57, assumed: [] },
  ]);
  // Only the first 5 are considered at all.
  const many = Array.from({ length: 9 }, () => good);
  assert.equal(cleanProposal({ summary: '', changes: many }).changes.length, LIMITS.changes);
  assert.equal(cleanProposal({ summary: '', changes: [] }), null);
  assert.equal(cleanProposal({ summary: 'x', changes: [{ ...good, paramsJson: JSON.stringify({ pad: 'x'.repeat(LIMITS.paramsChars) }) }] }), null);
});

test('fallback-served replies are accepted and logged', async () => {
  const reply = modelReply({ answer: 'ok', proposal: EMPTY }, { model: 'claude-opus-5', usage: { iterations: [{ type: 'message' }, { type: 'fallback_message' }] } });
  const { handler, calls } = setup({ reply });
  const res = await handler(req(ask()));
  assert.equal(res.status, 200);
  assert.equal((await json(res)).model, 'claude-opus-5');
  assert.match(calls.logs.join('\n'), /"fellBack":true/);
});

// ---------------- prompt + schema invariants ----------------
test('output schema only uses structured-output-safe JSON Schema (all props required, no extras)', () => {
  const walk = (s, path) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false, path);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), path);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    } else if (s.type === 'array') walk(s.items, `${path}[]`);
    else assert.ok(['string', 'number', 'integer', 'boolean'].includes(s.type), path);
  };
  walk(OUTPUT_SCHEMA, '$');
});

test('AI-proposable templates and answers exist in the engine / question bank', () => {
  for (const t of TEMPLATES) assert.ok(ENGINE_TEMPLATES[t], t);
  assert.ok(!TEMPLATES.includes('speedbirdPathway'));
  const ids = new Set(QUESTIONS.map((q) => q.id));
  for (const id of ANSWER_IDS) assert.ok(ids.has(id), id);
  for (const t of TEMPLATES) assert.ok(SYSTEM_PROMPT.includes(`- ${t}: {`), `prompt documents ${t}`);
});

test('system prompt carries the non-negotiables', () => {
  assert.match(SYSTEM_PROMPT, /TODAY'S money/);
  assert.match(SYSTEM_PROMPT, /not a regulated financial adviser and this is not financial advice/);
  assert.match(SYSTEM_PROMPT, /ranges/);
  assert.match(SYSTEM_PROMPT, /Never invent facts/);
  assert.match(SYSTEM_PROMPT, /Never say "guaranteed"/);
  assert.match(SYSTEM_PROMPT, /Nothing is applied automatically/);
  assert.ok(!/\bguaranteed\b/i.test(SYSTEM_PROMPT.replace('Never say "guaranteed"', '')), 'only the prohibition mentions it');
});

test('sanitiseScenario keeps engine fields; buildModelRequest never puts the key anywhere', () => {
  const s = sanitiseScenario({ ...SCENARIO, events: [{ id: 'e1', template: 'holiday', params: { perYear: 2 } }, { nope: 1 }] });
  assert.deepEqual(s.events, [{ id: 'e1', template: 'holiday', params: { perYear: 2 } }]);
  assert.equal(sanitiseScenario('x'), null);
  const p = buildModelRequest({ model: 'm', effort: 'medium', question: 'q', scenario: s, summary: {}, today: '2026-11' });
  assert.ok(!JSON.stringify(p).includes('sk-ant'));
});

test('readModelResponse ignores thinking/fallback blocks and joins text', () => {
  const r = readModelResponse({ stop_reason: 'end_turn', model: 'x', content: [
    { type: 'thinking', thinking: 'hmm' }, { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
    { type: 'text', text: '{"answer":"Hi",' }, { type: 'text', text: '"proposal":{"summary":"","changes":[]}}' },
  ] });
  assert.deepEqual(r, { ok: true, answer: 'Hi', proposal: null, model: 'x', fellBack: false });
});
