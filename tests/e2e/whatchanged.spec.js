// T2.2d: editing an answer shows what moved in the plan.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedFinished, ART } from './helpers.js';

test('raising retirement spend shows target + status changes on return to Your answers', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  // A healthier sample so a change is visible in several numbers.
  await seedFinished(page, { q74: { fields: { 'count.v': '0' } }, q49: { fields: { 'isa.v': '150000' } }, q50: { fields: { 'now.v': '1500', 'training.v': '500', 'fo.v': '2500' } } });
  await page.goto('/#answers');
  await page.reload();
  await page.locator('[data-act="edit"][data-val="q63"]').click();
  await page.fill('[name="v"]', '90000');
  await page.click('[data-act="next"]');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your answers');
  const card = page.locator('.card.changed');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Target pot: £1.3M → £2.3M.');
  await expect(card.getByRole('link', { name: 'See your plan' })).toHaveCSS('text-decoration-line', 'none');
  await card.screenshot({ path: `${ART}/what-changed.png` });
  // One-shot: gone after navigating away and back.
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await page.goBack();
  await expect(page.locator('.card.changed')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an edit that moves nothing says so', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedFinished(page);
  await page.goto('/#settings');
  await page.reload();
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.click('[data-act="pick"][data-val="Light"]');
  await expect(page.locator('.banner.changed')).toHaveText(/Saved question 136\. Your plan’s numbers didn’t change\./);
});
