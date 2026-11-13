// T3.1: monthly check-in → snapshot → status against the glide path updates.
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prepare, fresh, seedAnswers, ART } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(20000) }, q50: { now: gbp(500) } });

test('check in with real balances: Behind → Ahead, snapshot saved, history + trend, backup nudge', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  // A check-in from last month already on the phone.
  await page.evaluate(() => localStorage.setItem('forge.snapshots.v1', JSON.stringify([{ at: '2026-10', pots: {}, total: 19000, status: 'behind', need: 200000 }])));
  await page.goto('/#plan');
  await page.reload();
  await expect(page.locator('.chip')).toHaveText('Behind');
  await expect(page.locator('.ci-l')).toHaveText('Last: Oct 2026 · Behind');
  await expect(page.locator('.ci-bk')).toContainText('You haven’t backed up yet');

  await page.getByRole('button', { name: 'Check in for Nov 2026' }).click();
  const sheet = page.getByRole('dialog', { name: 'Monthly check-in' });
  await expect(sheet.locator('[name="isa"]')).toHaveValue('20000');
  await sheet.locator('[name="isa"]').fill('£400,000');
  await sheet.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.locator('.toast')).toContainText('Checked in — Ahead');
  await expect(page.locator('.chip')).toHaveText('Ahead');
  await expect(page.locator('.ci-l')).toHaveText('Last: Nov 2026 · Ahead');
  await expect(page.locator('.ci-h li')).toHaveCount(2);
  await expect(page.locator('.ci')).toContainText(/Up £[\d.]+[kM] since Oct 2026/);
  await expect(page.getByRole('button', { name: 'Update this month' })).toBeVisible();
  const snaps = await page.evaluate(() => JSON.parse(localStorage.getItem('forge.snapshots.v1')));
  expect(snaps.map((x) => [x.at, x.status])).toEqual([['2026-10', 'behind'], ['2026-11', 'ahead']]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')).answers.q49.v.isa)).toEqual({ amount: 400000, currency: 'GBP' });
  await page.locator('.ci').screenshot({ path: `${ART}/checkin-card.png` });

  // Back up → the nudge goes away.
  await Promise.all([page.waitForEvent('download'), page.locator('.ci-bk').getByRole('button', { name: 'Back up everything' }).click()]);
  await page.locator('#tabbar').getByRole('link', { name: 'Timeline' }).click();
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await expect(page.locator('.ci-bk')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('check-in can fill cash, Premium Bonds and investments from the budget', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/ci-budget.xlsx', sampleBudgetWorkbook());
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#budget');
  await page.reload();
  await page.locator('[data-act="bud-import"]').setInputFiles('test-results/ci-budget.xlsx');
  await page.getByRole('button', { name: 'Save to my budget' }).click();
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await page.getByRole('button', { name: /Check in for/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Monthly check-in' });
  await sheet.getByRole('button', { name: /Fill cash, Premium Bonds and investments/ }).click();
  await expect(sheet.locator('[name="isa"]')).toHaveValue('1870');       // VWRL £1,550 + AAPL US$400 → £320
  await expect(sheet.locator('[name="cashGBP"]')).toHaveValue('2000');  // Premium Bonds
  await expect(sheet.locator('[name="cashAUD"]')).toHaveValue('3839');  // A$5,000 − two weeks of spending (pay lands later)
});
