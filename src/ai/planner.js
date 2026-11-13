// Client side of the AI planner (T5.2). PURE: builds the request, turns the AI's proposal into readable rows,
// and applies only the changes the user ACCEPTED. Nothing here talks to the network; the call itself is
// sb.askPlanner() in src/data/supabase.js, which goes to the planner-ai edge function (never to Anthropic).
//
//   askBody({ question, scenario, summary, history }) -> { body } | { error }
//   describeChange(change, { currency, answers }) -> { title, detail, estimate: string[], problems: string[] }
//   applyChanges({ events, answers }, changes, { base, newId }) -> { events, answers }
//   addTurn(history, question, answer) -> history   (last 3 exchanges)
//   answerBlocks(text) -> [{ type: 'p', text } | { type: 'ul', items }]   (safe to escape + render)
import { eventProblems } from '../engine/events.js';
import { BY_ID, v as answerOf } from '../onboarding/questions.js';
import { money, monthLabel } from '../ui/format.js';

export const MAX_QUESTION = 2000;
export const MAX_HISTORY = 6;          // messages (3 exchanges), as the server allows
export const MAX_HISTORY_CHARS = 2000; // per message
export const SUGGESTIONS = [
  'What if I move back to the UK in 2028?',
  'Can I afford two kids and private school?',
  'When can I stop investing and spend the surplus?',
  'What if I do a £4,000 dirt-bike trip next year?',
];

const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Only the plan: the scenario as answers + life events build it (not expanded), never budget or bank data.
export function planForAI(scenario, events = []) {
  if (!isObj(scenario)) return null;
  const { schemaVersion, name, baseCurrency, start, birth, retirementAge, openingPot, investShare, redirectAfterCoast, assumptions, items, oneOffs, pots } = scenario;
  return {
    schemaVersion, name, baseCurrency, start, birth, retirementAge, openingPot, investShare, redirectAfterCoast, assumptions,
    items: (items || []).filter((it) => !it.eventId), oneOffs: (oneOffs || []).filter((o) => !o.eventId), pots,
    events: [...(scenario.events || []), ...events].map((e) => ({ id: e.id, template: e.template, params: e.params })),
  };
}

// The engine's own results, so the AI quotes them instead of redoing the maths. P = { s, res, cs, fan, D } (app computePlan()).
export function summaryFrom({ s, res, cs, fan, D }) {
  if (!s || !res) return {};
  const r = (x) => Math.round(Number(x) || 0);
  return { currency: s.baseCurrency, status: D && D.status, targetPot: r(res.target), savedNow: r(s.openingPot), coastNumberNow: r(cs && cs.coastNumber),
    coasting: !!(cs && cs.isCoasting), coastSurplus: r(cs && cs.surplus), coastShortfall: r(cs && cs.shortfall), coastDate: res.coastDate || 'not before retirement',
    potAtRetirementLow: r(fan && fan[0] && fan[0].retirementPot), potAtRetirementMid: r(fan && fan[1] && fan[1].retirementPot), potAtRetirementHigh: r(fan && fan[2] && fan[2].retirementPot),
    neededTodayToStayOnPlan: r(D && D.glide && D.glide.needToday), freeMoneyThisMonth: r(D && D.free && D.free.amount), retirementAge: s.retirementAge,
    moneyRunsOutAt: res.depletedAt || 'not before 100' };
}

export function trimHistory(history) {
  const h = (Array.isArray(history) ? history : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim());
  let out = h.slice(-MAX_HISTORY);
  while (out.length && out[0].role !== 'user') out = out.slice(1);
  // Must alternate user/assistant and end with the assistant (the new question is sent separately).
  const ok = out.every((m, i) => m.role === (i % 2 ? 'assistant' : 'user'));
  if (!ok) return [];
  if (out.length % 2) out = out.slice(0, -1);
  return out.map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_HISTORY_CHARS) }));
}

export function addTurn(history, question, answer) {
  return trimHistory([...(history || []), { role: 'user', text: question }, { role: 'assistant', text: answer }]);
}

export function askBody({ question, scenario, summary = {}, history = [] }) {
  const q = String(question ?? '').trim();
  if (!q) return { error: 'Type a question first.' };
  if (q.length > MAX_QUESTION) return { error: `Keep it under ${MAX_QUESTION.toLocaleString('en-GB')} characters.` };
  if (!isObj(scenario)) return { error: 'Finish the quick-start questions first, so there’s a plan to ask about.' };
  return { body: { question: q, scenario, summary, history: trimHistory(history) } };
}

// ---------- proposals ----------
const TEMPLATE_TITLE = { child: 'Add a child', houseDeposit: 'Buy a home', holiday: 'Add holidays', car: 'Add a car', oneOffTrip: 'Add a trip', relocation: 'Move country' };

