// Smoke: the app boots from an empty browser at iPhone size with no console errors.
import { test, expect } from '@playwright/test';
import { prepare, fresh, expectNoOverflow, ART } from './helpers.js';

test('index loads clean on an empty browser', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  await expectNoOverflow(page, 'welcome');
  await page.screenshot({ path: `${ART}/smoke-welcome.png` });
  expect(errors).toEqual([]);
});
