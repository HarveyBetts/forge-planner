#!/usr/bin/env node
// Runs the REAL planner-ai edge function (index.ts, real supabase-js + Anthropic SDK) under Deno, pointed at a
// local stand-in for Supabase Auth, PostgREST and the Anthropic API, and checks the wire traffic end to end.
// Needs Deno: uses $DENO, else `deno` on PATH, else `npx --yes deno@2.9.6`. Not part of `npm run check`.
//   npm run test:ai-local
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fnDir = join(here, '..', 'supabase', 'functions', 'planner-ai');
const KEY = 'sk-ant-local-test-key-0000';
const SERVICE = 'service-role-local-test';
const GOOD = 'good-user-token';

// ---------- stand-in upstreams ----------
const seen = { anthropic: [], rpc: [], user: [] };
let usage = 0, cap = 2, anthropicStatus = 200;
const upstream = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.url.startsWith('/auth/v1/user')) {
    seen.user.push(req.headers.authorization);
    return req.headers.authorization === `Bearer ${GOOD}`
      ? send(200, { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com' })
      : send(401, { code: 401, msg: 'invalid JWT' });
  }
  if (req.url.startsWith('/rest/v1/rpc/bump_ai_usage')) {
    seen.rpc.push({ auth: req.headers.authorization, body: JSON.parse(body) });
    usage++;
    return send(200, usage <= JSON.parse(body).p_cap);
  }
  if (req.url.startsWith('/v1/messages')) {
    seen.anthropic.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
    if (anthropicStatus !== 200) return send(anthropicStatus, { type: 'error', error: { type: 'api_error', message: `boom ${KEY}` } });
    return send(200, {
      id: 'msg_local', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'thinking', thinking: '…', signature: 'x' }, { type: 'text', text: JSON.stringify({ answer: 'Local answer.', proposal: { summary: '', changes: [] } }) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  }
  send(404, { error: 'not found' });
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const up = `http://127.0.0.1:${upstream.address().port}`;

// ---------- the function under Deno ----------
const fnPort = 18000 + Math.floor(Math.random() * 1000);
let deno = process.env.DENO || (spawnSync('deno', ['--version']).status === 0 ? 'deno' : null);
const [cmd, pre] = deno ? [deno, []] : ['npx', ['--yes', 'deno@2.9.6']];
const child = spawn(cmd, [...pre, 'run', '--allow-net', '--allow-env', '--allow-read', 'index.ts'], {
  cwd: fnDir,
  env: {
    ...process.env, PORT: String(fnPort), DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${fnPort}`,
    SUPABASE_URL: up, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: up,
    AI_DAILY_CAP: String(cap), ALLOWED_ORIGIN: 'https://harveybetts.github.io',
    NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { out += d; });
const fn = `http://127.0.0.1:${fnPort}`;
for (let i = 0; i < 300; i++) {
  try { await fetch(fn, { method: 'OPTIONS' }); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  if (i === 299) { console.error('Function did not start:\n' + out); process.exit(1); }
}

// ---------- checks ----------
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
const post = (body, token) => fetch(fn, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://harveybetts.github.io', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const ask = { question: 'Am I on track?', scenario: { schemaVersion: 1, birth: '2000-01', retirementAge: 55, notes: 'drop me' }, summary: { coastNumber: 1 } };

let r = await fetch(fn, { method: 'OPTIONS', headers: { Origin: 'https://harveybetts.github.io' } });
check('preflight 204 + CORS origin', r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://harveybetts.github.io', String(r.status));

r = await post(ask);
check('no token → 401', r.status === 401, String(r.status));
r = await post(ask, 'forged-token');
check('bad token → 401 (checked with Supabase Auth)', r.status === 401 && seen.user.includes('Bearer forged-token'), String(r.status));

r = await post(ask, GOOD);
const b = await r.json();
check('good token → 200 with the answer', r.status === 200 && b.answer === 'Local answer.', `${r.status} ${JSON.stringify(b)}`);
const a = seen.anthropic[0] || { headers: {}, body: {} };
check('usage counted via bump_ai_usage with the service key', seen.rpc[0]?.auth === `Bearer ${SERVICE}` && seen.rpc[0]?.body.p_cap === cap && seen.rpc[0]?.body.p_user === '00000000-0000-0000-0000-000000000001', JSON.stringify(seen.rpc[0]));
check('Anthropic called at /v1/messages', a.url?.startsWith('/v1/messages'), a.url);
check('beta header carries server-side fallback', String(a.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01'), a.headers['anthropic-beta']);
check('API key sent only as a header', [a.headers['x-api-key'], a.headers.authorization].some((h) => String(h || '').includes(KEY)) && !JSON.stringify(a.body).includes(KEY));
check('body: model, fallbacks, effort, json_schema', a.body.model === 'claude-opus-5-5' && a.body.fallbacks === 'default' && a.body.output_config?.effort === 'medium' && a.body.output_config?.format?.type === 'json_schema', JSON.stringify({ m: a.body.model, f: a.body.fallbacks, o: a.body.output_config?.effort }));
check('body: no `betas` field, no thinking/temperature', !('betas' in a.body) && !('thinking' in a.body) && !('temperature' in a.body));
check('non-plan fields stripped before sending', !JSON.stringify(a.body).includes('drop me'));

r = await post(ask, GOOD); // usage 2 of 2
check('second call within cap → 200', r.status === 200, String(r.status));
const before = seen.anthropic.length;
r = await post(ask, GOOD); // usage 3 > cap
check('over the cap → 429 and Anthropic not called', r.status === 429 && seen.anthropic.length === before, String(r.status));

cap = 100; usage = 0; anthropicStatus = 500;
r = await post(ask, GOOD);
const t = await r.text();
check('cap still enforced from AI_DAILY_CAP secret (2)', seen.rpc.at(-1).body.p_cap === 2);
check('upstream 500 → 502 without leaking the key', r.status === 502 && !t.includes(KEY) && !t.includes('boom'), `${r.status} ${t}`);
check('function logs never contain the key or the question', !out.includes(KEY) && !out.includes('Am I on track'));

child.kill('SIGTERM');
upstream.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
