// Forge app entry. On boot: if onboarding isn't finished, ask the questions; otherwise show the plan.
// Screens: welcome → question (one per screen) → review → plan.
import { QUESTIONS, SECTIONS, BY_ID } from './onboarding/questions.js';
import {
  validateValue, visibleQuestions, isAnswered, progress, nextQuestion, prevQuestion,
  answersToScenario, REQUIRED_FOR_PLAN,
} from './onboarding/answers.js';
import { createStore, setAnswer, setUnknown, exportAnswers, importAnswers } from './onboarding/state.js';
import { renderInput, readInput } from './onboarding/inputs.js';
import { esc, money, monthLabel, currentMonth, summarize, ageLabel, pct } from './ui/format.js';
import { createFx, fxBadge } from './fx/fx.js';
import { whatMustBeTrue } from './engine/solve.js';
import { ROUTES, parseRoute, tabOf, slideDir, syncTabBar } from './ui/shell.js';
import { milestones } from './ui/milestones.js';
import { settingsFromAnswers, behindCopy, applyTheme, LABELS } from './ui/settings.js';
import { planSnapshot, diffSnapshots } from './ui/whatchanged.js';
import { parsePastedAnswers, entriesToAnswers } from './onboarding/paste.js';
import {
  projectScenario, projectFan, scenarioCoastStatus, ym,
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
// Once onboarding is finished the app lives in a shell (bottom tabs + hash routes, src/ui/shell.js).
// Route names map to screen names 1:1 except #answers → the review screen.
const ROUTE_SCREEN = { answers: 'review' };
const SCREEN_ROUTE = { review: 'answers' };
const routeOf = (name) => SCREEN_ROUTE[name] || name;
const inShell = (name) => !!state.completedAt && ROUTES.includes(routeOf(name));
let lastRoute = null;

function go(next, dir = 'fwd') {
  if (inShell(next.name)) {
    const h = '#' + routeOf(next.name);
    if (location.hash !== h) { location.hash = h; return; } // the hashchange handler renders it
  }
  screen = next;
  render(dir);
}
function render(dir = 'fwd', opts = {}) {
  quiet = !!opts.quiet;
  const screens = { welcome: welcomeHTML, question: questionHTML, review: reviewHTML, plan: planHTML,
    timeline: timelineHTML, budget: budgetHTML, scenarios: scenariosHTML, settings: settingsHTML, paste: pasteHTML };
  applyTheme(settingsFromAnswers(state.answers).theme);
  const html = screens[screen.name]();
  app.innerHTML = `<main class="screen in-${dir}" id="main">${html}</main>`;
  const main = app.firstElementChild;
  const shell = inShell(screen.name);
  syncTabBar(routeOf(screen.name), shell);
  lastRoute = shell ? routeOf(screen.name) : null;
  if (!opts.keepScroll) window.scrollTo(0, 0);
  if (screen.name === 'question') focusFirst(main);
  if (screen.name === 'plan' && !quiet) animatePlan(main);
}
window.addEventListener('hashchange', () => {
  const r = parseRoute(location.hash);
  if (!r || !state.completedAt) return;
  const dir = slideDir(lastRoute, r);
  screen = { name: ROUTE_SCREEN[r] || r };
  render(reduceMotion() ? 'none' : dir);
});
// Tapping the tab you're already on scrolls to the top (iOS behaviour).
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('#tabbar .tb');
  if (!a || tabOf(lastRoute) !== a.dataset.tab || lastRoute !== a.dataset.tab) return;
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
});
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
    <button class="link-btn" data-act="paste-open">Paste answers from the intake doc</button>
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
  const editing = !!screen.returnTo;
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
  const before = screen.returnTo ? planSnap() : undefined;
  state = store.save(setAnswer(state, def.id, value));
  noteChange(before, def);
  return true;
}
function advance(fromId) {
  if (screen.returnTo) return go({ name: screen.returnTo }, 'back');
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

// ---------------- what changed (after editing an answer) ----------------
let pendingChange = null;
function planSnap() {
  try {
    const out = answersToScenario(state.answers, { today: currentMonth(), convert: (a, from, to) => fx.convert(a, from, to) });
    return out.scenario ? planSnapshot(out.scenario, projectScenario(out.scenario)) : null;
  } catch { return null; }
}
function noteChange(before, def) {
  if (before === undefined) return;
  pendingChange = { n: def.n, lines: diffSnapshots(before, planSnap(), { currency: base() }) };
}
// One-shot card at the top of the screen you return to.
function changedHTML() {
  if (!pendingChange) return '';
  const { n, lines } = pendingChange;
  pendingChange = null;
  if (!lines.length) return `<p class="banner changed" role="status">Saved question ${n}. Your plan’s numbers didn’t change.</p>`;
  return `<section class="card changed" role="status"><h2 class="rv-h">What changed</h2>
    <ul class="bul">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <a class="link-btn" href="#plan">See your plan</a></section>`;
}

// ---------------- paste answers from the intake doc (nothing saved until "Save") ----------------
function pasteHTML() {
  const back = '<button class="icon-btn" data-act="paste-cancel" aria-label="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  if (!screen.result) {
    return `<header class="bar">${back}<h1 class="h2">Paste answers</h1><span style="width:44px"></span></header>
      <div class="wrap">
        <p class="sub">Paste the answers you typed in the Forge intake doc — one per line, starting with the question number (e.g. “1. March 1997”). You’ll check everything before it’s saved.</p>
        <textarea class="in paste-in" name="paste" rows="10" placeholder="1. March 1997&#10;4. 55&#10;63. £50k a year" autocapitalize="off" spellcheck="false">${esc(screen.text || '')}</textarea>
        <p class="err" role="alert" data-err></p>
        <button class="btn primary" data-act="paste-read">Read answers</button>
      </div>`;
  }
  const { entries, problems } = screen.result;
  const ok = entries.filter((e) => !e.error);
  const bad = entries.filter((e) => e.error);
  const row = (e) => {
    const def = BY_ID[e.id];
    const cur = state.answers[e.id];
    const ans = e.error ? '' : e.unknown ? 'Don’t know' : summarize(def, { v: e.value });
    const replaces = !e.error && cur && JSON.stringify(cur) !== JSON.stringify(e.unknown ? { unknown: true } : { v: e.value });
    return `<li class="pv ${e.error ? 'pv-bad' : ''}"><span class="rv-n">${e.n}</span><span class="rv-body">
      <span class="rv-q">${esc(def.text)}</span>
      ${e.error ? `<span class="pv-err">${esc(e.error)}</span><span class="pv-raw">You wrote: “${esc(e.raw)}”</span>` : `<span class="rv-a">${esc(ans)}</span>`}
      ${e.note ? `<span class="pv-note">${esc(e.note)}</span>` : ''}
      ${replaces ? '<span class="pv-note">Replaces your current answer.</span>' : ''}</span></li>`;
  };
  return `<header class="bar">${back}<h1 class="h2">Check your answers</h1><span style="width:44px"></span></header>
    <div class="wrap">
      <div class="card stats"><div><span class="stat-n">${ok.length}</span><span class="stat-l">ready</span></div>
        <div><span class="stat-n">${bad.length}</span><span class="stat-l">need you</span></div>
        <div><span class="stat-n">${problems.length}</span><span class="stat-l">notes</span></div></div>
      ${bad.length ? `<section class="card rv"><h2 class="rv-h">Couldn’t read these — answer them in the app</h2><ul class="rv-list">${bad.map(row).join('')}</ul></section>` : ''}
      ${ok.length ? `<section class="card rv"><h2 class="rv-h">Ready to save</h2><ul class="rv-list">${ok.map(row).join('')}</ul></section>` : ''}
      ${problems.length ? `<section class="card"><h2 class="rv-h">Notes</h2><ul class="bul">${problems.map((p) => `<li>${esc(p.message)}</li>`).join('')}</ul></section>` : ''}
      <div class="stack">
        <button class="btn primary" data-act="paste-save" ${ok.length ? '' : 'disabled'}>Save ${ok.length} answer${ok.length === 1 ? '' : 's'}</button>
        <button class="btn" data-act="paste-edit">Edit what I pasted</button>
      </div>
    </div>`;
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
      ${changedHTML()}
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
        <button class="btn" data-act="paste-open">Paste answers from the intake doc</button>
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
  const levers = res.onTrack ? null : whatMustBeTrue(s);
  const inv = (s.items.find((i) => i.id === 'investing') || {}).steps || [];
  const investingNow = inv.length ? inv.filter((st) => ym(st.from) <= ym(today)).pop()?.monthly || 0 : 0;
  const status = res.depletedAt ? 'short' : cs.isCoasting ? 'coasting' : res.onTrack ? 'on-track' : 'behind';
  return { ...out, today, s, res, cs, fan, levers, investingNow, status };
}

