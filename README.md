# Forge — handover pack for Claude Code

This folder is everything Claude Code needs to build **Forge**, Harvey's financial planner (Coast FIRE maths +
life timeline + budgeting + AI), without being prompted every step. Start by reading `CLAUDE.md`.

## What's inside
| Path | Purpose |
|---|---|
| `CLAUDE.md` | The brain: what we're building, who Harvey is, hard rules, autonomy protocol |
| `docs/TASKS.md` | The work queue Claude Code ticks off (Phases 0–7) |
| `docs/SPEC.md` `ENGINE.md` `DESIGN.md` `SECURITY.md` | Product spec, maths, look & feel, security rules |
| `docs/HUMAN_TODO.md` | The only things Harvey must do himself (numbered, copy-paste) |
| `docs/PROGRESS.md` `DECISIONS.md` | Logs Claude Code writes as it works — read these when you come back |
| `src/engine/engine.js` | Working, tested planning engine |
| `src/onboarding/` + `src/app.js` + `index.html` | **Boot-up questions** (146, 32 quick-start) → your plan. See `docs/ONBOARDING.md` |
| `docs/QUESTIONS.md` | Every question, generated from the code |
| `tests/` | 39 unit tests + a Playwright walk of the onboarding (`tests/e2e/`) |
| `supabase/` | Owner-only-RLS schema + AI edge-function sketch (untested) |
| `scripts/run-autonomous.sh` | Headless loop: keeps launching Claude Code until the task list is done |
| `.claude/` | Permissions allowlist, `/next` command, the unattended prompt |
| `.github/workflows/` | CI (tests on every push) + auto-deploy to GitHub Pages |
| `data/seed.local.json` | Harvey's starting facts. **Personal — gitignored, never commit.** |

## Run it — interactive (simplest)
```bash
unzip forge-handover.zip -d forge-planner && cd forge-planner
npm run check            # should say 39 pass
npm run serve            # open http://localhost:8080 — the questions start on first launch
claude                   # then type:  /next
```
`/next` does one task from `docs/TASKS.md`, tests it, commits, and logs it. Repeat, or use the loop below.

## Run it — unattended
```bash
claude --help            # confirm these flags exist on your version: -p, --permission-mode, --max-turns, --max-budget-usd
tmux new -s forge        # so it survives closing the terminal
bash scripts/run-autonomous.sh
```
The loop reads `docs/TASKS.md`, runs Claude Code headless on the next open task, waits, and repeats until nothing
is open. It sleeps 15 min and retries if Claude exits with an error (e.g. a usage limit), and quits after 3 rounds
with no new commit. Tune with `MAX_ITERS`, `MAX_TURNS`, `BUDGET_USD`, `SLEEP_SECS`, `RETRY_SECS`.

### What "24/7" honestly means
- **Claude Code works in sessions, not as a daemon.** The loop re-launches it back-to-back, so it keeps going while
  you sleep — as long as the machine stays on, your plan's usage limits allow it, and tasks aren't blocked.
  It will stop (by design) when it needs you; the reasons are in `docs/HUMAN_TODO.md`.
- **The app itself does run 24/7** once deployed: static files on GitHub Pages + Supabase. No server of yours to keep alive.
- **It can't see your phone.** Visual work is logged as "should work" with Playwright screenshots in `artifacts/`;
  you confirm on your iPhone.
- **The loop script is untested against a live `claude` install** (written without access to one). The first run
  is the test — watch `logs/run-<date>.log`.

### Safety of unattended mode
Permissions come from `.claude/settings.json` (an allowlist: npm/node/git/file tools; denies force-push, `sudo`,
`rm -rf /`, `.env` reads). Don't add `--dangerously-skip-permissions` unless you run inside a disposable VM/container.
Budget and turn caps stop runaway spend. Pushes go to `main` only after `npm run check` is green, and the Pages
workflow re-runs the checks before deploying.

## First message if you'd rather paste a prompt
> Read CLAUDE.md, then work through docs/TASKS.md following the Autonomy protocol. Don't ask me questions — log blockers in docs/HUMAN_TODO.md and carry on. Start with T0.1.

## Before you push to GitHub
`git status` must NOT list `data/seed.local.json`. GitHub Pages on a free account needs a public repo; that's OK
here because no personal data is committed and the database enforces per-user access (see `docs/HUMAN_TODO.md` H2).
