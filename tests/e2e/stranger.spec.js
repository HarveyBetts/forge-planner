// T2.9: the "stranger test" — usable from a completely empty browser, with the bare minimum of answers, and even
// with storage blocked (Safari private mode style). No crash cards, no console errors, every tab renders.
import { test, expect } from '@playwright/test';
import { prepare, fresh, expectNoOverflow, walkQuickStart, ART } from './helpers.js';

const MINIMAL = { q1: { month: '1995-06' }, q4: { num: '60' }, q63: { money: '30000' } };

async function visitAllTabs(page, label) {
  for (const [tab, heading] of [['Plan', 'Your plan'], ['Timeline', 'Timeline'], ['Budget', 'Budget'], ['Scenarios', 'Scenarios'], ['Settings', 'Settings']]) {
    await page.locator('#tabbar').getByRole('link', { name: tab }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('[data-crash]')).toHaveCount(0);
    await expectNoOverflow(page, `${label} ${tab}`);
  }
}

test('empty browser → quick start with only the 3 required answers → every tab works', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await walkQuickStart(page, MINIMAL);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plan');
  await expect(page.locator('.chip')).toBeVisible();
  await expect(page.locator('details.disc')).toBeVisible();
  await page.screenshot({ path: `${ART}/stranger-minimal-plan.png`, fullPage: true });
  await visitAllTabs(page, 'minimal');
  // Budget empty state offers both routes; adding a life event works with nothing else set up.
  await page.locator('#tabbar').getByRole('link', { name: 'Budget' }).click();
  await expect(page.getByRole('button', { name: 'Start from scratch' })).toBeVisible();
  await page.locator('#tabbar').getByRole('link', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'Add a life event' }).click();
  await page.getByRole('button', { name: /^A trip/ }).click();
  await page.locator('[name="name"]').fill('Trip');
  await page.locator('[name="at"]').fill('2030-01');
  await page.locator('[name="cost"]').fill('1000');
  await page.getByRole('button', { name: 'Add to my plan' }).click();
  await expect(page.locator('.ev-edit')).toContainText('Trip');
  expect(errors).toEqual([]);
});

test('storage blocked entirely: the app still boots, warns, and works in memory', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  });
  const errors = await prepare(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  await expect(page.locator('.banner')).toContainText('isn’t saving');
  await walkQuickStart(page, MINIMAL);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plan');
  await visitAllTabs(page, 'no-storage');
  await page.locator('#tabbar').getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText(/this browser isn’t saving it, so back up now/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a screen that throws shows the safety-net card, not a blank page', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  // Corrupt-but-parseable answers: a birth month the engine rejects.
  await page.evaluate(() => localStorage.setItem('forge.onboarding.v1', JSON.stringify({ v: 1, mode: 'quick', completedAt: 'x',
    answers: { q1: { v: '1995-13' }, q4: { v: 60 }, q63: { v: { amount: 30000, currency: 'GBP' } } } })));
  await page.goto('/#plan');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something went wrong');
  await expect(page.locator('[data-crash]')).toContainText('safe on this phone');
  await page.screenshot({ path: `${ART}/stranger-safety-net.png` });
  await page.getByRole('link', { name: 'Go to your answers' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your answers');
  expect(errors).toEqual([]);
});
