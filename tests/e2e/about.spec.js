// T6.4: privacy and not-advice pages, reachable from Settings and the Plan footer.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedFinished, expectNoOverflow, ART } from './helpers.js';

test('privacy + not-advice pages: content, back navigation, footer link, export from privacy', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await seedFinished(page);
  await page.goto('/#settings');
  await page.reload();
  await page.getByRole('link', { name: /Privacy — what’s stored and where/ }).click();
  await expect(page).toHaveURL(/#privacy$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  await expect(page.locator('#tabbar .tb.on')).toHaveText('Settings');
  for (const t of ['stays on this phone', 'never asks for bank logins', 'open.er-api.com', 'Google Fonts', 'Delete all my data']) await expect(page.locator('.doc')).toContainText(t);
  await expectNoOverflow(page, 'privacy');
  await page.screenshot({ path: `${ART}/privacy.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.doc').getByRole('button', { name: 'Back up everything' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^forge-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await page.getByRole('link', { name: 'Back to Settings' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  // Plan footer → advice page
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await page.getByRole('link', { name: 'Estimates, not financial advice.' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not financial advice');
  await expect(page.locator('.doc')).toContainText('isn’t regulated financial advice');
  await expect(page.locator('.doc')).not.toContainText(/guarantee/i);
  expect(errors).toEqual([]);
});
