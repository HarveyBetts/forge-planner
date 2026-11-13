# Forge — Project Handover (v2: the financial planner)

> Claude Code loads this file automatically. Trust it over guesses. Read it fully, then follow
> the **Autonomy protocol** (§6). Everything you need to work without asking questions is in `docs/`.

---

## 1. What we are building

**Forge** is Harvey's personal financial planner and life-timeline app. Same name as his earlier
life-organiser (legacy repo: `github.com/HarveyBetts/Forge`, public, kept as a reference only) — but this is
a **new codebase with a new purpose**: plan a financial future around real life milestones.

The idea came from a Coast FIRE Instagram post (a couple with ~$715k at 34 who can stop investing and
still reach ~$4.3M by 60, so they spend ~$2,000/month now instead of investing it) plus Harvey's own voice
note. In his words, the app should:

- Take a **goal number** (retirement pot) and plan back from it with a formula, by age milestones.
- Model **his real pathway**: British Airways **Speedbird Pilot Academy** (course starts Sept 2027, 18 months
  of training, then a reduced Speedbird salary for ~5 years before the main First Officer scale), so salary
  steps and timing are first-class.
- Model **life scenarios**: "if I have X children" → what's needed by what age for private school, a family
  holiday twice a year, a nice house, a car, a dirt-bike trip, etc.
- Tell him once he is on track that **the surplus is free to spend** (Coast FIRE: once your pot would grow to
  the target on its own, extra investing is optional → "free money").
- Show **cool animations**: how close he is, on track vs behind, what life looks like along the timeline.
- Double as a **budgeting/tracking tool** (CSV import; no bank credentials, ever).
- Have an **AI planner** inside ("I'm in Australia, coming back in 2028, doing a dirt-bike trip — what changes?").
- Reuse the **look and layout feel of legacy Forge** (the "Slate" design system, §5).
- **Ask first, on boot-up.** Harvey asked for 100+ questions answered in the app before anything else. On first
  launch Forge runs the onboarding (146 questions, 32 ★ quick start; private school, cars, holidays, the pilot
  pathway…) and builds the plan from the answers. **The answers are the single source of truth for Harvey's
  personal numbers.** Built and working — see `docs/ONBOARDING.md`; follow-ups are T2.2a–f.

### The core formula (everything else is built around it)
```
target pot        = (retirement spend − other retirement income) / withdrawal rate
real return       = (1 + nominal) / (1 + inflation) − 1            (all amounts in TODAY'S money)
coast number(now) = target / (1 + real return) ^ years-to-retirement
coasting?         = current invested pot ≥ coast number
free money / mo   = planned monthly investing, once coasting
```
Implemented and tested in `src/engine/engine.js`. Maths and caveats: `docs/ENGINE.md`.

## 2. Who Harvey is and how to work with him

- British, living in **Sydney**; UK home base Taunton. Assistant Manager at a karting venue. Pursuing a pilot
  career (Speedbird). Holds money in **GBP and AUD** (UK Stocks ISA; Australian super).
- **Non-technical**: doesn't write code, but executes precise instructions (runs SQL in Supabase, commits via
  GitHub, tests on his iPhone). So: do everything you can yourself; where he must act, give him a numbered,
  copy-paste step in `docs/HUMAN_TODO.md` — never a vague "set up X".
- Sends long **voice-note punch lists**. When he does, parse into a numbered list, fix all, report item by item.
- Benchmark: native iOS / Apple / Linear / Stripe. **"Cheap" is his worst insult** (sticky hover on touch,
  instant transitions where animation is expected, overlapping layout, default-form ugliness).
- **His iPhone is ground truth.** You can't see it. Never claim a visual fix "works" — say it *should*, attach a
  Playwright screenshot (`artifacts/`), and ask him to confirm. Phrase: *logic-validated, not device-verified*.
- He values **honest pushback**. If a request is a bad idea (or a number looks unrealistic), say so plainly, once,
  and offer the better option. Don't be sycophantic and don't silently "solve" disagreements.

## 3. Non-negotiable rules

1. **Never invent financial facts.** If the plan needs a number Harvey hasn't given, add or reuse an onboarding question for it. No made-up pay scales, tax rates, pension rules or fees. Anything not given
   by Harvey is an *assumption*: label it, make it editable, cite a source if you researched one, and show an
   "estimate" tag in the UI. Default projections must be shown as **ranges** (low/mid/high), in **today's money**.
2. **Security** (`docs/SECURITY.md`): per-user RLS on every table, never `using (true)`; Supabase **service-role
   key never in client code or git**; the anon key is only safe *because* RLS is correct — test it. Legacy Forge
   has permissive RLS and a PIN; **do not copy that**. Use real Supabase Auth.
3. **No bank credentials, ever.** Bank data = CSV import only (aggregators are an optional, late, read-only add-on).
4. **AI calls only via the `planner-ai` edge function** with auth + hard daily cap. No API keys in the browser.
5. **No personal numbers in git.** Harvey's data lives in `data/seed.local.json` (gitignored) and, later, Supabase.
6. **Not regulated advice.** Footer + AI system prompt say so. Never use "guaranteed" or point-predictions.
7. No `localStorage` etc. without try/catch (iOS private mode / quota). App must work with storage empty.

