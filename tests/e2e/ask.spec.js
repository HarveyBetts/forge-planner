// T5.2: Ask Forge (AI planner) end to end with a mocked planner-ai function behind a mock Supabase.
// The AI's proposals must be shown as a diff and never applied without "Add to my plan".
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, fresh, seedAnswers, expectNoOverflow, ART } from './helpers.js';
import { createMockSupabase } from '../fixtures/mock-supabase.js';

const SUPA = 'https://abc.supabase.co';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS' };
const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(80000) }, q50: { now: gbp(900) } });

const TRIP = { kind: 'addEvent', template: 'oneOffTrip', name: 'Dirt-bike trip', params: { at: '2027-06', cost: 4000, name: 'Dirt-bike trip' }, assumed: [] };
const AGE = { kind: 'setAnswer', questionId: 'q4', value: 57, assumed: [] };

async function setup(page, { configured = true, signIn = true } = {}) {
  const mock = createMockSupabase();
  if (configured) await page.addInitScript((url) => { window.FORGE_CONFIG = { supabase: { url, anonKey: 'anon-test' } }; }, SUPA);
  const errors = await prepare(page);
  await page.route(/https:\/\/abc\.supabase\.co\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const res = await mock.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() || undefined });
    route.fulfill({ status: res.status, headers: { ...CORS, 'content-type': 'application/json' }, body: await res.text() });
  });
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'));
  await fresh(page);
  await seedAnswers(page, ANSWERS);
  await page.reload(); // the app reads the seeded answers on load
  if (signIn) {
    // An account that already exists on the mock; signing in through the real sheet.
    await mock.fetch(`${SUPA}/auth/v1/signup`, { method: 'POST', headers: { apikey: 'anon-test' }, body: JSON.stringify({ email: 'h@example.com', password: 'secret123' }) });
    await page.goto('/#settings');
    await page.getByRole('button', { name: 'Sign in or create an account' }).click();
    await page.getByLabel('Email').fill('h@example.com');
    await page.getByLabel('Password').fill('secret123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('[data-acct-email]')).toHaveText('h@example.com');
  }
  return { mock, errors };
}

test('not set up: honest empty state, no Plan entry point, Settings says so', async ({ page }) => {
  const { errors } = await setup(page, { configured: false, signIn: false });
  await page.goto('/#plan');
  await expect(page.getByRole('heading', { name: 'Your plan', exact: true })).toBeVisible();
  await expect(page.locator('.ask-cta')).toHaveCount(0);
  await page.goto('/#ask');
  await expect(page.getByRole('heading', { name: 'The AI planner isn’t switched on yet' })).toBeVisible();
  await page.goto('/#settings');
  await expect(page.locator('.list', { hasText: 'AI planner' })).toContainText('Not set up');
  expect(errors).toEqual([]);
});

