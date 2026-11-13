# HUMAN_TODO — things only Harvey can do

Claude Code appends here when blocked. Phases 0–3 need only **H1**. Do these in order when you reach them.

## H1 — Own GitHub repo ✅ done (13 Nov 2026)
`HarveyBetts/forge-planner`, public. The planner was moved in with its own history (DECISIONS D21).

## H2 — Turn on hosting ✅ done (Pages runs on every push to main)
GitHub → `forge-planner` → Settings → Pages → Source: **GitHub Actions**. Every push to `main` then runs the checks and
publishes the site at https://harveybetts.github.io/forge-planner/ . On your iPhone: open it in Safari → Share → Add to Home Screen.

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
## H9 — Bring your spreadsheet into Forge (2 min, on your iPhone)
1. Google Sheets → your finances sheet → File → Download → Microsoft Excel (.xlsx). Save it to Files.
2. Forge → Budget tab → **Import my spreadsheet** → pick that file → check the summary → **Save to my budget**.
3. Optional: **Use these as my current balances** to feed cash, Premium Bonds and investments into your plan.
Re-import any time you've updated the sheet (it replaces what's on the phone). Details: docs/BUDGET.md.

## H8 — Retire the old Forge app (10 min, do it once the new one is live)
The old app's database can be read and written by anyone who has the key published in the old public repo. Shut it down:
1. Anything you want to keep: Supabase → old project → Table Editor → pick a table → Export to CSV.
2. Supabase → old project → Settings → General → **Delete project**.
3. GitHub → `Forge` → Settings → Danger Zone → **Delete this repository** (takes the old site and its history offline).
4. If you ever saved real passwords in the old app's Passwords or Vault tabs, change those passwords.
5. Delete the old Forge icon from your home screen.

---
## Blocked items logged by Claude Code (newest last)
