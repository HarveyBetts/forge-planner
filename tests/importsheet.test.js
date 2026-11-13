import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { readXlsx, readZipDirectory, colToIndex, indexToCol, xmlDecode } from '../src/budget/xlsx.js';
import { workbookToBudget } from '../src/budget/importsheet.js';
import { forecastBy, weekRow } from '../src/budget/ledger.js';
import { holdings } from '../src/budget/investments.js';
import { sampleBudgetWorkbook, workbook } from './fixtures/xlsx-fixture.js';

const inflateRaw = async (d) => inflateRawSync(d);
const read = (buf) => readXlsx(buf, { inflateRaw });

test('xlsx: columns, entities, zip directory', () => {
  assert.equal(colToIndex('A'), 1); assert.equal(colToIndex('Z'), 26); assert.equal(colToIndex('AA'), 27);
  assert.equal(indexToCol(28), 'AB');
  assert.equal(xmlDecode('a &amp; b &lt;c&gt; &#163;&#x24;'), 'a & b <c> £$');
  const files = readZipDirectory(new Uint8Array(sampleBudgetWorkbook()));
  assert.ok(files.has('xl/workbook.xml') && files.has('xl/worksheets/sheet2.xml'));
});

test('xlsx: reads shared, inline and formula-cached strings plus numbers', async () => {
  const wb = await read(sampleBudgetWorkbook());
  assert.deepEqual(wb.sheets.map((s) => s.name), ['BUDGET', 'INVESTMENTS']);
  const B = wb.sheets[0].cells, I = wb.sheets[1].cells;
  assert.equal(B.B2, 'Current'); assert.equal(B.B3, 5000);       // shared string + number
  assert.equal(B.U3, '14th');                                     // inline string
  assert.equal(I.J3, 'Vanguard FTSE All-World');                  // formula's cached string
  assert.equal(I.C3, '10⁠.⁠5');
});

test('xlsx: not a zip / not a workbook → readable errors', async () => {
  await assert.rejects(() => read(new Uint8Array([1, 2, 3])), /isn’t a valid \.xlsx/);
  const { zip } = await import('./fixtures/xlsx-fixture.js');
  await assert.rejects(() => read(zip({ 'hello.txt': 'hi' })), /isn’t an Excel workbook/);
});

test('import: budget sheet → weeks, categories, signs, bills, cash, bonds, pay lag', async () => {
  const { budget, report } = workbookToBudget(await read(sampleBudgetWorkbook()), { today: '2026-11-13' });
  assert.equal(budget.currency, 'AUD');
  assert.deepEqual(budget.categories.map((c) => [c.id, c.name, c.kind]), [
    ['income', 'Income', 'income'], ['rent', 'Rent', 'expense'], ['food', 'Food', 'expense'], ['gym', 'Gym', 'expense'], ['refunds', 'Refunds', 'expense']]);
  assert.deepEqual(Object.keys(budget.entries).sort(), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21']);
  assert.deepEqual(budget.entries['2026-11-23'], { income: 1030, rent: -450, food: -123, refunds: 35 });
  assert.equal(weekRow(budget, '2026-11-02').total, 1000 - 450 - 120 - 20);
  assert.equal(budget.openingCash, 5000);
  assert.equal(budget.openingAt, '2026-11-02');
  assert.equal(budget.payLagWeeks, 2);
  assert.deepEqual(budget.extras, [{ id: 'premium-bonds', name: 'Premium Bonds', currency: 'GBP', amount: 2000 }]);
  assert.deepEqual(budget.bills, [{ id: 'phone', name: 'Phone', day: 14 }, { id: 'loan', name: 'Loan', day: 6 }, { id: 'electricity', name: 'Electricity', day: 4, month: 5 }]);
  assert.ok(report.lines.some((l) => /8 weeks \(2026-11-02 to 2026-12-21\), 5 categories/.test(l)));
  assert.deepEqual(report.warnings, []);
  // The first fortnight: opening + non-income of weeks 1–2 (pay lands later)
  assert.equal(forecastBy(budget)[0].balance, 5000 + (-450 - 120 - 20) + (-450 - 121));
});

test('import: investments sheet → lots and saved prices (word-joiners, £/$ prices, plain numbers)', async () => {
  const { budget, report } = workbookToBudget(await read(sampleBudgetWorkbook()), { today: '2026-11-13' });
  assert.deepEqual(budget.holdings.lots, [
    { ticker: 'VWRL', shares: 10.5, price: 90, currency: 'GBP', costGBP: 945 },
    { ticker: 'AAPL', shares: 2, price: 150, currency: 'USD', costGBP: 240 },
    { ticker: 'VWRL', shares: 5, price: 95, currency: 'GBP', costGBP: 475 },
  ]);
  assert.deepEqual(budget.holdings.prices.VWRL, { price: 100, currency: 'GBP', name: 'Vanguard FTSE All-World', at: '2026-11-13', source: 'spreadsheet' });
  const h = holdings(budget.holdings.lots, budget.holdings.prices, (a, c) => (c === 'USD' ? a * 0.8 : NaN));
  assert.equal(h.list.find((x) => x.ticker === 'VWRL').value, 1550);
  assert.equal(h.totals.value, 1550 + 320);
  assert.ok(report.lines.includes('3 purchases across 2 holdings.'));
});

test('import: headings found anywhere; missing pieces become warnings, not crashes', async () => {
  const wb = await read(workbook([{ name: 'Sheet1', cells: { D20: 'date', E20: 'Income', F20: 'Rent', G20: 'Total', D21: '05/01 - 11/01', E21: 500, F21: -200 } }]));
  const { budget, report } = workbookToBudget(wb, { today: '2026-11-13', base: 'GBP' });
  assert.equal(budget.openingAt, '2026-01-05');   // the year in which 5 Jan is a Monday (weeks start on Mondays)
  assert.equal(budget.currency, 'GBP');
  assert.equal(budget.payLagWeeks, 0);
  assert.ok(report.warnings.some((w) => /No “Current” balance/.test(w)));
  await assert.rejects(async () => workbookToBudget(await read(workbook([{ name: 'X', cells: { A1: 'hello' } }])), { today: '2026-11-13' }), /Couldn’t find a budget/);
});
