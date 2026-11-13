// App shell: after onboarding the five tabs work, hash routes update, back works, nav hidden during onboarding.
import { test, expect } from '@playwright/test';
import { prepare, fresh, expectNoOverflow, ART } from './helpers.js';
import { SAMPLE } from './fixtures.js';

// Seed finished onboarding answers directly (the walk itself is covered by onboarding.spec.js).
async function seedFinished(page) {
  await page.evaluate((sample) => {
    const answers = {};
    for (const [id, a] of Object.entries(sample)) {
      if (a.month) answers[id] = { v: a.month };
      else if (a.num) answers[id] = { v: Number(a.num) };
      else if (a.money) answers[id] = { v: { amount: Number(a.money), currency: 'GBP' } };
      else if (a.pick) answers[id] = { v: a.pick };
      else if (a.fields) {
        const v = {};
        for (const [k, val] of Object.entries(a.fields)) {
          const key = k.replace(/\.v$/, '');
          const n = Number(val);
          v[key] = /cost|costEach|now|training|fo|isa|super/.test(key) ? { amount: n, currency: key === 'super' ? 'AUD' : 'GBP' } : (Number.isNaN(n) || /^\d{4}-\d{2}$/.test(val) ? val : n);
        }
        answers[id] = { v };
      }
    }
    localStorage.setItem('forge.onboarding.v1', JSON.stringify({ v: 1, mode: 'quick', answers, pos: null,
      startedAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', completedAt: '2026-11-13T00:00:00Z' }));
  }, SAMPLE);
}

test('no tab bar during onboarding', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await expect(page.locator('#tabbar')).toHaveCount(1);
  await expect(page.locator('#tabbar')).toBeHidden();
});

for (const scheme of ['light', 'dark']) {
  test(`tabs, routes and back button (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const errors = await prepare(page);
    await fresh(page);
    await seedFinished(page);
    await page.goto('/');
    await expect(page).toHaveURL(/#plan$/);
    const nav = page.locator('#tabbar');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.tb.on')).toHaveText('Plan');
    const tabs = [['Timeline', 'timeline', 'Timeline'], ['Budget', 'budget', 'Budget'], ['Scenarios', 'scenarios', 'Scenarios'], ['Settings', 'settings', 'Settings'], ['Plan', 'plan', 'Your plan']];
    for (const [label, route, heading] of tabs) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(nav.locator('.tb.on')).toHaveText(label);
      await page.waitForTimeout(450);
      await expectNoOverflow(page, `${route} (${scheme})`);
      await page.screenshot({ path: `${ART}/shell-${route}-${scheme}.png` });
    }
    // Settings → Your answers keeps the Settings tab lit; browser back returns.
    await nav.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /Your answers/ }).click();
    await expect(page).toHaveURL(/#answers$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your answers');
    await expect(nav.locator('.tb.on')).toHaveText('Settings');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    // Deep link + reload lands on the same tab.
    await page.goto('/#timeline');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Timeline');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Timeline');
    // Last content isn't hidden behind the tab bar.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const foot = page.locator('.foot').last();
    const fb = await foot.boundingBox(), nb = await nav.boundingBox();
    expect(fb.y + fb.height).toBeLessThanOrEqual(nb.y + 1);
    expect(errors).toEqual([]);
  });
}

test('start over from Settings returns to onboarding and hides the tab bar', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedFinished(page);
  await page.goto('/#settings');
  await page.reload(); // '/' → '/#settings' is only a hash change; reload so the seeded answers are read
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Tap again to delete all answers' }).click();
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  await expect(page.locator('#tabbar')).toBeHidden();
  expect(page.url()).not.toContain('#');
});
