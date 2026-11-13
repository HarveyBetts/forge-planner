// Forge app entry. On boot: if onboarding isn't finished, ask the questions; otherwise show the plan.
// Screens: welcome → question (one per screen) → review → plan.
import { QUESTIONS, SECTIONS, BY_ID } from './onboarding/questions.js';
import {
  validateValue, visibleQuestions, isAnswered, progress, nextQuestion, prevQuestion,
  answersToScenario, REQUIRED_FOR_PLAN,
} from './onboarding/answers.js';
import { createStore, setAnswer, setUnknown, exportAnswers, importAnswers } from './onboarding/state.js';
import { renderInput, readInput } from './onboarding/inputs.js';
import { esc, money, monthLabel, currentMonth, summarize } from './ui/format.js';
import { createFx, fxBadge } from './fx/fx.js';
import {
  projectScenario, projectFan, solveMonthlyContribution, scenarioCoastStatus, ym,
} from './engine/engine.js';

const app = document.getElementById('app');
const fx = createFx();
let quiet = false; // true for in-place data refreshes: no entrance or ring animation (DESIGN rule 6)
const store = createStore();
let state = store.load();
let screen = { name: 'welcome' };
let busy = false;

const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const KNOWN_IDS = new Set(QUESTIONS.map((q) => q.id));
const base = () => (state.answers.q7 && state.answers.q7.v) || 'GBP';
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// ---------------- navigation ----------------
function go(next, dir = 'fwd') {
  screen = next;
  render(dir);
}
function render(dir = 'fwd', opts = {}) {
  quiet = !!opts.quiet;
  const html = ({ welcome: welcomeHTML, question: questionHTML, review: reviewHTML, plan: planHTML })[screen.name]();
  app.innerHTML = `<main class="screen in-${dir}" id="main">${html}</main>`;
  const main = app.firstElementChild;
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  if (screen.name === 'question') focusFirst(main);
  if (screen.name === 'plan' && !quiet) animatePlan(main);
}
function focusFirst(root) {
  const el = root.querySelector('input.in:not([type=hidden]), textarea.in, select.in');
  // Don't pop the iPhone keyboard for choice questions; do it for typed answers.
  if (el && matchMedia('(hover: hover)').matches) el.focus({ preventScroll: true });
}
function persistBanner() {
  return store.persistent ? '' :
    '<p class="banner" role="status">This browser isn’t saving your answers. Export a backup before you close it.</p>';
}

// ---------------- welcome ----------------
function welcomeHTML() {
  const started = state.mode && !state.completedAt;
  const quick = progress(state.answers, 'quick');
  const full = progress(state.answers, 'full');
  if (started) {
    const p = progress(state.answers, state.mode);
    return `<section class="wrap center">
      ${brand()}
      <h1 class="h1">Welcome back</h1>
      <p class="sub">You’ve answered ${p.done} of ${p.total} ${state.mode === 'quick' ? 'quick-start' : ''} questions.</p>
      ${ring(p.ratio, `${Math.round(p.ratio * 100)}%`, 'answered')}
      <div class="stack">
        <button class="btn primary" data-act="resume">Continue</button>
        <button class="btn" data-act="review">Review my answers</button>
        ${state.mode === 'quick' ? `<button class="btn ghost" data-act="mode" data-val="full">Switch to the full plan (${full.total - full.done} left)</button>`
          : `<button class="btn ghost" data-act="mode" data-val="quick">Switch to quick start (${quick.total - quick.done} left)</button>`}
      </div>
      ${persistBanner()}
    </section>`;
  }
  return `<section class="wrap">
    ${brand()}
    <h1 class="h1 big">Let’s build your plan</h1>
    <p class="sub">Answer questions about your life and money: your flying career, kids and school, home, cars, holidays. Forge turns your answers into a plan and shows when your money is free to enjoy.</p>
    <div class="stack">
      <button class="card choose" data-act="start" data-val="quick">
        <span class="choose-t">Quick start</span>
        <span class="choose-s">${quick.total} key questions · about 10 minutes</span>
      </button>
      <button class="card choose" data-act="start" data-val="full">
        <span class="choose-t">Full plan</span>
        <span class="choose-s">All ${QUESTIONS.length} questions · about 40 minutes</span>
      </button>
    </div>
    <p class="note">Saved on this device as you go. Stop any time and pick up where you left off. Skip anything you don’t know.</p>
    <label class="link-btn">Restore answers from a backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
    ${persistBanner()}
  </section>`;
}
function brand() {
  return `<div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)"/><path d="M10 23V9h12M10 16h9" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span>Forge</span></div>`;
}

