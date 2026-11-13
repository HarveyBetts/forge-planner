import test from 'node:test';
import assert from 'node:assert/strict';
import { planSnapshot, diffSnapshots } from '../src/ui/whatchanged.js';
import { answersToScenario } from '../src/onboarding/answers.js';
import { projectScenario } from '../src/engine/engine.js';

const snap = (o) => ({ status: 'behind', coastDate: '2031-03', depletedAt: null, target: 1e6, potAtEnd: 800000, retirementAge: 55, ...o });

test('diff: coast date moves are described with direction and span', () => {
  assert.deepEqual(diffSnapshots(snap(), snap({ coastDate: '2034-02' })), ['Coast date moved from Mar 2031 to Feb 2034 (2 years 11 months later).']);
  assert.deepEqual(diffSnapshots(snap(), snap({ coastDate: '2030-03' })), ['Coast date moved from Mar 2031 to Mar 2030 (1 year sooner).']);
  assert.deepEqual(diffSnapshots(snap({ coastDate: null }), snap()), ['You now reach coast in Mar 2031.']);
  assert.deepEqual(diffSnapshots(snap(), snap({ coastDate: null })), ['You no longer reach coast before you stop work (was Mar 2031).']);
});

test('diff: status, run-out, age, target and pot', () => {
  const lines = diffSnapshots(snap(), snap({ status: 'short', depletedAt: '2038-08', retirementAge: 57, target: 1.2e6, potAtEnd: -50000 }));
  assert.deepEqual(lines, [
    'Status: Behind → Runs short.',
    'Your savings now run out in Aug 2038.',
    'Stop-work age: 55 → 57.',
    'Target pot: £1.0M → £1.2M.',
    'Pot at 57 (middle case): £800k → short by £50k.',
  ]);
  assert.deepEqual(diffSnapshots(snap({ depletedAt: '2038-08' }), snap()), ['Your savings no longer run out.']);
});

test('diff: tiny money moves are ignored; nothing changed → []', () => {
  assert.deepEqual(diffSnapshots(snap(), snap({ potAtEnd: 800050, target: 1e6 + 99 })), []);
  assert.deepEqual(diffSnapshots(snap(), snap()), []);
});

test('diff: plan appearing / disappearing; currency honoured', () => {
  assert.deepEqual(diffSnapshots(null, snap()), ['Your plan can now be worked out.']);
  assert.match(diffSnapshots(snap(), null)[0], /key answer is missing/);
  assert.deepEqual(diffSnapshots(snap(), snap({ target: 2e6 }), { currency: 'AUD' }), ['Target pot: A$1.0M → A$2.0M.']);
});

test('end to end: raising retirement spend moves the target and pushes coast later', () => {
  const A = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
  const base = { q1: '1997-03', q4: 55, q63: { amount: 40000, currency: 'GBP' }, q49: { isa: { amount: 60000, currency: 'GBP' } }, q50: { now: { amount: 3000, currency: 'GBP' } } };
  const mk = (ans) => { const r = answersToScenario(A(ans), { today: '2026-11' }); return planSnapshot(r.scenario, projectScenario(r.scenario)); };
  const before = mk(base);
  const after = mk({ ...base, q63: { amount: 60000, currency: 'GBP' } });
  const lines = diffSnapshots(before, after);
  assert.ok(lines.some((l) => /^Target pot: £1\.0M → £1\.5M\.$/.test(l)), lines.join(' | '));
  assert.ok(lines.some((l) => /^Coast date moved from .* later\)\.$/.test(l)), lines.join(' | '));
});
