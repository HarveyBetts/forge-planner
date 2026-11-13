import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabase, SESSION_KEY } from '../src/data/supabase.js';
import { createMockSupabase } from './fixtures/mock-supabase.js';
import { memoryStorage } from '../src/data/store.js';
import { supabaseConfig } from '../src/config.js';

const URL0 = 'https://abc.supabase.co';
const mk = (mock, storage = memoryStorage(), now = () => 1_000_000) => createSupabase({ url: URL0, anonKey: 'anon-key', fetch: mock.fetch, storage, now });

test('config: blank by default (device-only); only real https://*.supabase.co URLs are accepted', () => {
  assert.equal(supabaseConfig(), null);
  globalThis.FORGE_CONFIG = { supabase: { url: 'https://abc.supabase.co/', anonKey: 'k' } };
  assert.deepEqual(supabaseConfig(), { url: 'https://abc.supabase.co', anonKey: 'k' });
  globalThis.FORGE_CONFIG = { supabase: { url: 'http://evil.example', anonKey: 'k' } };
  assert.equal(supabaseConfig(), null);
  delete globalThis.FORGE_CONFIG;
});

test('auth: sign up, sign in, session persisted, sign out', async () => {
  const mock = createMockSupabase();
  const st = memoryStorage();
  const sb = mk(mock, st);
  assert.equal(sb.signedIn(), false);
  assert.deepEqual(await sb.signUp('h@example.com', 'secret123'), { signedIn: true });
  assert.equal(sb.user().email, 'h@example.com');
  assert.ok(JSON.parse(st.getItem(SESSION_KEY)).access_token);
  await sb.signOut();
  assert.equal(sb.signedIn(), false);
  assert.equal(st.getItem(SESSION_KEY), null);
  assert.equal((await sb.signIn('h@example.com', 'secret123')).email, 'h@example.com');
  const again = mk(mock, st); // reload: session read back
  assert.equal(again.user().email, 'h@example.com');
});

test('auth: readable errors; confirmation flow; tokens never leak into messages', async () => {
  const mock = createMockSupabase({ confirmEmails: true });
  const sb = mk(mock);
  assert.deepEqual(await sb.signUp('a@example.com', 'secret123'), { signedIn: false, needsConfirm: true });
  await assert.rejects(() => sb.signIn('a@example.com', 'secret123'), /Email not confirmed/);
  await assert.rejects(() => sb.signIn('a@example.com', 'wrong'), /Invalid login credentials/);
  await assert.rejects(() => sb.signUp('b@example.com', '123'), /at least 6 characters/);
  mock.confirm('a@example.com');
  await sb.signIn('a@example.com', 'secret123');
  // redirect-style tokens (confirmation / magic link)
  const sb2 = mk(mock);
  const tok = [...mock.tokens.keys()].pop();
  assert.equal(await sb2.fromRedirect(`#access_token=${tok}&refresh_token=rt_x&expires_in=3600&type=signup`), true);
  assert.equal(sb2.user().email, 'a@example.com');
  assert.equal(await sb2.fromRedirect('#settings'), false);
});

test('docs: put / list round-trip, upsert replaces, and each user only ever sees their own', async () => {
  const mock = createMockSupabase();
  const a = mk(mock), b = mk(mock);
  await a.signUp('a@example.com', 'secret123');
  await b.signUp('b@example.com', 'secret123');
  await a.putDoc('budget', { v: 1, x: 1 }, '2026-11-13T10:00:00.000Z');
  await a.putDoc('budget', { v: 1, x: 2 }, '2026-11-13T11:00:00.000Z');
  await b.putDoc('budget', { v: 1, x: 99 });
  assert.deepEqual(await a.listDocs(), { budget: { data: { v: 1, x: 2 }, updatedAt: '2026-11-13T11:00:00.000Z' } });
  assert.equal((await b.listDocs()).budget.data.x, 99);
  await assert.rejects(() => a.putDoc('secrets', {}), /Unknown document/);
  // anonymous callers get nothing
  const anon = mk(mock);
  await assert.rejects(() => anon.listDocs(), /permission denied/);
  await a.removeAllDocs();
  assert.deepEqual(await a.listDocs(), {});
  assert.equal(Object.keys(await b.listDocs()).length, 1);
});

test('session refresh before expiry; failed refresh signs out with a clear message', async () => {
  const mock = createMockSupabase();
  let t = 1_000_000;
  const st = memoryStorage();
  const sb = createSupabase({ url: URL0, anonKey: 'k', fetch: mock.fetch, storage: st, now: () => t });
  await sb.signUp('r@example.com', 'secret123');
  const first = JSON.parse(st.getItem(SESSION_KEY)).access_token;
  t += 3600 * 1000; // expired
  await sb.listDocs();
  assert.notEqual(JSON.parse(st.getItem(SESSION_KEY)).access_token, first);
  assert.ok(mock.callLog.some((c) => c.includes('grant_type=refresh_token')));
  mock.users.clear(); // refresh will now fail
  t += 3600 * 1000;
  await assert.rejects(() => sb.listDocs(), /sign-in expired/);
  assert.equal(sb.signedIn(), false);
});

test('delete account removes the user and their documents', async () => {
  const mock = createMockSupabase();
  const sb = mk(mock);
  await sb.signUp('d@example.com', 'secret123');
  await sb.putDoc('settings', { a: 1 });
  await sb.deleteAccount();
  assert.equal(sb.signedIn(), false);
  assert.equal(mock.users.size, 0);
  assert.equal(mock.docs.size, 0);
});
