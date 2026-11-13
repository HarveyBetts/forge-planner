import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, SECTIONS, BY_ID, v, optValue } from '../src/onboarding/questions.js';
import {
  validateValue, visibleQuestions, progress, nextQuestion, prevQuestion, isAnswered,
  answersToScenario, REQUIRED_FOR_PLAN, DEFAULT_TRAINING_MONTHS,
} from '../src/onboarding/answers.js';
import { createStore, setAnswer, setUnknown, exportAnswers, importAnswers, STORAGE_KEY, emptyState } from '../src/onboarding/state.js';
import { convertApprox } from '../src/fx/fallback.js';
import { projectScenario } from '../src/engine/engine.js';

const A = (obj) => Object.fromEntries(Object.entries(obj).map(([k, val]) => [k, { v: val }]));
const gbp = (amount) => ({ amount, currency: 'GBP' });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// ---------------- question bank integrity ----------------
test('bank has 146 questions numbered 1..146 with unique ids', () => {
  assert.equal(QUESTIONS.length, 146);
  QUESTIONS.forEach((q, i) => { assert.equal(q.n, i + 1); assert.equal(q.id, 'q' + (i + 1)); });
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 146);
});

test('every question is well-formed', () => {
  const sections = new Set(SECTIONS.map((s) => s.id));
  const types = new Set(['text', 'longtext', 'number', 'percent', 'money', 'month', 'choice', 'multi', 'scale', 'fields']);
  for (const q of QUESTIONS) {
    assert.ok(sections.has(q.section), q.id + ' section');
    assert.ok(types.has(q.type), q.id + ' type');
    assert.ok(q.text && q.text.length > 5, q.id + ' text');
    if (q.type === 'choice' || q.type === 'multi') assert.ok(q.opts && q.opts.length >= 2, q.id + ' opts');
    if (q.type === 'scale') assert.equal(q.labels.length, 2, q.id + ' labels');
    if (q.type === 'money') assert.ok(['mo', 'yr', 'wk', 'once'].includes(q.per), q.id + ' per');
    if (q.type === 'fields') {
      assert.ok(q.fields.length >= 2, q.id + ' fields');
      for (const f of q.fields) {
        assert.ok(f.k && f.label, q.id + ' field key/label');
        if (f.type === 'choice') assert.ok(f.opts.length >= 2, q.id + '.' + f.k);
        if (f.type === 'money') assert.ok(f.per, q.id + '.' + f.k + ' per');
      }
    }
    if (q.when) assert.doesNotThrow(() => q.when({}), q.id + ' when');
  }
});

test('quick start is about 30 starred questions and includes everything the plan needs', () => {
  const stars = QUESTIONS.filter((q) => q.star);
  assert.ok(stars.length >= 25 && stars.length <= 40, 'star count ' + stars.length);
  for (const id of REQUIRED_FOR_PLAN) assert.ok(BY_ID[id].star, id + ' must be starred');
});

// ---------------- validation ----------------
test('validateValue accepts good values and rejects bad ones', () => {
  assert.equal(validateValue(BY_ID.q1, '1999-04'), null);
  assert.ok(validateValue(BY_ID.q1, '1999-13'));
  assert.equal(validateValue(BY_ID.q4, 55), null);
  assert.ok(validateValue(BY_ID.q4, 20));
  assert.ok(validateValue(BY_ID.q4, NaN));
  assert.equal(validateValue(BY_ID.q25, gbp(3000)), null);
  assert.ok(validateValue(BY_ID.q25, gbp(-1)));
  assert.ok(validateValue(BY_ID.q25, { amount: 5, currency: 'USD' }));
  assert.equal(validateValue(BY_ID.q7, 'AUD'), null);
  assert.ok(validateValue(BY_ID.q7, 'EUR'));
  assert.equal(validateValue(BY_ID.q13, ['Loan', 'Own savings']), null);
  assert.ok(validateValue(BY_ID.q13, []));
  assert.equal(validateValue(BY_ID.q56, 3), null);
  assert.ok(validateValue(BY_ID.q56, 6));
  assert.ok(validateValue(BY_ID.q6, '   '));
  assert.equal(validateValue(BY_ID.q30, 3.5), null);
});

test('fields: at least one box, and each filled box must be valid', () => {
  assert.ok(validateValue(BY_ID.q74, {}));
  assert.equal(validateValue(BY_ID.q74, { count: 2 }), null);
  assert.equal(validateValue(BY_ID.q98, { percent: 10, by: '2032-06' }), null);
  assert.match(validateValue(BY_ID.q98, { percent: 140 }), /Deposit/);
  assert.equal(validateValue(BY_ID.q49, { isa: { amount: 14000, currency: 'GBP' } }), null);
});

