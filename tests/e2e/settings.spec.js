// T2.2c: answers drive settings — change Appearance and "When you're behind" from Settings and see the effect.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedFinished, expectNoOverflow, ART } from './helpers.js';

test('Appearance → Dark overrides a light phone; Save returns to Settings', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const errors = await prepare(page);
  await fresh(page);
  await seedFinished(page);
  await page.goto('/#settings');
  await page.reload();
  const appearance = page.getByRole('button', { name: /Appearance/ });
  await expect(appearance).toContainText('Follow my phone');
  await appearance.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Light or dark?');
  await expect(page.locator('#tabbar')).toBeHidden();
  await page.click('[data-act="pick"][data-val="Dark"]');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /Appearance/ })).toContainText('Dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 18, 32)'); // --bg dark
  await page.waitForTimeout(450);
  await expectNoOverflow(page, 'settings dark');
  await page.screenshot({ path: `${ART}/settings-dark-override.png`, fullPage: true });
  // survives reload
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('Light answer overrides a dark phone', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await prepare(page);
  await fresh(page);
  await seedFinished(page, { q136: { pick: 'Light' } });
  await page.goto('/#plan');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(243, 245, 248)');
});

test('tone: Bluntly changes the plan’s status message', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedFinished(page, { q134: { pick: 'Gently' } });
  await page.goto('/#plan');
  await page.reload();
  await expect(page.locator('.hero .sub')).toContainText('There are ways to fix that');
  await page.goto('/#settings');
  await page.getByRole('button', { name: /When you’re behind/ }).click();
  await page.click('[data-act="pick"][data-val="Bluntly"]');
  await expect(page.getByRole('button', { name: /When you’re behind/ })).toContainText('Bluntly');
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await expect(page.locator('.hero .sub')).toContainText('The plan doesn’t work as it stands');
  await page.locator('.hero').screenshot({ path: `${ART}/plan-tone-blunt.png` });
});

test('budget period follows the pay cycle when not chosen; exit (×) returns to Settings', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedFinished(page, { q27: { pick: 'Fortnightly' } });
  await page.goto('/#settings');
  await page.reload();
  await expect(page.getByRole('button', { name: /Budget period/ })).toContainText('Fortnightly (your pay cycle)');
  await page.getByRole('button', { name: /Budget period/ }).click();
  await page.click('[data-act="exit"]');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
});
