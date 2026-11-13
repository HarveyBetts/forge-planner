// T6.2: automated accessibility checks (axe-core, WCAG 2.1 A/AA) on every main screen, light and dark.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prepare, fresh, seedAnswers } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Offer accepted', q12: '2027-09', q49: { isa: gbp(60000), super: { amount: 10000, currency: 'AUD' } },
  q50: { now: gbp(900), fo: gbp(2000) }, q74: { count: 1, ageFirst: 33 }, q79: 'Definite', q81: 'Prep (4)', q82: gbp(15000) });

async function scan(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#tabbar .tb-ind').analyze();
  const bad = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  if (process.env.A11Y_DETAIL) for (const v of bad) for (const n of v.nodes) { const d = (n.any[0] || {}).data || {}; console.log(`DETAIL ${label} ${n.target.join(' ')} fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio} need=${d.expectedContrastRatio} size=${d.fontSize} ${d.fontWeight}`); }
  return bad.map((v) => `${label}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0].target.join(' ')})`);
}

for (const scheme of ['light', 'dark']) {
  test(`no serious accessibility problems on any screen (${scheme})`, async ({ page }) => {
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/a11y-budget.xlsx', sampleBudgetWorkbook());
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
    await prepare(page);
    await fresh(page);
    const problems = [];
    problems.push(...await scan(page, 'welcome'));
    await page.getByRole('button', { name: /Quick start/ }).click();
    problems.push(...await scan(page, 'question'));
    await seedAnswers(page, ANSWERS);
    await page.goto('/#budget'); await page.reload();
    await page.locator('[data-act="bud-import"]').setInputFiles('test-results/a11y-budget.xlsx');
    problems.push(...await scan(page, 'budget-preview'));
    await page.getByRole('button', { name: 'Save to my budget' }).click();
    for (const route of ['plan', 'timeline', 'budget', 'scenarios', 'settings', 'answers', 'privacy', 'advice']) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(150);
      problems.push(...await scan(page, route));
    }
    await page.goto('/#budget');
    await page.getByRole('tab', { name: 'Investments' }).click();
    problems.push(...await scan(page, 'investments'));
    await page.goto('/#timeline');
    await page.getByRole('button', { name: 'Add a life event' }).click();
    problems.push(...await scan(page, 'event-sheet'));
    if (problems.length) console.log(problems.join('\n'));
    expect(problems).toEqual([]);
  });
}

test('keyboard: role="button" rows open with Enter, and focus shows a visible ring', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.evaluate(() => localStorage.setItem('forge.settings.v1', JSON.stringify({ events: [{ id: 'ev-k', template: 'oneOffTrip', params: { name: 'Keyboard trip', at: '2030-05', cost: 2000 } }] })));
  await page.goto('/#plan');
  await page.reload();
  const row = page.locator('.ev-user', { hasText: 'Keyboard trip' });
  await row.focus();
  expect(await row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit life event' })).toBeVisible();
  await page.keyboard.press('Escape');
  await row.focus();
  await page.keyboard.press(' ');
  await expect(page.getByRole('dialog', { name: 'Edit life event' })).toBeVisible();
});