// ---------------- visibility & navigation ----------------
test('conditional questions hide and show', () => {
  const ids = (a, m) => visibleQuestions(a, m).map((q) => q.id);
  assert.ok(ids({}, 'full').includes('q15') === false, 'loan hidden until Loan picked');
  assert.ok(ids(A({ q13: ['Loan'] }), 'full').includes('q15'));
  assert.ok(!ids(A({ q11: 'Not doing it' }), 'full').includes('q12'));
  assert.ok(!ids(A({ q74: { count: 0 } }), 'full').includes('q79'));
  assert.ok(!ids(A({ q79: 'No' }), 'full').includes('q82'));
  assert.ok(!ids(A({ q94: 'Rent long-term' }), 'full').includes('q97'));
  assert.ok(!ids(A({ q2: 'Stay in Australia' }), 'full').includes('q3'));
});

test('quick mode only shows starred questions', () => {
  assert.ok(visibleQuestions({}, 'quick').every((q) => q.star));
  assert.ok(visibleQuestions({}, 'quick').length < visibleQuestions({}, 'full').length);
});

test('progress counts answered and "don\'t know" equally', () => {
  const a = { q1: { v: '1999-04' }, q4: { unknown: true } };
  assert.ok(isAnswered(a, 'q4'));
  const p = progress(a, 'quick');
  assert.equal(p.done, 2);
  assert.ok(p.total >= 25);
});

test('next/prev walk the visible list', () => {
  assert.equal(nextQuestion({}, 'quick').id, 'q1');
  assert.equal(nextQuestion({}, 'quick', 'q1').id, 'q3');
  assert.equal(prevQuestion({}, 'quick', 'q3').id, 'q1');
  assert.equal(prevQuestion({}, 'quick', 'q1'), null);
  const last = visibleQuestions({}, 'full').at(-1);
  assert.equal(nextQuestion({}, 'full', last.id), null);
});

// ---------------- answers -> scenario ----------------
const today = '2026-11';

test('missing required answers are reported instead of guessing', () => {
  const r = answersToScenario(A({ q1: '1999-04' }), { today });
  assert.equal(r.scenario, null);
  assert.deepEqual(r.missing, ['q4', 'q63']);
});

test('minimal answers produce a runnable scenario with labelled assumptions', () => {
  const r = answersToScenario(A({ q1: '1999-04', q4: 55, q63: gbp(60000) }), { today });
  assert.ok(r.scenario);
  assert.equal(r.scenario.retirementAge, 55);
  assert.equal(r.scenario.assumptions.nominalReturn, 0.07);
  assert.equal(r.scenario.assumptions.withdrawalRate, 0.04);
  assert.ok(r.assumptions.some((s) => /7%/.test(s)));
  assert.ok(r.notPlaced.some((s) => /investing/i.test(s)));
  const p = projectScenario(r.scenario);
  near(p.target, 60000 / 0.04);
});

test('investing steps follow the pilot timeline', () => {
  const r = answersToScenario(A({
    q1: '1999-04', q4: 55, q63: gbp(60000), q12: '2027-09',
    q50: { now: gbp(500), training: gbp(0), fo: gbp(1500) },
  }), { today });
  const inv = r.scenario.items.find((i) => i.id === 'investing');
  assert.deepEqual(inv.steps.map((s) => [s.from, s.monthly]), [['2026-11', 500], ['2027-09', 0], ['2029-03', 1500]]);
  assert.equal(DEFAULT_TRAINING_MONTHS, 18);
});

test('private school fees land on the right months for each child', () => {
  const r = answersToScenario(A({
    q1: '1999-04', q4: 60, q63: gbp(60000),
    q74: { count: 2, ageFirst: 32, gap: 3 }, q79: 'Definite', q81: 'Prep (4)', q82: gbp(20000), q85: gbp(2000),
  }), { today });
  const s1 = r.scenario.items.find((i) => i.id === 'school-1');
  const s2 = r.scenario.items.find((i) => i.id === 'school-2');
  // child 1 born 2031-04 -> prep from 2035-04 to the month before 18 (2049-03)
  assert.deepEqual([s1.from, s1.to, s1.annual], ['2035-04', '2049-03', 22000]);
  assert.deepEqual([s2.from, s2.to], ['2038-04', '2052-03']);
});

test('"No" to private school adds no fees; missing fee is reported, not invented', () => {
  const base = { q1: '1999-04', q4: 60, q63: gbp(60000), q74: { count: 1, ageFirst: 32 } };
  const no = answersToScenario(A({ ...base, q79: 'No', q82: gbp(20000) }), { today });
  assert.ok(!no.scenario.items.some((i) => i.id.startsWith('school')));
  const noFee = answersToScenario(A({ ...base, q79: 'Definite', q81: 'Senior (11)' }), { today });
  assert.ok(!noFee.scenario.items.some((i) => i.id.startsWith('school')));
  assert.ok(noFee.notPlaced.some((s) => /school fees/.test(s)));
});