export function describeChange(c, { currency = 'GBP', answers = {} } = {}) {
  const m = (x) => money(x, currency);
  const estimate = Array.isArray(c && c.assumed) ? c.assumed.filter((a) => typeof a === 'string') : [];
  if (c && c.kind === 'addEvent') {
    const p = isObj(c.params) ? c.params : {};
    const name = c.name || p.name;
    const bits = [];
    const when = p.at || p.birth || p.from;
    if (typeof when === 'string' && /^\d{4}-\d{2}$/.test(when)) bits.push(monthLabel(when));
    if (c.template === 'oneOffTrip' && isNum(p.cost)) bits.push(m(p.cost));
    if (c.template === 'car' && isNum(p.cost)) bits.push(`${m(p.cost)}${isNum(p.runningMonthly) && p.runningMonthly ? ` + ${m(p.runningMonthly)}/mo` : ''}${isNum(p.replaceEvery) ? `, every ${p.replaceEvery} yrs` : ''}`);
    if (c.template === 'holiday' && isNum(p.costEach)) bits.push(`${p.perYear || 1} a year × ${m(p.costEach)}`);
    if (c.template === 'houseDeposit' && isNum(p.deposit)) bits.push(`${m(p.deposit)} deposit${p.mortgage && isNum(p.mortgage.monthly) ? `, ${m(p.mortgage.monthly)}/mo mortgage` : ''}`);
    if (c.template === 'child') {
      const yearly = (p.costBands || []).filter((b) => isNum(b && b.annual)).map((b) => `${m(b.annual)}/yr age ${b.fromAge}–${b.toAge}`);
      bits.push(...yearly);
      if (p.school && isNum(p.school.annualFee)) bits.push(`school ${m(p.school.annualFee)}/yr from ${p.school.fromAge}`);
    }
    if (c.template === 'relocation') {
      if (p.currency) bits.push(`to ${p.currency}`);
      if (isNum(p.costOfLivingChangePct) && p.costOfLivingChangePct) bits.push(`living costs ${p.costOfLivingChangePct > 0 ? '+' : ''}${p.costOfLivingChangePct}%`);
      if (isNum(p.oneOffCost) && p.oneOffCost) bits.push(`${m(p.oneOffCost)} to move`);
    }
    const problems = eventProblems({ template: c.template, params: p });
    return { title: `${TEMPLATE_TITLE[c.template] || 'Add an event'}${name && !['Child', 'Holidays', 'Car', 'Trip'].includes(name) ? `: ${name}` : ''}`, detail: bits.join(' · '), estimate, problems };
  }
  if (c && c.kind === 'setAnswer' && c.questionId === 'q4') {
    const def = BY_ID.q4;
    const now = answerOf(answers, 'q4');
    const ok = isNum(c.value) && c.value >= def.min && c.value <= def.max;
    return { title: 'Stop work at a different age', detail: `${now ?? '—'} → ${ok ? c.value : '?'}`, estimate, problems: ok ? [] : [`Retirement age must be between ${def.min} and ${def.max}.`] };
  }
  if (c && c.kind === 'setAnswer' && c.questionId === 'q63') {
    const now = answerOf(answers, 'q63');
    const val = c.value;
    const ok = isObj(val) && isNum(val.amount) && val.amount >= 0 && (!val.currency || typeof val.currency === 'string');
    const cur = (ok && val.currency) || currency;
    return { title: 'Spend a different amount in retirement', detail: `${now && isNum(now.amount) ? money(now.amount, now.currency || currency) : '—'}/yr → ${ok ? money(val.amount, cur) : '?'}/yr`, estimate, problems: ok ? [] : ['Retirement spending must be an amount of 0 or more.'] };
  }
  return { title: 'A change Forge can’t apply', detail: '', estimate, problems: ['This kind of change isn’t supported.'] };
}

// Apply ACCEPTED changes only. Returns new arrays/objects; never mutates. Changes with problems are skipped.
export function applyChanges({ events = [], answers = {} }, changes, { base = 'GBP', newId } = {}) {
  let ev = [...events];
  const ans = { ...answers };
  for (const c of changes || []) {
    if (describeChange(c, { currency: base, answers: ans }).problems.length) continue;
    if (c.kind === 'addEvent') {
      const id = newId ? newId(ev) : `ev-ai-${ev.length + 1}`;
      const params = { ...c.params, ...(c.name && !c.params.name ? { name: c.name } : {}) };
      ev = [...ev, { id, template: c.template, params, ...(c.assumed && c.assumed.length ? { assumed: [...c.assumed] } : {}), source: 'ai' }];
    } else if (c.kind === 'setAnswer' && c.questionId === 'q4') {
      ans.q4 = { v: c.value };
    } else if (c.kind === 'setAnswer' && c.questionId === 'q63') {
      ans.q63 = { v: { amount: c.value.amount, currency: c.value.currency || (answerOf(answers, 'q63') || {}).currency || base } };
    }
  }
  return { events: ev, answers: ans };
}

// The AI's answer as paragraphs and bullet lists. Plain text in, plain text out — the caller escapes it.
export function answerBlocks(text) {
  const out = [];
  for (const chunk of String(text || '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const bullet = /^([-•*]|\d+[.)])\s+/;
    if (lines.every((l) => bullet.test(l))) out.push({ type: 'ul', items: lines.map((l) => l.replace(bullet, '').replace(/\*\*/g, '')) });
    else {
      const lead = lines.filter((l) => !bullet.test(l));
      const items = lines.filter((l) => bullet.test(l));
      if (lead.length && items.length && bullet.test(lines[lines.length - 1]) && !bullet.test(lines[0])) {
        out.push({ type: 'p', text: lead.join(' ').replace(/\*\*/g, '') }, { type: 'ul', items: items.map((l) => l.replace(bullet, '').replace(/\*\*/g, '')) });
      } else out.push({ type: 'p', text: lines.join(' ').replace(/\*\*/g, '') });
    }
  }
  return out;
}
