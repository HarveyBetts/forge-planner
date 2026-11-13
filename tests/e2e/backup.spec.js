// T2.8: back up everything → delete all → restore → everything is back (answers, events, budget, assumptions).
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { prepare, fresh, seedAnswers, ART } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(50000) }, q50: { now: gbp(800) } });

test('back up everything → delete all my data → restore brings it all back', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/bk-budget.xlsx', sampleBudgetWorkbook());
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#budget');
  await page.reload();
  // a budget …
  await page.locator('[data-act="bud-import"]').setInputFiles('test-results/bk-budget.xlsx');
  await page.getByRole('button', { name: 'Save to my budget' }).click();
  // … a life event …
  await page.locator('#tabbar').getByRole('link', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'Add a life event' }).click();
  await page.getByRole('button', { name: /^A trip/ }).click();
  await page.locator('[name="name"]').fill('Vietnam');
  await page.locator('[name="at"]').fill('2029-04');
  await page.locator('[name="cost"]').fill('3000');
  await page.getByRole('button', { name: 'Add to my plan' }).click();
  // … and an assumption override.
  await page.locator('#tabbar').getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^Inflation/ }).click();
  await page.locator('#ns').fill('3');
  await page.locator('[data-ns="save"]').click();
  await expect(page.getByRole('button', { name: /^Inflation/ })).toContainText('3% a year');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Back up everything/ }).click()]);
  expect(dl.suggestedFilename()).toBe('forge-backup-2026-11-13.json');
  const file = 'test-results/forge-backup.json';
  await dl.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup.kind).toBe('full-backup');
  expect(backup.budget.categories.length).toBe(5);
  expect(backup.settings.events[0].params.name).toBe('Vietnam');
  expect(backup.onboarding.answers.q4.v).toBe(55);

  // Delete everything (two taps) → back to the welcome screen with storage empty.
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  await page.getByRole('button', { name: /Tap again/ }).click();
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('forge.') && k !== 'forge.fx.v1'))).toEqual([]);

  // Restore from the welcome screen's restore link (accepts full backups too).
  await page.locator('[data-act="import"]').first().setInputFiles(file);
  const sheet = page.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toContainText('replaces everything');
  await expect(sheet).toContainText('1 life event you added');
  await sheet.getByRole('button', { name: 'Restore' }).click();
  await page.waitForLoadState('load');
  await page.goto('/#settings');
  await expect(page.getByRole('button', { name: /^Inflation/ })).toContainText('3% a year');
  await page.locator('#tabbar').getByRole('link', { name: 'Timeline' }).click();
  await expect(page.locator('.ev-edit')).toContainText('Vietnam');
  await page.locator('#tabbar').getByRole('link', { name: 'Budget' }).click();
  await expect(page.locator('.wk-list li')).toHaveCount(5);
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await expect(page.locator('details.disc')).toContainText(''); // plan renders
  await page.locator('details.disc summary').click();
  await expect(page.locator('details.disc')).toContainText('Inflation: 3% a year');
  expect(errors).toEqual([]);
});

test('a non-backup file is refused with a readable message', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#settings');
  await page.reload();
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/junk.json', '{"hello":1}');
  await page.locator('[data-act="import"]').setInputFiles('test-results/junk.json');
  await expect(page.locator('.banner.warn')).toContainText('isn’t a Forge answers backup');
});