// ---------------- question ----------------
function questionHTML() {
  const def = BY_ID[screen.id];
  const list = visibleQuestions(state.answers, state.mode);
  const idx = Math.max(0, list.findIndex((q) => q.id === def.id));
  const p = progress(state.answers, state.mode);
  const sec = SECTION[def.section];
  const rec = state.answers[def.id];
  const editing = screen.returnTo === 'review';
  const autoAdvance = def.type === 'choice' || def.type === 'scale';
  return `<header class="qtop">
      <button class="icon-btn" data-act="exit" aria-label="Save and exit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="qprog" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><span style="width:${(p.ratio * 100).toFixed(1)}%"></span></div>
      <span class="qcount">${idx + 1}/${list.length}</span>
    </header>
    <form class="wrap qform" data-form data-qid="${def.id}" data-type="${def.type}" novalidate>
      <p class="qsec">${esc(sec.id)} · ${esc(sec.title)}${def.star ? ' <span class="star" title="Key question">★</span>' : ''}</p>
      <h1 class="qtitle" id="qtitle">${esc(def.text)}</h1>
      ${def.help ? `<p class="qhelp">${esc(def.help)}</p>` : ''}
      <div class="qinput" aria-labelledby="qtitle">${renderInput(def, rec, base())}</div>
      <p class="err" role="alert" data-err></p>
      ${rec && rec.unknown ? '<p class="qhelp">You marked this “Don’t know”.</p>' : ''}
      <button type="button" class="link-btn" data-act="skip">Skip for now</button>
    </form>
    <footer class="qfoot">
      <button class="btn" data-act="back" ${!editing && !prevQuestion(state.answers, state.mode, def.id) ? 'disabled' : ''}>Back</button>
      <button class="btn" data-act="unknown">Don’t know</button>
      <button class="btn primary" data-act="next">${editing ? 'Save' : (autoAdvance && !rec ? 'Next' : 'Next')}</button>
    </footer>`;
}

function saveCurrent() {
  const def = BY_ID[screen.id];
  const form = app.querySelector('[data-form]');
  const value = readInput(def, form);
  const errEl = app.querySelector('[data-err]');
  if (value === undefined) {
    errEl.textContent = 'Answer, tap “Don’t know”, or skip for now.';
    return false;
  }
  const err = validateValue(def, value);
  if (err) { errEl.textContent = err; return false; }
  state = store.save(setAnswer(state, def.id, value));
  return true;
}
function advance(fromId) {
  if (screen.returnTo === 'review') return go({ name: 'review' }, 'back');
  const next = nextQuestion(state.answers, state.mode, fromId);
  if (next) return go({ name: 'question', id: next.id });
  // Reached the end of the list: jump to any skipped ones, else finish.
  const skipped = visibleQuestions(state.answers, state.mode).find((q) => !isAnswered(state.answers, q.id));
  if (skipped && !screen.wrapped) return go({ name: 'question', id: skipped.id, wrapped: true });
  finish();
}
function finish() {
  state = store.save({ ...state, completedAt: state.completedAt || new Date().toISOString() });
  const missing = REQUIRED_FOR_PLAN.filter((id) => !(state.answers[id] && !state.answers[id].unknown));
  go({ name: missing.length ? 'review' : 'plan' });
}