## 4. Architecture (decided — see `docs/DECISIONS.md`)

- **No build step, no framework.** Plain ES modules served as static files (GitHub Pages). Legacy Forge was one
  giant file; here we split into small modules because the engine needs real tests. `npm run serve` for dev
  (modules need `http://`, not `file://`).
- `src/engine/` — **pure** functions (no DOM/network/storage). Everything is unit-tested with `node --test`.
- `src/data/` — storage adapter interface: `LocalStore` (default, works offline, demo mode) and `SupabaseStore`
  (sync, Phase 4). UI only talks to the interface.
- `src/ui/` — screens/components (string templates or tiny helpers; keep it dependency-free).
- `src/fx/` — GBP/AUD FX module. Port the *logic* of legacy `fxEnsure/fxConvert/FX_FALLBACK`
  (legacy `index.html`, grep those names): free `open.er-api.com` rates, 6 h cache, offline fallback table.
- Backend: **new** Supabase project (never the legacy one). Schema: `supabase/schema.sql`.
- Tests: `node --test` for logic; Playwright (Phase 0) for screens with an iPhone viewport.
- Deploy: push to `main` → CI (`npm run check`) → Pages (`.github/workflows/pages.yml`) publishes only `_site/`.

## 5. Design system — "Slate" (carried over from legacy Forge; details in `docs/DESIGN.md`)

Tokens: bg `#F3F5F8`, surface white, ink `#0F172A`, accent `#2F6BFF`, success `#10B981`, warn `#F59E0B`,
danger `#EF4444`. Fonts: **Sora** (display/numbers) + **Inter** (body). Motion curves: `--e-out: cubic-bezier(.22,.61,.36,1)`,
`--e-slide: cubic-bezier(.22,.9,.3,1)`, `--e-spring: cubic-bezier(.34,1.56,.64,1)`. Add a dark theme.
Hard rules that each fixed a real complaint: inputs ≥16px font (iOS zoom); hover transforms only under
`@media (hover:hover) and (pointer:fine)`; press states on tappables (`:active` scale ≈.97) +
`touch-action: manipulation`; honour `prefers-reduced-motion`; no infinite `blur()`/backdrop-filter animations
(iOS lag); `min-width:0` on flex children (horizontal "bleed"); never `position:fixed` inside a transformed
ancestor; stagger entrances only on navigation, never on data refresh.

## 6. Autonomy protocol (how to run without being prompted)

You may be launched interactively (`/next`) or headless in a loop (`scripts/run-autonomous.sh`, prompt in
`.claude/prompts/autonomous.md`). Either way:

1. Read `docs/TASKS.md`; take the **first** `- [ ]` task whose dependencies are done. One task per cycle.
2. Implement with tests. Run `npm run check` (syntax + all tests) until green. Never commit red.
3. If you need something only Harvey can do → do all you can, add precise steps to `docs/HUMAN_TODO.md`, mark the
   task `- [~]` (blocked) with a reason, **continue to the next task**. Do not wait, do not ask.
4. Make judgement calls yourself; log each in `docs/DECISIONS.md` (decision, why, how to reverse).
5. When acceptance criteria are met: mark `- [x]`, append to `docs/PROGRESS.md` (what changed, how verified,
   what needs Harvey's eyes), `git add -A && git commit -m "T<id>: <summary>"`, `git push` (if no remote, note it once and go on).
6. **Stop conditions:** no `- [ ]` tasks left; or 3 consecutive cycles with no commit (the runner exits); or a
   task would break a rule in §3 (then log it in `HUMAN_TODO.md` and skip it).
7. Guardrails: never force-push or rewrite history; never touch files outside this repo; never commit secrets or
   `data/seed.local.json`; keep commits small; keep `main` deployable at all times.
8. Prefer boring and finished over clever and half-done. A task isn't done until a test (or a screenshot for
   visual work) proves it.

## 7. Commands

```bash
npm run check        # syntax + unit tests (must be green before every commit)
npm test             # unit tests only
npm run serve        # dev server on http://localhost:8080
npm run build:site   # stage public files into _site/
npm run auto         # headless loop (needs the `claude` CLI; see README)
npm run docs:questions  # regenerate docs/QUESTIONS.md after editing the question bank
npm run test:e2e     # Playwright suite at iPhone size (starts its own server; screenshots → artifacts/)
npm run test:walk    # just the onboarding walk
```

## 8. Where things are

`docs/ONBOARDING.md` boot-up questions + how answers become the plan · `docs/QUESTIONS.md` all 146 (generated) ·
`docs/SPEC.md` product spec + scenario JSON schema · `docs/ENGINE.md` maths + test vectors ·
`docs/DESIGN.md` look, motion, copy tone · `docs/SECURITY.md` threat model · `docs/TASKS.md` the work queue ·
`docs/DECISIONS.md` / `docs/PROGRESS.md` / `docs/HUMAN_TODO.md` logs · `data/seed.local.json` Harvey's starting
facts (gitignored; `confirmed:false` items must be confirmed in onboarding, not assumed).

*Handover written 12 Nov 2026, updated 13 Nov 2026. Starting state: engine + onboarding (146 questions → plan screen), 39 passing unit tests + an e2e walk script, schema + edge-function sketch.*
