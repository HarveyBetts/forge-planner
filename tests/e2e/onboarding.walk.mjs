// E2E walk: quick-start onboarding at iPhone size with SAMPLE answers (not Harvey's), screenshots to artifacts/.
// Run: npm run serve (port 8080) in one terminal, then: node tests/e2e/onboarding.walk.mjs
// Fails (exit 1) on console errors (other than blocked font downloads) or horizontal overflow.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || 'artifacts';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const URL = process.env.FORGE_URL || 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15'] });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const overflow = async (label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 1) errors.push(`horizontal overflow ${o}px on ${label}`);
};
const settle = () => page.waitForTimeout(450);

await page.goto(URL);
await settle();
await page.screenshot({ path: `${OUT}/1-welcome.png` });
await overflow('welcome');
await page.click('text=Quick start');
await settle();

const plan = {
  q1: { month: '1997-03' }, q4: { num: '55' }, q7: { pick: 'GBP' }, q11: { pick: 'Offer accepted' },
  q12: { month: '2027-09' }, q50: { fields: { 'now.v': '500', 'training.v': '0', 'fo.v': '2000' } },
  q63: { money: '50000' }, q74: { fields: { 'count.v': '2', 'ageFirst.v': '33', 'gap.v': '2' } },
  q79: { pick: 'Definite' }, q81: { pick: 'Prep (4)' }, q82: { money: '20000' }, q94: { pick: 'Buy' },
  q97: { money: '450000' }, q98: { fields: { 'percent.v': '10', 'by.v': '2034-06' } },
  q113: { fields: { 'where.v': 'Morocco', 'when.v': '2028-03', 'cost.v': '4000' } },
  q116: { fields: { 'perYear.v': '2', 'costEach.v': '5000' } },
};
const shots = { q82: '3-money', q79: '2-choice', q74: '4-fields' };
for (let i = 0; i < 80; i++) {
  const form = await page.$('[data-form]');
  if (!form) break;
  const id = await form.getAttribute('data-qid');
  const a = plan[id];
  await overflow(id);
  if (!a) { await page.click('[data-act="unknown"]'); await settle(); continue; }
  if (a.month) await page.fill('[name="v"]', a.month);
  if (a.num || a.money) await page.fill('[name="v"]', a.num || a.money);
  if (a.fields) for (const [n, val] of Object.entries(a.fields)) await page.fill(`[name="${n}"]`, val);
  if (shots[id] && !a.pick) await page.screenshot({ path: `${OUT}/${shots[id]}.png` });
  if (a.pick) {
    await page.click(`[data-act="pick"][data-val="${a.pick}"]`);
    if (shots[id]) await page.screenshot({ path: `${OUT}/${shots[id]}.png` });
    await page.waitForTimeout(700);
    continue;
  }
  await page.click('[data-act="next"]');
  await settle();
}
await page.waitForTimeout(1500);
const title = await page.textContent('h1');
await overflow('end');
await page.screenshot({ path: `${OUT}/5-plan.png`, fullPage: true });
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')));
// Resume check: reload keeps state and boots to the plan.
await page.reload(); await settle();
const afterReload = await page.textContent('h1');
await page.click('[data-act="review"]'); await settle();
await page.screenshot({ path: `${OUT}/6-review.png` });
await overflow('review');
console.log(JSON.stringify({ endTitle: title, afterReload, answered: Object.keys(stored.answers).length,
  completedAt: !!stored.completedAt, errors }, null, 2));
await browser.close();
const real = errors.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|fonts\.g/.test(e));
if (real.length || title !== 'Your plan' || afterReload !== 'Your plan') process.exit(1);
