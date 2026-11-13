import test from 'node:test';
import assert from 'node:assert/strict';
import { checkinFields, valuesToQ49, makeSnapshot, trend, backupDue } from '../src/ui/checkin.js';

test('check-in fields follow question 49 with fixed currencies', () => {
  assert.deepEqual(checkinFields('AUD').map((f) => [f.k, f.currency]), [['cashGBP', 'GBP'], ['cashAUD', 'AUD'], ['isa', 'GBP'], ['super', 'AUD'], ['other', 'AUD']]);
});

test('typed values → q49: update, blank removes, unreadable keeps, untouched pots stay', () => {
  const old = { isa: { amount: 1000, currency: 'GBP' }, super: { amount: 5000, currency: 'AUD' }, other: { amount: 7, currency: 'GBP' } };
  const q = valuesToQ49({ isa: '£12,500.50', super: '', other: 'lots', cashAUD: '3,200' }, old);
  assert.deepEqual(q, { isa: { amount: 12500.5, currency: 'GBP' }, other: { amount: 7, currency: 'GBP' }, cashAUD: { amount: 3200, currency: 'AUD' } });
  assert.deepEqual(old.super, { amount: 5000, currency: 'AUD' }); // input not mutated
});

test('snapshot, trend and backup reminder', () => {
  const s = makeSnapshot('2026-11', { isa: { amount: 1, currency: 'GBP' } }, { status: 'behind', needToday: 12345.6 }, 9876.4);
  assert.deepEqual(s, { at: '2026-11', pots: { isa: { amount: 1, currency: 'GBP' } }, total: 9876, status: 'behind', need: 12346 });
  const fmt = (x) => `£${x}`;
  assert.equal(trend([{ at: '2026-10', total: 100 }, { at: '2026-11', total: 2200 }], fmt), 'Up £2100 since Oct 2026');
  assert.equal(trend([{ at: '2026-10', total: 100 }, { at: '2026-11', total: 50 }], fmt), 'Down £50 since Oct 2026');
  assert.equal(trend([{ at: '2026-11', total: 1 }], fmt), '');
  const now = Date.parse('2026-11-13T00:00:00Z');
  assert.equal(backupDue(null, now), true);
  assert.equal(backupDue('2026-11-01T00:00:00Z', now), false);
  assert.equal(backupDue('2026-09-01T00:00:00Z', now), true);
  assert.equal(backupDue('garbage', now), true);
});
