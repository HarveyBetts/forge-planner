// Forge planner AI — the request handler, written as plain JS with every outside dependency injected so it
// runs (and is tested) in Node exactly as it runs in Deno. index.ts wires in Supabase + the Anthropic SDK.
//
// Rules (docs/SECURITY.md, CLAUDE.md §3): a valid signed-in user is required; a hard per-user daily cap is
// checked BEFORE the model is called; request and response sizes are capped; only plan data is forwarded
// (never budget/bank data); errors never echo secrets, tokens, upstream messages or the user's input.
//
//   createHandler({ env: { get(name) }, getUser(token), bumpUsage(userId, cap), callModel(params), now?, log? })
//     -> async (Request) => Response

import { SYSTEM_PROMPT, OUTPUT_SCHEMA, TEMPLATES, ANSWER_IDS } from './prompt.js';

export const LIMITS = {
  bodyBytes: 64000,      // whole request body
  question: 2000,        // characters
  scenarioChars: 20000,  // the sanitised plan, as JSON
  summaryChars: 4000,
  history: 6,            // earlier messages (3 exchanges)
  historyChars: 2000,    // per earlier message
  answerChars: 6000,     // what we send back
  summary: 300,
  changes: 5,
  paramsChars: 2000,
  name: 60,
  maxTokens: 12000,      // model output incl. thinking (Opus 5.5 always thinks)
};

export const DEFAULTS = {
  model: 'claude-opus-5-5',
  effort: 'medium',
  dailyCap: 20,
  origins: 'https://harveybetts.github.io',
};

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const str = (x, max) => String(x ?? '').slice(0, max);

// ---------- what may be sent to the model ----------
// Only plan fields, by whitelist. Anything else a client sends (budget, transactions, notes) is dropped.
const SCENARIO_KEYS = ['schemaVersion', 'name', 'baseCurrency', 'start', 'birth', 'retirementAge', 'openingPot',
  'investShare', 'redirectAfterCoast'];
