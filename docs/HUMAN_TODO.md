# HUMAN_TODO — things only Harvey can do

Claude Code appends here when blocked. Phases 0–3 need only **H1**. Do these in order when you reach them.

## H1 — Give the planner its own GitHub repo (needed to deploy; ~5 min)
Right now the planner lives in the `planner/` folder of your existing `Forge` repo, on the branch
`claude/optimistic-turing-r99wzv` (see DECISIONS D14). Your live legacy app is untouched.
1. github.com → New repository → name `forge-planner`. Don't add a README. Public or private: see H2.
2. Easiest: start a Claude Code session with **both** repos attached and say:
   "Split the planner/ folder of Forge into forge-planner with its history and push it to main."
3. Or by hand, in a clone of `Forge`:
   `git checkout claude/optimistic-turing-r99wzv && git subtree split --prefix=planner -b planner-only && git push https://github.com/HarveyBetts/forge-planner.git planner-only:main`
4. `data/seed.local.json` is gitignored and was never committed — the new repo won't contain it.

## H2 — Choose how to host (decide before first deploy)
GitHub Pages on a **free** account only serves **public** repos (as far as I know — confirm on GitHub's docs).
That is fine here *because* no personal data is in git and the database enforces per-user access.
- Option A (default): make the repo public → Settings → Pages → Source: **GitHub Actions**.
- Option B: keep the repo private and host on Cloudflare Pages / Netlify (free), pointed at the `_site/` output of `npm run build:site`.

## H3 — Create a NEW Supabase project (Phase 4)
Do **not** reuse the legacy Forge project. supabase.com → New project → copy the Project URL and the
publishable/anon key (those two are safe to be public *only after* `schema.sql` is applied).
Then: SQL editor → paste `supabase/schema.sql` → Run. Authentication → URL configuration → add your site URL.

## H4 — Verify the database is locked down (Phase 4, 5 min)
Run the queries in `supabase/tests/rls.sql` (Claude Code writes it in T4.4) while signed in as two different test users.
Each must see only their own rows; an anonymous request must see nothing.

## H5 — Deploy the AI function (Phase 5)
Supabase CLI: `supabase functions deploy planner-ai` then set secrets:
`supabase secrets set ANTHROPIC_API_KEY=... AI_DAILY_CAP=30 ALLOWED_ORIGIN=https://<your-site>`.
Put a spend limit on your Anthropic account before turning this on.

## H6 — Answer the onboarding questions (first launch of the app)
Open the app → Quick start (32 questions) now, the rest later from "Your answers". Export a backup when done.
Opening balances (ISA, super), date of birth, retirement age and target spend, and **Speedbird pay figures**
come from you or the official offer paperwork — Claude Code is forbidden from inventing them.

## H7 — Test on your iPhone
After each phase, open the app on your phone (add to Home Screen) and send a numbered punch list.

---
## Blocked items logged by Claude Code (newest last)