function planHTML() {
  const P = computePlan();
  if (!P.scenario) return reviewHTML();
  const { s, res, cs, fan, levers, status } = P;
  const cur = s.baseCurrency;
  const tone = settingsFromAnswers(state.answers).tone;
  const m = (x, c) => money(x, cur, { compact: c });
  const chip = {
    coasting: ['ok', 'Coasting', 'Your pot would reach the target with no more investing.'],
    'on-track': ['info', 'On track', 'On current plans you reach your target by ' + s.retirementAge + '.'],
    behind: ['warn', 'Behind', behindCopy(tone, 'behind')],
    short: ['warn', 'Runs short', behindCopy(tone, 'short', { depletedLabel: monthLabel(res.depletedAt) })],
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
        ${res.lockedAtRetirement.map((l) => `<p class="callout warn">${esc(l.name)} (about ${m(l.value, true)} by then) stays locked until ${monthLabel(l.opens)}, ${l.yearsAfterRetirement % 1 ? l.yearsAfterRetirement.toFixed(1) : l.yearsAfterRetirement} years after you stop work. Your other savings need to cover that gap.</p>`).join('')}
      </section>
      ${levers ? leversHTML(levers, s, m) : ''}
      ${events.length ? `<section class="card"><h2 class="rv-h">Life events in your plan</h2><ul class="ev">${events.map((e) =>
        `<li><span class="ev-d">${monthLabel(e.at)}</span><span class="ev-n">${esc(e.name)}</span><span class="ev-a ${e.amt < 0 ? 'neg' : ''}">${money(e.amt, cur, { compact: true })}${e.per || ''}</span></li>`).join('')}</ul></section>` : ''}
      ${P.notPlaced.length ? `<section class="card"><h2 class="rv-h">Not in the plan yet</h2><ul class="bul">${P.notPlaced.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      <section class="card"><h2 class="rv-h">Assumptions</h2><ul class="bul">${P.assumptions.map((t) => `<li>${esc(t)}</li>`).join('')}<li>Amounts in other currencies converted at mid-market rates (${esc(fxBadge(fx))}).</li></ul></section>
      <p class="foot">Estimates, not financial advice. All figures in today’s money.</p>
    </div>`;
}

// "Any one of these would get you there" — each lever on its own. null = not reachable by that lever alone.
function leversHTML(L, s, m) {
  const row = (label, value, note = '') => `<li><span class="lv-l">${label}</span><span class="lv-v">${value}</span>${note ? `<span class="lv-n">${note}</span>` : ''}</li>`;
  const no = '<span class="lv-no">Not enough on its own</span>';
  const rows = [
    row('Invest more each month', L.extraMonthly == null ? no : `+${m(L.extraMonthly)}`, L.extraMonthly == null ? '' : 'from now until you stop work'),
    row('Stop work at', L.retirementAge == null ? `${no}` : `${esc(ageLabel(L.retirementAge))}`, L.retirementAge == null ? 'not even by 80' : `instead of ${s.retirementAge}`),
    row('Spend in retirement', L.retirementSpend == null ? no : `${m(L.retirementSpend)}/yr`, L.retirementSpend == null ? '' : `${m(L.spendCut)} a year less than planned`),
    row('Returns before inflation', L.nominalReturn == null ? no : `${pct(L.nominalReturn)} a year`,
      L.nominalReturn == null ? 'even at 20%' : L.nominalReturn > 0.09 ? 'above the optimistic 9% case — risky to rely on' : `instead of ${pct(s.assumptions.nominalReturn)}`),
  ];
  return `<section class="card"><h2 class="rv-h">Any one of these would get you there</h2><ul class="levers">${rows.join('')}</ul>
    <p class="mini">Each on its own, with everything else unchanged. Estimates in today’s money.</p></section>`;
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

// ---------------- timeline (v0: milestone list; T2.5 adds the scrubber) ----------------
function needAnswersHTML(title) {
  return `<header class="bar"><h1 class="h2">${title}</h1></header><div class="wrap">
    <section class="card empty"><span class="empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 16v.2"/></svg></span>
    <h2 class="h3">A few answers missing</h2><p class="sub">Forge needs your date of birth, retirement age and retirement spend to draw this.</p>
    <a class="btn primary" href="#answers">Go to your answers</a></section></div>`;
}
function timelineHTML() {
  const P = computePlan();
  if (!P.scenario) return needAnswersHTML('Timeline');
  const cur = P.s.baseCurrency;
  const list = milestones(P.s, P.res);
  return `<header class="bar"><h1 class="h2">Timeline</h1></header>
    <div class="wrap">
      <p class="sub">Your life stages and big moments, with your projected pot at each (middle case, today’s money).</p>
      <ol class="tl">${list.map((m) => `<li class="tl-i k-${m.kind}${m.warn ? ' warn' : ''}${m.after ? ' after' : ''}">
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-b"><span class="tl-d">${monthLabel(m.at)} · age ${Math.floor(m.age)}</span>
        <span class="tl-l">${esc(m.label)}</span>
        <span class="tl-m">${m.amount != null ? `<span class="${m.amount < 0 ? 'neg' : ''}">${money(m.amount, cur, { compact: true })}${m.per ? '/' + m.per : ''}</span>` : ''}${m.pot != null ? `<span>Pot ${m.pot < 0 ? 'short by ' + money(-m.pot, cur, { compact: true }) : money(m.pot, cur, { compact: true })}</span>` : m.after ? '<span>after you stop work</span>' : ''}</span></div></li>`).join('')}</ol>
      <p class="foot">Estimates, not financial advice. All figures in today’s money.</p>
    </div>`;
}

// ---------------- budget (Phase 3) ----------------
function budgetHTML() {
  return `<header class="bar"><h1 class="h2">Budget</h1></header><div class="wrap">
    <section class="card empty"><span class="empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M15.5 14.5h2"/></svg></span>
    <h2 class="h3">Budgeting is next on the list</h2>
    <p class="sub">Categories, planned vs actual, and importing a CSV from your bank (no bank logins, ever). It will show how much coasting frees up each month.</p></section>
  </div>`;
}

// ---------------- scenarios (T2.7 adds duplicate + compare) ----------------
function scenariosHTML() {
  const P = computePlan();
  if (!P.scenario) return needAnswersHTML('Scenarios');
  const { s, res, status } = P;
  const m = (x) => money(x, s.baseCurrency, { compact: true });
  const label = { coasting: 'Coasting', 'on-track': 'On track', behind: 'Behind', short: 'Runs short' }[status];
  return `<header class="bar"><h1 class="h2">Scenarios</h1></header><div class="wrap">
    <a class="card scn" href="#plan"><span class="scn-t">Your plan</span><span class="scn-s">Built from your answers</span>
      <span class="scn-k"><span>${label}</span><span>Target ${m(res.target)}</span><span>${res.coastDate ? 'Coast ' + monthLabel(res.coastDate) : 'No coast date yet'}</span></span></a>
    <section class="card empty"><h2 class="h3">What-ifs, side by side</h2>
    <p class="sub">Soon you’ll copy your plan into versions like “two children” or “back to the UK in 2028” and compare them. Until then, change an answer and the plan updates.</p></section>
  </div>`;
}

// ---------------- settings (T2.8 adds currencies, assumptions, full backup) ----------------
function settingsHTML() {
  const full = progress(state.answers, 'full');
  return `<header class="bar"><h1 class="h2">Settings</h1></header><div class="wrap">
    ${changedHTML()}
    <section class="card list"><h2 class="list-h">Your plan</h2>
      <a class="row" href="#answers"><span class="row-l">Your answers</span><span class="row-v">${full.done} of ${full.total}</span><span class="row-c" aria-hidden="true">›</span></a>
    </section>
    ${prefsHTML()}
    <section class="card list"><h2 class="list-h">Your data</h2>
      <button class="row" data-act="export"><span class="row-l">Export a backup</span><span class="row-c" aria-hidden="true">›</span></button>
      <label class="row as-label"><span class="row-l">Import a backup</span><span class="row-c" aria-hidden="true">›</span><input type="file" accept="application/json,.json" data-act="import" hidden></label>
      <button class="row danger" data-act="reset"><span class="row-l">${screen.confirmReset ? 'Tap again to delete all answers' : 'Start over'}</span></button>
      <p class="list-note">Everything is stored on this device only${store.persistent ? '' : ' — and this browser isn’t saving it, so export a backup'}.</p>
    </section>
    <section class="card list"><h2 class="list-h">About</h2>
      <p class="list-note">Forge is a planning tool. Estimates, not financial advice. All figures in today’s money.</p>
    </section>
  </div>`;
}

// Preferences come from your answers; each row reopens that question and Save returns here.
function prefsHTML() {
  const st = settingsFromAnswers(state.answers);
  const row = (q, label, value) => `<button class="row" data-act="edit" data-val="${q}" data-return="settings"><span class="row-l">${label}</span><span class="row-v">${esc(value)}</span><span class="row-c" aria-hidden="true">›</span></button>`;
  const n = st.notifications.map((x) => LABELS.notify[x]).join(', ') || 'None';
  return `<section class="card list"><h2 class="list-h">Preferences</h2>
    ${row('q136', 'Appearance', LABELS.theme[st.theme])}
    ${row('q134', 'When you’re behind', LABELS.tone[st.tone])}
    ${row('q43', 'Budget style', LABELS.style[st.budget.style])}
    ${row('q44', 'Budget period', LABELS.period[st.budget.period] + (st.budget.periodFrom === 'q27' ? ' (your pay cycle)' : ''))}
    ${row('q47', 'Overspending flags', LABELS.overspend[st.overspend])}
    ${row('q133', 'Notifications', n)}
    <p class="list-note">Notifications are saved for when Forge can send them (after it’s installed as an app).</p>
  </section>`;
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
  if (act === 'edit') return go({ name: 'question', id: val, returnTo: t.dataset.return || 'review' });
  if (act === 'exit') return go({ name: screen.returnTo || (state.completedAt ? 'review' : 'welcome') }, 'back');
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
  if (act === 'unknown') {
    const before = screen.returnTo ? planSnap() : undefined;
    state = store.save(setUnknown(state, screen.id));
    noteChange(before, BY_ID[screen.id]);
    return advance(screen.id);
  }
  if (act === 'skip') return advance(screen.id);
  if (act === 'back') {
    if (screen.returnTo) return go({ name: screen.returnTo }, 'back');
    const p = prevQuestion(state.answers, state.mode, screen.id);
    return p ? go({ name: 'question', id: p.id }, 'back') : go({ name: 'welcome' }, 'back');
  }
  if (act === 'paste-open') return go({ name: 'paste', from: screen.name === 'welcome' ? 'welcome' : 'review' });
  if (act === 'paste-cancel') return go({ name: screen.from || 'review' }, 'back');
  if (act === 'paste-edit') { screen = { ...screen, result: null }; return render('back'); }
  if (act === 'paste-read') {
    const text = app.querySelector('[name="paste"]').value;
    const result = parsePastedAnswers(text, { base: base() });
    if (!result.entries.length) { app.querySelector('[data-err]').textContent = 'No numbered answers found. Start each line with the question number, e.g. “1. March 1997”.'; return; }
    screen = { ...screen, text, result };
    return render('fwd');
  }
  if (act === 'paste-save') {
    const add = entriesToAnswers(screen.result.entries);
    const before = planReady() ? planSnap() : undefined;
    state = store.save({ ...state, answers: { ...state.answers, ...add }, mode: state.mode || 'full', startedAt: state.startedAt || new Date().toISOString() });
    pendingChange = { n: null, lines: [`Saved ${Object.keys(add).length} answers from your paste.`, ...(before !== undefined ? diffSnapshots(before, planSnap(), { currency: base() }) : [])] };
    return go({ name: 'review' }, 'back');
  }
  if (act === 'export') return download(`forge-answers-${currentMonth()}.json`, exportAnswers(state));
  if (act === 'reset') {
    if (!screen.confirmReset) { screen = { ...screen, confirmReset: true }; return render('none', { keepScroll: true }); }
    state = store.reset();
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* file:// etc. */ }
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
if (state.completedAt) {
  const r = parseRoute(location.hash) || (planReady() ? 'plan' : 'answers');
  screen = { name: ROUTE_SCREEN[r] || r };
  try { if (location.hash !== '#' + r) history.replaceState(null, '', '#' + r); } catch { /* ignore */ }
} else {
  screen = { name: 'welcome' };
}
render('none');
// Live FX in the background; if the plan is on screen and rates changed, refresh it in place.
{
  const before = JSON.stringify(fx.rates());
  fx.ensure().then(() => {
    if (screen.name === 'plan' && JSON.stringify(fx.rates()) !== before) {
      const y = window.scrollY;
      render('none', { quiet: true, keepScroll: true });
      window.scrollTo(0, y);
    }
  });
}
