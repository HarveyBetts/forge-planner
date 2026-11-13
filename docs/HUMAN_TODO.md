# HUMAN_TODO — things only Harvey can do

Claude Code appends here when blocked. Phases 0–3 need only **H1**. Do these in order when you reach them.

## H1 — Own GitHub repo ✅ done (13 Nov 2026)
`HarveyBetts/forge-planner`, public. The planner was moved in with its own history (DECISIONS D21).

## H2 — Turn on hosting ✅ done (Pages runs on every push to main)
GitHub → `forge-planner` → Settings → Pages → Source: **GitHub Actions**. Every push to `main` then runs the checks and
publishes the site at https://harveybetts.github.io/forge-planner/ . On your iPhone: open it in Safari → Share → Add to Home Screen.

## H3 — Create a NEW Supabase project for sync (optional; ~10 min)
Only needed if you want your data on more than one device. Forge works fully without it.
1. supabase.com → **New project** (not the old Forge project). Region: Sydney. Save the database password somewhere safe.
2. **SQL Editor** → New query → paste the whole of `supabase/schema.sql` from the forge-planner repo → **Run**. It's safe to re-run
   (re-run it whenever Claude says the schema changed).
3. **Authentication → URL Configuration**: Site URL = `https://harveybetts.github.io/forge-planner/`.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** (publishable) key. Never copy the `service_role` key anywhere.
5. GitHub → forge-planner → `src/config.js` → ✏️ edit → paste them between the quotes:
   `url: 'https://xxxx.supabase.co',` and `anonKey: '…',` → **Commit changes**. The site redeploys in ~2 minutes.
6. In Forge: Settings → **Sync & account** → Create account (email + password) → your data uploads. On another phone: Sign in.
Then do H4 once.

## H4 — Prove the database is locked down (after H3, 2 min)
1. Supabase → **SQL Editor** → New query → paste the whole of `supabase/tests/rls.sql` → **Run**.
2. You should see 14 rows, **every one saying PASS** (e.g. "B cannot read A's documents, even by id | PASS"). Nothing is changed:
   the script creates two throwaway users inside a transaction and rolls everything back.
3. If any row says FAIL, or the run errors, stop and send Claude a screenshot — don't sign in on the app until it's fixed.
4. If it errors on "insert into auth.users": create two users in Authentication → Users → Add user (any emails), then replace the two
   UUIDs at the top of the script (…000a and …000b) with theirs, and run it again.
(Claude has run the same script against a local PostgreSQL with a Supabase stand-in: 14/14 PASS — `npm run test:rls`.)

## H5 — Turn on the AI planner (after H3; ~15 min, no computer needed)
The AI runs as a small server function in your Supabase project. GitHub deploys it for you; the Anthropic key lives only in
Supabase, never in the app or the repo.
1. **console.anthropic.com** → sign up → **Billing**: add a small prepaid credit (e.g. US$10) → **Settings → Limits**: set a
   monthly spend limit (e.g. US$10). This is your hard ceiling whatever happens.
2. Anthropic console → **API keys** → Create key, name it `forge-planner` → copy it (starts `sk-ant-`). Don't paste it anywhere else.
3. Supabase → your Forge project → **Edge Functions → Secrets** → Add new secret: name `ANTHROPIC_API_KEY`, value = the key → Save.
   (Optional: `AI_DAILY_CAP` = questions per day per person; default 20.)
4. Supabase → your avatar (top right) → **Account preferences → Access Tokens** → Generate new token, name `github-deploy` → copy it.
5. Supabase → **Project Settings → General** → copy the **Project ID** (a string like `abcdefghijklmnop`).
6. GitHub → forge-planner → **Settings → Secrets and variables → Actions → New repository secret**, twice:
   `SUPABASE_ACCESS_TOKEN` = the token from step 4; `SUPABASE_PROJECT_REF` = the Project ID from step 5.
7. GitHub → forge-planner → **Actions → Deploy AI function → Run workflow** (branch main). A green tick = the AI is live.
8. In Forge (signed in): Plan → **Ask Forge** and try "What if I return to the UK in 2028?".
9. Optional (~US$1): tell Claude "run the AI eval" — it runs the 10-question quality check in `docs/AI_EVAL.md` against the
   real model and reports back.
Cost: each question is roughly US$0.04–0.12 on the default model (estimate from Anthropic's published per-token prices; longer
plans and answers cost more). The daily cap and your spend limit bound it. If it ever misbehaves, delete the
`ANTHROPIC_API_KEY` secret in Supabase and the AI switches off instantly; nothing else in Forge is affected.

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
