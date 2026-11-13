// E2E walk: quick-start onboarding at iPhone size with SAMPLE answers (not Harvey's) → Plan screen.
// Replaces the old standalone tests/e2e/onboarding.walk.mjs (T2.2a). Screenshots go to artifacts/.
import { test, expect } from '@playwright/test';
import { prepare, fresh, expectNoOverflow, walkQuickStart, ART } from './helpers.js';
import { SAMPLE } from './fixtures.js';


test('quick-start onboarding → plan, resumes after reload', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await page.screenshot({ path: `${ART}/onb-1-welcome.png` });
  await walkQuickStart(page, SAMPLE, { q79: 'onb-2-choice', q82: 'onb-3-money', q74: 'onb-4-fields' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plan');
  await page.waitForTimeout(1400); // ring animation
  await expectNoOverflow(page, 'plan');
  await page.screenshot({ path: `${ART}/onb-5-plan.png`, fullPage: true });
  await expect(page.getByText(/Australian super .* stays locked until Mar 2057/)).toBeVisible();
  const levers = page.locator('section', { has: page.getByRole('heading', { name: 'Any one of these would get you there' }) });
  await expect(levers).toBeVisible();
  await expect(levers.locator('li')).toHaveCount(4);
  await expect(levers).not.toContainText(/NaN|null|undefined/);
  await levers.screenshot({ path: `${ART}/plan-levers.png` });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')));
  expect(stored.completedAt).toBeTruthy();
  expect(Object.keys(stored.answers).length).toBeGreaterThanOrEqual(30);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plan');
  await page.click('[data-act="review"]');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your answers');
  await expectNoOverflow(page, 'review');
  await page.screenshot({ path: `${ART}/onb-6-review.png` });
  expect(errors).toEqual([]);
});
