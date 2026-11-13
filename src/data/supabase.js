// Supabase client without libraries (D25): Auth (GoTrue) + the `user_docs` table (PostgREST) over fetch.
// fetch, storage and clock are injected so the whole thing runs against tests/fixtures/mock-supabase.js.
// Errors are readable and never contain keys or tokens.
export const SESSION_KEY = 'forge.session.v1';
export const DOC_KEYS = ['onboarding', 'settings', 'budget', 'snapshots', 'scenarios'];

export function createSupabase({ url, anonKey, fetch: doFetch = (...a) => globalThis.fetch(...a), storage, now = () => Date.now() }) {
  let store = storage;
  if (store === undefined) { try { store = globalThis.localStorage || null; } catch { store = null; } }
  let session = null;
  try { session = store ? JSON.parse(store.getItem(SESSION_KEY) || 'null') : null; } catch { session = null; }
  const save = (s) => { session = s; try { if (store) { if (s) store.setItem(SESSION_KEY, JSON.stringify(s)); else store.removeItem(SESSION_KEY); } } catch { /* memory only */ } };

  const toSession = (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: now() + (Number(j.expires_in) || 3600) * 1000,
    user: j.user ? { id: j.user.id, email: j.user.email } : (session && session.user) || null });

  async function call(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    if (auth && session && session.expires_at - now() < 60000) await refresh();
    const res = await doFetch(url + path, {
      method,
      headers: { apikey: anonKey, Authorization: `Bearer ${auth && session ? session.access_token : anonKey}`, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) || `Request failed (${res.status})`;
      const e = new Error(String(msg).replace(/(eyJ|sb_)[A-Za-z0-9._-]+/g, '…'));
      e.status = res.status;
      throw e;
    }
    return data;
  }
  async function refresh() {
    if (!session || !session.refresh_token) return;
    const s = session; session = null; // avoid recursion through call()
    try {
      const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false });
      save({ ...toSession(j), user: j.user ? { id: j.user.id, email: j.user.email } : s.user });
    } catch (e) { save(null); throw new Error('Your sign-in expired. Please sign in again.'); }
  }

  const api = {
    configured: true,
    user: () => (session ? session.user : null),
    signedIn: () => !!(session && session.access_token),
    async signUp(email, password) {
      const j = await call('/auth/v1/signup', { method: 'POST', body: { email, password }, auth: false });
      if (j && j.access_token) { save(toSession(j)); return { signedIn: true }; }
      return { signedIn: false, needsConfirm: true };
    },
    async signIn(email, password) {
      const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
      save(toSession(j));
      return api.user();
    },
    // Email-confirmation / magic links come back as "#access_token=…&refresh_token=…&expires_in=…".
    async fromRedirect(hash) {
      const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
      if (!p.get('access_token')) return false;
      save(toSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') }));
      try { const u = await call('/auth/v1/user'); save({ ...session, user: { id: u.id, email: u.email } }); } catch { /* keep tokens */ }
      return true;
    },
    async signOut() {
      try { if (session) await call('/auth/v1/logout', { method: 'POST' }); } catch { /* signing out locally is what matters */ }
      save(null);
    },
    async deleteAccount() {
      await call('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
      save(null);
    },
    // Documents: { key: { data, updatedAt } }
    async listDocs() {
      const rows = await call('/rest/v1/user_docs?select=key,data,updated_at');
      return Object.fromEntries((rows || []).map((r) => [r.key, { data: r.data, updatedAt: r.updated_at }]));
    },
    async putDoc(key, data, updatedAt = new Date(now()).toISOString()) {
      if (!DOC_KEYS.includes(key)) throw new Error(`Unknown document “${key}”.`);
      const rows = await call('/rest/v1/user_docs?on_conflict=user_id,key', { method: 'POST', body: [{ key, data, updated_at: updatedAt }],
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' } });
      return (rows && rows[0] && rows[0].updated_at) || updatedAt;
    },
    async removeAllDocs() { await call('/rest/v1/user_docs?key=not.is.null', { method: 'DELETE' }); },
  };
  return api;
}
