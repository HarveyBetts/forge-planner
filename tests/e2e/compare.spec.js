// T2.7: scenario compare — "1 child vs 2 children".
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(150000) }, q50: { now: gbp(1500) },
  q74: { count: 1, ageFirst: 33, gap: 2 }, q79: 'Definite', q81: 'Prep (4)', q82: gbp(15000) });

test('1 child vs 2 children: create a what-if, see the live preview, compare side by side', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  const errors = await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.goto('/#scenarios');
  await page.reload();
  await expect(page.locator('.scn-t').first()).toHaveText('Your plan');

  await page.getByRole('button', { name: 'New what-if' }).click();
  const sheet = page.getByRole('dialog', { name: 'New what-if' });
  await sheet.locator('[name="name"]').fill('Two children');
  await sheet.locator('[name="kids"]').fill('2');
  await expect(sheet.locator('[data-wi-preview]')).toContainText('Compared with your plan');
  await expect(sheet.locator('[data-wi-preview]')).toContainText(/Pot when you stop \(middle case\): .* → /);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.toast')).toContainText('What-if saved');
  await expect(page.locator('.scn-t')).toHaveText(['Your plan', 'Two children']);
  await expect(page.locator('.scn').nth(1)).toContainText('2 kids');

  await page.getByRole('button', { name: 'Compare with your plan' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compare');
  await expect(page.locator('.cmp-h')).toContainText('A · Your plan');
  await expect(page.locator('.cmp-h')).toContainText('B · Two children');
  const pot = page.locator('.cmp-r[data-key="pot"]');
  await expect(pot.locator('.cmp-d')).toHaveText(/^−£[\d.]+[kM]$/);         // a second child's school fees lower the pot
  await expect(pot.locator('.cmp-v').first()).toHaveClass(/win/);           // A (one child) wins on pot
  await expect(page.locator('.cmp-r[data-key="target"] .cmp-d')).toHaveText('same');
  await expect(page.locator('.cmp-r[data-key="need"] .cmp-d')).toHaveText(/^\+£/);
  await expectNoOverflow(page, 'compare');
  await page.screenshot({ path: `${ART}/compare-1-vs-2-children.png`, fullPage: true });

  // Real answers untouched; back, edit, delete.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')).answers.q74.v.count)).toBe(1);
  await page.getByRole('button', { name: 'Back to scenarios' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit what-if' });
  await expect(edit.locator('[name="kids"]')).toHaveValue('2');
  const del = edit.locator('[data-wi-act="delete"]');
  await del.click(); await del.click();
  await expect(page.locator('.scn-t')).toHaveText(['Your plan']);
  expect(errors).toEqual([]);
});
