import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, parseDate, parseAmount, detectColumns, toTransactions, merchantKey, applyTransactions } from '../src/budget/csv.js';
import { emptyBudget, weekRow } from '../src/budget/ledger.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('csv: quotes, commas inside quotes, CRLF, BOM, blank lines', () => {
  assert.deepEqual(parseCSV('﻿a,"b, c","d ""q"""\r\n\r\n1,2,3\n'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
});

test('dates and amounts in the forms banks use', () => {
  assert.equal(parseDate('01/12/2026'), '2026-12-01');
  assert.equal(parseDate('2026-12-01'), '2026-12-01');
  assert.equal(parseDate('1 Dec 2026'), '2026-12-01');
  assert.equal(parseDate('12/25/2026', false), '2026-12-25');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('soon'), null);
  for (const [v, n] of [['-45.20', -45.2], ['+1,250.00', 1250], ['(12.30)', -12.3], ['$-5', -5], ['A$ −7.10', -7.1], ['12.30 DR', -12.3], ['12.30 CR', 12.3], ['£2,100.00', 2100]]) assert.equal(parseAmount(v), n, v);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
});

test('CommBank-style (no header): columns inferred; malformed rows reported, not crashed', () => {
  const rows = parseCSV(fx('commbank-sample.csv'));
  const cols = detectColumns(rows);
  assert.deepEqual([cols.header, cols.dateCol, cols.amountCol, cols.descCol, cols.dayFirst], [false, 0, 1, 2, true]);
  const { txns, bad } = toTransactions(rows, cols);
  assert.equal(txns.length, 6);
  assert.deepEqual(bad.map((b) => b.line), [6, 7]);
  assert.match(bad[0].reason, /no readable date/);
  assert.match(bad[1].reason, /no readable amount/);
  const coffees = txns.filter((t) => /BEAN THERE/.test(t.desc));
  assert.equal(coffees.length, 2);
  assert.notEqual(coffees[0].id, coffees[1].id); // two identical coffees are both real
  assert.deepEqual(txns.find((t) => /SALARY/.test(t.desc)), { id: txns.find((t) => /SALARY/.test(t.desc)).id, date: '2026-12-03', desc: 'SALARY KARTING CO PTY LTD', amount: 1250 });
});

test('Monzo-style (header): Date / Name / Amount found by heading', () => {
  const rows = parseCSV(fx('monzo-sample.csv'));
  const cols = detectColumns(rows);
  assert.equal(cols.header, true);
  assert.deepEqual([rows[0][cols.dateCol], rows[0][cols.descCol], rows[0][cols.amountCol]], ['Date', 'Name', 'Amount']);
  const { txns, bad } = toTransactions(rows, cols);
  assert.deepEqual(txns.map((t) => [t.date, t.desc, t.amount]), [['2026-12-02', 'Tesco', -23.4], ['2026-12-02', 'Pret A Manger', -6.95], ['2026-12-04', 'Employer Ltd', 2100], ['2026-12-13', 'Tesco', -31.05]]);
  assert.equal(bad.length, 1);
});

test('money in / money out columns (no Amount column)', () => {
  const rows = parseCSV('Date,Description,Money In,Money Out\n02/12/2026,Pay,1000.00,\n03/12/2026,Shop,,25.50\n');
  const cols = detectColumns(rows);
  assert.deepEqual(toTransactions(rows, cols).txns.map((t) => t.amount), [1000, -25.5]);
});

test('unusable files give readable errors', () => {
  assert.throws(() => detectColumns([]), /empty/);
  assert.throws(() => detectColumns(parseCSV('Date,Foo\n01/01/2027,1')), /description column/);
  assert.throws(() => detectColumns(parseCSV('hello,world\nfoo,bar')), /date column/);
});

test('merchant keys group noisy descriptions', () => {
  assert.equal(merchantKey('CARD PURCHASE WOOLWORTHS 1234 SYDNEY AU'), 'woolworths sydney');
  assert.equal(merchantKey('Tesco'), 'tesco');
  assert.equal(merchantKey('TRANSFER TO RENT ACCOUNT'), 'rent account');
});

test('apply: transactions land in their week’s category; re-importing never double-counts', () => {
  const rows = parseCSV(fx('commbank-sample.csv'));
  const { txns } = toTransactions(rows, detectColumns(rows));
  const b0 = { ...emptyBudget('AUD'), categories: [{ id: 'income', name: 'Income', kind: 'income' }, { id: 'food', name: 'Food', kind: 'expense' }, { id: 'rent', name: 'Rent', kind: 'expense' }] };
  const rules = { 'woolworths sydney': 'food', 'bean there': 'food', 'salary karting': 'income', 'rent account': 'rent' };
  const catFor = (t) => rules[merchantKey(t.desc)] || null;
  const r1 = applyTransactions(b0, txns, catFor);
  assert.equal(r1.added, 6);
  assert.deepEqual(r1.budget.entries['2026-11-30'], { food: -54.2, income: 1250, rent: -650 }); // Mon 30 Nov week
  assert.deepEqual(r1.budget.entries['2026-12-07'], { food: -62.1 });
  assert.equal(weekRow(r1.budget, '2026-11-30').total, 1250 - 54.2 - 650);
  const r2 = applyTransactions(r1.budget, txns, catFor);
  assert.deepEqual([r2.added, r2.skipped], [0, 6]);
  assert.deepEqual(r2.budget.entries, r1.budget.entries);
  // uncategorised transactions are left out (and not marked imported, so they can be added later)
  const r3 = applyTransactions(b0, txns, () => null);
  assert.deepEqual([r3.added, r3.budget.imported.length], [0, 0]);
});
