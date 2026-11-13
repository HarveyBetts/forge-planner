// T3.3: bank CSV import — CommBank (no header) and Monzo (header) samples with made-up data.
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(20000) }, q50: { now: gbp(500) } });

test('import a bank CSV: sort merchants once, amounts land in the right weeks, no double counting', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/csv-budget.xlsx', sampleBudgetWorkbook());
  await page.clock.setFixedTime(new Date('2026-12-10T10:00:00'));
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#budget');
  await page.reload();
  await page.locator('[data-act="bud-import"]').setInputFiles('test-results/csv-budget.xlsx');
  await page.getByRole('button', { name: 'Save to my budget' }).click();

  await page.locator('[data-act="bud-csv"]').setInputFiles('tests/fixtures/commbank-sample.csv');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sort your transactions');
  await expect(page.locator('.stats')).toContainText('6new');
  await expect(page.locator('.stats')).toContainText('2unreadable');
  await expect(page.locator('#csv-cur')).toHaveValue('AUD');
  const sel = (label) => page.getByRole('combobox', { name: `Category for ${label}` });
  await expect(sel('Salary Karting')).toHaveValue('income');   // money in → Income guessed
  await sel('Woolworths Sydney').selectOption('food');
  await sel('Bean There').selectOption('food');
  await sel('Rent Account').selectOption('rent');
  await expectNoOverflow(page, 'csv preview');
  await page.screenshot({ path: `${ART}/csv-sort.png`, fullPage: true });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('forge.budget.v1')).imported)).toBeUndefined(); // nothing yet
  await page.getByRole('button', { name: 'Add to my budget' }).click();
  await expect(page.locator('.toast')).toContainText('Added 6 transactions');

  // Week of Mon 7 Dec: sample food A$125 + Woolworths A$62.10
  await expect(page.locator('.wk-l')).toHaveText('7 Dec – 13 Dec · this week');
  await expect(page.locator('#be-food')).toHaveValue('187.1');
  await page.getByRole('button', { name: 'Previous week' }).click();          // week of 30 Nov
  await expect(page.locator('#be-food')).toHaveValue('178.2');                 // 124 + 45.20 + 4.50 + 4.50
  await expect(page.locator('#be-rent')).toHaveValue('1100');                  // 450 + 650
  await expect(page.locator('#be-income')).toHaveValue('2290');                // 1040 + 1250

  // Same file again → nothing new, remembered categories.
  await page.locator('[data-act="bud-csv"]').setInputFiles('tests/fixtures/commbank-sample.csv');
  await expect(page.locator('.stats')).toContainText('0new');
  await expect(page.locator('.stats')).toContainText('6already in');
  await expect(page.getByText('Everything in this file is already in your budget.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // A £ Monzo export into the A$ budget: converted at the e2e rate (A$1.5 / £0.8 per US$ → ×1.875).
  await page.locator('[data-act="bud-csv"]').setInputFiles('tests/fixtures/monzo-sample.csv');
  await expect(page.locator('.stats')).toContainText('4new');
  await page.locator('#csv-cur').selectOption('GBP');
  await expect(page.getByText('Converted to AUD at today’s mid-market rate.')).toBeVisible();
  await sel('Tesco').selectOption('food');
  await page.getByRole('button', { name: 'Add to my budget' }).click();
  await expect(page.locator('.toast')).toContainText('Added 3 transactions'); // Tesco ×2 + salary (Pret skipped)
  expect(errors).toEqual([]);
});

test('a file that isn’t a bank CSV gives a readable message', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.evaluate(() => localStorage.setItem('forge.budget.v1', JSON.stringify({ v: 1, currency: 'AUD', categories: [{ id: 'food', name: 'Food', kind: 'expense' }], entries: {}, openingCash: 0, payLagWeeks: 0, bills: [], holdings: { lots: [], prices: {} }, extras: [] })));
  await page.goto('/#budget');
  await page.reload();
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/junk.csv', 'hello,world\nfoo,bar\n');
  await page.locator('[data-act="bud-csv"]').setInputFiles('test-results/junk.csv');
  await expect(page.locator('[data-err]')).toContainText('Couldn’t find a date column');
});
