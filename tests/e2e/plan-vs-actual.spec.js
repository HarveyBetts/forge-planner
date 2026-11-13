// T3.2b: weekly plans per category, overspend flags following q47, and "when you coast" in weekly money.
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prepare, fresh, seedAnswers, ART } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const base = { q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(120000) }, q50: { now: gbp(1500) } };

async function setup(page, extra = {}) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/pva-budget.xlsx', sampleBudgetWorkbook());
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, A({ ...base, ...extra }));
  await page.goto('/#budget');
  await page.reload();
  await page.locator('[data-act="bud-import"]').setInputFiles('test-results/pva-budget.xlsx');
  await page.getByRole('button', { name: 'Save to my budget' }).click();
  return errors;
}

test('set a weekly plan, see over-plan as a nudge; coasting shown as weekly spending money', async ({ page }) => {
  const errors = await setup(page);
  await page.getByRole('button', { name: 'Food — set a weekly plan' }).click();
  await page.locator('#bp').fill('100');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.locator('[data-plan="food"]')).toContainText('A$21 over');       // this week's food A$121
  await expect(page.locator('[data-plan="food"] .wk-bar.over')).toBeVisible();
  await expect(page.locator('[data-bud-over] .banner')).toHaveCount(0);              // "a nudge" = no banner
  // Under plan after editing the week down
  await page.locator('#be-food').fill('60');
  await page.locator('#be-food').press('Enter');
  await expect(page.locator('[data-plan="food"]')).toContainText('of A$100');
  // When you coast — the plan's £1,500/mo investing in A$ a week (×1.875 ×12/52 ≈ A$649)
  await expect(page.locator('.cf')).toContainText(/your planned £1,500 a month of investing becomes optional — about A\$649 a week/);
  await page.locator('.wk').screenshot({ path: `${ART}/plan-vs-actual.png` });
  expect(errors).toEqual([]);
});

test('“Loud and clear” shows a banner; “Don’t flag it” hides the warnings', async ({ page }) => {
  await setup(page, { q47: 'Loud and clear' });
  await page.getByRole('button', { name: 'Food — set a weekly plan' }).click();
  await page.locator('#bp').fill('100');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.locator('[data-bud-over] .banner')).toHaveText('Over plan this week: Food by A$21.');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('forge.onboarding.v1')); s.answers.q47 = { v: 'Don’t flag it' }; localStorage.setItem('forge.onboarding.v1', JSON.stringify(s)); });
  await page.reload();
  await expect(page.locator('[data-plan="food"]')).toHaveText('of A$100');
  await expect(page.locator('[data-plan="food"] .wk-bar')).toHaveCount(0);
});
