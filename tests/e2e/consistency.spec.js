// T6.3: consistency pass — one screenshot set of every screen (light + dark) and automatic checks for the shared
// language: tap targets, iOS-safe inputs, one heading per screen, empty states built the same way, British copy,
// curly quotes, no leaked "NaN"/"undefined", no sideways scrolling. Screenshots → artifacts/consistency/.
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { prepare, fresh, seedAnswers, ART } from './helpers.js';
import { sampleBudgetWorkbook } from '../fixtures/xlsx-fixture.js';

const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Offer accepted', q12: '2027-09', q49: { isa: gbp(60000), super: { amount: 10000, currency: 'AUD' } },
  q50: { now: gbp(900), fo: gbp(2000) }, q74: { count: 1, ageFirst: 33 }, q79: 'Definite', q81: 'Prep (4)', q82: gbp(15000) });
const DIR = `${ART}/consistency`;

// Runs in the page: returns a list of problems on the current screen.
function audit() {
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const root = document.querySelector('.sheet:not([aria-hidden="true"])') || document.getElementById('main');
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 40);
  // Tap targets ≥ 40px tall (44 is the goal; inline text links inside sentences are exempt).
  for (const el of root.querySelectorAll('button, .btn, .row, .link-btn, .icon-btn, a.card, [role="button"]')) {
    if (!vis(el) || el.closest('p') || el.closest('.sr')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 40) out.push(`tap target ${Math.round(r.height)}px tall: “${label(el)}”`);
  }
  // Inputs ≥ 16px (smaller zooms the page on iOS).
  for (const el of root.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=range]):not([type=checkbox]), select, textarea')) {
    if (!vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.push(`input font ${fs}px: ${el.name || el.id || el.className}`);
  }
  // One h1 per screen (sheets have their own h2).
  if (!document.querySelector('.sheet:not([aria-hidden="true"])')) {
    const h1 = [...document.querySelectorAll('#main h1')].filter(vis);
    if (h1.length !== 1) out.push(`${h1.length} h1 headings`);
  }
  // Empty states share one shape: icon, h2.h3 title, p.sub text.
  for (const el of root.querySelectorAll('.card.empty')) {
    if (!el.querySelector('.empty-ic') || !el.querySelector('h2.h3') || !el.querySelector('p.sub')) out.push(`empty state missing icon/title/text: “${label(el)}”`);
  }
  // Copy: British spelling, "tap" not "click", curly quotes, nothing leaked from code.
  const text = root.innerText;
  const rules = [[/\bclick(ed|ing)?\b/i, '“click” (say tap)'], [/\b(color|favorite|center|analyze|organize|canceled|behavior|savings account)\b/, 'American spelling'],
    [/\b(NaN|undefined|null|\[object Object\]|Infinity)\b/, 'leaked code value'], [/[A-Za-z]'[a-z]/, 'straight apostrophe (use ’)'], [/\.\.\./, '“...” (use …)'],
    [/!\s*$|!\s/m, 'exclamation mark'], [/\bguaranteed\b/i, '“guaranteed”']];
  for (const [re, what] of rules) { const m = text.match(re); if (m) out.push(`${what}: “…${text.slice(Math.max(0, m.index - 20), m.index + 25).replace(/\s+/g, ' ')}…”`); }
  // Sideways scroll.
  if (document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) out.push('horizontal overflow');
  return out;
}

test('consistency: every screen, light and dark — screenshot set + shared-language checks', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(DIR, { recursive: true });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/consistency-budget.xlsx', sampleBudgetWorkbook());
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  const errors = await prepare(page);
  const problems = [];
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.waitForFunction(() => !document.querySelector('.toast.in'), null, { timeout: 8000 }).catch(() => {});
    const found = await page.evaluate(audit);
    problems.push(...found.map((p) => `${name}: ${p}`));
    await page.screenshot({ path: `${DIR}/${name}.png` });
  };
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await fresh(page);
    await shot(`01-welcome-${scheme}`);
    await page.getByRole('button', { name: /Quick start/ }).click();
    await shot(`02-question-${scheme}`);
    await seedAnswers(page, ANSWERS);
    await page.goto('/#budget'); await page.reload();
    await shot(`06-budget-empty-${scheme}`);
    await page.locator('[data-act="bud-import"]').setInputFiles('test-results/consistency-budget.xlsx');
    await page.getByRole('button', { name: 'Save to my budget' }).click();
    const screens = [['03-plan', 'plan'], ['04-timeline', 'timeline'], ['07-budget', 'budget'], ['08-scenarios', 'scenarios'],
      ['09-settings', 'settings'], ['10-answers', 'answers'], ['11-privacy', 'privacy'], ['12-advice', 'advice'], ['13-ask-not-set-up', 'ask']];
    for (const [name, route] of screens) { await page.goto(`/#${route}`); await shot(`${name}-${scheme}`); }
    await page.goto('/#plan');
    await page.getByRole('button', { name: '+ Add a life event' }).click();
    await shot(`05-add-event-${scheme}`);
    await page.locator('.sheet').getByRole('button', { name: /A trip/ }).click();
    await shot(`05b-event-form-${scheme}`);
  }
  console.log(problems.length ? `CONSISTENCY PROBLEMS:\n${problems.join('\n')}` : 'CONSISTENCY: clean');
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});
