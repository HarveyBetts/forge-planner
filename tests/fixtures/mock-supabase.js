// An in-memory stand-in for Supabase (Auth + PostgREST `user_docs` + rpc/delete_my_account) used by unit and e2e tests.
// It enforces owner-only access the way the real RLS policy does: every row is filtered by the caller's user id.
export function createMockSupabase({ confirmEmails = false } = {}) {
  const users = new Map();   // email -> { id, email, password, confirmed }
  const tokens = new Map();  // access token -> user id
  const refreshes = new Map(); // refresh token -> user id
  const docs = new Map();    // `${uid}|${key}` -> { key, data, updated_at }
  let n = 0;
  const issue = (u) => {
    const at = `at_${++n}_${u.id}`, rt = `rt_${n}_${u.id}`;
    tokens.set(at, u.id); refreshes.set(rt, u.id);
    return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } };
  };
  const reply = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const callLog = [];
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
    const uid = tokens.get(auth.replace(/^Bearer /, '')) || null;
    callLog.push(`${method} ${u.pathname}${u.search}`);
    if (!init.headers || !init.headers.apikey) return reply(401, { message: 'No API key found in request' });
    const p = u.pathname;
    if (p === '/auth/v1/signup' && method === 'POST') {
      if (users.has(body.email)) return reply(422, { msg: 'User already registered' });
      if (!body.password || body.password.length < 6) return reply(422, { msg: 'Password should be at least 6 characters.' });
      const user = { id: `user-${users.size + 1}`, email: body.email, password: body.password, confirmed: !confirmEmails };
      users.set(body.email, user);
      return reply(200, confirmEmails ? { id: user.id, email: user.email } : issue(user));
    }
    if (p === '/auth/v1/token' && method === 'POST') {
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = users.get(body.email);
        if (!user || user.password !== body.password) return reply(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        if (!user.confirmed) return reply(400, { error_description: 'Email not confirmed' });
        return reply(200, issue(user));
      }
      if (grant === 'refresh_token') {
        const id = refreshes.get(body.refresh_token);
        const user = [...users.values()].find((x) => x.id === id);
        if (!user) return reply(400, { error_description: 'Invalid Refresh Token' });
        refreshes.delete(body.refresh_token);
        return reply(200, issue(user));
      }
    }
    if (p === '/auth/v1/logout') { tokens.delete(auth.replace(/^Bearer /, '')); return reply(204); }
    if (p === '/auth/v1/user') { const user = [...users.values()].find((x) => x.id === uid); return user ? reply(200, { id: user.id, email: user.email }) : reply(401, { msg: 'invalid JWT' }); }
    if (p === '/rest/v1/user_docs') {
      if (!uid) return reply(401, { message: 'permission denied for table user_docs' }); // anon has no table privileges
      if (method === 'GET') return reply(200, [...docs.entries()].filter(([k]) => k.startsWith(uid + '|')).map(([, v]) => v));
      if (method === 'POST') {
        const out = body.map((r) => { const row = { key: r.key, data: r.data, updated_at: r.updated_at || new Date().toISOString() }; docs.set(`${uid}|${r.key}`, row); return row; });
        return reply(201, out);
      }
      if (method === 'DELETE') { for (const k of [...docs.keys()]) if (k.startsWith(uid + '|')) docs.delete(k); return reply(204); }
    }
    if (p === '/rest/v1/rpc/delete_my_account' && method === 'POST') {
      if (!uid) return reply(401, { message: 'not signed in' });
      for (const [email, user] of users) if (user.id === uid) users.delete(email);
      for (const k of [...docs.keys()]) if (k.startsWith(uid + '|')) docs.delete(k);
      for (const [t, id] of tokens) if (id === uid) tokens.delete(t);
      return reply(204);
    }
    return reply(404, { message: `mock: no route for ${method} ${p}` });
  }
  return { fetch, users, docs, tokens, callLog, confirm: (email) => { const x = users.get(email); if (x) x.confirmed = true; } };
}
