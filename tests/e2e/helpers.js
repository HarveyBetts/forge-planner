// Shared e2e helpers: error collection, overflow check, and blocking external hosts
// (fonts) so runs are deterministic and offline-safe.
import { expect } from '@playwright/test';
import { SAMPLE } from './fixtures.js';

export const ART = 'artifacts';

export async function prepare(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Google Fonts are optional (system fallbacks exist); don't let the network decide pass/fail.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  // Live FX: serve a fixed table so numbers are deterministic (the real API is free and keyless).
  await page.route(/open\.er-api\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ result: 'success', rates: { USD: 1, GBP: 0.8, AUD: 1.5, EUR: 0.9 } }) }));
  return errors;
}

export async function expectNoOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o, `horizontal overflow on ${label}`).toBeLessThanOrEqual(1);
}

// Run a fresh, empty-storage session.
export async function fresh(page, path = '/') {
  await page.goto(path);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(path);
}

// Seed finished onboarding answers directly (the walk itself is covered by onboarding.spec.js).
export async function seedFinished(page, extra = {}) {
  await page.evaluate((sample) => {
    const answers = {};
    for (const [id, a] of Object.entries(sample)) {
      if (a.month) answers[id] = { v: a.month };
      else if (a.num) answers[id] = { v: Number(a.num) };
      else if (a.money) answers[id] = { v: { amount: Number(a.money), currency: 'GBP' } };
      else if (a.pick) answers[id] = { v: a.pick };
      else if (a.fields) {
        const v = {};
        for (const [k, val] of Object.entries(a.fields)) {
          const key = k.replace(/\.v$/, '');
          const n = Number(val);
          v[key] = /cost|costEach|now|training|fo|isa|super/.test(key) ? { amount: n, currency: key === 'super' ? 'AUD' : 'GBP' } : (Number.isNaN(n) || /^\d{4}-\d{2}$/.test(val) ? val : n);
        }
        answers[id] = { v };
      }
    }
    localStorage.setItem('forge.onboarding.v1', JSON.stringify({ v: 1, mode: 'quick', answers, pos: null,
      startedAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', completedAt: '2026-11-13T00:00:00Z' }));
  }, { ...SAMPLE, ...extra });
}

