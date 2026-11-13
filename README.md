# Forge

Your money planner: when you'll be able to stop working, what your life plans cost, and when the money you're investing becomes
**free to spend** (Coast FIRE). Plus your weekly budget and investments, imported from your own spreadsheet.

**Open it:** https://harveybetts.github.io/forge-planner/

> Estimates, not financial advice. Everything is in today's money and shown as ranges.

## Put it on your iPhone
1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open Forge from the new icon. It runs full-screen and works without signal.

(If you added it before the new icon arrived, delete the old icon and add it again.)

## First steps
1. **Answer the questions.** *Quick start* (32 questions, ~10 min) gives you a plan; the rest can wait. Already typed answers in
   the Forge intake doc? On the first screen tap **Paste answers from the intake doc**.
2. **Bring in your budget.** Google Sheets → File → Download → Microsoft Excel (.xlsx). In Forge: **Budget → Import my
   spreadsheet** → pick the file → check → **Save**.
3. **Use your real balances.** Budget → **Use these as my current balances**.
4. **Add life events** (kids, a home, trips, a move): **Timeline → Add a life event**.
5. **Check in monthly** on the Plan screen — it records how you're doing and keeps the plan honest.
6. *Optional:* **sync between devices** (docs/HUMAN_TODO.md H3) and the **AI planner** (H5). Then Plan → **Ask Forge**:
   "What if I move back to the UK in 2028?" — it answers using your plan and can suggest changes, which you tick and
   **Add to my plan** (or not). Nothing changes without that tap, and there's an Undo.

## The tabs
| Tab | What it's for |
|---|---|
| **Plan** | Are you on track? Coast date, free money this month, target pot, the chart (tap it), what would get you there, reality check against your budget |
| **Timeline** | Drag through your life: training, First Officer, kids, house — your pot at each point |
| **Budget** | Your weekly ledger, cash by fortnight, bills, weekly plans, investments, net worth, bank CSV import |
| **Scenarios** | What-ifs ("two children", "stop at 57") side by side with your plan |
| **Settings** | Appearance, how blunt Forge is, assumptions (inflation etc.), **backups** |

## Your data
- Everything lives **on your phone only** unless you turn on sync (your own locked database) or ask the AI planner a question
  (your plan's figures go to Anthropic's Claude through Forge's server — never your budget or bank data). Your bank details are
  never asked for.
- **Back up** regularly: Settings → **Back up everything** (one file — save it to iCloud Drive). Forge reminds you monthly.
- New phone or something went wrong? Settings → **Restore from a backup**.
- Settings → **Delete all my data** wipes it from the phone.

## If something breaks
- If a screen shows **"Something went wrong"**: tap **Back up everything** first, then **Reload**.
- Numbers look off? Settings shows the assumptions; Plan → Assumptions lists every one in use.
- Tell Claude what you tapped and what you expected — a screenshot helps. The app is checked on a simulated iPhone, but your
  phone is the real test.

---

## For developers (and Claude Code)
Read `CLAUDE.md` first; the work queue is `docs/TASKS.md`, logs in `docs/PROGRESS.md` / `docs/DECISIONS.md`, Harvey's steps in
`docs/HUMAN_TODO.md`. Plain ES modules, no build step, no dependencies at runtime.

```bash
npm run check      # syntax + unit tests (must be green before every commit)
npm run test:e2e   # Playwright suite at iPhone size (screenshots → artifacts/)
npm run serve      # http://localhost:8080
npm run build:site # stage the public site into _site/ (what GitHub Pages publishes)
```
Push to `main` → CI (unit + e2e) → GitHub Pages deploys. Personal data (`data/seed.local.json`, spreadsheets) is gitignored and the
site build refuses to publish it.
