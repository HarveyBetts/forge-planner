// T4.2 + T2.2f + T4.3 end to end: two "phones" (separate browser contexts) and one mock Supabase project.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedAnswers } from './helpers.js';
import { createMockSupabase } from '../fixtures/mock-supabase.js';

const SUPA = 'https://abc.supabase.co';
const gbp = (amount) => ({ amount, currency: 'GBP' });
const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
const ANSWERS = A({ q1: '1997-03', q4: 55, q7: 'GBP', q63: gbp(40000), q11: 'Not doing it', q49: { isa: gbp(80000) }, q50: { now: gbp(900) } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS' };

async function phone(browser, mock) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((url) => { window.FORGE_CONFIG = { supabase: { url, anonKey: 'anon-test' } }; }, SUPA);
  const page = await ctx.newPage();
  const errors = await prepare(page);
  await page.route(/https:\/\/abc\.supabase\.co\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const res = await mock.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() || undefined });
    route.fulfill({ status: res.status, headers: { ...CORS, 'content-type': 'application/json' }, body: await res.text() });
  });
  return { ctx, page, errors };
}
// A phone that already has DIFFERENT data must be asked which copy to keep.
test('signing in on a phone with different data asks which copy to keep', async ({ browser }) => {
  const mock = createMockSupabase();
  const a = await phone(browser, mock);
  await fresh(a.page); await seedAnswers(a.page, ANSWERS); await a.page.goto('/#settings'); await a.page.reload();
  await signInVia(a.page, 'h2@example.com', 'Create account');
  await expect(a.page.locator('[data-acct-email]')).toHaveText('h2@example.com');
  const b = await phone(browser, mock);
  await fresh(b.page); await seedAnswers(b.page, { ...ANSWERS, q4: { v: 60 } }); await b.page.goto('/#settings'); await b.page.reload();
  await signInVia(b.page, 'h2@example.com', 'Sign in');
  const choose = b.page.getByRole('dialog', { name: 'Choose which copy to keep' });
  await expect(choose).toBeVisible();
  expect(await b.page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')).answers.q4.v)).toBe(60); // untouched so far
  await choose.getByRole('button', { name: 'Use this phone’s copy' }).click();
  await expect(b.page.locator('.toast')).toContainText('This phone’s copy is now in your account');
  expect(JSON.parse(JSON.stringify([...mock.docs.values()].find((d) => d.key === 'onboarding').data)).answers.q4.v).toBe(60);
  await a.ctx.close(); await b.ctx.close();
});

async function signInVia(page, email, how) {
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Sign in or create an account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Sign in' });
  await sheet.locator('[name="email"]').fill(email);
  await sheet.locator('[name="password"]').fill('secret123');
  await sheet.getByRole('button', { name: how }).click();
}

test('create an account on phone A, sign in on phone B, edits travel both ways, delete keeps local data', async ({ browser }) => {
  const mock = createMockSupabase();
  const a = await phone(browser, mock);
  await fresh(a.page);
  await seedAnswers(a.page, ANSWERS);
  await a.page.evaluate(() => localStorage.setItem('forge.settings.v1', JSON.stringify({ events: [{ id: 'ev1', template: 'oneOffTrip', params: { name: 'Vietnam', at: '2029-04', cost: 3000 } }] })));
  await a.page.goto('/#settings'); await a.page.reload();
  await expect(a.page.getByText('Sync between devices')).toHaveCount(0); // configured → sign-in row instead
  await signInVia(a.page, 'harvey@example.com', 'Create account');
  await expect(a.page.locator('.toast')).toContainText('Signed in');
  await expect(a.page.locator('[data-acct-email]')).toHaveText('harvey@example.com');
  await expect(a.page.locator('[data-sync-status]')).toContainText('Last synced');
  expect([...mock.docs.keys()].sort()).toEqual(['user-1|onboarding', 'user-1|settings']); // T2.2f: answers are in the cloud

  // Phone B: brand new — no answers. Sign in from the welcome screen → everything arrives, no questions.
  const b = await phone(browser, mock);
  await fresh(b.page);
  await expect(b.page.getByRole('heading', { name: /build your plan/i })).toBeVisible();
  await b.page.getByRole('button', { name: 'Already use Forge on another device? Sign in' }).click();
  const sheet = b.page.getByRole('dialog', { name: 'Sign in' });
  await sheet.locator('[name="email"]').fill('harvey@example.com');
  await sheet.locator('[name="password"]').fill('secret123');
  await sheet.getByRole('button', { name: 'Sign in' }).click();
  await b.page.waitForLoadState('load');
  await expect(b.page.locator('.toast')).toContainText('Updated from your other device');
  await b.page.goto('/#timeline');
  await expect(b.page.locator('.ev-edit')).toContainText('Vietnam');
  expect(await b.page.evaluate(() => JSON.parse(localStorage.getItem('forge.onboarding.v1')).answers.q4.v)).toBe(55);

  // B adds an event → syncs → A picks it up (the app syncs when it comes back to the foreground).
  await b.page.getByRole('button', { name: 'Add a life event' }).click();
  await b.page.getByRole('button', { name: /^A trip/ }).click();
  await b.page.locator('[name="name"]').fill('Wedding');
  await b.page.locator('[name="at"]').fill('2031-06');
  await b.page.locator('[name="cost"]').fill('20000');
  await b.page.getByRole('button', { name: 'Add to my plan' }).click();
  await b.page.goto('/#settings');
  await b.page.getByRole('button', { name: /Sync now/ }).click();
  await expect(b.page.locator('.toast')).toContainText('Synced');
  await a.page.goto('/#settings');
  await a.page.getByRole('button', { name: /Sync now/ }).click();
  await a.page.waitForLoadState('load');
  await expect(a.page.locator('.toast')).toContainText('Updated from your other device');
  await a.page.goto('/#timeline');
  await expect(a.page.locator('.ev-edit')).toHaveCount(2);

  // Delete the account on A (two taps): cloud copy gone, A keeps its data.
  await a.page.goto('/#settings');
  await a.page.getByRole('button', { name: 'Delete my account' }).click();
  await a.page.getByRole('button', { name: /Tap again — deletes your account/ }).click();
  await expect(a.page.locator('.toast')).toContainText('Account deleted');
  expect(mock.users.size).toBe(0);
  expect(mock.docs.size).toBe(0);
  await expect(a.page.getByRole('button', { name: 'Sign in or create an account' })).toBeVisible();
  expect(await a.page.evaluate(() => JSON.parse(localStorage.getItem('forge.settings.v1')).events.length)).toBe(2);
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.ctx.close(); await b.ctx.close();
});

test('wrong password shows a readable message; not configured shows the honest “not set up” row', async ({ browser, page }) => {
  const mock = createMockSupabase();
  await mock.fetch(`${SUPA}/auth/v1/signup`, { method: 'POST', headers: { apikey: 'k' }, body: JSON.stringify({ email: 'x@example.com', password: 'secret123' }) });
  const a = await phone(browser, mock);
  await fresh(a.page); await seedAnswers(a.page, ANSWERS); await a.page.goto('/#settings'); await a.page.reload();
  await a.page.getByRole('button', { name: 'Sign in or create an account' }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Sign in' });
  await sheet.locator('[name="email"]').fill('x@example.com');
  await sheet.locator('[name="password"]').fill('wrongpass');
  await sheet.getByRole('button', { name: 'Sign in' }).click();
  await expect(sheet.locator('[data-acct-err]')).toHaveText('Invalid login credentials');
  await a.ctx.close();
  // default app (no config): device-only
  await prepare(page); await fresh(page); await seedAnswers(page, ANSWERS); await page.goto('/#settings'); await page.reload();
  await expect(page.getByText('Sync between devices')).toBeVisible();
  await expect(page.getByText('Not set up')).toBeVisible();
});