// ---------------- review ----------------
function reviewHTML() {
  const p = progress(state.answers, state.mode || 'full');
  const full = progress(state.answers, 'full');
  const missing = REQUIRED_FOR_PLAN.filter((id) => !(state.answers[id] && !state.answers[id].unknown));
  const groups = SECTIONS.map((s) => {
    const qs = visibleQuestions(state.answers, 'full').filter((q) => q.section === s.id);
    if (!qs.length) return '';
    return `<section class="card rv"><h2 class="rv-h">${esc(s.id)} · ${esc(s.title)}</h2><ul class="rv-list">` +
      qs.map((q) => {
        const rec = state.answers[q.id];
        const ans = rec ? summarize(q, rec) : '';
        return `<li><button class="rv-row" data-act="edit" data-val="${q.id}">
          <span class="rv-n">${q.n}</span>
          <span class="rv-body"><span class="rv-q">${esc(q.text)}</span><span class="rv-a ${rec ? '' : 'empty'}">${rec ? esc(ans) : 'Not answered'}</span></span>
        </button></li>`;
      }).join('') + '</ul></section>';
  }).join('');
  return `<header class="bar"><h1 class="h2">Your answers</h1>${planReady() ? '<button class="btn small primary" data-act="plan">My plan</button>' : ''}</header>
    <div class="wrap">
      ${missing.length ? `<p class="banner warn" role="status">Forge needs ${missing.map((id) => `question ${BY_ID[id].n}`).join(', ')} to build your plan: ${missing.map((id) => esc(BY_ID[id].text)).join(' ')}</p>` : ''}
      <div class="card stats">
        <div><span class="stat-n">${full.done}</span><span class="stat-l">answered</span></div>
        <div><span class="stat-n">${full.total - full.done}</span><span class="stat-l">to go</span></div>
        <div><span class="stat-n">${Math.round(full.ratio * 100)}%</span><span class="stat-l">complete</span></div>
      </div>
      <div class="stack row2">
        ${p.done < p.total || full.done < full.total ? `<button class="btn primary" data-act="continue-all">Answer the rest (${full.total - full.done})</button>` : ''}
      </div>
      ${groups}
      <div class="stack">
        <button class="btn" data-act="export">Export a backup</button>
        <label class="btn as-label">Import a backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        <button class="btn danger" data-act="reset">${screen.confirmReset ? 'Tap again to delete all answers' : 'Start over'}</button>
      </div>
      ${persistBanner()}
    </div>`;
}
function planReady() {
  return REQUIRED_FOR_PLAN.every((id) => state.answers[id] && !state.answers[id].unknown);
}

// ---------------- plan ----------------
function computePlan() {
  const today = currentMonth();
  const out = answersToScenario(state.answers, { today, convert: (a, from, to) => fx.convert(a, from, to) });
  if (!out.scenario) return { ...out, today };
  const s = out.scenario;
  const res = projectScenario(s);
  const cs = scenarioCoastStatus(s);
  const fan = projectFan(s, [0.04, 0.07, 0.09]);
  const extra = res.onTrack ? 0 : solveMonthlyContribution(s);
  const inv = (s.items.find((i) => i.id === 'investing') || {}).steps || [];
  const investingNow = inv.length ? inv.filter((st) => ym(st.from) <= ym(today)).pop()?.monthly || 0 : 0;
  const status = res.depletedAt ? 'short' : cs.isCoasting ? 'coasting' : res.onTrack ? 'on-track' : 'behind';
  return { ...out, today, s, res, cs, fan, extra, investingNow, status };
}

