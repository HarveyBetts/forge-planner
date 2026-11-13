import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedAnswers, entriesToAnswers, readMonth, readMoney, readChoice, readAnswer } from '../src/onboarding/paste.js';
import { BY_ID } from '../src/onboarding/questions.js';

const byId = (r) => Object.fromEntries(r.entries.map((e) => [e.id, e]));

test('readMonth: many human formats', () => {
  const cases = { 'March 1997': '1997-03', 'mar 97': '1997-03', 'Sept 2027': '2027-09', 'Sep. 27': '2027-09', '03/1997': '1997-03',
    '1997-03': '1997-03', '1997/3': '1997-03', '9-2027': '2027-09', '15/03/1997': '1997-03', 'about June 2034 I think': '2034-06' };
  for (const [k, v] of Object.entries(cases)) assert.equal(readMonth(k), v, k);
  for (const bad of ['2028', 'soon', '13/2027', 'Smarch 2020']) assert.equal(readMonth(bad), null, bad);
});

test('readMoney: symbols, words, k/m, commas', () => {
  assert.deepEqual(readMoney('£50,000 a year').value, { amount: 50000, currency: 'GBP' });
  assert.deepEqual(readMoney('A$15,200').value, { amount: 15200, currency: 'AUD' });
  assert.deepEqual(readMoney('15200 aud').value, { amount: 15200, currency: 'AUD' });
  assert.deepEqual(readMoney('about 45k').value, { amount: 45000, currency: 'GBP' });
  assert.deepEqual(readMoney('1.2m pounds').value, { amount: 1200000, currency: 'GBP' });
  assert.deepEqual(readMoney('20 grand', 'AUD').value, { amount: 20000, currency: 'AUD' });
  const d = readMoney('$4,000');
  assert.deepEqual(d.value, { amount: 4000, currency: 'AUD' });
  assert.match(d.note, /Aussie dollars/);
  assert.equal(readMoney('loads'), null);
});

test('readChoice: exact, prefix, contains, aliases, ambiguity', () => {
  const o = BY_ID.q11.opts;
  assert.deepEqual(readChoice('offer accepted', o), { value: 'Offer accepted' });
  assert.deepEqual(readChoice('Offer accepted!!', o), { value: 'Offer accepted' });
  assert.deepEqual(readChoice('not doing', o), { value: 'Not doing it' });
  assert.deepEqual(readChoice('gbp', BY_ID.q7.opts), { value: 'GBP' });
  assert.deepEqual(readChoice('£ pounds', BY_ID.q7.opts), { value: 'GBP' });
  assert.deepEqual(readChoice('y', BY_ID.q100.opts), { value: 'Yes' });
  assert.match(readChoice('offer', o).error, /Could be/);
  assert.match(readChoice('banana', o).error, /Didn’t match/);
});

test('parse: messy real-world paste', () => {
  const text = [
    'Forge intake — my answers',               // header line, ignored with a note
    '1. March 1997',
    'Q4: about 55',
    '7) pounds',
    '11 - offer accepted',
    'Q12 Sept 27',
    '63. What income do you want in retirement? £50k a year',
    '49. ISA: 14,000; super: A$15,200',
    '74. 2, 33, 2',
    '79: definite',
    '133. monthly check-in and when I fall behind',
    '6. Golf on Tuesdays,',
    '   flying on weekends.',                 // continuation
    '9. dk',
    '16. not sure',                            // a real option, not "don't know"
    '200. something',
    '4. 56',                                   // duplicate: last wins
  ].join('\n');
  const r = parsePastedAnswers(text);
  const e = byId(r);
  assert.equal(e.q1.value, '1997-03');
  assert.equal(e.q4.value, 56);
  assert.equal(e.q7.value, 'GBP');
  assert.equal(e.q11.value, 'Offer accepted');
  assert.equal(e.q12.value, '2027-09');
  assert.deepEqual(e.q63.value, { amount: 50000, currency: 'GBP' });
  assert.deepEqual(e.q49.value, { isa: { amount: 14000, currency: 'GBP' }, super: { amount: 15200, currency: 'AUD' } });
  assert.deepEqual(e.q74.value, { count: 2, ageFirst: 33, gap: 2 });
  assert.match(e.q74.note, /in order/);
  assert.equal(e.q79.value, 'Definite');
  assert.deepEqual(e.q133.value, ['Monthly check-in', 'When I fall behind']);
  assert.equal(e.q6.value, 'Golf on Tuesdays,\nflying on weekends.');
  assert.equal(e.q9.unknown, true);
  assert.equal(e.q16.value, 'Not sure');
  const msgs = r.problems.map((p) => p.message);
  assert.ok(msgs.some((m) => /Line 1 doesn’t start with a question number/.test(m)));
  assert.ok(msgs.includes('There’s no question 200.'));
  assert.ok(msgs.includes('Question 4 appears more than once — the last one is used.'));
  assert.deepEqual(r.entries.map((x) => x.n), [...r.entries.map((x) => x.n)].sort((a, b) => a - b));
});

test('parse: base currency for bare amounts comes from q7 in the paste', () => {
  const r = parsePastedAnswers('7. AUD\n63. 80000');
  assert.deepEqual(byId(r).q63.value, { amount: 80000, currency: 'AUD' });
  assert.deepEqual(byId(parsePastedAnswers('63. 80000', { base: 'AUD' })).q63.value, { amount: 80000, currency: 'AUD' });
});

test('parse: unreadable answers carry a reason and are never turned into values', () => {
  const r = parsePastedAnswers('1. a while ago\n4. 200\n11. offer\n74. 2 kids early\n98. by: soon');
  const e = byId(r);
  assert.match(e.q1.error, /month and year/);
  assert.match(e.q4.error, /80 or less/);       // validator still applies
  assert.match(e.q11.error, /Could be/);
  assert.match(e.q74.error, /Label each part/);
  assert.match(e.q98.error, /By when: couldn’t read/);
  assert.deepEqual(entriesToAnswers(r.entries), {});
});

test('entriesToAnswers keeps readable values and don’t-knows only', () => {
  const r = parsePastedAnswers('1. March 1997\n9. ?\n11. banana');
  assert.deepEqual(entriesToAnswers(r.entries), { q1: { v: '1997-03' }, q9: { unknown: true } });
});

test('parse: empty and junk input', () => {
  assert.deepEqual(parsePastedAnswers('').entries, []);
  assert.deepEqual(parsePastedAnswers(null).entries, []);
  const j = parsePastedAnswers('hello\nworld');
  assert.equal(j.entries.length, 0);
  assert.equal(j.problems.length, 2);
});

test('readAnswer: labelled fields with £/A$ defaults per field', () => {
  const r = readAnswer(BY_ID.q113, 'where: Morocco; when: March 2028; cost: 4k');
  assert.deepEqual(r.value, { where: 'Morocco', when: '2028-03', cost: { amount: 4000, currency: 'GBP' } });
  const s = readAnswer(BY_ID.q49, 'super: 15200');
  assert.deepEqual(s.value, { super: { amount: 15200, currency: 'AUD' } }); // field's own currency
  assert.match(readAnswer(BY_ID.q113, 'colour: red').error, /Didn’t recognise “colour”/);
});