test('signed out: asks you to sign in, then the chat opens', async ({ page }) => {
  const { mock, errors } = await setup(page, { signIn: false });
  await page.goto('/#ask');
  await expect(page.getByRole('heading', { name: 'Sign in to ask' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in or create an account' }).click();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password').fill('secret123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: /dirt-bike trip next year/ })).toBeVisible();
  expect(mock.users.size).toBe(1);
  expect(errors).toEqual([]);
});

test('ask → answer → proposal diff → add only what you tick → undo', async ({ page }) => {
  const { mock, errors } = await setup(page);
  mock.ai = () => ({ body: { answer: 'A £4,000 trip in June 2027 barely moves your plan.\n\n- Your coast date slips by about a month\n- Retiring at 57 instead would add a cushion', proposal: { summary: 'Add the trip; optionally stop at 57.', changes: [TRIP, AGE] }, model: 'claude-opus-5-5' } });
  await page.goto('/#plan');
  await page.locator('.ask-cta').click();
  await expect(page).toHaveURL(/#ask$/);
  await expect(page.getByRole('heading', { name: 'Ask Forge' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${ART}/ask-empty.png` });
  await page.getByRole('button', { name: /dirt-bike trip next year/ }).click();

  // The question and the answer appear; the request carried the plan but no budget or bank data.
  await expect(page.locator('.msg.me')).toHaveText('What if I do a £4,000 dirt-bike trip next year?');
  await expect(page.locator('.msg.ai')).toContainText('barely moves your plan');
  await expect(page.locator('.msg.ai li')).toHaveCount(2);
  const sent = mock.aiCalls[0];
  expect(sent.question).toBe('What if I do a £4,000 dirt-bike trip next year?');
  expect(sent.scenario.retirementAge).toBe(55);
  expect(sent.scenario).not.toHaveProperty('budget');
  expect(sent.summary.targetPot).toBeGreaterThan(0);
  expect(sent.history).toEqual([]);

  // Proposal: both ticked by default, with a live before → after.
  const card = page.locator('.prop');
  await expect(card.getByRole('button', { name: /Add a trip: Dirt-bike trip/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByRole('button', { name: /Stop work at a different age/ })).toContainText('55 → 57');
  await expect(card.locator('.pr-h')).toHaveText('If you add these 2');
  await expect(card.locator('.bul li').first()).toBeVisible();
  await page.waitForTimeout(500); // let the entrance animation and toast settle
  await page.screenshot({ path: `${ART}/ask-proposal.png` });
  await expectNoOverflow(page, 'ask proposal');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#tabbar .tb-ind').analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${scheme}: ${v.id} ${v.nodes[0].target.join(' ')}`)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // Untick the age change: only the trip gets added; retirement age stays 55.
  await card.getByRole('button', { name: /Stop work at a different age/ }).click();
  await expect(card.locator('.pr-h')).toHaveText('If you add it');
  await card.getByRole('button', { name: 'Add to my plan' }).click();
  await expect(page.locator('.toast')).toContainText('Added to your plan');
  await expect(card.locator('.pr-done')).toHaveText('Added to your plan');
  const stored = await page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('forge.settings.v1')), o: JSON.parse(localStorage.getItem('forge.onboarding.v1')) }));
  expect(stored.s.events).toHaveLength(1);
  expect(stored.s.events[0]).toMatchObject({ template: 'oneOffTrip', params: { cost: 4000, at: '2027-06' }, source: 'ai' });
  expect(stored.o.answers.q4.v).toBe(55);

  // Follow-up question carries the conversation so far.
  mock.ai = () => ({ body: { answer: 'Yes — still on track.', proposal: null } });
  await page.locator('#ask-q').fill('Am I still on track?');
  await page.locator('#ask-q').press('Enter');
  await expect(page.locator('.msg.ai').nth(1)).toHaveText('Yes — still on track.');
  expect(mock.aiCalls[1].history.map((m) => m.role)).toEqual(['user', 'assistant']);
  await expect(page.locator('#ask-q')).toHaveValue('');

  // Undo puts the plan back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast')).toContainText('Undone');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('forge.settings.v1')).events)).toEqual([]);

  // Plan screen shows the trip only after it's added (re-add, then look).
  await page.locator('.prop').getByRole('button', { name: 'Add to my plan' }).click();
  await page.goto('/#plan');
  await expect(page.locator('.ev')).toContainText('Dirt-bike trip');
  // axe-core tries to fetch the font stylesheet to inspect it; the app's CSP correctly blocks that. Not an app error.
  expect(errors.filter((e) => !/fonts\.googleapis\.com.*Content Security Policy/.test(e))).toEqual([]);
});

test('a proposal with a missing figure can’t be added blind — “Fill in” opens the editor prefilled', async ({ page }) => {
  const { mock, errors } = await setup(page);
  mock.ai = () => ({ body: { answer: 'Two holidays a year would cost you — how much is each?', proposal: { summary: 'Add two holidays a year.', changes: [{ kind: 'addEvent', template: 'holiday', name: 'Family holidays', params: { perYear: 2, from: '2027-01', name: 'Family holidays' }, assumed: [] }] } } });
  await page.goto('/#ask');
  await page.locator('#ask-q').fill('Can I afford two holidays a year?');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.locator('.prop');
  await expect(card).toContainText('Enter the cost of each holiday.');
  await expect(card.getByRole('button', { name: 'Add to my plan' })).toBeDisabled();
  await card.getByRole('button', { name: 'Fill in' }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet.getByRole('heading', { name: 'Holidays' })).toBeVisible();
  await expect(sheet.locator('[name="perYear"]')).toHaveValue('2');
  await expect(sheet.locator('[name="name"]')).toHaveValue('Family holidays');
  expect(errors).toEqual([]);
});

test('daily limit and network errors read clearly; Try again resends', async ({ page }) => {
  const { mock, errors } = await setup(page);
  mock.ai = () => ({ status: 429, body: { error: 'You’ve used today’s 20 AI questions. They reset at midnight (UTC).', code: 'daily_cap', cap: 20 } });
  await page.goto('/#ask');
  await page.locator('#ask-q').fill('One more?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.msg.err')).toContainText('used today’s 20 AI questions');
  await expect(page.locator('.msg.err').getByRole('button', { name: 'Try again' })).toHaveCount(0);

  mock.ai = () => ({ status: 502, body: { error: 'The AI service is unavailable right now. Try again in a minute.', code: 'upstream' } });
  await page.locator('#ask-q').fill('Hello?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.msg.err')).toContainText('Couldn’t reach Forge’s AI');
  await expect(page.locator('#ask-q')).toHaveValue('Hello?');
  mock.ai = () => ({ body: { answer: 'Back now.', proposal: null } });
  await page.locator('.msg.err').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.msg.ai')).toHaveText('Back now.');
  await expect(page.locator('.msg.err')).toHaveCount(0);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});
