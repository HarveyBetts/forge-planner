# SECURITY — threat model & rules

**Why this file exists:** legacy Forge uses a client-side PIN and RLS policies of `using (true)` on every table, in a
public repo with the Supabase URL + publishable key committed. That means anyone who finds the repo can read/write
those tables directly through the Supabase API. Acceptable for a friends-only toy, **not** for someone's finances.
Forge v2 must not inherit this.

## Rules
1. Real **Supabase Auth**. Every table has RLS enabled with owner-only policies (`user_id = auth.uid()`), `with check` included.
   **Never** `using (true)`. `anon` has no table privileges (schema.sql revokes them).
2. The **service-role key** exists only in Edge Function secrets. It must never appear in the repo, client code, logs or docs.
3. The **publishable/anon key** may be public *only because* of rule 1. T4.4 proves it with two-user tests.
4. **No bank credentials** are ever collected or stored. Bank data = user-supplied CSV, parsed locally, previewed before saving.
5. **AI** only through `planner-ai`: JWT required, atomic per-user daily cap (`bump_ai_usage`), input/output size caps,
   Anthropic key in secrets only, set `ALLOWED_ORIGIN`. Send scenario JSON only — never transactions or account names.
6. **No secrets or personal data in git.** `.gitignore` covers `.env*`, `*.local.json`, `data/seed.local.json`. CI never prints secrets.
7. **Client hardening:** add a restrictive CSP `<meta>` (self + the Supabase origin + font hosts), escape all user text before
   inserting into templates (no raw `innerHTML` with user data), validate imported JSON against the schema.
8. **Data rights:** in-app export (JSON), delete-all, delete-account. Privacy page states what's stored and where.
9. **Backups:** Harvey can export at any time; remind monthly at check-in.

## Verification checklist (Claude Code keeps this current)
- [ ] two-user RLS test passes (T4.4)  - [ ] anon request returns nothing  - [ ] `grep -r service_role` finds nothing in client code
- [ ] CSP in place  - [ ] imported JSON validated  - [ ] AI cap enforced in tests  - [ ] no personal data in `git ls-files`
