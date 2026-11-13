#!/usr/bin/env node
// T5.3: run the AI planner prompt suite (docs/AI_EVAL.md).
//   node scripts/ai-eval/run.mjs            dry run: builds all 10 requests exactly as the edge function would, checks sizes. Free.
//   AI_EVAL_LIVE=1 node scripts/ai-eval/run.mjs   live: sends them to the Claude API and grades the replies. COSTS MONEY (~US$1).
// Live needs the SDK (`npm i --no-save @anthropic-ai/sdk@1.6.0`) and ANTHROPIC_API_KEY in the environment (never in git).
// Writes artifacts/ai-eval-report.md (gitignored) and prints a summary. Uses the same request builder, prompt, schema and
// reply reader as supabase/functions/planner-ai, so what is graded is what ships.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildModelRequest, readModelResponse, LIMITS, DEFAULTS } from '../../supabase/functions/planner-ai/handler.js';
import { CASES, personaPlan, TODAY } from './cases.js';
import { grade } from './grade.js';

const live = process.env.AI_EVAL_LIVE === '1';
const model = process.env.ANTHROPIC_MODEL || DEFAULTS.model;
const effort = process.env.AI_EFFORT || DEFAULTS.effort;
const PRICE = { 'claude-opus-5-5': [4, 20] }; // US$ per million input / output tokens (Anthropic's published prices)

const { scenario, summary } = personaPlan();
const planChars = JSON.stringify(scenario).length;
if (planChars > LIMITS.scenarioChars) throw new Error(`Persona plan is ${planChars} chars — over the ${LIMITS.scenarioChars} limit.`);

let client = null;
if (live) {
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); } catch {
    console.error('Live run needs the SDK: npm i --no-save @anthropic-ai/sdk@1.6.0'); process.exit(2);
  }
  client = new Anthropic({ maxRetries: 1, timeout: 120_000 });
}

const rows = [];
let inTok = 0, outTok = 0;
for (const c of CASES) {
  const params = buildModelRequest({ model, effort, question: c.question, scenario, summary, today: TODAY });
  if (!live) {
    rows.push({ c, checks: [{ check: 'request builds within limits', ok: c.question.length <= LIMITS.question }], reply: null });
    continue;
  }
  let reply, note = '';
  try {
    const msg = await client.beta.messages.create(params);
    inTok += (msg.usage?.input_tokens || 0) + (msg.usage?.cache_read_input_tokens || 0) + (msg.usage?.cache_creation_input_tokens || 0);
    outTok += msg.usage?.output_tokens || 0;
    const r = readModelResponse(msg);
    reply = r.ok ? { answer: r.answer, proposal: r.proposal } : { answer: '', proposal: null };
    if (!r.ok) note = `reply not usable: ${r.why}`;
  } catch (e) { reply = { answer: '', proposal: null }; note = `API error ${e.status || ''}`.trim(); }
  const checks = grade(c, reply);
  if (note) checks.unshift({ check: 'usable reply', ok: false, detail: note });
  rows.push({ c, checks, reply });
  process.stdout.write(checks.every((x) => x.ok) ? '.' : 'F');
}
if (live) process.stdout.write('\n');

const passed = rows.filter((r) => r.checks.every((x) => x.ok)).length;
const [pi, po] = PRICE[model] || [NaN, NaN];
const cost = (inTok * pi + outTok * po) / 1e6;
const md = [
  `# AI planner eval — ${live ? 'live' : 'dry run'} (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
  '', `Model: \`${model}\`, effort \`${effort}\`. Persona plan: ${planChars} chars. **${passed}/${rows.length} cases passed every check.**`,
  live ? `Tokens: ${inTok} in, ${outTok} out${Number.isFinite(cost) ? ` ≈ US$${cost.toFixed(2)}` : ''}.` : 'Dry run: no API calls were made.', '',
  ...rows.flatMap(({ c, checks, reply }) => [
    `## ${checks.every((x) => x.ok) ? '✅' : '❌'} ${c.id} — “${c.question}”`, '', `_${c.why}_`, '',
    ...checks.map((x) => `- ${x.ok ? 'PASS' : 'FAIL'} ${x.check}${x.detail && !x.ok ? ` — ${x.detail}` : ''}`),
    ...(reply ? ['', '<details><summary>Reply</summary>', '', '```', reply.answer, '```', '', reply.proposal ? '```json\n' + JSON.stringify(reply.proposal, null, 2) + '\n```' : '(no proposal)', '', '</details>'] : []),
    '',
  ]),
].join('\n');
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/ai-eval-report.md', md);
console.log(`${live ? 'LIVE' : 'DRY RUN'}: ${passed}/${rows.length} cases passed — report: artifacts/ai-eval-report.md${live && Number.isFinite(cost) ? ` — cost ≈ US$${cost.toFixed(2)}` : ''}`);
process.exit(live && passed < rows.length ? 1 : 0);
