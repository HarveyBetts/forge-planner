// T6.1: the built site installs its service worker and opens with no network at all.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { prepare } from './helpers.js';

test('built site works offline once the service worker is installed', async ({ page, context }) => {
  execFileSync('bash', ['scripts/build-site.sh', 'artifacts/pwa-site'], { stdio: 'pipe' });
  const errors = await prepare(page);
  await page.goto('/artifacts/pwa-site/');
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  // The app only self-registers over https (GitHub Pages); localhost is a secure context, so register by hand here.
  await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('forge-shell-')).length);
  expect(cached).toBe(1);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  await expect(page.locator('img.brand-ic')).toBeVisible();
  // A deep link offline still opens the app shell.
  await page.goto('/artifacts/pwa-site/#settings');
  await expect(page.locator('#app')).not.toBeEmpty();
  await context.setOffline(false);
  expect(errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});
