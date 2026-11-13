// Forge app entry. On boot: if onboarding isn't finished, ask the questions; otherwise show the plan.
// Screens: welcome → question (one per screen) → review → plan.
import { QUESTIONS, SECTIONS, BY_ID } from './onboarding/questions.js';
import {
  validateValue, visibleQuestions, isAnswered, progress, nextQuestion, prevQuestion,
  answersToScenario, REQUIRED_FOR_PLAN,
} from './onboarding/answers.js';
import { createStore, setAnswer, setUnknown, importAnswers } from './onboarding/state.js';
import { renderInput, readInput } from './onboarding/inputs.js';
import { esc, money, monthLabel, currentMonth, summarize, ageLabel, pct } from './ui/format.js';
import { createFx, fxBadge } from './fx/fx.js';
import { whatMustBeTrue } from './engine/solve.js';
import { ROUTES, parseRoute, tabOf, slideDir, syncTabBar } from './ui/shell.js';
import { milestones } from './ui/milestones.js';
import { settingsFromAnswers, behindCopy, applyTheme, LABELS } from './ui/settings.js';
import { planSnapshot, diffSnapshots } from './ui/whatchanged.js';
import { parsePastedAnswers, entriesToAnswers } from './onboarding/paste.js';
import { dashboardModel } from './ui/dashboard.js';
import { chartModel, chartSVG, readoutAt } from './ui/chart.js';
import { timelineModel, readoutText, nextStop } from './ui/timeline.js';
import { createLocalStore } from './data/store.js';
import { expandEvents } from './engine/events.js';
import { FORMS, EDITABLE, formToEvent, eventToForm, eventLabel, eventWhen, newEventId } from './ui/eventforms.js';
import { openSheet, closeSheet, setSheetHTML, sheetBody, toast } from './ui/sheet.js';
import { readXlsx } from './budget/xlsx.js';
import { workbookToBudget } from './budget/importsheet.js';
import { emptyBudget, STARTER_CATEGORIES, weekRow, setEntry, addWeeks, weekLabel, forecastBy, upcomingBills, mondayOf } from './budget/ledger.js';
import { cashNow, netWorth, parseEntry, entryText, defaultWeek } from './budget/view.js';
import { applyWhatIf, describeChanges, compareModel } from './ui/compare.js';
import { checkinFields, valuesToQ49, makeSnapshot, trend, backupDue } from './ui/checkin.js';
import { realityCheck } from './budget/reality.js';
import { parseCSV, detectColumns, toTransactions, merchantKey, applyTransactions } from './budget/csv.js';
import { weekVsPlan, overPlan, setPlan, flagLevel } from './budget/plan.js';
import {
  projectScenario, scenarioCoastStatus, ym,
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
    timeline: timelineHTML, budget: budgetHTML, scenarios: scenariosHTML, settings: settingsHTML, paste: pasteHTML,
    privacy: privacyHTML, advice: adviceHTML };
  applyTheme(settingsFromAnswers(state.answers).theme);
  let html;
  try {
    html = (screens[screen.name] || screens.welcome)();
  } catch (err) {
    // Safety net (T2.9): never a blank screen. The data on the phone is untouched.
    console.warn('Forge screen error:', err);
    html = crashHTML(err);
  }
  app.innerHTML = `<main class="screen in-${dir}" id="main">${html}</main>`;
  const main = app.firstElementChild;
  const shell = inShell(screen.name);
  syncTabBar(routeOf(screen.name), shell);
  lastRoute = shell ? routeOf(screen.name) : null;
  if (!opts.keepScroll) window.scrollTo(0, 0);
  if (screen.name === 'question') focusFirst(main);
  if (screen.name === 'plan' && !quiet) animatePlan(main);
  if (screen.name === 'timeline') scrubTo(0, main);
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
function crashHTML(err) {
  return `<header class="bar"><h1 class="h2">Something went wrong</h1></header><div class="wrap" data-crash>
    <section class="card empty"><span class="empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 16v.2"/></svg></span>
      <h2 class="h3">This screen hit a problem</h2>
      <p class="sub">Your answers, events and budget are safe on this phone. Back up to be sure, then try again — and tell Claude what you tapped.</p>
      <button class="btn primary" data-act="export">Back up everything</button>
      <a class="btn" href="#answers" data-act="crash-answers">Go to your answers</a>
      <button class="btn ghost" data-act="crash-reload">Reload</button>
      <details class="mini"><summary>Details for Claude</summary><code>${esc(String(err && err.message || err))}</code></details>
    </section></div>`;
}
// Anything async that fails (a save, a file read) gets a calm message instead of silently doing nothing.
window.addEventListener('unhandledrejection', (e) => {
  console.warn('Forge async error:', e.reason);
  try { toast('Something didn’t save — please try again'); } catch { /* toast unavailable */ }
});
function focusFirst(root) {
  const el = root.querySelector('input.in:not([type=hidden]), textarea.in, select.in');
  // Don't pop the iPhone keyboard for choice questions; do it for typed answers.
  if (el && matchMedia('(hover: hover)').matches) el.focus({ preventScroll: true });
}
function persistBanner() {
  return store.persistent ? '' :
    '<p class="banner" role="status">This browser isn’t saving your answers. Back up (Settings → Back up everything) before you close it.</p>';
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
  return `<div class="brand"><img src="icons/icon.svg" alt="" width="34" height="34" class="brand-ic"><span>Forge</span></div>`;
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

// ---------------- the plan's scenario: your answers + the life events you added (T2.6) ----------------
const data = createLocalStore();
let userEvents = []; // loaded at boot from settings.events (kept in full backups)
let appSettings = {}; // the store's settings (events, assumption overrides) — loaded at boot
function buildScenario(events = userEvents, answers = state.answers) {
  const ov = appSettings.assumptions || {};
  const out = answersToScenario(answers, { today: currentMonth(), convert: (a, from, to) => fx.convert(a, from, to), inflation: ov.inflation, cashRealReturn: ov.cashRealReturn });
  if (!out.scenario) return { out, s: null, problems: [] };
  const { scenario, problems } = expandEvents({ ...out.scenario, events: [...(out.scenario.events || []), ...events] });
  return { out, s: scenario, problems };
}
async function saveUserEvents(events) {
  userEvents = events;
  appSettings = await data.saveSettings({ events });
}

// ---------------- what changed (after editing an answer) ----------------
let pendingChange = null;
function planSnap(events) {
  try {
    const { s } = buildScenario(events);
    return s ? planSnapshot(s, projectScenario(s)) : null;
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
        <button class="btn" data-act="export">Back up everything</button>
        <label class="btn as-label">Restore from a backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
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
  const { out, s } = buildScenario();
  if (!s) return { ...out, today };
  const res = projectScenario(s);
  const cs = scenarioCoastStatus(s);
  const runAt = (nr) => projectScenario({ ...s, assumptions: { ...s.assumptions, nominalReturn: nr } });
  const low = runAt(0.04), high = runAt(0.09);
  const fan = [{ nominalReturn: 0.04, retirementPot: low.retirementPot }, { nominalReturn: s.assumptions.nominalReturn, retirementPot: res.retirementPot }, { nominalReturn: 0.09, retirementPot: high.retirementPot }];
  const levers = res.onTrack ? null : whatMustBeTrue(s);
  const D = dashboardModel(s, res, cs, { tone: settingsFromAnswers(state.answers).tone });
  const chartM = chartModel({ mid: res, low, high, glide: D.glide, target: res.target, coastDate: res.coastDate, currency: s.baseCurrency, birth: s.birth, actuals: [] });
  return { ...out, scenario: s, today, s, res, cs, fan, levers, D, chartM, status: D.status };
}

const CHIP_ICON = {
  up: '<path d="M5 15l5-5 4 4 5-6"/><path d="M15 8h4v4"/>',
  check: '<path d="M6 12.5l4 4 8-9"/>',
  alert: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
};
let planAnimated = false; // count-up + ring fill on the first Plan view of a session only (DESIGN: first load)

function planHTML() {
  const P = computePlan();
  if (!P.scenario) return reviewHTML();
  const { s, res, cs, fan, levers, D } = P;
  const cur = s.baseCurrency;
  const m = (x, c) => money(x, cur, { compact: c });
  const animate = !quiet && !planAnimated;
  const events = [
    ...s.oneOffs.map((o) => ({ at: o.at, name: o.name, amt: o.amount, eventId: o.eventId })),
    ...s.items.filter((i) => i.kind === 'expense' && i.from && !i.off).map((i) => ({ at: i.from, name: i.name, amt: -(i.annual ?? (i.monthly || 0) * 12), per: '/yr', eventId: i.eventId })),
  ].sort((a, b) => ym(a.at) - ym(b.at));
  const assumptions = [...P.assumptions, `Amounts in other currencies converted at mid-market rates (${fxBadge(fx)}).`];
  const ringLabel = D.ring.coasting ? `Coasting · +${m(D.ring.surplus, true)} surplus` : D.ring.label;
  return `<header class="bar"><h1 class="h2">Your plan</h1><button class="btn small" data-act="review">Edit answers</button></header>
    <div class="wrap">
      <p class="tm"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>Today’s money · ${pct(s.assumptions.inflation)} inflation assumed</p>
      <section class="card hero" data-status="${D.status}">
        ${ring(D.ring.ratio, `${D.ring.pct}%`, ringLabel, animate, D.ring.pct)}
        <p class="chip ${D.chip.kind}" data-chip="${D.status}"><svg viewBox="0 0 24 24" aria-hidden="true">${CHIP_ICON[D.chip.icon]}</svg>${D.chip.label}</p>
        <p class="sub">${esc(D.message)}</p>
        <p class="mini">${m(s.openingPot)} saved now · ${D.glide.needToday > 0 ? `${m(D.glide.needToday)} needed today to stay on plan` : 'your future saving covers the target'}</p>
      </section>
      ${checkinCardHTML(D)}
      ${realityHTML(s)}
      <section class="card free ${D.free.amount > 0 ? 'has' : ''}">
        <span class="lab">Free money this month</span>
        <span class="big"${animate && D.free.amount > 0 ? ` data-count="${Math.round(D.free.amount)}" data-cur="${cur}"` : ''}>${m(D.free.amount)}</span>
        <span class="mini">${esc(D.free.note)}</span>
      </section>
      <div class="grid2">
        <section class="card kpi"><span class="lab">Target pot at ${s.retirementAge}</span><span class="big">${m(res.target, true)}</span><span class="mini">pays ${m(s.assumptions.retirementSpend)}/yr at ${pct(s.assumptions.withdrawalRate)}</span></section>
        <section class="card kpi"><span class="lab">Coast date</span><span class="big">${cs.isCoasting ? 'Now' : res.coastDate ? monthLabel(res.coastDate) : 'Not yet'}</span><span class="mini">${cs.isCoasting ? 'investing is already optional' : res.coastDate ? 'when investing becomes optional' : 'not reached before you stop work'}</span></section>
      </div>
      <section class="card">
        <span class="lab">At ${s.retirementAge} you’d have, in today’s money</span>
        ${rangeHTML(fan, m)}
        ${chartHTML(P.chartM)}
        ${res.lockedAtRetirement.map((l) => `<p class="callout warn">${esc(l.name)} (about ${m(l.value, true)} by then) stays locked until ${monthLabel(l.opens)}, ${l.yearsAfterRetirement % 1 ? l.yearsAfterRetirement.toFixed(1) : l.yearsAfterRetirement} years after you stop work. Your other savings need to cover that gap.</p>`).join('')}
      </section>
      ${levers ? leversHTML(levers, s, m) : ''}
      <section class="card"><h2 class="rv-h">Life events in your plan</h2>${events.length ? `<ul class="ev">${events.map((e) =>
        `<li${e.eventId ? ` class="ev-user" data-act="ev-edit" data-val="${esc(e.eventId)}" role="button" tabindex="0"` : ''}><span class="ev-d">${monthLabel(e.at)}</span><span class="ev-n">${esc(e.name)}</span><span class="ev-a ${e.amt < 0 ? 'neg' : ''}">${money(e.amt, cur, { compact: true })}${e.per || ''}</span></li>`).join('')}</ul>` : '<p class="mini">Nothing dated yet.</p>'}
        <button class="link-btn" data-act="ev-add">+ Add a life event</button></section>
      ${P.notPlaced.length ? `<section class="card"><h2 class="rv-h">Not in the plan yet</h2><ul class="bul">${P.notPlaced.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      <details class="card disc"><summary><span class="rv-h">Assumptions</span><span class="disc-n">${assumptions.length}</span><svg class="disc-c" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10l4 4 4-4"/></svg></summary>
        <div class="disc-b"><ul class="bul">${assumptions.map((t) => `<li>${esc(t)}${/estimate/i.test(t) ? ' <span class="tag">estimate</span>' : ''}</li>`).join('')}</ul>
        <p class="mini">Change any of these by editing your answers.</p></div></details>
      <p class="foot"><a href="#advice">Estimates, not financial advice.</a> All figures in today’s money.</p>
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
    `<span class="mini">Middle case (your ${pct(fan[1].nominalReturn)}) ${mid < 0 ? `short by ${m(-mid, true)}` : m(mid, true)}. Range uses 4% and 9% returns before inflation.</span>`;
}

function ring(ratio, big, label, animate = false, countTo = null) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, ratio)));
  return `<div class="ring" role="img" aria-label="${esc(big)} ${esc(label)}">
    <svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" class="ring-bg"/>
    <circle cx="64" cy="64" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${animate ? c.toFixed(2) : off.toFixed(2)}" data-off="${off.toFixed(2)}" transform="rotate(-90 64 64)"/></svg>
    <span class="ring-big"${animate && countTo != null ? ` data-count="${countTo}" data-suffix="%"` : ''}>${esc(big)}</span><span class="ring-lab">${esc(label)}</span></div>`;
}
function animatePlan(root) {
  const fg = root.querySelector('.ring-fg[data-off]');
  if (!fg) return;
  const counters = [...root.querySelectorAll('[data-count]')];
  if (reduceMotion() || planAnimated) {
    fg.style.strokeDashoffset = fg.dataset.off;
    planAnimated = true;
    return;
  }
  planAnimated = true;
  void fg.getBoundingClientRect(); // flush so the transition runs (iOS skips same-frame changes)
  requestAnimationFrame(() => { fg.style.strokeDashoffset = fg.dataset.off; });
  // Count-up in step with the ring (1.2s, same ease-out feel as --e-out).
  const t0 = performance.now(), dur = 1200;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const fmt = (el, v) => (el.dataset.cur ? money(v, el.dataset.cur) : `${Math.round(v)}${el.dataset.suffix || ''}`);
  counters.forEach((el) => { el.textContent = fmt(el, 0); });
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    counters.forEach((el) => { if (el.isConnected) el.textContent = fmt(el, Number(el.dataset.count) * ease(t)); });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Projection chart (src/ui/chart.js) + tap-to-read readout (tooltips on tap, not hover — DESIGN.md).
let chartNow = null;
function chartHTML(M) {
  chartNow = M;
  if (!M) return '<p class="mini">Not enough time before you stop work to draw a chart.</p>';
  return `<figure class="chart" data-chart>${chartSVG(M)}
    <figcaption><span><i class="k fan"></i>Range (4–9% returns)</span><span><i class="k pot"></i>Middle case</span><span><i class="k glide"></i>What your plan needs</span><span><i class="k target"></i>Target</span></figcaption>
    <p class="pc-read" aria-live="polite">Tap the chart to read the numbers at any age.</p></figure>`;
}
function chartTap(e) {
  const hit = e.target.closest && e.target.closest('.pc-hit');
  if (!hit || !chartNow) return;
  const r = hit.getBoundingClientRect();
  const frac = (e.clientX - r.left) / r.width;
  const out = readoutAt(chartNow, frac);
  const fig = hit.closest('[data-chart]');
  fig.querySelector('.pc-read').textContent = out.text;
  const rule = fig.querySelector('.pc-rule');
  const xx = chartNow.x(out.i).toFixed(1);
  rule.setAttribute('x1', xx); rule.setAttribute('x2', xx); rule.setAttribute('visibility', 'visible');
}
app.addEventListener('pointerdown', chartTap);
app.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') chartTap(e); });

// ---------------- monthly check-in (T3.1) ----------------
const STATUS_WORD = { ahead: 'Ahead', 'on-track': 'On track', behind: 'Behind', short: 'Runs short' };
function checkinCardHTML() {
  const last = snapshots[snapshots.length - 1];
  const done = last && last.at === currentMonth();
  const hist = snapshots.slice(-6);
  const tr = trend(snapshots, (x) => money(x, base(), { compact: true }));
  return `<section class="card ci"><div class="ci-top"><span class="lab">Monthly check-in</span>
      <span class="ci-l">${last ? `Last: ${monthLabel(last.at)} · ${STATUS_WORD[last.status] || ''}` : 'Not done yet'}</span></div>
    ${hist.length > 1 ? `<ul class="ci-h">${hist.map((x) => `<li><span>${monthLabel(x.at).slice(0, 3)}</span><b>${money(x.total, base(), { compact: true })}</b><i class="st-${x.status}">${STATUS_WORD[x.status] || ''}</i></li>`).join('')}</ul>` : ''}
    ${tr ? `<p class="mini">${esc(tr)}.</p>` : ''}
    <button class="btn small ${done ? '' : 'primary'}" data-act="ci-open">${done ? 'Update this month' : `Check in for ${monthLabel(currentMonth())}`}</button>
    ${backupDue(appSettings.lastBackupAt) ? `<p class="mini ci-bk">${appSettings.lastBackupAt ? 'It’s been a while since your last backup.' : 'You haven’t backed up yet.'} <button class="link-btn inline" data-act="export">Back up everything</button></p>` : ''}
  </section>`;
}
function openCheckin() {
  const q49 = (state.answers.q49 && state.answers.q49.v) || {};
  const fields = checkinFields(base());
  const sym = (c) => (c === 'AUD' ? 'A$' : c === 'GBP' ? '£' : c);
  openSheet({ label: 'Monthly check-in', html: `<div class="sh-top"><h2 class="h2">Check in · ${monthLabel(currentMonth())}</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">What’s in each pot today? Rough numbers are fine; leave blank what you don’t have.</p>
    ${budget ? '<button class="btn small" data-ci="budget">Fill cash, Premium Bonds and investments from my budget</button>' : ''}
    <form class="sh-form" data-ci-form>${fields.map((f) => `<div class="field"><label for="ci-${f.k}">${esc(f.label)}</label>
      <div class="money"><span class="money-sym">${sym(f.currency)}</span><input class="in" id="ci-${f.k}" name="${f.k}" inputmode="decimal" autocomplete="off" value="${q49[f.k] && Number.isFinite(q49[f.k].amount) ? q49[f.k].amount : ''}"></div></div>`).join('')}</form>
    <div class="sh-actions single"><button class="btn primary" data-ci="save">Save check-in</button></div>`,
  onClick: async (e) => {
    const b = e.target.closest('[data-ci]');
    if (!b) return;
    e.preventDefault();
    const form = sheetBody().querySelector('[data-ci-form]');
    if (b.dataset.ci === 'budget') {
      const fromBudget = balancesFromBudget();
      for (const k of ['cashAUD', 'cashGBP', 'isa']) if (fromBudget[k] && form.elements[k]) form.elements[k].value = fromBudget[k].amount;
      return;
    }
    const values = Object.fromEntries(fields.map((f) => [f.k, form.elements[f.k].value]));
    const before = planSnap();
    state = store.save({ ...state, answers: { ...state.answers, q49: { v: valuesToQ49(values, q49, base()) } } });
    const sum = planSummary();
    const { s } = buildScenario();
    const snap = makeSnapshot(currentMonth(), state.answers.q49.v, sum, s ? scenarioCoastStatus(s).pot : 0);
    await data.saveSnapshot(snap);
    snapshots = await data.listSnapshots();
    const lines = diffSnapshots(before, planSnap(), { currency: base() });
    closeSheet();
    render('none', { keepScroll: true });
    toast(`Checked in — ${STATUS_WORD[snap.status]}${lines.length ? ' · ' + lines[0] : ''}`);
  } });
}

// ---------------- reality check (T3.4): does the budget back up the plan's investing? ----------------
function investingNowOf(s) {
  const it = (s.items || []).find((i) => i.id === 'investing');
  const steps = (it && it.steps) || [];
  return steps.filter((st) => st.from <= s.start).sort((a, b) => (a.from < b.from ? -1 : 1)).pop()?.monthly || 0;
}
function realityHTML(s) {
  if (!budget) return '';
  const planned = investingNowOf(s);
  const r = realityCheck(budget, { today: isoToday(), convert: (a, f, t) => fx.convert(a, f, t), base: base(), plannedMonthly: planned });
  if (!r) return '';
  const m = (x) => money(x, base());
  if (r.verdict === 'too-few') return `<section class="card rc"><span class="lab">Reality check</span><p class="mini">Once your budget has a couple of weeks that have happened, Forge checks your plan against it.</p></section>`;
  const text = {
    more: `Your budget leaves about <b>${m(r.monthlyLeft)}</b> a month — more than the <b>${m(planned)}</b> your plan assumes you invest. Investing the difference would bring coast sooner.`,
    close: `Your budget leaves about <b>${m(r.monthlyLeft)}</b> a month, in line with the <b>${m(planned)}</b> your plan assumes. ✓`,
    less: `Your plan assumes <b>${m(planned)}</b> a month invested, but your budget leaves about <b>${m(r.monthlyLeft)}</b>. Trim spending, or plan with the real figure.`,
    negative: `Your budget is spending more than comes in — about <b>${m(-r.monthlyLeft)}</b> a month short. The plan’s ${m(planned)} a month of investing isn’t happening yet.`,
  }[r.verdict];
  const offer = (r.verdict === 'more' || r.verdict === 'less') && r.monthlyLeft > 0;
  return `<section class="card rc rc-${r.verdict}"><span class="lab">Reality check</span><p class="rc-t">${text}</p>
    ${offer ? `<button class="btn small" data-act="rc-use" data-val="${Math.round(r.monthlyLeft)}">Plan with ${m(Math.round(r.monthlyLeft))} a month</button>` : ''}
    <p class="mini">From your last ${r.weeks} weeks of budget (${weekLabel(r.from).split(' – ')[0]} – ${weekLabel(r.to).split(' – ')[1]}), money in minus money out.</p></section>`;
}
function openUseReality(amount) {
  const q50 = { ...((state.answers.q50 && state.answers.q50.v) || {}), now: { amount, currency: base() } };
  const before = planSnap();
  const saved = state.answers;
  state = { ...state, answers: { ...state.answers, q50: { v: q50 } } };
  const lines = diffSnapshots(before, planSnap(), { currency: base() });
  state = { ...state, answers: saved };
  openSheet({ label: 'Plan with your real figure', html: `<div class="sh-top"><h2 class="h2">Plan with ${money(amount, base())} a month</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">Your answer to “How much will you invest each month — now” (question 50) becomes ${money(amount, base())}. Training and First Officer amounts stay as they are.</p>
    <div class="sh-preview">${lines.length ? `<span class="lab">What this does to your plan</span><ul class="bul">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<span class="mini">Your headline numbers don’t move.</span>'}</div>
    <div class="sh-actions single"><button class="btn primary" data-rc="go">Update my plan</button></div>`,
  onClick: (e) => {
    if (!e.target.closest('[data-rc="go"]')) return;
    state = store.save({ ...state, answers: { ...state.answers, q50: { v: q50 } } });
    closeSheet();
    render('none', { keepScroll: true });
    toast(`Plan updated${lines.length ? ' — ' + lines[0] : ''}`);
  } });
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
  tlModel = timelineModel(P.s, P.res, list);
  const M = tlModel;
  const startI = ym(P.s.start);
  return `<header class="bar"><h1 class="h2">Timeline</h1></header>
    <div class="wrap">
      <section class="card scrub" data-scrub>
        <div class="sc-read" aria-hidden="true">${scrubReadHTML(M.at(0))}</div>
        <div class="sc-track">
          <div class="sc-rail"><div class="sc-fill"></div></div>
          ${M.stops.map((m) => `<span class="sc-mk k-${m.kind}${m.warn ? ' warn' : ''}" style="left:calc(14px + (100% - 28px) * ${(m.i / Math.max(1, M.n)).toFixed(4)})" data-val="${m.i}" data-label="${esc(m.label)}" aria-hidden="true"></span>`).join('')}
          <input class="sc-range" type="range" min="0" max="${M.n}" step="1" value="0" aria-label="Scrub through your timeline" aria-valuetext="${esc(readoutText(M.at(0), cur))}">
        </div>
        <div class="sc-ends"><span>Today</span><span>Age ${P.s.retirementAge}</span></div>
        <div class="sc-jump"><button class="btn small" data-act="tl-step" data-val="-1" aria-label="Previous moment">‹ Previous</button><button class="btn small" data-act="tl-step" data-val="1" aria-label="Next moment">Next ›</button></div>
      </section>
      <p class="sub">Drag through the years, or tap a dot. Projected pot is the middle case in today’s money.</p>
      ${userEventsHTML()}
      <ol class="tl">${list.map((m) => `<li class="tl-i k-${m.kind}${m.warn ? ' warn' : ''}${m.after ? ' after' : ''}" data-i="${ym(m.at) - startI}">
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-b"><span class="tl-d">${monthLabel(m.at)} · age ${Math.floor(m.age)}</span>
        <span class="tl-l">${esc(m.label)}</span>
        <span class="tl-m">${m.amount != null ? `<span class="${m.amount < 0 ? 'neg' : ''}">${money(m.amount, cur, { compact: true })}${m.per ? '/' + m.per : ''}</span>` : ''}${m.pot != null ? `<span>Pot ${m.pot < 0 ? 'short by ' + money(-m.pot, cur, { compact: true }) : money(m.pot, cur, { compact: true })}</span>` : m.after ? '<span>after you stop work</span>' : ''}</span></div></li>`).join('')}</ol>
      <p class="foot">Estimates, not financial advice. All figures in today’s money.</p>
    </div>`;
}

// Scrubber behaviour: readout updates in place (no re-render); jumps spring-ease unless reduced motion.
let tlModel = null;
let tlAnim = 0;
let tlTarget = null; // where a running spring is heading (so rapid taps step from the destination, not the overshoot)
function scrubReadHTML(r) {
  const cur = tlModel ? tlModel.currency : 'GBP';
  const pot = r.pot < 0 ? `short by ${money(-r.pot, cur, { compact: true })}` : money(r.pot, cur, { compact: true });
  const here = r.here.filter((h) => h.kind !== 'today').map((h) => esc(h.label)).join(' · ');
  return `<span class="sc-date">${monthLabel(r.ym)} · age ${Math.floor(r.age)}</span>
    <span class="sc-pot${r.pot < 0 ? ' neg' : ''}">${pot}</span>
    <span class="sc-stage">${esc(r.stage)}</span>
    <span class="sc-here">${here || (r.flow ? `${r.flow > 0 ? '+' : ''}${money(r.flow, cur)} this month` : '&nbsp;')}</span>`;
}
function scrubTo(i, root = app) {
  const box = root.querySelector('[data-scrub]');
  if (!box || !tlModel) return;
  const r = tlModel.at(i);
  const range = box.querySelector('.sc-range');
  if (Number(range.value) !== Math.round(i)) range.value = String(Math.round(i));
  range.setAttribute('aria-valuetext', readoutText(r, tlModel.currency));
  box.querySelector('.sc-read').innerHTML = scrubReadHTML(r);
  box.querySelector('.sc-fill').style.width = `calc(14px + (100% - 28px) * ${(i / Math.max(1, tlModel.n)).toFixed(4)})`;
  box.querySelectorAll('.sc-mk').forEach((mk) => mk.classList.toggle('on', Number(mk.dataset.val) <= r.i));
  let cur = null;
  app.querySelectorAll('.tl-i[data-i]').forEach((li) => { const k = Number(li.dataset.i); if (k <= r.i) cur = li; li.classList.remove('cur'); });
  if (cur) cur.classList.add('cur');
}
function scrubAnimate(target) {
  const range = app.querySelector('.sc-range');
  if (!range) return;
  cancelAnimationFrame(tlAnim);
  const from = Number(range.value);
  tlTarget = null;
  if (reduceMotion() || from === target) return scrubTo(target);
  tlTarget = target;
  const t0 = performance.now(), dur = 520;
  // Spring-like ease-out with a hint of overshoot (matches --e-spring), clamped to the track.
  const ease = (t) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const v = Math.max(0, Math.min(tlModel.n, from + (target - from) * ease(t)));
    scrubTo(t < 1 ? v : target);
    if (t < 1) tlAnim = requestAnimationFrame(step); else tlTarget = null;
  };
  tlAnim = requestAnimationFrame(step);
}
app.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('.sc-range')) { cancelAnimationFrame(tlAnim); tlTarget = null; scrubTo(Number(e.target.value)); } });
// Touching the slider stops any running spring, so the thumb never moves under your finger.
app.addEventListener('pointerdown', (e) => { if (e.target.matches && e.target.matches('.sc-range')) { cancelAnimationFrame(tlAnim); tlTarget = null; } });
// Let go within 4 months of a moment → snap onto it (markers are visual; the slider takes every touch).
const SNAP_MONTHS = 4;
app.addEventListener('change', (e) => {
  if (!(e.target.matches && e.target.matches('.sc-range')) || !tlModel) return;
  const v = Number(e.target.value);
  const near = tlModel.stops.reduce((b, m) => (Math.abs(m.i - v) < Math.abs(b - v) ? m.i : b), Infinity);
  if (Math.abs(near - v) <= SNAP_MONTHS && near !== v) scrubAnimate(near);
});

// ---------------- life-event editor (T2.6) ----------------
function userEventsHTML() {
  const rows = userEvents.map((ev) => `<button class="ev-edit" data-act="ev-edit" data-val="${esc(ev.id)}"><span class="ev-d">${eventWhen(ev) ? monthLabel(eventWhen(ev)) : ''}</span><span class="ev-n">${esc(eventLabel(ev))}</span><span class="row-c" aria-hidden="true">›</span></button>`).join('');
  return `<section class="card"><h2 class="rv-h">Events you’ve added</h2>${rows || '<p class="mini">Add kids, a home, holidays, cars, trips or a move — on top of what your answers already put in the plan.</p>'}
    <button class="btn primary" data-act="ev-add" style="margin-top:10px">Add a life event</button></section>`;
}
let editing = null; // { template, id|null }
function pickerHTML() {
  return `<div class="sh-top"><h2 class="h2">Add a life event</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <div class="sh-pick">${EDITABLE.map((t) => `<button class="sh-card" data-ev="pick" data-val="${t}">${esc(FORMS[t].title)}<small>${esc(FORMS[t].blurb.split('.')[0])}.</small></button>`).join('')}
    <button class="sh-card wide" data-ev="speedbird">Speedbird pathway<small>Comes from your answers (course start, investing in training and as a First Officer). Tap to edit those.</small></button></div>`;
}
function fieldHTML(f, value) {
  const id = `evf-${f.k}`;
  const v = value ?? '';
  let input;
  if (f.type === 'select') input = `<select class="in" id="${id}" name="${f.k}">${f.opts.map(([ov, ol]) => `<option value="${esc(ov)}"${String(v) === ov ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  else if (f.type === 'month') input = `<input class="in" id="${id}" name="${f.k}" type="month" value="${esc(v)}">`;
  else if (f.type === 'money') input = `<div class="money"><span class="money-sym">${base() === 'AUD' ? 'A$' : '£'}</span><input class="in" id="${id}" name="${f.k}" inputmode="decimal" value="${esc(v)}" autocomplete="off"></div>`;
  else if (f.type === 'number') input = `<input class="in" id="${id}" name="${f.k}" inputmode="decimal" value="${esc(v)}" autocomplete="off">`;
  else input = `<input class="in" id="${id}" name="${f.k}" value="${esc(v)}" autocomplete="off">`;
  return `<div class="field"><label for="${id}">${esc(f.label)}${f.optional ? ' <span class="sh-help">(optional)</span>' : ''}</label>${input}${f.help ? `<span class="sh-help">${esc(f.help)}</span>` : ''}</div>`;
}
function formHTML(template, values, isEdit) {
  const F = FORMS[template];
  return `<div class="sh-top"><h2 class="h2">${esc(F.title)}</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">${esc(F.blurb)}</p>
    <form class="sh-form" data-ev-form novalidate>${F.fields.map((f) => fieldHTML(f, values[f.k])).join('')}</form>
    <div class="sh-preview" aria-live="polite" data-ev-preview><span class="mini">Fill it in to see what it does to your plan.</span></div>
    <div class="sh-actions${isEdit ? '' : ' single'}">${isEdit ? '<button class="btn danger" data-ev="delete">Delete</button>' : ''}<button class="btn primary" data-ev="save">${isEdit ? 'Save changes' : 'Add to my plan'}</button></div>`;
}
function readForm() {
  const form = sheetBody() && sheetBody().querySelector('[data-ev-form]');
  if (!form) return {};
  const v = {};
  for (const f of FORMS[editing.template].fields) {
    const raw = form.elements[f.k] ? String(form.elements[f.k].value) : '';
    // Amounts may be typed as "£4,000" or "4 000": keep digits, sign and decimal point only.
    v[f.k] = f.type === 'money' || f.type === 'number' ? raw.replace(/[^\d.\-−]/g, '').replace('−', '-') : raw.trim();
  }
  return v;
}
function eventsWith(ev) {
  return editing.id ? userEvents.map((e) => (e.id === editing.id ? ev : e)) : [...userEvents, ev];
}
function previewEvent(showErrors = false) {
  const box = sheetBody() && sheetBody().querySelector('[data-ev-preview]');
  if (!box) return null;
  const { event, problems } = formToEvent(editing.template, readForm(), editing.id || 'preview');
  if (problems.length) {
    box.innerHTML = showErrors ? `<p class="sh-err" role="alert">${esc(problems[0])}</p>` : '<span class="mini">Fill it in to see what it does to your plan.</span>';
    return null;
  }
  const lines = diffSnapshots(planSnap(), planSnap(eventsWith(event)), { currency: base() });
  box.innerHTML = lines.length ? `<span class="lab">What this does to your plan</span><ul class="bul">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    : '<span class="mini">This doesn’t move your headline numbers.</span>';
  return event;
}
function openEventEditor(id) {
  if (id) {
    const ev = userEvents.find((e) => e.id === id);
    if (!ev) return;
    editing = { template: ev.template, id };
    openSheet({ html: formHTML(ev.template, eventToForm(ev), true), label: 'Edit life event', onClick: sheetClick, onInput: () => previewEvent(false) });
    previewEvent(false);
  } else {
    editing = null;
    openSheet({ html: pickerHTML(), label: 'Add a life event', onClick: sheetClick, onInput: () => { if (editing) previewEvent(false); } });
  }
}
async function commitEvents(next, verb) {
  const before = planSnap();
  await saveUserEvents(next);
  const lines = diffSnapshots(before, planSnap(), { currency: base() });
  closeSheet();
  const y = window.scrollY;
  render('none', { quiet: true, keepScroll: true });
  window.scrollTo(0, y);
  toast(`${verb}${lines.length ? ' — ' + lines[0] : ''}`);
}
function sheetClick(e) {
  const t = e.target.closest('[data-ev]');
  if (!t) return;
  e.preventDefault();
  const act = t.dataset.ev;
  if (act === 'pick') {
    editing = { template: t.dataset.val, id: null };
    setSheetHTML(formHTML(editing.template, {}, false));
    const first = sheetBody().querySelector('input, select');
    if (first && matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
    return;
  }
  if (act === 'speedbird') { closeSheet(); return go({ name: 'question', id: 'q12', returnTo: inShell(screen.name) ? screen.name : 'review' }); }
  if (act === 'save') {
    const ev = previewEvent(true);
    if (!ev) return;
    const id = editing.id || newEventId(userEvents);
    return commitEvents(eventsWith({ ...ev, id }), editing.id ? 'Saved' : 'Added');
  }
  if (act === 'delete') {
    if (!t.dataset.confirm) { t.dataset.confirm = '1'; t.textContent = 'Tap to confirm'; return; }
    return commitEvents(userEvents.filter((x) => x.id !== editing.id), 'Deleted');
  }
}

// ---------------- budget (Phase 3 — Harvey's spreadsheet, D23) ----------------
let budget = null;        // loaded at boot from the store (this device only)
let budWeek = null;       // Monday of the week on screen
let budSeg = 'money';     // 'money' | 'invest'
let snapshots = [];       // monthly check-ins, oldest first (T3.1) — loaded at boot
let budCsv = null;        // { fileName, txns, bad, currency, groups } — a bank CSV waiting to be sorted (T3.3)
let budPreview = null;    // { budget, report, fileName } — an import waiting for "Save"; nothing stored until then
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const bm = (x, c, compact = false) => money(x, c || (budget && budget.currency) || base(), { compact });
const SHORT = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}${y !== new Date().getFullYear() ? ' ' + String(y).slice(2) : ''}`; };
async function saveBudget(next) { budget = next; await data.saveBudget(next); }

function budgetHTML() {
  if (budPreview) return budPreviewHTML();
  if (budCsv && budget) return csvPreviewHTML();
  if (!budget) return budEmptyHTML();
  budWeek = budWeek || defaultWeek(budget, isoToday());
  const seg = `<div class="seg" role="tablist"><button role="tab" aria-selected="${budSeg === 'money'}" data-act="bud-seg" data-val="money">Money</button><button role="tab" aria-selected="${budSeg === 'invest'}" data-act="bud-seg" data-val="invest">Investments</button></div>`;
  return `<header class="bar"><h1 class="h2">Budget</h1></header><div class="wrap">${seg}
    ${budSeg === 'invest' ? investHTML() : `
    <section class="card nw" data-bud-nw>${netWorthHTML()}</section>
    <section class="card wk">${weekHTML()}</section>
    <label class="btn as-label csv-btn">Import bank transactions (CSV)<input type="file" accept=".csv,text/csv" data-act="bud-csv" hidden></label>
    <p class="err" role="alert" data-err></p>
    ${(() => { const { s } = buildScenario(); return s ? realityHTML(s) : ''; })()}
    <section class="card" data-bud-forecast>${forecastHTML()}</section>
    ${coastFreesHTML()}
    ${billsHTML()}`}
    <button class="link-btn danger-link" data-act="bud-remove">${screen.confirmBudRemove ? 'Tap again to remove the budget from this phone' : 'Remove budget from this phone'}</button>
  </div>`;
}
function budEmptyHTML() {
  return `<header class="bar"><h1 class="h2">Budget</h1></header><div class="wrap">
    <section class="card empty"><span class="empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M15.5 14.5h2"/></svg></span>
      <h2 class="h3">Bring in your budget</h2>
      <p class="sub">Import your spreadsheet (.xlsx): weeks, categories, bills, Premium Bonds and investments come across. It’s read on this phone and stays here.</p>
      <label class="btn primary as-label">Import my spreadsheet<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-act="bud-import" hidden></label>
      <button class="btn" data-act="bud-scratch">Start from scratch</button>
      <p class="err" role="alert" data-err></p></section></div>`;
}
function budPreviewHTML() {
  const { budget: b, report, fileName } = budPreview;
  const hc = new Set((b.holdings.lots || []).map((l) => l.ticker)).size;
  return `<header class="bar"><h1 class="h2">Check your import</h1></header><div class="wrap">
    <p class="sub">From <b>${esc(fileName)}</b>. Nothing is saved until you tap Save.</p>
    <div class="card stats"><div><span class="stat-n">${Object.keys(b.entries).length}</span><span class="stat-l">weeks</span></div>
      <div><span class="stat-n">${b.categories.length}</span><span class="stat-l">categories</span></div>
      <div><span class="stat-n">${hc}</span><span class="stat-l">holdings</span></div></div>
    ${report.warnings.map((w) => `<p class="banner warn" role="status">${esc(w)}</p>`).join('')}
    <section class="card"><h2 class="rv-h">What came across</h2><ul class="bul">${report.lines.map((l) => `<li>${esc(l)}</li>`).join('')}
      <li>Cash now: ${bm(b.openingCash, b.currency)}</li>${b.extras.map((e) => `<li>${esc(e.name)}: ${bm(e.amount, e.currency)}</li>`).join('')}</ul>
      <div class="chips">${b.categories.map((c) => `<span class="chip-s${c.kind === 'income' ? ' in' : ''}">${esc(c.name)}</span>`).join('')}</div></section>
    ${budget ? '<p class="banner warn">This replaces the budget already on this phone.</p>' : ''}
    <div class="stack"><button class="btn primary" data-act="bud-import-save">Save to my budget</button><button class="btn" data-act="bud-import-cancel">Cancel</button></div>
  </div>`;
}
function netWorthHTML() {
  const nw = netWorth(budget, { convert: (a, f, t) => fx.convert(a, f, t), base: base(), today: isoToday() });
  return `<span class="lab">Net worth today</span><span class="big">${money(nw.total, base())}</span>
    <ul class="nw-parts">${nw.parts.map((p) => `<li><span>${esc(p.label)}</span><span class="nw-a">${p.currency !== base() ? `<small>${bm(p.amount, p.currency)}</small> ` : ''}${money(p.inBase, base())}</span></li>`).join('')}</ul>
    ${nw.holdings.totals.unpriced.length ? `<p class="mini">No price yet for ${esc(nw.holdings.totals.unpriced.join(', '))}.</p>` : ''}
    <button class="btn small" data-act="bud-use">Use these as my current balances</button>
    <p class="mini">Other currencies at mid-market rates (${esc(fxBadge(fx))}).</p>`;
}
function weekSumHTML() {
  const r = weekRow(budget, budWeek);
  return `<span>In <b>${bm(r.income + r.otherIn)}</b></span><span>Out <b>${bm(r.spent)}</b></span><span class="${r.total < 0 ? 'neg' : 'pos'}">Left <b>${bm(r.total)}</b></span>`;
}
function weekHTML() {
  const row = budget.entries[budWeek] || {};
  return `<div class="wk-nav"><button class="icon-btn" data-act="bud-week" data-val="-1" aria-label="Previous week"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
      <span class="wk-l">${weekLabel(budWeek)}${budWeek === mondayOf(isoToday()) ? ' · this week' : ''}</span>
      <button class="icon-btn" data-act="bud-week" data-val="1" aria-label="Next week"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>
    <div class="wk-sum" data-bud-sum>${weekSumHTML()}</div>
    <div data-bud-over>${overBannerHTML()}</div>
    <ul class="wk-list">${budget.categories.map((c) => `<li class="${c.kind === 'income' ? 'is-in' : ''}"><div class="wk-c">
      <button class="wk-name" data-act="bud-plan" data-val="${esc(c.id)}" aria-label="${esc(c.name)} — set a weekly plan">${esc(c.name)}</button>
      <span class="wk-plan" data-plan="${esc(c.id)}">${planHintHTML(c.id)}</span></div>
      <input class="in be" id="be-${esc(c.id)}" data-cat="${esc(c.id)}" data-kind="${c.kind}" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="${esc(c.name)} this week" value="${esc(entryText(row[c.id], c.kind))}"></li>`).join('')}</ul>
    <p class="mini">Type what you spent. Money back into a spending category? Start it with +. Tap a category’s name to give it a weekly plan.</p>`;
}
function planHintHTML(catId) {
  const r = weekVsPlan(budget, budWeek).find((x) => x.id === catId);
  if (!r || !r.plan) return '';
  const fl = flagLevel(settingsFromAnswers(state.answers).overspend);
  const pctW = Math.min(100, Math.round((r.ratio || 0) * 100));
  const bad = r.over > 0;
  return `${fl.bar ? `<i class="wk-bar${bad ? ' over' : ''}"><b style="width:${pctW}%"></b></i>` : ''}<small class="${bad && fl.text ? 'over' : ''}">${bad && fl.text ? `${bm(r.over)} over` : `of ${bm(r.plan)}`}${r.kind === 'income' && r.short ? ` · ${bm(r.short)} short` : ''}</small>`;
}
function overBannerHTML() {
  if (!flagLevel(settingsFromAnswers(state.answers).overspend).banner) return '';
  const o = overPlan(budget, budWeek);
  return o.length ? `<p class="banner warn" role="status">Over plan this week: ${o.map((r) => `${esc(r.name)} by ${bm(r.over)}`).join(', ')}.</p>` : '';
}
function openPlanSheet(catId) {
  const c = budget.categories.find((x) => x.id === catId);
  if (!c) return;
  const cur = (budget.plan || {})[catId];
  openSheet({ label: `Weekly plan for ${c.name}`, html: `<div class="sh-top"><h2 class="h2">${esc(c.name)}</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">${c.kind === 'income' ? 'How much do you expect to come in each week?' : 'How much do you plan to spend each week?'} Leave blank for no plan.</p>
    <div class="field"><label for="bp">Weekly plan</label><div class="money"><span class="money-sym">${budget.currency === 'AUD' ? 'A$' : budget.currency === 'GBP' ? '£' : budget.currency}</span><input class="in" id="bp" inputmode="decimal" autocomplete="off" value="${cur ?? ''}"></div></div>
    <div class="sh-actions single"><button class="btn primary" data-bp="save">Save plan</button></div>`,
  onClick: async (e) => {
    if (!e.target.closest('[data-bp="save"]')) return;
    await saveBudget(setPlan(budget, catId, sheetBody().querySelector('#bp').value));
    closeSheet(); render('none', { keepScroll: true }); toast(`${c.name} plan saved`);
  } });
}
// "When you coast": the plan's free money, in the budget's currency per week (T3.2b — the engine's freed money, made concrete).
function coastFreesHTML() {
  const { s } = buildScenario();
  if (!s) return '';
  const res = projectScenario(s);
  const cs = scenarioCoastStatus(s);
  const inv = investingNowOf(s);
  const later = (s.items.find((i) => i.id === 'investing') || {}).steps || [];
  const atCoast = res.coastDate ? (later.filter((st) => st.from <= res.coastDate).pop() || {}).monthly || inv : inv;
  if (!(atCoast > 0)) return '';
  const weekly = (budget.currency === base() ? atCoast : fx.convert(atCoast, base(), budget.currency)) * 12 / 52;
  const when = cs.isCoasting ? 'Now' : res.coastDate ? `From ${monthLabel(res.coastDate)}` : null;
  return `<section class="card cf"><span class="lab">When you coast</span>${when
    ? `<p class="rc-t">${when}, your planned <b>${money(atCoast, base())}</b> a month of investing becomes optional — about <b>${bm(weekly)}</b> a week you could spend instead.</p>`
    : `<p class="rc-t">On these numbers you don’t reach coast before you stop work, so your <b>${money(atCoast, base())}</b> a month of investing stays needed.</p>`}</section>`;
}
function forecastHTML() {
  const f = forecastBy(budget, 2);
  if (!f.length) return '<h2 class="rv-h">Cash by fortnight</h2><p class="mini">Add a week to see where your cash is heading.</p>';
  const lo = Math.min(0, ...f.map((r) => r.balance)), hi = Math.max(...f.map((r) => r.balance), 1);
  const minRow = f.reduce((a, r) => (r.balance < a.balance ? r : a), f[0]);
  return `<h2 class="rv-h">Cash by fortnight</h2>
    ${budget.payLagWeeks ? `<p class="mini">Pay lands ${budget.payLagWeeks} weeks after it’s earned, like your spreadsheet.</p>` : ''}
    ${minRow.balance < 0 ? `<p class="callout warn">Cash dips below zero around ${SHORT(minRow.end)} (${bm(minRow.balance)}).</p>` : ''}
    <ul class="fc">${f.map((r) => `<li class="${r === minRow ? 'low' : ''}"><span class="fc-d">${SHORT(r.end)}</span>
      <span class="fc-bar"><i style="width:${(((r.balance - lo) / (hi - lo)) * 100).toFixed(1)}%"></i></span>
      <span class="fc-b">${bm(r.balance, null, true)}</span><span class="fc-c ${r.change < 0 ? 'neg' : 'pos'}">${r.change >= 0 ? '+' : ''}${bm(r.change, null, true)}</span></li>`).join('')}</ul>`;
}
function billsHTML() {
  const up = upcomingBills(budget.bills, isoToday()).slice(0, 6);
  if (!up.length) return '';
  return `<section class="card"><h2 class="rv-h">Bills coming up</h2><ul class="bills">${up.map((b) => `<li><span class="bl-n">${esc(b.name)}</span><span class="bl-d">${SHORT(b.due)}</span><span class="bl-in ${b.inDays <= 3 ? 'soon' : ''}">${b.inDays === 0 ? 'today' : b.inDays === 1 ? 'tomorrow' : `in ${b.inDays} days`}</span></li>`).join('')}</ul></section>`;
}
function investHTML() {
  const nw = netWorth(budget, { convert: (a, f, t) => fx.convert(a, f, t), base: base(), today: isoToday() });
  const { list, totals } = nw.holdings;
  const gp = (x) => (x == null ? '' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
  const srcAt = Object.values(budget.holdings.prices || {}).map((p) => p.at).filter(Boolean).sort().pop();
  return `<section class="card inv-tot"><span class="lab">Investments</span><span class="big">${money(totals.value, 'GBP')}</span>
      <div class="wk-sum"><span>Cost <b>${money(totals.cost, 'GBP')}</b></span><span class="${totals.gain < 0 ? 'neg' : 'pos'}">Gain <b>${money(totals.gain, 'GBP')} ${gp(totals.gainPct)}</b></span></div>
      <p class="mini">${srcAt ? `Prices as of ${SHORT(srcAt)}` : 'No prices yet'} — tap a holding to update its price. US$/€ holdings use live exchange rates.</p></section>
    ${list.length ? `<section class="card list">${list.map((h) => `<button class="row inv" data-act="bud-price" data-val="${esc(h.ticker)}">
      <span class="row-l"><b>${esc(h.ticker)}</b>${h.name ? `<small>${esc(h.name)}</small>` : ''}<small>${+h.shares.toFixed(4)} shares · avg ${money(h.avgCost, 'GBP')}</small></span>
      <span class="inv-v">${h.value == null ? '<small>needs a price</small>' : money(h.value, 'GBP')}<small class="${(h.gain || 0) < 0 ? 'neg' : 'pos'}">${gp(h.gainPct)}</small></span></button>`).join('')}</section>`
      : '<section class="card"><p class="mini">No holdings yet.</p></section>'}
    <button class="btn" data-act="bud-addlot">Add a purchase</button>`;
}
// ---- bank CSV (T3.3): read → group by merchant → you pick a category per merchant → add to the weeks ----
async function budCsvFile(file) {
  const err = (m) => { const el = app.querySelector('[data-err]'); if (el) el.textContent = m; };
  try {
    const rows = parseCSV(await file.text());
    const cols = detectColumns(rows);
    const { txns, bad } = toTransactions(rows, cols);
    if (!txns.length) throw new Error(bad.length ? `None of the ${bad.length} rows could be read.` : 'No transactions in that file.');
    const done = new Set(budget.imported || []);
    const fresh = txns.filter((t) => !done.has(t.id));
    const groups = {};
    for (const t of fresh) {
      const k = merchantKey(t.desc);
      (groups[k] ||= { key: k, label: k.replace(/\b[a-z]/g, (c) => c.toUpperCase()), sample: t.desc, n: 0, total: 0 });
      groups[k].n++; groups[k].total += t.amount;
    }
    budCsv = { fileName: file.name, txns: fresh, skipped: txns.length - fresh.length, bad, currency: budget.currency, groups: Object.values(groups).sort((a, b) => a.total - b.total) };
    render('fwd');
  } catch (e) { err(e.message || 'Couldn’t read that file.'); }
}
function csvGuess(g) {
  const rules = budget.rules || {};
  if (rules[g.key]) return rules[g.key];
  if (g.total > 0) return (budget.categories.find((c) => c.kind === 'income') || {}).id || '';
  return '';
}
function csvPreviewHTML() {
  const C = budCsv;
  const dates = C.txns.map((t) => t.date).sort();
  const opts = (sel) => `<option value="">Skip</option>${budget.categories.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  return `<header class="bar"><h1 class="h2">Sort your transactions</h1></header><div class="wrap">
    <p class="sub">From <b>${esc(C.fileName)}</b>${dates.length ? `, ${SHORT(dates[0])} – ${SHORT(dates[dates.length - 1])}` : ''}. Pick a category for each place once — Forge remembers it next time. Nothing is added until you tap Add.</p>
    <div class="card stats"><div><span class="stat-n">${C.txns.length}</span><span class="stat-l">new</span></div>
      <div><span class="stat-n">${C.skipped}</span><span class="stat-l">already in</span></div><div><span class="stat-n">${C.bad.length}</span><span class="stat-l">unreadable</span></div></div>
    ${C.bad.length ? `<details class="card"><summary class="rv-h">Rows Forge couldn’t read (${C.bad.length})</summary><ul class="bul">${C.bad.slice(0, 20).map((b) => `<li>Line ${b.line}: ${esc(b.reason)}</li>`).join('')}</ul></details>` : ''}
    <div class="field"><label for="csv-cur">These amounts are in</label><select class="in" id="csv-cur" data-csv-cur>${['GBP', 'AUD', 'EUR', 'USD'].map((c) => `<option value="${c}"${c === C.currency ? ' selected' : ''}>${c}</option>`).join('')}</select>
      ${C.currency !== budget.currency ? `<span class="sh-help">Converted to ${esc(budget.currency)} at today’s mid-market rate.</span>` : ''}</div>
    ${C.groups.length ? `<section class="card list csv-g">${C.groups.map((g) => `<div class="row csv-r"><span class="row-l"><b>${esc(g.label)}</b><small>${g.n} × · ${money(g.total, C.currency)}</small><small class="csv-raw">${esc(g.sample)}</small></span>
      <select class="in csv-sel" data-key="${esc(g.key)}" aria-label="Category for ${esc(g.label)}">${opts(csvGuess(g))}</select></div>`).join('')}</section>` : '<p class="banner">Everything in this file is already in your budget.</p>'}
    <div class="stack"><button class="btn primary" data-act="csv-save" ${C.groups.length ? '' : 'disabled'}>Add to my budget</button><button class="btn" data-act="csv-cancel">Cancel</button></div>
  </div>`;
}
async function csvSave() {
  const picks = {};
  app.querySelectorAll('.csv-sel').forEach((el) => { picks[el.dataset.key] = el.value; });
  const cur = budCsv.currency;
  const conv = (a) => (cur === budget.currency ? a : fx.convert(a, cur, budget.currency));
  const rules = { ...(budget.rules || {}) };
  for (const [k, v] of Object.entries(picks)) if (v) rules[k] = v;
  const txns = budCsv.txns.map((t) => ({ ...t, amount: Math.round(conv(t.amount) * 100) / 100 }));
  const { budget: next, added } = applyTransactions({ ...budget, rules }, txns, (t) => picks[merchantKey(t.desc)] || null);
  await saveBudget(next);
  budCsv = null;
  render('back');
  toast(added ? `Added ${added} transaction${added === 1 ? '' : 's'} to your weeks` : 'Nothing added — pick a category for at least one place');
}

// In-place refresh after a cell edit: keeps focus and scroll (no full re-render).
function budRefreshParts() {
  const set = (sel, html) => { const el = app.querySelector(sel); if (el) el.innerHTML = html; };
  set('[data-bud-sum]', weekSumHTML());
  set('[data-bud-over]', overBannerHTML());
  app.querySelectorAll('[data-plan]').forEach((el) => { el.innerHTML = planHintHTML(el.dataset.plan); });
  set('[data-bud-forecast]', forecastHTML());
  set('[data-bud-nw]', netWorthHTML());
}
async function budCellChange(input) {
  const v = parseEntry(input.value, input.dataset.kind);
  if (v === undefined) { input.value = entryText((budget.entries[budWeek] || {})[input.dataset.cat], input.dataset.kind); return; }
  await saveBudget(setEntry(budget, budWeek, input.dataset.cat, v));
  input.value = entryText(v, input.dataset.kind);
  budRefreshParts();
}
async function budImportFile(file) {
  const err = (m) => { const el = app.querySelector('[data-err]'); if (el) el.textContent = m; };
  err('Reading your spreadsheet…');
  try {
    const wb = await readXlsx(await file.arrayBuffer());
    const out = workbookToBudget(wb, { today: isoToday(), base: base() });
    budPreview = { ...out, fileName: file.name };
    render('fwd');
  } catch (e) { err(e.message || 'Couldn’t read that file.'); }
}
// "Use these as my current balances": cash, Premium Bonds and investments → the plan's opening pots (q49), after a preview.
function balancesFromBudget() {
  const nw = netWorth(budget, { convert: (a, f, t) => fx.convert(a, f, t), base: base(), today: isoToday() });
  const q49 = { ...((state.answers.q49 && state.answers.q49.v) || {}) };
  const cash = nw.parts.find((p) => p.id === 'cash');
  if (cash) q49[cash.currency === 'AUD' ? 'cashAUD' : 'cashGBP'] = { amount: Math.round(cash.amount), currency: cash.currency === 'AUD' ? 'AUD' : 'GBP' };
  const gbpExtras = nw.parts.filter((p) => !['cash', 'investments'].includes(p.id)).reduce((s, p) => s + (p.currency === 'GBP' ? p.amount : fx.convert(p.amount, p.currency, 'GBP')), 0);
  if (gbpExtras) q49.cashGBP = { amount: Math.round(gbpExtras + (cash && cash.currency === 'GBP' ? cash.amount : 0)), currency: 'GBP' };
  const inv = nw.parts.find((p) => p.id === 'investments');
  if (inv) q49.isa = { amount: Math.round(inv.amount), currency: 'GBP' };
  return q49;
}
function openUseBalances() {
  const q49 = balancesFromBudget();
  const before = planSnap();
  const saved = state.answers;
  state = { ...state, answers: { ...state.answers, q49: { v: q49 } } };
  const after = planSnap();
  state = { ...state, answers: saved };
  const lines = diffSnapshots(before, after, { currency: base() });
  const row = (k, label) => (q49[k] ? `<li>${label}: <b>${money(q49[k].amount, q49[k].currency)}</b></li>` : '');
  openSheet({ label: 'Use as current balances', html: `<div class="sh-top"><h2 class="h2">Update your plan</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">Your plan’s starting balances (question 49) become:</p>
    <ul class="bul">${row('cashAUD', 'Cash (A$)')}${row('cashGBP', 'Cash (£) incl. Premium Bonds')}${row('isa', 'Stocks ISA (your investments)')}${row('super', 'Australian super (unchanged)')}${row('other', 'Anything else (unchanged)')}</ul>
    <div class="sh-preview">${lines.length ? `<span class="lab">What this does to your plan</span><ul class="bul">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<span class="mini">Your headline numbers don’t move.</span>'}</div>
    <div class="sh-actions single"><button class="btn primary" data-bud="use-confirm">Update my plan</button></div>`,
  onClick: (e) => {
    if (!e.target.closest('[data-bud="use-confirm"]')) return;
    state = store.save({ ...state, answers: { ...state.answers, q49: { v: balancesFromBudget() } } });
    closeSheet();
    toast(`Plan updated${lines.length ? ' — ' + lines[0] : ''}`);
  } });
}
function openPriceSheet(ticker) {
  const h = netWorth(budget, { convert: (a, f, t) => fx.convert(a, f, t), base: base(), today: isoToday() }).holdings.list.find((x) => x.ticker === ticker);
  if (!h) return;
  const cur = h.currency || 'GBP';
  openSheet({ label: `Price for ${ticker}`, html: `<div class="sh-top"><h2 class="h2">${esc(ticker)}</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    ${h.name ? `<p class="sub">${esc(h.name)}</p>` : ''}
    <div class="field"><label for="pp">Current price (${esc(cur === 'GBX' ? 'pence' : cur)})</label><input class="in" id="pp" inputmode="decimal" value="${h.price ?? ''}" autocomplete="off"></div>
    <p class="mini">${+h.shares.toFixed(4)} shares · cost ${money(h.cost, 'GBP')}</p>
    <div class="sh-actions single"><button class="btn primary" data-bud="price-save">Save price</button></div>`,
  onClick: async (e) => {
    if (!e.target.closest('[data-bud="price-save"]')) return;
    const v = Number(String(sheetBody().querySelector('#pp').value).replace(/[^0-9.]/g, ''));
    if (!(v > 0)) return;
    await saveBudget({ ...budget, holdings: { ...budget.holdings, prices: { ...budget.holdings.prices, [ticker]: { ...(budget.holdings.prices[ticker] || {}), price: v, currency: cur, at: isoToday(), source: 'you' } } } });
    closeSheet(); render('none', { keepScroll: true }); toast(`${ticker} price saved`);
  } });
}
function openAddLot() {
  openSheet({ label: 'Add a purchase', html: `<div class="sh-top"><h2 class="h2">Add a purchase</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <form class="sh-form" data-lot>
      <div class="field"><label for="lt">Ticker</label><input class="in" id="lt" name="ticker" autocapitalize="characters" autocomplete="off" placeholder="e.g. VUSA"></div>
      <div class="field"><label for="ls">Shares</label><input class="in" id="ls" name="shares" inputmode="decimal" autocomplete="off"></div>
      <div class="field"><label for="lp">Price per share</label><input class="in" id="lp" name="price" inputmode="decimal" autocomplete="off"></div>
      <div class="field"><label for="lc">Price currency</label><select class="in" id="lc" name="currency"><option value="GBP">£ GBP</option><option value="GBX">pence (GBX)</option><option value="USD">US$</option><option value="EUR">€</option></select></div>
      <div class="field"><label for="lg">What it cost you in £</label><input class="in" id="lg" name="cost" inputmode="decimal" autocomplete="off"></div>
    </form><p class="sh-err" role="alert" data-lot-err></p>
    <div class="sh-actions single"><button class="btn primary" data-bud="lot-save">Add</button></div>`,
  onClick: async (e) => {
    if (!e.target.closest('[data-bud="lot-save"]')) return;
    const f = sheetBody().querySelector('[data-lot]').elements;
    const n = (k) => Number(String(f[k].value).replace(/[^0-9.]/g, ''));
    const lot = { ticker: f.ticker.value.trim().toUpperCase(), shares: n('shares'), price: n('price'), currency: f.currency.value, costGBP: n('cost') };
    if (!lot.ticker || !(lot.shares > 0) || !(lot.costGBP > 0)) { sheetBody().querySelector('[data-lot-err]').textContent = 'Enter the ticker, the number of shares and what it cost in £.'; return; }
    await saveBudget({ ...budget, holdings: { ...budget.holdings, lots: [...budget.holdings.lots, lot] } });
    closeSheet(); render('none', { keepScroll: true }); toast(`Added ${lot.ticker}`);
  } });
}

// ---------------- scenarios: what-ifs + compare (T2.7) ----------------
// A what-if = your answers with a few changes (kids, stop-work age, retirement spend, investing now) and, optionally,
// the life events you added. Stored in settings.whatifs (so they're in backups).
const whatIfs = () => (Array.isArray(appSettings.whatifs) ? appSettings.whatifs : []);
function summaryFor(answers, events, name) {
  const { s } = buildScenario(events, answers);
  if (!s) return null;
  const res = projectScenario(s);
  const cs = scenarioCoastStatus(s);
  const D = dashboardModel(s, res, cs, { tone: settingsFromAnswers(state.answers).tone });
  return { name, status: D.status, chip: D.chip.label, target: res.target, potAtEnd: res.retirementPot, coastDate: res.coastDate,
    coasting: cs.isCoasting, depletedAt: res.depletedAt, freeNow: D.free.amount, needToday: D.glide.needToday, retirementAge: s.retirementAge };
}
const planSummary = () => summaryFor(state.answers, userEvents, 'Your plan');
const whatIfSummary = (w) => summaryFor(applyWhatIf(state.answers, w.changes, base()), w.events === 'none' ? [] : userEvents, w.name);

function scenariosHTML() {
  const mine = planSummary();
  if (!mine) return needAnswersHTML('Scenarios');
  if (screen.compare) {
    const w = whatIfs().find((x) => x.id === screen.compare);
    const other = w && whatIfSummary(w);
    if (other) return compareHTML(mine, other, w);
  }
  const m = (x) => money(x, base(), { compact: true });
  const card = (sum, extra, actions) => `<section class="card scn"><span class="scn-t">${esc(sum.name)}</span><span class="scn-s">${esc(extra)}</span>
    <span class="scn-k"><span class="chip-s">${esc(sum.chip)}</span><span>Coast ${sum.coasting ? 'now' : sum.coastDate ? monthLabel(sum.coastDate) : '—'}</span><span>Pot at ${sum.retirementAge}: ${sum.potAtEnd < 0 ? 'short' : m(sum.potAtEnd)}</span></span>${actions || ''}</section>`;
  return `<header class="bar"><h1 class="h2">Scenarios</h1></header><div class="wrap">
    ${card(mine, 'Built from your answers and the events you added', '<a class="link-btn" href="#plan" style="align-self:flex-start;padding-left:0">Open your plan</a>')}
    ${whatIfs().map((w) => { const sm = whatIfSummary(w); return sm ? card(sm, describeChanges(w.changes, base()) + (w.events === 'none' ? ' · without your added events' : ''),
      `<div class="scn-act"><button class="btn small primary" data-act="wi-compare" data-val="${esc(w.id)}">Compare with your plan</button><button class="btn small" data-act="wi-edit" data-val="${esc(w.id)}">Edit</button></div>`) : ''; }).join('')}
    <button class="btn" data-act="wi-new">New what-if</button>
    <p class="mini">What-ifs change a copy of your plan — your real answers stay as they are.</p>
  </div>`;
}
function compareHTML(A, B, w) {
  const M = compareModel(A, B, { currency: base() });
  return `<header class="bar"><button class="icon-btn" data-act="wi-back" aria-label="Back to scenarios"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><h1 class="h2">Compare</h1><span style="width:44px"></span></header>
    <div class="wrap">
      <div class="cmp-h"><span class="cmp-a">A · ${esc(M.a)}</span><span class="cmp-b">B · ${esc(M.b)}</span></div>
      <p class="mini">B: ${esc(describeChanges(w.changes, base()))}${w.events === 'none' ? ', without your added events' : ''}. Everything else is the same as your plan.</p>
      <section class="card cmp">${M.rows.map((r) => `<div class="cmp-r" data-key="${r.key}"><span class="cmp-l">${esc(r.label)}</span>
        <span class="cmp-v${r.better === 'a' ? ' win' : ''}">${esc(r.a)}</span><span class="cmp-v${r.better === 'b' ? ' win' : ''}">${esc(r.b)}</span>
        <span class="cmp-d">${esc(r.delta)}</span></div>`).join('')}</section>
      <p class="foot">Estimates, not financial advice. All figures in today’s money.</p>
    </div>`;
}
let wiEditing = null; // id or null (new)
function whatIfFormHTML(w) {
  const q74 = (state.answers.q74 && state.answers.q74.v) || {};
  const c = (w && w.changes) || {};
  const val = (k, fallback) => (Number.isFinite(c[k]) ? c[k] : fallback ?? '');
  const q63 = state.answers.q63 && state.answers.q63.v, q50 = state.answers.q50 && state.answers.q50.v;
  return `<div class="sh-top"><h2 class="h2">${w ? 'Edit what-if' : 'New what-if'}</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">Change any of these. Blank means “same as my plan”.</p>
    <form class="sh-form" data-wi novalidate>
      <div class="field"><label for="wi-name">Name</label><input class="in" id="wi-name" name="name" value="${esc((w && w.name) || '')}" placeholder="e.g. Two children" autocomplete="off"></div>
      <div class="field"><label for="wi-kids">Number of kids</label><input class="in" id="wi-kids" name="kids" inputmode="numeric" value="${val('kids')}" placeholder="${Number.isFinite(q74.count) ? q74.count : 'not answered'}" autocomplete="off"></div>
      <div class="field"><label for="wi-af">Your age at the first child</label><input class="in" id="wi-af" name="ageFirst" inputmode="numeric" value="${val('ageFirst')}" placeholder="${Number.isFinite(q74.ageFirst) ? q74.ageFirst : 'not answered'}" autocomplete="off"></div>
      <div class="field"><label for="wi-age">Stop work at</label><input class="in" id="wi-age" name="retirementAge" inputmode="numeric" value="${val('retirementAge')}" placeholder="${state.answers.q4 ? state.answers.q4.v : ''}" autocomplete="off"></div>
      <div class="field"><label for="wi-sp">Retirement spend per year</label><input class="in" id="wi-sp" name="spend" inputmode="decimal" value="${val('spend')}" placeholder="${q63 && Number.isFinite(q63.amount) ? q63.amount : ''}" autocomplete="off"></div>
      <div class="field"><label for="wi-inv">Investing per month now</label><input class="in" id="wi-inv" name="investNow" inputmode="decimal" value="${val('investNow')}" placeholder="${q50 && q50.now && Number.isFinite(q50.now.amount) ? q50.now.amount : ''}" autocomplete="off"></div>
      <label class="chk"><input type="checkbox" name="events" ${!w || w.events !== 'none' ? 'checked' : ''}> Include the life events I added</label>
    </form>
    <div class="sh-preview" aria-live="polite" data-wi-preview><span class="mini">Change something to see the difference.</span></div>
    <div class="sh-actions${w ? '' : ' single'}">${w ? '<button class="btn danger" data-wi-act="delete">Delete</button>' : ''}<button class="btn primary" data-wi-act="save">${w ? 'Save' : 'Create'}</button></div>`;
}
function readWhatIf() {
  const f = sheetBody().querySelector('[data-wi]').elements;
  const n = (k) => { const t = String(f[k].value).replace(/[^0-9.]/g, ''); return t === '' ? undefined : Number(t); };
  const changes = {};
  for (const k of ['kids', 'ageFirst', 'retirementAge', 'spend', 'investNow']) { const v = n(k); if (Number.isFinite(v)) changes[k] = v; }
  return { name: String(f.name.value).trim(), changes, events: f.events.checked ? 'mine' : 'none' };
}
function previewWhatIf() {
  const box = sheetBody() && sheetBody().querySelector('[data-wi-preview]');
  if (!box) return;
  const w = readWhatIf();
  if (Number.isFinite(w.changes.retirementAge) && (w.changes.retirementAge < 30 || w.changes.retirementAge > 80)) { box.innerHTML = '<p class="sh-err">Stop-work age must be 30–80.</p>'; return; }
  if (Number.isFinite(w.changes.kids) && w.changes.kids > 8) { box.innerHTML = '<p class="sh-err">Up to 8 kids.</p>'; return; }
  const b = whatIfSummary({ ...w, name: 'B' });
  const a = planSummary();
  if (!b) { box.innerHTML = '<span class="mini">Not enough answers to work this out.</span>'; return; }
  const rows = compareModel(a, b, { currency: base() }).rows.filter((r) => ['status', 'coast', 'pot'].includes(r.key));
  box.innerHTML = `<span class="lab">Compared with your plan</span><ul class="bul">${rows.map((r) => `<li>${esc(r.label)}: ${esc(r.a)} → ${esc(r.b)}</li>`).join('')}</ul>`;
}
function openWhatIf(id) {
  wiEditing = id || null;
  const w = id ? whatIfs().find((x) => x.id === id) : null;
  openSheet({ label: w ? 'Edit what-if' : 'New what-if', html: whatIfFormHTML(w), onInput: previewWhatIf,
    onClick: async (e) => {
      const b = e.target.closest('[data-wi-act]');
      if (!b) return;
      e.preventDefault();
      let list = whatIfs();
      if (b.dataset.wiAct === 'delete') {
        if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Tap to confirm'; return; }
        list = list.filter((x) => x.id !== wiEditing);
      } else {
        const w2 = readWhatIf();
        if (!w2.name) w2.name = describeChanges(w2.changes, base()).replace(/^./, (c) => c.toUpperCase());
        if (wiEditing) list = list.map((x) => (x.id === wiEditing ? { ...x, ...w2 } : x));
        else list = [...list, { id: newEventId(list).replace('ev-', 'wi-'), ...w2 }];
      }
      appSettings = await data.saveSettings({ whatifs: list });
      closeSheet();
      render('none', { keepScroll: true });
      toast(b.dataset.wiAct === 'delete' ? 'What-if deleted' : 'What-if saved');
    } });
  if (w) previewWhatIf();
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
    ${assumptionsHTML()}
    <section class="card list"><h2 class="list-h">Your data</h2>
      <button class="row" data-act="export"><span class="row-l">Back up everything</span><span class="row-v">answers, events, budget</span><span class="row-c" aria-hidden="true">›</span></button>
      <label class="row as-label"><span class="row-l">Restore from a backup</span><span class="row-c" aria-hidden="true">›</span><input type="file" accept="application/json,.json" data-act="import" hidden></label>
      <button class="row danger" data-act="wipe"><span class="row-l">${screen.confirmWipe ? 'Tap again — this deletes everything on this phone' : 'Delete all my data'}</span></button>
      <p class="list-note">Everything is stored on this phone only${store.persistent && data.persistent ? '' : ' — and this browser isn’t saving it, so back up now'}. Back up now and then; a backup is one file you can keep in iCloud Drive.</p>
    </section>
    <section class="card list"><h2 class="list-h">About</h2>
      <a class="row" href="#privacy"><span class="row-l">Privacy — what’s stored and where</span><span class="row-c" aria-hidden="true">›</span></a>
      <a class="row" href="#advice"><span class="row-l">Not financial advice</span><span class="row-c" aria-hidden="true">›</span></a>
      <p class="list-note">Forge is a planning tool. Estimates, not financial advice. All figures in today’s money.</p>
    </section>
  </div>`;
}

// Assumptions: three come from your answers (edit the question); inflation and cash growth are settings.
function assumptionsHTML() {
  const { s } = buildScenario();
  const a = s ? s.assumptions : null;
  const row = (q, label, value) => `<button class="row" data-act="edit" data-val="${q}" data-return="settings"><span class="row-l">${label}</span><span class="row-v">${esc(value)}</span><span class="row-c" aria-hidden="true">›</span></button>`;
  const num = (key, label, value) => `<button class="row" data-act="set-num" data-val="${key}"><span class="row-l">${label}</span><span class="row-v">${esc(value)}</span><span class="row-c" aria-hidden="true">›</span></button>`;
  const ov = appSettings.assumptions || {};
  return `<section class="card list"><h2 class="list-h">Money and assumptions</h2>
    ${row('q7', 'Main currency', base() === 'AUD' ? 'A$ Aussie dollars' : '£ Pounds')}
    ${a ? row('q55', 'Investment return', `${pct(a.nominalReturn)} a year`) : ''}
    ${a ? row('q66', 'Withdrawal rate', pct(a.withdrawalRate)) : ''}
    ${num('inflation', 'Inflation', `${pct(Number.isFinite(ov.inflation) ? ov.inflation : 0.025)} a year`)}
    ${num('cashRealReturn', 'Cash growth after inflation', `${pct(Number.isFinite(ov.cashRealReturn) ? ov.cashRealReturn : 0)} a year`)}
    <p class="list-note">The second currency is ${base() === 'AUD' ? '£' : 'A$'}; amounts in it are converted at live rates.</p></section>`;
}
const NUM_SETTINGS = {
  inflation: { label: 'Inflation', help: 'How fast prices rise each year. Everything in Forge is in today’s money; this sets how much returns are worth after rising prices.', def: 0.025, min: -2, max: 10 },
  cashRealReturn: { label: 'Cash growth after inflation', help: 'What savings in cash earn beyond inflation. 0% means cash just keeps its value; negative means it loses value.', def: 0, min: -5, max: 5 },
};
function openNumberSetting(key) {
  const N = NUM_SETTINGS[key];
  const cur = (appSettings.assumptions || {})[key];
  openSheet({ label: N.label, html: `<div class="sh-top"><h2 class="h2">${esc(N.label)}</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">${esc(N.help)}</p>
    <div class="field"><label for="ns">Percent a year</label><div class="num"><input class="in" id="ns" inputmode="decimal" value="${+(((Number.isFinite(cur) ? cur : N.def)) * 100).toFixed(2)}" autocomplete="off"><span class="num-unit">%</span></div></div>
    <p class="sh-err" role="alert" data-ns-err></p>
    <div class="sh-actions"><button class="btn" data-ns="reset">Use the default (${pct(N.def)})</button><button class="btn primary" data-ns="save">Save</button></div>`,
  onClick: async (e) => {
    const b = e.target.closest('[data-ns]');
    if (!b) return;
    let v;
    if (b.dataset.ns === 'reset') v = undefined;
    else {
      const raw = String(sheetBody().querySelector('#ns').value).replace('−', '-').replace(/[^0-9.\-]/g, '');
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n) || n < N.min || n > N.max) { sheetBody().querySelector('[data-ns-err]').textContent = `Enter a number from ${N.min} to ${N.max}.`; return; }
      v = n / 100;
    }
    const before = planSnap();
    const next = { ...(appSettings.assumptions || {}) };
    if (v === undefined) delete next[key]; else next[key] = v;
    appSettings = await data.saveSettings({ assumptions: next });
    const lines = diffSnapshots(before, planSnap(), { currency: base() });
    closeSheet();
    render('none', { keepScroll: true });
    toast(`${N.label} saved${lines.length ? ' — ' + lines[0] : ''}`);
  } });
}
// Full backup / restore / delete-all (T2.8). Restore replaces everything, so it asks first.
async function exportEverything() {
  download(`forge-backup-${isoToday()}.json`, await data.exportAll());
  appSettings = await data.saveSettings({ lastBackupAt: new Date().toISOString() });
  toast('Backup saved — keep the file somewhere safe');
}
function openRestore(text) {
  let info;
  try { info = parseBackupInfo(text); } catch (e) { return alertInline(e.message); }
  openSheet({ label: 'Restore backup', html: `<div class="sh-top"><h2 class="h2">Restore this backup?</h2><button class="btn small ghost" data-sheet-close>Cancel</button></div>
    <p class="sub">From ${esc(info.when)}. It <b>replaces everything</b> on this phone:</p>
    <ul class="bul"><li>${info.answers} answer${info.answers === 1 ? '' : 's'}</li><li>${info.events} life event${info.events === 1 ? '' : 's'} you added</li><li>${info.budget ? 'Your budget and investments' : 'No budget'}</li></ul>
    <div class="sh-actions single"><button class="btn primary" data-rs="go">Restore</button></div>`,
  onClick: async (e) => {
    if (!e.target.closest('[data-rs="go"]')) return;
    await data.importAll(text);
    location.reload(); // everything re-reads from storage
  } });
}
function parseBackupInfo(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('That file isn’t a Forge backup.'); }
  if (!d || d.app !== 'forge' || d.kind !== 'full-backup') throw new Error('That file isn’t a full Forge backup.');
  return { when: d.exportedAt ? new Date(d.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'an unknown date',
    answers: d.onboarding && d.onboarding.answers ? Object.keys(d.onboarding.answers).length : 0,
    events: d.settings && Array.isArray(d.settings.events) ? d.settings.events.length : 0, budget: !!d.budget };
}

// ---------------- privacy + not-advice pages (T6.4) ----------------
const backBar = (title) => `<header class="bar"><a class="icon-btn" href="#settings" aria-label="Back to Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a><h1 class="h2">${title}</h1><span style="width:44px"></span></header>`;
function privacyHTML() {
  return `${backBar('Privacy')}<div class="wrap doc">
    <section class="card"><h2 class="h3">The short version</h2><ul class="bul">
      <li>Everything you put into Forge stays <b>on this phone</b>. There’s no account and nothing is uploaded.</li>
      <li>Forge never asks for bank logins. Bank data only comes in as files you choose to import.</li>
      <li>No adverts, no tracking, no analytics.</li></ul></section>
    <section class="card"><h2 class="h3">What’s stored on this phone</h2><ul class="bul">
      <li>Your answers to the questions, and the life events and what-ifs you add.</li>
      <li>Your budget and investments (from your spreadsheet, bank CSVs or what you type), and monthly check-ins.</li>
      <li>Settings, and a copy of the latest exchange rates.</li></ul>
      <p class="mini">It’s kept in this browser’s storage for this site. Clearing Safari’s website data, or deleting the app from the home screen, can remove it — so back up.</p></section>
    <section class="card"><h2 class="h3">What leaves the phone</h2><ul class="bul">
      <li><b>Exchange rates</b>: Forge asks open.er-api.com for today’s rates. The request contains no personal data.</li>
      <li><b>Fonts</b>: the Inter and Sora fonts load from Google Fonts, which sees your device’s IP address, like any website visit.</li>
      <li><b>Spreadsheets and bank CSVs</b> you import are read on the phone and never sent anywhere.</li></ul></section>
    <section class="card"><h2 class="h3">Your data, your call</h2><ul class="bul">
      <li><b>Export</b>: Settings → Back up everything gives you one file with all of it.</li>
      <li><b>Delete</b>: Settings → Delete all my data wipes it from this phone.</li>
      <li>If syncing between devices is ever added, it will be opt-in, and only you will be able to read your data.</li></ul>
      <div class="stack"><button class="btn" data-act="export">Back up everything</button><a class="btn" href="#settings">Back to Settings</a></div></section>
  </div>`;
}
function adviceHTML() {
  return `${backBar('Not financial advice')}<div class="wrap doc">
    <section class="card"><h2 class="h3">Forge is a planning tool</h2>
      <p>It does arithmetic on the numbers you give it and on assumptions you can see and change (returns, inflation, withdrawal rate, access ages). It doesn’t know your full situation and it isn’t regulated financial advice.</p></section>
    <section class="card"><h2 class="h3">How to read the numbers</h2><ul class="bul">
      <li>Everything is an <b>estimate</b>, shown in today’s money and as a range (low / middle / high returns). Real markets don’t move in straight lines.</li>
      <li>Not modelled yet: tax, fees, sequence-of-returns risk, and currency swings beyond today’s exchange rate.</li>
      <li>Pension and super access ages come from official sources (gov.uk, the ATO) and are marked as estimates — check with your scheme or fund.</li>
      <li>Nothing here is a promise. Forge never says you <i>will</i> reach a number.</li></ul></section>
    <section class="card"><h2 class="h3">Before a big decision</h2>
      <p>Before acting on a big decision — moving a pension or super, borrowing for training, buying a home — check the details with your provider, and consider speaking to a regulated financial adviser.</p>
      <a class="btn" href="#settings">Back to Settings</a></section>
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
  if (act === 'bud-seg') { budSeg = val; return render('none', { keepScroll: true }); }
  if (act === 'bud-week') { budWeek = addWeeks(budWeek, Number(val)); return render('none', { keepScroll: true }); }
  if (act === 'bud-scratch') { saveBudget({ ...emptyBudget(base()), categories: STARTER_CATEGORIES, openingAt: defaultWeek({ entries: {} }, isoToday()) }).then(() => render('fwd')); return; }
  if (act === 'bud-import-cancel') { budPreview = null; return render('back'); }
  if (act === 'bud-import-save') { const b = budPreview.budget; budPreview = null; budWeek = null; saveBudget(b).then(() => { render('fwd'); toast('Budget imported'); }); return; }
  if (act === 'bud-use') return openUseBalances();
  if (act === 'bud-plan') return openPlanSheet(val);
  if (act === 'csv-save') { csvSave(); return; }
  if (act === 'csv-cancel') { budCsv = null; return render('back'); }
  if (act === 'bud-price') return openPriceSheet(val);
  if (act === 'bud-addlot') return openAddLot();
  if (act === 'bud-remove') {
    if (!screen.confirmBudRemove) { screen = { ...screen, confirmBudRemove: true }; return render('none', { keepScroll: true }); }
    screen = { ...screen, confirmBudRemove: false };
    budget = null; budWeek = null;
    data.removeBudget().catch(() => {});
    return render('back');
  }
  if (act === 'wi-new') return openWhatIf(null);
  if (act === 'wi-edit') return openWhatIf(val);
  if (act === 'wi-compare') { screen = { name: 'scenarios', compare: val }; return render('fwd'); }
  if (act === 'wi-back') { screen = { name: 'scenarios' }; return render('back'); }
  if (act === 'ci-open') return openCheckin();
  if (act === 'rc-use') return openUseReality(Number(val));
  if (act === 'ev-add') return openEventEditor(null);
  if (act === 'ev-edit') return openEventEditor(val);
  if (act === 'tl-step') {
    const r = app.querySelector('.sc-range');
    const nx = tlModel && r ? nextStop(tlModel, tlTarget ?? Number(r.value), Number(val)) : null;
    return nx == null ? undefined : scrubAnimate(nx);
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
  if (act === 'export') { exportEverything(); return; }
  if (act === 'crash-reload') { location.reload(); return; }
  if (act === 'crash-answers') { screen = { name: 'review' }; if (location.hash === '#answers') render('fwd'); else location.hash = '#answers'; return; }
  if (act === 'set-num') return openNumberSetting(val);
  if (act === 'wipe') {
    if (!screen.confirmWipe) { screen = { ...screen, confirmWipe: true }; return render('none', { keepScroll: true }); }
    data.clearAll().then(() => {
      state = store.reset();
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
      location.reload();
    });
    return;
  }
  if (act === 'reset') {
    if (!screen.confirmReset) { screen = { ...screen, confirmReset: true }; return render('none', { keepScroll: true }); }
    state = store.reset();
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* file:// etc. */ }
    return go({ name: 'welcome' }, 'back');
  }
});

app.addEventListener('change', (e) => {
  const input = e.target;
  if (input.matches('.be')) { budCellChange(input); return; }
  if (input.matches('[data-act="bud-import"]') && input.files && input.files[0]) { budImportFile(input.files[0]); input.value = ''; return; }
  if (input.matches('[data-act="bud-csv"]') && input.files && input.files[0]) { budCsvFile(input.files[0]); input.value = ''; return; }
  if (input.matches('[data-csv-cur]') && budCsv) { budCsv = { ...budCsv, currency: input.value }; render('none', { keepScroll: true }); return; }
  if (!input.matches('[data-act="import"]') || !input.files || !input.files[0]) return;
  input.files[0].text().then((text) => {
    input.value = '';
    let kind = null;
    try { kind = JSON.parse(text).kind; } catch { /* handled below */ }
    if (kind === 'full-backup') return openRestore(text);
    const answers = importAnswers(text, KNOWN_IDS); // older answers-only backups still work
    state = store.save({ ...state, answers: { ...state.answers, ...answers }, mode: state.mode || 'full' });
    go({ name: 'review' });
  }).catch((err) => alertInline(err.message || 'Couldn’t read that file.'));
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.be')) { e.preventDefault(); e.target.blur(); return; }
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
// Load the life events you added (settings.events), then draw. LocalStore reads are synchronous under the
// hood, so this resolves on the next microtask — no visible delay.
Promise.all([
  data.getSettings().then((st) => { appSettings = st || {}; userEvents = Array.isArray(st.events) ? st.events : []; }),
  data.getBudget().then((b) => { budget = b; }),
  data.listSnapshots().then((l) => { snapshots = l; }),
]).catch(() => {}).finally(() => render('none'));
// Offline app shell (T6.1): only over HTTPS (GitHub Pages), never on local test servers.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline mode unavailable:', e));
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) toast('Forge updated — the new version is ready next time you open it');
    had = true;
  });
}
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
