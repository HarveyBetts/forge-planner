// T2.6: life-event editor sheet — add / edit / delete updates the projection live.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(120000) }, q50: { now: gbp(1500) } });

test('add, preview, edit and delete a life event; the plan updates without a reload', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#plan');
  await page.reload();
  const coastBefore = await page.locator('.kpi').nth(1).locator('.big').textContent();

  await page.locator('#tabbar').getByRole('link', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'Add a life event' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a life event' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.sh-card')).toHaveCount(7); // 6 templates + Speedbird pointer
  await page.screenshot({ path: `${ART}/events-picker.png` });
  await sheet.getByRole('button', { name: /^A trip/ }).click();
  await expect(sheet.getByRole('heading', { name: 'A trip' })).toBeVisible();

  // Saving an empty form shows the engine's readable problem, nothing saved.
  await sheet.getByRole('button', { name: 'Add to my plan' }).click();
  await expect(sheet.locator('.sh-err')).toHaveText('Trip month must be YYYY-MM.');

  await sheet.locator('[name="name"]').fill('Wedding');
  await sheet.locator('[name="at"]').fill('2030-08');
  await sheet.locator('[name="cost"]').fill('£60,000');
  await expect(sheet.locator('[data-ev-preview]')).toContainText('What this does to your plan');
  await expect(sheet.locator('[data-ev-preview]')).toContainText(/Pot at 55 \(middle case\)|Coast date/);
  await page.screenshot({ path: `${ART}/events-form.png` });
  await sheet.getByRole('button', { name: 'Add to my plan' }).click();
  await expect(page.locator('.sheet-wrap')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Added');
  await expect(page.locator('.ev-edit')).toContainText('Wedding');
  await expect(page.locator('.tl-l', { hasText: 'Wedding' })).toBeVisible();

  // Plan shows it, and the coast date moved later.
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  const row = page.locator('.ev-user', { hasText: 'Wedding' });
  await expect(row).toBeVisible();
  const coastAfter = await page.locator('.kpi').nth(1).locator('.big').textContent();
  expect(coastAfter).not.toBe(coastBefore);

  // Survives a reload.
  await page.reload();
  await expect(page.locator('.ev-user', { hasText: 'Wedding' })).toBeVisible();

  // Edit from the plan: change the cost.
  await page.locator('.ev-user', { hasText: 'Wedding' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit life event' });
  await expect(edit.locator('[name="cost"]')).toHaveValue('60000');
  await edit.locator('[name="cost"]').fill('20000');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.toast')).toContainText('Saved');
  await expect(page.locator('.ev-user', { hasText: 'Wedding' })).toContainText('−£20k');

  // Delete needs a second tap.
  await page.locator('.ev-user', { hasText: 'Wedding' }).click();
  const del = page.getByRole('dialog', { name: 'Edit life event' }).locator('[data-ev="delete"]');
  await del.click();
  await expect(del).toHaveText('Tap to confirm');
  await del.click();
  await expect(page.locator('.toast')).toContainText('Deleted');
  await expect(page.locator('.ev-user', { hasText: 'Wedding' })).toHaveCount(0);
  expect(await page.locator('.kpi').nth(1).locator('.big').textContent()).toBe(coastBefore);
  await expectNoOverflow(page, 'plan after events');
  expect(errors).toEqual([]);
});

test('sheet closes with Escape and the Speedbird card opens the course-start question', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#timeline');
  await page.reload();
  await page.getByRole('button', { name: 'Add a life event' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet-wrap')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a life event' }).click();
  await page.getByRole('button', { name: /Speedbird pathway/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('When does your course start?');
  await page.click('[data-act="exit"]');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Timeline');
});
