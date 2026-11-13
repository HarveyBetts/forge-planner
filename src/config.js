// Public app configuration. The Supabase URL and anon (publishable) key are SAFE to publish — but only because every table is
// locked to its owner with RLS (docs/SECURITY.md; check it with supabase/tests/rls.sql). Never put the service-role key here.
// Leave both blank to run Forge on this device only (the default). Harvey fills these in at HUMAN_TODO H3.
export const SUPABASE = {
  url: '',      // e.g. 'https://abcdefghijkl.supabase.co'
  anonKey: '',  // Project settings → API → "anon public" / publishable key
};

// Tests (and only tests) can inject a config before the app loads: window.FORGE_CONFIG = { supabase: { url, anonKey } }.
export function supabaseConfig() {
  const injected = globalThis.FORGE_CONFIG && globalThis.FORGE_CONFIG.supabase;
  const c = injected || SUPABASE;
  return c && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(String(c.url || '').replace(/\/$/, '')) && c.anonKey ? { url: c.url.replace(/\/$/, ''), anonKey: c.anonKey } : null;
}
