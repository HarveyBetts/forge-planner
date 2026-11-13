// T2.2e: paste answers from the intake doc → preview → confirm. Nothing is saved before "Save".
import { test, expect } from '@playwright/test';
import { prepare, fresh, expectNoOverflow, ART } from './helpers.js';

const PASTE = [
  'My Forge answers',
  '1. March 1997',
  'Q4: 55',
  '7) pounds',
  '63. £50k a year',
  '11. offer',
  '49. ISA: 14,000; super: A$15,200',
].join('\n');
const stored = (page) => page.evaluate(() => localStorage.getItem('forge.onboarding.v1'));

test('paste → preview → cancel saves nothing; paste → save stores only readable answers', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Paste answers from the intake doc' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paste answers');
  // empty paste → inline error, nothing saved
  await page.getByRole('button', { name: 'Read answers' }).click();
  await expect(page.locator('[data-err]')).toContainText('No numbered answers found');
  await page.fill('[name="paste"]', PASTE);
  await page.getByRole('button', { name: 'Read answers' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your answers');
  await expect(page.locator('.stats')).toContainText('5ready');
  await expect(page.locator('.stats')).toContainText('1need you');
  await expect(page.locator('.pv-bad')).toContainText('Could be');
  await expect(page.getByRole('button', { name: 'Save 5 answers' })).toBeEnabled();
  await expectNoOverflow(page, 'paste preview');
  await page.screenshot({ path: `${ART}/paste-preview.png`, fullPage: true });
  expect(await stored(page)).toBe(before);              // still nothing saved

  // Edit keeps the text; cancel goes back with nothing saved.
  await page.getByRole('button', { name: 'Edit what I pasted' }).click();
  await expect(page.locator('[name="paste"]')).toHaveValue(PASTE);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  expect(await stored(page)).toBe(before);

  // Do it again and save.
  await page.getByRole('button', { name: 'Paste answers from the intake doc' }).click();
  await page.fill('[name="paste"]', PASTE);
  await page.getByRole('button', { name: 'Read answers' }).click();
  await page.getByRole('button', { name: 'Save 5 answers' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your answers');
  await expect(page.locator('.card.changed')).toContainText('Saved 5 answers from your paste.');
  const s = JSON.parse(await stored(page));
  expect(s.answers.q1).toEqual({ v: '1997-03' });
  expect(s.answers.q63).toEqual({ v: { amount: 50000, currency: 'GBP' } });
  expect(s.answers.q49.v.super).toEqual({ amount: 15200, currency: 'AUD' });
  expect(s.answers.q11).toBeUndefined();                // unreadable → not saved
  await expect(page.locator('[data-val="q1"] .rv-a')).toHaveText('Mar 1997');
  expect(errors).toEqual([]);
});