function planHTML() {
  const P = computePlan();
  if (!P.scenario) return reviewHTML();
  const { s, res, cs, fan, extra, status } = P;
  const cur = s.baseCurrency;
  const m = (x, c) => money(x, cur, { compact: c });
  const chip = {
    coasting: ['ok', 'Coasting', 'Your pot would reach the target with no more investing.'],
    'on-track': ['info', 'On track', 'On current plans you reach your target by ' + s.retirementAge + '.'],
    behind: ['warn', 'Behind', 'On current plans you fall short of your target.'],
    short: ['warn', 'Runs short', `On these numbers your savings run out in ${monthLabel(res.depletedAt)}, when costs outgrow what you put away.`],
  }[status];
  const icon = status === 'behind' || status === 'short'
    ? '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>'
    : '<path d="M6 12.5l4 4 8-9"/>';
  const free = cs.isCoasting
    ? `<span class="big">${m(P.investingNow)}</span><span class="mini">a month you no longer need to invest</span>`
    : `<span class="big">${res.coastDate ? monthLabel(res.coastDate) : 'Not yet'}</span><span class="mini">${res.coastDate ? 'when your investing becomes optional' : 'Coast isn’t reached before retirement on these numbers'}</span>`;
  const events = [
    ...s.oneOffs.map((o) => ({ at: o.at, name: o.name, amt: o.amount })),
    ...s.items.filter((i) => i.kind === 'expense' && i.from).map((i) => ({ at: i.from, name: i.name, amt: -(i.annual ?? (i.monthly || 0) * 12), per: '/yr' })),
  ].sort((a, b) => ym(a.at) - ym(b.at));
  return `<header class="bar"><h1 class="h2">Your plan</h1><button class="btn small" data-act="review">Edit answers</button></header>
    <div class="wrap">
      <section class="card hero">
        ${ring(Math.min(1, cs.progress), `${Math.min(999, Math.round(cs.progress * 100))}%`, 'of your coast number', !quiet)}
        <p class="chip ${chip[0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${chip[1]}</p>
        <p class="sub">${chip[2]}</p>
        <p class="mini">${m(s.openingPot)} saved now · ${m(cs.coastNumber)} needed to coast</p>
      </section>
      <div class="grid2">
        <section class="card kpi"><span class="lab">Target pot at ${s.retirementAge}</span><span class="big">${m(res.target, true)}</span><span class="mini">pays ${m(s.assumptions.retirementSpend)}/yr at ${(s.assumptions.withdrawalRate * 100).toFixed(1).replace('.0', '')}%</span></section>
        <section class="card kpi"><span class="lab">${cs.isCoasting ? 'Free money' : 'Coast date'}</span>${free}</section>
      </div>
      <section class="card">
        <span class="lab">At ${s.retirementAge} you’d have, in today’s money</span>
        ${rangeHTML(fan, m)}
        ${chart(res, cur)}
        ${extra ? `<p class="callout warn">Investing about <strong>${m(extra)}</strong> more a month from now would close the gap.</p>` : ''}
        ${extra === null ? '<p class="callout warn">The target isn’t reachable by investing more alone. Try a later age or a lower spend.</p>' : ''}
        ${res.lockedAtRetirement.map((l) => `<p class="callout warn">${esc(l.name)} (about ${m(l.value, true)} by then) stays locked until ${monthLabel(l.opens)}, ${l.yearsAfterRetirement % 1 ? l.yearsAfterRetirement.toFixed(1) : l.yearsAfterRetirement} years after you stop work. Your other savings need to cover that gap.</p>`).join('')}
      </section>
      ${events.length ? `<section class="card"><h2 class="rv-h">Life events in your plan</h2><ul class="ev">${events.map((e) =>
        `<li><span class="ev-d">${monthLabel(e.at)}</span><span class="ev-n">${esc(e.name)}</span><span class="ev-a ${e.amt < 0 ? 'neg' : ''}">${money(e.amt, cur, { compact: true })}${e.per || ''}</span></li>`).join('')}</ul></section>` : ''}
      ${P.notPlaced.length ? `<section class="card"><h2 class="rv-h">Not in the plan yet</h2><ul class="bul">${P.notPlaced.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      <section class="card"><h2 class="rv-h">Assumptions</h2><ul class="bul">${P.assumptions.map((t) => `<li>${esc(t)}</li>`).join('')}<li>Amounts in other currencies converted at mid-market rates (${esc(fxBadge(fx))}).</li></ul></section>
      <p class="foot">Estimates, not financial advice. All figures in today’s money.</p>
    </div>`;
}

// Low–high range at retirement. A negative pot is a shortfall, not a number to show as "−£300k".
function rangeHTML(fan, m) {
  const pots = fan.map((f) => f.retirementPot);
  const lo = Math.min(...pots), hi = Math.max(...pots), mid = fan[1].retirementPot;
  if (hi <= 0) {
    return `<span class="big">Nothing left</span><span class="mini">In every case your costs use up your savings before then. The middle case is short by ${m(-mid, true)}.</span>`;
  }
  const fmt = (x) => (x < 0 ? 'short' : m(x, true));
  return `<span class="big">${fmt(lo)} – ${fmt(hi)}</span>` +
    `<span class="mini">Middle case ${mid < 0 ? `short by ${m(-mid, true)}` : m(mid, true)}. Range uses 4%, 7% and 9% returns before inflation.</span>`;
}

function ring(ratio, big, label, animate = false) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, ratio)));
  return `<div class="ring" role="img" aria-label="${esc(big)} ${esc(label)}">
    <svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" class="ring-bg"/>
    <circle cx="64" cy="64" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${animate ? c.toFixed(2) : off.toFixed(2)}" data-off="${off.toFixed(2)}" transform="rotate(-90 64 64)"/></svg>
    <span class="ring-big">${esc(big)}</span><span class="ring-lab">${esc(label)}</span></div>`;
}
function animatePlan(root) {
  const fg = root.querySelector('.ring-fg[data-off]');
  if (!fg) return;
  if (reduceMotion()) { fg.style.strokeDashoffset = fg.dataset.off; return; }
  void fg.getBoundingClientRect(); // flush so the transition runs (iOS skips same-frame changes)
  requestAnimationFrame(() => { fg.style.strokeDashoffset = fg.dataset.off; });
}

// Pot (middle case) vs coast number, yearly, as a small SVG line chart.
function chart(res, cur) {
  const rows = res.rows.filter((_, i) => i % 12 === 0 || i === res.rows.length - 1);
  if (rows.length < 2) return '';
  const W = 320, H = 150, pad = 6;
  const max = Math.max(res.target, ...rows.map((r) => r.pot), 1);
  const x = (i) => pad + (i / (rows.length - 1)) * (W - pad * 2);
  const y = (val) => H - pad - (Math.max(0, val) / max) * (H - pad * 2);
  const line = (k) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join(' ');
  const ci = res.coastDate ? rows.findIndex((r) => ym(r.ym) >= ym(res.coastDate)) : -1;
  const first = rows[0], last = rows[rows.length - 1];
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected pot rising to ${money(last.pot, cur, { compact: true })} by age ${Math.round(last.age)}, against the amount needed to coast">
      <line x1="${pad}" x2="${W - pad}" y1="${y(res.target).toFixed(1)}" y2="${y(res.target).toFixed(1)}" class="c-target"/>
      <path d="${line('coastNumber')}" class="c-coast"/>
      <path d="${line('pot')}" class="c-pot"/>
      ${ci >= 0 ? `<line x1="${x(ci).toFixed(1)}" x2="${x(ci).toFixed(1)}" y1="${pad}" y2="${H - pad}" class="c-mark"/>` : ''}
    </svg>
    <figcaption><span><i class="k pot"></i>Your pot (middle case)</span><span><i class="k coast"></i>Needed to coast</span><span><i class="k target"></i>Target</span></figcaption>
    <div class="axis"><span>Age ${Math.round(first.age)}</span><span>Age ${Math.round(last.age)}</span></div>
  </figure>`;
}

// ---------------- actions ----------------
function download(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { alertInline('Couldn’t create the backup file on this device.'); }
}
function alertInline(msg) {
  const el = app.querySelector('[data-err]') || app.querySelector('.wrap');
  if (!el) return;
  if (el.matches('[data-err]')) el.textContent = msg;
  else el.insertAdjacentHTML('afterbegin', `<p class="banner warn" role="alert">${esc(msg)}</p>`);
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'INPUT' || busy) return;
  const act = t.dataset.act;
  const val = t.dataset.val;
  e.preventDefault();
  if (act === 'start') {
    state = store.save({ ...state, mode: val, startedAt: state.startedAt || new Date().toISOString(), completedAt: null });
    const first = nextQuestion(state.answers, state.mode, null) || visibleQuestions(state.answers, state.mode)[0];
    return go({ name: 'question', id: first.id });
  }
  if (act === 'resume') {
    const q = nextQuestion(state.answers, state.mode, null);
    return q ? go({ name: 'question', id: q.id }) : finish();
  }
  if (act === 'mode') { state = store.save({ ...state, mode: val }); return render(); }
  if (act === 'review') return go({ name: 'review' });
  if (act === 'plan') return go({ name: 'plan' });
  if (act === 'continue-all') {
    state = store.save({ ...state, mode: 'full', completedAt: null });
    const q = nextQuestion(state.answers, 'full', null);
    return q ? go({ name: 'question', id: q.id }) : finish();
  }
  if (act === 'edit') return go({ name: 'question', id: val, returnTo: 'review' });
  if (act === 'exit') return go({ name: state.completedAt ? 'review' : 'welcome' }, 'back');
  if (act === 'pick') {
    const group = t.closest('[data-group]');
    if (group.dataset.multi === '1') {
      t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'));
      return;
    }
    group.querySelectorAll('[aria-checked]').forEach((b) => b.setAttribute('aria-checked', String(b === t)));
    // Single choice on its own screen: save and move on after a short beat so the tick is seen.
    if (!group.closest('.fields') && screen.name === 'question') {
      busy = true;
      setTimeout(() => { busy = false; if (saveCurrent()) advance(screen.id); }, reduceMotion() ? 0 : 220);
    }
    return;
  }
  if (act === 'cur') {
    const group = t.closest('[data-group]');
    const prefix = group.dataset.group.replace(/cur$/, '');
    group.querySelectorAll('[aria-checked]').forEach((b) => b.setAttribute('aria-checked', String(b === t)));
    app.querySelector(`[name="${prefix}cur"]`).value = val;
    const sym = app.querySelector(`[data-sym="${prefix}"]`);
    if (sym) sym.textContent = t.textContent;
    return;
  }
  if (act === 'next') { if (saveCurrent()) advance(screen.id); return; }
  if (act === 'unknown') { state = store.save(setUnknown(state, screen.id)); return advance(screen.id); }
  if (act === 'skip') return advance(screen.id);
  if (act === 'back') {
    if (screen.returnTo === 'review') return go({ name: 'review' }, 'back');
    const p = prevQuestion(state.answers, state.mode, screen.id);
    return p ? go({ name: 'question', id: p.id }, 'back') : go({ name: 'welcome' }, 'back');
  }
  if (act === 'export') return download(`forge-answers-${currentMonth()}.json`, exportAnswers(state));
  if (act === 'reset') {
    if (!screen.confirmReset) { screen = { ...screen, confirmReset: true }; return render(); }
    state = store.reset();
    return go({ name: 'welcome' }, 'back');
  }
});

app.addEventListener('change', (e) => {
  const input = e.target;
  if (!input.matches('[data-act="import"]') || !input.files || !input.files[0]) return;
  input.files[0].text().then((text) => {
    const answers = importAnswers(text, KNOWN_IDS);
    state = store.save({ ...state, answers: { ...state.answers, ...answers }, mode: state.mode || 'full' });
    go({ name: 'review' });
  }).catch((err) => alertInline(err.message || 'Couldn’t read that file.'));
});

app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || screen.name !== 'question') return;
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  if (saveCurrent()) advance(screen.id);
});

// ---------------- boot ----------------
screen = state.completedAt ? (planReady() ? { name: 'plan' } : { name: 'review' }) : { name: 'welcome' };
render('none');
// Live FX in the background; if the plan is on screen and rates changed, refresh it in place.
{
  const before = JSON.stringify(fx.rates());
  fx.ensure().then(() => {
    if (screen.name === 'plan' && JSON.stringify(fx.rates()) !== before) {
      const y = window.scrollY;
      render('none', { quiet: true });
      window.scrollTo(0, y);
    }
  });
}