const ASSUMPTION_KEYS = ['nominalReturn', 'inflation', 'withdrawalRate', 'retirementSpend', 'otherRetirementIncome', 'cashRealReturn'];
const ITEM_KEYS = ['id', 'name', 'kind', 'monthly', 'annual', 'from', 'to', 'off', 'eventId'];
const POT_KEYS = ['id', 'name', 'kind', 'balance', 'accessAge', 'originalCurrency'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

export function sanitiseScenario(s) {
  if (!isObj(s)) return null;
  const out = pick(s, SCENARIO_KEYS);
  if (isObj(s.assumptions)) out.assumptions = pick(s.assumptions, ASSUMPTION_KEYS);
  if (Array.isArray(s.items)) {
    out.items = s.items.filter(isObj).map((it) => {
      const o = pick(it, ITEM_KEYS);
      if (Array.isArray(it.steps)) o.steps = it.steps.filter(isObj).map((st) => pick(st, ['from', 'monthly']));
      return o;
    });
  }
  if (Array.isArray(s.oneOffs)) out.oneOffs = s.oneOffs.filter(isObj).map((o) => pick(o, ['at', 'amount', 'name', 'eventId']));
  if (Array.isArray(s.pots)) out.pots = s.pots.filter(isObj).map((p) => pick(p, POT_KEYS));
  if (Array.isArray(s.events)) {
    out.events = s.events.filter((e) => isObj(e) && typeof e.template === 'string')
      .map((e) => ({ id: e.id, template: e.template, ...(isObj(e.params) ? { params: e.params } : {}) }));
  }
  return out;
}

// The app's own computed results (target pot, coast number, …): numbers, short strings and booleans only.
export function sanitiseSummary(s) {
  if (!isObj(s)) return {};
  const out = {};
  for (const [k, v] of Object.entries(s).slice(0, 40)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue;
    if (isNum(v) || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (Array.isArray(v) && v.length <= 10 && v.every((x) => isNum(x) || typeof x === 'string')) out[k] = v.map((x) => (typeof x === 'string' ? x.slice(0, 120) : x));
  }
  return out;
}

// [{ role:'user'|'assistant', text }] — must alternate, start with the user and end with the assistant.
export function parseHistory(h) {
  if (h == null) return [];
  if (!Array.isArray(h) || h.length > LIMITS.history) return null;
  const out = [];
  for (let i = 0; i < h.length; i++) {
    const m = h[i];
    const role = i % 2 === 0 ? 'user' : 'assistant';
    if (!isObj(m) || m.role !== role || typeof m.text !== 'string' || !m.text.trim() || m.text.length > LIMITS.historyChars) return null;
    out.push({ role, content: m.text.trim() });
  }
  return out.length % 2 === 0 ? out : null;
}

// ---------- the model request ----------
export function buildModelRequest({ model, effort, question, scenario, summary, history = [], today }) {
  const content = [
    `Today is ${today}.`,
    '<scenario>', JSON.stringify(scenario), '</scenario>',
    '<summary>', JSON.stringify(summary), '</summary>',
    '<question>', question, '</question>',
  ].join('\n');
  return {
    model,
    max_tokens: LIMITS.maxTokens,
    // Server-side refusal fallback: if the model's safety classifiers decline, the API retries on Anthropic's
    // recommended fallback model inside the same call (beta, opt-in). See docs/DECISIONS.md D26.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [...history, { role: 'user', content }],
    output_config: { effort, format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
  };
}

// ---------- reading the model's reply ----------
function parseJsonObject(text, max) {
  if (typeof text !== 'string' || text.length > max) return undefined;
  try { const v = JSON.parse(text); return v; } catch { return undefined; }
}

export function cleanProposal(p) {
  if (!isObj(p) || !Array.isArray(p.changes)) return null;
  const changes = [];
  for (const c of p.changes.slice(0, LIMITS.changes)) {
    if (!isObj(c)) continue;
    const assumed = Array.isArray(c.assumed) ? c.assumed.filter((a) => typeof a === 'string').map((a) => a.slice(0, 60)).slice(0, 20) : [];
    if (c.kind === 'addEvent' && TEMPLATES.includes(c.template)) {
      const params = parseJsonObject(c.paramsJson, LIMITS.paramsChars);
      if (!isObj(params)) continue;
      changes.push({ kind: 'addEvent', template: c.template, name: str(c.name, LIMITS.name) || null, params, assumed });
    } else if (c.kind === 'setAnswer' && ANSWER_IDS.includes(c.questionId)) {
      const value = parseJsonObject(c.valueJson, 500);
      if (value === undefined || value === null) continue;
      changes.push({ kind: 'setAnswer', questionId: c.questionId, value, assumed });
    }
  }
  return changes.length ? { summary: str(p.summary, LIMITS.summary), changes } : null;
}

// -> { ok: true, answer, proposal, model, fellBack } | { ok: false, why: 'refusal' | 'truncated' | 'bad_output' }
export function readModelResponse(msg) {
  if (!isObj(msg)) return { ok: false, why: 'bad_output' };
  if (msg.stop_reason === 'refusal') return { ok: false, why: 'refusal' };
  if (msg.stop_reason === 'max_tokens') return { ok: false, why: 'truncated' };
  const text = (Array.isArray(msg.content) ? msg.content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { return { ok: false, why: 'bad_output' }; }
  if (!isObj(out) || typeof out.answer !== 'string' || !out.answer.trim()) return { ok: false, why: 'bad_output' };
  const fellBack = (msg.usage && Array.isArray(msg.usage.iterations) ? msg.usage.iterations : []).some((it) => it && it.type === 'fallback_message');
  return { ok: true, answer: out.answer.trim().slice(0, LIMITS.answerChars), proposal: cleanProposal(out.proposal), model: str(msg.model, 80), fellBack };
}

// ---------- HTTP ----------
export function createHandler(deps) {
  const env = (k) => { try { return deps.env.get(k) ?? ''; } catch { return ''; } };
  const log = deps.log || (() => {});
  const now = deps.now || (() => new Date());
  const origins = (env('ALLOWED_ORIGIN') || DEFAULTS.origins).split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const capRaw = env('AI_DAILY_CAP').trim();
  const cap = /^\d{1,6}$/.test(capRaw) ? Number(capRaw) : DEFAULTS.dailyCap;
  const model = env('ANTHROPIC_MODEL') || DEFAULTS.model;
  const effort = EFFORTS.includes(env('AI_EFFORT')) ? env('AI_EFFORT') : DEFAULTS.effort;

  return async function handle(req) {
    const origin = req.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(body == null ? null : JSON.stringify(body), {
      status, headers: { ...headers, ...(body == null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store' },
    });
    const fail = (status, code, error, extra = {}) => { log('planner-ai', { status, code }); return reply(status, { error, code, ...extra }); };

    if (origin && !origins.includes(origin)) return fail(403, 'origin', 'This site isn’t allowed to use Forge’s AI.');
    if (req.method === 'OPTIONS') return reply(204, null);
    if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

    // 1. Who is asking? (before reading the body, so strangers can't make us do any work)
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i);
    if (!m) return fail(401, 'auth', 'Sign in to use the AI planner.');
    let user = null;
    try { user = await deps.getUser(m[1]); } catch { user = null; }
    if (!user || typeof user.id !== 'string' || !user.id) return fail(401, 'auth', 'Your sign-in has expired. Sign in again to use the AI planner.');

    // 2. Read and check the request.
    const declared = Number(req.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > LIMITS.bodyBytes) return fail(413, 'too_big', 'That request is too big.');
    let raw;
    try { raw = await req.text(); } catch { return fail(400, 'bad_body', 'Couldn’t read that request.'); }
    if (new TextEncoder().encode(raw).length > LIMITS.bodyBytes) return fail(413, 'too_big', 'That request is too big.');
    let body;
    try { body = JSON.parse(raw); } catch { return fail(400, 'bad_json', 'That request wasn’t valid JSON.'); }
    if (!isObj(body)) return fail(400, 'bad_json', 'That request wasn’t valid JSON.');
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return fail(400, 'no_question', 'Ask a question first.');
    if (question.length > LIMITS.question) return fail(413, 'question_too_long', `Keep questions under ${LIMITS.question} characters.`);
    const scenario = sanitiseScenario(body.scenario);
    if (!scenario) return fail(400, 'no_scenario', 'Your plan wasn’t sent with the question.');
    if (JSON.stringify(scenario).length > LIMITS.scenarioChars) return fail(413, 'plan_too_big', 'Your plan is too big to send to the AI.');
    const summary = sanitiseSummary(body.summary);
    if (JSON.stringify(summary).length > LIMITS.summaryChars) return fail(413, 'summary_too_big', 'That request is too big.');
    const history = parseHistory(body.history);
    if (!history) return fail(400, 'bad_history', 'The conversation history wasn’t in the expected shape.');

    // 3. Daily cap — counted atomically in the database, checked before the model is called.
    let allowed;
    try { allowed = await deps.bumpUsage(user.id, cap); } catch { return fail(503, 'usage_check', 'Couldn’t check your AI allowance. Try again in a minute.'); }
    if (allowed !== true) return fail(429, 'daily_cap', `You’ve used today’s ${cap} AI questions. They reset at midnight (UTC).`, { cap });

    // 4. Ask the model.
    const params = buildModelRequest({ model, effort, question, scenario, summary, history, today: now().toISOString().slice(0, 7) });
    let msg;
    try { msg = await deps.callModel(params); } catch (e) {
      const status = e && Number.isInteger(e.status) ? e.status : 0; // HTTP status only — never the message
      log('planner-ai', { status: 502, code: 'upstream', upstream: status });
      return reply(502, { error: 'The AI service is unavailable right now. Try again in a minute.', code: 'upstream' });
    }
    const r = readModelResponse(msg);
    if (!r.ok && r.why === 'refusal') {
      log('planner-ai', { status: 200, code: 'refusal' });
      return reply(200, { answer: 'I can’t help with that one. Try rephrasing it as a question about your plan.', proposal: null, refused: true });
    }
    if (!r.ok) return fail(502, r.why, r.why === 'truncated' ? 'That answer ran too long. Try a narrower question.' : 'The AI’s reply didn’t make sense. Try again.');
    log('planner-ai', { status: 200, code: 'ok', fellBack: r.fellBack, changes: r.proposal ? r.proposal.changes.length : 0 });
    return reply(200, { answer: r.answer, proposal: r.proposal, model: r.model });
  };
}
