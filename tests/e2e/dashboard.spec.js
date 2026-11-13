// T2.3: the Plan dashboard in each state — Ahead, On track, Behind (and Coasting). Screenshots to artifacts/.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';
import { answersToScenario } from '../../src/onboarding/answers.js';
import { glidePath } from '../../src/engine/glide.js';
import { currentMonth } from '../../src/ui/format.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const core = { q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q50: { now: gbp(500) }, q11: 'Not doing it' };
// The pot today that puts you exactly on the glide path (same engine the app uses).
const needToday = glidePath(answersToScenario(A(core), { today: currentMonth() }).scenario).needToday;

const STATES = [
  ['ahead', 'Ahead', needToday * 1.25],
  ['on-track', 'On track', needToday],
  ['behind', 'Behind', needToday * 0.4],
  ['coasting', 'Ahead', 2_000_000],
];

for (const [name, chip, isa] of STATES) {
  test(`plan dashboard: ${name}`, async ({ page }) => {
    const errors = await prepare(page);
    await fresh(page);
    await seedAnswers(page, A({ ...core, q49: { isa: gbp(Math.round(isa)) } }));
    await page.goto('/#plan');
    await page.reload();
    await expect(page.locator('.chip')).toHaveText(chip);
    await expect(page.locator('.tm')).toContainText('Today’s money');
    await page.waitForTimeout(1500); // ring + count-up
    const pctText = await page.locator('.ring-big').textContent();
    expect(pctText).toMatch(/^\d+%$/);
    if (name === 'coasting') {
      await expect(page.locator('.ring-lab')).toContainText(/Coasting · \+£[\d.]+[kM]? surplus/);
      await expect(page.locator('.free .big')).toHaveText('£500');
      await expect(page.locator('.free')).toContainText('spend instead of investing');
      await expect(page.locator('.kpi').nth(1)).toContainText('Now');
    } else {
      await expect(page.locator('.free .big')).toHaveText('£0');
    }
    if (name === 'behind') await expect(page.locator('.hero .sub')).toContainText('fall short');
    // Assumptions disclosure opens.
    const disc = page.locator('details.disc');
    await expect(disc).not.toHaveAttribute('open', '');
    await disc.locator('summary').click();
    await expect(disc.locator('.bul li').first()).toBeVisible();
    await expectNoOverflow(page, name);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${ART}/dashboard-${name}.png` });
    expect(errors).toEqual([]);
  });
}

test('count-up runs once per session; reduced motion shows final values at once', async ({ page }) => {
  await prepare(page);
  await fresh(page);
  await seedAnswers(page, A({ ...core, q49: { isa: gbp(2_000_000) } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#plan');
  await page.reload();
  const final = await page.locator('.free .big').textContent();
  expect(final).toBe('£500'); // no count-up frames under reduced motion
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#tabbar').getByRole('link', { name: 'Timeline' }).click();
  await page.locator('#tabbar').getByRole('link', { name: 'Plan' }).click();
  await expect(page.locator('.free .big')).toHaveText('£500'); // second view: static
  await expect(page.locator('[data-count]')).toHaveCount(0);
});