test('house deposit, cars, trip and holidays become cash flows', () => {
  const r = answersToScenario(A({
    q1: '1999-04', q4: 60, q63: gbp(60000), q12: '2027-09',
    q97: gbp(400000), q98: { percent: 10, by: '2032-06' },
    q107: gbp(30000), q110: 5,
    q113: { where: 'Vietnam', when: '2027-03', cost: gbp(4000) },
    q116: { perYear: 2, costEach: gbp(3000) },
  }), { today });
  const o = r.scenario.oneOffs;
  assert.deepEqual(o.find((x) => x.name === 'House deposit'), { at: '2032-06', amount: -40000, name: 'House deposit' });
  const cars = o.filter((x) => x.name === 'Car').map((x) => x.at);
  assert.equal(cars[0], '2029-03');
  assert.equal(cars[1], '2034-03');
  assert.ok(cars.every((at) => at <= '2059-04'));
  assert.ok(o.some((x) => x.name === 'Dirt-bike trip' && x.amount === -4000));
  const hol = r.scenario.items.find((i) => i.id === 'holidays');
  assert.deepEqual([hol.annual, hol.from], [6000, '2029-03']);
  assert.doesNotThrow(() => projectScenario(r.scenario));
});

test('amounts are converted to the base currency', () => {
  const r = answersToScenario(A({
    q1: '1999-04', q4: 55, q7: 'GBP', q63: gbp(60000),
    q49: { super: { amount: 15200, currency: 'AUD' }, isa: gbp(14000) },
  }), { today, convert: convertApprox });
  near(r.scenario.openingPot, 14000 + 15200 / 1.52 * 0.79, 1e-6);
  assert.ok(r.assumptions.some((s) => /super/i.test(s)));
});

test('events before today or after retirement are dropped and noted', () => {
  const r = answersToScenario(A({
    q1: '1999-04', q4: 40, q63: gbp(60000),
    q113: { when: '2020-01', cost: gbp(1000) },
  }), { today });
  assert.equal(r.scenario.oneOffs.length, 0);
  assert.ok(r.assumptions.some((s) => /left out/.test(s)));
});

test('"spend more now" turns on redirect-after-coast', () => {
  const r = answersToScenario(A({ q1: '1999-04', q4: 55, q63: gbp(60000), q57: 'Spend more now once on track' }), { today });
  assert.equal(r.scenario.redirectAfterCoast, true);
});

// ---------------- storage ----------------
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, val) => m.set(k, String(val)), removeItem: (k) => m.delete(k), m };
}

test('store saves after each answer and resumes', () => {
  const st = fakeStorage();
  const s1 = createStore(st);
  let s = s1.load();
  s = setAnswer({ ...s, mode: 'quick' }, 'q1', '1999-04');
  s = setUnknown(s, 'q3');
  s1.save(s);
  const resumed = createStore(st).load();
  assert.equal(resumed.mode, 'quick');
  assert.deepEqual(resumed.answers.q1, { v: '1999-04' });
  assert.deepEqual(resumed.answers.q3, { unknown: true });
  assert.equal(resumed.pos, 'q3');
});

test('store survives throwing storage, corrupt JSON and no storage', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const a = createStore(throwing);
  assert.deepEqual(a.load(), emptyState());
  a.save(setAnswer(a.load(), 'q1', '1999-04'));
  assert.equal(a.persistent, false);
  assert.deepEqual(a.load().answers.q1, { v: '1999-04' }, 'kept in memory');

  const st = fakeStorage();
  st.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(createStore(st).load(), emptyState());

  const none = createStore(null);
  none.save(setAnswer(none.load(), 'q4', 55));
  assert.equal(none.load().answers.q4.v, 55);
});

test('export/import round-trips and ignores unknown ids', () => {
  const s = setAnswer(setUnknown(emptyState(), 'q3'), 'q1', '1999-04');
  const text = exportAnswers({ ...s, mode: 'full' });
  const known = new Set(QUESTIONS.map((q) => q.id));
  assert.deepEqual(importAnswers(text, known), { q3: { unknown: true }, q1: { v: '1999-04' } });
  const tampered = JSON.stringify({ app: 'forge', kind: 'onboarding-answers', answers: { q999: { v: 1 }, q1: { v: '2000-01' } } });
  assert.deepEqual(importAnswers(tampered, known), { q1: { v: '2000-01' } });
  assert.throws(() => importAnswers('nope', known), /valid JSON/);
  assert.throws(() => importAnswers('{"app":"other"}', known), /backup/);
});

test('v() treats "don\'t know" as no value', () => {
  assert.equal(v({ q1: { unknown: true } }, 'q1'), undefined);
  assert.equal(v({ q1: { v: 'x' } }, 'q1'), 'x');
  assert.equal(optValue({ v: 'GBP', l: '£' }), 'GBP');
});
