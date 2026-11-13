// T3.6 + T3.7: import a workbook in Harvey's layout (made-up numbers), preview → save, then use the Budget tab.
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { super: { amount: 10000, currency: 'AUD' } }, q50: { now: gbp(500) } });
const FILE = 'test-results/sample-budget.xlsx';

test('import spreadsheet → check → save → week edit, forecast, bills, investments, use in plan', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(FILE, sampleBudgetWorkbook());
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#budget');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bring in your budget' })).toBeVisible();

  await page.locator('[data-act="bud-import"]').setInputFiles(FILE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your import');
  await expect(page.locator('.stats')).toContainText('8weeks');
  await expect(page.locator('.stats')).toContainText('5categories');
  await expect(page.locator('.stats')).toContainText('2holdings');
  await expect(page.getByText('Pay lands 2 weeks after it’s earned')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('forge.budget.v1'))).toBeNull(); // nothing saved yet
  await page.screenshot({ path: `${ART}/budget-import-check.png`, fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Bring in your budget' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('forge.budget.v1'))).toBeNull();

  await page.locator('[data-act="bud-import"]').setInputFiles(FILE);
  await page.getByRole('button', { name: 'Save to my budget' }).click();
  await expect(page.locator('.toast')).toContainText('Budget imported');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('forge.budget.v1')).categories.length)).toBe(5);

  // Net worth (GBP base): cash A$3,839 (pay not landed yet) at e2e rates A$1.5/£0.8 → £2,047; bonds £2,000; investments £1,550 + US$400 → £320.
  await expect(page.locator('[data-bud-nw] .big')).toHaveText('£5,917');
  await expect(page.locator('.wk-l')).toHaveText('9 Nov – 15 Nov · this week');
  await expect(page.locator('#be-food')).toHaveValue('121');
  await expect(page.locator('#be-income')).toHaveValue('1010');

  // Edit: spent 200 on food this week → totals and forecast update in place, focus not lost to a redraw.
  const firstBalance = await page.locator('.fc .fc-b').first().textContent();
  await page.locator('#be-food').fill('200');
  await page.locator('#be-food').press('Enter');
  await expect(page.locator('[data-bud-sum]')).toContainText('Out A$650');
  await expect(page.locator('.fc .fc-b').first()).not.toHaveText(firstBalance);
  // A refund with + into a spending category
  await page.locator('#be-gym').fill('+15');
  await page.locator('#be-gym').press('Enter');
  await expect(page.locator('#be-gym')).toHaveValue('+15');
  await page.reload();
  await expect(page.locator('#be-food')).toHaveValue('200');           // persisted

  // Week navigation
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('.wk-l')).toHaveText('2 Nov – 8 Nov');
  // Bills
  await expect(page.locator('.bills li').first()).toContainText('Phone');
  await expect(page.locator('.bills li').first()).toContainText('tomorrow');
  await expectNoOverflow(page, 'budget');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${ART}/budget-money.png`, fullPage: true });

  // Investments: holdings, then update a price.
  await page.getByRole('tab', { name: 'Investments' }).click();
  await expect(page.locator('.inv-tot .big')).toHaveText('£1,870');
  await page.locator('[data-act="bud-price"][data-val="VWRL"]').click();
  await page.locator('#pp').fill('110');
  await page.getByRole('button', { name: 'Save price' }).click();
  await expect(page.locator('.toast')).toContainText('VWRL price saved');
  await expect(page.locator('.inv-tot .big')).toHaveText('£2,025');
  await page.waitForTimeout(450); // let the sheet finish closing
  await page.screenshot({ path: `${ART}/budget-investments.png`, fullPage: true });

  // Use as current balances → q49 in the plan (super left alone).
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('button', { name: 'Use these as my current balances' }).click();
  const sheet = page.getByRole('dialog', { name: 'Use as current balances' });
  await expect(sheet).toContainText('Stocks ISA (your investments): £2,025');
  await expect(sheet).toContainText('Australian super (unchanged)');
  await sheet.getByRole('button', { name: 'Update my plan' }).click();
  await expect(page.locator('.toast')).toContainText('Plan updated');
  const q49 = await page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')).answers.q49.v);
  expect(q49.isa).toEqual({ amount: 2025, currency: 'GBP' });
  expect(q49.cashGBP).toEqual({ amount: 2000, currency: 'GBP' });
  expect(q49.super).toEqual({ amount: 10000, currency: 'AUD' });
  expect(q49.cashAUD.currency).toBe('AUD');
  expect(errors).toEqual([]);
});

test('start from scratch, and a non-spreadsheet file gives a readable error', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#budget');
  await page.reload();
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/not-a-sheet.xlsx', 'hello');
  await page.locator('[data-act="bud-import"]').setInputFiles('test-results/not-a-sheet.xlsx');
  await expect(page.locator('[data-err]')).toContainText('isn’t a valid .xlsx');
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  await expect(page.locator('.wk-list li')).toHaveCount(7);
  await page.getByRole('button', { name: 'Remove budget from this phone' }).click();
  await page.getByRole('button', { name: /Tap again/ }).click();
  await expect(page.getByRole('heading', { name: 'Bring in your budget' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('forge.budget.v1'))).toBeNull();
});
