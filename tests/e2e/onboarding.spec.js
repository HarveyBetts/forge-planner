// E2E walk: quick-start onboarding at iPhone size with SAMPLE answers (not Harvey's) → Plan screen.
// Replaces the old standalone tests/e2e/onboarding.walk.mjs (T2.2a). Screenshots go to artifacts/.
import { test, expect } from '@playwright/test';
import { prepare, fresh, expectNoOverflow, ART } from './helpers.js';

export const SAMPLE = {
  q1: { month: '1997-03' }, q4: { num: '55' }, q7: { pick: 'GBP' }, q11: { pick: 'Offer accepted' },
  q12: { month: '2027-09' }, q50: { fields: { 'now.v': '500', 'training.v': '0', 'fo.v': '2000' } },
  q49: { fields: { 'isa.v': '14000', 'super.v': '15000' } }, q63: { money: '50000' }, q74: { fields: { 'count.v': '2', 'ageFirst.v': '33', 'gap.v': '2' } },
  q79: { pick: 'Definite' }, q81: { pick: 'Prep (4)' }, q82: { money: '20000' }, q94: { pick: 'Buy' },
  q97: { money: '450000' }, q98: { fields: { 'percent.v': '10', 'by.v': '2034-06' } },
  q113: { fields: { 'where.v': 'Morocco', 'when.v': '2028-03', 'cost.v': '4000' } },
  q116: { fields: { 'perYear.v': '2', 'costEach.v': '5000' } },
};

// Answer every quick-start question from `answers`; anything not listed gets "Don't know".
export async function walkQuickStart(page, answers = SAMPLE, shots = {}) {
  await page.getByRole('button', { name: /Quick start/ }).click();
  for (let i = 0; i < 80; i++) {
    const form = page.locator('[data-form]');
    if (!(await form.count())) break;
    const id = await form.getAttribute('data-qid');
    const a = answers[id];
    await expectNoOverflow(page, id);
    if (!a) { await page.click('[data-act="unknown"]'); await page.waitForFunction((q) => document.querySelector('[data-form]')?.dataset.qid !== q, id); continue; }
    if (a.month) await page.fill('[name="v"]', a.month);
    if (a.num || a.money) await page.fill('[name="v"]', a.num || a.money);
    if (a.fields) for (const [n, val] of Object.entries(a.fields)) await page.fill(`[name="${n}"]`, val);
    if (shots[id] && !a.pick) await page.screenshot({ path: `${ART}/${shots[id]}.png` });
    if (a.pick) {
      await page.click(`[data-act="pick"][data-val="${a.pick}"]`);
      if (shots[id]) await page.screenshot({ path: `${ART}/${shots[id]}.png` });
    } else {
      await page.click('[data-act="next"]');
    }
    await page.waitForFunction((q) => document.querySelector('[data-form]')?.dataset.qid !== q, id);
  }
}

test('quick-start onboarding → plan, resumes after reload', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await page.screenshot({ path: `${ART}/onb-1-welcome.png` });
  await walkQuickStart(page, SAMPLE, { q79: 'onb-2-choice', q82: 'onb-3-money', q74: 'onb-4-fields' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plan');
  await page.waitForTimeout(1400); // ring animation
  await expectNoOverflow(page, 'plan');
  await page.screenshot({ path: `${ART}/onb-5-plan.png`, fullPage: true });
  await expect(page.getByText(/Australian super .* stays locked until Mar 2057/)).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')));
  expect(stored.completedAt).toBeTruthy();
  expect(Object.keys(stored.answers).length).toBeGreaterThanOrEqual(30);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plan');
  await page.click('[data-act="review"]');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your answers');
  await expectNoOverflow(page, 'review');
  await page.screenshot({ path: `${ART}/onb-6-review.png` });
  expect(errors).toEqual([]);
});
