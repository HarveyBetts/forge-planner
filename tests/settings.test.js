import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsFromAnswers, behindCopy, applyTheme, DEFAULT_SETTINGS, LABELS } from '../src/ui/settings.js';

const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));

test('settings: defaults with no answers (and "don’t know" counts as none)', () => {
  assert.deepEqual(settingsFromAnswers({}), DEFAULT_SETTINGS);
  assert.deepEqual(settingsFromAnswers({ q136: { unknown: true } }), DEFAULT_SETTINGS);
  assert.deepEqual(settingsFromAnswers(null), DEFAULT_SETTINGS);
});

test('settings: theme q136', () => {
  assert.equal(settingsFromAnswers(A({ q136: 'Dark' })).theme, 'dark');
  assert.equal(settingsFromAnswers(A({ q136: 'Light' })).theme, 'light');
  assert.equal(settingsFromAnswers(A({ q136: 'Follow my phone' })).theme, 'system');
});

test('settings: tone q134', () => {
  assert.equal(settingsFromAnswers(A({ q134: 'Gently' })).tone, 'gentle');
  assert.equal(settingsFromAnswers(A({ q134: 'Bluntly' })).tone, 'blunt');
});

test('settings: budget style q43 and period q44, falling back to pay cycle q27', () => {
  const s = settingsFromAnswers(A({ q43: 'Just show me my free money', q44: 'Weekly', q27: 'Monthly' }));
  assert.deepEqual(s.budget, { style: 'free', period: 'weekly', periodFrom: 'q44' });
  assert.deepEqual(settingsFromAnswers(A({ q27: 'Fortnightly' })).budget, { style: 'loose', period: 'fortnightly', periodFrom: 'q27' });
});

test('settings: overspend q47 and notifications q133 (None wins)', () => {
  assert.equal(settingsFromAnswers(A({ q47: 'Loud and clear' })).overspend, 'loud');
  assert.equal(settingsFromAnswers(A({ q47: 'Don’t flag it' })).overspend, 'off');
  assert.deepEqual(settingsFromAnswers(A({ q133: ['Monthly check-in', 'When I fall behind'] })).notifications, ['checkin', 'behind']);
  assert.deepEqual(settingsFromAnswers(A({ q133: ['Monthly check-in', 'None'] })).notifications, []);
});

test('labels exist for every value', () => {
  for (const v of ['light', 'dark', 'system']) assert.ok(LABELS.theme[v]);
  for (const v of ['gentle', 'straight', 'blunt']) assert.ok(LABELS.tone[v]);
  for (const v of ['off', 'quiet', 'nudge', 'loud']) assert.ok(LABELS.overspend[v]);
});

test('tone copy: three distinct tones, never "you will" or "guaranteed"', () => {
  const all = [];
  for (const status of ['behind', 'short']) {
    const t = ['gentle', 'straight', 'blunt'].map((tone) => behindCopy(tone, status, { depletedLabel: 'Aug 2038' }));
    assert.equal(new Set(t).size, 3);
    all.push(...t);
  }
  assert.ok(all.filter((x) => /Aug 2038/.test(x)).length === 3);
  all.forEach((x) => assert.ok(!/you will|guarantee/i.test(x), x));
  assert.equal(behindCopy('weird', 'behind'), behindCopy('straight', 'behind'));
  assert.match(behindCopy('blunt', 'on-track', { retirementAge: 55 }), /by 55/);
});

test('applyTheme sets data-theme and steers theme-color metas', () => {
  const metas = [
    { a: { name: 'theme-color', media: '(prefers-color-scheme: light)' } },
    { a: { name: 'theme-color', media: '(prefers-color-scheme: dark)' } },
  ].map((m) => ({ attrs: { ...m.a }, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = v; }, hasAttribute(k) { return k in this.attrs; } }));
  const doc = { documentElement: { dataset: {} }, querySelectorAll: () => metas };
  applyTheme('dark', doc);
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.deepEqual(metas.map((m) => m.attrs.media), ['not all', 'all']);
  applyTheme('light', doc);
  assert.deepEqual(metas.map((m) => m.attrs.media), ['all', 'not all']);
  applyTheme('system', doc);
  assert.equal(doc.documentElement.dataset.theme, undefined);
  assert.deepEqual(metas.map((m) => m.attrs.media), ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']);
  assert.doesNotThrow(() => applyTheme('dark', undefined));
});
