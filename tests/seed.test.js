import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { seedToAnswers } from '../scripts/seed-lib.mjs';
import { importAnswers } from '../src/onboarding/state.js';
import { QUESTIONS } from '../src/onboarding/questions.js';

const fixture = {
  baseCurrency: 'GBP', birth: null, retirementAge: null,
  openingPots: [
    { id: 'isa', name: 'Stocks ISA', currency: 'GBP', balance: 1234, confirmed: false },
    { id: 'au-super', name: 'Super', currency: 'AUD', balance: 999, confirmed: true },
  ],
  timeline: [
    { id: 'speedbird-start', name: 'Course start', date: '2027-09', confirmed: true },
    { id: 'speedbird-training', name: 'Training', confirmed: true },
    { id: 'something', name: 'Unconfirmed thing', date: '2030-01', confirmed: false },
  ],
  assumptions: { nominalReturn: 0.07 },
};

test('seed: only confirmed facts become answers; placeholders are skipped', () => {
  const { backup, skipped } = seedToAnswers(fixture, { now: () => 'T' });
  assert.deepEqual(backup.answers, {
    q7: { v: 'GBP' },
    q49: { v: { super: { amount: 999, currency: 'AUD' } } },
    q12: { v: '2027-09' },
  });
  assert.ok(skipped.includes('Stocks ISA (not confirmed)'));
  assert.ok(skipped.includes('Unconfirmed thing (not confirmed)'));
  assert.ok(skipped.some((s) => s.startsWith('assumptions')));
  assert.ok(skipped.includes('date of birth') && skipped.includes('retirement age'));
  // skipped list never contains numbers from the seed
  assert.ok(!skipped.join(' ').includes('1234'));
});

test('seed: birth and retirement age are used when present and valid', () => {
  const { backup } = seedToAnswers({ ...fixture, birth: '1999-01', retirementAge: 55 });
  assert.equal(backup.answers.q1.v, '1999-01');
  assert.equal(backup.answers.q4.v, 55);
  const bad = seedToAnswers({ ...fixture, birth: '99-1', retirementAge: 200 });
  assert.equal(bad.backup.answers.q1, undefined);
  assert.equal(bad.backup.answers.q4, undefined);
});

test('seed: output is accepted by the app’s answers import', () => {
  const { backup } = seedToAnswers(fixture);
  const answers = importAnswers(JSON.stringify(backup), new Set(QUESTIONS.map((q) => q.id)));
  assert.equal(answers.q12.v, '2027-09');
});

test('seed: rejects non-objects', () => {
  assert.throws(() => seedToAnswers(null), /JSON object/);
});

test('build:site never publishes data/, docs/, tests/ or local JSON', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'forge-site-')), '_site');
  const r = spawnSync('bash', ['scripts/build-site.sh', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(out, 'index.html')));
  assert.ok(existsSync(join(out, 'src', 'app.js')));
  for (const banned of ['data', 'docs', 'tests', 'scripts', 'supabase', 'node_modules']) {
    assert.ok(!existsSync(join(out, banned)), banned + ' leaked into the site');
  }
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [e.name]));
  assert.ok(!walk(out).some((f) => f.endsWith('.local.json')));
});
