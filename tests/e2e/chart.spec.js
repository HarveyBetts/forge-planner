// T2.4: projection chart renders for edge cases and reads values on tap.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const core = { q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it' };

for (const [name, extra, expectCoast] of [
  ['never-coasts', { q49: { isa: gbp(1000) } }, null],
  ['coasting', { q49: { isa: gbp(2_000_000) }, q50: { now: gbp(500) } }, 'Coasting now'],
  ['typical', { q49: { isa: gbp(120000) }, q50: { now: gbp(1500) } }, 'Coast'], // coasts around 2043
]) {
  test(`chart: ${name}`, async ({ page }) => {
    const errors = await prepare(page);
    await fresh(page);
    await seedAnswers(page, A({ ...core, ...extra }));
    await page.goto('/#plan');
    await page.reload();
    const fig = page.locator('[data-chart]');
    await expect(fig.locator('svg.pc')).toBeVisible();
    const svg = await fig.locator('svg.pc').innerHTML();
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    if (expectCoast) await expect(fig.locator('.pc-coast text')).toHaveText(expectCoast);
    else await expect(fig.locator('.pc-coast')).toHaveCount(0);
    // Tap two-thirds across → readout + rule.
    const hit = fig.locator('.pc-hit');
    await fig.scrollIntoViewIfNeeded();
    const b = await hit.boundingBox();
    await page.touchscreen.tap(b.x + b.width * 0.66, b.y + b.height / 2);
    await expect(fig.locator('.pc-read')).toHaveText(/^Age \d+ \([A-Z][a-z]{2} \d{4}\): about /);
    await expect(fig.locator('.pc-rule')).toHaveAttribute('visibility', 'visible');
    await expectNoOverflow(page, `chart ${name}`);
    await fig.scrollIntoViewIfNeeded();
    await fig.screenshot({ path: `${ART}/chart-${name}.png` });
    expect(errors).toEqual([]);
  });
}
